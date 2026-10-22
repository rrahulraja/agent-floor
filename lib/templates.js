'use strict';
// Agent templates: a project, optional worktree and a first instruction, saved under a title so the same
// kind of agent starts in one click. Stored in ~/.agent-floor/templates.json.

const MAX = 50;
const str = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);

function clean(t) {
  if (!t || typeof t !== 'object') return null;
  const title = str(t.title, 60), cwd = str(t.cwd, 500);
  if (!title || !cwd) return null;
  const worktree = !!t.worktree;
  const firstPrompt = String(t.firstPrompt == null ? '' : t.firstPrompt).replace(/\r\n/g, '\n').replace(/^\s+/, '').slice(0, 20000);
  return { title, cwd, worktree, base: worktree ? str(t.base, 100) : '', firstPrompt };
}

// Same title (any case) replaces the old one in place, keeping its id; new ones go at the end.
function save(list, t, newId) {
  const c = clean(t);
  if (!c) return list;
  const i = (list || []).findIndex((x) => x.title.toLowerCase() === c.title.toLowerCase());
  if (i >= 0) return list.map((x, j) => (j === i ? { id: x.id, ...c } : x));
  return [...(list || []), { id: newId(), ...c }].slice(-MAX);
}

function remove(list, id) { return (list || []).filter((x) => x.id !== id); }

module.exports = { clean, save, remove };
