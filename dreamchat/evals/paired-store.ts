// The engine's side of evals/paired.ts: one saved dream written into the test's own Strawberry store,
// with everything its arms attach put in and approved there, so each arm's picture can be prepared,
// approved and queued as the harness does for a moment. Load it only after the store is set
// (DREAMCHAT_STRAWBERRY_HOME): the engine's modules read it when they load.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ghostKey, seenIn } from '../continuity';
import { renderTranscript } from '../jev';
import type { Session } from '../session';
import { liveSheets } from '../sheets';
import { cli, writeProduction } from '../strawberry';
import { ARMS, fileOf, type Paired, type Prepared } from './paired-arms';

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

/** A dream's production in the test's store, and the media id there of every image its arms attach. */
export type Setup = { projectId: string; ids: Record<string, string>; media: Map<string, string> };

/**
 * One dream written into the test's store as the dream chat writes it (writeProduction), then
 * everything its arms attach put in and approved as the run approved it: every sketch (selected, as
 * its asset's reference), the in-between pictures and earlier moments (approved, never selected), and
 * each mock-up on its shot, as the harness puts in a previs (written into `previsDir` first).
 *
 * Each moment to draw is recorded as drawn from no earlier moment: its three arms are drawn from
 * different pictures, and the engine refuses a moment whose recorded sources lack an approved take
 * it could only have with the judge's facts. Its cast leaves out whoever has no sketch, as the
 * harness records it. The records go first: a record changes a moment's definition, and a take
 * approved before it would be stale.
 */
export async function setUp(
  s: Session,
  p: Prepared,
  drawn: { id: string; moment: string; paired: Paired }[],
  opts: { media: string; previsDir: string },
): Promise<Setup> {
  const { projectId, ids } = await writeProduction(p.b, p.style, renderTranscript(s.transcript));
  const media = new Map<string, string>();
  const file = (key: string) => fileOf(s, key, opts.media);
  const oldToKey = Object.fromEntries(Object.entries(s.production?.result?.ids ?? {}).map(([k, v]) => [v, k]));
  const dreamer = p.b.people.find((x) => x.is_dreamer)?.id;
  const sketched = new Set(p.sheets.filter((i) => i.mediaId).map((i) => i.id));
  const kept = (id: string) => sketched.has(id) && !!ids[id];
  for (const d of drawn) {
    const f = p.pictures.get(d.moment)?.frame;
    if (!f) continue;
    await liveSheets.record?.(ids[d.moment], {
      fields: {
        continuity_from: [],
        visible_cast: seenIn(f, dreamer)
          .filter(kept)
          .map((id) => ids[id]),
        required_props: f.things.filter(kept).map((id) => ids[id]),
        ...(kept(f.place) ? {} : { location_id: null }),
      },
      source: ids.proposal,
      reason: 'Drawn three ways for a paired test; what each is drawn from is in its references',
    });
  }
  const verdict = (x?: { review?: string }) =>
    x?.review === 'approved' ? 'approved by the person there' : 'shown to the person there, who let it stand';
  const put = async (key: string, node: string, label: string) =>
    ((await call('import_media', { node_id: node, path: file(key), label })) as { id: string }).id;

  // Every sketch the run drew, so each asset in a moment has its selected reference.
  for (const it of p.sheets) {
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
  const keys = new Set(drawn.flatMap((d) => ARMS.flatMap((a) => d.paired.arms[a].images.map((im) => im.key))));
  for (const key of keys) {
    const [kind, pid] = key.split(':');
    if (!file(key)) continue;
    if (kind === 'ghost') {
      const g = p.plan.ghosts.find((x) => x.id === pid);
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
  for (const d of drawn) {
    const cut = p.plan.cuts.find((c) => c.id === d.moment);
    const shot = cut ? ids[`shot_${cut.shot.replace(/[^a-z0-9]+/gi, '_')}`] : undefined;
    if (!d.paired.previs || !shot) continue;
    const png = join(opts.previsDir, `${d.id}.png`);
    mkdirSync(dirname(png), { recursive: true });
    writeFileSync(png, d.paired.previs.png);
    media.set(`previs:${d.moment}`, await liveSheets.layout!(shot, png, `Previs: ${d.paired.name}`));
  }
  return { projectId, ids, media };
}
