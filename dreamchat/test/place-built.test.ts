// A place's sketch is told by how it is built, never by what people do there (the one builder's `place_built` step):
// "the family meeting", "a room where the family gathers around a table", came out full of people in 4 of 4 takes, the
// place alone and empty all the same (the merged flow's Grandmother on Wednesdays, 2 Oct).
import { describe, expect, test } from 'bun:test';
import { builtAsk, parseBuilt, withBuilt } from '../built';
import { loadDream } from '../evals/saved';
import type { StyleOption } from '../producer';
import { type Item, sheetPrompt } from '../sheets';

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

const meeting: Item = {
  id: 'l1',
  kind: 'location',
  name: 'the family meeting',
  fields: {
    geography: { value: 'a room where the family gathers around a table', said: false },
    landmarks: { value: 'a table covered in schedules and calendars; a wall calendar', said: false },
    light: { value: 'warm afternoon light from one window', said: false },
  },
  status: 'waiting',
  version: 0,
} as Item;
const grandmother = { id: 'p1', kind: 'character', name: 'grandmother', fields: {}, status: 'waiting', version: 0 };
const items = [meeting, grandmother as Item];
// A saved dream's chosen look: any look will do, the place's own words are what is read.
const style = loadDream('dream-0926-043003-b0cb', false).session.style as StyleOption;
const answer = JSON.stringify({
  l1: {
    name: 'a living room with a long wooden table',
    kind: 'a living room with a wooden floor and one window',
    in: 'a long wooden table covered in schedules and calendars, six chairs pushed in around it; a wall calendar; the floor around the table clear',
  },
  p1: { name: 'not a place', kind: 'a person', in: 'nothing' },
});

describe('the reading', () => {
  test('is asked of the places only, each with its own words; never where there is none', () => {
    const m = builtAsk(items, 'Grandmother runs the family on Wednesdays')!;
    expect(m[1].content).toContain('- l1: the family meeting; what kind of place: a room where the family gathers');
    expect(m[1].content).not.toContain('p1');
    expect(builtAsk([grandmother as Item])).toBeNull();
  });

  test('keeps a place told by its build; never another kind of sketch, a part left empty, or who is absent', () => {
    expect(Object.keys(parseBuilt(answer, items))).toEqual(['l1']);
    expect(parseBuilt('```json\n' + answer + '\n```', items).l1?.name).toBe('a living room with a long wooden table');
    const absent = JSON.stringify({
      l1: { name: 'a living room', kind: 'a room with no people in it', in: 'a table' },
    });
    expect(parseBuilt(absent, items)).toEqual({});
    expect(parseBuilt(JSON.stringify({ l1: { name: 'a room', kind: '', in: 'a table' } }), items)).toEqual({});
    expect(parseBuilt('not json', items)).toEqual({});
  });

  test('is put on the place it rewrote, nothing else', () => {
    const got = withBuilt(items, parseBuilt(answer, items));
    expect(got[0].built?.name).toBe('a living room with a long wooden table');
    expect(got[1]).toBe(items[1]);
  });
});

describe("the place's sketch", () => {
  const built = withBuilt(items, parseBuilt(answer, items))[0];

  test('with the step, named and described by its build, its light its own; never what people do there', () => {
    const p = withBuilder('on', () => sheetPrompt(built, style));
    expect(p).toContain('A single wide picture of a living room with a long wooden table, as it ordinarily looks');
    expect(p).toContain('what kind of place: a living room with a wooden floor and one window');
    expect(p).toContain("what's in it: a long wooden table covered in schedules and calendars, six chairs pushed in");
    expect(p).toContain('light: warm afternoon light from one window');
    expect(p).not.toMatch(/\bfamily\b|\bgathers\b|\bmeeting\b/);
  });

  test('without it, or with no reading for the place, as before', () => {
    const before = withBuilder('era', () => sheetPrompt(built, style));
    expect(before).toContain('A single wide picture of the family meeting');
    expect(before).toContain('what kind of place: a room where the family gathers around a table');
    expect(withBuilder('on', () => sheetPrompt(meeting, style))).toBe(before);
  });
});
