// Jev in the bookkeeper's seat: it reads the whole transcript every turn and answers typed
// questions with probabilities. It writes no text, so it cannot invent coverage.
//
// Copied from vibechk experiments/two-call-form/jev.ts (adcbaccdd), keeping the lab's
// measured mechanisms:
// - evidence is SELECTED from the person's own messages, never written;
// - goal closure is anchored on that evidence rather than ratcheted;
// - choice answers are gated per decision on their own confidence.
// Added for dreams:
// - "they don't remember" per goal;
// - "have they told it to the end";
// - how they answered a retelling.
import type {
  ClosingNote,
  GoalDef,
  GoalsFile,
  GoalState,
  Phase,
  Rapport,
  RetellReply,
  State,
  Thread,
  WantsToSee,
} from './lib';
import { reconcileThreads } from './lib';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.JEV_MODEL ?? 'jev-latest';

function apiKey(): string | null {
  return process.env.JEV_API_KEY?.trim() || null;
}

export function jevAvailable(): boolean {
  return apiKey() !== null;
}

export type Question =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; legend: Record<string, string>; confidence: number };

export type JevCall = {
  questions: Record<string, Question>;
  state: string;
  answers: Record<string, Answer> | null;
  error: string | null;
  ms: number;
  usage: { input_tokens: number; output_tokens: number } | null;
};

export type JevFn = (state: string, questions: Record<string, Question>) => Promise<JevCall>;

export const callJev: JevFn = async (state, questions) => {
  const key = apiKey();
  const t0 = Date.now();
  if (key === null) return { questions, state, answers: null, error: 'no JEV_API_KEY', ms: 0, usage: null };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: MODEL, questions }),
    });
    const ms = Date.now() - t0;
    if (!res.ok)
      return { questions, state, answers: null, error: `${res.status} ${await res.text()}`, ms, usage: null };
    const body = (await res.json()) as { answers: Record<string, Answer>; usage: JevCall['usage'] };
    return { questions, state, answers: body.answers, error: null, ms, usage: body.usage };
  } catch (e) {
    return { questions, state, answers: null, error: String(e), ms: Date.now() - t0, usage: null };
  }
};

// ── what we ask ─────────────────────────────────────────────────────────────

export type Exchange = { role: 'user' | 'assistant'; content: string };

// Latency is flat in question count (measured: 1 question 823ms, 80 questions
// 336ms), so the only cost of asking more is tokens. These bound the token
// side, not the time side.
const EVIDENCE_WINDOW = 12; // most recent respondent messages offered as evidence
// Only the message that just arrived is considered as a new thread. Nominating
// the last three re-offered the same message on three consecutive turns, so the
// supply of "fresh" threads never ran out (session jev-919-124258).
const THREAD_WINDOW = 1;

function respondentMessages(transcript: Exchange[]): { idx: number; text: string }[] {
  return transcript
    .map((e, idx) => ({ idx, role: e.role, text: e.content }))
    .filter((e) => e.role === 'user')
    .map(({ idx, text }) => ({ idx, text }));
}

export function renderTranscript(transcript: Exchange[]): string {
  return transcript.map((e) => (e.role === 'user' ? `Person: ${e.content}` : `Listener: ${e.content}`)).join('\n');
}

