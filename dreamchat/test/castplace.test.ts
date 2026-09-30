// The cast reading put on the floor plan (castplace.ts): what the moments need drawn and the breakdown never cast,
// placed by what the words put it by, at the size they give; people and creatures at their own size and shape; the
// fixtures a place's own words name. Written from the read of every frozen prompt (30 Sep).
import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import type { CastReading } from '../cast-types';
import { castThings, sizeFromWords, withCastBodies, withCastFixtures, withCastSpots } from '../castplace';
import { rawPlanBy, type RecordPlan } from '../continuity';
import { loadDream } from '../evals/saved';

const room: Blocking = {
  front: 'the board',
  indoors: true,
  room: [8, 10],
  spots: [
    { id: 'p1', x: 4, y: 6, kind: 'person', faces: 'front' },
    { id: 'x1', x: 0.05, y: 5, kind: 'thing', fixture: true, name: 'the window', size: [0.1, 1, 1.2], above: 1 },
  ],
};
const reading = (things: CastReading['things']): CastReading => ({ things, bodies: [], fixtures: [] });
const thing = (over: Partial<CastReading['things'][number]>): CastReading['things'][number] => ({
  name: 'the red tractor',
  look: 'red',
  kind: 'thing',
  moments: [{ id: 'm1', where: 'in' }],
  near: null,
  side: null,
  size: null,
  many: null,
  ...over,
});

describe('a cast thing', () => {
  test('ids follow the reading, weather and matter left out', () => {
    const r = reading([
      thing({ name: 'the rain', kind: 'weather' }),
      thing({ name: 'the tractor' }),
      thing({ name: 'the dog' }),
    ]);
    expect(castThings(r).map((x) => [x.id, x.t.name])).toEqual([
      ['c1', 'the tractor'],
      ['c2', 'the dog'],
    ]);
  });

  test('is as big as its words say', () => {
    expect(sizeFromWords('as big as a bus', 'creature')).toEqual([2.5, 11, 3.2]);
    expect(sizeFromWords('huge', 'thing')).toEqual([1.8, 1.8, 1.8]);
    expect(sizeFromWords('little', 'creature')[2]).toBeCloseTo(0.32, 5);
    expect(sizeFromWords('about 30 feet long', 'creature')).toEqual([4.57, 9.14, 2.29]);
    expect(sizeFromWords(null, 'vehicle')).toEqual([1.8, 3.5, 2.2]);
  });

  test('ridden, a vehicle is under its rider; else it stands the way the words say from what it is by', () => {
    const moment = { id: 'm1', action: 'The dreamer rides in the red tractor through the grass' };
    const ridden = withCastSpots(room, reading([thing({ kind: 'vehicle', near: 'p1' })]), moment, 'p1');
    const c1 = ridden.spots.find((s) => s.id === 'c1')!;
    expect([c1.x, c1.y, c1.shape]).toEqual([4, 6, 'vehicle']);
    // Ahead of the dreamer, who faces the front (toward y = 0): nearer the front.
    const ahead = withCastSpots(
      room,
      reading([thing({ name: 'the dog', kind: 'creature', near: 'p1', side: 'ahead of the dreamer' })]),
      { id: 'm1', action: 'The dog runs ahead' },
      'p1',
    );
    const dog = ahead.spots.find((s) => s.id === 'c1')!;
    expect(dog.y).toBeLessThan(6);
    // Nothing already on the plan moves.
    expect(ahead.spots.filter((s) => s.id !== 'c1')).toEqual(room.spots);
    // Only in the moments that show it.
    expect(withCastSpots(room, reading([thing({})]), { id: 'm2', action: '' }, 'p1').spots).toEqual(room.spots);
  });

  test('seen out past the place, it is outside, on the wall of the window it is seen through', () => {
    const out = withCastSpots(
      room,
      reading([
        thing({ name: 'the drowned city', moments: [{ id: 'm1', where: 'beyond' }], side: 'through the window' }),
      ]),
      { id: 'm1', action: 'The city lies underwater outside' },
      'p1',
    );
    expect(out.outside).toEqual({ c1: 'left' });
    expect(out.spots).toEqual(room.spots);
  });

  test('a crowd is many', () => {
    const boats = withCastSpots(
      room,
      reading([thing({ name: 'a crowd of boats', many: null })]),
      { id: 'm1', action: '' },
      'p1',
    );
    expect(boats.spots.find((s) => s.id === 'c1')?.many).toBe(true);
    const three = withCastSpots(room, reading([thing({ name: 'the boats', many: 3 })]), { id: 'm1', action: '' }, 'p1');
    expect(three.spots.find((s) => s.id === 'c1')).toMatchObject({ many: true, count: 3 });
  });
});

