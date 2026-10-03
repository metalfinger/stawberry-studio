// The world's state at a cut, each attribute resolved once where the rebuild decides it (resolvers.ts): present from
// the story record, location from the floor plan, held by from the record, inside of by the reading placement puts a
// thing in by, open on the fixture the part is, facing from the plan; filled into version 8 only by Dream Chat's
// writer, a version 7 packet turned into version 8 keeping it null.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { containerFor } from '../castplace';
import { fixtureOfPart } from '../continuity';
import { toV8, validatePacket } from '../contract';
import { PROFILE } from '../evals/profile';
import { loadDream } from '../evals/saved';
import { dreamPacket } from '../packet';
import { type Rebuilt, rebuild } from '../plan';
import { withWorld, worldAt } from '../resolvers';
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

const rebuilt = new Map<string, { s: Session; r: Rebuilt }>();
const of = (id: string) => {
  if (!rebuilt.has(id)) {
    const s = loadDream(id, false).session as Session;
    rebuilt.set(id, { s, r: withEnv(PROFILE, () => rebuild(s)) });
  }
  return rebuilt.get(id)!;
};
const world = (id: string, cut: string) => withEnv(PROFILE, () => worldAt(of(id).r, cut));
const pick = (w: ReturnType<typeof world>, entity: string, attr: string) =>
  w.filter((v) => v.entity === entity && v.attr === attr);

describe('the world at a saved cut', () => {
  test('present, from the story record: shown, and gone where its words say so', () => {
    const m2 = world('dream-0925-231131-affd', 'm2');
    expect(pick(m2, 'p1', 'present')[0]).toMatchObject({ value: true, by: 'record.shows', basis: 'read' });
    const m3 = world('dream-0925-231131-affd', 'm3');
    expect(pick(m3, 'p2', 'present')[0]).toMatchObject({ value: false, by: 'record.gone' });
    expect(pick(m3, 'p2', 'location')).toEqual([]);
  });

  test('location and facing, from the floor plan; who holds what, from the record, never also a location', () => {
    const w = world('dream-0925-231131-affd', 'm2');
    const loc = pick(w, 'p1', 'location')[0];
    expect(loc).toMatchObject({ by: 'writer.blocking', basis: 'read', quote: null });
    // In the metres of the floor plan it is on: `<scene>/<place>`, as the packet's places name it.
    expect((loc.value as { place: string }).place).toMatch(/^s\d+\/l1$/);
    expect(pick(w, 'p1', 'facing')[0]?.value).toBe('back');
    expect(pick(w, 't1', 'held_by')[0]).toMatchObject({ value: 'p1', by: 'record.held' });
    expect(pick(w, 't1', 'location')).toEqual([]);
  });

  test("a thing in someone's hands on the plan, the record silent: the plan's holder; no facing for anyone not there", () => {
    // The record no longer says who holds the boat; the plan still has it in the dreamer's hands.
    const r = structuredClone(of('dream-0925-231131-affd').r);
    r.dream!.record!.moments.find((x) => x.id === 'm2')!.held = {};
    const w = withEnv(PROFILE, () => worldAt(r, 'm2'));
    expect(pick(w, 't1', 'held_by')[0]).toMatchObject({ value: 'p1', by: 'plan.heldBy', basis: 'derived' });
    expect(pick(w, 't1', 'location')).toEqual([]);
    // The dreamer is the camera through their own eyes: no facing for them.
    const m3 = withEnv(PROFILE, () =>
      of('dream-0925-231131-affd').r.dream!.record!.moments.find((x) => x.id === 'm3')!,
    );
    for (const v of world('dream-0925-231131-affd', 'm3').filter((x) => x.attr === 'facing'))
      expect([...m3.shows, ...m3.present]).toContain(v.entity);
  });

  test('what someone rides, and a part shut or open where the record says so', () => {
    expect(pick(world('dream-0926-000545-09ea', 'm5'), 'p1', 'rides')[0]?.value).toEqual({ on: 't3', how: 'on' });
    const b = world('dream-0926-043003-b0cb', 'm4');
    expect(pick(b, 't1', 'open')[0]).toMatchObject({ value: false, by: 'record.shut' });
    expect(pick(world('dream-0926-062232-a44a', 'm3'), 't1', 'open')[0]).toMatchObject({ value: true, part: 'lid' });
  });

  test('never two values of one attribute of one part of one thing, every value saying where it came from', () => {
    for (const [id, cut] of [
      ['dream-0925-231131-affd', 'm2'],
      ['dream-0926-043003-b0cb', 'm4'],
      ['dream-0926-000545-09ea', 'm5'],
    ] as const) {
      const w = world(id, cut);
      const keys = w.map((v) => `${v.entity}|${v.part ?? ''}|${v.attr}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const v of w) {
        expect(v.by.length).toBeGreaterThan(0);
        expect(v.quote).toBeNull();
      }
    }
  });

  test("filled into version 8 only by Dream Chat's writer; a version 7 packet turned into version 8 keeps it null", () => {
    const id = 'dream-0926-043003-b0cb';
    const { s, r } = of(id);
    const pk = withEnv(PROFILE, () => dreamPacket(r, { dream: id, style: s.style!, history: () => [] }));
    const upgraded = toV8(pk);
    expect(upgraded.cuts.every((c) => c.contract.world_at === null && c.contract.basis.world_at === 'unknown')).toBe(
      true,
    );
    const written = withEnv(PROFILE, () => withWorld(upgraded, r));
    expect(validatePacket(written)).toEqual([]);
    expect(written.cuts.every((c) => c.contract.world_at !== null && c.contract.basis.world_at === 'derived')).toBe(
      true,
    );
  });
});

describe('placement and the world read a part and a container the same way', () => {
  const kitchen: Blocking = {
    front: 'the window over the sink',
    indoors: true,
    room: [3.5, 3],
    spots: [
      { id: 'x3', x: 3, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
      { id: 'x4', x: 0.5, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the top drawer' },
      { id: 't1', x: 1.8, y: 1.3, kind: 'thing', size: [0.03, 0.001, 0.025], name: 'the stamp' },
    ],
  };

  test('a part is the one fixture whose name has every word of it', () => {
    expect(fixtureOfPart(kitchen, 'cutlery drawer', 'the cutlery drawer')?.id).toBe('x3');
    expect(fixtureOfPart(kitchen, 'drawer', 'drawer')).toBeUndefined();
  });

  test("what holds a thing: by the words, and by a cast thing's own word of where it is where it is first seen", () => {
    withEnv({ DREAMCHAT_ONE_BUILDER: 'on' }, () => {
      const words = 'The grandmother lays the stamp in her cutlery drawer';
      expect(containerFor({ name: 'the stamp', kind: 'thing' }, 'm9', words, kitchen.spots)?.id).toBe('x3');
      const cast = {
        name: 'the knives and forks',
        kind: 'thing' as const,
        side: 'in her cutlery drawer',
        moments: [{ id: 'm9', where: 'in' as const }],
      };
      expect(containerFor(cast, 'm9', 'She waits', kitchen.spots)?.id).toBe('x3');
      expect(containerFor(cast, 'm10', 'She waits', kitchen.spots)).toBeUndefined();
      expect(containerFor({ name: 'the stamp', kind: 'person' as never }, 'm9', words, kitchen.spots)).toBeUndefined();
    });
  });
});
