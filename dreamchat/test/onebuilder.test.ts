// S6, the one prompt builder (DREAMCHAT_ONE_BUILDER): off, every prompt as before; on, each step of the ledger
// built (HARNESS_PLAN.md, S6 eval), each retired clean-up replaced by the typed fact that covers it. The typed
// readings here are written for the test: the cache of the saved moments' readings is not in the repository.
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { goingIn, handsIn, openingsIn, selfIn, waterLevel } from '../camera';
import { BUILDER_STEPS, builderSteps, builds, oneBuilder, withRetired } from '../cleanups';
import { refsOf } from '../evals/prompt-cases';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { moments } from '../producer';
import { recordsMade } from '../record';
import { type Session, typedReadings } from '../session';
import { NO_BAR, TYPED_BAR, type TypedReading, typedAsk, typedAskKey, typedWriterName } from '../typed';
import { hashOf } from '../lib';
import { DEFAULTS, pinSwitches, withSwitches } from './fakes';

setDefaultTimeout(120_000);

const restore = pinSwitches({ ...DEFAULTS, DREAMCHAT_RETIRE: undefined });
afterAll(restore);

const SHEET = { DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on' };

/** A frozen dream with typed readings of its own for some of its moments. */
export function withReadings(id: string, typed: Record<string, TypedReading>): Session {
  const s = structuredClone(loadDream(id, false).session as Session);
  s.draft = { ...s.draft!, readings: { ...(s.draft?.readings ?? {}), typed } };
  return s;
}

/** A taken fact, as Jev would have taken it. */
export const taken = <T extends object>(fact: T) => ({ ...fact, checks: [], ok: true });

describe('the switch', () => {
  test('unset or off, no step; none, the builder on with no step; on, every step; a step, the steps up to it', () => {
    expect(builderSteps('').size).toBe(0);
    expect(builderSteps('off').size).toBe(0);
    expect(builderSteps('none').size).toBe(0);
    expect([...builderSteps('on')]).toEqual([...BUILDER_STEPS]);
    for (const [i, step] of BUILDER_STEPS.entries())
      expect([...builderSteps(step)]).toEqual(BUILDER_STEPS.slice(0, i + 1));
    expect(() => builderSteps('onn')).toThrow('DREAMCHAT_ONE_BUILDER');
    withSwitches({ DREAMCHAT_ONE_BUILDER: undefined }, () => expect(oneBuilder()).toBe(false));
    withSwitches({ DREAMCHAT_ONE_BUILDER: 'off' }, () => expect(oneBuilder()).toBe(false));
    withSwitches({ DREAMCHAT_ONE_BUILDER: 'none' }, () => {
      expect(oneBuilder()).toBe(true);
      for (const step of BUILDER_STEPS) expect(builds(step)).toBe(false);
    });
  });

  test("off is today's prompts and images, byte for byte; on, the sheet carries each moment's typed facts", () => {
    const id = 'dream-0926-043003-b0cb';
    const typed: Record<string, TypedReading> = {
      m1: {
        moment: 'm1',
        facts: [
          taken({ kind: 'act' as const, who: 'p1', does: 'stands at', to: 'the door' }),
          { kind: 'act' as const, who: 'p1', does: 'knows', checks: [], ok: false },
        ],
      },
    };
    const s = withReadings(id, typed);
    const prompts = (env: Record<string, string | undefined>) =>
      withSwitches({ ...SHEET, ...env }, () =>
        rebuild(s).pictures.map((p) => ({ id: p.id, prompt: p.prompt, refs: p.references })),
      );
    const today = prompts({ DREAMCHAT_ONE_BUILDER: undefined });
    expect(prompts({ DREAMCHAT_ONE_BUILDER: 'off' })).toEqual(today);
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: undefined }, () =>
      expect(rebuild(s).pictures.find((p) => p.id === 'm1')?.sheet?.typed).toBeUndefined(),
    );
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: 'none' }, () => {
      const r = rebuild(s);
      expect(r.pictures.map((p) => ({ id: p.id, prompt: p.prompt, refs: p.references }))).toEqual(today);
      // Only the facts Jev took; a moment not read has none.
      expect(r.pictures.find((p) => p.id === 'm1')?.sheet?.typed?.acts).toEqual([
        { kind: 'act', who: 'p1', does: 'stands at', to: 'the door' },
      ]);
      expect(r.pictures.find((p) => p.id === 'm2')?.sheet?.typed?.acts).toEqual([]);
    });
  });
});

