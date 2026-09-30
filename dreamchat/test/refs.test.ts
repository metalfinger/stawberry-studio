// Step S5, the references a cut is drawn from (refs.ts, DREAMCHAT_REFS): image 1 what carries the layout, one
// image for each subject in view (its stage in force), no picture from another side, the plan waiting only
// for what it sends, and an in-between picture only where an edit carries two changes or more. Every
// dream here is made up for the rule it tests, each test failing with the switch off; the drawing path is
// checked against a rebuild on a saved dream.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleCut } from '../assemble';
import { type ContinuityPlan, planContinuity, shotPlan, unedited, uneditedFrame } from '../continuity';
import { cutSheet, type CutTags } from '../cutsheet';
import { frozenDreams, loadDream } from '../evals/saved';
import { buildFrames, buildGhosts, ghostPrompt, NOTHING_ELSE, type PlannedInput } from '../frames';
import { checkReferences } from '../gate';
import { rebuild, standIn } from '../plan';
import type { Breakdown, Moment, StyleOption } from '../producer';
import { chooseRefs, refsMode, SEVERAL, standsFor } from '../refs';
import { drawingSheet, drawnFrameOf, previsFor, type Session } from '../session';
import type { Item } from '../sheets';
import { forgetVerdicts, verdictsIn, withheldOf } from '../verdicts';

const detail = (value: string | null = null) => ({ value, said: false });

/** Runs `fn` with exactly these switches, the rest of DREAMCHAT_ unset (the camera rules off). */
function withSwitches<T>(vars: Record<string, string>, fn: () => T): T {
  const names = ['DREAMCHAT_REFS', 'DREAMCHAT_CUT_SHEET', 'DREAMCHAT_RECORD', 'DREAMCHAT_CAMERA'];
  const was = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  for (const k of names) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of names) {
      if (was[k] === undefined) delete process.env[k];
      else process.env[k] = was[k];
    }
  }
}
const ON = { DREAMCHAT_REFS: 'on', DREAMCHAT_CUT_SHEET: 'on' };
const OFF = { DREAMCHAT_CUT_SHEET: 'on' };

function moment(m: Partial<Moment> & { id: string }): Moment {
  return {
    action: `moment ${m.id}`,
    visible: [],
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
  };
}

const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  is_dreamer: false,
  protagonist: false,
  fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
  ...extra,
});

function breakdown(ms: Moment[], extra: Partial<Breakdown> = {}): Breakdown {
  return {
    title: 't',
    logline: '',
    look: { colours: detail(), light: detail(), texture: detail() },
    world_logic: '',
    people: [person('p1', 'ana'), person('p2', 'bo')],
    places: [
      { id: 'l1', name: 'the hall', fields: { geography: detail(), landmarks: detail(), light: detail() } },
      { id: 'l2', name: 'the yard', fields: { geography: detail(), landmarks: detail(), light: detail() } },
    ],
    things: [],
    scenes: [{ id: 's1', title: '', place: 'l1', mood: '', moments: ms }],
    style_options: [],
    unknowns: [],
    ...extra,
  };
}

const plan = (b: Breakdown, vars: Record<string, string>) => withSwitches(vars, () => planContinuity(b));
const cut = (p: ContinuityPlan, id: string) => p.cuts.find((c) => c.id === id)!;

describe('the switch', () => {
  test('is off unless asked for, and needs the cut sheet on', () => {
    expect(withSwitches({}, refsMode)).toBe('off');
    expect(withSwitches({ DREAMCHAT_REFS: 'on' }, refsMode)).toBe('off');
    expect(withSwitches({ DREAMCHAT_REFS: 'on', DREAMCHAT_CUT_SHEET: 'shadow' }, refsMode)).toBe('off');
    expect(withSwitches(ON, refsMode)).toBe('on');
    expect(withSwitches({ ...ON, DREAMCHAT_REFS: 'sketch' }, refsMode)).toBe('sketch');
    // "Several" is two (the owner, 27 Sep).
    expect(SEVERAL).toBe(2);
  });
});

describe('image 1: what carries the layout, on every cut', () => {
  const sheet = (inView: unknown[], earlier: { role: string }[] = [], previs: string | null = 'previs-m2') => ({
    earlier: earlier.map((e, i) => ({ id: `m${i + 1}`, kind: 'cut', role: e.role })) as never,
    inView: inView as never,
    camera: { previs },
  });
  const ana = { id: 'p1', kind: 'character', said: 'person', group: false, image: 'sketch-p1', turned: null };
  const crowd = { id: 'p9', kind: 'character', said: 'people', group: true, image: null, turned: null };

  test('the picture edited where the plan edits one; else the mock-up; the sketches first only with no mock-up', () => {
    expect(chooseRefs(sheet([ana], [{ role: 'base' }])).first).toBe('edit');
    expect(chooseRefs(sheet([ana])).first).toBe('mockup');
    expect(chooseRefs(sheet([ana], [], null)).first).toBe('free');
  });

  test('the mock-up whatever the cut, a crowd with no image of its own included: image 1 reads no tags', () => {
    // The owner's verdicts with the camera rules (evals/checkpoint/s4 and s5): with the mock-up 15 of 20 right,
    // without it 5 of 12; orchard m6 and lighthouse-first m7, drawn without it through the dreamer's eyes, lost
    // the dreamer's view and the room. Image 1 no longer looks at the cut's tags at all.
    expect(chooseRefs(sheet([ana, crowd])).first).toBe('mockup');
    expect(chooseRefs(sheet([crowd])).first).toBe('mockup');
  });

  test('an edit the gate drops is placed on its floor plan and made from its own mock-up, never from nothing', () => {
    // m3 is the story's continuation of m1, the same view, but ana's coat went red at m2, which m1 does not
    // show: the gate does not edit m1. Left an edit until then, m3 had no camera and no mock-up of its own, and
    // went out with the sketches alone (the S5 picture check: orchard m3 mirrored, lighthouse-first m8).
    const coat = () =>
      withPlan(
        breakdown([
          moment({ id: 'm1', visible: ['p1'], looks_at: 'the stage' }),
          moment({
            id: 'm2',
            visible: ['p1'],
            looks_at: 'the stage',
            sameSide: ['m1'],
            leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
          }),
          moment({ id: 'm3', visible: ['p1'], looks_at: 'the stage', from: 'm1', sameSide: ['m1', 'm2'], states: [red] }),
        ]),
      );
    const off = cut(plan(coat(), OFF), 'm3');
    expect(off.refs.find((r) => r.id === 'm1')?.role).toBe('base');
    for (const vars of [ON, { ...ON, DREAMCHAT_RECORD: 'on', DREAMCHAT_CAMERA: 'on' }]) {
      const on = cut(plan(coat(), vars), 'm3');
      expect(on.refs.some((r) => r.id === 'm1')).toBe(false);
      expect(on.eye).toBeTruthy();
      expect(on.view).toBeTruthy();
      const made = assembled(coat(), 'm3', vars).made;
      expect(made.references[0]).toMatchObject({ role: 'base', source: 'mockup', of: 'm3' });
      expect(made.prompt).toContain('It is a rough grey mock-up of this exact picture');
    }
  });
});

