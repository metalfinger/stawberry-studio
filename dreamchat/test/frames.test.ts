import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CutPlan, planContinuity } from '../continuity';
import {
  aNoun,
  buildFrames,
  buildGhosts,
  framePrompt,
  ghostPrompt,
  type PlannedInput,
  withoutGone,
  withoutPose,
  writingIn,
} from '../frames';
import { type Breakdown, completeViews, oneColour, type StyleOption, VAGUE } from '../producer';
import { forPlan, storyRecord } from '../record';
import { asInstruction } from '../session';
import {
  colourName,
  coloursIn,
  DREAM_QUALITY,
  openedLater,
  groupMembers,
  inShades,
  isGroup,
  type Item,
  shapeOf,
  sheetPrompt,
  styleBlock,
  toldColours,
} from '../sheets';

const style = {
  id: 'd',
  name: 'ink',
  line: 'quiet',
  tokens: ['one loaded brush'],
  palette_hex: ['#111111', '#C8553D', '#2A6F97'],
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

describe('an animal in a moment', () => {
  test('is kept as an animal: its kind, size, coat and markings, never a face and clothes', () => {
    // The terrier, kept by "their face, hair, build and clothes", came back another dog (lighthouse m3).
    const dog: Item = {
      id: 'p2',
      kind: 'character',
      name: 'the dog',
      fields: {
        identity: { value: "the dreamer's dog", said: true },
        appearance: { value: 'a small brown terrier with upright ears', said: true },
      },
      status: 'ready',
      version: 1,
      mediaId: 'media-dog',
      review: 'approved',
    };
    const m = {
      ...frame('The dog looks back at the dreamer.'),
      frame: { ...frame('').frame!, visible: ['p2'], eyes: 'outside' as const },
    };
    const { prompt, references } = framePrompt(m, [dog], style);
    expect(prompt).toContain('the dog (animal): a small brown terrier with upright ears.');
    expect(prompt).toContain(
      'what the dog is (a small brown terrier with upright ears): its kind, its size, its build, its coat and its markings, exactly',
    );
    expect(prompt).not.toContain('face, hair, build and clothes');
    expect(references.find((r) => r.media_id === 'media-dog')?.role).toBe('identity');
  });
});

describe('a colour named', () => {
  test('is a grey when it has almost no hue, and neon when it is bright', () => {
    // A black and white film's greys were "sage" and "slate grey"; neon green was "gold" (26 Sep).
    expect(['#999999', '#666666', '#DDDDDD'].map(colourName)).toEqual(['light grey', 'dark grey', 'pale grey']);
    expect(colourName('#7CFC00')).toBe('bright green');
    expect(colourName('#2F3B4C')).toBe('dark slate');
  });
});

describe('what is gone', () => {
  test('is never named to the picture', () => {
    // The sea back on the horizon after it had turned into the field (lighthouse, 26 Sep).
    expect(
      withoutGone(
        'The tractor slows and stops at the edge of the field, where the beach had been, where the sea used to be.',
      ),
    ).toBe('The tractor slows and stops at the edge of the field.');
    expect(withoutGone('The dreamer walks to the window.')).toBe('The dreamer walks to the window.');
  });
});

describe('writing in the dream', () => {
  test('quoted words are the only writing, spelled out', () => {
    expect(writingIn("one slat reads 'zikery', the rest blank")).toEqual(['zikery']);
    const { prompt } = framePrompt(frame("One slat of the board reads 'zikery'."), [], style);
    expect(prompt).toContain('The only writing anywhere in the picture is "ZIKERY" (6 letters: Z I K E R Y)');
  });

  test('a moment without quoted writing forbids all writing', () => {
    const { prompt } = framePrompt(frame('The boat reaches the round window.'), [], style);
    expect(prompt).toContain('Every surface in it is free of writing, logos and brand badges');
  });

  test('an apostrophe in a word is not a quotation', () => {
    expect(writingIn("the dreamer's kitchen, where the board's slats hang")).toEqual([]);
    // Speech is not writing; a sign that says something is.
    expect(writingIn("The dog looks back at the dreamer, ears up, as if to say 'come on'.")).toEqual([]);
    expect(writingIn('the fish said "hello" to me')).toEqual([]);
    expect(writingIn("a sign that says 'EXIT' above the door")).toEqual(['EXIT']);
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
    const muted = { ...style, palette_hex: ['#8a8a8a', '#a08f7a', '#6f7f8f'] };
    expect(styleBlock(muted, toldColours(balloons))).toContain(
      'except what the dream itself gives a colour, which keeps it exactly: blue balloons',
    );
    expect(styleBlock(muted)).toContain('Colours, and no others: ');
    // A moment drawn from its sketches: they fix everyone's colours; the palette rules the rest.
    expect(styleBlock(muted, [], { fromImages: true })).toContain(
      'for the light and everything no image above gives a colour to; each person and thing keeps the colours of its image.',
    );
    expect(styleBlock({ ...muted, medium: 'a photograph' })).toContain('Skin keeps its natural tone.');
    expect(styleBlock(muted)).not.toContain('Skin');
  });

  test('a sketch keeps the colours its own look gives, and the palette rules the rest', () => {
    const sofa: Item = {
      id: 't1',
      kind: 'prop',
      name: 'the blue sofa',
      fields: {
        appearance: { value: 'a two-seater sofa', said: false },
        materials: { value: 'medium blue fabric', said: false },
      },
      status: 'waiting',
      version: 0,
    };
    const colourful = { ...style, palette_hex: ['#8a8a8a', '#a08f7a', '#6f7f8f'] };
    expect(sheetPrompt(sofa, colourful)).toContain(
      'for the light and everything its look above gives no colour to; what the look gives a colour keeps it.',
    );
    expect(sheetPrompt(sofa, colourful)).not.toContain('Colours, and no others');
    // A look with no colour of its own keeps to the palette.
    expect(
      sheetPrompt({ ...sofa, fields: { appearance: { value: 'a two-seater sofa', said: false } } }, colourful),
    ).toContain('Colours, and no others');
  });

  test('in a style made in one colour, a colour a look names is a shade of it', () => {
    const blueInk = {
      ...style,
      medium: 'ink wash on smooth paper',
      palette_hex: ['#001E3C', '#003A70', '#0077B6', '#90E0EF', '#CAF0F8'],
    };
    expect(oneColour(blueInk)).toBe(true);
    for (const fromImages of [true, false])
      expect(styleBlock(blueInk, [], { fromImages })).toContain(
        'it is drawn as a lighter or darker shade of it, never in its own colour.',
      );
    // What the dream itself gives a colour is still that colour.
    expect(styleBlock(blueInk, ['red balloons'], { fromImages: true })).toContain(
      'Only what the dream itself gives a colour keeps it exactly: red balloons.',
    );
    // A photograph in cold light is a grade, and skin keeps its tone; in black and white it does not.
    const coldPhoto = { ...blueInk, medium: 'a photograph' };
    expect(oneColour(coldPhoto)).toBe(false);
    expect(styleBlock(coldPhoto, [], { fromImages: true })).toContain('Skin keeps its natural tone.');
    const blackAndWhite = { ...coldPhoto, palette_hex: ['#111111', '#777777', '#EEEEEE'] };
    expect(oneColour(blackAndWhite)).toBe(true);
    expect(styleBlock(blackAndWhite)).not.toContain('Skin');
    // Colours that span the wheel are not one colour, and the style's own word wins over its palette.
    expect(oneColour({ ...blueInk, palette_hex: ['#0077B6', '#E07A1F'] })).toBe(false);
    expect(oneColour({ ...blueInk, one_colour: false })).toBe(false);
    expect(styleBlock({ ...blueInk, palette_hex: ['#0077B6', '#E07A1F'] })).not.toContain('shades of this one colour');
  });

  test('in one colour, a filled-in look names how dark things are, not their colours', () => {
    const blueInk = { ...style, medium: 'ink wash', palette_hex: ['#001E3C', '#0077B6', '#CAF0F8'] };
    expect(
      inShades('medium brown hair; a light blue blouse, brown trousers, a yellow onesie, a red-brown coat', blueInk),
    ).toBe('dark hair; a light blue blouse, dark trousers, a pale onesie, a dark coat');
    // Black and white: every colour is a tone; black, white and grey already are.
    const bw = { ...blueInk, palette_hex: ['#111111', '#EEEEEE'] };
    expect(inShades('a light blue blouse and short black hair', bw)).toBe('a pale blouse and short black hair');
    // A style in colour keeps them.
    expect(inShades('brown trousers', { ...blueInk, palette_hex: ['#0077B6', '#E07A1F'] })).toBe('brown trousers');
    // What they said keeps its colour; what was filled in is told in shades.
    const said: Item = {
      id: 'p1',
      kind: 'character',
      name: 'ana',
      status: 'ready',
      version: 1,
      mediaId: 'm',
      review: 'approved',
      fields: { appearance: { value: 'red hair', said: true }, wardrobe: { value: 'a brown coat', said: false } },
    };
    expect(
      framePrompt(
        { ...frame('Ana waits.'), frame: { ...frame('x').frame!, visible: ['p1'], eyes: 'outside' } },
        [said],
        blueInk,
      ).prompt,
    ).toContain('ana (person): red hair; a dark coat.');
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
        own: [],
        staging: [],
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

  test('a look that says nothing a sketch can keep is left out', () => {
    const hazy: Item = {
      ...sheet('p1', 'character', 'ana'),
      fields: {
        appearance: { value: 'indistinct, like a figure in a hazy memory', said: false },
        wardrobe: { value: 'faded blue jeans and a plain grey t-shirt', said: false },
        distinctive_features: { value: 'none notable, blends into the dreamscape', said: false },
      },
    };
    const { prompt } = framePrompt(moment('m1', 1), [hazy, kitchen], style);
    expect(prompt).toContain('ana (person): faded blue jeans and a plain grey t-shirt.');
    expect(prompt).not.toMatch(/indistinct|blends into/);
    for (const nothing of ['none remarkable', 'nothing in particular', 'no distinctive features'])
      expect(VAGUE.test(nothing)).toBe(true);
    expect(VAGUE.test('a scar over the left eye')).toBe(false);
  });

  test('someone in a moment is described by their look, never by the story in who they are', () => {
    const cook: Item = {
      ...sheet('p1', 'character', 'the young woman'),
      fields: {
        identity: { value: 'a young woman cooking', said: true },
        appearance: { value: 'shoulder-length blonde hair in a pageboy', said: true },
      },
    };
    const { prompt } = framePrompt(moment('m9', 9), [cook, kitchen], style);
    expect(prompt).toContain('the young woman (person): shoulder-length blonde hair in a pageboy.');
    expect(prompt).not.toContain('cooking');
  });

  test('the people in view are told where they stand, left to right', () => {
    const bo = { ...sheet('p2', 'character', 'you'), isDreamer: true };
    const two = moment('m1', 1);
    two.frame = { ...two.frame!, visible: ['p1', 'p2'], plan: { ...two.frame!.plan!, staging: ['p2', 'p1'] } };
    expect(framePrompt(two, [ana, bo, kitchen], style).prompt).toContain(
      'Where they stand, from left to right: the dreamer, then ana. They keep these sides in every picture of this scene.',
    );
    expect(framePrompt(moment('m1', 1), [ana, kitchen], style).prompt).not.toContain('Where they stand');
  });

  test('an edit names who leaves the picture and who joins it', () => {
    const conductor = sheet('p2', 'character', 'the conductor');
    const use = {
      id: 'm1',
      kind: 'cut' as const,
      role: 'base' as const,
      relation: 'same_setup' as const,
      carries: 'x',
    };
    const before: Item = { ...drawn('m1', 1) };
    before.frame = { ...before.frame!, visible: ['p1', 'p2'] };
    const { prompt } = framePrompt(moment('m2', 2, [use]), [ana, conductor, kitchen], style, [{ use, item: before }]);
    expect(prompt).toContain('who is in it changes: the conductor is no longer there.');
    expect(prompt).not.toContain('everyone in it exactly');
  });

  test('what the judge found invented in the picture being edited is left out of the edit', () => {
    const use = {
      id: 'm1',
      kind: 'cut' as const,
      role: 'base' as const,
      relation: 'same_setup' as const,
      carries: 'x',
    };
    const flawed: Item = {
      ...drawn('m1', 1),
      check: {
        questions: 15,
        passed: 14,
        failed: ['Is everything in this frame declared?'],
        failedIds: ['undeclared'],
        notes: ['a pair of hands reaches in from the bottom corners, as if from a viewer'],
      },
    };
    const { prompt } = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, [{ use, item: flawed }]);
    expect(prompt).toContain(
      'Leave out what it shows that is not in the dream: a pair of hands reaches in from the bottom corners, as if from a viewer.',
    );
    const { prompt: clean } = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, [
      { use, item: drawn('m1', 1) },
    ]);
    expect(clean).not.toContain('Leave out what it shows');
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
    // By who and where it is, never by what happens in it: its action would be drawn again.
    expect(prompt).toContain('Image 3: picture 1 (ana, at the kitchen): the same place from the same side.');
  });

  test('no picture goes in for its light alone: the place gives its light, and words say it', () => {
    const use = {
      id: 'm1',
      kind: 'cut' as const,
      role: 'lighting' as const,
      relation: 'other_side' as const,
      carries: 'x',
    };
    const inputs = [{ use, item: drawn('m1', 1) }];
    const lit = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, inputs);
    // Everyone has their sketch: the picture from the other side is not attached at all.
    expect(lit.references.map((r) => r.role)).toEqual(['identity', 'location']);
    expect(lit.prompt).toContain(
      'the kitchen: the camera stands in this place. Keep everything in it where it puts it',
    );
    expect(lit.prompt).toContain('and its light; do not mirror or rearrange it.');
    // Someone in it with no sketch of their own: it goes in, as who they are.
    const unsketched = framePrompt(moment('m2', 2, [use]), [{ ...ana, review: undefined }, kitchen], style, inputs);
    expect(unsketched.references.map((r) => r.role)).toEqual(['location', 'identity']);
    expect(unsketched.prompt).toContain(
      'Image 2: picture 1 (ana, at the kitchen): who ana is, as last drawn: their face, hair, build and clothes, exactly.',
    );
    expect(unsketched.prompt).not.toContain('Ana stands at the counter)');
  });

  test('in a style made in one colour, each image says to draw its person in the picture’s shades', () => {
    const blueInk = { ...style, medium: 'ink wash', palette_hex: ['#001E3C', '#0077B6', '#CAF0F8'] };
    expect(framePrompt(moment('m1', 1), [ana, kitchen], blueInk).prompt).toContain(
      "Image 1: who ana is: their face, hair, build and clothes, exactly, drawn in this picture's shades of one colour.",
    );
    expect(framePrompt(moment('m1', 1), [ana, kitchen], style).prompt).not.toContain('shades of one colour');
  });

  test('one image says who someone is: their sketch, or the picture they were last seen in', () => {
    const use = {
      id: 'm1',
      kind: 'cut' as const,
      role: 'identity' as const,
      relation: 'other_place' as const,
      carries: 'who ana is, as last drawn, when their sketch is not there',
      who: ['p1'],
    };
    const inputs = [{ use, item: drawn('m1', 1) }];
    // With her sketch, only the sketch: a second face image for one person pulls the model off her.
    const sketched = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, inputs);
    expect(sketched.references.map((r) => r.role)).toEqual(['identity', 'location']);
    // Without it, the picture she was last seen in says who she is.
    const unsketched = framePrompt(moment('m2', 2, [use]), [{ ...ana, review: undefined }, kitchen], style, inputs);
    expect(unsketched.references.map((r) => r.role)).toEqual(['location', 'identity']);
    expect(unsketched.prompt).toContain(
      'Image 2: picture 1 (ana, at the kitchen): who ana is, as last drawn: their face, hair, build and clothes, exactly. Nothing else from it: not its pose, background or framing.',
    );
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
    expect(asInstruction("Is the young woman's head an irregular block of ice?")).toBe(
      "the young woman's head is an irregular block of ice",
    );
    expect(
      asInstruction('Is everything in this frame declared? The cut names the room. Is there no other person?'),
    ).toBe(
      'nothing is in the picture that the dream does not have: no other person, face, hand, limb, creature or tool',
    );
    // The palette by name, never as codes, and the style, light and action as what is so.
    expect(
      asInstruction(
        "Are the image's values confined to this palette, with no colour outside it: #001E3C, #0077B6, #CAF0F8?",
      ),
    ).toBe('every colour in it, hair, skin and clothes included, is one of dark navy, blue, pale blue');
    expect(asInstruction('Does the image actually show this: soft bleeding edges?')).toBe(
      'the picture shows soft bleeding edges',
    );
    expect(asInstruction('Does the frame show this happening: The family sits on the roof.?')).toBe(
      'the frame shows this happening: The family sits on the roof.',
    );
  });
});

