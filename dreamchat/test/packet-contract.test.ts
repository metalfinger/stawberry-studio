// The packet contract (contract.ts): version 8 is version 7 with fields added only; every cut has a stable id from where
// its moment is and what it says, kept through an edit of any other moment and through a camera gained or lost; a
// version 7 packet turned into version 8 reads as one written as version 8; a version no harness is given, a field
// missing or wrong, is refused by its name; a field not built yet holds the cut that needs it.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  absentFields,
  type DreamPacket8,
  holdFor,
  idParts,
  movedIds,
  nextHistory,
  PACKET_SCHEMA_V8,
  plainWords,
  readIdHistory,
  stableId,
  stableIds,
  toV8,
  validatePacket,
  wordsHash,
  writeIdHistory,
} from '../contract';
import { frozenDreams, loadDream } from '../evals/saved';
import { type DreamPacket, dreamPacket, type NodePacket, PACKET_SCHEMA, type Schema, validate } from '../packet';
import { rebuild } from '../plan';
import type { Session } from '../session';

setDefaultTimeout(600_000);

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const was = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    return fn();
  } finally {
    for (const [k, v] of Object.entries(was))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}

const FULL = {
  DREAMCHAT_RECORD: 'on',
  DREAMCHAT_CUT_SHEET: 'on',
  DREAMCHAT_CAMERA: 'on',
  DREAMCHAT_REFS: 'on',
  DREAMCHAT_ONE_BUILDER: 'on',
};

/** A saved dream's version 7 packet, rebuilt with every switch on (or as `env` says); `edit` changes its session first. */
const packetOf = (id: string, edit?: (s: Session) => void, env: Record<string, string | undefined> = FULL) =>
  withEnv(env, () => {
    const s = structuredClone(loadDream(id, false).session) as Session;
    edit?.(s);
    return dreamPacket(rebuild(s), { dream: id, style: s.style!, history: () => [] });
  });

/** A version 8 packet with its added fields taken away: version 7's, field for field. */
const asV7 = (pk: DreamPacket8): unknown => {
  const { aliases: _a, collisions: _c, world: _w, tree: _t, basis: _b, cuts, ...rest } = pk;
  return { ...rest, version: 7, cuts: cuts.map(({ contract: _x, ...c }) => c) };
};

const momentOf = (s: Session, id: string) =>
  s.draft!.breakdown!.scenes.flatMap((x) => x.moments).find((x) => x.id === id)!;
const oneWord = (text: string) => {
  const word = text.match(/\b[a-z]{4,}\b/i)![0];
  return text.replace(word, word === 'slowly' ? 'quickly' : 'slowly');
};

describe('version 8 is version 7 with fields added only', () => {
  test("every part of version 7's schema is in version 8's unchanged, and version 8 adds only its own fields", () => {
    // Added in version 8, by path; nothing else of version 8's is not version 7's.
    const ADDED: Record<string, string[]> = {
      '$.properties': ['aliases', 'collisions', 'world', 'tree', 'basis'],
      '$.$defs': ['contract'],
      '$.$defs.node.properties': ['contract'],
    };
    const walk = (a: unknown, b: unknown, at: string): string[] => {
      if (at === '$.properties.version' || /^\$\.(\$id|title|description)$/.test(at)) return [];
      if (Array.isArray(a)) {
        if (/\.required$/.test(at)) {
          const extra = (b as string[]).filter((k) => !a.includes(k));
          const allowed = ADDED[at.replace(/\.required$/, '.properties')] ?? [];
          return [
            ...a.filter((k) => !(b as unknown[]).includes(k)).map((k) => `${at}: ${k} dropped`),
            ...extra.filter((k) => !allowed.includes(k)).map((k) => `${at}: ${k} added`),
          ];
        }
        return JSON.stringify(a) === JSON.stringify(b) ? [] : [at];
      }
      if (a && typeof a === 'object') {
        if (!b || typeof b !== 'object' || Array.isArray(b)) return [at];
        const added = Object.keys(b).filter((k) => !(k in (a as object)) && !(ADDED[at] ?? []).includes(k));
        return [
          ...added.map((k) => `${at}.${k} added`),
          ...Object.entries(a as Schema).flatMap(([k, v]) => walk(v, (b as Schema)[k], `${at}.${k}`)),
        ];
      }
      return a === b ? [] : [at];
    };
    expect(walk(PACKET_SCHEMA, PACKET_SCHEMA_V8, '$')).toEqual([]);
    expect((PACKET_SCHEMA_V8.properties as Schema).version).toEqual({ const: 8 });
  });

  test('the schemas a harness reads are the ones the packets are checked against', () => {
    const file = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, '..', name), 'utf8'));
    expect(file('packet.v7.schema.json')).toEqual(JSON.parse(JSON.stringify(PACKET_SCHEMA)));
    expect(file('packet.v8.schema.json')).toEqual(JSON.parse(JSON.stringify(PACKET_SCHEMA_V8)));
    expect(file('packet.schema.json')).toEqual(file('packet.v7.schema.json'));
  });
});

