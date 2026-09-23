// The host call: the model that writes the listener's words, steered by the brief.
//
// Copied from vibechk experiments/two-call-form/llm.ts (adcbaccdd): the DeepSeek call, the
// turn-output contract, and the code that enforces it (parse, salvage, one-ask repair). The
// lab's bookkeeper (Call A), its one-call and baseline arms, and its mocks are left out;
// tests inject their own fakes.

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const HOST_MODEL = process.env.DREAMCHAT_HOST_MODEL ?? 'deepseek-v4-pro';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * DeepSeek's usage block. `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`
 * are how the platform reports automatic context-cache accounting.
 */
export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

export type CallResult = { content: string; model: string; ms: number; usage?: Usage };

export type HostFn = (messages: ChatMessage[], opts?: { thinking?: Thinking }) => Promise<CallResult>;

/**
 * DeepSeek runs THINKING MODE BY DEFAULT at `high` effort. The lab measured its
 * bookkeeper spending 3,993 completion tokens and 96 seconds to emit an
 * 850-character JSON patch before this was controlled, so thinking is explicit
 * per call. Here the caller picks it per move (`needsThought` in lib.ts): off for
 * ordinary listening, where "low" cost 11-13s a reply against about 2s off with
 * no loss measured in simulated runs, and on for the turns that change phase.
 */
export type Thinking = 'disabled' | 'low' | 'high' | 'max';
export const HOST_THINKING = (process.env.DREAMCHAT_HOST_THINKING as Thinking | undefined) ?? 'disabled';
export const HOST_THINKING_DEEP = (process.env.DREAMCHAT_HOST_THINKING_DEEP as Thinking | undefined) ?? 'low';

export async function callDeepseek(
  messages: ChatMessage[],
  opts: { model?: string; json?: boolean; thinking?: Thinking } = {},
): Promise<CallResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('no DEEPSEEK_API_KEY');
  const model = opts.model ?? HOST_MODEL;
  const thinking = opts.thinking ?? HOST_THINKING;
  const started = Date.now();
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      ...(thinking === 'disabled'
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, reasoning_effort: thinking }),
    }),
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[]; usage?: Usage };
  return { content: body.choices[0]?.message?.content ?? '', model, ms: Date.now() - started, usage: body.usage };
}

export const callHost: HostFn = async (messages, opts = {}) => {
  const first = await callDeepseek(messages, { json: true, thinking: opts.thinking });
  // The provider occasionally returns an EMPTY completion (seen twice in the lab).
  // One retry on a blank is error handling, not a second opinion: the request is
  // identical and nothing about it is judged.
  if (first.content.trim() === '') {
    const second = await callDeepseek(messages, { json: true, thinking: opts.thinking });
    return { ...second, ms: first.ms + second.ms };
  }
  return first;
};

/**
 * The turn-output contract: a plain array of non-blank strings, one ask per turn, and
 * the ask is the LAST message.
 *
 * The rule names the behaviour rather than the punctuation. Written as "at most
 * ONE question mark" it was obeyed as a rule about characters: the model kept
 * its questions and dropped their question marks (session jev-919-163300).
 * Stated in prose because DeepSeek's json_object mode carries no schema; the
 * actual enforcement is `parseTurnResponse` below.
 *
 * There is no `wrapping` flag here, unlike the lab: in this chat, code decides
 * when the conversation ends, and the host is only told to say goodbye when it has.
 */
export const TURN_OUTPUT_CONTRACT = `

## How you reply

Reply with JSON only: {"response": ["...", "..."]}

- \`response\` is an ARRAY of separate chat messages, sent one after another, the
  way a person fires off two quick messages instead of one dense paragraph.
- Use ONE message when a single thought is all it needs. Use TWO (rarely three)
  when you want to react first and then ask — the reaction lands on its own,
  then the question arrives clean. Never pad to reach two.
- Every message must be non-empty. No markdown, no bullet lists, no labels.
- Ask about one thing per turn. If you want two things, keep one and wait for the answer.
- The LAST message carries the ask, when there is one. Do not follow a question
  with another statement — the question goes last.`;

export type ParsedTurn = { readonly messages: string[]; readonly violations: string[] };

/**
 * Tool-call scaffolding that must never be shown to a respondent. The provider
 * leaks these when it wants a tool it cannot call.
 */
const TOOL_MARKUP = /DSML|<\｜|tool_calls>|<\/?invoke|"goal_id"\s*:/;

// The turn's own vocabulary. A salvaged string that IS one of these is a key
// the model spilled into its own message list, not something it meant to say.
const CONTRACT_KEYS = new Set(['response', 'fieldKey', 'respondWith', 'wrapping', 'completionEstimate']);

