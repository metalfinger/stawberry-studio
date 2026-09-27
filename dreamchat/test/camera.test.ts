import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { assembleCut } from '../assemble';
import type { Blocking } from '../blocking';
import { cameraMode, handsIn, openingsIn, outThroughWindows, sameCameraAs, selfIn, waterLevel } from '../camera';
import { planContinuity, relationIn, shotPlan } from '../continuity';
import type { CutSheet } from '../cutsheet';
import { frozenDreams, loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import type { Breakdown, Moment } from '../producer';
import type { Session } from '../session';

// Frozen dreams are rebuilt with the switches in several ways.
setDefaultTimeout(120_000);

/** Runs `fn` with the dream chat's switches set, and puts them back. */
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

const ON = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on' };
const rebuilt = (id: string, env: Record<string, string | undefined>) =>
  withEnv(env, () => rebuild(loadDream(id, false).session as Session));
const picture = (r: ReturnType<typeof rebuild>, id: string) => r.pictures.find((p) => p.id === id && p.kind === 'cut')!;
const shot = (prompt: string) =>
  prompt.split('\n\n').find((p) => /^(?:The shot|What the dreamer sees|What the camera sees)\b/.test(p)) ?? '';

describe('the camera rules switch', () => {
  test('is off unless asked for', () => {
    withEnv({ DREAMCHAT_CAMERA: undefined }, () => expect(cameraMode()).toBe('off'));
    withEnv({ DREAMCHAT_CAMERA: 'ON ' }, () => expect(cameraMode()).toBe('on'));
    withEnv({ DREAMCHAT_CAMERA: 'yes' }, () => expect(cameraMode()).toBe('off'));
  });

  test('off, no sheet carries the rules and no floor plan is read again, on every frozen dream', () => {
    for (const id of frozenDreams()) {
      const r = rebuilt(id, { DREAMCHAT_CAMERA: undefined, DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on' });
      for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
        expect(p.sheet?.rules).toBeUndefined();
        const plan = withEnv({ DREAMCHAT_CAMERA: undefined }, () => shotPlan(r.b, p.id, r.rec));
        expect(plan?.water).toBeUndefined();
      }
    }
  });
});

describe('where a place has its windows and doors, from its words', () => {
  test('on the walls its words name, for someone facing its front; nowhere where they name none', () => {
    expect(openingsIn('a long room, a row of windows along each side, and a narrow aisle')).toEqual([
      { what: 'windows', walls: ['left', 'right'] },
    ]);
    expect(openingsIn('a round room with windows all the way round')).toEqual([
      { what: 'windows', walls: ['front', 'back', 'left', 'right'] },
    ]);
    expect(openingsIn('a sliding door at the far end')).toEqual([{ what: 'door', walls: ['back'] }]);
    expect(openingsIn('a wide window showing snowy ground outside')).toEqual([]);
  });
});

describe('the water, as high as the record says it stands', () => {
  const plan: Blocking = {
    front: 'the doors',
    indoors: true,
    ceiling: 4,
    room: [20, 12],
    spots: [
      { id: 'x1', x: 10, y: 0.5, fixture: true, name: 'the high round window', size: [2, 0.3, 2] },
      { id: 'x2', x: 0.5, y: 6, fixture: true, name: 'the left door', size: [0.1, 1.5, 2.2] },
      { id: 'x3', x: 8, y: 6, fixture: true, name: 'desk with green lamp', size: [1.2, 0.8, 0.75] },
    ],
  };
  test('by the first thing its words measure it by, never where it comes in from', () => {
    expect(waterLevel('coming in under the doors, rising over the desks and up between the shelves', plan)).toBe(0.95);
    expect(waterLevel('almost up to the high round window, over the desks and shelves', plan)).toBe(1.8);
    expect(waterLevel('almost up to the ceiling', plan)).toBe(3.8);
    expect(waterLevel('beginning to cover the floor', plan)).toBe(0.1);
    expect(waterLevel('up to their knees', plan)).toBe(0.5);
    expect(waterLevel('deep enough for a whale to swim', plan)).toBeNull();
  });

  test('a boat afloat rides on it, whoever is in it rises with it, and what is under it is said to be', () => {
    const r = rebuilt('dream-0926-050424-fdd7', ON);
    const m4 = picture(r, 'm4');
    expect(withEnv(ON, () => shotPlan(r.b, 'm4', r.rec))?.water).toBeGreaterThan(0.5);
    expect(m4.prompt).toMatch(/Under the water[^.]*: the whale, all of it below the surface/);
    expect(shot(m4.prompt)).not.toMatch(/From left to right across the picture:[^.]*\bwhale\b/);
    const off = rebuilt('dream-0926-050424-fdd7', { ...ON, DREAMCHAT_CAMERA: undefined });
    expect(off.plan.cuts.find((c) => c.id === 'm4')!.view).toMatch(/From left to right[^.]*\bwhale\b/);
  });
});

describe("through the dreamer's own eyes", () => {
  test('their hands are in it only where they do something with them, or hold something', () => {
    expect(handsIn(['The lift gate opens on its own onto an orchard at dusk'], false)).toBe(false);
    expect(handsIn(['The dreamer looks for Tomas and finds him gone.'], false)).toBe(false);
    expect(handsIn(['The white horse lowers its head so the dreamer can touch its nose.'], false)).toBe(true);
    expect(handsIn(['The dreamer looks back down at the boat in their hand'], false)).toBe(true);
    expect(handsIn(['the dreamer opens the door'], false)).toBe(true);
    expect(handsIn(['A field of grass under a grey sky'], true)).toBe(true);
    // Turning round is the body, not the hands.
    expect(handsIn(['The dreamer turns around and sees the thin grey dog sitting on the ramp'], false)).toBe(false);
  });

  test('looking down at themselves, their own body is what the picture shows', () => {
    expect(selfIn(['The dreamer looks down', 'their own small body and the gray cardigan'])).toBe(true);
    expect(selfIn(['The dreamer looks for Tomas and finds him gone.'])).toBe(false);
  });

  test('a gate opening on its own shows nothing of them, and no view invites their legs or feet', () => {
    const r = rebuilt('dream-0926-070314-0f40', ON);
    const m4 = picture(r, 'm4');
    expect(m4.sheet?.rules?.body).toBe('none');
    expect(m4.prompt).not.toMatch(/hands, arms or feet/);
    expect(picture(r, 'm6').sheet?.rules?.body).toBe('hands');
    expect(picture(r, 'm6').prompt).toMatch(/\bhands\b/);
    for (const id of ['m4', 'm6', 'm7']) expect(picture(r, id).prompt).not.toMatch(/\b(?:feet|legs)\b/);
  });

  test('someone facing them on the same long seat sits across from them, not beside them', () => {
    const r = rebuilt('dream-0926-043003-b0cb', ON);
    expect(shot(picture(r, 'm3').prompt)).toMatch(/the grandfather, sitting across from the dreamer/);
    expect(picture(r, 'm3').prompt).not.toMatch(/beside the dreamer on the same seat/);
  });
});

describe('a reverse angle turns the room', () => {
  test('what is now ahead, on the right and behind the camera, from the floor plan and the place', () => {
    const r = rebuilt('dream-0926-043003-b0cb', ON);
    const m2 = picture(r, 'm2');
    expect(m2.sheet?.tags.move).toBe('reverse');
    expect(m2.sheet?.rules?.turn).toMatchObject({ from: 1, ahead: 'the back of the room' });
    const s = shot(m2.prompt);
    expect(s).toMatch(
      /The camera has turned round from picture 1[^.]*on the right of the picture, a side wall of the old train, with its windows/,
    );
    // Never the windows on the left: turned round, the room's left is the picture's right.
    for (const sentence of s.split('.')) expect(/window/i.test(sentence) && /\bleft\b/.test(sentence)).toBe(false);
  });

  test('the picture before, from the other side, is never the picture edited nor where things stand', () => {
    for (const id of frozenDreams()) {
      const r = rebuilt(id, ON);
      for (const p of r.pictures.filter((x) => x.kind === 'cut' && x.sheet?.tags.move === 'reverse')) {
        const prev = p.sheet!.prev;
        expect(p.sheet!.earlier.some((e) => e.id === prev && (e.role === 'base' || e.role === 'composition'))).toBe(
          false,
        );
      }
    }
  });
});

describe('the scene, its places and its cameras', () => {
  test('the moment after a jump in the same place is that place, not another', () => {
    const b = {
      scenes: [
        {
          id: 's1',
          moments: [
            { id: 'm1', place: 'l1', distance: 'medium', eyes: 'outside', looks_at: 'the window', shift: '' },
            {
              id: 'm2',
              place: 'l1',
              distance: 'medium',
              eyes: 'outside',
              looks_at: 'the window',
              shift: 'it becomes night',
            },
            { id: 'm3', place: 'l1', distance: 'medium', eyes: 'outside', looks_at: 'the window', shift: '' },
          ],
        },
      ],
    };
    const ms = b.scenes[0].moments as unknown as Moment[];
    expect(relationIn(ms)(ms[2], ms[1])).toBe('other_place');
    expect(relationIn(ms, { camera: true })(ms[2], ms[1])).toBe('same_setup');
    // Across the jump, still another place.
    expect(relationIn(ms, { camera: true })(ms[2], ms[0])).toBe('other_place');
  });

  test('two cameras placed on one floor plan facing the same way are the same side, whatever the words say', () => {
    const off = rebuilt('dream-0926-062232-a44a', { ...ON, DREAMCHAT_CAMERA: undefined });
    const on = rebuilt('dream-0926-062232-a44a', ON);
    const rel = (r: ReturnType<typeof rebuild>) =>
      r.plan.cuts.find((c) => c.id === 'm2')!.refs.find((x) => x.kind === 'cut' && x.id === 'm1')?.relation;
    expect(rel(off)).toBe('other_side');
    expect(rel(on)).toBe('same_side');
  });

  test('what is seen out past a window stands off the floor plan, far off through it', () => {
    const plan: Blocking = {
      front: 'the window',
      indoors: true,
      room: [4, 4],
      spots: [
        { id: 'p1', x: 2, y: 1, kind: 'person' },
        { id: 'x1', x: 2, y: 0, fixture: true, name: 'the window', size: [1.2, 0.1, 1.5] },
        { id: 't3', x: 2, y: 0, kind: 'thing', shape: 'vehicle', size: [1.5, 1, 1.5] },
        { id: 't2', x: 2, y: 1, kind: 'thing', heldBy: 'p1' },
      ],
    };
    expect(outThroughWindows(plan)).toEqual({ t3: 'front' });
    const r = rebuilt('dream-0926-022102-aeea', ON);
    const m10 = withEnv(ON, () => shotPlan(r.b, 'm10', r.rec));
    expect(m10?.spots.some((s) => s.id === 't3')).toBe(false);
    expect(m10?.outside).toMatchObject({ t3: 'front' });
    expect(picture(r, 'm10').prompt).toMatch(
      /Out past the window, far off outside and never inside the place: the red tractor/,
    );
  });

  test('a vehicle someone rides goes the way it faces, said across the picture', () => {
    const r = rebuilt('dream-0926-022102-aeea', ON);
    expect(shot(picture(r, 'm12').prompt)).toMatch(
      /the red tractor[^.]*heading away from the camera, into the picture/i,
    );
  });

  test('a camera stays on its side of the scene, unless only the other side shows what the moment is about', () => {
    const b = {
      title: 't',
      people: [
        { id: 'p1', name: 'ana', is_dreamer: false },
        { id: 'p2', name: 'bo', is_dreamer: false },
      ],
      places: [{ id: 'l1', name: 'the kitchen' }],
      things: [],
      scenes: [
        {
          id: 's1',
          place: 'l1',
          blocking: {
            front: 'the stove',
            indoors: true,
            room: [8, 8],
            // At the third moment they step toward the front wall: the most room is now on their other side.
            moves: {
              m3: [
                { id: 'p1', x: 3, y: 2.5, faces: 'p2' },
                { id: 'p2', x: 5, y: 2.5, faces: 'p1' },
              ],
            },
            spots: [
              { id: 'p1', x: 3, y: 4, kind: 'person', faces: 'p2', pose: 'standing' },
              { id: 'p2', x: 5, y: 4, kind: 'person', faces: 'p1', pose: 'standing' },
            ],
          },
          moments: ['m1', 'm2', 'm3'].map((id) => ({
            id,
            place: 'l1',
            visible: ['p1', 'p2'],
            things: [],
            eyes: 'outside',
            distance: id === 'm1' ? 'medium' : id === 'm2' ? 'close' : 'wide',
            looks_at: '',
            action: 'they talk',
            shift: '',
            sameSide: [],
          })),
        },
      ],
    } as unknown as Breakdown;
    // Which side of the two a camera stands on: in front of them (toward the stove) or behind them.
    const sideIn = (plan: ReturnType<typeof planContinuity>, id: string) => {
      const c = plan.cuts.find((x) => x.id === id)!;
      const y = id === 'm3' ? 2.5 : 4;
      return Math.sign(c.eye!.at.y - y);
    };
    const off = withEnv({ DREAMCHAT_CAMERA: undefined }, () => planContinuity(b));
    const on = withEnv({ DREAMCHAT_CAMERA: 'on' }, () => planContinuity(b));
    expect(sideIn(off, 'm3')).not.toBe(sideIn(off, 'm1'));
    expect(sideIn(on, 'm2')).toBe(sideIn(on, 'm1'));
    expect(sideIn(on, 'm3')).toBe(sideIn(on, 'm1'));
  });

  test('the same camera, as the tree reads it', () => {
    const a = { at: { x: 0, y: 0 }, d: { x: 0, y: 1 }, height: 1.6 };
    expect(sameCameraAs(a, { ...a, at: { x: 0.5, y: 0 } })).toBe(true);
    expect(sameCameraAs(a, { ...a, height: 2.6 })).toBe(false);
    expect(sameCameraAs(a, { ...a, d: { x: 1, y: 1 } })).toBe(false);
  });
});

describe('with the camera rules on, assembleCut still reads the sheet alone', () => {
  test('a copy of each sheet, cut off from everything, assembles the same', () => {
    const r = rebuilt('dream-0926-043003-b0cb', ON);
    for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
      const s = p.sheet as CutSheet;
      expect(s.rules).toBeDefined();
      const copy = JSON.parse(JSON.stringify(s)) as CutSheet;
      expect(withEnv({ DREAMCHAT_CAMERA: undefined }, () => assembleCut(copy))).toEqual(assembleCut(s));
      expect(assembleCut(s).prompt).toBe(p.prompt);
    }
  });
});
