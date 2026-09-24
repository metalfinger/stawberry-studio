import { describe, expect, test } from 'bun:test';
import type { CutPlan } from '../continuity';
import { framePrompt, writingIn } from '../frames';
import { VAGUE } from '../producer';
import { asInstruction } from '../session';
import {
  DREAM_QUALITY,
  groupMembers,
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
    // A moment drawn from its sketches: they fix everyone's colours; the palette rules the rest.
    expect(styleBlock(muted, [], { fromImages: true })).toContain(
      'for the light and everything no image above gives a colour to; each person and thing keeps the colours of its image.',
    );
    expect(styleBlock({ ...muted, medium: 'a photograph' })).toContain('Skin keeps its natural tone.');
    expect(styleBlock(muted)).not.toContain('Skin');
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
      'Where they stand, from left to right: the dreamer, then ana. The same in every picture of this scene: they never swap sides.',
    );
    expect(framePrompt(moment('m1', 1), [ana, kitchen], style).prompt).not.toContain('Where they stand');
  });

  test('an edit names who leaves the picture and who joins it', () => {
    const conductor = sheet('p2', 'character', 'the conductor');
    const use = { id: 'm1', kind: 'cut' as const, role: 'base' as const, relation: 'same_setup' as const, carries: 'x' };
    const before: Item = { ...drawn('m1', 1) };
    before.frame = { ...before.frame!, visible: ['p1', 'p2'] };
    const { prompt } = framePrompt(moment('m2', 2, [use]), [ana, conductor, kitchen], style, [{ use, item: before }]);
    expect(prompt).toContain('who is in it changes: the conductor is no longer there.');
    expect(prompt).not.toContain('everyone in it exactly');
  });

  test('what the judge found invented in the picture being edited is left out of the edit', () => {
    const use = { id: 'm1', kind: 'cut' as const, role: 'base' as const, relation: 'same_setup' as const, carries: 'x' };
    const flawed: Item = {
      ...drawn('m1', 1),
      check: {
        questions: 15,
        passed: 14,
        failed: ['Is everything in this frame declared?'],
        failedIds: ['undeclared'],
        notes: ["a pair of hands reaches in from the bottom corners, as if from a viewer"],
      },
    };
    const { prompt } = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, [{ use, item: flawed }]);
    expect(prompt).toContain(
      'Leave out what it shows that is not in the dream: a pair of hands reaches in from the bottom corners, as if from a viewer.',
    );
    const { prompt: clean } = framePrompt(moment('m2', 2, [use]), [ana, kitchen], style, [{ use, item: drawn('m1', 1) }]);
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
    expect(asInstruction("Is the young woman's head an irregular block of ice?")).toBe(
      "the young woman's head is an irregular block of ice",
    );
    expect(
      asInstruction('Is everything in this frame declared? The cut names the room. Is there no other person?'),
    ).toBe('nothing is in the picture that the dream does not have: no other person, face, hand, limb, creature or tool');
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
    const roof: Item = { ...family, id: 'l2', kind: 'location', name: 'the top of the train', fields: {}, mediaId: 'media-l2' };
    const moment: Item = {
      id: 'm6',
      kind: 'cut',
      name: 'm6',
      fields: { action: { value: 'A family sits on the train with a thrilled baby.', said: true } },
      status: 'waiting',
      version: 0,
      frame: { visible: ['p3', 'p4'], things: [], place: 'l2', distance: 'medium', eyes: 'outside', key: false, order: 6 },
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
    const band: Item = { id: 'p7', kind: 'character', name: 'the Hendersons', fields: {}, status: 'ready', version: 1, several: true };
    const lead: Item = { id: 'p8', kind: 'character', name: 'Ruth', fields: {}, status: 'ready', version: 1, partOf: 'p7' };
    expect(isGroup(band)).toBe(true);
    expect(isGroup({ ...band, several: false, name: 'a couple of people' })).toBe(false);
    expect(groupMembers([band, lead]).map((m) => `${m.group.name} > ${m.member.name}`)).toEqual(['the Hendersons > Ruth']);
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
      'The dream in it, drawn as plain fact the way dreams make it feel, never as a special effect: the room is larger than the house it is in.',
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

describe('what the pictures are made as', () => {
  test('every picture names its medium; a style that names none is a photograph', () => {
    const asSeen = { ...style, name: 'the dream exactly as it looked to you', tokens: ['water drops catching the light'] };
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
