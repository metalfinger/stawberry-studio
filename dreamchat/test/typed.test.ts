import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedFns, type Counts, limiter, TypedCache } from '../evals/typed-cache';
import { compareCamera, compareRecord } from '../evals/typed';
import type { JevFn } from '../jev';
import { type Breakdown, moments, type StyleOption } from '../producer';
import { storyRecord } from '../record';
import type { Item } from '../sheets';
import {
  judge,
  levelWords,
  parseTyped,
  readTypedMoment,
  takenOf,
  typedAsk,
  typedQuestions,
  type TypedFact,
  type WriteFn,
} from '../typed';

// The library underwater (test/fixtures/record): the water comes in under the doors at m2; at m4 the sister
// rows between the shelves; at m5 they row up to the high round window and she opens it.
type Frozen = { breakdown: Breakdown; items: Item[]; words: string[]; style: StyleOption };
const library = () =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'record', 'library-underwater.json'), 'utf8')) as Frozen;
const at = (b: Breakdown, id: string) => moments(b).find((m) => m.id === id)!;

const m5Answer = {
  acts: [
    { who: 'p2', does: 'opens', to: 'the high round window', where: 'at the top of the room' },
    { who: 'p3', does: 'swims' },
    { who: 'p9', does: 'waves' },
  ],
  motion: [
    { who: 't1', moving: true, heading: 'up to the high round window' },
    { who: 'x9', moving: true },
  ],
  fill: [
    { place: 'l1', matter: 'Water', how: 'below', against: 'the high round window' },
    { place: 'l2', matter: 'water' },
  ],
  pov: { hands: true, holding: ['t1'], own_body: false },
  containers: [
    { who: 'l1', part: 'window', open: true },
    { who: 'nobody', part: 'lid', open: false },
  ],
  beyond: [{ what: 'the city underwater', through: 'the high round window' }],
  absent: ['p3', 'zz'],
};

