// A dream's implied states (implied.ts), read once and kept: the evals rebuild frozen dreams, which
// were saved before the reading existed, so with DREAMCHAT_RECORD=on each is read here as the harness
// reads it while planning, and put in the dream's readings before it is rebuilt. Every answer, the
// writer's and Jev's, is kept by the hash of the model that gave it and exactly what it was asked
// (runs/implied-cache.json), so a run again gives the same readings and asks only what changed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { IMPLIED_THINKING, type ImpliedCost, readImplied, type WriteFn, writeImplied } from '../implied';
import type { JevCall, JevFn } from '../jev';
import { type CallResult, HOST_MODEL } from '../llm';
import { completeViews } from '../producer';
import { recordInputsOf, storyRecord } from '../record';
import type { Session } from '../session';
import { DIR, sha256 } from './saved';

export const IMPLIED_CACHE = join(DIR, 'runs', 'implied-cache.json');

type Cache = Record<
  string,
  { content?: string; usage?: CallResult['usage']; answers?: JevCall['answers']; jevUsage?: JevCall['usage'] }
>;

/**
 * A dream with its implied states in its readings, read with `write` and `jev` (by their model names,
 * for the cache) and kept in `cacheFile`. What was asked anew, and what it cost, is returned.
 */
export async function withImplied(
  s: Session,
  opts: { write?: WriteFn; writer?: string; jev: JevFn; jevModel: string; cacheFile?: string },
): Promise<{ session: Session; cost: ImpliedCost; asked: number; cached: number }> {
  const b = s.draft?.breakdown && structuredClone(s.draft.breakdown);
  if (!b || !s.style) return { session: s, cost: zero(), asked: 0, cached: 0 };
  const file = opts.cacheFile ?? IMPLIED_CACHE;
  const cache: Cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const writer = opts.writer ?? `${HOST_MODEL} thinking ${IMPLIED_THINKING}`;
  const write = opts.write ?? writeImplied;
  let asked = 0;
  let cached = 0;
  const cachedWrite: WriteFn = async (messages) => {
    const key = sha256(`writer ${writer}\n${JSON.stringify(messages)}`);
    const hit = cache[key];
    if (hit?.content !== undefined) {
      cached++;
      return { content: hit.content, model: writer, ms: 0, usage: hit.usage };
    }
    asked++;
    const res = await write(messages);
    cache[key] = { content: res.content, usage: res.usage };
    return res;
  };
  const cachedJev: JevFn = async (state, questions) => {
    const key = sha256(`jev ${opts.jevModel}\n${state}\n${JSON.stringify(questions)}`);
    const hit = cache[key];
    if (hit?.answers) {
      cached++;
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
    asked++;
    const call = await opts.jev(state, questions);
    if (call.answers) cache[key] = { answers: call.answers, jevUsage: call.usage };
    return call;
  };
  // The record the reading is given, made as a rebuild makes it (plan.ts rebuild).
  completeViews(b);
  const inputs = recordInputsOf(s);
  const record = storyRecord(b, inputs.items, s.draft?.readings, { words: inputs.words, style: s.style }).record;
  const { implied, cost } = await readImplied(b, record, cachedWrite, cachedJev);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(cache)}\n`);
  const session = structuredClone(s);
  session.draft = { ...session.draft!, readings: { ...(session.draft?.readings ?? {}), implied } };
  return { session, cost, asked, cached };
}

const zero = (): ImpliedCost => ({ writerCalls: 0, writerIn: 0, writerOut: 0, jevCalls: 0, jevIn: 0, jevOut: 0 });

/** What the readings cost, in all and a dream on average, as an eval prints it. */
export function costLine(costs: { cost: ImpliedCost; asked: number; cached: number }[]): string {
  const sum = (k: keyof ImpliedCost) => costs.reduce((a, x) => a + x.cost[k], 0);
  const per = (k: keyof ImpliedCost) => Math.round(sum(k) / Math.max(1, costs.length));
  return `what the moments imply, read for ${costs.length} dreams (${costs.reduce((a, x) => a + x.asked, 0)} calls asked now, ${costs.reduce((a, x) => a + x.cached, 0)} from the cache): writer ${sum('writerCalls')} calls, ${sum('writerIn')} tokens in, ${sum('writerOut')} out; Jev ${sum('jevCalls')} calls, ${sum('jevIn')} tokens in, ${sum('jevOut')} out. A dream on average: writer ${per('writerCalls')} calls, ${per('writerIn')} in, ${per('writerOut')} out; Jev ${per('jevCalls')} calls, ${per('jevIn')} in, ${per('jevOut')} out`;
}
