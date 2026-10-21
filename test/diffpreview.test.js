'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/diffpreview');

const use = (id, name, input) => ({ type: 'assistant', timestamp: '2026-10-21T10:00:00Z', message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id) => ({ type: 'user', timestamp: '2026-10-21T10:00:01Z', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });

test('pendingTool: the last tool call that has no result yet', () => {
  const entries = [use('t1', 'Read', { file_path: '/a' }), result('t1'), use('t2', 'Edit', { file_path: '/a', old_string: 'x', new_string: 'y' })];
  assert.equal(D.pendingTool(entries).id, 't2');
  assert.equal(D.pendingTool([use('t1', 'Read', {}), result('t1')]), null);
});

test('lineDiff marks kept, removed and added lines', () => {
  assert.deepEqual(D.lineDiff(['a', 'b', 'c'], ['a', 'B', 'c', 'd']).map((l) => l.t + l.s), [' a', '-b', '+B', ' c', '+d']);
});

test('preview of an Edit: located in the file, with line numbers and context', () => {
  const file = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].join('\n');
  const p = D.preview({ name: 'Edit', input: { file_path: '/repo/x.txt', old_string: 'four\nfive', new_string: 'FOUR\nfive' } }, () => file);
  assert.equal(p.file, '/repo/x.txt');
  assert.equal(p.kind, 'edit');
  const lines = p.hunks[0].lines.map((l) => `${l.t}${l.n || ''}:${l.s}`);
  assert.deepEqual(lines, [' 1:one', ' 2:two', ' 3:three', '-4:four', '+4:FOUR', ' 5:five', ' 6:six', ' 7:seven', ' 8:eight']);
  assert.deepEqual([p.added, p.removed], [1, 1]);
});

test('preview of a Write: a new file is all added; an existing one is diffed', () => {
  const fresh = D.preview({ name: 'Write', input: { file_path: '/repo/new.js', content: 'a\nb' } }, () => null);
  assert.equal(fresh.kind, 'new');
  assert.deepEqual(fresh.hunks[0].lines.map((l) => l.t + l.s), ['+a', '+b']);
  const changed = D.preview({ name: 'Write', input: { file_path: '/repo/x.js', content: 'a\nB\nc' } }, () => 'a\nb\nc');
  assert.deepEqual([changed.kind, changed.added, changed.removed], ['write', 1, 1]);
});

test('preview of a MultiEdit shows each edit; other tools have no preview', () => {
  const file = 'alpha\nbeta\ngamma';
  const p = D.preview({ name: 'MultiEdit', input: { file_path: '/r/f', edits: [{ old_string: 'alpha', new_string: 'ALPHA' }, { old_string: 'gamma', new_string: 'GAMMA' }] } }, () => file);
  assert.equal(p.hunks.length, 2);
  assert.equal(D.preview({ name: 'Bash', input: { command: 'ls' } }, () => ''), null);
});
