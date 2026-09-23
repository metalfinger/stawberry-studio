# Dream chat: plan

A chat that listens to someone's dream until it understands it, then builds the dream with them,
picture by picture. The person needs to know nothing about film or about Strawberry Studio. The
harness does.

It combines three things that already exist:

- **The two-call form harness** from vibechk (`experiments/two-call-form`). Each turn, Jev reads
  the conversation and reports facts with evidence, code picks the next move, and a second model
  writes the reply.
- **Strawberry Studio's engine and its order of work.** The breakdown (scenes, shots, cuts) comes
  first, then the people, places, things and style, then their sheets, then frames with
  references. The engine's checks apply throughout.
- **Images and checks.** fal draws the pictures with Nano Banana Pro ($0.15 per image, up to 14
  reference images, with an edit mode). The image judge on the PC checks them.

It runs locally first.

## Principles

1. **Listen first, build second.** No pictures appear while the person is telling the dream. A
   picture shown too early can overwrite the memory it was meant to capture, and it turns telling
   into critiquing.
2. **Know what's needed, don't push for it.** The harness keeps a silent checklist and follows
   the person. It asks for a missing piece only when there is room, at most twice, and it accepts
   "I don't remember" as an answer. Dreams are vague, so gaps are normal.
3. **Plain words only.** The chat never says "shot", "cut", "angle", "palette" or "character
   sheet". It asks "were you looking up at her?" and writes `camera.angle` itself.
4. **Recognition beats recall.** In the build part, the harness drafts something (a profile, a
   picture) from what it heard and asks the person to confirm or correct it. Confirming is easier
   than describing.
5. **Ask, don't announce.** The chat says "Would you like to see it?", never "Generating image".
6. **The chat never waits for a picture.** Pictures appear on the right as they finish, and the
   conversation carries on.
7. **Code decides, models phrase.** This is the form harness's rule. Jev reports facts with
   evidence. Code picks the move and starts any job. The reply model only writes the words.

## The conversation, in three parts

### Part 1: Listen (no pictures)

The chat opens with one open question: "Tell me the dream, however it comes back to you." After
that it mostly follows the person's lead:

- It acknowledges what they said.
- It explores what they just said.
- It circles back to threads left hanging.

Only when the telling slows down does it ask about a story goal that is still empty.

| Goal | Asked as (only if not already told) | Feeds in Strawberry |
|---|---|---|
| `telling` | "What happened, from the start?" | scenes and their order |
| `places` | "Where were you?" | locations |
| `people` | "Who else was there?" | cast, starting with the protagonist |
| `you_in_it` | "Were you watching it, or were you in it?" | point of view; whether the dreamer appears |
| `key_moment` | "If you could pause it on one moment, which one?" | the key frame |
| `feeling` | "How did it feel? Did that change?" | emotional intent per scene |
| `look` | "What did it look like: the colours, the light, the time of day?" | style: palette, lighting rules |
| `strange` | "Was anything impossible or strange?" | world logic |
| `things` | "Was there an object that mattered?" | props |
| `ending` | "How did it end? Did you wake up?" | the last frame |
| `sound` (optional) | "Do you remember any sounds?" | sound fields |

`look` and `things` are new. The other goals follow the lab's existing dream form, rewritten here
without its production data. A goal counts as **settled** in any of three cases:

- it is covered, with evidence;
- the person has said they don't know;
- it doesn't apply to this dream.

`look` asks what the dream looked like, which is a memory. How the person wants it drawn is a
choice, and it is asked in part 2. The two answers are often the same ("like an old film").

**Moving on.** Code moves to part 2 when every required goal is settled (all of them except
`sound`) and one of these is true:

- Jev says the person has reached a natural end of their account;
- the person says they're done;
- a soft turn limit is reached (about 20 turns).

It never cuts off a telling that is in progress.

### Part 2: Retell, then ask

1. **Breakdown.** In the background, the producer (see "The pieces") turns the transcript into
   Strawberry's breakdown:
   - scenes, then shots, then cuts, aiming for 6–10 frames;
   - the people, places and things;
   - the look;
   - what is still unknown.
2. **Retell.** The harness tells the dream back in plain words, then lists the moments it would
   picture as a short numbered list, and asks: "Did I get it right? Anything missing?" This is the
   scenes, shots and cuts step in plain words. It is also where the person catches
   misunderstandings before anything costs money. Corrections go back into the breakdown, and
   only the changed part is retold.
3. **Ask.** "Would you like to see it?"
   - Yes: move on to the style.
   - Not yet: go back to listening. The offer comes again later, at most twice.
