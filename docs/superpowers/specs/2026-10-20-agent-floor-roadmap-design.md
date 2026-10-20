# agent-floor — roadmap design

Date: 2026-10-20 · Owner: Rrahul · Status: draft for review

## 1. Intent

agent-floor is one local dashboard for every Claude Code agent running on the machine, across projects. Each agent is a character in a room; the room tells you at a glance who is working, who is blocked on you, and who is done. Agents are ordinary interactive `claude` processes in tmux sessions (`cc-<name>`), so you can still attach from any terminal.

The owner is a principal engineer (backend architecture, stability, scalability, DevOps) who runs several agents in parallel: Maven/Java builds and tests, ClickHouse/Postgres work, Kubernetes/Terraform/AWS, PRs and code review. The roadmap turns the floor from "who is busy" into "what needs me, what is failing, what is about to run out of room, and what got shipped", then adds themes. It will be open-sourced later under the name **agent-floor** (final name may change; keep the name in one place where practical).

## 2. Current state (what exists today)

- `server.js` (Node ≥18, zero npm dependencies): every second lists `cc-*` tmux sessions, captures each pane, tails the newest transcript in `~/.claude/projects/<encoded-cwd>/`, derives a state per agent, streams a snapshot over SSE. HTTP API on `127.0.0.1` only; every mutating request needs the `X-Agent-Floor: 1` header; `Host`/`Origin` must be localhost.
- `public/index.html`: single page, pixel-art office on a `<canvas>`, side panel (live terminal, instruction box, approve/decline, start/stop), header clock + calendar, office scene follows local time of day.
- Already built in this round: push/PR celebrations (from Bash `git push` results and `pr-link` transcript entries), display names + rename, project dropdown (`/api/projects`), resizable panel with Inter / JetBrains Mono, ai-title conversation titles, several bug fixes.
- Saved state: `~/.agent-floor/agents.json` (`{name, cwd, label?}`).
- No tests exist yet.

