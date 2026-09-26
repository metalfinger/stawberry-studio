// Each moment drawn more than once, in different ways, and the judge keeps the best
// (DREAMCHAT_TAKES, 1 by default: one take, exactly as before).
//
// Twenty moments drawn three ways that differ only in their first image (evals/paired-verdicts.json,
// 26 Sep): "mockup" (today's routing, the floor-plan mock-up as image 1), "edit" (the previous drawn
// picture as image 1) and "free" (sketches and words only). One draw was right about half the time
// (edit 11, mockup 10, free 9 of 20), but in 18 of 20 moments at least one of the three was right,
// and the picture judge, shown the picture before and the three versions, kept a right one in 16.
// So with DREAMCHAT_TAKES=2 or 3 a moment is drawn that many ways at once and the judge keeps one:
//
// - take 1: today's routing, its images exactly as today;
// - take 2: edited from the previous drawn moment, where there is one approved to draw from and this
//   is not the first moment; otherwise its sketches and words only;
// - take 3: its sketches and words only.
//
// Every take says the same about the moment; only the images differ, as in the measured test. The
// ways are built by the same code that built that test's arms (evals/paired-arms.ts calls waysOf),
// from today's framePrompt. Pure: no model calls, no images, no network.
import { pictureName, type Relation, sameWords } from './continuity';
import { type FrameReference, framePrompt, type PlannedInput, turnedInto } from './frames';
import { type Breakdown, type Moment, moments, type StyleOption } from './producer';
import { isGroup, type Item, type Take } from './sheets';

/** How many ways each moment is drawn: 1 (today), 2 or 3. */
export const TAKES = Math.min(3, Math.max(1, Math.floor(Number(process.env.DREAMCHAT_TAKES ?? 1)) || 1));

export type Built = { prompt: string; references: FrameReference[] };

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

/** The one paragraph of a prompt that says what each attached image is for: its manifest. */
const MANIFEST = /^The attached images, in order, and the one thing to take from each:/;
const MOCKUP_PHRASE = ', as the mock-up in Image 1 shows it';
/** Said by framePrompt only beside an earlier moment; here in every way. */
const SHOWS_THROUGH = /^Nothing from another picture shows through this one/;
const LAST_LINE = /^One single picture filling the whole frame\./;

/**
 * A prompt's words about the moment: every paragraph but the manifest, and without the phrase that
 * points its shot at the mock-up. The ways of a moment must agree on these exactly.
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

/** A prompt with a paragraph put in before its last line, unless it has it already. */
export function withParagraph(prompt: string, para: string): string {
  const paras = prompt.split('\n\n');
  if (paras.includes(para)) return prompt;
  const at = paras.findIndex((x) => LAST_LINE.test(x));
  paras.splice(at >= 0 ? at : paras.length, 0, para);
  return paras.join('\n\n');
}

/** The paragraph that says nothing from another picture shows through, where a prompt has it. */
export const showsThrough = (prompt: string) => prompt.split('\n\n').find((x) => SHOWS_THROUGH.test(x));

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

export const listed = (xs: string[]) =>
  xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? '');

/**
 * The three ways to draw one moment, which differ only in their first image: the mock-up (its
 * previs), the previous drawn picture edited, or none. After image 1 each attaches exactly the same
 * images, in the same order and with the same manifest lines: the sketches of who and what is in
 * view, then `ghosts`, the in-between pictures today's plan attaches for it. "Nothing from another
 * picture shows through this one", which framePrompt says only beside an earlier moment, is said in
 * all three wherever the edit says it. No edit way without a previous picture.
 */
