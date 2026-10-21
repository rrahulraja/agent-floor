'use strict';
// What one helper (subagent) has been doing, from its transcript: the task it was given, the steps it took
// (commands, files read and edited, searches, what it said), and its final answer. Read-only; for the
// "watch a helper" view in the panel.

const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const base = (f) => String(f || '').split('/').pop();
const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : '');

// One line per tool call, in the words a person would use.
function toolLine(name, input = {}) {
  switch (name) {
    case 'Bash': return { kind: 'command', text: short(input.command, 160), note: short(input.description, 80) };
    case 'Read': return { kind: 'read', text: base(input.file_path) };
    case 'Edit': case 'MultiEdit': return { kind: 'edit', text: base(input.file_path) };
    case 'Write': return { kind: 'write', text: base(input.file_path) };
    case 'NotebookEdit': return { kind: 'edit', text: base(input.notebook_path) };
    case 'Grep': return { kind: 'search', text: short(`${input.pattern}${input.path ? ` in ${base(input.path)}` : ''}`, 120) };
    case 'Glob': return { kind: 'search', text: short(input.pattern, 120) };
    case 'WebFetch': return { kind: 'web', text: short(input.url, 120) };
    case 'WebSearch': return { kind: 'web', text: short(input.query, 120) };
    case 'TodoWrite': return { kind: 'plan', text: `${(input.todos || []).filter((t) => t.status === 'completed').length}/${(input.todos || []).length} to-dos done` };
    case 'Task': case 'Agent': return { kind: 'helper', text: short(input.description || input.prompt, 120) };
    default: return { kind: 'tool', text: short(`${name}${input && Object.keys(input).length ? `: ${JSON.stringify(input)}` : ''}`, 120) };
  }
}

// text: the helper's .jsonl (or its tail). Returns { task, events: [{ at, kind, text, note?, failed? }], reply, lastAt }.
function parse(text, maxEvents = 60) {
  let task = '', reply = '', lastAt = 0;
  const events = [];
  const byId = new Map(); // tool_use id -> event, to mark failures from the result
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const at = Date.parse(e.timestamp) || 0;
    if (at) lastAt = Math.max(lastAt, at);
    const msg = e.message || {};
    if (e.type === 'user') {
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) if (b && b.type === 'tool_result' && byId.has(b.tool_use_id) && b.is_error) byId.get(b.tool_use_id).failed = true;
      }
      const t = textOf(msg.content);
      if (!task && t) task = short(t, 600); // the first thing the helper was told is its task
    } else if (e.type === 'assistant' && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b.type === 'tool_use') { const ev = { at, ...toolLine(b.name, b.input) }; events.push(ev); if (b.id) byId.set(b.id, ev); }
        else if (b.type === 'text' && b.text.trim()) { events.push({ at, kind: 'say', text: short(b.text, 240) }); reply = b.text; }
      }
    }
  }
  return { task, events: events.slice(-maxEvents), reply: short(reply, 2000), lastAt };
}

module.exports = { parse, toolLine };
