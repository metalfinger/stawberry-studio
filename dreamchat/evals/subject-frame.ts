// Whether each moment's camera holds the people it is about (the one builder's `subject_in_frame`): every saved dream
// rebuilt with the full profile and its readings, and for every moment with a camera, each person the moment's action
// or its one thing to show names, and who is in it: out of the picture, or less than half of their height in its
// frame for its size (a close shot is a head and shoulders, a medium one from the waist, a wide one all of them), or their
// head out of it, is a subject lost. Leaning forward and looking down, the dreamer's view of old Ethan
// on the train held a seat-back and his knees (Train m1, the mock-up's A/B, 2 Oct). Also how many moments are on the
// widest lens (14mm).
//
//   bun run evals/subject-frame.ts [--live] [--list]
import './local-env';
import { jevWithModel } from '../jev';
import { rebuild } from '../plan';
import { facesNeeded, shotPlan } from '../continuity';
import { inFrame } from '../previs';
import type { Session } from '../session';
import { withCast } from './cast-cache';
import { withImplied } from './implied-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const live = process.argv.includes('--live');
const list = process.argv.includes('--list');
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const ids: { id: string; live: boolean }[] = frozenDreams().map((id) => ({ id, live: false }));
if (live)
  for (const d of liveDreams(dataDir()))
    if (!d.id.includes('/') && !ids.some((x) => x.id === d.id)) ids.push({ id: d.id, live: true });

let moments = 0;
let subjects = 0;
let lost = 0;
let at14 = 0;
const out: string[] = [];
for (const { id, live: isLive } of ids) {
  let s: Session;
  try {
    s = structuredClone(loadDream(id, isLive).session) as Session;
    s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session;
    s = (await withTyped(s)).session;
    s = (await withCast(s)).session;
  } catch {
    continue;
  }
  if (!s.draft?.breakdown || !s.style) continue;
  const r = rebuild(s);
  for (const c of r.plan.cuts) {
    if (!c.eye) continue;
    const m = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === c.id);
    const plan = shotPlan(r.b, c.id, r.rec);
    if (!m || !plan) continue;
    moments++;
    if (c.eye.lens === 14) at14++;
    // Whose face or presence its point needs: the people its words name, none for a hand, a held thing or an insert.
    const named = facesNeeded(r.b, m);
    for (const p of named) {
      subjects++;
      const f = inFrame(plan, c.eye, p);
      // Out of the picture only where none of them is in its frame either: the whale under the water beside the boat is
      // in no mock-up's picture and is drawn through the water.
      const outOf = !(c.sees ?? []).includes(p) && !(f && f.height > 0);
      // By the shot's size: a close shot is a head and shoulders, a medium one from the waist, a wide one all of them.
      const least = { close: 0, medium: 0.4, wide: 0.7 }[m.distance] ?? 0.5;
      const bad = outOf || !f || f.height < least || !f.head;
      if (bad) {
        lost++;
        out.push(
          `${id.slice(-4)} ${c.id} ${p}: ${outOf ? 'out of the picture' : `${Math.round((f?.height ?? 0) * 100)}% of their height in frame${f?.head ? '' : ', head out'}`} (${m.eyes}, lens ${c.eye.lens ?? 24}mm)`,
        );
      }
    }
  }
}
console.log(
  JSON.stringify({
    frame: process.env.DREAMCHAT_FRAME ?? '16:9',
    dreams: ids.length,
    moments,
    subjects,
    lost,
    at14mm: at14,
  }),
);
if (list) for (const l of out) console.log(`  ${l}`);
