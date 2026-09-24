// Reference sheets: the prompt for each person, place and thing, and the engine calls that
// draw one. Everything goes through Strawberry's own path: the item's fields are patched with
// their source, a recipe is prepared, approved within the conversation's image cap, queued, and
// the engine's worker draws it.
import type { CutPlan, GhostPlan } from './continuity';
import { pictureName } from './continuity';
import { type Detail, mediumOf, oneColour, paletteHue, type StyleOption, VAGUE } from './producer';
import { cli, REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON } from './strawberry';

export type ItemKind = 'character' | 'location' | 'prop' | 'cut' | 'ghost';

/** A person, place or thing being confirmed and sketched. */
export type Item = {
  /** The breakdown's id: p1, l1, t1. */
  id: string;
  kind: ItemKind;
  name: string;
  fields: Record<string, Detail>;
  status: 'waiting' | 'confirming' | 'drawing' | 'ready' | 'failed';
  /** Sketches drawn so far; a correction makes the next one. */
  version: number;
  /** The Strawberry node, once the production is written. */
  nodeId?: string;
  jobId?: string;
  recipeId?: string;
  mediaId?: string;
  /** The image file, relative to the store's media folder. */
  mediaPath?: string;
  error?: string;
  /** The turn whose reply started the sketch, so the chat can show it there. */
  startedAtTurn?: number;
  /** Whether the person has been told it is ready. */
  announced?: boolean;
  /**
   * Their verdict on the current version: approved (it looks right) or left (shown, no
   * objection); undefined while it waits. A correction rejects the version and draws a new one.
   */
  review?: 'approved' | 'left';
  /** Approved by the chat so the next moment could be drawn from it; the person's verdict still stands above it. */
  continuityApproved?: boolean;
  /** For a moment or a ghost: the pictures that must be drawn and approved before it. */
  needs?: string[];
  /** Pictures its plan wanted but it was drawn without, because they failed. */
  dropped?: string[];
  /** Redrawn because the person corrected this earlier picture, which it was drawn from. */
  redrawBecause?: string;
  /** Still drawing from a version the person has since corrected: drawn again once it lands. */
  stale?: boolean;
  /** Redraws the judge asked for, and what the last one was to put right. */
  repairs?: number;
  repairFor?: string[];
  /** For a ghost: what it shows, what it is edited from, and which moments use it. */
  ghost?: GhostPlan;
  /** For a ghost: the planned requirement on its asset that its take covers. */
  requirementId?: string;
  /**
   * Why it has not been drawn: what made the harness unsure, from the confidence gate. Nothing is
   * paid for on a guess; it is tried again once what held it is put right.
   */
  held?: string[];
  /** It stands for more than one person, as the producer said (a family, a couple). */
  several?: boolean;
  /** The group it belongs to, when it also has a sketch of its own. */
  partOf?: string;
  /** Only ever a crowd: described in the moments' words, never sketched. */
  extras?: boolean;
  /** A moment's words reworded before it was drawn, because the gate found them at odds. */
  reworded?: string[];
  /** How many times they have been asked how it looks because the gate held its sketch. */
  heldAsks?: number;
  /** Jev's reading of the prompt it was last to be drawn from. */
  gate?: { contradicts: number; twice: number; clear: number; refsClear: number | null };
  /** The judge's continuity check: the take beside the pictures it was drawn from. */
  continuity?: { questions: number; passed: number; failed: string[]; notes?: string[]; error?: string };
  /** Downloads of the current take retried after failing. */
  collectRetries?: number;
  /** The image judge's check of the current take: how many declared facts it saw. */
  check?: {
    questions: number;
    passed: number;
    failed: string[];
    error?: string;
    unseen?: string[];
    failedIds?: string[];
    /** What the judge saw, per failure. */
    notes?: string[];
  };
  /** Why a moment can't be drawn from yet without the person's verdict. */
  waitsForPerson?: string;
  /** For a moment: the asset nodes its frame shows, confirmed on the take when approved. */
  depicted?: string[];
  /** For a moment: what is in view, where, and how it is seen. */
  frame?: {
    visible: string[];
    things: string[];
    place: string;
    distance: 'close' | 'medium' | 'wide';
    eyes: 'dreamer' | 'outside';
    key: boolean;
    /** Its place in the story, counting from 1. */
    order: number;
    /** What the camera faces. */
    looksAt?: string;
    /** What it is drawn from and why: the continuity plan's entry for it. */
    plan?: CutPlan;
  };
  isDreamer?: boolean;
  /** Shown to the person as a profile to confirm; otherwise sketched from what they told, unasked. */
  ask?: boolean;
};

