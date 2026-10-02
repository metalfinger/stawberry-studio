// A part of a place or a thing named with its state in a moment's own words: "the cutlery drawer closed beside her",
// "the open door", "she shuts the lid", "the dead ceiling light". The merged flow's Grandmother said "the cutlery drawer
// closed beside her" at m10, while the story record carried the drawer open from m9, where her laying the stamp in it
// implied it: its state, its check and its prompt all said open, against its own point, and every take was judged on
// the drawer (2 Oct). Read the same way where the record takes such a state as a change, where a packet is linted,
// where a plan opens a fixture and a mock-up draws it, and where a place's sketch is told what is shut.

/** What opens and closes, as said in words. */
const OPENS =
  'drawers?|doors?|gates?|windows?|lids?|cupboards?|wardrobes?|chests?|box(?:es)?|hatch(?:es)?|curtains?|shutters?|blinds?|trapdoors?|ovens?|fridges?|freezers?|cabinets?|lockers?|suitcases?|trunks?';
/** What is on or off. */
const LIGHTS = 'lights?|lamps?|bulbs?|torch(?:es)?|lanterns?|televisions?|tvs?|screens?|radios?';

/** A fixture on a plan that opens: a door or a gate, a drawer, a lid, a cupboard and the like. */
export const OPENABLE =
  /\b(door|gate|drawer|cupboard|wardrobe|chest|box|lid|hatch|trapdoor|cabinet|locker|oven|fridge|freezer|suitcase|trunk)(?:s|es)?\b/i;
/** Furniture with a door of its own, opened by swinging it out: its body stays. */
export const DOORED = /\b(?:cupboards?|wardrobes?|cabinets?|lockers?|ovens?|fridges?|freezers?|sideboards?)\b/i;
/** What opens by its lid. */
export const LIDDED = /\b(?:lids?|chests?|box(?:es)?|trunks?|suitcases?)\b/i;
/** What holds things and closes. */
export const CLOSING =
  '(?:drawers?|box(?:es)?|chests?|cupboards?|cabinets?|pockets?|bags?|handbags?|envelopes?|tins?|safes?|trunks?|suitcases?|wardrobes?|lockers?|fridges?|purses?|wallets?|sacks?|sideboards?)';
/** In something that closes: "in her cutlery drawer", "back into the box". */
export const INTO = `\\b(?:back\\s+)?(?:in|into|inside)\\s+((?:the|a|an|her|his|their|my|its|your)\\s+)?((?:[\\w'-]+\\s+){0,2}${CLOSING})\\b`;
/** Put into something that closes, its object between the verb and "in": "puts the stamp in her cutlery drawer". */
export const PUT_INTO = new RegExp(
  `\\b(?:puts?|putting|places?|placed|placing|tucks?|tucked|tucking|slips?|slipped|slipping|drops?|dropped|dropping|stuffs?|stuffed|stuffing|locks?|locked|locking|hides?|hid|hiding|stows?|stowed|stowing|files?|filed|filing|slides?|slid|sliding)\\b([^.;,]{1,60}?)${INTO}`,
  'gi',
);
/** Laid among things in something that closes: "laying the stamp among the knives and forks in her cutlery drawer". */
const LAID_INTO = new RegExp(`\\b(?:lays?|laid|laying)\\b([^.;,]{1,60}?)${INTO}`, 'gi');
/** A hand or a head, which goes in and comes out: never what is put away. */
const BODY = /\b(?:hands?|arms?|fingers?|fists?|head|face|feet|foot|legs?)\b/i;

/** What a moment's words put something into, that closes: "her cutlery drawer"; never a hand going in. */
export function putInto(words: string): string[] {
  const out: string[] = [];
  for (const re of [PUT_INTO, LAID_INTO])
    for (const m of words.matchAll(re))
      if (!BODY.test(m[1]))
        out.push(
          m[3]
            .toLowerCase()
            .replace(/\b(?:open|opened|closed|shut|ajar)\s+/g, '')
            .trim(),
        );
  return out;
}

export type PartState = 'open' | 'closed' | 'on' | 'off';
export type Stated = {
  /** The part as said, without an article: "cutlery drawer". */
  part: string;
  /** Its head noun, singular: "drawer". */
  head: string;
  state: PartState;
};

