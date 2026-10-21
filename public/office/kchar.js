// kchar.js: the office people in the 3D office, built on Kenney's "Mini Characters" (CC0, kenney.nl).
//
// Same interface as buildAvatar() in avatar.js (root, setPose, setExpression, setProp, setOpacity, update,
// height, anchors, dispose), so the engine can use either; heroes keep the costumed figures from avatar.js.
// Poses play Kenney's animations, with a few bones adjusted on top (typing hands, a raised hand, a nodding nap).
//
// Kenney units: the figure is 0.671 tall, feet at the root, facing +Z. Bones: root, leg-left/right (hips at
// 0.176), torso (0.176), arm-left/right (shoulders at 0.288, arms pointing along ±X), head (0.343).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { normProfile, buildProp, hashSeed, SEAT_HEIGHT, AGENT_SCALE } from './avatar.js';

// female-a is left out: her crutches are part of the body mesh, which looks odd at a desk
const FILES = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'];
const NATIVE_H = 0.671;
const HEIGHT = 0.95; // world metres, a little under the old figures' 1.0: the big Kenney head makes them read bigger
const S = HEIGHT / NATIVE_H;
const HIPS_SIT = 0.026; // where the 'sit' clip puts the hips (native units above the root)

let base = null; // file -> gltf
let loading = null;

// Loads the characters once. Resolves to true, or false if they can't be loaded (the box figures stay).
export function loadKChars(dir = new URL('./models/characters/', import.meta.url).href) {
  if (loading) return loading;
  loading = (async () => {
    try {
      const loader = new GLTFLoader(), out = {};
      await Promise.all(FILES.map(async (f) => { out[f] = await loader.loadAsync(`${dir}character-${f}.glb`); }));
      base = out;
      return true;
    } catch (e) { console.warn('Kenney characters unavailable, using the box figures:', e); return false; }
  })();
  return loading;
}
export const kReady = () => !!base;

// ---------------------------------------------------------------- pose -> animation
const CLIP = {
  stand: 'idle', walk: 'walk', sit: 'sit', type: 'sit', raise: 'idle', cheer: 'idle', dance: 'emote-yes', nap: 'sit', talk: 'idle',
  carry: 'holding-both', pingpong: 'holding-right', 'workout-run': 'walk', 'workout-lift': 'holding-both', 'workout-bike': 'sit', 'workout-box': 'attack-melee-right',
};
const SEATED = new Set(['sit', 'type', 'nap', 'workout-bike']);

