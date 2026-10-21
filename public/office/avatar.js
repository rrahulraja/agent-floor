// avatar.js: box-built "Crossy Road" characters for the 3D office.
//
// The look is ported from Hermes3D's retro-office avatars
// (src/features/retro-office/objects/agents.tsx and src/lib/avatars/profile.ts),
// MIT License, (c) 2026 Luke The Dev. The dimensions, face canvas (blush, nose), eye/brow/mouth boxes,
// hair, clothes, accessories, blink timing, expressions and the walk/sit/dance/workout/ping-pong
// formulas come from there. Knees, the extra poses, props and the hero costumes are new. Everything is
// procedural geometry: no downloaded or branded assets.
//
// Units: the figure is modelled in Hermes "model units" inside `body`, which is scaled by AGENT_SCALE (1.75),
// so a figure is about 1.0 world unit (metre) tall. root's origin is the floor under the feet, facing +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const AGENT_SCALE = 1.75;
export const SEAT_HEIGHT = 0.45; // world height of a chair seat that 'sit' / 'type' / 'nap' expect
const HEAD_SCALE = 1.28; // chibi head: bigger than Hermes's so faces and costumes read from the overview camera
const OUTLINE = 0.0035; // inked outline thickness, model units (about 6 mm in the world)
let outlines = true;
// Inked outlines double the draw calls; the engine turns them off on 'low' quality.
export function setAvatarOutlines(on) { outlines = !!on; }

