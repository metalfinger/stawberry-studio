// Whether each figure and thing is drawn at the size the dream's words give it, and still in the picture and in its
// words (the one builder's `sizes`): every saved dream rebuilt with the full profile and its readings, with the step
// before it and with it. For each moment with a camera: how many of its figures are drawn at a size of their own; how
// many of the people and creatures its one thing to show names are in the picture (some of them in its mock-up's
// frame); and how many it shows that its words lose, said neither in the picture nor outside it. Drawn at their literal
// size the little silver fish at their desks and the terrier once fell out of the words, and a cat as big as a bus hid
// the child beside it (30 Sep); the ants of the Shrinking Hand were a man on the kitchen counter (2 Oct).
//
//   bun run evals/sizes.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS } from '../cleanups';
import { facesNeeded, shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import { rebuild } from '../plan';
import { inFrame } from '../previs';
import type { Session } from '../session';
import { withCast } from './cast-cache';
import { withImplied } from './implied-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const args = process.argv.slice(2);
const live = args.includes('--live');
const list = args.includes('--list');
const dirs = args.flatMap((a, i) => (a === '--dir' ? [args[i + 1]] : []));
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const before = BUILDER_STEPS[BUILDER_STEPS.indexOf('sizes') - 1];

const sources: { id: string; load: () => Promise<Session> }[] = [];
const saved = async (id: string, isLive: boolean) => {
  let s = structuredClone(loadDream(id, isLive).session) as Session;
  s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session;
  s = (await withTyped(s)).session;
  return (await withCast(s)).session;
};
for (const id of frozenDreams()) sources.push({ id, load: () => saved(id, false) });
if (live)
  for (const d of liveDreams(dataDir()))
    if (!d.id.includes('/') && !sources.some((x) => x.id === d.id))
      sources.push({ id: d.id, load: () => saved(d.id, true) });
// An imported dream's readings are its own (importer.ts): read as it is saved.
for (const dir of dirs)
  for (const f of readdirSync(join(dir, 'state')).filter((x) => /^dream-.*\.json$/.test(x)))
    sources.push({
      id: f.replace(/\.json$/, ''),
      load: async () => JSON.parse(readFileSync(join(dir, 'state', f), 'utf8')) as Session,
    });

type Count = { moments: number; sized: number; named: number; inPicture: number; lostWords: number };
const zero = (): Count => ({ moments: 0, sized: 0, named: 0, inPicture: 0, lostWords: 0 });
const total = { before: zero(), after: zero() };
/** Which cuts have a camera, with the step before and with it: one that loses its camera is listed. */
const eyed = { before: new Set<string>(), after: new Set<string>() };
const out: string[] = [];

async function measure(s: Session, step: string, into: Count, id: string): Promise<void> {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  process.env.DREAMCHAT_ONE_BUILDER = step;
  try {
    // Its readings are on it as loaded; the record takes the sizes only with the step.
    let r: ReturnType<typeof rebuild>;
    try {
      r = rebuild(s);
    } catch {
      return;
    }
    for (const c of r.plan.cuts) {
      if (!c.eye) continue;
      eyed[step === 'on' ? 'after' : 'before'].add(`${id.slice(-4)} ${c.id}`);
      const m = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === c.id);
      const plan = shotPlan(r.b, c.id, r.rec);
      if (!m || !plan) continue;
      into.moments++;
      into.sized += plan.spots.filter((x) => x.height).length;
      for (const p of facesNeeded(r.b, m)) {
        into.named++;
        const f = inFrame(plan, c.eye, p);
        if ((c.sees ?? []).includes(p) || (f && f.height > 0)) into.inPicture++;
        else if (step === 'on') out.push(`${id.slice(-4)} ${c.id} ${p}: not in the picture`);
      }
      const words = c.view ?? '';
      for (const p of m.visible) {
        const who = r.b.people.find((x) => x.id === p);
        if (!who || who.is_dreamer || !plan.spots.some((x) => x.id === p)) continue;
        if ((c.sees ?? []).includes(p) || (c.outside ?? []).includes(p)) continue;
        const named = new RegExp(
          `\\b${who.name.replace(/^(the|a|an|my|your)\s+/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          'i',
        );
        if (named.test(words)) continue;
        into.lostWords++;
        if (step === 'on') out.push(`${id.slice(-4)} ${c.id} ${p} (${who.name}): in view, in none of its words`);
      }
    }
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

for (const { id, load } of sources) {
  let s: Session;
  try {
    s = await load();
  } catch {
    continue;
  }
  if (!s.draft?.breakdown || !s.style) continue;
  await measure(s, before, total.before, id);
  await measure(s, 'on', total.after, id);
}
for (const k of eyed.before) if (!eyed.after.has(k)) out.push(`${k}: no camera with the step`);
console.log(JSON.stringify({ dreams: sources.length, step: before, ...total }));
if (list) for (const l of out) console.log(`  ${l}`);
