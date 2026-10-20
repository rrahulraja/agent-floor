'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../lib/statusline');

const payload = {
  session_id: 's1', model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, context_window: { used_percentage: 16.4 },
  rate_limits: { five_hour: { used_percentage: 34.2, resets_at: 1792500000 }, seven_day: { used_percentage: 61, resets_at: 1792900000 } },
};

test('usageFrom reads the 5-hour and weekly limits', () => {
  assert.deepEqual(S.usageFrom(payload), { fiveHour: { pct: 34, resetsAt: 1792500000000 }, sevenDay: { pct: 61, resetsAt: 1792900000000 } });
  assert.equal(S.usageFrom({}), null);
  assert.equal(S.usageFrom({ rate_limits: {} }), null);
});

test('formatLine is short and skips what is missing', () => {
  assert.equal(S.formatLine(payload), 'Opus 5.5 · ctx 16% · 5h 34% · wk 61%');
  assert.equal(S.formatLine({ model: { id: 'claude-sonnet-5-5' } }), 'sonnet-5-5');
});

test('bin/statusline.js saves usage and prints the line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-usage-'));
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'statusline.js')], { input: JSON.stringify(payload), env: { ...process.env, AGENT_FLOOR_DATA_DIR: dir } }).toString();
  assert.equal(out, 'Opus 5.5 · ctx 16% · 5h 34% · wk 61%');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8'));
  assert.equal(saved.fiveHour.pct, 34);
  assert.equal(saved.sessionId, 's1');
  assert.equal(execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'statusline.js')], { input: 'not json', env: { ...process.env, AGENT_FLOOR_DATA_DIR: dir } }).toString(), '');
});