describe('an edit whose picture is not sent after all is made from its own shot, never from nothing', () => {
  // m1, m2 and m3 are one view, nothing changing: m2 edits m1, m3 edits m2.
  const same = () =>
    withPlan(
      breakdown([
        moment({ id: 'm1', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage' }),
        moment({ id: 'm2', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage', from: 'm1', sameSide: ['m1'] }),
        moment({
          id: 'm3',
          visible: ['p1', 'p2'],
          distance: 'wide',
          looks_at: 'the stage',
          from: 'm2',
          sameSide: ['m1', 'm2'],
        }),
      ]),
    );
  const CAMERA = { ...ON, DREAMCHAT_RECORD: 'on', DREAMCHAT_CAMERA: 'on' };

  test('a chain of edits of one view stays a chain of edits: the gate and the camera placement agree', () => {
    for (const vars of [ON, CAMERA]) {
      const p = plan(same(), vars);
      expect(cut(p, 'm2').refs.find((r) => r.id === 'm1')?.role).toBe('base');
      expect(cut(p, 'm3').refs.find((r) => r.id === 'm2')?.role).toBe('base');
      // With or without the camera rules, the gate knows where the edit's own camera would stand.
      expect(cut(p, 'm3').wouldBe).toBeTruthy();
    }
  });

  test("an edit's picture is where the picture it edits was drawn from, not where its own camera would stand", () => {
    // m2 edits m1 (its own camera, framing the lamp too, would stand 1.2 m behind m1's, near enough); m3 edits m2.
    // m2's picture is drawn from m1's camera, 0.7 m from where m3's would stand: m3 is an edit of it. Compared at
    // m2's own camera, 1.8 m off, m3 was not (random dream 562, found in review).
    const chain = () => {
      const b = breakdown(
        [
          moment({ id: 'm1', visible: ['p1', 'p2'], looks_at: 'the stage' }),
          moment({ id: 'm2', visible: ['p1', 'p2'], things: ['t1'], looks_at: 'the stage', sameSide: ['m1'] }),
          moment({
            id: 'm3',
            visible: ['p1', 'p2'],
            looks_at: 'the stage',
            sameSide: ['m2'],
            leaves: [{ who: 'p1', what: 'coat', now: 'soaked' }],
          }),
        ],
        {
          people: [person('p0', 'you', { is_dreamer: true }), person('p1', 'ana'), person('p2', 'bo')],
          things: [{ id: 't1', name: 'the lamp', fields: {} }] as never,
        },
      );
      b.scenes[0].blocking = {
        front: 'the stage',
        indoors: true,
        spots: [
          { id: 'p0', x: 3.2679216861724854, y: 6.157477796077728, kind: 'person', pose: 'standing' },
          { id: 'p1', x: 4.720808506011963, y: 3.1099095344543457, kind: 'person', pose: 'standing' },
          { id: 'p2', x: 7.841257750988007, y: 4.189713954925537, kind: 'person', pose: 'standing' },
          { id: 't1', x: 3.4496073722839355, y: 2.5797478556632996, kind: 'thing' },
        ],
        moves: {
          m1: [{ id: 'p1', x: 4.748605489730835, y: 4.408701658248901 }],
          m2: [{ id: 'p1', x: 5.323129653930664, y: 4.224096298217773 }],
        },
      } as never;
      return b;
    };
    const p = plan(chain(), ON);
    const [m1, m2, m3] = ['m1', 'm2', 'm3'].map((id) => cut(p, id));
    expect(m2.refs.find((r) => r.id === 'm1')?.role).toBe('base');
    const off = (a: { at: { x: number; y: number } }, z: { at: { x: number; y: number } }) =>
      Math.hypot(a.at.x - z.at.x, a.at.y - z.at.y);
    expect(off(m3.wouldBe!, m1.eye!)).toBeLessThan(1.5);
    expect(off(m3.wouldBe!, m2.wouldBe!)).toBeGreaterThan(1.5);
    expect(m3.refs.find((r) => r.id === 'm2')?.role).toBe('base');
  });

  test("with the camera rules, its own shot stays at the camera of the picture it edits: the same view, a moment later", () => {
    // The camera rules move a camera off an earlier one of the same people at the same size (placed a second time,
    // once the relations are read from the cameras). An edit's picture is that one, so its own shot, made where the
    // edit's picture is withheld, was moved off the view the story keeps (random dream 2, found in review).
    const coat = { who: 'p1', what: 'coat', now: 'bright red', since: 'm1' };
    const b = breakdown(
      [
        moment({
          id: 'm1',
          visible: ['p1', 'p2'],
          looks_at: 'the stage',
          leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
        }),
        moment({ id: 'm2', visible: ['p1', 'p2'], looks_at: 'the door', states: [coat] }),
        moment({ id: 'm3', visible: ['p1', 'p2'], looks_at: 'the door', from: 'm2', states: [coat] }),
        moment({ id: 'm4', visible: ['p1', 'p2'], eyes: 'dreamer', looks_at: 'the stage', states: [coat] }),
        moment({
          id: 'm5',
          visible: ['p1', 'p2'],
          looks_at: 'the door',
          from: 'm4',
          sameSide: ['m2', 'm3'],
          states: [coat],
        }),
      ],
      {
        people: [person('p0', 'you', { is_dreamer: true }), person('p1', 'ana'), person('p2', 'bo')],
        things: [{ id: 't1', name: 'the lamp', fields: {} }] as never,
      },
    );
    b.scenes[0].blocking = {
      front: 'the stage',
      indoors: true,
      spots: [
        { id: 'p0', x: 6.3589959144592285, y: 2.498508930206299, kind: 'person', pose: 'standing' },
        { id: 'p1', x: 4.251326262950897, y: 2.635227918624878, kind: 'person', pose: 'standing' },
        { id: 'p2', x: 4.252206742763519, y: 3.5313711166381836, kind: 'person', pose: 'standing' },
        { id: 't1', x: 2.9629430770874023, y: 5.63319319486618, kind: 'thing' },
      ],
      moves: { m1: [{ id: 'p1', x: 4.047235369682312, y: 6.54767644405365 }] },
    } as never;
    const p = plan(b, CAMERA);
    const m2 = cut(p, 'm2');
    expect(m2.refs.find((r) => r.id === 'm1')?.role).toBe('base');
    const m1 = cut(p, 'm1').eye!;
    const off = (e: { at: { x: number; y: number } }) => Math.hypot(e.at.x - m1.at.x, e.at.y - m1.at.y);
    expect(off(m2.alone!.eye)).toBeLessThan(0.01);
    // m3 edits m2, an edit of m1: its picture is drawn from m1's camera too, and its own shot stays there.
    const m3 = cut(p, 'm3');
    expect(m3.refs.find((r) => r.id === 'm2')?.role).toBe('base');
    expect(off(m3.alone!.eye)).toBeLessThan(0.01);
  });

  test('with the picture it edits withheld (judged wrong, or stale), it is placed and made from its own mock-up', () => {
    // The drawing path withholds what the owner judged wrong or S9 finds stale (session.ts plannedInputsOf). Left
    // an edit, m2 had no camera of its own and went out with the sketches alone.
    for (const vars of [ON, CAMERA]) {
      const m2 = cut(plan(same(), vars), 'm2');
      expect(m2.eye).toBeUndefined();
      expect(m2.alone?.eye).toBeTruthy();
      expect(unedited(m2, () => true)).toBe(m2);
      const alone = unedited(m2, (id) => id !== 'm1');
      expect([alone.eye, alone.view, alone.sees]).toEqual([m2.alone!.eye, m2.alone!.view, m2.alone!.sees]);
      expect(alone.refs.find((r) => r.id === 'm1')).toMatchObject({ role: 'composition', relation: 'same_side' });
      expect([alone.across, alone.camera, alone.staging, alone.transition]).toEqual([
        undefined,
        undefined,
        [],
        'cut, carrying on',
      ]);
      expect(assembled(same(), 'm2', vars).made.references[0]).toMatchObject({ source: 'edit', of: 'm1' });
      const made = assembled(same(), 'm2', vars, sketches, ['m1']).made;
      expect(made.references[0]).toMatchObject({ role: 'base', source: 'mockup', of: 'm2' });
      expect(made.references.some((r) => r.of === 'm1')).toBe(false);
    }
    // Today's choice, the references off: nothing kept, nothing changed.
    expect(cut(plan(same(), OFF), 'm2').alone).toBeUndefined();
  });
});

// A made-up dream: ana in the hall; her coat turns red at m2 and she keeps it; bo comes in at m3 from the
// other side of the hall; the crowd (no sketch of its own) stands in the yard.
const style: StyleOption = {
  id: 'd',
  name: 'ink',
  line: 'quiet',
  tokens: ['one loaded brush'],
  palette_hex: ['#111111'],
  lighting_rules: '',
} as StyleOption;
const sketch = (id: string, kind: Item['kind'], name: string, extra: Partial<Item> = {}): Item => ({
  id,
  kind,
  name,
  fields: {},
  status: 'ready',
  version: 1,
  mediaId: `sketch-${id}`,
  review: 'approved',
  ...extra,
});
const sketches = [
  sketch('p1', 'character', 'ana'),
  sketch('p2', 'character', 'bo'),
  sketch('l1', 'location', 'the hall'),
];
const red = { who: 'p1', what: 'coat', now: 'bright red', since: 'm2' };

/**
 * A moment's prompt and images as a rebuild makes them: every picture drawn and approved, but for those `withheld`
 * (judged wrong, or stale), which are not sent (plan.ts rebuild, session.ts drawnFrameOf).
 */
function assembled(b: Breakdown, id: string, vars: Record<string, string>, sheets = sketches, withheld: string[] = []) {
  return withSwitches(vars, () => {
    const p = planContinuity(b);
    const pictures = [...buildFrames(b, p), ...buildGhosts(p)].map((x): Item => ({
      ...x,
      status: 'ready',
      mediaId: `picture-${x.id}`,
      continuityApproved: true,
    }));
    const frame = uneditedFrame(pictures.find((x) => x.id === id)!, (x) => !withheld.includes(x));
    const inputs = (frame.frame?.plan?.refs ?? [])
      .map((use) => ({ use, item: pictures.find((x) => x.id === use.id) }))
      .filter((x): x is PlannedInput => !!x.item && !withheld.includes(x.use.id));
    // Its mock-up, where its camera is worked out on a floor plan (session.ts layoutFor).
    const layout = frame.frame?.plan?.eye ? standIn.previs(id) : undefined;
    return { plan: p, pictures, made: assembleCut(cutSheet({ frame, sheets, style, inputs, layout })) };
  });
}

describe('one image for each one in view: its stage in force', () => {
  const b = breakdown([
    moment({ id: 'm1', visible: ['p1'], distance: 'wide', looks_at: 'the stage' }),
    moment({
      id: 'm2',
      visible: ['p1'],
      distance: 'close',
      looks_at: 'the stage',
      from: 'm1',
      sameSide: ['m1'],
      leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
    }),
    moment({ id: 'm3', visible: ['p1'], place: 'l2', looks_at: 'the gate', states: [red] }),
  ]);

  test('someone changed is shown by the in-between picture of the change alone, never beside their sketch', () => {
    const off = assembled(b, 'm3', OFF).made;
    expect(off.references.map((r) => r.image)).toEqual(['sketch-p1', 'picture-g1']);
    const on = assembled(b, 'm3', ON).made;
    expect(on.references.map((r) => r.image)).toEqual(['picture-g1']);
    expect(on.references[0]).toMatchObject({ role: 'identity', source: 'ghost', of: 'g1' });
    // Said as who she is, as she is now: the change is what the picture shows, never an exception to it.
    expect(on.prompt).toContain(
      'Image 1: who ana is, as they are now (coat: bright red): their face, hair, build and clothes, exactly, as this picture shows them',
    );
    expect(on.prompt).not.toContain('no longer theirs');
  });

  test('with DREAMCHAT_REFS=sketch the sketch stays beside the in-between picture, for the paid check to compare', () => {
    const made = assembled(b, 'm3', { ...ON, DREAMCHAT_REFS: 'sketch' }).made;
    expect(made.references.map((r) => r.image)).toEqual(['sketch-p1', 'picture-g1']);
  });

  test('the check that everyone in view brings their image takes the in-between picture for the sketch', () => {
    const refs = [{ media_id: 'picture-g1', role: 'identity' }];
    const prompt = 'Image 1: who ana is.';
    const frames = [{ kind: 'ghost' as const, ghost: { of: 'p1' } as never, mediaId: 'picture-g1' }];
    const must = (vars: Record<string, string>) =>
      withSwitches(vars, () => [{ name: 'ana', mediaId: 'sketch-p1', ...standsFor(frames, 'p1') }]);
    expect(checkReferences(prompt, refs, { mustInclude: must(OFF) })).toEqual([
      'ana is in view but their sketch is not attached',
    ]);
    expect(checkReferences(prompt, refs, { mustInclude: must(ON) })).toEqual([]);
  });
});

describe('the plan waits only for what it sends', () => {
  test('never an earlier picture for its light alone: nothing to wait for, and the judge still compares the light', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the door' }),
      moment({ id: 'm2', visible: ['p1'], place: 'l2', looks_at: 'the road' }),
      moment({ id: 'm3', visible: ['p1'], looks_at: 'the window' }),
    ]);
    expect(cut(plan(b, OFF), 'm3').needs).toContain('m1');
    const m3 = cut(plan(b, ON), 'm3');
    expect(m3.refs.some((r) => r.role === 'lighting')).toBe(false);
    expect(m3.needs).not.toContain('m1');
    expect(m3.criteria.some((k) => k.with === 'm1' && /light/.test(k.text))).toBe(true);
  });

  test('an earlier picture for who someone is only where they have no sketch: a crowd', () => {
    const b = breakdown(
      [
        moment({ id: 'm1', visible: ['p1', 'p3'], place: 'l2', looks_at: 'the gate' }),
        moment({ id: 'm2', visible: ['p2'], looks_at: 'the stage' }),
        moment({ id: 'm3', visible: ['p1', 'p3'], looks_at: 'the window' }),
      ],
      { people: [person('p1', 'ana'), person('p2', 'bo'), person('p3', 'the crowd', { several: true, extras: true })] },
    );
    // Today ana's picture is waited for, for her and the crowd, though her sketch says who she is.
    const off = cut(plan(b, OFF), 'm3').refs.find((r) => r.id === 'm1');
    expect(off?.who).toEqual(['p1', 'p3']);
    const on = cut(plan(b, ON), 'm3');
    expect(on.refs.find((r) => r.id === 'm1')?.who).toEqual(['p3']);
    expect(on.needs.filter((id) => id.startsWith('m'))).toEqual(['m1']);
    // Without the crowd, nothing earlier is waited for.
    const alone = breakdown([
      moment({ id: 'm1', visible: ['p1'], place: 'l2', looks_at: 'the gate' }),
      moment({ id: 'm2', visible: ['p2'], looks_at: 'the stage' }),
      moment({ id: 'm3', visible: ['p1'], looks_at: 'the window' }),
    ]);
    expect(cut(plan(alone, OFF), 'm3').needs).toContain('m1');
    expect(cut(plan(alone, ON), 'm3').needs.filter((id) => id.startsWith('m'))).toEqual([]);
  });

  test('never a picture from the other side of the room: turned round on the floor plan, it is neither edited nor laid out from', () => {
    // The words call the two moments one side; the cameras on the one floor plan face opposite ways.
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage' }),
      moment({ id: 'm2', visible: ['p1', 'p2'], looks_at: 'the back wall', from: 'm1', sameSide: ['m1'] }),
    ]);
    b.scenes[0].blocking = {
      front: 'the stage',
      indoors: true,
      spots: [
        { id: 'p1', x: 4, y: 5, kind: 'person', pose: 'standing' },
        { id: 'p2', x: 6, y: 5, kind: 'person', pose: 'standing' },
      ],
    };
    const off = cut(plan(b, OFF), 'm2');
    expect(off.refs.find((r) => r.id === 'm1')).toMatchObject({ role: 'composition', relation: 'same_side' });
    const on = cut(plan(b, ON), 'm2');
    expect(on.eye && cut(plan(b, ON), 'm1').eye).toBeTruthy();
    expect(on.refs.some((r) => r.id === 'm1')).toBe(false);
    expect(on.needs).not.toContain('m1');
  });

  test('with the camera rules, a relation to a picture not drawn from is still settled by the cameras', () => {
    // The words call m2 the other side (kept for its light alone), the cameras face the same way: planned
    // again from the cameras, m2 takes m1's room. Left out before the plan settled, the relation was never
    // checked, and m2 was drawn with nothing of the room.
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage' }),
      moment({ id: 'm2', visible: ['p1', 'p2'], looks_at: 'the stage', sameSide: [] }),
    ]);
    b.scenes[0].blocking = {
      front: 'the stage',
      indoors: true,
      spots: [
        { id: 'p1', x: 4, y: 5, kind: 'person', pose: 'standing' },
        { id: 'p2', x: 6, y: 5, kind: 'person', pose: 'standing' },
      ],
    };
    const camera = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_RECORD: 'on' };
    expect(cut(plan(b, OFF), 'm2').refs.find((r) => r.id === 'm1')?.relation).toBe('other_side');
    for (const vars of [
      { ...OFF, ...camera },
      { ...ON, ...camera },
    ])
      expect(cut(plan(b, vars), 'm2').refs.find((r) => r.id === 'm1')).toMatchObject({
        role: 'composition',
        relation: 'same_side',
      });
  });
});

