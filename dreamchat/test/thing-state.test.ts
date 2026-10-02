// A thing drawn as the story last left it (the one builder's `thing_state`): the merged flow's Grandmother on Wednesdays
// (2 Oct), where the bed sheet she and the dreamer fold shrinks to a handkerchief, then a stamp she puts in her cutlery
// drawer. The floor plan kept the sheet two metres across, in her fingertips and lying on the drawer, and drew it there
// again in the moment after, its first sketch sent: the picture checks found a full-size cloth in both.
import { describe, expect, test } from 'bun:test';
import { planBy, planContinuity, putAway, type RecordPlan, sizedAs, sizedByState } from '../continuity';
import { dreamerShot, outsideShot } from '../previs';
import type { Breakdown, Moment } from '../producer';

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
const BEFORE = { ...ON, DREAMCHAT_ONE_BUILDER: 'place_built' };

const detail = (value: string | null = null) => ({ value, said: false });
const moment = (m: Partial<Moment> & { id: string }): Moment => ({
  action: `moment ${m.id}`,
  visible: ['p1'],
  things: [],
  place: 'l1',
  eyes: 'outside',
  distance: 'medium',
  looks_at: '',
  feeling: '',
  visual_point: '',
  purpose: '',
  continues: false,
  leaves: [],
  shift: '',
  key: false,
  said: true,
  ...m,
});
const ms = [
  moment({ id: 'm6', things: ['t1'], action: 'The grandmother folds a bed sheet, holding its corners' }),
  moment({
    id: 'm7',
    things: ['t1'],
    action: 'They bring the corners together and the sheet has shrunk to a handkerchief',
  }),
  moment({
    id: 'm8',
    things: ['t1'],
    action: "The sheet has become a stamp, held between the grandmother's fingertips",
  }),
  moment({
    id: 'm9',
    things: ['t1'],
    action: 'The grandmother puts the stamp in her cutlery drawer',
    visual_point: 'the stamp going into the cutlery drawer',
  }),
  moment({ id: 'm10', action: 'The grandmother tells the dreamer that their slot has gotten over' }),
];
const b: Breakdown = {
  title: 't',
  logline: '',
  look: { colours: detail(), light: detail(), texture: detail() },
  world_logic: '',
  people: [
    {
      id: 'p1',
      name: 'grandmother',
      is_dreamer: false,
      protagonist: true,
      fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
    },
  ],
  places: [{ id: 'l1', name: 'her kitchen', fields: { geography: detail(), landmarks: detail(), light: detail() } }],
  things: [{ id: 't1', name: 'the bed sheet', fields: { appearance: detail(), materials: detail() } } as never],
  scenes: [
    {
      id: 's1',
      title: '',
      place: 'l1',
      mood: '',
      moments: ms,
      blocking: {
        front: 'the window wall over the sink',
        indoors: true,
        room: [3.5, 3],
        spots: [
          { id: 'x3', x: 2.7, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
          { id: 'p1', x: 2.7, y: 0.9, kind: 'person', faces: 'x3', pose: 'standing' },
          { id: 't1', x: 1.1, y: 1.4, kind: 'thing', size: [2, 1.5, 0.01], heldBy: 'p1' },
        ],
        moves: { m9: [{ id: 't1', x: 2.7, y: 0.3, heldBy: '' }] },
      },
    },
  ],
  style_options: [],
  unknowns: [],
} as unknown as Breakdown;

const size = (now: string, since: string) => ({
  who: 't1',
  what: 'size',
  part: 'size',
  now,
  since,
  key: `t1@${since}:size`,
});
const at = (own: ReturnType<typeof size>[], carried: ReturnType<typeof size>[], things: string[] = ['t1']) => ({
  own,
  carried,
  visible: ['p1'],
  things,
  present: [],
  gone: [],
  held: {},
  now: [],
  facts: [],
});
const rec = {
  moments: {
    m6: at([], []),
    m7: at([size('a handkerchief', 'm7')], []),
    m8: at([size('the size of a stamp', 'm8')], []),
    m9: at([], [size('the size of a stamp', 'm8')]),
    m10: at([], [], []),
  },
  before: {},
  ends: {},
  unsaid: {},
} as unknown as RecordPlan;
const sheet = (id: string, step = ON) => withEnv(step, () => planBy(b, id, rec)!.spots.find((s) => s.id === 't1'));

describe('a thing at the size the story last left it', () => {
  test('what a change of size says it is now, where it names a thing of a known size', () => {
    expect(sizedAs(size('a stamp', 'm8'))).toEqual({ as: 'a stamp', size: [0.025, 0.03, 0.001] });
    expect(sizedAs(size('the size of a handkerchief', 'm7'))?.as).toBe('a handkerchief');
    expect(sizedAs(size('the size of a key', 'm7'))?.size).toEqual([0.08, 0.03, 0.01]);
    for (const now of ['much bigger', 'big enough to hold a key', 'tiny, 2 cm across', 'much smaller than a coin'])
      expect(sizedAs(size(now, 'm7'))).toBeUndefined();
    expect(sizedAs({ what: 'colour', now: 'a stamp' })).toBeUndefined();
  });

  test('a handkerchief, then a stamp, from the moment it changes; drawn as before without the step', () => {
    expect(sheet('m6')!.size).toEqual([2, 1.5, 0.01]);
    expect(sheet('m7')).toMatchObject({ size: [0.3, 0.3, 0.005], stated: true });
    expect(sheet('m7')!.sized).toBeUndefined();
    expect(sheet('m8')!.size).toEqual([0.025, 0.03, 0.001]);
    // Carried into the moment after, and put down on the drawer there by the plan's own move.
    expect(sheet('m9')).toMatchObject({ x: 2.7, y: 0.3, size: [0.025, 0.03, 0.001] });
    expect(sheet('m8', BEFORE)!.size).toEqual([2, 1.5, 0.01]);
    expect(sheet('m8', BEFORE)!.stated).toBeUndefined();
  });

  test('a change made earlier holds where the moment does not carry it, until it ends or the thing becomes another', () => {
    const plan = withEnv(ON, () => planBy(b, 'm6', rec)!);
    const t1 = (p: ReturnType<typeof sizedByState>) => p.spots.find((s) => s.id === 't1')!;
    // Carried by no moment after m8, still the size of a stamp at m10.
    expect(t1(sizedByState(plan, b, 'm10', rec)).size).toEqual([0.025, 0.03, 0.001]);
    // Ended at m9, as it is; become a dove at m9, never the stamp's size.
    expect(sizedByState(plan, b, 'm10', { ...rec, ends: { 't1@m8:size': 'm9' } } as RecordPlan)).toBe(plan);
    const dove = structuredClone(rec) as RecordPlan;
    dove.moments.m9.own = [{ who: 't1', what: 'form', now: 'a white dove', since: 'm9' }];
    expect(sizedByState(plan, b, 'm10', dove)).toBe(plan);
    // At a size the dream's sizes reading gives, it keeps that; a vehicle shrunk stays a vehicle.
    const read = { ...plan, spots: plan.spots.map((s) => (s.id === 't1' ? { ...s, sized: 'moment' as const } : s)) };
    expect(sizedByState(read, b, 'm9', rec)).toBe(read);
    const car = { ...plan, spots: plan.spots.map((s) => (s.id === 't1' ? { ...s, shape: 'vehicle' as const } : s)) };
    expect(t1(sizedByState(car, b, 'm9', rec)).shape).toBe('vehicle');
  });

  test('in the picture however small, said small, and named by its size; never a camera bent down to it', () => {
    const plan = withEnv(ON, () => planBy(b, 'm9', rec)!);
    const name = (id: string) =>
      ({ p1: 'grandmother', t1: 'the bed sheet (now the size of a stamp)', x3: 'the cutlery drawer' })[id] ?? id;
    const v = withEnv(ON, () => outsideShot(plan, ['p1', 't1'], 'medium', name))!;
    expect(v.inPicture).toContain('t1');
    expect(v.text).toMatch(/the bed sheet \(now the size of a stamp\)/i);
    expect(v.text).toMatch(/the bed sheet \(now the size of a stamp\)[^.;]*small in the picture, at its own size/i);
    // Through someone's own eyes it is looked at from where they stand, not from a centimetre off.
    const eyes = {
      ...plan,
      spots: [...plan.spots, { id: 'p2', x: 1.7, y: 1.4, kind: 'person' as const, pose: 'standing' as const }],
    };
    const d = withEnv(ON, () => dreamerShot(eyes, 'p2', 't1', name))!;
    expect(d.eye.at).toEqual({ x: 1.7, y: 1.4 });
    expect(d.eye.lean).toBeUndefined();
  });

  test('the view names it by what it is now, with the step only', () => {
    const view = (step: typeof ON) =>
      withEnv(step, () => planContinuity(b, rec)).cuts.find((c) => c.id === 'm9')?.view ?? '';
    expect(view(ON)).toMatch(/the bed sheet \(now the size of a stamp\)/i);
    expect(view(BEFORE)).not.toContain('now the size of');
  });
});

describe('a thing put into something that closes is inside it', () => {
  test('out of the plan in the moments after, until a moment names it, says it or moves it', () => {
    expect(putAway(b, ms[4], ms, rec)).toEqual(['t1']);
    expect(sheet('m10')).toBeUndefined();
    // In the moment that puts it away, still there; without the step, still there after.
    expect(putAway(b, ms[3], ms.slice(0, 4), rec)).toEqual([]);
    expect(sheet('m10', BEFORE)).toBeDefined();
    // Taken out again: by its id, by its words alone ("the stamp"), or by a move of it on the plan.
    const back = moment({ id: 'm11', things: ['t1'], action: 'She takes it out of the drawer' });
    expect(putAway(b, back, [...ms, back], rec)).toEqual([]);
    const said = moment({ id: 'm11', action: 'She takes the stamp out of the drawer again' });
    expect(putAway(b, said, [...ms, said], rec)).toEqual([]);
    const m11 = moment({ id: 'm11' });
    expect(putAway(b, m11, [...ms, m11], rec, { m11: [{ id: 't1' }] })).toEqual([]);
  });

  test('only the thing its words put in, never the thing it goes into, nor what a hand reaches past', () => {
    const things = (extra: { id: string; name: string }[]) =>
      ({ ...b, things: [...b.things, ...extra.map((t) => ({ ...t, fields: {} }))] }) as unknown as Breakdown;
    const away = (bd: Breakdown, x: Moment) => putAway(bd, ms[4], [...ms.slice(0, 3), x, ms[4]], rec);
    const one = (action: string, ids: string[]) => moment({ id: 'm9', things: ids, action, visual_point: '' });
    const more = things([
      { id: 't2', name: 'the teacup' },
      { id: 't3', name: 'the ticket' },
      { id: 't4', name: 'the lantern' },
      { id: 't5', name: 'the ball of wool' },
      { id: 't6', name: 'the coin' },
      { id: 't7', name: 'the music box' },
      { id: 't8', name: 'the wardrobe' },
    ]);
    expect(away(more, one('The grandmother puts the stamp on the counter', ['t1']))).toEqual([]);
    expect(away(more, one('She puts the teacup in the cupboard, the stamp in her hand', ['t1', 't2']))).toEqual(['t2']);
    expect(away(more, one('She puts her hand into her bag and pulls out the ticket', ['t3']))).toEqual([]);
    expect(away(more, one('The cold goes into her chest as she lifts the lantern', ['t4']))).toEqual([]);
    expect(away(more, one('The cat hides in the cardboard box with the ball of wool', ['t5']))).toEqual([]);
    expect(away(more, one('She drops the coin into the music box', ['t6', 't7']))).toEqual(['t6']);
    expect(away(more, one('The dreamer goes into the wardrobe', ['t8']))).toEqual([]);
  });
});
