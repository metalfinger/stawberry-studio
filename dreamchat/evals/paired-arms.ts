// Three ways to draw one moment of a saved dream, for evals/paired.ts, which differ only in their
// first image:
//
// - mockup: today's routing, without earlier moments: its previs (the grey floor-plan mock-up) as
//   image 1, where today's plan has a camera for the moment;
// - edit: the previous moment the run drew, the real picture, edited as image 1;
// - free: no image 1.
//
// After image 1, all three attach exactly the same images, in the same order and with the same
// lines in the manifest: the sketches of who and what is in view, then the in-between (ghost)
// pictures today's plan attaches for the moment. The earlier moments today's plan would also attach
// (for composition, light, or who someone is) go in no arm, so the mockup arm is today's routing
// without them.
//
// Every prompt is built by today's code: planContinuity, framePrompt and its helpers, the same calls
// plan.ts makes, so the words about the moment (what happens, who is where, how they look, the
// style) come out the same. "Nothing from another picture shows through this one", which
// framePrompt says only beside an earlier moment, is said in all three. They differ only in the
// manifest lines of their images, the line for image 1, and ", as the mock-up in Image 1 shows it".
// Where today's code has no words for an image set (an edit from a picture of another setup), the
// one line naming image 1 is written in takes.ts (waysOf), which builds the arms here and the
// harness's own takes of a moment alike. Pure: no model calls, no images, no network.
import { calledIn, planContinuity, type Relation, shotPlan } from '../continuity';
import { buildFrames, buildGhosts, type FrameReference, framePrompt, type PlannedInput } from '../frames';
import { previsImage } from '../previs';
import { type Breakdown, completeViews, moments, type StyleOption } from '../producer';
import { reconcileGhosts, type Session } from '../session';
import type { Item } from '../sheets';
import { listed, manifestOf, placeKept, relationTo, waysOf, wordsOf } from '../takes';

// Moved to takes.ts, where the harness draws a moment these ways too; kept here for older imports.
export { manifestOf, placeKept, relationTo, wordsOf };

export type Arm = 'mockup' | 'edit' | 'free';
export const ARMS: Arm[] = ['mockup', 'edit', 'free'];

/** fal's list price for one Nano Banana Pro picture at 2K, as the engine estimates it (backend/studio/providers.py). */
export const USD_PER_PICTURE = 0.15;

/** What a saved conversation gives the arms: the dream, its look, its sketches and pictures, and its prep. */
export type SavedDream = Pick<Session, 'draft' | 'style' | 'build' | 'prep'> & Partial<Pick<Session, 'id'>>;

/** An image an arm attaches, known by what it is: `sketch:p1`, `picture:m3`, `ghost:g1`, `previs:m5`. */
export type Sent = { key: string; role: FrameReference['role']; instruction: string };

export type ArmPrompt = { arm: Arm; prompt: string; images: Sent[] };

export type Paired = {
  moment: string;
  name: string;
  action: string;
  /** The previous moment the run drew, edited in the edit arm, and how this moment follows it. */
  prev: { id: string; relation: Relation; samePlace: boolean };
  /** The mockup arm's image 1, where today's plan has a camera for the moment: the render and its sha256. */
  previs?: { png: Uint8Array; key: string };
  /** Where the moment's shot brief came from: the run's own brief for this view, or none (the view's words). */
  brief: 'frame' | 'prep' | 'none';
  arms: Record<Arm, ArmPrompt>;
  /** What could not be made equal, or differs from how the harness would draw it. */
  notes: string[];
};

/** A dream made ready for the arms: its breakdown completed, today's plan, and every picture by key. */
export type Prepared = {
  saved: SavedDream;
  b: Breakdown;
  style: StyleOption;
  plan: ReturnType<typeof planContinuity>;
  /** The sketches, each as approved in the run, keyed `sketch:<id>`; none for one never drawn. */
  sheets: Item[];
  /** The moments and in-between pictures of today's plan, with the run's picture where it drew one. */
  pictures: Map<string, Item>;
};

const drawn = (x: { status?: string; mediaId?: string; mediaPath?: string } | undefined) =>
  !!x && x.status === 'ready' && (!!x.mediaId || !!x.mediaPath);

