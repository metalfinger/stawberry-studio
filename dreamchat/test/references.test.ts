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
  storyChanges,
  waitedNotSent,
} from '../evals/prompt-cases';
import { mockupRoute, referencesOf, totalsOf } from '../evals/references';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import type { Session } from '../session';

/**
 * With the camera rules (DREAMCHAT_CAMERA) and S5's references (DREAMCHAT_REFS) off: these tests hold
 * today's choices, which those steps change on purpose (test/camera.test.ts and test/refs.test.ts hold them on).
 */
function cameraOff<T>(fn: () => T): T {
  const was = { camera: process.env.DREAMCHAT_CAMERA, refs: process.env.DREAMCHAT_REFS };
  delete process.env.DREAMCHAT_CAMERA;
  delete process.env.DREAMCHAT_REFS;
  try {
    return fn();
  } finally {
    if (was.camera !== undefined) process.env.DREAMCHAT_CAMERA = was.camera;
    if (was.refs !== undefined) process.env.DREAMCHAT_REFS = was.refs;
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

  test('cameras on two floor plans are never compared: two plans of one room do not share their bearings', () => {
    // m10 and m8 are the same room on two scenes' floor plans, their cameras 180 degrees apart by the
    // numbers alone: the words decide, and they call it the same side.
    const aeea = frozen('dream-0926-022102-aeea');
    const m10 = cameraOff(() => contextOf(aeea, 'm10'));
    expect(m10.refs.some((x) => x.source === 'picture' && x.of === 'm8' && x.role === 'composition')).toBe(true);
    expect(run(m10, 'none_from_other_side').pass).toBe(true);
  });

  test('the plan waits only for what it sends', () => {
    // Across the reverse, the picture before is kept for its light alone: waited for, never sent.
    const m2 = contextOf(snow, 'm2');
    expect(waitedNotSent(m2)).toEqual([{ id: 'm1', why: 'kept for its light alone (other_side)' }]);
    expect(run(m2, 'waits_only_on_sent').pass).toBe(false);
    expect(run(m2, 'waits_only_on_sent', { moment: 'm9' }).pass).toBe(true);
    expect(run(contextOf(snow, 'm1'), 'waits_only_on_sent').pass).toBe(true);
  });

  test("each in-between picture, against the owner's rule: kept where it takes a change off a moment that would otherwise carry two", () => {
    const needs = cameraOff(() => ghostNeeds(library3, 2));
    // The books are the water's start (the water is edited from them); the water is carried into m4 and
    // shown by nothing else there; the window opens in m7 itself, drawn in one edit of the mock-up.
    expect(needs.map((g) => [g.id, g.most, g.by, g.kept])).toEqual([
      ['g1', 2, 'g2', true],
      ['g2', 2, 'm4', true],
      ['g3', 0, null, false],
    ]);
  });

  test('changes are counted from the dream and the images sent, apart from the plan: the story, and a side only where nothing lays it out', () => {
    // With the mock-up sent, a side never drawn is no change; each change in force is shown by its in-between picture.
    const m7 = cameraOff(() => contextOf(library3, 'm7'));
    expect(m7.refs[0].source).toBe('mockup');
    expect(storyChanges(m7)).toEqual(['the action']);
    // The window's picture is edited from the water's, so it shows the water too; at m4, take the water's
    // picture away (the books' is its start and does not show it) and the water is carried in words.
    expect(storyChanges(m7, 'g2')).toEqual(['the action']);
    const m4 = cameraOff(() => contextOf(library3, 'm4'));
    expect(storyChanges(m4)).toEqual(['the action']);
    expect(storyChanges(m4, 'g2')).toEqual(['the action', "l1's water now up over the tops of the desks"]);
    // Without the mock-up and a view worked out on a floor plan, the side the moment faces is a change.
    const bare = { ...m7, cut: { ...m7.cut, view: undefined }, refs: m7.refs.filter((x) => x.source !== 'mockup') };
    expect(storyChanges(bare).some((x) => x.endsWith('never shown'))).toBe(true);
  });

  test('an in-between picture another is edited from serves that edit: without it, the next carries two changes', () => {
    // Tomas's age is drawn first and his school uniform edited from it: the age's picture is for that edit.
    const needs = cameraOff(() => ghostNeeds(orchard, 2));
    expect(needs.find((g) => g.id === 'g1')).toMatchObject({ most: 2, by: 'g2', kept: true });
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

  test('the routing the verdicts suggest for the mock-up (a hypothesis)', () => {
    expect(mockupRoute({ role: 'two_shot', move: 'other_side' })).toBe(true);
    expect(mockupRoute({ role: 'wide', move: 'reverse' })).toBe(true);
    expect(mockupRoute({ role: 'pov', move: 'seat' })).toBe(false);
    expect(mockupRoute({ role: 'pov', move: 'other_side', placeOnly: true })).toBe(true);
    expect(mockupRoute({ role: 'close_up', move: 'same_side' })).toBe(false);
    expect(mockupRoute({ role: 'single', move: 'jump' })).toBe(false);
    expect(mockupRoute({ role: 'single', move: 'other_place' })).toBe(false);
    expect(mockupRoute({ role: 'wide', move: 'other_place' })).toBe(true);
    expect(mockupRoute({ role: 'group', move: 'same_side', faceless: true })).toBe(false);
    expect(mockupRoute({ role: 'wide', move: 'first', faceless: true, establishing: true })).toBe(true);
    expect(mockupRoute({})).toBe(false);
  });
});
