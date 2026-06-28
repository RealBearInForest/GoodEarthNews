import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { GLOBE_RADIUS, latLngToVec3 } from '../../utils/globeUtils.js';

// BVH-accelerated raycasting — lets us place thousands of trees in a few ms
// instead of brute-forcing every triangle for every point.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Exported so GlobeScene can adjust airplane altitude
export const LAND_DISP = 0.22;

// ─── Coordinate helpers ────────────────────────────────────────────────────────
export function cartesianToLatLng(x, y, z) {
  const r   = Math.sqrt(x * x + y * y + z * z);
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y / r))) * (180 / Math.PI);
  const theta = Math.atan2(z, -x);
  let   lng = theta * (180 / Math.PI) - 180;
  if (lng < -180) lng += 360;
  return { lat, lng };
}

// ─── Land classification ──────────────────────────────────────────────────────
// 0=ocean  1=lowland  2=forest  3=dark-forest  4=desert  5=tundra  6=ice
export function getLandType(lat, lng) {
  const aLat = Math.abs(lat);

  // Polar / ice
  if (aLat > 83)                                                return 6;
  if (aLat > 70)                                                return 5;
  if (lat > 58 && lat < 84 && lng > -60 && lng < -14)          return 5; // Greenland

  // ── North America ────────────────────────────────────────────────────────────
  if (lat > 54 && lat < 72 && lng > -170 && lng < -130)        return 3; // Alaska
  if (lat > 54 && lat < 70 && lng > -130 && lng < -110)        return 3;
  if (lat > 48 && lat < 70 && lng > -110 && lng < -52)         return 3; // Canadian boreal
  if (lat > 60 && lat < 70 && lng > -65  && lng < -52)         return 3; // Labrador
  if (lat > 42 && lat < 54 && lng > -130 && lng < -120)        return 3; // Pacific NW
  if (lat > 40 && lat < 50 && lng > -120 && lng < -96)         return 1; // US northwest + Great Plains
  if (lat > 30 && lat < 48 && lng > -105 && lng < -88)         return 1;
  if (lat > 28 && lat < 47 && lng > -90  && lng < -66)         return 2; // Eastern US forests
  if (lat > 24 && lat < 30 && lng > -88  && lng < -80)         return 2; // Florida
  if (lat > 28 && lat < 37 && lng > -120 && lng < -106)        return 4; // SW desert
  if (lat > 14 && lat < 30 && lng > -118 && lng < -86)         return 2; // Mexico highlands
  if (lat > 22 && lat < 32 && lng > -118 && lng < -109)        return 4; // Baja California
  if (lat > 7  && lat < 18 && lng > -92  && lng < -77)         return 2; // Central America
  if (lat > 19 && lat < 24 && lng > -85  && lng < -74)         return 2; // Cuba
  if (lat > 17 && lat < 20 && lng > -75  && lng < -68)         return 2; // Hispaniola

  // ── South America ────────────────────────────────────────────────────────────
  if (lat > 0  && lat < 12  && lng > -78 && lng < -60)         return 2; // Colombia/Venezuela
  if (lat > -14 && lat < 6  && lng > -78 && lng < -46)         return 3; // Amazon
  if (lat > -16 && lat < 0  && lng > -50 && lng < -34)         return 2; // NE Brazil
  if (lat > -30 && lat < -16 && lng > -56 && lng < -35)        return 2; // SE Brazil
  if (lat > -56 && lat < 6  && lng > -82 && lng < -68)         return 2; // Andes
  if (lat > -42 && lat < -28 && lng > -68 && lng < -48)        return 1; // Pampas
  if (lat > -56 && lat < -42 && lng > -76 && lng < -63)        return 1; // Patagonia
  if (lat > -30 && lat < -18 && lng > -72 && lng < -68)        return 4; // Atacama

  // ── Europe ───────────────────────────────────────────────────────────────────
  if (lat > 56 && lat < 72 && lng > 4  && lng < 32)            return 3; // Scandinavia
  if (lat > 58 && lat < 70 && lng > 22 && lng < 32)            return 3; // Finland/Baltic
  if (lat > 50 && lat < 59 && lng > -8 && lng < 2)             return 1; // British Isles
  if (lat > 51 && lat < 56 && lng > -11 && lng < -5)           return 2; // Ireland
  if (lat > 36 && lat < 44 && lng > -10 && lng < 5)            return 1; // Iberian Peninsula
  if (lat > 44 && lat < 52 && lng > -4  && lng < 8)            return 1; // France/Benelux
  if (lat > 47 && lat < 56 && lng > 8  && lng < 24)            return 1; // Germany/Poland
  if (lat > 37 && lat < 46 && lng > 7  && lng < 18)            return 1; // Italy
  if (lat > 36 && lat < 48 && lng > 18 && lng < 30)            return 1; // Balkans/Greece
  if (lat > 43 && lat < 49 && lng > 22 && lng < 30)            return 1; // Romania
  if (lat > 48 && lat < 60 && lng > 28 && lng < 42)            return 1; // Western Russia/Ukraine

  // ── Africa ───────────────────────────────────────────────────────────────────
  if (lat > 16 && lat < 34 && lng > -14 && lng < 24)           return 4; // W Sahara
  if (lat > 16 && lat < 32 && lng > 24  && lng < 42)           return 4; // E Sahara
  if (lat > 10 && lat < 16 && lng > -14 && lng < 36)           return 4; // Sahel
  if (lat > 4  && lat < 12 && lng > -18 && lng < 4)            return 2; // West Africa
  if (lat > -2 && lat < 10 && lng > 2   && lng < 16)           return 2; // Gulf of Guinea
  if (lat > -6 && lat < 4  && lng > 14  && lng < 30)           return 3; // Congo
  if (lat > -12 && lat < 10 && lng > 28 && lng < 42)           return 2; // East Africa
  if (lat > 4  && lat < 15 && lng > 36  && lng < 50)           return 4; // Ethiopia/Horn
  if (lat > -36 && lat < -12 && lng > 12 && lng < 40)          return 2; // Southern Africa
  if (lat > -28 && lat < -18 && lng > 18 && lng < 26)          return 4; // Kalahari
  if (lat > -26 && lat < -12 && lng > 43 && lng < 51)          return 2; // Madagascar

  // ── Middle East ────────────────────────────────────────────────────────────
  if (lat > 36 && lat < 42 && lng > 26 && lng < 44)            return 1; // Turkey
  if (lat > 28 && lat < 37 && lng > 34 && lng < 48)            return 4; // Levant/Iraq
  if (lat > 12 && lat < 32 && lng > 36 && lng < 60)            return 4; // Arabian Peninsula
  if (lat > 24 && lat < 40 && lng > 44 && lng < 64)            return 4; // Iran
  if (lat > 36 && lat < 56 && lng > 48 && lng < 80)            return 4; // Central Asia

  // ── South Asia ────────────────────────────────────────────────────────────
  if (lat > 22 && lat < 37 && lng > 60 && lng < 76)            return 4; // Pakistan/NW India
  if (lat > 27 && lat < 36 && lng > 74 && lng < 96)            return 5; // Himalayas
  if (lat > 22 && lat < 30 && lng > 74 && lng < 88)            return 1; // Gangetic plains
  if (lat > 8  && lat < 24 && lng > 72 && lng < 88)            return 2; // Peninsular India
  if (lat > 20 && lat < 28 && lng > 87 && lng < 96)            return 2; // Bangladesh/NE India

  // ── East / SE Asia ────────────────────────────────────────────────────────
  if (lat > 50 && lat < 75 && lng > 58 && lng < 180)           return 3; // Siberia
  if (lat > 40 && lat < 50 && lng > 88 && lng < 122)           return 4; // Gobi
  if (lat > 38 && lat < 54 && lng > 118 && lng < 136)          return 2; // NE China
  if (lat > 30 && lat < 42 && lng > 106 && lng < 122)          return 1; // North China
  if (lat > 20 && lat < 32 && lng > 98  && lng < 115)          return 2; // South China
  if (lat > 20 && lat < 30 && lng > 110 && lng < 122)          return 2; // SE China coast
  if (lat > 34 && lat < 42 && lng > 124 && lng < 130)          return 1; // Korea
  if (lat > 30 && lat < 42 && lng > 129 && lng < 142)          return 2; // Japan
  if (lat > 42 && lat < 46 && lng > 140 && lng < 146)          return 3; // Hokkaido
  if (lat > 6  && lat < 24 && lng > 96  && lng < 110)          return 3; // Indochina
  if (lat > 1  && lat < 8  && lng > 98  && lng < 106)          return 3; // Malay Peninsula
  if (lat > -6 && lat < 6  && lng > 95  && lng < 108)          return 3; // Sumatra
  if (lat > -5 && lat < 8  && lng > 108 && lng < 120)          return 3; // Borneo
  if (lat > -9 && lat < -6 && lng > 104 && lng < 115)          return 3; // Java
  if (lat > -6 && lat < 2  && lng > 119 && lng < 126)          return 3; // Sulawesi
  if (lat > 5  && lat < 20 && lng > 116 && lng < 128)          return 3; // Philippines
  if (lat > -9 && lat < 4  && lng > 130 && lng < 150)          return 3; // New Guinea

  // ── Australia / Oceania ───────────────────────────────────────────────────
  if (lat > -34 && lat < -16 && lng > 116 && lng < 140)        return 4; // Interior Australia
  if (lat > -26 && lat < -14 && lng > 113 && lng < 126)        return 4; // NW Australia
  if (lat > -40 && lat < -20 && lng > 140 && lng < 154)        return 2; // Eastern Australia
  if (lat > -38 && lat < -28 && lng > 113 && lng < 126)        return 2; // SW Australia
  if (lat > -44 && lat < -40 && lng > 144 && lng < 149)        return 2; // Tasmania
  if (lat > -42 && lat < -34 && lng > 172 && lng < 178)        return 2; // NZ North Island
  if (lat > -47 && lat < -42 && lng > 167 && lng < 172)        return 2; // NZ South Island

  return 0; // ocean
}

