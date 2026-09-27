import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  barOf,
  type CutFacts,
  cutFactsOf,
  EARNED,
  FIRST_BAR,
  LIBRARY,
  routedFor,
  routedMode,
  routedQuestions,
  routedReadings,
} from '../checks';
import type { SetPicture } from '../evals/build-checks-set';
import {
  aucOf,
  BAR,
  chooseBar,
  type Flagged,
  measure,
  momentLow,
  NOISE,
  needed,
  score,
  verdictOf,
  wilsonLow,
} from '../evals/jev-checks';
import type { CutTags } from '../cutsheet';
import { actingOf, actsOn, actsWhenLogging, checksMode, gateFacts, gateQuestions, readPrompt } from '../gate';
import type { JevFn, Question } from '../jev';
import { applyPlanFacts, lackActs } from '../planfacts';
import { storyboardActs } from '../stages';
import { withRouted } from './fakes';

const tags = (over: Partial<CutTags> = {}): CutTags => ({
  role: 'two_shot',
  move: 'same_side',
  crossed: false,
  pov: false,
  establishing: false,
  line: false,
  change: 'none',
  turned: false,
  held: false,
  crowd: false,
  group: false,
  animal: false,
  vehicle: false,
  unstaged: null,
  dreamlike: false,
  writing: false,
  planned: true,
  ...over,
});
const facts = (t: Partial<CutTags>, extra: Partial<CutFacts> = {}): CutFacts => ({
  tags: tags(t),
  held: [],
  carried: [],
  ...extra,
});
const ids = (f: CutFacts) => routedFor(f.tags).map((q) => q.id);
/** Asked of every cut (no tag says "seen beyond the place" yet; quoted words only where no writing is meant). */
const EVERY = ['r_gone_drawn', 'r_story_words', 'r_quoted', 'r_beyond_inside', 'r_look_twice'];

/** A Jev that answers every question it is asked, by its key; the rest 0.9, and it counts its calls. */
const counting = (answers: (key: string, q: Question) => number) => {
  const fn = (async (state, questions) => {
    fn.calls++;
    fn.asked.push(Object.keys(questions));
    return {
      questions,
      state,
      answers: Object.fromEntries(
        Object.entries(questions).map(([k, q]) => [k, { type: 'noul' as const, noul: answers(k, q) }]),
      ),
      error: null,
      ms: 1,
      usage: null,
    };
  }) as JevFn & { calls: number; asked: string[][] };
  fn.calls = 0;
  fn.asked = [];
  return fn;
};
/** Every reading a problem: the gate's past its bars, each library question on its problem side. */
const allWrong = counting((k) => {
  if (k === 'contradicts' || k === 'twice') return 0.9;
  if (k === 'clear' || k === 'refs_clear') return 0.2;
  const q = LIBRARY.find((x) => k === x.id || k.startsWith(`${x.id}_`));
  return q?.problem === 'no' ? 0.1 : 0.9;
});
const prompt =
  'One picture.\nImage 1: EDIT THIS PICTURE.\nImage 2: who ana is.\nWhat happens in this frame: she waits.';
const pov = facts(
  { role: 'pov', pov: true, held: true, move: 'seat' },
  { held: [{ thing: 'the key', holder: 'the dreamer' }] },
);

