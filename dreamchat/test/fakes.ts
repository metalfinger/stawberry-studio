// Stand-ins for the two model calls, so the conversation logic can be driven turn by turn
// without a network.
import type { Answer, JevCall, JevFn, Question } from '../jev';
import type { CallResult, ChatMessage, HostFn } from '../llm';

const INERT_CHOICE: Record<string, string> = {
  verbosity: 'neutral',
  warmth: 'neutral',
  wants_out: 'no',
  closing_note: 'warm',
  retell_reply: 'unclear',
};

/**
 * A judge that answers every question with the inert reading unless told otherwise.
 * `script` is called with the question map and the transcript each turn and returns the
 * answers to override, so a test can say "the person has now told `places`, in message 1".
 */
export function fakeJev(
  script: (questions: Record<string, Question>, state: string) => Record<string, Answer> = () => ({}),
): JevFn & { calls: number } {
  const fn = (async (state: string, questions: Record<string, Question>): Promise<JevCall> => {
    fn.calls += 1;
    const answers: Record<string, Answer> = {};
    for (const [key, q] of Object.entries(questions)) {
      if (q.type === 'noul') answers[key] = { type: 'noul', noul: 0 };
      else if (q.type === 'choice') {
        const inert = key.startsWith('eviD_') ? 'none' : (INERT_CHOICE[key] ?? Object.keys(q.criteria)[0]);
        answers[key] = { type: 'choice', choice: inert, confidence: 0.9, probabilities: { [inert]: 0.95 } };
      } else
        answers[key] = { type: 'score', score: 1, legend: { '0': 'low', '1': 'medium', '2': 'high' }, confidence: 0.9 };
    }
    Object.assign(answers, script(questions, state));
    return { questions, state, answers, error: null, ms: 1, usage: null };
  }) as JevFn & { calls: number };
  fn.calls = 0;
  return fn;
}

export const told = (goalId: string, messageIdx: number, p = 0.9): Record<string, Answer> => ({
  [`goal_${goalId}`]: { type: 'noul', noul: p },
  [`eviD_${goalId}`]: { type: 'choice', choice: `m${messageIdx}`, confidence: 0.9, probabilities: {} },
});

export const noul = (p: number): Answer => ({ type: 'noul', noul: p });

export const pick = (choice: string, confidence = 0.9): Answer => ({
  type: 'choice',
  choice,
  confidence,
  probabilities: {},
});

/** A host that replies with the move line of the latest brief, optionally after a delay. */
export function fakeHost(delayMs = 0): HostFn & { calls: ChatMessage[][] } {
  const fn = (async (messages: ChatMessage[]): Promise<CallResult> => {
    fn.calls.push(messages);
    if (delayMs) await Bun.sleep(delayMs);
    const brief = [...messages].reverse().find((m) => m.role === 'system' && m.content.startsWith('<brief>'));
    const move = brief?.content.match(/Move: (\w+)/)?.[1] ?? 'none';
    return { content: JSON.stringify({ response: [`(${move})`] }), model: 'fake', ms: delayMs };
  }) as HostFn & { calls: ChatMessage[][] };
  fn.calls = [];
  return fn;
}

/**
 * Runs `fn` with the pre-draw checks acting (DREAMCHAT_CHECKS=act) or only logging (the default), whatever the
 * environment the tests run in, and puts the switches back after. Acting is acting as before, not routed
 * (DREAMCHAT_JEV_ROUTED unset): routed, only what has earned it acts. Logging keeps the environment's routing,
 * so a run with DREAMCHAT_JEV_ROUTED=on routes it.
 */
export async function withChecks<T>(mode: 'act' | 'log', fn: () => Promise<T>): Promise<T> {
  const was = process.env.DREAMCHAT_CHECKS;
  const routed = process.env.DREAMCHAT_JEV_ROUTED;
  process.env.DREAMCHAT_CHECKS = mode;
  if (mode === 'act') delete process.env.DREAMCHAT_JEV_ROUTED;
  try {
    return await fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_CHECKS;
    else process.env.DREAMCHAT_CHECKS = was;
    if (routed === undefined) delete process.env.DREAMCHAT_JEV_ROUTED;
    else process.env.DREAMCHAT_JEV_ROUTED = routed;
  }
}

/**
 * Runs `fn` with the checks routed by tags (DREAMCHAT_JEV_ROUTED=on) or not, DREAMCHAT_CHECKS as `checks`
 * says (unset, the default, when not given), and with `earned` in checks.ts EARNED for its length;
 * everything is put back after.
 */
export async function withRouted<T>(
  on: boolean,
  fn: () => Promise<T>,
  opts: { checks?: 'act' | 'log'; earned?: string[] } = {},
): Promise<T> {
  const { EARNED } = await import('../checks');
  const was = process.env.DREAMCHAT_JEV_ROUTED;
  const checks = process.env.DREAMCHAT_CHECKS;
  const added = (opts.earned ?? []).filter((id) => !EARNED.has(id));
  if (on) process.env.DREAMCHAT_JEV_ROUTED = 'on';
  else delete process.env.DREAMCHAT_JEV_ROUTED;
  if (opts.checks === undefined) delete process.env.DREAMCHAT_CHECKS;
  else process.env.DREAMCHAT_CHECKS = opts.checks;
  for (const id of added) EARNED.set(id, null);
  try {
    return await fn();
  } finally {
    for (const id of added) EARNED.delete(id);
    if (was === undefined) delete process.env.DREAMCHAT_JEV_ROUTED;
    else process.env.DREAMCHAT_JEV_ROUTED = was;
    if (checks === undefined) delete process.env.DREAMCHAT_CHECKS;
    else process.env.DREAMCHAT_CHECKS = checks;
  }
}

/**
 * The switches the harness's steps are built behind. A test whose expectations hold under one setting of
 * them pins it (`pinSwitches`, `withSwitches`), so the suite gives the same results whatever the
 * environment it runs in sets.
 */
export const STEP_SWITCHES = [
  'DREAMCHAT_RECORD',
  'DREAMCHAT_CHECKS',
  'DREAMCHAT_CUT_SHEET',
  'DREAMCHAT_CAMERA',
  'DREAMCHAT_JEV_ROUTED',
  'DREAMCHAT_LISTEN',
  'DREAMCHAT_AS_DRAWN',
  'DREAMCHAT_FRESH_SEND',
] as const;

/** Every step's switch unset: today's defaults. */
export const DEFAULTS: Record<string, undefined> = Object.fromEntries(STEP_SWITCHES.map((k) => [k, undefined]));

/**
 * Sets switches (undefined or '' unsets one) and returns what puts them back as they were. For a file or a
 * describe block: call it where the block is collected, or in beforeAll, and the put-back in afterAll.
 */
export function pinSwitches(over: Record<string, string | undefined>): () => void {
  const was = Object.fromEntries(Object.keys(over).map((k) => [k, process.env[k]]));
  const put = (k: string, v: string | undefined) => {
    if (v === undefined || v === '') delete process.env[k];
    else process.env[k] = v;
  };
  for (const [k, v] of Object.entries(over)) put(k, v);
  return () => {
    for (const [k, v] of Object.entries(was)) put(k, v);
  };
}

/** Runs `fn` with switches set (undefined unsets one), then puts them back, whether `fn` returns or throws. */
export function withSwitches<T>(over: Record<string, string | undefined>, fn: () => T): T {
  const restore = pinSwitches(over);
  let out: T;
  try {
    out = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (out instanceof Promise) return out.finally(restore) as T;
  restore();
  return out;
}
