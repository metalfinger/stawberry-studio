import { describe, expect, test } from 'bun:test';
import { checkReferences, gateQuestions, MAX_CONTRADICTS, MIN_EDIT_CLEAR, readPrompt } from '../gate';
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
      jevSaying({ contradicts: MAX_CONTRADICTS + 0.2, twice: 0.8, clear: 0.3, refs_clear: 0.4 }),
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
