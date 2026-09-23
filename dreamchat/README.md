# Dream chat

A chat that listens to someone's dream until it understands it, tells it back, asks whether
they'd like to see it, lets them choose how it should look, and writes the production into
Strawberry Studio. Steps 1 and 2 of `../DREAM_CHAT_PLAN.md`; nothing is drawn yet.

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
| `JEV_MODEL` | `jev-latest` | |

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
| `simulate.ts` | Simulated dreamers |
| `produce.ts` | Runs the producer and the check on a saved simulated conversation |
