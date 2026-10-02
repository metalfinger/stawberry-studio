// A part's state a moment's own words give is its state there (the one builder's `point_state`), and a packet is
// linted for any cut that says otherwise: the merged flow's fresh Grandmother (2 Oct) said "the cutlery drawer closed
// beside her" at m10 while her state, her check and her prompt carried the drawer open from m9.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type DreamPacket, lintPacket } from '../packet';
import { opposed, samePart, stateOfNow, statedParts } from '../partstate';
import type { Breakdown, StyleOption } from '../producer';
import type { Blocking } from '../blocking';
import type { CastReading } from '../cast-types';
import { parseCast } from '../cast';
import { withCastSpots } from '../castplace';
import { withOpen } from '../continuity';
import { previsImage } from '../previs';
import { type NowOf, nowAt, storyRecord } from '../record';
import { type Item, openedLater } from '../sheets';

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

describe('a part named with its state', () => {
  test('after its name, before it, or as what is done to it; each part as last said', () => {
    const said = (x: string) => statedParts(x).map((s) => [s.part, s.head, s.state]);
    expect(
      said('the grandmother telling the dreamer their slot is over, the cutlery drawer closed beside her'),
    ).toEqual([['cutlery drawer', 'drawer', 'closed']]);
    expect(said('the open drawer full of cutlery')).toEqual([['drawer', 'drawer', 'open']]);
    expect(said('the door stands wide open')).toEqual([['door', 'door', 'open']]);
    expect(said('he shuts the lid of the chest')).toEqual([['lid', 'lid', 'closed']]);
    expect(said('she opens the wardrobe and the light is off')).toEqual([
      ['wardrobe', 'wardrobe', 'open'],
      ['light', 'light', 'off'],
    ]);
    expect(said('a dead ceiling light hangs over them')).toEqual([['ceiling light', 'light', 'off']]);
    expect(said('the lamp switched on')).toEqual([['lamp', 'lamp', 'on']]);
    expect(said('she opens the drawer, then shuts the drawer again')).toEqual([['drawer', 'drawer', 'closed']]);
  });

  test('never a state of something else: eyes closed, a laying-in, a window that shows something', () => {
    expect(statedParts('she closed her eyes')).toEqual([]);
    expect(statedParts('the grandmother laying the stamp among the knives and forks in her cutlery drawer')).toEqual(
      [],
    );
    expect(statedParts('the window over the sink showing the car park')).toEqual([]);
  });

  test('a state as a part is described, and which states cannot both hold', () => {
    expect(stateOfNow('open')).toBe('open');
    expect(stateOfNow('pulled fully out with cutlery inside')).toBe('open');
    expect(stateOfNow('shut tight')).toBe('closed');
    expect(stateOfNow('dark')).toBe('off');
    expect(stateOfNow('full of water')).toBeNull();
    expect(opposed('open', 'closed')).toBe(true);
    expect(opposed('on', 'off')).toBe(true);
    expect(opposed('open', 'off')).toBe(false);
    expect(opposed('open', null)).toBe(false);
  });
});

describe('the packet lint', () => {
  const cut = (point: string, now: string, ask: string, prompt: string) =>
    ({
      identity: { cut: 'm10' },
      story: { point, action: 'The grandmother tells the dreamer that their slot is over.' },
      state: {
        now: [
          {
            of: 'l2',
            called: 'her kitchen',
            name: 'her kitchen',
            kind: 'place',
            facts: [{ kind: 'part', part: 'cutlery drawer', what: 'cutlery drawer', now }],
          },
        ],
      },
      checks: { criteria: [{ with: null, text: ask, fix: '' }] },
      prompts: { 'nano-banana-pro': { text: prompt, images: [] } },
    }) as unknown as DreamPacket['cuts'][number];

  test('a part its point has in one state, while its state, a check or its prompt has it in the other', () => {
    const lint = lintPacket({
      cuts: [
        cut(
          'the grandmother telling the dreamer their slot is over, the cutlery drawer closed beside her',
          'open',
          "In this picture, is her kitchen's cutlery drawer open?",
          'How each one is at this moment: the cutlery drawer is open. The one thing this frame must show: the cutlery drawer closed beside her.',
        ),
      ],
    });
    expect(lint).toEqual([
      "m10: its point has the cutlery drawer closed; its state has her kitchen's cutlery drawer open",
      `m10: its point has the cutlery drawer closed; a check asks "In this picture, is her kitchen's cutlery drawer open?"`,
      'm10: its point has the cutlery drawer closed; its prompt says "How each one is at this moment: the cutlery drawer is open."',
    ]);
  });

  test('nothing where they agree, or the point says no state', () => {
    expect(
      lintPacket({
        cuts: [
          cut(
            'the cutlery drawer closed beside her',
            'closed',
            "In this picture, is her kitchen's cutlery drawer closed?",
            'the cutlery drawer is closed.',
          ),
          cut('the grandmother at the sink', 'open', "In this picture, is her kitchen's cutlery drawer open?", 'x.'),
        ],
      }),
    ).toEqual([]);
  });
});

