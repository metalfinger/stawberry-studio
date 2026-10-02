// Whether a thing is drawn as the story last left it (the one builder's `thing_state`): every saved dream rebuilt with
// the full profile and its readings, with the step before it and with it. For each cut with a floor plan, each thing
// it draws: (a) drawn at its old size while a change of its size holds ("the bed sheet, size now a stamp" a cloth two
// metres across on the plan); (b) drawn after a moment put it into something that closes (a drawer, a box, a pocket)
// and before any moment names it again; (c) drawn in a picture with a change of its look holding, its change not
// carried (its first sketch sent). Grandmother on Wednesdays (the merged flow, 2 Oct): the sheet folded down to a stamp
// and put in the cutlery drawer was a full-size cloth lying on the drawer in both moments after.
//
//   bun run evals/thing-state.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const STEP = 'thing_state';
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

/** This eval's own reading of something that closes, said put "in" or "into" it. */
const CLOSES =
  /\b(?:in|into|inside)\s+(?:the\s+|a\s+|an\s+|her\s+|his\s+|their\s+|my\s+|its\s+|your\s+)?(?:[\w'-]+\s+){0,2}(?:drawers?|box(?:es)?|chests?|cupboards?|cabinets?|closets?|pockets?|bags?|handbags?|envelopes?|tins?|safes?|trunks?|suitcases?|cases?|wardrobes?|lockers?|fridges?|purses?|wallets?|sacks?|sideboards?|desks?)\b/i;
/** Put or slid into it, by this eval's own verbs. */
const PUTS =
  /\b(?:put|puts|putting|plac\w+|tuck\w*|slip\w*|slid\w*|drop\w*|stuff\w*|lock\w*|hid\w*|stow\w*|fil(?:e|es|ed|ing)|goes|going|went|tucked)\b/i;
const SMALL_NOW =
  /\b(?:tiny|small|little|shrunk\w*|shrink\w*|miniature|stamps?|handkerchiefs?|hankies?|napkins?|coins?|pebbles?|marbles?|thimbles?|buttons?|matchbox(?:es)?|postage)\b/i;
const low = (x: string) => x.toLowerCase();
/** What a name is about: its last word before any "in", "with", "on" … ("the man in the wheelchair" is a man). */
const headOf = (name: string) =>
  low(name)
    .replace(/[^a-z' ]+/g, ' ')
    .split(/ (?:in|with|on|at|of|from|by) /)[0]
    .trim()
    .split(/\s+/)
    .pop() ?? '';

type Count = {
  drawn: number;
  sized: number;
  oldSize: number;
  putAway: number;
  hidden: number;
  uncarried: number;
  errors: number;
};
const zero = (): Count => ({ drawn: 0, sized: 0, oldSize: 0, putAway: 0, hidden: 0, uncarried: 0, errors: 0 });
const total = { before: zero(), after: zero() };
const views = { before: new Map<string, string>(), after: new Map<string, string>() };
/** Each cut's things on its floor plan, with the step before and with it; and those this eval reads as put away. */
const onPlan = { before: new Map<string, string[]>(), after: new Map<string, string[]>() };
const putAwaySaid = new Set<string>();
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
      into.errors++;
      return;
    }
    const things = new Map((r.b.things ?? []).map((t) => [t.id, t.name]));
    const moments = r.b.scenes.flatMap((sc) => sc.moments.map((m) => ({ m, scene: sc.id })));
    const order = new Map(moments.map((x, i) => [x.m.id, i]));
    const cuts = new Map(r.plan.cuts.map((c) => [c.id, c]));
    for (const c of r.plan.cuts) {
      views[side].set(`${id} ${c.id}`, `${JSON.stringify(c.eye ?? null)} ${c.view ?? ''}`);
      const here = moments.find((x) => x.m.id === c.id);
      const plan = c.eye ? shotPlan(r.b, c.id, r.rec) : undefined;
      if (!here || !plan) continue;
      const upTo = moments.filter((x) => order.get(x.m.id)! <= order.get(c.id)!);
      const carried = [...c.own, ...c.states];
      const drawn = plan.spots.filter((x) => things.has(x.id));
      onPlan[side].set(
        `${id} ${c.id}`,
        drawn.map((t) => t.id),
      );
      for (const t of drawn) {
        into.drawn++;
        const key = `${id} ${c.id} ${t.id} (${things.get(t.id)})`;
        // (a) Small now, by the latest change of its size before or at this moment, by this eval's own words.
        const changes = upTo
          .flatMap((x) => cuts.get(x.m.id)?.own ?? [])
          .filter((st) => st.who === t.id && /^\s*(?:size|form|shape|whole|kind)\s*$/i.test(st.what));
        const latest = changes.at(-1);
        const ended = latest?.key && r.rec?.ends[latest.key];
        const holds = latest && /^\s*size\s*$/i.test(latest.what) && !(ended && order.get(ended)! <= order.get(c.id)!);
        if (holds && SMALL_NOW.test(latest.now) && t.size) {
          into.sized++;
          if (Math.max(...t.size) > 0.45) {
            into.oldSize++;
            out.push(`${side.padEnd(6)} ${key}: size now "${latest!.now}", drawn ${t.size.join('×')} m`);
          }
        }
        // (b) Put into something that closes at an earlier moment of its scene, not named, said or moved since.
        const name = headOf(things.get(t.id)!);
        const nows = changes.map((st) => headOf(st.now)).filter(Boolean);
        const says = (x: (typeof moments)[number]) =>
          x.m.things.includes(t.id) ||
          [name, ...nows].some((w) => low(`${x.m.action} ${x.m.visual_point}`).includes(w));
        const scene = upTo.filter((x) => x.scene === here.scene);
        const away = scene
          .filter((x) => x.m.id !== c.id)
          .findLast(
            (x) =>
              x.m.things.includes(t.id) &&
              PUTS.test(`${x.m.action}. ${x.m.visual_point}`) &&
              CLOSES.test(`${x.m.action}. ${x.m.visual_point}`),
          );
        const since =
          !!away &&
          scene.some(
            (x) =>
              order.get(x.m.id)! > order.get(away.m.id)! &&
              (says(x) ||
                (r.b.scenes.find((sc) => sc.id === x.scene)?.blocking?.moves?.[x.m.id] ?? []).some(
                  (mv) => mv.id === t.id,
                )),
          );
        if (away && !since) {
          into.putAway++;
          putAwaySaid.add(`${id} ${c.id} ${t.id}`);
          out.push(`${side.padEnd(6)} ${key}: put away at ${away.m.id}, drawn`);
        }
        // (c) A change of its look holding here, not carried by the picture.
        const looks = upTo
          .flatMap((x) => cuts.get(x.m.id)?.own ?? [])
          .filter(
            (st) =>
              st.who === t.id && !(st.key && r.rec?.ends[st.key] && order.get(r.rec.ends[st.key])! <= order.get(c.id)!),
          );
        if (looks.length && (c.sees ?? []).includes(t.id) && !carried.some((st) => st.who === t.id)) {
          into.uncarried++;
          out.push(`${side.padEnd(6)} ${key}: "${looks.at(-1)!.what}: ${looks.at(-1)!.now}" holds, not carried`);
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
let moved = 0;
for (const [k, v] of views.before)
  if (views.after.get(k) !== v) {
    moved++;
    out.push(`moved ${k}`);
  }
// (d) Taken off the plan with the step, where this eval read no putting away: hidden wrongly.
for (const [k, was] of onPlan.before)
  for (const t of was)
    if (!(onPlan.after.get(k) ?? []).includes(t) && !putAwaySaid.has(`${k} ${t}`)) {
      total.after.hidden++;
      out.push(`after  ${k} ${t}: off the plan with the step, never read as put away`);
    }
console.log(JSON.stringify({ dreams: sources.length, step: before, ...total, cutsMoved: moved }));
if (list) for (const l of out.sort()) console.log(`  ${l}`);
