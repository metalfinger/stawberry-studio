// The cast reading (S6, from the read of every frozen prompt, 30 Sep): one writer call per dream, cached, that lists
// what the moments need drawn and the breakdown never cast (the red tractor the dreamer rides in, the jellyfish
// ahead in the sky, books floating off the shelves, a crowd of boats), and how big each person and creature is
// where the dream says (a cat "as big as a bus", a child "about six years old", a "little" terrier). Nothing is
// taken on the writer's word alone: a thing's name must be in the words of every moment it claims, a body's size
// words in the dream's own text, and anything else is dropped and logged. With the one builder's `cast_named` step,
// the things join the breakdown (as the producer should have cast them) before the plan, the record and the sheet
// read it; the bodies' heights go to the floor plan (continuity, previs). No Jev: the checks are the code's.

import { builds } from './cleanups';
import { type CallResult, type ChatMessage, callDeepseek, type Thinking, WRITER_MODEL } from './llm';
import { type Breakdown, moments as momentsOf, type Thing } from './producer';
import type { Item } from './sheets';

export type { CastBody, CastFixture, CastReading, CastThing } from './cast-types';
import type { CastBody, CastFixture, CastReading, CastThing } from './cast-types';

export const CAST_THINKING = (process.env.DREAMCHAT_CAST_THINKING as Thinking | undefined) ?? 'low';

/** The writer's name, as the cast cache keys it. */
export const castWriterName = () => `${WRITER_MODEL} thinking ${CAST_THINKING}`;

export type WriteFn = (messages: ChatMessage[]) => Promise<CallResult>;

/** The harness's writer, one JSON answer; a blank answer is asked once more. */
export const writeCast: WriteFn = async (messages) => {
  const first = await callDeepseek(messages, { json: true, thinking: CAST_THINKING });
  if (first.content.trim()) return first;
  const second = await callDeepseek(messages, { json: true, thinking: CAST_THINKING });
  return { ...second, ms: first.ms + second.ms };
};

export const CAST_SYSTEM = `You read the breakdown of a dream that is being drawn as pictures, one picture per moment, and list two things the pictures need and the breakdown does not give.

Return JSON only: {"things": [...], "bodies": [...], "fixtures": [...]}. Any list may be empty.

"things": everything a moment's words (its action, its must_show, what the camera faces) need drawn in its picture that is NOT one of the cast (the people, places and things listed with ids): a vehicle someone rides in, an animal or creature, a crowd of things, something seen far off, weather or matter filling the picture. Each: {"name": "...", "look": "...", "kind": "thing"|"creature"|"vehicle"|"weather"|"matter", "moments": [{"id": id, "where": "in"|"beyond"}], "near": id|null, "side": "..."|null, "size": "..."|null, "many": number|null}.
- One entry per thing, however many moments show it: the red tractor seen through a window in one moment and ridden in the next is one entry.
- "name": the fullest name the words give it ("the red tractor", "the pink jellyfish", "the floating books"). Its last word (the thing itself: "tractor", "jellyfish", "books") must appear in the words of each moment you list it for.
- "look": what the dream's words say it looks like (colour, material, size, state), a few words; never invent.
- "moments": every moment whose picture shows it, and only those; for each, "where": "in" when it is in the place that moment happens in (someone rides in it, it stands there), "beyond" when it is seen out past it (through a window, far below, in the sky ahead, on the horizon).
- "near": the id of a cast element the words put it by, else null. "side": the words that say where, else null.
- "size": the dream's own words for how big it is, else null. "many": how many, where the words give a number; null otherwise (a crowd without a number is null with kind "thing").
- Rain, snow, fog, bubbles, water filling a room: kind "weather" or "matter".
- Never list a cast element again, a part of one (the tractor's cab of a cast tractor), a place, or what is only heard, felt, remembered or said.

"bodies": for each cast person or animal whose size the dream's words set, or whose kind is not a grown person: {"id": id, "height_m": number, "shape": "human"|"four-legged"|"bird"|"fish"|"other", "words": "..."}.
- "height_m": how tall they stand, in metres: a grown person 1.7, a six-year-old child 1.15, a cat 0.25, a terrier 0.3, a horse 1.6, a heron 1.0; a size the dream gives overrides the kind's ("a cat as big as a bus" 3.5; "as small as a mouse" 0.08).
- "words": the dream's own words the size rests on ("as big as a bus", "about six years old", "little"), copied exactly; "" where it is the kind's ordinary size.
- Leave out grown people of ordinary size.

"fixtures": for each place, what its own description names that stands in it or is built into it and fixes its layout: windows or doors along its walls, rows of seats or desks, an aisle. Each: {"place": id, "name": "...", "kind": "opening"|"row"|"aisle"|"other", "where": "..."|null, "count": number|null, "words": "..."}.
- "words": the place's own words it rests on, copied exactly ("windows along both sides", "rows of wooden desks facing the board").
- "where": where those words put it ("along each side", "along the left wall", "at the front"), else null. "count": only where the words give a number.
- Only what the words name; never a layout the words do not give, never furniture that is only in a moment's action.`;