/** The hall's floor plan: ana and bo before the stage. */
const withPlan = (b: Breakdown) => {
  b.scenes[0].blocking = {
    front: 'the stage',
    indoors: true,
    spots: [
      { id: 'p1', x: 4, y: 5, kind: 'person', pose: 'standing' },
      { id: 'p2', x: 6, y: 5, kind: 'person', pose: 'standing' },
    ],
  };
  return b;
};
const water = { who: 'l1', what: 'water', now: 'up to the knees', since: 'm2' };

describe('a side of a place never drawn is no change, with or without a floor plan (the owner, 27 Sep)', () => {
  // m1 faces the stage; m2 floods the hall and soaks the crowd; m3 turns to the back wall, a side never drawn.
  const soaked = { who: 'p3', what: 'clothes', now: 'soaked', since: 'm2' };
  const people = [person('p1', 'ana'), person('p2', 'bo'), person('p3', 'the crowd', { several: true, extras: true })];
  const hall = (m3: Partial<Moment> = {}) =>
    breakdown(
      [
        moment({ id: 'm1', visible: ['p1', 'p2', 'p3'], distance: 'wide', looks_at: 'the stage' }),
        moment({
          id: 'm2',
          visible: ['p1', 'p2', 'p3'],
          distance: 'wide',
          looks_at: 'the stage',
          from: 'm1',
          sameSide: ['m1'],
          leaves: [{ who: 'l1', what: 'water', now: 'up to the knees' }],
        }),
        moment({ id: 'm3', visible: ['p1', 'p2', 'p3'], looks_at: 'the back wall', sameSide: [], ...m3 }),
      ],
      { people },
    );

  test('no in-between picture of the side, where the plan made one at three changes', () => {
    // The crowd's soaked clothes are said in words (a crowd has no sketch to draw a change on).
    const b = hall({ states: [soaked] });
    expect(
      plan(b, OFF)
        .ghosts.filter((g) => g.kind === 'view')
        .map((g) => g.usedBy),
    ).toEqual([['m3']]);
    for (const x of [b, withPlan(hall({ states: [soaked] }))]) {
      const on = plan(x, ON);
      expect(on.ghosts.filter((g) => g.kind === 'view')).toEqual([]);
      expect(cut(on, 'm3').changes).toEqual(['the action', "the crowd's clothes now soaked, shown in no reference"]);
    }
  });

  test("an in-between picture that takes none of a cut's changes off it is not drawn, however many it carries", () => {
    // m3 changes ana's coat itself (its action), and carries the crowd's soaked clothes in words: two changes,
    // but the coat's picture would take neither off it.
    const b = hall({ states: [soaked], leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }] });
    expect(plan(b, OFF).ghosts.some((g) => g.state?.what === 'coat')).toBe(true);
    const on = plan(b, ON);
    expect(cut(on, 'm3').changes).toHaveLength(2);
    expect(on.ghosts.some((g) => g.state?.what === 'coat')).toBe(false);
  });

  test("the place's in-between picture as its one image beside the mock-up keeps its water, said outright", () => {
    const water = { who: 'l1', what: 'water', now: 'up to the knees', since: 'm2' };
    const on = assembled(withPlan(hall({ states: [water] })), 'm3', ON).made;
    expect(on.references[0]).toMatchObject({ source: 'mockup' });
    const line = on.prompt.split('\n').find((l) => l.includes('the hall'))!;
    expect(line).toContain('only what it is made of and its colours');
    expect(line).toContain('and its water exactly as in this picture (water: up to the knees)');
    expect(on.references.find((r) => r.source === 'ghost')).toMatchObject({ of: 'g1' });
  });
});

