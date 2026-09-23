import { describe, expect, test } from 'bun:test';
import { dreamConfig } from '../dream';
import {
  initialState,
  LISTEN_TURN_LIMIT,
  MAX_RETELLS,
  type MoveContext,
  phaseAfter,
  renderBrief,
  selectMove,
  type State,
  type Thread,
} from '../lib';

const cfg = dreamConfig();
const required = cfg.goals.filter((g) => !g.optional).map((g) => g.id);

function state(over: {
  covered?: string[];
  unknown?: string[];
  finished?: number;
  verbosity?: State['rapport']['verbosity'];
  wants_out?: State['rapport']['wants_out'];
  threads?: Thread[];
  last_move?: string;
  retell_reply?: State['signals']['retell_reply'];
}): State {
  const s = initialState('t', cfg);
  for (const id of over.covered ?? []) s.goals[id] = { confidence: 0.9, evidence: `told ${id}` };
  for (const id of over.unknown ?? []) s.goals[id] = { confidence: 0.1, evidence: '', unknown: true };
  s.signals = { finished_telling: over.finished ?? 0, retell_reply: over.retell_reply ?? null };
  s.rapport = { ...s.rapport, verbosity: over.verbosity ?? 'neutral', wants_out: over.wants_out ?? 'no' };
  s.threads = over.threads ?? [];
  s.last_move = over.last_move ?? '';
  return s;
}

const listen = (over: Partial<MoveContext> = {}): MoveContext => ({
  phase: 'listen',
  askCounts: {},
  listenTurns: 2,
  retells: 0,
  followStreak: 0,
  ...over,
});

const thread = (id: string, strength: Thread['strength']): Thread => ({
  id,
  summary: `the ${id}`,
  opened_turn: 1,
  strength,
  explored: false,
  resolved: false,
});

describe('listening', () => {
  test('while they are still telling it, the host follows instead of asking about gaps', () => {
    const { move, rule } = selectMove(state({ covered: ['telling'] }), cfg, listen());
    expect(move).toEqual({ kind: 'follow' });
    expect(rule).toStartWith('4:');
  });

  test('after three turns in a row of following, the gaps get asked about', () => {
    const s = state({ covered: ['telling'], threads: [thread('msg_1', 'high')] });
    expect(selectMove(s, cfg, listen({ followStreak: 2 })).move.kind).toBe('explore_thread');
    expect(selectMove(s, cfg, listen({ followStreak: 3 })).move).toEqual({ kind: 'probe_goal', goalId: 'places' });
  });

  test('a detail they raised mid-telling is followed, even a medium one', () => {
    const { move } = selectMove(state({ threads: [thread('msg_1', 'medium')] }), cfg, listen());
    expect(move).toEqual({ kind: 'explore_thread', threadId: 'msg_1' });
  });

  test('once told to the end, the next gap is asked in the order the goals are written', () => {
    const { move } = selectMove(state({ covered: ['telling'], finished: 0.9 }), cfg, listen());
    expect(move).toEqual({ kind: 'probe_goal', goalId: 'places' });
  });

  test('a goal asked twice is dropped, however open it still reads', () => {
    const { move } = selectMove(
      state({ covered: ['telling'], finished: 0.9 }),
      cfg,
      listen({ askCounts: { places: 2 } }),
    );
    expect(move).toEqual({ kind: 'probe_goal', goalId: 'people' });
  });

  test('a goal they do not remember is never asked about', () => {
    const { move } = selectMove(state({ covered: ['telling'], unknown: ['places'], finished: 0.9 }), cfg, listen());
    expect(move).toEqual({ kind: 'probe_goal', goalId: 'people' });
  });

  test('the optional goal is never asked and never waited on', () => {
    const { move, rule } = selectMove(state({ covered: required, finished: 0.9 }), cfg, listen());
    expect(move).toEqual({ kind: 'retell' });
    expect(rule).toStartWith('2:');
  });

  test('a story that is understood but not finished keeps listening', () => {
    const { move } = selectMove(state({ covered: required, finished: 0.3 }), cfg, listen());
    expect(move).toEqual({ kind: 'follow' });
  });

  test('an understood story is told back when they wind down, even without an ending', () => {
    const { move } = selectMove(state({ covered: required, finished: 0.3, wants_out: 'soft' }), cfg, listen());
    expect(move.kind).toBe('retell');
  });

  test('settled includes forgotten and asked-out goals', () => {
    const half = required.slice(0, 5);
    const forgotten = required.slice(5, 8);
    const askedOut = required.slice(8);
    const askCounts = Object.fromEntries(askedOut.map((id) => [id, 2]));
    const { move } = selectMove(
      state({ covered: half, unknown: forgotten, finished: 0.8 }),
      cfg,
      listen({ askCounts }),
    );
    expect(move.kind).toBe('retell');
  });

  test('listening stops at the limit and tells back what is known', () => {
    const { move, rule } = selectMove(state({ covered: ['telling'] }), cfg, listen({ listenTurns: LISTEN_TURN_LIMIT }));
    expect(move.kind).toBe('retell');
    expect(rule).toStartWith('3:');
  });

  test('leaving ends it, whatever is open', () => {
    const { move } = selectMove(state({ wants_out: 'hard' }), cfg, listen());
    expect(move).toEqual({ kind: 'wrap' });
  });

  test('winding down with gaps left softens once, never twice in a row', () => {
    const s = state({ covered: ['telling'], finished: 0.9, wants_out: 'soft' });
    expect(selectMove(s, cfg, listen()).move).toEqual({ kind: 'acknowledge' });
    expect(selectMove({ ...s, last_move: 'acknowledge' }, cfg, listen()).move.kind).toBe('probe_goal');
  });
});

