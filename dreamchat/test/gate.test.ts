import { describe, expect, test } from 'bun:test';
import { checkReferences, DIFFUSE_UP_TO, gateQuestions, MAX_CONTRADICTS_MOMENT, MIN_EDIT_CLEAR, readPrompt } from '../gate';
import type { JevFn } from '../jev';

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

  test('a contradiction just over the line is held only when one line of the prompt carries it', async () => {
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
  });

  test('someone drawn twice just over the line is held only when one line carries it', async () => {
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
  });

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
