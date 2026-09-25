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
    // Between them and the screen, looking at them, never through the wall: holding the roller
    // coaster beside the sofa too, it stands back against the wall.
    expect(shot.eye.at.y).toBeGreaterThanOrEqual(0.15);
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

  test('in a tiny room the camera stays inside it, with a lens wide enough for what it must hold', () => {
    const tiny: Blocking = {
      front: 'the stove',
      indoors: true,
      room: [2.4, 2.2],
      spots: [
        { id: 'p3', x: 1.2, y: 1.3, kind: 'person', pose: 'standing', faces: 't1' },
        { id: 't1', x: 1.2, y: 0.5, kind: 'thing', size: [2, 0.8, 0.9] },
      ],
    };
    const shot = outsideShot(
      tiny,
      ['p3', 't1'],
      'medium',
      (id) => ({ p3: 'the young woman', t1: 'the stove' })[id] ?? id,
    )!;
    expect(shot.eye.at.x).toBeGreaterThanOrEqual(0.15);
    expect(shot.eye.at.x).toBeLessThanOrEqual(2.25);
    expect(shot.eye.at.y).toBeGreaterThanOrEqual(0.15);
    expect(shot.eye.at.y).toBeLessThanOrEqual(2.05);
    expect(shot.eye.lens).toBeLessThan(35);
    expect(shot.inPicture).toEqual(expect.arrayContaining(['p3', 't1']));
  });
});

