'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/control');

test('queue: add, move, remove, pause', () => {
  let all = {};
  let r = C.enqueue(all, 'a', 'first'); all = r.all; const first = r.item;
  r = C.enqueue(all, 'a', 'second'); all = r.all; const second = r.item;
  assert.deepEqual(C.queueOf(all, 'a').items.map((i) => i.text), ['first', 'second']);
  all = C.moveItem(all, 'a', second.id, -1);
  assert.deepEqual(C.queueOf(all, 'a').items.map((i) => i.text), ['second', 'first']);
  assert.equal(C.moveItem(all, 'a', second.id, -1), all); // already first
  all = C.dequeue(all, 'a', first.id);
  assert.deepEqual(C.queueOf(all, 'a').items.map((i) => i.text), ['second']);
  all = C.setPaused(all, 'a', true);
  assert.equal(C.queueOf(all, 'a').paused, true);
  assert.deepEqual(C.queueOf(all, 'nobody'), { paused: false, items: [] });
});

test('shouldDispatch only sends to a settled idle agent, once per idle stretch', () => {
  const queue = { paused: false, items: [{ id: 'x', text: 'go' }] };
  const base = { state: 'idle', question: null, proseMode: 'floor+pause', sessionUnknown: false, now: 6000, quietSince: 1000, idleSecs: 2, queue, lastDispatchAt: 0 };
  assert.equal(C.shouldDispatch(base), true);
  assert.equal(C.shouldDispatch({ ...base, now: 2000 }), false);
  assert.equal(C.shouldDispatch({ ...base, state: 'writing' }), false);
  assert.equal(C.shouldDispatch({ ...base, state: 'waiting' }), false);
  assert.equal(C.shouldDispatch({ ...base, state: 'asking', question: { kind: 'tool' } }), false);
  assert.equal(C.shouldDispatch({ ...base, state: 'asking', question: { kind: 'prose' } }), false);
  assert.equal(C.shouldDispatch({ ...base, state: 'asking', question: { kind: 'prose' }, proseMode: 'floor' }), true);
  assert.equal(C.shouldDispatch({ ...base, sessionUnknown: true }), false);
  assert.equal(C.shouldDispatch({ ...base, queue: { ...queue, paused: true } }), false);
  assert.equal(C.shouldDispatch({ ...base, lastDispatchAt: 2000, quietSince: 1000 }), false); // no reaction yet
  assert.equal(C.shouldDispatch({ ...base, lastDispatchAt: 2000, quietSince: 3000 }), true); // reacted, then quiet
});

test('saved prompts are cleaned and capped', () => {
  const p = C.cleanPrompts(['  a  ', '', { text: 'b' }, null, 'c'.repeat(5000)]);
  assert.deepEqual(p.map((x) => x.text.length), [1, 1, 4000]);
  assert.equal(C.cleanPrompts('nope').length, 0);
});

test('worktree path from the template', () => {
  assert.equal(C.worktreePathFor('{repoParent}/{repo}.worktrees/{branch}', '/code/shop', 'feat/x y'), '/code/shop.worktrees/feat-x-y');
  assert.equal(C.worktreePathFor('/tmp/wt/{repo}-{branch}', '/code/shop', 'fix/1'), '/tmp/wt/shop-fix-1');
  assert.equal(C.branchSlug('../../etc'), '..-..-etc');
});


test('paneSignals: approvals, busy, and the "trust this folder" screen', () => {
  const approve = 'Bash command\n  npm publish\nDo you want to proceed?\n❯ 1. Yes\n  2. No, and tell Claude what to do differently';
  assert.deepEqual(C.paneSignals(approve), { waiting: true, busy: false, trust: false });
  assert.equal(C.paneSignals('✻ Thinking… (12s · esc to interrupt)').busy, true);
  const trust = 'Accessing workspace:\n\n/Users/rrahul\n\nQuick safety check: Is this a project you created or one you trust?\n\n'
    + 'Security guide\n\n❯ No, exit\n  Yes, I trust this folder\n\nEnter to confirm · Esc to cancel';
  assert.deepEqual(C.paneSignals(trust), { waiting: true, busy: false, trust: true });
  assert.equal(C.paneSignals('> ready').waiting, false);
});

test('approvalText: what the permission prompt is about, without the box drawing', () => {
  const screen = [
    'some earlier output',
    '╭──────────────────────────────────────╮',
    '│ Bash command                         │',
    '│                                      │',
    '│   kubectl -n prod rollout restart deploy/api │',
    '│   Restart the API pods               │',
    '│                                      │',
    '│ Do you want to proceed?              │',
    '│ ❯ 1. Yes                             │',
    '│   2. No, and tell Claude what to do differently (esc) │',
    '╰──────────────────────────────────────╯',
  ].join('\n');
  assert.equal(C.approvalText(screen), 'Bash command\nkubectl -n prod rollout restart deploy/api\nRestart the API pods');
  assert.equal(C.approvalText('nothing to approve'), '');
});
