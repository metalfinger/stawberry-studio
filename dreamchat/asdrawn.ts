// The record of what was drawn, and staleness (HARNESS_PLAN.md, S9).
//
// A picture is drawn from a dream that goes on changing: the dreamer corrects a moment or a sketch, a
// scene is planned again, the story record reads something new, an earlier picture is drawn again, the
// look is changed. Until now nothing kept what a picture was drawn from, so nothing could say which
// pictures no longer match the dream, and a rebuild made every picture afresh from the dream as it is
// now, which is not how any of them was drawn: each picture holds its own copy of itself (a moment's
// words, who is in it, its plan; an in-between picture's plan), made on the day it was first put in,
// and drawing reads that copy.
//
// So, when a picture is drawn, it keeps, for that take: what was sent (the prompt, and each image by
// what it is, with its role and instruction); the picture as it held itself; each sketch and earlier
// picture it was drawn from, with the take it was then; the story record's facts in force on everyone
// in it; the look it was drawn in; and each input by name, hashed, which is what staleness compares.
// A rebuild reads it back (plan.ts), so it gives the dream as it stood when each picture was drawn.
//
// Staleness compares each drawn picture's record, input by input, with what drawing it again now would
// read: its words and cast as it holds them now, the plan as a re-plan makes it now, the sketches,
// earlier pictures, record and look as they are now. It is reported and never acted on: nothing is
// drawn again, held or planned again for it. A picture drawn from a stale one is stale in turn
// (sequences); a picture whose look, or whose subjects' looks, changed is stale for that (look keys).
//
// Pure: no model, no files, no clock. Behind DREAMCHAT_AS_DRAWN: off (the default) keeps nothing, and
// every prompt is written as before.
import { assembleCut } from './assemble';
import type { CutPlan, GhostPlan } from './continuity';
import { cutSheet, type CutSheet, imageNamesOf, type SheetPrint } from './cutsheet';
import { approved, type FrameReference, type PlannedInput } from './frames';
import { hashOf } from './lib';
import type { StyleOption } from './producer';
import { type NowOf, sayNow } from './record';
import type { Item } from './sheets';

/** Whether pictures keep a record of what they were drawn from: off (the default), or on. */
export function asDrawnMode(): 'off' | 'on' {
  return (process.env.DREAMCHAT_AS_DRAWN ?? '').trim().toLowerCase() === 'on' ? 'on' : 'off';
}

// ── the record ───────────────────────────────────────────────────────────────

/** A sketch as a picture was drawn from it: what its words said, and the take its image was. */
export type SketchCopy = Pick<Item, 'id' | 'kind' | 'name' | 'fields'> &
  Partial<Pick<Item, 'isDreamer' | 'several' | 'partOf' | 'extras' | 'leaveOut' | 'shut' | 'nodeId'>> & {
    take: number;
    /** Its image then, where it had an approved one. */
    media: string | null;
  };

/** Kept once per dream, by hash: the sketches and looks pictures were drawn from. */
export type Copies = { sketches: Record<string, SketchCopy>; looks: Record<string, StyleOption> };

/** An earlier picture or a sketch a picture was sent, by what it is and the take it was then. */
export type DrawnFrom = { id: string; kind: 'sketch' | 'cut' | 'ghost'; name: string; take: number; media: string };

/** The words every moment is told in (session.ts rewords the same). */
const WORDS = ['action', 'visual_point', 'feeling', 'purpose', 'shift', 'dream'] as const;

