// One thing for one thing on a place's floor plan (the one builder's `one_fixture`): a thing and the plan's fixture of
// its name are one, by the thing's id, in the breakdown itself; a fixture named with another thing of the dream on it is
// named without it; and a place has the windows its words give, no more. The merged flow's slice (3 Oct) drew two wall
// calendars in the family meeting, and her kitchen, whose words give one window over the sink, had three.
import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import type { CastFixture } from '../cast-types';
import { withCastFixtures } from '../castplace';
import { shotPlan } from '../continuity';
import { PROFILE } from '../evals/profile';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { type Breakdown, completeViews, oneFixture } from '../producer';
import type { Session } from '../session';

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
const on = <T>(fn: () => T) => withEnv({ DREAMCHAT_ONE_BUILDER: 'on' }, fn);
const before = <T>(fn: () => T) => withEnv({ DREAMCHAT_ONE_BUILDER: 'shared_holds' }, fn);

/** The family meeting as the slice's writer planned it, with the cast's wall calendar in view at m1. */
function meeting(): Breakdown {
  return {
    title: 'Grandmother',
    people: [{ id: 'p1', name: 'the grandmother' }],
    places: [{ id: 'l1', name: 'the family meeting' }],
    things: [
      { id: 'c1', name: 'the wall calendar' },
      { id: 'v1', name: 'the appointment schedule' },
    ],
    scenes: [
      {
        id: 's1',
        place: 'l1',
        moments: [
          { id: 'm1', place: 'l1', visible: ['p1'], things: ['c1'], action: '', eyes: 'outside', distance: 'wide' },
          { id: 'm2', place: 'l1', visible: ['p1'], things: [], action: '', eyes: 'outside', distance: 'wide' },
        ],
        blocking: {
          front: 'the wall calendar',
          indoors: true,
          room: [5, 4],
          spots: [
            { id: 'p1', x: 2, y: 2, kind: 'person', pose: 'sitting', faces: 'x2' },
            {
              id: 'x1',
              x: 2.5,
              y: 2,
              kind: 'thing',
              fixture: true,
              name: 'the table with schedules and calendars',
              size: [2, 1, 0.75],
            },
            { id: 'x2', x: 2.5, y: 3.9, kind: 'thing', fixture: true, name: 'the wall calendar', above: 1.4 },
            { id: 'x3', x: 4, y: 3, kind: 'thing', fixture: true, name: 'the pile of paper calendars' },
            { id: 'x4', x: 1, y: 3, kind: 'thing', fixture: true, name: 'the desks with green glass lamps' },
          ],
          moves: { m2: [{ id: 'p1', x: 2.2, y: 2, faces: 'x2' }] },
          looks: { m1: 'x2' },
        },
      },
    ],
  } as unknown as Breakdown;
}
const spots = (b: Breakdown) => b.scenes[0].blocking!.spots;

describe('one thing for one thing, in the breakdown', () => {
  test('a fixture with the name of a thing in view there is that thing, by its id; whoever faces it or looks at it, by it', () => {
    const b = meeting();
    on(() => oneFixture(b));
    expect(
      spots(b)
        .filter((s) => /calendar$/.test(s.name ?? ''))
        .map((s) => s.id),
    ).toEqual(['c1']);
    expect(spots(b).find((s) => s.id === 'c1')).toMatchObject({ fixture: true, x: 2.5, y: 3.9, above: 1.4 });
    expect(spots(b).find((s) => s.id === 'p1')?.faces).toBe('c1');
    expect(b.scenes[0].blocking!.moves?.m2[0].faces).toBe('c1');
    expect(b.scenes[0].blocking!.looks?.m1).toBe('c1');
  });

  test('a fixture named with another thing of the dream on it is named without it; never what it is made of, nor what is no thing of the dream', () => {
    const b = meeting();
    on(() => oneFixture(b));
    expect(spots(b).find((s) => s.id === 'x1')?.name).toBe('the table');
    expect(spots(b).find((s) => s.id === 'x3')?.name).toBe('the pile of paper calendars');
    expect(spots(b).find((s) => s.id === 'x4')?.name).toBe('the desks with green glass lamps');
  });

  test('a thing in view in no moment of the plan, or two fixtures of its name: neither is taken', () => {
    const away = meeting();
    away.scenes[0].moments[0].things = [];
    on(() => oneFixture(away));
    expect(spots(away).some((s) => s.id === 'c1')).toBe(false);
    const two = meeting();
    spots(two).push({ id: 'x5', x: 0.1, y: 2, kind: 'thing', fixture: true, name: 'the wall calendar' });
    on(() => oneFixture(two));
    expect(spots(two).some((s) => s.id === 'c1')).toBe(false);
  });

  test('run again, nothing more changes', () => {
    const b = meeting();
    on(() => oneFixture(b));
    const once = JSON.stringify(b);
    expect(on(() => oneFixture(b))).toEqual([]);
    expect(JSON.stringify(b)).toBe(once);
  });

  test('without the step, as the writer planned it', () => {
    const b = meeting();
    expect(before(() => oneFixture(b))).toEqual([]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(meeting()));
  });

  test("the breakdown's own completing never does it: only a rebuild, on its own copy", () => {
    const b = meeting();
    on(() => completeViews(b));
    expect(spots(b).some((s) => s.id === 'x2' && s.name === 'the wall calendar')).toBe(true);
  });

  test("a place's own floor plan in a scene, by the moments there", () => {
    const b = meeting();
    const sc = b.scenes[0];
    sc.blocking = { front: 'the door', indoors: true, spots: [], places: { l1: sc.blocking! } };
    on(() => oneFixture(b));
    expect(sc.blocking.places!.l1.spots.some((s) => s.id === 'c1')).toBe(true);
  });

  test("what only a fixture's name draws stays in it: what is seen through the window, the apples on the trees", () => {
    const b = meeting();
    b.things.push({ id: 'c3', name: 'the street lights' } as Breakdown['things'][number]);
    b.scenes[0].moments[0].things.push('c3');
    spots(b).push({
      id: 'x6',
      x: 0.05,
      y: 2,
      kind: 'thing',
      fixture: true,
      name: 'the window with rain and street lights',
    });
    on(() => oneFixture(b));
    expect(spots(b).find((s) => s.id === 'x6')?.name).toBe('the window with rain and street lights');
  });

  test('what is on a fixture is dropped from its name only where a moment on its plan has it in view', () => {
    const b = meeting();
    b.scenes[0].moments[0].things = [];
    on(() => oneFixture(b));
    expect(spots(b).find((s) => s.id === 'x1')?.name).toBe('the table with schedules and calendars');
  });

  test('a device is never one with a fixture here: it takes over its own where it stands', () => {
    const b = meeting();
    b.things.push({ id: 'v2', name: 'the wall calendar' } as Breakdown['things'][number]);
    b.things = b.things.filter((t) => t.id !== 'c1');
    b.scenes[0].moments[0].things = ['v2'];
    on(() => oneFixture(b));
    expect(spots(b).some((s) => s.id === 'v2')).toBe(false);
  });
});

