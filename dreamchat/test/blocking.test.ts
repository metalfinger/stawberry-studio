import { describe, expect, test } from 'bun:test';
import { type Blocking, dreamerView, outsideOrder } from '../blocking';

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
const names: Record<string, string> = { p1: 'the dreamer', p2: 'the friend', t2: 'the roller coaster', p3: 'the audience' };
const name = (id: string) => names[id] ?? id;

describe('blocking', () => {
  test('seen from outside, facing them, their left is the picture\'s right', () => {
    // The camera stands at the screen, looking at their faces.
    expect(outsideOrder(theater, ['p1', 'p2', 't2'], false)).toEqual(['p1', 'p2', 't2']);
    // From behind them, facing the screen, the other way round.
    expect(outsideOrder(theater, ['p1', 'p2', 't2'], true)).toEqual(['t2', 'p2', 'p1']);
  });

  test("through the dreamer's eyes, turned to what she looks at: who is between, what is behind", () => {
    const { text: view, inPicture } = dreamerView(theater, 'p1', 't2', ['p2', 't2', 'p3'], name)!;
    expect(inPicture).toEqual(['p2', 't2']);
    // She turns to her own left: the friend sits there, close, with the roller coaster beyond her.
    expect(view).toContain('turned to their left, toward the roller coaster');
    expect(view).toContain('In the picture, nearest first: close, in the middle: the friend; a little way off, in the middle: the roller coaster.');
    // The audience is behind her now, and the room's left side beyond everything.
    expect(view).toContain('Out of the picture: the audience (off to their left)');
    expect(view).toContain('beyond everything, the left side of the room');
  });

  test('looking where she faces, she looks straight ahead at the front', () => {
    const view = dreamerView(theater, 'p1', undefined, ['p2', 't2', 'p3'], name)!.text;
    expect(view).toContain('looking straight ahead');
    expect(view).toContain('beyond everything, the screen');
  });
});
