// Conversations, and the turn that moves one forward.
//
// The turn itself is the lab's (vibechk experiments/vibechk-lab/src/session.ts, adcbaccdd):
// Jev reads the whole transcript, code picks the move, the host writes the words. What is
// new here is the phase, and a guarantee the lab did not have: turns for one conversation
// run strictly one at a time.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanStyles, type GroundingNote, ground, linkContinuity } from './ground';
import {
  bookkeeperQuestions,
  type Exchange,
  type JevFn,
  type JevReadNote,
  type Question,
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
import {
  type Breakdown,
  callProducer,
  type Detail,
  moments,
  completeViews,
  normalizeBreakdown,
  oneColour,
  VAGUE,
  ownStyle,
  type StyleOption,
} from './producer';
import { type ContinuityPlan, type Criterion, drawOrder, pictureName, planContinuity, seenIn } from './continuity';
import {
  buildFrames,
  buildGhosts,
  type FrameReference,
  framePrompt,
  ghostPrompt,
  inViewOf,
  type PlannedInput,
} from './frames';
import { checkReferences, preflight, readPrompt } from './gate';
import {
  type Check,
  CREDITS_PER_IMAGE,
  colourName,
  type CutRecord,
  type Item,
  LOOK,
  MAX_PER_IMAGE,
  PROVIDER,
  profileOf,
  type SheetEngine,
  type Shape,
  shapeOf,
  sheetPrompt,
} from './sheets';
import type { JudgedCheck, JudgeOptions } from './judge';
import { cutRecord, type WriteResult } from './strawberry';

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
  /** Their message said they don't remember (while listening). */
  forgot?: boolean;
  /** Their message added nothing new to what happened (while listening). */
  dry?: boolean;
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
// A rich dream is a dozen sketches, a dozen moments, their ghosts and a few redraws.
export const IMAGE_CAP = Number(process.env.DREAMCHAT_IMAGE_CAP ?? 60);
/** The approval ceiling on a single sketch, in US dollars. */

/** Frames drawing at once, at most; the rest wait their turn. */
const FRAMES_AT_ONCE = 3;
/** Automatic redraws of a moment the judge failed, before the person sees it. */
const MAX_REPAIRS = 1;

/**
 * The people, places and things being confirmed and sketched, in Strawberry's order; then the
 * moments drawn from them, the key one first.
 */
export type Build = {
  items: Item[];
  current: string | null;
  checks: number;
  /** The moments and the ghosts they need, in the order they are drawn. */
  frames?: Item[];
  /** Which earlier pictures each moment is drawn from, and why; made before any is drawn. */
  plan?: ContinuityPlan;
};

/** A moment or a ghost that needs nothing more from anyone: drawn and looked at, or failed. */
const isSettled = (i: Item) =>
  i.status === 'failed' || (i.status === 'ready' && (i.kind === 'ghost' || i.review !== undefined));

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
  /** Higgsfield credits so far: its estimates, or its charge per picture where it gives none. */
  spentCredits?: number;
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
  judge?: (mediaId: string, opts?: JudgeOptions) => Promise<JudgedCheck | null>;
  /**
   * The confidence gate: Jev reads every picture's prompt before it is paid for, and a picture it
   * is unsure of is held, never drawn on a guess. Absent: no gate (the tests).
   */
  gate?: JevFn;
  /** A held sketch's profile, reworded to describe only its look and filled where it is thin. */
  rewordLook?: (
    name: string,
    kind: 'character' | 'location' | 'prop',
    fields: Record<string, Detail>,
    prompt: string,
    findings: string[],
    transcript: string,
  ) => Promise<Record<string, Detail> | null>;
  /** A held moment's own words, reworded once before it is given up on; text is nearly free. */
  reword?: (
    prompt: string,
    findings: string[],
    fields: Record<string, Detail>,
    cast?: { in: string[]; out: string[] },
  ) => Promise<Record<string, Detail> | null>;
  /** Words for a person's look when nobody described it, filled in as guesses before the sketch. */
  proposeLook?: (
    name: string,
    fields: Record<string, Detail>,
    transcript: string,
    others?: string[],
    kind?: 'character' | 'location' | 'prop',
  ) => Promise<Record<string, Detail>>;
  /** The continuity check: a take beside the pictures it was drawn from. Absent: no check. */
  judgeContinuity?: (mediaId: string, checks: { with: string | null; text: string }[]) => Promise<Check>;
  dir?: string;
  now?: () => number;
};

/** The real producer: the breakdown, then Jev's check of every detail marked as said. */
export function liveProducer(jev: JevFn): NonNullable<StoreDeps['producer']> {
  return async (transcript, previous) => {
    const { raw, ms } = await callProducer(renderTranscript(transcript), previous);
    const { breakdown, notes } = normalizeBreakdown(raw);
    const g = await ground(breakdown, transcript, jev);
    const c = await linkContinuity(g.breakdown, jev);
    const styled = await cleanStyles(c.breakdown, jev);
    if (styled.dropped.length) notes.push(`style content dropped: ${styled.dropped.join('; ')}`);
    return {
      breakdown: styled.breakdown,
      downgraded: g.downgraded,
      notes: [...notes, `continuity: ${c.links.length ? c.links.join(', ') : 'no links'}`, ...c.notes],
      ms: ms + g.ms + c.ms,
    };
  };
}

export { ownStyle };

const userTurns = (s: Session) => s.transcript.filter((e) => e.role === 'user').length;

/**
 * The sheets to draw, in Strawberry's order: the protagonist, the other people, the places, the
 * things, and last the dreamer, when they are seen at all.
 */
/** The most people and places asked about one by one; everything else is sketched unasked. */
const MAX_PEOPLE_ASKED = 2;

/**
 * The people, places and things to sketch, in Strawberry's order, each marked whether it gets
 * its own question. A long run of profile questions lost the person (eight in one dream, 23 Sep),
 * so only what their answer can change is asked: up to two people whose look is partly guessed,
 * protagonist first, the key moment's place if it is partly guessed, and the dreamer when they
 * are seen. Everything else is drawn from what they told, and can still be corrected on sight.
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
  const guessed = (fields: Record<string, Detail>, keys: string[]) =>
    keys.some((k) => fields[k]?.value && !fields[k]?.said);
  const keyPlace = moments(b).find((m) => m.key)?.place;
  let people = 0;
  const items = [
    ...others.map((p) => {
      const it = item(p.id, 'character', p.name, p.fields);
      // Whether it is several people, and whose group someone belongs to, as the producer says.
      if (p.several !== undefined) it.several = p.several;
      if (p.part_of) it.partOf = p.part_of;
      // A crowd is said in words wherever it is, and needs nothing from anyone.
      if (p.extras) return Object.assign(it, { extras: true, status: 'ready' as const, review: 'approved' as const });
      it.ask = people < MAX_PEOPLE_ASKED && guessed(p.fields, ['appearance', 'wardrobe', 'distinctive_features']);
      if (it.ask) people += 1;
      return it;
    }),
    ...b.places.map((l) => {
      const it = item(l.id, 'location', l.name, l.fields);
      it.ask = l.id === keyPlace && guessed(l.fields, ['geography', 'landmarks', 'light']);
      return it;
    }),
    ...b.things.map((t) => item(t.id, 'prop', t.name, t.fields)),
    ...b.people
      .filter((p) => p.is_dreamer)
      .map((p) => Object.assign(item(p.id, 'character', p.name, p.fields, true), { ask: true })),
  ];
  // At least one profile is shown, so the person sees what the pictures will be drawn from.
  if (!items.some((i) => i.ask)) {
    const first = items.find((i) => i.kind !== 'prop');
    if (first) first.ask = true;
  }
  return items;
}

/** The first thing that would be drawn, in plain words: the protagonist, else the first place. */
function firstSubject(b: Breakdown | undefined): string | undefined {
  if (!b) return undefined;
  const p = b.people.find((x) => x.protagonist && !x.is_dreamer) ?? b.people.find((x) => !x.is_dreamer);
  return p?.name ?? b.places[0]?.name ?? b.things[0]?.name;
}

