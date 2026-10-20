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

**Add an agent** with a name and a project folder. Agent Floor starts `claude` in a tmux session called `cc-<name>` inside that folder.

**Resume a past conversation.** Once you type the folder, the Conversation menu lists that project's past Claude Code conversations, newest first, titled by Claude's summary or your first instruction. Pick one of:

- **Start fresh**: a new conversation.
- **Continue the latest**: runs `claude --continue`.
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
- Interrupt (Esc) or Switch mode (Shift+Tab, cycles accept-edits and plan mode).
- Stop an agent, then later start it again and continue its last conversation.
- Turn on browser alerts for "needs you" and "finished" while the tab is in the background.

Agents you add are remembered in `~/.agent-floor/agents.json`, so after a reboot they appear as stopped and you can restart them on their latest conversation with one click.

Conversations started in a plain terminal (outside tmux) can't be taken over while they're running. Exit that `claude`, then pick the conversation from the menu here and it carries on where it left off.

## How it works

Every second the server:

1. Lists tmux sessions named `cc-*`.
2. Captures the bottom of each pane. "esc to interrupt" means Claude is working; a "Do you want to…" menu means it needs you.
3. Reads the tail of the newest transcript in `~/.claude/projects/<folder>/` to tell what kind of work it is (reading, editing, running a command, handing off to a sub-agent, using web or MCP tools) and to show the last instruction and reply.
4. Streams the result to the browser over Server-Sent Events.

Sending instructions uses `tmux send-keys` / `paste-buffer`, exactly as if you typed them.

## Security

- The server only listens on `127.0.0.1` and rejects requests whose `Host` or `Origin` is not localhost.
- Every request that changes something needs an `X-Agent-Floor: 1` header, which stops other websites from posting to it.
- Only a fixed set of keys can be sent (Enter, Esc, 1–3, Shift+Tab, arrows).
- Screen contents and transcripts never leave your machine.

Anyone with access to your user account can still type into your agents through tmux, same as without this tool.

## Known limits

- Status comes from screen text and transcripts. If a Claude Code update changes the "esc to interrupt" or permission wording, adjust `paneSignals()` in `server.js`.
- Two agents in the same folder share a transcript, so their activity labels can mix. Their screens and controls stay separate.
- The office shows up to 4 desks per row and grows as you add agents.