/** One take of a picture, as it was sent and what it was drawn from. */
export type AsDrawn = {
  /** The picture's version when it was sent. */
  take: number;
  kind: 'cut' | 'ghost';
  prompt: string;
  /** Its images in order: each by what it is (`sketch:p1`, `picture:m3`, `ghost:t1:lid`, `previs:m5`). */
  references: { name: string; media: string; role: FrameReference['role']; instruction: string }[];
  /** A moment as it held itself when drawn: its words, who and what is in it, its plan, its brief. */
  moment?: {
    fields: Item['fields'];
    frame: NonNullable<Item['frame']>;
    shot?: NonNullable<Item['shot']>;
    repairFor?: string[];
    /** It had a mock-up as image 1. */
    previs: boolean;
  };
  /** An in-between picture's plan as it held it when drawn. */
  ghost?: GhostPlan;
  /** Each sketch in it, by id: its copy's hash in the dream's copies. */
  sketches: Record<string, string>;
  /** Each earlier picture and sketch it was sent, with the take it was then. */
  from: DrawnFrom[];
  /** A moment's earlier pictures drawn by then that its plan draws it from, attached or not. */
  earlier?: string[];
  /** What the judge found invented in each of those, as the moment was told to leave it out. */
  strays?: Record<string, string[]>;
  /** The story record's facts in force on everyone in it (typed); null where its plan was made without the record. */
  facts: NowOf[] | null;
  /** The look it was drawn in: its hash in the dream's copies (its look key). */
  look: string;
  /** Its cut sheet's print, where one was built when it was sent. */
  sheet?: SheetPrint;
  /** Each input by name, hashed, as it was sent (the picture's own copy of itself). */
  keys: Record<string, string>;
  /** Each input in a few words, for the reasons. */
  says: Record<string, string>;
  /**
   * The same inputs as the dream gave them when it was drawn (keysNow then: the plan as a re-plan made
   * it then). What staleness compares with the dream now; where it differs from `keys`, the picture was
   * drawn from a copy of itself already behind the dream, which is not staleness.
   */
  dream: Keyed | null;
};

/** A sketch's copy, as a picture is drawn from it now. */
export function sketchCopy(s: Item): SketchCopy {
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    fields: structuredClone(s.fields),
    ...(s.isDreamer ? { isDreamer: true } : {}),
    ...(s.several !== undefined ? { several: s.several } : {}),
    ...(s.partOf ? { partOf: s.partOf } : {}),
    ...(s.extras ? { extras: true } : {}),
    ...(s.leaveOut?.length ? { leaveOut: [...s.leaveOut] } : {}),
    ...(s.shut?.length ? { shut: [...s.shut] } : {}),
    ...(s.nodeId ? { nodeId: s.nodeId } : {}),
    take: s.version,
    media: approved(s) && s.mediaId ? s.mediaId : null,
  };
}

/** What a picture's inputs are keyed by: each with its hash and a few words. */
export type Keyed = { keys: Record<string, string>; says: Record<string, string> };

const short = (t: string, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * A moment's inputs by name, from its cut sheet and the images the sheet attaches: its words (and
 * which were said), who and what is in it, its camera and brief, the record's facts in force, the
 * look, each one in view as the prompt tells it (its image where attached), each earlier picture
 * attached (its image, what it gives and what the judge found in it), and the rest of the sheet.
 * Only what reaches the prompt: the sheet's tags, tree and record layers are left out.
 */
