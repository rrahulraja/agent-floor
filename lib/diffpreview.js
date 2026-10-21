'use strict';
// What an Edit / MultiEdit / Write that is waiting for your approval would change, as a diff against the file
// on disk. Built from the pending tool call in the agent's transcript; read-only.

const CONTEXT = 3; // unchanged lines shown around a change
const MAX_LINES = 400; // lines in one preview, all hunks together

// The last tool call in the main conversation that has no result yet: what the agent is waiting to run.
function pendingTool(entries) {
  const open = new Map();
  for (const e of entries || []) {
    if (!e || !e.message || e.isSidechain) continue;
    const content = Array.isArray(e.message.content) ? e.message.content : [];
    for (const b of content) {
      if (!b) continue;
      if (e.type === 'assistant' && b.type === 'tool_use') open.set(b.id, { id: b.id, name: b.name, input: b.input || {} });
      if (e.type === 'user' && b.type === 'tool_result') open.delete(b.tool_use_id);
    }
  }
  const all = [...open.values()];
  return all.length ? all[all.length - 1] : null;
}

// Line diff (longest common subsequence). Big inputs fall back to "all removed, then all added".
function lineDiff(a, b) {
  if (a.length * b.length > 400 * 400) return [...a.map((s) => ({ t: '-', s })), ...b.map((s) => ({ t: '+', s }))];
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: ' ', s: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', s: a[i++] });
    else out.push({ t: '+', s: b[j++] });
  }
  while (i < n) out.push({ t: '-', s: a[i++] });
  while (j < m) out.push({ t: '+', s: b[j++] });
  return out;
}

// Number diff lines from the given starting line numbers (old for kept/removed, new for added).
function numbered(lines, oldStart, newStart) {
  let o = oldStart, nn = newStart;
  return lines.map((l) => (l.t === '+' ? { ...l, n: nn++ } : l.t === '-' ? { ...l, n: o++ } : { ...l, n: (nn++, o++) }));
}

// Keep changes plus CONTEXT lines around them; longer unchanged runs become a gap marker.
function trim(lines) {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => { if (l.t !== ' ') for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) keep[k] = true; });
  const out = [];
  let gap = false;
  lines.forEach((l, i) => { if (keep[i]) { out.push(l); gap = false; } else if (!gap) { out.push({ t: '…', s: '' }); gap = true; } });
  return out;
}

const splitLines = (s) => String(s).split('\n');

// One edit, placed in the file when its old text can be found there.
function editHunk(fileText, oldStr, newStr) {
  const oldLines = splitLines(oldStr), newLines = splitLines(newStr);
  const body = lineDiff(oldLines, newLines);
  const at = fileText == null ? -1 : fileText.indexOf(oldStr);
  if (at < 0) return { lines: numbered(body, 1, 1), located: false };
  const all = splitLines(fileText);
  const start = fileText.slice(0, at).split('\n').length - 1; // 0-based line where the old text starts
  const end = start + oldLines.length;
  const before = all.slice(Math.max(0, start - CONTEXT), start).map((s) => ({ t: ' ', s }));
  const after = all.slice(end, end + CONTEXT).map((s) => ({ t: ' ', s }));
  const first = start - before.length + 1;
  return { lines: numbered([...before, ...body, ...after], first, first), located: true };
}

// readFile(path) -> text, or null when there is no such file.
function preview(tool, readFile) {
  if (!tool || !tool.input) return null;
  const { name, input } = tool;
  const file = input.file_path || input.notebook_path || '';
  let hunks, kind;
  if (name === 'Edit') {
    kind = 'edit'; hunks = [editHunk(readFile(file), input.old_string || '', input.new_string || '')];
  } else if (name === 'MultiEdit') {
    const text = readFile(file);
    kind = 'edit'; hunks = (input.edits || []).map((e) => editHunk(text, e.old_string || '', e.new_string || ''));
  } else if (name === 'Write') {
    const current = readFile(file);
    if (current == null) { kind = 'new'; hunks = [{ lines: numbered(splitLines(input.content || '').map((s) => ({ t: '+', s })), 1, 1), located: true }]; }
    else { kind = 'write'; hunks = [{ lines: trim(numbered(lineDiff(splitLines(current), splitLines(input.content || '')), 1, 1)), located: true }]; }
  } else return null;
  let budget = MAX_LINES, truncated = false;
  for (const h of hunks) { if (h.lines.length > budget) { h.lines = h.lines.slice(0, Math.max(0, budget)); truncated = true; } budget -= h.lines.length; }
  const count = (t) => hunks.reduce((n, h) => n + h.lines.filter((l) => l.t === t).length, 0);
  return { file, kind, hunks: hunks.filter((h) => h.lines.length), added: count('+'), removed: count('-'), truncated };
}

module.exports = { pendingTool, lineDiff, preview };
