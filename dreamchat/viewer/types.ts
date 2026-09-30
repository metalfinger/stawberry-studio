// The harness viewer's data (VIEWER_PLAN.md, draft 2): one saved dream as today's code would prepare it, every level
// of the breakdown, every sheet and in-between picture and every cut's preparation, for a person to read and judge.
// Nothing is drawn, and nothing here is derived: every prompt, image list, fact and mock-up is taken as it is from one
// rebuild of the dream at the commit in the header. To be agreed between the data side (viewer/data.ts) and the page.

export type ViewDream = {
  header: {
    dream: string;
    /** A short key for links: the id's last four characters ("0f40"); the page resolves a link by suffix. */
    slug: string;
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

/**
 * A file this machine has, or null: "not on this machine". `changed`: a frozen dream's image read from its live copy,
 * where the live copy has drawn it again since the dream was frozen (not the take the frozen dream names).
 */
export type ViewFile = { name: string; sha256: string; changed?: true } | null;

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
  /**
   * Whether today's prompt for it is the one its sketch was drawn from: the dream keeps each take's prompt as a hash
   * only (`checkedTakes`), so the night's text cannot be shown. Null where no take was checked.
   */
  drawnFrom: { same: boolean; take: number } | null;
  /** Cuts and in-between pictures it is attached to. */
  usedBy: string[];
  hashes: ViewHashes;
};

/** `number`: 1, 2… in story order; `title`: the words of the jump that opens it, else its first scene's title. */
export type ViewSequence = {
  id: string;
  number: number;
  title: string | null;
  startsAt: string;
  splitBy: 'start' | 'jump';
  scenes: ViewScene[];
};
/** `number`: the tree's own ("1", "2A", "2B" where a scene is cut into another), null where the tree has none. */
export type ViewScene = {
  id: string;
  number: string | null;
  title: string;
  place: string;
  mood: string;
  tags: string[];
  shots: ViewShot[];
};
/** `number`: the tree's own ("2A-1"), null where the tree has none. */
export type ViewShot = { id: string; number: string | null; tags: string[]; cuts: string[] };

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
  /**
   * What it names (a sketch, an earlier cut, an in-between picture) is not drawn yet in the saved dream: the page
   * shows a placeholder, and the line reads as it will once it is drawn. Never on a mock-up (rendered, not drawn).
   */
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
    | 'edit_to_own_camera'
    | 'not_recorded';
  detail: string;
  /** It was the picture to edit: held back, so the moment is made from its own shot and mock-up instead. */
  base?: true;
};

/** A camera on the floor plan, for the top view: metres and degrees in the plan's own frame. */
export type ViewEye = { x: number; y: number; height: number; dir: number; fov: number; lens: number | null };

export type ViewCut = {
  id: string;
  order: number;
  sequence: string;
  scene: string;
  shot: string;
  /** Its place in its shot: 1, 2… in story order. */
  shotIndex: number;
  /**
   * Where the panel's tree (tree.ts from session.ts treeInputOf: the plan as a re-plan makes it now) groups this cut
   * otherwise than the plan the prompts are made from (ledger row 2), in words; null where they agree.
   */
  treeDiffers: string | null;
  /** The cut before it in the same scene, whose camera the top view shows beside its own; none across a scene. */
  prevCut: string | null;
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
  /**
   * The floor plan from above, for the top view, in the plan's own frame: metres, x to the right as one faces the
   * front, y growing away from the front (the front is -y, as SVG's y grows down the page). Null without one.
   */
  floor: {
    /** Across (x) and deep (y), where the plan says; null where it does not (the page fits the spots). */
    room: { w: number; d: number } | null;
    /** The plan's front: its words ("the lift doors") and its direction, always { x: 0, y: -1 }. */
    front: { words: string; dir: { x: number; y: number } };
    indoors: boolean | null;
    spots: {
      id: string;
      name: string;
      x: number;
      y: number;
      /** Across and deep in metres, for a thing with a size. */
      w?: number;
      d?: number;
      kind?: 'person' | 'thing';
      many?: boolean;
      /** Which way it faces, as a unit direction on the plan (blocking.ts facing). */
      facing: { x: number; y: number };
    }[];
  } | null;
  /**
   * The drawing path's own mock-up for this cut, by its sha256 (session.ts previsFor), whether or not its picture was
   * written; `sent` says whether the prompt sends it (as Image 1). Null without a worked-out camera on a floor plan.
   */
  mockUp: { name: string; sha256: string; sent: boolean } | null;
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
  drawn: { file: ViewFile; sentImages: string[] | null; samePrompt: boolean | null } | null;
  hashes: ViewHashes;
};

export type ViewGhost = {
  id: string;
  kind: 'state' | 'view';
  of: string;
  change: string;
  /**
   * What it is made from: whom it shows, the image it edits (its reference with the role "base", by key), and the
   * in-between picture of the same one's change before it, which it follows.
   */
  from: { subject: string; editedFrom: string | null; after: string | null };
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
  /** The prompt and facts it was given on, so a later change to the words or facts alone can be shown and confirmed. */
  shown?: { prompt: string; facts?: unknown };
  commit: string;
  at: string;
};

/** The owner's verdicts on one dream, as the page saves them: evals/viewer/<dream>.json, written whole. */
export type ViewAnswers = {
  dream: string;
  source: 'frozen' | 'live';
  /** By node (a cut, an in-between picture, or sketch:<id>), the latest verdict. */
  verdicts: Record<string, ViewVerdict>;
  /** By node, the verdicts it replaced, oldest first (the page appends; the report reads only the latest). */
  history?: Record<string, ViewVerdict[]>;
};
