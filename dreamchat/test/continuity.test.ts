import { describe, expect, test } from 'bun:test';
import { drawOrder, planContinuity } from '../continuity';
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
    // After the jump, the picture before it gives only how she looks, never the room.
    expect(plan.cuts[2].refs.map((r) => `${r.id}:${r.role}:${r.relation}`)).toEqual(['m2:identity:other_place']);
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
});