/** What the writer is given: the cast by id, and every moment's words. */
export function castAsk(b: Breakdown, told: string[] = []): ChatMessage[] {
  const brief = {
    cast: {
      people: b.people.map((p) => ({
        id: p.id,
        name: p.is_dreamer ? `the dreamer (${p.name})` : p.name,
        ...(p.fields?.appearance?.value ? { looks: p.fields.appearance.value } : {}),
      })),
      places: b.places.map((l) => ({
        id: l.id,
        name: l.name,
        ...(Object.values(l.fields ?? {}).some((d) => (d as { value?: string | null })?.value)
          ? {
              words: Object.values(l.fields ?? {})
                .map((d) => (d as { value?: string | null })?.value)
                .filter(Boolean)
                .join('; '),
            }
          : {}),
      })),
      things: b.things.map((t) => ({ id: t.id, name: t.name })),
    },
    moments: momentsOf(b).map((m) => ({
      id: m.id,
      place: m.place,
      action: m.action,
      ...(m.visual_point ? { must_show: m.visual_point } : {}),
      ...(m.looks_at ? { camera_faces: m.looks_at } : {}),
    })),
    ...(told.length ? { dreamer_said: told } : {}),
  };
  return [
    { role: 'system', content: CAST_SYSTEM },
    { role: 'user', content: JSON.stringify(brief) },
  ];
}

const low = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
/** A name's own words, without a leading article. */
const bare = (x: string) => low(x).replace(/^(?:the|a|an|some)\s+/, '');
/** A name's last word, the thing itself ("tractor" of "the red tractor"): what must be in a moment's words. */
const head = (x: string) => bare(x).split(' ').at(-1) ?? '';
const hasWord = (text: string, w: string) =>
  !!w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
const KINDS = new Set(['thing', 'creature', 'vehicle', 'weather', 'matter']);
const SHAPES = new Set(['human', 'four-legged', 'bird', 'fish', 'other']);

/**
 * The writer's answer, each entry checked against the dream: a thing kept only for the moments whose words hold its
 * name (and dropped with none), never one of the cast; a body only for a cast person with a height in reason and
 * size words that are the dream's own. What is dropped is said why.
 */
