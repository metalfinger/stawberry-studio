// The story record: who and what each moment of a dream shows, and how each looks there, worked out
// in one place from the saved breakdown and the sketches' own words.
//
// Every step of the harness writes free text into the same few fields, and the same look is worked
// out three times over: the moments' carried states, the continuity plan's filtering of them, and the
// tree's stages. They disagree. The classroom's desks were "covered in seaweed" in its own look and a
// change at m3 in the moments, and every picture drawn from that change's in-between picture was lost
// (sea school, 26 Sep). The record is a view: never stored, nothing written back, the same inputs
// always giving the same record. Its rules check it in a fixed order, repair the view, and say what
// they found. For now it only runs beside the plan and is logged (DREAMCHAT_RECORD=shadow).
import { pictureName, rawPlanBy } from './continuity';
import { BECOMING, type Breakdown, type Detail, isWhole, POSITION, type StyleOption, VAGUE, WHOLE } from './producer';
import { isAnimal, type Item, withoutPose } from './sheets';
import { hashOf, slug } from './tree';

// ── the record ──────────────────────────────────────────────────────────────

/** How sure a clause of a look is: the dreamer said it, confirmed our guess, we guessed it, or read it from the story. */
export type Basis = 'said' | 'confirmed' | 'guessed' | 'read';

/** One clause of a look, how sure it is, and where it came from ('item:p1.wardrobe', 'b:m3.leaves.0'). */
export type Fact = { text: string; basis: Basis; from: string };

/**
 * What a change is: turning into something else, a part of someone or something, how a place looks,
 * something resting on them that is not them (birds landing on shoulders), or who is there at all
 * (never a look to carry).
 */
export type ChangeKind = 'becomes' | 'part' | 'place' | 'holding' | 'presence';

export type Change = {
  /** Who, from where, and what: 'p1@m3:age', the key tree.ts gives its stages. */
  key: string;
  who: string;
  at: string;
  kind: ChangeKind;
  /** The part, named one way ('age', 'clothes', 'hair'); null for a turning. */
  part: string | null;
  /** The part as the breakdown said it. */
  what: string;
  /** What it is now, said without "becomes". */
  now: string;
  /** The earlier change of the same part, or of the whole, that this one replaces. */
  replaces?: string;
  /** The first moment it no longer holds. */
  until?: string;
  /** Whether the dreamer told the moment it happens at. */
  told: boolean;
  from: string;
  /** Clauses of `now` the dream leaves open (the breakdown's unknowns): only guessed. */
  guessed?: string[];
  /** Known only from a stored state, from no moment's own changes: the rules merge or drop it. */
  copy?: true;
};

export type ElementKind = 'person' | 'animal' | 'group' | 'crowd' | 'place' | 'thing';

export type RecElement = {
  id: string;
  kind: ElementKind;
  /** How a picture is told it: 'the dreamer', "the dreamer's aunt". */
  called: string;
  /** The breakdown's name, to find it in a moment's words. */
  name: string;
  /** How it looks before anything happens to it, clause by clause, field by field. */
  base: Record<string, Fact[]>;
  /**
   * The breakdown's own copy of the look, where a sketch's words stand instead. The floor plan's
   * brief still reads it, so what the rules strip from one copy they strip from both.
   */
  stored?: Record<string, Fact[]>;
  firstShown: string | null;
  changes: string[];
};

/** How someone or something is in one moment: the stage in force, what it has become, its changed parts, who holds it. */
export type Seen = { stage: string; becomes?: string; parts: Record<string, string>; heldBy?: string };

export type AtMoment = {
  id: string;
  scene: string;
  place: string;
  /** The dream's own jump into this moment, when it made one. */
  shift: string;
  told: boolean;
  eyes: 'dreamer' | 'outside';
  /** Its words: what happens, the one thing it must show, what in it is dreamlike. */
  words: { action: string; visual_point: string; dream: string };
  /** Everyone and everything in it; the dreamer, seen through their own eyes, is the camera and left out. */
  shows: string[];
  /** Who holds what here, by thing: only a thing in it, in the hands of someone in it. */
  held: Record<string, string>;
  /** Each one it shows, and its place. */
  looks: Record<string, Seen>;
  /** The changes that happen here, by key. */
  own: string[];
  /** The changes from earlier still in force here on what it shows. */
  carried: string[];
  /** Whether a floor plan of people standing, sitting or lying can show it. */
  stageable: boolean;
  why?: string;
};

export type StoryRecord = {
  hash: string;
  dreamer: string | null;
  /** What the dream leaves open, as the breakdown lists it. */
  unknowns: string[];
  elements: Record<string, RecElement>;
  changes: Record<string, Change>;
  moments: AtMoment[];
};

/**
 * Jev's readings the record uses, to be kept in `draft.readings` by later steps and never on the
 * moments: a change to the breakdown throws away the planning made from it. None are stored yet, so
 * a rule that wants one does what code alone can without it.
 */
export type Readings = {
  /** By moment: the changes that no longer hold there (their holds_ answered no). */
  undoes?: Record<string, { who: string; what: string }[]>;
  /** By moment: whether a floor plan of people standing, sitting or lying can show it. */
  stageable?: Record<string, { ok: boolean; why?: string }>;
  /** By change key: whether what changed only rests on them, as birds landing on shoulders do. */
  rests?: Record<string, boolean>;
  /** By thing: the place it stays in, so it is present in every moment there. */
  fixtureOf?: Record<string, string>;
  /** By where a look came from ('item:p1.wardrobe'): the clauses the harness filled in. */
  filled?: Record<string, string[]>;
};

export type RecordOptions = {
  /** The dreamer's own messages, when the caller has them: only these say what the dreamer said. */
  words?: string[];
  /** The chosen way of drawing, whose words are never the story's. */
  style?: StyleOption | null;
};

/** How a rule repairs the record: never written back, only the view. */
export type Fix = 'drop' | 'merge' | 'fold' | 'strip' | 'ask' | 'add' | 'flag';

export type RuleName =
  | 'ids'
  | 'presence'
  | 'kind'
  | 'one_name'
  | 'style'
  | 'duplicates'
  | 'said'
  | 'first_look'
  | 'no_change'
  | 'before'
  | 'carried';

export type Violation = { rule: RuleName; who?: string; at?: string; key?: string; detail: string; fix: Fix };

// ── words ───────────────────────────────────────────────────────────────────

/** Words that say nothing by themselves. */
const STOP = new Set(
  'a an the its their his her is are was were be been now still already all in on of with and or to into at by from for as like very this that it they them he she him one some just only also then than about around roughly again dreamer themselves myself me my our your we you'.split(
    ' ',
  ),
);
/** Words that end in s and are not plurals of anything else: "shorts" are not "short". */
const ONLY_PLURAL = new Set(
  'shorts pants trousers jeans glasses tights leggings overalls pyjamas pajamas clothes news species series lens'.split(
    ' ',
  ),
);
/** "Desks" and "desk" are one; "glass", "bus" and "octopus" stay as they are. */
const sing = (w: string) =>
  w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w) && !ONLY_PLURAL.has(w) ? w.slice(0, -1) : w;
/** Words a dreamer says for what a profile writes otherwise: their "mum" is "the dreamer's mother". */
const SAME: Record<string, string> = {
  mum: 'mother',
  mom: 'mother',
  mummy: 'mother',
  mommy: 'mother',
  dad: 'father',
  daddy: 'father',
  gran: 'grandmother',
  granny: 'grandmother',
  nan: 'grandmother',
  nana: 'grandmother',
  grandma: 'grandmother',
  grandad: 'grandfather',
  grandpa: 'grandfather',
  bike: 'bicycle',
  kid: 'child',
  elevator: 'lift',
};
const wordsOf = (x: string | null | undefined) =>
  (x ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && (w.length > 1 || /\d/.test(w)) && !STOP.has(w))
    .map((w) => SAME[w] ?? sing(w));
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bare = (x: string) =>
  x
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/, '')
    .trim();
const quote = (x: string, n = 90) => `"${x.length > n ? `${x.slice(0, n - 1)}…` : x}"`;
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const uniq = <T>(xs: T[]) => [...new Set(xs)];
/** "Mr Hale's", "the two bowls of noodles'". */
const poss = (x: string) => (/s$/i.test(x) ? `${x}'` : `${x}'s`);

/** A piece of a look that ends on a word describing what comes next: "a large", "with a short". */
const ADJ_END =
  /(?:^|\s)(?:large|small|little|big|tiny|huge|vast|short|long|tall|thin|round|smooth|rough|soft|dark|pale|bright|slender|wide|narrow|flat|low|high|heavy|square|rectangular|circular|simple|plain|curly|straight|deep|warm|cold|wooden|shiny|dusty|broad|lean|stocky)$/i;

/**
 * A look's clauses: "brown hair, a red scarf; tall" is three. A comma between two words of one thing
 * is not a clause's end: "a large, slender white horse" is one.
 */
function clausesOf(text: string): string[] {
  const out: string[] = [];
  let open = '';
  for (const piece of text.split(/(\s*;\s*|,\s+|\.\s+|:\s+)/)) {
    if (/^(?:\s*;\s*|,\s+|\.\s+|:\s+)$/.test(piece)) {
      if (open && ADJ_END.test(open.trim()) && piece.trim() === ',') open += ', ';
      else if (open) {
        out.push(open);
        open = '';
      }
      continue;
    }
    open += piece;
  }
  if (open) out.push(open);
  return out
    .map((x) =>
      x
        .replace(/[.\s]+$/, '')
        .replace(/^(?:and|or)\s+/i, '')
        .trim(),
    )
    .filter(Boolean);
}

/** What a name is about: "the two bowls of noodles" is bowls, "the people around" is people. */
function headOf(name: string): string {
  const main = name.split(/\s+(?:of|in|at|on|with|from|who|that|by|near|for|under|behind)\s+/i)[0];
  const ws = main
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(?:the|a|an|around|here|there|below|above|outside|inside|nearby|everywhere)$/i.test(w));
  return ws.at(-1) ?? '';
}

/** Heads that say nothing of who it is. */
const GENERIC_HEAD = new Set(['thing', 'things', 'one', 'someone', 'somebody', 'stuff', 'part', 'piece', 'you', 'me']);

/**
 * Words that find someone or something by name: all of its name, or what it is about when no other
 * entry is about the same. A proper name is matched as written: "uncle Ray" is not the sun's rays.
 */
function nameRe(name: string, head: boolean): RegExp | null {
  const full = name.replace(/^(?:the|a|an)\s+/i, '').trim();
  if (!full) return null;
  const h = headOf(name);
  const proper = /^\p{Lu}/u.test(h);
  const alts = [esc(full)];
  if (head && h.length > 2 && !GENERIC_HEAD.has(h.toLowerCase()))
    alts.push(proper ? esc(h) : esc(sing(h.toLowerCase())));
  return new RegExp(`(?<![\\p{L}-])(?:${alts.join('|')})(?:s|es)?(?![\\p{L}-])`, proper ? 'u' : 'iu');
}

/**
 * Said of someone, it means they are not in the picture: "Tomas is gone", "empty of fish", "the dog
 * unseen ahead", "listening to the click of the dog's claws", "waits for their aunt".
 */
const ABSENT =
  /\b(?:gone|vanish\w*|disappear\w*|missing|no longer|absen\w+|without|nowhere|empty of|emptied of|used to be|fad(?:e|es|ed|ing)|looks? for|looking for|search\w* for|left behind|unseen|out of sight|listen\w*|hear(?:s|d|ing)?|sound of|voice of|wait(?:s|ed|ing)? for|think\w* (?:of|about)|remember\w*|dream\w* of)\b/i;

