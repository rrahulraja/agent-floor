'use strict';
// Stage 5: themes. Pixel is built into the page (code). Every other theme is data: a theme.json manifest plus
// SVG/PNG/WebP/GIF files, shown as <img> so nothing inside a theme can run script. See docs/themes.md.

const fs = require('fs');
const path = require('path');

const ROLE_KEYS = [
  'default', 'thinking', 'reading', 'writing', 'running', 'tests', 'build', 'deploy', 'data', 'review', 'git',
  'delegating', 'browsing', 'planning', 'waiting', 'asking', 'idle', 'done', 'helper',
];
const ASSET_EXT = new Set(['.svg', '.png', '.webp', '.gif', '.jpg', '.jpeg', '.css', '.json']);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const RESERVED = new Set(['pixel']);
// Header fonts a theme may pick; the page loads them from Google Fonts by name.
const FONTS = {
  pixel: 'Pixelify Sans', inter: 'Inter', cinzel: 'Cinzel', 'cinzel-decorative': 'Cinzel Decorative',
  'tiro-sanskrit': 'Tiro Devanagari Sanskrit', orbitron: 'Orbitron', vt323: 'VT323', 'press-start': 'Press Start 2P',
};
const CLOCKS = ['default', 'digital', 'lcd'];
const ERAS = ['none', 'stardate'];
const PHASES = ['dawn', 'morning', 'afternoon', 'evening', 'night'];

const safeFile = (f) => typeof f === 'string' && FILE_RE.test(f) && !f.split('/').includes('..') && ASSET_EXT.has(path.extname(f).toLowerCase());

// Checks a manifest against the files that exist. Returns { ok, problems, theme }.
function validateManifest(json, exists) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };
  if (!json || typeof json !== 'object') return { ok: false, problems: ['theme.json is not a JSON object'], theme: null };
  need(ID_RE.test(json.id || ''), 'id must be 1–40 lowercase letters, digits or dashes');
  need(!RESERVED.has(json.id), `id "${json.id}" is reserved`);
  need(typeof json.name === 'string' && json.name.trim(), 'name is required');
  need(json.kind === 'vector', 'kind must be "vector"');
  const file = (where, f, required) => {
    if (f === undefined || f === null || f === '') { if (required) problems.push(`${where} is required`); return; }
    if (!safeFile(f)) { problems.push(`${where}: "${f}" is not an allowed file name (letters, digits, . _ - and /; .svg .png .webp .gif .jpg)`); return; }
    if (!exists(f)) problems.push(`${where}: ${f} not found`);
  };
  const room = json.room || {};
  file('room.wall', room.wall, false);
  file('room.floor', room.floor, false);
  file('room.desk', room.desk, true);
  file('room.lounge', room.lounge, false);
  const roles = json.roles || {};
  file('roles.default', roles.default, true);
  for (const [k, f] of Object.entries(roles)) {
    if (!ROLE_KEYS.includes(k)) problems.push(`roles.${k} is not a known role (${ROLE_KEYS.join(', ')})`);
    else if (k !== 'default') file(`roles.${k}`, f, false);
  }
  const cel = json.celebration || {};
  file('celebration.push', cel.push, false);
  file('celebration.pr', cel.pr, false);
  if (json.style) problems.push('style is not supported: themes are images only, so they cannot change the rest of the page');
  if (json.labels && typeof json.labels !== 'object') problems.push('labels must be an object of role -> text');
  const hd = json.header || {};
  if (json.header && typeof json.header !== 'object') problems.push('header must be an object');
  if (hd.font && !FONTS[hd.font]) problems.push(`header.font must be one of ${Object.keys(FONTS).join(', ')}`);
  if (hd.clockFont && !FONTS[hd.clockFont]) problems.push(`header.clockFont must be one of ${Object.keys(FONTS).join(', ')}`);
  if (hd.clock && !CLOCKS.includes(hd.clock)) problems.push(`header.clock must be one of ${CLOCKS.join(', ')}`);
  if (hd.era && !ERAS.includes(hd.era)) problems.push(`header.era must be one of ${ERAS.join(', ')}`);
  for (const [k, v] of Object.entries(hd.colors || {})) if (!['bar', 'ink', 'accent', 'muted'].includes(k) || !color(v)) problems.push(`header.colors.${k} must be a #hex colour (bar, ink, accent, muted)`);
  for (const [k, v] of Object.entries(hd.phases || {})) if (!PHASES.includes(k) || typeof v !== 'string') problems.push(`header.phases.${k} must be text (${PHASES.join(', ')})`);
  const theme = {
    id: json.id, name: String(json.name || '').slice(0, 60), version: String(json.version || ''), author: String(json.author || '').slice(0, 80),
    description: String(json.description || '').slice(0, 300), kind: 'vector', tint: !!json.tint,
    room: { wall: room.wall, floor: room.floor, desk: room.desk, lounge: room.lounge, wallColor: color(room.wallColor), floorColor: color(room.floorColor) },
    roles: Object.fromEntries(Object.entries(roles).filter(([k]) => ROLE_KEYS.includes(k))),
    celebration: { push: cel.push, pr: cel.pr },
    labels: Object.fromEntries(Object.entries(json.labels || {}).filter(([k, v]) => typeof v === 'string').map(([k, v]) => [k, v.slice(0, 40)])),
    header: json.header ? {
      title: typeof hd.title === 'string' ? hd.title.slice(0, 30) : '',
      font: FONTS[hd.font] || '', clockFont: FONTS[hd.clockFont] || FONTS[hd.font] || '',
      clock: CLOCKS.includes(hd.clock) ? hd.clock : 'default', era: ERAS.includes(hd.era) ? hd.era : 'none',
      colors: Object.fromEntries(Object.entries(hd.colors || {}).filter(([k, v]) => ['bar', 'ink', 'accent', 'muted'].includes(k) && color(v))),
      phases: Object.fromEntries(Object.entries(hd.phases || {}).filter(([k, v]) => PHASES.includes(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 24)])),
    } : null,
    size: { sit: num(json.size && json.size.sit, 30, 10, 60), helper: num(json.size && json.size.helper, 14, 6, 40), aspect: num(json.size && json.size.aspect, 4 / 3, 0.5, 3) },
  };
  return { ok: !problems.length, problems, theme };
}
const color = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : undefined);
const num = (v, d, min, max) => (Number.isFinite(v) && v >= min && v <= max ? v : d);

// Reads one theme folder. Returns { ok, problems, theme, dir }.
function loadThemeDir(dir) {
  let json;
  try { json = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')); }
  catch (e) { return { ok: false, problems: [`theme.json: ${e.code === 'ENOENT' ? 'missing' : e.message}`], theme: null, dir }; }
  const exists = (f) => { try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; } };
  return { ...validateManifest(json, exists), dir };
}

// All themes in the given folders; earlier folders win on duplicate ids.
function listThemes(folders) {
  const seen = new Map();
  for (const { dir, builtin } of folders) {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
    for (const n of names) {
      const r = loadThemeDir(path.join(dir, n));
      const id = r.theme && r.theme.id;
      if (!id || seen.has(id) || RESERVED.has(id)) continue;
      if (id !== n) r.problems.push(`folder name "${n}" should match id "${id}"`);
      seen.set(id, { ...r, ok: r.ok && id === n, builtin: !!builtin });
    }
  }
  return [...seen.values()];
}

module.exports = { FONTS, ROLE_KEYS, ASSET_EXT, safeFile, validateManifest, loadThemeDir, listThemes, ID_RE };
