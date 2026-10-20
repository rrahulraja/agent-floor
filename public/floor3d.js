// The 3D floor. Draws the same floor as the flat themes (same desks, same walking, same name tags) as a small
// diorama: Three.js for the room and characters, and the theme's animated wall.svg placed in 3D with CSS so its
// animations keep running. Characters are built from shapes, from the theme's cast data (model.json), so a theme
// needs no 3D models. The page drives this module through window.Floor3D (see index.html).
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from '/vendor/CSS3DRenderer.js';

const WALL_H = 46;          // back wall height, in floor units
const SEAT = 8;             // hip height when sitting
const STAND = 12;           // hip height when standing
const TAU = Math.PI * 2;

// ---------- shared geometry + materials ----------
const geos = new Map(), mats = new Map();
const geo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };
const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
function mat(color, o = {}) {
  const key = `${color}|${o.glow ? 1 : 0}|${o.opacity ?? 1}|${o.side ?? 0}|${o.metal ? 1 : 0}`;
  if (!mats.has(key)) {
    const p = { color: new THREE.Color(color), transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide };
    mats.set(key, o.glow ? new THREE.MeshBasicMaterial(p) : o.metal ? new THREE.MeshStandardMaterial({ ...p, metalness: 0.6, roughness: 0.35 }) : new THREE.MeshToonMaterial({ ...p, gradientMap: toonRamp }));
  }
  return mats.get(key);
}
// A fresh material, for things that fade or pulse on their own.
const ownMat = (color, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: o.opacity ?? 1, depthWrite: false });

const G = {
  box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  ball: (r, ws = 16, hs = 12) => geo(`s${r},${ws}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cap: (r, frac = 0.55) => geo(`c${r},${frac}`, () => new THREE.SphereGeometry(r, 18, 12, 0, TAU, 0, Math.PI * frac)),
  cyl: (rt, rb, h, seg = 16, open = false) => geo(`y${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  cone: (r, h, seg = 14) => geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  pill: (r, len) => geo(`p${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12)),
  ring: (r, tube, arc = TAU) => geo(`r${r},${tube},${arc}`, () => new THREE.TorusGeometry(r, tube, 8, 24, arc)),
  disc: (r) => geo(`d${r}`, () => new THREE.CircleGeometry(r, 20)),
  plane: (w, h) => geo(`q${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
};

// mesh(geometry, colour, {x,y,z, rx,ry,rz, s|sx,sy,sz, glow, opacity, metal, side, shadow})
function mesh(g, color, o = {}) {
  const m = new THREE.Mesh(g, o.material || mat(color, o));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.s) m.scale.setScalar(o.s);
  if (o.sx || o.sy || o.sz) m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
  if (o.shadow !== false && !o.glow) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}
const group = (...kids) => { const g = new THREE.Group(); for (const k of kids) if (k) g.add(k); return g; };
const at = (obj, x, y, z, rx = 0, ry = 0, rz = 0) => { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; };
function shade(hex, f) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  return `#${c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + f))).getHexString()}`;
}
function extruded(shape, depth, key) { return geo(key, () => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })); }
function starShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return s;
}
function boltShape(r) {
  const s = new THREE.Shape();
  [[0.2, 1], [-0.5, -0.05], [0, -0.05], [-0.25, -1], [0.55, 0.15], [0.05, 0.15]].forEach(([x, y], i) => (i ? s.lineTo(x * r, y * r) : s.moveTo(x * r, y * r)));
  return s;
}

