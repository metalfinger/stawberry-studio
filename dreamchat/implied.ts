// What a moment's words imply about how a place or a thing is now, that nothing in the dream writes
// down: a boat rowed up to a window high in the wall means the water has risen almost to it; a door
// opened is open; a room whose lights go out is dark. The story record carries only what is written,
// so these are read once per moment: the writer proposes them, each as one typed change, and Jev
// checks each on the moment's own words. Only those Jev reads as meant (and, of a thing, as how it
// looks rather than where it is, what it does or how it feels) become changes of the record
// (record.ts), at that moment, known as implied, never as said. Kept in the dream's readings
// (draft.readings), so a saved dream carries them and a rebuild reads them.
import type { JevFn, Question } from './jev';
import { type CallResult, type ChatMessage, callDeepseek, type Thinking } from './llm';
import type { Breakdown, Moment } from './producer';
import { moments as momentsOf } from './producer';
import type { ImpliedReading, Readings, StoryRecord } from './record';
import { lookAt, nowAt } from './record';

/** How sure Jev must be of each: provisional, as the other facts' bars are. */
export const IMPLIED_BAR = 0.6;

/** One implied state of a moment: proposed by the writer, and Jev's reading of it. */
export type Implied = ImpliedReading;

/** The writer: one JSON answer to a system and a user message (DeepSeek, llm.ts). */
export type WriteFn = (messages: ChatMessage[]) => Promise<CallResult>;

/**
 * How much the writer thinks first. Low: asked four times without thinking, it missed the water's
 * rise at library-1's window once and put the water up at the window where the boat only appears
 * (library-3 m4); thinking low, three of three found the rise and none put it where it was not, for
 * about a thousand tokens more a moment and 10 to 25 seconds, the moments read at once.
 */
export const IMPLIED_THINKING = (process.env.DREAMCHAT_IMPLIED_THINKING as Thinking | undefined) ?? 'low';

/**
 * The writer the harness reads with: the harness's own (DeepSeek), one JSON answer. A blank answer
 * is asked once more, as callHost does: the provider sometimes returns nothing.
 */
export const writeImplied: WriteFn = async (messages) => {
  const first = await callDeepseek(messages, { json: true, thinking: IMPLIED_THINKING });
  if (first.content.trim()) return first;
  const second = await callDeepseek(messages, { json: true, thinking: IMPLIED_THINKING });
  return { ...second, ms: first.ms + second.ms };
};

const SYSTEM = `You read one moment of a dream that is being drawn as pictures, one picture per moment, and say what its words imply about how a place or a thing looks now that the picture must show, where the record of the dream does not already say it. Only what must be so for the words to happen: a boat rowed up to a window high in the wall means the water in the room has risen almost to that window; someone opening a door means the door is open; the lights going out means the room is dark.

Only a change that lasts: how a part looks from this moment on, until something changes it again (how high the water stands, a door open or shut, a room dark, a glass broken). Never a motion or what something is doing (moving, drifting, falling, swimming, leaning), never where a thing is or who has it, never how it looked all along (its colour, size, what it is made of), never that it is there, never how the pictures are drawn (in colour or black and white, like an old film or a painting).

The record says how each part was last written, which can be earlier than this moment: when it has the water up over the desks and now a boat is rowed up to a window near the ceiling, the water is no longer only over the desks, so say where it is now. What you say takes the place of what the record said about that part, so keep in it what of the old still holds (the desks and shelves are still under the water). Say nothing for a part whose record already gives how it is now.

Water, light, air and the like belong to the place they fill: name them by the place's id. Never about people (how they look, where they are, what they do), never a guess of what might be, never a place or thing that is not listed. Name each by its id, the part that changes in one or two words ("water", "door", "light"), and what it is now in a few plain words that read after "is" ("open", "dark", "deep").

Return JSON only: {"implied": [{"who": "l1", "what": "water", "now": "almost up to the ceiling, over the desks and shelves, up to the high round window"}]}, with "implied" empty when the words imply nothing more.`;

