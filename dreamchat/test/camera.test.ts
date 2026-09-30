import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { assembleCut } from '../assemble';
import { type Blocking, facing, settle, type Spot } from '../blocking';
import {
  bodyHeight,
  cameraMode,
  goingIn,
  frontNamesFixture,
  handsIn,
  mountOf,
  mounted,
  openingsIn,
  outThroughWindows,
  sameCameraAs,
  sameView,
  selfIn,
  sideless,
  sidelessNames,
  WATER,
  waterLevel,
} from '../camera';
import {
  camerasOf,
  placePlan,
  planContinuity,
  type RecordPlan,
  relationIn,
  sameByCamera,
  shotPlan,
  sidesByCamera,
  unsettled,
} from '../continuity';
import { type CutSheet, notDrawnFrom } from '../cutsheet';
import { frozenDreams, loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { filling, frontLabel, onOf, outsideShot } from '../previs';
import { type Breakdown, completeViews, type Moment, moments } from '../producer';
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

/** The camera rules on: they need the cut sheet and the story record on. S5's references stay as today (test/refs.test.ts). */
const CAMERA = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on', DREAMCHAT_REFS: undefined };
const ON = CAMERA;
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
    const rec = { DREAMCHAT_RECORD: 'on' };
    withEnv({ ...rec, DREAMCHAT_CAMERA: undefined, DREAMCHAT_CUT_SHEET: 'on' }, () => expect(cameraMode()).toBe('off'));
    withEnv({ ...rec, DREAMCHAT_CAMERA: 'ON ', DREAMCHAT_CUT_SHEET: 'on' }, () => expect(cameraMode()).toBe('on'));
    withEnv({ ...rec, DREAMCHAT_CAMERA: 'yes', DREAMCHAT_CUT_SHEET: 'on' }, () => expect(cameraMode()).toBe('off'));
    for (const sheet of [undefined, 'off', 'shadow'])
      withEnv({ ...rec, DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: sheet }, () => expect(cameraMode()).toBe('off'));
  });

  test('is off without the story record, which it reads the dream from', () => {
    withEnv({ DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' }, () =>
      expect(cameraMode()).toBe('on'),
    );
    for (const record of [undefined, 'off', 'shadow'])
      withEnv({ DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: record }, () =>
        expect(cameraMode()).toBe('off'),
      );
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
      { id: 't2', x: 3.3, y: 0.05, kind: 'thing', name: 'the kite' },
      { id: 't3', x: 0.05, y: 2, kind: 'thing', name: 'the umbrella stand' },
      { id: 'p1', x: 2.5, y: 1, kind: 'person', pose: 'standing' },
    ],
  };

  test('is what stands in the wall where a window is, or past it; what stands in the room at a window stays', () => {
    // The kite is in the wall's line at the window; the telescope a step into the room; the umbrella
    // stand against a wall with no window.
    expect(outThroughWindows(plan)).toEqual({ t2: 'front' });
    expect(outThroughWindows({ ...plan, spots: plan.spots.map((s) => (s.id === 't2' ? { ...s, y: -1 } : s)) })).toEqual(
      { t2: 'front' },
    );
    expect(outThroughWindows({ ...plan, indoors: false })).toEqual({});
  });

  test('a moment looking out of the window through the telescope leaves the telescope in the room, then and after', () => {
    const b = dream({
      things: [
        { id: 't1', name: 'the telescope' },
        { id: 't2', name: 'the kite' },
      ],
      blocking: plan,
      moments: [
        { id: 'm1', visible: ['p1'], things: ['t1'], action: 'she looks out of the window through the telescope' },
        { id: 'm2', visible: ['p1'], things: ['t1', 't2'], distance: 'close', action: 'she turns the telescope' },
      ],
    });
    for (const id of ['m1', 'm2']) {
      const at = withEnv(CAMERA, () => shotPlan(b, id));
      expect(at?.spots.some((s) => s.id === 't1')).toBe(true);
      expect(at?.outside).toEqual({ t2: 'front' });
    }
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
      { id: 'x5', x: 12, y: 3, fixture: true, name: 'the gangway', shape: 'ground' },
      { id: 'b1', x: 5, y: 5, shape: 'vehicle', name: 'the dinghy', size: [2, 1, 0.6] },
    ],
  };
  const open: Blocking = { ...room, indoors: false, ceiling: undefined };

  test('by the first thing its words measure it by, never where it comes in from or where it lies', () => {
    expect(waterLevel('seeping in under the doors, rising over the counters', room)).toBe(1.2);
    expect(waterLevel('almost up to the tall arched window', room)).toBe(1.8);
    expect(waterLevel('almost to the ceiling', room)).toBe(3.8);
    expect(waterLevel('lapping over the floor', room)).toBe(0.1);
    expect(waterLevel('up to their knees', room)).toBe(0.5);
    expect(waterLevel('knee-deep', room)).toBe(0.5);
    // Covering a thing is over it; between things, or in a gangway, is where it lies, not how high.
    expect(waterLevel('covering the counters', room)).toBe(1.2);
    expect(waterLevel('pooling between the bookcases, just over the counters', room)).toBe(1.2);
    expect(waterLevel('filling the gangway, up to their knees', room)).toBe(0.5);
  });

  test('deep or filling the place without a measure is unmeasured, never a thin layer', () => {
    for (const w of [
      'deep enough to swim in',
      'the whole hall is flooded',
      'filling the hall, deep enough to paddle the dinghy',
      'the floor is flooded',
      'the cellar is submerged',
    ])
      expect([w, waterLevel(w, room)]).toEqual([w, null]);
    // The floor or the ground, where nothing else measures it and nothing says it is deep: a thin layer.
    expect(waterLevel('a film of water on the floor', room)).toBe(0.1);
  });

  test('a body or a thing it reaches measures it before a floor does; spread across the floor to a thing, it is still low', () => {
    expect(waterLevel('the floor of the hall is flooded, water up to their waists', room)).toBe(1);
    expect(waterLevel('covering the floor and up to the bookcases', room)).toBe(0.1);
    expect(waterLevel('over the tops of the bookcases', room)).toBe(2.7);
  });

  test('outdoors there is no ceiling, and what floats on it is no measure', () => {
    expect(waterLevel('the roof fills with water around the dinghy', open)).toBeNull();
    expect(waterLevel('water fills the roof', open)).toBeNull();
    expect(waterLevel('the sea laps at the dinghy', open)).toBeNull();
    expect(waterLevel('up to their chests', open)).toBe(1.3);
    // In a room, the roof is its top.
    expect(waterLevel('almost up to the roof', room)).toBe(3.8);
  });

  test('where the record says water stands without measuring it, as high as it last did in this place', () => {
    const b = dream({
      people: ['p1'],
      things: [{ id: 'b1', name: 'the dinghy' }],
      blocking: { ...room, spots: [...room.spots, { id: 'p1', x: 5, y: 5, kind: 'person', pose: 'sitting' }] },
      moments: [
        { id: 'm1', visible: ['p1'], things: ['b1'] },
        { id: 'm2', visible: ['p1'], things: ['b1'] },
        { id: 'm3', visible: ['p1'], things: ['b1'] },
        { id: 'm4', visible: ['p1'], things: ['b1'] },
      ],
    });
    const water = (now: string) => [
      {
        of: 'l1',
        called: 'the place',
        name: 'the place',
        kind: 'place',
        facts: [{ kind: 'part', part: 'water', what: 'water', now }],
      },
    ];
    const at = (facts: unknown[]) => ({
      own: [],
      carried: [],
      visible: ['p1'],
      things: ['b1'],
      present: [],
      gone: [],
      held: {},
      now: [],
      facts,
    });
    const rec = {
      moments: {
        m1: at(water('up to their knees')),
        m2: at(water('flooded, deep enough to paddle the dinghy')),
        m3: at(water('over the counters')),
        m4: at([]),
      },
      before: {},
      ends: {},
      unsaid: {},
    } as unknown as RecordPlan;
    const level = (id: string) => withEnv(CAMERA, () => shotPlan(b, id, rec))?.water;
    expect([level('m1'), level('m2'), level('m3'), level('m4')]).toEqual([0.5, 0.5, 1.2, undefined]);
  });

  test('every water level read on the frozen dreams, as labelled, and every reading of what their moments imply', () => {
    // Every water the frozen dreams' records carry, labelled by hand from its words and floor plan.
    const want: Record<string, number | null> = {
      'fdd7 m2': 0.95, // coming in under the doors, rising over the desks
      '6081 m2': null, // water starts coming under the doors
      '6081 m3': 1, // rises over the desks
      '6e80 m1': 0.1, // beginning to cover the floor
      '6e80 m3': 1, // up over the tops of the desks
      '538d m6': null, // fills the roof (outdoors): unmeasured
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
    // these dreams (by Claude, 27 Sep, and by DeepSeek before), labelled against the same floor plans. The
    // plan caps a level a boat rides at so its riders sit under the ceiling (continuity.ts).
    const implied: [string, string, number | null][] = [
      [
        'fdd7 m4',
        'very deep, over the desks and far up the shelves, the aisles flooded deep enough for a whale beneath a boat',
        0.95,
      ],
      ['fdd7 m5', 'almost up to the ceiling, over the desks and shelves, up to the high round window', 5.8],
      ['fdd7 m5', 'almost up to the high round window, over the desks and shelves', 1.8],
      ['6081 m5', 'deep enough to float a rowing boat, well over the desks', 1],
      [
        '6081 m8',
        'very deep, far over the desks, filling the aisles between the shelves deep enough to hide a whale below the surface',
        1,
      ],
      ['6081 m9', 'almost up to the ceiling, over the desks and shelves', 3.8],
      ['6e80 m2', 'covering the floor and up to the shelves', 0.1],
      ['6e80 m6', 'deep enough to fill the aisles between the shelves, far over the tops of the desks', 1],
      ['6e80 m7', 'almost up to the ceiling, over the desks and shelves, up to the high round window', 5.8],
      ['8ceb m1', 'filling the corridor from floor to ceiling', 2.9],
      ['8ceb m1', 'deep enough to swim, the school is flooded', null],
    ];
    for (const [k, words, v] of implied) expect([k, words, waterLevel(words, plans[k])]).toEqual([k, words, v]);
  });

  test('a boat afloat rides on it, whoever is in it rises with it, and what is in the water is said to be', () => {
    const r = rebuilt('dream-0926-050424-fdd7', ON);
    const m4 = picture(r, 'm4');
    expect(withEnv(ON, () => shotPlan(r.b, 'm4', r.rec))?.water).toBeGreaterThan(0.5);
    // Without what the moments imply, the record measures the water over the desks, about a metre, and the
    // whale, so big it fills the aisle, was in it beside the boat, its back out of it. The moment's own words
    // put it under the water ("a whale swims past under the water"), so the water covers it, under the boat,
    // whether or not a reading of the moments remembers the whale (6e80 m6's did not, 30 Sep).
    expect(m4.prompt).toMatch(
      /Under the water[^.]*beneath the yellow rowing boat: the whale, all of it below the surface/,
    );
    expect(m4.prompt).not.toMatch(/too big for the water to cover/);
    // The camera is at the eyes of the two in the boat, the whale under it no part of that: averaged with the
    // whale lying on the floor, it stood a metre below them, "at the height of their eyes".
    const water = withEnv(ON, () => shotPlan(r.b, 'm4', r.rec))!.water!;
    expect(m4.item.frame?.plan?.eye?.height).toBeCloseTo(water - 0.15 + 1.2, 2);
    expect(shot(m4.prompt)).not.toMatch(/From left to right across the picture:[^.]*\bwhale\b/);
  });
});

