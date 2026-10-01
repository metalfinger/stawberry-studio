// A sketch's words (sheets.ts sheetPrompt), from the first new dream through the merged flow ("The Barley Degree",
// DreamBank Dorothea #272, 1 Oct). With the one builder's steps:
// - `sketch_who`: who someone is is said on their sketch, their age or not. "a woman" without an age was dropped,
//   and G.H. was sketched a young man who looked like the dreamer.
// - `sketch_style`: a sketch takes the style's way of drawing, never its directions about people. "Background people
//   softly blurred" put a crowd in every sketch.
// - `place_alone`: a place's sketch says what is there, the place alone and empty; "with no people in it" drew people.
// A step before them, or the builder off, writes every sketch as before.
import { describe, expect, test } from 'bun:test';
import { type Item, sheetPrompt, styleBlock } from '../sheets';

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

const style = {
  id: 'b',
  name: 'a watercolour painting',
  line: 'soft',
  tokens: [
    'loose watercolour washes',
    'shallow depth of field, background people softly blurred',
    'paper texture showing through',
  ],
  palette_hex: ['#6F7F8F', '#C8B89A', '#3A4A5A'],
  lighting_rules: '',
  dream: 'edges a little too soft to hold; faces in the crowd half-remembered',
};

const gh: Item = {
  id: 'p2',
  kind: 'character',
  name: 'G.H.',
  fields: {
    identity: { value: 'a woman who leads the meeting', said: true },
    appearance: { value: 'short grey hair, a calm face', said: false },
    wardrobe: { value: 'a dark wool dress', said: false },
  },
  status: 'waiting',
  version: 0,
};

const room: Item = {
  id: 'l1',
  kind: 'location',
  name: 'the meeting room',
  fields: {
    geography: { value: 'a plain church hall with rows of wooden chairs', said: true },
    landmarks: { value: 'a small stage at the front', said: false },
    light: { value: 'afternoon light through tall windows', said: false },
  },
  status: 'waiting',
  version: 0,
};

