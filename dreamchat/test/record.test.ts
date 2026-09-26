import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planContinuity, rawPlanBy } from '../continuity';
import { inSession, readJevLog } from '../jevlog';
import type { Breakdown, StyleOption } from '../producer';
import {
  carried,
  describeAt,
  diffPlan,
  forPlan,
  lookBefore,
  nowAt,
  recheckRecord,
  recordForPlan,
  recordMode,
  storyRecord,
  type Violation,
} from '../record';
import { shadowRecord } from '../session';
import type { Item } from '../sheets';

// Saved sessions frozen for these tests (test/fixtures/record): the breakdown without its style options,
// the sketches' words without their pictures, the dreamer's own messages and the chosen look.
type Frozen = { from: string; title: string; breakdown: Breakdown; items: Item[]; words: string[]; style: StyleOption };
const FIXTURES = join(import.meta.dir, 'fixtures', 'record');
const load = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Frozen;
const run = (name: string, opts: { words?: boolean; items?: boolean } = {}) => {
  const f = load(name);
  return {
    f,
    ...storyRecord(f.breakdown, opts.items === false ? [] : f.items, null, {
      ...(opts.words === false ? {} : { words: f.words }),
      style: f.style,
    }),
  };
};
const found = (vs: Violation[], rule: Violation['rule'], fix?: Violation['fix']) =>
  vs.filter((v) => v.rule === rule && (!fix || v.fix === fix));
const lookText = (look: Record<string, { text: string }[]> | undefined) =>
  Object.values(look ?? {})
    .flat()
    .map((f) => f.text)
    .join('; ');

describe('the story record, from the saved sea school (26 Sep)', () => {
  test('the seaweed on the desks from the start is no change, and is carried nowhere', () => {
    const { record, violations } = run('sea-school');
    expect(found(violations, 'no_change', 'drop').map((v) => v.key)).toContain('l2@m3:desks');
    expect(record.changes['l2@m3:desks']).toBeUndefined();
    expect(record.moments.some((m) => m.carried.includes('l2@m3:desks'))).toBe(false);
  });

  test('the fish leaving is who is there, not a look of the classroom, and the fish are there until then', () => {
    const { record, violations } = run('sea-school');
    expect(record.changes['l2@m6:desks'].kind).toBe('presence');
    expect(found(violations, 'kind').some((v) => v.key === 'l2@m6:desks')).toBe(true);
    expect(record.moments.find((m) => m.id === 'm7')!.carried).not.toContain('l2@m6:desks');
    // The fish stay in the classroom, out of the focus of the moments not about them.
    expect(record.moments.find((m) => m.id === 'm4')!.present).toContain('p3');
  });

  test('Mr Hale stays an octopus in every moment after he turns, and the jacket he keeps is only guessed', () => {
    const { record, violations } = run('sea-school');
    const octopus = record.changes['p2@m4:body'];
    expect(octopus.kind).toBe('becomes');
    expect(found(violations, 'kind').some((v) => v.key === 'p2@m4:body')).toBe(true);
    for (const id of ['m5', 'm6']) {
      expect(carried(record, id).map((c) => c.key)).toContain('p2@m4:body');
      expect(record.moments.find((m) => m.id === id)!.looks.p2.becomes).toContain('octopus');
    }
    expect(octopus.guessed).toContain('still with brown jacket');
    expect(describeAt(record, 'm5')).toContain('turned into huge orange octopus');
  });

  test('the chalk is in his hands only where both are in view', () => {
    const { record, violations } = run('sea-school');
    expect(found(violations, 'carried', 'drop').some((v) => v.who === 't1')).toBe(true);
    for (const m of record.moments)
      for (const [t, h] of Object.entries(m.held)) expect(m.shows.includes(t) && m.shows.includes(h)).toBe(true);
  });

  test('differs from the continuity plan where the plan still draws the seaweed', () => {
    const { f, record } = run('sea-school');
    const d = diffPlan(record, planContinuity(f.breakdown));
    expect(d.find((x) => x.moment === 'm3')?.own.plan).toContain('l2@m3:desks');
  });
});

