'use strict';
// Settings: every threshold and behaviour choice lives here with its default.
// ~/.agent-floor/config.json stores only what the user changed (flat "dotted" keys).

const fs = require('fs');
const path = require('path');

const SCHEMA = [
  { key: 'theme', group: 'Appearance', label: 'Theme (also in the header)', type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,39}$', maxLength: 40, default: 'pixel' },
  { key: 'desksPerRow', group: 'Appearance', label: 'Desks per row', type: 'int', min: 2, max: 8, default: 4 },

  { key: 'contextWindow', group: 'Context window', label: 'Window for models the floor does not recognise (tokens)', type: 'int', min: 10000, max: 10000000, default: 1000000,
    help: 'Known models are sized automatically (1M for Opus/Sonnet 4.6+ and Fable, 200k for Haiku and older)' },
  { key: 'contextWarnPct', group: 'Context window', label: 'Amber at (% used)', type: 'int', min: 1, max: 100, default: 80 },
  { key: 'contextAlertPct', group: 'Context window', label: 'Red at (% used)', type: 'int', min: 1, max: 100, default: 90 },

  { key: 'stuckMinutes', group: 'Health', label: 'Mark as stuck after (minutes without change)', type: 'int', min: 1, max: 240, default: 10 },
  { key: 'loopingFailures', group: 'Health', label: 'Mark as looping after (same command failing in a row)', type: 'int', min: 2, max: 20, default: 3 },

  { key: 'proseQuestion', group: 'Questions', label: 'A reply ending in "?"', type: 'enum', values: ['off', 'floor', 'floor+pause', 'full'], default: 'floor+pause',
    help: 'off: ignore · floor: raised hand only · floor+pause: also counts as "needs you" and pauses the queue · full: also sends alerts' },

  { key: 'queueIdleSeconds', group: 'Queue and prompts', label: 'Send the next queued instruction after the agent is idle for (seconds)', type: 'int', min: 1, max: 600, default: 2 },
  { key: 'savedPromptClick', group: 'Queue and prompts', label: 'Clicking a saved prompt', type: 'enum', values: ['insert', 'send'], default: 'insert',
    help: 'insert: put it in the instruction box (Shift+click sends) · send: send it (Shift+click inserts)' },
  { key: 'worktreePath', group: 'Worktrees', label: 'Where new worktrees go', type: 'string', maxLength: 300, default: '{repoParent}/{repo}.worktrees/{branch}',
    help: 'Placeholders: {repoParent}, {repo}, {branch}' },

  { key: 'helperActiveSeconds', group: 'Helpers (subagents)', label: 'Counts as working if written in the last (seconds)', type: 'int', min: 2, max: 600, default: 10 },
  { key: 'maxHelpersShown', group: 'Helpers (subagents)', label: 'Helpers shown beside a desk', type: 'int', min: 0, max: 6, default: 3 },

  { key: 'celebrate.push', group: 'Celebrations', label: 'Celebrate a git push', type: 'bool', default: true },
  { key: 'celebrate.pr', group: 'Celebrations', label: 'Celebrate a new pull request', type: 'bool', default: true },
  { key: 'celebrate.seconds', group: 'Celebrations', label: 'Celebration length (seconds)', type: 'int', min: 1, max: 30, default: 5 },

  { key: 'notify.desktop', group: 'Notifications', label: 'Desktop notifications (macOS / Linux)', type: 'bool', default: true },
  { key: 'notify.events.approval', group: 'Notifications', label: 'When an agent needs your approval', type: 'bool', default: true },
  { key: 'notify.events.question', group: 'Notifications', label: 'When an agent has a question', type: 'bool', default: true },
  { key: 'notify.events.pr', group: 'Notifications', label: 'When an agent opens a pull request', type: 'bool', default: true },
  { key: 'notify.events.push', group: 'Notifications', label: 'When an agent pushes', type: 'bool', default: true },
  { key: 'notify.events.stuck', group: 'Notifications', label: 'When an agent may be stuck', type: 'bool', default: true },
  { key: 'notify.events.finished', group: 'Notifications', label: 'When an agent finishes', type: 'bool', default: false },
  { key: 'notify.quietIfVisibleSeconds', group: 'Notifications', label: "Don't notify if the dashboard was on screen in the last (seconds)", type: 'int', min: 0, max: 3600, default: 30 },
  { key: 'notify.detailChars', group: 'Notifications', label: 'Detail line length (characters)', type: 'int', min: 20, max: 500, default: 120,
    help: 'Alerts include one short line: the question, the command waiting for approval, the branch…' },
  { key: 'notify.slackWebhookUrl', group: 'Slack and phone', label: 'Slack incoming webhook URL', type: 'string', optional: true, secret: true, pattern: '^https://', maxLength: 500, default: '' },
  { key: 'notify.ntfyTopic', group: 'Slack and phone', label: 'ntfy topic (phone push)', type: 'string', optional: true, pattern: '^[A-Za-z0-9_-]{1,64}$', maxLength: 64, default: '',
    help: 'Topics on ntfy.sh are public to anyone who guesses the name: use a long random topic, an access token, or your own ntfy server' },
  { key: 'notify.ntfyServer', group: 'Slack and phone', label: 'ntfy server', type: 'string', pattern: '^https?://', maxLength: 300, default: 'https://ntfy.sh' },
  { key: 'notify.ntfyToken', group: 'Slack and phone', label: 'ntfy access token (optional)', type: 'string', optional: true, secret: true, maxLength: 300, default: '' },

  { key: 'timelineHours', group: 'History', label: 'Timeline covers the last (hours)', type: 'int', min: 1, max: 720, default: 24 },
  { key: 'search.maxResults', group: 'History', label: 'Search results to show', type: 'int', min: 5, max: 500, default: 50 },

  { key: 'pollMs', group: 'Refresh', label: 'Agent status refresh (ms)', type: 'int', min: 250, max: 10000, default: 1000 },
  { key: 'gitPollMs', group: 'Refresh', label: 'Git status refresh (ms)', type: 'int', min: 2000, max: 600000, default: 15000 },
  { key: 'ghPollMs', group: 'Refresh', label: 'Pull request refresh (ms)', type: 'int', min: 10000, max: 3600000, default: 60000 },
];
const BY_KEY = new Map(SCHEMA.map((s) => [s.key, s]));

function coerce(spec, value) {
  if (value === null || value === undefined || (value === '' && !spec.optional)) return { ok: false, error: 'is empty' };
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
  if (spec.type === 'string') {
    const s = String(value).trim();
    if (!s && spec.optional) return { ok: true, value: '' };
    if (!s || s.length > (spec.maxLength || 300)) return { ok: false, error: 'must be 1–' + (spec.maxLength || 300) + ' characters' };
    if (spec.pattern && !new RegExp(spec.pattern).test(s)) return { ok: false, error: 'is not in the right format' };
    return { ok: true, value: s };
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