describe('ledger 1: one story record per state of the dream', () => {
  test('a rebuild makes the record once, for the plan, the sheet and its tree alike', () => {
    const s = loadDream('dream-0926-043003-b0cb', false).session as Session;
    const made = (builder: string | undefined) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: builder }, () => {
        const before = recordsMade();
        const r = rebuild(s);
        return { n: recordsMade() - before, prompts: r.pictures.map((p) => p.prompt) };
      });
    const before = made('none');
    const after = made('one_record');
    // Made for the plan and again for the sheets' dream: twice; once with the step.
    expect(before.n).toBe(2);
    expect(after.n).toBe(1);
    expect(after.prompts).toEqual(before.prompts);
  });

  test('a clean-up turned off is another state: its record is made again, never the one before', () => {
    const s = loadDream('dream-0926-050424-fdd7', false).session as Session;
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: 'one_record' }, () => {
      const today = rebuild(s).pictures.map((p) => p.prompt);
      const off = withRetired(['fills'], () => rebuild(s).pictures.map((p) => p.prompt));
      expect(off).not.toEqual(today);
      expect(rebuild(s).pictures.map((p) => p.prompt)).toEqual(today);
    });
  });
});

describe("ledger 4: the assembler's paragraph ids and each image's subjects, read by the evals", () => {
  test('each image is known by its source and whom it is for, as the words would have it worked out again', () => {
    for (const id of ['dream-0926-043003-b0cb', 'dream-0926-050424-fdd7', 'dream-0925-231131-affd']) {
      const s = loadDream(id, false).session as Session;
      withSwitches(
        { ...SHEET, DREAMCHAT_CAMERA: 'on', DREAMCHAT_REFS: 'on', DREAMCHAT_ONE_BUILDER: 'one_record' },
        () => expect(rebuild(s).pictures.some((p) => p.assembled)).toBe(false),
      );
      withSwitches(
        { ...SHEET, DREAMCHAT_CAMERA: 'on', DREAMCHAT_REFS: 'on', DREAMCHAT_ONE_BUILDER: 'paragraph_ids' },
        () => {
          const r = rebuild(s);
          for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
            expect(p.assembled?.lines.map((l) => l.text).join('\n\n')).toBe(p.prompt);
            const { assembled: _, ...fromWords } = p;
            expect(refsOf(r, p)).toEqual(refsOf(r, fromWords));
          }
        },
      );
    }
  });
});

describe("S4's word lists, each with a switch that turns off only its piece", () => {
  test('hands, own body, a vehicle going, the water and the openings on walls', () => {
    const room: Blocking = {
      room: { w: 6, d: 6 },
      indoors: true,
      ceiling: 4,
      spots: [],
    } as unknown as Blocking;
    expect(handsIn(['the dreamer opens the door'], false)).toBe(true);
    withRetired(['hands'], () => expect(handsIn(['the dreamer opens the door'], false)).toBe(false));
    // Holding something is not the word list's: it stays.
    withRetired(['hands'], () => expect(handsIn(['the dreamer looks around'], true)).toBe(true));
    expect(selfIn(['they look down at their own small body'])).toBe(true);
    withRetired(['own_body'], () => expect(selfIn(['they look down at their own small body'])).toBe(false));
    expect(goingIn('the tractor rumbles over the grass', 'the tractor')).toBe(true);
    withRetired(['going'], () => expect(goingIn('the tractor rumbles over the grass', 'the tractor')).toBe(false));
    expect(waterLevel('water up to their waists', room)).toBe(1);
    withRetired(['water_level'], () => expect(waterLevel('water up to their waists', room)).toBeNull());
    expect(openingsIn('tall windows along both side walls')).toEqual([{ what: 'windows', walls: ['left', 'right'] }]);
    withRetired(['openings'], () => expect(openingsIn('tall windows along both side walls')).toEqual([]));
  });
});