describe('the story record, from the saved hotel orchard (26 Sep)', () => {
  test('Tomas\'s "age and clothing" and his "body" are one change', () => {
    const { record, violations } = run('hotel-orchard-body');
    expect(found(violations, 'one_name', 'merge').map((v) => v.key)).toContain('p2@m2:age-and-clothing');
    expect(
      Object.values(record.changes)
        .filter((c) => c.who === 'p2')
        .map((c) => c.key),
    ).toEqual(['p2@m2:body']);
    expect(
      carried(record, 'm3')
        .filter((c) => c.who === 'p2')
        .map((c) => c.key),
    ).toEqual(['p2@m2:body']);
  });

  test('his look is from before he turns ten: the age leaked into it is stripped or asked, and the change stays', () => {
    const { record, violations } = run('hotel-orchard-age');
    expect(record.changes['p2@m2:age']).toBeDefined();
    expect(found(violations, 'no_change').some((v) => v.who === 'p2')).toBe(false);
    const stripped = found(violations, 'before', 'strip').filter((v) => v.who === 'p2');
    expect(stripped.some((v) => v.detail.includes('a ten-year-old boy with short dark brown hair'))).toBe(true);
    expect(stripped.some((v) => v.detail.includes('an old school uniform'))).toBe(true);
    expect(found(violations, 'before', 'ask').some((v) => v.detail.includes('identity "a ten-year-old boy"'))).toBe(
      true,
    );
    const p2 = record.elements.p2;
    expect(lookText({ appearance: p2.base.appearance ?? [], wardrobe: p2.base.wardrobe ?? [] })).not.toMatch(
      /ten|uniform/,
    );
    expect(
      lookBefore(record, 'p2@m2:age')!
        .facts.map((f) => f.text)
        .join('; '),
    ).not.toMatch(/\bten\b/);
  });

  test("the dreamer's age at the first moment is how they are, folded into their look", () => {
    const { record, violations } = run('hotel-orchard-age');
    expect(found(violations, 'first_look', 'fold').map((v) => v.key)).toContain('p1@m1:age');
    expect(record.changes['p1@m1:age']).toBeUndefined();
    // Their sketch already says it ("adult human"), so it is not said twice.
    expect(lookText(record.elements.p1.base)).toContain('adult');
  });
});

describe('the story record, from the saved jellyfish city (26 Sep)', () => {
  test('the jellyfish three moments name is flagged as cast nowhere', () => {
    const { violations } = run('jellyfish-city');
    const flag = found(violations, 'presence', 'flag').find((v) => v.detail.includes('jellyfish'));
    expect(flag?.at).toBe('m4');
    expect(flag?.detail).toContain('"the huge pink jellyfish"');
    expect(flag?.detail).toContain('m4, m5 and m6');
  });

  test('the raincoat she has worn all along is no change', () => {
    const { record, violations } = run('jellyfish-city');
    expect(found(violations, 'no_change', 'drop').map((v) => v.key)).toContain('p2@m7:clothing');
    expect(record.changes['p2@m7:clothing']).toBeUndefined();
  });

  test('"the anime city" is how it is drawn, not the story', () => {
    const { record, violations } = run('jellyfish-city');
    expect(found(violations, 'style', 'strip').some((v) => v.at === 'm1' && v.detail.includes('anime'))).toBe(true);
    expect(record.moments[0].words.action).not.toContain('anime');
    expect(record.moments[0].words.action).toContain('city made of blocks of colour');
  });
});

describe('the story record, from the saved crayon cat (26 Sep)', () => {
  test('"style all drawn in crayon" is no landmark of the back garden', () => {
    const { record, violations } = run('crayon-cat');
    expect(found(violations, 'style', 'strip').some((v) => v.who === 'l1' && v.detail.includes('crayon'))).toBe(true);
    expect(lookText(record.elements.l1.base) + lookText(record.elements.l1.stored)).not.toContain('crayon');
  });

  test('the dreamer made a small child from "when I was six" is stripped with their words, flagged without', () => {
    const { record, violations } = run('crayon-cat');
    const age = found(violations, 'style', 'strip').find((v) => v.who === 'p1');
    expect(age?.detail).toContain('"A small child"');
    expect(age?.detail).toContain('when I was six');
    expect(lookText(record.elements.p1.base)).not.toMatch(/child|six years/);
    const blind = run('crayon-cat', { words: false });
    expect(found(blind.violations, 'style', 'flag').some((v) => v.who === 'p1' && v.detail.includes('our guess'))).toBe(
      true,
    );
  });

  test("the dreamer's size at the first moment is their look, and Biscuit's look says nothing twice", () => {
    const { record, violations } = run('crayon-cat');
    expect(found(violations, 'first_look', 'fold').map((v) => v.key)).toContain('p1@m1:size');
    // Read from the story, never said.
    expect(record.elements.p1.base.appearance.find((f) => f.text === 'mouse-sized')?.basis).toBe('read');
    const dups = found(violations, 'duplicates', 'strip').filter((v) => v.who === 'p2');
    expect(dups.some((v) => v.detail.includes('"One white ear"') && v.detail.includes('"fur colour ginger"'))).toBe(
      true,
    );
  });
});

