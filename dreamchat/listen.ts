// Step S8 (listening), the parts that call models: every reply checked against its move and sent back
// once with what it failed named, and which gaps in how the dream looks are asked about. Only used with
// DREAMCHAT_LISTEN=on (lib.ts listenOn); off, the conversation is today's.
import {
  type Answer,
  type JevFn,
  type Question,
  replyCheck,
  type ReplyCheckInput,
  replyFailures,
  retryNote,
} from './jev';
import type { CallResult, ChatMessage, HostFn, ParsedTurn, Thinking } from './llm';
import { parseTurnResponse } from './llm';
import type { Breakdown, Detail } from './producer';
import type { Item } from './sheets';

/** What the check of one reply found, kept with its turn. */
export type ReplyCheckRecord = {
  /** What the first reply failed; empty when it passed. */
  failures: string[];
  /** Sent back once: what the second failed, which was kept, and the first as it was. */
  retry?: { failures: string[]; kept: 'first' | 'second'; first: string[] };
  /** Jev's answers, first reply then second. */
  answers: (Record<string, Answer> | null)[];
  error?: string | null;
};

/**
 * The host's reply, checked against its move (S8). A reply that fails is written once more with its
 * failures named, never cut: the one-question repair emptied style offers (the listening test's
 * before). The second try thinks first (`retryThinking`): sent back without, it failed the same way
 * in 5 of 8 (smoke run, 27 Sep). The second is kept only when it fails less than the first; a tie
 * keeps the first, written without a note that may have been wrong. With `retry` false the reply is
 * checked and the check kept, and nothing is sent back. The judge being down passes it.
 */
export async function checkedReply(
  host: HostFn,
  jev: JevFn,
  input: ChatMessage[],
  thinking: Thinking,
  x: Omit<ReplyCheckInput, 'messages'>,
  opts: { retry?: boolean; retryThinking?: Thinking } = {},
): Promise<{ res: CallResult; parsed: ParsedTurn; record: ReplyCheckRecord }> {
  const judge = async (messages: string[]) => {
    const { state, questions } = replyCheck({ ...x, messages });
    const call = await jev(state, questions);
    return { failures: replyFailures({ ...x, messages }, call.answers), answers: call.answers, error: call.error };
  };
  const res = await host(input, { thinking });
  const parsed = parseTurnResponse(res.content, { keepWords: true });
  const first = await judge(parsed.messages);
  const record: ReplyCheckRecord = { failures: first.failures, answers: [first.answers], error: first.error };
  if (!first.failures.length || opts.retry === false) return { res, parsed, record };
  const again = await host([...input, { role: 'system', content: retryNote(parsed.messages, first.failures) }], {
    thinking: opts.retryThinking ?? thinking,
  });
  const reparsed = parseTurnResponse(again.content, { keepWords: true });
  const second = await judge(reparsed.messages);
  const kept = second.failures.length < first.failures.length ? 'second' : 'first';
  record.retry = { failures: second.failures, kept, first: parsed.messages };
  record.answers.push(second.answers);
  if (kept === 'first') return { res: { ...res, ms: res.ms + again.ms }, parsed, record };
  return {
    res: { ...again, ms: res.ms + again.ms },
    parsed: {
      messages: reparsed.messages,
      violations: [...reparsed.violations, `sent back once: ${first.failures.join('; ')}`],
    },
    record,
  };
}

// ── gaps in how the dream looks ─────────────────────────────────────────────

/** The fields that say how something looks, by kind, in words the person can be asked about. */
export const LOOK_GAPS: Record<Item['kind'], Record<string, string>> = {
  character: { appearance: 'how they look', wardrobe: 'what they wore' },
  location: { geography: 'what kind of place it is', landmarks: "what's in it" },
  prop: { appearance: 'how it looks' },
  cut: {},
  ghost: {},
} as Record<Item['kind'], Record<string, string>>;

/** What isn't known of how it looks: every look field they never told, named for the person. */
export function gapsOf(it: Pick<Item, 'kind' | 'fields'>): string[] {
  const words = LOOK_GAPS[it.kind] ?? {};
  return Object.entries(words)
    .filter(([k]) => !(it.fields as Record<string, Detail | undefined>)[k]?.said)
    .map(([, w]) => w);
}

