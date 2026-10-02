// A moment whose beat is said, asked, a time or a schedule shows it by something seen (the one builder's
// `visible_device`): the merged flow's Grandmother on Wednesdays (2 Oct), whose "only on Wednesdays", "the 2-3pm
// appointment", "asks if she has eaten" and "our slot has gotten over" were each two people in a kitchen. The reading
// is grounded by code: the beat its moment's or the dream's own words, nothing to read on a thing but the dream's own
// day or time (lettered in code after), a bubble only by someone; and each device is placed, said and lettered.
import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import {
  deviceLine,
  type DevicesReading,
  letteringItems,
  letteringOf,
  parseDevices,
  withDevices,
  withDeviceThings,
  withKnown,
} from '../devices';
import type { Breakdown, Moment } from '../producer';

const detail = (value: string | null = null) => ({ value, said: false });
const moment = (m: Partial<Moment> & { id: string }): Moment =>
  ({
    action: `moment ${m.id}`,
    visible: ['p1', 'p2'],
    things: [],
    place: 'l2',
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
    ...m,
  }) as Moment;
const b = {
  title: 'Grandmother on Wednesdays',
  logline: 'My grandmother is alive again, but only on Wednesdays.',
  people: [
    { id: 'p1', name: 'grandmother', is_dreamer: false, fields: {} },
    { id: 'p2', name: 'you', is_dreamer: true, fields: {} },
  ],
  places: [{ id: 'l2', name: 'her kitchen', fields: { geography: detail(), landmarks: detail(), light: detail() } }],
  things: [],
  scenes: [
    {
      id: 's1',
      moments: [
        moment({ id: 'm3', action: 'The dreamer is told they got the 2-3pm appointment with grandmother.' }),
        moment({ id: 'm5', action: 'The dreamer asks grandmother yet again if she has eaten.' }),
        moment({ id: 'm10', action: 'Grandmother tells the dreamer their slot has gotten over.' }),
      ],
    },
  ],
} as unknown as Breakdown;
const text = 'My grandmother was alive again, but only on Wednesdays. I got the 2-3pm appointment with her.';