describe('the retelling', () => {
  const retell = (over: Partial<MoveContext> = {}): MoveContext => listen({ phase: 'retell', retells: 1, ...over });

  test('confirmed means understood', () => {
    expect(selectMove(state({ retell_reply: 'confirmed' }), cfg, retell()).move).toEqual({ kind: 'understood' });
  });

  test('a correction is settled inside the retelling, not by going back to listening', () => {
    const { move } = selectMove(state({ retell_reply: 'corrected' }), cfg, retell());
    expect(move).toEqual({ kind: 'take_correction' });
    expect(phaseAfter('retell', move)).toBe('retell');
  });

  test('after the last retelling, a correction is accepted as it stands', () => {
    const { move } = selectMove(state({ retell_reply: 'added_more' }), cfg, retell({ retells: MAX_RETELLS }));
    expect(move).toEqual({ kind: 'understood' });
  });

  test('no clear answer is asked about once, then taken as right', () => {
    expect(selectMove(state({ retell_reply: 'unclear' }), cfg, retell()).move).toEqual({ kind: 'retell_check' });
    expect(selectMove(state({ retell_reply: 'unclear', last_move: 'retell_check' }), cfg, retell()).move).toEqual({
      kind: 'understood',
    });
  });
});

describe('phases', () => {
  test('code moves the phase, the model never does', () => {
    expect(phaseAfter('listen', { kind: 'retell' })).toBe('retell');
    expect(phaseAfter('retell', { kind: 'retell_check' })).toBe('retell');
    expect(phaseAfter('retell', { kind: 'understood' })).toBe('understood');
    expect(phaseAfter('listen', { kind: 'wrap' })).toBe('ended');
    expect(phaseAfter('listen', { kind: 'follow' })).toBe('listen');
  });
});

describe('the brief', () => {
  test('the opening invites the dream and nothing else', () => {
    const b = renderBrief(initialState('t', cfg), { kind: 'open_ended' }, cfg, { opening: true });
    expect(b).toContain('FIRST message');
    expect(b).not.toContain('Not heard yet');
  });

  test('forgotten goals are named so the host does not ask again', () => {
    const b = renderBrief(state({ covered: ['telling'], unknown: ['look'] }), { kind: 'follow' }, cfg, {
      phase: 'listen',
    });
    expect(b).toContain("They don't remember: what it looked like.");
    expect(b).toContain('Already told you: what happened.');
    expect(b).toContain('Not heard yet: where it happened');
    expect(b).not.toContain('Not heard yet: what happened');
  });

  test('the retelling brief carries no gap list', () => {
    const b = renderBrief(state({ covered: ['telling'] }), { kind: 'retell' }, cfg, {
      phase: 'retell',
    });
    expect(b).not.toContain('Not heard yet');
    expect(b).toContain('Move: retell.');
  });
});
