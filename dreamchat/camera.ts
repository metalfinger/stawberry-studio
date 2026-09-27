// Camera rules: film grammar over consecutive cuts, as a script supervisor and a camera operator keep
// it (docs/rules.md group A). Each rule is general, read from the floor plan, the camera placed on it
// and the story record, never from one dream:
// - a reverse angle turns the room: what is now ahead, on the picture's left and right, and behind the
//   camera, from the floor plan's walls and what is on them; and the picture before is never edited
//   into one from the other side (A2, C7);
// - the scene's line: a camera on its other side from the cut before is flagged (A1);
// - a cut to the same subject moves the camera or changes size (A3, SAME_CAMERA);
// - through the dreamer's eyes at most their hands and arms show, and only where they do something
//   with them; a held thing is in their hands, before them (A4);
// - what is seen out past a place never stands inside it (A6);
// - the mock-up's heights follow the record: the water's level, a boat afloat on it (B1);
// - the moment after a jump in the same place is that place, not another (continuity.ts relationIn).
//
// Pure: no model, no files. Behind DREAMCHAT_CAMERA=on, which needs DREAMCHAT_CUT_SHEET=on: what the
// rules say reaches the prompt through the cut sheet alone. Off, every plan, sheet and prompt is today's.
import { type Blocking, type Eye, roomOf, type Side, sizeOf, type Spot } from './blocking';

let warned = false;

/**
 * Whether the camera rules run: off (the default) or on. They need the cut sheet on
 * (DREAMCHAT_CUT_SHEET=on), the one place what they say reaches the prompt from: asked for without it,
 * they stay off, and say so once. Half on, the floor plans moved while the prompts said nothing of it.
 */
export function cameraMode(): 'off' | 'on' {
  if ((process.env.DREAMCHAT_CAMERA ?? '').trim().toLowerCase() !== 'on') return 'off';
  if ((process.env.DREAMCHAT_CUT_SHEET ?? '').trim().toLowerCase() === 'on') return 'on';
  if (!warned) {
    warned = true;
    console.warn('DREAMCHAT_CAMERA=on needs DREAMCHAT_CUT_SHEET=on: the camera rules stay off');
  }
  return 'off';
}

// ── a view, and the brief written for it ─────────────────────────────────────────────────────────

/** The two claims the camera rules take out of a view where they are untrue: nothing else in it changes. */
const CLAIMS = / ?(?:Nobody else is in the picture\.|They keep these places in every picture of this scene\.)/g;

/** A span of the picture said from one band to the same band, as it was said before the camera rules. */
const SPAN = /filling the picture from (a third of the way down|its middle) to \1/g;
/** The same span as the camera rules say it (previs.ts filling): around there. */
const bandOf = (v: string) => v.replace(SPAN, (_, x: string) => `filling the picture around ${x}`);

/**
 * Whether a shot's brief, written for one view, still serves another: the same view, or, with the camera
 * rules, a view that differs only in the claims they take out ("Nobody else is in the picture" beside a
 * crowd, "They keep these places" across a crossing), or in a span they say as around one place. Without it,
 * the brief was lost for those alone.
 */
export function sameView(a: string | undefined, b: string | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || cameraMode() !== 'on') return false;
  return bandOf(a.replace(CLAIMS, '')) === bandOf(b.replace(CLAIMS, ''));
}

// ── how far a camera turned, and whether two are the same ────────────────────────────────────────

/** Degrees between two cameras' ways of looking. */
export function turnedBetween(a: Pick<Eye, 'd'>, b: Pick<Eye, 'd'>): number {
  const n = (v: { x: number; y: number }) => Math.hypot(v.x, v.y) || 1;
  const cos = (a.d.x * b.d.x + a.d.y * b.d.y) / (n(a.d) * n(b.d));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Under this many degrees apart, two cameras on one floor plan face the same side of the place. */
export const SAME_SIDE_DEGREES = 60;

/** Degrees the camera turns from the cut before for a cut to be a reverse angle. */
export const REVERSE_DEGREES = 135;

/**
 * The same camera, as the tree reads it (tree.ts SAME_CAMERA): within 0.6 metres and ten degrees of the
 * other, at the same height give or take half a metre. A cut to the same subject from it, at the same
 * size, is the same picture again.
 */
export function sameCameraAs(a: Eye, b: Eye): boolean {
  return (
    Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) <= 0.6 &&
    turnedBetween(a, b) <= 10 &&
    Math.abs((a.height ?? 0) - (b.height ?? 0)) < 0.5
  );
}