describe("a person's sketch", () => {
  const father: Item = {
    id: 'p2',
    kind: 'character',
    name: 'the father',
    fields: {
      identity: { value: 'a man in his sixties with short grey hair and a medium build', said: false },
      appearance: {
        value:
          'standing in a relaxed three-quarter view, whole figure from head to feet, face clearly visible, with a calm expression, looking slightly downward',
        said: true,
      },
      wardrobe: { value: 'plain pale grey long-sleeved shirt', said: false },
    },
    status: 'waiting',
    version: 0,
  };

  test('says their age from who they are when their look does not, and never a pose as their look', () => {
    // Held for "missing roughly how old they are; their build; their hair" (lighthouse, 26 Sep).
    const p = sheetPrompt(father, style);
    expect(p).toContain(
      'A single full-length picture of the father, a man in his sixties with short grey hair and a medium build, one person only',
    );
    expect(p).not.toContain('looks: standing');
    expect(p).not.toContain('looking slightly downward');
  });

  test('keeps to their look when it says their age, and never names who they are in the story', () => {
    const told = {
      ...father,
      fields: { ...father.fields, appearance: { value: 'in his forties, short brown hair', said: true } },
    };
    expect(sheetPrompt(told, style)).toContain('A single full-length picture of the father, one person only');
    const cooking = {
      ...father,
      name: 'the cook',
      fields: { identity: { value: 'a young woman cooking', said: true } },
    };
    expect(sheetPrompt(cooking, style)).toContain('picture of the cook, a young woman, one person only');
    const named = { ...father, name: 'the young woman', fields: { identity: { value: 'a young woman', said: true } } };
    expect(sheetPrompt(named, style)).toContain('picture of the young woman, one person only');
  });
});