4. **Style.** The harness offers three or four options in words, built from what the person said
   about the look, plus "as it looked in the dream". Their choice becomes Strawberry's style
   bible. Optional later: fixed sample swatches per style, never pictures of their dream.

### Part 3: Build (Strawberry's order)

From here on, everything follows Strawberry's own sequence. First the right panel fills with every
item the breakdown found. Each item is marked *waiting for details* and lists what it still needs,
so the person sees the plan before anything is drawn.

**Sheets for people, places and things.** They are drafted one at a time: the protagonist first,
then whatever is in the key moment, then the rest in order of first appearance.

1. The producer drafts a profile from what was said. Anything it invented is marked as a guess.
2. The chat shows the profile: "Here's how I picture your grandmother: … I guessed the grey coat.
   Anything to change?"
3. Jev reads the answer: confirmed, changed (which detail, and in which message), or "you choose".
4. If something that matters for the picture is missing, the chat asks one question, at most two.
5. Once the profile is settled, the sheet starts drawing. The only mention is "I'm sketching her;
   she'll appear on the right." The chat then moves to the next profile, so several sheets can
   draw at once.
6. When the sheet is ready, at the next natural pause, the chat asks: "Her sheet is up. Does she
   look right?" A correction makes version 2, edited from version 1.

If the dreamer is in the dream and visible, the chat asks gently how to draw them: "as you are,
or as you were in the dream?"

**Frames.**

- **Order:** the key moment comes first, because it is the payoff and the best test of the style.
  The rest follow in story order.
- **When a frame starts:** once its people and place have sheets and its details are settled.
- **Where the details come from:** mostly the breakdown. The harness asks only what the person
  can know and the picture needs, for example "When she handed you the key, were you close enough
  to touch her?"
- **References** follow Strawberry's rules. Every frame uses the sheets of everyone and
  everything in it.
  - When the moment continues from the previous frame, that frame is a reference too.
  - When the camera moves to a new view, the previous frame is not used as a base; the right
    view of the place is used instead.
  - The depth limit applies, so copies of copies don't drift.
- **Reactions:** the chat asks for them on the key frame and on any frame the judge flags. For
  the rest, the person can comment whenever they like. A comment on any item makes a new version
  of that item.

**Waiting.**

- If the person asks about something still drawing, the answer is "Still drawing, about a
  minute."
- If everything is drawing and nothing is left to ask, the chat says so plainly and stays open.

## What the harness knows

This lives in code, not in a prompt.

**The item types, and what each needs.** These come from Strawberry's field vocabulary
(`backend/studio/fields.py`) and readiness rules (`backend/studio/production.py`). Each detail is
marked required or optional and has a plain question plus a default for when the person doesn't
know. Defaults are shown in the profile as guesses.

| Item | Needed before drawing (asked, or guessed and shown) | Plain question hints |
|---|---|---|
| Person | who they are to the dreamer; age; build; face and hair; clothes | "How old was she, roughly?" "What was she wearing?" |
| Place | what kind of place; what's in it; the light | "Was it inside or outside?" "Was it dark?" |
| Thing | what it is; size; material; colour | "Could you hold it in one hand?" |
| Frame | who is in it; where; what happens; whose eyes; how close | "Were you close to her, or across the room?" |
| Style | medium; colours; light rules | chosen from the options |

**The order.**

- The style comes before any sheet.
- A frame comes after the sheets it uses.
- Otherwise, whatever is ready goes first. It's a dependency graph, not a fixed list, so a place
  described fully early on is drawn early.

**How to steer without pushing.** The next question comes from whatever the next item is still
missing. It is asked only when the person isn't mid-thought, and each detail is asked at most
twice.

## Jev's judgments

Every turn, Jev answers typed questions about the transcript. The lab already asks for coverage
with evidence pointers, applicability and wants_out. The new judgments are:

| Part | Judgment | Answer |
|---|---|---|
| 1 | Has the person reached a natural end of their account? | yes / no |
| 1 | Have they said they don't remember X? | yes / no, per goal |
| 2 | Did they accept the retelling? | confirmed / corrected / added more / unclear, with the message |
| 2 | Do they want to see it? | yes / not yet / no |
| 2 | Which style? | one of the options / something else |
| 3 | Did they accept the profile? | confirmed / changes / you choose / unclear |
| 3 | Each detail of the current item | covered, with evidence |
| 3 | Their reaction to a picture | matches / mostly / wrong / none |
| 3 | Which item are they talking about? | one of the items on screen |

The last judgment matters: someone confirming the grandmother may say "the kitchen's too dark".
Jev only says that there is a correction, where it is, and which item it is for. The producer
turns the words of the correction into an edit.

