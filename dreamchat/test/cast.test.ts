// The cast reading (cast.ts): what the moments need drawn and the breakdown never cast, how big each body is, and
// the fixtures a place's words name, each taken only where the dream's own words hold it; with the cast_named step,
// the things cast in the breakdown and said in the prompt. A reading is written here by hand: no writer is asked.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { castId, castLook, parseCast, withCastItems, withCastThings } from '../cast';
import type { CastReading } from '../cast-types';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { moments } from '../producer';
import type { Session } from '../session';
import { DEFAULTS, pinSwitches, withSwitches } from './fakes';

setDefaultTimeout(120_000);
afterAll(pinSwitches(DEFAULTS));

const affd = () => structuredClone(loadDream('dream-0925-231131-affd', false).session as Session);
const ON = { DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_ONE_BUILDER: 'on' };

describe("the cast reading holds only what the dream's own words give", () => {
  const b = affd().draft!.breakdown!;
  const read = (x: unknown) => parseCast(JSON.stringify(x), b);

  test('a thing is kept for the moments whose words name it, by its last word, and dropped where none do', () => {
    const { reading, dropped } = read({
      things: [
        {
          name: 'the red tractor',
          look: 'red',
          kind: 'vehicle',
          moments: [{ id: 'm8' }, { id: 'm9' }, { id: 'm1' }],
        },
        { name: 'the purple giraffe', look: 'tall', kind: 'creature', moments: [{ id: 'm2' }] },
      ],
    });
    // m8 says "in the tractor": the last word holds it; m1 never names it.
    expect(reading.things.map((t) => [t.name, t.moments.map((m) => m.id)])).toEqual([
      ['the red tractor', ['m8', 'm9']],
    ]);
    expect(dropped.some((d) => d.includes('"the red tractor" at m1'))).toBe(true);
    expect(dropped.some((d) => d.includes('purple giraffe'))).toBe(true);
  });

  test('never one of the cast again, nor a part of someone cast as their own look says it; weather is never a part', () => {
    const { reading, dropped } = read({
      things: [
        { name: 'the boat', look: '', kind: 'thing', moments: [{ id: 'm4' }] },
        { name: 'the key', look: '', kind: 'thing', moments: [{ id: 'm1' }] },
      ],
    });
    expect(reading.things).toEqual([]);
    expect(dropped.filter((d) => d.includes('already cast')).length).toBe(2);
  });

  test('a body only for someone cast, with a height in reason and size words from the dream', () => {
    const { reading, dropped } = read({
      bodies: [
        { id: 'p2', height_m: 0.3, shape: 'four-legged', words: '' },
        { id: 'p2', height_m: 90, shape: 'four-legged', words: '' },
        { id: 'p9', height_m: 1, shape: 'human', words: '' },
        { id: 'p2', height_m: 3, shape: 'four-legged', words: 'as big as a house' },
      ],
    });
    expect(reading.bodies).toEqual([{ id: 'p2', height_m: 0.3, shape: 'four-legged', words: '' }]);
    expect(dropped.length).toBe(3);
  });

  test("a fixture only where the place's own words name it", () => {
    const place = b.places[0];
    const own = Object.values(place.fields ?? {})
      .map((d) => (d as { value?: string | null })?.value ?? '')
      .join(' ');
    const word = own.split(/\W+/).find((w) => w.length > 4)!;
    const { reading, dropped } = read({
      fixtures: [
        { place: place.id, name: word, kind: 'other', where: null, count: null, words: word },
        { place: place.id, name: 'escalator', kind: 'other', where: null, count: null, words: 'a moving escalator' },
      ],
    });
    expect(reading.fixtures.map((f) => f.name)).toEqual([word]);
    expect(dropped.some((d) => d.includes('escalator'))).toBe(true);
  });
});