export function buildKChar(profile) {
  const P = normProfile(profile);
  const gltf = base[FILES[hashSeed(P.seed) % FILES.length]]; // the same person for the same agent, every time
  const scale = (P.scale || 1) * S;
  const root = new THREE.Group(); root.name = 'kchar';
  const body = new THREE.Group(); body.scale.setScalar(scale); root.add(body);
  const model = cloneSkinned(gltf.scene); body.add(model);
  const bones = {}; model.traverse((n) => { if (n.isBone) bones[n.name] = n; });
  model.traverse((m) => { if (m.isSkinnedMesh) m.frustumCulled = false; }); // skinned bounds don't follow the animation
  // blob shadow, like the box figures
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2 * (P.scale || 1), 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.2, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004; shadow.renderOrder = 1; shadow.userData.noShadow = true; root.add(shadow);
  const head = bones.head, torso = bones.torso, armR = bones['arm-right'], armL = bones['arm-left'];
  if (P.lanyard) { // interns
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.008), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); badge.position.set(0, 0.07, 0.142); torso.add(badge);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.009), new THREE.MeshStandardMaterial({ color: P.lanyard })); strap.position.set(0, 0.1, 0.143); torso.add(strap);
  }
  root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; });

  // ---- animation
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const action = (name) => {
    if (!actions[name]) { const clip = gltf.animations.find((a) => a.name === name); if (!clip) return null; actions[name] = mixer.clipAction(clip); }
    return actions[name];
  };
  let pose = 'stand', current = null, expr = 'idle', opacity = 1;
  const phase = (hashSeed(P.seed) % 6283) / 1000;
  function play(name) {
    const a = action(name) || action('idle');
    if (a === current) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (current) current.crossFadeTo(a, 0.25, false); else a.fadeIn(0.01);
    current = a;
  }
  play('idle');

  // ---- props in the right hand (built for the box figures' hand: +Y up the arm, +Z forward, box model units)
  const hand = new THREE.Group(); hand.position.set(-0.26, -0.01, 0); hand.rotation.z = -Math.PI / 2; armR.add(hand);
  const propHolder = new THREE.Group(); propHolder.scale.setScalar(AGENT_SCALE / S); hand.add(propHolder);
  const front = new THREE.Group(); front.position.set(0, 0.06, 0.2); torso.add(front); // carry anchor
  const frontHolder = new THREE.Group(); frontHolder.scale.setScalar(AGENT_SCALE / S); front.add(frontHolder);
  let propKind = null, propObj = null;
  function placeProp() {
    if (!propObj) return;
    const want = pose === 'carry' ? frontHolder : propHolder;
    if (propObj.parent !== want) want.add(propObj);
    propObj.visible = !(pose === 'type' || pose === 'nap' || pose.startsWith('workout'));
  }
  function setProp(kind) {
    kind = kind || null;
    if (kind === 'hero') kind = P.prop ? P.prop.type : null;
    if (kind === propKind) return;
    if (propObj && propObj.parent) propObj.parent.remove(propObj);
    propObj = null; propKind = kind;
    if (!kind) return;
    const built = buildProp(kind, P.prop && P.prop.type === kind ? P.prop.color : null);
    if (!built) { propKind = null; return; }
    propObj = built.obj;
    propObj.traverse((o) => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; });
    if (opacity < 1) applyOpacity(propObj);
    placeProp();
  }
  function setPose(p) { if (!CLIP[p]) p = 'stand'; if (p === pose) return; pose = p; play(CLIP[p]); placeProp(); }
  function setExpression(e) { expr = e; } // Kenney faces are painted: nothing to change

  // ---- fading (napping, leaving): per-figure transparent copies of the shared materials
  const fades = new Map();
  function fadeOf(m) { let c = fades.get(m); if (!c) { c = m.clone(); c.userData.baseOpacity = m.opacity; c.transparent = true; fades.set(m, c); } c.opacity = c.userData.baseOpacity * opacity; return c; }
  function applyOpacity(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.baseMat) o.userData.baseMat = o.material;
      o.material = opacity >= 0.999 ? o.userData.baseMat : fadeOf(o.userData.baseMat);
    });
  }
  function setOpacity(a) { a = Math.max(0, Math.min(1, +a || 0)); if (Math.abs(a - opacity) < 0.001) return; opacity = a; applyOpacity(root); }

  // ---- per frame
  let walkRate = 1;
  function update(t, dt = 1 / 60, opts = {}) {
    const speed = Math.max(0, (opts && opts.speed) || 0);
    if (current && current === actions.walk) { walkRate += ((speed > 0.05 ? Math.min(2.6, speed / 0.9) : 1) - walkRate) * Math.min(1, dt * 6); current.timeScale = pose === 'workout-run' ? 2.2 : walkRate; }
    mixer.update(Math.min(0.1, dt));
    // seated poses sit on the chair: the clip puts the hips near the floor
    body.position.y = SEATED.has(pose) ? SEAT_HEIGHT - HIPS_SIT * scale : 0;
    // bones adjusted on top of the clip (arms swing forward about Y, up about Z; the big head hides an arm held straight up)
    switch (pose) {
      case 'type': armR.rotation.set(0, 1.15, 0.1 + Math.sin(t * 16 + phase) * 0.06); armL.rotation.set(0, -1.15, -0.1 - Math.sin(t * 16 + phase + Math.PI) * 0.06); head.rotation.x = 0.08; break;
      case 'raise': { const urgent = (t + phase) % 5 > 3.6; armR.rotation.set(0, 0.25, -0.95 + Math.sin(t * (urgent ? 16 : 7)) * (urgent ? 0.3 : 0.18)); break; }
      case 'cheer': { const p = Math.sin(t * 9 + phase); armR.rotation.set(0, 0.2, -0.95 + p * 0.25); armL.rotation.set(0, -0.2, 0.95 - p * 0.25); body.position.y = Math.abs(Math.sin(t * 4.5 + phase)) * 0.06; break; }
      case 'talk': armR.rotation.set(0, 0.7 + Math.sin(t * 3.1 + phase) * 0.25, 0.3); head.rotation.y = Math.sin(t * 1.3 + phase) * 0.15; break;
      case 'nap': head.rotation.x = 0.45; armR.rotation.set(0, 1.0, 0.3); armL.rotation.set(0, -1.0, -0.3); body.position.y += Math.sin(t * 1.1 + phase) * 0.004; break;
      case 'workout-lift': { const s = Math.sin(t * 3.2 + phase) * 0.5 + 0.5; armR.rotation.set(0, 0, 0.2 - s * 1.1); armL.rotation.set(0, 0, -0.2 + s * 1.1); break; }
      case 'workout-bike': armR.rotation.set(0, 1.0, 0.2); armL.rotation.set(0, -1.0, -0.2); break;
      default: break;
    }
    if (pose === 'stand' && propObj && propObj.visible) armR.rotation.set(0, 0.9, 0.2); // hold the mug or card out a little
    if (propObj && propObj.userData.bob) propObj.userData.bob.position.y = 0.05 + Math.sin(t * 2.4 + phase) * 0.008;
  }
  function dispose() {
    if (root.parent) root.parent.remove(root);
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    for (const c of fades.values()) c.dispose();
    shadow.geometry.dispose(); shadow.material.dispose();
  }

  update(0, 0, {});
  root.updateMatrixWorld(true);
  return {
    root, height: HEIGHT * (P.scale || 1), profile: P,
    get pose() { return pose; }, get expression() { return expr; }, get prop() { return propKind; },
    defaultProp: P.prop ? P.prop.type : null,
    anchors: { handR: hand, handL: armL, carry: front, head },
    setPose, setExpression, setProp, setOpacity, update, dispose,
  };
}
