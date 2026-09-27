import { describe, expect, test } from 'bun:test';
import {
  actsWhenLogging,
  checkReferences,
  checksMode,
  DIFFUSE_UP_TO,
  gateFacts,
  gateQuestions,
  MAX_CONTRADICTS_MOMENT,
  MIN_EDIT_CLEAR,
  readPrompt,
} from '../gate';
import type { JevFn } from '../jev';
import { withChecks } from './fakes';

const jevSaying =
  (answers: Record<string, number>): JevFn =>
  async (state, questions) => ({
    questions,
    state,
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { type: 'noul' as const, noul: v }])),
    error: null,
    ms: 1,
    usage: null,
  });

describe('the confidence gate', () => {
  const prompt = 'One picture.\nImage 1: EDIT THIS PICTURE.\nImage 2: who ana is.\nWhat happens in this frame: she waits.';
  const refs = [
    { media_id: 'a', role: 'base' },
    { media_id: 'b', role: 'identity' },
  ];

  test('draws only what every reading is sure of', async () => {
    const sure = await readPrompt(jevSaying({ contradicts: 0.1, twice: 0.05, clear: 0.9, refs_clear: 0.9 }), prompt);
    expect(sure.findings).toEqual([]);
    const unsure = await readPrompt(
      jevSaying({ contradicts: DIFFUSE_UP_TO + 0.2, twice: 0.8, clear: 0.3, refs_clear: 0.4 }),
      prompt,
    );
    expect(unsure.findings.map((f) => f.split(' (')[0])).toEqual([
      'its instructions may contradict each other',
      'someone may be drawn twice',
      'what it shows is not clear enough to draw',
      'what to take from each image is not clear enough',
    ]);
    // No reading, no confidence: held, never drawn blind.
    const down: JevFn = async (state, questions) => ({ questions, state, answers: null, error: '503', ms: 1, usage: null });
    expect((await readPrompt(down, prompt)).findings[0]).toContain('could not be checked');
  });

  test('a contradiction just over the line is held only when one line of the prompt carries it', () =>
    withChecks('act', async () => {
      const long = 'One picture.\nThe dreamer stands alone on the roof.\nThe family sits beside the dreamer.\nIt feels cold.';
      // Jev reads 0.5 for the whole prompt; the planted line is what it rests on, or nothing is.
      const reading = (local: boolean): JevFn => async (state, questions) => ({
        questions,
        state,
        answers: Object.fromEntries(
          Object.keys(questions).map((k) => [
            k,
            {
              type: 'noul' as const,
              noul: k === 'contradicts' ? (local && !state.includes('The family sits') ? 0.2 : 0.5) : k === 'twice' ? 0.1 : 0.9,
            },
          ]),
        ),
        error: null,
        ms: 1,
        usage: null,
      });
      expect(MAX_CONTRADICTS_MOMENT).toBeLessThan(0.5);
      const local = await readPrompt(reading(true), long);
      expect(local.findings).toEqual(['its instructions may contradict each other (0.50), around: "The family sits beside the dreamer."']);
      // Diffuse: no line carries it, and a long prompt reads a little higher: drawn.
      const diffuse = await readPrompt(reading(false), long);
      expect(diffuse.findings).toEqual([]);
    }));

  test('someone drawn twice just over the line is held only when one line carries it', () =>
    withChecks('act', async () => {
      const long = 'One picture.\nThe blue sofa they sit on.\nThe baby, again, on her own.\nIt feels cold.';
      const reading = (local: boolean): JevFn => async (state, questions) => ({
        questions,
        state,
        answers: Object.fromEntries(
          Object.keys(questions).map((k) => [
            k,
            {
              type: 'noul' as const,
              noul: k === 'twice' ? (local && !state.includes('The baby, again') ? 0.1 : 0.45) : k === 'contradicts' ? 0.1 : 0.9,
            },
          ]),
        ),
        error: null,
        ms: 1,
        usage: null,
      });
      expect((await readPrompt(reading(true), long)).findings).toEqual([
        'someone may be drawn twice (0.45), around: "The baby, again, on her own."',
      ]);
      expect((await readPrompt(reading(false), long)).findings).toEqual([]);
    }));

  test('an in-between picture is read as an edit: is its one change plain, and what stays', async () => {
    const edit = 'Image 1 is the young woman\'s reference sheet: edit it. Make exactly one change: her head is now a block of ice.';
    const qs = gateQuestions(true, false, undefined, true);
    expect(qs.clear.instructions).toContain('edit an attached reference picture');
    expect(qs.refs_clear.instructions).toContain('which image is the one to edit');
    // A sound edit reads far clearer than a moment must; a vague one does not.
    const sound = await readPrompt(jevSaying({ contradicts: 0.2, twice: 0.1, clear: MIN_EDIT_CLEAR + 0.1, refs_clear: 0.85 }), edit, { edit: true });
    expect(sound.findings).toEqual([]);
    const vague = await readPrompt(jevSaying({ contradicts: 0.2, twice: 0.1, clear: 0.15, refs_clear: 0.85 }), edit, { edit: true });
    expect(vague.findings[0]).toContain('what it shows is not clear enough to draw');
  });

  test('knows what every attached image is for, and that each is approved and in its place', () => {
    expect(checkReferences(prompt, refs, { approved: new Set(['a', 'b']) })).toEqual([]);
    expect(checkReferences(prompt, [...refs, { media_id: 'c', role: 'identity' }])).toContain(
      'image 3 is attached with no word on what to take from it',
    );
    expect(checkReferences(prompt, [refs[1], refs[0]])).toContain('the picture to edit is not the first image');
    expect(checkReferences(prompt, refs, { approved: new Set(['a']) })).toContain('image 2 is not an approved picture');
    expect(
      checkReferences(prompt, refs, { mustInclude: [{ name: 'the conductor', mediaId: 'z' }] }),
    ).toContain('the conductor is in view but their sketch is not attached');
    // An in-between reference says "Image 1 is …".
    expect(checkReferences('Image 1 is her sketch: edit it. Image 2 is the moment.', refs.slice(0, 2).map((r) => ({ ...r, role: 'identity' })))).toEqual([]);
  });
});

