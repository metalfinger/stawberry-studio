// Each figure and thing at the size the dream's words give it, in each moment they say (the one builder's `sizes`): the
// merged flow's Shrinking Hand (2 Oct), where the dreamer shrinks a piece of orange for the ants and Alina shrinks with
// it, then shrinks a building to her size and she has a party inside it. Planned at a grown person's height, the ants
// were a man on the kitchen counter and tiny Alina and her guests full size, hiding the shrunken building.
import { describe, expect, test } from 'bun:test';
import { settle } from '../blocking';
import { withSizes } from '../castplace';
import { framedAtSize } from '../continuity';
import { dreamerShot, inFrame, outsideShot } from '../previs';
import type { Breakdown } from '../producer';
import { parseSizes, type SizesReading } from '../sizes';

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
const ON = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on', DREAMCHAT_ONE_BUILDER: 'on' };

const b = {
  people: [
    { id: 'p1', name: 'you', is_dreamer: true, fields: {} },
    { id: 'p2', name: 'alina', fields: { identity: { value: "the dreamer's friend" } } },
    { id: 'p3', name: 'the ants', fields: { appearance: { value: 'small black ants' } } },
  ],
  things: [
    { id: 't1', name: 'the piece of orange' },
    { id: 't2', name: 'the shrunken building' },
  ],
  scenes: [
    {
      id: 's2',
      moments: [
        { id: 'm2', action: 'The dreamer shows Alina how to shrink things.', visual_point: 'the hand held out' },
        {
          id: 'm3',
          action: 'The dreamer points at a piece of orange, and Alina shrinks with it, now ant-sized beside the ants.',
          visual_point: 'the piece of orange shrunk small for the ants, and Alina shrunk to ant size beside it',
        },
      ],
    },
  ],
} as unknown as Breakdown;
const text = 'I accidentally shrank my friend Alina along with a piece of orange for the ants.';

describe('the reading', () => {
  test("keeps a size its words give, the dream's or a moment's; never one no words say, or out of reason", () => {
    const got = parseSizes(
      JSON.stringify({
        bodies: [
          { id: 'p3', height_m: 0.005, shape: 'other', words: 'small black ants' },
          { id: 'p1', height_m: 1.7, shape: 'human', words: 'the dreamer' },
          { id: 'p2', height_m: 1.6, shape: 'human', words: 'a tall woman' },
        ],
        moments: {
          m3: [
            { id: 'p2', height_m: 0.005, words: 'now ant-sized beside the ants' },
            { id: 't1', height_m: 500, words: 'a piece of orange' },
          ],
          m9: [{ id: 'p2', height_m: 0.005, words: 'ant-sized' }],
        },
      }),
      b,
      text,
    );
    expect(got.reading.bodies).toEqual([{ id: 'p3', height_m: 0.005, shape: 'other', words: 'small black ants' }]);
    expect(got.reading.moments).toEqual({
      m3: [{ id: 'p2', height_m: 0.005, words: 'now ant-sized beside the ants' }],
    });
    expect(got.dropped).toHaveLength(4);
    expect(parseSizes('not json', b, text).reading).toEqual({ bodies: [], moments: {} });
  });
});

const reading: SizesReading = {
  bodies: [{ id: 'p3', height_m: 0.005, shape: 'other', words: 'small black ants' }],
  moments: {
    m3: [{ id: 'p2', height_m: 0.005, words: 'now ant-sized beside the ants' }],
    m5: [{ id: 't2', height_m: 0.005, words: "the building shrunk to Alina's size" }],
  },
};
// Alina's kitchen, as its plan has it: the counter, the dreamer before it, Alina, the ants and the orange on it.
const kitchen = {
  front: 'the kitchen counter',
  spots: [
    {
      id: 'x1',
      x: 2,
      y: 0.3,
      kind: 'thing',
      size: [3.2, 0.6, 0.9],
      shape: 'ground',
      fixture: true,
      name: 'the kitchen counter',
    },
    { id: 'p1', x: 2, y: 1.1, kind: 'person', faces: 'front', pose: 'standing' },
    { id: 'p2', x: 1.68, y: 0.35, kind: 'person', faces: 'p3', pose: 'standing' },
    { id: 'p3', x: 1.62, y: 0.35, kind: 'person', faces: 't1', pose: 'standing' },
    { id: 't1', x: 1.6, y: 0.3, kind: 'thing', size: [0.06, 0.04, 0.03], shape: 'block' },
    { id: 't2', x: 2.6, y: 0.3, kind: 'thing', size: [0.4, 0.3, 0.4], shape: 'block' },
  ],
  room: [4, 4],
  indoors: true,
  ceiling: 2.5,
} as never;
type S = { id: string; x: number; y: number; height?: number; body?: string; size?: number[] };
const spot = (plan: unknown, id: string) => (plan as { spots: S[] }).spots.find((x) => x.id === id)!;