export function momentKeys(sheet: CutSheet, fields: Item['fields'], name: (media: string) => string): Keyed {
  const refs = assembleCut(sheet).references;
  const attached = new Set(refs.map((r) => r.image));
  const keys: Record<string, string> = {};
  const says: Record<string, string> = {};
  const put = (k: string, v: unknown, w: string) => {
    keys[k] = hashOf(v);
    says[k] = w;
  };
  const said = Object.fromEntries(WORDS.map((k) => [k, !!fields[k]?.said]));
  put('words', { story: sheet.story, said }, `"${short(sheet.story.action)}"`);
  put(
    'cast',
    { visible: sheet.visible, inView: sheet.inView.map((e) => e.id), place: sheet.place, members: sheet.members },
    `${sheet.inView.map((e) => e.id).join(', ')} at ${sheet.place}`,
  );
  put(
    'camera',
    { ...sheet.camera, previs: !!sheet.camera.previs },
    `${sheet.camera.eyes}, ${sheet.camera.size}${sheet.camera.view ? `: ${short(sheet.camera.view, 80)}` : ''}`,
  );
  put(
    'facts',
    {
      now: sheet.now,
      nowWords: sheet.nowWords,
      states: sheet.states,
      changes: sheet.inView.map((e) => [e.id, e.changes, e.turned]),
    },
    short(
      (sheet.now ? sayNow(sheet.now).map((x) => x.text) : (sheet.nowWords ?? [])).join('; ') ||
        sheet.states.map((x) => `${x.who} ${x.what}: ${x.now}`).join('; ') ||
        'nothing changed',
      200,
    ),
  );
  put('look', sheet.style.option, sheet.style.option.name);
  for (const e of sheet.inView) {
    const image = e.image && attached.has(e.image) ? e.image : null;
    put(
      `sketch:${e.id}`,
      {
        name: e.name,
        kind: e.kind,
        said: e.said,
        isDreamer: e.isDreamer,
        group: e.group,
        look: e.turned === null ? e.look : null,
        image,
        colours: e.colours,
      },
      `${e.name}${image ? ` (${name(image)})` : ''}`,
    );
  }
  for (const x of sheet.earlier) {
    if (!attached.has(x.image)) continue;
    const { image, ...rest } = x;
    const strays = sheet.take.strays[x.id] ?? [];
    put(
      `earlier:${x.id}`,
      { image, ...rest, strays },
      `${name(image)}${strays.length ? `, ${strays.length} thing${strays.length > 1 ? 's' : ''} the judge found invented left out` : ''}`,
    );
  }
  // What the dreamer wears, told wherever the dreamer is, in view or only their hands.
  put(
    'dreamer',
    sheet.dreamer,
    sheet.dreamer.wear ? `the dreamer wears ${short(sheet.dreamer.wear, 80)}` : 'no dreamer',
  );
  // The rest of what the prompt is written from, so nothing that reaches it goes unkeyed.
  put(
    'other',
    {
      names: sheet.names,
      told: sheet.style.told,
      oneColour: sheet.style.oneColour,
      looks: sheet.inView.map((e) => [e.id, e.look]),
      unattached: sheet.earlier.filter((x) => !attached.has(x.image)).map((x) => x.id),
    },
    'the rest of the sheet',
  );
  return { keys, says };
}

/** An in-between picture's inputs by name: the change it shows, its subject's sketch, what it is edited from, the look. */
export function ghostKeys(x: {
  ghost: GhostPlan;
  sketch: SketchCopy;
  from?: { id: string; media: string; name: string };
  after?: { id: string; media: string; name: string };
  style: StyleOption;
}): Keyed {
  const g = x.ghost;
  const keys: Record<string, string> = {};
  const says: Record<string, string> = {};
  const put = (k: string, v: unknown, w: string) => {
    keys[k] = hashOf(v);
    says[k] = w;
  };
  put(
    'change',
    {
      kind: g.kind,
      of: g.of,
      change: g.change,
      state: g.state ?? null,
      looksAt: g.looksAt ?? null,
      before: g.before ?? null,
    },
    short(g.change),
  );
  put(`sketch:${g.of}`, lookOfSketch(x.sketch), `${x.sketch.name}${x.sketch.media ? ` (sketch:${g.of})` : ''}`);
  if (x.from) put(`earlier:${x.from.id}`, { image: x.from.media }, x.from.name);
  if (x.after) put(`earlier:${x.after.id}`, { image: x.after.media }, x.after.name);
  put('look', x.style, x.style.name);
  return { keys, says };
}

/** What of a sketch an in-between picture is edited from: its words and its image. */
const lookOfSketch = (c: SketchCopy) => ({
  name: c.name,
  kind: c.kind,
  isDreamer: !!c.isDreamer,
  fields: c.fields,
  media: c.media,
});

