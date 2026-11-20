# {{title}}

This folder is a Kairos film made with the **Blocky Story** template: a narrated story told in quick shots, with
blocky toy characters, cinematic light, word-by-word captions, and effects that make every shot feel alive.
**The narrator never stops talking.** Kairos plays it live while you work, and the preview reloads by itself every
time a file here is saved.

## Make the film from the brief

1. Read `brief.md`: the user's story and their answers (characters, place, mood). If the film has references,
   look at them with `kairos_references`: their notes say what to take from each (pace, shots, faces...).
2. **Write the narration first:** the whole story as one continuous telling, from the first word to the last,
   about 2.6 words per second (a 30 s film is about 75 words). There are no pauses: something is always being
   said.
3. **Cut it into shots** in `story.js` (format below): every shot's `say` is the next 3-7 words of the narration,
   in order, so all the shots' `say` together are the whole narration. Normally `story.js` is the only file you
   change.
4. **Add effects** (`fx`) where the words call for them: a punch-in on the key word, notes when someone sings,
   magic when someone appears, a counting label for a number, a shake on an impact. About one shot in two has
   one; never the same effect on two shots in a row. Each effect brings its sound by itself.
5. Look at frames with `kairos_frame` (a few per place, every effect word, every new face or pose) and the
   effects sheet (`kairos_sheet` with `effects`), and fix what looks wrong.
