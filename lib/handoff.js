'use strict';
// Hand-off chains: "when agent A finishes, send its final reply (with a note) to agent B". A rule fires once,
// or every time A finishes; delivery goes through B's queue, so B gets it when it is idle.
const crypto = require('crypto');

function newRule({ from, to, note, every }, now = Date.now()) {
  from = String(from || ''); to = String(to || '');
  if (!from || !to) throw new Error('Pick the agent that hands off and the one that takes over.');
  if (from === to) throw new Error('An agent cannot hand off to itself.');
  return { id: crypto.randomBytes(4).toString('hex'), from, to, note: String(note || '').trim().slice(0, 4000), every: !!every, createdAt: now, lastFiredAt: 0, done: false };
}

// item: the floor's agent item. finishedAt is set when it goes from working to idle.
function fires(rule, item) {
  if (!rule || rule.done || !item || item.name !== rule.from || !item.finishedAt) return false;
  return item.finishedAt > Math.max(rule.createdAt, rule.lastFiredAt || 0);
}

function afterFiring(rule, finishedAt) { return { ...rule, lastFiredAt: finishedAt, done: !rule.every }; }

function promptFor(rule, item) {
  const project = String(item.cwd || '').replace(/\/+$/, '').split('/').pop();
  const reply = String(item.lastReply || '').trim().slice(0, 12000);
  return [
    rule.note || 'Take over from here.',
    `${item.label || item.name}${project ? ` (${project})` : ''} finished. ${reply ? 'Its final message:' : 'It left no final message.'}`,
    reply ? `"""\n${reply}\n"""` : '',
  ].filter(Boolean).join('\n\n');
}

module.exports = { newRule, fires, afterFiring, promptFor };
