// Whether a moment whose beat is spoken, abstract, about a time or a schedule shows it by something seen (the one
// builder's `visible_device`): every saved dream rebuilt with the full profile and its readings, with the step before
// it and with it. Its test set is Grandmother on Wednesdays, every version of it: "only on Wednesdays", "the 2-3pm
// appointment", "asks if she has eaten" instead of the important question, and "our slot has gotten over" were each
// two people standing in a kitchen, no cue in the picture (the merged flow's review, 2 Oct). Drawn on its own by
// another harness with a week strip, an appointment card, a wall clock going from two to three and her pointing at it,
// a stranger read all ten of its pictures right. For each beat of the set: a thing of the kind it wants on the floor
// plan, held by the camera, said by the prompt, and nothing on it to read. Every other device any dream gets is listed
// to read by hand, with the words that would put letters on it.
//
//   bun run evals/devices.ts [--live] [--dir <a dreamchat data folder>]... [--list]
import './local-env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS } from '../cleanups';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
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
const STEP = 'visible_device';
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
// An imported dream's readings are its own (importer.ts): read as it is saved, with the device reading from the cache.
for (const dir of dirs)
  for (const f of readdirSync(join(dir, 'state')).filter((x) => /^dream-.*\.json$/.test(x)))
    sources.push({
      id: f.replace(/\.json$/, ''),
      load: async () => {
        const s = JSON.parse(readFileSync(join(dir, 'state', f), 'utf8')) as Session;
        // Imported with the step, its devices are in it already: taken out for the step before.
        if (process.env.DREAMCHAT_ONE_BUILDER !== 'on' && s.draft?.breakdown) {
          const bd = s.draft.breakdown;
          bd.things = (bd.things ?? []).filter((t) => !/^v\d+$/.test(t.id));
          for (const sc of bd.scenes) for (const m of sc.moments) m.things = m.things.filter((x) => !/^v\d+$/.test(x));
          if (s.draft.readings) delete s.draft.readings.devices;
          return s;
        }
        return (await withDevicesCached(s)).session;
      },
    });