describe('the reading', () => {
  test("a device kept for a moment whose own words, or the dream's, it carries; one a moment", () => {
    const { reading, dropped } = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: 'the kitchen wall clock',
            look: 'a round wall clock, plain white face, black hands',
            where: 'wall',
            by: null,
            moments: {
              m10: {
                beat: 'their slot has gotten over',
                shows: 'its hands at three',
                act: 'grandmother pointing at it',
              },
            },
          },
          {
            name: 'the plate of food',
            look: 'a white plate with a simple meal on it',
            where: 'table',
            by: 'p1',
            moments: { m5: { beat: 'if she has eaten', shows: 'a full plate, untouched', act: '' } },
          },
          {
            name: 'the second clock',
            look: 'a clock',
            where: 'wall',
            by: null,
            moments: { m10: { beat: 'slot has gotten over', shows: 'its hands at three', act: '' } },
          },
          {
            name: 'the calendar',
            look: 'a calendar',
            where: 'wall',
            by: null,
            moments: { m9: { beat: 'only on Wednesdays', shows: 'Wednesday circled', act: '' } },
          },
        ],
      }),
      b,
      text,
    );
    expect(reading.devices.map((d) => [d.id, d.name, Object.keys(d.moments)])).toEqual([
      ['v1', 'the kitchen wall clock', ['m10']],
      ['v2', 'the plate of food', ['m5']],
    ]);
    expect(dropped.some((x) => x.includes('the moment has its device'))).toBe(true);
    expect(dropped.some((x) => x.includes('m9: not a moment of the dream'))).toBe(true);
  });

  test("what is written on a thing is never its look: lettering only the dream's own day or time", () => {
    const { reading } = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: 'the appointment card',
            look: 'a small white appointment card, a line of unreadable marks above a time written in bold',
            where: 'held',
            by: 'p1',
            lettering: { text: 'WED 2–3 PM', on: "the card's face" },
            moments: {
              m3: {
                beat: 'the 2-3pm appointment',
                shows: 'the 2-3 PM slot written on its face',
                act: 'held out to the dreamer',
              },
            },
          },
          {
            name: 'the note',
            look: 'a note',
            where: 'held',
            by: 'p2',
            lettering: { text: 'ASK HER', on: 'the note' },
            moments: { m5: { beat: 'if she has eaten', shows: 'folded', act: '' } },
          },
        ],
      }),
      b,
      text,
    );
    expect(reading.devices[0]).toMatchObject({
      look: 'a small white appointment card, a line of unreadable marks',
      lettering: { text: 'WED 2–3 PM', on: "the card's face" },
      moments: { m3: { shows: 'its face turned outward' } },
    });
    expect(reading.devices[1].lettering).toBeUndefined();
    for (const t of ['WED', '2-3 PM', 'Wednesdays', 'M T W T F S S'])
      expect(letteringOf({ text: t, on: 'it' }, text)).toBeDefined();
    for (const t of ['THU', 'GRANDMA', 'APPOINTMENT 2-3', 'MEET AT 2', '4 PM'])
      expect(letteringOf({ text: t, on: 'it' }, text)).toBeUndefined();
  });

  test('a bubble only by someone, with a picture and no words in it', () => {
    const { reading, dropped } = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: "the dreamer's speech bubble",
            look: 'a round speech bubble',
            where: 'bubble',
            bubble: 'speech',
            by: 'p2',
            moments: { m5: { beat: 'if she has eaten', shows: 'a bowl of soup and a question mark', act: '' } },
          },
          {
            name: 'a thought bubble',
            look: 'a cloud',
            where: 'bubble',
            by: null,
            moments: { m3: { beat: 'the 2-3pm appointment', shows: 'a clock', act: '' } },
          },
        ],
      }),
      b,
      text,
    );
    expect(reading.devices).toHaveLength(1);
    expect(reading.devices[0]).toMatchObject({ bubble: 'speech', by: 'p2' });
    expect(dropped.some((x) => x.includes('by no one'))).toBe(true);
    // One in a dream at most: a second is dropped, never a habit.
    const two = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: 'a first bubble',
            look: 'round',
            where: 'bubble',
            by: 'p2',
            moments: { m5: { beat: 'if she has eaten', shows: 'a bowl of soup', act: '' } },
          },
          {
            name: 'a second bubble',
            look: 'round',
            where: 'bubble',
            by: 'p1',
            moments: { m10: { beat: 'slot has gotten over', shows: 'a clock', act: '' } },
          },
        ],
      }),
      b,
      text,
    );
    expect(two.reading.devices.map((d) => [d.id, d.name])).toEqual([['v1', 'a first bubble']]);
  });
});

const reading: DevicesReading = {
  devices: [
    {
      id: 'v1',
      name: 'the kitchen wall clock',
      look: 'a round wall clock',
      where: 'wall',
      by: 'p1',
      moments: { m10: { beat: 'slot', shows: 'its hands at three', act: 'grandmother pointing at it' } },
    },
    {
      id: 'v2',
      name: 'the appointment card',
      look: 'a small white card',
      where: 'held',
      by: 'p1',
      lettering: { text: 'WED 2–3 PM', on: "the card's face" },
      moments: { m3: { beat: 'appointment', shows: 'its face turned outward', act: 'held out to the dreamer' } },
    },
    {
      id: 'v3',
      name: 'the plate of food',
      look: 'a white plate',
      where: 'table',
      by: 'p1',
      moments: { m5: { beat: 'eaten', shows: 'a full plate, untouched', act: '' } },
    },
    {
      id: 'v4',
      name: "the dreamer's speech bubble",
      look: 'a round bubble',
      where: 'bubble',
      bubble: 'speech',
      by: 'p2',
      moments: { m11: { beat: 'eaten', shows: 'a bowl of soup', act: '' } },
    },
  ],
};
const kitchen: Blocking = {
  front: 'the window wall over the sink',
  indoors: true,
  room: [3.5, 3],
  spots: [
    { id: 'p1', x: 2.7, y: 0.9, kind: 'person', pose: 'standing' },
    { id: 'p2', x: 1.7, y: 1.4, kind: 'person', pose: 'standing' },
    { id: 'x4', x: 1.5, y: 2.2, kind: 'thing', size: [1.2, 0.8, 0.75], fixture: true, name: 'the kitchen table' },
  ],
};

