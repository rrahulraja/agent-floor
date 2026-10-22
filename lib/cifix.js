'use strict';
// Auto-retry on CI failure: when an agent's PR checks fail, hand the failure to the agent to fix, at most
// `max` times per PR. A failure is identified by its failing runs, so a new push that fails again counts as
// a new try, while the same failure seen on every poll is sent once. Passing checks reset the count.

const failureKey = (checks) => {
  const fc = (checks && checks.failedChecks) || [];
  const runs = [...new Set(fc.map((c) => c.runId).filter(Boolean))].sort();
  return runs.length ? runs.join(',') : fc.map((c) => c.name).sort().join(',');
};

// rec: { pr, attempts, last, gaveUp } or undefined. Returns the new rec, whether to send now, and whether
// it just gave up (true once, so the caller can say so once).
function decide(rec, pr, max) {
  if (!pr || !pr.checks) return { send: false, gaveUp: false, rec }; // not known right now: keep the count
  if (pr.checks.state === 'pass') return { send: false, gaveUp: false, rec: undefined };
  if (rec && rec.pr !== pr.number) rec = undefined;
  if (pr.checks.state !== 'fail') return { send: false, gaveUp: false, rec };
  const key = failureKey(pr.checks);
  if (rec && rec.last === key) return { send: false, gaveUp: false, rec };
  const attempts = rec ? rec.attempts : 0;
  if (attempts >= max) {
    return { send: false, gaveUp: !(rec && rec.gaveUp), rec: { ...rec, last: key, gaveUp: true } };
  }
  return { send: true, gaveUp: false, rec: { pr: pr.number, attempts: attempts + 1, last: key, gaveUp: false } };
}

module.exports = { decide, failureKey };