describe('a sketch of many things that carry writing', () => {
  test('lies as they do, its writing unreadable marks, and says its colours whole', () => {
    // "The letters", hundreds of them, handwritten: held as at odds with itself (snow train, 26 Sep).
    const letters: Item = {
      id: 't2',
      kind: 'prop',
      name: 'the letters',
      fields: {
        appearance: {
          value:
            'hundreds of envelopes stacked loosely in a messy pile; each has handwritten dark ink in blue or black on its front',
          said: true,
        },
      },
      status: 'waiting',
      version: 0,
    };
    const p = sheetPrompt(letters, style);
    expect(p).toContain('A single clear picture of the letters, all of them together, as they ordinarily lie');
    expect(p).toContain('drawn as marks no one could read');
    expect(p).not.toContain('Do not write any words, letters');
    expect(coloursIn('handwritten dark ink in blue or black on its front')).toEqual(['blue or black']);
    expect(coloursIn('a red cardigan over blue jeans')).toEqual(['red cardigan', 'blue jeans']);
    // A bracket ends what a colour colours: the cardigan was given three colours at once (26 Sep).
    expect(coloursIn('a cardigan (red, knitted) over a grey dress (worn)')).toEqual(['red', 'grey dress']);
    expect(
      sheetPrompt(
        { ...letters, name: 'the suitcase', fields: { appearance: { value: 'brown leather', said: true } } },
        style,
      ),
    ).toContain('the suitcase on its own');
  });
});

