// Conversations, and the turn that moves one forward.
//
// The turn itself is the lab's (vibechk experiments/vibechk-lab/src/session.ts, adcbaccdd):
// Jev reads the whole transcript, code picks the move, the host writes the words. What is
// new here is the phase, and a guarantee the lab did not have: turns for one conversation
// run strictly one at a time.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type GroundingNote, ground } from './ground';
import {
  bookkeeperQuestions,
  type Exchange,
  type JevFn,
  type JevReadNote,
  readState,
  renderTranscript,
  retellingQuestion,
} from './jev';
import {
  askableGoals,
  type BriefExtras,
  CLOSED,
  type GoalsFile,
  goalStatus,
  initialState,
  isFollowing,
  type Move,
  moveKey,
  needsThought,
  type Phase,
  phaseAfter,
  renderBrief,
  selectMove,
  type State,
} from './lib';
import {
  type ChatMessage,
  HOST_THINKING,
  HOST_THINKING_DEEP,
  type HostFn,
  parseTurnResponse,
  type Thinking,
} from './llm';
import { type Breakdown, callProducer, type Detail, normalizeBreakdown, ownStyle, type StyleOption } from './producer';
import { buildFrames, framePrompt } from './frames';
import { type Check, type Item, profileOf, type SheetEngine } from './sheets';
import type { WriteResult } from './strawberry';

export type Entry = { role: 'user' | 'assistant'; content: string; messages?: string[] };

export type TurnRecord = {
  turn: number;
  move: Move;
  rule: string;
  /** The phase the move left the conversation in. */
  phase: Phase;
  brief: string;
  jevMs: number;
  hostMs: number;
  thinking?: Thinking;
  /** Time this turn spent waiting for the producer's breakdown. */
  waitMs?: number;
  violations: string[];
  notes: JevReadNote[];
  at: number;
};

/** Everything the trace panes show. Kept apart from the session: it runs to many KB a turn. */
export type TurnDetail = {
  jevQuestions: unknown;
  jevAnswers: unknown;
  jevError: string | null;
  hostInput: ChatMessage[];
  hostRaw: string;
  stateAfter: State;
};

/** The producer's breakdown of the dream, drafted in the background. */
export type Draft = {
  status: 'drafting' | 'ready' | 'failed';
  /** How many of their messages it was drafted from. */
  basedOn: number;
  breakdown?: Breakdown;
  /** Details the producer marked as said that Jev could not find in their words. */
  downgraded?: GroundingNote[];
  notes?: string[];
  ms?: number;
  error?: string;
};

export type DraftResult = { breakdown: Breakdown; downgraded: GroundingNote[]; notes: string[]; ms: number };

/** The production written into Strawberry once they choose how it should look. */
export type Production = {
  status: 'writing' | 'written' | 'failed' | 'unavailable';
  result?: WriteResult;
  error?: string;
};

/** Sketches per conversation, at most. At fal's $0.15 a sketch, 30 is $4.50. */
export const IMAGE_CAP = Number(process.env.DREAMCHAT_IMAGE_CAP ?? 30);
/** The approval ceiling on a single sketch, in US dollars. */
const MAX_USD_PER_IMAGE = 0.2;

/** Frames drawing at once, at most; the rest wait their turn. */
const FRAMES_AT_ONCE = 3;

/**
 * The people, places and things being confirmed and sketched, in Strawberry's order; then the
 * moments drawn from them, the key one first.
 */
export type Build = { items: Item[]; current: string | null; checks: number; frames?: Item[] };

export type Session = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  phase: Phase;
  closed: boolean;
  transcript: Entry[];
  briefs: Record<number, string>;
  turns: TurnRecord[];
  state: State;
  askCounts: Record<string, number>;
  exploredThreads: string[];
  retells: number;
  offers: number;
  styleAsks: number;
  draft: Draft | null;
  style: StyleOption | null;
  production: Production | null;
  build: Build | null;
  /** Sketches started, against the cap. */
  images: number;
  /** What fal's list price says they cost so far, in US dollars. */
  spentUsd: number;
};

export type TurnResult = {
  messages: string[];
  phase: Phase;
  closed: boolean;
  move?: Move;
  rule?: string;
  /** The conversation was already open; nothing new was said. */
  already?: boolean;
  /** The conversation is over; the message was not taken. */
  refused?: boolean;
};

export type StoreDeps = {
  jev: JevFn;
  host: HostFn;
  /** Drafts the breakdown. Absent in tests that don't need one: the chat then offers no style options. */
  producer?: (transcript: Exchange[], previous?: Breakdown) => Promise<DraftResult>;
  /** Their own description of how it should look, as a style option. */
  ownStyle?: (transcript: string) => Promise<StyleOption | null>;
  /** Writes the production into Strawberry. Absent when the engine isn't installed. */
  write?: (b: Breakdown, style: StyleOption, transcript: string) => Promise<WriteResult>;
  /** Draws reference sheets through the engine. Absent: nothing is sketched. */
  sheets?: SheetEngine;
  /** Applies the person's answer to a profile. */
  reviseItem?: (name: string, fields: Record<string, Detail>, transcript: string) => Promise<Record<string, Detail>>;
  /** How often a running sketch is checked, in ms. */
  watchEveryMs?: number;
  /** The image judge: checks a finished take against its declared facts. Absent: no check. */
  judge?: (mediaId: string) => Promise<Check>;
  dir?: string;
  now?: () => number;
};

