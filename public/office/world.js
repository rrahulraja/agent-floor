// world.js — the 3D office: floor, walls, rooms, furniture, outdoors, anchors and
// nav blockers for agent-floor's 3D view.
//
// Ported from Hermes3D's local office (https://github.com/iamlukethedev/Hermes3D),
// MIT licence, Copyright (c) 2026 Luke The Dev — layout from core/furnitureDefaults.ts
// (canvas units, world = canvas * 0.018), footprints from core/geometry.ts, the
// procedural PBR canvas textures from core/proceduralTextures.ts, the floor / walls /
// pictures / lawn / trees from scene/environment.tsx + systems/atmosphere.tsx and the
// procedural furniture and machines from objects/{furniture,kitchen,machines,
// primitives}.tsx. Rewritten as plain three.js (no React) and re-laid out so the rooms
// have doors, a main entrance and room for more desks. See THIRD_PARTY_NOTICES.md.
// Furniture GLBs: Kenney Furniture Kit (CC0), see ./models/LICENSE.txt.
//
// Units are "toy metres": agents are ~1.0 tall, desk tops 0.58, walls 1.0–1.65.
// Yaw convention for every `facing`: forward = (sin(facing), cos(facing)) in (x, z),
// i.e. three.js rotation.y of a model whose front is +z. 0 faces south (+z, toward the
// default camera), PI faces north.
//
// palette (all optional): floor, wall, wallCap, lawn, apron, desk, chair, couch,
// accent, kitchen, screen. Colours as CSS strings.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MODEL_BASE = new URL('./models/', import.meta.url).href;

// ---- building plan (world units) -------------------------------------------------
const B = {
  minX: -16.2, maxX: 11.5, minZ: -6.48, maxZ: 6.48,
  wallT: 0.12, iwallT: 0.14,
  hFar: 1.65, hNear: 1.0, hIn: 1.15, doorH: 0.98,
  mainDoor: [-4.7, -3.2],               // gap in the south wall (x range)
  serverX: -12.17, serverZ: 3.6, serverDoor: [4.6, 5.6],
  gymX0: 4.07, gymX1: 7.24, qaX0: 8.24, wingZ1: 5.04, wingDoor: [-1.9, -0.9],
  outsideZ: 9.2,                        // walkable strip south of the entrance
};

const DEFAULT_PALETTE = {
  floor: '#e8d5b8', wall: '#e9dfd0', wallCap: '#2b2f33', lawn: '#55654a', apron: '#b4b0a4',
  desk: '#8b5e32', chair: '#4a5568', couch: '#3d5575', accent: '#38bdf8', kitchen: '#3c4248',
  screen: '#9fd4ff',
};

const GLOW = { dawn: 0.45, morning: 0.12, afternoon: 0.08, evening: 0.75, night: 1 };

// ---- deterministic noise (Hermes proceduralTextures.ts) ----------------------------
const hash2 = (x, y, seed) => {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h ^= h >> 16;
  return (h >>> 0) / 4294967295;
};
const hash1 = (n) => {
  let h = (n + 1) * 374761393;
  h = (h ^ (h >> 13)) * 1274126177;
  h ^= h >> 16;
  return (h >>> 0) / 4294967295;
};
const smoothNoise = (x, y, seed) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const n00 = hash2(xi, yi, seed), n10 = hash2(xi + 1, yi, seed);
  const n01 = hash2(xi, yi + 1, seed), n11 = hash2(xi + 1, yi + 1, seed);
  const a = n00 + (n10 - n00) * sx, b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
};
const fbm = (x, y, seed, octaves = 4) => {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { v += smoothNoise(x * f, y * f, seed + i * 101) * amp; amp *= 0.5; f *= 2; }
  return v;
};

// ---- procedural PBR textures --------------------------------------------------------
function makeTextureKit(quality) {
  const big = quality === 'low' ? 512 : 1024;
  const mid = quality === 'low' ? 256 : 512;
  const cache = new Map();
  const all = [];
  const canvas = (size) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }), size };
  };
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    all.push(t);
    return t;
  };
  const heightToNormal = (hm, strength) => {
    const size = hm.size, out = canvas(size);
    const src = hm.ctx.getImageData(0, 0, size, size).data;
    const dst = out.ctx.createImageData(size, size);
    const at = (x, y) => src[(((x + size) % size) + ((y + size) % size) * size) * 4] / 255;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (x + y * size) * 4;
      dst.data[i] = (-dx * inv * 0.5 + 0.5) * 255; dst.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      dst.data[i + 2] = (inv * 0.5 + 0.5) * 255; dst.data[i + 3] = 255;
    }
    out.ctx.putImageData(dst, 0, 0);
    return tex(out.canvas, false);
  };
  // Generic per-pixel generator: fn(x, y) -> [albedo, rough, height] in 0..255.
  const pixelSet = (size, fn, normalStrength, tint = [1, 1, 1]) => {
    const a = canvas(size), r = canvas(size), h = canvas(size);
    const ad = a.ctx.createImageData(size, size), rd = r.ctx.createImageData(size, size), hd = h.ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const [al, ro, he] = fn(x, y), i = (x + y * size) * 4;
      ad.data[i] = al * tint[0]; ad.data[i + 1] = al * tint[1]; ad.data[i + 2] = al * tint[2]; ad.data[i + 3] = 255;
      rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = ro; rd.data[i + 3] = 255;
      hd.data[i] = hd.data[i + 1] = hd.data[i + 2] = he; hd.data[i + 3] = 255;
    }
    a.ctx.putImageData(ad, 0, 0); r.ctx.putImageData(rd, 0, 0); h.ctx.putImageData(hd, 0, 0);
    return { map: tex(a.canvas, true), roughnessMap: tex(r.canvas, false), normalMap: normalStrength ? heightToNormal(h, normalStrength) : null };
  };
  const gen = {
    wood() {
      const size = big, a = canvas(size), r = canvas(size), hm = canvas(size);
      const ph = size / 8, pw = size / 2;
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * pw * 0.5 + hash2(row, 7, 11) * pw * 0.35;
        for (let col = -1; col < 3; col++) {
          const px = col * pw + off, tone = 0.82 + hash2(row, col, 23) * 0.36;
          a.ctx.fillStyle = `rgb(${(168 * tone) | 0},${(122 * tone) | 0},${(82 * tone) | 0})`;
          a.ctx.fillRect(px, row * ph, pw, ph);
          const rt = (120 + hash2(row, col, 51) * 70) | 0;
          r.ctx.fillStyle = `rgb(${rt},${rt},${rt})`; r.ctx.fillRect(px, row * ph, pw, ph);
          hm.ctx.fillStyle = 'rgb(200,200,200)'; hm.ctx.fillRect(px, row * ph, pw, ph);
          a.ctx.fillStyle = 'rgba(40,24,12,0.85)'; a.ctx.fillRect(px, row * ph, 3, ph);
          hm.ctx.fillStyle = 'rgb(60,60,60)'; hm.ctx.fillRect(px, row * ph, 3, ph);
        }
        a.ctx.fillStyle = 'rgba(40,24,12,0.9)'; a.ctx.fillRect(0, row * ph, size, 3);
        hm.ctx.fillStyle = 'rgb(50,50,50)'; hm.ctx.fillRect(0, row * ph, size, 3);
      }
      const ad = a.ctx.getImageData(0, 0, size, size), rd = r.ctx.getImageData(0, 0, size, size);
      const k = 1024 / size;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const g = fbm(x * k * 0.11, y * k * 0.009, 5, 4) * 0.7 + fbm(x * k * 0.02, y * k * 0.02, 9, 3) * 0.3;
        const s = 0.86 + g * 0.28, i = (x + y * size) * 4;
        ad.data[i] = Math.min(255, ad.data[i] * s); ad.data[i + 1] = Math.min(255, ad.data[i + 1] * s); ad.data[i + 2] = Math.min(255, ad.data[i + 2] * s);
        rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = Math.min(255, Math.max(70, rd.data[i] + (g - 0.5) * 60));
      }
      a.ctx.putImageData(ad, 0, 0); r.ctx.putImageData(rd, 0, 0);
      return { map: tex(a.canvas, true), roughnessMap: tex(r.canvas, false), normalMap: heightToNormal(hm, 1.6) };
    },
    plaster: () => pixelSet(mid, (x, y) => {
      const k = 512 / mid, m = fbm(x * k * 0.014, y * k * 0.014, 31, 4), f = fbm(x * k * 0.16, y * k * 0.16, 77, 2);
      return [225 + (m - 0.5) * 26 + (f - 0.5) * 10, 220 + (f - 0.5) * 40, 128 + (m - 0.5) * 70 + (f - 0.5) * 50];
    }, 0.8, [1, 0.985, 0.955]),
    concrete: () => pixelSet(mid, (x, y) => {
      const k = 512 / mid, l = fbm(x * k * 0.008, y * k * 0.008, 13, 4), sp = hash2(x, y, 91), st = fbm(x * k * 0.02, y * k * 0.02, 47, 3);
      let s = 96 + (l - 0.5) * 34 + (st - 0.5) * 22; if (sp > 0.965) s += 26; if (sp < 0.03) s -= 22;
      return [s, 215 + (st - 0.5) * 50, 128 + (l - 0.5) * 60 + (sp - 0.5) * 24];
    }, 1.0, [1, 1.01, 1.04]),
    carpet: () => pixelSet(mid, (x, y) => {
      const fi = hash2(x, y, 3), tu = fbm(x * 0.09, y * 0.09, 17, 3);
      return [205 + (fi - 0.5) * 46 + (tu - 0.5) * 30, 245, 128 + (fi - 0.5) * 90];
    }, 0.7),
    metal() {
      const size = mid;
      return pixelSet(size, (x, y) => {
        const line = hash2(0, y, 7), st = fbm(x * 0.004, y * 0.6, 29, 3);
        return [196 + (line - 0.5) * 16 + (st - 0.5) * 22, 92 + (st - 0.5) * 60 + (line - 0.5) * 28, 128];
      }, 0, [1, 1.005, 1.015]);
    },
    fabric: () => pixelSet(mid, (x, y) => {
      const w = (Math.sin(x * 0.9) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 0.9) * 0.5 + 0.5) * 0.5, n = hash2(x, y, 63);
      return [208 + (w - 0.5) * 34 + (n - 0.5) * 18, 235, 128 + (w - 0.5) * 80];
    }, 0.6),
    grass: () => pixelSet(mid, (x, y) => {
      const p = fbm(x * 0.012, y * 0.012, 19, 4), b = hash2(x, y, 41), g = 118 + (p - 0.5) * 44 + (b - 0.5) * 46;
      return [g, 240, 128 + (b - 0.5) * 70 + (p - 0.5) * 40];
    }, 0.9, [0.52, 1, 0.38]),
    tile() {
      const size = 256, a = canvas(size), hm = canvas(size);
      a.ctx.fillStyle = '#e9e7e2'; a.ctx.fillRect(0, 0, size, size);
      hm.ctx.fillStyle = 'rgb(200,200,200)'; hm.ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const t = 0.94 + hash2(i, j, 5) * 0.08;
        a.ctx.fillStyle = `rgb(${(233 * t) | 0},${(231 * t) | 0},${(226 * t) | 0})`;
        a.ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      }
      a.ctx.fillStyle = '#b9b4aa'; hm.ctx.fillStyle = 'rgb(70,70,70)';
      for (let i = 0; i <= 4; i++) { a.ctx.fillRect(i * 64 - 1, 0, 2, size); a.ctx.fillRect(0, i * 64 - 1, size, 2); hm.ctx.fillRect(i * 64 - 1, 0, 2, size); hm.ctx.fillRect(0, i * 64 - 1, size, 2); }
      return { map: tex(a.canvas, true), roughnessMap: null, normalMap: heightToNormal(hm, 1.2) };
    },
  };
  const get = (name) => { if (!cache.has(name)) cache.set(name, gen[name]()); return cache.get(name); };
  const withRepeat = (name, rx, ry) => {
    const set = get(name), clone = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; all.push(c); return c; };
    return { map: clone(set.map), roughnessMap: clone(set.roughnessMap), normalMap: clone(set.normalMap) };
  };
  return { get, withRepeat, all, canvasTexture: (c, srgb = true) => tex(c, srgb) };
}

