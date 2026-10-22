'use strict';
// The last entries of a growing transcript (.jsonl), read cheaply. Claude Code also writes very large lines
// the dashboard never uses (copies of each API request, hook and file attachments): they are skipped without
// parsing, and a first read looks further back until it has enough useful entries. After that only the bytes
// appended since the last read are read.

const fsp = require('fs/promises');

const NL = 0x0a;
// Not needed by anything here: copies of API requests, and attachments (hook output, file contents).
function wanted(line) {
  if (line.startsWith('{"type":"api-request')) return false;
  return !/^\{"parentUuid":(?:null|"[^"]*"),"isSidechain":(?:true|false),"attachment":\{/.test(line.slice(0, 200));
}
function parse(buf) {
  const out = [];
  for (const l of buf.toString('utf8').split('\n')) {
    if (!l.trim() || !wanted(l)) continue;
    try { out.push(JSON.parse(l)); } catch {}
  }
  return out;
}
async function readRange(fh, from, to) {
  const buf = Buffer.alloc(to - from);
  await fh.read(buf, 0, buf.length, from);
  return buf;
}

function createTail({ keep = 300, first = 384 * 1024, max = 16 * 1024 * 1024 } = {}) {
  const cache = new Map(); // path -> { mtimeMs, size, offset: bytes read up to the last complete line, entries }
  return async function tail(file) {
    const c = cache.get(file.path);
    if (c && c.mtimeMs === file.mtimeMs && c.size === file.size) return c.entries;
    const fh = await fsp.open(file.path, 'r');
    try {
      let entries, offset;
      if (c && file.size >= c.size && file.size - c.offset <= max) {
        // appended since last time
        const buf = await readRange(fh, c.offset, file.size);
        const end = buf.lastIndexOf(NL) + 1; // a half-written last line waits for the next read
        entries = c.entries.concat(parse(buf.subarray(0, end))).slice(-keep);
        offset = c.offset + end;
      } else {
        for (let len = Math.min(file.size, first); ; len = Math.min(file.size, len * 4)) {
          const start = file.size - len, buf = await readRange(fh, start, file.size);
          const begin = start > 0 ? buf.indexOf(NL) + 1 : 0; // skip the partial first line
          const end = buf.lastIndexOf(NL) + 1;
          entries = end > begin ? parse(buf.subarray(begin, end)).slice(-keep) : [];
          offset = start + Math.max(end, begin);
          if (entries.length >= keep || start === 0 || len >= max) break;
        }
      }
      cache.set(file.path, { mtimeMs: file.mtimeMs, size: file.size, offset, entries });
      return entries;
    } finally { await fh.close(); }
  };
}

module.exports = { createTail, wanted };
