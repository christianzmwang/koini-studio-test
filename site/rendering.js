import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Calibrated against colour-managed RealityKit frames, with the same room and camera.
export const nativeLook = Object.freeze({ key: 5, fill: 2.33, environment: 0.08, bounce: 0.08 });

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
  // RealityKit repeats from the image's top edge; Three's UV origin is bottom-left.
  texture.offset.y = 1 - texture.repeat.y;
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
  scene.environmentIntensity = nativeLook.environment;
  const lights = [36, 216].map((azimuth, index) => {
    const light = new THREE.DirectionalLight('#fff7eb', index ? nativeLook.fill : nativeLook.key);
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
          material.envMap = bounce; material.envMapIntensity = nativeLook.bounce; material.needsUpdate = true;
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

/** Koini's 30-band rounded contact patch; geometry keeps it stable while orbiting. */
export function createContactShadowTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    for (let step = 0; step <= 30; step++) {
      const t = step / 30, inset = t * 0.16, half = 0.5 - inset;
      const radius = half * 2 * 0.14;
      const dx = Math.max(Math.abs((x + 0.5) / size - 0.5) - (half - radius), 0);
      const dy = Math.max(Math.abs((y + 0.5) / size - 0.5) - (half - radius), 0);
      if (Math.hypot(dx, dy) <= radius) data[(y * size + x) * 4 + 3] = Math.round(t * t * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export async function loadNativeToneLUT() {
  const texture = await new THREE.TextureLoader().loadAsync('/assets/rendering/realitykit-tone.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Measured RealityKit HDR colour response, followed by alpha-correct sRGB output. */
export function createOutputPass(toneLUT) {
  const pass = new OutputPass();
  pass.uniforms.nativeToneLUT = { value: toneLUT };
  let shader = pass.material.fragmentShader.replace('varying vec2 vUv;', `
    uniform sampler2D nativeToneLUT;
    // The atlas samples a 33-cube in linear sRGB, log distributed from 0 to 15.9375.
    vec3 nativeToneMapping(vec3 color) {
      vec3 p = clamp(log2(1.0 + 16.0 * max(color * toneMappingExposure, 0.0)) / 8.0, 0.0, 1.0) * 32.0;
      float blue = floor(p.b);
      vec2 uv = (vec2(p.r + blue * 33.0, p.g) + 0.5) / vec2(1089.0, 33.0);
      vec2 nextUV = (vec2(p.r + min(blue + 1.0, 32.0) * 33.0, p.g) + 0.5) / vec2(1089.0, 33.0);
      return mix(texture2D(nativeToneLUT, uv).rgb, texture2D(nativeToneLUT, nextUV).rgb, fract(p.b));
    }
    varying vec2 vUv;`).replace('CustomToneMapping( gl_FragColor.rgb )', 'nativeToneMapping( gl_FragColor.rgb )');
  shader = shader.replace('// tone mapping', `
    float coverage = gl_FragColor.a;
    gl_FragColor.rgb = coverage > 0.000001 ? gl_FragColor.rgb / coverage : vec3(0.0);
    // tone mapping`);
  const end = shader.lastIndexOf('}');
  pass.material.fragmentShader = shader.slice(0, end)
    + 'gl_FragColor.rgb *= coverage;\n' + shader.slice(end);
  return pass;
}
