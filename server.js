#!/usr/bin/env node
'use strict';
// Agent Floor: one local dashboard for many Claude Code agents.
// Each agent is an interactive `claude` running in its own tmux session (cc-<name>).
// The server watches tmux panes + Claude Code transcripts and can type into any agent.
// No dependencies. Node 18+ and tmux required.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const T = require('./lib/transcript');
const G = require('./lib/git');
const { createConfig } = require('./lib/config');
const C = require('./lib/control');
const N = require('./lib/notify');
const Hist = require('./lib/history');
const readline = require('readline');
const Themes = require('./lib/themes');

const PORT = Number(process.env.PORT || 4777);
const HOST = '127.0.0.1';
const PREFIX = 'cc-';
const HOME = os.homedir();
const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || path.join(HOME, '.claude', 'projects');
const DATA_DIR = path.join(HOME, '.agent-floor');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const KEYS = new Set(['Enter', 'Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'BTab', 'Up', 'Down']);
const QUEUE = C.jsonStore(path.join(DATA_DIR, 'queue.json'), () => ({}));
const PROMPTS = C.jsonStore(path.join(DATA_DIR, 'prompts.json'), () => C.cleanPrompts(C.DEFAULT_PROMPTS));
const CONFIG = createConfig(path.join(DATA_DIR, 'config.json'), { log: (m) => console.warn(m) });
const { short, textOf } = T;
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
const BUILTIN_THEMES = path.join(__dirname, 'public', 'themes');
const USER_THEMES = process.env.AGENT_FLOOR_THEMES_DIR || path.join(os.homedir(), '.agent-floor', 'themes');

// ---------- helpers ----------
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: (stderr || (err && err.message) || '').trim() });
    });
  });
}
const tmux = (...args) => run('tmux', args);
// Feed text through stdin: tmux's argv parsing rejects text starting with "-" and eats a trailing ";".
function tmuxLoadBuffer(buffer, text) {
  return new Promise((resolve) => {
    const child = execFile('tmux', ['load-buffer', '-b', buffer, '-'], (err, stdout, stderr) => {
      resolve({ ok: !err, stderr: (stderr || (err && err.message) || '').trim() });
    });
    child.stdin.end(text);
  });
}
const SEP = '::AF::'; // tmux rewrites tabs in -F output, so use a plain-text separator
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const expandHome = (p) => (p === '~' ? HOME : p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
const target = (name) => `=${PREFIX}${name}:`; // exact match, active pane

function which(bin) {
  if (bin.includes('/')) return bin;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, bin);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}
const CLAUDE_BIN = process.env.CLAUDE_CMD || which('claude') || 'claude';
const GH_BIN = which('gh');

// ---------- saved agents ----------
let saved = [];
try { saved = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')).filter((a) => NAME_RE.test(a.name)); } catch {}
// A display name: any text, no control characters. The tmux session keeps the short name.
const cleanLabel = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
// Points an agent at a new conversation, remembering earlier ones for its timeline.
function bindSession(a, id) {
  if (a.sessionId && a.sessionId !== id) a.sessions = [a.sessionId, ...(a.sessions || []).filter((x) => x !== a.sessionId && x !== id)].slice(0, 20);
  a.sessionId = id;
}
function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const keep = ({ name, cwd, label, sessionId, sessions, contextWindow, repo, worktree }) =>
    Object.fromEntries(Object.entries({ name, cwd, label, sessionId, sessions, contextWindow, repo, worktree }).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(saved.map(keep), null, 2));
}

// ---------- tmux ----------
async function listSessions() {
  const r = await tmux('list-sessions', '-F', ['#{session_name}', '#{session_created}', '#{@cwd}', '#{pane_current_path}'].join(SEP));
  const map = new Map();
  if (!r.ok) return map; // no tmux server running yet
  for (const line of r.stdout.split('\n')) {
    if (!line.startsWith(PREFIX)) continue;
    const [session, created, optCwd, paneCwd] = line.split(SEP);
    map.set(session.slice(PREFIX.length), { created: Number(created) * 1000, cwd: optCwd || paneCwd });
  }
  return map;
}

async function capture(name) {
  const r = await tmux('capture-pane', '-p', '-J', '-t', target(name), '-S', '-120');
  return r.ok ? r.stdout.replace(/\s+$/, '') : '';
}

// conversation: '' = start fresh, 'latest' = the newest conversation in the folder, otherwise a session id.
// Every start pins a known session id, so each agent reads its own transcript even when agents share a folder.
// Returns that session id.
async function startAgent(name, cwd, conversation) {
  let cmd = `'${CLAUDE_BIN}'`;
  let sessionId;
  if (conversation === 'latest') {
    const newest = await newestTranscript(cwd);
    const id = newest && path.basename(newest.path, '.jsonl');
    if (id && SESSION_RE.test(id)) conversation = id;
    else conversation = '';
  }
  if (conversation) {
    if (!SESSION_RE.test(conversation) || !fs.existsSync(path.join(PROJECTS_DIR, encodeCwd(cwd), `${conversation}.jsonl`))) {
      throw new Error('That conversation was not found in this folder.');
    }
    cmd += ` --resume ${conversation}`;
    sessionId = conversation;
  } else {
    sessionId = crypto.randomUUID();
    cmd += ` --session-id ${sessionId}`;
  }
  const r = await tmux('new-session', '-d', '-s', PREFIX + name, '-c', cwd, '-x', '160', '-y', '48',
    '-e', `PATH=${process.env.PATH}`, cmd);
  if (!r.ok) throw new Error(r.stderr || 'tmux could not start the session');
  await tmux('set-option', '-t', `=${PREFIX}${name}`, '@cwd', cwd);
  return sessionId;
}