export function bookkeeperQuestions(
  cfg: GoalsFile,
  transcript: Exchange[],
  prev: State | undefined,
  phase: Phase,
  styles: { id: string; name: string }[] = [],
): Record<string, Question> {
  const msgs = respondentMessages(transcript);

  // The window slides, and an answer given early slides out of it. A message
  // that is currently serving as evidence is never dropped from the options,
  // however old it gets (session jev-919-124258 lost two captured goals when it was).
  const anchored = new Set(
    Object.values(prev?.goals ?? {})
      .map((g) => g.evidence)
      .filter((e) => e !== ''),
  );
  const offered = msgs.filter((m, i) => i >= msgs.length - EVIDENCE_WINDOW || anchored.has(m.text));
  const evidenceOptions: Record<string, string> = { none: 'no message here answers it' };
  for (const m of offered) evidenceOptions[`m${m.idx}`] = m.text.slice(0, 240);

  const q: Record<string, Question> = {};

  for (const g of cfg.goals) {
    q[`goal_${g.id}`] = {
      type: 'noul',
      instructions: `About the dream the person is telling: "${g.label}" (looking for: ${g.probe_hint}). Has the person told this?`,
      criteria: {
        true: 'their own words tell it, quotably',
        false: 'not raised, or glanced off it with no real content',
      },
    };
    // The bar is high on purpose: an inapplicable goal is never raised again, so
    // a wrong reading here costs a field.
    q[`na_${g.id}`] = {
      type: 'noul',
      instructions: `About the dream: "${g.label}" (${g.probe_hint}). From what the person has described, does this simply not apply to their dream, so that asking would make no sense?`,
      criteria: {
        true: 'their own account rules it out: it was not in the dream, or cannot be',
        false: 'it applies and is merely untold so far, or they have not said enough to tell',
      },
    };
    q[`dk_${g.id}`] = {
      type: 'noul',
      instructions: `About the dream: "${g.label}" (${g.probe_hint}). Has the person said they don't remember this, or that it was too vague to say?`,
      criteria: {
        true: "they said they don't remember, can't recall, or it was too hazy to say",
        false: "they described it, haven't been asked, or haven't said either way",
      },
    };
    q[`eviD_${g.id}`] = {
      type: 'choice',
      instructions: `Which of the person's own messages best tells: "${g.label}"?`,
      criteria: evidenceOptions,
    };
  }

  const latest = msgs.at(-1)?.text ?? '';
  q.verbosity = {
    type: 'choice',
    instructions: `How did the person write this message: "${latest.slice(0, 240)}"?`,
    criteria: {
      chatty: 'long or expansive, more than was asked for',
      neutral: 'a full answer, no more',
      clipped: 'genuinely short, under about ten words, with no new content',
    },
  };
  q.volunteers_detail = {
    type: 'noul',
    instructions: `In this message, did the person add something they were not asked for: "${latest.slice(0, 240)}"?`,
  };
  q.warmth = {
    type: 'choice',
    instructions: `How warm does the person sound in this message: "${latest.slice(0, 240)}"?`,
    criteria: { high: 'openly friendly', neutral: 'civil, even', low: 'cold or reluctant' },
  };
  // "hard" ends the conversation on the spot; "soft" only softens the tone. A person
  // who types "bye" has already left, and the first wording, which only covered people
  // explaining their exit, scored it soft (session jev-919-121325). Hedging about the
  // SUBJECT is not leaving the chat (session jev-919-125936).
  q.wants_out = {
    type: 'choice',
    instructions:
      'Read only the person\'s most recent message. Is the person finishing THIS CONVERSATION? Being unsure, hazy or upset about the dream itself is not the same thing and counts as no. Saying "that\'s all I remember" about the dream is not leaving the conversation either.',
    criteria: {
      no: 'still talking to you, including when they are unsure or hazy about the dream',
      soft: "winding down the conversation but still here: that's it, nothing else, or asking whether this is finished",
      hard: "leaving the conversation: a farewell such as bye, goodbye, see you, thanks that's all, or saying they have to go",
    },
  };
  q.closing_note = {
    type: 'choice',
    instructions:
      'If this conversation had to end right now, what note should the last message strike, judged on everything the person has said?',
    criteria: {
      celebrate: 'something genuinely good came out of it for them and it should be the last thing they read',
      acknowledge_problem:
        'the dream or telling it was hard for them and they said so; ending without naming it would read as not listening',
      warm: 'an ordinary good conversation, nothing standing out either way',
      brisk: 'they are disengaged or in a hurry; short and done',
    },
  };

  if (phase === 'listen') {
    q.finished_telling = {
      type: 'noul',
      instructions:
        "The person is telling a dream they had. Have they reached the end of their account of what happened — the dream's ending, waking up, or saying that's all they remember — rather than being partway through it?",
      criteria: {
        true: "they have told it through to an end, or said that's all they remember",
        false: 'they are still partway through the story, or have only described a part of it',
      },
    };
  }
  if (phase === 'retell') {
    // Anchored on the message itself, as the tone questions are. Pointed at "the most
    // recent message" in the abstract, Jev read "Yes, that's right." as adding more, because
    // an earlier message in the transcript had added something (simulated run icehead, 23 Sep).
    q.retell_reply = {
      type: 'choice',
      instructions: `The listener has just told the person's dream back to them. How does the person answer that in this message: "${latest.slice(0, 240)}"?`,
      criteria: {
        confirmed: "they said it's right or near enough, or that there's nothing more to add",
        corrected: 'they said part of it was wrong, and put it right',
        added_more: 'they added a detail that was missing from it',
        unclear: "they didn't say whether it was right",
      },
    };
  }

  if (phase === 'offer') {
    q.wants_to_see = {
      type: 'choice',
      instructions: `The listener has asked whether the person would like to see their dream drawn. How does the person answer in this message: "${latest.slice(0, 240)}"?`,
      criteria: {
        yes: 'yes, they want to see it',
        not_yet: 'maybe later, not now, or they want to say more first',
        no: "no, they'd rather not see it drawn",
        unclear: "they didn't answer that",
      },
    };
  }
  if (phase === 'style') {
    const criteria: Record<string, string> = {};
    for (const o of styles) criteria[o.id] = `they chose: ${o.name}`;
    criteria.own = 'they described, in their own words, a different way it should look';
    criteria.unsure = "they aren't sure, or left it to the listener";
    q.style_choice = {
      type: 'choice',
      instructions: `The listener offered ways the person's dream could be drawn. Which did the person choose in this message: "${latest.slice(0, 240)}"? If they agreed to a way the listener suggested, pick that one.`,
      criteria,
    };
  }

  // Threads: something they raised that was not asked about. A summary cannot
  // be generated here, so the thread IS the message, chosen rather than written.
  for (const m of msgs.slice(-THREAD_WINDOW)) {
    q[`thread_${m.idx}`] = {
      type: 'noul',
      instructions: `The person said: "${m.text.slice(0, 240)}". Did they raise something here, about their dream, that the listener did not ask about and that is worth following up?`,
      criteria: {
        true: 'they brought up their own detail or moment with substance behind it',
        false: 'they only answered what was asked, or it was an aside with nothing behind it',
      },
    };
    q[`tstrength_${m.idx}`] = {
      type: 'score',
      instructions: `How much energy and detail did the person put into this, compared with their other messages: "${m.text.slice(0, 240)}"?`,
      criteria: ['low', 'medium', 'high'],
    };
  }

  return q;
}

