// A moment whose beat is said, asked, planned, a time or a schedule shows it by something seen (the one builder's
// `visible_device` step): one writer reading per dream. People standing in a kitchen do not show "only on Wednesdays",
// "the 2-3pm appointment", "asks if she has eaten" or "our slot has gotten over": in the merged flow's Grandmother on
// Wednesdays each was two people facing each other, with nothing in the picture to tell it (2 Oct). Drawn by another
// harness with a week of days and hers among them, an appointment card in the dreamer's hand, a wall clock going from
// two to three and her pointing at it, a stranger read every picture right. Each such moment gets one thing from the
// dream's own words where they give one, the plainest one they imply otherwise: how it looks, what it shows right then
// and who does what with it. On it only the dream's own day or time, lettered in code after the picture is drawn (the
// owner, 2 Oct), every other writing marks no one can read; a thought or speech bubble with a picture in it only for a
// said or thought beat no thing shows, one in a dream at most.
import { smallSizeOf, withCastSpots } from './castplace';
import type { Blocking, Spot } from './blocking';
import { roomOf, sizeOf } from './blocking';

const isPerson = (s: Spot) => s.kind === 'person' || (!s.kind && (!!s.pose || !!s.many));
import type { ChatMessage } from './llm';
import { type Breakdown, moments as momentsOf, type Thing } from './producer';
import type { Item } from './sheets';

/**
 * Where a device is: up on a wall, in someone's hands, on a table or counter, standing on the floor, or a thought or
 * speech bubble by someone's head.
 */
export type DeviceWhere = 'wall' | 'held' | 'table' | 'floor' | 'bubble';
/** The words lettered on it, exactly the dream's own (a day, a time), and what of it they are on: lettered in code. */
export type Lettering = { text: string; on: string };
/** What it shows in one moment, and who does what with it then. */
export type DeviceAt = { beat: string; shows: string; act: string };
export type Device = {
  /** v1, v2 … in the reading's order. */
  id: string;
  name: string;
  look: string;
  where: DeviceWhere;
  /** Whom it is by or held by (a bubble's: whose it is): a person's id, or none. */
  by: string | null;
  /** A bubble's kind: what they think, or what they say. */
  bubble?: 'thought' | 'speech';
  /** The dream's own words lettered on it, where it bears any. */
  lettering?: Lettering;
  /** One of the dream's own things (its id is that thing's): never cast again, never sketched again. */
  known?: true;
  moments: Record<string, DeviceAt>;
};
export type DevicesReading = { devices: Device[] };

const WHERE = new Set<DeviceWhere>(['wall', 'held', 'table', 'floor', 'bubble']);

const DEVICES = `A dream is drawn as one picture per moment, with no sound. Some moments' one thing to show is something said, asked, decided or planned, a time, a day, a schedule or a time running out, which people standing there do not show by themselves ("told they got the 2-3pm appointment", "asks if she has eaten", "our slot is over", "only on Wednesdays"). For each such moment below, choose ONE thing seen in the picture that carries it: from the dream's own words where they give one (a wall clock for a time, a calendar or a week of days for a day, a plate of food for eating, an appointment card for an appointment), else the plainest everyday thing its words imply; how it looks; what it shows right then ("its hands at three", "the Wednesday circled", "a full plate, untouched"); and who does what with it, if anyone ("grandmother pointing at it", "the dreamer holding it out"). Lettering on it only where the dream's own words give it, short and exactly theirs: a day or a time ("WED", "2-3 PM"), never anything else; any other writing on it is unreadable marks. Only for a beat that is said or thought, and only where no thing shows it better, a thought or speech bubble by the speaker's head, a picture inside it and no words ("a bowl of soup", "a question mark"). Use the same thing again where another moment in the same place needs it (the same clock, at three now). Leave out every moment that its people, what they do and what is there already show.
Return JSON only: {"devices": [{"name": "the wall clock", "look": "a round wall clock, plain white face, black hands", "where": "wall" or "held" or "table" or "floor" or "bubble", "bubble": "thought" or "speech" (a bubble only), "by": "<the id of whom it is by, held by, or whose bubble it is, or null>", "lettering": {"text": "WED 2-3 PM", "on": "the card's face"} or null, "moments": {"<moment id>": {"beat": "<the moment's own words it carries, copied exactly>", "shows": "its hands at three", "act": "grandmother pointing at it, or empty"}}}]}, or {"devices": []} where no moment needs one.`;

