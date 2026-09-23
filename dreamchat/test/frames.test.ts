import { describe, expect, test } from 'bun:test';
import { framePrompt, writingIn } from '../frames';
import type { Item } from '../sheets';

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
    expect(prompt).toContain('The only writing anywhere in the picture is "ZIKERY", spelled Z-I-K-E-R-Y');
  });

  test('a moment without quoted writing forbids all writing', () => {
    const { prompt } = framePrompt(frame('The boat reaches the round window.'), [], style);
    expect(prompt).toContain('Do not write any words');
  });

  test('an apostrophe in a word is not a quotation', () => {
    expect(writingIn("the dreamer's kitchen, where the board's slats hang")).toEqual([]);
  });
});
