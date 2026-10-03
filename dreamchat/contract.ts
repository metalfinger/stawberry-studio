// The packet contract: what a harness reads of a dream, versioned. Version 8 is version 7 with fields added only:
// stable ids from where each moment is and what it says, the aliases that carry other ids to them, and each cut's
// contract (its camera, the state of everything in view, who is there and why, what it turns on, its references, what
// is ready), the world model and the tree. A field not built yet is null with basis `unknown`: a check that needs it
// holds the cut, owned here, and never reads a default. A version 7 packet is turned into a version 8 one in code
// (`toV8`), so a harness reading version 8 reads a version 7 packet the same way, field by field (docs/packet-contract.md).
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import chars from './packet-chars.json';
import { type DreamPacket, type NodePacket, PACKET_SCHEMA, type Schema, validate } from './packet';
import type { Eye } from './blocking';

/** The versions a harness can be given; any other is refused by its version, by name. */
export const VERSIONS = [7, 8] as const;
export type Version = (typeof VERSIONS)[number];

/**
 * Where a value came from, one list for the tree and the story record: what they said (or confirmed), chose, a model
 * read from their words, code worked out, was guessed, a code fallback, what they said they forgot, nothing at all,
 * and what a model read their words to imply, checked.
 */
export const BASES = [
  'said',
  'chosen',
  'read',
  'derived',
  'guessed',
  'default',
  'forgotten',
  'unknown',
  'implied',
] as const;
export type Basis = (typeof BASES)[number];

/** What a state event is of (the design's StateEvent `attr`). */
export const ATTRS = [
  'present',
  'size',
  'location',
  'held_by',
  'inside_of',
  'rides',
  'open',
  'lit',
  'count',
  'look',
  'wears',
  'pose',
  'facing',
  'gaze',
  'hands_to',
  'becomes',
  'water_level',
] as const;
export type Attr = (typeof ATTRS)[number];

/** One value of the state of someone or something at a cut: what, of which part, its value, and where it came from. */
export type WorldValue = {
  entity: string;
  part: string | null;
  attr: Attr;
  value: unknown;
  basis: Basis;
  by: string;
  quote: string | null;
  confidence: number | null;
  /** The state event it is read from, where the world model has one. */
  event: string | null;
};

/** A cut's contract (the design's Cut): what it must show and with what, each field null until it is built. */
export type CutContract = {
  id: string;
  moment: string;
  scene: string;
  shot: string;
  /** Its camera, where it has one: null for a cut on no floor plan. `role` null until the camera's role is built. */
  camera: {
    role: 'master' | 'insert' | 'pov' | 'reaction' | null;
    eye: Eye;
    lens: number | null;
    through: string | null;
  } | null;
  world_at: WorldValue[] | null;
  told_facts:
    { fact_id: string; quote: string; carried_by: 'device' | 'lettering' | 'state' | 'action' | 'presence' }[] | null;
  presence:
    | {
        entity: string;
        reason: 'point' | 'action' | 'scene-told' | 'ambient' | null;
        count: { n: number | 'many'; members: string[] } | null;
        quantifier: 'one' | 'each' | 'all' | null;
        region_px: [number, number, number, number] | null;
        min_px: number | null;
      }[]
    | null;
  actions:
    | {
        actor: string;
        verb: string;
        recipient: string | null;
        hands_to: string | null;
        contact: string | null;
        pose_cue: string | null;
        agent_established_in: string | null;
      }[]
    | null;
  attention:
    | {
        entity: string;
        facing: { view: string; side: 'left' | 'right' | null } | null;
        gaze_at: string | null;
        expression: string | null;
        basis: Basis;
        by: string;
      }[]
    | null;
  turns_on: {
    entity: string;
    need: 'present' | 'recognizable' | 'legible';
    size_m: number | null;
    min_px: number | null;
  } | null;
  refs: { asset: string; purpose: Purpose; carries: string[] }[] | null;
  readiness: Record<
    string,
    { value: unknown; by: string; confidence: number | null; check: 'mechanical' | 'semantic' }
  > | null;
  must_show: string[] | null;
  /** What must not be in the picture: someone or something, or a state of it (the sheet at full size once it shrank). */
  must_be_absent: (string | { entity: string; state: string | null; why: string })[] | null;
  identity_marks: { entity: string; mark: string }[] | null;
  /** By entity: how many, or for an unusual body how many and of which parts (a usual body is never stated). */
  counts: Record<
    string,
    number | 'many' | { n: number | 'many'; parts: { hands?: number; arms?: number; legs?: number } }
  > | null;
  /** Where two stand to each other: on the picture (`screen`, what is measured on it) or on the floor plan (`world`). */
  relations: { a: string; relation: Relation; b: string; frame: 'screen' | 'world' }[] | null;
  /** Its size, and how far from it is still right (`tolerance`, a share of it: 0.2 where not given). */
  scale: { entity: string; size_m: number; relative_to: string | null; tolerance?: number }[] | null;
  beat: { role: string; retell: string } | null;
  after: string[] | null;
  dial: 'A' | 'B' | 'C' | null;
  /** Each field's basis: `unknown` where it is null because it is not built, or the packet was version 7. */
  basis: Record<string, Basis>;
};

