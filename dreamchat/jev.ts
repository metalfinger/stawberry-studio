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
import { randomUUID } from 'node:crypto';
import type {
  ClosingNote,
  GoalDef,
  GoalsFile,
  GoalState,
  Move,
  Phase,
  ProfileReply,
  SketchReaction,
  Rapport,
  RetellReply,
  State,
  Thread,
  WantsToSee,
} from './lib';
import { LISTENING, reconcileThreads } from './lib';
import { recordJev } from './jevlog';

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
  /** The model that answered, as Jev names it ("jev-1.13.0" for "jev-latest"). */
  model?: string;
  /** This call's own id, one per call; and Jev's id for it, where its answer gives one (`x-request-id`). */
  callId?: string;
  requestId?: string | null;
};

export type JevFn = (state: string, questions: Record<string, Question>) => Promise<JevCall>;

export const callJev: JevFn = async (state, questions) => {
  const call = await askJev(state, questions);
  // Every live call is logged with its tokens and time, in the conversation it is part of.
  recordJev({
    kind: 'call',
    questions: Object.keys(questions),
    inputTokens: call.usage?.input_tokens ?? null,
    outputTokens: call.usage?.output_tokens ?? null,
    stateChars: state.length,
    ms: call.ms,
    error: call.error,
    callId: call.callId,
    requestId: call.requestId ?? null,
  });
  return call;
};

/**
 * Jev asked by one model by name, for the evals that must give the same answers from one run to the
 * next (evals/prompt-cases.ts): "jev-latest" moves when Jev is updated. Not logged to a conversation.
 */
export const jevWithModel =
  (model: string): JevFn =>
  (state, questions) =>
    askJev(state, questions, model);

async function askJev(state: string, questions: Record<string, Question>, model = MODEL): Promise<JevCall> {
  const key = apiKey();
  const t0 = Date.now();
  const callId = randomUUID();
  let requestId: string | null = null;
  if (key === null)
    return { questions, state, answers: null, error: 'no JEV_API_KEY', ms: 0, usage: null, callId, requestId: null };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model, questions }),
    });
    const ms = Date.now() - t0;
    requestId = res.headers.get('x-request-id') ?? res.headers.get('request-id') ?? null;
    if (!res.ok)
      return {
        questions,
        state,
        answers: null,
        error: `${res.status} ${await res.text()}`,
        ms,
        usage: null,
        callId,
        requestId,
      };
    const body = (await res.json()) as { answers: Record<string, Answer>; usage: JevCall['usage']; model?: string };
    return {
      questions,
      state,
      answers: body.answers,
      error: null,
      ms,
      usage: body.usage,
      model: body.model,
      callId,
      requestId,
    };
  } catch (e) {
    // An answer that came but could not be read keeps Jev's id for it, where it gave one.
    return { questions, state, answers: null, error: String(e), ms: Date.now() - t0, usage: null, callId, requestId };
  }
}

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

/**
 * One pair of judgments per picture on show, so an answer about several at once reads right: "the
 * window one is exactly it, and the others look right too" once approved only the picture it named
 * first, because a single "which one" could hold only one answer. Measured on evals/verdicts.json.
 */
export function verdictQuestions(shown: { id: string; name: string }[], latest: string): Record<string, Question> {
  const q: Record<string, Question> = {};
  // The dreamer's own picture is "you" to the person; to Jev, "the picture of you" is ambiguous.
  const called = (name: string) => (name === 'you' ? 'the person themselves' : name);
  q.sketch_reaction = {
    type: 'choice',
    instructions: `The person was shown sketches from their dream (${shown.map((x) => x.name).join(', ')}) and asked if they look the way they remember. How do they answer in this message: "${latest.slice(0, 240)}"?`,
    criteria: {
      // "go ahead please", said of the sketches on show, was read as no answer and they were asked
      // again (24 Sep).
      looks_right: 'it looks right, or close enough, or they like it, or they tell you to go ahead with it',
      not_right: 'something about it is wrong or different from their dream, and they say what',
      no_reaction: "they didn't say anything about the sketches",
    },
  };
  for (const x of shown) {
    q[`ok_${x.id}`] = {
      type: 'noul',
      instructions: `In this message, does the person say the picture of ${x.name} looks right, either by name, or by saying all of them, or the others, look right, or by telling you to go ahead with them: "${latest.slice(0, 240)}"?`,
    };
    // Asked with every picture on show, and of this one in particular: asked of one picture alone,
    // a complaint about the convertible marked the aunt, the young woman, the couple, the house and
    // the dreamer wrong too, each to be drawn again (evals/verdicts.json: 39 redrawn for nothing).
    q[`bad_${x.id}`] = {
      type: 'noul',
      instructions: `The person was shown ${shown.length > 1 ? `these pictures from their dream: ${shown.map((y) => called(y.name)).join('; ')}` : `a picture from their dream: ${called(x.name)}`}. In this message: "${latest.slice(0, 240)}", do they say that the picture of ${called(x.name)} in particular is wrong or should change?`,
      criteria: {
        true: `their complaint is about this picture: by its name, by what it shows${shown.length > 1 ? '' : ', or simply because it is the one on show'}`,
        false:
          'they say it looks right, say nothing against it, or their complaint is about another of the pictures, or about something not shown',
      },
    };
  }
  return q;
}

