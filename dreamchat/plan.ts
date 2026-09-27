// What every picture of a saved dream would be told, before anything is paid for: the continuity
// plan with its findings, then each in-between reference's and each moment's prompt and
// references, as if every picture before it had been drawn and approved. From the dream's current
// breakdown, sketches and style; no model calls, no images.
//
//   bun run plan.ts <session id> [m5 g2 …] [--gate]
//
// `rebuild` is the same work as a function, for the evals that score the preparation without
// drawing (evals/prompt-cases.ts, evals/corpus.ts). A moment is given what the harness gives it
// when it draws (session.ts startFrame): the mock-up of its floor plan as image 1 where it has a
// worked-out camera and no picture to edit, and the shot's brief where one was written for the view
// it has now. Both are known from the saved dream; nothing is asked of a model.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sameView } from './camera';
import {
  type ContinuityPlan,
  type GhostPlan,
  type Criterion,
  drawOrder,
  planContinuity,
  type RecordPlan,
  shotPlan,
} from './continuity';
import { completeViews } from './producer';
import {
  buildFrames,
  buildGhosts,
  type FrameReference,
  ghostPrompt,
  inViewOf,
  type PlannedInput,
  turnedInto,
} from './frames';
import { type AsDrawn, type Copies, currentRecord, matchGhost } from './asdrawn';
import { type CutSheet, cutSheetMode, framed, ghostName, sheetDream } from './cutsheet';
import { type CutFacts, cutFactsOf, routedMode } from './checks';
import { actingOf, checkReferences, preflight, readPrompt } from './gate';
import { callJev } from './jev';
import { recordForPlan, recordInputsOf } from './record';
import type { Breakdown } from './producer';
import type { Session } from './session';
import { type Item, sheetPrompt } from './sheets';

/** One picture as it would be sent: its prompt and its images, in order. */
export type RebuiltPicture = {
  id: string;
  kind: 'cut' | 'ghost';
  /** The planned picture, as buildFrames or buildGhosts made it, approved with a stand-in image. */
  item: Item;
  prompt: string;
  references: FrameReference[];
  /** The judge's checks the plan sets for it. */
  criteria: Criterion[];
  /** Who and what it shows, by their sketches (none for an in-between picture). */
  inView: Item[];
  /** With DREAMCHAT_CUT_SHEET=shadow or on: the moment's cut sheet, and where its assembly differs from framePrompt's. */
  sheet?: CutSheet;
  differs?: string[];
  /** S9: rebuilt from its record of what it was drawn from (the dream as it stood when it was drawn). */
  asDrawn?: true;
};

/** A saved dream's plan and every picture of it, in the order they would be drawn. */
export type Rebuilt = {
  title: string;
  b: Breakdown;
  plan: ContinuityPlan;
  /** Every sketch, approved, with a stand-in image (`sketch-<id>`) where one would be drawn. */
  sheets: Item[];
  pictures: RebuiltPicture[];
  /** What the plan read of the story record (DREAMCHAT_RECORD=on): its floor plans are shot from it. */
  rec?: RecordPlan;
  /** S9: images of pictures rebuilt from their records, by stand-in, where the plan made now has none of that name. */
  named?: Record<string, string>;
};

/** The stand-in image of a sketch, of an earlier picture, and of a moment's mock-up. */
export const standIn = {
  sketch: (id: string) => `sketch-${id}`,
  picture: (id: string) => `picture-${id}`,
  previs: (id: string) => `previs-${id}`,
};

/**
 * Every picture of a saved dream as it would be told now, by today's code: the breakdown completed,
 * the continuity plan made again, every sketch and earlier picture taken as drawn and approved.
 * Pure and deterministic: the environment's switches (DREAMCHAT_RECORD and the like) apply as they
 * do when the harness draws.
 */