export function waysOf(x: {
  /** The moment as it is to be drawn: its words and its shot. */
  it: Item;
  b: Breakdown;
  sheets: Item[];
  style: StyleOption;
  ghosts: PlannedInput[];
  /** The mock-up's image, where today's plan has a camera for the moment. */
  previs?: string;
  /** The previous drawn moment, approved to draw from, and how this moment follows it. */
  prev?: { item: Item; relation: Relation; samePlace: boolean };
}): { mockup: Built; free: Built; edit?: Built; through?: string; notes: string[] } {
  const { it, b, sheets, style, ghosts, previs, prev } = x;
  const frame = it.frame;
  const m = moments(b).find((y) => y.id === it.id);
  if (!frame || !m) throw new Error(`${it.id} is not a moment of ${b.title}`);
  const notes: string[] = [];

  // 1. mockup: today's routing without earlier moments: its previs as image 1.
  const mockup = framePrompt(it, sheets, style, ghosts, previs);
  if (!previs) notes.push("today's plan has no camera for this moment, so no mock-up: the mockup arm has no image 1");

  // 2. free: no image 1.
  const free = framePrompt(it, sheets, style, ghosts);

  // 3. edit: the previous picture as image 1.
  let edit: Built | undefined;
  if (prev) {
    const { item: prevItem, relation, samePlace } = prev;
    const use = {
      id: prevItem.id,
      kind: 'cut' as const,
      role: 'base' as const,
      relation,
      carries: 'the moment just before: edit it into this moment',
    };
    // Who a picture shows: through the dreamer's own eyes, never the dreamer.
    const dreamer = b.people.find((p) => p.is_dreamer)?.id;
    const shown = (f: NonNullable<Item['frame']>) =>
      f.visible.filter((id) => !(f.eyes === 'dreamer' && id === dreamer));
    const prevFrame = prevItem.frame as NonNullable<Item['frame']>;
    // From another setup, the picture edited is known by who it shows, so a sketch is said to match
    // it ("as Image 1 already shows them") only for someone it shows: not the dreamer it was seen through.
    const edited =
      relation === 'same_setup' ? prevItem : { ...prevItem, frame: { ...prevFrame, visible: shown(prevFrame) } };
    const built = framePrompt(it, sheets, style, [{ use, item: edited }, ...ghosts]);
    let prompt = built.prompt;
    const references = built.references.map((r, i) =>
      i === 0 && relation !== 'same_setup' ? { ...r, instruction: use.carries } : r,
    );
    if (relation !== 'same_setup') {
      // framePrompt names an edit base as "the same view a moment earlier", which only a same setup
      // is. Anything else is said here, in the same words where they fit: what stays, what changes.
      const sheetOf = (id: string) => sheets.find((s) => s.id === id);
      const named = (ids: string[]) =>
        listed(ids.map((id) => (id === dreamer ? 'the dreamer' : pictureName(sheetOf(id)?.name ?? id))));
      const are = (ids: string[]) =>
        ids.length > 1 || ids.some((id) => !!sheetOf(id) && isGroup(sheetOf(id) as Item)) ? 'are' : 'is';
      const before = shown(prevFrame);
      const now = shown(frame);
      const intoEyes = frame.eyes === 'dreamer' && !!dreamer && before.includes(dreamer);
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
      prompt = withManifestLine(prompt, 0, line);
      if (!samePlace) {
        // Its place's image is told where things stand in it as for no earlier picture: "where things
        // stand comes from Image 1" is not so of a picture of another place.
        const place = sheets.find((s) => s.id === m.place);
        const at = references.findIndex((r) => r.media_id === place?.mediaId);
        const freeAt = free.references.findIndex((r) => r.media_id === place?.mediaId);
        if (at >= 0 && freeAt >= 0) {
          prompt = withManifestLine(prompt, at, manifestOf(free.prompt)[freeAt]);
          references[at] = { ...references[at], instruction: free.references[freeAt].instruction };
        }
      }
    }
    // Without a worked-out view, framePrompt drops the framing sentence from an edit, since the
    // picture edited keeps its own; from another setup it is this moment's framing, and said as in
    // the other arms.
    const [firstFree] = free.prompt.split('\n\n');
    const [firstEdit, ...rest] = prompt.split('\n\n');
    if (firstEdit !== firstFree && relation !== 'same_setup') prompt = [firstFree, ...rest].join('\n\n');
    else if (firstEdit !== firstFree)
      notes.push(
        'edited from the same setup, the edit arm leaves out the framing sentence, as the harness does for an edit',
      );
    edit = { prompt, references };
  }

  const turned = turnedInto(it);
  if (turned.size)
    notes.push(
      `${listed([...turned])} has turned into something else: no sketch of it goes in, in any arm; its in-between picture does, in every arm, where the run drew it`,
    );

  // framePrompt says this only beside an earlier moment, as in the edit arm: all three say it.
  const through = edit ? showsThrough(edit.prompt) : undefined;
  const said = (w: Built): Built => (through ? { ...w, prompt: withParagraph(w.prompt, through) } : w);
  return { mockup: said(mockup), free: said(free), ...(edit ? { edit } : {}), through, notes };
}

/** One take to draw: its way, its words and its images. */
export type TakePlan = { way: Take['way']; prompt: string; references: FrameReference[] };

/**
 * The takes of one moment, `n` of them (1 to 3): take 1 today's routing, exactly today's images;
 * take 2 edited from `prev`, the previous drawn moment, where there is one, else its sketches and
 * words only; take 3 its sketches and words only. The words are the same in every take: take 1 is
 * today's prompt, with only "nothing from another picture shows through" added where another take
 * says it and it did not, as the measured test's mock-up arm had it (26 Sep).
 */
