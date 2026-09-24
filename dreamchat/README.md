# Dream chat

A chat that turns someone's dream into pictures. It:
- listens until it understands the dream, and tells it back;
- asks whether they'd like to see it, and lets them choose how it should look;
- confirms each person, place and thing with them, and sketches it;
- draws the moments from those sketches, the key one first.

Everything goes through Strawberry Studio's engine: the production, every recipe, approval,
job, picture and check. Steps 1–4 of `../DREAM_CHAT_PLAN.md`.

The conversation moves through these phases:

| Phase | What happens | Pictures |
|---|---|---|
| Listening | They tell the dream; Berry follows, then asks about gaps | none |
| Telling it back | Berry retells it; corrections are settled here | none |
| Seeing it | "Would you like to see it?", then four ways it could look | none |
| Drawing: profiles | Up to two people, the key moment's place and the dreamer (if seen) are shown as Berry pictures them; confirmed or corrected. Everything else is sketched unasked | a sketch starts for each one settled |
| Drawing: sketches | Finished sketches are shown; "looks right" approves one, a correction redraws it | redraws |
| Drawing: moments | In story order, each moment drawn from the sketches and from the earlier moments it has to match (the continuity plan, below); the key one is asked about by name | one per moment, plus in-between references and redraws |
| Done | Berry says what was drawn, and honestly what couldn't be | none |

Every turn works like this:

1. **Jev reads.** It reads the whole conversation and answers typed questions: which parts
   of the dream have been told (pointing at the message), which the person doesn't
   remember, whether they've reached the end, and how they're talking.
2. **Code picks the move** from those facts (`lib.ts` → `selectMove`). While the person is
   still telling the dream, Berry follows along. Once they reach the end, Berry asks about
   the gaps, at most twice each. When the story is understood, Berry tells it back.
   - Three messages in a row that add nothing new to what happened count as reaching the
     end, because a dream that is a place rather than a plot never ends as a story.
   - Two "I don't remember"s in a row after the end mean it is told back.
   - While moments are being drawn, and when the person leaves, Berry is told how many are
     up and how many are still to come.
3. **DeepSeek writes the words**, steered by a short private brief. It never picks the move.
   It writes ordinary replies without thinking (about 2 s) and thinks before the turns that
   change the conversation, such as telling the dream back (about 10 s). A retelling is
   checked by Jev before the conversation moves on.

After the retelling, a **producer** drafts the production in the background while the person
answers (`producer.ts`). It writes:
- the scenes and the moments to draw;
- the people, places and things;
- what the dream looked like;
- four ways it could be drawn.

Every detail is marked as said by the person or guessed. **Jev then checks every "said" against
their own messages** (`ground.ts`), and anything it can't find becomes a guess. Once they choose
how it should look, the whole production is written into Strawberry through its JSON CLI
(`strawberry.ts`), into an isolated store (`strawberry-home/`, never the shared one). The person's
words are captured as the source of what they said, and a proposal is the source of what was
filled in.

### Continuity

A storyboard has to read as one sequence, not as separate pictures of the same world. Before
any moment is drawn, `continuity.ts` makes a plan from the breakdown and Jev's judgments. Jev
decides three things:
- which earlier moment each one must match;
- whether two moments face the same side of a place;
- whether a change (a head turned to ice) still holds.

What each moment is drawn from depends on how the camera moves:

| How it follows an earlier moment | Drawn from that moment as | Takes |
|---|---|---|
| Same place, side and framing | an edit base | the picture itself, a moment later |
| Same side, new framing | composition | where the room and everyone in it are |
| The other side of the room | lighting | the light and how people look, not the walls |
| Another place, same people | identity | how the people look now |
| A jump the dream made (only if they told it) | composition, as a match cut | the framing; the dream changes the rest |

Other rules:
- **Sheets.** They always go in for identity.
- **Base edits.** At most two run in a row, then a moment is redrawn from the sheets so drift
  stops.
- **Ghosts.** An in-between reference is made only when it is needed: a changed look that
  happened out of view and is then seen twice, an edit that would otherwise change three things
  at once, or a close-up that is the first to face a side of a room that wider moments need.
  Ghosts are never shown as the dream.
- **Order.** Moments are drawn as what they need lands.
- **Approval.** The chat approves a moment for what follows only when the judge saw everything
  in it; otherwise what follows waits for the person's verdict, and Berry says so.
