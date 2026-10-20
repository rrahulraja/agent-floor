# Making a theme

Agent Floor ships with two themes: **Pixel office** (the default, drawn in code) and **Example office**, a small flat-vector theme whose only job is to show how a theme is built. You can make your own and drop it in a folder; it appears in the theme menu in the header.

A theme only changes how things *look*. Where agents sit, walking between desk, lounge and door, name tags, badges, celebrations and clicks all stay the same.

## Where themes live

| Folder | What goes there |
| --- | --- |
| `public/themes/<id>/` | Built-in themes that ship with Agent Floor |
| `~/.agent-floor/themes/<id>/` | Your own themes (or set `AGENT_FLOOR_THEMES_DIR`) |

The folder name must match the theme's `id`. Built-in themes win if two themes share an id, and `pixel` is reserved.

## How the built-in themes are made

All flat-vector themes except *Example office* are generated from small data files in `tools/themes/specs/` by a character builder (`tools/themes/character.js`): each character is described by skin, hair, beard, crown or hat, clothes, a prop (flute, bow, mace, wand, cauldron, walkie-talkie…), a pose and an animation. Change a spec and run:

```bash
npm run build:themes
node tools/themes/sheet.js public/themes/mahabharata /tmp/cast.svg   # a contact sheet of the whole cast
```

You can use the same builder for your own theme: add a spec file, build, then copy the generated folder to `~/.agent-floor/themes/`.

## Start from the example

```bash
cp -r public/themes/example ~/.agent-floor/themes/my-theme
# edit ~/.agent-floor/themes/my-theme/theme.json: set "id": "my-theme" and a name
node server.js --check-theme ~/.agent-floor/themes/my-theme
```

Reload the dashboard and pick it from the theme menu. The choice is saved in `~/.agent-floor/config.json`, so Agent Floor opens with it next time.

## theme.json

```json
{
  "id": "my-theme",
  "name": "My theme",
  "version": "1.0.0",
  "author": "you",
  "description": "One line shown in the theme menu.",
  "kind": "vector",
  "tint": true,
  "room": { "wall": "wall.svg", "floor": "floor.svg", "desk": "desk.svg", "lounge": "lounge.svg" },
  "roles": { "default": "person.svg", "writing": "writing.svg", "asking": "asking.svg" },
  "celebration": { "push": "push.svg", "pr": "pr.svg" },
  "labels": { "writing": "Scribbling" },
  "size": { "sit": 30, "helper": 12 }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | 1–40 lowercase letters, digits or dashes; same as the folder name |
| `name` | yes | Shown in the theme menu |
| `kind` | yes | Always `"vector"` (images); only the built-in Pixel theme is code |
| `room.desk` | yes | One desk, drawn at every seat |
| `room.wall` | no | Repeated across the top wall (stretched to the wall's height) |
| `room.floor` | no | Floor tile, repeated |
| `room.lounge` | no | The corner where idle agents relax |
| `room.wallColor`, `room.floorColor` | no | Colours behind the images (`#rrggbb`) |
| `roles.default` | yes | The character used for any role you don't provide |
| `roles.<role>` | no | The character for one role (list below) |
| `celebration.push`, `celebration.pr` | no | Shown above an agent when it pushes or opens a PR |
| `labels.<role>` | no | Replaces the text on the name tag for that role |
| `tint` | no | `true` gives each agent its own colour by rotating the image's hue |
| `size.sit` | no | Character width in floor units (default 30; a desk is 64) |
| `size.helper` | no | Helper (subagent) width in floor units (default 14) |
| `size.aspect` | no | Character height ÷ width (default 4/3); the bottom edge sits on the seat |

### Roles

The character changes with what the agent is doing. Provide any of these; missing ones fall back to `default`.

| Role | When |
| --- | --- |
| `thinking`, `planning` | Thinking, writing a plan or to-do list |
| `reading` | Reading or searching files |
| `writing` | Editing code |
| `running` | Running a command |
| `tests`, `build` | Running tests, building (mvn, gradle, npm, pytest, go…) |
| `deploy` | kubectl, helm, terraform, aws, docker compose |
| `data` | psql, clickhouse-client, SQL/ClickHouse tools |
| `review` | Reviewing a pull request |
| `git` | rebase, merge, cherry-pick, log… |
| `delegating` | Handing work to helpers (subagents) |
| `browsing` | Web or other tools |
| `waiting` | Needs your approval |
| `asking` | Has a question for you |
| `idle` | Resting in the lounge |
| `done` | Just finished |
| `helper` | The small helper figures beside a desk |

## Drawing characters

- **Files:** `.svg` (best), `.png`, `.webp`, `.gif` or `.jpg`. Names may use letters, digits, `.`, `_`, `-` and sub-folders.
- **Shape:** characters are drawn with their bottom edge on the seat and are `size.sit` floor units wide; keep a 3:4 (width:height) canvas, e.g. `viewBox="0 0 60 80"`. When sitting, the desk covers roughly the lower half, so put the face and hands in the top half.
- **Animation:** use CSS `@keyframes` or SMIL inside the SVG. Keep it small and looping: typing hands, a flute swaying, a raised hand waving. Add `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }` so people who turn motion off get a still frame.
- **No scripts:** images are shown with `<img>`, so `<script>` inside an SVG never runs, and theme files are served with a strict Content-Security-Policy. Themes can't change the rest of the page (there is no theme CSS).

## Checking a theme

```bash
node server.js --check-theme ~/.agent-floor/themes/my-theme
```

It lists missing files, unknown roles and bad names. Themes with problems don't appear in the menu.