describe("a part's state its moment's words give", () => {
  // The library underwater (test/fixtures/record): its door implied open at m4, and m5's own words have it closed.
  type Frozen = { breakdown: Breakdown; items: Item[]; words: string[]; style: StyleOption };
  const library = () => {
    const f = JSON.parse(
      readFileSync(join(import.meta.dir, 'fixtures', 'record', 'library-underwater.json'), 'utf8'),
    ) as Frozen;
    const m5 = f.breakdown.scenes.flatMap((sc) => sc.moments).find((m) => m.id === 'm5')!;
    m5.visual_point = `${m5.visual_point}, the library door closed behind her`;
    return f;
  };
  const read = { who: 'l1', what: 'door', now: 'open', basis: 'implied' as const, p: 0.9, ok: true };
  const doorAt = (step: string, m: string) =>
    withEnv({ DREAMCHAT_ONE_BUILDER: step }, () => {
      const f = library();
      const { record } = storyRecord(
        f.breakdown,
        f.items,
        { implied: { m4: [read] } },
        { words: f.words, style: f.style },
      );
      return nowAt(record, m)
        .map((x) => x.text)
        .filter((x) => /\bdoor\b/.test(x));
    });

  test('is its state there, against the one carried; before, as it was', () => {
    expect(doorAt('on', 'm4')).toEqual(['the door is open']);
    expect(doorAt('on', 'm5')).toEqual(['the door is closed']);
    // Without the step, carried open into the moment that says it closed.
    expect(doorAt('visible_device', 'm5')).toEqual(['the door is open']);
  });
});

