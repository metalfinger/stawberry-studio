import { describe, expect, test } from 'bun:test';
import {
  CLAUDE_LIMIT_MAX_MS,
  CLAUDE_LIMIT_POLL_MS,
  CLAUDE_TRIES,
  CLAUDE_WAITS_MS,
  type ClaudeRun,
  callClaude,
  claudePrompt,
  jsonOnly,
  limitResetIn,
  parseTurnResponse,
  RECOVERY,
} from '../llm';

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

describe('the Claude writer', () => {
  test('a single turn goes as the prompt, system messages as the system prompt', () => {
    const { system, prompt } = claudePrompt([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Tell me the dream.' },
    ]);
    expect(system).toBe('Be brief.');
    expect(prompt).toBe('Tell me the dream.');
  });

  test('earlier turns are written out, and the last user turn is the one answered', () => {
    const { prompt } = claudePrompt([
      { role: 'user', content: 'I was on a train.' },
      { role: 'assistant', content: 'Where was it going?' },
      { role: 'user', content: 'Into the snow.' },
    ]);
    expect(prompt).toContain('[user]\nI was on a train.');
    expect(prompt).toContain('[assistant]\nWhere was it going?');
    expect(prompt.indexOf('Into the snow.')).toBeGreaterThan(prompt.indexOf('Where was it going?'));
  });

  test('a fenced or introduced JSON reply is cut down to the object', () => {
    expect(jsonOnly('```json\n{"response": ["hi"]}\n```')).toBe('{"response": ["hi"]}');
    expect(jsonOnly('Here it is: {"a": {"b": 1}} ')).toBe('{"a": {"b": 1}}');
    expect(jsonOnly('no json')).toBe('no json');
  });

  const replies = (...results: string[]) => {
    const inputs: string[] = [];
    const run: ClaudeRun = async (_args, input) => {
      inputs.push(input);
      const result = results[Math.min(inputs.length - 1, results.length - 1)];
      return { out: JSON.stringify({ result, usage: { input_tokens: 10, output_tokens: 5 } }), err: '', code: 0 };
    };
    return { run, inputs };
  };

  test('a JSON reply that does not parse is asked for again, told why', async () => {
    const { run, inputs } = replies('{"action": "she says "get on""}', '{"action": "she says \\"get on\\""}');
    const r = await callClaude([{ role: 'user', content: 'the dream' }], { json: true }, run);
    expect(JSON.parse(r.content)).toEqual({ action: 'she says "get on"' });
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain('not valid JSON');
    expect(r.usage?.total_tokens).toBe(30);
  });

  test('an empty reply is asked for again; a good one is asked once', async () => {
    const empty = replies('', 'where did it go?');
    expect((await callClaude([{ role: 'user', content: 'hi' }], {}, empty.run)).content).toBe('where did it go?');
    expect(empty.inputs).toHaveLength(2);
    const good = replies('{"ok": true}');
    await callClaude([{ role: 'user', content: 'hi' }], { json: true }, good.run);
    expect(good.inputs).toHaveLength(1);
  });

  test('a reply broken every time is returned after the last try, for the caller to refuse', async () => {
    const { run, inputs } = replies('{"broken": ');
    const r = await callClaude([{ role: 'user', content: 'hi' }], { json: true }, run);
    expect(inputs).toHaveLength(CLAUDE_TRIES);
    expect(() => JSON.parse(r.content)).toThrow();
  });

  const failing = (failures: { out: string; err: string; code: number }[], result = 'fine') => {
    let n = 0;
    const waited: number[] = [];
    const run: ClaudeRun = async () =>
      n < failures.length ? failures[n++] : (n++, { out: JSON.stringify({ result }), err: '', code: 0 });
    return { run, waited, wait: async (ms: number) => void waited.push(ms), runs: () => n };
  };

  test('a CLI that passes (no input in time, logged out for a moment) is waited out and run again', async () => {
    const f = failing([
      { out: '', err: 'Warning: no stdin data received in 3s, proceeding without it.', code: 1 },
      { out: JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' }), err: '', code: 1 },
    ]);
    const r = await callClaude([{ role: 'user', content: 'hi' }], {}, f.run, f.wait);
    expect(r.content).toBe('fine');
    expect(f.waited).toEqual(CLAUDE_WAITS_MS.slice(0, 2));
  });

  test('a failure that does not pass, or one that never does, is thrown', async () => {
    const other = failing([{ out: '', err: 'unknown option --x', code: 1 }]);
    await expect(callClaude([{ role: 'user', content: 'hi' }], {}, other.run, other.wait)).rejects.toThrow(
      'unknown option',
    );
    expect(other.waited).toEqual([]);
    const overloaded = { out: '', err: 'API Error: 529 overloaded', code: 1 };
    const always = failing(Array(10).fill(overloaded));
    await expect(callClaude([{ role: 'user', content: 'hi' }], {}, always.run, always.wait)).rejects.toThrow(
      'overloaded',
    );
    expect(always.runs()).toBe(CLAUDE_WAITS_MS.length + 1);
  });

  test('the usage limit is waited out until it resets, then the call carries on', async () => {
    const reset = Math.floor(Date.now() / 1000) + 2 * 3600;
    const f = failing([{ out: JSON.stringify({ is_error: true, result: `Claude AI usage limit reached|${reset}` }), err: '', code: 1 }]);
    const r = await callClaude([{ role: 'user', content: 'hi' }], {}, f.run, f.wait);
    expect(r.content).toBe('fine');
    expect(f.waited).toHaveLength(1);
    // Two hours and a minute, give or take the test's own running time.
    expect(Math.abs(f.waited[0] - (2 * 3600_000 + 60_000))).toBeLessThan(5_000);
  });

  test('a limit that does not say when it resets is tried every ten minutes, and never consumes the short waits', async () => {
    const limit = { out: '', err: "You've hit your limit", code: 1 };
    const f = failing([limit, limit, { out: '', err: 'no stdin data received in 3s', code: 1 }, limit]);
    expect((await callClaude([{ role: 'user', content: 'hi' }], {}, f.run, f.wait)).content).toBe('fine');
    expect(f.waited).toEqual([CLAUDE_LIMIT_POLL_MS, CLAUDE_LIMIT_POLL_MS, CLAUDE_WAITS_MS[0], CLAUDE_LIMIT_POLL_MS]);
  });

  test('a limit that outlasts the longest wait fails like any other failure', async () => {
    const limit = { out: '', err: 'Claude AI usage limit reached', code: 1 };
    const always = failing(Array(100).fill(limit));
    await expect(callClaude([{ role: 'user', content: 'hi' }], {}, always.run, always.wait)).rejects.toThrow(
      'usage limit',
    );
    const total = always.waited.reduce((a, b) => a + b, 0);
    expect(total).toBe(CLAUDE_LIMIT_MAX_MS + CLAUDE_WAITS_MS.reduce((a, b) => a + b, 0));
  });

  test('when a limit resets is read from its message', () => {
    const now = new Date(2026, 8, 27, 14, 30);
    expect(limitResetIn('5-hour limit reached ∙ resets 3pm', now)).toBe(30 * 60_000);
    expect(limitResetIn('limit reached, resets at 9:15 am', now)).toBe((18 * 60 + 45) * 60_000);
    expect(limitResetIn('resets 14:00', now)).toBe((23 * 60 + 30) * 60_000);
    expect(limitResetIn(`usage limit reached|${Math.floor(now.getTime() / 1000) + 600}`, now)).toBe(600_000);
    expect(limitResetIn('usage limit reached', now)).toBeNull();
  });
});
