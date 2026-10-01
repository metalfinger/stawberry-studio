// Their telling, read before the breakdown (telling.ts; the one builder's `strangest`, `told_events` and
// `thought_outside`): the strangest fact and every told event quoted from it, nothing invented; the producer told
// them, the draft checked against them and asked for once more where it falls short. Every model here is a stand-in.
import { describe, expect, test } from 'bun:test';
import type { JevFn } from '../jev';
import { producerSystem } from '../producer';
import { draftTold, fixNote, quoted, readTelling, tellingNote, untold, type WriteFn } from '../telling';

function withBuilder<T>(v: string | undefined, fn: () => T): T {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = v;
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}
async function withBuilderAsync<T>(v: string | undefined, fn: () => Promise<T>): Promise<T> {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = v;
    return await fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

const BARLEY =
  'Then the meeting was over, and I wondered if they would play cards now. I went to talk to G.H. She said something about "barley degrees". I asked her if I had ever told her about my "barley degree", then realized it was some financial transaction of her husband\'s that she was speaking of.';

const write =
  (reply: unknown): WriteFn =>
  async () => ({ content: JSON.stringify(reply) });

const d = () => ({ value: null, said: false });
const moment = (id: string, action: string, point: string, key = false) => ({
  id,
  action,
  visible: ['p1'],
  things: [],
  place: 'l1',
  eyes: 'dreamer',
  distance: 'medium',
  looks_at: 'G.H.',
  feeling: '',
  visual_point: point,
  purpose: '',
  continues: false,
  leaves: [],
  shift: '',
  key,
  said: true,
});
const raw = (moments: ReturnType<typeof moment>[]) =>
  JSON.stringify({
    title: 'Barley Degrees',
    people: [
      {
        id: 'p1',
        name: 'g.h.',
        is_dreamer: false,
        protagonist: true,
        fields: { identity: d(), appearance: d(), wardrobe: d(), distinctive_features: d() },
      },
    ],
    places: [{ id: 'l1', name: 'the meeting room', fields: { geography: d(), landmarks: d(), light: d() } }],
    things: [],
    scenes: [{ id: 's1', title: '', place: 'l1', mood: '', moments }],
    style_options: [],
  });
const milling = raw([
  moment('m1', 'The meeting breaks up', 'people milling about'),
  moment('m2', 'G.H. speaks about barley degrees', 'G.H. talking', true),
]);
const mixUp = raw([
  moment('m1', 'The meeting breaks up', 'people milling about'),
  moment('m2', 'G.H. speaks about barley degrees', 'G.H. talking'),
  moment(
    'm3',
    "The dreamer realizes G.H. meant a money matter of her husband's",
    "the dreamer's face as it dawns on them",
    true,
  ),
]);
const jevSays =
  (answers: Record<string, number>, asked: string[][] = []): JevFn =>
  async (state, questions) => {
    asked.push(Object.keys(questions));
    return {
      questions,
      state,
      answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { type: 'noul', noul: v }])),
      error: null,
      ms: 0,
      usage: null,
      model: 'stand-in',
    } as unknown as Awaited<ReturnType<JevFn>>;
  };

describe('their telling, quoted', () => {
  test('a quote is theirs only as they said it; anything of ours is dropped', async () => {
    expect(quoted('then realized it was some financial transaction of her husband’s', BARLEY)).not.toBeNull();
    expect(quoted('the dreamer is embarrassed', BARLEY)).toBeNull();
    const t = await readTelling(
      BARLEY,
      write({
        strangest: {
          quote: "then realized it was some financial transaction of her husband's that she was speaking of",
          kind: 'thought',
        },
        events: [
          { quote: 'I wondered if they would play cards now', essential: false },
          { quote: 'G.H. felt awkward', essential: true },
          { quote: 'She said something about "barley degrees"', essential: true },
        ],
      }),
    );
    expect(t.strangest?.kind).toBe('thought');
    expect(t.events).toEqual(['I wondered if they would play cards now', 'She said something about "barley degrees"']);
    // Only theirs is essential: an event of ours is dropped, its mark with it.
    expect(t.essential).toEqual(['She said something about "barley degrees"']);
    // A strangest fact in our words is none.
    expect(
      (await readTelling(BARLEY, write({ strangest: { quote: 'a mix-up about degrees' }, events: [] }))).strangest,
    ).toBeNull();
    // A writer that fails reads nothing.
    expect(await readTelling(BARLEY, async () => ({ content: 'not json' }))).toEqual({
      strangest: null,
      events: [],
      essential: [],
    });
  });

  test("the producer's rules: as before with the steps off, the thought seen and the words kept with them on", () => {
    // Up to the step before, the prompt is the one before them, word for word: only the two rules are added.
    const before = withBuilder('sketch_subjects', () => producerSystem());
    const on = withBuilder('thought_outside', () => producerSystem());
    expect(on).toContain("A moment whose one thing is the dreamer's own thought");
    expect(on).toContain('"no marzipan anywhere", never "finding nothing"');
    const added = [
      on.slice(
        on.indexOf(' A moment whose one thing'),
        on.indexOf('they saw it that way.') + 'they saw it that way.'.length,
      ),
      on.slice(
        on.indexOf(' It names what they named'),
        on.indexOf('supposed to happen.') + 'supposed to happen.'.length,
      ),
    ];
    expect(added.reduce((s, x) => s.replace(x, ''), on)).toBe(before);
    expect(withBuilder(undefined, () => producerSystem())).not.toContain('their face and what they do carrying it');
  });
});

