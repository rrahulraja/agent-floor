'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/helperlog');

const line = (o) => JSON.stringify({ timestamp: '2026-10-20T10:00:00Z', ...o });
test('parse reads the task, the steps in plain words, failures, and the final answer', () => {
  const text = [
    line({ type: 'user', message: { role: 'user', content: 'Fix the flaky login test' } }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking at the test.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/repo/test/login.test.js' } }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } }] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: '1 failed' }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: '/repo/src/login.js' } }, { type: 'tool_use', id: 't4', name: 'Grep', input: { pattern: 'retry', path: '/repo/src' } }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Fixed: the test waited on a timer.' }] } }),
    'not json',
  ].join('\n');
  const r = H.parse(text);
  assert.equal(r.task, 'Fix the flaky login test');
  assert.deepEqual(r.events.map((e) => [e.kind, e.text]), [
    ['say', 'Looking at the test.'], ['read', 'login.test.js'], ['command', 'npm test'], ['edit', 'login.js'], ['search', 'retry in src'], ['say', 'Fixed: the test waited on a timer.'],
  ]);
  assert.equal(r.events[2].failed, true);
  assert.equal(r.events[2].note, 'Run tests');
  assert.equal(r.reply, 'Fixed: the test waited on a timer.');
  assert.ok(r.lastAt > 0);
});
test('parse keeps only the newest events', () => {
  const many = Array.from({ length: 100 }, (_, i) => line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: `/f${i}` } }] } })).join('\n');
  const r = H.parse(many, 10);
  assert.equal(r.events.length, 10);
  assert.equal(r.events[9].text, 'f99');
});
