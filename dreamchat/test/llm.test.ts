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