describe('the breakdown drafted with their telling', () => {
  const telling = {
    strangest: { quote: "then realized it was some financial transaction of her husband's", kind: 'thought' },
    events: [
      'I wondered if they would play cards now',
      "then realized it was some financial transaction of her husband's",
    ],
    essential: [] as string[],
  };

  test('with the steps off, or for a revision, the producer as it was: one draft, no reading', async () => {
    for (const [v, previous] of [
      ['sketch_subjects', undefined],
      ['thought_outside', JSON.parse(milling)],
    ] as const) {
      const calls: unknown[][] = [];
      const got = await withBuilderAsync(v, () =>
        draftTold('user: the dream', BARLEY, previous, {
          jev: jevSays({}),
          produce: async (...args) => {
            calls.push(args);
            return { raw: milling, ms: 1 };
          },
          write: async () => {
            throw new Error('never read');
          },
        }),
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][2]).toBeUndefined();
      expect(got).toEqual({ raw: milling, ms: 1, notes: [] });
    }
  });

  test('read first, told to the producer, checked, and asked once more where a told event or the turn is missing', async () => {
    const calls: unknown[][] = [];
    const asked: string[][] = [];
    // The first draft leaves out the realising and keys G.H. talking; the second has both.
    let n = 0;
    const jev: JevFn = async (state, questions) =>
      jevSays(n++ === 0 ? { e0: 0.9, e1: 0.1, key: 0.1 } : { e0: 0.9, e1: 0.9, key: 0.9 }, asked)(state, questions);
    const got = await withBuilderAsync('thought_outside', () =>
      draftTold('user: the dream', BARLEY, undefined, {
        jev,
        write: write(telling),
        produce: async (...args) => {
          calls.push(args);
          return { raw: calls.length === 1 ? milling : mixUp, ms: 1 };
        },
      }),
    );
    expect(calls).toHaveLength(2);
    const note = (calls[0][2] as { note: string }).note;
    expect(note).toContain(`What stays with them, the dream's strangest fact: "${telling.strangest.quote}"`);
    expect(note).toContain('1. "I wondered if they would play cards now"');
    const again = calls[1][2] as { note: string; fix: string };
    expect(again.note).toBe(note);
    expect(again.fix).toContain(`It leaves out what they told here: 1. "${telling.events[1]}"`);
    expect(again.fix).toContain('Its key moment does not show what stays with them');
    // The first draft goes with the ask, as the breakdown to change.
    expect((calls[1][1] as { scenes: { moments: unknown[] }[] }).scenes[0].moments).toHaveLength(2);
    expect(asked[0]).toEqual(['e0', 'e1', 'key']);
    expect(got.raw).toBe(mixUp);
    expect(got.notes[0]).toContain('1 of 2 told events in a moment, the strangest fact not keyed; asked again: 2 of 2');
  });

  test('a second draft no better is not taken, and a draft that meets it all is never asked again', async () => {
    const calls: unknown[][] = [];
    const got = await withBuilderAsync('thought_outside', () =>
      draftTold('user: the dream', BARLEY, undefined, {
        jev: jevSays({ e0: 0.9, e1: 0.1, key: 0.1 }),
        write: write(telling),
        produce: async (...args) => {
          calls.push(args);
          return { raw: calls.length === 1 ? milling : mixUp, ms: 1 };
        },
      }),
    );
    expect(calls).toHaveLength(2);
    expect(got.raw).toBe(milling);
    expect(got.notes[0]).toContain('the first kept');
    const once: unknown[][] = [];
    await withBuilderAsync('thought_outside', () =>
      draftTold('user: the dream', BARLEY, undefined, {
        jev: jevSays({ e0: 0.9, e1: 0.9, key: 0.9 }),
        write: write(telling),
        produce: async (...args) => {
          once.push(args);
          return { raw: mixUp, ms: 1 };
        },
      }),
    );
    expect(once).toHaveLength(1);
  });

  test('a question Jev leaves unanswered is no finding, and each step asks only its own', async () => {
    const b = JSON.parse(mixUp);
    const t = {
      strangest: { quote: telling.strangest.quote, kind: 'thought' as const },
      events: telling.events,
      essential: [] as string[],
    };
    expect(await withBuilderAsync('thought_outside', () => untold(b, t, jevSays({})))).toEqual({
      missing: [],
      keyed: true,
    });
    const asked: string[][] = [];
    await withBuilderAsync('strangest', () => untold(b, t, jevSays({}, asked)));
    expect(asked[0]).toEqual(['key']);
    expect(withBuilder('strangest', () => tellingNote(t))).not.toContain('What they told, in their order');
  });

  test('an essential event is the one thing some moment shows: asked of the points, named so, asked for so', async () => {
    // The retell gate (a stranger reading only the points) lost the barley question where only an action had it.
    const b = JSON.parse(mixUp);
    const asked = 'I asked her if I had ever told her about my "barley degree"';
    const t = { strangest: null, events: ['I wondered if they would play cards now', asked], essential: [asked] };
    let questions: Record<string, { instructions: string }> = {};
    const jev: JevFn = async (state, q) => {
      questions = q as typeof questions;
      return jevSays({ e0: 0.9, e1: 0.1 })(state, q);
    };
    const gap = await withBuilderAsync('thought_outside', () => untold(b, t, jev));
    expect(questions.e1.instructions).toContain('Is it the one thing some moment shows');
    expect(questions.e0.instructions).toContain('in what happens in it or in what it shows');
    expect(gap.missing).toEqual([asked]);
    const note = withBuilder('thought_outside', () => tellingNote(t))!;
    expect(note).toContain(`2. "${asked}" (essential)`);
    expect(note).toContain('Every essential one is the one thing some moment shows');
    const fix = withBuilder('thought_outside', () => fixNote(t, gap))!;
    expect(fix).toContain(
      `No moment shows what they told here, which the dream cannot be retold without: 1. "${asked}"`,
    );
    expect(fix).not.toContain('It leaves out what they told here');
  });
});
