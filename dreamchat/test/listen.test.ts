// Step S8 (listening), behind DREAMCHAT_LISTEN=on: each rule, and that off is today.
import { afterEach, describe, expect, test } from 'bun:test';
import { dreamConfig } from '../dream';
import {
  type Answer,
  choiceByAction,
  closingListLength,
  type JevCall,
  readState,
  replyCheck,
  type ReplyCheckInput,
  replyFailures,
} from '../jev';
import { ASK_OPENLY, initialState, type MoveContext, renderBrief, selectMove, type State, type Thread } from '../lib';
import { checkedReply, majorGaps } from '../listen';
import type { ChatMessage, HostFn } from '../llm';
import { parseTurnResponse } from '../llm';
import { type Breakdown, inTheirWords } from '../producer';
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

  test('once the story is told, what they raised earlier is come back to, as earlier, before the gaps', () => {
    const s = { ...at(6, [thread('msg_9', 5)]), signals: { ...initialState('t', cfg).signals, finished_telling: 0.9 } };
    expect(selectMove(s, cfg, listening({ listen: true })).move).toEqual({ kind: 'circle_back', threadId: 'msg_9' });
    // Off, the gaps come first, and it waits for rule 8, after every one of them.
    expect(selectMove(s, cfg, listening()).move).toEqual({ kind: 'probe_goal', goalId: 'telling' });
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
