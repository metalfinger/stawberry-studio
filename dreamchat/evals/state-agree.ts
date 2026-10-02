// Whether a cut's packet agrees with its own point about the state of a part (the one builder's `point_state`): every
// saved dream rebuilt with the full profile and its readings, with the step before it and with it, each packet linted
// (packet.ts lintPacket): a part its point or action names in one state while its state, a check or a sentence of its
// prompt has it in the other. The merged flow's Grandmother said "the cutlery drawer closed beside her" at m10 while
// the drawer was carried open from m9, in its state, its check and its prompt, and all four takes were judged on the
// drawer (2 Oct). Its labelled set: m10's drawer closed in state and checks, m9's still open where the stamp goes in.
//
//   bun run evals/state-agree.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS } from '../cleanups';
import { jevWithModel } from '../jev';
import { dreamPacket, lintPacket } from '../packet';
import { stateOfNow, statedParts } from '../partstate';
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
const STEP = 'point_state';
const before = BUILDER_STEPS[BUILDER_STEPS.indexOf(STEP) - 1];

const sources: { id: string; load: () => Promise<Session> }[] = [];
const saved = async (id: string, isLive: boolean) => {
  let s = structuredClone(loadDream(id, isLive).session) as Session;
  s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session;
  return (await withTyped(s)).session;
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

/** Grandmother's cuts by their words, and the drawer's state each must have. */
const LABELLED: { says: RegExp; drawer: 'open' | 'closed' }[] = [
  { says: /\bcutlery drawer closed\b/i, drawer: 'closed' },
  { says: /\b(?:laying|lays|puts?)\b[^.]*\bcutlery drawer\b/i, drawer: 'open' },
];

type Count = {
  cuts: number;
  stated: number;
  contradictions: number;
  cutsContradicting: number;
  labelled: number;
  labelledRight: number;
  contained: number;
  containedOutside: number;
  openOnPlan: number;
  openDrawnShut: number;
  sketchesOpened: number;
  sketchesNotShut: number;
  castFixtures: number;
  flattened: number;
  errors: number;
};
const zero = (): Count => ({
  cuts: 0,
  stated: 0,
  contradictions: 0,
  cutsContradicting: 0,
  labelled: 0,
  labelledRight: 0,
  contained: 0,
  containedOutside: 0,
  openOnPlan: 0,
  openDrawnShut: 0,
  sketchesOpened: 0,
  sketchesNotShut: 0,
  castFixtures: 0,
  flattened: 0,
  errors: 0,
});
/** By this eval's own words: what holds things, where a thing may lie flat inside. */
const HOLDS =
  /\b(?:drawers?|box(?:es)?|chests?|cupboards?|cabinets?|bags?|pockets?|tins?|cases?|baskets?|bowls?|jars?|trunks?|suitcases?|wardrobes?|lockers?|envelopes?|purses?|wallets?|safes?|sideboards?)\b/i;
/** By this eval's own reading: what a name is, its last word before what it says of where ("the door to the garden"). */
const head = (x: string) =>
  (
    x
      .toLowerCase()
      .split(/\s+(?:of|to|with|into|onto|over|by|from|for|on|in|at|under|behind|beside|near|through)\s+/)[0]
      .match(/[a-z]+/g) ?? []
  )
    .at(-1)
    ?.replace(/s$/, '') ?? '';
/** What opens, by this eval's own words. */
const OPENS = /\b(drawer|door|gate|lid|cupboard|wardrobe|chest|box|cabinet|locker|hatch)(?:es|s)?\b/i;
const total = { before: zero(), after: zero() };
const prompts = { before: new Map<string, string>(), after: new Map<string, string>() };
const sketches = { before: new Map<string, string>(), after: new Map<string, string>() };
const states = { before: new Map<string, string>(), after: new Map<string, string>() };
const wordsOf = new Map<string, string>();
const out: string[] = [];

async function measure(raw: Session, step: string, into: Count, id: string): Promise<void> {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  process.env.DREAMCHAT_ONE_BUILDER = step;
  const side = step === 'on' ? 'after' : 'before';
  try {
    let pk: ReturnType<typeof dreamPacket>;
    try {
      // The cast read under each side's steps, as a fresh import reads it: the step before casts what the plan has.
      const s = (await withDevicesCached((await withCast(raw)).session)).session;
      pk = dreamPacket(rebuild(s), { dream: id, style: s.style!, history: () => [] });
    } catch {
      into.errors++;
      return;
    }
    for (const e of pk.elements) sketches[side].set(`${id} ${e.id}`, e.prompt);
    const lint = lintPacket(pk);
    into.contradictions += lint.length;
    into.cutsContradicting += new Set(lint.map((x) => x.split(':')[0])).size;
    for (const l of lint) out.push(`${side.padEnd(6)} ${id} ${l}`);
    // Each place's sketch: what its moments open (said open, or something put into it) is said shut in it.
    for (const e of pk.elements.filter((x) => x.kind === 'location')) {
      const atPlace = pk.cuts.filter((c) => c.who.inView.some((v) => v.id === e.id));
      const words = atPlace.map((c) => `${c.story.action}. ${c.story.point ?? ''}`).join(' ');
      // Open already as the place is first seen: its sketch may show it so.
      const first = atPlace[0] ? `${atPlace[0].story.action}. ${atPlace[0].story.point ?? ''}` : '';
      const openFirst = new Set(
        statedParts(first)
          .filter((x) => x.state === 'open' && !/\bopen(?:s|ed|ing)?\s+(?:the |a |her |his |their )?/i.test(first))
          .map((x) => x.head),
      );
      const opened = new Set<string>();
      for (const x of statedParts(words)) if (x.state === 'open' && OPENS.test(x.part)) opened.add(x.head);
      for (const m of words.matchAll(
        /\b(?:puts?|lays?|laying|places?|drops?|slips?|tucks?)\b[^.;]*?\b(?:into|in|inside)\s+(?:the |her |his |their |a )?(?:[a-z]+ ){0,2}?(drawer|cupboard|box|chest|wardrobe|cabinet|locker)s?\b/gi,
      ))
        opened.add(m[1].toLowerCase());
      const own = `${Object.values(e.look)
        .map((x) => x.value)
        .join(' ')} ${e.name}`.toLowerCase();
      for (const h of opened) {
        if (!new RegExp(`\\b${h}`).test(own) || openFirst.has(h)) continue;
        into.sketchesOpened++;
        // Said shut in the sentence that says what is shut, alone or with others ("the drawer and the oven are shut").
        const shutLine = e.prompt.split(/(?<=[.!?])\s+/).find((x) => /\b(?:is|are) shut\b/.test(x)) ?? '';
        if (!new RegExp(`\\b${h}(?:e?s)?\\b`, 'i').test(shutLine)) {
          into.sketchesNotShut++;
          out.push(
            `${side.padEnd(6)} ${id} ${e.id} (${e.name}): its ${h} opened by its moments, never said shut in its sketch`,
          );
        }
      }
    }
    for (const c of pk.cuts) {
      into.cuts++;
      states[side].set(
        `${id} ${c.identity.cut}`,
        JSON.stringify(
          (c.state.now ?? []).flatMap((n) =>
            n.facts.flatMap((f) =>
              f.kind === 'part'
                ? [`${n.called}'s ${f.what}: ${f.now}`]
                : f.kind === 'shut'
                  ? [`${n.called}${f.part ? `'s ${f.part}` : ''}: shut`]
                  : [],
            ),
          ),
        ),
      );
      wordsOf.set(`${id} ${c.identity.cut}`, `${c.story.action} | ${c.story.point ?? ''}`);
      const plan = c.camera.floorPlan;
      if (plan) {
        // A cast thing the plan has as a fixture already, by its whole name: two of one thing.
        for (const sp of plan.spots.filter((x) => /^c\d+$/.test(x.id) && x.name)) {
          const twin = plan.spots.find(
            (x) =>
              x.fixture &&
              x.name &&
              x.name.toLowerCase().replace(/^the /, '') === sp.name!.toLowerCase().replace(/^the /, ''),
          );
          if (twin) {
            into.castFixtures++;
            out.push(`${side.padEnd(6)} ${id} ${c.identity.cut}: ${sp.id} ${sp.name} beside the plan's own ${twin.id}`);
          }
        }
        // Flattened inside something that holds nothing: a thing lying flat in a field, a pond, a doorway.
        for (const sp of plan.spots.filter((x) => x.kind === 'thing' && x.above !== undefined && !x.fixture)) {
          const under = plan.spots.find(
            (x) =>
              x.id !== sp.id &&
              x.name &&
              Math.abs(x.x - sp.x) <= (x.size?.[0] ?? 1) &&
              Math.abs(x.y - sp.y) <= (x.size?.[1] ?? 1),
          );
          if (under && !HOLDS.test(under.name!) && (sp.size?.[2] ?? 1) < 0.1) {
            into.flattened++;
            out.push(`${side.padEnd(6)} ${id} ${c.identity.cut}: ${sp.name} flattened in ${under.name}`);
          }
        }
        const words = `${c.story.point ?? ''}. ${c.story.action}`.toLowerCase();
        // A thing the words put in, among or inside something on the plan: inside its footprint, no bigger than it.
        for (const sp of plan.spots.filter((x) => x.kind !== 'person' && !x.heldBy && !x.many && x.name)) {
          const h = head(sp.name!);
          // Only what holds things: a lamp in the reading room, a sofa in the street are where they are, not in it.
          for (const fx of plan.spots.filter(
            (x) => x.id !== sp.id && x.kind !== 'person' && x.name && HOLDS.test(head(x.name)),
          )) {
            const fh = head(fx.name!);
            if (!h || !fh || h === fh) continue;
            if (
              !new RegExp(
                `\\b${h}s?\\b[^.;]{0,40}?\\b(?:in|inside|into|within|among)\\s+(?:the |her |his |their |a |its )?(?:[a-z-]+ ){0,2}${fh}s?\\b`,
              ).test(words)
            )
              continue;
            into.contained++;
            const [fw, fd] = fx.size ?? [1, 1, 1];
            // In it: on its footprint, or in a drawer pulled out of it (no more than half a metre past it, raised).
            const pulled = sp.above !== undefined ? 0.5 : 0.01;
            const inside = Math.abs(sp.x - fx.x) <= fw / 2 + pulled && Math.abs(sp.y - fx.y) <= fd / 2 + pulled;
            const fits = (sp.size ?? [0.6, 0.6, 0.6]).every((v, i) => v <= (fx.size ?? [1, 1, 1])[i]);
            if (!inside || !fits) {
              into.containedOutside++;
              out.push(
                `${side.padEnd(6)} ${id} ${c.identity.cut}: ${sp.name} not in ${fx.name} (${inside ? 'too big' : 'outside it'})`,
              );
            }
            break;
          }
        }
        // A part its state has open, open on the plan: a mock-up drawing it shut contradicts it.
        for (const n of c.state.now ?? [])
          for (const f of n.facts)
            if (f.kind === 'part' && stateOfNow(f.now) === 'open' && OPENS.test(`${f.part} ${f.what}`)) {
              const h = head(f.what);
              const sp = plan.spots.find((x) => x.name && head(x.name) === h && x.kind !== 'person');
              if (!sp) continue;
              into.openOnPlan++;
              if (!sp.open) {
                into.openDrawnShut++;
                out.push(
                  `${side.padEnd(6)} ${id} ${c.identity.cut}: ${f.what} open in its state, ${sp.name} shut on its plan`,
                );
              }
            }
      }
      prompts[side].set(`${id} ${c.identity.cut}`, c.prompts['nano-banana-pro'].text);
      const words = `${c.story.point ?? ''}. ${c.story.action}`;
      into.stated += statedParts(words).length;
      // The labelled set: the drawer's state in the cut's state and checks.
      for (const l of LABELLED.filter((x) => x.says.test(words))) {
        into.labelled++;
        const facts = (c.state.now ?? []).flatMap((n) =>
          n.facts.filter((f) => f.kind === 'part' && /\bdrawer\b/i.test(`${f.part} ${f.what}`)),
        );
        const states = facts.map((f) => (f.kind === 'part' ? stateOfNow(f.now) : null));
        const asks = c.checks.criteria.flatMap((k) => statedParts(k.text).filter((x) => x.head === 'drawer'));
        const right =
          (l.drawer === 'closed' ? states.every((x) => x !== 'open') : states.includes('open')) &&
          asks.every((x) => x.state === l.drawer);
        into.labelledRight += Number(right);
        out.push(
          `${side.padEnd(6)} ${id} ${c.identity.cut}: the drawer wants ${l.drawer}; state ${JSON.stringify(states)}, checks ${JSON.stringify(asks.map((x) => x.state))}${right ? '' : ' WRONG'}`,
        );
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
  await measure(s, before, total.before, id);
  await measure(s, 'on', total.after, id);
}
let moved = 0;
for (const [k, v] of prompts.before)
  if (prompts.after.get(k) !== v) {
    moved++;
    out.push(`moved ${k}`);
  }
let sketchesMoved = 0;
for (const [k, v] of sketches.before)
  if (sketches.after.get(k) !== v) {
    sketchesMoved++;
    out.push(`sketch moved ${k}`);
  }
// Every state the steps change, with the cut's words: read by hand.
let statesMoved = 0;
for (const [k, v] of states.before)
  if (states.after.get(k) !== v) {
    statesMoved++;
    out.push(`state ${k}: ${v} -> ${states.after.get(k)} | ${wordsOf.get(k)}`);
  }
console.log(
  JSON.stringify({ dreams: sources.length, step: before, ...total, promptsMoved: moved, sketchesMoved, statesMoved }),
);
if (list) for (const l of out.sort()) console.log(`  ${l}`);