/**
 * Did the reply to a retell move actually tell the dream back? Code marks the phase as
 * retelling from the move it picked, so a reply that did something else must be caught, or
 * the person's next answer is read as confirming a retelling they never saw. Seen twice in
 * simulated runs (23 Sep): the host asked the previous turn's question instead, and once it
 * greeted the person as if starting over.
 */
export function retellingQuestion(reply: string): Record<string, Question> {
  return {
    is_retelling: {
      type: 'noul',
      instructions: `Does this message tell the person's dream back to them, as a summary of what happened: "${reply.slice(0, 1200)}"?`,
      criteria: {
        true: 'it recounts the dream: what happened, where, who was there',
        false: 'it is a greeting, a question, a reaction or a goodbye rather than a retelling',
      },
    },
  };
}

// ── what we do with the answers ─────────────────────────────────────────────

function noul(a: Answer | undefined): number | null {
  return a?.type === 'noul' ? a.noul : null;
}

// A Choice carries its own confidence, and collapsing it to the bare label
// throws away the thing this judge is being paid for. On a short factual reply
// the judge returned wants_out "soft" at 0.58 with confidence 0.36; reading only
// `.choice` turned that into a certainty and wrapped the conversation on turn 4
// of 9 (session jev-cmp2). Below the bar the fallback wins, which for every
// field here is the inert reading.
const MIN_CHOICE_CONFIDENCE = Number(process.env.JEV_MIN_CHOICE_CONFIDENCE ?? 0.6);

