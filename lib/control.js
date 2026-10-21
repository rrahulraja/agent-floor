'use strict';
// Stage 2 helpers: the instruction queue, saved prompts and worktree paths. Pure except for the JSON store.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A small JSON file that survives restarts. Corrupt or missing files fall back to the default.
function jsonStore(file, fallback) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = fallback(); }
  return {
    get: () => data,
    set(next) {
      data = next;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    },
  };
}

const newId = () => crypto.randomBytes(6).toString('hex');
const cleanText = (t, max = 20000) => String(t || '').replace(/\r\n/g, '\n').slice(0, max);

// ---------- queue: { [agent]: { paused: bool, items: [{ id, text, addedAt }] } } ----------
function queueOf(all, name) { return all[name] || { paused: false, items: [] }; }
function enqueue(all, name, text, now = Date.now()) {
  const q = queueOf(all, name);
  const item = { id: newId(), text: cleanText(text), addedAt: now };
  return { all: { ...all, [name]: { ...q, items: [...q.items, item] } }, item };
}
function dequeue(all, name, id) {
  const q = queueOf(all, name);
  return { ...all, [name]: { ...q, items: q.items.filter((i) => i.id !== id) } };
}
function moveItem(all, name, id, dir) {
  const q = queueOf(all, name);
  const items = [...q.items];
  const i = items.findIndex((x) => x.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= items.length) return all;
  [items[i], items[j]] = [items[j], items[i]];
  return { ...all, [name]: { ...q, items } };
}
function setPaused(all, name, paused) {
  return { ...all, [name]: { ...queueOf(all, name), paused: !!paused } };
}

// Should the next queued instruction go out now? Only to an agent that is plainly idle and settled.
// quietSince: when the agent last changed (state, transcript or screen). After a send we wait for the agent
// to react (quietSince moves past lastDispatchAt) and then go quiet again, even if a fast reply meant we
// never saw it busy.
function shouldDispatch({ state, question, proseMode, sessionUnknown, now, quietSince, idleSecs, queue, lastDispatchAt }) {
  if (!queue || queue.paused || !queue.items.length || sessionUnknown) return false;
  const proseFloorOnly = state === 'asking' && question && question.kind === 'prose' && proseMode === 'floor';
  if (state !== 'idle' && !proseFloorOnly) return false;
  if (now - quietSince < idleSecs * 1000) return false;
  return !lastDispatchAt || quietSince > lastDispatchAt; // one item per reaction
}

// ---------- saved prompts ----------
const DEFAULT_PROMPTS = [
  'Run the tests and fix any failures.',
  '/code-review',
  'Rebase on main and resolve any conflicts.',
  'Summarise what you changed and why.',
];
function cleanPrompts(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => cleanText(typeof p === 'string' ? p : p && p.text, 4000).trim())
    .filter(Boolean).slice(0, 40)
    .map((text) => ({ id: newId(), text }));
}

// ---------- worktrees ----------
function branchSlug(branch) {
  return String(branch).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'branch';
}
function worktreePathFor(template, repoRoot, branch) {
  const repoParent = path.dirname(repoRoot);
  const repo = path.basename(repoRoot);
  const out = String(template || '{repoParent}/{repo}.worktrees/{branch}')
    .replace(/\{repoParent\}/g, repoParent).replace(/\{repo\}/g, repo).replace(/\{branch\}/g, branchSlug(branch));
  return path.resolve(out);
}

// What the bottom of an agent's screen says. Claude Code redraws its status line and dialogs there.
// trust: the "do you trust this folder?" screen shown when Claude Code first opens a folder. Its menu has
// no numbers and "No, exit" is highlighted, so it needs its own answer (Down, Enter), not a plain Enter.
function paneSignals(text) {
  const tail = String(text || '').split('\n').filter((l) => l.trim()).slice(-12).join('\n');
  const trust = /trust this folder|Do you trust the files/i.test(tail) && /Enter to confirm/i.test(tail);
  const waiting = trust || (/(Do you want to|Would you like to)/i.test(tail) && /^\s*(❯\s*)?1\.\s/m.test(tail));
  const busy = /esc to interrupt/i.test(tail);
  return { waiting, busy, trust };
}

// The few lines above a permission prompt's question: the tool and what it wants to run or change.
function approvalText(text) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/[│╭╮╰╯─]/g, '').trim());
  let q = -1;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 40); i--) if (/^(Do you want to|Would you like to)/i.test(lines[i])) { q = i; break; }
  if (q < 0) return '';
  const out = [];
  for (let i = q - 1; i >= 0 && out.length < 8; i--) {
    if (!lines[i]) { if (out.length && i > 0 && !lines[i - 1]) break; continue; } // a double blank line ends the block
    out.unshift(lines[i]);
    if (/^(Bash command|Edit file|Write file|Create file|Read file|Fetch|Web ?fetch|Tool use|MCP|Network request)/i.test(lines[i])) break; // the box title
  }
  return out.join('\n').slice(0, 1200);
}

// A terminal size sent by the page (to start an agent at the panel's width), clamped to sane bounds.
function cleanSize(body) {
  if (!body || body.cols == null || body.rows == null) return null;
  const cols = Number(body.cols), rows = Number(body.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  const fit = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(v)));
  return { cols: fit(cols, 60, 400), rows: fit(rows, 20, 200) };
}

module.exports = {
  jsonStore, newId, enqueue, dequeue, moveItem, setPaused, queueOf, shouldDispatch,
  DEFAULT_PROMPTS, cleanPrompts, branchSlug, worktreePathFor, paneSignals, approvalText, cleanSize,
};
