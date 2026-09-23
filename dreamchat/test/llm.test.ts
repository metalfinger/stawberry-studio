import { describe, expect, test } from 'bun:test';
import { parseTurnResponse, RECOVERY } from '../llm';

describe('the turn contract, enforced in code', () => {
  test('a well-formed turn passes untouched', () => {
    const t = parseTurnResponse('{"response": ["a kitchen with a train board.", "what did it say?"]}');
    expect(t.messages).toEqual(['a kitchen with a train board.', 'what did it say?']);
    expect(t.violations).toEqual([]);
  });

  test('two asks keep only the last one', () => {
    const t = parseTurnResponse('{"response": ["wait, really?", "who was she? what was she wearing?"]}');
    expect(t.messages).toEqual(['wait, really.', 'what was she wearing?']);
  });

  test('one ask with options stays one ask', () => {
    const t = parseTurnResponse('{"response": ["who else was there? or were you alone?"]}');
    expect(t.messages).toEqual(['who else was there? or were you alone?']);
  });

  test('a bare string is levelled to one message', () => {
    expect(parseTurnResponse('{"response": "go on"}').messages).toEqual(['go on']);
  });

  test('a broken envelope is salvaged rather than shown', () => {
    const t = parseTurnResponse('{"response": ["that sounds strange", "what happened next?"');
    expect(t.messages).toEqual(['that sounds strange', 'what happened next?']);
  });

  test('leaked tool markup is never shown', () => {
    expect(parseTurnResponse('<invoke name="x">').messages).toEqual([RECOVERY]);
  });
});

describe('the one-ask repair keeps an example with its question', () => {
  test('a trailing "like …" is part of the ask before it', () => {
    const t = parseTurnResponse('{"response": ["did you hear anything? like voices, or music?"]}');
    expect(t.messages).toEqual(['did you hear anything? like voices, or music?']);
  });
});

describe('the producer keeps the camera out of what happens', () => {
  test('camera words at the start of an action are stripped', async () => {
    const { stripCamera } = await import('../producer');
    expect(stripCamera('Close on the single slat with the word zikery')).toBe('The single slat with the word zikery');
    expect(stripCamera('Wide view of the kitchen with the board')).toBe('The kitchen with the board');
    expect(stripCamera('A close-up of her hands')).toBe('Her hands');
    expect(stripCamera('She walks to the far end of the room')).toBe('She walks to the far end of the room');
    expect(stripCamera('Closer and closer the ice melts')).toBe('Closer and closer the ice melts');
  });
});

describe('the ask goes last', () => {
  test('a single question followed by a softener is moved to the end', () => {
    const t = parseTurnResponse(
      '{"response": ["an old man rowing in silence.", "was he a stranger?", "just a feeling, even if it made no sense."]}',
    );
    expect(t.messages).toEqual([
      'an old man rowing in silence.',
      'just a feeling, even if it made no sense.',
      'was he a stranger?',
    ]);
  });
});
