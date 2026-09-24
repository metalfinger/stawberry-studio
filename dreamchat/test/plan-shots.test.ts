import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Breakdown } from '../producer';
import { applyPrep, planShots, type Session } from '../session';

const detail = (value: string | null = null) => ({ value, said: false });

// The kitchen of the zikery dream, with the dreamer in it: seen from outside, then through their
// own eyes, turned to the board on the wall.
function kitchen(): Breakdown {
  const b = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8')) as Breakdown;
  b.people = [
    {
      id: 'p1',
      name: 'you',
      is_dreamer: true,
      protagonist: true,
      fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
    },
  ];
  const [m1, m2] = b.scenes[0].moments;
  b.scenes[0].moments = [
    { ...m1, eyes: 'outside', visible: ['p1'], things: ['t1'] },
    { ...m2, eyes: 'dreamer', visible: [], things: ['t1'], looks_at: 'the departure board' },
  ];
  return b;
}

describe('the shots, planned while the chat goes on', () => {
  test('floor plans, cameras, previs and briefs, before anything is drawn', async () => {
    const b = kitchen();
    const briefs: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'plan-shots-'));
    const prep = await planShots(b, b.style_options[0], {
      block: async (x) => {
        const out = structuredClone(x);
        out.scenes[0].blocking = {
          front: 'the stove',
          indoors: true,
          spots: [
            { id: 'p1', x: 5, y: 5, kind: 'person', pose: 'standing' },
            { id: 't1', x: 1, y: 5, kind: 'thing', size: [0.1, 1.5, 1] },
          ],
        };
        return { breakdown: out, notes: [] };
      },
      shot: async (moment) => {
        briefs.push(moment);
        return 'A first-person view, turned left to the board on the wall.';
      },
      dir,
    });
    // Every camera is worked out, a previs and a brief each: seen from outside, and through the
    // dreamer's own eyes.
    expect(Object.keys(prep.previs).sort()).toEqual(['m1', 'm2']);
    expect(existsSync(prep.previs.m1) && existsSync(prep.previs.m2)).toBe(true);
    expect(briefs).toHaveLength(2);
    expect(prep.shots.m2.text).toBe('A first-person view, turned left to the board on the wall.');
    expect(prep.shots.m2.view).toContain('toward the departure board');
    // One person is named, never "them", and the picture says nobody else is in it.
    expect(prep.shots.m1.view).toStartWith('Seen from in front of the dreamer');
    expect(prep.shots.m1.view).toContain('Nobody else is in the picture.');
    expect(prep.blocking.s1.front).toBe('the stove');

    // Kept on the conversation for this dream, its floor plans with it; never for a dream since changed.
    const s: Pick<Session, 'draft' | 'prep'> = { draft: { status: 'ready', basedOn: 1, breakdown: b } };
    applyPrep(s, prep);
    expect(s.prep).toBe(prep);
    expect(s.draft?.breakdown?.scenes[0].blocking?.front).toBe('the stove');
    const changed: Pick<Session, 'draft' | 'prep'> = {
      draft: { status: 'ready', basedOn: 2, breakdown: { ...kitchen(), title: 'another dream' } },
    };
    applyPrep(changed, prep);
    expect(changed.prep).toBeUndefined();
    expect(changed.draft?.breakdown?.scenes[0].blocking).toBeUndefined();
  });
});