/**
 * Today's plan of a saved dream and its pictures, as plan.ts rebuilds them: the breakdown completed
 * (completeViews), the continuity plan made again, its in-between pictures matched to those the run
 * drew (reconcileGhosts, as a re-plan does), and every sketch and picture the run drew treated as
 * approved. Only what the run really drew has an image.
 */
export function prepare(saved: SavedDream): Prepared {
  const b = structuredClone(saved.draft?.breakdown);
  const style = saved.style;
  if (!b || !style) throw new Error(`${saved.id ?? 'this dream'} has no breakdown and chosen style`);
  completeViews(b);
  const frames = saved.build?.frames ?? [];
  const plan = reconcileGhosts(planContinuity(b), frames);
  const sheets: Item[] = (saved.build?.items ?? []).map((i) => ({
    ...i,
    ...(drawn(i) && !i.extras
      ? { mediaId: `sketch:${i.id}`, status: 'ready' as const, review: i.review ?? 'approved' }
      : {}),
    ...(!drawn(i) || i.extras ? { mediaId: undefined } : {}),
  }));
  const pictures = new Map<string, Item>();
  for (const p of [...buildFrames(b, plan), ...buildGhosts(plan)]) {
    const was = frames.find((f) => f.id === p.id && f.kind === p.kind);
    pictures.set(p.id, {
      ...p,
      // What the judge found invented in it travels with it, as the harness's own item does.
      ...(was?.check ? { check: was.check } : {}),
      ...(drawn(was)
        ? {
            status: 'ready' as const,
            mediaId: `${p.kind === 'ghost' ? 'ghost' : 'picture'}:${p.id}`,
            continuityApproved: true,
          }
        : {}),
    });
  }
  return { saved, b, style, plan, sheets, pictures };
}

/** The camera's move from the previous picture, in the set's words (paired-set.json `move`). */
export const MOVES: Record<Relation, string> = {
  same_setup: 'same setup',
  same_side: 'same side',
  other_side: 'other side',
  other_place: 'another place',
  shift: 'dream jump',
  seat: 'from their seat',
};

/** The latest moment before this one, in story order, that the run drew. */
export function previousDrawn(p: Prepared, mid: string): string | undefined {
  const ms = moments(p.b);
  const at = ms.findIndex((x) => x.id === mid);
  return ms
    .slice(0, Math.max(at, 0))
    .reverse()
    .find((x) => drawn(p.pictures.get(x.id)))?.id;
}

/**
 * A moment's previs as the harness renders it (session.ts layoutFor; the prep renders it the same
 * way): its scene's floor plan by then, through its camera, the dreamer left out of their own view,
 * everyone called as the moment calls them. None where today's plan has no camera for it.
 */
export function previsOf(p: Prepared, mid: string): { png: Uint8Array; key: string } | undefined {
  const cut = p.plan.cuts.find((c) => c.id === mid);
  const m = moments(p.b).find((x) => x.id === mid);
  const where = shotPlan(p.b, mid);
  if (!cut?.eye || !m || !where) return undefined;
  const dreamer = p.b.people.find((x) => x.is_dreamer)?.id;
  const png = previsImage(where, cut.eye, m.eyes === 'dreamer' && dreamer ? [dreamer] : [], calledIn(p.b, cut));
  return { png, key: new Bun.CryptoHasher('sha256').update(png).digest('hex') };
}

/** Whether an arm has an image 1 of its own: the picture it edits (the mock-up, or the picture before). */
const hasImage1 = (r: Paired, a: Arm) => r.arms[a].images[0]?.role === 'base';
/** The images an arm attaches after its image 1: every image, in an arm without one (free, or a mockup with no camera). */
export const afterImage1 = (r: Paired, a: Arm): Sent[] => r.arms[a].images.slice(hasImage1(r, a) ? 1 : 0);
/** Their manifest lines, likewise. */
export const linesAfterImage1 = (r: Paired, a: Arm): string[] =>
  manifestOf(r.arms[a].prompt).slice(hasImage1(r, a) ? 1 : 0);

/** Whether a moment's three prompts say the same about it, the manifest aside. */
export const wordsAgree = (r: Paired) =>
  ARMS.every((a) => JSON.stringify(wordsOf(r.arms[a].prompt)) === JSON.stringify(wordsOf(r.arms.mockup.prompt)));