describe("a place's sketch", () => {
  test('keeps shut what a later moment opens', () => {
    // The red door, drawn ajar in the field's sketch, stood open before it was opened (snow train).
    const field: Item = {
      id: 'l2',
      kind: 'location',
      name: 'the snowy field',
      fields: { landmarks: { value: 'a red door standing on its own in its frame', said: true } },
      status: 'waiting',
      version: 0,
    };
    const shut = openedLater(field, [
      'The grandfather nods at the door.',
      'The dreamer opens the red door; warm light.',
    ]);
    expect(shut).toEqual(['the red door']);
    expect(sheetPrompt({ ...field, shut }, style)).toContain('The red door is shut, as before anyone opens it.');
    expect(openedLater(field, ['She opens the window.'])).toEqual([]);
  });
});

describe('a group of people', () => {
  test('is sketched together, never as one person', () => {
    const person = (name: string, appearance: string): Item => ({
      id: 'p5',
      kind: 'character',
      name,
      fields: { appearance: { value: appearance, said: true } },
      status: 'waiting',
      version: 0,
    });
    const couple = person('a couple of people', 'one man and one woman');
    expect(isGroup(couple)).toBe(true);
    expect(sheetPrompt(couple, style)).toContain('all of them together and no one else');
    expect(sheetPrompt(couple, style)).not.toContain('one person only');
    expect(isGroup(person('the old men', 'two old men in caps'))).toBe(true);
    expect(isGroup(person('the girl', 'a girl with two braids'))).toBe(false);
    expect(isGroup(person('the family', ''))).toBe(true);
    expect(isGroup(person('a family friend', 'a tall man'))).toBe(false);
    expect(sheetPrompt(person('your aunt', 'shoulder-length brown hair'), style)).toContain('one person only');
  });

  test('an animal is sketched as an animal: never one person only, never its clothes', () => {
    const dog: Item = {
      id: 'p2',
      kind: 'character',
      name: 'the dog',
      fields: {
        identity: { value: 'a small brown terrier', said: true },
        appearance: { value: 'small, wiry, alert', said: false },
        wardrobe: { value: 'no clothing, natural brown wiry coat', said: false },
      },
      status: 'waiting',
      version: 0,
    };
    const prompt = sheetPrompt(dog, style);
    expect(prompt).toStartWith('A single picture of the dog, the one animal only');
    expect(prompt).not.toContain('one person only');
    expect(prompt).toContain('coat: natural brown wiry coat');
    expect(prompt).not.toContain('wears:');
    expect(
      sheetPrompt({ ...dog, name: 'the aunt', fields: { identity: { value: 'my aunt', said: true } } }, style),
    ).toContain('one person only');
    // What they are, not what is said of them (night market, 26 Sep).
    const seller = {
      ...dog,
      name: 'the old man',
      fields: { identity: { value: 'an old man selling fish at a stall', said: true } },
    };
    expect(sheetPrompt(seller, style)).toContain('one person only');
  });

  test('a look listed in a moment keeps no pose or framing from its sketch', () => {
    // "standing … face clearly visible" in the father's look, in a moment of him sitting, read as the
    // prompt at odds with itself (0.89, lighthouse, 26 Sep).
    expect(
      withoutPose(
        'standing in a relaxed three-quarter view, whole figure from head to feet, face clearly visible, with a calm expression; a man in his 60s with grey hair',
      ),
    ).toBe('a man in his 60s with grey hair');
    expect(withoutPose('a tall grey heron standing in a relaxed pose, whole body visible from beak to tail')).toBe(
      'a tall grey heron',
    );
    expect(withoutPose('curly brown hair, thin build')).toBe('curly brown hair, thin build');
  });

  test('what something turned into is named as what it is now', () => {
    expect(aNoun('transformed into a grey heron')).toBe('a grey heron');
    expect(aNoun('becomes owl')).toBe('an owl');
    expect(aNoun('roller coaster')).toBe('a roller coaster');
  });

  test("a place is sketched without the story's things, which have pictures of their own", () => {
    const field: Item = {
      id: 'l3',
      kind: 'location',
      name: 'the field of tall yellow grass',
      fields: {
        geography: { value: 'a vast flat field of tall yellow grass', said: false },
        landmarks: { value: 'a small paper boat lying in the grass and a red tractor parked at the edge', said: false },
      },
      status: 'waiting',
      version: 0,
      leaveOut: ['the paper boat', 'the key'],
    };
    const prompt = sheetPrompt(field, style);
    expect(prompt).toContain("what's in it: a red tractor parked at the edge");
    expect(prompt).not.toMatch(/paper boat lying/);
    expect(prompt).toContain("without the story's things in it (the paper boat, the key)");
  });

  test('a place named for who was there is drawn as the place', () => {
    const place = (name: string): Item => ({
      id: 'l6',
      kind: 'location',
      name,
      fields: { geography: { value: 'a small plain room with two chairs by a round table', said: false } },
      status: 'waiting',
      version: 0,
    });
    expect(sheetPrompt(place('inside, sitting with couple of people'), style)).toStartWith(
      'A single wide picture of this place,',
    );
    expect(sheetPrompt(place("the grandmother's kitchen"), style)).toContain("picture of the grandmother's kitchen");
    expect(sheetPrompt(place('the room with the blue balloons'), style)).toContain(
      'picture of the room with the blue balloons',
    );
  });

  test("the dreamer's sketch says who they are: their name says nothing of it", () => {
    const dreamer = (identity: string): Item => ({
      id: 'p1',
      kind: 'character',
      name: 'you',
      isDreamer: true,
      fields: {
        identity: { value: identity, said: true },
        appearance: { value: 'long dark hair worn loose, slender build', said: false },
      },
      status: 'waiting',
      version: 0,
    });
    // Left out, the gate held it for "missing roughly how old they are" (night bus, 25 Sep).
    expect(sheetPrompt(dreamer('a young adult woman in her early twenties'), style)).toContain(
      'A single full-length picture of the dreamer, a young adult woman in her early twenties, one person only',
    );
    expect(sheetPrompt(dreamer('the dreamer'), style)).toContain('picture of the dreamer, one person only');
  });
});

