'use strict';
// Agents removed from the floor, kept so they can be brought back later on the same conversation.
// Stored newest first in ~/.agent-floor/archive.json; one entry per name and folder.

const MAX = 200;
const sameAgent = (a, b) => a.name === b.name && a.cwd === b.cwd;

function add(list, agent, now = Date.now()) {
  const entry = { name: agent.name, label: agent.label, cwd: agent.cwd, sessionId: agent.sessionId, sessions: agent.sessions, removedAt: now };
  if (agent.worktree) { entry.worktree = true; entry.repo = agent.repo; }
  const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return [clean, ...(list || []).filter((x) => !sameAgent(x, clean))].slice(0, MAX);
}

function drop(list, name, cwd) { return (list || []).filter((x) => !(x.name === name && x.cwd === cwd)); }

// The old name if nobody on the floor has it now, otherwise name-2, name-3, ...
function freeName(name, taken) {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) { const n = `${name}-${i}`.slice(0, 32); if (!used.has(n)) return n; }
}

module.exports = { add, drop, freeName };