describe("through the dreamer's own eyes", () => {
  test('what they carry is out of the picture unless the moment names it', () => {
    // Looking out of the window at the tractor, the paper boat they carry was put in their hands before their
    // eyes, a boat the moment never names (the owner, S4 picture check, 27 Sep): off the plan and the mock-up,
    // out of "In it" and the images, and no hands for it.
    const fresh = rebuilt('dream-0926-022102-aeea', ON);
    const m9 = picture(fresh, 'm9');
    expect(m9.item.frame?.plan?.carriedUnseen).toEqual(['t2']);
    expect(withEnv(ON, () => shotPlan(fresh.b, 'm9', fresh.rec))!.spots.some((s) => s.id === 't2')).toBe(false);
    expect(m9.prompt).not.toMatch(/\bpaper boat\b/);
    expect(m9.references.some((r) => r.media_id === 'sketch-t2')).toBe(false);
    expect(m9.prompt).toMatch(/nothing of the dreamer's own body shows, not even their hands/);
    // Named ("the boat in their hand"), it stays in their hands.
    const first = rebuilt('dream-0925-231131-affd', ON);
    const m7 = picture(first, 'm7');
    expect(m7.item.frame?.plan?.carriedUnseen).toBeUndefined();
    expect(m7.prompt).toMatch(/Nearest, close, in the middle of the picture: the boat, in the dreamer's hands/);
    expect(m7.references.some((r) => r.media_id === 'sketch-t2')).toBe(true);
    // Without the camera rules, as before.
    const off = rebuilt('dream-0926-022102-aeea', { ...ON, DREAMCHAT_CAMERA: undefined });
    expect(picture(off, 'm9').item.frame?.plan?.carriedUnseen).toBeUndefined();
  });

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
      // Written for these tests, none from the dreams or their reviews:
      'the dreamer and her cousin paddle the canoe to the jetty',
      'you grip the rail as the ferry lurches',
      'the dreamer is at the wheel of the old bus',
      'the dreamer hands over the ticket',
      'the dreamer takes the lantern from the hook',
    ])
      expect([s, handsIn([s], false)]).toEqual([s, true]);
    for (const s of [
      'The gate swings open on its own',
      'The dreamer looks for the cat and finds it gone.',
      'They are close to the edge',
      'Mara folds their arms and looks away',
      'The children open the gate; they run in',
      'The dreamer turns around and sees the dog',
      'the dreamer holds their breath under the water',
      'the dreamer takes a step back from the ledge',
      'the dreamer watches the hands of the station clock',
      'you turn the corner into the covered market',
      'the dreamer sees their own reflection in the shop window',
      'the dreamer holds still while the owl lands',
    ])
      expect([s, handsIn([s], false)]).toEqual([s, false]);
    expect(handsIn(['A field under a grey sky'], true)).toBe(true);
  });

  test('looking down at themselves, their own body is what the picture shows', () => {
    expect(selfIn(['The dreamer looks down', 'their own tiny feet and the red shoes'])).toBe(true);
    expect(selfIn(['The dreamer looks for the cat and finds it gone.'])).toBe(false);
    // A reflection is a picture of them, not their body seen from their eyes.
    expect(selfIn(['the dreamer sees their own reflection in the shop window'])).toBe(false);
  });

  test("every moment of the frozen dreams seen through the dreamer's eyes, as labelled", () => {
    // Labelled by hand from each moment's words (and what the record has the dreamer hold, where the words name it).
    const want: Record<string, 'self' | 'hands' | 'none'> = {
      // What they carry and the moment does not name is out of the picture, no hands for it (the owner, 27 Sep).
      'affd m3': 'none', // carries the key; the stairs wind up
      'affd m6': 'none', // carries the boat; looks out of the window
      'affd m7': 'hands', // the boat in their hand
      'aeea m9': 'none', // carries the boat; looks out of the window
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

describe('where the camera stands, in words', () => {
  test('is said as each one in the picture is turned to it', () => {
    // A pair facing each other with the camera along their line: one's back to it, the other facing it.
    const train = rebuilt('dream-0926-043003-b0cb', ON);
    expect(shot(picture(train, 'm1').prompt)).toMatch(
      /^[^:]*: Seen from behind the grandfather, as the grandfather faces the dreamer,/,
    );
    // Facing a thing, their back to the camera.
    const heron = rebuilt('dream-0926-083656-8ceb', ON);
    expect(shot(picture(heron, 'm4').prompt)).toMatch(/Seen from behind Mr Hale, as Mr Hale faces the board,/);
    // Two in profile are seen from beside them, never from behind.
    const library = rebuilt('dream-0926-052843-6081', ON);
    const m5 = shot(picture(library, 'm5').prompt);
    expect(m5).toMatch(/Seen from beside them,/);
    expect(m5).not.toMatch(/Seen from behind them/);
    // Over someone's shoulder only where their back is to the camera (classroom m3: the dreamer turned toward it).
    const classroom = shot(picture(rebuilt('dream-0926-012307-4c79', ON), 'm3').prompt);
    expect(classroom).toMatch(/^[^:]*: Seen from beside them,/);
    expect(classroom).not.toMatch(/over their shoulder/);
  });
});

describe('what hides what', () => {
  test('two that hide parts of each other are said once: the one behind is hidden behind the other', () => {
    // The father and the table were each "partly hidden behind" the other (the read of every frozen prompt, 30 Sep).
    const mutual: string[] = [];
    for (const { id, r } of sweep())
      for (const p of r.pictures) {
        if (p.kind !== 'cut') continue;
        const pairs = new Set<string>();
        for (const sentence of shot(p.prompt).split(/(?<=[.;:])\s+/)) {
          const m = sentence.match(/^(?:then )?(.+?), .*partly hidden behind (.+?)[.;]?$/);
          if (m) pairs.add(`${m[1]}|${m[2]}`);
        }
        for (const x of pairs) {
          const [a, b] = x.split('|');
          if (a < b && pairs.has(`${b}|${a}`)) mutual.push(`${id.slice(-4)} ${p.id}: ${a} and ${b}`);
        }
      }
    expect(mutual).toEqual([]);
    const m7 = shot(picture(rebuilt('dream-0926-022102-aeea', ON), 'm7').prompt);
    expect(m7).toMatch(/partly hidden behind the table/);
    expect(m7).not.toMatch(/the table[^.;]*partly hidden behind the father/);
  });
});

describe('an edit', () => {
  test('keeps the places of the picture it edits: it is given no order of its own', () => {
    // a44a m3 edits picture 2 (the grandfather on the left, the dreamer on the right); said "from in front of them"
    // from the floor plan, its own order was the mirror of it (the read of every frozen prompt, 30 Sep).
    const r = rebuilt('dream-0926-062232-a44a', ON);
    const m3 = picture(r, 'm3');
    expect(m3.references[0].media_id).toBe('picture-m2');
    expect(m3.prompt).not.toMatch(/left to right/);
    // Without the camera rules, as before.
    const off = rebuilt('dream-0926-062232-a44a', { ...ON, DREAMCHAT_CAMERA: undefined });
    expect(picture(off, 'm3').prompt).toMatch(/left to right/);
  });

  test('shows the same people as the picture it edits, so nobody in it needs a place of its own', () => {
    // An earlier picture stays the one edited only where the same people are in view (continuity.ts sameCast): with
    // anyone coming in or going, the moment gets its own camera. So an edit, given no order, leaves nobody unplaced.
    const edits: string[] = [];
    for (const { id, r } of sweep())
      for (const p of r.pictures) {
        const base =
          p.kind === 'cut' ? p.item.frame?.plan?.refs.find((x) => x.role === 'base' && x.kind === 'cut') : undefined;
        if (!base) continue;
        const moments = r.b.scenes.flatMap((sc) => sc.moments);
        const who = (mid: string) => [...(moments.find((m) => m.id === mid)?.visible ?? [])].sort();
        edits.push(`${id.slice(-4)} ${p.id}`);
        expect([p.id, who(p.id)]).toEqual([p.id, who(base.id)]);
      }
    expect(edits.length).toBeGreaterThan(0);
  });
});

describe('two on a bicycle', () => {
  test('ride one behind the other, on it, never in it', () => {
    // Two on one bicycle were sat side by side, as on a bench, and through the dreamer's eyes they were "in" it,
    // framed by "the inside of the old red bicycle … its window" (the read of every frozen prompt, 30 Sep).
    const r = rebuilt('dream-0926-095122-acfd', ON);
    const plan = withEnv(ON, () => shotPlan(r.b, 'm3', r.rec))!;
    const bike = plan.spots.find((s) => s.shape === 'vehicle')!;
    const [a, b] = plan.spots.filter((s) => s.kind === 'person' && !s.many);
    const f = facing(bike, plan);
    const gap = { x: b.x - a.x, y: b.y - a.y };
    expect(bike.size![0]).toBeLessThan(1);
    expect(Math.hypot(gap.x, gap.y)).toBeGreaterThan(0.5);
    // Along its length: the gap between them is the way it faces, not across it.
    expect(Math.abs(gap.x * f.y - gap.y * f.x)).toBeLessThan(0.05);
    const m7 = picture(r, 'm7').prompt;
    expect(m7).toMatch(/The camera is the dreamer's eyes, on the old red bicycle/);
    expect(m7).not.toMatch(/inside of the old red bicycle|its window/);
    // Without the camera rules, as before.
    const off = rebuilt('dream-0926-095122-acfd', { ...ON, DREAMCHAT_CAMERA: undefined });
    expect(picture(off, 'm7').prompt).toMatch(/in the old red bicycle/);
  });

  test('sit along the way it faces, whichever way that is', () => {
    const plan: Blocking = {
      front: 'the road',
      spots: [
        {
          id: 'b1',
          x: 5,
          y: 5,
          kind: 'thing',
          shape: 'vehicle',
          size: [0.6, 1.8, 1.1],
          faces: 'left',
          name: 'the bicycle',
        },
        { id: 'p1', x: 5, y: 5, kind: 'person', pose: 'sitting' },
        { id: 'p2', x: 5, y: 5, kind: 'person', pose: 'sitting' },
      ],
    };
    const settled = settle(plan, { tandem: true });
    const [a, b] = settled.spots.filter((s) => s.kind === 'person');
    const f = facing(settled.spots[0], settled);
    expect(Math.abs((b.x - a.x) * f.y - (b.y - a.y) * f.x)).toBeLessThan(1e-6);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.6, 5);
    // Without it, side by side across it, as before.
    const [c, d] = settle(plan).spots.filter((s) => s.kind === 'person');
    expect(Math.abs((d.x - c.x) * f.x + (d.y - c.y) * f.y)).toBeLessThan(1e-6);
  });
});

describe('a name gives no side of the room', () => {
  test('said from a camera facing the other way, "shelves on the right" was at the picture\'s left edge', () => {
    expect(sideless('bookshelf right')).toBe('bookshelf');
    expect(sideless('the left door')).toBe('the door');
    expect(sideless('shelves on the left')).toBe('shelves');
    expect(sideless('the left-hand window')).toBe('the window');
    // A side of something else, or a name that is only a side, is kept.
    expect(sideless('the wall to the left of the door')).toBe('the wall to the left of the door');
    expect(sideless('the right side')).toBe('the right side');
    expect(sideless('the lift gate')).toBe('the lift gate');
    // Two that would share a name are told apart: that name and "the other" one; three or more keep their names.
    const names = (ns: string[]) => sidelessNames(ns.map((name) => ({ name }))).map((x) => x.name);
    expect(names(['the left seat', 'the right seat'])).toEqual(['the seat', 'the other seat']);
    expect(names(['the left window', 'the window'])).toEqual(['the other window', 'the window']);
    expect(names(['the left lamp', 'the middle lamp', 'the right lamp', 'the lamp'])).toEqual([
      'the left lamp',
      'the middle lamp',
      'the right lamp',
      'the lamp',
    ]);
    const m2 = shot(picture(rebuilt('dream-0926-055141-6e80', ON), 'm2').prompt);
    expect(m2).not.toMatch(/shelves on the (?:left|right)/);
    const off = shot(picture(rebuilt('dream-0926-055141-6e80', { ...ON, DREAMCHAT_CAMERA: undefined }), 'm2').prompt);
    expect(off).toMatch(/shelves on the (?:left|right)/);
  });
});

describe('a creature or a child at their own size', () => {
  test('a terrier is drawn low beside a grown-up, and seen whole, never from the knees up', () => {
    // The mock-up drew every one of the dream's people and creatures as a grown-up: the terrier as tall as the
    // dreamer, the white horse as a standing person (the read of every frozen prompt, 30 Sep). Where a reading of the
    // dream gives a body and a height, it is drawn so.
    const plan = (dog: Partial<Spot>): Blocking => ({
      front: 'the sea',
      spots: [
        { id: 'p1', x: 5, y: 5, kind: 'person', faces: 'front' },
        { id: 'p2', x: 6, y: 5, kind: 'person', faces: 'front', ...dog },
      ],
    });
    const words = (dog: Partial<Spot>) =>
      withEnv(ON, () =>
        outsideShot(plan(dog), ['p1', 'p2'], 'wide', (id) => ({ p1: 'the dreamer', p2: 'the dog' })[id] ?? id),
      )!.text;
    const small = words({ body: 'four-legged', height: 0.4 });
    const dog = small.match(/the dog, [^;.]*/)![0];
    expect(dog).toMatch(/seen whole/);
    expect(dog).not.toMatch(/knees|waist|shoulders/);
    // Lower in the picture than the grown-up beside it.
    const top = (text: string, who: string) => {
      const m = text.match(new RegExp(`${who}, [^;.]*filling the picture (?:from|around) ([a-z ]+?)(?: to |[;.]|$)`));
      return m?.[1] ?? '';
    };
    expect(top(small, 'the dog')).not.toBe(top(small, 'the dreamer'));
    // A six-year-old is cut where their own body is: a head lower than a grown-up's.
    expect(words({ body: 'human', height: 1.15 })).toMatch(/the dog, [^;.]*seen whole/);
    // Without a reading of it, as before: a person's shape at a person's size.
    expect(words({})).toBe(
      withEnv(ON, () =>
        outsideShot(plan({}), ['p1', 'p2'], 'wide', (id) => ({ p1: 'the dreamer', p2: 'the dog' })[id] ?? id),
      )!.text,
    );
    expect(words({ height: 2 })).toBe(words({}));
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
        // The flag names the cut crossed from, as the plan does: not always the cut before.
        expect([id, p.id, p.sheet!.flags.filter((f) => f.startsWith('crossed_line'))]).toEqual([
          id,
          p.id,
          c.crossed ? [`crossed_line:${c.crossed}`] : [],
        ]);
        expect([id, p.id, p.sheet!.flags.filter((f) => f.startsWith('same_camera'))]).toEqual([
          id,
          p.id,
          c.sameCamera ? [`same_camera:${c.sameCamera}`] : [],
        ]);
      }
      // A deliberate crossing is never an issue the checks before drawing would act on.
      expect([id, r.plan.issues.filter((x) => /cross|same camera/.test(x))]).toEqual([id, []]);
    }
  });

  test('a same setup is the same camera: words calling it one, with its own camera elsewhere, are not an edit', () => {
    // The two talk facing each other; the second moment looks at the clock on the wall behind the first
    // camera, and the words call it the same view.
    const b = dream({
      blocking: {
        indoors: true,
        room: [8, 8],
        spots: [
          { id: 'p1', x: 3, y: 4, kind: 'person', faces: 'p2', pose: 'standing' },
          { id: 'p2', x: 5, y: 4, kind: 'person', faces: 'p1', pose: 'standing' },
          { id: 'x1', x: 4, y: 0.2, fixture: true, name: 'the station clock', size: [1, 0.3, 1] },
        ],
      },
      moments: [{ id: 'm1' }, { id: 'm2', looks_at: 'the station clock', sameSide: ['m1'] }],
    });
    // Today, by the words alone.
    const off = withEnv({ DREAMCHAT_CAMERA: undefined, DREAMCHAT_REFS: undefined }, () => planContinuity(b));
    expect(cut(off, 'm2').refs.find((r) => r.id === 'm1')?.role).toBe('base');
    // With S5's references, even without the camera rules: m2's own camera (facing the clock, behind m1's) is not
    // m1's, so the gate does not edit m1, and m2 is placed with a camera of its own (so a mock-up of its own).
    const refs = withEnv({ DREAMCHAT_CAMERA: undefined, DREAMCHAT_REFS: 'on', DREAMCHAT_CUT_SHEET: 'on' }, () =>
      planContinuity(b),
    );
    expect(cut(refs, 'm2').refs.some((r) => r.role === 'base')).toBe(false);
    expect(cut(refs, 'm2').eye).toBeTruthy();
    const on = planned(b);
    expect(cut(on, 'm2').refs.some((r) => r.role === 'base')).toBe(false);
    expect(sameCameraAs(cut(on, 'm2').eye!, cut(on, 'm1').eye!)).toBe(false);
    expect(unsettled(b, on)).toEqual([]);
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
    // The clock hangs on the wall behind the first camera: only from their other side is it in the picture.
    const b = dream({
      blocking: {
        indoors: true,
        room: [8, 8],
        spots: [...people, { id: 'x1', x: 4, y: 0.2, fixture: true, name: 'the station clock', size: [1, 0.3, 1] }],
      },
      moments: [
        { id: 'm1', looks_at: '' },
        { id: 'm2', looks_at: 'the station clock', distance: 'wide' },
        { id: 'm3', looks_at: '', distance: 'close' },
      ],
    });
    const plan = planned(b);
    expect(sideOf(plan, 'm2', 4)).not.toBe(sideOf(plan, 'm1', 4));
    expect(cut(plan, 'm2').crossed).toBe('m1');
    expect(cut(plan, 'm2').crossedWhy).toBe('looks');
    expect(cut(plan, 'm2').rules?.some((l) => /crossed to the other side of them/.test(l))).toBe(true);
    // Deliberate: said in the picture's words, never an issue for the checks before drawing.
    expect(plan.issues.filter((x) => /cross/.test(x))).toEqual([]);
    // The picture after keeps the new side, and says nothing of a crossing.
    expect(sideOf(plan, 'm3', 4)).toBe(sideOf(plan, 'm2', 4));
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
    // Written for these tests: going itself, or driven, and only the vehicle the words move.
    expect(goingIn('the tram rumbles down the hill', 'the tram')).toBe(true);
    expect(goingIn('a taxi rushes past the stall', 'the taxi')).toBe(true);
    expect(goingIn('they paddle the kayak across the bay', 'the kayak')).toBe(true);
    expect(goingIn('he rides his scooter past the old van', 'the scooter')).toBe(true);
    expect(goingIn('he rides his scooter past the old van', 'the old van')).toBe(false);
    expect(goingIn('she rides her bike to school', 'the old van', ['the bike'])).toBe(false);
    expect(goingIn('the ferry sits still at the pier', 'the ferry')).toBe(false);
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

describe('a brief written for a view', () => {
  test('still serves it where the rules only took out a claim that was untrue', () => {
    const was =
      'Seen from behind them. From left to right: a; then b. Nobody else is in the picture. They keep these places in every picture of this scene. Also: c.';
    const now = 'Seen from behind them. From left to right: a; then b. Also: c.';
    withEnv(CAMERA, () => {
      expect(sameView(was, now)).toBe(true);
      expect(sameView(was, now.replace('a; then b', 'b; then a'))).toBe(false);
    });
    withEnv({ DREAMCHAT_CAMERA: undefined }, () => expect(sameView(was, now)).toBe(false));
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

// ── the S4 picture check's dry run (27 Sep): its faults, each in a small dream of its own ─────────────

/** A pool hall, a dinghy afloat on waist-deep water with two in it, and a creature in the water beside it. */
function poolDream(creatureLook: string, opts: { standing?: boolean; moved?: 'back' | 'front' } = {}) {
  const b = dream({
    people: ['p1', 'p2', 'p3'],
    things: [{ id: 'b1', name: 'the dinghy' }],
    blocking: {
      indoors: true,
      ceiling: 5,
      room: [12, 10],
      spots: [
        { id: 'b1', x: 6, y: 6, kind: 'thing', shape: 'vehicle', size: [3, 1.4, 0.6] },
        { id: 'p1', x: 5.6, y: 6, kind: 'person', pose: 'sitting', faces: 'front' },
        { id: 'p2', x: 6.4, y: 6, kind: 'person', pose: opts.standing ? 'standing' : 'sitting', faces: 'front' },
        { id: 'p3', x: 7, y: 4.5, kind: 'person', pose: 'lying', faces: 'left' },
      ],
      // The dinghy moves back up the hall, or on toward its front, while the two in it face the front.
      ...(opts.moved
        ? {
            moves: {
              m2: [
                { id: 'b1', x: 6, y: opts.moved === 'back' ? 8 : 4 },
                { id: 'p1', x: 5.6, y: opts.moved === 'back' ? 8 : 4, faces: 'front', pose: 'sitting' as const },
                { id: 'p2', x: 6.4, y: opts.moved === 'back' ? 8 : 4, faces: 'front', pose: 'sitting' as const },
              ],
            },
          }
        : {}),
    },
    moments: [
      {
        id: 'm1',
        visible: ['p1', 'p2', 'p3'],
        things: ['b1'],
        distance: 'wide',
        action: 'a seal glides by in the water',
      },
      {
        id: 'm2',
        visible: ['p1', 'p2', 'p3'],
        things: ['b1'],
        distance: 'wide',
        action: 'they paddle the dinghy across the hall',
      },
    ],
  });
  const seal = b.people.find((p) => p.id === 'p3')!;
  seal.name = 'the seal';
  seal.fields = {
    identity: { value: 'a seal', said: true },
    appearance: { value: creatureLook, said: true },
    wardrobe: { value: null, said: false },
    distinctive_features: { value: null, said: false },
  };
  const at = () => ({
    own: [],
    carried: [],
    visible: ['p1', 'p2', 'p3'],
    things: ['b1'],
    present: [],
    gone: [],
    held: {},
    now: [],
    facts: [
      {
        of: 'l1',
        called: 'the place',
        name: 'the place',
        kind: 'place',
        facts: [{ kind: 'part', part: 'water', what: 'water', now: 'waist-deep' }],
      },
    ],
  });
  const rec = { moments: { m1: at(), m2: at() }, before: {}, ends: {}, unsaid: {} } as unknown as RecordPlan;
  return { b, rec };
}

describe('the water covers only what it is deep enough to cover', () => {
  test('a creature whose look says it is far bigger than a person is in the water beside the boat, not under it', () => {
    const big = poolDream('enormous, longer than the dinghy');
    const rules = (x: ReturnType<typeof poolDream>) =>
      (withEnv(CAMERA, () => planContinuity(x.b, x.rec)).cuts.find((c) => c.id === 'm1')?.rules ?? []).join(' ');
    expect(rules(big)).toMatch(
      /In the water[^.]*: the seal, too big for the water to cover, part of it above the surface\./,
    );
    expect(rules(big)).not.toMatch(/the seal, all of it below the surface/);
    expect(rules(big)).not.toMatch(/beneath the dinghy: the seal/);
    // Its look says nothing of its size: a figure lying in waist-deep water is under it, as before.
    const small = poolDream('sleek and grey, with dark spots');
    expect(rules(small)).toMatch(/Under the water[^.]*: the seal, all of it below the surface\./);
  });

  test('how high a body stands, read from its look', () => {
    expect(bodyHeight('huge, about 60 feet long')).toBeCloseTo(3.66, 2);
    expect(bodyHeight('very big, fills the whole hall')).toBe(2);
    expect(bodyHeight('a giant tortoise, mossy shell')).toBe(2);
    expect(bodyHeight('about 3 metres tall, thin')).toBe(3);
    // Big eyes are not a big body; a tall bird is no measure; nothing said is nothing.
    expect(bodyHeight('a tabby cat with huge green eyes')).toBeNull();
    expect(bodyHeight('tall grey heron')).toBeNull();
    expect(bodyHeight('small brown terrier')).toBeNull();
  });

  test('its level is the highest the words measure it by, and a creature it is deep enough for is under it', () => {
    const room: Blocking = {
      front: 'the doors',
      indoors: true,
      ceiling: 4,
      room: [20, 12],
      spots: [
        { id: 'x3', x: 8, y: 6, fixture: true, name: 'counter with a till', size: [1.2, 0.8, 1] },
        { id: 'x4', x: 3, y: 3, fixture: true, name: 'the bookcases', size: [1, 3, 2.5] },
      ],
    };
    // Over the counters and on up the bookcases stands as high as the bookcases.
    expect(waterLevel('over the counters and far up the bookcases', room)).toBe(2.5);
    // Named for what stands in it, a later thing is no measure.
    expect(waterLevel('over the counters, and the bookcases stand in it', room)).toBe(1.2);
    // Said deep enough for a creature of the dream: over its back.
    const walrus = [{ name: 'the walrus', height: 1.6 }];
    expect(waterLevel('far over the counters, deep enough to hide a walrus below the surface', room, walrus)).toBe(1.8);
    expect(waterLevel('far over the counters, deep enough to hide a walrus below the surface', room)).toBe(1.2);
    // A creature named but not as what it is deep enough for measures nothing.
    expect(waterLevel('over the counters, where the walrus lies', room, walrus)).toBe(1.2);
    // Put under the water by the moment's own words, where the record measures it by the things in the place:
    // over its back.
    const told = (t: string) => waterLevel('far over the counters', room, walrus, t);
    expect(told('she rows past, and a walrus swims under the water')).toBe(1.8);
    expect(told('the walrus glides past underwater')).toBe(1.8);
    // Only the clause that names it, and only it: someone else under the water is not it.
    expect(told('the walrus turns, and she swims under the water')).toBe(1.2);
    expect(told('the walrus watches the diver swim under the water')).toBe(1.2);
    expect(told('the walrus watches as she swims under the water')).toBe(1.2);
    expect(told('she dives under the water beside the walrus')).toBe(1.2);
    // Not coming up from under it, nor a creature of no known size.
    expect(told('the walrus rises from under the water')).toBe(1.2);
    expect(waterLevel('far over the counters', room, [], 'a walrus swims under the water')).toBe(1.2);
    // Never above a measure on a body, never where nothing measures it, never higher than the room lets it.
    expect(waterLevel('ankle-deep over the floor', room, walrus, 'a walrus swims under the water')).toBe(0.12);
    expect(waterLevel('the aisles are flooded', room, walrus, 'a walrus swims under the water')).toBeNull();
    const whale = [{ name: 'the whale', height: 5 }];
    expect(waterLevel('far over the counters', room, whale, 'the whale is underwater')).toBe(3.9);
  });

  test('someone standing where a boat is afloat stands in it; on a dry floor, beside it', () => {
    const { b, rec } = poolDream('sleek and grey', { standing: true });
    const wet = withEnv(CAMERA, () => shotPlan(b, 'm1', rec))!;
    const standing = wet.spots.find((s) => s.id === 'p2')!;
    expect(withEnv(CAMERA, () => onOf(standing, wet))).toEqual({ t: wet.spots.find((s) => s.id === 'b1')!, how: 'in' });
    const dry = withEnv(CAMERA, () => shotPlan(b, 'm1'))!;
    expect(
      withEnv(CAMERA, () =>
        onOf(
          dry.spots.find((s) => s.id === 'p2')!,
          dry,
        ),
      ),
    ).toBeUndefined();
    const view = withEnv(CAMERA, () => planContinuity(b, rec)).cuts.find((c) => c.id === 'm1')?.view ?? '';
    expect(view).toMatch(/The dinghy[^.]*with person p1 and person p2 in it/);
  });
});

describe('a vehicle heads no way that those in it face against', () => {
  test('moved back up the place while the two in it face its front, no heading is said; moved the way they face, it is', () => {
    const heading = (moved: 'back' | 'front') => {
      const { b, rec } = poolDream('sleek and grey', { moved });
      const c = withEnv(CAMERA, () => planContinuity(b, rec)).cuts.find((x) => x.id === 'm2')!;
      return { c, heading: (c.rules ?? []).filter((l) => /\bis heading\b/.test(l)) };
    };
    // They face the front, the dinghy moved to the back: two ways, and neither is said.
    expect(heading('back').heading).toEqual([]);
    // Moved toward the front, the way they face: said, from where the camera stands.
    const { c, heading: said } = heading('front');
    expect(said).toHaveLength(1);
    // The front of the hall, (0, -1), as the camera sees it.
    const n = Math.hypot(c.eye!.d.x, c.eye!.d.y);
    const ahead = -c.eye!.d.y / n;
    const right = -c.eye!.d.x / n;
    expect(said[0]).toMatch(
      ahead > 0.7
        ? /heading away from the camera/
        : ahead < -0.7
          ? /heading toward the camera/
          : right > 0
            ? /heading toward the right of the picture/
            : /heading toward the left of the picture/,
    );
  });
});

describe('a brief written for a view whose span is now said as around one place', () => {
  test('still serves it', () => {
    const was =
      'Seen from behind them. The red door, the middle of the picture, filling the picture from a third of the way down to a third of the way down.';
    const now =
      'Seen from behind them. The red door, the middle of the picture, filling the picture around a third of the way down.';
    withEnv(CAMERA, () => {
      expect(sameView(was, now)).toBe(true);
      expect(sameView(was.replace('red door', 'blue door'), now)).toBe(false);
    });
    withEnv({ DREAMCHAT_CAMERA: undefined }, () => expect(sameView(was, now)).toBe(false));
  });
});

describe('what a view says of how much of the picture something fills', () => {
  test('where its top and bottom fall in one band, around there, never "from X to X"', () => {
    withEnv(CAMERA, () => {
      expect(filling({ y0: 0.3, y1: 0.38 })).toBe('filling the picture around a third of the way down');
      expect(filling({ y0: 0.45, y1: 0.55 })).toBe('filling the picture around its middle');
      expect(filling({ y0: 0.1, y1: 0.7 })).toBe('filling the picture from near its top to two thirds of the way down');
    });
    // Without the camera rules, as today.
    withEnv({ DREAMCHAT_CAMERA: undefined }, () =>
      expect(filling({ y0: 0.3, y1: 0.38 })).toBe(
        'filling the picture from a third of the way down to a third of the way down',
      ),
    );
  });
});

describe("a person's, place's or thing's id in a moment's words", () => {
  test('is its name once the dream is read, with the camera rules; otherwise as written', () => {
    const b = () => {
      const x = dream({
        people: ['p1'],
        blocking: { indoors: true, spots: [{ id: 'p1', x: 5, y: 5, kind: 'person' }] },
        moments: [{ id: 'm1', visible: ['p1'], looks_at: 'the tall window; outside it l2', action: 'p1 waves to l2' }],
      });
      x.places.push({ id: 'l2', name: 'the harbour' } as Breakdown['places'][number]);
      return x;
    };
    const on = b();
    withEnv(CAMERA, () => completeViews(on));
    expect(moments(on)[0].looks_at).toBe('the tall window; outside it the harbour');
    expect(moments(on)[0].action).toBe('person p1 waves to the harbour');
    const off = b();
    withEnv({ DREAMCHAT_CAMERA: undefined, DREAMCHAT_ONE_BUILDER: undefined }, () => completeViews(off));
    expect(moments(off)[0].looks_at).toBe('the tall window; outside it l2');
    // Part of a word is no id: "l2-shaped", "pl2" stay.
    const part = b();
    moments(part)[0].looks_at = 'the l2-shaped pool and the pl2 sign';
    withEnv(CAMERA, () => completeViews(part));
    expect(moments(part)[0].looks_at).toBe('the l2-shaped pool and the pl2 sign');
  });

  test('a place whose name says only where it is, is said by what kind of place it is, and not in what the camera faces', () => {
    // Written for this test; the library's "outside it outside the window" (library-1 m5) was the case.
    const b = (name: string, geography: string | null, landmarks: string | null = null) => {
      const x = dream({
        people: ['p1'],
        blocking: { indoors: true, spots: [{ id: 'p1', x: 5, y: 5, kind: 'person' }] },
        moments: [
          {
            id: 'm1',
            visible: ['p1'],
            looks_at: 'the tall window; outside it l2',
            action: 'p1 looks out at l2',
            visual_point: 'through the window, l2',
            shift: 'the sea rises beyond the tall window l2',
          },
        ],
      });
      const detail = (value: string | null) => ({ value, said: true });
      x.places.push({
        id: 'l2',
        name,
        fields: { geography: detail(geography), landmarks: detail(landmarks), light: detail(null) },
      } as Breakdown['places'][number]);
      withEnv(CAMERA, () => completeViews(x));
      return moments(x)[0];
    };
    // What the place is: the first part of its geography, set off after words that say where.
    const out = b('outside the window', 'the harbour at dawn, fishing boats at anchor; gulls.');
    expect(out.action).toBe('person p1 looks out at the harbour at dawn, fishing boats at anchor');
    expect(out.visual_point).toBe('through the window, the harbour at dawn, fishing boats at anchor');
    expect(out.shift).toBe('the sea rises beyond the tall window, the harbour at dawn, fishing boats at anchor');
    // The camera faces the window: what is out past it is the moment's to say, never "outside it outside the window".
    expect(out.looks_at).toBe('the tall window');
    // Without its geography, its landmarks; without either, its name.
    expect(b('inside the tower', 'A narrow, tall room; white walls').action).toBe(
      'person p1 looks out at a narrow, tall room',
    );
    expect(b('beyond the gate', null, 'a row of poplars; a bench').action).toBe(
      'person p1 looks out at a row of poplars',
    );
    const bare = b('outside the window', null);
    expect(bare.action).toBe('person p1 looks out at outside the window');
    expect(bare.looks_at).toBe('the tall window');
    // A name that says what the place is stays its name, in what the camera faces too.
    const named = b('the harbour', 'a small stone harbour');
    expect(named.looks_at).toBe('the tall window; outside it the harbour');
    expect(named.shift).toBe('the sea rises beyond the tall window the harbour');
  });
});

describe('a fixture up its wall, where the words put it', () => {
  const room = { indoors: true, ceiling: 6 } as const;
  const window = (name: string, size: [number, number, number] = [2, 0.3, 2]) => ({
    name,
    size,
    shape: 'block' as const,
    fixture: true,
    kind: 'thing' as const,
  });

  test('high, at the top, on the ceiling or on a wall: its height off the floor', () => {
    // Its own name says it is high: the top quarter of the wall, its top a little under the ceiling.
    expect(mountOf(window('the high round window'), room)).toEqual({ above: 4.4, high: 1.5 });
    // The place's words say it, of what it is: "a round window high up", "a high round window at the top".
    expect(mountOf(window('the round window'), room, 'a big hall; a round window high up')).toEqual({
      above: 4.4,
      high: 1.5,
    });
    expect(
      mountOf(window('the window'), room, 'big reading room, shelves up to the ceiling, high round window at the top'),
    ).toEqual({ above: 4.4, high: 1.5 });
    // Hung from the ceiling: its top at the ceiling.
    expect(mountOf(window('the lamp', [0.5, 0.5, 0.6]), room, 'a lamp hanging from the ceiling')).toEqual({
      above: 5.4,
      high: 0.6,
    });
    // On a wall: its middle at eye height.
    expect(mountOf(window('the clock', [0.4, 0.1, 0.4]), room, 'a round clock on the wall')).toEqual({
      above: 1.3,
      high: 0.4,
    });
  });

  test('what the words do not put up a wall stands on the floor', () => {
    // An ordinary window, and words about something else.
    expect(mountOf(window('the window'), room, 'windows all round; a table in the middle')).toBeNull();
    // Where the room is, not where its windows are: the lighthouse's round room kept its windows as they were.
    expect(
      mountOf(
        window('the window', [1.2, 0.1, 1.5]),
        room,
        'A round room at the top of the lighthouse with windows all the way round.',
      ),
    ).toBeNull();
    expect(
      mountOf(
        window('the big reading room', [1, 1, 1]),
        room,
        'the big reading room with shelves and a high round window at the top',
      ),
    ).toBeNull();
    // "Up to the ceiling" is how tall shelves are, never where they hang.
    expect(mountOf(window('the shelves', [2, 1, 1.5]), room, 'shelves up to the ceiling')).toBeNull();
    // Too tall to be up a wall: a high wall, a bookcase to the ceiling.
    expect(mountOf(window('the high wall', [8, 0.3, 6]), room)).toBeNull();
    // Out of doors there is no wall or ceiling to be on; and never someone's, or someone.
    expect(mountOf(window('the high round window'), { indoors: false })).toBeNull();
    expect(mountOf({ ...window('the high round window'), heldBy: 'p1' }, room)).toBeNull();
    expect(mountOf({ ...window('the high round window'), fixture: false }, room)).toBeNull();
  });

  test('words about something else near it, or about how tall it is, leave it on the floor', () => {
    // Said by a high thing: the desk is under the window, not up the wall with it.
    expect(mountOf(window('the desk', [1.4, 0.7, 0.75]), room, 'a desk under the high window')).toBeNull();
    expect(mountOf(window('the bench', [1.5, 0.4, 0.45]), room, 'a bench below the high round window')).toBeNull();
    // The window over it is still high.
    expect(mountOf(window('the window'), room, 'a desk under the high window')).toEqual({ above: 4.4, high: 1.5 });
    // At the top of something else: where it is, not how high on its wall.
    expect(mountOf(window('the door', [1, 0.1, 2.1]), room, 'the door at the top of the stairs')).toBeNull();
    expect(mountOf(window('the window'), room, 'a window at the top of the wall')).toEqual({ above: 4.4, high: 1.5 });
    // How tall, not how high: waist-high, high-backed, a high stool.
    expect(mountOf(window('the counter', [2, 0.3, 1]), room, 'a waist-high counter')).toBeNull();
    expect(mountOf(window('the armchair', [0.9, 0.9, 1.2]), room, 'a high-backed armchair')).toBeNull();
    expect(mountOf(window('the stool', [0.4, 0.4, 0.8]), room, 'a high stool')).toBeNull();
    // Near the ceiling says it of the lamp itself.
    expect(mountOf(window('the lamp', [0.5, 0.5, 0.6]), room, 'a lamp near the ceiling')).toEqual({
      above: 5.3,
      high: 0.6,
    });
  });

  test('lifted onto the wall it is by, and the water measured by it', () => {
    const plan: Blocking = {
      front: 'the high round window side',
      indoors: true,
      ceiling: 6,
      room: [20, 12],
      spots: [
        {
          id: 'x1',
          x: 10,
          y: 0.5,
          kind: 'thing',
          size: [2, 0.3, 2],
          shape: 'block',
          fixture: true,
          name: 'the high round window',
        },
        {
          id: 'x2',
          x: 8,
          y: 6,
          kind: 'thing',
          size: [1.2, 0.8, 0.75],
          shape: 'block',
          fixture: true,
          name: 'the desk',
        },
      ],
    };
    const up = mounted(plan, 'big reading room, high round window at the top');
    const x1 = up.spots.find((s) => s.id === 'x1')!;
    expect(x1.above).toBe(4.4);
    expect(x1.size).toEqual([2, 0.3, 1.5]);
    // Flat against the front wall it stood by.
    expect(x1.y).toBeCloseTo(0.17, 2);
    expect(up.spots.find((s) => s.id === 'x2')!.above).toBeUndefined();
    // Up to it is up to its bottom; over it, over its top.
    expect(waterLevel('up to the high round window', up)).toBe(4.4);
    expect(waterLevel('over the high round window', up)).toBe(5.9);
    // Standing on the floor, as before: up to its top.
    expect(waterLevel('up to the high round window', plan)).toBe(2);
  });

  test("a wall is never labelled with a fixture's name, with the camera rules", () => {
    const plan = {
      front: 'the high round window side',
      spots: [{ id: 'x1', x: 10, y: 0.2, kind: 'thing' as const, fixture: true, name: 'the high round window' }],
    };
    expect(frontNamesFixture(plan)).toBe(true);
    expect(frontNamesFixture({ ...plan, front: 'the screen' })).toBe(false);
    expect(withEnv(CAMERA, () => frontLabel(plan))).toBe('the wall');
    expect(withEnv(CAMERA, () => frontLabel({ ...plan, front: 'the screen' }))).toBe('the screen');
    // Off, as before.
    expect(withEnv({ DREAMCHAT_CAMERA: undefined }, () => frontLabel(plan))).toBe('the high round window side');
  });

  test("the library's high round window is up its wall, above the water, and in the picture of rowing up to it", () => {
    // Its floor plan made it a 2 m block on the floor, under 4 metres of water: gone from the view.
    const r = rebuilt('dream-0926-050424-fdd7', ON);
    const plan = withEnv(ON, () => shotPlan(r.b, 'm5', r.rec))!;
    const x1 = plan.spots.find((s) => s.id === 'x1')!;
    expect(x1.above).toBeGreaterThanOrEqual(4);
    expect((x1.above ?? 0) + x1.size![2]).toBeLessThanOrEqual(plan.ceiling!);
    // With the water the camera rules measure there (4.4 m, as the implied readings give it), all of it above.
    const wet = { ...plan, water: 4.4 };
    const shot = withEnv(ON, () =>
      outsideShot(wet, ['p1', 'p2'], 'wide', (id) => id, { id: 'x1', at: { x: x1.x, y: x1.y } }),
    )!;
    expect(shot.inPicture).toContain('x1');
    expect(shot.text).not.toContain('Outside the picture, behind the camera: x1');
    // Out over the top of the frame, it is above the picture, never "off to the right" of it.
    expect(picture(r, 'm2').prompt).toContain('Outside the picture, above it: the high round window.');
    // Off, as before: on the floor.
    const off = withEnv({ DREAMCHAT_CAMERA: undefined }, () => shotPlan(r.b, 'm5', r.rec))!;
    expect(off.spots.find((s) => s.id === 'x1')!.above).toBeUndefined();
  });
});

describe('what the moment looks at, put down at their feet', () => {
  const field = {
    front: 'the sea',
    spots: [
      { id: 'p1', x: 10, y: 10, kind: 'person' as const, faces: 'front', pose: 'standing' as const },
      { id: 't1', x: 10, y: 9.5, kind: 'thing' as const, size: [0.15, 0.1, 0.08] as [number, number, number] },
      { id: 't2', x: 10.3, y: 9.4, kind: 'thing' as const, size: [0.2, 0.2, 0.1] as [number, number, number] },
    ],
  };
  const name = (id: string) => ({ p1: 'the dreamer', t1: 'the boat', t2: 'the stone' })[id] ?? id;
  const at = { id: 't1', at: { x: 10, y: 9.5 } };

  test('is in the picture, however close the shot or small the thing', () => {
    // The boat set down in the grass was under the bottom of a close shot of the dreamer (affd m10).
    for (const size of ['close', 'medium'] as const) {
      const shot = withEnv(CAMERA, () => outsideShot(field, ['p1'], size, name, at))!;
      expect(shot.inPicture).toContain('t1');
      expect(shot.text).toContain('the camera looks at the boat');
      expect(shot.text).not.toContain(': the boat.');
    }
    // Held, it is where their hands are, as before: the frame is not taken down to the ground.
    const held = { ...field, spots: field.spots.map((s) => (s.id === 't1' ? { ...s, heldBy: 'p1' } : s)) };
    const inHands = withEnv(CAMERA, () => outsideShot(held, ['p1'], 'close', name, at))!;
    expect(inHands.text).not.toContain('seen from the chest down to their feet');
    // On their very spot, it is with them, never put down: the letters in the suitcase on the grandfather's lap took
    // the frame down to the floor (a44a m3). Nor what anyone stands, sits or rides on.
    const onSpot = { ...field, spots: field.spots.map((s) => (s.id === 't1' ? { ...s, x: 10, y: 10 } : s)) };
    const withThem = withEnv(CAMERA, () =>
      outsideShot(onSpot, ['p1'], 'close', name, { id: 't1', at: { x: 10, y: 10 } }),
    )!;
    expect(withThem.text).not.toContain('down to their feet');
    // Off, as before.
    const off = withEnv({ DREAMCHAT_CAMERA: undefined }, () => outsideShot(field, ['p1'], 'close', name, at))!;
    expect(off.text).toContain('Outside the picture, off to the right: the boat.');
  });

  test('under the bottom of the frame, it is below the picture, never off to one side', () => {
    const shot = withEnv(CAMERA, () => outsideShot(field, ['p1'], 'close', name))!;
    expect(shot.text).toContain('Outside the picture, below it: the boat.');
    expect(shot.text).toContain('Outside the picture, below it: the stone.');
    expect(shot.text).toContain('Outside the picture, behind the camera: the sea.');
  });
});
