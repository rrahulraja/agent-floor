'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../lib/tasks');

test('newTask takes its title from the first line and starts in To do', () => {
  const t = K.newTask({ text: 'Add retries to the webhook sender\nUse exponential backoff, max 5.', cwd: '/code/api' }, 1000);
  assert.equal(t.title, 'Add retries to the webhook sender');
  assert.equal(t.status, 'todo');
  assert.equal(t.cwd, '/code/api');
  assert.match(t.id, /^[a-f0-9]{8}$/);
  assert.match(K.branchFor(t), /^task\/add-retries-to-the-webhook-[a-f0-9]{4}$/);
  assert.throws(() => K.newTask({ text: ' ', cwd: '/x' }), /Write/);
});

test('pickAgent: an idle running agent in the same project that has no other open task', () => {
  const agents = [
    { name: 'busy', state: 'writing', cwd: '/code/api' },
    { name: 'other', state: 'idle', cwd: '/code/web' },
    { name: 'taken', state: 'idle', cwd: '/code/api' },
    { name: 'free', state: 'idle', cwd: '/code/api' },
  ];
  const tasks = [{ id: 'a', agent: 'taken', status: 'working' }];
  assert.equal(K.pickAgent({ cwd: '/code/api' }, agents, tasks), 'free');
  assert.equal(K.pickAgent({ cwd: '/code/none' }, agents, tasks), '');
});

test('progress moves a task along from what its agent is doing', () => {
  const t = { id: 'a', status: 'working', agent: 'api', branch: 'task/x-1234' };
  const ag = (branch, pr) => ({ name: 'api', state: 'idle', git: { branch, pr } });
  assert.equal(K.progress(t, ag('task/x-1234', null)).status, 'working');
  const open = K.progress(t, ag('task/x-1234', { number: 9, url: 'https://github.com/o/r/pull/9', state: 'OPEN' }));
  assert.deepEqual([open.status, open.pr.number], ['review', 9]);
  assert.equal(K.progress(open, ag('task/x-1234', { number: 9, url: 'u', state: 'MERGED' })).status, 'merged');
  // a PR on some other branch is not this task's
  assert.equal(K.progress(t, ag('main', { number: 3, state: 'OPEN' })).status, 'working');
  // done is final; no agent: unchanged
  assert.equal(K.progress({ ...t, status: 'done' }, ag('task/x-1234', { number: 9, state: 'MERGED' })).status, 'done');
  assert.equal(K.progress(t, null), t);
});
