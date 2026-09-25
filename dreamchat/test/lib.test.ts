import { describe, expect, test } from 'bun:test';
import { dreamConfig } from '../dream';
import {
  dryRun,
  initialState,
  invitesMore,
  LISTEN_TURN_LIMIT,
  MAX_OFFERS,
  MAX_RESUMES,
  MAX_RETELLS,
  MAX_STYLE_ASKS,
  type MoveContext,
  phaseAfter,
  RESUMED_LISTEN_LIMIT,
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
  goes_on?: number;
  wants_to_see?: State['signals']['wants_to_see'];
  style_choice?: string;
}): State {
  const s = initialState('t', cfg);
  for (const id of over.covered ?? []) s.goals[id] = { confidence: 0.9, evidence: `told ${id}` };
  for (const id of over.unknown ?? []) s.goals[id] = { confidence: 0.1, evidence: '', unknown: true };
  s.signals = {
    finished_telling: over.finished ?? 0,
    retell_reply: over.retell_reply ?? null,
    goes_on: over.goes_on ?? null,
    wants_to_see: over.wants_to_see ?? null,
    style_choice: over.style_choice ?? null,
  };
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
  test("once the story has reached its end, two \"I don't remember\"s in a row mean it is told back", () => {
    const told = state({ covered: ['telling'], finished: 0.9 });
    expect(selectMove(told, cfg, listen({ forgotStreak: 2 })).move).toEqual({ kind: 'retell' });
    // One is only a gap they don't remember: the next one is asked.
    expect(selectMove(told, cfg, listen({ forgotStreak: 1 })).move.kind).toBe('probe_goal');
    // Partway through the story, it is theirs to go on with.
    expect(selectMove(state({ covered: ['telling'] }), cfg, listen({ forgotStreak: 3 })).move.kind).not.toBe('retell');
  });

  test('three messages in a row that add nothing new to what happened count as told to the end', () => {
    const place = state({ covered: ['telling'] });
    expect(selectMove(place, cfg, listen({ dryStreak: 2 })).move.kind).toBe('follow');
    expect(selectMove(place, cfg, listen({ dryStreak: 3 })).move.kind).toBe('probe_goal');
  });

  test('only an answer to an invitation to go on can show the telling has run dry', () => {
    // Asked about the grandmother's white hair, "the colour, mostly" is about the hair, not the end.
    expect(invitesMore({ kind: 'follow' })).toBe(true);
    expect(invitesMore({ kind: 'open_ended' })).toBe(true);
    expect(invitesMore({ kind: 'acknowledge' })).toBe(true);
    expect(invitesMore({ kind: 'explore_thread', threadId: 'msg_27' })).toBe(false);
    expect(invitesMore({ kind: 'probe_goal', goalId: 'strange' })).toBe(false);
  });

  test('a dry run counts invitations to go on that brought nothing new, and passes over answers about details', () => {
    const t = (dry?: boolean, adds?: boolean, phase: 'listen' | 'retell' = 'listen') => ({ dry, adds, phase });
    // The night bus: asked about the white hair, then about the quiet, then invited to go on.
    expect(dryRun([t(), t()], true)).toBe(1);
    expect(dryRun([t(true), t(), t(true)], true)).toBe(3);
    // Something new that happened ends the run, and so does a retelling.
    expect(dryRun([t(true), t(false, true), t(true)], true)).toBe(2);
    expect(dryRun([t(true), t(undefined, undefined, 'retell'), t(true)], true)).toBe(2);
    expect(dryRun([t(true), t(true)], false)).toBe(0);
  });

  test('listening again after a retelling has its own, shorter stretch', () => {
    const s = state({ covered: ['telling'] });
    // Well past the first stretch's limit, the rest of the dream is still heard.
    const again = listen({ listenTurns: LISTEN_TURN_LIMIT + 3 });
    expect(selectMove(s, cfg, { ...again, resumed: { times: 1, since: 1 } }).move.kind).not.toBe('retell');
    expect(selectMove(s, cfg, { ...again, resumed: { times: 1, since: RESUMED_LISTEN_LIMIT } }).move).toEqual({
      kind: 'retell',
    });
  });

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

  test('one detail at a time: an answer about a detail that adds nothing is followed by the story', () => {
    const s = { ...state({ threads: [thread('msg_5', 'high')], last_move: 'explore_thread:msg_3' }) };
    s.signals = { ...s.signals, adds_story: 0.1 };
    expect(selectMove(s, cfg, listen()).move).toEqual({ kind: 'follow' });
    // What they said added to the story: what they raised is followed.
    s.signals = { ...s.signals, adds_story: 0.8 };
    expect(selectMove(s, cfg, listen()).move).toEqual({ kind: 'explore_thread', threadId: 'msg_5' });
  });

  test('the newest thing they raised is followed first', () => {
    const s = state({ threads: [thread('msg_1', 'medium'), thread('msg_29', 'medium')] });
    expect(selectMove(s, cfg, listen()).move).toEqual({ kind: 'explore_thread', threadId: 'msg_29' });
  });

  test('told back before the story is known to have ended, it asks whether that is where it ended', () => {
    const early = renderBrief(state({ finished: 0.2 }), { kind: 'retell' }, cfg, { phase: 'retell' });
    expect(early).toContain("whether that's where the dream ended or more happened after");
    const done = renderBrief(state({ finished: 0.9 }), { kind: 'retell' }, cfg, { phase: 'retell' });
    expect(done).not.toContain("whether that's where the dream ended");
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

  test('confirmed leads to asking whether they would like to see it', () => {
    const { move } = selectMove(state({ retell_reply: 'confirmed' }), cfg, retell());
    expect(move).toEqual({ kind: 'offer_visualize' });
    expect(phaseAfter('retell', move)).toBe('offer');
  });

  test('a correction is settled inside the retelling, not by going back to listening', () => {
    const { move } = selectMove(state({ retell_reply: 'corrected' }), cfg, retell());
    expect(move).toEqual({ kind: 'take_correction' });
    expect(phaseAfter('retell', move)).toBe('retell');
  });

  test('after the last retelling, a correction is accepted as it stands', () => {
    const { move } = selectMove(state({ retell_reply: 'added_more' }), cfg, retell({ retells: MAX_RETELLS }));
    expect(move).toEqual({ kind: 'offer_visualize' });
  });

  test('the dream going on past the retelling goes back to listening, whatever the count', () => {
    // "that part's right. but the dream didn't end there, after the kitchen there was more" (night bus).
    for (const reply of ['confirmed', 'added_more', 'unclear'] as const) {
      const { move } = selectMove(state({ retell_reply: reply, goes_on: 0.9 }), cfg, retell({ retells: MAX_RETELLS }));
      expect(move).toEqual({ kind: 'follow' });
      expect(phaseAfter('retell', move)).toBe('listen');
    }
    // A detail added to a part already told back stays a correction.
    expect(selectMove(state({ retell_reply: 'added_more', goes_on: 0.1 }), cfg, retell()).move.kind).toBe(
      'take_correction',
    );
    // Gone on too many times: what they add is taken as a correction.
    const worn = retell({ resumed: { times: MAX_RESUMES, since: 0 } });
    expect(selectMove(state({ retell_reply: 'added_more', goes_on: 0.9 }), cfg, worn).move.kind).toBe('take_correction');
  });

  test('told back again after the dream went on, only the rest is told', () => {
    const b = renderBrief(state({}), { kind: 'retell' }, cfg, { phase: 'retell', extras: { toldBefore: true } });
    expect(b).toContain("just what they've told since then");
    expect(b).toContain("whether that's where the dream ended");
    const f = renderBrief(state({ last_move: 'retell' }), { kind: 'follow' }, cfg, { phase: 'listen' });
    expect(f).toContain('what happened next');
    expect(f).toContain("Don't tell anything back now");
  });

  test('no clear answer is asked about once, then taken as right', () => {
    expect(selectMove(state({ retell_reply: 'unclear' }), cfg, retell()).move).toEqual({ kind: 'retell_check' });
    expect(selectMove(state({ retell_reply: 'unclear', last_move: 'retell_check' }), cfg, retell()).move).toEqual({
      kind: 'offer_visualize',
    });
  });
});

describe('would you like to see it', () => {
  const offer = (over: Partial<MoveContext> = {}): MoveContext => listen({ phase: 'offer', offers: 1, ...over });

  test('yes leads to the style', () => {
    const { move } = selectMove(state({ wants_to_see: 'yes' }), cfg, offer());
    expect(move).toEqual({ kind: 'choose_style' });
    expect(phaseAfter('offer', move)).toBe('style');
  });

  test('no keeps the dream as told, and closes', () => {
    const { move } = selectMove(state({ wants_to_see: 'no' }), cfg, offer());
    expect(move).toEqual({ kind: 'keep' });
    expect(phaseAfter('offer', move)).toBe('kept');
  });

  test('not yet is asked about lightly once more, then kept', () => {
    expect(selectMove(state({ wants_to_see: 'not_yet' }), cfg, offer()).move).toEqual({ kind: 'offer_later' });
    expect(selectMove(state({ wants_to_see: 'not_yet' }), cfg, offer({ offers: MAX_OFFERS })).move).toEqual({
      kind: 'keep',
    });
  });
});

describe('how it should look', () => {
  const style = (over: Partial<MoveContext> = {}): MoveContext =>
    listen({ phase: 'style', styleAsks: 1, styleIds: ['a', 'b', 'c', 'd'], ...over });

  test('a chosen option starts the build', () => {
    const { move } = selectMove(state({ style_choice: 'b' }), cfg, style());
    expect(move).toEqual({ kind: 'start', styleId: 'b' });
    expect(phaseAfter('style', move)).toBe('build');
  });

  test('their own description is a choice too', () => {
    expect(selectMove(state({ style_choice: 'own' }), cfg, style()).move).toEqual({ kind: 'start', styleId: 'own' });
  });

  test('unsure gets a suggestion, then the one closest to how it looked', () => {
    expect(selectMove(state({ style_choice: 'unsure' }), cfg, style()).move).toEqual({ kind: 'style_help' });
    expect(selectMove(state({ style_choice: 'unsure' }), cfg, style({ styleAsks: MAX_STYLE_ASKS })).move).toEqual({
      kind: 'start',
      styleId: 'd',
    });
  });
});

describe('building, one profile at a time', () => {
  const build = (over: Partial<NonNullable<MoveContext['build']>> = {}): MoveContext =>
    listen({ phase: 'build', build: { current: 'p1', next: 'l1', checks: 0, ...over } });
  const replied = (r: State['signals']['profile_reply']) => {
    const st = state({});
    st.signals.profile_reply = r;
    return st;
  };

  test('a confirmed profile moves to the next one', () => {
    expect(selectMove(replied('confirmed'), cfg, build()).move).toEqual({ kind: 'confirm_profile', itemId: 'l1' });
  });

  test('a change, or "you choose", settles it just the same', () => {
    expect(selectMove(replied('changes'), cfg, build()).move.kind).toBe('confirm_profile');
    expect(selectMove(replied('you_choose'), cfg, build()).move.kind).toBe('confirm_profile');
  });

  test('no clear answer is asked once, then taken as it is', () => {
    expect(selectMove(replied('unclear'), cfg, build()).move).toEqual({ kind: 'profile_check', itemId: 'p1' });
    expect(selectMove(replied('unclear'), cfg, build({ checks: 1 })).move.kind).toBe('confirm_profile');
  });

  test('the last profile settled means everything is being sketched', () => {
    expect(selectMove(replied('confirmed'), cfg, build({ next: null })).move).toEqual({ kind: 'build_done' });
  });
});

describe('briefs for the pictures', () => {
  test('a dreamer who never said how they look is asked how to be drawn', () => {
    const b = renderBrief(state({}), { kind: 'confirm_profile', itemId: 'p9' }, cfg, {
      phase: 'build',
      extras: { profile: { name: 'you', kind: 'character', said: [], guessed: [], dreamer: true, unknownLook: true } },
    });
    expect(b).toContain('ask gently how they');
  });

  test('while moments are still to come, the host is told how many, drawing or leaving', () => {
    const extras = { frameCount: 13, drawnCount: 7 };
    const drawing = renderBrief(state({}), { kind: 'frames_drawing' }, cfg, { phase: 'frames', extras });
    expect(drawing).toContain('7 of the 13 moments are on the right so far; the other 6 are still to come.');
    const leaving = renderBrief(state({}), { kind: 'wrap' }, cfg, { phase: 'frames', extras });
    expect(leaving).toContain('Never say the whole dream is drawn while any are.');
    const done = renderBrief(state({}), { kind: 'frames_drawing' }, cfg, {
      phase: 'frames',
      extras: { frameCount: 13, drawnCount: 13 },
    });
    expect(done).not.toContain('still to come');
  });

  test('a structured move asks nothing of its own', () => {
    expect(renderBrief(state({}), { kind: 'offer_visualize' }, cfg, { phase: 'offer' })).toContain(
      'Ask nothing except what this move says.',
    );
    expect(renderBrief(state({}), { kind: 'follow' }, cfg, { phase: 'listen' })).not.toContain('Ask nothing except');
  });
});

describe('phases', () => {
  test('code moves the phase, the model never does', () => {
    expect(phaseAfter('listen', { kind: 'retell' })).toBe('retell');
    expect(phaseAfter('retell', { kind: 'retell_check' })).toBe('retell');
    expect(phaseAfter('style', { kind: 'start', styleId: 'a' })).toBe('build');
    expect(phaseAfter('build', { kind: 'build_done' })).toBe('review');
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