/** What the writer is given for one moment: its words, what is in it, and what the record already holds there. */
export function impliedAsk(b: Breakdown, record: StoryRecord, m: Moment): ChatMessage[] {
  const all = momentsOf(b);
  const at = all.findIndex((x) => x.id === m.id);
  const place = b.places.find((l) => l.id === m.place);
  const here = record.moments.find((x) => x.id === m.id);
  const things = b.things.filter((t) => m.things.includes(t.id) || here?.present.includes(t.id));
  const brief = {
    moment: {
      action: m.action,
      ...(m.dream ? { dream: m.dream } : {}),
      ...(m.visual_point ? { must_show: m.visual_point } : {}),
    },
    earlier: all
      .slice(Math.max(0, at - 2), at)
      .filter((x) => x.place === m.place)
      .map((x) => x.action),
    places: place ? [{ id: place.id, name: place.name }] : [],
    things: things.map((t) => ({ id: t.id, name: t.name })),
    the_record_holds: [
      ...nowAt(record, m.id).map((x) => x.text),
      ...(here?.own ?? []).map((k) => {
        const c = record.changes[k];
        return c ? `${record.elements[c.who]?.called ?? c.who}: ${c.what} becomes ${c.now}` : '';
      }),
    ].filter(Boolean),
  };
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(brief) },
  ];
}

/** Text cut to at most `n` characters at a word, never inside one, without a dangling comma or "and". */
export function clip(text: string, n: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= n) return t;
  const cut = t.slice(0, n + 1);
  const at = cut.lastIndexOf(' ');
  return (at > 0 ? cut.slice(0, at) : t.slice(0, n)).replace(
    /(?:[\s,;:-]+|\s+(?:and|or|with|the|a|an|of|to|up|over|in|on|at))+$/i,
    '',
  );
}

/**
 * What says only the part again, adding nothing: "crowd: crowded". Each of its words is a word of the
 * part, or grown from one.
 */
export function restatesPart(what: string, now: string): boolean {
  const words = (t: string) =>
    t
      .toLowerCase()
      .match(/[a-z]+/g)
      ?.filter((w) => w.length > 2 && w !== 'the') ?? [];
  const part = words(what);
  const said = words(now);
  return (
    !!said.length &&
    said.every((w) => part.some((p) => Math.min(p.length, w.length) >= 4 && (w.startsWith(p) || p.startsWith(w))))
  );
}

/** Words that name no part of a place or thing, only all of it or how it looks. */
const NO_PART = /^(?:the\s+)?(?:place|thing|look|looks|appearance|state|scene|setting|whole|it)$/i;