/** The writer's question for a dream's devices: its words, its people, things and places, and its moments. */
export function devicesAsk(b: Breakdown, text: string): ChatMessage[] {
  const people = b.people.map((p) => `- ${p.id}: ${p.name}${p.is_dreamer ? ' (the dreamer)' : ''}`);
  const things = (b.things ?? []).map((t) => `- ${t.id}: ${t.name}`);
  const places = b.places.map((p) => {
    const f = p.fields as Record<string, { value?: string | null } | undefined>;
    return `- ${p.id}: ${p.name}${f?.landmarks?.value ? ` (in it: ${f.landmarks.value})` : ''}`;
  });
  const moments = momentsOf(b).map(
    (m) =>
      `- ${m.id} (at ${m.place}; in it: ${m.visible.join(', ') || 'no one'}): ${m.action}${m.visual_point ? ` | shows: ${m.visual_point}` : ''}`,
  );
  return [
    { role: 'system', content: DEVICES },
    {
      role: 'user',
      content: `The dream, in the dreamer's words:\n${text.trim() || b.logline}\n\nWho is in it:\n${people.join('\n')}\n\nThings in it:\n${things.join('\n') || '- none'}\n\nPlaces:\n${places.join('\n')}\n\nThe moments:\n${moments.join('\n')}`,
    },
  ];
}

/** Something on it to read, said: what reads, is written or labelled, or bears letters, numbers, words or names. */
const LETTERS =
  /["“”]|\b(?:reads?|reading|written|writing|lettered|lettering|labell?ed|labels?|says|saying|spelled|printed|print|typed|type|font|capitals?|inscribed|engraved|stamped|words?|letters?|numerals?|numbers?|digits?|figures|totals?|names?|captions?|text)\b/i;
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
/** A day or a month by its name: on a thing, it would be read. */
const CALENDAR_WORD = new RegExp(`\\b(?:${[...DAYS, ...MONTHS].join('|')})s?\\b`, 'i');
/** A time, or a number on a thing: "2-3 PM", "at 4pm", "45". */
const TIME = /\d\s*(?:-\s*\d+\s*)?(?:a\.?\s?m\.?|p\.?\s?m\.?)\b|\d+:\d+/i;
/** Said only to say there is none: "no numerals", "without writing". */
const NONE_OF =
  /\b(?:no|without|never any|free of)\s+(?:\w+\s+){0,2}(?:writing|letters?|numerals?|numbers?|digits?|words?|labels?|names?|text)\b(?:\s*(?:or|,|and)\s*(?:writing|letters?|numerals?|numbers?|digits?|words?|labels?|names?|text))*/gi;
/** Marks nobody can read, which a picture may have: "a line of unreadable marks". */
const UNREADABLE =
  /\b(?:(?:a |the )?(?:line|lines|row|rows|scrawl|scribble) of )?(?:unreadable|illegible)(?:\s+\w+){0,2}/gi;
const bare = (x: string) => x.replace(NONE_OF, ' ').replace(UNREADABLE, ' ');
/** Something on a thing to read, in its name or look: writing words, a day or month by name, a time or any number. */
const readableOn = (x: string) => LETTERS.test(bare(x)) || CALENDAR_WORD.test(bare(x)) || /\d/.test(bare(x));
/** Something to read in what it shows or what is done with it: writing words or a time ("hands at three" is no time). */
const readableIn = (x: string) =>
  LETTERS.test(bare(x).replace(/\b(?:reads?|reading)\b/gi, ' ')) || TIME.test(bare(x)) || /\d/.test(bare(x));
/** Every clause that says what is written on it left out: its lettering, if any, is put on in code. */
const without = (x: string, readable: (c: string) => boolean) => {
  const pieces = x.split(/(?<=[,;])\s*|\s+(?=(?:above|below|beside|under|over|with|and)\s)/);
  const kept: string[] = [];
  let dropped = false;
  for (const c of pieces) {
    const gone = readable(c);
    // A piece right after one taken out, with nothing of its own ("under it" of "2-3 PM printed under it"): gone too.
    const orphan: boolean =
      dropped && /^(?:above|below|beside|under|over|with|and)\s+(?:\S+\s*){0,2}[,;]?$/i.test(c.trim());
    if (!gone && !orphan) kept.push(c);
    dropped = gone;
  }
  return kept
    .join(' ')
    .replace(/[,;\s]+$/, '')
    .replace(/\s+(?:above|below|beside|under|over|with|and)$/, '')
    .trim();
};

/** A time or a day as one word: "2–3 p.m." is "2-3pm"; "a Monday" stays a Monday. */
const tokenOf = (x: string) =>
  x
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/(\d)\s*p\.?\s?m\.?/g, '$1pm')
    .replace(/(\d)\s*a\.?\s?m\.?/g, '$1am')
    .replace(/\s*-\s*/g, '-');