/** How two stand to each other. */
export const RELATIONS = [
  'left_of',
  'right_of',
  'in_front_of',
  'behind',
  'on',
  'inside',
  'beside',
  'holding',
  'feet_on',
] as const;
export type Relation = (typeof RELATIONS)[number];

/** What a reference is sent for, and only for (the design's closed vocabulary). */
export const PURPOSES = ['layout', 'place', 'identity', 'state', 'palette', 'prop', 'style'] as const;
export type Purpose = (typeof PURPOSES)[number];

/** The contract's fields with a value, and the order they are listed in. */
const CONTRACT_FIELDS = [
  'camera',
  'world_at',
  'told_facts',
  'presence',
  'actions',
  'attention',
  'turns_on',
  'refs',
  'readiness',
  'must_show',
  'must_be_absent',
  'identity_marks',
  'counts',
  'relations',
  'scale',
  'beat',
  'after',
  'dial',
] as const;
export type ContractField = (typeof CONTRACT_FIELDS)[number];

export type NodePacket8 = NodePacket & { contract: CutContract };
export type DreamPacket8 = Omit<DreamPacket, 'version' | 'cuts'> & {
  version: 8;
  /** Every other id a cut has gone by (its version 7 id, an earlier stable id whose moment moved) to its stable id. */
  aliases: Record<string, string>;
  /** Stable ids given `~2` (or more) because the one they would have been was taken: `<id> -> <id>~2`. */
  collisions: string[];
  /** The world model (entities and their state events), null until it is built. */
  world: { entities: unknown[]; events: unknown[] } | null;
  /** The tree (dream, sequence, scene, shot, cut) with each field's source, null until it is exported. */
  tree: Record<string, unknown> | null;
  /** The basis of `world` and `tree`. */
  basis: Record<'world' | 'tree', Basis>;
  cuts: NodePacket8[];
};
export type AnyPacket = DreamPacket | DreamPacket8;

// ── stable ids ───────────────────────────────────────────────────────────────

/**
 * The characters a moment's words keep when its id is made: Unicode 15.0's letters, marks and digits
 * (`packet-chars.json`, inclusive ranges). Pinned, so a newer Unicode in either language never moves an id: a character
 * unassigned in 15.0 is a separator, and Unicode's stability policies keep NFC and lower case of 15.0's own characters
 * the same in every later version.
 */
