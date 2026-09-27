// Step S8 (listening), behind DREAMCHAT_LISTEN=on: each rule, and that off is today.
import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import {
  ADDS_BAR,
  type Answer,
  bookkeeperQuestions,
  choiceByAction,
  closingListLength,
  type JevCall,
  PROFILE_REPLY_S8,
  readState,
  replyCheck,
  type ReplyCheckInput,
  replyFailures,
  retellWithAdds,
} from '../jev';
import {
  ASK_OPENLY,
  followStreakOf,
  initialState,
  MAX_FOLLOW_STREAK,
  type Move,
  type MoveContext,
  renderBrief,
  selectMove,
  type State,
  type Thread,
} from '../lib';
import { checkedReply, majorGaps } from '../listen';
import type { ChatMessage, HostFn } from '../llm';
import { parseTurnResponse } from '../llm';
import { type Breakdown, inTheirWords, personLines } from '../producer';
import { buildItems, SessionStore } from '../session';
import { fakeHost, fakeJev, noul, told } from './fakes';

const cfg = dreamConfig();
const required = cfg.goals.filter((g) => !g.optional).map((g) => g.id);

afterEach(() => {
  delete process.env.DREAMCHAT_LISTEN;
});

const thread = (id: string, opened: number, strength: Thread['strength'] = 'medium'): Thread => ({
  id,
  summary: `the ${id}`,
  opened_turn: opened,
  strength,
  explored: false,
  resolved: false,
});

const listening = (over: Partial<MoveContext> = {}): MoveContext => ({
  phase: 'listen',
  askCounts: {},
  listenTurns: 4,
  retells: 0,
  followStreak: 0,
  ...over,
});

const at = (turn: number, threads: Thread[]): State => ({ ...initialState('t', cfg), turn, threads });

describe('move selection follows the newest thing they raised', () => {
  test('threads are kept strongest first, and off, the last one that passes is the oldest', () => {
    // As reconcileThreads keeps them: high first, then medium newest first.
    const s = at(5, [thread('msg_3', 3, 'high'), thread('msg_9', 5), thread('msg_7', 4)]);
    expect(selectMove(s, cfg, listening()).move).toEqual({ kind: 'explore_thread', threadId: 'msg_7' });
    expect(selectMove(s, cfg, listening({ listen: true })).move).toEqual({
      kind: 'explore_thread',
      threadId: 'msg_9',
    });
  });

  test('when the message just answered raised nothing, an older thread is not followed: the story is', () => {
    const s = at(6, [thread('msg_9', 5)]);
    expect(selectMove(s, cfg, listening({ listen: true })).move).toEqual({ kind: 'follow' });
  });

  const told = (s: State): State => ({ ...s, signals: { ...s.signals, finished_telling: 0.9 } });

  test('once the story is told, the gaps are asked: nothing raised earlier is come back to ahead of them', () => {
    // Rule 6b came back here, and was answered "I don't remember" 17 times in 21 (fresh simulation, 27 Sep).
    for (const threads of [
      [thread('msg_7', 4)],
      [thread('msg_3', 2, 'high'), thread('msg_7', 4)],
      [thread('msg_9', 5)],
    ])
      expect(selectMove(told(at(6, threads)), cfg, listening({ listen: true })).move).toEqual({
        kind: 'probe_goal',
        goalId: 'telling',
      });
    // Off, as today: the gaps first too (an old thread raised with energy is still followed, rule 6).
    expect(selectMove(told(at(6, [thread('msg_7', 4)])), cfg, listening()).move).toEqual({
      kind: 'probe_goal',
      goalId: 'telling',
    });
    // Nor after a come-back or a goal question.
    for (const last_move of ['circle_back:msg_5', 'probe_goal:telling'])
      expect(
        selectMove(
          { ...told(at(7, [thread('msg_5', 3), thread('msg_7', 4)])), last_move },
          cfg,
          listening({ listen: true }),
        ).move.kind,
      ).toBe('probe_goal');
  });

  // Every goal asked twice, the dream not told to its end, and the follow cap reached: only rule 8 is left.
  const asked = Object.fromEntries(required.map((g) => [g, 2]));
  const capped = (over: Partial<MoveContext> = {}) =>
    listening({ askCounts: asked, followStreak: MAX_FOLLOW_STREAK, listenTurns: 9, ...over });

  test('an aged thread is come back to after every gap, never twice in a row with the switch on', () => {
    const s = at(9, [thread('msg_3', 3)]);
    expect(selectMove(s, cfg, capped({ listen: true })).move).toEqual({ kind: 'circle_back', threadId: 'msg_3' });
    const again = { ...s, last_move: 'circle_back:msg_3' };
    expect(selectMove(again, cfg, capped({ listen: true })).move).toEqual({ kind: 'open_ended' });
    // Off, as today: the same thread again.
    expect(selectMove(again, cfg, capped()).move).toEqual({ kind: 'circle_back', threadId: 'msg_3' });
  });

  test('an aged thread already taken up is not come back to with the switch on', () => {
    const s = at(9, [{ ...thread('msg_3', 3), explored: true }]);
    expect(selectMove(s, cfg, capped({ listen: true })).move).toEqual({ kind: 'open_ended' });
    expect(selectMove(s, cfg, capped()).move).toEqual({ kind: 'circle_back', threadId: 'msg_3' });
  });

  test('the follow cap hit while the dream is still being told does not bring an earlier thread back', () => {
    // Still telling, and three turns in a row followed it: rule 4 stands aside, and the gaps are asked, as
    // off; before the fix, rule 6b came back to an earlier thread here (38 of 117 in the third after-run).
    const s = at(8, [thread('msg_7', 4)]);
    const capped = listening({ listen: true, followStreak: MAX_FOLLOW_STREAK });
    expect(selectMove(s, cfg, capped).move.kind).toBe('probe_goal');
    // And once told, a capped streak blocks it too: coming back is following.
    expect(selectMove(told(s), cfg, capped).move.kind).toBe('probe_goal');
  });

  test('coming back to an earlier thread counts toward the follow cap, with the switch on only', () => {
    const moves: Move[] = [
      { kind: 'probe_goal', goalId: 'look' },
      { kind: 'follow' },
      { kind: 'circle_back', threadId: 'msg_3' },
      { kind: 'explore_thread', threadId: 'msg_9' },
    ];
    expect(followStreakOf(moves, true)).toBe(3);
    expect(followStreakOf(moves, false)).toBe(1);
  });
});

