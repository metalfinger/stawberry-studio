import { describe, expect, test } from 'bun:test';
import { type Breakdown, completeViews, normalizeBreakdown, readBlocking, VAGUE } from '../producer';

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
});