describe('the writer is asked and read', () => {
  test('the ask carries the cast, the story before and the moment, with the fixtures to measure by', () => {
    const f = library();
    const [system, user] = typedAsk(f.breakdown, at(f.breakdown, 'm5'));
    expect(system.content).toContain('"acts"');
    const brief = JSON.parse(user.content);
    expect(brief.story_before.map((x: { id: string }) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(brief.moment.seen).toBe('from outside');
    expect(brief.moment.place.fixtures).toContain('the high round window');
    expect(brief.people[0].name).toContain('the dreamer');
  });

  test('the answer is kept to what the moment can hold', () => {
    const f = library();
    const facts = parseTyped(JSON.stringify(m5Answer), f.breakdown, at(f.breakdown, 'm5'));
    // Acts only by those in view (the whale is not in view at m5; p9 is no one).
    expect(facts.filter((x) => x.kind === 'act').map((x) => (x as { who: string }).who)).toEqual(['p2']);
    // Motion only of those in view; the fill only of the moment's place, lower-cased.
    expect(facts.filter((x) => x.kind === 'motion')).toEqual([
      { kind: 'motion', who: 't1', moving: true, heading: 'up to the high round window' },
    ]);
    expect(facts.filter((x) => x.kind === 'fill')).toEqual([
      { kind: 'fill', place: 'l1', matter: 'water', how: 'below', against: 'the high round window' },
    ]);
    // Seen from outside: nothing of the dreamer's hands or body.
    expect(facts.some((x) => x.kind === 'hands' || x.kind === 'holding' || x.kind === 'own_body')).toBe(false);
    // Containers and the absent by an id of the dream only.
    expect(facts.filter((x) => x.kind === 'container')).toEqual([
      { kind: 'container', who: 'l1', part: 'window', open: true },
    ]);
    expect(facts.filter((x) => x.kind === 'absent')).toEqual([{ kind: 'absent', who: 'p3' }]);
    expect(facts.filter((x) => x.kind === 'beyond')).toHaveLength(1);
    // Through the dreamer's eyes, the point of view is read.
    const pov = { ...at(f.breakdown, 'm5'), eyes: 'dreamer' as const };
    const seen = parseTyped(JSON.stringify(m5Answer), f.breakdown, pov);
    expect(seen.filter((x) => x.kind === 'hands' || x.kind === 'holding' || x.kind === 'own_body')).toEqual([
      { kind: 'hands', inUse: true },
      { kind: 'holding', what: 't1' },
      { kind: 'own_body', seen: false },
    ]);
    expect(parseTyped('not json', f.breakdown, pov)).toEqual([]);
  });
});

describe("Jev's one-fact questions", () => {
  test('each fact asks its own questions, by name, and the state is the story and the moment', () => {
    const f = library();
    const m = at(f.breakdown, 'm5');
    const facts: TypedFact[] = [
      { kind: 'act', who: 'p2', does: 'opens', to: 'the high round window' },
      { kind: 'motion', who: 't1', moving: true, heading: 'up to the window' },
      { kind: 'fill', place: 'l1', matter: 'water', how: 'below', against: 'the high round window' },
      { kind: 'fill', place: 'l1', matter: 'water' },
    ];
    const { state, questions, wants } = typedQuestions(f.breakdown, m, facts);
    expect(Object.keys(questions)).toEqual([
      'act_0',
      'seen_0',
      'moving_1',
      'heading_1',
      'fill_2',
      'level_2',
      'fill_3',
      'measured_3',
    ]);
    expect(questions.act_0.instructions).toContain('the older sister opens the high round window');
    expect(questions.level_2.instructions).toContain('almost up to the high round window');
    expect(wants[3].map((w) => w.want)).toEqual(['yes', 'no']);
    const s = JSON.parse(state);
    expect(s.story_before).toHaveLength(4);
    expect(s.moment.action).toBe(m.action);
    expect(s.moment.in_view).toContain('the yellow rowing boat');
  });

  test('a fact is taken only where every question has the answer it needs; a heading not read is dropped', () => {
    const act: TypedFact = { kind: 'act', who: 'p2', does: 'opens' };
    const wants = [
      { key: 'act_0', want: 'yes' as const },
      { key: 'seen_0', want: 'yes' as const },
    ];
    expect(judge(act, wants, { act_0: 0.9, seen_0: 0.8 }).ok).toBe(true);
    expect(judge(act, wants, { act_0: 0.9, seen_0: 0.3 }).ok).toBe(false);
    expect(judge(act, wants, { act_0: 0.65, seen_0: 0.9 }).close).toBe(true);
    expect(judge(act, wants, {}).ok).toBe(false);
    const no = judge({ kind: 'hands', inUse: false }, [{ key: 'hands_0', want: 'no' }], { hands_0: 0.45 });
    expect(no.ok).toBe(false);
    const motion = judge(
      { kind: 'motion', who: 't1', moving: true, heading: 'north' },
      [
        { key: 'moving_0', want: 'yes' },
        { key: 'heading_0', want: 'yes' },
      ],
      { moving_0: 0.9, heading_0: 0.2 },
    );
    expect(motion.ok).toBe(true);
    expect('heading' in motion).toBe(false);
  });

  test('a level in words reads as the camera rules read one', () => {
    expect(levelWords({ how: 'over', against: 'desks' })).toBe('over the desks');
    expect(levelWords({ how: 'at', against: 'their knees' })).toBe('up to their knees');
    expect(levelWords({})).toBeNull();
  });
});

describe('a moment read, checked and cached', () => {
  const f = library();
  const write: WriteFn = async () => ({
    content: JSON.stringify({
      acts: [{ who: 'p2', does: 'opens', to: 'the high round window' }],
      motion: [{ who: 't1', moving: false }],
      fill: [{ place: 'l1', matter: 'water', how: 'below', against: 'the high round window' }],
      containers: [{ who: 'l1', part: 'window', open: true }],
    }),
    model: 'fake',
    ms: 0,
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });
  let jevCalls = 0;
  const jev: JevFn = async (state, questions) => {
    jevCalls++;
    const answers = Object.fromEntries(
      Object.keys(questions).map((k) => [k, { type: 'noul' as const, noul: k.startsWith('moving') ? 0.8 : 0.9 }]),
    );
    return { questions, state, answers, error: null, ms: 0, usage: null };
  };

  test('one writer call and one Jev call; the still boat Jev reads as moving is not taken', async () => {
    jevCalls = 0;
    const r = await readTypedMoment(f.breakdown, at(f.breakdown, 'm5'), write, jev);
    expect(r.cost).toEqual({ writerCalls: 1, writerIn: 100, writerOut: 20, jevCalls: 1 });
    const t = takenOf(r.reading);
    expect(t.acts).toEqual([{ kind: 'act', who: 'p2', does: 'opens', to: 'the high round window' }]);
    expect(t.motion).toEqual([]);
    expect(t.fill).toHaveLength(1);
    expect(t.containers).toHaveLength(1);
    expect(t.pov).toBeNull();
  });

  test('a moment asked again comes from the cache; with ask off, a miss reads as not cached', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'typed-')), 'cache.json');
    const cache = new TypedCache(file);
    const counts = () => ({
      writer: { asked: 0, cached: 0, missing: 0 } as Counts,
      jev: { asked: 0, cached: 0, missing: 0 } as Counts,
    });
    const c1 = counts();
    const fns = cachedFns(cache, { write, writer: 'fake', jev, jevModel: 'jev-x', ask: true }, c1);
    await readTypedMoment(f.breakdown, at(f.breakdown, 'm5'), fns.write, fns.jev);
    cache.save();
    expect(c1.writer.asked).toBe(1);
    expect(c1.jev.asked).toBe(1);
    const again = new TypedCache(file);
    const c2 = counts();
    const fns2 = cachedFns(again, { writer: 'fake', jevModel: 'jev-x', ask: false }, c2);
    const r = await readTypedMoment(f.breakdown, at(f.breakdown, 'm5'), fns2.write, fns2.jev);
    expect(c2.writer.cached).toBe(1);
    expect(c2.jev.cached).toBe(1);
    expect(takenOf(r.reading).acts).toHaveLength(1);
    const miss = await readTypedMoment(f.breakdown, at(f.breakdown, 'm4'), fns2.write, fns2.jev);
    expect(miss.error).toContain('not cached');
    expect(c2.writer.missing).toBe(1);
    // Another writer is another key.
    const c3 = counts();
    const fns3 = cachedFns(again, { writer: 'other', jevModel: 'jev-x', ask: false }, c3);
    await readTypedMoment(f.breakdown, at(f.breakdown, 'm5'), fns3.write, fns3.jev);
    expect(c3.writer.missing).toBe(1);
  });

  test('at most n at once', async () => {
    const limit = limiter(2);
    let now = 0;
    let most = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        limit(async () => {
          now++;
          most = Math.max(most, now);
          await Bun.sleep(5);
          now--;
        }),
      ),
    );
    expect(most).toBe(2);
  });
});

