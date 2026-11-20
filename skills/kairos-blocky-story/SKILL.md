---
name: kairos-blocky-story
description: Directing Blocky Story films in Kairos - narrated stories where the narrator never stops, told in quick shots of blocky toy characters with effects (particles, floating words, camera punches, bouncy motion) and their sounds. Use whenever a Kairos film was made with the Blocky Story template (its CLAUDE.md says "Blocky Story", it has story.js, a blocky/ folder with fx.js), or the user asks for a lively blocky story video.
---

# Blocky Story films

A Blocky Story film is a narrated short story: a voice tells it in the first person ("Last winter, my best
friend...") **without ever stopping**, while quick shots show blocky toy characters acting it out, with big
expressive faces, captions that pop in a few words at a time, and effects that make each moment land. The film's
`CLAUDE.md` has the `story.js` and effects reference. This skill is about making it **good**.

## The narration never stops

Silence makes a story video feel empty, and people scroll away. In the story videos this template is measured
from, the narrator talks **95-100% of the time** and never pauses for more than about half a second.

- **Write the narration first,** as one continuous telling: about 2.6 words per second (a 30 s film is about 75
  words, a 60 s film about 150). Then cut it into shots.
- **Every shot is under the voice.** Its `say` is the next 3-7 words. All the shots' `say`, read in order, are the
  whole narration, word for word. There are no silent shots; a reaction without words is a `beat` (at most 0.6 s),
  cut in while the voice goes on.
- **Keep it flowing:** short sentences that hand over to the next ("...and that's when", "so I", "but then").
  Questions and cliffhangers keep people listening ("Big mistake.", "Guess what happened next.").
- **Fill the time with story,** not filler: details, reactions, what people said. When a film needs to be longer,
  add a beat of story, never a pause.

## The look, measured from real story videos

- **Vertical 9:16**, a narrator, and something new on screen every 2-3 seconds.
- **Quick shots:**
  - Half of all shots last 1.4 to 2.9 s. Use 1.5-3 s per shot, 4-5 s at most for a held moment.
  - Very short shots (under 1 s) only for a punch or a whip.
- **Mostly faces:** close-ups and medium shots, characters filling the frame, at eye level or a little below.
- **Each new place opens with a wide shot** (1.5-2.5 s), then cuts in.
- **Inserts** of objects carry story beats: the letter, the phone screen, the cake, the trophy.
- **Whips:** fast swings with motion blur (`whip: true`) mark jumps between moments or punchlines.
- **Faces tell the story:** the expression changes with nearly every shot and matches the words being said.
- **Captions** are 2-3 words at a time, white bold italic, the word being said in yellow, about 64% down the frame.
- **Effects everywhere:** numbers and names float above people and count up, words drift up in the air, music
  notes swirl around a singer, magic bursts when someone appears, punch-ins land the key words, and every effect
  has its sound. Soft music runs under the voice.

## From story to shots

1. **Split the narration into beats of 3-7 words.** Each beat is one shot: its `say` is those words. A shot lasts
   as long as its words take to say (the engine times it); never put a whole sentence over one long shot.
2. **For each beat, show what the words mean:**
   - **Who it is about:** that character in close-up.
   - **An object:** an insert with `prop`.
   - **A place:** a wide shot.
   - **A feeling:** an extreme close-up of the face, maybe with an icon.
   - **A reaction:** cut to the person reacting.
3. **Vary the shots.**
   - Avoid two shots of the same type in a row, and rarely more than two in the same place without a wide or
     an insert.
   - Alternate who is in focus in a conversation.
   - `angle` and the automatic left/right alternation keep cuts lively.
4. **Match the camera to the moment:**

   | Moment | Camera |
   | --- | --- |
   | calm | `push` or `drift` |
   | a shock | `zoom` (a fast punch in) |
   | fear, chaos | `shake` |
   | power, a win, a big figure | `low` |
   | a small, lonely character | `high` |
   | the end of a scene | `rise` or `pull` |

5. **Faces and poses carry the joke.**

   | Feeling | Face | Pose |
   | --- | --- | --- |
   | surprise | `shocked` | |
   | mischief | `smug` | |
   | rage | `furious` | `angry` |
   | love | `love` | |
   | boredom | `sleepy` | + `{ zzz: "who" }` |
   | sadness | `crying` | `cry` |
   | singing | | `talk`, + `{ notes: "who" }` |
   | fainting | | `faint` |

   Whoever speaks in the story gets `talk` in that shot (with voices, the speaker's mouth moves by itself).
   Feelings over a head are effects now (`notes`, `hearts`, `sparkles`, `zzz`, `sweat`, `anger`, `label`: below);
   `icons` keeps "!", "?" and "idea".
6. **Pace by mood:**
   - **Funny:** quicker (1.5-2.2 s), more `zoom`, reactions right after the line.
   - **Heartwarming:** slower (2.5-3.5 s), warm evening light, `push` and `rise`, hearts and sparkles.
   - **Spooky:** night light, `low` and `shake`, long silent beats, the forest or a dark bedroom.
   - **Dramatic:** close-ups and `xclose`, whips on reveals, big words for numbers.
7. **Open strong:** the first shot should hook in under 2 s (a striking face, a strange object, a question), and the
   last shot should land the story (the reaction, the twist, everyone laughing).

## Effects: make each moment land

Effects (`fx` in a shot) are what make these videos feel alive. Each one brings its sound, which goes on the
timeline's Effects lane by itself. Put an effect **on the word** that calls for it (`at: "secret"`).

- **How many:** about one shot in two. Never the same effect on two shots in a row, and never more than two
  effects in one shot. A calm moment can have none: the contrast makes the next punch land.
- **Which one:**

  | The words | Effect |
  | --- | --- |
  | the key word, a reveal, a twist | `{ punch: true, at: "word" }` |
  | a number, a count, a time ("for a whole week") | `{ label: "who", text: "7 days", count: true }` |
  | someone's name, a nickname, who someone is | `{ label: "who", text: "my best friend" }` |
  | a name or word sung or shouted | `{ float: "Augustus" }` |
  | the punchline, a big number | `{ big: "THREE TIMES" }` |
  | singing, humming, music | `{ notes: "who" }` |
  | someone appears or vanishes, magic, "out of nowhere" | `{ magic: "who", appear: true }` |
  | someone arrives running, fast | `{ dash: "who" }` |
  | joy, surprise, "I jumped" | `{ jump: "who" }` |
  | someone pops into the picture | `{ bounce: "who" }` |
  | an impact, a slam, a scream | `{ shake: true }` |
  | a photo, a sudden idea, a flashback | `{ flash: true }` |
  | love, a crush | `{ hearts: "who" }` |
  | crying | `{ tears: "who" }` + face `crying` |
  | nervous, caught | `{ sweat: "who" }` |
  | mad | `{ anger: "who" }` + face `furious` |
  | bored, asleep | `{ zzz: "who" }` |
  | a win, a party, the happy ending | `{ confetti: true }` |

- **Match the face and pose** to the effect: `jump` with `happy` or `shocked`, `notes` with `talk` or `dance`,
  `magic` with `shocked` on the others.
- **Whips** (`whip: true`) still mark jumps between moments, with a whoosh.
- **Check them** on the effects sheet (`kairos_sheet` with `effects`): it shows each effect and lists any effect
  that is unknown, on a word the shot doesn't say, or with an unknown sound.

## Places, light and time

- **Places:** `home` (living room), `bedroom`, `school` (hallway with lockers), `town` (street with houses),
  `park` (playground) and `forest` (snowy forest with northern lights, a campfire and a cabin).
- **Light:**
  - **day:** clear and bright;
  - **evening:** warm and golden, lamps on;
  - **night:** cool blue, lamps and windows glowing.
- **Moving between places:**
  - A story moving from day to night is a strong shape: home in the evening → bedroom at night → forest at
    night.
  - Keep the same light for a place within one moment of the story; change it only when time passes.
- **If the story needs a place the engine lacks,** pick the nearest one and say so to the user, or add a new place
  in `blocky/places.js` (same pattern: a group, spots, a wide shot, a surface, its light).

## Characters

- **"Keep the Blocky cast"** (default): use the six of them.
  - Milo narrates by default; Ruby is the cheeky little sister.
  - Grandpa Bo tells bad jokes and is secretly wise.
  - Mom (Nadia) is calm and clever; Dad (Theo) laughs loud and cooks badly.
  - Zee is Milo's fearless best friend.
  - Cast roles to fit the story: if the user names someone "my brother", choose the closest cast member and keep
    that choice for the whole film.
- **"Make new characters":** describe them in `CAST` with clear, different silhouettes:
  - a different hair shape or a hat;
  - a strong shirt color;
  - kids at size 0.75-0.9, adults at 1.

  Write the user's description into the look (a red cap becomes `hat: "cap", hatColor: "#d83a3a"`).
  Then look at the cast sheet (`kairos_sheet` with `cast`): each new character from four sides.
- **Two or three people per shot** read best in a vertical frame. Use a wide shot for crowds.
- **Never copy a game's or brand's characters, avatars, logos or names**, or another creator's recurring
  character. Blocky is its own world.

## Captions

- `say` holds exactly the narration words of that shot, with its punctuation.
- Mark at most one or two `*key words*` per film section (a name, a number, the twist): they stay yellow.
- For dialogue inside narration, keep the quotes in the words: `say: '"Made you look!"'`.
- **Style:** the default `words` style fits narrated stories. `lines` (two lines, key words colored) suits slower,
  calmer stories.

## Sizes and sheets

- **Real sizes:** a Blocky figure is 1.8 m tall and everything around it is at its real size: a phone 15 cm, a
  battery 5 cm, a mouse 11 cm, a door 2.1 m, a desk 75 cm. A new prop needs its real size in `blocky/sizes.js`
  (`SIZES`: its longest side in meters); the engine sizes it from that. Never make an object bigger to be seen:
  show it with an `insert` shot instead.
- **Jointed figures:** poses can bend elbows, wrists, knees and ankles, turn at the waist and move the head on its
  neck. A new pose in `poses.js` uses those keys; every joint stops at its limit.
- **Sheets:** `kairos_sheet` draws every character (`cast`), pose (`poses`), face (`faces`), prop at real size
  (`props`) or a place from four angles in each light (`places`), and lists the problems its checks found. Look at
  the matching sheet after adding a prop, a character, a pose or changing a place, and fix every problem.

## Check your work

- **Look at frames with `kairos_frame`:**
  - one in the middle of every new place;
  - every insert;
  - every shot with three or more people;
  - the first and last shot.
- **What to check:**
  - **faces:** visible, not cut by the frame or hidden by the caption;
  - **effects:** by the right person, on the right word;
  - **inserts:** the object fills the frame;
  - **captions:** never more than three words on screen.
- **Effects:** a frame on each effect's word, and the effects sheet.
- **Set the length:** the film's `duration` must equal the story's length; set it with `kairos_film_settings`.
  `kairos_frame` says when they differ.
- **Render:** a 30-second film renders in about a minute.

## Voices

When the brief says **"Voices: make them with the film"** (or the user asks for narration), the voice leads:
Kairos packs the voice lines back to back (the film's narration is "packed"), and the shots cut on the voice's
real words by themselves.

1. **Write the shots first,** with the whole narration in their `say`.
2. **Cast** with `kairos_voices` and `cast`:
   - the narrator: `narrator` (type `narrator`) for a voice-over, or the character who tells the story, like
     `milo` (type `boy`), when they speak to the camera;
   - every character who talks, by their id in the cast (`bo`, not `grandpa-bo`), with the type from the cast:
     Milo boy, Ruby girl, Grandpa Bo `old-man`, Mom woman, Dad man, Zee boy;
   - new characters: their type from who they are.
3. **Write the script** with `kairos_script`: the narration in order, one or two sentences per line.
   - The words are exactly the shots' `say` (without the `*stars*`), in the same order.
   - The speaker is the narrator, or the character for their own spoken words: their mouth moves when they are in
     the shot.
   - Starts only give the order (0, 1, 2...): Kairos packs the lines back to back.
   - Then make it (`make: true`).
4. **The shots follow by themselves,** on the voice's real words: don't add `seconds` to fit the voices.
5. **Set the length:** look at a frame (`kairos_frame`): when the story's length differs from the film's, it says
   so. Set `duration` to it.
6. **Check** a few frames: each caption should show while its words are spoken.

## Sound

- **Music:** the user can put music under the voice (New film's "Music", or the Sound tab): it loops and gets
  quieter while voices talk. Don't add music yourself unless asked; `kairos_assets` lists theirs.
- **Effect sounds** come with the effects. Never add the same sound by hand.
- If the user adds their own voice recording to `kairos.json` `audio`, get its word times (`kairos_words` with
  `transcribe: true`) and cut the shots on them.
