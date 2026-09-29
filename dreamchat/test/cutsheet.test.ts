import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleCut } from '../assemble';
import { shotPlan } from '../continuity';
import {
  type CutSheet,
  type CutSheetInput,
  cutSheet,
  cutSheetMode,
  differences,
  framed,
  REVERSE_DEGREES,
  sheetDream,
  tagWords,
} from '../cutsheet';
import { frozenDreams, loadDream } from '../evals/saved';
import { framePrompt, type PlannedInput } from '../frames';
import { inSession, readJevLog } from '../jevlog';
import { type Rebuilt, rebuild, standIn } from '../plan';
import type { StyleOption } from '../producer';
import { recordInputsOf, storyRecord } from '../record';
import { drawingSheet, type Session, sheetDreamOf } from '../session';
import type { Item } from '../sheets';
import { cutsOf } from '../tree';

// Every frozen dream is rebuilt and each of its moments written both ways, some of them many times.
setDefaultTimeout(120_000);

/** Runs `fn` with the dream chat's switches set, and puts them back. */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const was = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    return fn();
  } finally {
    for (const [k, v] of Object.entries(was))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}

/** A frozen dream rebuilt, with the record off or on, and every moment's input as a rebuild gives it. */
function dreamOf(id: string, record: 'off' | 'on') {
  return withEnv(
    { DREAMCHAT_RECORD: record, DREAMCHAT_CUT_SHEET: 'shadow', DREAMCHAT_CAMERA: undefined, DREAMCHAT_REFS: undefined },
    () => {
      const s = loadDream(id, false).session as Session;
      const r = Object.assign(rebuild(s), { style: s.style });
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
      return { s, r, dream };
    },
  );
}

/** What rebuild gives a moment's framePrompt, so a variant of it can be written both ways. */
function inputOf(r: Rebuilt, id: string, dream: CutSheetInput['dream']): CutSheetInput {
  const byId = new Map(r.pictures.map((p) => [p.id, p.item]));
  const p = r.pictures.find((x) => x.id === id)!;
  const cut = p.item.frame?.plan;
  const inputs: PlannedInput[] = (cut?.refs ?? [])
    .map((use) => ({ use, item: byId.get(use.id) }))
    .filter((x): x is PlannedInput => !!x.item);
  const layout = cut?.eye && shotPlan(r.b, id, r.rec) ? standIn.previs(id) : undefined;
  return { frame: p.item, sheets: r.sheets, style: styleOf(r), inputs, layout, dream };
}
const styleOf = (r: Rebuilt) => (r as Rebuilt & { style?: StyleOption }).style as StyleOption;

/** framePrompt's prompt, images and what it depicts, and the sheet's, for one input: the same, word for word. */
function sameBothWays(x: CutSheetInput, label: string) {
  const today = framePrompt(x.frame, x.sheets, x.style, x.inputs ?? [], x.layout);
  const made = assembleCut(cutSheet(x));
  const d = differences(today, made);
  if (d.length) throw new Error(`${label}: ${d.join('; ')}`);
  expect(made.prompt).toBe(today.prompt);
  expect(made.references.map((r) => ({ media_id: r.image, role: r.role, instruction: r.instruction }))).toEqual(
    today.references,
  );
  expect(made.depicted).toEqual(today.depicted);
}

