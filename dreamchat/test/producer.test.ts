import { describe, expect, test } from 'bun:test';
import { rawPlanBy } from '../continuity';
import { addChanges, type Breakdown, completeViews, mergeBecomings, normalizeBreakdown, readBlocking, VAGUE } from '../producer';

const detail = (value: string | null, said = false) => ({ value, said });
const person = (id: string, name: string, identity: string) => ({
  id,
  name,
  is_dreamer: false,
  protagonist: id === 'p1',
  fields: {
    identity: detail(identity),
    appearance: detail(null),
    wardrobe: detail(null),
    distinctive_features: detail('none'),
  },
});
const moment = (id: string, action: string, things: string[] = [], leaves: Breakdown['scenes'][number]['moments'][number]['leaves'] = []) => ({
  id,
  action,
  visible: ['p1'],
  things,
  place: 'l1',
  eyes: 'outside',
  distance: 'wide',
  looks_at: '',
  feeling: '',
  visual_point: '',
  purpose: '',
  continues: false,
  leaves,
  shift: '',
  key: id === 'm1',
  said: true,
});

describe('the breakdown, as the harness completes it', () => {
  const raw = {
    title: 'The theater',
    people: [person('p1', 'the girlfriend', "the dreamer's friend"), person('p2', 'the crowd', 'other people in the theater')],
    places: [{ id: 'l1', name: 'the theater', fields: {} }],
    things: [
      { id: 't1', name: 'the blue sofa', fields: {} },
      { id: 't2', name: 'the big sofa', fields: {} },
    ],
    scenes: [
      {
        id: 's1',
        title: '',
        place: 'l1',
        mood: '',
        moments: [
          moment('m1', 'They sit on the blue sofa beside the big sofa.', ['t1', 't2']),
          moment('m2', 'The large sofa next to them turns into a roller coaster.', ['t1'], [
            { who: 't2', what: 'form', now: 'a roller coaster' },
          ]),
          moment('m3', 'The roller coaster stands where the sofa was, like one at a fair.'),
        ],
      },
    ],
    style_options: [],
  };

  test('a crowd is said in words and never sketched', () => {
    const { breakdown } = normalizeBreakdown(JSON.stringify(raw));
    expect(breakdown.people.map((p) => [p.name, !!p.extras, !!p.several])).toEqual([
      ['the girlfriend', false, false],
      ['the crowd', true, true],
    ]);
  });

  test('a moment shows the thing it changes, and the thing it names as what it became', () => {
    const b = normalizeBreakdown(JSON.stringify(raw)).breakdown;
    expect(b.scenes[0].moments.map((m) => m.things)).toEqual([['t1', 't2'], ['t1', 't2'], ['t2']]);
    // Named only by a word two things share ("the sofa"), it is left to the moment's own list.
    expect(completeViews(b)).toEqual([]);
  });

  test('a value that says nothing is no value', () => {
    for (const v of ['none', 'None.', 'n/a', 'nothing', 'none notable']) expect(VAGUE.test(v)).toBe(true);
    for (const v of ['a scar over the left eye', 'nonexistent eyebrows']) expect(VAGUE.test(v)).toBe(false);
  });
});

