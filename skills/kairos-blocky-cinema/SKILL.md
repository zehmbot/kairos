---
name: kairos-blocky-cinema
description: Directing Blocky Cinema films in Kairos - narrated stories filmed like an animated movie, where blocky toy characters walk, run, sprint, jump over furniture, punch, fall and get up, pick things up and throw them, things tumble by real physics, the light is cinematic and the camera steers around furniture by itself; the narrator never stops, captions pop word by word, effects land the moments. Use whenever a Kairos film was made with the Blocky Cinema template (its CLAUDE.md says "Blocky Cinema", it has story.js and a blocky/ folder), or the user asks for an action-packed or cinematic blocky story video.
---

# Blocky Cinema films

A Blocky Cinema film is a narrated short story filmed like an animated movie: a voice tells it **without ever
stopping**, while quick shots show blocky toy characters acting it out. They don't just stand and make faces: they
walk in, run, jump over the coffee table, pick up a pillow and throw it, punch, fall down and get up, and things
fall and tumble by real physics. The film's `CLAUDE.md` is the reference for `story.js` (every field); this skill
is about making it **good**.

You direct; the engine performs. Say what happens (`go`, `act`, `THINGS`, faces) and on which word, and the engine
works out the steps, the arcs, the falls, the light and where the camera can stand. Never fake an action with a
pose held on the spot.

## The narration never stops

Silence makes a story video feel empty, and people scroll away. The narrator talks **95-100% of the time** and
never pauses for more than about half a second.

- **Write the narration first,** as one continuous telling: about 2.6 words per second (a 30 s film is about 75
  words, a 60 s film about 150). Then cut it into shots.
- **Every shot is under the voice.** Its `say` is the next 3-7 words. All the shots' `say`, read in order, are the
  whole narration, word for word. A reaction without words is a `beat` (at most 0.6 s), cut in while the voice
  goes on.
- **Keep it flowing:** short sentences that hand over to the next ("...and that's when", "so I", "but then").
  Questions and cliffhangers keep people listening ("Big mistake.", "Guess what happened next.").
- **Write the action into the words.** The action lands on a word (`at`), so the narration needs that word:
  "and he threw it, *right* at Dad." A punch, a throw or a jump with no word for it has nothing to land on.

## The look

- **Vertical 9:16**, a narrator, and something new on screen every 2-3 seconds.
- **Quick shots:** 1.5-3 s each, 4-5 s at most for a held moment or an action that needs its room (a run and a
  jump, a fall). Very short shots (under 1 s) only for a punch or a whip.
- **Mostly faces between the action:** close-ups and medium shots for talk and reactions; `full` and `wide` for
  anything the body does (walks, jumps, punches, falls, throws), so the whole move reads.
- **Each new place opens with a wide shot** (1.5-2.5 s), then cuts in.
- **Inserts** of objects carry story beats: the letter, the phone screen, the cake, the trophy.
- **Faces tell the story:** the expression changes with nearly every shot and matches the words.
- **Captions** are 2-3 words at a time, white bold italic, the word being said in yellow.
- **Effects** land the key moments; every effect has its sound.

## From story to shots

1. **Split the narration into beats of 3-7 words.** Each beat is one shot (its `say`). A shot lasts as long as its
   words take; never put a whole sentence over one long shot.
2. **For each beat, show what the words mean:** who it's about (close-up), an object (`insert` with `prop`), a
   place (wide), a feeling (`xclose`), a reaction (cut to whoever reacts), **an action (full or medium, with `go`
   or `act` on the word)**.
3. **Vary the shots:** no two shots of the same type in a row; rarely more than two in a place without a wide or an
   insert; alternate who is in focus in a conversation.
4. **Match the camera to the moment:**

   | Moment | Camera |
   | --- | --- |
   | calm | `push` or `drift` |
   | a shock | `zoom` (a fast punch in) |
   | fear, chaos | `shake` |
   | power, a win, a big figure | `low` |
   | a small, lonely character | `high` |
   | the end of a scene | `rise` or `pull` |

5. **Pace by mood:** funny is quicker (1.5-2.2 s) with reactions right after the line; heartwarming slower
   (2.5-3.5 s), warm evening light; spooky at night, `low` and `shake`; action alternates a full shot of the move
   with a close-up of the face right after it.
6. **Open strong** (a hook in under 2 s: someone bursting in, a strange object, a question) and **land the end**
   (the reaction, the twist, everyone laughing).

## Moving: nobody stands frozen

Move people when the story moves. About one shot in three has someone moving; every scene starts with people
getting into place or ends with someone leaving.

