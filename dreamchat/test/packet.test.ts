// The node packet (packet.ts): what Dream Chat hands a harness for every picture it would draw, written from what the
// rebuild already has (the sheet, the plan, the floor plan, the story record), checked against its schema
// (packet.schema.json). Making it changes nothing: no prompt, no image, no plan.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frozenDreams, loadDream } from '../evals/saved';
import type { Spot } from '../blocking';
import { dreamPacket, PACKET_SCHEMA, validate } from '../packet';
import { rebuild } from '../plan';
import { moments } from '../producer';
import type { Session } from '../session';

setDefaultTimeout(240_000);

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
const OFF = {
  DREAMCHAT_RECORD: undefined,
  DREAMCHAT_CUT_SHEET: undefined,
  DREAMCHAT_CAMERA: undefined,
  DREAMCHAT_REFS: undefined,
  DREAMCHAT_ONE_BUILDER: undefined,
};

describe('the schema check', () => {
  const schema = {
    $defs: {
      pt: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'], additionalProperties: false },
    },
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      kind: { enum: ['cut', 'ghost'] },
      at: { $ref: '#/$defs/pt' },
      maybe: { type: ['string', 'null'] },
      list: { type: 'array', items: { type: 'integer', minimum: 0 } },
      either: { anyOf: [{ type: 'string' }, { type: 'object', properties: {}, additionalProperties: false }] },
      any: {},
    },
    required: ['name', 'kind', 'at'],
    additionalProperties: false,
  };
  const good = { name: 'm1', kind: 'cut', at: { x: 1 }, maybe: null, list: [0, 2], either: {}, any: [1, 'a'] };

  test('a value that keeps to it passes', () => {
    expect(validate(schema, good)).toEqual([]);
  });

  test('each way of breaking it is found, with where', () => {
    const { name: _, ...noName } = good;
    expect(validate(schema, noName)).toEqual(['$: name is missing']);
    expect(validate(schema, { ...good, kind: 'sketch' })).toEqual(['$.kind: not one of "cut", "ghost"']);
    expect(validate(schema, { ...good, at: { x: '1' } })).toEqual(['$.at.x: a string, not a number']);
    expect(validate(schema, { ...good, at: { x: 1, y: 2 } })).toEqual(['$.at: y is not allowed']);
    expect(validate(schema, { ...good, extra: 1 })).toEqual(['$: extra is not allowed']);
    expect(validate(schema, { ...good, list: [1, -1, 1.5] })).toEqual([
      '$.list[1]: under 0',
      '$.list[2]: a number, not a integer',
    ]);
    expect(validate(schema, { ...good, name: '' })).toEqual(['$.name: shorter than 1']);
    expect(validate(schema, { ...good, either: 3 })).toEqual(['$.either: matches none of 2 shapes']);
  });

  test('the schema the harness reads is the one the packets are checked against', () => {
    const file = JSON.parse(readFileSync(join(import.meta.dir, '..', 'packet.schema.json'), 'utf8'));
    expect(file).toEqual(JSON.parse(JSON.stringify(PACKET_SCHEMA)));
  });
});