6. Set the length with `kairos_film_settings` (`duration` = the story's length: `kairos_frame` says it).
7. **Voices:** when the brief says "Voices: make them with the film", make the narration (steps under "Voices"
   below). The voice leads: shots cut on its real words by themselves.

**Characters:**

- **"Keep the Blocky cast"** (the default): use only the cast.
- **"Make new characters for this story":** describe new ones in `CAST` (same blocky style). Give them their own
  colors and hair, and keep each one looking the same through the whole film.

**Main character, place and mood:** follow the brief. With "Let Claude choose", pick the place that fits the
story.

The `kairos-blocky-story` skill has the full style guide (narration, pacing, shot choice, faces, effects). Use it.

## story.js

```js
export const CAST = {}; // new characters for this film (the Blocky cast is always there)
export const SETTINGS = {}; // captions and the finishing look
export const SHOTS = [
  /* played one after the other; their `say` together is the whole narration */
];
```

### A shot

```js
{
  place: "home",            // home, bedroom, school, town, park, forest (kept from the shot before when left out)
  light: "evening",         // day, evening, night (each place has its own default)
  shot: "close",            // wide, full, medium, close, xclose, ots, low, high, insert
  who: ["milo", "ruby"],    // who is in the shot; the first one is the focus
  focus: "ruby",            // optional: who the camera is about
  at: { milo: "sofaL" },    // optional: a spot in the place (see below)
  turn: { milo: 0.4 },      // optional: turn someone (radians)
  pose: { milo: "sit" },    // see poses
  face: { milo: "shocked" },// see faces
  talk: "milo",             // whose mouth moves (without voices; with voices, the line's speaker's)
  hold: { milo: "phone" },  // something in the right hand (see props)
  prop: "letter",           // an object on the place's table or surface (use with shot: "insert")
  say: "and then *nobody* laughed.", // the next words of the narration (*key words* stay yellow)
  fx: [{ punch: true, at: "nobody" }], // effects (below), each on a word or at the start of the shot
  move: "push",             // hold, push, pull, drift, orbit, rise, zoom, shake
  angle: "left",            // front, left, right, side, sideR, back
  whip: true,               // start with a fast blurred swing (between moments), with a whoosh
  look: "away",             // characters don't turn their heads to the camera
  beat: true, seconds: 0.5, // a reaction without words (at most 0.6 s): the voice goes on over it
}
```

### Effects (`fx`)

Each effect is `{ name: value }`: the value is who it is about (an id in `who`; `true` = the shot's focus) or its
words. Add `at: "word"` to make it happen on that word of the shot's `say`, `sound: false` for no sound,
`sound: "boing"` for another one.

| Effect     | Value  | What it does                                                                            | Sound        |
| ---------- | ------ | --------------------------------------------------------------------------------------- | ------------ |
| `notes`    | who    | music notes swirl up around them (singing, humming)                                     | chime        |
| `sparkles` | who    | twinkling stars (proud, magical, clean)                                                 | sparkle      |
| `hearts`   | who    | hearts float up (love, a crush, cute)                                                   | heart        |
| `tears`    | who    | tears stream down (crying)                                                              |              |
| `sweat`    | who    | a sweat drop (nervous, caught)                                                          |              |
| `anger`    | who    | a throbbing anger mark (mad)                                                            | thud         |
| `zzz`      | who    | Zzz floating up (bored, asleep)                                                         |              |
| `dust`     | who    | dust puffs at their feet (landing, a stop)                                              | puff         |
| `magic`    | who    | a glowing ring and a burst; with `appear: true` they pop in, `vanish: true` they vanish | magic        |
| `confetti` | `true` | confetti over the whole frame (a win, a party, the happy end)                           | party        |
| `label`    | who    | a label over their head: `text: "575 days"`; `count: true` counts the number up         | ding / count |
| `float`    | words  | words drifting up in the air (a name sung, a shout, a thought)                          | pop          |
| `big`      | words  | big see-through words in the upper frame (a number, the punchline)                      | boom         |
| `punch`    | `true` | the camera punches in (the key word, a reveal); `amount: 0.72`                          | swish        |
| `shake`    | `true` | the camera shakes (an impact, a scream, a slam)                                         | thud         |
| `flash`    | `true` | a white flash (a photo, a lightning idea, a cut to a flashback)                         | flash        |
| `bounce`   | who    | they pop into the shot with a bounce                                                    | pop          |
| `jump`     | who    | a jump with squash and stretch (joy, surprise); `height: 0.3`                           | boing        |
| `dash`     | who    | they dash in with speed lines and a blur (`from: "left"` or `"right"`)                  | whoosh       |

Sounds go on the timeline's **Effects** lane by themselves, where the user can move, mute or delete them. The
sounds Kairos has: whoosh, swish, pop, boing, ding, count, thud, boom, sparkle, magic, puff, flash, chime, party,
heart.

### Reference

- **Characters:**
  - **Blocky cast:**
    - `milo`: 12, the usual narrator, orange hoodie;
    - `ruby`: 8, his sister, red buns, overalls;
    - `bo`: Grandpa, beard, glasses, cardigan;
    - `nadia`: Mom, ponytail, yellow sweater;
    - `theo`: Dad, green check shirt;
    - `zee`: Milo's best friend, teal beanie.
  - **New characters** (in `CAST`), with these fields:
    - `name`, `size` (1 = adult, 0.75 to 0.9 for kids), `skin`;
    - `hair`: short, messy, curly, bob, long, ponytail, buns, sides, spiky, bald;
    - `hairColor`, `hat` (beanie, cap, beret), `hatColor`;
    - `top`: plain, hoodie, overalls, cardigan, sweater, tee, check, stripes;
    - `shirt`, `shirt2`, `sleeves` (long, short), `pants`, `shoes`;
    - `beard` (a color);
    - `features` (`glasses`, `freckles`, `lashes`).
- **Spots:**
  - **Every place:** `center`, `left`, `right`, `back`.
  - **Extra spots:**
    - **home:** `front`, `door`, `window`, `sofa`, `sofaL`, `sofaR`;
    - **bedroom:** `window`, `bed` (lying), `bedSit`, `desk`;
    - **school:** `front`, `lockerL`, `lockerR`;
    - **town:** `road`, `far`;
    - **park:** `slide`, `bench`;
    - **forest:** `fire`, `cabin`, `logL`, `logR`.
  - **Without `at`:**
    - one person stands in the center;
    - two face each other;
    - three or more stand in an arc;
    - sitting poses use the place's seats, lying poses its bed.
- **Poses:**
  - **standing:** idle, talk, wave, point, cheer, shrug, cry, scared, think, facepalm, hug, angry, laugh, dance,
    jump;
  - **moving forward:** walk, run, sneak;
  - **sitting:** sit, sitTalk, sitSad;
  - **lying:** lie, sleep, faint.
- **Faces:** neutral, happy, grin, laugh, sad, crying, shocked, scared, angry, furious (red face), smug, sleepy,
  dizzy, love, embarrassed, thinking, suspicious. Eyes blink by themselves.
- **Icons** (`icons`, by a head): ?, !, idea. (Music, hearts, sparkles, Zzz, sweat and anger are effects now.)
- **Props:** letter, phone, cake, gift, book, ball, key, cup, photo, trophy, megaphone, battery, mouse. Each
  shows at its real size (`blocky/sizes.js`): a battery is 5 cm, a mouse 11 cm, in a hand or on a table.
- **SETTINGS:**
  - `captions: { style, highlight, key, position, size }`:
    - `style`: "words" (2-3 words, the spoken one in yellow), "lines" (two lines, key words in color) or "none";
    - `position`: 0.64 = 64% down the frame.
  - The finishing look: `focusBlur`, `focusAmount`, `glow`, `vignette`, `grain`, `exposure`.

### Timing: the narration never stops

- **The words lead** (`blocky/timing.js`): all the shots' `say`, in order, are one stream of words. Each shot cuts
  in just before its first word and lasts until the next shot's first word, so every moment is under the voice.
- **Without voices** the words are spread at about 2.6 words per second (a little pause after a sentence), and the
  story's length comes from that.
- **With voices** (`blocky/voice.js`) the voice's real words are the stream: Kairos packs the voice lines back to
  back (this film's `kairos.json` has `"narration": "packed"`), trimmed to their words, so there are no silences.
  A shot finds its words in order; one sentence of the voice can run over several shots.
- **Captions** show the shot's words as they are said; **mouths** move for the speaker of the word being said,
  when they are in the shot (the narrator moves no mouth).
- **Following:** when the user edits, remakes or deletes a line, the lines after it move up to stay packed, and
  the film follows without any change here.
- **Beats:** a shot with `beat: true` and no `say` is a quick reaction (at most 0.6 s) cut in under the voice.

## The engine

`blocky/` builds everything:

- **the cast:** `cast.js`;
- **figures and faces:** `characters.js`, `faces.js`;
- **poses and places:** `poses.js`, `places.js`;
- **objects:** `props.js`;
- **the camera:** `shots.js`;
- **captions and extras:** `captions.js`, `overlays.js`;
- **effects:** `fx.js` (particles, words in the scene, camera punches, bouncy motion, and their sounds:
  `window.KAIROS_SOUNDS`);
- **the look:** `effects.js`;
- **the timeline:** `engine.js`, with `timing.js` (shots cut on the narration's words) and `voice.js` (reads the
  voices);
- **sizes:** `sizes.js` (an adult figure is 1.8 m; every prop's real size; seats at the figures' knee height);
- **sheets:** `sheet.js` and `../sheet.html` (every character, pose, face, prop, place and effect on one picture,
  with checks).

**Real sizes.** Every object is as big as it is in life, next to figures 1.8 m tall. A new prop in `props.js` needs
its real size in `SIZES` (its longest side, in meters): the engine sizes it from that. Places follow the same
scale (a door is 2.1 m, a desk 75 cm); seats sit at the figures' knee height so their feet reach the floor.

**The figures are jointed toys:** a head on a neck, a chest on the hips (the waist), arms with shoulders, elbows
and wrists, legs with hips, knees and ankles. Pose keys: `armL/armR` ([forward, out]), `elbowL/R`, `wristL/R`,
`legL/legR`, `kneeL/R`, `ankleL/R`, `lean`, `twist`, `tilt`, `headX/Y/Z`, `bodyY`, `bodyX`. Each joint stops at its
limit (`JOINTS` in `characters.js`); an elbow or a knee bends one way only.

**Sheets: check your work there.** `kairos_sheet` shows a sheet and the problems its checks found: `props` after
adding a prop (is it the right size?), `cast` after adding or changing a character, `poses` after adding a pose
(every part attached, no joint past its limit), `places` after changing a place, `effects` after adding effects
(it shows each effect, and checks the story's: a known effect, on a word the shot says, with a known sound). Fix
every problem it lists.

Change it only when the story needs something it doesn't have (a new place, a pose, a prop, an effect). Keep
`renderOut(t)` a pure function of `t`: no timers, clocks or unseeded random numbers. Our characters and world
are our own: never use a game's or brand's name, logos, avatars or another creator's characters.

## Files

- `kairos.json`: title, size, `fps`, `duration` (the story's length), `status`, `audio` (sound
  tracks: `[{ "file": "audio/voice.mp3", "start": 0, "volume": 1 }]`), and
  `video`: videos and pictures Kairos draws over the film, like
  `[{ "file": "assets/images/logo.png", "start": 0, "length": 5, "size": 0.2, "x": 0.88, "y": 0.84 }]`
  (see Video clips in the `kairos` skill).
- `index.html` and `film.js` hold the film; `story.js` is the story; `assets/fonts/` has the caption font
  (Poppins, SIL Open Font License).
- Scenes on the Kairos timeline come from the places in the story.

## Voices

When the brief says **"Voices: make them with the film"** (or the user asks for narration):

1. **Write the shots first,** with the whole narration in their `say`.
2. **Cast** with `kairos_voices` and `cast`: the narrator (`narrator`, type `narrator`) for a voice-over, or the
   character who tells the story (like `milo`, type `boy`); every character who talks, by their id in the cast,
   with their type (Milo boy, Ruby girl, Grandpa Bo `old-man`, Mom woman, Dad man, Zee boy).
3. **Write the script** with `kairos_script`: the narration in order, one or two sentences per line, the words
   exactly as in the shots' `say` (without the `*stars*`). Starts only give the order (0, 1, 2...): Kairos packs the
   lines back to back. A character's own spoken words are their own line, with them as the speaker. Then make it
   (`make: true`).
4. **The shots follow by themselves,** on the voice's real words.
5. **Set the length** to the story's length (`kairos_frame` says it when it differs).

## Working with Kairos

When the Kairos tools are connected (Kairos → Settings → Claude Code), use them:

- `kairos_notes` shows the user's open frame notes. Start there when asked to fix notes.
- `kairos_frame` shows the frame at `t` (seconds), and any error the film throws.
- `kairos_note_update` (`status: "fixed"`) when a note is done. Never edit `.kairos/` by hand.
- `kairos_film_settings` changes the title, length, frame rate or status.
- `kairos_render` makes the MP4 when the user asks for the video; `kairos_renders` shows progress.
- `kairos_references` shows the videos and pictures the user added as references, with what to take from each,
  their shot lengths and frame sheets. Look at them before building or restyling the film.
- `kairos_assets` lists the user's asset library (images, videos, sounds, fonts); `kairos_use_asset` copies one into
  this film and gives its path (a sound becomes a sound track).
- `kairos_sheet` draws the cast, poses, faces, props, a place or the effects, with the problems it found.
- `kairos_voices` casts the speakers by type (free); `kairos_script` writes what they say and when, and makes the
  voices with fish.audio (uses the user's credits; unchanged lines are reused); `kairos_words` gives word timings.