describe('every saved dream, version 7 and version 8', () => {
  test('each keeps to its schema; version 8 has every field of version 7 as it was, a stable id per cut, and aliases from its version 7 ids', () => {
    for (const id of frozenDreams()) {
      const pk = packetOf(id);
      expect(validatePacket(pk)).toEqual([]);
      const v8 = toV8(pk);
      expect(validatePacket(v8)).toEqual([]);
      expect(asV7(v8)).toEqual(JSON.parse(JSON.stringify(pk)));
      const ids = v8.cuts.map((c) => c.contract.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(v8.collisions).toEqual([]);
      for (const c of v8.cuts) {
        expect(v8.aliases[c.identity.cut]).toBe(c.contract.id);
        expect(c.contract.id).toBe(`${c.contract.moment}.1`);
        expect(idParts(c.contract.id)?.scene).toBe(c.identity.scene);
        // Null exactly where its basis is unknown: not built, and a check that needs it holds the cut.
        for (const [f, b] of Object.entries(c.contract.basis))
          expect(b === 'unknown').toBe(c.contract[f as keyof typeof c.contract] === null);
        expect(holdFor(c.contract, 'told_facts')).toEqual({
          hold: true,
          owner: 'dreamchat',
          reason: 'field absent: told_facts',
        });
        expect(absentFields(c.contract).includes('attention')).toBe(!c.who.inView.some((e) => e.facing));
        if (c.contract.camera) expect(holdFor(c.contract, 'camera')).toBeNull();
        if (c.contract.camera) expect(c.contract.camera.role).toBeNull();
        expect(c.contract.dial).toBeNull();
      }
      // An edit is seen through the camera of the picture it edits: that camera, and that picture's stable id.
      for (const pl of pk.places)
        for (const cam of pl.cameras)
          for (const cut of cam.cuts) {
            const c = v8.cuts.find((x) => x.identity.cut === cut)!;
            expect(c.contract.camera?.eye).toEqual(cam.eye);
            expect(c.contract.camera?.through).toBe(cam.through === cut ? null : v8.aliases[cam.through]);
          }
    }
  });

  test('a version 7 packet read from its file and turned into version 8 is the one Dream Chat writes, but its moved aliases', () => {
    const pk = packetOf(frozenDreams()[0]);
    const read = toV8(JSON.parse(JSON.stringify(pk)) as DreamPacket);
    expect(read).toEqual(JSON.parse(JSON.stringify(toV8(pk))));
    const moved = { 's9/l9/1-abcdef.1': read.cuts[0].contract.id };
    expect(toV8(pk, moved)).toEqual({ ...JSON.parse(JSON.stringify(read)), aliases: { ...read.aliases, ...moved } });
  });
});

describe('stable ids', () => {
  // The snow train, the lighthouse and the city of paper: a word changed in one moment's action, then in its point, at
  // the start and in the middle of the dream; every other cut keeps its id, and the moment its scene, place and ordinal.
  const ids = (frozenDreams() as string[]).filter((id) => /b0cb|affd|aeea/.test(id));
  for (const id of ids)
    test(`${id.slice(-4)}: a one-word edit of one moment keeps every other id`, () => {
      const before = stableIds(packetOf(id));
      const all = Object.keys(before.moments);
      for (const at of [all[0], all[Math.floor(all.length / 2)]])
        for (const field of ['action', 'visual_point'] as const) {
          const after = stableIds(
            packetOf(id, (s) => {
              const m = momentOf(s, at);
              m[field] = oneWord(m[field] ?? '');
            }),
          );
          expect(Object.keys(after.moments)).toEqual(all);
          for (const m of all) if (m !== at) expect(after.cuts[m]).toBe(before.cuts[m]);
          expect(after.moments[at]).not.toBe(before.moments[at]);
          expect(after.moments[at].replace(/-[0-9a-f]{6}$/, '')).toBe(before.moments[at].replace(/-[0-9a-f]{6}$/, ''));
        }
    });

  test('a cut that gains or loses its camera, or a dream drawn without the camera rules, keeps every id', () => {
    for (const id of ids) {
      const pk = packetOf(id);
      const ids8 = stableIds(pk);
      const lost = structuredClone(pk);
      lost.places = [];
      for (const c of lost.cuts) c.camera = { ...c.camera, eye: null, floorPlan: null, previs: null };
      expect(stableIds(lost)).toEqual(ids8);
      expect(stableIds(packetOf(id, undefined, { ...FULL, DREAMCHAT_CAMERA: undefined }))).toEqual(ids8);
    }
  });

  test("the hash is of a moment's words alone, in any script, as plain words: case, marks and spacing never change it", () => {
    expect(wordsHash('She folds the sheet, slowly.')).toBe(wordsHash('she  folds the sheet slowly'));
    expect(wordsHash('She folds the sheet')).not.toBe(wordsHash('She folds the shirt'));
    expect(wordsHash('le café')).not.toBe(wordsHash('le cafe'));
    expect(wordsHash('le café')).toBe(wordsHash('le café'));
    expect(plainWords('她把床单折成邮票')).toBe('她把床单折成邮票');
    expect(wordsHash('她把床单折成邮票')).not.toBe(wordsHash('她把床单折成手帕'));
    expect(plainWords('Grandma’s `drawer`')).toBe("grandma's 'drawer'");
  });

  test('an id already taken is given ~2, then ~3, and each collision is listed', () => {
    const taken = new Set<string>();
    const collisions: string[] = [];
    const a = stableId('s1', 'l1', 1, 'the same words', taken, collisions);
    const b = stableId('s1', 'l1', 1, 'the same words', taken, collisions);
    const c = stableId('s1', 'l1', 1, 'the same words', taken, collisions);
    expect([b, c]).toEqual([`${a}~2`, `${a}~3`]);
    expect(collisions).toEqual([`${a} -> ${a}~2`, `${a} -> ${a}~3`]);
  });

  test('a moment that only moved is aliased to its new id; ones whose words changed, or two alike, are never', () => {
    const [h, x] = [wordsHash('she folds the sheet'), wordsHash('she opens the drawer')];
    expect(movedIds([`s1/l1/2-${h}.1`, `s1/l1/3-${x}.1`], [`s1/l1/3-${h}.1`, 's1/l1/4-bbbbbb.1'])).toEqual({
      [`s1/l1/2-${h}.1`]: `s1/l1/3-${h}.1`,
    });
    expect(movedIds([`s1/l1/2-${h}.1`], [`s2/l1/2-${h}.1`])).toEqual({});
    // The first of three deleted, two with the same words: which is which is not known, so neither is carried.
    expect(
      movedIds([`s1/l1/1-${h}.1`, `s1/l1/2-${x}.1`, `s1/l1/3-${h}.1`], [`s1/l1/1-${x}.1`, `s1/l1/2-${h}.1`]),
    ).toEqual({ [`s1/l1/2-${x}.1`]: `s1/l1/1-${x}.1` });
  });

  test('a gone id is never carried to one of two new ids alike, and an id in use is never an alias', () => {
    const h = wordsHash('she folds the sheet');
    expect(movedIds([`s1/l1/1-${h}.1`], [`s1/l1/2-${h}.1`, `s1/l1/3-${h}.1`])).toEqual({});
    // A moment put in before A and then taken out again: A is back at its first id, an alias of nothing.
    const x = wordsHash('a new moment');
    let history = nextHistory({ current: [], aliases: {} }, [`s1/l1/1-${h}.1`]);
    history = nextHistory(history, [`s1/l1/1-${x}.1`, `s1/l1/2-${h}.1`]);
    expect(history.aliases).toEqual({ [`s1/l1/1-${h}.1`]: `s1/l1/2-${h}.1` });
    history = nextHistory(history, [`s1/l1/1-${h}.1`]);
    expect(history.aliases).toEqual({ [`s1/l1/2-${h}.1`]: `s1/l1/1-${h}.1` });
  });

  test('an id history on disk: none yet is empty; one that cannot be read is an error, never an empty one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ids-'));
    const file = join(dir, 'dream.json');
    expect(readIdHistory(file)).toEqual({ current: [], aliases: {} });
    writeIdHistory(file, { current: ['s1/l1/1-aaaaaa.1'], aliases: { 's1/l1/2-aaaaaa.1': 's1/l1/1-aaaaaa.1' } });
    expect(readIdHistory(file).aliases).toEqual({ 's1/l1/2-aaaaaa.1': 's1/l1/1-aaaaaa.1' });
    writeFileSync(file, '{"current": [');
    expect(() => readIdHistory(file)).toThrow();
    writeFileSync(file, '{"ids": []}');
    expect(() => readIdHistory(file)).toThrow('not an id history');
  });

  test('ordinals count within a scene and its place, each place from 1', () => {
    const cut = (order: number, scene: string, place: string, action: string) =>
      ({
        identity: { cut: `m${order}`, order, scene },
        story: { action, point: null },
        who: { inView: [{ id: place, kind: 'location' }] },
      }) as unknown as NodePacket;
    const ids = stableIds({
      cuts: [
        cut(1, 's1', 'l1', 'one'),
        cut(2, 's1', 'l2', 'two'),
        cut(3, 's1', 'l1', 'three'),
        cut(4, 's2', 'l1', 'four'),
      ],
    });
    expect(Object.values(ids.moments).map((m) => m.replace(/-[0-9a-f]{6}$/, ''))).toEqual([
      's1/l1/1',
      's1/l2/1',
      's1/l1/2',
      's2/l1/1',
    ]);
  });

  test("a dream's id history: a moment moved twice is aliased from both its earlier ids, through a version 7 write between", () => {
    const h = wordsHash('she folds the sheet');
    let history = nextHistory({ current: [], aliases: {} }, [`s1/l1/1-${h}.1`]);
    history = nextHistory(history, [`s1/l1/2-${h}.1`, 's1/l1/1-aaaaaa.1']);
    history = nextHistory(history, [`s1/l1/2-${h}.1`, 's1/l1/1-aaaaaa.1']);
    history = nextHistory(history, [`s1/l1/3-${h}.1`, 's1/l1/1-aaaaaa.1', 's1/l1/2-bbbbbb.1']);
    expect(history.aliases).toEqual({ [`s1/l1/1-${h}.1`]: `s1/l1/3-${h}.1`, [`s1/l1/2-${h}.1`]: `s1/l1/3-${h}.1` });
  });
});

