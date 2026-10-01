// What the dreamer told, read before the breakdown is drafted (the one builder's `strangest` and `told_events`): the
// dream's strangest fact and every event they told, each quoted word for word from their telling, nothing invented.
// In the chat the dreamer says what stays with them and confirms the retell, beat by beat; a dream taken in as a dump
// has neither, so its breakdown spent its moments on the setup and lost the dream's turn: the Barley Degree's
// "barley degree" mix-up and the dreamer's realising it were gone, Train's marzipan became "finding nothing" (the
// merged flow's imports, 1 Oct). The breakdown is drafted with this reading, checked against it by Jev, and asked for
// once more where a told event or the strangest fact is missing. The first piece of the script stage (the owner,
// 1 Oct: the dreamer's own words only, the strangest fact first); no narration and no word budget here.
import { builds } from './cleanups';
import type { JevFn, Question } from './jev';
import { type ChatMessage, callDeepseek } from './llm';
import { type Breakdown, callProducer, type Moment, normalizeBreakdown, type ProducerFn } from './producer';

export type Telling = {
  /** The one fact that makes the dream strange, quoted from their telling, and what kind of fact it is. */
  strangest: { quote: string; kind: 'seen' | 'thought' | 'talk' } | null;
  /** Every event and fact they told, in their order, each quoted from their telling. */
  events: string[];
  /**
   * Those the dream cannot be retold without, each the one thing some moment shows: the merged flow's retell gate (a
   * stranger retelling the dream from the points alone) lost the barley question, the cards and the Yankton degree
   * where they lived only in a moment's action, as the picture would.
   */
  essential: string[];
};

const TELLING = `A person's dream, as they told it, is below. Read it twice, then return JSON only:
{"strangest": {"quote": "", "kind": "seen"}, "events": [{"quote": "", "essential": true}]}

- "strangest": the one fact that makes this dream strange: the strangest thing that happens in it, or the turn it all comes to, the thing a stranger would retell first. A strange place or look only where nothing stranger happens. Quote it word for word from their telling: a whole sentence or a part of one, never your own words.
- "kind": "seen" when it is something that happens or is there; "thought" when it is the dreamer's own thought, realisation, wish or feeling; "talk" when it is in what someone says, or a mix-up in what is said.
- "events": every event and fact they told, in their order, each quoted word for word from their telling: a sentence, or a part of one where a sentence tells two things. Leave out only words that tell nothing ("I remember", "I don't know why"). Never reword, never join two sentences, never add anything.
- "essential": true for an event the dream cannot be retold without (who is there, what happens to them, what is said, asked or realised, the turn and how it ends); false for a colour, a feeling or a detail of how something looks.`;

