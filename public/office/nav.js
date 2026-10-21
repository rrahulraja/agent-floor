// Grid A* navigation for walking agents on the 3D office floor.
//
// Pure ES module: no Three.js, no DOM, so node tests can load it directly.
// World space is the floor plane (x, z); the grid covers [minX, maxX] x [minZ, maxZ].
//
// Ideas ported from Hermes3D's retro-office navigation (MIT, (c) 2026 Luke The Dev):
// binary-heap A* over a Uint8Array grid, 8-way moves with the no-corner-cutting rule,
// ring-search snapping of blocked start/goal cells, and the spatial-hash bucketing used
// for agent separation (core/navigation.ts, systems/NavigationSystem.tsx).

const SQRT2 = Math.SQRT2;
const MAX_EXPANSIONS = 20000;
const EPS = 1e-9;

// 8 neighbours: dc, dr, cost. Orthogonals first so ties prefer straight moves.
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

export function createNav({ minX, minZ, maxX, maxZ, cell = 0.25 }) {
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell - EPS));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell - EPS));
  const n = cols * rows;
  const blocked = new Uint8Array(n);

  // Search scratch, reused across calls. `seen` stamps make a reset O(1)
  // instead of refilling 7k-cell arrays on every one of ~30 plans a second.
  const g = new Float64Array(n);
  const parent = new Int32Array(n);
  const seen = new Uint32Array(n);
  const closed = new Uint32Array(n);
  let stamp = 0;
  let heapIdx = new Int32Array(1024);
  let heapF = new Float64Array(1024);
  let heapLen = 0;

  const colOf = (x) => Math.floor((x - minX) / cell);
  const rowOf = (z) => Math.floor((z - minZ) / cell);
  const cx = (c) => minX + (c + 0.5) * cell;
  const cz = (r) => minZ + (r + 0.5) * cell;
  const inGrid = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows;
  // Off-grid counts as blocked so paths and sight lines never leave the floor.
  const solid = (c, r) => !inGrid(c, r) || blocked[r * cols + c] === 1;

  function blockRect(x, z, w, d, rotY = 0, pad = 0) {
    const hx = w / 2 + pad;
    const hz = d / 2 + pad;
    // Local axes after a Three.js rotation about +Y: u = local x, v = local z.
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const ux = cos, uz = -sin;
    const vx = sin, vz = cos;
    const ex = hx * Math.abs(cos) + hz * Math.abs(sin);
    const ez = hx * Math.abs(sin) + hz * Math.abs(cos);
    const h = cell / 2;
    const cellR = h * (Math.abs(ux) + Math.abs(uz)); // cell half-extent on u (and v, by symmetry)
    const c0 = Math.max(0, colOf(x - ex)), c1 = Math.min(cols - 1, colOf(x + ex));
    const r0 = Math.max(0, rowOf(z - ez)), r1 = Math.min(rows - 1, rowOf(z + ez));
    // Separating-axis test against each cell square: a cell is blocked when the
    // rect overlaps it at all, so walls thinner than a cell still seal.
    for (let r = r0; r <= r1; r++) {
      const dz = cz(r) - z;
      if (Math.abs(dz) >= h + ez - EPS) continue;
      for (let c = c0; c <= c1; c++) {
        const dx = cx(c) - x;
        if (Math.abs(dx) >= h + ex - EPS) continue;
        if (Math.abs(dx * ux + dz * uz) >= hx + cellR - EPS) continue;
        if (Math.abs(dx * vx + dz * vz) >= hz + cellR - EPS) continue;
        blocked[r * cols + c] = 1;
      }
    }
  }

  function blockCircle(x, z, r) {
    const h = cell / 2;
    const c0 = Math.max(0, colOf(x - r)), c1 = Math.min(cols - 1, colOf(x + r));
    const r0 = Math.max(0, rowOf(z - r)), r1 = Math.min(rows - 1, rowOf(z + r));
    for (let row = r0; row <= r1; row++) {
      const dz = Math.max(0, Math.abs(cz(row) - z) - h);
      for (let c = c0; c <= c1; c++) {
        const dx = Math.max(0, Math.abs(cx(c) - x) - h);
        if (dx * dx + dz * dz < r * r - EPS) blocked[row * cols + c] = 1;
      }
    }
  }

  function clear() { blocked.fill(0); }

  function isFree(x, z) { return !solid(colOf(x), rowOf(z)); }

  // Closest free cell index to (x, z), searching rings outward. A ring's cells
  // aren't distance-ordered, so scan one ring past the first hit before settling.
  function nearestFreeIdx(x, z) {
    const c = Math.min(cols - 1, Math.max(0, colOf(x)));
    const r = Math.min(rows - 1, Math.max(0, rowOf(z)));
    if (!blocked[r * cols + c] && inGrid(colOf(x), rowOf(z))) return r * cols + c;
    let best = -1, bestD = Infinity, stopAt = Infinity;
    const maxK = Math.max(cols, rows);
    for (let k = 0; k <= maxK && k <= stopAt; k++) {
      for (let dr = -k; dr <= k; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        const edge = Math.abs(dr) === k;
        for (let dc = -k; dc <= k; dc += edge ? 1 : 2 * k || 1) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols || blocked[rr * cols + cc]) continue;
          const ddx = cx(cc) - x, ddz = cz(rr) - z;
          const d = ddx * ddx + ddz * ddz;
          if (d < bestD) { bestD = d; best = rr * cols + cc; }
        }
      }
      if (best >= 0 && stopAt === Infinity) stopAt = k + 1;
    }
    return best;
  }

  function nearestFree(x, z) {
    const i = nearestFreeIdx(x, z);
    return i < 0 ? null : [cx(i % cols), cz((i / cols) | 0)];
  }

  function heapPush(i, f) {
    if (heapLen === heapIdx.length) {
      const ni = new Int32Array(heapLen * 2); ni.set(heapIdx); heapIdx = ni;
      const nf = new Float64Array(heapLen * 2); nf.set(heapF); heapF = nf;
    }
    let k = heapLen++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= f) break;
      heapIdx[k] = heapIdx[p]; heapF[k] = heapF[p];
      k = p;
    }
    heapIdx[k] = i; heapF[k] = f;
  }

  function heapPop() {
    const top = heapIdx[0];
    const li = heapIdx[--heapLen], lf = heapF[heapLen];
    let k = 0;
    for (;;) {
      let m = 2 * k + 1;
      if (m >= heapLen) break;
      if (m + 1 < heapLen && heapF[m + 1] < heapF[m]) m++;
      if (heapF[m] >= lf) break;
      heapIdx[k] = heapIdx[m]; heapF[k] = heapF[m];
      k = m;
    }
    heapIdx[k] = li; heapF[k] = lf;
    return top;
  }

  // Raw A* over cells; returns cell indices start..goal, or null.
  function astar(s, t) {
    if (++stamp === 0xffffffff) { seen.fill(0); closed.fill(0); stamp = 1; }
    const tc = t % cols, tr = (t / cols) | 0;
    // Octile distance, nudged up a hair so ties break toward the goal (fewer expansions).
    const hOf = (c, r) => {
      const dx = Math.abs(c - tc), dz = Math.abs(r - tr);
      return ((dx + dz) + (SQRT2 - 2) * Math.min(dx, dz)) * 1.0001;
    };
    heapLen = 0;
    g[s] = 0; parent[s] = -1; seen[s] = stamp;
    heapPush(s, hOf(s % cols, (s / cols) | 0));
    let expansions = 0;
    while (heapLen > 0) {
      const cur = heapPop();
      if (closed[cur] === stamp) continue; // stale heap entry
      closed[cur] = stamp;
      if (cur === t) {
        const out = [];
        for (let i = cur; i !== -1; i = parent[i]) out.push(i);
        return out.reverse();
      }
      if (++expansions > MAX_EXPANSIONS) return null;
      const c = cur % cols, r = (cur / cols) | 0;
      for (let k = 0; k < 8; k++) {
        const dc = DIRS[k][0], dr = DIRS[k][1];
        const nc = c + dc, nr = r + dr;
        if (solid(nc, nr)) continue;
        // No corner cutting: a diagonal needs both orthogonal neighbours open.
        if (dc && dr && (solid(c + dc, r) || solid(c, r + dr))) continue;
        const ni = nr * cols + nc;
        if (closed[ni] === stamp) continue;
        const ng = g[cur] + DIRS[k][2];
        if (seen[ni] === stamp && ng >= g[ni]) continue;
        seen[ni] = stamp; g[ni] = ng; parent[ni] = cur;
        heapPush(ni, ng + hOf(nc, nr));
      }
    }
    return null;
  }

  // Supercover walk (Amanatides-Woo) over every cell the segment touches.
  // Passing exactly through a grid corner checks both side cells, matching
  // the no-corner-cutting rule A* uses.
  function lineOfSight(ax, az, bx, bz) {
    const gx0 = (ax - minX) / cell, gz0 = (az - minZ) / cell;
    const gx1 = (bx - minX) / cell, gz1 = (bz - minZ) / cell;
    let c = Math.floor(gx0), r = Math.floor(gz0);
    const dx = gx1 - gx0, dz = gz1 - gz0;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = sx ? Math.abs(1 / dx) : Infinity;
    const tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tmx = sx > 0 ? (c + 1 - gx0) * tdx : sx < 0 ? (gx0 - c) * tdx : Infinity;
    let tmz = sz > 0 ? (r + 1 - gz0) * tdz : sz < 0 ? (gz0 - r) * tdz : Infinity;
    for (let guard = cols + rows + 4; guard > 0; guard--) {
      if (solid(c, r)) return false;
      // t runs 0..1 along the segment; no boundary left to cross before the end.
      if (Math.min(tmx, tmz) >= 1 - 1e-9) return true;
      if (tmx < tmz - 1e-9) { c += sx; tmx += tdx; }
      else if (tmz < tmx - 1e-9) { r += sz; tmz += tdz; }
      else {
        if (solid(c + sx, r) || solid(c, r + sz)) return false;
        c += sx; r += sz; tmx += tdx; tmz += tdz;
      }
    }
    return false;
  }

  function findPath(from, to) {
    const s = nearestFreeIdx(from[0], from[1]);
    const t = nearestFreeIdx(to[0], to[1]);
    if (s < 0 || t < 0) return null;
    const startFree = isFree(from[0], from[1]);
    const goal = isFree(to[0], to[1]) ? [to[0], to[1]] : [cx(t % cols), cz((t / cols) | 0)];
    const startPt = startFree ? [from[0], from[1]] : [cx(s % cols), cz((s / cols) | 0)];
    if (s === t) return startFree ? [goal] : [startPt, goal];
    const cells = astar(s, t);
    if (!cells) return null;
    const pts = [startPt];
    for (let i = 1; i < cells.length - 1; i++) pts.push([cx(cells[i] % cols), cz((cells[i] / cols) | 0)]);
    pts.push(goal);
    const out = smoothPath(api, pts);
    // The agent already stands at a free start; only keep it when we snapped out of a blocker.
    if (startFree) out.shift();
    return out;
  }

  const api = {
    blockRect, blockCircle, clear, isFree, nearestFree, findPath, lineOfSight,
    cells: { cols, rows, cell },
  };
  return api;
}