describe('a saved dream as packets', () => {
  // Two dreams the owner judged: the snow train (seats facing, the suitcase, an open door), the lighthouse (stairs,
  // a tractor, a held boat).
  const ids = (frozenDreams() as string[]).filter((id) => /b0cb|affd/.test(id));

  for (const id of ids)
    for (const [label, env] of [
      ['every switch on', FULL],
      ['every switch off', OFF],
    ] as const)
      test(`${id.slice(-4)}, ${label}: a packet for every cut, each keeping to the schema and saying what the rebuild says`, () => {
        withEnv(env, () => {
          const session = loadDream(id, false).session as Session;
          const r = rebuild(session);
          const before = r.pictures.map((p) => p.prompt);
          const history = (moment: string) =>
            moment === 'm2' ? [{ source: 'local' as const, run: 'night-2', verdict: 'partly' as const, note: '' }] : [];
          const pk = dreamPacket(r, { dream: id, style: session.style!, history });
          expect(validate(PACKET_SCHEMA, pk)).toEqual([]);
          const cuts = r.pictures.filter((p) => p.kind === 'cut');
          expect(pk.cuts.map((c) => c.identity.cut)).toEqual(cuts.map((p) => p.id));
          expect(pk.ghosts.map((g) => g.id)).toEqual(r.pictures.filter((p) => p.kind === 'ghost').map((p) => p.id));
          expect(pk.elements.map((e) => e.id)).toEqual(r.sheets.map((s) => s.id));
          const byId = new Map(moments(r.b).map((m) => [m.id, m]));
          for (const [i, c] of pk.cuts.entries()) {
            const p = cuts[i];
            const m = byId.get(p.id)!;
            expect(c.prompts['nano-banana-pro'].text).toBe(p.prompt);
            expect(c.prompts['nano-banana-pro'].images).toEqual(p.references.map((x) => x.media_id));
            expect(c.identity.order).toBe(p.item.frame!.order);
            expect(c.story.action).toBe(m.action);
            expect(c.story.point).toBe(m.visual_point || null);
            expect(c.camera.eyes).toBe(m.eyes);
            // As JSON writes them: a camera facing straight along an axis has no -0.
            const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));
            expect(c.camera.eye).toEqual(json(p.item.frame!.plan?.eye ?? null));
            expect(c.dependencies.images.map((x) => [x.media, x.role])).toEqual(
              p.references.map((x) => [x.media_id, x.role]),
            );
            expect(c.dependencies.needs).toEqual(p.item.frame!.plan?.needs ?? []);
            expect(c.checks.criteria).toEqual(json(p.criteria));
            expect(c.history.verdicts).toEqual(history(p.id));
            if (p.sheet) {
              expect(c.who.inView.map((x) => x.id)).toEqual(p.sheet.inView.map((x) => x.id));
              expect(c.checks.sheetHash).toBe(p.sheet.hash);
            }
          }
          // Making the packets changed nothing the rebuild had.
          expect(r.pictures.map((p) => p.prompt)).toEqual(before);
        });
      });

  test('with the camera rules, a cut on a floor plan carries it, its camera on it and its mock-up', () => {
    withEnv(FULL, () => {
      const id = ids.find((x) => x.endsWith('b0cb'))!;
      const session = loadDream(id, false).session as Session;
      const r = rebuild(session);
      const pk = dreamPacket(r, { dream: id, style: session.style!, history: () => [] });
      const planned = pk.cuts.filter((c) => c.camera.eye);
      expect(planned.length).toBeGreaterThan(0);
      for (const c of planned) {
        expect(c.camera.floorPlan?.spots.length).toBeGreaterThan(0);
        expect(c.camera.previs?.media).toBe(`previs-${c.identity.cut}`);
      }
      // The snow train's grandfather sits across from the dreamer, on the seats facing each other, with his suitcase.
      const m2 = pk.cuts.find((c) => c.identity.cut === 'm2')!;
      expect(m2.camera.floorPlan!.spots.some((s) => s.shape === 'seat')).toBe(true);
      expect(m2.state.held).toBeDefined();
    });
  });

  test("a cut's mock-up files, its prompts for other models and a run drawn without readings, as they are given", () => {
    withEnv(FULL, () => {
      const id = ids[0];
      const session = loadDream(id, false).session as Session;
      const r = rebuild(session);
      const pk = dreamPacket(r, {
        dream: id,
        style: session.style!,
        history: (cut) =>
          cut === 'm1' ? [{ source: 'local', run: 'qwen-1', verdict: 'wrong', withoutReadings: true }] : [],
        previs: (cut) => ({
          clay: { file: `previs/${cut}.png`, sha256: 'a'.repeat(64) },
          keyed: {
            file: `previs/${cut}-keyed.png`,
            sha256: 'b'.repeat(64),
            key: [{ id: 'p1', name: 'the dreamer', colour: 'red', kind: 'person' }],
          },
        }),
        prompts: (p) => ({ 'qwen-image': { text: `fitted ${p.id}`, images: ['previs-x'], dropped: ['sketch-l1'] } }),
      });
      expect(validate(PACKET_SCHEMA, pk)).toEqual([]);
      const c = pk.cuts.find((x) => x.camera.previs)!;
      expect(c.camera.previs).toEqual({
        media: `previs-${c.identity.cut}`,
        clay: { file: `previs/${c.identity.cut}.png`, sha256: 'a'.repeat(64) },
        keyed: {
          file: `previs/${c.identity.cut}-keyed.png`,
          sha256: 'b'.repeat(64),
          key: [{ id: 'p1', name: 'the dreamer', colour: 'red', kind: 'person' }],
        },
      });
      expect(c.prompts['qwen-image']).toEqual({
        text: `fitted ${c.identity.cut}`,
        images: ['previs-x'],
        dropped: ['sketch-l1'],
      });
      expect(pk.cuts[0].history.verdicts[0].withoutReadings).toBe(true);
      // A cut with no floor plan has no mock-up to name.
      for (const x of pk.cuts.filter((y) => !y.camera.eye)) expect(x.camera.previs).toBeNull();
    });
  });

  test("the dreamer's look marked unknown where they never said it, guessed or not; known where they did", () => {
    withEnv(FULL, () => {
      const id = ids[0];
      const session = loadDream(id, false).session as Session;
      const r = rebuild(session);
      const said = (s: (typeof r.sheets)[number]) => ['appearance', 'wardrobe'].some((k) => s.fields[k]?.said);
      const pk = dreamPacket(r, { dream: id, style: session.style!, history: () => [] });
      for (const e of pk.elements) {
        const s = r.sheets.find((x) => x.id === e.id)!;
        expect(e.lookUnknown).toBe(!!s.isDreamer && !said(s));
      }
      // The same dream with the dreamer's look never said: unknown, whatever was filled in for it as a guess.
      const unsaid = structuredClone(r);
      const me = unsaid.sheets.find((x) => x.isDreamer)!;
      for (const k of ['appearance', 'wardrobe'])
        me.fields[k] = { value: 'a man in his thirties, plain clothes', said: false };
      const guessed = dreamPacket(unsaid, { dream: id, style: session.style!, history: () => [] });
      expect(guessed.elements.find((e) => e.id === me.id)!.lookUnknown).toBe(true);
      expect(validate(PACKET_SCHEMA, guessed)).toEqual([]);
    });
  });

  test('a broken packet is caught', () => {
    withEnv(FULL, () => {
      const id = ids[0];
      const session = loadDream(id, false).session as Session;
      const r = rebuild(session);
      const pk = dreamPacket(r, { dream: id, style: session.style!, history: () => [] });
      const bad = structuredClone(pk) as unknown as { cuts: { story: Record<string, unknown> }[] };
      delete bad.cuts[0].story.action;
      bad.cuts[0].story.colour = 'red';
      expect(validate(PACKET_SCHEMA, bad)).toEqual([
        '$.cuts[0].story: action is missing',
        '$.cuts[0].story: colour is not allowed',
      ]);
    });
  });
});

describe('every field a spot can have is in the schema', () => {
  // A person turned to whom they attend to carried `attending: true`, which the schema did not know: every packet with
  // one broke it (the merged flow's imports, Open Wide m5, 1 Oct), and no saved dream had one to catch it. Required<Spot>
  // fails to compile when the floor plan's spot gains a field this list lacks; the schema check, when the schema does.
  test('a spot with all of them set validates', () => {
    const all: Required<Spot> = {
      id: 'p1',
      x: 1,
      y: 2,
      faces: 'p3',
      attending: true,
      many: false,
      kind: 'person',
      pose: 'standing',
      size: [0.5, 0.5, 1.7],
      shape: 'seat',
      heldBy: 'p2',
      count: 3,
      spread: [2, 1],
      fixture: false,
      name: 'the dentist',
      height: 1.7,
      body: 'human',
      above: 0.5,
      climbing: { of: 't1', how: 'into' },
      rides: 'front',
      open: true,
    };
    const defs = (PACKET_SCHEMA as { $defs: Record<string, unknown> }).$defs;
    expect(validate(defs.spot as never, all)).toEqual([]);
  });
});
