// Whether a thing in two pairs of hands at once is in both, everywhere the harness says who holds it (the one builder's
// `shared_holds`): the story record, the moment's floor plan, the world at the cut, the prompt and the mock-up. Every
// saved dream and the merged flow's imports rebuilt with the full profile and its readings, with the step before it and
// with it. The merged flow's Grandmother (2-3 Oct): the bed sheet she and the dreamer fold together, stretched between
// them, then a handkerchief between their joined fingers, was in her hands alone in the record, the plan, the prompt
// ("the bed sheet is in my grandmother's hands") and on the mock-up, at her side; the stamp at m8 is between her
// fingertips alone. And eight handovers had the record's holder where the plan had the other hand.
//
// What is due is read here on its own, never from the code's own pick, with who is there from the dream's breakdown: a
// handover where the moment's typed acts have someone there give, hand or pass the thing to someone there (the giver,
// then the one given it, by the act, by whoever takes it, or by the words' "to"; whom unread, counted and left out;
// where its acts are silent on it and only the writer's floor plan hands it on, counted, never due); a hold shared
// where two or more there do something with their hands to it at once (fold it, hold it, carry it, stretch it, bring
// its corners together), never each their own ("their schedules"); Grandmother's folds labelled by hand. Then, for each: the
// record's hands, the plan's (`heldBy`, then `heldWith`) and the world's `held_by`, a handover in its order; the prompt
// (who holds it, every holder named; never "in X's hands" of one of them alone; many of it never held between them, one
// thing held together between them) and the mock-up (on the keyed mock-up's id map, the thing between the two where
// both are drawn, many of it reaching to each; where one is the camera, below the other's middle, toward the camera's
// hands). And never in two pairs of hands where one does it.
//
//   bun run evals/shared-holds.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS } from '../cleanups';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import { cameraOf } from '../packet';
import { rebuild } from '../plan';
import { readPng } from '../previs';
import type { AtMoment } from '../record';
import { worldOf } from '../resolvers';
import { calledFor, previsKeyedFor, type Session } from '../session';
import { takenOf, type TypedReading } from '../typed';
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
const STEP = 'shared_holds';
// The step before it; before it is built, only the harness as it is.
const before = BUILDER_STEPS.includes(STEP) ? BUILDER_STEPS[BUILDER_STEPS.indexOf(STEP) - 1] : undefined;

/** Grandmother's folds, by hand: whose hands the sheet is in at each fold (2 Oct, f3eb; 3 Oct, d5c3). */
const LABELS: Record<string, Record<string, Record<string, string[]>>> = {
  // "fold a bed sheet together, holding it stretched between them"; "the sheet between their hands has shrunk to a
  // handkerchief"; "held between the grandmother's fingertips".
  'dream-1003-024129-d5c3': { m6: { t1: ['p1', 'p2'] }, m7: { t1: ['p1', 'p2'] }, m8: { t1: ['p1'] } },
  // "holding it between them by its corners"; "a handkerchief between their fingertips"; "a tiny stamp pinched between
  // their fingers".
  'dream-1002-140434-f3eb': { m6: { t1: ['p1', 'p2'] }, m7: { t1: ['p1', 'p2'] }, m8: { t1: ['p1', 'p2'] } },
};

/** Given over: the thing goes from the one doing it to whom it is done to. */
const GIVE = /^(?:hands?|gives?|pass(?:es)?|holds? out|offers?)\b/i;
/** Done with the hands to the thing itself: whoever does it has it in their hands. */
const HANDS =
  /^(?:holds?|folds?|carr(?:y|ies)|clutch(?:es)?|grips?|lifts?|raises?|stretch(?:es)?|pinch(?:es)?|brings? together|pulls?|tugs?|shakes? out|spreads?)\b/i;

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