/** The earlier pictures a moment is sent, as drawing picks them (session.ts plannedInputsOf). */
export function inputsOf(frames: Item[], plan: CutPlan | undefined): PlannedInput[] {
  return (plan?.refs ?? [])
    .map((use) => ({ use, item: frames.find((x) => x.id === use.id) }))
    .filter((x): x is PlannedInput => !!x.item && x.item.status === 'ready' && !!x.item.mediaId);
}

/** What a picture keeps when it is sent, and the copies it adds to the dream's. */
export type Recorded = { record: Omit<AsDrawn, 'take'>; copies: Copies };

/**
 * A moment's record as it is sent: its prompt and images as they went, and what they were made from
 * (the moment as held, the sketches, the earlier pictures drawn, its mock-up, the look).
 */
export function recordMoment(x: {
  frame: Item;
  sheets: Item[];
  frames: Item[];
  style: StyleOption;
  layout?: string;
  sent: { prompt: string; references: FrameReference[] };
  sheetPrint?: SheetPrint;
  name: (media: string) => string;
  /** The dream as it stands while it is sent, its plan as a re-plan makes it now: the baseline for staleness. */
  then: DreamNow;
}): Recorded {
  const f = x.frame.frame;
  if (!f) throw new Error(`${x.frame.name} is not a moment`);
  const inputs = inputsOf(x.frames, f.plan);
  const sheet = cutSheet({ frame: x.frame, sheets: x.sheets, style: x.style, inputs, layout: x.layout, dream: null });
  const { keys, says } = momentKeys(sheet, x.frame.fields, x.name);
  const copies: Copies = { sketches: {}, looks: {} };
  const sketches: Record<string, string> = {};
  for (const e of sheet.inView) {
    const s = x.sheets.find((i) => i.id === e.id);
    if (!s) continue;
    const c = sketchCopy(s);
    const h = hashOf(c);
    copies.sketches[h] = c;
    sketches[e.id] = h;
  }
  const look = hashOf(x.style);
  copies.looks[look] = structuredClone(x.style);
  return {
    record: {
      kind: 'cut',
      prompt: x.sent.prompt,
      references: x.sent.references.map((r) => ({
        name: x.name(r.media_id),
        media: r.media_id,
        role: r.role,
        instruction: r.instruction,
      })),
      moment: {
        fields: structuredClone(x.frame.fields),
        frame: structuredClone(f),
        ...(x.frame.shot ? { shot: { ...x.frame.shot } } : {}),
        ...(x.frame.repairFor?.length ? { repairFor: [...x.frame.repairFor] } : {}),
        previs: !!x.layout,
      },
      sketches,
      from: fromOf(x.sent.references, [...x.sheets, ...x.frames], x.name),
      earlier: inputs.map((i) => i.use.id),
      ...(Object.keys(sheet.take.strays).length ? { strays: structuredClone(sheet.take.strays) } : {}),
      facts: sheet.now ? structuredClone(sheet.now) : null,
      look,
      ...(x.sheetPrint ? { sheet: x.sheetPrint } : {}),
      keys,
      says,
      dream: keysNow(x.then, x.frame, x.name),
    },
    copies,
  };
}

/** An in-between picture's record as it is sent. */
export function recordGhost(x: {
  ghost: Item;
  sheet: Item;
  from?: Item;
  previous?: Item;
  frames: Item[];
  sheets: Item[];
  style: StyleOption;
  sent: { prompt: string; references: FrameReference[] };
  name: (media: string) => string;
  then: DreamNow;
}): Recorded {
  const g = x.ghost.ghost;
  if (!g) throw new Error(`${x.ghost.name} is not an in-between picture`);
  const c = sketchCopy(x.sheet);
  const h = hashOf(c);
  const look = hashOf(x.style);
  const { keys, says } = ghostKeys({
    ghost: g,
    sketch: c,
    ...usedBy(g, x.from, x.previous, x.name),
    style: x.style,
  });
  return {
    record: {
      kind: 'ghost',
      prompt: x.sent.prompt,
      references: x.sent.references.map((r) => ({
        name: x.name(r.media_id),
        media: r.media_id,
        role: r.role,
        instruction: r.instruction,
      })),
      ghost: structuredClone(g),
      sketches: { [g.of]: h },
      from: fromOf(x.sent.references, [...x.sheets, ...x.frames], x.name),
      facts: null,
      look,
      keys,
      says,
      dream: keysNow(x.then, x.ghost, x.name),
    },
    copies: { sketches: { [h]: c }, looks: { [look]: structuredClone(x.style) } },
  };
}

