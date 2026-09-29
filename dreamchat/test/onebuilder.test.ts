// S6, the one prompt builder (DREAMCHAT_ONE_BUILDER): off, every prompt as before; on, each step of the ledger
// built (HARNESS_PLAN.md, S6 eval), each retired clean-up replaced by the typed fact that covers it. The typed
// readings here are written for the test: the cache of the saved moments' readings is not in the repository.
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { goingIn, handsIn, openingsIn, selfIn, waterLevel } from '../camera';
import { BUILDER_STEPS, builderSteps, builds, oneBuilder, withRetired } from '../cleanups';
import { refsOf } from '../evals/prompt-cases';
import { loadDream } from '../evals/saved';
import { assembleCut } from '../assemble';
import { cutSheet, sheetDream } from '../cutsheet';
import { inViewOf } from '../frames';
import { moments, producerSystem } from '../producer';
import { inViewIn, rebuild } from '../plan';
import { recordInputsOf, recordsMade, storyRecord } from '../record';
import { type Session, typedReadings } from '../session';
import { NO_BAR, TYPED_BAR, type TypedReading, typedAsk, typedAskKey, typedWriterName } from '../typed';
import { hashOf } from '../lib';
import { inShades, type Item } from '../sheets';
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

describe('ledger 8: how each one looks, once, from the story record', () => {
  const look = (id: string, step: string, el: string, moment: string) =>
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => {
      const p = rebuild(structuredClone(loadDream(id, false).session as Session)).pictures.find(
        (x) => x.id === moment,
      )!;
      return p.sheet?.inView.find((e) => e.id === el)?.look;
    });

  test("the way of drawing leaves a look: the style says it, the record's rule, not the sketch's words", () => {
    // aeea's brass key was described as "rendered in faded watercolour"; the style is faded watercolour.
    const id = 'dream-0926-022102-aeea';
    expect(look(id, 'in_view', 't1', 'm1')).toContain('rendered in faded watercolour');
    expect(look(id, 'looks', 't1', 'm1')).not.toContain('watercolour');
  });

  test('a first look is said as how it is now, not also in the look; a look no other line has stays', () => {
    // 6e80: the library's water begins to cover the floor at m1; how it is now says so, the look does not.
    expect(look('dream-0926-055141-6e80', 'in_view', 'l1', 'm1')).not.toContain('water beginning to cover the floor');
    expect(look('dream-0926-055141-6e80', 'looks', 'l1', 'm1')).not.toContain('water beginning to cover the floor');
    // The look otherwise as the sketch said it.
    expect(look('dream-0926-055141-6e80', 'looks', 'l1', 'm1')).toContain('shelves of books');
  });

  test('a story word that is only a medium word stays where the chosen style does not name it', () => {
    // 09ea is not a crayon dream: a box of crayons in it is a box of crayons.
    const s = structuredClone(loadDream('dream-0926-000545-09ea', false).session as Session);
    const item = s.build!.items.find((i) => i.id === 't2')!;
    item.fields = { appearance: { value: 'a box of crayons, red and blue', said: true } };
    const d = s.draft!.breakdown!.things.find((t) => t.id === 't2')!;
    d.fields = { appearance: { value: 'a box of crayons, red and blue', said: true } } as never;
    const at = (step: string) =>
      withSwitches(
        { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
        () =>
          rebuild(structuredClone(s))
            .pictures.find((x) => x.id === 'm4')
            ?.sheet?.inView.find((e) => e.id === 't2')?.look,
      );
    expect(at('looks')).toContain('a box of crayons');
  });

  test("a sketch that never got drawn keeps its words: the record's base is the breakdown's shorter ones", () => {
    // 6081's boat has a failed sketch; the record's words for it are the breakdown's short ones.
    const id = 'dream-0926-052843-6081';
    const s = loadDream(id, false).session as Session;
    const items = s.build!.items.filter((i) => !i.frame && (i.status === 'failed' || i.status === 'waiting'));
    expect(items.length).toBeGreaterThan(0);
    const of = (step: string, el: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => {
        const p = rebuild(structuredClone(s)).pictures.flatMap((x) =>
          (x.sheet?.inView ?? []).filter((e) => e.id === el),
        );
        return p.map((e) => e.look);
      });
    for (const it of items.filter((x) => x.kind !== 'cut' && x.kind !== 'ghost'))
      expect(of('looks', it.id)).toEqual(of('in_view', it.id));
  });

  test("a group's words about someone with a sketch of their own leave the group's look", () => {
    const s = structuredClone(loadDream('dream-0926-000545-09ea', false).session as Session);
    const family = 'a family; an old man in a grey coat; a sister in a yellow dress';
    const g = s.build!.items.find((i) => i.id === 'p2')!;
    g.name = 'the family';
    g.several = true;
    g.fields = { appearance: { value: family, said: true } };
    const b = s.draft!.breakdown!.people.find((p) => p.id === 'p2')!;
    b.name = 'the family';
    b.several = true;
    b.fields = { appearance: { value: family, said: true } } as never;
    // Where the family and the old man are both in view.
    const at = (step: string) =>
      withSwitches(
        { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
        () =>
          rebuild(structuredClone(s))
            .pictures.map((x) => x.sheet?.inView ?? [])
            .find((v) => v.some((e) => e.id === 'p2') && v.some((e) => e.id === 'p3'))
            ?.find((e) => e.id === 'p2')?.look,
      );
    expect(at('in_view')).not.toContain('old man');
    expect(at('looks')).not.toContain('old man');
    expect(at('looks')).toContain('sister');
  });

  test("a picture rebuilt as drawn says the sketch's words it was drawn from, not the record of today's", () => {
    // The record's base is made from today's sketch words; a sheet whose sketch has other words (an as-drawn
    // copy) says those, as the sketch's clean-up did.
    const id = 'dream-0926-043003-b0cb';
    const lookOf = (step: string) =>
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
        const sheets = r.sheets.map((i) =>
          i.id === 't1'
            ? { ...i, fields: { ...i.fields, appearance: { value: 'a small red tin trunk', said: true } } }
            : i,
        );
        return cutSheet({ frame: p.item, sheets, style: s.style!, dream }).inView.find((e) => e.id === 't1')?.look;
      });
    expect(lookOf('looks')).toContain('small red tin trunk');
    expect(lookOf('in_view')).toContain('small red tin trunk');
  });

  test("the dreamer's own words that the dream is drawn as they drew then still say their age is not ours", () => {
    // 3cd7 is drawn as a child's crayon drawing; told so in the dreamer's words, the guessed age goes.
    const s = loadDream('dream-0926-101435-3cd7', false).session as Session;
    const words = ['It was all in crayon, the way I drew when I was six.'];
    const base = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
        JSON.stringify(
          storyRecord(s.draft!.breakdown!, s.build!.items, s.draft?.readings, { words, style: s.style }).record.elements
            .p1.base,
        ),
      );
    expect(base('in_view')).not.toContain('about six years old');
    expect(base('looks')).not.toContain('about six years old');
  });

  test('what a look is like is a way of drawing only where the chosen style says it: hair black and white stays', () => {
    // 09ea is soft watercolour: an old man's hair black and white is his hair.
    const s = structuredClone(loadDream('dream-0926-000545-09ea', false).session as Session);
    const hair = 'an elderly man, hair black and white, with a lined face';
    s.build!.items.find((i) => i.id === 'p3')!.fields = { appearance: { value: hair, said: true } };
    (s.draft!.breakdown!.people.find((p) => p.id === 'p3')!.fields as Record<string, unknown>) = {
      appearance: { value: hair, said: true },
    };
    const at = (step: string) =>
      withSwitches(
        { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
        () =>
          rebuild(structuredClone(s)).pictures.flatMap((x) =>
            (x.sheet?.inView ?? []).filter((e) => e.id === 'p3').map((e) => e.look),
          )[0],
      );
    expect(at('looks')).toContain('black and white');
  });

  test("with the record off or in shadow, the look is the sketch's words as before", () => {
    const id = 'dream-0926-022102-aeea';
    for (const rec of ['off', 'shadow'])
      expect(
        withSwitches(
          { ...SHEET, DREAMCHAT_RECORD: rec, DREAMCHAT_ONE_BUILDER: 'looks' },
          () =>
            rebuild(structuredClone(loadDream(id, false).session as Session))
              .pictures.find((x) => x.id === 'm1')
              ?.sheet?.inView.find((e) => e.id === 't1')?.look,
        ),
      ).toContain('rendered in faded watercolour');
  });

  test('a clause the dreamer said keeps its colour in a style of one colour; a guessed one is said as a shade', () => {
    // A one-colour style: a said colour stays, a guessed one is a shade.
    const s = structuredClone(loadDream('dream-0926-022102-aeea', false).session as Session);
    s.style = { ...s.style!, one_colour: true };
    const it = s.build!.items.find((i) => i.id === 't1')!;
    it.fields = { appearance: { value: 'a red key', said: true }, materials: { value: 'green brass', said: false } };
    const d = s.draft!.breakdown!.things.find((t) => t.id === 't1')!;
    (d.fields as Record<string, unknown>) = it.fields;
    const l = withSwitches(
      { ...SHEET, DREAMCHAT_ONE_BUILDER: 'looks' },
      () =>
        rebuild(structuredClone(s))
          .pictures.find((x) => x.id === 'm1')
          ?.sheet?.inView.find((e) => e.id === 't1')?.look,
    );
    expect(l).toContain('a red key');
    expect(l).not.toContain('green brass');
  });

  test("the pose of a place or a thing is still stripped, as the sketch's clean-up did", () => {
    // a44a's red door: "standing upright on its own with no house or wall around it" is pose.
    expect(look('dream-0926-062232-a44a', 'in_view', 't2', 'm5')).not.toContain('standing upright');
    expect(look('dream-0926-062232-a44a', 'looks', 't2', 'm5')).not.toContain('standing upright');
  });

  test("the sketch's words as before with the step off", () => {
    expect(look('dream-0926-022102-aeea', 'kinds', 't1', 'm1')).toBe(
      look('dream-0926-022102-aeea', 'in_view', 't1', 'm1'),
    );
  });

  // 09ea with someone's sketch and breakdown given other words, and their look where they are in view.
  const lookWith = (
    step: string,
    id: string,
    fields: Record<string, { value: string; said: boolean }>,
    also?: string,
  ) => {
    const s = structuredClone(loadDream('dream-0926-000545-09ea', false).session as Session);
    const it = s.build!.items.find((i) => i.id === id)!;
    it.fields = fields;
    const b = s.draft!.breakdown!.people.find((p) => p.id === id)!;
    (b.fields as Record<string, unknown>) = structuredClone(fields);
    // Someone else in view with them: the group they are in.
    if (also) for (const x of [it, b]) Object.assign(x, { name: 'the family', several: true });
    return withSwitches(
      { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
      () =>
        rebuild(structuredClone(s))
          .pictures.map((x) => x.sheet?.inView ?? [])
          .find((v) => v.some((e) => e.id === id) && (!also || v.some((e) => e.id === also)))
          ?.find((e) => e.id === id)?.look,
    );
  };

  test('a look field that says it does not know says nothing, all of it, as the sketch did (live 6a4d)', () => {
    const fields = {
      appearance: { value: 'an elderly man with a lined face', said: true },
      distinctive_features: { value: 'features indistinct, with soft edges and muted colors', said: false },
    };
    expect(lookWith('in_view', 'p3', fields)).not.toContain('soft edges');
    expect(lookWith('looks', 'p3', fields)).not.toContain('soft edges');
    expect(lookWith('looks', 'p3', fields)).toContain('lined face');
  });

  test('a clause said again in part keeps the word that is new: Dele is tall (live 3471)', () => {
    const fields = {
      appearance: { value: 'an elderly man with a lined face and a tired everyday look', said: true },
      distinctive_features: { value: 'tall, tired everyday look', said: true },
    };
    expect(lookWith('in_view', 'p3', fields)).toContain('tall');
    expect(lookWith('looks', 'p3', fields)).toContain('tall');
  });

  test("a group's piece about someone with their own sketch leaves the look whole, clauses after the name too (live 0199)", () => {
    const fields = {
      appearance: {
        value: 'a family; an old man in a grey coat, a long white beard; a sister in a yellow dress',
        said: true,
      },
    };
    expect(lookWith('in_view', 'p2', fields, 'p3')).not.toContain('white beard');
    expect(lookWith('looks', 'p2', fields, 'p3')).not.toContain('white beard');
    expect(lookWith('looks', 'p2', fields, 'p3')).toContain('sister');
  });
});

