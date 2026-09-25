import { describe, expect, test } from 'bun:test';
import { decide, factQuestions, momentStage, STAGES, stageOf, STORYBOARD } from '../stages';

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

describe('where a dream is', () => {
  const prep = {
    previs: { m1: 'a.png', m2: 'b.png', m3: 'c.png' },
    storyboard: { m1: { ok: true }, m2: { ok: false } },
  };

  test('a moment is where its frame is, or where its planning got to', () => {
    expect(momentStage('m1', prep, undefined)).toBe('prompt');
    expect(momentStage('m2', prep, undefined)).toBe('previs');
    expect(momentStage('m3', prep, undefined)).toBe('previs');
    expect(momentStage('m4', prep, undefined)).toBe('plan');
    expect(momentStage('m1', prep, { status: 'drawing' })).toBe('image');
    expect(momentStage('m1', prep, { status: 'ready' })).toBe('review');
    // Held by the gate on its prompt, or by "storyboard complete?" on its shot.
    expect(momentStage('m1', prep, { status: 'waiting', held: ['the prompt says the car twice'] })).toBe('prompt');
    expect(momentStage('m2', prep, { status: 'waiting', held: ['storyboard: the camera faces away'] })).toBe('previs');
  });

  test('a conversation is at its phase, and while moments are drawn, at the one furthest behind', () => {
    expect(stageOf({ phase: 'listen' })).toBe('listen');
    expect(stageOf({ phase: 'retell' })).toBe('confirm');
    expect(stageOf({ phase: 'review', prep })).toBe('sheets');
    const frames = [
      { id: 'm1', kind: 'cut', status: 'ready' },
      { id: 'm2', kind: 'cut', status: 'waiting', held: ['storyboard: the camera faces away'] },
      { id: 'g1', kind: 'ghost', status: 'waiting' },
    ];
    expect(stageOf({ phase: 'frames', build: { frames }, prep })).toBe('previs');
    expect(stageOf({ phase: 'done', build: { frames }, prep })).toBe('review');
    expect(stageOf({ phase: 'kept' })).toBeNull();
    // Every stage says how it is left.
    for (const st of STAGES) expect(st.leftBy.length).toBeGreaterThan(10);
  });
});
