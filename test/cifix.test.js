'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../lib/cifix');

const pr = (state, runs = ['11'], number = 7) => ({ number, checks: { state, failedChecks: runs.map((r) => ({ name: `check ${r}`, runId: r })) } });

test('a new failure is sent once, the same failure is not sent again', () => {
  let d = F.decide(undefined, pr('fail'), 2);
  assert.equal(d.send, true); assert.deepEqual(d.rec, { pr: 7, attempts: 1, last: '11', gaveUp: false });
  d = F.decide(d.rec, pr('fail'), 2);
  assert.equal(d.send, false); assert.equal(d.rec.attempts, 1);
});

test('a later failing run is a new try, up to the limit, then it gives up once', () => {
  let d = F.decide(undefined, pr('fail', ['11']), 2);
  d = F.decide(d.rec, pr('pending', []), 2); assert.equal(d.send, false);
  d = F.decide(d.rec, pr('fail', ['12']), 2); assert.equal(d.send, true); assert.equal(d.rec.attempts, 2);
  d = F.decide(d.rec, pr('fail', ['13']), 2);
  assert.equal(d.send, false); assert.equal(d.gaveUp, true); assert.equal(d.rec.gaveUp, true);
  d = F.decide(d.rec, pr('fail', ['14']), 2);
  assert.equal(d.send, false); assert.equal(d.gaveUp, false); // only reported once
});

test('passing checks or another PR start the count again', () => {
  let d = F.decide({ pr: 7, attempts: 2, last: '12', gaveUp: true }, pr('pass', []), 2);
  assert.equal(d.rec, undefined);
  d = F.decide({ pr: 7, attempts: 2, last: '12', gaveUp: true }, pr('fail', ['20'], 8), 2);
  assert.equal(d.send, true); assert.equal(d.rec.attempts, 1); assert.equal(d.rec.pr, 8);
});

test('PR not known yet (just started, gh failed) keeps the count; checks without run ids are keyed by names', () => {
  const rec = { pr: 7, attempts: 1, last: '11', gaveUp: false };
  assert.deepEqual(F.decide(rec, null, 2), { send: false, gaveUp: false, rec });
  assert.deepEqual(F.decide(rec, { number: 7 }, 2), { send: false, gaveUp: false, rec });
  const d = F.decide(undefined, { number: 3, checks: { state: 'fail', failedChecks: [{ name: 'lint' }] } }, 2);
  assert.equal(d.send, true); assert.equal(d.rec.last, 'lint');
});