// Variants of a moment that reach the branches the saved dreams seldom do: a redraw with the judge's
// findings, strays in earlier pictures, no worked-out view, a plan saved before its facts were typed, no
// mock-up and no picture to edit, one colour, the other eyes, "you" in its words, more images than fit,
// and sketches not yet approved.
const VARIANTS: Record<string, (x: CutSheetInput) => CutSheetInput> = {
  asIs: (x) => x,
  repairs: (x) => ({
    ...x,
    frame: { ...x.frame, repairFor: ['the dreamer has two left hands', 'the door is on the wrong wall'] },
    inputs: (x.inputs ?? []).map((i) => ({
      ...i,
      item: {
        ...i.item,
        check: { questions: 2, passed: 0, failed: [], failedIds: ['undeclared', 'p1'], notes: ['a stray dog', 'x'] },
      },
    })),
  }),
  noView: (x) => {
    const plan = x.frame.frame?.plan;
    if (!plan) return x;
    const { view: _v, eye: _e, sees: _s, framing: _f, ...rest } = plan;
    return {
      ...x,
      layout: undefined,
      frame: { ...x.frame, shot: undefined, frame: { ...x.frame.frame!, plan: rest } },
    };
  },
  wordsOnly: (x) => {
    const plan = x.frame.frame?.plan;
    if (!plan?.facts) return x;
    const { facts: _, ...rest } = plan;
    return { ...x, frame: { ...x.frame, frame: { ...x.frame.frame!, plan: rest } } };
  },
  sketchesAlone: (x) => ({
    ...x,
    layout: undefined,
    inputs: (x.inputs ?? []).filter((i) => i.use.role !== 'base'),
  }),
  oneColour: (x) => ({
    ...x,
    style: { ...x.style, name: 'blue ink', palette_hex: ['#1F3A93', '#2A4FB0'], tokens: ['a loaded brush'] },
  }),
  otherEyes: (x) => ({
    ...x,
    frame: {
      ...x.frame,
      frame: { ...x.frame.frame!, eyes: x.frame.frame!.eyes === 'dreamer' ? 'outside' : 'dreamer' },
    },
  }),
  you: (x) => ({
    ...x,
    frame: {
      ...x.frame,
      fields: {
        ...x.frame.fields,
        action: { value: 'You open "THE DOOR" and your aunt waves, where the sea used to be.', said: true },
        feeling: { value: 'calm', said: false },
        dream: { value: 'the floor breathes', said: true },
      },
    },
  }),
  // More images than one picture takes: the plan's pictures four times over (the plan never names one twice).
  manyImages: (x) => ({ ...x, inputs: [1, 2, 3, 4].flatMap(() => (x.inputs ?? []).map((i) => ({ ...i }))) }),
  unapproved: (x) => ({
    ...x,
    sheets: x.sheets.map((s, i) => (i % 2 ? { ...s, review: undefined, continuityApproved: false } : s)),
  }),
};

describe('the cut sheet switch', () => {
  test('is off unless asked for, in shadow or on', () => {
    withEnv({ DREAMCHAT_CUT_SHEET: undefined }, () => expect(cutSheetMode()).toBe('off'));
    for (const [v, mode] of [
      ['off', 'off'],
      ['shadow', 'shadow'],
      ['on', 'on'],
      [' ON', 'on'],
      ['yes', 'off'],
    ])
      withEnv({ DREAMCHAT_CUT_SHEET: v }, () => expect(cutSheetMode()).toBe(mode as 'off' | 'shadow' | 'on'));
  });

  test('off is framePrompt, byte for byte, and builds no sheet', () => {
    const { r, dream } = dreamOf('dream-0926-043003-b0cb', 'off');
    for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
      const x = inputOf(r, p.id, dream);
      const out = framed(x, 'off');
      expect(out).toEqual(framePrompt(x.frame, x.sheets, x.style, x.inputs ?? [], x.layout));
      expect(out.sheet).toBeUndefined();
    }
  });

  test('shadow sends framePrompt and logs that the sheet assembles the same; on sends the sheet', async () => {
    const { r, dream } = dreamOf('dream-0925-231131-affd', 'off');
    const x = inputOf(r, 'm5', dream);
    const shadow = framed(x, 'shadow');
    const on = framed(x, 'on');
    expect(shadow.differs).toEqual([]);
    expect(on.prompt).toBe(shadow.prompt);
    expect(on.references).toEqual(shadow.references);
    expect(on.sheet?.id).toBe('m5');
    const dir = mkdtempSync(join(tmpdir(), 'cut-sheet-'));
    await inSession(dir, 'boat', async () => framed(x, 'shadow', 'frames'));
    const log = readJevLog(dir, 'boat').filter((e) => e.kind === 'transition' && e.stage === 'cut_sheet');
    expect(log.map((e) => (e.kind === 'transition' ? e.decision : ''))).toEqual(['same']);
  });
});

