import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { assembleCut } from '../assemble';
import type { Blocking } from '../blocking';
import {
  cameraMode,
  goingIn,
  handsIn,
  openingsIn,
  outThroughWindows,
  sameCameraAs,
  selfIn,
  WATER,
  waterLevel,
} from '../camera';
import {
  camerasOf,
  placePlan,
  planContinuity,
  relationIn,
  sameByCamera,
  shotPlan,
  sidesByCamera,
  unsettled,
} from '../continuity';
import { type CutSheet, notDrawnFrom } from '../cutsheet';
import { frozenDreams, loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { type Breakdown, type Moment, moments } from '../producer';
import type { Session } from '../session';

// Frozen dreams are rebuilt with the switches in several ways.
setDefaultTimeout(240_000);

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

/** The camera rules on: they need the cut sheet on. */
const CAMERA = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on' };
const ON = { ...CAMERA, DREAMCHAT_RECORD: 'on' };
const rebuilt = (id: string, env: Record<string, string | undefined>) =>
  withEnv(env, () => rebuild(loadDream(id, false).session as Session));
const picture = (r: ReturnType<typeof rebuild>, id: string) => r.pictures.find((p) => p.id === id && p.kind === 'cut')!;
const shot = (prompt: string) =>
  prompt.split('\n\n').find((p) => /^(?:The shot|What the dreamer sees|What the camera sees)\b/.test(p)) ?? '';
const planned = (b: Breakdown) => withEnv(CAMERA, () => planContinuity(b));
const cut = (plan: ReturnType<typeof planContinuity>, id: string) => plan.cuts.find((c) => c.id === id)!;

/** Every frozen dream rebuilt with the camera rules on, once for the sweeps below. */
const ALL = () => frozenDreams().map((id) => ({ id, r: rebuilt(id, ON) }));
let all: ReturnType<typeof ALL> | undefined;
const sweep = () => {
  all ??= ALL();
  return all;
};

/** A small dream of one scene on one floor plan, its moments as given. */
function dream(x: {
  people?: string[];
  things?: { id: string; name: string }[];
  blocking: Omit<Blocking, 'front'> & { front?: string };
  moments: (Partial<Moment> & { id: string })[];
}): Breakdown {
  return {
    title: 't',
    logline: '',
    look: {
      colours: { value: null, said: false },
      light: { value: null, said: false },
      texture: { value: null, said: false },
    },
    world_logic: '',
    people: (x.people ?? ['p1', 'p2']).map((id) => ({ id, name: `person ${id}`, is_dreamer: false })),
    places: [{ id: 'l1', name: 'the place' }],
    things: x.things ?? [],
    scenes: [
      {
        id: 's1',
        title: '',
        place: 'l1',
        mood: '',
        blocking: { front: 'the front wall', ...x.blocking },
        moments: x.moments.map((m) => ({
          place: 'l1',
          visible: ['p1', 'p2'],
          things: [],
          eyes: 'outside',
          distance: 'medium',
          looks_at: '',
          action: 'they talk',
          shift: '',
          sameSide: [],
          ...m,
        })),
      },
    ],
    style_options: [],
    unknowns: [],
  } as unknown as Breakdown;
}

describe('the camera rules switch', () => {
  test('is off unless asked for, and off without the cut sheet, which carries what it says to the prompt', () => {
    withEnv({ DREAMCHAT_CAMERA: undefined, DREAMCHAT_CUT_SHEET: 'on' }, () => expect(cameraMode()).toBe('off'));
    withEnv({ DREAMCHAT_CAMERA: 'ON ', DREAMCHAT_CUT_SHEET: 'on' }, () => expect(cameraMode()).toBe('on'));
    withEnv({ DREAMCHAT_CAMERA: 'yes', DREAMCHAT_CUT_SHEET: 'on' }, () => expect(cameraMode()).toBe('off'));
    for (const sheet of [undefined, 'off', 'shadow'])
      withEnv({ DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: sheet }, () => expect(cameraMode()).toBe('off'));
  });

  test("asked for without the sheet, every prompt is today's", () => {
    const id = 'dream-0926-043003-b0cb';
    const off = rebuilt(id, { DREAMCHAT_CAMERA: undefined, DREAMCHAT_CUT_SHEET: 'shadow', DREAMCHAT_RECORD: 'on' });
    const half = rebuilt(id, { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'shadow', DREAMCHAT_RECORD: 'on' });
    expect(half.pictures.map((p) => p.prompt)).toEqual(off.pictures.map((p) => p.prompt));
    expect(JSON.stringify(half.plan)).toBe(JSON.stringify(off.plan));
  });

  test('off, no sheet carries the rules and no floor plan is read again, on every frozen dream', () => {
    for (const id of frozenDreams()) {
      const r = rebuilt(id, { DREAMCHAT_CAMERA: undefined, DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on' });
      for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
        expect(p.sheet?.rules).toBeUndefined();
        const plan = withEnv({ DREAMCHAT_CAMERA: undefined }, () => shotPlan(r.b, p.id, r.rec));
        expect(plan?.water).toBeUndefined();
        expect(r.plan.cuts.find((c) => c.id === p.id)?.rules).toBeUndefined();
      }
    }
  });
});

describe('where a place has its windows and doors, from its words', () => {
  test('on the walls its words name, for someone facing its front; nowhere where they name none', () => {
    expect(openingsIn('a long hall, a row of windows along each side, and a stone floor')).toEqual([
      { what: 'windows', walls: ['left', 'right'] },
    ]);
    expect(openingsIn('a round tower room with windows all the way round')).toEqual([
      { what: 'windows', walls: ['front', 'back', 'left', 'right'] },
    ]);
    expect(openingsIn('a barn with a sliding door at the far end')).toEqual([{ what: 'door', walls: ['back'] }]);
    expect(openingsIn('a kitchen with a window on the left')).toEqual([{ what: 'window', walls: ['left'] }]);
    expect(openingsIn('a wide window showing hills')).toEqual([]);
  });
});

describe('what is seen out past a window', () => {
  const plan: Blocking = {
    front: 'the bay window',
    indoors: true,
    room: [5, 4],
    spots: [
      { id: 'x1', x: 2.5, y: 0.1, fixture: true, name: 'the big bay window', size: [2.4, 0.2, 1.6] },
      { id: 't1', x: 2.0, y: 0.45, kind: 'thing', name: 'the telescope', size: [0.4, 0.4, 1.4] },
      { id: 't2', x: 3.3, y: 0.3, kind: 'thing', name: 'the potted plant' },
      { id: 'p1', x: 2.5, y: 1, kind: 'person' },
    ],
  };

  test('is off the floor plan only where the story sees it out there; what stands at a window stays in the room', () => {
    expect(outThroughWindows(plan, new Set())).toEqual({});
    expect(outThroughWindows(plan, new Set(['t2']))).toEqual({ t2: 'front' });
    expect(outThroughWindows({ ...plan, indoors: false }, new Set(['t2']))).toEqual({});
  });

  test('a moment looking out of the window puts what it shows out past it, and says so', () => {
    const b = dream({
      things: [
        { id: 't1', name: 'the telescope' },
        { id: 't2', name: 'the hot air balloon' },
      ],
      blocking: { ...plan, spots: plan.spots.map((s) => (s.id === 'p1' ? { ...s, pose: 'standing' } : s)) },
      moments: [
        { id: 'm1', visible: ['p1'], things: ['t1'], action: 'she stands by the telescope' },
        { id: 'm2', visible: ['p1'], things: ['t2'], action: 'she looks out of the window at a hot air balloon' },
        { id: 'm3', visible: ['p1'], things: ['t1'], distance: 'close', action: 'she turns back to the telescope' },
      ],
    });
    const m3 = withEnv(CAMERA, () => shotPlan(b, 'm3'));
    expect(m3?.outside).toEqual({ t2: 'front' });
    expect(m3?.spots.some((s) => s.id === 't1')).toBe(true);
    const r = rebuilt('dream-0926-022102-aeea', ON);
    expect(withEnv(ON, () => shotPlan(r.b, 'm10', r.rec))?.spots.some((s) => s.id === 't3')).toBe(false);
    expect(picture(r, 'm10').prompt).toMatch(
      /Out past the window, far off outside and never inside the place: the red tractor/,
    );
  });
});

describe('the water, as high as the record says it stands', () => {
  const room: Blocking = {
    front: 'the doors',
    indoors: true,
    ceiling: 4,
    room: [20, 12],
    spots: [
      { id: 'x1', x: 10, y: 0.5, fixture: true, name: 'the tall arched window', size: [2, 0.3, 2] },
      { id: 'x2', x: 0.5, y: 6, fixture: true, name: 'the side door', size: [0.1, 1.5, 2.2] },
      { id: 'x3', x: 8, y: 6, fixture: true, name: 'counter with a till', size: [1.2, 0.8, 1] },
      { id: 'x4', x: 3, y: 3, fixture: true, name: 'the bookcases', size: [1, 3, 2.5] },
      { id: 'b1', x: 5, y: 5, shape: 'vehicle', name: 'the dinghy', size: [2, 1, 0.6] },
    ],
  };
  const open: Blocking = { ...room, indoors: false, ceiling: undefined };

  test('by the first thing its words measure it by, never where it comes in from', () => {
    expect(waterLevel('seeping in under the doors, rising over the counters', room)).toBe(1.2);
    expect(waterLevel('almost up to the tall arched window', room)).toBe(1.8);
    expect(waterLevel('almost to the ceiling', room)).toBe(3.8);
    expect(waterLevel('lapping over the floor', room)).toBe(0.1);
    expect(waterLevel('up to their knees', room)).toBe(0.5);
    expect(waterLevel('knee-deep', room)).toBe(0.5);
    expect(waterLevel('deep enough to swim in', room)).toBeNull();
  });

  test('a body or a thing it reaches measures it before a floor does; spread across the floor to a thing, it is still low', () => {
    expect(waterLevel('the floor of the hall is flooded, water up to their waists', room)).toBe(1);
    expect(waterLevel('covering the floor and up to the bookcases', room)).toBe(0.1);
    expect(waterLevel('over the tops of the bookcases', room)).toBe(2.7);
  });

  test('outdoors there is no ceiling: a roof filled with water is water on the roof, and what floats on it is no measure', () => {
    expect(waterLevel('the roof fills with water around the dinghy', open)).toBe(0.1);
    expect(waterLevel('water fills the roof', open)).toBe(0.1);
    expect(waterLevel('the sea laps at the dinghy', open)).toBeNull();
    expect(waterLevel('up to their chests', open)).toBe(1.3);
    // In a room, the roof is its top.
    expect(waterLevel('almost up to the roof', room)).toBe(3.8);
  });

  test('every water level read on the frozen dreams, as labelled, and every reading of what their moments imply', () => {
    // Every water the frozen dreams' records carry, labelled by hand from its words and floor plan.
    const want: Record<string, number | null> = {
      'fdd7 m2': 0.95, // coming in under the doors, rising over the desks
      '6081 m2': null, // water starts coming under the doors
      '6081 m3': 1, // rises over the desks
      '6e80 m1': 0.1, // beginning to cover the floor
      '6e80 m3': 1, // up over the tops of the desks
      '538d m6': 0.1, // fills the roof (outdoors)
    };
    // By the words it is read from: a water carried into later moments is the same reading.
    const got: Record<string, number | null> = {};
    const first: Record<string, string> = {};
    const plans: Record<string, Blocking> = {};
    for (const { id, r } of sweep())
      for (const [m, x] of Object.entries(r.rec?.moments ?? {})) {
        const at = `${id.slice(-4)} ${m}`;
        const plan = placePlan(r.b, m);
        if (plan) plans[at] = plan;
        for (const f of x.facts)
          if (f.kind === 'place')
            for (const k of f.facts)
              if (k.kind === 'part' && (WATER.test(k.part) || WATER.test(k.what)) && plan) {
                const key = `${id.slice(-4)} ${k.now}`;
                first[key] ??= at;
                got[first[key]] = waterLevel(k.now, plan);
              }
      }
    // Every one labelled, and no reading left unlabelled.
    expect(got).toEqual(want);
    // What the moments imply is read by a model and kept outside the repository: its water readings on
    // these dreams, labelled against the same floor plans.
    const implied: [string, string, number | null][] = [
      [
        'fdd7 m4',
        'deep enough for a whale to swim, filling the aisle, over the desks and up between the shelves',
        0.95,
      ],
      ['fdd7 m5', 'almost up to the high round window, over the desks and shelves', 1.8], // the plan's window is 2 m tall
      ['6081 m8', 'almost up to the ceiling, over the desks and shelves', 3.8],
      ['6e80 m2', 'covering the floor and up to the shelves', 0.1],
      ['6e80 m7', 'almost up to the high round window, over the tops of the desks and shelves', 1.3],
      ['8ceb m1', 'deep enough to swim, the school is flooded', null],
    ];
    for (const [k, words, v] of implied) expect([k, waterLevel(words, plans[k])]).toEqual([k, v]);
  });

  test('a boat afloat rides on it, whoever is in it rises with it, and what is under it is said to be', () => {
    const r = rebuilt('dream-0926-050424-fdd7', ON);
    const m4 = picture(r, 'm4');
    expect(withEnv(ON, () => shotPlan(r.b, 'm4', r.rec))?.water).toBeGreaterThan(0.5);
    expect(m4.prompt).toMatch(/Under the water[^.]*: the whale, all of it below the surface/);
    expect(shot(m4.prompt)).not.toMatch(/From left to right across the picture:[^.]*\bwhale\b/);
  });
});

describe("through the dreamer's own eyes", () => {
  test('their hands are in it only where they do something with them, or hold something', () => {
    for (const s of [
      'The dreamer rows the dinghy toward the pier',
      'The dreamer climbs the ladder',
      'The dreamer drives the van down the lane',
      'The dreamer throws the ball',
      'The dreamer eats the cake',
      'you unlock the gate',
      'The dreamer can just reach the shelf',
      'the key in their hand, the dreamer waits',
    ])
      expect([s, handsIn([s], false)]).toEqual([s, true]);
    for (const s of [
      'The gate swings open on its own',
      'The dreamer looks for the cat and finds it gone.',
      'They are close to the edge',
      'Mara folds their arms and looks away',
      'The children open the gate; they run in',
      'The dreamer turns around and sees the dog',
    ])
      expect([s, handsIn([s], false)]).toEqual([s, false]);
    expect(handsIn(['A field under a grey sky'], true)).toBe(true);
  });

  test('looking down at themselves, their own body is what the picture shows', () => {
    expect(selfIn(['The dreamer looks down', 'their own tiny feet and the red shoes'])).toBe(true);
    expect(selfIn(['The dreamer looks for the cat and finds it gone.'])).toBe(false);
  });

  test("every moment of the frozen dreams seen through the dreamer's eyes, as labelled", () => {
    // Labelled by hand from each moment's words (and what the record has the dreamer hold).
    const want: Record<string, 'self' | 'hands' | 'none'> = {
      'affd m3': 'hands', // holds the key
      'affd m6': 'hands', // holds the boat
      'affd m7': 'hands', // the boat in their hand
      'aeea m9': 'hands', // holds the boat
      'b0cb m3': 'none', // the grandfather opens the suitcase
      'b0cb m6': 'hands', // the dreamer opens the door
      '0f40 m2': 'none', // turns and sees Tomas
      '0f40 m4': 'none', // the gate opens on its own
      '0f40 m6': 'hands', // so the dreamer can touch its nose
      '0f40 m7': 'none', // looks for Tomas
      '4c79 m2': 'none', // looks through the window in the door
      '4c79 m7': 'none', // drifts alongside the heron
      '6e80 m8': 'none', // outside the window the city is underwater
      'acfd m5': 'none', // looks down at the city lights
      'acfd m6': 'none', // the bicycle rides up into the jellyfish
      'acfd m7': 'none', // the girl pedals while the dreamer sits behind
      '3cd7 m6': 'none', // sees the gardens from the roof
    };
    const got: Record<string, string> = {};
    for (const { id, r } of sweep())
      for (const p of r.pictures)
        if (p.kind === 'cut' && p.sheet?.rules?.body) got[`${id.slice(-4)} ${p.id}`] = p.sheet.rules.body;
    expect(got).toEqual(want);
  });

  test('no view through their eyes invites their legs or feet, and a gate opening on its own shows none of them', () => {
    const r = rebuilt('dream-0926-070314-0f40', ON);
    expect(picture(r, 'm4').prompt).not.toMatch(/hands, arms or feet/);
    for (const id of ['m4', 'm6', 'm7']) expect(picture(r, id).prompt).not.toMatch(/\b(?:feet|legs)\b/);
  });

  test('someone facing them on the same long seat sits across from them, not beside them', () => {
    const r = rebuilt('dream-0926-043003-b0cb', ON);
    expect(shot(picture(r, 'm3').prompt)).toMatch(/the grandfather, sitting across from the dreamer/);
  });
});

describe('a reverse angle turns the room', () => {
  test('what is now ahead, on the right and behind the camera, from the floor plan and the place', () => {
    const r = rebuilt('dream-0926-043003-b0cb', ON);
    const m2 = picture(r, 'm2');
    expect(m2.sheet?.tags.move).toBe('reverse');
    const s = shot(m2.prompt);
    expect(s).toMatch(
      /The camera has turned round from picture 1[^.]*on the right of the picture, a side wall of the old train, with its windows/,
    );
    for (const sentence of s.split('.')) expect(/window/i.test(sentence) && /\bleft\b/.test(sentence)).toBe(false);
  });

  test('between two side walls, the one the picture before faced is behind the camera, and never named twice', () => {
    const r = rebuilt('dream-0926-055141-6e80', ON);
    const turn = picture(r, 'm2').sheet?.rules?.turn;
    expect(turn?.faced).toBe('the other side wall');
    expect(turn?.out).not.toContain('the other side wall');
  });

  test('across it, the picture before is never the picture edited nor where things stand', () => {
    const earlier = [
      { id: 'm1', kind: 'cut' as const, role: 'composition' as const },
      { id: 'm2', kind: 'cut' as const, role: 'base' as const },
      { id: 'm2', kind: 'cut' as const, role: 'identity' as const },
      { id: 'g1', kind: 'ghost' as const, role: 'prop' as const },
    ];
    expect(notDrawnFrom('reverse', 'm2', earlier)).toEqual(['m2']);
    expect(notDrawnFrom('same_side', 'm2', earlier)).toEqual([]);
  });

  test('a reverse is always within one floor plan, on every frozen dream', () => {
    let n = 0;
    for (const { r } of sweep())
      for (const p of r.pictures.filter((x) => x.kind === 'cut' && x.sheet?.tags.move === 'reverse')) {
        n++;
        expect([p.id, placePlan(r.b, p.id) === placePlan(r.b, p.sheet!.prev ?? '')]).toEqual([p.id, true]);
        expect(p.sheet!.earlier.some((e) => e.id === p.sheet!.prev && ['base', 'composition'].includes(e.role))).toBe(
          false,
        );
      }
    expect(n).toBeGreaterThan(5);
  });
});

describe('how cuts stand to each other, one reading', () => {
  test('the moment after a jump in the same place is that place, not another', () => {
    const ms = [
      { id: 'm1', place: 'l1', distance: 'medium', eyes: 'outside', looks_at: 'the window', shift: '' },
      { id: 'm2', place: 'l1', distance: 'medium', eyes: 'outside', looks_at: 'the window', shift: 'night falls' },
      { id: 'm3', place: 'l1', distance: 'medium', eyes: 'outside', looks_at: 'the window', shift: '' },
    ] as unknown as Moment[];
    expect(relationIn(ms)(ms[2], ms[1])).toBe('other_place');
    expect(relationIn(ms, { camera: true })(ms[2], ms[1])).toBe('same_setup');
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

  test('on every frozen dream the plan settles on its cameras, and the sheet reads the same relations and crossings', () => {
    for (const { id, r } of sweep()) {
      expect([id, unsettled(r.b, r.plan)]).toEqual([id, []]);
      const cams = camerasOf(r.plan);
      const ms = moments(r.b).map((m) => ({ ...m, looks_at: m.looks_at ?? '', shift: m.shift ?? '' }));
      const rel = relationIn(ms, { camera: true, sides: sidesByCamera(r.b, cams), same: sameByCamera(r.b, cams) });
      for (const p of r.pictures.filter((x) => x.kind === 'cut' && x.sheet)) {
        const i = ms.findIndex((m) => m.id === p.id);
        if (i > 0) expect([id, p.id, p.sheet!.relations.toPrev]).toEqual([id, p.id, rel(ms[i], ms[i - 1])]);
        const c = r.plan.cuts.find((x) => x.id === p.id)!;
        expect([id, p.id, p.sheet!.tags.crossed]).toEqual([id, p.id, !!c.crossed]);
        expect(p.sheet!.flags.some((f) => f.startsWith('crossed_line'))).toBe(!!c.crossed);
      }
      const issues = r.plan.issues.filter((x) => /crosses the scene's line/.test(x)).length;
      expect(issues).toBe(r.plan.cuts.filter((c) => c.crossed).length);
    }
  });

  test('an edit stands to other cuts as the picture it edits does', () => {
    const b = dream({
      blocking: {
        indoors: true,
        room: [8, 8],
        spots: [
          { id: 'p1', x: 3, y: 4, kind: 'person', faces: 'p2', pose: 'standing' },
          { id: 'p2', x: 5, y: 4, kind: 'person', faces: 'p1', pose: 'standing' },
        ],
      },
      moments: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3', distance: 'close' }],
    });
    const plan = planned(b);
    expect(cut(plan, 'm2').refs.find((r) => r.id === 'm1')?.role).toBe('base');
    expect(camerasOf(plan).get('m2')).toEqual(cut(plan, 'm1').eye);
  });
});

describe("the scene's line", () => {
  const people = [
    { id: 'p1', x: 3, y: 4, kind: 'person' as const, faces: 'p2', pose: 'standing' as const },
    { id: 'p2', x: 5, y: 4, kind: 'person' as const, faces: 'p1', pose: 'standing' as const },
  ];
  // Which side of the two a camera stands on: toward the front wall or away from it.
  const sideOf = (plan: ReturnType<typeof planContinuity>, id: string, y: number) =>
    Math.sign(cut(plan, id).eye!.at.y - y);

  test('a camera stays on the side the cut before stood on, where it is free to', () => {
    const b = dream({
      blocking: {
        indoors: true,
        room: [8, 8],
        // At the third moment they step toward the front wall: the most room is now on their other side.
        moves: {
          m3: [
            { id: 'p1', x: 3, y: 2.5, faces: 'p2' },
            { id: 'p2', x: 5, y: 2.5, faces: 'p1' },
          ],
        },
        spots: people,
      },
      moments: [{ id: 'm1' }, { id: 'm2', distance: 'close' }, { id: 'm3', distance: 'wide' }],
    });
    const off = withEnv({ DREAMCHAT_CAMERA: undefined }, () => planContinuity(b));
    const on = planned(b);
    expect(sideOf(off, 'm3', 2.5)).not.toBe(sideOf(off, 'm1', 4));
    expect(sideOf(on, 'm2', 4)).toBe(sideOf(on, 'm1', 4));
    expect(sideOf(on, 'm3', 2.5)).toBe(sideOf(on, 'm1', 4));
    expect(on.issues.filter((x) => /crosses/.test(x))).toEqual([]);
  });

  test('crosses where the moment looks past them at what only the other side shows, says so there, and keeps the new side', () => {
    const b = dream({
      blocking: {
        indoors: true,
        room: [8, 8],
        spots: [...people, { id: 'x1', x: 4, y: 7.8, fixture: true, name: 'the old clock', size: [1, 0.3, 2] }],
      },
      moments: [
        { id: 'm1', looks_at: '' },
        { id: 'm2', looks_at: 'the old clock', distance: 'wide' },
        { id: 'm3', looks_at: '', distance: 'close' },
      ],
    });
    const plan = planned(b);
    const s1 = sideOf(plan, 'm1', 4);
    const s2 = sideOf(plan, 'm2', 4);
    if (s1 === s2) {
      // The clock is on the first camera's side of them: nothing to cross for.
      expect(plan.issues.filter((x) => /crosses/.test(x))).toEqual([]);
      return;
    }
    expect(cut(plan, 'm2').crossed).toBe('m1');
    expect(plan.issues).toContain(
      "picture 2 crosses the scene's line from picture 1: it looks past them, at what only that side shows",
    );
    expect(cut(plan, 'm2').rules?.some((l) => /crossed to the other side of them/.test(l))).toBe(true);
    // The picture after keeps the new side, and says nothing of a crossing.
    expect(sideOf(plan, 'm3', 4)).toBe(s2);
    expect(cut(plan, 'm3').crossed).toBeUndefined();
    expect(cut(plan, 'm3').rules?.some((l) => /crossed/.test(l)) ?? false).toBe(false);
  });

  test('two riding one vehicle keep its seats: no side, no crossing, no claim they keep their places', () => {
    const b = dream({
      things: [{ id: 'v1', name: 'the little car' }],
      blocking: {
        indoors: false,
        room: [30, 30],
        spots: [
          { id: 'v1', x: 15, y: 15, kind: 'thing', shape: 'vehicle', size: [3.5, 1.8, 1.4], faces: 'front' },
          { id: 'p1', x: 14.7, y: 15, kind: 'person', pose: 'sitting', faces: 'front' },
          { id: 'p2', x: 15.3, y: 15, kind: 'person', pose: 'sitting', faces: 'front' },
        ],
      },
      moments: [
        { id: 'm1', things: ['v1'], looks_at: 'them in the little car' },
        { id: 'm2', things: ['v1'], looks_at: 'the road ahead', distance: 'wide' },
      ],
    });
    const plan = planned(b);
    expect(plan.cuts.some((c) => c.crossed)).toBe(false);
    for (const c of plan.cuts) expect(c.view ?? '').not.toMatch(/They keep these places/);
  });
});

describe('a vehicle on the move', () => {
  test('goes only where the moment has it going', () => {
    expect(goingIn('They drive the van down the lane', 'the van')).toBe(true);
    expect(goingIn('the sister pedalling, the dreamer on the back', 'the tandem')).toBe(true);
    expect(goingIn('The van slows and stops at the gate', 'the van')).toBe(false);
    expect(goingIn('The sister opens the window of the boathouse', 'the canoe')).toBe(false);
    expect(goingIn('The engine rumbles', 'the van')).toBe(false);
    // A word of going in its own name is no going.
    expect(goingIn('the sister sits in a little rowing boat, calm', 'the rowing boat')).toBe(false);
  });

  const b = (spot: Record<string, unknown>, action: string) =>
    dream({
      things: [{ id: 'v1', name: 'the little car' }],
      blocking: {
        indoors: false,
        room: [30, 30],
        spots: [
          { id: 'v1', x: 15, y: 15, kind: 'thing', shape: 'vehicle', size: [3.5, 1.8, 1.4], ...spot },
          { id: 'p1', x: 14.7, y: 15, kind: 'person', pose: 'sitting' },
          { id: 'p2', x: 15.3, y: 15, kind: 'person', pose: 'sitting' },
        ],
      },
      moments: [{ id: 'm1', things: ['v1'], action, looks_at: 'the little car' }],
    });
  const heading = (x: Breakdown) => (cut(planned(x), 'm1').rules ?? []).filter((l) => /\bis heading\b/.test(l));

  test('its heading is said where it goes and the plan gives its way, and only then', () => {
    expect(heading(b({ faces: 'right' }, 'they drive along the coast road'))).toHaveLength(1);
    expect(heading(b({ faces: 'right' }, 'the little car stops by the sea'))).toEqual([]);
    // No way given: a heading would be made up.
    expect(heading(b({}, 'they drive along the coast road'))).toEqual([]);
  });
});

describe('a cut to the same people at the same size', () => {
  test('moves the camera where an earlier cut has the same one, once the edits run out', () => {
    const b = dream({
      blocking: {
        indoors: true,
        room: [8, 8],
        spots: [
          { id: 'p1', x: 3, y: 4, kind: 'person', faces: 'p2', pose: 'standing' },
          { id: 'p2', x: 5, y: 4, kind: 'person', faces: 'p1', pose: 'standing' },
        ],
      },
      moments: ['m1', 'm2', 'm3', 'm4'].map((id) => ({ id })),
    });
    const off = withEnv({ DREAMCHAT_CAMERA: undefined }, () => planContinuity(b));
    const on = planned(b);
    // Two edits in a row, then drawn afresh: today from the very camera of the first picture.
    expect(cut(on, 'm4').refs.some((r) => r.role === 'base')).toBe(false);
    expect(off.cuts.find((c) => c.id === 'm4')!.eye && sameCameraAs(cut(off, 'm4').eye!, cut(off, 'm1').eye!)).toBe(
      true,
    );
    expect(sameCameraAs(cut(on, 'm4').eye!, cut(on, 'm1').eye!)).toBe(false);
  });

  test('the same camera, as the tree reads it', () => {
    const a = { at: { x: 0, y: 0 }, d: { x: 0, y: 1 }, height: 1.6 };
    expect(sameCameraAs(a, { ...a, at: { x: 0.5, y: 0 } })).toBe(true);
    expect(sameCameraAs(a, { ...a, height: 2.6 })).toBe(false);
    expect(sameCameraAs(a, { ...a, d: { x: 1, y: 1 } })).toBe(false);
  });
});

describe('with the camera rules on, assembleCut still reads the sheet alone', () => {
  test('a copy of each sheet, cut off from everything, assembles the same, and every rule line reaches the prompt', () => {
    for (const { r } of sweep())
      for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
        const s = p.sheet as CutSheet;
        expect(s.rules).toBeDefined();
        const copy = JSON.parse(JSON.stringify(s)) as CutSheet;
        expect(withEnv({ DREAMCHAT_CAMERA: undefined }, () => assembleCut(copy))).toEqual(assembleCut(s));
        expect(assembleCut(s).prompt).toBe(p.prompt);
        for (const l of r.plan.cuts.find((c) => c.id === p.id)?.rules ?? []) expect(p.prompt).toContain(l);
      }
  });
});
