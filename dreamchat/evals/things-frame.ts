// Whether each moment's camera holds the things its one thing to show names (the one builder's `things_in_frame`):
// every saved dream rebuilt with the full profile and its readings, with the step before it and with it. For every
// cut with a camera, each thing or fixture its point names, by its name or by what a change has made it ("the stamp"
// of the bed sheet folded down to one): in the picture, or said outside it. "The grandmother laying the stamp among the
// knives and forks in her cutlery drawer" said the stamp "outside the picture, off to the right" (the merged flow's
// fresh Grandmother, m9, 2 Oct). And each person the point names, so a frame placed for a thing loses no one.
//
//   bun run evals/things-frame.ts [--live] [--dir <a dreamchat data folder>]... [--list]
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
const STEP = 'things_in_frame';
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
for (const dir of dirs)
  for (const f of readdirSync(join(dir, 'state')).filter((x) => /^dream-.*\.json$/.test(x)))
    sources.push({
      id: f.replace(/\.json$/, ''),
      load: async () => JSON.parse(readFileSync(join(dir, 'state', f), 'utf8')) as Session,
    });

const low = (x: string) =>
  ` ${x
    .toLowerCase()
    .replace(/[^\p{L}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')} `;
const ARTICLE = /^(?:the|a|an|my|your|his|her|their|its|some)\s+/;
/** What a name is about, by this eval's own reading: its last word before "of", "in", "with" … or a comma. */
const headOf = (name: string) =>
  name
    .toLowerCase()
    .split(
      /,|\s(?:of|in|with|on|at|from|by|for|that|which|who|across|below|above|behind|beside|near|under|over|along|through|outside)\s/,
    )[0]
    .match(/\p{L}+/gu)
    ?.at(-1) ?? '';
/** Whether the point names something: its whole name, or its head word, a whole word; never in "the size of". */
const names = (point: string, name: string) => {
  const w = low(point.replace(/\bthe size of [^,;.]*/gi, ''));
  const whole = name.toLowerCase().replace(ARTICLE, '').trim();
  const head = headOf(name);
  return (whole.length > 2 && w.includes(` ${whole} `)) || (head.length > 2 && w.includes(` ${head} `));
};

type Count = {
  cuts: number;
  things: number;
  held: number;
  saidOutside: number;
  people: number;
  peopleHeld: number;
  errors: number;
};
const zero = (): Count => ({ cuts: 0, things: 0, held: 0, saidOutside: 0, people: 0, peopleHeld: 0, errors: 0 });
const total = { before: zero(), after: zero() };
const views = { before: new Map<string, string>(), after: new Map<string, string>() };
/** Each cut's camera and the people it holds, with the step before and with it: a person traded for a thing is listed. */
const held = {
  before: new Map<string, { eye: boolean; people: string[] }>(),
  after: new Map<string, { eye: boolean; people: string[] }>(),
};
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
    const people = new Map(r.b.people.filter((p) => !p.is_dreamer).map((p) => [p.id, p.name]));
    for (const c of r.plan.cuts) {
      views[side].set(`${id} ${c.id}`, `${JSON.stringify(c.eye ?? null)} ${c.view ?? ''}`);
      held[side].set(`${id} ${c.id}`, {
        eye: !!c.eye,
        people: (c.sees ?? []).filter((x) => r.b.people.some((p) => p.id === x)),
      });
      const m = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === c.id);
      const plan = c.eye ? shotPlan(r.b, c.id, r.rec) : undefined;
      if (!m || !plan || !c.eye || !m.visual_point) continue;
      into.cuts++;
      const point = m.visual_point;
      // What each thing is called now, by the latest change of what it is or how big: "a tiny stamp".
      const nows = new Map<string, string[]>();
      for (const st of [...c.own, ...c.states])
        if (/^\s*(?:size|form|shape|whole|kind|self)\s*$/i.test(st.what))
          nows.set(st.who, [
            ...(nows.get(st.who) ?? []),
            st.now.replace(/^(?:now\s+)?(?:the size of|as \w+ as)\s+/i, ''),
          ]);
      for (const sp of plan.spots) {
        const name =
          sp.kind === 'person' || sp.many ? undefined : (things.get(sp.id) ?? (sp.fixture ? sp.name : undefined));
        if (!name || sp.heldBy) continue;
        if (![name, ...(nows.get(sp.id) ?? [])].some((n) => names(point, n))) continue;
        into.things++;
        // In the picture, or said in it as what someone stands, sits or rides on ("standing on the steel ladder").
        const inWords = (c.view ?? '')
          .split(/(?<=\.)\s+/)
          .filter((x) => !/^Outside the picture/i.test(x))
          .some((x) => new RegExp(`\\b(?:on|in|at) (?:the |a |an )?(?:[\\w'-]+ )?${headOf(name)}\\b`, 'i').test(x));
        const held = (c.sees ?? []).includes(sp.id) || inWords;
        const outsideSaid = new RegExp(`Outside the picture[^.]*\\b${headOf(name)}\\b`, 'i').test(c.view ?? '');
        into.held += Number(held);
        into.saidOutside += Number(outsideSaid);
        if (!held)
          out.push(
            `${side.padEnd(6)} ${id} ${c.id} ${sp.id} (${name})${outsideSaid ? ', said outside' : ''}: not in the picture | ${point}`,
          );
      }
      // Held things are in their holders' hands: the people the point names, held still.
      for (const [pid, name] of people) {
        if (!plan.spots.some((x) => x.id === pid) || !names(point, name)) continue;
        into.people++;
        const held = (c.sees ?? []).includes(pid);
        into.peopleHeld += Number(held);
        if (!held) out.push(`${side.padEnd(6)} ${id} ${c.id} ${pid} (${name}): a person it names, not in the picture`);
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
// A cut that is an edit with the step, or has a camera only with it; and each person a camera held before and not after.
let editNow = 0;
let cameraNow = 0;
let peopleTraded = 0;
for (const [k, a] of held.before) {
  const b = held.after.get(k);
  if (!b) continue;
  if (a.eye && !b.eye) {
    editNow++;
    out.push(`an edit with the step: ${k}`);
  }
  if (!a.eye && b.eye) {
    cameraNow++;
    out.push(`a camera with the step: ${k}`);
  }
  if (a.eye && b.eye)
    for (const p of a.people.filter((x) => !b.people.includes(x))) {
      peopleTraded++;
      out.push(`a person out of the picture with the step: ${k} ${p}`);
    }
}
console.log(
  JSON.stringify({
    dreams: sources.length,
    step: before,
    ...total,
    cutsMoved: moved,
    editNow,
    cameraNow,
    peopleTraded,
  }),
);
if (list) for (const l of out.sort()) console.log(`  ${l}`);