- **What a moment changes.** A moment's own change (the ice becomes a horse's head) replaces
  the look it had: the picture is told and checked for the new look, and the old one is never
  "still so".
- **Staging.** A scene places its people once, left to right, from the first picture that shows
  two or more of them; newcomers stand to their right. Every later picture of the scene is told
  the order and checked for it, so the line between them is never crossed. A jump starts it again.
- **Medium.** Every style says what the pictures are made as (a photograph when it names none),
  every prompt states it, and each moment is checked for being made the same way as the picture
  it follows.
- **What was invented.** What the judge finds invented in a picture (a viewer's hands) counts
  toward its one repair, and every picture drawn from it is told to leave it out.
- **Corrections.** A correction redraws only the later pictures it touches.
- **What Strawberry records.** Everything goes into Strawberry as `continuity_from`,
  `continuity.before`/`after`, `transition` and `match_frame`, and the engine checks the chain.
  `continuity.before` is what the still shows: its own change done, and what still holds. A
  cut's record is set to its plan before each draw.

The loop, the judge's evidence rules and the reply contract are copied from vibechk's
two-call form lab (`experiments/two-call-form`, commit adcbaccdd), with each file's
changes noted at its top. Its production forms and characters are not copied.

## Run

```sh
cd dreamchat
pnpm install          # once: type-checker and formatter only; the app has no dependencies
bun run server.ts     # http://127.0.0.1:8790, this machine only
```

Pictures are drawn by the engine's own worker, which the server starts for its store (with
`--allow-fal` when drawing with fal). Every paid picture is a Strawberry recipe, approved in
the engine with the reason recorded (the person asked to see their dream and settled what is
in it) and a ceiling of $0.20. The chat stops at the per-dream limit. A picture the person
says looks right is approved in Strawberry and selected as the reference for everything it
appears in. A correction rejects that take and draws the next version.

The Strawberry engine must be installed at the repo root (`./install-studio.sh`, or just
`python3 -m venv venv && venv/bin/pip install -r requirements-studio.txt`); without it the chat
still runs and writes nothing. To look at what was written, open the viewer on the same store:
`venv/bin/python -m backend.studio --home dreamchat/strawberry-home start --port 8788` from the
repo root.

Keys are read from `~/.config/strawberry/dreamchat.env` (`JEV_API_KEY`, `DEEPSEEK_API_KEY`), or
from the file named by `DREAMCHAT_ENV`. The shell's own environment wins. Conversations are
saved under `state/`, which is gitignored.

The right-hand panel shows what Berry has understood. Click the label under any reply to see
why it was said: the move, the rule that picked it, the brief, and the exact judge and model
calls.

| Variable | Default | |
|---|---|---|
| `PORT` | 8790 | |
| `DREAMCHAT_HOST_MODEL` | `deepseek-v4-pro` | the model that writes Berry's replies |
| `DREAMCHAT_HOST_THINKING` | `disabled` | while listening: `disabled` / `low` / `high` / `max` |
| `DREAMCHAT_HOST_THINKING_DEEP` | `low` | for the turns that change phase: retelling, corrections, closing |
| `DREAMCHAT_PRODUCER_THINKING` | `disabled` | the producer's thinking; `low` took 2–4× longer for the same breakdowns |
| `DREAMCHAT_STRAWBERRY_HOME` | `dreamchat/strawberry-home` | where productions are written |
| `DREAMCHAT_PROVIDER` | `fal` when `FAL_KEY` is set, else `fake` | `higgsfield` draws with Nano Banana Pro there (2 credits); `fake` draws labelled offline placeholders, at no cost |
| `DREAMCHAT_JUDGE` | `assistant` | `assistant`: each take waits in `judge-queue/` for the assistant's answers; `pc`: the judge on the PC; `off` |
| `DREAMCHAT_IMAGE_CAP` | 30 | pictures per dream, at most ($4.50 at fal's list price) |
| `DREAMCHAT_JUDGE_ENV` | `~/.config/strawberry/judge.env` | `JUDGE_URL` and `JUDGE_API_KEY` for the image judge on the PC |
| `JEV_MODEL` | `jev-latest` | |

## Trying it

Open http://127.0.0.1:8790, press **New dream** and tell a dream the way you'd tell a friend. Berry:
1. listens, then tells it back;
2. asks whether you'd like to see it, and offers four ways it could be drawn;
3. shows each person and place as it pictures them;
4. shows the sketches, then the moments.

Say "that's right", correct anything in your own words, or say you'd leave it to Berry. The
right-hand panel shows what Berry has understood, the production, and every picture with the
judge's count of the declared details it saw. Each moment there says what it was drawn from and
why, with the judge's continuity check against those pictures. The in-between references and the
plan's findings are listed under the moments.

A simulated run (`simulate.ts`) is saved beside your own conversations; restart the page to open
it there.

A dream costs roughly $0.15 × (people + places + things + moments + ghosts + redraws) on fal, or 2
Higgsfield credits a picture: usually $1–3 or 20–40 credits, and never more than the limit. The
panel counts each provider in its own unit.

Known limits:
- Without the judge on the PC, each moment drawn from another waits for the person's verdict on
  it, so the moments come one after another as they answer.
- The judge's badge informs, and decides nothing; it hasn't been measured against people's
  verdicts yet.
- A style option can still carry some of the dream's content (a little ice at a woman's feet).
- A download from fal's CDN sometimes times out; it is collected again twice at no cost before
  the picture counts as failed, and Berry says honestly if one never arrives.