describe('a group and someone in it who has their own sketch', () => {
  test('are told to be one and the same', () => {
    const family: Item = {
      id: 'p3',
      kind: 'character',
      name: 'the family',
      fields: { wardrobe: { value: 'father in jeans; mother in a sundress; baby in a onesie', said: false } },
      status: 'ready',
      version: 1,
      mediaId: 'media-p3',
      review: 'approved',
    };
    const baby: Item = { ...family, id: 'p4', name: 'the baby', fields: {}, mediaId: 'media-p4' };
    const roof: Item = {
      ...family,
      id: 'l2',
      kind: 'location',
      name: 'the top of the train',
      fields: {},
      mediaId: 'media-l2',
    };
    const moment: Item = {
      id: 'm6',
      kind: 'cut',
      name: 'm6',
      fields: { action: { value: 'A family sits on the train with a thrilled baby.', said: true } },
      status: 'waiting',
      version: 0,
      frame: {
        visible: ['p3', 'p4'],
        things: [],
        place: 'l2',
        distance: 'medium',
        eyes: 'outside',
        key: false,
        order: 6,
      },
    };
    const { prompt } = framePrompt(moment, [family, baby, roof], style);
    expect(prompt).toContain('The baby in it is the baby, drawn from Image 2: one baby, never two.');
    expect(prompt).toContain("They are the baby in the family's picture (Image 1): one and the same");
  });
});

describe('the shape of each picture', () => {
  test('is sent as a setting: a person tall, a group and a place wide, a thing square', () => {
    const base = { fields: {}, status: 'waiting' as const, version: 0 };
    expect(shapeOf({ ...base, id: 'p1', kind: 'character', name: 'the conductor' })).toBe('2:3');
    expect(shapeOf({ ...base, id: 'p2', kind: 'character', name: 'the family', several: true })).toBe('4:3');
    expect(shapeOf({ ...base, id: 'l1', kind: 'location', name: 'the streetcar' })).toBe('16:9');
    expect(shapeOf({ ...base, id: 't1', kind: 'prop', name: 'the lever' })).toBe('1:1');
  });
});

describe('groups, as the producer marks them', () => {
  test('a group needs no group words, and its members are linked by id', () => {
    const band: Item = {
      id: 'p7',
      kind: 'character',
      name: 'the Hendersons',
      fields: {},
      status: 'ready',
      version: 1,
      several: true,
    };
    const lead: Item = {
      id: 'p8',
      kind: 'character',
      name: 'Ruth',
      fields: {},
      status: 'ready',
      version: 1,
      partOf: 'p7',
    };
    expect(isGroup(band)).toBe(true);
    expect(isGroup({ ...band, several: false, name: 'a couple of people' })).toBe(false);
    expect(groupMembers([band, lead]).map((m) => `${m.group.name} > ${m.member.name}`)).toEqual([
      'the Hendersons > Ruth',
    ]);
  });
});

