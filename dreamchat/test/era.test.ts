// The dream's era (the one builder's `era`; era.ts): a 1957 church meeting was drawn modern, the breakdown saying
// nothing of when (the Barley Degree, DreamBank, 26 October 1957). The period comes from the dream's own words, then
// from the date it was recorded (given with the dump, `import.ts --when`), else none, and nothing is guessed; a moment
// the dream sets in another era keeps its own, never leaking into the others. A sketch and every moment are told the
// time; the style never is (a woodcut stays a woodcut in any decade). Every model here is a stand-in.
import { describe, expect, test } from 'bun:test';
import { eraOf, periodLine, periodOfDate, readEra } from '../era';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import type { Breakdown } from '../producer';
import type { Session } from '../session';
import { type Item, sheetPrompt } from '../sheets';
import type { WriteFn } from '../telling';
import { wardrobeAsk } from '../wardrobe';

function withBuilder<T>(v: string | undefined, fn: () => T): T {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = v;
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}
const write =
  (reply: unknown): WriteFn =>
  async () => ({ content: JSON.stringify(reply) });

// A dream recorded in the 1990s that sets one moment in a Victorian ballroom (the guard the merge asked for).
const BALLROOM =
  'I was at my desk at work, typing a report on the old beige computer. Then I was in a Victorian ballroom in a long gown, gas lamps along the walls, dancing with a man I did not know. Then I was back at my desk and the report was finished.';
const moments = [
  { id: 'm1', action: 'The dreamer types a report at their desk on an old beige computer' },
  { id: 'm2', action: 'The dreamer dances in a long gown in a Victorian ballroom lit by gas lamps' },
  { id: 'm3', action: 'The dreamer is back at their desk, the report finished' },
];

describe('the period, from the date it was recorded', () => {
  test('a year or a date is its decade, in plain words; the present is no period; anything else none', () => {
    const now = new Date('2026-10-01');
    expect(periodOfDate('26 October 1957', now)).toBe('the late 1950s');
    expect(periodOfDate('1994', now)).toBe('the mid 1990s');
    expect(periodOfDate('March 1921', now)).toBe('the early 1920s');
    // Recorded now, or in the last few years: the present is the default look, no line.
    expect(periodOfDate('1 October 2026', now)).toBeNull();
    expect(periodOfDate('2024', now)).toBeNull();
    expect(periodOfDate('sometime long ago', now)).toBeNull();
    expect(periodOfDate('', now)).toBeNull();
  });
});

describe("the dream's own era, read from its words", () => {
  test('quoted from the telling or dropped; a moment of another era keeps its own; the given date the rest', async () => {
    const era = await readEra(
      BALLROOM,
      '1994',
      moments,
      write({
        period: null,
        moments: [
          { id: 'm2', value: 'the Victorian era', quote: 'Then I was in a Victorian ballroom' },
          // Ours, not theirs: dropped.
          { id: 'm3', value: 'the 1890s', quote: 'the dreamer was in old times' },
        ],
      }),
      new Date('2026-10-01'),
    );
    expect(era.period).toEqual({ value: 'the mid 1990s', from: 'given' });
    expect(era.moments).toEqual({ m2: { value: 'the Victorian era', quote: 'Then I was in a Victorian ballroom' } });
    expect(eraOf(era, 'm1')).toBe('the mid 1990s');
    expect(eraOf(era, 'm2')).toBe('the Victorian era');
    expect(eraOf(era, 'm3')).toBe('the mid 1990s');
  });

  test("the dream's own words win over the given date; no date and no words, no period", async () => {
    const said = await readEra(
      'When I was a little girl in the 1970s, we lived above the bakery.',
      '2003',
      [{ id: 'm1', action: 'The dreamer as a little girl at the window above the bakery' }],
      write({ period: { value: 'the 1970s', quote: 'When I was a little girl in the 1970s' }, moments: [] }),
      new Date('2026-10-01'),
    );
    expect(said.period).toEqual({ value: 'the 1970s', from: 'said', quote: 'When I was a little girl in the 1970s' });
    const none = await readEra(BALLROOM, null, moments, write({ period: null, moments: [] }), new Date('2026-10-01'));
    expect(none).toEqual({ period: null, moments: {} });
    // A writer that fails reads nothing, and a given date stands.
    const failed = await readEra(BALLROOM, '1957', moments, async () => ({ content: 'no' }), new Date('2026-10-01'));
    expect(failed).toEqual({ period: { value: 'the late 1950s', from: 'given' }, moments: {} });
  });
});

