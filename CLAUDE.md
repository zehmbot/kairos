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

Requires Node.js 24+ and, from the render milestone on, ffmpeg on PATH. The hub also starts the **film server** on
http://127.0.0.1:7342 (`KAIROS_FILM_PORT`). App settings live in `~/.kairos/config.json` (`KAIROS_HOME` moves them).

## Layout

```
src/server/   Fastify hub: index.ts (entry), security.ts (request guard), studio.ts (workspace + watcher),
              films.ts (scan/create), film-server.ts (serves film pages), notes.ts (frame notes),
              camera.ts (frame pictures), folder-picker.ts/.ps1 (system "choose folder" window), routes/
src/web/      React UI: components/, pages/, player/, icons/, theme/
src/film/     bridge.js: plain JS the film server adds to every film page
src/shared/   Code used by both sides (zod schemas, ports, film-protocol.ts, marks.ts)
templates/    Starter film copied by "New film" ({{placeholders}} are filled in)
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
