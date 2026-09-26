import { describe, expect, test } from 'bun:test';
import { cleanStyles } from '../ground';
import type { Breakdown, StyleOption } from '../producer';
import { fakeJev, noul } from './fakes';

const breakdown = (style: StyleOption) =>
  ({
    title: '',
    logline: '',
    look: {},
    world_logic: '',
    people: [],
    places: [{ id: 'l1', name: 'the orchard', fields: {} }],
    things: [],
    scenes: [],
    style_options: [style],
    unknowns: [],
  }) as unknown as Breakdown;

const style = (name: string, medium: string): StyleOption =>
  ({
    id: 'own',
    name,
    medium,
    dream: '',
    one_colour: false,
    line: '',
    tokens: ['soft brushwork'],
    palette_hex: [],
    lighting_rules: '',
  }) as StyleOption;

describe("a look's name", () => {
  test('that brings content is said as what it is made as', async () => {
    // "Glowing orchard at dusk with a white horse" put the horse behind every person's sketch (26 Sep).
    const jev = fakeJev((q) => (q.name_0 ? { name_0: noul(0.9) } : {}));
    const out = await cleanStyles(
      breakdown(style('glowing orchard at dusk with a white horse', 'an oil painting')),
      jev,
    );
    expect(out.breakdown.style_options[0].name).toBe('an oil painting');
  });

  test('that looks through something is cut to its medium, even named as its medium', async () => {
    // "Paint that looks like looking through dirty glass", read by Jev as a texture (0.35).
    const jev = fakeJev(() => ({}));
    const name = 'paint that looks like looking through dirty glass';
    const out = await cleanStyles(breakdown(style(name, name)), jev);
    expect(out.breakdown.style_options[0].name).toBe('paint');
    expect(out.breakdown.style_options[0].medium).toBe('paint');
  });

  test('that only says how it is drawn is kept', async () => {
    const out = await cleanStyles(breakdown(style('a soft watercolour', 'watercolour on rough paper')), fakeJev());
    expect(out.breakdown.style_options[0].name).toBe('a soft watercolour');
  });
});
