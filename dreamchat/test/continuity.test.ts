import { describe, expect, test } from 'bun:test';
import { drawOrder, meant, placePlan, planBy, planContinuity } from '../continuity';
import type { Breakdown, Moment } from '../producer';

const detail = (value: string | null = null) => ({ value, said: false });

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

function breakdown(ms: Moment[], extra: Partial<Breakdown> = {}): Breakdown {
  return {
    title: 't',
    logline: '',
    look: { colours: detail(), light: detail(), texture: detail() },
    world_logic: '',
    people: [
      {
        id: 'p1',
        name: 'ana',
        is_dreamer: false,
        protagonist: true,
        fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
      },
    ],
    places: [
      { id: 'l1', name: 'the kitchen', fields: { geography: detail(), landmarks: detail(), light: detail() } },
      { id: 'l2', name: 'the street', fields: { geography: detail(), landmarks: detail(), light: detail() } },
    ],
    things: [{ id: 't1', name: 'the board', fields: { appearance: detail(), materials: detail() } } as never],
    scenes: [{ id: 's1', title: '', place: 'l1', mood: '', moments: ms }],
    style_options: [],
    unknowns: [],
    ...extra,
  };
}

const ice = { who: 'p1', what: 'head', now: 'a block of glittering ice', since: 'm2' };

// Six cuts in one kitchen: the counter side, a turn to the window, an insert, a return to the
// opening setup, and a reverse angle out of the door.
const kitchen = breakdown([
  moment({ id: 'm1', visible: ['p1'], distance: 'wide', looks_at: 'the counter' }),
  moment({
    id: 'm2',
    visible: ['p1'],
    distance: 'close',
    looks_at: 'the counter',
    from: 'm1',
    sameSide: ['m1'],
    leaves: [{ who: 'p1', what: 'head', now: 'a block of glittering ice' }],
  }),
  moment({ id: 'm3', visible: ['p1'], looks_at: 'the window', from: 'm2', sameSide: [], states: [ice] }),
  moment({
    id: 'm4',
    things: ['t1'],
    eyes: 'dreamer',
    distance: 'close',
    looks_at: 'the counter',
    from: 'm1',
    sameSide: ['m1', 'm2'],
  }),
  moment({
    id: 'm5',
    visible: ['p1'],
    distance: 'wide',
    looks_at: 'the counter',
    from: 'm1',
    sameSide: ['m1', 'm2', 'm4'],
    states: [ice],
  }),
  moment({
    id: 'm6',
    visible: ['p1'],
    distance: 'wide',
    looks_at: 'the door',
    from: 'm5',
    sameSide: [],
    states: [ice],
  }),
]);