async function sendPrompt(name, text) {
  // Bracketed paste keeps multi-line instructions together.
  const buffer = `agentfloor-${name}`;
  const l = await tmuxLoadBuffer(buffer, text);
  if (!l.ok) throw new Error(l.stderr);
  const r = await tmux('paste-buffer', '-p', '-d', '-b', buffer, '-t', target(name));
  if (!r.ok) throw new Error(r.stderr);
  await sleep(150);
  await tmux('send-keys', '-t', target(name), 'Enter');
}

// ---------- transcripts ----------
const encodeCwd = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');

const newestTranscript = (cwd) => newestJsonl(path.join(PROJECTS_DIR, encodeCwd(cwd)));
async function newestJsonl(dir) {
  let names;
  try { names = await fsp.readdir(dir); } catch { return null; }
  let best = null;
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    try {
      const st = await fsp.stat(path.join(dir, n));
      if (!best || st.mtimeMs > best.mtimeMs) best = { path: path.join(dir, n), mtimeMs: st.mtimeMs, size: st.size };
    } catch {}
  }
  return best;
}

const tailCache = new Map();
async function readTail(file) {
  const c = tailCache.get(file.path);
  if (c && c.mtimeMs === file.mtimeMs && c.size === file.size) return c.entries;
  const len = Math.min(file.size, 384 * 1024);
  const fh = await fsp.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, file.size - len);
    const lines = buf.toString('utf8').split('\n');
    if (len < file.size) lines.shift(); // partial first line
    const entries = [];
    for (const l of lines.slice(-300)) {
      if (!l.trim()) continue;
      try { entries.push(JSON.parse(l)); } catch {}
    }
    tailCache.set(file.path, { mtimeMs: file.mtimeMs, size: file.size, entries });
    return entries;
  } finally { await fh.close(); }
}

// Every project folder Claude Code has a transcript for, plus the agents' folders, most recent first.
const cwdCache = new Map();
async function cwdOf(file) {
  if (cwdCache.has(file)) return cwdCache.get(file);
  let cwd = null;
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    for (const l of buf.toString('utf8', 0, bytesRead).split('\n')) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (e && typeof e.cwd === 'string') { cwd = e.cwd; break; }
    }
  } finally { await fh.close(); }
  cwdCache.set(file, cwd);
  return cwd;
}
async function listProjects() {
  const found = new Map();
  for (const a of saved) found.set(a.cwd, { cwd: a.cwd, lastUsed: 0 });
  let dirs = [];
  try { dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true }); } catch {}
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    try {
      const newest = await newestJsonl(path.join(PROJECTS_DIR, d.name));
      const cwd = newest && await cwdOf(newest.path);
      if (!cwd) continue;
      const prev = found.get(cwd);
      found.set(cwd, { cwd, lastUsed: Math.max(newest.mtimeMs, prev ? prev.lastUsed : 0) });
    } catch {}
  }
  const out = [];
  for (const p of found.values()) {
    try { if ((await fsp.stat(p.cwd)).isDirectory()) out.push({ ...p, name: path.basename(p.cwd) || p.cwd }); } catch {}
  }
  return out.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 60);
}

// Past conversations in a folder, newest first, titled by their summary or first instruction.
const sessionMetaCache = new Map();
async function sessionMeta(file, mtimeMs, size) {
  const c = sessionMetaCache.get(file);
  if (c && c.mtimeMs === mtimeMs) return c.meta;
  const meta = { title: '', firstPrompt: '', messages: 0 };
  let custom = false;
  const fh = await fsp.open(file, 'r');
  try {
    const len = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, 0);
    const lines = buf.toString('utf8').split('\n');
    if (len < size) lines.pop();
    for (const l of lines) {
      if (!l.trim()) continue;
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (e.type === 'summary' && e.summary && !meta.title) meta.title = short(e.summary, 90);
      // Current Claude Code writes ai-title (and custom-title from /rename); the latest one wins.
      if (e.type === 'ai-title' && e.aiTitle && !custom) meta.title = short(e.aiTitle, 90);
      if (e.type === 'custom-title' && e.customTitle) { meta.title = short(e.customTitle, 90); custom = true; }
      if (e.type === 'user' && !e.isMeta && !e.isSidechain && e.message) {
        const t = textOf(e.message.content).trim();
        if (t && !t.startsWith('<') && !t.startsWith('[Request interrupted')) {
          meta.messages++;
          if (!meta.firstPrompt) meta.firstPrompt = short(t, 120);
        }
      }
    }
  } finally { await fh.close(); }
  sessionMetaCache.set(file, { mtimeMs, meta });
  return meta;
}

async function listConversations(cwd) {
  const dir = path.join(PROJECTS_DIR, encodeCwd(cwd));
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  const items = [];
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const id = n.slice(0, -6);
    if (!SESSION_RE.test(id)) continue;
    try {
      const file = path.join(dir, n);
      const st = await fsp.stat(file);
      const meta = await sessionMeta(file, st.mtimeMs, st.size);
      if (!meta.firstPrompt && !meta.title) continue; // nothing was ever asked
      items.push({ id, updatedAt: st.mtimeMs, title: meta.title || meta.firstPrompt, firstPrompt: meta.firstPrompt, messages: meta.messages });
    } catch {}
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
}

// ---------- celebrations: a successful git push, a new pull request ----------
const SERVER_START = Date.now();
const findCelebrations = T.findCelebrations;
const celebrations = new Map(); // agent -> { seen:Set, recent:[] }
function celebrate(name, entries, since) {
  let cs = celebrations.get(name);
  if (!cs) celebrations.set(name, (cs = { seen: new Set(), recent: [] }));
  for (const f of findCelebrations(entries)) {
    if (cs.seen.has(f.id)) continue;
    cs.seen.add(f.id);
    if (f.at >= since) cs.recent.push(f); // only things that happened while we were watching
  }
  cs.recent = cs.recent.filter((f) => Date.now() - f.at < 120000).slice(-5);
  return cs.recent;
}