describe('assembleCut is framePrompt, word for word', () => {
  for (const record of ['off', 'on'] as const)
    test(`on every moment of every frozen dream and ten variants of each, with the record ${record}`, () => {
      let n = 0;
      withEnv({ DREAMCHAT_RECORD: record, DREAMCHAT_CAMERA: undefined, DREAMCHAT_REFS: undefined }, () => {
        for (const id of frozenDreams()) {
          const { r, dream } = dreamOf(id, record);
          for (const p of r.pictures.filter((x) => x.kind === 'cut'))
            for (const [name, variant] of Object.entries(VARIANTS)) {
              sameBothWays(variant(inputOf(r, p.id, dream)), `${id} ${p.id} ${name}`);
              n++;
            }
        }
      });
      expect(n).toBe(115 * Object.keys(VARIANTS).length);
    });

  test('a group and the member with their own sketch are told one and the same, and an animal is an animal', () => {
    const style: StyleOption = {
      id: 'd',
      name: 'ink',
      line: 'quiet',
      tokens: ['one loaded brush'],
      palette_hex: ['#111111', '#C8553D'],
      lighting_rules: 'soft morning light',
    } as StyleOption;
    const sketch = (id: string, name: string, fields: Record<string, string>, extra: Partial<Item> = {}): Item => ({
      id,
      kind: 'character',
      name,
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, said: true }])),
      status: 'ready',
      version: 1,
      mediaId: `media-${id}`,
      review: 'approved',
      nodeId: `node-${id}`,
      ...extra,
    });
    const family = sketch(
      'p2',
      'the family',
      { appearance: 'a father, a mother and a baby in a yellow onesie' },
      { several: true },
    );
    const baby = sketch('p3', 'the baby', { appearance: 'a baby in a white onesie' });
    const dog = sketch('p4', 'the dog', { appearance: 'a small brown terrier', identity: 'their dog' });
    const dreamer = sketch('p1', 'you', { wardrobe: 'a red coat; standing in a relaxed pose' }, { isDreamer: true });
    const frame: Item = {
      id: 'm1',
      kind: 'cut',
      name: 'the family',
      fields: { action: { value: 'The family waves at you and the dog barks.', said: true } },
      status: 'waiting',
      version: 0,
      frame: {
        visible: ['p1', 'p2', 'p3', 'p4'],
        things: [],
        place: 'l1',
        distance: 'medium',
        eyes: 'outside',
        key: true,
        order: 1,
        looksAt: 'the gate',
        plan: {
          id: 'm1',
          order: 1,
          scene: 's1',
          shot: 's1.sh1',
          refs: [],
          own: [],
          states: [],
          staging: ['p1', 'p2', 'p3', 'p4'],
          sheetLayout: true,
          changes: [],
          needs: [],
          criteria: [],
          depth: 1,
          transition: 'cut',
          why: '',
        },
      },
    };
    const x: CutSheetInput = { frame, sheets: [dreamer, family, baby, dog], style };
    sameBothWays(x, 'family');
    const made = assembleCut(cutSheet(x));
    expect(made.prompt).toContain('one baby, never two');
    expect(made.prompt).toContain('the dog (animal)');
    expect(made.prompt).toContain('"You" in these words is the dreamer');
    expect(made.lines.map((l) => l.id)).toContain('you');
  });
});

