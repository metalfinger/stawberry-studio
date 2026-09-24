// Pure logic for the dream chat: state, move selection and the brief. No I/O and no model
// calls, so every decision the conversation makes can be tested without a network.
//
// Copied from vibechk experiments/two-call-form/lib.ts (adcbaccdd) and extended for dreams:
// - phases: listen, then retell, then understood;
// - goals the person simply doesn't remember;
// - a move that follows a telling instead of interrupting it.
// The lab's comments are kept where the rule they explain was kept. Each one cites the lab
// session that measured it.

export type GoalDef = {
  id: string;
  label: string;
  probe_hint: string;
  /** Tracked when volunteered, never asked for, and never waited on. */
  optional?: boolean;
};

export type GoalsFile = {
  form_id: string;
  persona: { name: string; system: string };
  confidence_threshold: number;
  goals: GoalDef[];
};

// A third outcome, because two were not enough. On the trip form the
// respondent's flight and hotel were booked by the host institution, so there
// was no decision order and no comparison to describe. Those goals were not
// unanswered, they were INAPPLICABLE, and with only answered-or-open the policy
// kept asking until the ask cap stopped it (session jev-919-140109).
//
// A dream adds a fourth: `unknown`. Not-applicable is for things that never happened to the
// person. Unknown is for things that did happen in the dream and are gone. "I don't
// remember what she looked like" settles the goal, because asking again only makes people
// invent an answer.
export type GoalState = { confidence: number; evidence: string; not_applicable?: boolean; unknown?: boolean };

export type Thread = {
  id: string;
  summary: string;
  opened_turn: number;
  strength: 'high' | 'medium' | 'low';
  explored: boolean;
  resolved: boolean;
};

export type Rapport = {
  verbosity: 'chatty' | 'neutral' | 'clipped';
  volunteers_detail: boolean;
  warmth: 'high' | 'neutral' | 'low';
  wants_out: 'no' | 'soft' | 'hard';
};

// How the conversation should be ended when it is ended. Judged from what has
// actually happened rather than assumed: session jev-919-125936 held both a
// genuinely bad experience (the venue) and a genuinely great one (meeting
// Rahman), and "thank them warmly" is the wrong note for either on its own.
export type ClosingNote = 'celebrate' | 'acknowledge_problem' | 'warm' | 'brisk';

export type RetellReply = 'confirmed' | 'corrected' | 'added_more' | 'unclear';
export type WantsToSee = 'yes' | 'not_yet' | 'no' | 'unclear';
export type ProfileReply = 'confirmed' | 'changes' | 'you_choose' | 'unclear';
export type SketchReaction = 'looks_right' | 'not_right' | 'no_reaction';

/** Jev's readings that move the conversation between parts, as opposed to goal coverage. */
export type Signals = {
  /** P(they have told the dream through to an end), read while listening. */
  finished_telling: number;
  /** P(their latest message mostly says they don't remember), read while listening. */
  recall_spent?: number | null;
  /** P(their latest message adds a new happening, place, person or thing), read while listening. */
  adds_story?: number | null;
  /** How they answered the retelling. Only read on the turn after one. */
  retell_reply: RetellReply | null;
  /** How they answered "would you like to see it?". Only read while that is open. */
  wants_to_see: WantsToSee | null;
  /** Which way of drawing it they chose: an option id, "own" (they described their own), or "unsure". */
  style_choice: string | null;
  /** How they answered a profile they were shown. Only read while one is open. */
  profile_reply?: ProfileReply | null;
  /** How they took the sketches they were shown, and which one they meant. */
  sketch_reaction?: SketchReaction | null;
  /** Per picture on show: said to look right, or said to be wrong. Absent: not mentioned. */
  sketch_verdicts?: Record<string, 'right' | 'wrong'> | null;
};

export type State = {
  session_id: string;
  turn: number;
  goals: Record<string, GoalState>;
  threads: Thread[];
  rapport: Rapport;
  closing_note?: ClosingNote;
  signals: Signals;
  last_move: string;
};

/**
 * Where the conversation is. A session fact rather than a state fact: the lab found the
 * turn counter and the last move must come from session memory, not from the judge's
 * reading, or moves repeat.
 * - listen: they tell the dream and nothing is drawn.
 * - retell: the dream has been told back, and any correction is being settled.
 * - offer: they confirmed it; we've asked whether they'd like to see it.
 * - style: they said yes; we've offered ways it could be drawn.
 * - build: they chose a way; each profile is confirmed in turn, and each confirmed one is sketched.
 * - review: every sketch has started; they see each as it lands and say if it looks right.
 * - frames: every sketch is settled; the moments are being drawn from them.
 * - done: every moment is drawn and settled.
 * - ready: they chose a way, but there is nothing to sketch (no engine, or nothing to draw).
 * - kept: they'd rather not see it drawn; the dream is kept as told.
 * - ended: they left.
 */