describe('the time, told to every sketch and every moment', () => {
  test("a line by kind: people's clothes and hair, a place and its things, a moment's whole picture", () => {
    expect(periodLine('the late 1950s', 'character')).toBe(
      'The time: the late 1950s: their clothes and hair as they were then.',
    );
    expect(periodLine('the late 1950s', 'location')).toBe(
      'The time: the late 1950s: the place and everything in it as it was then.',
    );
    expect(periodLine('the late 1950s', 'moment')).toBe(
      'The time: the late 1950s: clothes, hair, rooms, vehicles and things as they were then.',
    );
  });

  const gh: Item = {
    id: 'p4',
    kind: 'character',
    name: 'G.H.',
    fields: { identity: { value: 'a woman the dreamer knows', said: true } },
    status: 'waiting',
    version: 0,
  };
  const style = {
    id: 'own',
    name: 'a woodcut print',
    medium: 'a woodcut print',
    line: '',
    tokens: ['bold carved lines'],
    palette_hex: ['#222222', '#EEE8DD'],
    lighting_rules: 'Flat light.',
  };

  test('a sketch takes the time with the step, never in its style; without it, as before', () => {
    const on = withBuilder('era', () => sheetPrompt(gh, style, { period: 'the late 1950s' }));
    expect(on).toContain('The time: the late 1950s: their clothes and hair as they were then.');
    expect(on.split('\n').find((l) => l.startsWith('Style:'))).not.toContain('1950s');
    const off = withBuilder('thought_outside', () => sheetPrompt(gh, style, { period: 'the late 1950s' }));
    expect(off).not.toContain('The time:');
    expect(off).toBe(withBuilder('thought_outside', () => sheetPrompt(gh, style)));
  });

  test('every moment of a dream with a period says it; one of its own era says its own; none without it', () => {
    const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session) as Session;
    const b = s.draft!.breakdown as Breakdown;
    const ms = b.scenes.flatMap((sc) => sc.moments);
    b.period = { value: 'the late 1950s', from: 'given' };
    ms[1].period = 'the Victorian era';
    // A moment's prompt is the cut sheet's.
    const cuts = (v: string | undefined) => {
      const was = process.env.DREAMCHAT_CUT_SHEET;
      process.env.DREAMCHAT_CUT_SHEET = 'on';
      try {
        return withBuilder(v, () => rebuild(s).pictures.filter((p) => p.kind === 'cut'));
      } finally {
        if (was === undefined) delete process.env.DREAMCHAT_CUT_SHEET;
        else process.env.DREAMCHAT_CUT_SHEET = was;
      }
    };
    const on = cuts('on');
    expect(on.length).toBe(ms.length);
    for (const p of on) {
      const own = p.id.endsWith(ms[1].id);
      expect(p.prompt).toContain(own ? 'The time: the Victorian era' : 'The time: the late 1950s');
      expect(p.prompt).not.toContain(own ? 'the late 1950s' : 'Victorian');
    }
    for (const p of cuts('thought_outside')) expect(p.prompt).not.toContain('The time:');
  });
});

describe('a crowd is dressed for its time', () => {
  test('the clothes question says when the dream is set where it has a period, and nothing new where it has none', () => {
    const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session) as Session;
    const b = s.draft!.breakdown as Breakdown;
    b.people.push({
      id: 'p9',
      name: 'the other passengers',
      is_dreamer: false,
      protagonist: false,
      several: true,
      extras: true,
      fields: {
        identity: { value: null, said: false },
        appearance: { value: null, said: false },
        wardrobe: { value: null, said: false },
        distinctive_features: { value: null, said: false },
      },
    } as never);
    const before = JSON.stringify(wardrobeAsk(b));
    expect(before).not.toContain('When:');
    b.period = { value: 'the late 1950s', from: 'given' };
    expect(JSON.stringify(wardrobeAsk(b))).toContain('When: the late 1950s');
  });
});