export function rebuild(
  s: Pick<Session, 'draft' | 'style' | 'build' | 'prep'> & { id?: string; transcript?: Session['transcript'] },
  /**
   * S9: a picture drawn with its record kept (DREAMCHAT_AS_DRAWN=on) is rebuilt from it, as the dream
   * stood when it was drawn: its own copy of itself, the sketches' words and the look then, and the
   * earlier pictures drawn by then. Off unless asked for: an eval measuring a change to the harness reads
   * the dream as it stands, so a record never hides a fix; live-flow asks for both.
   */
  opts: { asDrawn?: boolean } = {},
): Rebuilt {
  const b = structuredClone(s.draft?.breakdown);
  const style = s.style;
  if (!b || !style) throw new Error(`${s.id ?? 'this dream'} has no breakdown and chosen style yet`);
  // Every sketch as approved, with a stand-in image where none was drawn.
  // (A crowd has no sketch, ever: it is said in words.)
  const sheets: Item[] = (s.build?.items ?? []).map((i) => ({
    ...i,
    status: 'ready',
    mediaId: i.mediaId ?? (i.extras ? undefined : standIn.sketch(i.id)),
    review: i.review ?? 'approved',
  }));
  completeViews(b);
  // With DREAMCHAT_RECORD=on, planned from the story record as drawing reads it (session.ts planRecord):
  // the sketches' words, the dreamer's messages where the dream keeps them, its readings and look.
  const inputs = recordInputsOf(s);
  const rec = recordForPlan(b, inputs.items, s.draft?.readings, { words: inputs.words, style });
  const plan = planContinuity(b, rec);
  // S9: each picture drawn with a record, by its id among the saved ones, and each saved in-between
  // picture by what it shows (a plan made again may number them otherwise).
  const asDrawn = opts.asDrawn ?? false;
  const savedAll = s.build?.frames ?? [];
  const recorded = new Map<string, AsDrawn>();
  if (asDrawn)
    for (const f of savedAll) {
      const r = currentRecord(f);
      if (r) recorded.set(f.id, r);
    }
  const savedGhost = (g: GhostPlan) =>
    matchGhost(
      g,
      savedAll.filter((f) => f.kind === 'ghost' && recorded.has(f.id)),
      (f) => f.ghost,
    );
  // With DREAMCHAT_CUT_SHEET=shadow or on, every moment's cut sheet, read from the dream as drawing reads
  // it (session.ts sheetDreamOf): the story record, and the tree resolved from this plan. Where pictures
  // were drawn with a record, as drawing read it: the plan kept since the moments began, each moment's
  // own plan, and a moment drawn with a record the plan it was drawn from.
  const mode = cutSheetMode();
  const kept = s.build?.plan ?? plan;
  const heldPlan = (id: string) => savedAll.find((f) => f.id === id && f.kind === 'cut')?.frame?.plan;
  const drawnPlan = recorded.size
    ? { ...kept, cuts: kept.cuts.map((c) => recorded.get(c.id)?.moment?.frame.plan ?? heldPlan(c.id) ?? c) }
    : plan;
  const dream =
    mode === 'off'
      ? null
      : sheetDream({
          breakdown: b,
          plan: drawnPlan,
          prep: s.prep,
          items: inputs.items,
          style,
          readings: s.draft?.readings,
          words: inputs.words,
        });
  const pictures = [...buildFrames(b, plan), ...buildGhosts(plan)].map((p): Item => ({
    ...p,
    status: 'ready',
    mediaId: standIn.picture(p.id),
    continuityApproved: true,
  }));
  const byId = new Map(pictures.map((p) => [p.id, p]));
  const saved = new Map((s.build?.frames ?? []).filter((f) => f.kind === 'cut').map((f) => [f.id, f]));
  const named: Record<string, string> = {};
  const was = { copies: s.build?.copies, sheets, style, saved: savedAll, plan, named };

  const out: RebuiltPicture[] = [];
  for (const pid of drawOrder(plan)) {
    const it = byId.get(pid);
    if (!it) continue;
    // S9: drawn with a record, rebuilt from it.
    const kept = it.kind === 'ghost' ? (it.ghost ? savedGhost(it.ghost) : undefined) : saved.get(pid);
    const record = kept ? recorded.get(kept.id) : undefined;
    if (record) {
      const again = fromRecord(was, it, record, dream, mode);
      if (again) {
        out.push(again);
        continue;
      }
    }
    if (it.kind === 'ghost') {
      const g = it.ghost;
      const sheet = sheets.find((x) => x.id === g?.of);
      if (!g || !sheet) continue;
      const built = ghostPrompt(
        it,
        sheet,
        g.from ? byId.get(g.from) : undefined,
        style,
        g.after ? byId.get(g.after) : undefined,
      );
      out.push({ id: pid, kind: 'ghost', item: it, ...built, criteria: [], inView: [] });
      continue;
    }
    const cut = it.frame?.plan;
    // The shot's brief, where one was written for the view the moment has now: the one kept on the
    // moment, else the one planned in the background (session.ts startFrame takes the same).
    const view = cut?.view;
    const briefs = [saved.get(pid)?.shot, s.prep?.shots?.[pid]];
    const shot = view ? briefs.find((x) => !!x && sameView(x.view, view)) : undefined;
    if (shot) it.shot = shot;
    // The mock-up, where the moment has a worked-out camera on a floor plan (session.ts layoutFor).
    const layout = cut?.eye && shotPlan(b, pid, rec) ? standIn.previs(pid) : undefined;
    const planned: PlannedInput[] = (cut?.refs ?? [])
      .map((use) => ({ use, item: byId.get(use.id) }))
      .filter((x): x is PlannedInput => !!x.item);
    const built = framed({ frame: it, sheets, style, inputs: planned, layout, dream }, mode, 'rebuild');
    out.push({
      id: pid,
      kind: 'cut',
      item: it,
      prompt: built.prompt,
      references: built.references,
      criteria: cut?.criteria ?? [],
      inView: inViewOf(it, sheets),
      ...(built.sheet ? { sheet: built.sheet, differs: built.differs ?? [] } : {}),
    });
  }
  return {
    title: b.title,
    b,
    plan,
    sheets,
    pictures: out,
    ...(rec ? { rec } : {}),
    ...(Object.keys(named).length ? { named } : {}),
  };
}

