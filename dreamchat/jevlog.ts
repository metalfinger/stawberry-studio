// What every Jev call costs and decides, per conversation: an append-only log in the conversation's
// folder (`state/<id>/jev.jsonl`), read by the Stages panel. Jev is stateless, so each call resends
// its whole context; until 25 Sep no call's tokens were kept, and nobody could say what a dream
// cost in judgements or where the tokens went.
//
// The conversation a call belongs to comes from the async context the store runs it in, so the
// live call records itself wherever it is made (a turn, the producer's grounding, the gate, the
// background planning) without every call site passing it along. Outside a conversation (tests
// with a fake Jev, one-off scripts) nothing is written.
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Scope = { dir: string; id: string; site?: string };
const scope = new AsyncLocalStorage<Scope>();

/** Run `fn` as part of a conversation: every Jev call in it, however deep, is logged there. */
export function inSession<T>(dir: string | undefined, id: string, fn: () => Promise<T>): Promise<T> {
  return dir ? scope.run({ dir, id }, fn) : fn();
}

/** Run `fn` with its Jev calls logged under `site`, where the questions alone would not say. */
export function atSite<T>(site: string, fn: () => Promise<T>): Promise<T> {
  const s = scope.getStore();
  return s ? scope.run({ ...s, site }, fn) : fn();
}

/** One Jev call: where it was made, what it asked, what it cost. */
export type JevCallEntry = {
  kind: 'call';
  at: string;
  site: string;
  questions: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  /** How long the context sent was, in characters: what the input tokens are paid for. */
  stateChars: number;
  ms: number;
  error: string | null;
};

/** One transition decided from Jev's facts: the question, its answer, the bar, and what code did. */
export type TransitionEntry = {
  kind: 'transition';
  at: string;
  stage: string;
  to: string;
  moment?: string;
  facts: { question: string; answer: number; bar: number; ok: boolean }[];
  decision: string;
  reason: string;
};

export type JevEntry = JevCallEntry | TransitionEntry;

/** Where a call was made, from what it asks, when the caller did not say. */
export function siteOf(keys: string[]): string {
  const has = (re: RegExp) => keys.some((k) => re.test(k));
  if (has(/^(sb_|shot_)/)) return 'storyboard';
  if (has(/^(contradicts|twice|clear|refs_clear|has_)/)) return 'gate';
  if (has(/^is_retelling$/)) return 'retell';
  if (has(/^(said_|where_|state_)/)) return 'grounding';
  if (has(/^(from_|side_|holds_)/)) return 'continuity';
  if (has(/^(named|out_|in_|touches_)/)) return 'correction';
  if (has(/^content_/)) return 'styles';
  if (has(/^(goal_|na_|dk_|eviD_|retell_reply|sketch_reaction|style_choice|wants_to_see|ok_|bad_)/)) return 'turn';
  return 'other';
}

/** Write one entry to the conversation's log, if the call is part of one. */
export function recordJev(entry: Omit<JevCallEntry, 'site' | 'at'> | Omit<TransitionEntry, 'at'>): void {
  const s = scope.getStore();
  if (!s) return;
  const line =
    entry.kind === 'call'
      ? { ...entry, at: new Date().toISOString(), site: s.site ?? siteOf(entry.questions) }
      : { ...entry, at: new Date().toISOString() };
  try {
    mkdirSync(join(s.dir, s.id), { recursive: true });
    appendFileSync(join(s.dir, s.id, 'jev.jsonl'), `${JSON.stringify(line)}\n`);
  } catch {
    // The log is for reading; a write that fails never stops the conversation.
  }
}

/** A conversation's log, oldest first. */
export function readJevLog(dir: string, id: string): JevEntry[] {
  const path = join(dir, id, 'jev.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as JevEntry];
      } catch {
        return [];
      }
    });
}

/** What the calls cost, in all and by where they were made. */
export function jevTotals(entries: JevEntry[]) {
  const calls = entries.filter((e): e is JevCallEntry => e.kind === 'call');
  const sum = (xs: JevCallEntry[]) => ({
    calls: xs.length,
    inputTokens: xs.reduce((a, e) => a + (e.inputTokens ?? 0), 0),
    outputTokens: xs.reduce((a, e) => a + (e.outputTokens ?? 0), 0),
    ms: xs.reduce((a, e) => a + e.ms, 0),
  });
  const sites = [...new Set(calls.map((e) => e.site))];
  return { all: sum(calls), bySite: Object.fromEntries(sites.map((s) => [s, sum(calls.filter((e) => e.site === s))])) };
}
