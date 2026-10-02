// Through the dreamer's own eyes there is always a view where they are on the plan (the one builder's `eyes_aimed`).
// A view was kept only where what they look at showed in one of its ways of looking: the laptop on the dining table
// under the water (the merged flow's Fan m8) and a tiny building with a party inside, hidden by its guests (Shrunk m6)
// never did, and the cut had no camera, was "failed", and was never drawn (2 Oct). Each plan is the dream's own.
import { describe, expect, test } from 'bun:test';
import { dreamerShot } from '../previs';

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
const CAMERA = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' };
const ON = { ...CAMERA, DREAMCHAT_ONE_BUILDER: 'on' };
const BEFORE = { ...CAMERA, DREAMCHAT_ONE_BUILDER: 'era' };

// Fan m8: "the laptop on the dining table underwater, its screen lit up", close, looking at the dining table.
const fan = {
  front: 'the dining table',
  spots: [
    {
      id: 'x1',
      x: 3,
      y: 1.5,
      kind: 'thing',
      size: [1.6, 0.9, 0.75],
      shape: 'block',
      fixture: true,
      name: 'the dining table',
    },
    { id: 't1', x: 3, y: 1.5, kind: 'thing', size: [0.35, 0.25, 0.02], shape: 'block' },
    { id: 'p1', x: 3, y: 2.6, kind: 'person', faces: 'x1', pose: 'standing' },
  ],
  room: [6, 5],
  indoors: true,
  ceiling: 2.7,
  water: 0.95,
} as never;
// Shrunk m6: "a party inside the tiny building, Alina and people the dreamer knew", close, looking at its windows.
const shrunk = {
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
    {
      id: 'x2',
      x: 2.4,
      y: 1.1,
      kind: 'thing',
      size: [0.4, 0.4, 0.65],
      shape: 'seat',
      fixture: true,
      name: 'a kitchen stool',
    },
    { id: 'p1', x: 2.6, y: 0.9, kind: 'person', faces: 't2', pose: 'standing' },
    { id: 'p2', x: 2.6, y: 0.3, kind: 'person', faces: 'front', pose: 'standing' },
    { id: 't2', x: 2.6, y: 0.3, kind: 'thing', size: [0.4, 0.3, 0.4], shape: 'block' },
    { id: 'p4', x: 2.6, y: 0.3, kind: 'person', many: true, pose: 'standing', spread: [0.35, 0.25] },
  ],
  room: [4, 4],
  indoors: true,
  ceiling: 2.5,
} as never;
const names: Record<string, string> = {
  p1: 'the dreamer',
  p2: 'Alina',
  p4: 'the other people',
  t1: 'the laptop',
  t2: 'the shrunken building',
};
const name = (id: string) => names[id] ?? id;

describe("the dreamer's eyes always have a view on a placed scene", () => {
  test('under the water: the dining table is looked at through it, close, from where they stand (Fan m8)', () => {
    const v = withEnv(ON, () => dreamerShot(fan, 'p1', 'x1', name))!;
    expect(v).not.toBeNull();
    // Toward the table, and down at it.
    expect(v.eye.d.y).toBeLessThan(-0.9);
    expect(v.eye.pitch!).toBeLessThan(0);
    expect(v.text).toContain('toward the dining table');
    expect(withEnv(BEFORE, () => dreamerShot(fan, 'p1', 'x1', name))).toBeNull();
  });

  test('hidden by those around it: the tiny building is looked at all the same, straight on (Shrunk m6)', () => {
    const v = withEnv(ON, () => dreamerShot(shrunk, 'p1', 't2', name))!;
    expect(v).not.toBeNull();
    expect(v.eye.at).toEqual({ x: 2.6, y: 0.9 });
    expect(v.eye.d.y).toBeLessThan(-0.99);
    expect(v.text).toContain('toward the shrunken building');
    expect(withEnv(BEFORE, () => dreamerShot(shrunk, 'p1', 't2', name))).toBeNull();
  });
});