describe('the floor plan a model gives', () => {
  // The ice head: the dreamer and a young woman talk by the autoclave; she walks to the far end and back.
  const lab = (): Breakdown =>
    ({
      title: 'the ice head',
      logline: '',
      look: { colours: detail(null), light: detail(null), texture: detail(null) },
      world_logic: '',
      people: [person('p1', 'the young woman', 'a young woman'), { ...person('p2', 'you', 'the dreamer'), is_dreamer: true }],
      places: [{ id: 'l1', name: 'the room', fields: { geography: detail(null), landmarks: detail('an autoclave'), light: detail(null) } }],
      things: [],
      scenes: [
        {
          id: 's1',
          title: '',
          place: 'l1',
          mood: '',
          moments: [
            { ...moment('m1', 'They talk by the autoclave.'), visible: ['p1', 'p2'] },
            { ...moment('m2', 'She walks off to the far end of the room.'), visible: ['p1'] },
            { ...moment('m3', 'She comes back.'), visible: ['p1'] },
          ],
        },
      ],
      style_options: [],
      unknowns: [],
    }) as unknown as Breakdown;

  test("keeps the place's fixtures, drops what names nothing, and holds who moves where", () => {
    const { breakdown } = readBlocking(lab(), {
      scenes: [
        {
          id: 's1',
          front: 'the wall with the autoclave',
          indoors: true,
          ceiling: 3.2,
          spots: [
            { id: 'p1', x: 4, y: 1.5, faces: 'p2', pose: 'standing' },
            // "t1" is in no plan: they face the front instead.
            { id: 'p2', x: 5.2, y: 1.5, faces: 't1', pose: 'standing' },
            { id: 'x1', name: 'the autoclave', x: 4.6, y: 0.5, size: [0.9, 0.7, 1.5] },
            { id: 't9', x: 1, y: 1 },
          ],
          moves: {
            m2: [{ id: 'p1', x: 4, y: 8.5, faces: 'back', pose: 'standing' }],
            m3: [{ id: 'p1', x: 4.2, y: 1.6, faces: 'p2' }],
            m9: [{ id: 'p1', x: 1, y: 1 }],
          },
        },
      ],
    });
    const plan = breakdown.scenes[0].blocking!;
    expect(plan.spots.map((s) => s.id)).toEqual(['p1', 'p2', 'x1']);
    expect(plan.spots.find((s) => s.id === 'p1')?.faces).toBe('p2');
    expect(plan.spots.find((s) => s.id === 'p2')?.faces).toBeUndefined();
    expect(plan.spots.find((s) => s.id === 'x1')).toMatchObject({ fixture: true, name: 'the autoclave', size: [0.9, 0.7, 1.5] });
    expect(Object.keys(plan.moves ?? {})).toEqual(['m2', 'm3']);
    expect(plan.moves?.m2[0]).toMatchObject({ id: 'p1', y: 8.5, faces: 'back' });
  });

  test('keeps what each thing is to whoever is at it, who holds what, and how many a crowd is', () => {
    const b = lab();
    b.things = [{ id: 't1', name: 'a string of blue balloons', fields: {} }] as unknown as Breakdown['things'];
    b.scenes[0].moments[0].things = ['t1'];
    const { breakdown } = readBlocking(b, {
      scenes: [
        {
          id: 's1',
          front: 'the wall with the autoclave',
          spots: [
            { id: 'p1', x: 4, y: 1.5, pose: 'standing' },
            { id: 'p2', x: 5.2, y: 1.5, pose: 'standing' },
            { id: 't1', x: 4, y: 1.5, size: [0.5, 0.5, 1], shape: 'block', held_by: 'p2' },
            { id: 'x1', name: 'the autoclave', x: 4.6, y: 0.5, size: [0.9, 0.7, 1.5], shape: 'a machine' },
            { id: 'x2', name: 'the floor mat', x: 3, y: 3, size: [2, 1, 0.02], shape: 'ground', held_by: 'p9' },
          ],
        },
      ],
    });
    const plan = breakdown.scenes[0].blocking!;
    expect(plan.spots.find((s) => s.id === 't1')).toMatchObject({ shape: 'block', heldBy: 'p2' });
    // A shape that is none of the five, and a holder nobody is, are left out.
    expect(plan.spots.find((s) => s.id === 'x1')?.shape).toBeUndefined();
    expect(plan.spots.find((s) => s.id === 'x2')).toMatchObject({ shape: 'ground' });
    expect(plan.spots.find((s) => s.id === 'x2')?.heldBy).toBeUndefined();
  });

  test('a thing handed over partway is held by each in turn, from the moment it changes hands', () => {
    const b = lab();
    b.things = [{ id: 't1', name: 'the paper boat', fields: {} }] as unknown as Breakdown['things'];
    for (const m of b.scenes[0].moments) m.things = ['t1'];
    const { breakdown } = readBlocking(b, {
      scenes: [
        {
          id: 's1',
          spots: [
            { id: 'p1', x: 2, y: 2, pose: 'sitting' },
            { id: 'p2', x: 3, y: 2, pose: 'standing' },
            { id: 't1', held_by: 'p1' },
          ],
          // The father hands the boat over at m2, and it is put down at m3.
          moves: { m2: [{ id: 't1', held_by: 'p2' }], m3: [{ id: 't1', held_by: '', x: 4, y: 4 }] },
        },
      ],
    });
    expect(breakdown.scenes[0].blocking?.moves?.m2).toEqual([{ id: 't1', x: 2, y: 2, heldBy: 'p2' }]);
    const heldAt = (m: string) => rawPlanBy(breakdown, m)?.spots.find((x) => x.id === 't1')?.heldBy;
    expect([heldAt('m1'), heldAt('m2'), heldAt('m3')]).toEqual(['p1', 'p2', undefined]);
  });

  test('a held thing given with no spot of its own is where its holder is', () => {
    const b = lab();
    b.things = [{ id: 't1', name: 'the paper lantern', fields: {} }] as unknown as Breakdown['things'];
    b.scenes[0].moments[0].things = ['t1'];
    const plan = (held: Record<string, unknown>) =>
      readBlocking(b, {
        scenes: [
          {
            id: 's1',
            spots: [{ id: 'p1', x: 4, y: 1.5, pose: 'sitting' }, { id: 'p2', x: 4.8, y: 1.5, pose: 'sitting' }, held],
          },
        ],
      }).breakdown.scenes[0].blocking;
    // The night bus's lantern, as the plan gave it in two runs of five.
    expect(plan({ id: 't1', held_by: 'p2' })?.spots.find((s) => s.id === 't1')).toMatchObject({ x: 4.8, y: 1.5, heldBy: 'p2' });
    // Held by nobody in the plan, it still has no spot, and the scene no plan.
    expect(plan({ id: 't1', held_by: 'p9' })).toBeUndefined();
  });
});

