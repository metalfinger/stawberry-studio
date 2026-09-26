// The listening test's code checks (evals/listening.ts): how a conversation is cut into replies, the
// question, either/or, style and list checks, the facts marked said, and how the counts add up. Jev is
// never asked here: its answers are stood in for, so the counting can be checked exactly.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DREAM_GOALS } from '../dream';
import {
  addSums,
  type Ask,
  askAll,
  askKey,
  type AuditItem,
  auditAgreement,
  auditReply,
  clausesOf,
  compare,
  complianceQuestion,
  endingList,
  endsWithList,
  type Env,
  floors,
  freeze,
  groupOf,
  GROUPS,
  headline,
  type JevCache,
  type Loaded,
  load,
  loadFacts,
  mentions,
  nameOf,
  offeredStyles,
  questionsHash,
  questionsOf,
  rawText,
  readingOf,
  repliesOf,
  replyAsks,
  S8_GROUPS,
  saidFacts,
  scoreSession,
  settledOf,
  staleThread,
  stagesOf,
  summarize,
  TOPIC,
} from '../evals/listening';
import type { JevFn, Question } from '../jev';
import type { Move } from '../lib';
import type { Session } from '../session';

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'listening', `${name}.json`), 'utf8')) as Session;
/** Two saved simulated conversations, trimmed to what the test reads. */
const snow = fixture('office-snow');
const moon = fixture('moon-market');
const loaded = (session: Session, over: Partial<Loaded> = {}): Loaded => ({
  key: session.id,
  path: `/nowhere/${session.id}.json`,
  session,
  hash: 'h',
  dream: session.name.replace(/^simulated: /, ''),
  origin: 'simulated',
  source: null,
  sourceId: null,
  ...over,
});
const env = (over: Partial<Env> = {}): Env => ({
  facts: { about: '', dreams: {} },
  dreamText: () => 'the dream as the dreamer knew it',
  detail: () => null,
  ...over,
});
/** Jev stood in for: every question gets `p`, unless `by` says otherwise for it. */
const answering =
  (p: number, by: (a: Ask) => number | undefined = () => undefined) =>
  (a: Ask) =>
    by(a) ?? p;
const ALL_KINDS: Move['kind'][] = [
  'open_ended',
  'follow',
  'explore_thread',
  'circle_back',
  'probe_goal',
  'acknowledge',
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
];

describe('questions in a reply', () => {
  test('each sentence ending in a question mark, after the reaction', () => {
    expect(
      questionsOf("snow falling indoors and nobody notices... that's odd. do you remember what happened next?"),
    ).toEqual(['do you remember what happened next?']);
    expect(questionsOf('which of those feels closest? or would you describe your own?')).toEqual([
      'which of those feels closest?',
      'or would you describe your own?',
    ]);
    expect(questionsOf('a snowman holding a coffee mug.\n\nwhat happened after that?')).toEqual([
      'what happened after that?',
    ]);
    expect(questionsOf('still and gone, but not in a bad way. i like that.')).toEqual([]);
  });

  test("the host's own words, before the repair, from the JSON it returned", () => {
    expect(rawText('{"response":["hey.","what happened next?"]}')).toBe('hey.\n\nwhat happened next?');
    expect(rawText('["one","two"]')).toBe('one\n\ntwo');
    expect(rawText('not json')).toBe('not json');
    expect(rawText(undefined)).toBeNull();
  });
});

describe('the ways of drawing it', () => {
  const brief = snow.turns.find((t) => t.move.kind === 'choose_style')?.brief ?? '';

  test("read from the brief: each way's name and its line", () => {
    const ways = offeredStyles(brief);
    expect(ways.map((w) => w.name)).toEqual([
      'a soft watercolour',
      'pale coloured pencil on grey paper',
      'white and grey with a little blue, like an old photograph',
      'the way it looked, as something real',
    ]);
    expect(ways[0].line).toBe('soft and watery, like a memory just out of focus');
    // A name with a comma in it is one way.
    expect(offeredStyles(moon.turns[17].brief).map((w) => w.name)).toEqual([
      'a bright, dreamy print',
      'soft glowing watercolour',
      'a colourful crayon drawing',
      'a lifelike digital painting',
    ]);
    expect(offeredStyles('<brief>\nMove: follow.\n</brief>')).toEqual([]);
  });

  test('named in the reply, or deleted by the one-question repair (moon market, 26 Sep)', () => {
    const at = snow.turns.findIndex((t) => t.move.kind === 'choose_style');
    const reply = snow.transcript.filter((e) => e.role === 'assistant')[at].content;
    expect(offeredStyles(brief).filter((w) => mentions(reply, w.name))).toHaveLength(4);
    const cut = moon.transcript.filter((e) => e.role === 'assistant')[17].content;
    expect(offeredStyles(moon.turns[17].brief).filter((w) => mentions(cut, w.name))).toHaveLength(0);
  });
});