describe('a packet refused, by the name of what is wrong', () => {
  test('a version no harness is given; a field missing; a value of the wrong kind; a key it does not have', () => {
    expect(validatePacket({ version: 3 })).toEqual(['$.version: 3 is not a supported version (7, 8)']);
    expect(validatePacket(null)).toEqual(['$.version: null is not a supported version (7, 8)']);
    const v8 = toV8(packetOf(frozenDreams()[0]));
    const at = v8.cuts.findIndex((c) => c.contract.camera);
    type Loose = { cuts: { contract: Record<string, unknown> }[]; constructor?: unknown };
    const missing = structuredClone(v8) as unknown as Loose;
    delete missing.cuts[0].contract.id;
    expect(validatePacket(missing)).toEqual(['$.cuts[0].contract: id is missing']);
    const wrong = structuredClone(v8) as unknown as Loose;
    wrong.cuts[1].contract.dial = 'D';
    expect(validatePacket(wrong)).toEqual(['$.cuts[1].contract.dial: not one of "A", "B", "C", null']);
    // Inside a field that may be null: the fault in the shape it is of, by name.
    const camera = structuredClone(v8) as unknown as Loose;
    delete (camera.cuts[at].contract.camera as Record<string, unknown>).eye;
    expect(validatePacket(camera)).toEqual([`$.cuts[${at}].contract.camera: eye is missing`]);
    const extra = JSON.parse(JSON.stringify({ ...v8, constructor: 1 }));
    expect(validatePacket(extra)).toEqual(['$: constructor is not allowed']);
    // Version 7's eye, which may be null: an empty one is faulted inside, by name, never "matches none".
    const v7 = JSON.parse(JSON.stringify(packetOf(frozenDreams()[0]))) as { cuts: { camera: { eye: unknown } }[] };
    v7.cuts[0].camera.eye = {};
    expect(validate(PACKET_SCHEMA, v7)).toEqual([
      '$.cuts[0].camera.eye: at is missing',
      '$.cuts[0].camera.eye: d is missing',
      '$.cuts[0].camera.eye: height is missing',
    ]);
  });
});