// The bar belongs to the DECISION, not to the judge. `closing_note` only chooses
// a tone, and the default bar overruled a considered answer into the blandest
// one on the turn it mattered (session opentest, turn 7).
const LOW_STAKES_CONFIDENCE = 0.35;

// A retelling answer moves the conversation on, but its fallback ("unclear") only asks
// once more, so a middling bar is enough.
const RETELL_CONFIDENCE = 0.5;

function choice<T extends string>(
  a: Answer | undefined,
  allowed: readonly T[],
  fallback: T,
  minConfidence: number = MIN_CHOICE_CONFIDENCE,
): { value: T; lowConfidence: boolean } {
  if (a?.type !== 'choice') return { value: fallback, lowConfidence: false };
  if (!(allowed as readonly string[]).includes(a.choice)) return { value: fallback, lowConfidence: false };
  if (a.confidence < minConfidence) return { value: fallback, lowConfidence: true };
  return { value: a.choice as T, lowConfidence: false };
}

export type JevReadNote = { goalId: string; reason: string; attempted: number };

const NA_BAR = 0.85;
// Unknown settles a goal for good unless they later tell it, so the bar sits just under
// not-applicable's.
const DK_BAR = 0.8;

function readGoal(
  g: GoalDef,
  a: Record<string, Answer>,
  prevG: GoalState | undefined,
  threshold: number,
  byIdx: Map<number, string>,
  notes: JevReadNote[],
): GoalState {
  const prevCovered = (prevG?.confidence ?? 0) >= threshold;
  const na = noul(a[`na_${g.id}`]) ?? 0;
  if (na >= NA_BAR && !prevCovered) {
    notes.push({ goalId: g.id, reason: `not applicable (${na.toFixed(2)})`, attempted: na });
    return { confidence: prevG?.confidence ?? 0, evidence: prevG?.evidence ?? '', not_applicable: true };
  }

  const conf = noul(a[`goal_${g.id}`]);
  let next: GoalState;
  if (conf === null) {
    notes.push({ goalId: g.id, reason: 'no answer returned', attempted: -1 });
    next = prevG ?? { confidence: 0, evidence: '' };
  } else {
    const pick = a[`eviD_${g.id}`];
    const key = pick?.type === 'choice' ? pick.choice : 'none';
    const evidence = key.startsWith('m') ? (byIdx.get(Number(key.slice(1))) ?? '') : '';
    // A goal cannot read as told with nothing behind it, and the only expressible
    // evidence is a message the person actually sent.
    if (conf >= threshold && evidence === '') {
      notes.push({ goalId: g.id, reason: 'told but no message selected as evidence', attempted: conf });
      next = { confidence: Math.min(conf, threshold - 0.01), evidence: '' };
    } else {
      // Hysteresis, anchored on the evidence rather than on the number. Re-reading the
      // whole transcript fresh let a settled goal dip under the bar as later answers
      // diluted it (session jev-cmp), while the SELECTED message never moved. While Jev
      // still points at the message it closed on, the goal stays closed.
      const anchored = prevG !== undefined && prevCovered && prevG.evidence !== '' && prevG.evidence === evidence;
      if (anchored && conf < prevG.confidence) {
        if (conf < threshold)
          notes.push({ goalId: g.id, reason: `held at ${prevG.confidence} by unchanged evidence`, attempted: conf });
        next = { confidence: prevG.confidence, evidence };
      } else {
        next = { confidence: conf, evidence };
      }
    }
  }

  // Not remembered: settled until they tell it after all.
  if (next.confidence < threshold) {
    const dk = noul(a[`dk_${g.id}`]) ?? 0;
    if (dk >= DK_BAR || prevG?.unknown) {
      if (!prevG?.unknown) notes.push({ goalId: g.id, reason: `not remembered (${dk.toFixed(2)})`, attempted: dk });
      return { ...next, unknown: true };
    }
  }
  return { confidence: next.confidence, evidence: next.evidence };
}

