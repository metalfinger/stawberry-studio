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
import { nowAt } from './record';

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

const SYSTEM = `You read one moment of a dream that is being drawn as pictures, one picture per moment, and say what its words imply about how a place or a thing looks now that the picture must show, where the record of the dream does not already say it. Only what must be so for the words to happen: a boat rowed up to a window high in the wall means the water in the room has risen almost to that window; someone opening a door means the door is open; the lights going out means the room is dark; snow that has fallen all night means the snow is deep now.

Only a change that lasts: how a part looks from this moment on, until something changes it again (how high the water stands, a door open or shut, a room dark, snow deep, a glass broken). Never a motion or what something is doing (moving, drifting, falling, swimming), never where a thing is or who has it, never how it looked all along (its colour, size, what it is made of), never that it is there.

The record says how each part was last written, which can be earlier than this moment: when it has the water up over the desks and now a boat is rowed up to a window near the ceiling, the water is no longer only over the desks, so say where it is now. What you say takes the place of what the record said about that part, so keep in it what of the old still holds (the desks and shelves are still under the water). Say nothing for a part whose record already gives how it is now.

Water, light, snow, air and the like belong to the place they fill: name them by the place's id. Never about people (how they look, where they are, what they do), never a guess of what might be, never a place or thing that is not listed. Name each by its id, the part that changes in one or two words ("water", "door", "light"), and what it is now in a few plain words that read after "is" ("open", "dark", "deep").

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
        typeof x.now === 'string' &&
        !!x.now.trim(),
    )
    .map((x) => ({
      who: x.who as string,
      what: (x.what as string).trim().slice(0, 40),
      now: (x.now as string).trim().slice(0, 120),
    }))
    .filter((x) => {
      const key = `${x.who}:${x.what.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Jev's questions on each proposal, one fact each, and the state it reads: the moment's own words and
 * the moments just before it in the same place. Whether the words mean it; and, of a thing, whether it
 * is how the thing looks. What a place's water, light or door is, is how the place looks; a thing can
 * be set down, held, moved or felt, which is no look of it (the key heavy and cold, the boat set
 * down: meant, 0.90 and 0.93, and neither how it looks, 0.04 and 0.06; the snowball glowing, 0.77).
 */
export function impliedQuestions(
  b: Breakdown,
  m: Moment,
  proposed: { who: string; what: string; now: string }[],
): { state: string; questions: Record<string, Question> } {
  const name = (id: string) => b.places.find((l) => l.id === id)?.name ?? b.things.find((t) => t.id === id)?.name ?? id;
  const all = momentsOf(b);
  const at = all.findIndex((x) => x.id === m.id);
  const questions: Record<string, Question> = {};
  proposed.forEach((x, i) => {
    questions[`implied_${i}`] = {
      type: 'noul',
      instructions: `Do this moment's words mean that ${name(x.who)}'s ${x.what} is now ${x.now}: said, or bound to be so for what they say to happen?`,
      criteria: {
        true: 'the words say it, or what they say could not happen without it (a boat rowed up to a window high in a wall means the water has risen to it)',
        false: 'it is a guess: possible, but the words do not need it',
      },
    };
    if (b.things.some((t) => t.id === x.who))
      questions[`look_${i}`] = {
        type: 'noul',
        instructions: `Is "${name(x.who)}'s ${x.what} is now ${x.now}" how it looks in the picture (its lid or door open or shut, glowing, broken, wet), rather than where it is, what it is doing, or how it feels?`,
        criteria: {
          true: 'how it looks: open or shut, glowing, broken, wet, torn',
          false: 'where it is or how it is set down, a motion or something it does, how it feels to the touch',
        },
      };
  });
  const before = all
    .slice(Math.max(0, at - 2), Math.max(0, at))
    .filter((x) => x.place === m.place)
    .map((x) => x.action);
  const state = JSON.stringify({
    ...(before.length ? { before } : {}),
    moment: {
      action: m.action,
      ...(m.dream ? { dream: m.dream } : {}),
      ...(m.visual_point ? { must_show: m.visual_point } : {}),
    },
    place: name(m.place),
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
      const { state, questions } = impliedQuestions(b, m, proposed);
      const call = await jev(state, questions);
      cost.jevCalls += 1;
      cost.jevIn += call.usage?.input_tokens ?? 0;
      cost.jevOut += call.usage?.output_tokens ?? 0;
      const noul = (k: string) => {
        const a = call.answers?.[k];
        return a?.type === 'noul' ? a.noul : 0;
      };
      const out = proposed.map((x, i): Implied => {
        const p = noul(`implied_${i}`);
        if (!questions[`look_${i}`]) return { ...x, basis: 'implied', p, ok: p >= IMPLIED_BAR };
        const look = noul(`look_${i}`);
        return { ...x, basis: 'implied', p, look, ok: p >= IMPLIED_BAR && look >= IMPLIED_BAR };
      });
      log?.(m.id, out);
      return [m.id, out];
    }),
  );
  return { implied: Object.fromEntries(read.filter(([, xs]) => xs.length)), cost };
}