describe('the library routed by tags', () => {
  test("through the dreamer's eyes with a thing held: their body, who holds it and its size, and what every cut is asked", () => {
    expect(ids(pov)).toEqual([
      'r_held_said',
      'r_gone_drawn',
      'r_pov_body',
      'r_size',
      'r_story_words',
      'r_quoted',
      'r_beyond_inside',
      'r_look_twice',
    ]);
    const { questions, of } = routedQuestions(pov);
    expect(Object.keys(questions)).toContain('r_held_said_0');
    expect(of.r_held_said_0).toBe('r_held_said');
    expect(questions.r_held_said_0.instructions).toContain('the key is held or carried by the dreamer');
    // The shot's own questions are asked of the shot, never of the prompt.
    expect(routedFor(pov.tags, 'shot').map((q) => q.id)).toEqual(['sb_held_hands', 'sb_beyond']);
    expect(Object.keys(questions).some((k) => k.startsWith('sb_'))).toBe(false);
  });

  test('a reverse two-shot carrying two changes: the background, an earlier layout, left to right, each change, what they do', () => {
    const f = facts(
      { move: 'reverse', line: true, change: 'carried' },
      {
        carried: [
          { who: 'the library', what: 'water', now: 'up over the tops of the desks' },
          { who: 'Tomas', what: 'age', now: 'about ten' },
        ],
      },
    );
    expect(ids(f)).toEqual([
      'r_state_said',
      'r_gone_drawn',
      'r_background',
      'r_keep_earlier',
      'r_line_order',
      'r_action_seen',
      ...EVERY.slice(1),
    ]);
    const { questions } = routedQuestions(f);
    expect(Object.keys(questions).filter((k) => k.startsWith('r_state_said'))).toEqual([
      'r_state_said_0',
      'r_state_said_1',
    ]);
    expect(questions.r_state_said_1.instructions).toContain('Tomas is like this now: age, about ten');
  });

  test('a wide shot of nobody asks only what every cut is asked; writing is not quoted words; a turning is asked of', () => {
    expect(ids(facts({ role: 'wide' }))).toEqual(EVERY);
    expect(ids(facts({ role: 'wide', writing: true }))).not.toContain('r_quoted');
    expect(ids(facts({ role: 'single', turned: true }))).toContain('r_turned_both');
    expect(ids(facts({ role: 'single', crossed: true, move: 'other_side' }))).toEqual([
      'r_gone_drawn',
      'r_background',
      'r_keep_earlier',
      'r_action_seen',
      ...EVERY.slice(1),
    ]);
  });

  test("a question asked per fact asks nothing without one, and a cut's reading is the worst of its answers", () => {
    const none = facts({ change: 'carried' });
    expect(ids(none)).toContain('r_state_said');
    expect(Object.keys(routedQuestions(none).questions).some((k) => k.startsWith('r_state_said'))).toBe(false);
    expect(routedReadings(none, null)).toEqual({ readings: {}, findings: [] });
    const two = facts(
      { change: 'carried' },
      {
        carried: [
          { who: 'the library', what: 'water', now: 'up to the windows' },
          { who: 'the library', what: 'books', now: 'floating' },
        ],
      },
    );
    const got = routedReadings(two, {
      r_state_said_0: { type: 'noul', noul: 0.9 },
      r_state_said_1: { type: 'noul', noul: 0.2 },
      r_gone_drawn: { type: 'noul', noul: 0.8 },
      r_story_words: { type: 'noul', noul: 0.1 },
    });
    expect(got.readings).toEqual({ r_state_said: 0.2, r_gone_drawn: 0.8, r_story_words: 0.1 });
    expect(got.findings).toEqual([
      { id: 'r_state_said', text: 'the prompt may not say a change carried from earlier (0.20)' },
      { id: 'r_gone_drawn', text: 'the prompt may draw something it says is gone (0.80)' },
    ]);
  });

  test("a moment's routed facts come from its cut sheet, as the labelled set keeps them", async () => {
    const { rebuild } = await import('../plan');
    const { loadDream } = await import('../evals/saved');
    const was = [process.env.DREAMCHAT_RECORD, process.env.DREAMCHAT_CUT_SHEET];
    process.env.DREAMCHAT_RECORD = 'on';
    process.env.DREAMCHAT_CUT_SHEET = 'shadow';
    try {
      const session = 'dream-0926-062232-a44a';
      const r = rebuild(loadDream(session, false).session);
      const set = JSON.parse(readFileSync(join(import.meta.dir, '..', 'evals', 'checks-set.json'), 'utf8')) as {
        moments: Record<string, { facts: CutFacts }>;
      };
      for (const m of ['m1', 'm3', 'm6', 'm7']) {
        const sheet = r.pictures.find((p) => p.id === m)?.sheet;
        expect(sheet).toBeTruthy();
        expect([m, cutFactsOf(sheet!)]).toEqual([m, set.moments[`${session}/${m}`].facts]);
      }
      // The snow train's suitcase: the grandfather's at first, the dreamer's once handed over.
      expect(set.moments[`${session}/m1`].facts.held).toEqual([
        { thing: 'the brown leather suitcase', holder: 'my grandfather' },
      ]);
      expect(set.moments[`${session}/m6`].facts.held).toEqual([
        { thing: 'the brown leather suitcase', holder: 'the dreamer' },
      ]);
    } finally {
      if (was[0] === undefined) delete process.env.DREAMCHAT_RECORD;
      else process.env.DREAMCHAT_RECORD = was[0];
      if (was[1] === undefined) delete process.env.DREAMCHAT_CUT_SHEET;
      else process.env.DREAMCHAT_CUT_SHEET = was[1];
    }
  });
});