/** The test set: each beat by the words that say it, and the kinds of thing that would show it. */
const BEATS: { beat: string; says: RegExp; wants: RegExp }[] = [
  { beat: 'only on Wednesdays', says: /\bwednesdays?\b/i, wants: /\b(?:calendar|week|diary|planner)\b/i },
  {
    beat: 'the 2-3pm appointment',
    says: /\b2\s*[-–to]+\s*3\s*(?:pm|p\.m\.)?|\bappointment\b/i,
    wants: /\b(?:clock|card|calendar|schedule|watch|diary)\b/i,
  },
  {
    beat: 'has she eaten',
    says: /\b(?:has eaten|had eaten|eaten)\b/i,
    wants: /\b(?:plate|bowl|food|meal|soup|dish|pot|lunch|dinner|sandwich|cake|bread)\b/i,
  },
  { beat: 'the slot is over', says: /\bslot\b[^.]*\bover\b|\bover\b[^.]*\bslot\b/i, wants: /\b(?:clock|watch)\b/i },
];
/** Letters on a thing, by this eval's own words: anything written, labelled or said on it. */
const LETTERS =
  /["“”]|\b(?:reads?|reading|written|writing|lettered|labell?ed|label|says|saying|spelled|words?|letters?|names?|numbers?|digits?)\b/i;
/** Readable, by this eval's own words: marks nobody can read, or none said to be there, are not. */
const lettered = (x: string) =>
  LETTERS.test(
    x.replace(
      /\b(?:unreadable|illegible)(?:\s+\w+){0,2}|\b(?:no|without)\s+(?:\w+\s+){0,2}(?:writing|letters|numbers|numerals|words)\b/gi,
      ' ',
    ),
  );

type Count = {
  beats: number;
  device: number;
  inPicture: number;
  said: number;
  letters: number;
  devices: number;
  bubbles: number;
  lettering: number;
  letteringWrong: number;
  written: number;
  writtenNoDevice: number;
  writtenUnlettered: number;
  writtenOtherText: number;
  writtenOtherThing: number;
  dreamsWithBubbles: number;
  errors: number;
};
const zero = (): Count => ({
  beats: 0,
  device: 0,
  inPicture: 0,
  said: 0,
  letters: 0,
  devices: 0,
  bubbles: 0,
  lettering: 0,
  letteringWrong: 0,
  written: 0,
  writtenNoDevice: 0,
  writtenUnlettered: 0,
  writtenOtherText: 0,
  writtenOtherThing: 0,
  dreamsWithBubbles: 0,
  errors: 0,
});
const total = { before: zero(), after: zero() };
const views = { before: new Map<string, string>(), after: new Map<string, string>() };
const out: string[] = [];

/** By this eval's own reading: every word of a lettering in the dream's own text, a day's first letters, or the week. */
const letteringExact = (text: string, dream: string) => {
  const norm = (x: string) =>
    ` ${x
      .toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/(\d)\.(\d\d)(?=\s*[ap]\.?\s?m)/g, '$1:$2')
      .replace(/(\d)\s*p\.?\s?m\.?/g, '$1pm')
      .replace(/(\d)\s*a\.?\s?m\.?/g, '$1am')
      .replace(/\s*-\s*/g, '-')
      .replace(/[^\p{L}\d:-]+/gu, ' ')} `;
  const d = norm(dream);
  const week = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/.test(d);
  const tokens = norm(text).trim().split(/\s+/);
  if (tokens.join('') === 'mtwtfss') return week;
  return tokens.every(
    (t) =>
      d.includes(` ${t} `) ||
      (/^\p{L}{3}$/u.test(t) &&
        new RegExp(`\\s${t}(?:day|nesday|sday|rsday|urday|uary|ruary|ch|il|e|y|ust|tember|ober|ember)s?\\s`).test(d)),
  );
};

/**
 * By this eval's own reading, sentence by sentence: one saying something is written, lettered, printed, circled or
 * marked (never "marked by"), with a time, a day or a capitalised month the dream gives; the date as a word to match.
 */
const writtenIn = (words: string, dream: string): { sentence: string; date: string } | null => {
  const text = words
    .replace(/[–—]/g, '-')
    .replace(/(\d)\.(\d\d)(?=\s*[ap]\.?\s?m)/gi, '$1:$2')
    .replace(/(\d)\s*([ap])\.?\s?m\.?(?=\W|$)/gi, '$1$2m');
  for (const sentence of text.split(/[.;!?](?=\s|$)/)) {
    if (!/\b(?:written|lettered|printed|circled|marked(?! by))\b/i.test(sentence)) continue;
    const date =
      sentence.match(/\b\d{1,2}(?::\d\d)?(?:-\d{1,2}(?::\d\d)?)?[ap]m\b/i)?.[0] ??
      sentence.match(/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day/i)?.[0] ??
      sentence.match(/\b(?:January|February|March|April|June|July|August|September|October|November|December)\b/)?.[0];
    if (date && letteringExact(/\d/.test(date) ? date : date.slice(0, 3), dream)) return { sentence, date };
  }
  return null;
};

function measure(s: Session, step: string, into: Count, id: string, text: string): void {
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
    const reading = step === 'on' ? (s.draft?.readings?.devices ?? null) : null;
    const devices = reading?.devices ?? [];
    into.devices += devices.length;
    into.bubbles += devices.filter((d) => d.where === 'bubble').length;
    if (devices.some((d) => d.where === 'bubble')) into.dreamsWithBubbles++;
    const dreamText = [
      text,
      r.b.logline,
      ...r.b.scenes.flatMap((sc) => sc.moments.map((m) => `${m.action} ${m.visual_point ?? ''}`)),
    ].join(' ');
    for (const d of devices) {
      if (side === 'after')
        out.push(
          `device ${id}: ${d.name} [${d.where}${d.by ? ` by ${d.by}` : ''}${d.lettering ? `, "${d.lettering.text}" on ${d.lettering.on}` : ''}] (${d.look}) ${Object.entries(
            d.moments,
          )
            .map(([m, a]) => `${m}: ${a.shows}${a.act ? ` / ${a.act}` : ''}`)
            .join('; ')}`,
        );
      // Something to read left anywhere in its words, by this eval's own reading.
      const texts = [d.name, d.look, ...Object.values(d.moments).flatMap((a) => [a.shows, a.act])];
      if (texts.some((x) => lettered(x) || /\d\s*(?:am|pm)\b|\d+-\d+/i.test(x)))
        out.push(`  letters in its words: ${id} ${d.id}`);
      if (d.lettering) {
        into.lettering++;
        if (!letteringExact(d.lettering.text, dreamText)) {
          into.letteringWrong++;
          out.push(`  lettering not the dream's own: ${id} ${d.id} "${d.lettering.text}"`);
        }
      }
    }
    const grandma = /\bgrand(?:ma|mother)\b/i.test(JSON.stringify(r.b.people.map((p) => p.name)));
    const things = new Map((r.b.things ?? []).map((t) => [t.id, t]));
    const prompts = new Map(r.pictures.map((p) => [p.id, p.prompt]));
    for (const c of r.plan.cuts) {
      views[side].set(`${id} ${c.id}`, `${JSON.stringify(c.eye ?? null)} ${prompts.get(c.id) ?? ''}`);
      const m = r.b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === c.id);
      // A moment whose words say the dream's own day or time is written on something, and its cut's lettering: no
      // device, a device unlettered, lettering not of the date said, or lettering on a thing the sentence does not name.
      const said = m ? writtenIn(`${m.visual_point ?? ''}. ${m.action}`, dreamText) : null;
      if (said) {
        into.written++;
        const mine = devices.filter((d) => d.moments[c.id] && d.where !== 'bubble');
        const lettered = mine.filter((d) => d.lettering);
        const flat = (x: string) => x.toLowerCase().replace(/[^\p{L}\d]/gu, '');
        const named = (d: (typeof mine)[number]) =>
          (d.name.toLowerCase().match(/\p{L}{4,}/gu) ?? []).some((w) => said.sentence.toLowerCase().includes(w));
        const why = !mine.length
          ? 'no device'
          : !lettered.length
            ? 'no lettering'
            : !lettered.some((d) =>
                  flat(d.lettering!.text).includes(flat(said.date).slice(0, /\d/.test(said.date) ? 99 : 3)),
                )
              ? 'other lettering'
              : !lettered.some(named)
                ? 'lettering on another thing'
                : '';
        if (why === 'no device') into.writtenNoDevice++;
        if (why === 'no lettering') into.writtenUnlettered++;
        if (why === 'other lettering') into.writtenOtherText++;
        if (why === 'lettering on another thing') into.writtenOtherThing++;
        if (why) out.push(`${side.padEnd(6)} ${id} ${c.id}: "${said.sentence.trim()}" written, ${why}`);
      }
      if (!m || !grandma) continue;
      const words = `${m.action} ${m.visual_point ?? ''}`;
      const plan = c.eye ? shotPlan(r.b, c.id, r.rec) : undefined;
      for (const b of BEATS.filter((x) => x.says.test(words))) {
        into.beats++;
        // A device of the kind it wants: on the plan, in someone's hands, or a bubble by someone's head holding it.
        const d = devices.find((x) => x.moments[m.id] && b.wants.test(`${x.name} ${x.look} ${x.moments[m.id].shows}`));
        const spot = d ? plan?.spots.find((x) => x.id === d.id) : undefined;
        const prompt = prompts.get(c.id) ?? '';
        const inPicture =
          !!d &&
          ((c.sees ?? []).includes(d.id) ||
            (!!spot?.heldBy && (c.sees ?? []).includes(spot.heldBy)) ||
            (d.where === 'bubble' && (c.sees ?? []).includes(d.by ?? '')) ||
            (d.where === 'bubble' && m.eyes !== 'dreamer' && !!d.by));
        const said =
          (!!d && prompt.includes(d.name.replace(/^the\s+/i, ''))) ||
          (!!d && d.where === 'bubble' && /\bbubble\b/.test(prompt));
        const letters = !!d && [d.name, d.look, d.moments[m.id].shows].some((x) => lettered(x));
        into.device += Number(!!d);
        into.inPicture += Number(inPicture);
        into.said += Number(said);
        into.letters += Number(letters);
        out.push(
          `${side.padEnd(6)} ${id} ${c.id} "${b.beat}": device ${d ? d.name : 'none'}, in the picture ${inPicture}, said ${said}${letters ? ', LETTERS' : ''}`,
        );
      }
    }
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

// Each dream loaded with the step before it and with it: the device reading is put in only with it.
for (const { id, load } of sources) {
  const loadAs = async (step: string) => {
    process.env.DREAMCHAT_ONE_BUILDER = step;
    try {
      return await load();
    } catch {
      return undefined;
    }
  };
  const a = await loadAs(before);
  const b2 = await loadAs('on');
  if (!a?.draft?.breakdown || !a.style || !b2) continue;
  const text = ((a as { transcript?: { role: string; content: string }[] }).transcript ?? [])
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .join('\n');
  measure(a, before, total.before, id, text);
  measure(b2, 'on', total.after, id, text);
}
let moved = 0;
for (const [k, v] of views.before) if (views.after.get(k) !== v) moved++;
console.log(JSON.stringify({ dreams: sources.length, step: before, ...total, cutsMoved: moved }));
if (list) for (const l of out.sort()) console.log(`  ${l}`);
