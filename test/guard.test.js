'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/guard');

const cfg = { planWarnPct: 80, planHoldPct: 95, holdAtPlanLimit: true, agentDailyTokens: 10_000_000, agentWarnPct: 80, holdAtAgentLimit: false };
const now = 1_000_000;

test('plan usage: a warning past the warn line, holding queues past the hold line (only when turned on)', () => {
  const quiet = G.evaluate({ usage: { fiveHour: { pct: 40 }, sevenDay: { pct: 10 }, at: now }, agents: {}, config: cfg, now });
  assert.deepEqual(quiet.plan, null);
  const warn = G.evaluate({ usage: { fiveHour: { pct: 85 }, sevenDay: { pct: 10 }, at: now }, agents: {}, config: cfg, now });
  assert.deepEqual([warn.plan.level, warn.plan.hold], ['warn', false]);
  assert.match(warn.plan.why, /session.*85%/i);
  const hold = G.evaluate({ usage: { fiveHour: { pct: 50 }, sevenDay: { pct: 96 }, at: now }, agents: {}, config: cfg, now });
  assert.deepEqual([hold.plan.level, hold.plan.hold], ['limit', true]);
  assert.match(hold.plan.why, /week/i);
  const off = G.evaluate({ usage: { sevenDay: { pct: 99 }, at: now }, agents: {}, config: { ...cfg, holdAtPlanLimit: false }, now });
  assert.deepEqual([off.plan.level, off.plan.hold], ['limit', false]);
});

test('plan usage older than an hour is not trusted', () => {
  assert.equal(G.evaluate({ usage: { fiveHour: { pct: 99 }, at: now - 2 * 3600e3 }, agents: {}, config: cfg, now }).plan, null);
});

test('per-agent daily tokens: warn, then limit (holding only when turned on); 0 turns it off', () => {
  const r = G.evaluate({ usage: null, agents: { a: { total: 8_500_000 }, b: { total: 12_000_000 }, c: { total: 100 } }, config: cfg, now });
  assert.deepEqual(r.agents.a, { level: 'warn', hold: false, why: 'Used 85% of its daily token budget (8.5M of 10.0M)' });
  assert.deepEqual([r.agents.b.level, r.agents.b.hold], ['limit', false]);
  assert.equal(r.agents.c, undefined);
  assert.deepEqual(G.evaluate({ usage: null, agents: { b: { total: 12_000_000 } }, config: { ...cfg, holdAtAgentLimit: true }, now }).agents.b.hold, true);
  assert.deepEqual(G.evaluate({ usage: null, agents: { b: { total: 12e9 } }, config: { ...cfg, agentDailyTokens: 0 }, now }).agents, {});
});
