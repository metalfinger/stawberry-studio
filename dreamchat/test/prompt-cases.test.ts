import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffDumps, type Dump, dumpOf, imageName } from '../evals/corpus';
import {
  askAll,
  askKey,
  CHECKS,
  CLASSES,
  type CaseResult,
  compare,
  contextOf,
  type JevCache,
  judgeCase,
  loadCases,
  type PromptCase,
  type RunFile,
  runCheck,
  sectionsOf,
  totalsOf,
  validateCases,
} from '../evals/prompt-cases';
import { rebuild } from '../plan';
import type { Answer } from '../jev';
import type { Session } from '../session';
import { fakeJev, noul } from './fakes';

const EVALS = join(import.meta.dir, '..', 'evals');
const read = <T>(name: string) => JSON.parse(readFileSync(join(EVALS, name), 'utf8')) as T;
// Dreams as frozen (evals/sources): the saved conversations are not in the repository.
const frozen = (name: string) => rebuild(read<Session & { from: string }>(`sources/${name}.json`));
const lighthouse = frozen('lighthouse-fresh');
const heron = frozen('heron');
const market = frozen('night-market');

type StoryRow = { id: string; session: string; moment: string; human: string; human_note?: string };
type PairedRow = { id: string; versions: Record<string, { way: string; human: string; human_note?: string }> };
type SetRow = { id: string; session: string; moment: string };
const story = read<{ rows: StoryRow[] }>('story-pictures.json').rows;
const paired = read<{ rows: PairedRow[] }>('paired-verdicts.json').rows;
const pairedSet = read<{ rows: SetRow[] }>('paired-set.json').rows;

/** The person's verdict and note on a source row, and the dream and moment it is of. */
function rowOf(s: PromptCase['source']) {
  if (s.file === 'story-pictures.json') {
    const r = story.find((x) => x.id === s.row);
    return r && { session: r.session, moment: r.moment, human: r.human, note: r.human_note ?? null };
  }
  const v = paired.find((x) => x.id === s.row)?.versions[s.version ?? ''];
  const where = pairedSet.find((x) => x.id === s.row);
  return v && where && { session: where.session, moment: where.moment, human: v.human, note: v.human_note ?? null };
}