/** The writer's answer, kept to places and things the moment has, each by a part, each part named once. */
export function parseImplied(content: string, b: Breakdown, m: Moment): { who: string; what: string; now: string }[] {
  let raw: unknown;
  try {
    raw = (JSON.parse(content) as { implied?: unknown }).implied;
  } catch {
    return [];
  }
  const ids = new Set([m.place, ...m.things, ...b.things.map((t) => t.id)]);
  const seen = new Set<string>();
  return (Array.isArray(raw) ? raw : [])
    .map((x) => x as Record<string, unknown>)
    .filter(
      (x) =>
        typeof x?.who === 'string' &&
        ids.has(x.who) &&
        typeof x.what === 'string' &&
        !!x.what.trim() &&
        !NO_PART.test(x.what.trim()) &&
        !(typeof x.now === 'string' && restatesPart(x.what, x.now)) &&
        typeof x.now === 'string' &&
        !!x.now.trim(),
    )
    .map((x) => ({
      who: x.who as string,
      what: clip(x.what as string, 40),
      now: clip(x.now as string, 120),
    }))
    .filter((x) => {
      const key = `${x.who}:${x.what.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** How near an answer may be to the bar before it is marked as close. */
export const CLOSE = 0.1;

/** The readings of a place's proposal besides whether it is meant, each one fact, and the answer each must have. */
export const PLACE_CHECKS = [
  { key: 'motion', want: 'no', says: 'something it is doing at this moment' },
  { key: 'drawn', want: 'no', says: 'how the pictures are drawn' },
  { key: 'inlook', want: 'no', says: 'what its look already says' },
  { key: 'feel', want: 'no', says: 'how it feels or what is known of it' },
] as const;

/**
 * Every reading of one proposal as a fact: the question, Jev's answer, the answer it must have, and
 * whether it has it (for "no", an answer under the bar).
 */
export function impliedFacts(
  x: ImpliedReading,
): { question: string; answer: number; want: 'yes' | 'no'; ok: boolean }[] {
  const fact = (question: string, answer: number | undefined, want: 'yes' | 'no') =>
    answer === undefined
      ? []
      : [{ question, answer, want, ok: want === 'yes' ? answer >= IMPLIED_BAR : answer < IMPLIED_BAR }];
  return [
    ...fact('meant', x.p, 'yes'),
    ...fact('how it looks', x.look, 'yes'),
    ...PLACE_CHECKS.flatMap((c) => fact(c.says, x[c.key], c.want)),
  ];
}

/**
 * Jev's questions on each proposal, one fact each, and the state it reads: the moment's own words, the
 * moments just before and after it in the same place, and the look of the place as the record has it
 * there. Whether the words mean it; and by what it is of:
 * - of a thing, whether it is how the thing looks, rather than where it is, what it does or how it
 *   feels (the key heavy and cold, the boat set down: meant, 0.90 and 0.93, and neither how it looks,
 *   0.04 and 0.06; the snowball glowing, 0.77);
 * - of a place, four questions each to be answered no (PLACE_CHECKS), since one joined question
 *   rejected the water risen to the window (0.28 and 0.26) with the snow and the dusk: whether it is
 *   something the place is doing at this moment (the train leaning into the bend, 0.96; the water
 *   levels and the windows opened, 0.04 to 0.13); whether it is how the pictures are drawn (black and
 *   white like an old film, 0.86; a light gone "warm yellow", 0.80, the one true state it rejects; all
 *   else under 0.55); whether its look already says it (snow deep, 0.97 and 0.99; dusk, 0.94; the
 *   grass tall, 0.90; the grass towering over the mouse-sized dreamer, 0.75; the water levels, 0.02 to
 *   0.16); and whether it is how it feels or what is known of it rather than anything a picture shows
 *   (the tiles warm, 0.73; the door unlocked, 0.70; the water levels, 0.07 to 0.33). Not asked: whether it stays so after this moment, which read 0.06 to 0.59 on
 *   true water levels a later moment raises, and caught nothing the others miss; nor "how it looks in
 *   the picture", as things are asked, which read the water at the window 0.50 to 0.54. Measured on
 *   every live dream with evals/probes/place-question.ts (27 Sep).
 */
export function impliedQuestions(
  b: Breakdown,
  record: StoryRecord,
  m: Moment,
  proposed: { who: string; what: string; now: string }[],
): { state: string; questions: Record<string, Question> } {
  const name = (id: string) => b.places.find((l) => l.id === id)?.name ?? b.things.find((t) => t.id === id)?.name ?? id;
  const isPlace = (id: string) => b.places.some((l) => l.id === id);
  const all = momentsOf(b);
  const at = all.findIndex((x) => x.id === m.id);
  const questions: Record<string, Question> = {};
  proposed.forEach((x, i) => {
    const n = name(x.who);
    questions[`implied_${i}`] = {
      type: 'noul',
      instructions: `Do this moment's words mean that ${n}'s ${x.what} is now ${x.now}: said, or bound to be so for what they say to happen?`,
      criteria: {
        true: 'the words say it, or what they say could not happen without it (a boat rowed up to a window high in a wall means the water has risen to it)',
        false: 'it is a guess: possible, but the words do not need it',
      },
    };
    if (isPlace(x.who)) {
      questions[`motion_${i}`] = {
        type: 'noul',
        instructions: `Is "${x.what}: ${x.now}" something ${n} is doing at this moment (leaning, swaying, shaking, flickering), rather than a state it is in (open, dark, flooded, risen)?`,
      };
      questions[`drawn_${i}`] = {
        type: 'noul',
        instructions: `Is "${x.what}: ${x.now}" about how the pictures are drawn or filmed (black and white, like an old film, a painting, a colour scheme), rather than about ${n} itself?`,
      };
      questions[`inlook_${i}`] = {
        type: 'noul',
        instructions: `Does ${n}'s look, as given, already say that its ${x.what} is ${x.now}?`,
      };
      questions[`feel_${i}`] = {
        type: 'noul',
        instructions: `Is "${x.what}: ${x.now}" about how ${n} feels to the touch or what someone knows about it (warm, cold, locked, unlocked), rather than anything a picture shows?`,
      };
    } else
      questions[`look_${i}`] = {
        type: 'noul',
        instructions: `Is "${n}'s ${x.what} is now ${x.now}" how it looks in the picture (its lid or door open or shut, glowing, broken, wet), rather than where it is, what it is doing, or how it feels?`,
        criteria: {
          true: 'how it looks: open or shut, glowing, broken, wet, torn',
          false: 'where it is or how it is set down, a motion or something it does, how it feels to the touch',
        },
      };
  });
  const same = (xs: Moment[]) => xs.filter((x) => x.place === m.place).map((x) => x.action);
  const before = same(all.slice(Math.max(0, at - 2), Math.max(0, at)));
  const after = same(all.slice(at + 1, at + 3));
  const places = [...new Set(proposed.filter((x) => isPlace(x.who)).map((x) => x.who))];
  const state = JSON.stringify({
    ...(before.length ? { before } : {}),
    moment: {
      action: m.action,
      ...(m.dream ? { dream: m.dream } : {}),
      ...(m.visual_point ? { must_show: m.visual_point } : {}),
    },
    ...(after.length ? { after } : {}),
    place: name(m.place),
    ...(places.length ? { looks: Object.fromEntries(places.map((id) => [name(id), lookAt(record, m.id, id)])) } : {}),
  });
  return { state, questions };
}

