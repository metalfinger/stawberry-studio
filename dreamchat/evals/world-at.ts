// The world's state at each cut (resolvers.ts worldAt, the packet contract's `world_at`): how much of what each cut has
// is resolved, attribute by attribute, and where a value says other than the floor plan the picture is drawn from. Every
// saved dream rebuilt with the full profile and its readings. Present, location (with above and what someone rides),
// held by, inside of, open (with its part) and facing, in the order the kitchen slice's checks read them.
//
// What is due comes from the frame and the plan, never from the resolvers: present for each one the story record has
// at the moment; a location for each person and thing the frame has in view that the record has there and the plan has
// out of anyone's hands, in the plan's own frame and at its coordinates; what someone rides, for each one the plan seats
// on a vehicle; held by for each thing the record or the plan has in someone's hands, the record's holder, else the
// plan's; inside of for each thing the plan places in what holds it; open for each fixture the plan has open; facing for
// each person the frame has in view, as the plan has it. Against the plan: gone and on it; held by other hands than the
// plan's; inside something it is not placed in; open where the plan has it shut, or shut where it is open; a value other
// than the plan's. And two readings of one attribute that disagree.
//
//   bun run evals/world-at.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Spot } from '../blocking';
import { shotPlan } from '../continuity';
import type { WorldValue } from '../contract';
import { jevWithModel } from '../jev';
import { rebuild } from '../plan';
import { worldOf } from '../resolvers';
import { planKey } from '../packet';
import { onOf, shapeOf } from '../previs';
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

const ATTRS = ['present', 'location', 'rides', 'held_by', 'inside_of', 'open', 'facing'] as const;
type Tally = { due: number; resolved: number };
const tally = () =>
  Object.fromEntries(ATTRS.map((a) => [a, { due: 0, resolved: 0 } as Tally])) as Record<(typeof ATTRS)[number], Tally>;