describe('the continuity plan', () => {
  const plan = planContinuity(kitchen);
  const cut = (id: string) => plan.cuts.find((c) => c.id === id)!;
  const refs = (id: string) => cut(id).refs.map((r) => `${r.id}:${r.role}`);

  test('the first picture is drawn from the sheets alone', () => {
    expect(refs('m1')).toEqual([]);
    expect(cut('m1').transition).toBe('cut');
    expect(cut('m1').depth).toBe(1);
  });

  test('a new size from the same side takes the room from the wider cut', () => {
    expect(refs('m2')).toEqual(['m1:composition', 'g1:identity']);
    expect(cut('m2').changes).toEqual(['the action', 'reframed close from picture 1']);
  });

  test('turning to the other side keeps the light and the changed look, not the walls', () => {
    expect(refs('m3')).toEqual(['m2:lighting', 'g1:identity']);
    expect(cut('m3').sheetLayout).toBe(false);
    // The ice is carried by picture 2, drawn after the change and showing her.
    expect(cut('m3').changes).toEqual(['the action', 'the kitchen facing the window, never drawn']);
  });

  test('an insert takes the room from the cut that shows it, not the one just before', () => {
    expect(refs('m4')).toEqual(['m1:composition']);
  });

  test('a return to the opening setup is the same shot: it edits the old wide, and takes the ice from its ghost', () => {
    expect(refs('m5')).toEqual(['m1:base', 'g1:identity']);
    expect(cut('m5').shot).toBe(cut('m1').shot);
    expect(new Set(plan.cuts.map((c) => c.shot)).size).toBe(5);
    expect(cut('m5').transition).toBe('continuous');
    expect(cut('m5').changes).toEqual(['the action']);
  });

  test('a reverse angle out of the door carries on from the picture before', () => {
    expect(refs('m6')).toEqual(['m5:lighting', 'g1:identity']);
    expect(cut('m6').needs).toEqual(['m5', 'g1']);
  });

  test('a lasting change is drawn once on its own, from the sheet, and every picture from the change on takes it', () => {
    expect(plan.ghosts).toHaveLength(1);
    expect(plan.ghosts[0]).toMatchObject({
      id: 'g1',
      kind: 'state',
      of: 'p1',
      from: null,
      needs: [],
      usedBy: ['m2', 'm3', 'm5', 'm6'],
    });
    expect(plan.issues).toEqual([]);
  });

  test('checks compare each cut with the pictures it was drawn from', () => {
    const texts = cut('m5').criteria.map((c) => `${c.with}: ${c.text}`);
    expect(texts).toContain(
      'm1: Is the second picture the same view as the first, a moment later: the same place from the same side, in the same light?',
    );
    expect(texts).toContain("null: In this picture, is ana's head a block of glittering ice?");
    // Everyone is also held to their own sheet, and each check can be said as a fix.
    expect(texts).toContain(
      'sheet:p1: Is ana the same person as in their reference sheet: the same face, hair and clothes?',
    );
    expect(cut('m5').criteria.find((c) => c.with === 'm1')?.fix).toBe(
      'keep the view of picture 1 exactly: the same place, from the same side, in the same light, a moment later',
    );
  });

  test('pictures are drawn in story order', () => {
    expect(drawOrder(plan)).toEqual(['g1', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });
});

describe('ghosts', () => {
  test('a change that goes on changing is a chain of ghosts, one edit each, each from the one before', () => {
    const iceHead = { who: 'p1', what: 'head', now: 'a block of ice', since: 'm2' };
    const melting = { who: 'p1', what: 'head', now: 'melting ice', since: 'm3' };
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the counter' }),
      moment({
        id: 'm2',
        visible: ['p1'],
        looks_at: 'the counter',
        from: 'm1',
        sameSide: ['m1'],
        leaves: [{ who: 'p1', what: 'head', now: 'a block of ice' }],
      }),
      moment({
        id: 'm3',
        visible: ['p1'],
        looks_at: 'the counter',
        from: 'm2',
        sameSide: ['m1', 'm2'],
        states: [iceHead],
        leaves: [{ who: 'p1', what: 'head', now: 'melting ice' }],
      }),
      moment({
        id: 'm4',
        visible: ['p1'],
        looks_at: 'the counter',
        from: 'm3',
        sameSide: ['m1', 'm2', 'm3'],
        states: [melting],
        leaves: [{ who: 'p1', what: 'head', now: "a horse's head of ice" }],
      }),
    ]);
    const plan = planContinuity(b);
    expect(plan.ghosts.map((g) => [g.id, g.state?.now, g.after ?? null, g.needs])).toEqual([
      ['g1', 'a block of ice', null, []],
      ['g2', 'melting ice', 'g1', ['g1']],
      ['g3', "a horse's head of ice", 'g2', ['g2']],
    ]);
    // Each moment takes its own change's ghost, not the look it replaces.
    expect(plan.cuts.map((c) => c.refs.filter((r) => r.kind === 'ghost').map((r) => r.id))).toEqual([
      [],
      ['g1'],
      ['g2'],
      ['g3'],
    ]);
    expect(drawOrder(plan)).toEqual(['g1', 'm1', 'g2', 'g3', 'm2', 'm3', 'm4']);
    // A moment's own change replaces what that part was: the horse's head is told and checked as
    // the horse's head, never as the melting ice it was a moment ago.
    expect(plan.cuts.map((c) => [c.own.map((st) => st.now), c.states.map((st) => st.now)])).toEqual([
      [[], []],
      [['a block of ice'], []],
      [['melting ice'], []],
      [["a horse's head of ice"], []],
    ]);
    const checks = plan.cuts[3].criteria.map((k) => k.text).filter((t) => t.includes('head'));
    expect(checks).toEqual(["In this picture, is ana's head a horse's head of ice?"]);
  });

  test('a scene places its people once, left to right, and every picture of it keeps the order', () => {
    const person = (id: string, name: string, is_dreamer = false) => ({
      id,
      name,
      is_dreamer,
      protagonist: false,
      fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
    });
    const b = breakdown(
      [
        moment({ id: 'm1', visible: ['p2', 'p1'] }),
        moment({ id: 'm2', visible: ['p1'] }),
        moment({ id: 'm3', visible: ['p1', 'p2'] }),
        moment({ id: 'm4', visible: ['p1', 'p3', 'p2'] }),
        moment({ id: 'm5', visible: ['p1', 'p2'], shift: 'the room turns to glass' }),
      ],
      { people: [person('p1', 'ana'), person('p2', 'you', true), person('p3', 'the juggler')] },
    );
    const plan = planContinuity(b);
    expect(plan.cuts.map((c) => c.staging)).toEqual([
      ['p2', 'p1'],
      [],
      // Listed the other way round, still placed as the scene first placed them.
      ['p2', 'p1'],
      // Whoever joins stands to their right.
      ['p2', 'p1', 'p3'],
      // A jump starts the staging again.
      ['p1', 'p2'],
    ]);
    expect(plan.cuts[2].criteria.map((k) => k.text)).toContain('From left to right in the frame, is it the dreamer, then ana?');
    expect(plan.cuts[1].criteria.some((k) => k.text.startsWith('From left to right'))).toBe(false);
  });

  test("on a floor plan, the dreamer's view is found from their seat, with only who is there by then", () => {
    const person = (id: string, name: string, dreamer = false) => ({
      id,
      name,
      is_dreamer: dreamer,
      protagonist: dreamer,
      fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
    });
    const b = breakdown(
      [
        moment({ id: 'm1', visible: ['p1', 'p2'], things: ['t1'] }),
        moment({ id: 'm2', things: ['t1'], eyes: 'dreamer', looks_at: 'the board', from: 'm1' }),
        // Someone who only comes in later is not in the room yet in m2.
        moment({ id: 'm3', visible: ['p1', 'p2', 'p3'], from: 'm2' }),
      ],
      {
        people: [person('p1', 'you', true), person('p2', 'ana'), person('p3', 'the waiter')],
      },
    );
    b.scenes[0].blocking = {
      front: 'the counter',
      indoors: true,
      spots: [
        { id: 'p1', x: 5, y: 5, kind: 'person', pose: 'standing' },
        { id: 'p2', x: 4, y: 5, kind: 'person', pose: 'standing' },
        { id: 'p3', x: 2, y: 5, kind: 'person', pose: 'standing' },
        { id: 't1', x: 1, y: 5, kind: 'thing', size: [1.2, 0.1, 0.9] },
      ],
    };
    const pov = planContinuity(b).cuts[1];
    // Turned to their left, toward the board: ana stands between, the waiter has not come in.
    expect(pov.eye?.height).toBe(1.62);
    expect(pov.view).toContain('turned to their left, toward the board');
    expect(pov.view).toContain(': ana, ');
    expect(pov.view).not.toContain('waiter');
    expect(pov.sees).toEqual(expect.arrayContaining(['p2', 't1']));
    expect(pov.sees).not.toContain('p3');
  });

  test("through the dreamer's own eyes the dreamer is the camera: never staged, never checked for a face", () => {
    const b = breakdown(
      [
        moment({ id: 'm1', visible: ['p2', 'p1'], eyes: 'outside' }),
        moment({ id: 'm2', visible: ['p2', 'p1'], eyes: 'dreamer', from: 'm1' }),
      ],
      {
        people: [
          {
            id: 'p1',
            name: 'ana',
            is_dreamer: false,
            protagonist: true,
            fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
          },
          {
            id: 'p2',
            name: 'you',
            is_dreamer: true,
            protagonist: false,
            fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
          },
        ],
      },
    );
    const [outside, pov] = planContinuity(b).cuts;
    expect(outside.staging).toEqual(['p2', 'p1']);
    expect(pov.staging).toEqual([]);
    const texts = pov.criteria.map((k) => `${k.with}: ${k.text}`);
    expect(texts.some((t) => t.includes('the dreamer the same person'))).toBe(false);
    expect(texts.some((t) => t.startsWith('sheet:p2'))).toBe(false);
    expect(texts.some((t) => t.startsWith('sheet:p1'))).toBe(true);
    // The camera is where the dreamer was seen: that picture places it, and the judge checks it.
    expect(pov.refs.map((r) => `${r.id}:${r.relation}`)).toContain('m1:seat');
    expect(texts.some((t) => t.startsWith('m1: Is the second picture seen through the dreamer'))).toBe(true);
  });

  test('a place seen so far only from another side still gives its light', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], place: 'l1', looks_at: 'the door' }),
      moment({ id: 'm2', visible: ['p1'], place: 'l2', looks_at: 'the road' }),
      moment({ id: 'm3', visible: ['p1'], place: 'l1', looks_at: 'the window' }),
    ]);
    const m3 = planContinuity(b).cuts[2];
    expect(m3.refs.find((r) => r.id === 'm1')).toMatchObject({ role: 'lighting', relation: 'other_side' });
  });

  test('only a look lasts: a change of where someone is makes no ghost', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'] }),
      moment({ id: 'm2', visible: ['p1'], leaves: [{ who: 'p1', what: 'location', now: 'at the far end of the room' }] }),
    ]);
    const plan = planContinuity(b);
    expect(plan.ghosts).toEqual([]);
    expect(plan.cuts[1].own).toEqual([]);
  });

  test('turning into something else is a change even where they are first shown', () => {
    // Mrs Okafor, first seen as she turned round a heron, was drawn a woman ever after (26 Sep).
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], leaves: [{ who: 'p1', what: 'body', now: 'a tall grey heron', whole: true }] }),
      // Carried into the moment after, as the pipeline writes it (addChanges).
      moment({
        id: 'm2',
        visible: ['p1'],
        from: 'm1',
        states: [{ who: 'p1', what: 'body', now: 'a tall grey heron', since: 'm1', whole: true }],
      }),
    ]);
    const plan = planContinuity(b);
    expect(plan.cuts[0].own.map((st) => st.now)).toEqual(['a tall grey heron']);
    expect(plan.cuts[1].states.map((st) => st.now)).toEqual(['a tall grey heron']);
  });

  test('a change still in force is carried into a moment that changes something else', () => {
    // Seen before the change: where they are first shown, how they look is no change (25 Sep).
    const b = breakdown([
      moment({ id: 'm0', visible: ['p1'] }),
      moment({ id: 'm1', visible: ['p1'], from: 'm0', leaves: [{ who: 'p1', what: 'head', now: 'a block of ice' }] }),
      moment({
        id: 'm2',
        visible: ['p1'],
        from: 'm1',
        states: [{ who: 'p1', what: 'head', now: 'a block of ice', since: 'm1' }],
        leaves: [{ who: 'p1', what: 'coat', now: 'soaked through' }],
      }),
    ]);
    const m2 = planContinuity(b).cuts[2];
    expect(m2.own.map((st) => `${st.what}: ${st.now}`)).toEqual(['coat: soaked through']);
    expect(m2.states.map((st) => `${st.what}: ${st.now}`)).toEqual(['head: a block of ice']);
  });

  test("a dream's jump is a boundary: what follows takes nothing of the place from before it", () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the window' }),
      moment({
        id: 'm2',
        visible: ['p1'],
        looks_at: 'the window',
        from: 'm1',
        sameSide: ['m1'],
        shift: 'the window becomes the whole world',
      }),
      moment({ id: 'm3', visible: ['p1'], looks_at: 'the window', from: 'm2', sameSide: ['m1', 'm2'] }),
    ]);
    const plan = planContinuity(b);
    expect(plan.cuts[1].refs.map((r) => `${r.id}:${r.relation}`)).toEqual(['m1:shift']);
    // After the jump, the picture before it is only where she was last seen, never the room; her
    // sketch still says who she is.
    expect(plan.cuts[2].refs.map((r) => `${r.id}:${r.role}:${r.relation}`)).toEqual(['m2:identity:other_place']);
    expect(plan.cuts[2].refs[0].who).toEqual(['p1']);
    expect(plan.cuts[2].shot).not.toBe(plan.cuts[0].shot);
  });

  test('a close-up first facing a new side gets a view ghost for the wider pictures of that side', () => {
    const b = breakdown([
      moment({ id: 'm1', distance: 'wide', looks_at: 'the window' }),
      moment({ id: 'm2', distance: 'close', looks_at: 'the door', from: 'm1', sameSide: [] }),
      moment({ id: 'm3', distance: 'wide', looks_at: 'the door', from: 'm2', sameSide: ['m2'] }),
    ]);
    const plan = planContinuity(b);
    expect(plan.ghosts).toHaveLength(1);
    expect(plan.ghosts[0]).toMatchObject({
      kind: 'view',
      of: 'l1',
      from: 'm1',
      usedBy: ['m2', 'm3'],
      looksAt: 'the door',
    });
    expect(plan.cuts[2].refs.map((r) => `${r.id}:${r.role}`)).toEqual(['m2:composition', 'g1:location']);
  });

  test('a jump the dream made is a match cut from the picture before, never an edit of it', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], looks_at: 'the counter' }),
      moment({
        id: 'm2',
        visible: ['p1'],
        looks_at: 'the counter',
        from: 'm1',
        sameSide: ['m1'],
        shift: 'the kitchen becomes a station platform around her',
      }),
    ]);
    const plan = planContinuity(b);
    expect(plan.cuts[1].refs.map((r) => `${r.id}:${r.role}:${r.relation}`)).toEqual(['m1:composition:shift']);
    expect(plan.cuts[1].matchFrame).toBe('m1');
    expect(plan.cuts[1].transition).toBe('dream shift: the kitchen becomes a station platform around her');
  });

  test('base edits run at most two in a row, then the cut is drawn afresh from the sheets', () => {
    const b = breakdown(
      ['m1', 'm2', 'm3', 'm4'].map((id, i) =>
        moment({
          id,
          visible: ['p1'],
          looks_at: 'the counter',
          from: i ? `m${i}` : null,
          sameSide: Array.from({ length: i }, (_, k) => `m${k + 1}`),
        }),
      ),
    );
    const plan = planContinuity(b);
    expect(plan.cuts.map((c) => c.refs.map((r) => `${r.id}:${r.role}`).join(','))).toEqual([
      '',
      'm1:base',
      'm2:base',
      'm3:composition',
    ]);
  });

  test('a floor plan by moment: each person where their latest move leaves them, fixtures always there', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'] }),
      moment({ id: 'm2', visible: ['p1'] }),
      moment({ id: 'm3', visible: ['p1'] }),
    ]);
    b.scenes[0].blocking = {
      front: 'the stove',
      spots: [
        { id: 'p1', x: 4, y: 2, kind: 'person' },
        { id: 'x1', x: 5, y: 0.5, kind: 'thing', fixture: true, name: 'the stove' },
      ],
      moves: { m2: [{ id: 'p1', x: 4, y: 8, faces: 'back' }] },
    };
    const at = (id: string) => planBy(b, id)!.spots.find((s) => s.id === 'p1')!;
    expect([at('m1').y, at('m2').y, at('m3').y]).toEqual([2, 8, 8]);
    expect(at('m2').faces).toBe('back');
    expect(planBy(b, 'm1')!.spots.some((s) => s.id === 'x1')).toBe(true);
  });

  test('a moment in another place of its scene gets that place\'s plan, with who was there', () => {
    const b = breakdown([
      moment({ id: 'm1', visible: ['p1'], place: 'l1' }),
      moment({ id: 'm2', visible: ['p1'], things: ['t1'], place: 'l2' }),
    ]);
    b.scenes[0].blocking = {
      front: 'the stairs',
      spots: [{ id: 'p1', x: 1, y: 1, kind: 'person' }],
      places: {
        l2: {
          front: 'the stove',
          room: [2.4, 2.2],
          spots: [
            { id: 'p1', x: 1.2, y: 1.6, kind: 'person' },
            { id: 't1', x: 1.2, y: 0.5, kind: 'thing', size: [2, 0.8, 0.9] },
          ],
        },
      },
    };
    expect(placePlan(b, 'm1')?.front).toBe('the stairs');
    expect(placePlan(b, 'm2')?.room).toEqual([2.4, 2.2]);
    expect(planBy(b, 'm2')!.spots.map((s) => [s.id, s.y])).toEqual([
      ['p1', 1.6],
      ['t1', 0.5],
    ]);
  });
});

describe('what a moment looks at', () => {
  const names = [
    { id: 'p1', name: 'the dreamer' },
    { id: 'p2', name: 'the Pied-Piper sort of man' },
    { id: 'p3', name: 'the young woman' },
    { id: 'x1', name: 'the cobblestone street' },
    { id: 't1', name: 'the stove' },
    { id: 't3', name: 'the string of blue balloons' },
  ];
  test('is the name sharing most of its words, what each is about counting double', () => {
    expect(meant('the village street', names)).toBe('x1');
    expect(meant('the woman at the stove', names)).toBe('p3');
    expect(meant('the piper man', names)).toBe('p2');
    expect(meant('the balloons', names)).toBe('t3');
    expect(meant('the stove', names)).toBe('t1');
    expect(meant('the sky', names)).toBeUndefined();
    // One word in passing is not the same thing.
    expect(meant('the village street', [{ id: 'x1', name: 'village houses left' }])).toBeUndefined();
    // Every word of a name said is that thing, whatever else is said.
    expect(meant('the autoclave side of the room', [{ id: 'x1', name: 'the autoclave' }])).toBe('x1');
  });
});
