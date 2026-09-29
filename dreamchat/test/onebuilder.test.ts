// S6, the one prompt builder (DREAMCHAT_ONE_BUILDER): off, every prompt as before; on, each step of the ledger
// built (HARNESS_PLAN.md, S6 eval), each retired clean-up replaced by the typed fact that covers it. The typed
// readings here are written for the test: the cache of the saved moments' readings is not in the repository.
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { goingIn, handsIn, openingsIn, selfIn, waterLevel } from '../camera';
import { BUILDER_STEPS, builderSteps, builds, oneBuilder, withRetired } from '../cleanups';
import { refsOf } from '../evals/prompt-cases';
import { loadDream } from '../evals/saved';
import { cutSheet, inViewIn, sheetDream } from '../cutsheet';
import { inViewOf } from '../frames';
import { moments, producerSystem } from '../producer';
import { rebuild } from '../plan';
import { recordInputsOf, recordsMade, storyRecord } from '../record';
import { type Session, typedReadings } from '../session';
import { NO_BAR, TYPED_BAR, type TypedReading, typedAsk, typedAskKey, typedWriterName } from '../typed';
import { hashOf } from '../lib';
import type { Item } from '../sheets';
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

describe('ledger 5: names from the story record, and no id in words', () => {
  // library-1 (fdd7) m5: the producer wrote "the high round window; outside it l2", and the id reached the prompt.
  const id = 'dream-0926-050424-fdd7';
  const m5 = (step: string) =>
    withSwitches(
      { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
      () => rebuild(structuredClone(loadDream(id, false).session as Session)).pictures,
    );

  test("an id the producer wrote into a moment's words is its name once the dream is read", () => {
    const before = m5('paragraph_ids');
    const after = m5('names');
    const has = (ps: typeof before) => ps.filter((p) => /(?<![\w-])l2(?![\w-])/.test(p.prompt ?? '')).map((p) => p.id);
    expect(has(before)).toContain('m5');
    expect(has(after)).toEqual([]);
    expect(after.find((p) => p.id === 'm5')?.prompt).toContain('facing the high round window.');
  });

  test("a sketch's name is the record's, and the sheet's, where the breakdown's has moved on", () => {
    // The breakdown renames p2 after its sketch was drawn as "Mr Hale": the picture was drawn as Mr Hale.
    const s = structuredClone(loadDream('dream-0926-083656-8ceb', false).session as Session);
    const b = s.draft!.breakdown!;
    b.people.find((p) => p.id === 'p2')!.name = 'the teacher';
    const items = s.build!.items.map((i) => (i.id === 'p2' ? { ...i, status: 'ready' as const } : i));
    const called = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => storyRecord(b, items).record.elements.p2.called);
    expect(called('paragraph_ids')).toBe('the teacher');
    expect(called('names')).toBe('Mr Hale');
    // The sheet reads the record's: the name the sketch was drawn as.
    s.build = { ...s.build!, items };
    const m = withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: 'names' }, () =>
      rebuild(s).pictures.find((p) => p.sheet?.inView.some((e) => e.id === 'p2')),
    );
    expect(m?.sheet?.inView.find((e) => e.id === 'p2')?.name).toBe('Mr Hale');
  });

  test('the producer is told to write names, never ids', () => {
    withSwitches({ DREAMCHAT_ONE_BUILDER: 'paragraph_ids' }, () =>
      expect(producerSystem()).not.toContain('never by an id'),
    );
    withSwitches({ DREAMCHAT_ONE_BUILDER: 'names' }, () =>
      expect(producerSystem()).toContain('never by an id ("l2", "p1")'),
    );
  });
});

