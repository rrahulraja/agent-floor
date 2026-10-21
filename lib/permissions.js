'use strict';
// Claude Code's own permission rules (settings "permissions": allow / ask / deny), for the rules editor.
// Claude Code enforces them; the dashboard only reads and writes the lists. Order of strength:
// deny (blocked) > ask (always asks, even when an allow matches) > allow (runs without asking).

// A rule is a tool name, optionally with a specifier in brackets: Bash(npm test:*), Edit(src/**), Read.
// The specifier can hold anything (saved commands have quotes and brackets of their own), on one line.
const RULE = /^[A-Za-z][\w-]*(\(.+\))?$/;
const validRule = (r) => typeof r === 'string' && r.length <= 4000 && !/[\r\n]/.test(r) && RULE.test(r);
// Saved "don't ask again" commands sometimes carry a password or token typed on the command line.
const SECRET = /(PASSWORD|PASSWD|PGPASSWORD|TOKEN|SECRET|API_?KEY)\s*=\s*\S|Bearer\s+[A-Za-z0-9._-]{12,}|\b(ghp|gho|ghs|github_pat|xox[abp]|sk-ant|sk|AKIA)[-_A-Za-z0-9]{12,}|-p[^\s'"]{6,}|--password[= ]\S/;

// One-click sets of commands that are safe to run without asking.
const PRESETS = [
  { id: 'tests', label: 'Tests and builds', rules: ['Bash(npm test:*)', 'Bash(npm run test:*)', 'Bash(npm run lint:*)', 'Bash(npm run build:*)', 'Bash(node --test:*)', 'Bash(npx vitest:*)', 'Bash(npx jest:*)', 'Bash(pytest:*)', 'Bash(go test:*)', 'Bash(mvn test:*)', 'Bash(mvn compile:*)', 'Bash(./gradlew test:*)', 'Bash(./gradlew build:*)'] },
  { id: 'git-read', label: 'Git, read only', rules: ['Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git branch:*)', 'Bash(git fetch:*)', 'Bash(git rev-parse:*)'] },
  { id: 'gh-read', label: 'GitHub, read only', rules: ['Bash(gh pr view:*)', 'Bash(gh pr checks:*)', 'Bash(gh pr diff:*)', 'Bash(gh pr list:*)', 'Bash(gh run view:*)', 'Bash(gh run list:*)', 'Bash(gh issue view:*)'] },
  { id: 'look', label: 'Looking around', rules: ['Bash(ls:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(find:*)', 'Bash(wc:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(which:*)'] },
];

// Always ask before these, whatever else is allowed: they rewrite history, delete, or touch shared systems.
const GUARDRAILS = {
  id: 'guardrails', label: 'Always ask (guardrails)', rules: [
    'Bash(git push --force:*)', 'Bash(git push -f:*)', 'Bash(git push --force-with-lease:*)', 'Bash(git reset --hard:*)', 'Bash(git clean:*)',
    'Bash(git branch -D:*)', 'Bash(rm -rf:*)', 'Bash(rm -r:*)', 'Bash(gh pr merge:*)', 'Bash(gh release create:*)', 'Bash(gh repo delete:*)',
    'Bash(kubectl delete:*)', 'Bash(kubectl apply:*)', 'Bash(kubectl scale:*)', 'Bash(kubectl rollout:*)', 'Bash(kubectl edit:*)', 'Bash(kubectl patch:*)',
    'Bash(helm install:*)', 'Bash(helm upgrade:*)', 'Bash(helm uninstall:*)', 'Bash(helm rollback:*)',
    'Bash(terraform apply:*)', 'Bash(terraform destroy:*)', 'Bash(npm publish:*)', 'Bash(docker push:*)', 'Bash(aws s3 rm:*)',
  ],
};

// Allows broad enough that a guardrail should sit next to them, or that let the agent run anything.
const RISKY = [
  { test: (r) => r === 'Bash' || r === 'Bash(*)' || r === 'Bash(:*)', why: 'runs any command without asking' },
  { test: (r) => /^Bash\((bash|sh|zsh|python3?|node|ruby|perl|eval|exec|xargs|env|sudo|curl|wget|ssh)(:\*|\s\*|\*)?\)$/.test(r), why: 'can run any other command or script' },
  { test: (r) => /^Bash\(rm(:\*| \*|\*)\)$/.test(r), why: 'can delete anything' },
  { test: (r) => /^Bash\(git push(:\*| \*|\*)\)$/.test(r), why: 'also allows force pushes', coveredBy: ['Bash(git push --force:*)', 'Bash(git push -f:*)'] },
  { test: (r) => /^Bash\((kubectl|helm|terraform)(:\*| \*|\*)\)$/.test(r), why: 'can change shared infrastructure' },
];
function warnings(lists) {
  const ask = new Set(lists.ask || []), out = [];
  for (const k of ['allow', 'ask', 'deny']) for (const r of lists[k] || []) if (SECRET.test(r)) out.push({ rule: r, why: 'looks like it contains a password or token: remove it and rotate that secret', secret: true });
  for (const r of lists.allow || []) {
    const hit = RISKY.find((k) => k.test(r));
    if (hit && !(hit.coveredBy && hit.coveredBy.every((g) => ask.has(g)))) out.push({ rule: r, why: hit.why });
  }
  return out;
}

const uniq = (list) => [...new Set(list)];
// The settings object with these lists, every other key kept. Throws on a malformed rule.
function withRules(settings, lists) {
  const next = { ...(settings || {}) };
  const perms = { ...(next.permissions || {}) };
  for (const k of ['allow', 'ask', 'deny']) {
    const list = uniq((lists[k] || []).map((r) => String(r).trim()).filter(Boolean));
    const bad = list.find((r) => !validRule(r));
    if (bad) throw new Error(`"${bad}" is not a rule Claude Code understands (like Bash(npm test:*)).`);
    if (list.length) perms[k] = list; else delete perms[k];
  }
  const order = ['allow', 'ask', 'deny'];
  next.permissions = Object.fromEntries([...order.filter((k) => perms[k]).map((k) => [k, perms[k]]), ...Object.entries(perms).filter(([k]) => !order.includes(k))]);
  return next;
}

module.exports = { validRule, PRESETS, GUARDRAILS, warnings, withRules };
