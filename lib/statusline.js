'use strict';
// Claude Code pipes a JSON description of the session to the status-line command. For Pro/Max plans it includes
// rate_limits.five_hour / seven_day (used_percentage, resets_at). We keep those for the dashboard header and
// print a compact status line. Docs: https://code.claude.com/docs/en/statusline

const pct = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : null);
const limit = (l) => (l && pct(l.used_percentage) !== null ? { pct: pct(l.used_percentage), resetsAt: Number(l.resets_at) > 0 ? Number(l.resets_at) * 1000 : 0 } : null);

// The plan usage in a status-line payload, or null when there is none.
function usageFrom(input) {
  const r = input && input.rate_limits;
  if (!r) return null;
  const fiveHour = limit(r.five_hour), sevenDay = limit(r.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay };
}

function shortModel(input) {
  const m = input && input.model;
  const name = (m && (m.display_name || m.id)) || '';
  return String(name).replace(/^Claude\s+/i, '').replace(/^claude-/, '');
}

// One line for the agent's terminal, e.g. "Opus 5.5 · ctx 16% · 5h 34% · wk 61%".
function formatLine(input) {
  const parts = [];
  const model = shortModel(input);
  if (model) parts.push(model);
  const cw = input && input.context_window;
  const used = cw && pct(cw.used_percentage);
  if (used !== null && used !== undefined) parts.push(`ctx ${used}%`);
  const u = usageFrom(input);
  if (u && u.fiveHour) parts.push(`5h ${u.fiveHour.pct}%`);
  if (u && u.sevenDay) parts.push(`wk ${u.sevenDay.pct}%`);
  return parts.join(' · ');
}

module.exports = { usageFrom, formatLine };