type Due = { thing: string; hands: string[]; why: 'handover' | 'shared' | 'label' };
/** Many of it, by its name: a number of them, or a plural head ("the two bowls of noodles", "the boats"). */
const many = (name: string) => {
  const ws =
    name
      .toLowerCase()
      .replace(/\s+of\s+.*$/, '')
      .match(/[\p{L}]+/gu) ?? [];
  return (
    /\b(?:two|three|four|five|six|several|some|many|both)\b/.test(name.toLowerCase()) ||
    (/s$/.test(ws.at(-1) ?? '') && !/(?:ss|us|is)$/.test(ws.at(-1) ?? ''))
  );
};
const LAYERS = ['record', 'plan', 'world', 'prompt', 'mockup'] as const;
type Layer = (typeof LAYERS)[number];
const tally = () => ({
  cuts: 0,
  errors: 0,
  due: { handover: 0, shared: 0, label: 0 },
  ok: Object.fromEntries(LAYERS.map((l) => [l, 0])) as Record<Layer, number>,
  checked: Object.fromEntries(LAYERS.map((l) => [l, 0])) as Record<Layer, number>,
  single: 0,
  singleShared: 0,
  unknownTo: 0,
  planOnly: 0,
  conflicts: 0,
});
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Each id's pixels on an id map: where its middle is, and how far it reaches, across and down (0 to 1). */
function regions(png: Uint8Array, ids: { id: string; rgb: [number, number, number] }[]) {
  const { width, height, rgb } = readPng(png);
  const by = new Map(ids.map((x) => [x.rgb.join(','), x.id]));
  const acc = new Map<string, { n: number; sx: number; sy: number; x0: number; x1: number; y1: number }>();
  for (let i = 0; i < width * height; i++) {
    const id = by.get(`${rgb[i * 3]},${rgb[i * 3 + 1]},${rgb[i * 3 + 2]}`);
    if (!id) continue;
    const [x, y] = [i % width, Math.floor(i / width)];
    const a = acc.get(id) ?? { n: 0, sx: 0, sy: 0, x0: x, x1: x, y1: 0 };
    a.n++;
    a.sx += x;
    a.sy += y;
    a.x0 = Math.min(a.x0, x);
    a.x1 = Math.max(a.x1, x);
    a.y1 = Math.max(a.y1, y);
    acc.set(id, a);
  }
  return new Map(
    [...acc].map(([id, a]) => [
      id,
      { cx: a.sx / a.n / width, cy: a.sy / a.n / height, x0: a.x0 / width, x1: a.x1 / width, y1: a.y1 / height },
    ]),
  );
}