/** The pictures an in-between picture is edited from, as ghostPrompt takes them (approved and drawn). */
function usedBy(
  g: GhostPlan,
  from: Item | undefined,
  previous: Item | undefined,
  name: (media: string) => string,
): { from?: { id: string; media: string; name: string }; after?: { id: string; media: string; name: string } } {
  const use = (i: Item | undefined) =>
    i && approved(i) && i.mediaId ? { id: i.id, media: i.mediaId, name: name(i.mediaId) } : undefined;
  const f = g.kind !== 'view' ? use(from) : undefined;
  const a = use(previous);
  return { ...(f ? { from: f } : {}), ...(a ? { after: a } : {}) };
}

/** Each image sent that is a sketch or an earlier picture, with the take it was. */
function fromOf(refs: FrameReference[], all: Item[], name: (media: string) => string): DrawnFrom[] {
  const out: DrawnFrom[] = [];
  for (const r of refs) {
    const it = all.find((i) => i.mediaId === r.media_id);
    if (!it) continue;
    const kind = it.kind === 'cut' ? 'cut' : it.kind === 'ghost' ? 'ghost' : 'sketch';
    out.push({ id: it.id, kind, name: name(r.media_id), take: it.version, media: r.media_id });
  }
  return out;
}

/** The take a picture holds now, where it has one: its record for that take. */
export function currentRecord(i: Item): AsDrawn | undefined {
  if (i.status !== 'ready' || !i.mediaId) return undefined;
  return i.asDrawn?.find((t) => t.take === i.version);
}

/** A dream's copies with more added. */
export function withCopies(into: Copies | undefined, more: Copies): Copies {
  return {
    sketches: { ...(into?.sketches ?? {}), ...more.sketches },
    looks: { ...(into?.looks ?? {}), ...more.looks },
  };
}

// ── staleness ────────────────────────────────────────────────────────────────

/**
 * Why a picture is stale: which input changed. `words` its words; `cast` who or what is in it; `camera`
 * its camera or brief; `record` the story record's facts on those in it; `look` the look it was drawn in;
 * `sketch` how someone in it is drawn (their sketch's words or take); `earlier` an earlier picture it was
 * drawn from (drawn again, no longer drawn, or another now); `change` what an in-between picture shows;
 * `plan` it is no longer in the plan; `sequence` drawn from a stale picture; `other` something else the
 * prompt is written from.
 */
export type ReasonKind =
  'words' | 'cast' | 'camera' | 'record' | 'look' | 'sketch' | 'earlier' | 'change' | 'plan' | 'sequence' | 'other';

export type StaleReason = { kind: ReasonKind; input: string; then?: string; now?: string };

export type Stale = { id: string; kind: 'cut' | 'ghost'; take: number; reasons: StaleReason[] };

export type StaleReport = {
  /** Drawn pictures whose take has a record: the ones staleness can read. */
  checked: string[];
  /** Drawn pictures whose take has no record (drawn with the switch off, or before S9). */
  unrecorded: string[];
  stale: Stale[];
};

const KIND_OF: Record<string, ReasonKind> = {
  words: 'words',
  cast: 'cast',
  camera: 'camera',
  facts: 'record',
  look: 'look',
  change: 'change',
  dreamer: 'sketch',
  other: 'other',
};

