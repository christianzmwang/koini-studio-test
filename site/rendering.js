import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Metre scales and linear material channels from Koini's TextureSets manifest. */
export const surfaceSets = {
  oak: { directory: 'floors', tile: 1.7, mean: '#816042' },
  lightOak: { directory: 'floors', tile: 1.7, mean: '#9c8164' },
  herringbone: { directory: 'floors', tile: 3.4, mean: '#94714e' },
  plaster: { directory: 'walls', tile: 1.998, neutralMean: 0.9092 },
};

export function configureSurfaceTexture(texture, channel, width, height, tile) {
  texture.colorSpace = channel === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width / tile, height / tile);
  texture.anisotropy = 8;
  return texture;
}

export async function loadSurface(name, width, height) {
  const set = surfaceSets[name];
  const loader = new THREE.TextureLoader();
  const entries = await Promise.allSettled(['color', 'normal', 'roughness', 'ao'].map(async channel => {
    const path = channel === 'color' && set.directory === 'floors'
      ? `/assets/floors/${name}.jpg` : `/assets/${set.directory}/${name}-${channel}.webp`;
    const texture = await loader.loadAsync(path);
    return [channel, configureSurfaceTexture(texture, channel, width, height, set.tile)];
  }));
  const failed = entries.find(entry => entry.status === 'rejected');
  if (failed) {
    for (const entry of entries) if (entry.status === 'fulfilled') entry.value[1].dispose();
    throw failed.reason;
  }
  return Object.fromEntries(entries.map(entry => entry.value));
}

const smooth = x => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/** Koini's linear HDR studio: overhead glow, three windows, and floor bounce. */
export function createKoiniEnvironment(floor, width = 512, height = 256) {
  const data = new Float32Array(width * height * 4);
  const stops = [[0, [0.4, 0.385, 0.355]], [0.52, [0.275, 0.29, 0.32]], [1, [0.055, 0.055, 0.06]]];
  const windows = [[0.18, 0.46, 0.055, 0.2, 14], [0.62, 0.44, 0.07, 0.22, 16], [0.88, 0.5, 0.04, 0.15, 9]];
  const ground = floor ? new THREE.Color(floor).multiplyScalar(16) : null;
  for (let row = 0; row < height; row++) {
    // DataTexture starts at the bottom; the native equirectangular image starts at the top.
    const v = 1 - (row + 0.5) / height;
    const [a, b] = v <= 0.52 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    const t = (v - a[0]) / (b[0] - a[0]);
    const base = a[1].map((value, i) => THREE.MathUtils.lerp(value, b[1][i], t));
    if (ground && v > 0.5) {
      const rise = smooth((v - 0.5) / 0.08), sink = smooth((v - 0.6) / 0.12);
      const grey = (ground.r * 0.2126 + ground.g * 0.7152 + ground.b * 0.0722) * 0.9;
      for (let i = 0; i < 3; i++) base[i] = THREE.MathUtils.lerp(base[i], THREE.MathUtils.lerp([ground.r, ground.g, ground.b][i], grey, sink), rise);
    }
    for (let col = 0; col < width; col++) {
      const u = ((col + 0.5) / width + 0.25) % 1;
      const glow = 2.2 * smooth(1 - Math.hypot((u - 0.5) * width, (v + 0.1) * height) / (0.85 * height));
      const color = [base[0] + glow, base[1] + glow * 0.97, base[2] + glow * 0.92];
      for (const [x, y, w, h, peak] of windows) {
        const nx = Math.abs(u - x) / (w / 2), ny = Math.abs(v - y) / (h / 2);
        const e = Math.pow(nx ** 4 + ny ** 4, 0.25);
        if (e > 4.3) continue;
        const core = 1 - smooth((e - 0.85) / 0.2);
        const spill = 0.18 * Math.exp(-Math.pow(Math.max(0, e - 1) / 1.1, 2));
        const amount = peak * Math.max(core, spill);
        color[0] += amount; color[1] += amount * 0.985; color[2] += amount * 0.95;
      }
      const offset = (row * width + col) * 4;
      data.set([...color, 1], offset);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createLighting(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const targets = new Map();
  const environment = floor => {
    const key = floor ?? 'studio';
    if (!targets.has(key)) {
      const source = createKoiniEnvironment(floor);
      targets.set(key, pmrem.fromEquirectangular(source)); source.dispose();
    }
    return targets.get(key).texture;
  };
  scene.environment = environment();
  scene.environmentIntensity = 0.45;
  const lights = [36, 216].map((azimuth, index) => {
    const light = new THREE.DirectionalLight('#fff7eb', index ? 0.7 : 1.5);
    const az = THREE.MathUtils.degToRad(azimuth), elevation = Math.PI / 3;
    light.position.set(Math.sin(az) * Math.cos(elevation) * 10, Math.sin(elevation) * 10, Math.cos(az) * Math.cos(elevation) * 10);
    light.castShadow = true;
    light.shadow.mapSize.set(index ? 1024 : 2048, index ? 1024 : 2048);
    Object.assign(light.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 1, far: 20 });
    light.shadow.bias = -0.00008; light.shadow.normalBias = 0.003;
    light.shadow.radius = 3; light.shadow.blurSamples = 8;
    scene.add(light, light.target);
    return light;
  });
  return {
    setFloor(root, finish) {
      const bounce = environment(surfaceSets[finish].mean);
      root.traverse(object => {
        for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
          if (!material.isMeshStandardMaterial || material.userData.floorSurface) continue;
          material.envMap = bounce; material.envMapIntensity = 0.45; material.needsUpdate = true;
        }
      });
    },
    dispose() {
      for (const light of lights) { light.shadow.dispose(); scene.remove(light, light.target); }
      for (const target of targets.values()) target.dispose();
      pmrem.dispose();
    },
  };
}

/** Preserve antialiased transparent edges through the HDR -> sRGB conversion. */
export function createOutputPass() {
  const pass = new OutputPass();
  const shader = pass.material.fragmentShader.replace('// tone mapping', `
    float coverage = gl_FragColor.a;
    gl_FragColor.rgb = coverage > 0.000001 ? gl_FragColor.rgb / coverage : vec3(0.0);
    // tone mapping`);
  const end = shader.lastIndexOf('}');
  pass.material.fragmentShader = shader.slice(0, end)
    + 'gl_FragColor.rgb *= coverage;\n' + shader.slice(end);
  return pass;
}
