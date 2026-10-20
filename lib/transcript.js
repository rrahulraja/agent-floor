'use strict';
// Pure helpers that read Claude Code transcript entries. No I/O here, so everything is unit-tested.

const path = require('path');

function short(s, n = 70) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ');
  return '';
}

const resultText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('\n') : '');

// ---------- what kind of work is this ----------
const TOOL_KIND = {
  Read: 'reading', Grep: 'reading', Glob: 'reading', LS: 'reading', NotebookRead: 'reading',
  Edit: 'writing', MultiEdit: 'writing', Write: 'writing', NotebookEdit: 'writing',
  BashOutput: 'running', KillShell: 'running', KillBash: 'running',
  Task: 'delegating', Agent: 'delegating',
  WebFetch: 'browsing', WebSearch: 'browsing',
  TodoWrite: 'planning', ExitPlanMode: 'planning', EnterPlanMode: 'planning',
  AskUserQuestion: 'asking',
};

// Order matters: the first match wins, and tests/build are checked before the generic tool names.
const COMMAND_KINDS = [
  ['tests', /(^|[\s;&|(])(mvnw?|\.\/mvnw)\b[^|;&]*\b(test|verify)\b|\bgradlew?\b[^|;&]*\btest\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(jest|vitest|pytest|mocha)\b|\bgo\s+test\b|\bcargo\s+test\b|\bnode\s+--test\b/],
  ['build', /(^|[\s;&|(])(mvnw?|\.\/mvnw)\b[^|;&]*\b(package|install|compile|clean)\b|\bgradlew?\b[^|;&]*\b(build|assemble)\b|\b(npm|pnpm|yarn|bun)\s+run\s+build\b|\bdocker\s+build\b|\bgo\s+build\b|\bcargo\s+build\b|\btsc\b/],
  ['deploy', /(^|[\s;&|(])(kubectl|helm|terraform|tofu|eksctl|aws|gcloud|az)\b|\bdocker[\s-]compose\b/],
  ['data', /(^|[\s;&|(])(psql|clickhouse-client|clickhouse\s+client|mysql|redis-cli|mongosh)\b/],
  ['review', /(^|[\s;&|(])gh\s+pr\s+(diff|view|review|checks)\b/],
  ['git', /(^|[\s;&|(])git\s+(-C\s+\S+\s+)?(rebase|merge|cherry-pick|log|diff|reset|stash|bisect|blame|show)\b/],
];
function commandKind(cmd) {
  const c = String(cmd || '');
  for (const [kind, re] of COMMAND_KINDS) if (re.test(c)) return kind;
  return 'running';
}

function kindForTool(name, input) {
  if (name === 'Bash') return commandKind(input && input.command);
  if (name === 'Skill' && /review/i.test((input && input.skill) || '')) return 'review';
  if (TOOL_KIND[name]) return TOOL_KIND[name];
  if (name.startsWith('mcp__')) return /clickhouse|postgres|psql|mysql|sql|bigquery|snowflake/i.test(name) ? 'data' : 'browsing';
  return 'thinking';
}

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
    case 'AskUserQuestion': return short((input.questions && input.questions[0] && input.questions[0].question) || 'Has a question', 70);
    case 'Skill': return `Skill: ${short(input.skill, 40)}`;
    default: return short(name.replace(/^mcp__/, '').replace(/__/g, ' › '), 50);
  }
}

// ---------- test and build results ----------
function parseTestResult(text, isError) {
  const t = String(text || '');
  let m;
  // Maven: the last "Tests run" line is the module/overall summary.
  const mvn = [...t.matchAll(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/g)].pop();
  const mvnBuild = t.match(/BUILD (SUCCESS|FAILURE)/g);
  if (mvn || mvnBuild) {
    const failed = mvn ? Number(mvn[2]) + Number(mvn[3]) : 0;
    const failure = (mvnBuild && mvnBuild[mvnBuild.length - 1] === 'BUILD FAILURE') || failed > 0;
    const summary = mvn
      ? failed ? `${failed} failing of ${mvn[1]}` : `${Number(mvn[1]) - Number(mvn[4])} passed${Number(mvn[4]) ? `, ${mvn[4]} skipped` : ''}`
      : failure ? 'Build failed' : 'Build succeeded';
    return { outcome: failure ? 'fail' : 'pass', summary };
  }
  if ((m = t.match(/BUILD (SUCCESSFUL|FAILED)/))) {
    const g = t.match(/(\d+) tests completed, (\d+) failed/);
    return { outcome: m[1] === 'FAILED' ? 'fail' : 'pass', summary: g ? `${g[2]} failing of ${g[1]}` : m[1] === 'FAILED' ? 'Build failed' : 'Build succeeded' };
  }
  // Jest: "Tests:       2 failed, 1 skipped, 40 passed, 43 total"
  if ((m = t.match(/Tests:\s+(.*?)(\d+) total/))) {
    const failed = Number((m[1].match(/(\d+) failed/) || [])[1] || 0);
    const passed = Number((m[1].match(/(\d+) passed/) || [])[1] || 0);
    return { outcome: failed ? 'fail' : 'pass', summary: failed ? `${failed} failing of ${m[2]}` : `${passed} passed` };
  }
  // Vitest: "Tests  3 failed | 10 passed (13)"
  if ((m = t.match(/Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed[^\n]*\((\d+)\)/))) {
    const failed = Number(m[1] || 0);
    return { outcome: failed ? 'fail' : 'pass', summary: failed ? `${failed} failing of ${m[3]}` : `${m[2]} passed` };
  }
  // pytest: "==== 2 failed, 10 passed in 1.23s ===="
  if ((m = t.match(/=+ ([^=\n]*\b(?:passed|failed|error)[^=\n]*) in [\d.]+s/))) {
    const failed = Number((m[1].match(/(\d+) failed/) || [])[1] || 0) + Number((m[1].match(/(\d+) errors?/) || [])[1] || 0);
    const passed = Number((m[1].match(/(\d+) passed/) || [])[1] || 0);
    return { outcome: failed ? 'fail' : 'pass', summary: failed ? `${failed} failing` : `${passed} passed` };
  }
  // node --test: "# pass 12" / "# fail 1"
  if ((m = t.match(/^# fail (\d+)/m))) {
    const passed = Number((t.match(/^# pass (\d+)/m) || [])[1] || 0);
    const failed = Number(m[1]);
    return { outcome: failed ? 'fail' : 'pass', summary: failed ? `${failed} failing` : `${passed} passed` };
  }
  // go test
  if (/^(FAIL|--- FAIL)/m.test(t)) return { outcome: 'fail', summary: 'Tests failed' };
  if (/^ok\s+\S+/m.test(t)) return { outcome: 'pass', summary: 'Tests passed' };
  return { outcome: isError ? 'fail' : 'pass', summary: isError ? 'Failed' : 'Succeeded' };
}

// ---------- the main reading of an agent's transcript ----------
const normalizeCmd = (c) => String(c || '').replace(/\s+/g, ' ').trim();
const isMain = (e, sidechain) => e && (e.type === 'user' || e.type === 'assistant') && e.message && (sidechain || !e.isSidechain);

// Walks the tail of a transcript and returns everything the floor needs about it.
// opts.sidechain: true when reading a subagent's own file (all of its entries are sidechain entries).
function analyze(entries, opts = {}) {
  const sidechain = !!opts.sidechain;
  const out = {
    kind: 'thinking', detail: '', lastPrompt: '', lastReply: '', finalText: '', ended: false,
    question: null, usage: null, model: '', lastResult: null, looping: null, lastAt: 0,
  };

  // Forward pass: tool uses and their results, questions, test results, failure runs, usage.
  const uses = new Map(); // tool_use id -> { name, input }
  const answered = new Set();
  let pendingQuestion = null;
  let failRun = null; // { cmd, count }
  for (const e of entries) {
    if (!isMain(e, sidechain)) continue;
    const at = Date.parse(e.timestamp) || 0;
    if (at > out.lastAt) out.lastAt = at;
    const content = Array.isArray(e.message.content) ? e.message.content : [];
    if (e.type === 'assistant') {
      if (e.message.usage) { out.usage = e.message.usage; out.model = e.message.model || out.model; }
      for (const b of content) {
        if (!b || b.type !== 'tool_use') continue;
        uses.set(b.id, { name: b.name, input: b.input || {} });
        if (b.name === 'AskUserQuestion') pendingQuestion = { id: b.id, at, questions: normalizeQuestions(b.input) };
      }
    } else {
      for (const b of content) {
        if (!b || b.type !== 'tool_result') continue;
        answered.add(b.tool_use_id);
        const use = uses.get(b.tool_use_id);
        if (!use || use.name !== 'Bash') continue;
        const cmd = normalizeCmd(use.input.command);
        const kind = commandKind(cmd);
        if (kind === 'tests' || kind === 'build') {
          out.lastResult = { kind, command: short(cmd, 160), at, ...parseTestResult(resultText(b.content), !!b.is_error) };
        }
        if (b.is_error) failRun = failRun && failRun.cmd === cmd ? { cmd, count: failRun.count + 1 } : { cmd, count: 1 };
        else failRun = null;
      }
    }
  }
  if (pendingQuestion && !answered.has(pendingQuestion.id)) out.question = { kind: 'tool', ...pendingQuestion };
  if (failRun) out.looping = { command: short(failRun.cmd, 120), count: failRun.count };

  // Backward pass: current activity, last prompt and reply.
  let gotActivity = false;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!isMain(e, sidechain)) continue;
    const content = e.message.content;
    if (e.type === 'assistant') {
      const blocks = Array.isArray(content) ? content : [];
      const tool = [...blocks].reverse().find((b) => b && b.type === 'tool_use');
      const text = textOf(blocks).trim();
      if (!gotActivity) {
        gotActivity = true;
        if (tool) { out.kind = kindForTool(tool.name, tool.input || {}); out.detail = describeTool(tool.name, tool.input || {}); }
        else if (text) out.detail = short(text, 80);
        if (!tool && e.message.stop_reason === 'end_turn') { out.ended = true; out.finalText = text; }
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

  // A turn that ended on a line ending in "?" probably asks you something.
  if (!out.question && out.ended) {
    const q = proseQuestion(out.finalText);
    if (q) out.question = { kind: 'prose', text: q };
  }
  if (out.question && out.question.kind === 'tool') { out.kind = 'asking'; out.ended = false; }
  return out;
}

function normalizeQuestions(input) {
  const qs = (input && Array.isArray(input.questions)) ? input.questions : [];
  return qs.slice(0, 4).map((q) => ({
    question: short(q && q.question, 300),
    header: short(q && q.header, 24),
    multiSelect: !!(q && q.multiSelect),
    options: (q && Array.isArray(q.options) ? q.options : []).slice(0, 8).map((o) => ({ label: short(o && o.label, 80), description: short(o && o.description, 200) })),
  }));
}

function proseQuestion(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || '';
  const clean = last.replace(/[*_`]+/g, '').trim();
  return /\?\s*$/.test(clean) ? short(clean, 300) : '';
}

// Context used by the latest request: everything the model read plus what it wrote.
function contextTokens(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.output_tokens || 0);
}

// ---------- celebrations: a successful git push, a new pull request ----------
const PUSH_CMD = /(^|[\s;&|(])git\s+(-C\s+\S+\s+)?push\b/;
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

// True when the first entries of a transcript show it was started by /clear.
function startedByClear(headEntries) {
  return headEntries.some((e) => e && e.type === 'user' && /<command-name>\/clear<\/command-name>/.test(textOf(e.message && e.message.content)));
}

// A subagent's state from its own transcript and meta file.
function helperState(info, meta, mtimeMs, now, activeSeconds) {
  if (meta && meta.stoppedByUser) return 'stopped';
  if (info.ended) return 'done';
  const age = (now - mtimeMs) / 1000;
  if (age <= activeSeconds) return 'working';
  return age <= 300 ? 'working' : 'done'; // not ended but silent for 5 min: treat as gone
}

module.exports = {
  short, textOf, resultText, commandKind, kindForTool, describeTool, parseTestResult,
  analyze, proseQuestion, contextTokens, findCelebrations, startedByClear, helperState, normalizeQuestions,
};
