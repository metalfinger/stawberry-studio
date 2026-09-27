// The engine's side of evals/paired.ts and evals/checkpoint.ts: one saved dream written into the
// test's own Strawberry store, with everything its pictures attach put in and approved there, so each
// picture can be prepared, approved and queued as the harness does for a moment. Load it only after the
// store is set (DREAMCHAT_STRAWBERRY_HOME): the engine's modules read it when they load.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type GhostPlan, ghostKey, type RecordPlan, seenIn } from '../continuity';
import { renderTranscript } from '../jev';
import type { Breakdown, StyleOption } from '../producer';
import type { Session } from '../session';
import { type Item, liveSheets } from '../sheets';
import { cli, writeProduction } from '../strawberry';
import { ARMS, fileOf, type Paired, type Prepared } from './paired-arms';

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

/** A dream's production in the test's store, and the media id there of every image its pictures attach. */
export type Setup = { projectId: string; ids: Record<string, string>; media: Map<string, string> };

/**
 * What a store is given of a dream: its breakdown and look, its sketches (each the run drew keyed
 * `sketch:<id>` as its `mediaId`, none for one never drawn), its in-between pictures by the run's own ids,
 * and the story record its production is written with, where the harness writes it with one.
 */
export type DreamParts = { b: Breakdown; style: StyleOption; sheets: Item[]; ghosts: GhostPlan[]; rec?: RecordPlan };

/** One moment to draw: who and what it shows, its shot, and every image it attaches, by what each is. */
export type ToDraw = {
  /** Its id in the test, for its mock-up's file. */
  id: string;
  moment: string;
  name: string;
  /** Who and what it shows, as its plan has it. */
  frame?: NonNullable<Item['frame']>;
  /** Its shot in the plan, whose node its mock-up goes on. */
  shot?: string;
  /** Every image it attaches: `sketch:p1`, `picture:m3`, `ghost:g1` (the run's own id), `previs:m5`. */
  keys: string[];
  /** Its mock-up, rendered from its floor plan. */
  previs?: { png: Uint8Array; key: string };
};

/**
 * One dream written into the test's store as the dream chat writes it (writeProduction), then
 * everything its pictures attach put in and approved as the run approved it: every sketch (selected, as
 * its asset's reference), the in-between pictures and earlier moments (approved, never selected), and
 * each mock-up on its shot, as the harness puts in a previs (written into `previsDir` first).
 *
 * Each moment to draw is recorded as drawn from no earlier moment (`reason` says why): the engine
 * refuses a moment whose recorded sources lack an approved take it could only have with the judge's
 * facts, and the earlier pictures are imported here without them; what each is drawn from is in its
 * references. Its cast leaves out whoever has no sketch, as the harness records it. The records go
 * first: a record changes a moment's definition, and a take approved before it would be stale.
 */
