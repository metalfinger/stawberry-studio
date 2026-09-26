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
import {
  type ContinuityPlan,
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
  framePrompt,
  ghostPrompt,
  inViewOf,
  type PlannedInput,
  turnedInto,
} from './frames';
import { checkReferences, preflight, readPrompt } from './gate';
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
export function rebuild(s: Pick<Session, 'draft' | 'style' | 'build' | 'prep'> & { id?: string }): Rebuilt {
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
  // With DREAMCHAT_RECORD=on, planned from the story record: from what a frozen dream keeps (its
  // sketches' words, or those its shots were planned with, its readings and look), so a frozen dream
  // and its saved conversation plan alike.
  const inputs = recordInputsOf({ build: s.build, prep: s.prep });
  const rec = recordForPlan(b, inputs.items, s.draft?.readings, { words: inputs.words, style });
  const plan = planContinuity(b, rec);
  const pictures = [...buildFrames(b, plan), ...buildGhosts(plan)].map((p): Item => ({
    ...p,
    status: 'ready',
    mediaId: standIn.picture(p.id),
    continuityApproved: true,
  }));
  const byId = new Map(pictures.map((p) => [p.id, p]));
  const saved = new Map((s.build?.frames ?? []).filter((f) => f.kind === 'cut').map((f) => [f.id, f]));

  const out: RebuiltPicture[] = [];
  for (const pid of drawOrder(plan)) {
    const it = byId.get(pid);
    if (!it) continue;
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
    const shot = view ? briefs.find((x) => x?.view === view) : undefined;
    if (shot) it.shot = shot;
    // The mock-up, where the moment has a worked-out camera on a floor plan (session.ts layoutFor).
    const layout = cut?.eye && shotPlan(b, pid, rec) ? standIn.previs(pid) : undefined;
    const inputs: PlannedInput[] = (cut?.refs ?? [])
      .map((use) => ({ use, item: byId.get(use.id) }))
      .filter((x): x is PlannedInput => !!x.item);
    const built = framePrompt(it, sheets, style, inputs, layout);
    out.push({
      id: pid,
      kind: 'cut',
      item: it,
      prompt: built.prompt,
      references: built.references,
      criteria: cut?.criteria ?? [],
      inView: inViewOf(it, sheets),
    });
  }
  return { title: b.title, b, plan, sheets, pictures: out, ...(rec ? { rec } : {}) };
}

/** An in-between picture named by what it shows, which survives planning again (its number may not). */
export const ghostName = (g: { of: string; kind: string; state?: { what: string }; looksAt?: string }) =>
  `ghost:${g.of}:${g.kind === 'view' ? 'view' : (g.state?.what ?? '')}`;

/**
 * An image named by what it is, never by a store's id: `sketch:p1`, `picture:m3`, `previs:m5`, or an
 * in-between picture by its subject and change (`ghost:t1:lid`). The same dream names its images
 * the same on any machine, whatever was drawn.
 */
export function imageName(r: Rebuilt, media: string): string {
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
  const [id, ...only] = args.filter((a) => a !== '--gate');
  if (!id) {
    console.error('usage: bun run plan.ts <session id> [m5 g2 …] [--gate]');
    process.exit(1);
  }
  // From this checkout's state/, or DREAMCHAT_DATA's, or another worktree's (a worktree has none).
  const { dataDir } = await import('./evals/saved');
  const s = JSON.parse(readFileSync(join(dataDir([id]), 'state', `${id}.json`), 'utf8')) as Session;
  if (!s.draft?.breakdown || !s.style) {
    console.error(`${id} has no breakdown and chosen style yet`);
    process.exit(1);
  }
  const r = rebuild(s);
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
    const read = await readPrompt(callJev, prompt, { sheet, edit });
    const g = read.reading;
    return `gate: ${[...fixed, ...read.findings].length ? `HOLD: ${[...fixed, ...read.findings].join('; ')}` : 'draw'}${g ? ` | contradicts ${g.contradicts.toFixed(2)} twice ${g.twice.toFixed(2)} clear ${g.clear.toFixed(2)}${g.refsClear !== null ? ` refs ${g.refsClear.toFixed(2)}` : ''}` : ''}`;
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
      console.log(await gateOf(p.prompt, p.references, p.inView, issues, false, it.kind === 'ghost', it));
      continue;
    }
    console.log(p.prompt);
    for (const k of p.criteria) console.log(`  check${k.with ? ` with ${k.with}` : ''}: ${k.text}`);
  }
}