export function parseCast(
  content: string,
  b: Breakdown,
  told: string[] = [],
): { reading: CastReading; dropped: string[] } {
  const dropped: string[] = [];
  let raw: { things?: unknown; bodies?: unknown; fixtures?: unknown };
  try {
    raw = JSON.parse(content) as typeof raw;
  } catch {
    return { reading: { things: [], bodies: [], fixtures: [] }, dropped: ['not JSON'] };
  }
  const moments = new Map(momentsOf(b).map((m) => [m.id, m]));
  const wordsOf = (id: string) => {
    const m = moments.get(id);
    return m ? low([m.action, m.visual_point, m.looks_at].filter(Boolean).join(' ')) : '';
  };
  const castNames = [...b.people, ...b.places, ...b.things].map((x) => bare(x.name));
  const ids = new Set([...b.people, ...b.places, ...b.things].map((x) => x.id));
  const text = low(
    [
      ...momentsOf(b).flatMap((m) => [m.action, m.visual_point, m.looks_at]),
      ...b.people.flatMap((p) =>
        Object.values(p.fields ?? {}).map((d) => (d as { value?: string | null })?.value ?? ''),
      ),
      ...b.things.flatMap((t) =>
        Object.values(t.fields ?? {}).map((d) => (d as { value?: string | null })?.value ?? ''),
      ),
      ...told,
    ].join(' '),
  );
  const partOf = [...b.people, ...b.things, ...b.places].map((x) => ({
    id: x.id,
    words: low(
      Object.values(x.fields ?? {})
        .map((d) => (d as { value?: string | null })?.value ?? '')
        .join(' '),
    ),
  }));
  const things: CastThing[] = [];
  for (const x of Array.isArray(raw.things) ? raw.things : []) {
    const t = x as Partial<CastThing>;
    const name = typeof t.name === 'string' ? t.name.trim() : '';
    if (!name || !KINDS.has(String(t.kind))) {
      dropped.push(`thing ${JSON.stringify(name)}: no name or kind`);
      continue;
    }
    if (castNames.includes(bare(name))) {
      dropped.push(`thing "${name}": already cast`);
      continue;
    }
    // Part of someone or something cast, as its own look says it (the girl's yellow raincoat), or of a place, as its
    // landmarks say it (the library's desks and lamps are on its floor plan already): theirs, not a thing apart.
    // Weather and matter fill the picture whoever's look names them (the office's snow).
    const owner =
      t.kind === 'weather' || t.kind === 'matter' ? undefined : partOf.find((x) => x.words.includes(bare(name)));
    if (owner) {
      dropped.push(`thing "${name}": part of ${owner.id}, as their look says`);
      continue;
    }
    const claimed = (Array.isArray(t.moments) ? t.moments : [])
      .map((m) =>
        typeof m === 'string'
          ? { id: m, where: 'in' as const }
          : m && typeof (m as { id?: unknown }).id === 'string'
            ? {
                id: (m as { id: string }).id,
                where: (m as { where?: unknown }).where === 'beyond' ? ('beyond' as const) : ('in' as const),
              }
            : null,
      )
      .filter((m): m is { id: string; where: 'in' | 'beyond' } => !!m);
    const held = claimed.filter((m) => hasWord(wordsOf(m.id), head(name)));
    for (const m of claimed) if (!held.includes(m)) dropped.push(`thing "${name}" at ${m.id}: not in its words`);
    if (!held.length) continue;
    things.push({
      name,
      look: typeof t.look === 'string' ? t.look.trim() : '',
      kind: t.kind as CastThing['kind'],
      moments: held,
      near: typeof t.near === 'string' && ids.has(t.near) ? t.near : null,
      side: typeof t.side === 'string' && t.side.trim() ? t.side.trim() : null,
      size: typeof t.size === 'string' && t.size.trim() && text.includes(low(t.size)) ? t.size.trim() : null,
      many: typeof t.many === 'number' && t.many > 1 && t.many < 1000 ? Math.round(t.many) : null,
    });
  }
  const bodies: CastBody[] = [];
  for (const x of Array.isArray(raw.bodies) ? raw.bodies : []) {
    const y = x as Partial<CastBody>;
    const who = typeof y.id === 'string' ? y.id : '';
    if (!b.people.some((p) => p.id === who)) {
      dropped.push(`body ${JSON.stringify(who)}: not a cast person or animal`);
      continue;
    }
    const h = typeof y.height_m === 'number' ? y.height_m : NaN;
    if (!(h > 0.02 && h < 30)) {
      dropped.push(`body ${who}: height ${String(y.height_m)} out of reason`);
      continue;
    }
    const words = typeof y.words === 'string' ? y.words.trim() : '';
    if (words && !text.includes(low(words))) {
      dropped.push(`body ${who}: "${words}" is not the dream's words`);
      continue;
    }
    bodies.push({
      id: who,
      height_m: Math.round(h * 100) / 100,
      shape: SHAPES.has(String(y.shape)) ? (y.shape as CastBody['shape']) : 'other',
      words,
    });
  }
  const fixtures: CastFixture[] = [];
  const placeText = (id: string) => {
    const l = b.places.find((x) => x.id === id);
    if (!l) return '';
    return low(
      [
        ...Object.values(l.fields ?? {}).map((d) => (d as { value?: string | null })?.value ?? ''),
        ...momentsOf(b)
          .filter((m) => m.place === id)
          .flatMap((m) => [m.action, m.visual_point, m.looks_at]),
      ].join(' '),
    );
  };
  for (const x of Array.isArray(raw.fixtures) ? raw.fixtures : []) {
    const f = x as Partial<CastFixture>;
    const place = typeof f.place === 'string' ? f.place : '';
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    const words = typeof f.words === 'string' ? f.words.trim() : '';
    const kind = ['opening', 'row', 'aisle', 'other'].includes(String(f.kind)) ? (f.kind as CastFixture['kind']) : null;
    if (!placeText(place)) {
      dropped.push(`fixture "${name}": no place ${place}`);
      continue;
    }
    if (!name || !kind || !words || !placeText(place).includes(low(words)) || !hasWord(low(words), head(name))) {
      dropped.push(`fixture "${name}" at ${place}: not the place's own words`);
      continue;
    }
    fixtures.push({
      place,
      name,
      kind,
      where: typeof f.where === 'string' && f.where.trim() ? f.where.trim() : null,
      count: typeof f.count === 'number' && f.count > 0 && f.count < 500 ? Math.round(f.count) : null,
      words,
    });
  }
  return { reading: { things, bodies, fixtures }, dropped };
}