describe('the place’s own fixtures', () => {
  test('windows along each side, up the wall; rows facing the front, split by the aisle', () => {
    const train: Blocking = { front: 'the front of the train', indoors: true, room: [3, 12], spots: [] };
    const placed = withCastFixtures(
      train,
      [
        {
          place: 'l1',
          name: 'the windows',
          kind: 'opening',
          where: 'along each side',
          count: null,
          words: 'a row of windows along each side',
        },
        { place: 'l1', name: 'bench seats', kind: 'row', where: null, count: 4, words: 'two rows of bench seats' },
        {
          place: 'l1',
          name: 'a narrow aisle',
          kind: 'aisle',
          where: null,
          count: null,
          words: 'a narrow aisle between',
        },
        { place: 'l2', name: 'the lamps', kind: 'opening', where: null, count: null, words: 'lamps' },
      ],
      'l1',
    );
    const windows = placed.spots.filter((s) => s.name === 'a window');
    expect(new Set(windows.map((w) => (w.x < 1 ? 'left' : 'right')))).toEqual(new Set(['left', 'right']));
    expect(windows.every((w) => w.above === 1)).toBe(true);
    const seats = placed.spots.filter((s) => s.name === 'bench seats');
    expect(seats.length).toBe(8);
    expect(seats.every((s) => Math.abs(s.x - 1.5) > 0.4)).toBe(true);
    expect(placed.spots.some((s) => s.name === 'a narrow aisle' && s.shape === 'ground')).toBe(true);
    expect(placed.spots.some((s) => s.name === 'the lamps')).toBe(false);
    // Never where the plan already has one, and never out of doors.
    expect(
      withCastFixtures(
        room,
        [{ place: 'l1', name: 'the windows', kind: 'opening', where: null, count: null, words: 'windows' }],
        'l1',
      ).spots,
    ).toEqual(room.spots);
    expect(
      withCastFixtures(
        { ...train, indoors: false },
        [{ place: 'l1', name: 'the windows', kind: 'opening', where: null, count: null, words: 'windows' }],
        'l1',
      ).spots,
    ).toEqual([]);
  });
});

describe('bodies', () => {
  test('each at the height and in the shape the reading gives', () => {
    const plan = withCastBodies(room, [{ id: 'p1', height_m: 1.15, shape: 'human', words: 'about six years old' }]);
    expect(plan.spots[0]).toMatchObject({ height: 1.15, body: 'human' });
    expect(withCastBodies(room, [])).toBe(room);
  });
});

describe('on a saved dream', () => {
  test('with the reading on the record, its fixtures and things are on the moment’s floor plan; without it, as before', () => {
    const b = structuredClone(loadDream('dream-0926-043003-b0cb', false).session.draft!.breakdown!);
    // As the rebuild casts it before planning (cast.ts withCastThings): in view at the moment that shows it.
    b.scenes
      .flatMap((sc) => sc.moments)
      .find((m) => m.id === 'm3')!
      .things.push('c1');
    const cast: CastReading = {
      things: [
        {
          id: 'c1',
          name: 'the paper tickets',
          look: 'yellowed paper',
          kind: 'thing',
          moments: [{ id: 'm3', where: 'in' }],
          near: 'p2',
          side: 'beside the grandfather',
          size: null,
          many: 3,
        },
      ],
      bodies: [],
      fixtures: [
        {
          place: 'l1',
          name: 'the windows',
          kind: 'opening',
          where: 'along each side',
          count: 3,
          words: 'a row of windows along each side',
        },
      ],
    };
    const none = { moments: {}, before: {}, ends: {}, unsaid: {} } as unknown as RecordPlan;
    const env = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' };
    const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const plan = rawPlanBy(b, 'm3', { ...none, cast })!;
      expect(plan.spots.filter((s) => s.name === 'a window').length).toBe(6);
      const c1 = plan.spots.find((s) => s.id === 'c1')!;
      expect(c1).toMatchObject({ many: true, count: 3 });
      expect(rawPlanBy(b, 'm3', none)!.spots.some((s) => s.id === 'c1' || s.name === 'a window')).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(was))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });
});
