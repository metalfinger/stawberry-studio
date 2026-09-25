// The resolved tree of a dream: dream → sequences → scenes → shots → cuts, the way a film's
// paperwork breaks a story down. A 1st AD's breakdown sheet lists everything a scene needs, a shot
// list says what each camera setup is, and a script supervisor's notes carry how everyone looks
// from picture to picture. Nothing is carried over silently: every node's sheet is complete, and
// says value by value which level supplied it and on what basis (said, chosen, read, derived,
// guessed, default, forgotten, unknown).
//
// Beside the tree: every element with its one category (the tag its checks are routed by), the
// continuity ledger (each person's and thing's looks in story order, the ghost that makes each one
// real, and the pictures that use it), flags for the harness, and gaps: what only the dreamer can
// settle, the biggest (a whole scene) first.
//
// Pure: no model calls, no I/O, no clock. It reads what the harness already holds (the breakdown
// with its floor plans, the continuity plan, and when there, the prep, the sketches and frames,
// the chosen look, the grounding notes and the conversation's goals) and works the rest out.
import { type Blocking, bearing, type Eye, roomOf, type Shape, sizeOf, type Spot, wall } from './blocking';
import {
  calledIn,
  type ContinuityPlan,
  type CutPlan,
  meant,
  pictureName,
  placePlan,
  planBy,
  rawPlanBy,
  type RefRole,
  type Relation,
  stateKey,
} from './continuity';
import { type GroundingNote, hasBefore } from './ground';
import type { GoalStatus } from './lib';
import { SIDE } from './planfacts';
import { onOf, shapeOf } from './previs';
import {
  type Breakdown,
  type Detail,
  isWhole,
  mediumOf,
  type Moment,
  momentLabel,
  moments,
  oneColour,
  POSITION,
  type Scene,
  type StyleOption,
  VAGUE,
} from './producer';
import type { Item } from './sheets';
import { momentStage, type Reading, type StageId } from './stages';

// ── constants ───────────────────────────────────────────────────────────────
/** A camera moved less than this is the same camera: "a moved camera is another shot". */
export const SAME_CAMERA = { metres: 0.6, degrees: 10 };
/** Metres: one person's spot, as settling groups people. */
export const SAME_SPOT = 0.3;
/** Metres: a camera this close to the line's axis is on it. */
export const LINE_ON = 0.5;
/** Metres: a thing this close to a person may be in their hands. */
export const NEAR_HAND = 0.6;
/** Metres: the largest side of a thing someone could hold. */
export const SMALL_THING = 1.0;
/** The lens where the camera gives none: the previs's own wide lens. */
const DEFAULT_LENS = 24;

// ── provenance ──────────────────────────────────────────────────────────────
/** Most specific first: the value used comes from the first level in this order that sets it. */
export const LEVELS = ['cut', 'shot', 'scene', 'sequence', 'dream', 'sheet', 'default'] as const;
export type Level = (typeof LEVELS)[number];
export type NodeLevel = 'dream' | 'sequence' | 'scene' | 'shot' | 'cut';

/**
 * said       the dreamer's own words (Detail.said, Moment.said)
 * chosen     the dreamer picked it (the look)
 * read       a model's reading of told words: producer fields with no said flag, plan facts, Jev's
 * derived    worked out by code: the previs camera, settling, the seat rule, bearings
 * guessed    filled in without their words (Detail.said false with a value; Moment.said false)
 * default    a code fallback
 * forgotten  they said they don't remember: never asked again, a value kept if any
 * unknown    nothing anywhere
 */
export type Basis = 'said' | 'chosen' | 'read' | 'derived' | 'guessed' | 'default' | 'forgotten' | 'unknown';

/**
 * Where a value came from. Paths: b:<breakdown path>, items:<id>.<field>, plan:<scene>[/<place>].<path>,
 * cont:<cut>.<field>, prep:<field>.<cut>, style:<field>, code:<rule>(<args>), default:<name>, none:<key>.
 */
export type Source = {
  level: Level;
  /** The node that set it; an element id at 'sheet'; '-' at 'default'. */
  node: string;
  path: string;
  basis: Basis;
  /** The code rule for derived and default values, or 'goal:<id>' for forgotten ones. */
  rule?: string;
  /** Set at an earlier cut and carried here in story order (a move, a change in force). */
  since?: string;
  evidence?: number | null;
  /** Grounding took "said" away from it. */
  downgraded?: boolean;
  /** Read from a prep made for another version of the dream. */
  stale?: boolean;
};

/** One value and where it came from; `over`: the value it replaces, from the next source down. */
export type Field<T> = { value: T | null; from: Source; over?: { value: unknown; from: Source } };

// ── sheet fields ────────────────────────────────────────────────────────────
export type StyleRef = { id: string; name: string; tokens: string[]; palette: string[]; dream: string | null };
/** What a camera faces: the moment's words, and what the plan reads them to be. */
export type Faces = { words: string; on: string | null };
export type Background = { side: string; sheetShowsIt: boolean };
/** Side of the scene's line: the side its first two-shot set up, the other, or on the axis. */
export type Side = 'established' | 'reverse' | 'on';
/** Provisional: master, single, two-shot and reaction come with the camera rules. */
export type ShotRole = 'pov' | 'ots' | 'insert';

export type FieldValues = {
  // dream
  title: string;
  rules: string;
  style: StyleRef;
  medium: string;
  oneColour: boolean;
  colours: string;
  texture: string;
  lightGrade: string;
  // sequence
  opens: string;
  feeling: string;
  // scene
  place: string;
  time: string;
  indoors: boolean;
  room: [number, number];
  front: string;
  lightSource: string;
  line: [string, string];
  // shot
  eyes: 'dreamer' | 'outside';
  size: 'close' | 'medium' | 'wide';
  camera: Eye;
  lens: number;
  faces: Faces;
  subject: string;
  role: ShotRole;
  side: Side;
  screen: string[];
  background: Background;
  previs: string;
  brief: string;
  // cut
  action: string;
  visualPoint: string;
  dreamlike: string;
  purpose: string;
  key: boolean;
  told: boolean;
  view: string;
  framing: string[];
  transition: string;
};
export type FieldKey = keyof FieldValues;
const DREAM_KEYS = ['title', 'rules', 'style', 'medium', 'oneColour', 'colours', 'texture', 'lightGrade'] as const;
const SEQUENCE_KEYS = [...DREAM_KEYS, 'opens', 'feeling'] as const;
const SCENE_KEYS = [...SEQUENCE_KEYS, 'place', 'time', 'indoors', 'room', 'front', 'lightSource', 'line'] as const;
const SHOT_KEYS = [
  ...SCENE_KEYS,
  'eyes',
  'size',
  'camera',
  'lens',
  'faces',
  'subject',
  'role',
  'side',
  'screen',
  'background',
  'previs',
  'brief',
] as const;
const CUT_KEYS = [
  ...SHOT_KEYS,
  'action',
  'visualPoint',
  'dreamlike',
  'purpose',
  'key',
  'told',
  'view',
  'framing',
  'transition',
] as const;
export type DreamKey = (typeof DREAM_KEYS)[number];
export type SequenceKey = (typeof SEQUENCE_KEYS)[number];
export type SceneKey = (typeof SCENE_KEYS)[number];
export type ShotKey = (typeof SHOT_KEYS)[number];
export type CutKey = (typeof CUT_KEYS)[number];
/** Complete: every key of its level, each with its source. */
export type Sheet<K extends FieldKey> = { [P in K]: Field<FieldValues[P]> };

export type Consumer = 'prompt' | 'checks' | 'previs' | 'berry' | 'panel' | 'staleness' | 'camera-rules';
export type FieldSpec = {
  /** The first level whose sheet has it: where it is unknown when nothing sets it. */
  owner: NodeLevel;
  /** The levels whose own data may set it. */
  setAt: NodeLevel[];
  /** Compared across the cuts of one shot. */
  locked?: boolean;
  /** The conversation goal that says whether it was told, or forgotten. */
  goal?: string;
  /** The question it feeds when it is unknown or only guessed. */
  ask?: GapKind;
  /** Who reads it: every field exists because something downstream needs it. */
  readBy: Consumer[];
};

/** Every field: who owns it, who may set it, what it feeds, who reads it. */
export const FIELDS: Record<FieldKey, FieldSpec> = {
  title: { owner: 'dream', setAt: ['dream'], readBy: ['panel'] },
  rules: { owner: 'dream', setAt: ['dream'], readBy: ['prompt', 'checks'] },
  style: { owner: 'dream', setAt: ['dream'], readBy: ['prompt', 'checks'] },
  medium: { owner: 'dream', setAt: ['dream'], readBy: ['prompt', 'checks'] },
  oneColour: { owner: 'dream', setAt: ['dream'], readBy: ['prompt'] },
  colours: { owner: 'dream', setAt: ['dream'], goal: 'look', readBy: ['prompt'] },
  texture: { owner: 'dream', setAt: ['dream'], goal: 'look', readBy: ['prompt'] },
  lightGrade: { owner: 'dream', setAt: ['dream'], goal: 'look', readBy: ['prompt', 'checks'] },
  opens: { owner: 'sequence', setAt: ['sequence'], readBy: ['panel', 'prompt'] },
  feeling: { owner: 'sequence', setAt: ['sequence', 'scene', 'cut'], goal: 'feeling', readBy: ['prompt'] },
  place: {
    owner: 'scene',
    setAt: ['scene', 'cut'],
    locked: true,
    ask: 'where',
    readBy: ['prompt', 'checks', 'previs', 'panel'],
  },
  time: { owner: 'scene', setAt: ['scene'], goal: 'look', ask: 'light', readBy: ['prompt', 'checks'] },
  indoors: { owner: 'scene', setAt: ['scene'], readBy: ['previs', 'checks'] },
  room: { owner: 'scene', setAt: ['scene'], readBy: ['previs'] },
  front: { owner: 'scene', setAt: ['scene'], readBy: ['previs', 'checks'] },
  lightSource: { owner: 'scene', setAt: ['scene'], goal: 'look', ask: 'light', readBy: ['prompt', 'checks'] },
  line: { owner: 'scene', setAt: ['scene'], readBy: ['checks', 'camera-rules'] },
  eyes: {
    owner: 'shot',
    setAt: ['shot'],
    locked: true,
    goal: 'you_in_it',
    ask: 'pov',
    readBy: ['prompt', 'previs', 'checks', 'berry'],
  },
  size: { owner: 'shot', setAt: ['shot'], locked: true, readBy: ['prompt'] },
  camera: { owner: 'shot', setAt: ['shot', 'cut'], locked: true, readBy: ['previs', 'checks', 'staleness'] },
  lens: { owner: 'shot', setAt: ['shot', 'cut'], locked: true, readBy: ['prompt'] },
  faces: { owner: 'shot', setAt: ['shot'], locked: true, readBy: ['checks'] },
  subject: { owner: 'shot', setAt: ['shot'], readBy: ['prompt', 'camera-rules'] },
  role: { owner: 'shot', setAt: ['shot'], readBy: ['camera-rules', 'panel'] },
  side: { owner: 'shot', setAt: ['shot', 'cut'], locked: true, readBy: ['camera-rules'] },
  screen: { owner: 'shot', setAt: ['shot', 'cut'], locked: true, readBy: ['checks', 'prompt'] },
  background: { owner: 'shot', setAt: ['shot', 'cut'], locked: true, readBy: ['checks', 'prompt'] },
  previs: { owner: 'shot', setAt: ['shot'], readBy: ['panel'] },
  brief: { owner: 'shot', setAt: ['shot'], readBy: ['prompt'] },
  action: { owner: 'cut', setAt: ['cut'], ask: 'happened', readBy: ['prompt', 'checks'] },
  visualPoint: { owner: 'cut', setAt: ['cut'], readBy: ['prompt', 'checks'] },
  dreamlike: { owner: 'cut', setAt: ['cut'], readBy: ['prompt', 'checks'] },
  purpose: { owner: 'cut', setAt: ['cut'], readBy: ['prompt', 'checks'] },
  key: { owner: 'cut', setAt: ['cut'], readBy: ['panel', 'berry'] },
  told: { owner: 'cut', setAt: ['cut'], readBy: ['panel', 'berry'] },
  view: { owner: 'cut', setAt: ['cut'], readBy: ['prompt', 'checks'] },
  framing: { owner: 'cut', setAt: ['cut'], readBy: ['checks', 'prompt'] },
  transition: { owner: 'cut', setAt: ['cut'], readBy: ['checks', 'prompt'] },
};

// ── elements ────────────────────────────────────────────────────────────────
export type Category =
  | 'cast'
  | 'crowd'
  | 'prop'
  | 'held_prop'
  | 'vehicle'
  | 'seat'
  | 'ground'
  | 'steps'
  | 'set_dressing'
  | 'place'
  | 'transformation'
  | 'look_change'
  | 'camera'
  | 'light';
/** The breakdown sheet's block order. */
export const SHEET_ORDER: readonly Category[] = [
  'cast',
  'crowd',
  'held_prop',
  'prop',
  'vehicle',
  'seat',
  'ground',
  'steps',
  'set_dressing',
  'place',
  'transformation',
  'look_change',
  'camera',
  'light',
];
/** Which reading wins when plans disagree about a thing: the most specific use of it. */
const PRECEDENCE: Category[] = ['held_prop', 'vehicle', 'seat', 'steps', 'ground', 'set_dressing', 'prop'];

export type LinkKind =
  | 'held_by'
  | 'rides_in'
  | 'sits_on'
  | 'stands_on'
  | 'part_of'
  | 'fixture_of'
  | 'subject_of'
  | 'camera_of'
  | 'light_of'
  | 'pov_of';