// ---- text plaques / screens ----------------------------------------------------------
function drawLabel(kit, lines, { w = 512, h = 128, bg = '#1b2433', fg = '#f1f5f9', border = null, glow = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(4, h * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const size = ln.size ?? (i === 0 ? h * (n > 1 ? 0.42 : 0.55) : h * 0.2);
    g.font = `${ln.weight ?? (i === 0 ? 800 : 600)} ${size}px "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = ln.color ?? fg;
    if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.35; }
    const y = n === 1 ? h / 2 : h * (i === 0 ? 0.4 : 0.78);
    g.fillText(ln.text, w / 2, y);
  });
  return kit.canvasTexture(c, true);
}

function codeScreenTexture(kit, seed, accent) {
  const w = 256, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1424'; g.fillRect(0, 0, w, h);
  const cols = ['#7dd3fc', '#c4b5fd', '#86efac', '#fcd34d', '#f9a8d4', '#e2e8f0', accent];
  for (let line = 0; line < 40; line++) {
    let x = 10 + Math.floor(hash1(seed * 31 + line) * 4) * 14;
    const y = 8 + line * 12.6;
    const words = 1 + Math.floor(hash1(seed * 17 + line * 3) * 5);
    for (let k = 0; k < words && x < w - 20; k++) {
      const len = 12 + hash1(seed + line * 7 + k) * 50;
      g.fillStyle = cols[Math.floor(hash1(seed * 5 + line * 11 + k) * cols.length)];
      g.globalAlpha = 0.9; g.fillRect(x, y, Math.min(len, w - 10 - x), 6);
      x += len + 8;
    }
  }
  g.globalAlpha = 1;
  return kit.canvasTexture(c, true);
}

// ---- small mesh helpers --------------------------------------------------------------
const tmpV = new THREE.Vector3();
function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx; if (opts.ry) m.rotation.y = opts.ry; if (opts.rz) m.rotation.z = opts.rz;
  if (opts.scale) m.scale.set(...opts.scale);
  m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true;
  parent.add(m);
  return m;
}
const yawToward = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
// local (lx, lz) of an object at (cx, cz) rotated by rotY -> world [x, z]
const local = (cx, cz, rotY, lx, lz) => [cx + lx * Math.cos(rotY) + lz * Math.sin(rotY), cz - lx * Math.sin(rotY) + lz * Math.cos(rotY)];
const r3 = (v) => Math.round(v * 1000) / 1000;
const P = (x, z) => [r3(x), r3(z)];

// ---- GLB models ----------------------------------------------------------------------
const MODEL_NAMES = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'loungeSofa',
  'tableCoffee', 'bookcaseClosedWide', 'kitchenFridge', 'kitchenCoffeeMachine', 'kitchenCabinet',
  'kitchenSink', 'kitchenStove', 'kitchenMicrowave', 'kitchenCabinetUpper', 'lampRoundFloor', 'lampSquareTable',
  'pottedPlant', 'plantSmall1', 'plantSmall2', 'plantSmall3', 'trashcan', 'chairCushion', 'rugRectangle', 'rugRound'];

async function loadModels() {
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(MODEL_NAMES.map((n) => loader.loadAsync(MODEL_BASE + n + '.glb').then((g) => {
    const scene = g.scene; scene.updateMatrixWorld(true);
    out[n] = { scene, box: new THREE.Box3().setFromObject(scene) };
  }).catch((err) => { console.warn('[office] model failed, using a procedural stand-in:', n, err?.message || err); })));
  return out;
}

// ---- the builder ---------------------------------------------------------------------
export async function buildOffice({ deskCount = 8, quality = 'balanced', palette = {} } = {}) {
  const pal = { ...DEFAULT_PALETTE, ...palette };
  const kit = makeTextureKit(quality);
  const models = await loadModels();
  const group = new THREE.Group(); group.name = 'office';
  const statics = new THREE.Group(); // merged into a few meshes at the end
  const dynamic = new THREE.Group(); dynamic.name = 'office-dynamic';
  const blockers = [];
  const disposables = new Set();
  const matCache = new Map();
  const tickers = [];
  const glowMats = [];   // { mat, base, gain }  emissiveIntensity = base + gain * glow
  const lampLights = [];
  let glow = GLOW.afternoon;

  const M = (key, params, Ctor = THREE.MeshStandardMaterial) => {
    if (matCache.has(key)) return matCache.get(key);
    const m = new Ctor(params); matCache.set(key, m); return m;
  };
  const metal = kit.get('metal');
  const fabric = kit.get('fabric');
  const metalMat = (color, rough = 0.35, metalness = 0.8) => M('metal:' + color + rough + metalness, { color, map: metal.map, roughnessMap: metal.roughnessMap, roughness: rough, metalness });
  const flat = (color, rough = 0.6, metalness = 0.05, extra = {}) => M('flat:' + color + rough + metalness + JSON.stringify(extra), { color, roughness: rough, metalness, ...extra });
  const emissive = (color, intensity = 1.6, key = '') => M('em:' + color + intensity + key, { color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  const basicGlow = (color) => M('bg:' + color, { color, toneMapped: false }, THREE.MeshBasicMaterial);
  const geoCache = new Map();
  const G = {
    box: (w, h, d) => { const k = `b${w},${h},${d}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); },
    cyl: (rt, rb, h, s = 16) => { const k = `c${rt},${rb},${h},${s}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, s)); return geoCache.get(k); },
    sph: (r, ws = 14, hs = 10) => { const k = `s${r},${ws},${hs}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, ws, hs)); return geoCache.get(k); },
    plane: (w, h) => { const k = `p${w},${h}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.PlaneGeometry(w, h)); return geoCache.get(k); },
  };

  // Blockers. rect: centre (x, z), size w (local x) by d (local z), rotated rotY.
  const blockRect = (x, z, w, d, rotY = 0, pad = 0.08) => blockers.push({ kind: 'rect', x: r3(x), z: r3(z), w: r3(w), d: r3(d), rotY: r3(rotY), pad });
  const blockCircle = (x, z, r) => blockers.push({ kind: 'circle', x: r3(x), z: r3(z), r: r3(r) });

  // ---- GLB placement with Hermes-style re-tint --------------------------------------
  const tintCache = new Map();
  const retint = (name, tints) => {
    const key = name + JSON.stringify(tints || {});
    if (tintCache.has(key)) return tintCache.get(key);
    const src = models[name].scene.clone(true);
    let i = 0;
    src.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material.clone();
      const mn = (o.material.name || '').toString();
      const t = tints?.[mn];
      if (t) {
        const [col, amt] = Array.isArray(t) ? t : [t, 0.92];
        if (col === 'glow') { o.material = M('lampShade', { color: '#fff1c9', emissive: '#ffd27a', emissiveIntensity: 0.1, roughness: 0.6 }); glowRegister(o.material, 0.1, 1.6); i++; return; }
        m.color.lerp(new THREE.Color(col), amt).multiplyScalar(1.1);
        m.color.r = Math.min(1, m.color.r); m.color.g = Math.min(1, m.color.g); m.color.b = Math.min(1, m.color.b);
      }
      if (mn.startsWith('metal')) { m.metalness = 0.55; m.roughness = 0.35 + (i % 3) * 0.05; }
      else { m.metalness = 0.08; m.roughness = 0.5 + (i % 4) * 0.07; }
      if (mn === 'glass') { m.transparent = true; m.opacity = 0.45; m.roughness = 0.08; }
      m.envMapIntensity = 0.7;
      o.material = m; i++;
    });
    tintCache.set(key, src);
    return src;
  };
  // place(name, { x, z, y, rot, w|h|d (fit) or scale, tints }) — footprint-centred, base on y.
  const place = (name, o, parent = statics) => {
    const wrap = new THREE.Group();
    wrap.position.set(o.x, o.y ?? 0, o.z); wrap.rotation.y = o.rot ?? 0;
    const entry = models[name];
    if (!entry) { // procedural stand-in so a missing GLB never breaks the office
      const w = o.w ?? 0.5, h = o.h ?? 0.5, d = o.d ?? 0.5;
      addMesh(wrap, G.box(w, h, d), flat(o.fallbackColor ?? '#8a7a6a', 0.7), 0, h / 2, 0);
      parent.add(wrap); return wrap;
    }
    const size = entry.box.getSize(new THREE.Vector3());
    let s;
    if (o.scale) s = new THREE.Vector3().setScalar(o.scale);
    else {
      const k = o.w ? o.w / size.x : o.h ? o.h / size.y : o.d / size.z;
      s = new THREE.Vector3(o.w ? o.w / size.x : k, o.h ? o.h / size.y : k, o.d ? o.d / size.z : k);
    }
    const inner = retint(name, o.tints).clone(true);
    inner.scale.copy(s);
    const c = entry.box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x * s.x, -entry.box.min.y * s.y, -c.z * s.z);
    wrap.add(inner); parent.add(wrap);
    wrap.userData.size = [size.x * s.x, size.y * s.y, size.z * s.z];
    return wrap;
  };
  const glowRegister = (mat, base, gain) => { if (!glowMats.some((g) => g.mat === mat)) glowMats.push({ mat, base, gain }); };

  // =================================================================================
  // Floor, rooms floors, outdoors
  // =================================================================================
  const W = B.maxX - B.minX, D = B.maxZ - B.minZ, CX = (B.minX + B.maxX) / 2, CZ = (B.minZ + B.maxZ) / 2;
  {
    const wood = kit.withRepeat('wood', W / 2.7, D / 2.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshPhysicalMaterial({
      color: pal.floor, map: wood.map, roughnessMap: wood.roughnessMap, normalMap: wood.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 0.2, clearcoatRoughness: 0.6, metalness: 0.02 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(CX, 0, CZ); floor.receiveShadow = true;
    statics.add(floor);
    const overlay = (x0, z0, x1, z1, mat, y = 0.003) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
      mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
      statics.add(m); return m;
    };
    const inset = 0.07;
    // gym: dark rubber
    const rub = kit.withRepeat('carpet', 6, 14);
    overlay(B.gymX0 + inset, B.minZ + inset, B.gymX1 - inset, B.wingZ1 - inset, new THREE.MeshStandardMaterial({ color: '#40464f', map: rub.map, roughnessMap: rub.roughnessMap, normalMap: rub.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.98, metalness: 0.02 }));
    // QA lab: deep purple with a glowing grid
    const qx0 = B.qaX0 + inset, qx1 = B.maxX - inset, qz0 = B.minZ + inset, qz1 = B.wingZ1 - inset;
    overlay(qx0, qz0, qx1, qz1, new THREE.MeshStandardMaterial({ color: '#12091d', roughness: 0.92, metalness: 0.08 }));
    overlay(qx0 + 0.06, qz0 + 0.3, qx1 - 0.06, qz1 - 0.3, new THREE.MeshStandardMaterial({ color: '#170d28', roughness: 0.86, metalness: 0.12 }), 0.004);
    const gridV = new THREE.MeshStandardMaterial({ color: '#0b0614', emissive: '#7c3aed', emissiveIntensity: 1.6, transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const gridH = new THREE.MeshStandardMaterial({ color: '#04080d', emissive: '#38bdf8', emissiveIntensity: 1.6, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const qw = qx1 - qx0, qd = qz1 - qz0, qcx = (qx0 + qx1) / 2, qcz = (qz0 + qz1) / 2;
    const gridGroup = new THREE.Group();
    for (let i = 0; i < 7; i++) { const m = addMesh(gridGroup, G.plane(0.018, qd * 0.9), gridV, qcx - qw * 0.42 + i * (qw * 0.84 / 6), 0.01, qcz, { rx: -Math.PI / 2, cast: false }); m.receiveShadow = false; }
    for (let i = 0; i < 18; i++) { const m = addMesh(gridGroup, G.plane(qw * 0.9, 0.014), gridH, qcx, 0.011, qcz - qd * 0.45 + i * (qd * 0.9 / 17), { rx: -Math.PI / 2, cast: false }); m.receiveShadow = false; }
    statics.add(gridGroup); // shared materials: merged, still animated via opacity
    tickers.push((t) => { gridV.opacity = 0.28 + 0.1 * Math.sin(t * 1.3); gridH.opacity = 0.16 + 0.07 * Math.sin(t * 0.9 + 1); });
    // server room: concrete; kitchen: tile
    const conc = kit.withRepeat('concrete', 2, 1.5);
    overlay(B.minX + inset, B.serverZ + inset, B.serverX - inset, B.maxZ - inset, new THREE.MeshStandardMaterial({ color: '#8d949c', map: conc.map, roughnessMap: conc.roughnessMap, normalMap: conc.normalMap, roughness: 0.9, metalness: 0.05 }));
    const tile = kit.withRepeat('tile', 5.6 / 1.2, 4.1 / 1.2);
    overlay(-2.0, B.minZ + inset, B.gymX0 - inset, -2.4, new THREE.MeshStandardMaterial({ color: '#c9c4ba', map: tile.map, normalMap: tile.normalMap, roughness: 0.55, metalness: 0.02 }));

    // apron, walkway, lawn (Hermes atmosphere.tsx)
    const ap = kit.withRepeat('concrete', 12, 7);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 9, D + 9), new THREE.MeshStandardMaterial({ color: pal.apron, map: ap.map, roughnessMap: ap.roughnessMap, normalMap: ap.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, metalness: 0 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(CX, -0.04, CZ); apron.receiveShadow = true; statics.add(apron);
    const pathMat = new THREE.MeshStandardMaterial({ color: '#cdbfa6', map: ap.map, roughness: 0.95 });
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9.5), pathMat);
    walk.rotation.x = -Math.PI / 2; walk.position.set((B.mainDoor[0] + B.mainDoor[1]) / 2, -0.02, B.maxZ + 4.75); walk.receiveShadow = true; statics.add(walk);
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(420, 64), new THREE.MeshStandardMaterial({ color: pal.lawn, roughness: 1, metalness: 0 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, -0.12, 0); lawn.receiveShadow = true; statics.add(lawn);
    const gr = kit.withRepeat('grass', 30, 30);
    const lawnNear = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#9cb87c', map: gr.map, normalMap: gr.normalMap, roughness: 0.97, transparent: false }));
    lawnNear.rotation.x = -Math.PI / 2; lawnNear.position.set(CX, -0.08, CZ); lawnNear.receiveShadow = true; statics.add(lawnNear);

    // park trees ringing the campus
    const trunkMat = flat('#5d4a36', 0.95);
    const canopy = ['#4d7038', '#5a7f40', '#446331'].map((c) => flat(c, 1, 0));
    for (let i = 0; i < 22; i++) {
      const ang = ((i + 0.5) / 22) * Math.PI * 2;
      const rx = W / 2 + 6 + hash1(i * 11) * 10, rz = D / 2 + 6 + hash1(i * 19) * 10;
      const tx = CX + Math.cos(ang) * rx, tz = CZ + Math.sin(ang) * rz;
      const s = 0.85 + hash1(i * 23) * 0.7;
      const tree = new THREE.Group(); tree.position.set(tx, 0, tz); tree.scale.setScalar(s); tree.rotation.z = (hash1(i * 7) - 0.5) * 0.14;
      addMesh(tree, G.cyl(0.09, 0.14, 1.6, 8), trunkMat, 0, 0.8, 0);
      for (let k = 0; k < 3; k++) {
        const a = hash1(i * 13 + k) * Math.PI * 2, sp = (0.28 + hash1(i * 17 + k) * 0.2) * 0.6;
        addMesh(tree, G.sph(0.85 - k * 0.16, 12, 10), canopy[(i + k) % 3], Math.cos(a) * sp, 1.7 + k * 0.34, Math.sin(a) * sp);
      }
      statics.add(tree);
    }
    // flag pole by the entrance (Hermes OfficeFlagPole, neutral banner)
    const fp = new THREE.Group(); fp.position.set(-7.2, 0, B.maxZ + 1.6); fp.rotation.y = 0.32;
    addMesh(fp, G.cyl(0.22, 0.28, 0.16, 18), flat('#3a3229', 0.94, 0.08), 0, 0.08, 0);
    addMesh(fp, G.cyl(0.024, 0.03, 2.48, 14), metalMat('#c4c9d1', 0.32, 0.88), 0, 1.32, 0);
    addMesh(fp, G.sph(0.06, 16, 12), flat('#d4af37', 0.28, 0.92), 0, 2.6, 0);
    const flagTex = drawLabel(kit, [{ text: 'AGENT FLOOR', size: 54 }], { w: 512, h: 300, bg: pal.accent, fg: '#0b1220' });
    const flag = addMesh(fp, G.plane(0.95, 0.56), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }), 0.5, 2.2, 0, { cast: true });
    dynamic.add(fp);
    tickers.push((t) => { flag.rotation.y = Math.sin(t * 1.7) * 0.12; flag.scale.x = 1 - 0.04 * Math.abs(Math.sin(t * 2.3)); });
    blockCircle(-7.2, B.maxZ + 1.6, 0.32);
    // walkway bollard lights
    const bollardMat = metalMat('#d7ccc8', 0.62, 0.24);
    const bulbMat = M('bulb', { color: '#fff3cd', emissive: '#fff3cd', emissiveIntensity: 0.5 });
    glowRegister(bulbMat, 0.4, 1.6);
    for (let i = 0; i < 4; i++) for (const sx of [-1.35, 1.35]) {
      const bx = (B.mainDoor[0] + B.mainDoor[1]) / 2 + sx, bz = B.maxZ + 1.2 + i * 2.4;
      addMesh(statics, G.cyl(0.035, 0.035, 0.4, 10), bollardMat, bx, 0.2, bz);
      addMesh(statics, G.sph(0.06, 12, 10), bulbMat, bx, 0.43, bz, { cast: false });
      if (bz < B.outsideZ) blockCircle(bx, bz, 0.12);
    }
  }

  // =================================================================================
  // Walls (Hermes PerimeterWall: plaster, dark metal cap; skirting inside)
  // =================================================================================
  const wallTex = kit.get('plaster');
  const wallMats = new Map();
  const wallMat = (len) => {
    const rep = Math.max(1, Math.round(len / 2));
    if (!wallMats.has(rep)) {
      const t = kit.withRepeat('plaster', rep, 1);
      wallMats.set(rep, new THREE.MeshStandardMaterial({ color: pal.wall, map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92, metalness: 0.02 }));
    }
    return wallMats.get(rep);
  };
  void wallTex;
  const capMat = flat(pal.wallCap, 0.42, 0.68);
  const skirtMat = flat('#14151a', 0.85, 0.1);
  const wall = (x0, z0, x1, z1, h, t, { skirt = 0, extend = 0 } = {}) => {
    const alongX = Math.abs(z1 - z0) < 1e-6;
    const len = Math.hypot(x1 - x0, z1 - z0) + extend;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const dims = (a, hh, b) => (alongX ? [a, hh, b] : [b, hh, a]);
    addMesh(statics, G.box(...dims(len, h, t)), wallMat(len), cx, h / 2, cz);
    addMesh(statics, G.box(...dims(len, 0.05, t + 0.012)), capMat, cx, h + 0.025, cz);
    if (skirt) {
      const off = (t / 2 + 0.02) * skirt;
      addMesh(statics, G.box(...dims(len - 0.02, 0.06, 0.04)), skirtMat, cx + (alongX ? 0 : off), 0.03, cz + (alongX ? off : 0), { cast: false });
    }
    blockRect(cx, cz, alongX ? len : t, alongX ? t : len, 0, 0.12);
  };
  // perimeter (far walls tall, near walls cut down so the camera sees in)
  wall(B.minX, B.minZ, B.maxX, B.minZ, B.hFar, B.wallT, { skirt: 1, extend: B.wallT });
  wall(B.minX, B.minZ, B.minX, B.maxZ, B.hFar, B.wallT, { skirt: 1, extend: B.wallT });
  wall(B.minX, B.maxZ, B.mainDoor[0], B.maxZ, B.hNear, B.wallT, { skirt: -1 });
  wall(B.mainDoor[1], B.maxZ, B.maxX, B.maxZ, B.hNear, B.wallT, { skirt: -1, extend: B.wallT / 2 });
  wall(B.maxX, B.minZ, B.maxX, B.maxZ, B.hNear, B.wallT, { skirt: -1 });
  // server room
  wall(B.minX, B.serverZ, B.serverX, B.serverZ, B.hIn, B.iwallT);
  wall(B.serverX, B.serverZ, B.serverX, B.serverDoor[0], B.hIn, B.iwallT);
  wall(B.serverX, B.serverDoor[1], B.serverX, B.maxZ, B.hIn, B.iwallT);
  // east wing: gym | hall | QA lab
  wall(B.gymX0, B.minZ, B.gymX0, B.wingZ1, B.hIn, B.iwallT);
  wall(B.gymX0, B.wingZ1, B.gymX1, B.wingZ1, B.hIn, B.iwallT);
  wall(B.gymX1, B.minZ, B.gymX1, B.wingDoor[0], B.hIn, B.iwallT);
  wall(B.gymX1, B.wingDoor[1], B.gymX1, B.wingZ1, B.hIn, B.iwallT);
  wall(B.qaX0, B.minZ, B.qaX0, B.wingDoor[0], B.hIn, B.iwallT);
  wall(B.qaX0, B.wingDoor[1], B.qaX0, B.wingZ1, B.hIn, B.iwallT);
  wall(B.qaX0, B.wingZ1, B.maxX, B.wingZ1, B.hIn, B.iwallT);

  // ---- doors (Hermes DoorModel: frame + leaf on a pivot, swings open near agents) ----
  const doors = [];
  const woodDoor = kit.withRepeat('wood', 0.5, 0.5);
  const frameMat = M('doorFrame', { color: '#6b4c30', map: woodDoor.map, roughnessMap: woodDoor.roughnessMap, normalMap: woodDoor.normalMap, roughness: 0.78 });
  const leafMat = M('doorLeaf', { color: '#9a6a3f', map: woodDoor.map, roughnessMap: woodDoor.roughnessMap, normalMap: woodDoor.normalMap, roughness: 0.62 });
  const glassMat = M('doorGlass', { color: '#cfe8f6', transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0.1, depthWrite: false }, THREE.MeshPhysicalMaterial);
  const brass = metalMat('#c9b06a', 0.3, 0.85);
  // axis 'x': opening along x at z = c; axis 'z': opening along z at x = c.
  const door = ({ axis, c, a0, a1, wallH, sign, glass = false, double = false, hingeAtEnd = false, label }) => {
    const width = a1 - a0, mid = (a0 + a1) / 2, t = 0.08, LH = Math.min(B.doorH, wallH - 0.07);
    const toW = (a, off = 0) => (axis === 'x' ? [a, c + off] : [c + off, a]);
    const frame = new THREE.Group();
    const postDims = axis === 'x' ? [0.05, wallH, t + 0.05] : [t + 0.05, wallH, 0.05];
    for (const a of [a0 + 0.025, a1 - 0.025]) { const [x, z] = toW(a); addMesh(frame, G.box(...postDims), frameMat, x, wallH / 2, z); }
    const [hx, hz] = toW(mid);
    const headH = Math.max(0.06, wallH - LH - 0.01);
    addMesh(frame, G.box(...(axis === 'x' ? [width, headH, t + 0.04] : [t + 0.04, headH, width])), frameMat, hx, wallH - headH / 2, hz);
    statics.add(frame);
    const leaves = [];
    const makeLeaf = (hingeA, dir, lw, s) => {
      const pivot = new THREE.Group(); const [px, pz] = toW(hingeA); pivot.position.set(px, 0, pz);
      const leaf = new THREE.Group();
      const along = (v) => (axis === 'x' ? [v * dir, 0] : [0, v * dir]);
      const [lx, lz] = along(lw / 2);
      const dims = axis === 'x' ? [lw - 0.02, LH - 0.04, 0.045] : [0.045, LH - 0.04, lw - 0.02];
      if (glass) {
        const fr = axis === 'x' ? [lw - 0.02, 0.06, 0.05] : [0.05, 0.06, lw - 0.02];
        addMesh(leaf, G.box(...dims), glassMat, lx, LH / 2, lz, { cast: false });
        for (const y of [0.05, LH - 0.05]) addMesh(leaf, G.box(...fr), metalMat('#3a3f45', 0.4, 0.8), lx, y, lz);
        const [ex, ez] = along(lw - 0.04);
        addMesh(leaf, G.box(...(axis === 'x' ? [0.05, LH - 0.04, 0.05] : [0.05, LH - 0.04, 0.05])), metalMat('#3a3f45', 0.4, 0.8), ex, LH / 2, ez);
        const [hx2, hz2] = along(lw - 0.12);
        addMesh(leaf, G.box(...(axis === 'x' ? [0.03, 0.3, 0.12] : [0.12, 0.3, 0.03])), brass, hx2, 0.5, hz2);
      } else {
        addMesh(leaf, G.box(...dims), leafMat, lx, LH / 2, lz);
        const [kx, kz] = along(lw - 0.09);
        addMesh(leaf, G.sph(0.025, 10, 8), brass, kx + (axis === 'z' ? 0.04 : 0), 0.52, kz + (axis === 'x' ? 0.04 : 0));
        addMesh(leaf, G.sph(0.025, 10, 8), brass, kx - (axis === 'z' ? 0.04 : 0), 0.52, kz - (axis === 'x' ? 0.04 : 0));
      }
      pivot.add(leaf); dynamic.add(pivot);
      leaves.push({ pivot, sign: s });
    };
    if (double) { makeLeaf(a0 + 0.05, 1, width / 2 - 0.05, sign); makeLeaf(a1 - 0.05, -1, width / 2 - 0.05, -sign); }
    else if (hingeAtEnd) makeLeaf(a1 - 0.05, -1, width - 0.1, sign);
    else makeLeaf(a0 + 0.05, 1, width - 0.1, sign);
    const [cx, cz] = toW(mid);
    doors.push({ axis, cx, cz, half: width / 2, leaves, open: 0, label });
  };
  door({ axis: 'x', c: B.maxZ, a0: B.mainDoor[0], a1: B.mainDoor[1], wallH: B.hNear, sign: 1, glass: true, double: true, label: 'entrance' });
  door({ axis: 'z', c: B.serverX, a0: B.serverDoor[0], a1: B.serverDoor[1], wallH: B.hIn, sign: 1, hingeAtEnd: true, label: 'server' });
  door({ axis: 'z', c: B.gymX1, a0: B.wingDoor[0], a1: B.wingDoor[1], wallH: B.hIn, sign: -1, label: 'gym' });
  door({ axis: 'z', c: B.qaX0, a0: B.wingDoor[0], a1: B.wingDoor[1], wallH: B.hIn, sign: 1, label: 'qa' });

  // ---- wall plaques (labels) and pictures ------------------------------------------
  const plaque = (text, x, y, z, rotY, w = 1.1, h = 0.24, opts = {}) => {
    const tex = drawLabel(kit, [{ text }], { w: 512, h: Math.round(512 * h / w), bg: opts.bg ?? '#1f2937', fg: opts.fg ?? '#f8fafc', border: opts.border ?? pal.accent });
    const m = addMesh(statics, G.plane(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1 }), x, y, z, { ry: rotY, cast: false });
    return m;
  };
  const nIn = B.minZ + B.wallT / 2 + 0.012; // inner face of north wall
  plaque('MEETING', -13.7, 1.38, nIn, 0);
  plaque('KITCHEN', -1.2, 1.38, nIn, 0);
  plaque('GYM', 5.65, 1.38, nIn, 0, 0.8);
  plaque('QA LAB', 9.85, 1.38, nIn, 0, 0.9, 0.24, { bg: '#1e1033', border: '#a78bfa' });
  plaque('SERVER ROOM', B.serverX + B.iwallT / 2 + 0.012, 0.86, 4.1, Math.PI / 2, 0.85, 0.2, { bg: '#0f172a', border: '#22d3ee' });

  const picture = (x, y, z, rotY, w, h, frameColor, bgColor, draw) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY;
    addMesh(g, G.box(w, h, 0.028), flat(frameColor, 0.75, 0.18), 0, 0, 0, { cast: false });
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
    const ctx = c.getContext('2d'); ctx.fillStyle = bgColor; ctx.fillRect(0, 0, c.width, c.height); draw(ctx, c.width, c.height);
    addMesh(g, G.plane(w - 0.076, h - 0.076), new THREE.MeshStandardMaterial({ map: kit.canvasTexture(c), roughness: 0.95 }), 0, 0, 0.0145, { cast: false });
    statics.add(g);
  };
  const rects = (list) => (ctx, w, h) => list.forEach(([col, x, y, rw, rh]) => { ctx.fillStyle = col; ctx.fillRect(x * w, y * h, rw * w, rh * h); });
  picture(-9.4, 1.0, nIn + 0.014, 0, 0.58, 0.42, '#1a0e06', '#f8f4ec', rects([['#c0392b', 0.1, 0.12, 0.42, 0.4], ['#2980b9', 0.56, 0.12, 0.34, 0.4], ['#f39c12', 0.3, 0.6, 0.5, 0.28], ['#1c1008', 0.49, 0.06, 0.012, 0.88], ['#1c1008', 0.08, 0.52, 0.84, 0.014]]));
  picture(-4.6, 1.0, nIn + 0.014, 0, 0.64, 0.4, '#2a1a0a', '#a8d8f0', (ctx, w, h) => { rects([['#6ab8e8', 0, 0.12, 1, 0.3], ['#7ab870', 0, 0.42, 1, 0.28], ['#5a9a58', 0.1, 0.5, 0.5, 0.22], ['#8b6348', 0, 0.72, 1, 0.28]])(ctx, w, h); ctx.fillStyle = '#f8d060'; ctx.beginPath(); ctx.arc(w * 0.75, h * 0.25, h * 0.1, 0, 7); ctx.fill(); });
  picture(-2.9, 1.0, nIn + 0.014, 0, 0.5, 0.42, '#1a0e06', '#f0d090', rects([['#e07820', 0.1, 0.15, 0.8, 0.28], ['#c0403a', 0.1, 0.45, 0.8, 0.2], ['#4a2870', 0.1, 0.68, 0.8, 0.18]]));
  const wIn = B.minX + B.wallT / 2 + 0.012;
  picture(wIn + 0.014, 1.0, -0.4, Math.PI / 2, 0.56, 0.42, '#1c1008', '#f0c840', (ctx, w, h) => { ctx.fillStyle = '#c84020'; ctx.translate(w / 2, h / 2); for (const r of [0, Math.PI / 3, -Math.PI / 3]) { ctx.save(); ctx.rotate(r); ctx.fillRect(-w * 0.07, -h * 0.38, w * 0.14, h * 0.76); ctx.restore(); } });
  picture(wIn + 0.014, 1.0, 1.9, Math.PI / 2, 0.58, 0.44, '#102040', '#1a3a6a', (ctx, w, h) => { ctx.strokeStyle = 'rgba(64,128,192,0.6)'; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * w / 6, 0); ctx.lineTo(i * w / 6, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); } ctx.fillStyle = 'rgba(64,128,192,0.45)'; ctx.fillRect(w * 0.2, h * 0.2, w * 0.3, h * 0.25); ctx.fillRect(w * 0.6, h * 0.55, w * 0.22, h * 0.22); });
  picture(wIn + 0.014, 1.05, -5.75, Math.PI / 2, 0.5, 0.36, '#0a0a12', '#0a0a12', (ctx, w, h) => { ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(w * (0.1 + i * 0.135), h * 0.15, w * 0.1, h * 0.7); }); });
  picture(5.65, 1.0, nIn + 0.014, 0, 0.55, 0.38, '#262626', '#101820', (ctx, w, h) => { ['#22d3ee', '#a78bfa', '#4ade80', '#f472b6', '#fb923c'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(w * (i % 2 ? 0.25 : 0.15), h * (0.15 + i * 0.16), w * (0.4 + (i % 3) * 0.12), h * 0.04); }); });

  // wall clock (Hermes ClockModel) on the north wall
  {
    const g = new THREE.Group(); g.position.set(-7.0, 1.28, nIn + 0.01);
    addMesh(g, G.cyl(0.13, 0.13, 0.02, 28), flat('#f5f0e8', 0.3, 0.05), 0, 0, 0.01, { rx: Math.PI / 2, cast: false });
    addMesh(g, new THREE.TorusGeometry(0.13, 0.014, 8, 28), flat('#2a2a2a', 0.5, 0.4), 0, 0, 0.02, { cast: false });
    const hand = (len, w, col) => { const p = new THREE.Group(); p.position.z = 0.025; addMesh(p, G.box(w, len, 0.006), flat(col, 0.6), 0, len / 2, 0, { cast: false }); g.add(p); return p; };
    const hh = hand(0.065, 0.012, '#1a1a1a'), mh = hand(0.1, 0.008, '#1a1a1a'), sh = hand(0.11, 0.004, '#c0392b');
    dynamic.add(g);
    tickers.push(() => { const d = new Date(); const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60; sh.rotation.z = -s / 60 * Math.PI * 2; mh.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -h / 12 * Math.PI * 2; });
  }

  // =================================================================================
  // Anchors
  // =================================================================================
  const anchors = {
    entrance: { pos: P((B.mainDoor[0] + B.mainDoor[1]) / 2, B.maxZ + 1.9), facing: Math.PI },
    desks: [], meeting: null, review: null, qa: [], servers: [], kitchen: [], couches: [], beanbags: [],
    pingpong: null, gym: [], wander: [], rooms: {}, doors: [],
  };

  // ---- shared furniture builders ----------------------------------------------------
  const plant = (x, z, h = 0.72, block = true) => { place('pottedPlant', { x, z, h }); if (block) blockCircle(x, z, 0.24); };
  const trash = (x, z) => place('trashcan', { x, z, h: 0.3 });
  const floorLamp = (x, z, light = false) => {
    place('lampRoundFloor', { x, z, h: 1.05, tints: { lamp: 'glow', metal: ['#c8a060', 0.6] } });
    if (light && quality === 'high') { const l = new THREE.PointLight('#ffd9a0', 0, 4, 2); l.position.set(x, 0.95, z); dynamic.add(l); lampLights.push({ l, max: 3 }); }
  };
  const meetChair = (x, z, facing, tint = pal.chair) => place('chairCushion', { x, z, rot: facing, h: 0.62, tints: { wood: ['#5b3d24', 0.8], carpet: tint } });
  // Hermes RoundTableModel
  const woodTop = kit.withRepeat('wood', 1.5, 1.5);
  const roundTable = (x, z, r, h = 0.5) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    addMesh(g, G.cyl(r, r, 0.04, 64), M('rtTop', { color: '#b07a45', map: woodTop.map, roughnessMap: woodTop.roughnessMap, normalMap: woodTop.normalMap, roughness: 0.55, metalness: 0.05 }), 0, h, 0);
    addMesh(g, G.cyl(0.06, 0.06, h, 16), metalMat('#7d838c', 0.35, 0.85), 0, h / 2, 0);
    addMesh(g, G.cyl(r * 0.4, r * 0.45, 0.04, 32), metalMat('#6c727a', 0.4, 0.85), 0, 0.02, 0);
    statics.add(g);
    blockCircle(x, z, r + 0.04);
  };

  // =================================================================================
  // Meeting room (top-left): round table, 6 chairs, TV, whiteboard, rug
  // =================================================================================
  {
    const mx = -13.7, mz = -3.95, tr = 1.1, sr = 1.62;
    place('rugRound', { x: mx, z: mz, w: 4.1, d: 4.1, tints: { carpet: ['#5f6f86', 0.9], carpetDarker: ['#3f4a5c', 0.9] } });
    roundTable(mx, mz, tr);
    const seats = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const sx = mx + Math.sin(a) * sr, sz = mz + Math.cos(a) * sr;
      const facing = yawToward(sx, sz, mx, mz);
      meetChair(sx, sz, facing);
      seats.push({ pos: P(sx, sz), facing: r3(facing), seatY: 0.3 });
    }
    anchors.meeting = { center: P(mx, mz), seats, tableHeight: 0.52 };
    // TV on the west wall, whiteboard standing in the corner
    {
      const c = document.createElement('canvas'); c.width = 512; c.height = 288; const x = c.getContext('2d');
      x.fillStyle = '#0f172a'; x.fillRect(0, 0, 512, 288);
      x.fillStyle = '#e2e8f0'; x.font = '700 30px Arial'; x.fillText('Sprint board', 24, 46);
      ['#38bdf8', '#a78bfa', '#4ade80', '#fbbf24'].forEach((col, k) => { x.fillStyle = '#1e293b'; x.fillRect(24 + k * 120, 70, 108, 190); for (let j = 0; j < 4 - (k % 3); j++) { x.fillStyle = col; x.fillRect(32 + k * 120, 82 + j * 44, 92, 34); } });
      const tvMat = M('meetTv', { color: '#000000', emissive: '#ffffff', emissiveMap: kit.canvasTexture(c), emissiveIntensity: 0.9, roughness: 0.3 });
      glowRegister(tvMat, 0.85, 0.5);
      const tx = B.minX + B.wallT / 2;
      addMesh(statics, G.box(0.05, 0.82, 1.42), flat('#111318', 0.4, 0.5), tx + 0.03, 0.98, mz);
      addMesh(statics, G.plane(1.34, 0.75), tvMat, tx + 0.057, 0.98, mz, { ry: Math.PI / 2, cast: false });
    }
    {
      // Hermes WhiteboardProceduralModel (thin along x, long along z)
      const g = new THREE.Group(); g.position.set(mx, 0, B.minZ + B.wallT / 2 + 0.22); g.rotation.y = -Math.PI / 2;
      const len = 1.3, bh = 0.62, by = 0.78, fm = metalMat('#c9cdd3', 0.32, 0.85);
      for (const z of [-len / 2 + 0.04, len / 2 - 0.04]) { addMesh(g, G.box(0.035, by - bh / 2, 0.045), fm, 0, (by - bh / 2) / 2, z); addMesh(g, G.box(0.18, 0.03, 0.06), fm, 0, 0.015, z); }
      const wbTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#f8f8f5'; x.fillRect(0, 0, 512, 256); x.lineWidth = 6; x.lineCap = 'round';
        [['#c0392b', 40, 50, 230], ['#2563a8', 60, 100, 300], ['#2563a8', 60, 135, 200], ['#2e8b57', 280, 60, 450], ['#1a1a1a', 60, 190, 380]].forEach(([c2, x0, y0, x1]) => { x.strokeStyle = c2; x.beginPath(); x.moveTo(x0, y0); for (let k = x0; k < x1; k += 20) x.lineTo(k, y0 + Math.sin(k * 0.08) * 6); x.stroke(); });
        x.strokeStyle = '#c0392b'; x.strokeRect(300, 120, 150, 90); return kit.canvasTexture(c); })();
      addMesh(g, G.box(0.04, bh, len), flat('#f8f8f5', 0.15, 0.02), 0, by, 0);
      addMesh(g, G.plane(len - 0.04, bh - 0.04), new THREE.MeshStandardMaterial({ map: wbTex, roughness: 0.2 }), 0.021, by, 0, { ry: Math.PI / 2, cast: false });
      for (const y of [by + bh / 2 + 0.013, by - bh / 2 - 0.013]) addMesh(g, G.box(0.052, 0.026, len + 0.05), fm, 0, y, 0);
      for (const s of [-1, 1]) addMesh(g, G.box(0.052, bh, 0.026), fm, 0, by, s * (len / 2 + 0.013));
      addMesh(g, G.box(0.06, 0.014, len * 0.55), fm, 0.045, by - bh / 2 - 0.02, 0);
      statics.add(g);
      blockRect(mx, B.minZ + B.wallT / 2 + 0.22, 0.24, len + 0.1, -Math.PI / 2, 0.06);
    }
    plant(-15.65, -6.0);
    place('bookcaseClosedWide', { x: -11.0, z: B.minZ + B.wallT / 2 + 0.22, h: 1.2, tints: { wood: ['#5c3520', 0.85] } });
    blockRect(-11.0, B.minZ + B.wallT / 2 + 0.22, 1.25, 0.42, 0, 0.06);
    anchors.rooms.meeting = { minX: B.minX, minZ: B.minZ, maxX: -11.5, maxZ: -1.5 };
  }

  // =================================================================================
  // Desks (open plan). Rows: A (z=-0.6) and B (z=3.0) from Hermes; C (north, z=-4.0)
  // and D (south, z=5.55) are added when more than 18 desks are needed.
  // =================================================================================
  const nDesks = Math.max(0, Math.min(28, Math.floor(deskCount)));
  if (deskCount > 28) console.warn('[office] deskCount capped at 28');
  const rowsSpec = (() => {
    const spread = (k, x0, x1, maxPitch) => {
      if (k <= 0) return [];
      const mid = (x0 + x1) / 2, pitch = k === 1 ? 0 : Math.min(maxPitch, (x1 - x0) / (k - 1));
      return Array.from({ length: k }, (_, i) => mid + (i - (k - 1) / 2) * pitch);
    };
    const A = { z: -0.6 }, Bz = { z: 3.0 }, C = { z: -4.0 }, Dz = { z: 5.55 };
    if (nDesks <= 18) {
      const kA = Math.ceil(nDesks / 2), kB = nDesks - kA;
      return [{ ...A, xs: spread(kA, -14.7, -1.5, 3.6) }, { ...Bz, xs: spread(kB, -14.7, -1.5, 3.6) }];
    }
    const rest = nDesks - 18, kC = Math.min(6, rest), kD = rest - kC;
    return [{ ...C, xs: spread(kC, -10.2, -2.2, 1.6) }, { ...A, xs: spread(9, -14.7, -1.5, 1.65) },
      { ...Bz, xs: spread(9, -14.7, -1.5, 1.65) }, { ...Dz, xs: spread(kD, -10.4, -5.6, 1.6) }];
  })();
  const DESK = { w: 1.1, d: 0.83, top: 0.58, chairOff: 0.74 };
  const screenMats = [];
  const poolMat = M('lampPool', { color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }, THREE.MeshBasicMaterial);
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return kit.canvasTexture(c); })();
  poolMat.map = poolTex;
  let deskIndex = 0;
  for (const row of rowsSpec) for (const x of row.xs) {
    const id = 'desk_' + deskIndex, i = deskIndex++;
    const z = row.z;
    place('desk', { x, z, rot: Math.PI, w: DESK.w, h: DESK.top, d: DESK.d, tints: { wood: pal.desk } });
    blockRect(x, z, DESK.w, DESK.d, 0, 0.06);
    const cz = z - DESK.chairOff;
    place('chairDesk', { x, z: cz, rot: (hash1(i * 7) - 0.5) * 0.3, h: 0.72, tints: { carpet: pal.chair, metalMedium: ['#2d3340', 0.5] } });
    // monitor faces north (toward the seated agent), keyboard + mouse at the near edge
    const mon = place('computerScreen', { x, z: z + 0.14, y: DESK.top, rot: Math.PI, w: 0.5, tints: { metalDark: ['#363c58', 0.6], metal: ['#2a2f45', 0.6] } });
    place('computerKeyboard', { x, z: z - 0.17, y: DESK.top, rot: Math.PI, w: 0.32 });
    place('computerMouse', { x: x - 0.27, z: z - 0.17, y: DESK.top, rot: Math.PI, w: 0.055 });
    // screen surface (dynamic: flicker + scroll); `monitor` anchor
    const ms = mon.userData.size || [0.5, 0.37, 0.13];
    const scrTex = codeScreenTexture(kit, i + 1, pal.accent); scrTex.repeat.set(1, 0.5);
    const smat = new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#ffffff', emissiveMap: scrTex, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0 });
    const screen = new THREE.Mesh(G.plane(ms[0] * 0.86, ms[1] * 0.6), smat);
    screen.name = 'monitor-' + id;
    screen.position.set(x, DESK.top + ms[1] * 0.6, z + 0.14 - ms[2] * 0.5 - 0.004);
    screen.rotation.y = Math.PI;
    dynamic.add(screen);
    screenMats.push({ mat: smat, tex: scrTex, phase: hash1(i * 3) * 10, speed: 0.01 + hash1(i * 5) * 0.02 });
    // desk lamp + warm light pool
    const lx = x + DESK.w / 2 - 0.14, lz = z + 0.2;
    place('lampSquareTable', { x: lx, z: lz, y: DESK.top, h: 0.24, tints: { lamp: 'glow' } });
    const pool = addMesh(statics, G.plane(0.9, 0.9), poolMat, lx - 0.18, DESK.top + 0.006, z - 0.05, { rx: -Math.PI / 2, cast: false, receive: false });
    void pool;
    let lamp;
    if (quality === 'high') { lamp = new THREE.PointLight('#ffcf8a', 0, 2.2, 2); lamp.position.set(lx, DESK.top + 0.28, lz); dynamic.add(lamp); lampLights.push({ l: lamp, max: 1.4 }); }
    if (i % 3 === 1) place(['plantSmall1', 'plantSmall2', 'plantSmall3'][i % 3], { x: x - DESK.w / 2 + 0.13, z: z + 0.22, y: DESK.top, h: 0.24 });
    if (i % 2 === 0) trash(x + DESK.w / 2 + 0.16, z + 0.2);
    anchors.desks.push({ id, seat: P(x, cz), facing: 0, seatY: 0.36, monitor: screen, lamp, desk: P(x, z), top: DESK.top, width: DESK.w, depth: DESK.d });
  }
  {
    const xs = anchors.desks.map((d) => d.desk[0]), zs = anchors.desks.map((d) => d.desk[1]);
    anchors.rooms.desks = xs.length ? { minX: r3(Math.min(...xs) - 0.9), minZ: r3(Math.min(...zs) - 1.4), maxX: r3(Math.max(...xs) + 0.9), maxZ: r3(Math.max(...zs) + 0.7) }
      : { minX: -15, minZ: -1.5, maxX: -1.5, maxZ: 3.5 };
  }
  const hasRowC = nDesks > 18, hasRowD = nDesks > 24;

  // north nook (only while row C is not needed): sofa, coffee table, lamp
  if (!hasRowC) {
    const nx = -6.2, nz = B.minZ + B.wallT / 2 + 0.45;
    place('loungeSofa', { x: nx, z: nz, w: 1.6, tints: { carpet: pal.couch, wood: ['#4a3322', 0.7] } });
    blockRect(nx, nz, 1.6, 0.74, 0, 0.06);
    place('tableCoffee', { x: nx, z: nz + 0.95, w: 0.95, tints: { wood: ['#7a5028', 0.85] } });
    blockRect(nx, nz + 0.95, 0.95, 0.5, 0, 0.05);
    floorLamp(nx - 1.15, nz - 0.05, true);
    plant(nx + 1.15, nz - 0.05, 0.7);
    anchors.couches.push({ pos: P(nx + 0.95, nz + 0.75), facing: 0, seat: P(nx + 0.4, nz + 0.12), seatY: 0.32, napAxis: 'x' });
  }
  if (!hasRowD) { plant(-10.1, B.maxZ - 0.38); plant(-6.7, B.maxZ - 0.38); }
  plant(-15.65, 3.25); plant(-0.5, B.maxZ - 0.4);

  // =================================================================================
  // Kitchen (top-right): counter run, fridge, coffee, vending, water cooler, dining
  // =================================================================================
  {
    const wz = B.minZ + B.wallT / 2; // north wall inner face
    const kz = wz + 0.3;             // counter centre line
    const cab = { w: 0.56, h: 0.56, d: 0.6 };
    const cabTints = { wood: [pal.kitchen, 0.9], woodDark: ['#2f353a', 0.9] };
    const run = ['kitchenCabinet', 'kitchenCabinet', 'kitchenSink', 'kitchenCabinet', 'kitchenStove', 'kitchenCabinet'];
    const x0 = -0.15;
    run.forEach((n, k) => place(n, { x: x0 + k * cab.w, z: kz, w: cab.w, h: cab.h, d: cab.d, tints: cabTints }));
    const runEnd = x0 + (run.length - 0.5) * cab.w;
    blockRect(x0 - cab.w / 2 + (run.length * cab.w) / 2, kz, run.length * cab.w, cab.d, 0, 0.06);
    // upper cabinets
    for (let k = 0; k < 6; k++) if (k !== 2) place('kitchenCabinetUpper', { x: x0 + k * cab.w, z: wz + 0.15, y: 1.0, w: cab.w, d: 0.3, tints: cabTints });
    // coffee machine + microwave on the counter
    const coffeeX = x0 + cab.w;
    place('kitchenCoffeeMachine', { x: coffeeX, z: kz - 0.06, y: cab.h, h: 0.34, tints: { metalMedium: ['#2d2d38', 0.8] } });
    place('kitchenMicrowave', { x: x0 + 3 * cab.w, z: kz - 0.04, y: cab.h, w: 0.42 });
    // fridge
    const fx = runEnd + 0.36;
    place('kitchenFridge', { x: fx, z: kz, h: 1.38, w: 0.66, tints: { metalLight: ['#505a60', 0.85] } });
    blockRect(fx, kz, 0.66, 0.62, 0, 0.06);
    // vending machine (Hermes VendingMachineModel, scaled 1.45)
    const vx = -1.55;
    {
      const g = new THREE.Group(); g.position.set(vx, 0, wz + 0.21); g.scale.setScalar(1.45);
      addMesh(g, G.box(0.35, 0.8, 0.26), metalMat('#333a4d', 0.4, 0.7), 0, 0.4, 0);
      addMesh(g, G.box(0.29, 0.58, 0.01), flat('#d02525', 0.45, 0.1), 0, 0.46, 0.132);
      addMesh(g, G.plane(0.21, 0.25), M('vendBack', { color: '#0d1322', emissive: '#1c2a44', emissiveIntensity: 0.5, roughness: 0.8 }), 0, 0.57, 0.1372, { cast: false });
      const rowMat = M('vendRow', { color: '#ffe9c4', emissive: '#ffd28a', emissiveIntensity: 1.3, roughness: 0.6 }); glowRegister(rowMat, 1.1, 0.8);
      for (const ry of [0.49, 0.57, 0.65]) addMesh(g, G.plane(0.19, 0.045), rowMat, 0, ry, 0.1376, { cast: false });
      addMesh(g, G.box(0.22, 0.26, 0.004), glassMat, 0, 0.57, 0.141, { cast: false });
      addMesh(g, G.box(0.18, 0.1, 0.006), flat('#232338', 0.7), 0, 0.29, 0.138);
      addMesh(g, G.box(0.2, 0.055, 0.02), flat('#1b1b1b', 0.9), 0, 0.07, 0.132);
      statics.add(g);
      blockRect(vx, wz + 0.21, 0.52, 0.4, 0, 0.06);
    }
    // water cooler (Hermes WaterCoolerProceduralModel)
    const wcx = -0.85;
    {
      const g = new THREE.Group(); g.position.set(wcx, 0, wz + 0.2);
      const bw = 0.3, bh = 0.56, br = bw * 0.36;
      addMesh(g, G.box(bw + 0.015, 0.05, bw + 0.015), flat('#9aa0a6', 0.55, 0.3), 0, 0.025, 0);
      addMesh(g, G.box(bw, bh, bw), flat('#eceef0', 0.38, 0.06), 0, 0.05 + bh / 2, 0);
      addMesh(g, G.box(bw * 0.72, 0.1, 0.012), metalMat('#c6cacd', 0.4, 0.7), 0, 0.36, bw / 2 + 0.006);
      for (const [hc, tx] of [['#2563a8', -bw * 0.2], ['#c0392b', bw * 0.2]]) { addMesh(g, G.cyl(0.011, 0.011, 0.045, 10), metalMat('#d8dcde', 0.3, 0.8), tx, 0.47, bw / 2 + 0.02, { rx: Math.PI / 2 }); addMesh(g, G.box(0.028, 0.022, 0.018), flat(hc, 0.45), tx, 0.492, bw / 2 + 0.036); }
      addMesh(g, G.cyl(br + 0.02, bw * 0.46, 0.05, 20), flat('#dfe2e5', 0.4, 0.1), 0, 0.05 + bh + 0.02, 0);
      const bottle = M('bottle', { color: '#4aa8e0', transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0 }, THREE.MeshPhysicalMaterial);
      addMesh(g, G.cyl(br, br * 0.86, 0.26, 20), bottle, 0, 0.05 + bh + 0.175, 0, { cast: false });
      addMesh(g, G.cyl(br * 0.4, br * 0.8, 0.04, 16), bottle, 0, 0.05 + bh + 0.325, 0, { cast: false });
      statics.add(g);
      blockRect(wcx, wz + 0.2, 0.36, 0.36, 0, 0.06);
    }
    trash(-0.42, wz + 0.2);
    // dining table with 4 chairs
    const dx = 1.15, dz = -4.05;
    roundTable(dx, dz, 0.68);
    const dining = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4, sx = dx + Math.sin(a) * 1.08, sz = dz + Math.cos(a) * 1.08;
      const f = yawToward(sx, sz, dx, dz); meetChair(sx, sz, f, '#8a5a3c');
      dining.push({ pos: P(sx, sz), facing: r3(f), kind: 'table', seatY: 0.3 });
    }
    plant(3.75, -2.75);
    anchors.kitchen.push({ pos: P(coffeeX, kz + 0.75), facing: Math.PI, kind: 'coffee' });
    anchors.kitchen.push({ pos: P(fx - 0.1, kz + 0.8), facing: Math.PI, kind: 'fridge' });
    anchors.kitchen.push({ pos: P(vx, wz + 1.0), facing: Math.PI, kind: 'vending' });
    anchors.kitchen.push({ pos: P(wcx, wz + 0.85), facing: Math.PI, kind: 'water' });
    anchors.kitchen.push(...dining);
    anchors.rooms.kitchen = { minX: -2.0, minZ: B.minZ, maxX: B.gymX0, maxZ: -2.4 };
  }

  // =================================================================================
  // Break area / lounge (east of the desks): couch, beanbags, coffee table, ping-pong
  // =================================================================================
  {
    const cx = B.gymX0 - B.iwallT / 2 - 0.4, cz = 0.6;
    place('rugRectangle', { x: 2.35, z: 0.6, w: 2.4, d: 3.0, tints: { carpet: ['#b5835a', 0.85], carpetDarker: ['#8a5d3b', 0.85] } });
    place('loungeSofa', { x: cx, z: cz, rot: -Math.PI / 2, w: 1.7, tints: { carpet: pal.couch, wood: ['#4a3322', 0.7] } });
    blockRect(cx, cz, 1.7, 0.76, -Math.PI / 2, 0.06);
    anchors.couches.push({ pos: P(cx - 0.8, cz), facing: -Math.PI / 2, seat: P(cx - 0.1, cz), seatY: 0.32, napAxis: 'z' });
    place('tableCoffee', { x: 2.1, z: cz, rot: Math.PI / 2, w: 0.95, tints: { wood: ['#7a5028', 0.85] } });
    blockRect(2.1, cz, 0.95, 0.5, Math.PI / 2, 0.05);
    // beanbags (procedural, Hermes colours) facing the couch
    const beanbag = (x, z, color, facing) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = facing;
      const fm = M('bean' + color, { color, map: fabric.map, roughnessMap: fabric.roughnessMap, normalMap: fabric.normalMap, roughness: 0.9 });
      addMesh(g, G.sph(0.36, 20, 14), fm, 0, 0.2, 0, { scale: [1, 0.58, 1] });
      addMesh(g, G.sph(0.28, 18, 12), fm, 0, 0.36, -0.14, { scale: [1, 0.85, 0.7] });
      statics.add(g);
      blockCircle(x, z, 0.36);
      const [ax, az] = local(x, z, facing, 0, 0.62);
      anchors.beanbags.push({ pos: P(ax, az), facing: r3(facing), seat: P(x, z), seatY: 0.2 });
    };
    beanbag(1.25, 0.05, '#e65100', Math.PI / 2 + 0.25);
    beanbag(1.25, 1.25, '#1565c0', Math.PI / 2 - 0.25);
    floorLamp(cx + 0.05, cz - 1.2, true);
    plant(B.gymX0 - 0.35, 2.2);
    // ping-pong (Hermes PingPongTableModel)
    const px = 1.45, pz = 4.25, tw = 1.8, td = 1.08, th = 0.44;
    {
      const g = new THREE.Group(); g.position.set(px, 0, pz);
      addMesh(g, G.box(tw, 0.045, td), flat('#227d54', 0.75, 0.05), 0, th, 0);
      addMesh(g, G.box(tw + 0.02, 0.018, td + 0.02), metalMat('#e0e6ec', 0.35, 0.7), 0, th - 0.01, 0);
      const lm = flat('#ffffff', 0.4);
      const ly = th + 0.025;
      addMesh(g, G.box(tw * 0.94, 0.006, 0.02), lm, 0, ly, 0, { cast: false });
      addMesh(g, G.box(tw * 0.94, 0.006, 0.02), lm, 0, ly, td * 0.48, { cast: false });
      addMesh(g, G.box(tw * 0.94, 0.006, 0.02), lm, 0, ly, -td * 0.48, { cast: false });
      addMesh(g, G.box(0.02, 0.006, td * 0.92), lm, -tw * 0.48, ly, 0, { cast: false });
      addMesh(g, G.box(0.02, 0.006, td * 0.92), lm, tw * 0.48, ly, 0, { cast: false });
      addMesh(g, G.box(0.012, 0.11, td * 0.98), flat('#e8edf2', 0.85, 0.04, { transparent: true, opacity: 0.9 }), 0, th + 0.077, 0);
      for (const s of [-1, 1]) addMesh(g, G.box(0.02, 0.14, 0.02), metalMat('#37424d', 0.4, 0.75), 0, th + 0.06, s * td * 0.5);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) addMesh(g, G.box(0.06, th - 0.03, 0.06), metalMat('#606c78', 0.4, 0.8), sx * tw * 0.34, (th - 0.03) / 2, sz * td * 0.3);
      addMesh(g, G.box(tw * 0.7, 0.03, 0.06), metalMat('#606c78', 0.4, 0.8), 0, 0.18, 0);
      // paddles resting on the table
      for (const s of [-1, 1]) { addMesh(g, G.cyl(0.075, 0.075, 0.012, 16), flat('#b91c1c', 0.6), s * tw * 0.3, th + 0.03, s * 0.2); addMesh(g, G.box(0.03, 0.012, 0.09), flat('#7c4a2a', 0.7), s * tw * 0.3, th + 0.03, s * 0.2 + 0.11); }
      statics.add(g);
      blockRect(px, pz, tw, td, 0, 0.05);
    }
    anchors.pingpong = { sides: [{ pos: P(px - tw / 2 - 0.45, pz), facing: Math.PI / 2 }, { pos: P(px + tw / 2 + 0.45, pz), facing: -Math.PI / 2 }], table: P(px, pz), tableHeight: r3(th + 0.0225), tableSize: [tw, td] };
    anchors.rooms.lounge = { minX: -0.6, minZ: -1.8, maxX: B.gymX0, maxZ: B.maxZ };
  }

  // =================================================================================
  // Server room (bottom-left): 2 racks with blinking lights + GitHub review station
  // =================================================================================
  const ledInst = [];
  {
    const rz = B.serverZ + B.iwallT / 2 + 0.36, rw = 0.78, rd = 0.68, rh = 1.45;
    const units = 8, uh = (rh - 0.2) / units;
    const ledGeo = G.plane(0.035, 0.035);
    const ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const ledList = [];
    for (const [k, rx] of [-15.55, -14.65].entries()) {
      const g = new THREE.Group(); g.position.set(rx, 0, rz);
      addMesh(g, G.box(rw, rh, rd), metalMat('#182132', 0.45, 0.85), 0, rh / 2, 0);
      for (let u = 0; u < units; u++) {
        const y = 0.1 + uh / 2 + u * uh;
        addMesh(g, G.box(rw * 0.88, uh * 0.9, 0.02), metalMat('#27313f', 0.5, 0.7), 0, y, rd / 2 + 0.01, { cast: false });
        addMesh(g, G.plane(rw * 0.4, uh * 0.55), flat('#05070b', 0.3, 0.2), rw * 0.15, y, rd / 2 + 0.021, { cast: false });
        ledList.push([rx - rw * 0.38, y, rz + rd / 2 + 0.024, (k * 8 + u) % 5]);
        ledList.push([rx - rw * 0.3, y + 0.012, rz + rd / 2 + 0.024, 5]);
        ledList.push([rx - rw * 0.25, y - 0.008, rz + rd / 2 + 0.024, 5]);
      }
      addMesh(g, G.box(rw, rh, 0.02), M('rackGlass', { color: '#b6f6fd', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false }, THREE.MeshPhysicalMaterial), 0, rh / 2, rd / 2 + 0.04, { cast: false });
      addMesh(g, G.box(rw * 0.8, 0.02, rd * 0.8), metalMat('#27313f', 0.5, 0.75), 0, rh + 0.01, 0);
      statics.add(g);
      blockRect(rx, rz, rw, rd, 0, 0.06);
      anchors.servers.push({ pos: P(rx, rz + rd / 2 + 0.55), facing: Math.PI });
    }
    const leds = new THREE.InstancedMesh(ledGeo, ledMat, ledList.length);
    const palette5 = ['#22c55e', '#3b82f6', '#ef4444', '#eab308', '#ec4899', '#22d3ee'].map((c) => new THREE.Color(c));
    const mtx = new THREE.Matrix4();
    ledList.forEach(([x, y, z, c], k) => { mtx.makeTranslation(x, y, z); leds.setMatrixAt(k, mtx); leds.setColorAt(k, palette5[c]); ledInst.push({ base: palette5[c].clone(), blink: c === 5 || hash1(k * 13) > 0.6, rate: 2 + hash1(k * 7) * 9, phase: hash1(k * 3) * 6 }); });
    leds.castShadow = false; leds.receiveShadow = false;
    dynamic.add(leds);
    const off = new THREE.Color('#0a0f18'), col = new THREE.Color();
    let acc = 0;
    tickers.push((t, dt) => {
      acc += dt; if (acc < 0.08) return; acc = 0;
      ledInst.forEach((l, k) => { if (!l.blink) return; const on = Math.sin(t * l.rate + l.phase) + Math.sin(t * l.rate * 0.37 + k) > -0.2; leds.setColorAt(k, on ? l.base : col.copy(l.base).lerp(off, 0.85)); });
      leds.instanceColor.needsUpdate = true;
    });
    disposables.add(ledMat);
    // review terminal (Hermes ServerTerminalModel) — "GITHUB / REVIEW STATION"
    const tx = -13.25, tz = B.serverZ + B.iwallT / 2 + 0.33, tw = 0.82, td = 0.58;
    {
      const g = new THREE.Group(); g.position.set(tx, 0, tz);
      addMesh(g, G.box(tw * 0.92, 0.64, td * 0.86), metalMat('#161f30', 0.45, 0.72), 0, 0.32, 0);
      addMesh(g, G.box(tw * 0.92, 0.42, 0.06), metalMat('#161f30', 0.45, 0.72), 0, 0.84, -td * 0.25, { rx: -0.18 });
      const scr = drawLabel(kit, [{ text: 'GITHUB' }, { text: 'REVIEW STATION' }], { w: 512, h: 256, bg: '#1d4ed8', fg: '#eff6ff', glow: '#93c5fd' });
      const sm = M('reviewScreen', { color: '#000000', emissive: '#ffffff', emissiveMap: scr, emissiveIntensity: 1.1, roughness: 0.3 }); glowRegister(sm, 1.0, 0.6);
      addMesh(g, G.plane(tw * 0.78, 0.34), sm, 0, 0.84, -td * 0.25 + 0.032, { rx: -0.18, cast: false });
      addMesh(g, G.box(tw * 0.66, 0.05, 0.16), metalMat('#28374d', 0.4, 0.7), 0, 0.66, td * 0.3, { rx: 0.1 });
      statics.add(g);
      blockRect(tx, tz, tw, td, 0, 0.06);
      anchors.review = { pos: P(tx, tz + td / 2 + 0.5), facing: Math.PI };
    }
    plant(-12.65, B.maxZ - 0.35, 0.6);
    anchors.rooms.server = { minX: B.minX, minZ: B.serverZ, maxX: B.serverX, maxZ: B.maxZ };
  }

  // =================================================================================
  // Gym (east wing, left room) — Hermes machines.tsx equipment
  // =================================================================================
  {
    const gx0 = B.gymX0 + B.iwallT / 2, gx1 = B.gymX1 - B.iwallT / 2;
    const steel = metalMat('#a3b1c2', 0.35, 0.8), dark = metalMat('#27313f', 0.45, 0.75), chrome = flat('#e0e6ec', 0.08, 0.95);
    const pad = M('gymPad', { color: '#1a2438', roughnessMap: fabric.roughnessMap, normalMap: fabric.normalMap, roughness: 0.8, metalness: 0.02 });
    const make = (x, z, rot, build) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; build(g); statics.add(g); return g; };
    // treadmill: belt along local z, console at local -z; runner faces -z (local yaw PI)
    const treadmill = (x, z, rot, side) => {
      make(x, z, rot, (g) => {
        addMesh(g, G.box(0.62, 0.16, 1.3), dark, 0, 0.08, 0);
        addMesh(g, G.box(0.5, 0.03, 1.18), M('belt', { color: '#161d2b', map: fabric.map, roughness: 0.95 }), 0, 0.175, 0);
        for (const s of [-1, 1]) addMesh(g, G.box(0.05, 0.85, 0.05), steel, s * 0.28, 0.58, -0.56, { rx: -0.15 });
        addMesh(g, G.box(0.6, 0.14, 0.12), metalMat('#182132', 0.4, 0.7), 0, 1.0, -0.66, { rx: -0.5 });
        addMesh(g, G.plane(0.4, 0.07), emissive('#22d3ee', 1.9), 0, 1.0 + 0.064 * Math.sin(0.5), -0.66 + 0.064 * Math.cos(0.5), { rx: -0.5, cast: false });
        for (const s of [-1, 1]) addMesh(g, G.box(0.04, 0.04, 0.7), steel, s * 0.3, 0.82, -0.3);
      });
      blockRect(x, z, 0.62, 1.3, rot, 0.06);
      const [ux, uz] = local(x, z, rot, 0, 0.1), [ax, az] = local(x, z, rot, side * 0.63, 0.1);
      anchors.gym.push({ pos: P(ax, az), facing: r3(rot + Math.PI), kind: 'run', use: P(ux, uz), useY: 0.19 });
    };
    const bike = (x, z, rot) => { // rider faces local +z
      make(x, z, rot, (g) => {
        addMesh(g, G.box(0.24, 0.08, 0.95), metalMat('#3c4a5e', 0.4, 0.75), 0, 0.04, 0);
        addMesh(g, new THREE.TorusGeometry(0.17, 0.03, 12, 32), flat('#141f38', 0.9, 0.05), 0, 0.28, 0.25, { ry: Math.PI / 2 });
        addMesh(g, G.box(0.05, 0.62, 0.05), steel, 0, 0.36, -0.18, { rx: -0.25 });
        addMesh(g, G.box(0.2, 0.07, 0.26), pad, 0, 0.66, -0.24);
        addMesh(g, G.box(0.045, 0.8, 0.045), steel, 0, 0.5, 0.3, { rx: 0.2 });
        addMesh(g, G.box(0.36, 0.04, 0.06), chrome, 0, 0.9, 0.38);
        addMesh(g, G.plane(0.14, 0.08), emissive('#22c55e', 1.6), 0, 0.94, 0.355, { rx: -0.6, cast: false });
      });
      blockRect(x, z, 0.4, 0.95, rot, 0.06);
      const [ux, uz] = local(x, z, rot, 0, -0.22), [ax, az] = local(x, z, rot, 0.55, -0.2);
      anchors.gym.push({ pos: P(ax, az), facing: r3(rot), kind: 'bike', use: P(ux, uz), useY: 0.68 });
    };
    const bench = (x, z, rot) => { // lies along local z, head at -z; bar over the head
      make(x, z, rot, (g) => {
        addMesh(g, G.box(0.32, 0.1, 1.1), pad, 0, 0.36, 0.1);
        for (const s of [-1, 1]) addMesh(g, G.box(0.04, 0.36, 0.04), steel, 0, 0.18, s * 0.38);
        for (const s of [-1, 1]) addMesh(g, G.box(0.04, 0.95, 0.04), chrome, s * 0.36, 0.48, -0.5);
        addMesh(g, G.box(1.0, 0.035, 0.035), chrome, 0, 0.82, -0.5);
        for (const s of [-1, 1]) addMesh(g, G.cyl(0.1, 0.1, 0.05, 18), flat('#182132', 0.45, 0.6), s * 0.44, 0.82, -0.5, { rz: Math.PI / 2 });
      });
      blockRect(x, z, 0.5, 1.25, rot, 0.06);
      const [ux, uz] = local(x, z, rot, 0, 0.15), [ax, az] = local(x, z, rot, -0.62, 0.2);
      anchors.gym.push({ pos: P(ax, az), facing: r3(rot + Math.PI), kind: 'lift', use: P(ux, uz), useY: 0.41 });
    };
    const bag = (x, z) => {
      make(x, z, 0, (g) => {
        addMesh(g, G.box(0.36, 0.03, 0.36), flat('#2b3442', 0.6, 0.5), 0.36, 0.015, 0);
        addMesh(g, G.box(0.06, 1.45, 0.06), steel, 0.36, 0.74, 0);
        addMesh(g, G.box(0.42, 0.05, 0.05), steel, 0.17, 1.44, 0);
        addMesh(g, G.cyl(0.13, 0.11, 0.98, 24), M('bagMat', { color: '#cc2323', roughnessMap: fabric.roughnessMap, normalMap: fabric.normalMap, roughness: 0.75 }), 0, 0.75, 0);
        addMesh(g, G.cyl(0.008, 0.008, 0.2, 6), chrome, 0, 1.33, 0);
        addMesh(g, new THREE.RingGeometry(0.11, 0.2, 24), flat('#141f38', 0.92, 0.08), 0, 0.006, 0, { rx: -Math.PI / 2, cast: false });
      });
      blockCircle(x, z, 0.18); blockCircle(x + 0.36, z, 0.2);
      anchors.gym.push({ pos: P(x - 0.55, z), facing: Math.PI / 2, kind: 'box' });
    };
    const rack = (x, z, rot, kettle) => {
      make(x, z, rot, (g) => {
        const w = 1.3;
        addMesh(g, G.box(w * 0.9, 0.05, 0.3), metalMat('#59636f', 0.4, 0.8), 0, 0.3, 0);
        if (!kettle) addMesh(g, G.box(w * 0.84, 0.05, 0.3), metalMat('#78828c', 0.4, 0.8), 0, 0.55, -0.04);
        for (const s of [-1, 1]) addMesh(g, G.box(0.04, kettle ? 0.3 : 0.58, 0.04), steel, s * w * 0.42, kettle ? 0.15 : 0.29, 0);
        for (let k = 0; k < 6; k++) {
          const xx = (-0.5 + k / 5) * w * 0.8;
          if (kettle) { addMesh(g, G.sph(0.06, 14, 10), flat('#182132', 0.5, 0.6), xx, 0.39, 0); addMesh(g, new THREE.TorusGeometry(0.03, 0.008, 8, 16), chrome, xx, 0.45, 0, { cast: false }); }
          else for (const yy of [0.34, 0.59]) addMesh(g, G.cyl(0.04, 0.04, 0.2, 14), flat('#182132', 0.55, 0.6), xx, yy, 0, { rx: Math.PI / 2 });
        }
      });
      blockRect(x, z, 1.3, 0.34, rot, 0.06);
    };
    const mat = (x, z, color) => { const m = addMesh(statics, G.box(0.68, 0.02, 1.3), M('mat' + color, { color, roughnessMap: fabric.roughnessMap, normalMap: fabric.normalMap, roughness: 0.95 }), x, 0.011, z, { cast: false }); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; addMesh(statics, G.cyl(0.05, 0.05, 0.66, 14), flat('#141f38', 0.9), x, 0.05, z - 0.62, { rz: Math.PI / 2 }); };
    treadmill(4.75, -5.25, Math.PI, -1);
    treadmill(6.55, -5.25, Math.PI, 1);
    bench(5.15, -3.15, 0);
    rack(gx1 - 0.25, -3.3, -Math.PI / 2, false);
    bike(4.75, -1.4, Math.PI / 2);
    bike(4.75, 0.0, Math.PI / 2);
    bag(6.5, 1.0);
    bag(6.5, 2.5);
    rack(gx1 - 0.25, 3.9, -Math.PI / 2, true);
    mat(4.8, 2.4, '#0f766e'); mat(4.8, 3.85, '#7c3aed');
    plant(gx1 - 0.3, 4.65, 0.62);
    anchors.rooms.gym = { minX: B.gymX0, minZ: B.minZ, maxX: B.gymX1, maxZ: B.wingZ1 };
  }

  // =================================================================================
  // QA lab (east wing, right room) — Hermes QaTerminal / DeviceRack / TestBench
  // =================================================================================
  {
    const qx0 = B.qaX0 + B.iwallT / 2, qx1 = B.maxX - B.wallT / 2;
    const purple = metalMat('#170a24', 0.45, 0.65);
    // QA terminal against the north wall
    const tx = 9.75, tz = B.minZ + B.wallT / 2 + 0.3, tw = 1.1, td = 0.56;
    {
      const g = new THREE.Group(); g.position.set(tx, 0, tz);
      addMesh(g, G.box(tw, 0.74, td * 0.88), purple, 0, 0.37, 0);
      addMesh(g, G.box(tw * 0.94, 0.04, td * 0.9), metalMat('#2a163f', 0.4, 0.7), 0, 0.58, 0.02);
      const scrA = drawLabel(kit, [{ text: 'QA LAB' }, { text: 'TEST CONSOLE' }], { w: 512, h: 256, bg: '#4c1d95', fg: '#faf5ff', glow: '#c084fc' });
      [[-tw * 0.22, scrA, '#8b5cf6'], [tw * 0.22, null, '#38bdf8']].forEach(([x, map, col], k) => {
        addMesh(g, G.box(tw * 0.42, 0.3, 0.03), metalMat('#111827', 0.5, 0.5), x, 0.95, -0.05, { rx: -0.16 });
        const m = map ? M('qaScr0', { color: '#000000', emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 1.1 }) : M('qaScr1', { color: col, emissive: col, emissiveIntensity: 1.2 });
        glowRegister(m, 1.0, 0.6);
        addMesh(g, G.plane(tw * 0.38, 0.26), m, x, 0.95, -0.033, { rx: -0.16, cast: false });
        void k;
      });
      for (const s of [-1, 1]) addMesh(g, G.box(0.03, 0.64, 0.03), emissive('#8b5cf6', 1.5), s * tw * 0.46, 0.4, td * 0.42, { cast: false });
      addMesh(g, G.box(tw * 0.6, 0.04, 0.16), metalMat('#2b1642', 0.4, 0.6), 0, 0.62, td * 0.3);
      statics.add(g);
      blockRect(tx, tz, tw, td, 0, 0.06);
      anchors.qa.push({ pos: P(tx, tz + td / 2 + 0.5), facing: Math.PI, kind: 'terminal' });
    }
    // device racks on the east wall, facing west
    for (const rz of [-4.45, -3.0]) {
      const rx = qx0 + 0.36, w = 1.26, d = 0.6;
      const g = new THREE.Group(); g.position.set(rx, 0, rz); g.rotation.y = Math.PI / 2;
      addMesh(g, G.box(w, 1.0, d * 0.92), metalMat('#152036', 0.45, 0.8), 0, 0.5, 0);
      [-0.36, 0, 0.36].forEach((ox, ci) => [0.24, 0.48, 0.72].forEach((oy, ri) => {
        addMesh(g, G.box(w * 0.22, 0.16, 0.03), flat('#111827', 0.5), ox, oy, d * 0.46 + 0.01, { cast: false });
        const col = ri === 1 ? '#22c55e' : ci === 1 ? '#8b5cf6' : '#38bdf8';
        addMesh(g, G.plane(w * 0.16, 0.09), emissive(col, 1.7), ox, oy, d * 0.46 + 0.027, { cast: false });
      }));
      for (const s of [-1, 1]) addMesh(g, G.box(0.02, 0.96, d * 0.94), emissive('#22d3ee', 1.5), s * w * 0.48, 0.5, 0, { cast: false });
      const lab = drawLabel(kit, [{ text: 'DEVICES' }], { w: 256, h: 64, bg: '#0f172a', fg: '#e0f2fe' });
      addMesh(g, G.plane(0.5, 0.125), new THREE.MeshStandardMaterial({ map: lab, roughness: 0.6 }), 0, 1.08, d * 0.3, { cast: false });
      statics.add(g);
      blockRect(rx, rz, w, d, Math.PI / 2, 0.06);
      anchors.qa.push({ pos: P(rx + d / 2 + 0.5, rz), facing: -Math.PI / 2, kind: 'devices' });
    }
    // test benches (agents stand on the north side, facing the camera)
    for (const bz of [0.6, 2.9]) {
      const bx = 9.85, w = 1.7, d = 0.76;
      const g = new THREE.Group(); g.position.set(bx, 0, bz);
      addMesh(g, G.box(w, 0.06, d), flat('#3a3696', 0.62, 0.14), 0, 0.5, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) addMesh(g, G.box(0.05, 0.5, 0.05), metalMat('#8a929c', 0.35, 0.8), sx * w * 0.44, 0.25, sz * d * 0.38);
      addMesh(g, G.box(w * 0.24, 0.16, 0.025), flat('#182132', 0.5), -w * 0.2, 0.62, 0.15, { ry: Math.PI });
      addMesh(g, G.plane(w * 0.2, 0.11), emissive('#38bdf8', 1.7), -w * 0.2, 0.62, 0.136, { ry: Math.PI, cast: false });
      addMesh(g, G.box(0.11, 0.02, 0.16), metalMat('#182132', 0.4, 0.75), w * 0.12, 0.54, 0.05, { ry: 0.16 });
      addMesh(g, G.box(0.13, 0.02, 0.08), metalMat('#27313f', 0.4, 0.75), w * 0.3, 0.54, -0.12, { ry: 0.3 });
      addMesh(g, G.plane(0.1, 0.05), emissive('#22d3ee', 1.8), w * 0.3, 0.551, -0.12, { rx: -Math.PI / 2, cast: false });
      addMesh(g, G.cyl(0.018, 0.024, 0.18, 12), flat('#dbe2ea', 0.15, 0.9), -w * 0.4, 0.62, 0.18);
      statics.add(g);
      blockRect(bx, bz, w, d, 0, 0.06);
      for (const ox of [-0.42, 0.42]) anchors.qa.push({ pos: P(bx + ox, bz - d / 2 - 0.45), facing: 0, kind: 'bench' });
    }
    plant(qx0 + 0.3, 4.65, 0.62); plant(qx1 - 0.3, 4.65, 0.62);
    anchors.rooms.qa = { minX: B.qaX0, minZ: B.minZ, maxX: B.maxX, maxZ: B.wingZ1 };
  }

  // =================================================================================
  // Dust motes (Hermes DustMotes) — not on low quality
  // =================================================================================
  if (quality !== 'low') {
    const N = 220, pos = new Float32Array(N * 3), sp = new Float32Array(N), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = CX + (hash1(i * 3 + 1) - 0.5) * W * 0.9; pos[i * 3 + 1] = 0.15 + hash1(i * 3 + 2) * 2.1; pos[i * 3 + 2] = CZ + (hash1(i * 3 + 3) - 0.5) * D * 0.9; sp[i] = 0.02 + hash1(i * 5 + 4) * 0.05; ph[i] = hash1(i * 7 + 5) * Math.PI * 2; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: '#ffe9c4', size: 0.032, sizeAttenuation: true, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; dynamic.add(pts);
    tickers.push((t, dt) => {
      const a = geo.attributes.position.array, k = Math.min(dt, 0.1) * 60;
      for (let i = 0; i < N; i++) { let y = a[i * 3 + 1] + sp[i] * 0.016 * k; if (y > 2.4) y = 0.15; a[i * 3 + 1] = y; a[i * 3] += Math.sin(t * 0.3 + ph[i]) * 0.0006 * k; a[i * 3 + 2] += Math.cos(t * 0.24 + ph[i]) * 0.0006 * k; }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // =================================================================================
  // Wander points, doors list, bounds; validation
  // =================================================================================
  const bounds = { minX: B.minX, minZ: B.minZ, maxX: B.maxX, maxZ: B.outsideZ };
  const inBlocker = (x, z, margin = 0) => blockers.some((b) => {
    if (b.kind === 'circle') return Math.hypot(x - b.x, z - b.z) < b.r + margin;
    const c = Math.cos(b.rotY), s = Math.sin(b.rotY), dx = x - b.x, dz = z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // inverse of rotation.y
    return Math.abs(lx) < b.w / 2 + b.pad + margin && Math.abs(lz) < b.d / 2 + b.pad + margin;
  });
  {
    const cand = [[-8.2, 1.2], [-4.5, 1.2], [-12, 1.2], [-1.0, 1.2], [-8.2, -2.2], [-4.2, -2.6], [-12.4, -1.6], [-1.2, -3.0], [0.5, -2.6],
      [2.6, -1.7], [0.2, 2.6], [2.9, 2.8], [-0.5, 5.7], [3.2, 5.8], [5.6, 5.8], [7.7, 0.0], [7.7, -4.5], [7.7, 3.5], [5.7, -2.0], [5.4, 0.9],
      [9.4, -1.6], [10.0, -3.3], [9.9, 4.3], [-14.0, 5.2], [-8.0, 4.3], [-2.0, 4.6], [-5.6, -5.4], [-3.95, 7.6], [-1.5, 8.0], [-13.6, -1.3]];
    anchors.wander = cand.filter(([x, z]) => !inBlocker(x, z, 0.3)).map(([x, z]) => P(x, z));
  }
  anchors.doors = doors.map((d) => ({ id: d.label, pos: P(d.cx, d.cz), axis: d.axis, width: r3(d.half * 2) }));
  {
    const pts = [];
    const push = (name, p) => p && pts.push([name, p]);
    push('entrance', anchors.entrance.pos);
    anchors.desks.forEach((d) => push(d.id, d.seat));
    anchors.meeting.seats.forEach((s, i) => push('meeting' + i, s.pos));
    push('review', anchors.review.pos);
    ['qa', 'servers', 'kitchen', 'couches', 'beanbags', 'gym'].forEach((k) => anchors[k].forEach((a, i) => push(k + i, a.pos)));
    anchors.pingpong.sides.forEach((s, i) => push('pingpong' + i, s.pos));
    const bad = pts.filter(([, [x, z]]) => inBlocker(x, z, 0) || x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ);
    if (bad.length) console.warn('[office] anchors inside blockers:', bad.map(([n]) => n).join(', '));
  }

  // =================================================================================
  // Bake statics: merge meshes by material so the whole office is a few draw calls
  // =================================================================================
  statics.updateMatrixWorld(true);
  const buckets = new Map();
  const leftovers = [];
  statics.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) { if (o.isMesh) leftovers.push(o); return; }
    const g = o.geometry, attrs = Object.keys(g.attributes).sort().join(',');
    const key = o.material.uuid + '|' + attrs + '|' + (g.index ? 'i' : 'n') + '|' + o.castShadow + o.receiveShadow;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    const gg = g.clone(); gg.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0) { /* mirrored: flip winding */ const idx = gg.index; if (idx) { for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } } }
    for (const k of Object.keys(gg.morphAttributes)) delete gg.morphAttributes[k];
    buckets.get(key).geos.push(gg);
  });
  const baked = new THREE.Group(); baked.name = 'office-static';
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) { console.warn('[office] merge failed for a material bucket'); continue; }
    if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, b.mat); m.castShadow = b.cast; m.receiveShadow = b.receive;
    m.matrixAutoUpdate = false; baked.add(m);
  }
  for (const o of leftovers) { o.updateWorldMatrix(true, false); const c = o.clone(); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); baked.add(c); }
  // free the unmerged source geometry (shared geometry cache + GLB templates)
  group.add(baked, dynamic);

  // =================================================================================
  // Runtime
  // =================================================================================
  const applyGlow = () => {
    for (const g of glowMats) g.mat.emissiveIntensity = g.base + g.gain * glow;
    poolMat.opacity = 0.42 * glow;
    for (const s of screenMats) s.mat.userData.base = 0.85 + glow * 0.75;
    for (const l of lampLights) l.l.intensity = l.max * glow;
  };
  applyGlow();

  const update = (t, dt = 0.016, agentPositions = []) => {
    for (const d of doors) {
      let near = false;
      for (const p of agentPositions) {
        if (!p) continue;
        const along = d.axis === 'x' ? p[0] - d.cx : p[1] - d.cz, across = d.axis === 'x' ? p[1] - d.cz : p[0] - d.cx;
        if (Math.abs(along) <= d.half + 0.25 && Math.abs(across) <= 0.95) { near = true; break; }
      }
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 7);
      for (const lf of d.leaves) lf.pivot.rotation.y = lf.sign * d.open * Math.PI * 0.5;
    }
    for (let i = 0; i < screenMats.length; i++) {
      const s = screenMats[i];
      s.tex.offset.y = (s.tex.offset.y + dt * s.speed) % 1;
      const flick = 0.95 + 0.05 * Math.sin(t * 9 + s.phase) * Math.sin(t * 2.3 + s.phase * 2);
      s.mat.emissiveIntensity = (s.mat.userData.base ?? 1) * flick;
    }
    for (const fn of tickers) fn(t, dt);
  };

  const setTimeOfDay = (phase) => { glow = GLOW[phase] ?? GLOW.afternoon; applyGlow(); };

  const dispose = () => {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => disposables.add(m));
    });
    for (const g of geoCache.values()) g.dispose();
    for (const m of matCache.values()) disposables.add(m);
    for (const m of disposables) { for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k]) m[k].dispose(); m.dispose(); }
    kit.all.forEach((t) => t.dispose());
    for (const e of Object.values(models)) e.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    group.clear();
  };

  return { group, anchors, blockers, bounds, update, setTimeOfDay, dispose };
}