describe('the Python twin (docs/packet_contract.py), byte for byte', () => {
  // Python 3.12 carries Unicode 15.0, the version the ids are pinned to; python3 here may be newer.
  const pythons = ['python3.12', 'python3'].map((p) => Bun.which(p)).filter((p): p is string => !!p);
  const run = (python: string, what: string, input: unknown) => {
    const out = Bun.spawnSync([python, join(import.meta.dir, '..', 'docs', 'packet_contract.py'), what], {
      stdin: new TextEncoder().encode(JSON.stringify(input)),
    });
    if (out.exitCode !== 0) throw new Error(out.stderr.toString());
    return JSON.parse(out.stdout.toString());
  };
  const WORDS = [
    'She folds the sheet, slowly.',
    'le café et le café',
    '她把床单折成邮票',
    'ΟΔΟΣ ΑΣ́ ΑΣ­Β',
    'İstanbul STRASSE ß ẞ ﬁne',
    'family 👨‍👩‍👧 thumbs 👍🏽 heart ❤️ keycap 1⃣',
    'new in 16 Ɤ, in 17 x᫏y, ࢗx, \u{16d67}\u{16d67}',
    'a lone \ud800 surrogate, Deseret 𐐀𐐨',
    'Grandma’s `drawer` and ‘quotes’',
    '  tabs\tand\nnew lines  ',
    '',
  ];

  test('every string: its plain words and hash', () => {
    if (!pythons.length) return;
    const mine = WORDS.map((w) => ({ plain: plainWords(w), hash: wordsHash(w) }));
    for (const python of pythons) expect(run(python, 'words', WORDS)).toEqual(mine);
  });

  test("every saved dream's version 7 packet, as version 8", () => {
    if (!pythons.length) return;
    for (const id of frozenDreams()) {
      const pk = JSON.parse(JSON.stringify(packetOf(id))) as DreamPacket;
      const mine = JSON.parse(JSON.stringify(toV8(pk)));
      for (const python of pythons) expect(run(python, 'v8', pk)).toEqual(mine);
    }
  });
});

