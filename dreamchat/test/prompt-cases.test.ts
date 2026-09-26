import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffDumps, diffLines, type Dump, dumpOf, sentOf, verifyFrozen, wordDiff } from '../evals/corpus';
import {
  askAll,
  askKey,
  askQuestion,
  CHECKS,
  CLASSES,
  type CaseResult,
  compare,
  contextOf,
  type Ctx,
  type Draw,
  type JevCache,
  JEV_MODEL,
  judgeCase,
  loadCases,
  type PromptCase,
  type RunFile,
  runCheck,
  sectionsOf,
  totalsOf,
  validateCases,
} from '../evals/prompt-cases';
import { frozenDreams, inputsDiffer, loadDream } from '../evals/saved';
import type { Answer } from '../jev';
import { imageName, rebuild } from '../plan';
import type { Session } from '../session';
import { fakeJev, noul } from './fakes';

const EVALS = join(import.meta.dir, '..', 'evals');
const read = <T>(name: string) => JSON.parse(readFileSync(join(EVALS, name), 'utf8')) as T;
// The dreams as frozen in the repository (evals/sources/<session id>.json): the saved conversations are not.
const frozen = (id: string) => rebuild(loadDream(id, false).session as Session);
const lighthouse = frozen('dream-0926-022102-aeea');
const heron = frozen('dream-0926-012307-4c79');
const market = frozen('dream-0926-000545-09ea');
const snow = frozen('dream-0926-043003-b0cb');
const snow2 = frozen('dream-0926-062232-a44a');

type StoryRow = { id: string; session: string; moment: string; human: string; human_note?: string };
type PairedRow = { id: string; versions: Record<string, { way: Draw; human: string; human_note?: string }> };
type SetRow = { id: string; session: string; moment: string };
const story = read<{ rows: StoryRow[] }>('story-pictures.json').rows;
const paired = read<{ rows: PairedRow[] }>('paired-verdicts.json').rows;
const pairedSet = read<{ rows: SetRow[] }>('paired-set.json').rows;

/** The person's verdict and note on a source row, the drawing it is, and the dream and moment it is of. */
function rowOf(s: PromptCase['source']) {
  if (s.file === 'story-pictures.json') {
    const r = story.find((x) => x.id === s.row);
    return (
      r && { session: r.session, moment: r.moment, human: r.human, note: r.human_note ?? null, draw: 'story' as Draw }
    );
  }
  const v = paired.find((x) => x.id === s.row)?.versions[s.version ?? ''];
  const where = pairedSet.find((x) => x.id === s.row);
  return (
    v &&
    where && { session: where.session, moment: where.moment, human: v.human, note: v.human_note ?? null, draw: v.way }
  );
}

