import { describe, expect, test } from 'bun:test';
import { decide, factQuestions, STAGES, STORYBOARD } from '../stages';

const noul = (n: number) => ({ type: 'noul', noul: n });

describe('the storyboard transition', () => {
  test('asks each fact once per moment, its id made unique to the moment', () => {
    const q = factQuestions(STORYBOARD, 'm7');
    expect(Object.keys(q)).toEqual(['sb_all_in_m7', 'sb_contradicts_m7', 'sb_camera_m7', 'sb_extra_m7']);
    expect(STAGES.map((s) => s.id)).toContain(STORYBOARD.from);
    expect(STAGES.map((s) => s.id)).toContain(STORYBOARD.to);
  });

  test('clears a moment only when every fact passes its bar, and says why it holds one', () => {
    const good = {
      sb_all_in_m7: noul(0.9),
      sb_contradicts_m7: noul(0.1),
      sb_camera_m7: noul(0.8),
      sb_extra_m7: noul(0.2),
    };
    expect(decide(STORYBOARD, 'm7', good).ok).toBe(true);
    // The car left parked while they drive over the bridge: the shot contradicts the moment.
    const parked = { ...good, sb_contradicts_m7: noul(0.82) };
    const held = decide(STORYBOARD, 'm7', parked);
    expect(held.ok).toBe(false);
    expect(held.reasons).toEqual([
      'the shot disagrees with the moment about where someone or something is, what they are in or on, or how big (0.82)',
    ]);
    // No answer is never a pass: nothing is paid for on a guess.
    expect(decide(STORYBOARD, 'm7', null).ok).toBe(false);
    expect(decide(STORYBOARD, 'm7', { ...good, sb_camera_m7: noul(0.6) }).ok).toBe(true);
  });
});