const KEPT = chars.ranges as [number, number][];
const kept = (cp: number) => {
  let [lo, hi] = [0, KEPT.length - 1];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < KEPT[mid][0]) hi = mid - 1;
    else if (cp > KEPT[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
};
const APOSTROPHE = 0x27;
const LIKE_APOSTROPHES = new Set([APOSTROPHE, 0x2018, 0x2019, 0x60]);
/** Each code point kept, or `also` lets it stay; anything else a space. */
const onlyKept = (x: string, also: (cp: number) => boolean) =>
  Array.from(x, (ch) => (kept(ch.codePointAt(0)!) || also(ch.codePointAt(0)!) ? ch : ' ')).join('');

/**
 * A moment's words as its id hashes them, in any script (docs/packet-contract.md, step by step, with a Python twin in
 * docs/packet_ids.py): each code point not kept, nor an apostrophe or one like it, a space; NFC; lower case; U+2018,
 * U+2019 and U+0060 an apostrophe; each code point not kept, nor an apostrophe, a space; runs of spaces one; trimmed.
 * "Café" stays café; Chinese stays Chinese.
 */
export const plainWords = (x: string) =>
  onlyKept(
    onlyKept(x, (cp) => LIKE_APOSTROPHES.has(cp))
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\u2018\u2019`]/g, "'"),
    (cp) => cp === APOSTROPHE,
  )
    .replace(/ +/g, ' ')
    .replace(/^ | $/g, '');

/** The first six hex digits of the sha256 of a moment's words, plain, as UTF-8. */
export const wordsHash = (words: string) => createHash('sha256').update(plainWords(words)).digest('hex').slice(0, 6);

/**
 * One moment's stable id: `<scene>/<place>/<ordinal>-<hash>`, the ordinal its place in the story among its scene's
 * moments on that floor plan, the hash its words'. Taken already, it is given `~2` (then `~3`), and the collision is
 * listed.
 */
export function stableId(
  scene: string,
  place: string,
  ordinal: number,
  words: string,
  taken: Set<string>,
  collisions: string[],
): string {
  const id = `${scene || '-'}/${place || '-'}/${ordinal}-${wordsHash(words)}`;
  if (!taken.has(id)) {
    taken.add(id);
    return id;
  }
  let k = 2;
  while (taken.has(`${id}~${k}`)) k++;
  collisions.push(`${id} -> ${id}~${k}`);
  taken.add(`${id}~${k}`);
  return `${id}~${k}`;
}

/** A moment's words, as its stable id is made from them: what happens, and the one thing it must show. */
export const momentWords = (c: Pick<NodePacket, 'story'>) => `${c.story.action} ${c.story.point ?? ''}`;

export type StableIds = {
  /** By version 7 cut id (the moment's id): the moment's stable id, and its cut's (`<moment>.1`). */
  moments: Record<string, string>;
  cuts: Record<string, string>;
  collisions: string[];
};

/** A cut's place: the one place among what it has in view (`who.inView`, kind `location`); `-` with none. */
export const placeOf = (c: Pick<NodePacket, 'who'>) => c.who.inView.find((e) => e.kind === 'location')?.id ?? '-';

/**
 * Every cut's stable id, from the version 7 packet's own fields: its scene (`identity.scene`; `-` where empty), its place
 * (`placeOf`), its ordinal among its scene's cuts at that place in `identity.order` (ties in the packet's order), and
 * its moment's words. Never from its camera or its floor plan: a cut that gains or loses one keeps its id, and so does
 * every other. The same from a packet Dream Chat writes and from one a harness turns into version 8 itself.
 */
export function stableIds(pk: Pick<DreamPacket, 'cuts'>): StableIds {
  const ordinals = new Map<string, number>();
  const taken = new Set<string>();
  const out: StableIds = { moments: {}, cuts: {}, collisions: [] };
  for (const c of [...pk.cuts].sort((a, b) => a.identity.order - b.identity.order)) {
    const scene = c.identity.scene || '-';
    const place = placeOf(c);
    const n = (ordinals.get(`${scene}/${place}`) ?? 0) + 1;
    ordinals.set(`${scene}/${place}`, n);
    const id = stableId(scene, place, n, momentWords(c), taken, out.collisions);
    out.moments[c.identity.cut] = id;
    out.cuts[c.identity.cut] = `${id}.1`;
  }
  return out;
}

/** A stable id's parts: its scene, place, ordinal, words' hash and cut number; null for anything else. */
export const idParts = (id: string) => {
  const m = /^(.*)\/(.*)\/(\d+)-([0-9a-f]{6})(~\d+)?\.(\d+)$/.exec(id);
  return m ? { scene: m[1], place: m[2], ordinal: Number(m[3]), hash: m[4], cut: Number(m[6]) } : null;
};

/**
 * Earlier stable ids carried to new ones where a moment only moved (its ordinal or its place changed, its words did
 * not): an id gone and an id new with the same scene, words' hash and cut number, each the only one of its kind on its
 * side. Where two gone or two new share them, none is carried: a wrong alias is worse than none. An id whose words
 * changed is a new moment.
 */
export function movedIds(before: string[], after: string[]): Record<string, string> {
  const key = (id: string) => {
    const p = idParts(id);
    return p ? `${p.scene}|${p.hash}|${p.cut}` : null;
  };
  const gone = before.filter((id) => !after.includes(id));
  const fresh = after.filter((id) => !before.includes(id));
  const only = (ids: string[]) => {
    const by = new Map<string, string[]>();
    for (const id of ids) {
      const k = key(id);
      if (k) by.set(k, [...(by.get(k) ?? []), id]);
    }
    return new Map([...by].filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]]));
  };
  const [from, to] = [only(gone), only(fresh)];
  return Object.fromEntries([...from].filter(([k]) => to.has(k)).map(([k, id]) => [id, to.get(k)!]));
}

/**
 * A dream's stable ids over time (`runs/packets/ids/<dream>.json`): its last packet's, and where each earlier one is
 * now. Each packet written, of either version, moves it on: an id of the last packet whose moment only moved is carried
 * to its new id (`movedIds`), an alias to an id that moved again follows it, and one to a moment edited or gone is
 * dropped.
 */
export type IdHistory = { current: string[]; aliases: Record<string, string> };

export function nextHistory(h: IdHistory, now: string[]): IdHistory {
  const moved = movedIds(h.current ?? [], now);
  const aliases: Record<string, string> = {};
  for (const [old, to] of Object.entries(h.aliases ?? {})) {
    const there = moved[to] ?? to;
    if (now.includes(there)) aliases[old] = there;
  }
  for (const [old, to] of Object.entries(moved)) aliases[old] = to;
  // An id in use now is its own moment's, never another's alias.
  for (const id of now) delete aliases[id];
  return { current: now, aliases };
}

/**
 * A dream's id history as kept on disk: none there yet is an empty one; a file that cannot be read, or is not one, is
 * an error, never an empty history (which would drop every alias it holds).
 */
export function readIdHistory(file: string): IdHistory {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return { current: [], aliases: {} };
    throw e;
  }
  const h = JSON.parse(text) as IdHistory;
  if (!Array.isArray(h?.current) || !h.aliases || typeof h.aliases !== 'object')
    throw new Error(`${file}: not an id history`);
  return h;
}

/** A dream's id history written whole or not at all: to a file beside it, then moved over it. */
export function writeIdHistory(file: string, h: IdHistory): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(h, null, 1)}\n`);
  renameSync(tmp, file);
}

