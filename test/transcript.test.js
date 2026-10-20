'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../lib/transcript');

const ts = (s) => new Date(Date.UTC(2026, 9, 20, 10, 0, s)).toISOString();
const user = (text, s = 0, extra = {}) => ({ type: 'user', timestamp: ts(s), message: { role: 'user', content: text }, ...extra });
const tool = (id, name, input, s = 0, extra = {}) => ({ type: 'assistant', timestamp: ts(s), message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }], ...extra } });
const result = (id, text, isError = false, s = 0) => ({ type: 'user', timestamp: ts(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } });
const reply = (text, s = 0, extra = {}) => ({ type: 'assistant', timestamp: ts(s), message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }], ...extra } });

test('commandKind classifies backend, data and infra work', () => {
  assert.equal(T.commandKind('mvn -q -pl api test'), 'tests');
  assert.equal(T.commandKind('./mvnw verify'), 'tests');
  assert.equal(T.commandKind('cd web && npm test'), 'tests');
  assert.equal(T.commandKind('pytest -x tests/'), 'tests');
  assert.equal(T.commandKind('go test ./...'), 'tests');
  assert.equal(T.commandKind('mvn clean package -DskipTests'), 'build');
  assert.equal(T.commandKind('npm run build'), 'build');
  assert.equal(T.commandKind('docker build -t api .'), 'build');
  assert.equal(T.commandKind('kubectl rollout status deploy/api'), 'deploy');
  assert.equal(T.commandKind('terraform plan'), 'deploy');
  assert.equal(T.commandKind('docker compose up -d'), 'deploy');
  assert.equal(T.commandKind('psql -c "select 1"'), 'data');
  assert.equal(T.commandKind('clickhouse-client -q "select 1"'), 'data');
  assert.equal(T.commandKind('gh pr diff 42'), 'review');
  assert.equal(T.commandKind('git rebase origin/main'), 'git');
  assert.equal(T.commandKind('git -C repo log --oneline'), 'git');
  assert.equal(T.commandKind('ls -la'), 'running');
  assert.equal(T.commandKind('git push'), 'running');
});

test('kindForTool covers MCP data tools and review skills', () => {
  assert.equal(T.kindForTool('mcp__claude_ai_ClickHouse__run_select_query', {}), 'data');
  assert.equal(T.kindForTool('mcp__claude_ai_Slack__slack_send_message', {}), 'browsing');
  assert.equal(T.kindForTool('Skill', { skill: 'code-review' }), 'review');
  assert.equal(T.kindForTool('Edit', {}), 'writing');
  assert.equal(T.kindForTool('Unknown', {}), 'thinking');
});

test('parseTestResult reads Maven, Gradle, Jest, Vitest, pytest, node and go output', () => {
  assert.deepEqual(T.parseTestResult('[WARNING] Tests run: 414, Failures: 0, Errors: 0, Skipped: 6\n[INFO] BUILD SUCCESS'), { outcome: 'pass', summary: '408 passed, 6 skipped' });
  assert.deepEqual(T.parseTestResult('Tests run: 10, Failures: 2, Errors: 1, Skipped: 0\nBUILD FAILURE', true), { outcome: 'fail', summary: '3 failing of 10' });
  assert.deepEqual(T.parseTestResult('[INFO] BUILD SUCCESS'), { outcome: 'pass', summary: 'Build succeeded' });
  assert.deepEqual(T.parseTestResult('12 tests completed, 1 failed\nBUILD FAILED', true), { outcome: 'fail', summary: '1 failing of 12' });
  assert.deepEqual(T.parseTestResult('Tests:       2 failed, 1 skipped, 40 passed, 43 total'), { outcome: 'fail', summary: '2 failing of 43' });
  assert.deepEqual(T.parseTestResult('Tests:       40 passed, 40 total'), { outcome: 'pass', summary: '40 passed' });
  assert.deepEqual(T.parseTestResult(' Tests  3 failed | 10 passed (13)'), { outcome: 'fail', summary: '3 failing of 13' });
  assert.deepEqual(T.parseTestResult('==== 2 failed, 10 passed in 1.23s ===='), { outcome: 'fail', summary: '2 failing' });
  assert.deepEqual(T.parseTestResult('==== 10 passed in 0.50s ===='), { outcome: 'pass', summary: '10 passed' });
  assert.deepEqual(T.parseTestResult('# tests 5\n# pass 5\n# fail 0'), { outcome: 'pass', summary: '5 passed' });
  assert.deepEqual(T.parseTestResult('--- FAIL: TestX\nFAIL\tpkg 0.1s', true), { outcome: 'fail', summary: 'Tests failed' });
  assert.deepEqual(T.parseTestResult('ok  \tpkg\t0.2s'), { outcome: 'pass', summary: 'Tests passed' });
  assert.deepEqual(T.parseTestResult('weird output', true), { outcome: 'fail', summary: 'Failed' });
});