export type Phase =
  'listen' | 'retell' | 'offer' | 'style' | 'build' | 'review' | 'frames' | 'done' | 'ready' | 'kept' | 'ended';

/** Phases where the conversation is over for this step. */
export const CLOSED: readonly Phase[] = ['done', 'ready', 'kept', 'ended'];

export type Move =
  | { kind: 'open_ended' }
  | { kind: 'follow' }
  | { kind: 'explore_thread'; threadId: string }
  | { kind: 'circle_back'; threadId: string }
  | { kind: 'probe_goal'; goalId: string }
  | { kind: 'acknowledge' }
  | { kind: 'retell' }
  | { kind: 'retell_check' }
  | { kind: 'take_correction' }
  | { kind: 'offer_visualize' }
  | { kind: 'offer_later' }
  | { kind: 'choose_style' }
  | { kind: 'style_help' }
  | { kind: 'start'; styleId: string }
  | { kind: 'confirm_profile'; itemId: string }
  | { kind: 'profile_check'; itemId: string }
  | { kind: 'build_done' }
  | { kind: 'while_drawing' }
  | { kind: 'ask_which' }
  | { kind: 'sheets_done' }
  | { kind: 'frames_drawing' }
  | { kind: 'all_done' }
  | { kind: 'keep' }
  | { kind: 'wrap' };

export function initialState(sessionId: string, cfg: GoalsFile): State {
  const goals: Record<string, GoalState> = {};
  for (const g of cfg.goals) goals[g.id] = { confidence: 0, evidence: '' };
  return {
    session_id: sessionId,
    turn: 1,
    goals,
    threads: [],
    rapport: { verbosity: 'neutral', volunteers_detail: false, warmth: 'neutral', wants_out: 'no' },
    signals: { finished_telling: 0, retell_reply: null, wants_to_see: null, style_choice: null },
    last_move: '',
  };
}

const STRENGTH_RANK = { high: 0, medium: 1, low: 2 } as const;

// Nothing upstream enforces the thread shape. The lab saw a model return `topic` instead of
// `id`/`summary`, and the brief then rendered "explore_thread → undefined". So this
// normalizes known aliases, defaults the flags, and drops anything unidentifiable. Shape
// enforcement lives HERE, not at the provider.
function normalizeThread(raw: unknown, turn: number): Thread | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<Thread> & { topic?: string };
  const label = t.id ?? t.topic;
  if (typeof label !== 'string' || label.trim() === '') return null;
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const strength = t.strength === 'high' || t.strength === 'low' ? t.strength : 'medium';
  return {
    id,
    summary: typeof t.summary === 'string' && t.summary ? t.summary : label,
    opened_turn: typeof t.opened_turn === 'number' ? t.opened_turn : turn,
    strength,
    explored: t.explored === true,
    resolved: t.resolved === true,
  };
}

export function reconcileThreads(prev: Thread[], patch: Thread[], turn: number): Thread[] {
  const merged = new Map(prev.map((t) => [t.id, t]));
  for (const rawT of patch) {
    const t = normalizeThread(rawT, turn);
    if (t === null) continue;
    const existing = merged.get(t.id);
    merged.set(t.id, { ...existing, ...t, opened_turn: existing?.opened_turn ?? t.opened_turn });
  }
  return [...merged.values()]
    .filter((t) => !t.resolved)
    .filter((t) => !(t.strength === 'low' && turn - t.opened_turn > 3))
    .filter((t) => !(t.strength === 'medium' && turn - t.opened_turn > 6))
    .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] || b.opened_turn - a.opened_turn)
    .slice(0, 3); // hard cap — beyond 3 it feels scattered
}

// ── Goal status ──────────────────────────────────────────────────────────────

export type GoalStatus = 'covered' | 'unknown' | 'not_applicable' | 'open';

export function goalStatus(g: GoalState | undefined, threshold: number): GoalStatus {
  if (!g) return 'open';
  if (g.confidence >= threshold) return 'covered';
  if (g.unknown) return 'unknown';
  if (g.not_applicable) return 'not_applicable';
  return 'open';
}

// ── Move selection — plain code, no model ───────────────────────────────────

// How many times one goal may be PUT to the respondent before the policy drops
// it, however open it still reads. Without it the next-open-goal rule is a loop:
// it always picks the same goal, so a goal the respondent will not answer
// properly is asked forever. Measured in session jev-919-121325: "how was the
// venue?" was put to them on turns 1, 6, 7 and 8, climbing 0.31 to 0.64 and
// never reaching the 0.7 threshold, while the judge was correct every time. The
// judge was not the problem. Nothing was counting.
export const MAX_ASKS_PER_GOAL = 2;