/** The things of a reading that are cast as elements: all but weather and matter, which fill the picture. */
const castable = (reading: CastReading) => reading.things.filter((t) => t.kind !== 'weather' && t.kind !== 'matter');

/**
 * With the `cast_named` step, the dream's items with each cast thing's sketch to be made, as for any prop the producer
 * casts: waiting (never drawn yet), its look its words. The drawing path draws it like any other sheet, so the red
 * tractor is the same tractor in every moment; a rebuild shows it as not drawn yet.
 */
export function withCastItems(items: Item[], reading: CastReading | null | undefined): Item[] {
  if (!builds('cast_named') || !reading?.things.length) return items;
  const out = [...items];
  castable(reading).forEach((t, i) => {
    const id = castId(i);
    if (out.some((x) => x.id === id)) return;
    out.push({
      id,
      kind: 'prop',
      name: t.name,
      fields: { appearance: { value: t.look || null, said: !!t.look }, materials: { value: null, said: false } },
      status: 'waiting',
      version: 0,
    });
  });
  return out;
}

/** The id a cast thing gets in the breakdown: `c1`, `c2`… in the reading's order. */
export const castId = (i: number) => `c${i + 1}`;

/**
 * With the one builder's `cast_named` step, the breakdown with the reading's things cast, as the producer should have
 * cast them: each a thing (its look its appearance, said) in view at every moment that shows it. Weather and matter
 * fill the whole picture and are no element: they stay the reading's (said as a condition of the picture). Without
 * the step, or without a reading, the breakdown as it is.
 */
export function withCastThings(b: Breakdown, reading: CastReading | null | undefined): Breakdown {
  if (!builds('cast_named') || !reading?.things.length) return b;
  const out = structuredClone(b);
  const byId = new Map(momentsOf(out).map((m) => [m.id, m]));
  castable(reading).forEach((t, i) => {
    const id = castId(i);
    if (out.things.some((x) => x.id === id)) return;
    const thing: Thing = {
      id,
      name: t.name,
      fields: { appearance: { value: t.look || null, said: !!t.look }, materials: { value: null, said: false } },
    };
    out.things.push(thing);
    for (const { id: m } of t.moments) {
      const mm = byId.get(m);
      if (mm && !mm.things.includes(id)) mm.things.push(id);
    }
  });
  return out;
}