const total = {
  cuts: 0,
  errors: 0,
  values: 0,
  coverage: tally(),
  against: { goneOnPlan: 0, heldOther: 0, notInside: 0, openAgainst: 0, wrongValue: 0, conflicts: 0 },
  presentOffPlan: 0,
  inViewNotInRecord: 0,
};
const out: string[] = [];
const isPerson = (s: Spot) => s.kind === 'person' || (!s.kind && (!!s.pose || !!s.many));
/** Placed in it: resting in it below its top, within its footprint or where a drawer is pulled out to. */
const within = (t: Spot, c: Spot) => {
  const [w, d, h] = c.size ?? [0.5, 0.5, 0.5];
  return t.above !== undefined && t.above <= h && Math.hypot(t.x - c.x, t.y - c.y) <= Math.hypot(w, d) / 2 + d + 0.05;
};

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
    total.errors++;
    continue;
  }
  const record = r.dream?.record;
  for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
    total.cuts++;
    const m = record?.moments.find((x) => x.id === p.id);
    const plan = shotPlan(r.b, p.id, r.rec);
    if (!m || !plan) continue;
    let world: WorldValue[];
    let conflicts: string[];
    try {
      ({ values: world, conflicts } = worldOf(r, p.id));
    } catch (e) {
      total.errors++;
      out.push(`${id} ${p.id}: error ${String(e).slice(0, 120)}`);
      continue;
    }
    total.values += world.length;
    total.against.conflicts += conflicts.length;
    for (const c of conflicts) out.push(`${id} ${p.id}: two readings disagree, ${c}`);
    const of = (entity: string, attr: string) => world.filter((v) => v.entity === entity && v.attr === attr);
    const spot = (eid: string) => plan.spots.find((x) => x.id === eid);
    const due = (attr: (typeof ATTRS)[number], ok: boolean, what: string) => {
      total.coverage[attr].due++;
      if (ok) total.coverage[attr].resolved++;
      else out.push(`${id} ${p.id}: ${attr} unresolved for ${what}`);
    };
    const wrong = (what: string) => {
      total.against.wrongValue++;
      out.push(`${id} ${p.id}: ${what}`);
    };
    const there = new Set([...m.shows, ...m.present]);
    // Present: every one the record has at the moment (what present is, by its definition).
    for (const e of new Set([...m.shows, ...m.present, ...m.gone])) due('present', of(e, 'present').length > 0, e);
    for (const v of world.filter((x) => x.attr === 'present')) {
      if (v.value === false && spot(v.entity)) {
        total.against.goneOnPlan++;
        out.push(`${id} ${p.id}: ${v.entity} gone, on the plan`);
      }
      if (v.value === true && !spot(v.entity)) total.presentOffPlan++;
    }
    // Location, by what the frame has in view: each person and thing on the plan, out of anyone's hands, where the plan
    // has it, in the plan's own frame.
    const key = planKey(r.b, p.id);
    for (const e of new Set([...(p.item.frame?.visible ?? []), ...(p.item.frame?.things ?? [])])) {
      const sp = spot(e);
      if (!sp || sp.heldBy) continue;
      if (!there.has(e)) {
        total.inViewNotInRecord++;
        continue;
      }
      const v = of(e, 'location')[0];
      due('location', !!v, e);
      const at = v?.value as { place: string; x: number; y: number; above?: number } | undefined;
      if (at && (at.place !== key || at.x !== sp.x || at.y !== sp.y || at.above !== sp.above))
        wrong(
          `${e} at ${JSON.stringify(at)}, the plan ${key} has (${sp.x}, ${sp.y}${sp.above !== undefined ? `, ${sp.above}` : ''})`,
        );
    }
    // Rides: each one there the plan seats on a vehicle.
    for (const e of there) {
      const sp = spot(e);
      const on = sp && !sp.heldBy ? onOf(sp, plan) : undefined;
      if (!on || shapeOf(on.t, plan) !== 'vehicle') continue;
      const v = of(e, 'rides')[0];
      due('rides', !!v, e);
      if (v && (v.value as { on: string }).on !== on.t.id)
        wrong(`${e} rides ${JSON.stringify(v.value)}, the plan ${on.t.id}`);
    }
    // Held by: each thing the record or the plan has in someone's hands; the record's holder, else the plan's; in more
    // than one pair of hands at once (`shared_holds`), every one of them, as the record has them.
    const hands = (x: { heldBy?: string; heldWith?: string[] } | undefined) =>
      x?.heldBy ? (x.heldWith?.length ? [x.heldBy, ...x.heldWith] : x.heldBy) : undefined;
    for (const thing of new Set([
      ...Object.keys(m.held),
      ...plan.spots.filter((x) => x.heldBy && x.kind !== 'person').map((x) => x.id),
    ])) {
      const v = of(thing, 'held_by');
      due('held_by', v.length > 0, thing);
      const want = m.hands?.[thing] ?? m.held[thing] ?? hands(spot(thing));
      if (v.length && JSON.stringify(v[0].value) !== JSON.stringify(want))
        wrong(`${thing} held by ${JSON.stringify(v[0].value)}, want ${JSON.stringify(want)}`);
      const sp = spot(thing);
      if (v.length && sp?.heldBy && JSON.stringify(hands(sp)) !== JSON.stringify(v[0].value)) {
        total.against.heldOther++;
        out.push(
          `${id} ${p.id}: ${thing} held by ${JSON.stringify(v[0].value)}, on the plan by ${JSON.stringify(hands(sp))}`,
        );
      }
    }
    // Inside of: each thing the plan places in what holds it; and what it is said in, it is placed in.
    for (const t of plan.spots.filter((x) => x.kind === 'thing' && !x.fixture && !x.heldBy)) {
      const holder = plan.spots.find((c) => c.id !== t.id && c.fixture && within(t, c));
      if (holder && t.above !== undefined && (t.size ?? [1])[0] < 0.5)
        due('inside_of', of(t.id, 'inside_of').length > 0, t.id);
    }
    for (const v of world.filter((x) => x.attr === 'inside_of')) {
      const t = spot(v.entity);
      const c = spot(String(v.value));
      if (!t || !c || !within(t, c)) {
        total.against.notInside++;
        out.push(`${id} ${p.id}: ${v.entity} inside ${v.value}, not placed in it`);
      }
    }
    // Open: each fixture the plan has open, as open; one the plan has shut, never said open.
    for (const f of plan.spots.filter((x) => x.fixture && x.open)) due('open', of(f.id, 'open').length > 0, f.id);
    for (const v of world.filter((x) => x.attr === 'open' && x.part === null)) {
      const f = spot(v.entity);
      if (f?.fixture && !!f.open !== (v.value === true)) {
        total.against.openAgainst++;
        out.push(`${id} ${p.id}: ${v.entity} open ${v.value}, the plan has it ${f.open ? 'open' : 'shut'}`);
      }
    }
    // Facing: each person the frame has in view, on the plan and turned to someone or somewhere: as the plan has it.
    for (const e of p.item.frame?.visible ?? []) {
      const sp = spot(e);
      if (!sp || sp.many || !sp.faces || !there.has(e) || !isPerson(sp)) continue;
      const v = of(e, 'facing')[0];
      due('facing', !!v, e);
      if (v && v.value !== sp.faces) wrong(`${e} facing ${v.value}, the plan ${sp.faces}`);
    }
  }
}
const share = (t: Tally) => (t.due ? `${t.resolved}/${t.due}` : '0/0');
console.log(
  JSON.stringify({
    dreams: sources.length,
    cuts: total.cuts,
    errors: total.errors,
    values: total.values,
    coverage: Object.fromEntries(ATTRS.map((a) => [a, share(total.coverage[a])])),
    against: total.against,
    presentOffPlan: total.presentOffPlan,
    inViewNotInRecord: total.inViewNotInRecord,
  }),
);
if (list) for (const l of out.sort()) console.log(`  ${l}`);