/** Jev's P(finished telling) at or above this counts as told to the end. */
export const FINISHED_BAR = 0.6;

/** After this many of their messages, the dream is told back with whatever is known. */
export const LISTEN_TURN_LIMIT = 18;

/**
 * Consecutive turns spent following the telling (follow, or a raised detail) before the
 * gaps get asked about. With no cap, a dreamer who answers every reflection with one more
 * detail keeps the conversation on tangents: 16 of 18 turns in one simulated run (glass
 * window, 23 Sep), which then ran out of listening turns with the key moment never asked.
 */
export const MAX_FOLLOW_STREAK = 3;
/** "I don't remember" this many times in a row, once the story is told to its end, is enough. */
export const FORGOT_STREAK = 2;
/** This many messages in a row that add nothing new to what happened: the telling has run dry. */
export const DRY_STREAK = 3;

/** Times "would you like to see it?" is put before a hesitation is taken as no, for now. */
export const MAX_OFFERS = 2;

/** Times the style is asked about before the one closest to how the dream looked is chosen. */
export const MAX_STYLE_ASKS = 2;

/** Rounds of telling back (the retelling plus each correction) before a change is simply taken as it stands. */
export const MAX_RETELLS = 3;

export type MoveContext = {
  phase: Phase;
  askCounts: Record<string, number>;
  /** How many messages they have sent so far. */
  listenTurns: number;
  /** How many times the dream, or a corrected part of it, has been told back. */
  retells: number;
  /** How many turns in a row, up to the last one, followed the telling rather than asking. */
  followStreak: number;
  /** How many of their messages in a row, this one included, said they don't remember. */
  forgotStreak?: number;
  /** How many of their messages in a row, this one included, added nothing new to what happened. */
  dryStreak?: number;
  /** How many times "would you like to see it?" has been put. */
  offers?: number;
  /** How many times the style has been asked about. */
  styleAsks?: number;
  /** The style options on offer, once the producer has written them. */
  styleIds?: string[];
  /** While building: the profile being confirmed, and the one after it. */
  build?: { current: string | null; next: string | null; checks: number };
  /** While reviewing: every sketch settled, or a reaction whose sketch isn't clear. */
  review?: { settled: boolean; whichUnclear: boolean };
  /** While drawing the moments: every frame settled, or a reaction whose frame isn't clear. */
  frames?: { settled: boolean; whichUnclear: boolean };
  maxAsksPerGoal?: number;
};

/** The goals still worth asking about: open, required, and not yet asked twice. */
export function askableGoals(state: State, cfg: GoalsFile, askCounts: Record<string, number>, cap = MAX_ASKS_PER_GOAL) {
  return cfg.goals.filter(
    (g) =>
      !g.optional && goalStatus(state.goals[g.id], cfg.confidence_threshold) === 'open' && (askCounts[g.id] ?? 0) < cap,
  );
}