## Moves

The lab's moves stay as they are: `open_ended`, `explore_thread`, `circle_back`, `probe_goal`,
`acknowledge`, `converge` and `wrap`, with `MAX_ASKS_PER_GOAL = 2`. The new moves, all chosen by
code:

- `retell`: tell the dream back.
- `offer_visualize`: ask "Would you like to see it?"
- `choose_style`: offer the style options.
- `confirm_profile`: show a drafted profile.
- `ask_detail`: ask for one missing detail of the current item.
- `react`: ask about a finished picture.
- `waiting`: say what is still drawing.

Starting a picture is not a move. Code does it when an item becomes ready, alongside whatever the
conversation is doing. The lab's switches on `move.kind` have no default case. In the copied code,
every one of them gets an exhaustive `never` check, so the new moves can't fall through silently.

## State

- **`phase`:** listen, then retell, then build, then done.
- **Goals:**
  - part 1 goals are fixed;
  - part 3 goals are created per item from the breakdown, for example `person:p1.clothes` or
    `frame:f3.pov`.
- **Items.** Each item has:
  - a kind and a short ID (P1, L1, T1, F1…);
  - fields, each with its evidence and a guessed flag;
  - a confirmed flag;
  - its Strawberry node ID.
- **Jobs.** There is one row per picture version, keyed by item and version.
  - Each row has a status (queued → drawing → checking → ready / needs a fix / failed), the
    Strawberry recipe, job and media IDs, and the judge's result.
  - A new version is created only by a new confirmation or correction message, so re-reading the
    same facts never starts a second job.
  - Jobs are stored separately from the conversation record. A picture that finishes mid-turn
    therefore can't be overwritten when that turn saves.
- **Turns** run one at a time per conversation, through a per-conversation queue. Status reads
  don't wait.
- **Budget:** images used, against the cap.

## The pieces

| Piece | What it does | Comes from |
|---|---|---|
| Chat server (Bun) | Turn loop, phases, moves, job ledger, panel API | The lab's `server.ts`, `lib.ts`, `jev.ts` and `llm.ts`, copied and extended. Its production forms and characters are not copied |
| Jev | Facts and judgments every turn | TypeSafe API, as in the lab |
| Reply model | Writes the words (DeepSeek v4 pro) | As in the lab |
| Producer | Works in the background: breakdown, profile drafts, Strawberry fields, edit instructions from corrections | New. It does the work the host assistant does in Strawberry today, following `.agents/skills/strawberry-production/PLAYBOOKS.md` |
| Strawberry engine | Records every item, recipe, job, picture and check; builds prompts; picks references; enforces depth and take limits | This repo, called through its JSON CLI. The prompt builders in `autoloop/cuts.py` and `autoloop/sheets.py` move into the engine first |
| fal provider | Draws pictures with Nano Banana Pro, using its edit mode for new versions | New, beside Higgsfield in `backend/studio/providers.py`, with `"fal"` added to the provider list in `backend/studio/models.py` |
| Judge | Checks each finished picture against its declared facts | The PC judge host, through `backend/studio/evaluators/remote_judge.py` |
| Web page | Chat on the left, panel on the right | The lab's page, extended |

**Approval.** In Strawberry, a person approves every paid job. Here, the person's "yes, show me"
plus the image cap stand in for that approval, and the harness approves within the cap.

**Failed checks.** A picture that fails its check is redrawn once automatically, within the cap.
The redraw shows as the next version.

**Keys.** They live in `~/.config/strawberry/dreamchat.env`, outside the repo: `JEV_API_KEY`,
`DEEPSEEK_API_KEY` and `FAL_KEY`. The judge's keys are already in `~/.config/strawberry/judge.env`.

## The panel

- **Folders:** Story, Look, People, Places, Things, Frames.
- **Each row:** thumbnail, name, short ID, status and version. Rows marked *waiting for details*
  say what's missing.
- **Clicking a row** opens the full picture, the prompt, what it was built from, and the judge's
  answers.
- **In the chat,** the same item appears as a card that fills in when it's ready.
- **Debug view:** it keeps the lab's trace panes (ledger, turn, calls, prompt).

## Testing

- **Simulated dreamers.** A model plays someone who knows only a dream's text, using the DreamBank
  dreams already used here. It is told to be vague, to forget things and to use no film words.
  Runs use Strawberry's fake image provider, so they cost nothing in images.
- **What every run checks:**
  - no picture before the person says yes;
  - one job per item version;
  - nothing asked again that was already answered;
  - no film words in the host's messages;
  - the retelling covers the dream's events;
  - how many turns it takes to reach part 2;
  - questions per goal stay within the cap.