describe('ledger 6: kinds from the story record', () => {
  // 8ceb: "the little silver fish", a shoal kept as a crowd; the record called it a crowd, the sheet an animal.
  const id = 'dream-0926-083656-8ceb';
  const at = (step: string) =>
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => {
      const s = structuredClone(loadDream(id, false).session as Session);
      return {
        rec: storyRecord(s.draft!.breakdown!, s.build!.items).record.elements.p3,
        m3: rebuild(s).pictures.find((p) => p.id === 'm3')!,
      };
    });

  test('a crowd of animals is a crowd and an animal in the record, and the sheet and the tags read it', () => {
    const before = at('names');
    expect(before.rec.kind).toBe('crowd');
    expect(before.rec.animal).toBeUndefined();
    expect(before.m3.sheet?.tags.animal).toBe(false);
    const after = at('kinds');
    expect(after.rec).toMatchObject({ kind: 'crowd', animal: true });
    expect(after.m3.sheet?.inView.find((e) => e.id === 'p3')).toMatchObject({ said: 'animal', group: true });
    expect(after.m3.sheet?.tags).toMatchObject({ animal: true, crowd: true });
    // The prompt is the same: the sheet already said it as an animal.
    expect(after.m3.prompt).toBe(before.m3.prompt);
  });

  test("where the record and the sketch's words would differ, the sheet says what the record says", () => {
    // The producer marks Mr Hale's entry as several; his sketch says nothing of a group.
    const s = structuredClone(loadDream(id, false).session as Session);
    s.draft!.breakdown!.people.find((p) => p.id === 'p2')!.several = true;
    const said = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
        rebuild(structuredClone(s))
          .pictures.flatMap((p) => p.sheet?.inView ?? [])
          .find((e) => e.id === 'p2' && e.turned === null),
      );
    expect(said('names')).toMatchObject({ said: 'person', group: false });
    expect(said('kinds')).toMatchObject({ said: 'people', group: true });
  });

  test("a sketch's words say what it is, as they say its look and name", () => {
    // The breakdown still says "Mr Hale"; his sketch has become a dog.
    const s = structuredClone(loadDream(id, false).session as Session);
    const items = s.build!.items.map((i) =>
      i.id === 'p2'
        ? {
            ...i,
            name: 'the grey dog',
            status: 'ready' as const,
            fields: { appearance: { value: 'a grey dog', said: true } },
          }
        : i,
    );
    const kind = (step: string) =>
      withSwitches(
        { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
        () => storyRecord(s.draft!.breakdown!, items).record.elements.p2,
      );
    expect(kind('names').kind).toBe('person');
    expect(kind('kinds')).toMatchObject({ kind: 'animal', animal: true });
  });
});

