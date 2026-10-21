'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let N;
test.before(async () => { N = await import('../public/office/nav.js'); });

// Office-sized floor: 32m x 14m at 0.25m -> 128 x 56 cells.
const floor = () => N.createNav({ minX: -16, minZ: -7, maxX: 16, maxZ: 7 });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Every leg of a returned path must be walkable in a straight line.
function assertWalkable(nav, from, path) {
  let prev = nav.isFree(from[0], from[1]) ? from : path[0];
  for (const p of path) {
    assert.ok(nav.isFree(p[0], p[1]), `waypoint ${p} is blocked`);
    assert.ok(nav.lineOfSight(prev[0], prev[1], p[0], p[1]), `leg ${prev} -> ${p} crosses a blocker`);
    prev = p;
  }
}

test('grid dimensions', () => {
  const nav = N.createNav({ minX: 0, minZ: 0, maxX: 32.4, maxZ: 13.7 });
  assert.deepEqual(nav.cells, { cols: 130, rows: 55, cell: 0.25 });
});

test('open space: straight path is just the goal', () => {
  const nav = floor();
  const path = nav.findPath([-10, 0], [10, 1]);
  assert.deepEqual(path, [[10, 1]]);
});

test('routes around a wall through its gap', () => {
  const nav = floor();
  // Wall at x=0 across the whole floor except a 1.5m gap near z=5.
  nav.blockRect(0, -1.5, 0.2, 11);  // z -7 .. 4
  nav.blockRect(0, 6.5, 0.2, 1);    // z 6 .. 7
  assert.equal(nav.isFree(0, 0), false);
  assert.equal(nav.isFree(0, 5), true);
  const path = nav.findPath([-5, 0], [5, 0]);
  assert.ok(path && path.length >= 2);
  assertWalkable(nav, [-5, 0], path);
  assert.ok(path.some(([x, z]) => Math.abs(x) < 0.6 && z > 4 && z < 6), 'passes through the gap');
  const last = path[path.length - 1];
  assert.ok(near(last[0], 5) && near(last[1], 0), 'ends exactly at goal');
});

test('rotated rect blocks along its rotated extent', () => {
  const nav = floor();
  // 6m x 0.3m bar rotated 90deg about Y: now runs along z.
  nav.blockRect(0, 0, 6, 0.3, Math.PI / 2);
  assert.equal(nav.isFree(0, 2.5), false);
  assert.equal(nav.isFree(2.5, 0), true);
  // 45deg bar: blocks along the diagonal, not the axis.
  const nav2 = floor();
  nav2.blockRect(0, 0, 6, 0.3, Math.PI / 4);
  assert.equal(nav2.isFree(1.5, -1.5), false); // rotY +45 maps local +x to (cos, -sin)
  assert.equal(nav2.isFree(1.5, 1.5), true);
  assert.equal(nav2.isFree(2.5, 0), true);
  // Pad grows the footprint.
  const nav3 = floor();
  nav3.blockRect(0, 0, 1, 1, 0, 0.5);
  assert.equal(nav3.isFree(0.9, 0), false);
  assert.equal(nav3.isFree(1.2, 0), true);
});

test('circle blocks a disc', () => {
  const nav = floor();
  nav.blockCircle(3, 3, 1);
  assert.equal(nav.isFree(3, 3), false);
  assert.equal(nav.isFree(3.8, 3), false);
  assert.equal(nav.isFree(4.5, 3), true);
  assert.equal(nav.isFree(3.8, 3.8), true);
  nav.clear();
  assert.equal(nav.isFree(3, 3), true);
});

test('start and goal inside blockers snap out to free cells', () => {
  const nav = floor();
  nav.blockRect(-5, 0, 2, 2);
  nav.blockRect(5, 0, 2, 2);
  const snapped = nav.nearestFree(-5, 0);
  assert.ok(nav.isFree(snapped[0], snapped[1]));
  assert.ok(Math.hypot(snapped[0] + 5, snapped[1]) < 1.3);
  const path = nav.findPath([-5, 0], [5, 0]);
  assert.ok(path && path.length >= 2);
  assertWalkable(nav, [-5, 0], path);
  assert.ok(Math.hypot(path[0][0] + 5, path[0][1]) < 1.3, 'first waypoint is the snapped start');
  const last = path[path.length - 1];
  assert.ok(nav.isFree(last[0], last[1]));
  assert.ok(Math.hypot(last[0] - 5, last[1]) < 1.3, 'ends next to the blocked goal');
});

