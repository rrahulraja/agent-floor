'use strict';
// Morning summary: where things stand, in a few plain lines (shown in the dashboard, optionally sent out).

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function build({ agents = [], tasks = [], yesterday = null, tokens = null, plan = null }) {
  const name = (a) => a.label || a.name;
  const needs = agents.filter((a) => a.state === 'waiting' || a.state === 'asking');
  const failing = agents.filter((a) => a.git && a.git.pr && a.git.pr.checks && a.git.pr.checks.state === 'fail');
  const stuck = agents.filter((a) => a.stuck);
  const stopped = agents.filter((a) => a.state === 'stopped').length;
  const lines = [];
  if (needs.length) lines.push(`Needs you: ${needs.map((a) => `${name(a)} (${a.detail || a.state})`).join(', ')}`);
  if (failing.length) lines.push(`PR checks failing: ${failing.map((a) => `${name(a)} PR #${a.git.pr.number} (${(a.git.pr.checks.failedChecks || []).map((c) => c.name).join(', ') || 'checks'})`).join(', ')}`);
  if (stuck.length) lines.push(`May be stuck: ${stuck.map((a) => `${name(a)} (${a.stuck.minutes} min)`).join(', ')}`);
  lines.push(`Running: ${plural(agents.length - stopped, 'agent')}${stopped ? ` (${stopped} stopped)` : ''}`);
  const count = (s) => tasks.filter((t) => t.status === s).length;
  const taskBits = [[count('todo'), 'to do'], [count('working'), 'working'], [count('review'), 'in review']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  if (taskBits.length) lines.push(`Tasks: ${taskBits.join(', ')}`);
  const projects = (yesterday && yesterday.projects) || [];
  const prs = projects.reduce((n, p) => n + (p.prs || []).length, 0), pushes = projects.reduce((n, p) => n + (p.pushes || []).length, 0);
  if (prs || pushes) lines.push(`Yesterday: ${plural(prs, 'PR')}, ${plural(pushes, 'push', 'pushes')} across ${plural(projects.length, 'project')}`);
  if (tokens && tokens.total) {
    const p = plan && [plan.fiveHour && `session ${plan.fiveHour.pct}%`, plan.sevenDay && `week ${plan.sevenDay.pct}%`].filter(Boolean).join(', ');
    lines.push(`Tokens today: ${fmt(tokens.total)} (${fmt(tokens.output)} written)${p ? ` · plan: ${p}` : ''}`);
  }
  const head = [needs.length && `${needs.length} need${needs.length === 1 ? 's' : ''} you`, failing.length && `${plural(failing.length, 'PR')} failing`].filter(Boolean);
  return { title: `Agent Floor: ${head.length ? head.join(', ') : 'all quiet'}`, lines };
}

// Is the daily summary due? time: "HH:MM" ('' = off); lastSent: when it last went out.
function due(time, now = Date.now(), lastSent = 0) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m) return false;
  const d = new Date(now), at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2])).getTime();
  return now >= at && lastSent < at;
}

module.exports = { build, due };