/** A comparison names nothing that is there: "looming like a bus", "like a cat carrying a kitten". */
const SIMILE =
  /\b(?:like|as (?:big|small|large|tall|huge|tiny|wide|long|high|still|quiet) as|the size of|as if (?:it were|it was)?)\s+(?:an?\s+|the\s+)?[\p{L}-]+(?:\s+[\p{L}-]+){0,3}/giu;

/** Animals and creatures a dream can name. */
const CREATURE =
  /(?<![\p{L}-])(dogs?|pupp(?:y|ies)|terriers?|spaniels?|retrievers?|poodles?|hounds?|cats?|kittens?|horses?|ponies|pony|foals?|cows?|calf|calves|bulls?|sheep|lambs?|goats?|pigs?|rabbits?|hares?|fox(?:es)?|wol(?:f|ves)|bears?|deer|birds?|crows?|ravens?|owls?|gulls?|seagulls?|ducks?|swans?|geese|goose|hens?|chickens?|parrots?|herons?|sparrows?|pigeons?|eagles?|hawks?|storks?|robins?|butterfl(?:y|ies)|moths?|bees?|spiders?|otters?|badgers?|hedgehogs?|fish(?:es)?|whales?|dolphins?|snakes?|lizards?|frogs?|mouse|mice|rats?|squirrels?|monkeys?|elephants?|lions?|tigers?|donkeys?|camels?|jellyfish|octopus(?:es)?|squids?|sharks?|crabs?|lobsters?|turtles?|tortoises?|dragons?|unicorns?|monsters?|creatures?|beasts?|dinosaurs?|insects?|beetles?|worms?|snails?|penguins?|giraffes?|zebras?|kangaroos?|stags?|moose|eels?)(?![\p{L}-])/iu;