describe('assembleCut reads the sheet and nothing else', () => {
  const { r, dream } = dreamOf('dream-0926-022102-aeea', 'on');
  const sheets = withEnv({ DREAMCHAT_RECORD: 'on' }, () =>
    r.pictures.filter((p) => p.kind === 'cut').map((p) => cutSheet(inputOf(r, p.id, dream))),
  );
  // A sheet seen only through a guard: every read is recorded, any write throws.
  const guarded = <T extends object>(v: T, reads: Set<string>, path = ''): T =>
    new Proxy(v, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof key === 'string') reads.add(path ? `${path}.${key}` : key);
        return value && typeof value === 'object'
          ? guarded(value, reads, path ? `${path}.${String(key)}` : String(key))
          : value;
      },
      set: () => {
        throw new Error('assembleCut wrote to its sheet');
      },
      deleteProperty: () => {
        throw new Error('assembleCut wrote to its sheet');
      },
      defineProperty: () => {
        throw new Error('assembleCut wrote to its sheet');
      },
    });

  test('the sheet is plain data: written out and read back, it is the same sheet', () => {
    for (const s of sheets) expect(JSON.stringify(JSON.parse(JSON.stringify(s)))).toBe(JSON.stringify(s));
  });

  test('a copy of the sheet, cut off from every object it was built from and never written to, assembles the same', () => {
    const read = new Set<string>();
    for (const s of sheets) {
      const copy = guarded(JSON.parse(JSON.stringify(s)) as CutSheet, read);
      expect(assembleCut(copy)).toEqual(assembleCut(s));
    }
    // It reads the prompt's fields, and never the tree, the record or the tags: those are for the checks.
    // `rules` is on a sheet only with the camera rules on (DREAMCHAT_CAMERA), and `refs` only with S5's
    // references on (DREAMCHAT_REFS), and each is read where it is.
    const top = new Set([...read].map((k) => k.split('.')[0]));
    for (const k of top) expect([...Object.keys(sheets[0]), 'rules', 'refs']).toContain(k);
    for (const k of ['tree', 'record', 'tags', 'relations', 'sources', 'hash', 'flags']) expect(top.has(k)).toBe(false);
  });

  test('the switches and the environment change nothing it writes', () => {
    const a = sheets.map((s) => assembleCut(s));
    const z = withEnv({ DREAMCHAT_RECORD: 'off', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_PROVIDER: 'higgsfield' }, () =>
      sheets.map((s) => assembleCut(s)),
    );
    expect(z).toEqual(a);
  });

  test('it never reads the environment, nor do the helpers it writes with', () => {
    const a = sheets.map((s) => assembleCut(s));
    const env = process.env;
    let reads = 0;
    const refuse = () => {
      reads++;
      throw new Error('assembleCut read the environment');
    };
    Object.defineProperty(process, 'env', {
      value: new Proxy({}, { get: refuse, has: refuse, ownKeys: refuse, getOwnPropertyDescriptor: refuse }),
      configurable: true,
      writable: true,
    });
    let z: ReturnType<typeof assembleCut>[] = [];
    try {
      z = sheets.map((s) => assembleCut(s));
    } finally {
      Object.defineProperty(process, 'env', { value: env, configurable: true, writable: true });
    }
    expect(reads).toBe(0);
    expect(z).toEqual(a);
    // The guard is real: with it in place, reading a switch throws.
    Object.defineProperty(process, 'env', {
      value: new Proxy({}, { get: refuse }),
      configurable: true,
      writable: true,
    });
    try {
      expect(() => cutSheetMode()).toThrow('assembleCut read the environment');
    } finally {
      Object.defineProperty(process, 'env', { value: env, configurable: true, writable: true });
    }
  });

  test('its only input is the sheet, and it imports only words: no switches, no session, no files', () => {
    expect(assembleCut.length).toBe(1);
    const src = readFileSync(join(import.meta.dir, '..', 'assemble.ts'), 'utf8');
    const imports = [...src.matchAll(/^import (type )?\{([^}]*)\} from '([^']+)';$/gm)].map((m) => ({
      type: !!m[1],
      names: m[2]
        .split(',')
        .map((x) => x.trim().replace(/^type\s+/, ''))
        .filter(Boolean),
      from: m[3],
    }));
    const allowed: Record<string, string[]> = {
      './camera': ['sayTurn'],
      './cutsheet': ['CutSheet', 'SheetEarlier', 'SheetElement'],
      './frames': ['aNoun', 'FRAMING', 'MAX_IMAGES', 'NOTHING_ELSE', 'SHAPE_WORDS', 'samePlaceLine', 'sentence', 'writingLine'],
      './record': ['sayNow'],
      './sheets': ['styleBlock'],
    };
    expect(imports.length).toBe(src.match(/^import /gm)?.length ?? 0);
    for (const i of imports) {
      expect(Object.keys(allowed)).toContain(i.from);
      for (const n of i.names) expect(allowed[i.from]).toContain(n);
      if (i.from === './cutsheet') expect(i.type).toBe(true);
    }
    expect(src).not.toMatch(/process\.|Bun\.|require\(|import\(|globalThis|Date\.|Math\.random/);
  });

  test('its paragraphs, named, make the prompt', () => {
    for (const s of sheets) {
      const a = assembleCut(s);
      expect(a.lines.map((l) => l.text).join('\n\n')).toBe(a.prompt);
      expect(new Set(a.lines.map((l) => l.id)).size).toBe(a.lines.length);
      for (const l of a.lines) expect(l.fields.length).toBeGreaterThan(0);
    }
  });
});