export function takesOf(x: {
  /** Today's prompt and images for the moment, as the harness built them. */
  today: Built;
  it: Item;
  b: Breakdown;
  sheets: Item[];
  style: StyleOption;
  /** The earlier pictures today's plan draws it from: its in-between pictures go in every take. */
  inputs: PlannedInput[];
  /** Its previs, where today's plan has a camera for it. */
  layout?: string;
  prev?: Item;
  n: number;
}): TakePlan[] {
  const { today, it, b, sheets, style, inputs, layout, prev, n } = x;
  const ghosts = inputs.filter((y) => y.use.kind === 'ghost');
  const ways = waysOf({
    it,
    b,
    sheets,
    style,
    ghosts,
    previs: layout,
    prev: prev
      ? { item: prev, relation: relationTo(b, it.id, prev.id), samePlace: placeKept(b, it.id, prev.id) }
      : undefined,
  });
  const through = ways.through ?? showsThrough(today.prompt);
  const said = (w: Built): Built => (through ? { ...w, prompt: withParagraph(w.prompt, through) } : w);
  const takes: TakePlan[] = [
    { way: 'today', ...said(today) },
    ways.edit ? { way: 'edit', ...ways.edit } : { way: 'free', ...said(ways.free) },
    { way: 'free', ...said(ways.free) },
  ];
  return takes.slice(0, Math.max(1, Math.min(3, n)));
}

/**
 * The orders the takes are shown to the judge in, as the test showed its three arms (26 Sep): the
 * moments take them in turn by story order, so each take is shown first, second and third alike,
 * and a take's letter never says which way it was drawn.
 */
const ROTATIONS = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
  [0, 2, 1],
  [2, 1, 0],
  [1, 0, 2],
];

/** The letter take `k` (from 0) of `n` is known by, for the moment in story place `order` (from 1). */
export function takeId(order: number, k: number, n: number): string {
  const shown = ROTATIONS[(Math.max(1, order) - 1) % ROTATIONS.length].filter((i) => i < n);
  return 'abc'[shown.indexOf(k)];
}

/** What the harness gives the judge to pick from: every path is in the store's media folder. */
export type PickInput = {
  session: string;
  moment: string;
  version: number;
  /** What the dreamer said, in their own words. */
  said: string[];
  /** The moment's line: what happens in it. */
  line: string;
  /** The picture just before it in the storyboard, where one is drawn. */
  before: { moment: string; line: string; mediaPath: string } | null;
  /** The takes drawn, in the order they are shown, known by letter only. */
  takes: { id: string; mediaPath: string }[];
};

export type Verdict = NonNullable<Take['verdict']>;
export type PickAnswer = { best: string; verdicts: Record<string, Verdict>; reason?: string };

/** An answer as the judge wrote it, read against the takes it was shown. */
export function readPick(raw: unknown, ids: string[]): PickAnswer {
  const a = (raw ?? {}) as { best?: unknown; verdicts?: unknown; reason?: unknown };
  const best = typeof a.best === 'string' ? a.best.trim() : '';
  if (!ids.includes(best)) throw new Error(`the pick names no take it was shown: ${JSON.stringify(a.best)}`);
  const verdicts: Record<string, Verdict> = {};
  for (const [id, v] of Object.entries((a.verdicts ?? {}) as Record<string, unknown>))
    if (ids.includes(id) && (v === 'right' || v === 'partly' || v === 'wrong')) verdicts[id] = v;
  return { best, verdicts, ...(typeof a.reason === 'string' && a.reason ? { reason: a.reason.slice(0, 500) } : {}) };
}

/**
 * The judge's pick applied to a moment whose takes are all in: the take it keeps becomes the
 * moment's picture, as if it had been the only take, and every other take stays on it as an
 * alternate. Without an answer (no judge, or none in time) take 1 is kept, today's picture; a take
 * that failed is never kept, and one ready take is kept as it is. With none ready the moment fails,
 * known by a job it paid for so that nothing paid is drawn again on a resume.
 */
export function applyPick(item: Item, answer: PickAnswer | null, why = 'no judge here'): void {
  const takes = item.takes ?? [];
  const ready = takes.filter((t) => t.status === 'ready' && !!t.mediaId);
  for (const t of takes) t.verdict = answer?.verdicts[t.id];
  if (!ready.length) {
    Object.assign(item, {
      status: 'failed',
      error: `every take failed: ${takes.map((t) => t.error ?? t.status).join('; ')}`.slice(0, 300),
      jobId: takes.find((t) => t.jobId)?.jobId,
      stale: undefined,
    });
    return;
  }
  const byNumber = [...ready].sort((p, q) => p.n - q.n);
  const judged = !!answer && ready.length > 1 && ready.some((t) => t.id === answer.best);
  const kept = judged ? (ready.find((t) => t.id === answer?.best) as Take) : byNumber[0];
  item.pick = {
    kept: kept.id,
    judged,
    reason: judged ? answer?.reason : ready.length === 1 ? 'the only take drawn' : why,
  };
  Object.assign(item, {
    // Drawn from a version the person has since corrected: drawn again from the new one.
    status: item.stale ? 'waiting' : 'ready',
    stale: undefined,
    jobId: kept.jobId,
    recipeId: kept.recipeId,
    mediaId: kept.mediaId,
    mediaPath: kept.mediaPath,
    check: undefined,
    repairFor: undefined,
  });
}
