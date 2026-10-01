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
  /**
   * With `texture`: each simile or reason they give for how something is, quoted, and whether a picture can show it.
   * A seeable one is kept as a look in some moment's one thing to show ("plump, doughy, dumpling-shaped stars"), an
   * unseeable one never there (a hum, a ringtone): the dumped dreams' points lost the one and carried the other.
   */
  textures?: { quote: string; seeable: boolean }[];
};

const TELLING = `A person's dream, as they told it, is below. Read it twice, then return JSON only:
{"strangest": {"quote": "", "kind": "seen"}, "events": [{"quote": "", "essential": true}]}

- "strangest": the one fact that makes this dream strange: the strangest thing that happens in it, or the turn it all comes to, the thing a stranger would retell first. A strange place or look only where nothing stranger happens. Quote it word for word from their telling: a whole sentence or a part of one, never your own words.
- "kind": "seen" when it is something that happens or is there; "thought" when it is the dreamer's own thought, realisation, wish or feeling; "talk" when it is in what someone says, or a mix-up in what is said.
- "events": every event and fact they told, in their order, each quoted word for word from their telling: a sentence, or a part of one where a sentence tells two things. Leave out only words that tell nothing ("I remember", "I don't know why"). Never reword, never join two sentences, never add anything.
- "essential": true for an event the dream cannot be retold without (who is there, what happens to them, what is said, asked or realised, the turn and how it ends); false for a colour, a feeling or a detail of how something looks.`;

/** With `texture`, the reading also asks for each simile or reason they give, and whether a picture can show it. */
const TELLING_SHAPE = `{"strangest": {"quote": "", "kind": "seen"}, "events": [{"quote": "", "essential": true}]}`;
const TEXTURES = `
- "textures": every simile or comparison ("like …", "as if …") and every reason ("so that …", "so they wouldn't …") they give for how something is or what is done, each quoted word for word with what it is about ("slightly soft. As if someone had steamed mangoes like dumplings"); and every sound, smell or feeling they only hear, smell or feel ("I could hear faint notifications"). "seeable": true where a picture could show it as they saw it (a shape, a texture, a look, something pushing or held down), false where only a sound, a smell, a memory or a feeling carries it ("I think it hummed", "like we used to do when I was a child", "I could hear faint notifications"): never drawn as something they did not see. Empty where they give none.`;
const tellingPrompt = () =>
  builds('texture')
    ? TELLING.replace(TELLING_SHAPE, TELLING_SHAPE.replace(/}$/, ', "textures": [{"quote": "", "seeable": true}]}')) +
      TEXTURES
    : TELLING;

/**
 * Their words only, as a quote is checked against the telling: letters, digits and apostrophes, one space between, so
 * a comma or quote mark the writer adds or drops loses nothing, and a word it invents is still not theirs.
 */
const plain = (x: string) =>
  x
    .toLowerCase()
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

/** A quote of at least three words that is in their telling, as they said it; anything else is ours, and dropped. */
export const quoted = (quote: unknown, text: string): string | null =>
  typeof quote === 'string' && plain(quote).split(' ').length >= 3 && ` ${plain(text)} `.includes(` ${plain(quote)} `)
    ? quote.trim()
    : null;

export type WriteFn = (messages: ChatMessage[], opts: { json: true }) => Promise<{ content: string }>;