describe('the briefs', () => {
  test('a listening brief asks for one open question on their words; off, it does not', () => {
    const s = initialState('t', cfg);
    const on = renderBrief(s, { kind: 'probe_goal', goalId: 'you_in_it' }, cfg, { phase: 'listen', listen: true });
    expect(on).toContain(ASK_OPENLY);
    // The goal is asked by its topic, never by its list of answers.
    expect(on).not.toContain('as someone else, or watching');
    const off = renderBrief(s, { kind: 'probe_goal', goalId: 'you_in_it' }, cfg, { phase: 'listen' });
    expect(off).not.toContain(ASK_OPENLY);
    expect(off).toContain('as someone else, or watching');
  });

  test('a thread, new or earlier, is asked about what could be seen of it; off, anything about it', () => {
    const s = at(6, [thread('msg_9', 5)]);
    for (const move of [
      { kind: 'explore_thread', threadId: 'msg_9' },
      { kind: 'circle_back', threadId: 'msg_9' },
    ] as const) {
      expect(renderBrief(s, move, cfg, { phase: 'listen', listen: true })).toContain('could be seen');
      expect(renderBrief(s, move, cfg, { phase: 'listen' })).not.toContain('could be seen');
    }
  });

  test('the retelling ends with every moment of the breakdown, marking the ones filled in', () => {
    const b = renderBrief({ ...initialState('t', cfg) }, { kind: 'retell' }, cfg, {
      phase: 'retell',
      listen: true,
      extras: {
        moments: [
          { action: 'The dreamer walks into the car park.', said: true },
          { action: 'The dog follows up the stairs.', said: false },
        ],
      },
    });
    expect(b).toContain('1. The dreamer walks into the car park.');
    expect(b).toContain('2. The dog follows up the stairs. [filled in]');
    expect(b).toContain('numbered list');
  });

  test('a profile with a gap asks openly and puts no guess forward', () => {
    const b = renderBrief(initialState('t', cfg), { kind: 'confirm_profile', itemId: 'p2' }, cfg, {
      phase: 'build',
      listen: true,
      extras: {
        profile: {
          name: 'the grey dog',
          kind: 'character',
          said: ['looks: thin and grey'],
          guessed: ['wears: a red collar'],
          gaps: ['what they wore'],
        },
      },
    });
    expect(b).toContain('describe how you picture the grey dog on their own');
    expect(b).toContain("you don't know yet what they wore");
    expect(b).not.toContain('red collar');
  });
});