/** `at`: 'dream' for a standing link, a scene id for a plan fact, a cut id for one moment's. */
export type Link = { kind: LinkKind; to: string; at: string; path: string };

export type SheetState = {
  item: string;
  status: Item['status'];
  version: number;
  review?: Item['review'];
  ask: boolean;
  held?: string[];
  mediaPath?: string;
};

export type Element = {
  /**
   * Fixed for the dream: p1, l3, t2 (the breakdown's); l5/little-bridge (a fixture: its place and
   * name, a plan's x id being only an alias); p1@m3:head (a change, also its ledger stage key);
   * cam:s3.sh1 (a shot's camera); light:s3/l5 (a scene's light).
   */
  id: string;
  name: string;
  /** Exactly one, fixed for the dream: the tag its checks are routed by. */
  category: Field<Category>;
  /** Cast billing: the protagonist first, then by first appearance. */
  number?: number;
  /** One cast entry that is several people. */
  group?: boolean;
  links: Link[];
  /** A fixture's ids on each plan. */
  aliases: { plan: string; id: string }[];
  /** Other readings of its category on other plans: recorded and flagged, never applied. */
  conflicts: { says: Category; path: string }[];
  /** Its sketch's look (stage 0), items first with the breakdown's value as `over`. */
  look: Record<string, Field<string>>;
  /** Its own sketch; null for crowds, fixtures, cameras, lights and changes. */
  sheet: SheetState | null;
  /** A change: its subject, part, what it is now, since when, and whether it is of the whole. */
  change?: { of: string; what: string; now: string; since: string; whole: Field<boolean> };
  /** Cuts it is in (listed, seen, linked or the camera), story order. */
  cuts: string[];
};

export type Presence = 'camera' | 'listed' | 'sees' | 'linked' | 'on_plan';

/** An element as it is at one scene or cut. */
export type ElementAt = {
  id: string;
  present: Presence;
  /** The link that brought it: 'held_by:p1', 'rides_in:p4', 'camera_of:s3.sh1'. */
  via?: string;
  /** In the previs picture; null where the cut has no previs. */
  inPicture: boolean | null;
  called: Field<string>;
  /** The ledger stage in force: 'p1#0' from its sheet, or a change key from the cut it started at. */
  stage: Field<string>;
  /** Parts changed and in force here, over its sketch's look. */
  parts: Record<string, Field<string>>;
  at?: Field<{ x: number; y: number; faces?: string; pose?: Spot['pose'] }>;
  on?: Field<{ how: 'in' | 'on'; id: string }>;
  holder?: Field<string>;
  shape?: Field<Shape>;
  count?: Field<number>;
};

// ── nodes ───────────────────────────────────────────────────────────────────
type NodeBase<L extends NodeLevel, K extends FieldKey> = {
  id: string;
  level: L;
  name: string;
  parent: string | null;
  /** Cut ids under it, story order. */
  span: string[];
  /** The keys this node's own data sets. */
  own: K[];
  sheet: Sheet<K>;
  /** Elements present under it (listed, seen, linked or the camera). */
  elements: string[];
  /** Their categories: each switches its checks on. */
  tags: Category[];
  flags: string[];
  gaps: string[];
};

export type TreeRef = {
  id: string;
  kind: 'cut' | 'ghost';
  role: RefRole;
  relation?: Relation;
  who?: string[];
  /** For a ghost: the stage key it makes real, or 'view:<place>' for a view ghost. */
  realises?: string;
};
export type DrawnState = {
  status: Item['status'];
  version: number;
  review?: Item['review'];
  held?: string[];
  mediaPath?: string;
  check?: { passed: number; questions: number };
  continuityFailed?: string[];
};

export type CutNode = NodeBase<'cut', CutKey> & {
  order: number;
  prev: string | null;
  next: string | null;
  prevInShot: string | null;
  at: Record<string, ElementAt>;
  refs: TreeRef[];
  /** What differs from its references. */
  differs: string[];
  /** Named by the moment, not in its previs picture. */
  unseen: string[];
  storyboard?: { ok: boolean | null; reasons: string[]; readings: Reading[]; stale: boolean };
  status: StageId;
  drawn?: DrawnState;
  /** A hash of everything it is made from: compared with the hash it was drawn at. */
  hash: string;
};

export type Lock = { element: string | null; field: string; cuts: string[] };
export type ShotNode = NodeBase<'shot', ShotKey> & {
  /** Display only: '2A-1'. */
  number: string;
  /** The cut its camera is read from: the first with its own previs camera. */
  lead: string | null;
  locks: Lock[];
  cuts: CutNode[];
};

export type BreakdownSheet = {
  /** 'INT. THE TINY ROOM — TIME UNKNOWN' */
  heading: string;
  blocks: { category: Category; entries: { id: string; number?: number; name: string; note?: string }[] }[];
  notes: string[];
};
export type SceneNode = NodeBase<'scene', SceneKey> & {
  /** Display only: '1', '2A', '2B'. */
  number: string;
  breakdownScene: string;
  /** Its place, or two for a place that turns into another. */
  places: string[];
  /** The plan its cuts are drawn from: 'plan:s2' or 'plan:s2/l4'; null without one. */
  plan: string | null;
  /** Its cuts are not one unbroken run: another scene is cut to between them. */
  intercut: boolean;
  breaks: Break[];
  breakdown: BreakdownSheet;
  /** The plan's values of what is on it: spot, shape, holder, count. */
  at: Record<string, ElementAt>;
  shots: ShotNode[];
};
export type SequenceNode = NodeBase<'sequence', SequenceKey> & {
  startsAt: string;
  splitBy: 'start' | 'jump';
  scenes: SceneNode[];
};
export type DreamNode = NodeBase<'dream', DreamKey> & {
  /** Every element with a sketch, and its variants (the ledger's stages after the sketch). */
  library: { element: string; item: string; status: Item['status']; variants: string[] }[];
  sequences: SequenceNode[];
};

// ── the ledger ──────────────────────────────────────────────────────────────
export type Stage = {
  /** Stable, for later steps to store: 'p1#0' (the sketch) or 'p1@m3:head'. */
  key: string;
  /** Display only: renumbers when a change is found earlier. */
  n: number;
  element: string;
  kind: 'sheet' | 'look_change' | 'transformation';
  part: string | null;
  now: string | null;
  whole: Field<boolean> | null;
  /** The earlier stage of the same part it replaces. */
  replaces?: string;
  /** The whole look at this stage: every part changed so far. */
  parts: Record<string, string>;
  startsAt: string | null;
  /** Whether the dreamer told the moment it starts at. */
  told: boolean | null;
  /** The in-between reference that makes it real, and what that is edited from. */
  ghost: string | null;
  ghostFrom: 'sheet' | string | null;
  usedBy: string[];
  /** What to draw again if this stage changes. */
  redraw: { items: string[]; ghosts: string[]; cuts: string[]; maybe: string[] };
  /** Stage 0 only: how it looks where it is first shown, recorded as a change but not one. */
  firstLooks?: { cut: string; what: string; now: string; ghost: string | null }[];
  hash: string;
  drawn?: DrawnState;
};
export type LedgerRow = {
  element: string;
  category: Category;
  stages: Stage[];
  /** Cut → the stage in force, null where it is not in the picture: the costume plot. */
  plot: Record<string, string | null>;
  /** A place's view ghosts: sides never drawn, made first. */
  views?: { ghost: string; looksAt: string; usedBy: string[] }[];
};
/** A dream jump or a morph: a tagged break that names what does not carry across it. */
export type Break = {
  id: string;
  at: string;
  kind: 'jump' | 'morph';
  said: string;
  scene: string;
  /** Stage keys that start here, and 'place', 'staging', 'place_refs'. */
  breaks: string[];
  /** Elements in the picture just before and here, unchanged. */
  keeps: string[];
};
export type Ledger = { rows: LedgerRow[]; breaks: Break[] };

// ── flags and gaps ──────────────────────────────────────────────────────────
export type FlagCode =
  | 'first_look'
  | 'camera_moved'
  | 'unmarked_change'
  | 'stage_not_carried'
  | 'category_conflict'
  | 'unused_element'
  | 'no_plan'
  | 'borrowed_plan'
  | 'plan_drift'
  | 'stale_reading'
  | 'faces_off_plan'
  | 'shot_spans_scenes';
/** Something code sees is off: for the checks, the harness and the panel. Never asked of the dreamer. */
export type Flag = {
  id: string;
  code: FlagCode;
  node: string;
  element?: string;
  field?: string;
  was?: unknown;
  now?: unknown;
  text: string;
};

export type GapKind =
  | 'pov'
  | 'light'
  | 'where'
  | 'same_place'
  | 'count'
  | 'holding'
  | 'shift'
  | 'change_stays'
  | 'same_person'
  | 'look'
  | 'happened';
/** Something only the dreamer can settle, unknown or only guessed: a question for Berry. */
export type Gap = {
  /** Stable, from moment, element, breakdown-scene and stage ids only. */
  id: string;
  kind: GapKind;
  level: 'scene' | 'ledger' | 'sheet' | 'cut';
  node: string;
  element?: string;
  fields: string[];
  basis: 'unknown' | 'guessed' | 'read';
  current: unknown;
  from: Source[];
  /** Asked once for every gap of the group. */
  group?: string;
  slots: Record<string, string>;
  firstAt: string;
  affects: string[];
  asked?: number;
  askedBy?: 'profile';
  /** Gaps to settle first. */
  after?: string[];
  priority: number;
};

// ── the tree ────────────────────────────────────────────────────────────────
export type Goals = Record<string, { status: GoalStatus; asked: number }>;
/** A full prep fits; the frozen fixtures carry only the storyboard's views and the briefs. */
export type TreePrep = {
  blocking?: Record<string, Blocking>;
  previs?: Record<string, string>;
  shots?: Record<string, { text: string; view?: string }>;
  storyboard?: Record<string, { view: string; ok?: boolean; reasons?: string[]; readings?: Reading[] }>;
};
export type TreeInput = {
  breakdown: Breakdown;
  /** The continuity plan as a re-plan would make it now. */
  plan: ContinuityPlan;
  prep?: TreePrep;
  /** Whether the prep was made from this version of the dream; null when unknown. */
  prepFresh?: boolean | null;
  items?: Item[];
  frames?: Item[];
  style?: StyleOption | null;
  downgraded?: GroundingNote[];
  goals?: Goals;
};
export type DreamTree = {
  version: 1;
  basedOn: { prep: 'fresh' | 'stale' | 'unknown' | 'none'; items: number; frames: number };
  dream: DreamNode;
  elements: Record<string, Element>;
  ledger: Ledger;
  gaps: Gap[];
  flags: Flag[];
  index: Record<string, { sequence: string; scene: string; shot: string; order: number }>;
  counts: {
    sequences: number;
    scenes: number;
    shots: number;
    cuts: number;
    elements: number;
    stages: number;
    gaps: number;
    flags: number;
  };
};
export type CutContext = {
  cut: string;
  sheet: Sheet<CutKey>;
  elements: (ElementAt & { category: Category; name: string; look: Record<string, Field<string>> })[];
  refs: TreeRef[];
  breaks: Break[];
  prev: string | null;
  prevInShot: string | null;
};

// ── small helpers ───────────────────────────────────────────────────────────
/** A name as an id: lower case, without a leading article, words joined by '-'. */
export const slug = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'thing';

/** A pure 53-bit hash of a value, its keys sorted: the same inputs give the same hex. */
export function hashOf(value: unknown): string {
  const text = stable(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
const stable = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v as object)
    .sort()
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
};
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const F = <T>(value: T | null, from: Source, over?: Field<unknown>): Field<T> => ({
  value,
  from,
  ...(over && over.value !== null && over.value !== undefined ? { over: { value: over.value, from: over.from } } : {}),
});
const said = (d: Detail | undefined): Basis =>
  !d || d.value === null || d.value === undefined || !String(d.value).trim()
    ? 'unknown'
    : d.said
      ? 'said'
      : VAGUE.test(String(d.value))
        ? 'unknown'
        : 'guessed';
const cameraMoved = (a: Eye, b: Eye) => {
  const moved = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
  const cos = Math.max(-1, Math.min(1, a.d.x * b.d.x + a.d.y * b.d.y));
  return { moved, turned: (Math.acos(cos) * 180) / Math.PI };
};
const sameCamera = (a: Eye, b: Eye) => {
  const { moved, turned } = cameraMoved(a, b);
  return (
    moved <= SAME_CAMERA.metres &&
    turned <= SAME_CAMERA.degrees &&
    (a.lens ?? DEFAULT_LENS) === (b.lens ?? DEFAULT_LENS)
  );
};
const lettered = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');

/** The facets each kind of sketch needs, to be drawn without inventing them. */
const REQUIRED_LOOK: Record<'cast' | 'place' | 'thing', string[]> = {
  cast: ['appearance', 'wardrobe'],
  place: ['geography', 'landmarks'],
  thing: ['appearance'],
};
const LOOK_FIELDS: Record<'person' | 'place' | 'thing', string[]> = {
  person: ['identity', 'appearance', 'wardrobe', 'distinctive_features'],
  place: ['geography', 'landmarks', 'light'],
  thing: ['appearance', 'materials'],
};
const KIND_RANK: Record<GapKind, number> = {
  pov: 0,
  where: 1,
  same_place: 2,
  light: 3,
  count: 4,
  holding: 5,
  shift: 6,
  change_stays: 7,
  same_person: 8,
  look: 9,
  happened: 9,
};
const LEVEL_RANK: Record<Gap['level'], number> = { scene: 0, ledger: 1, sheet: 2, cut: 3 };

