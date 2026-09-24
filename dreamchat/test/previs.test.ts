import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { dreamerShot, labelText, outsideShot, previsImage, turnedTo } from '../previs';

// The theater, as its floor plan has it: the dreamer and her friend on a blue two-seater in the
// front row, the big sofa (now a roller coaster) beside the friend, the audience in rows behind.
const theater: Blocking = {
  front: 'the screen',
  indoors: true,
  ceiling: 4.5,
  spots: [
    { id: 'p1', x: 4, y: 2.5, kind: 'person', pose: 'sitting' },
    { id: 'p2', x: 3.1, y: 2.5, kind: 'person', pose: 'sitting' },
    { id: 't1', x: 3.55, y: 2.55, kind: 'thing', size: [1.9, 0.95, 0.85] },
    { id: 't2', x: 1.6, y: 2.55, kind: 'thing', size: [2.1, 1.05, 1.15] },
    { id: 'p3', x: 5, y: 6.5, kind: 'person', pose: 'sitting', many: true, spread: [9.4, 6] },
  ],
};
const names: Record<string, string> = {
  p1: 'the dreamer',
  p2: 'the friend',
  t1: 'the blue sofa',
  t2: 'the roller coaster (what the big sofa turned into)',
  p3: 'the audience',
};
const name = (id: string) => names[id] ?? id;

