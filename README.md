# Agent Floor

One local dashboard for all your Claude Code agents, across different projects. Each agent is a pixel character in a small office: it sits at its desk while working, raises its hand when it needs your approval, and goes to the couch when it's done. Click an agent to see its live terminal and send it instructions.

Nothing about Claude Code changes. Every agent is the normal interactive `claude` running in its own tmux session, so you can still attach to any of them from any terminal window and type there directly.

## Requirements

- macOS or Linux
- Node.js 18+
- tmux (`brew install tmux`)
- Claude Code installed and logged in (`claude` works in your terminal)

No npm packages to install.

## Run it

```bash
cd agent-floor
npm start            # or: node server.js
```

Open http://localhost:4777.

Options (environment variables):

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4777` | Port for the dashboard |
| `CLAUDE_CMD` | `claude` found on your PATH | Full path to the Claude Code binary |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where Claude Code keeps session transcripts |

## Using it

**Add an agent**: pick a project from the list (every folder Claude Code has history for) or type a path, and give it any name. Agent Floor starts `claude` in a tmux session called `cc-<name>` inside that folder, pinned to its own session id, so several agents can work in the same folder without mixing up their status. If you `/clear` an agent, the floor follows it to the new conversation.

**Resume a past conversation.** Once you type the folder, the Conversation menu lists that project's past Claude Code conversations, newest first, titled by Claude's summary or your first instruction. Pick one of:

- **Start fresh**: a new conversation.
- **Continue the latest**: resumes the folder's most recent conversation.
- **A specific conversation**: runs `claude --resume <session-id>`.

The same menu appears when you select a stopped agent, so you can restart it on any of its past conversations.

**Bring your own sessions.** Any tmux session whose name starts with `cc-` shows up automatically:

```bash
tmux new -s cc-billing -c ~/code/billing claude
```

**Work from any terminal.** Attach to an agent whenever you want the full Claude Code UI (the panel has a "Copy attach command" button):

```bash
tmux attach -t cc-billing     # detach again with Ctrl-b d
```

**From the dashboard you can:**

- Send an instruction (⌘/Ctrl + Enter). Multi-line text is pasted as one message.
- Answer permission prompts: Approve (Enter), Choose option 2, or Decline (Esc).
- Answer Claude's questions: when an agent asks you something, the panel shows the question and its options as buttons.
- **Queue instructions.** While an agent is busy, new instructions go into its queue and are sent one at a time when it's idle (pause, reorder or remove them in the panel). The queue survives restarts (`~/.agent-floor/queue.json`).
- **Saved prompts.** One-click chips above the instruction box ("Run the tests and fix any failures", `/code-review`, …). Click inserts, Shift+click sends; edit the list from the panel (`~/.agent-floor/prompts.json`).
- **Broadcast** one instruction to several agents from the header. Idle agents get it now; busy ones get it queued.
- **Worktree agents.** When adding an agent, tick *New branch in its own git worktree* and it starts on a fresh branch in `<repo>.worktrees/<branch>`, so several agents can work on one repo safely. Removing the agent can remove the worktree too, but only if it has no uncommitted changes; the branch is always kept.
- **Keyboard shortcuts.** `j`/`k` switch agents, `/` writes an instruction, `a`/`d` approve or decline, `1`–`9` answer a question, `?` shows the list.
- Interrupt (Esc) or Switch mode (Shift+Tab, cycles accept-edits and plan mode).
- Stop an agent, then later start it again and continue its last conversation.
- Turn on browser alerts for "needs you" and "finished" while the tab is in the background.

**What the floor shows you at a glance:**

- **Needs you**: a raised hand for a permission prompt (orange) or a question (blue `?`). A reply that just ends in a question mark counts too (configurable).
- **What kind of work**: reading, writing code, running tests, building, deploying (kubectl/helm/terraform/aws), querying data (psql, ClickHouse and other SQL tools), reviewing a PR, git work.
- **Last tests or build**: ✓/✗ with counts, parsed from Maven, Gradle, Jest, Vitest, pytest, `node --test` and `go test` output.
- **Context window**: a thin meter under each name; amber at 80 %, red at 90 %.
- **Stuck or looping**: ⏳ when a working agent hasn't changed for 10 minutes, ↻ when the same command keeps failing.
- **Helpers**: subagents appear as small figures by their parent's desk; background helpers keep the parent from looking idle.
- **Git and pull request**: branch, ahead/behind, uncommitted files, and the PR's checks and review state (needs the `gh` CLI, logged in).
- **Celebrations**: confetti and a banner when an agent pushes or opens a PR.

**Settings.** Every threshold above (context window size, warning levels, stuck minutes, how loud a "?" reply is, desks per row, refresh rates, celebrations…) is a setting. Open **Settings** in the header, or edit `~/.agent-floor/config.json`, which only stores what you changed. Each agent's context window can also be set from its panel.

Agents you add are remembered in `~/.agent-floor/agents.json`, so after a reboot they appear as stopped and you can restart them on their latest conversation with one click.

Conversations started in a plain terminal (outside tmux) can't be taken over while they're running. Exit that `claude`, then pick the conversation from the menu here and it carries on where it left off.

## How it works

Every second the server:

1. Lists tmux sessions named `cc-*`.
2. Captures the bottom of each pane. "esc to interrupt" means Claude is working; a "Do you want to…" menu means it needs you.
3. Reads the tail of the agent's own transcript in `~/.claude/projects/<folder>/<session-id>.jsonl` (and its helpers in `<session-id>/subagents/`) to tell what kind of work it is, spot questions, test results, context use and failures, and to show the last instruction and reply.
4. Every 15 s runs `git status` in each agent's folder, and every 60 s `gh pr view` for the current branch.
5. Streams the result to the browser over Server-Sent Events.

Sending instructions uses `tmux send-keys` / `paste-buffer`, exactly as if you typed them.

## Security

- The server only listens on `127.0.0.1` and rejects requests whose `Host` or `Origin` is not localhost.
- Every request that changes something needs an `X-Agent-Floor: 1` header, which stops other websites from posting to it.
- Only a fixed set of keys can be sent (Enter, Esc, 1–9, Shift+Tab, arrows).
- External commands (`tmux`, `git`, `gh`) run without a shell, with fixed arguments.
- Screen contents and transcripts never leave your machine.

Anyone with access to your user account can still type into your agents through tmux, same as without this tool.

## Known limits

- Status comes from screen text and transcripts. If a Claude Code update changes the "esc to interrupt" or permission wording, adjust `paneSignals()` in `server.js`.
- Agents you started outside Agent Floor (your own `cc-*` tmux sessions) aren't pinned to a session id, so if two of them share a folder their status can mix. Agents started from the dashboard don't have this problem.
- Questions with several parts or multiple choice are shown in the panel but answered in the terminal.
- The context window is worked out from the model in the transcript (1M for Opus/Sonnet 4.6+ and Fable, 200k for Haiku and older); set it per agent in the panel if a session runs with a smaller window.
- The office grows as you add agents; desks per row is a setting.

## Development

```bash
node --test test/*.test.js
```
