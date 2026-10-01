import { describe, expect, test } from 'bun:test';
import type { Breakdown } from '../producer';
import type { Item } from '../sheets';
import { parseWardrobe, untoldGroups, wardrobeAsk, withWardrobes } from '../wardrobe';

const person = (id: string, name: string, extras: boolean, wardrobe: string | null = null) => ({
  id,
  name,
  is_dreamer: false,
  protagonist: false,
  several: extras,
  extras,
  fields: { identity: { value: name, said: true }, wardrobe: { value: wardrobe, said: !!wardrobe } },
});
const dream = (people: ReturnType<typeof person>[]): Breakdown =>
  ({
    title: 't',
    logline: 'An exam in a classroom.',
    world_logic: '',
    look: {},
    people,
    places: [{ id: 'l1', name: 'the classroom' }],
    things: [],
    scenes: [
      {
        id: 's1',
        moments: [{ id: 'm1', place: 'l1', visible: people.map((p) => p.id), action: 'They sit the exam.' }],
      },
    ],
    style_options: [],
    unknowns: [],
  }) as unknown as Breakdown;

describe('extras_wardrobe: a crowd with no clothes told is given ordinary clothes, as a guess', () => {
  test('only a crowd of people with no clothes told is asked of: never one with clothes, one sketched, nor animals', () => {
    const b = dream([
      person('p2', 'the faceless students', true),
      person('p3', 'the passers-by', true, 'raincoats'),
      person('p4', 'the teacher', false),
      person('p5', 'the cats', true),
    ]);
    expect(untoldGroups(b).map((p) => p.id)).toEqual(['p2']);
    expect(wardrobeAsk(b)?.[1].content).toContain('p2: the faceless students');
    expect(wardrobeAsk(dream([person('p4', 'the teacher', false)]))).toBeNull();
  });

  test('the answer is kept only for a group asked of; a sketch keeps any clothes it already has', () => {
    const b = dream([person('p2', 'the faceless students', true)]);
    const reading = parseWardrobe('{"p2": "school uniforms", "p9": "suits", "p3": ""}', b);
    expect(reading).toEqual({ p2: 'school uniforms' });
    expect(parseWardrobe('not json', b)).toEqual({});
    const items = [
      { id: 'p2', fields: { wardrobe: { value: null, said: false } } },
      { id: 'p3', fields: { wardrobe: { value: 'raincoats', said: true } } },
    ] as unknown as Item[];
    const out = withWardrobes(items, { p2: 'school uniforms', p3: 'suits' });
    expect(out[0].fields.wardrobe).toEqual({ value: 'school uniforms', said: false });
    expect(out[1].fields.wardrobe).toEqual({ value: 'raincoats', said: true });
  });
});