describe('previs', () => {
  test("the dreamer's view is found from their seat and read off its render", () => {
    const shot = dreamerShot(theater, 'p1', 't2', name)!;
    // Their eyes stay on their seat, sitting height, turned left toward what they look at.
    expect(Math.abs(shot.eye.at.x - 4)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(shot.eye.at.y - 2.5)).toBeLessThanOrEqual(0.5);
    expect(shot.eye.height).toBe(1.2);
    expect(shot.eye.d.x).toBeLessThan(-0.9);
    // The seat under them is where they are; the friend beside them is someone in the picture.
    expect(shot.text).toContain(
      "The camera is the dreamer's eyes, on the blue sofa, at the height of their eyes sitting",
    );
    expect(shot.text).toContain('turned to their left, toward the roller coaster');
    expect(shot.text).toMatch(/Nearest, close, [^:]+: the friend, /);
    // Who sits on what, and what stands beside what, as the plan has it.
    expect(shot.text).toMatch(/the friend, sitting beside the dreamer on the same blue sofa/);
    // How big each is in the frame: the friend close enough to be cut at the waist.
    expect(shot.text).toMatch(
      /the friend, [^.]*seen from the waist up and filling the picture from [^.]+ to its bottom edge/,
    );
    expect(shot.text).toMatch(/the roller coaster \(what the big sofa turned into\), right beside the blue sofa/);
    expect(shot.text).toContain("the audience, many of them, sitting in rows of seats behind the dreamer's row");
    expect(shot.text).toMatch(/: the roller coaster \(what the big sofa turned into\)/);
    // The friend faces the screen, which is on the picture's right when she is seen from beside.
    expect(shot.text).toMatch(/the friend, [^.]*looking toward the right of the picture/);
    // The screen, the room's front, is on the right, whether at its edge or just beyond it.
    expect(shot.text).toMatch(/(At the right edge of the picture|Outside the picture, off to the right): the screen/);
    expect(shot.inPicture).toEqual(expect.arrayContaining(['t1', 'p2', 't2']));
    // The friend is kept to the side, not across the middle of what the picture is about.
    expect(shot.text).not.toMatch(/Nearest, close, in the middle of the picture: the friend/);
  });

  test('looking where they face, the front is ahead, at the back of the picture', () => {
    const shot = dreamerShot(theater, 'p1', undefined, name)!;
    expect(shot.text).toContain('looking straight ahead');
    expect(shot.text).toContain('it looks toward the screen');
    expect(shot.eye.d).toEqual({ x: 0, y: -1 });
  });

  test('the previs is a PNG of the shape asked for', () => {
    const shot = dreamerShot(theater, 'p1', 't2', name)!;
    const png = previsImage(theater, shot.eye, ['p1'], name, 320, 180);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(320);
    expect(view.getUint32(20)).toBe(180);
  });

  test('labels are the plain name: capitals, no article, no gloss', () => {
    expect(labelText('the roller coaster (what the big sofa turned into)')).toBe('ROLLER COASTER');
    expect(labelText('a café table')).toBe('CAFE TABLE');
  });

  test('how someone is turned to the camera', () => {
    const eye = { at: { x: 4, y: 2.5 }, d: { x: -1, y: 0 }, height: 1.2 };
    // Facing the screen, seen from their right: in profile, looking to the picture's right.
    expect(turnedTo({ id: 'p2', x: 3, y: 2.5 }, theater, eye)).toBe(
      'in profile, looking toward the right of the picture',
    );
    // Facing the camera.
    expect(turnedTo({ id: 'p2', x: 3, y: 2.5, faces: 'right' }, theater, eye)).toBe('facing the camera');
    // Their back to it.
    expect(turnedTo({ id: 'p2', x: 3, y: 2.5, faces: 'left' }, theater, eye)).toBe('their back to the camera');
  });

  test('seen from outside, the camera faces them from where they look, inside the room', () => {
    const shot = outsideShot(theater, ['p1', 'p2', 't1', 't2'], 'medium', name)!;
    // Between them and the screen, looking at them, never through the wall.
    expect(shot.eye.at.y).toBeGreaterThanOrEqual(0.3);
    expect(shot.eye.at.y).toBeLessThan(2.5);
    expect(shot.eye.d.y).toBeGreaterThan(0.9);
    expect(shot.eye.lens).toBeLessThanOrEqual(35);
    // Facing them, their right is the picture's left: the dreamer, then the friend.
    expect(shot.text).toMatch(/From left to right across the picture: the dreamer, [^;]+; then the friend, /);
    expect(shot.text).toContain('the blue sofa, ');
    expect(shot.text).toContain('with the dreamer and the friend sitting on it');
    expect(shot.text).toContain('Outside the picture, behind the camera: the screen.');
    // From behind them, facing the screen, the other way round.
    const back = outsideShot(theater, ['p1', 'p2', 't1', 't2'], 'medium', name, { way: { x: 0, y: -1 } })!;
    expect(back.eye.d.y).toBeLessThan(-0.9);
    expect(back.text).toStartWith('Seen from behind them');
    expect(back.text).toMatch(/From left to right across the picture: the friend, [^;]+; then the dreamer, /);
  });

  test('two people talking are taken from the side, where the room has space, with what the moment looks at behind them', () => {
    const lab: Blocking = {
      front: 'the wall with the autoclave',
      indoors: true,
      spots: [
        { id: 'p1', x: 4, y: 2, kind: 'person', pose: 'standing', faces: 'p2' },
        { id: 'p2', x: 5.2, y: 2, kind: 'person', pose: 'standing', faces: 'p1' },
        { id: 'x1', x: 4.6, y: 0.6, kind: 'thing', fixture: true, name: 'the autoclave', size: [0.9, 0.7, 1.5] },
      ],
    };
    const called = (id: string) => ({ p1: 'the young woman', p2: 'the dreamer' })[id] ?? id;
    // No aim: side on, from the open room behind them rather than against the autoclave's wall.
    const side = outsideShot(lab, ['p1', 'p2'], 'medium', called)!;
    expect(side.text).toStartWith('Seen from the side, as they face each other');
    expect(side.eye.d.y).toBeLessThan(-0.9);
    // Looking at the autoclave: it is behind them, and named by its own name.
    const aimed = outsideShot(lab, ['p1', 'p2'], 'medium', called, { at: { x: 4.6, y: 0.6 } })!;
    expect(aimed.text).toContain('the autoclave');
    expect(aimed.inPicture).toContain('x1');
  });
});
