# {{title}}

This folder is a Kairos film made with the **Blocky** template: a narrated story told in quick shots, with
blocky toy characters filmed like an animated movie. They walk, run, jump, fight, fall, get up, pick things up and
throw them; things fall and tumble by real physics; the light and the camera are cinematic. Word-by-word captions
and effects make every shot feel alive.
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
4. **Make people move** (`go`) when the story moves: someone walks in, crosses the room, goes up to someone,
   sits down, gets up, runs off, jumps over the coffee table. About one shot in three has someone moving; nobody
   should stand frozen in one spot for the whole film.
5. **Stage the action** (`act`, `THINGS`) where the story has it: someone picks something up and throws it,
   punches, knocks someone down, drops something; things to crash through or fight with. Each action lands on a
   word of the narration (`at`), and the walk before it brings people within reach.
6. **Add effects** (`fx`) where the words call for them: a punch-in on the key word, notes when someone sings,
   magic when someone appears, a counting label for a number, a shake on an impact. About one shot in two has
   one; never the same effect on two shots in a row. Each effect brings its sound by itself.
7. **Check:** the moves sheet (`kairos_sheet` with `moves`: it plans every walk, jump and action and runs the
   physics) and the effects sheet (`effects`) list problems: fix every one. Then look at frames with
   `kairos_frame`: a few per place, every action on its word, every walk and jump, every effect word, every new
   face or pose.
