import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clip, impliedAsk, impliedQuestions, parseImplied, readImplied, type WriteFn } from '../implied';
import type { JevFn } from '../jev';
import { type Breakdown, moments, type StyleOption } from '../producer';
import { planContinuity } from '../continuity';
import { forPlan, lookBefore, nowAt, type Readings, storyRecord } from '../record';
import type { Item } from '../sheets';

// The library underwater (test/fixtures/record): the water comes in under the doors at m2, and at m5
// the sister rows up to the high round window at the top of the room. No level is written anywhere.
type Frozen = { breakdown: Breakdown; items: Item[]; words: string[]; style: StyleOption };
const library = () =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'record', 'library-underwater.json'), 'utf8')) as Frozen;
const recordOf = (f: Frozen, readings?: Readings) =>
  storyRecord(f.breakdown, f.items, readings, { words: f.words, style: f.style });

// The writer: at the window, the water risen almost to it (meant), the boat drifting (meant, but no
// look of it), and the light gone green (a guess); at m2, the water over the desks, which the words say.
const proposals: Record<string, { who: string; what: string; now: string }[]> = {
  m5: [
    { who: 'l1', what: 'water', now: 'almost up to the ceiling, over the desks and shelves' },
    { who: 't1', what: 'boat', now: 'drifting' },
    { who: 'l1', what: 'light', now: 'green' },
  ],
  m2: [{ who: 'l1', what: 'water', now: 'over the desks' }],
};
const asked: string[] = [];
const write: WriteFn = async (messages) => {
  const brief = JSON.parse(messages[1].content) as { moment: { action: string } };
  const m = moments(library().breakdown).find((x) => x.action === brief.moment.action)!;
  asked.push(m.id);
  return {
    content: JSON.stringify({ implied: proposals[m.id] ?? [] }),
    model: 'fake',
    ms: 0,
    usage: { prompt_tokens: 400, completion_tokens: 30 },
  };
};
// Jev: the water meant, and how the room is from then on; the drifting meant, and not how the boat
// looks; the light a guess. At m2, the water over the desks just within the bar.
const jevAsked: string[] = [];
const jev: JevFn = async (state, questions) => {
  jevAsked.push(state);
  const m2 = (JSON.parse(state) as { moment: { action: string } }).moment.action.includes('under the doors');
  const p: Record<string, number> = m2
    ? { implied_0: 0.65, stays_0: 0.8, motion_0: 0.1 }
    : {
        implied_0: 0.9,
        motion_0: 0.1,
        drawn_0: 0.05,
        inlook_0: 0.1,
        implied_1: 0.9,
        look_1: 0.1,
        implied_2: 0.2,
      };
  return {
    questions,
    state,
    answers: Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul' as const, noul: p[k] ?? 0 }])),
    error: null,
    ms: 0,
    usage: { input_tokens: 300, output_tokens: 20 },
  };
};