/**
 * S8's wording of how they answered a profile. Worded as before, an answer that adds a
 * detail and leaves the rest to us ("the uniform was dark trousers, a white shirt and a striped tie; go
 * with your guess on his face") was read as leaving it to us at 0.8 to 1.0, and the detail was never
 * written into the profile: 19 to 22 changes read as settled in each after-run, where the listening test
 * asked of each answer whether it changes or adds anything (review, 27 Sep). A detail wins over leaving
 * the rest to us, and over "that's right". Only the profile's: read again over the stored answers of the
 * second after-run, a profile's changes read as settled fell from 26 to 6 of 187 answers, and what now reads
 * as a change without one only restates the profile, which the revision keeps as it is; the retelling's
 * answers so worded read a plain "yeah, that's right" as a correction (0.84), and keep today's words.
 * A detail of any kind, not only of how it looks: "just that he's my younger brother ... go with your guess"
 * read 0.91 as leaving it to us, and "all i remember is the platform with the one bench and the clock on
 * the pole ... go with whatever you think", told of a station whose profile asked what is in it, 0.59
 * (fresh simulations, 27 Sep).
 */
export const PROFILE_REPLY_S8: Record<string, string> = {
  confirmed: "it's right as described, and they add or change nothing",
  changes:
    'they give any detail of it that was different or missing (who or what it is, how it looks, what it wears, what is in it or what it is made of), even one, even while saying the rest is right or leaving the rest to the listener',
  you_choose: "they don't mind or don't remember, and give no detail of it that was different or missing",
  unclear: "they didn't answer that",
};