describe('choices read by the action they lead to', () => {
  const ans = (choice: string, probabilities: Record<string, number>): Answer => ({
    type: 'choice',
    choice,
    confidence: probabilities[choice],
    probabilities,
  });
  const profile = [['confirmed', 'you_choose'], ['changes'], ['unclear']] as const;

  test('"confirmed 0.55, you_choose 0.45" settles the profile', () => {
    const a = ans('confirmed', { confirmed: 0.55, you_choose: 0.4, unclear: 0.05 });
    expect(choiceByAction(a, profile, 'unclear', 0.6)).toEqual({ value: 'confirmed', lowConfidence: false });
  });

  test('the action that loses nothing is taken at 0.25; otherwise a rival at 0.25 is asked again', () => {
    const retell = [['confirmed'], ['corrected', 'added_more'], ['unclear']] as const;
    // "draw me as i was in the dream, a kid in a red cardigan": a change, whatever else it reads as.
    const a = ans('changes', { changes: 0.65, confirmed: 0.3, unclear: 0.01, you_choose: 0.04 });
    expect(choiceByAction(a, profile, 'unclear', 0.5, { prefer: 'changes' }).value).toBe('changes');
    // "you got it right. the only thing is the lights of the market were behind us": an addition.
    const r = ans('confirmed', { confirmed: 0.55, added_more: 0.42, corrected: 0.03 });
    expect(choiceByAction(r, retell, 'unclear', 0.5, { prefer: 'corrected' }).value).toBe('added_more');
    // Neither side safe: yes against no is asked again.
    const w = ans('yes', { yes: 0.6, no: 0.3, not_yet: 0.05, unclear: 0.05 });
    expect(choiceByAction(w, [['yes'], ['no'], ['not_yet', 'unclear']], 'unclear', 0.5).value).toBe('unclear');
  });

  test('leaving the rest to us while changing one thing is a change', () => {
    const by = { joins: { you_choose: 'changes' }, prefer: 'changes' } as const;
    // "He was just a small brown terrier, short rough fur. No collar. Go with your guess on the rest."
    const a = ans('you_choose', { you_choose: 0.55, changes: 0.35, confirmed: 0.1, unclear: 0 });
    expect(choiceByAction(a, profile, 'unclear', 0.5, by).value).toBe('changes');
    // Without a change in it, leaving it to us stays as it was.
    const b = ans('you_choose', { you_choose: 0.8, changes: 0.1, confirmed: 0.05, unclear: 0.05 });
    expect(choiceByAction(b, profile, 'unclear', 0.5, by).value).toBe('you_choose');
  });

  test('an answer mostly unclear stays unclear', () => {
    const a = ans('unclear', { confirmed: 0.2, changes: 0.2, unclear: 0.55, you_choose: 0.05 });
    expect(choiceByAction(a, profile, 'unclear', 0.6).value).toBe('unclear');
  });

  test('readState sums only with the switch on', () => {
    const transcript = [
      { role: 'assistant' as const, content: 'here is how I picture her' },
      { role: 'user' as const, content: 'yeah that fits, or just go with yours' },
    ];
    const answers: Record<string, Answer> = {
      profile_reply: ans('confirmed', { confirmed: 0.45, you_choose: 0.42, unclear: 0.13 }),
    };
    const call: JevCall = { questions: {}, state: '', answers, error: null, ms: 1, usage: null };
    const off = readState(initialState('t', cfg), cfg, transcript, call, 1, 'build').next;
    const on = readState(initialState('t', cfg), cfg, transcript, call, 1, 'build', 0.5, true).next;
    expect(off.signals.profile_reply).toBe('unclear');
    expect(on.signals.profile_reply).toBe('confirmed');
  });

  test('a profile answer telling who someone is is a change, not only one telling how they look', () => {
    // "just that he's my younger brother ... you can go with your guess" read as leaving it to us at 0.91,
    // and the sketch guessed a man in his early twenties (night bus, fresh simulation, 27 Sep).
    expect(PROFILE_REPLY_S8.changes).toContain('who or what it is');
    expect(PROFILE_REPLY_S8.you_choose).toContain('no detail of it that was different or missing');
    const q = bookkeeperQuestions(
      cfg,
      [{ role: 'user', content: 'x' }],
      undefined,
      'build',
      [],
      'my brother',
      [],
      true,
    );
    expect(q.profile_reply.type === 'choice' && q.profile_reply.criteria).toEqual(PROFILE_REPLY_S8);
  });

  test('a retelling\'s answer that puts something right beside "that\'s it" is a change, asked on its own', () => {
    const transcript = [
      { role: 'assistant' as const, content: 'so the tractor drove you to the field, and you put the boat down' },
      {
        role: 'user' as const,
        content: "yep that's it, you got it all right. only small thing is the tractor stops at the edge of the field",
      },
    ];
    const on = bookkeeperQuestions(cfg, transcript, undefined, 'retell', [], undefined, [], true);
    expect(on.retell_adds?.type).toBe('noul');
    expect(bookkeeperQuestions(cfg, transcript, undefined, 'retell').retell_adds).toBeUndefined();
    // Asked of the answer to the whole telling back, not to one corrected part told back: said again in their
    // own words and carried on past it, it read as adding in 5 of 5 (both arms' answers, 27 Sep).
    const after = (last_move: string) =>
      bookkeeperQuestions(cfg, transcript, { ...initialState('t', cfg), last_move }, 'retell', [], undefined, [], true)
        .retell_adds;
    expect(after('retell')?.type).toBe('noul');
    expect(after('retell_check')?.type).toBe('noul');
    expect(after('take_correction')).toBeUndefined();
    // Read 0.76 right and 0.16-0.25 a change: under the bar, and never drafted.
    const read = (adds: number, listen: boolean) =>
      readState(
        initialState('t', cfg),
        cfg,
        transcript,
        {
          questions: {},
          state: '',
          answers: {
            retell_reply: ans('confirmed', { confirmed: 0.76, added_more: 0.16, corrected: 0.08, unclear: 0 }),
            retell_adds: noul(adds),
          },
          error: null,
          ms: 1,
          usage: null,
        },
        1,
        'retell',
        0.5,
        listen,
      ).next.signals.retell_reply;
    expect(read(0.94, true)).toBe('added_more');
    // A plain "yep that's exactly it" reads 0.07-0.38 (the stored answers of both arms): it stays right.
    expect(read(0.2, true)).toBe('confirmed');
    // Off, as today.
    expect(read(0.94, false)).toBe('confirmed');
    // A change already read stays what it was; nothing read, the choice stands.
    expect(retellWithAdds('corrected', 0.9)).toBe('corrected');
    expect(retellWithAdds('unclear', ADDS_BAR)).toBe('added_more');
    expect(retellWithAdds('confirmed', null)).toBe('confirmed');
  });
});