describe('the story record, from the saved car park (26 Sep)', () => {
  test('the stairwell\'s light "like old black and white film" and its landmarks said twice', () => {
    for (const items of [true, false]) {
      const { record, violations } = run('car-park', { items });
      expect(
        found(violations, 'style', 'strip').some(
          (v) => v.who === 'l1' && v.detail.includes('like old black and white film'),
        ),
      ).toBe(true);
      expect(
        found(violations, 'duplicates', 'strip').some(
          (v) => v.who === 'l1' && v.detail.includes('"walls Level 4 written on every wall"'),
        ),
      ).toBe(true);
      const l1 = record.elements.l1;
      expect(lookText(l1.base) + lookText(l1.stored)).not.toContain('film');
    }
  });

  test('the car that turns into the rowing boat it already is changes nothing, and m1 is not "black and white"', () => {
    const { record, violations } = run('car-park-boat');
    expect(found(violations, 'no_change', 'drop').map((v) => v.key)).toContain('t1@m4:form');
    expect(record.moments[0].words.action).not.toContain('black and white');
  });
});

describe('the story record, from the saved moon market (26 Sep)', () => {
  test('the lanterns floating into the sky are the market as it always looks', () => {
    const { record, violations } = run('moon-market');
    expect(found(violations, 'no_change', 'drop').map((v) => v.key)).toContain('l1@m4:sky');
    expect(record.moments.some((m) => m.carried.includes('l1@m4:sky'))).toBe(false);
  });

  test('the bowls are not in hand while they jump and float, and the crowd stays in the market', () => {
    const { record, violations } = run('moon-market');
    const bowls = found(violations, 'carried', 'drop').find((v) => v.who === 't1');
    expect(bowls?.detail).toContain('m5, m6 and m7');
    for (const id of ['m5', 'm6']) expect(record.moments.find((m) => m.id === id)!.held.t1).toBeUndefined();
    for (const id of ['m3', 'm6']) expect(record.moments.find((m) => m.id === id)!.present).toContain('p4');
  });
});

describe("the story record, from the saved grandma's kitchen (26 Sep)", () => {
  test('"red cardigan" is stripped from the look, so the changes at m5 are real, and "adult" is how she was before', () => {
    const { record, violations } = run('grandmas-kitchen');
    const strips = found(violations, 'before', 'strip');
    expect(strips.some((v) => v.key === 'p1@m5:clothing' && v.detail.includes('"red cardigan"'))).toBe(true);
    // "Adult" disagrees with "little again, child": it is the look before the change, and stays.
    expect(strips.some((v) => v.detail.includes('"adult"'))).toBe(false);
    expect(record.moments.find((m) => m.id === 'm5')!.own).toEqual(['p1@m5:age-size', 'p1@m5:clothing']);
    expect(lookText(record.elements.p1.base)).toContain('adult');
    expect(lookText(record.elements.p1.base)).not.toContain('cardigan');
    // Her in-between picture of the age change keeps nothing of her age before it.
    expect(
      lookBefore(record, 'p1@m5:age-size')!
        .facts.map((f) => f.text)
        .join('; '),
    ).not.toContain('adult');
  });

  test("the old film in the kitchen's landmarks is the style, and the phone on the wall is there throughout", () => {
    const { record, violations } = run('grandmas-kitchen');
    expect(found(violations, 'style', 'strip').some((v) => v.who === 'l1' && v.detail.includes('old film'))).toBe(true);
    // There, but never what a moment is about unless it says so: never the only one in it.
    expect(record.moments.every((m) => m.shows.includes('t2') || m.present.includes('t2'))).toBe(true);
    for (const m of record.moments) expect(m.shows).not.toEqual(['t2']);
  });

  test('the moment she looks down says what changes on her, seen through her own eyes', () => {
    const { record } = run('grandmas-kitchen');
    const m5 = record.moments.find((m) => m.id === 'm5')!;
    // Looking at herself, the dreamer is in the moment she is the camera of.
    expect(m5.shows).toEqual(['p1']);
    expect(m5.present).toContain('t2');
    const words = describeAt(record, 'm5');
    expect(words).toContain("Seen through the dreamer's own eyes.");
    expect(words).toContain("- the dreamer's age/size becomes little again, child");
    expect(describeAt(record, 'm6')).toContain('their age now little again, child');
    expect(nowAt(record, 'm6').map((x) => x.text)).toContain(
      'the dreamer is little again, child and wears gray cardigan',
    );
  });
});

