import { describe, expect, test } from 'bun:test';
import { type Breakdown, completeViews, normalizeBreakdown, VAGUE } from '../producer';

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