// ── version 7 to version 8 ───────────────────────────────────────────────────

/** The contract with nothing built: every field null, basis `unknown`. */
const emptyContract = (id: string, moment: string, scene: string, shot: string): CutContract => ({
  id,
  moment,
  scene,
  shot,
  camera: null,
  world_at: null,
  told_facts: null,
  presence: null,
  actions: null,
  attention: null,
  turns_on: null,
  refs: null,
  readiness: null,
  must_show: null,
  must_be_absent: null,
  identity_marks: null,
  counts: null,
  relations: null,
  scale: null,
  beat: null,
  after: null,
  dial: null,
  basis: Object.fromEntries(CONTRACT_FIELDS.map((f) => [f, 'unknown'])),
});

/**
 * A version 7 packet as version 8. Every field version 7 has is kept as it is. Each cut's contract gets its stable id
 * and what version 7 already carries: its scene and shot; the camera its picture is seen through, from `places[]` (an
 * edit's is the camera of the picture it edits, `through` that picture's stable id), else its own `camera.eye`; and how
 * each person is turned to that camera (`who.inView[].facing`, by previs.ts facingOf). Every other field is null with
 * basis `unknown`; the world model and the tree are null. `aliases` maps every cut's version 7 id to its stable id;
 * `moved`, earlier stable ids of the same dream carried to the new ones (its id history, `nextHistory`), which only
 * Dream Chat has: a version 7 packet turned into version 8 by a harness has every field the same but those.
 */
