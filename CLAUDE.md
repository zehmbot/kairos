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

Requires Node.js 24+ and, from the render milestone on, ffmpeg on PATH.

## Layout

```
src/server/   Fastify hub: index.ts (entry), security.ts (request guard), routes/
src/web/      React UI: components/, pages/, icons/, theme/
src/shared/   Code used by both sides (zod schemas, ports)
scripts/      Small maintenance scripts
public/       Static files copied as-is into the UI build
```

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