/**
 * Lettering kept only where every word of it is a day, a month or a time the dream's own words give: a day or a month
 * it names, whole or by its first letters ("WED" of "Wednesdays"); a time it says, exactly ("2-3 PM" of "the 2-3pm
 * appointment", never "2" or "PM" alone); or the days of the week by their first letters where it names one ("M T W T
 * F S S"). A few words at most; never anything else.
 */
export function letteringOf(raw: unknown, dream: string): Lettering | undefined {
  const y = (raw ?? {}) as Record<string, unknown>;
  const text = typeof y.text === 'string' ? y.text.trim() : '';
  const on = typeof y.on === 'string' ? y.on.trim() : '';
  if (!text || !on || text.length > 24 || readableOn(on)) return undefined;
  const words = tokenOf(dream)
    .split(/[^\p{L}\d:-]+/u)
    .filter(Boolean);
  // A day or a month the dream names as one: capitalised ("Wednesdays", "in May"), a month starting a sentence only
  // where a date goes with it; never "she may come", "soldiers march".
  const names = [...DAYS, ...MONTHS].map((x) => x[0].toUpperCase() + x.slice(1));
  const named = new Set<string>();
  for (const hit of dream.matchAll(new RegExp(`(^|[.!?]\\s+|\\S\\s+)(${names.join('|')})s?\\b(\\s+\\d)?`, 'g'))) {
    const day = hit[2].toLowerCase();
    const opens = /^$|[.!?]\s+$/.test(hit[1]);
    if (DAYS.includes(day) || !opens || hit[3]) named.add(day);
  }
  const times = new Set(words.filter((x) => /\d/.test(x) && /(?:am|pm)$/.test(x)));
  const tokens = tokenOf(text)
    .split(/\s+/)
    .map((t) => t.replace(/[.,;]+$/, ''));
  // The week by its first letters, where the dream names a day of it.
  if (isWeek(text) && DAYS.some((d) => named.has(d))) return { text, on };
  if (tokens.length > 4) return undefined;
  const ok = tokens.every((w) =>
    /\d/.test(w)
      ? times.has(w)
      : w.length >= 3 && [...named].some((x) => x === w.replace(/s$/, '') || (w.length <= 4 && x.startsWith(w))),
  );
  return ok ? { text, on } : undefined;
}
const low = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
const words = (x: string, most: number) => x.trim().split(/\s+/).filter(Boolean).length <= most;

/** What a name is about: its last word, without an article ("the kitchen wall clock" is a clock). */
const headOf = (name: string) =>
  name
    .toLowerCase()
    .split(/,|\s(?:of|in|on|with|for|from|by|at)\s/)[0]
    .match(/\p{L}+/gu)
    ?.at(-1) ?? '';

/**
 * The writer's answer read: a device kept only where it is a thing (a few words, nothing on it to read), where it is,
 * for moments of the dream whose own words it carries, each what it shows and who does what with it in a few words,
 * nothing to read in them either; whoever holds it, or whose bubble it is, in that moment. One device a moment: the
 * things first, then at most one bubble in the dream, for a moment no thing shows.
 */