- Who stands where is kept by words and checked by the judge; the model can still swap two
  people, and a picture gets one repair.
- Strawberry's palette question is literal: skin and denim fail a cold palette, so its "no" is
  noise for pictures of people.
- A submission cut off before the provider answered (Higgsfield's 503) stays in doubt until
  someone checks the account; `resume.ts --redraw` draws it again once they have.

### Nothing is drawn on a guess

Every sketch, in-between reference and moment passes a confidence gate before it is paid for
(`gate.ts`):
- **Code** checks what it can know for certain:
  - the plan has nothing open for the picture;
  - every attached image is described with what to take from it;
  - an edit base is the first and only one;
  - every image is approved;
  - everyone in view brings their sketch;
  - the images fit the model.
- **Jev** reads the exact prompt and answers four questions:
  - does it disagree with itself about what is shown?
  - would someone be drawn twice?
  - does it say who, where and what without the artist inventing it?
  - is each image's purpose clear?

A picture that fails is held with its reasons, and what depends on it waits. Nothing is counted
or paid for. A held moment is reworded once, in text, then read again. A held sketch has its look
proposed afresh, then the person is asked. `resume.ts` and `plan.ts --gate` put held pictures
through the gate again.

Each kind of picture is asked what matters for it:
- **A sketch** is asked whether its look is given (age, build, hair, clothes; a place's kind,
  layout and contents; a thing's shape, materials, colours).
- **An in-between picture** is an edit, and is asked whether its one change is plain and what
  stays. Asked as a scene, every in-between picture of five dreams was held.
- **A moment's contradiction reading** rises with how much it asks. Between 0.45 and 0.55 it is
  held only when leaving one of its lines out lowers the reading by 0.08 or more. The finding
  names that line, so a rewording knows where to look.

### How pictures are prompted

What Nano Banana Pro follows, from its makers' guidance, from the first Strawberry Studio's
lessons and from Jev's readings of every moment in five dreams (`frames.ts`, `sheets.ts`):

- **One image says who each person is: their sketch.** A second face image for the same person
  pulls the model off them. The first Strawberry Studio lost a character's glasses to an
  expression variant beside the sketch, and Jev read two such images as claiming the same thing.
  The picture they were last seen in goes in only for someone without a sketch.
- **No image goes in for its light alone.** The model takes more than light from a picture: m5
  of the streetcar drew the dreamer in the pose of the picture attached for its light. Light is
  said in words, and the place's sketch gives its light as well as its look. The judge still
  compares the light with the picture before. Without those images, moments read clearer on
  what each image is for (0.81 against 0.75), and fewer are held (29 reads of 136 against 40).
- **Earlier pictures are named by who and where they are** ("picture 4 (the dreamer, at the top
  of the train)"), never by what happens in them, which would be drawn again.
- **Every image is numbered and says what to take from it and what to leave out** ("Nothing
  else from it: not its pose, background or framing"). Without the leave-out, what each image is
  for read less clear (0.75 against 0.70).
- **Everyone in view is listed with their look**, even though their images carry it. Said only
  beside the images, moments read as less clear (0.82 against 0.78).
- **Lines about the whole picture say what is there**: surfaces free of writing and badges, one
  picture filling the frame, the dream's strangeness as solid and ordinary as everything around
  it. The line against double exposure stays as it was, since it fixed a failure we saw.
- **The frame's shape is said in words and sent as a setting**, with 2K resolution: each sketch
  in its own shape, every moment 16:9.
- **A moment's part in the story** ("the turn", "the waking") stays on its record. A picture can
  only draw it by inventing something.
- **In a style made in one colour**, colours in a look that was filled in are said as tones
  ("medium brown hair" is "dark hair"), and every image is told to draw its person in the
  picture's shades. A colour of its own is a serious failure, repaired like the wrong clothes.
  What the person said keeps its colour.
- **A redraw is told what to put right as instructions**, the palette by name and never as hex
  codes, with what the judge saw last time.

### Feeling like a dream

Each moment says what in it is impossible, or wrong the way dreams are, that the dreamer simply
accepted, and it is drawn as plain fact. Each style says how its pictures feel like a dream,
taken from how this dream felt, as technique only. A style that says nothing gets the stillness
of a remembered moment, never added fog or haze.

### Resuming a dream

```sh
DREAMCHAT_PROVIDER=higgsfield bun run resume.ts <session id> [--redraw m6]
```

It picks a saved dream up where it stopped:
- plans its unapproved moments again with the current planner and corrects their records;
- draws again what failed before it was ever submitted;
- judges takes that landed while nothing ran, and waits for the judge.

Nothing already paid for is redrawn. A picture whose submission is in doubt (a 503 before the
provider answered) is drawn again only when named with `--redraw`, after the provider's account
shows it never ran.

### Seeing every prompt before paying

```sh
bun run plan.ts <session id> [m5 g2 …]
```

It prints the dream's continuity plan with its findings: the draw order, each moment's shot,
what it is drawn from, who stands where and what changes. Then comes each picture's prompt and
references, as if everything before it had been drawn and approved. It makes no model calls and
draws nothing.

### The assistant as judge

Each take is written to `judge-queue/<media>.json` with Strawberry's own questions for it and
the continuity checks against the pictures it was drawn from. The answers go beside it as
`<media>.answer.json`: `{answers: {<question id>: {answer, where}}, continuity: {<index>:
"yes" | "no" | {answer, where}}}`. They are recorded in Strawberry as the take's facts, and
what the judge saw travels with a repair.

## Test

```sh
bun test                    # the logic, with no network
pnpm exec tsc --noEmit      # types, including exhaustive move switches
bun run simulate.ts dreams/*.md --max 24
```

`simulate.ts` has a model play someone who knows only one real dream (in `dreams/`) and talk
to the real harness until it closes. It reports:
- the moves;
- which parts of the dream were told, forgotten or never reached;
- how often each gap was asked about;
- any film words Berry used;
- how faithful the retelling was, as judged by Jev.

It writes the full transcripts to `runs/`.

## Files

| File | What |
|---|---|
| `lib.ts` | State, phases, `selectMove`, the brief. Pure, no I/O |
| `jev.ts` | The questions Jev is asked each turn, and how the answers become state |
| `llm.ts` | The DeepSeek call, the reply contract, and the code that enforces it |
| `dream.ts` | The dream's story goals and Berry's persona |
| `session.ts` | Conversations, one turn at a time each, saved to `state/` |
| `server.ts` | Local HTTP server |
| `web/index.html` | The page |
| `producer.ts` | The breakdown: story, people, places, things, look, ways to draw it; and the code that repairs its shape |
| `ground.ts` | Jev's check that every detail marked as said is in the person's words |
| `strawberry.ts` | Writes the production into Strawberry through its JSON CLI |
| `sheets.ts` | Profiles, sketch prompts, and the engine calls that draw, approve and select them |
| `continuity.ts` | The continuity plan: what each moment is drawn from, and the in-between references it needs. Pure |
| `frames.ts` | The moments and in-between references: their prompts, with the sketches and earlier moments as references |
| `judge.py` | Bridge to the engine's remote judge, which checks a take against its declared facts |
| `boot.ts` | Loads the keys before any module reads them |
| `simulate.ts` | Simulated dreamers |
| `produce.ts` | Runs the producer and the check on a saved simulated conversation |
| `resume.ts` | Picks a saved dream's drawing up where it stopped |
| `judge.ts` | The assistant as judge: the queue folder, and the answers recorded as facts |
| `plan.ts` | Prints a saved dream's continuity plan and every picture's prompt, before anything is paid for; `--gate` reads each through the gate |
| `gate.ts` | The confidence gate every picture passes before it is paid for |
