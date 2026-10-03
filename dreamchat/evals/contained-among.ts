// Whether a thing a moment's words put in, among or inside something that holds things is in it on the moment's
// floor plan (the one builder's `contained` and `contained_among`): every saved dream rebuilt with the full profile and
// its readings, with the step before and with it. Read here on its own: a cast thing is to be in a container where one
// sentence of the moment's words (or the cast reading's word of where it is) names the thing, a container of the
// place's that closes, and in, into, inside, within, among or amongst, in any order; it is in it where it stands within
// the container's footprint. The merged flow's Grandmother (2 Oct): "puts the stamp into her open cutlery drawer, among
// the knives and forks", and the knives and forks a cube mid-room.
//
//   bun run evals/contained-among.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Spot } from '../blocking';
import { BUILDER_STEPS } from '../cleanups';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import { CLOSING } from '../partstate';
import { rebuild } from '../plan';
import type { Session } from '../session';
import { withCast, withDevicesCached } from './cast-cache';
import { withImplied } from './implied-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const args = process.argv.slice(2);
const live = args.includes('--live');
const list = args.includes('--list');
const dirs = args.flatMap((a, i) => (a === '--dir' ? [args[i + 1]] : []));
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const before = BUILDER_STEPS[BUILDER_STEPS.indexOf('contained_among') - 1];

const sources: { id: string; load: () => Promise<Session> }[] = [];
const add = (id: string, load: () => Promise<Session>) => {
  if (!sources.some((x) => x.id === id)) sources.push({ id, load });
};
const saved = async (id: string, isLive: boolean) => {
  let s = structuredClone(loadDream(id, isLive).session) as Session;
  s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session;
  s = (await withTyped(s)).session;
  return (await withDevicesCached((await withCast(s)).session)).session;
};
for (const id of frozenDreams()) add(id, () => saved(id, false));
if (live) for (const d of liveDreams(dataDir())) if (!d.id.includes('/')) add(d.id, () => saved(d.id, true));
for (const dir of dirs)
  for (const f of readdirSync(join(dir, 'state')).filter((x) => /^dream-.*\.json$/.test(x)))
    add(f.replace(/\.json$/, ''), async () => JSON.parse(readFileSync(join(dir, 'state', f), 'utf8')) as Session);

const last = (name: string) => (name.toLowerCase().match(/[a-z]+/g) ?? []).at(-1) ?? '';
const IN = /\b(?:in|into|inside|within|among|amongst)\b/;
/** Where one sentence of these words names the thing, the container and a word of being in it, in any order. */
const named = (words: string, thing: string, container: string) =>
  words
    .toLowerCase()
    .split(/(?<=[.;!?])\s+/)
    .some(
      (x) => IN.test(x) && new RegExp(`\\b${last(thing)}\\b`).test(x) && new RegExp(`\\b${last(container)}\\b`).test(x),
    );
/**
 * In it: resting in it (`above`, below its top), at a size it holds, within its footprint or where a drawer is pulled
 * out to (its own depth toward the room at most). A clock on the wall beside a cupboard is not in it.
 */
const within = (t: Spot, c: Spot) => {
  const [w, d, h] = c.size ?? [0.5, 0.5, 0.5];
  return (
    t.above !== undefined &&
    t.above <= h &&
    Math.max(...(t.size ?? [1, 1, 1])) <= Math.max(w, d, h) &&
    Math.hypot(t.x - c.x, t.y - c.y) <= Math.hypot(w, d) / 2 + d + 0.05
  );
};
/** The cast reading's word of where a thing is, naming a container: in it, by its own word. */
const sideNames = (side: string, container: string) =>
  IN.test(side.toLowerCase()) && new RegExp(`\\b${last(container)}\\b`).test(side.toLowerCase());

type Count = { cuts: number; errors: number; named: number; inside: number; outside: number; unnamedInside: number };
const zero = (): Count => ({ cuts: 0, errors: 0, named: 0, inside: 0, outside: 0, unnamedInside: 0 });
const total = { before: zero(), after: zero() };
const out: string[] = [];

function measure(s: Session, step: string, into: Count, id: string): void {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  process.env.DREAMCHAT_ONE_BUILDER = step;
  const side = (step === 'on' ? 'after' : 'before').padEnd(6);
  try {
    let r: ReturnType<typeof rebuild>;
    try {
      r = rebuild(s);
    } catch {
      into.errors++;
      return;
    }
    const cast = (s.draft?.readings as { cast?: { things?: { id: string; side?: string | null }[] } } | undefined)
      ?.cast;
    const sideOf = new Map((cast?.things ?? []).map((t) => [t.id, t.side ?? '']));
    for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
      into.cuts++;
      const plan = shotPlan(r.b, p.id, r.rec);
      const m = r.b.scenes.flatMap((x) => x.moments).find((x) => x.id === p.id);
      if (!plan || !m) continue;
      const words = `${m.action}. ${m.visual_point ?? ''}`;
      const containers = plan.spots.filter(
        (c) => c.kind !== 'person' && !c.many && !c.heldBy && !!c.name && new RegExp(`^${CLOSING}$`).test(last(c.name)),
      );
      for (const t of plan.spots.filter((x) => x.kind === 'thing' && !x.fixture && !x.heldBy && !!x.name)) {
        const c = containers.find(
          (c) => c.id !== t.id && (named(words, t.name!, c.name!) || sideNames(sideOf.get(t.id) ?? '', c.name!)),
        );
        if (!c) {
          // In a container nothing names it in: what the step would have put in by mistake.
          const holder = containers.find((x) => x.id !== t.id && within(t, x));
          if (holder) {
            into.unnamedInside++;
            out.push(
              `${side} ${id} ${p.id}: ${t.id} "${t.name}" in ${holder.id} "${holder.name}", named in it nowhere`,
            );
          }
          continue;
        }
        into.named++;
        if (within(t, c)) into.inside++;
        else {
          into.outside++;
          out.push(
            `${side} ${id} ${p.id}: ${t.id} "${t.name}" at (${t.x}, ${t.y}), outside ${c.id} "${c.name}" at (${c.x}, ${c.y})`,
          );
        }
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
  measure(s, before, total.before, id);
  measure(s, 'on', total.after, id);
}
console.log(JSON.stringify({ dreams: sources.length, step: before, ...total }));
if (list) for (const l of out.sort()) console.log(`  ${l}`);