const sing = (w: string) => w.replace(/(?:(?<=ch|sh|x)es|s)$/i, '');
const ARTICLE = '(?:the|a|an|her|his|their|its|my|our|your)\\s+';
// Up to two words naming which ("cutlery", "ceiling"): never a word that joins clauses, an article or a verb's object
// marker, so a part's name starts where its article does ("pushes the door open" is the door).
const NOT_A_MODIFIER =
  '(?:and|or|but|with|while|as|then|is|was|are|of|in|on|at|by|to|the|a|an|her|his|their|its|my|our|your|this|that)';
const MODIFIER = `(?:(?!${NOT_A_MODIFIER}\\b)[\\p{L}'-]+\\s+){0,2}`;
/** Words that link a light to its state: "the light is off", "the lamp left on", "the torch switched off". */
const LINK = '(?:is|was|are|were|stays?|stayed|left|still|now|switched|turned|goes|went|gone)\\s+';

/** A word of state, as it is said of something that opens or of a light. */
function stateOfWord(word: string, light: boolean): PartState | null {
  const w = word.toLowerCase();
  if (!light) return /^(?:open|opened|ajar)$/.test(w) ? 'open' : /^(?:closed|shut)$/.test(w) ? 'closed' : null;
  return /^(?:on|lit|glowing)$/.test(w) ? 'on' : /^(?:off|dark|unlit|dead|out)$/.test(w) ? 'off' : null;
}

/**
 * Every part a moment's words name with its state: after its name ("the cutlery drawer closed", "the light is off"),
 * before it ("the open drawer", "a dead ceiling light"), or as what someone does to it ("she shuts the lid", "opens the
 * wardrobe", "switches the lamp off"). A light's "on", "off" or "out" only after a word that links it to its state or at
 * the end of a clause: "the lamp on the table" is where it is, "the torch out of her bag" where it comes from. A part
 * both opened and shut in the same words is the last said.
 */
export function statedParts(words: string): Stated[] {
  const out: (Stated & { at: number })[] = [];
  const add = (part: string, state: PartState | null, at: number) => {
    if (!state) return;
    const clean = part
      .toLowerCase()
      .replace(new RegExp(`^${ARTICLE}`, 'iu'), '')
      .trim();
    out.push({ part: clean, head: sing(clean.split(/\s+/).at(-1) ?? ''), state, at });
  };
  // Something that opens, after its name: "the cutlery drawer closed", "the door stands wide open".
  const opens = `${MODIFIER}(?:${OPENS})`;
  for (const m of words.matchAll(
    new RegExp(
      `\\b((?:${ARTICLE})?${opens})(?:\\s+(?:is|was|are|stays?|stayed|stands?|left|now|still|firmly|wide|half|slightly|pushed|pulled|swung|slammed|kicked))*\\s+(open|opened|ajar|closed|shut)\\b(?!\\s+(?:onto|into|on to|out|up|for)\\b)`,
      'giu',
    ),
  ))
    add(m[1], stateOfWord(m[2], false), m.index);
  // A light, after its name: linked to its state, or at the end of its clause.
  // "On", "off" and "out" are where a thing is as often as how a light is: only where the clause ends with them, or
  // a conjunction follows ("the lamp is on the table", "the torch left on the floor" are where they are).
  const lights = `${MODIFIER}(?:${LIGHTS})`;
  const ends = '(?=\\s*(?:[.;,!?]|$|\\b(?:and|but|while|as|so|then|when)\\b))';
  for (const m of words.matchAll(
    new RegExp(
      `\\b((?:${ARTICLE})?${lights})\\s+(?:${LINK})+(?:(lit|glowing|dark|unlit)\\b|(on|off|out)${ends})`,
      'giu',
    ),
  ))
    add(m[1], stateOfWord(m[2] ?? m[3], true), m.index);
  // At the end of its clause with nothing between: "the lamps lit", "the light off."; "out" only of lights ("she takes
  // the torch out." is where it goes).
  for (const m of words.matchAll(
    new RegExp(`\\b((?:${ARTICLE})?${lights})\\s+(lit|glowing|dark|unlit|dead|on|off|out)${ends}`, 'giu'),
  ))
    if (m[2].toLowerCase() !== 'out' || /\blights?$/i.test(m[1])) add(m[1], stateOfWord(m[2], true), m.index);
  // Before its name: "the open drawer", "a dead ceiling light".
  for (const m of words.matchAll(new RegExp(`\\b(open|opened|closed|shut|ajar)\\s+(${opens})\\b`, 'giu')))
    add(m[2], stateOfWord(m[1], false), m.index);
  for (const m of words.matchAll(new RegExp(`\\b(lit|unlit|dark|dead|glowing)\\s+(${lights})\\b`, 'giu')))
    add(m[2], stateOfWord(m[1], true), m.index);
  // Done to it: "she shuts the lid", "opens the wardrobe", "switches the lamp off", "turns on the light".
  for (const m of words.matchAll(
    new RegExp(
      `\\b(open(?:s|ed|ing)?|clos(?:e|es|ed|ing)|shut(?:s|ting)?|slam(?:s|med|ming)?)\\s+(${ARTICLE}${opens})\\b`,
      'giu',
    ),
  ))
    add(m[2], /^open/i.test(m[1]) ? 'open' : 'closed', m.index);
  for (const m of words.matchAll(
    new RegExp(`\\b(?:switch(?:es|ed|ing)?|turn(?:s|ed|ing)?)\\s+(on|off)\\s+(${ARTICLE}${lights})\\b`, 'giu'),
  ))
    add(m[2], m[1].toLowerCase() === 'on' ? 'on' : 'off', m.index);
  for (const m of words.matchAll(
    new RegExp(`\\b(?:switch(?:es|ed|ing)?|turn(?:s|ed|ing)?)\\s+(${ARTICLE}${lights})\\s+(on|off)\\b`, 'giu'),
  ))
    add(m[1], m[2].toLowerCase() === 'on' ? 'on' : 'off', m.index);
  // Each part once, as last said, by its longer name: "opens the drawer … the cutlery drawer closed" is one drawer, shut.
  const once: (Stated & { at: number })[] = [];
  for (const x of out.sort((a, b) => a.at - b.at)) {
    const same = once.findIndex((y) => samePart(x.part, y.part));
    if (same < 0) once.push(x);
    else
      once[same] = {
        ...x,
        part: x.part.length >= once[same].part.length ? x.part : once[same].part,
        at: once[same].at,
      };
  }
  return once.sort((a, b) => a.at - b.at).map(({ part, head, state }) => ({ part, head, state }));
}

