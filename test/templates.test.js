'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../lib/templates');

test('clean keeps the known fields, trims and caps them', () => {
  const t = T.clean({ title: '  Reviewer  ', cwd: ' ~/code/api ', worktree: 1, base: ' main ', firstPrompt: 'Review the open PR\r\n', extra: 'x' });
  assert.deepEqual(t, { title: 'Reviewer', cwd: '~/code/api', worktree: true, base: 'main', firstPrompt: 'Review the open PR\n' });
  assert.equal(T.clean({ title: 'x'.repeat(200), cwd: '/a' }).title.length, 60);
});

test('clean rejects a template without a title or folder', () => {
  assert.equal(T.clean({ cwd: '/a' }), null);
  assert.equal(T.clean({ title: 'A' }), null);
  assert.equal(T.clean(null), null);
});

test('base only counts with a worktree', () => {
  assert.deepEqual(T.clean({ title: 'A', cwd: '/a', base: 'dev' }), { title: 'A', cwd: '/a', worktree: false, base: '', firstPrompt: '' });
});

test('save adds a new template and replaces one with the same title', () => {
  let list = T.save([], { title: 'Reviewer', cwd: '/a' }, () => 'id1');
  assert.equal(list.length, 1); assert.equal(list[0].id, 'id1');
  list = T.save(list, { title: 'Fixer', cwd: '/b' }, () => 'id2');
  list = T.save(list, { title: 'reviewer', cwd: '/c' }, () => 'id3');
  assert.deepEqual(list.map((t) => [t.id, t.title, t.cwd]), [['id1', 'reviewer', '/c'], ['id2', 'Fixer', '/b']]);
});

test('remove drops by id', () => {
  const list = [{ id: 'a', title: 'A', cwd: '/a' }, { id: 'b', title: 'B', cwd: '/b' }];
  assert.deepEqual(T.remove(list, 'a').map((t) => t.id), ['b']);
});