describe("ledger 11: a place's or a thing's pose, stripped once, by the record", () => {
  const base = (step: string) =>
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () => {
      const s = loadDream('dream-0926-062232-a44a', false).session as Session;
      const r = rebuild(structuredClone(s));
      // The record as a rebuild makes it: from the sketches, approved and drawn.
      const rec = storyRecord(r.b, r.sheets, s.draft?.readings, { style: s.style }).record;
      return {
        record: JSON.stringify(rec.elements.t2?.base),
        look: r.pictures.find((x) => x.id === 'm5')?.sheet?.inView.find((e) => e.id === 't2')?.look,
      };
    });

  test("the red door's framing leaves the record, and the sheet's look is as it was", () => {
    // a44a's red door: "standing upright on its own with no house or wall around it" framed its sketch.
    const before = base('looks');
    const after = base('pose');
    expect(before.record).toContain('standing upright');
    expect(after.record).not.toContain('standing upright');
    expect(after.look).toBe(before.look);
  });

  // a44a with the red door's words given otherwise, and its look at m5, before the door is opened at m7.
  const door = (step: string, value: string, drawn: boolean) => {
    const s = structuredClone(loadDream('dream-0926-062232-a44a', false).session as Session);
    const it = s.build!.items.find((i) => i.id === 't2')!;
    it.fields = { ...it.fields, appearance: { value, said: false } };
    if (!drawn) Object.assign(it, { status: 'waiting', mediaId: undefined });
    const b = s.draft!.breakdown!.things.find((t) => t.id === 't2')!;
    (b.fields as Record<string, unknown>) = { ...b.fields, appearance: { value, said: false } };
    return withSwitches(
      { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
      () =>
        rebuild(s)
          .pictures.find((x) => x.id === 'm5')
          ?.sheet?.inView.find((e) => e.id === 't2')?.look,
    );
  };

  test('a pose left at the start of a clause a rule has rewritten is stripped too', () => {
    // The way of drawing leaves "rendered in faded watercolour and": "standing upright on its own" then opens it.
    const value =
      'a standard-sized rectangular door, rendered in faded watercolour and standing upright on its own, painted bright red';
    expect(door('looks', value, true)).not.toContain('standing upright');
    expect(door('pose', value, true)).not.toContain('standing upright');
    expect(door('pose', value, true)).toContain('rectangular door, painted');
  });

  test('a sketch never drawn: what the record moves to after a change stays out of its look before it', () => {
    // The door is opened at m7: "standing wide open" is its look from then, never at m5.
    const value = 'a bright red door in a simple frame, and standing wide open';
    expect(door('looks', value, false)).not.toContain('wide open');
    expect(door('pose', value, false)).not.toContain('wide open');
  });

  test('where lookIn still says the look (a sketch never drawn), it still strips the pose', () => {
    const s = structuredClone(loadDream('dream-0926-052843-6081', false).session as Session);
    const it = s.build!.items.find(
      (i) => !i.frame && i.kind === 'prop' && (i.status === 'failed' || i.status === 'waiting'),
    )!;
    it.fields = {
      ...it.fields,
      appearance: { value: 'a small wooden boat, standing upright on its stern', said: true },
    };
    const look = (step: string) =>
      withSwitches(
        { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
        () =>
          rebuild(structuredClone(s))
            .pictures.flatMap((x) => x.sheet?.inView ?? [])
            .find((e) => e.id === it.id)?.look,
      );
    expect(look('pose')).toContain('small wooden boat');
    expect(look('pose')).not.toContain('standing upright');
  });
});

describe("ledger 12: a group's words about someone with their own sketch, once, in the record", () => {
  // 09ea's sister made a family whose look names the old man (p3), who has his own sketch.
  const family = 'a family; an old man in a grey coat, a long white beard; a sister in a yellow dress';
  const dream = () => {
    const s = structuredClone(loadDream('dream-0926-000545-09ea', false).session as Session);
    const it = s.build!.items.find((i) => i.id === 'p2')!;
    const b = s.draft!.breakdown!.people.find((p) => p.id === 'p2')!;
    for (const x of [it, b])
      Object.assign(x, { name: 'the family', several: true, fields: { appearance: { value: family, said: true } } });
    return s;
  };
  const looks = (step: string) =>
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
      rebuild(dream()).pictures.flatMap((x) => {
        const v = x.sheet?.inView ?? [];
        const look = v.find((e) => e.id === 'p2')?.look;
        return look === undefined ? [] : [{ moment: x.id, withHim: v.some((e) => e.id === 'p3'), look }];
      }),
    );

  test("the record says whom each piece of a group's look is about", () => {
    const s = dream();
    const about = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
        Object.fromEntries(
          storyRecord(s.draft!.breakdown!, s.build!.items, s.draft?.readings, {
            style: s.style,
          }).record.elements.p2.base.appearance.map((f) => [f.text, f.about ?? []]),
        ),
      );
    expect(about('members')['a long white beard']).toEqual(['p3']);
    expect(about('members')['an old man in a grey coat']).toEqual(['p3']);
    expect(about('members')['a sister in a yellow dress']).toEqual([]);
    expect(about('pose')['a long white beard']).toEqual([]);
  });

  test('with him in view the look leaves his piece, clauses after his name too; without him it keeps it', () => {
    const all = looks('members');
    expect(all.some((x) => x.withHim) && all.some((x) => !x.withHim)).toBe(true);
    for (const x of all.filter((y) => y.withHim)) {
      expect(x.look).not.toContain('white beard');
      expect(x.look).toContain('sister in a yellow dress');
    }
    for (const x of all.filter((y) => !y.withHim)) expect(x.look).toContain('white beard');
  });

  test('the dreamer the sheet reads as a group: their piece about someone with a sketch of their own leaves too', () => {
    // "A pair of" makes the dreamer a group on the sheet (isGroup reads their words); the record calls them a person.
    const s = structuredClone(loadDream('dream-0926-000545-09ea', false).session as Session);
    const look = 'a young woman in a pair of round glasses; a grey scarf borrowed from the old man';
    for (const x of [
      s.build!.items.find((i) => i.id === 'p1')!,
      s.draft!.breakdown!.people.find((p) => p.id === 'p1')!,
    ])
      (x as { fields: unknown }).fields = { appearance: { value: look, said: true } };
    const at = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
        rebuild(structuredClone(s)).pictures.flatMap((x) => {
          const v = x.sheet?.inView ?? [];
          return v.some((e) => e.id === 'p3') ? v.filter((e) => e.id === 'p1').map((e) => e.look) : [];
        }),
      );
    expect(at('pose').length).toBeGreaterThan(0);
    for (const l of at('pose')) expect(l).not.toContain('grey scarf');
    for (const l of at('members')) {
      expect(l).not.toContain('grey scarf');
      expect(l).toContain('round glasses');
    }
  });

  test('whom a piece names is read without its pose, as lookIn reads it', () => {
    const fields = 'a family of three; standing beside the old man, a red scarf; a sister in a yellow dress';
    const s = dream();
    for (const x of [
      s.build!.items.find((i) => i.id === 'p2')!,
      s.draft!.breakdown!.people.find((p) => p.id === 'p2')!,
    ])
      (x as { fields: unknown }).fields = { appearance: { value: fields, said: true } };
    const at = (step: string) =>
      withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
        rebuild(structuredClone(s)).pictures.flatMap((x) => {
          const v = x.sheet?.inView ?? [];
          return v.some((e) => e.id === 'p3') ? v.filter((e) => e.id === 'p2').map((e) => e.look) : [];
        }),
      );
    expect(at('pose').some((l) => l?.includes('a red scarf'))).toBe(true);
    for (const l of at('members')) {
      expect(l).toContain('a red scarf');
      expect(l).not.toContain('old man');
    }
  });

  test("the look is the record's, not lookIn's, once the record says whom each clause is about", () => {
    // lookIn keeps the sketch's ";" between pieces; the record says a field's clauses apart by ",".
    const at = (step: string) => looks(step).find((x) => x.withHim)?.look;
    expect(at('pose')).toBe('a family; a sister in a yellow dress');
    expect(at('members')).toBe('a family, a sister in a yellow dress');
  });
});

