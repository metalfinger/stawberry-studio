// The world's state at a cut, each attribute resolved once, where the rebuild already decides it (the packet contract's
// `world_at`, docs/packet-contract.md): present from the story record; location from the moment's floor plan (with how
// high it rests and what someone rides), in that plan's metres; held by from the record, else the plan; inside of by
// the reading the placement puts a cast thing in by (castplace.ts containerFor); open from the record's state of each
// part and the plan's open fixtures, on the fixture the part is (continuity.ts fixtureOfPart); facing from the plan. A
// value says who decided it (`by`) and how (`basis`); none quotes the dreamer's words yet, so none reads as said. Read in
// the order the kitchen slice's checks read them; gaze and count follow.
import type { Blocking, Spot } from './blocking';
import { castThings, containerFor } from './castplace';
import type { CastReading } from './cast-types';
import { fixtureOfPart, shotPlan } from './continuity';
import type { Basis, DreamPacket8, WorldValue } from './contract';
import { planKey } from './packet';
import { stateOfNow } from './partstate';
import type { Rebuilt } from './plan';
import { onOf, shapeOf } from './previs';
import { factsAt } from './record';

const value = (
  entity: string,
  attr: WorldValue['attr'],
  v: unknown,
  by: string,
  basis: Basis,
  part: string | null = null,
): WorldValue => ({ entity, part, attr, value: v, basis, by, quote: null, confidence: null, event: null });

/** Where the writer's floor plan has a spot by a cut: its scene's plan, moved as the writer moves it up to the cut. */
function writerAt(r: Rebuilt, cut: string, id: string): { x: number; y: number } | undefined {
  const scene = r.b.scenes.find((sc) => sc.moments.some((m) => m.id === cut));
  const moment = scene?.moments.find((m) => m.id === cut);
  if (!scene?.blocking || !moment) return undefined;
  const plan: Blocking = scene.blocking.places?.[moment.place] ?? scene.blocking;
  let at: { x: number; y: number } | undefined = plan.spots.find((s) => s.id === id);
  for (const m of scene.moments.slice(0, scene.moments.indexOf(moment) + 1))
    for (const mv of plan.moves?.[m.id] ?? []) if (mv.id === id) at = { x: mv.x, y: mv.y };
  return at;
}

/**
 * Who decided where a spot is: the writer's floor plan where it stands where the writer put it; else the code that
 * placed or moved it, by what it is (a cast thing, a cast fixture, a device), or the plan's own settling.
 */
function placedBy(r: Rebuilt, cut: string, s: Spot): { by: string; basis: Basis } {
  const at = writerAt(r, cut, s.id);
  if (at && Math.hypot(at.x - s.x, at.y - s.y) <= 0.01) return { by: 'writer.blocking', basis: 'read' };
  if (/^cf\d/.test(s.id)) return { by: 'code.castplace.fixtures', basis: 'derived' };
  if (/^c\d/.test(s.id)) return { by: 'code.castplace', basis: 'derived' };
  if (/^v\d/.test(s.id)) return { by: 'code.devices', basis: 'derived' };
  return { by: 'code.plan', basis: 'derived' };
}

/** A cut's world, and where two readings of one attribute said other than each other (the first is kept). */
export type World = { values: WorldValue[]; conflicts: string[] };

/**
 * Everything resolved of the world at a cut: one value of each attribute of each part of each one. Present comes from
 * the story record alone; with no floor plan for the cut, nothing else. Where two readings of one attribute disagree,
 * the first is kept and the disagreement listed: the record's before the plan's.
 */