describe('the retelling ends with the moments', () => {
  test('a list of at least three items at its end, its closing question aside', () => {
    const prose =
      'so you were at your own desk and it started snowing inside. then dele turned into a snowman.\n\ndid i get that right?';
    expect(endsWithList(prose)).toBe(false);
    expect(
      endsWithList(
        'so it went like this:\n- snow starts falling inside the office\n- dele turns into a snowman\n- the snowball glows in your hand\n\ndid i get that right?',
      ),
    ).toBe(true);
    expect(endsWithList('the moments: 1. the office 2. the snowman 3. the snowball')).toBe(true);
    expect(endsWithList('- the office\n- the snowman\n\nright?')).toBe(false);
  });

  test("the items of the closing list, to be held to the breakdown's moments", () => {
    expect(endingList('so:\n1. the office\n2. the snowman\n3. the snowball\n\nright?')).toEqual([
      'the office',
      'the snowman',
      'the snowball',
    ]);
    expect(endingList('the moments: 1. the office 2. the snowman 3. the snowball')).toEqual([
      'the office',
      'the snowman',
      'the snowball',
    ]);
  });
});

describe('moves', () => {
  test('every move belongs to one part, and the S8 target leaves the picture turns out', () => {
    for (const k of ALL_KINDS) expect(GROUPS).toContain(groupOf(k));
    expect(S8_GROUPS).not.toContain('pictures');
    expect(S8_GROUPS).not.toContain('close');
    expect(groupOf('probe_goal')).toBe('listen');
    expect(groupOf('confirm_profile')).toBe('build');
  });

  test('every goal has the words its question carries', () => {
    for (const g of DREAM_GOALS) expect(TOPIC[g.id]).toBeTruthy();
  });

  test('one question per move, with criteria that say what counts', () => {
    const r = repliesOf(snow, () => null)[5];
    for (const kind of ALL_KINDS) {
      const move = { kind, goalId: 'look', threadId: 'msg_1', itemId: 'p1', styleId: 'a' } as unknown as Move;
      const q = complianceQuestion({ ...r, move, key: kind, turn: 3, rule: '' }, snow) as Extract<
        Question,
        { type: 'noul' }
      >;
      expect(q.type).toBe('noul');
      expect(q.criteria?.true).toBeTruthy();
      expect(q.criteria?.false).toBeTruthy();
      // The generic pair read "would you like to see it drawn?" as not asking it (0.49).
      expect(q.criteria?.true).not.toMatch(/does that$/);
    }
  });

  test('a thread older than the message answered passes on either message', () => {
    // crayon cat, turn 3: the thread is the tiny dreamer in the grass (message 3); the reply answers message 5, Biscuit.
    expect(staleThread({ kind: 'explore_thread', threadId: 'msg_3' }, 3)).toBe(true);
    expect(staleThread({ kind: 'explore_thread', threadId: 'msg_5' }, 3)).toBe(false);
    expect(staleThread({ kind: 'follow' }, 3)).toBeUndefined();
    const r = repliesOf(snow, () => null)[5];
    const q = complianceQuestion({ ...r, move: { kind: 'explore_thread', threadId: 'msg_1' } }, snow);
    expect(q.instructions).toContain('or in their latest one');
    expect(q.instructions).toContain(r.last?.slice(0, 40) ?? '');
  });

  test('a goal question names the goal, a thread question quotes the message', () => {
    const r = repliesOf(snow, () => null)[5];
    const look = complianceQuestion({ ...r, move: { kind: 'probe_goal', goalId: 'look' } }, snow);
    expect(look.instructions).toContain(TOPIC.look);
    const thread = complianceQuestion({ ...r, move: { kind: 'explore_thread', threadId: 'msg_9' } }, snow);
    expect(thread.instructions).toContain(snow.transcript[9].content.slice(0, 60));
    expect(thread.instructions).not.toContain('latest one');
  });

  test('a profile question names who is described, from the brief', () => {
    const replies = repliesOf(snow, () => null);
    const start = replies.find((r) => r.move.kind === 'start');
    expect(start && complianceQuestion(start, snow).instructions).toContain('the manager, dele');
    const dreamer = replies.find((r) => /ask gently how they'd like to be drawn/.test(r.brief));
    expect(dreamer && complianceQuestion(dreamer, snow).instructions).toContain('how they would like to be drawn');
  });
});

describe('a conversation cut into replies', () => {
  test('each reply with its move, its brief, and what the person had said', () => {
    const replies = repliesOf(snow, () => null);
    expect(replies).toHaveLength(snow.turns.length);
    expect(replies[0]).toMatchObject({ turn: 0, key: 'open_ended', last: null, said: [] });
    const person = snow.transcript.filter((e) => e.role === 'user').map((e) => e.content);
    expect(replies[5].last).toBe(person[4]);
    expect(replies[5].said).toEqual(person.slice(0, 5));
    expect(replies[5].text).toBe(snow.transcript.filter((e) => e.role === 'assistant')[5].content);
    expect(replies[5].key).toBe('probe_goal:you_in_it');
  });

  test("a replay's replies that are its source's word for word are marked copied", () => {
    const replay: Session = {
      ...snow,
      // Transcript entry 24 is Berry's 13th reply (the opening is the first).
      transcript: snow.transcript.map((e, i) => (i === 24 ? { ...e, content: 'said anew' } : e)),
    };
    const replies = repliesOf(replay, () => null, snow);
    expect(replies.slice(0, 12).every((r) => r.copied)).toBe(true);
    expect(replies[12].copied).toBe(false);
  });

  test("what a conversation's name says", () => {
    expect(nameOf('simulated: office-snow')).toEqual({ dream: 'office-snow', origin: 'simulated', source: null });
    expect(nameOf('replayed (record-on-final): car-park from dream-0926-100518-538d')).toEqual({
      dream: 'car-park',
      origin: 'replay',
      source: 'dream-0926-100518-538d',
    });
    expect(nameOf('the theater')).toBeNull();
  });
});

describe('answers read as unclear', () => {
  test('the reading a turn recorded, from its signals or its rule', () => {
    expect(readingOf('profile', { rule: 'B2: no clear answer about the profile' })).toBe('unclear');
    expect(readingOf('profile', { rule: 'B1: profile you_choose — next one' })).toBe('you_choose');
    expect(readingOf('profile', { rule: 'B2: no clear answer about the profile' }, { profile_reply: 'unclear' })).toBe(
      'unclear',
    );
    expect(readingOf('retell', { rule: 'R3: no clear answer to the retelling' })).toBe('unclear');
    expect(readingOf('retell', { rule: 'R1: retelling confirmed' })).toBe('confirmed');
    expect(readingOf('retell', { rule: 'R4: the dream goes on past the retelling — back to listening' })).toBe(
      'goes_on',
    );
  });

  test('a choice that settles the question, summed over its settling answers ("leave it as you\'ve pictured it")', () => {
    expect(
      settledOf({
        type: 'choice',
        choice: 'confirmed',
        confidence: 0.39,
        probabilities: { you_choose: 0.45, changes: 0, confirmed: 0.55, unclear: 0 },
      }),
    ).toBeCloseTo(1);
    expect(settledOf({ type: 'noul', noul: 0.4 })).toBeNull();
  });
});

describe('facts marked said', () => {
  test('a value cut into one fact per clause', () => {
    expect(clausesOf('a blue suit, holding a coffee mug; tall')).toEqual([
      'a blue suit',
      'holding a coffee mug',
      'tall',
    ]);
    expect(clausesOf('short, dark hair')).toEqual(['short, dark hair']);
    expect(clausesOf('unknown')).toEqual([]);
    expect(clausesOf('the dreamer')).toEqual([]);
  });

  test("the breakdown's said clauses and the sketches', each once, said of their subject, with every field", () => {
    const facts = saidFacts(snow);
    const suit = facts.find((f) => f.statement === 'the manager, dele: a blue suit');
    expect(suit).toMatchObject({ about: 'the manager, dele', claim: 'a blue suit' });
    expect(suit?.from).toEqual(['person:p2.wardrobe', 'sketch:p2.wardrobe']);
    // A moment is asked whole: one thing that happened.
    const m1 = facts.find((f) => f.from.includes('moment:m1'));
    expect(m1?.claim).toBe('snow starts falling inside the office; no one else looks up');
    // Never a field's stem around the claim: "the light in the office is …" claimed light nobody spoke of.
    expect(facts.every((f) => !/ is$| looks$| wears$/.test(f.about))).toBe(true);
    // A guess is not a said fact.
    expect(facts.some((f) => f.statement.includes('adult in his 40s'))).toBe(false);
    expect(facts.some((f) => f.statement.includes('soft, even indoor light'))).toBe(false);
  });

  test('every dream fact is one line with a kind, for every simulated dream', () => {
    const f = loadFacts();
    const ids = Object.values(f.dreams).flatMap((xs) => xs.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const [dream, xs] of Object.entries(f.dreams)) {
      expect(readFileSync(join(import.meta.dir, '..', 'dreams', `${dream}.md`), 'utf8').length).toBeGreaterThan(0);
      for (const x of xs) expect(['who', 'where', 'look', 'light', 'size', 'position']).toContain(x.kind);
    }
  });
});

describe('scoring a conversation', () => {
  test('every reply scored against its move; leading on every listening reply, either/or where it asks', () => {
    const s = scoreSession(loaded(snow), env(), answering(0.9));
    const t = s.sums;
    expect(t.replies).toBe(snow.turns.length);
    const s8 = s.replies.filter((r) => S8_GROUPS.includes(r.group)).length;
    expect(t.s8).toEqual([s8, s8]);
    const listening = s.replies.filter((r) => r.group === 'listen' && r.turn > 0);
    const asking = listening.filter((r) => r.questions > 0).length;
    expect(t.listening.replies).toBe(listening.length);
    expect(t.listening.asking).toBe(asking);
    expect(t.listening.eitherOr).toBe(asking);
    expect(t.listening.leading).toBe(listening.length);
    expect(t.listening.both).toBe(asking);
    // A statement is read too: the leading question is asked of the reply with no question in it.
    // (moon market, turn 1: "oh wow... all that color against grey. that must have made everything feel kind of electric.")
    const statement = scoreSession(loaded(moon), env(), answering(0.9)).replies.find((r) => r.turn === 1);
    expect(statement?.questions).toBe(0);
    expect(statement?.leading).toBe(0.9);
    expect(statement?.eitherOr).toBeUndefined();
    // The picture turns are scored but kept out of the S8 count.
    expect(t.compliance.pictures[1]).toBeGreaterThan(0);
    expect(s.replies.find((r) => r.group === 'build')?.eitherOr).toBeUndefined();
  });

  test('a goal question that asked something else is a miss; the probe count is its own', () => {
    const s = scoreSession(
      loaded(snow),
      env(),
      answering(0.9, (a) => (a.question.instructions.includes(TOPIC.you_in_it) ? 0.1 : undefined)),
    );
    const probes = s.replies.filter((r) => r.move.startsWith('probe_goal:'));
    const youInIt = probes.filter((r) => r.move === 'probe_goal:you_in_it').length;
    expect(s.sums.probe).toEqual([probes.length - youInIt, probes.length]);
    expect(s.sums.probeByGoal.you_in_it).toEqual([0, youInIt]);
  });

  test('an answer that says nothing read as settled is counted too', () => {
    const s = scoreSession(
      loaded(snow),
      env(),
      answering(0.9, (a) =>
        a.question === undefined ? 0.9 : a.question.instructions.startsWith('The listener described') ? 0.1 : undefined,
      ),
    );
    // Every profile answer found no answer; those read as confirmed or left to us are misread.
    const settled = s.answers.filter((a) => a.kind === 'profile' && a.reading !== 'unclear').length;
    expect(s.sums.answers.profile.unclearReadSettled).toBe(settled);
  });

  test('a clear answer read as unclear is counted only when the reply asked the question', () => {
    // office snow, turn 14: "go with that", read unclear; turn 15 answers a reply that asked about the light instead.
    const s = scoreSession(
      loaded(snow),
      env(),
      answering(0.9, (a) => (a.question.instructions.includes('simply whether its picture of') ? 0.1 : undefined)),
    );
    const profile = s.answers.filter((a) => a.kind === 'profile');
    expect(profile.find((a) => a.turn === 14)?.reading).toBe('unclear');
    expect(s.sums.answers.profile.readUnclear).toBe(2);
    expect(s.sums.answers.profile.clearReadUnclear).toBe(1);
    expect(s.sums.answers.profile.unasked).toBe(1);
  });

  test('said facts: in their words, agreed to, in the dream file or not', () => {
    const s = scoreSession(
      loaded(snow),
      env(),
      answering(0.9, (a) => {
        const q = a.question.instructions;
        const suit = q.includes('about the manager, dele,') && q.includes('"a blue suit"');
        if (suit && q.startsWith('Did the person say')) return 0.1;
        if (suit && q.startsWith('Does this account')) return 0.2;
        if (suit && q.startsWith('In `conversation`')) return 0.1;
        return undefined;
      }),
    );
    expect(s.sums.facts.notTold).toBe(1);
    expect(s.sums.facts.notToldFirm).toBe(1);
    expect(s.sums.facts.notToldNotInDream).toBe(1);
    expect(s.sums.facts.said).toBe(s.facts.length);
    expect(s.sums.facts.bySource.sketch[1]).toBeGreaterThan(0);
  });

  test("style offers: the repair's deleted ways counted as kept none; a missing answer is never a pass", () => {
    const s = scoreSession(
      loaded(moon),
      env(),
      answering(0.9, (a) =>
        a.question.instructions.startsWith('Does `listener_reply` offer this way') ? 0.05 : undefined,
      ),
    );
    const offer = s.replies.find((r) => r.move === 'choose_style');
    expect(offer).toMatchObject({ offered: 4, kept: 0, keptCode: 0 });
    expect(s.sums.styles).toMatchObject({ offers: 1, noneKept: 1, allKept: 0 });
    const unanswered = scoreSession(loaded(moon), env(), () => null);
    expect(unanswered.sums.s8).toEqual([0, 0]);
    expect(unanswered.sums.styles.offers).toBe(0);
    expect(unanswered.sums.unanswered).toBeGreaterThan(0);
  });

  test("a replay counts only what it said anew, and its source's coverage stays with the source", () => {
    const replay: Session = { ...snow, name: 'replayed (fake): office-snow from dream-0926-095122-b91f' };
    const facts = { about: '', dreams: { 'office-snow': [{ id: 'x', kind: 'who' as const, fact: 'Dele is there.' }] } };
    const s = scoreSession(loaded(replay, { origin: 'replay', source: snow }), env({ facts }), answering(0.9));
    expect(s.sums.replies).toBe(0);
    expect(s.coverage).toEqual([]);
    const own = scoreSession(loaded(snow), env({ facts }), answering(0.9));
    expect(own.sums.coverage).toMatchObject({ facts: 1, told: 1 });
  });

  test('said facts near the bar are listed apart from the firm ones', () => {
    const s = scoreSession(
      loaded(snow),
      env(),
      answering(0.9, (a) => {
        const q = a.question.instructions;
        if (q.startsWith('Did the person say') && q.includes('"a blue suit"')) return 0.1;
        if (q.startsWith('Did the person say') && q.includes('"desks')) return 0.4;
        return undefined;
      }),
    );
    expect(s.sums.facts.notToldFirm).toBe(1);
    expect(s.sums.facts.notToldNear).toBeGreaterThan(0);
    const sum = summarize({ label: 'x', at: '', commit: null, switches: {}, jevModel: 'm', inputs: {} as never }, [s]);
    expect(sum.flags.unsaid.map((f) => f.statement)).toEqual(['the manager, dele: a blue suit']);
    expect(sum.flags.near.length).toBe(s.sums.facts.notToldNear);
  });

  test('coverage: told facts kept as said, and what was never asked nor told', () => {
    const facts = {
      about: '',
      dreams: {
        'office-snow': [
          { id: 'a', kind: 'who' as const, fact: 'Dele is there.' },
          { id: 'b', kind: 'size' as const, fact: 'Dele is tall.' },
        ],
      },
    };
    const s = scoreSession(
      loaded(snow),
      env({ facts }),
      answering(0.9, (a) => {
        const q = a.question.instructions;
        if (q.includes('"Dele is tall."') && !q.includes('any of it')) return 0.1;
        if (q.includes('kept_as_said')) return 0.2;
        return undefined;
      }),
    );
    expect(s.sums.coverage).toMatchObject({ facts: 2, told: 1, carried: 0, askedNotTold: 0, never: 1 });
    expect(floors(s.sums)).toMatchObject({ toldOrAsked: 0.5, neverAskedNorTold: 0.5, toldCarriedAsSaid: 0 });
  });

  test('a leading question the person only agreed to', () => {
    // office snow, turn 5: "…about to throw it, or just holding it?", answered "just holding it. …"
    const s = scoreSession(loaded(snow), env(), answering(0.2));
    expect(s.sums.listening.leading).toBe(0);
    expect(s.replies.find((r) => r.turn === 5)?.agreed).toBe(false);
    const yeah: Session = {
      ...snow,
      transcript: snow.transcript.map((e, i) => (i === 11 ? { ...e, content: 'yeah, i was about to throw it' } : e)),
    };
    const led = scoreSession(loaded(yeah), env(), answering(0.9));
    expect(led.replies.find((r) => r.turn === 5)?.agreed).toBe(true);
  });
});

describe('asking Jev', () => {
  test('questions over one state go in one call, and a cached answer is never asked again', async () => {
    let calls = 0;
    const jev: JevFn = async (state, questions) => {
      calls++;
      const answers = Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul' as const, noul: 0.8 }]));
      return { questions, state, answers, error: null, ms: 1, usage: null, model: 'm' };
    };
    const q = (x: string): Question => ({ type: 'noul', instructions: x });
    const asks: Ask[] = [
      { state: 'A', question: q('one') },
      { state: 'A', question: q('two') },
      { state: 'B', question: q('one') },
    ];
    const cache: JevCache = {};
    expect(await askAll(asks, jev, cache, { model: 'm' })).toEqual([]);
    expect(calls).toBe(2);
    expect(cache[askKey(asks[1], 'm')]?.p).toBe(0.8);
    await askAll(asks, jev, cache, { model: 'm' });
    expect(calls).toBe(2);
    // At most perCall questions to a call.
    await askAll(
      [1, 2, 3].map((n) => ({ state: 'C', question: q(`q${n}`) })),
      jev,
      cache,
      { model: 'm', perCall: 2 },
    );
    expect(calls).toBe(4);
    // The key moves with the model, the question and the state.
    expect(askKey(asks[0], 'm')).not.toBe(askKey(asks[0], 'n'));
    expect(askKey(asks[0], 'm')).not.toBe(askKey(asks[2], 'm'));
  });
});

describe('totals and two runs compared', () => {
  test('which parts a conversation reached', () => {
    expect(stagesOf(snow)).toEqual({ retelling: 1, style: 1, profile: 1 });
    expect(stagesOf({ turns: snow.turns.slice(0, 8) })).toEqual({ retelling: 0, style: 0, profile: 0 });
  });

  test('conversations add up, and the headline says which targets are met', () => {
    const a = scoreSession(loaded(snow), env(), answering(0.9)).sums;
    const b = scoreSession(loaded(moon), env(), answering(0.1)).sums;
    const t = addSums([a, b]);
    expect(t.replies).toBe(a.replies + b.replies);
    expect(t.s8).toEqual([a.s8[0] + b.s8[0], a.s8[1] + b.s8[1]]);
    expect(t.facts.said).toBe(a.facts.said + b.facts.said);
    expect(t.conversations).toBe(2);
    const h = headline(t);
    expect(h.find((x) => x.name.startsWith('move compliance'))?.met).toBe(false);
    expect(headline(a).find((x) => x.name.startsWith('move compliance'))?.met).toBe(true);
    // Floors need the run before; a run that asks less than before misses its floor.
    expect(h.find((x) => x.name === 'floor: questions per listening reply')?.met).toBeNull();
    const fewer = { ...a, listening: { ...a.listening, questions: 0 } };
    expect(headline(fewer, a).find((x) => x.name === 'floor: questions per listening reply')?.met).toBe(false);
    expect(headline(a, a).find((x) => x.name === 'floor: questions per listening reply')?.met).toBe(true);
  });

  test('--against pairs dream by dream, and replies one by one only in the very same conversation', () => {
    const head = (label: string) => ({
      label,
      at: '',
      commit: null,
      switches: {},
      jevModel: 'm',
      inputs: { data: 'x', sessions: {}, facts: 'f', dreams: {}, questions: 'q' },
    });
    const before = scoreSession(loaded(snow), env(), answering(0.9));
    const now = scoreSession(
      loaded(snow),
      env(),
      answering(0.9, (a) => (a.question.instructions.includes(TOPIC.telling) ? 0.1 : undefined)),
    );
    const other = scoreSession(loaded(moon), env(), answering(0.9));
    const a = { ...summarize(head('a'), [before, other]), sessions: [before, other] };
    const b = { ...summarize(head('b'), [now]), sessions: [now] };
    const lines = compare(a, b);
    expect(lines.some((l) => l.includes('office-snow') && l.includes('>'))).toBe(true);
    expect(lines.some((l) => l.startsWith('  moon-market') && l.includes('>—'))).toBe(true);
    expect(lines.some((l) => /turn 1 probe_goal:telling: did \(0\.90\) -> missed \(0\.10\)/.test(l))).toBe(true);
    const renamed = { ...now, hash: 'another conversation' };
    expect(
      compare(a, { ...summarize(head('c'), [renamed]), sessions: [renamed] }).some((l) => /turn 1 probe/.test(l)),
    ).toBe(false);
  });

  test('the question wordings have one hash, which moves with any of them', () => {
    expect(questionsHash()).toMatch(/^[0-9a-f]{16}$/);
    expect(questionsHash()).toBe(questionsHash());
  });
});

describe('frozen conversations', () => {
  test('a conversation frozen with its turn details scores as it did', () => {
    const details = (t: number) =>
      t === 14
        ? { stateAfter: { signals: { profile_reply: 'unclear' } }, hostRaw: '{"response":["other words"]}' }
        : null;
    const live = scoreSession(loaded(snow), env({ detail: (_l, t) => details(t) }), answering(0.9));
    const dir = mkdtempSync(join(tmpdir(), 'listening-'));
    const path = join(dir, `${snow.id}.json`);
    writeFileSync(path, JSON.stringify(freeze(loaded(snow), details)));
    const l = load(path, dir, new Map());
    expect(l?.key).toBe(snow.id);
    const frozen = scoreSession(l as Loaded, env({ detail: (x, t) => x.details?.[String(t)] ?? null }), answering(0.9));
    expect(frozen.sums).toEqual(live.sums);
    expect(frozen.replies.find((r) => r.turn === 14)?.rawQuestions).toBe(0);
  });
});

describe('the hand-labelled replies', () => {
  const items = (
    JSON.parse(readFileSync(join(import.meta.dir, '..', 'evals', 'listening-audit.json'), 'utf8')) as {
      items: AuditItem[];
    }
  ).items;

  test("each is kept whole: its reply last, the person's messages before it, a label for its move", () => {
    expect(items.length).toBeGreaterThanOrEqual(20);
    for (const it of items) {
      expect(it.transcript).toHaveLength(2 * it.turn + 1);
      expect(it.transcript.at(-1)?.role).toBe('assistant');
      expect(typeof it.labels.move).toBe('boolean');
      const r = auditReply(it);
      if (r.group !== 'listen') expect(it.labels.leading).toBeUndefined();
      expect(
        replyAsks(r, { transcript: it.transcript as Session['transcript'] }).move.question.instructions,
      ).toBeTruthy();
    }
  });

  test('agreement counts each label against the answer', () => {
    const all = auditAgreement(items, () => 0.9);
    expect(all.move.of).toBe(items.length);
    expect(all.move.agree).toBe(items.filter((i) => i.labels.move).length);
    expect(all.leading.missed.length).toBe(items.filter((i) => i.labels.leading === false).length);
  });
});