/**
 * One picture rebuilt from its record (S9): the moment or in-between picture as it held itself when drawn,
 * each sketch in it with its words and approval then, the look then, and the earlier pictures drawn by then
 * (each by its stand-in, with what the judge had found in it then). Null where the record cannot be read
 * back (a sketch it names is not kept): the picture is rebuilt as the dream stands.
 */
function fromRecord(
  x: {
    copies: Copies | undefined;
    sheets: Item[];
    style: NonNullable<Session['style']>;
    saved: Item[];
    plan: ContinuityPlan;
    named: Record<string, string>;
  },
  it: Item,
  record: AsDrawn,
  dream: ReturnType<typeof sheetDream> | null,
  mode: ReturnType<typeof cutSheetMode>,
): RebuiltPicture | null {
  const style = x.copies?.looks[record.look] ?? x.style;
  // Each sketch as the picture was drawn from it: its words and whether it was approved then; its image
  // the rebuild's, named by what it is.
  let missing = false;
  const sheets = x.sheets.map((sk): Item => {
    const h = record.sketches[sk.id];
    if (!h) return sk;
    const c = x.copies?.sketches[h];
    if (!c) {
      missing = true;
      return sk;
    }
    const { take: _take, media, ...words } = c;
    return {
      ...sk,
      ...words,
      fields: structuredClone(words.fields),
      ...(media ? {} : { mediaId: undefined, status: 'waiting' as const, review: undefined }),
    };
  });
  if (missing) return null;
  // An earlier picture by its stand-in: a moment by its id, an in-between picture by the id the plan made
  // now gives the same change, else a stand-in of its own, named by what it shows.
  const standInOf = (f: Item): string => {
    const g = f.ghost;
    if (f.kind !== 'ghost' || !g) return standIn.picture(f.id);
    const same = matchGhost(g, x.plan.ghosts, (y) => y);
    if (same) return standIn.picture(same.id);
    const media = `${standIn.picture('')}drawn-${f.id}`;
    x.named[media] = ghostName(g);
    return media;
  };
  const asInput = (id: string): Item | undefined => {
    const f = x.saved.find((y) => y.id === id);
    if (!f) return undefined;
    const strays = record.strays?.[id] ?? [];
    return {
      ...f,
      status: 'ready',
      mediaId: standInOf(f),
      continuityApproved: true,
      check: strays.length
        ? { questions: 0, passed: 0, failed: [], failedIds: strays.map(() => 'undeclared'), notes: [...strays] }
        : undefined,
    };
  };
  if (it.kind === 'ghost') {
    const g = record.ghost;
    const sheet = sheets.find((sk) => sk.id === g?.of);
    if (!g || !sheet?.mediaId) return null;
    const ghost: Item = { ...it, ghost: structuredClone(g) };
    const used = new Set(record.from.map((f) => f.id));
    const from = g.from && used.has(g.from) ? asInput(g.from) : undefined;
    const previous = g.after && used.has(g.after) ? asInput(g.after) : undefined;
    const built = ghostPrompt(ghost, sheet, from, style, previous);
    return { id: it.id, kind: 'ghost', item: ghost, ...built, criteria: [], inView: [], asDrawn: true };
  }
  const m = record.moment;
  if (!m) return null;
  const frame: Item = {
    ...it,
    fields: structuredClone(m.fields),
    frame: structuredClone(m.frame),
    shot: m.shot ? { ...m.shot } : undefined,
    repairFor: m.repairFor ? [...m.repairFor] : undefined,
  };
  const drawnThen = new Set(record.earlier ?? record.from.map((f) => f.id));
  const inputs: PlannedInput[] = (m.frame.plan?.refs ?? [])
    .filter((use) => drawnThen.has(use.id))
    .map((use) => ({ use, item: asInput(use.id) }))
    .filter((y): y is PlannedInput => !!y.item);
  const layout = m.previs ? standIn.previs(it.id) : undefined;
  const built = framed({ frame, sheets, style, inputs, layout, dream }, mode, 'rebuild');
  return {
    id: it.id,
    kind: 'cut',
    item: frame,
    prompt: built.prompt,
    references: built.references,
    criteria: m.frame.plan?.criteria ?? [],
    inView: inViewOf(frame, sheets),
    ...(built.sheet ? { sheet: built.sheet, differs: built.differs ?? [] } : {}),
    asDrawn: true,
  };
}