export function toV8(pk: DreamPacket, moved: Record<string, string> = {}): DreamPacket8 {
  const ids = stableIds(pk);
  const camOf = new Map<string, { eye: Eye; through: string }>();
  for (const pl of pk.places)
    for (const cam of pl.cameras)
      for (const cut of cam.cuts) if (!camOf.has(cut)) camOf.set(cut, { eye: cam.eye, through: cam.through });
  const cuts = pk.cuts.map((c): NodePacket8 => {
    const contract = emptyContract(
      ids.cuts[c.identity.cut],
      ids.moments[c.identity.cut],
      c.identity.scene,
      c.identity.shot,
    );
    // Its own eye where it has one; an edit has none, and is seen through the camera of the picture it edits.
    const cam = camOf.get(c.identity.cut);
    const eye = c.camera.eye ?? cam?.eye ?? null;
    if (eye) {
      const through = !c.camera.eye && cam && cam.through !== c.identity.cut ? (ids.cuts[cam.through] ?? null) : null;
      contract.camera = { role: null, eye, lens: eye.lens ?? null, through };
      contract.basis.camera = 'derived';
    }
    const turned = c.who.inView.filter((e) => e.facing);
    if (turned.length) {
      contract.attention = turned.map((e) => ({
        entity: e.id,
        facing: { view: e.facing!.view, side: e.facing!.side },
        gaze_at: null,
        expression: null,
        basis: 'derived',
        by: 'code.previs.facingOf',
      }));
      contract.basis.attention = 'derived';
    }
    return { ...c, contract };
  });
  const aliases: Record<string, string> = { ...ids.cuts, ...moved };
  return {
    ...pk,
    version: 8,
    aliases,
    collisions: ids.collisions,
    world: null,
    tree: null,
    basis: { world: 'unknown', tree: 'unknown' },
    cuts,
  };
}

/**
 * The fields of a cut's contract a check cannot read: null with basis `unknown`. A mechanical check that needs one
 * holds the cut, owned by Dream Chat, with the field named ("field absent: told_facts"), never a default.
 */
export function absentFields(c: Pick<CutContract, 'basis'> & Partial<Record<ContractField, unknown>>): ContractField[] {
  return CONTRACT_FIELDS.filter((f) => (c[f] === null || c[f] === undefined) && c.basis[f] === 'unknown');
}

export function holdFor(
  c: Pick<CutContract, 'basis'> & Partial<Record<ContractField, unknown>>,
  field: ContractField,
): { hold: true; owner: 'dreamchat'; reason: string } | null {
  return absentFields(c).includes(field) ? { hold: true, owner: 'dreamchat', reason: `field absent: ${field}` } : null;
}

// ── the version 8 schema ─────────────────────────────────────────────────────

