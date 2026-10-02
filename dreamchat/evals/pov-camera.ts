// Whether every cut through the dreamer's own eyes on a placed scene has a camera (the one builder's `eyes_aimed`): every
// saved dream rebuilt with the full profile and its readings, and each such cut whose scene has a floor plan with the
// dreamer on it counted, and listed where it has no eye. Through the dreamer's eyes, a camera was kept only where what
// they look at shows in its working render: the laptop on the dining table under the water and the tiny building with
// a party inside never did, and the cut was "failed", never drawn (the merged flow's Fan m8 and Shrunk m6, 2 Oct).
//
//   bun run evals/pov-camera.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jevWithModel } from '../jev';
import { rebuild } from '../plan';
import { shotPlan } from '../continuity';
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

const sessions: { id: string; load: () => Promise<Session | null> }[] = [];
const saved = async (id: string, isLive: boolean) => {
  let s = structuredClone(loadDream(id, isLive).session) as Session;
  s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session;
  s = (await withTyped(s)).session;
  return (await withCast(s)).session;
};
for (const id of frozenDreams()) sessions.push({ id, load: () => saved(id, false) });
if (live)
  for (const d of liveDreams(dataDir()))
    if (!d.id.includes('/') && !sessions.some((x) => x.id === d.id))
      sessions.push({ id: d.id, load: () => saved(d.id, true) });
// An imported dream's readings are its own (importer.ts): read as it is saved.
for (const dir of dirs)
  for (const f of readdirSync(join(dir, 'state')).filter((x) => /^dream-.*\.json$/.test(x)))
    sessions.push({
      id: f.replace(/\.json$/, ''),
      load: async () => JSON.parse(readFileSync(join(dir, 'state', f), 'utf8')) as Session,
    });

let cuts = 0;
let none = 0;
const out: string[] = [];
for (const { id, load } of sessions) {
  let s: Session | null;
  try {
    s = await load();
  } catch {
    continue;
  }
  if (!s?.draft?.breakdown || !s.style) continue;
  let r: ReturnType<typeof rebuild>;
  try {
    r = rebuild(s);
  } catch {
    continue;
  }
  const dreamer = r.b.people.find((p) => p.is_dreamer)?.id;
  for (const c of r.plan.cuts) {
    const m = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === c.id);
    if (!m || m.eyes !== 'dreamer' || !dreamer) continue;
    const plan = shotPlan(r.b, c.id, r.rec);
    if (!plan?.spots.some((sp) => sp.id === dreamer)) continue;
    cuts++;
    if (c.eye) continue;
    none++;
    out.push(`${id.slice(-4)} ${c.id} [${m.distance}] looks at ${m.looks_at ?? '-'} | ${m.visual_point ?? ''}`);
  }
}
console.log(JSON.stringify({ dreams: sessions.length, cuts, noCamera: none }));
if (list) for (const l of out) console.log(`  ${l}`);
