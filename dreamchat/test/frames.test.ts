import { describe, expect, test } from 'bun:test';
import type { CutPlan } from '../continuity';
import { framePrompt, writingIn } from '../frames';
import { asInstruction } from '../session';
import { type Item, sheetPrompt, styleBlock, toldColours } from '../sheets';

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
        scene: 's1',
        shot: 's1.sh1',
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
    // Every sheet of what is in view goes in, the place's too, after the picture being edited.
    expect(references.map((r) => `${r.role}:${r.media_id}`)).toEqual([
      'base:media-m1',
      'identity:media-p1',
      'location:media-l1',
    ]);
    expect(prompt).toContain('Image 1: EDIT THIS PICTURE. It is picture 1, the same view a moment earlier.');
    expect(prompt).toContain(
      'Image 2: who ana is: their face, hair, build and clothes, exactly, as Image 1 already shows them.',
    );
    expect(prompt).toContain(
      'Image 3: the kitchen: only its materials, colours and objects; where things stand comes from Image 1.',
    );
    // The manifest comes before the scene, and each image says what to take from it.
    expect(prompt.indexOf('The attached images, in order')).toBeLessThan(prompt.indexOf('What happens in this frame'));
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
    expect(prompt).toContain(
      'Image 2: the kitchen: only its materials, colours and objects; where things stand comes from the earlier picture of this place.',
    );
    // An earlier moment says what it shows, so the model knows which picture is which.
    expect(prompt).toContain('Image 3: picture 1 (Ana stands at the counter): the same place from the same side.');
  });
});

describe('what a redraw is told', () => {
  test('a failed fact becomes an instruction the image model can follow', () => {
    expect(asInstruction('Is the aunt in frame?')).toBe('the aunt must be clearly in the frame');
    expect(asInstruction('Is this the tiny room?')).toBe('it must clearly be the tiny room');
    expect(asInstruction('Is ana wearing: a grey coat?')).toBe('ana wears a grey coat');
    expect(asInstruction('Are the hands right?')).toBe('make this true: Are the hands right');
    // The dreamer is "you" to the person, never to a picture.
    expect(asInstruction('Is you in frame?')).toBe('the dreamer must be clearly in the frame');
    expect(asInstruction('Is you wearing: jeans?')).toBe('the dreamer wears jeans');
  });
});

describe('a sketch drawn again', () => {
  test('carries what the judge found as corrections', () => {
    const woman: Item = {
      id: 'p1',
      kind: 'character',
      name: 'the young woman',
      fields: { appearance: { value: 'brown hair in a ponytail', said: true } },
      status: 'drawing',
      version: 2,
      repairFor: ['only the young woman is in the picture: no other person, creature or object beside them'],
    };
    expect(sheetPrompt(woman, style)).toContain(
      'The last attempt at this sheet got these wrong. Put each right:\n- only the young woman is in the picture',
    );
    // And a style's description line never reaches a picture: only its name and technique.
    expect(styleBlock({ ...style, line: 'precise details on the horse head' })).not.toContain('horse');
  });
});

describe('the dreamer in the words of a moment', () => {
  test('"you" seen from outside is said to be the dreamer, with no viewer in the picture', () => {
    const outside: Item = {
      id: 'm3',
      kind: 'cut',
      name: 'm3',
      fields: { action: { value: 'She stands before you.', said: true } },
      status: 'waiting',
      version: 0,
      frame: { visible: [], things: [], place: 'l1', distance: 'medium', eyes: 'outside', key: false, order: 3 },
    };
    expect(framePrompt(outside, [], style).prompt).toContain('"You" in these words is the dreamer');
    const seen = { ...outside, frame: { ...outside.frame!, eyes: 'dreamer' as const } };
    expect(framePrompt(seen, [], style).prompt).not.toContain('"You" in these words is the dreamer');
  });
});