describe('the word lists set against the typed facts', () => {
  test('the water: the record measures nothing at the window, the typed level is almost up to it', () => {
    const f = library();
    const rec = storyRecord(f.breakdown, f.items, null, { words: f.words, style: f.style }).record;
    const typed = {
      m5: takenOf({
        moment: 'm5',
        facts: [
          {
            kind: 'fill',
            place: 'l1',
            matter: 'water',
            how: 'below',
            against: 'the high round window',
            checks: [],
            ok: true,
          },
          { kind: 'motion', who: 't1', moving: true, checks: [], ok: true },
        ],
      }),
    };
    const ps = compareCamera(f.breakdown, rec, typed, 'lib');
    const water = ps.find((p) => p.list.startsWith('water'));
    expect(water?.typed).toContain('almost up to the high round window');
    const going = ps.find((p) => p.list.startsWith('going'));
    expect(going?.verdict).toBe('agree');
  });

  test("the record's lists: each decision set against the typed facts, and the typed facts it lacks", () => {
    const f = library();
    const build = () => storyRecord(f.breakdown, f.items, null, { words: f.words, style: f.style }).record;
    const typed = {
      m5: takenOf({ moment: 'm5', facts: [{ kind: 'absent', who: 'p3', checks: [], ok: true }] }),
    };
    const ps = compareRecord(f.breakdown, build, typed, 'lib');
    expect(ps.find((p) => p.list === 'not_there' && p.verdict === 'typed only')?.typed).toBe('the whale absent');
    for (const p of ps) expect(['agree', 'disagree', 'list only', 'typed only']).toContain(p.verdict);
  });
});