/** What one dream's reading cost: the writer's calls and tokens, and Jev's. */
export type ImpliedCost = {
  writerCalls: number;
  writerIn: number;
  writerOut: number;
  jevCalls: number;
  jevIn: number;
  jevOut: number;
};

/**
 * Every moment's implied states, read and checked: one writer call per moment, one Jev call per
 * moment with anything proposed. `log` is told each moment's proposals and Jev's answers.
 */
export async function readImplied(
  b: Breakdown,
  record: StoryRecord,
  write: WriteFn,
  jev: JevFn,
  log?: (moment: string, read: Implied[]) => void,
): Promise<{ implied: NonNullable<Readings['implied']>; cost: ImpliedCost }> {
  const cost: ImpliedCost = { writerCalls: 0, writerIn: 0, writerOut: 0, jevCalls: 0, jevIn: 0, jevOut: 0 };
  const read = await Promise.all(
    momentsOf(b).map(async (m): Promise<[string, Implied[]]> => {
      let proposed: { who: string; what: string; now: string }[] = [];
      try {
        const res = await write(impliedAsk(b, record, m));
        cost.writerCalls += 1;
        cost.writerIn += res.usage?.prompt_tokens ?? 0;
        cost.writerOut += res.usage?.completion_tokens ?? 0;
        proposed = parseImplied(res.content, b, m);
      } catch {
        proposed = [];
      }
      if (!proposed.length) return [m.id, []];
      const { state, questions } = impliedQuestions(b, record, m, proposed);
      const call = await jev(state, questions);
      cost.jevCalls += 1;
      cost.jevIn += call.usage?.input_tokens ?? 0;
      cost.jevOut += call.usage?.output_tokens ?? 0;
      const noul = (k: string) => {
        const a = call.answers?.[k];
        return a?.type === 'noul' ? a.noul : 0;
      };
      const out = proposed.map((x, i): Implied => {
        const asked = (k: string) => (questions[`${k}_${i}`] ? { [k]: noul(`${k}_${i}`) } : {});
        const read: Implied = {
          ...x,
          basis: 'implied',
          p: noul(`implied_${i}`),
          ...asked('look'),
          ...PLACE_CHECKS.reduce((o, c) => ({ ...o, ...asked(c.key) }), {}),
          ok: false,
        };
        const facts = impliedFacts(read);
        const close = facts.some((f) => Math.abs(f.answer - IMPLIED_BAR) < CLOSE);
        return { ...read, ok: facts.every((f) => f.ok), ...(close ? { close: true } : {}) };
      });
      log?.(m.id, out);
      return [m.id, out];
    }),
  );
  return { implied: Object.fromEntries(read.filter(([, xs]) => xs.length)), cost };
}