// Her kitchen as the fresh import planned it: the sink and the cutlery drawer on the window wall.
const kitchen: Blocking = {
  front: 'the window wall over the sink',
  indoors: true,
  room: [3.5, 3],
  spots: [
    { id: 'x1', x: 1.5, y: 0.3, kind: 'thing', size: [0.8, 0.6, 0.9], fixture: true, name: 'the sink' },
    { id: 'x3', x: 2.8, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
    { id: 'p2', x: 2.8, y: 0.9, kind: 'person', faces: 'x3', pose: 'standing' },
  ],
};
const ON = { DREAMCHAT_ONE_BUILDER: 'on', DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' };
const OFF = { ...ON, DREAMCHAT_ONE_BUILDER: 'visible_device' };

describe('a place at rest, and what opens in it', () => {
  const place = {
    id: 'l2',
    kind: 'location',
    name: 'her kitchen',
    fields: { landmarks: { value: 'a sink under a window; a cutlery drawer', said: false } },
  } as unknown as Item;
  test('its sketch shuts what its moments put something into, or have open; before, only what they open', () => {
    const words = ['The grandmother puts the stamp into her cutlery drawer.'];
    expect(withEnv(ON, () => openedLater(place, words))).toEqual(['the cutlery drawer']);
    expect(withEnv(ON, () => openedLater(place, ['the open cutlery drawer beside her']))).toEqual([
      'the cutlery drawer',
    ]);
    expect(withEnv(OFF, () => openedLater(place, words))).toEqual([]);
    // Never what the place does not have.
    expect(withEnv(ON, () => openedLater(place, ['she puts the key into the wooden box']))).toEqual([]);
  });

  test('a drawer its state has open is open on the plan and drawn pulled out', () => {
    const facts = [
      {
        of: 'l2',
        called: 'her kitchen',
        name: 'her kitchen',
        kind: 'place',
        facts: [{ kind: 'part', part: 'cutlery drawer', what: 'cutlery drawer', now: 'open', implied: true }],
      },
    ] as NowOf[];
    const open = withEnv(ON, () => withOpen(kitchen, facts));
    expect(open.spots.find((s) => s.id === 'x3')?.open).toBe(true);
    expect(withEnv(OFF, () => withOpen(kitchen, facts)).spots.find((s) => s.id === 'x3')?.open).toBeUndefined();
    const eye = { at: { x: 1.75, y: 2.8 }, d: { x: 0.3, y: -1 }, height: 1.6, pitch: -0.3 };
    const name = (id: string) => kitchen.spots.find((s) => s.id === id)?.name ?? id;
    const shut = withEnv(ON, () => previsImage(kitchen, eye, [], name, 344, 192));
    const pulled = withEnv(ON, () => previsImage(open, eye, [], name, 344, 192));
    expect(Buffer.from(pulled).equals(Buffer.from(shut))).toBe(false);
  });
});

describe('a thing in what the place has', () => {
  const reading: CastReading = {
    things: [
      {
        name: 'the knives and forks',
        look: 'ordinary steel cutlery',
        kind: 'thing',
        moments: [{ id: 'm9', where: 'in' }],
        near: 'p2',
        side: null,
        size: null,
        many: null,
      },
    ],
    bodies: [],
    fixtures: [],
  };
  const moment = {
    id: 'm9',
    action: 'The grandmother puts the stamp into her cutlery drawer.',
    visual_point: 'the grandmother laying the stamp among the knives and forks in her cutlery drawer',
  };
  test('is inside it, at a size it holds; before, by whoever it is by, a table-high cube', () => {
    const c1 = withEnv(ON, () => withCastSpots(kitchen, reading, moment, 'p2')).spots.find((s) => s.id === 'c1')!;
    // In the drawer pulled out toward the room as far as there is room before her, just under its top: the moment
    // puts the stamp into it.
    expect([c1.x, c1.y, c1.above]).toEqual([2.8, 0.65, 0.74]);
    expect(c1.size).toEqual([0.25, 0.15, 0.04]);
    const before = withEnv(OFF, () => withCastSpots(kitchen, reading, moment, 'p2')).spots.find((s) => s.id === 'c1')!;
    expect(before.size).toEqual([0.6, 0.6, 0.6]);
  });

  test('never in someone, nor in what the plan does not have', () => {
    const away = { ...moment, visual_point: 'the knives and forks in the dishwasher' };
    const c1 = withEnv(ON, () => withCastSpots(kitchen, reading, away, 'p2')).spots.find((s) => s.id === 'c1')!;
    expect(c1.size).toEqual([0.6, 0.6, 0.6]);
  });
});

describe("a thing the cast reading names as one of its place's fixtures", () => {
  const b = {
    title: 'Leave Some for the Neighbours',
    logline: 'A power cut, and the whole house sleeps on the roof.',
    people: [{ id: 'p1', name: 'you', is_dreamer: true, fields: {} }],
    places: [
      {
        id: 'l1',
        name: 'the house',
        fields: { landmarks: { value: 'a ceiling light, dead since the power cut; stairs to the roof', said: false } },
      },
    ],
    things: [],
    scenes: [
      {
        id: 's1',
        place: 'l1',
        blocking: {
          front: 'the front door',
          indoors: true,
          room: [6, 5],
          spots: [
            {
              id: 'x1',
              x: 3,
              y: 2.5,
              kind: 'thing',
              fixture: true,
              name: 'the dead ceiling light',
              size: [0.4, 0.4, 0.2],
            },
          ],
        },
        moments: [
          {
            id: 'm1',
            place: 'l1',
            action: 'There is a power cut: the dead ceiling light hangs over the bedding laid out on the floor.',
            visual_point: 'the house dark in the power cut',
            visible: ['p1'],
            things: [],
          },
        ],
      },
    ],
  } as unknown as Breakdown;
  const content = JSON.stringify({
    things: [
      { name: 'the dead ceiling light', look: 'a plain glass shade', kind: 'thing', moments: ['m1'] },
      { name: 'the bedding', look: 'rolled mats', kind: 'thing', moments: ['m1'] },
    ],
  });
  test('is that fixture, never a second one; every other thing keeps its id', () => {
    const on = withEnv({ DREAMCHAT_ONE_BUILDER: 'on' }, () => parseCast(content, b));
    expect(on.reading.things.map((t) => [t.id, t.name])).toEqual([['c2', 'the bedding']]);
    expect(on.dropped).toContain(`thing "the dead ceiling light" at m1: the plan's fixture "the dead ceiling light"`);
    const off = withEnv({ DREAMCHAT_ONE_BUILDER: 'visible_device' }, () => parseCast(content, b));
    expect(off.reading.things.map((t) => [t.id, t.name])).toEqual([
      ['c1', 'the dead ceiling light'],
      ['c2', 'the bedding'],
    ]);
  });
});

describe('what the review found', () => {
  test("a light's on or out is where it is, but for a word that links it to its state", () => {
    expect(statedParts('the lamp on the bedside table')).toEqual([]);
    expect(statedParts('green glass lamps on every desk')).toEqual([]);
    expect(statedParts('the light on her face')).toEqual([]);
    expect(statedParts('she takes the torch out of her bag')).toEqual([]);
    expect(statedParts('a lamp out on the porch')).toEqual([]);
    expect(statedParts('the lamps left on.').map((x) => x.state)).toEqual(['on']);
    expect(statedParts('the torch switched off').map((x) => x.state)).toEqual(['off']);
    expect(statedParts('the door is not open')).toEqual([]);
  });

  test("a part's name starts where its article does, never with the verb before it", () => {
    expect(statedParts('she pushes the door open').map((x) => [x.part, x.state])).toEqual([['door', 'open']]);
    expect(statedParts('he kicks the gate shut').map((x) => [x.part, x.state])).toEqual([['gate', 'closed']]);
    expect(statedParts('she leaves the window open').map((x) => [x.part, x.state])).toEqual([['window', 'open']]);
  });

  test('two names are one part where the shorter is all in the longer, the last word the same', () => {
    expect(samePart('drawer', 'the cutlery drawer')).toBe(true);
    expect(samePart('cutlery drawer', 'her cutlery drawer')).toBe(true);
    expect(samePart('cupboard door', 'front door')).toBe(false);
    expect(samePart('front door', 'car door')).toBe(false);
    expect(samePart('drawer', 'the chest of drawers')).toBe(true);
  });

  test('the lint reads the action before the point: the point says what stands', () => {
    const lint = lintPacket({
      cuts: [
        {
          identity: { cut: 'm10' },
          story: {
            point: 'the cutlery drawer closed beside her',
            action: 'The grandmother opens the cutlery drawer, drops the stamp in and shuts it again.',
          },
          state: {
            now: [
              {
                of: 'l2',
                called: 'her kitchen',
                name: 'her kitchen',
                kind: 'place',
                facts: [{ kind: 'part', part: 'cutlery drawer', what: 'cutlery drawer', now: 'closed' }],
              },
            ],
          },
          checks: { criteria: [] },
          prompts: { 'nano-banana-pro': { text: 'the cutlery drawer is closed.', images: [] } },
        } as unknown as DreamPacket['cuts'][number],
      ],
    });
    expect(lint).toEqual([]);
  });

  test('a thing in a field, a pond or a doorway is never flattened into it; nor across a clause', () => {
    const yard: Blocking = {
      front: 'the gate',
      indoors: false,
      room: [20, 20],
      spots: [
        {
          id: 'x1',
          x: 10,
          y: 10,
          kind: 'thing',
          fixture: true,
          name: 'the wheat field',
          size: [10, 10, 0.05],
          shape: 'ground',
        },
        { id: 'x2', x: 3, y: 3, kind: 'thing', fixture: true, name: 'the doorway', size: [1, 0.2, 2.2] },
        { id: 'p1', x: 5, y: 5, kind: 'person', faces: 'front', pose: 'standing' },
      ],
    };
    const r = (name: string, kind: 'thing' | 'vehicle' | 'creature') =>
      ({
        things: [
          {
            name,
            look: '',
            kind,
            moments: [{ id: 'm1', where: 'in' }],
            near: 'p1',
            side: null,
            size: null,
            many: null,
          },
        ],
        bodies: [],
        fixtures: [],
      }) as CastReading;
    const at = (name: string, kind: 'thing' | 'vehicle' | 'creature', words: string) =>
      withEnv(ON, () => withCastSpots(yard, r(name, kind), { id: 'm1', action: words }, 'p1')).spots.find(
        (s) => s.id === 'c1',
      )!;
    expect(at('the red tractor', 'vehicle', 'the red tractor driving slowly in the wheat field').above).toBeUndefined();
    expect(
      at('the red tractor', 'vehicle', 'the red tractor driving slowly in the wheat field').size?.[2],
    ).toBeGreaterThan(1);
    expect(
      at('the knife', 'thing', 'the knife on the floor, the grandmother standing in the doorway').above,
    ).toBeUndefined();
  });

  test('a cast thing is a fixture only where its moment has one by its whole name, on a plan of its own', () => {
    const b = {
      title: 't',
      logline: '',
      people: [{ id: 'p1', name: 'you', is_dreamer: true, fields: {} }],
      places: [
        {
          id: 'l1',
          name: 'the bedroom',
          fields: { landmarks: { value: 'a bed; a glass shade on the ceiling, its light', said: false } },
        },
        { id: 'l2', name: 'the garden', fields: {} },
      ],
      things: [],
      scenes: [
        {
          id: 's1',
          place: 'l1',
          blocking: {
            front: 'the window',
            indoors: true,
            room: [4, 4],
            spots: [
              { id: 'x1', x: 2, y: 2, kind: 'thing', fixture: true, name: 'the ceiling light', size: [0.4, 0.4, 0.2] },
            ],
          },
          moments: [
            {
              id: 'm1',
              place: 'l1',
              action: 'The light glows over the bed.',
              visual_point: '',
              visible: ['p1'],
              things: [],
            },
            {
              id: 'm2',
              place: 'l1',
              action: 'The ceiling light flickers.',
              visual_point: '',
              visible: ['p1'],
              things: [],
            },
          ],
        },
        {
          id: 's2',
          place: 'l2',
          blocking: { front: 'the gate', indoors: false, room: [10, 10], spots: [] },
          moments: [
            {
              id: 'm3',
              place: 'l2',
              action: 'The ceiling light floats over the garden.',
              visual_point: '',
              visible: ['p1'],
              things: [],
            },
          ],
        },
      ],
    } as unknown as Breakdown;
    const content = JSON.stringify({
      things: [{ name: 'the ceiling light', look: 'a glass shade', kind: 'thing', moments: ['m2', 'm3'] }],
    });
    const got = withEnv({ DREAMCHAT_ONE_BUILDER: 'on' }, () => parseCast(content, b)).reading;
    // The bedroom's own at m2, as its words name it; cast only in the garden, which has no such fixture.
    expect(got.things.map((t) => [t.id, t.name, t.moments.map((m) => m.id)])).toEqual([
      ['c1', 'the ceiling light', ['m3']],
    ]);
    expect(got.asFixture).toEqual([{ id: 'c1', at: ['m2'] }]);
    // On a plan, a one-word name is a fixture only by that word alone: "the light" is no "ceiling light".
    const plan: Blocking = {
      front: 'the window',
      indoors: true,
      room: [4, 4],
      spots: [
        { id: 'x1', x: 2, y: 2, kind: 'thing', fixture: true, name: 'the ceiling light', size: [0.4, 0.4, 0.2] },
        { id: 'p1', x: 1, y: 1, kind: 'person', faces: 'front', pose: 'standing' },
      ],
    };
    const orb = {
      things: [
        {
          name: 'the light',
          look: '',
          kind: 'thing',
          moments: [{ id: 'm1', where: 'in' }],
          near: null,
          side: null,
          size: null,
          many: null,
        },
      ],
      bodies: [],
      fixtures: [],
    } as CastReading;
    const placed = withEnv(ON, () => withCastSpots(plan, orb, { id: 'm1', action: 'The light glows.' }, 'p1'));
    expect(placed.spots.map((s) => s.id)).toEqual(['x1', 'p1', 'c1']);
  });
});

describe('a cast thing its place never names', () => {
  test('keeps its own sketch; on the plan, the fixture by its name stands for it, never a second one', () => {
    const plan: Blocking = {
      front: 'the gate',
      indoors: true,
      room: [6, 5],
      spots: [
        { id: 'x1', x: 3, y: 2.5, kind: 'thing', fixture: true, name: 'the stopped train', size: [4, 5, 3] },
        { id: 'p1', x: 1, y: 1, kind: 'person', faces: 'front', pose: 'standing' },
      ],
    };
    const reading = {
      things: [
        {
          name: 'the stopped train',
          look: '',
          kind: 'thing',
          moments: [{ id: 'm1', where: 'in' }],
          near: null,
          side: null,
          size: null,
          many: null,
        },
      ],
      bodies: [],
      fixtures: [],
    } as CastReading;
    const on = withEnv(ON, () => withCastSpots(plan, reading, { id: 'm1', action: 'the stopped train' }, 'p1'));
    expect(on.spots.map((s) => s.id)).toEqual(['x1', 'p1']);
    const off = withEnv(OFF, () => withCastSpots(plan, reading, { id: 'm1', action: 'the stopped train' }, 'p1'));
    expect(off.spots.map((s) => s.id)).toEqual(['x1', 'p1', 'c1']);
  });
});

describe('a part said open where nothing was, or said twice in one moment', () => {
  type Frozen = { breakdown: Breakdown; items: Item[]; words: string[]; style: StyleOption };
  const library = (words: Record<string, Partial<{ action: string; visual_point: string }>>) => {
    const f = JSON.parse(
      readFileSync(join(import.meta.dir, 'fixtures', 'record', 'library-underwater.json'), 'utf8'),
    ) as Frozen;
    for (const m of f.breakdown.scenes.flatMap((sc) => sc.moments)) Object.assign(m, words[m.id] ?? {});
    return f;
  };
  const doorAt = (f: Frozen, m: string) =>
    withEnv({ DREAMCHAT_ONE_BUILDER: 'on' }, () =>
      nowAt(storyRecord(f.breakdown, f.items, undefined, { words: f.words, style: f.style }).record, m)
        .map((x) => x.text)
        .filter((x) => /\b(?:door|window)s?\b/.test(x)),
    );
  test('what the moment says last of a part it opens and shuts stands', () => {
    const f = library({
      m4: { action: 'The sister opens the door.', visual_point: 'the door closed again behind them' },
    });
    expect(doorAt(f, 'm4').join(' ')).not.toMatch(/\bopen\b/);
  });
  test('never a part remembered, nor a door that opens onto somewhere', () => {
    const remembered = library({
      m4: { visual_point: 'the sister remembering the open window of her childhood bedroom' },
    });
    expect(doorAt(remembered, 'm4').join(' ')).not.toMatch(/window is open/);
    const onto = library({ m4: { visual_point: 'The door opened onto a garden.' } });
    expect(doorAt(onto, 'm5').join(' ')).not.toMatch(/door is open/);
  });
});

describe('of several fixtures a part could be', () => {
  test('the one whose name has every word of it opens; of several alike, none', () => {
    const hall: Blocking = {
      front: 'the sliding doors',
      indoors: true,
      room: [10, 4],
      spots: [
        {
          id: 'x1',
          x: 5,
          y: 0.1,
          kind: 'thing',
          fixture: true,
          name: 'the sliding doors to the church auditorium',
          size: [2, 0.1, 2.2],
        },
        { id: 'cf1', x: 1, y: 3.9, kind: 'thing', fixture: true, name: 'a door', size: [0.9, 0.1, 2.1] },
        { id: 'cf2', x: 3, y: 3.9, kind: 'thing', fixture: true, name: 'a door', size: [0.9, 0.1, 2.1] },
      ],
    };
    const facts = (what: string) =>
      [
        {
          of: 'l1',
          called: 'the hall',
          name: 'the hall',
          kind: 'place',
          facts: [{ kind: 'part', part: what, what, now: 'open' }],
        },
      ] as NowOf[];
    const open = (what: string) =>
      withEnv(ON, () => withOpen(hall, facts(what)))
        .spots.filter((s) => s.open)
        .map((s) => s.id);
    expect(open('sliding doors')).toEqual(['x1']);
    // Said by its kind and by its own name, the own name says which: "door" of "sliding doors", "thrown open".
    const both = [
      {
        of: 'l1',
        called: 'the hall',
        name: 'the hall',
        kind: 'place',
        facts: [{ kind: 'part', part: 'door', what: 'sliding doors', now: 'thrown open into the church' }],
      },
    ] as NowOf[];
    expect(
      withEnv(ON, () => withOpen(hall, both))
        .spots.filter((s) => s.open)
        .map((s) => s.id),
    ).toEqual(['x1']);
    expect(open('door')).toEqual([]);
  });
});