function paneSignals(text) {
  // Only the bottom of the screen matters: Claude Code redraws its status line and dialogs there.
  const tail = text.split('\n').filter((l) => l.trim()).slice(-12).join('\n');
  const waiting = /(Do you want to|Would you like to)/i.test(tail) && /^\s*(❯\s*)?1\.\s/m.test(tail);
  const busy = /esc to interrupt/i.test(tail);
  return { waiting, busy };
}

// ---------- which transcript belongs to which agent ----------
// First entries of a transcript (cached; the head of a file never changes).
const headCache = new Map();
async function readHead(file) {
  if (headCache.has(file)) return headCache.get(file);
  const entries = [];
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(32 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    for (const l of buf.toString('utf8', 0, bytesRead).split('\n').slice(0, 25)) {
      try { entries.push(JSON.parse(l)); } catch {}
    }
  } finally { await fh.close(); }
  const born = entries.map((e) => Date.parse(e && e.timestamp)).find((t) => t > 0) || 0;
  const head = { entries, born, clear: T.startedByClear(entries) };
  if (entries.length >= 3) headCache.set(file, head); // a brand-new file may still be growing
  return head;
}

async function transcriptsIn(dir) {
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.jsonl') || !SESSION_RE.test(n.slice(0, -6))) continue;
    try { const st = await fsp.stat(path.join(dir, n)); out.push({ id: n.slice(0, -6), path: path.join(dir, n), mtimeMs: st.mtimeMs, size: st.size }); } catch {}
  }
  return out;
}

// Returns { file, unknown } for an agent. Follows /clear (and resumes that fork to a new id) onto the new
// transcript, but only when exactly one floor agent in that folder could have started it.
async function resolveTranscript(a, s, sessions) {
  const files = await transcriptsIn(path.join(PROJECTS_DIR, encodeCwd(a.cwd)));
  const ownedByOthers = new Set(saved.filter((o) => o !== a && o.sessionId && o.cwd === a.cwd).map((o) => o.sessionId));
  const bound = a.sessionId ? files.find((f) => f.id === a.sessionId) || null : null;
  const since = s.created - 2000;
  const candidates = files.filter((f) => !ownedByOthers.has(f.id) && f !== bound && f.mtimeMs >= since && (!bound || f.mtimeMs > bound.mtimeMs));
  if (!a.sessionId) {
    // Not started by us (adopted tmux session): newest transcript nobody else owns.
    const newest = candidates.sort((x, y) => y.mtimeMs - x.mtimeMs)[0] || null;
    return { file: newest, unknown: false };
  }
  if (!candidates.length) return { file: bound, unknown: false };
  const cand = candidates.sort((x, y) => y.mtimeMs - x.mtimeMs)[0];
  const head = await readHead(cand.path);
  const born = head.born || cand.mtimeMs;
  if (born < since) return { file: bound, unknown: false };
  const boundQuiet = !bound || bound.mtimeMs <= born + 1000;
  if (!head.clear && !boundQuiet) return { file: bound, unknown: false }; // someone else's session, e.g. a plain terminal
  // Which other running floor agents in this folder could have started it? Ones whose own transcript went
  // quiet and whose screen changed around the time the new transcript began (an idle agent's screen doesn't).
  const rivals = [];
  for (const o of saved) {
    if (o === a || o.cwd !== a.cwd || !sessions.has(o.name)) continue;
    const of = o.sessionId ? files.find((f) => f.id === o.sessionId) : null;
    const screenAt = (memory.get(o.name) || {}).screenAt || 0;
    if ((!of || of.mtimeMs <= born + 1000) && screenAt >= born - 3000) rivals.push(o.name);
  }
  if (rivals.length) return { file: bound, unknown: true };
  bindSession(a, cand.id);
  persist();
  return { file: cand, unknown: false };
}

// ---------- helpers (subagents) ----------
const metaCache = new Map();
async function readMeta(file) {
  try {
    const st = await fsp.stat(file);
    const c = metaCache.get(file);
    if (c && c.mtimeMs === st.mtimeMs) return c.meta;
    const meta = JSON.parse(await fsp.readFile(file, 'utf8'));
    metaCache.set(file, { mtimeMs: st.mtimeMs, meta });
    return meta;
  } catch { return {}; }
}
async function listHelpers(file, since) {
  const dir = path.join(file.path.slice(0, -6), 'subagents');
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  const now = Date.now();
  const out = [];
  for (const n of names) {
    if (!/^agent-[\w-]+\.jsonl$/.test(n)) continue;
    const jsonl = path.join(dir, n);
    let st; try { st = await fsp.stat(jsonl); } catch { continue; }
    if (st.mtimeMs < since) continue;
    const meta = await readMeta(jsonl.replace(/\.jsonl$/, '.meta.json'));
    const info = T.analyze(await readTail({ path: jsonl, mtimeMs: st.mtimeMs, size: st.size }), { sidechain: true });
    const state = T.helperState(info, meta, st.mtimeMs, now, CONFIG.get('helperActiveSeconds'));
    if (state !== 'working' && now - st.mtimeMs > 120000) continue; // finished helpers linger two minutes
    out.push({
      id: n.slice(6, -6), name: short(meta.name || meta.agentType || 'helper', 40), description: short(meta.description, 120),
      type: meta.agentType || '', background: meta.requestShape === 'background', state,
      kind: state === 'working' ? info.kind : state, detail: info.detail, updatedAt: st.mtimeMs,
    });
  }
  return out.sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 12);
}

