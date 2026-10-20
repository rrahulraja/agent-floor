'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createConfig } = require('../lib/config');
const G = require('../lib/git');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'af-config-')), 'config.json');

test('config: defaults when the file is missing, and only changes are saved', () => {
  const file = tmpFile();
  const c = createConfig(file);
  assert.equal(c.get('stuckMinutes'), 10);
  assert.equal(c.get('proseQuestion'), 'floor+pause');
  assert.deepEqual(c.set({ stuckMinutes: '15', 'celebrate.pr': false }), { ok: true });
  assert.equal(c.get('stuckMinutes'), 15);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { 'celebrate.pr': false, stuckMinutes: 15 });
  assert.deepEqual(c.set({ stuckMinutes: null }), { ok: true });
  assert.equal(c.get('stuckMinutes'), 10);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { 'celebrate.pr': false });
});

test('config: invalid values are rejected on set and fall back on load', () => {
  const file = tmpFile();
  const c = createConfig(file);
  const r = c.set({ stuckMinutes: 0, proseQuestion: 'loud', nope: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.stuckMinutes && r.errors.proseQuestion && r.errors.nope);
  assert.equal(c.get('stuckMinutes'), 10);
  fs.writeFileSync(file, JSON.stringify({ contextWarnPct: 'lots', desksPerRow: 6 }));
  const logs = [];
  const c2 = createConfig(file, { log: (m) => logs.push(m) });
  assert.equal(c2.get('contextWarnPct'), 80);
  assert.equal(c2.get('desksPerRow'), 6);
  assert.ok(c2.problems().contextWarnPct);
  assert.equal(logs.length, 1);
  fs.writeFileSync(file, '{not json');
  assert.equal(createConfig(file).get('desksPerRow'), 4);
});

test('git: porcelain v2 status', () => {
  const s = G.parseStatus('# branch.oid abc\n# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b src/a.js\n? new.txt\n');
  assert.deepEqual(s, { branch: 'feat/x', upstream: 'origin/feat/x', ahead: 2, behind: 1, dirty: 2 });
  assert.equal(G.parseStatus('# branch.head (detached)\n').branch, 'detached HEAD');
});

test('git: PR checks rollup', () => {
  assert.equal(G.summarizeChecks([]).state, 'none');
  assert.equal(G.summarizeChecks([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }]).state, 'pass');
  assert.equal(G.summarizeChecks([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'SUCCESS' }]).state, 'pending');
  const f = G.summarizeChecks([{ status: 'COMPLETED', conclusion: 'FAILURE' }, { status: 'QUEUED' }]);
  assert.deepEqual(f, { state: 'fail', passed: 0, failed: 1, pending: 1, total: 2 });
  const pr = G.parsePr({ number: 7, url: 'https://github.com/a/b/pull/7', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] });
  assert.equal(pr.checks.state, 'pass');
  assert.equal(pr.review, 'APPROVED');
  assert.equal(G.parsePr({}), null);
});