/** The real producer: the breakdown, then Jev's check of every detail marked as said. */
export function liveProducer(jev: JevFn): NonNullable<StoreDeps['producer']> {
  return async (transcript, previous) => {
    const { raw, ms } = await callProducer(renderTranscript(transcript), previous);
    const { breakdown, notes } = normalizeBreakdown(raw);
    const g = await ground(breakdown, transcript, jev);
    return { breakdown: g.breakdown, downgraded: g.downgraded, notes, ms: ms + g.ms };
  };
}

export { ownStyle };

const userTurns = (s: Session) => s.transcript.filter((e) => e.role === 'user').length;

/**
 * The sheets to draw, in Strawberry's order: the protagonist, the other people, the places, the
 * things, and last the dreamer, when they are seen at all.
 */
export function buildItems(b: Breakdown): Item[] {
  const item = (
    id: string,
    kind: Item['kind'],
    name: string,
    fields: Record<string, Detail>,
    isDreamer = false,
  ): Item => ({
    id,
    kind,
    name,
    fields: structuredClone(fields),
    status: 'waiting',
    version: 0,
    isDreamer,
  });
  const others = b.people.filter((p) => !p.is_dreamer);
  others.sort((x, y) => Number(y.protagonist) - Number(x.protagonist));
  return [
    ...others.map((p) => item(p.id, 'character', p.name, p.fields)),
    ...b.places.map((l) => item(l.id, 'location', l.name, l.fields)),
    ...b.things.map((t) => item(t.id, 'prop', t.name, t.fields)),
    ...b.people.filter((p) => p.is_dreamer).map((p) => item(p.id, 'character', p.name, p.fields, true)),
  ];
}

