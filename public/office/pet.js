// The office dog: where it goes (a pure decision, unit-tested) and the box-built dog itself.
// It runs to an agent that is waiting for you, cheers one that just finished, naps in its bed at night or
// when nobody is working, and otherwise wanders the office.

const WORKING = new Set(['thinking', 'reading', 'writing', 'running', 'delegating', 'browsing', 'planning', 'tests', 'build', 'deploy', 'data', 'review', 'git']);
const beside = (p) => [p[0] + 0.35, p[1] - 0.45]; // by the agent's chair, on the aisle side

// agents: [{ name, state, since, pos }] (pos: where the agent is now, null if not on the floor yet)
// bed: [x, z]; wander: { pos, key } — the current wandering spot, picked by the caller.
// Returns { mode: 'alert' | 'happy' | 'sleep' | 'idle', pos, key }.
export function petGoal({ agents, night, bed, wander }) {
  const here = (agents || []).filter((a) => a.pos);
  const needs = here.filter((a) => a.state === 'waiting' || a.state === 'asking').sort((a, b) => a.since - b.since);
  if (needs.length) return { mode: 'alert', pos: beside(needs[0].pos), key: `visit:${needs[0].name}` };
  const done = here.find((a) => a.state === 'done');
  if (done) return { mode: 'happy', pos: beside(done.pos), key: `visit:${done.name}` };
  if (night || !here.some((a) => WORKING.has(a.state))) return { mode: 'sleep', pos: bed, key: 'bed' };
  return { mode: 'idle', pos: wander.pos, key: wander.key };
}

// A small low-poly dog, about knee high, facing +z. update(t, dt, { mode, moving }) animates it.
export function buildDog(THREE) {
  const fur = new THREE.MeshStandardMaterial({ color: '#c8893a', roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#7a4a1c', roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 });
  const collar = new THREE.MeshStandardMaterial({ color: '#d33a2c', roughness: 0.6 });
  const box = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const group = new THREE.Group(); // on the floor; rotation.y = heading
  const body = new THREE.Group(); body.position.y = 0.2; group.add(body);
  box(0.15, 0.14, 0.34, fur, 0, 0, 0, body);
  // head on a neck pivot so it can droop when asleep
  const neck = new THREE.Group(); neck.position.set(0, 0.06, 0.16); body.add(neck);
  box(0.13, 0.12, 0.13, fur, 0, 0.06, 0.06, neck);
  box(0.08, 0.06, 0.08, fur, 0, 0.03, 0.15, neck);           // snout
  box(0.035, 0.03, 0.02, black, 0, 0.055, 0.195, neck);      // nose
  for (const s of [-1, 1]) {
    box(0.02, 0.02, 0.01, black, s * 0.035, 0.09, 0.126, neck); // eyes
    const ear = box(0.03, 0.08, 0.05, dark, s * 0.07, 0.07, 0.04, neck); ear.rotation.z = s * 0.25;
  }
  box(0.135, 0.025, 0.04, collar, 0, -0.005, 0.0, neck);
  // legs hang from hip / shoulder pivots
  const legs = [];
  for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.05, z); body.add(hip);
    box(0.04, 0.15, 0.045, fur, 0, -0.075, 0, hip);
    box(0.045, 0.02, 0.06, dark, 0, -0.15, 0.01, hip);
    legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.05, -0.17); body.add(tail);
  const tailMesh = box(0.03, 0.03, 0.13, dark, 0, 0.03, -0.06, tail); tailMesh.rotation.x = -0.6;

  // body heights that put the paws on the floor (feet end 0.21 below the body centre when standing)
  const STAND_Y = 0.21, SIT_Y = 0.17, SLEEP_Y = 0.13;
  let phase = 0;
  function update(t, dt, { mode, moving }) {
    const asleep = mode === 'sleep' && !moving;
    phase += dt * (moving ? 14 : 0);
    const sit = !asleep && !moving && (mode === 'alert' || mode === 'idle');
    // legs 0-1 front, 2-3 back. Walking: diagonal pairs swing together. Asleep: stretched out front and back.
    // Sitting: back legs folded forward under the body.
    legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 : asleep ? (i < 2 ? -1.35 : 1.35) : sit && i >= 2 ? -1.25 : 0; });
    const wag = { alert: 20, happy: 24, idle: 9 }[mode] || 0;
    tail.rotation.y = asleep ? 0.9 : Math.sin(t * wag) * 0.6;
    if (asleep) {
      body.position.y = SLEEP_Y + Math.sin(t * 1.6) * 0.004; // lying down, breathing
      body.rotation.x = 0; neck.rotation.x = 0.45;
    } else {
      const hop = !moving && mode === 'happy' ? Math.abs(Math.sin(t * 7)) * 0.09 : 0;
      body.position.y = (sit ? SIT_Y : STAND_Y) + (moving ? Math.abs(Math.sin(phase)) * 0.015 : 0) + hop;
      body.rotation.x = sit ? -0.32 : 0; // sitting: rear down, chest up
      neck.rotation.x = sit ? 0.25 : mode === 'alert' && !moving ? Math.sin(t * 5) * 0.08 : 0;
    }
  }
  function dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); [fur, dark, black, collar].forEach((m) => m.dispose()); }
  return { group, update, dispose };
}

// The dog's bed: a cushion on the floor.
export function buildBed(THREE) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#4b5a78', roughness: 0.95 }));
  rim.position.y = 0.04; rim.receiveShadow = true; g.add(rim);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.085, 20), new THREE.MeshStandardMaterial({ color: '#c9b8a0', roughness: 1 }));
  pad.position.y = 0.045; pad.receiveShadow = true; g.add(pad);
  return g;
}