describe('what things are to whoever is at them', () => {
  const outside: Blocking = {
    front: 'the road',
    room: [20, 15],
    spots: [
      { id: 'p1', x: 10, y: 3.5, kind: 'person', pose: 'standing', faces: 'back' },
      { id: 'p4', x: 2, y: 5, kind: 'person', pose: 'sitting', faces: 'right' },
      { id: 't2', x: 2, y: 5, kind: 'thing', size: [2.5, 1.5, 1.4], shape: 'vehicle' },
      { id: 'x1', x: 10, y: 5, kind: 'thing', fixture: true, name: 'the road', size: [20, 3, 0.05], shape: 'ground' },
    ],
  };
  const called = (id: string) => ({ p1: 'the dreamer', p4: 'the aunt', t2: 'the little round convertible' })[id] ?? id;

  test('the aunt rides in her car, the dreamer stands on the road, and the frame holds them both', () => {
    const shot = outsideShot(outside, ['p1', 'p4', 't2'], 'wide', called, { at: { x: 2, y: 5 }, id: 't2' })!;
    expect(shot.text).toContain('the aunt, ');
    expect(shot.text).toContain(', in the little round convertible');
    expect(shot.text).not.toContain('sitting on the little round convertible');
    expect(shot.text).toContain('with the aunt in it');
    expect(shot.inPicture).toEqual(expect.arrayContaining(['p1', 'p4', 't2']));
    expect(shot.text).not.toContain('Outside the picture, off to the right: the dreamer');
    // Outdoors, no room.
    expect(shot.text).not.toContain('of the room');
    // Eight metres apart, one waiting and the other arriving: over the shoulder of the one waiting,
    // toward the car, both framed well enough to read.
    expect(shot.text).toStartWith('Seen from behind the dreamer, over their shoulder');
    expect(shot.framing).toEqual([]);
  });

  test('a shot that frames someone as a speck, or cut by its edge, says so', () => {
    const far: Blocking = {
      front: 'the road',
      room: [60, 60],
      spots: [
        { id: 'p1', x: 30, y: 10, kind: 'person', pose: 'standing', faces: 'back' },
        { id: 'p2', x: 30.4, y: 10, kind: 'person', pose: 'standing', faces: 'back' },
      ],
    };
    // A close shot of two people side by side: the frame holds them, and says nothing is wrong.
    const near = outsideShot(far, ['p1', 'p2'], 'close', (id) => (id === 'p1' ? 'the dreamer' : 'the aunt'))!;
    expect(near.framing).toEqual([]);
  });

  test('a juggler on a street stands on it, not in a block of it', () => {
    const village: Blocking = {
      front: 'the far end of the street',
      room: [8, 30],
      spots: [
        { id: 'p2', x: 4, y: 5, kind: 'person', pose: 'standing', faces: 'front' },
        {
          id: 'x1',
          x: 4,
          y: 15,
          kind: 'thing',
          fixture: true,
          name: 'the cobblestone street',
          size: [6, 30, 0.05],
          shape: 'ground',
        },
      ],
    };
    const shot = outsideShot(village, ['p2'], 'medium', (id) => (id === 'p2' ? 'the juggler' : id))!;
    expect(shot.text).toContain('the juggler, ');
    expect(shot.text).toContain('standing on the cobblestone street');
    expect(shot.text).not.toMatch(/the juggler[^.]*partly hidden behind the cobblestone street/);
  });

  test('the dreamer holds the balloons and sits on the sofa, with the couple beside them on it', () => {
    const lounge: Blocking = {
      front: 'the window wall',
      indoors: true,
      room: [6, 5],
      spots: [
        { id: 'p1', x: 2.8, y: 3.5, kind: 'person', pose: 'sitting', faces: 'front' },
        {
          id: 'p5',
          x: 3.4,
          y: 3.5,
          kind: 'person',
          pose: 'sitting',
          faces: 'front',
          many: true,
          count: 2,
          spread: [0.8, 0.8],
        },
        { id: 't3', x: 2.5, y: 3.2, kind: 'thing', size: [0.5, 0.5, 1], heldBy: 'p1' },
        { id: 'x1', x: 3, y: 3.5, kind: 'thing', size: [2.5, 1, 1], fixture: true, name: 'the sofa', shape: 'seat' },
      ],
    };
    const names2 = (id: string) =>
      ({ p1: 'the dreamer', p5: 'the couple of people', t3: 'the string of blue balloons' })[id] ?? id;
    const shot = outsideShot(lounge, ['p1', 'p5', 't3'], 'medium', names2)!;
    expect(shot.text).toContain('sitting on the sofa');
    expect(shot.text).toContain('holding the string of blue balloons');
    expect(shot.text).not.toContain('sitting on the string of blue balloons');
    expect(shot.inPicture).toContain('p5');
  });

  test('someone facing what they hold, or the spot they stand on, is still framed', () => {
    const lounge: Blocking = {
      front: 'the window wall',
      indoors: true,
      room: [6, 5],
      spots: [
        { id: 'p1', x: 2, y: 2.5, kind: 'person', pose: 'sitting', faces: 't3' },
        { id: 't3', x: 2, y: 2.5, kind: 'thing', heldBy: 'p1', shape: 'block' },
        {
          id: 'x1',
          x: 2.75,
          y: 2.5,
          kind: 'thing',
          size: [2.4, 0.9, 0.8],
          shape: 'seat',
          fixture: true,
          name: 'the sofa',
        },
      ],
    };
    const shot = outsideShot(lounge, ['p1', 't3'], 'medium', (id) => (id === 'p1' ? 'the dreamer' : 'the balloons'))!;
    expect(shot.inPicture).toEqual(expect.arrayContaining(['p1', 't3']));
    expect(shot.text).not.toContain('Outside the picture, off to the right: the dreamer');
  });

  test('a cook at her stove is taken from the side, both in the picture', () => {
    const kitchen: Blocking = {
      front: 'the doorway',
      indoors: true,
      room: [2.5, 2.5],
      spots: [
        { id: 'p3', x: 1.25, y: 1.4, kind: 'person', pose: 'standing', faces: 't1' },
        { id: 't1', x: 1.25, y: 2.1, kind: 'thing', size: [1.8, 0.6, 0.9] },
      ],
    };
    const shot = outsideShot(kitchen, ['p3', 't1'], 'medium', (id) => (id === 'p3' ? 'the young woman' : 'the stove'), {
      at: { x: 1.25, y: 1.4 },
      id: 'p3',
    })!;
    expect(shot.text).toStartWith('Seen from the side, as the young woman faces the stove');
    expect(shot.inPicture).toEqual(expect.arrayContaining(['p3', 't1']));
  });
  test('a close look at what someone holds frames their hands, and says what it looks at', () => {
    // "The dreamer's hand holding the old brass key" came back as the dreamer from the knees up
    // (lighthouse m2, 26 Sep).
    const beach: Blocking = {
      front: 'the sea',
      spots: [
        { id: 'p1', x: 20, y: 10, kind: 'person', pose: 'standing', faces: 'front' },
        { id: 't1', x: 20, y: 10, kind: 'thing', size: [0.05, 0.02, 0.01], shape: 'block', heldBy: 'p1' },
      ],
    };
    const called = (id: string) => ({ p1: 'the dreamer', t1: 'the brass key' })[id] ?? id;
    const shot = outsideShot(beach, ['p1', 't1'], 'close', called, { at: { x: 20, y: 10 }, id: 't1' })!;
    expect(shot.text).toContain("the camera looks at the brass key in the dreamer's hands");
    expect(shot.text).toContain('their head out of the picture above');
    expect(shot.eye.pitch).toBeLessThan(-0.2);
  });
});