export function selectMove(state: State, cfg: GoalsFile, ctx: MoveContext): { move: Move; rule: string } {
  // 1. exit signals win over everything
  if (state.rapport.wants_out === 'hard') return { move: { kind: 'wrap' }, rule: '1: they are leaving' };

  if (ctx.phase === 'frames') {
    const f = ctx.frames ?? { settled: false, whichUnclear: false };
    if (f.whichUnclear)
      return { move: { kind: 'ask_which' }, rule: "F2: a reaction, but it isn't clear to which picture" };
    if (f.settled) return { move: { kind: 'all_done' }, rule: 'F3: every moment drawn and settled' };
    return { move: { kind: 'frames_drawing' }, rule: 'F1: the moments are on their way' };
  }
  if (ctx.phase === 'review') {
    const r = ctx.review ?? { settled: false, whichUnclear: false };
    if (r.whichUnclear)
      return { move: { kind: 'ask_which' }, rule: "V2: a reaction, but it isn't clear to which sketch" };
    if (r.settled) return { move: { kind: 'sheets_done' }, rule: 'V3: every sketch settled — on to the moments' };
    return { move: { kind: 'while_drawing' }, rule: 'V1: the sketches are on their way' };
  }

  if (ctx.phase === 'build') {
    const b = ctx.build ?? { current: null, next: null, checks: 0 };
    const reply = state.signals.profile_reply ?? 'unclear';
    if (reply === 'unclear' && b.current && b.checks < 1)
      return { move: { kind: 'profile_check', itemId: b.current }, rule: 'B2: no clear answer about the profile' };
    // Settled (confirmed, changed, left to us, or still unclear after asking again): code
    // starts its sketch, and the next profile is shown in the same turn.
    if (b.next) return { move: { kind: 'confirm_profile', itemId: b.next }, rule: `B1: profile ${reply} — next one` };
    return { move: { kind: 'build_done' }, rule: `B1: profile ${reply} — all profiles settled` };
  }

  if (ctx.phase === 'style') {
    const choice = state.signals.style_choice;
    const ids = ctx.styleIds ?? [];
    if (choice && (ids.includes(choice) || choice === 'own'))
      return { move: { kind: 'start', styleId: choice }, rule: 'S1: they chose how it looks' };
    const fallback = ids.includes('d') ? 'd' : (ids[0] ?? 'd');
    if ((ctx.styleAsks ?? 0) >= MAX_STYLE_ASKS)
      return {
        move: { kind: 'start', styleId: fallback },
        rule: 'S3: still unsure — the one closest to how it looked',
      };
    return { move: { kind: 'style_help' }, rule: 'S2: unsure how it should look' };
  }

  if (ctx.phase === 'offer') {
    const answer = state.signals.wants_to_see;
    if (answer === 'yes') return { move: { kind: 'choose_style' }, rule: 'O1: they want to see it' };
    if (answer === 'no') return { move: { kind: 'keep' }, rule: "O2: they'd rather not" };
    if ((ctx.offers ?? 0) >= MAX_OFFERS)
      return { move: { kind: 'keep' }, rule: 'O3: still not ready — keep it as told' };
    return { move: { kind: 'offer_later' }, rule: answer === 'not_yet' ? 'O3: not yet' : 'O3: no clear answer' };
  }

  if (ctx.phase === 'retell') {
    const reply = state.signals.retell_reply;
    if (reply === 'confirmed') return { move: { kind: 'offer_visualize' }, rule: 'R1: retelling confirmed' };
    if (reply === 'corrected' || reply === 'added_more') {
      if (ctx.retells >= MAX_RETELLS)
        return { move: { kind: 'offer_visualize' }, rule: 'R2: retelling amended, retell limit reached' };
      // Settled right here, still in the retelling: tell back just the changed part and
      // check it. Sending a correction back to listening made the host retell the whole
      // dream again, or sign off on its own, once the person said "that's it" (simulated
      // runs icehead and zikery, 23 Sep).
      return { move: { kind: 'take_correction' }, rule: `R2: retelling ${reply.replace('_', ' ')}` };
    }
    if (state.last_move !== 'retell_check')
      return { move: { kind: 'retell_check' }, rule: 'R3: no clear answer to the retelling' };
    return { move: { kind: 'offer_visualize' }, rule: 'R3: still no clear answer — take it as right' };
  }

  // Listening. Author order, not ascending confidence: working through a form's fields in
  // the order they were written is what a person would do (the lab measured confidence
  // order asking the least natural question third).
  const askable = askableGoals(state, cfg, ctx.askCounts, ctx.maxAsksPerGoal);
  // Told to its end, or run dry: a dream that is a place rather than a plot never ends as a story.
  const finished = state.signals.finished_telling >= FINISHED_BAR || (ctx.dryStreak ?? 0) >= DRY_STREAK;

  // 2. The story is understood: every required goal is settled or has had its two asks.
  // Tell it back once they have reached the end, or once they are winding down.
  if (askable.length === 0) {
    if (finished) return { move: { kind: 'retell' }, rule: '2: story understood and told to the end' };
    if (state.rapport.wants_out === 'soft' || state.rapport.verbosity === 'clipped')
      return { move: { kind: 'retell' }, rule: '2: story understood and they are winding down' };
  }

  // 2b. Their memory is spent: the story has reached its end and the last answers were "I don't
  // remember". Asking after every gap left only collects more of them.
  if (finished && (ctx.forgotStreak ?? 0) >= FORGOT_STREAK)
    return { move: { kind: 'retell' }, rule: "2: told all they remember" };

  // 3. Don't listen forever. Tell back what is known; the person fills the rest.
  if (ctx.listenTurns >= LISTEN_TURN_LIMIT) return { move: { kind: 'retell' }, rule: '3: listening limit reached' };

  const fresh = (t: Thread) => !t.explored && state.last_move !== `explore_thread:${t.id}`;

  // 4. They are still telling it. Follow, don't interview: the checklist waits until the
  // story has reached its end, however many goals are open. But not for ever in a row.
  const mayFollow = ctx.followStreak < MAX_FOLLOW_STREAK;
  if (!finished && state.rapport.verbosity !== 'clipped' && mayFollow) {
    const worth = state.threads.find((t) => t.strength !== 'low' && fresh(t));
    if (worth)
      return {
        move: { kind: 'explore_thread', threadId: worth.id },
        rule: '4: still telling — follow what they raised',
      };
    return { move: { kind: 'follow' }, rule: '4: still telling — let them go on' };
  }

  // 5. They are genuinely winding down — soften, don't dig. Gated on `wants_out`, NOT on
  // verbosity: backing off because an answer was SHORT created a death spiral in the lab
  // (chat-827), where acknowledging asked nothing and the next answer was shorter still.
  // Never twice in a row.
  if (state.rapport.wants_out === 'soft' && state.last_move !== 'acknowledge')
    return { move: { kind: 'acknowledge' }, rule: '5: winding down — soften' };

  // 6. A fresh thread they raised with energy outranks the checklist.
  const hot = mayFollow && state.threads.find((t) => t.strength === 'high' && fresh(t));
  if (hot) return { move: { kind: 'explore_thread', threadId: hot.id }, rule: '6: hot fresh thread' };

  // 7. A real gap in the story remains.
  if (askable.length) return { move: { kind: 'probe_goal', goalId: askable[0].id }, rule: '7: next gap in the story' };

  // 8. Something aged and unresolved — come back to it naturally.
  const aged = state.threads.find((t) => state.turn - t.opened_turn >= 4 && !t.resolved);
  if (aged) return { move: { kind: 'circle_back', threadId: aged.id }, rule: '8: aged thread' };

  // 9. Nothing to chase and they haven't finished: let them run.
  return { move: { kind: 'open_ended' }, rule: '9: nothing to chase — let them lead' };
}