- **Arriving:** `go: { zee: { from: "off-left", to: "center", pace: "run" } }`, or from the door indoors
  (`from: "door"`).
- **Leaving:** `go: { zee: "off-right" }`; indoors `to: "door"` (the walls are in the way).
- **Up to someone:** `go: { milo: "ruby" }`: he walks round to her front and she turns to him. Then a hug, a talk,
  a punch lands face to face.
- **To a thing:** `go: { milo: "pillow" }` walks up to it, within reach (then `act: { milo: { pickUp: "pillow" } }`).
- **Sitting and getting up:** `go: { milo: "sofa" }` ends sitting; a standing pose later makes him stand up first.
- **Turning to someone:** `look: { milo: "zee" }`.
- **Paces:**

  | Pace | Speed (units/s) | For |
  | --- | --- | --- |
  | `walk` | 3 | the default |
  | `run` | 8.4 | panic, joy, late (dust and running feet, with their sound) |
  | `sprint` | 11.5 | all-out: a chase, a rescue, a jump |
  | `sneak` | 1.3 | a secret, creeping up |
  | `tiptoe` | 1.8 | past someone sleeping |

- **Jumping over furniture:** `go: { milo: { to: "tableL", pace: "sprint", over: "coffee table" } }`: a crouch, a
  real arc with the knees tucked, a landing taken in the knees. It needs a run-up (`run` or `sprint`) and
  furniture low enough (up to about 2.2 units for an adult: the coffee table, the bed, the toy box, a log, the
  sandbox; not the sofa, the bench or the campfire). The moves sheet says when someone is too fast or the piece too
  high.

**Distances:** a room is about 25 units across. A walk across it takes about 8 s, a run 3 s. Keep walks to the next
spot or the next person, put long ones in wide or full shots, and run when it's urgent. A walk goes on into the
next shot of the same place.

**People stay where they went:** in the next shots of the same place, whoever walked to the door is still there,
whoever a shot put in a spot (`at`) is still there, whoever sat is still sitting, whoever was knocked down gets up
where they fell. Nobody jumps somewhere else between two shots of the same place.

## Acting (`act`)

One action per person per shot, after their walk: `act: { theo: { punch: "milo", at: "word" } }`. The action lands
**on the word** `at` (the contact of a punch, the release of a throw), so choose that word in the narration.

| Action | What happens | Set it up | Time it takes |
| --- | --- | --- | --- |
| `punch: "milo"` | wind-up, the body turning through, the fist landing on the word, Milo's reaction, follow-through | walk up first (`go: { theo: "milo" }`); Milo standing and still | 0.4 s before the word, 0.6 s after |
| `punch` + `hard: true` | Milo falls by physics, lies a moment (`stay`, 0.55 s by default), gets up dazed facing the puncher | room behind Milo (about 2 units: not against a wall or the sofa) | about 3.3 s after the word, into the next shot |
| `pickUp: "pillow"` | reaching, the grip on the word, lifting it to the chest | walk to the thing first (`go: { milo: "pillow" }`) | 0.4 s before the word, 0.4 s after |
| `throw: "theo"` | wind-up, release on the word, the thing flies by physics, Theo flinches when hit | hold something first (`pickUp` in an earlier shot or the same one) | 0.4 s before the word, 0.35 s after |
| `drop: true` | lets go of what they hold (it falls) | hold something | on the word |

- **A light punch** (no `hard`) makes the other stagger back. Use it for a shove, a tap, a comedy bonk.
- **Show both sides:** a full or medium shot for the contact (both people in `who`), then a close-up of the one
  hit (`pain`, `dizzy`, `shocked`) and of the puncher (`smug`, `shocked`, `angry`).
- **A knock-down needs time and room:** keep the next shot in the same place so the fall and getting up play out,
  wide enough to see the whole body.
- **A throw needs a target in the shot** (in `who`). It flies at their chest; whether it hits is physics, and the
  moves sheet says when it misses.
- **Keep it a toy world:** slapstick, not cruelty. Falls end with getting up; nobody bleeds; a hard punch is a
  cartoon moment, followed by a reaction or a laugh.

## Things (`THINGS`)

Things that move by physics, by name, in `story.js`:

```js
export const THINGS = {
  boxes: { prop: "box", place: "home", at: { x: 7.9, z: -5.3 }, stack: 3, turn: 0.3 },
  ball: { prop: "ball", place: "bedroom", at: { x: 1.2, z: -1.2 } },
  cup: { prop: "cup", place: "bedroom", at: { x: 9.6, z: -5.2, y: 2.2 } }, // on the desk
};
```