// ---------- git and pull requests (slow, cached, never blocks the poll) ----------
const gitCache = new Map(); // cwd -> { status, pr, at, ghAt, busy }
function gitInfo(cwd) {
  let c = gitCache.get(cwd);
  if (!c) gitCache.set(cwd, (c = { status: null, pr: null, at: 0, ghAt: 0, busy: false }));
  if (!c.busy && Date.now() - c.at > CONFIG.get('gitPollMs')) refreshGit(cwd, c);
  return c.status ? { ...c.status, pr: c.pr } : null;
}
async function refreshGit(cwd, c) {
  c.busy = true;
  try {
    const r = await run('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch'], { timeout: 5000 });
    c.status = r.ok ? G.parseStatus(r.stdout) : null;
    c.at = Date.now();
    const branch = c.status && c.status.branch;
    if (!branch || branch === 'detached HEAD' || !GH_BIN) c.pr = null;
    else if (Date.now() - c.ghAt > CONFIG.get('ghPollMs') || c.prBranch !== branch) {
      const g = await run(GH_BIN, ['pr', 'view', '--json', 'number,url,title,state,isDraft,reviewDecision,statusCheckRollup'], { cwd, timeout: 15000 });
      c.ghAt = Date.now(); c.prBranch = branch;
      try { c.pr = g.ok ? G.parsePr(JSON.parse(g.stdout)) : null; } catch { c.pr = null; }
    }
  } finally { c.busy = false; }
}

// ---------- polling ----------
const memory = new Map();
const startedAt = new Map();
let snapshot = { agents: [], tmux: true, claude: CLAUDE_BIN, settings: {} };
let snapshotJson = '';
const clients = new Set();
const WORKING_KINDS = new Set(['thinking', 'reading', 'writing', 'running', 'delegating', 'browsing', 'planning', 'tests', 'build', 'deploy', 'data', 'review', 'git']);

function contextFor(a, info) {
  const used = T.contextTokens(info.usage);
  if (!used) return null;
  const fromModel = T.contextWindowFor(info.model);
  let window = a.contextWindow || fromModel || CONFIG.get('contextWindow');
  const source = a.contextWindow ? 'override' : fromModel ? 'model' : 'setting';
  if (!a.contextWindow && used > window) window = 1000000; // already past it, so it must be the larger window
  const pct = Math.min(100, Math.round((used / window) * 100));
  const level = pct >= CONFIG.get('contextAlertPct') ? 'alert' : pct >= CONFIG.get('contextWarnPct') ? 'warn' : 'ok';
  return { used, window, pct, level, model: info.model, source, override: !!a.contextWindow };
}

function settingsForPage() {
  const c = CONFIG.all();
  return {
    theme: themeList().some((t) => t.id === c.theme && t.ok) ? c.theme : 'pixel', desksPerRow: c.desksPerRow, proseQuestion: c.proseQuestion, maxHelpersShown: c.maxHelpersShown,
    celebrateSeconds: c['celebrate.seconds'], contextWarnPct: c.contextWarnPct, contextAlertPct: c.contextAlertPct,
    savedPromptClick: c.savedPromptClick, prompts: PROMPTS.get(), desktopNotify: c['notify.desktop'],
  };
}