/**
 * Last resort before showing a respondent raw model output. The strings are
 * recoverable even when the JSON around them is not (session jev-919-124258,
 * turn 14, showed a broken envelope on screen as itself).
 */
export function salvageTurn(raw: string): string[] | null {
  const keyed = raw.search(/"response"\s*:\s*\[/);
  const start = keyed === -1 ? raw.indexOf('[') : keyed;
  if (start === -1) return null;
  const messages: string[] = [];
  for (const m of raw.slice(start).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const text = m[1];
    if (CONTRACT_KEYS.has(text)) continue;
    let decoded: string;
    try {
      decoded = JSON.parse(`"${text}"`) as string;
    } catch {
      decoded = text;
    }
    const trimmed = decoded.trim();
    if (trimmed) messages.push(trimmed);
  }
  return messages.length ? messages : null;
}

export const RECOVERY = 'Sorry, could you say that again?';

const QUESTION_COUNT = (text: string) => text.split('?').length - 1;

/**
 * Repairing beats both alternatives to a two-question turn: discarding costs the
 * person the whole turn, and delivering it teaches nothing.
 *
 * A rhetorical tag in the REACTION keeps the reaction and loses the question mark.
 * Two real asks in the FINAL message keep the trailing one, since the ask is the
 * last message.
 */
function repairExtraQuestions(messages: string[], violations: string[]): string[] {
  if (messages.reduce((n, m) => n + QUESTION_COUNT(m), 0) <= 1) return messages;

  const out = [...messages];
  const lastIdx = out.length - 1;

  for (let i = 0; i < lastIdx; i++) {
    if (QUESTION_COUNT(out[i]) === 0) continue;
    out[i] = out[i].replace(/\?/g, '.').replace(/\.{2,}/g, '.');
    violations.push('rhetorical question in a non-final message — softened to a statement');
  }

  // One ask offering options is ONE ask: "who was there? your mum, a stranger...
  // or someone you couldn't place?" is a single question with a tail (session
  // pick-smoke). A trailing fragment that opens with a conjunction, or with an
  // example ("did you hear anything? like voices, or music?"), belongs to the
  // sentence before it; kept alone it read "like sounds of people getting ready,
  // or even animals around?" (simulated run effigy, 23 Sep).
  const CONTINUATION = /^\s*(or|and|but|like|maybe|perhaps|even|say|such as|whether)\b/i;
  if (QUESTION_COUNT(out[lastIdx]) > 1) {
    const parts = out[lastIdx].match(/[^.!?]+[.!?]*/g) ?? [out[lastIdx]];
    let keepFrom = parts.length - 1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!parts[i].includes('?')) continue;
      keepFrom = i;
      while (keepFrom > 0) {
        const cur = parts[keepFrom];
        if (CONTINUATION.test(cur) || !cur.includes('?')) keepFrom--;
        else break;
      }
      break;
    }
    const kept = parts.slice(keepFrom).join('').trim();
    if (kept) {
      out[lastIdx] = kept;
      violations.push('two asks in one turn — kept the trailing question');
    }
  }

  const left = out.reduce((n, m) => n + QUESTION_COUNT(m), 0);
  if (left > 1) violations.push(`${left} question marks remain after repair`);
  return out.filter((m) => m.trim().length > 0);
}

/**
 * Enforce the turn contract in CODE, never trusting the provider. Degrades rather
 * than throws: an unparseable turn still reaches the person as text, because a
 * broken conversation is worse than a malformed one.
 */
export function parseTurnResponse(raw: string): ParsedTurn {
  const violations: string[] = [];
  if (TOOL_MARKUP.test(raw))
    return { messages: [RECOVERY], violations: ['tool-call markup leaked into content — reply suppressed'] };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    const saved = salvageTurn(raw);
    if (saved) return { messages: saved, violations: ['not JSON — messages salvaged'] };
    return { messages: [RECOVERY], violations: ['not JSON and nothing salvageable — reply suppressed'] };
  }

  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  let list: unknown = record.response;
  if (list === undefined && Array.isArray(value)) {
    violations.push('bare array with no response key — read as the response');
    list = value;
  }
  if (typeof list === 'string') {
    violations.push('response was a bare string — levelled to a one-message array');
    list = [list];
  }
  if (!Array.isArray(list)) {
    const saved = salvageTurn(raw);
    if (saved) return { messages: saved, violations: [...violations, 'no response array — messages salvaged'] };
    return { messages: [RECOVERY], violations: [...violations, 'no response array — reply suppressed'] };
  }

  const messages = list
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  if (messages.length !== list.length) violations.push('dropped blank or non-string messages');
  if (messages.length === 0) return { messages: [RECOVERY], violations: [...violations, 'every message was blank'] };

  return { messages: repairExtraQuestions(messages, violations), violations };
}