/** Whether the three arms attach the same images, in the same order and for the same use, after image 1. */
export const othersAgree = (r: Paired) =>
  ARMS.every(
    (a) =>
      JSON.stringify(afterImage1(r, a).map((im) => [im.key, im.role])) ===
      JSON.stringify(afterImage1(r, 'free').map((im) => [im.key, im.role])),
  );

/** The three prompts for one moment of a prepared dream. */
export function pairedArms(p: Prepared, mid: string): Paired {
  const frame = p.pictures.get(mid);
  const cut = p.plan.cuts.find((c) => c.id === mid);
  const m = moments(p.b).find((x) => x.id === mid);
  if (!frame?.frame || !cut || !m) throw new Error(`${mid} is not a moment of ${p.b.title}`);
  const notes: string[] = [];
  const saved = (p.saved.build?.frames ?? []).find((f) => f.id === mid);

  // Its shot as the harness would brief it: the run's own brief where it was briefed from the view
  // today's plan has, else none, and the view's words stand (the harness would ask a model for one).
  const view = cut.view;
  const ready = p.saved.prep?.shots?.[mid];
  const brief = view && saved?.shot?.view === view ? 'frame' : view && ready?.view === view ? 'prep' : 'none';
  const it: Item = {
    ...frame,
    status: 'waiting',
    mediaId: undefined,
    ...(brief === 'frame' ? { shot: saved?.shot } : brief === 'prep' ? { shot: ready } : {}),
  };
  if (view && brief === 'none')
    notes.push(
      saved?.frame?.plan?.view === view
        ? "no shot brief: every arm says what the camera sees in the view's own words, as the run drew it"
        : "no shot brief for the view today plans: every arm says what the camera sees in the view's own words (the harness would ask for a brief first)",
    );

  const prevId = previousDrawn(p, mid);
  if (!prevId) throw new Error(`${mid} has no earlier moment the run drew, to edit`);
  const prevItem = p.pictures.get(prevId) as Item;
  const relation = relationTo(p.b, mid, prevId);
  const samePlace = placeKept(p.b, mid, prevId);

  // What every arm attaches after its image 1, besides the sketches: the in-between pictures today's
  // plan attaches for the moment, in its order, as the harness finds them drawn. The earlier moments
  // today's routing would also attach go in no arm, so that the arms differ only in image 1.
  const planned: PlannedInput[] = cut.refs
    .map((use) => ({ use, item: p.pictures.get(use.id) }))
    .filter((x): x is PlannedInput => !!x.item && x.item.status === 'ready' && !!x.item.mediaId);
  const ghosts = planned.filter((x) => x.use.kind === 'ghost');
  const undrawn = cut.refs.filter((r) => r.kind === 'ghost' && !ghosts.some((x) => x.use.id === r.id)).map((r) => r.id);
  if (undrawn.length)
    notes.push(
      `today's plan also names in-between ${undrawn.length > 1 ? 'pictures' : 'picture'} ${listed(undrawn)}, which the run never drew: left out of every arm, as the harness leaves out a picture that failed`,
    );
  const previs = previsOf(p, mid);
  const base = planned.find((x) => x.use.role === 'base');
  const today = framePrompt(it, p.sheets, p.style, planned, previs && !base ? `previs:${mid}` : undefined);
  const dropped = today.references.filter((r) => r.media_id.startsWith('picture:'));
  if (dropped.length)
    notes.push(
      `today's routing would also attach ${listed(dropped.map((r) => `${r.media_id.slice('picture:'.length)} (${r.role === 'base' ? 'edited, in place of the mock-up' : r.role})`))}, ${dropped.length > 1 ? 'earlier moments' : 'an earlier moment'}: left out of every arm, so the three differ only in image 1`,
    );

  // The three arms, as the harness builds its takes (takes.ts): they differ only in image 1.
  const ways = waysOf({
    it,
    b: p.b,
    sheets: p.sheets,
    style: p.style,
    ghosts,
    previs: previs ? `previs:${mid}` : undefined,
    prev: { item: prevItem, relation, samePlace },
  });
  notes.push(...ways.notes);
  // framePrompt says this only beside an earlier moment, as in the edit arm: all three say it.
  if (!ways.edit || !ways.through)
    throw new Error(`${mid}: the edit arm does not say that nothing shows through from another picture`);

  const arm = (a: Arm, prompt: string, refs: FrameReference[]): ArmPrompt => ({
    arm: a,
    prompt,
    images: refs.map((r) => ({ key: r.media_id, role: r.role, instruction: r.instruction })),
  });
  return {
    moment: mid,
    name: frame.name,
    action: frame.fields.action?.value ?? '',
    prev: { id: prevId, relation, samePlace },
    ...(previs ? { previs } : {}),
    brief,
    arms: {
      mockup: arm('mockup', ways.mockup.prompt, ways.mockup.references),
      edit: arm('edit', ways.edit.prompt, ways.edit.references),
      free: arm('free', ways.free.prompt, ways.free.references),
    },
    notes,
  };
}

