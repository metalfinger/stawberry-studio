// The harness viewer's data: one saved dream as today's code would prepare it, every level of the breakdown and
// every picture's preparation, for a person to read cut by cut and judge. Nothing is drawn. Draft, to be agreed
// between the data side (viewer/data.ts) and the page (viewer/page).

export type ViewDream = {
  header: {
    dream: string;
    title: string;
    source: 'frozen' | 'live';
    commit: string;
    /** Every DREAMCHAT_* switch as it was set when this was made. */
    switches: Record<string, string>;
    made: string;
  };
  style: { id: string; name: string; told: string[] };
  /** Everyone and everything with a sketch: the page shows each by its key. */
  elements: {
    id: string;
    name: string;
    kind: 'person' | 'animal' | 'people' | 'place' | 'thing';
    look: string;
    /** sketch:<id>; the file on disk, or null where it was never drawn. */
    key: string;
    file: string | null;
  }[];
  /** Dream → sequence → scene → shot → cut. No sequence level exists in the breakdown yet: one per dream until it does. */
  tree: ViewSequence[];
  cuts: ViewCut[];
  ghosts: ViewGhost[];
  /** What the plan itself flagged. */
  issues: string[];
};

export type ViewSequence = { id: string; title: string; tags: string[]; scenes: ViewScene[] };
export type ViewScene = {
  id: string;
  title: string;
  place: string;
  mood: string;
  tags: string[];
  /** Its floor plan, as a picture where one is rendered. */
  floorPlan: string | null;
  shots: ViewShot[];
};
export type ViewShot = { id: string; tags: string[]; cuts: string[] };

export type ViewRef = {
  /** Its image number in the prompt, "Image n"; null for one the plan chose and the gate did not send. */
  n: number | null;
  role: string;
  /** sketch:p1, ghost:g2, picture:m3, previs:m5 */
  key: string;
  instruction: string;
  /** The line of the prompt about this image. */
  line: string | null;
  /** Who and what it is attached for. */
  subjects: string[];
  file: string | null;
  /** An in-between picture never drawn: what it would be drawn from. */
  ghostPrompt?: string;
};

export type ViewCut = {
  id: string;
  order: number;
  scene: string;
  shot: string;
  /** The moment's own words, as the breakdown has them. */
  moment: {
    action: string;
    looksAt: string;
    feeling: string;
    point: string;
    eyes: 'dreamer' | 'outside';
    distance: string;
  };
  /** role:…, move:…, establishing, pov, … as the corpus tags them. */
  tags: string[];
  camera: { size: string | null; eyes: string; looksAt: string | null; lens: string | null; words: string | null };
  /** The grey mock-up rendered through this cut's camera (free, local). */
  mockUp: string | null;
  /** Across cuts: which earlier pictures it is drawn from and how. */
  links: {
    from: string;
    kind: 'cut' | 'ghost';
    relation: string | null;
    as: 'base' | 'composition' | 'identity' | 'lighting' | 'other';
  }[];
  /** The plan's references, each with what it carries; and those the gate dropped, with why. */
  planned: { key: string; role: string; relation: string | null; carries: string }[];
  unsent: { key: string; why: string }[];
  refs: ViewRef[];
  /** The cut sheet's facts: who is in view, what changes here, what carries from earlier, how each one is now. */
  facts: {
    inView: { id: string; name: string; said: string }[];
    own: { who: string; what: string; now: string }[];
    carried: { who: string; what: string; now: string }[];
    now: string[];
  };
  prompt: string;
  /** Its paragraphs by id (assembled), so the page can fold them. */
  paragraphs: { id: string; text: string }[];
  /** The same moment's prompt with every switch at today's default, for a diff; omitted when asked not to. */
  defaultPrompt?: string;
  /** The picture drawn on the night, where one was. */
  drawn: string | null;
};

export type ViewGhost = {
  id: string;
  kind: 'state' | 'view';
  of: string;
  change: string;
  /** What it is edited from: a sketch, an earlier cut or the in-between picture before it. */
  from: string[];
  usedBy: string[];
  /** How many edits from a sketch or a drawn cut. */
  depth: number;
  why: string;
  prompt: string;
  file: string | null;
};

/** A person's verdict on one cut (and optionally on its references), saved to evals/viewer/<dream>.json. */
export type ViewVerdict = {
  cut: string;
  verdict: 'right' | 'wrong' | 'unsure';
  note: string;
  refs?: Record<string, { verdict: 'right' | 'wrong'; note: string }>;
  commit: string;
  at: string;
};