describe('routed (DREAMCHAT_JEV_ROUTED=on): only a check that has earned it acts', () => {
  test('nothing has earned it: every reading is logged, the library asked in the same call, no line searched', () =>
    withRouted(true, async () => {
      expect(EARNED.size).toBe(0);
      allWrong.calls = 0;
      allWrong.asked = [];
      const read = await readPrompt(allWrong, prompt, { routed: pov });
      expect(allWrong.calls).toBe(1);
      expect(allWrong.asked[0]).toEqual([
        ...Object.keys(gateQuestions(true)),
        ...Object.keys(routedQuestions(pov).questions),
      ]);
      expect(read.acting).toEqual([]);
      expect(read.findings.map((f) => f.split(' (')[0])).toEqual([
        'its instructions may contradict each other',
        'someone may be drawn twice',
        'what it shows is not clear enough to draw',
        'what to take from each image is not clear enough',
        'the prompt may not say who holds something',
        'the prompt may draw something it says is gone',
        "the prompt may draw the dreamer's own body through their eyes",
        'the prompt may not say how big the main thing is against something beside it',
        'the prompt may use story words in place of what is seen',
        'the prompt may quote words the picture could letter',
        'the prompt may bring inside something seen only beyond the place',
        'the prompt may describe one look twice, differently',
      ]);
      // Every library reading is logged with its bar, beside the gate's.
      const logged = gateFacts(read.reading!);
      expect(logged.map((f) => f.question)).toEqual([
        'contradicts',
        'twice',
        'clear',
        'refs_clear',
        ...routedFor(pov.tags).map((q) => q.id),
      ]);
      expect(logged.every((f) => !f.ok)).toBe(true);
      // Code's own faults keep acting; the continuity plan's warnings, not earned, are logged.
      const code = 'image 3 is attached with no word on what to take from it';
      const warning = "picture 4: the dreamer's coat (wet) is carried in words only";
      expect(actingOf([code, warning], read, 'moment')).toEqual([code]);
      expect(actsWhenLogging(warning)).toBe(false);
    }));

  test('under the default logging, a check that has earned it acts as it does today, and only it', () =>
    withRouted(
      true,
      async () => {
        // DREAMCHAT_CHECKS left to its default, logging: routed, an earned check acts all the same.
        expect([process.env.DREAMCHAT_CHECKS, checksMode()]).toEqual([undefined, 'log']);
        allWrong.calls = 0;
        const read = await readPrompt(allWrong, prompt, { routed: pov });
        // Acting, a moment's twice is put on a line first, as before: more calls than one.
        expect(allWrong.calls).toBeGreaterThan(1);
        expect(read.acting?.map((f) => f.split(' (')[0])).toEqual([
          'someone may be drawn twice',
          'the prompt may draw something it says is gone',
        ]);
        expect(actsOn('moment.twice')).toBe(true);
        expect(actsOn('sketch.twice')).toBe(false);
        // A sketch's reading is its own check: the moment's having earned it does not make a sketch's act.
        const sketch = await readPrompt(allWrong, 'A single clear picture of the conductor.', { sheet: true });
        expect(sketch.acting).toEqual([]);
        // What acts, with a fault code knows for certain; the continuity plan's warnings, not earned, log.
        const code = 'image 3 is attached with no word on what to take from it';
        const warning = 'picture 1 has no visible action';
        expect(actingOf([code, warning], read, 'moment')).toEqual([code, ...read.acting!]);
      },
      { earned: ['moment.twice', 'moment.r_gone_drawn'] },
    ));

  test('with the checks only logging, even an earned check logs; a prompt Jev cannot read is read again and drawn', () =>
    withRouted(
      true,
      async () => {
        const read = await readPrompt(allWrong, prompt, { routed: pov });
        expect(read.acting).toEqual([]);
        expect(actsOn('moment.twice')).toBe(false);
      },
      { checks: 'log', earned: ['moment.twice'] },
    ).then(() =>
      withRouted(true, async () => {
        let calls = 0;
        const down: JevFn = async (state, questions) => {
          calls++;
          return { questions, state, answers: null, error: '503', ms: 1, usage: null };
        };
        const read = await readPrompt(down, prompt, { routed: pov });
        expect([calls, read.reading, read.acting]).toEqual([2, null, []]);
      }),
    ));

  test('"storyboard complete?" and planFacts act only where they have earned it', async () => {
    const failed = {
      ok: false,
      readings: [
        { question: 'sb_camera', answer: 0.3, bar: 0.6, ok: false },
        { question: 'sb_extra', answer: 0.1, bar: 0.65, ok: true },
      ],
    };
    const framing = { ok: false, readings: [] };
    const moments = [{ id: 'm8', action: 'They drive toward the house.', looks_at: 'the house' }] as never;
    const plan = { front: 'the street', spots: [] } as never;
    const answers = { looks_m8: { type: 'choice', choice: 'missing', confidence: 0.9 } };
    await withRouted(true, async () => {
      expect([storyboardActs(failed), storyboardActs(framing), lackActs()]).toEqual([false, false, false]);
      const r = applyPlanFacts(plan, moments, answers);
      expect(r.fix).toEqual([]);
      expect(r.logged?.[0]).toContain('Moment m8');
    });
    await withRouted(
      true,
      async () => {
        expect([storyboardActs(failed), storyboardActs(framing), lackActs()]).toEqual([true, false, true]);
        expect(applyPlanFacts(plan, moments, answers).fix[0]).toContain('Moment m8');
      },
      { earned: ['moment.sb_camera', 'plan.looks_missing'] },
    );
    await withRouted(true, async () => expect(storyboardActs(failed)).toBe(false), { earned: ['moment.sb_extra'] });
  });
});

