import { describe, expect, test } from 'bun:test';
import { type Blocking, outsideOrder } from '../blocking';

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
