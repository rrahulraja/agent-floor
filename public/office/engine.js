// The 3D office. Each agent is a person in a small open-plan office (in the style of Hermes3D, MIT, © 2026 Luke The
// Dev: https://github.com/iamlukethedev/Hermes3D) who walks to the place that matches what it is doing: its desk while
// it works, the QA lab for tests, the review station for PRs, the kitchen and couches when idle. The page drives this
// through window.Floor3D (see index.html); the world, the characters and the walking grid live in world.js,
// avatar.js and nav.js next to this file.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildOffice } from './world.js';
import { buildAvatar, officeProfile, helperProfile, heroProfile, setAvatarOutlines, SEAT_HEIGHT } from './avatar.js';
import { createNav } from './nav.js';

const WALK = 1.25;            // metres per second
const HOLD = 6;               // seconds a new state must last before an agent walks somewhere for it
const IDLE_WANDER = 120;      // idle this long: get up and wander
const IDLE_AWAY = 15 * 60;    // idle this long: nap on a couch
const PARTY_POSE = 6;         // seconds of cheering after finishing
const WORKING = new Set(['thinking', 'reading', 'writing', 'running', 'delegating', 'browsing', 'planning', 'tests', 'build', 'deploy', 'data', 'review', 'git']);
const AT_DESK = new Set(['thinking', 'reading', 'writing', 'running', 'delegating', 'browsing', 'planning', 'data', 'git']);
const RING = { working: '#22c55e', waiting: '#f59e0b', asking: '#3B6FD8', error: '#ef4444' };

const PHASE = {
  dawn: { sky: '#f3c6a8', fog: '#e8c8b4', hemi: ['#ffd9c2', '#6b5a7a', 0.55], sun: ['#ffb38a', 2.2], fill: 0.35, exposure: 1.0 },
  morning: { sky: '#c9dcef', fog: '#c3cedb', hemi: ['#cfe0f4', '#8a6b4d', 0.42], sun: ['#ffedd2', 3.3], fill: 0.55, exposure: 1.05 },
  afternoon: { sky: '#cddbe9', fog: '#c8d2dd', hemi: ['#d8e4f2', '#8a6b4d', 0.42], sun: ['#fff1dc', 3.1], fill: 0.5, exposure: 1.05 },
  evening: { sky: '#e7a77f', fog: '#c99a86', hemi: ['#ffc9a0', '#5a4a6a', 0.62], sun: ['#ffa66a', 2.2], fill: 0.45, exposure: 1.05 },
  night: { sky: '#1a2140', fog: '#1d2440', hemi: ['#8a9ac8', '#24243a', 0.45], sun: ['#9ab0ff', 0.7], fill: 0.3, exposure: 1.0 },
};

// The light looks like each phase at these hours and blends in between, so the day changes gradually.
// Night holds from 21:00 to 04:00 (the last anchor wraps round to the first).
const PHASE_HOURS = [[4, 'night'], [6.5, 'dawn'], [9.5, 'morning'], [14.5, 'afternoon'], [18.5, 'evening'], [21, 'night'], [28, 'night']];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function lightAt(hour) {
  let h = ((hour % 24) + 24) % 24;
  if (h < PHASE_HOURS[0][0]) h += 24;
  let i = 0; while (PHASE_HOURS[i + 1][0] <= h) i++;
  const [h0, a] = PHASE_HOURS[i], [h1, b] = PHASE_HOURS[i + 1];
  const k = (h - h0) / (h1 - h0), A = PHASE[a], B = PHASE[b];
  const mix = (x, y) => x + (y - x) * k, col = (x, y) => `#${_ca.set(x).lerp(_cb.set(y), k).getHexString()}`;
  return { sky: col(A.sky, B.sky), fog: col(A.fog, B.fog), hemi: [col(A.hemi[0], B.hemi[0]), col(A.hemi[1], B.hemi[1]), mix(A.hemi[2], B.hemi[2])],
    sun: [col(A.sun[0], B.sun[0]), mix(A.sun[1], B.sun[1])], fill: mix(A.fill, B.fill), exposure: mix(A.exposure, B.exposure) };
}

const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rand = (seed) => { let x = seed || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)) >>> 0) / 4294967296; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').replace(/[*_`#>]/g, '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const speakFor = (text) => Math.min(9000, Math.max(3400, 1800 + 34 * text.length)) / 1000;

// Where to put the body once it has walked up to a seat: the seat point, raised or lowered to the seat's height.
const seated = (spot) => (spot && spot.seatY !== undefined ? { at: spot.seat || spot.pos, y: spot.seatY - SEAT_HEIGHT } : null);
const using = (g) => (g.use ? { at: g.use, y: g.kind === 'run' ? g.useY : g.useY - SEAT_HEIGHT } : null);

function isSoftware(gl) {
  try {
    const ctx = gl.getContext(), ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
    return /swiftshader|llvmpipe|software/i.test(String(name));
  } catch { return false; }
}

class Office {
  constructor(stage, hooks = {}) {
    this.stage = stage;
    this.hooks = hooks;
    this.box = document.createElement('div'); this.box.className = 'v3d';
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.domElement.className = 'v3d-gl';
    this.bubbles = document.createElement('div'); this.bubbles.className = 'o3d-bubbles';
    this.box.append(this.gl.domElement, this.bubbles);
    stage.prepend(this.box);
    this.software = isSoftware(this.gl);
    this.quality = this.software ? 'low' : 'balanced'; setAvatarOutlines(this.quality !== 'low');

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#c3cedb', 58, 165);
    this.camera = new THREE.PerspectiveCamera(40, 2, 0.3, 320);
    this.hemi = new THREE.HemisphereLight('#cfe0f4', '#8a6b4d', 0.38);
    this.sun = new THREE.DirectionalLight('#ffedd2', 3.3);
    this.sun.position.set(16, 24, 13); this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00015; this.sun.shadow.normalBias = 0.025; this.sun.shadow.radius = 4;
    this.fill = new THREE.DirectionalLight('#a7c4ef', 0.55); this.fill.position.set(-14, 12, -10);
    this.spot = new THREE.SpotLight('#fff6d8', 0, 12, 0.45, 0.6, 1.2); this.spot.position.set(0, 5, 0);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.spot, this.spot.target);