describe('placed, said and lettered', () => {
  test('on the wall nearest whoever it is by, at eye height; in their hands; on the table', () => {
    const at = (m: string) =>
      withDevices(kitchen, reading, { id: m, action: '' }, 'p2').spots.find((s) => /^v/.test(s.id));
    // She stands nearer the right wall than the window wall: flat on it, level with her.
    expect(at('m10')).toMatchObject({ id: 'v1', x: 3.46, y: 0.9 });
    expect(at('m10')!.above).toBeGreaterThan(1.2);
    expect(at('m3')).toMatchObject({ id: 'v2', heldBy: 'p1', x: 2.7, y: 0.9 });
    const plate = at('m5')!;
    expect(Math.hypot(plate.x - 1.5, plate.y - 2.2)).toBeLessThan(0.7);
    expect(plate.size).toEqual([0.2, 0.2, 0.06]);
    // A bubble is drawn by its speaker's head, never on the plan.
    expect(at('m11')).toBeUndefined();
    // Never on a window: slid along the wall clear of it (the kitchen clock was taken for something out past it).
    const windowed: Blocking = {
      ...kitchen,
      spots: [
        ...kitchen.spots.map((s) => (s.id === 'p1' ? { ...s, x: 1.5, y: 0.6 } : s)),
        {
          id: 'x2',
          x: 1.5,
          y: 0.03,
          kind: 'thing',
          size: [1.2, 0.05, 1],
          fixture: true,
          name: 'the window over the sink',
        },
      ],
    };
    const clock = withDevices(windowed, reading, { id: 'm10', action: '' }, 'p2').spots.find((s) => s.id === 'v1')!;
    expect(Math.abs(clock.x - 1.5)).toBeGreaterThan(0.6 + 0.17);
  });

  test('the picture told how it shows the beat; the lettering left plain for code, its lines as they must read', () => {
    const name = (id: string) => ({ p1: 'grandmother', p2: 'the dreamer' })[id] ?? id;
    expect(deviceLine(reading, 'm10', name)).toBe(
      'the kitchen wall clock, its hands at three; grandmother pointing at it',
    );
    expect(deviceLine(reading, 'm3', name)).toBe(
      "the appointment card, its face turned outward, the card's face blank, nothing on it; held out to the dreamer",
    );
    expect(deviceLine(reading, 'm11', name)).toBe(
      "a speech bubble by the dreamer's head, holding a picture of a bowl of soup, no words in it",
    );
    expect(letteringItems(reading, 'm3', name)).toEqual([
      {
        id: 'v2-text',
        text: ['WED', '2–3 PM'],
        device: 'card',
        on: 'v2',
        where: "on the card's face, in grandmother's hands",
      },
    ]);
    const week: DevicesReading = {
      devices: [
        {
          ...reading.devices[0],
          id: 'v5',
          name: 'the week strip',
          lettering: { text: 'M T W T F S S', on: 'its boxes' },
        },
      ],
    };
    expect(letteringItems(week, 'm10')[0]).toMatchObject({
      text: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
      device: 'strip',
    });
    expect(letteringItems(reading, 'm10')).toEqual([]);
  });

  test('each device a thing of the dream, in the moments that have it', () => {
    const out = withDeviceThings(b, reading);
    // A bubble is no thing of the dream.
    expect(out.things.map((t) => t.id)).toEqual(['v1', 'v2', 'v3']);
    expect(out.scenes[0].moments.find((m) => m.id === 'm10')!.things).toContain('v1');
    expect(withDeviceThings(b, { devices: [] })).toBe(b);
  });
});