describe('an earlier picture attached for how things look brings nobody and nothing of its own', () => {
  test('a person in it who is not in this moment is not drawn from it: the line says so, in the prompts of today too', () => {
    // m1 has ana and bo; m2 is ana alone, from the same side: m1 goes in for the room.
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage' }),
      moment({ id: 'm2', visible: ['p1'], looks_at: 'the stage', from: 'm1', sameSide: ['m1'] }),
    ]);
    const made = assembled(b, 'm2', OFF).made;
    const line = made.prompt.split('\n').find((l) => l.startsWith('Image') && l.includes('picture 1'))!;
    expect(line).toContain('the same place from the same side');
    expect(line).not.toContain('everyone in it are');
    expect(line).toContain(NOTHING_ELSE);
    // With S5, with no cameras to compare, the room from the same side is not drawn from: the sketches carry its look.
    expect(assembled(b, 'm2', ON).made.references.some((r) => r.source === 'earlier')).toBe(false);
  });

  test("through the dreamer's eyes, the dreamer in an earlier picture is the camera: said with the mock-up today", () => {
    // The dreamer and bo in the hall (m1, m2), then the dreamer's own view of bo (m3), which keeps m1 for the room.
    const dreamer = [person('p1', 'you', { is_dreamer: true, protagonist: true }), person('p2', 'bo')];
    const b = withPlan(
      breakdown(
        [
          moment({ id: 'm1', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage' }),
          moment({ id: 'm2', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage', sameSide: ['m1'] }),
          moment({
            id: 'm3',
            visible: ['p1', 'p2'],
            eyes: 'dreamer',
            looks_at: 'bo',
            from: 'm1',
            sameSide: ['m1', 'm2'],
          }),
        ],
        { people: dreamer },
      ),
    );
    const sheets = [
      sketch('p1', 'character', 'you', { isDreamer: true }),
      sketch('p2', 'character', 'bo'),
      sketch('l1', 'location', 'the hall'),
    ];
    const today = assembled(b, 'm3', OFF, sheets).made;
    const line = today.prompt.split('\n').find((l) => l.startsWith('Image') && l.includes('picture 1'))!;
    expect(line).toContain('come from Image 1, the mock-up');
    expect(line).toContain('The dreamer in it is the camera here, so they are not in this picture.');
    expect(line).toContain(NOTHING_ELSE);
    // With S5: m1's camera, far behind them, is not this one: the picture is not drawn from, and where things
    // stand comes from the mock-up, image 1 through the dreamer's eyes as on every cut.
    const on = assembled(b, 'm3', ON, sheets).made;
    expect(on.references.some((r) => r.source === 'earlier')).toBe(false);
    expect(on.references[0]).toMatchObject({ source: 'mockup', of: 'm3' });
    const hall = on.prompt.split('\n').find((l) => l.startsWith('Image') && l.includes('the hall'))!;
    expect(hall).toContain('come from Image 1, the mock-up');
  });

  test('an earlier picture is drawn from only where its camera is near this one and what both show stands alike', () => {
    // Far camera: m1's wide shot of the stage for m2's close-up of ana, on one floor plan.
    const far = withPlan(
      breakdown([
        moment({ id: 'm1', visible: ['p1', 'p2'], distance: 'wide', looks_at: 'the stage' }),
        moment({ id: 'm2', visible: ['p1'], distance: 'close', looks_at: 'the stage', from: 'm1', sameSide: ['m1'] }),
      ]),
    );
    expect(cut(plan(far, OFF), 'm2').refs.some((r) => r.id === 'm1')).toBe(true);
    const on = cut(plan(far, ON), 'm2');
    expect(on.refs.some((r) => r.id === 'm1')).toBe(false);
    expect(on.unsent?.some((r) => r.id === 'm1')).toBe(true);
    // Another state: m3 is the story's continuation of m1, the same view, but ana's coat went red at m2, which
    // m1 does not show: m3 is not an edit of m1.
    const coat = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the stage' }),
      moment({
        id: 'm2',
        visible: ['p1'],
        looks_at: 'the stage',
        sameSide: ['m1'],
        leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
      }),
      moment({ id: 'm3', visible: ['p1'], looks_at: 'the stage', from: 'm1', sameSide: ['m1', 'm2'], states: [red] }),
    ]);
    expect(cut(plan(coat, OFF), 'm3').refs.find((r) => r.id === 'm1')?.role).toBe('base');
    expect(cut(plan(coat, ON), 'm3').refs.some((r) => r.id === 'm1')).toBe(false);
  });

  test('a picture the owner judged wrong is never drawn from; one S9 finds stale neither', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verdicts-'));
    mkdirSync(join(dir, 'evals'));
    writeFileSync(
      join(dir, 'evals', 'story-pictures.json'),
      JSON.stringify({
        rows: [
          { session: 'd1', moment: 'm1', picture: 'aaa.png', story: 'wrong' },
          { session: 'd1', moment: 'm2', picture: 'bbb.png', story: 'right' },
        ],
      }),
    );
    // A checkpoint put m2's picture (old, A) against a new one (B); the owner took B only.
    const cp = join(dir, 'runs', 'checkpoint', 's4');
    mkdirSync(join(cp, 'judge'), { recursive: true });
    writeFileSync(
      join(cp, 'judge', 'made.json'),
      JSON.stringify({ 'img/x-m2-a.jpg': { sha: 'bbb' }, 'img/x-m2-b.jpg': { sha: 'ccc' } }),
    );
    writeFileSync(join(cp, 'answers.json'), JSON.stringify({ answers: { 'x-m2': { answer: 'b' } } }));
    const table = verdictsIn([dir]);
    const frames = [
      { id: 'm1', kind: 'cut' as const },
      { id: 'm2', kind: 'cut' as const, mediaPath: 'media/bbb.png' },
      { id: 'm3', kind: 'cut' as const, mediaPath: 'media/ddd.png' },
      { id: 'm4', kind: 'cut' as const },
    ];
    expect(withheldOf('d1', frames, ['m4'], table)).toEqual({ m1: 'judged wrong', m2: 'judged wrong', m4: 'stale' });
    expect(table.byFile.get('ccc')).toBe('right');
  });

  test('a note sent without an answer judges neither picture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verdicts-'));
    const cp = join(dir, 'runs', 'checkpoint', 's5');
    mkdirSync(join(cp, 'judge'), { recursive: true });
    writeFileSync(
      join(cp, 'judge', 'made.json'),
      JSON.stringify({ 'img/x-m2-a.jpg': { sha: 'bbb' }, 'img/x-m2-b.jpg': { sha: 'ccc' } }),
    );
    writeFileSync(join(cp, 'answers.json'), JSON.stringify({ answers: { 'x-m2': { answer: null, note: 'later' } } }));
    const table = verdictsIn([dir]);
    expect(table.byFile.size).toBe(0);
  });

  test('without a mock-up, an earlier picture of the place and the place itself say the same of where things stand', () => {
    // Where the render of a mock-up fails, the place's line says the layout comes from the earlier picture of
    // this place: that picture's own line must not say it comes from the shot above.
    const was = standIn.previs;
    (standIn as { previs: (id: string) => string | undefined }).previs = () => undefined;
    try {
      for (const vars of <Record<string, string>[]>[{}, { DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_CAMERA: 'on', DREAMCHAT_RECORD: 'on' }, { ...ON, DREAMCHAT_RECORD: 'on' }])
        withSwitches(vars, () => {
          for (const id of frozenDreams()) {
            const s = loadDream(id, false).session as Session;
            if (!s.draft?.breakdown || !s.style) continue;
            for (const p of rebuild(s, { asDrawn: false }).pictures) {
              const t = p.prompt ?? '';
              const both =
                t.includes('where things stand comes from the earlier picture of this place') &&
                t.includes('come from the shot above');
              expect(both ? `${id} ${p.id}` : '').toBe('');
            }
          }
        });
    } finally {
      standIn.previs = was;
    }
  }, 120_000);

  test("a side's in-between picture edited from the place's state names both images and keeps the state", () => {
    const hall = sketch('l1', 'location', 'the hall');
    const state = {
      id: 'g1',
      kind: 'ghost' as const,
      name: 'g1',
      fields: {},
      status: 'ready' as const,
      version: 1,
      mediaId: 'picture-g1',
      continuityApproved: true,
      ghost: {
        id: 'g1',
        kind: 'state' as const,
        of: 'l1',
        label: '',
        change: '',
        from: null,
        needs: [],
        usedBy: [],
        why: '',
        state: { who: 'l1', what: 'water', now: 'up to the knees', since: 'm2' },
        depth: 1,
      },
    };
    const view: Item = {
      ...state,
      id: 'g2',
      name: 'g2',
      status: 'waiting',
      mediaId: undefined,
      ghost: { ...state.ghost, id: 'g2', kind: 'view', after: 'g1', looksAt: 'the back wall', state: undefined },
    };
    const { prompt, references } = ghostPrompt(view, hall, undefined, style, state);
    expect(references.map((r) => r.media_id)).toEqual(['picture-g1', 'sketch-l1']);
    expect(prompt).toContain('Image 1 is the hall as it is now (water: up to the knees): edit it.');
    expect(prompt).toContain('Image 2 is its reference sheet');
    expect(prompt).not.toContain("Image 1 is the hall's reference sheet");
  });
});