describe('the sheet of a cut', () => {
  const tags = (id: string, record: 'off' | 'on' = 'on') => {
    const { r, dream } = dreamOf(id, record);
    return withEnv({ DREAMCHAT_RECORD: record, DREAMCHAT_CAMERA: undefined, DREAMCHAT_REFS: undefined }, () =>
      Object.fromEntries(
        r.pictures.filter((p) => p.kind === 'cut').map((p) => [p.id, cutSheet(inputOf(r, p.id, dream))] as const),
      ),
    );
  };

  test('tags a reverse angle, a point of view, a jump, a held thing, an animal and a vehicle', () => {
    const snow = tags('dream-0926-043003-b0cb');
    // The grandfather's side of the compartment: the camera turned round from the first picture.
    expect(snow.m2.tags.move).toBe('reverse');
    expect(snow.m3.tags).toMatchObject({ role: 'pov', pov: true, change: 'here', held: true });
    expect(snow.m4.tags).toMatchObject({ move: 'other_place', vehicle: true, unstaged: 'weather' });
    const boat = tags('dream-0925-231131-affd');
    expect(boat.m1.tags).toMatchObject({ move: 'first', establishing: true, animal: true });
    expect(boat.m6.tags).toMatchObject({ move: 'jump', unstaged: 'jump', dreamlike: true });
    expect(boat.m3.tags.move).toBe('seat');
    const school = tags('dream-0926-083656-8ceb');
    // The fish students are there, but out of the picture of Mr Hale turning: no crowd in it.
    expect(school.m4.record?.present.some((id) => school.m4.record?.kinds[id] === 'crowd')).toBe(true);
    expect(school.m4.tags).toMatchObject({ turned: true, unstaged: 'transformation', crowd: false });
    expect(tagWords(school.m4.tags)).toEqual(expect.arrayContaining(['role:single', 'change:here', 'turned']));
    expect(REVERSE_DEGREES).toBe(135);
  });

  test('a reverse is the camera turned round from the cut before; crossing the line is its own tag', () => {
    for (const id of ['dream-0925-231131-affd', 'dream-0926-000545-09ea', 'dream-0926-043003-b0cb']) {
      const sheets = Object.values(tags(id, 'off'));
      for (const s of sheets) {
        const prev = sheets.find((x) => x.id === s.prev);
        const eye = s.tree?.sheet.camera.value as { d: { x: number; y: number } } | null;
        const was = prev?.tree?.sheet.camera.value as { d: { x: number; y: number } } | null;
        const turn =
          eye && was
            ? (Math.acos(Math.max(-1, Math.min(1, eye.d.x * was.d.x + eye.d.y * was.d.y))) * 180) / Math.PI
            : 0;
        if (s.tags.move === 'reverse') expect(turn).toBeGreaterThanOrEqual(REVERSE_DEGREES);
      }
    }
    const market = tags('dream-0926-000545-09ea', 'off');
    // Back across the line from the cut before: the old man wraps the fish from the other side.
    expect(market.m4.tags.crossed).toBe(true);
    // Nothing that is only there counts: the lighthouse's dog is on the stairs, not in the close-up of the key.
    expect(tags('dream-0926-022102-aeea').m2.tags.animal).toBe(false);
  });

  test('carries the tree with its sources, the record as typed facts, and relations', () => {
    const snow = tags('dream-0926-043003-b0cb');
    const m5 = snow.m5;
    expect(m5.tree?.sheet.eyes.from.level).toBe('shot');
    expect(m5.tree?.sheet.action.value).toBe(m5.story.action);
    expect(m5.record?.held).toBeDefined();
    const facts = m5.record!.facts.flatMap((x) => x.facts);
    expect(facts.every((f) => ['part', 'shut', 'held'].includes(f.kind))).toBe(true);
    expect(m5.relations.toPrev).toBe('other_side');
    expect(m5.hash).toMatch(/^[0-9a-f]+$/);
    // With the record on, how each one is now is the record's typed facts, rendered only when assembled.
    expect(m5.now).not.toBeNull();
    expect(m5.nowWords).toBeNull();
  });

  test('with the record off, the prompt says what is still so from the plan, and the record is still on the sheet', () => {
    const snow = tags('dream-0926-043003-b0cb', 'off');
    expect(snow.m5.now).toBeNull();
    expect(snow.m5.record).not.toBeNull();
    expect(snow.m5.sources.states).toBe('b:m5.states');
  });
});