test('analyze: a pending AskUserQuestion makes the agent ask, an answered one does not', () => {
  const ask = tool('q1', 'AskUserQuestion', { questions: [{ question: 'Which DB?', header: 'DB', multiSelect: false, options: [{ label: 'ClickHouse', description: 'fast' }, { label: 'Postgres', description: 'safe' }] }] }, 2);
  const pending = T.analyze([user('pick a db', 1), ask]);
  assert.equal(pending.kind, 'asking');
  assert.equal(pending.question.kind, 'tool');
  assert.equal(pending.question.questions[0].options[1].label, 'Postgres');
  assert.equal(pending.ended, false);

  const answered = T.analyze([user('pick a db', 1), ask, result('q1', 'User picked ClickHouse', false, 3), tool('t2', 'Read', { file_path: '/a/b.js' }, 4)]);
  assert.equal(answered.question, null);
  assert.equal(answered.kind, 'reading');
});

test('analyze: a reply ending in a question is a prose question', () => {
  const r = T.analyze([user('do it', 1), reply('I found two options.\n\nShould I go with **option A**?', 2)]);
  assert.equal(r.ended, true);
  assert.deepEqual(r.question, { kind: 'prose', text: 'Should I go with option A?' });
  const no = T.analyze([user('do it', 1), reply('Done. All tests pass.', 2)]);
  assert.equal(no.question, null);
});

test('analyze: last test result, usage and looping failures', () => {
  const entries = [
    user('run tests', 1),
    tool('a', 'Bash', { command: 'mvn test' }, 2, { usage: { input_tokens: 10, cache_read_input_tokens: 150000, cache_creation_input_tokens: 2000, output_tokens: 500 }, model: 'claude-opus-5' }),
    result('a', 'Tests run: 5, Failures: 1, Errors: 0, Skipped: 0\nBUILD FAILURE', true, 3),
    tool('b', 'Bash', { command: 'npm  run lint' }, 4),
    result('b', 'error', true, 5),
    tool('c', 'Bash', { command: 'npm run lint' }, 6),
    result('c', 'error', true, 7),
    tool('d', 'Bash', { command: 'npm run lint' }, 8),
    result('d', 'error', true, 9),
  ];
  const r = T.analyze(entries);
  assert.equal(r.lastResult.outcome, 'fail');
  assert.equal(r.lastResult.summary, '1 failing of 5');
  assert.equal(r.lastResult.kind, 'tests');
  assert.equal(T.contextTokens(r.usage), 152510);
  assert.equal(r.model, 'claude-opus-5');
  assert.deepEqual(r.looping, { command: 'npm run lint', count: 3 });
  assert.equal(r.kind, 'thinking'); // last entry is a tool result
  assert.equal(r.detail, 'Looking at the results');

  const fixed = T.analyze([...entries, tool('e', 'Bash', { command: 'npm run lint' }, 10), result('e', 'ok', false, 11)]);
  assert.equal(fixed.looping, null);
});

test('analyze: sidechain entries are skipped for the main agent but read for helpers', () => {
  const side = { ...tool('s', 'Edit', { file_path: '/x/y.ts' }, 2), isSidechain: true };
  assert.equal(T.analyze([user('go', 1), side]).kind, 'thinking');
  assert.equal(T.analyze([{ ...user('go', 1), isSidechain: true }, side], { sidechain: true }).kind, 'writing');
});

test('findCelebrations finds pushes and PRs, skips rejected pushes', () => {
  const entries = [
    tool('p1', 'Bash', { command: 'git push -u origin feat/x' }, 1),
    result('p1', 'To github.com:acme/shop.git\n * [new branch]      feat/x -> feat/x', false, 2),
    tool('p2', 'Bash', { command: 'git push' }, 3),
    result('p2', 'To github.com:acme/shop.git\n ! [rejected]        main -> main (fetch first)', false, 4),
    { type: 'pr-link', prNumber: 42, prUrl: 'https://github.com/acme/shop/pull/42', prRepository: 'acme/shop', timestamp: ts(5) },
  ];
  const c = T.findCelebrations(entries);
  assert.equal(c.length, 2);
  assert.equal(c[0].kind, 'push');
  assert.equal(c[0].url, 'https://github.com/acme/shop/tree/feat/x');
  assert.equal(c[1].kind, 'pr');
  assert.equal(c[1].number, 42);
});

test('startedByClear spots a session that /clear started', () => {
  assert.equal(T.startedByClear([{ type: 'user', message: { content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>' } }]), true);
  assert.equal(T.startedByClear([user('hello')]), false);
});

test('helperState', () => {
  const now = 1_000_000;
  assert.equal(T.helperState({ ended: false }, { stoppedByUser: true }, now, now, 10), 'stopped');
  assert.equal(T.helperState({ ended: true }, {}, now, now, 10), 'done');
  assert.equal(T.helperState({ ended: false }, {}, now - 5000, now, 10), 'working');
  assert.equal(T.helperState({ ended: false }, {}, now - 400000, now, 10), 'done');
});