describe('the case set', () => {
  const cases = loadCases();

  test('loads, and every case is sound', () => {
    expect(validateCases(cases)).toEqual([]);
    expect(cases.length).toBeGreaterThan(80);
  });

  test("every case is a real row, of its dream and moment, with the person's note word for word", () => {
    for (const c of cases)
      for (const s of [{ ...c.source, note: c.note }, ...(c.also ?? [])]) {
        const row = rowOf(s);
        expect(row, `${c.id}: ${s.file} ${s.row} ${s.version ?? ''}`).toBeTruthy();
        expect([row!.session, row!.moment], c.id).toEqual([c.session, c.moment]);
        expect(s.note, `${c.id}: the note of ${s.row} ${s.version ?? ''}`).toBe(row!.note);
      }
  });

  test('a failing case is a picture the person called partly right or wrong, a passing one a picture they called right', () => {
    for (const c of cases) {
      const human = rowOf(c.source)!.human;
      expect(c.kind === 'passing' ? human === 'right' : human !== 'right', `${c.id}: ${human}`).toBe(true);
    }
  });

  test("each case's verdicts are the person's on every drawing of its moment, and seen_in its sources' drawings", () => {
    for (const c of cases) {
      const st = story.find((x) => x.session === c.session && x.moment === c.moment);
      const set = pairedSet.find((x) => x.session === c.session && x.moment === c.moment);
      const want: Record<string, string> = {};
      if (st) want.story = st.human;
      for (const v of Object.values(paired.find((x) => x.id === set?.id)?.versions ?? {})) want[v.way] = v.human;
      expect(c.verdicts, c.id).toEqual(want);
      expect([...c.seen_in].sort(), c.id).toEqual(
        [...new Set([c.source, ...(c.also ?? [])].map((s) => rowOf(s)!.draw))].sort(),
      );
    }
  });

  test('faults seen in one drawing are counted by one rule', () => {
    // Seen only in the edit of the picture before: its first image's fault. Seen once while another
    // drawing with the same image 1 (for the free one, the same everything else) was right: a hypothesis.
    const same: Record<Draw, Draw[]> = {
      story: ['story', 'mockup'],
      mockup: ['mockup', 'story'],
      free: ['free', 'mockup', 'story'],
      edit: ['edit'],
    };
    for (const c of cases.filter((x) => x.kind === 'failing' && x.seen_in.length === 1)) {
      const [d] = c.seen_in;
      if (d === 'edit') expect(c.class, c.id).toBe('reference_conflict');
      else if (same[d].some((k) => c.verdicts[k] === 'right'))
        expect(!!c.hypothesis || !!c.model_only, `${c.id}: seen in ${d}, right in another like it`).toBe(true);
    }
  });

  test('every counted fault has a check a rewording cannot meet: one on the images or plan, or a question expecting no', () => {
    const structural = new Set([
      'image_of',
      'no_image_of',
      'images_per_subject_at_most',
      'images_at_most',
      'no_mockup',
      'in_view',
      'not_in_view',
      'not_on_floor_plan',
      'held_by',
      'faces',
      'faces_each_other',
      'look_has',
      'dreamer_seen_or_pov',
      'no_dreamer_image',
      'state_carried',
      'state_not_carried',
      'ref_of_picture',
      'no_edit_of_earlier',
      'relation_to',
      'camera_turned_from',
      'camera_differs_from',
    ]);
    for (const c of cases.filter((x) => x.kind === 'failing' && !x.model_only && !x.set_aside && !x.hypothesis))
      expect(
        c.expectations.some((e) => (e.kind === 'code' ? structural.has(e.check) : e.expect === 'no')),
        c.id,
      ).toBe(true);
  });

  test('every noted fault of a picture the person did not call right has a case, or is listed as unused with a reason', () => {
    const { unused } = read<{ unused: { source: PromptCase['source']; why: string }[] }>('prompt-cases.json');
    const key = (s: PromptCase['source']) => `${s.file} ${s.row} ${s.version ?? ''}`;
    const covered = new Set(
      [...cases.flatMap((c) => [c.source, ...(c.also ?? [])]), ...unused.map((u) => u.source)].map(key),
    );
    const noted = [
      ...story.filter((r) => r.human !== 'right').map((r) => ({ file: 'story-pictures.json' as const, row: r.id })),
      ...paired.flatMap((r) =>
        Object.entries(r.versions)
          .filter(([, v]) => v.human !== 'right')
          .map(([version]) => ({ file: 'paired-verdicts.json' as const, row: r.id, version })),
      ),
    ];
    expect(noted.filter((s) => !covered.has(key(s))).map(key)).toEqual([]);
    for (const u of unused) expect(u.why.length).toBeGreaterThan(20);
  });

  test('every moment the person called right has a guard', () => {
    const guarded = new Set(cases.filter((c) => c.kind === 'passing').map((c) => c.source.row));
    expect(story.filter((r) => r.human === 'right' && !guarded.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  test('every class and step is known, and every dream a case names is frozen', () => {
    for (const c of cases) expect(CLASSES).toContain(c.class);
    const have = new Set(frozenDreams());
    for (const c of cases) expect(have.has(c.session), c.session).toBe(true);
  });
});

describe('the loader refuses a malformed case', () => {
  const good: PromptCase = {
    id: 'x',
    kind: 'failing',
    class: 'presence',
    step: 'S1',
    session: 'dream-0926-022102-aeea',
    moment: 'm13',
    source: { file: 'story-pictures.json', row: 'lighthouse-fresh-m13' },
    note: 'gone',
    verdicts: { story: 'wrong' },
    seen_in: ['story'],
    fault: 'the dreamer is gone',
    expectations: [{ kind: 'code', check: 'in_view', args: { who: 'p1' }, says: 'the dreamer is in view' }],
  };
  const bad = (patch: Partial<PromptCase>) => validateCases([{ ...good, ...patch }]);

  test('a sound case passes', () => expect(validateCases([good])).toEqual([]));
  test('an unknown check, a missing or unknown argument, a broken pattern, section or heading', () => {
    expect(bad({ expectations: [{ kind: 'code', check: 'nope' as never, says: 'x' }] })[0]).toContain('unknown check');
    expect(bad({ expectations: [{ kind: 'code', check: 'in_view', says: 'x' }] })[0]).toContain('needs who');
    expect(
      bad({ expectations: [{ kind: 'code', check: 'in_view', args: { who: 'p1', n: 1 }, says: 'x' }] })[0],
    ).toContain('takes no n');
    expect(
      bad({ expectations: [{ kind: 'code', check: 'prompt_has', args: { pattern: '(' }, says: 'x' }] })[0],
    ).toContain('not a regular expression');
    expect(
      bad({
        expectations: [{ kind: 'code', check: 'prompt_has', args: { pattern: 'x', section: 'nope' }, says: 'x' }],
      })[0],
    ).toContain('unknown section');
    expect(
      bad({ expectations: [{ kind: 'code', check: 'heading_said', args: { expect: 'up' }, says: 'x' }] })[0],
    ).toContain('not a heading');
  });
  test('an ask that is not a question, an unknown class or step, a passing case set aside, an id twice', () => {
    expect(bad({ expectations: [{ kind: 'ask', question: 'the dreamer is there' }] })[0]).toContain(
      'must be a question',
    );
    expect(bad({ class: 'nope' as never })[0]).toContain('unknown class');
    expect(bad({ step: 'soon' })[0]).toContain('step');
    expect(bad({ kind: 'passing', hypothesis: 'x' })[0]).toContain('never');
    expect(bad({ seen_in: ['somewhere' as Draw] })[0]).toContain('seen_in');
    expect(validateCases([good, good])[0]).toContain('used twice');
  });
  test('a failing case with no note says where its fault was read', () => {
    expect(bad({ note: null })[0]).toContain('fault_from');
    expect(bad({ note: null, fault_from: 'blind_reason' })).toEqual([]);
  });
});

describe('the parts of a prompt', () => {
  test('each paragraph is known by what it opens with', () => {
    const s = sectionsOf(
      [
        'One picture from the dream, in a landscape 16:9 frame.',
        'What the camera sees: a room.',
        'The attached images, in order, and the one thing to take from each:\nImage 1: x',
        'What happens in this frame: she waits.',
        'Seen from in front of them. From left to right across the picture: a, then b.',
        'In it:\nthe dreamer (person): tall.',
        'Still so from earlier in the dream: the room is flooded.',
        'Style: ink.\nMade as: ink.',
        'Something else.',
      ].join('\n\n'),
    );
    expect(s.shot).toBe('What the camera sees: a room.');
    expect(s.staging).toContain('From left to right');
    expect(s.still).toContain('flooded');
    expect(s.style).toContain('Made as');
    expect(s.other).toBe('Something else.');
    expect(s.pov).toBeUndefined();
  });
});

const run = (c: Ctx, name: keyof typeof CHECKS, args: Record<string, unknown> = {}) =>
  runCheck(c, { kind: 'code', check: name, args, says: '' });
const withPrompt = (c: Ctx, prompt: string): Ctx => ({ ...c, p: { ...c.p, prompt }, sections: sectionsOf(prompt) });

describe('the checks, on a frozen dream', () => {
  // The lighthouse dream's m10: the tractor seen out of the window was put inside the round room.
  const m10 = contextOf(lighthouse, 'm10');
  const check = (name: keyof typeof CHECKS, args: Record<string, unknown> = {}) => run(m10, name, args).pass;

  test('who is in view, and whose images are attached', () => {
    expect(check('in_view', { who: 't3' })).toBe(true);
    expect(check('not_in_view', { who: 't3' })).toBe(false);
    expect(check('not_in_view', { who: 'p4' })).toBe(true);
    expect(check('image_of', { who: 'p1' })).toBe(true);
    expect(check('no_image_of', { who: 't3' })).toBe(false);
    expect(check('images_per_subject_at_most', { n: 1 })).toBe(true);
    expect(check('images_at_most', { n: 5 })).toBe(false);
    expect(check('dreamer_seen_or_pov')).toBe(true);
    expect(check('no_dreamer_image')).toBe(false);
    expect(check('no_mockup')).toBe(false);
  });

  test('the floor plan: what stands on it, who holds what, who faces whom', () => {
    // The tractor stands on the round room's plan, by the window; the boat is in the dreamer's hands.
    expect(run(m10, 'not_on_floor_plan', { who: 't3' }).detail).toContain('stands on the plan');
    expect(check('not_on_floor_plan', { who: 'p4' })).toBe(true);
    expect(check('held_by', { who: 't2', by: 'p1' })).toBe(true);
    expect(check('held_by', { who: 't2', by: 'p3' })).toBe(false);
    // In the train, the dreamer and the grandfather face each other; the suitcase is his at m2.
    const m1 = contextOf(snow, 'm1');
    expect(run(m1, 'faces_each_other', { a: 'p1', b: 'p2' }).pass).toBe(true);
    expect(run(m1, 'faces', { who: 'p1', toward: ['p2'] }).pass).toBe(true);
    expect(run(m1, 'faces', { who: 'p1', toward: ['x1'] }).pass).toBe(false);
    expect(run(contextOf(snow, 'm2'), 'held_by', { who: 't1', by: 'p2' }).pass).toBe(true);
    // At m4 the suitcase is on no plan at all.
    expect(run(contextOf(snow, 'm4'), 'held_by', { who: 't1', by: 'p2' }).detail).toContain('not on the plan');
  });

  test('earlier pictures, the edit, and how the camera moved', () => {
    expect(check('ref_of_picture', { moment: 'm8' })).toBe(true);
    expect(check('ref_of_picture', { moment: 'm8', roles: ['base'] })).toBe(false);
    expect(check('ref_of_picture', { moment: 'm9' })).toBe(false);
    expect(check('no_edit_of_earlier')).toBe(true);
    expect(check('relation_to', { moment: 'm8', relation: ['same_side'] })).toBe(true);
    expect(check('relation_to', { moment: 'm9', relation: ['same_side'] })).toBe(false);
    // m8 faces the father's table, m10 the window, as m9 does: turned right round from the one, not the other.
    expect(check('camera_turned_from', { moment: 'm8', degrees: 150 })).toBe(true);
    expect(check('camera_turned_from', { moment: 'm9', degrees: 30 })).toBe(false);
    expect(check('camera_differs_from', { moment: 'm8', degrees: 360, metres: 100, height: 10 })).toBe(false);
  });

  test("the prompt's words, whole or by part", () => {
    expect(check('prompt_has', { pattern: 'paper boat' })).toBe(true);
    expect(check('prompt_has', { pattern: 'paper boat', section: 'happens' })).toBe(true);
    expect(check('prompt_has', { pattern: 'paper boat', section: 'still' })).toBe(false);
    expect(check('prompt_lacks', { pattern: 'the red tractor, across the picture', section: 'shot' })).toBe(false);
  });

  test('which way something moving goes, and never the other way', () => {
    const m12 = contextOf(lighthouse, 'm12');
    expect(run(m12, 'heading_said', { expect: 'away' }).pass).toBe(false);
    const away = withPrompt(m12, `${m12.p.prompt}\n\nThe tractor drives away from the camera, into the picture.`);
    expect(run(away, 'heading_said', { expect: 'away' }).pass).toBe(true);
    const both = withPrompt(away, `${away.p.prompt} It drives from the left of the picture toward the right.`);
    expect(run(both, 'heading_said', { expect: 'away' }).pass).toBe(true);
    expect(run(both, 'heading_said', { expect: 'away', not: ['right'] }).detail).toContain('says right');
    expect(run(withPrompt(m12, 'The cart rolls toward the camera.'), 'heading_said', { expect: 'toward' }).pass).toBe(
      true,
    );
  });

  test('a state is carried by the plan, or said as still so: a word elsewhere is not a state', () => {
    const m5 = contextOf(market, 'm5');
    expect(run(m5, 'state_carried', { who: 't1', now: 'newspaper' }).pass).toBe(true);
    expect(run(m5, 'state_carried', { who: 't1', now: 'on ice' }).pass).toBe(false);
    expect(run(m5, 'state_not_carried', { who: 't1', now: 'newspaper' }).pass).toBe(false);
    // "Flooded with light" in the style is not a flood carried; the same words as still so are.
    const flooded = withPrompt(m5, m5.p.prompt.replace('Style: ', 'Light is flooded everywhere.\n\nStyle: '));
    expect(run(flooded, 'state_carried', { who: 'l2', what: 'water', text: 'flooded' }).pass).toBe(false);
    const still = withPrompt(m5, `${m5.p.prompt}\n\nStill so from earlier in the dream: the bridge is flooded.`);
    expect(run(still, 'state_carried', { who: 'l2', what: 'water', text: 'flooded' }).detail).toContain(
      'said as still so',
    );
    // The fish's sketch and its in-between picture both say how it looks.
    expect(run(m5, 'images_per_subject_at_most', { n: 1, who: 't1' }).pass).toBe(false);
  });

  test("what a sketch says of someone's look", () => {
    const m4 = contextOf(heron, 'm4');
    expect(run(m4, 'look_has', { who: 'p2', field: 'wardrobe' }).detail).toBe('no wardrobe said');
    expect(run(m4, 'look_has', { who: 'p1', field: 'wardrobe', pattern: 'jeans' }).pass).toBe(true);
  });

  test('a picture kept for someone who has no sketch counts for them alone', () => {
    // The classroom's m4 takes picture 3 for the faceless students, who have no sketch; the dreamer has theirs.
    const m4 = contextOf(heron, 'm4');
    expect(m4.refs.find((x) => x.of === 'm3')?.subjects).toEqual(['p2']);
    expect(run(m4, 'images_per_subject_at_most', { n: 1 }).pass).toBe(true);
  });
});

describe('the questions for Jev', () => {
  const c: PromptCase = {
    id: 'q',
    kind: 'failing',
    class: 'holding',
    step: 'S1',
    session: 'dream-0926-022102-aeea',
    moment: 'm10',
    source: { file: 'story-pictures.json', row: 'lighthouse-fresh-m10' },
    note: null,
    verdicts: {},
    seen_in: ['story'],
    fault_from: 'blind_reason',
    fault: 'x',
    expectations: [
      { kind: 'ask', question: 'Does this prompt say the boat is in their hands?' },
      { kind: 'ask', question: 'Does this prompt say the tractor is in the room?', expect: 'no' },
    ],
  };
  const ctx = contextOf(lighthouse, 'm10');
  const items = c.expectations.map((e) => ({ prompt: ctx.p.prompt, question: (e as { question: string }).question }));

  test('asked once each, answered from the cache after', async () => {
    const cache: JevCache = {};
    const jev = fakeJev((_, state): Record<string, Answer> => (state.includes('paper boat') ? { q: noul(0.9) } : {}));
    expect(await askAll(items, jev, cache)).toEqual([]);
    expect(jev.calls).toBe(2);
    await askAll(items, jev, cache);
    expect(jev.calls).toBe(2);
    // Another prompt is another question.
    await askAll([{ prompt: `${ctx.p.prompt} More.`, question: items[0].question }], jev, cache);
    expect(jev.calls).toBe(3);
  });

  test('the key is the model by name, the question as sent and the prompt', () => {
    expect(askKey('a', 'b?')).not.toBe(askKey('a ', 'b?'));
    expect(askKey('a', 'b?', 'jev-1.13.0')).not.toBe(askKey('a', 'b?', 'jev-1.14.0'));
    expect(JEV_MODEL()).toMatch(/^jev-\d/);
    expect(askQuestion('b?').instructions).toContain('b?');
  });

  test('an answer from another model than the one named is reported', async () => {
    const cache: JevCache = {};
    const jev = fakeJev();
    const other = (async (state, qs) => ({ ...(await jev(state, qs)), model: 'jev-9' })) as typeof jev;
    const errors = await askAll([items[0]], other, cache);
    expect(errors[0]).toContain('answered by jev-9');
    expect(Object.values(cache)[0].served).toBe('jev-9');
  });

  test('a yes that should be a no fails, an unanswered question is not a pass, and a close answer is marked', () => {
    const cache: JevCache = {
      [askKey(ctx.p.prompt, items[0].question)]: { p: 0.93, model: 'm', at: '' },
      [askKey(ctx.p.prompt, items[1].question)]: { p: 0.55, model: 'm', at: '' },
    };
    const r = judgeCase(c, ctx, cache);
    expect(r.expectations.map((e) => e.pass)).toEqual([true, false]);
    expect(r.expectations[1].close).toBe(true);
    expect(r.pass).toBe(false);
    const unanswered = judgeCase(c, ctx, {
      [askKey(ctx.p.prompt, items[0].question)]: { p: 0.9, model: 'm', at: '' },
    });
    expect(unanswered.pass).toBeNull();
    expect(judgeCase(c, new Error('no such moment'), {}).error).toBe('no such moment');
  });
});

describe('a run, and one against another', () => {
  const result = (id: string, pass: boolean | null, extra: Partial<CaseResult> = {}): CaseResult => ({
    id,
    kind: 'failing',
    class: 'state_carried',
    step: 'S1',
    model_only: false,
    set_aside: false,
    hypothesis: false,
    needs_model_step: false,
    session: 's',
    moment: 'm1',
    pass,
    expectations: [],
    ...extra,
  });
  const runOf = (cases: CaseResult[], label: string, dreams = { s: 'h1' }): RunFile => ({
    label,
    at: '',
    commit: null,
    switches: {},
    jevModel: 'm',
    inputs: { from: 'frozen', cases: 'c1', dreams },
    totals: totalsOf(cases),
    cases,
  });

  test('totals by class keep model-only cases and hypotheses out of the rates, and count model steps apart', () => {
    const t = totalsOf([
      result('a', true),
      result('b', false, { needs_model_step: true }),
      result('c', null),
      result('d', true, { model_only: true }),
      result('e', false, { hypothesis: true }),
      result('f', true, { kind: 'passing' }),
    ]).state_carried;
    expect(t.failing).toEqual({ cases: 3, pass: 1, unknown: 1 });
    expect(t.model_step).toEqual({ cases: 1, pass: 0, unknown: 0 });
    expect(t.out).toEqual({ cases: 1, pass: 1, unknown: 0 });
    expect(t.hypothesis).toEqual({ cases: 1, pass: 0, unknown: 0 });
    expect(t.passing).toEqual({ cases: 1, pass: 1, unknown: 0 });
  });

  test('what came right, what went wrong, what is unsure, which checks and answers moved', () => {
    const ask = (p: number, pass: boolean) => ({ kind: 'ask' as const, question: 'q?', pass, detail: '', p });
    const before = runOf(
      [
        result('a', false, { expectations: [ask(0.2, false)] }),
        result('b', true),
        result('c', false),
        result('d', true),
      ],
      'before',
    );
    const now = runOf(
      [result('a', true, { expectations: [ask(0.9, true)] }), result('b', false), result('c', null), result('d', true)],
      'now',
    );
    const c = compare(before, now);
    expect(c.better).toEqual(['a']);
    expect(c.worse).toEqual(['b']);
    expect(c.unsure).toEqual(['c']);
    expect(c.moved[0]).toContain('a #0 ask: q?: not met -> met (0.20 -> 0.90)');
    expect(c.warnings).toEqual([]);
    expect(compare(before, before).lines.at(-1)).toContain('no case changed');
  });

  test('two runs that read different dreams or cases are told apart', () => {
    const a = runOf([], 'a');
    const b = runOf([], 'b', { s: 'h2' });
    expect(compare(a, b).warnings).toEqual(['dreams changed: s']);
    expect(inputsDiffer({ ...a.inputs, from: 'live' }, a.inputs)[0]).toContain('live before');
    expect(inputsDiffer({ ...a.inputs, cases: 'c0' }, a.inputs)).toEqual(['the case file changed']);
  });
});

describe('the frozen dreams and the corpus dump', () => {
  const dump = (dreams: Dump['dreams']): Dump => ({
    label: 'x',
    at: '',
    commit: null,
    switches: {},
    inputs: { from: 'frozen', dreams: {} },
    dreams,
  });

  test('a frozen dream keeps what rebuild reads: it rebuilds as itself, and who the dreamer is', () => {
    const d = loadDream('dream-0926-022102-aeea', false);
    expect(verifyFrozen(d.session, d.session)).toEqual([]);
    expect(lighthouse.sheets.find((s) => s.id === 'p1')?.isDreamer).toBe(true);
    expect(lighthouse.pictures.find((p) => p.id === 'm12')?.prompt).toContain('The shot, as the mock-up');
  });

  test('images are named by what they are, never by a store id, and in-between pictures by what they show', () => {
    const d = dumpOf(lighthouse);
    const m10 = d.pictures.find((p) => p.id === 'm10')!;
    expect(m10.images).toEqual([
      'base previs:m10',
      'identity sketch:p1',
      'prop sketch:t2',
      'prop sketch:t3',
      'location sketch:l3',
      'composition picture:m8',
    ]);
    expect(imageName(snow2, 'picture-g1')).toBe('ghost:t1:lid');
    expect(m10.plan?.refs).toContain('cut m8 composition same_side');
  });

  test('where a dream keeps what was sent, the dump says whether its images are those', () => {
    const d = loadDream('dream-0926-022102-aeea', false);
    const dd = dumpOf(lighthouse, sentOf(d.session as Session));
    // m10 was drawn before picture 8 was, so its picture 8 went unattached; m13's were as rebuilt.
    expect(dd.pictures.find((p) => p.id === 'm10')?.sent?.same_images).toBe(false);
    expect(dd.pictures.find((p) => p.id === 'm13')?.sent?.same_images).toBe(true);
  });

  test('the same dream twice is the same; a changed paragraph, image or plan is found', () => {
    const a = dumpOf(lighthouse);
    expect(diffDumps(dump({ d: a }), dump({ d: dumpOf(frozen('dream-0926-022102-aeea')) })).pictures.changed).toBe(0);
    const b = structuredClone(a);
    const m2 = b.pictures.find((p) => p.id === 'm2')!;
    m2.prompt = m2.prompt.replace('What happens in this frame:', 'What happens in this frame, now:');
    m2.images = m2.images.slice(1);
    m2.plan!.states = ['l1 water: over the desks'];
    const diff = diffDumps(dump({ d: a }), dump({ d: b, e: { pictures: [] } }));
    expect(diff.pictures.changed).toBe(1);
    expect(diff.dreams.only_now).toEqual(['e']);
    const c = diff.changes[0];
    expect(c.id).toBe('m2');
    expect(c.gone[0]).toStartWith('What happens in this frame:');
    expect(c.added[0]).toStartWith('What happens in this frame, now:');
    expect(c.images?.now.length).toBe(c.images!.before.length - 1);
    expect(c.plan?.map((p) => p.field)).toEqual(['states']);
  });

  test('a change anywhere in a long paragraph shows as the words that changed', () => {
    const long = `${'word '.repeat(200)}the end`;
    expect(wordDiff(long, long.replace('the end', 'the very end'))).toContain('[+very +]');
    expect(wordDiff('a b c', 'a x c')).toBe('a [-b-][+x+] c');
    const a = dumpOf(lighthouse);
    const b = structuredClone(a);
    const m12 = b.pictures.find((p) => p.id === 'm12')!;
    m12.prompt = m12.prompt.replace('with bright daylight coming through it', 'with dusk coming through it');
    const lines = diffLines(diffDumps(dump({ d: a }), dump({ d: b }))).join('\n');
    expect(lines).toContain('[-bright daylight-][+dusk+]');
  });
});
