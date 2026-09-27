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

// ── how far a camera turned, and whether two are the same ────────────────────────────────────────

/** Degrees between two cameras' ways of looking. */
export function turnedBetween(a: Pick<Eye, 'd'>, b: Pick<Eye, 'd'>): number {
  const n = (v: { x: number; y: number }) => Math.hypot(v.x, v.y) || 1;
  const cos = (a.d.x * b.d.x + a.d.y * b.d.y) / (n(a.d) * n(b.d));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Under this many degrees apart, two cameras on one floor plan face the same side of the place. */
export const SAME_SIDE_DEGREES = 60;

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
 * What stands where only a window is, out past the place: a thing (never a person, a fixture or what
 * someone holds) put on the footprint of a window in a wall, that the story itself sees out there
 * (`seenOut`: shown by a moment of the place that looks out of it). The red tractor seen through the
 * round room's window was put on its plan at the window, and drawn standing in the room (lighthouse,
 * 26 Sep). A telescope or a plant standing at a window stays in the room. A plan made since keeps such
 * things off it (`outside`); one made before is read so.
 */
export function outThroughWindows(plan: Blocking, seenOut: Set<string>): Record<string, Side> {
  const out: Record<string, Side> = {};
  if (!plan.indoors) return out;
  const windows = plan.spots.filter((s) => isWindow(s) && wallOf(s, plan));
  for (const s of plan.spots) {
    if (s.fixture || s.heldBy || s.kind === 'person' || s.many || !seenOut.has(s.id)) continue;
    const w = windows.find((x) => Math.hypot(x.x - s.x, x.y - s.y) <= Math.max(0.3, sizeOf(x)[0] / 2));
    const side = w ? wallOf(w, plan) : null;
    if (side) out[s.id] = side;
  }
  return out;
}

/**
 * A moment that looks out of the place, through a window or past its edge: what it shows is seen out
 * there. As the moment's words say it, or as Jev read where its camera looks ("beyond").
 */
export const LOOKS_OUT =
  /\b(?:looks? out|looking out|out (?:of|through) the windows?|out the windows?|through the windows?|outside the windows?|beyond the windows?|out past)\b/i;

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

/**
 * How high water stands, in metres, from what the record says of it and the floor plan: by the first
 * thing its words measure it by, a fixture or thing of the plan ("up to the high round window",
 * "over the tops of the desks"), the ceiling ("almost to the ceiling") or a body ("knee-deep"). "Over"
 * or "above" a thing is a little above its top, "almost" or "nearly" a little below; unmeasured
 * ("rising", "deep enough for a whale") it is none.
 */
export function waterLevel(words: string, plan: Blocking): number | null {
  const text = words.toLowerCase();
  // Only a room has a ceiling: out in the open, a roof is somewhere to stand, and the water has no cap.
  const ceiling = plan.indoors ? (plan.ceiling ?? 3.2) : Number.POSITIVE_INFINITY;
  const marks: { at: number; top: number; thing?: boolean }[] = [];
  const ceil = plan.indoors ? text.search(/\b(?:ceiling|top of the room|roof)\b/) : -1;
  if (ceil >= 0) marks.push({ at: ceil, top: ceiling });
  for (const [re, h] of BODY) {
    const i = text.search(re);
    if (i >= 0) marks.push({ at: i, top: h });
  }
  for (const s of plan.spots) {
    // Nor is what floats on it a measure of it: "the sea laps at the boat".
    if (s.kind === 'person' || s.many || s.heldBy || s.shape === 'vehicle') continue;
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
  // A thing the water comes in under, through or from is where it comes from, not how high it is: "coming
  // in under the doors, rising over the desks" stands over the desks.
  const from = (m: { at: number }) =>
    /\b(?:under|beneath|below|through|from|out of|into|in at)\s+(?:the\s+|a\s+|an\s+)?$/.test(
      text.slice(Math.max(0, m.at - 16), m.at),
    );
  // Only where nothing measures it: water covering the floor or the ground, or filling the place, stands
  // a few centimetres over it. "The floor is flooded, water up to their waists" is waist deep.
  const floor = text.search(
    /\b(?:floor|floors|ground)\b|\b(?:fills?|filled|filling|floods?|flooded|flooding|covers?|covered|covering)\s+(?:the\s+)?\w+/,
  );
  const first = marks.sort((a, b) => a.at - b.at).find((m) => !from(m));
  if (!first) return floor >= 0 ? 0.1 : null;
  const before = text.slice(Math.max(0, first.at - 32), first.at);
  const almost = /\b(?:almost|nearly|just below|not quite|close to)\b/.test(before);
  const over = /\b(?:over|above|past|higher than|beyond|tops? of)\b/.test(before);
  // Water covering the floor "and up to the shelves" has spread to them, across the floor: a thing it
  // reaches is a height only where the words say how high (over it, the top of it, almost up to it).
  const across = !!first.thing && !almost && !over && floor >= 0;
  const level = across ? 0.1 : almost ? first.top - 0.2 : over ? first.top + 0.2 : first.top;
  return Math.max(0.05, Math.min(ceiling - 0.1, Math.round(level * 100) / 100));
}

// ── a vehicle on the move ────────────────────────────────────────────────────────────────────────

/** Words of going: a vehicle driven, ridden, rowed or sailed, or going on its own. */
const GOING =
  /\b(?:drives?|driving|drove|rides?|riding|rode|rows?|rowing|rowed|sails?|sailing|sailed|pedal(?:s|led|ling|ed|ing)?|steers?|steering|rolls?|rolling|speeds?|speeding|races?|racing|travels?|travell?ing|heads?|heading|goes|going|went|moves?|moving|floats? (?:off|away|out|along|down|through)|drifts?|drifting|glides?|gliding|flies|flying|chugs?|chugging)\b/i;
/** Someone driving, riding, rowing or pedalling: the vehicle they are on goes. */
const PROPELLED =
  /\b(?:drives?|driving|drove|rides?|riding|rode|rows?|rowing|rowed|pedal(?:s|led|ling|ed|ing)?|sails?|sailing|steers?|steering)\b/i;
/** Words of stopping: then it goes nowhere. */
const STOPPING =
  /\b(?:stops?|stopped|stopping|halts?|halted|parks?|parked|pulls? up|comes? to (?:a stop|rest)|stands? still|waits?|waiting|moored|docked|arrives?|arrived)\b/i;

/**
 * Whether a moment's own words have a vehicle going: a clause that names it with a word of going, or
 * someone driving, riding, rowing or pedalling ("the sister pedalling", "they ride over the bridge"),
 * and no clause stopping it. Its heading is said only then: a boat held at a window while the sister
 * opens it, or a tractor that "slows and stops", goes nowhere.
 */
export function goingIn(words: string, name: string): boolean {
  const head = name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^\s*(the|a|an)\s+/, '')
    .trim()
    .split(/\s+/)
    .at(-1)
    ?.replace(/[^a-z0-9]/g, '');
  let going = false;
  for (const said of words.split(/[;.]|,\s+(?=and\b|but\b|then\b)/)) {
    // A word of going that is part of its name ("a rowing boat", "a racing car") is no going.
    const clause = head ? said.replace(new RegExp(`\\b\\w+ing\\s+(${head}s?)\\b`, 'gi'), '$1') : said;
    const names = !!head && new RegExp(`\\b${head}s?\\b`, 'i').test(clause);
    if (STOPPING.test(clause) && (names || PROPELLED.test(clause))) return false;
    if ((names && GOING.test(clause)) || PROPELLED.test(clause)) going = true;
  }
  return going;
}