describe('what a moment implies, read once and checked', () => {
  test('the writer is asked once a moment, Jev only where something is proposed, and both are counted', async () => {
    const f = library();
    asked.length = 0;
    jevAsked.length = 0;
    const { implied, cost } = await readImplied(f.breakdown, recordOf(f).record, write, jev);
    expect(asked.sort()).toEqual(
      moments(f.breakdown)
        .map((m) => m.id)
        .sort(),
    );
    expect(jevAsked).toHaveLength(2);
    expect(cost).toEqual({
      writerCalls: asked.length,
      writerIn: 400 * asked.length,
      writerOut: 30 * asked.length,
      jevCalls: 2,
      jevIn: 600,
      jevOut: 40,
    });
    // Only what Jev reads as meant, and as how a thing looks or how a place is from then on, is taken;
    // every reading is kept, and an answer within 0.1 of the bar is marked.
    expect(implied.m5.map((x) => [x.what, x.ok])).toEqual([
      ['water', true],
      ['boat', false],
      ['light', false],
    ]);
    expect(implied.m5[0]).toMatchObject({ p: 0.9, motion: 0.1, drawn: 0.05, inlook: 0.1, basis: 'implied' });
    // The last moment in the library: nothing after it there for the water to stay for.
    expect(implied.m5[0].stays).toBeUndefined();
    expect(implied.m2[0].stays).toBe(0.8);
    expect(implied.m5[1]).toMatchObject({ p: 0.9, look: 0.1, basis: 'implied' });
    expect(implied.m5[0].look).toBeUndefined();
    expect(implied.m5.some((x) => x.close)).toBe(false);
    expect(implied.m2[0]).toMatchObject({ ok: true, close: true });
    expect(Object.keys(implied).sort()).toEqual(['m2', 'm5']);
  });

  test("the writer is told the moment's words and what the record holds, and Jev only the words", () => {
    const f = library();
    const m5 = moments(f.breakdown).find((m) => m.id === 'm5')!;
    const brief = JSON.parse(impliedAsk(f.breakdown, recordOf(f).record, m5)[1].content);
    expect(brief.moment.action).toContain('high round window');
    expect(brief.the_record_holds.join(' ')).toContain('rising over the desks');
    const { state, questions } = impliedQuestions(f.breakdown, recordOf(f).record, m5, proposals.m5);
    // A place is asked four things besides, one fact each (whether it stays so only where a later
    // moment is there, and m5 is the library's last); a thing, whether it is how it looks.
    expect(Object.keys(questions)).toEqual([
      'implied_0',
      'motion_0',
      'drawn_0',
      'inlook_0',
      'implied_1',
      'look_1',
      'implied_2',
      'motion_2',
      'drawn_2',
      'inlook_2',
    ]);
    const m2 = moments(f.breakdown).find((m) => m.id === 'm2')!;
    expect(Object.keys(impliedQuestions(f.breakdown, recordOf(f).record, m2, proposals.m2).questions)).toEqual([
      'implied_0',
      'stays_0',
      'motion_0',
      'drawn_0',
      'inlook_0',
    ]);
    // Jev reads the moment's words and those around it in the same place, and the place's look as the
    // record has it there, never what the writer was told.
    const read = JSON.parse(state);
    expect(read.moment.action).toBe(m5.action);
    expect(read.before).toHaveLength(2);
    expect(read.after).toBeUndefined();
    expect(Object.values(read.looks as Record<string, string>)[0]).toContain('its water now');
    expect(state).not.toContain('the_record_holds');
    // Kept to the moment's own places and things, each by a part.
    expect(
      parseImplied(
        JSON.stringify({
          implied: [
            { who: 'l1', what: 'water', now: 'deep' },
            { who: 'l1', what: 'Water', now: 'deeper' },
            { who: 'l9', what: 'door', now: 'open' },
            { who: 'l1', what: 'place', now: 'vast and empty' },
            { who: 'p1', what: 'hair', now: 'wet' },
          ],
        }),
        f.breakdown,
        m5,
      ),
    ).toEqual([{ who: 'l1', what: 'water', now: 'deep' }]);
    expect(parseImplied('not json', f.breakdown, m5)).toEqual([]);
    // Cut at a word, never inside one, and without a dangling word.
    expect(clip('high enough to row the boat between the shelves', 30)).toBe('high enough to row the boat');
    expect(clip('almost up to the ceiling, over the desks', 26)).toBe('almost up to the ceiling');
  });

  test('the record takes what was read and checked as a change, implied, carried on from there', async () => {
    const f = library();
    const { implied } = await readImplied(f.breakdown, recordOf(f).record, write, jev);
    const before = recordOf(f).record;
    const { record, violations } = recordOf(f, { implied });
    const water = record.changes['l1@m5:water'];
    expect(water).toMatchObject({ who: 'l1', at: 'm5', basis: 'implied', from: 'implied:m5' });
    expect(water.now).toContain('almost up to the ceiling');
    expect(Object.values(record.changes).every((c) => c.basis !== ('said' as never))).toBe(true);
    // What the words say of the water at m2 is the change there, not what they imply.
    expect(record.changes['l1@m2:water']).toEqual(before.changes['l1@m2:water']);
    expect(record.changes['l1@m2:water~2']).toBeUndefined();
    // Neither the drifting nor the guessed light is a change.
    expect(Object.keys(record.changes).filter((k) => k.startsWith('t1@m5') || k.startsWith('l1@m5:light'))).toEqual([]);
    expect(violations.some((v) => v.rule === 'passing' && v.key === 'l1@m5:water')).toBe(true);
    // The picture at the window says how high the water stands; before it, as before.
    expect(nowAt(record, 'm5').map((x) => x.text)).toContain(
      'the water is almost up to the ceiling, over the desks and shelves',
    );
    expect(nowAt(record, 'm4')).toEqual(nowAt(before, 'm4'));
  });

  test('nothing read, or nothing that passed, leaves the record as it was', () => {
    const f = library();
    // Known by what it was made from, readings and all; the same in every other way.
    const bare = (readings?: Readings) => ({ ...recordOf(f, readings).record, hash: '' });
    expect(bare({ implied: {} })).toEqual(bare());
    expect(bare({ implied: { m5: [{ ...proposals.m5[0], basis: 'implied', p: 0.5, ok: false }] } })).toEqual(bare());
  });

  test('is said after "is", and "open" in what goes with it opens nothing', () => {
    const f = library();
    const now = 'high enough to row the boat between the shelves, with books floating open like birds';
    const { record } = recordOf(f, {
      implied: { m5: [{ who: 'l1', what: 'water', now, basis: 'implied', p: 0.9, ok: true }] },
    });
    expect(nowAt(record, 'm5').map((x) => x.text)).toContain(`the water is ${now}`);
    // Not a water opened at m5, so never shut before it (the flooded library, 26 Sep).
    for (const m of ['m2', 'm3', 'm4'])
      expect(
        nowAt(record, m)
          .map((x) => x.text)
          .join(' '),
      ).not.toContain('shut');
  });

  test('named by its own name, a thing changes as a whole: what it is later takes the place of what it was', () => {
    const f = library();
    const read = (who: string, what: string, now: string) => ({
      who,
      what,
      now,
      basis: 'implied' as const,
      p: 0.9,
      ok: true,
    });
    const { record } = recordOf(f, {
      implied: { m4: [read('t1', 'the rowing boat', 'dripping wet')], m5: [read('t1', 'boat', 'half sunk')] },
    });
    expect(record.changes['t1@m4:rowing-boat'].part).toBe(record.changes['t1@m5:boat'].part);
    const m5 = nowAt(record, 'm5').map((x) => x.text);
    expect(m5).toContain('the yellow rowing boat is half sunk');
    expect(m5.join(' ')).not.toContain('dripping');
  });

  test('has no in-between picture of its own: it is carried in words', () => {
    const f = library();
    const { record } = recordOf(f, {
      implied: { m5: [{ ...proposals.m5[0], basis: 'implied', p: 0.9, ok: true }] },
    });
    const plan = planContinuity(f.breakdown, forPlan(record));
    expect(plan.ghosts.some((g) => g.key === 'l1@m5:water')).toBe(false);
    expect(plan.ghosts.some((g) => g.key === 'l1@m2:water')).toBe(true);
    const m5 = plan.cuts.find((c) => c.id === 'm5')!;
    expect(m5.own.some((st) => st.key === 'l1@m5:water' && st.implied)).toBe(true);
    expect(m5.now?.map((x) => x.text)).toContain('the water is almost up to the ceiling, over the desks and shelves');
  });

  test('says each fact once, and a part and what it is with the part named once', () => {
    // The flooded library: the books float off the shelves at m4, the water rises over the desks at m3.
    const f = JSON.parse(
      readFileSync(join(import.meta.dir, 'fixtures', 'record', 'flooded-library.json'), 'utf8'),
    ) as Frozen;
    const now =
      'high enough to row the boat between the shelves, over the desks, with books floating open like birds off the shelves';
    const { record } = recordOf(f, {
      implied: { m7: [{ who: 'l1', what: 'water', now, basis: 'implied', p: 0.9, ok: true }] },
    });
    expect(record.changes['l1@m7:water'].now).toBe('high enough to row the boat between the shelves, over the desks');
    // What the in-between picture of a later change is told the room looked like: "water rises over
    // the desks", never "water water rises over the desks".
    const later = Object.values(record.changes).find((c) => c.who === 'l1' && c.at === 'm9' && !c.basis);
    const before = lookBefore(record, later!.key)!.facts.map((x) => x.text);
    expect(before.some((t) => /^water rises over the desks/.test(t))).toBe(true);
    expect(before.join(' ')).not.toMatch(/\bwater water\b/);
  });
});
