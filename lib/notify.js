'use strict';
// Stage 3: tell you about agents when you're not looking at the dashboard.
// Pure: which events happened and what the message says. The senders take injectable runners for tests.

const path = require('path');

const EVENTS = ['approval', 'question', 'pr', 'push', 'stuck', 'finished'];

const oneLine = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// prev/item: the previous and current snapshot entries for one agent.
// Returns [{ event, key, title, detail, url }]. `key` identifies the occurrence, for de-duplication.
function detectEvents(prev, item, { proseMode, detailChars = 120 } = {}) {
  if (!prev || !prev.state) return []; // first sight of an agent: nothing "happened"
  const name = item.label || item.name;
  const project = path.basename(item.cwd || '') || '';
  const where = project ? `${name} (${project})` : name;
  const out = [];
  const add = (event, key, title, detail, url) => out.push({ event, key: `${event}:${key}`, title: `${where} ${title}`, detail: oneLine(detail, detailChars), url: url || '' });

  if (item.state === 'waiting' && prev.state !== 'waiting') add('approval', item.since || 0, 'needs your approval', item.detail);
  if (item.state === 'asking' && prev.state !== 'asking' && item.question) {
    const q = item.question;
    if (q.kind === 'tool') add('question', item.since || 0, 'has a question', (q.questions && q.questions[0] && q.questions[0].question) || '');
    else if (proseMode === 'full') add('question', item.since || 0, 'may have a question', q.text);
  }
  if (item.finishedAt && item.finishedAt !== prev.finishedAt && item.state === 'idle') add('finished', item.finishedAt, 'finished', item.lastReply);
  if (item.stuck && !prev.stuck) add('stuck', item.lastChangeAt || 0, 'may be stuck', `No change for ${item.stuck.minutes} minutes while working`);
  const pr = item.git && item.git.pr, prevPr = prev.git && prev.git.pr;
  if (pr && pr.checks && pr.checks.state === 'fail' && !(prevPr && prevPr.number === pr.number && prevPr.checks && prevPr.checks.state === 'fail')) {
    add('checks', `${pr.number}:${(pr.checks.failedChecks || []).map((c) => c.name).join(',')}`, `PR #${pr.number} checks failed`, (pr.checks.failedChecks || []).map((c) => c.name).join(', '), pr.url);
  }
  const seen = new Set((prev.celebrations || []).map((c) => c.id));
  for (const c of item.celebrations || []) {
    if (seen.has(c.id)) continue;
    if (c.kind === 'pr') add('pr', c.id, `opened PR #${c.number}`, c.repo, c.url);
    else add('push', c.id, `pushed ${c.branch}`, c.repo ? `to ${c.repo}` : '', c.url);
  }
  return out;
}

// Keeps a key for a while so a flapping state doesn't notify twice.
function createDeduper(ttlMs = 10 * 60 * 1000) {
  const seen = new Map();
  return (key, now = Date.now()) => {
    for (const [k, at] of seen) if (now - at > ttlMs) seen.delete(k);
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  };
}

// ---------- senders ----------
// sound: a macOS alert sound name ('Glass', 'Ping'…), or '' / 'none' for a silent alert.
function desktopCommand(platform, title, detail, sound = '') {
  if (platform === 'darwin') {
    // Text goes in as script arguments, so nothing needs escaping.
    const say = sound && sound !== 'none'
      ? 'display notification (item 2 of argv) with title (item 1 of argv) sound name (item 3 of argv)'
      : 'display notification (item 2 of argv) with title (item 1 of argv)';
    return ['osascript', ['-e', 'on run argv', '-e', say, '-e', 'end run', title, detail || ' ', ...(sound && sound !== 'none' ? [sound] : [])]];
  }
  if (platform === 'linux') return ['notify-send', ['--app-name=Agent Floor', title, detail || '']];
  return null;
}

function slackPayload(msg) {
  return { text: `*${msg.title}*${msg.detail ? `\n${msg.detail}` : ''}${msg.url ? `\n<${msg.url}>` : ''}` };
}

function ntfyRequest({ server, topic, token }, msg) {
  const base = String(server || 'https://ntfy.sh').replace(/\/+$/, '');
  const body = { topic, title: msg.title, message: msg.detail || msg.title, tags: [{ approval: 'raised_hand', question: 'question', pr: 'tada', push: 'rocket', stuck: 'hourglass', finished: 'white_check_mark' }[msg.event] || 'robot'] };
  if (msg.url) body.click = msg.url;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { url: base, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

module.exports = { EVENTS, detectEvents, createDeduper, desktopCommand, slackPayload, ntfyRequest, oneLine };