describe('every reply against its move', () => {
  const base: Omit<ReplyCheckInput, 'messages'> = {
    move: { kind: 'probe_goal', goalId: 'people' },
    moveLine: 'probe_goal → who was there.',
    said: ['I was in a car park at night'],
    topic: 'who else was there, if anyone',
  };
  const yes = (k: string, p: number) => ({ [k]: noul(p) }) as Record<string, Answer>;

  test('a listening reply is asked its move, whether it leads, offers a choice, or states what was not said', () => {
    const q = replyCheck({ ...base, messages: ['a car park at night.', 'was anyone with you, or were you alone?'] });
    expect(Object.keys(q.questions).sort()).toEqual(['either_or', 'leads', 'move', 'states_unsaid']);
  });

  test('failures are named, and counting needs no judge', () => {
    const x = { ...base, messages: ['who was there? and what did they wear?'] };
    const f = replyFailures(x, { ...yes('move', 0.9), ...yes('either_or', 0.8), ...yes('leads', 0.1) });
    expect(f).toEqual([
      'it asks 2 questions: ask one, and let the rest wait',
      'its question offers them choices: ask one open question instead',
    ]);
    // A lead is sent back from a lower bar than the rest.
    expect(
      replyFailures({ ...base, messages: ['did you go through it?'] }, { ...yes('move', 0.9), ...yes('leads', 0.35) }),
    ).toEqual(['its question puts an answer of its own to them: ask openly, and leave the answer to them']);
    // The judge down fails nothing it would have read.
    expect(replyFailures({ ...base, messages: ['who else was there?'] }, null)).toEqual([]);
  });

  test('a retelling must end with a numbered line for every moment', () => {
    const text = 'you were in a car park.\n1. you walk in\n2. a dog watches\ndid I get that right?';
    expect(closingListLength(text)).toBe(2);
    const x: ReplyCheckInput = {
      move: { kind: 'retell' },
      moveLine: 'retell.',
      said: [],
      moments: 3,
      messages: [text],
    };
    expect(replyFailures(x, { move: noul(0.9) })[0]).toContain('all 3 moments');
  });

  test('a style offer that leaves a way out names it', () => {
    const styles = [
      { id: 'a', name: 'soft pencil', line: 'pencil' },
      { id: 'b', name: 'old photo', line: 'photo' },
    ];
    const x: ReplyCheckInput = {
      move: { kind: 'choose_style' },
      moveLine: 'choose_style.',
      said: [],
      styles,
      messages: ['soft pencil?'],
    };
    expect(replyFailures(x, { move: noul(0.9), offers_a: noul(0.9), offers_b: noul(0.1) })).toEqual([
      'it leaves out this way of drawing it: old photo',
    ]);
  });

  test('a failed reply is written once more with its failure named, and the better one kept', async () => {
    const replies = ['{"response": ["was it cold or warm?"]}', '{"response": ["how did it feel there?"]}'];
    const seen: ChatMessage[][] = [];
    const host: HostFn = async (m) => {
      seen.push(m);
      return { content: replies[seen.length - 1], model: 'fake', ms: 1 };
    };
    const jev = fakeJev((_q, state): Record<string, Answer> =>
      state.includes('cold or warm') ? { move: noul(0.9), either_or: noul(0.9) } : { move: noul(0.9) },
    );
    const r = await checkedReply(host, jev, [], 'disabled', {
      ...base,
      move: { kind: 'probe_goal', goalId: 'feeling' },
    });
    expect(r.parsed.messages).toEqual(['how did it feel there?']);
    expect(seen[1].at(-1)?.content).toContain('offers them choices');
    expect(r.record.retry?.kept).toBe('second');
  });

  test('a second try that fails as much keeps the first', async () => {
    const host: HostFn = async () => ({ content: '{"response": ["hm. what else?"]}', model: 'fake', ms: 1 });
    const r = await checkedReply(host, fakeJev(), [], 'disabled', base);
    expect(r.record.retry?.kept).toBe('first');
  });
});

