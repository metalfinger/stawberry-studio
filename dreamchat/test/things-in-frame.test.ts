// The things a moment's one thing to show names are in its picture, as the people it names are (the one builder's
// `things_in_frame`): the merged flow's fresh Grandmother (2 Oct), where "the grandmother laying the stamp among the
// knives and forks in her cutlery drawer" said the stamp outside the picture, off to the right, the camera behind her
// back, and a stamp pinched between their fingers was framed at its own size, her head out of the picture.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Blocking, Spot } from '../blocking';
import { framedAtSize, thingsNamed } from '../continuity';
import { outsideShot } from '../previs';
import type { Moment } from '../producer';

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
const BEFORE = { ...ON, DREAMCHAT_ONE_BUILDER: 'crowd_between' };

// Her kitchen as the fresh import planned it at m9: the drawer under the window wall, she at it with her back to the
// room, the dreamer beside her, the stamp laid on the drawer.
const kitchen: Blocking = {
  front: 'the window wall over the sink',
  indoors: true,
  room: [3.5, 3],
  spots: [
    { id: 'x1', x: 1.5, y: 0.3, kind: 'thing', size: [0.8, 0.6, 0.9], fixture: true, name: 'the sink' },
    { id: 'x3', x: 2.7, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
    { id: 'p2', x: 2.7, y: 0.9, kind: 'person', faces: 'x3', pose: 'standing' },
    { id: 'p1', x: 1.7, y: 1.4, kind: 'person', faces: 'p2', pose: 'standing' },
    { id: 't1', x: 2.8, y: 0.3, kind: 'thing', size: [0.037, 0.001, 0.025], shape: 'block', sized: 'moment' },
  ],
};
const names: Record<string, string> = {
  p1: 'the dreamer',
  p2: 'my grandmother',
  t1: 'the bed sheet (now the size of a tiny stamp)',
};
const name = (id: string) => names[id] ?? id;
const shot = (env: Record<string, string>, things: string[]) =>
  withEnv(env, () =>
    outsideShot(
      kitchen,
      ['p2', 'p1', 't1', 'x3'],
      'medium',
      name,
      { at: { x: 2.7, y: 0.3 }, id: 'x3' },
      [],
      undefined,
      ['p2'],
      [],
      things,
    ),
  )!;

describe('a thing the point names, in the picture', () => {
  // The fresh import's m9, its plan and camera call as they were made (the scene's line, the camera to avoid).
  const m9 = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'grandmother-m9-shot.json'), 'utf8'));
  const called = (id: string) =>
    ({ p1: 'the dreamer', p2: 'my grandmother', t1: 'the bed sheet (now the size of a tiny stamp)' })[id] ?? id;
  const shot9 = (env: Record<string, string>) =>
    withEnv(env, () =>
      outsideShot(
        m9.where,
        m9.framed,
        m9.size,
        called,
        m9.lookAt,
        m9.alsoNear,
        m9.rules,
        m9.heads,
        m9.others,
        m9.things,
      ),
    )!;

  test('the stamp she lays in the drawer: seen from where her back does not hide it, said small in the picture', () => {
    const v = shot9(ON);
    expect(v.inPicture).toEqual(expect.arrayContaining(['t1', 'p1', 'p2']));
    expect(v.text).toMatch(/stamp\)[^.;]*small in the picture, at its own size/);
    expect(v.text).not.toMatch(/Outside the picture[^.]*stamp/);
    // Without the step, from behind her: said outside the picture, off to the right.
    const off = shot9(BEFORE);
    expect(off.inPicture).not.toContain('t1');
    expect(off.text).toMatch(/Outside the picture, off to the right: the bed sheet/);
    // And in a plan made up for it, the things it names change nothing without the step.
    expect(shot(BEFORE, ['t1', 'x3'])).toEqual(shot(BEFORE, []));
  });

  test('a big thing with no pixel is hidden, never tiny in the picture', () => {
    const hall: Blocking = {
      front: 'the front',
      indoors: true,
      room: [8, 12],
      spots: [
        { id: 'p1', x: 4, y: 9, kind: 'person', faces: 'back', pose: 'standing' },
        { id: 'p2', x: 4, y: 2, kind: 'person', faces: 'p1', pose: 'sitting' },
        {
          id: 'x2',
          x: 4,
          y: 6,
          kind: 'thing',
          size: [3, 3, 1.6],
          shape: 'steps',
          fixture: true,
          name: 'the stairs going up',
        },
        {
          id: 'x3',
          x: 4,
          y: 9,
          kind: 'thing',
          size: [3, 2, 1.6],
          shape: 'steps',
          fixture: true,
          name: 'the next flight of stairs',
        },
      ],
    };
    const v = withEnv(ON, () =>
      outsideShot(
        hall,
        ['p2', 'p1'],
        'wide',
        (id) => ({ p1: 'the dreamer', p2: 'the grey dog' })[id] ?? id,
        undefined,
        [],
        undefined,
        [],
        [],
        ['x2', 'x3'],
      ),
    )!;
    expect(v.text).not.toMatch(/Tiny in the picture[^.]*(?:x3|stairs)/);
    expect(v.text).not.toContain('x3');
  });
});

describe('a small thing in someone hands', () => {
  test('is never what the frame is placed for: the people around it are', () => {
    const fingers = {
      ...kitchen,
      spots: kitchen.spots.map((s) => (s.id === 't1' ? { ...s, x: 2.7, y: 0.9, heldBy: 'p2' } : s)),
    };
    const m = {
      id: 'm8',
      visual_point:
        'the grandmother and the dreamer bringing the corners together, a tiny stamp pinched between their fingers',
    } as Moment;
    const as = (s: Spot) => (s.id === 't1' ? 'the bed sheet a tiny stamp' : (names[s.id] ?? s.name ?? s.id));
    expect(withEnv(ON, () => framedAtSize(fingers, ['p2', 'p1', 't1'], m, as))).toEqual(['p2', 'p1', 't1']);
  });
});

describe('what the point names', () => {
  const spot = (id: string, name: string, x = 0, y = 0): Spot => ({ id, kind: 'thing', name, x, y });
  const named = (point: string, spots: Spot[], near?: { x: number; y: number }) =>
    thingsNamed(point, spots, (s) => (s.id === 't1' ? ['the bed sheet', 'a tiny stamp'] : [s.name ?? '']), near);

  test('by its name, by what it is about, or by what a change has made it', () => {
    const kitchen = [spot('t1', 'the bed sheet'), spot('x3', 'the cutlery drawer'), spot('c1', 'the knives and forks')];
    expect(named('the grandmother laying the stamp among the knives and forks in her cutlery drawer', kitchen)).toEqual(
      ['x3', 'c1', 't1'],
    );
    expect(
      named('the laptop on the dining table underwater', [spot('x5', 'the dining table through the window')]),
    ).toEqual(['x5']);
  });

  test('never a part of the place, a word in another name, or "the size of" a thing; one of several alike', () => {
    expect(named('the dreamer at the window', [spot('x5', 'the dining table through the window')])).toEqual([]);
    expect(named('the dreamer at the far end of the hall', [spot('x1', 'the middle of the hall')])).toEqual([]);
    expect(named('the mom in the doorway to another room', [spot('x2', 'their room at night')])).toEqual([]);
    expect(named('a cup the size of a teacup', [spot('t9', 'the teacup')])).toEqual([]);
    const windows = [spot('a', 'a window', 1, 1), spot('b', 'a window', 5, 5), spot('c', 'a window', 9, 9)];
    expect(named('the dreamer at the window, boat in hand', windows, { x: 4, y: 4 })).toEqual(['b']);
  });
});