// String-pulling: from each anchor, jump to the furthest point still in sight.
export function smoothPath(nav, pts) {
  if (!pts || pts.length < 3) return pts ? pts.slice() : pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !nav.lineOfSight(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// Spatial-hash neighbour lookup for local avoidance (after Hermes3D's collision buckets).
export function createCrowd(cell = 0.6) {
  let buckets = new Map();
  let byId = new Map();
  const key = (c, r) => (c + 32768) * 65536 + (r + 32768);

  function update(list) {
    buckets = new Map();
    byId = new Map();
    for (const a of list) {
      byId.set(a.id, a);
      const k = key(Math.floor(a.x / cell), Math.floor(a.z / cell));
      const b = buckets.get(k);
      if (b) b.push(a); else buckets.set(k, [a]);
    }
  }

  function neighbours(id, radius) {
    const me = byId.get(id);
    if (!me) return [];
    const span = Math.ceil(radius / cell);
    const c0 = Math.floor(me.x / cell), r0 = Math.floor(me.z / cell);
    const out = [];
    for (let dr = -span; dr <= span; dr++) {
      for (let dc = -span; dc <= span; dc++) {
        const b = buckets.get(key(c0 + dc, r0 + dr));
        if (!b) continue;
        for (const a of b) {
          if (a.id === id) continue;
          const d = Math.hypot(a.x - me.x, a.z - me.z);
          if (d <= radius) out.push({ id: a.id, x: a.x, z: a.z, d });
        }
      }
    }
    return out.sort((p, q) => p.d - q.d);
  }

  return { update, neighbours };
}
