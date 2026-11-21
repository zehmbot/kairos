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
              films.ts (scan/create), trash.ts (deleted films), film-server.ts (serves film pages),
              notes.ts (frame notes), camera.ts (frame pictures),
              folder-picker.ts/.ps1 (system "choose folder" window),
              claude-cli.ts (runs `claude`: version, mcp add/remove, open a terminal),
              skills.ts (copies skills into Claude Code), renderer.ts (render queue),
              renders.ts (finished videos), ffmpeg.ts (encoders and command lines),
              templates.ts (templates, briefs, save as template), thumbnails.ts (film card pictures),
              uploads.ts (files from the browser), assets.ts (asset library), references.ts (reference
              videos: shots and frame sheets), secrets.ts (keys in ~/.kairos/.env), fish.ts (fish.audio),
              voices.ts (a film's spoken lines), casting.ts (voices picked by type), script.ts (what the
              voices say and when), writer.ts (Write the narration: `claude -p` in the background),
              claude-run.ts (runs `claude -p` with the Kairos tools), claude-jobs.ts (make the film, an
              ask), claude-steps.ts (a tool call in plain words), activity.ts (is Claude working on a
              film), claude-hooks.ts (hooks in film folders), sounds.ts (Kairos' own sound effects,
              made from code), fx.ts (effect sounds on the Effects lane), fake-fish.ts / fake-claude.ts
              (stand-ins for tests), routes/
src/mcp/      Kairos tools for Claude Code: server.ts (stdio entry), tools.ts, hub-client.ts (calls the hub)
src/web/      React UI: components/, pages/, player/, icons/, theme/
src/film/     bridge.js: plain JS the film server adds to every film page
src/shared/   Code used by both sides (zod schemas, ports, film-protocol.ts, marks.ts)
templates/    Templates Kairos ships, one folder each: template.json + the film's files ({{placeholders}} filled in)
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

**Deleting** a film moves its folder in one step to `<workspace>/.trash/<deleted at, ms>-<id>/` (`src/server/trash.ts`),
outside `films/`, so it is never listed or watched. Restore moves it back (with a number when the name is taken);
Delete for good and Empty trash remove folders for real. A film can't be deleted while a render of it runs or waits.

**Frame notes** live in the film folder: `.kairos/notes.json` and `.kairos/notes/<id>.png` (live reload ignores
`.kairos/`). Times are in seconds and marks are in film pixels. Only the hub writes notes (`src/server/notes.ts`:
one write at a time, atomic, and it never overwrites a broken file). The **frame camera** (`src/server/camera.ts`,
puppeteer-core with the installed Chrome or Edge, or `KAIROS_BROWSER`) opens the film page headless, calls
`window.__kairos.render(t)` from the bridge, adds the marks SVG from `src/shared/marks.ts` and takes a PNG.
The player overlay draws marks from the same `markGeometry`, so both look the same.

## Templates and briefs

A **template** is a folder with a `template.json` (`TemplateFileSchema`: name, description, defaults, and
kinds of film, each with its own form of fields: `text`, `longtext`, `choice`, `number`) plus the film's files.
Kairos' own are in `templates/`, the user's in `<workspace>/templates/`. New film copies the folder (except
`template.json` and `preview.png`), fills `{{title}}`, `{{title_html}}`, `{{title_js}}`, `{{width}}`,
`{{height}}` and `{{brief}}`, and renames `CLAUDE.template.md` to `CLAUDE.md`. The answers become the film's
**brief**: `brief.md` (Markdown, for Claude) and `.kairos/brief.json` (for Edit brief), written only when something
was answered. Save as template copies a film without `.kairos/`, `renders/`, hidden files and the brief, puts the
title placeholders back in quoted script strings and `<title>`, and keeps the brief's form. Film cards show a
frame from `.kairos/thumb.png` (`src/server/thumbnails.ts`), taken again when the film's top-level files change.

Kairos' `starter` (`BLANK_TEMPLATE_ID`) is the **blank film**: New film's "Blank film" choice, and the files a new
template starts from. It is never shown as a template card. The **Templates page** edits only the user's own
templates' `template.json` (the template editor, `src/web/templateForm.ts`: question ids come from the question text
and saved ids are kept, so earlier briefs still match); Kairos' templates can only be duplicated.

