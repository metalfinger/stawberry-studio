import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_STEPS, CLEANUP_NAMES, CLEANUPS, type Cleanup, retired, retiredSet, withRetired } from '../cleanups';
import type { CutSheet } from '../cutsheet';
import {
  type AtomicChange,
  atomicChanges,
  type CorpusDiff,
  cameBackFrom,
  changeKey,
  classify,
  dumpOf,
  sameWords,
  wordRuns,
} from '../evals/corpus';
import {
  actionFindings,
  colourTwoWays,
  contentWords,
  disagreementsOf,
  footprintOf,
  idsInWords,
  kindOfTwice,
  linesOf,
  readDream,
  saidTwice,
  summarise,
  timesIn,
  totalsOf,
} from '../evals/retire';
import { loadDream } from '../evals/saved';
import { lookIn, withoutGone, writingIn } from '../frames';
import { rebuild } from '../plan';
import { completeViews, type StyleOption } from '../producer';
import { recordInputsOf, storyRecord } from '../record';
import type { Session } from '../session';
import type { Item } from '../sheets';

// Frozen dreams are rebuilt, a few of them twice; slow on a loaded machine.
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

const ON = {
  DREAMCHAT_RECORD: 'on',
  DREAMCHAT_CUT_SHEET: 'on',
  DREAMCHAT_CAMERA: undefined,
  DREAMCHAT_RETIRE: undefined,
  // The readings are of today's prompts: with the builder's names (S6 row 5), the id below is named.
  DREAMCHAT_ONE_BUILDER: undefined,
};

describe('the names two sources give', () => {
  test('one turned into something else, called by what it is now in the tree, is not two names', () => {
    // 8ceb: Mr Hale is a huge orange octopus from m4 on; the tree calls him so, the sheet says it beside his name.
    const s = loadDream('dream-0926-083656-8ceb', false).session as Session;
    const pics = withEnv(ON, () => rebuild(s).pictures);
    const rec = withEnv(ON, () => storyRecord(s.draft!.breakdown!, s.build!.items).record);
    const m4 = pics.find((p) => p.id === 'm4')!;
    const e = m4.sheet!.inView.find((x) => x.id === 'p2')!;
    expect(e.turned).toContain('octopus');
    expect(m4.sheet!.tree?.at.find((x) => x.id === 'p2')?.called).toContain('octopus');
    expect(withEnv(ON, () => disagreementsOf(m4, rec, s.style!))?.names).toEqual([]);
  });
});