/** What a move does to the phase. Code owns this, never the model. */
export function phaseAfter(phase: Phase, move: Move): Phase {
  switch (move.kind) {
    case 'retell':
    case 'retell_check':
    case 'take_correction':
      return 'retell';
    case 'offer_visualize':
    case 'offer_later':
      return 'offer';
    case 'choose_style':
    case 'style_help':
      return 'style';
    case 'start':
    case 'confirm_profile':
    case 'profile_check':
      return 'build';
    case 'build_done':
    case 'while_drawing':
      return 'review';
    case 'ask_which':
      return phase;
    case 'sheets_done':
    case 'frames_drawing':
      return 'frames';
    case 'all_done':
      return 'done';
    case 'keep':
      return 'kept';
    case 'wrap':
      return 'ended';
    case 'open_ended':
    case 'follow':
    case 'explore_thread':
    case 'circle_back':
    case 'probe_goal':
    case 'acknowledge':
      return phase;
    default:
      return unreachable(move);
  }
}

// ── Brief renderer — prose, never JSON ──────────────────────────────────────

/** Moves whose question is set by the move itself. */
const STRUCTURED = new Set<Move['kind']>([
  'retell',
  'retell_check',
  'take_correction',
  'offer_visualize',
  'offer_later',
  'choose_style',
  'style_help',
  'start',
  'confirm_profile',
  'profile_check',
  'build_done',
  'while_drawing',
  'ask_which',
  'sheets_done',
  'frames_drawing',
  'all_done',
  'keep',
  'wrap',
]);

const OPENING =
  'This is your FIRST message. They have not said anything yet. Greet them once, briefly, and invite them to tell you their dream, however it comes back to them. Nothing else: no questions about details, nothing about pictures.';

/** What the brief needs from the production, once the producer has written it. */
export type BriefExtras = {
  styles?: { id: string; name: string; line: string }[];
  /** The first thing that would be drawn, in plain words ("the young woman"). */
  firstSubject?: string;
  /** The profile to show with this move: its name, what they said, and what was guessed. */
  profile?: { name: string; kind: string; said: string[]; guessed: string[]; dreamer?: boolean; unknownLook?: boolean };
  /** The sketch just started this turn, by name. */
  sketching?: string;
  /** Sketches that have finished since they last heard, by name. */
  finished?: string[];
  /** Sketches they approved this turn, and ones being redrawn from their correction. */
  approved?: string[];
  redrawing?: string[];
  /** Sketches still waiting for a verdict, by name. */
  shown?: string[];
  /** The key moment's frame, when it has just landed: it is asked about by name. */
  keyReady?: string;
  /** How many moments there are in all. */
  frameCount?: number;
  /** How many are up on the right so far. */
  drawnCount?: number;
  /** Pieces that could not be drawn, by name. */
  failed?: string[];
  /** Pictures on show that later moments are drawn from, waiting for their verdict. */
  waitsOnThem?: string[];
  /** Sketches held back because how they look is not yet clear enough to draw. */
  held?: string[];
};