const FIELD_WORDS: Record<string, string> = {
  identity: 'who they are',
  appearance: 'looks',
  wardrobe: 'wears',
  distinctive_features: 'distinctive',
  geography: 'what kind of place',
  landmarks: "what's in it",
  light: 'light',
  materials: 'made of',
};

/** The profile as the person is shown it: what they said, and what was guessed. */
export function profileOf(item: Item): {
  name: string;
  kind: string;
  said: string[];
  guessed: string[];
  dreamer?: boolean;
  unknownLook?: boolean;
} {
  const said: string[] = [];
  const guessed: string[] = [];
  for (const [k, d] of Object.entries(item.fields)) {
    if (!d.value) continue;
    (d.said ? said : guessed).push(`${FIELD_WORDS[k] ?? k}: ${d.value}`);
  }
  const looks = ['appearance', 'wardrobe'].some((k) => item.fields[k]?.said);
  return {
    name: item.isDreamer ? 'you' : item.name,
    kind: item.kind,
    said,
    guessed,
    dreamer: item.isDreamer,
    unknownLook: item.isDreamer && !looks,
  };
}

const NAMED: [string, number, number, number][] = [
  ['black', 20, 20, 20],
  ['near-black', 32, 38, 44],
  ['dark slate', 45, 60, 70],
  ['dark navy', 22, 30, 60],
  ['deep brown-black', 40, 30, 25],
  ['charcoal', 55, 55, 60],
  ['slate grey', 110, 120, 130],
  ['grey', 128, 128, 128],
  ['silver', 192, 192, 192],
  ['off-white', 240, 236, 226],
  ['white', 250, 250, 250],
  ['cream', 245, 235, 210],
  ['beige', 225, 210, 180],
  ['sand', 210, 185, 140],
  ['tan', 190, 160, 120],
  ['brown', 120, 80, 50],
  ['dark brown', 70, 45, 30],
  ['rust', 160, 80, 40],
  ['ochre', 200, 150, 60],
  ['gold', 200, 170, 60],
  ['yellow', 240, 210, 50],
  ['orange', 240, 130, 30],
  ['red', 200, 30, 30],
  ['crimson', 170, 20, 40],
  ['maroon', 110, 20, 30],
  ['pink', 240, 150, 170],
  ['rose', 200, 100, 120],
  ['magenta', 200, 60, 160],
  ['purple', 120, 60, 160],
  ['lavender', 200, 180, 230],
  ['indigo', 70, 60, 150],
  ['navy', 25, 35, 90],
  ['blue', 50, 90, 190],
  ['pale blue', 180, 210, 235],
  ['sky blue', 120, 180, 230],
  ['steel blue', 70, 110, 150],
  ['teal', 40, 130, 130],
  ['cyan', 60, 200, 220],
  ['pale green', 180, 220, 190],
  ['sage', 150, 170, 140],
  ['green', 50, 140, 70],
  ['dark green', 25, 70, 40],
  ['olive', 120, 120, 50],
];