// ─── Instanced mesh spot data ─────────────────────────────────────────────────

// Deterministic PRNG so the forest layout is stable across renders.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trees are placed where the Earth's own texture is green (vegetation), so they
// always land on visible forest/land and never in the ocean.
const TREE_CAP = 3500;            // max trees to place
const TREE_MAX_SAMPLES = 160000;  // sphere samples to try before giving up

// Read the Earth's base-colour texture into a CPU pixel buffer so we can test
// the colour at any surface point (green = vegetation, blue = ocean, …).
function makeTextureSampler(tex) {
  const img = tex && tex.image;
  const w = img && (img.width || img.naturalWidth);
  const h = img && (img.height || img.naturalHeight);
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const flipY = tex.flipY !== false;
  return (u, v) => {
    u -= Math.floor(u); v -= Math.floor(v);            // wrap
    const x = Math.min(w - 1, (u * w) | 0);
    const y = Math.min(h - 1, ((flipY ? 1 - v : v) * h) | 0);
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
}

// Vegetation = green channel dominant (excludes ocean blue, desert tan, rock, ice).
const isVegetation = (c) => c[1] >= c[2] && c[1] >= c[0] * 0.8 && c[1] > 50;

const MOUNTAIN_SPOTS = [
  [47,-116],[44,-111],[40,-106],[50,-121],[43,-109],[38,-107],[42,-120],[46,-114],
  [-20,-68],[-30,-70],[-15,-72],[-38,-71],[-10,-77],[-45,-74],[-25,-65],[-5,-78],
  [46,9],[47,12],[45,7],[44,10],[43,-1],[42,1],
  [30,85],[28,88],[32,79],[27,90],[29,84],[31,77],[33,76],
  [32,-5],[31,-6],[42,45],[35,139],[36,138],[-44,170],[-43,172],[-45,168],
];

// Hawaii has no land in the low-poly model, so denote the island chain with a
// few mountain cones placed directly on the ocean surface (these bypass the
// land raycast that filters the other mountains).
const HAWAII_SPOTS = [
  [22.1, -159.5], [21.5, -158.0], [21.0, -156.8], [20.8, -156.3], [19.6, -155.5], [20.2, -157.2],
];

const CLOUD_DATA = (() => {
  const pos = [
    [62,0],[62,90],[62,180],[62,-90],
    [46,45],[46,135],[46,-45],[46,-135],
    [30,20],[30,110],[30,-70],[30,-160],
    [15,60],[15,150],[15,-30],[15,-120],
    [0,30],[0,120],[0,-60],[0,-150],
    [-15,10],[-15,100],[-15,-80],[-15,-170],
    [-30,50],[-30,140],[-30,-40],[-30,-130],
    [-46,25],[-46,115],[-46,-65],[-46,-155],
  ];
  return pos.map(([la, ln]) => {
    const sc = 0.055 + (Math.sin(la * 7.3 + ln * 3.1) * 0.5 + 0.5) * 0.07;
    return { pos: latLngToVec3(la, ln, GLOBE_RADIUS + 0.52 + sc * 0.5), scale: sc };
  });
})();

// ─── Earth component ──────────────────────────────────────────────────────────
useGLTF.preload('/models/low_poly_planet_earth.glb');
useGLTF.preload('/models/trees.glb');

// On-globe tree size (the GLB variants are normalized to height 1). Kept small
// so dense forests read as forest texture rather than giant trees.
const TREE_HEIGHT = 0.065;

// Skip very high-poly tree variants — at thousands of instances a 6k-tri tree
// tanks the frame rate, while the others are ~110–185 tris.
const MAX_TREE_TRIS = 1500;

export default function Earth() {
  const cloudGroupRef = useRef();
  const { scene: gltfScene } = useGLTF('/models/low_poly_planet_earth.glb');
  const { scene: treeScene } = useGLTF('/models/trees.glb');

  // Size and centre the GLB model to fit GLOBE_RADIUS
  const earthModel = useMemo(() => {
    const clone = gltfScene.clone(true);

    // The planet mesh is a unit sphere (ocean surface radius ≈ 1.0 in model space).
    // A bounding-sphere approach inflates the radius because the Object node has a
    // large Y-translation baked in, making scale = GLOBE_RADIUS / sphere.radius ≈ 1.
    // Instead, directly scale by GLOBE_RADIUS so ocean surface ≈ radius 2.
    clone.scale.setScalar(GLOBE_RADIUS);

    // Flush world matrices at the new scale so Box3 sees correct world positions
    clone.updateMatrixWorld(true);

    // Compute the bounding-box centre (in world space) and translate to origin
    const box    = new THREE.Box3().setFromObject(clone);
    const centre = box.getCenter(new THREE.Vector3());
    clone.position.set(-centre.x, -centre.y, -centre.z);

    // Re-flush after repositioning so raycasting uses correct world matrices
    clone.updateMatrixWorld(true);

    // Traverse and enable shadow casting/receiving
    clone.traverse(child => {
      if (child.isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });

    return clone;
  }, [gltfScene]);

  // ── Place trees/mountains by raycasting the real model surface ────────────
  // Trees are sampled across the sphere and kept only where the Earth texture is
  // green (vegetation) at the hit point — so they land on visible forest, never
  // in the ocean. Mountains keep the simple elevation gate.
  const spotsData = useMemo(() => {
    let earthMesh = null;
    earthModel.traverse(child => { if (child.isMesh) earthMesh = child; });
    if (!earthMesh) return { trees: [], mountains: [], islands: [] };

    // Build the BVH once so the many raycasts below are cheap.
    if (!earthMesh.geometry.boundsTree) earthMesh.geometry.computeBoundsTree();

    const rc = new THREE.Raycaster();
    rc.firstHitOnly = true;
    const LAND_THRESHOLD = GLOBE_RADIUS + 0.06;
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();

    const raycast = (la, ln) => {
      dir.copy(latLngToVec3(la, ln, 1)).normalize();
      origin.copy(dir).multiplyScalar(GLOBE_RADIUS * 1.6);
      rc.set(origin, dir.clone().negate());
      return rc.intersectObject(earthMesh, false)[0] || null;
    };

    // Mountains: hand-picked ranges, kept where the surface is elevated land.
    const cast = (spots) => {
      const out = [];
      for (const [la, ln] of spots) {
        const hit = raycast(la, ln);
        if (hit && hit.point.length() >= LAND_THRESHOLD) out.push({ la, ln, r: hit.point.length() });
      }
      return out;
    };

    // Trees: sample the sphere, keep points where the texture reads as green.
    const sample = makeTextureSampler(earthMesh.material && earthMesh.material.map);
    const trees = [];
    if (sample) {
      const rnd = mulberry32(1337);
      for (let i = 0; i < TREE_MAX_SAMPLES && trees.length < TREE_CAP; i++) {
        const la = Math.asin(2 * rnd() - 1) * 180 / Math.PI;
        const ln = rnd() * 360 - 180;
        const hit = raycast(la, ln);
        if (!hit || !hit.uv) continue;
        if (!isVegetation(sample(hit.uv.x, hit.uv.y))) continue;
        trees.push({ la, ln, r: hit.point.length() });
      }
    }

    // Hawaii islands sit on open ocean in this model — place them at the surface
    // radius directly, bypassing the land tests above.
    const islands = HAWAII_SPOTS.map(([la, ln]) => ({ la, ln, r: GLOBE_RADIUS }));

    return { trees, mountains: cast(MOUNTAIN_SPOTS), islands };
  }, [earthModel]);

  // ── Tree variants from the GLB pack ───────────────────────────────────────
  // Each named node (tree_0..tree_n) is one variant, normalized to height 1 with
  // its base at the origin and standing along +Y. Bake each part's geometry into
  // the variant's local frame so it can be instanced directly.
  const treeVariants = useMemo(() => {
    treeScene.updateMatrixWorld(true);
    const variants = [];
    for (let i = 0; i < 16; i++) {
      const node = treeScene.getObjectByName(`tree_${i}`);
      if (!node) break;
      const inv = node.matrixWorld.clone().invert();
      const parts = [];
      let tris = 0;
      node.traverse(c => {
        if (!c.isMesh) return;
        const geometry = c.geometry.clone();
        geometry.applyMatrix4(inv.clone().multiply(c.matrixWorld));
        tris += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
        // Cheap lit material — far lighter than the GLB's PBR across thousands
        // of instances, while keeping the low-poly colours and crisp facets.
        const src = c.material;
        const material = new THREE.MeshLambertMaterial({
          color: src.color ? src.color.clone() : new THREE.Color('#3a7d32'),
          map: src.map || null,
          flatShading: true,
        });
        parts.push({ geometry, material });
      });
      if (parts.length && tris <= MAX_TREE_TRIS) variants.push(parts);
    }
    return variants;
  }, [treeScene]);

  // ── Trees (land-only, a variety placed at the raycast hit points) ─────────
  const treeMeshes = useMemo(() => {
    const { trees } = spotsData;
    if (!trees.length || !treeVariants.length) return [];

    // Variant order from the pack: 0,1 = conifers, 2+ = broadleaf/leafy.
    const nV = treeVariants.length;
    const conif = [], broad = [];
    for (let i = 0; i < nV; i++) (i < 2 ? conif : broad).push(i);
    const fract = (x) => x - Math.floor(x);

    // Biome-aware variety: conifers toward the poles, broadleaf in the tropics,
    // a mix in temperate latitudes.
    const buckets = treeVariants.map(() => []);
    for (const spot of trees) {
      const a = Math.abs(spot.la);
      const r1 = fract(Math.sin(spot.la * 12.9898 + spot.ln * 78.233) * 43758.5453);
      const r2 = fract(Math.sin(spot.la * 39.346 + spot.ln * 11.135) * 24634.6345);
      let pool = (conif.length && broad.length)
        ? (a > 50 ? conif : a < 24 ? broad : (r1 < 0.5 ? conif : broad))
        : (conif.length ? conif : broad);
      if (!pool.length) pool = treeVariants.map((_, i) => i);
      buckets[pool[Math.floor(r2 * pool.length) % pool.length]].push(spot);
    }

    const UP = new THREE.Vector3(0, 1, 0);
    const dummy = new THREE.Object3D();
    const meshes = [];

    treeVariants.forEach((parts, vi) => {
      const spots = buckets[vi];
      if (!spots.length) return;
      parts.forEach(({ geometry, material }) => {
        const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
        mesh.frustumCulled = false;
        spots.forEach(({ la, ln, r }, k) => {
          dummy.position.copy(latLngToVec3(la, ln, r - 0.004));         // seat base on surface
          dummy.quaternion.setFromUnitVectors(UP, latLngToVec3(la, ln, 1).normalize());
          dummy.rotateY((Math.sin(la * 31 + ln * 17) * 0.5 + 0.5) * Math.PI * 2); // random spin
          dummy.scale.setScalar(TREE_HEIGHT * (0.72 + (Math.sin(la * 53 + ln * 29) * 0.5 + 0.5) * 0.45));
          dummy.updateMatrix();
          mesh.setMatrixAt(k, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        meshes.push(mesh);
      });
    });
    return meshes;
  }, [spotsData, treeVariants]);

  // ── Mountains (land-only, height from raycast) ────────────────────────────
  const mountainMesh = useMemo(() => {
    const { mountains } = spotsData;
    if (!mountains.length) return null;
    const geo  = new THREE.ConeGeometry(0.065, 0.175, 4, 1);
    const mat  = new THREE.MeshLambertMaterial({ color: '#7C5B44', flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, mountains.length);
    const dummy = new THREE.Object3D(), UP = new THREE.Vector3(0, 1, 0);
    mountains.forEach(({ la, ln, r }, i) => {
      dummy.position.copy(latLngToVec3(la, ln, r + 0.01));
      dummy.quaternion.setFromUnitVectors(UP, latLngToVec3(la, ln, 1).normalize());
      dummy.scale.setScalar(0.8 + (Math.sin(la * 47 + ln * 23) * 0.5 + 0.5) * 0.75);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    return mesh;
  }, [spotsData]);

  const snowCapMesh = useMemo(() => {
    const { mountains } = spotsData;
    if (!mountains.length) return null;
    const geo  = new THREE.ConeGeometry(0.028, 0.065, 4, 1);
    const mat  = new THREE.MeshLambertMaterial({ color: '#F0F4F0', flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, mountains.length);
    const dummy = new THREE.Object3D(), UP = new THREE.Vector3(0, 1, 0);
    mountains.forEach(({ la, ln, r }, i) => {
      dummy.position.copy(latLngToVec3(la, ln, r + 0.16));
      dummy.quaternion.setFromUnitVectors(UP, latLngToVec3(la, ln, 1).normalize());
      dummy.scale.setScalar((0.8 + (Math.sin(la * 47 + ln * 23) * 0.5 + 0.5) * 0.75) * 0.62);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    return mesh;
  }, [spotsData]);

  // ── Hawaii islands (mountain cones on the ocean surface, no snow) ─────────
  const islandMesh = useMemo(() => {
    const { islands } = spotsData;
    if (!islands || !islands.length) return null;
    const geo  = new THREE.ConeGeometry(0.05, 0.12, 4, 1);
    const mat  = new THREE.MeshLambertMaterial({ color: '#7C5B44', flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, islands.length);
    const dummy = new THREE.Object3D(), UP = new THREE.Vector3(0, 1, 0);
    islands.forEach(({ la, ln, r }, i) => {
      dummy.position.copy(latLngToVec3(la, ln, r + 0.005));
      dummy.quaternion.setFromUnitVectors(UP, latLngToVec3(la, ln, 1).normalize());
      dummy.scale.setScalar(0.5 + (Math.sin(la * 47 + ln * 23) * 0.5 + 0.5) * 0.45);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    return mesh;
  }, [spotsData]);

  useFrame((_, delta) => {
    if (cloudGroupRef.current) cloudGroupRef.current.rotation.y += delta * 0.018;
  });

  return (
    <group>
      {/* Actual low-poly Earth 3D model */}
      <primitive object={earthModel} />

      {treeMeshes.map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={mountainMesh} />
      <primitive object={snowCapMesh} />
      {islandMesh && <primitive object={islandMesh} />}

      {/* Puffy clouds — 3 overlapping icosahedron-level-1 puffs per cloud position */}
      <group ref={cloudGroupRef}>
        {CLOUD_DATA.map(({ pos, scale }, i) => (
          <group key={i} position={pos}>
            {/* Main centre puff */}
            <mesh scale={[scale * 1.7, scale * 0.95, scale * 1.7]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshLambertMaterial color="#ffffff" flatShading transparent opacity={0.90} depthWrite={false} />
            </mesh>
            {/* Right side puff */}
            <mesh
              position={[scale * 0.75, scale * 0.08, scale * 0.15]}
              scale={[scale * 1.25, scale * 0.82, scale * 1.25]}
            >
              <icosahedronGeometry args={[1, 1]} />
              <meshLambertMaterial color="#f4f8ff" flatShading transparent opacity={0.82} depthWrite={false} />
            </mesh>
            {/* Left side puff */}
            <mesh
              position={[-scale * 0.7, scale * 0.06, -scale * 0.1]}
              scale={[scale * 1.15, scale * 0.76, scale * 1.15]}
            >
              <icosahedronGeometry args={[1, 1]} />
              <meshLambertMaterial color="#eef4ff" flatShading transparent opacity={0.78} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS + 0.36, 32, 32]} />
        <meshBasicMaterial color="#4499ff" transparent opacity={0.06} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS + 0.60, 24, 24]} />
        <meshBasicMaterial color="#2255cc" transparent opacity={0.04} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Warm horizon glow — sunset rim visible when sun is near the horizon */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS + 0.05, 32, 32]} />
        <meshBasicMaterial color="#FF5500" transparent opacity={0.13} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
