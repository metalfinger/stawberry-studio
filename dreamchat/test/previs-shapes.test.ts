// The mock-up's shapes for the local machine (previs.ts, `shapes`): benches under people sitting face to face with the
// floor clear between them for their legs, a chair under someone sitting at a table or desk on nothing, and a tractor
// with wheels and a seat under each rider. Picture only: off, every mock-up is byte for byte what it was.
import { describe, expect, test } from 'bun:test';
import { type Blocking, facing, rightOf, type Spot } from '../blocking';
import { benches, chairUnder, previsImage, previsKeyed, seatOnTractor, tractorParts } from '../previs';

const sha = (png: Uint8Array) => new Bun.CryptoHasher('sha256').update(png).digest('hex').slice(0, 16);

type Box = { x: number; y: number; z: number; w: number; d: number; h: number; f: { x: number; y: number } };
type Face = { p: { x: number; y: number; z: number }[] };

/** Whether a point on the plan is on a block's footprint. */
const under = (b: Box, p: { x: number; y: number }) => {
  const r = rightOf(b.f);
  const v = { x: p.x - b.x, y: p.y - b.y };
  return Math.abs(v.x * r.x + v.y * r.y) <= b.w / 2 + 1e-6 && Math.abs(v.x * b.f.x + v.y * b.f.y) <= b.d / 2 + 1e-6;
};
/** A block's corners on the plan. */
const corners = (b: Box) => {
  const r = rightOf(b.f);
  return [-1, 1].flatMap((a) =>
    [-1, 1].map((c) => ({
      x: b.x + r.x * (b.w / 2) * a + b.f.x * (b.d / 2) * c,
      y: b.y + r.y * (b.w / 2) * a + b.f.y * (b.d / 2) * c,
    })),
  );
};
/** A drawn part's extent on the plan and up: a block's corners, or a round solid's faces. */
const extent = (part: Box | Face[]) => {
  const pts = Array.isArray(part) ? part.flatMap((f) => f.p) : corners(part).map((c) => ({ ...c, z: part.z }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

// The snow train's compartment (b0cb m2): the dreamer and the grandfather sit face to face on "the seats facing each
// other", one block a seat high, which hid both of them from the waist down.
const compartment: Blocking = {
  front: 'the compartment door',
  indoors: true,
  room: [3.2, 4],
  spots: [
    {
      id: 'x1',
      x: 1.6,
      y: 2,
      kind: 'thing',
      shape: 'seat',
      size: [2, 2, 0.5],
      name: 'the green seats facing each other',
    },
    { id: 'p1', x: 1.6, y: 1.4, kind: 'person', pose: 'sitting', faces: 'back' },
    { id: 'p2', x: 1.6, y: 2.6, kind: 'person', pose: 'sitting', faces: 'front' },
  ],
};

// The lighthouse's top room (affd m4): the father sits at the table folding boats, on nothing.
const topRoom: Blocking = {
  front: 'the wall with the door',
  indoors: true,
  room: [6, 6],
  spots: [
    { id: 'x1', x: 3, y: 3, kind: 'thing', size: [1.2, 0.8, 0.75], name: 'the table' },
    { id: 'p3', x: 3, y: 3.75, kind: 'person', pose: 'sitting', faces: 'x1' },
  ],
};

// The field (affd m9): the driver and the dreamer side by side on the red tractor, a block that hid them to the
// shoulders.
const field: Blocking = {
  front: 'the edge of the field',
  spots: [
    { id: 'c1', x: 50, y: 5, kind: 'thing', shape: 'vehicle', size: [1.8, 3.5, 2.2] },
    { id: 'p1', x: 50.5, y: 5, kind: 'person', pose: 'sitting' },
    { id: 'p4', x: 49.5, y: 5, kind: 'person', pose: 'sitting' },
  ],
};

// One behind the other on a smaller tractor (aeea m11).
const tandem: Blocking = {
  front: 'the edge of the field',
  spots: [
    { id: 't3', x: 40, y: 5, kind: 'thing', shape: 'vehicle', size: [2, 2, 1.5] },
    { id: 'p4', x: 40, y: 4.5, kind: 'person', pose: 'sitting', rides: 'front' },
    { id: 'p1', x: 40, y: 5.5, kind: 'person', pose: 'sitting', rides: 'back' },
  ],
};

// The stair (affd m1): the dog runs up ahead of the dreamer. Nothing on it the shapes draw otherwise.
const stair: Blocking = {
  front: 'the bottom of the stairs',
  indoors: true,
  room: [3, 6],
  spots: [
    { id: 'p2', x: 1.5, y: 2.5, kind: 'person', pose: 'standing', faces: 'back' },
    { id: 'p1', x: 1.5, y: 1.5, kind: 'person', pose: 'standing', faces: 'back' },
  ],
};

const name = (id: string) =>
  (
    ({
      p1: 'the dreamer',
      p2: 'the dog',
      p3: 'the father',
      p4: 'the driver',
      x1: 'the table',
      c1: 'the red tractor',
      t3: 'the red tractor',
    }) as Record<string, string>
  )[id] ?? id;
const cams = {
  compartment: { at: { x: 0.15, y: 2 }, d: { x: 1, y: 0 }, height: 1 },
  topRoom: { at: { x: 3, y: 5.8 }, d: { x: 0, y: -1 }, height: 1 },
  field: { at: { x: 50, y: 0 }, d: { x: 0, y: 1 }, height: 1.6 },
  tandem: { at: { x: 45, y: 5 }, d: { x: -1, y: 0 }, height: 1.6 },
  stair: { at: { x: 1.5, y: 4.5 }, d: { x: 0, y: -1 }, height: 1.6 },
};
const plans = { compartment, topRoom, field, tandem, stair };

describe('the mock-up with shapes off', () => {
  // The frames as they were drawn before the shapes, at a small size: fal's clay and the keyed frame never change.
  const before: Record<string, [string, string]> = {
    compartment: ['dc0e3b6dfe43da93', 'a29a93ab39a472d7'],
    topRoom: ['8109ddff44149d6a', '7da730a05764023d'],
    field: ['bd037944626588bc', '1689d8921a684f23'],
    tandem: ['cabbed6c65af4958', 'ddf9f8d4962745b6'],
    stair: ['b024a010bd14e607', '66baa708a2c613c0'],
  };
  for (const [k, plan] of Object.entries(plans))
    test(`${k}: byte for byte as before`, () => {
      const eye = cams[k as keyof typeof cams];
      const clay = sha(previsImage(plan, eye, [], name, 192, 108));
      const keyed = sha(previsKeyed(plan, eye, [], name, 192, 108).png);
      expect([clay, keyed]).toEqual(before[k]);
    });

  test('with the shapes on, a frame with none of them is as it was', () => {
    const eye = cams.stair;
    expect(sha(previsImage(stair, eye, [], name, 192, 108, { shapes: true }))).toBe(before.stair[0]);
    expect(sha(previsKeyed(stair, eye, [], name, 192, 108, { shapes: true }).png)).toBe(before.stair[1]);
  });
});

describe('benches under people sitting face to face', () => {
  const seat = compartment.spots[0];

  test('a bench under each, the way they face, a back behind them, the floor between them clear', () => {
    const parts = benches(seat, compartment) as Box[];
    expect(parts).toBeDefined();
    for (const id of ['p1', 'p2']) {
      const p = compartment.spots.find((s) => s.id === id) as Spot;
      const f = facing(p, compartment);
      // Their waist, a little behind where they are, is on a bench top a seat high.
      const waist = { x: p.x - f.x * 0.1, y: p.y - f.y * 0.1 };
      expect(parts.some((b) => under(b, waist) && Math.abs(b.z + b.h - 0.45) < 1e-6)).toBe(true);
      // Their back against a back that rises behind them.
      const behind = { x: p.x - f.x * 0.4, y: p.y - f.y * 0.4 };
      expect(parts.some((b) => under(b, behind) && b.z + b.h > 0.7)).toBe(true);
    }
    // Between them, where their legs go, nothing.
    for (const y of [1.7, 2, 2.3]) expect(parts.some((b) => under(b, { x: 1.6, y }))).toBe(false);
    // Each bench as long as the seat runs across them.
    expect(Math.max(...parts.map((b) => b.w))).toBeCloseTo(2, 5);
  });

  test('a sofa they all face one way, and a seat nobody is on, drawn as before', () => {
    const sofa: Blocking = {
      ...compartment,
      spots: [
        { id: 'x1', x: 1.6, y: 2, kind: 'thing', shape: 'seat', size: [2, 0.9, 0.85] },
        { id: 'p1', x: 1.2, y: 2, kind: 'person', pose: 'sitting' },
        { id: 'p2', x: 2, y: 2, kind: 'person', pose: 'sitting' },
      ],
    };
    expect(benches(sofa.spots[0], sofa)).toBeUndefined();
    const empty = { ...compartment, spots: [compartment.spots[0]] };
    expect(benches(seat, empty)).toBeUndefined();
  });

  test('with shapes, the compartment is drawn otherwise; without, as it was', () => {
    const eye = cams.compartment;
    const off = previsKeyed(compartment, eye, [], name, 192, 108).png;
    const on = previsKeyed(compartment, eye, [], name, 192, 108, { shapes: true }).png;
    expect(sha(on)).not.toBe(sha(off));
  });
});

describe('a chair under someone sitting at a table on nothing', () => {
  const father = topRoom.spots[1];

  test('indoors at a table: a seat a seat high under them, its back low behind them', () => {
    const parts = chairUnder(father, topRoom) as Box[];
    expect(parts).toBeDefined();
    const f = facing(father, topRoom);
    expect(
      parts.some((b) => under(b, { x: father.x - f.x * 0.1, y: father.y - f.y * 0.1 }) && b.z + b.h === 0.45),
    ).toBe(true);
    expect(parts.some((b) => under(b, { x: father.x - f.x * 0.3, y: father.y - f.y * 0.3 }) && b.z + b.h > 0.7)).toBe(
      true,
    );
    // Not under the table.
    expect(parts.some((b) => corners(b).some((c) => Math.abs(c.y - 3) < 0.39 && Math.abs(c.x - 3) < 0.6))).toBe(false);
  });

  test('outdoors, away from any table or desk, or on something already: none', () => {
    expect(chairUnder(father, { ...topRoom, indoors: false })).toBeUndefined();
    const bare = { ...topRoom, spots: [{ ...father, faces: 'front' }] };
    expect(chairUnder(bare.spots[0], bare)).toBeUndefined();
    const onBench: Blocking = {
      ...topRoom,
      spots: [...topRoom.spots, { id: 'x2', x: 3, y: 3.75, kind: 'thing', shape: 'seat', size: [1.5, 0.5, 0.45] }],
    };
    expect(chairUnder(father, onBench)).toBeUndefined();
    const standing = { ...father, pose: 'standing' as const };
    expect(chairUnder(standing, { ...topRoom, spots: [topRoom.spots[0], standing] })).toBeUndefined();
  });

  test('with shapes, the room is drawn otherwise; without, as it was', () => {
    const eye = cams.topRoom;
    const off = previsKeyed(topRoom, eye, [], name, 192, 108).png;
    const on = previsKeyed(topRoom, eye, [], name, 192, 108, { shapes: true }).png;
    expect(sha(on)).not.toBe(sha(off));
  });
});

describe('a tractor with its seats', () => {
  const riderBox = (p: Spot, plan: Blocking) => {
    // A sitter as the mock-up draws them: from their back to their feet, a body's width either side.
    const f = facing(p, plan);
    const r = rightOf(f);
    const pts = [-0.35, 0.6].flatMap((a) =>
      [-0.32, 0.32].map((s) => ({ x: p.x + f.x * a + r.x * s, y: p.y + f.y * a + r.y * s })),
    );
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const overlaps = (a: ReturnType<typeof extent>, b: ReturnType<typeof extent>) =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;

  for (const [k, plan] of [
    ['side by side', field],
    ['one behind the other', tandem],
  ] as const)
    test(`${k}: four wheels clear of the riders, the tractor under each and a seat on it, a back behind them`, () => {
      const t = plan.spots[0];
      const riders = plan.spots.filter((s) => s.kind === 'person');
      const { body, seats } = tractorParts(t, plan, facing(t, plan));
      const wheels = body.filter((p) => Array.isArray(p)) as Face[][];
      expect(wheels).toHaveLength(4);
      for (const w of wheels) for (const p of riders) expect(overlaps(extent(w), riderBox(p, plan))).toBe(false);
      const blocks = body.filter((p) => !Array.isArray(p)) as Box[];
      for (const p of riders) {
        const f = facing(p, plan);
        const seat = { x: p.x - f.x * 0.1, y: p.y - f.y * 0.1 };
        // A short seat on the tractor, never a seat-high block on the ground: they sat on stools before it.
        expect(
          seats.some((b) => under(b, { x: p.x, y: p.y }) && Math.abs(b.z + b.h - 0.45) < 1e-6 && b.z >= 0.25),
        ).toBe(true);
        expect(seats.some((b) => under(b, seat) && b.z < 0.25)).toBe(false);
        // Under it, the tractor itself, from the ground to the seat.
        expect(blocks.some((b) => under(b, seat) && b.z < 1e-6 && Math.abs(b.z + b.h - 0.3) < 1e-6)).toBe(true);
        expect(seats.some((b) => under(b, { x: p.x - f.x * 0.32, y: p.y - f.y * 0.32 }) && b.z + b.h > 0.7)).toBe(true);
      }
      // Nothing of the tractor's own body is where a rider sits, from the seat to the top of their head (a cab's roof
      // is over it, the tractor under the seat).
      for (const b of blocks.filter((b) => b.z + b.h > 0.3 + 1e-6 && b.z < 1.4))
        for (const p of riders) expect(overlaps(extent(b), riderBox(p, plan))).toBe(false);
    });

  test('the big wheels at the back, the small at the front, and the bonnet ahead of the riders', () => {
    const t = field.spots[0];
    const f = facing(t, field);
    const { body } = tractorParts(t, field, f);
    const along = (x: number, y: number) => (x - t.x) * f.x + (y - t.y) * f.y;
    const wheels = (body.filter((p) => Array.isArray(p)) as Face[][]).map((w) => {
      const e = extent(w);
      const zs = w.flatMap((q) => q.p.map((p) => p.z));
      return { a: along((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2), r: (Math.max(...zs) - Math.min(...zs)) / 2 };
    });
    const back = wheels.filter((w) => w.a < 0);
    const front = wheels.filter((w) => w.a > 0);
    expect(back).toHaveLength(2);
    expect(front).toHaveLength(2);
    expect(Math.min(...back.map((w) => w.r))).toBeGreaterThan(Math.max(...front.map((w) => w.r)));
    const blocks = body.filter((p) => !Array.isArray(p)) as Box[];
    expect(blocks.some((b) => along(b.x, b.y) > 0.6 && b.z + b.h > 0.8)).toBe(true);
  });

  test("riders on a seat of the plan's own: the tractor under it, the seat lifted onto it, no second seat", () => {
    // "The seat" of the tractor in aeea m11, under both riders: drawn twice, one seat stood inside the other; drawn
    // once on the ground, it was a stool before the tractor again.
    const seated: Blocking = {
      ...field,
      spots: [...field.spots, { id: 'x1', x: 50, y: 5, kind: 'thing', shape: 'seat', size: [1.4, 0.5, 0.5] }],
    };
    const t = seated.spots[0];
    const { body, seats } = tractorParts(t, seated, facing(t, seated));
    expect(seats).toHaveLength(0);
    const blocks = body.filter((p) => !Array.isArray(p)) as Box[];
    for (const p of seated.spots.filter((s) => s.kind === 'person')) {
      const f = facing(p, seated);
      const seat = { x: p.x - f.x * 0.1, y: p.y - f.y * 0.1 };
      expect(blocks.some((b) => under(b, seat) && b.z < 1e-6 && Math.abs(b.z + b.h - 0.3) < 1e-6)).toBe(true);
    }
    const lifted = seatOnTractor(seated.spots[3], seated, name) as Box[];
    expect(lifted).toBeDefined();
    expect(Math.min(...lifted.map((b) => b.z))).toBeCloseTo(0.3, 6);
    expect(Math.max(...lifted.map((b) => b.z + b.h))).toBeCloseTo(0.5, 6);
    // A seat on no tractor, as before.
    expect(seatOnTractor(compartment.spots[0], compartment, name)).toBeUndefined();
  });

  test('nothing of it under the cab stands higher than the block the camera and the words were reckoned on', () => {
    // Its bonnet a quarter of a metre higher, the camera low in front of the riders saw only their hair (affd m8).
    for (const plan of [field, tandem]) {
      const t = plan.spots[0];
      const top = Math.min((t.size as number[])[2], 1.6) * 0.6;
      const { body } = tractorParts(t, plan, facing(t, plan));
      for (const part of body) {
        const zs = Array.isArray(part) ? part.flatMap((q) => q.p.map((p) => p.z)) : [part.z, part.z + part.h];
        // The cab's posts and roof stand over the riders, thin, and hide nothing of them.
        if (!Array.isArray(part) && (part.z >= 1.9 || (part.w <= 0.06 && part.d <= 0.06))) continue;
        expect(Math.max(...zs)).toBeLessThanOrEqual(top + 0.07 + 1e-6);
      }
    }
  });

  test('with shapes, the field is drawn otherwise; without, as it was', () => {
    const eye = cams.field;
    const off = previsImage(field, eye, [], name, 192, 108);
    const on = previsImage(field, eye, [], name, 192, 108, { shapes: true });
    expect(sha(on)).not.toBe(sha(off));
  });
});