/** A colour's nearest plain name: a hex code in a prompt gets drawn as a label. */
export function colourName(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = NAMED[0];
  let bestD = Infinity;
  for (const c of NAMED) {
    const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best[0];
}

const COLOUR_WORDS =
  /\b(red|scarlet|crimson|blue|navy|turquoise|green|emerald|yellow|golden|gold|orange|purple|violet|pink|white|black|grey|gray|brown|silver|beige)\b/gi;

/** Each colour word's hue, and how dark it is drawn: 0 dark, 1 mid-toned, 2 pale. */
const HUED: Record<string, [number, number]> = {
  red: [0, 1], scarlet: [0, 1], crimson: [350, 0], maroon: [350, 0], burgundy: [345, 0], pink: [340, 2],
  rose: [345, 2], orange: [30, 1], brown: [25, 0], brunette: [25, 0], auburn: [15, 0], chestnut: [20, 0],
  copper: [25, 1], ginger: [25, 1], tan: [30, 1], beige: [35, 2], cream: [45, 2], golden: [45, 2], gold: [45, 2],
  blonde: [45, 2], blond: [45, 2], yellow: [55, 2], olive: [60, 0], green: [120, 1], emerald: [140, 0],
  teal: [180, 1], turquoise: [175, 1], cyan: [185, 2], blue: [215, 1], navy: [225, 0], indigo: [250, 0],
  purple: [280, 0], violet: [275, 1], lavender: [270, 2], magenta: [300, 1],
  reddish: [0, 1], pinkish: [340, 2], orangey: [30, 1], brownish: [25, 0], yellowish: [55, 2], greenish: [120, 1],
  bluish: [215, 1], purplish: [280, 0],
};
const TONE = ['dark', 'mid-toned', 'pale'];

/**
 * A look said in a style made in one colour: each colour of another hue becomes how dark or pale it
 * is drawn. Told "medium brown hair" beside a line saying hair is drawn in shades of blue, a blue ink
 * wash drew it auburn in two moments of six (24 Sep). Black, white, grey and the palette's own hue
 * say nothing against it and stay.
 */
export function inShades(text: string, style: StyleOption): string {
  if (!oneColour(style)) return text;
  const hue = paletteHue(style);
  const words = Object.keys(HUED).join('|');
  // A colour of two ("red-brown", "blue-green") is its last.
  return text.replace(new RegExp(`\\b(?:${words})-(${words})\\b`, 'gi'), '$1').replace(
    new RegExp(`\\b(?:(light|pale|dark|deep|medium|bright)[ -])?(${words})\\b`, 'gi'),
    (all, mod: string | undefined, word: string) => {
      const [h, tone] = HUED[word.toLowerCase()];
      if (hue !== null && Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) <= 35) return all;
      const shift = /light|pale/i.test(mod ?? '') ? 1 : /dark|deep/i.test(mod ?? '') ? -1 : 0;
      return TONE[Math.max(0, Math.min(2, tone + shift))];
    },
  );
}

/**
 * The colours a dream itself gives, from what the person said: "a string of blue balloons" is
 * blue whatever the chosen look. A muted palette drew them silver (23 Sep); the dream's own
 * detail wins over the treatment.
 */
export function toldColours(...items: Item[]): string[] {
  const out = new Set<string>();
  for (const it of items)
    for (const d of Object.values(it.fields))
      if (d.said && d.value)
        for (const m of d.value.matchAll(new RegExp(COLOUR_WORDS.source, 'gi'))) {
          // The phrase around the colour, so it lands on the right thing: "blue balloons".
          const phrase = d.value
            .slice(m.index ?? 0)
            .split(/[,;.]/)[0]
            .split(/\s+/)
            .slice(0, 3)
            .join(' ');
          out.add(phrase.toLowerCase());
        }
  return [...out];
}

/**
 * The style, for one picture. `fromImages` is for a moment drawn from sketches and earlier
 * pictures: they already fix everyone's colours, so the palette rules the light and whatever no
 * image gives a colour ("colours, and no others" beside the dreamer's blue jeans asked for both).
 */
/** For a style that says nothing of it: the stillness of something remembered, no haze or effects. */
export const DREAM_QUALITY =
  'the stillness of a remembered moment, light a little softer than real and edges a little less sure, with no fog, haze or effects added';