describe('who someone is, on their sketch', () => {
  test('said with the step, their age or not; as before without it', () => {
    expect(withBuilder('sketch_who', () => sheetPrompt(gh, style))).toMatch(/G\.H\., a woman\b/);
    expect(withBuilder('fresh_send', () => sheetPrompt(gh, style))).not.toMatch(/\bwoman\b/);
    expect(withBuilder(undefined, () => sheetPrompt(gh, style))).not.toMatch(/\bwoman\b/);
  });

  test('never what they do in the story, and never twice where their look says it already', () => {
    const p = withBuilder('sketch_who', () => sheetPrompt(gh, style));
    expect(p).not.toContain('leads the meeting');
    const said = {
      ...gh,
      fields: { ...gh.fields, appearance: { value: 'a woman with short grey hair', said: true } },
    };
    expect(withBuilder('sketch_who', () => sheetPrompt(said, style)).match(/\bwoman\b/g)).toHaveLength(1);
  });

  test('the words that say who they are decide it, never "the" or "who": a name saying them all is enough', () => {
    const friend = {
      ...gh,
      name: "the dreamer's friend",
      fields: { ...gh.fields, identity: { value: "the dreamer's friend", said: true } },
    };
    expect(withBuilder('sketch_who', () => sheetPrompt(friend, style))).not.toMatch(/friend, the dreamer's friend/);
  });

  test("who they are, never a look of theirs: a guessed age, hair or build never says against the dreamer's words", () => {
    // The father told "in his forties, short brown hair", guessed "a man in his sixties with short grey hair".
    const father = {
      ...gh,
      name: 'the father',
      fields: {
        identity: { value: 'a man in his sixties with short grey hair and a medium build', said: false },
        appearance: { value: 'in his forties, short brown hair', said: true },
      },
    };
    const p = withBuilder('sketch_who', () => sheetPrompt(father, style));
    expect(p).toContain('picture of the father, a man, one person only');
    expect(p).not.toMatch(/sixties|grey hair|medium build/);
  });

  test('only who they are: never where they are, what the story says of them, or how the sketch is drawn', () => {
    const as = (identity: string, appearance: string, name = 'X') =>
      withBuilder('sketch_who', () =>
        sheetPrompt(
          {
            ...gh,
            name,
            fields: { identity: { value: identity, said: true }, appearance: { value: appearance, said: true } },
          },
          style,
        ),
      ).split('\n')[0];
    // From every saved dream's sketches (1 Oct).
    expect(as('a fish stall vendor, shown alone and in full, in soft watercolour', 'a lined face')).toContain(
      'picture of X, a fish stall vendor, one person only',
    );
    expect(as("the dreamer's grandfather, gone for years", 'grey hair')).toContain(
      "picture of X, the dreamer's grandfather, one person only",
    );
    expect(as('a woman in the tiny room', 'blonde hair in a pageboy')).toContain(
      'picture of X, a woman, one person only',
    );
    // An age their look gives is theirs to say, and the words left read whole: never "an man" or "a ten-year- boy".
    expect(as('an old man, a fish stall vendor', 'an elderly man about 70 years old')).toContain(
      'picture of X, one person only',
    );
    expect(as('an old woman on the bus', 'in her seventies, white hair')).toContain(
      'picture of X, a woman, one person only',
    );
    expect(as('a ten-year-old boy', 'in his first school uniform, aged 10')).toContain(
      'picture of X, a boy, one person only',
    );
    // Named "your aunt", said "the dreamer's aunt": never "the dreamer's aunt, the dreamer's aunt".
    expect(as("the dreamer's aunt", 'short brown hair', 'your aunt')).not.toMatch(
      /the dreamer's aunt, the dreamer's aunt/,
    );
  });

  test('an age said as before, once, with the step', () => {
    const old = { ...gh, fields: { ...gh.fields, identity: { value: 'an old woman', said: true } } };
    for (const v of ['sketch_who', undefined])
      expect(withBuilder(v, () => sheetPrompt(old, style)).match(/an old woman/g)).toHaveLength(1);
  });
});

describe("the style's way of drawing on a sketch, without its directions about people", () => {
  test('a sketch of someone or somewhere: no crowd, no faces in it; its technique otherwise whole', () => {
    for (const item of [gh, room]) {
      const p = withBuilder('sketch_style', () => sheetPrompt(item, style));
      expect(p).not.toMatch(/background people|faces in the crowd/);
      expect(p).toContain('loose watercolour washes');
      expect(p).toContain('paper texture showing through');
      // Only the direction about people goes: the depth of field said with it in one technique stays.
      expect(p).toContain('shallow depth of field');
      expect(p).toContain('edges a little too soft to hold');
      expect(withBuilder(undefined, () => sheetPrompt(item, style))).toContain('background people softly blurred');
    }
  });

  test('a feel said in one part keeps what is not about people; the generic feel only where nothing is left', () => {
    const one = { ...style, dream: 'an airless dream, faces in the crowd blurring past' };
    const p = withBuilder('sketch_style', () => sheetPrompt(gh, one));
    expect(p).toContain('It feels like a dream, in every picture: an airless dream.');
    const all = { ...style, dream: 'faces in the crowd blurring past' };
    expect(withBuilder('sketch_style', () => sheetPrompt(gh, all))).not.toContain('faces in the crowd');
  });

  test('a crowded place is the place, not its people: "crowded" stays', () => {
    const busy = { ...style, dream: 'a crowded, airless room' };
    expect(withBuilder('sketch_style', () => sheetPrompt(room, busy))).toContain('a crowded, airless room');
  });

  test('a moment keeps the whole style', () => {
    const moment = withBuilder('sketch_style', () => styleBlock(style));
    expect(moment).toContain('background people softly blurred');
    expect(moment).toContain('faces in the crowd half-remembered');
  });
});

describe('a place, on its own sketch', () => {
  test('the place alone and empty, said as what is there; as before without the step', () => {
    const p = withBuilder('place_alone', () => sheetPrompt(room, style));
    expect(p).not.toMatch(/\bno people\b/);
    expect(p).toMatch(/the place alone, empty/);
    expect(withBuilder(undefined, () => sheetPrompt(room, style))).toContain('with no people in it');
  });
});
