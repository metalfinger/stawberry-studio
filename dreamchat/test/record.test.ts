import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planContinuity } from '../continuity';
import { inSession, readJevLog } from '../jevlog';
import type { Breakdown, StyleOption } from '../producer';
import {
  carried,
  describeAt,
  diffPlan,
  lookBefore,
  recheckRecord,
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

  test('the fish leaving is who is there, not a look of the classroom, and the fish are in view until then', () => {
    const { record, violations } = run('sea-school');
    expect(record.changes['l2@m6:desks'].kind).toBe('presence');
    expect(found(violations, 'kind').some((v) => v.key === 'l2@m6:desks')).toBe(true);
    expect(record.moments.find((m) => m.id === 'm7')!.carried).not.toContain('l2@m6:desks');
    expect(record.moments.find((m) => m.id === 'm4')!.shows).toContain('p3');
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
    for (const id of ['m3', 'm6']) expect(record.moments.find((m) => m.id === id)!.shows).toContain('p4');
  });
});

describe("the story record, from the saved grandma's kitchen (26 Sep)", () => {
  test('"adult" and "red cardigan" are stripped from the look, so the changes at m5 are real', () => {
    const { record, violations } = run('grandmas-kitchen');
    const strips = found(violations, 'before', 'strip');
    expect(strips.some((v) => v.key === 'p1@m5:age-size' && v.detail.includes('"adult"'))).toBe(true);
    expect(strips.some((v) => v.key === 'p1@m5:clothing' && v.detail.includes('"red cardigan"'))).toBe(true);
    expect(record.moments.find((m) => m.id === 'm5')!.own).toEqual(['p1@m5:age-size', 'p1@m5:clothing']);
    expect(lookText(record.elements.p1.base)).not.toMatch(/adult|cardigan/);
    expect(
      lookBefore(record, 'p1@m5:age-size')!
        .facts.map((f) => f.text)
        .join('; '),
    ).not.toContain('adult');
  });

  test("the old film in the kitchen's landmarks is the style, and the phone on the wall is there throughout", () => {
    const { record, violations } = run('grandmas-kitchen');
    expect(found(violations, 'style', 'strip').some((v) => v.who === 'l1' && v.detail.includes('old film'))).toBe(true);
    expect(record.moments.every((m) => m.shows.includes('t2'))).toBe(true);
  });

  test('the moment she looks down says what changes on her, seen through her own eyes', () => {
    const { record } = run('grandmas-kitchen');
    const words = describeAt(record, 'm5');
    expect(words).toContain("Seen through the dreamer's own eyes.");
    expect(words).toContain("- the dreamer's age/size becomes little again, child");
    expect(describeAt(record, 'm6')).toContain('the dreamer: their age now little again, child');
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
    const { record, violations } = run('desert-station');
    expect(record.moments.find((m) => m.id === 'm6')!.shows).toEqual(expect.arrayContaining(['p2', 'p3', 't1']));
    expect(record.moments.find((m) => m.id === 'm1')!.shows).toContain('t1');
    expect(found(violations, 'before', 'flag').some((v) => v.who === 't1' && v.detail.includes('melting'))).toBe(true);
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

describe('the story record in shadow', () => {
  test('is off unless asked for, and "on" is shadow for now', () => {
    const was = process.env.DREAMCHAT_RECORD;
    try {
      delete process.env.DREAMCHAT_RECORD;
      expect(recordMode()).toBe('off');
      for (const [v, mode] of [
        ['off', 'off'],
        ['shadow', 'shadow'],
        ['on', 'shadow'],
      ]) {
        process.env.DREAMCHAT_RECORD = v;
        expect(recordMode()).toBe(mode as 'off' | 'shadow');
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
