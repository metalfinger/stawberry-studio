# The packet contract (versions 7 and 8)

What a harness reads of a dream: `runs/packets/<dream>.json`, written by `evals/packets.ts`, checked against its own
version's schema. The code: `packet.ts` (version 7) and `contract.ts` (version 8, the ids, the mapping, the checks).
Its Python twin, `docs/packet_contract.py` (the ids and the mapping), is held equal to it byte for byte by the tests, on
Python 3.12 and the newest Python here, for every saved dream.

## Versions and files

| Version | Schema | Written by | Status |
| --- | --- | --- | --- |
| 7 | `packet.v7.schema.json` (and `packet.schema.json`, its old name, kept for one version) | `evals/packets.ts` | the default |
| 8 | `packet.v8.schema.json` | `evals/packets.ts --v8` | version 7 with fields added only |

- Both are written beside the packets and committed in `dreamchat/`. `test/packet-contract.test.ts` holds the
  committed files equal to the code's, and version 8's equal to version 7's in every part but its version and the
  fields it adds (no field of version 7 changed, tightened or dropped).
- **Checking a packet** (`validatePacket`): a version other than 7 or 8 is refused by name
  (`$.version: 3 is not a supported version (7, 8)`); anything else wrong is named by its path:
  `$.cuts[0].contract: id is missing`; `$.cuts[1].contract.dial: not one of "A", "B", "C", null`; inside a field that
  may be null, the fault in the shape it is of (`$.cuts[2].contract.camera: eye is missing`); a key the schema does not
  have (`$: constructor is not allowed`).
- **Producer and consumer pairs**: a version 7 packet to a version 7 reader; version 8 to version 8; a version 7
  packet to a version 8 reader through the mapping below.
- **Nothing below version 7 is upgraded.** A packet of version 6 or older is refused at `$.version`; a replay of an
  older run needs the reader it was written for, or the dream imported again and its packet written at this code.

## Version 7 to version 8 (`toV8`)

Every version 7 field stays as it is, ids included: `identity.cut`, `identity.prev`, `camera.previs.through`,
`places[]`, `dependencies.refs[].id` keep version 7's ids (moment ids, `m7`). Added:

| Where | Field | From the version 7 packet |
| --- | --- | --- |
| root | `version` | 8 |
| root | `aliases` | every cut's version 7 id (`identity.cut`) to its stable cut id. Valid within this packet only: a version 7 id can name another moment after the dream is broken down again. When Dream Chat writes the packet, also each earlier stable id whose moment only moved, to its new one (below) |
| root | `collisions` | the stable ids given `~2` or more: `"<id> -> <id>~2"` |
| root | `world`, `tree` | null; `basis: {"world": "unknown", "tree": "unknown"}` |
| each cut | `contract.id`, `contract.moment` | its stable ids (below) |
| each cut | `contract.scene`, `contract.shot` | `identity.scene`, `identity.shot` |
| each cut | `contract.camera` | its own `camera.eye` where not null, `through` null. Else (an edit, which has no eye of its own) the camera its picture is seen through: the first `places[].cameras[]` entry, in `places` order then `cameras` order, whose `cuts` list it: its `eye`, and `through` the stable cut id of that entry's `through` (null where it is this cut). Either way `{role: null, eye, lens: eye.lens or null, through}`, basis `derived`. Neither: null, basis `unknown` |
| each cut | `contract.attention` | for each `who.inView[]` with a `facing`, in order: `{entity: <its id>, facing: {view, side}, gaze_at: null, expression: null, basis: "derived", by: "code.previs.facingOf"}`; basis `derived`. None: null, basis `unknown` |
| each cut | every other `contract` field | null, basis `unknown` |

A version 7 packet turned into version 8 by a harness is the packet Dream Chat writes as version 8 in every field but
two, which only Dream Chat has: `aliases`' moved ids (its id history), and each cut's `world_at` (the world's state at
the cut, resolved from the rebuild the packet is written from, below), which a version 7 packet turned into version 8
keeps null with basis `unknown`. Proven on 85 dreams: 0 other differences.