describe('ledger 13: a colour the dream gives, said one way', () => {
  const library = (step: string) =>
    withSwitches(
      { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
      () =>
        rebuild(structuredClone(loadDream('dream-0926-055141-6e80', false).session as Session))
          .pictures.find((x) => x.id === 'm5')
          ?.sheet?.inView.find((e) => e.id === 'l1')?.look,
    );

  test("library-3's lamps, said green, are green in the look's guessed landmarks too", () => {
    // Its light (said): "green glass lamps on the desks"; its landmarks (filled in) had them "mid-toned".
    expect(library('members')).toContain('mid-toned glass lamps');
    expect(library('shades')).not.toContain('mid-toned glass lamps');
    expect(library('shades')).toContain('desks, green glass lamps on the desks');
  });

  test('a guessed colour the dream does not give is still a shade', () => {
    const style = {
      id: 's',
      name: 'ink',
      line: 'blue ink',
      tokens: [],
      palette_hex: ['#1e3a8a', '#93c5fd'],
      one_colour: true,
    } as never;
    expect(inShades('a red scarf and green glass lamps', style, ['green glass lamps'])).toBe(
      'a mid-toned scarf and green glass lamps',
    );
    expect(inShades('a red scarf and green glass lamps', style)).toBe('a mid-toned scarf and mid-toned glass lamps');
  });
});

describe("ledger 14: a look said once, in its image's line", () => {
  const at = (step: string) =>
    withSwitches({ ...SHEET, DREAMCHAT_ONE_BUILDER: step }, () =>
      rebuild(structuredClone(loadDream('dream-0926-022102-aeea', false).session as Session)).pictures.find(
        (x) => x.id === 'm1',
      )!,
    );
  const inIt = (prompt: string) => prompt.slice(prompt.indexOf('In it:\n')).split('\n\n')[0];

  test('"In it" names one with an image of its own, and its look is said in that image\'s line alone', () => {
    const before = at('shades');
    const after = at('look_once');
    const key = after.sheet!.inView.find((e) => e.id === 't1')!;
    expect(key.image).toBeTruthy();
    expect(inIt(before.prompt)).toContain(`${key.name} (thing): ${key.look}`);
    expect(inIt(after.prompt)).toContain(`${key.name} (thing).`);
    expect(inIt(after.prompt)).not.toContain(key.look);
    expect(after.prompt.slice(0, after.prompt.indexOf('In it:'))).toContain(`${key.name} (${key.look})`);
  });

  test('one with no image keeps its look in "In it"', () => {
    const p = at('look_once');
    const sheet = structuredClone(p.sheet!);
    const key = sheet.inView.find((e) => e.id === 't1')!;
    key.image = null as never;
    expect(inIt(assembleCut(sheet).prompt)).toContain(`${key.name} (thing): ${key.look}`);
  });
});

describe('ledger 15: the colours the dream gives, said once', () => {
  const prompt = (id: string, moment: string, step: string) =>
    withSwitches(
      { ...SHEET, DREAMCHAT_ONE_BUILDER: step },
      () =>
        rebuild(structuredClone(loadDream(id, false).session as Session)).pictures.find((x) => x.id === moment)!.prompt,
    );
  const style = (p: string) => p.split('\n').find((l) => l.startsWith('Colours:')) ?? '';

  test("in one colour the style's list is the one list: an image's line points to it", () => {
    // library-3 (one colour): the style keeping the boat yellow is what kept it from coming out white (its case).
    const before = prompt('dream-0926-055141-6e80', 'm5', 'look_once');
    const after = prompt('dream-0926-055141-6e80', 'm5', 'colour_once');
    expect(before).toContain('which keeps it exactly: yellow rowing boat.');
    expect(style(after)).toContain('keeps it exactly: yellow rowing boat; green glass lamps.');
    expect(after).not.toContain('which keeps it exactly: yellow rowing boat.');
    expect(after).toContain(
      'except what the dream itself gives a colour (listed under Colours), which keeps it exactly.',
    );
  });

  test('in a style of many colours, one said above is not listed again', () => {
    // b91f: Dele's blue suit, said in his words above.
    const before = prompt('dream-0926-095122-b91f', 'm4', 'look_once');
    const after = prompt('dream-0926-095122-b91f', 'm4', 'colour_once');
    expect(style(before)).toContain('keeps it exactly: blue suit.');
    expect(style(after)).not.toContain('blue suit');
    expect(style(after)).toContain('keeps it exactly, as said above.');
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
