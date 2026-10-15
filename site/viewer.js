import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createLighting, createOutputPass } from './rendering.js';
import { centerModel, createRoom, disposeObject } from './room-scene.js';

const views = { iso: [1, 0.8, 1.3], front: [0, 0.15, 1], back: [0, 0.15, -1], left: [-1, 0.15, 0], right: [1, 0.15, 0], top: [0, 1, 0.001] };
const controlClass = 'cursor-pointer rounded-md border border-[#bcc7b5] bg-[#f6f6f0]/95 px-2 py-1 text-[11px] text-[#354d3b] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#aa6e43]';

export async function mountViewer(host) {
  let renderer, object, controls, observer, visibility, room, lighting, composer;
  let dirty = true;
  let renderedFrames = 0;
  let disposed = false;
  const events = new AbortController();
  const clean = () => {
    if (disposed) return;
    disposed = true; events.abort();
    renderer?.setAnimationLoop(null); observer?.disconnect(); visibility?.disconnect(); controls?.dispose();
    if (object) disposeObject(object);
    room?.dispose(); lighting?.dispose();
    if (composer) { for (const pass of composer.passes) pass.dispose(); composer.dispose(); }
    renderer?.dispose(); renderer?.domElement.remove();
  };
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = renderer.domElement;
    canvas.className = 'absolute inset-0 block size-full touch-none cursor-grab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#aa6e43] active:cursor-grabbing';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${host.dataset.name}. Interactive 3D view. Arrow keys rotate, Shift and arrows pan, plus and minus zoom, R resets.`);
    canvas.setAttribute('aria-describedby', 'viewer-help');
    host.append(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 100);
    lighting = createLighting(renderer, scene);
    room = host.hasAttribute('data-room') ? await createRoom() : null;
    object = room ? room.object : centerModel((await new GLTFLoader().loadAsync(host.dataset.model)).scene);
    scene.add(object);
    const bounds = new THREE.Box3().setFromObject(object);
    const center = room ? new THREE.Vector3(0, 0.7, 0) : bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = radius * 0.15;
    controls.maxDistance = radius * 9;
    controls.target.copy(center);
    controls.addEventListener('change', () => { dirty = true; });
    let currentView = 'iso';
    const setView = (name = 'iso') => {
      currentView = name;
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
      const distance = radius / Math.sin(Math.min(fov, hfov) / 2) * 0.95;
      if (room && name === 'iso') {
        const reference = new THREE.Vector3(3.8, 4.6, 5.3);
        const referenceAspect = 1400 / 1080;
        reference.sub(center).multiplyScalar(Math.max(1, referenceAspect / camera.aspect)).add(center);
        camera.position.copy(reference);
      } else camera.position.copy(new THREE.Vector3(...views[name]).normalize().multiplyScalar(distance).add(center));
      controls.target.copy(center); controls.update();
    };
    if (!room) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 8, radius * 8), new THREE.ShadowMaterial({ opacity: 0.16, depthWrite: false }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -radius * 0.002; ground.receiveShadow = true; object.add(ground);
    }
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    if (room) {
      const ao = new GTAOPass(scene, camera, 1, 1, undefined, { radius: 0.3, thickness: 0.5, distanceFallOff: 1, scale: 1, samples: 16, screenSpaceRadius: false }, { radius: 4, samples: 16, depthPhi: 5, normalPhi: 8 });
      ao.blendIntensity = 0.8; composer.addPass(ao);
    }
    composer.addPass(createOutputPass());
    const toolbar = document.createElement('div');
    toolbar.className = 'absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-center gap-1 rounded-lg bg-[#eef0e9]/80 p-1.5 backdrop-blur-sm';
    toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', `${host.dataset.name} camera controls`);
    const select = document.createElement('select');
    select.className = controlClass; select.setAttribute('aria-label', `${host.dataset.name} camera angle`);
    for (const [value, label] of Object.entries({ iso: 'Perspective', front: 'Front', back: 'Back', left: 'Left', right: 'Right', top: 'Top' })) {
      select.add(new Option(label, value));
    }
    select.addEventListener('change', () => setView(select.value)); toolbar.append(select);
    const actions = [
      ['↶', 'Rotate left', () => controls.rotateLeft(Math.PI / 8)],
      ['↷', 'Rotate right', () => controls.rotateLeft(-Math.PI / 8)],
      ['+', 'Zoom in', () => controls.dollyIn(1.2)],
      ['−', 'Zoom out', () => controls.dollyOut(1.2)],
      ['Reset', 'Reset view', () => { select.value = 'iso'; setView(); }],
    ];
    for (const [label, title, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = controlClass; button.textContent = label;
      button.setAttribute('aria-label', `${host.dataset.name}: ${title}`); button.title = title;
      button.addEventListener('click', () => { action(); controls.update(); }); toolbar.append(button);
    }
    canvas.addEventListener('keydown', event => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'r', 'R', 'Home'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const key = event.key;
      if (key.startsWith('Arrow') && event.shiftKey) controls.pan(key === 'ArrowLeft' ? 25 : key === 'ArrowRight' ? -25 : 0, key === 'ArrowUp' ? 25 : key === 'ArrowDown' ? -25 : 0);
      else if (key === 'ArrowLeft' || key === 'ArrowRight') controls.rotateLeft(key === 'ArrowLeft' ? 0.12 : -0.12);
      else if (key === 'ArrowUp' || key === 'ArrowDown') controls.rotateUp(key === 'ArrowUp' ? 0.12 : -0.12);
      else if (key === '+' || key === '=') controls.dollyIn(1.2);
      else if (key === '-') controls.dollyOut(1.2);
      else { select.value = 'iso'; setView(); }
      controls.update();
    });
    let initialSize = true;
    observer = new ResizeObserver(() => {
      const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
      composer.setSize(width, height); dirty = true;
      if (initialSize) { setView(currentView); initialSize = false; }
    });
    observer.observe(host);
    const frame = () => {
      if (document.hidden) return;
      controls.update();
      if (!dirty) return;
      room?.update(camera); composer.render(); dirty = false;
      if (import.meta.env.DEV) canvas.dataset.renderedFrames = String(++renderedFrames);
    };
    document.addEventListener('visibilitychange', () => { dirty = true; }, { signal: events.signal });
    visibility = new IntersectionObserver(([entry]) => { dirty = true; renderer.setAnimationLoop(entry.isIntersecting ? frame : null); });
    visibility.observe(host);
    host.querySelector('[data-poster]')?.classList.add('hidden');
    host.append(toolbar);
    if (room) {
      const finishes = host.closest('[data-room-card]')?.querySelectorAll('[data-floor]') ?? [];
      const setFinish = finish => { room.setFinish(finish); lighting.setFloor(object, finish); dirty = true; };
      setFinish([...finishes].find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.floor ?? host.dataset.finish ?? 'oak');
      for (const button of finishes) button.addEventListener('click', () => setFinish(button.dataset.floor), { signal: events.signal });
    }
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); toolbar.remove(); clean();
      host.dispatchEvent(new CustomEvent('viewer-error', { detail: new Error('The 3D view was interrupted. Please try again.') }));
    }, { once: true });
    return clean;
  } catch (error) { clean(); throw error; }
}