describe('the checks only logging (DREAMCHAT_CHECKS=log)', () => {
  const prompt =
    'One picture.\nImage 1: EDIT THIS PICTURE.\nImage 2: who ana is.\nWhat happens in this frame: she waits.';
  const refs = [
    { media_id: 'a', role: 'base' },
    { media_id: 'b', role: 'identity' },
  ];

  test('acting is the default; only "log" logs', () => {
    const was = process.env.DREAMCHAT_CHECKS;
    try {
      for (const [v, mode] of [
        [undefined, 'act'],
        ['', 'act'],
        ['act', 'act'],
        ['LOG ', 'log'],
        ['log', 'log'],
      ] as const) {
        if (v === undefined) delete process.env.DREAMCHAT_CHECKS;
        else process.env.DREAMCHAT_CHECKS = v;
        expect(checksMode()).toBe(mode);
      }
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_CHECKS;
      else process.env.DREAMCHAT_CHECKS = was;
    }
  });

  test('every fault code finds in the images keeps acting; every reading and plan warning only logs', async () => {
    const code = [
      ...checkReferences(prompt, [...refs, { media_id: 'c', role: 'identity' }]),
      ...checkReferences('Image 1: a. Image 2: b. Image 3: c.', refs),
      ...checkReferences(prompt, [refs[1], refs[0]]),
      ...checkReferences(prompt, [refs[0], { media_id: 'd', role: 'base' }]),
      ...checkReferences(prompt, [refs[0], { media_id: 'a', role: 'identity' }]),
      ...checkReferences(
        Array.from({ length: 14 }, (_, i) => `Image ${i + 1}: x.`).join('\n'),
        Array.from({ length: 14 }, (_, i) => ({ media_id: `m${i}`, role: 'identity' })),
      ),
      ...checkReferences(prompt, refs, { approved: new Set(['a']) }),
      ...checkReferences(prompt, refs, { mustInclude: [{ name: 'the conductor', mediaId: 'z' }] }),
      'picture 3 refers to picture 5, which is not earlier',
    ];
    expect(code.length).toBeGreaterThanOrEqual(9);
    for (const f of code) expect([f, actsWhenLogging(f)]).toEqual([f, true]);
    const read = await readPrompt(
      jevSaying({ contradicts: DIFFUSE_UP_TO + 0.3, twice: 0.9, clear: 0.2, refs_clear: 0.2 }),
      prompt,
    );
    const missing = await readPrompt(
      async (state, questions) => ({ questions, state, answers: null, error: 'down', ms: 1, usage: null }),
      prompt,
    );
    const logged = [
      ...read.findings,
      ...missing.findings,
      'storyboard: the shot disagrees with the moment about who is in it',
      "picture 4: the dreamer's coat (wet) is carried in words only",
      'picture 2 still changes 3 things at once: a; b; c',
      'picture 1 has no visible action',
    ];
    expect(read.findings).toHaveLength(4);
    for (const f of logged) expect([f, actsWhenLogging(f)]).toEqual([f, false]);
  });

  test('a reading is never put on a line: one call to Jev, and what a line might have excused is said', async () => {
    const long = 'One picture.\nThe dreamer stands alone on the roof.\nThe family sits beside the dreamer.\nIt feels cold.';
    let calls = 0;
    const reading: JevFn = async (state, questions) => {
      calls++;
      return jevSaying({ contradicts: 0.5, twice: 0.45, clear: 0.9 })(state, questions);
    };
    const acting = await withChecks('act', () => readPrompt(reading, long));
    expect(calls).toBeGreaterThan(1);
    expect(acting.findings).toEqual([]);
    calls = 0;
    const logged = await withChecks('log', () => readPrompt(reading, long));
    expect(calls).toBe(1);
    expect(logged.findings).toEqual([
      "its instructions may contradict each other (0.50), not put on a line (it may be a long prompt's diffuse rise)",
      "someone may be drawn twice (0.45), not put on a line (it may be a long prompt's diffuse rise)",
    ]);
    expect(logged.reading).toEqual({ contradicts: 0.5, twice: 0.45, clear: 0.9, refsClear: null });
    const sure = await withChecks('log', () =>
      readPrompt(jevSaying({ contradicts: 0.9, twice: 0.1, clear: 0.9 }), long, { sheet: true }),
    );
    expect(sure.findings).toEqual(['its instructions may contradict each other (0.90)']);
  });

  test('a prompt Jev could not read is read once more when only logging, and never more', async () => {
    const prompt = 'One picture.\nThe dreamer stands alone on the roof.';
    let calls = 0;
    const flaky: JevFn = async (state, questions) =>
      ++calls === 1
        ? { questions, state, answers: null, error: '503', ms: 1, usage: null }
        : jevSaying({ contradicts: 0.1, twice: 0.1, clear: 0.9 })(state, questions);
    const logged = await withChecks('log', () => readPrompt(flaky, prompt));
    expect([calls, logged.findings, logged.reading?.clear]).toEqual([2, [], 0.9]);
    calls = 0;
    const acting = await withChecks('act', () => readPrompt(flaky, prompt));
    expect(calls).toBe(1);
    expect(acting.findings[0]).toContain('could not be checked');
    calls = 0;
    const down: JevFn = async (state, questions) => {
      calls++;
      return { questions, state, answers: null, error: '503', ms: 1, usage: null };
    };
    const still = await withChecks('log', () => readPrompt(down, prompt));
    expect(calls).toBe(2);
    expect([still.reading, actsWhenLogging(still.findings[0])]).toEqual([null, false]);
  });

  test("a reading says which questions it answered, and a sketch's parts of its look are logged", async () => {
    const sheet = await readPrompt(
      jevSaying({ contradicts: 0.1, twice: 0.1, clear: 0.9, has_age: 0.8, has_build: 0.3, has_hair: 0.9, has_clothes: 0.7 }),
      'A single clear picture of the conductor.',
      { sheet: true, kind: 'character' },
    );
    expect(sheet.reading?.facets).toEqual({ has_age: 0.8, has_build: 0.3, has_hair: 0.9, has_clothes: 0.7 });
    expect(gateFacts(sheet.reading!, { sheet: true }).slice(3)).toEqual([
      { question: 'has_age', answer: 0.8, bar: 0.5, ok: true },
      { question: 'has_build', answer: 0.3, bar: 0.5, ok: false },
      { question: 'has_hair', answer: 0.9, bar: 0.5, ok: true },
      { question: 'has_clothes', answer: 0.7, bar: 0.5, ok: true },
    ]);
    const moment = await readPrompt(jevSaying({ contradicts: 0.1, twice: 0.1, clear: 0.9 }), 'One picture.');
    const again = await readPrompt(jevSaying({ contradicts: 0.5, twice: 0.1, clear: 0.2 }), 'Another picture.');
    // The same questions hash the same whatever the prompt or the answers; other questions differ.
    expect(moment.asked).toMatch(/^[0-9a-f]{16}$/);
    expect(again.asked).toBe(moment.asked);
    expect(sheet.asked).not.toBe(moment.asked);
    expect(moment.reading?.facets).toBeUndefined();
  });

  test('a reading is logged with the bar each answer is held to', () => {
    const reading = { contradicts: 0.5, twice: 0.1, clear: 0.6, refsClear: 0.7 };
    expect(gateFacts(reading)).toEqual([
      { question: 'contradicts', answer: 0.5, bar: MAX_CONTRADICTS_MOMENT, ok: false },
      { question: 'twice', answer: 0.1, bar: 0.4, ok: true },
      { question: 'clear', answer: 0.6, bar: 0.7, ok: false },
      { question: 'refs_clear', answer: 0.7, bar: 0.6, ok: true },
    ]);
    expect(gateFacts({ ...reading, refsClear: null }, { sheet: true }).map((f) => [f.question, f.bar])).toEqual([
      ['contradicts', 0.3],
      ['twice', 0.4],
      ['clear', 0.7],
    ]);
    expect(gateFacts(reading, { edit: true })[2]).toEqual({
      question: 'clear',
      answer: 0.6,
      bar: MIN_EDIT_CLEAR,
      ok: true,
    });
  });
});