/** A failed declared-fact question as the instruction a redraw needs. */
export function asInstruction(question: string): string {
  // The dreamer's asset is called "you"; to a picture, "you" is anyone.
  const q = question
    .trim()
    .replace(/^Is you\b/, 'Is the dreamer')
    .replace(/^Are you's\b/, "Are the dreamer's")
    .replace(/^Is you's\b/, "Is the dreamer's")
    .replace(/^Does you\b/, 'Does the dreamer');
  const rules: [RegExp, (...m: string[]) => string][] = [
    [/^Is (.+) in frame\?$/, (_, a) => `${a} must be clearly in the frame`],
    [/^Is this (.+)\?$/, (_, a) => `it must clearly be ${a}`],
    [/^Is (.+) visible\?$/, (_, a) => `${a} must be clearly visible`],
    [/^Is (.+) wearing: (.+)\?$/, (_, a, b) => `${a} wears ${b}`],
    [/^Does (.+) match: (.+)\?$/, (_, a, b) => `${a}: ${b}`],
    [
      /^Is (.+)'s body, head and limbs in a physically plausible position.*$/,
      (_, a) => `${a}'s body is whole and natural: nothing inverted, duplicated or missing`,
    ],
    // A carried state: "Is the young woman's head an irregular block of ice?"
    [/^Is (.+?)'s (\w+) (.+)\?$/, (_, a, b, c) => `${a}'s ${b} is ${c}`],
    [
      /^Is everything in this frame declared\?/,
      () => 'nothing is in the picture that the dream does not have: no other person, face, hand, limb, creature or tool',
    ],
    // The palette by name: a hex code in a prompt is drawn as a label, and "make this true: Are the
    // image's values confined to this palette: #001E3C…" read as a contradiction to the gate (24 Sep).
    [
      /^Are the image's values confined to this palette[^:]*: (.+)\?$/,
      (_, hexes) =>
        `every colour in it, hair, skin and clothes included, is one of ${[...new Set((hexes.match(/#[0-9a-f]{6}/gi) ?? []).map(colourName))].join(', ')}`,
    ],
    [/^Is the image rendered in this style: (.+)\?$/, (_, a) => `it is drawn in this style: ${a}`],
    [/^Does the image actually show this: (.+)\?$/, (_, a) => `the picture shows ${a}`],
    [/^Does the light in this frame follow: (.+?)\??$/, (_, a) => `its light: ${a}`],
    [/^Does the frame show this happening: (.+?)\??$/, (_, a) => `the frame shows this happening: ${a}`],
    [/^Does the frame carry this: (.+?)\??$/, (_, a) => `the frame shows ${a}`],
  ];
  for (const [re, f] of rules) {
    const m = q.match(re);
    if (m) return f(...m);
  }
  return `make this true: ${q.replace(/\?$/, '')}`;
}

/** The gate's findings that rewording a moment can put right, as opposed to its images. */
const WORDING =
  /^(its instructions may contradict|someone may be drawn twice|what it shows is not clear|what to take from each image)/;

/** A picture the confidence gate held back, with its reasons. */
class Held extends Error {
  constructor(readonly findings: string[]) {
    super(`held before drawing: ${findings.join('; ')}`);
  }
}

/** A picture's cost, in its provider's own unit: fal's list price in dollars, Higgsfield's credits. */
function spend(s: Session, estimate: number | null): void {
  if (PROVIDER === 'higgsfield') s.spentCredits = (s.spentCredits ?? 0) + (estimate ?? CREDITS_PER_IMAGE);
  else s.spentUsd = Math.round((s.spentUsd + (estimate ?? 0)) * 100) / 100;
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
    // A sketch held back for how it looks, asked about last turn: their answer is applied and it is
    // put through the gate again. Twice asked and still unsure, it is left undrawn.
    if (s.phase === 'review' && s.build)
      for (const it of s.build.items.filter((i) => i.held && i.status === 'waiting' && i.heldAsks)) {
        if (this.deps.reviseItem) it.fields = await this.deps.reviseItem(it.name, it.fields, renderTranscript(s.transcript));
        it.held = undefined;
        await this.startSketch(s, it, turnNow);
      }
    // Their answer to the sketches is applied before the next move is chosen: it can settle the
    // last one, or start a new version.
    const reviewed = { approved: [] as string[], redrawing: [] as string[], kept: [] as string[] };
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
      for (const it of [...wrong]) {
        const before = structuredClone(it.fields);
        const revised = this.deps.reviseItem
          ? await this.deps.reviseItem(it.name, it.fields, renderTranscript(s.transcript))
          : it.fields;
        // Nothing is drawn again without something to draw differently: "it looks a little off,
        // I can't say what, go with it" redrew the family unchanged (24 Sep). What they point at
        // goes into the redraw; a vague unease leaves the picture as it is.
        // Who is in it changes too, when they say so: the moment's cast, its plan and its record.
        const cast = it.kind === 'cut' ? await this.castChanges(s, it, text) : { out: [], in: [] };
        if ((cast.out.length || cast.in.length) && it.frame && s.draft?.breakdown) {
          const visible = [...it.frame.visible.filter((p) => !cast.out.includes(p)), ...cast.in];
          it.frame.visible = visible;
          for (const sc of s.draft.breakdown.scenes)
            for (const m of sc.moments) if (m.id === it.id) m.visible = visible;
          await this.replan(s);
        }
        const recast = cast.out.length + cast.in.length > 0;
        const changed = recast || JSON.stringify(revised) !== JSON.stringify(before);
        const named = changed ? null : await this.namedFlaw(text, it.isDreamer ? 'you' : it.name);
        if (!changed && !named) {
          this.reviewSketch(s, it, 'left', `They were unsure but named nothing to change: "${text.slice(0, 400)}"`);
          wrong.splice(wrong.indexOf(it), 1);
          reviewed.kept.push(it.name);
          continue;
        }
        this.reviewSketch(s, it, 'rejected', `They said it isn't right: "${text.slice(0, 400)}"`);
        it.fields = revised;
        // Their correction is what this redraw puts right; what the judge found in an earlier take is not.
        it.repairFor = named ? [`${named}: "${text.slice(0, 200)}"`] : undefined;
        it.announced = false;
        it.review = undefined;
        it.continuityApproved = false;
        if (it.kind === 'cut') await this.startFrame(s, it, turnNow, before);
        else await this.startSketch(s, it, turnNow);
        reviewed.redrawing.push(it.name);
      }
      // What was drawn from a corrected moment follows it, where the correction touches what it
      // took: those wait for the new version and are drawn again; the rest are kept.
      const cuts = wrong.filter((i) => i.kind === 'cut');
      if (cuts.length) {
        const follow = await this.followCorrections(s, cuts, text);
        for (const it of follow) reviewed.redrawing.push(`${it.name} (it follows from ${it.redrawBecause})`);
        if (follow.length)
          notes.push({
            goalId: 'continuity',
            reason: `redrawing what follows: ${follow.map((i) => i.id).join(', ')}`,
            attempted: 0,
          });
      }
    }
    // A verdict can be what a later moment was waiting for: it is drawn now.
    if (s.phase === 'frames' && s.build?.frames?.some((f) => f.status === 'waiting')) await this.fillFrames(s, turnNow);
    const settled = !!s.build && s.build.items.every(isSettled);
    const framesSettled = !!s.build?.frames?.length && s.build.frames.every(isSettled);

    let followStreak = 0;
    for (let i = s.turns.length - 1; i >= 0 && isFollowing(s.turns[i].move); i--) followStreak++;
    const forgot = s.phase === 'listen' && (overlaid.signals.recall_spent ?? 0) >= 0.5;
    let forgotStreak = forgot ? 1 : 0;
    for (let i = s.turns.length - 1; forgot && i >= 0 && s.turns[i].forgot; i--) forgotStreak++;
    const adds = overlaid.signals.adds_story;
    const dry = s.phase === 'listen' && adds !== null && adds !== undefined && adds < 0.5;
    let dryStreak = dry ? 1 : 0;
    for (let i = s.turns.length - 1; dry && i >= 0 && s.turns[i].dry; i--) dryStreak++;
    const { move, rule } = selectMove(overlaid, this.cfg, {
      phase: s.phase,
      askCounts: s.askCounts,
      listenTurns: turnNow,
      retells: s.retells,
      followStreak,
      forgotStreak,
      dryStreak,
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
      // Their own way of drawing it keeps to technique too, as the proposed ones were made to.
      if (move.styleId === 'own' && s.style && b)
        s.style = (await cleanStyles({ ...b, style_options: [s.style] }, this.deps.jev)).breakdown.style_options[0];
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
      const first = items.find((i) => i.ask) ?? items[0];
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
        // What isn't asked about goes with the first profile settled: drawn from what was said.
        const things = s.build.items.filter((i) => !i.ask && i.status === 'waiting');
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
    // How far the moments have got, whenever they are being drawn: leaving included.
    if (s.build?.frames?.length && (move.kind === 'frames_drawing' || move.kind === 'wrap')) {
      const moments = s.build.frames.filter((i) => i.kind === 'cut');
      extras.frameCount = moments.length;
      extras.drawnCount = moments.filter((i) => i.status === 'ready').length;
    }
    if (s.build && (move.kind === 'frames_drawing' || move.kind === 'all_done')) {
      extras.approved = reviewed.approved;
      extras.redrawing = reviewed.redrawing;
      extras.kept = reviewed.kept;
      const moments = (s.build.frames ?? []).filter((i) => i.kind === 'cut');
      extras.frameCount = moments.length;
      extras.failed = moments.filter((i) => i.status === 'failed').map((i) => i.name);
      // Moments on show that what follows is waiting on: the person's verdict lets it go on.
      extras.waitsOnThem = moments
        .filter(
          (i) =>
            i.status === 'ready' &&
            !i.review &&
            !i.continuityApproved &&
            (s.build?.frames ?? []).some((d) => d.status === 'waiting' && d.needs?.includes(i.id)),
        )
        .map((i) => i.name);
      if (move.kind === 'frames_drawing') {
        const fresh = moments.filter((i) => i.status === 'ready' && !i.announced);
        const key = fresh.find((i) => i.frame?.key);
        if (key) extras.keyReady = key.fields.action?.value ?? key.name;
        extras.finished = fresh.filter((i) => i !== key).map((i) => i.name);
        for (const i of fresh) i.announced = true;
      }
    }
    if (s.build && (move.kind === 'while_drawing' || move.kind === 'sheets_done' || move.kind === 'ask_which')) {
      extras.approved = reviewed.approved;
      extras.redrawing = reviewed.redrawing;
      extras.kept = reviewed.kept;
      extras.shown = pending.map((i) => i.name);
      if (move.kind === 'while_drawing') {
        const fresh = s.build.items.filter((i) => i.status === 'ready' && !i.announced);
        extras.finished = fresh.map((i) => i.name);
        for (const i of fresh) i.announced = true;
        // A sketch the gate is unsure of is not drawn on a guess: they are asked how it looks.
        const held = s.build.items.filter((i) => i.held && i.status === 'waiting');
        const ask = held.filter((i) => (i.heldAsks ?? 0) < 2);
        extras.held = ask.map((i) => (i.isDreamer ? 'you' : i.name));
        for (const i of ask) i.heldAsks = (i.heldAsks ?? 0) + 1;
        // Asked twice and still unsure: left undrawn, and said so.
        for (const i of held.filter((x) => (x.heldAsks ?? 0) >= 2 && !ask.includes(x)))
          Object.assign(i, { status: 'failed', error: `not drawn: still unsure how it looks (${(i.held ?? []).join('; ')})` });
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
        forgot: forgot || undefined,
        dry: dry || undefined,
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

  /** The next profile to show. What isn't asked about is sketched without its own question. */
  private nextItem(b: Build): Item | undefined {
    const at = b.items.findIndex((i) => i.id === b.current);
    return b.items.slice(at + 1).find((i) => i.status === 'waiting' && i.ask);
  }

  /**
   * Begin the moments. The continuity plan decides what each is drawn from; the moments and the
   * ghosts they need are then drawn in its order, each as soon as what it needs is in. Their
   * verdicts on the sheets must be recorded first, because only approved sheets are references.
   */
  private async startFrames(s: Session, turn: number): Promise<void> {
    if (!s.build || !s.draft?.breakdown) return;
    // What each moment shows, completed from its words, for a dream drafted before this was done.
    completeViews(s.draft.breakdown);
    await Promise.all(
      [...this.reviews.entries()].filter(([k]) => k.startsWith(`${s.id}:`)).map(([, p]) => p.catch(() => undefined)),
    );
    const ids = s.production?.result?.ids ?? {};
    const plan = planContinuity(s.draft.breakdown);
    s.build.plan = plan;
    const pictures = new Map(
      [
        ...buildFrames(s.draft.breakdown, plan).map((f) => ({ ...f, nodeId: ids[f.id] })),
        // A ghost is drawn on the asset it shows, covering the requirement planned there.
        ...buildGhosts(plan).map((g) => ({ ...g, nodeId: ids[g.ghost?.of ?? ''], requirementId: ids[g.id] })),
      ].map((i) => [i.id, i as Item]),
    );
    s.build.frames = drawOrder(plan)
      .map((id) => pictures.get(id))
      .filter((i): i is Item => !!i);
    await this.fillFrames(s, turn);
  }

  /**
   * Start what can be drawn, in plan order, until as many are drawing as may be at once. A
   * picture waits until everything it needs is drawn; a need that failed is dropped. Each need
   * is approved for continuity first: Strawberry draws a moment from another only once that one
   * is approved and selected.
   */
  private async fillFrames(s: Session, turn: number): Promise<void> {
    const frames = s.build?.frames ?? [];
    for (const f of frames) {
      if (frames.filter((x) => x.status === 'drawing').length >= FRAMES_AT_ONCE) break;
      if (f.status !== 'waiting' || f.held) continue;
      const needs = (f.needs ?? []).map((id) => frames.find((x) => x.id === id)).filter((x): x is Item => !!x);
      if (needs.some((n) => n.status !== 'ready' && n.status !== 'failed')) continue;
      let approvedAll = true;
      for (const n of needs.filter((x) => x.status === 'ready')) {
        if (n.kind === 'ghost') await this.approveGhost(s, n);
        else if (n.review) {
          // Their own verdict approved it; it must be on record before anything is drawn from it.
          await this.reviews.get(`${s.id}:${n.id}`)?.catch(() => undefined);
          n.continuityApproved = true;
        }
        if (!n.continuityApproved) approvedAll = false;
      }
      if (!approvedAll) continue;
      f.dropped = needs.filter((n) => n.status === 'failed').map((n) => n.id);
      if (f.kind === 'ghost') await this.startGhost(s, f, turn);
      else await this.startFrame(s, f, turn);
    }
  }

  /**
   * A ghost is approved by the chat as soon as a moment needs it: it is a reference, never part
   * of the dream, and its take covers the requirement planned on its asset. It is never
   * selected, so the sheet stays the asset's reference.
   */
  private async approveGhost(s: Session, n: Item): Promise<void> {
    if (n.continuityApproved) return;
    const users = (s.build?.frames ?? []).filter((x) => x.needs?.includes(n.id)).map((x) => x.name);
    if (this.deps.sheets && n.mediaId && n.nodeId)
      try {
        await this.deps.sheets.review({
          mediaId: n.mediaId,
          nodeId: n.nodeId,
          approved: true,
          author: 'assistant',
          decision: `An in-between reference, approved by the chat for continuity: ${n.ghost?.why ?? ''}. Used by: ${users.join('; ')}.`,
          depicted: [n.nodeId],
          requirementIds: n.requirementId ? [n.requirementId] : [],
          select: false,
        });
      } catch (e) {
        n.error = `approving it for continuity failed: ${String(e).slice(0, 200)}`;
      }
    n.continuityApproved = true;
    n.review = 'approved';
  }

  /**
   * Approve a moment so later moments can be drawn from it, before the person has seen it: only
   * on the judge's evidence that everyone and everything in it is there (Strawberry counts a
   * non-human approval of a moment only where its facts record shows each asset). Otherwise, or
   * without a judge, what follows waits for the person's own verdict.
   */
  private async vouch(s: Session, n: Item): Promise<void> {
    if (n.review || n.continuityApproved || n.kind !== 'cut' || !n.mediaId || !n.nodeId) return;
    const users = (s.build?.frames ?? []).filter((x) => x.needs?.includes(n.id));
    if (!users.length) return;
    const c = n.check;
    if (!c || c.error || c.unseen?.length) {
      n.waitsForPerson = c?.unseen?.length
        ? `the judge could not see ${c.unseen.join('; ')}`
        : c?.error
          ? 'the judge is unavailable'
          : 'no judge here';
      return;
    }
    // A take the judge still finds wrong after its one repair is theirs to see, never a source: what
    // is drawn from it keeps what is wrong with it.
    const { serious } = this.seriousFailures(n, s.style);
    if (serious.length) {
      n.waitsForPerson = `the judge found: ${serious.join('; ').slice(0, 300)}`;
      return;
    }
    if (!this.deps.sheets) return;
    try {
      await this.deps.sheets.review({
        mediaId: n.mediaId,
        nodeId: n.nodeId,
        approved: true,
        author: 'assistant',
        decision: `Approved by the chat as the continuity source for: ${users.map((x) => x.name).join('; ')}. The judge saw everything in it (${c.passed} of ${c.questions} declared facts); the person has not seen it yet, and their verdict stands above this.`,
        depicted: n.depicted ?? [],
      });
      n.continuityApproved = true;
      n.waitsForPerson = undefined;
    } catch (e) {
      n.waitsForPerson = `approving it for continuity failed: ${String(e).slice(0, 160)}`;
    }
  }

  /** The earlier pictures the plan draws this moment from, that are drawn and usable. */
  private plannedInputs(s: Session, frame: Item): PlannedInput[] {
    const frames = s.build?.frames ?? [];
    return (frame.frame?.plan?.refs ?? [])
      .map((use) => ({ use, item: frames.find((x) => x.id === use.id) }))
      .filter((x): x is PlannedInput => !!x.item && x.item.status === 'ready' && !!x.item.mediaId);
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
    // A moment still telling the dreamer "you" is put in the third person before anything else: to a
    // picture "you" is whoever looks at it (older drafts, and words a rewording left behind).
    const WORDS = ['action', 'visual_point', 'feeling', 'purpose', 'shift', 'dream'];
    if (this.deps.reword && WORDS.some((k) => /\byou(r|rs|rself)?\b/i.test(frame.fields[k]?.value ?? ''))) {
      const probe = framePrompt(frame, s.build.items, s.style, this.plannedInputs(s, frame));
      const fields = await this.deps
        .reword(probe.prompt, ['its words call the dreamer "you": put every one of them in the third person'], frame.fields)
        .catch(() => null);
      if (fields) {
        const changed = Object.keys(fields).filter((k) => fields[k]?.value !== frame.fields[k]?.value);
        frame.reworded = [...new Set([...(frame.reworded ?? []), ...changed])];
        frame.fields = fields;
        await this.keepWords(s, frame);
      }
    }
    let built = framePrompt(frame, s.build.items, s.style, this.plannedInputs(s, frame));
    const inView = inViewOf(frame, s.build.items);
    let findings = await this.gateFindings(s, frame, built.prompt, built.references, inView);
    // What only its words got wrong is put right in words first, and read again: twice at most.
    for (let pass = 0; pass < 2; pass++) {
      if (!findings.length || !this.deps.reword || !findings.every((f) => WORDING.test(f))) break;
      const people = s.draft?.breakdown?.people ?? [];
      const named = (p: (typeof people)[number]) => (p.is_dreamer ? 'the dreamer' : pictureName(p.name));
      const cast = {
        in: people.filter((p) => frame.frame?.visible.includes(p.id)).map(named),
        out: people.filter((p) => !frame.frame?.visible.includes(p.id)).map(named),
      };
      const fields = await this.deps.reword(built.prompt, findings, frame.fields, cast).catch(() => null);
      if (!fields) break;
      const changed = Object.keys(fields).filter((k) => fields[k]?.value !== frame.fields[k]?.value);
      frame.reworded = [...new Set([...(frame.reworded ?? []), ...changed])];
      frame.fields = fields;
      await this.keepWords(s, frame);
      built = framePrompt(frame, s.build.items, s.style, this.plannedInputs(s, frame));
      findings = await this.gateFindings(s, frame, built.prompt, built.references, inView);
    }
    if (findings.length) {
      Object.assign(frame, { status: 'waiting', held: findings });
      return;
    }
    frame.held = undefined;
    const { prompt, references, depicted } = built;
    const changes: Record<string, string> = {};
    if (before)
      for (const [k, d] of Object.entries(frame.fields))
        if (d.value && d.value !== before[k]?.value)
          changes[k === 'feeling' ? 'beat.emotional_intent' : k === 'visual_point' ? 'beat.visual_point' : k] = d.value;
    frame.depicted = depicted;
    frame.continuity = undefined;
    await this.launch(s, frame, {
      prompt,
      references,
      changes,
      record: this.recordOf(s, frame),
      reason: `The person asked to see their dream drawn and settled everything in it; approved within the ${IMAGE_CAP}-picture limit.`,
    });
  }

  /**
   * The confidence gate, before anything is paid for: code checks what it can know (someone drawn
   * twice, a plan finding for this picture, an image attached with no word on what it is for, an
   * edit base out of place, an unapproved or missing sketch) and Jev reads the prompt itself. A
   * picture with any finding is held with the reasons and stays waiting; what depends on it
   * waits too. True when held.
   */
  private async hold(
    s: Session,
    item: Item,
    prompt: string,
    references: { media_id: string; role: string }[],
    inView: Item[],
  ): Promise<boolean> {
    const findings = await this.gateFindings(s, item, prompt, references, inView);
    if (!findings.length) {
      item.held = undefined;
      return false;
    }
    Object.assign(item, { status: 'waiting', held: findings });
    return true;
  }

  /**
   * The flaw they point at in a picture, said as an instruction for its redraw, or null when they
   * only feel something is off.
   */
  private async namedFlaw(text: string, name: string): Promise<string | null> {
    const call = await this.deps.jev(text, {
      named: {
        type: 'noul',
        instructions: `The person was shown a picture of ${name} from their dream. In this message, "${text.slice(0, 300)}", do they name something specific that is wrong with it (something missing or extra, or the wrong colour, shape, size, age, clothes or look), rather than only a feeling that it is off?`,
        criteria: {
          true: 'they point at something specific to change',
          false: "only a vague feeling, or that they can't say what",
        },
      },
    });
    const a = call.answers?.named;
    // No reading, no dropping their correction: only a clear "just a feeling" keeps the picture.
    if (a && a.type === 'noul' && a.noul < 0.5) return null;
    return 'put right what they said is wrong';
  }

  private async gateFindings(
    s: Session,
    item: Item,
    prompt: string,
    references: { media_id: string; role: string }[],
    inView: Item[],
  ): Promise<string[]> {
    if (!this.deps.gate) return [];
    const order = item.frame?.order;
    const issues =
      order && s.draft?.breakdown
        ? planContinuity(s.draft.breakdown).issues.filter(
            (x) => x.startsWith(`picture ${order} `) || x.startsWith(`picture ${order}:`),
          )
        : [];
    const approved = new Set(
      [...(s.build?.items ?? []), ...(s.build?.frames ?? [])]
        .filter((i) => i.status === 'ready' && i.mediaId && (i.kind === 'ghost' || i.review || i.continuityApproved))
        .map((i) => i.mediaId as string),
    );
    const fixed = [
      ...preflight(inView, issues),
      ...checkReferences(prompt, references, {
        approved,
        mustInclude: inView
          .filter((x) => x.mediaId && x.status === 'ready')
          .map((x) => ({ name: x.name, mediaId: x.mediaId as string })),
      }),
    ];
    const sheet = item.kind === 'character' || item.kind === 'location' || item.kind === 'prop';
    const read = await readPrompt(this.deps.gate, prompt, {
      sheet,
      kind: sheet ? (item.kind as 'character' | 'location' | 'prop') : undefined,
      edit: item.kind === 'ghost',
    });
    if (read.reading) item.gate = read.reading;
    return [...fixed, ...read.findings];
  }

  /**
   * The continuity plan made again for every moment not yet approved: after a correction that
   * changes who is in a moment, or with a planner fixed since. An approved moment keeps the plan
   * it was drawn from; a plan that needs a picture this dream never planned is left as it was.
   */
  /**
   * A moment's words as reworded become the dream's own, as a correction of who is in it does, so
   * everything planned from them reads as the picture does: a jump's check still told the judge
   * "you are on top of it" after the moment itself was put in the third person (24 Sep).
   */
  private async keepWords(s: Session, frame: Item): Promise<void> {
    for (const sc of s.draft?.breakdown?.scenes ?? [])
      for (const m of sc.moments)
        if (m.id === frame.id)
          for (const k of ['action', 'visual_point', 'feeling', 'purpose', 'shift', 'dream'] as const) {
            const v = frame.fields[k]?.value;
            if (typeof v === 'string' && v.trim()) m[k] = v;
          }
    await this.replan(s);
  }

  private async replan(s: Session, opts: { syncRecords?: boolean } = {}): Promise<void> {
    if (!s.build?.frames || !s.draft?.breakdown) return;
    const plan = planContinuity(s.draft.breakdown);
    const known = new Set(s.build.frames.map((f) => f.id));
    for (const f of s.build.frames) {
      const next = plan.cuts.find((c) => c.id === f.id);
      if (f.kind !== 'cut' || !f.frame || !next || f.review || f.continuityApproved) continue;
      if (![...next.needs, ...next.refs.map((r) => r.id)].every((n) => known.has(n))) continue;
      f.frame.plan = next;
      f.needs = next.needs;
      const record = this.recordOf(s, f);
      if (opts.syncRecords && f.nodeId && record && f.status !== 'waiting')
        await this.deps.sheets?.record?.(f.nodeId, record);
    }
  }

  /**
   * Who a correction takes out of a moment or puts into it: "the conductor isn't in it, it's just
   * me" left him cast, and the redraw was told both (24 Sep).
   */
  private async castChanges(s: Session, frame: Item, text: string): Promise<{ out: string[]; in: string[] }> {
    const b = s.draft?.breakdown;
    const f = frame.frame;
    if (!b || !f) return { out: [], in: [] };
    const action = frame.fields.action?.value ?? frame.name;
    const name = (p: Breakdown['people'][number]) => (p.is_dreamer ? 'the dreamer (the person telling the dream)' : p.name);
    const questions: Record<string, Question> = {};
    for (const p of b.people)
      questions[`${f.visible.includes(p.id) ? 'out' : 'in'}_${p.id}`] = {
        type: 'noul',
        instructions: f.visible.includes(p.id)
          ? `The person corrected a picture of their dream showing "${action}": "${text.slice(0, 300)}". Do they say ${name(p)} should not be in this picture?`
          : `The person corrected a picture of their dream showing "${action}": "${text.slice(0, 300)}". Do they say ${name(p)} should be in this picture too?`,
        criteria: { true: 'they say so', false: 'they do not say so' },
      };
    if (!Object.keys(questions).length) return { out: [], in: [] };
    const call = await this.deps.jev(text, questions);
    const yes = (k: string) => {
      const a = call.answers?.[k];
      return !!a && a.type === 'noul' && a.noul >= 0.7;
    };
    return {
      out: b.people.filter((p) => f.visible.includes(p.id) && yes(`out_${p.id}`)).map((p) => p.id),
      in: b.people.filter((p) => !f.visible.includes(p.id) && yes(`in_${p.id}`)).map((p) => p.id),
    };
  }

  /**
   * The cut's record as its plan says; a source that failed is left out of it as well as its
   * references.
   */
  private recordOf(s: Session, frame: Item): CutRecord | undefined {
    const ids = s.production?.result?.ids ?? {};
    const plan = frame.frame?.plan;
    if (!plan || !ids.proposal) return undefined;
    const failedCuts = (frame.dropped ?? []).filter((d) => s.build?.frames?.find((x) => x.id === d)?.kind === 'cut');
    // The moment's words as it is drawn go on record, so the judge checks the moment as drawn:
    // only what differs is written, and a person's correction is written first, with its source.
    // Sent only when marked reworded, words a resume unmarked stayed "you" on record (24 Sep).
    const ENGINE: Record<string, string> = {
      action: 'action',
      visual_point: 'beat.visual_point',
      feeling: 'beat.emotional_intent',
      purpose: 'beat.purpose',
    };
    // (The jump and the dream's strangeness are the picture's words only; Strawberry keeps the shift
    // as the moment's own record, unchanged.)
    const words = Object.fromEntries(
      Object.keys(ENGINE)
        .filter((k) => frame.fields[k]?.value)
        .map((k) => [ENGINE[k], frame.fields[k].value as string]),
    );
    // Who is in it, as it is drawn: a correction can take someone out or put someone in.
    const dreamerId = s.draft?.breakdown?.people.find((p) => p.is_dreamer)?.id;
    const cast = frame.frame
      ? { visible_cast: seenIn(frame.frame, dreamerId).map((p) => ids[p]).filter((x): x is string => !!x) }
      : {};
    return {
      fields: { ...cutRecord(plan, ids, failedCuts), ...cast, ...words },
      source: ids.proposal,
      reason: failedCuts.length
        ? `Drawn without ${failedCuts.map((d) => s.build?.frames?.find((x) => x.id === d)?.name ?? d).join(', ')}, which could not be drawn`
        : frame.reworded?.some((k) => ENGINE[k])
          ? 'Reworded before it was drawn, so its instructions agree'
          : 'The continuity this moment is drawn with',
    };
  }

  /** Start one ghost: an edit of its asset's approved sheet, never shown as part of the dream. */
  private async startGhost(s: Session, ghost: Item, turn: number): Promise<void> {
    ghost.startedAtTurn = turn;
    const g = ghost.ghost;
    const sheet = s.build?.items.find((i) => i.id === g?.of);
    const fail = (error: string) => Object.assign(ghost, { status: 'failed', error });
    if (!this.deps.sheets || !s.style || !s.build || !g)
      return void fail('nothing can be drawn here: the Strawberry engine is not set up');
    if (s.images >= IMAGE_CAP) return void fail(`the ${IMAGE_CAP}-picture limit for one dream is reached`);
    if (!sheet || sheet.status !== 'ready' || !sheet.mediaId || !ghost.nodeId)
      return void fail(`${sheet?.name ?? g.of} has no approved sheet to edit`);
    const from = g.from ? s.build.frames?.find((x) => x.id === g.from && x.status === 'ready') : undefined;
    // A change that goes on changing is edited from its last look, one change at a time.
    const previous = g.after ? s.build.frames?.find((x) => x.id === g.after && x.status === 'ready') : undefined;
    const { prompt, references, depicted } = ghostPrompt(ghost, sheet, from, s.style, previous);
    if (await this.hold(s, ghost, prompt, references, [])) return;
    ghost.depicted = depicted;
    await this.launch(s, ghost, {
      prompt,
      references,
      shape: shapeOf(sheet),
      intent: `Ghost reference: ${ghost.name}`,
      reason: `An in-between reference the storyboard needs for continuity (${g.why}); approved within the ${IMAGE_CAP}-picture limit.`,
    });
  }

  /** Prepare, approve and queue a moment or a ghost; the engine's answer comes back through the queue. */
  private async launch(
    s: Session,
    item: Item,
    job: {
      prompt: string;
      references: FrameReference[];
      changes?: Record<string, string>;
      reason: string;
      intent?: string;
      record?: CutRecord;
      shape?: Shape;
    },
  ): Promise<void> {
    item.status = 'drawing';
    item.version += 1;
    // A new version starts clean: an error belonged to the one before.
    item.error = undefined;
    // The last job is finished: the watch must not read it back as this version's result before
    // the new job's id arrives (a repaired moment was marked ready with its old take, 23 Sep).
    item.jobId = undefined;
    item.recipeId = undefined;
    s.images += 1;
    const snapshot = structuredClone(item);
    // A deps check above already failed the picture if the engine is missing.
    const sheets = this.deps.sheets as SheetEngine;
    sheets
      .startFrame({
        item: snapshot,
        prompt: job.prompt,
        references: job.references,
        changes: job.changes,
        source: s.production?.result?.ids.said,
        reason: job.reason,
        maxUsd: MAX_PER_IMAGE,
        intent: job.intent,
        record: job.record,
        shape: job.shape,
      })
      .then(
        (r) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.frames?.find((i) => i.id === item.id);
              if (!it) return;
              it.jobId = r.jobId;
              it.recipeId = r.recipeId;
              spend(x, r.usd);
            }),
          ).then(() => this.watch(s.id)),
        (e) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.frames?.find((i) => i.id === item.id);
              if (it) Object.assign(it, { status: 'failed', error: String(e).slice(0, 300) });
            }),
          ),
      );
  }

  /**
   * The person corrected some moments. Every picture drawn from them, directly or through
   * another, is checked: does the correction touch what it took from them (the room, a changed
   * look, the framing)? Jev decides; those wait for the new version and are drawn again, and the
   * rest are kept. Returns the ones that will be redrawn.
   */
  private async followCorrections(s: Session, corrected: Item[], text: string): Promise<Item[]> {
    const frames = s.build?.frames ?? [];
    const reach = new Map<string, Item>();
    const walk = (id: string, root: Item) => {
      for (const d of frames)
        if (d.needs?.includes(id) && !reach.has(d.id) && !corrected.includes(d)) {
          reach.set(d.id, root);
          walk(d.id, root);
        }
    };
    for (const c of corrected) walk(c.id, c);
    const drawn = [...reach.keys()]
      .map((id) => frames.find((x) => x.id === id))
      .filter((d): d is Item => !!d && (d.status === 'ready' || d.status === 'drawing'));
    if (!drawn.length) return [];
    const describe = (i: Item) =>
      i.kind === 'ghost'
        ? `an in-between reference showing ${i.name}`
        : `picture ${i.frame?.order} (${i.fields.action?.value ?? i.name})`;
    const questions: Record<string, Question> = {};
    for (const d of drawn) {
      const root = reach.get(d.id) as Item;
      const took = [...(d.frame?.plan?.refs ?? []).map((r) => r.carries), ...(d.ghost ? [d.ghost.change] : [])].join(
        '; ',
      );
      questions[`touches_${d.id}`] = {
        type: 'noul',
        instructions: `In a storyboard of their dream, the person corrected ${describe(root)}: "${text.slice(0, 400)}". ${describe(d)} was drawn from it, directly or through other pictures, taking: ${took || 'how things look'}. Would their correction also be wrong in it, so it has to be drawn again to match?`,
        criteria: {
          true: 'the correction is about something it took from the corrected picture, so it would now disagree',
          false: 'the correction is about something it does not show or did not take, so it can stay',
        },
      };
    }
    const call = await this.deps.jev(renderTranscript(s.transcript), questions);
    const follow: Item[] = [];
    for (const d of drawn) {
      const a = call.answers?.[`touches_${d.id}`];
      if (!a || a.type !== 'noul' || a.noul < 0.5) continue;
      const root = reach.get(d.id) as Item;
      // A picture still drawing is redrawn after it lands; one already drawn waits for its source.
      Object.assign(d, {
        status: d.status === 'drawing' ? d.status : 'waiting',
        stale: d.status === 'drawing',
        announced: false,
        review: undefined,
        continuityApproved: false,
        redrawBecause: root.name,
      });
      follow.push(d);
    }
    return follow;
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
    // A new version starts clean: an error belonged to the one before.
    item.error = undefined;
    // As for a moment: the watch waits for this version's own job.
    item.jobId = undefined;
    item.recipeId = undefined;
    s.images += 1;
    const snapshot = structuredClone(item);
    const style = s.style;
    const sheets = this.deps.sheets;
    // A person nobody described gets words for their look first, as our guesses, so every
    // picture of them carries the same look in words as well as in the image.
    const vague = (k: string) => {
      const d = item.fields[k];
      return !d?.value || (!d.said && VAGUE.test(d.value));
    };
    // Either half of a look left open is filled: "a young woman" with no clothes named was drawn in
    // whatever came to hand, and every moment had to guess again (23 Sep). A place or thing with no
    // description at all gets one too: "the lever" was drawn from its name alone (24 Sep).
    const kind = item.kind === 'location' || item.kind === 'prop' ? item.kind : 'character';
    const unknown =
      !!this.deps.proposeLook &&
      (item.kind === 'character'
        ? vague('appearance') || vague('wardrobe')
        : (item.kind === 'location' || item.kind === 'prop') && LOOK[item.kind].every(vague));
    const others =
      item.kind === 'character'
        ? (s.build?.items ?? [])
            .filter((i) => i.kind === 'character' && i.id !== item.id)
            .map((i) => (i.isDreamer ? 'the dreamer' : i.name))
        : [];
    const looked = unknown
      ? this.deps.proposeLook!(item.name, item.fields, renderTranscript(s.transcript), others, kind)
          .catch(() => item.fields)
          .then((fields) => (snapshot.fields = fields))
      : Promise.resolve(null);
    looked
      .then(async () => {
        // The gate, before the sketch is paid for.
        let findings = await this.gateFindings(s, snapshot, sheetPrompt(snapshot, style), [], []);
        // A look it is unsure of is reworded, described as a look only and filled where it is thin,
        // before anyone is asked, and read again; what they said keeps its meaning.
        if (findings.length && this.deps.rewordLook) {
          const fields = await this.deps
            .rewordLook(
              item.name,
              kind,
              snapshot.fields,
              sheetPrompt(snapshot, style),
              findings,
              renderTranscript(s.transcript),
            )
            .catch(() => null);
          if (fields) {
            snapshot.fields = fields;
            findings = await this.gateFindings(s, snapshot, sheetPrompt(snapshot, style), [], []);
          }
        }
        if (findings.length) throw new Held(findings);
        return sheets.start({
          item: snapshot,
          style,
          sources: { said: ids.said, proposal: ids.proposal },
          reason: `The person asked to see their dream drawn and settled this profile in conversation; approved within the ${IMAGE_CAP}-picture limit.`,
          maxUsd: MAX_PER_IMAGE,
        });
      })
      .then(
        (r) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.items.find((i) => i.id === item.id);
              if (!it) return;
              it.jobId = r.jobId;
              it.recipeId = r.recipeId;
              // The words it was drawn from, proposed or reworded on the way, are its words now:
              // the conductor was drawn from a full look and kept as "adult; uniform" (24 Sep).
              it.fields = snapshot.fields;
              it.gate = snapshot.gate;
              it.held = undefined;
              spend(x, r.usd);
            }),
          ).then(() => this.watch(s.id)),
        (e) =>
          this.serial(s.id, () =>
            this.update(s.id, (x) => {
              const it = x.build?.items.find((i) => i.id === item.id);
              if (!it) return;
              if (e instanceof Held) {
                // Held, not drawn: nothing was started, counted or paid for.
                // What was proposed for it is kept: asked about next, it starts from there.
                Object.assign(it, {
                  status: 'waiting',
                  held: e.findings,
                  version: Math.max(0, it.version - 1),
                  gate: snapshot.gate,
                  fields: snapshot.fields,
                });
                x.images = Math.max(0, x.images - 1);
              } else Object.assign(it, { status: 'failed', error: String(e).slice(0, 300) });
            }),
          ),
      );
  }

  /**
   * Record their verdict on a sketch's current take in Strawberry. Approved and left takes become
   * the item's reference; a rejected one stays on record as rejected. Runs in the background;
   * a failure is noted on the item.
   */
  private reviewSketch(
    s: Session,
    item: Item,
    verdict: 'approved' | 'left' | 'rejected',
    decision: string,
    author: 'human' | 'assistant' = 'human',
  ): void {
    if (verdict !== 'rejected') item.review = verdict;
    if (!this.deps.sheets || !item.mediaId || !item.nodeId) return;
    const done = this.deps.sheets
      .review({
        mediaId: item.mediaId,
        nodeId: item.nodeId,
        approved: verdict !== 'rejected',
        decision,
        author,
        depicted: item.kind === 'cut' ? (item.depicted ?? []) : [item.nodeId],
      })
      .catch((e) =>
        this.serial(s.id, () =>
          this.update(s.id, (x) => {
            // A verdict on a take that has since been redrawn fails harmlessly: the redraw moved
            // the production on. Only a failure on the take still shown is theirs to know.
            const it = [...(x.build?.items ?? []), ...(x.build?.frames ?? [])].find((i) => i.id === item.id);
            if (it && it.mediaId === item.mediaId) it.error = `recording their verdict failed: ${String(e).slice(0, 200)}`;
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
                    // Drawn from a version the person has since corrected: drawn again from the new one.
                    status: cur.stale ? 'waiting' : 'ready',
                    stale: undefined,
                    mediaId: st.mediaId,
                    mediaPath: st.mediaPath,
                    check: undefined,
                    // What went wrong with the take before this one is history now: carried on, a
                    // later redraw was told "last time her hair was auburn" of a take two back (24 Sep).
                    repairFor: undefined,
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
    // A moment is also checked against the pictures it was drawn from: the same room, the same
    // people, the change still there.
    const media = (ref: string) =>
      ref.startsWith('sheet:')
        ? b?.items.find((i) => i.id === ref.slice(6) && i.status === 'ready')?.mediaId
        : b?.frames?.find((f) => f.id === ref)?.mediaId;
    const checks = (it.frame?.plan?.criteria ?? [])
      .map((c) => ({ with: c.with ? (media(c.with) ?? '') : null, text: c.text }))
      .filter((c) => c.with !== '');
    let check: JudgedCheck | null;
    try {
      // A moment's check is its facts record: what the chat approves it for continuity on.
      // Sheets are judged too: every picture drawn later takes its people, places and things from them.
      check = await judge(mediaId, {
        facts: it.kind !== 'ghost',
        continuity: it.kind === 'cut' ? checks : [],
        // The dreamer's own hands in a moment seen through their eyes are theirs, not invented.
        note:
          it.frame?.eyes === 'dreamer'
            ? "Seen through the dreamer's own eyes: the camera is the dreamer, and their own hands, arms or feet may show; they are declared, not an extra person."
            : undefined,
      });
    } catch (e) {
      check = { questions: 0, passed: 0, failed: [], error: String(e).slice(0, 200) };
    }
    if (!check) return;
    const answered = check;
    await this.serial(id, async () => {
      const x = structuredClone(this.require(id));
      const cur = [...(x.build?.items ?? []), ...(x.build?.frames ?? [])].find((i) => i.id === itemId);
      if (!cur || cur.mediaId !== mediaId) return;
      const { continuity, ...facts } = answered;
      cur.check = facts;
      if (continuity) cur.continuity = continuity;
      if (cur.kind === 'cut') {
        if (!(await this.repair(x, cur))) await this.vouch(x, cur);
        await this.fillFrames(x, x.turns.at(-1)?.turn ?? 0);
      } else if (cur.kind !== 'ghost') await this.repairSheet(x, cur);
      await this.save(x);
    });
    if (this.sessions.get(id)?.build?.frames?.some((f) => f.status === 'drawing')) this.watch(id);
    // A judge that sees one image at a time is asked about continuity on its own.
    if (answered.continuity || !this.deps.judgeContinuity || it.kind !== 'cut' || !checks.length) return;
    let continuity: Check;
    try {
      continuity = await this.deps.judgeContinuity(mediaId, checks);
    } catch (e) {
      continuity = { questions: 0, passed: 0, failed: [], error: String(e).slice(0, 200) };
    }
    await this.serial(id, () =>
      this.update(id, (x) => {
        const cur = x.build?.frames?.find((i) => i.id === itemId);
        if (cur && cur.mediaId === mediaId) cur.continuity = continuity;
      }),
    );
  }

  /**
   * One repair per moment. When the judge finds someone or something missing, a changed look not
   * carried, or a person or room not matching what the moment was drawn from, the take is
   * rejected and the moment drawn once more with those failures as its correction, before the
   * person has had to point them out. A second failure is left for the person: never a loop.
   */
  /**
   * One repair per sheet, before anything is drawn from it: a sheet that shows more than its
   * subject (ice horse heads beside a woman, 23 Sep), the wrong clothes or features, or a broken
   * body would carry that into every moment it is attached to. A sheet the person has already
   * approved is theirs, and stays.
   */
  private async repairSheet(s: Session, it: Item): Promise<void> {
    const c = it.check;
    if (it.review || (it.repairs ?? 0) >= MAX_REPAIRS || !c || c.error) return;
    // A sketch's colours go into every moment it is in: in a style made in one colour, a colour of its
    // own is as wrong as the wrong clothes (a yellow onesie in a blue ink wash, 24 Sep).
    const SERIOUS = ['subject', 'wardrobe', 'features', 'pose', ...(s.style && oneColour(s.style) ? ['palette'] : [])];
    const at = c.failed.map((_, i) => i).filter((i) => SERIOUS.includes((c.failedIds?.[i] ?? '').split(':')[0]));
    const facts = at.map((i) => c.failed[i]);
    if (!facts.length) return;
    it.repairs = (it.repairs ?? 0) + 1;
    // Each correction says what was wrong last time, as the judge saw it: "only the dreamer" alone
    // redrew her behind the same frosted door (23 Sep).
    it.repairFor = at.map((i) => {
      const q = c.failed[i];
      const fix = /nothing else as the subject/.test(q)
        ? `only ${it.isDreamer ? 'the dreamer' : it.name} is in the picture, alone, clearly seen, on a plain ground`
        : asInstruction(q);
      const saw = c.notes?.[i];
      return saw ? `${fix} (last time: ${saw})` : fix;
    });
    this.reviewSketch(
      s,
      it,
      'rejected',
      `The judge found, before it was drawn from: ${facts.join(' | ').slice(0, 800)}`,
      'assistant',
    );
    it.announced = false;
    await this.startSketch(s, it, it.startedAtTurn ?? 0);
  }

  /**
   * What the judge found in a moment that later pictures must not inherit: who or what is missing,
   * a changed look not carried, the wrong clothes or features, a broken body, something invented
   * (a viewer's hands kept in one picture are kept by every edit of it, 23 Sep); and a person or
   * room that does not match what the moment follows.
   */
  private seriousFailures(it: Item, style?: StyleOption | null): { factAt: number[]; fixes: Criterion[]; serious: string[] } {
    const c = it.check;
    if (!c || c.error) return { factAt: [], fixes: [], serious: [] };
    // In one colour, a colour of its own is passed on to every picture drawn from it.
    const SERIOUS = [
      'cast',
      'location',
      'prop',
      'state',
      'wardrobe',
      'features',
      'pose',
      'undeclared',
      ...(style && oneColour(style) ? ['palette'] : []),
    ];
    const factAt = c.failed.map((_, i) => i).filter((i) => SERIOUS.includes((c.failedIds?.[i] ?? '').split(':')[0]));
    const fixes = (it.frame?.plan?.criteria ?? []).filter(
      (k) =>
        (it.continuity?.failed ?? []).includes(k.text) &&
        /same person|same side|same view|reference sheet|framing|made the same way|left to right/.test(k.text),
    );
    return { factAt, fixes, serious: [...factAt.map((i) => c.failed[i]), ...fixes.map((k) => k.text)] };
  }

  private async repair(s: Session, it: Item): Promise<boolean> {
    if (it.review || (it.repairs ?? 0) >= MAX_REPAIRS || !it.mediaId || !it.nodeId) return false;
    const c = it.check;
    if (!c || c.error) return false;
    const { factAt, fixes, serious } = this.seriousFailures(it, s.style);
    if (!serious.length) return false;
    it.repairs = (it.repairs ?? 0) + 1;
    // Said to the image model as instructions: a judge's question means nothing to it.
    it.repairFor = [
      ...factAt.map((i) => {
        const saw = c.notes?.[i];
        return saw ? `${asInstruction(c.failed[i])} (last time: ${saw})` : asInstruction(c.failed[i]);
      }),
      ...fixes.map((k) => {
        const saw = it.continuity?.notes?.[(it.continuity?.failed ?? []).indexOf(k.text)];
        return saw ? `${k.fix} (last time: ${saw})` : k.fix;
      }),
    ].slice(0, 6);
    this.reviewSketch(
      s,
      it,
      'rejected',
      `The judge found, before the person had to: ${serious.join(' | ').slice(0, 800)}`,
      'assistant',
    );
    it.announced = false;
    it.continuityApproved = false;
    await this.startFrame(s, it, it.startedAtTurn ?? 0);
    return true;
  }

  private async update(id: string, fn: (s: Session) => void): Promise<void> {
    const s = structuredClone(this.require(id));
    fn(s);
    await this.save(s);
  }

  /**
   * Draw again what failed before it was ever submitted: an approval refused, a provider out of
   * balance, an upload refused. Nothing was spent on those, so nothing paid is retried; a picture
   * that failed after its job was submitted stays failed for the person to decide, unless they
   * name it in `redraw`, having confirmed with the provider that it never ran (a submission cut
   * off by a 503 before Higgsfield answered, with no charge on the account, 23 Sep).
   */
  async resume(id: string, opts: { redraw?: string[] } = {}): Promise<string[]> {
    const again = await this.serial(id, async () => {
      const s = structuredClone(this.require(id));
      // Every moment not yet approved is planned again, so a fix to the planner reaches a dream
      // already under way; an approved one keeps the plan it was drawn from. A plan that needs a
      // picture this dream never planned is left as it was.
      // Its record follows, so the judge asks about what the moment should now show.
      await this.replan(s, { syncRecords: true });
      const again: string[] = [];
      // What was held is put through the gate again, with whatever has been put right since, and
      // may be reworded once more by the harness as it is now.
      const held = [...(s.build?.items ?? []), ...(s.build?.frames ?? [])].filter((i) => i.held);
      // What was reworded keeps saying so: its record carries the words it is drawn with.
      for (const it of held) Object.assign(it, { held: undefined });
      for (const it of held) if (it.kind !== 'cut' && it.kind !== 'ghost') again.push(it.id);
      for (const it of [...(s.build?.items ?? []), ...(s.build?.frames ?? [])])
        if (it.status === 'failed' && (!it.jobId || opts.redraw?.includes(it.id))) {
          it.jobId = undefined;
          again.push(it.id);
          Object.assign(it, { status: 'waiting', error: undefined, version: Math.max(0, it.version - 1) });
          // A picture's count was taken when it was started; it is taken again when it restarts.
          s.images = Math.max(0, s.images - 1);
        }
      const turn = s.turns.at(-1)?.turn ?? 0;
      for (const it of s.build?.items ?? []) if (again.includes(it.id)) await this.startSketch(s, it, turn);
      if (s.phase === 'frames' || s.phase === 'done') await this.fillFrames(s, turn);
      await this.save(s);
      if ([...(s.build?.items ?? []), ...(s.build?.frames ?? [])].some((i) => i.status === 'drawing')) this.watch(id);
      return again;
    });
    // A take that landed while nothing was running is looked at now.
    const s = this.require(id);
    for (const it of [...(s.build?.items ?? []), ...(s.build?.frames ?? [])])
      if (it.kind !== 'ghost' && it.status === 'ready' && it.mediaId && !it.check && !it.review)
        void this.judgeWhenReady(id, it.id);
    return again;
  }

  /** Wait for every background job this conversation has running. For tests and the simulator. */
  async settle(id: string, timeoutMs = 180_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await this.serial(id, async () => undefined);
      const s = this.sessions.get(id);
      // A moment waiting on a picture the person hasn't answered for yet is not going to start by
      // waiting: a simulated turn sat out the whole timeout for each of them.
      const frames = s?.build?.frames ?? [];
      const startable = (i: Item) =>
        (i.needs ?? []).every((n) => {
          const x = frames.find((y) => y.id === n);
          return !x || x.status === 'failed' || (x.status === 'ready' && (x.kind === 'ghost' || !!x.review || !!x.continuityApproved));
        });
      const drawing = [...(s?.build?.items ?? []), ...frames].some(
        (i) => i.status === 'drawing' || (i.status === 'waiting' && s?.phase === 'frames' && startable(i)),
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