// Kept here too for older imports.
export { ghostName };

/**
 * An image named by what it is, never by a store's id: `sketch:p1`, `picture:m3`, `previs:m5`, or an
 * in-between picture by its subject and change (`ghost:t1:lid`). The same dream names its images
 * the same on any machine, whatever was drawn.
 */
export function imageName(r: Rebuilt, media: string): string {
  if (r.named?.[media]) return r.named[media];
  const sheet = r.sheets.find((s) => s.mediaId === media);
  if (sheet) return `sketch:${sheet.id}`;
  if (media.startsWith(standIn.previs(''))) return `previs:${media.slice(standIn.previs('').length)}`;
  if (media.startsWith(standIn.picture(''))) {
    const id = media.slice(standIn.picture('').length);
    const g = r.plan.ghosts.find((x) => x.id === id);
    return g ? ghostName(g) : `picture:${id}`;
  }
  return `other:${media}`;
}

/** A picture's images, in order, as "role name". */
export const imagesOf = (r: Rebuilt, p: RebuiltPicture) =>
  p.references.map((x) => `${x.role} ${imageName(r, x.media_id)}`);

if (import.meta.main) {
  // Keys for the gate's reading, loaded only when run as a script.
  await import('./boot');
  const args = process.argv.slice(2);
  // --gate: also put every picture through the confidence gate (Jev reads each prompt; no images).
  const gating = args.includes('--gate');
  // --as-drawn: a picture drawn with its record kept (S9) as it was drawn, from its record.
  const asDrawn = args.includes('--as-drawn');
  const [id, ...only] = args.filter((a) => a !== '--gate' && a !== '--as-drawn');
  if (!id) {
    console.error('usage: bun run plan.ts <session id> [m5 g2 …] [--gate] [--as-drawn]');
    process.exit(1);
  }
  // From this checkout's state/, or DREAMCHAT_DATA's, or another worktree's (a worktree has none).
  const { dataDir } = await import('./evals/saved');
  const s = JSON.parse(readFileSync(join(dataDir([id]), 'state', `${id}.json`), 'utf8')) as Session;
  if (!s.draft?.breakdown || !s.style) {
    console.error(`${id} has no breakdown and chosen style yet`);
    process.exit(1);
  }
  const r = rebuild(s, { asDrawn });
  const { plan, sheets } = r;

  console.log(`${r.title}: ${plan.cuts.length} moments, ${plan.ghosts.length} in-between references`);
  console.log(`draw order: ${drawOrder(plan).join(' ')}`);
  for (const issue of plan.issues) console.log(`plan finding: ${issue}`);
  for (const c of plan.cuts)
    console.log(
      `${c.id} ${c.shot} ${c.transition} | ${c.why}${c.staging.length ? ` | left to right: ${c.staging.join(', ')}` : ''}${c.own.length ? ` | changes: ${c.own.map((st) => `${st.who} ${st.what} → ${st.now}`).join('; ')}` : ''}${c.states.length ? ` | still: ${c.states.map((st) => `${st.who} ${st.what} ${st.now}`).join('; ')}` : ''}`,
    );

  const approved = new Set(
    [...sheets, ...r.pictures.map((p) => p.item)].map((x) => x.mediaId).filter((x): x is string => !!x),
  );
  for (const p of r.pictures) for (const ref of p.references) approved.add(ref.media_id);
  const gateOf = async (
    prompt: string,
    references: { media_id: string; role: string }[],
    inView: Item[],
    issues: string[],
    sheet = false,
    edit = false,
    item?: Item,
    /** Routed (DREAMCHAT_JEV_ROUTED=on, with the cut sheet shadow or on): the moment's tags and facts. */
    routing?: CutFacts,
  ) => {
    const fixed = [
      ...preflight(inView, issues),
      ...checkReferences(prompt, references, {
        approved,
        mustInclude: inView
          .filter((x) => x.mediaId && !(item && turnedInto(item).has(x.id)))
          .map((x) => ({ name: x.name, mediaId: x.mediaId as string })),
      }),
    ];
    const read = await readPrompt(callJev, prompt, { sheet, edit, ...(routing ? { routed: routing } : {}) });
    const g = read.reading;
    // With the checks only logging (DREAMCHAT_CHECKS=log), only a code fault holds; the rest would hold.
    // Routed (DREAMCHAT_JEV_ROUTED=on), a code fault and what the checks that earned acting find.
    const all = [...fixed, ...read.findings];
    const holds = actingOf(fixed, read, sheet ? 'sketch' : edit ? 'ghost' : 'moment');
    const would = all.filter((f) => !holds.includes(f));
    const said = [
      ...(holds.length ? [`HOLD: ${holds.join('; ')}`] : []),
      ...(would.length ? [`would hold: ${would.join('; ')}`] : []),
    ];
    return `gate: ${said.length ? said.join(' | ') : 'draw'}${g ? ` | contradicts ${g.contradicts.toFixed(2)} twice ${g.twice.toFixed(2)} clear ${g.clear.toFixed(2)}${g.refsClear !== null ? ` refs ${g.refsClear.toFixed(2)}` : ''}` : ''}`;
  };

  if (gating)
    for (const sk of sheets) {
      if (only.length && !only.includes(sk.id)) continue;
      const prompt = sheetPrompt(sk, s.style);
      console.log(`\n── sketch ${sk.id} ${sk.name}: ${await gateOf(prompt, [], [], [], true)}`);
    }

  for (const p of r.pictures) {
    if (only.length && !only.includes(p.id)) continue;
    const it = p.item;
    console.log(
      `\n══ ${p.id} ${it.name}\nreferences: ${p.references.map((x) => `${x.role}:${x.media_id}`).join(', ')}\n`,
    );
    if (gating) {
      const order = it.frame?.order;
      const issues = order
        ? plan.issues.filter((x) => x.startsWith(`picture ${order} `) || x.startsWith(`picture ${order}:`))
        : [];
      const routing = routedMode() && p.sheet ? cutFactsOf(p.sheet) : undefined;
      console.log(await gateOf(p.prompt, p.references, p.inView, issues, false, it.kind === 'ghost', it, routing));
      continue;
    }
    console.log(p.prompt);
    for (const k of p.criteria) console.log(`  check${k.with ? ` with ${k.with}` : ''}: ${k.text}`);
  }
}