8. Set the length with `kairos_film_settings` (`duration` = the story's length: `kairos_frame` says it).
9. **Voices:** when the brief says "Voices: make them with the film", make the narration (steps under "Voices"
   below). The voice leads: shots cut on its real words, and actions land on them, by themselves.

**Characters:**

- **"Keep the Blocky cast"** (the default): use only the cast.
- **"Make new characters for this story":** describe new ones in `CAST` (same blocky style). Give them their own
  colors and hair, and keep each one looking the same through the whole film.

**Main character, place and mood:** follow the brief. With "Let Claude choose", pick the place that fits the
story.

**Other shapes:** the engine frames every shot for the size it's given, so the same story goes out wide for YouTube,
tall for Shorts and square, each filmed for its shape (`kairos_render` with `shape`). To see one before rendering,
use `kairos_frame` with the same `shape`. Stage the story so it reads in the film's own shape; the others follow.

The `kairos-blocky` skill has the full style guide (narration, pacing, shot choice, staging actions,
things, faces, effects, checks). Use it.

## story.js

```js
export const CAST = {}; // new characters for this film (the Blocky cast is always there)
export const THINGS = {}; // things that move by physics (see Things)
export const SETTINGS = {}; // captions and the finishing look
export const SHOTS = [
  /* played one after the other; their `say` together is the whole narration */
];
```

### A shot

```js
{
  place: "home",            // home, bedroom, kitchen, school, classroom, cafe, town, park, backyard, forest
  light: "evening",         // day, evening, night (each place has its own default)
  shot: "close",            // wide, full, medium, close, xclose, ots, low, high, insert
  who: ["milo", "ruby"],    // who is in the shot; the first one is the focus
  focus: "ruby",            // optional: who the camera is about
  at: { milo: "sofaL" },    // optional: a spot in the place (see below)
  go: { milo: "sofa" },     // someone walks somewhere during the shot (see Moving)
  look: { milo: "ruby" },   // someone turns to face someone else
  turn: { milo: 0.4 },      // optional: turn someone (radians)
  pose: { milo: "sit" },    // see poses
  face: { milo: "shocked" },// see faces
  talk: "milo",             // whose mouth moves (without voices; with voices, the line's speaker's)
  act: { milo: { pickUp: "pillow" } }, // an action: punch, pickUp, throw, drop (see Acting)
  hold: { milo: "phone" },  // something in the right hand (see props; a thing to throw is picked up with act)
  prop: "letter",           // an object on the place's table or surface (use with shot: "insert")
  say: "and then *nobody* laughed.", // the next words of the narration (*key words* stay yellow)
  fx: [{ punch: true, at: "nobody" }], // effects (below), each on a word or at the start of the shot
  move: "push",             // hold, push, pull, drift, orbit, rise, zoom, shake, follow, pan
  angle: "left",            // front, left, right, side, sideR, back
  whip: true,               // start with a fast blurred swing (between moments), with a whoosh
  look: "away",             // nobody turns their head to the camera (instead of `look: { ... }`)
  beat: true, seconds: 0.5, // a reaction without words (at most 0.6 s): the voice goes on over it
}
```

### Moving (`go`)

`go: { milo: "sofa" }` sends Milo to a spot during the shot; `go: { milo: { to, from, pace, at, via } }` says more:

- **`to`**: a spot of the place, someone in the shot (`"ruby"`: he walks up to her, she turns to face him), or
  out of the picture: `"off-left"`, `"off-right"`, `"off-back"`.
- **`from`**: where the walk starts: a spot, or `"off-left"`, `"off-right"`, `"off-back"` to come into the picture
  (they aren't seen before). Left out: where they are.
- **`to`** can also be a thing (`"pillow"`, from `THINGS`): they walk up to it, within reach.
- **`pace`**: `walk` (the default), `run` (dust and running feet, with their sound), `sprint`, `sneak`, `tiptoe`.
- **`at`**: the word the walk starts on (like effects). Left out: the start of the shot.
- **`via`**: spots to go by, in order.
- **`over`**: a low piece of furniture the run jumps over (`over: "coffee table"`, with `pace: "run"` or
  `"sprint"`): a crouch, a real arc, the knees tucked over it, a landing taken in the knees. Up to about 2.2 units
  high for an adult: the coffee table, the bed, the toy box, a log, the sandbox, a flower bed, the pond (the
  furniture's names and heights come from each place's `pieces` and `blocks` in `blocky/layouts.js`).

What the engine does by itself:

- **The walk:** someone facing the wrong way turns first with small steps, speeds up, walks around the furniture
  and the people in the way, slows down, and turns to face the way the spot faces (or the person they walked
  up to). Their feet stay planted.
- **Sitting and standing:** a walk to a seat ends sitting on it (they turn their back to it and sit down) unless
  the shot gives them a standing pose. Someone sitting stands up before walking off. Someone sitting whose next
  shot gives a standing pose (`wave`, `cheer`...) stands up; someone standing nearby who gets a sitting pose walks
  to the nearest seat and sits.
- **People stay where they went:** in the next shots in the same place, someone who walked to the door is still
  by the door, someone a shot put in a spot (`at`) is still there, and someone who sat down is still sitting, until
  a shot moves them (`at`, `go`) or the place changes. A walk can go on into the next shots of the same place that
  still show the walker; the moves sheet says when it doesn't fit even then.
- **The camera:** it follows someone walking between spots, holds where someone comes in (or leaves from), and
  `move: "pan"` keeps it still and turns it to follow; `move: "follow"` follows even entrances and exits.
- **Alive while standing:** listeners look at whoever talks and at anyone walking; people shift their weight;
  talking hands gesture on the narration's `*key words*` and the head nods at the end of a sentence.

Keep walks short: a walk takes about a second for every 3 units (a room is about 25 units across); a run is almost
three times faster (8.4 units a second), a sprint nearly four (11.5). A walk can go on into the next shot of the same place; the moves sheet says when one doesn't fit.
Walks never end inside furniture (an end point there moves to the nearest free place), and someone standing up
from a seat never stands up into anyone (whoever is in the way steps back first).

### Acting (`act`)

`act: { theo: { punch: "milo", at: "word", hard: true } }`: one action per person in a shot, after their walk.

- **`punch: "milo"`**: a wind-up, the body turning through, the weight going forward, the arm speeding up, the
  contact on the word (`at`), Milo's reaction, the follow-through and recovery. Walk up first (`go: { theo: "milo" }`):
  the moves sheet says when someone is too far. `hard: true` knocks them down: they fall by physics, lie a moment
  (`stay`: seconds, 0.55 by default) and get up, dazed, facing the puncher. Without `hard`, they stagger back.
- **`pickUp: "pillow"`**: they reach for a thing (from `THINGS`) and lift it to their chest. Walk to it first
  (`go: { milo: "pillow" }`).
- **`throw: "theo"`**: they throw what they hold at someone, on the word: it flies by physics, and whoever it hits
  flinches with a shocked face.
- **`drop: true`**: they let go of what they hold.

### Things (`THINGS` in story.js)

Things that move by physics, by name: `boxes: { prop: "box", place: "home", at: { x: 7.9, z: -5.3 }, stack: 3 }`.

- **`prop`:** one of the props with a physical shape: box, pillow, ball, gift, book, cup (`BODIES` in
  `blocky/sizes.js`).
- **`at`:** where it stands, in the place's units: `x` to the right and `z` toward the front of the wide shot. The
  place's spots and pieces in `blocky/layouts.js` give coordinates to start from. `y` puts it higher: on
  furniture, the furniture's height (the desk 2.2, the coffee table 1.35, the picnic table 1.9); on a pavement,
  porch or deck, its step (0.3, 0.45).
- **`stack`** piles several; **`turn`** turns it (radians).

What physics does by itself: things rest on the floor and the furniture, tumble when someone runs into them, fall
when dropped, fly when thrown, and stay where they land in the next shots of that place. Every place has its walls
and furniture in the physics (`solids` in `blocky/layouts.js`). The moves sheet runs the physics and says when
something goes wrong: a walk into furniture, a throw that misses, things that never settle.

### The camera, the light and the looks

- **The camera** frames each shot by itself: it tests the view and turns or rises when furniture would block
  someone or cover the picture, and where the shot would put it behind a wall or inside furniture, it moves in
  with a wider lens. Ask for the shot you want (`shot`, `angle`, `move`); if a frame still hides someone, try
  another `angle` or move people.
- **The light** has a reason in every place: lamps with soft shadows indoors in the evening and at night, the
  kitchen's lamp over the table, the café's lamps over its tables, the school's and the classroom's ceiling
  panels, the sun or moon outside (with drifting clouds, and a big moon at night), the street lamps once it's
  dark, the backyard's door lamp and string lights, the campfire and the cabin's window in the forest at night.
- **Looks:** the preview uses a lighter look (standard), frames and renders the richest (cinematic), and a
  computer drawing without a graphics card the lightest (draft). Only the finish changes, never what happens.
  `SETTINGS.look` (`"draft"`, `"standard"`, `"cinematic"`) forces one; leave it unset.

### Feelings

A face changes by crossfading from the one before, and the body reacts with it: surprise jumps back a little,
fear shrinks, anger leans in with fists, sadness slumps, pain hunches with a hand to the head, confusion tilts the
head (`confused`), tiredness slumps and breathes (`tired`).

### Effects (`fx`)

Each effect is `{ name: value }`: the value is who it is about (an id in `who`; `true` = the shot's focus) or its
words. Add `at: "word"` to make it happen on that word of the shot's `say`, `sound: false` for no sound,
`sound: "boing"` for another one. Sounds play at 65% (`volume: 0.4` for a softer one).

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
    - **home:** `front`, `door`, `window`, `sofa`, `sofaL`, `sofaR`, `tableL`, `tableR`, `armchair`;
    - **bedroom:** `window`, `bed` (lying), `bedSit`, `desk`, `beanbag`, `wardrobe`;
    - **kitchen** (counters with a sink and a stove, a fridge, a table for four): `sink`, `stove`, `fridge`, `door`,
      `chair1`, `chair2` (the table's far side), `chair3`, `chair4` (its near side);
    - **school** (the hallway): `front`, `lockerL`, `lockerR`, `classroom` (at the classroom's door), `fountain`;
    - **classroom** (a board, the teacher's desk, two rows of three desks): `board`, `teacher` (the teacher's
      chair), `desk1` to `desk6` (the students' chairs, the front row first, left to right), `door`, `window`;
    - **town** (a street of houses: stories happen on the far pavement, in front of the house): `road`, `far`,
      `gate` (inside the house's front gate), `porch` (at its front door), `driveway`, `across` (the other
      pavement);
    - **park:** `slide`, `bench`, `picnicL`, `picnicR` (the picnic table's benches), `pond`, `sandbox`;
    - **backyard** (behind a house: a deck, a lawn, a wooden fence): `door` (the back door), `patio`, `grill`,
      `tree`, `trampoline`, `gate`, `chair1`, `chair2` (garden chairs on the deck);
    - **cafe** (a counter with a pastry case, a coffee machine, a menu board, three small tables): `counter` (a
      customer at the counter), `barista` (behind it), `door`, `window`, `seat1` to `seat6` (the tables' chairs);
    - **forest** (snow, pines, a campfire, a log cabin with a porch): `fire`, `cabin` (before its porch), `porch`,
      `logL`, `logR`, `stump` (the logs and the stump are seats).
  - **Without `at`:**
    - one person stands in the center;
    - two face each other;
    - three or more stand in an arc;
    - sitting poses use the place's seats, lying poses its bed.
- **Poses:**
  - **standing:** idle, talk, wave, point, cheer, shrug, cry, scared, think, facepalm, hug, angry, laugh, dance,
    jump;
  - **moving:** walk, run, sneak, tiptoe (on the spot they go straight ahead; use `go` to walk somewhere);
  - **sitting:** sit, sitTalk, sitSad;
  - **lying:** lie, sleep, faint.
- **Faces:** neutral, happy, grin, laugh, sad, crying, shocked, scared, angry, furious (red face), smug, sleepy,
  dizzy, love, embarrassed, thinking, suspicious, pain, confused, tired. Eyes blink by themselves.
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
- **Off the picture:** `off-left`, `off-right`, `off-back` for `go` (`to` and `from`). Inside rooms, people leave by
  the door (`to: "door"`): the walls are in the way.

## The engine

`blocky/` builds everything:

- **the cast:** `cast.js`;
- **figures and faces:** `characters.js`, `faces.js`;
- **poses and places:** `poses.js` (with the gaits, sitting down and standing up), `places.js` (each place's
  ground, light and pieces), `layouts.js` (each place's spots, walls and `pieces`: what stands there);
- **the place kit:** `shapes.js` (what each kind of piece takes up: its physics boxes, its footprint, raised ground
  like porches and decks), `kit.js` with `kit-house.js`, `kit-garden.js`, `kit-room.js`, `kit-kitchen.js`,
  `kit-school.js`, `kit-forest.js` and `kit-shop.js` (how houses, cars, lamps, fences, trees, garden things,
  furniture, kitchens, classrooms, the forest and the café look), `textures.js` (wood, siding, shingles, bricks,
  grass, asphalt, concrete, sand, logs... made by code), `sky.js` (the sky with clouds and the moon, and the far
  hills);
- **moving:** `motion.js` (where everyone is in each shot: the walks, jumps and actions, planned once);
- **acting:** `animation.js` (the poses of jumps, punches, falls, getting up, carrying, throwing, reactions),
  `figure.js` (anyone's whole body at any moment), `rig.js` (the joints as numbers, arms aimed by IK);
- **physics:** `physics.js` (Rapier's deterministic build) and `simulation.js` (each run of shots in a place is
  one world, stepped 120 times a second when the page loads; every frame reads it back, in any order);
- **objects:** `props.js`;
- **the camera:** `shots.js`;
- **captions and extras:** `captions.js`, `overlays.js`;
- **effects:** `fx.js` (particles, words in the scene, camera punches, bouncy motion, and their sounds:
  `window.KAIROS_SOUNDS`);
- **the look:** `effects.js`;
- **the timeline:** `engine.js`, with `timing.js` (shots cut on the narration's words) and `voice.js` (reads the
  voices);
- **sizes:** `sizes.js` (an adult figure is 1.8 m; every prop's real size; seats at the figures' knee height);
- **sheets:** `sheet.js` and `../sheet.html` (every character, pose, face, prop, place, effect and move on one
  picture, with checks).

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
(it shows each effect, and checks the story's: a known effect, on a word the shot says, with a known sound),
`moves` after adding walks, jumps, actions or things (it shows the gaits, sitting down and standing up, the
actions, and checks the story's: a known spot, a seat to sit on, a way around the furniture, time enough in the
shot, feet that don't slide, someone within reach, a jump with a run-up, nobody inside anyone, and the physics: a
throw that hits, things that settle). `places` also checks the place's physics against what's built (every piece of
furniture has a physics shape, and no shape stands where nothing is built). Fix every problem it lists.

**Changing a place.** A place's furniture is its `pieces` in `blocky/layouts.js` (`{ kind, x, z, rot, ... }`):
move one, add one (a tree, a bush, a bench, a car, a fence...) or take one away, and its physics and footprint
follow by themselves. Then look at the Places sheet (`kairos_sheet` with `places` and the place), which checks it.

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
- `kairos_sheet` draws the cast, poses, faces, props, a place, the effects or the moves, with the problems it
  found.
- `kairos_voices` casts the speakers by type (free); `kairos_script` writes what they say and when, and makes the
  voices with fish.audio (uses the user's credits; unchanged lines are reused); `kairos_words` gives word timings.
