'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../lib/notify');

const base = { name: 'billing', label: 'Billing', cwd: '/code/tiny-platform', state: 'writing', since: 1 };

test('detectEvents: approval, questions, finished, stuck, push and PR', () => {
  assert.deepEqual(N.detectEvents(null, { ...base, state: 'waiting' }), []);
  const appr = N.detectEvents(base, { ...base, state: 'waiting', since: 5, detail: 'Needs your approval' });
  assert.equal(appr.length, 1);
  assert.equal(appr[0].event, 'approval');
  assert.equal(appr[0].title, 'Billing (tiny-platform) needs your approval');

  const q = N.detectEvents(base, { ...base, state: 'asking', since: 6, question: { kind: 'tool', questions: [{ question: 'Which DB should I use for the new table?' }] } }, { detailChars: 20 });
  assert.equal(q[0].event, 'question');
  assert.equal(q[0].detail, 'Which DB should I u…');

  const prose = { ...base, state: 'asking', since: 7, question: { kind: 'prose', text: 'Ship it?' } };
  assert.equal(N.detectEvents(base, prose, { proseMode: 'floor+pause' }).length, 0);
  assert.equal(N.detectEvents(base, prose, { proseMode: 'full' })[0].title, 'Billing (tiny-platform) may have a question');

  const fin = N.detectEvents(base, { ...base, state: 'idle', finishedAt: 99, lastReply: 'All done.' });
  assert.equal(fin[0].event, 'finished');

  const stuck = N.detectEvents(base, { ...base, stuck: { minutes: 12 } });
  assert.equal(stuck[0].detail, 'No change for 12 minutes while working');

  const cel = N.detectEvents({ ...base, celebrations: [{ id: 'push:1' }] }, { ...base, celebrations: [{ id: 'push:1', kind: 'push', branch: 'a' }, { id: 'pr:x', kind: 'pr', number: 42, repo: 'acme/shop', url: 'https://github.com/acme/shop/pull/42' }] });
  assert.deepEqual(cel.map((e) => [e.event, e.title, e.url]), [['pr', 'Billing (tiny-platform) opened PR #42', 'https://github.com/acme/shop/pull/42']]);
});

test('deduper drops repeats within the window', () => {
  const d = N.createDeduper(1000);
  assert.equal(d('k', 0), true);
  assert.equal(d('k', 500), false);
  assert.equal(d('k', 1600), true);
});

test('senders: desktop command, Slack and ntfy payloads', () => {
  const [cmd, args] = N.desktopCommand('darwin', 'T "quoted"', 'D');
  assert.equal(cmd, 'osascript');
  assert.deepEqual(args.slice(-2), ['T "quoted"', 'D']);
  assert.equal(N.desktopCommand('win32', 't', 'd'), null);
  const [, withSound] = N.desktopCommand('darwin', 'T', 'D', 'Glass');
  assert.ok(withSound.some((x) => x.includes('sound name (item 3 of argv)')));
  assert.equal(withSound[withSound.length - 1], 'Glass');
  const [, silent] = N.desktopCommand('darwin', 'T', 'D', 'none');
  assert.ok(!silent.some((x) => x.includes('sound name')));
  const msg = { event: 'pr', title: 'X opened PR #1', detail: 'acme/shop', url: 'https://github.com/acme/shop/pull/1' };
  assert.equal(N.slackPayload(msg).text, '*X opened PR #1*\nacme/shop\n<https://github.com/acme/shop/pull/1>');
  const r = N.ntfyRequest({ server: 'https://ntfy.example/', topic: 'abc', token: 'tk' }, msg);
  assert.equal(r.url, 'https://ntfy.example');
  assert.equal(r.init.headers.Authorization, 'Bearer tk');
  assert.deepEqual(JSON.parse(r.init.body), { topic: 'abc', title: 'X opened PR #1', message: 'acme/shop', tags: ['tada'], click: 'https://github.com/acme/shop/pull/1' });
});

test('detectEvents: PR checks turning red', () => {
  const pr = (state) => ({ git: { pr: { number: 7, url: 'https://github.com/o/r/pull/7', checks: { state, failedChecks: [{ name: 'CI / unit tests' }] } } } });
  const ev = N.detectEvents({ ...base, ...pr('pending') }, { ...base, ...pr('fail') });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].event, 'checks');
  assert.match(ev[0].title, /PR #7 checks failed/);
  assert.match(ev[0].detail, /CI \/ unit tests/);
  assert.deepEqual(N.detectEvents({ ...base, ...pr('fail') }, { ...base, ...pr('fail') }), []);
});
