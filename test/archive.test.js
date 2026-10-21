'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/archive');

test('add keeps what is needed to bring an agent back, newest first, one entry per name and folder', () => {
  const agent = { name: 'api', label: 'API server', cwd: '/code/api', sessionId: 's2', sessions: ['s1', 's2'], hero: 'writing', contextWindow: 200000 };
  let list = A.add([], agent, 1000);
  assert.deepEqual(list, [{ name: 'api', label: 'API server', cwd: '/code/api', sessionId: 's2', sessions: ['s1', 's2'], removedAt: 1000 }]);
  list = A.add(list, { name: 'web', cwd: '/code/web', sessionId: 'w1' }, 2000);
  list = A.add(list, { ...agent, sessionId: 's3', sessions: ['s3'] }, 3000); // removed again later: replaces the old entry
  assert.deepEqual(list.map((x) => [x.name, x.sessionId]), [['api', 's3'], ['web', 'w1']]);
  assert.equal(A.add(Array.from({ length: 250 }, (_, i) => ({ name: `a${i}`, cwd: '/x' })), agent, 1).length, 200);
});

test('freeName picks the old name when free, otherwise adds a number', () => {
  assert.equal(A.freeName('api', []), 'api');
  assert.equal(A.freeName('api', ['api', 'api-2']), 'api-3');
});

test('drop removes an entry by name and folder', () => {
  const list = [{ name: 'api', cwd: '/a' }, { name: 'api', cwd: '/b' }];
  assert.deepEqual(A.drop(list, 'api', '/a'), [{ name: 'api', cwd: '/b' }]);
});