describe('a rebuild: the plans, the tree and the world read one thing', () => {
  test("the lighthouse's table, a thing its words name at m4 and the plan's fixture, is one by the thing's id; the saved dream is as it was", () => {
    const s = structuredClone(loadDream('dream-0925-231131-affd', false).session as Session);
    const t1 = s.draft!.breakdown!.things.find((t) => t.id === 't1')!;
    s.draft!.breakdown!.things.push({ ...structuredClone(t1), id: 't9', name: 'the table' });
    const saved = JSON.stringify(s.draft!.breakdown);
    const r = withEnv(PROFILE, () => rebuild(s));
    expect(JSON.stringify(s.draft!.breakdown)).toBe(saved);
    const plan = withEnv(PROFILE, () => shotPlan(r.b, 'm4', r.rec))!;
    expect(plan.spots.find((x) => x.id === 't9')).toMatchObject({ fixture: true, name: 'the table' });
    expect(plan.spots.some((x) => x.id === 'x1')).toBe(false);
    // The tree has the one thing, never a fixture of its name beside it.
    const tree = r.dream?.tree;
    expect(tree).toBeTruthy();
    if (tree) {
      expect(Object.keys(tree.elements)).toContain('t9');
      expect(Object.keys(tree.elements).some((k) => /\/(?:the-)?table$/.test(k))).toBe(false);
    }
  });
});

/** Her kitchen as the slice's writer planned it, and the window the cast reading reads in its words. */
const kitchen: Blocking = {
  front: 'the window over the sink',
  indoors: true,
  room: [4, 3.5],
  spots: [
    { id: 'x1', x: 2, y: 3.2, kind: 'thing', fixture: true, name: 'the sink', size: [0.8, 0.6, 0.9] },
    { id: 'x2', x: 2, y: 3.45, kind: 'thing', fixture: true, name: 'the window over the sink', above: 1.1 },
    { id: 'x3', x: 3, y: 3.2, kind: 'thing', fixture: true, name: 'the cutlery drawer' },
  ],
};
const opening = (name: string, where: string | null, words: string, count: number | null = 1): CastFixture => ({
  place: 'l2',
  name,
  kind: 'opening',
  where,
  count,
  words,
});
const window = opening(
  'the window',
  'over the sink',
  'the sink with a window over it looking out on the airport car park',
);
const named = (p: Blocking, re: RegExp) => p.spots.filter((s) => re.test(s.name ?? ''));
const without = (id: string): Blocking => ({ ...kitchen, spots: kitchen.spots.filter((s) => s.id !== id) });