describe('what the review of the reading found', () => {
  const read = (devices: unknown[], tx = text) => parseDevices(JSON.stringify({ devices }), b, tx);

  test('no lettering the dream does not give: a word that only starts like a month, "sat", a number inside another', () => {
    const tx = 'At the market she sat by the apron stall, maybe 45 people, I decided at 10am. The sun was out. 2-314.';
    for (const t of [
      'MARKET',
      'MAYBE',
      'DEC',
      'APR',
      'SAT',
      '4',
      'WED 4',
      '1',
      '20',
      '2-3',
      'PM',
      '2-',
      'M T W T F S S',
    ])
      expect([t, letteringOf({ text: t, on: 'it' }, tx)]).toEqual([t, undefined]);
    expect(letteringOf({ text: '10AM', on: 'it' }, tx)).toBeDefined();
    expect(letteringOf({ text: 'MON', on: 'it' }, 'It was a Monday.')).toBeDefined();
  });

  test('nothing to read left in a look or what it shows; a bubble whose picture is words dropped', () => {
    const { reading } = read([
      {
        name: 'the wall calendar',
        look: 'a paper wall calendar, WEDNESDAY in big red capitals at the top, 2-3 PM printed under it',
        where: 'wall',
        by: 'p1',
        moments: { m10: { beat: 'their slot has gotten over', shows: 'the 2-3 PM slot circled in red', act: '' } },
      },
      {
        name: 'a bubble of words',
        look: 'round',
        where: 'bubble',
        by: 'p1',
        moments: { m5: { beat: 'if she has eaten', shows: 'the words have you eaten', act: '' } },
      },
    ]);
    expect(reading.devices).toHaveLength(1);
    expect(reading.devices[0].look).toBe('a paper wall calendar');
    expect(reading.devices[0].moments.m10.shows).toBe('its face turned outward');
  });

  test("a thing before a bubble for the same moment; the beat its moment's words; whoever holds it there", () => {
    const { reading, dropped } = read([
      {
        name: 'a bubble',
        look: 'round',
        where: 'bubble',
        by: 'p1',
        moments: { m10: { beat: 'their slot has gotten over', shows: 'a clock', act: '' } },
      },
      {
        name: 'the kitchen clock',
        look: 'round',
        where: 'wall',
        by: null,
        moments: { m10: { beat: 'their slot has gotten over', shows: 'its hands at three', act: '' } },
      },
      {
        name: 'the stair rail',
        look: 'wooden',
        where: 'wall',
        by: null,
        moments: { m3: { beat: 'the', shows: 'polished', act: '' } },
      },
      {
        name: 'the cake',
        look: 'a cake',
        where: 'held',
        by: 'p1',
        moments: { m5: { beat: 'if she has eaten', shows: 'whole', act: '' } },
      },
    ]);
    expect(reading.devices.map((d) => [d.name, Object.keys(d.moments)])).toEqual([
      ['the kitchen clock', ['m10']],
      ['the cake', ['m5']],
    ]);
    expect(dropped.some((x) => x.includes('"the" not its moment'))).toBe(true);
    // Held by someone the moment does not have, or done by them: never.
    const away = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: 'the cake',
            look: 'a cake',
            where: 'held',
            by: 'p1',
            moments: { m5: { beat: 'if she has eaten', shows: 'whole', act: '' } },
          },
          {
            name: 'the plate',
            look: 'white',
            where: 'table',
            by: null,
            moments: { m5: { beat: 'if she has eaten', shows: 'full', act: 'grandmother pointing at it' } },
          },
        ],
      }),
      {
        ...b,
        scenes: [{ ...b.scenes[0], moments: b.scenes[0].moments.map((m) => ({ ...m, visible: ['p2'] })) }],
      } as Breakdown,
      text,
    );
    expect(away.reading.devices.map((d) => [d.name, d.moments.m5?.act])).toEqual([['the plate', '']]);
  });

  test('outdoors, on a post beside them; never on a sofa; a week of days its day by its place', () => {
    const park: Blocking = { front: 'the path', spots: [{ id: 'p1', x: 4, y: 4, kind: 'person', pose: 'standing' }] };
    const clock = withDevices(park, reading, { id: 'm10', action: '' }, 'p2').spots.find((s) => s.id === 'v1')!;
    expect(clock).toMatchObject({ x: 4.8, y: 4 });
    expect(clock.above).toBeGreaterThan(1);
    const lounge: Blocking = {
      ...kitchen,
      spots: [
        kitchen.spots[0],
        kitchen.spots[1],
        { id: 'x9', x: 2.5, y: 1.2, kind: 'thing', size: [2, 0.9, 0.8], name: 'the sofa' },
        { id: 'x8', x: 0.5, y: 2.5, kind: 'thing', size: [0.6, 0.6, 0.9], name: 'the side cabinet' },
      ],
    };
    const plate = withDevices(lounge, reading, { id: 'm5', action: '' }, 'p2').spots.find((s) => s.id === 'v3')!;
    expect([plate.x, plate.y]).toEqual([0.5, 2.5]);
    const week: DevicesReading = {
      devices: [
        {
          id: 'v5',
          name: 'the week strip',
          look: 'seven boxes',
          where: 'wall',
          by: 'p1',
          lettering: { text: 'M T W T F S S', on: 'its boxes' },
          moments: { m1: { beat: 'only on Wednesdays', shows: 'the Wednesday box circled', act: '' } },
        },
      ],
    };
    expect(deviceLine(week, 'm1')).toBe(
      'the week strip, the Wednesday box circled, the third of its seven boxes from the left, its boxes blank, nothing on it',
    );
  });

  test('a device the dream already has is that thing: never a second clock', () => {
    const cast = { ...b, things: [{ id: 'c2', name: 'the wall clock', fields: {} }] } as unknown as Breakdown;
    const known = withKnown(reading, cast);
    expect(known.devices[0]).toMatchObject({ id: 'c2', known: true });
    expect(withDeviceThings(cast, known).things.filter((t) => /clock/.test(t.name))).toHaveLength(1);
  });
});