/** The first thing that would be drawn, in plain words: the protagonist, else the first place. */
function firstSubject(b: Breakdown | undefined): string | undefined {
  if (!b) return undefined;
  const p = b.people.find((x) => x.protagonist && !x.is_dreamer) ?? b.people.find((x) => !x.is_dreamer);
  return p?.name ?? b.places[0]?.name ?? b.things[0]?.name;
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private chains = new Map<string, Promise<unknown>>();
  private memoryDetails = new Map<string, TurnDetail>();
  private drafts = new Map<string, { basedOn: number; promise: Promise<DraftResult> }>();
  private writes = new Map<string, Promise<unknown>>();
  private watching = new Set<string>();
  private reviews = new Map<string, Promise<unknown>>();

  constructor(
    readonly cfg: GoalsFile,
    private deps: StoreDeps,
  ) {
    if (!deps.dir) return;
    mkdirSync(deps.dir, { recursive: true });
    for (const f of readdirSync(deps.dir)) {
      if (!f.endsWith('.json')) continue;
      // Conversations saved before a field existed get its starting value.
      const saved = JSON.parse(readFileSync(join(deps.dir, f), 'utf8')) as Partial<Session> & { id: string };
      this.sessions.set(saved.id, {
        ...saved,
        offers: saved.offers ?? 0,
        styleAsks: saved.styleAsks ?? 0,
        draft: saved.draft ?? null,
        style: saved.style ?? null,
        production: saved.production ?? null,
        build: saved.build ?? null,
        images: saved.images ?? 0,
        spentUsd: saved.spentUsd ?? 0,
      } as Session);
    }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  create(name = ''): Session {
    const at = this.now();
    const d = new Date(at);
    const p = (n: number) => String(n).padStart(2, '0');
    const id = `dream-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomUUID().slice(0, 4)}`;
    const s: Session = {
      id,
      name,
      createdAt: at,
      updatedAt: at,
      phase: 'listen',
      closed: false,
      transcript: [],
      briefs: {},
      turns: [],
      state: initialState(id, this.cfg),
      askCounts: {},
      exploredThreads: [],
      retells: 0,
      offers: 0,
      styleAsks: 0,
      draft: null,
      style: null,
      production: null,
      build: null,
      images: 0,
      spentUsd: 0,
    };
    this.sessions.set(id, s);
    return s;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list() {
    return [...this.sessions.values()]
      .map((s) => ({
        id: s.id,
        name: s.name,
        phase: s.phase,
        closed: s.closed,
        messages: s.transcript.filter((e) => e.role === 'user').length,
        opening: s.transcript.find((e) => e.role === 'user')?.content.slice(0, 80) ?? '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** The session plus each goal's standing, as the panel shows it. */
  view(id: string) {
    const s = this.sessions.get(id);
    if (!s) return null;
    const t = this.cfg.confidence_threshold;
    const askable = new Set(askableGoals(s.state, this.cfg, s.askCounts).map((g) => g.id));
    const goals = this.cfg.goals.map((g) => {
      const gs = s.state.goals[g.id];
      return {
        id: g.id,
        label: g.label,
        optional: g.optional === true,
        status: goalStatus(gs, t),
        confidence: gs?.confidence ?? 0,
        evidence: gs?.evidence ?? '',
        asks: s.askCounts[g.id] ?? 0,
        askable: askable.has(g.id),
      };
    });
    return { ...s, goals };
  }

  detail(id: string, turn: number): TurnDetail | null {
    if (!this.deps.dir) return this.memoryDetails.get(`${id}:${turn}`) ?? null;
    const path = join(this.deps.dir, id, `turn-${turn}.json`);
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as TurnDetail) : null;
  }

  open(id: string): Promise<TurnResult> {
    return this.serial(id, () => this.openNow(id));
  }

  message(id: string, text: string): Promise<TurnResult> {
    return this.serial(id, () => this.messageNow(id, text));
  }

  // One turn at a time per conversation. Every turn reads the conversation, waits seconds
  // on two model calls, then saves the whole conversation back. Two turns running at once
  // (a double send, a retry, a second tab) would both read the same conversation, and the
  // later save would erase the earlier one. That is the lab's double-greeting race, and
  // it happens on a Durable Object too, because awaiting a fetch lets other requests in.
  // Reads (`get`, `view`, `list`) never wait on this.
  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.chains.set(
      id,
      run.catch(() => undefined),
    );
    return run;
  }

  private require(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`no such conversation: ${id}`);
    return s;
  }

  /** The host speaks first. Nothing has been said, so the judge is not called. */
  private async openNow(id: string): Promise<TurnResult> {
    const current = this.require(id);
    if (current.transcript.length > 0 || current.closed) {
      const last = current.transcript.findLast((e) => e.role === 'assistant');
      return { messages: last?.messages ?? [], phase: current.phase, closed: current.closed, already: true };
    }
    // Work on a copy, so a failed model call leaves the conversation exactly as it was.
    const s = structuredClone(current);
    const move: Move = { kind: 'open_ended' };
    const brief = renderBrief(s.state, move, this.cfg, { opening: true, phase: s.phase });
    const hostInput: ChatMessage[] = [
      { role: 'system', content: this.cfg.persona.system },
      { role: 'user', content: '(they have just opened the chat — no message from them yet)' },
      { role: 'system', content: brief },
    ];
    const res = await this.deps.host(hostInput, { thinking: HOST_THINKING });
    const parsed = parseTurnResponse(res.content);
    s.briefs[0] = brief;
    s.transcript.push({ role: 'assistant', content: parsed.messages.join('\n\n'), messages: parsed.messages });
    s.state = { ...s.state, last_move: moveKey(move) };
    await this.commit(
      s,
      {
        turn: 0,
        move,
        rule: 'opening',
        phase: s.phase,
        brief,
        jevMs: 0,
        hostMs: res.ms,
        violations: parsed.violations,
        notes: [],
        at: this.now(),
      },
      {
        jevQuestions: null,
        jevAnswers: null,
        jevError: null,
        hostInput,
        hostRaw: res.content,
        stateAfter: s.state,
      },
    );
    return { messages: parsed.messages, phase: s.phase, closed: false, move, rule: 'opening' };
  }

  private async messageNow(id: string, text: string): Promise<TurnResult> {
    const current = this.require(id);
    if (current.closed) return { messages: [], phase: current.phase, closed: true, refused: true };
    const s = structuredClone(current);

    const prev = s.state;
    const turnNow = s.transcript.filter((e) => e.role === 'user').length + 1;
    const lastTurn = s.turns.at(-1);
    s.transcript.push({ role: 'user', content: text });

    const styles = s.draft?.breakdown?.style_options ?? [];
    const onShow = s.build?.items.find((i) => i.id === s.build?.current);
    // Sketches they have been shown and not yet answered about.
    const pieces = s.phase === 'frames' ? (s.build?.frames ?? []) : (s.build?.items ?? []);
    const pending = pieces.filter((i) => i.status === 'ready' && i.announced && !i.review);
    const questions = bookkeeperQuestions(
      this.cfg,
      s.transcript,
      prev,
      s.phase,
      styles,
      onShow?.name,
      s.phase === 'review' || s.phase === 'frames' ? pending.map(({ id, name }) => ({ id, name })) : [],
    );
    const call = await this.deps.jev(renderTranscript(s.transcript), questions);
    const { next, notes } = readState(prev, this.cfg, s.transcript, call, turnNow, s.phase);

    // Session facts beat state facts: which move was just made and which threads were
    // already explored come from this conversation's own record, not the judge.
    const overlaid: State = {
      ...next,
      last_move: lastTurn ? moveKey(lastTurn.move) : next.last_move,
      threads: next.threads.map((th) => (s.exploredThreads.includes(th.id) ? { ...th, explored: true } : th)),
    };
    // Their answer to the sketches is applied before the next move is chosen: it can settle the
    // last one, or start a new version.
    const reviewed = { approved: [] as string[], redrawing: [] as string[] };
    let whichUnclear = false;
    if ((s.phase === 'review' || s.phase === 'frames') && pending.length) {
      const reaction = overlaid.signals.sketch_reaction ?? 'no_reaction';
      const verdicts = overlaid.signals.sketch_verdicts ?? {};
      const right = pending.filter((i) => verdicts[i.id] === 'right');
      const wrong = pending.filter((i) => verdicts[i.id] === 'wrong');
      if (reaction === 'no_reaction' && !right.length && !wrong.length) {
        for (const it of pending)
          this.reviewSketch(s, it, 'left', 'Shown to them in the chat; they raised nothing against it.');
      } else if (!right.length && !wrong.length) {
        // A reaction, but to no picture in particular: "it looks great" with one or all on show.
        if (reaction === 'looks_right')
          for (const it of pending) {
            this.reviewSketch(s, it, 'approved', `They said it looks right: "${text.slice(0, 400)}"`);
            reviewed.approved.push(it.name);
          }
        else if (pending.length === 1) wrong.push(pending[0]);
        else whichUnclear = true;
      } else
        for (const it of right) {
          this.reviewSketch(s, it, 'approved', `They said it looks right: "${text.slice(0, 400)}"`);
          reviewed.approved.push(it.name);
        }
      for (const it of wrong) {
        this.reviewSketch(s, it, 'rejected', `They said it isn't right: "${text.slice(0, 400)}"`);
        const before = structuredClone(it.fields);
        if (this.deps.reviseItem)
          it.fields = await this.deps.reviseItem(it.name, it.fields, renderTranscript(s.transcript));
        it.announced = false;
        it.review = undefined;
        if (it.kind === 'cut') await this.startFrame(s, it, turnNow, before);
        else await this.startSketch(s, it, turnNow);
        reviewed.redrawing.push(it.name);
      }
    }
    const isSettled = (i: Item) => i.status === 'failed' || (i.status === 'ready' && i.review !== undefined);
    const settled = !!s.build && s.build.items.every(isSettled);
    const framesSettled = !!s.build?.frames?.length && s.build.frames.every(isSettled);

    let followStreak = 0;
    for (let i = s.turns.length - 1; i >= 0 && isFollowing(s.turns[i].move); i--) followStreak++;
    const { move, rule } = selectMove(overlaid, this.cfg, {
      phase: s.phase,
      askCounts: s.askCounts,
      listenTurns: turnNow,
      retells: s.retells,
      followStreak,
      offers: s.offers,
      styleAsks: s.styleAsks,
      styleIds: styles.map((o) => o.id),
      build: s.build
        ? { current: s.build.current, next: this.nextItem(s.build)?.id ?? null, checks: s.build.checks }
        : undefined,
      review: { settled, whichUnclear },
      frames: { settled: framesSettled, whichUnclear },
    });
    let phase = phaseAfter(s.phase, move);

    // The producer drafts the breakdown while the dream is told back, so it is usually done
    // by the time the person has answered; a correction redrafts it from the previous one.
    if (move.kind === 'retell' || move.kind === 'take_correction') this.startDraft(s);
    // The moves that offer or apply a way of drawing it need the breakdown. Wait if needed.
    let waitMs = 0;
    if (move.kind === 'choose_style' || move.kind === 'style_help' || move.kind === 'start') {
      const t0 = this.now();
      await this.readyDraft(s);
      waitMs = this.now() - t0;
    }
    if (move.kind === 'start') {
      const b = s.draft?.breakdown;
      s.style =
        move.styleId === 'own' && this.deps.ownStyle
          ? await this.deps.ownStyle(renderTranscript(s.transcript))
          : (b?.style_options.find((o) => o.id === move.styleId) ?? b?.style_options[0] ?? null);
    }
    const extras: BriefExtras = {
      styles: (s.draft?.breakdown?.style_options ?? []).map(({ id, name, line }) => ({ id, name, line })),
      firstSubject: firstSubject(s.draft?.breakdown),
    };
    if (s.style?.id === 'own')
      extras.styles = [...(extras.styles ?? []), { id: 'own', name: s.style.name, line: s.style.line }];

    // Building: the answer settles the profile on show, its sketch starts, and the next one is shown.
    if (move.kind === 'start') {
      const items = s.draft?.breakdown ? buildItems(s.draft.breakdown) : [];
      const first = items.find((i) => i.kind !== 'prop') ?? items[0];
      if (!items.length || !first || !this.deps.sheets || !this.deps.write) phase = 'ready';
      else {
        first.status = 'confirming';
        s.build = { items, current: first.id, checks: 0 };
        extras.profile = profileOf(first);
      }
    }
    if (s.build && (move.kind === 'confirm_profile' || move.kind === 'build_done')) {
      const settling = s.build.items.find((i) => i.id === s.build?.current);
      if (settling) {
        if (overlaid.signals.profile_reply === 'changes' && this.deps.reviseItem)
          settling.fields = await this.deps.reviseItem(settling.name, settling.fields, renderTranscript(s.transcript));
        await this.startSketch(s, settling, turnNow);
        // Things go with the first profile settled: they are drawn from what was said, unasked.
        const things = s.build.items.filter((i) => i.kind === 'prop' && i.status === 'waiting');
        for (const t of things) await this.startSketch(s, t, turnNow);
        extras.sketching = [settling.isDreamer ? 'you' : settling.name, ...things.map((t) => t.name)].join(' and ');
      }
      const next = move.kind === 'confirm_profile' ? s.build.items.find((i) => i.id === move.itemId) : undefined;
      if (next) {
        next.status = 'confirming';
        extras.profile = profileOf(next);
      }
      s.build.current = next?.id ?? null;
      s.build.checks = 0;
    }
    if (s.build && move.kind === 'profile_check') {
      s.build.checks += 1;
      const item = s.build.items.find((i) => i.id === move.itemId);
      if (item) extras.profile = profileOf(item);
    }
    if (s.build && move.kind === 'sheets_done') await this.startFrames(s, turnNow);
    if (s.build && (move.kind === 'frames_drawing' || move.kind === 'all_done')) {
      extras.approved = reviewed.approved;
      extras.redrawing = reviewed.redrawing;
      extras.frameCount = s.build.frames?.length;
      extras.failed = (s.build.frames ?? []).filter((i) => i.status === 'failed').map((i) => i.name);
      if (move.kind === 'frames_drawing') {
        const fresh = (s.build.frames ?? []).filter((i) => i.status === 'ready' && !i.announced);
        const key = fresh.find((i) => i.frame?.key);
        if (key) extras.keyReady = key.fields.action?.value ?? key.name;
        extras.finished = fresh.filter((i) => i !== key).map((i) => i.name);
        for (const i of fresh) i.announced = true;
      }
    }
    if (s.build && (move.kind === 'while_drawing' || move.kind === 'sheets_done' || move.kind === 'ask_which')) {
      extras.approved = reviewed.approved;
      extras.redrawing = reviewed.redrawing;
      extras.shown = pending.map((i) => i.name);
      if (move.kind === 'while_drawing') {
        const fresh = s.build.items.filter((i) => i.status === 'ready' && !i.announced);
        extras.finished = fresh.map((i) => i.name);
        for (const i of fresh) i.announced = true;
      }
    }
    const brief = renderBrief(overlaid, move, this.cfg, { phase, extras });
    if (move.kind === 'probe_goal') s.askCounts[move.goalId] = (s.askCounts[move.goalId] ?? 0) + 1;
    s.briefs[turnNow] = brief;

    const hostInput = this.hostHistory(s);
    const thinking = needsThought(move) ? HOST_THINKING_DEEP : HOST_THINKING;
    const res = await this.deps.host(hostInput, { thinking });
    const parsed = parseTurnResponse(res.content);
    s.transcript.push({ role: 'assistant', content: parsed.messages.join('\n\n'), messages: parsed.messages });

    // A retelling that never happened must not move the conversation on.
    let told = true;
    if (move.kind === 'retell') {
      const check = await this.deps.jev(renderTranscript(s.transcript), retellingQuestion(parsed.messages.join(' ')));
      const a = check.answers?.is_retelling;
      // If the judge is down, trust the move rather than stall the conversation.
      told = !a || a.type !== 'noul' || a.noul >= 0.5;
      if (!told) {
        phase = s.phase;
        parsed.violations.push(
          `asked to retell, but the reply was not a retelling (${a && a.type === 'noul' ? a.noul.toFixed(2) : '?'}) — still listening`,
        );
      }
    }

    if ((move.kind === 'explore_thread' || move.kind === 'circle_back') && !s.exploredThreads.includes(move.threadId))
      s.exploredThreads.push(move.threadId);
    if ((move.kind === 'retell' && told) || move.kind === 'take_correction') s.retells += 1;
    if (move.kind === 'offer_visualize' || move.kind === 'offer_later') s.offers += 1;
    if (move.kind === 'choose_style' || move.kind === 'style_help') s.styleAsks += 1;
    s.phase = phase;
    s.closed = CLOSED.includes(phase);
    s.state = { ...overlaid, last_move: moveKey(move) };
    if (move.kind === 'start') this.startWrite(s);
    if ([...(s.build?.items ?? []), ...(s.build?.frames ?? [])].some((i) => i.status === 'drawing')) this.watch(s.id);

    await this.commit(
      s,
      {
        turn: turnNow,
        move,
        rule,
        phase,
        brief,
        jevMs: call.ms,
        hostMs: res.ms,
        thinking,
        waitMs: waitMs || undefined,
        violations: parsed.violations,
        notes,
        at: this.now(),
      },
      {
        jevQuestions: questions,
        jevAnswers: call.answers,
        jevError: call.error,
        hostInput,
        hostRaw: res.content,
        stateAfter: s.state,
      },
    );
    return { messages: parsed.messages, phase, closed: s.closed, move, rule };
  }

  // ── Background work ───────────────────────────────────────────────────────
  // A job never writes to a conversation directly. It runs outside the turn queue, then
  // hands its result back THROUGH the queue, so it can't be overwritten by a turn that was
  // running at the same time, or overwrite one.

  private startDraft(s: Session): void {
    if (!this.deps.producer) return;
    const basedOn = userTurns(s);
    if (this.drafts.get(s.id)?.basedOn === basedOn) return;
    const promise = this.deps.producer(structuredClone(s.transcript), s.draft?.breakdown);
    this.drafts.set(s.id, { basedOn, promise });
    // The previous breakdown stays on show while the new one is drafted.
    s.draft = { status: 'drafting', basedOn, breakdown: s.draft?.breakdown };
    promise.then(
      (r) => this.serial(s.id, () => this.update(s.id, (x) => this.applyDraft(x, basedOn, r))),
      (e) =>
        this.serial(s.id, () =>
          this.update(s.id, (x) => {
            if (x.draft?.basedOn === basedOn && x.draft.status === 'drafting')
              x.draft = { ...x.draft, status: 'failed', error: String(e) };
          }),
        ),
    );
  }

  private applyDraft(s: Session, basedOn: number, r: DraftResult): void {
    // A newer draft has started, or a turn already applied this one.
    if (s.draft && (s.draft.basedOn > basedOn || (s.draft.basedOn === basedOn && s.draft.status === 'ready'))) return;
    s.draft = { status: 'ready', basedOn, ...r };
  }

  /** The breakdown for this turn, waiting for the running draft (or starting one) if needed. */
  private async readyDraft(s: Session): Promise<void> {
    if (s.draft?.status === 'ready' || !this.deps.producer) return;
    if (!this.drafts.has(s.id)) this.startDraft(s); // e.g. after a restart lost the running one
    const d = this.drafts.get(s.id);
    if (!d) return;
    try {
      this.applyDraft(s, d.basedOn, await d.promise);
    } catch (e) {
      s.draft = { status: 'failed', basedOn: d.basedOn, breakdown: s.draft?.breakdown, error: String(e) };
    }
  }

  private startWrite(s: Session): void {
    const b = s.draft?.breakdown;
    if (!this.deps.write || !b || !s.style) {
      s.production = { status: 'unavailable' };
      return;
    }
    s.production = { status: 'writing' };
    const writing = this.deps.write(b, s.style, renderTranscript(s.transcript));
    this.writes.set(s.id, writing);
    writing.then(
      (result) =>
        this.serial(s.id, () =>
          this.update(s.id, (x) => {
            x.production = { status: 'written', result };
          }),
        ),
      (e) =>
        this.serial(s.id, () =>
          this.update(s.id, (x) => {
            x.production = { status: 'failed', error: String(e) };
          }),
        ),
    );
  }

  /** The next profile to show. Things are sketched without their own question. */
  private nextItem(b: Build): Item | undefined {
    const at = b.items.findIndex((i) => i.id === b.current);
    return b.items.slice(at + 1).find((i) => i.status === 'waiting' && i.kind !== 'prop');
  }

  /**
   * Begin the moments: one frame per cut, the key one first. Their verdicts on the sheets must
   * be recorded first, because only approved sheets can be references.
   */
  private async startFrames(s: Session, turn: number): Promise<void> {
    if (!s.build || !s.draft?.breakdown) return;
    await Promise.all(
      [...this.reviews.entries()].filter(([k]) => k.startsWith(`${s.id}:`)).map(([, p]) => p.catch(() => undefined)),
    );
    const ids = s.production?.result?.ids ?? {};
    s.build.frames = buildFrames(s.draft.breakdown).map((f) => ({ ...f, nodeId: ids[f.id] }));
    await this.fillFrames(s, turn);
  }

  /** Start waiting frames until as many are drawing as may be at once. */
  private async fillFrames(s: Session, turn: number): Promise<void> {
    const frames = s.build?.frames ?? [];
    for (const f of frames) {
      if (frames.filter((x) => x.status === 'drawing').length >= FRAMES_AT_ONCE) break;
      if (f.status === 'waiting') await this.startFrame(s, f, turn);
    }
  }

  /**
   * Start (or redraw) one frame. When the person corrected the moment, its revised fields are
   * patched onto the cut first, sourced to their words.
   */
  private async startFrame(s: Session, frame: Item, turn: number, before?: Item['fields']): Promise<void> {
    frame.startedAtTurn = turn;
    if (!this.deps.sheets || !s.style || !s.build) {
      Object.assign(frame, {
        status: 'failed',
        error: 'nothing can be drawn here: the Strawberry engine is not set up',
      });
      return;
    }
    if (s.images >= IMAGE_CAP) {
      Object.assign(frame, { status: 'failed', error: `the ${IMAGE_CAP}-picture limit for one dream is reached` });
      return;
    }
    if (!frame.nodeId) {
      Object.assign(frame, { status: 'failed', error: 'this moment is not in the production' });
      return;
    }
    const { prompt, references, depicted } = framePrompt(frame, s.build.items, s.style);
    const changes: Record<string, string> = {};
    if (before)
      for (const [k, d] of Object.entries(frame.fields))
        if (d.value && d.value !== before[k]?.value)
          changes[k === 'feeling' ? 'beat.emotional_intent' : k === 'visual_point' ? 'beat.visual_point' : k] = d.value;
    frame.depicted = depicted;
    frame.status = 'drawing';
    frame.version += 1;
    s.images += 1;
    const snapshot = structuredClone(frame);
    this.deps.sheets
      .startFrame({
        item: snapshot,
        prompt,
        references,
        changes,
        source: s.production?.result?.ids.said,
        reason: `The person asked to see their dream drawn and settled everything in it; approved within the ${IMAGE_CAP}-picture limit.`,
        maxUsd: MAX_USD_PER_IMAGE,
      })
      .then(
        (r) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.frames?.find((i) => i.id === frame.id);
              if (!it) return;
              it.jobId = r.jobId;
              it.recipeId = r.recipeId;
              x.spentUsd = Math.round((x.spentUsd + (r.usd ?? 0)) * 100) / 100;
            }),
          ).then(() => this.watch(s.id)),
        (e) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.frames?.find((i) => i.id === frame.id);
              if (it) Object.assign(it, { status: 'failed', error: String(e).slice(0, 300) });
            }),
          ),
      );
  }

  /**
   * Start one sketch. The engine calls run in the background; their result, and every later
   * change of the sketch's state, comes back through the turn queue.
   */
  private async startSketch(s: Session, item: Item, turn: number): Promise<void> {
    item.startedAtTurn = turn;
    if (!this.deps.sheets || !s.style) {
      item.status = 'failed';
      item.error = 'nothing can be drawn here: the Strawberry engine is not set up';
      return;
    }
    if (s.images >= IMAGE_CAP) {
      item.status = 'failed';
      item.error = `the ${IMAGE_CAP}-picture limit for one dream is reached`;
      return;
    }
    // The production must be written before a sketch can be attached to it.
    if (s.production?.status === 'writing') {
      try {
        const result = (await this.writes.get(s.id)) as WriteResult | undefined;
        if (result) s.production = { status: 'written', result };
      } catch (e) {
        s.production = { status: 'failed', error: String(e) };
      }
    }
    const ids = s.production?.result?.ids;
    if (!ids?.[item.id] || !ids.said || !ids.proposal) {
      item.status = 'failed';
      item.error = 'the production was not written, so there is nothing to attach the sketch to';
      return;
    }
    item.nodeId = ids[item.id];
    item.status = 'drawing';
    item.version += 1;
    s.images += 1;
    const snapshot = structuredClone(item);
    const style = s.style;
    this.deps.sheets
      .start({
        item: snapshot,
        style,
        sources: { said: ids.said, proposal: ids.proposal },
        reason: `The person asked to see their dream drawn and settled this profile in conversation; approved within the ${IMAGE_CAP}-picture limit.`,
        maxUsd: MAX_USD_PER_IMAGE,
      })
      .then(
        (r) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.items.find((i) => i.id === item.id);
              if (!it) return;
              it.jobId = r.jobId;
              it.recipeId = r.recipeId;
              x.spentUsd = Math.round((x.spentUsd + (r.usd ?? 0)) * 100) / 100;
            }),
          ).then(() => this.watch(s.id)),
        (e) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.items.find((i) => i.id === item.id);
              if (it) Object.assign(it, { status: 'failed', error: String(e).slice(0, 300) });
            }),
          ),
      );
  }

  /**
   * Record their verdict on a sketch's current take in Strawberry. Approved and left takes become
   * the item's reference; a rejected one stays on record as rejected. Runs in the background;
   * a failure is noted on the item.
   */
  private reviewSketch(s: Session, item: Item, verdict: 'approved' | 'left' | 'rejected', decision: string): void {
    if (verdict !== 'rejected') item.review = verdict;
    if (!this.deps.sheets || !item.mediaId || !item.nodeId) return;
    const done = this.deps.sheets
      .review({
        mediaId: item.mediaId,
        nodeId: item.nodeId,
        approved: verdict !== 'rejected',
        decision,
        depicted: item.kind === 'cut' ? (item.depicted ?? []) : [item.nodeId],
      })
      .catch((e) =>
        this.serial(s.id, () =>
          this.update(s.id, (x) => {
            const it = [...(x.build?.items ?? []), ...(x.build?.frames ?? [])].find((i) => i.id === item.id);
            if (it) it.error = `recording their verdict failed: ${String(e).slice(0, 200)}`;
          }),
        ),
      );
    this.reviews.set(`${s.id}:${item.id}`, done);
  }

  /** Check running sketches until none is left, recording each change through the queue. */
  private watch(id: string): void {
    if (this.watching.has(id) || !this.deps.sheets) return;
    this.watching.add(id);
    const sheets = this.deps.sheets;
    const every = this.deps.watchEveryMs ?? 3000;
    const loop = async () => {
      try {
        for (;;) {
          const s = this.sessions.get(id);
          const running = [...(s?.build?.items ?? []), ...(s?.build?.frames ?? [])].filter(
            (i) => i.status === 'drawing',
          );
          if (!running.length) return;
          for (const it of running) {
            if (!it.jobId || !it.nodeId) continue;
            let st: Awaited<ReturnType<SheetEngine['status']>>;
            try {
              st = await sheets.status(it.jobId, it.nodeId);
            } catch {
              continue; // a failed check is retried on the next pass
            }
            // A picture made but not downloaded is collected again, at no cost, a couple of times
            // before it counts as failed (a download from fal's CDN timed out once, 23 Sep).
            if (st.state === 'collection_failed' && (it.collectRetries ?? 0) < 2) {
              try {
                await sheets.retryCollection(it.jobId);
                await this.serial(id, () =>
                  this.update(id, (x) => {
                    const cur = [...(x.build?.items ?? []), ...(x.build?.frames ?? [])].find((i) => i.id === it.id);
                    if (cur && cur.jobId === it.jobId) cur.collectRetries = (cur.collectRetries ?? 0) + 1;
                  }),
                );
              } catch {
                // retried on the next pass
              }
              continue;
            }
            const failed = ['failed', 'submission_unknown', 'collection_failed', 'cancelled'].includes(st.state);
            if (st.state !== 'ready' && !failed) continue;
            await this.serial(id, () =>
              this.update(id, (x) => {
                const cur = [...(x.build?.items ?? []), ...(x.build?.frames ?? [])].find((i) => i.id === it.id);
                if (!cur || cur.jobId !== it.jobId) return;
                if (st.state === 'ready')
                  Object.assign(cur, {
                    status: 'ready',
                    mediaId: st.mediaId,
                    mediaPath: st.mediaPath,
                    check: undefined,
                  });
                else Object.assign(cur, { status: 'failed', error: st.error ?? st.state });
              }),
            );
          }
          // Each finished take is checked by the judge in the background; the verdict is shown, and
          // decides nothing on its own.
          for (const it of running) void this.judgeWhenReady(id, it.id);
          // A frame that finished makes room for the next one in the queue.
          if (this.sessions.get(id)?.build?.frames?.some((f) => f.status === 'waiting'))
            await this.serial(id, async () => {
              const x = structuredClone(this.require(id));
              await this.fillFrames(x, x.turns.at(-1)?.turn ?? 0);
              await this.save(x);
            });
          await Bun.sleep(every);
        }
      } finally {
        this.watching.delete(id);
      }
    };
    void loop();
  }

  private judged = new Set<string>();

  private async judgeWhenReady(id: string, itemId: string): Promise<void> {
    const judge = this.deps.judge;
    const b = this.sessions.get(id)?.build;
    const it = [...(b?.items ?? []), ...(b?.frames ?? [])].find((i) => i.id === itemId);
    if (!judge || !it || it.status !== 'ready' || !it.mediaId || this.judged.has(it.mediaId)) return;
    const mediaId = it.mediaId;
    this.judged.add(mediaId);
    let check: Check;
    try {
      check = await judge(mediaId);
    } catch (e) {
      check = { questions: 0, passed: 0, failed: [], error: String(e).slice(0, 200) };
    }
    await this.serial(id, () =>
      this.update(id, (x) => {
        const cur = [...(x.build?.items ?? []), ...(x.build?.frames ?? [])].find((i) => i.id === itemId);
        if (cur && cur.mediaId === mediaId) cur.check = check;
      }),
    );
  }

  private async update(id: string, fn: (s: Session) => void): Promise<void> {
    const s = structuredClone(this.require(id));
    fn(s);
    await this.save(s);
  }

  /** Wait for every background job this conversation has running. For tests and the simulator. */
  async settle(id: string, timeoutMs = 180_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await this.serial(id, async () => undefined);
      const s = this.sessions.get(id);
      const drawing = [...(s?.build?.items ?? []), ...(s?.build?.frames ?? [])].some(
        (i) => i.status === 'drawing' || (i.status === 'waiting' && s?.phase === 'frames'),
      );
      if (s?.draft?.status !== 'drafting' && s?.production?.status !== 'writing' && !drawing) return;
      await Bun.sleep(100);
    }
  }

  // Assistant history is replayed in the SAME JSON shape the model must emit: fed back as
  // prose, the lab saw it drift out of the contract within a few turns.
  //
  // Only the newest brief rides along, right after the message it was written for. With
  // every past brief left in, the host sometimes carried out the previous turn's move
  // instead of this one (simulated runs, 23 Sep). The stored briefs stay in the turn records.
  private hostHistory(s: Session): ChatMessage[] {
    const history: ChatMessage[] = [{ role: 'system', content: this.cfg.persona.system }];
    for (const e of s.transcript) {
      if (e.role === 'assistant')
        history.push({ role: 'assistant', content: JSON.stringify({ response: e.messages ?? [e.content] }) });
      else history.push({ role: 'user', content: e.content });
    }
    const userTurns = s.transcript.filter((e) => e.role === 'user').length;
    const latest = s.briefs[userTurns];
    if (latest) history.push({ role: 'system', content: latest });
    return history;
  }

  private async commit(s: Session, turn: TurnRecord, detail: TurnDetail): Promise<void> {
    s.turns.push(turn);
    if (!this.deps.dir) this.memoryDetails.set(`${s.id}:${turn.turn}`, detail);
    else {
      mkdirSync(join(this.deps.dir, s.id), { recursive: true });
      await Bun.write(join(this.deps.dir, s.id, `turn-${turn.turn}.json`), JSON.stringify(detail, null, 2));
    }
    await this.save(s);
  }

  private async save(s: Session): Promise<void> {
    s.updatedAt = this.now();
    this.sessions.set(s.id, s);
    if (this.deps.dir) await Bun.write(join(this.deps.dir, `${s.id}.json`), JSON.stringify(s, null, 2));
  }
}