Transcript facts verified on real data (use these, don't rediscover):
- Main transcript: `<projects>/<encoded-cwd>/<session-id>.jsonl`. Entries have `type` (`user`, `assistant`, `pr-link`, `ai-title`, `custom-title`, `last-prompt`, `permission-mode`, `system`, …), `timestamp`, `cwd`, `isSidechain`, `message.content[]` blocks (`text`, `tool_use{id,name,input}`, `tool_result{tool_use_id,content,is_error}`), `message.stop_reason` (`end_turn` / `tool_use`), `message.usage`.
- Subagents: `<projects>/<encoded-cwd>/<session-id>/subagents/agent-<id>.jsonl` plus `agent-<id>.meta.json` = `{agentType, description, name, spawnDepth, requestShape: "background"|…, requestNonInteractive, stoppedByUser?}`.
- Questions: `tool_use` with `name: "AskUserQuestion"`, `input.questions[] = {question, header, multiSelect, options[{label, description}]}`.
- PRs: `{"type":"pr-link","prNumber":61,"prUrl":"https://github.com/…/pull/61","prRepository":"org/repo","timestamp":…}` (may repeat; dedupe by URL).
- Push: Bash result text contains `To <remote>` and `<old>..<new>  branch -> branch` (or `* [new branch]`), `is_error:false`.
- tmux argv quirks: text starting with `-` is parsed as a flag and a trailing `;` is eaten as a command separator. Any text sent to a pane must go through `load-buffer -` (stdin) + `paste-buffer`, as `sendPrompt` now does.

## 3. Goals, non-goals, anti-goals

Goals
- See, without clicking, which agents need you (permission, question), which are failing (tests/build), which are stuck, and which are near their context limit.
- Act on agents from the dashboard: answer questions, queue and broadcast instructions, reuse saved prompts, start agents in isolated git worktrees.
- Be reached when away from the dashboard (macOS notification, Slack, phone).
- Look back: per-agent timeline, daily digest for standup, search across conversations.
- A theme system: Pixel by default, switchable, and open to user-made themes.

Non-goals
- Replacing Claude Code's own UI. Attaching via tmux stays the way to do anything the dashboard doesn't cover.
- Multi-user / remote access. Local machine only.
- Managing agents that aren't in tmux (plain-terminal sessions stay view-only via their transcripts).

Anti-goals (failure even if it "works")
- Auto-approving anything. The dashboard never presses Approve on its own.
- Sending transcripts or screen dumps off the machine. Outbound alerts carry agent name, project folder name, event type and one short detail line (owner's decision: detail is allowed everywhere, e.g. the question text, the command awaiting approval, the failing test name, the branch), trimmed to ~120 characters, never more than one line.
- Writing to Claude Code's files (`~/.claude/**`). Read-only.
- A cluttered floor. Badges stay compact on the floor; detail lives in the panel.
- Adding npm dependencies. Stay zero-dependency; `node server.js` must remain the whole install.

## 4. Constraints

- Node ≥18, macOS and Linux, tmux required, `gh` and `git` optional (features that need them hide gracefully when missing or unauthenticated).
- External commands only via `execFile` with argument arrays (never shell strings). Validate every path and name that reaches a command.
- New mutating endpoints follow the existing header + localhost rules.
- Polling budget: the 1 s loop must stay cheap with ~12 agents. Anything expensive (git, `gh`, scanning many files) runs on its own slower cadence and is cached.
- Config lives in `~/.agent-floor/` as JSON (`agents.json` exists; add `config.json`, `queue.json`, `prompts.json` as needed). Missing/corrupt files fall back to defaults, never crash.
- The page stays a single static page served by the server (splitting into a few local JS/CSS files is fine); no build step, no CDN except Google Fonts already in use.

## 4a. How this document is used

Implementation plans are written one stage at a time. Stages 1–2 are specified to build-ready detail; stages 3–5 are directionally agreed and get refined (with the owner) when their turn comes, before their plan is written.

## 5. Stage 1 — Awareness

### 1.0 Foundation: bind each agent to its own session
- Today an agent's transcript is "the newest `.jsonl` in its folder", which mixes agents that share a folder and breaks most stage-1/2 features (context meter, helpers, stuck detection, timeline, the queue's idle check).
- Agents started by the floor get an explicit id: fresh start → `claude --session-id <new uuid>`; resume → the chosen id; "continue latest" → resolve the latest id first and pass `--resume <id>`. Store the current session id on the agent.
- Follow session changes (`/clear`, `/resume` inside Claude Code): when a new `.jsonl` appears in the folder after the agent's last activity and no other floor agent owns it, and the pane shows the agent was just reset, re-bind. Builder decides the exact signal; a wrong re-bind must never cause the queue to type into another agent — when ownership is ambiguous, mark the agent "session unknown" and pause its queue.
- Adopted tmux sessions not started by the floor fall back to today's newest-file rule until they can be bound.

### 1.1 "Has a question" state
- New state `asking`, distinct from `waiting` (permission).
- Detection, in order of confidence:
  1. An `AskUserQuestion` `tool_use` in the main chain with no matching `tool_result` yet → `asking`, carrying the questions and options.
  2. Turn ended (`end_turn`) and the last non-empty line of the final reply ends with `?` → `asking` (heuristic; label it "May have a question"). Owner's decision on loudness: it shows the raised hand, counts in "need you" and the tab title, and pauses that agent's queue; it does **not** fire browser, desktop, Slack or phone alerts.
- Floor: character stays at its desk, raises a hand, `?` bubble. Counted in the header's "need you" count and the tab title. Browser alert "<name> has a question".
- Panel: shows each question with its options as buttons. For a single single-select question, clicking an option sends the matching digit key. For multi-select or multi-question prompts, show the options and the keys to press, plus "Open in terminal" (copy attach command); the builder decides whether driving those from the dashboard is reliable after testing against the real Claude Code UI. For the plain-text heuristic, show the question and focus the instruction box.
- Widen allowed keys to digits 1–9 (and any keys the question UI needs, e.g. Space/Tab, only if verified necessary).
- Fixes the current bug: today a pending question shows as "Thinking" at the desk, and a prose question shows as "Finished".

### 1.2 Subagents on the floor
- For each running agent, read `<session-id>/subagents/*.meta.json` and `*.jsonl` for the current session.
- Floor: up to 3 small helper figures beside the parent's desk (+N badge beyond that), each with its own activity bubble. Helpers appear when spawned and leave when done.
- Panel: list of helpers with description, agentType, current activity (same `analyze()` logic, without the sidechain filter), state (working / done / stopped by user).
- Running = jsonl modified in the last ~10 s, or last assistant entry not `end_turn`, and not `stoppedByUser`. Builder may refine thresholds.
- Parent with running background helpers (`requestShape: "background"`) shows "Waiting on N helpers" instead of idle/done.
- Subagents can't be typed into (no tmux pane); the panel says so.

### 1.3 Context meter
- Per agent: context used = latest main-chain assistant `usage.input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (+ `output_tokens` of that message).
- Window size: builder should check whether transcripts record the model's context window or the `[1m]` variant; if not, default 200 k, treat as 1 M when usage has ever exceeded 200 k in that session, and allow a per-agent override in the panel.
- Floor: thin meter under the name tag; amber ≥ 80 %, red ≥ 90 % (mirrors the owner's 90 % hard-stop rule). Panel shows the number.

### 1.4 Stuck detection
- `stuck?` badge when an agent is in a working state but neither the transcript nor the pane has changed for N minutes (default 10, `config.json`).
- `looping?` badge when the same Bash command (normalised) has failed (`is_error`) 3+ times in a row.
- Informational only; no automatic action.

### 1.5 Activity kinds, build and test badges
- Classify Bash commands into finer kinds, used for the chip label and as theme roles:
  - tests: `mvn … test|verify`, `gradle test`, `npm|pnpm|yarn test`, `jest`, `vitest`, `pytest`, `go test`
  - build: `mvn package|install|compile`, `gradle build`, `npm run build`, `docker build`
  - deploy/infra: `kubectl`, `helm`, `terraform`, `aws`, `docker compose`
  - data: `psql`, `clickhouse-client`, ClickHouse/Postgres MCP tools
  - review: `gh pr diff|view|review`, code-review skill
  - git: `git rebase|merge|cherry-pick|log|diff`
  - other: everything else ("Running a command")
- Parse results of tests/build commands into a badge: last outcome (pass/fail), counts where available (Maven `Tests run: X, Failures: F, Errors: E, Skipped: S` + `BUILD SUCCESS/FAILURE`; Jest/Vitest `Tests: …`; pytest `N passed, M failed`; `go test` `ok`/`FAIL`; Gradle `BUILD SUCCESSFUL/FAILED`), age. Floor: small ✓/✗ badge; panel: detail + the command.

### 1.6 Git and PR status
- Per agent folder, every ~15 s: branch, uncommitted file count, ahead/behind upstream.
- Per branch, every ~60 s if `gh` is available and authenticated: PR number/URL, state, review decision, checks rollup (pass/fail/pending). Use `pr-link` entries as a hint for which PR belongs to the agent.
- Floor: compact (branch is too long for the floor — show only PR checks dot + dirty marker). Panel: full detail with links.

## 6. Stage 2 — Control

### 2.1 Instruction queue
- Per agent queue stored server-side in `~/.agent-floor/queue.json` (survives tab close and server restart).
- Dispatch the next item when the agent is idle (not working, waiting or asking) for ≥ 2 s; one item per idle transition. Pause/resume per agent. Reorder and delete in the panel.
- Sending while busy offers "Queue it" instead of typing into a working agent.

### 2.2 Saved prompts
- Global list in `~/.agent-floor/prompts.json`, editable from the UI. Seed defaults: "Run the tests and fix any failures", "/code-review", "Rebase on main and resolve conflicts", "Summarise what you changed and why".
- Shown as chips above the instruction box. Click inserts into the box; Shift+click sends (or queues, if busy).

### 2.3 Broadcast
- Pick several agents (checkbox list in a dialog), send one instruction. Idle agents receive it now; busy ones get it queued.

### 2.4 Worktree agents
- Add-agent dialog option: "New branch in its own worktree" with branch name and base (default: the repo's default branch).
- Server runs `git -C <repo> worktree add <path> -b <branch> <base>`; default path `<repo-parent>/<repo-name>.worktrees/<branch-slug>`. Agent's cwd = the worktree. Saved agent records `{repo, worktree: true}`.
- Removing such an agent offers "also remove the worktree" only when it has no uncommitted changes; never `--force`.
- Side effect: fixes "two agents in one folder share a transcript".

### 2.5 Keyboard shortcuts
- `j`/`k` next/previous agent, `/` focus instruction box, `a` approve and `d` decline (only while that agent is `waiting`), `1`–`9` pick an option (only while `asking`), `?` shortcut help. Disabled while typing in a field. No single-key interrupt.

## 7. Stage 3 — Reach you

### 3.1 macOS / desktop notifications from the server
- `osascript display notification` on macOS, `notify-send` on Linux if present.
- Events: needs approval, has a question, PR opened, pushed, stuck; "finished" optional (off by default). Toggles in `config.json` and a small settings UI.
- Only notify when no dashboard tab has been visible in the last ~30 s (page reports visibility to the server); otherwise the browser already shows it.

### 3.2 Slack / phone push
- Optional Slack incoming-webhook URL and/or ntfy topic (+ server, default `https://ntfy.sh`) in `config.json`. Off by default.
- Same events as 3.1. Payload: agent name, project folder name, event, one short detail line (question text / command / failing test / branch, trimmed to ~120 chars), PR link where relevant. Nothing else (see anti-goals).
- Because the detail line can contain work content and ntfy.sh topics are effectively public, the settings UI and README must say so plainly and recommend a long random topic, ntfy access tokens, or a self-hosted ntfy server.
- Settings UI shows a "send test" button.

## 8. Stage 4 — Look back

### 4.1 Activity timeline
- Panel tab per agent: last 24 h from its transcripts — your instructions, edits (file names), commands (with kind), test/build results, pushes, PRs, helper hand-offs, questions — timestamped and grouped by turn.

### 4.2 Daily digest
- "Today" view across all Claude Code sessions modified today (not only floor agents), grouped by project: instructions given, PRs opened, pushes, test runs pass/fail, files touched. "Copy as Markdown" for standup.

### 4.3 Search across conversations
- Full-text search over transcripts in `~/.claude/projects` (user prompts, assistant text, commands, file paths). Server-side scan with a result limit and streaming/early exit; no index required initially (builder may add a cache).
- Each result: project, conversation title, timestamp, snippet; action "Start an agent on this conversation" (uses existing `--resume`).

## 9. Stage 5 — Theme system

The public repo ships the theme *system*, the **Pixel** office theme (default) and one small **example** theme whose only job is to show how a theme is built. Any other theme — including the owner's own — is a *user theme* that lives outside the repo.

- **Default and switching.** Pixel is the default. A theme picker in the header lists built-in and user themes. The choice is saved server-side in `~/.agent-floor/config.json` (`theme`), so agent-floor opens with the last-chosen theme in any browser; changing it updates all open tabs live.
- **Where themes come from.**
  - Built-in: `public/themes/<id>/` in the repo (Pixel, example).
  - User themes: `~/.agent-floor/themes/<id>/` (override with `AGENT_FLOOR_THEMES_DIR`). Never part of the repo. Dropping a folder there and reloading makes it appear in the picker.
  - The server lists both via an API and serves theme files from `/themes/<id>/…` with strict path checks (no `..`, only files inside the theme folder, allowed extensions only).
- **Theme format (declarative, my call).** A user theme is data, not code: a `theme.json` manifest plus SVG/PNG/WebP/GIF assets and an optional CSS file.
  - Manifest: `id`, `name`, `version`, `author`, `description`, `kind: "vector"`; `room` (background SVG/image, optional foreground layer, desk/seat art); `roles` — a map from every floor state/kind (planning, writing, reading, tests, build, deploy, data, review, git, running, delegating, browsing, thinking, waiting, asking, idle, done, stopped, helper) to a character asset; `celebration` assets for push and PR; optional `labels` to rename states in the UI; optional fallbacks (a role missing from the map falls back to a theme default, then to the generic label).
  - Characters are SVGs and may animate with CSS/SMIL inside the SVG. Assets are rendered as images (`<img>`), so scripts inside an SVG never run.
  - Why declarative: a theme from someone else can't run code in a page that can type into your agents. Built-in themes (Pixel) may be code because they ship with the app.
  - The engine owns everything behavioural (states, positions, walking between desk/idle spot/door, name tags, badges, bubbles, celebrations' timing, reduced-motion handling); a theme only supplies what things look like.
- **Docs for theme authors.** `docs/themes.md`: the manifest schema, the list of roles, sizes/anchor points for characters and desks, a walkthrough of the example theme, and a validator (`node server.js --check-theme <dir>`) that reports missing roles and bad files.
- **Art direction for non-pixel themes** (guidance, not enforced): flat vector, one small looping animation per role, readable at desk size; respect `prefers-reduced-motion` by providing a still frame (the engine can request it).
- Owner's personal themes and their art are described privately in `~/.agent-floor/themes/PERSONAL-THEMES.md`, not in this repository.

## 9a. Configuration (cross-cutting, built in stage 1 and extended by each stage)

Every threshold, interval and behaviour choice in this document is a setting, not a constant.

- **Where.** `~/.agent-floor/config.json`, created on first save. Defaults live in one place in the code; the file only stores what the user changed. Unknown keys are ignored, invalid values fall back to the default with a warning in the server log and the settings UI. Existing environment variables (`PORT`, `CLAUDE_CMD`, `CLAUDE_PROJECTS_DIR`) keep working and win over the file.
- **How.** A Settings screen in the dashboard (grouped like the stages, each field with its default shown and a "reset" link) writes the file through a header-protected endpoint; changes apply live without restarting where possible. Hand-editing the file also works (picked up on next poll or on restart — builder decides).
- **Settings (initial list; each stage adds its own):**

  | Setting | Default |
  |---|---|
  | `theme` | `pixel` |
  | `pollMs` | 1000 |
  | `gitPollMs` / `ghPollMs` | 15000 / 60000 |
  | `contextWindow` (fallback for unrecognised models; known models are sized from the transcript's model id) and per-agent override | 1000000 |
  | `contextWarnPct` / `contextAlertPct` | 80 / 90 |
  | `stuckMinutes` | 10 |
  | `loopingFailures` | 3 |
  | `helperActiveSeconds` (subagent counts as running) | 10 |
  | `maxHelpersShown` | 3 |
  | `proseQuestion` (`off` / `floor` / `floor+pause` / `full`) | `floor+pause` |
  | `queueIdleSeconds` | 2 |
  | `savedPromptClick` (`insert` / `send`) | `insert` |
  | `worktreePath` template | `{repoParent}/{repo}.worktrees/{branch}` |
  | `notify.events` (approval, question, pr, push, stuck, finished) | all on except `finished` |
  | `notify.desktop` / `notify.slackWebhookUrl` / `notify.ntfy` (`topic`, `server`, `token`) | on / unset / unset |
  | `notify.quietIfVisibleSeconds` | 30 |
  | `notify.detailChars` | 120 |
  | `celebrate.push` / `celebrate.pr` / `celebrate.seconds` | on / on / 5 |
  | `desksPerRow` | 4 |
  | `timelineHours` | 24 |
  | `search.maxResults` | 50 |

## 10. Open-source readiness (alongside stage 1)

- `git init`, MIT `LICENSE`, `.gitignore` (`.superpowers/`, `node_modules/`), README refreshed for new features and the security model. Commits and pushes only with the owner's explicit OK each time; author is the repo's configured user; no AI co-author trailers.
- The owner will create the GitHub repository.

## 11. Testing

- Add `node --test` tests (built-in, zero deps) with small fixture transcripts for the pure parsers: state analysis, question detection, subagent state, celebrations, command-kind classification, test/build result parsing, git porcelain parsing.
- tmux-dependent behaviour verified by running the server against a `cat` pane (pattern used during this round).

## 12. Calls made by me (please check)

- All numbers and behaviour choices below are only defaults; every one is a setting (section 9a).

- Stage order: Awareness → Control → Reach you → Look back → Themes; each stage usable on its own.
- `asking` is separate from `waiting`; prose `?` heuristic is shown as "May have a question".
- Context window default 200 k with 1 M inference + per-agent override (pending what transcripts record).
- Stuck threshold 10 min; looping = 3 identical failing commands in a row.
- Queue dispatch after 2 s idle; saved-prompt click inserts, Shift+click sends.
- Worktree path `<repo-parent>/<repo-name>.worktrees/<branch>`; never force-remove.
- Desktop notifications only when no dashboard tab was visible in the last 30 s.
- Daily digest covers all Claude Code sessions, not only floor agents.
- Plans are written per stage; stages 3–5 are refined with you before planning.
- Session binding via `claude --session-id` is the first task of stage 1; ambiguous ownership pauses the queue rather than guessing.
- User themes are declarative (manifest + SVG/images, rendered as `<img>`), so third-party themes cannot run code; built-in themes may be code.
- Repo ships Pixel + a minimal example theme only.