/**
 * The six orders the three arms can be shown in. The moments of the set take them in turn, in set
 * order, so each arm is shown first, second and third equally often over every six moments; the
 * first two share no place, so over the 20 moments (three turns and two) each arm is shown in each
 * place 6 or 7 times.
 */
export const ORDERS: Arm[][] = [
  ['mockup', 'edit', 'free'],
  ['edit', 'free', 'mockup'],
  ['free', 'mockup', 'edit'],
  ['mockup', 'free', 'edit'],
  ['free', 'edit', 'mockup'],
  ['edit', 'mockup', 'free'],
];

/** The order the arms of the set's `i`-th moment (from 0, in set order) are shown in. */
export const orderAt = (i: number): Arm[] => ORDERS[i % ORDERS.length];

/** How often each arm is shown first, second and third over the set's first `n` moments. */
export function placeCounts(n: number): Record<Arm, [number, number, number]> {
  const counts = Object.fromEntries(ARMS.map((a) => [a, [0, 0, 0]])) as Record<Arm, [number, number, number]>;
  for (let i = 0; i < n; i++) orderAt(i).forEach((a, at) => counts[a][at]++);
  return counts;
}

/** One moment's pictures for the judging page: its drawn arms, each a picture file. */
export type ToJudge = {
  id: string;
  moment: string;
  title: string;
  told: string[];
  action: string;
  drawn: Partial<Record<Arm, string>>;
};

/**
 * The judging page's data for the pictures drawn (its `data-first62.json` format): one "run" per
 * moment, given in set order, its pictures in the order its place in the set gives it (orderAt) as
 * `<id>-a`, `-b`, `-c`, nothing on the page saying which way each was drawn; the key says it, and
 * each picture is copied to the page's `img/paired/`.
 */
export function judgeSet(
  moments: ToJudge[],
  title: string,
): {
  data: { set: 'paired'; title: string; runs: { run: string; title: string; told: string[]; moments: object[] }[] };
  key: Record<string, Arm>;
  copies: { from: string; to: string }[];
} {
  const key: Record<string, Arm> = {};
  const copies: { from: string; to: string }[] = [];
  const runs = moments
    .map((m, at) => ({
      run: m.id,
      title: m.title,
      told: m.told,
      moments: orderAt(at)
        .filter((a) => m.drawn[a])
        .map((a, i) => {
          const id = `${m.id}-${'abc'[i]}`;
          const img = `img/paired/${id}.jpg`;
          key[id] = a;
          copies.push({ from: m.drawn[a] as string, to: img });
          return { id, moment: m.moment, action: m.action, img };
        }),
    }))
    .filter((r) => r.moments.length);
  return { data: { set: 'paired', title, runs }, key, copies };
}

/**
 * The file an image key stands for in the run's own store (`media`, its media folder): a sketch's
 * or a picture's take. A previs has none: it is rendered.
 */
export function fileOf(saved: SavedDream, key: string, media: string): string | undefined {
  const [kind, id] = key.split(':');
  const from =
    kind === 'sketch'
      ? saved.build?.items.find((i) => i.id === id)
      : kind === 'picture' || kind === 'ghost'
        ? saved.build?.frames?.find((f) => f.id === id)
        : undefined;
  return from?.mediaPath ? `${media}/${from.mediaPath}` : undefined;
}

/**
 * What the dreamer told before they were offered pictures: their messages up to the one that
 * settled the retelling, as the judging page shows them. Turn k answers their k-th message; the
 * first turn that offers to draw it closes what they told.
 */
export function toldOf(s: Pick<Session, 'transcript' | 'turns'>): string[] {
  const said = s.transcript.filter((e) => e.role === 'user').map((e) => e.content);
  const offer = s.turns.find((t) => t.phase === 'offer')?.turn;
  return offer === undefined ? said : said.slice(0, offer);
}