describe("in-between pictures: only where an edit would carry two changes or more (the owner's rule)", () => {
  test('a change the moment makes in one edit of the picture before is drawn straight, with no in-between picture', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the stage' }),
      moment({
        id: 'm2',
        visible: ['p1'],
        looks_at: 'the stage',
        from: 'm1',
        sameSide: ['m1'],
        leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
      }),
    ]);
    const off = plan(b, OFF);
    expect(off.ghosts.map((g) => g.id)).toEqual(['g1']);
    expect(cut(off, 'm2').changes).toEqual(['the action']);
    const on = plan(b, ON);
    expect(on.ghosts).toEqual([]);
    expect(cut(on, 'm2').needs).toEqual(['m1']);
  });

  test('a change carried into a moment that shows it in no other picture keeps its in-between picture', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the stage' }),
      moment({
        id: 'm2',
        visible: ['p1'],
        looks_at: 'the stage',
        from: 'm1',
        sameSide: ['m1'],
        leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
      }),
      moment({ id: 'm3', visible: ['p1'], place: 'l2', looks_at: 'the gate', states: [red] }),
    ]);
    const on = plan(b, ON);
    expect(on.ghosts.map((g) => g.id)).toEqual(['g1']);
    expect(cut(on, 'm3').needs).toEqual(['g1']);
  });

  test('what an in-between picture shows is each thing once, as its latest change left it', () => {
    const short = { who: 'p1', what: 'hair', now: 'cropped short', since: 'm2' };
    const green = { who: 'p1', what: 'hair', now: 'dyed green', since: 'm3' };
    const coat = { who: 'p1', what: 'coat', now: 'bright red', since: 'm4' };
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the stage' }),
      moment({ id: 'm2', visible: ['p1'], place: 'l2', leaves: [{ who: 'p1', what: 'hair', now: 'cropped short' }] }),
      moment({ id: 'm3', visible: ['p1'], states: [short], leaves: [{ who: 'p1', what: 'hair', now: 'dyed green' }] }),
      moment({
        id: 'm4',
        visible: ['p1'],
        place: 'l2',
        states: [green],
        leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }],
      }),
      moment({ id: 'm5', visible: ['p1'], states: [green, coat] }),
      moment({
        id: 'm6',
        visible: ['p1'],
        place: 'l2',
        states: [coat],
        leaves: [{ who: 'p1', what: 'hair', now: 'shaved off' }],
      }),
    ]);
    const on = plan(b, ON);
    const last = on.ghosts.find((g) => g.state?.what === 'coat')!;
    expect(last.shows).toEqual([
      { what: 'hair', now: 'dyed green' },
      { what: 'coat', now: 'bright red' },
    ]);
    const m5 = assembled(b, 'm5', ON).made.prompt;
    expect(m5).toContain('as they are now (hair: dyed green; coat: bright red)');
    expect(m5).not.toContain('cropped short');
    // Where the moment has a thing newer than the picture, the newer is said, never both as now.
    const m6 = assembled(b, 'm6', ON).made.prompt;
    expect(m6).toContain('as they are now (coat: bright red)');
    expect(m6).toContain('Except their hair, which is no longer theirs: it is now shaved off');
    expect(m6).not.toMatch(/as they are now \([^)]*dyed green/);
  });

  test('of one subject, only the latest in-between picture: it was edited from the one before, and shows both', () => {
    const hat = { who: 'p1', what: 'hat', now: 'a paper crown', since: 'm3' };
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the stage' }),
      moment({ id: 'm2', visible: ['p1'], place: 'l2', leaves: [{ who: 'p1', what: 'coat', now: 'bright red' }] }),
      moment({
        id: 'm3',
        visible: ['p1'],
        looks_at: 'the window',
        states: [red],
        leaves: [{ who: 'p1', what: 'hat', now: 'a paper crown' }],
      }),
      moment({ id: 'm4', visible: ['p1'], place: 'l2', looks_at: 'the gate', states: [red, hat] }),
    ]);
    const off = plan(b, OFF);
    expect(
      cut(off, 'm4')
        .refs.filter((r) => r.kind === 'ghost')
        .map((r) => r.id),
    ).toEqual(['g1', 'g2']);
    const on = plan(b, ON);
    expect(on.ghosts.find((g) => g.id === 'g2')).toMatchObject({
      after: 'g1',
      shows: [
        { what: 'coat', now: 'bright red' },
        { what: 'hat', now: 'a paper crown' },
      ],
    });
    const m4 = cut(on, 'm4');
    expect(m4.refs.filter((r) => r.kind === 'ghost').map((r) => r.id)).toEqual(['g2']);
    // The coat is still carried: by the crown's picture, drawn from the coat's.
    expect(m4.changes.some((x) => x.includes('coat'))).toBe(false);
  });
});

