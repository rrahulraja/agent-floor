'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/handoff');

test('newRule checks both agents and keeps the note', () => {
  const r = H.newRule({ from: 'api', to: 'web', note: 'Update the client for this', every: false }, 1000);
  assert.deepEqual({ ...r, id: 'x' }, { id: 'x', from: 'api', to: 'web', note: 'Update the client for this', every: false, createdAt: 1000, lastFiredAt: 0, done: false });
  assert.throws(() => H.newRule({ from: 'api', to: 'api' }), /itself/);
  assert.throws(() => H.newRule({ from: 'api', to: '' }), /Pick/);
});

test('fires once when the agent finishes after the rule was made, then is done', () => {
  const r = H.newRule({ from: 'api', to: 'web' }, 1000);
  assert.equal(H.fires(r, { name: 'api', finishedAt: 0 }), false);
  assert.equal(H.fires(r, { name: 'api', finishedAt: 900 }), false); // finished before the rule existed
  assert.equal(H.fires(r, { name: 'api', finishedAt: 2000 }), true);
  const after = H.afterFiring(r, 2000);
  assert.equal(after.done, true);
  assert.equal(H.fires(after, { name: 'api', finishedAt: 3000 }), false);
  const every = H.afterFiring({ ...r, every: true }, 2000);
  assert.equal(every.done, false);
  assert.equal(H.fires(every, { name: 'api', finishedAt: 2000 }), false); // same finish: not twice
  assert.equal(H.fires(every, { name: 'api', finishedAt: 3000 }), true);
});

test('promptFor passes the note and the finished reply along', () => {
  const p = H.promptFor({ note: 'Update the client for this' }, { label: 'api-server', cwd: '/code/api', lastReply: 'Added GET /v2/users with paging.' });
  assert.match(p, /^Update the client for this/);
  assert.match(p, /api-server \(api\) finished/);
  assert.match(p, /Added GET \/v2\/users with paging\./);
  assert.match(H.promptFor({ note: '' }, { label: 'api', cwd: '/x', lastReply: '' }), /no final message/);
});
