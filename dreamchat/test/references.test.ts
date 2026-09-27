// The checks on the references a moment is drawn from (step S5's eval, before S5 is built): image 1,
// one image per subject and its stage in force, pictures from another side, what the plan waits for
// and never sends, and whether each in-between picture meets the owner's rule. On frozen dreams, as
// today's code chooses; each holds with the story record off and on.
import { describe, expect, test } from 'bun:test';
import {
  CHECKS,
  contextOf,
  type Ctx,
  firstImageOf,
  ghostNeeds,
  runCheck,
  stageImageOf,
  waitedNotSent,
} from '../evals/prompt-cases';
import { mockupRoute, referencesOf, totalsOf } from '../evals/references';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import type { Session } from '../session';

/**
 * With the camera rules off (DREAMCHAT_CAMERA): these tests hold today's choices, which the rules change
 * on purpose (test/camera.test.ts holds them on).
 */
function cameraOff<T>(fn: () => T): T {
  const was = process.env.DREAMCHAT_CAMERA;
  delete process.env.DREAMCHAT_CAMERA;
  try {
    return fn();
  } finally {
    if (was !== undefined) process.env.DREAMCHAT_CAMERA = was;
  }
}
const frozen = (id: string) => cameraOff(() => rebuild(loadDream(id, false).session as Session));
const run = (c: Ctx, name: keyof typeof CHECKS, args: Record<string, unknown> = {}) =>
  runCheck(c, { kind: 'code', check: name, args, says: '' });

describe('the references chosen', () => {
  const orchard = frozen('dream-0926-070314-0f40');
  const snow = frozen('dream-0926-043003-b0cb');
  const first = frozen('dream-0925-231131-affd');
  const heron = frozen('dream-0926-012307-4c79');
  const library3 = frozen('dream-0926-055141-6e80');
  const library2 = frozen('dream-0926-052843-6081');

  test('image 1, by the ways of the paired test', () => {
    const m2 = contextOf(orchard, 'm2');
    expect(firstImageOf(m2.refs)).toBe('mockup');
    expect(run(m2, 'first_image', { not: ['mockup'] }).pass).toBe(false);
    expect(run(m2, 'first_image', { is: ['mockup', 'edit'] }).pass).toBe(true);
    // The library's m6 edits the picture before, of the same setup.
    expect(run(contextOf(library2, 'm6'), 'first_image', { is: ['edit'] }).detail).toBe('image 1: edit (picture m5)');
    expect(firstImageOf([])).toBe('free');
  });

  test('one image per subject, and it is the stage in force: the latest in-between picture, else the sketch', () => {
    // Tomas as a boy: his sketch, and his age and his school uniform, each drawn on him in turn.
    const m2 = contextOf(orchard, 'm2');
    expect(stageImageOf(m2, 'p2')).toEqual({ source: 'ghost', of: 'g2' });
    expect(run(m2, 'stage_image', { who: 'p2' }).detail).toContain('images 2 (sketch p2), 4 (ghost g1), 5 (ghost g2)');
    expect(run(m2, 'stage_image', { who: 'p2' }).pass).toBe(false);
    expect(run(m2, 'stage_image', { who: 'l1' }).pass).toBe(true);
    // The faceless students have no sketch: the picture they were last drawn in is theirs.
    const m3 = contextOf(heron, 'm3');
    expect(stageImageOf(m3, 'p2')).toEqual({ source: 'picture' });
    expect(run(m3, 'stage_image', { who: 'p2' }).pass).toBe(true);
  });

  test('no picture from another side is edited or taken for its layout: by the words, or turned round by the cameras', () => {
    // The spiral stairs through the dreamer's eyes take picture 1's layout, called the same side by the
    // words, with the camera turned right round.
    const m3 = cameraOff(() => contextOf(first, 'm3'));
    expect(run(m3, 'none_from_other_side').detail).toMatch(/picture m1 as composition \(same_side, turned 180°\)/);
    expect(run(m3, 'none_from_other_side', { roles: ['base'] }).pass).toBe(true);
    expect(run(m3, 'none_from_other_side', { degrees: 181 }).pass).toBe(true);
    expect(
      run(
        cameraOff(() => contextOf(snow, 'm2')),
        'none_from_other_side',
      ).pass,
    ).toBe(true);
  });

  test('the plan waits only for what it sends', () => {
    // Across the reverse, the picture before is kept for its light alone: waited for, never sent.
    const m2 = contextOf(snow, 'm2');
    expect(waitedNotSent(m2)).toEqual([{ id: 'm1', why: 'kept for its light alone (other_side)' }]);
    expect(run(m2, 'waits_only_on_sent').pass).toBe(false);
    expect(run(m2, 'waits_only_on_sent', { moment: 'm9' }).pass).toBe(true);
    expect(run(contextOf(snow, 'm1'), 'waits_only_on_sent').pass).toBe(true);
  });

  test("each in-between picture, against the owner's rule: kept where a moment it serves would carry several changes without it", () => {
    const needs = cameraOff(() => ghostNeeds(library3));
    // The books and the water are each drawn for a moment that would change three things at once.
    expect(needs.filter((g) => g.kept).map((g) => g.id)).toEqual(['g1', 'g2']);
    const window = needs.find((g) => g.id === 'g3')!;
    expect([window.most, window.by, window.kept]).toEqual([2, 'm7', false]);
    expect(cameraOff(() => ghostNeeds(library3, 2)).every((g) => g.kept)).toBe(true);
  });

  test('over a whole dream: counted moment by moment, and totalled', () => {
    const got = referencesOf(snow);
    expect(got.moments.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
    expect(got.moments.find((m) => m.id === 'm2')?.waited).toEqual([
      { id: 'm1', why: 'kept for its light alone (other_side)' },
    ]);
    const t = totalsOf({ snow: { ...got } });
    expect([t.moments, t.waited.moments, t.waited.pictures, t.lightOnly, t.otherSide.moments]).toEqual([6, 3, 3, 0, 0]);
    expect(t.first['no sheet'] ?? t.first.two_shot).toBeDefined();
  });

  test('the routing the paired test suggests for the mock-up (a hypothesis)', () => {
    expect(mockupRoute({ role: 'two_shot', move: 'other_side' })).toBe(true);
    expect(mockupRoute({ role: 'wide', move: 'reverse' })).toBe(true);
    expect(mockupRoute({ role: 'pov', move: 'seat' })).toBe(false);
    expect(mockupRoute({ role: 'close_up', move: 'same_side' })).toBe(false);
    expect(mockupRoute({ role: 'single', move: 'jump' })).toBe(false);
    expect(mockupRoute({ role: 'wide', move: 'other_place' })).toBe(false);
    expect(mockupRoute({})).toBe(false);
  });
});
