'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/history');

const ts = (s) => new Date(Date.UTC(2026, 9, 20, 10, 0, s)).toISOString();
const user = (text, s, extra = {}) => ({ type: 'user', timestamp: ts(s), cwd: '/code/shop', sessionId: 's1', message: { role: 'user', content: text }, ...extra });
const tool = (id, name, input, s) => ({ type: 'assistant', timestamp: ts(s), cwd: '/code/shop', sessionId: 's1', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, text, isError, s) => ({ type: 'user', timestamp: ts(s), cwd: '/code/shop', sessionId: 's1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } });
const reply = (text, s) => ({ type: 'assistant', timestamp: ts(s), cwd: '/code/shop', sessionId: 's1', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });

const entries = [
  user('fix the refund bug', 1),
  tool('e1', 'Edit', { file_path: '/code/shop/refund.js', new_string: 'const fblIdentifier = 1' }, 2),
  tool('e2', 'Edit', { file_path: '/code/shop/refund.js', new_string: 'x' }, 3),
  tool('t1', 'Bash', { command: 'mvn test' }, 4),
  result('t1', 'Tests run: 3, Failures: 0, Errors: 0, Skipped: 0\nBUILD SUCCESS', false, 5),
  tool('p1', 'Bash', { command: 'git push -u origin fix/refund' }, 6),
  result('p1', 'To github.com:acme/shop.git\n * [new branch]      fix/refund -> fix/refund', false, 7),
  { type: 'pr-link', prNumber: 9, prUrl: 'https://github.com/acme/shop/pull/9', prRepository: 'acme/shop', timestamp: ts(8), sessionId: 's1' },
  reply('Fixed and opened PR #9.', 9),
  user('now update the docs', 20),
  tool('h1', 'Task', { description: 'Find doc pages about refunds' }, 21),
];

test('timelineFrom groups work into turns, newest first', () => {
  const tl = H.timelineFrom(entries);
  assert.equal(tl.length, 2);
  assert.equal(tl[0].prompt, 'now update the docs');
  assert.deepEqual(tl[0].events.map((e) => e.type), ['helper']);
  const first = tl[1];
  assert.equal(first.prompt, 'fix the refund bug');
  assert.deepEqual(first.events.map((e) => e.type), ['edit', 'command', 'push', 'pr']);
  assert.equal(first.events[0].count, 2);
  assert.equal(first.events[1].kind, 'tests');
  assert.equal(first.events[1].outcome, 'pass');
  assert.equal(first.events[2].branch, 'fix/refund');
  assert.equal(first.reply, 'Fixed and opened PR #9.');
  assert.equal(H.timelineFrom(entries, Date.parse(ts(15))).length, 1); // only the second turn is in the window
});

test('digest counts a day of work per project', () => {
  const acc = new Map();
  const ctx = { from: Date.parse(ts(0)), to: Date.parse(ts(30)), uses: new Map(), cwd: '' };
  for (const e of entries) H.digestAdd(acc, e, ctx);
  const [p] = H.digestResult(acc);
  assert.equal(p.name, 'shop');
  assert.deepEqual(p.prompts, ['fix the refund bug', 'now update the docs']);
  assert.equal(p.files, 1);
  assert.deepEqual(p.tests, { pass: 1, fail: 0 });
  assert.equal(p.prs[0].number, 9);
  assert.equal(p.pushes[0].branch, 'fix/refund');
  assert.equal(p.sessions, 1);
  const none = new Map();
  for (const e of entries) H.digestAdd(none, e, { from: Date.parse(ts(100)), to: Date.parse(ts(200)), uses: new Map() });
  assert.equal(H.digestResult(none).length, 0);
});

test('searchEntry finds prompts, replies, commands and edits', () => {
  assert.equal(H.searchEntry(entries[0], 'refund').role, 'you');
  assert.match(H.searchEntry(entries[1], 'fblidentifier').snippet, /fblIdentifier/);
  assert.equal(H.searchEntry(entries[3], 'mvn').role, 'command');
  assert.equal(H.searchEntry(entries[8], 'pr #9').role, 'claude');
  assert.equal(H.searchEntry(entries[0], 'nothing-like-this'), null);
});

test('terminalText: the conversation drawn like Claude Code prints it', () => {
  const ts = '2026-10-21T10:00:00Z';
  const entries = [
    { type: 'user', timestamp: ts, message: { content: 'Run the tests and fix failures' } },
    { type: 'assistant', timestamp: ts, message: { content: [{ type: 'text', text: 'Running them now.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }] } },
    { type: 'user', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'line 1\nline 2\nline 3\nline 4\nline 5' }] } },
    { type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/repo/src/a.js' } }] } },
    { type: 'user', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'old_string not found' }] } },
    { type: 'assistant', timestamp: ts, message: { content: [{ type: 'text', text: 'All green now.' }] } },
  ];
  const plain = H.terminalText(entries).replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(plain, [
    '> Run the tests and fix failures', '',
    '● Running them now.', '',
    '● Bash(npm test)', '  ⎿  line 1', '     line 2', '     line 3', '     … +2 lines', '',
    '● Edit(src/a.js)', '  ⎿  old_string not found', '',
    '● All green now.', '',
  ].join('\n'));
});

test('replayEvents: what the agent was doing, step by step, inside a time window', () => {
  const at = (m) => `2026-10-21T10:${String(m).padStart(2, '0')}:00Z`;
  const entries = [
    { type: 'user', timestamp: at(0), message: { content: 'Fix the flaky test' } },
    { type: 'assistant', timestamp: at(1), message: { content: [{ type: 'tool_use', id: 'a', name: 'Read', input: { file_path: '/r/test/a.test.js' } }] } },
    { type: 'assistant', timestamp: at(3), message: { content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'npm test' } }] } },
    { type: 'assistant', timestamp: at(6), message: { content: [{ type: 'text', text: 'Fixed: the test waited on a timer.' }] } },
    { type: 'assistant', timestamp: at(7), isSidechain: true, message: { content: [{ type: 'tool_use', id: 'c', name: 'Bash', input: { command: 'ls' } }] } },
  ];
  const ev = H.replayEvents(entries, Date.parse(at(0)), Date.parse(at(59)));
  assert.deepEqual(ev.map((e) => [e.state, e.text]), [
    ['planning', 'You: Fix the flaky test'],
    ['reading', 'Read a.test.js'],
    ['tests', '$ npm test'],
    ['idle', 'Fixed: the test waited on a timer.'],
  ]);
  assert.equal(H.replayEvents(entries, Date.parse(at(2)), Date.parse(at(4))).length, 1);
});
