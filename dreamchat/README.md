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
| Drawing: profiles | Each person, place and thing is shown as Berry pictures it; confirmed or corrected | a sketch starts for each one settled |
| Drawing: sketches | Finished sketches are shown; "looks right" approves one, a correction redraws it | redraws |
| Drawing: moments | Frames drawn from the approved sketches, key moment first; the key one is asked about by name | one per moment, plus redraws |
| Done | Berry says what was drawn, and honestly what couldn't be | none |

Every turn works like this:

1. **Jev reads.** It reads the whole conversation and answers typed questions: which parts
   of the dream have been told (pointing at the message), which the person doesn't
   remember, whether they've reached the end, and how they're talking.
2. **Code picks the move** from those facts (`lib.ts` → `selectMove`). While the person is
   still telling the dream, Berry follows along. Once they reach the end, Berry asks about
   the gaps, at most twice each. When the story is understood, Berry tells it back.
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
| `DREAMCHAT_PROVIDER` | `fal` when `FAL_KEY` is set, else `fake` | `fake` draws labelled offline placeholders, at no cost |
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
judge's count of the declared details it saw.

A dream costs roughly $0.15 × (people + places + things + moments + redraws): usually $1–2, and
never more than the limit.

Known limits:
- Frames are drawn from the approved sketches, not from the frame before, so continuity between
  frames rests on the sketches.
- The judge's badge informs, and decides nothing; it hasn't been measured against people's
  verdicts yet.
- A style option can still carry some of the dream's content (a little ice at a woman's feet).
- A download from fal's CDN sometimes times out; it is collected again twice at no cost before
  the picture counts as failed, and Berry says honestly if one never arrives.

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
| `frames.ts` | The moments: frame prompts and their references from the approved sketches |
| `judge.py` | Bridge to the engine's remote judge, which checks a take against its declared facts |
| `boot.ts` | Loads the keys before any module reads them |
| `simulate.ts` | Simulated dreamers |
| `produce.ts` | Runs the producer and the check on a saved simulated conversation |