/** Lowercase, one space, straight quotes: a quote is checked against the telling this way. */
const plain = (x: string) =>
  x
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/["]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;,!?]+$/, '')
    .trim();

/** A quote that is in their telling, as they said it; anything else is ours, and dropped. */
export const quoted = (quote: unknown, text: string): string | null =>
  typeof quote === 'string' && plain(quote).length >= 3 && plain(text).includes(plain(quote)) ? quote.trim() : null;

export type WriteFn = (messages: ChatMessage[], opts: { json: true }) => Promise<{ content: string }>;

/** Their telling read: the strangest fact and the events, each kept only where it is their own words. */
export async function readTelling(text: string, write: WriteFn = callDeepseek): Promise<Telling> {
  let raw: Record<string, unknown> = {};
  try {
    const r = await write(
      [
        { role: 'system', content: TELLING },
        { role: 'user', content: text },
      ],
      { json: true },
    );
    raw = JSON.parse(r.content || '{}') as Record<string, unknown>;
  } catch {
    return { strangest: null, events: [], essential: [] };
  }
  const s = (raw.strangest ?? {}) as { quote?: unknown; kind?: unknown };
  const quote = quoted(s.quote, text);
  const kind = s.kind === 'thought' || s.kind === 'talk' ? s.kind : 'seen';
  const read = (Array.isArray(raw.events) ? raw.events : [])
    .map((e) =>
      typeof e === 'string' ? { quote: e, essential: false } : (e as { quote?: unknown; essential?: unknown }),
    )
    .map((e) => ({ quote: quoted(e.quote, text), essential: e.essential === true }))
    .filter((e): e is { quote: string; essential: boolean } => !!e.quote);
  const events = [...new Set(read.map((e) => e.quote))];
  const essential = events.filter((e) => read.some((r) => r.quote === e && r.essential));
  return { strangest: quote ? { quote, kind } : null, events, essential };
}

const KIND: Record<NonNullable<Telling['strangest']>['kind'], string> = {
  seen: 'something that happens or is there',
  thought: 'their own thought: the moment shows them, their face carrying it',
  talk: 'in what is said: the moment shows it being said, the dreamer and the one they talk with',
};

/** What the producer is told of their telling, by the steps that are built. */
export function tellingNote(t: Telling): string | undefined {
  const lines: string[] = [];
  if (builds('strangest') && t.strangest)
    lines.push(
      `- What stays with them, the dream's strangest fact: "${t.strangest.quote}" (${KIND[t.strangest.kind]}). Mark "key" the moment that shows it: its action has it happen, and its "visual_point" says what the picture shows of it, as something seen. Give it its own moment if none would.`,
    );
  if (builds('told_events') && t.events.length)
    lines.push(
      `- What they told, in their order: ${t.events.map((e, i) => `${i + 1}. "${e}"${t.essential.includes(e) ? ' (essential)' : ''}`).join(' ')} Every one of these is in some moment, in their order: its own moment where it is something to see, or in the moment it belongs to. Every essential one is the one thing some moment shows: its "visual_point" names it with what they named, said or asked in it ("the dreamer asking G.H. about their barley degree", never "the dreamer talking to G.H."), as the picture shows it.`,
    );
  return lines.length
    ? `Read from their telling before this breakdown, in their own words:\n${lines.join('\n')}`
    : undefined;
}

export type Gap = { missing: string[]; keyed: boolean };

/** Which told events no moment carries, and whether the key moment carries the strangest fact (Jev). */
export async function untold(b: Breakdown, t: Telling, jev: JevFn): Promise<Gap> {
  const ms: Moment[] = b.scenes.flatMap((sc) => sc.moments);
  const questions: Record<string, Question> = {};
  const events = builds('told_events') ? t.events : [];
  events.forEach((e, i) => {
    // An essential event in what some moment shows, the point a stranger and the picture both get; any other anywhere.
    questions[`e${i}`] = t.essential.includes(e)
      ? {
          type: 'noul',
          instructions: `A dream is being drawn as these pictures, one for each moment (the state: what happens in it, and the one thing it shows). The person told this: "${e}". Is it the one thing some moment shows ("shows"), with what they named, said or asked in it? Only "happens" having it does not count, nor a "shows" that says it more vaguely ("the dreamer talking to her" where they said what they asked her).`,
          criteria: { true: "a moment's one thing to show has it", false: "no moment's one thing to show has it" },
        }
      : {
          type: 'noul',
          instructions: `A dream is being drawn as these pictures, one for each moment (the state: what happens in it, and the one thing it shows). The person told this: "${e}". Does at least one moment have what they told here happening or there, in what happens in it or in what it shows? A moment that shows only what comes just before or after it, or says it more vaguely (finding "nothing" where they said what they could not find), does not.`,
          criteria: { true: 'a moment has it', false: 'no moment has it' },
        };
  });
  const key = ms.find((m) => m.key);
  const strange = builds('strangest') ? t.strangest : null;
  if (strange && key)
    questions.key = {
      type: 'noul',
      instructions: `The key moment of a dream being drawn is "${key.action}", its one thing to show "${key.visual_point}". The dream's strangest fact, in the person's words: "${strange.quote}". Does this moment show that fact itself, not only what leads to it or follows it?`,
      criteria: { true: 'it shows the strangest fact', false: 'it does not' },
    };
  if (!Object.keys(questions).length) return { missing: [], keyed: true };
  const state = JSON.stringify({
    moments: ms.map((m) => ({ id: m.id, happens: m.action, shows: m.visual_point })),
  });
  const call = await jev(state, questions);
  // Unread is no finding: a question Jev did not answer counts as met.
  const yes = (k: string) => {
    const a = call.answers?.[k];
    return a?.type !== 'noul' || a.noul >= 0.5;
  };
  return {
    missing: events.filter((_, i) => !yes(`e${i}`)),
    keyed: !strange ? true : !!key && yes('key'),
  };
}

/** The ask, once, where the breakdown leaves a told event out or its key moment is not the strangest fact. */
export function fixNote(t: Telling, gap: Gap): string | undefined {
  const says: string[] = [];
  const essential = gap.missing.filter((e) => t.essential.includes(e));
  const rest = gap.missing.filter((e) => !t.essential.includes(e));
  if (essential.length)
    says.push(
      `No moment shows what they told here, which the dream cannot be retold without: ${essential.map((e, i) => `${i + 1}. "${e}"`).join(' ')} Make each the one thing some moment shows, its "visual_point" naming it with what they named, said or asked in it, as the picture shows it; give it its own moment where none would.`,
    );
  if (rest.length)
    says.push(
      `It leaves out what they told here: ${rest.map((e, i) => `${i + 1}. "${e}"`).join(' ')} Give each its moment, or put it in the moment it belongs to, in their order, in their words.`,
    );
  if (!gap.keyed && t.strangest)
    says.push(
      `Its key moment does not show what stays with them: "${t.strangest.quote}". Mark "key" the moment that shows it: its action has it happen, and its "visual_point" says what the picture shows of it, as something seen. Give it its own moment if none does.`,
    );
  return says.length
    ? `A breakdown was drafted (below) and checked against what they told. ${says.join(' ')} Return the whole breakdown again with only this changed: every id that still applies kept, 3 to 10 moments, every other rule as before.`
    : undefined;
}

/** Fewer told events missing, then the strangest fact keyed: the better of two drafts. */
export const better = (a: Gap, b: Gap) =>
  b.missing.length < a.missing.length || (b.missing.length === a.missing.length && b.keyed && !a.keyed);

/**
 * The breakdown, drafted with their telling read first, checked against it, and asked for once more where it falls
 * short (the better of the two kept). With neither step built, or for a revision, the producer as it always was.
 */
export async function draftTold(
  conversation: string,
  words: string,
  previous: Breakdown | undefined,
  deps: { jev: JevFn; produce?: ProducerFn; write?: WriteFn },
): Promise<{ raw: string; ms: number; notes: string[] }> {
  const produce = deps.produce ?? callProducer;
  const told =
    !previous && (builds('strangest') || builds('told_events')) ? await readTelling(words, deps.write) : null;
  const note = told ? tellingNote(told) : undefined;
  const first = await produce(conversation, previous, note ? { note } : undefined);
  if (!told || !note) return { ...first, notes: [] };
  const drafted = normalizeBreakdown(first.raw).breakdown;
  const gap = await untold(drafted, told, deps.jev);
  const said = (g: Gap) =>
    `${told.events.length - g.missing.length} of ${told.events.length} told events in a moment, the strangest fact ${g.keyed ? 'keyed' : 'not keyed'}`;
  const read = `told: the strangest fact "${told.strangest?.quote ?? 'none read'}"`;
  const fix = fixNote(told, gap);
  if (!fix) return { ...first, notes: [`${read}; ${said(gap)}`] };
  const again = await produce(conversation, drafted, { note, fix });
  const after = await untold(normalizeBreakdown(again.raw).breakdown, told, deps.jev);
  const take = better(gap, after);
  return {
    raw: take ? again.raw : first.raw,
    ms: first.ms + again.ms,
    notes: [`${read}; ${said(gap)}; asked again: ${said(after)}, ${take ? 'taken' : 'the first kept'}`],
  };
}
