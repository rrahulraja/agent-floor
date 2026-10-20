# 3D office (Hermes3D-style) — design

Date: 2026-10-20. Branch: `3d-floor`.

## Intent

Rrahul wants the floor to feel like [Hermes3D](https://github.com/iamlukethedev/Hermes3D) (MIT): a whole office you
look into, where each Claude Code agent is a person who walks to the place that matches what it is doing, sits at
its desk, gathers for standups, hands work to helpers, and lazes around when idle. Agent-floor stays the engine
(tmux, transcripts, approvals, queue, helpers, usage); only the floor view changes. Hermes3D itself is not used:
it is a front end for the Hermes Agent framework and does not watch Claude Code sessions.

## Scope

- Themes in 3D: **Office** (public, built in) and **Marvel & DC heroes** (private, `~/.agent-floor/themes/heroes`).
  The built-in **Pixel office** stays as the 2D / low-power view. Mahabharata, Ramayana, Wizard school, Space saga,
  Small town 80s and the original Superheroes are removed (git history keeps them).
- Non-goals: Hermes's gateway, chat, kanban, ATM/phone/SMS screens, Spotify jukebox, furniture editor, district mode.

## Units and layout

- World units ≈ metres. Hermes layout coordinates are canvas units; `world = canvas * 0.018` (1800 canvas = 32.4 m).
- Office follows Hermes `DEFAULT_FURNITURE` (local office): meeting room top-left (round table, 6 chairs), desk rows,
  kitchen top-right (fridge, coffee, vending, water cooler, dining table), break area (couch, beanbags, ping-pong),
  server room bottom-left (2 racks + "GitHub / review station" terminal), east wing gym + QA lab, lawn and trees
  outside, plaster perimeter walls 1.65 high with cut-away look, auto-opening doors.
- Desks scale with agents: 8 by default (2 rows of 4), more rows added when agents + working helpers need them.

## Characters

Box-built "Crossy Road" figures like Hermes (`objects/agents.tsx`): legs, torso, arms with hands, box head with a
drawn face (eyes that blink, brows, mouth), hair styles, tops/bottoms, hat, glasses, headset, backpack. About 1 m tall.
- Office: each agent gets a stable random look seeded from its name.
- Heroes: each agent gets a stable hero (first come, first served, remembered in the browser); the costume comes
  from the theme's cast entry (colours, cape, mask, emblem, helmet/cowl/hood, skin, prop: shield, hammer, bow…).
- Helpers (subagents) are smaller, simpler figures (Office: interns with lanyards; Heroes: S.H.I.E.L.D. agents).

## Behaviour (state → place)

| Agent state (agent-floor) | Where it goes / what it does |
| --- | --- |
| writing, reading, thinking, planning, running, browsing, data, delegating | Its desk, sitting, typing (thinking: head tilt, think dots) |
| tests (sticky ≥ 20 s) | QA lab station, standing at a bench |
| review, git with an open PR (sticky) | Server room "GitHub / review station" |
| build, deploy (sticky) | Server racks |
| waiting (approval) | Stands at its desk, hand raised, "!" bubble, ground ring pulses amber |
| asking | Stands at its desk, "?" bubble with the question |
| done | Stands and cheers at its desk (hop + confetti) for the celebration time |
| idle < 2 min | Sits at its desk relaxed |
| idle ≥ 2 min | Wanders: coffee machine, water cooler, couch, beanbag; two idle agents may play ping-pong; sometimes the gym |
| idle ≥ 15 min | Naps on a couch, "z z z", faded |
| stopped | Walks out the door and disappears; new agents walk in through the door |

Short-lived states don't cause walking: a place change needs the new state to hold ~6 s (except waiting/asking,
which act at once at the desk). Navigation: A* on a 0.25 m grid with furniture blockers, 8-way, smoothed; agents
avoid each other with a small spatial hash and do Hermes's "bump and chat" (pause, little bubble, step aside).

## Collaboration visuals

- **Hand-off**: when helpers start, the agent stands, a glowing task card flies from it to each helper; helpers
  walk in through the door to free desks (or stand beside the agent if none), work there, then carry the card back
  and leave.
- **Standup**: the Broadcast button (and a "Standup" button on the floor HUD) gathers every running agent at the
  meeting table; each speaks in turn (speech bubble with its current task / last instruction), then all return.
- **Speech bubbles**: one speaker at a time (Hermes `speechTurns`): new questions, approvals, finished replies.
- **Janitors**: when an agent's conversation is cleared (session id changes), janitors with broom/vacuum come to its
  desk briefly.
- **Celebrations**: push/PR as now (theme icon + confetti).

## Camera and interaction

Perspective camera, FOV 40, Hermes overview direction (14,16,18). Orbit controls: left-drag rotate, right-drag pan,
wheel zoom, damping, distance and polar limits. Preset buttons: Overview, Desks, Lounge, plus Follow (double-click an
agent; Esc leaves). Click agent = select (opens the side panel as today). Hover shows a tooltip. Name plates above
heads follow the agents (DOM, with status dot, badges and context meter as today's tags). A HUD row of agent chips
(click = fly to + spotlight).

## Look

ACES tone mapping, PCF soft shadows, hemisphere + sun + fill lights, HDRI-free sky colour, light fog, daylight drift
with our time-of-day phases (evening/night dim, desk lamps and monitors glow). Post-processing (GTAO ambient
occlusion, bloom, vignette, SMAA) on "balanced/high"; off on "low". Quality auto-drops to low on software WebGL.
Dust motes. Optional synthesized chatter (Web Audio blips) when agents talk, off by default.

## Assets

Furniture: Kenney Furniture Kit (CC0), downloaded from kenney.nl, credited in `public/office/models/LICENSE.txt`.
Everything else procedural. Code ported from Hermes3D credited in file headers and `THIRD_PARTY_NOTICES.md`.

## Module boundaries (public/office/, ES modules, import map `three` + `three/addons/`)

- `nav.js` — pure JS grid A*: `createNav({ minX, minZ, maxX, maxZ, cell })` → `{ blockRect(x, z, w, d, rotY, pad), blockCircle(x, z, r), isFree(x, z), nearestFree(x, z), findPath([x,z], [x,z]) → [[x,z], ...] | null }`. Node-testable.
- `avatar.js` — `buildAvatar(profile)` → `{ root, setPose(pose), setExpression(expr), setProp(kind|null), update(t, dt, { moving }), dispose() }`; `officeProfile(seed)`, `heroProfile(castEntry, seed)`. Poses: stand, walk, sit, type, raise, cheer, dance, nap, talk, carry, pingpong, workout-run|lift|bike|box. Expressions: idle, focused, error, sleepy, happy.
- `world.js` — `buildOffice({ deskCount, quality, loadGLB })` → `{ group, anchors, blockers, doors, update(t, agentPositions), dispose() }`. Anchors: entrance, desks[{ seat:[x,z], facing, monitor }], meeting { center, seats[] }, review, qa[], servers[], kitchen[{ pos, facing, kind }], couches[], beanbags[], pingpong { sides[2], ball path }, gym[{ pos, facing, kind }], wander[].
- `engine.js` — scene, renderer, camera/controls, post-processing, agent controller (state machine, paths, bubbles, standup, hand-off, janitors, ping-pong), name plates / HUD hooks; exposes `window.Office3D` to index.html (replaces `window.Floor3D`).
