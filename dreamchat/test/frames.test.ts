import { describe, expect, test } from 'bun:test';
import type { CutPlan } from '../continuity';
import { framePrompt, writingIn } from '../frames';
import { type Item, styleBlock, toldColours } from '../sheets';

const style = {
  id: 'd',
  name: 'ink',
  line: 'quiet',
  tokens: ['one loaded brush'],
  palette_hex: ['#111111'],
  lighting_rules: '',
};

const frame = (action: string): Item => ({
  id: 'm1',
  kind: 'cut',
  name: 'the board',
  fields: { action: { value: action, said: true } },
  status: 'waiting',
  version: 0,
  frame: { visible: [], things: [], place: 'l1', distance: 'close', eyes: 'dreamer', key: true, order: 1 },
});

describe('writing in the dream', () => {
  test('quoted words are the only writing, spelled out', () => {
    expect(writingIn("one slat reads 'zikery', the rest blank")).toEqual(['zikery']);
    const { prompt } = framePrompt(frame("One slat of the board reads 'zikery'."), [], style);
    expect(prompt).toContain('The only writing anywhere in the picture is "ZIKERY" (6 letters: Z I K E R Y)');
  });

  test('a moment without quoted writing forbids all writing', () => {
    const { prompt } = framePrompt(frame('The boat reaches the round window.'), [], style);
    expect(prompt).toContain('Do not write any words');
  });

  test('an apostrophe in a word is not a quotation', () => {
    expect(writingIn("the dreamer's kitchen, where the board's slats hang")).toEqual([]);
  });
});

describe('colours the dream gives', () => {
  test("a colour they said keeps it, whatever the chosen look's palette", () => {
    const balloons: Item = {
      id: 't3',
      kind: 'prop',
      name: 'the string of blue balloons',
      fields: {
        appearance: { value: 'a string of blue balloons, tied together', said: true },
        materials: { value: 'thin red rubber', said: false },
      },
      status: 'waiting',
      version: 0,
    };
    expect(toldColours(balloons)).toEqual(['blue balloons']);
    const muted = { ...style, palette_hex: ['#8a8a8a'] };
    expect(styleBlock(muted, toldColours(balloons))).toContain(
      'except what the dream itself gives a colour, which keeps it exactly: blue balloons',
    );
    expect(styleBlock(muted)).toContain('Colours, and no others: ');
  });
});

describe('a moment drawn from earlier moments', () => {
  const sheet = (id: string, kind: Item['kind'], name: string): Item => ({
    id,
    kind,
    name,
    fields: {},
    status: 'ready',
    version: 1,
    mediaId: `media-${id}`,
    nodeId: `node-${id}`,
    review: 'approved',
  });
  const kitchen = sheet('l1', 'location', 'the kitchen');
  const ana = sheet('p1', 'character', 'ana');
  const drawn = (id: string, order: number): Item => ({
    ...moment(id, order),
    status: 'ready',
    mediaId: `media-${id}`,
    review: 'approved',
  });
  const moment = (id: string, order: number, refs: CutPlan['refs'] = []): Item => ({
    id,
    kind: 'cut',
    name: id,
    fields: { action: { value: 'Ana stands at the counter.', said: true } },
    status: 'waiting',
    version: 0,
    frame: {
      visible: ['p1'],
      things: [],
      place: 'l1',
      distance: 'wide',
      eyes: 'outside',
      key: false,
      order,
      looksAt: 'the counter',
      plan: {
        id,
        order,
        refs,
        states: [],
        sheetLayout: true,
        changes: [],
        needs: refs.map((r) => r.id),
        criteria: [],
        depth: 1,
        transition: '',
        why: '',
      },
    },
  });

  test('the same setup is edited: the earlier moment goes first, as the base, and holds the room', () => {
    const use = {
      id: 'm1',
      kind: 'cut' as const,
      role: 'base' as const,
      relation: 'same_setup' as const,
      carries: 'x',
    };
    const { prompt, references } = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, [
      { use, item: drawn('m1', 1) },
    ]);
    expect(references.map((r) => `${r.role}:${r.media_id}`)).toEqual(['base:media-m1', 'identity:media-p1']);
    expect(prompt).toContain('Image 1 is picture 1, the same view a moment earlier. Edit it into this moment');
    expect(prompt).toContain("Image 2 is ana's reference sheet");
  });

  test("the room from an earlier moment keeps the place's sheet, for its materials only", () => {
    const use = {
      id: 'm1',
      kind: 'cut' as const,
      role: 'composition' as const,
      relation: 'same_side' as const,
      carries: 'x',
    };
    const { prompt, references } = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, [
      { use, item: drawn('m1', 1) },
    ]);
    expect(references.map((r) => r.role)).toEqual(['identity', 'location', 'composition']);
    expect(prompt).toContain("Image 2 is the kitchen's reference sheet: take only its materials, colours and objects");
    expect(prompt).toContain('Image 3 is picture 1: the same place from the same side');
  });
});
