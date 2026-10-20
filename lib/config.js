'use strict';
// Settings: every threshold and behaviour choice lives here with its default.
// ~/.agent-floor/config.json stores only what the user changed (flat "dotted" keys).

const fs = require('fs');
const path = require('path');

const SCHEMA = [
  { key: 'theme', group: 'Appearance', label: 'Theme', type: 'enum', values: ['pixel'], default: 'pixel' },
  { key: 'desksPerRow', group: 'Appearance', label: 'Desks per row', type: 'int', min: 2, max: 8, default: 4 },

  { key: 'contextWindow', group: 'Context window', label: 'Window for models the floor does not recognise (tokens)', type: 'int', min: 10000, max: 10000000, default: 1000000,
    help: 'Known models are sized automatically (1M for Opus/Sonnet 4.6+ and Fable, 200k for Haiku and older)' },
  { key: 'contextWarnPct', group: 'Context window', label: 'Amber at (% used)', type: 'int', min: 1, max: 100, default: 80 },
  { key: 'contextAlertPct', group: 'Context window', label: 'Red at (% used)', type: 'int', min: 1, max: 100, default: 90 },

  { key: 'stuckMinutes', group: 'Health', label: 'Mark as stuck after (minutes without change)', type: 'int', min: 1, max: 240, default: 10 },
  { key: 'loopingFailures', group: 'Health', label: 'Mark as looping after (same command failing in a row)', type: 'int', min: 2, max: 20, default: 3 },

  { key: 'proseQuestion', group: 'Questions', label: 'A reply ending in "?"', type: 'enum', values: ['off', 'floor', 'floor+pause', 'full'], default: 'floor+pause',
    help: 'off: ignore · floor: raised hand only · floor+pause: also counts as "needs you" and pauses the queue · full: also sends alerts' },

  { key: 'helperActiveSeconds', group: 'Helpers (subagents)', label: 'Counts as working if written in the last (seconds)', type: 'int', min: 2, max: 600, default: 10 },
  { key: 'maxHelpersShown', group: 'Helpers (subagents)', label: 'Helpers shown beside a desk', type: 'int', min: 0, max: 6, default: 3 },

  { key: 'celebrate.push', group: 'Celebrations', label: 'Celebrate a git push', type: 'bool', default: true },
  { key: 'celebrate.pr', group: 'Celebrations', label: 'Celebrate a new pull request', type: 'bool', default: true },
  { key: 'celebrate.seconds', group: 'Celebrations', label: 'Celebration length (seconds)', type: 'int', min: 1, max: 30, default: 5 },

  { key: 'pollMs', group: 'Refresh', label: 'Agent status refresh (ms)', type: 'int', min: 250, max: 10000, default: 1000 },
  { key: 'gitPollMs', group: 'Refresh', label: 'Git status refresh (ms)', type: 'int', min: 2000, max: 600000, default: 15000 },
  { key: 'ghPollMs', group: 'Refresh', label: 'Pull request refresh (ms)', type: 'int', min: 10000, max: 3600000, default: 60000 },
];
const BY_KEY = new Map(SCHEMA.map((s) => [s.key, s]));

function coerce(spec, value) {
  if (value === null || value === undefined || value === '') return { ok: false, error: 'is empty' };
  if (spec.type === 'int') {
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'must be a whole number' };
    if (n < spec.min || n > spec.max) return { ok: false, error: `must be between ${spec.min} and ${spec.max}` };
    return { ok: true, value: n };
  }
  if (spec.type === 'bool') {
    if (typeof value === 'boolean') return { ok: true, value };
    if (value === 'true' || value === 'false') return { ok: true, value: value === 'true' };
    return { ok: false, error: 'must be true or false' };
  }
  if (spec.type === 'enum') {
    return spec.values.includes(value) ? { ok: true, value } : { ok: false, error: `must be one of ${spec.values.join(', ')}` };
  }
  return { ok: false, error: 'unknown type' };
}

function createConfig(file, { log = () => {} } = {}) {
  let stored = {};
  const values = {};
  const problems = {};

  function rebuild() {
    for (const k of Object.keys(problems)) delete problems[k];
    for (const s of SCHEMA) {
      values[s.key] = s.default;
      if (!(s.key in stored)) continue;
      const c = coerce(s, stored[s.key]);
      if (c.ok) values[s.key] = c.value;
      else { problems[s.key] = `${s.label} ${c.error}; using ${s.default}`; log(`config: ${s.key} ${c.error}; using default ${s.default}`); }
    }
  }

  function load() {
    try { stored = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; }
    catch (e) { if (e.code !== 'ENOENT') log(`config: could not read ${file} (${e.message}); using defaults`); stored = {}; }
    if (typeof stored !== 'object' || Array.isArray(stored)) stored = {};
    rebuild();
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const out = {};
    for (const s of SCHEMA) if (s.key in stored && values[s.key] !== s.default) out[s.key] = values[s.key];
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    stored = out;
  }

  // patch: { key: value | null }. null resets to the default. Returns per-key errors; nothing is saved if any.
  function set(patch) {
    const errors = {};
    const next = { ...stored };
    for (const [k, v] of Object.entries(patch || {})) {
      const spec = BY_KEY.get(k);
      if (!spec) { errors[k] = 'unknown setting'; continue; }
      if (v === null) { delete next[k]; continue; }
      const c = coerce(spec, v);
      if (c.ok) next[k] = c.value; else errors[k] = `${spec.label} ${c.error}`;
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    stored = next;
    rebuild();
    save();
    return { ok: true };
  }

  load();
  return {
    get: (k) => values[k],
    all: () => ({ ...values }),
    problems: () => ({ ...problems }),
    schema: () => SCHEMA.map((s) => ({ ...s })),
    set, load,
  };
}

module.exports = { createConfig, SCHEMA, coerce };