async function poll() {
  const sessions = await listSessions();
  let changed = false;
  for (const [name, s] of sessions) {
    if (NAME_RE.test(name) && !saved.find((a) => a.name === name)) { saved.push({ name, cwd: s.cwd }); changed = true; }
  }
  if (changed) persist();

  const now = Date.now();
  const agents = [];
  for (const a of saved) {
    const s = sessions.get(a.name);
    const prev = memory.get(a.name) || {};
    const item = { name: a.name, label: a.label || a.name, cwd: a.cwd, session: PREFIX + a.name, attach: `tmux attach -t ${PREFIX}${a.name}` };
    if (!s) {
      item.state = 'stopped';
      item.detail = 'Not running';
      const st = startedAt.get(a.name);
      if (st && now - st < 10000) {
        item.error = 'Claude exited right after starting. If you picked a conversation to continue, try another one or start fresh.';
      }
    } else {
      const screen = await capture(a.name);
      const sig = paneSignals(screen);
      const { file, unknown } = await resolveTranscript(a, s, sessions);
      let info = { kind: 'thinking', detail: '', lastPrompt: '', lastReply: '', ended: false, question: null, usage: null, lastResult: null, looping: null };
      let entries = [];
      if (file && file.mtimeMs >= s.created - 2000) {
        entries = await readTail(file);
        info = T.analyze(entries);
        const keep = (c) => (c.kind === 'push' ? CONFIG.get('celebrate.push') : CONFIG.get('celebrate.pr'));
        item.celebrations = celebrate(a.name, entries, Math.max(SERVER_START, s.created)).filter(keep);
      }
      const recentWrite = file && now - file.mtimeMs < 4000 && file.mtimeMs >= s.created;
      const busy = (sig.busy || recentWrite) && !info.ended;
      const proseMode = CONFIG.get('proseQuestion');
      const toolQuestion = info.question && info.question.kind === 'tool';
      const proseQuestion = info.question && info.question.kind === 'prose' && proseMode !== 'off' && !busy;
      const waiting = !toolQuestion && sig.waiting && !info.ended;

      item.helpers = file ? await listHelpers(file, s.created - 2000) : [];
      const helpersWorking = item.helpers.filter((h) => h.state === 'working').length;

      if (toolQuestion || proseQuestion) {
        item.state = 'asking';
        item.question = toolQuestion ? { kind: 'tool', questions: info.question.questions } : { kind: 'prose', text: info.question.text, mode: proseMode };
        item.detail = toolQuestion ? 'Has a question for you' : 'May have a question';
      } else if (waiting) {
        item.state = 'waiting'; item.detail = 'Needs your approval';
      } else if (busy) {
        item.state = info.kind === 'asking' ? 'thinking' : info.kind; item.detail = info.detail || 'Working';
      } else if (helpersWorking) {
        item.state = 'delegating'; item.detail = `Waiting on ${helpersWorking} helper${helpersWorking > 1 ? 's' : ''}`;
      } else {
        item.state = 'idle'; item.detail = info.lastReply ? 'Finished, ready for more' : 'Ready for instructions';
      }
      item.lastPrompt = info.lastPrompt;
      item.lastReply = info.lastReply;
      item.screen = screen;
      item.sessionId = a.sessionId || (file ? path.basename(file.path, '.jsonl') : '');
      if (unknown) item.sessionUnknown = true;
      item.context = contextFor(a, info);

      // Last test/build result survives the transcript tail scrolling past it.
      item.lastResult = info.lastResult || (prev.sessionId === item.sessionId ? prev.lastResult : null) || null;

      // Stuck: working, but neither the transcript nor the screen has changed for a while.
      const fileStamp = file ? `${file.path}:${file.size}` : '';
      const changedNow = !prev.screen || prev.screen !== screen || prev.fileStamp !== fileStamp;
      item.fileStamp = fileStamp;
      item.screenAt = !prev.screen || prev.screen !== screen ? now : prev.screenAt || now;
      item.lastChangeAt = changedNow ? now : prev.lastChangeAt || now;
      const quietMin = (now - item.lastChangeAt) / 60000;
      if (WORKING_KINDS.has(item.state) && item.state !== 'delegating' && quietMin >= CONFIG.get('stuckMinutes')) item.stuck = { minutes: Math.floor(quietMin) };
      if (info.looping && info.looping.count >= CONFIG.get('loopingFailures')) item.looping = info.looping;

      item.git = gitInfo(a.cwd);
    }
    const wasWorking = prev.state && WORKING_KINDS.has(prev.state);
    item.finishedAt = item.state === 'idle' ? (wasWorking ? now : prev.finishedAt || 0) : 0;
    item.since = prev.state === item.state ? prev.since : now;
    item.queue = C.queueOf(QUEUE.get(), a.name);
    item.lastDispatchAt = prev.lastDispatchAt || 0;
    if (a.worktree) item.worktree = { repo: a.repo };
    if (s && C.shouldDispatch({
      state: item.state, question: item.question, proseMode: CONFIG.get('proseQuestion'), sessionUnknown: item.sessionUnknown,
      now, quietSince: Math.max(item.since, item.lastChangeAt || 0), idleSecs: CONFIG.get('queueIdleSeconds'), queue: item.queue, lastDispatchAt: item.lastDispatchAt,
    })) {
      const next = item.queue.items[0];
      try {
        await sendPrompt(a.name, next.text);
        QUEUE.set(C.dequeue(QUEUE.get(), a.name, next.id));
        item.queue = C.queueOf(QUEUE.get(), a.name);
        item.lastDispatchAt = now;
        item.detail = 'Sent the next queued instruction';
      } catch (e) { console.warn(`queue: could not send to ${a.name}: ${e.message}`); }
    }
    notifyFor(prev, item, now);
    memory.set(a.name, item);
    const { fileStamp, lastChangeAt, screenAt, lastDispatchAt, ...pub } = item;
    agents.push(pub);
  }
  snapshot = { agents, tmux: snapshot.tmux, claude: CLAUDE_BIN, settings: settingsForPage() };
  const json = JSON.stringify(snapshot);
  if (json !== snapshotJson) {
    snapshotJson = json;
    for (const res of clients) res.write(`data: ${json}\n\n`);
  }
}

async function loop() {
  try { await poll(); } catch (e) { console.error('poll failed:', e.message); }
  setTimeout(loop, CONFIG.get('pollMs'));
}

// ---------- history: timeline, digest, search ----------
// Calls onEntry for each parsed line; `filter` (lowercase substring) skips lines cheaply before parsing.
async function eachEntry(file, onEntry, filter) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line || (filter && !line.toLowerCase().includes(filter))) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (onEntry(e) === false) break;
    }
  } finally { rl.close(); }
}

async function agentTimeline(a) {
  const since = Date.now() - CONFIG.get('timelineHours') * 3600000;
  const dir = path.join(PROJECTS_DIR, encodeCwd(a.cwd));
  const turns = [];
  for (const id of [a.sessionId, ...(a.sessions || [])].filter(Boolean)) {
    const file = path.join(dir, `${id}.jsonl`);
    let st; try { st = await fsp.stat(file); } catch { continue; }
    if (st.mtimeMs < since) continue;
    const entries = [];
    await eachEntry(file, (e) => { entries.push(e); });
    turns.push(...Hist.timelineFrom(entries, since));
  }
  return turns.sort((x, y) => y.at - x.at).slice(0, 80);
}

async function allTranscripts(sinceMs = 0) {
  let dirs = [];
  try { dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true }); } catch {}
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    for (const f of await transcriptsIn(path.join(PROJECTS_DIR, d.name))) if (f.mtimeMs >= sinceMs) out.push(f);
  }
  return out.sort((x, y) => y.mtimeMs - x.mtimeMs);
}

const digestCache = new Map();
async function digestFor(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  const day = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(new Date().toDateString());
  const from = day.getTime(), to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const key = `${from}`;
  const c = digestCache.get(key);
  if (c && Date.now() - c.at < 30000) return c.value;
  const acc = new Map();
  for (const f of await allTranscripts(from)) {
    const ctx = { from, to, uses: new Map(), cwd: '' };
    await eachEntry(f.path, (e) => { Hist.digestAdd(acc, e, ctx); });
  }
  const value = { date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, projects: Hist.digestResult(acc) };
  digestCache.set(key, { at: Date.now(), value });
  return value;
}

