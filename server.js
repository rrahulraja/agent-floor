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
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 4777);
const HOST = '127.0.0.1';
const PREFIX = 'cc-';
const HOME = os.homedir();
const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || path.join(HOME, '.claude', 'projects');
const DATA_DIR = path.join(HOME, '.agent-floor');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const POLL_MS = 1000;
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const KEYS = new Set(['Enter', 'Escape', '1', '2', '3', 'BTab', 'Up', 'Down']);
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');

// ---------- helpers ----------
function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
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

function short(s, n = 70) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------- saved agents ----------
let saved = [];
try { saved = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')).filter((a) => NAME_RE.test(a.name)); } catch {}
// A display name: any text, no control characters. The tmux session keeps the short name.
const cleanLabel = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(saved.map(({ name, cwd, label }) => (label ? { name, cwd, label } : { name, cwd })), null, 2));
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

// conversation: '' = start fresh, 'latest' = claude --continue, otherwise a session id for claude --resume
async function startAgent(name, cwd, conversation) {
  let cmd = `'${CLAUDE_BIN}'`;
  if (conversation === 'latest') cmd += ' --continue';
  else if (conversation) {
    if (!SESSION_RE.test(conversation) || !fs.existsSync(path.join(PROJECTS_DIR, encodeCwd(cwd), `${conversation}.jsonl`))) {
      throw new Error('That conversation was not found in this folder.');
    }
    cmd += ` --resume ${conversation}`;
  }
  const r = await tmux('new-session', '-d', '-s', PREFIX + name, '-c', cwd, '-x', '160', '-y', '48',
    '-e', `PATH=${process.env.PATH}`, cmd);
  if (!r.ok) throw new Error(r.stderr || 'tmux could not start the session');
  await tmux('set-option', '-t', `=${PREFIX}${name}`, '@cwd', cwd);
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

const TOOL_KIND = {
  Read: 'reading', Grep: 'reading', Glob: 'reading', LS: 'reading', NotebookRead: 'reading',
  Edit: 'writing', MultiEdit: 'writing', Write: 'writing', NotebookEdit: 'writing',
  Bash: 'running', BashOutput: 'running', KillShell: 'running', KillBash: 'running',
  Task: 'delegating', Agent: 'delegating',
  WebFetch: 'browsing', WebSearch: 'browsing',
  TodoWrite: 'planning', ExitPlanMode: 'planning',
};
const kindForTool = (n) => TOOL_KIND[n] || (n.startsWith('mcp__') ? 'browsing' : 'thinking');

function describeTool(name, input) {
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
      return `${name} ${path.basename(input.file_path || input.notebook_path || '')}`;
    case 'Bash': return `$ ${short(input.command, 60)}`;
    case 'Grep': return `Search for “${short(input.pattern, 40)}”`;
    case 'Glob': return `Find ${short(input.pattern, 40)}`;
    case 'Task': case 'Agent': return `Hand off: ${short(input.description || input.prompt, 50)}`;
    case 'WebFetch': return `Open ${short(input.url, 50)}`;
    case 'WebSearch': return `Search the web for “${short(input.query, 40)}”`;
    case 'TodoWrite': return 'Update the to-do list';
    default: return short(name.replace(/^mcp__/, '').replace(/__/g, ' › '), 50);
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ');
  return '';
}

function analyze(entries) {
  const out = { kind: 'thinking', detail: '', lastPrompt: '', lastReply: '', ended: false };
  let gotActivity = false;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e || (e.type !== 'user' && e.type !== 'assistant') || e.isSidechain || !e.message) continue;
    const content = e.message.content;
    if (e.type === 'assistant') {
      const blocks = Array.isArray(content) ? content : [];
      const tool = [...blocks].reverse().find((b) => b && b.type === 'tool_use');
      const text = textOf(blocks).trim();
      if (!gotActivity) {
        gotActivity = true;
        if (tool) { out.kind = kindForTool(tool.name); out.detail = describeTool(tool.name, tool.input || {}); }
        else if (text) out.detail = short(text, 80);
        if (!tool && e.message.stop_reason === 'end_turn') out.ended = true;
      }
      if (!out.lastReply && text) out.lastReply = short(text, 400);
    } else {
      const isToolResult = Array.isArray(content) && content.some((b) => b && b.type === 'tool_result');
      if (!gotActivity) {
        gotActivity = true;
        out.detail = isToolResult ? 'Looking at the results' : 'Reading your instruction';
        if (textOf(content).startsWith('[Request interrupted')) out.ended = true;
      }
      if (!isToolResult && !e.isMeta && !out.lastPrompt) {
        const t = textOf(content).trim();
        if (t && !t.startsWith('<') && !t.startsWith('[Request interrupted')) out.lastPrompt = short(t, 400);
      }
    }
    if (gotActivity && out.lastPrompt && out.lastReply) break;
  }
  return out;
}

