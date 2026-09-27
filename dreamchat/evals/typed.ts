// The one-time typed reading of the saved moments (typed.ts; S6, HARNESS_PLAN.md): every moment read by the
// writer and checked by Jev, kept in runs/typed-cache.json, then counted and set beside the word lists S6
// retires, to show where each agrees with the typed facts and where not.
//
//   DREAMCHAT_WRITER=claude bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/typed.ts --label frozen
//   … --live                     every saved conversation and fake replay (as evals/corpus.ts --live)
//   … --only <dream>:<m>,<m> …   only these moments;   --dreams <id> …   only these dreams
//   … --concurrency 3            moments read at once;  --max-jev 3500   Jev calls asked, at most, in this run
//   … --no-ask                   the cache only (no model called): what S6 reads
//   … --show                     every moment's facts, taken or not, with Jev's answers
//   … --sample 40 --seed 1       a sample of taken facts across kinds, with the moment's words, to check by hand
//   … --implied-cache <file>     the implied readings the record is built with for the comparison (cache only)
//
// Writes runs/typed/<label>.json (every moment's reading) and <label>.txt (the report).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { goingIn, outThroughWindows, selfIn, handsIn, WATER, waterLevel } from '../camera';
import { withRetired, type Cleanup } from '../cleanups';
import type { Blocking } from '../blocking';
import { jevWithModel } from '../jev';
import { WRITER } from '../llm';
import { type Breakdown, completeViews, type Moment, moments as momentsOf } from '../producer';
import { factsAt, recordInputsOf, type StoryRecord, storyRecord } from '../record';
import type { Session } from '../session';
import {
  type Checked,
  levelWords,
  namer,
  takenOf,
  TYPED_KINDS,
  type TypedKind,
  type TypedMoment,
  type TypedReading,
} from '../typed';
import { withImplied } from './implied-cache';
import { JEV_MODEL } from './prompt-cases';
import { commitOf, DIR, type Dream, dataDir, frozenDreams, liveDreams, loadDream, readLive } from './saved';
import { cachedFns, type Counts, limiter, readTypedDream, TYPED_CACHE, TypedCache, typedWriter } from './typed-cache';

// ── the comparison with the word lists ───────────────────────────────────────────────────────────

/** One place a word list and the typed facts were set side by side: agree, disagree, or only one says it. */
export type Pairing = {
  at: string;
  list: string;
  typed: string;
  verdict: 'agree' | 'disagree' | 'list only' | 'typed only';
};

/** A moment's plan: its place's floor plan in its scene. */
export function planOf(b: Breakdown, m: Moment): Blocking | undefined {
  const scene = b.scenes.find((s) => s.moments.some((x) => x.id === m.id));
  return scene?.blocking?.places?.[m.place] ?? scene?.blocking;
}

/** What a record holds at a moment, as strings a second record can be set against. */
function snapOf(rec: StoryRecord, id: string) {
  const m = rec.moments.find((x) => x.id === id);
  const facts = new Set<string>();
  for (const x of factsAt(rec, id))
    for (const f of x.facts)
      facts.add(
        f.kind === 'part'
          ? `${x.of}|part|${f.part}|${f.now}`
          : f.kind === 'shut'
            ? `${x.of}|shut`
            : `${x.of}|held|${f.by}`,
      );
  return { shows: new Set(m?.shows ?? []), gone: new Set(m?.gone ?? []), present: new Set(m?.present ?? []), facts };
}

const minus = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => !b.has(x));
const OPEN = /\b(?:open|opened|ajar|unlocked)\b/i;
const FILL_MATTER = /\b(?:water|flood\w*|sea|tide|snow|sand|mud|fog|mist|smoke)\b/i;

/** The record's word lists, each with what it does at a moment set against the typed facts there. */
export const RECORD_LISTS: Cleanup[] = [
  'fills',
  'opens',
  'shut_away',
  'not_there',
  'self',
  'state_verb',
  'taken',
  'holds_name',
];

/**
 * Every moment of a dream where a record word list decides something (the record with it on against it
 * off), set against the typed facts there; and the typed facts of its kind that the record, with every
 * list on, does not hold.
 */
