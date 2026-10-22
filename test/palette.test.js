'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let score, rank;
test.before(async () => { ({ score, rank } = await import('../public/office/palette.js')); });

test('empty query keeps every item in its order', () => {
  const items = [{ label: 'Inbox' }, { label: 'Board' }];
  assert.deepEqual(rank('', items), items);
});

test('letters must appear in order', () => {
  assert.ok(score('inb', 'Open inbox') > 0);
  assert.equal(score('xyz', 'Open inbox'), 0);
  assert.equal(score('bni', 'Open inbox'), 0);
});

test('case is ignored', () => {
  assert.ok(score('INBOX', 'open inbox') > 0);
});

test('word starts and contiguous runs beat scattered letters', () => {
  assert.ok(score('bo', 'Task board') > score('bo', 'Turn sounds on or off'));
  assert.ok(score('st', 'Stop agent') > score('st', 'Task board'));
});

test('rank drops non-matches and puts the best first, keeping order on ties', () => {
  const items = [{ label: 'Settings' }, { label: 'Task board' }, { label: 'Go to backend' }, { label: 'Go to billing' }];
  assert.deepEqual(rank('b', items).map((x) => x.label), ['Task board', 'Go to backend', 'Go to billing']);
  assert.deepEqual(rank('back', items).map((x) => x.label), ['Go to backend']);
});

test('extra search words count, like folder names', () => {
  const items = [{ label: 'Go to alpha', keywords: 'api-server' }, { label: 'Go to beta', keywords: 'web' }];
  assert.deepEqual(rank('api', items).map((x) => x.label), ['Go to alpha']);
});
