# Kairos: contributor guide

Kairos is a local web app for making, reviewing, editing and rendering videos that Claude Code writes as code.
A film is a web page whose `window.renderOut(t)` draws frame `t`. Kairos previews it live, collects frame notes for
Claude, and renders video files. The app UI is pixel art. The videos themselves can be any style.

## Commands

| Command                           | What it does                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Hub on http://127.0.0.1:7340 + Vite UI with hot reload on http://127.0.0.1:7341 (open this one) |
| `npm run build`                   | Typecheck, then build the UI into `dist/web`                                                    |
| `npm start`                       | Hub serving the API and the built UI on http://127.0.0.1:7340                                   |
| `npm test`                        | Vitest unit tests (`src/**/*.test.ts`)                                                          |
| `npm run lint` / `npm run format` | Biome check / fix                                                                               |
| `npm run typecheck`               | `tsc --noEmit`                                                                                  |
| `npm run favicon`                 | Regenerate `public/favicon.svg` from the hourglass icon                                         |
| `npm run setup`                   | Add the Kairos tools to Claude Code (same as Settings → Claude Code → Connect)                  |

Requires Node.js 24+ and, from the render milestone on, ffmpeg on PATH. The hub also starts the **film server** on
http://127.0.0.1:7342 (`KAIROS_FILM_PORT`). App settings live in `~/.kairos/config.json` (`KAIROS_HOME` moves them).

## Layout

```
src/server/   Fastify hub: index.ts (entry), security.ts (request guard), studio.ts (workspace + watcher),
              films.ts (scan/create), film-server.ts (serves film pages), notes.ts (frame notes),
              camera.ts (frame pictures), folder-picker.ts/.ps1 (system "choose folder" window),
              claude-cli.ts (runs `claude`: version, mcp add/remove, open a terminal),
              skills.ts (copies skills into Claude Code), renderer.ts (render queue),
              renders.ts (finished videos), ffmpeg.ts (encoders and command lines), routes/
src/mcp/      Kairos tools for Claude Code: server.ts (stdio entry), tools.ts, hub-client.ts (calls the hub)
src/web/      React UI: components/, pages/, player/, icons/, theme/
src/film/     bridge.js: plain JS the film server adds to every film page
src/shared/   Code used by both sides (zod schemas, ports, film-protocol.ts, marks.ts)
templates/    Starter film copied by "New film" ({{placeholders}} are filled in)
skills/       The Kairos skills for Claude Code (SKILL.md + supporting files; not formatted by Biome)
scripts/      Small maintenance scripts
public/       Static files copied as-is into the UI build
```

## Films

