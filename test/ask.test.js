'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/history');

const ts = (s) => new Date(Date.UTC(2026, 9, 22, 10, 0, s)).toISOString();
const user = (s, text) => ({ type: 'user', timestamp: ts(s), message: { content: text } });
const said = (s, text, stop = 'end_turn') => ({ type: 'assistant', timestamp: ts(s), message: { stop_reason: stop, content: [{ type: 'text', text }] } });
const tool = (s) => ({ type: 'assistant', timestamp: ts(s), message: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'Read', input: {} }] } });
const result = (s) => ({ type: 'user', timestamp: ts(s), message: { content: [{ type: 'tool_result', content: 'ok' }] } });
const Q = 'Which files are you editing?';
const since = Date.parse(ts(5));

test('not asked yet: the question is not in the conversation after it was sent', () => {
  assert.deepEqual(H.answerTo([user(1, Q), said(2, 'old answer')], Q, since), { status: 'waiting', reply: '' });
});

test('answering, then answered with the full final reply', () => {
  const e = [user(1, 'earlier'), said(2, 'x'), user(6, Q), said(7, 'Let me check.', 'tool_use'), tool(7), result(8)];
  assert.deepEqual(H.answerTo(e, Q, since), { status: 'answering', reply: 'Let me check.' });
  const long = 'billing/refund.js and billing/api.js. '.repeat(30).trim();
  e.push(said(9, long));
  assert.deepEqual(H.answerTo(e, Q, since), { status: 'answered', reply: long });
});

test('only the reply to this question, not to later instructions', () => {
  const e = [user(6, Q), said(7, 'refund.js'), user(9, 'now run the tests'), said(10, 'tests pass')];
  assert.deepEqual(H.answerTo(e, Q, since), { status: 'answered', reply: 'refund.js' });
});

test('whitespace differences in the question still match', () => {
  assert.equal(H.answerTo([user(6, `  ${Q}\n`), said(7, 'a')], Q, since).status, 'answered');
});