- **Props with a physical shape:** `box`, `pillow`, `ball`, `gift`, `book`, `cup`.
- **Where:** `at` is in the place's units: `x` to the right and `z` toward the front of the wide shot (the place's
  spots in `blocky/layouts.js` give coordinates to start from: a thing beside a spot is a unit or two from it). On
  furniture, `y` is the furniture's height (`h` of its block in `layouts.js`: the desk 2.2, the coffee table 1.35).
  `stack` piles several; `turn` turns it (radians).
- **What physics does by itself:** things rest on the floor and the furniture, fall when dropped, tumble when
  someone runs into them (a run through a stack of boxes knocks it over), fly when thrown, and stay where they
  land in the next shots of that place.
- **Use them for story:** a stack of boxes to crash through in a chase, a pillow fight, a ball tossed to a friend,
  a gift dropped in shock. A thing nobody touches is just decoration: give it a moment.

## Feelings

A face crossfades from the one before, and the body reacts with it by itself: surprise (`shocked`) jumps back a
little, fear (`scared`) shrinks, anger (`angry`, `furious`) leans in with fists, sadness (`sad`, `crying`) slumps,
pain (`pain`, `dizzy`) hunches with a hand to the head, confusion (`confused`, `thinking`) tilts the head,
tiredness (`tired`, `sleepy`) slumps and breathes, joy (`happy`, `grin`, `laugh`) lifts. Change the face on the beat
the feeling changes, and let the next shot show it: that's what makes the body act.

| Feeling | Face | Pose / effect |
| --- | --- | --- |
| surprise | `shocked` | |
| mischief | `smug` | |
| rage | `furious` | `angry`, + `{ anger: "who" }` |
| love | `love` | + `{ hearts: "who" }` |
| boredom | `sleepy` | + `{ zzz: "who" }` |
| sadness | `crying` | `cry`, + `{ tears: "who" }` |
| hurt, dazed | `pain`, `dizzy` | after a hit |
| singing | | `talk`, + `{ notes: "who" }` |

