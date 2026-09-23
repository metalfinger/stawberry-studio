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
    expect(refs('m2')).toEqual(['m1:composition']);
    expect(cut('m2').changes).toEqual(['the action', 'reframed close from picture 1']);
  });

  test('turning to the other side keeps the light and the changed look, not the walls', () => {
    expect(refs('m3')).toEqual(['m2:lighting']);
    expect(cut('m3').sheetLayout).toBe(false);
    // The ice is carried by picture 2, drawn after the change and showing her.
    expect(cut('m3').changes).toEqual(['the action', 'the kitchen facing the window, never drawn']);
  });

  test('an insert takes the room from the cut that shows it, not the one just before', () => {
    expect(refs('m4')).toEqual(['m1:composition']);
  });

  test('a return to the opening setup edits the old wide, and takes the ice from the latest cut showing it', () => {
    expect(refs('m5')).toEqual(['m1:base', 'm3:identity']);
    expect(cut('m5').transition).toBe('continuous');
    expect(cut('m5').changes).toEqual(['the action']);
  });

  test('a reverse angle out of the door carries on from the picture before', () => {
    expect(refs('m6')).toEqual(['m5:lighting']);
    expect(cut('m6').needs).toEqual(['m5']);
  });

  test('no ghost is made when earlier cuts already carry everything', () => {
    expect(plan.ghosts).toEqual([]);
    expect(plan.issues).toEqual([]);
  });

  test('checks compare each cut with the pictures it was drawn from', () => {
    const texts = cut('m5').criteria.map((c) => `${c.with}: ${c.text}`);
    expect(texts).toContain(
      'm1: Is the second picture the same view as the first, a moment later: the same place from the same side, in the same light?',
    );
    expect(texts).toContain("null: In this picture, is ana's head a block of glittering ice?");
  });

  test('pictures are drawn in story order', () => {
    expect(drawOrder(plan)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });
});

describe('ghosts', () => {
  test("a change seen through the dreamer's eyes, then shown twice, becomes one state ghost", () => {
    const glass = { who: 'p1', what: 'hands', now: 'clear glass', since: 'm1' };
    const b = breakdown(
      [
        moment({
          id: 'm1',
          eyes: 'dreamer',
          distance: 'close',
          leaves: [{ who: 'p1', what: 'hands', now: 'clear glass' }],
        }),
        moment({ id: 'm2', visible: ['p1'], from: null, sameSide: [], looks_at: 'the mirror', states: [glass] }),
        moment({ id: 'm3', visible: ['p1'], place: 'l2', distance: 'wide', from: 'm2', states: [glass] }),
      ],
      {},
    );
    b.people[0].is_dreamer = true;
    const plan = planContinuity(b);
    expect(plan.ghosts).toHaveLength(1);
    const g = plan.ghosts[0];
    expect(g).toMatchObject({ kind: 'state', of: 'p1', from: 'm1', needs: ['m1'], usedBy: ['m2', 'm3'] });
    // Picture 2 takes the look from the ghost; picture 3 from picture 2, which shows it.
    expect(plan.cuts[1].refs.map((r) => r.id)).toContain('g1');
    expect(plan.cuts[2].refs.map((r) => `${r.id}:${r.role}`)).toEqual(['m2:identity']);
    expect(drawOrder(plan)).toEqual(['m1', 'g1', 'm2', 'm3']);
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
