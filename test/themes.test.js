'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Th = require('../lib/themes');

const good = { id: 'office', name: 'Office', kind: 'vector', room: { desk: 'desk.svg' }, roles: { default: 'p.svg', writing: 'w.svg' }, celebration: { pr: 'pr.svg' } };
const all = () => true;

test('safeFile blocks traversal and unknown extensions', () => {
  assert.equal(Th.safeFile('chars/w.svg'), true);
  assert.equal(Th.safeFile('../x.svg'), false);
  assert.equal(Th.safeFile('/etc/x.svg'), false);
  assert.equal(Th.safeFile('a/../b.svg'), false);
  assert.equal(Th.safeFile('x.html'), false);
  assert.equal(Th.safeFile('x.js'), false);
  assert.equal(Th.safeFile('.hidden.svg'), false);
});

test('validateManifest accepts a good theme and reports problems', () => {
  const r = Th.validateManifest(good, all);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.theme.size.sit, 30);
  const bad = Th.validateManifest({ ...good, id: 'Bad Id', kind: 'pixel', roles: { writing: 'w.svg', dancing: 'd.svg' }, room: { desk: '../d.svg' } }, (f) => f !== 'w.svg');
  assert.equal(bad.ok, false);
  const text = bad.problems.join(' | ');
  for (const frag of ['id must be', 'kind must be', 'roles.default is required', 'roles.dancing', 'room.desk', 'roles.writing: w.svg not found']) assert.ok(text.includes(frag), frag);
  assert.equal(Th.validateManifest({ ...good, id: 'pixel' }, all).ok, false);
});

test('listThemes reads folders, checks files, and keeps the first id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-themes-'));
  const mk = (base, dir, manifest, files) => {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
    fs.writeFileSync(path.join(base, dir, 'theme.json'), JSON.stringify(manifest));
    for (const f of files) fs.writeFileSync(path.join(base, dir, f), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  };
  const builtin = path.join(root, 'builtin'), user = path.join(root, 'user');
  mk(builtin, 'office', good, ['desk.svg', 'p.svg', 'w.svg', 'pr.svg']);
  mk(user, 'office', { ...good, name: 'Imposter' }, ['desk.svg', 'p.svg', 'w.svg', 'pr.svg']);
  mk(user, 'mine', { ...good, id: 'mine', name: 'Mine' }, ['desk.svg', 'p.svg']);
  fs.writeFileSync(path.join(user, 'NOTES.md'), 'not a theme');
  const list = Th.listThemes([{ dir: builtin, builtin: true }, { dir: user }]);
  assert.deepEqual(list.map((t) => [t.theme.id, t.theme.name, t.builtin, t.ok]), [['office', 'Office', true, true], ['mine', 'Mine', false, false]]);
  assert.ok(list[1].problems.some((p) => p.includes('w.svg not found')));
});