const str: Schema = { type: 'string' };
const num: Schema = { type: 'number' };
const count: Schema = { type: 'integer', minimum: 0 };
const any: Schema = {};
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const oneOf = (...values: string[]): Schema => ({ enum: values });
const orNullOf = (...values: string[]): Schema => ({ enum: [...values, null] });
const orNull = (s: Schema): Schema =>
  typeof s.type === 'string' ? { ...s, type: [s.type, 'null'] } : { anyOf: [s, { type: 'null' }] };
const list = (items: Schema): Schema => ({ type: 'array', items });
const map = (values: Schema): Schema => ({ type: 'object', additionalProperties: values });
const obj = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
  additionalProperties: false,
});
const basis: Schema = { enum: [...BASES] };
const box: Schema = { type: 'array', items: num, minItems: 4, maxItems: 4 };
const many: Schema = { anyOf: [count, { const: 'many' }] };
const described = (s: Schema, description: string): Schema => ({ ...s, description });

const VALUES =
  'Typed by `attr`: present true or false; size {m: [w, d, h] in metres, words}; location {place, x, y, above} in the floor plan\'s metres; held_by an entity id, or where it is in more than one pair of hands at once every one of them in order (handed over, the one handing it, then the one given it; held together, its holder first); inside_of, rides, hands_to, becomes entity ids (rides {on, how: on|in}); open and lit true or false, of `part` where a part; count a whole number or "many"; look and wears words; pose sitting, standing or lying; facing and gaze an entity id or a direction (front, back, left, right); water_level metres.';

