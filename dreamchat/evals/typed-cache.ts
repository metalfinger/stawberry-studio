// A dream's typed readings (typed.ts), read once and kept. Every answer, the writer's and Jev's, is kept by
// the model that gave it and a hash of exactly what it was asked (runs/typed-cache.json, beside the implied
// reading's cache), so a moment whose words and dream are unchanged is never asked again, and a moment
// frozen and live alike is asked once. With `ask: false` only the cache is read (what S6's builder and the
// evals do): a moment not in it is read as having no facts and listed.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { JevCall, JevFn } from '../jev';
import { type CallResult, WRITER_MODEL } from '../llm';
import { completeViews, moments as momentsOf } from '../producer';
import type { Session } from '../session';
import { readTypedMoment, TYPED_THINKING, type TypedCost, type TypedReading, type WriteFn, writeTyped } from '../typed';
import { DIR, sha256 } from './saved';

export const TYPED_CACHE = process.env.DREAMCHAT_TYPED_CACHE ?? join(DIR, 'runs', 'typed-cache.json');

type Entry = {
  content?: string;
  usage?: CallResult['usage'];
  answers?: JevCall['answers'];
  jevUsage?: JevCall['usage'];
};

/** The cache file, loaded once and written back only when something was added. */
export class TypedCache {
  entries: Record<string, Entry>;
  added = 0;
  constructor(readonly file = TYPED_CACHE) {
    this.entries = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>) : {};
  }
  save(): void {
    if (!this.added) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, `${JSON.stringify(this.entries)}\n`);
    renameSync(`${this.file}.tmp`, this.file);
    this.added = 0;
  }
}

/** The writer's name in the cache: its model and how much it thinks. */
export const typedWriter = () => `${WRITER_MODEL} thinking ${TYPED_THINKING}`;

export type Counts = { asked: number; cached: number; missing: number };

/** The writer and Jev behind the cache; with `ask` false a miss throws (the moment reads as not cached). */
export function cachedFns(
  cache: TypedCache,
  opts: { write?: WriteFn; writer?: string; jev?: JevFn; jevModel: string; ask: boolean },
  counts: { writer: Counts; jev: Counts },
): { write: WriteFn; jev: JevFn } {
  const writer = opts.writer ?? typedWriter();
  const write: WriteFn = async (messages) => {
    const key = sha256(`typed writer ${writer}\n${JSON.stringify(messages)}`);
    const hit = cache.entries[key];
    if (hit?.content !== undefined) {
      counts.writer.cached++;
      return { content: hit.content, model: writer, ms: 0, usage: hit.usage };
    }
    if (!opts.ask) {
      counts.writer.missing++;
      throw new Error('not cached');
    }
    counts.writer.asked++;
    const res = await (opts.write ?? writeTyped)(messages);
    cache.entries[key] = { content: res.content, usage: res.usage };
    cache.added++;
    return res;
  };
  const jev: JevFn = async (state, questions) => {
    const key = sha256(`typed jev ${opts.jevModel}\n${state}\n${JSON.stringify(questions)}`);
    const hit = cache.entries[key];
    if (hit?.answers) {
      counts.jev.cached++;
      return {
        questions,
        state,
        answers: hit.answers,
        error: null,
        ms: 0,
        usage: hit.jevUsage ?? null,
        model: opts.jevModel,
      };
    }
    if (!opts.ask || !opts.jev) {
      counts.jev.missing++;
      return { questions, state, answers: null, error: 'not cached', ms: 0, usage: null };
    }
    counts.jev.asked++;
    const call = await opts.jev(state, questions);
    if (call.answers) {
      cache.entries[key] = { answers: call.answers, jevUsage: call.usage };
      cache.added++;
    }
    return call;
  };
  return { write, jev };
}

/** At most `n` at once. */
export function limiter(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let running = 0;
  const queue: (() => void)[] = [];
  return async (fn) => {
    if (running >= n) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

/**
 * Every moment of a saved dream read (or only `only`), each through `limit`: its readings by moment, what
 * was asked or found in the cache, and the moments whose reading failed (not cached, or a model error).
 */
export async function readTypedDream(
  s: Session,
  fns: { write: WriteFn; jev: JevFn },
  opts: { limit?: <T>(fn: () => Promise<T>) => Promise<T>; only?: string[]; onMoment?: () => void } = {},
): Promise<{ readings: Record<string, TypedReading>; cost: TypedCost; errors: Record<string, string> }> {
  const b = s.draft?.breakdown && structuredClone(s.draft.breakdown);
  const cost: TypedCost = { writerCalls: 0, writerIn: 0, writerOut: 0, jevCalls: 0 };
  const readings: Record<string, TypedReading> = {};
  const errors: Record<string, string> = {};
  if (!b) return { readings, cost, errors };
  // The views as a rebuild completes them (plan.ts rebuild), so the words are the ones the prompts read.
  completeViews(b);
  const limit = opts.limit ?? ((fn) => fn());
  await Promise.all(
    momentsOf(b)
      .filter((m) => !opts.only || opts.only.includes(m.id))
      .map((m) =>
        limit(async () => {
          const r = await readTypedMoment(b, m, fns.write, fns.jev);
          readings[m.id] = r.reading;
          for (const k of Object.keys(cost) as (keyof TypedCost)[]) cost[k] += r.cost[k];
          if (r.error) errors[m.id] = r.error;
          opts.onMoment?.();
        }),
      ),
  );
  return { readings, cost, errors };
}