export function styleBlock(
  style: StyleOption,
  told: string[] = [],
  opts: { fromImages?: boolean; ownColours?: boolean } = {},
): string {
  const colours = [...new Set(style.palette_hex.map(colourName))];
  const mono = oneColour(style);
  // A photograph of a person in a cold palette still has warm skin; one in black and white does not.
  const skin = !mono && /photo|camera|film still/i.test(mediumOf(style)) ? 'Skin keeps its natural tone.' : '';
  const keep = told.length ? ` What the dream itself gives a colour keeps it exactly: ${told.join('; ')}.` : '';
  // Made in one colour, a colour a look names is a shade of it: a blue ink wash told "medium brown
  // hair" drew it auburn, beside the same woman's blue-black hair in the picture before (24 Sep).
  const shades = `Colours: ${colours.join(', ')}. The whole picture is shades of this one colour: wherever anyone or anything is given a colour above (hair, skin, clothes), it is drawn as a lighter or darker shade of it, never in its own colour.${told.length ? ` Only what the dream itself gives a colour keeps it exactly: ${told.join('; ')}.` : ''}`;
  return [
    // The line describing a style is written for the person, and it can carry the dream itself
    // ("…precise details on the horse head" put ice horses in every sketch, 23 Sep): only the
    // style's name and its technique reach a picture.
    `Style: ${style.name}.`,
    `Made as: ${mediumOf(style)}. Every part of the picture is made this way, the same as every other picture of this dream.`,
    // A dream should feel like one whatever it is made as: from how this one felt, never a filter.
    `It feels like a dream, in every picture: ${style.dream?.trim() || DREAM_QUALITY}.`,
    style.tokens.length ? `Technique, followed exactly: ${style.tokens.join('; ')}.` : '',
    colours.length
      ? mono
        ? shades
        : opts.fromImages
        ? `Colours: ${colours.join(', ')}, for the light and everything no image above gives a colour to; each person and thing keeps the colours of its image.${keep}${skin ? ` ${skin}` : ''}`
        : opts.ownColours
          ? // A sketch is where its colours are first set: "and no others" beside a sofa "in medium
            // blue", a colour the dreamer said, read as the sketch contradicting itself (0.35;
            // 0.08 without that line, 24 Sep).
            `Colours: ${colours.join(', ')}, for the light and everything its look above gives no colour to; what the look gives a colour keeps it.${keep}${skin ? ` ${skin}` : ''}`
        : told.length
          ? `Colours: ${colours.join(', ')}, except what the dream itself gives a colour, which keeps it exactly: ${told.join('; ')}.${skin ? ` ${skin}` : ''}`
          : `Colours, and no others: ${colours.join(', ')}.${skin ? ` ${skin}` : ''}`
      : '',
    style.lighting_rules ? `Light: ${style.lighting_rules}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Measured on the first real sheets (23 Sep): "No text, labels or captions" still came back
// with "front view" under each view, a ruler, and the palette drawn as labelled swatches.
const NO_WORDS =
  'Do not write any words, letters, numbers, labels or colour codes anywhere in the image, and no logos or brand badges. Do not draw colour swatches, rulers or captions.';

const value = (item: Item, field: string) => item.fields[field]?.value ?? '';

/**
 * The sheet prompt. Every line is a fact about the item or the chosen style; the layout is
 * what Strawberry's playbooks ask of a reference sheet: identity and proportions for a person,
 * geography for a place, shape and scale for a thing.
 */
/**
 * The fields a sheet is drawn from: how it looks, never who it is in the story. "Who they are"
 * carries the story ("a young woman cooking", "the dreamer's aunt"), and a sheet drawn from it
 * came back cooking at a stove (23 Sep). A sheet is the ordinary look, for every picture.
 */
export const LOOK: Record<ItemKind, string[]> = {
  character: ['appearance', 'wardrobe', 'distinctive_features'],
  location: ['geography', 'landmarks', 'light'],
  prop: ['appearance', 'materials'],
  cut: [],
  ghost: [],
};

/**
 * A character that is several people. The producer says so for any dream; its words are read
 * only for a dream drafted before it did.
 */
export function isGroup(item: Item): boolean {
  if (item.several !== undefined) return item.several;
  const said = `${item.name} ${item.fields.appearance?.value ?? ''}`;
  return /\b(people|persons|couple of|group of|crowd|pair of|twins|children|kids|famil(?:y|ies)(?! (?:friend|member|doctor|pet|dog|cat|car|home|house))|(?:two|three|four|five|both|several) (?:\w+ )?(?:men|women|people|children|girls|boys|kids|friends|sisters|brothers|figures))\b/i.test(
    said,
  );
}

/** A name's own word: "the baby" is found as "baby", "your aunt" as "aunt". */
export function headWord(name: string): string | null {
  const words = name
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(the|a|an|my|your|our|his|her|their|of|you|people|person|one|someone)$/.test(w));
  return words.at(-1) ?? null;
}

/**
 * Someone who has their own sketch and is also inside a group's look ("the baby", and "the
 * family" of a father, a mother and a baby): one individual in two images.
 */
export function groupMembers(people: Item[]): { group: Item; member: Item; word: string }[] {
  const out: { group: Item; member: Item; word: string }[] = [];
  // The producer's own links first; a group with none is read from its words.
  const linked = people.filter((p) => p.partOf);
  for (const member of linked) {
    const group = people.find((g) => g.id === member.partOf);
    if (group) out.push({ group, member, word: headWord(member.name) ?? member.name });
  }
  for (const group of people.filter((p) => p.kind === 'character' && isGroup(p) && !linked.some((m) => m.partOf === p.id))) {
    const look = LOOK.character
      .map((k) => group.fields[k]?.value ?? '')
      .join(' ')
      .toLowerCase();
    for (const member of people) {
      if (member === group || member.kind !== 'character') continue;
      const word = headWord(member.name);
      if (word && new RegExp(`\\b${word}s?\\b`).test(look)) out.push({ group, member, word });
    }
  }
  return out;
}

export function sheetPrompt(item: Item, style: StyleOption): string {
  // A look that says nothing a picture can keep ("indistinct, like a figure in a hazy memory")
  // would be drawn as a blur.
  const facts = Object.keys(item.fields)
    .filter((k) => LOOK[item.kind].includes(k) && !VAGUE.test(value(item, k)))
    .map((k) => {
      const v = value(item, k);
      // What they said keeps its colours; what was filled in is said in the style's shades.
      return v ? `${FIELD_WORDS[k] ?? k}: ${item.fields[k]?.said ? v : inShades(v, style)}` : '';
    })
    .filter(Boolean)
    .join('\n');
  // One picture per item, not a grid of views: named views came back captioned ("Front",
  // "Side", "Closer") whatever the prompt said, and a grid used as a reference gets its layout
  // copied. A single clear picture is the identity the moments are drawn from.
  // Some of a dream's people are a group ("a couple of people", "the twins"): "one person only"
  // sketched them as a single man.
  // Named for the picture: the dreamer's sketch said "a single full-length picture of you" (24 Sep).
  const name = item.isDreamer ? 'the dreamer' : pictureName(item.name);
  const layout =
    item.kind === 'character'
      ? isGroup(item)
        ? `A single full-length picture of ${name}, all of them together and no one else, as they ordinarily look: standing side by side in a relaxed three-quarter view, every figure from head to feet, each face clearly visible.`
        : `A single full-length picture of ${name}, one person only, as they ordinarily look: standing in a relaxed three-quarter view, the whole figure from head to feet, the face clearly visible.`
      : item.kind === 'location'
        ? `A single wide picture of ${name}, as it ordinarily looks, with no people in it, showing the whole place and how it is laid out.`
        : `A single clear picture of ${name} on its own, as it ordinarily looks, seen at a slight angle so its shape and materials read.`;
  const background = item.kind === 'location' ? '' : 'Plain, uncluttered background. ';
  // A person's sheet is the face every moment draws them from, so nothing may stand between
  // them and the viewer: a glass-world style drew the dreamer three times behind a frosted
  // shower door, face blurred (23 Sep).
  const clear =
    item.kind === 'character'
      ? 'Nothing between them and the viewer: no glass, pane, screen, door, veil, mist or reflection over them; the face and clothes clearly seen. Whatever the style, it is how the picture is drawn, not something in front of them.'
      : '';
  // The judge's findings on the last attempt, when it was drawn again for them.
  const repair = item.repairFor?.length
    ? `The last attempt at this sheet got these wrong. Put each right:\n${item.repairFor.map((q) => `- ${q}`).join('\n')}`
    : '';
  const ownColours = new RegExp(COLOUR_WORDS.source, 'i').test(facts);
  return [layout, facts, clear, repair, styleBlock(style, toldColours(item), { ownColours }), `${background}${NO_WORDS}`]
    .filter(Boolean)
    .join('\n\n');
}

/** A cut's continuity fields as its plan says, sourced and explained for the record. */
export type CutRecord = { fields: Record<string, unknown>; source: string; reason: string };

export type SheetEngine = {
  /** Write the confirmed fields, then prepare, approve and queue the sketch. */
  start(input: {
    item: Item;
    style: StyleOption;
    sources: { said: string; proposal: string };
    reason: string;
    maxUsd: number;
  }): Promise<{ recipeId: string; jobId: string; usd: number | null }>;
  /** Where the sketch has got to, and its image once it is ready. */
  status(
    jobId: string,
    nodeId: string,
  ): Promise<{ state: string; error?: string; mediaId?: string; mediaPath?: string }>;
  /**
   * Record the person's verdict on a take. An approved take is confirmed as depicting the item
   * and selected, which makes it the item's reference for every picture it appears in.
   */
  review(input: {
    mediaId: string;
    nodeId: string;
    approved: boolean;
    decision: string;
    /** The asset nodes the take shows. A sheet shows its own node; a frame, everything in view. */
    depicted: string[];
    /** The person (their verdict, relayed) or the chat itself (approval for continuity). */
    author?: 'human' | 'assistant';
    /** Planned requirements on the asset the take covers: a ghost's view or state. */
    requirementIds?: string[];
    /** Make an approved take the node's selection. A ghost is never selected: the sheet stays. */
    select?: boolean;
  }): Promise<void>;
  /** Collect a finished picture again after its download failed. Costs nothing: no new generation. */
  retryCollection(jobId: string): Promise<void>;
  /** Set a cut's record to what its plan says, where it differs. */
  record?(nodeId: string, record: CutRecord): Promise<void>;
  /** Prepare, approve and queue a moment's frame, with the approved sheets as references. */
  startFrame(input: {
    item: Item;
    prompt: string;
    references: { media_id: string; role: string; instruction: string }[];
    /** Revised fields to patch onto the cut first, when the person corrected the moment. */
    changes?: Record<string, string>;
    source?: string;
    reason: string;
    maxUsd: number;
    /** What the recipe is for, as Strawberry records it. */
    intent?: string;
    /**
     * The cut's continuity as the plan it is drawn from says: its record is set to it first where
     * it differs. Strawberry refuses a cut for a source that never was drawn, and asks the judge
     * about the states its record holds.
     */
    record?: CutRecord;
    /** Its shape; a moment is a 16:9 storyboard frame, an in-between reference its sketch's shape. */
    shape?: Shape;
  }): Promise<{ recipeId: string; jobId: string; usd: number | null }>;
};

/** Two field values the same, whatever their key order; an empty one is the same as none. */
function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) =>
    v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v as object).length);
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([x], [y]) => x.localeCompare(y))
              .map(([k, x]) => [k, canon(x)]),
          )
        : v;
  return (empty(a) && empty(b)) || JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

export const PROVIDER =
  (process.env.DREAMCHAT_PROVIDER as 'fal' | 'higgsfield' | 'fake' | undefined) ??
  (process.env.FAL_KEY ? 'fal' : 'fake');
// The same model on either paid provider: Nano Banana Pro is `nano_banana_2` on Higgsfield.
const MODEL =
  PROVIDER === 'fal'
    ? 'nano_banana_pro'
    : PROVIDER === 'higgsfield'
      ? (process.env.DREAMCHAT_MODEL ?? 'nano_banana_2')
      : 'fixture';
/**
 * The shape of each kind of picture, sent to the model as its own setting rather than asked for
 * in words: a person's full-length sketch was drawn small in a wide frame (24 Sep). An in-between
 * reference keeps the shape of the sketch it edits; every moment is a storyboard frame.
 */
export type Shape = '2:3' | '4:3' | '16:9' | '1:1';
export function shapeOf(item: Item): Shape {
  if (item.kind === 'character') return isGroup(item) ? '4:3' : '2:3';
  if (item.kind === 'prop') return '1:1';
  return '16:9';
}

/**
 * What the model is asked for, by shape. 2K costs fal what 1K does, so nothing is drawn at 1K,
 * its default when no resolution is sent.
 */
function settingsFor(shape: Shape): Record<string, string> {
  return PROVIDER === 'fal'
    ? { aspect_ratio: shape, resolution: '2K' }
    : PROVIDER === 'higgsfield'
      ? { aspect_ratio: shape, resolution: '2k' }
      : {};
}
/** The most one picture may cost, in the provider's own unit: US dollars on fal, credits on Higgsfield. */
export const MAX_PER_IMAGE = PROVIDER === 'higgsfield' ? 2.5 : 0.2;
/**
 * Higgsfield's charge per picture, as its account shows it (23 Sep): Nano Banana Pro 2 credits,
 * Nano Banana 2 one. It gives no estimate for an edit, so this is what one counts as.
 */
export const CREDITS_PER_IMAGE = MODEL === 'nano_banana_flash' ? 1 : 2;

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

/**
 * The approval for one picture: within the per-picture ceiling when the provider prices it, or
 * with its cost acknowledged as unknown when it cannot. Higgsfield prices no edit that has
 * reference images, though the model's price does not change with them; the dream's picture
 * limit still bounds the spend.
 */
function approval(
  recipe: { fingerprint: string; spec: { estimate?: { credits?: number | null } } },
  reason: string,
  max: number,
) {
  const known = typeof recipe.spec.estimate?.credits === 'number';
  return known || PROVIDER !== 'higgsfield'
    ? { fingerprint: recipe.fingerprint, user_decision: reason, max_credits: max }
    : {
        fingerprint: recipe.fingerprint,
        user_decision:
          `${reason} Higgsfield gives no estimate for an edit with reference images; ${MODEL} costs 2 credits a picture, and the dream's picture limit bounds the spend.`.slice(
            0,
            1000,
          ),
        allow_unknown_cost: true,
      };
}