describe('the windows its words give', () => {
  test("the window over the sink is the place's window: never another beside it", () => {
    expect(
      named(
        on(() => withCastFixtures(kitchen, [window], 'l2')),
        /window/,
      ).map((s) => s.id),
    ).toEqual(['x2']);
  });

  test("a window over a fixture the plan lacks the window of: one, on that fixture's wall, inside it", () => {
    const windows = named(
      on(() => withCastFixtures(without('x2'), [window], 'l2')),
      /window/,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ x: 2, y: 3.45, above: 1 });
    // Its fixture named in two words ("the kitchen sink"), and in a corner: on the nearest wall, never past its end.
    const corner: Blocking = {
      ...kitchen,
      spots: [{ id: 'x1', x: 0.3, y: 3.3, kind: 'thing', fixture: true, name: 'the kitchen sink' }],
    };
    const over = opening('the window', 'over the kitchen sink', 'a window over the kitchen sink');
    const w = named(
      on(() => withCastFixtures(corner, [over], 'l2')),
      /window/,
    );
    expect(w).toHaveLength(1);
    // On the back wall (the nearest), its middle at least half its width from the left wall, never past it.
    expect(w[0].y).toBeCloseTo(3.45, 5);
    expect(w[0].x).toBeCloseTo(0.55, 5);
  });

  test('a door by a fixture: a door, standing on the floor; a wall its words give wins over the fixture', () => {
    const door = named(
      on(() =>
        withCastFixtures(without('x2'), [opening('the door', 'beside the sink', 'a door beside the sink')], 'l2'),
      ),
      /door/,
    );
    expect(door).toHaveLength(1);
    expect(door[0].size?.[2]).toBeCloseTo(2.1, 5);
    expect(door[0].above).toBeUndefined();
    const left = named(
      on(() =>
        withCastFixtures(without('x2'), [opening('the window', 'on the left wall, beside the sink', 'a window')], 'l2'),
      ),
      /window/,
    );
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((s) => s.x === 0.05)).toBe(true);
  });

  test('where its words say it is, read to where the phrase ends; "in front of" is no wall', () => {
    const k: Blocking = {
      ...kitchen,
      spots: [
        { id: 'x1', x: 2, y: 3.2, kind: 'thing', fixture: true, name: 'the old sink' },
        { id: 'x7', x: 1, y: 0.3, kind: 'thing', fixture: true, name: "the dreamer's bed" },
      ],
    };
    const at = (where: string) =>
      named(
        on(() => withCastFixtures(k, [opening('the window', where, 'a window')], 'l2')),
        /window/,
      ).map((s) => [s.x, s.y]);
    expect(at('over the old sink where she washes up')).toEqual([[2, 3.45]]);
    expect(at('over the sink in front of her')).toEqual([[2, 3.45]]);
    expect(at("beside the dreamer's bed")).toEqual([[1, 0.05]]);
  });

  test('rows of seats are rows across the floor, as before; a row of windows and a pair of doors, as before', () => {
    const hall: Blocking = { front: 'the stage', indoors: true, room: [10, 14], spots: [] };
    const seats: CastFixture = {
      place: 'l1',
      name: 'rows of seats',
      kind: 'row',
      where: null,
      count: null,
      words: 'rows of seats',
    };
    const rows = (fn: (f: () => Blocking) => Blocking) =>
      named(
        fn(() => withCastFixtures(hall, [seats], 'l1')),
        /seats/,
      );
    expect(rows(on).map((s) => [s.x, s.y, s.size])).toEqual(rows(before).map((s) => [s.x, s.y, s.size]));
    expect(rows(on).length).toBeGreaterThan(2);
    expect(rows(on).every((s) => s.faces === 'front')).toBe(true);
    const sides = {
      ...opening('a row of windows', 'along each side', 'a row of windows along each side', 3),
      place: 'l1',
    };
    const pair = { ...opening('a pair of doors', 'at the back', 'a pair of doors at the back'), place: 'l1' };
    for (const f of [sides, pair])
      expect(
        named(
          on(() => withCastFixtures(hall, [f], 'l1')),
          /./,
        ).map((s) => [s.name, s.x, s.y]),
      ).toEqual(
        named(
          before(() => withCastFixtures(hall, [f], 'l1')),
          /./,
        ).map((s) => [s.name, s.x, s.y]),
      );
  });

  test('windows all round: one window on the plan is not all of them', () => {
    const round: Blocking = {
      front: 'the table',
      indoors: true,
      room: [6, 6],
      spots: [{ id: 'x3', x: 3, y: 5.95, kind: 'thing', fixture: true, name: 'the window with the field outside' }],
    };
    const all = opening('the windows', null, 'a round room with windows all round', null);
    expect(
      named(
        on(() => withCastFixtures(round, [all], 'l2')),
        /window/,
      ).length,
    ).toBe(
      named(
        before(() => withCastFixtures(round, [all], 'l2')),
        /window/,
      ).length,
    );
    expect(
      named(
        on(() => withCastFixtures(round, [all], 'l2')),
        /window/,
      ).length,
    ).toBeGreaterThan(1);
  });

  test('without the step, as before: the window over the sink read by its last word, two more beside it', () => {
    expect(
      named(
        before(() => withCastFixtures(kitchen, [window], 'l2')),
        /window/,
      ),
    ).toHaveLength(3);
  });
});
