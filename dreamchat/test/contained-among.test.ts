// What a moment puts something among, in what holds things, is in it too, and so is a cast thing whose own reading says
// it is in it (the one builder's `contained_among`): the merged flow's Grandmother (2 Oct), "puts the stamp into her
// open cutlery drawer, among the knives and forks", had the knives and forks a cube mid-room.
import { describe, expect, test } from 'bun:test';
import type { Blocking, Spot } from '../blocking';
import type { CastReading } from '../cast-types';
import { withCastSpots } from '../castplace';

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

const kitchen: Blocking = {
  front: 'the window over the sink',
  indoors: true,
  room: [3.5, 3],
  spots: [
    { id: 'x1', x: 1.5, y: 0.3, kind: 'thing', size: [0.8, 0.6, 0.9], fixture: true, name: 'the sink' },
    { id: 'x3', x: 3, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
    { id: 'p1', x: 2.4, y: 1.2, kind: 'person', faces: 'x3', pose: 'standing' },
    { id: 'p2', x: 1.4, y: 1.4, kind: 'person', faces: 'p1', pose: 'standing' },
  ],
};

const reading = (thing: { name: string; side?: string | null; look?: string; moments?: string[] }): CastReading =>
  ({
    things: [
      {
        id: 'c1',
        name: thing.name,
        look: thing.look ?? 'cutlery',
        kind: 'thing',
        moments: (thing.moments ?? ['m9']).map((id) => ({ id, where: 'in' })),
        near: null,
        side: thing.side ?? null,
        size: null,
        many: null,
      },
    ],
    bodies: [],
    fixtures: [],
  }) as unknown as CastReading;

const placed = (step: string, r: CastReading, action: string, point = '') =>
  withEnv({ DREAMCHAT_ONE_BUILDER: step }, () =>
    withCastSpots(kitchen, r, { id: 'm9', action, visual_point: point }, 'p2').spots.find((s) => s.id === 'c1'),
  );
// In it: resting in it below its top, at a size it holds, within its footprint or where the drawer is pulled out to
// (its own depth toward the room at most).
const inDrawer = (s: Spot | undefined) =>
  !!s &&
  s.above !== undefined &&
  s.above <= 0.9 &&
  Math.max(...s.size!) <= 0.5 &&
  Math.hypot(s.x - 3, s.y - 0.3) <= Math.hypot(0.5, 0.6) / 2 + 0.6 + 0.05;

describe('what a moment puts something among, in what holds things', () => {
  const words = 'The grandmother puts the stamp into her open cutlery drawer, among the knives and forks';

  test('is in it, at a size it holds; before the step, where the cast put it', () => {
    const r = reading({ name: 'the knives and forks' });
    const before = placed('tiny_marker', r, words);
    expect(inDrawer(before)).toBe(false);
    const after = placed('contained_among', r, words);
    expect(inDrawer(after)).toBe(true);
    expect(Math.max(...after!.size!)).toBeLessThanOrEqual(0.5);
    expect(after!.above).toBeDefined();
  });

  test("the cast reading's own word of where it is: in it", () => {
    const r = reading({ name: 'the knives and forks', side: 'in her cutlery drawer' });
    expect(inDrawer(placed('tiny_marker', r, 'The grandmother turns to the dreamer'))).toBe(false);
    expect(inDrawer(placed('contained_among', r, 'The grandmother turns to the dreamer'))).toBe(true);
  });

  test('never across a clause into something else, nor where its own word of where it is says another thing', () => {
    const r = reading({ name: 'the trees' });
    expect(
      inDrawer(placed('contained_among', r, 'She drops the key into the drawer and wanders out among the trees')),
    ).toBe(false);
    const lanterns = reading({ name: 'the lanterns' });
    expect(
      inDrawer(placed('contained_among', lanterns, 'She looks into the cupboard, then dances among the lanterns')),
    ).toBe(false);
    for (const side of ["in the drawer's light", 'in the drawer light', 'in front of drawer', 'in front of the drawer'])
      expect(inDrawer(placed('contained_among', reading({ name: 'the knives and forks', side }), 'She waits'))).toBe(
        false,
      );
  });

  test('its own word of where it is holds where it is first seen, never where the moment takes it out', () => {
    const r = reading({ name: 'the knives and forks', side: 'in her cutlery drawer', moments: ['m8', 'm9'] });
    expect(inDrawer(placed('contained_among', r, 'She waits by the sink'))).toBe(false);
    const first = reading({ name: 'the knives and forks', side: 'in her cutlery drawer' });
    expect(
      inDrawer(placed('contained_among', first, 'She takes the knives and forks out of the drawer and lays them out')),
    ).toBe(false);
  });

  test('of two drawers, the one the words name whole', () => {
    const two: Blocking = {
      ...kitchen,
      spots: [
        { id: 'x4', x: 0.5, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the top drawer' },
        ...kitchen.spots,
      ],
    };
    const c1 = withEnv({ DREAMCHAT_ONE_BUILDER: 'contained_among' }, () =>
      withCastSpots(
        two,
        reading({ name: 'the knives and forks' }),
        { id: 'm9', action: 'The grandmother puts the stamp into her open cutlery drawer, among the knives and forks' },
        'p2',
      ).spots.find((s) => s.id === 'c1'),
    );
    expect(inDrawer(c1)).toBe(true);
  });

  test('never beside it, never across a sentence, never in what does not close', () => {
    const r = reading({ name: 'the knives and forks' });
    expect(
      inDrawer(placed('contained_among', r, 'She puts the stamp into her cutlery drawer, beside the knives and forks')),
    ).toBe(false);
    expect(
      inDrawer(placed('contained_among', r, 'She puts the stamp into her cutlery drawer. Among the knives and forks')),
    ).toBe(false);
    const sink = reading({ name: 'the knives and forks', side: 'in the sink' });
    expect(
      inDrawer(placed('contained_among', sink, 'She puts the stamp into the sink, among the knives and forks')),
    ).toBe(false);
  });

  test('the way it was already read, the same with the step and without: the thing in or among what holds it', () => {
    const r = reading({ name: 'the knives and forks' });
    const point = 'the grandmother laying the stamp among the knives and forks in her cutlery drawer';
    const [before, after] = ['tiny_marker', 'contained_among'].map((s) => placed(s, r, 'She opens it', point));
    expect(inDrawer(before)).toBe(true);
    expect(after).toEqual(before);
  });
});
