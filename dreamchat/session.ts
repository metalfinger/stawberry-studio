// Conversations, and the turn that moves one forward.
//
// The turn itself is the lab's (vibechk experiments/vibechk-lab/src/session.ts, adcbaccdd):
// Jev reads the whole transcript, code picks the move, the host writes the words. What is
// new here is the phase, and a guarantee the lab did not have: turns for one conversation
// run strictly one at a time.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bookkeeperQuestions,
  type JevFn,
  type JevReadNote,
  readState,
  renderTranscript,
  retellingQuestion,
} from './jev';
import {
  askableGoals,
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

export type StoreDeps = { jev: JevFn; host: HostFn; dir?: string; now?: () => number };

export class SessionStore {
  private sessions = new Map<string, Session>();
  private chains = new Map<string, Promise<unknown>>();
  private memoryDetails = new Map<string, TurnDetail>();

  constructor(
    readonly cfg: GoalsFile,
    private deps: StoreDeps,
  ) {
    if (!deps.dir) return;
    mkdirSync(deps.dir, { recursive: true });
    for (const f of readdirSync(deps.dir)) {
      if (!f.endsWith('.json')) continue;
      const s = JSON.parse(readFileSync(join(deps.dir, f), 'utf8')) as Session;
      this.sessions.set(s.id, s);
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

    const questions = bookkeeperQuestions(this.cfg, s.transcript, prev, s.phase);
    const call = await this.deps.jev(renderTranscript(s.transcript), questions);
    const { next, notes } = readState(prev, this.cfg, s.transcript, call, turnNow, s.phase);

    // Session facts beat state facts: which move was just made and which threads were
    // already explored come from this conversation's own record, not the judge.
    const overlaid: State = {
      ...next,
      last_move: lastTurn ? moveKey(lastTurn.move) : next.last_move,
      threads: next.threads.map((th) => (s.exploredThreads.includes(th.id) ? { ...th, explored: true } : th)),
    };
    let followStreak = 0;
    for (let i = s.turns.length - 1; i >= 0 && isFollowing(s.turns[i].move); i--) followStreak++;
    const { move, rule } = selectMove(overlaid, this.cfg, {
      phase: s.phase,
      askCounts: s.askCounts,
      listenTurns: turnNow,
      retells: s.retells,
      followStreak,
    });
    let phase = phaseAfter(s.phase, move);
    const brief = renderBrief(overlaid, move, this.cfg, { phase });
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
    s.phase = phase;
    s.closed = phase === 'understood' || phase === 'ended';
    s.state = { ...overlaid, last_move: moveKey(move) };

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
    s.updatedAt = this.now();
    this.sessions.set(s.id, s);
    if (!this.deps.dir) {
      this.memoryDetails.set(`${s.id}:${turn.turn}`, detail);
      return;
    }
    mkdirSync(join(this.deps.dir, s.id), { recursive: true });
    await Bun.write(join(this.deps.dir, s.id, `turn-${turn.turn}.json`), JSON.stringify(detail, null, 2));
    await Bun.write(join(this.deps.dir, `${s.id}.json`), JSON.stringify(s, null, 2));
  }
}