- **One real run** end to end, with fal and the judge, before showing it to anyone.

## Build order

Each step ships on its own and is measured with the simulated dreamers before the next one starts.

1. **Listen.** *Built* (`dreamchat/`). Copy the lab loop. Add the story goals, including `look` and
   `things`, and the don't-know handling. Add the per-conversation turn queue and the simulated
   dreamers. Text only.
2. **Retell and ask.** *Built.* The retelling, the ask, the style choice, and the producer's
   breakdown written into Strawberry. Changes from the plan above, each for a measured reason:
   - The retelling is written from the conversation, not from the breakdown. The producer takes
     18–22 s, so it drafts in the background while the person answers the retelling. By the
     style question it had finished, or needed a wait of up to 13 s.
   - Jev checks every detail the producer marks as said against the person's own messages.
     Anything it can't find becomes a guess.
   - The engine's only open issue on every written production is "approve a reference for …":
     the sheets, which is step 3.
3. **Sheets.** *Built.* Profiles and their confirmation, the fal provider in the engine, the
   image limit, the panel and the judge badges. Changes from the plan, each for a measured
   reason:
   - Each item gets one identity picture, not a sheet of views. Labelled grids came back with
     "front view" and "side view" drawn in whatever the prompt said.
   - Colours are named, not given as hex, after hex codes came back drawn as swatches.
   - Jev removes story states from profiles, after a woman whose head turns to ice was drawn
     with the ice.
   - The judge only informs: there is no automatic redraw until it has been measured against
     people's verdicts.
4. **Frames.** *Built.* The key moment first, then story order, three at a time, each drawn
   from the approved sketches of what is in it. Reactions and new versions work as for
   sketches. Frames reference sketches only, not the previous frame: continuity chaining
   (Strawberry's `continuity_from`) is the next improvement.
5. **Waiting and polish.** Statuses in the brief, pacing, the cap and error states.

## Step 3 design: every item is a form

The lab's construct is a form: a list of goals, each with a plain probe hint. Jev reads coverage
with an evidence pointer, code picks the move, and each goal is asked at most twice, with
not-applicable and don't-remember as answers. Step 1 runs the dream's story as one such form.
Step 3 runs the Strawberry part as more of them: **one small form per item, generated from
the breakdown, in Strawberry's order.** The machinery (`selectMove`, `readState`,
`renderBrief`) runs them unchanged.

| Form | Its goals (Strawberry fields) | Pre-filled from | Asked as |
|---|---|---|---|
| The look | the chosen style, palette, light | the style they chose | nothing more to ask |
| Each person, protagonist first | identity, appearance, wardrobe, distinctive features | the breakdown's details | "Here's how I picture her: … Anything to change?" |
| Each place | geography, landmarks, light | the breakdown | "Here's the kitchen as I see it: …" |
| Each thing that matters | appearance, materials | the breakdown | only if it is seen closely |
| Each moment (cut) | what happens, who's in view, whose eyes, how close | the breakdown | only the key moment is confirmed; the rest ride on the retelling |

How a goal starts:
- **Said, with evidence:** covered, and never asked.
- **Guessed:** open. It is shown to the person as part of a profile to confirm, never asked
  as a bare question.
- **Empty:** open, and asked with its plain hint.

Answers are read the lab's way:
- A confirmation covers every guess in the profile it was shown in.
- "You choose" settles a guess as a proposal the person accepted.
- "I don't remember" settles it as unknown, drawn from the guess.

Each settled field is patched into Strawberry with its source: their words, or the accepted
proposal.

The form moves on when its required goals are settled. Code then:
- starts its sheet (the job ledger, keyed by item and version);
- opens the next form in Strawberry's order: style, then sheets in the order people, places,
  things, then the key moment, then the frames in story order.

The conversation never waits on a picture.

The same construct handles pictures coming back. When a sheet lands, the item's form gains
one goal, "does it look right?". Jev reads it as matches / mostly / wrong / no answer. A
correction points at its message and becomes version 2, edited from version 1. That is the
lab's evidence pointer driving an image edit.

What stays the same across every form:
- **Code picks the move.**
- **The model phrases it.**
- **Two asks at most per goal.**
- **Unknown is an answer.**
- **One turn at a time**, with background jobs reporting back through the same queue.

## Defaults (change any)

- **Producer model:** DeepSeek v4 pro, the same model that writes the replies.
- **Image cap:** 30 per conversation (about $4.50).
- **Order:** the key moment is drawn first.
- **Failed checks:** one automatic redraw when the judge fails a picture.
- **Parallel drawing:** up to three pictures at once.