describe('the story record, from the saved paper city and desert station (26 Sep)', () => {
  test('the birds rest on their shoulders until the dream jumps onto the white page', () => {
    const { record } = run('paper-city');
    expect(record.changes['p1@m4:shoulders'].kind).toBe('holding');
    expect(record.changes['p1@m4:shoulders'].until).toBe('m6');
    expect(record.moments.find((m) => m.id === 'm5')!.carried).toContain('p1@m4:shoulders');
    expect(record.moments.find((m) => m.id === 'm6')!.carried).not.toContain('p1@m4:shoulders');
  });

  test('the watched old man and camel are in the last moment, and the clock stays on its pole', () => {
    const { record } = run('desert-station');
    const at = (id: string) => record.moments.find((m) => m.id === id)!;
    expect(at('m6').shows).toEqual(expect.arrayContaining(['p2', 'p3']));
    // On its pole throughout, out of the focus of the moments that are not about it.
    for (const id of ['m1', 'm2', 'm4', 'm5', 'm6']) expect(at(id).present).toContain('t1');
    expect(at('m3').shows).toEqual(['t1']);
  });

  test('the clock melts at m3, where the words say so: its look before is unmelted', () => {
    const { record, violations } = run('desert-station');
    const melt = found(violations, 'passing', 'add').find((v) => v.who === 't1');
    expect(melt?.at).toBe('m3');
    expect(record.changes['t1@m3:appearance'].now).toBe('melting like wax');
    expect(lookText(record.elements.t1.base)).not.toMatch(/melt/);
    expect(lookText(record.elements.t1.stored)).not.toMatch(/melt/);
    expect(found(violations, 'before', 'flag').some((v) => v.who === 't1')).toBe(false);
    expect(record.moments.find((m) => m.id === 'm1')!.carried).toEqual([]);
    expect(carried(record, 'm6').map((c) => c.key)).toEqual(['t1@m3:appearance']);
    expect(nowAt(record, 'm6').map((x) => x.text)).toEqual(['the clock is melting like wax']);
  });
});