/** The state a part's description says it is in, where it says one plainly: "open", "pulled fully out", "shut". */
export function stateOfNow(now: string): PartState | null {
  const w = now.toLowerCase();
  if (
    /^\s*(?:(?:wide|half|partly|slightly|thrown|flung|swung|pushed|pulled|standing|left|now|all)\s+)*(?:open|opened|ajar)\b|\bpulled (?:fully |right )?out\b/.test(
      w,
    )
  )
    return 'open';
  if (/^\s*(?:closed|shut)\b/.test(w)) return 'closed';
  if (/^\s*(?:on|lit|glowing|switched on)\b/.test(w)) return 'on';
  if (/^\s*(?:off|dark|unlit|dead|switched off)\b/.test(w)) return 'off';
  return null;
}

/** Whether two states of the same part cannot both hold. */
export const opposed = (a: PartState | null, b: PartState | null) =>
  !!a && !!b && a !== b && (a === 'open' || a === 'closed') === (b === 'open' || b === 'closed');

const nameWords = (name: string) =>
  (name.toLowerCase().match(/[\p{L}'-]+/gu) ?? []).filter((w) => !new RegExp(`^${NOT_A_MODIFIER}$`).test(w)).map(sing);
/** A name up to what it says of where it is or what it has: "the door to the garden" is a door. */
const coreOf = (name: string) =>
  name
    .toLowerCase()
    .split(/\s+(?:of|to|with|into|onto|over|by|from|for|on|in|at|under|behind|beside|near|through)\s+/)[0];
const matches = (x: string[], y: string[]) => {
  if (!x.length || !y.length || x.at(-1) !== y.at(-1)) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.slice(0, -1).every((w) => long.includes(w));
};

/**
 * Whether two names are the same part: the same last word, and every other word of the shorter one in the longer one
 * ("drawer" is the cutlery drawer, "cutlery drawer" is the cutlery drawer; "cupboard door" is never the front door),
 * by the whole name or by what it is before what it says of where ("the door to the garden" is a door; "the chest of
 * drawers" has a drawer).
 */
export function samePart(a: string, b: string): boolean {
  return (
    matches(nameWords(a), nameWords(b)) ||
    matches(nameWords(coreOf(a)), nameWords(coreOf(b))) ||
    matches(nameWords(a), nameWords(coreOf(b))) ||
    matches(nameWords(coreOf(a)), nameWords(b))
  );
}