// Text in a rounded box, as a sprite (bubbles and z's).
const texCache = new Map();
function labelTexture(text, fill, ink, border = '#1E2235') {
  const key = `${text}|${fill}|${ink}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 96; c.height = 72;
  const x = c.getContext('2d');
  if (fill) {
    x.fillStyle = fill; x.strokeStyle = border; x.lineWidth = 5;
    x.beginPath(); x.roundRect(5, 5, 86, 56, 18); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(30, 58); x.lineTo(22, 70); x.lineTo(44, 58); x.fill();
  }
  x.fillStyle = ink; x.font = '700 44px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 48, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t); return t;
}
function sprite(tex, w, h) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(w, h, 1); return s; }

// An image file from the theme (SVG) drawn into a texture. `fresh` gives a texture of its own (for repeat settings).
const imgTex = new Map();
function imageTexture(url, size = 128, fresh = false) {
  if (!fresh && imgTex.has(url)) return imgTex.get(url);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // SVGs with only a viewBox have no size of their own and won't draw, so give them one first
  fetch(url).then((r) => r.text()).then((text) => {
    const svg = text.replace(/<svg\b([^>]*)>/, (m, attrs) => (/\swidth=/.test(attrs) ? m : `<svg width="${size}" height="${size}"${attrs}>`));
    const img = new Image();
    img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, size, size); t.needsUpdate = true; URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }).catch((e) => console.warn('floor3d: could not load', url, e));
  if (!fresh) imgTex.set(url, t);
  return t;
}

// ---------- characters ----------
// Builds one character from a cast entry (the same data the flat SVGs are made from).
// Origin is the floor under the hips; the character faces +z (towards the camera).
function buildCharacter(c, { sitting, scale = 1 } = {}) {
  const skin = c.skin || '#F2C9A0';
  const o = c.outfit || {};
  const kind = c.head || 'human';
  const root = new THREE.Group();
  const P = { root, anims: [], props: [] };
  root.userData.parts = P;

  if (kind === 'dome') return droid(c, P, scale);
  if (kind === 'hat-only') return talkingHat(c, P, scale);

  const body = new THREE.Group(); root.add(body); P.body = body;
  const hip = sitting ? SEAT : STAND;
  body.position.y = hip; P.hip = hip;
  const col = o.style === 'bare' ? (kind === 'human' ? skin : c.bodySkin || c.fur || skin) : o.color || '#3B6FD8';
  const acc = o.accent || shade(col, -0.15);
  const handSkin = kind === 'human' ? skin : c.handSkin || c.fur || skin;
  const sleeve = o.style === 'bare' ? handSkin : col;

  // legs: thighs forward when sitting, straight down when standing
  const pants = o.style === 'bare' || o.style === 'robe' ? o.color || '#3A3F55' : shade(col, -0.22);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 2.6, 0, 0);
    if (sitting) {
      leg.add(mesh(G.pill(2.1, 4), pants, { z: 3.5, rx: Math.PI / 2 }));
      leg.add(mesh(G.pill(1.9, 4), pants, { z: 7, y: -4.3 }));
      leg.add(mesh(G.box(3.4, 1.6, 4.6), '#2A2D3A', { z: 7.8, y: -7.3 }));
    } else {
      leg.add(mesh(G.pill(2.1, 7), pants, { y: -5.2 }));
      leg.add(mesh(G.box(3.4, 1.6, 4.6), '#2A2D3A', { y: -11.2, z: 0.8 }));
    }
    body.add(leg);
    P[side < 0 ? 'legL' : 'legR'] = leg;
  }

  // torso
  const torso = new THREE.Group(); body.add(torso); P.torso = torso;
  torso.add(mesh(G.pill(5.2, 3.6), col, { y: 6.8, sz: 0.72 }));
  outfitDetails(torso, o, col, acc, skin, c);
  if (c.necklace) torso.add(mesh(G.ring(3, 0.5), c.necklace, { y: 11.6, z: 1.4, rx: 1.15 }));
  if (c.thread) torso.add(mesh(G.box(0.5, 13, 0.4), '#FFF7E8', { y: 7, z: 3.85, rz: 0.75 }));
  if (c.emblem) torso.add(emblem(c.emblem));
  if (c.cape) { const cape = capeMesh(c.cape.color || '#C8352E'); body.add(cape); P.cape = cape; }

  // arms (pivot at the shoulder; the hand is the arm's child so held things follow it)
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 6.4, 11, 0);
    arm.add(mesh(G.pill(1.8, 5.5), sleeve, { y: -4.3 }));
    const hand = mesh(G.ball(1.9), handSkin, { y: -9.3 });
    arm.add(hand);
    body.add(arm);
    P[side < 0 ? 'armL' : 'armR'] = arm; P[side < 0 ? 'handL' : 'handR'] = hand;
  }

  // head
  const head = new THREE.Group(); head.position.y = 19; body.add(head); P.head = head;
  head.add(mesh(G.cyl(1.9, 2.2, 3), shade(skin, -0.05), { y: -5 }));
  buildHead(c, head, P);

  if (c.prop) addProp(c.prop, P);
  setPose(P, c.pose || 'down');
  root.scale.setScalar(scale);
  return root;
}

function outfitDetails(t, o, col, acc, skin, c) {
  const front = 3.85;
  switch (o.style) {
    case 'robe': t.add(mesh(G.box(1.3, 11, 0.5), acc, { y: 6, z: front })); t.add(mesh(G.cone(2.4, 3.2, 3), acc, { y: 11.4, z: front - 0.2, rx: Math.PI, sz: 0.3 })); break;
    case 'shawl': t.add(mesh(G.box(3, 15, 0.6), acc, { y: 6.5, z: front, rz: 0.75 })); break;
    case 'armor':
      t.add(mesh(G.box(8.4, 7, 1.2), acc, { y: 6.5, z: front - 0.2 }));
      t.add(mesh(G.ball(2.6), acc, { x: -5.6, y: 10.5 })); t.add(mesh(G.ball(2.6), acc, { x: 5.6, y: 10.5 })); break;
    case 'jacket':
      t.add(mesh(G.box(3, 9.5, 0.5), o.inner || '#F4F1E8', { y: 7, z: front }));
      t.add(mesh(G.ball(0.5), acc, { y: 4.5, z: front + 0.3 })); t.add(mesh(G.ball(0.5), acc, { y: 2.5, z: front + 0.3 })); break;
    case 'tunic': t.add(mesh(G.cyl(5.35, 5.35, 1.4, 20), acc, { y: 2.8, sz: 0.74 })); break;
    case 'bare':
      t.add(mesh(G.box(2.4, 15, 0.6), acc, { y: 6.5, z: front, rz: 0.8 }));
      t.add(mesh(G.cyl(5.4, 5.6, 3.6, 20), o.color || '#C8352E', { y: 1.4, sz: 0.76 })); break;
    case 'cloak':
      t.add(mesh(G.cap(6.2, 0.62), acc, { y: 6.4, z: -0.4, sz: 0.8, rx: Math.PI })); break;
    default: break;
  }
}

function emblem(e) {
  const r = 1.7, col = e.color || '#E8B830';
  let m;
  if (e.shape === 'circle') m = mesh(G.cyl(r, r, 0.4, 20), col, { rx: Math.PI / 2 });
  else if (e.shape === 'diamond') m = mesh(G.box(r * 1.4, r * 1.4, 0.4), col, { rz: Math.PI / 4 });
  else m = mesh(extruded(e.shape === 'bolt' ? boltShape(r) : starShape(r), 0.4, `em-${e.shape}`), col, {});
  return at(group(m), 0, 9.6, 3.9);
}

function capeMesh(color) {
  // half a cone, open, hanging from the shoulders down the back
  const g = geo('cape', () => new THREE.CylinderGeometry(5.6, 9.5, 17, 18, 4, true, Math.PI / 2, Math.PI));
  const m = mesh(g, color, { side: THREE.DoubleSide });
  m.position.set(0, 3.4, -0.6);
  const pivot = group(m); pivot.position.set(0, 12, -1); m.position.y = -8.6;
  return pivot;
}

function eyes(P, y, z, spread = 2.1, r = 0.8, white = false) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    if (white) g.add(mesh(G.ball(r * 1.7), '#FFFFFF', { x: s * spread, y, z: z - 0.4 }));
    g.add(mesh(G.ball(r), '#1E2235', { x: s * spread, y, z: z + (white ? 0.9 : 0) }));
  }
  P.eyes = g; return g;
}

function buildHead(c, head, P) {
  const skin = c.skin || '#F2C9A0';
  const kind = c.head || 'human';
  const f = c.face || {};
  if (kind === 'elephant') {
    head.add(mesh(G.ball(6.3), skin));
    for (const s of [-1, 1]) {
      const ear = group(mesh(G.disc(5.6), shade(skin, 0.06), { side: THREE.DoubleSide }), mesh(G.disc(4), '#E98A87', { z: 0.1, side: THREE.DoubleSide }));
      at(ear, s * 6.8, 0.5, -1, 0, s * 0.5, 0); head.add(ear); P.anims.push((t) => { ear.rotation.y = s * (0.5 + 0.15 * Math.sin(t * 2.2)); });
    }
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -1, 5.4), new THREE.Vector3(0.3, -5, 7), new THREE.Vector3(1.2, -9, 6.6), new THREE.Vector3(3, -10, 8)]);
    const trunk = mesh(geo('trunk', () => new THREE.TubeGeometry(curve, 20, 1.6, 10)), shade(skin, -0.04));
    const tg = group(trunk); head.add(tg); P.anims.push((t) => { tg.rotation.z = 0.12 * Math.sin(t * 1.6); });
    for (const s of [-1, 1]) head.add(mesh(G.cone(0.7, 3.4), '#FFFDF5', { x: s * 2.6, y: -3.4, z: 5.2, rx: 2.2 }));
    head.add(eyes(P, 1, 5.6, 2.6, 0.75));
  } else if (kind === 'monkey' || kind === 'bear') {
    const fur = c.fur || (kind === 'bear' ? '#4A3426' : '#B5733A');
    head.add(mesh(G.ball(kind === 'bear' ? 6 : 5.6), fur));
    for (const s of [-1, 1]) head.add(mesh(G.ball(kind === 'bear' ? 2.2 : 2), fur, kind === 'bear' ? { x: s * 4.2, y: 4.6 } : { x: s * 5.8, y: 0.5 }));
    head.add(mesh(G.ball(3.4), kind === 'bear' ? '#C9A27A' : c.muzzle || '#F2C9A0', { y: -1.6, z: 3.6, sx: 1.2, sz: 0.8 }));
    head.add(mesh(G.ball(0.9), '#1E2235', { y: -0.6, z: 6.3, sx: 1.4 }));
    head.add(eyes(P, 1.4, 5.1, 2.2, 0.75));
  } else if (kind === 'bird') {
    const fe = c.fur || '#5A4A3A';
    head.add(mesh(G.ball(5.6), fe));
    if (c.bald) head.add(mesh(G.cap(5.75, 0.3), '#E8A27A'));
    head.add(mesh(G.cone(1.4, 3.6), '#E8B830', { y: -1.8, z: 6.2, rx: Math.PI / 2 }));
    head.add(eyes(P, 1.2, 4.6, 2.3, 0.9, true));
    if (c.tufts) for (const s of [-1, 1]) head.add(mesh(G.cone(1.1, 3.4), fe, { x: s * 3.4, y: 5.4, rz: -s * 0.4 }));
  } else if (kind === 'gold') {
    const g = c.color || '#D4A84A';
    head.add(mesh(G.ball(5.6), g, { sy: 1.1, metal: true }));
    for (const s of [-1, 1]) head.add(mesh(G.ball(1.2), '#FFE27A', { x: s * 2.2, y: 0.6, z: 5.1, glow: true }));
    head.add(mesh(G.box(3.6, 0.6, 0.4), shade(g, -0.25), { y: -2.6, z: 5.3 }));
    P.eyes = null;
  } else {
    head.add(mesh(G.ball(5.5), skin));
    face(f, head, P);
    hair(c.hair, head, P, skin);
    beard(c.beard, head);
    if (c.feather) head.add(feather());
    if (c.earrings) for (const s of [-1, 1]) head.add(mesh(G.ball(0.7), c.earrings, { x: s * 5.3, y: -2.6, z: 0.6 }));
  }
  if (c.mask) head.add(mesh(G.cyl(5.62, 5.62, 2.4, 24, true), c.mask.color || '#1E2235', { y: 0.4, side: THREE.DoubleSide }));
  if (c.wear) headwear(c.wear, head);
}

function face(f, head, P) {
  const style = f.eyes || 'smile';
  if (style === 'closed') {
    for (const s of [-1, 1]) head.add(mesh(G.ring(0.85, 0.22, Math.PI), '#1E2235', { x: s * 2.1, y: 0.6, z: 5.2, rz: Math.PI }));
    P.eyes = null;
  } else head.add(eyes(P, 0.4, 5.25, 2.1, style === 'wide' ? 0.7 : 0.75, style === 'wide'));
  if (style === 'focus') for (const s of [-1, 1]) head.add(mesh(G.box(2.2, 0.45, 0.4), '#1E2235', { x: s * 2.1, y: 2.3, z: 5 }));
  if (style === 'stern') for (const s of [-1, 1]) head.add(mesh(G.box(2.3, 0.5, 0.4), '#1E2235', { x: s * 2.1, y: 2.4, z: 4.95, rz: s * 0.35 }));
  const mouth = f.mouth || 'smile';
  if (mouth === 'smile') head.add(mesh(G.ring(1.4, 0.25, Math.PI), '#1E2235', { y: -1.9, z: 5.15, rz: Math.PI }));
  if (mouth === 'flat') head.add(mesh(G.box(2.6, 0.45, 0.4), '#1E2235', { y: -2.2, z: 5.1 }));
  if (mouth === 'o') head.add(mesh(G.ring(0.6, 0.25), '#1E2235', { y: -2.2, z: 5.15 }));
  if (f.cheeks !== false) for (const s of [-1, 1]) head.add(mesh(G.ball(1.1), '#E86A8F', { x: s * 3.3, y: -1.2, z: 4.3, sz: 0.4, opacity: 0.45 }));
  if (f.tilak) head.add(mesh(G.box(0.6, 1.6, 0.3), f.tilak === 'ash' ? '#F4F1E8' : '#D8343A', { y: 3.6, z: 5.1 }));
  if (f.glasses === 'round') for (const s of [-1, 1]) head.add(mesh(G.ring(1.6, 0.22), '#3A3F55', { x: s * 2.1, y: 0.4, z: 5.5 }));
  if (f.glasses === 'half') for (const s of [-1, 1]) head.add(mesh(G.ring(1.5, 0.22, Math.PI), '#C9A15A', { x: s * 2.1, y: 0.2, z: 5.5, rz: Math.PI }));
  if (f.glasses === 'visor') head.add(mesh(G.box(8.6, 2.4, 0.8), '#5CC7F2', { y: 0.5, z: 5.1, opacity: 0.75 }));
  if (f.scar) head.add(mesh(G.box(0.4, 2.6, 0.3), '#C8352E', { x: 2.2, y: 3, z: 5, rz: 0.4 }));
}

function hair(h, head, P, skin) {
  if (!h || h.style === 'none') return;
  const c = h.color || '#2B1D14';
  const cap = (r = 5.85, frac = 0.5) => mesh(G.cap(r, frac), c, { rx: -0.35, y: 0.3 });
  switch (h.style) {
    case 'long': head.add(cap()); head.add(mesh(G.box(10.4, 10, 2.4), c, { y: -3.5, z: -3.6 })); break;
    case 'bun': head.add(cap()); head.add(mesh(G.ball(2.4), c, { y: 5, z: -3 })); break;
    case 'topknot': head.add(cap()); head.add(mesh(G.ball(1.9), c, { y: 6.6 })); break;
    case 'curly': for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; head.add(mesh(G.ball(2.4), c, { x: Math.cos(a) * 4, y: 3.6 + (i % 2), z: Math.sin(a) * 3.4 - 0.8 })); } head.add(mesh(G.ball(3), c, { y: 5 })); break;
    case 'pony': head.add(cap()); head.add(mesh(G.pill(1.4, 5), c, { y: -1, z: -6.2, rx: 0.4 })); break;
    case 'buzz': head.add(cap(5.65, 0.45)); break;
    case 'fluffy': head.add(cap(6.6, 0.52)); for (const s of [-1, 0, 1]) head.add(mesh(G.ball(2.2), c, { x: s * 2.6, y: 4.6, z: 3 })); break;
    default: head.add(cap());
  }
}

function beard(b, head) {
  if (!b) return;
  const c = b.color || '#F2F2F2';
  if (b.style === 'long') head.add(mesh(G.cone(4.4, 10, 16), c, { y: -6, z: 2.6, rx: Math.PI }));
  else if (b.style === 'mustache') head.add(mesh(G.box(3.8, 0.9, 0.9), c, { y: -1, z: 5.3 }));
  else head.add(mesh(G.cap(5.75, 0.5), c, { y: -0.6, z: 0.4, rx: Math.PI + 0.5 }));
}

function feather() {
  const g = group(
    mesh(G.ball(1.6), '#1E8E5A', { sy: 2.8, sz: 0.4 }),
    mesh(G.ball(1.1), '#1DA1A0', { sy: 2, sz: 0.5, z: 0.2 }),
    mesh(G.ball(0.6), '#1C3F9E', { y: 0.6, z: 0.5 }),
  );
  return at(g, 3, 8.6, -1, 0, 0, -0.35);
}

function headwear(w, head) {
  const c = w.color || '#E8B830', gem = w.gem || '#D8343A';
  const gemAt = (y, z = 5.5) => mesh(G.ball(0.9), gem, { y, z });
  switch (w.type) {
    case 'mukut':
      head.add(mesh(G.cyl(5.5, 5.3, 2.6, 20, true), c, { y: 4.4, side: THREE.DoubleSide, metal: true }));
      for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i - 2) * 0.55; head.add(mesh(G.cone(1, 3.2, 6), c, { x: Math.cos(a) * 5.2, y: 7, z: Math.sin(a) * 5.2, metal: true })); }
      head.add(gemAt(4.6)); break;
    case 'tall-mukut':
      head.add(mesh(G.cyl(3.4, 5.4, 8, 20), c, { y: 7.4, metal: true })); head.add(mesh(G.ball(1.2), c, { y: 12, metal: true })); head.add(gemAt(5.2, 5)); break;
    case 'tiara': head.add(mesh(G.ring(5.2, 0.5, Math.PI), c, { y: 3, rx: -1.25, metal: true })); head.add(gemAt(4.4, 5)); break;
    case 'wizard':
      head.add(mesh(G.cyl(8.5, 8.5, 0.6, 24), shade(c, -0.15), { y: 4 }));
      head.add(mesh(G.cone(6.2, 14, 18), c, { y: 11, rz: 0.12 }));
      if (w.stars) for (const [x, y] of [[-2, 9], [1.5, 12], [0.5, 7]]) head.add(mesh(G.ball(0.55), '#FFE27A', { x, y, z: 3.6, glow: true }));
      break;
    case 'hood': head.add(mesh(G.cap(6.8, 0.62), c, { y: 0.6, z: -0.8, rx: -0.6 })); break;
    case 'cap': head.add(mesh(G.cap(5.9, 0.5), c, { y: 0.6, rx: -0.2 })); head.add(mesh(G.box(6, 0.5, 4.5), shade(c, -0.15), { y: 3.3, z: 5.4, rx: 0.15 })); break;
    case 'helmet': head.add(mesh(G.cap(6.3, 0.55), c, { y: 0.2, metal: true })); head.add(mesh(G.box(1.2, 1.2, 12), gem, { y: 6.2 })); break;
    case 'headband': head.add(mesh(G.ring(5.55, 0.6), c, { y: 2.6, rx: Math.PI / 2 })); break;
    case 'turban': head.add(mesh(G.ring(4.6, 2.4), c, { y: 4, rx: Math.PI / 2, sz: 0.7 })); head.add(mesh(G.ball(4.4), c, { y: 5.2, sy: 0.7 })); head.add(gemAt(4.4, 6.3)); break;
    case 'sheriff': head.add(mesh(G.cyl(9.5, 9.5, 0.5, 24), c, { y: 4.2 })); head.add(mesh(G.cyl(4.6, 5, 4.4, 20), c, { y: 6.4 })); head.add(mesh(G.box(1.4, 1.4, 0.4), '#E8B830', { y: 6.4, z: 5, rz: Math.PI / 4 })); break;
    case 'pointy-ears': for (const s of [-1, 1]) head.add(mesh(G.cone(1.6, 6, 8), w.skin || '#8CB070', { x: s * 7, y: 1.6, rz: -s * 1.2 })); break;
    default: break;
  }
}

function droid(c, P, scale) {
  const g = group(
    mesh(G.cyl(6, 6.4, 18, 20), c.color || '#F4F1E8', { y: 9 }),
    mesh(G.cap(6.05, 0.5), '#C7CCD8', { y: 18, metal: true }),
    mesh(G.box(7, 4, 0.6), '#3B6FD8', { y: 11, z: 5.9 }),
    mesh(G.ball(1.5), '#1E2235', { y: 21.5, z: 5 }),
  );
  const light = mesh(G.ball(0.8), '#F2545B', { y: 21.5, z: 6.2, material: ownMat('#F2545B') });
  g.add(light); P.anims.push((t) => { light.material.opacity = Math.sin(t * 6) > 0 ? 1 : 0.3; });
  for (const s of [-1, 1]) g.add(mesh(G.box(2, 10, 3), '#C7CCD8', { x: s * 7, y: 7 }));
  P.root.add(g); P.body = g; P.droid = true; P.hip = 0;
  P.root.scale.setScalar(scale); return P.root;
}

function talkingHat(c, P, scale) {
  const hc = c.color || '#6B4A33';
  const g = group(
    mesh(G.cyl(9, 9, 1, 24), shade(hc, -0.12), { y: 10 }),
    mesh(G.cone(6.5, 16, 18), hc, { y: 18, rz: 0.2 }),
  );
  for (const s of [-1, 1]) g.add(mesh(G.box(2.4, 0.5, 0.4), '#1E2235', { x: s * 2.2, y: 17, z: 5.2 }));
  const mouth = mesh(G.ring(1.6, 0.35, Math.PI), '#1E2235', { y: 13.6, z: 6, rz: Math.PI });
  g.add(mouth); P.anims.push((t) => { mouth.scale.y = 0.6 + 0.6 * Math.abs(Math.sin(t * 5)); });
  P.root.add(g); P.body = g; P.hat = true; P.hip = 0;
  P.root.scale.setScalar(scale); return P.root;
}

// ---------- poses ----------
// Arm rotations: rx < 0 swings the arm forward, rz > 0 lifts the right arm (+x) out to the side.
const POSES = {
  down: { L: [0, 0, -0.15], R: [0, 0, 0.15] },
  typing: { L: [-1.25, 0, -0.3], R: [-1.25, 0, 0.3] },
  hold: { L: [-1.0, 0, -0.55], R: [-1.0, 0, 0.55] },
  raise: { L: [0, 0, -0.15], R: [0, 0, 2.6] },
  chin: { L: [-0.9, 0, -0.5], R: [-2.4, 0, 0.75] },
  flute: { L: [-1.7, 0, -0.9], R: [-1.5, 0, 0.2] },
  blow: { L: [-2.1, 0, -0.65], R: [-2.1, 0, 0.65] },
  bow: { L: [-1.4, 0, -1.0], R: [-1.5, 0, 0.6] },
  staff: { L: [0, 0, -0.15], R: [-0.6, 0, 0.35] },
  mug: { L: [0, 0, -0.15], R: [-1.3, 0, 0.6] },
  cheer: { L: [0, 0, -2.6], R: [0, 0, 2.6] },
};
function setPose(P, name) {
  const p = POSES[name] || POSES.down;
  P.pose = name;
  if (!P.armL) return;
  P.armL.rotation.set(...p.L); P.armR.rotation.set(...p.R);
  P.baseL = p.L; P.baseR = p.R;
}

// ---------- props ----------
// "desk" props sit in front of the character at desk height; "hand" props are held in the right hand.
function addProp(p, P) {
  const c = p.color;
  const body = P.body;
  const front = (obj, y = 6, z = 7.5) => { obj.position.set(0, y, z); body.add(obj); return obj; };
  const inHand = (obj) => { P.handR.add(obj); return obj; };
  const glowPulse = (m, speed = 2) => { m.material = ownMat(m.material.color.getStyle(), {}); P.anims.push((t) => { m.material.opacity = 0.65 + 0.35 * Math.sin(t * speed); }); return m; };
  switch (p.type) {
    case 'flute': front(group(mesh(G.cyl(0.6, 0.6, 16, 10), c || '#9A5B2A', { rz: Math.PI / 2 })), 12.6, 6).position.x = 5; notes(P, '#3B5FAF', 9, 14, 7); break;
    case 'conch': front(group(mesh(G.cone(2.4, 6, 12), '#F7F2E4', { rz: Math.PI / 2 })), 12.6, 6.6); notes(P, '#D8A27A', 4, 14, 7); break;
    case 'bow': {
      const bow = group(mesh(G.ring(9, 0.45, Math.PI * 0.9), c || '#7A4A26', { rz: Math.PI / 2 + 0.15 }), mesh(G.box(0.2, 17, 0.2), '#E8DCC0', { x: 1.4 }));
      at(bow, -10.5, 12, 8); body.add(bow);
      const arrow = group(mesh(G.cyl(0.3, 0.3, 12, 6), '#5A3A20', { rz: Math.PI / 2 }), mesh(G.cone(0.8, 1.8, 6), '#9AA0B5', { x: -6.5, rz: Math.PI / 2 }));
      at(arrow, -4, 12, 8); body.add(arrow);
      P.anims.push((t) => { const k = (t % 2.2) / 2.2; P.armR.rotation.y = k < 0.7 ? -0.5 * (k / 0.7) : 0; arrow.position.x = k < 0.72 ? -4 + 3 * (k / 0.7) : -4 - 120 * (k - 0.72); arrow.visible = k < 0.95; });
      break;
    }
    case 'mace': case 'hammer': {
      P.swing = true;
      const head = p.type === 'mace' ? mesh(G.ball(2.6), c || '#E8B830', { y: -10, metal: true }) : mesh(G.box(6, 3, 3), c || '#8A90A6', { y: -10, metal: true });
      inHand(group(mesh(G.cyl(0.6, 0.6, 10, 8), '#8B5A2B', { y: -5 }), head)).rotation.x = Math.PI;
      P.anims.push((t) => { const k = (t % 2.4) / 2.4; P.armR.rotation.x = P.baseR[0] - (k < 0.38 ? 0.9 * (k / 0.38) : k < 0.52 ? 0.9 - 1.3 * ((k - 0.38) / 0.14) : -0.4 * (1 - (k - 0.52) / 0.48)); });
      break;
    }
    case 'spear': inHand(group(mesh(G.cyl(0.45, 0.45, 40, 8), '#8B5A2B', { y: 6 }), mesh(G.cone(1.2, 4, 6), '#C7CCD8', { y: 27.5, metal: true }))).rotation.x = 0.6; break;
    case 'staff': {
      const st = inHand(group(mesh(G.cyl(0.55, 0.55, 30, 8), c || '#7A4A26', { y: 4 })));
      st.rotation.x = 0.6;
      if (p.top === 'orb') st.add(glowPulse(mesh(G.ball(2.2), '#9FD3F2', { y: 20, glow: true })));
      break;
    }
    case 'wand': {
      const w = inHand(group(mesh(G.cyl(0.3, 0.3, 9, 6), c || '#5A3A20', { y: 4 })));
      w.rotation.x = 1.2; const sp = mesh(G.ball(0.9), '#FFE27A', { y: 9, glow: true }); w.add(sp);
      P.anims.push((t) => { sp.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 6))); });
      break;
    }
    case 'walkie': { const wk = inHand(group(mesh(G.box(2.4, 4.2, 1.6), '#3A3F55'), mesh(G.box(0.4, 3, 0.4), '#3A3F55', { x: -0.6, y: 3.4 }))); wk.position.y = -1; const l = mesh(G.ball(0.4), '#F2B825', { y: 1, z: 0.9, material: ownMat('#F2B825') }); wk.add(l); P.anims.push((t) => { l.material.opacity = Math.sin(t * 8) > 0 ? 1 : 0.2; }); break; }
    case 'wrench': inHand(mesh(G.box(1.2, 8, 0.6), c || '#8A90A6', { y: -2, metal: true })); break;
    case 'scroll': case 'quill': {
      const s = front(group(mesh(G.box(10, 0.3, 5), '#EAD7A2'), mesh(G.cyl(0.9, 0.9, 10.6, 10), '#D9C48F', { z: -2.6, rz: Math.PI / 2 })));
      if (p.type === 'quill') { const q = inHand(mesh(G.ball(1), '#F4F1E8', { y: -2.5, sy: 4, sz: 0.3, rz: 0.4 })); P.anims.push((t) => { q.rotation.x = 0.25 * Math.sin(t * 9); }); }
      const ink = mesh(G.box(1, 0.1, 0.4), '#6B4A2A', { y: 0.25, z: 0.5 }); s.add(ink);
      P.anims.push((t) => { const k = (t % 2.4) / 2.4; ink.scale.x = Math.min(8, 1 + k * 12); ink.position.x = -4 + ink.scale.x / 2; });
      break;
    }
    case 'book': {
      const col = c || '#C8352E';
      const b = front(group(mesh(G.box(5.4, 0.6, 7), col, { x: -2.8, rz: 0.12 }), mesh(G.box(5.4, 0.6, 7), col, { x: 2.8, rz: -0.12 }),
        mesh(G.box(5, 0.4, 6.4), '#F4F1E8', { x: -2.6, y: 0.5, rz: 0.12 }), mesh(G.box(5, 0.4, 6.4), '#F4F1E8', { x: 2.6, y: 0.5, rz: -0.12 })));
      const page = mesh(G.box(5, 0.15, 6.2), '#FFFDF5', { x: 2.5 }); const hinge = at(group(page), 0, 0.8, 0); b.add(hinge);
      P.anims.push((t) => { const k = (t % 3.8) / 3.8; hinge.rotation.z = k < 0.55 ? 0 : k < 0.8 ? Math.PI * ((k - 0.55) / 0.25) : Math.PI; page.visible = k < 0.81; });
      break;
    }
    case 'map': front(group(mesh(G.box(12, 0.25, 7), '#EAD7A2'), mesh(G.box(6, 0.1, 0.5), '#C8352E', { y: 0.2, rz: 0, ry: 0.5 }))); break;
    case 'laptop': {
      const l = front(group(mesh(G.box(10, 0.6, 7), c || '#C7CCD8', { metal: true })));
      const lid = at(group(mesh(G.box(10, 6.5, 0.4), c || '#C7CCD8', { y: 3.2, metal: true }), mesh(G.plane(9, 5.6), '#9FD3F2', { y: 3.2, z: -0.25, ry: Math.PI, glow: true })), 0, 0.3, 3.4, -0.25);
      l.add(lid); l.rotation.y = Math.PI; l.position.z = 7.5;
      break;
    }
    case 'crystal': front(group(mesh(G.cyl(2.4, 3, 1.2, 12), '#8B5A2B'), glowPulse(mesh(geo('ico', () => new THREE.IcosahedronGeometry(3.2, 1)), c || '#9FC8F2', { y: 3.6, glow: true }))), 6.4); break;
    case 'cauldron': {
      const cd = front(group(mesh(G.cap(5, 0.5), '#3A3F55', { rx: Math.PI }), mesh(G.disc(4.6), c || '#5CC793', { rx: -Math.PI / 2, y: -0.4, glow: true })), 8.5, 8);
      bubbles(P, cd, c || '#5CC793'); steam(P, cd, 0, 1.5, 0);
      break;
    }
    case 'beam': { const bm = front(group(mesh(G.box(1.8, 3, 1.8), '#8A90A6')), 6, 7.5); const ray = mesh(G.box(1, 22, 1), c || '#5CC7F2', { y: 12, material: ownMat(c || '#5CC7F2') }); bm.add(ray); P.anims.push((t) => { ray.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 3)); ray.scale.x = 1 + 0.2 * Math.sin(t * 23); }); break; }
    case 'flask': { const fl = front(group(mesh(G.ball(2.6), '#E9F6EE', { y: 2.2, opacity: 0.7 }), mesh(G.cyl(0.9, 0.9, 3, 10), '#E9F6EE', { y: 5, opacity: 0.7 }), glowPulse(mesh(G.ball(2.1), c || '#5CC793', { y: 1.8, glow: true })))); bubbles(P, fl, c || '#5CC793'); break; }
    case 'holo': {
      const h = front(group(), 6, 8);
      const cone = mesh(G.cone(5, 9, 3), '#5CC7F2', { y: 5, rx: Math.PI, material: ownMat('#5CC7F2', { opacity: 0.35 }) });
      const orb = mesh(G.ball(2), '#5CC7F2', { y: 11, material: ownMat('#5CC7F2', { opacity: 0.6 }) });
      const scan = mesh(G.box(8, 0.25, 0.25), '#E6F8FF', { y: 2, material: ownMat('#E6F8FF', { opacity: 0.8 }) });
      h.add(cone, orb, scan);
      P.anims.push((t) => { const f = Math.sin(t * 31) > 0.85 ? 0.3 : 1; cone.material.opacity = 0.35 * f; orb.material.opacity = 0.6 * f; orb.rotation.y = t; scan.position.y = 1 + ((t * 6) % 9); h.position.x = Math.sin(t * 40) > 0.97 ? 0.6 : 0; });
      break;
    }
    case 'lights': {
      const cols = ['#F2545B', '#F2B825', '#5CC793', '#3B6FD8'];
      const bulbs = [];
      for (let i = 0; i < 7; i++) { const b = mesh(G.ball(0.8), cols[i % 4], { x: -12 + i * 4, y: 32 + Math.sin((i / 6) * Math.PI) * 3, z: -2, material: ownMat(cols[i % 4]) }); body.add(b); bulbs.push(b); }
      P.anims.push((t) => { const on = Math.floor(t * 6) % bulbs.length; bulbs.forEach((b, i) => { b.material.opacity = i === on ? 1 : 0.35; }); });
      break;
    }
    case 'cards': front(group(mesh(G.box(3.4, 0.2, 4.6), '#F4F1E8', { x: -2, ry: 0.3 }), mesh(G.box(3.4, 0.2, 4.6), '#F4F1E8', { x: 2, y: 0.2, ry: -0.3 }), mesh(G.box(1, 0.1, 1), '#C8352E', { x: -2, y: 0.2, ry: 0.3 }))); break;
    case 'dice': { const d = front(group(mesh(G.box(2.6, 2.6, 2.6), '#F2545B', { x: -2 }), mesh(G.box(2.6, 2.6, 2.6), '#9B4DCA', { x: 2 })), 7.3); P.anims.push((t) => { d.children[0].rotation.y = t * 2; d.children[1].rotation.x = t * 1.6; }); break; }
    case 'lotus': front(group(...[0, 1, 2, 3, 4].map((i) => mesh(G.ball(1.3), '#F29EB8', { x: Math.cos(i * 1.26) * 1.4, z: Math.sin(i * 1.26) * 1.4, y: 1, sy: 2, rz: Math.cos(i * 1.26) * 0.6, rx: -Math.sin(i * 1.26) * 0.6 })))); break;
    case 'sandals': front(group(mesh(G.ball(1.6), '#B07650', { x: -1.8, sy: 0.3, sz: 2 }), mesh(G.ball(1.6), '#B07650', { x: 1.8, sy: 0.3, sz: 2 }))); break;
    case 'bowlfood': front(group(mesh(G.cap(3.4, 0.5), '#B0603A', { rx: Math.PI, y: 2 }), mesh(G.ball(1.3), '#FFF3DC', { y: 2.3, x: -1 }), mesh(G.ball(1.4), '#FFF3DC', { y: 2.5, x: 1 }))); break;
    case 'garland': front(group(...Array.from({ length: 9 }, (_, i) => mesh(G.ball(0.9), '#F2B825', { x: Math.cos(Math.PI + (i / 8) * Math.PI) * 4.4, y: 10.5 - Math.sin((i / 8) * Math.PI) * 4, z: -3.2 }))), 0, 0); break;
    case 'compass': {
      const cp = front(group(mesh(G.cyl(3, 3, 0.8, 18), '#E8B830', { metal: true }), mesh(G.cyl(2.4, 2.4, 0.9, 18), '#F4F1E8')));
      const needle = mesh(G.box(0.6, 0.2, 3.6), '#C8352E', { y: 0.6 }); cp.add(needle);
      P.anims.push((t) => { const k = (t % 4) / 4; needle.rotation.y = Math.exp(-4 * k) * 0.9 * Math.cos(k * 22); });
      break;
    }
    case 'medal': { const m = mesh(G.cyl(1.8, 1.8, 0.4, 16), '#E8B830', { rx: Math.PI / 2, metal: true }); P.torso.add(at(group(m, mesh(G.box(1.4, 3, 0.2), '#3B6FD8', { y: 2.2, z: -0.2 })), 0, 7.4, 4.1)); P.anims.push((t) => { m.rotation.z = t * 2; }); break; }
    case 'bike': {
      const wheels = [-7, 7].map((x) => { const w = group(mesh(G.ring(4, 0.45), '#3A3F55'), mesh(G.box(7.6, 0.25, 0.25), '#8A90A6'), mesh(G.box(0.25, 7.6, 0.25), '#8A90A6')); return at(w, x, -P.hip + 4, 4, 0, Math.PI / 2, 0); });
      wheels.forEach((w) => body.add(w));
      P.anims.push((t) => { wheels.forEach((w) => { w.rotation.x = -t * 4; }); });
      break;
    }
    case 'joystick': { const j = front(group(mesh(G.box(7, 1.6, 5), '#3A3F55'))); const stick = at(group(mesh(G.cyl(0.4, 0.4, 3.4, 8), '#1E2235', { y: 1.7 }), mesh(G.ball(1), '#F2545B', { y: 3.6 })), -1.6, 0.8, 0); j.add(stick); P.anims.push((t) => { stick.rotation.z = 0.35 * Math.sin(t * 5); stick.rotation.x = 0.25 * Math.sin(t * 3.3); }); break; }
    case 'thali': { const th = front(group(mesh(G.cyl(4.4, 4.4, 0.4, 20), '#E8B830', { metal: true }))); flame(P, th, 0, 0.5, 0); break; }
    case 'arrows': { const q = at(group(mesh(G.cyl(1.6, 1.4, 9, 10), '#7A4A26'), ...[-0.7, 0, 0.7].map((x) => mesh(G.cyl(0.2, 0.2, 4, 4), '#E8DCC0', { x, y: 6 }))), 5.6, 9, -4.5, 0.4, 0, -0.4); body.add(q); break; }
    case 'shield': {
      const sh = front(group(mesh(G.cyl(5.4, 5.4, 0.8, 24), c || '#3B6FD8', { rx: Math.PI / 2, metal: true }), mesh(G.cyl(3.6, 3.6, 0.9, 24), '#F4F1E8', { rx: Math.PI / 2 }), mesh(extruded(starShape(2.6), 0.6, 'st2.6'), '#E8B830', { z: 0.3 })), 7.5, 7);
      P.anims.push((t) => { sh.rotation.z = 0.08 * Math.sin(t * 1.7); });
      break;
    }
    case 'magnifier': {
      const mg = inHand(group(mesh(G.cyl(0.5, 0.5, 5, 8), '#5A3A20', { y: 2.5 }), mesh(G.ring(2.4, 0.5), c || '#C9A15A', { y: 7.4, metal: true }), mesh(G.disc(2.2), '#CFEFFF', { y: 7.4, opacity: 0.45, side: THREE.DoubleSide })));
      mg.rotation.x = Math.PI * 0.75;
      P.anims.push((t) => { mg.rotation.z = 0.3 * Math.sin(t * 1.3); });
      break;
    }
    default: break;
  }
}

function notes(P, color, x, y, z) {
  const ns = [0, 1, 2].map((i) => { const s = sprite(labelTexture(i % 2 ? '♫' : '♪', null, color), 4, 3); P.body.add(s); return s; });
  P.anims.push((t) => ns.forEach((s, i) => { const k = ((t / 3) + i / 3) % 1; s.position.set(x + k * 6, y + k * 10, z); s.material.opacity = k < 0.15 ? k / 0.15 : 1 - k; }));
}
function bubbles(P, parent, color) {
  const bs = [0, 1, 2].map((i) => { const b = mesh(G.ball(0.6), color, { material: ownMat(color) }); parent.add(b); return b; });
  P.anims.push((t) => bs.forEach((b, i) => { const k = ((t / 1.8) + i / 3) % 1; b.position.set(Math.sin(i * 2) * 1.5, 1 + k * 5, Math.cos(i * 2) * 1.2); b.material.opacity = 1 - k; }));
}
function steam(P, parent, x, y, z) {
  const ps = [0, 1, 2].map((i) => { const p = mesh(G.ball(0.9), '#FFFFFF', { material: ownMat('#FFFFFF') }); parent.add(p); return p; });
  P.anims.push((t) => ps.forEach((p, i) => { const k = ((t / 2.6) + i / 3) % 1; p.position.set(x + Math.sin(k * 6 + i) * 0.8, y + k * 7, z); p.scale.setScalar(0.6 + k * 1.4); p.material.opacity = 0.55 * (k < 0.2 ? k / 0.2 : 1 - k); }));
}
function flame(P, parent, x, y, z) {
  const f = mesh(G.cone(0.9, 2.6, 8), '#FFB347', { y: y + 1.3, x, z, glow: true });
  const core = mesh(G.cone(0.45, 1.4, 8), '#FFF3B0', { y: y + 0.9, x, z, glow: true });
  parent.add(f, core); P.anims.push((t) => { f.scale.set(1 - 0.12 * Math.sin(t * 17), 1 + 0.18 * Math.sin(t * 13), 1); });
  return f;
}
function mug(P) {
  const m = group(mesh(G.cyl(1.5, 1.5, 3.2, 12), '#F4F1E8'), mesh(G.ring(0.9, 0.3), '#F4F1E8', { x: 1.8 }));
  m.position.set(0, -1, 0.8); P.handR.add(m); steam(P, m, 0, 2, 0);
}

// Little extras that depend on state, not on the cast entry: think dots, sleep z's, the bubble.
function addMood(c, P, { sitting }) {
  const top = (P.droid ? 24 : P.hat ? 26 : P.hip + 26);
  if (c.pose === 'mug' && P.handR) mug(P);
  if (c.think) {
    const dots = [0, 1, 2].map((i) => { const d = mesh(G.ball(0.7 + i * 0.25), '#3B5FAF', { x: 5 + i * 2.2, y: top + i * 1.6, material: ownMat('#3B5FAF') }); P.root.add(d); return d; });
    P.anims.push((t) => dots.forEach((d, i) => { d.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 4 - i * 0.9)); }));
    P.anims.push((t) => { if (P.head) P.head.rotation.z = 0.13 * Math.sin(t * 1.9); });
  }
  if (c.sleep && sitting) {
    const zs = [0, 1].map((i) => { const s = sprite(labelTexture('z', null, '#3B5FAF'), 3.6, 2.7); P.root.add(s); return s; });
    P.anims.push((t) => zs.forEach((s, i) => { const k = ((t / 2.6) + i / 2) % 1; s.position.set(5 + k * 4, top - 2 + k * 8, 2); s.material.opacity = k < 0.2 ? k / 0.2 : 1 - k; }));
    P.anims.push((t) => { if (P.head) P.head.rotation.x = 0.22 + 0.04 * Math.sin(t * 1.3); });
  }
  const b = { waiting: ['#F29E1F', '!', '#FFFFFF'], asking: ['#3B6FD8', '?', '#FFFFFF'], done: ['#FFFFFF', '✓', '#23845A'] }[c.bubble];
  if (b) {
    const s = sprite(labelTexture(b[1], b[0], b[2]), 8, 6); s.position.set(7, top + 4, 2); P.root.add(s);
    const urgent = c.bubble === 'waiting';
    P.anims.push((t) => { const k = t % 5; const pulse = urgent && k > 2.5 ? 1 + 0.18 * Math.abs(Math.sin(t * 6)) : 1; s.scale.set(8 * pulse, 6 * pulse, 1); s.position.y = top + 4 + 0.6 * Math.sin(t * 4.5); });
  }
}

// Per-frame motion shared by every character: breathing, blinking, idle bob, and the pose's own movement.
function animate(P, t, motion) {
  const seed = P.seed;
  if (P.walking) {
    const w = Math.sin(t * 11);
    if (P.legL) { P.legL.rotation.x = 0.7 * w; P.legR.rotation.x = -0.7 * w; }
    if (P.armL) { P.armL.rotation.set(-0.5 * w, 0, -0.12); P.armR.rotation.set(0.5 * w, 0, 0.12); }
    P.body.position.y = P.hip + Math.abs(Math.cos(t * 11)) * 0.8;
    return;
  }
  if (!motion) return;
  if (P.torso) P.torso.scale.set(1 + 0.012 * Math.sin(t * P.breath), 1 + 0.03 * Math.sin(t * P.breath), 1);
  if (P.eyes) P.eyes.scale.y = (t + seed * 4.1) % 4.6 < 0.13 ? 0.12 : 1;
  P.body.position.y = P.hip + 0.3 * Math.sin(t * 2.4 + seed * 6);
  if (P.cape) P.cape.rotation.x = -0.12 - 0.08 * Math.sin(t * 1.8 + seed);
  if (P.armL) {
    const [lx, ly, lz] = P.baseL, [rx, ry, rz] = P.baseR;
    if (P.pose === 'typing') { P.armL.rotation.x = lx + 0.12 * Math.sin(t * 14); P.armR.rotation.x = rx + 0.12 * Math.sin(t * 14 + Math.PI); }
    if (P.pose === 'raise') {
      const k = t % 5, urgent = P.urgent && k > 2.5;
      P.armR.rotation.z = rz + (urgent ? 0.4 : 0.22) * Math.sin(t * (urgent ? 13 : 6));
    }
    if (P.pose === 'cheer') { P.armL.rotation.z = lz - 0.2 * Math.abs(Math.sin(t * 5)); P.armR.rotation.z = rz + 0.2 * Math.abs(Math.sin(t * 5)); }
    if (P.pose === 'staff' && !P.swing) P.armR.rotation.x = rx + 0.05 * Math.sin(t * 2);
  }
  if (P.hop) P.root.position.y = Math.max(0, Math.sin(t * 5)) * 2.6;
  for (const f of P.anims) f(t);
}

// ---------- room ----------
function deskMesh(d) {
  const top = d.top || '#A86F3C', bodyC = d.body || shade(top, -0.12), leg = d.leg || shade(top, -0.25);
  const g = group(
    mesh(G.box(46, 1.6, 15), top, { y: 12.2 }),
    mesh(G.box(44, 9.6, 1.2), bodyC, { y: 6.6, z: 6.6 }),
    mesh(G.box(1.6, 11.4, 13), leg, { x: -21.5, y: 5.7 }),
    mesh(G.box(1.6, 11.4, 13), leg, { x: 21.5, y: 5.7 }),
  );
  const item = deskItem(d);
  if (item) g.add(item);
  return g;
}
function deskItem(d) {
  const scr = d.screen || '#9FD3F2';
  const onDesk = (obj, x, z = -3, ry = 0) => at(obj, x, 13, z, 0, ry, 0);
  switch (d.item) {
    case 'monitor': return onDesk(group(mesh(G.box(3, 0.6, 3), '#3A3F55', { y: 0.3 }), mesh(G.box(0.8, 3.4, 0.8), '#3A3F55', { y: 2 }), mesh(G.box(12, 7.4, 0.8), '#3A3F55', { y: 6.8 }), mesh(G.plane(11, 6.4), scr, { y: 6.8, z: 0.45, glow: true })), -13, 0, 0.5);
    case 'laptop': return onDesk(group(mesh(G.box(9, 0.5, 6), '#C7CCD8'), at(group(mesh(G.box(9, 6, 0.4), '#C7CCD8', { y: 3 }), mesh(G.plane(8, 5), scr, { y: 3, z: 0.25, glow: true })), 0, 0.2, -3, -0.2)), -14, 0, 0.5);
    case 'crt': return onDesk(group(mesh(G.box(11, 9, 9), '#D9CDB0', { y: 4.5 }), mesh(G.plane(8.4, 6.4), scr, { y: 5, z: 4.55, glow: true }), mesh(G.box(8, 1, 3), '#3A3F55', { y: 0.5, z: 7 })), -14, -4, 0.5);
    case 'console': return onDesk(group(mesh(G.box(14, 1.6, 6), '#2A2F45', { y: 0.8 }), at(group(mesh(G.box(14, 5, 0.6), '#2A2F45'), mesh(G.plane(12.6, 4), scr, { z: 0.35, glow: true })), 0, 3.6, -2.6, -0.5), ...[-5, -2, 1, 4].map((x, i) => mesh(G.ball(0.5), ['#5CC793', '#F2B825', '#F2545B', '#5CC7F2'][i], { x, y: 1.7, z: 1.6, glow: true }))), -12);
    case 'scroll': return onDesk(group(mesh(G.cyl(1.1, 1.1, 12, 10), '#EAD7A2', { rz: Math.PI / 2, y: 1.1 }), mesh(G.cyl(1.3, 1.3, 1, 10), '#B89A5A', { rz: Math.PI / 2, y: 1.1, x: 6.2 })), -13);
    case 'books': return onDesk(group(mesh(G.box(9, 2, 6), '#7A1F2A', { y: 1 }), mesh(G.box(8, 2, 5.6), '#2A4E9E', { y: 3, ry: 0.15 })), -14);
    case 'candle': case 'diya': {
      const g = d.item === 'candle' ? group(mesh(G.cyl(1, 1, 6, 10), '#F4F1E8', { y: 3 })) : group(mesh(G.cap(2.4, 0.5), '#B0603A', { rx: Math.PI, y: 1.4 }));
      const f = mesh(G.cone(0.9, 2.6, 8), '#FFB347', { y: d.item === 'candle' ? 7.4 : 2.6, glow: true });
      g.add(f); g.userData.flame = f;
      return onDesk(g, 16, -3);
    }
    default: return null;
  }
}
function chair(color) {
  return group(mesh(G.cyl(4.6, 4.6, 1.4, 18), color, { y: SEAT - 0.7 }), mesh(G.cyl(0.8, 0.8, SEAT - 1, 8), '#3A3F55', { y: (SEAT - 1) / 2 }), mesh(G.box(9, 7, 1.2), color, { y: SEAT + 4, z: -4.6 }));
}
function lounge(l, x, z) {
  const c = l.color || '#7D6BB8', a = l.accent || shade(c, -0.18);
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const sofa = l.kind === 'bench'
    ? group(mesh(G.box(66, 2, 10), c, { y: SEAT - 1, z: 4 }), ...[-28, 28].map((dx) => mesh(G.box(2, SEAT - 2, 8), a, { x: dx, y: (SEAT - 2) / 2, z: 4 })))
    : group(mesh(G.box(70, SEAT, 14), c, { y: SEAT / 2, z: 4 }), mesh(G.box(70, 12, 4), a, { y: SEAT + 4, z: -4 }), mesh(G.box(5, 12, 14), a, { x: -35, y: 6, z: 3 }), mesh(G.box(5, 12, 14), a, { x: 35, y: 6, z: 3 }),
      ...[-22, 0, 22].map((dx) => mesh(G.box(21, 2, 11), shade(c, 0.08), { x: dx, y: SEAT + 0.4, z: 4.5 })));
  g.add(sofa);
  if (l.kind === 'hut') {
    const hut = group(mesh(G.box(34, 20, 18), '#D9B97A', { y: 10 }), mesh(G.cone(27, 13, 4), '#B8955A', { y: 26.5, ry: Math.PI / 4, sz: 0.75 }), mesh(G.box(9, 13, 0.6), '#6B4A33', { y: 6.5, z: 9.1 }));
    const lamp = mesh(G.cone(0.9, 2.4, 8), '#FFD27A', { y: 4, z: 10.2, glow: true }); hut.add(lamp); g.userData.flame = lamp;
    hut.position.set(0, 0, -20); g.add(hut);
  }
  if (l.kind === 'fireplace') {
    const fp = group(mesh(G.box(30, 26, 8), '#6E6E80', { y: 13 }), mesh(G.box(20, 15, 1), '#2A1A14', { y: 8, z: 4.1 }));
    const fire = group(mesh(G.cone(4, 9, 8), '#F2945A', { y: 5, glow: true }), mesh(G.cone(2.2, 5, 8), '#FFE27A', { y: 3.6, z: 1, glow: true }));
    fire.position.z = 3.6; fp.add(fire); g.userData.fire = fire;
    fp.position.set(0, 0, -20); g.add(fp);
  }
  return g;
}

function floorTexture(a, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 64, 64);
  x.fillStyle = b; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
  x.strokeStyle = shade(a, -0.08); x.lineWidth = 1; x.strokeRect(0.5, 0.5, 63, 63);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ---------- the scene ----------
const PHASE_LIGHT = {
  dawn: { sky: '#FFD7C2', ground: '#6B5A7A', hemi: 1.15, sun: '#FFB38A', sunI: 1.5, lamps: 0.6 },
  morning: { sky: '#FFFFFF', ground: '#8A7A6A', hemi: 1.3, sun: '#FFFFFF', sunI: 1.9, lamps: 0 },
  afternoon: { sky: '#FFF8EC', ground: '#8A7A6A', hemi: 1.3, sun: '#FFF4E0', sunI: 1.9, lamps: 0 },
  evening: { sky: '#FFB88A', ground: '#4A3A5A', hemi: 0.95, sun: '#FF9A5A', sunI: 1.3, lamps: 1 },
  night: { sky: '#6A7AAA', ground: '#1A1A2A', hemi: 0.6, sun: '#8AA0FF', sunI: 0.5, lamps: 1.6 },
};

class Floor {
  constructor(stage) {
    this.stage = stage;
    this.box = document.createElement('div'); this.box.className = 'v3d';
    this.css = new CSS3DRenderer(); this.css.domElement.className = 'v3d-css';
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.domElement.className = 'v3d-gl';
    this.box.append(this.css.domElement, this.gl.domElement);
    stage.prepend(this.box);
    this.scene = new THREE.Scene(); this.cssScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 2, 1, 5000);
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1.2); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff', 1.8); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.sun, this.sun.target);
    this.static = new THREE.Group(); this.scene.add(this.static);
    this.people = new Map();      // agent name -> { obj, P, key, helpers: [] }
    this.lamps = [];
    this.confetti = [];
    this.sizeKey = '';
    this.model = null;
  }
  setVisible(on) { this.box.hidden = !on; }
  async setTheme(theme, url) {
    this.theme = theme; this.model = null;
    for (const p of this.people.values()) this.removePerson(p);
    this.people.clear(); this.sizeKey = ''; this.layoutKey = '';
    if (!theme.model) return false;
    try { this.model = await (await fetch(url(theme.model))).json(); } catch { return false; }
    if (this.theme !== theme) return false;
    this.url = url;
    return true;
  }
  removePerson(p) { this.scene.remove(p.obj); for (const h of p.helpers) this.scene.remove(h.obj); }

  // Rebuilds desks, floor, wall and lounge when the layout changes.
  layout(L) {
    const key = `${this.theme.id}|${L.W}|${L.rows}|${L.cols}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.scene.remove(this.static); this.static = new THREE.Group(); this.scene.add(this.static);
    this.cssScene.clear();
    const r3 = this.model.room3d || {};
    const room = this.theme.room || {};
    const D = L.H - L.WALL;
    // floor: tiles in the theme's two floor colours (drawn here, so it is there on the first frame)
    const fc = (r3.floor && r3.floor.color) || room.floorColor || '#D9B98A';
    const ftex = floorTexture(fc, (r3.floor && r3.floor.alt) || shade(fc, -0.05));
    ftex.repeat.set(L.W / 24, (D + 40) / 24);
    const floorMat = new THREE.MeshToonMaterial({ color: '#FFFFFF', map: ftex, gradientMap: toonRamp });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.W, D + 40), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(L.W / 2, 0, (D + 40) / 2 - 20); floor.receiveShadow = true;
    this.static.add(floor);
    // wall: a solid backing (for shadows and edges) with the animated SVG in front of it, in CSS 3D
    const wc = (r3.wall && r3.wall.color) || room.wallColor || '#C9B08A';
    const backing = mesh(G.box(L.W, WALL_H, 2), wc, { x: L.W / 2, y: WALL_H / 2, z: -1.2 });
    if (room.wall) { backing.material = new THREE.MeshBasicMaterial({ colorWrite: false }); backing.castShadow = false; }
    this.static.add(backing);
    this.static.add(mesh(G.box(L.W, 1.4, 2.4), shade(wc, -0.2), { x: L.W / 2, y: 0.7, z: 0.4 }));
    if (room.wall) {
      const el = document.createElement('div');
      el.style.cssText = `width:${L.W}px;height:${WALL_H}px;background:${wc} url("${this.url(room.wall)}") repeat-x;background-size:auto 100%;pointer-events:none`;
      const o = new CSS3DObject(el); o.position.set(L.W / 2, WALL_H / 2, 0.01); this.cssScene.add(o);
    }
    // desks and chairs
    const d = r3.desk || {};
    this.lamps = [];
    for (let i = 0; i < L.rows * L.cols; i++) {
      const s = L.slot(i);
      const z = s.seatY - L.WALL;
      const desk = deskMesh(d); desk.position.set(s.seatX - 2, 0, z + 10); this.static.add(desk);
      const ch = chair(d.chair || shade(d.body || '#8B5A2B', -0.1)); ch.position.set(s.seatX, 0, z); this.static.add(ch);
      const flame = desk.children.find((k) => k.userData.flame);
      if (flame) this.lamps.push(flame.userData.flame);
    }
    if (this.theme.room.lounge || r3.lounge) {
      const lg = lounge(r3.lounge || {}, 336 + L.DX, 50 - 6);
      this.static.add(lg); this.loungeObj = lg;
    } else this.loungeObj = null;
    // selection marker
    this.marker = mesh(G.box(62, 0.3, 44), '#FFFFFF', { material: ownMat('#FFFFFF', { opacity: 0.22 }) });
    this.marker.visible = false; this.static.add(this.marker);
    // desk lamps for evening/night (a few lights, not one per desk)
    this.lampLights = [];
    for (let k = 0; k < Math.min(4, L.rows); k++) {
      const p = new THREE.PointLight('#FFD68C', 0, 160, 1.4);
      p.position.set(L.W / 2 - 60, 40, (k + 0.5) * 64 + 10); this.static.add(p); this.lampLights.push(p);
    }
    // the sun: shadows across the whole floor
    this.sun.position.set(L.W * 0.3, 240, D + 140); this.sun.target.position.set(L.W / 2, 0, D / 2);
    const sc = this.sun.shadow.camera; const R = Math.max(L.W, D) * 0.75;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 800; sc.updateProjectionMatrix();
    this.L = L; this.sizeKey = '';
  }

  // Fits the camera so the whole floor and wall are in view.
  fit() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const key = `${w}x${h}|${this.layoutKey}`;
    if (key === this.sizeKey || !w || !h) return false;
    this.sizeKey = key;
    this.gl.setSize(w, h); this.css.setSize(w, h);
    const L = this.L, D = L.H - L.WALL;
    const cam = this.camera; cam.aspect = w / h;
    const pts = [[0, 0, 0], [L.W, 0, 0], [0, 0, D], [L.W, 0, D], [0, WALL_H, 0], [L.W, WALL_H, 0]].map((p) => new THREE.Vector3(...p));
    const pitch = 0.62;
    const target = new THREE.Vector3(L.W / 2, 0, D * 0.5);
    cam.clearViewOffset();
    const place = (dist) => {
      cam.position.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
      cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const v = p.clone().project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      return { x0, x1, y0, y1 };
    };
    // closest distance where the room's width and height both fit, then shift the picture so it is centred
    let lo = 50, hi = 5000;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const b = place(mid); if (b.x1 - b.x0 > 1.96 || b.y1 - b.y0 > 1.92) lo = mid; else hi = mid; }
    const b = place(hi);
    // how tall the stage should be for its width, so the room fills it (the same at any size)
    this.ratio = ((b.y1 - b.y0) * h) / ((b.x1 - b.x0) * w);
    cam.setViewOffset(w, h, ((b.x0 + b.x1) / 2) * (w / 2), -((b.y0 + b.y1) / 2) * (h / 2), w, h);
    cam.updateProjectionMatrix();
    return true;
  }

  person(a, L) {
    const cast = this.model.cast || {};
    const c = cast[a.role] || cast[this.theme.defaultRole] || cast.thinking || Object.values(cast)[0];
    const sitting = a.pose === 'sit' || a.pose === 'couch';
    const key = `${a.role}|${sitting}|${a.pose === 'walk'}`;
    let p = this.people.get(a.name);
    if (p && p.key === key) return p;
    if (p) this.scene.remove(p.obj);
    const spec = { ...c, bubble: a.pose === 'walk' ? null : c.bubble, sleep: c.sleep && a.pose === 'couch' };
    if (a.done && spec.bubble === 'done' && ['hold', 'down', undefined].includes(spec.pose) && (!spec.prop || spec.prop.type === 'medal')) spec.pose = 'cheer';
    const obj = buildCharacter(spec, { sitting });
    const P = obj.userData.parts;
    P.seed = (hashStr(a.name) % 1000) / 1000; P.breath = 1.6 + P.seed * 0.5;
    P.urgent = spec.bubble === 'waiting'; P.hop = spec.bubble === 'done';
    P.walking = a.pose === 'walk';
    addMood(spec, P, { sitting });
    if (this.theme.tint) tint(obj, hashStr(a.name) % 360);
    this.scene.add(obj);
    const helpers = p ? p.helpers : [];
    p = { obj, P, key, helpers, x: a.x, y: a.y }; this.people.set(a.name, p);
    return p;
  }

  helpersFor(p, a, L) {
    const cast = this.model.cast || {};
    if (!cast.helper) return;
    while (p.helpers.length > a.helpers.length) this.scene.remove(p.helpers.pop().obj);
    a.helpers.forEach((h, k) => {
      let hp = p.helpers[k];
      if (!hp) { const obj = buildCharacter({ ...cast.helper, bubble: null }, { sitting: false, scale: 0.5 }); const P = obj.userData.parts; P.seed = (k * 0.37) % 1; P.breath = 2; this.scene.add(obj); hp = { obj, P }; p.helpers.push(hp); }
      const s = L.slot(a.slot);
      const z = s.seatY - L.WALL;
      const working = h.state === 'working';
      hp.P.walking = working;
      const bx = s.seatX + 24 + k * 5;
      hp.obj.position.set(bx + (working ? Math.sin(performance.now() / 700 + k) * 3 : 0), 0, z + 4 + k * 2);
      hp.obj.rotation.y = working ? Math.cos(performance.now() / 700 + k) > 0 ? Math.PI / 2 : -Math.PI / 2 : -0.4;
    });
  }

  // state: { W, H, WALL, DX, rows, cols, slot(i), agents:[{ name, role, pose, x, y, slot, party, done, helpers:[{state}], selected }], phase, t, dt, motion, celebrate(kind) -> url }
  render(L) {
    if (!this.model) return false;
    this.layout(L);
    const refit = this.fit();
    const live = new Set();
    for (const a of L.agents) {
      live.add(a.name);
      const p = this.person(a, L);
      const z = a.y - L.WALL;
      // turn to face the way they walk; face the camera when seated
      if (a.pose === 'walk') { const dx = a.x - p.x, dz = a.y - p.y; if (Math.hypot(dx, dz) > 0.01) p.obj.rotation.y = Math.atan2(dx, dz); }
      else p.obj.rotation.y = a.pose === 'stand' ? -0.25 : 0;
      p.obj.position.x = a.x; p.obj.position.z = a.pose === 'couch' ? z - 2 : a.pose === 'sit' ? z : z;
      if (!p.P.hop) p.obj.position.y = 0;
      p.x = a.x; p.y = a.y;
      this.helpersFor(p, a, L);
      for (const h of p.helpers) animate(h.P, L.t, L.motion);
      animate(p.P, L.t, L.motion);
      // celebration: the theme's push/PR picture bouncing above the head, plus confetti
      if (a.party && !p.party) { p.party = sprite(imageTexture(this.url(a.party.file)), 10, 10); this.scene.add(p.party); if (L.motion) this.burst(a.x, 30, z); }
      if (!a.party && p.party) { this.scene.remove(p.party); p.party = null; }
      if (p.party) { p.party.position.set(a.x + 8, 40 + (L.motion ? Math.abs(Math.sin(L.t * 4)) * 3 : 0), z); }
      if (a.selected) { const s = L.slot(a.slot); this.marker.position.set(s.seatX + 2, 0.2, s.seatY - L.WALL + 6); }
    }
    this.marker.visible = L.agents.some((a) => a.selected);
    for (const [name, p] of this.people) if (!live.has(name)) { this.removePerson(p); if (p.party) this.scene.remove(p.party); this.people.delete(name); }
    this.light(L);
    this.tickConfetti(L.dt);
    this.gl.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
    return refit;
  }

  light(L) {
    const ph = PHASE_LIGHT[L.phase] || PHASE_LIGHT.morning;
    this.hemi.color.set(ph.sky); this.hemi.groundColor.set(ph.ground); this.hemi.intensity = ph.hemi;
    this.sun.color.set(ph.sun); this.sun.intensity = ph.sunI;
    this.lampLights.forEach((p) => { p.intensity = ph.lamps * 260; });
    const flick = L.motion ? 1 + 0.15 * Math.sin(L.t * 17) : 1;
    for (const f of this.lamps) f.scale.set(1, flick, 1);
    if (this.loungeObj && this.loungeObj.userData.fire) this.loungeObj.userData.fire.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(L.t * 7)), 1);
    // the CSS wall can't be lit, so dim it to match the room
    this.css.domElement.style.filter = ph.lamps > 1 ? 'brightness(.62) saturate(.85)' : ph.lamps > 0.8 ? 'brightness(.85)' : '';
  }

  burst(x, y, z) {
    const cols = ['#F29E1F', '#3B6FD8', '#2E9E6A', '#C2417A', '#9B4DCA', '#FFE27A', '#D8572A'];
    for (let k = 0; k < 40; k++) {
      const m = mesh(G.box(1.2, 0.2, 0.8), cols[k % cols.length], { material: ownMat(cols[k % cols.length]) });
      m.position.set(x, y, z);
      const a = Math.random() * TAU, up = 40 + Math.random() * 50, out = 15 + Math.random() * 30;
      m.userData.v = new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out);
      m.userData.life = 2 + Math.random();
      this.scene.add(m); this.confetti.push(m);
    }
  }
  tickConfetti(dt) {
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const m = this.confetti[i], v = m.userData.v;
      m.userData.life -= dt; v.y -= 90 * dt; v.multiplyScalar(1 - 0.6 * dt);
      m.position.addScaledVector(v, dt); m.rotation.x += dt * 9; m.rotation.z += dt * 7;
      if (m.position.y < 0.2) { m.position.y = 0.2; v.set(0, 0, 0); }
      m.material.opacity = Math.min(1, m.userData.life);
      if (m.userData.life <= 0) { this.scene.remove(m); m.material.dispose(); this.confetti.splice(i, 1); }
    }
  }

  // Floor coordinates (x, y as in the flat floor) -> CSS pixels in the stage.
  project(x, y, h = 0) {
    if (!this.L) return { left: -9999, top: -9999 };
    const v = new THREE.Vector3(x, h, y - this.L.WALL).project(this.camera);
    return { left: ((v.x + 1) / 2) * this.stage.clientWidth, top: ((1 - v.y) / 2) * this.stage.clientHeight };
  }
  // CSS pixels in the stage -> floor coordinates where that ray hits the floor.
  pick(px, py) {
    if (!this.L) return null;
    const ndc = new THREE.Vector2((px / this.stage.clientWidth) * 2 - 1, 1 - (py / this.stage.clientHeight) * 2);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x, y: hit.z + this.L.WALL };
  }
}

function tint(obj, deg) {
  obj.traverse((m) => {
    if (!m.isMesh || !m.material.color) return;
    const c = m.material.color.clone(), hsl = {}; c.getHSL(hsl);
    if (hsl.s < 0.25) return; // leave skin-ish and grey parts alone
    m.material = m.material.clone(); m.material.color.setHSL((hsl.h + deg / 360) % 1, hsl.s, hsl.l);
  });
}
function hashStr(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

let floor = null;
window.Floor3D = {
  supported: webglOk(),
  init(stage) { if (!floor && this.supported) floor = new Floor(stage); return !!floor; },
  setTheme: (theme, url) => (floor ? floor.setTheme(theme, url) : Promise.resolve(false)),
  setVisible: (on) => floor && floor.setVisible(on),
  render: (state) => (floor ? floor.render(state) : false),
  project: (x, y, h) => floor.project(x, y, h),
  ratio: () => (floor && floor.ratio) || 0,
  pick: (px, py) => (floor ? floor.pick(px, py) : null),
  // for tests and debugging: build one character without a page
  _build: buildCharacter,
};
window.dispatchEvent(new Event('floor3d-ready'));