/** A dream as staleness reads it: its pictures and sketches, the look, and the plan as a re-plan makes it now. */
export type DreamNow = {
  frames: Item[];
  items: Item[];
  style: StyleOption | null;
  /** The continuity plan made now, its in-between pictures known by the ids the drawn ones have. */
  plan: { cuts: CutPlan[]; ghosts: GhostPlan[] } | null;
  /**
   * Who and what each moment has in it as the dream stands, as buildFrames puts it in (the plan's, from
   * the story record, else the breakdown's). A moment keeps the cast it was first put in with, which a
   * re-plan does not update; without this, the moment's own is read.
   */
  cast?: Record<string, { visible: string[]; things: string[] }>;
};

/**
 * The dream as it stands, keyed as a picture's record is: a moment's words as it holds them (a correction
 * patches the moment, not the breakdown), who and what is in it and its plan as a re-plan makes them now,
 * the sketches, earlier pictures and look as they are now; an in-between picture's change as the plan now
 * has it. Null where it is no longer planned at all.
 */
export function keysNow(d: DreamNow, it: Item, name: (media: string) => string): Keyed | null {
  if (!d.style) return null;
  if (it.kind === 'cut') {
    const f = it.frame;
    if (!f) return null;
    const plan = d.plan ? d.plan.cuts.find((c) => c.id === it.id) : f.plan;
    if (!plan) return null;
    const cast = d.cast?.[it.id];
    const frame: Item = {
      ...it,
      frame: { ...f, plan, ...(cast ? { visible: [...cast.visible], things: [...cast.things] } : {}) },
    };
    const inputs = inputsOf(d.frames, plan);
    const sheet = cutSheet({
      frame,
      sheets: d.items,
      style: d.style,
      inputs,
      layout: it.layout?.mediaId,
      dream: null,
    });
    return momentKeys(sheet, it.fields, name);
  }
  const held = it.ghost;
  if (!held) return null;
  // The plan's in-between picture for the same change: by its id, else by who it shows and what of them
  // changes (one planned before the record gave changes their keys is known only by what it says, so a
  // change told otherwise is planned under another id).
  const same = (x: GhostPlan) =>
    x.kind === held.kind &&
    x.of === held.of &&
    (x.kind === 'view' ? x.looksAt === held.looksAt : x.state?.what === held.state?.what);
  const g = d.plan ? (d.plan.ghosts.find((x) => x.id === it.id) ?? d.plan.ghosts.find(same)) : held;
  if (!g) return null;
  const sheet = d.items.find((i) => i.id === g.of);
  if (!sheet) return null;
  const ready = (id: string | null | undefined) =>
    id ? d.frames.find((x) => x.id === id && x.status === 'ready') : undefined;
  return ghostKeys({
    ghost: g,
    sketch: sketchCopy(sheet),
    ...usedBy(g, ready(g.from), ready(g.after), name),
    style: d.style,
  });
}

/**
 * Which drawn pictures no longer match the dream, and why: each picture's record, input by input,
 * against what drawing it again now would read (keysNow); then down the chains pictures were drawn
 * along, a picture drawn from a stale one is stale in turn. Reported only: nothing here acts.
 */