Whoever speaks in the story gets `talk` (with voices, the speaker's mouth moves by itself). Listeners look at the
talker and at anyone moving; talking hands gesture on the narration's `*key words*`.

## The camera does a lot by itself

- **Follows** a walker between spots, holds still for entrances and exits so people really come in and leave,
  `move: "pan"` turns to follow from one place, `move: "follow"` follows entrances and exits too.
- **Steers around furniture:** it tests each shot's view and turns or rises when a sofa, a TV or a shelf would block
  anyone or cover the picture.
- **Stays in the room:** where the shot would put it behind a wall or inside furniture, it moves in with a wider
  lens.

So ask for the shot you want (`shot`, `angle`, `move`); don't nudge the camera by hand. If a frame still hides
someone, try another `angle` or `shot`, or move people (`at`).

## Places, light and looks

| Place | What's there | Light |
| --- | --- | --- |
| `home` | living room: sofa, armchair, coffee table, floor lamp, TV, bookcase, coat rack, curtains, a clock | lamps with soft shadows in the evening and at night |
| `bedroom` | bed, nightstand with a lamp, desk with a computer, wardrobe, beanbag, toy box, a shelf of toys | the window by day; the bedside lamp's warm pool at night |
| `kitchen` | counters with a sink and a stove, wall cabinets, a fridge, a table for four (`chair1` to `chair4`) | the window by day; the lamp over the table in the evening and at night |
| `school` | a long hallway with lockers, a classroom door, a water fountain, a trophy case | cool-white ceiling panels down the hall |
| `classroom` | a whiteboard, the teacher's desk (`teacher`), six desks (`desk1` to `desk6`), big windows | ceiling panels and daylight from the windows |
| `town` | a street of real-size houses with porches, garages, picket fences, mailboxes, parked cars, lantern lamps; stories happen in front of "the house" (spots `gate`, `porch`, `driveway`) | the sun or moon; street lamps once it's dark |
| `park` | slide, swings, bench, sandbox, picnic table, pond, flower beds, trees | the sun (low and warm in the evening); lamp posts at night |
| `backyard` | the back of a house: a deck with garden chairs, a table and a barbecue, string lights, a lawn, a big tree, a trampoline, a wooden fence | the sun; the door lamp and string lights in the evening and at night |
| `forest` | snow, pines, a campfire with logs, a cabin, northern lights | the flickering campfire at night |

- **Light:** `day` clear, `evening` warm and golden with lamps on, `night` cool with lamps, windows and fire
  glowing. A story moving from day to night is a strong shape. Keep a place's light within one moment of the story.
- **Every place has physics:** walls, furniture, cars, trees. People walk around them and things land on them.
- **Looks** change only the finish: the preview is a lighter look (standard), frames and renders the richest
  (cinematic). `SETTINGS.look` forces one; leave it unset.
- **The sky** has drifting clouds by day and in the evening, and a big moon at night: a `low` camera or a wide
  shot outside shows it.
- **Changing a place for the story** (a tree where the story needs one, a second car, a bench by the pond): add or
  move a piece in its `pieces` in `blocky/layouts.js` (`{ kind: "tree", x, z, scale }`); its physics and footprint
  follow by themselves. Then check the places sheet.
- **A place the engine lacks:** pick the nearest one and tell the user, or add one in `blocky/places.js` and
  `blocky/layouts.js` (its spots and its pieces), then check the places sheet.

## Characters

- **"Keep the Blocky cast"** (default): Milo narrates by default; Ruby is the cheeky little sister; Grandpa Bo tells
  bad jokes and is secretly wise; Mom (Nadia) is calm and clever; Dad (Theo) laughs loud and cooks badly; Zee is
  Milo's fearless best friend. If the user names someone "my brother", choose the closest cast member and keep
  that choice for the whole film.
- **"Make new characters":** describe them in `CAST` with clear, different silhouettes (hair shape or a hat, a
  strong shirt color, kids at size 0.75-0.9, adults at 1), then look at the cast sheet.
- **Two or three people per shot** read best in a vertical frame; a wide shot for crowds.
- **Never copy a game's or brand's characters, avatars, logos or names**, or another creator's recurring
  character. Blocky is its own world.

## Effects

Effects (`fx`) land moments; each brings its sound to the timeline's Effects lane. Put one **on the word**
(`at: "word"`). About one shot in two; never the same effect twice in a row; at most two in a shot.

| The words | Effect |
| --- | --- |
| the key word, a reveal, a twist | `{ punch: true, at: "word" }` |
| a number, a count | `{ label: "who", text: "7 days", count: true }` |
| a name, who someone is | `{ label: "who", text: "my best friend" }` |
| a word sung or shouted | `{ float: "Augustus" }` |
| the punchline, a big number | `{ big: "THREE TIMES" }` |
| singing | `{ notes: "who" }` |
| appearing, vanishing, magic | `{ magic: "who", appear: true }` |
| joy, "I jumped" | `{ jump: "who" }` |
| an impact, a slam, a scream | `{ shake: true }` |
| a photo, an idea, a flashback | `{ flash: true }` |
| love | `{ hearts: "who" }` |
| nervous, caught | `{ sweat: "who" }` |
| a win, the happy ending | `{ confetti: true }` |

**With real action, use fewer effects:** a punch that really lands needs at most a `shake` on its word; a real run
needs no `dash`, a real jump no `jump` effect. Keep `dash`, `jump` and `bounce` for cartoon moments that aren't
acted. Runs already bring dust and their footsteps.

## Captions

- `say` holds exactly the narration words of that shot, with its punctuation.
- Mark at most one or two `*key words*` per film section (a name, a number, the twist): they stay yellow.
- Dialogue inside narration keeps its quotes: `say: '"Made you look!"'`.
- The default `words` style fits narrated stories; `lines` suits slower, calmer ones.

## A worked example

The template's own story (home, evening): Milo runs in and leaps the coffee table, waking his big brother Theo, who
walks up and knocks him down; Milo gets up, grabs a pillow and throws it back.

```js
export const THINGS = {
  pillow: { prop: "pillow", place: "home", at: { x: -8.4, z: -0.4 }, turn: 0.5 },
};
export const SHOTS = [
  { place: "home", light: "evening", shot: "wide", who: ["milo", "theo"], at: { theo: "sofaL" },
    pose: { theo: "sit" }, face: { milo: "grin", theo: "sleepy" },
    go: { milo: { from: "door", to: "tableR", pace: "run" } }, say: "Milo burst in through the door," },
  { shot: "full", who: ["milo", "theo"], face: { milo: "laugh", theo: "sleepy" },
    go: { milo: { to: "tableL", pace: "sprint", over: "coffee table" } }, say: "*leapt* over the coffee table," },
  { shot: "medium", who: ["theo", "milo"], pose: { theo: "idle" }, face: { theo: "furious", milo: "shocked" },
    go: { theo: "milo" }, say: "and woke up his big brother, Theo." },
  { shot: "medium", who: ["theo", "milo"], face: { theo: "furious", milo: "scared" },
    act: { theo: { punch: "milo", at: "all.", hard: true } }, say: "Theo was not amused at *all.*" },
  { shot: "full", who: ["milo", "theo"], face: { milo: "dizzy", theo: "angry" },
    say: "Milo saw stars, and slowly got back up." },
  { shot: "full", who: ["milo", "theo"], face: { milo: "tired", theo: "smug" },
    go: { milo: "pillow" }, act: { milo: { pickUp: "pillow" } }, say: "Then he grabbed a pillow," },
  { shot: "medium", who: ["milo", "theo"], face: { milo: "angry", theo: "shocked" },
    act: { milo: { throw: "theo", at: "brother." } }, say: "and threw it right at his *brother.*" },
];
```

What makes it work: every action has its word (`all.`, `brother.`); each walk ends where the next action needs it
(Theo in front of Milo, Milo at the pillow); `pose: { theo: "idle" }` gets Theo off the sofa before he walks; the
knock-down is followed by a full shot in the same place, so the fall and getting up play out; the faces change
with every beat, and the bodies react with them.

## Sizes and sheets

- **Real sizes:** a figure is 1.8 m (5.3 units) and everything is at its real size. A new prop needs its size in
  `blocky/sizes.js` (`SIZES`), and a physical shape in `BODIES` to be a thing. Never make an object bigger to be
  seen: show it with an `insert`.
- **Sheets** (`kairos_sheet`) draw the cast, poses, faces, props, a place, the effects or the moves, and list what
  their checks found:
  - **`moves`:** every walk, jump and action of the story is planned and the physics runs: unknown spots or
    things, someone too far to punch or pick up, a jump too high or without a run-up, a walk that doesn't fit its
    shot, people inside each other, a throw that misses, things that never settle.
  - **`places`** (with `place`): sizes of doors, tables and seats, and the physics against what's built (every
    piece of furniture has a physics shape, no invisible walls). Look at it after changing a place.
  - **`effects`**, **`props`**, **`cast`**, **`poses`** as their names say.

  Fix every problem a sheet lists before rendering.