describe('the clean-ups S6 retires, each with a switch', () => {
  test('unset, none is off; a name not among them is an error, so a misspelt switch never measures nothing', () => {
    expect(retiredSet('').size).toBe(0);
    expect([...retiredSet('gone, pose')]).toEqual(['gone', 'pose']);
    expect(() => retiredSet('gone,poses')).toThrow('no clean-up called poses');
    withEnv({ DREAMCHAT_RETIRE: undefined, DREAMCHAT_ONE_BUILDER: undefined }, () => {
      for (const n of CLEANUP_NAMES) expect(retired(n)).toBe(false);
    });
    // The one builder's steps named for a clean-up retire it (S6), and only those.
    withEnv({ DREAMCHAT_RETIRE: undefined, DREAMCHAT_ONE_BUILDER: 'on' }, () => {
      for (const n of CLEANUP_NAMES) expect(retired(n)).toBe(BUILDER_STEPS.includes(n));
    });
  });

  test('withRetired turns exactly those off, and puts the switch back as it was, even when it throws', () => {
    withEnv({ DREAMCHAT_RETIRE: 'vague' }, () => {
      withRetired(['gone'], () => {
        expect(retired('gone')).toBe(true);
        expect(retired('vague')).toBe(false);
      });
      expect(retired('vague')).toBe(true);
      expect(() =>
        withRetired(['pose'], () => {
          throw new Error('inside');
        }),
      ).toThrow('inside');
      expect(process.env.DREAMCHAT_RETIRE).toBe('vague');
      expect(() => withRetired(['nothing' as Cleanup], () => 1)).toThrow('no clean-up called nothing');
      expect(process.env.DREAMCHAT_RETIRE).toBe('vague');
    });
  });

  test('every switch is read where its clean-up runs, and the assembler, which writes from the sheet alone, reads none', () => {
    for (const n of CLEANUP_NAMES) {
      const file = CLEANUPS[n].split(' ')[0];
      // lookIn's own read theirs through offInLookIn: the builder's steps leave them on there (cleanups.ts).
      expect(readFileSync(join(import.meta.dir, '..', file), 'utf8')).toMatch(
        new RegExp(`(?:retired|offInLookIn)\\('${n}'\\)`),
      );
    }
    expect(readFileSync(join(import.meta.dir, '..', 'assemble.ts'), 'utf8')).not.toContain('retired(');
  });

  test('what is gone leaves the words of the moment, unless its switch is off', () => {
    const said =
      'The tractor slows and stops at the edge of the field, where the beach had been, where the sea used to be.';
    expect(withoutGone(said)).toBe('The tractor slows and stops at the edge of the field.');
    withRetired(['gone'], () => expect(withoutGone(said)).toBe(said));
  });

  test('a look: each clean-up turned off keeps only what that one takes out', () => {
    const style: StyleOption = {
      id: 's',
      name: 'blue ink',
      line: '',
      tokens: [],
      palette_hex: ['#1f3a93', '#2b4fb3'],
      lighting_rules: '',
      one_colour: true,
    };
    const family: Item = {
      id: 'p2',
      kind: 'character',
      name: 'the family',
      several: true,
      status: 'ready',
      version: 1,
      fields: {
        appearance: { value: 'a father and a mother; the baby in a yellow onesie', said: false },
        wardrobe: { value: 'standing in a relaxed pose, green coats', said: false },
        distinctive_features: { value: 'not remembered', said: false },
      },
    };
    const baby: Item = { id: 'p3', kind: 'character', name: 'the baby', status: 'ready', version: 1, fields: {} };
    const ctx = { members: [{ group: family, member: baby, word: 'baby' }], unsaid: { p2: ['a mother'] }, style };
    const keys = ['appearance', 'wardrobe', 'distinctive_features'];
    // Today: "a mother" is from after a change, "not remembered" says nothing, the pose goes, the baby is drawn
    // from its own sketch, and in blue ink the green coats are a shade of it.
    expect(lookIn(family, keys, ctx)).toBe('a father; mid-toned coats');
    // Each switch keeps only the piece its clean-up takes out.
    expect(withRetired(['after_words'], () => lookIn(family, keys, ctx))).toBe(
      'a father and a mother; mid-toned coats',
    );
    expect(withRetired(['vague'], () => lookIn(family, keys, ctx))).toBe('a father; mid-toned coats; not remembered');
    expect(withRetired(['shades'], () => lookIn(family, keys, ctx))).toBe('a father; green coats');
    expect(withRetired(['pose'], () => lookIn(family, keys, ctx))).toBe(
      'a father; standing in a relaxed pose, mid-toned coats',
    );
    expect(withRetired(['members'], () => lookIn(family, keys, ctx))).toBe(
      'a father; the baby in a pale onesie; mid-toned coats',
    );
  });

  test("writing: a board's quoted word is the only writing, speech is not, and each switch undoes its part", () => {
    const board = 'a chalk board that reads "zikery" beside the door';
    const speech = 'the dog looks back as if to say "come on"';
    expect(writingIn(board, speech)).toEqual(['zikery']);
    withRetired(['writing'], () => expect(writingIn(board, speech)).toEqual([]));
    withRetired(['spoken'], () => expect(writingIn(board, speech)).toEqual(['zikery', 'come on']));
  });

  test("the record's word lists: each moves the record of a frozen dream where it acts, and nothing with its switch off", () => {
    // Found by turning each off over every frozen dream (evals/retire.ts); the others act only on the live dreams.
    const acts: [string, Cleanup][] = [
      ['dream-0926-050424-fdd7', 'fills'],
      ['dream-0926-043003-b0cb', 'opens'],
      ['dream-0926-043003-b0cb', 'shut_away'],
      ['dream-0925-231131-affd', 'not_there'],
      ['dream-0926-000545-09ea', 'taken'],
    ];
    for (const [id, name] of acts) {
      const s = loadDream(id, false).session as Session;
      const b = structuredClone(s.draft!.breakdown!);
      completeViews(b);
      const inputs = recordInputsOf(s);
      const moments = () =>
        JSON.stringify(
          storyRecord(b, inputs.items, s.draft?.readings, { words: inputs.words, style: s.style }).record.moments,
        );
      const today = moments();
      expect(withRetired([name], moments)).not.toBe(today);
      // Another list turned off leaves this dream's record as it is where that list does not act here.
      const other = (['state_verb', 'self', 'holds_name'] as Cleanup[]).find((n) => n !== name)!;
      expect(withRetired([other], moments)).toBe(today);
    }
  });
});