// ── the tree ────────────────────────────────────────────────────────────────
/** The dream's resolved tree, its elements, ledger, gaps and flags, from what the harness holds. */
export function resolveTree(input: TreeInput): DreamTree {
  const b = input.breakdown;
  const plan = input.plan;
  const prep = input.prep;
  const goals = input.goals;
  const items = input.items ?? [];
  const frames = input.frames ?? [];
  const downgraded = new Set((input.downgraded ?? []).map((d) => d.path));
  const flags: Flag[] = [];
  const flag = (f: Omit<Flag, 'id'>) => {
    const id = `${f.code}:${f.node}${f.element ? `:${f.element}` : ''}${f.field ? `:${f.field}` : ''}`;
    if (!flags.some((x) => x.id === id)) flags.push({ id, ...f });
  };

  // Moments in story order, their changes of look only, as the continuity plan reads them.
  const ms: Moment[] = moments(b).map((m) => ({
    ...m,
    leaves: (m.leaves ?? []).filter((l) => !POSITION.test(l.what.trim())),
  }));
  const orderOf = new Map(ms.map((m, i) => [m.id, i]));
  const byId = new Map(ms.map((m) => [m.id, m]));
  const cutPlans = new Map(plan.cuts.map((c) => [c.id, c]));
  const bsOf = new Map<string, Scene>();
  for (const sc of b.scenes) for (const m of sc.moments) bsOf.set(m.id, sc);
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const frameOf = new Map(frames.map((f) => [f.id, f]));
  const person = (id: string) => b.people.find((p) => p.id === id);
  const placeOf = (id: string) => b.places.find((l) => l.id === id);
  const thing = (id: string) => b.things.find((t) => t.id === id);
  const baseName = (id: string) =>
    id === dreamer ? 'the dreamer' : pictureName(person(id)?.name ?? placeOf(id)?.name ?? thing(id)?.name ?? id);
  const goal = (g: string | undefined) => (g && goals ? goals[g] : undefined);

  // The plan a moment is drawn on, and its path.
  const planKeyOf = (m: Moment): string | null => {
    const sc = bsOf.get(m.id);
    if (!sc?.blocking) return null;
    return sc.blocking.places?.[m.place] ? `plan:${sc.id}/${m.place}` : `plan:${sc.id}`;
  };

  // ── fixtures: one element per fixture of a place, its x ids on each plan as aliases ──
  const fixtureAt = new Map<string, string>(); // `${planKey}|${x}` → element id
  const fixtureSpot = new Map<string, { spot: Spot; plan: Blocking; key: string; place: string }[]>();
  for (const sc of b.scenes) {
    if (!sc.blocking) continue;
    const plans: [string, string, Blocking][] = [
      [`plan:${sc.id}`, sc.place, sc.blocking],
      ...Object.entries(sc.blocking.places ?? {}).map(([pl, p]): [string, string, Blocking] => [
        `plan:${sc.id}/${pl}`,
        pl,
        p,
      ]),
    ];
    for (const [key, place, p] of plans)
      for (const s of p.spots)
        if (s.fixture) {
          const id = `${place}/${slug(s.name ?? s.id)}`;
          fixtureAt.set(`${key}|${s.id}`, id);
          fixtureSpot.set(id, [...(fixtureSpot.get(id) ?? []), { spot: s, plan: p, key, place }]);
        }
  }
  const elementOfSpot = (key: string | null, spotId: string) => (key && fixtureAt.get(`${key}|${spotId}`)) || spotId;

  // ── elements ──
  const elements: Record<string, Element> = {};
  const src = (level: Level, node: string, path: string, basis: Basis, extra: Partial<Source> = {}): Source => ({
    level,
    node,
    path,
    basis,
    ...extra,
  });
  const plansOfScene = (sc: Scene): [string, Blocking][] =>
    sc.blocking
      ? [
          [`plan:${sc.id}`, sc.blocking],
          ...Object.entries(sc.blocking.places ?? {}).map(([pl, p]): [string, Blocking] => [`plan:${sc.id}/${pl}`, p]),
        ]
      : [];
  const allPlans = b.scenes.flatMap(plansOfScene);

  const lookOf = (id: string, kind: 'person' | 'place' | 'thing'): Record<string, Field<string>> => {
    const fromB = (person(id)?.fields ?? placeOf(id)?.fields ?? thing(id)?.fields ?? {}) as Record<string, Detail>;
    const fromItem = (itemOf.get(id)?.fields ?? {}) as Record<string, Detail>;
    const out: Record<string, Field<string>> = {};
    for (const k of LOOK_FIELDS[kind]) {
      const bd = fromB[k];
      const it = fromItem[k];
      const bField: Field<string> = F(bd?.value && said(bd) !== 'unknown' ? bd.value : null, {
        ...src('sheet', id, `b:${id}.${k}`, said(bd)),
        ...(bd?.evidence !== undefined ? { evidence: bd.evidence } : {}),
        ...(downgraded.has(`${id}.${k}`) ? { downgraded: true } : {}),
      });
      if (it && it.value) {
        const f = F<string>(
          said(it) === 'unknown' ? null : it.value,
          {
            ...src('sheet', id, `items:${id}.${k}`, said(it)),
            ...(downgraded.has(`${id}.${k}`) ? { downgraded: true } : {}),
          },
          bd?.value && bd.value !== it.value ? bField : undefined,
        );
        out[k] = f;
      } else out[k] = bField;
      // The place's light, when they said they don't remember how it looked, is forgotten.
      if (k === 'light' && goal('look')?.status === 'unknown' && ['unknown', 'guessed'].includes(out[k].from.basis))
        out[k] = { ...out[k], from: { ...out[k].from, basis: 'forgotten', rule: 'goal:look' } };
    }
    return out;
  };
  const sheetOf = (id: string): SheetState | null => {
    const it = itemOf.get(id);
    return it
      ? {
          item: it.id,
          status: it.status,
          version: it.version,
          ...(it.review ? { review: it.review } : {}),
          ask: !!it.ask,
          ...(it.held?.length ? { held: it.held } : {}),
          ...(it.mediaPath ? { mediaPath: it.mediaPath } : {}),
        }
      : null;
  };

  // People: a crowd, or cast.
  for (const p of b.people) {
    const manyAt = allPlans.find(([, pl]) => pl.spots.some((s) => s.id === p.id && s.many));
    const crowd = !!p.extras || !!manyAt;
    elements[p.id] = {
      id: p.id,
      name: baseName(p.id),
      category: F<Category>(
        crowd ? 'crowd' : 'cast',
        p.extras
          ? src('dream', 'dream', `b:${p.id}.extras`, 'read')
          : manyAt
            ? src('dream', 'dream', `${manyAt[0]}.spots.${p.id}.many`, 'read')
            : src('dream', 'dream', 'b:people', 'read'),
      ),
      ...(p.several ? { group: true } : {}),
      links: p.part_of ? [{ kind: 'part_of', to: p.part_of, at: 'dream', path: `b:${p.id}.part_of` }] : [],
      aliases: [],
      conflicts: [],
      look: crowd ? {} : lookOf(p.id, 'person'),
      sheet: crowd ? null : sheetOf(p.id),
      cuts: [],
    };
  }
  // Places.
  for (const l of b.places)
    elements[l.id] = {
      id: l.id,
      name: baseName(l.id),
      category: F<Category>('place', src('dream', 'dream', 'b:places', 'read')),
      links: [],
      aliases: [],
      conflicts: [],
      look: lookOf(l.id, 'place'),
      sheet: sheetOf(l.id),
      cuts: [],
    };
  // Things: what each plan reads them to be; the most specific reading wins, the rest recorded.
  const readingOf = (s: Spot, p: Blocking, key: string): { category: Category; from: Source } => {
    if (s.heldBy) return { category: 'held_prop', from: src('dream', 'dream', `${key}.spots.${s.id}.heldBy`, 'read') };
    const shape = shapeOf(s, p);
    const derived = !s.shape && shape !== 'block';
    const category: Category = shape === 'block' ? (s.fixture ? 'set_dressing' : 'prop') : shape;
    return {
      category,
      from: derived
        ? src('dream', 'dream', `code:shapeOf(${key.slice(5)},${s.id})`, 'derived', { rule: 'sat' })
        : s.shape
          ? src('dream', 'dream', `${key}.spots.${s.id}.shape`, 'read')
          : src('dream', 'dream', `${key}.spots.${s.id}`, 'default', { rule: 'block' }),
    };
  };
  const categorise = (
    readings: { category: Category; from: Source }[],
    fallback: { category: Category; from: Source },
  ) => {
    const sorted = [...readings].sort((x, y) => PRECEDENCE.indexOf(x.category) - PRECEDENCE.indexOf(y.category));
    const win = sorted[0] ?? fallback;
    const conflicts = sorted
      .filter((r) => r.category !== win.category && r.category !== 'prop' && r.category !== 'set_dressing')
      .map((r) => ({ says: r.category, path: r.from.path }));
    return { win, conflicts };
  };
  for (const t of b.things) {
    const readings = allPlans.flatMap(([key, p]) =>
      p.spots.filter((s) => s.id === t.id).map((s) => readingOf(s, p, key)),
    );
    const { win, conflicts } = categorise(readings, {
      category: 'prop',
      from: src('dream', 'dream', 'b:things', 'default'),
    });
    const held = allPlans.flatMap(([key, p]) =>
      p.spots
        .filter((s) => s.id === t.id && s.heldBy)
        .map((s): Link => ({ kind: 'held_by', to: s.heldBy!, at: key.slice(5), path: `${key}.spots.${s.id}.heldBy` })),
    );
    elements[t.id] = {
      id: t.id,
      name: baseName(t.id),
      category: F<Category>(win.category, win.from),
      links: held,
      aliases: [],
      conflicts,
      look: lookOf(t.id, 'thing'),
      sheet: sheetOf(t.id),
      cuts: [],
    };
  }
  // Fixtures: the place's own things, drawn from its sketch.
  for (const [id, at] of fixtureSpot) {
    const { win, conflicts } = categorise(
      at.map((a) => readingOf(a.spot, a.plan, a.key)),
      { category: 'set_dressing', from: src('dream', 'dream', `${at[0].key}.spots.${at[0].spot.id}`, 'default') },
    );
    elements[id] = {
      id,
      name: pictureName(at[0].spot.name ?? id),
      category: F<Category>(win.category, win.from),
      links: [
        { kind: 'fixture_of', to: at[0].place, at: 'dream', path: `${at[0].key}.spots.${at[0].spot.id}.fixture` },
      ],
      aliases: at.map((a) => ({ plan: a.key, id: a.spot.id })),
      conflicts,
      look: {},
      sheet: null,
      cuts: [],
    };
  }
  for (const e of Object.values(elements))
    if (e.conflicts.length)
      flag({
        code: 'category_conflict',
        node: 'dream',
        element: e.id,
        was: e.category.value,
        now: e.conflicts.map((c) => c.says),
        text: `${e.name} reads as ${e.category.value} on one plan and ${e.conflicts.map((c) => c.says).join(', ')} on another: kept as ${e.category.value}`,
      });

  // ── breaks: a dream's jumps, and a place that turns into another ──
  const isWholeLeave = (l: { what: string; whole?: boolean }) => isWhole(l);
  const breaks: Break[] = [];
  ms.forEach((m, i) => {
    if (i === 0 || !m.shift?.trim()) return;
    const p = ms[i - 1];
    const sameBs = bsOf.get(m.id)?.id === bsOf.get(p.id)?.id;
    const samePlace = m.place === p.place;
    const placeMorph = !samePlace && m.leaves.some((l) => l.who === p.place && isWholeLeave(l));
    const kind: Break['kind'] = sameBs && (samePlace || placeMorph) ? 'morph' : 'jump';
    breaks.push({ id: `brk:${m.id}`, at: m.id, kind, said: m.shift, scene: '', breaks: [], keeps: [] });
  });
  const breakAt = (m: string) => breaks.find((x) => x.at === m);

  // ── film scenes: one place, one time; sequences split at each jump ──
  const sceneKeyOf = new Map<string, string>();
  const alias = new Map<string, string>();
  const segStart: string[] = [ms[0]?.id ?? ''];
  let seg = 0;
  ms.forEach((m, i) => {
    const brk = breakAt(m.id);
    if (brk?.kind === 'jump') {
      seg += 1;
      segStart[seg] = m.id;
    }
    const bs = bsOf.get(m.id)?.id ?? 's?';
    const k = `${bs}|${seg}|${m.place || '-'}`;
    if (brk?.kind === 'morph' && i > 0 && m.place !== ms[i - 1].place && !alias.has(k))
      alias.set(k, sceneKeyOf.get(ms[i - 1].id)!);
    sceneKeyOf.set(m.id, alias.get(k) ?? k);
  });
  const sceneKeys = [...new Set(ms.map((m) => sceneKeyOf.get(m.id)!))];
  const firstSeg = new Map<string, number>();
  for (const key of sceneKeys) {
    const [bs, sg, place] = key.split('|');
    const bp = `${bs}|${place}`;
    if (!firstSeg.has(bp)) firstSeg.set(bp, Number(sg));
  }
  const sceneIdOf = (key: string) => {
    const [bs, sg, place] = key.split('|');
    return Number(sg) === firstSeg.get(`${bs}|${place}`) ? `${bs}/${place}` : `${bs}/${place}@${segStart[Number(sg)]}`;
  };
  const sceneOfCut = new Map(ms.map((m) => [m.id, sceneIdOf(sceneKeyOf.get(m.id)!)]));
  for (const brk of breaks) brk.scene = sceneOfCut.get(brk.at)!;

  // ── the ledger's stages: the looks of each person and thing in story order ──
  const ghostOfState = new Map(
    plan.ghosts.filter((g) => g.kind === 'state' && g.state).map((g) => [stateKey(g.state!), g]),
  );
  const stagesOf = new Map<string, Stage[]>();
  const firstLooks: { who: string; cut: string; what: string; now: string; ghost: string | null }[] = [];
  const stage0 = (id: string): Stage => ({
    key: `${id}#0`,
    n: 0,
    element: id,
    kind: 'sheet',
    part: null,
    now: null,
    whole: null,
    parts: {},
    startsAt: null,
    told: null,
    ghost: null,
    ghostFrom: null,
    usedBy: [],
    redraw: { items: [], ghosts: [], cuts: [], maybe: [] },
    hash: '',
  });
  const ledgerIds = Object.values(elements)
    .filter((e) => !['camera', 'light'].includes(e.category.value ?? ''))
    .map((e) => e.id);
  for (const id of ledgerIds) stagesOf.set(id, [stage0(id)]);
  for (const m of ms)
    m.leaves.forEach((l, i) => {
      if (!stagesOf.has(l.who)) stagesOf.set(l.who, [stage0(l.who)]);
      const st = { who: l.who, what: l.what, now: l.now, since: m.id };
      const ghost = ghostOfState.get(stateKey(st)) ?? null;
      // How it looks where it is first shown is no change: nothing came before it (25 Sep).
      if (!hasBefore(b, m.id, l.who)) {
        firstLooks.push({ who: l.who, cut: m.id, what: l.what, now: l.now, ghost: ghost?.id ?? null });
        return;
      }
      const list = stagesOf.get(l.who)!;
      const prev = list.at(-1)!;
      let key = `${l.who}@${m.id}:${slug(l.what)}`;
      for (let k = 2; list.some((s) => s.key === key); k++) key = `${l.who}@${m.id}:${slug(l.what)}~${k}`;
      const part = l.what.trim().toLowerCase();
      const whole: Field<boolean> =
        l.whole !== undefined
          ? F(l.whole, src('cut', m.id, `b:${m.id}.leaves.${i}.whole`, 'read'))
          : F(isWhole(l), src('cut', m.id, `code:isWhole(b:${m.id}.leaves.${i}.what)`, 'derived', { rule: 'WHOLE' }));
      const replaces = [...list].reverse().find((s) => s.part === part)?.key;
      list.push({
        key,
        n: list.length,
        element: l.who,
        kind: whole.value ? 'transformation' : 'look_change',
        part,
        now: l.now,
        whole,
        ...(replaces ? { replaces } : {}),
        parts: { ...prev.parts, [l.what]: l.now },
        startsAt: m.id,
        told: m.said,
        ghost: ghost?.id ?? null,
        ghostFrom: ghost ? (ghost.after ?? 'sheet') : null,
        usedBy: [],
        redraw: { items: [], ghosts: [], cuts: [], maybe: [] },
        hash: '',
      });
    });
  for (const f of firstLooks) {
    const s0 = stagesOf.get(f.who)?.[0];
    if (s0) (s0.firstLooks ??= []).push({ cut: f.cut, what: f.what, now: f.now, ghost: f.ghost });
  }
  // Each change is an element too: its own category, its subject, whether it is of the whole.
  for (const list of stagesOf.values())
    for (const s of list.slice(1))
      elements[s.key] = {
        id: s.key,
        name: `${baseName(s.element)}'s ${s.part}: ${s.now}`,
        category: F<Category>(s.kind === 'transformation' ? 'transformation' : 'look_change', s.whole!.from),
        links: [{ kind: 'subject_of', to: s.element, at: s.startsAt!, path: s.whole!.from.path }],
        aliases: [],
        conflicts: [],
        look: {},
        sheet: null,
        change: { of: s.element, what: s.part!, now: s.now!, since: s.startsAt!, whole: s.whole! },
        cuts: [],
      };

  // ── shots and scene membership ──
  const shotOfCut = new Map(ms.map((m) => [m.id, cutPlans.get(m.id)?.shot ?? `${bsOf.get(m.id)?.id}.sh?${m.id}`]));
  const shotIds = [...new Set(ms.map((m) => shotOfCut.get(m.id)!))];
  const cutsOfShot = new Map(shotIds.map((s) => [s, ms.filter((m) => shotOfCut.get(m.id) === s).map((m) => m.id)]));
  const sceneOfShot = new Map<string, string>();
  for (const s of shotIds) {
    const cuts = cutsOfShot.get(s)!;
    const scenes = [...new Set(cuts.map((c) => sceneOfCut.get(c)!))];
    sceneOfShot.set(s, sceneOfCut.get(cuts[0])!);
    if (scenes.length > 1)
      flag({
        code: 'shot_spans_scenes',
        node: s,
        now: scenes,
        text: `shot ${s} has cuts in ${scenes.join(' and ')}: kept in ${scenes[0]}`,
      });
  }
  const leadOf = (shot: string) => cutsOfShot.get(shot)!.find((c) => cutPlans.get(c)?.eye) ?? null;

  // Cameras and lights: one per shot and one per scene.
  for (const s of shotIds) {
    const lead = leadOf(s) ?? cutsOfShot.get(s)![0];
    const pov = byId.get(lead)?.eyes === 'dreamer' && dreamer;
    elements[`cam:${s}`] = {
      id: `cam:${s}`,
      name: `camera ${s}`,
      category: F<Category>('camera', src('shot', s, `cont:${lead}.eye`, 'derived')),
      links: [
        { kind: 'camera_of', to: s, at: s, path: `cont:${lead}.eye` },
        ...(pov ? [{ kind: 'pov_of' as const, to: dreamer, at: s, path: `b:${lead}.eyes` }] : []),
      ],
      aliases: [],
      conflicts: [],
      look: {},
      sheet: null,
      cuts: [],
    };
  }
  const sceneIds = [...new Set(ms.map((m) => sceneOfCut.get(m.id)!))];
  for (const sid of sceneIds) {
    const first = ms.find((m) => sceneOfCut.get(m.id) === sid)!;
    elements[`light:${sid}`] = {
      id: `light:${sid}`,
      name: `light in ${baseName(first.place)}`,
      category: F<Category>('light', src('scene', sid, `b:${first.place}.light`, 'derived')),
      links: [{ kind: 'light_of', to: sid, at: sid, path: `b:${first.place}.light` }],
      aliases: [],
      conflicts: [],
      look: {},
      sheet: null,
      cuts: [],
    };
  }

  // ── presence at each cut ──
  const presence = new Map<string, Record<string, ElementAt>>();
  const expectedStage = (id: string, cut: string) => {
    const list = stagesOf.get(id);
    if (!list) return null;
    const at = orderOf.get(cut)!;
    return [...list].reverse().find((s) => s.startsAt === null || orderOf.get(s.startsAt)! <= at) ?? list[0];
  };
  for (const m of ms) {
    const cp = cutPlans.get(m.id);
    const key = planKeyOf(m);
    const pb = planBy(b, m.id);
    const raw = rawPlanBy(b, m.id);
    const at: Record<string, ElementAt> = {};
    const sees = cp?.sees?.map((x) => elementOfSpot(key, x));
    const base = (id: string, present: Presence, via?: string): ElementAt => ({
      id,
      present,
      ...(via ? { via } : {}),
      inPicture: sees ? sees.includes(id) : null,
      called: F('', src('dream', 'dream', '', 'derived')),
      stage: F('', src('sheet', id, '', 'derived')),
      parts: {},
    });
    const add = (id: string, present: Presence, via?: string) => {
      if (!elements[id] || at[id]) return;
      at[id] = base(id, present, via);
    };
    if (m.eyes === 'dreamer' && dreamer) add(dreamer, 'camera');
    for (const id of [...m.visible, ...m.things]) add(id, 'listed');
    if (m.place) add(m.place, 'listed');
    for (const id of sees ?? []) add(id, 'sees');
    // Linked: what someone present holds, rides in, sits or stands on; changes in force; camera; light.
    for (const s of pb?.spots ?? []) {
      if (s.heldBy && at[s.heldBy] && at[s.heldBy].present !== 'on_plan') add(s.id, 'linked', `held_by:${s.heldBy}`);
    }
    for (const id of Object.keys(at)) {
      const who = pb?.spots.find((s) => s.id === id);
      if (!who || who.kind !== 'person' || !pb) continue;
      const on = onOf(who, pb);
      if (on) {
        const t = elementOfSpot(key, on.t.id);
        const how = on.how === 'in' ? 'rides_in' : shapeOf(on.t, pb) === 'seat' ? 'sits_on' : 'stands_on';
        add(t, 'linked', `${how}:${id}`);
      }
    }
    const shot = shotOfCut.get(m.id)!;
    add(`cam:${shot}`, 'linked', `camera_of:${shot}`);
    add(`light:${sceneOfCut.get(m.id)}`, 'linked', `light_of:${sceneOfCut.get(m.id)}`);
    for (const s of pb?.spots ?? []) add(elementOfSpot(key, s.id), 'on_plan');

    // The look in force: what the continuity plan carries here (actual), against story order (expected).
    const inForce = new Set([...(cp?.own ?? []), ...(cp?.states ?? [])].map(stateKey));
    const cc = cp ? calledIn(b, cp) : (id: string) => baseName(id);
    for (const e of Object.values(at)) {
      const list = stagesOf.get(e.id);
      if (list) {
        const actual =
          [...list]
            .reverse()
            .find(
              (s) =>
                s.startsAt &&
                inForce.has(
                  stateKey({
                    who: s.element,
                    what: Object.keys(s.parts).find((p) => p.trim().toLowerCase() === s.part) ?? s.part!,
                    now: s.now!,
                    since: s.startsAt,
                  }),
                ),
            ) ?? list[0];
        const expected = expectedStage(e.id, m.id)!;
        const use = e.present === 'listed' || e.present === 'camera' ? actual : expected;
        e.stage =
          use.n === 0
            ? F(
                use.key,
                src('sheet', e.id, e.id.includes('/') ? `plan:${e.id}` : `items:${e.id}`, 'derived', { rule: 'sheet' }),
              )
            : F(
                use.key,
                src(
                  'cut',
                  use.startsAt!,
                  `cont:${m.id}.states`,
                  'read',
                  use.startsAt !== m.id ? { since: use.startsAt! } : {},
                ),
              );
        if ((e.present === 'listed' || e.present === 'camera') && actual.key !== expected.key && expected.n > 0) {
          flag({
            code: 'stage_not_carried',
            node: m.id,
            element: e.id,
            was: expected.key,
            now: actual.key,
            text: `${elements[e.id].name} is shown at ${m.id} as ${actual.n ? actual.now : 'their sketch'}, but by then ${expected.part} is ${expected.now}`,
          });
          (e as ElementAt & { _gapStage?: Stage })._gapStage = expected;
        }
        for (const [part, now] of Object.entries(use.parts))
          e.parts[part] = F(
            now,
            src('cut', use.startsAt!, `b:${use.startsAt}.leaves`, 'read', { since: use.startsAt! }),
          );
      }
      // Called: as the moment calls it, renamed where a whole change made it something else.
      const fixture = fixtureSpot.get(e.id);
      if (fixture) {
        const a = raw?.spots.find((s) => elementOfSpot(key, s.id) === e.id);
        e.called = F(
          pictureName(a?.name ?? elements[e.id].name),
          src('scene', sceneOfCut.get(m.id)!, `${key}.spots.${a?.id ?? '?'}.name`, 'read'),
        );
      } else if (
        elements[e.id].category.value === 'camera' ||
        elements[e.id].category.value === 'light' ||
        e.id.includes('@')
      ) {
        e.called = F(elements[e.id].name, src('dream', 'dream', 'code:name', 'derived'));
      } else {
        const now = cc(e.id);
        const base =
          e.id === dreamer ? 'the dreamer' : (person(e.id)?.name ?? placeOf(e.id)?.name ?? thing(e.id)?.name ?? e.id);
        e.called =
          now !== base
            ? F(now, src('cut', m.id, `code:calledIn(${m.id},${e.id})`, 'derived', { rule: 'calledIn' }))
            : F(baseName(e.id), src('dream', 'dream', `b:${e.id}.name`, 'read'));
      }
      // Where it is: a move here, a move earlier carried, or its scene spot; settled where settling moved it.
      const s = raw?.spots.find((x) => elementOfSpot(key, x.id) === e.id);
      const settled = pb?.spots.find((x) => elementOfSpot(key, x.id) === e.id);
      if (s && key) {
        const scene = bsOf.get(m.id)!;
        const own = placePlan(b, m.id);
        const ownPlace = (x: Moment) =>
          bsOf.get(x.id)?.id === scene.id &&
          (own === scene.blocking ? !scene.blocking?.places?.[x.place] : scene.blocking?.places?.[x.place] === own);
        const upTo = ms.slice(0, orderOf.get(m.id)! + 1).filter(ownPlace);
        const mover = [...upTo].reverse().find((x) => own?.moves?.[x.id]?.some((mv) => mv.id === s.id));
        const planned: Field<{ x: number; y: number; faces?: string; pose?: Spot['pose'] }> = mover
          ? F(
              { x: s.x, y: s.y, ...(s.faces ? { faces: s.faces } : {}), ...(s.pose ? { pose: s.pose } : {}) },
              src(
                'cut',
                mover.id,
                `${key}.moves.${mover.id}.${s.id}`,
                'read',
                mover.id !== m.id ? { since: mover.id } : {},
              ),
            )
          : F(
              { x: s.x, y: s.y, ...(s.faces ? { faces: s.faces } : {}), ...(s.pose ? { pose: s.pose } : {}) },
              src('scene', sceneOfCut.get(m.id)!, `${key}.spots.${s.id}`, 'read'),
            );
        const moved =
          settled &&
          (Math.hypot(settled.x - s.x, settled.y - s.y) > 0.01 || settled.faces !== s.faces || settled.pose !== s.pose);
        e.at = moved
          ? F(
              {
                x: settled!.x,
                y: settled!.y,
                ...(settled!.faces ? { faces: settled!.faces } : {}),
                ...(settled!.pose ? { pose: settled!.pose } : {}),
              },
              src('cut', m.id, `code:settle(${key.slice(5)},${m.id})`, 'derived', { rule: 'settle' }),
              planned,
            )
          : planned;
        if (settled && pb && settled.kind === 'person') {
          const on = onOf(settled, pb);
          if (on)
            e.on = F(
              { how: on.how, id: elementOfSpot(key, on.t.id) },
              src('cut', m.id, `code:onOf(${key.slice(5)},${m.id})`, 'derived'),
            );
        }
        if (s.heldBy)
          e.holder = F(s.heldBy, src('scene', sceneOfCut.get(m.id)!, `${key}.spots.${s.id}.heldBy`, 'read'));
        if (s.kind !== 'person' && pb) {
          const shape = shapeOf(settled ?? s, pb);
          e.shape = F(
            shape,
            s.shape
              ? src('scene', sceneOfCut.get(m.id)!, `${key}.spots.${s.id}.shape`, 'read')
              : src(
                  'scene',
                  sceneOfCut.get(m.id)!,
                  `code:shapeOf(${key.slice(5)},${s.id})`,
                  shape === 'block' ? 'default' : 'derived',
                ),
          );
        }
        if (s.many && s.count)
          e.count = F(s.count, src('scene', sceneOfCut.get(m.id)!, `${key}.spots.${s.id}.count`, 'read'));
      }
    }
    // Every change in force on someone present is present too, through them.
    for (const e of Object.values(at)) {
      if (e.present === 'on_plan') continue;
      const list = stagesOf.get(e.id);
      if (!list) continue;
      const cur = list.find((s) => s.key === e.stage.value);
      for (const s of list.slice(1, (cur?.n ?? 0) + 1))
        if (!at[s.key] && elements[s.key])
          at[s.key] = {
            ...base(s.key, 'linked', `subject_of:${e.id}`),
            stage: F(s.key, src('cut', s.startsAt!, `b:${s.startsAt}.leaves`, 'read')),
          };
    }
    presence.set(m.id, at);
  }
  const counted = (e: ElementAt) => e.present !== 'on_plan';
  for (const m of ms)
    for (const e of Object.values(presence.get(m.id)!))
      if (counted(e) && !elements[e.id].cuts.includes(m.id)) elements[e.id].cuts.push(m.id);

  // Breaks: what does not carry across them, and what does.
  for (const brk of breaks) {
    const i = orderOf.get(brk.at)!;
    const p = ms[i - 1];
    const m = ms[i];
    const starts = [...stagesOf.values()]
      .flat()
      .filter((s) => s.startsAt === brk.at)
      .sort((x, y) => Number(!!y.whole?.value) - Number(!!x.whole?.value))
      .map((s) => s.key);
    brk.breaks = [...starts, ...(m.place !== p.place ? ['place'] : []), 'staging', 'place_refs'];
    const shown = (cut: string) =>
      new Set(
        Object.values(presence.get(cut)!)
          .filter((e) => ['listed', 'sees'].includes(e.present))
          .map((e) => e.id),
      );
    const before = shown(p.id);
    // Whatever changes at the break (the sofa that becomes a roller coaster) is not kept across it.
    const changing = new Set(
      [...stagesOf.values()]
        .flat()
        .filter((s) => s.startsAt === brk.at)
        .map((s) => s.element),
    );
    brk.keeps = [...shown(m.id)].filter(
      (id) =>
        before.has(id) &&
        !brk.breaks.includes(id) &&
        !changing.has(id) &&
        !['camera', 'light', 'transformation', 'look_change'].includes(elements[id].category.value!),
    );
  }

  // Cast billing: the protagonist first, then by first appearance.
  const cast = b.people.filter((p) => elements[p.id].category.value === 'cast');
  const firstIn = (id: string) => {
    const i = ms.findIndex((m) => m.visible.includes(id) || (m.eyes === 'dreamer' && id === dreamer));
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  [...cast]
    .sort((x, y) => Number(!!y.protagonist) - Number(!!x.protagonist) || firstIn(x.id) - firstIn(y.id))
    .forEach((p, i) => (elements[p.id].number = i + 1));

  // ── ledger: which cuts use each stage, and what to redraw if it changes ──
  const refsTo = new Map<string, string[]>(); // ghost or cut → cuts that refer to it
  for (const c of plan.cuts) for (const r of c.refs) refsTo.set(r.id, [...(refsTo.get(r.id) ?? []), c.id]);
  const rows: LedgerRow[] = [];
  for (const [id, list] of stagesOf) {
    if (!elements[id]) continue;
    const plot: Record<string, string | null> = {};
    for (const m of ms) {
      const e = presence.get(m.id)![id];
      plot[m.id] = e && counted(e) ? e.stage.value : null;
      if (e && counted(e)) list.find((s) => s.key === e.stage.value)?.usedBy.push(m.id);
    }
    const lookHash = hashOf(Object.fromEntries(Object.entries(elements[id].look).map(([k, f]) => [k, f.value])));
    for (const s of list) {
      s.hash = hashOf({ look: lookHash, parts: s.parts });
      const chain = list.filter((x) => x.n >= s.n);
      const ghosts = [
        ...chain.map((x) => x.ghost).filter((g): g is string => !!g),
        ...(s.n === 0 ? (s.firstLooks ?? []).map((f) => f.ghost).filter((g): g is string => !!g) : []),
      ];
      const cuts = new Set([...chain.flatMap((x) => x.usedBy), ...ghosts.flatMap((g) => refsTo.get(g) ?? [])]);
      const maybe = new Set<string>();
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of plan.cuts) {
          if (cuts.has(c.id) || maybe.has(c.id)) continue;
          const via = c.refs.find(
            (r) =>
              r.kind === 'cut' &&
              ['base', 'composition'].includes(r.role) &&
              (cuts.has(r.id) || maybe.has(r.id)) &&
              plot[r.id],
          );
          if (via) {
            maybe.add(c.id);
            grew = true;
          }
        }
      }
      const fixtureOf = elements[id].links.find((l) => l.kind === 'fixture_of')?.to;
      s.redraw = {
        items: s.n === 0 ? (itemOf.has(id) ? [id] : fixtureOf && itemOf.has(fixtureOf) ? [fixtureOf] : []) : [],
        ghosts: [...new Set(ghosts)],
        cuts: ms.map((m) => m.id).filter((c) => cuts.has(c)),
        maybe: ms.map((m) => m.id).filter((c) => maybe.has(c)),
      };
      const g = s.ghost ? frameOf.get(s.ghost) : undefined;
      if (g) s.drawn = drawnOf(g);
    }
    const views =
      elements[id].category.value === 'place'
        ? plan.ghosts
            .filter((g) => g.kind === 'view' && g.of === id)
            .map((g) => ({ ghost: g.id, looksAt: g.looksAt ?? '', usedBy: g.usedBy }))
        : [];
    rows.push({
      element: id,
      category: elements[id].category.value!,
      stages: list,
      plot,
      ...(views.length ? { views } : {}),
    });
  }
  for (const f of firstLooks) {
    const g = f.ghost ? plan.ghosts.find((x) => x.id === f.ghost) : undefined;
    flag({
      code: 'first_look',
      node: f.cut,
      element: f.who,
      now: f.ghost,
      text: `${baseName(f.who)}'s ${f.what} at ${f.cut} is how it looks where it is first shown, not a change${g ? `: in-between picture ${g.id} would feed ${g.usedBy.join(', ')} and change nothing` : ''}`,
    });
  }

  // ── sheets, top down ──
  const style = input.style ?? null;
  const unknownField = <T>(k: FieldKey, node: string, path?: string): Field<T> => {
    const g = goal(FIELDS[k].goal);
    return F<T>(null, {
      ...src(FIELDS[k].owner, node, path ?? `none:${k}`, g?.status === 'unknown' ? 'forgotten' : 'unknown'),
      ...(g?.status === 'unknown' ? { rule: `goal:${FIELDS[k].goal}` } : {}),
    });
  };
  const forget = <T>(f: Field<T>, k: FieldKey): Field<T> => {
    const g = goal(FIELDS[k].goal);
    return g?.status === 'unknown' && ['unknown', 'guessed'].includes(f.from.basis)
      ? { ...f, from: { ...f.from, basis: 'forgotten', rule: `goal:${FIELDS[k].goal}` } }
      : f;
  };
  // A node's sheet: what its own data sets (and differs from its parent), else what it inherits.
  const resolve = <K extends FieldKey>(
    keys: readonly K[],
    level: NodeLevel,
    node: string,
    parent: Partial<Record<FieldKey, Field<unknown>>> | null,
    own: Partial<Record<FieldKey, Field<unknown> | null>>,
  ): { sheet: Sheet<K>; own: K[] } => {
    const sheet = {} as Sheet<K>;
    const set: K[] = [];
    for (const k of keys) {
      const mine = own[k];
      const from = parent?.[k];
      if (
        FIELDS[k].setAt.includes(level) &&
        mine &&
        mine.value !== null &&
        mine.value !== undefined &&
        !(from && same(from.value, mine.value))
      ) {
        (sheet as Record<string, Field<unknown>>)[k] = forget(
          from?.value !== null && from?.value !== undefined
            ? { ...mine, over: { value: from.value, from: from.from } }
            : mine,
          k,
        );
        set.push(k);
      } else if (from) (sheet as Record<string, Field<unknown>>)[k] = from;
      else if (mine) (sheet as Record<string, Field<unknown>>)[k] = forget(mine, k);
      else (sheet as Record<string, Field<unknown>>)[k] = unknownField(k, node);
    }
    return { sheet, own: set };
  };

  // Dream.
  const lookLight = b.look?.light;
  const dreamOwn: Partial<Record<FieldKey, Field<unknown> | null>> = {
    title: F(b.title || null, src('dream', 'dream', 'b:title', 'read')),
    rules: F(b.world_logic || null, src('dream', 'dream', 'b:world_logic', 'read')),
    style: style
      ? F<StyleRef>(
          {
            id: style.id,
            name: style.name,
            tokens: style.tokens ?? [],
            palette: style.palette_hex ?? [],
            dream: style.dream ?? null,
          },
          src('dream', 'dream', 'style:*', 'chosen'),
        )
      : null,
    medium: style ? F(mediumOf(style), src('dream', 'dream', 'code:mediumOf(style)', 'chosen')) : null,
    oneColour: style ? F(oneColour(style), src('dream', 'dream', 'code:oneColour(style)', 'chosen')) : null,
    colours: F(
      said(b.look?.colours) === 'unknown' ? null : b.look.colours.value,
      src('dream', 'dream', 'b:look.colours', said(b.look?.colours)),
    ),
    texture: F(
      said(b.look?.texture) === 'unknown' ? null : b.look.texture.value,
      src('dream', 'dream', 'b:look.texture', said(b.look?.texture)),
    ),
    lightGrade:
      said(lookLight) !== 'unknown'
        ? F(lookLight.value, src('dream', 'dream', 'b:look.light', said(lookLight)))
        : style?.lighting_rules
          ? F(style.lighting_rules, src('dream', 'dream', 'style:lighting_rules', 'chosen'))
          : null,
  };
  const dreamSheet = resolve(DREAM_KEYS, 'dream', 'dream', null, dreamOwn);

  // Sequences.
  const seqIds = segStart.map((m) => `q:${m}`);
  const seqOfCut = new Map<string, string>();
  {
    let q = 0;
    for (const m of ms) {
      if (breakAt(m.id)?.kind === 'jump') q += 1;
      seqOfCut.set(m.id, seqIds[q]);
    }
  }

  // Scenes in order of first appearance, with their breakdown numbers.
  const bsIndex = new Map(b.scenes.map((sc, i) => [sc.id, i + 1]));
  const scenesOfBs = new Map<string, string[]>();
  for (const sid of sceneIds) {
    const bs = sid.split('/')[0];
    scenesOfBs.set(bs, [...(scenesOfBs.get(bs) ?? []), sid]);
  }
  const numberOfScene = (sid: string) => {
    const bs = sid.split('/')[0];
    const list = scenesOfBs.get(bs)!;
    return `${bsIndex.get(bs) ?? '?'}${list.length > 1 ? lettered(list.indexOf(sid)) : ''}`;
  };

  const index: DreamTree['index'] = {};
  const cutNodes = new Map<string, CutNode>();
  const shotNodes = new Map<string, ShotNode>();
  const sceneNodes = new Map<string, SceneNode>();
  const gaps: Gap[] = [];

  const sequences: SequenceNode[] = seqIds.map((qid, qi) => {
    const qcuts = ms.filter((m) => seqOfCut.get(m.id) === qid).map((m) => m.id);
    const first = byId.get(qcuts[0])!;
    const jump = qi > 0;
    const seqSheet = resolve(SEQUENCE_KEYS, 'sequence', qid, dreamSheet.sheet, {
      opens: jump && first.shift ? F(first.shift, src('sequence', qid, `b:${first.id}.shift`, 'said')) : null,
    });
    const scenes: SceneNode[] = sceneIds
      .filter((sid) => seqOfCut.get(ms.find((m) => sceneOfCut.get(m.id) === sid)!.id) === qid)
      .map((sid) => {
        const scuts = ms.filter((m) => sceneOfCut.get(m.id) === sid);
        const first = scuts[0];
        const bs = bsOf.get(first.id)!;
        const key = planKeyOf(first);
        const p = placePlan(b, first.id);
        const places = [...new Set(scuts.map((m) => m.place).filter(Boolean))];
        if (!p) flag({ code: 'no_plan', node: sid, text: `scene ${sid} has no floor plan` });
        else if (first.place && first.place !== bs.place && !bs.blocking?.places?.[first.place])
          flag({
            code: 'borrowed_plan',
            node: sid,
            text: `scene ${sid} (${baseName(first.place)}) is drawn on ${bs.id}'s own plan: it has none of its own`,
          });
        const fresh = input.prepFresh === true;
        if (fresh && prep?.blocking?.[bs.id] && bs.blocking && !same(prep.blocking[bs.id], bs.blocking)) {
          const keys = [...new Set([...Object.keys(prep.blocking[bs.id]), ...Object.keys(bs.blocking)])].filter(
            (k) =>
              !same((prep.blocking![bs.id] as Record<string, unknown>)[k], (bs.blocking as Record<string, unknown>)[k]),
          );
          flag({
            code: 'plan_drift',
            node: sid,
            was: keys,
            now: keys,
            text: `scene ${sid}'s plan differs from the one its planning made (${keys.join(', ')})`,
          });
        }
        const indices = scuts.map((m) => orderOf.get(m.id)!);
        const intercut = indices.some((x, i) => i > 0 && x !== indices[i - 1] + 1);
        const placeEl = first.place;
        const lightItem = itemOf.get(placeEl)?.fields as Record<string, Detail> | undefined;
        const lightB = placeOf(placeEl)?.fields.light;
        const lightSource: Field<string> | null = lightItem?.light?.value
          ? F(
              said(lightItem.light) === 'unknown' ? null : lightItem.light.value,
              src('sheet', placeEl, `items:${placeEl}.light`, said(lightItem.light)),
            )
          : lightB && said(lightB) !== 'unknown'
            ? F(lightB.value, src('sheet', placeEl, `b:${placeEl}.light`, said(lightB)))
            : null;
        // The line: the scene's first two-shot from outside sets it, its people left to right.
        const lineCut = scuts.find((m) => {
          const cp = cutPlans.get(m.id);
          return (
            m.eyes !== 'dreamer' &&
            cp?.eye &&
            (cp.sees ?? []).filter((x) => elements[x]?.category.value === 'cast').length >= 2
          );
        });
        let line: Field<[string, string]> | null = null;
        let sign0 = 0;
        if (lineCut) {
          const cp = cutPlans.get(lineCut.id)!;
          const pb = planBy(b, lineCut.id);
          const two = (cp.sees ?? [])
            .filter((x) => elements[x]?.category.value === 'cast')
            .map((x) => ({ x, s: pb?.spots.find((s) => s.id === x) }))
            .filter((x): x is { x: string; s: Spot } => !!x.s)
            .sort((u, v) => bearing(cp.eye!.at, cp.eye!.d, u.s).angle - bearing(cp.eye!.at, cp.eye!.d, v.s).angle)
            .slice(0, 2);
          if (two.length === 2) {
            line = F<[string, string]>(
              [two[0].x, two[1].x],
              src('scene', sid, `code:line(${lineCut.id})`, 'derived', { rule: 'first two-shot' }),
            );
            sign0 = Math.sign(signedFromAxis(two[0].s, two[1].s, cp.eye!.at));
          }
        }
        const sceneSheet = resolve(SCENE_KEYS, 'scene', sid, seqSheet.sheet, {
          feeling: bs.mood ? F(bs.mood, src('scene', sid, `b:${bs.id}.mood`, 'read')) : null,
          place: first.place ? F(first.place, src('scene', sid, `b:${first.id}.place`, 'read')) : null,
          time: null,
          indoors: p ? F(!!p.indoors, src('scene', sid, `${key}.indoors`, 'read')) : null,
          room: p
            ? p.room
              ? F<[number, number]>(p.room, src('scene', sid, `${key}.room`, 'read'))
              : F<[number, number]>(roomOf(p), src('default', '-', 'default:roomOf', 'default', { rule: 'roomOf' }))
            : null,
          front: p ? F(p.front, src('scene', sid, `${key}.front`, 'read')) : null,
          lightSource,
          line,
        });
        // A scene sheet's light: the place's sketch, where the scene sets none.
        if (lightSource && sceneSheet.sheet.lightSource.from.node === sid)
          sceneSheet.sheet.lightSource = forget({ ...lightSource }, 'lightSource');

        const scene: SceneNode = {
          id: sid,
          level: 'scene',
          name:
            (scenesOfBs.get(bs.id)!.length > 1
              ? `${bs.title || bs.id}: ${baseName(first.place)}`
              : bs.title || baseName(first.place)) || sid,
          parent: qid,
          span: scuts.map((m) => m.id),
          own: sceneSheet.own,
          sheet: sceneSheet.sheet,
          elements: [],
          tags: [],
          flags: [],
          gaps: [],
          number: numberOfScene(sid),
          breakdownScene: bs.id,
          places,
          plan: p ? key : null,
          intercut,
          breaks: breaks.filter((x) => x.scene === sid),
          breakdown: { heading: '', blocks: [], notes: [] },
          at: {},
          shots: [],
        };
        sceneNodes.set(sid, scene);
        // Shots of the scene, in order of their first cut.
        const sshots = shotIds.filter((s) => sceneOfShot.get(s) === sid);
        scene.shots = sshots.map((shot, k) => {
          const lead = leadOf(shot);
          const lm = byId.get(lead ?? cutsOfShot.get(shot)![0])!;
          const lcp = cutPlans.get(lm.id);
          const lkey = planKeyOf(lm);
          const lplan = placePlan(b, lm.id);
          const eye = lcp?.eye;
          const eyesBasis: Basis = !goals
            ? 'guessed'
            : goal('you_in_it')?.status === 'open'
              ? 'guessed'
              : goal('you_in_it')?.status === 'unknown'
                ? 'forgotten'
                : 'read';
          const looks = lplan?.looks?.[lm.id];
          const facesOn = looks
            ? ['front', 'missing', 'beyond'].includes(looks)
              ? looks
              : elementOfSpot(lkey, looks)
            : null;
          if (looks && ['missing', 'beyond'].includes(looks) && !SIDE.test(lm.looks_at ?? ''))
            flag({
              code: 'faces_off_plan',
              node: lm.id,
              field: 'faces',
              now: lm.looks_at,
              text: `${lm.id}'s camera faces ${lm.looks_at}, which its plan does not have`,
            });
          const seesEl = (lcp?.sees ?? []).map((x) => elementOfSpot(lkey, x));
          const castSeen = seesEl.filter((x) => elements[x]?.category.value === 'cast');
          const subject =
            facesOn &&
            elements[facesOn] &&
            !['front', 'missing', 'beyond'].includes(facesOn) &&
            ['cast', 'crowd', 'prop', 'held_prop', 'vehicle', 'seat', 'ground', 'steps', 'set_dressing'].includes(
              elements[facesOn].category.value!,
            )
              ? facesOn
              : castSeen.length === 1
                ? castSeen[0]
                : null;
          const role: ShotRole | null =
            lm.eyes === 'dreamer'
              ? 'pov'
              : /over (their|his|her) shoulder/i.test(lcp?.view ?? '')
                ? 'ots'
                : lcp?.sees && !seesEl.some((x) => ['cast', 'crowd'].includes(elements[x]?.category.value ?? ''))
                  ? 'insert'
                  : null;
          const sideOf = (m: Moment): { value: Side | null; rule?: string } => {
            const cp = cutPlans.get(m.id);
            if (!line?.value || !cp?.eye || m.eyes === 'dreamer') return { value: null };
            const pb = planBy(b, m.id);
            const a = pb?.spots.find((s) => s.id === line!.value![0]);
            const c = pb?.spots.find((s) => s.id === line!.value![1]);
            if (!a || !c || !pb) return { value: null };
            const oa = onOf(a, pb);
            const oc = onOf(c, pb);
            if (oa?.how === 'in' && oc?.how === 'in' && oa.t.id === oc.t.id)
              return { value: null, rule: 'riding together' };
            const s = signedFromAxis(a, c, cp.eye.at);
            return { value: Math.abs(s) < LINE_ON ? 'on' : Math.sign(s) === sign0 ? 'established' : 'reverse' };
          };
          const leadSide = sideOf(lm);
          const screen =
            eye && lplan
              ? seesEl
                  .map((x) => ({ x, s: planBy(b, lm.id)?.spots.find((s) => elementOfSpot(lkey, s.id) === x) }))
                  .filter((v): v is { x: string; s: Spot } => !!v.s)
                  .sort((u, v) => bearing(eye.at, eye.d, u.s).angle - bearing(eye.at, eye.d, v.s).angle)
                  .map((v) => v.x)
              : null;
          const shotSheet = resolve(SHOT_KEYS, 'shot', shot, sceneSheet.sheet, {
            eyes: F(lm.eyes, {
              ...src('shot', shot, `b:${lm.id}.eyes`, eyesBasis, { rule: 'lead-cut' }),
              ...(eyesBasis === 'forgotten' ? { rule: 'goal:you_in_it' } : {}),
            }),
            size: F(lm.distance, src('shot', shot, `b:${lm.id}.distance`, 'read', { rule: 'lead-cut' })),
            camera: eye ? F(eye, src('shot', shot, `cont:${lm.id}.eye`, 'derived', { rule: 'lead-cut' })) : null,
            lens: eye
              ? eye.lens
                ? F(eye.lens, src('shot', shot, `cont:${lm.id}.eye.lens`, 'derived', { rule: 'lead-cut' }))
                : F(DEFAULT_LENS, src('default', '-', 'default:lens', 'default', { rule: 'previs wide lens' }))
              : null,
            faces: lm.looks_at
              ? F<Faces>(
                  { words: lm.looks_at, on: facesOn },
                  src('shot', shot, `b:${lm.id}.looks_at`, 'read', { rule: 'lead-cut' }),
                )
              : null,
            subject: subject
              ? F(
                  subject,
                  src('shot', shot, facesOn === subject ? `${lkey}.looks.${lm.id}` : `cont:${lm.id}.sees`, 'derived'),
                )
              : null,
            role: role ? F(role, src('shot', shot, `code:role(${lm.id})`, 'derived')) : null,
            side: leadSide.value
              ? F(
                  leadSide.value,
                  src('shot', shot, `code:side(${lm.id})`, 'derived', leadSide.rule ? { rule: leadSide.rule } : {}),
                )
              : null,
            screen: screen ? F(screen, src('shot', shot, `code:bearing(cont:${lm.id}.eye)`, 'derived')) : null,
            background:
              eye && lplan
                ? F<Background>(
                    { side: wall(eye.d, lplan.front, !!lplan.indoors), sheetShowsIt: !!lcp?.sheetLayout },
                    src('shot', shot, `code:wall(cont:${lm.id}.eye.d)`, 'derived'),
                  )
                : null,
            previs: prep?.previs?.[lm.id]
              ? F(
                  prep.previs[lm.id],
                  src(
                    'shot',
                    shot,
                    `prep:previs.${lm.id}`,
                    'derived',
                    input.prepFresh === false ? { stale: true } : {},
                  ),
                )
              : null,
            brief: prep?.shots?.[lm.id]?.text
              ? F(
                  prep.shots[lm.id].text,
                  src('shot', shot, `prep:shots.${lm.id}`, 'read', input.prepFresh === false ? { stale: true } : {}),
                )
              : null,
          });
          const shotNode: ShotNode = {
            id: shot,
            level: 'shot',
            name: `${lm.eyes === 'dreamer' ? 'POV ' : ''}${lm.distance.toUpperCase()} · ${subject ? baseNameOf(subject) : lm.looks_at || '—'} · ${shotSheet.sheet.lens.value ?? DEFAULT_LENS}mm`,
            parent: sid,
            span: cutsOfShot.get(shot)!,
            own: shotSheet.own,
            sheet: shotSheet.sheet,
            elements: [],
            tags: [],
            flags: [],
            gaps: [],
            number: `${scene.number}-${k + 1}`,
            lead,
            locks: [],
            cuts: [],
          };
          shotNodes.set(shot, shotNode);
          // Cuts of the shot.
          shotNode.cuts = cutsOfShot.get(shot)!.map((cid, ci, all) => {
            const m = byId.get(cid)!;
            const cp = cutPlans.get(cid);
            const brk = breakAt(cid);
            const own: Partial<Record<FieldKey, Field<unknown> | null>> = {
              action: F(m.action, src('cut', cid, `b:${cid}.action`, m.said ? 'said' : 'guessed')),
              visualPoint: m.visual_point ? F(m.visual_point, src('cut', cid, `b:${cid}.visual_point`, 'read')) : null,
              dreamlike: m.dream ? F(m.dream, src('cut', cid, `b:${cid}.dream`, 'read')) : null,
              purpose: m.purpose ? F(m.purpose, src('cut', cid, `b:${cid}.purpose`, 'read')) : null,
              key: F(!!m.key, src('cut', cid, `b:${cid}.key`, 'read')),
              told: F(!!m.said, src('cut', cid, `b:${cid}.said`, 'read')),
              view: cp?.view
                ? F(cp.view, src('cut', cid, `cont:${cid}.view`, 'derived'))
                : cp?.camera
                  ? F(cp.camera, src('cut', cid, `cont:${cid}.camera`, 'derived'))
                  : null,
              framing: cp ? F(cp.framing ?? [], src('cut', cid, `cont:${cid}.framing`, 'derived')) : null,
              transition: cp?.transition
                ? F(cp.transition, src('cut', cid, `cont:${cid}.transition`, 'derived'))
                : null,
              feeling: m.feeling?.trim() ? F(m.feeling, src('cut', cid, `b:${cid}.feeling`, 'read')) : null,
              place:
                m.place && m.place !== first.place
                  ? F(m.place, src('cut', cid, `b:${cid}.place`, 'read', { rule: 'place morph' }))
                  : null,
            };
            // A camera of its own, moved from its shot's: another shot in all but name.
            if (cp?.eye && eye && cid !== lead && !sameCamera(cp.eye, eye)) {
              const cplan = placePlan(b, cid);
              own.camera = F(cp.eye, src('cut', cid, `cont:${cid}.eye`, 'derived'));
              own.lens = F(cp.eye.lens ?? DEFAULT_LENS, src('cut', cid, `cont:${cid}.eye.lens`, 'derived'));
              if (cplan)
                own.background = F<Background>(
                  { side: wall(cp.eye.d, cplan.front, !!cplan.indoors), sheetShowsIt: !!cp.sheetLayout },
                  src('cut', cid, `code:wall(cont:${cid}.eye.d)`, 'derived'),
                );
              const s = sideOf(m);
              if (s.value) own.side = F(s.value, src('cut', cid, `code:side(${cid})`, 'derived'));
              if (!brk) {
                const mv = cameraMoved(cp.eye, eye);
                flag({
                  code: 'camera_moved',
                  node: cid,
                  field: 'camera',
                  was: lead,
                  now: { moved: Math.round(mv.moved * 100) / 100, turned: Math.round(mv.turned) },
                  text: `${cid}'s camera moved ${mv.moved.toFixed(2)} m and turned ${Math.round(mv.turned)}° from its shot's (${lead}): another setup`,
                });
              }
            }
            const cutSheet = resolve(CUT_KEYS, 'cut', cid, shotSheet.sheet, own);
            const at = presence.get(cid)!;
            const listed = [...m.visible.filter((x) => !(m.eyes === 'dreamer' && x === dreamer)), ...m.things];
            const sees = cp?.sees ? cp.sees.map((x) => elementOfSpot(planKeyOf(m), x)) : undefined;
            const frame = frameOf.get(cid);
            const stored = prep?.storyboard?.[cid];
            const node: CutNode = {
              id: cid,
              level: 'cut',
              name: momentLabel(m.action),
              parent: shot,
              span: [cid],
              own: cutSheet.own,
              sheet: cutSheet.sheet,
              elements: Object.values(at)
                .filter(counted)
                .map((e) => e.id),
              tags: [],
              flags: [],
              gaps: [],
              order: orderOf.get(cid)! + 1,
              prev: ms[orderOf.get(cid)! - 1]?.id ?? null,
              next: ms[orderOf.get(cid)! + 1]?.id ?? null,
              prevInShot: ci > 0 ? all[ci - 1] : null,
              at,
              refs: (cp?.refs ?? []).map((r) => {
                const g = r.kind === 'ghost' ? plan.ghosts.find((x) => x.id === r.id) : undefined;
                const realises = g
                  ? g.kind === 'view'
                    ? `view:${g.of}`
                    : ([...stagesOf.values()].flat().find((s) => s.ghost === g.id)?.key ?? undefined)
                  : undefined;
                return {
                  id: r.id,
                  kind: r.kind,
                  role: r.role,
                  ...(r.relation ? { relation: r.relation } : {}),
                  ...(r.who ? { who: r.who } : {}),
                  ...(realises ? { realises } : {}),
                };
              }),
              differs: cp?.changes ?? [],
              unseen: sees ? listed.filter((x) => !sees.includes(x)) : [],
              ...(stored
                ? {
                    storyboard: {
                      ok: stored.ok ?? null,
                      reasons: stored.reasons ?? [],
                      readings: stored.readings ?? [],
                      stale: stored.view !== (cp?.view ?? ''),
                    },
                  }
                : {}),
              status: momentStage(cid, prep as Parameters<typeof momentStage>[1], frame),
              ...(frame ? { drawn: drawnOf(frame) } : {}),
              hash: '',
            };
            if (stored && stored.view !== (cp?.view ?? ''))
              flag({
                code: 'stale_reading',
                node: cid,
                text: `${cid}'s storyboard check read another view than its plan's now`,
              });
            node.hash = hashOf({
              sheet: Object.fromEntries(
                Object.entries(cutSheet.sheet).map(([k, f]) => [k, (f as Field<unknown>).value]),
              ),
              elements: Object.values(at)
                .filter(counted)
                .map((e) => ({
                  id: e.id,
                  stage: [...stagesOf.values()].flat().find((s) => s.key === e.stage.value)?.hash ?? null,
                  at: e.at?.value ?? null,
                  on: e.on?.value ?? null,
                  holder: e.holder?.value ?? null,
                  count: e.count?.value ?? null,
                }))
                .sort((x, y) => (x.id < y.id ? -1 : 1)),
              refs: (cp?.refs ?? []).map((r) => ({ id: r.id, role: r.role })),
            });
            node.tags = tagsOf(node.elements);
            cutNodes.set(cid, node);
            index[cid] = { sequence: qid, scene: sid, shot, order: node.order };
            return node;
          });
          shotNode.elements = [...new Set(shotNode.cuts.flatMap((c) => c.elements))];
          shotNode.tags = tagsOf(shotNode.elements);
          return shotNode;
        });
        scene.elements = [...new Set(scene.shots.flatMap((s) => s.elements))];
        scene.tags = tagsOf(scene.elements);
        // The plan's own values of what is on it.
        if (p && key)
          for (const s of p.spots) {
            const id = elementOfSpot(key, s.id);
            if (!elements[id]) continue;
            scene.at[id] = {
              id,
              present: scene.elements.includes(id) ? 'listed' : 'on_plan',
              inPicture: null,
              called: F(elements[id].name, src('dream', 'dream', `b:${id}.name`, 'read')),
              stage: F(`${id}#0`, src('sheet', id, `items:${id}`, 'derived')),
              parts: {},
              at: F(
                { x: s.x, y: s.y, ...(s.faces ? { faces: s.faces } : {}), ...(s.pose ? { pose: s.pose } : {}) },
                src('scene', sid, `${key}.spots.${s.id}`, 'read'),
              ),
              ...(s.heldBy ? { holder: F(s.heldBy, src('scene', sid, `${key}.spots.${s.id}.heldBy`, 'read')) } : {}),
              ...(s.kind !== 'person'
                ? {
                    shape: F(
                      shapeOf(s, p),
                      s.shape
                        ? src('scene', sid, `${key}.spots.${s.id}.shape`, 'read')
                        : src('scene', sid, `code:shapeOf(${key.slice(5)},${s.id})`, 'derived'),
                    ),
                  }
                : {}),
              ...(s.many && s.count
                ? { count: F(s.count, src('scene', sid, `${key}.spots.${s.id}.count`, 'read')) }
                : {}),
            };
          }
        // Its 1st AD breakdown sheet.
        const indoors = scene.sheet.indoors.value;
        const time = scene.sheet.time.value;
        scene.breakdown = {
          heading: `${indoors === null ? 'INT/EXT?' : indoors ? 'INT' : 'EXT'}. ${baseName(first.place).toUpperCase()} — ${time ? String(time).toUpperCase() : 'TIME UNKNOWN'}`,
          blocks: SHEET_ORDER.map((category) => ({
            category,
            entries: scene.elements
              .filter((id) => elements[id].category.value === category)
              .map((id) => {
                const e = elements[id];
                const sa = scene.at[id];
                const note =
                  category === 'crowd' && sa?.count
                    ? `${sa.count.value} (plan)`
                    : category === 'held_prop'
                      ? `held by ${e.links
                          .filter((l) => l.kind === 'held_by')
                          .map((l) => (elements[l.to]?.number ? String(elements[l.to].number) : baseName(l.to)))
                          .join(', ')}`
                      : e.links.find((l) => l.kind === 'fixture_of')
                        ? `fixture of ${baseName(e.links.find((l) => l.kind === 'fixture_of')!.to)}`
                        : undefined;
                return { id, ...(e.number ? { number: e.number } : {}), name: e.name, ...(note ? { note } : {}) };
              }),
          })).filter((x) => x.entries.length),
          notes: [
            ...(intercut ? ['intercut: another scene is cut to between its pictures'] : []),
            ...scene.breaks.map((x) => `${x.kind} at ${x.at}: ${x.said}`),
          ],
        };
        return scene;
      });
    const node: SequenceNode = {
      id: qid,
      level: 'sequence',
      name: `Sequence ${qi + 1} (${qcuts[0]}–${qcuts.at(-1)})`,
      parent: 'dream',
      span: qcuts,
      own: seqSheet.own,
      sheet: seqSheet.sheet,
      elements: [...new Set(scenes.flatMap((s) => s.elements))],
      tags: [],
      flags: [],
      gaps: [],
      startsAt: qcuts[0],
      splitBy: jump ? 'jump' : 'start',
      scenes,
    };
    node.tags = tagsOf(node.elements);
    return node;
  });

  // ── locks inside each shot: what held, and what changed that nobody marked ──
  for (const shot of shotNodes.values()) {
    if (shot.cuts.length < 2) continue;
    const held = new Map<string, boolean>(); // `${element}|${field}` → held so far
    shot.cuts.forEach((c, i) => {
      if (i === 0) return;
      const prev = shot.cuts[i - 1];
      const brk = breakAt(c.id);
      const between = ms.slice(orderOf.get(prev.id)! + 1, orderOf.get(c.id)! + 1);
      const moved = (id: string) =>
        between.some((x) => {
          const own = placePlan(b, x.id);
          return own?.moves?.[x.id]?.some((mv) => elementOfSpot(planKeyOf(x), mv.id) === id);
        });
      held.set(`-|camera`, (held.get(`-|camera`) ?? true) && !c.own.includes('camera'));
      for (const [id, e] of Object.entries(c.at)) {
        const p = prev.at[id];
        if (
          !p ||
          !['listed', 'sees', 'camera'].includes(e.present) ||
          !['listed', 'sees', 'camera'].includes(p.present)
        )
          continue;
        const checks: [string, unknown, unknown, boolean][] = [
          [
            'stage',
            p.stage.value,
            e.stage.value,
            [...stagesOf.values()].flat().some((s) => s.element === id && s.startsAt === c.id),
          ],
          [
            'at',
            p.at?.value ? [p.at.value.x, p.at.value.y] : null,
            e.at?.value ? [e.at.value.x, e.at.value.y] : null,
            moved(id),
          ],
          ['pose', p.at?.value?.pose ?? null, e.at?.value?.pose ?? null, moved(id)],
          ['faces', p.at?.value?.faces ?? null, e.at?.value?.faces ?? null, moved(id)],
        ];
        for (const [field, was, now, marked] of checks) {
          const differs =
            field === 'at' && Array.isArray(was) && Array.isArray(now)
              ? Math.hypot((was[0] as number) - (now[0] as number), (was[1] as number) - (now[1] as number)) > SAME_SPOT
              : !same(was, now);
          const k = `${id}|${field}`;
          held.set(k, (held.get(k) ?? true) && !differs);
          if (differs && !marked && !brk)
            flag({
              code: 'unmarked_change',
              node: c.id,
              element: id,
              field,
              was,
              now,
              text: `${elements[id].name}'s ${field} changes between ${prev.id} and ${c.id} in one shot, and nothing marks it`,
            });
        }
      }
    });
    shot.locks = [...held.entries()]
      .filter(([, v]) => v)
      .map(([k]) => {
        const [element, field] = k.split('|');
        return { element: element === '-' ? null : element, field, cuts: shot.cuts.map((c) => c.id) };
      });
  }

  // Elements in no picture.
  for (const e of Object.values(elements))
    if (
      ['cast', 'crowd', 'place', 'prop', 'held_prop', 'vehicle', 'seat', 'ground', 'steps'].includes(
        e.category.value!,
      ) &&
      !e.id.includes('/') &&
      !e.cuts.length
    )
      flag({
        code: 'unused_element',
        node: 'dream',
        element: e.id,
        text: `${e.name} is in no picture${e.sheet ? ` (its sketch is ${e.sheet.status})` : ''}`,
      });

  // ── gaps: what only the dreamer can settle ──
  const addGap = (g: Omit<Gap, 'priority'>) => {
    if (gaps.some((x) => x.id === g.id)) return;
    gaps.push({ ...g, priority: LEVEL_RANK[g.level] * 1000 + (orderOf.get(g.firstAt) ?? 0) * 10 + KIND_RANK[g.kind] });
  };
  const allScenes = [...sceneNodes.values()];
  const firstSceneOf = (id: string) => allScenes.find((s) => s.elements.includes(id) || s.places.includes(id));
  for (const s of allScenes) {
    const firstCut = s.span[0];
    // Through their own eyes, or watching themselves: guessed while the dreamer has not said.
    const eyes = [...new Set(s.shots.map((sh) => sh.sheet.eyes.value))];
    const eyeBasis = s.shots[0]?.sheet.eyes.from.basis;
    if (eyeBasis === 'guessed')
      addGap({
        id: `pov:${s.id}`,
        kind: 'pov',
        level: 'scene',
        node: s.id,
        fields: ['eyes'],
        basis: 'guessed',
        current: eyes,
        from: s.shots.map((sh) => sh.sheet.eyes.from),
        group: 'pov',
        slots: { scene: s.name },
        firstAt: firstCut,
        affects: s.span,
        ...(goals?.you_in_it ? { asked: goals.you_in_it.asked } : {}),
      });
    // The light and the time: not asked where they said they don't remember how it looked.
    const light = s.sheet.lightSource;
    const time = s.sheet.time;
    const lightOpen = [light, time].some((f) => ['unknown', 'guessed'].includes(f.from.basis));
    if (lightOpen && goal('look')?.status !== 'unknown')
      addGap({
        id: `light:${s.id}`,
        kind: 'light',
        level: 'scene',
        node: s.id,
        fields: ['lightSource', 'time'],
        basis: [light, time].some((f) => f.from.basis === 'guessed') && light.value ? 'guessed' : 'unknown',
        current: { lightSource: light.value, time: time.value },
        from: [light.from, time.from],
        group: 'light',
        slots: { scene: s.name },
        firstAt: firstCut,
        affects: s.span,
      });
    // A shift in the same place with nothing turning into anything: the place changed around them, or later?
    for (const brk of s.breaks)
      if (brk.kind === 'morph' && !byId.get(brk.at)!.leaves.some((l) => isWholeLeave(l)))
        addGap({
          id: `shift:${brk.at}`,
          kind: 'shift',
          level: 'scene',
          node: s.id,
          fields: ['place', 'time'],
          basis: 'read',
          current: brk.said,
          from: [src('cut', brk.at, `b:${brk.at}.shift`, 'said')],
          slots: { shift: brk.said },
          firstAt: brk.at,
          affects: s.span.filter((c) => orderOf.get(c)! >= orderOf.get(brk.at)!),
        });
  }
  // Places: what kind of place, and whether it is another place again.
  for (const l of b.places) {
    const scene = firstSceneOf(l.id);
    if (!scene) continue;
    const geo = elements[l.id].look.geography;
    if (geo && (geo.from.basis === 'unknown' || (geo.from.basis === 'guessed' && geo.from.downgraded)))
      addGap({
        id: `where:${l.id}`,
        kind: 'where',
        level: 'scene',
        node: scene.id,
        element: l.id,
        fields: ['geography'],
        basis: geo.from.basis === 'unknown' ? 'unknown' : 'guessed',
        current: geo.value,
        from: [geo.from],
        slots: { place: baseName(l.id) },
        firstAt: scene.span[0],
        affects: allScenes.filter((s) => s.places.includes(l.id)).flatMap((s) => s.span),
      });
    for (const q of b.places) {
      if (q.id === l.id) continue;
      const matched =
        meant(l.name, [{ id: q.id, name: q.name }]) === q.id ||
        ms.some((m) => m.place === l.id && m.looks_at && meant(m.looks_at, [{ id: q.id, name: q.name }]) === q.id);
      if (!matched) continue;
      const pair = [l.id, q.id].sort();
      addGap({
        id: `same_place:${pair[0]}:${pair[1]}`,
        kind: 'same_place',
        level: 'scene',
        node: scene.id,
        element: l.id,
        fields: ['place'],
        basis: 'read',
        current: [baseName(l.id), baseName(q.id)],
        from: [src('dream', 'dream', `b:${l.id}.name`, 'read')],
        slots: { place: baseName(l.id), other: baseName(q.id) },
        firstAt: scene.span[0],
        affects: allScenes.filter((s) => s.places.includes(l.id)).flatMap((s) => s.span),
      });
    }
  }
  // Crowds with no count; small things near someone with no holder.
  for (const m of ms) {
    const at = presence.get(m.id)!;
    for (const id of [...m.visible, ...m.things]) {
      const e = elements[id];
      if (!e) continue;
      if (e.category.value === 'crowd' && !at[id]?.count)
        addGap({
          id: `count:${id}`,
          kind: 'count',
          level: 'scene',
          node: sceneOfCut.get(m.id)!,
          element: id,
          fields: ['count'],
          basis: 'unknown',
          current: null,
          from: [src('scene', sceneOfCut.get(m.id)!, `${planKeyOf(m) ?? 'none:plan'}.spots.${id}.count`, 'unknown')],
          slots: { crowd: e.name },
          firstAt: m.id,
          affects: e.cuts,
        });
      if (e.category.value === 'prop' && thing(id)) {
        const pb = planBy(b, m.id);
        const s = pb?.spots.find((x) => x.id === id);
        if (!s || s.heldBy || Math.max(...sizeOf(s)) > SMALL_THING) continue;
        const near = m.visible.some((p) => {
          const ps = pb?.spots.find((x) => x.id === p);
          return ps && Math.hypot(ps.x - s.x, ps.y - s.y) <= NEAR_HAND;
        });
        if (near)
          addGap({
            id: `holding:${id}`,
            kind: 'holding',
            level: 'scene',
            node: sceneOfCut.get(m.id)!,
            element: id,
            fields: ['holder'],
            basis: 'unknown',
            current: null,
            from: [src('scene', sceneOfCut.get(m.id)!, `${planKeyOf(m)}.spots.${id}.heldBy`, 'unknown')],
            slots: { thing: e.name },
            firstAt: m.id,
            affects: e.cuts,
          });
      }
    }
  }
  // Changes that do not carry: did it stay?
  for (const m of ms)
    for (const e of Object.values(presence.get(m.id)!)) {
      const exp = (e as ElementAt & { _gapStage?: Stage })._gapStage;
      if (!exp) continue;
      delete (e as ElementAt & { _gapStage?: Stage })._gapStage;
      addGap({
        id: `change_stays:${exp.key}@${m.id}`,
        kind: 'change_stays',
        level: 'ledger',
        node: m.id,
        element: e.id,
        fields: ['stage'],
        basis: byId.get(m.id)!.states === undefined ? 'unknown' : 'read',
        current: e.stage.value,
        from: [e.stage.from],
        slots: { who: baseName(e.id), what: exp.part ?? '', now: exp.now ?? '' },
        firstAt: m.id,
        affects: [m.id],
      });
    }
  // Looks: what each sketch needs and nobody said.
  const povGaps = gaps.filter((g) => g.kind === 'pov').map((g) => g.id);
  for (const e of Object.values(elements)) {
    const cat = e.category.value;
    const kind = cat === 'cast' ? 'cast' : cat === 'place' ? 'place' : thing(e.id) ? 'thing' : null;
    if (!kind || !e.cuts.length || e.id.includes('/')) continue;
    if (e.sheet?.review === 'approved') continue;
    const where = gaps.filter((g) => g.element === e.id && ['where', 'same_place'].includes(g.kind)).map((g) => g.id);
    const open = REQUIRED_LOOK[kind].filter((k) => {
      if (k === 'geography' && where.some((g) => g.startsWith('where:'))) return false;
      const f = e.look[k];
      return !f || ['unknown', 'guessed'].includes(f.from.basis);
    });
    if (!open.length) continue;
    const scene = firstSceneOf(e.id);
    addGap({
      id: `look:${e.id}`,
      kind: 'look',
      level: 'sheet',
      node: e.id,
      element: e.id,
      fields: open,
      basis: open.some((k) => e.look[k]?.value) ? 'guessed' : 'unknown',
      current: Object.fromEntries(open.map((k) => [k, e.look[k]?.value ?? null])),
      from: open.map((k) => e.look[k]?.from ?? src('sheet', e.id, `b:${e.id}.${k}`, 'unknown')),
      slots: { who: e.name },
      firstAt: scene?.span[0] ?? e.cuts[0],
      affects: e.cuts,
      ...(itemOf.get(e.id)?.ask ? { askedBy: 'profile' as const } : {}),
      ...(e.id === dreamer && povGaps.length ? { after: povGaps } : where.length ? { after: where } : {}),
    });
  }
  // The same person twice, under two names.
  const people = b.people.filter((p) => elements[p.id].category.value === 'cast' && !p.is_dreamer);
  for (const p of people)
    for (const q of people) {
      if (p.id >= q.id || p.part_of === q.id || q.part_of === p.id) continue;
      if (meant(p.name, [{ id: q.id, name: q.name }]) !== q.id) continue;
      addGap({
        id: `same_person:${p.id}:${q.id}`,
        kind: 'same_person',
        level: 'sheet',
        node: p.id,
        element: p.id,
        fields: ['identity'],
        basis: 'read',
        current: [p.name, q.name],
        from: [src('dream', 'dream', `b:${p.id}.name`, 'read')],
        slots: { who: p.name, other: q.name },
        firstAt: elements[p.id].cuts[0] ?? ms[0].id,
        affects: [...new Set([...elements[p.id].cuts, ...elements[q.id].cuts])],
      });
    }
  // Moments they never told: did it happen?
  for (const m of ms)
    if (!m.said)
      addGap({
        id: `happened:${m.id}`,
        kind: 'happened',
        level: 'cut',
        node: m.id,
        fields: ['action'],
        basis: 'guessed',
        current: m.action,
        from: [src('cut', m.id, `b:${m.id}.action`, 'guessed')],
        slots: { moment: m.action },
        firstAt: m.id,
        affects: [m.id],
      });
  gaps.sort((x, y) => x.priority - y.priority || (x.id < y.id ? -1 : 1));

  // Every flag and gap on the nodes it concerns.
  const nodeOf = (id: string) => cutNodes.get(id) ?? shotNodes.get(id) ?? sceneNodes.get(id);
  for (const f of flags) nodeOf(f.node)?.flags.push(f.id);
  for (const g of gaps) nodeOf(g.node)?.gaps.push(g.id);

  // The dream.
  const library = Object.values(elements)
    .filter((e) => e.sheet)
    .map((e) => ({
      element: e.id,
      item: e.sheet!.item,
      status: e.sheet!.status,
      variants: (stagesOf.get(e.id) ?? []).slice(1).map((s) => s.key),
    }));
  const dream: DreamNode = {
    id: 'dream',
    level: 'dream',
    name: b.title || 'the dream',
    parent: null,
    span: ms.map((m) => m.id),
    own: dreamSheet.own,
    sheet: dreamSheet.sheet,
    elements: [...new Set(sequences.flatMap((q) => q.elements))],
    tags: [],
    flags: flags.filter((f) => f.node === 'dream').map((f) => f.id),
    gaps: [],
    library,
    sequences,
  };
  dream.tags = tagsOf(dream.elements);

  const stagesCount = rows.reduce((a, r) => a + r.stages.length, 0);
  return {
    version: 1,
    basedOn: {
      prep: !prep ? 'none' : input.prepFresh === true ? 'fresh' : input.prepFresh === false ? 'stale' : 'unknown',
      items: items.length,
      frames: frames.length,
    },
    dream,
    elements,
    ledger: { rows, breaks },
    gaps,
    flags,
    index,
    counts: {
      sequences: sequences.length,
      scenes: sceneNodes.size,
      shots: shotNodes.size,
      cuts: cutNodes.size,
      elements: Object.keys(elements).length,
      stages: stagesCount,
      gaps: gaps.length,
      flags: flags.length,
    },
  };

  function tagsOf(ids: string[]): Category[] {
    return SHEET_ORDER.filter((c) => ids.some((id) => elements[id]?.category.value === c));
  }
  function baseNameOf(id: string) {
    return elements[id]?.name ?? baseName(id);
  }
}