async function side(step: string): Promise<{ t: ReturnType<typeof tally>; out: string[] }> {
  const t = tally();
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
      const record = r.dream?.record;
      const typed = (s.draft.readings as { typed?: Record<string, TypedReading> } | undefined)?.typed ?? {};
      const living = (e: string) => !!record?.elements[e] && !['thing', 'place'].includes(record.elements[e].kind);
      const called = (e: string) => record?.elements[e]?.called ?? e;
      for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
        t.cuts++;
        const m = record?.moments.find((x) => x.id === p.id) as
          (AtMoment & { hands?: Record<string, string[]> }) | undefined;
        const plan = shotPlan(r.b, p.id, r.rec);
        if (!m || !plan || !record) continue;
        try {
          // Who and what is there, by the dream's own breakdown (never the record's, which puts a holder there): the
          // moment's people and things, and the dreamer whose eyes it is seen through.
          const scene = s.draft.breakdown.scenes.find((sc) => sc.moments.some((x) => x.id === p.id));
          const mo = scene?.moments.find((x) => x.id === p.id);
          const there = (e: string) =>
            !!mo &&
            (mo.visible.includes(e) || mo.things.includes(e) || (e === record.dreamer && mo.eyes === 'dreamer'));
          // Who holds what as the moment begins and as it ends, by the writer's own floor plan and its moves.
          const writer = scene?.blocking && mo ? (scene.blocking.places?.[mo.place] ?? scene.blocking) : undefined;
          const holderAt = (thing: string, upTo: number) => {
            let h = writer?.spots.find((x) => x.id === thing)?.heldBy;
            for (const x of scene!.moments.slice(0, upTo))
              for (const mv of writer?.moves?.[x.id] ?? [])
                if (mv.id === thing && mv.heldBy !== undefined) h = mv.heldBy;
            return h || undefined;
          };
          const index = scene && mo ? scene.moments.indexOf(mo) : -1;
          // What is due, from the moment's typed acts, the writer's floor plan and the labels alone.
          const due: Due[] = [];
          const label = LABELS[id]?.[p.id];
          const acts = takenOf(typed[p.id], m.eyes).acts;
          const things = Object.keys(record.elements).filter((e) => record.elements[e].kind === 'thing' && there(e));
          for (const thing of things) {
            if (label?.[thing]) {
              if (label[thing].length > 1) due.push({ thing, hands: label[thing], why: 'label' });
              continue;
            }
            // Done to it: it is the act's "to", or what the act's words name before whom it is done to ("hands the
            // suitcase to" the dreamer).
            const head = (record.elements[thing].name.toLowerCase().match(/[\p{L}]+/gu) ?? []).at(-1) ?? '';
            // Its "to" may be its id and whom it goes to ("t1 to p1"), or its words ("a glowing bowl of noodles").
            const naming = (x: string) =>
              !!head &&
              (
                x
                  .toLowerCase()
                  .split(/\b(?:to|toward|towards|into|onto|at|from|with)\b/)[0]
                  .match(/[\p{L}]+/gu) ?? []
              )
                .map((w) => w.replace(/s$/, ''))
                .includes(head.replace(/s$/, ''));
            const names = (a: { does: string; to?: string }) =>
              a.to === thing ||
              a.to?.split(/\s+/)[0] === thing ||
              naming(a.does) ||
              (!!a.to && !record.elements[a.to] && naming(a.to));
            const on = acts.filter((a) => names(a) && there(a.who) && living(a.who));
            const give = on.find((a) => GIVE.test(a.does));
            // Whom it is given to: the giving act's someone there; else whoever there takes it or reaches for it; else
            // whom its words say it goes to ("hands one of the folded newspaper boats to the dreamer"); else whoever
            // the record has it with after.
            const words = `${m.words.action}. ${m.words.visual_point}`.toLowerCase();
            const said = [
              ...words.matchAll(/\b(?:hands?|gives?|pass(?:es)?|offers?)\b[^.;]*?\bto ([\p{L}' -]+)/gu),
            ].map((x) => x[1]);
            const people = Object.keys(record.elements).filter((e) => living(e) && there(e) && e !== give?.who);
            const givenTo = give
              ? ((give.to && give.to !== thing && living(give.to) ? give.to : undefined) ??
                give.to?.match(/^\S+ to (\S+)$/)?.[1] ??
                on.find(
                  (a) => a.who !== give.who && /^(?:takes?|receives?|reaches? for|accepts?|grabs?)\b/i.test(a.does),
                )?.who ??
                people.find((e) =>
                  said.some((x) =>
                    x.startsWith(record.elements[e].called.toLowerCase().replace(/^(?:my|her|his|their)\s+/, 'the ')),
                  ),
                ))
              : undefined;
            if (give && givenTo && givenTo !== give.who && there(givenTo)) {
              due.push({ thing, hands: [give.who, givenTo], why: 'handover' });
              continue;
            }
            if (give) {
              t.unknownTo++;
              out.push(`${step} ${id} ${p.id}: ${thing} given by ${give.who}, to whom not read`);
              continue;
            }
            // Its acts silent on it, the writer's floor plan hands it on in the moment: counted and listed, never due,
            // as the plan's moves may hand it on between moments (the boat already in the dreamer's hand at aeea m8).
            const [from, to] = index >= 0 ? [holderAt(thing, index), holderAt(thing, index + 1)] : [];
            if (!on.length && from && to && from !== to && there(from) && there(to) && living(from) && living(to)) {
              t.planOnly++;
              out.push(`${step} ${id} ${p.id}: ${thing} handed on by the plan alone, ${from} to ${to}`);
              continue;
            }
            // Each one's own ("everyone holds out their schedules"): not held together.
            const own = (a: { to?: string }) => /^(?:their|his|her|my|our|its)\b/i.test(a.to ?? '');
            const handsOn = [...new Set(on.filter((a) => HANDS.test(a.does) && !own(a)).map((a) => a.who))];
            if (handsOn.length > 1) due.push({ thing, hands: handsOn, why: 'shared' });
          }
          // Each other thing there, labelled one pair of hands or no more than one's acts on it: never two.
          for (const thing of things) {
            if (due.some((d) => d.thing === thing)) continue;
            t.single++;
            const rec = m.hands?.[thing] ?? [];
            const sp = plan.spots.find((x) => x.id === thing) as { heldBy?: string; heldWith?: string[] } | undefined;
            const planHands = sp?.heldBy ? [sp.heldBy, ...(sp.heldWith ?? [])] : [];
            if (rec.length > 1 || planHands.length > 1) {
              t.singleShared++;
              out.push(
                `${step} ${id} ${p.id}: ${thing} in ${rec.join('+')} (plan ${planHands.join('+')}), one pair of hands`,
              );
            }
          }
          const { values, conflicts } = worldOf(r, p.id);
          t.conflicts += conflicts.filter((c) => c.includes('|held_by')).length;
          for (const c of conflicts.filter((x) => x.includes('|held_by'))) out.push(`${step} ${id} ${p.id}: ${c}`);
          // The keyed mock-up, through the camera its picture is drawn from.
          const through = cameraOf(r, p.id);
          const cut = p.item.frame?.plan;
          const seen = through &&
            cut && {
              id: p.id,
              frame: { ...p.item.frame!, eyes: through.eyes, plan: { ...cut, eye: through.eye } },
            };
          const named = calledFor({ build: s.build, draft: s.draft && { ...s.draft, breakdown: r.b } }, p.item);
          const keyed = seen ? previsKeyedFor(r.b, seen, named, r.rec, { idmap: true }) : undefined;
          const where = keyed?.idmap ? regions(keyed.idmap.png, keyed.idmap.ids) : undefined;
          const prompt = p.prompt;
          const nowLine = prompt.match(/How each one is at this moment: ([^\n]*)/)?.[1] ?? '';
          for (const d of due) {
            t.due[d.why]++;
            const fault = (layer: Layer, ok: boolean, what: string) => {
              t.checked[layer]++;
              if (ok) t.ok[layer]++;
              else out.push(`${step} ${id} ${p.id}: ${d.thing} (${d.why}, ${d.hands.join('+')}) ${layer}: ${what}`);
            };
            // Handed over, in order: the one handing it first (the contract's order); held together, any order.
            const agree = (x: string[]) =>
              d.why === 'handover' ? x.join('+') === d.hands.join('+') : same(x, d.hands);
            const rec = m.hands?.[d.thing] ?? (m.held[d.thing] ? [m.held[d.thing]] : []);
            fault('record', agree(rec), `the record has ${rec.join('+') || 'nobody'}`);
            const sp = plan.spots.find((x) => x.id === d.thing) as { heldBy?: string; heldWith?: string[] } | undefined;
            if (sp) {
              const planHands = sp.heldBy ? [sp.heldBy, ...(sp.heldWith ?? [])] : [];
              fault('plan', agree(planHands), `the plan has ${planHands.join('+') || 'nobody'}`);
            }
            const w = values.find((v) => v.entity === d.thing && v.attr === 'held_by');
            const wHands = w ? (Array.isArray(w.value) ? (w.value as string[]) : [String(w.value)]) : [];
            fault('world', agree(wHands), `held_by ${JSON.stringify(w?.value ?? null)}`);
            // The prompt: who holds it, every holder named; never in one of them's hands alone.
            const name = called(d.thing).toLowerCase();
            const clause = nowLine
              .split(/;\s*/)
              .find((c) => c.toLowerCase().includes(name.replace(/^(?:the|a|an|my|her|his|their)\s+/, '')));
            const holders = d.hands.map((h) =>
              called(h)
                .replace(/^(?:the|a|an|my|her|his|their)\s+/i, '')
                .toLowerCase(),
            );
            const missing = holders.filter((h) => !clause?.toLowerCase().includes(h));
            const alone = prompt
              .split(/(?<=[.!?])\s+|\n/)
              .filter((x) => x.toLowerCase().includes(name.replace(/^(?:the|a|an|my|her|his|their)\s+/, '')))
              .map((x) => {
                const hit = x.match(/\bin ([^,.;]+?)['’]s? hands((?:,? and [^,.;]+?['’]s?\b)*)/i);
                return hit ? `${hit[1]} ${hit[2] ?? ''}`.toLowerCase() : undefined;
              })
              .filter((x): x is string => !!x && holders.filter((h) => x.includes(h)).length < holders.length);
            // Many of it held together: some in each one's hands, never held between them; one thing held together,
            // between them.
            const each = d.why !== 'handover' && many(called(d.thing));
            const how =
              !clause || d.why === 'handover' ? '' : each === /\bbetween\b/i.test(clause) ? `"${clause}"` : '';
            fault(
              'prompt',
              !!clause && !missing.length && !alone.length && !how,
              !clause
                ? 'no word of who holds it'
                : missing.length
                  ? `"${clause}" leaves out ${missing.join(', ')}`
                  : alone.length
                    ? `in ${alone[0]}'s hands alone`
                    : `${how}, ${each ? 'many of it held between them' : 'not between them'}`,
            );
            // The mock-up: between the two where both are drawn; with one the camera, toward the camera's hands.
            const at = where?.get(d.thing);
            const drawn = d.hands.map((h) => where?.get(h)).filter((x) => !!x);
            if (at && drawn.length === d.hands.length && drawn.length > 1) {
              const xs = drawn.map((x) => x!.cx);
              // Many of it, some in each one's hands: reaching across to each of them; one thing, between them.
              const ok = each
                ? at.x0 <= Math.min(...xs) + 0.1 && at.x1 >= Math.max(...xs) - 0.1
                : at.cx >= Math.min(...xs) - 0.02 && at.cx <= Math.max(...xs) + 0.02;
              fault(
                'mockup',
                ok,
                `at ${at.cx.toFixed(2)} across (${at.x0.toFixed(2)} to ${at.x1.toFixed(2)}), the holders at ${xs.map((x) => x.toFixed(2)).join(', ')}`,
              );
            } else if (
              at &&
              drawn.length === d.hands.length - 1 &&
              !!record.dreamer &&
              d.hands.includes(record.dreamer) &&
              m.eyes === 'dreamer'
            ) {
              const other = drawn[0]!;
              fault(
                'mockup',
                at.y1 > other.cy,
                `reaches down to ${at.y1.toFixed(2)}, the other's middle at ${other.cy.toFixed(2)}`,
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

const sides = before ? [before, 'on'] : ['on'];
const all: string[] = [];
for (const step of sides) {
  const { t, out } = await side(step);
  const share = (l: Layer) => `${t.ok[l]}/${t.checked[l]}`;
  console.log(
    JSON.stringify({
      step,
      dreams: sources.length,
      cuts: t.cuts,
      errors: t.errors,
      due: t.due,
      ...Object.fromEntries(LAYERS.map((l) => [l, share(l)])),
      single: t.single,
      singleShared: t.singleShared,
      unknownTo: t.unknownTo,
      planOnly: t.planOnly,
      heldConflicts: t.conflicts,
    }),
  );
  all.push(...out);
}
if (list) for (const l of all.sort()) console.log(`  ${l}`);
