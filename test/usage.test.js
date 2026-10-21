'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../lib/usage');

const at = (iso) => iso; // timestamps are ISO strings in transcripts
const reply = (id, ts, usage) => JSON.stringify({ type: 'assistant', timestamp: at(ts), message: { id, usage } });

test('tally counts each reply once per message id, by local day', () => {
  const t = U.createTally();
  const u = { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 200 };
  // a reply split over two lines shares one id and one usage: count it once
  t.add([reply('m1', '2026-10-21T09:00:00', u), reply('m1', '2026-10-21T09:00:01', u), reply('m2', '2026-10-21T10:00:00', u)].join('\n'));
  const day = U.dayKey(Date.parse('2026-10-21T09:00:00'));
  assert.deepEqual(t.day(day), { input: 20, cacheRead: 2000, cacheWrite: 100, output: 400, total: 2520 });
});

test('tally keeps a half-written last line until the rest arrives', () => {
  const t = U.createTally();
  const line = reply('m1', '2026-10-21T09:00:00', { input_tokens: 1, output_tokens: 2 });
  t.add(line.slice(0, 20));
  assert.equal(t.day(U.dayKey(Date.parse('2026-10-21T09:00:00'))).total, 0);
  t.add(`${line.slice(20)}\n`);
  assert.equal(t.day(U.dayKey(Date.parse('2026-10-21T09:00:00'))).total, 3);
});

test('tally ignores user lines, junk and other days', () => {
  const t = U.createTally();
  t.add(['not json', JSON.stringify({ type: 'user', timestamp: '2026-10-21T09:00:00', message: { content: 'hi' } }),
    reply('m9', '2026-10-20T23:00:00', { output_tokens: 5 })].join('\n'));
  assert.equal(t.day(U.dayKey(Date.parse('2026-10-21T09:00:00'))).total, 0);
  assert.equal(t.day(U.dayKey(Date.parse('2026-10-20T23:00:00'))).output, 5);
});

test('sum adds several tallies for one day', () => {
  const a = { input: 1, cacheRead: 2, cacheWrite: 3, output: 4, total: 10 };
  assert.deepEqual(U.sum([a, a]), { input: 2, cacheRead: 4, cacheWrite: 6, output: 8, total: 20 });
});