export const liveSheets: SheetEngine = {
  async start({ item, style, sources, reason, maxUsd }) {
    if (!item.nodeId) throw new Error(`${item.name} is not in the production yet`);
    const node = (await call('inspect', { id: item.nodeId })) as { node: { revision: number } };
    const said: Record<string, { op: 'set'; value: string }> = {};
    const proposed: Record<string, { op: 'set'; value: string }> = {};
    for (const [k, d] of Object.entries(item.fields))
      if (d.value && !VAGUE.test(d.value)) (d.said ? said : proposed)[k] = { op: 'set', value: d.value };
    let revision = node.node.revision;
    for (const [changes, source, why] of [
      [said, sources.said, 'as they told or confirmed it'],
      [proposed, sources.proposal, 'proposed, and left to us'],
    ] as const) {
      if (!Object.keys(changes).length) continue;
      const patched = (await call('patch', {
        id: item.nodeId,
        request: { expected_revision: revision, changes, source_id: source, reason: `${item.name}, ${why}` },
      })) as { revision: number };
      revision = patched.revision;
    }
    const recipe = (await call('prepare', {
      node_id: item.nodeId,
      provider: PROVIDER,
      model: MODEL,
      prompt: sheetPrompt(item, style),
      intent: `Reference sheet for ${item.name}${item.version > 1 ? `, version ${item.version}` : ''}`,
      settings: settingsFor(shapeOf(item)),
    })) as { id: string; fingerprint: string; spec: { estimate?: { credits?: number | null } } };
    const usd = recipe.spec.estimate?.credits ?? null;
    await call('approve', { id: recipe.id, request: approval(recipe, reason, maxUsd) });
    const job = (await call('enqueue', { id: recipe.id })) as { id: string };
    return { recipeId: recipe.id, jobId: job.id, usd };
  },

  async review({ mediaId, nodeId, approved, decision, depicted, author, requirementIds, select }) {
    // The person's verdict and the chat's continuity approval can land together: a conflict is
    // read again and tried once more.
    for (let attempt = 0; ; attempt++) {
      const media = (await call('media', { id: mediaId })) as {
        media: { review: { revision: number } };
        review_context: string;
      };
      try {
        await call('review', {
          id: mediaId,
          request: {
            author: author ?? 'human',
            expected_revision: media.media.review.revision,
            expected_context: media.review_context,
            status: approved ? 'approved' : 'rejected',
            user_decision: decision.slice(0, 1000),
            depicted_assets: approved ? depicted : [],
            requirement_ids: approved ? (requirementIds ?? []) : [],
          },
        });
        break;
      } catch (e) {
        if (attempt || !String(e).includes('review_conflict')) throw e;
      }
    }
    if (!approved || select === false) return;
    const node = (await call('inspect', { id: nodeId })) as { node: { revision: number } };
    await call('select', { node_id: nodeId, media_id: mediaId, revision: node.node.revision });
  },

  async retryCollection(jobId) {
    await call('retry_collection', { id: jobId });
  },

  async record(nodeId, record) {
    const node = (await call('inspect', { id: nodeId })) as {
      node: { revision: number; fields: Record<string, { value?: unknown }> };
    };
    const differs = Object.entries(record.fields).filter(([k, v]) => !sameValue(node.node.fields[k]?.value, v));
    if (differs.length)
      await call('patch', {
        id: nodeId,
        request: {
          expected_revision: node.node.revision,
          changes: Object.fromEntries(differs.map(([k, v]) => [k, { op: 'set', value: v }])),
          source_id: record.source,
          reason: record.reason,
        },
      });
  },

  async startFrame({ item, prompt, references, changes, source, reason, maxUsd, intent, record, shape }) {
    if (!item.nodeId) throw new Error(`${item.name} is not in the production yet`);
    // Their correction first, with their words as its source; the record then writes only what
    // still differs.
    if (changes && Object.keys(changes).length && source) {
      const node = (await call('inspect', { id: item.nodeId })) as { node: { revision: number } };
      await call('patch', {
        id: item.nodeId,
        request: {
          expected_revision: node.node.revision,
          changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { op: 'set', value: v }])),
          source_id: source,
          reason: 'The moment as they corrected it',
        },
      });
    }
    if (record) await liveSheets.record!(item.nodeId, record);
    const recipe = (await call('prepare', {
      node_id: item.nodeId,
      provider: PROVIDER,
      model: MODEL,
      prompt,
      references,
      intent: `${intent ?? `Frame: ${item.name}`}${item.version > 1 ? `, version ${item.version}` : ''}`,
      settings: settingsFor(shape ?? '16:9'),
    })) as { id: string; fingerprint: string; spec: { estimate?: { credits?: number | null } } };
    await call('approve', { id: recipe.id, request: approval(recipe, reason, maxUsd) });
    const job = (await call('enqueue', { id: recipe.id })) as { id: string };
    return { recipeId: recipe.id, jobId: job.id, usd: recipe.spec.estimate?.credits ?? null };
  },

  async status(jobId, nodeId) {
    const job = (await call('job', { id: jobId })) as { state: string; error?: string | null };
    if (job.state !== 'ready') return { state: job.state, error: job.error ?? undefined };
    const node = (await call('inspect', { id: nodeId })) as { media: { id: string; job_id: string; path: string }[] };
    const media = node.media.find((m) => m.job_id === jobId);
    return media ? { state: 'ready', mediaId: media.id, mediaPath: media.path } : { state: 'collecting' };
  },
};