async function searchTranscripts(q) {
  const ql = q.toLowerCase();
  const max = CONFIG.get('search.maxResults');
  const deadline = Date.now() + 8000;
  const results = [];
  let partial = false;
  for (const f of await allTranscripts()) {
    if (results.length >= max) break;
    if (Date.now() > deadline) { partial = true; break; }
    let perFile = 0, cwd = '';
    await eachEntry(f.path, (e) => {
      if (e.cwd) cwd = e.cwd;
      const hit = Hist.searchEntry(e, ql);
      if (!hit) return true;
      results.push({ ...hit, cwd: e.cwd || cwd, sessionId: f.id });
      perFile++;
      return perFile < 3 && results.length < max;
    }, ql);
  }
  for (const r of results) {
    const file = path.join(PROJECTS_DIR, encodeCwd(r.cwd || ''), `${r.sessionId}.jsonl`);
    try { const st = await fsp.stat(file); r.title = (await sessionMeta(file, st.mtimeMs, st.size)).title || ''; } catch { r.title = ''; }
    r.project = path.basename(r.cwd || '') || r.cwd;
  }
  return { results, partial };
}

// ---------- themes ----------
const themeFolders = () => [{ dir: BUILTIN_THEMES, builtin: true }, { dir: USER_THEMES }];
let themeCache = { at: 0, list: null };
function themeList() {
  if (themeCache.list && Date.now() - themeCache.at < 5000) return themeCache.list;
  themeCache = { at: Date.now(), list: readThemes() };
  return themeCache.list;
}
function readThemes() {
  const pixel = { id: 'pixel', name: 'Pixel office', description: 'The built-in pixel-art office.', builtin: true, ok: true, kind: 'pixel' };
  return [pixel, ...Themes.listThemes(themeFolders()).map((t) => ({ ...t.theme, builtin: t.builtin, ok: t.ok, problems: t.problems }))];
}
const THEME_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
function serveThemeFile(res, id, file) {
  if (!Themes.ID_RE.test(id) || !Themes.safeFile(file)) { res.writeHead(404); return res.end(); }
  for (const { dir } of themeFolders()) {
    const base = path.join(dir, id);
    const full = path.resolve(base, file);
    if (!full.startsWith(base + path.sep)) continue;
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    // A theme file opened directly must not be able to run script in this origin.
    res.writeHead(200, {
      'Content-Type': THEME_TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:", 'X-Content-Type-Options': 'nosniff',
    });
    return fs.createReadStream(full).pipe(res);
  }
  res.writeHead(404); return res.end();
}

// ---------- notifications ----------
let lastVisibleAt = 0; // last time a dashboard tab said it was on screen
const notifyOnce = N.createDeduper();
async function deliver(msg) {
  const results = {};
  if (CONFIG.get('notify.desktop')) {
    const cmd = N.desktopCommand(process.platform, msg.title, msg.detail);
    if (cmd) { const r = await run(cmd[0], cmd[1], { timeout: 10000 }); results.desktop = r.ok ? 'sent' : r.stderr || 'failed'; }
  }
  const slack = CONFIG.get('notify.slackWebhookUrl');
  if (slack) {
    try {
      const r = await fetch(slack, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(N.slackPayload(msg)), signal: AbortSignal.timeout(10000) });
      results.slack = r.ok ? 'sent' : `HTTP ${r.status}`;
    } catch (e) { results.slack = e.message; }
  }
  const topic = CONFIG.get('notify.ntfyTopic');
  if (topic) {
    const { url, init } = N.ntfyRequest({ server: CONFIG.get('notify.ntfyServer'), topic, token: CONFIG.get('notify.ntfyToken') }, msg);
    try { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); results.ntfy = r.ok ? 'sent' : `HTTP ${r.status}`; }
    catch (e) { results.ntfy = e.message; }
  }
  for (const [ch, r] of Object.entries(results)) if (r !== 'sent') console.warn(`notify via ${ch} failed: ${r}`);
  return results;
}
function notifyFor(prev, item, now) {
  const events = N.detectEvents(prev, item, { proseMode: CONFIG.get('proseQuestion'), detailChars: CONFIG.get('notify.detailChars') });
  if (!events.length) return;
  if (now - lastVisibleAt < CONFIG.get('notify.quietIfVisibleSeconds') * 1000) return; // you're looking at the dashboard
  for (const ev of events) {
    if (!CONFIG.get(`notify.events.${ev.event}`) || !notifyOnce(`${item.name}:${ev.key}`, now)) continue;
    deliver(ev).catch((e) => console.warn(`notify failed: ${e.message}`));
  }
}