export function worldOf(r: Rebuilt, cut: string): World {
  const record = r.dream?.record;
  const m = record?.moments.find((x) => x.id === cut);
  const out: World = { values: [], conflicts: [] };
  if (!record || !m) return out;
  const kept = new Map<string, WorldValue>();
  const add = (v: WorldValue) => {
    const k = `${v.entity}|${v.part ?? ''}|${v.attr}`;
    const was = kept.get(k);
    if (!was) {
      kept.set(k, v);
      out.values.push(v);
    } else if (JSON.stringify(was.value) !== JSON.stringify(v.value))
      out.conflicts.push(`${k}: ${JSON.stringify(was.value)} (${was.by}) against ${JSON.stringify(v.value)} (${v.by})`);
  };

  // Present: what the moment shows, what is there besides, and who its words say is gone.
  for (const e of m.shows) add(value(e, 'present', true, 'record.shows', 'read'));
  for (const e of m.present) add(value(e, 'present', true, 'record.present', 'derived'));
  for (const e of m.gone) add(value(e, 'present', false, 'record.gone', 'read'));
  const plan = shotPlan(r.b, cut, r.rec);
  if (!plan) return out;
  const spot = (id: string) => plan.spots.find((s) => s.id === id);
  const there = new Set([...m.shows, ...m.present]);
  // The floor plan the coordinates are in: `<scene>/<place>`, as the packet's places name it.
  const place = planKey(r.b, cut) ?? '-';

  // Location, with how high it rests: each one there, out of anyone's hands; and the vehicle someone rides.
  for (const e of there) {
    const s = spot(e);
    if (!s || s.heldBy) continue;
    const { by, basis } = placedBy(r, cut, s);
    add(
      value(e, 'location', { place, x: s.x, y: s.y, ...(s.above !== undefined ? { above: s.above } : {}) }, by, basis),
    );
    const on = onOf(s, plan);
    if (on && shapeOf(on.t, plan) === 'vehicle')
      add(value(e, 'rides', { on: on.t.id, how: on.how }, 'code.previs.onOf', 'derived'));
  }

  // Held by: the record's, as the prompt says it; a thing the plan has in someone's hands the record does not, the
  // plan's. In more than one pair of hands at once (`shared_holds`), every one of them, in order: handed over, the one
  // handing it, then the one given it; held together, its holder first.
  const hands = m.hands ?? {};
  for (const [thing, by] of Object.entries(m.held))
    add(value(thing, 'held_by', hands[thing]?.length ? hands[thing] : by, 'record.held', 'read'));
  for (const s of plan.spots)
    if (s.heldBy && s.kind !== 'person')
      add(value(s.id, 'held_by', s.heldWith?.length ? [s.heldBy, ...s.heldWith] : s.heldBy, 'plan.heldBy', 'derived'));

  // Inside of: what holds a cast thing, by the reading its placement put it in by, among what was there before it.
  const cast = (r.dream as { cast?: CastReading } | undefined)?.cast;
  const mo = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === cut);
  const words = mo ? [mo.action, mo.visual_point ?? ''].join('. ') : '';
  // By the ids placement gives them (castplace.ts castThings).
  const things = cast ? castThings(cast) : [];
  const castIds = things.map((x) => x.id);
  for (const { id, t } of things) {
    const s = spot(id);
    if (!s || s.heldBy) continue;
    // As placement saw them: the plan's own, and the cast things placed before this one.
    const before = plan.spots.filter((x) => !castIds.includes(x.id) || castIds.indexOf(x.id) < castIds.indexOf(id));
    const c = containerFor(t, cut, words, before);
    if (c) add(value(id, 'inside_of', c.id, 'code.castplace.containerFor', 'derived'));
  }

  // Open: each part the record has open or shut, on the fixture it is where the plan has one, and each thing shut
  // whole; then each fixture the plan has open the record does not speak of.
  for (const nowOf of factsAt(record, cut)) {
    for (const f of nowOf.facts) {
      const state = f.kind === 'part' ? stateOfNow(f.now) : f.kind === 'shut' ? 'closed' : null;
      if (state !== 'open' && state !== 'closed') continue;
      const part = f.kind === 'part' ? f.part : f.kind === 'shut' ? (f.part ?? '') : '';
      const what = f.kind === 'part' ? f.what : part;
      const fixture = nowOf.kind === 'place' && part ? fixtureOfPart(plan, part, what) : undefined;
      const basis: Basis = f.kind === 'part' ? (f.implied ? 'implied' : 'read') : 'derived';
      const by = f.kind === 'part' ? 'record.state' : 'record.shut';
      if (fixture) add(value(fixture.id, 'open', state === 'open', by, basis));
      else add(value(nowOf.of, 'open', state === 'open', by, basis, part || null));
    }
  }
  for (const s of plan.spots) if (s.fixture && s.open) add(value(s.id, 'open', true, 'continuity.withOpen', 'derived'));

  // Facing: whom or where each one there is turned to on the plan.
  for (const s of plan.spots) {
    if (!there.has(s.id) || !s.faces || s.many || !(s.kind === 'person' || (!s.kind && !!s.pose))) continue;
    add(
      value(
        s.id,
        'facing',
        s.faces,
        s.attending ? 'continuity.withAttention' : 'writer.blocking',
        s.attending ? 'derived' : 'read',
      ),
    );
  }
  return out;
}

/** The world at a cut, its values alone (`worldOf`). */
export const worldAt = (r: Rebuilt, cut: string): WorldValue[] => worldOf(r, cut).values;

/**
 * A version 8 packet with the world's state at each cut filled from the rebuild it was written from (`world_at`, basis
 * `derived`): only Dream Chat writes it so. A version 7 packet a harness turns into version 8 keeps it null, basis
 * `unknown`, and a check that needs it holds the cut; so does a cut the story record says nothing of.
 */
export function withWorld(pk: DreamPacket8, r: Rebuilt): DreamPacket8 {
  return {
    ...pk,
    cuts: pk.cuts.map((c) => {
      const world = worldAt(r, c.identity.cut);
      if (!world.length) return c;
      return {
        ...c,
        contract: { ...c.contract, world_at: world, basis: { ...c.contract.basis, world_at: 'derived' } },
      };
    }),
  };
}
