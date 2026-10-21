'use strict';
// Spend guard: warns as the plan's session / weekly usage or an agent's tokens for the day run high, and says
// when queued instructions should be held so agents don't start new work and burn what's left.

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
const STALE_MS = 3600e3; // plan usage is only as fresh as the last agent that reported it

// usage: { fiveHour: { pct }, sevenDay: { pct }, at }; agents: { name: { total } } (tokens today)
// Returns { plan: null | { level, hold, why }, agents: { name: { level, hold, why } } }.
function evaluate({ usage, agents, config, now = Date.now() }) {
  const out = { plan: null, agents: {} };
  if (usage && now - (usage.at || 0) < STALE_MS) {
    const worst = [['Session (5-hour)', usage.fiveHour], ['This week', usage.sevenDay]]
      .filter(([, l]) => l && Number.isFinite(l.pct)).sort((a, b) => b[1].pct - a[1].pct)[0];
    if (worst && worst[1].pct >= config.planWarnPct) {
      const limit = worst[1].pct >= config.planHoldPct;
      out.plan = { level: limit ? 'limit' : 'warn', hold: limit && !!config.holdAtPlanLimit, why: `${worst[0]} plan usage is at ${worst[1].pct}%` };
    }
  }
  const cap = config.agentDailyTokens;
  if (cap > 0) for (const [name, t] of Object.entries(agents || {})) {
    const pct = Math.round(((t && t.total) || 0) / cap * 100);
    if (pct < config.agentWarnPct) continue;
    const limit = pct >= 100;
    out.agents[name] = { level: limit ? 'limit' : 'warn', hold: limit && !!config.holdAtAgentLimit, why: `Used ${pct}% of its daily token budget (${fmt(t.total)} of ${fmt(cap)})` };
  }
  return out;
}

module.exports = { evaluate };
