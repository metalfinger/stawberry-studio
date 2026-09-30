// The cast reading put on the floor plan (castplace.ts): what the moments need drawn and the breakdown never cast,
// placed by what the words put it by, at the size they give; people and creatures at their own size and shape; the
// fixtures a place's own words name. Written from the read of every frozen prompt (30 Sep).
import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import type { CastReading } from '../cast-types';
import { castThings, sizeFromWords, smallSizeOf, withCastBodies, withCastFixtures, withCastSpots } from '../castplace';
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
    // "Is in the tractor, sitting next to the driver" is riding it too (lighthouse-first m8).
    const inIt = withCastSpots(
      room,
      reading([thing({ kind: 'vehicle' })]),
      { id: 'm1', action: 'Suddenly the dreamer is in the tractor, sitting next to the driver' },
      'p1',
    );
    expect(inIt.spots.find((s) => s.id === 'c1')).toMatchObject({ x: 4, y: 6 });
    // Two sitting with nothing under them beside it (the driver and the dreamer in the open field, affd m9): it is
    // under them both, whatever the words say of it.
    const pair: Blocking = {
      front: 'the beach',
      spots: [
        { id: 'p1', x: 50.5, y: 50, kind: 'person', pose: 'sitting' },
        { id: 'p4', x: 49.5, y: 50, kind: 'person', pose: 'sitting' },
      ],
    };
    const under = withCastSpots(
      pair,
      reading([thing({ name: 'the red tractor', kind: 'vehicle' })]),
      { id: 'm1', action: 'The red tractor drives slowly through the tall yellow grass' },
      'p1',
    );
    expect(under.spots.find((s) => s.id === 'c1')).toMatchObject({ x: 50, y: 50, shape: 'vehicle' });
    // Standing beside it, they are not in it.
    const standing = { ...pair, spots: pair.spots.map((s) => ({ ...s, pose: 'standing' as const })) };
    const beside = withCastSpots(
      standing,
      reading([thing({ name: 'the red tractor', kind: 'vehicle' })]),
      { id: 'm1', action: 'The red tractor drives slowly through the tall yellow grass' },
      'p1',
    ).spots.find((s) => s.id === 'c1')!;
    expect(Math.hypot(beside.x - 50.5, beside.y - 50)).toBeGreaterThan(1);
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

  test('on or at something the place has, it is on it, at the edge nearest whoever it is by', () => {
    // The little boats the father folds "at a table" stood a metre past the table (affd m4).
    const study: Blocking = {
      front: 'the door',
      indoors: true,
      room: [5, 6],
      spots: [
        { id: 'p3', x: 2.5, y: 2.5, kind: 'person', faces: 'x1' },
        { id: 'x1', x: 2.5, y: 3, kind: 'thing', fixture: true, name: 'the table', size: [1.5, 0.8, 0.8] },
      ],
    };
    const boats = withCastSpots(
      study,
      reading([thing({ name: 'the little boats', near: 'p3', side: 'at a table', size: 'little' })]),
      { id: 'm1', action: 'The father folds little boats at the table' },
      'p1',
    ).spots.find((s) => s.id === 'c1')!;
    expect(boats.x).toBeCloseTo(2.5, 5);
    // On the table's near edge, toward the father: within its footprint.
    expect(boats.y).toBeGreaterThan(2.6);
    expect(boats.y).toBeLessThan(3);
    // Nothing of that name here: placed as before, by the way the words say.
    const none = withCastSpots(
      study,
      reading([thing({ name: 'the little boats', near: 'p3', side: 'at the shelf' })]),
      { id: 'm1', action: '' },
      'p1',
    ).spots.find((s) => s.id === 'c1')!;
    expect(none.y).toBeGreaterThan(3.4);
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
  test('a thing stays where the scene first showed it, whoever moves after', () => {
    // Placed against the scene's own plan, before any moment's moves (continuity.ts rawPlanBy), a thing by the
    // dreamer never follows them round the room from cut to cut: pinned here, as the S6 pane asked (30 Sep).
    const b = structuredClone(loadDream('dream-0925-231131-affd', false).session.draft!.breakdown!);
    const me = b.people.find((p) => p.is_dreamer)!.id;
    for (const m of b.scenes.flatMap((sc) => sc.moments).filter((x) => x.id === 'm4' || x.id === 'm6'))
      m.things.push('c1');
    const cast: CastReading = {
      things: [
        {
          id: 'c1',
          name: 'the folded letters',
          look: 'white paper',
          kind: 'thing',
          moments: [
            { id: 'm4', where: 'in' },
            { id: 'm6', where: 'in' },
          ],
          near: me,
          side: 'beside the dreamer',
          size: null,
          many: null,
        },
      ],
      bodies: [],
      fixtures: [],
    };
    const none = { moments: {}, before: {}, ends: {}, unsaid: {} } as unknown as RecordPlan;
    const env = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' };
    const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const at = (m: string) => rawPlanBy(b, m, { ...none, cast })!;
      const c4 = at('m4').spots.find((s) => s.id === 'c1')!;
      const c6 = at('m6').spots.find((s) => s.id === 'c1')!;
      const d4 = at('m4').spots.find((s) => s.id === me)!;
      const d6 = at('m6').spots.find((s) => s.id === me)!;
      // The dreamer moved; the letters did not.
      expect(Math.hypot(d6.x - d4.x, d6.y - d4.y)).toBeGreaterThan(0.1);
      expect([c6.x, c6.y, c6.faces]).toEqual([c4.x, c4.y, c4.faces]);
    } finally {
      for (const [k, v] of Object.entries(was))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });

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

describe('a story thing the plan gives no size', () => {
  test('is the size its words give: a measure, else what it is', () => {
    // Unsized, the brass key before the dreamer's eyes was a suitcase-sized box, the paper boat a metre block
    // (lighthouse-fresh m2, m15, judged blind).
    expect(smallSizeOf('the brass key', 'Old brass key, smooth on the bow')).toEqual([0.08, 0.03, 0.01]);
    expect(smallSizeOf('the paper boat', 'Folded out of newspaper')).toEqual([0.15, 0.08, 0.1]);
    expect(smallSizeOf('the boat', 'A small paper boat about 4 inches long')![0]).toBeCloseTo(0.102, 3);
    expect(smallSizeOf('the thing', 'about 15 cm long')![0]).toBeCloseTo(0.15, 3);
    // By its own name only: a door whose look names its key hole is no key; "one in each hand" is no inch.
    expect(smallSizeOf('the lighthouse door', 'heavy, with a brass key hole')).toBeUndefined();
    expect(smallSizeOf('the lamp post')).toBeUndefined();
    expect(smallSizeOf('the red tractor', 'one in each hand')).toBeUndefined();
    // Nothing of a hand's size, nothing said: as before.
    expect(smallSizeOf('the red tractor')).toBeUndefined();
    expect(smallSizeOf('the yellow rowing boat')).toBeUndefined();
  });

  test('on the saved dream, with the camera rules', () => {
    const b = structuredClone(loadDream('dream-0926-022102-aeea', false).session.draft!.breakdown!);
    const none = { moments: {}, before: {}, ends: {}, unsaid: {} } as unknown as RecordPlan;
    const env = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' };
    const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const boat = rawPlanBy(b, 'm15', none)!.spots.find((s) => s.id === 't2');
      expect(boat?.size).toEqual([0.15, 0.08, 0.1]);
    } finally {
      for (const [k, v] of Object.entries(was))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });
});