/** Which side of the line from `a` to `b` a point is on, in metres: its sign is the side. */
export function signedFromLine(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

/** Metres: a camera this close to the line's axis is on it, on neither side (tree.ts LINE_ON). */
export const ON_THE_LINE = 0.5;

// ── the place's walls and what is on them ─────────────────────────────────────────────────────────

/**
 * Windows and doors a place's own words put on its walls, for someone facing its front: "a row of
 * windows along each side" is on its left and right walls, "windows all round" on every wall, "a door
 * at the far end" on its back wall. An opening its words place nowhere is left out: guessed onto a wall,
 * it would be said where it is not.
 */
export type Opening = { what: string; walls: Side[] };

const OPENING = /\b(windows?|doors?|doorways?|portholes?|shutters?)\b/i;
const WALL_WORDS: [RegExp, Side[]][] = [
  [
    /\b(?:all (?:the way )?(?:round|around)|on every (?:side|wall)|on all (?:sides|walls)|around the room|round the room)\b/i,
    ['front', 'back', 'left', 'right'],
  ],
  [
    /\b(?:along|on|down|in|lining)\s+(?:each|both|either)\s+(?:side|wall)s?\b|\bon both sides\b|\bon either side\b/i,
    ['left', 'right'],
  ],
  [/\b(?:on|along|down|in)\s+the\s+left(?:\s+(?:side|wall|hand side))?\b|\bleft[- ]hand (?:side|wall)\b/i, ['left']],
  [/\b(?:on|along|down|in)\s+the\s+right(?:\s+(?:side|wall|hand side))?\b|\bright[- ]hand (?:side|wall)\b/i, ['right']],
  [/\b(?:at|in|on)\s+the\s+(?:far|back|rear)\s+(?:end|wall|side)\b|\bat the back\b/i, ['back']],
];

export function openingsIn(words: string): Opening[] {
  const out: Opening[] = [];
  for (const clause of words.split(/[;.]|,\s+(?=and\b|with\b|a\b|an\b|the\b)/i)) {
    const m = clause.match(OPENING);
    if (!m) continue;
    const walls = WALL_WORDS.find(([re]) => re.test(clause))?.[1];
    if (!walls) continue;
    const what = m[1].toLowerCase();
    const prev = out.find((o) => o.what === what);
    if (prev) prev.walls = [...new Set([...prev.walls, ...walls])];
    else out.push({ what, walls: [...walls] });
  }
  return out;
}

/** Which wall of a room a spot stands against, within half a metre of it; none in its middle. */
export function wallOf(s: Pick<Spot, 'x' | 'y'>, plan: Pick<Blocking, 'room'>): Side | null {
  const [w, d] = roomOf(plan);
  const gaps: [Side, number][] = [
    ['front', s.y],
    ['back', d - s.y],
    ['left', s.x],
    ['right', w - s.x],
  ];
  const [side, gap] = gaps.reduce((a, b) => (b[1] < a[1] ? b : a));
  return gap <= 0.5 ? side : null;
}

/** A fixture that is an opening in a wall: a window, a door. */
export const isOpening = (s: Spot) =>
  !!s.fixture && !!s.name && OPENING.test(s.name) && !/windshield|windscreen/i.test(s.name);

/** A fixture that is a window, which what is out past the place is seen through. */
export const isWindow = (s: Spot) => !!s.fixture && !!s.name && /\bwindows?\b/i.test(s.name);

/**
 * What stands in a wall where a window is, or past it: out past the place, seen through the window. A
 * thing (never a person, a fixture or what someone holds) whose spot is on the line of a wall with a
 * window, within the window's width, or beyond the room: it cannot be standing in the room. The red
 * tractor seen through the round room's window was put on its plan in the window, and drawn standing in
 * the room (lighthouse, 26 Sep). A telescope or a plant standing in the room at a window stays in the
 * room, whatever a moment looking out of it says. A plan made since keeps such things off it
 * (`outside`); one made before is read so.
 */
export function outThroughWindows(plan: Blocking): Record<string, Side> {
  const out: Record<string, Side> = {};
  if (!plan.indoors) return out;
  const [w, d] = roomOf(plan);
  const windows = plan.spots.filter((s) => isWindow(s) && wallOf(s, plan));
  // How far in from a wall, or out past it (negative), a point is.
  const inFrom = (side: Side, p: Pick<Spot, 'x' | 'y'>) =>
    side === 'front' ? p.y : side === 'back' ? d - p.y : side === 'left' ? p.x : w - p.x;
  // Along the wall: how far a point is from the window's middle.
  const along = (side: Side, p: Pick<Spot, 'x' | 'y'>, win: Spot) =>
    side === 'front' || side === 'back' ? Math.abs(p.x - win.x) : Math.abs(p.y - win.y);
  for (const s of plan.spots) {
    if (s.fixture || s.heldBy || s.kind === 'person' || s.many) continue;
    for (const win of windows) {
      const side = wallOf(win, plan)!;
      if (inFrom(side, s) <= 0.1 && along(side, s, win) <= Math.max(0.3, sizeOf(win)[0] / 2)) {
        out[s.id] = side;
        break;
      }
    }
  }
  return out;
}

// ── water, and what floats on it ─────────────────────────────────────────────────────────────────

/** A part of a place that is water: its level is the water's. */
export const WATER = /\b(?:water|waters|flood|floodwater|floodwaters|sea|tide)\b/i;

/** Body words for how deep water is on someone standing in it, in metres. */
const BODY: [RegExp, number][] = [
  [/\bankles?\b/i, 0.12],
  [/\bknees?\b/i, 0.5],
  [/\b(?:waists?|hips?)\b/i, 1],
  [/\bchests?\b/i, 1.3],
  [/\b(?:shoulders?|necks?|chins?)\b/i, 1.45],
];

/** Words that say the water is deep, or fills the whole place, without saying how deep: never a thin layer. */
const DEEP =
  /\b(?:deep enough|fills?|filled|filling|floods?|flooded|flooding|drowned|drowning|underwater|under water|submerged|submerging)\b/i;

/**
 * How high water stands, in metres, from what the story record says of it (its water, a typed part of
 * the place, in the record's words) and the floor plan: by the things those words measure it by, a
 * fixture or thing of the plan ("up to the high round window", "over the tops of the desks", "covering
 * the shelves"), the ceiling of a room ("almost to the ceiling") or a body ("knee-deep"). "Over", "above"
 * or "covering" a thing is a little above its top, "almost" or "nearly" a little below. The first thing
 * named measures it; a later one only where the words measure by it too ("over the desks and far up the
 * shelves": as high as the shelves), and then the highest stands. A creature of the dream it is said to be
 * deep enough for (`beings`: "deep enough to hide a whale below the surface") is under it. Only where
 * nothing else measures it, a floor or the ground it covers: a few centimetres. Water that fills a
 * place, floods it or is deep enough to swim in, without a measure, is unmeasured: none, and nothing is
 * said of its height (a boat afloat on ten centimetres, or an underwater classroom said to have water
 * over its floor, is worse than nothing).
 */
export function waterLevel(
  words: string,
  plan: Blocking,
  beings: { name: string; height: number }[] = [],
): number | null {
  const text = words.toLowerCase();
  // Only a room has a ceiling: out in the open, a roof is somewhere to stand, and the water has no cap.
  const ceiling = plan.indoors ? (plan.ceiling ?? 3.2) : Number.POSITIVE_INFINITY;
  const marks: { at: number; top: number; thing?: boolean; being?: boolean }[] = [];
  const ceil = plan.indoors ? text.search(/\b(?:ceiling|top of the room|roof)\b/) : -1;
  if (ceil >= 0) marks.push({ at: ceil, top: ceiling });
  for (const [re, h] of BODY) {
    const i = text.search(re);
    if (i >= 0) marks.push({ at: i, top: h });
  }
  for (const s of plan.spots) {
    // Nor is what floats on it a measure of it ("the sea laps at the boat"), nor ground it fills ("filling
    // the aisles"): that is where it is, not how high.
    if (s.kind === 'person' || s.many || s.heldBy || s.shape === 'vehicle' || s.shape === 'ground') continue;
    if (sizeOf(s)[2] < 0.2) continue;
    const name = (s.name ?? '').toLowerCase().replace(/^(the|a|an)\s+/, '');
    // What a fixture is called by: its first word that says what it is ("desk with green lamp": desk).
    const head = name
      .split(/\s(?:with|on|in|of|at|by|near|from|beside)\s/)[0]
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const key = head.at(-1)?.replace(/s$/, '');
    if (!key) continue;
    const i = text.search(new RegExp(`\\b${key.replace(/[^a-z0-9]/g, '')}(?:e?s)?\\b`));
    if (i >= 0) marks.push({ at: i, top: sizeOf(s)[2], thing: true });
  }
  // The words just before a mark, back to the clause or the "and" before it: in "covering the floor and
  // up to the shelves" the shelves are reached ("up to"), and "covering" is the floor's.
  const beforeOf = (m: { at: number }) =>
    text
      .slice(Math.max(0, m.at - 32), m.at)
      .split(/,|;|\band\b/)
      .at(-1) ?? '';
  // A creature it is deep enough for is under it: a little over its back.
  for (const x of beings) {
    const key = headWord(x.name);
    if (!key) continue;
    const i = text.search(new RegExp(`\\b${key}(?:e?s)?\\b`));
    if (
      i >= 0 &&
      /\bdeep enough\b/.test(
        text
          .slice(Math.max(0, i - 40), i)
          .split(/[,;]/)
          .at(-1) ?? '',
      )
    )
      marks.push({ at: i, top: x.height, being: true });
  }
  // A thing the water comes in under, through or from is where it comes from, not how high it is: "coming
  // in under the doors, rising over the desks" stands over the desks.
  const from = (m: { at: number }) =>
    /\b(?:under|beneath|below|through|from|out of|into|in at|between|among|along|around)\s+(?:the\s+|a\s+|an\s+)?$/.test(
      text.slice(Math.max(0, m.at - 16), m.at),
    );
  // Only where nothing else measures it: water over the floor or the ground stands a few centimetres
  // deep, unless the words say it is deep ("the floor is flooded, deep enough to swim": unmeasured).
  // "The floor of the hall is flooded, water up to their waists" is waist deep.
  const floor = text.search(/\b(?:floor|floors|ground)\b/);
  const measures = marks.sort((a, b) => a.at - b.at).filter((m) => !from(m));
  const first = measures[0];
  if (!first) return floor >= 0 && !DEEP.test(text) ? 0.1 : null;
  const levelOf = (m: (typeof marks)[number]) => {
    const before = beforeOf(m);
    const almost = /\b(?:almost|nearly|just below|not quite|close to)\b/.test(before);
    const over =
      !!m.being ||
      /\b(?:over|above|past|higher than|beyond|tops? of|covering|covers|covered|submerging|submerged)\b/.test(before);
    // Water covering the floor "and up to the shelves" has spread to them, across the floor: a thing it
    // reaches is a height only where the words say how high (over it, the top of it, almost up to it).
    const across = !!m.thing && !almost && !over && floor >= 0;
    return across ? 0.1 : almost ? m.top - 0.2 : over ? m.top + 0.2 : m.top;
  };
  // A later thing named measures it too only where the words measure by it ("and far up the shelves");
  // named for what stands in it ("and the shelves stand in it"), it does not.
  const level = Math.max(
    ...measures.filter((m) => m === first || m.being || HEIGHT_WORD.test(beforeOf(m))).map(levelOf),
  );
  return Math.max(0.05, Math.min(ceiling - 0.1, Math.round(level * 100) / 100));
}

/** Words that measure water by what follows them: over it, up it, almost to it, reaching it. */
const HEIGHT_WORD =
  /\b(?:over|above|past|beyond|higher than|tops? of|cover\w*|submerg\w*|up|almost|nearly|reach\w*|halfway)\b/;

/** What a name is called by: its last word before any "with", "of" or the like ("desk with green lamp": desk). */
function headWord(name: string): string | undefined {
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^\s*(?:the|a|an)\s+/, '')
    .split(/\s(?:with|on|in|of|at|by|near|from|beside|who|that)\s/)[0]
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .at(-1)
    ?.replace(/s$/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** A measure in a look: a number, a unit and what it measures ("about 60 feet long", "2 metres tall"). */
const MEASURE = /\b(\d+(?:\.\d+)?)\s*-?\s*(feet|foot|ft|metres?|meters?|m)\b(?:\s+(tall|high|long|in length))?/gi;
/** A clause of a look that opens by saying how big they are: far bigger than a person. */
const HUGE =
  /^(?:(?:a|an|the)\s+)?(?:(?:very|so|really|extremely|incredibly|truly)\s+(?:big|large)|huge|giant|gigantic|enormous|massive|colossal|immense|monstrous|towering)\b/;

/**
 * How high a creature's body stands, in metres, where its look says how big it is (the camera rules): a
 * measure of how tall, or of how long (a body a fifth as deep as it is long), or, opening a clause of its
 * look, a word saying it is far bigger than a person ("very big, fills the whole aisle": two metres at
 * least). Nothing where its look says neither: a person of the plan is as tall as their pose. A whale lying
 * in a metre of water was said to be all of it below the surface, under the boat (library, 27 Sep).
 */
export function bodyHeight(look: string): number | null {
  let h: number | null = null;
  for (const m of look.matchAll(MEASURE)) {
    const n = Number(m[1]) * (/^f/i.test(m[2]) ? 0.3048 : 1);
    const v = /long|length/i.test(m[3] ?? '') ? n / 5 : /tall|high/i.test(m[3] ?? '') ? n : null;
    if (v !== null) h = Math.max(h ?? 0, Math.round(v * 100) / 100);
  }
  if (
    look
      .toLowerCase()
      .split(/[,;.]/)
      .some((c) => HUGE.test(c.trim()))
  )
    h = Math.max(h ?? 0, 2);
  return h;
}

// ── a vehicle on the move ────────────────────────────────────────────────────────────────────────

/** Words of going: a vehicle driven, ridden, rowed or sailed, or going on its own. */
const GOING =
  /^(?:drives?|driving|drove|rides?|riding|rode|rows?|rowing|rowed|sails?|sailing|sailed|pedal(?:s|led|ling|ed|ing)?|steers?|steering|rolls?|rolling|speeds?|speeding|races?|racing|travels?|travell?ing|heads?|heading|goes|going|went|moves?|moving|floats?|floating|drifts?|drifting|glides?|gliding|flies|flying|chugs?|chugging|rumbles?|rumbling|rushes|rushing|rushed|zooms?|zooming|hurtles?|hurtling|trundles?|trundling|clatters?|clattering|cruises?|cruising|crawls?|crawling|swerves?|swerving|bounces?|bouncing|pulls? (?:away|out|off)|sets? off|carries|carrying|takes|taking)$/i;
/** Someone driving, riding, rowing or pedalling it: what they drive or ride goes. */
const PROPELLED =
  /^(?:drives?|driving|drove|rides?|riding|rode|rows?|rowing|rowed|pedal(?:s|led|ling|ed|ing)?|sails?|sailing|sailed|steers?|steering|paddles?|paddling)$/i;
/** Words of stopping: then it goes nowhere. */
const STOPPING =
  /\b(?:stops?|stopped|stopping|halts?|halted|parks?|parked|pulls? up|comes? to (?:a stop|rest)|stands? still|sits? still|waits?|waiting|moored|docked|arrives?|arrived)\b/i;

/**
 * Whether a moment's own words have a vehicle going: it goes itself, named just before a word of going
 * ("the train rumbles over the bridge"), or someone drives, rides or rows it, named just after ("rows the
 * boat"); or, where a clause names no vehicle at all, someone drives, rides, rows or pedals ("the sister
 * pedalling", "they ride over the bridge"). And no clause stops it. Its heading is said only then: a
 * boat held at a window while the sister opens it, a tractor that "slows and stops", or a car ridden
 * past ("rides the bicycle past the old car") goes nowhere.
 */
export function goingIn(words: string, name: string, others: string[] = []): boolean {
  const headOf = (n: string) =>
    n
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/^\s*(the|a|an)\s+/, '')
      .trim()
      .split(/\s+/)
      .at(-1)
      ?.replace(/[^a-z0-9]/g, '');
  const head = headOf(name);
  if (!head) return false;
  const isHead = (w: string) => w === head || w === `${head}s` || w === `${head}es`;
  const otherHeads = others.map(headOf).filter((h): h is string => !!h && h !== head);
  let going = false;
  for (const said of words.toLowerCase().split(/[;.]|,\s+(?=and\b|but\b|then\b)/)) {
    // A word of going that is part of its name ("a rowing boat", "a racing car") is no going.
    const clause = said.replace(new RegExp(`\\b\\w+ing\\s+(${head}(?:e?s)?)\\b`, 'g'), '$1');
    const w = clause.split(/[^a-z0-9']+/).filter(Boolean);
    const at = w.map((x, i) => (isHead(x) ? i : -1)).filter((i) => i >= 0);
    const two = (i: number) => (i + 1 < w.length ? `${w[i]} ${w[i + 1]}` : w[i]);
    const verb = (i: number) => GOING.test(w[i]) || GOING.test(two(i));
    if (at.length) {
      if (STOPPING.test(clause)) return false;
      // Itself going: a word of going within the few words after its name.
      if (at.some((h) => w.slice(h + 1, h + 7).some((_, k) => verb(h + 1 + k)))) going = true;
      // Driven or ridden: a word of driving within the three words before its name.
      if (at.some((h) => w.slice(Math.max(0, h - 3), h).some((x) => PROPELLED.test(x)))) going = true;
    } else if (w.some((x) => PROPELLED.test(x)) && !w.some((x) => otherHeads.some((o) => x === o || x === `${o}s`))) {
      // Named nowhere in the clause, nor any other vehicle: whoever drives, rides or rows here is on it.
      if (STOPPING.test(clause)) return false;
      going = true;
    }
  }
  return going;
}

// ── through the dreamer's eyes ───────────────────────────────────────────────────────────────────

/**
 * Doing something with their hands: what the dreamer's hands do, as a moment's words say it. A few words
 * that are hands only with some objects: holding their breath or holding still is not holding
 * anything, taking a step or a seat takes nothing in the hands, and "hands" as a verb is handing
 * something over.
 */
const NOT_HANDS_AFTER =
  '(?!\\s+(?:their|your|his|her|my|its|a|one|the)?\\s*(?:breath|breaths|still|step|steps|seat|look|glance|moment|turn|walk|place|part|time|shape|flight|off)\\b)';
const HAND_VERB = `(?:(?:hold|holds|holding|held|take|takes|taking|took)${NOT_HANDS_AFTER}|(?:hand|hands|handing|handed)\\s+(?:over|it|them|him|her|back)|touch|touches|touching|reach|reaches|reaching|reached|grab|grabs|grabbing|grip|grips|gripping|push|pushes|pushing|pull|pulls|pulling|open|opens|opening|opened|closes|closing|shuts|carry|carries|carrying|pick|picks|picking|give|gives|giving|stroke|strokes|stroking|pat|pats|patting|lift|lifts|lifting|put|puts|putting|press|presses|pressing|knock|knocks|knocking|wave|waves|waving|point|points|pointing|write|writes|writing|fold|folds|folding|cradle|cradles|cradling|row|rows|rowing|climb|climbs|climbing|drive|drives|driving|steer|steers|steering|throw|throws|throwing|threw|catch|catches|catching|caught|eat|eats|eating|ate|drink|drinks|drinking|pour|pours|pouring|pedal|pedals|pedalling|pedaling|paddle|paddles|paddling|swim|swims|swimming|unlock|unlocks|unlocking|lets? go|hug|hugs|hugging|shake|shakes|shaking|brush|brushes|brushing|wipe|wipes|wiping|type|types|typing|draw|draws|drawing|tie|ties|tying|dig|digs|digging)`;

/**
 * Whether a moment seen through the dreamer's eyes is of their own body: they look down at themselves
 * ("their own small body and the gray cardigan", the kitchen that shrank, 26 Sep). Then it shows, as
 * they see it; never their face. A reflection is not it: seen in a mirror, it is a picture of them.
 */
export function selfIn(words: string[]): boolean {
  const text = words.join(' ');
  return (
    /\b(?:their|your|my|the dreamer's)\s+own\s+(?:\w+\s+)?(?:body|bodies|legs|feet|hands|arms|clothes)\b/i.test(text) ||
    /\blooks? down at (?:themselves|yourself|myself)\b/i.test(text)
  );
}

/**
 * Whether the dreamer's own hands are in a moment seen through their eyes: the dreamer does something
 * with them, alone or with someone ("the dreamer opens the door", "the dreamer and the sister row"),
 * their hand or arm is named in a clause about them ("the boat in their hand"), they are at the controls
 * of what they ride ("at the wheel"), or they hold something. A gate opening on its own has no hands in
 * it, and a dreamer looking for someone shows nothing of themselves (the lift, 26 Sep: "legs and all
 * should not be visible").
 */
export function handsIn(words: string[], holds: boolean): boolean {
  if (holds) return true;
  // The dreamer doing it: "they are close to the edge" is where they are, not a hand closing.
  const who = "(?:the dreamer|you|they|i)(?:\\s+and\\s+(?:the\\s+|their\\s+|your\\s+|my\\s+)?[\\w']+)?";
  const does = new RegExp(`(?:^|[^\\w'])${who}\\s+(?:(?!(?:are|is|was|were|am)\\b)\\w+\\s+){0,2}?${HAND_VERB}\\b`, 'i');
  // "Their hand" is the dreamer's only in a clause about the dreamer: "Mara folds their arms" is hers.
  const own = /\b(?:the dreamer's|your|my)\s+(?:own\s+)?(?:\w+\s+)?(?:hands?|arms?|fingers?|palms?)\b/i;
  const their = /\btheir\s+(?:own\s+)?(?:\w+\s+)?(?:hands?|arms?|fingers?|palms?)\b/i;
  const controls = /\b(?:at|on|behind)\s+the\s+(?:steering\s+)?(?:wheel|helm|oars|tiller|controls|handlebars|reins)\b/i;
  const aboutThem = /^\s*(?:the dreamer|you|they|i)\b|\bthe dreamer\b/i;
  return words
    .join('. ')
    .split(/[;.]|,\s+(?=and\b|but\b|then\b|while\b|as\b)/)
    .some((c) => does.test(c) || own.test(c) || ((their.test(c) || controls.test(c)) && aboutThem.test(c)));
}

// ── a reverse angle: the room turned ─────────────────────────────────────────────────────────────

/** A wall as a picture is told it: the place's front by its name, the other walls by what they are. */
export type WallSeen = { wall: Side; where: 'ahead' | 'left' | 'right' | 'behind' | 'out' };

/**
 * The room as a reverse angle shows it: which of its walls is ahead, on the picture's left and right,
 * behind the camera, or out of the picture, each with the openings its words or its fixtures put on
 * it (only where it is in the picture); and what the picture before faced, now behind the camera.
 */
export type RoomTurn = {
  /** The picture before, by its number in the story. */
  from: number;
  ahead: string | null;
  left: string[];
  right: string[];
  behind: string[];
  /** Walls out of the picture to one side: said as out of it, never which side. */
  out: string[];
  /** What the picture before faced, where it is behind the camera now. */
  faced: string | null;
  /** A room, or a place in the open. */
  indoors: boolean;
};

/**
 * The walls of a place in words, for a reverse angle: its front by its own name, its back as the back,
 * the two side walls as side walls (never by left and right: turned round, the room's left is the
 * picture's right, and "the left wall on the right" is read as a contradiction).
 */
export function roomTurn(x: {
  plan: Blocking;
  walls: WallSeen[];
  from: number;
  /** The place's own words, for where its windows and doors are. */
  look: string;
  place: string;
  /** Which side of the place the picture before faced. */
  prevFaced: Side | null;
}): RoomTurn {
  const { plan } = x;
  const openings = openingsIn(x.look);
  const fixtures = plan.spots.filter(isOpening);
  const on = (w: Side) => {
    const said = openings.filter((o) => o.walls.includes(w)).map((o) => o.what);
    const fixed = fixtures.filter((f) => wallOf(f, plan) === w).map((f) => f.name as string);
    return [...new Set([...said.map((o) => `its ${o}`), ...fixed])];
  };
  const sides = x.walls.filter((w) => w.wall === 'left' || w.wall === 'right');
  const nameOf = (w: WallSeen, withOpenings: boolean): string => {
    const base =
      w.wall === 'front'
        ? plan.front
        : w.wall === 'back'
          ? plan.indoors
            ? 'the back of the room'
            : `the far side of the place, away from ${plan.front}`
          : `a side wall of ${x.place}`;
    // Outdoors a side is a way of looking, with no wall to have a window in.
    // An opening the wall is already named by ("the wall with the doors") is not said again.
    const named = new Set(base.toLowerCase().match(/[a-z]+/g) ?? []);
    const has = (withOpenings && plan.indoors ? on(w.wall) : []).filter(
      (o) => !(o.toLowerCase().match(/[a-z]+/g) ?? []).filter((t) => t.length > 3).every((t) => named.has(t)),
    );
    return has.length ? `${base}, with ${has.join(' and ')}` : base;
  };
  const shown = (where: WallSeen['where']) => x.walls.filter((w) => w.where === where);
  const inIt = (w: WallSeen) => w.where === 'ahead' || w.where === 'left' || w.where === 'right';
  const ahead = shown('ahead')[0];
  const isSide = (w: Side) => w === 'left' || w === 'right';
  // Two side walls are never both "a side wall": the one behind is the other one.
  const faced =
    x.prevFaced && x.walls.some((w) => w.wall === x.prevFaced && w.where === 'behind')
      ? isSide(x.prevFaced) && sides.some(inIt)
        ? 'the other side wall'
        : nameOf({ wall: x.prevFaced, where: 'behind' }, false)
      : null;
  return {
    from: x.from,
    ahead: ahead ? nameOf(ahead, true) : null,
    left: shown('left').map((w) => nameOf(w, true)),
    right: shown('right').map((w) => nameOf(w, true)),
    behind: shown('behind')
      .filter((w) => w.wall !== x.prevFaced)
      .map((w) => nameOf(w, false)),
    out: x.walls
      .filter((w) => w.where === 'out' && !inIt(w))
      .map((w) =>
        w.wall === 'left' || w.wall === 'right'
          ? sides.some(inIt)
            ? 'the other side wall'
            : 'the side walls'
          : nameOf(w, false),
      )
      .filter((v, i, a) => a.indexOf(v) === i),
    faced,
    indoors: !!plan.indoors,
  };
}

/** A reverse angle's room, in one sentence for the shot. */
export function sayTurn(t: RoomTurn): string {
  const parts = [
    ...(t.ahead ? [`ahead is ${t.ahead}`] : []),
    ...t.left.map((w) => `on the left of the picture, ${w}`),
    ...t.right.map((w) => `on the right of the picture, ${w}`),
    ...(t.faced ? [`behind the camera, ${t.faced}, which picture ${t.from} faced`] : []),
    ...(t.behind.length ? [`behind the camera, ${t.behind.join(' and ')}`] : []),
  ];
  const out = t.out.length
    ? ` ${cap(t.out.join(' and '))} ${t.out.length > 1 || /walls$/.test(t.out[0]) ? 'are' : 'is'} out of the picture.`
    : '';
  return parts.length
    ? `The camera has turned round from picture ${t.from}, and the ${t.indoors ? 'room' : 'place'} with it: ${parts.join('; ')}.${out}`
    : '';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