// ---------- worktrees ----------
async function createWorktree(dir, branch, base) {
  const top = await run('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { timeout: 5000 });
  if (!top.ok) return { error: `${dir} is not inside a git repository.` };
  const repo = top.stdout.trim();
  const fmt = await run('git', ['check-ref-format', '--branch', branch], { timeout: 5000 });
  if (!fmt.ok || branch.startsWith('-')) return { error: `"${branch}" is not a valid branch name.` };
  if (!base) {
    const head = await run('git', ['-C', repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { timeout: 5000 });
    base = head.ok ? head.stdout.trim() : 'HEAD';
  }
  if (base.startsWith('-')) return { error: `"${base}" is not a valid base.` };
  const wtPath = C.worktreePathFor(CONFIG.get('worktreePath'), repo, branch);
  if (fs.existsSync(wtPath)) return { error: `A folder already exists at ${wtPath}.` };
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  const exists = await run('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { timeout: 5000 });
  const args = exists.ok ? ['-C', repo, 'worktree', 'add', wtPath, branch] : ['-C', repo, 'worktree', 'add', '-b', branch, wtPath, base];
  const r = await run('git', args, { timeout: 60000 });
  if (!r.ok) return { error: `git worktree add failed: ${r.stderr}` };
  return { path: wtPath, repo };
}
async function removeWorktree(agent) {
  const st = await run('git', ['-C', agent.cwd, 'status', '--porcelain'], { timeout: 10000 });
  if (!st.ok) return { error: `Could not check ${agent.cwd}: ${st.stderr}` };
  if (st.stdout.trim()) return { error: `The worktree at ${agent.cwd} has uncommitted changes, so it was kept. Commit or discard them first, or remove the agent without removing the worktree.` };
  const r = await run('git', ['-C', agent.repo, 'worktree', 'remove', agent.cwd], { timeout: 30000 });
  return r.ok ? {} : { error: `git worktree remove failed: ${r.stderr}` };
}

// ---------- http ----------
function allowedHost(req) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  return !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('Request is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Body must be JSON')); } });
    req.on('error', reject);
  });
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (!allowedHost(req)) { res.writeHead(403); return res.end('Forbidden'); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(INDEX_FILE).pipe(res);
    }
    if (req.method === 'GET' && p === '/api/state') return send(res, 200, snapshot);
    if (req.method === 'GET' && p === '/api/config') return send(res, 200, { schema: CONFIG.schema(), values: CONFIG.all(), problems: CONFIG.problems() });
    if (req.method === 'GET' && p === '/api/themes') return send(res, 200, { themes: themeList(), current: CONFIG.get('theme'), userDir: USER_THEMES });
    const tf = p.match(/^\/themes\/([^/]+)\/(.+)$/);
    if (req.method === 'GET' && tf) return serveThemeFile(res, tf[1], decodeURIComponent(tf[2]));
    if (req.method === 'GET' && p === '/api/digest') return send(res, 200, await digestFor(url.searchParams.get('date')));
    if (req.method === 'GET' && p === '/api/search') {
      const q = String(url.searchParams.get('q') || '').trim();
      if (q.length < 2) return send(res, 400, { error: 'Search for at least 2 characters.' });
      return send(res, 200, await searchTranscripts(q.slice(0, 200)));
    }
    const tl = p.match(/^\/api\/agents\/([A-Za-z0-9_-]{1,32})\/timeline$/);
    if (req.method === 'GET' && tl) {
      const agent = saved.find((a) => a.name === tl[1]);
      if (!agent) return send(res, 404, { error: `No agent called ${tl[1]}.` });
      return send(res, 200, { hours: CONFIG.get('timelineHours'), turns: await agentTimeline(agent) });
    }
    if (req.method === 'GET' && p === '/api/projects') return send(res, 200, { projects: await listProjects() });
    if (req.method === 'GET' && p === '/api/conversations') {
      const dir = path.resolve(expandHome(String(url.searchParams.get('cwd') || '').trim()));
      return send(res, 200, { cwd: dir, conversations: await listConversations(dir) });
    }
    if (req.method === 'GET' && p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    // Everything below changes something: require our custom header (blocks cross-site requests).
    if (req.headers['x-agent-floor'] !== '1') return send(res, 403, { error: 'Missing X-Agent-Floor header' });

    if (req.method === 'POST' && p === '/api/config') {
      const patch = (await readBody(req)).patch || {};
      if (patch.theme && !themeList().some((t) => t.id === patch.theme && t.ok)) return send(res, 400, { error: `There is no usable theme called "${patch.theme}".` });
      const r = CONFIG.set(patch);
      if (!r.ok) return send(res, 400, { error: Object.values(r.errors).join('. '), errors: r.errors });
      await poll();
      return send(res, 200, { ok: true, values: CONFIG.all() });
    }

    if (req.method === 'POST' && p === '/api/visible') {
      if ((await readBody(req)).visible) lastVisibleAt = Date.now();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/notify/test') {
      const results = await deliver({ event: 'push', title: 'Agent Floor test notification', detail: 'If you can read this, alerts reach you.', url: '' });
      return send(res, 200, { ok: true, results });
    }
    if (req.method === 'POST' && p === '/api/prompts') {
      const prompts = C.cleanPrompts((await readBody(req)).prompts);
      PROMPTS.set(prompts);
      await poll();
      return send(res, 200, { ok: true, prompts });
    }
    if (req.method === 'POST' && p === '/api/broadcast') {
      const { names, text } = await readBody(req);
      if (!text || !String(text).trim()) return send(res, 400, { error: 'Write an instruction first.' });
      const sessions = await listSessions();
      const results = {};
      for (const name of Array.isArray(names) ? names.slice(0, 50) : []) {
        const agent = saved.find((a) => a.name === name);
        if (!agent || !sessions.has(name)) { results[name] = 'skipped (not running)'; continue; }
        const state = (memory.get(name) || {}).state;
        if (state === 'idle') { await sendPrompt(name, String(text)); results[name] = 'sent'; }
        else { QUEUE.set(C.enqueue(QUEUE.get(), name, String(text)).all); results[name] = 'queued'; }
      }
      await poll();
      return send(res, 200, { ok: true, results });
    }

    if (req.method === 'POST' && p === '/api/agents') {
      const { name, cwd, conversation, label, worktree } = await readBody(req);
      if (!NAME_RE.test(name || '')) return send(res, 400, { error: 'Use 1–32 letters, numbers, dashes or underscores for the name.' });
      if (saved.find((a) => a.name === name)) return send(res, 409, { error: `There is already an agent called ${name}.` });
      const dir = path.resolve(expandHome(String(cwd || '').trim()));
      let st; try { st = await fsp.stat(dir); } catch {}
      if (!st || !st.isDirectory()) return send(res, 400, { error: `Folder not found: ${dir}` });
      let agentDir = dir, repoRoot;
      if (worktree && worktree.branch) {
        const wt = await createWorktree(dir, String(worktree.branch).trim(), String(worktree.base || '').trim());
        if (wt.error) return send(res, 400, { error: wt.error });
        agentDir = wt.path; repoRoot = wt.repo;
      }
      // Save first: a poll running while tmux starts would otherwise adopt cc-<name> and we'd add it twice.
      saved.push({ name, cwd: agentDir, label: cleanLabel(label) || undefined, repo: repoRoot, worktree: repoRoot ? true : undefined });
      try { bindSession(saved.find((a) => a.name === name), await startAgent(name, agentDir, repoRoot ? '' : conversation || '')); }
      catch (e) { saved = saved.filter((a) => a.name !== name); throw e; }
      startedAt.set(name, Date.now());
      persist();
      await poll();
      return send(res, 201, { ok: true });
    }

    const m = p.match(/^\/api\/agents\/([A-Za-z0-9_-]{1,32})(?:\/(prompt|key|start|stop|label|context|queue))?(?:\/([a-f0-9]{12}))?(?:\/(up|down))?$/);
    if (m) {
      const [, name, action, itemId, moveDir] = m;
      const agent = saved.find((a) => a.name === name);
      if (!agent) return send(res, 404, { error: `No agent called ${name}.` });
      const running = (await listSessions()).has(name);

      if (req.method === 'POST' && action === 'prompt') {
        const { text } = await readBody(req);
        if (!running) return send(res, 409, { error: `${name} is stopped. Start it first.` });
        if (!text || !String(text).trim()) return send(res, 400, { error: 'Write an instruction first.' });
        await sendPrompt(name, String(text));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && action === 'key') {
        const { key } = await readBody(req);
        if (!KEYS.has(key)) return send(res, 400, { error: 'That key is not allowed.' });
        if (!running) return send(res, 409, { error: `${name} is stopped.` });
        await tmux('send-keys', '-t', target(name), key);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && action === 'label') {
        const label = cleanLabel((await readBody(req)).label);
        if (!label) return send(res, 400, { error: 'Give the agent a name.' });
        agent.label = label; persist();
        await poll();
        return send(res, 200, { ok: true });
      }
      if (action === 'queue') {
        if (req.method === 'POST' && !itemId) {
          const body = await readBody(req);
          if (typeof body.paused === 'boolean') QUEUE.set(C.setPaused(QUEUE.get(), name, body.paused));
          else {
            if (!body.text || !String(body.text).trim()) return send(res, 400, { error: 'Write an instruction first.' });
            QUEUE.set(C.enqueue(QUEUE.get(), name, String(body.text)).all);
          }
        } else if (req.method === 'POST' && itemId && moveDir) QUEUE.set(C.moveItem(QUEUE.get(), name, itemId, moveDir === 'up' ? -1 : 1));
        else if (req.method === 'DELETE' && itemId) QUEUE.set(C.dequeue(QUEUE.get(), name, itemId));
        else return send(res, 404, { error: 'Not found' });
        await poll();
        return send(res, 200, { ok: true, queue: C.queueOf(QUEUE.get(), name) });
      }
      if (req.method === 'POST' && action === 'context') {
        const { contextWindow } = await readBody(req);
        if (contextWindow === null || contextWindow === '' || contextWindow === undefined) delete agent.contextWindow;
        else {
          const n = Number(contextWindow);
          if (!Number.isInteger(n) || n < 10000 || n > 10000000) return send(res, 400, { error: 'Context window must be a whole number between 10,000 and 10,000,000.' });
          agent.contextWindow = n;
        }
        persist();
        await poll();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && action === 'start') {
        const { conversation } = await readBody(req);
        if (running) return send(res, 409, { error: `${name} is already running.` });
        bindSession(agent, await startAgent(name, agent.cwd, conversation || ''));
        persist();
        startedAt.set(name, Date.now());
        await poll();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && action === 'stop') {
        if (running) await tmux('kill-session', '-t', `=${PREFIX}${name}`);
        startedAt.delete(name);
        await poll();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE' && !action) {
        if (running) return send(res, 409, { error: `Stop ${name} before removing it.` });
        if (url.searchParams.get('removeWorktree') === '1' && agent.worktree) {
          const r = await removeWorktree(agent);
          if (r.error) return send(res, 409, { error: r.error });
        }
        const q = QUEUE.get(); if (q[name]) { const { [name]: _, ...rest } = q; QUEUE.set(rest); }
        saved = saved.filter((a) => a.name !== name); persist();
        memory.delete(name);
        await poll();
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 500, { error: e.message || 'Something went wrong' });
  }
});

// `node server.js --check-theme <folder>`: validate a theme while you build it.
if (process.argv[2] === '--check-theme') {
  const dir = path.resolve(process.argv[3] || '.');
  const r = Themes.loadThemeDir(dir);
  if (r.ok) console.log(`✓ ${r.theme.name} (${r.theme.id}) looks good. Roles: ${Object.keys(r.theme.roles).join(', ')}`);
  else { console.error(`✗ ${dir}`); for (const pr of r.problems) console.error(`  - ${pr}`); }
  process.exit(r.ok ? 0 : 1);
}

(async () => {
  const v = await tmux('-V');
  if (!v.ok) {
    console.error('tmux is not installed. On macOS: brew install tmux');
    process.exit(1);
  }
  if (!which(CLAUDE_BIN)) console.warn(`Warning: could not find "${CLAUDE_BIN}" on PATH. Set CLAUDE_CMD=/path/to/claude.`);
  // Poll once before listening, so a reconnecting tab never gets an empty floor and drops its selection.
  await loop();
  server.listen(PORT, HOST, () => {
    console.log(`Agent Floor is running at http://localhost:${PORT}`);
    console.log(`Using ${v.stdout.trim()} and claude at ${CLAUDE_BIN}`);
  });
})();