describe('the shapes of the fields not built yet, as the integration lead signed them off', () => {
  test('must_be_absent, counts, relations and scale take their shapes, and refuse others by name', () => {
    const v8 = toV8(packetOf(frozenDreams()[0]));
    const c = v8.cuts[0].contract;
    const set = (patch: Partial<typeof c>) => {
      const pk = structuredClone(v8);
      Object.assign(pk.cuts[0].contract, patch);
      return validatePacket(pk);
    };
    expect(
      set({
        must_be_absent: ['t2', { entity: 't1', state: 'full size', why: 'it shrank to a stamp at m8' }],
        counts: { p1: 1, c1: 'many', p3: { n: 1, parts: { arms: 4 } } },
        relations: [{ a: 'p1', relation: 'left_of', b: 'p2', frame: 'screen' }],
        scale: [
          { entity: 't1', size_m: 0.03, relative_to: 'p2', tolerance: 0.1 },
          { entity: 'x3', size_m: 0.5, relative_to: null },
        ],
      }),
    ).toEqual([]);
    expect(set({ relations: [{ a: 'p1', relation: 'near' as never, b: 'p2', frame: 'screen' }] })).toEqual([
      '$.cuts[0].contract.relations[0].relation: not one of "left_of", "right_of", "in_front_of", "behind", "on", "inside", "beside", "holding", "feet_on"',
    ]);
    expect(set({ must_be_absent: [{ entity: 't1' } as never] })).toEqual([
      '$.cuts[0].contract.must_be_absent[0]: state is missing',
      '$.cuts[0].contract.must_be_absent[0]: why is missing',
    ]);
  });
});