// Facets of a look, for telling whether a clause says what a later change changes. "Old" and "young"
// are an age only said of someone, not of their "old school uniform".
const AGE =
  /\b(?:bab(?:y|ies)|toddlers?|child(?:ren|'s)?|kids?|boys?|girls?|teen\w*|elderly|aged|middle-aged|adults?|grown-up|\d+s|\d+\s*(?:years?|yrs?)|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[- ]years?[- ]old|years? old|(?:twent|thirt|fort|fift|sixt|sevent|eight|ninet)ies|\d+-\d+)\b|\b(?:old|older|young|younger)\b(?=\s*(?:$|[,;.]|(?:man|woman|lady|men|women|person|people|boy|girl|adult|child)\b))/i;
const SIZE = /\b(?:tiny|small|little|huge|giant|gigantic|enormous|big|large|miniature|massive|[a-z]+-sized|sized?)\b/i;
const CLOTHES =
  /\b(?:cloth(?:es|ing)|outfit|wardrobe|uniforms?|suits?|jackets?|coats?|raincoats?|overcoats?|cardigans?|jumpers?|sweaters?|pullovers?|hoodies?|shirts?|t-shirts?|blouses?|dress(?:es)?|gowns?|robes?|skirts?|trousers|pants|jeans|shorts|leggings|tights|aprons?|scarf|scarves|hats?|caps?|boots?|shoes?|sneakers|trainers|sandals|slippers|pyjamas|pajamas|vests?|waistcoats?|blazers?|ties?|overalls|onesies?|cloaks?|capes?|gloves?|socks?|jumpsuits?|spacesuits?|halters?)\b/i;
const COLOUR =
  /^(?:red|orange|yellow|green|blue|purple|violet|pink|brown|black|white|grey|gray|silver|gold|golden|beige|cream|navy|teal|olive|tan|ginger|auburn|blonde?|maroon|crimson|scarlet)$/i;
/** The dreamer saying how old they were: "when I was six", "I was little again". */
const OWN_AGE =
  /\b(?:when i was|i was (?:a |only |just )?(?:little|small|young|a kid|a child|\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|i(?:'m| am) (?:\d+|a kid|a child)|as a (?:kid|child)|years? old|little again|my age)\b/i;
/** A child's age, said of the dreamer. */
const CHILD_AGE =
  /\b(?:bab(?:y|ies)|toddlers?|child(?:ren|'s)?|kids?|little (?:boy|girl|one)|teen\w*|(?:[1-9]|1[0-7]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)[- ]years?[- ]old|(?:around|about|aged)\s+(?:[1-9]|1[0-7]|six|seven|eight|nine|ten|eleven|twelve)\b|\b[1-9]-[1-9]\b)/i;
/** Something that happens to it in the story, not how it ordinarily looks: the desert clock "melting like wax". */
const PASSING =
  /(?<![\w-])(?:melt\w*|dripp\w*|ringing|burning|on fire|shatter\w*|crumbl\w*|dissolv\w*|turning into|becom\w*|transform\w*|distort\w*)\b/i;

/** The facets a text speaks of: age and size (only of someone), clothes, and a colour of a named part. */
function facets(text: string, living: boolean): Set<string> {
  const out = new Set<string>();
  if (living && AGE.test(text)) out.add('age');
  if (living && SIZE.test(text)) out.add('size');
  if (CLOTHES.test(text)) out.add('clothes');
  const ws = text.toLowerCase().split(/[^\p{L}-]+/u);
  ws.forEach((w, i) => {
    if (!COLOUR.test(w)) return;
    const noun = ws
      .slice(i + 1)
      .find((x) => x && !COLOUR.test(x) && !/^(?:and|light|dark|pale|bright|deep|-toned)$/.test(x));
    if (noun) out.add(`colour:${sing(noun)}`);
  });
  return out;
}

/** "still with brown jacket" in a turning's words is what it keeps from before, not what it becomes. */
const withoutKept = (now: string) =>
  clausesOf(now)
    .filter((c) => !/^(?:still|keeps?|keeping|with the same|the same)\b/i.test(c))
    .join(', ');

/** Words of a change's new look that say nothing of one look over another. */
const VAGUE_VALUE = new Set(
  'old young little small big large year age new colour color size clothing clothes look appearance form shape body state'.split(
    ' ',
  ),
);

// A change's part, named one way.
const PARTS: [RegExp, string][] = [
  [/^(?:cloth(?:es|ing)|outfit|wardrobe|dress|attire|garments?|what (?:she|he|they|it) wears?)$/, 'clothes'],
  [/^(?:age|ages|age\s*\/\s*size|age and size|size and age|years)$/, 'age'],
  [/^(?:size|height|scale|size\s*\/\s*age)$/, 'size'],
  [/^(?:hair|hair colou?r|hairstyle|hair style)$/, 'hair'],
  [/^(?:light|lights|lighting)$/, 'light'],
];
function partName(what: string): string {
  const w = what
    .toLowerCase()
    .replace(/^(?:the|a|an|its|their|his|her)\s+/, '')
    .trim();
  return PARTS.find(([re]) => re.test(w))?.[1] ?? w;
}
/** A part that is the whole of them: said as a turning, the two are one change. */
const WHOLE_PART =
  /^(?:form|shape|whole|whole body|body|body and all|self|itself|appearance|look|looks|age and clothing|everything)$/i;
/** A part's name that names no part of it, only a field of its profile. */
const LABEL = new Set(
  'appearance look looks colour color size age clothing clothes outfit style fur coat material materials shape type kind texture form state condition'.split(
    ' ',
  ),
);
/** A place's words for moving, which say nothing of how it looks: lanterns "drifting" are the lanterns. */
const MOTION = new Set(
  'drifting drift floating float rising rise falling fall flying fly moving move going go coming come up down away off out over across through toward towards'.split(
    ' ',
  ),
);

// ── ways of drawing ─────────────────────────────────────────────────────────

/** Words that name a way of drawing: in a look or a moment's words, they are drawn as the story. */
const STYLE_SAYS: RegExp[] = [
  /^(?:colou?r\s*\/\s*)?style\b.*$/i,
  /\b(?:all\s+)?(?:drawn|done|painted|sketched|coloured|colored|rendered)\s+in\s+(?:[\w-]+\s+){0,2}?(?:crayons?|watercolou?rs?|pencil|ink|pastels?|oils?|paint|felt[- ]tips?)\b/i,
  /\b(?:(?:like|as in|as if in)\s+(?:an?\s+|the\s+)?(?:[\w-]+\s+){0,4}?(?:films?|movies?|cartoons?|comics?|drawings?|paintings?|illustrations?)|(?:old|silent|grainy|scratched|scratchy)\s+(?:[\w-]+\s+){0,3}?(?:films?|movies?|footage))(?:\s+with\s+scratches)?\b/i,
  /\bblack[- ]and[- ]white(?:\s+and\s+(?:grainy|flicker\w*|scratch\w*))?(?:\s+(?:films?|movies?|photo\w*|footage))?(?=\s*(?:$|[,;.:]|like\b))/i,
  /\bfilm grain\b/i,
  /\b(?:crayons?|watercolou?rs?|anime|manga|cel[- ]shad\w*|cartoons?|comic[- ]book|woodcut|linocut|pixel[- ]art|claymation|stop[- ]motion|gouache|oil[- ]paint(?:ing)?s?|pencil[- ]sketch\w*|felt[- ]tips?|sepia)\b/i,
];

/** The first words in a text that say how it is drawn, of any style or of the chosen one. */
function styleIn(text: string, style?: StyleOption | null): string | null {
  for (const re of STYLE_SAYS) {
    const m = text.match(re);
    if (m?.[0].trim()) return m[0].trim();
  }
  const name = style?.name ? bare(style.name) : '';
  if (name.split(/\s+/).length >= 2 && text.toLowerCase().includes(name)) return name;
  return null;
}

/** A text without every way of drawing it names, and what was taken out. */
function withoutStyle(text: string, style?: StyleOption | null): { text: string; cut: string[] } {
  let out = text;
  const cut: string[] = [];
  for (let i = 0; i < 6; i++) {
    const s = styleIn(out, style);
    if (!s) break;
    cut.push(s);
    const at = out.toLowerCase().indexOf(s.toLowerCase());
    out = `${out.slice(0, at)} ${out.slice(at + s.length)}`;
  }
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(/^(?:all|and|like|as if)\s+/i, '')
    .replace(/\s*\b(?:belongs? in|drawn in|done in|like|as if|as|in|and)$/i, '')
    .trim();
  return { text: out, cut };
}

// ── deriving it ─────────────────────────────────────────────────────────────

type Ctx = {
  record: StoryRecord;
  readings: Readings;
  opts: RecordOptions;
  notes: string[];
  order: Map<string, number>;
  /** The stored states' copies of a change, with their whole flag: only on the first pass. */
  copies: { at: string; key: string; whole?: boolean }[];
};

/** The fields of a profile, in the order its look is read. */
const FIELDS: Record<'person' | 'place' | 'thing', string[]> = {
  person: ['identity', 'appearance', 'wardrobe', 'distinctive_features'],
  place: ['geography', 'landmarks', 'light'],
  thing: ['appearance', 'materials'],
};
/** The fields that say how it looks, "who they are" left out. */
const LOOK_FIELDS: Record<'person' | 'place' | 'thing', string[]> = {
  person: ['appearance', 'wardrobe', 'distinctive_features'],
  place: FIELDS.place,
  thing: FIELDS.thing,
};
const group = (e: RecElement): 'person' | 'place' | 'thing' =>
  e.kind === 'place' ? 'place' : e.kind === 'thing' ? 'thing' : 'person';
const living = (e: RecElement) => e.kind === 'person' || e.kind === 'animal' || e.kind === 'group';

/** A profile's fields as facts, clause by clause; a pose is never a look. */
function factsOf(
  fields: Record<string, Detail | undefined> | undefined,
  from: string,
  person: boolean,
): Record<string, Fact[]> {
  const out: Record<string, Fact[]> = {};
  for (const [k, d] of Object.entries(fields ?? {})) {
    if (!d || typeof d.value !== 'string' || !d.value.trim()) continue;
    // "Standing in a relaxed three-quarter view" came into a father's look, and a moment of him
    // sitting read as at odds with itself (lighthouse, 26 Sep): the record strips it once.
    const value = person && k !== 'identity' ? withoutPose(d.value, false) : d.value;
    const facts = clausesOf(value)
      .filter((c) => !VAGUE.test(c))
      .map((text): Fact => ({ text, basis: d.said ? 'said' : 'guessed', from: `${from}.${k}` }));
    if (facts.length) out[k] = facts;
  }
  return out;
}

const sameLook = (a: Record<string, Fact[]>, b: Record<string, Fact[]>) =>
  JSON.stringify(Object.entries(a).map(([k, fs]) => [k, fs.map((f) => f.text)])) ===
  JSON.stringify(Object.entries(b).map(([k, fs]) => [k, fs.map((f) => f.text)]));

/** Whether a sketch has been drawn, or is being drawn, from an item's words: then they stand. */
const sketched = (it: Item | undefined): it is Item =>
  !!it && !it.extras && (!!it.mediaId || it.status === 'ready' || it.status === 'drawing');

/** The dream's people, places and things, each with its look; a sketch's words stand for what it shows. */
function elementsOf(b: Breakdown, items: Item[], dreamer: string | null, notes: string[]): Record<string, RecElement> {
  const byItem = new Map((items ?? []).filter((i) => i && typeof i.id === 'string').map((i) => [i.id, i]));
  const elements: Record<string, RecElement> = {};
  const add = (id: string, kind: ElementKind, name: string, fields: Record<string, Detail> | undefined) => {
    if (typeof id !== 'string' || !id || elements[id]) return;
    const person = kind !== 'place' && kind !== 'thing';
    const own = factsOf(fields, `b:${id}`, person);
    const it = byItem.get(id);
    // A sketch's words win: its picture was drawn from them. The breakdown's copy is kept beside it.
    const drawn = sketched(it) ? factsOf(it.fields, `item:${id}`, person) : null;
    const differs = !!drawn && !sameLook(drawn, own);
    if (differs) notes.push(`${id}: the sketch's words stand, not the breakdown's, where the two differ`);
    elements[id] = {
      id,
      kind,
      called: id === dreamer ? 'the dreamer' : pictureName(name ?? id),
      name: name ?? id,
      base: drawn ?? own,
      ...(differs ? { stored: own } : {}),
      firstShown: null,
      changes: [],
    };
  };
  const fields = (x: { fields?: unknown }) => x.fields as Record<string, Detail> | undefined;
  for (const p of Array.isArray(b?.people) ? b.people : []) {
    const animal = isAnimal({ kind: 'character', name: p.name ?? '', fields: p.fields ?? {}, isDreamer: p.is_dreamer });
    add(p.id, p.extras ? 'crowd' : p.several ? 'group' : animal ? 'animal' : 'person', p.name, fields(p));
  }
  for (const l of Array.isArray(b?.places) ? b.places : []) add(l.id, 'place', l.name, fields(l));
  for (const t of Array.isArray(b?.things) ? b.things : []) add(t.id, 'thing', t.name, fields(t));
  return elements;
}

/** Every moment as the breakdown has it, and the changes its moments make, by key. */
function momentsOf(
  b: Breakdown,
  dreamer: string | null,
  isPlace: (id: string) => boolean,
): { moments: AtMoment[]; changes: Record<string, Change> } {
  const changes: Record<string, Change> = {};
  const moments: AtMoment[] = [];
  for (const sc of Array.isArray(b?.scenes) ? b.scenes : [])
    for (const m of Array.isArray(sc?.moments) ? sc.moments : []) {
      if (!m || typeof m.id !== 'string') continue;
      const eyes = m.eyes === 'dreamer' ? 'dreamer' : 'outside';
      const shows = uniq([...(m.visible ?? []), ...(m.things ?? [])]).filter(
        (id) => typeof id === 'string' && !(eyes === 'dreamer' && id === dreamer),
      );
      // Who holds what by here, as the floor plan's moves leave it: the bowls handed over at m2 stayed in
      // Priya's hands through the jump and the float (moon market, 26 Sep). The rules keep a holding
      // only where both the thing and its holder are in the moment.
      const held: Record<string, string> = {};
      try {
        for (const s of rawPlanBy(b, m.id)?.spots ?? []) if (s.heldBy) held[s.id] = s.heldBy;
      } catch {
        // A plan that cannot be read holds nothing.
      }
      const own: string[] = [];
      (m.leaves ?? []).forEach((l, i) => {
        if (!l || typeof l.who !== 'string' || typeof l.what !== 'string' || typeof l.now !== 'string') return;
        let key = `${l.who}@${m.id}:${slug(l.what)}`;
        for (let k = 2; changes[key]; k++) key = `${l.who}@${m.id}:${slug(l.what)}~${k}`;
        const now = l.now.replace(BECOMING, '');
        // Said as a turning ("becomes a grey heron"), it is one, whatever part it names.
        const turning = l.whole ?? (isWhole(l) || now !== l.now);
        changes[key] = {
          key,
          who: l.who,
          at: m.id,
          kind: turning ? 'becomes' : isPlace(l.who) ? 'place' : 'part',
          part: turning ? null : partName(l.what),
          what: l.what,
          now,
          told: m.said !== false,
          from: `b:${m.id}.leaves.${i}`,
        };
        own.push(key);
      });
      moments.push({
        id: m.id,
        scene: sc?.id ?? '',
        place: typeof m.place === 'string' ? m.place : '',
        shift: m.shift ?? '',
        told: m.said !== false,
        eyes,
        words: { action: m.action ?? '', visual_point: m.visual_point ?? '', dream: m.dream ?? '' },
        shows,
        held,
        looks: {},
        own,
        carried: [],
        stageable: true,
      });
    }
  return { moments, changes };
}

/**
 * The stored states, as the record first finds them carried: each is its change where one matches, or a
 * copy of one no moment has. The rules decide what really carries; the copies say what they disagree on.
 */
function storedStates(
  b: Breakdown,
  moments: AtMoment[],
  changes: Record<string, Change>,
  isPlace: (id: string) => boolean,
): Ctx['copies'] {
  const copies: Ctx['copies'] = [];
  for (const sc of Array.isArray(b?.scenes) ? b.scenes : [])
    for (const m of Array.isArray(sc?.moments) ? sc.moments : []) {
      const here = moments.find((x) => x.id === m?.id);
      if (!here) continue;
      for (const st of m.states ?? []) {
        if (!st || typeof st.who !== 'string' || typeof st.what !== 'string') continue;
        const match = Object.values(changes).find(
          (c) => !c.copy && c.who === st.who && c.at === st.since && slug(c.what) === slug(st.what),
        );
        const key = match?.key ?? `${st.who}@${st.since}:${slug(st.what)}`;
        changes[key] ??= {
          key,
          who: st.who,
          at: st.since,
          kind: (st.whole ?? WHOLE.test(st.what)) ? 'becomes' : isPlace(st.who) ? 'place' : 'part',
          part: partName(st.what),
          what: st.what,
          now: (st.now ?? '').replace(BECOMING, ''),
          told: false,
          from: `b:${m.id}.states`,
          copy: true,
        };
        if (!here.carried.includes(key)) here.carried.push(key);
        copies.push({ at: m.id, key, ...(st.whole !== undefined ? { whole: st.whole } : {}) });
      }
    }
  return copies;
}

/** The record as the saved dream has it, before any rule has looked at it. */
function derive(b: Breakdown, items: Item[], readings: Readings, opts: RecordOptions): Ctx {
  const notes: string[] = [];
  const dreamer = (Array.isArray(b?.people) ? b.people : []).find((p) => p?.is_dreamer)?.id ?? null;
  const elements = elementsOf(b, items, dreamer, notes);
  const isPlace = (id: string) => elements[id]?.kind === 'place';
  const { moments, changes } = momentsOf(b, dreamer, isPlace);
  const copies = storedStates(b, moments, changes, isPlace);
  const record: StoryRecord = {
    hash: '',
    dreamer,
    unknowns: Array.isArray(b?.unknowns) ? b.unknowns.filter((x) => typeof x === 'string') : [],
    elements,
    changes,
    moments,
  };
  return { record, readings, opts, notes, order: new Map(moments.map((m, i) => [m.id, i])), copies };
}

// ── helpers the rules share ─────────────────────────────────────────────────

const at = (ctx: Ctx, id: string) => ctx.order.get(id) ?? -1;
const called = (ctx: Ctx, id: string) => ctx.record.elements[id]?.called ?? id;
const byOrder = (ctx: Ctx) => (a: Change, b: Change) => at(ctx, a.at) - at(ctx, b.at);
const changesOf = (ctx: Ctx, who: string) =>
  Object.values(ctx.record.changes)
    .filter((c) => c.who === who)
    .sort(byOrder(ctx));

/** Takes a change out of the record, and every moment's list of it; says where it was carried. */
function dropChange(ctx: Ctx, key: string): string[] {
  const carried = ctx.record.moments.filter((m) => m.carried.includes(key)).map((m) => m.id);
  delete ctx.record.changes[key];
  for (const m of ctx.record.moments) {
    m.own = m.own.filter((k) => k !== key);
    m.carried = m.carried.filter((k) => k !== key);
  }
  return carried;
}

/** One change known by two keys becomes the one. */
function mergeChange(ctx: Ctx, from: string, into: string): void {
  delete ctx.record.changes[from];
  for (const m of ctx.record.moments) {
    m.own = uniq(m.own.map((k) => (k === from ? into : k)));
    m.carried = uniq(m.carried.map((k) => (k === from ? into : k)));
  }
}

/** Where someone or something is first in the dream: the dreamer from the start, as the camera or seen. */
function firstShown(ctx: Ctx, id: string): string | null {
  if (id === ctx.record.dreamer) return ctx.record.moments[0]?.id ?? null;
  return ctx.record.moments.find((m) => m.shows.includes(id) || m.place === id)?.id ?? null;
}

/** A moment's words with every place's name and every comparison taken out: what is left names who is there. */
function plainWords(ctx: Ctx, text: string): string {
  let out = text.replace(SIMILE, ' ');
  for (const e of Object.values(ctx.record.elements))
    if (e.kind === 'place' && bare(e.name).length > 2) out = out.replace(new RegExp(esc(bare(e.name)), 'gi'), ' ');
  return out;
}

/** Every fact of a look, both copies, with the field it is in. */
function* factsIn(e: RecElement, copies: ('base' | 'stored')[] = ['base', 'stored']) {
  for (const which of copies) {
    const look = e[which];
    if (!look) continue;
    for (const [field, facts] of Object.entries(look)) for (const f of facts) yield { which, field, fact: f };
  }
}

const saidBasis = (f: Fact) => f.basis === 'said' || f.basis === 'confirmed';

// ── the rules, in their fixed order ─────────────────────────────────────────

/** 1. Every id a moment or a change names is one of the dream's. */
function idsResolve(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const { elements } = ctx.record;
  for (const m of ctx.record.moments) {
    if (m.place && elements[m.place]?.kind !== 'place') {
      out.push({
        rule: 'ids',
        at: m.id,
        detail: `${m.id} happens in "${m.place}", none of the dream's places`,
        fix: 'drop',
      });
      m.place = '';
    }
    const unknown = m.shows.filter((id) => !elements[id] || elements[id].kind === 'place');
    if (unknown.length) {
      out.push({
        rule: 'ids',
        at: m.id,
        detail: `${m.id} shows ${listOf(unknown)}, none of the dream's people or things`,
        fix: 'drop',
      });
      m.shows = m.shows.filter((id) => !unknown.includes(id));
    }
    for (const [t, h] of Object.entries(m.held))
      if (!elements[t] || !elements[h]) {
        out.push({
          rule: 'ids',
          at: m.id,
          detail: `${m.id} has ${t} held by ${h}, one of them none of the dream's`,
          fix: 'drop',
        });
        delete m.held[t];
      }
    const lost = [...m.own, ...m.carried].filter((k) => !ctx.record.changes[k]);
    if (lost.length) {
      m.own = m.own.filter((k) => !lost.includes(k));
      m.carried = m.carried.filter((k) => !lost.includes(k));
      out.push({ rule: 'ids', at: m.id, detail: `${m.id} lists ${listOf(lost)}, no change of the dream`, fix: 'drop' });
    }
  }
  for (const c of Object.values(ctx.record.changes))
    if (!elements[c.who] || !ctx.order.has(c.at)) {
      out.push({
        rule: 'ids',
        key: c.key,
        detail: `${c.key} is of ${c.who} at ${c.at}, which the dream does not have`,
        fix: 'drop',
      });
      dropChange(ctx, c.key);
    }
  return out;
}

/** Whether a name is said in a text other than as whose something is: "the father's folds" brings no father. */
const namesIn = (re: RegExp, text: string) =>
  [...text.matchAll(new RegExp(re.source, `${re.flags}g`))].some(
    (x) => !/^['’]s\b/.test(text.slice((x.index ?? 0) + x[0].length)),
  );

/**
 * 2. Whoever and whatever a moment's words name is in it. Left only in the action, the old man and the
 * camel the dreamer watches walking off were drawn nowhere in the last picture (desert station, 26 Sep).
 * Someone said to be gone is not there ("Tomas is gone"), a comparison names no one ("looming like a
 * bus"), and "the father's folds" bring no father. Whoever has turned into something is found by what
 * they are now, unless what they are now is in view as an entry of its own.
 */
function namedInWords(ctx: Ctx): Violation[] {
  const { elements, moments, dreamer } = ctx.record;
  const cast = Object.values(elements).filter((e) => e.kind !== 'place' && e.id !== dreamer);
  // An animal is also the kind it is: Biscuit, "the dreamer's old cat", is "a huge ginger cat" where she
  // comes through the grass, never one of "the cats in the gardens" (crayon cat, 26 Sep).
  const kinds = new Map(
    cast.map((e) => [
      e.id,
      new Set([
        sing(headOf(e.name).toLowerCase()),
        ...[...factsIn(e, ['base'])]
          .filter(({ field }) => field === 'identity' || field === 'appearance')
          .flatMap(({ fact }) =>
            [...fact.text.matchAll(new RegExp(CREATURE.source, 'giu'))].map((x) => sing(x[1].toLowerCase())),
          ),
      ]),
    ]),
  );
  const alone = (e: RecElement) => {
    const h = sing(headOf(e.name).toLowerCase());
    return cast.filter((x) => kinds.get(x.id)?.has(h)).length === 1;
  };
  const added = new Map<string, string[]>();
  for (const m of moments) {
    const parts = plainWords(ctx, `${m.words.action}. ${m.words.visual_point}`).split(
      /[.;!?]+|,\s*(?:while|as|but|then|and then)\s+|\s+then\s+/i,
    );
    for (const e of cast) {
      if (m.shows.includes(e.id)) continue;
      const turned = changesOf(ctx, e.id)
        .filter((c) => c.kind === 'becomes' && !c.copy && at(ctx, c.at) <= at(ctx, m.id))
        .at(-1)?.now;
      // Mrs Okafor, turned into a grey heron, is the grey heron the moment already shows (heron dream, 26 Sep).
      if (turned && m.shows.some((id) => !!nameRe(elements[id]?.name ?? '', true)?.test(turned))) continue;
      const res = [nameRe(e.name, alone(e)), turned ? nameRe(turned, true) : null].filter((r): r is RegExp => !!r);
      if (!parts.some((p) => res.some((re) => namesIn(re, p)) && !ABSENT.test(p))) continue;
      m.shows.push(e.id);
      added.set(e.id, [...(added.get(e.id) ?? []), m.id]);
    }
  }
  return [...added].map(([id, ms]) => ({
    rule: 'presence' as const,
    who: id,
    at: ms[0],
    detail: `${called(ctx, id)} is named in the words of ${listOf(ms)} but not in view there`,
    fix: 'add' as const,
  }));
}

/** On a wall, a pole or a post: it stays where it is. */
const FIXED =
  /\b(?:on|to|from|against|up)\s+(?:the|a|an|its|one)\s+(?:[\w-]+\s+){0,2}?(?:wall|pole|post|ceiling|mast|column|pillar|lamppost)s?\b|\b(?:mounted|bolted|nailed|screwed)\b/i;

/**
 * A thing that stays in its place is there in every moment there. The desert station's clock stands
 * on its pole, and the camera left it out of the first and last pictures, where the pole was in frame
 * (desert station, 26 Sep). A reading says so where there is one; else its look, "on a pole".
 */
function fixtures(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const e of Object.values(ctx.record.elements)) {
    if (e.kind !== 'thing') continue;
    const fixed = [...factsIn(e, ['base'])].some(({ fact }) => FIXED.test(fact.text));
    const place =
      ctx.readings.fixtureOf?.[e.id] ??
      (fixed ? ctx.record.moments.find((m) => m.shows.includes(e.id))?.place : undefined);
    if (!place) continue;
    const ms = ctx.record.moments.filter((m) => m.place === place && !m.shows.includes(e.id));
    for (const m of ms) m.shows.push(e.id);
    if (ms.length)
      out.push({
        rule: 'presence',
        who: e.id,
        at: ms[0].id,
        detail: `${e.called} stays in ${called(ctx, place)}: there in ${listOf(ms.map((m) => m.id))} too`,
        fix: 'add',
      });
  }
  return out;
}

/**
 * A place's crowd stays in its moments until the dream takes it away. The market's crowd was listed
 * only at m1, and every picture after said "nobody else is in the picture", m3 "surrounded by the
 * market" included (moon market, 26 Sep). A jump starts afresh; "empty of fish" ends it.
 */
function crowdsStay(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const e of Object.values(ctx.record.elements)) {
    if (e.kind !== 'crowd') continue;
    const re = nameRe(e.name, true);
    let where: string | null = null;
    const added: string[] = [];
    for (const m of ctx.record.moments) {
      if (m.shift) where = null;
      if (m.shows.includes(e.id)) where = m.place;
      else if (where !== null && m.place === where) {
        m.shows.push(e.id);
        added.push(m.id);
      }
      const leaves = m.own
        .map((k) => ctx.record.changes[k])
        .some(
          (c) =>
            !!c &&
            ((c.who === e.id && (POSITION.test(c.what.trim()) || ABSENT.test(c.now))) ||
              (ABSENT.test(c.now) && !!re?.test(c.now))),
        );
      if (leaves) where = null;
    }
    if (added.length)
      out.push({
        rule: 'presence',
        who: e.id,
        at: added[0],
        detail: `${e.called} stays in ${called(ctx, ctx.record.moments.find((m) => m.id === added[0])?.place ?? '')}: there in ${listOf(added)} too`,
        fix: 'add',
      });
  }
  return out;
}

/** What someone holds, rides or hands over: "rides the old red bicycle". */
const HANDLED =
  /\b(?:holds?|holding|held|carr(?:y|ies|ying|ied)|rides?|riding|rode|drives?|driving|drove|hands?|handing|handed|gives?|giving|gave|picks? up|picking up|picked up|throws?|throwing|threw)\s+(?:the|a|an|his|her|their|its|some|two|three)\s+((?:[\p{L}-]+\s+){0,3}?)([\p{L}-]+?)(?=\s+(?:of|to|with|in|on|at|up|down|over|from|and|as|while|toward|towards|into|off|out|through|between)\b|[,.;]|$)/giu;
/** What is held that is not a thing of the story: a hand, a breath, a look. */
const NOT_A_THING =
  /^(?:hands?|arms?|heads?|noses?|faces?|hair|breath|backs?|shoulders?|feet|foot|legs?|eyes?|mouths?|way|turn|step|look|moment|time|air|sky|light|gaze|attention|door|seat|place|edge|rest|lead|one|them|it|everything|something|nothing)$/i;

/**
 * A creature or a thing a moment's words name that no entry of the dream is. The huge pink jellyfish,
 * the centre of the dream, was named in three moments and cast nowhere, so nothing sketched it and each
 * picture made it up anew (jellyfish city, 26 Sep). Only flagged: code cannot say what it is. A place
 * named after it ("inside the jellyfish") casts no one, and a comparison names nothing.
 */
function uncast(ctx: Ctx): Violation[] {
  const { elements, changes, moments } = ctx.record;
  const cover = new Set<string>();
  for (const e of Object.values(elements)) {
    if (e.kind === 'place') {
      for (const { field, fact } of factsIn(e))
        if (field === 'landmarks') for (const w of wordsOf(fact.text)) cover.add(w);
      continue;
    }
    for (const w of wordsOf(e.name)) cover.add(w);
    for (const { fact } of factsIn(e)) for (const w of wordsOf(fact.text)) cover.add(w);
  }
  for (const c of Object.values(changes)) for (const w of wordsOf(c.now)) cover.add(w);
  const placeWords = new Set(
    Object.values(elements)
      .filter((e) => e.kind === 'place')
      .flatMap((e) => [...wordsOf(e.name), ...[...factsIn(e)].flatMap(({ fact }) => wordsOf(fact.text))]),
  );
  const found = new Map<string, { said: string; ms: string[] }>();
  const note = (word: string, said: string, m: string) => {
    const f = found.get(word) ?? { said, ms: [] };
    if (!f.ms.includes(m)) f.ms.push(m);
    found.set(word, f);
  };
  for (const m of moments) {
    const text = plainWords(ctx, `${m.words.action}. ${m.words.visual_point}`);
    for (const x of text.matchAll(new RegExp(CREATURE.source, 'giu'))) {
      const w = sing(x[1].toLowerCase());
      if (cover.has(w) || cover.has(x[1].toLowerCase())) continue;
      const phrase = text
        .slice(0, (x.index ?? 0) + x[1].length)
        .match(/(?:(?:\b(?:a|an|the|some|two|three|hundreds of|dozens of)\s+)(?:[\p{L}-]+\s+){0,3})?[\p{L}-]+$/iu)?.[0];
      note(w, phrase ?? x[1], m.id);
    }
    for (const x of text.matchAll(HANDLED)) {
      const w = sing(x[2].toLowerCase());
      if (
        w.length < 3 ||
        NOT_A_THING.test(w) ||
        CREATURE.test(w) ||
        CLOTHES.test(w) ||
        cover.has(w) ||
        placeWords.has(w)
      )
        continue;
      note(w, `${x[1]}${x[2]}`.trim(), m.id);
    }
  }
  return [...found].map(([, f]) => ({
    rule: 'presence' as const,
    at: f.ms[0],
    detail: `${quote(f.said)} is named in ${listOf(f.ms)} but is none of the dream's people or things, so nothing keeps how it looks`,
    fix: 'flag' as const,
  }));
}

function presence(ctx: Ctx): Violation[] {
  return [...namedInWords(ctx), ...fixtures(ctx), ...crowdsStay(ctx), ...uncast(ctx)];
}

/** Said of a change, someone or something has left, not changed: "empty of fish". */
const GONE = /\b(?:empty of|emptied of|gone|no longer (?:there|here)|vanish\w*|disappear\w*|absent)\b/i;
/** Resting on someone, not a part of them: "covered with tiny paper birds", "landing on". */
const RESTING =
  /\b(?:covered (?:with|in)|landing on|landed on|lands on|perched on|resting on|rests on|sitting on|sits on)\b/i;

/**
 * 3. What a change is, typed once, and read from its type everywhere after. A change where someone or
 * something leaves is who is there, not a look: the fish leaving was "the classroom's desks, empty of
 * fish", and made an in-between picture of an absence (sea school, 26 Sep). Birds landing on shoulders
 * rest on them and were drawn as shoulders replaced (paper city, 26 Sep). A copy of a change keeps its
 * type: Mr Hale's turning into an octopus lost its whole flag a moment later, and he was drawn as a
 * man beside the octopus (sea school, 26 Sep).
 */
function kindOnce(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const c of Object.values(ctx.record.changes)) {
    if (c.copy) continue;
    const e = ctx.record.elements[c.who];
    const rests = ctx.readings.rests?.[c.key];
    let kind: ChangeKind = c.kind;
    if (POSITION.test(c.what.trim()) || GONE.test(c.now)) kind = 'presence';
    else if (
      e &&
      e.kind !== 'place' &&
      (rests ?? (c.kind !== 'becomes' && RESTING.test(c.now) && (CREATURE.test(c.now) || mentionsCast(ctx, c.now))))
    )
      kind = 'holding';
    else if (rests === false && c.kind === 'holding') kind = 'part';
    if (kind === c.kind) continue;
    out.push({
      rule: 'kind',
      who: c.who,
      at: c.at,
      key: c.key,
      detail:
        kind === 'presence'
          ? `${poss(called(ctx, c.who))} ${c.what} ${quote(c.now)} is who is there, not a look`
          : kind === 'holding'
            ? `${poss(called(ctx, c.who))} ${c.what} ${quote(c.now)} rests on them; it replaces nothing`
            : `${poss(called(ctx, c.who))} ${c.what} ${quote(c.now)} is a part of them`,
      fix: 'flag',
    });
    c.kind = kind;
    if (kind === 'holding' && c.part === null) c.part = partName(c.what);
  }
  for (const k of uniq(ctx.copies.map((x) => x.key))) {
    const c = ctx.record.changes[k];
    if (!c || c.copy || c.kind !== 'becomes') continue;
    const lost = ctx.copies.filter((x) => x.key === k && x.whole !== true && !WHOLE.test(c.what)).map((x) => x.at);
    if (lost.length)
      out.push({
        rule: 'kind',
        who: c.who,
        at: lost[0],
        key: k,
        detail: `${called(ctx, c.who)} turned into ${quote(c.now)} at ${c.at}, carried at ${listOf(lost)} without being a turning`,
        fix: 'flag',
      });
  }
  return out;
}

/** Whether a text names one of the dream's people or things. */
const mentionsCast = (ctx: Ctx, text: string) =>
  Object.values(ctx.record.elements).some((e) => e.kind !== 'place' && !!nameRe(e.name, false)?.test(text));

type Merge = (from: Change, into: Change, why: string) => void;

/** Two changes of one part at one moment are one, and a turning takes in any other name for the whole of them. */
function sameMoment(ctx: Ctx, merge: Merge): void {
  for (const m of ctx.record.moments) {
    const here = Object.values(ctx.record.changes).filter((c) => c.at === m.id && !c.copy);
    for (const c of here) {
      if (!ctx.record.changes[c.key]) continue;
      const first = here.find(
        (x) =>
          x !== c &&
          x.who === c.who &&
          !!ctx.record.changes[x.key] &&
          here.indexOf(x) < here.indexOf(c) &&
          ((x.part !== null && x.part === c.part) ||
            (x.kind === 'becomes' && WHOLE_PART.test(c.what.trim())) ||
            (c.kind === 'becomes' && x.kind === 'becomes')),
      );
      const turning = here.find(
        (x) =>
          x !== c && x.who === c.who && x.kind === 'becomes' && c.kind !== 'becomes' && WHOLE_PART.test(c.what.trim()),
      );
      const into = first ?? turning;
      if (into)
        merge(
          c,
          into,
          `${poss(called(ctx, c.who))} ${c.what} ${quote(c.now)} at ${c.at} is ${into.what} ${quote(into.now)} again`,
        );
    }
  }
}

/** A stored state is another name for its moment's change when that change is the same part, or the turning of the whole of them. */
function storedNames(ctx: Ctx, merge: Merge): void {
  for (const c of Object.values(ctx.record.changes)) {
    if (!c.copy) continue;
    const same = Object.values(ctx.record.changes).filter((x) => !x.copy && x.who === c.who && x.at === c.at);
    const into =
      same.find((x) => x.part !== null && x.part === c.part) ??
      same.find((x) => x.kind === 'becomes') ??
      (same.length === 1 && WHOLE_PART.test(c.what.trim()) ? same[0] : undefined);
    if (into)
      merge(
        c,
        into,
        `${poss(called(ctx, c.who))} "${c.what}" carried from ${c.at} is ${into.kind === 'becomes' ? `the turning into ${quote(into.now)}` : `${into.what} ${quote(into.now)}`}, under another name`,
      );
  }
}

/**
 * One who turns into someone the dream also lists is one, never two: Mrs Okafor turns into a grey heron
 * and "the grey heron" has an entry of its own, so a moment could draw both (heron dream, 26 Sep).
 * Flagged only: which entry stands is for the step that merges them.
 */
function listedTwice(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const { elements, moments } = ctx.record;
  for (const c of Object.values(ctx.record.changes)) {
    if (c.copy || c.kind !== 'becomes' || !elements[c.who] || elements[c.who].kind === 'place') continue;
    const as = Object.values(elements).find(
      (x) =>
        x.id !== c.who &&
        x.id !== ctx.record.dreamer &&
        (x.kind === 'person' || x.kind === 'animal') &&
        !!nameRe(x.name, true)?.test(c.now) &&
        !moments.some((m) => m.shows.includes(x.id) && m.shows.includes(c.who)),
    );
    if (as)
      out.push({
        rule: 'one_name',
        who: c.who,
        at: c.at,
        key: c.key,
        detail: `${called(ctx, as.id)} is what ${called(ctx, c.who)} turns into at ${c.at}: one, listed twice`,
        fix: 'flag',
      });
  }
  return out;
}

/**
 * 4. One change, one name. Planned again, Tomas's "age and clothing" became his "body", and the old
 * name, still carried, matched no picture of him (hotel orchard, 26 Sep). The first said wording stands.
 */
function oneName(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const merge: Merge = (from, into, why) => {
    out.push({ rule: 'one_name', who: from.who, at: from.at, key: from.key, detail: why, fix: 'merge' });
    mergeChange(ctx, from.key, into.key);
  };
  sameMoment(ctx, merge);
  storedNames(ctx, merge);
  return [...out, ...listedTwice(ctx)];
}

/**
 * The dreamer's age, taken from the way of drawing. "Like a drawing I did in crayon when I was six" is
 * how the pictures look, not how old they are, and the dreamer, an adult the size of a mouse, was
 * sketched as a small child (crayon cat, 26 Sep). With their words, an age they said only while
 * saying how it looked is stripped; without them, a child's age we guessed in a dream drawn in a
 * medium is flagged as unsaid.
 */
function ageFromStyle(ctx: Ctx): Violation[] {
  const d = ctx.record.dreamer ? ctx.record.elements[ctx.record.dreamer] : undefined;
  if (!d) return [];
  const words = ctx.opts.words;
  const ages = (look: Record<string, Fact[]> | undefined) =>
    Object.entries(look ?? {}).flatMap(([field, fs]) =>
      fs.filter((f) => !saidBasis(f) && CHILD_AGE.test(f.text)).map((f) => ({ field, f })),
    );
  const found = [...ages(d.base), ...ages(d.stored)];
  if (!found.length) return [];
  if (!words?.length) {
    const drawn = [ctx.opts.style?.name, ctx.opts.style?.medium, ...(ctx.opts.style?.tokens ?? [])]
      .filter((x): x is string => !!x)
      .some((x) => !!styleIn(x) || /\b(?:drawing|drawn|painting|film|comic|illustration)\b/i.test(x));
    if (!drawn) return [];
    return [
      {
        rule: 'style',
        who: d.id,
        detail: `the dreamer's age ${listOf(uniq(found.map(({ f }) => quote(f.text))))} is our guess, in a dream drawn as ${quote(ctx.opts.style?.name ?? '')}`,
        fix: 'flag',
      },
    ];
  }
  const sentences = words.flatMap((w) => w.split(/(?<=[.!?])\s+/));
  const aged = sentences.filter((s) => OWN_AGE.test(s));
  if (!aged.length || !aged.every((s) => !!styleIn(s) || /\b(?:drawn|drawing|drawings|painted|painting)\b/i.test(s)))
    return [];
  for (const { f } of found)
    for (const look of [d.base, d.stored])
      for (const [k, fs] of Object.entries(look ?? {})) look![k] = fs.filter((x) => x !== f);
  return [
    {
      rule: 'style',
      who: d.id,
      detail: `the dreamer's age ${listOf(uniq(found.map(({ f }) => quote(f.text))))} comes from how the pictures look: ${quote(aged[0])}`,
      fix: 'strip',
    },
  ];
}

/**
 * 5. The way of drawing is never the story. Written into a look or a moment's words, it is drawn as
 * what is there: the stairwell's light "like old black and white film" (car park, 26 Sep), the back
 * garden's landmarks "style all drawn in crayon" (crayon cat, 26 Sep), "the anime city" (jellyfish
 * city, 26 Sep). The words are stripped from both copies of a look and from the moment's words.
 */
function styleNotStory(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const style = ctx.opts.style;
  for (const e of Object.values(ctx.record.elements)) {
    const cut: string[] = [];
    for (const which of ['base', 'stored'] as const) {
      const look = e[which];
      if (!look) continue;
      for (const [field, facts] of Object.entries(look)) {
        look[field] = facts.flatMap((f) => {
          const w = withoutStyle(f.text, style);
          if (!w.cut.length) return [f];
          cut.push(`${field} ${quote(w.cut.join(' … '))}`);
          return wordsOf(w.text).filter((x) => !LABEL.has(x)).length ? [{ ...f, text: w.text }] : [];
        });
      }
    }
    if (cut.length)
      out.push({
        rule: 'style',
        who: e.id,
        detail: `${poss(e.called)} look says how it is drawn: ${listOf(uniq(cut))}`,
        fix: 'strip',
      });
  }
  for (const m of ctx.record.moments) {
    const cut: string[] = [];
    for (const k of ['action', 'visual_point', 'dream'] as const) {
      const w = withoutStyle(m.words[k], style);
      if (!w.cut.length) continue;
      cut.push(`${k === 'visual_point' ? 'what it must show' : k} ${quote(w.cut.join(' … '))}`);
      m.words[k] = w.text;
    }
    if (cut.length)
      out.push({
        rule: 'style',
        at: m.id,
        detail: `${m.id}'s words say how it is drawn: ${listOf(cut)}`,
        fix: 'strip',
      });
  }
  return [...out, ...ageFromStyle(ctx)];
}

/** A clause's words for comparing, without a label in front ("fur colour ginger" is ginger). */
function pieceWords(text: string): string[] {
  const ws = wordsOf(text);
  let i = 0;
  while (i < ws.length - 1 && LABEL.has(ws[i])) i++;
  let j = ws.length;
  while (j > i + 1 && /^(?:size|colour|color|age)$/.test(ws[j - 1])) j--;
  return ws.slice(i, j);
}
/** Whether an earlier clause already says all of this one, or all but one word of a long one. */
const covers = (earlier: string[], piece: string[]) => {
  if (!piece.length) return false;
  const has = new Set(earlier);
  const shared = piece.filter((w) => has.has(w)).length;
  const missing = piece.length - shared;
  return (missing === 0 && shared >= 1) || (missing <= 1 && shared >= 3);
};

/**
 * 6. A look says each thing once. Grounding appended what a field already said: "the repeating 'Level 4'
 * signs on every wall …; walls Level 4 written on every wall" (car park, 26 Sep), and Biscuit's "One
 * white ear.; size huge; fur colour ginger" beside her "Ginger with one white ear" (crayon cat, 26 Sep).
 * A clause that an earlier one of the same field says, or for someone or something an earlier one of
 * its look, is stripped.
 */
function duplicates(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const e of Object.values(ctx.record.elements)) {
    const order = FIELDS[group(e)];
    // Across fields only for someone: a thing's materials may well name what its look is made of.
    const across = living(e);
    for (const which of ['base', 'stored'] as const) {
      const look = e[which];
      if (!look) continue;
      const seen: { field: string; words: string[] }[] = [];
      const cut: string[] = [];
      for (const field of [...order, ...Object.keys(look).filter((k) => !order.includes(k))]) {
        if (!look[field]) continue;
        look[field] = look[field].filter((f) => {
          const earlier = seen.filter(
            (s) => s.field === field || (across && s.field !== 'identity' && field !== 'identity'),
          );
          const pieces = f.text.split(/\s+and\s+/).map(pieceWords);
          const dup = pieces.every((p) => earlier.some((s) => covers(s.words, p)));
          if (dup) cut.push(`${field} ${quote(f.text)}`);
          else seen.push({ field, words: wordsOf(f.text) });
          return !dup;
        });
      }
      if (cut.length)
        out.push({
          rule: 'duplicates',
          who: e.id,
          detail: `${e.called}${which === 'stored' ? " (the breakdown's copy)" : ''} says again ${listOf(cut)}`,
          fix: 'strip',
        });
    }
  }
  return out;
}

/** An unknown that asks a question: "whether the octopus keeps his brown jacket". */
const OPEN = /\b(?:whether|if)\b/i;

/**
 * 7. Said means the dreamer said it, as far as the saved words can show. A clause of a change the dream
 * leaves open is only guessed: the octopus keeping the brown jacket shaped the turning, though the
 * breakdown itself listed it as unknown (sea school, 26 Sep). A sketch's padded words keep "said" once
 * revised: Priya's "casual teal blouse with three-quarter sleeves" was said by no one (moon market, 26
 * Sep). With the dreamer's words, a said clause most of whose words they never used is only read; without
 * them, a sketch's said clause that the breakdown's own copy does not have is.
 */
function saidByThem(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const open = ctx.record.unknowns.filter((u) => OPEN.test(u)).map((u) => new Set(wordsOf(u)));
  for (const c of Object.values(ctx.record.changes)) {
    const found = clausesOf(c.now)
      .flatMap((x) => x.split(/\s+and\s+/))
      .filter((x) => {
        const ws = wordsOf(x);
        return ws.length >= 2 && !c.guessed?.includes(x) && open.some((u) => ws.every((w) => u.has(w)));
      });
    if (!found.length) continue;
    c.guessed = [...(c.guessed ?? []), ...found];
    out.push({
      rule: 'said',
      who: c.who,
      at: c.at,
      key: c.key,
      detail: `${poss(called(ctx, c.who))} ${c.what} ${listOf(found.map((x) => quote(x)))} is what the dream leaves open`,
      fix: 'flag',
    });
  }
  const heard = ctx.opts.words?.length ? new Set(ctx.opts.words.flatMap(wordsOf)) : null;
  for (const e of Object.values(ctx.record.elements)) {
    for (const [field, facts] of Object.entries(e.base)) {
      const theirs = e.stored?.[field]?.filter(saidBasis).flatMap((f) => wordsOf(f.text));
      const lowered: string[] = [];
      for (const f of facts) {
        if (!saidBasis(f)) continue;
        const ws = wordsOf(f.text);
        const filled = ctx.readings.filled?.[f.from]?.includes(f.text);
        const unheard = heard
          ? ws.length > 0 && ws.filter((w) => heard.has(w)).length * 2 < ws.length
          : !!e.stored && f.from.startsWith('item:') && !covers(theirs ?? [], ws) && ws.length > 0;
        if (!filled && !unheard) continue;
        f.basis = 'read';
        lowered.push(quote(f.text));
      }
      if (lowered.length)
        out.push({
          rule: 'said',
          who: e.id,
          detail: `${poss(e.called)} ${field} ${listOf(lowered)} ${lowered.length > 1 ? 'are' : 'is'} marked said, but not in ${heard ? 'their words' : "the breakdown's own words"}`,
          fix: 'flag',
        });
    }
  }
  return out;
}

/** The field a folded first look goes in. */
function foldField(e: RecElement, part: string | null): string {
  if (e.kind === 'place') return 'landmarks';
  if (e.kind === 'thing') return 'appearance';
  if (part === 'clothes') return 'wardrobe';
  if (part && /^(?:age|size|hair|face|build|height|skin|eyes)$/.test(part)) return 'appearance';
  return 'distinctive_features';
}

/**
 * 8. How someone or something looks where it is first shown is its look, not a change. The orchard's
 * apples glowing "like little lamps", given as a change where the lift opened onto it, never reached its
 * sketch (hotel orchard, 26 Sep); the dreamer's size at the first moment is how they are the whole dream
 * (crayon cat, 26 Sep). Folded into the look as read from the story, never as said. A turning stays a
 * change, and so does a thing that stood in its place before it changed.
 */
function firstLook(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const c of Object.values(ctx.record.changes).sort(byOrder(ctx))) {
    if (c.copy || c.kind === 'becomes' || c.kind === 'presence' || c.kind === 'holding') continue;
    const e = ctx.record.elements[c.who];
    if (!e || firstShown(ctx, c.who) !== c.at) continue;
    const field = foldField(e, c.part);
    const part = bare(c.what);
    const text = part && !LABEL.has(part) && !c.now.toLowerCase().includes(part) ? `${part} ${c.now}` : c.now;
    const has = Object.values(e.base).flat();
    if (!has.some((f) => covers(wordsOf(f.text), pieceWords(text))))
      (e.base[field] ??= []).push({ text, basis: c.told ? 'read' : 'guessed', from: c.from });
    const carried = dropChange(ctx, c.key);
    out.push({
      rule: 'first_look',
      who: c.who,
      at: c.at,
      key: c.key,
      detail: `${poss(e.called)} ${c.what} ${quote(c.now)} is how ${e.kind === 'place' || e.kind === 'thing' ? 'it looks' : 'they look'} where first shown, at ${c.at}${carried.length ? `; carried at ${listOf(carried)}` : ''}`,
      fix: 'fold',
    });
  }
  return out;
}

/**
 * 9. A change that changes nothing is none. The classroom's desks "covered in seaweed" at m3, with its
 * landmarks "desks covered in seaweed" from the start, made an in-between picture that contradicted
 * itself, and every moment drawn from it was lost (sea school, 26 Sep). The girl's "clothing: yellow
 * raincoat" in the last moment, her wardrobe a yellow raincoat all along (jellyfish city, 26 Sep); the
 * lanterns floating into the sky at m4, "floating paper lanterns" in the market's own look (moon market,
 * 26 Sep); the car turned into the rowing boat it already was (car park, 26 Sep). A part's name that is
 * only a field of the profile ("clothing" is the wardrobe) need not be said again, and a place's look is
 * read whole. Only what was said counts: a guessed look may be the later change leaked in (rule 10).
 */
function noChange(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const c of Object.values(ctx.record.changes).sort(byOrder(ctx))) {
    if (c.copy || c.kind === 'presence' || c.kind === 'holding') continue;
    const e = ctx.record.elements[c.who];
    if (!e) continue;
    const before = changesOf(ctx, c.who).filter(
      (x) =>
        x !== c &&
        !x.copy &&
        at(ctx, x.at) < at(ctx, c.at) &&
        (c.kind === 'becomes' ? x.kind === 'becomes' : x.part === c.part),
    );
    const place = e.kind === 'place';
    const partWords =
      c.kind === 'becomes' || LABEL.has(bare(c.what)) || WHOLE_PART.test(c.what.trim()) ? [] : wordsOf(c.what);
    const want = uniq(
      [...wordsOf(withoutKept(c.now)), ...partWords].filter((w) => !(place && MOTION.has(w)) && !LABEL.has(w)),
    );
    let why = '';
    if (before.length) {
      const last = before.at(-1)!;
      if (wordsOf(last.now).join(' ') === wordsOf(c.now).join(' ')) why = `is what it already was from ${last.at}`;
    } else if (want.length) {
      const looks = LOOK_FIELDS[group(e)];
      // A clause that tells the change is no look to compare with: the big sofa's "before turning into the
      // roller coaster" made its turning look like no change at all (sofa roller coaster, 24 Sep).
      const said = [...factsIn(e)]
        .filter(({ field, fact }) => looks.includes(field) && saidBasis(fact) && !PASSING.test(fact.text))
        .map(({ fact }) => wordsOf(fact.text));
      const whole = new Set(said.flat());
      if (place ? want.every((w) => whole.has(w)) : said.some((ws) => want.every((w) => ws.includes(w))))
        why = `is how ${place || e.kind === 'thing' ? 'it' : 'they'} already look${place || e.kind === 'thing' ? 's' : ''} in ${place || e.kind === 'thing' ? 'its' : 'their'} own profile`;
    }
    if (!why) continue;
    const carried = dropChange(ctx, c.key);
    out.push({
      rule: 'no_change',
      who: c.who,
      at: c.at,
      key: c.key,
      detail: `${poss(e.called)} ${c.what} ${quote(c.now)} at ${c.at} ${why}${carried.length ? `; carried at ${listOf(carried)}` : ''}`,
      fix: 'drop',
    });
  }
  return out;
}

/**
 * Whether a clause says what a change makes of them: a word of its new look, not only a colour, an age
 * word, or the name of what changes ("the roof filled with water" says nothing new of the roof).
 */
function restates(text: string, c: Change, e: RecElement): boolean {
  const has = new Set(wordsOf(text));
  const own = new Set([...wordsOf(e.name), ...wordsOf(c.what)]);
  // A turning is said by what it makes of them: the heron Mrs Okafor becomes still wears her red
  // cardigan, and "red cardigan" in her look is from before as much as after (heron dream, 26 Sep).
  if (c.kind === 'becomes') {
    const h = turnedInto(c.now);
    return h.length > 2 && !own.has(h) && has.has(h);
  }
  const value = uniq(wordsOf(withoutKept(c.now))).filter((w) => !own.has(w) && !VAGUE_VALUE.has(w) && !COLOUR.test(w));
  const shared = value.filter((w) => has.has(w)).length;
  // Of a place or a thing, only the whole of it: the office's snow "covering desks and keyboards" is
  // not its "desks and monitors" (office snow, 26 Sep).
  return living(e) ? shared > 0 : shared > 0 && shared === value.length;
}

/** What a turning makes of them, by what it is about: "a tall grey heron wearing a red cardigan" is a heron. */
const turnedInto = (now: string) =>
  sing(
    headOf(
      (clausesOf(withoutKept(now))[0] ?? now).split(
        /\s+(?:wearing|holding|carrying|still|that|who|which|made of)\b/i,
      )[0],
    ).toLowerCase(),
  );

/**
 * 10. The look is from before anything happens to it. Tomas, who turns ten in the lift, was guessed "a
 * ten-year-old boy" in an old school uniform and sketched as a boy from the first picture (hotel orchard,
 * 26 Sep); the dreamer, who is little again in a red cardigan at m5, was proposed "adult" in "red
 * cardigan", so the change changed nothing and its in-between picture fought the adult it started from
 * (grandma's kitchen, 26 Sep). Read by facet, not by shared words: "adult" and "child" share none. For a
 * part's change, a clause of the same facet (age, size, clothes, a colour of the same part) or one that
 * says the new look; for a turning, only one that says what it turns into. A guessed clause is stripped;
 * a said one is asked, as whether the change stays. A passing state in a look ("melting like wax") is
 * flagged: it belongs to a moment.
 */
function fromBefore(ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  for (const c of Object.values(ctx.record.changes).sort(byOrder(ctx))) {
    if (c.copy || c.kind === 'presence' || c.kind === 'holding') continue;
    const e = ctx.record.elements[c.who];
    if (!e) continue;
    const alive = living(e);
    const facet = facets(`${withoutKept(c.now)} ${c.part ?? ''}`, alive);
    if (c.part === 'age') facet.add('age');
    if (c.part === 'size' && alive) facet.add('size');
    if (c.part === 'clothes') facet.add('clothes');
    const stripped: string[] = [];
    const asked: string[] = [];
    for (const [field, facts] of Object.entries(e.base)) {
      if (e.kind !== 'place' && !FIELDS[group(e)].includes(field)) continue;
      e.base[field] = facts.filter((f) => {
        if (f.from === c.from) return true;
        const same = c.kind === 'part' && [...facets(f.text, alive)].some((x) => facet.has(x));
        // Who they are speaks of a change only by its facet: "the dreamer's best friend from school" says
        // nothing of a school uniform, "a ten-year-old boy" says an age.
        const says = restates(f.text, c, e) && (field !== 'identity' || same);
        if (!(same || says)) return true;
        if (saidBasis(f)) {
          if (says) asked.push(`${field} ${quote(f.text)}`);
          return true;
        }
        stripped.push(`${field} ${quote(f.text)}`);
        return false;
      });
    }
    const change = c.kind === 'becomes' ? `turns into ${quote(c.now)}` : `${c.what} becomes ${quote(c.now)}`;
    if (stripped.length)
      out.push({
        rule: 'before',
        who: c.who,
        at: c.at,
        key: c.key,
        detail: `${poss(e.called)} look is from after ${c.at}, where ${e.kind === 'place' || e.kind === 'thing' ? 'its' : 'their'} ${change}: ${listOf(stripped)}`,
        fix: 'strip',
      });
    if (asked.length)
      out.push({
        rule: 'before',
        who: c.who,
        at: c.at,
        key: c.key,
        detail: `${poss(e.called)} said look already has what ${c.at} changes (${change}): ${listOf(asked)}; does the change stay?`,
        fix: 'ask',
      });
  }
  for (const e of Object.values(ctx.record.elements)) {
    const passing = [...factsIn(e, ['base'])].filter(({ fact }) => PASSING.test(fact.text));
    if (passing.length)
      out.push({
        rule: 'before',
        who: e.id,
        detail: `${poss(e.called)} look has what happens to ${e.kind === 'place' || e.kind === 'thing' ? 'it' : 'them'} in the story: ${listOf(passing.map(({ field, fact }) => `${field} ${quote(fact.text)}`))}`,
        fix: 'flag',
      });
  }
  return out;
}

/** The first moment after `from` where the dream jumps into another place. */
function jumpAway(ctx: Ctx, from: string): string | undefined {
  const ms = ctx.record.moments;
  const i = at(ctx, from);
  const place = ms[i]?.place;
  return ms.slice(i + 1).find((m) => !!m.shift && m.place !== place)?.id;
}

/** The later change that replaces a change by a moment: the same part changed again, or a turning of the whole. */
const replacedBy = (ctx: Ctx, c: Change, by: string) =>
  Object.values(ctx.record.changes).find(
    (d) =>
      d !== c &&
      !d.copy &&
      d.who === c.who &&
      d.kind !== 'presence' &&
      at(ctx, d.at) > at(ctx, c.at) &&
      at(ctx, d.at) <= at(ctx, by) &&
      (d.kind === 'becomes' || (d.part !== null && d.part === c.part)),
  );

/** The changes in force at a moment, by construction: before it, not ended, not replaced by then, on what it shows. */
function inForce(ctx: Ctx, m: AtMoment): string[] {
  const here = at(ctx, m.id);
  return Object.values(ctx.record.changes)
    .sort(byOrder(ctx))
    .filter(
      (c) =>
        !c.copy &&
        c.kind !== 'presence' &&
        at(ctx, c.at) < here &&
        !(c.until && at(ctx, c.until) <= here) &&
        (m.shows.includes(c.who) || m.place === c.who) &&
        !replacedBy(ctx, c, m.id),
    )
    .map((c) => c.key);
}

/**
 * Where each change ends and what it replaces. It ends where Jev read it no longer holds; what only
 * rests on someone ends where the dream jumps into another place. With no reading, a change holds,
 * as it does today when Jev is unsure.
 */
function ends(ctx: Ctx): void {
  for (const c of Object.values(ctx.record.changes).sort(byOrder(ctx))) {
    if (c.copy) continue;
    const undone = ctx.record.moments.find(
      (m) =>
        at(ctx, m.id) > at(ctx, c.at) &&
        (ctx.readings.undoes?.[m.id] ?? []).some((u) => u.who === c.who && slug(u.what) === slug(c.what)),
    )?.id;
    const rests = c.kind === 'holding' || ctx.readings.rests?.[c.key] === true;
    const until = undone ?? (rests ? jumpAway(ctx, c.at) : undefined);
    if (until) c.until = until;
    const replaced = changesOf(ctx, c.who)
      .filter((x) => x !== c && !x.copy && at(ctx, x.at) < at(ctx, c.at) && replacedBy(ctx, x, c.at) === c)
      .at(-1);
    if (replaced) c.replaces = replaced.key;
  }
}

/** Why a change the stored states carry at a moment is not in force there. */
function whyNot(ctx: Ctx, c: Change | undefined, first: string): string {
  if (!c) return 'no change of the dream';
  if (c.copy) return 'no moment has that change';
  if (c.kind === 'presence') return 'it is who is there, not a look';
  if (c.until && at(ctx, first) >= at(ctx, c.until)) return `it ends at ${c.until}`;
  const again = replacedBy(ctx, c, first);
  return again ? `it changes again at ${again.at}` : `${called(ctx, c.who)} is not in view there`;
}

/** Each moment's carried changes, made by construction, said where they differ from the stored states'. */
function carriedDiff(ctx: Ctx): Violation[] {
  const { changes, moments } = ctx.record;
  const dropped = new Map<string, string[]>();
  const added = new Map<string, string[]>();
  for (const m of moments) {
    const now = inForce(ctx, m);
    for (const k of m.carried.filter((k) => !now.includes(k))) dropped.set(k, [...(dropped.get(k) ?? []), m.id]);
    for (const k of now.filter((k) => !m.carried.includes(k))) added.set(k, [...(added.get(k) ?? []), m.id]);
    m.carried = now;
  }
  const said = (c: Change | undefined, k: string) => (c ? `${poss(called(ctx, c.who))} ${c.what} ${quote(c.now)}` : k);
  const out: Violation[] = [
    ...[...dropped].map(([k, ms]): Violation => ({
      rule: 'carried',
      who: changes[k]?.who,
      at: ms[0],
      key: k,
      detail: `${said(changes[k], k)} is carried at ${listOf(ms)}, but ${whyNot(ctx, changes[k], ms[0])}`,
      fix: 'drop',
    })),
    ...[...added].map(([k, ms]): Violation => ({
      rule: 'carried',
      who: changes[k].who,
      at: ms[0],
      key: k,
      detail: `${said(changes[k], k)} from ${changes[k].at} holds at ${listOf(ms)}, where the stored states do not carry it`,
      fix: 'add',
    })),
  ];
  for (const c of Object.values(changes)) if (c.copy) dropChange(ctx, c.key);
  return out;
}

/** A thing is held at a moment only where both it and its holder are in it; the dreamer holds as the camera too. */
function heldBoth(ctx: Ctx): Violation[] {
  const loose = new Map<string, string[]>();
  for (const m of ctx.record.moments)
    for (const [t, h] of Object.entries(m.held)) {
      const holder = m.shows.includes(h) || (h === ctx.record.dreamer && m.eyes === 'dreamer');
      if (m.shows.includes(t) && holder) continue;
      delete m.held[t];
      loose.set(`${t}<${h}`, [...(loose.get(`${t}<${h}`) ?? []), m.id]);
    }
  return [...loose].map(([pair, ms]) => {
    const [t, h] = pair.split('<');
    return {
      rule: 'carried',
      who: t,
      at: ms[0],
      detail: `${called(ctx, t)} is in ${poss(called(ctx, h))} hands at ${listOf(ms)}, which ${ms.length > 1 ? 'show' : 'shows'} not both`,
      fix: 'drop',
    };
  });
}

/**
 * 11. A change is carried only while it holds, and a thing is held only where both it and its holder
 * are. States were carried after their change was gone: Tomas's old "age and clothing" (hotel orchard,
 * 26 Sep). The birds that landed on shoulders stayed there onto the blank white page after the city
 * folded away (paper city, 26 Sep). Priya held both bowls while jumping and floating, moments that show
 * no bowls (moon market, 26 Sep). What the stored states carry and the record does not, and the other
 * way round, is said.
 */
function carriedWhileHolds(ctx: Ctx): Violation[] {
  ends(ctx);
  return [...carriedDiff(ctx), ...heldBoth(ctx)];
}

/**
 * The rules, in a fixed order: what is there before how it looks, and the look before its changes.
 * Presence comes before the first look is folded in, so a clock standing on its pole from the start has
 * a look before it melts (desert station, 26 Sep). The look's own words are cleaned (the way of drawing,
 * what is said twice, what the dreamer never said) before the first look is folded and the changes are
 * weighed against it, since what was said decides whether a clause is dropped or asked about.
 */
export const RULES: { name: RuleName; run: (ctx: Ctx) => Violation[] }[] = [
  { name: 'ids', run: idsResolve },
  { name: 'presence', run: presence },
  { name: 'kind', run: kindOnce },
  { name: 'one_name', run: oneName },
  { name: 'style', run: styleNotStory },
  { name: 'duplicates', run: duplicates },
  { name: 'said', run: saidByThem },
  { name: 'first_look', run: firstLook },
  { name: 'no_change', run: noChange },
  { name: 'before', run: fromBefore },
  { name: 'carried', run: carriedWhileHolds },
];
export const RULE_ORDER: RuleName[] = RULES.map((r) => r.name);

// ── finishing the view ──────────────────────────────────────────────────────

/** Flying, floating, swimming, weather: a floor plan of people standing, sitting or lying cannot show it. */
const UNSTAGED =
  /\b(?:fl(?:y|ies|ying|ew|own)|float\w*|hover\w*|swim\w*|swam|underwater|under water|in the air|mid-?air|airborne|soar\w*|rain(?:s|ing)?|snow(?:s|ing)?|storm\w*)\b/i;

/** Each element's changes and first moment, and each moment's looks, from the repaired record. */
function finish(ctx: Ctx, hash: string): void {
  const { record, readings } = ctx;
  for (const e of Object.values(record.elements)) {
    e.changes = changesOf(ctx, e.id).map((c) => c.key);
    e.firstShown = firstShown(ctx, e.id);
  }
  for (const m of record.moments) {
    m.looks = {};
    const keys = [...m.carried, ...m.own];
    for (const id of [...m.shows, ...(m.place ? [m.place] : [])]) {
      const on = keys
        .map((k) => record.changes[k])
        .filter((c): c is Change => !!c && c.who === id && c.kind !== 'presence')
        .sort(byOrder(ctx));
      const turned = on.filter((c) => c.kind === 'becomes').at(-1);
      const parts: Record<string, string> = {};
      for (const c of on)
        if (c.kind !== 'becomes' && (!turned || at(ctx, c.at) >= at(ctx, turned.at))) parts[c.part ?? c.what] = c.now;
      m.looks[id] = {
        stage: on.at(-1)?.key ?? `${id}#0`,
        ...(turned ? { becomes: turned.now } : {}),
        parts,
        ...(m.held[id] ? { heldBy: m.held[id] } : {}),
      };
    }
    const read = readings.stageable?.[m.id];
    const turns = m.own.some((k) => record.changes[k]?.kind === 'becomes');
    const air = `${m.words.action} ${m.words.visual_point}`.match(UNSTAGED)?.[0];
    const why = read
      ? read.why
      : turns
        ? 'something turns into something else'
        : m.shift
          ? 'the dream jumps'
          : air
            ? `"${air}"`
            : undefined;
    m.stageable = read ? read.ok : !why;
    if (!m.stageable && why) m.why = why;
    else delete m.why;
  }
  record.hash = hash;
}

function runRules(ctx: Ctx): Violation[] {
  return RULES.flatMap((r) => r.run(ctx));
}

/**
 * The dream's story record, from its saved breakdown and its sketches' words (a sketch's words win for
 * what it shows), checked against the rules and repaired as a view. Pure: no model, no files.
 */
export function storyRecord(
  b: Breakdown,
  items: Item[] = [],
  readings?: Readings | null,
  opts: RecordOptions = {},
): { record: StoryRecord; violations: Violation[]; notes: string[] } {
  const r = readings ?? {};
  const ctx = derive(b, items, r, opts);
  const violations = runRules(ctx);
  finish(
    ctx,
    hashOf({
      b: { ...(b ?? {}), style_options: undefined },
      items: (items ?? []).map((i) => ({ id: i?.id, fields: i?.fields, status: i?.status, media: i?.mediaId })),
      readings: r,
      words: opts.words ?? null,
      style: opts.style?.name ?? null,
    }),
  );
  return { record: ctx.record, violations, notes: ctx.notes };
}

/**
 * The rules run again over a record they already repaired: nothing new is found, and what is left is
 * only what they flag or ask, which no repair can settle.
 */
export function recheckRecord(record: StoryRecord, readings?: Readings | null, opts: RecordOptions = {}): Violation[] {
  const copy = structuredClone(record);
  return runRules({
    record: copy,
    readings: readings ?? {},
    opts,
    notes: [],
    order: new Map(copy.moments.map((m, i) => [m.id, i])),
    copies: [],
  });
}

// ── reading it ──────────────────────────────────────────────────────────────

/** The changes still in force at a moment, from earlier. */
export function carried(record: StoryRecord, momentId: string): Change[] {
  const m = record.moments.find((x) => x.id === momentId);
  return (m?.carried ?? []).map((k) => record.changes[k]).filter((c): c is Change => !!c);
}

/**
 * How someone or something looks just before a change, for its in-between picture: its look and the
 * changes in force by then, without the part the change replaces. The age ghost kept "adult" and "the
 * same face, build and hair", both fighting the change to a child, and failed (grandma's kitchen, 26
 * Sep): an age or size change also leaves out face and build. A turning replaces the whole of them.
 */
export function lookBefore(
  record: StoryRecord,
  changeKey: string,
): { of: string; becomes?: string; facts: Fact[] } | null {
  const c = record.changes[changeKey];
  const e = c ? record.elements[c.who] : undefined;
  if (!c || !e) return null;
  const order = new Map(record.moments.map((m, i) => [m.id, i]));
  const earlier = Object.values(record.changes)
    .filter((x) => x.who === c.who && x.kind !== 'presence' && (order.get(x.at) ?? 0) < (order.get(c.at) ?? 0))
    .filter((x) => !x.until || (order.get(x.until) ?? Infinity) > (order.get(c.at) ?? 0))
    .sort((x, y) => (order.get(x.at) ?? 0) - (order.get(y.at) ?? 0));
  const turned = earlier.filter((x) => x.kind === 'becomes').at(-1);
  if (c.kind === 'becomes') return { of: c.who, ...(turned ? { becomes: turned.now } : {}), facts: [] };
  const alive = living(e);
  const facet = facets(`${c.now} ${c.part ?? ''}`, alive);
  if (c.part === 'age' || c.part === 'size') facet.add(c.part);
  const body = c.part === 'age' || c.part === 'size';
  const facts = turned
    ? []
    : LOOK_FIELDS[group(e)].flatMap((k) =>
        (e.base[k] ?? []).filter(
          (f) =>
            ![...facets(f.text, alive)].some((x) => facet.has(x)) &&
            !restates(f.text, c, e) &&
            !(body && /\b(?:face|build|figure|height|frame|stature)\b/i.test(f.text)),
        ),
      );
  const parts = earlier
    .filter(
      (x) =>
        x.kind !== 'becomes' && x.part !== c.part && (!turned || (order.get(x.at) ?? 0) >= (order.get(turned.at) ?? 0)),
    )
    .map((x): Fact => ({ text: `${x.what} ${x.now}`, basis: x.told ? 'read' : 'guessed', from: x.key }));
  return { of: c.who, ...(turned ? { becomes: turned.now } : {}), facts: [...facts, ...parts] };
}

/**
 * One moment of the record in plain words: where it is, who and what is in it, how each looks there,
 * who holds what, and what changes here, the dreamer's own change seen through their eyes included
 * ("the dreamer looks down and sees they are little again", grandma's kitchen, 26 Sep). For a check
 * that reads a final prompt against the record.
 */
export function describeAt(record: StoryRecord, momentId: string): string {
  const m = record.moments.find((x) => x.id === momentId);
  if (!m) return '';
  const their = (e: RecElement | undefined) => (e && living(e) ? 'their' : 'its');
  const lookOf = (id: string) => {
    const e = record.elements[id];
    if (!e) return id;
    const seen = m.looks[id];
    const facts = LOOK_FIELDS[group(e)]
      .flatMap((k) => (e.base[k] ?? []).map((f) => f.text))
      .slice(0, 6)
      .join('; ');
    const now = seen?.becomes
      ? `turned into ${seen.becomes}`
      : [facts, ...Object.entries(seen?.parts ?? {}).map(([p, v]) => `${their(e)} ${p} now ${v}`)]
          .filter(Boolean)
          .join('; ');
    const held = seen?.heldBy ? `; in ${poss(record.elements[seen.heldBy]?.called ?? seen.heldBy)} hands` : '';
    return `${e.called}${e.kind === 'crowd' ? ' (a crowd)' : ''}: ${now || 'no look given'}${held}`;
  };
  const place = m.place ? `, in ${lookOf(m.place)}` : '';
  const who = m.shows.map((id) => `- ${lookOf(id)}`);
  const seenBy = m.eyes === 'dreamer' ? " Seen through the dreamer's own eyes." : '';
  const here = m.own
    .map((k) => record.changes[k])
    .filter((c): c is Change => !!c)
    .map((c) => {
      const who = record.elements[c.who];
      const name = who?.called ?? c.who;
      return c.kind === 'becomes'
        ? `- ${name} turns into ${c.now}`
        : c.kind === 'presence'
          ? `- ${name}: ${c.now}`
          : `- ${poss(name)} ${c.what} becomes ${c.now}`;
    });
  return [
    `${m.id}${place}.${seenBy}`,
    who.length ? `In it:\n${who.join('\n')}` : 'Nobody and nothing else is in it.',
    ...(here.length ? [`Changing here:\n${here.join('\n')}`] : []),
  ].join('\n');
}

/** A plan's change as a record key: who, from where, what. */
const planKey = (st: { who: string; what: string; since: string }) => `${st.who}@${st.since}:${slug(st.what)}`;
const bareKey = (k: string) => k.replace(/~\d+$/, '');

/**
 * Where the record's own and carried changes differ from the continuity plan's, moment by moment: what
 * the record would change in the plan if it were used.
 */
export function diffPlan(
  record: StoryRecord,
  plan: {
    cuts: {
      id: string;
      own: { who: string; what: string; since: string }[];
      states: { who: string; what: string; since: string }[];
    }[];
  },
): { moment: string; own: { record: string[]; plan: string[] }; carried: { record: string[]; plan: string[] } }[] {
  const out: ReturnType<typeof diffPlan> = [];
  for (const c of plan.cuts) {
    const m = record.moments.find((x) => x.id === c.id);
    const rOwn = uniq((m?.own ?? []).map(bareKey));
    const rCarried = uniq((m?.carried ?? []).map(bareKey));
    const pOwn = uniq(c.own.map(planKey));
    const pCarried = uniq(c.states.map(planKey));
    const d = {
      moment: c.id,
      own: { record: rOwn.filter((k) => !pOwn.includes(k)), plan: pOwn.filter((k) => !rOwn.includes(k)) },
      carried: {
        record: rCarried.filter((k) => !pCarried.includes(k)),
        plan: pCarried.filter((k) => !rCarried.includes(k)),
      },
    };
    if (d.own.record.length || d.own.plan.length || d.carried.record.length || d.carried.plan.length) out.push(d);
  }
  return out;
}

/**
 * Whether the record runs: off (the default: nothing is called), or in shadow beside the plan, logged
 * and changing nothing. "on" is shadow until the steps it will feed read it.
 */
export function recordMode(): 'off' | 'shadow' {
  const v = (process.env.DREAMCHAT_RECORD ?? '').trim().toLowerCase();
  return v === 'shadow' || v === 'on' ? 'shadow' : 'off';
}