// ---------------------------------------------------------------- shared caches
const geoCache = new Map();
const matCache = new Map();
const texCache = new Map();
function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
const boxGeo = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
// Soft toy edges: parts at least 2 cm across get rounded corners (a quarter of their thinnest side).
const softGeo = (w, h, d) => {
  const m = Math.min(w, h, d);
  return m < 0.02 ? boxGeo(w, h, d) : geo(`r${w}|${h}|${d}`, () => new RoundedBoxGeometry(w, h, d, 2, m * 0.24));
};
function mat(key, make) { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; }
const std = (color, rough = 0.6, metal = 0) => mat(`s${color}|${rough}|${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
const basic = (color) => mat(`c${color}`, () => new THREE.MeshBasicMaterial({ color }));
const glow = (color, opacity = 0.5) => mat(`g${color}|${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
const glass = (color, opacity) => mat(`l${color}|${opacity}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity, depthWrite: false }));
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
    texCache.set(key, t);
  }
  return t;
}
// Frees every shared geometry, material and texture (call once when the whole 3D office is torn down).
export function disposeAvatarCaches() {
  for (const g of geoCache.values()) g.dispose();
  for (const m of matCache.values()) m.dispose();
  for (const t of texCache.values()) t.dispose();
  geoCache.clear(); matCache.clear(); texCache.clear();
}

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hashSeed(seed) { // FNV-1a, as in Hermes profile.ts
  let h = 2166136261; const s = String(seed || 'agent');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, n) => arr[n % arr.length];
const _c = new THREE.Color(); const _hsl = {};
function shade(hex, dl) { _c.set(hex); _c.getHSL(_hsl); _c.setHSL(_hsl.h, _hsl.s, clamp(_hsl.l + dl, 0, 1)); return `#${_c.getHexString()}`; }
const ONE = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
const keyName = (n) => String(n || '').toLowerCase().replace(/[^a-z]/g, '');

// ---------------------------------------------------------------- office looks (Hermes profile.ts palettes)
const SKINS = ['#f7d7c2', '#f4c58a', '#d8a06e', '#c08458', '#a8714a', '#8a5a3b']; // darkest two lifted: ambient occlusion turned them black
const HAIR_STYLES = ['short', 'parted', 'spiky', 'bun'];
const HAIR_COLORS = ['#151515', '#3e2723', '#6b4f3a', '#7b341e', '#d6b56c', '#7c3aed', '#0891b2', '#db2777'];
const TOPS = ['tee', 'hoodie', 'jacket'];
const CLOTHES = ['#2d3748', '#7090ff', '#34d399', '#f59e0b', '#f43f5e', '#8b5cf6', '#f5f5f4', '#64748b'];
const BOTTOMS = ['pants', 'shorts', 'cuffed'];
const SHOES = ['#1a1a1a', '#1e3a8a', '#7c4a2d', '#e5e7eb'];
const HATS = ['none', 'cap', 'beanie'];

// Profile shape (every field optional, see norm()):
// { seed, scale, build:'normal'|'big', skin, hair:{style,color}, beard:{style,color}|null,
//   top:{style:'tee'|'hoodie'|'jacket'|'suit'|'coat'|'armor'|'tunic'|'robe'|'bare', color, accent, inner},
//   bottom:{style:'pants'|'shorts'|'cuffed', color}, shoes, boots, gloves, belt, trunks,
//   hat:'none'|'cap'|'beanie', hatColor, glasses:null|'square'|'round'|'shades', glassesTint, headset, backpack,
//   lanyard, tie, quiver, cape:{color,collar}|null, mask:color|null,
//   head:{ paint:null|'cowl'|'cowlLow'|'spider'|'iron'|'panther', color, letter, extras:[] , eyes:'normal'|'lens'|'spider'|'slit'|'iron'|'none'},
//   face:{ eyes:'focus'|'stern'|'wide'|'closed'|'smile', mouth:'normal'|'flat'|'none', cheeks:bool, scar, eyepatch },
//   chest:[ ...decal ops ], chestGlow:color|null, prop:{type,color}|null }
export function officeProfile(seed) {
  const h = hashSeed(String(seed || 'agent').trim() || 'agent');
  const top = pick(TOPS, h >>> 7), topColor = pick(CLOTHES, h >>> 9);
  return {
    seed: String(seed), skin: pick(SKINS, h),
    hair: { style: pick(HAIR_STYLES, h >>> 3), color: pick(HAIR_COLORS, h >>> 5) },
    top: { style: top, color: topColor }, bottom: { style: pick(BOTTOMS, h >>> 11), color: pick(CLOTHES, h >>> 13) },
    shoes: pick(SHOES, h >>> 15), hat: pick(HATS, h >>> 17), hatColor: topColor,
    glasses: (h >>> 19) % 2 ? 'square' : null, headset: Boolean((h >>> 20) % 2), backpack: Boolean((h >>> 21) % 2),
  };
}

// Helpers (subagents): smaller and simpler. 'office' -> intern with a lanyard; 'heroes' -> S.H.I.E.L.D. agent in a dark suit.
export function helperProfile(seed, theme) {
  const h = hashSeed(seed);
  if (theme === 'heroes') return shieldAgent(seed, h, 0.8);
  return {
    seed: String(seed), scale: 0.8, skin: pick(SKINS, h),
    hair: { style: pick(['short', 'parted', 'bun', 'short'], h >>> 3), color: pick(HAIR_COLORS.slice(0, 5), h >>> 5) },
    top: { style: (h >>> 7) % 3 ? 'tee' : 'hoodie', color: pick(['#7dd3fc', '#86efac', '#fcd34d', '#fda4af', '#c4b5fd', '#e5e7eb'], h >>> 9) },
    bottom: { style: 'pants', color: pick(['#334155', '#475569', '#1e3a8a', '#57534e'], h >>> 11) },
    shoes: pick(SHOES, h >>> 15), glasses: (h >>> 19) % 3 === 0 ? 'square' : null, lanyard: '#2563eb',
  };
}
function shieldAgent(seed, h, scale = 1) {
  return {
    seed: String(seed), scale, skin: pick(SKINS, h), costume: true,
    hair: { style: pick(['short', 'buzz', 'parted'], h >>> 3), color: pick(['#151515', '#3e2723', '#6b4f3a'], h >>> 5) },
    top: { style: 'suit', color: '#1E2235', inner: '#f1f5f9' }, tie: '#0b0d14',
    bottom: { style: 'pants', color: '#1E2235' }, shoes: '#0b0d14', glasses: 'shades',
    chest: [{ op: 'eagle', x: 96, y: 34, r: 9 }], chestOnTop: true,
  };
}

// ---------------------------------------------------------------- heroes
const RED = '#C8352E', GOLD = '#F2B825', WHITE = '#F4F1E8';
// Turns a theme cast entry into a costume. Known characters (by name) get hand-tuned details;
// anything else is built generically from the cast fields.
export function heroProfile(cast, seed) {
  const c = cast || {}; const o = c.outfit || {}; const f = c.face || {};
  const name = keyName(c.name);
  if (name.includes('shield')) return shieldAgent(seed, hashSeed(seed), 1);
  const P = {
    seed: String(seed || c.name || 'hero'), name: c.name || '', skin: c.skin || '#F2C9A0', costume: true,
    hair: { style: (c.hair && c.hair.style) || 'short', color: (c.hair && c.hair.color) || '#2B1D14' },
    beard: c.beard && c.beard.style ? { style: c.beard.style, color: c.beard.color || '#2B1D14' } : null,
    top: { style: o.style || 'tunic', color: o.color || '#2F5FC4', accent: o.accent || shade(o.color || '#2F5FC4', -0.15), inner: o.inner },
    bottom: { style: 'pants', color: o.color || '#2F5FC4' },
    shoes: null, boots: o.accent || null, gloves: null, belt: o.accent || null,
    glasses: f.glasses === 'round' ? 'round' : null, glassesTint: f.glasses === 'round' ? '#8a5a1a' : null,
    cape: c.cape ? { color: c.cape.color } : null, mask: c.mask ? c.mask.color : null,
    head: { paint: null, color: null, extras: [], eyes: 'normal' },
    face: { eyes: f.eyes || 'focus', mouth: f.mouth || 'normal', cheeks: f.cheeks !== false, scar: !!f.scar },
    chest: [], chestGlow: null,
    prop: c.prop && c.prop.type ? { type: c.prop.type, color: c.prop.color } : (c.pose === 'mug' ? { type: 'mug' } : null),
  };
  const w = c.wear || null;
  if (w && (w.type === 'helmet' || w.type === 'hood')) { P.head.paint = 'cowl'; P.head.color = w.color; P.hair.style = 'none'; }
  if (w && (w.type === 'tiara' || w.type === 'headband')) P.head.band = { color: w.color || GOLD, gem: w.gem || RED };
  if (P.mask) P.head.eyes = 'lens';
  if (P.top.style === 'armor') { P.gloves = P.top.accent; }
  if (P.top.style === 'tunic') { P.gloves = null; }
  if (P.top.style === 'jacket') { P.boots = null; P.belt = null; P.shoes = '#14161f'; P.bottom.color = shade(o.color || '#333', -0.05); P.top.inner = o.inner || '#f1f5f9'; }
  if (P.top.style === 'robe') { P.boots = '#2A2F45'; }
  if (P.top.style === 'bare') { P.bottom = { style: 'shorts', color: o.color || '#6A3E9A', torn: true }; P.shoes = P.skin; P.boots = null; P.belt = null; P.build = 'big'; }
  if (c.emblem && c.emblem.shape) {
    const e = c.emblem; const glowy = e.shape === 'circle' && isLight(e.color) && !/^#f2b825$/i.test(e.color);
    if (glowy) P.chestGlow = e.color; else P.chest.push({ op: e.shape, color: e.color, x: 64, y: 40, r: 24 });
  }

  // ---- hand-tuned characters
  switch (name) {
    case 'captainamerica':
      P.head.paint = 'cowl'; P.head.letter = 'A'; P.head.extras.push('capWings'); P.gloves = RED; P.boots = RED; P.belt = '#6b4a33';
      P.chest = [{ op: 'stripes', colors: [RED, WHITE] }, { op: 'star', color: WHITE, x: 64, y: 34, r: 24 }]; break;
    case 'ironman':
      P.head.paint = 'iron'; P.head.color = '#B0201E'; P.head.eyes = 'iron'; P.hair.style = 'none'; P.beard = null;
      P.gloves = '#B0201E'; P.boots = '#B0201E'; P.belt = GOLD; P.sleeve = GOLD; P.thigh = GOLD; P.chestGlow = '#9FE8FF';
      P.chest = [{ op: 'ironPlates', color: GOLD }]; break;
    case 'doctorstrange':
      P.hair.temples = '#d4d4d4'; P.cape = { color: RED, collar: true }; P.belt = '#C9A15A'; P.cuffs = '#2A2F45';
      P.beard = { style: 'goatee', color: '#6b6b6b' };
      P.chest = [{ op: 'robeV', color: '#2A2F45' }, { op: 'amulet', color: GOLD, x: 64, y: 32 }]; break;
    case 'theflash': case 'flash':
      P.head.paint = 'cowl'; P.head.extras.push('flashWings'); P.head.eyes = 'normal'; P.mask = null; P.gloves = '#C8201E'; P.boots = GOLD; P.belt = GOLD;
      P.chest = [{ op: 'flash', color: GOLD, x: 64, y: 40, r: 25 }]; break;
    case 'hawkeye':
      P.quiver = '#3a2a1a'; P.gloves = '#2A1A3A'; P.boots = '#2A1A3A'; P.belt = '#2A1A3A'; P.sleeveless = true;
      P.chest = [{ op: 'strap', color: '#2A1A3A' }]; break;
    case 'thor':
      P.cape = { color: RED }; P.gloves = '#3A3F55'; P.boots = '#2a2d3b'; P.belt = '#C7CCD8'; P.bottom.color = '#23263a';
      P.chest = [{ op: 'discs', color: '#C7CCD8' }]; break;
    case 'greenlantern':
      P.gloves = '#f4f4f4'; P.boots = '#1E2235'; P.bottom.color = '#1F8A3A'; P.chestGlow = '#5CE87A';
      P.chest = [{ op: 'shoulders', color: '#1E2235' }]; break;
    case 'blackpanther':
      P.head.paint = 'panther'; P.head.color = '#1E1E2A'; P.head.eyes = 'slit'; P.head.extras.push('catEars'); P.gloves = '#1E1E2A'; P.boots = '#1E1E2A'; P.belt = '#2a2a3a';
      P.chest = [{ op: 'necklace', color: '#D8D2F0' }]; break;
    case 'batman':
      P.head.paint = 'cowlLow'; P.head.extras.push('batEars'); P.gloves = '#1E2235'; P.boots = '#1E2235'; P.belt = GOLD; P.trunks = '#1E2235';
      P.chest = [{ op: 'bat', color: GOLD, x: 64, y: 40 }]; break;
    case 'spiderman':
      P.head.paint = 'spider'; P.head.color = '#C8201E'; P.head.eyes = 'spider'; P.hair.style = 'none'; P.face.mouth = 'none';
      P.gloves = '#C8201E'; P.boots = '#C8201E'; P.belt = null; P.bottom.color = '#1F4AA8'; P.thigh = null;
      P.chest = [{ op: 'spider', color: '#1E2235' }]; break;
    case 'nickfury':
      P.top.style = 'coat'; P.top.inner = '#2A2A35'; P.face.eyepatch = true; P.beard = { style: 'goatee', color: '#1B1B1B' }; break;
    case 'blackwidow':
      P.gloves = '#1E1E2A'; P.boots = '#1E1E2A'; P.belt = '#3A3F55'; P.chest = [{ op: 'hourglass', color: RED, x: 64, y: 122 }]; break;
    case 'hulk':
      P.hair.style = 'spiky'; P.chest = [{ op: 'pecs', color: shade(P.skin, -0.12) }]; break;
    case 'captainmarvel':
      P.gloves = RED; P.boots = RED; P.belt = GOLD; P.chest = [{ op: 'sides', color: RED }, { op: 'star', color: GOLD, x: 64, y: 40, r: 22 }]; break;
    case 'robin':
      P.bottom.color = '#1F7A3A'; P.gloves = '#1F7A3A'; P.boots = '#1E2235'; P.belt = GOLD; P.cape = { color: GOLD };
      P.chest = [{ op: 'letter', letter: 'R', color: GOLD, ink: RED, x: 92, y: 34, r: 17 }]; break;
    case 'wonderwoman':
      P.bottom.color = '#1F3A9A'; P.trunks = '#1F3A9A'; P.gloves = null; P.bracers = '#C7CCD8'; P.boots = RED; P.belt = GOLD; P.top.style = 'tunic'; P.sleeveless = true;
      P.head.band = { color: GOLD, gem: RED, star: true };
      P.chest = [{ op: 'ww', color: GOLD, x: 64, y: 40 }]; break;
    case 'tonystark':
      P.chestGlow = '#9FE8FF'; P.chestGlowSmall = true; P.beard = { style: 'goatee', color: '#2B1D14' }; break;
    case 'superman':
      P.hair.curl = true; P.trunks = RED; P.belt = GOLD; P.boots = RED; P.gloves = null;
      P.chest = [{ op: 'super', color: RED, fill: GOLD, x: 64, y: 44 }]; break;
    default: break;
  }
  if (!P.shoes) P.shoes = P.boots || '#1a1a1a';
  if (P.boots === null && P.top.style !== 'bare' && P.top.style !== 'jacket' && P.top.style !== 'coat') P.boots = P.shoes;
  return P;
}
function isLight(hex) { _c.set(hex); _c.getHSL(_hsl); return _hsl.l > 0.6; }

// ---------------------------------------------------------------- normalise
function norm(p) {
  const P = { ...(p || {}) };
  P.seed = String(P.seed || 'agent');
  P.scale = P.scale || 1; P.build = P.build || 'normal';
  P.skin = P.skin || '#f4c58a';
  P.hair = { style: 'short', color: '#3e2723', ...(P.hair || {}) };
  P.top = { style: 'tee', color: '#7090ff', ...(P.top || {}) };
  P.bottom = { style: 'pants', color: '#2d3748', ...(P.bottom || {}) };
  P.shoes = P.shoes || '#1a1a1a';
  P.hat = P.hat || 'none'; P.hatColor = P.hatColor || P.top.color;
  P.head = { paint: null, extras: [], eyes: 'normal', ...(P.head || {}) };
  P.face = { eyes: 'focus', mouth: 'normal', cheeks: true, ...(P.face || {}) };
  P.chest = P.chest || [];
  return P;
}

// ---------------------------------------------------------------- canvas drawings
function starPath(ctx, x, y, r, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function boltPath(ctx, x, y, s) {
  const pts = [[0.15, -1], [-0.45, 0.1], [-0.02, 0.1], [-0.2, 1], [0.5, -0.2], [0.05, -0.2], [0.3, -1]];
  ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * s, y + py * s)); ctx.closePath();
}
function drawFace(ctx, P) {
  const W = 128;
  ctx.fillStyle = P.skin; ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(0, 0, W, 20);
  if (P.face.cheeks) {
    ctx.fillStyle = 'rgba(236,112,112,0.22)'; ctx.beginPath();
    ctx.ellipse(30, 84, 13, 8, 0, 0, Math.PI * 2); ctx.ellipse(98, 84, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (P.face.scar) { ctx.strokeStyle = shade(P.skin, -0.22); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(78, 30); ctx.lineTo(90, 84); ctx.moveTo(98, 36); ctx.lineTo(104, 80); ctx.stroke(); }
  const H = P.head; const col = H.color;
  if (H.paint === 'cowl' || H.paint === 'cowlLow') {
    const mid = H.paint === 'cowlLow' ? 82 : 74; const side = H.paint === 'cowlLow' ? 108 : 98;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, side);
    ctx.lineTo(108, side - 6); ctx.quadraticCurveTo(64, 2 * mid - (side - 6), 20, side - 6); ctx.lineTo(0, side); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, 0, W, 16);
    if (H.letter) { ctx.fillStyle = WHITE; ctx.font = 'bold 34px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(H.letter, 64, 26); }
  } else if (H.paint === 'spider') {
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(30,10,10,0.75)'; ctx.lineWidth = 2;
    const cx = 64, cy = 70;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140); ctx.stroke(); }
    for (let r = 18; r < 120; r += 20) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; const ma = ((i - 0.5) / 12) * Math.PI * 2; if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(cx + Math.cos(ma) * r * 0.86, cy + Math.sin(ma) * r * 0.86, x, y); }
      ctx.stroke();
    }
  } else if (H.paint === 'iron') {
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = GOLD; ctx.beginPath();
    ctx.moveTo(22, 30); ctx.lineTo(106, 30); ctx.lineTo(106, 84); ctx.lineTo(90, 112); ctx.lineTo(64, 122); ctx.lineTo(38, 112); ctx.lineTo(22, 84); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(GOLD, -0.2); ctx.fillRect(46, 98, 36, 4);
    ctx.fillStyle = col; ctx.fillRect(58, 0, 12, 30);
  } else if (H.paint === 'panther') {
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(184,162,232,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 40); ctx.moveTo(40, 0); ctx.lineTo(30, 60); ctx.lineTo(42, 110); ctx.moveTo(88, 0); ctx.lineTo(98, 60); ctx.lineTo(86, 110); ctx.stroke();
  }
}
function drawChest(ctx, ops, W, H) {
  for (const o of ops) {
    ctx.save();
    switch (o.op) {
      case 'star': ctx.fillStyle = o.color; starPath(ctx, o.x, o.y, o.r); ctx.fill(); break;
      case 'bolt': ctx.fillStyle = o.color; boltPath(ctx, o.x, o.y, o.r); ctx.fill(); break;
      case 'circle': ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = shade(o.color, -0.25); ctx.lineWidth = 3; ctx.stroke(); break;
      case 'diamond': ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(o.x, o.y - o.r); ctx.lineTo(o.x + o.r * 0.8, o.y); ctx.lineTo(o.x, o.y + o.r); ctx.lineTo(o.x - o.r * 0.8, o.y); ctx.closePath(); ctx.fill(); break;
      case 'stripes': { const [a, b] = o.colors; for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * 16, 66, 16, 46); } break; }
      case 'flash': ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = o.color; boltPath(ctx, o.x, o.y, o.r * 0.95); ctx.fill(); ctx.strokeStyle = '#9a1414'; ctx.lineWidth = 1.5; ctx.stroke(); break;
      case 'bat': {
        ctx.fillStyle = o.color; ctx.beginPath(); ctx.ellipse(o.x, o.y, 34, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1E2235'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#14161f'; ctx.beginPath(); const x = o.x, y = o.y;
        ctx.moveTo(x - 28, y - 4); ctx.lineTo(x - 10, y - 8); ctx.lineTo(x - 5, y - 14); ctx.lineTo(x - 3, y - 7); ctx.lineTo(x + 3, y - 7); ctx.lineTo(x + 5, y - 14); ctx.lineTo(x + 10, y - 8); ctx.lineTo(x + 28, y - 4);
        ctx.lineTo(x + 20, y + 4); ctx.lineTo(x + 14, y + 2); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 2, y + 4); ctx.lineTo(x, y + 12); ctx.lineTo(x - 2, y + 4); ctx.lineTo(x - 8, y + 8); ctx.lineTo(x - 14, y + 2); ctx.lineTo(x - 20, y + 4); ctx.closePath(); ctx.fill();
        break;
      }
      case 'spider': {
        ctx.fillStyle = '#1F4AA8'; ctx.fillRect(0, 50, 20, H - 50); ctx.fillRect(W - 20, 50, 20, H - 50);
        ctx.strokeStyle = 'rgba(30,10,10,0.7)'; ctx.lineWidth = 2; const cx = 64, cy = 40;
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 160, cy + Math.sin(a) * 160); ctx.stroke(); }
        for (let r = 22; r < 160; r += 24) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = o.color; ctx.strokeStyle = o.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy - 6, 5, 6, 0, 0, Math.PI * 2); ctx.ellipse(cx, cy + 8, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
        for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx, cy + 2 + k * 2); ctx.lineTo(cx + s * 14, cy - 12 + k * 9); ctx.lineTo(cx + s * 20, cy - 4 + k * 10); ctx.stroke(); }
        break;
      }
      case 'super': {
        const x = o.x, y = o.y;
        const shield = () => { ctx.beginPath(); ctx.moveTo(x - 24, y - 26); ctx.lineTo(x + 24, y - 26); ctx.lineTo(x + 38, y - 10); ctx.lineTo(x, y + 30); ctx.lineTo(x - 38, y - 10); ctx.closePath(); };
        ctx.fillStyle = o.color; shield(); ctx.fill();
        ctx.save(); ctx.translate(x, y - 2); ctx.scale(0.78, 0.78); ctx.translate(-x, -y); ctx.fillStyle = o.fill; shield(); ctx.fill(); ctx.restore();
        ctx.fillStyle = o.color; ctx.font = 'bold 36px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', x, y - 6);
        break;
      }
      case 'letter': ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1E2235'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = o.ink; ctx.font = `bold ${Math.round(o.r * 1.4)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.letter, o.x, o.y + 1); break;
      case 'hourglass': ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(o.x - 9, o.y - 9); ctx.lineTo(o.x + 9, o.y - 9); ctx.lineTo(o.x - 9, o.y + 9); ctx.lineTo(o.x + 9, o.y + 9); ctx.closePath(); ctx.fill(); break;
      case 'discs': for (const cx of [38, 90]) for (const cy of [26, 58, 90]) { ctx.fillStyle = shade(o.color, -0.25); ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill(); } break;
      case 'pecs': ctx.strokeStyle = o.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(64, 12); ctx.lineTo(64, 104); ctx.moveTo(14, 48); ctx.quadraticCurveTo(38, 64, 62, 50); ctx.moveTo(66, 50); ctx.quadraticCurveTo(90, 64, 114, 48);
        for (const yy of [74, 92]) { ctx.moveTo(44, yy); ctx.lineTo(60, yy); ctx.moveTo(68, yy); ctx.lineTo(84, yy); } ctx.stroke(); break;
      case 'necklace': ctx.strokeStyle = o.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(64, 40); ctx.lineTo(102, 0); ctx.stroke();
        ctx.fillStyle = o.color; for (let i = 0; i <= 8; i++) { const tt = i / 8; const x = tt < 0.5 ? 26 + tt * 2 * 38 : 64 + (tt - 0.5) * 2 * 38; const y = tt < 0.5 ? tt * 2 * 40 : 40 - (tt - 0.5) * 2 * 40; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 10); ctx.fill(); }
        ctx.strokeStyle = 'rgba(184,162,232,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(34, 50); ctx.lineTo(48, 130); ctx.moveTo(94, 50); ctx.lineTo(80, 130); ctx.stroke(); break;
      case 'ironPlates': ctx.fillStyle = o.color; ctx.fillRect(0, 0, 14, H); ctx.fillRect(W - 14, 0, 14, H); ctx.fillRect(44, 70, 40, 36); ctx.fillStyle = shade(o.color, -0.2); ctx.fillRect(44, 86, 40, 3); ctx.fillRect(62, 70, 3, 36); break;
      case 'robeV': ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(64, 70); ctx.lineTo(98, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#C9A15A'; ctx.fillRect(0, 96, W, 6); break;
      case 'amulet': ctx.fillStyle = shade(o.color, -0.2); ctx.beginPath(); ctx.arc(o.x, o.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill(); break;
      case 'strap': ctx.strokeStyle = o.color; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(108, -4); ctx.lineTo(18, 146); ctx.stroke(); break;
      case 'shoulders': ctx.fillStyle = o.color; ctx.fillRect(0, 0, W, 22); ctx.fillRect(0, 0, 18, H); ctx.fillRect(W - 18, 0, 18, H); break;
      case 'sides': ctx.fillStyle = o.color; ctx.fillRect(0, 0, 24, H); ctx.fillRect(W - 24, 0, 24, H); ctx.fillStyle = GOLD; ctx.fillRect(24, 0, 4, H); ctx.fillRect(W - 28, 0, 4, H); break;
      case 'ww': { // two linked gold Ws
        ctx.strokeStyle = o.color; ctx.lineWidth = 9; ctx.lineJoin = 'round';
        for (const dy of [0, 16]) { ctx.beginPath(); ctx.moveTo(o.x - 44, o.y - 14 + dy); ctx.lineTo(o.x - 22, o.y + 12 + dy); ctx.lineTo(o.x, o.y - 6 + dy); ctx.lineTo(o.x + 22, o.y + 12 + dy); ctx.lineTo(o.x + 44, o.y - 14 + dy); ctx.stroke(); }
        break;
      }
      case 'eagle': ctx.fillStyle = '#C7CCD8'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1E2235';
        ctx.beginPath(); ctx.moveTo(o.x - 7, o.y - 3); ctx.lineTo(o.x, o.y + 6); ctx.lineTo(o.x + 7, o.y - 3); ctx.lineTo(o.x, o.y + 1); ctx.closePath(); ctx.fill(); break;
      default: break;
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- expressions (Hermes agent states)
const EXPR = {
  idle: { open: 1.12, min: 0, max: 9, sx: 1.12, dy: 0, mouth: [1.35, 0.34, -0.008], corners: 'smile', brow: [0.1, 0.006], blink: [4.0, 0.2] },
  focused: { open: 0.84, min: 0.48, max: 9, sx: 1.06, dy: -0.006, mouth: [0.92, 0.14, 0.001], corners: null, brow: [-0.28, 0], blink: [2.83, 0.2] },
  error: { open: 0.92, min: 0.28, max: 9, sx: 1.2, dy: -0.004, mouth: [1.28, 0.16, -0.006], corners: 'frown', brow: [0.42, -0.004], blink: [2.0, 0.3] },
  sleepy: { open: 0.2, min: 0, max: 0.2, sx: 1.12, dy: -0.008, mouth: [0.5, 0.12, -0.002], corners: null, brow: [0.24, -0.008], blink: [3.0, 0.43] },
  happy: { open: 0.5, min: 0, max: 9, sx: 1.18, dy: 0.004, mouth: [1.5, 0.55, -0.01], corners: 'smile', brow: [0.18, 0.012], blink: [4.0, 0.2] },
};
const POSES = new Set(['stand', 'walk', 'sit', 'type', 'raise', 'cheer', 'dance', 'nap', 'talk', 'carry', 'pingpong', 'workout-run', 'workout-lift', 'workout-bike', 'workout-box']);
const SLOW_KEYS = new Set(['hipsY', 'torsoRX', 'capeA', 'capeB']);
const SEATED = new Set(['sit', 'type', 'nap', 'workout-bike']);

// Head-local feature heights (head group origin = top of the torso, Hermes y 0.38).
const EYE_Y = 0.095, BROW_Y = 0.14, MOUTH_Y = 0.056, HEAD_C = 0.09, HEAD_TOP = 0.17;

// ---------------------------------------------------------------- avatar
export function buildAvatar(profile) {
  const P = norm(profile);
  const seedHash = hashSeed(P.seed);
  const phase = (seedHash % 6283) / 1000; // deterministic per-avatar phase, 0..2pi
  const blinkOffset = (seedHash % 997) / 97;
  const big = P.build === 'big';
  const bx = big ? 1.3 : 1, bz = big ? 1.25 : 1, by = big ? 1.08 : 1, ax = big ? 1.45 : 1, lx = big ? 1.3 : 1;

  const root = new THREE.Group(); root.name = 'avatar';
  const body = new THREE.Group(); body.scale.setScalar(AGENT_SCALE * P.scale); root.add(body);
  const add = (parent, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o;
  };
  const B = (parent, w, h, d, color, x, y, z, rx, ry, rz) => add(parent, softGeo(w, h, d), typeof color === 'string' ? std(color) : color, x, y, z, rx, ry, rz);
  const hairMat = (c) => std(c, 0.35, 0.05);

  // blob shadow (Hermes: circle 0.12, black 20%)
  const shadow = new THREE.Mesh(geo('blob', () => new THREE.CircleGeometry(1, 20)), mat('blob', () => new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.2, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004; shadow.scale.setScalar(0.12 * AGENT_SCALE * P.scale * (big ? 1.3 : 1)); shadow.renderOrder = 1;
  shadow.userData.noShadow = true; root.add(shadow);

  const S = P.top.style;
  const skin = P.skin, topC = P.top.color, accent = P.top.accent || shade(topC, -0.15);
  const pantsC = P.bottom.color;
  const handC = P.gloves || skin;
  const legTop = P.thigh || pantsC;
  const boots = P.boots || null;

  // ---- hips + legs
  const HIP_Y = 0.18;
  const hips = new THREE.Group(); hips.position.y = HIP_Y; body.add(hips);
  const pelvisC = P.trunks || pantsC;
  if (S !== 'bare') B(hips, 0.18 * bx - 0.004, 0.04, 0.1 * bz - 0.004, pelvisC, 0, -0.02, 0);
  else B(hips, 0.18 * bx - 0.004, 0.04, 0.1 * bz - 0.004, pantsC, 0, -0.02, 0);
  const legs = [];
  for (const s of [-1, 1]) { // s=-1: character's right (-X)
    const thigh = new THREE.Group(); thigh.position.set(s * 0.045 * (big ? 1.28 : 1), 0, 0); hips.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.1; thigh.add(knee);
    const tw = 0.07 * lx, td = 0.08 * lx;
    if (P.bottom.style === 'shorts') {
      B(thigh, tw + 0.002, 0.065, td + 0.002, pantsC, 0, -0.0325, 0);
      if (P.bottom.torn) { B(thigh, 0.024, 0.016, td + 0.004, pantsC, s * 0.018, -0.07, 0); B(thigh, 0.02, 0.012, td + 0.004, pantsC, -s * 0.02, -0.068, 0); }
      B(thigh, tw * 0.8, 0.04, td * 0.78, skin, 0, -0.08, 0);
      B(knee, tw * 0.76, 0.05, td * 0.74, boots || skin, 0, -0.025, 0);
    } else {
      B(thigh, tw, 0.1, td, legTop, 0, -0.05, 0);
      B(knee, tw - 0.002, 0.05, td - 0.002, boots || pantsC, 0, -0.025, 0);
      if (P.bottom.style === 'cuffed' && !boots) B(knee, tw + 0.004, 0.02, td + 0.004, '#d1d5db', 0, -0.04, 0);
      if (boots) B(knee, tw + 0.004, 0.012, td + 0.004, shade(boots, -0.08), 0, 0.0, 0);
    }
    if (P.trunks) B(thigh, tw + 0.004, 0.03, td + 0.004, P.trunks, 0, -0.012, 0);
    if (S === 'robe' || S === 'coat') B(thigh, 0.092 * bx, S === 'coat' ? 0.13 : 0.11, 0.104 * bz, topC, s * 0.001, S === 'coat' ? -0.06 : -0.05, 0);
    B(knee, 0.07 * lx + (big ? 0.01 : 0), 0.03, 0.12 * lx, P.shoes, 0, -0.065, 0.02);
    legs.push({ thigh, knee });
  }
  const [legR, legL] = legs;

  // ---- torso
  const torso = new THREE.Group(); hips.add(torso);
  const torsoC = S === 'bare' ? skin : topC;
  const TW = 0.18 * bx, TH = 0.2 * by, TD = 0.1 * bz;
  B(torso, TW, TH, TD, torsoC, 0, TH / 2, 0);
  let frontZ = TD / 2;
  if (P.belt && S !== 'bare') B(torso, TW + 0.006, 0.026, TD + 0.006, P.belt, 0, 0.03, 0);
  if (S === 'hoodie') {
    B(torso, 0.17, 0.1, 0.03, topC, 0, 0.17, -0.06);
    B(torso, 0.11, 0.03, 0.012, '#d1d5db', 0, 0.04, 0.056);
  }
  if (S === 'jacket' || S === 'suit' || S === 'coat') {
    const inner = P.top.inner || '#f8fafc';
    B(torso, 0.044, TH - 0.004, 0.012, inner, 0, TH / 2, TD / 2 + 0.001);
    for (const s of [-1, 1]) B(torso, 0.022, 0.09, 0.008, shade(topC, -0.08), s * 0.03, 0.15, TD / 2 + 0.006, 0, 0, s * 0.35);
    frontZ = TD / 2 + 0.01;
    if (P.tie) B(torso, 0.016, 0.13, 0.006, P.tie, 0, 0.125, TD / 2 + 0.009);
    if (S === 'coat') B(torso, TW + 0.006, 0.06, TD + 0.006, topC, 0, 0.17, 0); // turned-up collar band
  }
  if (P.lanyard) {
    for (const s of [-1, 1]) B(torso, 0.008, 0.1, 0.006, P.lanyard, s * 0.022, 0.15, TD / 2 + 0.003, 0, 0, s * -0.32);
    B(torso, 0.04, 0.05, 0.006, '#f8fafc', 0, 0.085, TD / 2 + 0.005);
    B(torso, 0.04, 0.012, 0.007, P.lanyard, 0, 0.104, TD / 2 + 0.006);
  }
  if (P.backpack) {
    const bp = new THREE.Group(); bp.position.set(0, 0.1, -0.08); torso.add(bp);
    B(bp, 0.15, 0.18, 0.06, topC); B(bp, 0.018, 0.16, 0.018, '#cbd5e1', -0.06, 0.02, 0.02); B(bp, 0.018, 0.16, 0.018, '#cbd5e1', 0.06, 0.02, 0.02);
  }
  if (P.quiver) {
    const q = new THREE.Group(); q.position.set(-0.02, 0.12, -0.075); q.rotation.z = -0.45; torso.add(q);
    B(q, 0.05, 0.17, 0.045, P.quiver);
    for (const dx of [-0.012, 0, 0.012]) { B(q, 0.006, 0.05, 0.006, '#d4c4a0', dx, 0.1, 0); B(q, 0.014, 0.02, 0.006, '#7a1f1f', dx, 0.13, 0); }
  }
  // chest decal (one canvas per costume, transparent background)
  if (P.chest.length) {
    const key = `chest|${JSON.stringify(P.chest)}`;
    const tex = canvasTex(key, 128, 142, (ctx, w, h) => drawChest(ctx, P.chest, w, h));
    const m = mat(key, () => new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.5, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const plane = add(torso, geo(`plane${TW}|${TH}`, () => new THREE.PlaneGeometry(TW, TH)), m, 0, TH / 2, frontZ + 0.004);
    plane.castShadow = false;
  }
  if (P.chestGlow) {
    const r = P.chestGlowSmall ? 0.012 : 0.022;
    const g = new THREE.Group(); g.position.set(0, P.chestGlowSmall ? 0.135 : 0.14, frontZ + 0.003); torso.add(g);
    add(g, geo(`cyl${r}`, () => new THREE.CylinderGeometry(r, r, 0.008, 20)), basic(P.chestGlow), 0, 0, 0, Math.PI / 2, 0, 0);
    add(g, geo(`ring${r}`, () => new THREE.TorusGeometry(r + 0.004, 0.004, 6, 20)), std('#8a90a6', 0.4, 0.5), 0, 0, 0.002);
    const halo = add(g, geo('halo', () => new THREE.CircleGeometry(1, 20)), glow(P.chestGlow, 0.35), 0, 0, 0.006); halo.scale.setScalar(r * 2.2); halo.castShadow = false;
  }
  // cape: two box-cloth panels hanging from the shoulders, swaying
  let capeUp = null, capeLo = null;
  if (P.cape) {
    const cc = P.cape.color;
    capeUp = new THREE.Group(); capeUp.position.set(0, TH - 0.01, -TD / 2 - 0.008); torso.add(capeUp);
    B(capeUp, TW + 0.02, 0.17, 0.012, cc, 0, -0.085, 0);
    capeLo = new THREE.Group(); capeLo.position.y = -0.17; capeUp.add(capeLo);
    B(capeLo, TW + 0.07, 0.17, 0.012, cc, 0, -0.085, 0);
    for (const s of [-1, 1]) B(torso, 0.075, 0.02, 0.112 * bz, cc, s * (TW / 2 + 0.003), TH + 0.006, -0.004);
    if (P.cape.collar) for (const s of [-1, 1]) B(torso, 0.06, 0.11, 0.012, shade(cc, -0.05), s * 0.07, TH + 0.06, -0.035, -0.15, s * -0.55, s * -0.2);
  }

  // ---- arms (pivot at the shoulder)
  const SHOULDER_Y = 0.18 * by;
  const AW = 0.06 * ax;
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * (TW / 2 + AW / 2), SHOULDER_Y, 0); torso.add(arm);
    const sleeveC = P.sleeve || (S === 'bare' ? skin : topC);
    if (S === 'bare') B(arm, AW, 0.15, AW, skin, 0, -0.075, 0);
    else if (S === 'tee' || P.sleeveless) {
      if (P.sleeveless) B(arm, AW + 0.002, 0.04, AW + 0.002, topC, 0, -0.02, 0);
      else B(arm, AW + 0.002, 0.06, AW + 0.002, topC, 0, -0.03, 0);
      B(arm, AW - 0.006, 0.15, AW - 0.006, skin, 0, -0.075, 0);
      if (P.sleeveless) B(arm, AW - 0.002, 0.05, AW - 0.002, P.bracers || P.gloves || '#2A1A3A', 0, -0.12, 0); // arm guard
    } else B(arm, AW, 0.15, AW, sleeveC, 0, -0.075, 0);
    if (S === 'hoodie') B(arm, AW + 0.004, 0.03, AW + 0.004, '#d1d5db', 0, -0.135, 0);
    if (S === 'robe') B(arm, AW + 0.012, 0.035, AW + 0.012, P.cuffs || accent, 0, -0.13, 0);
    if (S === 'armor' && !P.sleeveless) B(arm, AW + 0.014, 0.03, AW + 0.014, P.top.accent ? shade(topC, 0.06) : topC, 0, -0.005, 0);
    if (P.gloves && S !== 'bare' && !P.sleeveless) B(arm, AW + 0.004, 0.03, AW + 0.004, P.gloves, 0, -0.14, 0);
    const hw = big ? 0.066 : 0.05;
    B(arm, hw, hw, hw, handC, 0, -0.17, 0);
    const hand = new THREE.Group(); hand.position.y = -0.19; arm.add(hand);
    // workout extras
    const dumb = new THREE.Group(); dumb.visible = false; hand.add(dumb);
    B(dumb, 0.008, 0.008, 0.08, '#475569', 0, 0.02, 0); B(dumb, 0.032, 0.032, 0.016, '#1f2937', 0, 0.02, 0.04); B(dumb, 0.032, 0.032, 0.016, '#1f2937', 0, 0.02, -0.04);
    const glove = B(hand, 0.07, 0.07, 0.075, '#dc2626', 0, 0.022, 0.006); glove.visible = false;
    arms.push({ arm, hand, dumb, glove });
  }
  const [armR, armL] = arms;
  const front = new THREE.Group(); front.position.set(0, 0.14, 0.17); torso.add(front); // carry anchor: on top of the forward hands

  // ---- head
  const head = new THREE.Group(); head.position.y = 0.2 * by; head.scale.setScalar(HEAD_SCALE); torso.add(head);
  B(head, 0.07, 0.05, 0.07, P.head.paint === 'spider' || P.head.paint === 'iron' || P.head.paint === 'panther' ? P.head.color : skin, 0, 0.01, 0);
  const coverC = P.head.paint ? P.head.color : null;
  const faceTex = canvasTex(`face|${JSON.stringify([P.skin, P.face.cheeks, P.face.scar, P.head.paint, coverC, P.head.letter])}`, 128, 128, (ctx) => drawFace(ctx, P));
  // A little self-light keeps faces readable in shade, at night and next to monitors.
  const faceMat = mat(`facemat|${faceTex.uuid}`, () => new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.55, emissive: '#ffffff', emissiveMap: faceTex, emissiveIntensity: 0.18 }));
  const sideMat = mat(`side|${coverC || skin}`, () => new THREE.MeshStandardMaterial({ color: coverC || skin, roughness: 0.55, emissive: coverC || skin, emissiveIntensity: 0.18 }));
  const headMesh = new THREE.Mesh(geo('headR', () => new RoundedBoxGeometry(0.16, 0.16, 0.14, 3, 0.035)), [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
  headMesh.position.y = HEAD_C; headMesh.castShadow = true; head.add(headMesh);
  const fullHead = P.head.paint === 'spider' || P.head.paint === 'iron' || P.head.paint === 'panther';

  // hair
  let hs = P.head.paint ? 'none' : P.hair.style; const hc = hairMat(P.hair.color);
  if (P.hat && P.hat !== 'none' && (hs === 'spiky' || hs === 'bun' || hs === 'parted')) hs = 'short'; // keep hair under the hat
  const H = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => add(head, softGeo(w, h, d), hc, x, y, z, rx, ry, rz);
  if (hs === 'short') { H(0.172, 0.045, 0.152, 0, 0.172, 0); H(0.172, 0.08, 0.03, 0, 0.13, -0.062); H(0.11, 0.022, 0.03, -0.025, 0.152, 0.064, 0, 0, -0.12); }
  if (hs === 'parted') { H(0.17, 0.045, 0.15, 0, 0.175, 0); H(0.12, 0.03, 0.08, -0.035, 0.21, 0.01, 0.1, 0, -0.2); }
  if (hs === 'spiky') { H(0.168, 0.035, 0.148, 0, 0.17, 0); H(0.04, 0.06, 0.04, -0.05, 0.21, 0, 0, 0, -0.2); H(0.04, 0.08, 0.04, 0, 0.225, 0); H(0.04, 0.06, 0.04, 0.05, 0.21, 0, 0, 0, 0.2); }
  if (hs === 'bun') { H(0.17, 0.04, 0.15, 0, 0.168, 0); add(head, geo('bun', () => new THREE.SphereGeometry(0.042, 14, 12)), hc, 0, 0.22, -0.035); }
  if (hs === 'buzz') H(0.166, 0.03, 0.146, 0, 0.165, 0);
  if (hs === 'long') { H(0.172, 0.05, 0.152, 0, 0.175, 0); H(0.172, 0.22, 0.03, 0, 0.065, -0.068); H(0.02, 0.14, 0.11, -0.085, 0.1, -0.015); H(0.02, 0.14, 0.11, 0.085, 0.1, -0.015); }
  if (P.hair.temples && hs !== 'none') { for (const s of [-1, 1]) add(head, softGeo(0.006, 0.04, 0.05), hairMat(P.hair.temples), s * 0.083, 0.14, 0.0); }
  if (P.hair.curl) H(0.03, 0.036, 0.012, 0.012, 0.14, 0.078, 0, 0, 0.5);
  // beard
  if (P.beard && !fullHead) {
    const bm = hairMat(P.beard.color);
    if (P.beard.style === 'short') { add(head, softGeo(0.166, 0.04, 0.148), bm, 0, 0.03, 0); add(head, softGeo(0.06, 0.01, 0.01), bm, 0, 0.068, 0.075); }
    if (P.beard.style === 'mustache' || P.beard.style === 'goatee') { add(head, softGeo(0.058, 0.012, 0.01), bm, 0, 0.068, 0.075); add(head, softGeo(0.026, 0.024, 0.012), bm, 0, 0.02, 0.072); }
  }
  // hats / headset
  if (P.hat === 'cap') { B(head, 0.172, 0.03, 0.152, P.hatColor, 0, 0.21, 0); B(head, 0.09, 0.012, 0.05, P.hatColor, 0, 0.195, 0.07); }
  if (P.hat === 'beanie') B(head, 0.18, 0.06, 0.16, P.hatColor, 0, 0.21, 0);
  if (P.headset) {
    add(head, geo('headband', () => new THREE.TorusGeometry(0.1, 0.008, 8, 24, Math.PI)), std('#94a3b8', 0.4, 0.25), 0, 0.1, 0);
    B(head, 0.018, 0.05, 0.028, '#475569', -0.1, 0.1, 0); B(head, 0.018, 0.05, 0.028, '#475569', 0.1, 0.1, 0);
    add(head, softGeo(0.012, 0.06, 0.012), std('#94a3b8', 0.4, 0.25), 0.085, 0.05, 0.06, 0.25, 0.25, -0.4);
  }
  // hero head pieces
  if (P.mask && !fullHead) B(head, 0.164, 0.034, 0.142, P.mask, 0, EYE_Y + 0.002, 0);
  if (P.head.band) {
    B(head, 0.166, 0.02, 0.146, P.head.band.color, 0, 0.15, 0);
    if (P.head.band.star) { add(head, geo('tiara', () => new THREE.ConeGeometry(0.03, 0.05, 3)), std(P.head.band.color, 0.35, 0.5), 0, 0.165, 0.07, -0.2, 0, 0); add(head, geo('tiaraStar', () => new THREE.OctahedronGeometry(0.011)), basic(P.head.band.gem), 0, 0.162, 0.084); }
    else add(head, geo('gem', () => new THREE.OctahedronGeometry(0.014)), basic(P.head.band.gem), 0, 0.15, 0.075);
  }
  for (const ex of P.head.extras) {
    if (ex === 'batEars') for (const s of [-1, 1]) { B(head, 0.026, 0.055, 0.03, coverC, s * 0.052, HEAD_TOP + 0.02, -0.01, 0, 0, s * -0.12); }
    if (ex === 'catEars') for (const s of [-1, 1]) { B(head, 0.024, 0.026, 0.024, coverC, s * 0.055, HEAD_TOP + 0.008, -0.01, 0, 0, Math.PI / 4); }
    if (ex === 'flashWings' || ex === 'capWings') {
      const wc = ex === 'flashWings' ? GOLD : WHITE;
      // three swept-back feathers per side
      for (const s of [-1, 1]) for (const [y, len, tilt] of [[0.095, 0.07, -0.35], [0.115, 0.06, -0.6], [0.134, 0.045, -0.85]]) {
        add(head, boxGeo(0.008, 0.012, len), std(wc, 0.45), s * 0.084, y, -0.005 - len * 0.3, tilt, 0, 0);
      }
    }
  }
  if (P.head.paint === 'iron') B(head, 0.01, 0.02, 0.01, GOLD, 0, 0.0, 0.074);

  // face features (Hermes boxes)
  const featureColor = P.head.paint ? '#14161f' : '#342016';
  const eyes = [], highlights = [], brows = [];
  const eyeStyle = P.head.eyes;
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.04, EYE_Y, 0); head.add(eg); eyes.push(eg);
    if (eyeStyle === 'spider') { eg.position.set(s * 0.042, EYE_Y + 0.004, 0); eg.rotation.z = s * 0.38; B(eg, 0.06, 0.046, 0.008, basic('#14161f'), 0, 0, 0.0735); B(eg, 0.05, 0.036, 0.008, basic('#f4f6fb'), 0, 0, 0.0755); }
    else if (eyeStyle === 'slit') { eg.rotation.z = s * 0.3; B(eg, 0.044, 0.014, 0.008, basic('#e9e6f5'), 0, 0, 0.0735); }
    else if (eyeStyle === 'iron') { eg.rotation.z = s * 0.15; B(eg, 0.042, 0.011, 0.008, basic('#e8fbff'), 0, 0, 0.0745); const h = add(eg, boxGeo(0.06, 0.03, 0.002), glow('#9FE8FF', 0.35), 0, 0, 0.079); h.castShadow = false; }
    else if (eyeStyle === 'lens') { B(eg, 0.036, 0.024, 0.01, basic('#f4f6fb'), 0, 0, 0.073); }
    else if (P.face.eyepatch && s === 1) { B(eg, 0.03, 0.03, 0.01, basic('#1a1a2e'), 0, 0, 0.072); B(head, 0.04, 0.036, 0.008, basic('#0b0b0f'), 0.04, EYE_Y, 0.079); }
    else {
      add(eg, geo('eyeBall', () => new THREE.SphereGeometry(1, 16, 12)), std('#1d1a2b', 0.25), 0, 0, 0.071).scale.set(0.0155, 0.02, 0.006);
      const hl = add(head, geo('eyeHl', () => new THREE.SphereGeometry(1, 10, 8)), basic('#ffffff'), s * 0.04 + 0.006, EYE_Y + 0.008, 0.0775); hl.scale.set(0.0055, 0.0055, 0.002); hl.castShadow = false; highlights.push(hl);
    }
    if (!fullHead && eyeStyle !== 'none') brows.push(B(head, 0.04, 0.01, 0.01, basic(featureColor), s * 0.04, BROW_Y, 0.074));
  }
  if (P.face.eyepatch) B(head, 0.166, 0.008, 0.146, '#0b0b0f', 0, 0.12, 0, 0, 0, -0.38);
  const showMouth = !fullHead && P.face.mouth !== 'none';
  const mouthC = basic('#5b2a2e');
  const mouth = B(head, 0.026, 0.011, 0.008, mouthC, 0, MOUTH_Y, 0.073); mouth.visible = showMouth;
  const cornerL = B(head, 0.009, 0.008, 0.008, mouthC, -0.017, MOUTH_Y + 0.002, 0.073);
  const cornerR = B(head, 0.009, 0.008, 0.008, mouthC, 0.017, MOUTH_Y + 0.002, 0.073);
  cornerL.visible = cornerR.visible = false;
  // glasses
  if (P.glasses && !fullHead) {
    const fm = basic('#111827');
    for (const s of [-1, 1]) {
      const x = s * 0.04;
      if (P.glasses === 'round') {
        add(head, geo('rim', () => new THREE.TorusGeometry(0.021, 0.0035, 6, 18)), fm, x, EYE_Y, 0.08);
        add(head, geo('lensR', () => new THREE.CircleGeometry(0.02, 18)), glass(P.glassesTint || '#cfe2ff', 0.5), x, EYE_Y, 0.079);
      } else if (P.glasses === 'shades') {
        B(head, 0.046, 0.03, 0.006, basic('#0b0d14'), x, EYE_Y, 0.08);
      } else {
        B(head, 0.05, 0.006, 0.006, fm, x, EYE_Y + 0.022, 0.08); B(head, 0.05, 0.006, 0.006, fm, x, EYE_Y - 0.022, 0.08);
        B(head, 0.006, 0.05, 0.006, fm, x - 0.022, EYE_Y, 0.08); B(head, 0.006, 0.05, 0.006, fm, x + 0.022, EYE_Y, 0.08);
        B(head, 0.04, 0.04, 0.003, glass('#cfe2ff', 0.3), x, EYE_Y, 0.08);
      }
      B(head, 0.006, 0.006, 0.08, fm, s * 0.083, EYE_Y + 0.01, 0.04);
    }
    B(head, 0.03, 0.006, 0.006, fm, 0, EYE_Y + 0.004, 0.08);
  }

  // inked outline: a slightly bigger back-face copy of each solid part (Crossy Road / toy-figure look)
  if (outlines) {
    const ink = mat('ink', () => new THREE.MeshBasicMaterial({ color: '#1b1d29', side: THREE.BackSide }));
    const parts = [];
    body.traverse((o) => { if (o.isMesh && !o.userData.ink) parts.push(o); });
    for (const o of parts) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.isMeshBasicMaterial || m.transparent || !o.scale.equals(ONE)) continue;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const sz = g.boundingBox.getSize(_v);
      if (Math.min(sz.x, sz.y, sz.z) < 0.008) continue;
      const hull = new THREE.Mesh(g, ink);
      hull.scale.set((sz.x + 2 * OUTLINE) / sz.x, (sz.y + 2 * OUTLINE) / sz.y, (sz.z + 2 * OUTLINE) / sz.z);
      hull.userData.ink = true; hull.userData.noShadow = true; hull.castShadow = false;
      o.add(hull);
    }
  }

  // measure height in the neutral stand pose (before any prop)
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(body);
  const height = bb.max.y;

  // ---------------------------------------------------------------- props
  let pose = 'stand', expr = 'idle', propKind = null, propObj = null, propLevel = false, propHold = 0, opacity = 1;
  let walkPh = phase, first = true;
  const propHolder = new THREE.Group(); armR.hand.add(propHolder);
  function setProp(kind) {
    kind = kind || null;
    if (kind === 'hero') kind = P.prop ? P.prop.type : null;
    if (kind === propKind) return;
    if (propObj) { propObj.parent && propObj.parent.remove(propObj); propObj = null; }
    propKind = kind;
    if (!kind) return;
    const color = P.prop && P.prop.type === kind ? P.prop.color : null;
    const built = buildProp(kind, color);
    if (!built) { propKind = null; return; }
    propObj = built.obj; propLevel = built.level; propHold = built.hold;
    propObj.traverse((o) => { if (o.isMesh && o.castShadow !== false && !o.userData.noShadow) o.castShadow = true; });
    if (opacity < 1) applyOpacity(propObj);
    placeProp();
  }
  function placeProp() {
    if (!propObj) return;
    const want = pose === 'carry' ? front : propHolder;
    if (propObj.parent !== want) want.add(propObj);
    propObj.visible = !(pose === 'type' || pose === 'nap' || pose.startsWith('workout'));
  }

  function setPose(p) { if (!POSES.has(p)) p = 'stand'; if (p === pose) return; pose = p; placeProp(); }
  function setExpression(e) { if (EXPR[e]) expr = e; }

  // opacity: swap shared materials for per-avatar transparent clones
  const fades = new Map();
  function fadeOf(m) {
    let c = fades.get(m);
    if (!c) { c = m.clone(); c.userData.baseOpacity = m.opacity; c.transparent = true; fades.set(m, c); }
    c.opacity = c.userData.baseOpacity * opacity; return c;
  }
  function applyOpacity(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      const b = o.userData.baseMat;
      o.material = opacity >= 0.999 ? b : Array.isArray(b) ? b.map(fadeOf) : fadeOf(b);
    });
  }
  function setOpacity(a) { a = clamp(+a || 0, 0, 1); if (Math.abs(a - opacity) < 0.001) return; opacity = a; applyOpacity(root); }

  // ---------------------------------------------------------------- animation
  const sitHipsY = SEAT_HEIGHT / (AGENT_SCALE * P.scale) + 0.04;
  const T = { bodyY: 0, bodyX: 0, bodyRX: 0, bodyRZ: 0, hipsY: HIP_Y, torsoRX: 0, headRX: 0, headRY: 0, headRZ: 0,
    rX: 0, rY: 0, rZ: 0, lX: 0, lY: 0, lZ: 0, tR: 0, kR: 0, tL: 0, kL: 0, capeA: 0.06, capeB: 0.04 };
  const C = { ...T };
  function update(t, dt = 1 / 60, opts = {}) {
    const speed = Math.max(0, (opts && opts.speed) || 0);
    dt = clamp(dt || 0, 0, 0.25);
    for (const k in T) T[k] = 0;
    T.hipsY = HIP_Y; T.capeA = 0.06 + Math.sin(t * 1.7 + phase) * 0.03; T.capeB = 0.04 + Math.sin(t * 1.7 + phase - 0.7) * 0.05;
    const moving = pose === 'walk' || (speed > 0.05 && (pose === 'stand' || pose === 'carry' || pose === 'talk'));
    walkPh += dt * (speed > 0.05 ? clamp(speed * 6.5, 5, 13) : 9);
    const w = Math.sin(walkPh);
    let talking = pose === 'talk', forceClosed = false;
    const hold = propObj && propObj.visible ? propHold : 0;

    const seat = (lean = -0.1) => { T.hipsY = sitHipsY; T.tR = T.tL = -Math.PI / 2; T.kR = T.kL = 1.35; T.torsoRX = lean; T.rX = T.lX = -0.5; T.capeA = 0.5; T.capeB = -0.45; };
    switch (pose) {
      case 'stand': case 'talk': case 'carry': case 'raise': case 'walk':
        if (!moving) { T.bodyY = Math.sin(t * 1.8 + phase) * 0.008; T.headRY = Math.sin(t * 0.45 + phase) * 0.12; T.rX = -hold; }
        break;
      default: break;
    }
    if (moving) {
      T.bodyY = Math.abs(w) * 0.035;
      T.tL = w * 0.5; T.tR = -w * 0.5; T.kL = Math.max(0, w) * 0.7; T.kR = Math.max(0, -w) * 0.7;
      T.lX = -w * 0.45; T.rX = w * 0.45 - hold * 0.8;
      T.capeA = 0.22 + Math.min(0.5, speed * 0.3) + Math.sin(walkPh * 2) * 0.03; T.capeB = 0.15 + Math.sin(walkPh * 2 - 0.8) * 0.06;
    }
    switch (pose) {
      case 'carry': T.rX = T.lX = -1.15; T.rZ = 0.14; T.lZ = -0.14; break;
      case 'talk':
        T.rX = -0.55 + Math.sin(t * 3.1 + phase) * 0.25; T.rZ = 0.15 + Math.sin(t * 2.3 + phase) * 0.1;
        if (!moving) { T.lX = -0.25 + Math.sin(t * 2.6 + phase + 1) * 0.15; T.headRY = Math.sin(t * 1.3 + phase) * 0.15; T.headRX = Math.sin(t * 2.7) * 0.05; }
        break;
      case 'raise': {
        const cyc = (t + phase) % 5, urgent = cyc > 3.6;
        T.rZ = -2.75 + Math.sin(t * (urgent ? 16 : 7)) * (urgent ? 0.4 : 0.28); T.rX = -0.12;
        if (urgent) T.bodyY = Math.abs(Math.sin(t * 10)) * 0.03;
        break;
      }
      case 'cheer': {
        const pump = Math.sin(t * 9 + phase);
        T.rZ = -2.6 + pump * 0.25; T.lZ = 2.6 - pump * 0.25; T.rX = T.lX = -0.1;
        const j = Math.abs(Math.sin(t * 4.5 + phase)); T.bodyY = j * 0.08; T.tR = T.tL = -(1 - j) * 0.25; T.kR = T.kL = (1 - j) * 0.5;
        break;
      }
      case 'dance': { // Hermes: frame*0.22 / 0.16 / 0.12 at 60 fps
        const a = t * 13.2, b = t * 9.6;
        T.lX = -0.8 + Math.sin(a) * 0.9; T.lZ = -0.45 + Math.cos(b) * 0.18; T.lY = -0.08;
        T.rX = -0.8 - Math.sin(a) * 0.9; T.rZ = 0.45 - Math.cos(b) * 0.18; T.rY = 0.08;
        T.bodyRZ = Math.sin(t * 7.2) * 0.08; T.bodyRX = Math.sin(t * 10.8 + phase) * 0.06;
        T.bodyY = 0.03 + Math.abs(Math.sin(a + phase)) * 0.05;
        T.tL = Math.sin(a + phase) * 0.35; T.tR = -T.tL; T.kL = Math.max(0, T.tL) * 0.6; T.kR = Math.max(0, T.tR) * 0.6;
        T.headRZ = Math.sin(t * 7.2 + 1) * 0.12;
        break;
      }
      case 'sit': seat(); T.bodyY = Math.sin(t * 1.6 + phase) * 0.004; if (hold) { T.rX = -0.9; } break;
      case 'type': seat(0.04);
        T.rX = -1.2 + Math.sin(t * 16 + phase) * 0.07; T.lX = -1.2 + Math.sin(t * 16 + phase + Math.PI) * 0.07; T.rZ = 0.18; T.lZ = -0.18; T.headRX = 0.06;
        break;
      case 'nap': seat(0.38); T.headRX = 0.5; T.rX = T.lX = -1.0; T.rZ = 0.25; T.lZ = -0.25; T.bodyY = Math.sin(t * 1.1 + phase) * 0.005; forceClosed = true; break;
      case 'pingpong': {
        const s = Math.sin(t * 4.8 + phase);
        T.bodyRX = 0.08; T.rX = -0.6 + s * 0.45; T.rZ = 0.1; T.lX = 0.2 + s * 0.28; T.tR = T.tL = -0.2; T.kR = T.kL = 0.4; T.hipsY = HIP_Y - 0.012;
        T.bodyX = Math.sin(t * 2.4 + phase) * 0.05; T.bodyY = Math.sin(t * 1.8 + phase) * 0.008;
        break;
      }
      case 'workout-run': {
        const s = Math.sin(t * 10.8 + phase);
        T.tL = s * 0.7; T.tR = -s * 0.7; T.kL = Math.max(0, s) * 1.0; T.kR = Math.max(0, -s) * 1.0;
        T.lX = -(0.28 + s * 1.05); T.lZ = -0.08; T.rX = -(0.28 - s * 1.05); T.rZ = 0.08;
        T.bodyRX = 0.08; T.bodyY = 0.02 + Math.abs(s) * 0.04;
        break;
      }
      case 'workout-lift': {
        const s = Math.sin(t * 3.2 + phase) * 0.5 + 0.5;
        T.rZ = -(1.5 + s * 1.3); T.lZ = 1.5 + s * 1.3; T.rX = T.lX = -0.1;
        T.tR = T.tL = -(1 - s) * 0.18; T.kR = T.kL = (1 - s) * 0.36; T.bodyY = 0.004 + s * 0.01;
        break;
      }
      case 'workout-bike': {
        seat(0.18); const c = t * 10.8 + phase, push = Math.sin(c + Math.PI / 2);
        T.tR = -1.05 + Math.sin(c) * 0.32; T.kR = 1.2 + Math.sin(c + 1.2) * 0.35;
        T.tL = -1.05 + Math.sin(c + Math.PI) * 0.32; T.kL = 1.2 + Math.sin(c + Math.PI + 1.2) * 0.35;
        T.rX = -(1.05 - push * 0.16); T.rZ = 0.18; T.rY = 0.12; T.lX = -(1.05 + push * 0.16); T.lZ = -0.18; T.lY = -0.12;
        T.bodyY = Math.abs(Math.sin(c)) * 0.01;
        break;
      }
      case 'workout-box': {
        const s = Math.sin(t * 10.8 + phase), push = Math.sin(t * 10.8 + phase + Math.PI / 2);
        T.lX = -(0.92 + Math.max(0, push) * 0.45); T.lZ = -0.52; T.lY = -0.06;
        T.rX = -(0.92 + Math.max(0, -push) * 0.45); T.rZ = 0.52; T.rY = 0.06;
        T.bodyRZ = push * 0.05; T.tL = 0.06 + s * 0.14; T.tR = 0.06 - s * 0.14; T.bodyY = 0.02 + Math.abs(s) * 0.03;
        break;
      }
      default: break;
    }
    if (SEATED.has(pose)) T.bodyX = 0;
    // ease towards the targets (fast oscillations stay crisp; pose changes blend)
    const fast = first ? 1 : 1 - Math.exp(-dt * 18), slow = first ? 1 : 1 - Math.exp(-dt * 9);
    first = false;
    for (const key in T) C[key] += (T[key] - C[key]) * (SLOW_KEYS.has(key) ? slow : fast);
    body.position.set(C.bodyX, C.bodyY, 0); body.rotation.set(C.bodyRX, 0, C.bodyRZ);
    hips.position.y = C.hipsY; torso.rotation.x = C.torsoRX;
    head.rotation.set(C.headRX, C.headRY, C.headRZ);
    armR.arm.rotation.set(C.rX, C.rY, C.rZ); armL.arm.rotation.set(C.lX, C.lY, C.lZ);
    legR.thigh.rotation.x = C.tR; legR.knee.rotation.x = C.kR; legL.thigh.rotation.x = C.tL; legL.knee.rotation.x = C.kL;
    if (capeUp) { capeUp.rotation.x = C.capeA; capeLo.rotation.x = C.capeB; }
    // workout extras
    const lift = pose === 'workout-lift', box = pose === 'workout-box';
    for (const a of arms) { a.dumb.visible = lift; a.glove.visible = box; }
    // prop: level props are counter-rotated so mugs and laptops stay upright
    if (propObj && propObj.parent === propHolder) propHolder.rotation.set(propLevel ? -C.rX : 0, 0, propLevel ? -C.rZ : 0);
    else propHolder.rotation.set(0, 0, 0);
    if (propObj && propObj.userData.bob) propObj.userData.bob.position.y = 0.05 + Math.sin(t * 2.4 + phase) * 0.008;

    // ---- face (Hermes blink + expressions)
    const E = EXPR[expr] || EXPR.idle;
    const cycle = E.blink[0], win = E.blink[1];
    const bp = (t + blinkOffset) % cycle;
    let open = E.open;
    if (P.face.eyes === 'wide') open *= 1.2;
    if (P.face.eyes === 'smile' && expr === 'idle') open = 0.55;
    if (bp < win) { const mid = win / 2; open *= Math.min(1, Math.abs(bp - mid) / mid); }
    open = Math.max(E.min, Math.min(E.max, open));
    if (P.face.eyes === 'closed' || forceClosed) open = 0.08;
    if (eyeStyle === 'iron') open = 1;
    const eyeSx = eyeStyle === 'normal' ? E.sx * (P.face.eyes === 'wide' ? 1.1 : 1) : 1;
    const eyeSy = eyeStyle === 'normal' ? Math.max(0.05, open) : Math.max(0.12, Math.min(1, open / 1.0));
    for (const e of eyes) { e.scale.set(eyeSx, eyeSy, 1); e.position.y = EYE_Y + (eyeStyle === 'spider' ? 0.004 : 0) + E.dy; }
    for (const h of highlights) { h.visible = open > 0.45 && expr !== 'sleepy'; h.position.y = EYE_Y + 0.007 + E.dy; }
    const stern = P.face.eyes === 'stern' ? -0.3 : 0;
    brows.forEach((b, i) => { const s = i === 0 ? -1 : 1; b.rotation.z = -s * (E.brow[0] + (expr === 'error' ? 0 : stern)); b.position.y = BROW_Y + E.brow[1] + (forceClosed ? -0.006 : 0); });
    if (showMouth) {
      const flat = P.face.mouth === 'flat';
      let [mx, my, mdy] = flat && expr !== 'happy' && expr !== 'error' ? [0.9, 0.14, 0] : E.mouth;
      if (forceClosed) { mx = 0.5; my = 0.12; mdy = -0.002; }
      if (talking) my = 0.38 + (Math.sin(t * 8.4 + phase) + 1) * 0.22;
      mouth.scale.set(mx, my, 1); mouth.position.y = MOUTH_Y + mdy;
      const corners = forceClosed || talking || (flat && expr !== 'happy' && expr !== 'error') ? null : E.corners;
      cornerL.visible = cornerR.visible = !!corners;
      cornerL.position.x = -(0.013 * mx + 0.003); cornerR.position.x = 0.013 * mx + 0.003;
      if (corners === 'smile') { cornerL.rotation.z = 0.62; cornerR.rotation.z = -0.62; cornerL.position.y = cornerR.position.y = MOUTH_Y + 0.003 + mdy * 0.3; }
      if (corners === 'frown') { cornerL.rotation.z = -0.6; cornerR.rotation.z = 0.6; cornerL.position.y = cornerR.position.y = MOUTH_Y - 0.006; }
    }
  }

  function dispose() {
    if (root.parent) root.parent.remove(root);
    for (const c of fades.values()) c.dispose();
    fades.clear();
    if (propObj && propObj.parent) propObj.parent.remove(propObj);
    propObj = null;
  }

  update(0, 0, {});
  return {
    root, height, profile: P,
    get pose() { return pose; }, get expression() { return expr; }, get prop() { return propKind; },
    defaultProp: P.prop ? P.prop.type : null,
    anchors: { handR: armR.hand, handL: armL.hand, carry: front, head },
    setPose, setExpression, setProp, setOpacity, update, dispose,
  };
}