## Check your work

- **Look at frames with `kairos_frame`:**
  - one in the middle of every new place, the first and the last shot;
  - **every action on its word:** the punch's contact, a throw's release and its hit, a pick-up's grip;
  - **a knock-down:** the fall, lying, and getting up;
  - **every walk and jump:** as it starts, halfway (the top of the arc), and as it arrives;
  - every shot with three or more people, every insert.
- **What to check:** faces visible and not under the caption; nobody walking through anyone or anything; the fist
  on the face, the thing in the hand; effects by the right person on the right word.
- **Set the length:** the film's `duration` must equal the story's length (`kairos_frame` says when they differ);
  set it with `kairos_film_settings`.
- **Render:** frames and renders use the richest look; a 30-second film takes a minute or two with a graphics
  card. Without one everything still works, slower, with a lighter look.

## Voices

When the brief says **"Voices: make them with the film"** (or the user asks for narration), the voice leads: Kairos
packs the voice lines back to back, and the shots, actions and effects land on the voice's real words.

1. **Write the shots first,** with the whole narration in their `say`.
2. **Cast** with `kairos_voices` and `cast`: the narrator (`narrator`, type `narrator`) for a voice-over, or the
   character who tells the story (like `milo`, type `boy`); every character who talks, by their id, with their type
   (Milo boy, Ruby girl, Grandpa Bo `old-man`, Mom woman, Dad man, Zee boy).
3. **Write the script** with `kairos_script`: the narration in order, one or two sentences per line, the words
   exactly as the shots' `say` (without `*stars*`). Starts only give the order (0, 1, 2...). A character's own
   spoken words are their own line. Then make it (`make: true`).
4. **Don't add `seconds` to fit the voices:** the shots follow by themselves.
5. **Set the length** and check a few frames: each caption shows while its words are spoken, each action lands on
   its word.

The voice tools spend the user's fish.audio credits: use them only when the brief or the user asks.

## Sound

- **Music:** the user can put music under the voice (New film's "Music", or the Sound tab); it gets quieter while
  voices talk. Don't add music unless asked; `kairos_assets` lists theirs.
- **Effect sounds** come with effects and with runs. Never add the same sound by hand.
- A user's own voice recording in `kairos.json` `audio`: get its word times (`kairos_words` with `transcribe: true`)
  and cut the shots on them.