export function renderBrief(
  state: State,
  move: Move,
  cfg: GoalsFile,
  opts: { opening?: boolean; phase?: Phase; extras?: BriefExtras } = {},
): string {
  const t = cfg.confidence_threshold;
  const labels = (status: GoalStatus, required = false) =>
    cfg.goals
      .filter((g) => (!required || !g.optional) && goalStatus(state.goals[g.id], t) === status)
      .map((g) => g.label.toLowerCase());
  const heard = labels('covered');
  const forgotten = labels('unknown');
  const open = labels('open', true);
  const listening = (opts.phase ?? 'listen') === 'listen';

  const lines = [
    opts.opening && OPENING,
    !opts.opening && heard.length > 0 && `Already told you: ${heard.join(', ')}.`,
    forgotten.length > 0 && `They don't remember: ${forgotten.join(', ')}. Don't ask about these again.`,
    !opts.opening && listening && (open.length ? `Not heard yet: ${open.join(', ')}.` : 'You have the whole story.'),
    `Move: ${renderMove(move, state, cfg, opts.extras ?? {})}`,
    // A reply once added its own question to a move that already had one, and the one-ask repair
    // then kept the wrong question (live test, 23 Sep).
    STRUCTURED.has(move.kind) && 'Ask nothing except what this move says.',
  ].filter(Boolean);

  return `<brief>\n${lines.join('\n')}\n</brief>`;
}

/** How a profile is put to the person: what they said as fact, what was guessed as a guess. */
function profileLine(p: NonNullable<BriefExtras['profile']>): string {
  // They are seen in their own dream but never said what they look like: ask, gently.
  if (p.dreamer && p.unknownLook)
    return "say you'll draw them too, since they're in it, and ask gently how they'd like to be drawn: as they are (they can say a little about themselves), or however you imagine them. One question.";
  const said = p.said.length ? ` From what they told you: ${p.said.join('; ')}.` : '';
  const guessed = p.guessed.length
    ? ` You filled in (say plainly that these are your guesses): ${p.guessed.join('; ')}.`
    : '';
  return `describe how you picture ${p.name} on their own, briefly, in plain words: not the scene around them, not anyone or anything else, and not the rest of the dream.${said}${guessed} Then ask if anything's different, or if they'd leave it to you.`;
}

/**
 * How far the moments have got, when some are still to come. Told "that's the whole thing", Berry
 * once said the whole dream was drawn with six of its thirteen moments still waiting (24 Sep).
 */
function stillToCome(extras: BriefExtras): string {
  const all = extras.frameCount ?? 0;
  const drawn = extras.drawnCount ?? all;
  if (!all || drawn >= all) return '';
  return `${drawn} of the ${all} moments are on the right so far; the other ${all - drawn} are still to come. Never say the whole dream is drawn while any are.`;
}

function closingInstruction(note: ClosingNote | undefined): string {
  switch (note) {
    case 'celebrate':
      return 'Something genuinely good came out of this for them. Send them off on it, and let that be the last thing they read.';
    case 'acknowledge_problem':
      return 'Something about this was hard for them and they said so. Name it gently before you thank them.';
    case 'brisk':
      return 'They are done. Two short lines at most, thank them, no flourish.';
    default:
      return 'Thank them warmly, and mention something specific from their dream.';
  }
}

function threadSummary(state: State, id: string): string {
  return state.threads.find((t) => t.id === id)?.summary ?? id;
}

function goalOf(cfg: GoalsFile, id: string): GoalDef | undefined {
  return cfg.goals.find((g) => g.id === id);
}