export function bookkeeperQuestions(
  cfg: GoalsFile,
  transcript: Exchange[],
  prev: State | undefined,
  phase: Phase,
  styles: { id: string; name: string }[] = [],
  profileName?: string,
  /** Sketches they have been shown and not yet answered about, by id and name. */
  shown: { id: string; name: string }[] = [],
  /** S8's wording of the answer to a profile (DREAMCHAT_LISTEN=on). */
  listen = false,
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
      instructions: `About the dream the person is telling: "${g.label}" (looking for: ${g.probe_hint}).${g.told_when ? ` ${g.told_when}` : ''} Has the person told this?`,
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
    // A person whose memory is spent answers "I don't remember" to each thing left: four in a row
    // about the balloons before the dream was told back (simulated run meads-house, 24 Sep).
    q.recall_spent = {
      type: 'noul',
      instructions: `Read only the person's most recent message: "${latest.slice(0, 240)}". Does it mainly say they don't remember, can't recall, or have nothing more to say about what they were asked?`,
      criteria: {
        true: "it is mostly 'I don't remember', 'no idea', or 'that's all there was' about what was asked",
        false: 'it tells something, even a little, or answers the question',
      },
    };
    // A dream that is a place rather than a plot never "reaches its end": the glass world was
    // asked about the colour of its glow and whether it pulsed until the listening limit.
    q.adds_story = {
      type: 'noul',
      instructions: `Read only the person's most recent message: "${latest.slice(0, 240)}". Does it add something new to what happened in the dream (something that happens next, a new place, a new person or thing), rather than more about what they had already told?`,
      criteria: {
        true: 'a new happening, place, person or thing enters the dream',
        false: "only more about what was already told, an answer about a detail, or that they don't remember",
      },
    };
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
    // Asked beside it, not as a fifth answer: "that's right, but after the kitchen there was more"
    // both confirms the retelling and says the dream went on (night bus, 25 Sep).
    q.goes_on = {
      type: 'noul',
      instructions: `The listener has just told the person's dream back to them. In this message: "${latest.slice(0, 240)}", does the person say the dream went on past where the telling back stopped: that something else happened after that, or that there is more still to tell?`,
      criteria: {
        true: "the dream carried on after the part told back: they tell what happened next, or say there's more after it",
        false: 'they confirm it, correct it, or add a detail to a part already told, and nothing comes after it',
      },
    };
    // S8: beside it too, whether they put anything right or add to it. An answer that says it is right and
    // then corrects it is both, and one choice holds one: "yep that's it, you got it all right. only small
    // thing is the tractor stops at the edge of the field before i put the boat down" read 0.76 right and
    // 0.16-0.25 a change, on either side of the bar each time it was asked (the fresh simulation's
    // answers, 27 Sep), and a change read as right is never drafted. Asked of the answer to the whole
    // telling back only: told back one corrected part, they say it again in their own words and carry the
    // story on past it ("yep that's it! snow first, then Dele comes over ... then the glowing snowball and I
    // woke up"), which read as adding (0.54-0.91) in all 5 such answers the choice read as right, a turn
    // telling back each time; the 2 after it that did put something right, the choice read so itself.
    if (listen && prev?.last_move !== 'take_correction')
      q.retell_adds = {
        type: 'noul',
        instructions: `The listener has just told the person's dream back to them. In this message: "${latest.slice(0, 240)}", besides saying whether it was right, does the person put any part of it right, or add a detail it did not have?`,
        criteria: {
          true: 'they correct something or add something, even one small detail, even while saying the rest is right',
          false: 'they only say it is right or near enough, with nothing put right and nothing added',
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

  if (phase === 'build' && profileName) {
    q.profile_reply = {
      type: 'choice',
      instructions: `The listener described how they picture ${profileName} and asked whether anything is different. How does the person answer in this message: "${latest.slice(0, 240)}"?`,
      criteria: listen
        ? PROFILE_REPLY_S8
        : {
            confirmed: "it's right, or near enough, with nothing to change",
            changes: 'they changed, corrected or added a detail about it',
            you_choose: "they don't mind, don't remember, or leave it to the listener",
            unclear: "they didn't answer that",
          },
    };
  }

  if (shown.length) Object.assign(q, verdictQuestions(shown, latest));

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

// ── every reply against its move (S8) ───────────────────────────────────────

/** Everything the check of one reply reads. */
export type ReplyCheckInput = {
  move: Move;
  /** The brief's move line: what the reply was told to do. */
  moveLine: string;
  /** Every message the person has sent, the latest last. */
  said: string[];
  /** The reply as the person would read it, message by message. */
  messages: string[];
  /** explore_thread and circle_back: the message of theirs the move names. */
  thread?: string;
  /** probe_goal: what the goal asks about, in plain words, and an open question about it. */
  topic?: string;
  example?: string;
  /** choose_style: the ways of drawing it the reply must offer. */
  styles?: { id: string; name: string; line: string }[];
  /** retell: how many moments its closing list must hold. */
  moments?: number;
  /** A follow that picks the dream up again after it was told back. */
  resumed?: boolean;
  /** start, confirm_profile, profile_check: whose look the reply puts to them. */
  profile?: string;
};

/** The sentences of a reply that ask something: each one ending in a question mark. */
export function questionsIn(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => /\?["'”’)\]]*$/.test(x));
}

/** How many numbered lines a reply ends with, its closing question aside. */
export function closingListLength(text: string): number {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const item = /^\d{1,2}[.)]\s+\S/;
  while (lines.length && !item.test(lines.at(-1) ?? '') && (lines.at(-1) ?? '').includes('?')) lines.pop();
  let n = 0;
  for (let i = lines.length - 1; i >= 0 && item.test(lines[i]); i--) n++;
  return n;
}

const check = (instructions: string, yes: string, no: string): Question => ({
  type: 'noul',
  instructions,
  criteria: { true: yes, false: no },
});

/** What a listening move asks of its reply, as one yes-or-no question; yes is done. */
function listeningMoveQuestion(x: ReplyCheckInput): Question {
  switch (x.move.kind) {
    case 'follow':
      return x.resumed
        ? check(
            'Does `reply` simply ask the person what happened next in their dream, without telling the dream back to them?',
            'it asks what happened next, and tells nothing back',
            'it tells the dream back, or asks about something else',
          )
        : check(
            'Does `reply` invite the person, openly, to tell what happened next in their dream, without guessing what it was?',
            'it asks what happened next or invites them to go on, with no guess of its own',
            'it asks about a detail of something already told, guesses what happened next, or asks nothing',
          );
    case 'open_ended':
      return check(
        'Does `reply` leave it to the person to go on however they like, without asking about a particular detail?',
        'it leaves them free to go on in their own way',
        'it asks about a particular detail, or closes the telling',
      );
    case 'explore_thread':
      return check(
        `Does \`reply\` ask the person about something they raised in this message of theirs: "${(x.thread ?? '').slice(0, 400)}"?`,
        'its question is about something in that message',
        'its question is about something else, or it asks nothing',
      );
    case 'circle_back':
      return check(
        `Does \`reply\` come back to this, which the person said earlier, and ask about it: "${(x.thread ?? '').slice(0, 400)}"?`,
        'it returns to that and asks about it',
        'it asks about something else, or asks nothing',
      );
    case 'probe_goal':
      return check(
        `Does the question in \`reply\` ask the person about ${x.topic ?? 'what it was told to'}?`,
        'its question is about that',
        'its question is about something else, or it asks nothing',
      );
    default:
      return check(
        'Does `reply` react warmly to what the person said and leave at most one light, easy-to-ignore opening, without probing for a detail?',
        'it reacts warmly and asks at most a light, easy-to-ignore question',
        'it probes for a detail, or does not react to what they said',
      );
  }
}

/** What each failed question tells the reply's second try. */
function moveFailure(x: ReplyCheckInput): string {
  switch (x.move.kind) {
    case 'follow':
      return x.resumed
        ? 'it should only ask, simply, what happened next'
        : 'it should invite them to tell what happened next, openly, with no guess and no question about a detail';
    case 'open_ended':
      return 'it should leave them to go on in their own way, asking about no detail';
    case 'explore_thread':
      return `its question should be about something in what they just said: "${(x.thread ?? '').slice(0, 200)}"`;
    case 'circle_back':
      return `it should come back to what they said earlier, "${(x.thread ?? '').slice(0, 200)}", and ask about it`;
    case 'probe_goal':
      return `its question should be about ${x.topic ?? 'what the move names'}${x.example ? `, asked openly, such as "${x.example}"` : ''}`;
    case 'acknowledge':
      return 'it should react warmly and leave only a light opening, probing for nothing';
    default:
      if (x.profile) return `it should say how you picture ${x.profile}, and then ask them about it`;
      return `it should do what its move says: ${x.moveLine.slice(0, 400)}`;
  }
}

/**
 * The questions one reply is checked on (S8): whether it did its move; on a listening reply, whether its
 * question puts an answer forward, offers a choice, or states a detail of the dream nobody gave; on the
 * style offer, each way of drawing it. Yes to `move` and `offers_*` is done, yes to the rest is a fault.
 */
export function replyCheck(x: ReplyCheckInput): { state: string; questions: Record<string, Question> } {
  const text = x.messages.join('\n');
  const asks = questionsIn(text);
  const listening = LISTENING.has(x.move.kind);
  const state = JSON.stringify(
    {
      person_said: listening ? x.said : x.said.slice(-1),
      reply: text,
      questions_in_reply: asks,
    },
    null,
    1,
  );
  const q: Record<string, Question> = {};
  q.move = listening
    ? listeningMoveQuestion(x)
    : x.profile
      ? check(
          `Does \`reply\` say how the listener pictures ${x.profile}, and then ask the person about it: what they remember of it, whether anything is different, or whether they would leave it to the listener?`,
          'it says how it pictures them and asks about it',
          'it does not say how it pictures them, or asks nothing about it',
        )
      : check(
          `The listener was told to do this in its reply: "${x.moveLine.slice(0, 1200)}". Does \`reply\` do it?`,
          'it does what it was told, leaving nothing it was told to do out',
          'it leaves out part of what it was told, does something else, or asks what it was told not to',
        );
  if (listening && x.said.length) {
    q.states_unsaid = check(
      'Does `reply` say that something was in the dream, or happened in it, or looked or felt some way, that nothing in `person_said` says? Its own reactions and impressions ("that sounds calm", "how strange") and its questions do not count.',
      'it states a fact of the dream the person never gave',
      'every fact of the dream it states, the person gave; it only reacts, reflects or asks',
    );
    if (asks.length) {
      q.leads = check(
        'Does the question in `questions_in_reply` put forward an answer of its own for the person to agree or disagree with: a thing, place, event, feeling, look, or something they did, that they have not said in `person_said`?',
        'it names a detail of its own for them to confirm, such as "did you go in?" when they never said they went in, or "was it cold?" when they never said how it felt',
        'it asks openly ("what happened next?", "how did it feel?"), or names only what the person already said',
      );
      q.either_or = check(
        'Does the question in `questions_in_reply` offer the person a choice between two or more specific answers ("was it this or that?"), rather than leaving the answer open?',
        'it names two or more possibilities for them to pick from',
        'it asks openly, or names only one possibility, or ends on an open "or something else"',
      );
    }
  }
  for (const o of x.styles ?? [])
    q[`offers_${o.id}`] = check(
      `Does \`reply\` offer this way the dream could be drawn, in these words or its own: "${o.name}" (${o.line})?`,
      'the reply offers that way of drawing it',
      'the reply does not offer it',
    );
  return { state, questions: q };
}

/**
 * The bar a leading question is sent back at: lower than the others, since a lead the check lets
 * through is a guess the picture may be drawn from, and one it sends back costs a second try. In the
 * third after-run (27 Sep) the listening test read three replies as leading; by hand two were ("did you
 * go through it?", "did you go toward it?"), and they had read 0.34 and 0.35 here. At 0.3, seven of
 * 512 more are sent back, those two among them.
 */
export const LEADS_BAR = 0.3;

/**
 * What a reply failed, in words its second try can act on: from Jev's answers to `replyCheck`, and
 * from counting (one question on a listening reply; a retelling's closing list holding every moment).
 * A question Jev left unanswered fails nothing: the judge being down never holds a reply.
 */
export function replyFailures(x: ReplyCheckInput, answers: Record<string, Answer> | null): string[] {
  const text = x.messages.join('\n');
  const p = (k: string) => {
    const a = answers?.[k];
    return a?.type === 'noul' ? a.noul : null;
  };
  const yes = (k: string) => (p(k) ?? 0) >= 0.5;
  const no = (k: string) => p(k) !== null && (p(k) ?? 0) < 0.5;
  const out: string[] = [];
  if (no('move')) out.push(moveFailure(x));
  if (LISTENING.has(x.move.kind)) {
    const n = questionsIn(text).length;
    if (n > 1) out.push(`it asks ${n} questions: ask one, and let the rest wait`);
    if ((p('leads') ?? 0) >= LEADS_BAR)
      out.push('its question puts an answer of its own to them: ask openly, and leave the answer to them');
    if (yes('either_or')) out.push('its question offers them choices: ask one open question instead');
    if (yes('states_unsaid'))
      out.push(
        'it says something about the dream they never told you: say only what they said, and ask about the rest',
      );
  }
  const left = (x.styles ?? []).filter((o) => no(`offers_${o.id}`)).map((o) => o.name);
  if (left.length)
    out.push(`it leaves out ${left.length > 1 ? 'these ways' : 'this way'} of drawing it: ${left.join('; ')}`);
  if (x.move.kind === 'retell' && x.moments) {
    const n = closingListLength(text);
    if (n < x.moments)
      out.push(
        `it must end with the numbered list of all ${x.moments} moments, one to a line, before the question${n ? ` (it lists ${n})` : ''}`,
      );
  }
  return out;
}

/** The note that sends a reply back once, with what it failed named. */
export function retryNote(messages: string[], failures: string[]): string {
  return `<check>\nYour last reply to this brief was: ${JSON.stringify({ response: messages })}\nIt did not do what the brief asks: ${failures.join('; ')}.\nWrite the whole reply again, doing the move in the brief, and keep what it did right. Delete nothing they need: fix only what is named.\n</check>`;
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

/**
 * A choice read by what it leads to (S8, DREAMCHAT_LISTEN=on). The bar is for the decision, and labels
 * that lead to the same action are one decision: "confirmed 0.55, you_choose 0.45" settles a profile as
 * surely as "confirmed 1.0", yet the top label alone fell under the bar and was read as no answer (15 of
 * the 16 clear answers read as unclear, the listening test's before). So each action's labels are summed,
 * and the likeliest action is taken when it clears the bar; its likeliest label names it.
 * Limits, from the review of the after-runs (27 Sep):
 * - `prefer`: the action that loses nothing when taken wrongly (revising a profile keeps every field
 *   they did not touch; taking a correction tells the part back and checks it) is taken as soon as it has
 *   `RIVAL` or more. Summed past it, "a small brown terrier, short rough fur, no collar, go with your guess
 *   on the rest" read as "you choose" and was never revised (after2 e7cf), and additions to a retelling
 *   read as confirmed were never drafted. Read again by this rule, the stored readings of the three
 *   after-runs change 15 profile and 21 retelling answers, each to the change: 14 of the 15 profile ones
 *   tell something of its look ("it was thin, and it just watched me"), one only that they don't remember; of the retelling ones 14 add or correct something ("the only thing is the lights of the
 *   market were behind us") and 6 are a plain "yes, that's right" (Jev gave a change 0.28-0.37), which
 *   now costs a turn telling back.
 * - `joins`: a label that goes with another once that one has `RIVAL` or more ("you choose" beside a
 *   change is part of the change).
 * - otherwise, no action is taken while another has `RIVAL` or more: it is asked again.
 * The fallback's own group ("unclear", "not yet") is no rival: it only asks again.
 */
export const RIVAL = 0.25;
export function choiceByAction<T extends string>(
  a: Answer | undefined,
  actions: readonly (readonly T[])[],
  fallback: T,
  minConfidence: number,
  opts: { joins?: Partial<Record<T, T>>; prefer?: T } = {},
): { value: T; lowConfidence: boolean } {
  if (a?.type !== 'choice') return { value: fallback, lowConfidence: false };
  const labels = actions.flat() as string[];
  if (!labels.includes(a.choice)) return { value: fallback, lowConfidence: false };
  const joins: Partial<Record<T, T>> = opts.joins ?? {};
  const raw = (l: T) => a.probabilities?.[l] ?? (l === a.choice ? a.confidence : 0);
  const joined = (l: T) => {
    const to = joins[l];
    return to !== undefined && raw(to) >= RIVAL;
  };
  const p = (l: T) =>
    joined(l)
      ? 0
      : raw(l) + labels.filter((x) => joins[x as T] === l && joined(x as T)).reduce((n, x) => n + raw(x as T), 0);
  const groups = actions
    .filter((g) => !g.includes(fallback))
    .map((g) => ({ labels: g, sum: g.reduce((n, l) => n + p(l), 0), top: [...g].sort((x, y) => p(y) - p(x))[0] }))
    .sort((x, y) => y.sum - x.sum);
  const safe = opts.prefer === undefined ? undefined : groups.find((g) => g.labels.includes(opts.prefer as T));
  if (safe && safe.sum >= RIVAL) return { value: safe.top, lowConfidence: false };
  const [best, rival] = groups;
  if (best && best.sum >= minConfidence && !(rival && rival.sum >= RIVAL))
    return { value: best.top, lowConfidence: false };
  return { value: fallback, lowConfidence: true };
}

/** What each reading leads to: its labels, grouped by the action the conversation takes on them. */
export const ACTIONS = {
  retell_reply: [['confirmed'], ['corrected', 'added_more'], ['unclear']],
  profile_reply: [['confirmed', 'you_choose'], ['changes'], ['unclear']],
  wants_to_see: [['yes'], ['no'], ['not_yet', 'unclear']],
} as const;

/** How each reading is summed and which action is safe to take (see `choiceByAction`). */
export const READ_BY = {
  retell_reply: { prefer: 'corrected' },
  profile_reply: { joins: { you_choose: 'changes' }, prefer: 'changes' },
  wants_to_see: {},
} as const;

/** Jev's P(they put something right or add to it) at or above this makes a retelling's answer a change (S8). */
export const ADDS_BAR = 0.5;

/**
 * A retelling's answer with what it puts right or adds, read on its own (`retell_adds`, S8): read as right,
 * or as no answer, and yet correcting or adding something, it is a change, and the changed part is told
 * back and checked. Nothing read, the choice stands.
 */
export function retellWithAdds(reply: RetellReply, adds: number | null | undefined): RetellReply {
  if ((reply === 'confirmed' || reply === 'unclear') && (adds ?? 0) >= ADDS_BAR) return 'added_more';
  return reply;
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
  /** S8's readings (DREAMCHAT_LISTEN=on): choices read by the action they lead to. */
  listen = false,
): { next: State; notes: JevReadNote[] } {
  const pickBy = <T extends string>(
    a: Answer | undefined,
    allowed: readonly T[],
    actions: readonly (readonly T[])[],
    fallback: T,
    bar: number,
    opts: { joins?: Partial<Record<T, T>>; prefer?: T } = {},
  ) => (listen ? choiceByAction(a, actions, fallback, bar, opts) : choice(a, allowed, fallback, bar));
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
    const r = pickBy<RetellReply>(
      a.retell_reply,
      ['confirmed', 'corrected', 'added_more', 'unclear'] as const,
      ACTIONS.retell_reply,
      'unclear',
      RETELL_CONFIDENCE,
      READ_BY.retell_reply,
    );
    if (r.lowConfidence)
      notes.push({ goalId: 'retell_reply', reason: 'unsure how they answered, read as unclear', attempted: -1 });
    retellReply = r.value;
    if (listen) {
      const withAdds = retellWithAdds(retellReply, noul(a.retell_adds));
      if (withAdds !== retellReply)
        notes.push({
          goalId: 'retell_reply',
          reason: `read ${retellReply}, but it puts something right or adds to it (${noul(a.retell_adds)?.toFixed(2)}): a change`,
          attempted: noul(a.retell_adds) ?? -1,
        });
      retellReply = withAdds;
    }
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
    wantsToSee = pickBy<WantsToSee>(
      a.wants_to_see,
      ['yes', 'not_yet', 'no', 'unclear'] as const,
      ACTIONS.wants_to_see,
      'unclear',
      RETELL_CONFIDENCE,
      READ_BY.wants_to_see,
    ).value;
  const reaction = choice<SketchReaction>(
    a.sketch_reaction,
    ['looks_right', 'not_right', 'no_reaction'] as const,
    'no_reaction',
    RETELL_CONFIDENCE,
  ).value;
  const verdicts: Record<string, 'right' | 'wrong'> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v.type !== 'noul' || !(k.startsWith('ok_') || k.startsWith('bad_'))) continue;
    const id = k.slice(k.indexOf('_') + 1);
    const ok = noul(a[`ok_${id}`]) ?? 0;
    const bad = noul(a[`bad_${id}`]) ?? 0;
    if (bad >= 0.6) verdicts[id] = 'wrong';
    else if (ok >= 0.6) verdicts[id] = 'right';
  }
  let profileReply: ProfileReply | null = null;
  if (a.profile_reply)
    profileReply = pickBy<ProfileReply>(
      a.profile_reply,
      ['confirmed', 'changes', 'you_choose', 'unclear'] as const,
      ACTIONS.profile_reply,
      'unclear',
      RETELL_CONFIDENCE,
      READ_BY.profile_reply,
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
        recall_spent: phase === 'listen' ? noul(a.recall_spent) : null,
        adds_story: phase === 'listen' ? noul(a.adds_story) : null,
        retell_reply: retellReply,
        goes_on: phase === 'retell' ? noul(a.goes_on) : null,
        wants_to_see: wantsToSee,
        style_choice: styleChoice,
        profile_reply: profileReply,
        sketch_reaction: a.sketch_reaction ? reaction : null,
        sketch_verdicts: a.sketch_reaction ? verdicts : null,
      },
      last_move: prev.last_move,
    },
    notes,
  };
}
