import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createContactShadowTexture, loadSurface, surfaceSets } from './rendering.js';
import featuredRoom from './featured-room.json' with { type: 'json' };

export function centerModel(model, width) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !Number.isFinite(size.x) || size.x <= 0) throw new Error('The model contains no visible geometry.');
  const holder = new THREE.Group();
  holder.add(model);
  const scale = width ? width / size.x : 1;
  holder.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return holder;
}

/** The selected public room, reconstructed from its saved Koini layout. */
export async function createRoom() {
  const room = new THREE.Group();
  const width = featuredRoom.widthCm / 100;
  const depth = featuredRoom.lengthCm / 100;
  const height = featuredRoom.heightCm / 100;
  const results = await Promise.allSettled(['oak', 'lightOak', 'herringbone'].map(async finish => [finish, await loadSurface(finish, width, depth)]));
  const failedSurface = results.find(entry => entry.status === 'rejected');
  if (failedSurface) {
    for (const result of results) if (result.status === 'fulfilled') for (const texture of Object.values(result.value[1])) texture.dispose();
    throw failedSurface.reason;
  }
  const textures = Object.fromEntries(results.map(entry => entry.value));
  const ownedTextures = new Set(Object.values(textures).flatMap(set => Object.values(set)));
  const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
  const box = (parent, w, h, d, x, y, z, mat, radius = 0) => {
    const geometry = radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const floorMaterial = new THREE.MeshStandardMaterial({ roughness: 1.3 });
  floorMaterial.userData.floorSurface = true;
  const applyFloor = finish => {
    const set = textures[finish];
    if (!set) return;
    Object.assign(floorMaterial, { map: set.color, normalMap: set.normal, roughnessMap: set.roughness, aoMap: set.ao, needsUpdate: true });
  };
  applyFloor(featuredRoom.floorMaterial);
  box(room, width, 0.06, depth, 0, -0.03, 0, floorMaterial).castShadow = false;
  let plaster;
  try { plaster = await loadSurface('plaster', 1, 1); }
  catch (error) { disposeObject(room); for (const texture of ownedTextures) texture.dispose(); throw error; }
  for (const texture of Object.values(plaster)) ownedTextures.add(texture);
  const wallTint = new THREE.Color(featuredRoom.wallColorHex).multiplyScalar(1 / surfaceSets.plaster.neutralMean);
  const trim = material('#f5f2e9', 0.45);
  const walls = [];
  for (const [x, z, w, d, nx, nz] of [
    [0, -depth / 2 + 0.015, width, 0.03, 0, 1],
    [0, depth / 2 - 0.015, width, 0.03, 0, -1],
    [-width / 2 + 0.015, 0, 0.03, depth, 1, 0],
    [width / 2 - 0.015, 0, 0.03, depth, -1, 0],
  ]) {
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const maps = {};
    for (const [key, texture] of Object.entries(plaster)) {
      maps[key] = texture.clone();
      maps[key].repeat.set((nx ? depth : width) / surfaceSets.plaster.tile, height / surfaceSets.plaster.tile);
      maps[key].offset.y = 1 - maps[key].repeat.y;
      ownedTextures.add(maps[key]);
    }
    const wallMaterial = new THREE.MeshStandardMaterial({ color: wallTint, map: maps.color, normalMap: maps.normal, roughnessMap: maps.roughness, aoMap: maps.ao, roughness: 1 });
    box(group, w, height, d, 0, height / 2, 0, wallMaterial).castShadow = false;
    box(group, nx ? 0.014 : width, 0.085, nz ? 0.014 : depth,
      nx * 0.022, 0.0425, nz * 0.022, trim, 0.006).castShadow = false;
    room.add(group); walls.push({ group, normal: new THREE.Vector3(nx, 0, nz) });
  }
  const loader = new GLTFLoader();
  const contactTexture = createContactShadowTexture();
  ownedTextures.add(contactTexture);
  try {
    const results = await Promise.allSettled(featuredRoom.items.map(async item => {
      let holder;
      if (item.model) {
        holder = centerModel((await loader.loadAsync(item.model)).scene, item.widthCm / 100);
        // Match RealityKit's declared dimensions, not the source file's units.
        const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
        holder.scale.y *= (item.heightCm / 100) / size.y;
        holder.scale.z *= (item.depthCm / 100) / size.z;
      } else if (item.shape === 'slabTable') {
        holder = new THREE.Group();
        const w = item.widthCm / 100, d = item.depthCm / 100, h = item.heightCm / 100;
        const top = Math.min(0.05, h * 0.12);
        const post = Math.min(top * 1.15, Math.min(w, d) * 0.16);
        const panel = material(item.colorHex, 0.38);
        box(holder, w, top, d, 0, h - top / 2, 0, panel, 0.004);
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          box(holder, post, h - top, post, x * (w - post) / 2, (h - top) / 2, z * (d - post) / 2, panel, 0.003);
        }
      } else throw new Error(`Unsupported featured furniture: ${item.shape}`);
      holder.name = item.name;
      holder.position.set((item.x - featuredRoom.widthCm / 2) / 100,
        item.elevationCm / 100, (item.y - featuredRoom.lengthCm / 2) / 100);
      holder.rotation.set(THREE.MathUtils.degToRad(item.rotationXDeg),
        THREE.MathUtils.degToRad(-item.rotationDeg), THREE.MathUtils.degToRad(item.rotationZDeg), 'ZYX');
      return holder;
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) {
      for (const result of results) if (result.status === 'fulfilled') disposeObject(result.value);
      throw failed.reason;
    }
    room.add(...results.map(result => result.value));
    for (const [index, item] of featuredRoom.items.entries()) {
      if (item.rotationXDeg || item.rotationZDeg) continue;
      const lift = THREE.MathUtils.clamp(item.elevationCm / 100, 0, 1);
      const spread = 1.08 + lift * 0.9;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(item.widthCm / 100 * spread, item.depthCm / 100 * spread),
        new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, opacity: 0.58 * (1 - lift * 0.72), depthWrite: false, toneMapped: false }));
      const holder = results[index].value;
      shadow.name = 'contactShadow'; shadow.rotation.set(-Math.PI / 2, 0, holder.rotation.y, 'XYZ');
      shadow.position.set(holder.position.x, 0.003, holder.position.z);
      shadow.renderOrder = 1;
      room.add(shadow);
    }
  } catch (error) {
    disposeObject(room);
    for (const texture of ownedTextures) texture.dispose();
    throw error;
  }
  return {
    object: room,
    dispose() { for (const texture of ownedTextures) texture.dispose(); },
    setFinish(finish) {
      if (!textures[finish]) return;
      applyFloor(finish);
    },
    update(camera) {
      for (const wall of walls) wall.group.visible = camera.position.clone().sub(wall.group.position).dot(wall.normal) > 0;
    },
  };
}

export function disposeObject(object) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    for (const mat of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