describe('typed readings while planning', () => {
  const id = 'dream-0926-043003-b0cb';
  const b = () => structuredClone((loadDream(id, false).session as Session).draft!.breakdown!);
  const counting = () => {
    const asked: string[] = [];
    let live = 0;
    let most = 0;
    const write = async (messages: { content: string }[]) => {
      live++;
      most = Math.max(most, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      asked.push(messages.at(-1)!.content);
      return { content: '{"acts": []}', model: 'fake', ms: 0 };
    };
    return { asked, most: () => most, write: write as never };
  };
  const jev = (async () => ({ answers: {} })) as never;

  test('a moment whose question is unchanged keeps its reading; the rest are read anew, a few at once', async () => {
    const dream = b();
    const n = moments(dream).length;
    const first = counting();
    const read = (await typedReadings(dream, { typed: first.write, jev }))!;
    expect(first.asked).toHaveLength(n);
    expect(first.most()).toBeGreaterThan(1);
    expect(first.most()).toBeLessThanOrEqual(4);
    expect(Object.keys(read)).toEqual(moments(dream).map((m) => m.id));
    // Planned again, nothing changed: nothing read.
    const again = counting();
    expect(await typedReadings(dream, { typed: again.write, jev }, read)).toEqual(read);
    expect(again.asked).toHaveLength(0);
    // The last moment's words changed (the question holds the story before, so a later one changes alone):
    // that moment alone.
    const m = moments(dream).at(-1)!;
    m.action = `${m.action} (changed)`;
    const one = counting();
    await typedReadings(dream, { typed: one.write, jev }, read);
    expect(one.asked).toHaveLength(1);
  });

  test('a reading that failed is read again on the next plan', async () => {
    const dream = b();
    const last = moments(dream).at(-1)!.id;
    let fail = true;
    const asked: string[] = [];
    const flaky = (async (messages: { content: string }[]) => {
      asked.push(messages.at(-1)!.content);
      if (fail && messages.at(-1)!.content.includes(last)) throw new Error('429');
      return { content: '{"acts": []}', model: 'fake', ms: 0 };
    }) as never;
    const read = (await typedReadings(dream, { typed: flaky, jev }))!;
    expect(read[last].ask).toBeUndefined();
    fail = false;
    asked.length = 0;
    const again = (await typedReadings(dream, { typed: flaky, jev }, read))!;
    expect(asked).toHaveLength(1);
    expect(again[last].ask).toBeDefined();
  });

  test('its key is the question, the writer and the bars: another writer reads it anew', () => {
    const dream = b();
    const m = moments(dream).at(-1)!;
    const key = typedAskKey(dream, m);
    expect(typedAskKey(dream, m)).toBe(key);
    // The writer is fixed when the module loads, so its name is changed where the key reads it.
    const was = process.env.DREAMCHAT_TYPED_THINKING;
    expect(typedWriterName()).toContain('thinking');
    expect(hashOf({ ask: typedAsk(dream, m), writer: typedWriterName(), bars: [TYPED_BAR, NO_BAR] })).toBe(key);
    expect(
      hashOf({ ask: typedAsk(dream, m), writer: `${typedWriterName()} other`, bars: [TYPED_BAR, NO_BAR] }),
    ).not.toBe(key);
    expect(hashOf(typedAsk(dream, m))).not.toBe(key);
    if (was === undefined) delete process.env.DREAMCHAT_TYPED_THINKING;
  });

  test('without the writer, a reading of words since changed is dropped, never carried on', async () => {
    const dream = b();
    const read = (await typedReadings(dream, { typed: counting().write, jev }))!;
    const m = moments(dream).at(-1)!;
    m.action = `${m.action} (changed)`;
    const kept = (await typedReadings(dream, {}, read))!;
    expect(kept[m.id]).toBeUndefined();
    expect(Object.keys(kept).length).toBeGreaterThan(0);
  });
});