A film is a folder in `<workspace>/films/` with `kairos.json` (title, size, fps 1 to 120, duration, status,
page) and a page that defines `window.renderOut(t)`, a pure function of `t` that may return a Promise. The film
server serves it on its own origin (so film code can't reach the API), never caches, and injects
`src/film/bridge.js`. The player talks to the bridge with `postMessage` (`src/shared/film-protocol.ts`): it sends
`seek`, the film answers `frame`. File changes reach the UI as Server-Sent Events on `/api/events` and reload the
preview. The app changes `kairos.json` only through `changeFilm` in `src/server/films.ts`, which keeps unknown
fields and never touches a broken file.

**Frame notes** live in the film folder: `.kairos/notes.json` and `.kairos/notes/<id>.png` (live reload ignores
`.kairos/`). Times are in seconds and marks are in film pixels. Only the hub writes notes (`src/server/notes.ts`:
one write at a time, atomic, and it never overwrites a broken file). The **frame camera** (`src/server/camera.ts`,
puppeteer-core with the installed Chrome or Edge, or `KAIROS_BROWSER`) opens the film page headless, calls
`window.__kairos.render(t)` from the bridge, adds the marks SVG from `src/shared/marks.ts` and takes a PNG.
The player overlay draws marks from the same `markGeometry`, so both look the same.

## Rendering

`src/server/renderer.ts` turns a film into `renders/<id>-v<N>.mp4` (versions only go up; the list is
`.kairos/renders.json`, `src/server/renders.ts`). Frames are split into chunks of about 4 s. Up to 4 workers
(about one per 3 CPU cores) each start **their own hidden browser**: one browser takes screenshots one at a time,
so separate browsers are about 3× faster, and in a hidden browser only a window's front tab draws. Each worker
calls `window.__kairos.render(t)` per frame, takes a fast PNG and streams it into its own ffmpeg (`image2pipe`),
which writes one chunk. ffmpeg then joins the chunks without encoding again (`concat`, `-c copy`). Frame math is
shared with the player (`src/shared/frames.ts`, frame `f` at `t = f / fps`). `src/server/ffmpeg.ts` probes
which H.264 encoders really work (NVIDIA, AMD, Intel, then x264) with a 1-frame test encode. Progress goes over
SSE (`render-progress`, `renders-changed`). On this machine a 1080p film renders at about 55 frames per second.

**Sound:** `audio` in `kairos.json` is a list of tracks (`file`, `start` in seconds, `volume` 0 to 2; a single
file name also works, see `AudioTrackSchema`). `readFilm` reports missing files as the film's problem. The
preview plays one `<audio>` element per track (`src/web/player/useFilmAudio.ts`): the player's clock leads,
tracks start at their `start` and are moved back in step when they drift over 80 ms. The render mixes the
tracks while joining the chunks (`mixFilter` in `src/server/ffmpeg.ts`: `adelay`, `volume`, `amix` with
`normalize=0`, `apad`, cut with `-t` at the film's length, AAC 192k).

## Claude Code

The **Kairos tools** are an MCP server (`src/mcp/server.ts`, stdio) that Claude Code starts. Settings → Claude Code
→ Connect runs `claude mcp add --scope user kairos -- <node> <repo>/src/mcp/server.ts`. The server only calls the
hub over HTTP (`KAIROS_PORT`) and never touches files itself. Tools default to the film whose folder Claude runs
in. `kairos_notes` and `kairos_frame` return PNG pictures, which Claude sees. Keep each answer under Claude Code's
25,000-token limit: a 1280×720 picture costs about 1,200 tokens, so `kairos_notes` pages through notes. Stdout
carries the protocol, so the MCP server logs to stderr only.

**Skills** come from `skills/` (Kairos) and `~/.kairos/skills/` (the user's own). Turning one on copies it into
`~/.claude/skills/<name>/` with a `.kairos-skill` marker (source + content hash). Kairos only changes folders that
carry its marker, and the hub refreshes unedited copies at start. `KAIROS_CLAUDE_DIR` moves `~/.claude` (tests).
Skills must stay frame-exact and match the film contract; keep each `SKILL.md` under 500 lines.

**3D:** the film server serves the pinned `three` package at `/__kairos/lib/three/` (`build/` and `examples/jsm/`
only), so films use an import map. The camera starts Chrome with `--enable-unsafe-swiftshader` so WebGL works
without a GPU.

## Conventions

- **Node runs TypeScript directly** (no compile step for the server). Use only erasable syntax: no `enum`,
  `namespace` or constructor parameter properties. Import local files with their extension (`./security.ts`)
  and use `import type` for types.
- **`src/web` never imports from `src/server`.** Shared code goes in `src/shared`.
- **Validate data at the edges** with the zod schemas in `src/shared/types.ts`.
- **Security:** the hub listens on `127.0.0.1` only, and every request goes through `checkRequest`
  (Host, Origin and Sec-Fetch-Site). Never bind to `0.0.0.0` or add permissive CORS.

## Pixel UI rules

- Colors: use the role variables in `src/web/theme/tokens.css` (`--surface`, `--accent`, ...), not raw hex values.
  The palette is Sweetie-16.
- No rounded corners, gradients or blur. Borders are stepped `box-shadow` outlines (`.px-box`, `.px-btn`) sized in
  `--px` units.
- Fonts: `--font-pixel` (Press Start 2P) for headings, labels and buttons; `--font-body` (Pixelify Sans) for text.
  Pixel font sizes should be multiples of 2px (8, 10, 12, 18 ...).
- Icons are 16x16 ASCII grids in `src/web/icons/icons.ts`, drawn by `<PixelIcon>`. `#` = text color,
  `+` = accent, `.` = transparent. Render them at multiples of 16px. After changing `hourglass`, run `npm run favicon`.
- Keep screens simple for end users: plain words, one main action per panel.

## Commits

Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` ...). Don't add AI attribution trailers.
