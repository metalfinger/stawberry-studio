import { describe, expect, test } from 'bun:test';
import { byCheck, takesUndrawn } from '../evals/live-flow';

describe('the live-flow check explains a moment sent without a picture a check left undrawn', () => {
  const frame = (status: 'ready' | 'failed', error?: string, refs: string[] = []) => ({
    status,
    error,
    frame: { plan: { refs: refs.map((id) => ({ id })) } },
  });

  test('an earlier picture left undrawn by the pre-draw check is named; one drawn, or failed otherwise, is not', () => {
    const frames = new Map([
      ['m5', frame('ready')],
      [
        'm6',
        frame(
          'failed',
          'not drawn: still unsure of its instructions after rewording (its instructions may contradict)',
        ),
      ],
      ['m7', frame('ready', undefined, ['m6', 'm5'])],
      ['m8', frame('failed', 'the 15-picture limit for one dream is reached')],
      ['m9', frame('failed', 'not drawn: the 15-picture limit')],
      ['m10', frame('ready', undefined, ['m8', 'm9', 'm5'])],
    ]);
    expect(takesUndrawn(frames, 'm7')).toEqual(['m6']);
    expect(takesUndrawn(frames, 'm10')).toEqual([]);
    expect(takesUndrawn(frames, 'm5')).toEqual([]);
    expect(takesUndrawn(frames, 'nothing')).toEqual([]);
  });

  test('its explanation counts as a check acting, like a brief set aside', () => {
    expect(byCheck('an earlier picture it takes (m6) was left undrawn by the pre-draw check')).toBe(true);
    expect(byCheck('drawn without its brief, set aside by the pre-draw check')).toBe(true);
    expect(byCheck('an earlier picture it takes was not drawn as a rebuild takes it')).toBe(false);
  });
});
