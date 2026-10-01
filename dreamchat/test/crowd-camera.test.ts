// A moment about a crowd alone gets a camera (the one builder's `crowd_camera`): in a dumped dream, "everyone in our
// house" in the dark of a power cut, and going up the stairs to the roof to sleep, had no one else in them, and the
// camera, centred on the people a moment holds but never on a crowd, was never placed: no view, no mock-up, both
// moments blocked from drawing (the merged flow's Neighbours, m1 and m8, 1 Oct).
import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { outsideShot } from '../previs';

function withBuilder<T>(v: string | undefined, fn: () => T): T {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = v;
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

// Neighbours' house, as its floor plan was drawn.
const house = {
  front: 'the wall with the stairs to the roof',
  spots: [
    {
      id: 'x1',
      x: 3,
      y: 2.5,
      kind: 'thing',
      size: [0.4, 0.4, 0.2],
      shape: 'block',
      fixture: true,
      name: 'the dead ceiling light',
    },
    {
      id: 'x2',
      x: 5.2,
      y: 1.6,
      kind: 'thing',
      size: [1, 3, 2.4],
      shape: 'steps',
      fixture: true,
      name: 'the stairs to the roof',
    },
    { id: 'p4', x: 2.8, y: 3.2, kind: 'person', faces: 'x1', many: true, pose: 'standing', spread: [2, 1.5] },
  ],
  room: [6, 5],
  indoors: true,
  ceiling: 2.8,
} as unknown as Blocking;
const called = (id: string) => (id === 'p4' ? 'everyone in our house' : id);

describe('a moment of a crowd alone is shot', () => {
  test('with the step, the camera is placed on the crowd and what the moment looks at', () => {
    const v = withBuilder('crowd_camera', () =>
      outsideShot(house, ['p4', 'c1'], 'wide', called, { id: 'x1', at: { x: 3, y: 2.5 } }),
    );
    expect(v).not.toBeNull();
    expect(v!.inPicture).toContain('p4');
    expect(v!.text).toContain('everyone in our house');
  });

  test('without it, as before: no camera', () => {
    expect(withBuilder('thought_outside', () => outsideShot(house, ['p4'], 'wide', called, { id: 'x1' }))).toBeNull();
  });
});
