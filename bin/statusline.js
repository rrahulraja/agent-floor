#!/usr/bin/env node
'use strict';
// Status-line command for agents started by Agent Floor (passed with `claude --settings`).
// Saves the plan usage (5-hour session and weekly limits) for the dashboard, then prints a short status line.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { usageFrom, formatLine } = require('../lib/statusline');

const DATA_DIR = process.env.AGENT_FLOOR_DATA_DIR || path.join(os.homedir(), '.agent-floor');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  const usage = usageFrom(input);
  if (usage) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const file = path.join(DATA_DIR, 'usage.json');
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...usage, at: Date.now(), sessionId: input.session_id || '' }));
      fs.renameSync(tmp, file); // atomic: the dashboard never reads half a file
    } catch {}
  }
  process.stdout.write(formatLine(input));
});