describe('the switch off (DREAMCHAT_JEV_ROUTED unset) changes nothing', () => {
  test('only "on" routes', () => {
    const was = process.env.DREAMCHAT_JEV_ROUTED;
    try {
      for (const [v, on] of [
        [undefined, false],
        ['', false],
        ['off', false],
        ['yes', false],
        ['on', true],
        [' ON ', true],
      ] as const) {
        if (v === undefined) delete process.env.DREAMCHAT_JEV_ROUTED;
        else process.env.DREAMCHAT_JEV_ROUTED = v;
        expect(routedMode()).toBe(on);
      }
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_JEV_ROUTED;
      else process.env.DREAMCHAT_JEV_ROUTED = was;
    }
  });

  for (const log of [false, true])
    test(`off, ${log ? 'logging' : 'acting'}: the same questions, findings and acting as without routing`, () =>
      withRouted(
        false,
        async () => {
          allWrong.calls = 0;
          allWrong.asked = [];
          const plain = await readPrompt(allWrong, prompt);
          const calls = allWrong.calls;
          const given = await readPrompt(allWrong, prompt, { routed: pov });
          expect(allWrong.calls).toBe(calls * 2);
          expect(allWrong.asked[0]).toEqual(Object.keys(gateQuestions(true)));
          expect(allWrong.asked[calls]).toEqual(Object.keys(gateQuestions(true)));
          expect(given).toEqual(plain);
          expect('acting' in given).toBe(false);
          expect(given.reading?.routed).toBeUndefined();
          const code = 'image 3 is attached with no word on what to take from it';
          const warning = 'picture 1 has no visible action';
          const all = [code, warning, ...given.findings];
          expect(actingOf([code, warning], given, 'moment')).toEqual(log ? all.filter(actsWhenLogging) : all);
          expect(actsOn('moment.contradicts')).toBe(!log);
          // "Storyboard complete?" as before: it holds when acting, never when logging; planFacts plans a
          // scene again either way.
          expect(storyboardActs({ ok: false, readings: [] })).toBe(!log);
          expect(storyboardActs({ ok: true })).toBe(false);
          expect(lackActs()).toBe(true);
        },
        { checks: log ? 'log' : 'act' },
      ));
});