describe('with the cast_named step, what the reading casts reaches the prompt', () => {
  const reading: CastReading = {
    things: [
      {
        name: 'the red tractor',
        look: 'bright red, old',
        kind: 'vehicle',
        moments: [
          { id: 'm8', where: 'in' },
          { id: 'm9', where: 'in' },
        ],
        near: null,
        side: null,
        size: null,
        many: null,
      },
      {
        name: 'the rain',
        look: 'soft grey drizzle',
        kind: 'weather',
        moments: [{ id: 'm8', where: 'in' }],
        near: null,
        side: null,
        size: null,
        many: null,
      },
    ],
    bodies: [],
    fixtures: [],
  };
  const withReading = (s: Session): Session => ({
    ...s,
    draft: {
      ...s.draft!,
      breakdown: withCastThings(s.draft!.breakdown!, reading),
      readings: { ...(s.draft?.readings ?? {}), cast: reading },
    },
    build: { ...s.build!, items: withCastItems(s.build!.items, reading) },
  });

  test('off, nothing changes: the breakdown, the items and every prompt', () => {
    withSwitches({ ...ON, DREAMCHAT_ONE_BUILDER: 'story_marks' }, () => {
      const s = affd();
      const b = withCastThings(s.draft!.breakdown!, reading);
      expect(b).toBe(s.draft!.breakdown!);
      expect(withCastItems(s.build!.items, reading)).toBe(s.build!.items);
      const was = rebuild(affd()).pictures.map((p) => p.prompt);
      const now = rebuild(withReading(affd())).pictures.map((p) => p.prompt);
      expect(now).toEqual(was);
    });
  });

  test('on, the thing is cast, in view where the reading shows it, a sheet to be drawn; weather is no element', () => {
    withSwitches(ON, () => {
      const s = withReading(affd());
      const b = s.draft!.breakdown!;
      expect(b.things.map((t) => t.id)).toContain(castId(0));
      expect(b.things.some((t) => t.name === 'the rain')).toBe(false);
      const m = new Map(moments(b).map((x) => [x.id, x]));
      expect(m.get('m8')!.things).toContain(castId(0));
      expect(m.get('m1')!.things).not.toContain(castId(0));
      expect(s.build!.items.find((i) => i.id === castId(0))).toMatchObject({ kind: 'prop', status: 'waiting' });
    });
  });

  test('on, "In it" names the thing and the picture is said to have the weather across it', () => {
    const p = withSwitches(ON, () => rebuild(withReading(affd())).pictures.find((x) => x.id === 'm8')!.prompt);
    expect(p).toMatch(/\nthe red tractor \(thing\)/);
    expect(p).toContain('Across the whole picture: the rain (soft grey drizzle).');
    const m1 = withSwitches(ON, () => rebuild(withReading(affd())).pictures.find((x) => x.id === 'm1')!.prompt);
    expect(m1).not.toContain('the red tractor (thing)');
    expect(m1).not.toContain('Across the whole picture');
  });
});

describe('what the floor plan reads of the reading', () => {
  test('each thing cast has its id, in the reading, once; weather and matter have none', () => {
    const b = affd().draft!.breakdown!;
    const { reading } = parseCast(
      JSON.stringify({
        things: [
          // m6: "the sea is gone" names it.
          { name: 'the sea', look: '', kind: 'matter', moments: [{ id: 'm6' }] },
          { name: 'the red tractor', look: 'red', kind: 'vehicle', moments: [{ id: 'm8' }] },
          { name: 'the little boats', look: '', kind: 'thing', moments: [{ id: 'm4' }] },
        ],
      }),
      b,
    );
    expect(reading.things.map((t) => [t.name, t.id])).toEqual([
      ['the sea', undefined],
      ['the red tractor', 'c1'],
      ['the little boats', 'c2'],
    ]);
    withSwitches(ON, () =>
      expect(
        withCastThings(b, reading)
          .things.filter((t) => t.id.startsWith('c'))
          .map((t) => [t.id, t.name]),
      ).toEqual([
        ['c1', 'the red tractor'],
        ['c2', 'the little boats'],
      ]),
    );
  });

  test('water the camera already measures is said there, never again as a condition', () => {
    // fdd7 m4 with the camera rules: its words say how deep the water stands.
    const s = structuredClone(loadDream('dream-0926-050424-fdd7', false).session as Session);
    const reading: CastReading = {
      things: ['the rising water', 'the fog'].map((name) => ({
        name,
        look: '',
        kind: 'matter' as const,
        moments: [{ id: 'm4', where: 'in' as const }],
        near: null,
        side: null,
        size: null,
        many: null,
      })),
      bodies: [],
      fixtures: [],
    };
    s.draft = { ...s.draft!, readings: { ...(s.draft?.readings ?? {}), cast: reading } };
    const p = withSwitches(
      { ...ON, DREAMCHAT_CAMERA: 'on' },
      () => rebuild(s).pictures.find((x) => x.id === 'm4')!.prompt,
    );
    expect(p).toMatch(/water stands/i);
    expect(p).toContain('Across the whole picture: the fog.');
    expect(p).not.toContain('the rising water.');
  });
});

describe("with cast_looks, a cast thing's look says what it is, never what it does", () => {
  test('its name with its look; no doing; the look of one of its kind the dream has', () => {
    const boat = { name: 'the boat', look: 'a small paper boat folded from newspaper, with a triangular sail' };
    expect(castLook({ name: 'the little boats', look: 'little, folded from newspaper' }, [boat])).toBe(
      'little, folded from newspaper; the same kind as the boat, a small paper boat folded from newspaper, with a triangular sail',
    );
    expect(castLook({ name: 'the red tractor', look: 'red, driving slowly' }, [boat])).toBe('red');
    // Floating is how the books look: kept.
    expect(castLook({ name: 'the floating books', look: 'open like birds, floating off the shelves' }, [])).toBe(
      'open like birds, floating off the shelves',
    );
    expect(castLook({ name: 'the jellyfish', look: '' }, [boat])).toBeNull();
  });
});
