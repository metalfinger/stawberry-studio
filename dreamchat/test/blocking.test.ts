import { describe, expect, test } from 'bun:test';
import { type Blocking, outsideOrder, settle, sizeOf, wall } from '../blocking';

// The theater: the dreamer in the front row facing the screen, her friend on her left, the big
// sofa beyond the friend, the rows of people behind them.
const theater: Blocking = {
  front: 'the screen',
  spots: [
    { id: 'p1', x: 4, y: 1 },
    { id: 'p2', x: 3, y: 1 },
    { id: 't2', x: 1.5, y: 1 },
    { id: 'p3', x: 5, y: 5, many: true },
  ],
};

describe('blocking', () => {
  test("seen from outside, facing them, their left is the picture's right", () => {
    // The camera stands at the screen, looking at their faces.
    expect(outsideOrder(theater, ['p1', 'p2', 't2'], false)).toEqual(['p1', 'p2', 't2']);
    // From behind them, facing the screen, the other way round.
    expect(outsideOrder(theater, ['p1', 'p2', 't2'], true)).toEqual(['t2', 'p2', 'p1']);
  });
});

describe('a plan where a person can be', () => {
  // Outside the house: the aunt's car drawn up by it, the dreamer dropped off "at the house".
  const street: Blocking = {
    front: 'the road',
    room: [20, 15],
    spots: [
      { id: 'p1', x: 10, y: 2.5, kind: 'person', pose: 'standing' },
      { id: 'p4', x: 10, y: 3.5, kind: 'person', pose: 'sitting' },
      { id: 't2', x: 10, y: 3.5, kind: 'thing', size: [2.5, 1.5, 1.4], shape: 'vehicle' },
      { id: 'x4', x: 10, y: 2, kind: 'thing', size: [6, 2, 4], fixture: true, name: 'the house' },
      { id: 't3', x: 0, y: 0, kind: 'thing', size: [0.5, 0.5, 1], heldBy: 'p1' },
    ],
  };

  test('nobody stands inside something solid: they stand just outside it, clear of the car, as near as can be', () => {
    const p1 = settle(street).spots.find((s) => s.id === 'p1')!;
    const inHouse = Math.abs(p1.x - 10) <= 3 && Math.abs(p1.y - 2) <= 1;
    const inCar = Math.abs(p1.x - 10) <= 1.25 && Math.abs(p1.y - 3.5) <= 0.75;
    expect(inHouse || inCar).toBe(false);
    expect(Math.hypot(p1.x - 10, p1.y - 2.5)).toBeLessThan(2.5);
    // Who rides in the car stays in it; what someone holds is where they are.
    expect(settle(street).spots.find((s) => s.id === 'p4')).toMatchObject({ x: 10, y: 3.5 });
    expect(settle(street).spots.find((s) => s.id === 't3')).toMatchObject({ x: p1.x, y: p1.y });
  });

  test('someone sitting on a thing the plan gives no shape sits on it, not beside it', () => {
    const theater: Blocking = {
      front: 'the screen',
      indoors: true,
      spots: [
        { id: 'p1', x: 4, y: 2.5, kind: 'person', pose: 'sitting' },
        { id: 't1', x: 3.55, y: 2.55, kind: 'thing', size: [1.9, 0.95, 0.85] },
      ],
    };
    expect(settle(theater).spots.find((s) => s.id === 'p1')).toMatchObject({ x: 4, y: 2.5 });
  });

  test('two riding in one car sit side by side in it, facing the way it goes', () => {
    const bridge: Blocking = {
      front: 'the house side',
      spots: [
        { id: 'p1', x: 10, y: 20, kind: 'person', pose: 'sitting', faces: 'back' },
        { id: 'p4', x: 10, y: 20, kind: 'person', pose: 'sitting', faces: 'front' },
        { id: 't2', x: 10, y: 20, kind: 'thing', size: [1.8, 3.5, 1.5], shape: 'vehicle' },
      ],
    };
    const [p1, p4] = ['p1', 'p4'].map((id) => settle(bridge).spots.find((s) => s.id === id)!);
    expect(p1.faces).toBe('front');
    expect(p4.faces).toBe('front');
    expect(Math.abs(p1.x - p4.x)).toBeCloseTo(0.6, 5);
    expect(p1.y).toBeCloseTo(p4.y, 5);
    // The plan it was given is as it was.
    expect(bridge.spots[0]).toMatchObject({ x: 10, faces: 'back' });
  });

  test('a thing with no size is ordinary for what it is, and outdoors is not a room', () => {
    expect(sizeOf({ id: 'x1', x: 0, y: 0, shape: 'ground' })[2]).toBeLessThan(0.1);
    expect(sizeOf({ id: 't2', x: 0, y: 0, shape: 'vehicle' })[0]).toBeGreaterThan(3);
    expect(wall({ x: -1, y: 0 }, 'the road', false)).toBe('the left side of the place');
    expect(wall({ x: 0, y: 1 }, 'the road', false)).toBe('the far side of the place, away from the road');
    expect(wall({ x: 0, y: 1 }, 'the screen')).toBe('the back of the room');
  });
});