describe('someone who turns into someone the dream also lists', () => {
  const dream = (heronWithHer = false): Breakdown =>
    ({
      people: [
        { ...person('p1', 'you', 'the dreamer'), is_dreamer: true },
        person('p2', 'Mrs Okafor', 'the maths teacher'),
        person('p3', 'the heron', 'a tall grey heron'),
      ],
      scenes: [
        {
          id: 's1',
          moments: [
            { ...moment('m1', 'Mrs Okafor writes on the board.'), visible: ['p2'] },
            {
              ...moment('m2', 'She turns round, a heron now.'),
              visible: heronWithHer ? ['p2', 'p3'] : ['p3'],
              leaves: [{ who: 'p2', what: 'entire body', now: 'becomes a tall grey heron in a red cardigan', whole: true }],
            },
            { ...moment('m3', 'The heron flies out of the window.'), visible: ['p1', 'p3'] },
          ],
        },
      ],
    }) as unknown as Breakdown;

  test('is one person: the later moments show the one who changed, and the change says what they are now', () => {
    const b = dream();
    expect(mergeBecomings(b)).toEqual(['the heron is what Mrs Okafor turns into: one person, not two']);
    expect(b.people.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(b.scenes[0].moments.map((m) => m.visible)).toEqual([['p2'], ['p2'], ['p1', 'p2']]);
    expect(b.scenes[0].moments[1].leaves[0].now).toBe('a tall grey heron in a red cardigan');
  });

  test('is one person too when the change is said as a turning of one part, before Jev reads it', () => {
    const b = dream();
    b.scenes[0].moments[1].leaves = [{ who: 'p2', what: 'body', now: 'transformed into a grey heron with red cardigan' }];
    expect(mergeBecomings(b)).toHaveLength(1);
    expect(b.scenes[0].moments[1].leaves[0].now).toBe('a grey heron with red cardigan');
  });

  test('is two when both are in one moment', () => {
    const b = dream(true);
    expect(mergeBecomings(b)).toEqual([]);
    expect(b.people).toHaveLength(3);
  });
});

describe('a change the script supervisor finds', () => {
  test('is written where it happens and carried into every later moment that shows them, until the same part changes', () => {
    const b = {
      scenes: [
        {
          id: 's1',
          moments: [
            { ...moment('m3', 'She comes back with a block of ice for a head.'), leaves: [] },
            { ...moment('m4', 'The ice melts and carves itself.'), leaves: [], states: [] },
            { ...moment('m5', 'It is a horse head of ice.'), leaves: [{ who: 'p1', what: 'head', now: 'a horse head of clear ice' }] },
            { ...moment('m6', 'She stands there.'), leaves: [] },
          ],
        },
      ],
    } as unknown as Breakdown;
    addChanges(b, [{ moment: 'm3', who: 'p1', what: 'head', now: 'an irregular block of glittering ice' }]);
    const [m3, m4, m5, m6] = b.scenes[0].moments;
    expect(m3.leaves).toEqual([{ who: 'p1', what: 'head', now: 'an irregular block of glittering ice' }]);
    expect(m4.states).toEqual([{ who: 'p1', what: 'head', now: 'an irregular block of glittering ice', since: 'm3' }]);
    // The horse head replaces it from m5 on: nothing of the ice block is carried past it.
    expect(m5.states ?? []).toEqual([]);
    expect(m6.states ?? []).toEqual([]);
  });
});

describe('a scene through several places', () => {
  test('gets a plan for each place, each the size it is, and a car moves with who rides in it', () => {
    const b = {
      title: 'the house',
      people: [person('p1', 'you', 'the dreamer'), person('p3', 'the young woman', 'a young woman'), person('p4', 'the aunt', 'an aunt')],
      things: [
        { id: 't1', name: 'the stove', fields: {} },
        { id: 't2', name: 'the little round convertible', fields: {} },
      ],
      places: [],
      scenes: [
        {
          id: 's2',
          place: 'l3',
          moments: [
            { ...moment('m3', 'Up the back stairs.'), visible: ['p1'], place: 'l3' },
            { ...moment('m5', 'She cooks at a stove that almost fills the tiny room.', ['t1']), visible: ['p3'], place: 'l4' },
          ],
        },
        {
          id: 's3',
          place: 'l5',
          moments: [
            { ...moment('m6', 'The aunt arrives.', ['t2']), visible: ['p1', 'p4'], place: 'l5' },
            { ...moment('m7', 'They drive over the bridge.', ['t2']), visible: ['p1', 'p4'], place: 'l5' },
          ],
        },
      ],
    } as unknown as Breakdown;
    const { breakdown } = readBlocking(b, {
      scenes: [
        {
          id: 's2',
          front: 'the stairs',
          indoors: true,
          room: [3, 8],
          spots: [{ id: 'p1', x: 1, y: 1, pose: 'standing' }, { id: 'x1', name: 'the back stairs', x: 1.5, y: 4, size: [1, 3, 2.5] }],
          places: { l4: { front: 'the stove', indoors: true, room: [2.4, 2.2], spots: [{ id: 'p3', x: 1.2, y: 1.4, faces: 't1', pose: 'standing' }, { id: 't1', x: 1.2, y: 0.5, size: [2, 0.8, 0.9] }, { id: 'p9', x: 9, y: 9 }] } },
        },
        {
          id: 's3',
          front: 'the house',
          room: [30, 60],
          spots: [
            { id: 'p1', x: 15, y: 5, pose: 'standing' },
            { id: 'p4', x: 15, y: 20, pose: 'sitting' },
            { id: 't2', x: 15, y: 20, size: [1.6, 3.2, 1.3] },
            { id: 'x1', name: 'the little bridge', x: 15, y: 40, size: [4, 6, 1] },
          ],
          moves: {
            m7: [
              { id: 't2', x: 15, y: 40 },
              { id: 'p4', x: 15, y: 40, pose: 'sitting' },
              { id: 'p1', x: 15.5, y: 40, pose: 'sitting' },
            ],
          },
        },
      ],
    });
    const [s2, s3] = breakdown.scenes;
    // The tiny room is its own plan, as small as it is, with only who is there.
    expect(s2.blocking?.room).toEqual([3, 8]);
    expect(s2.blocking?.places?.l4.room).toEqual([2.4, 2.2]);
    expect(s2.blocking?.places?.l4.spots.map((s) => s.id)).toEqual(['p3', 't1']);
    // A street beyond ten metres keeps its ground, and the car drives over the bridge with them.
    expect(s3.blocking?.spots.find((s) => s.id === 'x1')?.y).toBe(40);
    expect(s3.blocking?.moves?.m7.map((m) => m.id)).toEqual(['t2', 'p4', 'p1']);
  });
});