describe('the plan at the sizes of its moment', () => {
  test('a creature at its ordinary size in every moment; someone the dream shrinks only where it says; the rest as they are', () => {
    const m2 = withSizes(kitchen, reading, 'm2');
    expect(spot(m2, 'p3')).toMatchObject({ height: 0.005, body: 'other' });
    expect(spot(m2, 'p2').height).toBeUndefined();
    const m3 = withSizes(kitchen, reading, 'm3');
    expect(spot(m3, 'p2')).toMatchObject({ height: 0.005, body: 'human' });
    expect(spot(m3, 'p1').height).toBeUndefined();
    // A thing is scaled whole to its height.
    const m5 = withSizes(kitchen, reading, 'm5');
    expect(spot(m5, 't2').size).toEqual([0.005, 0.00375, 0.005].map((x, i) => (i === 1 ? spot(m5, 't2').size![1] : x)));
    expect(spot(m5, 't2').size![1]).toBeCloseTo(0.00375, 6);
    expect(withSizes(kitchen, { bodies: [], moments: {} }, 'm3')).toBe(kitchen);
  });

  test('settled at their own size: two ants-sized figures a few millimetres apart are left where they stand', () => {
    const m3 = withSizes(kitchen, reading, 'm3');
    const s = settle(m3 as never);
    expect(spot(s, 'p2')).toMatchObject({ x: 1.68, y: 0.35 });
    expect(spot(s, 'p3')).toMatchObject({ x: 1.62, y: 0.35 });
    // Grown, the two would stand side by side 60 cm apart, as before.
    const two = { ...(kitchen as object), spots: [spot(kitchen, 'p2'), { ...spot(kitchen, 'p3'), x: 1.7 }] };
    const g = settle(two as never);
    expect(Math.hypot(spot(g, 'p2').x - spot(g, 'p3').x, spot(g, 'p2').y - spot(g, 'p3').y)).toBeCloseTo(0.6, 6);
  });
});

describe('the camera placed for them', () => {
  const m3 = settle(withSizes(kitchen, reading, 'm3') as never);
  const moment = b.scenes[0].moments[1];
  const name = (s: { id: string; name?: string }) =>
    ({ p1: 'the dreamer', p2: 'alina', p3: 'the ants', t1: 'the piece of orange' })[s.id] ?? s.name ?? s.id;

  test("framed for the small ones where the moment's one thing to show names only them", () => {
    expect(framedAtSize(m3, ['p1', 'p2', 'p3', 't1'], moment, name)).toEqual(['p2', 'p3', 't1']);
    // A small thing alone, with no one at a size of their own, is an insert as before: the frame is everyone's.
    const key = {
      ...(kitchen as object),
      spots: (kitchen as { spots: S[] }).spots.filter((x) => !['p2', 'p3'].includes(x.id)),
    };
    const orange = { ...moment, visual_point: 'the piece of orange on the counter' };
    expect(framedAtSize(key as never, ['p1', 't1'], orange, name)).toEqual(['p1', 't1']);
    // Naming the grown dreamer too, the frame is still the small ones', the dreamer at its edge (Shrunk m4).
    const both = { ...moment, visual_point: 'the dreamer frowning down at tiny alina' };
    expect(framedAtSize(m3, ['p1', 'p2', 'p3'], both, name)).toEqual(['p2', 'p3']);
    // A point naming no one small, the frame is everyone's, as before.
    const grown = { ...moment, visual_point: 'the dreamer pointing at the counter' };
    expect(framedAtSize(m3, ['p1', 'p2', 'p3'], grown, name)).toEqual(['p1', 'p2', 'p3']);
  });

  test('close on the ant-sized Alina: the camera a few centimetres off, at her eyes, and her whole height in it', () => {
    const v = withEnv(ON, () => outsideShot(m3, ['p2', 'p3', 't1'], 'close', (id) => name({ id })))!;
    const alina = spot(m3, 'p2');
    expect(Math.hypot(v.eye.at.x - alina.x, v.eye.at.y - alina.y)).toBeLessThan(0.3);
    expect(v.eye.height).toBeGreaterThan(0.9);
    expect(v.eye.height).toBeLessThan(0.95);
    const f = inFrame(m3, v.eye, 'p2')!;
    expect(f.height).toBeGreaterThan(0.9);
  });

  test("with no one at a size of their own, every view's words as before, word for word", () => {
    const grown = { ...(kitchen as object), spots: (kitchen as { spots: S[] }).spots.filter((x) => x.id !== 'p3') };
    const say = (step: string) =>
      withEnv({ ...ON, DREAMCHAT_ONE_BUILDER: step }, () => [
        dreamerShot(grown as never, 'p1', 'p2', (id) => name({ id }))!.text,
        outsideShot(grown as never, ['p1', 'p2'], 'medium', (id) => name({ id }))!.text,
      ]);
    expect(say('on')).toEqual(say('eyes_aimed'));
    for (const t of say('on')) expect(t).not.toContain('  ');
  });

  test("through the dreamer's eyes, a building shrunk to an ant's size is looked at from right up close (Shrunk m6)", () => {
    const m5 = settle(withSizes(kitchen, reading, 'm5') as never);
    const v = withEnv(ON, () => dreamerShot(m5, 'p1', 't2', (id) => name({ id }))!);
    const building = spot(m5, 't2');
    expect(Math.hypot(v.eye.at.x - building.x, v.eye.at.y - building.y)).toBeLessThan(0.05);
    expect(v.eye.lean).toBe('close');
    expect(v.text).toContain('bent right down close to it');
    // Without the step, from where they stand.
    const off = withEnv({ ...ON, DREAMCHAT_ONE_BUILDER: 'eyes_aimed' }, () =>
      dreamerShot(m5, 'p1', 't2', (id) => name({ id }))!,
    );
    expect(off.eye.at).toEqual({ x: 2, y: 1.1 });
  });
});
