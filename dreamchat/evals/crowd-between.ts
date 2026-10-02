// Whether someone a moment's one thing to show sees past a crowd is seen past it (the one builder's `crowd_between`):
// every saved dream rebuilt with the full profile and its readings, with the step before it and with it. For each
// moment whose point says someone is seen past, through, between or behind the people of a crowd: whether the crowd
// stands across the line from the camera to them on the floor plan, whether both are in the picture, and whether its
// words say the crowd first. Every other cut's camera and words are compared too: none should move. "The man in the
// wheelchair glimpsed past the people pressing in" had the people sat in rows at the far end of the hall, the man
// alone and in clear view across it (the merged flow's Train, dream 3 m2, 2 Oct).
//
//   bun run evals/crowd-between.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Blocking, facing, rightOf, type Spot } from '../blocking';
import { BUILDER_STEPS } from '../cleanups';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import { rebuild } from '../plan';
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
const STEP = 'crowd_between';
const before = BUILDER_STEPS[BUILDER_STEPS.indexOf(STEP) - 1];

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

/**
 * The moments read by hand as someone seen past the people of a crowd: every other cut that moves with the step is a
 * fault. Its own reading below lists every moment whose words could say so, for reading by hand.
 */
const LABELLED: Record<string, { who: string; crowd: string }> = {
  'dream-1001-170658-1a4c m2': { who: 'p2', crowd: 'p3' },
  'dream-1001-181621-c3b3 m6': { who: 'p5', crowd: 'p6' },
};

const PAST = /\b(?:past|through|between|beyond|behind|over the heads of)\s+(.{0,60})$/i;
const low = (x: string) =>
  x
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** What a name is about: its last word before any "in", "with", "on" … ("the man in the wheelchair" is a man). */
const headOf = (name: string) =>
  low(name)
    .split(/ (?:in|with|on|at|of|from|by|by the) /)[0]
    .split(' ')
    .pop() ?? '';

/**
 * This eval's own reading of a case, apart from the step's: in the point, a crowd of the plan named (or "them", where
 * the plan has one crowd) after "past", "through", "between", "beyond" or "behind", and before it someone else named.
 */
function caseOf(point: string, plan: Blocking, people: Map<string, string>, eyesOf: string | undefined) {
  const crowds = plan.spots.filter((s) => s.many && people.has(s.id));
  if (!crowds.length) return undefined;
  const words = low(point);
  for (const cut of words.split(/\b(?=past |through |between |beyond |behind |over the heads of )/)) {
    const m = PAST.exec(cut);
    if (!m) continue;
    const after = ` ${m[1]} `;
    const crowd =
      crowds.find((s) => after.includes(` ${headOf(people.get(s.id)!)} `)) ??
      (crowds.length === 1 && /^ (them|the crowd|the people) /.test(after) ? crowds[0] : undefined);
    if (!crowd) continue;
    const head = words.slice(0, words.indexOf(cut));
    const who = plan.spots.find(
      (s) => !s.many && s.id !== eyesOf && people.has(s.id) && ` ${head} `.includes(` ${headOf(people.get(s.id)!)} `),
    );
    if (who) return { who: who.id, crowd: crowd.id };
  }
  return undefined;
}

/** Whether a crowd's ground stands across the line from the camera to someone, short of them. */
function across(eye: { x: number; y: number }, to: Spot, crowd: Spot, plan: Blocking): boolean {
  const len = Math.hypot(to.x - eye.x, to.y - eye.y);
  if (len < 0.5) return false;
  const d = { x: (to.x - eye.x) / len, y: (to.y - eye.y) / len };
  const f = facing(crowd, plan);
  const r = rightOf(f);
  const [w, deep] = crowd.spread ?? [4, 3];
  // Walk the line: any point of it, short of them, inside the crowd's ground.
  for (let t = 0.3; t < len - 0.4; t += 0.1) {
    const p = { x: eye.x + d.x * t - crowd.x, y: eye.y + d.y * t - crowd.y };
    if (Math.abs(p.x * r.x + p.y * r.y) <= w / 2 && Math.abs(p.x * f.x + p.y * f.y) <= deep / 2) return true;
  }
  return false;
}

type Count = { cases: number; between: number; whoIn: number; crowdIn: number; saidFirst: number };
const zero = (): Count => ({ cases: 0, between: 0, whoIn: 0, crowdIn: 0, saidFirst: 0 });
const total = { before: zero(), after: zero() };
/** Each cut's camera and words, with the step before and with it: a cut not a case that moves is listed. */
const views = { before: new Map<string, string>(), after: new Map<string, string>() };
const cases = new Set<string>();
const out: string[] = [];

function measure(s: Session, step: string, into: Count, id: string): void {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  process.env.DREAMCHAT_ONE_BUILDER = step;
  const side = step === 'on' ? 'after' : 'before';
  try {
    let r: ReturnType<typeof rebuild>;
    try {
      r = rebuild(s);
    } catch {
      return;
    }
    const people = new Map(r.b.people.map((p) => [p.id, p.name]));
    const dreamer = r.b.people.find((p) => p.is_dreamer)?.id;
    for (const c of r.plan.cuts) {
      const key = `${id} ${c.id}`;
      views[side].set(key, `${JSON.stringify(c.eye ?? null)} ${c.view ?? ''}`);
      const m = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === c.id);
      const plan = c.eye ? shotPlan(r.b, c.id, r.rec) : undefined;
      if (!m || !plan || !c.eye) continue;
      const read = caseOf(m.visual_point ?? '', plan, people, m.eyes === 'dreamer' ? dreamer : undefined);
      if (read && !LABELLED[key] && side === 'after')
        out.push(`not labelled, read as a case: ${key} (${m.visual_point})`);
      const k = LABELLED[key];
      if (!k) continue;
      cases.add(key);
      into.cases++;
      const who = plan.spots.find((x) => x.id === k.who)!;
      const crowd = plan.spots.find((x) => x.id === k.crowd)!;
      const between = across(c.eye.at, who, crowd, plan);
      const whoIn = (c.sees ?? []).includes(k.who);
      const crowdIn = (c.sees ?? []).includes(k.crowd);
      // In what it lists, after the sentence that says where the camera looks ("toward the man in the wheelchair").
      const view = low((c.view ?? '').slice((c.view ?? '').indexOf('. ') + 2));
      const at = (x: string) => view.indexOf(headOf(people.get(x)!));
      const saidFirst = at(k.crowd) >= 0 && at(k.who) >= 0 && (at(k.crowd) < at(k.who) || /\bseen past\b/.test(view));
      into.between += Number(between);
      into.whoIn += Number(whoIn);
      into.crowdIn += Number(crowdIn);
      into.saidFirst += Number(saidFirst);
      out.push(
        `${side.padEnd(6)} ${key} ${k.who} past ${k.crowd} (${m.eyes ?? 'outside'}): between ${between}, ${k.who} in ${whoIn}, crowd in ${crowdIn}, crowd said first ${saidFirst}`,
      );
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
  measure(s, before, total.before, id);
  measure(s, 'on', total.after, id);
}
let moved = 0;
for (const [k, v] of views.before)
  if (!cases.has(k) && views.after.get(k) !== v) {
    moved++;
    out.push(`moved, not a case: ${k}`);
  }
for (const k of views.after.keys()) if (!views.before.has(k)) out.push(`new cut with the step: ${k}`);
console.log(JSON.stringify({ dreams: sources.length, step: before, ...total, otherCutsMoved: moved }));
if (list) for (const l of out.sort()) console.log(`  ${l}`);