describe('how a picture feels like a dream', () => {
  test("every style carries it, and a moment's own strangeness is drawn as plain fact", () => {
    expect(styleBlock({ ...style, dream: 'light that comes from nowhere' })).toContain(
      'It feels like a dream, in every picture: light that comes from nowhere.',
    );
    expect(styleBlock(style)).toContain(`It feels like a dream, in every picture: ${DREAM_QUALITY}.`);
    const odd = frame('A room larger than the house it is in.');
    odd.fields.dream = { value: 'the room is larger than the house it is in', said: true };
    expect(framePrompt(odd, [], style).prompt).toContain(
      'The dream in it, drawn as plain fact, as solid and ordinary as everything around it: the room is larger than the house it is in.',
    );
    expect(framePrompt(frame('A board.'), [], style).prompt).not.toContain('The dream in it');
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

  test("someone named as the dreamer said them is named for the picture: 'your aunt' is the dreamer's aunt", () => {
    const aunt: Item = {
      id: 'p4',
      kind: 'character',
      name: 'your aunt',
      fields: { wardrobe: { value: 'a blue top', said: true } },
      status: 'ready',
      version: 1,
      mediaId: 'media-p4',
      review: 'approved',
    };
    const street: Item = {
      id: 'l2',
      kind: 'location',
      name: 'outside the house',
      fields: { geography: { value: 'where you wait for your aunt', said: false } },
      status: 'ready',
      version: 1,
      mediaId: 'media-l2',
      review: 'approved',
    };
    const arrives: Item = {
      id: 'm8',
      kind: 'cut',
      name: 'm8',
      fields: { action: { value: 'The convertible pulls up.', said: true } },
      status: 'waiting',
      version: 0,
      frame: { visible: ['p4'], things: [], place: 'l2', distance: 'medium', eyes: 'outside', key: false, order: 8 },
    };
    const { prompt } = framePrompt(arrives, [aunt, street], style);
    expect(prompt).toContain("who the dreamer's aunt is");
    expect(prompt).not.toContain('who your aunt is');
    // "You" left anywhere in what is told, a place's words included, is said to be the dreamer.
    expect(prompt).toContain('"You" in these words is the dreamer');
  });

  test("through the dreamer's own eyes, their face sheet stays out and only their hands may show", () => {
    const dreamer: Item = {
      id: 'p2',
      kind: 'character',
      name: 'you',
      isDreamer: true,
      fields: { wardrobe: { value: 'a grey t-shirt and jeans', said: true } },
      status: 'ready',
      version: 1,
      mediaId: 'media-p2',
      review: 'approved',
    };
    const pov: Item = {
      id: 'm3',
      kind: 'cut',
      name: 'm3',
      fields: { action: { value: 'You step through the window.', said: true } },
      status: 'waiting',
      version: 0,
      frame: { visible: ['p2'], things: [], place: 'l1', distance: 'wide', eyes: 'dreamer', key: true, order: 3 },
    };
    const { prompt, references } = framePrompt(pov, [dreamer], style);
    expect(references.map((r) => r.media_id)).not.toContain('media-p2');
    expect(prompt).not.toContain('who the dreamer is');
    expect(prompt).toContain(
      "The camera is the dreamer's own eyes: the dreamer is not in the picture, except perhaps their own hands, arms or feet, in a grey t-shirt and jeans.",
    );
  });

  test('seen from outside, the dreamer is named as in the picture only when they are in it', () => {
    const dreamer: Item = {
      id: 'p2',
      kind: 'character',
      name: 'you',
      isDreamer: true,
      fields: {},
      status: 'ready',
      version: 1,
    };
    const without: Item = {
      id: 'm5',
      kind: 'cut',
      name: 'm5',
      fields: { action: { value: 'The ice becomes a horse.', said: true } },
      status: 'waiting',
      version: 0,
      frame: { visible: [], things: [], place: 'l1', distance: 'close', eyes: 'outside', key: true, order: 5 },
    };
    expect(framePrompt(without, [dreamer], style).prompt).not.toContain('the dreamer seen from outside');
    const withThem = { ...without, frame: { ...without.frame!, visible: ['p2'] } };
    expect(framePrompt(withThem, [dreamer], style).prompt).toContain('the dreamer seen from outside');
  });
});

describe('a change that replaces part of someone', () => {
  test('their sheet gives the rest of them, never the part that changed', () => {
    const woman: Item = {
      id: 'p1',
      kind: 'character',
      name: 'the young woman',
      fields: {},
      status: 'ready',
      version: 1,
      mediaId: 'media-p1',
      review: 'approved',
    };
    const moment: Item = {
      id: 'm4',
      kind: 'cut',
      name: 'm4',
      fields: { action: { value: 'The ice begins to melt.', said: true } },
      status: 'waiting',
      version: 0,
      frame: {
        visible: ['p1'],
        things: [],
        place: 'l1',
        distance: 'close',
        eyes: 'outside',
        key: false,
        order: 4,
        plan: {
          id: 'm4',
          order: 4,
          scene: 's1',
          shot: 's1.sh4',
          refs: [],
          own: [],
          staging: [],
          states: [{ who: 'p1', what: 'head', now: 'a block of ice', since: 'm3' }],
          sheetLayout: true,
          changes: [],
          needs: [],
          criteria: [],
          depth: 1,
          transition: '',
          why: '',
        },
      },
    };
    const { prompt } = framePrompt(moment, [woman], style);
    expect(prompt).toContain('who the young woman is: their build and clothes, exactly.');
    expect(prompt).toContain('Except their head, which is no longer theirs: it is now a block of ice');

    // The moment that changes it again: the sheet gives way to the new look, and the look it
    // replaces is not "still so".
    const plan = moment.frame!.plan!;
    const horse: Item = {
      ...moment,
      id: 'm5',
      fields: { action: { value: "The ice becomes a horse's head.", said: true } },
      frame: {
        ...moment.frame!,
        order: 5,
        plan: {
          ...plan,
          id: 'm5',
          order: 5,
          own: [{ who: 'p1', what: 'head', now: "a horse's head of ice", since: 'm5' }],
          staging: [],
          states: [],
        },
      },
    };
    const next = framePrompt(horse, [woman], style).prompt;
    expect(next).toContain("Except their head, which is no longer theirs: it is now a horse's head of ice");
    expect(next).not.toContain('Still so from earlier');
    expect(next).not.toContain('a block of ice');
  });
});

describe('an in-between picture of one change', () => {
  const ghostOf = (id: string, of: string, what: string, now: string, after?: string): Item => ({
    id,
    kind: 'ghost',
    name: id,
    fields: {},
    status: 'waiting',
    version: 0,
    ghost: {
      id,
      kind: 'state',
      of,
      label: '',
      change: '',
      from: null,
      ...(after ? { after } : {}),
      needs: after ? [after] : [],
      usedBy: [],
      why: '',
      state: { who: of, what, now, since: 'm5' },
      depth: 1,
    },
  });

  test('says nothing of the look the change replaces, and keeps everything else but the change', () => {
    // Grandmother's kitchen (26 Sep): "the dreamer (person): adult" and "keep the same face, build
    // and hair" beside "age now a small child" were held, and the dreamer never became a child.
    const dreamer: Item = {
      id: 'p1',
      kind: 'character',
      name: 'you',
      isDreamer: true,
      fields: {
        appearance: { value: 'an adult woman with short brown hair, of average build', said: false },
        wardrobe: { value: 'a red cardigan', said: true },
      },
      status: 'ready',
      version: 1,
      mediaId: 'media-p1',
      review: 'approved',
    };
    const child = ghostPrompt(ghostOf('g2', 'p1', 'age', 'a small child'), dreamer, undefined, style).prompt;
    expect(child).toContain('Make exactly one change: their age is now a small child.');
    expect(child).toContain('the dreamer (person): short brown hair; a red cardigan.');
    expect(child).not.toContain('adult');
    expect(child).not.toContain('average build');
    expect(child).toContain(
      'Keep everything else from image 1: the same hair and clothes, the same pose and framing, the same plain background; only their age changes, and their face and build change with it.',
    );

    // Their clothes change next, edited from the child: neither the old clothes nor the adult is said.
    const drawn = { ...ghostOf('g2', 'p1', 'age', 'a small child'), status: 'ready' as const, mediaId: 'media-g2' };
    const cardigan = ghostPrompt(ghostOf('g3', 'p1', 'clothing', 'a grey cardigan', 'g2'), dreamer, undefined, style, {
      ...drawn,
      continuityApproved: true,
    }).prompt;
    expect(cardigan).toContain('Image 2 is their reference sheet: their hair.');
    expect(cardigan).toContain('the dreamer (person): short brown hair.');
    expect(cardigan).not.toContain('red cardigan');
    expect(cardigan).toContain(
      'Keep everything else from image 1: the same face, build and hair, the same pose and framing, the same plain background; only their clothing changes.',
    );

    // The paper city (26 Sep): "houses leaning over the street" beside "houses now folded down flat".
    const street: Item = {
      id: 'l1',
      kind: 'location',
      name: 'the paper street',
      fields: {
        geography: {
          value:
            'a street in a paper city with a flat paved surface, with houses leaning over it on both sides, walkable',
          said: false,
        },
        landmarks: { value: 'houses with red doors, a corner where the road bends', said: false },
      },
      status: 'ready',
      version: 1,
      mediaId: 'media-l1',
      review: 'approved',
    };
    const folded = ghostPrompt(ghostOf('g4', 'l1', 'houses', 'folded down flat'), street, undefined, style).prompt;
    expect(folded).toContain('Make exactly one change: its houses are now folded down flat.');
    expect(folded).toContain(
      'the paper street (place): a street in a paper city with a flat paved surface, walkable; a corner where the road bends.',
    );
    expect(folded).not.toContain('red doors');
    expect(folded).toContain(
      'Keep everything else from image 1: the same walls, windows, objects, materials and colours, the same view; only its houses change.',
    );
  });
});

describe('what the pictures are made as', () => {
  test('every picture names its medium; a style that names none is a photograph', () => {
    const asSeen = {
      ...style,
      name: 'the dream exactly as it looked to you',
      tokens: ['water drops catching the light'],
    };
    expect(styleBlock(asSeen)).toContain('Made as: a photograph.');
    expect(styleBlock({ ...asSeen, medium: 'soft pencil on paper' })).toContain('Made as: soft pencil on paper.');
    expect(styleBlock({ ...asSeen, name: 'soft watercolour' })).toContain('Made as: soft watercolour.');
    expect(styleBlock({ ...asSeen, tokens: ['flat black ink with hard edges'] })).toContain(
      'Made as: flat black ink with hard edges.',
    );
    // "Storyboard" says drawn: a photographic dream turned into an ink drawing at its fifth picture.
    expect(framePrompt(frame('A board.'), [], asSeen).prompt).not.toMatch(/storyboard/i);
  });
});

describe("a moment's previs", () => {
  test('goes first, as the layout, and the place gives only what it is made of', () => {
    const place: Item = {
      id: 'l1',
      kind: 'location',
      name: 'the theater',
      fields: {},
      status: 'ready',
      version: 1,
      mediaId: 'media-l1',
      review: 'approved',
    };
    const view = "The camera is the dreamer's eyes, on the blue sofa, turned to their left, toward the roller coaster.";
    const pov: Item = {
      id: 'm3',
      kind: 'cut',
      name: 'm3',
      fields: { action: { value: 'The roller coaster where the big sofa was.', said: false } },
      status: 'waiting',
      version: 0,
      frame: {
        visible: [],
        things: [],
        place: 'l1',
        distance: 'close',
        eyes: 'dreamer',
        key: true,
        order: 3,
        plan: {
          id: 'm3',
          order: 3,
          scene: 's1',
          shot: 's1.sh3',
          refs: [],
          own: [],
          staging: [],
          states: [],
          sheetLayout: false,
          changes: [],
          needs: [],
          criteria: [],
          depth: 1,
          transition: '',
          why: '',
          view,
        },
      },
    };
    const { prompt, references } = framePrompt(pov, [place], style, [], 'media-previs');
    // Made real, as a blockout is rendered: the picture to edit, first and only.
    expect(references[0]).toMatchObject({ media_id: 'media-previs', role: 'base' });
    expect(references.filter((r) => r.role === 'base')).toHaveLength(1);
    expect(prompt).toContain('Image 1: EDIT THIS PICTURE. It is a rough grey mock-up of this exact picture');
    expect(prompt).toContain("keep nothing of the mock-up's look: no grey clay, no outlines, no labels or letters.");
    expect(prompt).toContain(
      'What the dreamer sees, the camera being their own eyes, as the mock-up in Image 1 shows it',
    );
    expect(prompt).toContain(
      'Where everything stands, and which way the picture looks, come from Image 1, the mock-up, not from this image; any of its objects the shot has outside the picture stay out of it.',
    );
    // Without a previs, as before.
    const bare = framePrompt(pov, [place], style).prompt;
    expect(bare).not.toContain('mock-up');
    expect(bare).toContain('come from the shot above, not from this image;');
  });

  test('seen from outside, the camera sees what the mock-up shows, and an earlier picture gives only its look', () => {
    const place: Item = {
      id: 'l1',
      kind: 'location',
      name: 'the theater',
      fields: {},
      status: 'ready',
      version: 1,
      mediaId: 'media-l1',
      review: 'approved',
    };
    const before: Item = {
      id: 'm1',
      kind: 'cut',
      name: 'm1',
      fields: { action: { value: 'They sit down.', said: true } },
      status: 'ready',
      version: 1,
      mediaId: 'media-m1',
      review: 'approved',
      frame: { visible: [], things: [], place: 'l1', distance: 'wide', eyes: 'outside', key: false, order: 1 },
    };
    const view =
      'Seen from in front of them, a few metres off, at the height of their eyes: the camera looks toward the back of the room.';
    const outside: Item = {
      id: 'm2',
      kind: 'cut',
      name: 'm2',
      fields: { action: { value: 'The big sofa turns into a roller coaster.', said: false } },
      status: 'waiting',
      version: 0,
      frame: {
        visible: [],
        things: [],
        place: 'l1',
        distance: 'medium',
        eyes: 'outside',
        key: true,
        order: 2,
        plan: {
          id: 'm2',
          order: 2,
          scene: 's1',
          shot: 's1.sh2',
          refs: [{ id: 'm1', kind: 'cut', role: 'composition', relation: 'same_side', carries: 'where everything is' }],
          own: [],
          staging: [],
          states: [],
          sheetLayout: false,
          changes: [],
          needs: ['m1'],
          criteria: [],
          depth: 2,
          transition: '',
          why: '',
          view,
        },
      },
    };
    const inputs = [{ use: outside.frame!.plan!.refs[0], item: before }];
    const { prompt } = framePrompt(outside, [place], style, inputs, 'media-previs');
    expect(prompt).toContain('One picture from the dream, in a landscape 16:9 frame: a medium shot, at eye level.');
    expect(prompt).not.toContain('The subject occupies about half the frame height');
    expect(prompt).toContain(`What the camera sees, as the mock-up in Image 1 shows it: ${view}`);
    expect(prompt).toContain(
      'the same place. Take only how it looks there (its surfaces, colours and light) and how anyone in it who is also in this picture looks; no one else from it comes into this one. Where everyone and everything is, and which way this picture looks, come from Image 1, the mock-up.',
    );
    // The place's sketch gives what it is made of: where things stand comes from the mock-up alone.
    expect(prompt).not.toContain('where things stand comes from the earlier picture');
    expect(prompt).toContain('come from Image 1, the mock-up, not from this image');
  });

  test('an edit keeps the framing of the picture it edits: no shot-size words beside it', () => {
    const earlier: Item = {
      id: 'm4',
      kind: 'cut',
      name: 'm4',
      fields: { action: { value: 'The ice melts.', said: true } },
      status: 'ready',
      version: 1,
      mediaId: 'media-m4',
      review: 'approved',
      frame: { visible: [], things: [], place: 'l1', distance: 'close', eyes: 'outside', key: false, order: 4 },
    };
    const edit: Item = {
      id: 'm5',
      kind: 'cut',
      name: 'm5',
      fields: { action: { value: 'It becomes a horse head of ice.', said: true } },
      status: 'waiting',
      version: 0,
      frame: { visible: [], things: [], place: 'l1', distance: 'close', eyes: 'outside', key: true, order: 5 },
    };
    const use = {
      id: 'm4',
      kind: 'cut' as const,
      role: 'base' as const,
      relation: 'same_setup' as const,
      carries: 'the same view',
    };
    const { prompt } = framePrompt(edit, [], style, [{ use, item: earlier }]);
    expect(prompt).toContain('EDIT THIS PICTURE');
    expect(prompt).not.toContain('The subject fills nearly the whole frame');
  });
});

// Saved dreams a person marked down for what was not carried from one picture to the next, frozen in
// test/fixtures/record; every prompt rebuilt as plan.ts does, every earlier picture drawn and approved.
describe('a moment drawn from the story record (DREAMCHAT_RECORD=on)', () => {
  type Frozen = { breakdown: Breakdown; items: Item[]; words: string[]; style: StyleOption };
  const pictures = (name: string, withRecord: boolean) => {
    const f = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'record', `${name}.json`), 'utf8')) as Frozen;
    const b = structuredClone(f.breakdown);
    completeViews(b);
    const sheets = f.items.map((i): Item => ({
      ...i,
      status: 'ready',
      mediaId: i.extras ? undefined : `sketch-${i.id}`,
      review: 'approved',
    }));
    const rec = withRecord
      ? forPlan(storyRecord(b, f.items, null, { words: f.words, style: f.style }).record)
      : undefined;
    const plan = planContinuity(b, rec);
    const all = [...buildFrames(b, plan), ...buildGhosts(plan)].map((p): Item => ({
      ...p,
      status: 'ready',
      mediaId: `picture-${p.id}`,
      continuityApproved: true,
    }));
    const byId = new Map(all.map((p) => [p.id, p]));
    const prompt = (id: string) => {
      const it = byId.get(id)!;
      if (it.ghost) {
        const g = it.ghost;
        const sheet = sheets.find((s) => s.id === g.of)!;
        const from = g.from ? byId.get(g.from) : undefined;
        return ghostPrompt(it, sheet, from, f.style, g.after ? byId.get(g.after) : undefined);
      }
      const inputs = (it.frame?.plan?.refs ?? [])
        .map((use) => ({ use, item: byId.get(use.id) }))
        .filter((x): x is PlannedInput => !!x.item);
      return framePrompt(it, sheets, f.style, inputs);
    };
    return { plan, prompt };
  };

  test('says how each one is at that moment, once: the suitcase shut, in whose hands (snow-train-2 m1, m5, m6)', () => {
    const { prompt } = pictures('red-door', true);
    expect(prompt('m1').prompt).toContain(
      "How each one is at this moment: the brown leather suitcase is in my grandfather's hands.",
    );
    const m5 = prompt('m5');
    expect(m5.prompt).toContain(
      "How each one is at this moment: the brown leather suitcase is shut, in my grandfather's hands; the red door is shut.",
    );
    expect(m5.prompt).not.toContain('Still so from earlier');
    expect(m5.prompt).not.toContain('open revealing');
    // One suitcase: its sketch, never also its picture open.
    expect(m5.references.filter((r) => r.role === 'prop').map((r) => r.media_id)).toEqual(['sketch-t1', 'sketch-t2']);
    expect(prompt('m6').prompt).toContain("passes from my grandfather's hands to the dreamer's");
  });

  test('the water is still there in the moments after it rose (library-2 m5; library-1 m3)', () => {
    expect(pictures('flooded-library', true).prompt('m5').prompt).toContain(
      'How each one is at this moment: the water rises over the desks; the books are floating off the shelves, open like birds.',
    );
    const m3 = pictures('library-underwater', true).prompt('m3');
    expect(m3.prompt).toContain('the water is coming in under the doors, rising over the desks');
    expect(m3.references.map((r) => r.media_id)).toContain('picture-g1');
  });

  test('a door a later moment opens is shut before it, its light from the doorway not yet said (snow-train m5)', () => {
    const { prompt } = pictures('suitcase-letters', true);
    const m5 = prompt('m5').prompt;
    expect(m5).not.toMatch(/spilling from the doorway/);
    expect(m5).toContain('the door is shut');
    expect(m5).toContain('blue moonlight with soft shadows');
    expect(prompt('m6').prompt).toContain('the door is open, faint yellow glow spilling from the doorway');
  });

  test("the suitcase is in the grandfather's hands as they walk to the door (snow-train m4)", () => {
    const m4 = pictures('suitcase-letters', true).prompt('m4');
    expect(m4.prompt).toContain("the suitcase is shut, in the grandfather's hands");
    expect(m4.references.map((r) => r.media_id)).toContain('sketch-t1');
    expect(m4.prompt).toContain('holding the suitcase');
  });

  test('whoever has gone is not drawn, and whoever has not is (orchard m7; lighthouse m13)', () => {
    const orchard = pictures('lift-orchard', true).prompt('m7');
    expect(orchard.prompt).not.toContain('Tomas (person)');
    expect(orchard.references.map((r) => r.media_id)).not.toContain('sketch-p2');
    const cab = pictures('key-lighthouse', true).prompt('m13');
    expect(cab.prompt).toContain('the dreamer (person)');
    expect(cab.references.map((r) => r.media_id)).toContain('sketch-p1');
  });

  test('an in-between picture says how its subject looked just before, the part it changes left out', () => {
    const { plan, prompt } = pictures('paper-city', true);
    const g = plan.ghosts.find((x) => x.key === 'l1@m5:houses')!;
    expect(g.before?.map((f) => f.text).join('; ')).not.toContain('houses leaning');
    expect(prompt(g.id).prompt).not.toContain('houses leaning');
  });

  test('without the record, the same moments are told as before', () => {
    const { plan, prompt } = pictures('red-door', false);
    expect(plan.cuts.every((c) => c.now === undefined && c.visible === undefined)).toBe(true);
    const m5 = prompt('m5').prompt;
    expect(m5).toContain(
      "Still so from earlier in the dream: the brown leather suitcase's lid: open revealing many letters.",
    );
    expect(m5).not.toContain('How each one is at this moment');
  });
});