const contractSchema = obj({
  id: described(str, "The cut's stable id: `<moment>.<n>`, n from 1."),
  moment: described(
    str,
    "The moment's stable id: `<scene>/<place>/<ordinal>-<hash>`, the hash the first six hex digits of the sha256 of its words (`story.action`, a space, `story.point`), lower case, letters, digits and apostrophes, one space between; `~2` on a collision.",
  ),
  scene: str,
  shot: str,
  camera: orNull(
    obj({
      role: orNullOf('master', 'insert', 'pov', 'reaction'),
      eye: ref('eye'),
      lens: orNull(num),
      through: orNull(str),
    }),
  ),
  world_at: orNull(
    list(
      obj({
        entity: str,
        part: orNull(str),
        attr: { enum: [...ATTRS] },
        value: described(any, VALUES),
        basis,
        by: str,
        quote: orNull(str),
        confidence: orNull(num),
        event: orNull(str),
      }),
    ),
  ),
  told_facts: orNull(
    list(obj({ fact_id: str, quote: str, carried_by: oneOf('device', 'lettering', 'state', 'action', 'presence') })),
  ),
  presence: orNull(
    list(
      obj({
        entity: str,
        reason: orNullOf('point', 'action', 'scene-told', 'ambient'),
        count: orNull(obj({ n: many, members: list(str) })),
        quantifier: orNullOf('one', 'each', 'all'),
        region_px: orNull(box),
        min_px: orNull(count),
      }),
    ),
  ),
  actions: orNull(
    list(
      obj({
        actor: str,
        verb: str,
        recipient: orNull(str),
        hands_to: orNull(str),
        contact: orNull(str),
        pose_cue: orNull(str),
        agent_established_in: orNull(str),
      }),
    ),
  ),
  attention: orNull(
    list(
      obj({
        entity: str,
        facing: orNull(obj({ view: str, side: orNullOf('left', 'right') })),
        gaze_at: orNull(str),
        expression: orNull(str),
        basis,
        by: str,
      }),
    ),
  ),
  turns_on: orNull(
    obj({
      entity: str,
      need: oneOf('present', 'recognizable', 'legible'),
      size_m: orNull(num),
      min_px: orNull(count),
    }),
  ),
  refs: orNull(list(obj({ asset: str, purpose: { enum: [...PURPOSES] }, carries: list(str) }))),
  readiness: orNull(map(obj({ value: any, by: str, confidence: orNull(num), check: oneOf('mechanical', 'semantic') }))),
  must_show: orNull(list(str)),
  must_be_absent: orNull(list({ anyOf: [str, obj({ entity: str, state: orNull(str), why: str })] })),
  identity_marks: orNull(list(obj({ entity: str, mark: str }))),
  counts: orNull(
    map({
      anyOf: [
        many,
        obj({ n: many, parts: obj({ hands: count, arms: count, legs: count }, ['hands', 'arms', 'legs']) }),
      ],
    }),
  ),
  relations: orNull(list(obj({ a: str, relation: { enum: [...RELATIONS] }, b: str, frame: oneOf('screen', 'world') }))),
  scale: orNull(
    list(
      obj({ entity: str, size_m: num, relative_to: orNull(str), tolerance: { type: 'number', minimum: 0 } }, [
        'tolerance',
      ]),
    ),
  ),
  beat: orNull(obj({ role: str, retell: str })),
  after: orNull(list(str)),
  dial: orNullOf('A', 'B', 'C'),
  basis: described(
    obj(Object.fromEntries(CONTRACT_FIELDS.map((f) => [f, basis]))),
    'Each field\'s basis. `unknown` with the field null: not built yet, or the packet was version 7. A mechanical check that needs such a field holds the cut ("field absent: <field>"), owned by Dream Chat; it never reads a default.',
  ),
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Version 8's schema: version 7's with fields added only (the root's `aliases`, `world`, `tree` and `basis`; each
 * cut's `contract`), and its version 8.
 */
type Node = Schema & { properties: Record<string, Schema>; required: string[] };
export const PACKET_SCHEMA_V8: Schema = (() => {
  const s = clone(PACKET_SCHEMA) as Node & { $defs: Record<string, Node> };
  s.$id = 'https://github.com/metalfinger/stawberry-studio/dreamchat/packet.v8.schema.json';
  s.title = 'Dream Chat node packet, version 8';
  s.description = `${s.description} Version 8: version 7 with fields added only (docs/packet-contract.md).`;
  s.properties.version = { const: 8 };
  s.properties.aliases = described(
    map(str),
    'Every other id a cut has gone by, to its stable id: its version 7 id (the moment id), and an earlier stable id whose moment moved with its words unchanged.',
  );
  s.properties.collisions = described(
    list(str),
    'Stable ids given `~2` (or more) because the one they would have been was taken: `<id> -> <id>~2`.',
  );
  s.properties.world = described(
    orNull(obj({ entities: list(any), events: list(any) })),
    'The world model: entities and their state events. Null until it is built.',
  );
  s.properties.tree = described(
    orNull({ type: 'object' }),
    "The tree with each field's source. Null until it is exported.",
  );
  s.properties.basis = obj({ world: basis, tree: basis });
  s.required = [...s.required, 'aliases', 'collisions', 'world', 'tree', 'basis'];
  s.$defs.contract = contractSchema as Node;
  s.$defs.node.properties.contract = ref('contract');
  s.$defs.node.required = [...s.$defs.node.required, 'contract'];
  return s;
})();

/** The schema of a version, or none for a version no harness is given. */
export const schemaOf = (v: unknown): Schema | null => (v === 7 ? PACKET_SCHEMA : v === 8 ? PACKET_SCHEMA_V8 : null);

/**
 * A packet against its own version's schema: each fault named by its path (`$.cuts[3].contract.id: …`); a version no
 * harness is given is refused by name (`$.version: 3 is not a supported version (7, 8)`).
 */
export function validatePacket(pk: unknown): string[] {
  const v = (pk as { version?: unknown } | null)?.version;
  const schema = schemaOf(v);
  if (!schema) return [`$.version: ${JSON.stringify(v ?? null)} is not a supported version (${VERSIONS.join(', ')})`];
  return validate(schema, pk);
}