test('unreachable goal returns null', () => {
  const nav = floor();
  // Sealed box around (8, 0).
  nav.blockRect(8, -2, 4, 0.3);
  nav.blockRect(8, 2, 4, 0.3);
  nav.blockRect(6, 0, 0.3, 4);
  nav.blockRect(10, 0, 0.3, 4);
  assert.equal(nav.isFree(8, 0), true);
  assert.equal(nav.findPath([-8, 0], [8, 0]), null);
});

test('no diagonal corner cutting', () => {
  // 4x4 grid of 1m cells; two blocks touching only at a corner.
  const nav = N.createNav({ minX: 0, minZ: 0, maxX: 4, maxZ: 4, cell: 1 });
  nav.blockRect(1.5, 2.5, 1, 1); // cell (1,2)
  nav.blockRect(2.5, 1.5, 1, 1); // cell (2,1)
  assert.equal(nav.isFree(0.5, 0.5), true);
  assert.equal(nav.isFree(1.5, 1.5), true);
  assert.equal(nav.isFree(2.5, 2.5), true);
  assert.equal(nav.lineOfSight(1.5, 1.5, 2.5, 2.5), false);
  const path = nav.findPath([1.5, 1.5], [2.5, 2.5]);
  assert.ok(path, 'reachable the long way round');
  assertWalkable(nav, [1.5, 1.5], path);
  assert.ok(path.length >= 3, 'did not squeeze through the corner');
});

test('smoothing reduces waypoints and keeps endpoints', () => {
  const nav = floor();
  const raw = [];
  for (let x = -10; x <= 10; x += 0.25) raw.push([x, Math.sin(x) * 0.1]);
  const s = N.smoothPath(nav, raw);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], raw[0]);
  assert.deepEqual(s[1], raw[raw.length - 1]);
  // Around an obstacle it keeps the corners it needs.
  nav.blockRect(0, 0, 0.5, 6);
  const path = nav.findPath([-4, 0], [4, 0]);
  assert.ok(path.length >= 2 && path.length <= 4, `got ${path.length} waypoints`);
  assertWalkable(nav, [-4, 0], path);
});

test('performance: 100 random paths on a 130x55 grid with 40 blockers', () => {
  const nav = N.createNav({ minX: 0, minZ: 0, maxX: 32.5, maxZ: 13.75 });
  assert.deepEqual([nav.cells.cols, nav.cells.rows], [130, 55]);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) {
    if (i % 2) nav.blockRect(rnd() * 32, rnd() * 13.75, 0.5 + rnd() * 2.5, 0.5 + rnd() * 1.5, rnd() * Math.PI, 0.2);
    else nav.blockCircle(rnd() * 32, rnd() * 13.75, 0.3 + rnd() * 0.6);
  }
  let found = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) {
    const from = [rnd() * 32.5, rnd() * 13.75];
    const path = nav.findPath(from, [rnd() * 32.5, rnd() * 13.75]);
    if (path) { found++; assertWalkable(nav, from, path); }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(found > 50, `only ${found} paths found`);
  assert.ok(ms < 1500, `took ${ms.toFixed(0)}ms`);
});

test('crowd: neighbours within radius, nearest first, excluding self', () => {
  const crowd = N.createCrowd(0.6);
  crowd.update([
    { id: 'a', x: 0, z: 0 },
    { id: 'b', x: 0.5, z: 0 },
    { id: 'c', x: -1.2, z: 0.1 },
    { id: 'd', x: 3, z: 3 },
    { id: 'e', x: -0.3, z: -0.4 },
  ]);
  const ns = crowd.neighbours('a', 1.5);
  assert.deepEqual(ns.map((n) => n.id), ['e', 'b', 'c']);
  assert.ok(near(ns[0].d, 0.5, 1e-9));
  assert.deepEqual(crowd.neighbours('d', 1), []);
  assert.deepEqual(crowd.neighbours('nobody', 5), []);
  crowd.update([{ id: 'a', x: 0, z: 0 }, { id: 'd', x: 0.2, z: 0 }]);
  assert.deepEqual(crowd.neighbours('a', 1).map((n) => n.id), ['d']);
});
