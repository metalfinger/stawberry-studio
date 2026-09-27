// The references a cut is drawn from (step S5, HARNESS_PLAN.md): which image is image 1, one image for
// each subject in view, no picture from another side of the place, the plan waiting only for what it
// sends, and an in-between picture only where an edit would carry several changes.
//
// - Image 1 by the cut's tags: the picture edited where the plan edits one (the same setup, a moment
//   later); else the grey mock-up made real, only where the paired test found it helps (from outside, not
//   a close-up or an insert, not across a jump, to another place or to the dreamer's seat, and not where
//   the moment is about a crowd with no image of its own: made real shape by shape, it came out as the
//   mock-up's bare figures, heron m4, rules.md C5; a crowd only in the background, night-market m2, did
//   not); else nothing before the sketches. The paired test (evals/paired-verdicts.json, n=20) had the mock-up right 8 of 10
//   on that routing and 2 of 10 off it, 1 of 6 through the dreamer's eyes; the story pictures, all drawn
//   with it, disagree (7 of 11 through the dreamer's eyes), so the routing is the paid check's to confirm.
// - One image per subject (rules.md D1): each one in view is shown by the image of its stage in force,
//   the in-between picture of its latest change where one is drawn and approved, else its sketch. An
//   earlier picture comes in only for someone with no sketch (a crowd), as the jump's composition, or for
//   the dreamer's seat with no view worked out; never for its light alone (D2).
// - Never a picture from another side: an earlier picture whose camera is turned round from this one (a
//   reverse, 135 degrees or more) is neither edited nor taken for where things stand (A2, C7).
// - The plan waits only for what it sends (continuity.ts): what the cut is not drawn from is not among
//   its references, so the moment is never held back for it.
// - An in-between picture only where an edit carries several changes (D3): the owner's bar is two (27
//   Sep), so one no moment it is drawn for would carry two changes or more without is not drawn.
//
// Behind DREAMCHAT_REFS, which needs DREAMCHAT_CUT_SHEET=on (the sheet is what it chooses from): off (the
// default) is today's choice byte for byte. `on` is all of the above; `sketch` is all of it but one image
// per subject: a sketch stays beside its in-between pictures, as the 14 pictures the owner called right
// were drawn, so the paid check can draw both (one image per subject is a hypothesis until it does).
import type { CutSheet, CutTags, SheetEarlier } from './cutsheet';
import type { Item } from './sheets';

let warned = false;

/** Whether S5's choice of references is on: `on`, `sketch` (all but one image per subject), or off. */
export function refsMode(): 'off' | 'on' | 'sketch' {
  const v = (process.env.DREAMCHAT_REFS ?? '').trim().toLowerCase();
  if (v !== 'on' && v !== 'sketch') return 'off';
  if ((process.env.DREAMCHAT_CUT_SHEET ?? '').trim().toLowerCase() === 'on') return v;
  if (!warned) {
    warned = true;
    console.warn('DREAMCHAT_REFS needs DREAMCHAT_CUT_SHEET=on: the references stay as they are');
  }
  return 'off';
}

/**
 * How many changes one edit may carry before its in-between pictures are drawn first: "several" is two
 * or more (the owner, 27 Sep). An edit carrying the action and one more change is drawn straight.
 */
export const SEVERAL = 2;

/**
 * Where the paired test found the grey mock-up helps as image 1 (a hypothesis, n=20): see above. `faceless`:
 * the moment is about someone with no image of their own (a crowd it lists among its own people).
 */
export const mockupHelps = (t: Pick<CutTags, 'role' | 'move'>, faceless = false) =>
  !['pov', 'close_up', 'insert'].includes(t.role) && !['jump', 'other_place', 'seat'].includes(t.move) && !faceless;

/** Whether the moment is about someone in view with no image of their own: a crowd it lists as its own. */
export const facelessIn = (s: Pick<CutSheet, 'inView' | 'visible'>) =>
  s.inView.some((e) => e.kind === 'character' && !e.image && e.turned === null && s.visible.includes(e.id));

/** What a cut is drawn from, chosen from its sheet: kept on the sheet with DREAMCHAT_REFS on. */
export type RefsLayer = {
  /** Image 1: the picture edited, the mock-up made real, or neither (the sketches come first). */
  first: 'edit' | 'mockup' | 'free';
  /**
   * By who or what is in view, the in-between picture that is its one image (its stage in force), where
   * one is drawn; everyone else is shown by their sketch. Empty with DREAMCHAT_REFS=sketch.
   */
  stage: Record<string, string>;
  /** Who or what has more than one in-between picture in force, none drawn from the others: no single image holds it. */
  several: string[];
};

/** The in-between pictures a sheet is drawn from that show `id`, by how it looks. */
const ghostsOf = (earlier: SheetEarlier[], id: string) =>
  earlier.filter((x) => x.kind === 'ghost' && x.ghost?.of === id);

/**
 * The references of one cut, from its sheet alone: image 1 by its tags, and each one in view by the image
 * of its stage in force. The earlier pictures are the plan's (continuity.ts leaves out what a cut is not
 * drawn from); a picture of someone who has an image of their own here is still left out when attached.
 */
export function chooseRefs(
  s: Pick<CutSheet, 'earlier' | 'inView' | 'tags' | 'visible'> & { camera: Pick<CutSheet['camera'], 'previs'> },
  mode: 'on' | 'sketch' = 'on',
): RefsLayer {
  const base = s.earlier.some((x) => x.role === 'base');
  const first = base ? 'edit' : s.camera.previs && mockupHelps(s.tags, facelessIn(s)) ? 'mockup' : 'free';
  const stage: Record<string, string> = {};
  const several: string[] = [];
  for (const e of s.inView) {
    const gs = ghostsOf(s.earlier, e.id);
    if (gs.length > 1) several.push(e.id);
    // What has turned into something else is drawn from its in-between picture already, never its sketch.
    if (mode !== 'on' || gs.length !== 1 || e.turned !== null) continue;
    stage[e.id] = gs[0].id;
  }
  return { first, stage, several };
}

/**
 * For the check that everyone in view brings their image (gate.ts checkReferences): with one image per
 * subject, an in-between picture of them stands for their sketch. None with the references off or `sketch`.
 */
export function standsFor(frames: Pick<Item, 'kind' | 'ghost' | 'mediaId'>[], who: string): { or?: string[] } {
  if (refsMode() !== 'on') return {};
  const or = frames.flatMap((f) => (f.kind === 'ghost' && f.ghost?.of === who && f.mediaId ? [f.mediaId] : []));
  return or.length ? { or } : {};
}
