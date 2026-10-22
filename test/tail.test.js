'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTail, wanted } = require('../lib/tail');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tail-'));
const line = (o) => JSON.stringify(o) + '\n';
const msg = (i) => line({ parentUuid: null, type: 'user', message: { content: `prompt ${i}` } });
const blob = (kb) => line({ type: 'api-request-blob', data: 'x'.repeat(kb * 1024) });
const attach = (kb) => line({ parentUuid: null, isSidechain: false, attachment: { type: 'hook', data: 'y'.repeat(kb * 1024) }, type: 'attachment' });
const statOf = (f) => { const st = fs.statSync(f); return { path: f, mtimeMs: st.mtimeMs, size: st.size }; };

test('wanted skips the big request copies and attachments', () => {
  assert.equal(wanted(blob(1)), false);
  assert.equal(wanted(line({ type: 'api-request-shape' })), false);
  assert.equal(wanted(attach(1)), false);
  assert.equal(wanted(msg(1)), true);
  assert.equal(wanted(line({ type: 'system', content: 'mentions "attachment":{ later' })), true);
});

test('a message far behind large blobs is still found', async () => {
  const f = path.join(dir, 'big.jsonl');
  fs.writeFileSync(f, msg(1) + blob(500) + attach(300) + blob(200));
  const tail = createTail();
  const e = await tail(statOf(f));
  assert.deepEqual(e.map((x) => x.message.content), ['prompt 1']);
});

test('appended lines are read incrementally, a half-written line waits for its end', async () => {
  const f = path.join(dir, 'grow.jsonl');
  fs.writeFileSync(f, msg(1));
  const tail = createTail();
  assert.equal((await tail(statOf(f))).length, 1);
  const half = msg(2);
  fs.appendFileSync(f, blob(50) + half.slice(0, 10));
  assert.equal((await tail(statOf(f))).length, 1);
  fs.appendFileSync(f, half.slice(10) + msg(3));
  assert.deepEqual((await tail(statOf(f))).map((x) => x.message.content), ['prompt 1', 'prompt 2', 'prompt 3']);
});

test('keeps only the last `keep` entries, and starts over when the file shrinks', async () => {
  const f = path.join(dir, 'many.jsonl');
  fs.writeFileSync(f, Array.from({ length: 20 }, (_, i) => msg(i)).join(''));
  const tail = createTail({ keep: 5 });
  assert.deepEqual((await tail(statOf(f))).map((x) => x.message.content), ['prompt 15', 'prompt 16', 'prompt 17', 'prompt 18', 'prompt 19']);
  fs.writeFileSync(f, msg('new'));
  assert.deepEqual((await tail(statOf(f))).map((x) => x.message.content), ['prompt new']);
});
