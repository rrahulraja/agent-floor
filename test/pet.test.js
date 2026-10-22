'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let P;
test.before(async () => { P = await import('../public/office/pet.js'); });

const bed = [5, 5];
const wander = { pos: [1, 1], key: 'wander:1' };
const ag = (name, state, since = 0, pos = [0, 0]) => ({ name, state, since, pos });

test('goes to whoever has waited longest for you, and is alert there', () => {
  const g = P.petGoal({ agents: [ag('a', 'writing'), ag('b', 'waiting', 50, [2, 3]), ag('c', 'asking', 20, [4, 3])], night: false, bed, wander });
  assert.equal(g.mode, 'alert'); assert.equal(g.key, 'visit:c');
  assert.deepEqual(g.pos, [4 + 0.35, 3 - 0.45]);
});

test('cheers someone who just finished', () => {
  const g = P.petGoal({ agents: [ag('a', 'writing'), ag('d', 'done', 0, [1, 2])], night: false, bed, wander });
  assert.equal(g.mode, 'happy'); assert.equal(g.key, 'visit:d');
});

test('sleeps at night, or when nobody is working', () => {
  assert.equal(P.petGoal({ agents: [ag('a', 'writing')], night: true, bed, wander }).mode, 'sleep');
  assert.equal(P.petGoal({ agents: [ag('a', 'idle'), ag('b', 'stopped')], night: false, bed, wander }).mode, 'sleep');
  assert.equal(P.petGoal({ agents: [], night: false, bed, wander }).key, 'bed');
});

test('someone needing you wakes it even at night', () => {
  assert.equal(P.petGoal({ agents: [ag('a', 'waiting', 0, [1, 1])], night: true, bed, wander }).mode, 'alert');
});

test('otherwise it wanders', () => {
  const g = P.petGoal({ agents: [ag('a', 'writing')], night: false, bed, wander });
  assert.deepEqual(g, { mode: 'idle', pos: [1, 1], key: 'wander:1' });
});

test('agents not placed on the floor yet are ignored', () => {
  assert.equal(P.petGoal({ agents: [{ name: 'x', state: 'waiting', since: 0, pos: null }, ag('a', 'writing')], night: false, bed, wander }).mode, 'idle');
});
