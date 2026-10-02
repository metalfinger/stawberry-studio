# Dream Chat as it is (3 Oct 2026)

Facts read from the code on lab/dream-chat (after d32c72c), not from the plan; where the plan says otherwise, it is
said. Paths are under `dreamchat/`.

## Two paths through it

- **Chat** (`server.ts` → `session.ts`): listening (`lib.ts selectMove`, 28 named rules on Jev's readings;
  `listen.ts checkedReply`) → the writer's breakdown (`telling.ts draftTold` → `producer.ts` → `ground.ts`) →
  `planShots` (the writer's floor plans and changes; `planfacts.ts`; the implied and typed readings) → `shootScenes`
  (`continuity.ts planContinuity` → `shotPlan` → `previs.ts` → the writer's shot brief → the storyboard check) →
  `cutsheet.ts framed` → the gate → the picture → the judge (`vouch`). **Writes no packet.**
- **Import** (`import.ts` → `importer.ts importDream`): the same producer and `planShots`, then the era, cast,
  wardrobe, sizes, built and devices readings → `state/<id>.json`. Packets come after: `evals/packets.ts` → `plan.ts
  rebuild` (record → continuity → sheet → `framed`) → `packet.ts dreamPacket` → schema check, `lintPacket` →
  `runs/packets/<id>.json` with its mock-up files.
- Switch defaults differ by path: the chat runs with every pipeline switch off except listening; imports and local
  runs use `evals/profile.ts PROFILE` (writer Claude, RECORD, CUT_SHEET, CAMERA, REFS and ONE_BUILDER all on).

## The stages: what is real

| Stage | Code | Default |
| --- | --- | --- |
| S0 test set | `evals/prompt-cases.ts` (85 cases from 122 verdicts), `evals/corpus.ts` | eval only |
| S1 story record | `record.ts recordMode`, `storyRecord`, `recordForPlan`; `implied.ts` | off |
| S2 checks only log | `gate.ts checksMode`: log unless `DREAMCHAT_CHECKS=act`; `actsWhenLogging` keeps what code knows is wrong acting | log |
| S3 cut sheet | `cutsheet.ts cutSheet`, `assemble.ts assembleCut`; off is `frames.ts framePrompt` | off |
| S4 camera rules | `camera.ts cameraMode` (needs CUT_SHEET and RECORD) | off |
| S5 references | `refs.ts chooseRefs`, `continuity.ts chooseInPlan` | off |
| S6 one builder | `cleanups.ts`: 57 ordered steps; 21 retirable clean-ups (`DREAMCHAT_RETIRE`) | off |
| S7 Jev routed | `checks.ts LIBRARY` (16 questions); `EARNED` is empty, so routed, nothing acts | off |
| S8 listening | `lib.ts listenOn`, `listen.ts`, `jev.ts replyCheck` | **on** |
| S9 as drawn | `asdrawn.ts`; staleness is reported, never acted on | off |
| S10 paid benchmark | not started (tools exist: `evals/checkpoint.ts`, `evals/replay.ts`) | — |
| E2, E5, P5 | builder steps `crowd_between`, `visible_device`; P5 is exports only (`previs.ts previsSet`) | in ONE_BUILDER |
| E3, E4, conversation staging | not built | — |

**"Facts against bars, code decides" holds** for floor-plan facts (`planfacts.ts PLAN_BARS`, which re-plans a scene and
acts by default), listening moves, and the implied and typed readings (`IMPLIED_BAR`, `TYPED_BAR`). **It holds but only
logs** for the gate's bars and the storyboard check (`stages.ts STORYBOARD`, 4 facts at 0.6/0.5/0.6/0.65): with checks
logging, neither holds a moment. **Jev acts outside the bars** in `session.ts followCorrections` (0.5 or more redraws)
and three more places there (0.7), and in `telling.ts`. **A model decides with no bar**: the writer's breakdown, style,
floor plans, changes and shot brief (the brief goes into the prompt); the cast, devices, sizes, wardrobe, built and era
readings (no Jev check); the picture judge's `vouch`, which picks the continuity source.

**Plan drift**: the plan's step table lags the code (S6 "rows 5–34 open" while 57 steps are built; S2 and S8 lines
contradict their own rows; L631 and L634 still say the record and the checks are to build).

## The packet (version 7: version 6 plus an optional `marker` on key and id-map entries)

| Field | Owner | Read by |
| --- | --- | --- |
| `version` | `PACKET_VERSION` | schema (`const`); `evals/set-render.ts` warns on a mismatch |
| `dream` {id, title, style, switches, keys, writer, period} | `asdrawn.ts drawnEnv`, the writer, `era.ts` | set-render (switches) |
| `elements[]` | `sheets.ts` | tests, `evals/state-agree.ts` |
| `ghosts[]` | `continuity.ts` ghost plans | tests |
| `cuts[]`: `identity`, `story`, `who`, `state`, `camera`, `dependencies`, `checks`, `history`, `prompts` | frame item, `producer.ts`, `cutsheet.ts`, `record.ts`, `continuity.ts`, `devices.ts`, `verdicts.ts`, `assemble.ts`, `evals/qwen-prompt.ts` | `lintPacket`, set-render, `evals/previs-set.ts`, state-agree, tests |
| `cuts[].camera.previs` {clay, keyed + key + id map, through, set, names} | `previs.ts` via `evals/packets.ts previsOf` | set-render, previs-set; the outside harness |
| `places[]` {cameras: through, eye, cuts, sets} | `packet.ts` from `cameraOf`/`planKey` | previs-set; the outside harness |

The packet is written only by `evals/packets.ts` (and `importer.ts`), checked against `PACKET_SCHEMA` (committed as
`packet.schema.json`, held equal by `test/packet.test.ts`), and linted where `point_state` is on: a part a cut's point
has in one state while its state, a check or its prompt has the other. Versions: 1 first; 2 mock-up files, prompts by
model; 3 `lookUnknown`; 4 `period`; 5 `device`, `lettering`; 6 sets, id maps, `through`, `places`, `facing`; 7
`marker`. Nothing in this repo outside evals and tests reads a packet; the merged flow reads it by the schema.

## Switches

43 `DREAMCHAT_*` names in code. The pipeline's: RECORD, CUT_SHEET, CAMERA, REFS, ONE_BUILDER, CHECKS, JEV_ROUTED,
LISTEN, AS_DRAWN, FRESH_SEND, FRAME (9:16), RETIRE, WRITER; the rest are models, thinking budgets, caches, timings
and paths. `ONE_BUILDER` is `on` or a step's name (that step and every one before it); its 57 steps are checked by
`builds('…')` at 148 places in 19 files (cutsheet 25, record 23, previs 20, continuity 20, telling 10, sheets 10). No
step has been retired: every old path is still in the code, and off must stay byte for byte as before.

**A new step plugs in** by: its name appended to `BUILDER_STEPS`; a `builds()` branch in every file it changes; a packet
version, schema and `packet.schema.json` where the packet's shape changes; the mock-up cache key where a mock-up
changes; an eval script (the step before against it, over every saved dream and the merged flow's imports); a test
file; a row in the plan's overlaps table and a log entry.

## Evals and nets

- **Nets on every change**: `evals/corpus.ts` (every frozen and live dream rebuilt, each prompt against a base: 127
  frozen and 447 live pictures), `evals/prompt-cases.ts`, the whole suite with switches off and on and file by file
  (82 test files; 1268 pass), `evals/packets.ts` (schema and lint must pass). Model readings are cached
  (`evals/cache/`: implied, typed, cast; Jev pinned at jev-1.13.0) so these are deterministic.
- **One eval per step** (54 scripts in `evals/`): each counts the fault its step targets over the corpus, the step
  before against it. They are code reading code (word patterns over prompts and plans), with a few cuts labelled by
  hand per step (Grandmother's drawer, her folds).
- **Labelled sets and the bars they set**: the owner's verdicts on 122 pictures (`evals/story-pictures.json`,
  `checks-set.json`, `checks-answers.json`) set S7's bar to act (precision 0.7 or more on 60 or more held-out labels):
  no library question has met it. The listening sets (`listening-audit*.json`, `beginning`, `ending`, `goes-on`) are
  S8's; the blind checkpoint answers (`evals/checkpoint/s4`, `s5`) S4's and S5's. The bars in `gate.ts`, `stages.ts`,
  `planfacts.ts`, `ground.ts`, `IMPLIED_BAR` and `TYPED_BAR` are constants in code.

## Rules: where they live

- **Code**: about 130 all-capital regex constants in 20 files (record.ts 35, camera.ts 19, producer.ts 16, sheets.ts
  12, devices.ts 11, continuity.ts 11, partstate.ts 6), word sets, `record.ts RULES` (12), `gate.ts
  actsWhenLogging`, `cleanups.ts CLEANUPS` (21).
- **Data**: none read at run time but `evals/story-pictures.json` (pictures the owner judged wrong are withheld).
  `docs/rules.md` holds 46 rules (A1–G6) as prose, not run.
- **Prompts**: the writer's in `producer.ts` (breakdown, style, floor plans, changes, shot brief) and one per reading
  (`implied`, `typed`, `cast`, `devices`, `sizes`, `wardrobe`, `built`, `telling`, `era`); about 74 Jev questions
  (`jev.ts` 28, `ground.ts` 12, `gate.ts` 8, `stages.ts` 6, `implied.ts` 6, `telling.ts` 5, `session.ts` 5,
  `planfacts.ts` 4) and 16 more in `checks.ts LIBRARY`; the image prompts in `frames.ts`, `assemble.ts`, `sheets.ts`
  and `evals/qwen-prompt.ts`.

## Where an idea touches many files

- The last 25 features (29 Sep to 3 Oct) touched 3 to 16 files each, 1 to 12 of them source. Most often:
  `cleanups.ts` 19 (the step list), `previs.ts` 13, `continuity.ts` 12, `packet.ts` 8, `session.ts` 7,
  `packet.schema.json` 7, `cutsheet.ts` 6.
- One fact is derived in several places. A part's open or shut state is read in `record.ts` (`statedStates`),
  `continuity.ts` (`withOpen`), `sheets.ts` (`openedLater`), `castplace.ts` (containment), `previs.ts` (`openParts`)
  and `packet.ts` (`lintPacket`), sharing only `partstate.ts`'s word lists. A thing's size is set in `castplace.ts`,
  `continuity.ts` (`sizedAs`, `sizedByState`), `cutsheet.ts` (`now`) and `previs.ts` (`markTiny`).
- Every step keeps its old path: 148 branches, each change written twice so off stays the same.
- Nine separate writer readings, each with its own prompt, parse and cache, and no shared shape for the facts they
  give.
- Large files: `session.ts` 4651 lines, `previs.ts` 3923, `record.ts` 3405, `continuity.ts` 2963, `tree.ts` 2694,
  `producer.ts` 2011; `HARNESS_PLAN.md` 3635.
- The chat writes no packet and runs with the builder off; only imports run the whole profile.
