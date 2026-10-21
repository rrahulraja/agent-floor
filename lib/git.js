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
  const s = { state: 'none', passed: 0, failed: 0, pending: 0, total: 0, failedChecks: [] };
  for (const c of Array.isArray(rollup) ? rollup : []) {
    s.total++;
    const result = c.conclusion || c.state || '';
    if (c.status && c.status !== 'COMPLETED') s.pending++;
    else if (FAILED.has(result)) {
      s.failed++;
      const name = [c.workflowName, c.name || c.context].filter(Boolean).join(' / ') || 'check';
      const url = /^https:\/\/[^\s"<>]+$/.test(c.detailsUrl || c.targetUrl || '') ? (c.detailsUrl || c.targetUrl) : '';
      const run = /\/actions\/runs\/(\d+)/.exec(url);
      if (s.failedChecks.length < 10) s.failedChecks.push({ name: name.slice(0, 120), url, runId: run ? run[1] : '' });
    }
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

// The instruction sent to an agent when its PR's checks fail: what failed and the end of the failing logs.
function ciFixPrompt(pr, log) {
  const names = (pr.failedChecks || []).map((c) => c.name).join(', ') || 'a check';
  const tail = String(log || '').split('\n').slice(-150).join('\n').trim();
  return [
    `CI failed on PR #${pr.number}: ${names}.`,
    tail ? `Here is the end of the failing log:\n\n\`\`\`\n${tail}\n\`\`\`` : 'I could not fetch the log; run `gh pr checks` and `gh run view --log-failed` to see it.',
    'Find the cause, fix it, run the relevant checks locally, and push.',
  ].join('\n\n');
}

module.exports = { parseStatus, summarizeChecks, parsePr, ciFixPrompt };