describe('ledger 7: who is in view, once', () => {
  test("the record's shows where given, the camera's view beside them, the place once, the dreamer never through their eyes", () => {
    const sheets = ['p1', 'p2', 'p3', 't1', 'l1'].map((id) => ({
      id,
      kind: id.startsWith('p') ? 'character' : id.startsWith('t') ? 'prop' : 'location',
      name: id,
      fields: {},
      isDreamer: id === 'p1',
      status: 'ready',
      version: 1,
    })) as unknown as Parameters<typeof inViewOf>[1];
    const frame = {
      id: 'm1',
      frame: { visible: ['p1', 'p2'], things: ['t1'], place: 'l1', eyes: 'outside', plan: { sees: ['p3'] } },
    } as unknown as Parameters<typeof inViewOf>[0];
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    expect(ids(inViewOf(frame, sheets))).toEqual(['p1', 'p2', 't1', 'p3', 'l1']);
    expect(ids(inViewOf(frame, sheets, ['p1', 't1']))).toEqual(['p1', 't1', 'p3', 'l1']);
    const pov = { ...frame, frame: { ...frame.frame!, eyes: 'dreamer' } } as typeof frame;
    expect(ids(inViewOf(pov, sheets, ['p1', 't1']))).toEqual(['t1', 'p3', 'l1']);
  });

  test("a moment's own copy of its cast gone out of date: the sheet shows whom the record shows", () => {
    // 09ea m8, the dreamer waking with the fish; the copy also lists someone from an earlier plan of the market.
    const id = 'dream-0926-000545-09ea';
    const sheetAt = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => {
        const s = loadDream(id, false).session as Session;
        const r = rebuild(s);
        const inputs = recordInputsOf(s);
        const dream = sheetDream({
          breakdown: r.b,
          plan: r.plan,
          prep: s.prep,
          items: inputs.items,
          style: s.style ?? null,
          readings: s.draft?.readings,
          words: inputs.words,
        });
        const p = r.pictures.find((x) => x.id === 'm8')!;
        const extra = r.sheets.find(
          (x) =>
            x.kind === 'character' &&
            !p.item.frame!.visible.includes(x.id) &&
            !(p.item.frame!.plan?.sees ?? []).includes(x.id),
        )!;
        const stale = { ...p.item, frame: { ...p.item.frame!, visible: [...p.item.frame!.visible, extra.id] } };
        return {
          extra: extra.id,
          ids: cutSheet({ frame: stale, sheets: r.sheets, style: s.style!, dream }).inView.map((e) => e.id),
        };
      });
    const before = sheetAt('kinds');
    expect(before.ids).toContain(before.extra);
    const after = sheetAt('in_view');
    expect(after.ids).not.toContain(after.extra);
  });

  test("a copy missing someone the record shows, or through other eyes than the record's: the record's", () => {
    const id = 'dream-0926-000545-09ea';
    const sheetOf = (step: string, change: (f: NonNullable<Item['frame']>) => NonNullable<Item['frame']>) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => {
        const s = loadDream(id, false).session as Session;
        const r = rebuild(s);
        const inputs = recordInputsOf(s);
        const dream = sheetDream({
          breakdown: r.b,
          plan: r.plan,
          prep: s.prep,
          items: inputs.items,
          style: s.style ?? null,
          readings: s.draft?.readings,
          words: inputs.words,
        });
        const p = r.pictures.find((x) => x.id === 'm2')!;
        const stale = { ...p.item, frame: change(p.item.frame!) };
        return cutSheet({ frame: stale, sheets: r.sheets, style: s.style!, dream }).inView.map((e) => e.id);
      });
    // The copy lost the dreamer's sister (p2), whom the record shows.
    const lost = (f: NonNullable<Item['frame']>) => ({
      ...f,
      visible: f.visible.filter((x) => x !== 'p2'),
      plan: f.plan && { ...f.plan, sees: (f.plan.sees ?? []).filter((x) => x !== 'p2') },
    });
    expect(sheetOf('kinds', lost)).not.toContain('p2');
    expect(sheetOf('in_view', lost)).toContain('p2');
    // The copy says through the dreamer's eyes; the record, seen from outside: the dreamer is in the picture.
    const pov = (f: NonNullable<Item['frame']>) => ({ ...f, eyes: 'dreamer' as const });
    expect(sheetOf('kinds', pov)).not.toContain('p1');
    expect(sheetOf('in_view', pov)).toContain('p1');
  });

  test("with the record off the sheet's list is the plan's: no record to read who is in view from", () => {
    // Where the record's rules add someone the plan's lists lack (aeea m14, b0cb m4, 8ceb m5 and m6), the step
    // changes nothing with the record off.
    const ids = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_RECORD: 'off', DREAMCHAT_ONE_BUILDER: step }, () =>
        ['dream-0926-022102-aeea', 'dream-0926-043003-b0cb', 'dream-0926-083656-8ceb'].map((id) =>
          rebuild(structuredClone(loadDream(id, false).session as Session))
            .pictures.filter((p) => p.kind === 'cut')
            .map((p) => [p.id, p.sheet?.inView.map((e) => e.id)]),
        ),
      );
    expect(ids('in_view')).toEqual(ids('kinds'));
  });

  test('the gate reads the sheet only where the prompt is assembled from it: on, not in shadow', () => {
    // A sheet that has someone the moment's own copy does not: the sheet's list only with the sheet on.
    const s = loadDream('dream-0926-000545-09ea', false).session as Session;
    const r = withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: 'in_view' }, () => rebuild(structuredClone(s)));
    const p = r.pictures.find((x) => x.id === 'm2')!;
    const extra = r.sheets.find((x) => !p.sheet!.inView.some((e) => e.id === x.id))!;
    const built = {
      prompt: p.prompt,
      references: p.references,
      depicted: [],
      sheet: { ...p.sheet!, inView: [...p.sheet!.inView, { ...p.sheet!.inView[0], id: extra.id }] },
    };
    const ids = (sheet: string, step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_CUT_SHEET: sheet, DREAMCHAT_ONE_BUILDER: step }, () =>
        inViewIn(built, p.item, r.sheets).map((x) => x.id),
      );
    expect(ids('on', 'in_view')).toContain(extra.id);
    expect(ids('shadow', 'in_view')).not.toContain(extra.id);
    expect(ids('on', 'kinds')).not.toContain(extra.id);
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
