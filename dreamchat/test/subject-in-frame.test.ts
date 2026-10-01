// The people a moment is about stay in its frame, their heads in it (the one builder's `subject_in_frame`). Leaning
// forward and looking down, the dreamer's view of old Ethan on the train held a seat-back and his knees (Train m1, the
// mock-up's A/B, 2 Oct). Whose face a moment needs is read from its words (facesNeeded); the camera tilts, a little at a
// time and at most 0.35 radians, until each of those heads is inside the frame (headsIn).
import { describe, expect, test } from 'bun:test';
import { facesNeeded } from '../continuity';
import { dreamerShot, headsIn, inFrame } from '../previs';

const b = {
  people: [
    { id: 'p1', name: 'you', is_dreamer: true },
    { id: 'p2', name: 'old Ethan' },
    { id: 'p3', name: 'the passengers', extras: true },
  ],
  things: [{ id: 't1', name: 'the battered suitcase' }],
};
const moment = (eyes: 'dreamer' | 'outside', action: string, point: string) =>
  ({ id: 'm1', eyes, action, visual_point: point, visible: ['p1', 'p2', 'p3'] }) as never;

describe('whose face a moment needs', () => {
  test('whom its words name; never a crowd; the dreamer only seen from outside, and only where said', () => {
    expect(
      facesNeeded(b as never, moment('dreamer', 'The dreamer sits across from old Ethan', 'old Ethan, tired')),
    ).toEqual(['p2']);
    expect(
      facesNeeded(b as never, moment('outside', 'The dreamer sits across from old Ethan', 'the dreamer and Ethan')),
    ).toEqual(['p1', 'p2']);
    expect(facesNeeded(b as never, moment('outside', 'The passengers sleep', 'the passengers asleep'))).toEqual([]);
  });

  test('none for hands, a held thing or an insert, or a point that begins with a thing', () => {
    expect(facesNeeded(b as never, moment('dreamer', 'Ethan gives the ticket', "Ethan's hands on the ticket"))).toEqual(
      [],
    );
    expect(facesNeeded(b as never, moment('dreamer', 'Ethan opens it', 'a close-up of the lock'))).toEqual([]);
    expect(facesNeeded(b as never, moment('dreamer', 'Ethan opens it', 'the battered suitcase, open'))).toEqual([]);
  });
});

describe("through the dreamer's own eyes, whose face its point needs", () => {
  test('whom the point names; one only the action names is where they are, unless the point says him or her', () => {
    // b0cb m3: the grandfather holds out the letters, and the view of them tilted up to his head.
    const letters = moment('dreamer', 'Ethan holds out the suitcase full of letters', 'the pile of envelopes');
    expect(facesNeeded(b as never, letters)).toEqual([]);
    expect(facesNeeded(b as never, moment('dreamer', 'Ethan turns to them', 'his tired smile'))).toEqual(['p2']);
    // Seen from outside, as before: whom the action names too.
    expect(
      facesNeeded(
        b as never,
        moment('outside', 'Ethan holds out the suitcase full of letters', 'the pile of envelopes'),
      ),
    ).toEqual(['p2']);
  });
});

describe('the camera tilts to hold their heads', () => {
  // Ethan standing two metres ahead; the eye sitting, looking down at what is in its lap.
  const plan = {
    front: 'the front',
    spots: [{ id: 'p2', x: 3, y: 3, kind: 'person' as const, pose: 'standing' as const, faces: 'the back' }],
    room: [6, 6] as [number, number],
  } as never;
  const down = { at: { x: 3, y: 5 }, d: { x: 0, y: -1 }, height: 1.2, pitch: -0.4, lens: 24 } as never;

  test('a head cut by the top is brought inside it, by no more than 0.35', () => {
    expect(inFrame(plan, down, 'p2')!.head).toBe(false);
    const e = headsIn(down, ['p2'], plan) as { pitch: number };
    const f = inFrame(plan, e as never, 'p2')!;
    expect(f.head).toBe(true);
    expect(f.top).toBeGreaterThanOrEqual(0.06);
    expect(e.pitch).toBeGreaterThan(-0.4);
    expect(e.pitch - -0.4).toBeLessThanOrEqual(0.35 + 1e-9);
  });

  test('never more than 0.35: a head too far above is left where the tilt stops', () => {
    const steep = { at: { x: 3, y: 5 }, d: { x: 0, y: -1 }, height: 1.2, pitch: -0.9, lens: 24 } as never;
    const e = headsIn(steep, ['p2'], plan) as { pitch: number };
    expect(e.pitch).toBeCloseTo(-0.9 + 0.345, 6);
    expect(inFrame(plan, e as never, 'p2')!.head).toBe(false);
  });

  test('with no one to hold, the camera as it was', () => {
    expect(headsIn(down, [], plan)).toBe(down);
  });

  test("then down, the head kept in, to hold as much of them as the moment's size does", () => {
    const near = {
      front: 'the gate',
      spots: [{ id: 'p2', x: 3, y: 4.2, kind: 'person' as const, pose: 'standing' as const, faces: 'the gate' }],
      room: [8, 8] as [number, number],
    } as never;
    const level = { at: { x: 3, y: 5 }, d: { x: 0, y: -1 }, height: 1.6, pitch: -0.07, lens: 24 } as never;
    expect(inFrame(near, level, 'p2')!.height).toBeLessThan(0.4);
    const f = inFrame(near, headsIn(level, ['p2'], near, 0.4), 'p2')!;
    expect(f.height).toBeGreaterThanOrEqual(0.4);
    expect(f.head).toBe(true);
    expect(f.top).toBeGreaterThanOrEqual(0.06);
    // With no size to hold, the head alone.
    expect(headsIn(level, ['p2'], near)).toBe(level);
  });
});

describe("the dreamer's view stands back to hold them at the moment's size", () => {
  test('half a metre from Tomas, a moment from the waist leans back and holds him from the waist (0f40 m2)', () => {
    const plan = {
      front: 'the gate',
      spots: [
        { id: 'p1', x: 3, y: 5, kind: 'person' as const, pose: 'standing' as const, faces: 'the gate' },
        { id: 'p2', x: 3, y: 4.5, kind: 'person' as const, pose: 'standing' as const, faces: 'the gate' },
      ],
      room: [8, 8] as [number, number],
    } as never;
    const name = (id: string) => (id === 'p2' ? 'Tomas' : 'the dreamer');
    const before = dreamerShot(plan, 'p1', 'p2', name, undefined, ['p2'])!;
    expect(inFrame(plan, before.eye, 'p2')!.height).toBeLessThan(0.4);
    const after = dreamerShot(plan, 'p1', 'p2', name, undefined, ['p2'], ['p2'], 0.4)!;
    const f = inFrame(plan, after.eye, 'p2')!;
    expect(f.height).toBeGreaterThanOrEqual(0.4);
    expect(f.head).toBe(true);
    expect(after.text).toContain('leaning back');
  });
});