export function compareRecord(
  b: Breakdown,
  build: () => StoryRecord,
  typed: Record<string, TypedMoment>,
  dream: string,
): Pairing[] {
  const out: Pairing[] = [];
  const on = build();
  const name = namer(b);
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  const ms = momentsOf(b);
  for (const list of RECORD_LISTS) {
    const off = withRetired([list], build);
    for (const m of ms) {
      const a = snapOf(on, m.id);
      const z = snapOf(off, m.id);
      const t = typed[m.id];
      const at = `${dream} ${m.id}`;
      const added = minus(a.facts, z.facts).map((s) => s.split('|'));
      const pair = (listSays: string, typedSays: string | null, agree: boolean | null) =>
        out.push({
          at,
          list: `${list}: ${listSays}`,
          typed: typedSays ?? '(nothing taken)',
          verdict: agree === null ? 'list only' : agree ? 'agree' : 'disagree',
        });
      if (list === 'fills' || list === 'state_verb')
        for (const [of, , part, now] of added.filter((x) => x[1] === 'part')) {
          if (list === 'fills') {
            const f = t?.fill.find((x) => x.place === of);
            pair(
              `${name(of)} ${part}: ${now}`,
              f ? `${f.matter} ${levelWords(f) ?? 'unmeasured'}` : null,
              f ? true : null,
            );
          } else {
            const act = t?.acts.find((x) => x.who === of);
            pair(`${name(of)} ${part}: ${now}`, act ? `${name(of)} ${act.does}` : null, act ? true : null);
          }
        }
      if (list === 'opens')
        for (const [of, , part, now] of added.filter((x) => x[1] === 'part')) {
          const c = t?.containers.find((x) => x.who === of);
          pair(
            `${name(of)} ${part}: ${now}`,
            c ? `${name(of)} ${c.part} ${c.open ? 'open' : 'shut'}` : null,
            c ? c.open : null,
          );
        }
      if (list === 'shut_away')
        for (const [of] of added.filter((x) => x[1] === 'shut')) {
          const c = t?.containers.find((x) => x.who === of);
          pair(
            `${name(of)} shut (carried away)`,
            c ? `${name(of)} ${c.part} ${c.open ? 'open' : 'shut'}` : null,
            c ? !c.open : null,
          );
        }
      if (list === 'taken')
        for (const [of, , by] of added.filter((x) => x[1] === 'held')) {
          const act = t?.acts.find((x) => x.to === of || x.who === by);
          pair(
            `${name(of)} held by ${name(by)}`,
            act ? `${name(act.who)} ${act.does} ${act.to ?? ''}`.trim() : null,
            act ? true : null,
          );
        }
      if (list === 'not_there')
        for (const who of minus(a.gone, z.gone))
          pair(
            `${name(who)} gone`,
            t?.absent.includes(who) ? `${name(who)} absent` : null,
            t?.absent.includes(who) ? true : null,
          );
      if (list === 'self' && dreamer && a.shows.has(dreamer) && !z.shows.has(dreamer))
        pair(
          'the dreamer in view (looks at themselves)',
          t?.pov ? `own body ${t.pov.ownBody}` : null,
          t?.pov?.ownBody ?? null,
        );
      if (list === 'holds_name')
        for (const who of [...minus(a.shows, z.shows), ...minus(z.shows, a.shows)])
          pair(`${name(who)} ${a.shows.has(who) ? 'in view' : 'not in view'}`, null, null);
      if (list === 'taken')
        for (const s of minus(z.facts, a.facts).filter((x) => x.includes('|held|'))) {
          const [of, , by] = s.split('|');
          const act = t?.acts.find((x) => x.to === of);
          pair(
            `${name(of)} not held by ${name(by)} before`,
            act ? `${name(act.who)} ${act.does} ${name(of)}` : null,
            act ? true : null,
          );
        }
    }
  }
  // What the typed facts say that the record, every list on, does not hold at all.
  for (const m of ms) {
    const t = typed[m.id];
    if (!t) continue;
    const a = snapOf(on, m.id);
    const at = `${dream} ${m.id}`;
    const parts = [...a.facts].map((s) => s.split('|'));
    for (const f of t.fill)
      if (!parts.some(([of, k, part, now]) => of === f.place && k === 'part' && FILL_MATTER.test(`${part} ${now}`)))
        out.push({ at, list: 'fills', typed: `${f.matter} ${levelWords(f) ?? 'unmeasured'}`, verdict: 'typed only' });
    for (const c of t.containers.filter((x) => x.open))
      if (!parts.some(([of, k, part, now]) => of === c.who && k === 'part' && OPEN.test(`${part} ${now}`)))
        out.push({ at, list: 'opens', typed: `${name(c.who)} ${c.part} open`, verdict: 'typed only' });
    for (const c of t.containers.filter((x) => !x.open))
      if (!parts.some(([of, k]) => of === c.who && k === 'shut'))
        out.push({ at, list: 'shut_away', typed: `${name(c.who)} ${c.part} shut`, verdict: 'typed only' });
    for (const who of t.absent)
      if (!a.gone.has(who)) out.push({ at, list: 'not_there', typed: `${name(who)} absent`, verdict: 'typed only' });
    if (dreamer && t.pov?.ownBody && !a.shows.has(dreamer))
      out.push({ at, list: 'self', typed: 'own body seen', verdict: 'typed only' });
  }
  return out;
}