/** A judged picture for the scoring tests: its moment, its verdict and its split. */
const pic = (
  id: string,
  moment: string,
  verdict: SetPicture['verdict'],
  split: SetPicture['split'] = 'tune',
): SetPicture => ({
  id,
  kind: 'story',
  draw: 'story',
  run: 'dream',
  session: 's',
  moment,
  split,
  verdict,
  note: null,
  faults: [],
  prompt: null,
  prompt_sha: '',
  images: [],
  same_shot: true,
  judge: null,
});
/** `n` moments of one picture each, `bad` of them not right, each flagged as `flag` says. */
const moments = (n: number, bad: number, flag: (i: number) => boolean, close = false): Flagged[] =>
  Array.from({ length: n }, (_, i) => ({
    p: pic(`p${i}`, `m${i}`, i < bad ? 'wrong' : 'right'),
    flag: flag(i),
    close,
  }));

describe('how a check is scored against the owner (evals/jev-checks.ts)', () => {
  test("Wilson's lower bound: none of nothing, and surer with more", () => {
    expect(wilsonLow(0, 0)).toBeNull();
    expect(wilsonLow(5, 5)).toBeCloseTo(0.649, 3);
    expect(wilsonLow(50, 50)!).toBeGreaterThan(wilsonLow(5, 5)!);
    expect(wilsonLow(35, 50)!).toBeLessThan(0.7);
  });

  test('AUC: 1 when every picture not right reads worse, 0 when better, a half for ties, by the problem side', () => {
    const a = pic('a', 'm1', 'wrong');
    const b = pic('b', 'm2', 'right');
    expect(
      aucOf(
        [
          { p: a, v: 0.9 },
          { p: b, v: 0.1 },
        ],
        'yes',
      ),
    ).toBe(1);
    expect(
      aucOf(
        [
          { p: a, v: 0.9 },
          { p: b, v: 0.1 },
        ],
        'no',
      ),
    ).toBe(0);
    expect(
      aucOf(
        [
          { p: a, v: 0.5 },
          { p: b, v: 0.5 },
        ],
        'yes',
      ),
    ).toBe(0.5);
    expect(aucOf([{ p: a, v: 0.9 }], 'yes')).toBeNull();
  });

  test("a moment's pictures are one moment: counted once, and resampled together", () => {
    // One moment of four pictures (a story picture and three paired), all flagged and right; one wrong moment.
    const same = ['story', 'mockup', 'edit', 'free'].map((d) => ({ p: pic(`x-${d}`, 'mx', 'right'), flag: true }));
    const items: Flagged[] = [...same, { p: pic('y', 'my', 'wrong'), flag: true }];
    const s = score(items);
    expect([s.n, s.moments, s.flagged, s.flaggedMoments, s.hits]).toEqual([5, 2, 5, 2, 1]);
    // Resampling moments, the four right pictures come and go together: the bound falls to 0.
    expect(momentLow(items)).toBe(0);
    expect(momentLow(items)).toBe(momentLow(items));
    expect(momentLow(moments(10, 10, () => true))).toBe(1);
    expect(momentLow(moments(10, 5, () => false))).toBeNull();
    // A flag within NOISE of its bar is not counted as past it.
    expect(score(moments(6, 6, () => true, true)).robustMoments).toBe(0);
    expect(NOISE).toBe(0.1);
  });

  test('the bar to act, each reason in turn', () => {
    const at = (n: number, bad: number, flagged: number, close = false) =>
      verdictOf(score(moments(n, bad, (i) => i < flagged, close)));
    expect(at(40, 20, 10).why).toContain('fewer than 60');
    expect(at(80, 40, 4).why).toContain('flags 4 moments, fewer than 5');
    expect(at(80, 40, 10, true).why).toContain('G4');
    // Flagging the not-right first: 10 of 10 flagged not right passes; 20 flagged, half right, does not.
    expect(at(80, 40, 10)).toEqual({ acts: true, why: 'may act' });
    expect(at(80, 10, 20).why).toContain('precision 0.50');
    expect(BAR).toEqual({ labels: 60, moments: 5, precision: 0.7 });
  });

  test('a bar chosen on the tune pictures: the best precision over three moments and at most half flagged', () => {
    const tune = Array.from({ length: 20 }, (_, i) => ({
      p: pic(`t${i}`, `t${i}`, i < 4 ? 'wrong' : 'right'),
      reading: i < 4 ? 0.85 : i < 8 ? 0.65 : 0.2,
    }));
    expect(chooseBar({ problem: 'yes' }, tune)).toEqual({ bar: 0.7, chosen: true });
    const few = tune.map((x, i) => ({ ...x, reading: i < 2 ? 0.9 : 0.1 }));
    expect(chooseBar({ problem: 'yes' }, few)).toEqual({ bar: FIRST_BAR, chosen: false, why: 'too few' });
    const many = tune.map((x) => ({ ...x, reading: 0.95 }));
    expect(chooseBar({ problem: 'yes' }, many)).toEqual({ bar: FIRST_BAR, chosen: false, why: 'too many' });
  });

  test('what more owner verdicts would do: only where the precision holds and its flags are past the noise', () => {
    expect(needed(score(moments(60, 30, (i) => i < 5 || (i >= 40 && i < 50))), 1)).toEqual({
      none: 'precision under the bar',
    });
    expect('none' in needed(score(moments(20, 2, (i) => i < 2)), 1)).toBe(true);
    expect(needed(score(moments(20, 6, (i) => i < 6, true)), 1)).toEqual({
      none: 'its flags sit within 0.1 of its bar (G4): more labels would not move them',
    });
    const more = needed(score(moments(20, 6, (i) => i < 6)), 0.5);
    expect(more && 'routed' in more && more.routed).toBe(40);
    expect(more && 'any' in more && more.any).toBe(80);
  });
});

