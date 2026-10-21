'use strict';
// Tokens used per day, from Claude Code transcripts. Fed the new bytes of a .jsonl as they are written, so a
// long transcript is read once. A reply can be split over several lines that share one message id and one
// usage block, so each id is counted once.

const pad = (n) => String(n).padStart(2, '0');
// Local calendar day, "2026-10-21".
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const ZERO = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 });

function createTally() {
  const days = new Map(); // dayKey -> totals
  const seen = new Set(); // message ids already counted
  let rest = ''; // a line still being written
  function line(text) {
    if (!text.includes('"usage"')) return;
    let e; try { e = JSON.parse(text); } catch { return; }
    if (e.type !== 'assistant' || !e.message || !e.message.usage) return;
    const id = e.message.id || e.requestId || e.uuid;
    if (id) { if (seen.has(id)) return; seen.add(id); }
    const at = Date.parse(e.timestamp); if (!at) return;
    const u = e.message.usage, k = dayKey(at);
    const d = days.get(k) || ZERO();
    d.input += u.input_tokens || 0; d.cacheRead += u.cache_read_input_tokens || 0;
    d.cacheWrite += u.cache_creation_input_tokens || 0; d.output += u.output_tokens || 0;
    d.total = d.input + d.cacheRead + d.cacheWrite + d.output;
    days.set(k, d);
  }
  return {
    add(chunk) {
      const parts = (rest + chunk).split('\n');
      rest = parts.pop();
      for (const p of parts) if (p.trim()) line(p);
      // a complete JSON object with no newline yet: count it now, and don't count it again later
      if (rest.trim().endsWith('}')) { try { JSON.parse(rest); line(rest); rest = ''; } catch {} }
    },
    day(k) { return { ...(days.get(k) || ZERO()) }; },
  };
}

function sum(list) {
  const out = ZERO();
  for (const d of list) for (const k of Object.keys(out)) out[k] += d[k] || 0;
  return out;
}

module.exports = { createTally, dayKey, sum };