/** The camera rules' word lists (camera.ts) at every moment, set against the typed facts there. */
export function compareCamera(
  b: Breakdown,
  rec: StoryRecord,
  typed: Record<string, TypedMoment>,
  dream: string,
): Pairing[] {
  const out: Pairing[] = [];
  const name = namer(b);
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  for (const m of momentsOf(b)) {
    const t = typed[m.id];
    if (!t) continue;
    const at = `${dream} ${m.id}`;
    const plan = planOf(b, m);
    // Hands and their own body, through the dreamer's eyes: what cutsheet.ts reads, with who holds what.
    if (m.eyes === 'dreamer') {
      const words = [m.action ?? '', m.visual_point ?? '', m.looks_at ?? ''];
      const holds = !!dreamer && Object.values(rec.moments.find((x) => x.id === m.id)?.held ?? {}).includes(dreamer);
      const body = selfIn(words) ? 'self' : handsIn(words, holds) ? 'hands' : 'none';
      const typedBody = t.pov
        ? t.pov.ownBody
          ? 'self'
          : t.pov.hands === true || t.pov.holding.length
            ? 'hands'
            : t.pov.hands === false
              ? 'none'
              : null
        : null;
      out.push({
        at,
        list: `hands/own body: ${body}${holds ? ' (the record has them holding)' : ''}`,
        typed: typedBody ?? '(nothing taken)',
        verdict: typedBody === null ? 'list only' : typedBody === body ? 'agree' : 'disagree',
      });
    }
    // A vehicle going: every vehicle of the plan in view, as continuity.ts reads it.
    if (plan) {
      const vehicles = plan.spots.filter((v) => v.shape === 'vehicle' && !v.heldBy);
      for (const v of vehicles) {
        if (![...m.things, ...m.visible].includes(v.id) && !t.motion.some((x) => x.who === v.id)) continue;
        const others = vehicles.filter((o) => o.id !== v.id).map((o) => o.name ?? name(o.id));
        const going = goingIn(`${m.action} ${m.visual_point ?? ''}`, name(v.id), others);
        const mo = t.motion.find((x) => x.who === v.id);
        out.push({
          at,
          list: `going: ${name(v.id)} ${going ? 'going' : 'not going'}`,
          typed: mo ? `${mo.moving ? 'moving' : 'still'}${mo.heading ? ` ${mo.heading}` : ''}` : '(nothing taken)',
          verdict: !mo ? 'list only' : mo.moving === going ? 'agree' : 'disagree',
        });
      }
    }
    // The water's height: the record's water words through waterLevel, and the typed level through it too.
    if (plan) {
      let has = false;
      let level: number | null = null;
      for (const x of factsAt(rec, m.id))
        if (x.kind === 'place')
          for (const f of x.facts)
            if (f.kind === 'part' && (WATER.test(f.part) || WATER.test(f.what))) {
              has = true;
              level ??= waterLevel(f.now, plan);
            }
      const f = t.fill.find((x) => x.place === m.place && WATER.test(x.matter));
      const typedLevel = f && levelWords(f) ? waterLevel(levelWords(f)!, plan) : null;
      if (has || f) {
        const say = (h: boolean, l: number | null) => (!h ? 'no water' : l === null ? 'unmeasured' : `${l} m`);
        const agree =
          !!f === has &&
          (typedLevel === null) === (level === null) &&
          (level === null || Math.abs(level - (typedLevel ?? 0)) <= 0.3);
        out.push({
          at,
          list: `water: ${say(has, level)}`,
          typed: f ? `${say(true, typedLevel)} (${levelWords(f) ?? 'unmeasured'})` : '(nothing taken)',
          verdict: !f ? 'list only' : !has ? 'typed only' : agree ? 'agree' : 'disagree',
        });
      }
    }
    // Seen beyond the place: what the floor plan puts out past a window or its edges, against the typed.
    if (plan) {
      const outside = new Set([...Object.keys(plan.outside ?? {}), ...Object.keys(outThroughWindows(plan))]);
      const inView = [...m.visible, ...m.things];
      const typedOut = new Set(t.beyond.map((x) => x.what));
      for (const id of inView) {
        const l = outside.has(id);
        const ty = typedOut.has(id);
        if (!l && !ty) continue;
        out.push({
          at,
          list: `beyond: ${name(id)} ${l ? 'outside' : 'inside'}`,
          typed: ty ? 'beyond' : 'inside',
          verdict: l && ty ? 'agree' : l ? 'disagree' : 'typed only',
        });
      }
    }
  }
  return out;
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────────

type MomentOut = {
  eyes: Moment['eyes'];
  place: string;
  in_view: string[];
  action: string;
  must_show?: string;
  facts: Checked[];
  error?: string;
};

/** A seeded pick, the same for the same seed. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A fact in words, as the report prints it. */
export function factWords(f: Checked, name: (id: string) => string): string {
  switch (f.kind) {
    case 'act':
      return `${name(f.who)} ${f.does}${f.to ? ` ${name(f.to)}` : ''}${f.where ? ` ${f.where}` : ''}`;
    case 'motion':
      return `${name(f.who)} ${f.moving ? 'moving' : 'still'}${f.heading ? `, ${f.heading}` : ''}`;
    case 'fill':
      return `${f.matter} in ${name(f.place)} ${levelWords(f) ?? 'unmeasured'}`;
    case 'hands':
      return `the dreamer's hands ${f.inUse ? 'in use' : 'not in use'}`;
    case 'holding':
      return `the dreamer holds ${name(f.what)}`;
    case 'own_body':
      return `the dreamer ${f.seen ? 'sees' : 'does not see'} their own body`;
    case 'container':
      return `${name(f.who)}'s ${f.part.replace(/^the\s+/i, '')} ${f.open ? 'open' : 'shut'}`;
    case 'beyond':
      return `${name(f.what)} beyond, through ${f.through}`;
    case 'absent':
      return `${name(f.who)} not there`;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const listOf = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return [];
    const out: string[] = [];
    for (const a of args.slice(i + 1)) {
      if (a.startsWith('--')) break;
      out.push(a);
    }
    return out;
  };
  const label = valueOf('--label') ?? 'latest';
  const live = args.includes('--live');
  const ask = !args.includes('--no-ask');
  const show = args.includes('--show');
  const concurrency = Number(valueOf('--concurrency') ?? 3);
  const maxJev = Number(valueOf('--max-jev') ?? 3500);
  const sampleN = Number(valueOf('--sample') ?? 0);
  const seed = Number(valueOf('--seed') ?? 1);
  if (ask && WRITER !== 'claude') {
    console.error(
      'the typed reading is written by Claude: set DREAMCHAT_WRITER=claude (or read the cache with --no-ask)',
    );
    process.exit(1);
  }
  const only = new Map<string, string[]>();
  for (const x of listOf('--only')) {
    const [d, ms] = x.split(':');
    only.set(d, ms ? ms.split(',') : []);
  }
  const wanted = [...only.keys(), ...listOf('--dreams')];
  const dreams: Dream[] = live
    ? (() => {
        const all = liveDreams(dataDir(wanted.filter((x) => !x.includes('/'))));
        return (wanted.length ? all.filter((x) => wanted.includes(x.id)) : all).map(readLive);
      })()
    : (wanted.length ? wanted : frozenDreams()).map((id) => loadDream(id, false));

  const cache = new TypedCache(valueOf('--cache') ?? TYPED_CACHE);
  const counts = {
    writer: { asked: 0, cached: 0, missing: 0 } as Counts,
    jev: { asked: 0, cached: 0, missing: 0 } as Counts,
  };
  const jevModel = JEV_MODEL();
  const realJev = jevWithModel(jevModel);
  // Past the Jev budget of this run, nothing more is asked: the moments left read as not cached.
  const budgeted: typeof realJev = async (state, questions) => {
    if (counts.jev.asked >= maxJev)
      return { questions, state, answers: null, error: `over the budget of ${maxJev} Jev calls`, ms: 0, usage: null };
    return realJev(state, questions);
  };
  const fns = cachedFns(cache, { writer: typedWriter(), jev: budgeted, jevModel, ask }, counts);
  const limit = limiter(concurrency);
  const total = dreams.reduce(
    (a, d) =>
      a +
      (d.session.draft?.breakdown
        ? momentsOf(d.session.draft.breakdown).filter(
            (m) => !only.size || (only.get(d.id) ?? []).length === 0 || only.get(d.id)!.includes(m.id),
          ).length
        : 0),
    0,
  );
  let done = 0;
  const started = Date.now();
  const out: Record<string, Record<string, MomentOut>> = {};
  const typedBy: Record<string, Record<string, TypedMoment>> = {};
  const pairings: Pairing[] = [];
  const skipped: string[] = [];
  const impliedFile = valueOf('--implied-cache');
  await Promise.all(
    dreams.map(async (d) => {
      const s = d.session as Session;
      if (!s.draft?.breakdown || !s.style) {
        skipped.push(d.id);
        return;
      }
      const ms = only.get(d.id);
      const r = await readTypedDream(s, fns, {
        limit,
        only: ms?.length ? ms : undefined,
        onMoment: () => {
          done++;
          if (done % 10 === 0 || done === total) {
            cache.save();
            console.log(
              `${done}/${total} moments, ${Math.round((Date.now() - started) / 1000)} s; writer asked ${counts.writer.asked}, Jev asked ${counts.jev.asked}`,
            );
          }
        },
      });
      const b = structuredClone(s.draft.breakdown);
      completeViews(b);
      const name = namer(b);
      out[d.id] = {};
      typedBy[d.id] = {};
      for (const m of momentsOf(b)) {
        const reading: TypedReading | undefined = r.readings[m.id];
        if (!reading) continue;
        out[d.id][m.id] = {
          eyes: m.eyes,
          place: name(m.place),
          in_view: [...m.visible, ...m.things].map(name),
          action: m.action,
          ...(m.visual_point ? { must_show: m.visual_point } : {}),
          facts: reading.facts,
          ...(r.errors[m.id] ? { error: r.errors[m.id] } : {}),
        };
        typedBy[d.id][m.id] = takenOf(reading, m.eyes);
      }
      // The record the word lists act on, built as a rebuild builds it (with the implied readings when a cache is given).
      let session = s;
      if (impliedFile)
        session = (
          await withImplied(s, {
            cacheFile: impliedFile,
            write: async () => {
              throw new Error('cache only');
            },
            jev: async (state, questions) => ({
              questions,
              state,
              answers: null,
              error: 'cache only',
              ms: 0,
              usage: null,
            }),
            jevModel,
          })
        ).session;
      const inputs = recordInputsOf(session);
      const build = () =>
        storyRecord(b, inputs.items, session.draft?.readings ?? null, { words: inputs.words, style: session.style! })
          .record;
      try {
        pairings.push(...compareRecord(b, build, typedBy[d.id], d.id));
        pairings.push(...compareCamera(b, build(), typedBy[d.id], d.id));
      } catch (e) {
        console.warn(`${d.id}: comparison failed: ${String(e).slice(0, 200)}`);
      }
    }),
  );
  cache.save();

  // ── the report ──
  const lines: string[] = [];
  const all = Object.entries(out).flatMap(([d, ms]) => Object.entries(ms).map(([m, x]) => ({ d, m, x })));
  const facts = all.flatMap(({ d, m, x }) => x.facts.map((f) => ({ d, m, x, f })));
  lines.push(
    `${label}: ${Object.keys(out).length} dreams (${live ? 'live' : 'frozen'}), ${all.length} moments read; commit ${commitOf()}; writer ${typedWriter()}, Jev ${jevModel}; skipped (no breakdown or look): ${skipped.length}`,
  );
  lines.push(
    `calls: writer ${counts.writer.asked} asked, ${counts.writer.cached} from the cache, ${counts.writer.missing} not cached; Jev ${counts.jev.asked} asked, ${counts.jev.cached} from the cache, ${counts.jev.missing} not cached`,
  );
  const errs = all.filter((x) => x.x.error);
  if (errs.length)
    lines.push(`moments with an error (${errs.length}): ${errs.map((x) => `${x.d} ${x.m}: ${x.x.error}`).join('; ')}`);
  lines.push('', 'facts per kind: proposed, taken (rate), close to a bar');
  for (const k of TYPED_KINDS) {
    const fs = facts.filter((x) => x.f.kind === k);
    const ok = fs.filter((x) => x.f.ok).length;
    lines.push(
      `  ${k.padEnd(10)} ${String(fs.length).padStart(5)} ${String(ok).padStart(5)} (${fs.length ? Math.round((100 * ok) / fs.length) : 0}%)  close ${fs.filter((x) => x.f.close).length}`,
    );
  }
  const okAll = facts.filter((x) => x.f.ok).length;
  lines.push(
    `  ${'all'.padEnd(10)} ${String(facts.length).padStart(5)} ${String(okAll).padStart(5)} (${facts.length ? Math.round((100 * okAll) / facts.length) : 0}%)`,
  );
  const noFacts = all.filter((x) => !x.x.facts.some((f) => f.ok)).length;
  lines.push(
    `moments with no fact taken: ${noFacts}; with a taken act: ${all.filter((x) => x.x.facts.some((f) => f.ok && f.kind === 'act')).length}`,
  );

  // The word lists against the typed facts.
  lines.push('', 'word lists against the typed facts (agree / disagree / list only / typed only)');
  const listName = (p: Pairing) => p.list.split(':')[0];
  const lists = [...new Set(pairings.map(listName))];
  for (const l of lists) {
    const ps = pairings.filter((p) => listName(p) === l);
    const n = (v: Pairing['verdict']) => ps.filter((p) => p.verdict === v).length;
    lines.push(`  ${l.padEnd(18)} ${n('agree')} / ${n('disagree')} / ${n('list only')} / ${n('typed only')}`);
  }
  for (const l of lists) {
    const ps = pairings.filter((p) => listName(p) === l && p.verdict !== 'agree');
    if (!ps.length) continue;
    lines.push('', `${l}: where they differ (${ps.length})`);
    for (const p of ps.slice(0, 40))
      lines.push(`  ${p.at} [${p.verdict}] list: ${p.list.slice(l.length + 2)} | typed: ${p.typed}`);
    if (ps.length > 40) lines.push(`  … ${ps.length - 40} more in the json`);
  }

  const nameIn = (d: string) => {
    const b = dreams.find((x) => x.id === d)?.session.draft?.breakdown;
    return b ? namer(b) : (x: string) => x;
  };
  if (show) {
    lines.push('', 'every moment');
    for (const { d, m, x } of all) {
      lines.push(
        `- ${d} ${m} (${x.place}, ${x.eyes === 'dreamer' ? 'pov' : 'outside'}; in view: ${x.in_view.join(', ')}): ${x.action}${x.must_show ? ` [must show: ${x.must_show}]` : ''}`,
      );
      for (const f of x.facts)
        lines.push(
          `    ${f.ok ? 'TAKEN' : 'no   '} ${f.kind}: ${factWords(f, nameIn(d))}  (${f.checks.map((c) => `${c.key.replace(/_\d+$/, '')} ${c.want} ${c.answer?.toFixed(2) ?? '-'}`).join(', ')})`,
        );
    }
  }
  if (sampleN) {
    // Across kinds: each kind its share of the taken facts, at least two where it has them.
    const rnd = seeded(seed);
    const taken = facts.filter((x) => x.f.ok);
    const byKind = TYPED_KINDS.map((k) => taken.filter((x) => x.f.kind === k)).filter((xs) => xs.length);
    const share = byKind.map((xs) =>
      Math.max(Math.min(2, xs.length), Math.round((sampleN * xs.length) / taken.length)),
    );
    const pick: typeof taken = [];
    byKind.forEach((xs, i) => {
      const pool = [...xs];
      for (let k = 0; k < share[i] && pool.length; k++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    });
    lines.push(
      '',
      `a sample of ${pick.length} taken facts (seed ${seed}), to check by hand against the moment's words`,
    );
    pick.forEach(({ d, m, x, f }, i) => {
      lines.push(`${i + 1}. [${f.kind}] ${factWords(f, nameIn(d))}`);
      lines.push(
        `   ${d} ${m} (${x.place}, ${x.eyes === 'dreamer' ? 'pov' : 'outside'}; in view: ${x.in_view.join(', ')}): ${x.action}${x.must_show ? ` [must show: ${x.must_show}]` : ''}`,
      );
    });
  }

  const dir = join(DIR, 'runs', 'typed');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${label}.json`),
    `${JSON.stringify({ label, at: new Date().toISOString(), commit: commitOf(), writer: typedWriter(), jev: jevModel, from: live ? 'live' : 'frozen', calls: counts, moments: out, pairings }, null, 1)}\n`,
  );
  writeFileSync(join(dir, `${label}.txt`), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`\nwritten runs/typed/${label}.json and .txt; cache ${cache.file}`);
}
