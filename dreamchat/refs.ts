// The references a cut is drawn from (step S5, HARNESS_PLAN.md): which image is image 1, one image for
// each subject in view, no picture from another side of the place, the plan waiting only for what it
// sends, and an in-between picture only where an edit would carry several changes.
//
// - Image 1 by the cut's tags: the picture edited where the plan edits one (the same setup, a moment
//   later); else the grey mock-up made real, except where the verdicts found it hurt; else nothing before
//   the sketches. Where the mock-up goes (evals/paired-verdicts.json, n=20, beside the story pictures, all
//   drawn with it):
//   - not across a jump (lighthouse-first m8: the mock-up wrong, the sketches alone right);
//   - not a close-up or an insert (a held thing: the mock-up wrong or partly in 3 of 4);
//   - through the dreamer's eyes only where nothing but the place is in view (orchard m7: the mock-up
//     partly, the sketches alone wrong); with someone or something in view the sketches alone were right
//     and the mock-up wrong (orchard m2, snow-train m6, lighthouse-first m7);
//   - to another place only for a wide shot: the two paired moments against it were not wide (heron m4, a
//     crowd; lighthouse-first m7, a close-up), and the story pictures had wide shots right with it 8 of 11;
//   - not where the moment is about a crowd with no image of its own, but for a wide shot establishing the
//     place: made real shape by shape, the crowd came out as the mock-up's bare figures (heron m4, rules.md
//     C5); a crowd only in the background (night-market m2) or a wide establishing shot (night-market m1)
//     was right with it.
//   The routing is the paid check's to confirm.
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
 * What image 1 is chosen by: the cut's role, move and whether it establishes the place, and `faceless` (the
 * moment is about a crowd with no image of its own) and `placeOnly` (nothing but the place is in view).
 */
export type Route = Pick<CutTags, 'role' | 'move' | 'establishing'> & { faceless?: boolean; placeOnly?: boolean };

/** Whether the grey mock-up goes in as image 1, where no picture is edited (a hypothesis, n=20): see above. */
export function mockupHelps(t: Route): boolean {
  if (t.move === 'jump') return false;
  if (t.role === 'pov') return !!t.placeOnly;
  if (t.role === 'close_up' || t.role === 'insert' || t.move === 'seat') return false;
  if (t.move === 'other_place' && t.role !== 'wide') return false;
  if (t.faceless && !(t.role === 'wide' && t.establishing)) return false;
  return true;
}

/**
 * Whether the moment is about a crowd with no image of its own: a group the moment lists as its own people,
 * with no approved sketch (a person whose sketch failed is not a crowd).
 */
export const facelessIn = (s: Pick<CutSheet, 'inView' | 'visible'>) =>
  s.inView.some((e) => e.kind === 'character' && e.group && !e.image && e.turned === null && s.visible.includes(e.id));

/** Whether nothing but the place is in view. */
export const placeOnlyIn = (s: Pick<CutSheet, 'inView'>) => s.inView.every((e) => e.kind === 'location');

/** The route of a cut's sheet. */
export const routeOf = (s: Pick<CutSheet, 'inView' | 'visible' | 'tags'>): Route => ({
  role: s.tags.role,
  move: s.tags.move,
  establishing: s.tags.establishing,
  faceless: facelessIn(s),
  placeOnly: placeOnlyIn(s),
});

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
  const first = base ? 'edit' : s.camera.previs && mockupHelps(routeOf(s)) ? 'mockup' : 'free';
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
