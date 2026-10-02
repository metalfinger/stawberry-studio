// Whether the prompt written for the local machine says each thing as it is now, and whether a thing the moment has in
// view has a place on the keyed mock-up and its id map however small it is (the one builder's `written_now` and
// `tiny_marker`): every saved dream rebuilt with the full profile and its readings, with the step before them and with
// them. The merged flow's Grandmother (2 Oct): the bed sheet folded down to a handkerchief, then a stamp, was written
// "a plain full-size bed sheet" at every fold, and the stamp between their fingers had 20 pixels at m8, no region for a
// harness to find it by.
//
// How it is now is read here on its own, never the code's own pick: the latest change of the whole of it and the latest
// of its size or shape since, this moment's own after every one carried, those by the story's order; Grandmother's folds
// are labelled by hand, and read only where the prompt says what the bed sheet becomes. A thing
// with no dot is put down to why: not on the moment's floor plan, out of its frame (previs.ts inFrame, its own
// projection), or in the frame with no dot, each listed to be read.
//
//   bun run evals/written-now.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS } from '../cleanups';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import { cameraOf } from '../packet';
import { rebuild } from '../plan';
import { inFrame } from '../previs';
import { isWhole, moments, type State } from '../producer';
import { calledFor, previsKeyedFor, type Session } from '../session';
import { withCast, withDevicesCached } from './cast-cache';
import { withImplied } from './implied-cache';
import type { Img } from './local-draw';
import { qwenEdit } from './qwen-prompt';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const args = process.argv.slice(2);
const live = args.includes('--live');
const list = args.includes('--list');
const dirs = args.flatMap((a, i) => (a === '--dir' ? [args[i + 1]] : []));
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const before = BUILDER_STEPS[BUILDER_STEPS.indexOf('written_now') - 1];

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

/** By this eval's own words: a change of a thing's size, or of the whole of it. */
const RESIZED =
  /^\s*(?:its |their |the )?(?:size|scale|form|shape|whole|self|itself|themselves|kind|what it is|nature)\s*$/i;
const resized = (st: State) => !!st.whole || RESIZED.test(st.part ?? '') || RESIZED.test(st.what);
/** Words of a size its first look gave, never to be said where a change of its size is in force. */
const BASE_SIZE =
  /\b(?:full|life|normal|usual|ordinary|real|natural)[- ]size[d]?\b|\b(?:huge|giant|gigantic|enormous|massive)\b/i;
/** Grandmother's folds, by hand: the word each moment's prompt says the bed sheet is. */
const LABELLED: Record<string, Record<string, [string, string]>> = {
  'dream-1002-140434-f3eb': {
    m7: ['bed sheet', 'handkerchief'],
    m8: ['bed sheet', 'stamp'],
    m9: ['bed sheet', 'stamp'],
  },
};

