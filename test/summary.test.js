'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/summary');

test('build: needs you, failing checks, stuck, tasks, yesterday and tokens, in plain lines', () => {
  const agents = [
    { name: 'api', label: 'api-server', state: 'waiting', detail: 'Needs your approval' },
    { name: 'web', label: 'web-ui', state: 'idle', git: { pr: { number: 7, checks: { state: 'fail', failedChecks: [{ name: 'CI / unit' }] } } } },
    { name: 'ops', label: 'ops', state: 'writing', stuck: { minutes: 25 } },
    { name: 'off', label: 'off', state: 'stopped' },
  ];
  const tasks = [{ status: 'todo' }, { status: 'working' }, { status: 'review' }, { status: 'review' }, { status: 'done' }];
  const yesterday = { projects: [{ name: 'tiny-platform', prs: [{ number: 12 }], pushes: [{}, {}] }, { name: 'web', prs: [], pushes: [{}] }] };
  const s = S.build({ agents, tasks, yesterday, tokens: { total: 41_000_000, output: 380_000 }, plan: { fiveHour: { pct: 12 }, sevenDay: { pct: 33 } } });
  assert.equal(s.title, 'Agent Floor: 1 needs you, 1 PR failing');
  assert.deepEqual(s.lines, [
    'Needs you: api-server (Needs your approval)',
    'PR checks failing: web-ui PR #7 (CI / unit)',
    'May be stuck: ops (25 min)',
    'Running: 3 agents (1 stopped)',
    'Tasks: 1 to do, 1 working, 2 in review',
    'Yesterday: 1 PR, 3 pushes across 2 projects',
    'Tokens today: 41.0M (380k written) · plan: session 12%, week 33%',
  ]);
});

test('build: a quiet morning says so', () => {
  const s = S.build({ agents: [{ name: 'a', label: 'a', state: 'idle' }], tasks: [], yesterday: { projects: [] }, tokens: null, plan: null });
  assert.equal(s.title, 'Agent Floor: all quiet');
  assert.deepEqual(s.lines, ['Running: 1 agent']);
});

test('due: once a day, at or after the set time', () => {
  const at = (h, m) => new Date(2026, 9, 22, h, m).getTime();
  assert.equal(S.due('08:30', at(8, 29), 0), false);
  assert.equal(S.due('08:30', at(8, 31), 0), true);
  assert.equal(S.due('08:30', at(9, 0), at(8, 31)), false); // already sent today
  assert.equal(S.due('', at(9, 0), 0), false); // off
});