**A field null with basis `unknown` is not built**, or the packet was version 7. A mechanical check that needs it holds
the cut, owned by Dream Chat, with the field named: `field absent: told_facts` (`holdFor`). It never reads a default.
A cut on no floor plan has no camera: it is held on `camera` until it is planned, a gap Dream Chat owns.

## Stable ids

From the version 7 packet's own fields, never from a camera or a floor plan: a cut that gains or loses its camera,
and a dream rebuilt without the camera rules, keep every id (tested).

1. **Scene**: `identity.scene`; `-` where empty.
2. **Place**: the `id` of the first of the cut's `who.inView[]` entries of `kind` `location` (every cut has exactly one:
   647 of 647, with the switches on or off); `-` where none (a place with no sketch).
3. **Ordinal**: cuts taken in `identity.order`, ties in the packet's order; a cut's ordinal is 1 more than the number
   of cuts before it with the same scene and place.
4. **Words**: `story.action`, one space, `story.point` (the empty string where null).
5. **Plain words**, pinned to Unicode 15.0 so a newer Unicode in either language never moves an id. `KEPT` is the code
   points of Unicode 15.0's general categories L, M and N: the inclusive ranges in `packet-chars.json`. In order:
   1. each code point not in `KEPT` and not U+0027, U+2018, U+2019 or U+0060 becomes U+0020 (a code point unassigned
      in 15.0, or a lone surrogate, is a separator);
   2. Unicode NFC (stable for 15.0's own characters in every later version);
   3. lower case (JavaScript `toLowerCase`, Python `str.lower()`, never `casefold()`);
   4. each of U+2018, U+2019 and U+0060 becomes U+0027;
   5. each code point not in `KEPT` and not U+0027 becomes U+0020;
   6. each run of U+0020 becomes one; one at the start or the end is removed.

   `docs/packet_contract.py` `plain_words` does exactly this; `test/packet-contract.test.ts` holds it equal to
   `contract.ts` on accents (composed and not), Chinese, Greek final sigma, Turkish İ, ß and ẞ, ligatures, emoji
   sequences, characters new in Unicode 16 and 17, lone surrogates, curly quotes and white space.
6. **Hash**: the first 6 characters of the lower-case hex sha256 of the plain words in UTF-8.
7. **Moment id**: `<scene>/<place>/<ordinal>-<hash>`, e.g. `s2/l2/3-4f1c9a`. If taken already in this packet, `~2`
   is appended (then `~3`, and so on) and `"<id> -> <id>~2"` goes in `collisions`.
8. **Cut id**: `<moment id>.<n>`, `n` from 1 (one cut per moment today: `.1`).

**Moved, not edited** (`movedIds`, `nextHistory`): Dream Chat keeps each dream's id history
(`runs/packets/ids/<dream>.json`: its last packet's ids and its aliases), moved on by every packet it writes, of
either version. An id of the last packet that is gone, and an id that is new, with the same scene, hash and cut number,
each the only one of its kind on its side, are one moment moved: the old id is aliased to the new. Two alike on either
side: none is carried (a wrong alias is worse than none). An alias whose target moves again follows it; one whose
target is edited or gone is dropped. An id in use now is never an alias. A moment whose words changed is a new moment.

**Proven**: a one-word edit of one moment's action or point keeps every other cut's id, and the edited moment keeps
its scene, place and ordinal (the snow train, the lighthouse, the city of paper, at the dream's start and middle).

## The cut contract (version 8)

As the design's §4. Filled now, from what version 7 carries: `id`, `moment`, `scene`, `shot`, `camera` (`role` null
until the camera's role is built), `attention` (`facing`; `gaze_at` and `expression` null). Filled by Dream Chat's
writer only, from the rebuild (`resolvers.ts worldAt`, basis `derived`): `world_at`, each attribute where the rebuild
decides it, one value of each attribute of each part of each one:

| `attr` | `value` | `by` |
| --- | --- | --- |
| present | true or false | `record.shows`, `record.present`, `record.gone` |
| location | `{place, x, y, above}`: `place` the floor plan it is on (`<scene>/<place>`, as `places[].id`), `x` and `y` in its metres, `above` where it rests off the floor | `writer.blocking` where it stands where the writer's plan put it (or moved it to by then); else `code.castplace`, `code.castplace.fixtures`, `code.devices`, or `code.plan` (moved by the plan's own settling); never for a thing in someone's hands |
| rides | `{on, how: on or in}` | `code.previs.onOf` |
| held_by | the holder's id; in more than one pair of hands at once, an array of every one of them in order: handed over, the one handing it, then the one given it; held together, its holder first | `record.held` (the record's holder, or its `hands` where more than one, as the prompt says it); else `plan.heldBy` (with the spot's `heldWith`, which the version 7 floor plan leaves out) |
| inside_of | the container's id | `code.castplace.containerFor`: a cast thing, by the reading its placement put it in by, among what was there before it |
| open | true or false: of a place's part on the fixture it is (`continuity.ts fixtureOfPart`), else on the place with `part`; of a thing's part with `part`; of a thing shut whole with `part` null | `record.state`, `record.shut`, `continuity.withOpen` |
| facing | an id or a direction, of each one the record has there (never the dreamer as the camera) | `writer.blocking`, `continuity.withAttention` |

Gaze and count follow. No value quotes the dreamer yet (`quote` null), so none reads as said. Null with basis `unknown`
until built: `told_facts`, `presence`, `actions`, `turns_on`, `refs`, `readiness`, `must_show`,
`must_be_absent`, `identity_marks`, `counts`, `relations`, `scale`, `beat`, `after`, `dial`; the root's `world` and
`tree`. Each is typed in `packet.v8.schema.json` now, so a reader is written once. Ids inside the contract are stable
ids.

- `world_at[]`: `{entity, part, attr, value, basis, by, quote, confidence, event}`; `attr` one of present, size,
  location, held_by, inside_of, rides, open, lit, count, look, wears, pose, facing, gaze, hands_to, becomes,
  water_level; `value` typed by `attr` (the schema's description); a null `quote` never reads as said.
- `presence[]`: `{entity, reason: point|action|scene-told|ambient, count {n | "many", members}, quantifier
  one|each|all, region_px [x0, y0, x1, y1], min_px}`.
- `turns_on`: `{entity, need: present|recognizable|legible, size_m, min_px}`; `min_px` is the drawing side's.
- `refs[]`: `{asset, purpose, carries[]}`, `purpose` one of layout, place, identity, state, palette, prop, style.
- `readiness`: by fact, `{value, by, confidence, check: mechanical|semantic}`.
- **Shapes for the fields the design names without one** (signed off by the integration lead, with its four
  amendments): `must_show[]` entity ids; `must_be_absent[]` an entity id, or `{entity, state, why}` where what must be
  absent is a state of it (the sheet at full size once it shrank, a drawer open); `identity_marks[]` `{entity, mark}`;
  `counts` by entity, a number or `"many"`, or `{n, parts: {hands, arms, legs}}` for an unusual body (a usual one is
  never stated); `relations[]` `{a, relation, b, frame}`, `relation` one of left_of, right_of, in_front_of, behind, on,
  inside, beside, holding, feet_on, `frame` `screen` (what is measured on the picture) or `world` (the floor plan's);
  `scale[]` `{entity, size_m, relative_to, tolerance}`, `tolerance` a share of `size_m`, 0.2 where not given; `beat`
  `{role, retell}`; `after[]` stable cut ids, the told order; `actions[]` `{actor, verb, recipient, hands_to, contact,
  pose_cue, agent_established_in}`.

## Acceptance

`bun run evals/packet-contract.ts <folders>... [--list]` checks every packet in them as a harness would: each keeps to
its version's schema or is refused with the field named, and a version 7 packet is checked again as the version 8 one
it turns into. A fault not named by a path or a root field fails the run.

- **The stores as they were saved** (the merge's `dc-data` 54 and night store 16): 70 packets of versions 6, 3 and 4,
  each refused by name at `$.version`; none broken, none unnamed.
- **The same dreams rebuilt at this code** (`evals/packets.ts --live`, then `--v8`): the 54 (379 cuts) and the night
  store with the frozen dreams (31 dreams, 268 cuts): 170 packets, every one keeping to its schema, every version 7
  one keeping to version 8's as it turns into it; each dream's version 8 file equal to its version 7 file turned into
  version 8 (85 of 85); no two cuts of a dream with one id; no fault unnamed.