describe('what the second look at the reading found', () => {
  test('a card in the dreamer’s own hands, through their own eyes', () => {
    const eyes = {
      ...b,
      scenes: [
        {
          ...b.scenes[0],
          moments: b.scenes[0].moments.map((m) => (m.id === 'm3' ? { ...m, eyes: 'dreamer', visible: ['p1'] } : m)),
        },
      ],
    } as Breakdown;
    const { reading } = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: 'the appointment card',
            look: 'a small white card',
            where: 'held',
            by: 'p2',
            moments: { m3: { beat: 'the 2-3pm appointment', shows: 'held up before their eyes', act: '' } },
          },
        ],
      }),
      eyes,
      text,
    );
    expect(reading.devices.map((d) => d.name)).toEqual(['the appointment card']);
  });

  test('a month only where the dream means one; never a word spelled like it', () => {
    expect(letteringOf({ text: 'MAY', on: 'it' }, 'She said she may come.')).toBeUndefined();
    expect(letteringOf({ text: 'MAR', on: 'it' }, 'The soldiers march past.')).toBeUndefined();
    expect(letteringOf({ text: 'JUNE', on: 'it' }, 'June smiled at me.')).toBeUndefined();
    expect(letteringOf({ text: 'MAY', on: 'it' }, 'It was early in May.')).toBeDefined();
    expect(letteringOf({ text: 'JUNE 3', on: 'it' }, 'June 3 was the day.')).toBeUndefined();
  });

  test('only a clock or a calendar is the dream’s own; a card or a strip it has is another', () => {
    const own = {
      ...b,
      things: [
        { id: 'c1', name: 'a birthday card', fields: {} },
        { id: 'c2', name: 'a strip of paper', fields: {} },
        { id: 'c3', name: 'the wall clock', fields: {} },
      ],
    } as unknown as Breakdown;
    const strip: DevicesReading = {
      devices: [
        { ...reading.devices[1] },
        {
          id: 'v5',
          name: 'the week strip',
          look: 'boxes',
          where: 'wall',
          by: null,
          moments: { m1: { beat: 'b', shows: 's', act: '' } },
        },
        { ...reading.devices[0] },
      ],
    };
    expect(withKnown(strip, own).devices.map((d) => [d.id, d.name])).toEqual([
      ['v2', 'the appointment card'],
      ['v5', 'the week strip'],
      ['c3', 'the wall clock'],
    ]);
  });

  test('what is no writing kept whole; a beat that is only someone’s name, or a show with nothing in it, refused', () => {
    const { reading: r, dropped } = parseDevices(
      JSON.stringify({
        devices: [
          {
            name: 'the plate of food',
            look: 'a white plate with peas and rice, a blue rim',
            where: 'table',
            by: 'p1',
            moments: {
              m5: {
                beat: 'if she has eaten',
                shows: 'untouched with a fork beside it',
                act: 'grandmother pointing at it and smiling',
              },
            },
          },
          {
            name: 'the kettle',
            look: 'steel',
            where: 'table',
            by: null,
            moments: { m10: { beat: 'Grandmother tells', shows: 'x', act: '' } },
          },
          {
            name: 'the teapot',
            look: 'blue',
            where: 'table',
            by: null,
            moments: { m3: { beat: 'the dreamer', shows: 'steaming', act: '' } },
          },
        ],
      }),
      b,
      text,
    );
    expect(r.devices).toHaveLength(1);
    expect(r.devices[0]).toMatchObject({
      look: 'a white plate with peas and rice, a blue rim',
      moments: { m5: { shows: 'untouched with a fork beside it', act: 'grandmother pointing at it and smiling' } },
    });
    expect(dropped.some((x) => x.includes('"the dreamer" not its moment'))).toBe(true);
  });

  test('a week however spaced, its lines M to S, the day it shows first by its place', () => {
    const week: DevicesReading = {
      devices: [
        {
          id: 'v5',
          name: 'the week strip',
          look: 'seven boxes',
          where: 'wall',
          by: 'p1',
          lettering: { text: 'M, T, W, T, F, S, S', on: 'its boxes' },
          moments: { m1: { beat: 'b', shows: 'the Friday and the Wednesday circled', act: '' } },
        },
      ],
    };
    expect(letteringItems(week, 'm1')[0]).toMatchObject({ text: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], device: 'strip' });
    expect(deviceLine(week, 'm1')).toContain('the fifth of its seven boxes from the left');
  });
});

describe('the place’s own clock or calendar', () => {
  test('is the one the device shows by: its spot, never a second beside it; someone in the moment to place it by', () => {
    const own: Blocking = {
      ...kitchen,
      spots: [
        { id: 'p1', x: 0.6, y: 1.8, kind: 'person', pose: 'standing' },
        { id: 'x4', x: 0.05, y: 1.8, kind: 'thing', size: [0.4, 0.02, 0.6], fixture: true, name: 'the wall calendar' },
      ],
    };
    const cal: DevicesReading = {
      devices: [
        {
          id: 'v1',
          name: 'the wall calendar',
          look: 'a week',
          where: 'wall',
          by: null,
          moments: { m10: { beat: 'b', shows: 's', act: '' } },
        },
      ],
    };
    const spots = withDevices(own, cal, { id: 'm10', action: '' }, 'p2').spots;
    expect(spots.filter((s) => /calendar/.test(s.name ?? '')).map((s) => [s.id, s.x, s.y])).toEqual([
      ['v1', 0.05, 1.8],
    ]);
  });
});