describe('what may act is what the eval measured', () => {
  test('each library question is held to the bar chosen on the tune pictures, and EARNED to its results row', async () => {
    const out = await measure({ ask: false });
    for (const q of LIBRARY) expect([q.id, q.bar]).toEqual([q.id, out.bars[q.id].bar]);
    // What may act is exactly what EARNED lets act, each at the bar it met the bar at.
    const acting = out.rows.filter((r) => r.verdict.acts);
    const keyOf = (id: string) => (id.includes('.') ? id : `moment.${id}`);
    expect(acting.map((r) => keyOf(r.id)).sort()).toEqual([...EARNED.keys()].sort());
    for (const r of acting) expect(EARNED.get(keyOf(r.id))).toBe(r.earnedBar ?? null);
    expect(out.distinct.checks).toBe(28);
  });

  test("a library question's finding is at its measured bar, or the bar it earned acting at", () =>
    withRouted(true, async () => {
      const line = LIBRARY.find((q) => q.id === 'r_line_order')!;
      expect([line.bar, barOf(line)]).toEqual([0.8, 0.8]);
      const f = facts({ line: true });
      // 0.75 is under its 0.8: a finding (at the first bar, 0.5, it would not have been).
      expect(routedReadings(f, { r_line_order: { type: 'noul', noul: 0.75 } }).findings.map((x) => x.id)).toEqual([
        'r_line_order',
      ]);
      EARNED.set('r_line_order', 0.7);
      try {
        expect(barOf(line)).toBe(0.7);
        expect(routedReadings(f, { r_line_order: { type: 'noul', noul: 0.75 } }).findings).toEqual([]);
      } finally {
        EARNED.delete('r_line_order');
      }
    }));
});
