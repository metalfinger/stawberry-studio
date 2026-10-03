// One thing for one thing on a place's floor plan (the one builder's `one_fixture`): a cast thing and the plan's fixture
// of its name are one, by the cast thing's id, so its own sketch is what is drawn; a fixture is named as plainly as the
// cast reading names it, never with the story things on it; and a place has the windows its words give it, no more.
// The merged flow's slice (3 Oct): the family meeting's floor plan had "the wall calendar" as fixture x2 while the cast
// had c1 "the wall calendar" with a sketch of its own, so the room was painted with one and the frame added another;
// its table was "the table with schedules and calendars", painting more copies of what the cast draws itself; her
// kitchen, whose words give one window over the sink, had three ("the window over the sink", and two "a window").
//
// What is due is read here on its own, from the plan's names, the frame's things and the place's words: two of one name
// (a thing the frame has in view whose name, articles and plural aside, is a plan fixture's of another id); a thing
// drawn twice, by a fixture named with it on it ("with") and by another spot of the plan (never what a fixture is made
// of, "the pile of paper boats", nor what only its name draws, "the window with rain and street lights"); more windows
// on a place's plan than its words give, where they give one ("a window", "the window"). The slice's two places
// labelled by hand. And every spot the step changes that no fault named, listed to be read.
//
//   bun run evals/one-fixture.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS } from '../cleanups';
import { placeWordsOf, shotPlan } from '../continuity';
import { castThings } from '../castplace';
import { jevWithModel } from '../jev';
import { planKey } from '../packet';
import { rebuild } from '../plan';
import type { Session } from '../session';
import { withCast, withDevicesCached } from './cast-cache';
import { withImplied } from './implied-cache';
import { PROFILE } from './profile';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const args = process.argv.slice(2);
const live = args.includes('--live');
const list = args.includes('--list');
const dirs = args.flatMap((a, i) => (a === '--dir' ? [args[i + 1]] : []));
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
Object.assign(process.env, PROFILE);
const STEP = 'one_fixture';
const before = BUILDER_STEPS.includes(STEP) ? BUILDER_STEPS[BUILDER_STEPS.indexOf(STEP) - 1] : undefined;

/** The slice, by hand: at each moment, how many of each it has, and by what id. */
const LABELS: Record<string, Record<string, { calendars?: string[]; windows?: number; table?: string }>> = {
  'dream-1003-024129-d5c3': {
    m1: { calendars: ['c1'], table: 'the table' },
    m4: { windows: 1 },
    m9: { windows: 1 },
  },
};

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

/** A name as the eval reads it: lower case, no article, each word as one of it. */
const bare = (x: string) =>
  x
    .toLowerCase()
    .replace(/^(?:the|a|an|some|her|his|their|my)\s+/, '')
    .split(/[^\p{L}-]+/u)
    .filter(Boolean)
    .map((w) => w.replace(/(?<=[^s])s$/, ''))
    .join(' ');
/** What a name is, before any word of where it is or what is with it: "window" of "the window over the sink". */
const head = (x: string) =>
  bare(x)
    .split(/\s+(?:over|above|under|below|with|of|on|in|by|beside|near|next|at|behind|full|covered)\s+/)[0]
    .split(' ')
    .at(-1) ?? '';
const WINDOW = /^window$/;
/** How many windows a place's words give: one where they say a window, many where windows; none, not counted. */
const windowsSaid = (words: string) => {
  if (/\bwindows\b/i.test(words)) return Infinity;
  const ones = words.match(/\b(?:a|the|one)\s+(?:\S+\s+){0,2}window\b/gi) ?? [];
  return ones.length > 1 ? Infinity : ones.length === 1 ? 1 : undefined;
};

type Tally = {
  cuts: number;
  errors: number;
  twoOfOne: number;
  carrying: number;
  windowsOver: number;
  places: number;
  labelled: number;
  labelledOk: number;
  /** Cuts whose fixtures (by id, name and where) the step changed, none of the faults above due there. */
  changedNotDue: number;
};

/** Each cut's fixtures, by id, name and where, on each side: what changed with the step is listed. */
const fixturesBy = new Map<string, string>();
/** By dream and floor plan, the spots a fault names: what changes there of them is explained, nothing else is. */
const dueAt = new Map<string, Set<string>>();
const loaded = new Set<string>();

