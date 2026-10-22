'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/worktrees');

test('parseList reads git worktree list --porcelain', () => {
  const text = [
    'worktree /r/app', 'HEAD aaa', 'branch refs/heads/main', '',
    'worktree /r/app.worktrees/feat-x', 'HEAD bbb', 'branch refs/heads/feat/x', '',
    'worktree /r/app.worktrees/detached', 'HEAD ccc', 'detached', '',
    'worktree /r/app.worktrees/old', 'HEAD ddd', 'branch refs/heads/old', 'locked', 'prunable gitdir file points to non-existent location', '',
  ].join('\n');
  assert.deepEqual(W.parseList(text), [
    { path: '/r/app', branch: 'main', main: true, locked: false, prunable: false },
    { path: '/r/app.worktrees/feat-x', branch: 'feat/x', main: false, locked: false, prunable: false },
    { path: '/r/app.worktrees/detached', branch: '', main: false, locked: false, prunable: false },
    { path: '/r/app.worktrees/old', branch: 'old', main: false, locked: true, prunable: true },
  ]);
  assert.deepEqual(W.parseList(''), []);
});

test('verdict: only merged, clean, unused, unlocked worktrees can go', () => {
  const ok = { main: false, locked: false, branch: 'feat/x', dirty: 0, merged: { pr: 5 }, agent: null };
  assert.deepEqual(W.verdict(ok), { canRemove: true, reason: '' });
  assert.equal(W.verdict({ ...ok, merged: { ancestor: true } }).canRemove, true);
  assert.match(W.verdict({ ...ok, main: true }).reason, /main checkout/);
  assert.match(W.verdict({ ...ok, locked: true }).reason, /locked/i);
  assert.match(W.verdict({ ...ok, agent: 'api' }).reason, /api/);
  assert.match(W.verdict({ ...ok, dirty: 3 }).reason, /3 uncommitted/);
  assert.match(W.verdict({ ...ok, merged: null }).reason, /not merged/i);
  assert.match(W.verdict({ ...ok, branch: '' }).reason, /no branch/);
});
