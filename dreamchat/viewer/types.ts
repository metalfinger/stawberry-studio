// The harness viewer's data (VIEWER_PLAN.md, draft 2): one saved dream as today's code would prepare it, every level
// of the breakdown, every sheet and in-between picture and every cut's preparation, for a person to read and judge.
// Nothing is drawn, and nothing here is derived: every prompt, image list, fact and mock-up is taken as it is from one
// rebuild of the dream at the commit in the header. To be agreed between the data side (viewer/data.ts) and the page.

export type ViewDream = {
  header: {
    dream: string;
    title: string;
    source: 'frozen' | 'live';
    commit: string;
    /** The named set of switches taken as "the harness", and whether the switches set are all of it. */
    profile: { name: string; full: boolean };
    /** Every DREAMCHAT_* switch as set when this was made. */
    switches: Record<string, string>;
    /** What a rebuild takes as given: each cut as sent once everything before it is drawn and approved, in order. */
    assumes: 'all drawn and approved';
    made: string;
  };
  style: { id: string; name: string; told: string[] };
  /** The dreamer's own words, where this machine has the conversation (a frozen copy keeps none). */
  words: { turn: number; who: 'dreamer' | 'listener'; text: string }[] | null;
  sheets: ViewSheet[];
  /** Dream → sequence → scene → shot → cut: the plan's scenes and shots, grouped by the tree's sequences. */
  tree: ViewSequence[];
  cuts: ViewCut[];
  ghosts: ViewGhost[];
  /** What the plan flagged for the dream as a whole. */
  issues: string[];
};

/** A file this machine has, or null: "not on this machine". */
export type ViewFile = { name: string; sha256: string } | null;

export type ViewSheet = {
  id: string;
  name: string;
  kind: 'person' | 'animal' | 'people' | 'place' | 'thing';
  /** sketch:<id> */
  key: string;
  /** The look as the cut sheets say it. */
  look: string;
  /** The prompt its sketch was drawn from, as the sheet prompt builder makes it. */
  prompt: string | null;
  file: ViewFile;
  /**
   * Whether its sketch was drawn in the saved dream. A sketch not drawn yet is shown as a rebuild takes it, drawn
   * and approved: its look as the story record says it, which is what drawing sends once it is drawn.
   */
  drawn: boolean;
  /** Cuts and in-between pictures it is attached to. */
  usedBy: string[];
  hashes: ViewHashes;
};

export type ViewSequence = { id: string; startsAt: string; splitBy: 'start' | 'jump'; scenes: ViewScene[] };
export type ViewScene = { id: string; title: string; place: string; mood: string; tags: string[]; shots: ViewShot[] };
export type ViewShot = { id: string; tags: string[]; cuts: string[] };

export type ViewRef = {
  /** Its image number in the prompt, "Image n". */
  n: number;
  role: 'identity' | 'location' | 'prop' | 'base' | 'composition';
  source: 'edit' | 'mockup' | 'sketch' | 'ghost' | 'earlier';
  /** sketch:p1, ghost:g2, picture:m3, previs:m5 */
  key: string;
  instruction: string;
  /** The prompt's line for this image. */
  line: string;
  /** Who and what it is attached for. */
  subjects: string[];
  file: ViewFile;
  /** A sketch not drawn yet in the saved dream: its line reads as it will once the sketch is drawn. */
  notDrawnYet?: true;
};

export type ViewUnsent = {
  key: string;
  code:
    | 'reverse'
    | 'camera_far'
    | 'state_differs'
    | 'no_cameras_words_differ'
    | 'judged_wrong'
    | 'stale'
    | 'light_only'
    | 'has_sketch'
    | 'seat_replaced_by_view'
    | 'cap'
    | 'edit_to_own_camera';
  detail: string;
};

/** A camera on the floor plan, for the top view: metres and degrees in the plan's own frame. */
export type ViewEye = { x: number; y: number; height: number; dir: number; fov: number; lens: number | null };

export type ViewCut = {
  id: string;
  order: number;
  sequence: string;
  scene: string;
  shot: string;
  /** Where the tree (tree.ts) puts this cut differently from the plan, in words; null where they agree. */
  treeDiffers: string | null;
  moment: {
    action: string;
    looksAt: string;
    feeling: string;
    point: string;
    eyes: 'dreamer' | 'outside';
    distance: string;
  };
  /** role:…, move:…, change:…, flags, as tagWords gives them. */
  tags: string[];
  camera: { size: string | null; eyes: string; looksAt: string | null; words: string | null; eye: ViewEye | null };
  /** The floor plan from above, for the top view: everyone and everything on it; null without one. */
  floor: {
    room: { w: number; d: number };
    spots: { id: string; name: string; x: number; y: number; w?: number; d?: number; facing?: number }[];
  } | null;
  /** The drawing path's own mock-up (Image 1 where it is sent), by its sha256; null without a floor plan. */
  mockUp: ViewFile;
  /** The earlier cuts and in-between pictures it is drawn from, with the plan's relation and role as they are. */
  links: { from: string; kind: 'cut' | 'ghost'; relation: string | null; role: string }[];
  refs: ViewRef[];
  unsent: ViewUnsent[];
  facts: {
    inView: { id: string; name: string; said: string }[];
    own: { who: string; what: string; now: string }[];
    carried: { who: string; what: string; now: string }[];
    now: string[];
  };
  /** The plan's issues that name this cut. */
  issues: string[];
  prompt: string;
  /** Its paragraphs by id, so the page can fold them. */
  paragraphs: { id: string; text: string }[];
  /** A live dream's night: the picture drawn, the images really sent, and whether the prompt sent was this one. */
  drawn: { file: ViewFile; sentImages: string[]; samePrompt: boolean } | null;
  hashes: ViewHashes;
};

export type ViewGhost = {
  id: string;
  kind: 'state' | 'view';
  of: string;
  change: string;
  /** What it is edited from: a sketch, an earlier cut or the in-between picture before it. */
  from: string[];
  usedBy: string[];
  /** Edits from a sketch or a drawn cut. */
  depth: number;
  why: string;
  refs: ViewRef[];
  prompt: string;
  file: ViewFile;
  hashes: ViewHashes;
};

/**
 * What a verdict was given on, by aspect: the chain (image keys, roles and order, the mock-up's sha256, the camera),
 * the words (the prompt) and the facts (the sheet's facts). A verdict is read again in full when its chain moves;
 * when only the words or facts move, the diff alone is shown and confirmed.
 */
export type ViewHashes = { chain: string; words: string; facts: string };

export type ViewVerdict = {
  /** A cut, an in-between picture or a sheet: m5, g2, sketch:p1. */
  node: string;
  verdict: 'right' | 'wrong' | 'unsure';
  /** With wrong: what is wrong. */
  wrong?: ('layout' | 'references' | 'words')[];
  note: string;
  hashes: ViewHashes;
  commit: string;
  at: string;
};

/** The owner's verdicts on one dream, as the page saves them: evals/viewer/<dream>.json, written whole. */
export type ViewAnswers = {
  dream: string;
  source: 'frozen' | 'live';
  /** By node (a cut, an in-between picture, or sketch:<id>), the latest verdict. */
  verdicts: Record<string, ViewVerdict>;
};