export async function setUpDream(
  s: Session,
  d: DreamParts,
  drawn: ToDraw[],
  opts: { media: string; previsDir: string; reason: string },
): Promise<Setup> {
  const { projectId, ids } = await writeProduction(d.b, d.style, renderTranscript(s.transcript), d.rec);
  const media = new Map<string, string>();
  const file = (key: string) => fileOf(s, key, opts.media);
  const oldToKey = Object.fromEntries(Object.entries(s.production?.result?.ids ?? {}).map(([k, v]) => [v, k]));
  const dreamer = d.b.people.find((x) => x.is_dreamer)?.id;
  const sketched = new Set(d.sheets.filter((i) => i.mediaId).map((i) => i.id));
  const kept = (id: string) => sketched.has(id) && !!ids[id];
  for (const x of drawn) {
    const f = x.frame;
    if (!f) continue;
    await liveSheets.record?.(ids[x.moment], {
      fields: {
        continuity_from: [],
        visible_cast: seenIn(f, dreamer)
          .filter(kept)
          .map((id) => ids[id]),
        required_props: f.things.filter(kept).map((id) => ids[id]),
        ...(kept(f.place) ? {} : { location_id: null }),
      },
      source: ids.proposal,
      reason: opts.reason,
    });
  }
  const verdict = (x?: { review?: string }) =>
    x?.review === 'approved' ? 'approved by the person there' : 'shown to the person there, who let it stand';
  const put = async (key: string, node: string, label: string) =>
    ((await call('import_media', { node_id: node, path: file(key), label })) as { id: string }).id;

  // Every sketch the run drew, so each asset in a moment has its selected reference.
  for (const it of d.sheets) {
    const node = ids[it.id];
    if (!it.mediaId || !node || !file(it.mediaId)) continue;
    const id = await put(it.mediaId, node, `Sketch from ${s.id}: ${it.name}`);
    await liveSheets.review({
      mediaId: id,
      nodeId: node,
      approved: true,
      author: 'assistant',
      decision: `The sketch the dream chat drew of ${it.isDreamer ? 'the dreamer' : it.name} in ${s.id}, ${verdict(s.build?.items.find((x) => x.id === it.id))}.`,
      depicted: [node],
    });
    media.set(it.mediaId, id);
  }
  const keys = new Set(drawn.flatMap((x) => x.keys));
  for (const key of keys) {
    const [kind, pid] = key.split(':');
    if (!file(key)) continue;
    if (kind === 'ghost') {
      const g = d.ghosts.find((x) => x.id === pid);
      const node = g ? ids[g.of] : undefined;
      if (!g || !node) continue;
      const id = await put(key, node, `In-between picture from ${s.id}: ${g.label}`);
      const req = ids[ghostKey(g)];
      await liveSheets.review({
        mediaId: id,
        nodeId: node,
        approved: true,
        author: 'assistant',
        decision: `The in-between picture the dream chat drew in ${s.id}: ${g.label}.`,
        depicted: [node],
        ...(req ? { requirementIds: [req] } : {}),
        select: false,
      });
      media.set(key, id);
    } else if (kind === 'picture') {
      const f = s.build?.frames?.find((x) => x.id === pid);
      const node = ids[pid];
      if (!f || !node) continue;
      const id = await put(key, node, `Picture from ${s.id}: ${pid}`);
      await liveSheets.review({
        mediaId: id,
        nodeId: node,
        approved: true,
        author: 'assistant',
        decision: `The picture the dream chat drew of ${pid} in ${s.id}, ${verdict(f)}.`,
        depicted: (f.depicted ?? []).map((old) => ids[oldToKey[old] ?? '']).filter((x): x is string => !!x),
        select: false,
      });
      media.set(key, id);
    }
  }
  for (const x of drawn) {
    const shot = x.shot ? ids[`shot_${x.shot.replace(/[^a-z0-9]+/gi, '_')}`] : undefined;
    if (!x.previs || !shot) continue;
    const png = join(opts.previsDir, `${x.id}.png`);
    mkdirSync(dirname(png), { recursive: true });
    writeFileSync(png, x.previs.png);
    media.set(`previs:${x.moment}`, await liveSheets.layout!(shot, png, `Previs: ${x.name}`));
  }
  return { projectId, ids, media };
}

/** The paired test's dream in its store: each moment's three arms' images, and its mock-up. */
export async function setUp(
  s: Session,
  p: Prepared,
  drawn: { id: string; moment: string; paired: Paired }[],
  opts: { media: string; previsDir: string },
): Promise<Setup> {
  return setUpDream(
    s,
    { b: p.b, style: p.style, sheets: p.sheets, ghosts: p.plan.ghosts },
    drawn.map((d) => ({
      id: d.id,
      moment: d.moment,
      name: d.paired.name,
      frame: p.pictures.get(d.moment)?.frame,
      shot: p.plan.cuts.find((c) => c.id === d.moment)?.shot,
      keys: ARMS.flatMap((a) => d.paired.arms[a].images.map((im) => im.key)),
      previs: d.paired.previs,
    })),
    { ...opts, reason: 'Drawn three ways for a paired test; what each is drawn from is in its references' },
  );
}