export function staleness(d: DreamNow, name: (media: string) => string): StaleReport {
  const report: StaleReport = { checked: [], unrecorded: [], stale: [] };
  const byId = new Map<string, Stale>();
  const drawn = d.frames.filter((f) => (f.kind === 'cut' || f.kind === 'ghost') && f.status === 'ready' && f.mediaId);
  const records = new Map<string, AsDrawn>();
  for (const f of drawn) {
    const rec = currentRecord(f);
    if (!rec) {
      report.unrecorded.push(f.id);
      continue;
    }
    records.set(f.id, rec);
    report.checked.push(f.id);
    const now = keysNow(d, f, name);
    // What the dream gave it when it was drawn; for a record kept without it, what was sent.
    const then: Keyed = rec.dream ?? { keys: rec.keys, says: rec.says };
    const reasons: StaleReason[] = [];
    if (!now) reasons.push({ kind: 'plan', input: 'plan', then: 'planned', now: 'no longer in the plan' });
    else reasons.push(...differ(then, now));
    if (reasons.length) {
      const st: Stale = { id: f.id, kind: f.kind as 'cut' | 'ghost', take: rec.take, reasons };
      byId.set(f.id, st);
    }
  }
  // Sequences: drawn from a stale picture, stale in turn, down every chain.
  for (let changed = true; changed;) {
    changed = false;
    for (const f of drawn) {
      const rec = records.get(f.id);
      if (!rec) continue;
      for (const src of rec.from) {
        if (src.kind === 'sketch' || src.id === f.id) continue;
        const up = byId.get(src.id);
        if (!up) continue;
        const own = byId.get(f.id);
        if (own?.reasons.some((r) => r.kind === 'sequence' && r.input === src.id)) continue;
        const reason: StaleReason = { kind: 'sequence', input: src.id, then: src.name, now: `${src.id} is stale` };
        if (own) own.reasons.push(reason);
        else byId.set(f.id, { id: f.id, kind: f.kind as 'cut' | 'ghost', take: rec.take, reasons: [reason] });
        changed = true;
      }
    }
  }
  const order = new Map(d.frames.map((f, i) => [f.id, i]));
  report.stale = [...byId.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return report;
}

/** Where two keyings of a picture's inputs differ, as reasons; `other` only where nothing named does. */
export function differ(then: Keyed, now: Keyed): StaleReason[] {
  const all = [...new Set([...Object.keys(then.keys), ...Object.keys(now.keys)])].sort();
  const named = all.filter((k) => k !== 'other' && then.keys[k] !== now.keys[k]);
  const out: StaleReason[] = named.map((k) => ({
    kind: KIND_OF[k] ?? (k.startsWith('sketch:') ? 'sketch' : 'earlier'),
    input: k,
    ...(then.says[k] !== undefined ? { then: then.says[k] } : {}),
    // Said the same in a few words, it changed in what those words leave out (a look's words, a flag).
    ...(now.says[k] !== undefined
      ? { now: now.says[k] === then.says[k] ? `${now.says[k]}, told otherwise` : now.says[k] }
      : {}),
  }));
  if (!named.length && then.keys.other !== now.keys.other)
    out.push({ kind: 'other', input: 'other', then: then.says.other, now: now.says.other });
  return out;
}

/**
 * Where a picture was drawn from a copy of itself already behind the dream: what was sent against what
 * the dream gave it then. Not staleness: nothing changed after it was drawn.
 */
export function behind(rec: AsDrawn): StaleReason[] {
  return rec.dream ? differ({ keys: rec.keys, says: rec.says }, rec.dream) : [];
}

/**
 * Each image by what it is and the take it is: `sketch:p1 take 2`, `picture:m3 take 1`,
 * `ghost:t1:lid take 1`, `previs:m5`. As the dream holds its pictures when it is asked.
 */
export function labelsOf(items: Item[], frames: Item[]): (media: string) => string {
  const named = imageNamesOf(items, frames);
  const take = new Map<string, number>();
  for (const i of [...items, ...frames]) if (i.mediaId) take.set(i.mediaId, i.version);
  return (media) => {
    const n = named(media);
    const t = take.get(media);
    return t !== undefined && !n.startsWith('previs:') ? `${n} take ${t}` : n;
  };
}

/** A stale picture's reasons in a line: "m4: words; sketch:p1 (sketch:p1 take 1 → take 2); sequence from m3". */
export function reasonLine(s: Stale): string {
  return `${s.id}: ${s.reasons
    .map((r) =>
      r.kind === 'sequence'
        ? `drawn from ${r.input}, which is stale`
        : `${r.input}${r.then !== undefined || r.now !== undefined ? ` (${r.then ?? 'none'} → ${r.now ?? 'none'})` : ''}`,
    )
    .join('; ')}`;
}
