import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createLighting, createOutputPass, loadNativeToneLUT, nativeLook } from '/rendering.js';
import { createRoom } from '/room-scene.js';

document.body.innerHTML = `<style>
body{margin:0;background:#eaece5;color:#26392d;font:14px system-ui}header{padding:12px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}label{display:inline-flex;gap:5px;align-items:center}input{width:65px}button,select,input{font:inherit}main{display:flex;flex-wrap:wrap}figure{margin:0;width:700px}figcaption{padding:8px}canvas,img{display:block;width:700px;height:540px}pre{font:12px monospace;white-space:pre-wrap;padding:12px}h1{font-size:16px;margin:0}
</style><header><h1>RealityKit / browser calibration</h1>
<label>Floor <select id="finish"><option>herringbone</option><option>oak</option><option>lightOak</option></select></label>
<label>Tone <select id="tone"><option>Native</option><option>Neutral</option><option>ACESFilmic</option><option>AgX</option><option>Reinhard</option><option>Linear</option></select></label>
${[['exposure',1],['key',nativeLook.key],['fill',nativeLook.fill],['environment',nativeLook.environment],['bounce',nativeLook.bounce],['occlusion',0],['radius',0.3]].map(([id,value]) => `<label>${id} <input id="${id}" type="number" step="0.05" value="${value}"></label>`).join('')}
<label>Walls cast <input id="wall-shadow" type="checkbox"></label>
<label>View <select id="view"><option>iso</option><option>front</option><option>left</option><option>right</option><option>top</option></select></label>
<input id="capture-name" aria-label="Capture name" value="baseline"><button id="save">Save comparison</button><output id="status">Loading…</output></header>
<main><figure><figcaption>Native RealityKit (colour-managed sRGB)</figcaption><img id="reference"></figure><figure><figcaption>Interactive browser renderer</figcaption><div id="render"></div></figure></main><pre id="report"></pre>`;
const controls = [...document.querySelectorAll('input, select, button')];
for (const control of controls) control.disabled = true;
const W = 1400, H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W,H); renderer.domElement.style.width='700px'; renderer.domElement.style.height='540px';
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.querySelector('#render').append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(43,W/H,0.05,100);
camera.position.set(3.8,4.6,5.3); camera.lookAt(0,0.7,0);
const lighting = createLighting(renderer,scene);
const room = await createRoom(); scene.add(room.object);
const lights = scene.children.filter(child => child.isDirectionalLight);
const target = new THREE.WebGLRenderTarget(W,H,{type:THREE.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)});
const composer = new EffectComposer(renderer,target);
composer.addPass(new RenderPass(scene,camera));
const ao = new GTAOPass(scene,camera,W,H,undefined,{radius:0.3,thickness:0.5,distanceFallOff:1,scale:1,samples:16,screenSpaceRadius:false},{radius:4,samples:16,depthPhi:5,normalPhi:8});
composer.addPass(ao); composer.addPass(createOutputPass(await loadNativeToneLUT()));
const nativeCanvas = document.createElement('canvas'); nativeCanvas.width=W; nativeCanvas.height=H;
const nativeContext = nativeCanvas.getContext('2d',{willReadFrequently:true});
const webCanvas = nativeCanvas.cloneNode(); const webContext = webCanvas.getContext('2d',{willReadFrequently:true});
const reference = document.querySelector('#reference');
let report, nativePixels;
const number = id => Number(document.getElementById(id).value);
const regions = { leftWall:[310,315,100,100], backWall:[800,260,140,100], sofa:[620,470,100,60], chair:[945,635,55,65], table:[505,593,65,30], floor:[635,795,130,60] };
function measure() {
  if (!nativePixels) return;
  webContext.clearRect(0,0,W,H); webContext.drawImage(renderer.domElement,0,0);
  const pixels = webContext.getImageData(0,0,W,H).data;
  const measurements = {};
  let total = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (nativePixels[i+3] < 250 || pixels[i+3] < 250) continue;
    for (let c = 0; c < 3; c++) total += Math.abs(nativePixels[i+c] - pixels[i+c]);
    count++;
  }
  for (const [name,[x,y,w,h]] of Object.entries(document.querySelector('#view').value === 'iso' ? regions : {})) {
    const native=[0,0,0], browser=[0,0,0]; let count=0,error=0;
    for(let row=y;row<y+h;row++) for(let col=x;col<x+w;col++) {
      const offset=(row*W+col)*4;
      if(nativePixels[offset+3]<250 || pixels[offset+3]<250) continue;
      count++;
      for(let c=0;c<3;c++){native[c]+=nativePixels[offset+c];browser[c]+=pixels[offset+c];error+=Math.abs(nativePixels[offset+c]-pixels[offset+c]);}
    }
    measurements[name]={native:native.map(v=>+(v/count).toFixed(1)),browser:browser.map(v=>+(v/count).toFixed(1)),meanAbsoluteError:+(error/count/3).toFixed(2)};
  }
  report={finish:document.querySelector('#finish').value,view:document.querySelector('#view').value,tone:document.querySelector('#tone').value,settings:Object.fromEntries(['exposure','key','fill','environment','bounce','occlusion','radius'].map(id=>[id,number(id)])),opaqueOverlapMAE:+(total/count/3).toFixed(2),measurements};
  document.querySelector('#report').textContent=JSON.stringify(report,null,2);
}
function draw(){
  renderer.toneMapping= document.querySelector('#tone').value === 'Native' ? THREE.CustomToneMapping : THREE[`${document.querySelector('#tone').value}ToneMapping`]; renderer.toneMappingExposure=number('exposure');
  lights[0].intensity=number('key'); lights[1].intensity=number('fill'); scene.environmentIntensity=number('environment');
  room.object.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])if(material.envMap)material.envMapIntensity=number('bounce');});
  // Wall groups precede the furniture; table and trim are deliberately excluded.
  for(const group of room.object.children.slice(1,5)) for(const child of group.children) child.castShadow=document.querySelector('#wall-shadow').checked;
  ao.enabled=number('occlusion')>0; ao.blendIntensity=number('occlusion'); ao.updateGtaoMaterial({radius:number('radius')});
  room.update(camera); composer.render(); measure(); document.querySelector('#status').textContent='Rendered';
}
async function finish(){
  document.querySelector('#status').textContent='Loading…';
  for (const control of controls) control.disabled = true;
  const finish=document.querySelector('#finish').value; room.setFinish(finish); lighting.setFloor(room.object,finish);
  reference.src=`/__reference/${finish}?view=${document.querySelector('#view').value}`;
  try {
    await reference.decode(); reference.hidden = false;
    nativeContext.clearRect(0,0,W,H); nativeContext.drawImage(reference,0,0,W,H); nativePixels=nativeContext.getImageData(0,0,W,H).data; draw();
  } catch {
    nativePixels = undefined; reference.hidden = true; draw();
    document.querySelector('#status').textContent='Native reference missing for this view';
    document.querySelector('#report').textContent='Supply colour-managed native PNGs to compare this angle.';
  } finally { for (const control of controls) control.disabled = false; }
}
for(const input of document.querySelectorAll('input,select')) input.addEventListener('input',()=>{
  if(input.id==='finish'){finish();return;}
  if(input.id==='view') {
    const positions={iso:[3.8,4.6,5.3],front:[0,2,7],left:[-7,3,0],right:[7,3,0],top:[0,7,0.001]}; camera.position.set(...positions[input.value]);camera.lookAt(0,0.7,0); finish(); return;
  }
  draw();
});
document.querySelector('#save').addEventListener('click',async()=>{
  const comparison = document.createElement('canvas'); comparison.width = 1600; comparison.height = 680;
  const context = comparison.getContext('2d');
  context.fillStyle = '#eaece5'; context.fillRect(0,0,1600,680);
  context.fillStyle = '#26392d'; context.font = '24px system-ui';
  context.fillText('Native RealityKit',45,45); context.fillText('Browser · calibrated',845,45);
  context.drawImage(nativeCanvas,20,60,760,586); context.drawImage(renderer.domElement,820,60,760,586);
  document.querySelector('#status').textContent=await (await fetch('/__capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.querySelector('#capture-name').value,image:renderer.domElement.toDataURL(),comparison:comparison.toDataURL(),report})})).text();
});
await finish();
