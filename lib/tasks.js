'use strict';
// The task board: instructions for a project rather than for one agent. A task is assigned to an idle agent in
// that project (or a new agent on its own branch), then moves along by itself from what that agent does:
// To do -> Working -> In review (its PR is open) -> Merged. Done is yours to set.
const crypto = require('crypto');

const STATUSES = ['todo', 'working', 'review', 'merged', 'done'];
const OPEN = new Set(['todo', 'working', 'review']);

function newTask({ title, text, cwd }, now = Date.now()) {
  const body = String(text || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
  if (!body) throw new Error('Write what the task is.');
  const first = body.split('\n')[0].trim();
  return {
    id: crypto.randomBytes(4).toString('hex'),
    title: String(title || '').trim().slice(0, 120) || (first.length > 80 ? `${first.slice(0, 79)}…` : first),
    text: body, cwd: String(cwd || ''), status: 'todo', agent: '', branch: '', pr: null, createdAt: now,
  };
}

// A branch name for a task's own worktree: task/<a few words>-<id>.
function branchFor(task) {
  const full = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const cut = full.length > 28 ? full.slice(0, 28).replace(/-[^-]*$/, '') : full; // whole words only
  return `task/${cut || 'task'}-${task.id.slice(0, 4)}`;
}

// An idle agent working in the task's folder that isn't already on another open task.
function pickAgent(task, agents, tasks) {
  const busy = new Set(tasks.filter((t) => OPEN.has(t.status) && t.agent && t.id !== task.id).map((t) => t.agent));
  const a = agents.find((x) => x.state === 'idle' && x.cwd === task.cwd && !busy.has(x.name));
  return a ? a.name : '';
}

// The task after looking at its agent (the floor's agent item, with git and PR).
function progress(task, agent) {
  if (!task || task.status === 'done' || !task.agent || !agent) return task;
  const git = agent.git || {}, pr = git.pr;
  const ours = pr && (!task.branch || git.branch === task.branch);
  if (ours && pr.state === 'MERGED') return { ...task, status: 'merged', pr: { number: pr.number, url: pr.url || '' } };
  if (ours && pr.state === 'OPEN') return { ...task, status: 'review', pr: { number: pr.number, url: pr.url || '' } };
  if (task.status === 'todo') return { ...task, status: 'working' };
  return task;
}

module.exports = { STATUSES, newTask, branchFor, pickAgent, progress };