describe('the drawing path and a rebuild', () => {
  test('give a moment the same sheet', () => {
    withEnv({ DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'shadow' }, () => {
      const s = loadDream('dream-0926-062232-a44a', false).session as Session;
      const r = rebuild(s);
      // The dream as drawing holds it once every picture is drawn and approved: the moments as planned,
      // each with its mock-up in the production.
      const drawn: Session = {
        ...s,
        build: {
          ...s.build!,
          plan: r.plan,
          frames: r.pictures.map((p) => ({
            ...p.item,
            ...(p.references.some((x) => x.media_id === standIn.previs(p.id))
              ? { layout: { mediaId: standIn.previs(p.id), key: 'k', path: 'p' } }
              : {}),
          })),
          items: r.sheets,
        },
      };
      for (const p of r.pictures.filter((x) => x.kind === 'cut')) {
        const a = drawingSheet(drawn, p.id)!;
        // The same, save the record's own hash of the sketches (stand-ins here, as drawn there).
        expect(a).toEqual(p.sheet!);
      }
      expect(sheetDreamOf(drawn)?.tree).not.toBeNull();
    });
  });
});

describe('the tree reads its looks and stages from the record', () => {
  test('its stages are the record changes, and each cut has the stage in force and holders the record has', () => {
    withEnv({ DREAMCHAT_RECORD: 'on' }, () => {
      const { s, r } = dreamOf('dream-0926-043003-b0cb', 'on');
      const inputs = recordInputsOf(s);
      const record = storyRecord(r.b, inputs.items, s.draft?.readings, { words: inputs.words, style: s.style }).record;
      const dream = sheetDream({
        breakdown: r.b,
        plan: r.plan,
        items: inputs.items,
        style: s.style ?? null,
        readings: s.draft?.readings,
        words: inputs.words,
      });
      const tree = dream.tree!;
      const keys = tree.ledger.rows.flatMap((row) => row.stages.slice(1).map((st) => st.key)).sort();
      const changes = Object.values(record.changes)
        .filter((c) => c.kind !== 'presence' && !c.copy)
        .map((c) => c.key)
        .sort();
      expect(keys).toEqual(changes);
      for (const c of cutsOf(tree)) {
        const m = record.moments.find((x) => x.id === c.id)!;
        for (const [id, seen] of Object.entries(m.looks)) {
          const at = c.at[id];
          if (!at || !tree.ledger.rows.some((row) => row.element === id)) continue;
          expect(at.stage.value).toBe(seen.stage);
          for (const [part, now] of Object.entries(seen.parts)) expect(at.parts[part]?.value).toBe(now);
        }
        for (const [thing, holder] of Object.entries(m.held))
          if (c.at[thing]?.holder) expect(c.at[thing].holder!.value).toBe(holder);
      }
      // No flag that a stage is not carried: what carries is the record's to say.
      expect(tree.flags.some((f) => f.code === 'stage_not_carried')).toBe(false);
    });
  });

  test('without the record, the tree is as it was', () => {
    const { r, dream } = dreamOf('dream-0926-043003-b0cb', 'off');
    expect(dream.tree?.ledger.rows.length).toBeGreaterThan(0);
    expect(r.plan.cuts.every((c) => c.facts === undefined)).toBe(true);
  });
});