describe('the words are kept', () => {
  test('keepWords leaves every question; the repair keeps only the last', () => {
    const raw = '{"response": ["which feels closest? a) soft pencil? b) an old photo?"]}';
    expect(parseTurnResponse(raw).messages[0]).not.toContain('soft pencil');
    expect(parseTurnResponse(raw, { keepWords: true }).messages[0]).toContain('soft pencil');
  });
});

describe('said is only their words', () => {
  test('a said look reworded with detail of our own is not in their words', () => {
    const theirs = 'Person: my dog Biscuit, a small brown terrier, always running around';
    expect(inTheirWords('Small brown terrier', theirs)).toBe(true);
    expect(inTheirWords('Small brown terrier, about 30 cm tall, alert dark eyes', theirs)).toBe(false);
  });

  test('their words are read from their messages, a message over several lines whole', () => {
    const rendered = 'Listener: how did he look?\nPerson: tall\nwith a red scarf\nListener: and then?';
    expect(personLines(rendered)).toBe('tall\nwith a red scarf');
    expect(personLines(rendered, ['tall', 'with a red scarf, and green boots'])).toContain('green boots');
  });
});

describe('major gaps are asked, minor ones imagined', () => {
  const d = (value: string | null, said = false) => ({ value, said });
  const b: Breakdown = {
    title: 't',
    people: [
      {
        id: 'p1',
        name: 'the old man',
        is_dreamer: false,
        protagonist: true,
        fields: { identity: d('a stranger'), appearance: d(null), wardrobe: d(null), distinctive_features: d(null) },
      },
      {
        id: 'p2',
        name: 'the waiter',
        is_dreamer: false,
        protagonist: false,
        fields: { identity: d('a waiter'), appearance: d(null), wardrobe: d(null), distinctive_features: d(null) },
      },
    ],
    places: [
      {
        id: 'l1',
        name: 'the cafe',
        fields: { geography: d('a cafe', true), landmarks: d('tables', true), light: d(null) },
      },
    ],
    things: [],
    scenes: [
      {
        id: 's1',
        title: 's',
        place: 'l1',
        mood: '',
        moments: [
          { id: 'm1', action: 'the old man sits', visible: ['p1'], things: [], place: 'l1', key: false, said: true },
          {
            id: 'm2',
            action: 'the waiter passes',
            visible: ['p1', 'p2'],
            things: [],
            place: 'l1',
            key: false,
            said: true,
          },
          { id: 'm3', action: 'the old man leaves', visible: ['p1'], things: [], place: 'l1', key: true, said: true },
        ],
      },
    ],
    style_options: [],
  } as unknown as Breakdown;

  test('the man in the key moment and every moment is asked; the waiter seen once is not; a told place is not', () => {
    const gaps = majorGaps(b, buildItems(b));
    expect([...gaps]).toEqual(['p1']);
  });

  test('a recurring gap Jev reads as not mattering is imagined', () => {
    const b2 = structuredClone(b);
    b2.scenes[0].moments[2].key = false;
    expect([...majorGaps(b2, buildItems(b2), { p1: 0.2 })]).toEqual([]);
  });
});

