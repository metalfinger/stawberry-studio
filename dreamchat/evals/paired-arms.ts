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
// one line naming image 1 is written here. Pure: no model calls, no images, no network.
import { calledIn, pictureName, planContinuity, type Relation, sameWords, shotPlan } from '../continuity';
import { buildFrames, buildGhosts, type FrameReference, framePrompt, type PlannedInput, turnedInto } from '../frames';
import { previsImage } from '../previs';
import { type Breakdown, completeViews, type Moment, moments, type StyleOption } from '../producer';
import { reconcileGhosts, type Session } from '../session';
import { isGroup, type Item } from '../sheets';

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

/** The moment's shape as planContinuity reads it, with the defaults it gives an older breakdown. */
const asPlanned = (m: Moment) => ({ ...m, looks_at: m.looks_at ?? '', shift: m.shift ?? '' });

/**
 * How moment `m` follows the earlier moment `e`, as planContinuity decides it (its `relation`,
 * which it keeps to itself): a jump the dream made from the moment just before, another place
 * (or anything across a jump), the other side of the same place, or the same side, the same setup
 * when the distance and whose eyes are the same too.
 */
export function relationTo(b: Breakdown, mid: string, eid: string): Relation {
  const ms = moments(b).map(asPlanned);
  const mi = ms.findIndex((x) => x.id === mid);
  const ei = ms.findIndex((x) => x.id === eid);
  const m = ms[mi];
  const e = ms[ei];
  if (!m || !e) throw new Error(`no moment ${!m ? mid : eid}`);
  const sides = m.sameSide
    ? m.sameSide.includes(e.id)
    : e.place === m.place && (!e.looks_at || !m.looks_at || sameWords(e.looks_at, m.looks_at));
  const acrossJump = ms.some((k, at) => !!k.shift && ((ei < at && at <= mi) || (ei === at && at < mi)));
  if (m.shift && ei === mi - 1) return 'shift';
  if (acrossJump) return 'other_place';
  if (!m.place || e.place !== m.place) return 'other_place';
  if (!sides) return 'other_side';
  return e.distance === m.distance && e.eyes === m.eyes ? 'same_setup' : 'same_side';
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

/**
 * Whether the picture of `e` shows the place `m` happens in, as it is then: the same place, with no
 * jump of the dream after `e` up to `m`. (planContinuity also keeps apart a jump's own picture from
 * what follows it; its picture already shows the place as the jump left it.)
 */
export function placeKept(b: Breakdown, mid: string, eid: string): boolean {
  const ms = moments(b).map(asPlanned);
  const mi = ms.findIndex((x) => x.id === mid);
  const ei = ms.findIndex((x) => x.id === eid);
  return !!ms[mi]?.place && ms[ei]?.place === ms[mi].place && !ms.some((k, at) => !!k.shift && ei < at && at <= mi);
}

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

/** The one paragraph of a prompt that says what each attached image is for: its manifest. */
const MANIFEST = /^The attached images, in order, and the one thing to take from each:/;
const MOCKUP_PHRASE = ', as the mock-up in Image 1 shows it';
/** Said by framePrompt only beside an earlier moment; here in all three arms. */
const SHOWS_THROUGH = /^Nothing from another picture shows through this one/;
const LAST_LINE = /^One single picture filling the whole frame\./;

/**
 * A prompt's words about the moment: every paragraph but the manifest, and without the phrase that
 * points its shot at the mock-up. The three arms of a moment must agree on these exactly.
 */
export function wordsOf(prompt: string): string[] {
  return prompt
    .split('\n\n')
    .filter((para) => !MANIFEST.test(para))
    .map((para) => para.replace(MOCKUP_PHRASE, ''));
}

/** The manifest's lines, one per image, without their "Image n: " numbers. */
export const manifestOf = (prompt: string) =>
  (prompt.split('\n\n').find((x) => MANIFEST.test(x)) ?? '')
    .split('\n')
    .slice(1)
    .map((l) => l.replace(/^Image \d+: /, ''));

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

/** A prompt with a paragraph put in before its last line, unless it has it already. */
function withParagraph(prompt: string, para: string): string {
  const paras = prompt.split('\n\n');
  if (paras.includes(para)) return prompt;
  const at = paras.findIndex((x) => LAST_LINE.test(x));
  paras.splice(at >= 0 ? at : paras.length, 0, para);
  return paras.join('\n\n');
}

/** A prompt with the manifest line of one image replaced. */
function withManifestLine(prompt: string, index: number, line: string): string {
  return prompt
    .split('\n\n')
    .map((para) => {
      if (!MANIFEST.test(para)) return para;
      const rows = para.split('\n');
      rows[index + 1] = `Image ${index + 1}: ${line}`;
      return rows.join('\n');
    })
    .join('\n\n');
}

const listed = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''));

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

  // 1. mockup: today's routing without earlier moments: its previs as image 1.
  const mockup = framePrompt(it, p.sheets, p.style, ghosts, previs ? `previs:${mid}` : undefined);
  if (!previs) notes.push("today's plan has no camera for this moment, so no mock-up: the mockup arm has no image 1");

  // 2. free: no image 1.
  const free = framePrompt(it, p.sheets, p.style, ghosts);

  // 3. edit: the previous picture as image 1.
  const use = {
    id: prevId,
    kind: 'cut' as const,
    role: 'base' as const,
    relation,
    carries: 'the moment just before: edit it into this moment',
  };
  // Who a picture shows: through the dreamer's own eyes, never the dreamer.
  const dreamer = p.b.people.find((x) => x.is_dreamer)?.id;
  const shown = (f: NonNullable<Item['frame']>) => f.visible.filter((id) => !(f.eyes === 'dreamer' && id === dreamer));
  const prevFrame = prevItem.frame as NonNullable<Item['frame']>;
  // From another setup, the picture edited is known by who it shows, so a sketch is said to match
  // it ("as Image 1 already shows them") only for someone it shows: not the dreamer it was seen through.
  const edited =
    relation === 'same_setup' ? prevItem : { ...prevItem, frame: { ...prevFrame, visible: shown(prevFrame) } };
  const built = framePrompt(it, p.sheets, p.style, [{ use, item: edited }, ...ghosts]);
  let edit = built.prompt;
  const references = built.references.map((r, i) =>
    i === 0 && relation !== 'same_setup' ? { ...r, instruction: use.carries } : r,
  );
  if (relation !== 'same_setup') {
    // framePrompt names an edit base as "the same view a moment earlier", which only a same setup
    // is. Anything else is said here, in the same words where they fit: what stays, what changes.
    const sheetOf = (id: string) => p.sheets.find((s) => s.id === id);
    const named = (ids: string[]) =>
      listed(ids.map((id) => (id === dreamer ? 'the dreamer' : pictureName(sheetOf(id)?.name ?? id))));
    const are = (ids: string[]) =>
      ids.length > 1 || ids.some((id) => !!sheetOf(id) && isGroup(sheetOf(id) as Item)) ? 'are' : 'is';
    const before = shown(prevFrame);
    const now = shown(frame.frame);
    const intoEyes = frame.frame.eyes === 'dreamer' && !!dreamer && before.includes(dreamer);
    const leaving = before.filter((id) => !now.includes(id) && !(intoEyes && id === dreamer));
    const joining = now.filter((id) => !before.includes(id));
    // A crowd has no sketch: it is said in the words below.
    const sketched = joining.filter((id) => sheetOf(id)?.mediaId);
    const unsketched = joining.filter((id) => !sheetOf(id)?.mediaId);
    const who = [
      ...(intoEyes ? ['the dreamer in it is now the camera, so they are not in this picture'] : []),
      ...(leaving.length ? [`${named(leaving)} ${are(leaving)} no longer there`] : []),
      ...(sketched.length
        ? [
            `${named(sketched)} ${are(sketched)} there now, drawn from ${sketched.length > 1 ? 'their sketches' : 'their sketch'}`,
          ]
        : []),
      ...(unsketched.length ? [`${named(unsketched)} ${are(unsketched)} there now, as said below`] : []),
    ];
    const first = manifestOf(built.prompt)[0] ?? '';
    const strays = first.match(/ Leave out what it shows that is not in the dream: .*$/)?.[0] ?? '';
    const n = prevItem.frame?.order;
    const line = samePlace
      ? `EDIT THIS PICTURE. It is picture ${n}, the moment just before, in the same place. Keep the place, its light and how everyone in it looks, faces and clothes included; the camera and framing change to this picture's own, as said above${who.length ? `; ${who.join('; ')}` : ''}. Change only that and what this moment changes.${strays}`
      : `EDIT THIS PICTURE. It is picture ${n}, the moment just before, in another place. Keep how everyone in it who is also in this picture looks, faces and clothes included; the camera, framing, place and light change to this picture's own, as said above and as the place's own image below shows${who.length ? `; ${who.join('; ')}` : ''}. Change only that and what this moment changes.${strays}`;
    edit = withManifestLine(edit, 0, line);
    if (!samePlace) {
      // Its place's image is told where things stand in it as for no earlier picture: "where things
      // stand comes from Image 1" is not so of a picture of another place.
      const place = p.sheets.find((s) => s.id === m.place);
      const at = references.findIndex((r) => r.media_id === place?.mediaId);
      const freeAt = free.references.findIndex((r) => r.media_id === place?.mediaId);
      if (at >= 0 && freeAt >= 0) {
        edit = withManifestLine(edit, at, manifestOf(free.prompt)[freeAt]);
        references[at] = { ...references[at], instruction: free.references[freeAt].instruction };
      }
    }
  }
  // Without a worked-out view, framePrompt drops the framing sentence from an edit, since the
  // picture edited keeps its own; from another setup it is this moment's framing, and said as in
  // the other arms.
  const [firstFree] = free.prompt.split('\n\n');
  const [firstEdit, ...rest] = edit.split('\n\n');
  if (firstEdit !== firstFree && relation !== 'same_setup') edit = [firstFree, ...rest].join('\n\n');
  else if (firstEdit !== firstFree)
    notes.push(
      'edited from the same setup, the edit arm leaves out the framing sentence, as the harness does for an edit',
    );

  const turned = turnedInto(it);
  if (turned.size)
    notes.push(
      `${listed([...turned])} has turned into something else: no sketch of it goes in, in any arm; its in-between picture does, in every arm, where the run drew it`,
    );

  // framePrompt says this only beside an earlier moment, as in the edit arm: all three say it.
  const through = edit.split('\n\n').find((x) => SHOWS_THROUGH.test(x));
  if (!through) throw new Error(`${mid}: the edit arm does not say that nothing shows through from another picture`);

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
      mockup: arm('mockup', withParagraph(mockup.prompt, through), mockup.references),
      edit: arm('edit', edit, references),
      free: arm('free', withParagraph(free.prompt, through), free.references),
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