    this.controls = new OrbitControls(this.camera, this.gl.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.6, zoomSpeed: 0.8, panSpeed: 0.6, minDistance: 1, maxDistance: 65, maxPolarAngle: Math.PI / 2.2, screenSpacePanning: false });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('start', () => { this.fly = null; });

    this.actors = new Map();     // agent name -> actor
    this.extras = [];            // helpers, janitors: actors that aren't agents
    this.confetti = [];
    this.heroes = this.loadHeroes(); this.claimed = new Set();
    this.standup = null;
    this.follow = null;
    this.fly = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindPointer();
    this.sizeKey = '';
  }

  // ---------- theme + world ----------
  async setTheme(theme, url) {
    this.theme = theme; this.url = url;
    this.kind = theme.id === 'heroes' || /hero/i.test(theme.id) ? 'heroes' : 'office';
    this.cast = null;
    if (theme.model) { try { this.cast = (await (await fetch(url(theme.model))).json()).cast || null; } catch { this.cast = null; } }
    for (const a of [...this.actors.values(), ...this.extras]) this.dropActor(a);
    this.actors.clear(); this.extras = [];
    this.deskCount = 0;
    await this.ensureWorld(8);
    return this.theme === theme;
  }
  async ensureWorld(need) {
    const count = Math.max(8, Math.ceil(need / 4) * 4);
    if (this.world && count <= this.deskCount) return;
    if (this.building) return this.building;
    this.building = (async () => {
      const w = await buildOffice({ deskCount: count, quality: this.quality });
      if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
      this.world = w; this.deskCount = count;
      this.scene.add(w.group);
      const b = w.bounds;
      this.nav = createNav({ minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ, cell: 0.25 });
      for (const k of w.blockers) k.kind === 'circle' ? this.nav.blockCircle(k.x, k.z, k.r) : this.nav.blockRect(k.x, k.z, k.w, k.d, k.rotY || 0, k.pad || 0);
      const R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.7;
      const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
      this.sun.shadow.mapSize.set(this.quality === 'low' ? 1024 : 2048, this.quality === 'low' ? 1024 : 2048);
      this.center = [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
      this.sun.target.position.set(this.center[0], 0, this.center[1]);
      this.sun.position.set(this.center[0] + 16, 24, this.center[1] + 13);
      this.lightKey = null; // place the sun for the time of day again
      this.makeDust();
      // everyone re-plans on the new floor
      for (const a of [...this.actors.values(), ...this.extras]) { a.path = null; a.goalKey = ''; }
      this.sizeKey = '';
      this.overview(true);
    })();
    try { await this.building; } finally { this.building = null; }
  }
  makeDust() {
    if (this.dust) this.scene.remove(this.dust);
    if (this.quality === 'low') { this.dust = null; return; }
    const b = this.world.bounds, n = 220, pos = new Float32Array(n * 3), r = rand(7);
    for (let i = 0; i < n; i++) { pos[i * 3] = b.minX + r() * (b.maxX - b.minX); pos[i * 3 + 1] = 0.3 + r() * 2.2; pos[i * 3 + 2] = b.minZ + r() * (b.maxZ - b.minZ); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff6e0', size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);
  }

  // ---------- who looks like what ----------
  loadHeroes() { try { return JSON.parse(localStorage.getItem('af:heroes') || '{}'); } catch { return {}; } }
  // The server remembers each agent's hero (agents.json), so every browser shows the same one. When it has
  // none yet, this browser picks a free one and claims it; the first claim wins and the others follow it.
  syncHeroes(list) {
    if (this.kind !== 'heroes' || !this.cast) return;
    for (const ag of list) {
      if (ag.hero === undefined) continue; // an older server: keep the browser's own choice
      if (ag.hero && this.cast[ag.hero]) {
        if (this.heroes[ag.name] !== ag.hero) { this.heroes[ag.name] = ag.hero; try { localStorage.setItem('af:heroes', JSON.stringify(this.heroes)); } catch {} }
      } else if (!this.claimed.has(ag.name) && this.hooks.claimHero) {
        this.claimed.add(ag.name);
        this.heroFor(ag.name);
        this.hooks.claimHero(ag.name, this.heroes[ag.name]);
      }
    }
  }
  heroFor(name) {
    if (!this.cast) return null;
    const roster = Object.entries(this.cast).filter(([k]) => k !== 'helper');
    if (!this.heroes[name] || !this.cast[this.heroes[name]]) {
      const taken = new Set(Object.values(this.heroes));
      const live = new Set([...this.actors.keys()]);
      const free = roster.find(([k]) => !taken.has(k)) || roster.find(([k]) => ![...live].some((n) => this.heroes[n] === k)) || roster[hashStr(name) % roster.length];
      this.heroes[name] = free[0];
      try { localStorage.setItem('af:heroes', JSON.stringify(this.heroes)); } catch {}
    }
    return this.cast[this.heroes[name]];
  }
  // The character name this agent plays (for name plates and the activity feed).
  characterName(name) { const h = this.kind === 'heroes' ? this.heroFor(name) : null; return h ? h.name : ''; }
  profileFor(name) { const h = this.kind === 'heroes' ? this.heroFor(name) : null; return h ? heroProfile(h, name) : officeProfile(name); }

  // ---------- actors ----------
  makeActor(name, profile, opts = {}) {
    const av = buildAvatar(profile);
    const ent = this.world.anchors.entrance.pos;
    const a = {
      name, av, pos: opts.at ? [...opts.at] : [...ent], yaw: opts.yaw || 0, path: null, goalKey: '', target: null,
      pose: '', moving: 0, ringMesh: null, bubble: null, speech: null, extra: !!opts.extra, born: performance.now() / 1000,
      seed: hashStr(name), r: rand(hashStr(name)),
    };
    av.root.position.set(a.pos[0], 0, a.pos[1]);
    av.root.userData.actor = name;
    av.root.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.userData.actor = name; } }); // blob shadows and glows don't cast
    this.scene.add(av.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32), new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.renderOrder = 2;
    this.scene.add(ring); a.ringMesh = ring;
    return a;
  }
  redress(a) {
    const old = a.av, pose = old.pose, prop = old.prop;
    const av = buildAvatar(this.profileFor(a.name));
    av.root.position.copy(old.root.position); av.root.rotation.copy(old.root.rotation);
    av.root.userData.actor = a.name;
    av.root.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.userData.actor = a.name; } });
    this.scene.remove(old.root); old.dispose();
    this.scene.add(av.root);
    av.setPose(pose); av.setProp(prop);
    a.av = av; a.heroKey = this.heroes[a.name];
  }
  dropActor(a) {
    this.scene.remove(a.av.root); a.av.dispose();
    if (a.ringMesh) { this.scene.remove(a.ringMesh); a.ringMesh.geometry.dispose(); a.ringMesh.material.dispose(); }
    if (a.bubble) a.bubble.remove();
    if (a.plate) a.plate.remove();
    if (a.partyIcon) this.scene.remove(a.partyIcon);
  }
  // Walk to pos (and then face/pose). Plans a path once per new goal.
  goTo(a, pos, facing, pose, key) {
    const k = key || `${pos[0].toFixed(2)},${pos[1].toFixed(2)}`;
    a.target = { pos, facing, pose };
    if (a.goalKey === k) return;
    a.goalKey = k;
    a.path = this.nav ? this.nav.findPath(a.pos, pos) : [pos];
    if (!a.path) a.path = [pos]; // no route: walk straight (rare; better than freezing)
  }
  step(a, dt, speedMul = 1) {
    if (!a.path || !a.path.length) { a.moving = 0; return true; }
    let left = WALK * speedMul * dt;
    while (left > 0 && a.path.length) {
      const p = a.path[0], d = dist(a.pos, p);
      if (d <= left) { a.pos = [p[0], p[1]]; a.path.shift(); left -= d; continue; }
      const k = left / d; a.pos[0] += (p[0] - a.pos[0]) * k; a.pos[1] += (p[1] - a.pos[1]) * k;
      a.yaw = lerpAngle(a.yaw, Math.atan2(p[0] - a.pos[0], p[1] - a.pos[1]), Math.min(1, dt * 10));
      left = 0;
    }
    a.moving = a.path.length ? WALK * speedMul : 0;
    return !a.path.length;
  }

    // Decides where an agent should be and what it is doing there.
  place(a, ag, t, i) {
    const W = this.world.anchors, st = ag.state;
    // a state only moves people once it has lasted a little (quick test runs don't send them across the room)
    if (st !== a.st) { a.st = st; a.stSince = t; }
    const urgent = st === 'waiting' || st === 'asking' || st === 'done' || st === 'stopped';
    if (urgent || t - a.stSince >= HOLD || a.settled === undefined) a.settled = st;
    const s = a.settled;
    const desk = W.desks[i % W.desks.length];
    const stand = [desk.seat[0] - Math.sin(desk.facing) * 0.45, desk.seat[1] - Math.cos(desk.facing) * 0.45];
    a.mood = 'idle';
    if (s === 'stopped') return { pos: W.entrance.pos, facing: W.entrance.facing, pose: 'stand', leave: true };
    if (this.standup && this.standup.seats.has(ag.name)) {
      const seat = this.standup.seats.get(ag.name);
      return { pos: seat.pos, facing: seat.facing, pose: 'sit', key: `standup:${ag.name}`, snap: seated(seat) };
    }
    if (a.partyUntil > t) { a.mood = 'happy'; return { pos: stand, facing: desk.facing, pose: 'cheer', key: `desk:${i}:stand` }; }
    if (s === 'waiting') { a.mood = 'waiting'; return { pos: stand, facing: desk.facing, pose: 'raise', key: `desk:${i}:stand` }; }
    if (s === 'asking') { a.mood = 'asking'; return { pos: stand, facing: desk.facing, pose: 'raise', key: `desk:${i}:stand` }; }
    if (s === 'tests' && W.qa.length) { a.mood = 'working'; const q = W.qa[i % W.qa.length]; return { pos: q.pos, facing: q.facing, pose: 'stand', key: `qa:${i % W.qa.length}` }; }
    if ((s === 'review' || (s === 'git' && ag.pr)) && W.review) { a.mood = 'working'; return { pos: W.review.pos, facing: W.review.facing, pose: 'stand', key: 'review' }; }
    if ((s === 'build' || s === 'deploy') && W.servers.length) { a.mood = 'working'; const v = W.servers[i % W.servers.length]; return { pos: v.pos, facing: v.facing, pose: 'stand', key: `server:${i % W.servers.length}` }; }
    if (AT_DESK.has(s) || WORKING.has(s)) { a.mood = 'working'; return { pos: desk.seat, facing: desk.facing, pose: 'type', key: `desk:${i}`, snap: seated(desk) }; }
    // idle (and done, once the cheering is over)
    const idleFor = t - (a.idleSince ?? (a.idleSince = t));
    if (idleFor < IDLE_WANDER || this.motionOff) return { pos: desk.seat, facing: desk.facing, pose: 'sit', key: `desk:${i}`, snap: seated(desk) };
    if (idleFor >= IDLE_AWAY && W.couches.length) {
      a.mood = 'away';
      const c = W.couches[i % W.couches.length];
      return { pos: c.pos, facing: c.facing, pose: 'nap', key: `couch:${i % W.couches.length}`, snap: seated(c) };
    }
    // wander: a new spot every 25-50 s
    if (!a.spot || t > a.spotUntil) {
      const options = [...W.kitchen.map((k) => ({ ...k, pose: k.kind === 'table' ? 'sit' : 'stand', prop: k.kind === 'coffee' || k.kind === 'water' ? 'mug' : null, snap: k.kind === 'table' ? seated(k) : null })),
        ...W.couches.map((c) => ({ ...c, pose: 'sit', snap: seated(c) })), ...W.beanbags.map((c) => ({ ...c, pose: 'sit', snap: seated(c) })),
        ...W.gym.map((g) => ({ ...g, pose: `workout-${g.kind}`, snap: using(g) })), ...W.wander.map((p) => ({ pos: p, facing: a.r() * 6.28, pose: 'stand' }))];
      const taken = new Set([...this.actors.values()].filter((o) => o !== a && o.spot).map((o) => o.spot.key));
      const free = options.map((o, k) => ({ ...o, key: `w${k}` })).filter((o) => !taken.has(o.key));
      a.spot = free[Math.floor(a.r() * free.length)] || options[0];
      a.spotUntil = t + 25 + a.r() * 25;
    }
    if (a.pingpong) return a.pingpong;
    return { pos: a.spot.pos, facing: a.spot.facing, pose: a.spot.pose, prop: a.spot.prop, key: a.spot.key, snap: a.spot.snap };
  }

  // Two agents who have been idle a while sometimes play ping-pong for a minute.
  pairPingPong(t) {
    const W = this.world.anchors;
    if (!W.pingpong || this.motionOff) return;
    if (this.pp && t > this.pp.until) { for (const n of this.pp.who) { const a = this.actors.get(n); if (a) a.pingpong = null; } this.pp = null; this.ppNext = t + 90; }
    if (this.pp || t < (this.ppNext || 0)) return;
    const idle = [...this.actors.values()].filter((a) => a.spot && a.mood === 'idle' && !a.pingpong);
    if (idle.length < 2) return;
    const [p, q] = idle;
    this.pp = { who: [p.name, q.name], until: t + 60 };
    W.pingpong.sides.forEach((side, k) => { const a = k ? q : p; a.pingpong = { pos: side.pos, facing: side.facing, pose: 'pingpong', key: `pp${k}` }; });
    this.say(p, 'Ping-pong? 🏓', t);
  }

  // ---------- speech ----------
  // One speaker at a time, like a real room; others wait their turn (at most 4 queued).
  queueSpeech(a, text, kind = '') {
    if (!text) return;
    this.speechQueue = (this.speechQueue || []).filter((s) => s.a !== a).slice(-3);
    this.speechQueue.push({ a, text: clip(text, 180), kind });
  }
  say(a, text, t, secs) { a.speech = { text: clip(text, 180), until: t + (secs || speakFor(text)) }; }
  tickSpeech(t) {
    const talking = [...this.actors.values(), ...this.extras].some((a) => a.speech && a.speech.until > t && !a.speech.ambient);
    if (!talking && this.speechQueue && this.speechQueue.length) { const s = this.speechQueue.shift(); if (this.actors.has(s.a.name) || this.extras.includes(s.a)) this.say(s.a, s.text, t); }
  }

  // ---------- helpers: hand-off and give-back ----------
  syncHelpers(a, ag, t, deskIdx) {
    a.helpers = a.helpers || new Map();
    const want = new Map((ag.helpers || []).map((h, k) => [h.id || `${k}`, h]));
    for (const [id, h] of want) {
      if (a.helpers.has(id)) { a.helpers.get(id).data = h; continue; }
      const hp = this.makeActor(`${a.name}:h:${id}`, helperProfile(`${a.name}:${id}`, this.kind), { extra: true });
      hp.owner = a.name; hp.phase = 'arrive'; hp.data = h; hp.av.root.scale.setScalar(0.85);
      a.helpers.set(id, hp); this.extras.push(hp);
      a.handing = (a.handing || 0) + 1;
    }
    for (const [id, hp] of a.helpers) if (!want.has(id) && hp.phase !== 'return' && hp.phase !== 'leave') { hp.phase = 'return'; hp.goalKey = ''; }
  }
  tickHelper(hp, t, dt) {
    const owner = this.actors.get(hp.owner);
    const W = this.world.anchors;
    const near = owner ? [owner.pos[0] + 0.7, owner.pos[1] + 0.5] : W.entrance.pos;
    if (hp.phase === 'arrive') {
      this.goTo(hp, near, 0, 'walk', `h:${hp.owner}:near`);
      if (this.step(hp, dt, 1.3)) {
        hp.phase = 'work'; hp.goalKey = '';
        if (owner) { this.flyCard(owner, hp); this.say(owner, 'Take this one 📋', t, 2.5); }
        hp.av.setProp('card');
      }
    } else if (hp.phase === 'work') {
      // a free desk if there is one, otherwise stand beside the owner
      if (hp.desk === undefined) {
        const used = new Set([...this.actors.values()].map((x) => x.deskIdx).concat(this.extras.map((x) => x.desk)).filter((x) => x !== undefined));
        const freeDesk = W.desks.findIndex((d, k) => !used.has(k));
        hp.desk = freeDesk >= 0 ? freeDesk : null;
      }
      const d = hp.desk !== null ? W.desks[hp.desk] : null;
      const working = hp.data && hp.data.state === 'working';
      if (d) this.goTo(hp, d.seat, d.facing, 'type', `h:desk:${hp.desk}`);
      else this.goTo(hp, near, 0, 'stand', `h:${hp.owner}:near`);
      hp.snapY = d && hp.path && !hp.path.length ? d.seatY - SEAT_HEIGHT : 0;
      if (this.step(hp, dt, 1.2)) { hp.av.setProp(null); this.setPose(hp, d ? (working ? 'type' : 'sit') : 'stand'); if (hp.target) hp.yaw = lerpAngle(hp.yaw, hp.target.facing, 0.15); }
    } else if (hp.phase === 'return') {
      hp.av.setProp('card');
      this.goTo(hp, near, 0, 'walk', `h:${hp.owner}:back`);
      if (this.step(hp, dt, 1.4)) { if (owner) { this.flyCard(hp, owner); this.say(hp, 'Done ✅', t, 2); } hp.av.setProp(null); hp.phase = 'leave'; hp.goalKey = ''; }
    } else if (hp.phase === 'leave') {
      this.goTo(hp, W.entrance.pos, 0, 'walk', 'h:leave');
      if (this.step(hp, dt, 1.4)) hp.gone = true;
    }
  }
  flyCard(from, to) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.22), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; card.add(glow);
    this.scene.add(card);
    this.cards = this.cards || [];
    this.cards.push({ mesh: card, from: [...from.pos], to, t0: this.now || 0, dur: 0.9 });
  }
  tickCards(t) {
    for (const c of this.cards || []) {
      const k = Math.min(1, (t - c.t0) / c.dur), to = c.to.pos;
      c.mesh.position.set(c.from[0] + (to[0] - c.from[0]) * k, 0.8 + Math.sin(k * Math.PI) * 0.9, c.from[1] + (to[1] - c.from[1]) * k);
      c.mesh.rotation.y = k * 6;
      if (k >= 1) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.done = true; }
    }
    if (this.cards) this.cards = this.cards.filter((c) => !c.done);
  }

  // ---------- janitors: an agent's conversation was cleared ----------
  janitors(a, t) {
    const props = ['broom', 'vacuum'];
    props.forEach((p, k) => {
      const j = this.makeActor(`janitor:${a.name}:${t}:${k}`, { ...officeProfile(`janitor${k}`), top: { style: 'tee', color: '#4b5563' }, bottom: { style: 'pants', color: '#374151' }, hat: 'cap', hatColor: '#4b5563' }, { extra: true });
      j.janitor = { owner: a.name, until: t + 6 + k, prop: p, off: k ? [-0.6, 0.6] : [0.6, 0.4] };
      j.av.setProp(p);
      this.extras.push(j);
    });
  }
  tickJanitor(j, t, dt) {
    const owner = this.actors.get(j.janitor.owner);
    const W = this.world.anchors;
    if (!j.janitor.leaving && owner && t < j.janitor.until + 30) {
      this.goTo(j, [owner.pos[0] + j.janitor.off[0], owner.pos[1] + j.janitor.off[1]], 0, 'stand', `j:${j.janitor.owner}`);
      if (this.step(j, dt, 1.5)) {
        this.setPose(j, 'stand');
        if (!j.janitor.sweepFrom) j.janitor.sweepFrom = t;
        j.yaw += Math.sin(t * 3) * 0.02;
        if (t - j.janitor.sweepFrom > 4) { j.janitor.leaving = true; j.goalKey = ''; }
      }
    } else {
      this.goTo(j, W.entrance.pos, 0, 'walk', 'j:leave');
      if (this.step(j, dt, 1.5)) j.gone = true;
    }
  }

  // ---------- standup ----------
  startStandup(names) {
    const W = this.world && this.world.anchors;
    if (!W || !W.meeting || !W.meeting.seats.length) return false;
    const who = names.filter((n) => this.actors.has(n));
    if (!who.length) return false;
    const seats = new Map();
    who.forEach((n, k) => {
      const s = W.meeting.seats[k];
      if (s) seats.set(n, s);
      else { const ang = (k / who.length) * Math.PI * 2, c = W.meeting.center; seats.set(n, { pos: [c[0] + Math.cos(ang) * 2.4, c[1] + Math.sin(ang) * 2.4], facing: Math.atan2(-Math.cos(ang), -Math.sin(ang)) }); }
    });
    this.standup = { seats, order: who, phase: 'gathering', since: null, speaker: -1, next: 0 }; // since: set on the next frame, on the frame clock
    this.notify();
    return true;
  }
  tickStandup(t, agents) {
    const S = this.standup;
    if (!S) return;
    if (S.since === null) S.since = t;
    const arrived = S.order.filter((n) => { const a = this.actors.get(n); return a && !a.path?.length && a.goalKey === `standup:${n}`; }).length;
    if (S.phase === 'gathering' && (arrived === S.order.length || t - S.since > 25)) { S.phase = 'talking'; S.next = t; }
    if (S.phase === 'talking' && t >= S.next) {
      S.speaker++;
      if (S.speaker >= S.order.length) { S.phase = 'done'; this.standup = null; this.notify(); return; }
      const n = S.order[S.speaker], a = this.actors.get(n), ag = agents.find((x) => x.name === n);
      const line = ag ? `${ag.label}: ${clip(ag.detail || ag.lastPrompt || 'nothing new', 120)}` : n;
      if (a) this.say(a, line, t, 5);
      S.next = t + 5.5;
    }
    this.notify(`${S.phase === 'gathering' ? 'Standup: gathering' : `Standup: ${S.order[S.speaker] ? (this.actors.get(S.order[S.speaker]) || {}).label || S.order[S.speaker] : ''} speaking`} · ${arrived}/${S.order.length} here`);
  }
  notify(text = '') { if (this.hooks.onStandup && text !== this.lastStandup) { this.lastStandup = text; this.hooks.onStandup(text); } }

  setPose(a, pose) { if (a.pose !== pose) { a.pose = pose; a.av.setPose(pose); } }

  // ---------- the frame ----------
  // L: { agents: [{ name, label, state, detail, lastPrompt, question, pr, helpers, sessionId, party: { kind, file } | null, selected }], phase, t, dt, motion }
  render(L) {
    if (!this.world) return false;
    const t = L.t, dt = Math.min(0.1, L.dt);
    this.now = t;
    this.motionOff = !L.motion;
    const need = L.agents.length + L.agents.reduce((n, a) => n + (a.helpers || []).length, 0);
    if (need > this.deskCount) this.ensureWorld(need);
    const refit = this.fit();
    this.syncHeroes(L.agents);
    const live = new Set();
    L.agents.forEach((ag, i) => {
      live.add(ag.name);
      let a = this.actors.get(ag.name);
      // dressed as another hero than the server says (another browser claimed first): change costume in place
      if (a && this.kind === 'heroes' && a.heroKey && this.heroes[ag.name] && a.heroKey !== this.heroes[ag.name]) this.redress(a);
      if (!a) {
        // A stopped agent isn't in the office: don't place it only to walk it out (on page load), or
        // rebuild it at the door every frame after it has left.
        if (ag.state === 'stopped') return;
        // people already on the floor when the page opens start at their desks; new ones walk in
        const first = !this.seenAny;
        a = this.makeActor(ag.name, this.profileFor(ag.name), first ? { at: this.world.anchors.desks[i % this.world.anchors.desks.length].seat } : {});
        a.heroKey = this.kind === 'heroes' ? this.heroes[ag.name] : null;
        a.label = ag.label;
        this.actors.set(ag.name, a);
        a.sessionId = ag.sessionId;
      }
      a.label = ag.label; a.deskIdx = i;
      if (ag.sessionId && a.sessionId && ag.sessionId !== a.sessionId && L.motion) this.janitors(a, t);
      a.sessionId = ag.sessionId || a.sessionId;
      // speech for things you need to know about
      if (ag.state !== a.lastSpoken) {
        if (ag.state === 'asking' && ag.question) this.queueSpeech(a, ag.question);
        else if (ag.state === 'waiting') this.queueSpeech(a, `Need your OK: ${ag.detail || 'approval'}`);
        else if (ag.state === 'done' && ag.lastReply) this.queueSpeech(a, ag.lastReply);
        a.lastSpoken = ag.state;
      }
      if (ag.state === 'idle' || ag.state === 'done') { if (a.idleSince === undefined) a.idleSince = t; } else { a.idleSince = undefined; a.spot = null; a.pingpong = null; }
      if (ag.party && !a.party) { a.partyUntil = t + PARTY_POSE; if (L.motion) this.burst(a); this.partyIcon(a, ag.party.file); }
      if (!ag.party && a.party) { if (a.partyIcon) this.scene.remove(a.partyIcon); a.partyIcon = null; }
      a.party = ag.party;
      if (ag.state === 'done' && a.prevState !== 'done') a.partyUntil = Math.max(a.partyUntil || 0, t + PARTY_POSE);
      a.prevState = ag.state;

      const goal = this.place(a, ag, t, i);
      this.goTo(a, goal.pos, goal.facing, goal.pose, goal.key);
      const arrived = this.step(a, dt, a.mood === 'waiting' || a.mood === 'asking' || (this.standup && this.standup.phase === 'gathering') ? 1.6 : 1);
      if (arrived) {
        // sit down: slide onto the seat (which is inside the furniture, off the walking grid) at its height
        if (goal.snap) { a.pos[0] += (goal.snap.at[0] - a.pos[0]) * 0.25; a.pos[1] += (goal.snap.at[1] - a.pos[1]) * 0.25; a.y = (a.y || 0) + (goal.snap.y - (a.y || 0)) * 0.25; }
        else a.y = (a.y || 0) * 0.75;
        this.setPose(a, goal.pose);
        a.yaw = lerpAngle(a.yaw, goal.facing, Math.min(1, dt * 8));
        a.av.setProp(goal.prop || (goal.pose === 'pingpong' ? 'paddle' : this.kind === 'heroes' && goal.pose !== 'type' && goal.pose !== 'sit' && goal.pose !== 'nap' ? 'hero' : null));
        if (goal.leave) a.gone = true;
      } else { this.setPose(a, 'walk'); a.av.setProp(null); a.y = 0; }
      a.av.setExpression(a.mood === 'away' ? 'sleepy' : a.mood === 'waiting' || a.mood === 'asking' ? 'focused' : a.mood === 'working' ? 'focused' : a.mood === 'happy' ? 'happy' : ag.stuck ? 'error' : 'idle');
      a.av.setOpacity(a.mood === 'away' ? 0.55 : 1);
      a.ring = ag.stuck ? RING.error : a.mood === 'waiting' ? RING.waiting : a.mood === 'asking' ? RING.asking : a.mood === 'working' ? RING.working : null;
      a.selected = ag.selected;
      this.syncHelpers(a, ag, t, i);
      if (this.follow === ag.name) this.followCam(a);
    });
    this.seenAny = true;
    for (const [name, a] of this.actors) if (!live.has(name) || a.gone) {
      if (!a.gone && live.has(name)) continue;
      if (!live.has(name) && !a.leaving) { a.leaving = true; this.goTo(a, this.world.anchors.entrance.pos, 0, 'walk', 'leave'); }
      if (a.leaving && !this.step(a, dt, 1.2)) { this.setPose(a, 'walk'); continue; }
      for (const hp of (a.helpers || new Map()).values()) hp.phase = 'leave';
      this.dropActor(a); this.actors.delete(name);
    }
    for (const x of this.extras) x.janitor ? this.tickJanitor(x, t, dt) : this.tickHelper(x, t, dt);
    for (const x of this.extras) if (x.gone) { this.dropActor(x); const o = this.actors.get(x.owner); if (o && o.helpers) for (const [k, v] of o.helpers) if (v === x) o.helpers.delete(k); }
    this.extras = this.extras.filter((x) => !x.gone);
    this.tickStandup(t, L.agents);
    if (L.draw !== false) this.syncMonitors(L.agents, t);
    this.pairPingPong(t);
    this.tickSpeech(t);
    this.tickCards(t);
    this.tickConfetti(dt);
    // move everyone's model
    for (const a of [...this.actors.values(), ...this.extras]) {
      if (a.moving) this.setPose(a, 'walk');
      a.av.root.position.set(a.pos[0], a.y || a.snapY || 0, a.pos[1]);
      a.av.root.rotation.y = a.yaw;
      a.av.update(t, dt, { speed: L.motion ? a.moving : 0 });
      if (a.ringMesh) {
        a.ringMesh.position.set(a.pos[0], 0.012, a.pos[1]);
        const col = a.selected ? '#ffffff' : a.ring;
        a.ringMesh.material.opacity = col ? (a.selected ? 0.8 : 0.35 + (L.motion ? 0.3 * Math.sin(t * 4) : 0)) : 0;
        if (col) a.ringMesh.material.color.set(col);
      }
      if (a.partyIcon) a.partyIcon.position.set(a.pos[0], a.av.height + 0.55 + (L.motion ? Math.abs(Math.sin(t * 4)) * 0.15 : 0), a.pos[1]);
    }
    this.world.update(t, dt, [...this.actors.values(), ...this.extras].map((a) => a.pos));
    this.light(L.phase, t, L.hour);
    if (this.dust && L.motion) { this.dust.rotation.y = Math.sin(t * 0.03) * 0.02; this.dust.position.y = Math.sin(t * 0.2) * 0.05; }
    this.tickSpot(t);
    this.tickFly();
    this.controls.update();
    if (L.draw === false) return refit; // simulate only (tests fast-forward this way)
    this.draw();
    this.positionBubbles(t);
    return refit;
  }

  // ---------- look ----------
  light(phase, t, hour) {
    // with the hour: blend the light smoothly and move the sun across the sky; without it: the phase as is
    const smooth = Number.isFinite(hour);
    const p = smooth ? lightAt(hour) : PHASE[phase] || PHASE.morning;
    const key = smooth ? Math.round(hour * 60) : phase; // recolour once a minute at most
    if (smooth && this.lightKey !== key && this.center) {
      const day = Math.min(1, Math.max(0, (((hour % 24) + 24) % 24 - 6) / 12)); // 06:00 east … 18:00 west
      const isNight = hour % 24 < 5.5 || hour % 24 > 19.5;
      const x = isNight ? -6 : 18 * Math.cos(Math.PI * day), y = isNight ? 20 : 5 + 22 * Math.sin(Math.PI * day);
      this.sun.position.set(this.center[0] + x, y, this.center[1] + 13);
    }
    if (smooth && this.phase !== phase) { this.phase = phase; if (this.world.setTimeOfDay) this.world.setTimeOfDay(phase); }
    if (this.lightKey !== key) {
      this.lightKey = key;
      if (!smooth) this.phase = phase;
      this.scene.background = new THREE.Color(p.sky);
      this.scene.fog.color.set(p.fog);
      this.hemi.color.set(p.hemi[0]); this.hemi.groundColor.set(p.hemi[1]); this.hemi.intensity = p.hemi[2];
      this.sun.color.set(p.sun[0]); this.fill.intensity = p.fill;
      this.gl.toneMappingExposure = p.exposure;
      if (!smooth && this.world.setTimeOfDay) this.world.setTimeOfDay(phase);
    }
    // Hermes's slow daylight drift: the sun breathes a little over eight minutes
    this.sun.intensity = p.sun[1] * (1 + 0.07 * Math.sin((t / 480) * Math.PI * 2));
  }
  setupComposer(w, h) {
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (this.quality === 'low') return;
    const c = new EffectComposer(this.gl);
    c.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, w, h);
    ao.blendIntensity = 0.85;
    c.addPass(ao);
    c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.4, 0.92));
    c.addPass(new OutputPass());
    c.addPass(new SMAAPass());
    c.setSize(w, h);
    this.composer = c;
  }
  draw() { if (this.composer) this.composer.render(); else this.gl.render(this.scene, this.camera); }

  // Fits renderer and camera to the stage. Returns true when the size changed (name tags must re-place).
  fit() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const key = `${w}x${h}|${this.deskCount}|${this.quality}`;
    if (!w || !h || key === this.sizeKey) return false;
    const first = !this.sizeKey;
    this.sizeKey = key;
    this.gl.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.setupComposer(w, h);
    if (first) this.overview(true);
    return true;
  }
  overview(instant) {
    if (!this.world) return;
    const b = this.world.bounds, c = this.center;
    const span = Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * 1.6);
    const dir = new THREE.Vector3(14, 16, 18).normalize();
    const d = Math.min(this.controls.maxDistance, span * 1.15);
    this.flyTo([c[0], 0, c[1] + 1], dir.multiplyScalar(d), instant);
  }
  preset(name) {
    const W = this.world && this.world.anchors;
    if (!W) return;
    const room = (r) => r && [(r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2];
    const at = { desks: room(W.rooms.desks), lounge: room(W.rooms.lounge), kitchen: room(W.rooms.kitchen), meeting: room(W.rooms.meeting) }[name];
    if (name === 'overview' || !at) return this.overview();
    this.follow = null;
    this.flyTo(at, new THREE.Vector3(5, 7, 8), false);
  }
  flyTo(target, offset, instant) {
    const to = new THREE.Vector3(...target), pos = to.clone().add(offset);
    if (instant) { this.controls.target.copy(to); this.camera.position.copy(pos); this.controls.update(); this.fly = null; return; }
    this.fly = { target: to, pos };
  }
  tickFly() {
    if (!this.fly) return;
    this.controls.target.lerp(this.fly.target, 0.08); this.camera.position.lerp(this.fly.pos, 0.08);
    if (this.camera.position.distanceTo(this.fly.pos) < 0.05) this.fly = null;
  }
  followCam(a) {
    const target = new THREE.Vector3(a.pos[0], 0.6, a.pos[1]);
    const delta = target.clone().sub(this.controls.target);
    this.controls.target.add(delta.multiplyScalar(0.12));
    this.camera.position.add(delta);
  }
  focus(name) {
    const a = this.actors.get(name);
    if (!a) return;
    this.follow = null;
    const m = /^desk:(\d+)$/.exec(a.goalKey || '');
    const desk = m && this.world.anchors.desks[Number(m[1])];
    if (desk && desk.monitor) {
      // at its desk: look over its shoulder at the monitor, which shows its real terminal
      const mon = desk.monitor.getWorldPosition(new THREE.Vector3());
      const back = new THREE.Vector3(desk.seat[0] - mon.x, 0, desk.seat[1] - mon.z).normalize();
      const side = new THREE.Vector3(-back.z, 0, back.x).multiplyScalar(0.6); // beside the head, not through it
      this.flyTo([mon.x, mon.y, mon.z], back.multiplyScalar(1.3).add(side).add(new THREE.Vector3(0, 0.8, 0)), false);
    } else this.flyTo([a.pos[0], 0.6, a.pos[1]], new THREE.Vector3(3.2, 4.2, 5.2), false);
    this.spotOn = { name, until: (this.now || 0) + 2 };
  }
  tickSpot(t) {
    const s = this.spotOn, a = s && this.actors.get(s.name);
    if (!a || t > s.until) { this.spot.intensity = 0; return; }
    const k = 1 - Math.abs(((s.until - t) / 2) * 2 - 1);
    this.spot.intensity = 6 * k * 3;
    this.spot.position.set(a.pos[0], 5, a.pos[1]); this.spot.target.position.set(a.pos[0], 0, a.pos[1]);
  }

  // ---------- monitors: an agent at its desk shows its real terminal on the screen ----------
  showOnMonitor(i, text, t) {
    const desk = this.world.anchors.desks[i];
    if (!desk || !desk.monitor) return;
    const mat = desk.monitor.material, u = desk.monitor.userData;
    if (!u.term) {
      const c = document.createElement('canvas'); c.width = 640; c.height = 400;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      u.term = { c, tex, text: null, at: 0, orig: mat.emissiveMap };
    }
    const term = u.term;
    if (mat.emissiveMap !== term.tex) { mat.emissiveMap = term.tex; mat.needsUpdate = true; }
    if (text === term.text || t - term.at < 0.5) return; // redraw at most twice a second
    term.text = text; term.at = t;
    const g = term.c.getContext('2d');
    g.fillStyle = '#070a10'; g.fillRect(0, 0, 640, 400);
    g.font = '17px Menlo, Monaco, monospace'; g.textBaseline = 'top';
    const lines = String(text || '').replace(/\s+$/, '').split('\n').slice(-19);
    lines.forEach((l, k) => {
      g.fillStyle = /^\s*[❯>]/.test(l) ? '#9ecbff' : /^\s*[●⏺]/.test(l) ? '#e6edf3' : (/\berror\b|\b[1-9]\d* failed|✗/i.test(l) || /\bFAILED\b/.test(l)) ? '#ff9b9b' : '#b8c4d6';
      g.fillText(l.slice(0, 62), 10, 8 + k * 20.5);
    });
    term.tex.needsUpdate = true;
  }
  clearMonitor(i) {
    const desk = this.world.anchors.desks[i], term = desk && desk.monitor && desk.monitor.userData.term;
    if (!term || desk.monitor.material.emissiveMap === term.orig) return;
    desk.monitor.material.emissiveMap = term.orig; desk.monitor.material.needsUpdate = true; term.text = null;
  }
  syncMonitors(list, t) {
    const showing = new Set();
    for (const ag of list) {
      const a = this.actors.get(ag.name), m = a && /^desk:(\d+)$/.exec(a.goalKey || '');
      if (!m || !ag.screen) continue;
      showing.add(Number(m[1]));
      this.showOnMonitor(Number(m[1]), ag.screen, t);
    }
    this.world.anchors.desks.forEach((d, i) => { if (!showing.has(i)) this.clearMonitor(i); });
  }

  // ---------- celebration ----------
  partyIcon(a, file) {
    if (!file || !this.url) return;
    const img = new Image();
    const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace;
    fetch(this.url(file)).then((r) => r.text()).then((svg) => {
      img.onload = () => { tex.needsUpdate = true; };
      img.src = URL.createObjectURL(new Blob([svg.replace(/<svg\b([^>]*)>/, (m, at) => (/\swidth=/.test(at) ? m : `<svg width="128" height="128"${at}>`))], { type: 'image/svg+xml' }));
    }).catch(() => {});
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(0.6, 0.6, 1); s.renderOrder = 5;
    this.scene.add(s); a.partyIcon = s;
  }
  burst(a) {
    const cols = ['#F29E1F', '#3B6FD8', '#2E9E6A', '#C2417A', '#9B4DCA', '#FFE27A', '#D8572A'];
    for (let k = 0; k < 50; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ color: cols[k % cols.length], side: THREE.DoubleSide, transparent: true }));
      m.position.set(a.pos[0], 1.2, a.pos[1]);
      const ang = Math.random() * Math.PI * 2, up = 3 + Math.random() * 2.5, out = 0.8 + Math.random() * 1.6;
      m.userData = { v: new THREE.Vector3(Math.cos(ang) * out, up, Math.sin(ang) * out), life: 2.2 + Math.random() };
      this.scene.add(m); this.confetti.push(m);
    }
  }
  tickConfetti(dt) {
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const m = this.confetti[i], v = m.userData.v;
      m.userData.life -= dt; v.y -= 6 * dt; v.multiplyScalar(1 - 0.8 * dt);
      m.position.addScaledVector(v, dt); m.rotation.x += dt * 8; m.rotation.z += dt * 6;
      if (m.position.y < 0.02) { m.position.y = 0.02; v.set(0, 0, 0); }
      m.material.opacity = Math.min(1, m.userData.life);
      if (m.userData.life <= 0) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.confetti.splice(i, 1); }
    }
  }

  // ---------- bubbles, name plates, picking ----------
  screen(pos3) {
    const v = pos3.clone().project(this.camera);
    if (v.z > 1) return null;
    return { left: ((v.x + 1) / 2) * this.stage.clientWidth, top: ((1 - v.y) / 2) * this.stage.clientHeight };
  }
  // Where an agent's name plate goes, in stage pixels (above the head).
  headScreen(name) {
    const a = this.actors.get(name);
    if (!a) return null;
    return this.screen(new THREE.Vector3(a.pos[0], a.av.height + 0.18, a.pos[1]));
  }
  // Who is who for the figures that aren't agents (agents have the page's name plates).
  plateText(x) {
    const owner = this.actors.get(x.owner || (x.janitor && x.janitor.owner));
    const whose = owner ? owner.label || owner.name : '';
    return x.janitor ? 'Janitor' : `Helper${whose ? ` · ${whose}` : ''}`;
  }
  positionPlates() {
    for (const x of this.extras) {
      if (!x.owner && !x.janitor) continue;
      if (!x.plate) { x.plate = document.createElement('div'); x.plate.className = 'o3d-plate'; this.bubbles.append(x.plate); }
      const text = this.plateText(x);
      if (x.plate.textContent !== text) x.plate.textContent = text;
      const p = this.screen(new THREE.Vector3(x.pos[0], x.av.height * x.av.root.scale.y + 0.12, x.pos[1]));
      if (!p) { x.plate.style.display = 'none'; continue; }
      x.plate.style.display = '';
      x.plate.style.transform = `translate(${p.left}px, ${p.top}px) translate(-50%, -100%)`;
    }
  }
  positionBubbles(t) {
    this.positionPlates();
    for (const a of [...this.actors.values(), ...this.extras]) {
      const on = a.speech && a.speech.until > t;
      if (!on) { if (a.bubble) { a.bubble.remove(); a.bubble = null; } if (a.speech && a.speech.until <= t) a.speech = null; continue; }
      if (!a.bubble) { a.bubble = document.createElement('div'); a.bubble.className = 'o3d-bubble'; this.bubbles.append(a.bubble); }
      if (a.bubble.textContent !== a.speech.text) a.bubble.textContent = a.speech.text;
      const p = this.screen(new THREE.Vector3(a.pos[0], a.av.height + 0.75, a.pos[1]));
      if (!p) { a.bubble.style.display = 'none'; continue; }
      a.bubble.style.display = '';
      a.bubble.style.transform = `translate(${p.left}px, ${p.top}px) translate(-50%, -100%)`;
    }
  }
  bindPointer() {
    const el = this.gl.domElement;
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const roots = [...this.actors.values(), ...this.extras.filter((x) => x.owner)].map((a) => a.av.root);
      const hit = this.raycaster.intersectObjects(roots, true)[0];
      let o = hit && hit.object;
      while (o && !o.userData.actor) o = o.parent;
      return o ? o.userData.actor : null;
    };
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('click', (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // that was a drag
      const name = pick(e);
      if (name && this.hooks.onSelect) this.hooks.onSelect(name);
    });
    el.addEventListener('dblclick', (e) => {
      const name = pick(e);
      if (name) { this.follow = name; this.focus(name); } else { this.follow = null; this.overview(); }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const name = pick(e);
      el.style.cursor = name ? 'pointer' : '';
      if (this.hooks.onHover) this.hooks.onHover(name);
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.follow) { this.follow = null; this.overview(); } });
  }
  setQuality(q) { this.quality = q === 'low' || q === 'high' ? q : 'balanced'; this.sizeKey = ''; setAvatarOutlines(this.quality !== 'low'); }
}

let office = null;
function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
window.Floor3D = {
  supported: webglOk(),
  office: true,
  init(stage, hooks) { if (!office && this.supported) office = new Office(stage, hooks); return !!office; },
  setTheme: (theme, url) => (office ? office.setTheme(theme, url) : Promise.resolve(false)),
  setVisible: (on) => { if (office) office.box.hidden = !on; },
  render: (state) => (office ? office.render(state) : false),
  ratio: () => 0.62,
  headScreen: (name) => (office ? office.headScreen(name) : null),
  characterName: (name) => (office ? office.characterName(name) : ''),
  standup: (names) => (office ? office.startStandup(names) : false),
  preset: (name) => office && office.preset(name),
  focus: (name) => office && office.focus(name),
  setQuality: (q) => office && office.setQuality(q),
  get quality() { return office ? office.quality : ''; },
  _debug: () => office && [...office.actors.values(), ...office.extras].map((a) => ({ name: a.name, pos: a.pos.map((v) => +v.toFixed(2)), pose: a.pose, goal: a.goalKey, path: a.path ? a.path.length : null, mood: a.mood })),
};
window.dispatchEvent(new Event('floor3d-ready'));
