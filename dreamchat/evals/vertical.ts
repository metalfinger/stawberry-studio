// What a vertical frame costs the staging (DREAMCHAT_FRAME=9:16): every saved dream rebuilt with the full profile and
// its readings, in 16:9 and in 9:16, and for every moment with a camera, who the camera has in the picture each way.
// A 9:16 frame's width is its short side, so a camera fits fewer people across: a moment that loses someone it held in
// 16:9 is listed, with who, and how many moments' lenses were pushed to their widest (14mm) to hold everyone.
//
//   bun run evals/vertical.ts [--live]
import './local-env';
import { jevWithModel } from '../jev';
import { rebuild } from '../plan';
import type { Session } from '../session';
import { withCast } from './cast-cache';
import { withImplied } from './implied-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const live = process.argv.includes('--live');
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const ids: { id: string; live: boolean }[] = frozenDreams().map((id) => ({ id, live: false }));
if (live)
  for (const d of liveDreams(dataDir()))
    if (!d.id.includes('/') && !ids.some((x) => x.id === d.id)) ids.push({ id: d.id, live: true });

type Seen = Map<string, { people: string[]; lens: number | undefined }>;
const camerasOf = (s: Session, frame: string | undefined): Seen => {
  const was = process.env.DREAMCHAT_FRAME;
  try {
    if (frame === undefined) delete process.env.DREAMCHAT_FRAME;
    else process.env.DREAMCHAT_FRAME = frame;
    const r = rebuild(s);
    const people = new Set(r.b.people.map((p) => p.id));
    return new Map(
      r.plan.cuts
        .filter((c) => c.eye)
        .map((c) => [c.id, { people: (c.sees ?? []).filter((id) => people.has(id)), lens: c.eye?.lens }]),
    );
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_FRAME;
    else process.env.DREAMCHAT_FRAME = was;
  }
};

let moments = 0;
let losing = 0;
let widest = [0, 0];
const lost: string[] = [];
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
  const wide = camerasOf(s, undefined);
  const tall = camerasOf(s, '9:16');
  for (const [m, a] of wide) {
    const b = tall.get(m);
    if (!b) continue;
    moments++;
    if (a.lens === 14) widest[0]++;
    if (b.lens === 14) widest[1]++;
    const gone = a.people.filter((p) => !b.people.includes(p));
    if (gone.length) {
      losing++;
      lost.push(`${id.slice(-4)} ${m}: ${gone.join(', ')} (lens ${a.lens ?? 24}mm → ${b.lens ?? 24}mm)`);
    }
  }
}
console.log(
  JSON.stringify({ dreams: ids.length, moments, losingSomeone: losing, at14mm: { wide: widest[0], tall: widest[1] } }),
);
for (const l of lost) console.log(`  ${l}`);