describe('the drawing path', () => {
  const S5 = { ...ON, DREAMCHAT_RECORD: 'on' };
  // A saved dream as drawing holds it once every picture is drawn and approved, each moment with a camera
  // worked out on a floor plan given its mock-up (session.ts layoutFor).
  const drawnAll = (dream = 'dream-0926-070314-0f40') =>
    withSwitches(S5, () => {
      const s = loadDream(dream, false).session as Session;
      const r = rebuild(s);
      const drawn: Session = {
        ...s,
        build: {
          ...s.build!,
          plan: r.plan,
          frames: r.pictures.map((p) => ({
            ...p.item,
            ...(p.item.frame?.plan?.eye && shotPlan(r.b, p.id, r.rec)
              ? { layout: { mediaId: standIn.previs(p.id), key: 'k', path: 'p' } }
              : {}),
          })),
          items: r.sheets,
        },
      };
      return { r, drawn };
    });

  test('sends what a rebuild makes, and waits only for what it sends', () => {
    const { r, drawn } = drawnAll();
    const cuts = r.pictures.filter((x) => x.kind === 'cut');
    expect(cuts.some((p) => Object.keys(p.sheet?.refs?.stage ?? {}).length)).toBe(true);
    withSwitches(S5, () => {
      for (const p of cuts) {
        const sheet = drawingSheet(drawn, p.id)!;
        expect(sheet).toEqual(p.sheet!);
        const sent = new Set(assembleCut(sheet).references.map((x) => x.image));
        for (const id of p.item.frame?.plan?.needs ?? [])
          expect([p.id, id, sent.has(standIn.picture(id))]).toEqual([p.id, id, true]);
      }
    });
  });

  test('a picture judged wrong: the edit of it is made from its own shot and mock-up, drawing and rebuilding alike', () => {
    // b91f: m2 edits m1. The owner judges m1 wrong: it is withheld (verdicts.ts), and m2, left an edit, would go
    // out with no camera, no mock-up and nothing carrying the layout.
    const dream = 'dream-0926-095122-b91f';
    const { r, drawn } = drawnAll(dream);
    const m2 = drawn.build!.frames!.find((f) => f.id === 'm2')!;
    const dir = mkdtempSync(join(tmpdir(), 'verdicts-'));
    mkdirSync(join(dir, 'evals'));
    writeFileSync(
      join(dir, 'evals', 'story-pictures.json'),
      JSON.stringify({ rows: [{ session: dream, moment: 'm1', picture: 'm1-judged.png', story: 'wrong' }] }),
    );
    const was = process.env.DREAMCHAT_DATA;
    try {
      withSwitches(S5, () => {
        expect(m2.frame?.plan?.refs.find((x) => x.id === 'm1')?.role).toBe('base');
        expect(assembleCut(drawingSheet(drawn, 'm2')!).references[0]).toMatchObject({ source: 'edit', of: 'm1' });
        process.env.DREAMCHAT_DATA = dir;
        forgetVerdicts();
        // Its mock-up, as layoutFor renders it: through its own camera (none as an edit).
        const own = drawnFrameOf(drawn, m2);
        expect(own.frame?.plan?.eye).toBeTruthy();
        expect(previsFor(r.b, m2, (id) => id, r.rec)).toBeUndefined();
        expect(previsFor(r.b, own, (id) => id, r.rec)).toBeTruthy();
        // Its sheet and prompt as drawing makes them, the mock-up put in as layoutFor puts it.
        const rendered: Session = {
          ...drawn,
          build: {
            ...drawn.build!,
            frames: drawn.build!.frames!.map((f) =>
              f.id === 'm2' ? { ...f, layout: { mediaId: standIn.previs('m2'), key: 'k', path: 'p' } } : f,
            ),
          },
        };
        const made = assembleCut(drawingSheet(rendered, 'm2')!);
        expect(made.references[0]).toMatchObject({ role: 'base', source: 'mockup', of: 'm2' });
        expect(made.references.some((x) => x.of === 'm1')).toBe(false);
        // Never judged against the picture it is not drawn from.
        expect(own.frame?.plan?.criteria.some((k) => k.with === 'm1')).toBe(false);
        // A rebuild makes it the same way.
        const again = rebuild(loadDream(dream, false).session as Session).pictures.find((x) => x.id === 'm2')!;
        expect(again.references[0]?.media_id).toBe(standIn.previs('m2'));
        expect(again.criteria.some((k) => k.with === 'm1')).toBe(false);
      });
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_DATA;
      else process.env.DREAMCHAT_DATA = was;
      forgetVerdicts();
    }
  });

  test('shows someone by their sketch until their in-between picture is drawn and approved', () => {
    const { r, drawn } = drawnAll();
    const p = r.pictures.find((x) => x.kind === 'cut' && Object.keys(x.sheet?.refs?.stage ?? {}).length)!;
    const [who, ghost] = Object.entries(p.sheet!.refs!.stage)[0];
    const waiting: Session = {
      ...drawn,
      build: {
        ...drawn.build!,
        frames: drawn.build!.frames!.map((f) => (f.id === ghost ? { ...f, status: 'waiting' as const } : f)),
      },
    };
    const images = withSwitches(S5, () => assembleCut(drawingSheet(waiting, p.id)!).references.map((x) => x.image));
    expect(images).toContain(r.sheets.find((x) => x.id === who)!.mediaId!);
    expect(images).not.toContain(standIn.picture(ghost));
  });
});