function renderMove(move: Move, state: State, cfg: GoalsFile, extras: BriefExtras): string {
  const styles = extras.styles ?? [];
  const styleName = (id: string) => styles.find((o) => o.id === id)?.name ?? 'the way they described';
  switch (move.kind) {
    case 'open_ended':
      return 'open_ended. Nothing to chase. Let them lead.';
    case 'follow':
      return "follow. They're still telling the dream. React to what they just said, then invite what happened next. Don't ask about details yet.";
    case 'explore_thread':
      return `explore_thread → ${threadSummary(state, move.threadId)}. Be curious about it: ask one thing about it, in their words.`;
    case 'circle_back':
      return `circle_back → they mentioned "${threadSummary(state, move.threadId)}" earlier and it never got picked up. Return to it naturally.`;
    case 'probe_goal': {
      const g = goalOf(cfg, move.goalId);
      const want = g ? ` What we'd like to know: ${g.probe_hint}.` : '';
      return `probe_goal → ${g?.label.toLowerCase() ?? move.goalId}.${want} Ask it plainly, as curiosity, hung off something they said. If they don't remember, that's fine.`;
    }
    case 'acknowledge':
      return "acknowledge. They're winding down. React warmly to what they just said, then leave ONE light open door — easy to pick up, easy to ignore. Not a probe.";
    case 'retell':
      return "retell. You have their dream. Tell it back to them in a few plain sentences, in order and in their own words where you can: what happened, where, who was there, how it felt and how it looked. Add nothing they didn't say. Then ask whether you got it right or missed anything.";
    case 'retell_check':
      return "retell_check. It isn't clear whether you have it right. Ask them simply whether that's how it went, or if there's anything to change.";
    case 'take_correction':
      return "take_correction. They changed or added something. In a sentence or two, tell back just that part the way they put it, then check you have it right now. Don't retell the whole dream, and don't say goodbye.";
    case 'offer_visualize':
      return "offer_visualize. They've confirmed you have their dream. Ask them, simply and warmly, whether they'd like to see it drawn. One question. Don't explain how it works.";
    case 'offer_later':
      return "offer_later. They haven't said they want to see it yet. No pressure: say it can be drawn whenever they like, and ask lightly whether they'd like to now.";
    case 'choose_style':
      return styles.length
        ? `choose_style. They want to see it. Offer these ways it could be drawn, each in a few plain words, and ask which feels closest, or whether they'd describe their own: ${styles.map((o) => `${o.id}) ${o.name}: ${o.line}`).join('; ')}.`
        : "choose_style. They want to see it. Ask how they'd like it to look: which feels closest to the dream, in their own words.";
    case 'style_help':
      return styles.length
        ? `style_help. They're not sure how it should look. Suggest the one closest to how they described the dream, ${styleName(styles.some((o) => o.id === 'd') ? 'd' : styles[0].id)}, and ask if that feels right.`
        : "style_help. They're not sure how it should look. Suggest keeping it close to how the dream looked to them, and ask if that feels right.";
    case 'start':
      return extras.profile
        ? `start. They chose ${styleName(move.styleId)}. Say you'll start with ${extras.profile.name}, then ${profileLine(extras.profile)}`
        : `start. They chose ${styleName(move.styleId)}. Tell them warmly that you have what you need, and that the pictures will appear on the right as they're ready. Don't ask anything.`;
    case 'confirm_profile':
      return `confirm_profile. ${extras.sketching ? `First say, in a few words, that you're sketching ${extras.sketching} now and it'll appear on the right: only that, nothing else is being drawn yet. Then ` : ''}${extras.profile ? profileLine(extras.profile) : 'describe the next thing to draw, and ask if anything should change.'}`;
    case 'profile_check':
      return `profile_check. It isn't clear whether ${extras.profile?.name ?? 'that'} is right as you described. Ask simply whether you've got it, or whether anything's different.`;
    case 'build_done':
      return `build_done. ${extras.sketching ? `Say you're sketching ${extras.sketching} now. ` : ''}Tell them everything is being sketched and will appear on the right over the next minute or two. They can say if anything looks wrong once it's there. Keep it short; no question needed.`;
    case 'while_drawing': {
      const parts = [
        extras.approved?.length ? `Take in that they're happy with ${extras.approved.join(' and ')}.` : '',
        extras.redrawing?.length
          ? `Say you're redrawing ${extras.redrawing.join(' and ')} with their change; the new version will appear on the right.`
          : '',
        extras.finished?.length
          ? `${extras.finished.join(' and ')} ${extras.finished.length > 1 ? 'are' : 'is'} up on the right now: ask if it looks the way they remember.`
          : "The rest are still on their way; if they ask, say they'll appear on the right soon.",
        extras.held?.length
          ? `Before you draw ${extras.held.join(' and ')}, you need a little more about how ${extras.held.length > 1 ? 'they look' : 'it looks'}: ask them plainly, in one short question, or say you can picture it yourself if they'd rather.`
          : '',
      ];
      return `while_drawing. ${parts.filter(Boolean).join(' ')}`;
    }
    case 'frames_drawing': {
      const parts = [
        extras.approved?.length ? `Take in that they're happy with ${extras.approved.join(' and ')}.` : '',
        extras.redrawing?.length
          ? `Say you're redrawing ${extras.redrawing.join(' and ')} with their change; it will appear on the right.`
          : '',
        extras.keyReady
          ? `The moment they said they'd pause on is up on the right now (${extras.keyReady}). Ask if that's how they saw it.`
          : extras.finished?.length
            ? `More of the dream is up on the right (${extras.finished.join('; ')}). Ask if it looks the way they remember.`
            : "The rest of the moments are still being drawn; if they ask, say they'll appear on the right soon.",
        extras.waitsOnThem?.length
          ? `The next moments carry on from ${extras.waitsOnThem.join(' and ')}, so they're drawn once they say it looks right, or what to change. If you haven't said so already, say it once, simply, in passing.`
          : '',
        stillToCome(extras),
      ];
      return `frames_drawing. ${parts.filter(Boolean).join(' ')}`;
    }
    case 'all_done': {
      const failed = extras.failed ?? [];
      const drawn = (extras.frameCount ?? 0) - failed.length;
      const outcome = failed.length
        ? drawn > 0
          ? `${drawn} of the ${extras.frameCount} moments are drawn, on the right. ${failed.length} couldn't be drawn because of a problem on our side: say so plainly, and that you're sorry.`
          : "None of the moments could be drawn, because of a problem on our side. Say so plainly and that you're sorry; don't pretend anything was drawn."
        : `Their dream is drawn: ${extras.frameCount ?? 'all the'} pictures, on the right, in order.`;
      return `all_done. ${extras.approved?.length ? `Take in that they're happy with ${extras.approved.join(' and ')}. ` : ''}${outcome} Thank them warmly for sharing it${drawn > 0 ? ' and say they can look through it there' : ''}. Don't ask anything.`;
    }
    case 'ask_which':
      return `ask_which. They reacted to a sketch but it isn't clear which. Ask which one they mean${extras.shown?.length ? `: ${extras.shown.join(', ')}` : ''}.`;
    case 'sheets_done':
      return `sheets_done. ${extras.approved?.length ? `Take in that they're happy with ${extras.approved.join(' and ')}. ` : ''}Everyone and everything is sketched now. Tell them you'll draw the moments of the dream in order, each carrying on from the ones before it, and they'll appear on the right as they're ready. No question needed.`;
    case 'keep':
      return "keep. They'd rather not see it drawn, and that's fine. Thank them for sharing their dream, warmly and briefly. Don't ask anything.";
    case 'wrap':
      return `wrap. ${closingInstruction(state.closing_note)}${stillToCome(extras) ? ` ${stillToCome(extras)}` : ''} Do not ask another question.`;
    default:
      return unreachable(move);
  }
}

/** Following the telling, as opposed to asking about a gap or changing phase. */
export function isFollowing(move: Move): boolean {
  return move.kind === 'follow' || move.kind === 'explore_thread';
}

/**
 * The turns where the reply changes what the conversation is: telling the dream back, settling
 * a correction, closing. The reply model thinks before these. Without thinking it sometimes
 * carried out the PREVIOUS turn's move instead: asked "were you in it as yourself?" when told to
 * retell, so the dream was marked understood without ever being told back (simulated run glass
 * window, 23 Sep). Everywhere else it writes straight away, about 2s against 12s.
 */
export function needsThought(move: Move): boolean {
  return (
    move.kind === 'retell' ||
    move.kind === 'take_correction' ||
    move.kind === 'retell_check' ||
    move.kind === 'choose_style' ||
    move.kind === 'style_help' ||
    move.kind === 'offer_later' ||
    // Picture turns aren't waited on (the pictures are drawing anyway), and without thinking the
    // reply once ignored the move and didn't ask about the key moment (live test, 23 Sep).
    move.kind === 'while_drawing' ||
    move.kind === 'frames_drawing' ||
    move.kind === 'sheets_done' ||
    move.kind === 'ask_which' ||
    move.kind === 'start' ||
    // Without thinking, a profile turn once described the whole dream and said it was all being
    // drawn, and the person took it as the end (live run, 23 Sep).
    move.kind === 'confirm_profile' ||
    move.kind === 'profile_check' ||
    move.kind === 'build_done' ||
    move.kind === 'all_done' ||
    move.kind === 'keep' ||
    move.kind === 'wrap'
  );
}

export function moveKey(move: Move): string {
  switch (move.kind) {
    case 'explore_thread':
    case 'circle_back':
      return `${move.kind}:${move.threadId}`;
    case 'probe_goal':
      return `${move.kind}:${move.goalId}`;
    case 'open_ended':
    case 'follow':
    case 'acknowledge':
    case 'retell':
    case 'retell_check':
    case 'take_correction':
    case 'offer_visualize':
    case 'offer_later':
    case 'choose_style':
    case 'style_help':
    case 'keep':
    case 'wrap':
      return move.kind;
    case 'start':
      return `start:${move.styleId}`;
    case 'confirm_profile':
    case 'profile_check':
      return `${move.kind}:${move.itemId}`;
    case 'build_done':
    case 'while_drawing':
    case 'ask_which':
    case 'sheets_done':
    case 'frames_drawing':
    case 'all_done':
      return move.kind;
    default:
      return unreachable(move);
  }
}

/** Every switch on a closed union ends here, so a new variant fails to compile instead of falling through. */
export function unreachable(x: never): never {
  throw new Error(`unhandled variant: ${JSON.stringify(x)}`);
}