async function side(step: string): Promise<{ t: Tally; out: string[] }> {
  const t: Tally = {
    cuts: 0,
    errors: 0,
    twoOfOne: 0,
    carrying: 0,
    windowsOver: 0,
    places: 0,
    labelled: 0,
    labelledOk: 0,
    changedNotDue: 0,
  };
  const out: string[] = [];
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  process.env.DREAMCHAT_ONE_BUILDER = step;
  try {
    for (const { id, load } of sources) {
      let s: Session;
      try {
        s = await load();
      } catch {
        continue;
      }
      if (!s.draft?.breakdown || !s.style) continue;
      let r: ReturnType<typeof rebuild>;
      try {
        r = rebuild(s);
      } catch {
        t.errors++;
        continue;
      }
      loaded.add(id);
      // Every thing of the dream by its name: the breakdown's, the cast's and the devices'.
      const names = new Map<string, string>();
      for (const x of r.b.things ?? []) names.set(x.id, x.name);
      // The cast's by the ids placement gives them (weather and matter no thing of the plan).
      for (const { id: c, t: x } of r.rec?.cast ? castThings(r.rec.cast) : []) names.set(c, x.name);
      for (const d of r.rec?.devices?.devices ?? []) names.set(d.id, d.name);
      const seenPlaces = new Set<string>();
      for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
        t.cuts++;
        const plan = shotPlan(r.b, p.id, r.rec);
        if (!plan) continue;
        try {
          const fixtures = plan.spots.filter((x) => x.fixture && x.name);
          const cutKey = `${id} ${p.id}`;
          const placeKey = `${id} place:${planKey(r.b, p.id) ?? p.id}`;
          const due = (...ids: string[]) => {
            if (step === 'on') return;
            const set = dueAt.get(placeKey) ?? new Set<string>();
            for (const x of ids) set.add(x);
            dueAt.set(placeKey, set);
          };
          // Two of one name: a thing in view and a fixture of its name with another id.
          for (const thing of p.item.frame?.things ?? []) {
            const name = names.get(thing);
            if (!name) continue;
            for (const f of fixtures)
              if (f.id !== thing && bare(f.name!) === bare(name)) {
                t.twoOfOne++;
                // The one thing by its id on the place's plan, in every moment there.
                due(f.id, thing);
                out.push(`${step} ${id} ${p.id}: ${thing} "${name}" and the plan's fixture ${f.id} "${f.name}"`);
              }
          }
          // A fixture named with another thing of the dream on it.
          for (const f of fixtures) {
            // What is on it ("with"), never what it is made of ("the pile of paper boats").
            const tail = bare(f.name!)
              .split(/\s+(?:with|full of|covered in|covered with|piled with|strewn with)\s+/)
              .slice(1)
              .join(' ');
            if (!tail) continue;
            // Drawn twice: what is on it is also a thing of the dream, in the frame or as its own spot on the plan (never
            // another fixture of the place: "the table covered in diaries and calendars" beside the wall calendar).
            const own = new Set([...(p.item.frame?.things ?? []), ...plan.spots.map((o) => o.id)]);
            const on = [...own]
              .filter((k) => k !== f.id && names.has(k))
              .map((k): [string, string] => [k, head(names.get(k)!)])
              .filter(([, h]) => h && new RegExp(`\\b${h}\\b`).test(tail));
            if (on.length) {
              t.carrying++;
              due(f.id);
              out.push(`${step} ${id} ${p.id}: fixture ${f.id} "${f.name}" carries ${on.map(([k]) => k).join(', ')}`);
            }
          }
          // More windows than the place's words give, once a place.
          const words = placeWordsOf(r.b, p.id);
          const said = windowsSaid(words);
          const windows = fixtures.filter((f) => WINDOW.test(head(f.name!)));
          const key = planKey(r.b, p.id) ?? p.id;
          if (!seenPlaces.has(key)) {
            seenPlaces.add(key);
            t.places++;
            if (said === 1 && windows.length > 1) {
              t.windowsOver++;
              due(...windows.map((w) => w.id));
              out.push(
                `${step} ${id} ${p.id}: ${windows.length} windows (${windows.map((w) => `${w.id} "${w.name}"`).join(', ')}), the words give one`,
              );
            }
          }
          // The slice, by hand.
          const label = LABELS[id]?.[p.id];
          if (label) {
            t.labelled++;
            const calendars = plan.spots
              .filter((x) => /\bcalendar\b/.test(bare(x.name ?? names.get(x.id) ?? '')))
              .map((x) => x.id);
            const table = fixtures.find((f) => head(f.name!) === 'table')?.name;
            const ok =
              (!label.calendars || JSON.stringify(calendars) === JSON.stringify(label.calendars)) &&
              (label.windows === undefined || windows.length === label.windows) &&
              (!label.table || table === label.table);
            if (ok) t.labelledOk++;
            else
              out.push(
                `${step} ${id} ${p.id}: labelled ${JSON.stringify(label)}, has calendars ${JSON.stringify(calendars)}, windows ${windows.length}, table "${table ?? ''}"`,
              );
          }
          // Everything on the plan but who is there, by id, name, where, size, height and kind: on the step's side, what
          // changed of spots no fault named is listed, to be read.
          const sig = plan.spots
            .filter((x) => x.kind !== 'person' && !x.many)
            .map(
              (x) =>
                `${x.id}|${x.name ?? ''}|${Math.round(x.x * 100) / 100},${Math.round(x.y * 100) / 100}|${JSON.stringify(x.size ?? null)}|${x.above ?? ''}|${x.kind ?? ''}|${x.fixture ? 'f' : ''}`,
            )
            .sort();
          if (step !== 'on') fixturesBy.set(cutKey, sig.join('\n'));
          else if (fixturesBy.has(cutKey)) {
            const was = new Set(fixturesBy.get(cutKey)!.split('\n').filter(Boolean));
            const now = new Set(sig);
            const named = dueAt.get(placeKey) ?? new Set<string>();
            const loose = (x: string) => !named.has(x.split('|')[0]);
            const gone = [...was].filter((x) => !now.has(x) && loose(x));
            const added = [...now].filter((x) => !was.has(x) && loose(x));
            if (gone.length || added.length) {
              t.changedNotDue++;
              out.push(
                `${step} ${cutKey}: changed, nothing due: gone ${gone.join(', ') || '-'}; new ${added.join(', ') || '-'}`,
              );
            }
          }
        } catch (err) {
          t.errors++;
          out.push(`${step} ${id} ${p.id}: error ${String(err).slice(0, 160)}`);
        }
      }
    }
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
  return { t, out };
}

const all: string[] = [];
for (const step of before ? [before, 'on'] : ['on']) {
  const { t, out } = await side(step);
  console.log(JSON.stringify({ step, dreams: sources.length, ...t }));
  all.push(...out);
}
// The slice labelled by hand, where it was not among the dreams read: said, never passed over.
for (const id of Object.keys(LABELS)) if (!loaded.has(id)) console.log(`labelled dream ${id} not read: run with --dir`);
if (list) for (const l of all.sort()) console.log(`  ${l}`);
