---
name: kairos-blocky
description: Directing Blocky films in Kairos - narrated stories with blocky toy characters, quick shots and word-by-word captions. Use whenever a Kairos film was made with the Blocky template (it has story.js and a blocky/ folder), or the user asks for a blocky, toy-like 3D story video.
---

# Blocky films

A Blocky film is a narrated short story: a voice tells it in the first person ("Last winter, my best friend...")
while quick shots show blocky toy characters acting it out, with big expressive faces and captions that pop in a
few words at a time. The film's `CLAUDE.md` has the `story.js` reference. This skill is about making it **good**.

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
- **Extras:** icons pop by a head (music notes when singing, ! when surprised, Zzz when bored or asleep, hearts),
  big see-through words for numbers or punchlines.

## From story to shots

1. **Split the narration into beats of 3-7 words.** Each beat is one shot: its `say` is those words, `seconds`
   about words ÷ 2.5 (plus 0.3 s after a sentence ends). Never put a whole sentence over one long shot.
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
   | boredom | `sleepy` | + `zzz` |
   | sadness | `crying` | `cry` |
   | singing | | `talk`, + `music` |
   | fainting | | `faint` |

   Whoever speaks in the story gets `talk` in that shot.
6. **Pace by mood:**
   - **Funny:** quicker (1.5-2.2 s), more `zoom`, reactions right after the line.
   - **Heartwarming:** slower (2.5-3.5 s), warm evening light, `push` and `rise`, hearts and sparkles.
   - **Spooky:** night light, `low` and `shake`, long silent beats, the forest or a dark bedroom.
   - **Dramatic:** close-ups and `xclose`, whips on reveals, big words for numbers.
7. **Open strong:** the first shot should hook in under 2 s (a striking face, a strange object, a question), and the
   last shot should land the story (the reaction, the twist, everyone laughing).

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
- **Two or three people per shot** read best in a vertical frame. Use a wide shot for crowds.
- **Never copy a game's or brand's characters, avatars, logos or names**, or another creator's recurring
  character. Blocky is its own world.

## Captions

- `say` holds exactly the narration words of that shot, with its punctuation.
- Mark at most one or two `*key words*` per film section (a name, a number, the twist): they stay yellow.
- For dialogue inside narration, keep the quotes in the words: `say: '"Made you look!"'`.
- **Style:** the default `words` style fits narrated stories. `lines` (two lines, key words colored) suits slower,
  calmer stories.

## Check your work

- **Look at frames with `kairos_frame`:**
  - one in the middle of every new place;
  - every insert;
  - every shot with three or more people;
  - the first and last shot.
- **What to check:**
  - **faces:** visible, not cut by the frame or hidden by the caption;
  - **icons:** by the right person;
  - **inserts:** the object fills the frame;
  - **captions:** never more than three words on screen.
- **Set the length:** the film's `duration` must equal the sum of `seconds`; set it with `kairos_film_settings`.
- **Render:** a 30-second film renders in about a minute.

## Voices

When the brief says **"Voices: make them with the film"** (or the user asks for narration), the voice leads and
the shots follow it:

1. **Write the shots first,** with `say` on every spoken shot, as usual.
2. **Cast** with `kairos_voices` and `cast`:
   - the narrator: `narrator` (type `narrator`), or the character who tells the story, like `milo` (type `boy`);
   - every character who talks (`talk`), with the type from the cast: Milo boy, Ruby girl, Grandpa Bo `old-man`,
     Mom woman, Dad man, Zee boy;
   - new characters: their type from who they are.
3. **Write the script** with `kairos_script`: one line per spoken shot.
   - The words are its `say` without the `*stars*`.
   - The speaker is the narrator, or the character for spoken dialogue.
   - The start is the shot's start (the sum of the `seconds` before it).
   - Then make it (`make: true`).
4. **Fit the shots to the voice:**
   - Every spoken shot lasts its line's length plus about 0.3 s (the answer gives each length). Silent shots keep
     their own length.
   - Then write the script again with the new starts and make it again: unchanged lines are reused, so it costs
     nothing.
   - Set the film's `duration` to the new sum of `seconds`.
5. **Check** a few frames: each caption should show while its words are spoken.

## Sound

If the user adds their own voice recording to `kairos.json` `audio`, time each shot's `seconds` to it so the
captions match the voice (`kairos_words` with `transcribe: true` gives its word times).