/** Their telling read: the strangest fact and the events, each kept only where it is their own words. */
export async function readTelling(text: string, write: WriteFn = callDeepseek): Promise<Telling> {
  let raw: Record<string, unknown> = {};
  try {
    const r = await write(
      [
        { role: 'system', content: tellingPrompt() },
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
  const textures = builds('texture')
    ? (Array.isArray(raw.textures) ? raw.textures : [])
        .map((x) => x as { quote?: unknown; seeable?: unknown })
        .map((x) => ({ quote: quoted(x.quote, text), seeable: x.seeable === true }))
        .filter((x): x is { quote: string; seeable: boolean } => !!x.quote)
    : [];
  return { strangest: quote ? { quote, kind } : null, events, essential, ...(textures.length ? { textures } : {}) };
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
  const seen = (t.textures ?? []).filter((x) => x.seeable);
  const unseen = (t.textures ?? []).filter((x) => !x.seeable);
  if (builds('texture') && seen.length)
    lines.push(
      `- What they said things look like, kept as a look in the one thing some moment shows, never with "like" or "as if": ${seen.map((x, i) => `${i + 1}. "${x.quote}"`).join(' ')}`,
    );
  if (builds('texture') && unseen.length)
    lines.push(
      `- What only a sound, a smell, a memory or a feeling carries, never in the one thing to show: ${unseen.map((x, i) => `${i + 1}. "${x.quote}"`).join(' ')}`,
    );
  return lines.length
    ? `Read from their telling before this breakdown, in their own words:\n${lines.join('\n')}`
    : undefined;
}

/** What the check found; `checked` false where Jev could not be asked (nothing found, nothing asked again). */
export type Gap = {
  missing: string[];
  keyed: boolean;
  checked: boolean;
  /** With `texture`: a seeable simile or reason no moment's one thing to show carries as a look. */
  looks?: string[];
  /** With `texture`: an unseeable one some moment's one thing to show says. */
  sounds?: string[];
};

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
          instructions: `A dream is being drawn as these pictures, one for each moment (the state: what happens in it, and the one thing it shows). The person told this: "${e}". Is it the one thing some moment shows ("shows"), all of it (where it tells two things, both), with what they named, said or asked in it? Only "happens" having it does not count, nor a "shows" that has only part of it or says it more vaguely ("the dreamer talking to her" where they said what they asked her).`,
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
      instructions: `The key moment of a dream being drawn has as the one thing its picture shows: "${key.visual_point}" (what happens in it: "${key.action}"). The dream's strangest fact, in the person's words: "${strange.quote}". Does the one thing it shows carry that fact itself, all of it (where the fact is two things, both: "she fainted, and then she danced me out the door" is the faint and the dance), not only what leads to it or follows it? What happens in it alone does not count.`,
      criteria: { true: 'it shows the strangest fact', false: 'it does not' },
    };
  const textures = builds('texture') ? (t.textures ?? []) : [];
  textures.forEach((x, i) => {
    questions[`x${i}`] = x.seeable
      ? {
          type: 'noul',
          instructions: `A dream is being drawn as these pictures, one for each moment (the state: what happens in it, and the one thing it shows). The person said this of how something is: "${x.quote}". Does some moment's one thing to show ("shows") carry it as something seen: the look itself (its shape, its texture, what pushes or is held down), all of it? Only part of it ("soft" where they said soft as steamed dumplings) does not count, nor only "happens".`,
          criteria: { true: 'some moment shows the look', false: 'no moment shows the look' },
        }
      : {
          type: 'noul',
          instructions: `A dream is being drawn as these pictures, one for each moment (the state: what happens in it, and the one thing it shows). The person said this, which only a sound, a smell, a memory or a feeling carries: "${x.quote}". Does some moment's one thing to show ("shows") say it (the sound, the smell, the memory or the feeling itself)?`,
          criteria: { true: "a moment's one thing to show says it", false: 'no moment shows it' },
        };
  });
  if (!Object.keys(questions).length) return { missing: [], keyed: true, checked: true };
  const state = JSON.stringify({
    moments: ms.map((m) => ({ id: m.id, happens: m.action, shows: m.visual_point })),
  });
  const call = await jev(state, questions).catch(() => null);
  if (!call || call.error || !call.answers) return { missing: [], keyed: true, checked: false };
  // Unread is no finding: a question Jev did not answer counts as met.
  const yes = (k: string) => {
    const a = call.answers?.[k];
    return a?.type !== 'noul' || a.noul >= 0.5;
  };
  return {
    missing: events.filter((_, i) => !yes(`e${i}`)),
    keyed: !strange ? true : !!key && yes('key'),
    checked: true,
    ...(textures.length
      ? {
          looks: textures.filter((x, i) => x.seeable && !yes(`x${i}`)).map((x) => x.quote),
          // A leak only where Jev read one: unread is no finding.
          sounds: textures
            .filter((x, i) => {
              const a = call.answers?.[`x${i}`];
              return !x.seeable && a?.type === 'noul' && a.noul >= 0.5;
            })
            .map((x) => x.quote),
        }
      : {}),
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
  if (gap.looks?.length)
    says.push(
      `What they said things look like is lost from what the moments show: ${gap.looks.map((e, i) => `${i + 1}. "${e}"`).join(' ')} Say each as a look in the one thing some moment shows (its shape, its texture, what pushes or is held down), never with "like" or "as if".`,
    );
  if (gap.sounds?.length)
    says.push(
      `What only a sound, a smell, a memory or a feeling carries is in what a moment shows: ${gap.sounds.map((e, i) => `${i + 1}. "${e}"`).join(' ')} Take it out of the one thing to show: show what is seen as it happens.`,
    );
  if (!gap.keyed && t.strangest)
    says.push(
      `Its key moment does not show what stays with them: "${t.strangest.quote}". Mark "key" the moment that shows it: its action has it happen, and its "visual_point" says what the picture shows of it, as something seen. Give it its own moment if none does.`,
    );
  return says.length
    ? `A breakdown was drafted (below) and checked against what they told. ${says.join(' ')} Return the whole breakdown again with only this changed: every id that still applies kept, 3 to 10 moments, every other rule as before.`
    : undefined;
}

/** Fewer told events and looks missing and sounds shown, then the strangest fact keyed: the better of two drafts. */
const misses = (g: Gap) => g.missing.length + (g.looks?.length ?? 0) + (g.sounds?.length ?? 0);
export const better = (a: Gap, b: Gap) => misses(b) < misses(a) || (misses(b) === misses(a) && b.keyed && !a.keyed);

/**
 * The breakdown, drafted with their telling read first, checked against it, and asked for once more where it falls
 * short (the better of the two kept). Read only for a dream taken in whole (`read`, the import), until the script
 * stage: a live chat's drafts are as they were. With neither step built, or for a revision, the producer as it always
 * was.
 */
export async function draftTold(
  conversation: string,
  words: string,
  previous: Breakdown | undefined,
  deps: { jev: JevFn; read?: boolean; produce?: ProducerFn; write?: WriteFn },
): Promise<{ raw: string; ms: number; notes: string[] }> {
  const produce = deps.produce ?? callProducer;
  const told =
    deps.read && !previous && (builds('strangest') || builds('told_events'))
      ? await readTelling(words, deps.write)
      : null;
  const note = told ? tellingNote(told) : undefined;
  const first = await produce(conversation, previous, note ? { note } : undefined);
  if (!told || !note) return { ...first, notes: [] };
  const gap = await untold(normalizeBreakdown(first.raw).breakdown, told, deps.jev);
  const said = (g: Gap) =>
    g.checked
      ? `${told.events.length - g.missing.length} of ${told.events.length} told events in a moment, the strangest fact ${g.keyed ? 'keyed' : 'not keyed'}${g.looks || g.sounds ? `, ${g.looks?.length ?? 0} looks lost, ${g.sounds?.length ?? 0} sounds shown` : ''}`
      : 'unchecked (Jev failed)';
  const read = `told: the strangest fact "${told.strangest?.quote ?? 'none read'}"`;
  const fix = gap.checked ? fixNote(told, gap) : undefined;
  if (!fix) return { ...first, notes: [`${read}; ${said(gap)}`] };
  // The draft goes back as the writer wrote it: what normalizing adds (the dreamer as the camera) is ours, and would come
  // back without what makes it ours.
  const again = await produce(conversation, JSON.parse(first.raw) as Breakdown, { note, fix });
  const after = await untold(normalizeBreakdown(again.raw).breakdown, told, deps.jev);
  const take = after.checked && better(gap, after);
  return {
    raw: take ? again.raw : first.raw,
    ms: first.ms + again.ms,
    notes: [`${read}; ${said(gap)}; asked again: ${said(after)}, ${take ? 'taken' : 'the first kept'}`],
  };
}