export function parseDevices(content: string, b: Breakdown, text = ''): { reading: DevicesReading; dropped: string[] } {
  const dropped: string[] = [];
  let raw: { devices?: unknown } = {};
  try {
    raw = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof raw;
  } catch {
    return { reading: { devices: [] }, dropped: ['not JSON'] };
  }
  const people = new Map(b.people.map((p) => [p.id, p]));
  const named = new Set([...b.people, ...(b.things ?? [])].map((x) => low(x.name)));
  const byMoment = new Map(momentsOf(b).map((m) => [m.id, m]));
  // The dream's words: its text, and every moment's.
  const dream = [text, b.logline, ...momentsOf(b).map((m) => `${m.action} ${m.visual_point ?? ''}`)].join(' ');
  const content4 = (x: string) => (x.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !STOP.has(w));
  // Whom an act names, by what their name is about, or "the dreamer".
  const named_in = (act: string) =>
    b.people
      .filter((p) => new RegExp(`\\b${p.is_dreamer ? 'dreamer' : headOf(p.name)}\\b`, 'i').test(act))
      .map((p) => p.id);
  const taken = new Set<string>();
  const things: Device[] = [];
  const bubbles: Device[] = [];
  const all = Array.isArray(raw.devices) ? (raw.devices as unknown[]) : [];
  // The things first, then the bubbles: a bubble is for a moment no thing shows.
  const ordered = [
    ...all.filter((x) => (x as { where?: unknown })?.where !== 'bubble'),
    ...all.filter((x) => (x as { where?: unknown })?.where === 'bubble'),
  ];
  for (const x of ordered) {
    const y = (x ?? {}) as Record<string, unknown>;
    const name = typeof y.name === 'string' ? y.name.trim() : '';
    // What it says on it is lettering, never its look: a look telling "a time written in bold" draws one.
    const look = without(typeof y.look === 'string' ? y.look.trim() : '', readableOn);
    const where = y.where as DeviceWhere;
    const by = typeof y.by === 'string' && people.has(y.by) ? y.by : null;
    if (!name || !words(name, 5) || readableOn(name) || !/^[\p{L}' .-]+$/u.test(name)) {
      dropped.push(`"${name}": not a thing`);
      continue;
    }
    // A thing the dream already has by this very name is that thing: never a second one.
    const same = (b.things ?? []).find((t) => low(t.name) === low(name));
    if (!WHERE.has(where) || ((where === 'held' || where === 'bubble') && !by)) {
      dropped.push(
        `"${name}": where "${String(y.where)}"${where === 'held' || where === 'bubble' ? ', by no one' : ''}`,
      );
      continue;
    }
    if (where === 'bubble' && bubbles.length) {
      dropped.push(`"${name}": a bubble already in the dream`);
      continue;
    }
    const bubble = where === 'bubble' ? (y.bubble === 'speech' ? 'speech' : 'thought') : undefined;
    const lettering = y.lettering && !bubble ? letteringOf(y.lettering, dream) : undefined;
    if (y.lettering && !bubble && !lettering) dropped.push(`"${name}": lettering not the dream's own day or time`);
    const moments: Record<string, DeviceAt> = {};
    const given = y.moments && typeof y.moments === 'object' ? (y.moments as Record<string, unknown>) : {};
    for (const [mid, v] of Object.entries(given)) {
      const m = byMoment.get(mid);
      const at = (v ?? {}) as Record<string, unknown>;
      const beat = typeof at.beat === 'string' ? at.beat.trim() : '';
      // What is written on it is its lettering, never what it shows: "the 2-3 PM slot written on its face" is its face.
      const rawShows = typeof at.shows === 'string' ? at.shows.trim() : '';
      const shown = without(rawShows, readableIn);
      const shows = shown || (rawShows && !bubble ? 'its face turned outward' : '');
      const rawAct = without(typeof at.act === 'string' ? at.act.trim() : '', readableIn);
      if (!m) {
        dropped.push(`"${name}" ${mid}: not a moment of the dream`);
        continue;
      }
      const there = new Set(m.visible);
      // An act about someone the moment does not have is left out: "grandmother pointing at it" where she is not.
      const act = named_in(rawAct).every((id) => there.has(id) || (people.get(id)?.is_dreamer && m.eyes === 'dreamer'))
        ? rawAct
        : '';
      const words_m = low(`${m.action} ${m.visual_point ?? ''}`);
      // The beat its words: the moment's own, or the dream's where they share a word with the moment's.
      const who = new Set(b.people.flatMap((p) => [headOf(p.name), ...(p.is_dreamer ? ['dreamer'] : [])]));
      const beatOk =
        beat.length >= 8 &&
        beat.split(/\s+/).length >= 2 &&
        content4(beat).some((w) => !who.has(w)) &&
        (words_m.includes(low(beat)) ||
          (low(dream).includes(low(beat)) && content4(beat).some((w) => content4(words_m).includes(w))));
      if (taken.has(mid)) dropped.push(`"${name}" ${mid}: the moment has its device`);
      else if (!beatOk) dropped.push(`"${name}" ${mid}: "${beat}" not its moment's words`);
      else if (
        (where === 'held' || where === 'bubble') &&
        by &&
        !there.has(by) &&
        !(where === 'held' && people.get(by)?.is_dreamer && m.eyes === 'dreamer')
      )
        dropped.push(`"${name}" ${mid}: ${by} not in the moment`);
      else if (bubble && people.get(by!)?.is_dreamer && m.eyes === 'dreamer')
        dropped.push(`"${name}" ${mid}: the dreamer's own bubble through their own eyes`);
      else if (!shows || content4(shows).length === 0 || !words(shows, 15) || !words(act, 15))
        dropped.push(`"${name}" ${mid}: what it shows unsaid`);
      else {
        moments[mid] = { beat, shows, act };
        taken.add(mid);
      }
    }
    if (!Object.keys(moments).length) continue;
    const device: Device = {
      id: same?.id ?? '',
      ...(same ? { known: true as const } : {}),
      name,
      look,
      where,
      by,
      ...(bubble ? { bubble } : {}),
      ...(lettering ? { lettering } : {}),
      moments,
    };
    (bubble ? bubbles : things).push(device);
  }
  let n = 0;
  return {
    reading: { devices: [...things, ...bubbles].map((d) => (d.known ? d : { ...d, id: `v${++n}` })) },
    dropped,
  };
}

/** Words that say nothing of what a beat is about. */
const STOP = new Set([
  'that',
  'this',
  'with',
  'from',
  'into',
  'their',
  'there',
  'them',
  'they',
  'were',
  'have',
  'what',
  'when',
  'where',
  'just',
  'only',
  'again',
  'still',
  'then',
  'than',
  'over',
  'very',
]);

/**
 * The reading with each device the dream already has, by what it is (the kitchen clock its cast already put on the
 * wall), as that thing: never a second clock beside the first. A bubble is never one of its things.
 */
export function withKnown(reading: DevicesReading, b: Breakdown): DevicesReading {
  const things = b.things ?? [];
  const used = new Set(reading.devices.map((d) => d.id));
  return {
    devices: reading.devices.map((d) => {
      // Only what hangs in a place, of which it has one (a clock, a calendar), never lettered: a card, a strip or a plate
      // the dream has is another card, strip or plate ("the appointment card" is no "birthday card").
      if (d.where !== 'wall' || d.lettering || d.known || things.some((t) => t.id === d.id)) return d;
      const same = things.find(
        (t) =>
          !/^v\d+$/.test(t.id) &&
          !used.has(t.id) &&
          /^(?:clock|calendar)$/.test(headOf(d.name)) &&
          headOf(t.name) === headOf(d.name),
      );
      if (!same) return d;
      used.add(same.id);
      return { ...d, id: same.id, name: same.name, known: true };
    }),
  };
}

/** The breakdown with each device a thing, in view at every moment that has it, its look its appearance, said. */
export function withDeviceThings(b: Breakdown, reading: DevicesReading | null | undefined): Breakdown {
  if (!reading?.devices.length) return b;
  const out = structuredClone(b);
  const byId = new Map(momentsOf(out).map((m) => [m.id, m]));
  for (const d of reading.devices) {
    // A bubble is no thing of the dream: drawn by its speaker's head from its words.
    if (d.where === 'bubble') continue;
    if ((out.things ?? []).some((t) => t.id === d.id)) {
      for (const mid of Object.keys(d.moments)) {
        const m = byId.get(mid);
        if (m && !m.things.includes(d.id)) m.things.push(d.id);
      }
      continue;
    }
    const thing: Thing = {
      id: d.id,
      name: d.name,
      fields: { appearance: { value: d.look || null, said: !!d.look }, materials: { value: null, said: false } },
    };
    (out.things ??= []).push(thing);
    for (const mid of Object.keys(d.moments)) {
      const m = byId.get(mid);
      if (m && !m.things.includes(d.id)) m.things.push(d.id);
    }
  }
  return out;
}

/** The dream's items with each device's sketch to be made, as for any prop: waiting, its look its words. */
export function withDeviceItems(items: Item[], reading: DevicesReading | null | undefined): Item[] {
  if (!reading?.devices.length) return items;
  const out = [...items];
  for (const d of reading.devices) {
    // A bubble is drawn by its speaker's head from its words: a sketch of it alone would be put in as a thing.
    if (d.where === 'bubble' || d.known || out.some((x) => x.id === d.id)) continue;
    // Drawn with the place for its lettering blank: the lettering is put on in code.
    const look = [d.look, d.lettering ? `${d.lettering.on} blank, nothing on it` : ''].filter(Boolean).join(', ');
    out.push({
      id: d.id,
      kind: 'prop',
      name: d.name,
      fields: { appearance: { value: look || null, said: !!look }, materials: { value: null, said: false } },
      status: 'waiting',
      version: 0,
    });
  }
  return out;
}

/** What opens in a wall, where nothing hangs. */
const OPENING = /\b(?:windows?|doors?|doorway|gate|hatch|opening|arch|archway|porthole|skylight)\b/i;

/** A device's size by what it is, where its words give none, across, deep and tall. */
const DEVICE_SIZE: [RegExp, [number, number, number]][] = [
  [/\bclocks?$/, [0.35, 0.05, 0.35]],
  [/\b(?:calendars?|planners?|timetables?|schedules?)$/, [0.45, 0.02, 0.6]],
  [/\b(?:strips?|weeks?)$/, [0.8, 0.02, 0.15]],
  [/\b(?:cards?|tickets?|slips?)$/, [0.09, 0.06, 0.003]],
  [/\b(?:bills?|notes?|letters?|forms?)$/, [0.21, 0.3, 0.003]],
  [/\b(?:plates?|dishes?)$/, [0.26, 0.26, 0.04]],
  [/\b(?:bowls?)$/, [0.16, 0.16, 0.08]],
  [/\b(?:bottles?)$/, [0.08, 0.08, 0.22]],
  [/\b(?:laptops?|screens?)$/, [0.34, 0.24, 0.02]],
  [/\b(?:signs?|posters?|boards?|notices?)$/, [0.6, 0.03, 0.45]],
];
const sizeOfDevice = (d: Device): [number, number, number] | undefined =>
  smallSizeOf(d.name, d.look) ?? DEVICE_SIZE.find(([re]) => re.test(headOf(d.name)))?.[1];
/** A wall device's size where nothing gives one. */
const ON_WALL: [number, number, number] = [0.35, 0.04, 0.35];
/** What is sat, lain or ridden on, never the table a thing is put on. */
const NOT_A_TABLE =
  /\b(?:sofa|couch|bed|chair|seat|stool|bench|coffin|car|boat|bus|train|cart|tractor|bath|tub|toilet|piano|horse)\b/i;

/**
 * The plan with each device this moment has placed: in the hands of whoever holds it; on the table or counter by
 * whoever it is by; up on the wall nearest them, at eye height; else on the floor beside them. Nothing already on the
 * plan moves; a device the plan has already is left as it is.
 */
export function withDevices(
  plan: Blocking,
  reading: DevicesReading,
  moment: { id: string; action: string; visual_point?: string | null },
  dreamerId?: string,
): Blocking {
  let out = plan;
  for (const d of reading.devices) {
    // A bubble is drawn by its speaker's head, never on the floor plan.
    if (d.where === 'bubble' || !d.moments[moment.id]) continue;
    // One of the dream's own things already on the plan stays where it is, unless it hangs on a wall: the clock its cast
    // stood by her is put up on the wall.
    const had = out.spots.find((s) => s.id === d.id);
    if (had && !(d.known && d.where === 'wall' && had.above === undefined)) continue;
    if (had) out = { ...out, spots: out.spots.filter((s) => s.id !== d.id) };
    const by =
      out.spots.find((s) => s.id === d.by) ??
      out.spots.find((s) => s.id === dreamerId) ??
      out.spots.find((s) => isPerson(s) && !s.many);
    // Nobody to place it by: left to the words.
    if (!by) continue;
    // The place's own clock or calendar, by its words, is this one: where it hangs, never a second beside it.
    const fixture =
      d.where === 'wall' && /^(?:clock|calendar)$/.test(headOf(d.name))
        ? out.spots.find((s) => s.fixture && headOf(s.name ?? '') === headOf(d.name))
        : undefined;
    if (fixture) {
      out = {
        ...out,
        spots: [
          ...out.spots.filter((s) => s.id !== fixture.id),
          { ...fixture, id: d.id, name: d.name, fixture: undefined },
        ],
      };
      continue;
    }
    const size = sizeOfDevice(d);
    if (d.where === 'held' && by) {
      out = {
        ...out,
        spots: [
          ...out.spots,
          { id: d.id, kind: 'thing', name: d.name, x: by.x, y: by.y, size: size ?? [0.15, 0.1, 0.02], heldBy: by.id },
        ],
      };
      continue;
    }
    if (d.where === 'wall' && out.indoors && by) {
      const [w, dp] = roomOf(out);
      const [sw, sd, sh] = size ?? ON_WALL;
      // A wall nearest whoever it is by, flat against it, its middle at eye height, clear of every window and door in it:
      // put on the window over the sink, the kitchen clock was taken for something seen out past it (Grandmother m10).
      // And of anything against it as high as it hangs (a fridge, a tall cupboard): a clock hangs over a counter, never on
      // a cupboard's door.
      const low = Math.max(0.5, 1.6 - sh / 2);
      const openings = out.spots.filter(
        (t) => !isPerson(t) && !t.heldBy && (OPENING.test(t.name ?? '') || sizeOf(t)[2] + (t.above ?? 0) > low - 0.05),
      );
      const walls = [
        { side: 'front', dist: by.y, along: by.x, len: w },
        { side: 'back', dist: dp - by.y, along: by.x, len: w },
        { side: 'left', dist: by.x, along: by.y, len: dp },
        { side: 'right', dist: w - by.x, along: by.y, len: dp },
      ].sort((a, b) => a.dist - b.dist);
      const pointOf = (side: string, t: number) =>
        side === 'front'
          ? { x: t, y: sd / 2 + 0.02 }
          : side === 'back'
            ? { x: t, y: dp - sd / 2 - 0.02 }
            : side === 'left'
              ? { x: sd / 2 + 0.02, y: t }
              : { x: w - sd / 2 - 0.02, y: t };
      const clear = (p: { x: number; y: number }) =>
        !openings.some((o) => {
          const [ow, od] = sizeOf(o);
          return Math.abs(p.x - o.x) < ow / 2 + sw / 2 + 0.1 && Math.abs(p.y - o.y) < od / 2 + sw / 2 + 0.1;
        });
      let at: { x: number; y: number; side: string } | undefined;
      for (const wall of walls) {
        for (let k = 0; k < 24 && !at; k++) {
          const t = wall.along + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.3;
          if (t < 0.3 || t > wall.len - 0.3) continue;
          const p = pointOf(wall.side, t);
          if (clear(p)) at = { ...p, side: wall.side };
        }
        if (at) break;
      }
      if (at) {
        const spot: Spot = {
          id: d.id,
          kind: 'thing',
          name: d.name,
          x: Math.round(at.x * 100) / 100,
          y: Math.round(at.y * 100) / 100,
          size: at.side === 'front' || at.side === 'back' ? [sw, sd, sh] : [sd, sw, sh],
          above: Math.round(Math.max(0.5, 1.6 - sh / 2) * 100) / 100,
        };
        out = { ...out, spots: [...out.spots, spot] };
        continue;
      }
    }
    // Up on no wall (outdoors, or every wall taken): at eye height beside whoever it is by, as on a post, in the room.
    if (d.where === 'wall') {
      const [sw, sd, sh] = size ?? ON_WALL;
      const [rw] = out.indoors ? roomOf(out) : [Infinity];
      const f = { x: by.x + 0.8 <= rw - 0.3 ? by.x + 0.8 : Math.max(0.3, by.x - 0.8), y: by.y };
      out = {
        ...out,
        spots: [
          ...out.spots,
          {
            id: d.id,
            kind: 'thing',
            name: d.name,
            x: f.x,
            y: f.y,
            size: [sw, sd, sh],
            above: Math.max(0.5, 1.6 - sh / 2),
          },
        ],
      };
      continue;
    }
    // On the table or counter by them (castplace.ts withCastSpots puts a thing on what its words name), else beside them.
    const placed = withCastSpots(
      out,
      {
        things: [
          {
            id: d.id,
            name: d.name,
            look: d.look,
            kind: 'thing',
            moments: [{ id: moment.id, where: 'in' }],
            near: by?.id ?? null,
            side: d.where === 'table' ? 'on the table' : null,
            size: null,
            many: null,
          },
        ],
        bodies: [],
        fixtures: [],
      },
      moment,
      dreamerId,
    );
    // A table the plan does not call one: the counter, the desk; else the nearest thing at a table's height, a block clear
    // of any window or door (the sink, the cutlery drawer). Beside her on the floor, the plate she had not eaten from was
    // below the picture (Grandmother m5).
    const surface = (s: Spot) =>
      s.kind === 'thing' &&
      !s.heldBy &&
      !s.many &&
      !OPENING.test(s.name ?? '') &&
      !NOT_A_TABLE.test(s.name ?? '') &&
      (s.shape ?? 'block') === 'block' &&
      sizeOf(s)[2] >= 0.6 &&
      sizeOf(s)[2] <= 1.2 &&
      Math.min(sizeOf(s)[0], sizeOf(s)[1]) >= 0.3;
    const nearest = (xs: Spot[]) =>
      by
        ? [...xs].sort((a, b) => Math.hypot(a.x - by.x, a.y - by.y) - Math.hypot(b.x - by.x, b.y - by.y))[0]
        : undefined;
    const table =
      d.where === 'table' && !out.spots.some((s) => /\btable\b/i.test(s.name ?? '')) && by
        ? (nearest(
            out.spots.filter((s) => surface(s) && /\b(?:counter|desk|worktop|sideboard|dresser)\b/i.test(s.name ?? '')),
          ) ?? nearest(out.spots.filter(surface)))
        : undefined;
    out = {
      ...placed,
      spots: placed.spots.map((s) =>
        s.id !== d.id ? s : { ...s, ...(size ? { size } : {}), ...(table ? { x: table.x, y: table.y } : {}) },
      ),
    };
  }
  return out;
}

/** What a moment's device shows and who does what with it, as the picture's words say it; none where it has none. */
export function deviceLine(
  reading: DevicesReading | null | undefined,
  momentId: string,
  name: (id: string) => string = (id) => id,
): string | undefined {
  const d = reading?.devices.find((x) => x.moments[momentId]);
  if (!d) return undefined;
  const at = d.moments[momentId];
  if (d.bubble)
    return `a ${d.bubble} bubble by ${name(d.by!)}'s head, holding a picture of ${at.shows}, no words in it${at.act ? `; ${at.act}` : ''}`;
  // Its lettering is put on in code after: drawn, the place for it is blank.
  const blank = d.lettering ? `, ${d.lettering.on} blank, nothing on it` : '';
  // A week of days lettered in code, M to S: the day it shows by its place among them, for the lettering to fall right.
  const week = !!d.lettering && isWeek(d.lettering.text);
  // The day it shows first, as its words say them.
  const firsts = DAYS.map((x) => at.shows.toLowerCase().search(new RegExp(`\\b${x}s?\\b`)));
  const day = week ? firsts.reduce((best, k, i) => (k >= 0 && (best < 0 || k < firsts[best]) ? i : best), -1) : -1;
  const place =
    day >= 0
      ? `, the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][day]} of its seven boxes from the left`
      : '';
  return `${d.name}, ${at.shows}${place}${blank}${at.act ? `; ${at.act}` : ''}`;
}

/** The days of the week by their first letters, however they are spaced or stopped: "M T W T F S S", "M, T, W …". */
const isWeek = (text: string) => text.replace(/[^\p{L}]+/gu, '').toUpperCase() === 'MTWTFSS';

/** What a device is, for its lettering to be put on in code: a card, a strip of days, a sign, or a label. */
const deviceKind = (name: string): 'card' | 'strip' | 'sign' | 'label' =>
  /\b(?:card|ticket|note|slip|letter|envelope)\b/i.test(name)
    ? 'card'
    : /\b(?:strip|week|calendar|planner|diary|schedule|timetable)\b/i.test(name)
      ? 'strip'
      : /\b(?:sign|board|poster|banner|notice)\b/i.test(name)
        ? 'sign'
        : 'label';

/**
 * The lettering on what shows a moment's beat, as its lines must read, for it to be put on in code: the days of the
 * week one to a line in their boxes' order; a day and a time each on a line of its own ("WED", "2–3 PM").
 */
export function letteringItems(
  reading: DevicesReading | null | undefined,
  momentId: string,
  name: (id: string) => string = (id) => id,
): { id: string; text: string[]; device: 'card' | 'strip' | 'sign' | 'label'; on: string; where: string }[] {
  const d = reading?.devices.find((x) => x.moments[momentId] && x.lettering);
  if (!d?.lettering) return [];
  const words = d.lettering.text.trim().split(/\s+/);
  const week = isWeek(d.lettering.text);
  const time = (w: string) => /\d|^(?:am|pm|a\.m\.|p\.m\.)$/i.test(w);
  const lines = week
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : [words.filter((w) => !time(w)).join(' '), words.filter(time).join(' ')].filter(Boolean);
  const where =
    d.where === 'held' && d.by
      ? `on ${d.lettering.on}, in ${name(d.by)}'s hands`
      : d.where === 'wall'
        ? `on ${d.lettering.on}, on the wall`
        : d.where === 'table'
          ? `on ${d.lettering.on}, on the table`
          : `on ${d.lettering.on}`;
  return [{ id: `${d.id}-text`, text: lines, device: week ? 'strip' : deviceKind(d.name), on: d.id, where }];
}