describe("a step's changes, one by one, each classified", () => {
  test('the runs of words gone and added, each whole', () => {
    expect(wordRuns('the edge of the field, where the sea used to be.', 'the edge of the field.')).toEqual({
      gone: ['field, where the sea used to be.'],
      added: ['field.'],
    });
    expect(wordRuns('dark coats and a hat', 'green coats and a red hat')).toEqual({
      gone: ['dark'],
      added: ['green', 'red'],
    });
    expect(wordRuns('same', 'same')).toEqual({ gone: [], added: [] });
  });

  const diff: CorpusDiff = {
    dreams: { same: 0, changed: 1, only_before: [], only_now: [] },
    pictures: { same: 0, changed: 1, only_before: ['d1 g3'], only_now: [] },
    changes: [
      {
        dream: 'd1',
        id: 'm2',
        gone: ['What happens in this frame: the tractor stops, where the sea used to be.', 'It should feel: calm.'],
        added: ['What happens in this frame: the tractor stops.', 'It should feel: calm and still.'],
        images: { before: ['identity sketch:p1'], now: ['base previs:m2', 'identity sketch:p1'] },
        plan: [{ field: 'refs', before: '[]', now: '["cut m1 composition"]' }],
      },
    ],
  };

  test('a paragraph changed in place is paired with its own part of the prompt; images, plan fields and pictures are changes too', () => {
    const cs = atomicChanges(diff);
    expect(cs.map((c) => `${c.kind}:${c.what}`)).toEqual([
      'plan:refs',
      'images:images',
      'paragraph:happens',
      'paragraph:feel',
      'picture:gone',
    ]);
    const happens = cs.find((c) => c.what === 'happens')!;
    expect(happens.before).toContain('where the sea used to be');
    expect(happens.after).toBe('What happens in this frame: the tractor stops.');
    // A key is the change itself: the same change gets the same key in any run.
    expect(atomicChanges(diff).map((c) => c.key)).toEqual(cs.map((c) => c.key));
    const { key: _, ...rest } = happens;
    expect(changeKey(rest)).toBe(happens.key);
    expect(changeKey({ ...rest, after: `${rest.after} ` })).not.toBe(happens.key);
  });

  test("a reviewer's verdict stands; the same words are neutral; a retired clean-up's words back are a regression; the rest wait", () => {
    const cs = atomicChanges(diff);
    const feel = cs.find((c) => c.what === 'feel')!;
    const reordered: AtomicChange = {
      ...feel,
      before: 'It should feel: calm, still.',
      after: 'It should feel: still, calm.',
    };
    expect(sameWords(reordered)).toBe(true);
    expect(sameWords(feel)).toBe(false);
    // Turning `gone` off brought in "where the sea used to be" at d1 m2 (its run as wordRuns gives it): a step
    // that brings it back regresses.
    const back = cameBackFrom([{ dream: 'd1', picture: 'm2', removes: ['stops, where the sea used to be.'] }]);
    const undone: AtomicChange = {
      ...cs.find((c) => c.what === 'happens')!,
      before: 'What happens in this frame: the tractor stops.',
      after: 'What happens in this frame: the tractor stops, where the sea used to be.',
    };
    expect(back(undone)).toBe('stops, where the sea used to be.');
    expect(back({ ...undone, picture: 'm3' })).toBeNull();
    expect(back(cs.find((c) => c.what === 'happens')!)).toBeNull();
    const { rows, counts } = classify(
      [...cs, reordered, undone],
      { [cs[0].key]: { verdict: 'intended', why: 'the plan draws m1' } },
      back,
    );
    expect(counts).toEqual({ intended: 1, regression: 1, neutral: 1, unclassified: 4 });
    expect(rows.find((r) => r.by === 'came_back')?.verdict).toBe('regression');
  });
});

