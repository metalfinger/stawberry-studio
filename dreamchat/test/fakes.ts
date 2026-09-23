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
