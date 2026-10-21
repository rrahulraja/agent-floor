'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/permissions');

test('validRule accepts tool rules and rejects junk', () => {
  for (const r of ['Bash(npm test:*)', 'Read', 'WebFetch(domain:github.com)', 'Edit(src/**)', 'mcp__github__get_issue']) assert.equal(P.validRule(r), true, r);
  assert.equal(P.validRule(`Bash(psql -c "select (1)")`), true); // saved commands have brackets of their own
  for (const r of ['', 'Bash(npm test', 'bad rule', 'Bash(a)\nBash(b)', 'x'.repeat(5000)]) assert.equal(P.validRule(r), false, r);
});

test('warnings flag allows that are broad enough to run anything or rewrite history', () => {
  const w = P.warnings({ allow: ['Bash(git status:*)', 'Bash(git push:*)', 'Bash(python3:*)', 'Bash', 'Bash(rm:*)'], ask: [], deny: [] });
  const flagged = w.map((x) => x.rule);
  assert.deepEqual(flagged, ['Bash(git push:*)', 'Bash(python3:*)', 'Bash', 'Bash(rm:*)']);
  // a guardrail in "ask" covers the push one
  const w2 = P.warnings({ allow: ['Bash(git push:*)'], ask: ['Bash(git push --force:*)', 'Bash(git push -f:*)'], deny: [] });
  assert.deepEqual(w2.map((x) => x.rule), []);
});

test('withRules writes the lists and keeps every other setting', () => {
  const before = { model: 'opus', env: { A: '1' }, permissions: { allow: ['Read'], defaultMode: 'acceptEdits', additionalDirectories: ['/x'] } };
  const after = P.withRules(before, { allow: ['Read', 'Bash(npm test:*)', 'Bash(npm test:*)'], ask: ['Bash(git push --force:*)'], deny: [] });
  assert.deepEqual(after, {
    model: 'opus', env: { A: '1' },
    permissions: { allow: ['Read', 'Bash(npm test:*)'], ask: ['Bash(git push --force:*)'], defaultMode: 'acceptEdits', additionalDirectories: ['/x'] },
  });
  assert.throws(() => P.withRules({}, { allow: ['not a rule!'], ask: [], deny: [] }), /not a rule/);
});

test('presets and guardrails are valid rules', () => {
  for (const g of [...P.PRESETS, P.GUARDRAILS]) for (const r of g.rules) assert.equal(P.validRule(r), true, r);
  assert.ok(P.GUARDRAILS.rules.includes('Bash(git push --force:*)'));
});

test('warnings flag rules that carry a password or token', () => {
  const w = P.warnings({ allow: ["Bash(PGPASSWORD='hunter2x' psql -h db -U u:*)", 'Bash(curl -H "Authorization: Bearer abcdefghijklmnop" x)', 'Bash(git status:*)'], ask: [], deny: [] });
  assert.equal(w.filter((x) => x.secret).length, 2);
});