describe('the readings of the S6 eval, on a frozen dream', () => {
  // The key-and-boat library: the dreamer's look in its image's line and in "In it", water coming in under the
  // doors, and a saved floor plan whose view words carry a place's id ("outside it l2").
  const s = loadDream('dream-0926-050424-fdd7', false).session as Session;
  const r = withEnv(ON, () => rebuild(s));
  const read = withEnv(ON, () => readDream('fdd7', s, r));
  const at = (m: string) => read.moments.find((x) => x.moment === m)!;

  test('the words of a prompt, and its lines', () => {
    expect(contentWords("The dreamer's dark blue jeans, and the boats.")).toEqual([
      'dreamer',
      'dark',
      'blue',
      'jean',
      'boat',
    ]);
    expect(timesIn(['a', 'b', 'a', 'b', 'a'], ['a', 'b'])).toBe(2);
    expect(timesIn(['a', 'b'], [])).toBe(0);
    const lines = linesOf('In it:\nthe dreamer (person): dark blue jeans.\n\nWhat happens in this frame: rain.');
    expect(lines.map((l) => l.section)).toEqual(['in_it', 'in_it', 'happens']);
  });

  test('a look said in its image\'s line and again in "In it" is a fact said twice, of the look\'s kind', () => {
    const m2 = at('m2');
    const jeans = m2.saidTwice.find((x) => x.text.includes('dark blue jeans'));
    expect(jeans?.sections.sort()).toEqual(['in_it', 'manifest']);
    expect(jeans && kindOfTwice(jeans)).toBe('look');
    // Said once, it is not found.
    const sheet = r.pictures.find((p) => p.id === 'm2')!.sheet as CutSheet;
    expect(
      saidTwice('the dreamer: dark blue jeans.', [
        { text: 'dark blue jeans', words: ['dark', 'blue', 'jean'], sources: ['look:p1'] },
      ]),
    ).toEqual([]);
    expect(sheet.inView.length).toBeGreaterThan(0);
  });

  test('what happens is read for what no picture shows at one instant, and an id standing in words is found', () => {
    expect(at('m2').action.some((a) => a.rule === 'sequence' && /starts coming/i.test(a.said))).toBe(true);
    expect(at('m5').ids).toEqual(['l2']);
    expect(idsInWords('facing the window; outside it l2, near l12 and p1-x', ['l2', 'p1'])).toEqual(['l2']);
    const sheet = {
      inView: [{ id: 'p9', kind: 'character', said: 'person', name: 'Mrs Okafor', turned: 'a grey heron' }],
      record: null,
    } as unknown as CutSheet;
    const found = actionFindings('What happens in this frame: Mrs Okafor hears the bell, then flies off.', sheet, [
      { id: 't1', name: 'the bell' },
    ]);
    expect(found.map((f) => f.rule).sort()).toEqual(['gone_named', 'sequence', 'turned_named', 'unseen']);
  });

  test('a colour the dream gives, said whole in the style and as a shade in a look, is said two ways', () => {
    const prompt =
      'Image 3: the library (mid-toned glass lamps on every desk): only its materials.\n\nColours: blue. Only what the dream itself gives a colour keeps it exactly: green glass lamps; yellow boat.';
    expect(colourTwoWays(prompt, ['green glass lamps', 'yellow boat'])).toEqual(['green glass lamps']);
    expect(
      colourTwoWays('Only what the dream itself gives a colour keeps it exactly: green glass lamps.', [
        'green glass lamps',
      ]),
    ).toEqual([]);
  });

  test('the totals count moments and facts', () => {
    const t = totalsOf(read.moments, read.ghosts);
    expect(t.moments).toBe(read.moments.length);
    expect(t.saidTwice.moments).toBeGreaterThan(0);
    expect(t.saidTwice.kinds.look.facts).toBeGreaterThan(0);
    expect(t.ids.ids.l2).toBeGreaterThanOrEqual(1);
  });

  test("a clean-up's footprint: with it off, only the pictures it acts on change, and it names the words it removes", () => {
    const today = dumpOf(r);
    // With nothing turned off, nothing changes.
    expect(
      footprintOf(
        'fdd7',
        today,
        withEnv(ON, () => withRetired([], () => dumpOf(rebuild(s)))),
      ),
    ).toEqual([]);
    const fills = withEnv(ON, () => withRetired(['fills'], () => dumpOf(rebuild(s))));
    const changes = footprintOf('fdd7', today, fills);
    expect(changes.length).toBeGreaterThan(0);
    const f = summarise('fills', changes);
    expect(f.moments + f.ghosts).toBeGreaterThan(0);
    expect(f.dreams).toBe(1);
    expect(changes.every((c) => c.dream === 'fdd7')).toBe(true);
  });
});