/** Signed distance of a point from the axis a→b: its sign says which side of the line it is on. */
function signedFromAxis(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

/** A drawn picture's state, as the tree reports it. */
function drawnOf(i: Item): DrawnState {
  return {
    status: i.status,
    version: i.version,
    ...(i.review ? { review: i.review } : {}),
    ...(i.held?.length ? { held: i.held } : {}),
    ...(i.mediaPath ? { mediaPath: i.mediaPath } : {}),
    ...(i.check && !i.check.error ? { check: { passed: i.check.passed, questions: i.check.questions } } : {}),
    ...(i.continuity?.failed?.length ? { continuityFailed: i.continuity.failed } : {}),
  };
}

/** Every cut of the tree, story order. */
export function cutsOf(tree: DreamTree): CutNode[] {
  return tree.dream.sequences
    .flatMap((q) => q.scenes.flatMap((s) => s.shots.flatMap((sh) => sh.cuts)))
    .sort((a, b) => a.order - b.order);
}

/** An element's complete look at a cut: its sketch's look overlaid with the parts changed and in force there. */
export function lookAt(tree: DreamTree, cut: string, element: string): Record<string, Field<string>> {
  const e = tree.elements[element];
  const node = cutsOf(tree).find((c) => c.id === cut);
  return { ...(e?.look ?? {}), ...(node?.at[element]?.parts ?? {}) };
}

/** Everything one picture is made from, in one place: its sheet, its elements with their looks, its references and breaks. */
export function contextOf(tree: DreamTree, cut: string): CutContext | null {
  const node = cutsOf(tree).find((c) => c.id === cut);
  if (!node) return null;
  return {
    cut,
    sheet: node.sheet,
    elements: Object.values(node.at)
      .filter((e) => e.present !== 'on_plan')
      .map((e) => ({
        ...e,
        category: tree.elements[e.id].category.value!,
        name: tree.elements[e.id].name,
        look: lookAt(tree, cut, e.id),
      })),
    refs: node.refs,
    breaks: tree.ledger.breaks.filter((x) => x.at === cut),
    prev: node.prev,
    prevInShot: node.prevInShot,
  };
}

/** Where a cut sits in the tree: its scene and shot nodes. */
export function whereIs(tree: DreamTree, cut: string): { scene: SceneNode; shot: ShotNode; cut: CutNode } | null {
  for (const q of tree.dream.sequences)
    for (const s of q.scenes)
      for (const sh of s.shots) {
        const c = sh.cuts.find((x) => x.id === cut);
        if (c) return { scene: s, shot: sh, cut: c };
      }
  return null;
}