describe('a turn with the switch on', () => {
  test('the reply is checked and the check kept with the turn; off, no check is made', async () => {
    const allTold = () => {
      const out: Record<string, Answer> = {};
      for (const id of required.filter((g) => g !== 'people')) Object.assign(out, told(id, 1));
      return { ...out, finished_telling: noul(0.9) };
    };
    for (const on of [false, true]) {
      if (on) process.env.DREAMCHAT_LISTEN = 'on';
      const jev = fakeJev((q) => (q.move ? { move: noul(0.9) } : allTold()));
      const store = new SessionStore(cfg, { jev, host: fakeHost() });
      const { id } = store.create();
      await store.open(id);
      const r = await store.message(id, 'I was in a car park and it rained upwards, and then I woke');
      expect(r.move).toEqual({ kind: 'probe_goal', goalId: 'people' });
      const detail = store.detail(id, 1);
      expect(detail?.replyCheck !== undefined).toBe(on);
      if (on) expect(detail?.replyCheck?.failures).toEqual([]);
    }
  });
});

describe('the retelling with the switch on', () => {
  const breakdown = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8')) as Breakdown;

  // First reading: all told but who was there, and the dream at its end; after, everything told. `adds`:
  // whether the answer to the question added to what happened.
  const run = async (adds: number) => {
    process.env.DREAMCHAT_LISTEN = 'on';
    const drafted: number[] = [];
    let readings = 0;
    const jev = fakeJev((q) => {
      if (q.move) return { move: noul(0.9) };
      if (q.is_retelling) return { is_retelling: noul(0.9) };
      if (!q.eviD_telling) return {};
      readings += 1;
      const out: Record<string, Answer> = { finished_telling: noul(0.9), adds_story: noul(adds) };
      for (const g of required.filter((x) => readings > 1 || x !== 'people')) Object.assign(out, told(g, 1));
      return out;
    });
    const store = new SessionStore(cfg, {
      jev,
      host: fakeHost(),
      producer: async (t) => {
        const n = t.filter((e) => e.role === 'user').length;
        drafted.push(n);
        const b = structuredClone(breakdown);
        b.scenes[0].moments[0].action = `drafted from ${n} messages`;
        return { breakdown: b, downgraded: [], notes: [], ms: 1 };
      },
    });
    const { id } = store.create();
    await store.open(id);
    expect((await store.message(id, 'I was on a train and then I woke')).move?.kind).toBe('probe_goal');
    expect((await store.message(id, 'just me and a conductor')).move?.kind).toBe('retell');
    return { drafted, brief: store.get(id)?.briefs[2] ?? '' };
  };

  test('its breakdown is started once the dream looks told, and used when nothing told since added to it', async () => {
    const { drafted, brief } = await run(0.1);
    // Drafted ahead from the first message; at the retelling, drafted again for what comes after it.
    expect(drafted).toEqual([1, 2]);
    expect(brief).toContain('The moments: 1. drafted from 1 messages');
  });

  test('an answer that added to what happened is waited for', async () => {
    const { drafted, brief } = await run(0.9);
    expect(drafted).toEqual([1, 2]);
    expect(brief).toContain('The moments: 1. drafted from 2 messages');
  });
});
