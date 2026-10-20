'use strict';
// Git and GitHub status for an agent's folder. Parsing is pure; running the commands lives in server.js.

// `git status --porcelain=v2 --branch`
function parseStatus(text) {
  const out = { branch: '', upstream: '', ahead: 0, behind: 0, dirty: 0 };
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('# branch.head ')) out.branch = line.slice(14).trim();
    else if (line.startsWith('# branch.upstream ')) out.upstream = line.slice(18).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) { out.ahead = Number(m[1]); out.behind = Number(m[2]); }
    } else if (/^[12u?] /.test(line)) out.dirty++;
  }
  if (out.branch === '(detached)') out.branch = 'detached HEAD';
  return out;
}

const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR']);
const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

// statusCheckRollup from `gh pr view --json statusCheckRollup`
function summarizeChecks(rollup) {
  const s = { state: 'none', passed: 0, failed: 0, pending: 0, total: 0 };
  for (const c of Array.isArray(rollup) ? rollup : []) {
    s.total++;
    const result = c.conclusion || c.state || '';
    if (c.status && c.status !== 'COMPLETED') s.pending++;
    else if (FAILED.has(result)) s.failed++;
    else if (PASSED.has(result)) s.passed++;
    else s.pending++;
  }
  if (s.total) s.state = s.failed ? 'fail' : s.pending ? 'pending' : 'pass';
  return s;
}

function parsePr(json) {
  if (!json || !json.number) return null;
  return {
    number: json.number,
    url: /^https:\/\/[^\s"<>]+$/.test(json.url || '') ? json.url : '',
    title: String(json.title || '').slice(0, 200),
    state: json.state || '',
    draft: !!json.isDraft,
    review: json.reviewDecision || '',
    checks: summarizeChecks(json.statusCheckRollup),
  };
}

module.exports = { parseStatus, summarizeChecks, parsePr };