// ── through the dreamer's eyes ───────────────────────────────────────────────────────────────────

/** Doing something with their hands: what the dreamer's hands do, as a moment's words say it. */
const HAND_VERB =
  '(?:touch|touches|touching|hold|holds|holding|held|reach|reaches|reaching|reached|grab|grabs|grabbing|grip|grips|gripping|push|pushes|pushing|pull|pulls|pulling|open|opens|opening|opened|closes|closing|shuts|carry|carries|carrying|pick|picks|picking|take|takes|taking|took|give|gives|giving|hand|hands|handing|stroke|strokes|stroking|pat|pats|patting|lift|lifts|lifting|put|puts|putting|press|presses|pressing|knock|knocks|knocking|wave|waves|waving|point|points|pointing|write|writes|writing|fold|folds|folding|cradle|cradles|cradling|row|rows|rowing|climb|climbs|climbing|drive|drives|driving|steer|steers|steering|throw|throws|throwing|threw|catch|catches|catching|caught|eat|eats|eating|ate|drink|drinks|drinking|pour|pours|pouring|pedal|pedals|pedalling|pedaling|paddle|paddles|paddling|swim|swims|swimming|unlock|unlocks|unlocking|turns? the|lets? go|hug|hugs|hugging|shake|shakes|shaking|brush|brushes|brushing|wipe|wipes|wiping|type|types|typing|draw|draws|drawing|tie|ties|tying|dig|digs|digging|pull out|holds? out)';

/**
 * Whether a moment seen through the dreamer's eyes is of their own body: they look down at themselves
 * ("their own small body and the gray cardigan", the kitchen that shrank, 26 Sep). Then it shows, as
 * they see it; never their face.
 */
export function selfIn(words: string[]): boolean {
  const text = words.join(' ');
  return (
    /\b(?:their|your|my|the dreamer's)\s+own\s+(?:\w+\s+)?(?:body|bodies|legs|feet|hands|arms|clothes|reflection)\b/i.test(
      text,
    ) || /\blooks? down at (?:themselves|yourself|myself)\b/i.test(text)
  );
}

/**
 * Whether the dreamer's own hands are in a moment seen through their eyes: the dreamer does something
 * with them (the dreamer "opens the door", "can touch its nose"), their hand or arm is named ("the
 * boat in their hand"), or they hold something. A gate opening on its own has no hands in it, and a
 * dreamer looking for someone shows nothing of themselves (the lift, 26 Sep: "legs and all should not
 * be visible").
 */
export function handsIn(words: string[], holds: boolean): boolean {
  if (holds) return true;
  const who = '(?:the dreamer|you|they|i)';
  // The dreamer doing it: "they are close to the edge" is where they are, not a hand closing.
  const does = new RegExp(`(?:^|[^\\w'])${who}\\s+(?:(?!(?:are|is|was|were|am)\\b)\\w+\\s+){0,2}?${HAND_VERB}\\b`, 'i');
  // "Their hand" is the dreamer's only in a clause about the dreamer: "Tomas folds their arms" is his.
  const own = /\b(?:the dreamer's|your|my)\s+(?:own\s+)?(?:\w+\s+)?(?:hands?|arms?|fingers?|palms?)\b/i;
  const their = /\btheir\s+(?:own\s+)?(?:\w+\s+)?(?:hands?|arms?|fingers?|palms?)\b/i;
  const aboutThem = /^\s*(?:the dreamer|you|they|i)\b|\bthe dreamer\b/i;
  return words
    .join('. ')
    .split(/[;.]|,\s+(?=and\b|but\b|then\b|while\b|as\b)/)
    .some((c) => does.test(c) || own.test(c) || (their.test(c) && aboutThem.test(c)));
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