**Blocky** (`templates/blocky/`) is a template with an engine: Claude writes the shot list in `story.js` (places,
shot types, the cast, faces, poses, captions) and `blocky/*.js` turns it into frames: three.js toy figures with
drawn faces, six places with day/evening/night light, framing computed for any film size, word-by-word captions
and icons on a 2D layer, and bloom, focus blur, vignette and grain. Lights stay dim and the exposure high, so only
lamps, windows and fire glow. Everything is a pure function of `t` (seeded randomness only). The `kairos-blocky`
skill is its style guide. **Real sizes and jointed figures:** `blocky/sizes.js` sets one scale (an adult figure
is 5.3 units = 1.8 m) and every prop's real size; the engine fits each prop to it (`fitSize`), places use it, and
seats sit at the figures' knee height. Figures are jointed toys (`characters.js`: neck, waist, shoulders, elbows,
wrists, hips, knees, ankles, each with a rounded cap and a range in `JOINTS`; `apply(pose)` clamps and reports
what a pose asked past a limit). **Sheets:** `sheet.html` + `blocky/sheet.js` draw the cast, poses, faces, props
or a place on one 1920×1080 picture and leave the problems their checks found (unsized or mis-sized props, joints
past their limits, parts off the body, doors, tables and seats at the wrong size) in `window.KAIROS_CHECKS`. The
film server adds the bridge to a film's other top-level pages, `GET /api/films/:id/sheet` draws one with the camera
(problems in `x-kairos-checks`), the film page's Sheets tab shows them (`hasSheets`), and Claude uses
`kairos_sheet`. **The voice leads:** `blocky/voice.js` reads the film's voices while it loads
(`kairos.json` clips, `voice/script.json`, `voice/lines.json`), and `blocky/timing.js` (`planShots`) starts each
spoken shot just before its line (a shot names it with `line`, the script line's `id`, or has the same words).
Captions show the voice's real words, and the speaker's mouth moves on them. The story's length goes to
`window.KAIROS_LENGTH`: the bridge sends it with `ready`, the film page offers **Make it N s** when it differs from
`duration`, and the frame route answers it in `x-kairos-story-length` (so `kairos_frame` tells Claude). Its
characters and world are our own: never a game's or brand's name, logos or
avatars. Biome checks the template's code too, so placeholders in `.js` are written inside strings
(`Number("{{width}}")`).

**Blocky Story** (`templates/blocky-story/`, its guide the `kairos-blocky-story` skill) is the new Blocky, built
next to the old one until it replaces it. Its engine is a copy of Blocky's, reorganized around two ideas:

- **The narration never stops.** `blocky/timing.js` (`planStory`) treats all the shots' `say` as one stream of
  words (the voice's real words, `wordStream`, or ~2.6 words per second without voices): each shot cuts in just
  before its first word and lasts until the next one's, so every moment is under the voice. A `beat` is a quick
  reaction cut in under it. The template's `template.json` sets `defaults.narration: "packed"`, which New film
  writes into `kairos.json`: the voice lines are then packed back to back (see The script).
- **Effects** (`blocky/fx.js`): a shot's `fx` lists particles (notes, sparkles, hearts, tears, sweat, anger, zzz,
  dust, magic, confetti), words in the scene (label, float, big), camera punches (punch, shake, flash) and bouncy
  motion (bounce, jump, dash), each on a word (`at`). `planEffects` times them; `actorState` and `cameraState`
  change the figures and the camera; `drawEffects` draws on the 2D layer. Each effect brings a sound:
  `window.KAIROS_SOUNDS` (`[{ key, sound, t, volume }]`) goes to Kairos with `ready` (see Sound effects). The
  sheets get an `effects` sheet, which also checks the story's effects.
- **People move** (`blocky/motion.js`): a shot's `go` walks someone to a spot, up to someone, onto a seat, or in
  and out of the picture (`off-left`, `off-right`, `off-back`), and `look` turns someone toward someone.
  - **Planning:** `planMotion` plans every walk once: stand up, turn on the spot, speed up, go around the
    furniture and people (`findPath` over each place's footprints in `blocky/layouts.js`), slow down, turn, sit
    down. People who moved, sat or lay down stay so in the next shots of the same place.
  - **Reading it:** `personState(t)` reads it back.
  - **The feet:** the gaits in `poses.js` come from leg IK (`legIK`), and their phase is the distance walked, so
    feet on the ground don't slide.
  - **The camera:** it frames walkers without their bob (follow, or hold for entrances and exits;
    `cameraSide` is shared with the planner so "off-left" is the picture's left).
  - **Lively standing:** listeners look at the talker and at walkers, and talking hands gesture on key words.
  - **Runs:** they bring dust and a `patter` sound.
  - **The Moves sheet:** it shows the gaits and the sit and stand transitions, and checks the story's walks and
    that feet don't slide.

**Blocky Cinema** (`templates/blocky-cinema/`, being tried out) is a copy of Blocky Story's engine with physics,
acting and cinematic light. Blocky Story is unchanged.

- **Physics** (`blocky/physics.js`, the only file that imports Rapier's deterministic build, served by the film
  server at `RAPIER_PATH`; `blocky/simulation.js`):
  - **Worked out once:** each run of shots in a place is a world (floor, walls, furniture `solids` from
    `layouts.js`, story.js `THINGS`, a kinematic capsule per character moved by the plan) stepped at 120 Hz
    from the start when the page loads (`ready` waits for it).
  - **Read back:** every step is kept and `sampleTrack(t)` blends the two around a frame, so any frame, in any
    order, in any render worker, gets the same physics.
- **Acting:** a shot's `act` (punch, pickUp, throw, drop) and `go` with `over` (jumps) are planned in
  `motion.js` like walks.
  - **`blocky/animation.js`** poses them: leaning into speed changes, jumps, the punch's stages, staggering,
    getting up, carrying, throwing, flinching, reactions to feelings.
  - **`blocky/figure.js`** (`figureAt`) gives anyone's whole body at any moment, with arms aimed by IK
    (`blocky/rig.js`: the rig as numbers, its frames and blending).
  - **Knock-downs:** a hard punch turns the one hit into ten jointed bodies; the engine draws them
    (`applyFrames`) and blends getting up from where they lie.
- **Never inside anything:** walks never end inside furniture (`freeSpot`), standing up makes room, and the
  planner reports people standing inside each other.
- **The camera:** it frames from the plan, and tests each shot's view at five moments against the place's meshes
  (furniture between it and anyone, or covering the picture), turning or rising to the clearest view.
- **The picture:**
  - **Lights:** a key, fill and rim light around each shot's camera, motivated lamps (spot lights with soft
    shadows), contact shadows under feet, exposure near normal.
  - **Effects:** multisampled effects (smooth edges), GTAO ambient occlusion with seeded noise, and a colour
    grade.
  - **Faces:** they crossfade.
  - **Hats:** they trim the hair under them.
- **Looks** (quality levels, `chooseLook`): draft, standard and cinematic change only the finish.
  - **The preview** (`?kairos=preview` from the film page) gets standard.
  - **Frames and renders** get cinematic.
  - **Without a graphics card,** each is one level lighter.

## Files: uploads, assets and references

The browser sends a file as the request body (`application/octet-stream`, the name in `?name=`;
`acceptUploads` in `src/server/uploads.ts`). The hub streams it to a hidden temp file, then renames it to a
clean, free name (`rain-2.mp3`), one at a time per folder; it refuses unknown types (`src/shared/media.ts`) and
files over 2 GB. The **asset library** is `<workspace>/assets/{images,videos,sounds,fonts}/`; using an asset in a
film copies it into `assets/<kind>/` (sounds into `audio/` and a track in `kairos.json`). The film page's
**Sound panel** writes `audio` with `changeFilm`, and every track file must be inside the film.
**References** live in `<film>/references/` (the watcher ignores it; Save as template leaves it out). Their list
is `.kairos/references.json`; `src/server/references.ts` finds the shots with ffmpeg scene detection, pictures
the middle of each (at most 36) and tiles them into sheets in `.kairos/references/<id>/`, in the background.
Claude sees them with `kairos_references` (6 sheets per page), and the library with `kairos_assets` and
`kairos_use_asset`.

On the film page, the side column has tabs (Claude, Notes, Sound, Voice, References, Brief, Sheets; the last one shown is
remembered per film). On wide screens the page fills the window (`App.tsx` keeps `--main-h`) and both columns
scroll by themselves, so a long side tab never pushes the timeline away. The video keeps its size. Files dropped anywhere on the page, or added with **Add**, go where they fit: dropped on the Sound or
References tab they go straight in, elsewhere Kairos asks what they are for (`src/web/filmAdd.ts`: the choices
for each kind of file and where each is sent; `POST /api/films/:id/files` puts a picture, video or font in the
film's `assets/`).

## Rendering

`src/server/renderer.ts` turns a film into `renders/<id>-v<N>.mp4` (versions only go up; the list is
`.kairos/renders.json`, `src/server/renders.ts`). Frames are split into chunks of about 4 s. Up to 4 workers
(about one per 3 CPU cores and per 1.5 GB of free memory) each start **their own hidden browser**: one browser takes screenshots one at a time,
so separate browsers are about 3× faster, and in a hidden browser only a window's front tab draws. Each worker
calls `window.__kairos.render(t)` per frame, takes a fast PNG and streams it into its own ffmpeg (`image2pipe`),
which writes one chunk. ffmpeg then joins the chunks without encoding again (`concat`, `-c copy`). Frame math is
shared with the player (`src/shared/frames.ts`, frame `f` at `t = f / fps`). `src/server/ffmpeg.ts` probes
which H.264 encoders really work (NVIDIA, AMD, Intel, then x264) with a 1-frame test encode. Progress goes over
SSE (`render-progress`, `renders-changed`). On this machine a 1080p film renders at about 55 frames per second.

**Sound:** `audio` in `kairos.json` is a list of tracks (`file`, `start` in seconds, `volume` 0 to 2, and for the
timeline `from` / `length` to trim the file, `lane`, `muted`; a single file name also works, see
`AudioTrackSchema`). `changeFilm` writes tracks short (`compactTrack`: no default values). `readFilm` reports
missing files as the film's problem. The preview plays one `<audio>` element per track
(`src/web/player/useFilmAudio.ts`): the player's clock leads, tracks start at their `start` (at `from` in the
file) and are moved back in step when they drift over 80 ms. The render mixes the tracks while joining the chunks
(`mixFilter` in `src/server/ffmpeg.ts`: `atrim` for trimmed tracks, `adelay`, `volume`, `amix` with
`normalize=0`, cut with `-t` at the film's length, AAC 192k; muted tracks are left out).

- **The join always ends:** after `amix`, the clock is counted again from the samples (`asetpts=N/SR/TB`) and
  the silence stops at the film's length (`apad=whole_dur`). ffmpeg 9 sometimes loses the mix's timestamps, and
  an endless `apad` then never reached `-t`. A looping track's input stops at the film's length too (`-t`).
- **Watching the join:** `runFfmpeg` watches its `-progress`. When the output hasn't gone forward for 60 s, the
  join is stopped and runs again, once.
- **Cancel** works in every step.

**Music under the voice:** a track with `loop` and `duck` plays its file again and again (`-stream_loop -1` in the
render, `% duration` in the preview) and gets quieter while voices talk: `src/shared/duck.ts` turns the voice clips
into talking stretches (`voiceSpans`, `talkSpans`: gaps under 0.6 s joined) and a gain curve (down to 30%, 0.25 s
ramps), used by the preview (`duckGain`, every 50 ms) and the render (`duckExpression`, a `volume` expression with
`eval=frame`). New film's "Music" (an asset) adds one; the Sound tab's "Music under the voice" turns it on.

**Sound effects** (`src/server/sounds.ts`): Kairos makes its own (whoosh, swish, pop, boing, ding, count, thud,
boom, sparkle, magic, puff, flash, chime, party, heart, patter) from code: filtered noise and pitched tones,
seeded, 44.1 kHz WAV, peaks at 0.8. `GET /api/sounds` lists them, `GET /api/sounds/:name` plays one, and a film
gets its copy in `audio/fx/` when it uses one. Effect sounds start at 65% (a volume you set is kept: `tuned`). Effect tracks have `sfx: true` and sit on the timeline's **Effects** lane:

- **A film that places sounds** (Blocky Story) sends them with `ready`; the film page puts them to
  `PUT /api/films/:id/fx`, and a render syncs them from its first page before mixing. `src/server/fx.ts`
  (`withEffectSounds`) adds new keys, moves keys whose time changed, and removes keys that are gone.
- **Your edits stay:** saving the timeline (`noteEffectEdits`) marks a placed sound you moved (`moved`: it keeps
  its place) and remembers one you deleted (`sfxRemoved` in `kairos.json`). Sounds you add (the timeline's
  **+ Effect** menu, `POST /api/films/:id/fx`, or a file dropped on the Effects lane) have no key and are never
  touched.

**Timeline:** under the player (`src/web/components/Timeline.tsx`, the math in `src/web/timeline.ts`).

- **Lanes:** video lanes on top (the highest first), the film's scenes, then sound lanes with waveforms
  (`src/web/player/waveform.ts`, read through `GET /api/films/:id/sounds/file` because the film server is another
  origin).
- **One list:** sound tracks and video clips are one draft list (`kind`). Clips move, trim and snap (playhead,
  scene and clip edges); a drag saves the last pointer position, not the last drawn one.
- **Saving:** every change saves both lists with `PUT /api/films/:id/tracks`; Undo/Redo keep the lists before.
- **Dropping:** files dropped on the timeline land at that time and lane (`?lane=`). Other new ones get a free lane
  (`nextLane`, `src/shared/lanes.ts`).

**Video clips** (`video` in `kairos.json`, `VideoClipSchema`) are the user's videos and pictures over the film:
a box of the film's shape (`size`, `x`, `y`), `fit` fill or fit, `opacity`, `fade`, and for videos their own sound.
Kairos draws them, never the film page, and three places share one layout (`src/shared/clips.ts`):

- **Preview:** `VideoLayer` (muted `<video>` and `<img>` elements over the iframe, under the marks) follows the
  player's clock. A video's sound joins the preview's audio list.
- **Render:** the join encodes again with the clips (`clipFilter`: scale, alpha, fades, `overlay` in their time),
  and a video's sound joins `mixFilter` (`probeMedia`).
- **Frame pictures:** the camera puts each clip's frame (`clipImagesAt`, `src/server/clips.ts`: ffmpeg for
  videos) into the page under the marks.

Clips are added with `POST /api/films/:id/clips` (upload), `/clips/from-asset`, or the asset `use` route with a
`start`.

## Voices

Spoken lines come from fish.audio. `src/server/fish.ts` is the only code that talks to it: voices (`GET /model`),
speech with word timings (`POST /v1/tts/stream/with-timestamp`, an SSE stream: the latest alignment of each
`chunk_seq`, moved by `chunk_audio_offset_sec`) and speech-to-text (`POST /v1/asr`). Its errors are plain words.
`FISH_AUDIO_URL` points it elsewhere (tests use `fake-fish.ts`).

**The key** (`FISH_AUDIO_API_KEY`) lives in `~/.kairos/.env` (`src/server/secrets.ts`: atomic, keeps other
lines), else in the environment or the repo's git-ignored `.env`. The hub checks a key with fish.audio before
saving it. It never goes to the browser, into an answer, a log or a film folder (status shows `…a1b2`).
Settings → Voice also picks the model; recently used voices are in `config.json`.

**A film's voices:** `voices` in `kairos.json` maps a speaker (`narrator`, `ruby`) to a fish.audio voice.
Lines are `voice/<speaker>-<n>.mp3`, each with `voice/<speaker>-<n>.words.json` (text, duration, words with
`start`/`end` in seconds from the start of the file, `source`). They are listed in `voice/lines.json`
(`src/server/voices.ts`, one change at a time). The same text, voice, speed and model reuse the line, so it is
never paid twice. File numbers are never used twice (`next`), so a new take never shares a name with an old
one: the browser caches waveforms by address. Placed lines go on the voice lane (a lane holding only `voice/`
files). Deleting a line removes its files and clips. **Get words** (speech-to-text) writes `<file>.words.json` next
to any sound. Save as template leaves `voice/` out.

**Casting** (`src/server/casting.ts`): each speaker has a type (`narrator`, `woman`, `man`, `girl`, `boy`,
`old-woman`, `old-man`), and Kairos picks a random fitting voice from fish.audio's public list (no key needed).

- **Searching:** one tag per search (several tags read as "any of"), three pages, cached for an hour.
- **Only plain voices:**
  - every tag an ordinary word;
  - a common first name or plain words as the title;
  - at least 50 likes;
  - the description agrees with the tags and doesn't name the voice itself.
    This keeps copies of real people and known characters out. The picker still shows every voice.
- **Fallbacks** for rare types: kids get a bright young woman's voice, an old woman a warm middle-aged one.
- **No repeats:** no two speakers in a film share a voice.
- **Characters keep their voice** from film to film (`voice.remembered` in `config.json`); the narrator doesn't.

**The script** (`voice/script.json`, `src/server/script.ts`) is the film's one list of spoken lines: speaker,
words, `start`, `speed` and who wrote it (`by`: `claude` or `you`; editing a line's words or speaker makes it
yours).

- **Making it** turns each line into a voice line (unchanged ones reused) and places it at its start, after the
  line before when they would overlap; the moved start is saved. `only` + `fresh` make a new take of some lines.
- **Packed narration** (`narration: "packed"` in `kairos.json`, Blocky Story): the lines go back to back in script
  order, each clip trimmed to its words (`trimToWords`: `from`/`length`), 0.12 s apart (0.28 s after a sentence),
  so the voice never stops. Starts only give the order. A timeline change that moves or removes a voice clip packs
  them again, and "Write the narration" asks Claude for continuous narration.
- **Free changes:** saving the script also places it without speaking (no credits): a new start moves the clip, a
  deleted line leaves the timeline. Lines that changed keep their old take ("out of date") until the next making.
- **Replacing clips:** `made` lists the voice lines it made, so clips and files of lines that are gone are
  replaced. Files of deleted lines stay until the next real making, so Undo costs nothing.
- **The timeline follows:** after `PUT /audio`, `syncScriptWithTimeline` moves a line to its clip's new start,
  takes it out when its clip is removed, and brings it back when the timeline's Undo restores the clip.
- **One list:** lines made one at a time (`kairos_say`) join the script, and voice lines on the timeline from
  before (`adoptLooseLines`) join it when it is read.
- **Stopping halfway:** when fish.audio stops (no credit...), what was made is still placed.

`scriptLineStatus` (`src/shared/script.ts`) says where a line stands: made, out of date (words, speaker, voice or
speed changed), not made, no voice, or not on the timeline.

**Write the narration** (`src/server/writer.ts`) runs `claude -p` in the film's folder, without a terminal:

- **What Claude can do:**
  - `--tools Read,Glob,Grep`;
  - only the Kairos tools that look (`--mcp-config` from a temp file, `--strict-mcp-config`);
  - the prompt on stdin;
  - the answer through `--json-schema`: the cast and the lines.
- **Progress:** the `stream-json` tool calls become `writer-progress` events.
- **Then Kairos** saves the script, casts, and makes the voices.
- **Limits:** one run per film, a 6-minute limit, and Stop ends the process tree.
- **Writing again** replaces Claude's lines only: your lines stay, and the prompt asks Claude to write around them.

New film's **Voices** choice goes in the brief (`voices: "make"`), and the film guides tell Claude to cast, write
the script, make it and fit the film. The narrator's voice is picked there already (`POST /api/voice/pick`,
free), with the language: the new film's `kairos.json` gets `voices.narrator`, the brief names it, and a language
other than English starts `voice/script.json`. The voice library is public, so choosing needs no key; only your
own voices and speaking do.

**The Voice tab** (`src/web/components/VoicePanel.tsx`) has three boxes: Who speaks (`CastList`), Lines
(`LinesList`: edits save by themselves a moment after typing, Delete has Undo) and Write with Claude
(`NarrationWriter`). At its bottom, pinned, the update bar says what needs a new voice and makes only that; right
after a voice change it also offers Undo. `useVoiceSummary` (`src/web/voiceSummary.ts`) gives the tab's amber
count and the out-of-date marks on timeline clips. A clip clicked on the timeline opens its line (Voice) or sound
(Sound) and lights it up; Go to on a line selects its clip.

## Claude Code

The **Kairos tools** are an MCP server (`src/mcp/server.ts`, stdio) that Claude Code starts. Settings → Claude Code
→ Connect runs `claude mcp add --scope user kairos -- <node> <repo>/src/mcp/server.ts`. The server only calls the
hub over HTTP (`KAIROS_PORT`) and never touches files itself. Tools default to the film whose folder Claude runs
in. `kairos_notes` and `kairos_frame` return PNG pictures, which Claude sees. Keep each answer under Claude Code's
25,000-token limit: a 1280×720 picture costs about 1,200 tokens, so `kairos_notes` pages through notes. The voice
tools (`kairos_voices`, `kairos_say`, `kairos_words`) say they spend the user's fish.audio credits, so Claude uses
them only when asked. Stdout carries the protocol, so the MCP server logs to stderr only.

**Claude at work, without a terminal** (`src/server/claude-jobs.ts`): New film's "Claude makes it now"
(`make: true`, only when the film has a brief) starts a **make** run right after the film exists; the Claude tab
sends **ask** runs (your words; "Fix my notes"; "Make it from the brief"). Both use `claude-run.ts` (as the
narration writer does): `claude -p --output-format stream-json` in the film folder, the Kairos tools from a temp
`--mcp-config`, `--tools Read,Glob,Grep,Edit,Write,Skill,TodoWrite`, `--allowedTools Skill,TodoWrite,mcp__kairos__*`
and `--permission-mode acceptEdits`: reads and edits stay inside the film folder (anything else needs a permission
no one can give in print mode), no shell, no web. Sessions are kept, so an ask goes on with the film's
conversation and Open Claude here opens it, by its id (`--resume <session>`, while Claude Code still has it:
`savedSession`), because `--continue` skips conversations that ran in the background. One run per film (the narration
writer included), 30 minutes for make, 15 for an ask; Stop ends the process tree. `.kairos/claude.json` keeps the
session and the last 20 runs (your words, Claude's answer, the outcome).

**Is Claude working on a film?** `ActivityBoard` (`src/server/activity.ts`) keeps one state per film for the
preview's loading screen (`ClaudeAtWork`: the Claude character from `ClaudeBuddy.tsx`, the step, the time, Peek and
Stop), the Claude tab and the film cards, and sends `claude-activity` events (`ended` once it ends: Claude's few
words show above the player). Kairos' runs say each step from their stream (`streamStep` in `claude-steps.ts`).
**Claude in your terminal** says it through Claude Code's HTTP hooks: `claude-hooks.ts` puts them in each film's
`.claude/settings.json` (new films, Open Claude here, and every film at hub start), keeping your own settings and
hooks and never writing over a broken file. They post `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`Notification` (`?notice=waiting` or `idle`), `Stop` and `SessionEnd` to `POST /api/claude/hook`; the hub maps
`cwd` to a film and reads only the event, the tool's name and a few small fields (`hookCall`), never your prompt
or a file's contents. While Kairos runs Claude on a film, hooks for it are ignored; a terminal session silent for
20 minutes is taken as ended.

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

- Secondary buttons are icons; main actions keep their words. Every icon button has a short name (`tip` on
  `PixelButton`, or `data-tip`): `Tooltips.tsx` shows it in a pixel box, drawn outside scrolling boxes and inside
  an open dialog.
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
