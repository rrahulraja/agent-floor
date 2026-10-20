'use strict';
// Stage 4: looking back over transcripts — per-agent timeline, daily digest, search. Pure functions.

const path = require('path');
const T = require('./transcript');

const at = (e) => Date.parse(e && e.timestamp) || 0;
const userText = (e) => {
  if (!e || e.type !== 'user' || e.isMeta || !e.message) return '';
  const c = e.message.content;
  if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) return '';
  const t = T.textOf(c).trim();
  return t && !t.startsWith('<') && !t.startsWith('[Request interrupted') ? t : '';
};

// ---------- timeline: turns, newest first ----------
function timelineFrom(entries, sinceMs = 0, maxTurns = 60) {
  const turns = [];
  let turn = null;
  const uses = new Map();
  const start = (e, prompt) => { turn = { at: at(e), prompt: T.short(prompt, 300), events: [], reply: '' }; turns.push(turn); };
  const push = (ev) => {
    if (!turn) start({ timestamp: ev.at ? new Date(ev.at).toISOString() : 0 }, '');
    const last = turn.events[turn.events.length - 1];
    if (ev.type === 'edit' && last && last.type === 'edit' && last.file === ev.file) { last.count++; return; }
    turn.events.push(ev);
  };
  for (const e of entries) {
    if (!e || e.isSidechain) continue;
    const t = at(e);
    if (t && t < sinceMs) { if (e.message && Array.isArray(e.message.content)) for (const b of e.message.content) if (b && b.type === 'tool_use') uses.set(b.id, b); continue; }
    if (e.type === 'pr-link' && e.prUrl) { push({ type: 'pr', at: t, number: e.prNumber, url: e.prUrl, repo: e.prRepository || '' }); continue; }
    const prompt = userText(e);
    if (prompt) { start(e, prompt); continue; }
    if (!e.message || !Array.isArray(e.message.content)) continue;
    for (const b of e.message.content) {
      if (!b) continue;
      if (b.type === 'tool_use') {
        uses.set(b.id, b);
        const input = b.input || {};
        if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(b.name)) push({ type: 'edit', at: t, file: input.file_path || input.notebook_path || '', count: 1 });
        else if (b.name === 'Task' || b.name === 'Agent') push({ type: 'helper', at: t, text: T.short(input.description || input.prompt, 120) });
        else if (b.name === 'AskUserQuestion') push({ type: 'question', at: t, text: T.short(input.questions && input.questions[0] && input.questions[0].question, 200) });
      } else if (b.type === 'tool_result') {
        const use = uses.get(b.tool_use_id);
        if (!use || use.name !== 'Bash') continue;
        const cmd = String((use.input && use.input.command) || '');
        const kind = T.commandKind(cmd);
        const ev = { type: 'command', kind, at: t, command: T.short(cmd, 200), failed: !!b.is_error };
        if (kind === 'tests' || kind === 'build') Object.assign(ev, T.parseTestResult(T.resultText(b.content), !!b.is_error));
        const pushes = T.findCelebrations([{ message: { content: [use] } }, e]).filter((c) => c.kind === 'push');
        if (pushes.length) push({ type: 'push', at: t, branch: pushes[0].branch, url: pushes[0].url, repo: pushes[0].repo });
        else push(ev);
      } else if (b.type === 'text' && e.type === 'assistant' && turn && e.message.stop_reason === 'end_turn') {
        turn.reply = T.short(b.text, 300);
      }
    }
  }
  return turns.filter((x) => x.prompt || x.events.length).reverse().slice(0, maxTurns);
}