/** The engine's worker for the dream chat's store; fal jobs run only when fal is the provider. */
export function spawnWorker(python: string, repo: string): { stop(): void } | null {
  const proc = Bun.spawn(
    [
      python,
      '-m',
      'backend.studio',
      '--home',
      STRAWBERRY_HOME,
      'worker',
      ...(PROVIDER === 'fal' ? ['--allow-fal'] : PROVIDER === 'higgsfield' ? ['--allow-higgsfield'] : []),
    ],
    { cwd: repo, stdout: 'ignore', stderr: 'inherit', env: process.env },
  );
  return { stop: () => proc.kill() };
}

export type Check = NonNullable<Item['check']>;

export const judgeAvailable = () => !!process.env.JUDGE_URL && !!process.env.JUDGE_API_KEY;

/** The judge on the PC checks one take against its declared facts; the answers go into Strawberry. */
export async function judgeTake(mediaId: string, opts: { facts?: boolean } = {}): Promise<Check> {
  const proc = Bun.spawn(
    [STRAWBERRY_PYTHON, 'dreamchat/judge.py', STRAWBERRY_HOME, mediaId, ...(opts.facts ? ['--facts'] : [])],
    {
      cwd: REPO,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PYTHONPATH: REPO },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((err || out).trim().split('\n').at(-1)?.slice(0, 300) ?? 'judge failed');
  return JSON.parse(out) as Check;
}

/** The judge's continuity check: each question asked of the take beside the picture it compares with. */
export async function judgeContinuity(
  mediaId: string,
  checks: { with: string | null; text: string }[],
): Promise<Check> {
  const proc = Bun.spawn([STRAWBERRY_PYTHON, 'dreamchat/judge.py', STRAWBERRY_HOME, '--continuity'], {
    cwd: REPO,
    stdin: new Blob([JSON.stringify({ media: mediaId, checks })]),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, PYTHONPATH: REPO },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((err || out).trim().split('\n').at(-1)?.slice(0, 300) ?? 'continuity check failed');
  return JSON.parse(out) as Check;
}