describe('the case set', () => {
  const cases = loadCases();

  test('loads, and every case is sound', () => {
    expect(validateCases(cases)).toEqual([]);
    expect(cases.length).toBeGreaterThan(60);
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

  test('every class is known, and passing cases exist to guard what was right', () => {
    for (const c of cases) expect(CLASSES).toContain(c.class);
    expect(cases.filter((c) => c.kind === 'passing').length).toBeGreaterThan(20);
  });
});

describe('the loader refuses a malformed case', () => {
  const good: PromptCase = {
    id: 'x',
    kind: 'failing',
    class: 'presence',
    session: 'dream-0926-022102-aeea',
    moment: 'm13',
    source: { file: 'story-pictures.json', row: 'lighthouse-fresh-m13' },
    note: 'gone',
    fault: 'the dreamer is gone',
    expectations: [{ kind: 'code', check: 'in_view', args: { who: 'p1' }, says: 'the dreamer is in view' }],
  };
  const bad = (patch: Partial<PromptCase>) => validateCases([{ ...good, ...patch }]);

  test('a sound case passes', () => expect(validateCases([good])).toEqual([]));
  test('an unknown check, a missing or unknown argument, a broken pattern or section', () => {
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
  });
  test('an ask that is not a question, an unknown class, a passing case set aside, an id twice', () => {
    expect(bad({ expectations: [{ kind: 'ask', question: 'the dreamer is there' }] })[0]).toContain(
      'must be a question',
    );
    expect(bad({ class: 'nope' as never })[0]).toContain('unknown class');
    expect(bad({ kind: 'passing', model_only: true })[0]).toContain('never model_only');
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

describe('the checks, on a frozen dream', () => {
  // The lighthouse dream's m10: the tractor seen out of the window was put inside the round room.
  const m10 = contextOf(lighthouse, 'm10');
  const check = (name: keyof typeof CHECKS, args: Record<string, unknown> = {}) =>
    runCheck(m10, { kind: 'code', check: name, args, says: '' }).pass;

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

  test('what the plan carries from earlier, or what the prompt says in its place', () => {
    const m5 = contextOf(market, 'm5');
    const run = (name: keyof typeof CHECKS, args: Record<string, unknown>) =>
      runCheck(m5, { kind: 'code', check: name, args, says: '' });
    expect(run('state_carried', { who: 't1', now: 'newspaper' }).pass).toBe(true);
    expect(run('state_carried', { who: 't1', now: 'on ice' }).pass).toBe(false);
    expect(run('state_carried', { who: 't1', now: 'on ice', text: 'pedalling' }).detail).toContain('not in the plan');
    expect(run('state_not_carried', { who: 't1', now: 'newspaper' }).pass).toBe(false);
    // The fish's sketch and its in-between picture both say how it looks.
    expect(run('images_per_subject_at_most', { n: 1, who: 't1' }).pass).toBe(false);
  });

  test('a picture kept for someone who has no sketch counts for them alone', () => {
    // The classroom's m4 takes picture 3 for the faceless students, who have no sketch; the dreamer has theirs.
    const m4 = contextOf(heron, 'm4');
    expect(m4.refs.find((x) => x.of === 'm3')?.subjects).toEqual(['p2']);
    expect(runCheck(m4, { kind: 'code', check: 'images_per_subject_at_most', args: { n: 1 }, says: '' }).pass).toBe(
      true,
    );
  });
});

describe('the questions for Jev', () => {
  const c: PromptCase = {
    id: 'q',
    kind: 'failing',
    class: 'holding',
    session: 'dream-0926-022102-aeea',
    moment: 'm10',
    source: { file: 'story-pictures.json', row: 'lighthouse-fresh-m10' },
    note: null,
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
    expect(askKey('a', 'b')).not.toBe(askKey('a ', 'b'));
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
    const unanswered = judgeCase(c, ctx, { [askKey(ctx.p.prompt, items[0].question)]: { p: 0.9, model: 'm', at: '' } });
    expect(unanswered.pass).toBeNull();
    expect(judgeCase(c, new Error('no such moment'), {}).error).toBe('no such moment');
  });
});

describe('a run, and one against another', () => {
  const result = (id: string, pass: boolean | null, extra: Partial<CaseResult> = {}): CaseResult => ({
    id,
    kind: 'failing',
    class: 'state_carried',
    model_only: false,
    set_aside: false,
    session: 's',
    moment: 'm1',
    pass,
    expectations: [],
    ...extra,
  });
  const run = (cases: CaseResult[], label: string): RunFile => ({
    label,
    at: '',
    commit: null,
    switches: {},
    jevModel: 'm',
    data: '',
    totals: totalsOf(cases),
    cases,
  });

  test('totals by class keep model-only cases out of the rates', () => {
    const t = totalsOf([
      result('a', true),
      result('b', false),
      result('c', null),
      result('d', true, { model_only: true }),
      result('e', true, { kind: 'passing' }),
    ]).state_carried;
    expect(t.failing).toEqual({ cases: 3, pass: 1, unknown: 1 });
    expect(t.out).toEqual({ cases: 1, pass: 1, unknown: 0 });
    expect(t.passing).toEqual({ cases: 1, pass: 1, unknown: 0 });
  });

  test('what came right, what went wrong, what is unsure', () => {
    const before = run([result('a', false), result('b', true), result('c', false), result('d', true)], 'before');
    const now = run([result('a', true), result('b', false), result('c', null), result('d', true)], 'now');
    const c = compare(before, now);
    expect(c.better).toEqual(['a']);
    expect(c.worse).toEqual(['b']);
    expect(c.unsure).toEqual(['c']);
    expect(compare(before, before).lines.at(-1)).toContain('no case changed');
  });
});

describe('the corpus dump', () => {
  const dump = (dreams: Dump['dreams']): Dump => ({ label: 'x', at: '', commit: null, switches: {}, data: '', dreams });

  test('images are named by what they are, never by a store id', () => {
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
    expect(imageName(heron, 'picture-g1')).toBe('ghost:g1');
    expect(m10.plan?.refs).toContain('cut m8 composition same_side');
  });

  test('the same dream twice is the same; a changed paragraph, image or plan is found', () => {
    const a = dumpOf(lighthouse);
    expect(diffDumps(dump({ d: a }), dump({ d: dumpOf(frozen('lighthouse-fresh')) })).pictures.changed).toBe(0);
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
});