// ---------------------------------------------------------------- props
// Built in the right hand's frame: origin = hand centre, +Y up the arm, +Z forward (arm hanging).
// level: counter-rotate with the arm so it stays upright; hold: how far the arm lifts forward to show it.
function buildProp(kind, color) {
  const g = new THREE.Group();
  const add = (geom, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const B = (w, h, d, m, x, y, z, rx, ry, rz) => add(boxGeo(w, h, d), typeof m === 'string' ? std(m) : m, x, y, z, rx, ry, rz);
  const noShadow = (o) => { o.castShadow = false; o.userData.noShadow = true; return o; };
  let level = true, hold = 0.55;
  switch (kind) {
    case 'card': // glowing task card
      B(0.075, 0.052, 0.004, basic('#fff6c8'), 0, 0.03, 0.03);
      B(0.05, 0.006, 0.005, basic('#f59e0b'), -0.006, 0.044, 0.031); B(0.04, 0.004, 0.005, basic('#c2b280'), -0.011, 0.032, 0.031); B(0.044, 0.004, 0.005, basic('#c2b280'), -0.009, 0.022, 0.031);
      noShadow(add(geo('cardGlow', () => new THREE.PlaneGeometry(0.11, 0.085)), glow('#ffd866', 0.45), 0, 0.03, 0.026));
      break;
    case 'paddle': level = false; hold = 0; {
      const p = new THREE.Group(); p.position.set(-0.01, -0.02, 0.07); p.rotation.set(-0.55, 0.25, -0.35); g.add(p);
      const f = new THREE.Mesh(geo('paddle', () => new THREE.CylinderGeometry(0.042, 0.042, 0.012, 18)), std(color || '#c53b30', 0.72)); f.rotation.x = -Math.PI / 2; p.add(f);
      const h = new THREE.Mesh(boxGeo(0.014, 0.07, 0.014), std('#c59a68', 0.74)); h.position.set(0, -0.045, -0.015); h.rotation.x = 0.12; p.add(h);
    } break;
    case 'broom': level = false; hold = 0; {
      const p = new THREE.Group(); p.position.set(-0.02, -0.01, 0.08); p.rotation.set(-0.8, 0.18, -0.18); g.add(p);
      const h = new THREE.Mesh(boxGeo(0.012, 0.28, 0.012), std('#9a6b3c', 0.76)); h.position.y = -0.13; p.add(h);
      const b = new THREE.Mesh(boxGeo(0.09, 0.028, 0.03), std('#facc15', 0.68)); b.position.set(0, -0.28, 0.012); p.add(b);
    } break;
    case 'vacuum': level = false; hold = 0; {
      const p = new THREE.Group(); p.position.set(-0.08, 0.09, 0.18); g.add(p);
      const m = (gg, mm, x, y, z) => { const o = new THREE.Mesh(gg, mm); o.position.set(x, y, z); p.add(o); return o; };
      m(boxGeo(0.015, 0.3, 0.015), std('#555', 0.72), 0, -0.02, 0); m(boxGeo(0.08, 0.12, 0.07), std('#dc2626', 0.48), 0.025, -0.16, 0);
      m(boxGeo(0.11, 0.024, 0.06), std('#1f2937', 0.65), 0.05, -0.24, 0.02);
    } break;
    case 'mug':
      add(geo('mug', () => new THREE.CylinderGeometry(0.022, 0.02, 0.048, 14)), std(color || '#f8fafc', 0.5), 0, 0.012, 0.035);
      add(geo('coffee', () => new THREE.CircleGeometry(0.019, 14)), std('#4a2c1a', 0.3), 0, 0.0365, 0.035, -Math.PI / 2, 0, 0);
      add(geo('mugHandle', () => new THREE.TorusGeometry(0.012, 0.004, 6, 10)), std(color || '#f8fafc', 0.5), 0.024, 0.012, 0.035, 0, Math.PI / 2, 0);
      hold = 0.9; break;
    case 'laptop': { // open laptop held flat on the palm
      const c = color || '#8A90A6';
      B(0.13, 0.008, 0.09, std(c, 0.4, 0.4), 0, 0.03, 0.05);
      const scr = new THREE.Group(); scr.position.set(0, 0.034, 0.005); scr.rotation.x = -0.3; g.add(scr);
      const lid = new THREE.Mesh(boxGeo(0.13, 0.085, 0.006), std(c, 0.4, 0.4)); lid.position.y = 0.0425; scr.add(lid);
      const sc = new THREE.Mesh(boxGeo(0.116, 0.07, 0.002), basic('#7cc4ff')); sc.position.set(0, 0.0425, 0.0035); scr.add(sc);
      hold = 1.0; break;
    }
    case 'shield': { // round, red/white/blue rings and a white star
      const s = new THREE.Group(); s.position.set(-0.02, 0.0, 0.055); s.rotation.y = -0.35; g.add(s);
      const rings = [[0.085, color || RED, 0.012], [0.068, WHITE, 0.014], [0.051, color || RED, 0.016], [0.034, '#1f4fa8', 0.018]];
      for (const [r, c, d] of rings) { const m = new THREE.Mesh(geo(`disc${r}|${d}`, () => new THREE.CylinderGeometry(r, r, d, 28)), std(c, 0.45, 0.25)); m.rotation.x = Math.PI / 2; s.add(m); }
      const st = new THREE.Mesh(geo('star', () => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.012 : 0.028; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); } sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }); }), std(WHITE, 0.5));
      st.position.z = 0.0085; s.add(st);
      hold = 0.35; break;
    }
    case 'hammer': // Mjolnir-style hammer hanging from the fist
      level = false; hold = 0;
      B(0.016, 0.11, 0.016, '#6b4a33', 0, -0.03, 0); B(0.02, 0.016, 0.02, '#9AA0B5', 0, 0.03, 0);
      B(0.055, 0.052, 0.088, std(color || '#9AA0B5', 0.35, 0.6), 0, -0.11, 0);
      B(0.058, 0.01, 0.091, std(shade(color || '#9AA0B5', -0.15), 0.35, 0.6), 0, -0.11, 0);
      break;
    case 'bow': { level = false; hold = 0.15;
      const r = 0.15, arc = 2.1;
      const bw = new THREE.Group(); bw.rotation.y = Math.PI - 0.5; bw.position.set(0, 0.0, 0.0); g.add(bw);
      const t = new THREE.Mesh(geo('bow', () => new THREE.TorusGeometry(r, 0.008, 6, 24, arc)), std(shade(color || '#4A2A6A', 0.1), 0.6)); t.rotation.z = -arc / 2; t.position.x = -r; bw.add(t);
      const sx = r * (Math.cos(arc / 2) - 1), sy = r * Math.sin(arc / 2);
      const str = new THREE.Mesh(boxGeo(0.002, sy * 2, 0.002), basic('#e5e7eb')); str.position.x = sx; bw.add(str);
      const arrow = new THREE.Mesh(boxGeo(0.13, 0.005, 0.005), std('#d4c4a0')); arrow.position.set(-0.01, 0.004, 0); bw.add(arrow);
      break; }
    case 'magnifier':
      B(0.012, 0.06, 0.012, '#3a2a1a', 0, 0.02, 0.04);
      add(geo('magRing', () => new THREE.TorusGeometry(0.03, 0.006, 8, 20)), std(color || GOLD, 0.35, 0.6), 0, 0.083, 0.04);
      add(geo('magGlass', () => new THREE.CircleGeometry(0.028, 20)), glass('#cfe9ff', 0.35), 0, 0.083, 0.04);
      hold = 0.8; break;
    case 'crystal': { // glowing ring / crystal, bobbing above the hand
      const c = color || '#5CE87A';
      const bob = new THREE.Group(); bob.position.set(0, 0.05, 0.05); g.add(bob); g.userData.bob = bob;
      const m1 = new THREE.Mesh(geo('crystal', () => new THREE.OctahedronGeometry(0.022)), basic(c)); bob.add(m1);
      const m2 = new THREE.Mesh(geo('crystalRing', () => new THREE.TorusGeometry(0.034, 0.004, 6, 20)), basic(c)); bob.add(m2);
      const h = new THREE.Mesh(geo('crystalHalo', () => new THREE.SphereGeometry(0.05, 12, 10)), glow(c, 0.25)); noShadow(h); bob.add(h);
      add(geo('ringBand', () => new THREE.TorusGeometry(0.018, 0.005, 6, 12)), basic(c), 0, -0.005, 0.0, Math.PI / 2, 0, 0);
      hold = 0.85; break;
    }
    case 'holo': { // translucent hologram tablet
      const c = color || '#7fe8ff';
      const p = new THREE.Group(); p.position.set(0, 0.07, 0.06); p.rotation.x = -0.35; g.add(p);
      const pl = new THREE.Mesh(geo('holo', () => new THREE.PlaneGeometry(0.11, 0.07)), glow(c, 0.45)); noShadow(pl); p.add(pl);
      for (const [w, h, x, y] of [[0.11, 0.003, 0, 0.035], [0.11, 0.003, 0, -0.035], [0.003, 0.07, 0.055, 0], [0.003, 0.07, -0.055, 0], [0.06, 0.004, -0.015, 0.012], [0.04, 0.004, -0.025, -0.004]]) { const l = new THREE.Mesh(boxGeo(w, h, 0.002), basic(c)); l.position.set(x, y, 0.001); noShadow(l); p.add(l); }
      B(0.03, 0.01, 0.03, '#334155', 0, 0.02, 0.03);
      hold = 0.9; break;
    }
    case 'walkie':
      B(0.026, 0.06, 0.018, '#111318', 0, 0.02, 0.025); B(0.005, 0.035, 0.005, '#111318', 0.007, 0.065, 0.025); B(0.006, 0.006, 0.002, basic('#22c55e'), -0.006, 0.042, 0.035);
      hold = 0.9; break;
    case 'map': {
      const m = std('#e9dcb5', 0.9);
      B(0.05, 0.07, 0.002, m, -0.024, 0.04, 0.04, 0, 0.35, 0); B(0.05, 0.07, 0.002, m, 0.024, 0.04, 0.04, 0, -0.35, 0);
      B(0.03, 0.003, 0.003, basic('#dc2626'), -0.024, 0.05, 0.05, 0, 0.35, 0.5); B(0.03, 0.003, 0.003, basic('#2563eb'), 0.024, 0.03, 0.05, 0, -0.35, -0.3);
      hold = 0.9; break;
    }
    case 'book': {
      const c = color || '#6B4A33';
      B(0.07, 0.09, 0.004, c, 0, 0.035, 0.022); B(0.07, 0.09, 0.004, c, 0, 0.035, 0.044); B(0.004, 0.09, 0.026, c, -0.035, 0.035, 0.033);
      B(0.064, 0.084, 0.018, '#f3ead2', 0.001, 0.035, 0.033);
      B(0.02, 0.02, 0.002, GOLD, 0, 0.045, 0.0465);
      hold = 0.8; break;
    }
    case 'wrench': level = false; hold = 0.3;
      B(0.012, 0.1, 0.008, std(color || '#9aa3b5', 0.35, 0.6), 0, 0.02, 0.01);
      B(0.034, 0.014, 0.008, std(color || '#9aa3b5', 0.35, 0.6), 0, 0.075, 0.01); B(0.01, 0.024, 0.008, std(color || '#9aa3b5', 0.35, 0.6), -0.012, 0.09, 0.01); B(0.01, 0.024, 0.008, std(color || '#9aa3b5', 0.35, 0.6), 0.012, 0.09, 0.01);
      break;
    default: return null;
  }
  return { obj: g, level, hold };
}

// Shared with the Kenney office people (kchar.js): the same profiles, seeds and props.
export { norm as normProfile, buildProp, hashSeed };