export function readState(
  prev: State,
  cfg: GoalsFile,
  transcript: Exchange[],
  call: JevCall,
  turnNow: number,
  phase: Phase,
  threadStrengthFloor = 0.5,
): { next: State; notes: JevReadNote[] } {
  const notes: JevReadNote[] = [];
  // A failed judge must never blank the ledger. Degrade to the previous reading.
  if (call.answers === null) {
    notes.push({ goalId: '*', reason: call.error ?? 'no answers', attempted: -1 });
    return {
      next: {
        ...prev,
        turn: turnNow,
        signals: { ...prev.signals, retell_reply: null, wants_to_see: null, style_choice: null },
      },
      notes,
    };
  }
  const a = call.answers;
  const byIdx = new Map(transcript.map((e, idx) => [idx, e.content]));

  const goals: State['goals'] = {};
  for (const g of cfg.goals) goals[g.id] = readGoal(g, a, prev.goals[g.id], cfg.confidence_threshold, byIdx, notes);

  const verbosity = choice(a.verbosity, ['chatty', 'neutral', 'clipped'] as const, 'neutral');
  const warmth = choice(a.warmth, ['high', 'neutral', 'low'] as const, 'neutral');
  const wantsOut = choice(a.wants_out, ['no', 'soft', 'hard'] as const, 'no');
  for (const [name, c] of [
    ['verbosity', verbosity],
    ['warmth', warmth],
    ['wants_out', wantsOut],
  ] as const)
    if (c.lowConfidence)
      notes.push({ goalId: name, reason: 'choice below confidence bar, read as default', attempted: -1 });
  const closing = choice<ClosingNote>(
    a.closing_note,
    ['celebrate', 'acknowledge_problem', 'warm', 'brisk'] as const,
    'warm',
    LOW_STAKES_CONFIDENCE,
  );

  const rapport: Rapport = {
    verbosity: verbosity.value,
    volunteers_detail: (noul(a.volunteers_detail) ?? 0) >= 0.5,
    warmth: warmth.value,
    wants_out: wantsOut.value,
  };

  const finished = phase === 'listen' ? noul(a.finished_telling) : null;
  let retellReply: RetellReply | null = null;
  if (phase === 'retell') {
    const r = choice<RetellReply>(
      a.retell_reply,
      ['confirmed', 'corrected', 'added_more', 'unclear'] as const,
      'unclear',
      RETELL_CONFIDENCE,
    );
    if (r.lowConfidence)
      notes.push({ goalId: 'retell_reply', reason: 'unsure how they answered, read as unclear', attempted: -1 });
    retellReply = r.value;
  }

  const found: Thread[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (!k.startsWith('thread_') || v.type !== 'noul') continue;
    if (v.noul < threadStrengthFloor) continue;
    const idx = Number(k.slice('thread_'.length));
    const text = byIdx.get(idx);
    if (!text) continue;
    const s = a[`tstrength_${idx}`];
    const level = s?.type === 'score' ? (s.legend[String(Math.round(s.score))] ?? 'medium') : 'medium';
    found.push({
      id: `msg_${idx}`,
      summary: text.slice(0, 160),
      opened_turn: turnNow,
      strength: level === 'high' || level === 'low' ? level : 'medium',
      explored: false,
      resolved: false,
    });
  }

  let wantsToSee: WantsToSee | null = null;
  if (phase === 'offer')
    wantsToSee = choice<WantsToSee>(
      a.wants_to_see,
      ['yes', 'not_yet', 'no', 'unclear'] as const,
      'unclear',
      RETELL_CONFIDENCE,
    ).value;
  let styleChoice: string | null = null;
  if (phase === 'style') {
    const c = a.style_choice;
    styleChoice = c?.type === 'choice' && c.confidence >= RETELL_CONFIDENCE ? c.choice : 'unsure';
  }

  return {
    next: {
      session_id: prev.session_id,
      turn: turnNow,
      goals,
      threads: reconcileThreads(prev.threads, found, turnNow),
      rapport,
      closing_note: closing.value,
      signals: {
        finished_telling: finished ?? prev.signals.finished_telling,
        retell_reply: retellReply,
        wants_to_see: wantsToSee,
        style_choice: styleChoice,
      },
      last_move: prev.last_move,
    },
    notes,
  };
}