// ---------- digest: one day across all projects ----------
function emptyDigestProject(cwd) {
  return { cwd, name: path.basename(cwd || '') || cwd || '?', sessions: new Set(), prompts: [], prs: new Map(), pushes: new Map(), tests: { pass: 0, fail: 0 }, builds: { pass: 0, fail: 0 }, files: new Set() };
}
// acc: Map(cwd -> project). Call for every entry of a transcript, in order; `uses` is per-transcript state.
function digestAdd(acc, e, ctx) {
  if (e && e.cwd) ctx.cwd = e.cwd;
  const t = at(e);
  if (!t || t < ctx.from || t >= ctx.to || e.isSidechain) {
    if (e && e.message && Array.isArray(e.message.content)) for (const b of e.message.content) if (b && b.type === 'tool_use') ctx.uses.set(b.id, b);
    return;
  }
  if (e.cwd) ctx.cwd = e.cwd; // entries like pr-link carry no cwd: use the transcript's
  const cwd = ctx.cwd;
  if (!cwd) return;
  let p = acc.get(cwd);
  if (!p) acc.set(cwd, (p = emptyDigestProject(cwd)));
  if (e.sessionId) p.sessions.add(e.sessionId);
  if (e.type === 'pr-link' && e.prUrl) { p.prs.set(e.prUrl, { number: e.prNumber, url: e.prUrl, repo: e.prRepository || '' }); return; }
  const prompt = userText(e);
  if (prompt) { p.prompts.push(T.short(prompt, 140)); return; }
  if (!e.message || !Array.isArray(e.message.content)) return;
  for (const b of e.message.content) {
    if (!b) continue;
    if (b.type === 'tool_use') {
      ctx.uses.set(b.id, b);
      const f = b.input && (b.input.file_path || b.input.notebook_path);
      if (f && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(b.name)) p.files.add(f);
    } else if (b.type === 'tool_result') {
      const use = ctx.uses.get(b.tool_use_id);
      if (!use || use.name !== 'Bash') continue;
      const kind = T.commandKind(use.input && use.input.command);
      if (kind === 'tests' || kind === 'build') {
        const r = T.parseTestResult(T.resultText(b.content), !!b.is_error);
        p[kind === 'tests' ? 'tests' : 'builds'][r.outcome]++;
      }
      for (const c of T.findCelebrations([{ message: { content: [use] } }, e])) if (c.kind === 'push') p.pushes.set(c.branch + '@' + c.repo, { branch: c.branch, repo: c.repo, url: c.url });
    }
  }
}
function digestResult(acc) {
  return [...acc.values()].map((p) => ({
    cwd: p.cwd, name: p.name, sessions: p.sessions.size, prompts: p.prompts, prs: [...p.prs.values()], pushes: [...p.pushes.values()],
    tests: p.tests, builds: p.builds, files: p.files.size,
  })).filter((p) => p.prompts.length || p.prs.length || p.pushes.length || p.files)
    .sort((a, b) => (b.prompts.length + b.files) - (a.prompts.length + a.files));
}

// ---------- search ----------
// Returns { role, text } with a snippet around the match, or null.
function searchEntry(e, qLower) {
  if (!e || !e.message || e.isSidechain) return null;
  const candidates = [];
  const prompt = userText(e);
  if (prompt) candidates.push(['you', prompt]);
  if (Array.isArray(e.message.content)) {
    for (const b of e.message.content) {
      if (!b) continue;
      if (b.type === 'text' && e.type === 'assistant') candidates.push(['claude', b.text]);
      else if (b.type === 'tool_use') {
        const i = b.input || {};
        if (b.name === 'Bash' && i.command) candidates.push(['command', i.command]);
        const f = i.file_path || i.notebook_path || i.path;
        if (f) candidates.push([b.name.toLowerCase(), f]);
        if ((b.name === 'Edit' || b.name === 'MultiEdit') && i.new_string) candidates.push(['edit', `${path.basename(f || '')}: ${i.new_string}`]);
        if (b.name === 'Grep' && i.pattern) candidates.push(['search', i.pattern]);
      }
    }
  }
  for (const [role, text] of candidates) {
    const s = String(text || '');
    const k = s.toLowerCase().indexOf(qLower);
    if (k < 0) continue;
    const from = Math.max(0, k - 60), to = Math.min(s.length, k + qLower.length + 100);
    return { role, snippet: `${from ? '…' : ''}${s.slice(from, to).replace(/\s+/g, ' ')}${to < s.length ? '…' : ''}`, at: at(e) };
  }
  return null;
}

module.exports = { timelineFrom, digestAdd, digestResult, searchEntry, userText };