// ---------- celebrations: a successful git push, a new pull request ----------
const SERVER_START = Date.now();
const PUSH_CMD = /(^|[\s;&|(])git\s+(-C\s+\S+\s+)?push\b/;
const resultText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('\n') : '');
function findCelebrations(entries) {
  const pushes = new Map();
  const out = [];
  for (const e of entries) {
    if (!e) continue;
    const at = Date.parse(e.timestamp) || 0;
    if (e.type === 'pr-link' && /^https:\/\/[^\s"<>]+$/.test(e.prUrl || '')) {
      out.push({ id: `pr:${e.prUrl}`, kind: 'pr', at, number: e.prNumber, url: e.prUrl, repo: e.prRepository || '' });
      continue;
    }
    if (!e.message || e.isSidechain || !Array.isArray(e.message.content)) continue;
    for (const b of e.message.content) {
      if (!b) continue;
      if (b.type === 'tool_use' && b.name === 'Bash' && PUSH_CMD.test((b.input && b.input.command) || '')) pushes.set(b.id, true);
      else if (b.type === 'tool_result' && pushes.has(b.tool_use_id) && !b.is_error) {
        const text = resultText(b.content);
        const to = text.match(/^To\s+(\S+)/m);
        const branch = text.match(/->\s*(\S+)/);
        if (!to || !branch || /\[rejected\]|failed to push/i.test(text)) continue;
        const gh = to[1].match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(\.git)?$/);
        out.push({
          id: `push:${b.tool_use_id}`, kind: 'push', at, branch: branch[1], repo: gh ? gh[1] : '',
          url: gh ? `https://github.com/${gh[1]}/tree/${encodeURIComponent(branch[1]).replace(/%2F/g, '/')}` : '',
        });
      }
    }
  }
  return out;
}
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

// ---------- polling ----------
const memory = new Map();
const startedAt = new Map();
let snapshot = { agents: [], tmux: true, claude: CLAUDE_BIN };
let snapshotJson = '';
const clients = new Set();

async function poll() {
  const sessions = await listSessions();
  let changed = false;
  for (const [name, s] of sessions) {
    if (NAME_RE.test(name) && !saved.find((a) => a.name === name)) { saved.push({ name, cwd: s.cwd }); changed = true; }
  }
  if (changed) persist();

  const agents = [];
  for (const a of saved) {
    const s = sessions.get(a.name);
    const prev = memory.get(a.name) || {};
    const item = { name: a.name, label: a.label || a.name, cwd: a.cwd, session: PREFIX + a.name, attach: `tmux attach -t ${PREFIX}${a.name}` };
    if (!s) {
      item.state = 'stopped';
      item.detail = 'Not running';
      const st = startedAt.get(a.name);
      if (st && Date.now() - st < 10000) {
        item.error = 'Claude exited right after starting. If you picked a conversation to continue, try another one or start fresh.';
      }
    } else {
      const screen = await capture(a.name);
      const sig = paneSignals(screen);
      const file = await newestTranscript(a.cwd);
      let info = { kind: 'thinking', detail: '', lastPrompt: '', lastReply: '', ended: false };
      if (file && file.mtimeMs >= s.created - 2000) {
        const entries = await readTail(file);
        info = analyze(entries);
        item.celebrations = celebrate(a.name, entries, Math.max(SERVER_START, s.created));
      }
      const recentWrite = file && Date.now() - file.mtimeMs < 4000 && file.mtimeMs >= s.created;
      const waiting = sig.waiting && !info.ended;
      const busy = (sig.busy || recentWrite) && !info.ended;
      item.state = waiting ? 'waiting' : busy ? info.kind : 'idle';
      item.detail = waiting ? 'Needs your approval'
        : busy ? (info.detail || 'Working')
        : info.lastReply ? 'Finished, ready for more' : 'Ready for instructions';
      item.lastPrompt = info.lastPrompt;
      item.lastReply = info.lastReply;
      item.screen = screen;
    }
    const wasWorking = prev.state && !['idle', 'stopped', 'waiting'].includes(prev.state);
    item.finishedAt = item.state === 'idle' ? (wasWorking ? Date.now() : prev.finishedAt || 0) : 0;
    item.since = prev.state === item.state ? prev.since : Date.now();
    memory.set(a.name, item);
    agents.push(item);
  }
  snapshot = { agents, tmux: snapshot.tmux, claude: CLAUDE_BIN };
  const json = JSON.stringify(snapshot);
  if (json !== snapshotJson) {
    snapshotJson = json;
    for (const res of clients) res.write(`data: ${json}\n\n`);
  }
}

async function loop() {
  try { await poll(); } catch (e) { console.error('poll failed:', e.message); }
  setTimeout(loop, POLL_MS);
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

    if (req.method === 'POST' && p === '/api/agents') {
      const { name, cwd, conversation, label } = await readBody(req);
      if (!NAME_RE.test(name || '')) return send(res, 400, { error: 'Use 1–32 letters, numbers, dashes or underscores for the name.' });
      if (saved.find((a) => a.name === name)) return send(res, 409, { error: `There is already an agent called ${name}.` });
      const dir = path.resolve(expandHome(String(cwd || '').trim()));
      let st; try { st = await fsp.stat(dir); } catch {}
      if (!st || !st.isDirectory()) return send(res, 400, { error: `Folder not found: ${dir}` });
      // Save first: a poll running while tmux starts would otherwise adopt cc-<name> and we'd add it twice.
      saved.push({ name, cwd: dir, label: cleanLabel(label) || undefined });
      try { await startAgent(name, dir, conversation || ''); }
      catch (e) { saved = saved.filter((a) => a.name !== name); throw e; }
      startedAt.set(name, Date.now());
      persist();
      await poll();
      return send(res, 201, { ok: true });
    }

    const m = p.match(/^\/api\/agents\/([A-Za-z0-9_-]{1,32})(?:\/(prompt|key|start|stop|label))?$/);
    if (m) {
      const [, name, action] = m;
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
      if (req.method === 'POST' && action === 'start') {
        const { conversation } = await readBody(req);
        if (running) return send(res, 409, { error: `${name} is already running.` });
        await startAgent(name, agent.cwd, conversation || '');
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
