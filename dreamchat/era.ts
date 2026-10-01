// The dream's era (the one builder's `era`): a 1957 church meeting was drawn modern, nothing in the breakdown saying
// when (the Barley Degree, DreamBank, 26 October 1957; the merged flow's first new dream, 1 Oct). The period comes from
// the dream's own words, quoted, then from the date it was recorded (given with the dump, `import.ts --when`), else
// there is none and nothing is guessed. A moment the dream sets in another time keeps its own ("a Victorian ballroom"
// in a dream at an office desk), never leaking into the others. A sketch and every moment are told the time; the style
// never is: it is how the pictures are drawn, and a woodcut stays a woodcut in any decade.
import { callDeepseek } from './llm';
import { quoted, type WriteFn } from './telling';

export type Era = {
  /** When the dream's world is set as a whole: their words (`said`, quoted) or the date it was recorded (`given`). */
  period: { value: string; from: 'said' | 'given'; quote?: string } | null;
  /** A moment their words set in another time than the rest, by id. */
  moments: Record<string, { value: string; quote: string }>;
};

/**
 * The date a dream was recorded as its decade, in plain words ("26 October 1957" is "the late 1950s"); none for the
 * last few years, the present being the look every picture has anyway, and none where no year is given.
 */
export function periodOfDate(given: string | null | undefined, now = new Date()): string | null {
  const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(given ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  if (now.getFullYear() - year < 5) return null;
  const part = year % 10 <= 3 ? 'early' : year % 10 <= 6 ? 'mid' : 'late';
  return `the ${part} ${Math.floor(year / 10) * 10}s`;
}

const ERA = `A person's dream, as they told it, is below, with the moments it is drawn as. Return JSON only:
{"period": {"value": "", "quote": ""}, "moments": [{"id": "", "value": "", "quote": ""}]}

- "period": when the dream's world is set as a whole, only where their own words say it ("when I was a little girl in the 1970s", "a medieval village"): the period in plain words ("the 1970s", "the Middle Ages"), and the words that say it, quoted word for word from their telling. null where their words do not say it: never from how things look, never a guess.
- "moments": only a moment whose own world their words set in another time than the rest of the dream ("a Victorian ballroom" in a dream at an office desk): its id, the period in plain words, and the words that say it, quoted. Empty where no moment is.`;

/** Their telling read for its era, each period kept only where it is their own words; the given date for the rest. */
export async function readEra(
  text: string,
  given: string | null,
  moments: { id: string; action: string }[],
  write: WriteFn = callDeepseek,
  now = new Date(),
): Promise<Era> {
  const dated = periodOfDate(given, now);
  const fallback: Era = { period: dated ? { value: dated, from: 'given' } : null, moments: {} };
  let raw: Record<string, unknown>;
  try {
    const r = await write(
      [
        { role: 'system', content: ERA },
        { role: 'user', content: `${text}\n\nThe moments:\n${moments.map((m) => `${m.id}: ${m.action}`).join('\n')}` },
      ],
      { json: true },
    );
    raw = JSON.parse(r.content || '{}') as Record<string, unknown>;
  } catch {
    return fallback;
  }
  const p = (raw.period ?? null) as { value?: unknown; quote?: unknown } | null;
  const said = p && typeof p.value === 'string' && p.value.trim() ? quoted(p.quote, text) : null;
  const ids = new Set(moments.map((m) => m.id));
  const own: Era['moments'] = {};
  for (const x of (Array.isArray(raw.moments) ? raw.moments : []) as {
    id?: unknown;
    value?: unknown;
    quote?: unknown;
  }[]) {
    const quote = quoted(x.quote, text);
    if (typeof x.id === 'string' && ids.has(x.id) && typeof x.value === 'string' && x.value.trim() && quote)
      own[x.id] = { value: x.value.trim(), quote };
  }
  return {
    period: said && p ? { value: String(p.value).trim(), from: 'said', quote: said } : fallback.period,
    moments: own,
  };
}

/** The period a moment is set in: its own where the dream gives it one, else the dream's, else none. */
export const eraOf = (era: Era | null | undefined, momentId: string): string | null =>
  era?.moments[momentId]?.value ?? era?.period?.value ?? null;

/** The time, told to a sketch by what it is of, or to a moment's whole picture. */
export function periodLine(value: string, kind: 'moment' | 'character' | 'location' | 'prop'): string {
  const what =
    kind === 'character'
      ? 'their clothes and hair as they were then'
      : kind === 'location'
        ? 'the place and everything in it as it was then'
        : kind === 'prop'
          ? 'as it was made then'
          : 'clothes, hair, rooms, vehicles and things as they were then';
  return `The time: ${value}: ${what}.`;
}