/** Where each person, place and thing is in the dream: how many moments, the key one, a strange one. */
export function presence(b: Breakdown): Map<string, { moments: number; key: boolean; strange: boolean }> {
  const out = new Map<string, { moments: number; key: boolean; strange: boolean }>();
  const words = (x: string) =>
    x
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3);
  const names = new Map<string, string[]>(
    [...b.people, ...b.places, ...b.things].map((e) => [e.id, words(e.name)] as [string, string[]]),
  );
  for (const sc of b.scenes)
    for (const m of sc.moments) {
      const here = new Set([...(m.visible ?? []), ...(m.things ?? []), m.place || sc.place].filter(Boolean));
      const strange = words(m.dream ?? '');
      for (const id of here) {
        const p = out.get(id) ?? { moments: 0, key: false, strange: false };
        p.moments += 1;
        if (m.key) p.key = true;
        if (strange.length && (names.get(id) ?? []).some((w) => strange.includes(w))) p.strange = true;
        out.set(id, p);
      }
    }
  return out;
}

/** The most gaps asked about besides the dreamer's: a long run of profile questions lost the person (23 Sep). */
export const MAX_GAPS_ASKED = 3;

/**
 * Which gaps in how the dream looks are asked about (docs/rules.md F2): a gap is major when the dreamer
 * would reject the picture if it were wrong and it recurs (in two moments or more), or when it is in
 * the key moment or is the dream's strange thing. Major gaps are asked openly; minor ones are imagined,
 * marked as guesses, and never asked. `matters`: Jev's reading of whether a wrong look would be
 * rejected, by id (a recurring gap it gives no reading for counts as major).
 */
export function majorGaps(b: Breakdown, items: Item[], matters: Record<string, number> = {}): Set<string> {
  const where = presence(b);
  const major = (it: Item) => {
    if (it.extras || !gapsOf(it).length) return false;
    const p = where.get(it.id);
    if (!p) return false;
    return p.key || p.strange || (p.moments >= 2 && (matters[it.id] ?? 1) >= 0.5);
  };
  const asked = new Set<string>();
  const ranked = items
    .filter((it) => !it.isDreamer && major(it))
    .sort(
      (x, y) =>
        Number(where.get(y.id)?.key) - Number(where.get(x.id)?.key) ||
        (where.get(y.id)?.moments ?? 0) - (where.get(x.id)?.moments ?? 0),
    );
  for (const it of ranked.slice(0, MAX_GAPS_ASKED)) asked.add(it.id);
  for (const it of items) if (it.isDreamer && major(it)) asked.add(it.id);
  return asked;
}

/** The recurring gaps Jev is asked about: whether a picture with it looking wrong would be rejected. */
export function mattersQuestions(b: Breakdown, items: Item[]): Record<string, Question> {
  const where = presence(b);
  const q: Record<string, Question> = {};
  for (const it of items) {
    const p = where.get(it.id);
    if (it.extras || it.isDreamer || !p || p.key || p.strange || p.moments < 2 || !gapsOf(it).length) continue;
    q[`matters_${it.id}`] = {
      type: 'noul',
      instructions: `A dream the person told is about to be drawn, and ${it.name} is in several of its pictures. If ${it.name} looked different in them from how it was in their dream (${gapsOf(it).join(', ')}), would the person say the pictures were wrong?`,
      criteria: {
        true: `how ${it.name} looked is part of the dream as they remember it, and a different look would feel wrong to them`,
        false: `${it.name} is only there; how it looks does not matter to the dream, and any ordinary look would do`,
      },
    };
  }
  return q;
}

/** Jev's readings of `mattersQuestions`, by id. Nothing read, nothing returned: every recurring gap counts. */
export async function gapMatters(
  b: Breakdown,
  items: Item[],
  transcript: string,
  jev: JevFn,
): Promise<Record<string, number>> {
  const questions = mattersQuestions(b, items);
  if (!Object.keys(questions).length) return {};
  const call = await jev(transcript, questions);
  const out: Record<string, number> = {};
  for (const [k, a] of Object.entries(call.answers ?? {}))
    if (a.type === 'noul') out[k.slice('matters_'.length)] = a.noul;
  return out;
}