describe('the story record, whatever it is given', () => {
  const names = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  test('its repairs, run again on what they made, find nothing new', () => {
    for (const name of names) {
      const f = load(name);
      const opts = { words: f.words, style: f.style };
      const first = storyRecord(f.breakdown, f.items, null, opts);
      const seen = new Set(first.violations.map((v) => `${v.rule}|${v.detail}`));
      const again = recheckRecord(first.record, null, opts);
      expect(again.filter((v) => !['flag', 'ask'].includes(v.fix) || !seen.has(`${v.rule}|${v.detail}`))).toEqual([]);
    }
  });

  test('a dream with nothing wrong in it has nothing to repair', () => {
    const b = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8')) as Breakdown;
    const { record, violations } = storyRecord(b);
    expect(violations).toEqual([]);
    expect(describeAt(record, 'm1')).toContain('- the departure board: twenty black slats');
  });

  // Every saved session next to these tests, where there are any: it loads, and derives without
  // throwing. Saved sessions are not kept in the repository, so a fresh checkout has none.
  test('every saved session derives, and derives again to nothing new', () => {
    const dir = join(import.meta.dir, '..', 'state');
    const saved = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    for (const file of saved) {
      const s = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        draft?: { breakdown?: Breakdown };
        build?: { items?: Item[] };
        transcript?: { role: string; content: string }[];
      };
      if (!s.draft?.breakdown) continue;
      const opts = { words: (s.transcript ?? []).filter((e) => e.role === 'user').map((e) => e.content) };
      const first = storyRecord(s.draft.breakdown, s.build?.items ?? [], null, opts);
      expect(recheckRecord(first.record, null, opts).filter((v) => !['flag', 'ask'].includes(v.fix))).toEqual([]);
    }
  });

  test('it changes nothing it is given, and the same dream gives the same record', () => {
    const f = load('sea-school');
    const before = JSON.stringify([f.breakdown, f.items]);
    const a = storyRecord(f.breakdown, f.items, null, { words: f.words });
    const b = storyRecord(f.breakdown, f.items, null, { words: f.words });
    expect(JSON.stringify([f.breakdown, f.items])).toBe(before);
    expect(a.record.hash).toBe(b.record.hash);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('it never throws on a breakdown missing what it may miss', () => {
    const sparse = [
      {},
      { title: 'x' },
      { title: 'x', scenes: [{ id: 's1', moments: [{ id: 'm1', action: 'a room' }] }] },
      {
        title: 'x',
        people: [{ id: 'p1', name: 'you', is_dreamer: true }, { id: 'p2' }],
        places: [{ id: 'l1', name: 'a room', fields: { landmarks: { value: null, said: false } } }],
        things: [{ id: 't1', name: 'the clock', fields: {} }],
        scenes: [
          {
            id: 's1',
            place: 'l1',
            moments: [
              { id: 'm1', visible: ['p1', 'p9'], things: ['t1'], place: 'l1', leaves: [{ who: 't1' }, null] },
              { id: 'm2', place: 'l1', leaves: [{ who: 'p2', what: 'hair', now: 'white' }], states: [{ who: 'p7' }] },
            ],
          },
        ],
        unknowns: null,
      },
    ] as unknown as Breakdown[];
    for (const b of sparse) {
      const r = storyRecord(b, [{} as Item, { id: 'p2', fields: {} } as Item], {});
      expect(Array.isArray(r.violations)).toBe(true);
      for (const m of r.record.moments) expect(typeof describeAt(r.record, m.id)).toBe('string');
      expect(lookBefore(r.record, 'nothing')).toBeNull();
      expect(carried(r.record, 'nothing')).toEqual([]);
      expect(describeAt(r.record, 'nothing')).toBe('');
    }
  });
});

describe('what is carried from picture to picture, from the saved dreams a person marked down (26 Sep)', () => {
  const nowIn = (record: ReturnType<typeof run>['record'], id: string) => nowAt(record, id).map((x) => x.text);
  const at = (record: ReturnType<typeof run>['record'], id: string) => record.moments.find((m) => m.id === id)!;

  test('the flood stays in the library while the dream stays there (library-2 m5, m6, m9)', () => {
    const { record } = run('flooded-library');
    for (const id of ['m5', 'm6', 'm9']) {
      expect(at(record, id).carried).toEqual(['l1@m3:water', 'l1@m4:books']);
      expect(nowIn(record, id)).toContain('the water rises over the desks');
    }
  });

  test('water the words tell coming in, recorded nowhere, is a change of the library there (library-1 m3, m5)', () => {
    const { record, violations } = run('library-underwater');
    expect(found(violations, 'passing', 'add').map((v) => v.key)).toEqual(['l1@m2:water']);
    expect(record.changes['l1@m2:water'].now).toBe(
      'coming in under the doors, rising over the desks and up between the shelves',
    );
    for (const id of ['m3', 'm5']) {
      expect(at(record, id).carried).toContain('l1@m2:water');
      expect(nowIn(record, id)[0]).toStartWith('the water is coming in under the doors');
    }
  });

  test('water at the first moment is how the library looks, said until it rises further (library-3 m2)', () => {
    const { record } = run('water-rising-library');
    expect(record.changes['l1@m1:water']).toBeUndefined();
    expect(nowIn(record, 'm2')).toEqual([
      'the water is beginning to cover the floor',
      'the books are floating off shelves, open like birds',
    ]);
    expect(nowIn(record, 'm4')).toContain('the water is up over the tops of the desks');
    expect(nowIn(record, 'm4').join(' ')).not.toContain('beginning');
  });

  test("the suitcase stays in the grandfather's hands between the train and the door, shut (snow-train m4)", () => {
    const { record } = run('suitcase-letters');
    expect(at(record, 'm4').shows).toContain('t1');
    expect(at(record, 'm4').held).toEqual({ t1: 'p2' });
    expect(record.changes['t1@m3:appearance'].until).toBe('m4');
    // And the door they walk to is shut until the dreamer opens it at m6.
    expect(nowIn(record, 'm4')).toEqual(["the suitcase is shut, in the grandfather's hands", 'the door is shut']);
    expect(nowIn(record, 'm6')).toContain('the door is open, faint yellow glow spilling from the doorway');
  });

  test("the suitcase is the grandfather's from the start, shut once off the train, and handed over once (snow-train-2 m1, m5, m6, m7)", () => {
    const { record } = run('red-door');
    expect(at(record, 'm1').held).toEqual({ t1: 'p2' });
    expect(nowIn(record, 'm1')).toEqual(["the brown leather suitcase is in my grandfather's hands"]);
    expect(record.changes['t1@m3:lid'].until).toBe('m4');
    for (const id of ['m4', 'm5', 'm6', 'm7']) expect(at(record, id).carried).not.toContain('t1@m3:lid');
    expect(nowIn(record, 'm5')).toEqual([
      "the brown leather suitcase is shut, in my grandfather's hands",
      'the red door is shut',
    ]);
    expect(nowIn(record, 'm6')).toEqual([
      "the brown leather suitcase is shut, and passes from my grandfather's hands to the dreamer's",
      'the red door is shut',
    ]);
    expect(nowIn(record, 'm7')[0]).toBe("the brown leather suitcase is shut, in the dreamer's hands");
  });

  test('the dreamer beside the driver is still in the cab, the paper boat in their hands (lighthouse m13)', () => {
    const { record } = run('key-lighthouse');
    expect(at(record, 'm13').shows).not.toContain('p1');
    expect(at(record, 'm13').present).toEqual(['p1', 't2']);
    expect(at(record, 'm13').held).toEqual({ t2: 'p1' });
    expect(at(record, 'm14').shows).toContain('t2');
  });

  test('what a moment opens is open from there, and its look saying it open before is from after', () => {
    const { record, violations } = run('suitcase-letters');
    const door = record.changes['l2@m6:door'];
    expect(door.now).toBe('open, faint yellow glow spilling from the doorway');
    expect(found(violations, 'passing', 'add').some((v) => v.key === 'l2@m6:door')).toBe(true);
    expect(lookText(record.elements.l2.base)).not.toContain('spilling from the doorway');
    expect(lookText(record.elements.l2.base)).toContain('blue moonlight with soft shadows');
    expect(record.elements.l2.after).toEqual(['faint yellow glow spilling from the doorway']);
  });

  test('a thing stays in the hands of whoever holds it while the moments go on showing them, and no further', () => {
    // The key on the stairs, and the suitcase as the dreamer opens the door: both judged right with them in hand.
    expect(at(run('key-lighthouse').record, 'm5').held).toEqual({ t1: 'p1' });
    expect(at(run('suitcase-letters').record, 'm6').held).toEqual({ t1: 'p1' });
    // A moment not about Priya comes between the bowls and the jump: they are not carried into it.
    expect(at(run('moon-market').record, 'm5').held).toEqual({});
  });

  test('Tomas, found gone, is not there (orchard m7)', () => {
    const { record } = run('lift-orchard');
    expect(at(record, 'm7').gone).toEqual(['p2']);
    expect(at(record, 'm7').shows).toEqual([]);
    expect(at(record, 'm7').present).toEqual([]);
  });

  test('a lantern in view in the hands of someone out of it is still in their hands', () => {
    const { record, violations } = run('blue-lantern');
    expect(at(record, 'm3').held).toEqual({ t1: 'p2' });
    expect(at(record, 'm3').present).toContain('p2');
    expect(at(record, 'm5').held).toEqual({});
    expect(
      found(violations, 'carried', 'add')
        .filter((v) => v.who === 'p2')
        .map((v) => v.at),
    ).toEqual(['m3', 'm6']);
  });
});

describe('the rules, where the first reading of them misfired', () => {
  const tiny = (over: Partial<Breakdown>): Breakdown =>
    ({
      title: 'x',
      logline: '',
      look: {},
      world_logic: '',
      people: [{ id: 'p1', name: 'you', is_dreamer: true, fields: {} }],
      places: [
        { id: 'l1', name: 'the night market', fields: { landmarks: { value: 'fish stalls, lanterns', said: true } } },
      ],
      things: [],
      scenes: [],
      style_options: [],
      unknowns: [],
      ...over,
    }) as unknown as Breakdown;
  const moment = (id: string, action: string, visible: string[], things: string[] = []) => ({
    id,
    action,
    visible,
    things,
    place: 'l1',
    eyes: 'outside',
    distance: 'medium',
    looks_at: '',
    feeling: '',
    visual_point: '',
    purpose: '',
    continues: false,
    leaves: [],
    shift: '',
    key: false,
    said: true,
  });

  test("a family's labels say who wears what, and two of them may share a build", () => {
    const b = tiny({
      people: [
        { id: 'p1', name: 'you', is_dreamer: true, fields: {} },
        {
          id: 'p3',
          name: 'the family',
          fields: {
            appearance: {
              value: 'man in his 30s, short brown hair, average build; woman in her 30s, average build',
              said: true,
            },
            wardrobe: {
              value:
                'father: plain beige t-shirt and dark blue jeans; mother: light blue sundress; baby: yellow onesie',
              said: true,
            },
          },
        },
      ],
      scenes: [
        {
          id: 's1',
          title: '',
          place: 'l1',
          mood: '',
          moments: [moment('m1', 'the family stands by the stalls', ['p3'])],
        },
      ],
    } as unknown as Partial<Breakdown>);
    const { record, violations } = storyRecord(b);
    expect(record.elements.p3.kind).toBe('group');
    expect(record.elements.p3.base.wardrobe.map((f) => f.text)).toEqual([
      'father: plain beige t-shirt and dark blue jeans',
      'mother: light blue sundress',
      'baby: yellow onesie',
    ]);
    expect(found(violations, 'duplicates')).toEqual([]);
  });

  test('"the fish stall" brings no fish', () => {
    const b = tiny({
      people: [
        { id: 'p1', name: 'you', is_dreamer: true, fields: {} },
        { id: 'p2', name: 'the fish', fields: { identity: { value: 'a talking fish', said: true } } },
      ],
      scenes: [
        {
          id: 's1',
          title: '',
          place: 'l1',
          mood: '',
          moments: [
            moment('m1', 'the dreamer walks past the fish stall', ['p1']),
            moment('m2', "the fish on the ice says the dreamer's name", ['p1', 'p2']),
          ],
        },
      ],
    } as unknown as Partial<Breakdown>);
    const { record } = storyRecord(b);
    expect(record.moments[0].shows).toEqual(['p1']);
  });

  test('"age about 10" is an age, and "ten" is 10', () => {
    const { record, violations } = run('lift-orchard');
    expect(
      found(violations, 'before', 'strip').some((v) => v.key === 'p2@m2:age' && v.detail.includes('age about 10')),
    ).toBe(true);
    expect(lookBefore(record, 'p2@m2:age')!.facts.map((f) => f.text)).not.toContain('age about 10');
  });

  test("a place's in-between picture leaves out the part it replaces, and a place keeps its clock's face", () => {
    const paper = run('paper-city').record;
    expect(
      lookBefore(paper, 'l1@m5:houses')!
        .facts.map((f) => f.text)
        .join('; '),
    ).not.toContain('houses leaning');
    const kitchen = run('grandmas-kitchen').record;
    expect(
      lookBefore(kitchen, 'l1@m4:size')!
        .facts.map((f) => f.text)
        .join('; '),
    ).toContain('a large round clock');
  });
});

describe('the continuity plan made from the record (DREAMCHAT_RECORD=on)', () => {
  const planned = (name: string) => {
    const f = load(name);
    const b = structuredClone(f.breakdown);
    const rec = forPlan(storyRecord(b, f.items, null, { words: f.words, style: f.style }).record);
    return { b, rec, plan: planContinuity(b, rec) };
  };
  const cut = (plan: ReturnType<typeof planContinuity>, id: string) => plan.cuts.find((c) => c.id === id)!;

  test('is made only when the switch is on, and without it the plan is as it was', () => {
    const was = process.env.DREAMCHAT_RECORD;
    try {
      const f = load('red-door');
      for (const v of ['off', 'shadow']) {
        process.env.DREAMCHAT_RECORD = v;
        expect(recordForPlan(f.breakdown, f.items, null, { words: f.words })).toBeUndefined();
      }
      process.env.DREAMCHAT_RECORD = 'on';
      expect(recordForPlan(f.breakdown, f.items, null, { words: f.words })?.moments.m5.held).toEqual({ t1: 'p2' });
      const plain = planContinuity(structuredClone(f.breakdown));
      expect(plain.cuts.some((c) => 'now' in c || 'visible' in c)).toBe(false);
      expect(plain.ghosts.some((g) => 'key' in g || 'before' in g)).toBe(false);
      expect(JSON.stringify(planContinuity(structuredClone(f.breakdown), undefined))).toBe(JSON.stringify(plain));
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_RECORD;
      else process.env.DREAMCHAT_RECORD = was;
    }
  });

  test('the opened suitcase is no longer drawn from its picture open once off the train, and is one suitcase', () => {
    const { plan } = planned('red-door');
    const lid = plan.ghosts.find((g) => g.key === 't1@m3:lid')!;
    expect(lid.usedBy).toEqual(['m3']);
    for (const id of ['m4', 'm5', 'm6', 'm7']) expect(cut(plan, id).refs.some((r) => r.id === lid.id)).toBe(false);
    expect(cut(plan, 'm5').now).toEqual([
      { of: 't1', text: "the brown leather suitcase is shut, in my grandfather's hands" },
      { of: 't2', text: 'the red door is shut' },
    ]);
  });

  test('the flood is carried into every later moment in the library, by its key', () => {
    const { plan } = planned('flooded-library');
    expect(cut(plan, 'm5').states.map((st) => st.key)).toEqual(['l1@m3:water', 'l1@m4:books']);
    const water = plan.ghosts.find((g) => g.key === 'l1@m3:water')!;
    expect(water.usedBy).toEqual(expect.arrayContaining(['m3', 'm5', 'm6', 'm9']));
    // Rising further, the water is edited from the picture of it coming in.
    expect(water.after).toBe(plan.ghosts.find((g) => g.key === 'l1@m2:water')!.id);
  });

  test('no in-between picture for a first look or a change that changes nothing', () => {
    expect(planned('water-rising-library').plan.ghosts.some((g) => g.key === 'l1@m1:water')).toBe(false);
    expect(planned('sea-school').plan.ghosts.some((g) => g.of === 'l2' && g.state?.now === 'covered in seaweed')).toBe(
      false,
    );
  });

  test("the suitcase is in the field, in the grandfather's hands, on the floor plan too", () => {
    const { b, rec, plan } = planned('suitcase-letters');
    expect(cut(plan, 'm4').things).toContain('t1');
    expect(rawPlanBy(b, 'm4', rec)!.spots.find((s) => s.id === 't1')?.heldBy).toBe('p2');
    expect(rawPlanBy(b, 'm4')!.spots.some((s) => s.id === 't1')).toBe(false);
  });

  test('the bowls are not in hand while they jump, on the floor plan too', () => {
    const { b, rec } = planned('moon-market');
    expect(rawPlanBy(b, 'm5')!.spots.find((s) => s.id === 't1')?.heldBy).toBe('p2');
    expect(rawPlanBy(b, 'm5', rec)!.spots.find((s) => s.id === 't1')?.heldBy).toBeUndefined();
  });

  test('the dreamer is in the cab picture beside the driver, and Tomas, gone, is in no picture', () => {
    const cab = cut(planned('key-lighthouse').plan, 'm13');
    expect(cab.sees).toContain('p1');
    expect(cab.view).toContain('Also in the picture: the dreamer');
    expect(cab.view).not.toContain('Nobody else is in the picture');
    const orchard = cut(planned('lift-orchard').plan, 'm7');
    expect(orchard.sees ?? []).not.toContain('p2');
    expect(orchard.view).not.toContain('Tomas,');
  });
});

describe('the story record in shadow', () => {
  test('is off unless asked for, in shadow or on', () => {
    const was = process.env.DREAMCHAT_RECORD;
    try {
      delete process.env.DREAMCHAT_RECORD;
      expect(recordMode()).toBe('off');
      for (const [v, mode] of [
        ['off', 'off'],
        ['shadow', 'shadow'],
        ['on', 'on'],
        ['ON ', 'on'],
        ['yes', 'off'],
      ]) {
        process.env.DREAMCHAT_RECORD = v;
        expect(recordMode()).toBe(mode as 'off' | 'shadow' | 'on');
      }
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_RECORD;
      else process.env.DREAMCHAT_RECORD = was;
    }
  });

  test('logs what each rule found, and where it differs from the plan, beside the plan', async () => {
    const f = load('sea-school');
    const dir = mkdtempSync(join(tmpdir(), 'record-shadow-'));
    await inSession(dir, 'sea', async () =>
      shadowRecord('frames', f.breakdown, planContinuity(f.breakdown), f.items, { words: f.words }),
    );
    const log = readJevLog(dir, 'sea').filter((e) => e.kind === 'transition' && e.stage === 'record');
    const reasons = log.map((e) => (e.kind === 'transition' ? `${e.decision} ${e.reason}` : ''));
    expect(reasons[0]).toMatch(/^shadow frames: \d+ found: /);
    expect(reasons.some((r) => r.startsWith('no_change frames:') && r.includes('seaweed'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('differs frames:') && r.includes('l2@m3:desks'))).toBe(true);
  });
});
