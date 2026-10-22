'use strict';
// Worktree clean-up: which extra worktrees of a repo can be removed. Pure; git and gh run in server.js.

// `git worktree list --porcelain`. The first entry is the main checkout.
function parseList(text) {
  const out = [];
  for (const block of String(text || '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(Boolean);
    const wt = lines.find((l) => l.startsWith('worktree '));
    if (!wt) continue;
    const br = lines.find((l) => l.startsWith('branch '));
    out.push({
      path: wt.slice(9),
      branch: br ? br.slice(7).replace(/^refs\/heads\//, '') : '',
      main: out.length === 0,
      locked: lines.some((l) => l === 'locked' || l.startsWith('locked ')),
      prunable: lines.some((l) => l === 'prunable' || l.startsWith('prunable ')),
    });
  }
  return out;
}

// merged: { pr } (a merged pull request) or { ancestor: true } (already in the base branch) or null.
// agent: the name of an agent on the floor working in it, or null.
function verdict({ main, locked, branch, dirty, merged, agent }) {
  const no = (reason) => ({ canRemove: false, reason });
  if (main) return no('The main checkout of the repo');
  if (locked) return no('Locked (git worktree unlock to allow removing it)');
  if (agent) return no(`${agent} works here; remove that agent from the floor first`);
  if (!branch) return no('On no branch (detached HEAD)');
  if (dirty) return no(`${dirty} uncommitted change${dirty > 1 ? 's' : ''}`);
  if (!merged) return no('Branch not merged yet');
  return { canRemove: true, reason: '' };
}

module.exports = { parseList, verdict };