type Count = {
  cuts: number;
  errors: number;
  /** Things in view with a change of their size or whole in force, and those written as they were. */
  changed: number;
  writtenStale: number;
  unsaid: number;
  labelled: number;
  labelledRight: number;
  /** Things the moment has in view, and what became of each on the keyed mock-up's id map. */
  inView: number;
  notOnPlan: number;
  outOfFrame: number;
  shown: number;
  unkeyed: number;
  marked: number;
  markedOut: number;
  unmarked: number;
};
const zero = (): Count => ({
  cuts: 0,
  errors: 0,
  changed: 0,
  writtenStale: 0,
  unsaid: 0,
  labelled: 0,
  labelledRight: 0,
  inView: 0,
  notOnPlan: 0,
  outOfFrame: 0,
  shown: 0,
  unkeyed: 0,
  marked: 0,
  markedOut: 0,
  unmarked: 0,
});
const total = { before: zero(), after: zero() };
const out: string[] = [];
const said = (now: string) =>
  now
    .toLowerCase()
    .trim()
    .replace(/^(?:now|is|are)\s+/, '')
    .replace(/\.$/, '');

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
    const order = new Map(moments(r.b).map((m, i) => [m.id, i]));
    // A dot's area at the frame's size, as previs.ts draws it: a radius a three-hundredth of its long side, at least 3.
    const area = (w: number, h: number) => {
      const rad = Math.max(3, Math.round(Math.max(w, h) / 300));
      let n = 0;
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (Math.hypot(x, y) <= rad) n++;
      return n;
    };
    for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
      into.cuts++;
      try {
        // The written prompt: each thing with a change of its size or whole in force, said as it is now.
        const plan = p.item.frame?.plan;
        if (p.sheet && p.assembled && plan) {
          const images: Img[] = p.references.map((x, i) => ({
            n: i + 1,
            role: x.role,
            name: x.media_id,
            file: x.media_id,
          }));
          const text = qwenEdit(
            p.sheet,
            p.assembled.references,
            images,
            Object.fromEntries(p.assembled.lines.map((l) => [l.id, l.text])),
          ).prompt;
          const sentences = text.split(/(?<=[.])\s+/).map((x) => x.toLowerCase());
          for (const e of p.sheet.inView.filter((x) => x.kind === 'prop')) {
            // In force, in the story's order (this moment's own last): the latest change of the whole of it, and the
            // latest of its size or shape after that.
            const all = [
              ...plan.states.map((st) => ({ st, at: order.get(st.since) ?? -1 })),
              ...plan.own.map((st) => ({ st, at: Infinity })),
            ]
              .map((x, i) => ({ ...x, i }))
              .filter((x) => x.st.who === e.id && resized(x.st) && x.st.now.trim())
              .sort((a, b) => a.at - b.at || a.i - b.i);
            const whole = all.filter((x) => isWhole(x.st)).at(-1);
            const sized = all
              .filter((x) => !isWhole(x.st) && (!whole || x.at > whole.at || (x.at === whole.at && x.i > whole.i)))
              .at(-1);
            const nows = [whole, sized].flatMap((x) => (x ? [said(x.st.now)] : []));
            const label = LABELLED[id]?.[p.id];
            const name = e.name.replace(/^the\s+/i, '').toLowerCase();
            // Every sentence that names it, and those that say what it becomes (its own, or its dot's).
            const naming = sentences.filter((x) => x.includes(name));
            const telling = naming.filter((x) => /\bbecomes?\b|\bdot marks where\b/.test(x));
            if (label && name.includes(label[0])) {
              into.labelled++;
              if (telling.some((x) => x.includes(label[1])) && !naming.some((x) => BASE_SIZE.test(x)))
                into.labelledRight++;
              else out.push(`${side} ${id} ${p.id}: labelled ${label[1]}, written: ${naming.join(' ').slice(0, 200)}`);
            }
            if (!nows.length) continue;
            into.changed++;
            if (!telling.length) {
              into.unsaid++;
              continue;
            }
            const stale =
              nows.some((now) => !telling.some((x) => x.includes(now))) ||
              naming.some((x) => BASE_SIZE.test(nows.reduce((y, now) => y.replace(now, ''), x)));
            if (stale) {
              into.writtenStale++;
              out.push(
                `${side} ${id} ${p.id}: ${e.name} (now ${nows.join('; ')}) written: ${naming.join(' ').slice(0, 200)}`,
              );
            }
          }
        }
        // A thing the moment has in view on the keyed mock-up's id map, through the camera its picture is drawn from.
        const through = cameraOf(r, p.id);
        if (!plan || !through) continue;
        const seen = { id: p.id, frame: { ...p.item.frame!, eyes: through.eyes, plan: { ...plan, eye: through.eye } } };
        const called = calledFor({ build: s.build, draft: s.draft && { ...s.draft, breakdown: r.b } }, p.item);
        const keyed = previsKeyedFor(r.b, seen, called, r.rec, { idmap: true });
        const floor = shotPlan(r.b, p.id, r.rec);
        if (!keyed?.idmap || !floor) continue;
        const dot = area(...(keyedSize(keyed.idmap.png) ?? [1376, 768]));
        for (const t of p.item.frame?.things ?? []) {
          into.inView++;
          const e = keyed.idmap.ids.find((x) => x.id === t);
          const f = floor.spots.some((x) => x.id === t) ? inFrame(floor, through.eye, t) : null;
          const outside = !f || (f.height <= 0 && !f.head);
          if (!floor.spots.some((x) => x.id === t)) into.notOnPlan++;
          else if (e?.marker) {
            into.marked++;
            if (outside) {
              into.markedOut++;
              out.push(`${side} ${id} ${p.id}: ${t} marked, out of its frame`);
            }
          } else if (e && e.pixels >= dot) {
            into.shown++;
            if (!keyed.key.some((k) => k.id === t) && step === 'on') {
              into.unkeyed++;
              out.push(`${side} ${id} ${p.id}: ${t} ${e.pixels} pixels, not in the key`);
            }
          } else if (outside) into.outOfFrame++;
          else {
            into.unmarked++;
            out.push(`${side} ${id} ${p.id}: ${t} ${e ? `${e.pixels} pixels` : 'no pixels'}, in its frame, no dot`);
          }
        }
      } catch (err) {
        into.errors++;
        out.push(`${side} ${id} ${p.id}: error ${String(err).slice(0, 120)}`);
      }
    }
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

/** A PNG's width and height, from its header. */
function keyedSize(png: Uint8Array): [number, number] | null {
  if (png.length < 24) return null;
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
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
