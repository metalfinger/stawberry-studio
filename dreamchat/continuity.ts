// The continuity plan: which earlier pictures each cut is drawn from, and the ghosts it needs.
//
// A storyboard has to read as one sequence, and frames drawn from the sheets alone look like
// the same world but not like a sequence. So every cut is drawn from the earlier cuts it has to
// match, chosen by the story (Jev's `from`) and by how the camera moves (same setup, same side,
// the other side, another place, or a jump the dream itself made). Where one edit would have to
// change too much at once, or several cuts need the same changed look, a ghost is made first:
// an in-between picture that is never a cut. Everything here is pure: the breakdown in, the plan
// out, and the same breakdown always gives the same plan.
import {
  type Blocking,
  bearing,
  DIRECTIONS,
  type Eye,
  facing,
  type Move,
  outsideOrder,
  roomOf,
  settle,
  sizeOf,
  type Spot,
  unit as unitOf,
} from './blocking';
import {
  bodyHeight,
  cameraMode,
  goingIn,
  headWord,
  mounted,
  ON_THE_LINE,
  outThroughWindows,
  REVERSE_DEGREES,
  SAME_SIDE_DEGREES,
  sameCameraAs,
  signedFromLine,
  turnedBetween,
  WATER,
  waterLevel,
  wordsAbout,
} from './camera';
import { dreamerShot, onOf, outsideShot } from './previs';
import { type Breakdown, hasBefore, isWhole, type Moment, moments, POSITION, type State } from './producer';
import type { NowOf } from './record';
import { refsMode, SEVERAL } from './refs';

export type Relation = 'same_setup' | 'same_side' | 'other_side' | 'other_place' | 'shift' | 'seat';
export type RefRole = 'base' | 'composition' | 'lighting' | 'identity' | 'prop' | 'location';

export type PlanRef = {
  /** A moment id or a ghost id. */
  id: string;
  kind: 'cut' | 'ghost';
  role: RefRole;
  relation?: Relation;
  /** What it gives this picture, in plain words for the prompt and the panel. */
  carries: string;
  /**
   * The people it shows as last drawn, when it is only the picture they were last seen in: it goes
   * in for those whose sketch is not in the picture, since a sketch alone says who someone is.
   */
  who?: string[];
  /**
   * A jump the dream made within the same place, facing another side of it: only where things sit
   * in the frame carries, never the framing itself.
   */
  turned?: boolean;
};

/**
 * A continuity check for the judge: `with` is the earlier picture to compare against (a moment's
 * id, or `sheet:<id>` for a person's own sheet), if any. `fix` says it as an instruction, for a
 * redraw when the check fails.
 */
export type Criterion = { with: string | null; text: string; fix: string };

export type CutPlan = {
  id: string;
  order: number;
  /** Its scene, and its shot there: one camera setup (place, side, framing, eyes). */
  scene: string;
  shot: string;
  refs: PlanRef[];
  /** What this moment itself changes: the picture shows it done, and it holds from here on. */
  own: State[];
  /**
   * Changes from earlier moments still in force for what is in view, spelled out in the prompt.
   * One this moment changes again is not among them: the melting ice gives way to the horse.
   */
  states: State[];
  /**
   * The people in view from left to right, as their scene first placed them: every picture of the
   * scene keeps it, so the line between them is never crossed (the dreamer and the young woman
   * swapped sides at the scene's last picture, 23 Sep). Empty with fewer than two in view.
   */
  staging: string[];
  /** The location sheet sets the layout only when the cut faces the side it shows. */
  sheetLayout: boolean;
  /** What differs from its references. Three or more is too much for one edit. */
  changes: string[];
  /** The cuts and ghosts that must be drawn and approved first. */
  needs: string[];
  criteria: Criterion[];
  /** Generations from the sheets: drift grows with it. */
  depth: number;
  transition: string;
  matchFrame?: string;
  /**
   * Through the dreamer's eyes, on a scene with a floor plan: what they see from where they are,
   * read off the render of their view (previs.ts).
   */
  view?: string;
  /** The camera that view is from: where their eyes are on the plan, how high, which way they look. */
  eye?: Eye;
  /** Who and what that view has in the picture: drawn from their sketches like anyone in view. */
  sees?: string[];
  /**
   * With the camera rules, through the dreamer's own eyes: what they carry that the moment does not name,
   * out of the picture (`unsaidHeld`): off the mock-up, out of "In it" and its images, no hands for it.
   */
  carriedUnseen?: string[];
  /** What is wrong with how that view frames the people it shows, read off its render; none when it is framed well. */
  framing?: string[];
  /** Seen from outside, on a scene with a floor plan: who and what is where, left to right. */
  across?: string[];
  /** Seen from outside, on a scene with a floor plan: where the camera stands, in words. */
  camera?: string;
  /**
   * Made from the story record: who and what the moment has in view (its own lists, and whoever the
   * record finds there), and how each one is right then, in words, by who or what it is said of.
   */
  visible?: string[];
  things?: string[];
  now?: { of: string; text: string }[];
  /** Made from the story record: how each one is right then, as typed facts (`now` is them in words). */
  facts?: NowOf[];
  /** Made from the story record: by who or what, words of its look from after a change, left out of it. */
  unsaid?: Record<string, string[]>;
  /** With the camera rules: the cut whose side of the scene's line this one crossed from. */
  crossed?: string;
  /** Why: it looks past them at what only that side shows, or only from there are they all in it. */
  crossedWhy?: 'looks' | 'framing';
  /** With the camera rules: an earlier cut of the same people at the same size whose camera it could not leave. */
  sameCamera?: string;
  /**
   * With S5's references (DREAMCHAT_REFS): earlier pictures the cut stands in a relation to but is not drawn
   * from (for its light alone, for someone with a sketch, from another side), so never waited for. The judge
   * still compares against them, and the camera rules settle their relations as for any other.
   */
  unsent?: PlanRef[];
  /** With S5's references: why each earlier picture in `unsent` is not sent, by its id (`UnsentWhy`). */
  unsentWhy?: Record<string, UnsentWhy>;
  /**
   * With the camera rules or S5's references, for a cut edited from the picture before: where its own camera
   * would stand. A same setup is the same camera, so it is an edit only where this is the picture's camera.
   */
  wouldBe?: Eye;
  /**
   * With S5's references, for a cut seen from outside that edits the picture before: its own shot, placed on its
   * floor plan as any other cut's is, for when that picture is not sent after all (judged wrong, or stale on the
   * drawing path): then the cut is made from its own mock-up, never from nothing (`unedited`).
   */
  alone?: { view: string; eye: Eye; sees: string[]; framing?: string[]; rules?: string[] };
  /**
   * With the camera rules: what they add to the view, said after it (and after a brief written for it):
   * the water, what is out past a window, which way what is ridden goes, a crossing of the line.
   */
  rules?: string[];
  why: string;
};

/**
 * Why S5's references leave an earlier picture out of what a cut is drawn from:
 * - `reverse`: its camera is turned round from this one (a reverse);
 * - `camera_far`: its camera is not near this one on one floor plan (distance, turn or height);
 * - `state_differs`: what both show does not stand alike (a change in force in one and not the other);
 * - `no_cameras_words_differ`: no cameras on one floor plan to compare, and the words do not make it the same view;
 * - `light_only`: planned for its light alone;
 * - `has_sketch`: planned for who someone is, and everyone it would show has a sketch of their own;
 * - `seat_replaced_by_view`: the dreamer's seat, where the view is worked out on the floor plan from where they are;
 * - `edit_to_own_camera`: planned as the picture edited, and made its own cut on its floor plan instead;
 * - `not_recorded`: left out with no reason recorded where it was left out (a gap to fix, never a cause to read).
 */
export type UnsentWhy = {
  code:
    | 'reverse'
    | 'camera_far'
    | 'state_differs'
    | 'no_cameras_words_differ'
    | 'light_only'
    | 'has_sketch'
    | 'seat_replaced_by_view'
    | 'edit_to_own_camera'
    | 'not_recorded';
  detail: string;
};

export type GhostPlan = {
  id: string;
  kind: 'state' | 'view';
  /** The person, place or thing it shows. Its sheet is the picture edited. */
  of: string;
  label: string;
  /** The one edit, in words. */
  change: string;
  /** The cut that shows how the change looks, or the place's light; null for the sheet alone. */
  from: string | null;
  /** The ghost of this subject's change before, edited in turn: one change per edit. */
  after?: string;
  needs: string[];
  usedBy: string[];
  why: string;
  state?: State;
  looksAt?: string;
  depth: number;
  /** Made from the story record: its change's key, and how its subject looked just before it. */
  key?: string;
  before?: { text: string; said: boolean }[];
  /**
   * With S5's references (DREAMCHAT_REFS): every change it shows, the ones before it that it was edited
   * from and its own, so a cut drawn from it alone knows what it carries.
   */
  shows?: { what: string; now: string }[];
};

export type ContinuityPlan = { cuts: CutPlan[]; ghosts: GhostPlan[]; issues: string[] };

/**
 * What the continuity plan takes from the story record (record.ts, DREAMCHAT_RECORD=on), by moment: the
 * changes it makes and the ones still in force from earlier, each known by its key; who and what is in
 * it; who is there without being what it is about (on the floor plan, drawn where the camera takes them
 * in) and who has gone (never on it); who holds what; and how each one is right then, in words. And by
 * change: how its subject looked just before it, for its in-between picture, and where it ends.
 */
export type RecordPlan = {
  moments: Record<
    string,
    {
      own: State[];
      carried: State[];
      visible: string[];
      things: string[];
      present: string[];
      gone: string[];
      held: Record<string, string>;
      now: { of: string; text: string }[];
      /** The same, as typed facts: what `now` says, before it is put in words. */
      facts: NowOf[];
    }
  >;
  before: Record<string, { text: string; said: boolean }[]>;
  /** By change: the moment it no longer holds from, where it ends. */
  ends: Record<string, string>;
  /** By who or what: words its sketch's look has that are from after a change, never told as its look. */
  unsaid: Record<string, string[]>;
};

/**
 * What an in-between picture is, as a key that survives planning again: its subject, its kind and
 * its change. Keyed by its place in the list ("g1"), the classroom's seaweed, found after the
 * production was written, took Mr Hale's octopus requirement, its approval was refused, and every
 * moment drawn from it after (sea school, 26 Sep).
 */
export const ghostKey = (g: Pick<GhostPlan, 'of' | 'kind' | 'state' | 'looksAt' | 'label'>): string =>
  `req:${g.of}:${g.kind}:${
    g.state
      ? `${g.state.what.toLowerCase().trim()}=${g.state.now.toLowerCase().trim()}`
      : (g.looksAt ?? g.label).toLowerCase().trim()
  }`;

/**
 * How near an earlier picture's camera must be to a cut's for the cut to be drawn from it (S5): the same place
 * on one floor plan, within these metres, degrees of turn and metres of height.
 */
const NEAR = { metres: 1.5, degrees: 30, height: 1 };

/** At most this many earlier cuts per picture: more references blur what each one is for. */
const MAX_EARLIER = 3;
/** At most this many base edits in a row; the next re-anchors on the sheets, so drift stops. */
const MAX_BASE_RUN = 2;
/** Three changes or more in one edit is where a ghost goes in between. */
const TOO_MANY = 3;
const WIDTH: Record<Moment['distance'], number> = { wide: 3, medium: 2, close: 1 };

/** Words that say what something is, not how it is said: plural or not, without the little words. */
const WEAK = new Set([
  'the',
  'a',
  'an',
  'of',
  'at',
  'on',
  'in',
  'to',
  'by',
  'with',
  'from',
  'and',
  'its',
  'their',
  'his',
  'her',
  'sort',
  'kind',
  'some',
]);
const said = (x: string) =>
  x
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !WEAK.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
/** What a name is about: its last word before "at", "on", "with" and the like ("the woman at the stove": woman). */
const headOf = (x: string) =>
  said(x.toLowerCase().split(/\s(?:at|on|in|with|by|near|from|beside|behind|under|over)\s/)[0]).at(-1);

/**
 * Which of `names` some words mean: the one sharing most of what they say, what each is about
 * counting double; none where they share nothing. "The village street" is "the cobblestone
 * street", and "the woman at the stove" is the woman: matched letter for letter, the street was
 * missed and the camera turned its back on the village (25 Sep).
 */
export function meant(words: string, names: { id: string; name: string }[]): string | undefined {
  const w = said(words);
  const head = headOf(words);
  let best: { id: string; score: number } | undefined;
  for (const n of names) {
    const has = said(n.name);
    if (has.join(' ') === w.join(' ') && w.length) return n.id;
    const shared = w.filter((x) => has.includes(x)).length;
    const heads = !!head && headOf(n.name) === head;
    // Every word of its name said: "the autoclave side of the room" is by the autoclave.
    const whole = has.length > 0 && has.every((x) => w.includes(x));
    const score = shared + (heads ? 1 : 0) + (head && has.includes(head) ? 0.5 : 0);
    // One word in passing is not the same thing: "the village street" is not "village houses left".
    if ((heads || whole || shared >= 2) && (!best || score > best.score)) best = { id: n.id, score };
  }
  return best?.id;
}

/**
 * Every one of `names` some words mention, by all the words of its name or by what it is about:
 * "knowing it is for the lighthouse" mentions "the white lighthouse".
 */
export function mentioned(words: string, names: { id: string; name: string }[]): string[] {
  const w = said(words);
  return names
    .filter((n) => {
      const has = said(n.name);
      const head = headOf(n.name);
      return (has.length > 0 && has.every((x) => w.includes(x))) || (!!head && w.includes(head));
    })
    .map((n) => n.id);
}

/** Two `looks_at` in the same words face the same side. */
export function sameWords(a: string, b: string): boolean {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/\b(the|a|an)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return norm(a) === norm(b);
}

/** What a moment calls who and what is in it: the dreamer, and what has turned into something else by what it is now. */
export function calledIn(
  b: Breakdown,
  c: {
    id: string;
    own: { who: string; what: string; now: string }[];
    states: { who: string; what: string; now: string }[];
  },
) {
  const changed = [...c.own, ...c.states];
  return (id: string) => {
    const st = changed.find((x) => x.who === id && isWhole(x));
    if (st) return st.now;
    const p = b.people.find((x) => x.id === id);
    if (p) return p.is_dreamer ? 'the dreamer' : p.name;
    return (
      b.things.find((x) => x.id === id)?.name ??
      b.places.find((x) => x.id === id)?.name ??
      fixtureName(b, id, c.id) ??
      id
    );
  };
}

/**
 * A fixture of the place a moment happens in, by its name on that place's floor plan: "the autoclave",
 * never "x1". Fixture ids are the plan's own (x1, x2 on every plan), so it is looked up on the moment's
 * plan only: read across every scene, lighthouse-fresh m9's window (x1 of the round room) was called
 * "the lighthouse", the beach's x1, and no brief of it could name it (27 Sep).
 */
export const fixtureName = (b: Breakdown, id: string, moment: string) =>
  placePlan(b, moment)?.spots.find((s) => s.id === id && s.fixture)?.name;

/** A lasting change's key: who, what, what it is now, and since which moment. */
export const stateKey = (st: State) => `${st.who}/${st.what}/${st.now}/${st.since}`;
/** A change as the plan knows it: the story record's key where it has one, else who, what, now and since. */
const changeKey = (st: State) => st.key ?? stateKey(st);

/**
 * A name as a picture is told it. The people of a dream are named as the dreamer said them, and
 * "your aunt" in an instruction to a picture brings a viewer ("you") into it: she is "the
 * dreamer's aunt".
 */
export const pictureName = (name: string) =>
  name.replace(/\byour\b/gi, "the dreamer's").replace(/\byou\b/gi, 'the dreamer');

/**
 * Who a picture shows as people. Through the dreamer's own eyes the dreamer is the camera: at most
 * their own hands or feet show, never their face (the glass world's point-of-view moments were
 * given the dreamer's face sheet, and checked for "the same face").
 */
/**
 * A moment's scene's floor plan with only who and what is there by then: whoever has been seen in
 * the scene so far, and what has been in it, and the dreamer. Someone who comes in later is not in
 * the room yet, for the camera or its previs.
 */
/**
 * The floor plan of the place a moment happens in: its scene's own plan, or the plan of another
 * place the scene moves through. None where the scene has no plan.
 */
export function placePlan(b: Breakdown, momentId: string): Blocking | undefined {
  const scene = b.scenes.find((sc) => sc.moments.some((x) => x.id === momentId));
  const m = scene?.moments.find((x) => x.id === momentId);
  if (!scene?.blocking || !m) return undefined;
  return scene.blocking.places?.[m.place] ?? scene.blocking;
}

export function planBy(b: Breakdown, momentId: string, rec?: RecordPlan): Blocking | undefined {
  const raw = rawPlanBy(b, momentId, rec);
  return raw ? settle(raw, { tandem: cameraMode() === 'on' }) : undefined;
}

/**
 * The plan by a moment as the planner made it: its spots where their latest moves put them, before
 * settling. With the story record, who and what is there by now is whoever the record has there in the
 * moments so far, never whoever it has gone, and who holds what is as the record has it.
 */
export function rawPlanBy(b: Breakdown, momentId: string, rec?: RecordPlan): Blocking | undefined {
  const scene = b.scenes.find((sc) => sc.moments.some((x) => x.id === momentId));
  const given = placePlan(b, momentId);
  if (!scene || !given) return undefined;
  // With the camera rules, each fixture the place's words put up a wall or on the ceiling is there, off the
  // floor (camera.ts mounted): the high round window stood on the floor, under the water.
  const plan = cameraMode() === 'on' ? mounted(given, placeWordsOf(b, momentId)) : given;
  // Only the moments in the same place count: who was in the tiny room, not who was on the stairs.
  const own = (x: Moment) =>
    given === scene.blocking ? !scene.blocking?.places?.[x.place] : scene.blocking?.places?.[x.place] === given;
  const upTo = scene.moments.slice(0, scene.moments.findIndex((x) => x.id === momentId) + 1).filter(own);
  const r = rec?.moments[momentId];
  const there = new Set(
    upTo.flatMap((x) => {
      const y = rec?.moments[x.id];
      return [...x.visible, ...x.things, ...(y ? [...y.visible, ...y.things, ...y.present] : [])];
    }),
  );
  for (const id of r?.gone ?? []) there.delete(id);
  const things = new Set((b.things ?? []).map((t) => t.id));
  const dreamerId = b.people.find((p) => p.is_dreamer)?.id;
  // Where each person (or car) is by now: their spot, as their latest move up to this moment
  // leaves them. She walked to the far end of the room and came back; a spot for the whole scene
  // kept her standing where she started (24 Sep).
  const moved = new Map<string, Move>();
  for (const x of upTo) for (const mv of plan.moves?.[x.id] ?? []) moved.set(mv.id, mv);
  // With the camera rules: what stands in a wall where a window is, or past it, is out past the place,
  // never on its floor (camera.ts outThroughWindows); and the water stands as high as the record says it
  // does here, or, where the record's words do not measure it, as high as they last did in this place.
  const camera = cameraMode() === 'on';
  const beyond = camera ? outThroughWindows(plan) : {};
  // How high each creature of the dream stands, where its look says how big it is: what water covers of it.
  const heights = camera ? bodiesOf(b) : {};
  const beings = Object.entries(heights).map(([id, height]) => ({
    name: b.people.find((p) => p.id === id)?.name ?? id,
    height,
  }));
  let water: number | null = null;
  if (camera && rec)
    for (const x of upTo) {
      const w = waterAt(rec.moments[x.id]?.facts ?? [], plan, beings, [x.action, x.visual_point].join('. '));
      water = w.has ? (w.level ?? water) : null;
    }
  // Whoever rides a boat on it keeps their head under the ceiling: "almost up to the ceiling" with a boat
  // afloat is as high as they can sit in it.
  if (water !== null && plan.indoors && plan.spots.some((x) => x.shape === 'vehicle'))
    water = Math.min(water, Math.max(0.1, (plan.ceiling ?? 3.2) - 1.6));
  return {
    ...plan,
    ...(Object.keys(beyond).length ? { outside: { ...beyond, ...(plan.outside ?? {}) } } : {}),
    ...(water !== null ? { water } : {}),
    spots: plan.spots
      .filter((s) => !(s.id in beyond))
      .filter((s) => (there.has(s.id) || s.id === dreamerId || s.fixture) && !r?.gone.includes(s.id))
      .map((s) => {
        const mv = moved.get(s.id);
        const placed = mv
          ? {
              ...s,
              x: mv.x,
              y: mv.y,
              ...(mv.faces ? { faces: mv.faces } : {}),
              ...(mv.pose ? { pose: mv.pose } : {}),
            }
          : s;
        // In the water, how high a creature's body stands (the camera rules).
        const at = water !== null && heights[s.id] !== undefined ? { ...placed, height: heights[s.id] } : placed;
        // Handed over or put down: whoever holds it from this moment, or nobody.
        if (mv?.heldBy !== undefined) {
          if (mv.heldBy) at.heldBy = mv.heldBy;
          else delete at.heldBy;
        }
        // With the record, a thing is in someone's hands only where the record has it there.
        if (r && things.has(s.id) && (r.held[s.id] ?? null) !== (at.heldBy ?? null)) {
          const { heldBy: _, ...loose } = at;
          return r.held[s.id] ? { ...loose, heldBy: r.held[s.id] } : loose;
        }
        return at;
      }),
  };
}

/** The words of the place a moment happens in: its layout and what stands in it, as the breakdown says them. */
export function placeWordsOf(b: Breakdown, momentId: string): string {
  const m = b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === momentId);
  const l = m ? b.places.find((x) => x.id === m.place) : undefined;
  const f = (l?.fields ?? {}) as Record<string, { value?: string | null } | undefined>;
  return [f.geography?.value, f.landmarks?.value].filter(Boolean).join('; ');
}

/**
 * Whether the story record has water in a moment's place, and how high its words say it stands
 * (camera.ts waterLevel), or the moment's own words (`told`) by a creature they put under it: none
 * measured where they do not say.
 */
function waterAt(
  facts: NowOf[],
  plan: Blocking,
  beings: { name: string; height: number }[] = [],
  told = '',
): { has: boolean; level: number | null } {
  let has = false;
  for (const f of facts)
    if (f.kind === 'place')
      for (const x of f.facts)
        if (x.kind === 'part' && (WATER.test(x.part) || WATER.test(x.what))) {
          has = true;
          const level = waterLevel(x.now, plan, beings, told);
          if (level !== null) return { has, level };
        }
  return { has, level: null };
}

/**
 * How high the body of each of the dream's people and creatures stands where their look says how big
 * they are (camera.ts bodyHeight), by id; never the dreamer. Read from who they are and how they look.
 */
function bodiesOf(b: Breakdown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of b.people ?? []) {
    if (p.is_dreamer) continue;
    const f = p.fields ?? ({} as Breakdown['people'][number]['fields']);
    const look = [f.identity?.value, f.appearance?.value, f.distinctive_features?.value].filter(Boolean).join('; ');
    const h = bodyHeight(look);
    if (h !== null) out[p.id] = h;
  }
  return out;
}

/**
 * What a moment's camera is rendered from: its scene's floor plan as it is by then. Through the
 * dreamer's eyes, everyone there is where they are; seen from outside, the people are those the
 * moment shows, as the dream tells it, and the things are all there.
 */
export function shotPlan(b: Breakdown, momentId: string, rec?: RecordPlan): Blocking | undefined {
  const where = planBy(b, momentId, rec);
  const m = b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === momentId);
  if (!where || !m) return where;
  if (m.eyes === 'dreamer') {
    const unsaid = cameraMode() === 'on' ? unsaidHeld(b, m, where) : [];
    return unsaid.length ? { ...where, spots: where.spots.filter((s) => !unsaid.includes(s.id)) } : where;
  }
  const people = new Set(b.people.map((p) => p.id));
  // With the record, also whoever it has there out of the moment's focus: drawn where the camera takes them in.
  const r = rec?.moments[momentId];
  const shown = new Set([...m.visible, ...(r ? [...r.visible, ...r.present] : [])]);
  return { ...where, spots: where.spots.filter((s) => !people.has(s.id) || shown.has(s.id)) };
}

/**
 * Through the dreamer's own eyes, what they carry is out of the picture unless the moment's words (what
 * happens, what it must show, what it looks at) name it (the owner, 27 Sep): the paper boat was put in the
 * dreamer's hands before their eyes as they looked out of the window at the tractor, a boat the moment never
 * said (lighthouse-fresh m9). By id; a thing whose name says nothing of what it is stays.
 */
export function unsaidHeld(
  b: Breakdown,
  m: Pick<Moment, 'eyes' | 'action' | 'visual_point' | 'looks_at'>,
  plan: Blocking,
): string[] {
  const me = b.people.find((p) => p.is_dreamer)?.id;
  if (!me || m.eyes !== 'dreamer') return [];
  const words = [m.action, m.visual_point, m.looks_at].join('. ');
  return plan.spots
    .filter((s) => s.heldBy === me)
    .filter((s) => {
      const head = headWord(b.things?.find((t) => t.id === s.id)?.name ?? s.name ?? '');
      return !!head && !wordsAbout(head, words).length;
    })
    .map((s) => s.id);
}

export const seenIn = (m: Pick<Moment, 'visible' | 'eyes'>, dreamerId?: string) =>
  m.eyes === 'dreamer' && dreamerId ? m.visible.filter((p) => p !== dreamerId) : m.visible;

/** Everything a picture shows that a lasting change can be seen on, its place included. */
export const inViewAt = (m: Moment) => new Set([...m.visible, ...m.things, ...(m.place ? [m.place] : [])]);

const CARRIES: Record<Relation, string> = {
  same_setup: 'the same view a moment earlier: the room, the light and where everyone is',
  same_side: 'the same place from the same side: where its walls, furniture and people are, and its light',
  other_side:
    'the same place from the other side: the light to keep, said in words and checked against it; not drawn from',
  other_place: 'how everyone in it looks right now; not its background',
  shift: 'the picture just before the dream jumps: its framing and where everyone is',
  seat: 'where the dreamer is: the camera is at their eyes there, turned toward what this moment faces',
};

const ROLE: Record<Relation, RefRole> = {
  same_setup: 'composition',
  same_side: 'composition',
  other_side: 'lighting',
  other_place: 'identity',
  shift: 'composition',
  seat: 'composition',
};

/** Which earlier moments face the same side of the place: Jev's answer, or the same words. */
const sameSide = (m: Moment, e: Moment) =>
  m.sameSide
    ? m.sameSide.includes(e.id)
    : e.place === m.place && (!e.looks_at || !m.looks_at || sameWords(e.looks_at, m.looks_at));

/**
 * How a later moment's camera stands to an earlier one's, over moments in story order: the picture
 * just before a jump the dream made, another place, the other side of the same place, the same side,
 * or the same setup (the same side, size and eyes). A dream's jump is a boundary: what came before it
 * shares no place with what comes after, even filed under the same name (the room before the glass
 * world was drawn again after the jump, 23 Sep). Only the jump's own picture is matched to the one
 * just before it.
 */
export function relationIn(
  ms: Moment[],
  /**
   * With the camera rules (camera.ts): the jump's own moment is on the far side of the jump, with what
   * follows it, never a boundary behind itself (the moment after a jump in the same place was read as
   * "another place", the key-and-boat dream m7 and m9, the lift m5); and where both cameras are placed
   * on one floor plan, `sides` says from them whether two moments face the same side of the place.
   */
  opts: {
    camera?: boolean;
    sides?: (m: Moment, e: Moment) => boolean | undefined;
    /** Where both cameras are placed on one plan: whether they are the same camera, as a same setup's is. */
    same?: (m: Moment, e: Moment) => boolean | undefined;
  } = {},
): (m: Moment, e: Moment) => Relation {
  const index = new Map(ms.map((m, i) => [m.id, i]));
  const acrossJump = (e: Moment, m: Moment) =>
    ms.some((k, at) => {
      const ei = index.get(e.id)!;
      const mi = index.get(m.id)!;
      return !!k.shift && ((ei < at && at <= mi) || (!opts.camera && ei === at && at < mi));
    });
  return (m, e) => {
    if (m.shift && index.get(e.id) === (index.get(m.id) ?? 0) - 1) return 'shift';
    if (acrossJump(e, m)) return 'other_place';
    if (!m.place || e.place !== m.place) return 'other_place';
    if (!(opts.sides?.(m, e) ?? sameSide(m, e))) return 'other_side';
    // A same setup is the same camera: with both placed, a camera merely on the same side is not one.
    const same = opts.same?.(m, e);
    return e.distance === m.distance && e.eyes === m.eyes && same !== false ? 'same_setup' : 'same_side';
  };
}

/** Whether two moments' cameras, both placed on one floor plan, are the same camera (camera rules). */
export function sameByCamera(
  b: Breakdown,
  cams: Map<string, Eye>,
): (m: Pick<Moment, 'id'>, e: Pick<Moment, 'id'>) => boolean | undefined {
  return (m, e) => {
    const a = cams.get(m.id);
    const z = cams.get(e.id);
    if (!a || !z) return undefined;
    const pa = placePlan(b, m.id);
    if (!pa || pa !== placePlan(b, e.id)) return undefined;
    return sameCameraAs(a, z);
  };
}

/**
 * Whether two moments face the same side of their place, from their cameras on its floor plan (camera
 * rules): within SAME_SIDE_DEGREES of each other on one plan. Undefined where either has no camera or
 * they are on different plans: then the words decide. "The same view" two cameras a few centimetres
 * apart had was read from their words as the other side, and the carriage was drawn anew (the red door
 * in the snow, m2).
 */
export function sidesByCamera(
  b: Breakdown,
  cams: Map<string, Eye>,
): (m: Pick<Moment, 'id'>, e: Pick<Moment, 'id'>) => boolean | undefined {
  return (m, e) => {
    const a = cams.get(m.id);
    const z = cams.get(e.id);
    if (!a || !z) return undefined;
    const pa = placePlan(b, m.id);
    if (!pa || pa !== placePlan(b, e.id)) return undefined;
    return turnedBetween(a, z) < SAME_SIDE_DEGREES;
  };
}

/** How one moment's camera stands to an earlier one's, as the continuity plan reads it; none for an unknown moment. */
export function relation(b: Breakdown, later: string, earlier: string): Relation | undefined {
  const ms = moments(b).map((m) => ({ ...m, looks_at: m.looks_at ?? '', shift: m.shift ?? '' }));
  const m = ms.find((x) => x.id === later);
  const e = ms.find((x) => x.id === earlier);
  return m && e ? relationIn(ms)(m, e) : undefined;
}

/**
 * The continuity plan. With the story record (DREAMCHAT_RECORD=on), each moment's changes and those
 * carried into it are the record's, known by their keys, and so is who and what is in it: a change the
 * record finds changes nothing, or is a first look, has no in-between picture; a change is carried
 * until it is undone or replaced; the floor plans have whoever is there and hold what the record holds.
 */
export function planContinuity(b: Breakdown, rec?: RecordPlan): ContinuityPlan {
  if (cameraMode() !== 'on') return planWith(b, rec);
  // With the camera rules, planned once to place every camera on its floor plan, then again with how
  // each moment stands to the others read from those cameras, where both have one on one plan, until
  // the relations the plan draws from are the ones its cameras give (a camera moved by a relation can
  // move another: at most three plans, one more where any still disagree).
  let plan = planWith(b, rec, { camera: true });
  for (let pass = 0; pass < 3; pass++) {
    const cams = camerasOf(plan);
    if (!unsettled(b, plan, cams).length) return plan;
    plan = planWith(b, rec, { camera: true, cams });
  }
  const left = unsettled(b, plan);
  if (left.length)
    plan.issues.push(`the plan's relations still disagree with its cameras after four plans: ${left.join('; ')}`);
  return plan;
}

/**
 * Each cut's camera on its floor plan: its own, or for a cut edited from an earlier picture, that
 * picture's (an edit keeps the camera of the picture it edits). Given only its own, a relation to an
 * edit fell back to the words while the cut sheet read the camera of the shot it belongs to.
 */
export function camerasOf(plan: ContinuityPlan): Map<string, Eye> {
  const cams = new Map<string, Eye>();
  for (const c of plan.cuts) {
    const base = c.refs.find((r) => r.kind === 'cut' && r.role === 'base');
    const eye = c.eye ?? c.wouldBe ?? (base ? cams.get(base.id) : undefined);
    if (eye) cams.set(c.id, eye);
  }
  return cams;
}

/**
 * A cut as it is drawn when the picture it edits is not sent after all (S5's references: judged wrong, or stale on
 * the drawing path, `sent` false): made from its own shot and mock-up (`alone`) as any other cut, the picture kept
 * only as where it stands to it, never left with nothing that carries the layout (the owner, 29 Sep). Unchanged
 * where the picture is sent, where there is no edit, or where no shot of its own could be placed (no floor plan).
 */
export function unedited(cut: CutPlan, sent: (id: string) => boolean): CutPlan {
  const base = cut.refs.find((r) => r.kind === 'cut' && r.role === 'base');
  if (!base || !cut.alone || sent(base.id)) return cut;
  const { across: _across, camera: _camera, alone, ...rest } = cut;
  return {
    ...rest,
    ...alone,
    staging: [],
    refs: cut.refs.map((r) =>
      r === base ? { ...r, role: 'composition', relation: 'same_side', carries: CARRIES.same_side } : r,
    ),
    transition: cut.transition === 'continuous' ? 'cut, carrying on' : cut.transition,
    // Never judged or repaired against a picture it is not drawn from, and not drawn from for good reason.
    criteria: cut.criteria.filter((k) => k.with !== base.id),
    why: `${cut.why}; the picture it edits not sent, so made from its own shot and mock-up`,
  };
}

/** A moment's picture, its plan `unedited` where the picture it edits is not sent (plan.ts rebuild, session.ts). */
export function uneditedFrame<T extends { frame?: { plan?: CutPlan } }>(it: T, sent: (id: string) => boolean): T {
  const cut = it.frame?.plan;
  const plan = cut ? unedited(cut, sent) : cut;
  return plan === cut ? it : { ...it, frame: { ...it.frame, plan } };
}

/**
 * The earlier pictures a plan draws from whose relation is not the one its cameras give: none once the
 * plan has settled. A same setup whose people differ is drawn from as the same side (never edited), and a
 * seat is the dreamer's own place, so neither counts.
 */
export function unsettled(b: Breakdown, plan: ContinuityPlan, cams = camerasOf(plan)): string[] {
  const ms = moments(b).map((m) => ({ ...m, looks_at: m.looks_at ?? '', shift: m.shift ?? '' }));
  const byId = new Map(ms.map((m) => [m.id, m]));
  const rel = relationIn(ms, { camera: true, sides: sidesByCamera(b, cams), same: sameByCamera(b, cams) });
  const out: string[] = [];
  for (const c of plan.cuts)
    for (const r of [...c.refs, ...(c.unsent ?? [])]) {
      if (r.kind !== 'cut' || !r.relation || r.relation === 'seat') continue;
      const m = byId.get(c.id);
      const e = byId.get(r.id);
      if (!m || !e) continue;
      const now = rel(m, e);
      if (now !== r.relation && !(r.relation === 'same_side' && now === 'same_setup'))
        out.push(`${c.id} from ${r.id}: planned ${r.relation}, its cameras say ${now}`);
    }
  return out;
}

function planWith(
  b: Breakdown,
  rec: RecordPlan | undefined,
  opts: { camera?: boolean; cams?: Map<string, Eye> } = {},
): ContinuityPlan {
  const crowd = (id: string) => !!b.people.find((p) => p.id === id)?.extras;
  // A breakdown drafted before these fields existed plans as if nothing lasting changes.
  const ms = moments(b).map((m) => {
    const r = rec?.moments[m.id];
    return {
      ...m,
      looks_at: m.looks_at ?? '',
      shift: m.shift ?? '',
      // Only a look lasts: "location: at the far end of the room" in an older breakdown became a
      // ghost of her standing somewhere. And only a change: recorded where its subject is first shown,
      // it is how they look, and its in-between picture changes nothing (five of them were drawn for
      // Meads, from a breakdown judged before this was known, 25 Sep).
      // A crowd has no sketch to draw a change on: its new look is said in the moments' words (the
      // faceless students' in-between picture had nothing to edit, 26 Sep).
      leaves: r
        ? r.own.filter((st) => !crowd(st.who))
        : (m.leaves ?? []).filter(
            (l) => !POSITION.test(l.what.trim()) && (hasBefore(b, m.id, l.who) || isWhole(l)) && !crowd(l.who),
          ),
      // Nor is it carried: a first look written into the moments after it was held as "carried in
      // words only" (Meads m7, the convertible's look, 25 Sep).
      states: r
        ? r.carried
        : (m.states ?? []).filter((st) => !st.since || hasBefore(b, st.since, st.who) || isWhole(st)),
      ...(r
        ? { visible: [...new Set([...m.visible, ...r.visible])], things: [...new Set([...m.things, ...r.things])] }
        : {}),
    };
  });
  // What a moment itself changes, each change as the plan carries it: with the record, by its key.
  const ownOf = (m: (typeof ms)[number]): State[] =>
    m.leaves.map((l) =>
      'since' in l
        ? (l as State)
        : { who: l.who, what: l.what, now: l.now, since: m.id, ...(l.whole !== undefined ? { whole: l.whole } : {}) },
    );
  const index = new Map(ms.map((m, i) => [m.id, i]));
  const byId = new Map(ms.map((m) => [m.id, m]));
  const names = new Map<string, string>([...b.people, ...b.places, ...b.things].map((x) => [x.id, x.name]));
  // The dreamer is "you" in the conversation, but "you" in an instruction to a picture is anyone.
  const dreamerId = b.people.find((p) => p.is_dreamer)?.id;
  const name = (id: string) => (id === dreamerId ? 'the dreamer' : pictureName(names.get(id) ?? id));
  const seen = (m: Moment) => seenIn(m, dreamerId);
  const no = (id: string) => (index.get(id) ?? 0) + 1;
  const kindOf = (id: string): 'person' | 'place' | 'thing' =>
    b.places.some((p) => p.id === id) ? 'place' : b.things.some((t) => t.id === id) ? 'thing' : 'person';

  const byCamera = opts.cams ? sidesByCamera(b, opts.cams) : undefined;
  const sides = (m: Moment, e: Moment) => byCamera?.(m, e) ?? sameSide(m, e);
  const relation = relationIn(
    ms,
    opts.camera
      ? { camera: true, ...(byCamera && opts.cams ? { sides: byCamera, same: sameByCamera(b, opts.cams) } : {}) }
      : {},
  );

  const sceneOf = new Map<string, string>();
  for (const sc of b.scenes) for (const mo of sc.moments) sceneOf.set(mo.id, sc.id);
  // A shot is one camera setup within a scene: a cut joins the shot of an earlier cut of the same
  // setup, even after a cutaway, else opens a new one.
  const shotOf = new Map<string, string>();
  const shotsIn = new Map<string, number>();

  const baseRun = new Map<string, number>();
  const cuts: CutPlan[] = ms.map((m, i) => {
    const scene = sceneOf.get(m.id) ?? 's1';
    const setup = ms
      .slice(0, i)
      .filter((e) => sceneOf.get(e.id) === scene && relation(m, e) === 'same_setup')
      .at(-1);
    if (setup) shotOf.set(m.id, shotOf.get(setup.id)!);
    else {
      shotsIn.set(scene, (shotsIn.get(scene) ?? 0) + 1);
      shotOf.set(m.id, `${scene}.sh${shotsIn.get(scene)}`);
    }
    const earlier = ms.slice(0, i);
    const rel = new Map(earlier.map((e) => [e.id, relation(m, e)]));
    const refs: PlanRef[] = [];
    const add = (e: Moment, role: RefRole, relation: Relation, carries = CARRIES[relation]) => {
      if (refs.some((r) => r.id === e.id) || refs.length >= MAX_EARLIER) return;
      refs.push({ id: e.id, kind: 'cut', role, relation, carries });
    };

    // 1. The base: the same setup, a moment later. Jev's pick wins when it is one.
    const setups = earlier.filter((e) => rel.get(e.id) === 'same_setup');
    const fromSetup = m.from && rel.get(m.from) === 'same_setup' ? byId.get(m.from) : undefined;
    const base = fromSetup ?? setups.at(-1);
    let run = 0;
    if (base && !m.shift) {
      if ((baseRun.get(base.id) ?? 0) >= MAX_BASE_RUN)
        add(base, 'composition', 'same_setup', `${CARRIES.same_setup}; drawn afresh from the sheets, not edited`);
      else {
        add(
          base,
          'base',
          'same_setup',
          'the same view a moment earlier: edit it, changing only what this moment changes',
        );
        run = (baseRun.get(base.id) ?? 0) + 1;
      }
    }
    baseRun.set(m.id, run);

    // A jump the dream made: a match cut from the picture just before.
    let matchFrame: string | undefined;
    if (m.shift && i > 0) {
      add(ms[i - 1], 'composition', 'shift', `${CARRIES.shift}; the dream changes: ${m.shift}`);
      // Facing another side of the same place, its framing cannot be kept: "keep its framing
      // exactly" beside "facing the roller coaster", of a picture facing the screen, read as the
      // prompt contradicting itself (0.50, 24 Sep).
      const jump = refs.find((r) => r.id === ms[i - 1].id && r.relation === 'shift');
      if (jump && ms[i - 1].place === m.place && !sides(m, ms[i - 1])) jump.turned = true;
      matchFrame = ms[i - 1].id;
    }

    // 2. The story's own link, in the role the camera move allows. From another place it gives
    // only how people look now, which their sheets already give unless something has changed
    // on them: then it stays out, since its background bleeds in (a house came through the walls
    // of a tiny room as a double exposure, 23 Sep).
    const from = m.from ? byId.get(m.from) : undefined;
    if (from && index.get(from.id)! < i) {
      const r = rel.get(from.id) as Relation;
      const carriesChange = (m.states ?? []).some(
        (st) => index.get(from.id)! >= index.get(st.since)! && inViewAt(from).has(st.who),
      );
      if (r !== 'other_place' || carriesChange) add(from, ROLE[r], r);
    }

    // 3. The room: when nothing yet shows this place from this side, the widest cut that does.
    const inPlace = (r: PlanRef) => r.relation === 'same_setup' || r.relation === 'same_side';
    if (m.place && !refs.some(inPlace)) {
      const anchor = earlier
        .filter((e) => rel.get(e.id) === 'same_side' || rel.get(e.id) === 'same_setup')
        .sort((x, y) => WIDTH[y.distance] - WIDTH[x.distance] || index.get(y.id)! - index.get(x.id)!)[0];
      if (anchor) add(anchor, 'composition', rel.get(anchor.id) as Relation, CARRIES.same_side);
    }

    // 4. The light: a place seen so far only from other sides still gives its light and time of
    // day (the drop-off at the house took nothing from the waiting and arrival shots before it).
    if (m.place && !refs.some((r) => inPlace(r) || r.relation === 'other_side')) {
      const lit = earlier.filter((e) => rel.get(e.id) === 'other_side').at(-1);
      if (lit) add(lit, 'lighting', 'other_side');
    }

    // Through the dreamer's own eyes, after they were seen in this place: the camera is where they
    // are in that picture. Told only "through the dreamer's eyes, facing the roller coaster", a
    // moment was drawn from the aisle, as if the dreamer had got up, not from their seat beside it
    // (24 Sep). A jump that changes the place in between leaves their seat behind.
    if (m.eyes === 'dreamer' && dreamerId && m.place) {
      const jumpBetween = (e: Moment) => ms.some((k, at) => !!k.shift && index.get(e.id)! < at && at <= i);
      const seat = earlier
        .filter((e) => e.place === m.place && e.eyes === 'outside' && e.visible.includes(dreamerId) && !jumpBetween(e))
        .at(-1);
      if (seat) {
        const known = refs.find((r) => r.id === seat.id);
        if (known)
          Object.assign(known, { role: 'composition', relation: 'seat', carries: CARRIES.seat, who: undefined });
        else add(seat, 'composition', 'seat');
      }
    }

    // The location sheet shows the place from one side: the side its first picture faces.
    const first = ms.find((e) => e.place === m.place);
    const sheetLayout = !first || first === m || sides(m, first);

    // A moment that changes a part again replaces what it was: the horse's head was told "still
    // a melting ice block" and judged against it (23 Sep).
    const own = ownOf(m);
    const r = rec?.moments[m.id];
    return {
      id: m.id,
      order: i + 1,
      scene,
      shot: shotOf.get(m.id)!,
      refs,
      own,
      states: (m.states ?? []).filter((st) => !own.some((o) => o.who === st.who && o.what === st.what)),
      staging: [],
      sheetLayout,
      changes: [],
      needs: [],
      criteria: [],
      depth: 0,
      transition: '',
      matchFrame,
      ...(r
        ? {
            visible: m.visible,
            things: m.things,
            now: r.now,
            facts: r.facts,
            unsaid: Object.fromEntries(
              [...m.visible, ...m.things, m.place, ...r.present]
                .filter((id) => rec?.unsaid[id]?.length)
                .map((id) => [id, rec!.unsaid[id]]),
            ),
          }
        : {}),
      why: '',
    };
  });
  const cutOf = new Map(cuts.map((c) => [c.id, c]));

  const ghosts: GhostPlan[] = [];
  // With S5's references, an in-between picture edited from another carries that one's change too: a cut
  // drawn from the latest alone still shows the ones before it.
  const refs = refsMode() !== 'off';
  const chainOf = (g: GhostPlan | undefined): GhostPlan[] => {
    const out: GhostPlan[] = [];
    for (let x = g; x && !out.includes(x); x = x.after ? ghosts.find((y) => y.id === x!.after) : undefined) out.push(x);
    return out;
  };
  // A state is carried by its ghost, or by a referenced cut drawn at or after the change that
  // shows who changed. The picture before a dream's jump carries nothing of what the jump changes.
  const carriedBy = (c: CutPlan, st: State) =>
    c.refs.find((r) => {
      if (r.kind === 'ghost') {
        const g = ghosts.find((x) => x.id === r.id);
        if (refs) return chainOf(g).some((x) => !!x.state && changeKey(x.state) === changeKey(st));
        return !!g?.state && changeKey(g.state) === changeKey(st);
      }
      // A picture kept only for its light is not drawn from, so it carries no change.
      return (
        r.relation !== 'shift' &&
        r.role !== 'lighting' &&
        index.get(r.id)! >= index.get(st.since)! &&
        inViewAt(byId.get(r.id)!).has(st.who)
      );
    });
  const countChanges = (c: CutPlan) => {
    const m = byId.get(c.id)!;
    const out = ['the action'];
    const edited = c.refs.some((r) => r.role === 'base');
    // With S5's references only story changes count toward the owner's bar: a new framing or a side of the
    // place never drawn is the camera's, not a change to what is drawn, with or without a floor plan (the
    // owner, 27 Sep).
    if (!edited && !refs) {
      const room = c.refs.find((r) => r.relation === 'same_side' || r.relation === 'same_setup');
      if (room && byId.get(room.id)!.distance !== m.distance)
        out.push(`reframed ${m.distance} from picture ${no(room.id)}`);
      const established = ms.slice(0, c.order - 1).some((e) => e.place === m.place);
      const viewGhost = c.refs.some((r) => r.kind === 'ghost' && ghosts.find((g) => g.id === r.id)?.kind === 'view');
      if (m.place && established && !room && !c.sheetLayout && !viewGhost)
        out.push(`${name(m.place)} facing ${m.looks_at || 'another way'}, never drawn`);
    }
    for (const st of c.states)
      if (!carriedBy(c, st)) out.push(`${name(st.who)}'s ${st.what} now ${st.now}, shown in no reference`);
    return out;
  };

  const roleFor = (id: string): RefRole =>
    kindOf(id) === 'place' ? 'location' : kindOf(id) === 'thing' ? 'prop' : 'identity';
  const addGhostRef = (c: CutPlan, g: GhostPlan, st: State) =>
    c.refs.push({
      id: g.id,
      kind: 'ghost',
      role: roleFor(st.who),
      carries: `how ${name(st.who)} looks now: ${st.what} ${st.now}`,
    });
  // Transformation ghosts: every lasting change to a person, place or thing is drawn on its own
  // first, one change per edit, each from the one before (sheet → ice block → melting → horse).
  // Every moment from the change on, while it holds, takes the look from its ghost, so the
  // change is invented once and carried, never re-invented inside a whole scene.
  const latest = new Map<string, GhostPlan>();
  const ghostOf = new Map<string, GhostPlan>(); // by change key
  for (const m of ms)
    for (const state of ownOf(m)) {
      // What a moment implies, written nowhere, is carried in words and on the floor plan, never by an
      // in-between picture of its own: in-between pictures are for an edit carrying several changes,
      // and a place's in-between picture did not carry its state (the library's water, 26 Sep).
      if (state.implied) continue;
      const l = state;
      // With the record, a ghost is edited from the one before only if that change has not ended by
      // here: the suitcase shut again is drawn from its sketch, not from its picture open.
      const last = latest.get(l.who);
      const ended = last?.state?.key ? rec?.ends[last.state.key] : undefined;
      const prev = ended && (index.get(ended) ?? 0) <= (index.get(m.id) ?? 0) ? undefined : last;
      const g: GhostPlan = {
        id: `g${ghosts.length + 1}`,
        kind: 'state',
        of: l.who,
        label: l.part === '' ? `${name(l.who)}, now ${l.now}` : `${name(l.who)}, ${l.part ?? l.what} now ${l.now}`,
        change:
          l.part === '' ? `${name(l.who)} is now ${l.now}` : `${name(l.who)}'s ${l.part ?? l.what} is now ${l.now}`,
        from: null,
        after: prev?.id,
        needs: prev ? [prev.id] : [],
        usedBy: [],
        why: `${name(l.who)} changes at picture ${no(m.id)}: drawn on ${kindOf(l.who) === 'person' ? 'them' : 'it'} alone first, one change in one edit${prev ? ', from the change before' : ''}`,
        state,
        depth: 0,
        ...(state.key ? { key: state.key, ...(rec?.before[state.key] ? { before: rec.before[state.key] } : {}) } : {}),
      };
      ghosts.push(g);
      latest.set(l.who, g);
      ghostOf.set(changeKey(state), g);
    }
  for (const c of cuts) {
    // Its own change, and every change still in force on what it shows.
    for (const st of [...c.own, ...c.states]) {
      const g = ghostOf.get(changeKey(st));
      if (!g || c.refs.some((r) => r.id === g.id)) continue;
      g.usedBy.push(c.id);
      addGhostRef(c, g, st);
    }
  }
  for (const c of cuts) c.changes = countChanges(c);

  // Every person in a moment, as last drawn: the picture they were last seen in, for a moment
  // drawn without their sketch. With it, the sketch alone says who they are: two images each
  // claiming how the dreamer looks read as a clash (0.42-0.46 on what each image is for), and the
  // later picture had drawn her hair auburn (24 Sep).
  const MAX_CUTS = MAX_EARLIER + 2;
  for (const c of cuts) {
    const m = byId.get(c.id)!;
    for (const p of seen(m)) {
      const cutRefs = c.refs.filter((r) => r.kind === 'cut');
      const showing = cutRefs.find((r) => inViewAt(byId.get(r.id)!).has(p));
      if (showing) {
        if (showing.who && !showing.who.includes(p)) showing.who.push(p);
        continue;
      }
      if (cutRefs.length >= MAX_CUTS) continue;
      const lastSeen = ms
        .slice(0, c.order - 1)
        .filter((e) => seen(e).includes(p))
        .at(-1);
      if (lastSeen)
        c.refs.push({
          id: lastSeen.id,
          kind: 'cut',
          role: 'identity',
          relation: relation(m, lastSeen),
          carries: `who ${name(p)} is, as last drawn, when their sketch is not there`,
          who: [p],
        });
    }
  }

  // View ghosts: a side of a place never drawn, where the first picture facing it can't set it
  // up for the rest: it would change too much at once, or it is a close-up that later, wider
  // pictures of that side would have to build the room from.
  for (const c of cuts) {
    // With S5's references a side never drawn is no change, so no in-between picture is made of it.
    if (refs || !c.changes.some((x) => x.endsWith('never drawn'))) continue;
    const m = byId.get(c.id)!;
    const wider = cuts.slice(c.order).filter((l) => {
      const lm = byId.get(l.id)!;
      return lm.place === m.place && sides(lm, m) && lm.distance !== 'close';
    });
    const crowded = c.changes.length >= TOO_MANY;
    if (!crowded && !(m.distance === 'close' && wider.length)) continue;
    const light = ms
      .slice(0, c.order - 1)
      .filter((e) => e.place === m.place)
      .sort((x, y) => WIDTH[y.distance] - WIDTH[x.distance] || index.get(y.id)! - index.get(x.id)!)[0];
    const g: GhostPlan = {
      id: `g${ghosts.length + 1}`,
      kind: 'view',
      of: m.place,
      label: `${name(m.place)}, facing ${m.looks_at || 'the other way'}`,
      change: `the camera turned to face ${m.looks_at || 'the other way'}`,
      from: light?.id ?? null,
      needs: light ? [light.id] : [],
      usedBy: [c.id, ...wider.map((l) => l.id)],
      why: crowded
        ? `picture ${c.order} faces a side of ${name(m.place)} never drawn, and would otherwise change ${c.changes.length} things at once`
        : `picture ${c.order} is the first to face ${m.looks_at || 'that side'}, but only close; pictures ${wider.map((l) => l.order).join(', ')} need the whole of it`,
      looksAt: m.looks_at,
      depth: 0,
    };
    ghosts.push(g);
    for (const id of g.usedBy)
      cutOf.get(id)!.refs.push({
        id: g.id,
        kind: 'ghost',
        role: 'location',
        carries: `${name(m.place)} from the side this picture faces`,
      });
  }

  // Staging: a scene places its people once, left to right, from the first picture that shows two
  // or more of them; anyone who joins later stands to their right. Every picture of the scene keeps
  // that order, and a dream's jump starts it again.
  const lineups = new Map<string, string[]>();
  let jumps = 0;
  for (const c of cuts) {
    const m = byId.get(c.id)!;
    if (m.shift) jumps += 1;
    const key = `${c.scene}/${jumps}`;
    const line = lineups.get(key) ?? [];
    const people = seen(m);
    if (people.length >= 2 || line.length) {
      for (const p of people) if (!line.includes(p)) line.push(p);
      lineups.set(key, line);
    }
    const inView = line.filter((p) => people.includes(p));
    c.staging = inView.length >= 2 ? inView : [];
  }

  // With a floor plan, every camera is placed on it: what each picture sees is worked out, and who
  // stands where across it follows from where they are, not from the order they were first named.

  // With the camera rules (camera.ts), more for every camera seen from outside. The scene's line: its
  // first picture from outside with two of the cast sets it, and each later camera of the scene stays on
  // the side the cut before it stood on, unless the moment looks past them at what only the other side
  // shows, or only from there are they all in the picture; where it crosses, the cut says so and is
  // flagged (`crossed`), and the new side is the one kept. Two riding one vehicle keep its seats, not a
  // side. A cut to the same people at the same size from an earlier cut's own camera is the same picture
  // again: the camera moves. And a vehicle the moment has going goes the way the plan says.
  const cast = new Set(b.people.filter((p) => !p.extras).map((p) => p.id));
  const lines = new Map<unknown, { ids: [string, string]; sign: number; from: string }>();
  // One line per floor plan: two places of one scene each have their own.
  const lineKey = (m: Moment): unknown => placePlan(b, m.id) ?? sceneOf.get(m.id) ?? 's1';
  const together = (where: Blocking, a: Spot, z: Spot) => {
    const oa = onOf(a, where);
    const oz = onOf(z, where);
    return !!oa && !!oz && oa.how === 'in' && oz.how === 'in' && oa.t.id === oz.t.id;
  };
  // Where something stood just before a moment, on its place's plan: its spot, then its moves so far.
  const before = (m: Moment, id: string, plan: Blocking) => {
    const scene = b.scenes.find((sc) => sc.moments.some((x) => x.id === m.id));
    let at = plan.spots.find((x) => x.id === id);
    if (!scene || !at) return at;
    for (const x of scene.moments) {
      if (x.id === m.id) break;
      if (placePlan(b, x.id) !== plan) continue;
      const mv = plan.moves?.[x.id]?.find((y) => y.id === id);
      if (mv) at = { ...at, x: mv.x, y: mv.y };
    }
    return at;
  };
  const goingOf = (m: Moment, where: Blocking): Record<string, { x: number; y: number }> => {
    const plan = placePlan(b, m.id);
    const out: Record<string, { x: number; y: number }> = {};
    const [rw, rd] = roomOf(where);
    for (const v of where.spots) {
      const others = where.spots.filter((o) => o.shape === 'vehicle' && o.id !== v.id).map((o) => o.name ?? name(o.id));
      if (v.shape !== 'vehicle' || v.heldBy || !goingIn(`${m.action} ${m.visual_point ?? ''}`, name(v.id), others))
        continue;
      const mv = plan?.moves?.[m.id]?.find((y) => y.id === v.id);
      const was = mv && plan ? before(m, v.id, plan) : undefined;
      const [w, d] = sizeOf(v);
      // Whoever rides in it faces the way it goes, and the picture shows them as they face. Where they all
      // face against the way it moved here, the plan gives two ways and says neither: moved up the room
      // while the two in it faced back down it, the boat was said to head at the camera behind them
      // (library, 27 Sep).
      const riders = where.spots
        .filter((p) => p.kind === 'person' && !p.many && !!p.faces && onOf(p, where)?.t.id === v.id)
        .map((p) => facing(p, where));
      const sum = riders.reduce((a, f) => ({ x: a.x + f.x, y: a.y + f.y }), { x: 0, y: 0 });
      const movedWay =
        was && Math.hypot(v.x - was.x, v.y - was.y) > 0.2 ? unitOf({ x: v.x - was.x, y: v.y - was.y }) : undefined;
      const against = !!movedWay && riders.length > 0 && sum.x * movedWay.x + sum.y * movedWay.y < 0;
      // The way it faces where the plan gives one; the way it moved here, unless those in it face against
      // it; or, where the place is its inside (the tractor's cab), the place's front.
      const way = v.faces
        ? facing(v, where)
        : movedWay
          ? against
            ? undefined
            : movedWay
          : w >= rw - 0.1 && d >= rd - 0.1
            ? DIRECTIONS.front
            : undefined;
      if (way) out[v.id] = way;
    }
    return out;
  };
  const shotRules = (c: CutPlan, m: Moment, where: Blocking) => {
    const line = lines.get(lineKey(m));
    const a = line && where.spots.find((s) => s.id === line.ids[0]);
    const z = line && where.spots.find((s) => s.id === line.ids[1]);
    const people = seen(m);
    // Only once relations are read from the cameras: before, a camera the same as an earlier one is how
    // a same setup is found, and moving it would hide it.
    const avoid = (opts.cams ? cuts : [])
      .slice(0, c.order - 1)
      .filter((e) => {
        const em = byId.get(e.id)!;
        const rel = relation(m, em);
        return (
          !!e.eye &&
          em.eyes === 'outside' &&
          em.distance === m.distance &&
          rel !== 'other_place' &&
          rel !== 'shift' &&
          placePlan(b, e.id) === placePlan(b, m.id) &&
          people.length > 0 &&
          seen(em).length === people.length &&
          seen(em).every((p) => people.includes(p))
        );
      })
      .map((e) => ({ id: e.id, eye: e.eye! }));
    // Riding one vehicle together, the people it shows, whether or not the scene has a line yet.
    const shown = people.map((id) => where.spots.find((s) => s.id === id)).filter((s): s is Spot => !!s);
    const riding = shown.length >= 2 && shown.every((s, i) => i === 0 || together(where, shown[0], s));
    const going = goingOf(m, where);
    return {
      avoid: avoid.map((e) => e.eye),
      same: avoid,
      ...(line && a && z && !riding ? { line: { a, b: z, sign: line.sign } } : {}),
      ...(riding ? { together: true } : {}),
      ...(Object.keys(going).length ? { going } : {}),
    };
  };
  const keepLine = (
    c: CutPlan,
    m: Moment,
    where: Blocking,
    v: { eye: Eye; inPicture: string[]; crossed?: 'looks' | 'framing' },
    rules: ReturnType<typeof shotRules> | undefined,
  ) => {
    const key = lineKey(m);
    const line = lines.get(key);
    if (!line) {
      const two = v.inPicture
        .filter((id) => cast.has(id))
        .map((id) => where.spots.find((s) => s.id === id))
        .filter((s): s is Spot => !!s)
        .map((s) => ({ s, angle: bearingAngle(v.eye, s) }))
        .sort((p, q) => p.angle - q.angle)
        .slice(0, 2);
      const side = two.length === 2 ? signedFromLine(two[0].s, two[1].s, v.eye.at) : 0;
      if (two.length === 2 && !together(where, two[0].s, two[1].s) && Math.abs(side) >= ON_THE_LINE)
        lines.set(key, { ids: [two[0].s.id, two[1].s.id], sign: Math.sign(side), from: c.id });
    } else if (rules?.line) {
      const side = signedFromLine(rules.line.a, rules.line.b, v.eye.at);
      if (Math.abs(side) >= ON_THE_LINE) {
        // A deliberate crossing (only that side shows what the moment is about) is the cut's to say, never
        // a fault for the checks before drawing to act on.
        if (Math.sign(side) !== line.sign) Object.assign(c, { crossed: line.from, crossedWhy: v.crossed ?? 'framing' });
        Object.assign(line, { sign: Math.sign(side), from: c.id });
      }
    }
    const same = rules?.same.find((e) => sameCameraAs(v.eye, e.eye));
    if (same) c.sameCamera = same.id;
  };
  const bearingAngle = (eye: Eye, s: { x: number; y: number }) => bearing(eye.at, eye.d, s).angle;

  const bare = (x: string) =>
    x
      .toLowerCase()
      .replace(/^(the|a|an)\s+/, '')
      .trim();
  // Whether what an earlier picture shows of who and what is in both pictures is as it stands at this cut:
  // every change in force there still in force here, and none here that it lacks (an edit makes this cut's
  // own changes itself).
  const stateDiffers = (c: CutPlan, e: CutPlan, edit: boolean): string[] => {
    const inBoth = (id: string) => inViewAt(byId.get(c.id)!).has(id) && inViewAt(byId.get(e.id)!).has(id);
    const key = (st: State) => `${st.who}|${st.what}|${st.now}`.toLowerCase();
    const then = [...e.own, ...e.states].filter((st) => inBoth(st.who));
    const now = [...c.own, ...c.states].filter((st) => inBoth(st.who));
    const made = (st: State) => edit && c.own.some((o) => o.who === st.who && o.what === st.what);
    return [
      ...now
        .filter((st) => !then.some((x) => key(x) === key(st)) && !made(st))
        .map((st) => `here ${name(st.who)}'s ${st.what} is ${st.now}, not so in it`),
      ...then
        .filter((st) => !now.some((x) => key(x) === key(st)) && !made(st))
        .map((st) => `in it ${name(st.who)}'s ${st.what} is ${st.now}, no longer so here`),
    ];
  };
  // S5's gate: whether cut `c`, its camera `a`, is drawn from the earlier picture `r`, its camera `z`. Never one
  // turned round from it (a reverse). A picture drawn from takes over the layout of the new one, whatever it is
  // told (the camera rules' picture check, 27 Sep: library-1 m5 drawn from a camera 4 m higher and other water,
  // snow-train-2 m6 from 10 m off where the plan stood 1 m from the door). So it is drawn from only where its
  // camera and the place as it stands match this cut's; else the sketches carry the look, and it is not sent.
  // Why not: what in the earlier picture's camera or state keeps this cut from being drawn from it, or null.
  const whyNot = (c: CutPlan, r: PlanRef, a: Eye | undefined, z: Eye | undefined): UnsentWhy | null => {
    // Cameras are compared on one floor plan only: two plans of one room do not share their bearings.
    const onePlan = !!placePlan(b, c.id) && placePlan(b, c.id) === placePlan(b, r.id);
    const turn = a && z ? Math.round(turnedBetween(a, z)) : 0;
    if (a && z && onePlan && turnedBetween(a, z) >= REVERSE_DEGREES)
      return { code: 'reverse', detail: `its camera is turned ${turn}° from this one` };
    const edit = r.role === 'base';
    if (a && z && onePlan) {
      const metres = Math.hypot(a.at.x - z.at.x, a.at.y - z.at.y);
      const height = Math.abs((a.height ?? 0) - (z.height ?? 0));
      const far = [
        metres > NEAR.metres ? `${metres.toFixed(1)} m away (near is ${NEAR.metres} m)` : '',
        turnedBetween(a, z) > NEAR.degrees ? `turned ${turn}° (near is ${NEAR.degrees}°)` : '',
        height > NEAR.height ? `${height.toFixed(1)} m higher or lower (near is ${NEAR.height} m)` : '',
      ].filter(Boolean);
      if (far.length) return { code: 'camera_far', detail: `its camera is ${far.join(', ')}` };
    } else if (!edit && r.relation !== 'same_setup')
      return {
        code: 'no_cameras_words_differ',
        detail: `no cameras on one floor plan to compare, and the words call it ${(r.relation ?? 'another view').replaceAll('_', ' ')}`,
      };
    const differ = stateDiffers(c, cutOf.get(r.id)!, edit);
    return differ.length ? { code: 'state_differs', detail: differ.join('; ') } : null;
  };
  const drawnFrom = (c: CutPlan, r: PlanRef, a: Eye | undefined, z: Eye | undefined) => !whyNot(c, r, a, z);
  // Edits made their own cut when the camera is placed (by cut/picture), and each picture left out with why.
  const madeOwn = new Set<string>();
  const unsentBy = (c: CutPlan, r: PlanRef, why: UnsentWhy) => {
    if (!(c.unsent ?? []).some((x) => x.id === r.id)) c.unsent = [...(c.unsent ?? []), r];
    c.unsentWhy = { ...(c.unsentWhy ?? {}), [r.id]: why };
  };
  // The camera an earlier cut's picture is drawn from, as the plan is placed so far: its own where it has one; for
  // an edit, the camera of the picture it edits, which an edit keeps (where its own would stand is not where its
  // picture is); else, with no camera placed for that one, where its own would stand.
  const eyeOf = (id: string, seen: string[] = []): Eye | undefined => {
    const e = cutOf.get(id);
    if (!e || seen.includes(id)) return undefined;
    const base = e.refs.find((r) => r.kind === 'cut' && r.role === 'base');
    return e.eye ?? (base ? (eyeOf(base.id, [...seen, id]) ?? e.wouldBe) : e.wouldBe);
  };
  for (const c of cuts) {
    const plan = placePlan(b, c.id);
    if (!plan) continue;
    const m = byId.get(c.id)!;
    const changed = [...c.own, ...c.states];
    // What something is called now: the big sofa that has become a roller coaster is the roller coaster.
    const now = (id: string) => {
      const st = changed.find(
        (x) => x.who === id && /^\s*(?:its |their )?(?:form|shape|whole|self|itself|kind)\s*$/i.test(x.what),
      );
      return st ? `${/^(a|an|the)\s/i.test(st.now) ? '' : 'the '}${st.now} (what ${name(id)} turned into)` : name(id);
    };
    // A fixture of the place goes by its own name; everyone and everything else as the story calls them.
    const nameOf = (s: { id: string; name?: string }) => s.name ?? name(s.id);
    // What the moment looks at, by what it is called now or was: the one its words mean most.
    const target = (words: string) =>
      bare(words)
        ? meant(words, [
            ...plan.spots.map((s) => ({ id: s.id, name: nameOf(s) })),
            ...changed.flatMap((st) => (plan.spots.some((s) => s.id === st.who) ? [{ id: st.who, name: st.now }] : [])),
          ])
        : undefined;
    // Where on the plan a moment looks: what Jev read its camera to face there, else what its words
    // name there, the place's front, or a side of it.
    const lookAt = (
      m: Moment,
      where: Blocking,
    ): { at?: { x: number; y: number }; way?: { x: number; y: number }; id?: string; theirs?: boolean } | undefined => {
      const said = where.looks?.[m.id];
      if (said === 'front') return { way: DIRECTIONS.front };
      const spot = said ? where.spots.find((x) => x.id === said) : undefined;
      if (spot) return { at: { x: spot.x, y: spot.y }, id: spot.id };
      const words = m.looks_at;
      const w = bare(words);
      if (!w) return undefined;
      // Not on the plan: a side of the place its words name, else the way its people face.
      if (said === 'missing' || said === 'beyond') {
        if (/\b(back|far end|far side|rear)\b/.test(w)) return { way: DIRECTIONS.back };
        if (/\bleft\b/.test(w)) return { way: DIRECTIONS.left };
        if (/\bright\b/.test(w)) return { way: DIRECTIONS.right };
        return { theirs: true };
      }
      const id = target(words);
      const s = id ? where.spots.find((x) => x.id === id) : undefined;
      if (s) return { at: { x: s.x, y: s.y }, id: s.id };
      if (w.includes(bare(plan.front)) || bare(plan.front).includes(w)) return { way: DIRECTIONS.front };
      if (/\b(back|far end|far side|rear)\b/.test(w)) return { way: DIRECTIONS.back };
      if (/\bleft\b/.test(w)) return { way: DIRECTIONS.left };
      if (/\bright\b/.test(w)) return { way: DIRECTIONS.right };
      // Something the plan does not have (a village beyond the door, the sky): what they face,
      // since the floor plan turned them toward it. The camera looked back at the dreamer with the
      // village behind it (25 Sep).
      return { theirs: true };
    };
    if (m.eyes === 'dreamer' && dreamerId) {
      const pov = shotPlan(b, m.id, rec) ?? plan;
      if (cameraMode() === 'on') {
        const unseen = unsaidHeld(b, m, planBy(b, m.id, rec) ?? plan);
        if (unseen.length) c.carriedUnseen = unseen;
      }
      const said = pov.looks?.[m.id];
      const toward = said && pov.spots.some((s) => s.id === said) ? said : target(m.looks_at);
      // Who and what they see out past the place's edges is named where they look: the tractor in
      // the field below, out of the lighthouse's window (26 Sep).
      const far = [...m.things, ...seen(m)].filter((id) => pov.outside?.[id]).map(now);
      const beyond = [m.looks_at, far.length ? `${far.join(' and ')}, far off` : ''].filter(Boolean).join(': ');
      const v = dreamerShot(pov, dreamerId, toward, now, toward ? undefined : beyond || undefined, seen(m));
      if (v) {
        c.view = v.text;
        c.eye = v.eye;
        c.sees = v.inPicture;
        if (v.rules) c.rules = v.rules;
        // Made from its previs, the view needs nothing from the picture the dreamer was seen in:
        // it is neither drawn from nor waited for, so it can be drawn alongside it.
        if (refs)
          for (const r of c.refs.filter((x) => x.relation === 'seat'))
            unsentBy(c, r, {
              code: 'seat_replaced_by_view',
              detail:
                "the dreamer's view is worked out on the floor plan from where they are, so the picture they were seen in is not needed",
            });
        c.refs = c.refs.filter((r) => r.relation !== 'seat');
      }
    } else {
      const fromBehind = !!m.looks_at && bare(m.looks_at).includes(bare(plan.front));
      // A crowd the moment is about goes to the camera too, to be framed and said: "the couple of
      // people" never reached it, and the picture said nobody else was there (25 Sep).
      const ids = [...seen(m), ...m.things].filter((id) => plan.spots.some((s) => s.id === id));
      // A moment that edits an earlier picture of the same view keeps that picture's layout: it
      // was made from the same set. Every other camera is placed on the floor plan and made from
      // its previs: the image model draws people and things well, and a new camera badly.
      // Editing it is right only when the same people are in view: made an edit of the two-shot, a
      // moment showing only her would have taken the dreamer out of a room they never left (24 Sep).
      // With anyone in or out of view, the moment gets its own camera, and the earlier picture
      // gives only how the place looks.
      const base = c.refs.find((r) => r.role === 'base');
      const baseCast = base ? (byId.get(base.id) ? seen(byId.get(base.id)!) : []) : [];
      const sameCast = baseCast.length === seen(m).length && baseCast.every((id) => seen(m).includes(id));
      if (base && !sameCast)
        Object.assign(base, { role: 'composition', relation: 'same_side', carries: CARRIES.same_side });
      const where = shotPlan(b, m.id, rec) ?? plan;
      // What its words name on the plan besides who and what is in it, to be in the picture too where
      // the camera can hold it: holding up the key "for the lighthouse" with the lighthouse behind
      // the camera read as the shot at odds with the moment (lighthouse, 25 Sep).
      // The place's own side too, when its words name it: putting the boat down "at the edge where the
      // beach used to be", the front the plan named so, was shot facing away from it (lighthouse, 25 Sep).
      const also = mentioned(`${m.action} ${m.visual_point ?? ''}`, [
        ...where.spots.map((x) => ({ id: x.id, name: nameOf(x) })),
        ...(where.front ? [{ id: 'front', name: where.front }] : []),
      ]).filter((id) => !ids.includes(id) && id !== dreamerId);
      // With S5's references, an edit the gate would not send (its picture's camera far from where this
      // moment's own would stand, or the place not as it stands here) is placed and made from its own mock-up
      // like any other cut. Left an edit, the gate took its picture away later and the cut had no camera, no
      // mock-up and nothing that carried the layout (the S5 picture check, 29 Sep: orchard m3 came out
      // mirrored; lighthouse-first m8's tractor became a car).
      if (refs && base?.role === 'base') {
        const own = outsideShot(where, ids, m.distance, now, lookAt(m, where), also);
        if (own && !drawnFrom(c, base, own.eye, eyeOf(base.id))) {
          Object.assign(base, { role: 'composition', relation: 'same_side', carries: CARRIES.same_side });
          madeOwn.add(`${c.id}/${base.id}`);
        }
      }
      const edits = c.refs.some((r) => r.role === 'base');
      const rules = opts.camera && !edits ? shotRules(c, m, where) : undefined;
      const v = edits ? null : outsideShot(where, ids, m.distance, now, lookAt(m, where), also, rules);
      // With S5's references the gate compares this camera with the picture's whatever the camera rules, and
      // the cut keeps its own shot for when the picture is not sent after all.
      if ((opts.camera || refs) && edits) {
        const own = outsideShot(where, ids, m.distance, now, lookAt(m, where), also);
        if (own) c.wouldBe = own.eye;
        // Placed as any cut is, but never moved off the camera of the picture it edits: withheld, that picture is
        // not drawn from, and the same view is still this moment's (the camera rules' "move the camera" is for a
        // repeat of a picture that is sent).
        const placed = opts.camera ? shotRules(c, m, where) : undefined;
        // Its picture's camera is the one its chain of edits started from (an edit keeps its camera).
        const drawnAt = base ? eyeOf(base.id) : undefined;
        const kept = placed?.same.filter((e) => e.id !== base?.id && !(drawnAt && sameCameraAs(e.eye, drawnAt)));
        const alone = refs
          ? outsideShot(
              where,
              ids,
              m.distance,
              now,
              lookAt(m, where),
              also,
              placed && kept ? { ...placed, avoid: kept.map((e) => e.eye) } : undefined,
            )
          : null;
        if (alone)
          c.alone = {
            view: alone.text,
            eye: alone.eye,
            sees: alone.inPicture,
            ...(alone.framing ? { framing: alone.framing } : {}),
            ...(alone.rules ? { rules: alone.rules } : {}),
          };
      }
      if (v) {
        c.view = v.text;
        c.eye = v.eye;
        c.sees = v.inPicture;
        c.framing = v.framing;
        c.staging = [];
        if (v.rules) c.rules = v.rules;
        if (opts.camera) keepLine(c, m, where, v, rules);
      } else if (edits && opts.camera) {
        // An edit keeps the camera, framing and places of the picture it edits (its image 1 says so): with the camera
        // rules, it is given no order of its own. Said "from in front of them" from the floor plan, a44a m3's order
        // was the mirror of picture 2's, the picture it edits (the read of every frozen prompt, 30 Sep).
        c.staging = [];
      } else {
        c.across = outsideOrder(plan, ids, fromBehind);
        c.camera = fromBehind
          ? `from behind them, facing ${plan.front}`
          : `from in front of them, looking at them, with ${plan.front} behind the camera`;
        const people = c.across.filter((id) => seen(m).includes(id));
        c.staging = people.length >= 2 ? people : [];
      }
    }
  }

  // S5 (DREAMCHAT_REFS): a cut's references are what it is drawn from, and so all the plan waits for.
  // The judge still compares each picture with every earlier one it was planned from.
  const planned = new Map(cuts.map((c) => [c.id, [...c.refs]]));
  if (refs) chooseInPlan();

  // Needs, depth, checks, transitions and a line of why, now the references are final.
  const depth = new Map<string, number>();
  for (const g of ghosts) if (!g.from) depth.set(g.id, 1);
  for (const c of cuts) {
    for (const g of ghosts)
      if (g.from && !depth.has(g.id) && depth.has(g.from)) depth.set(g.id, depth.get(g.from)! + 1);
    c.changes = countChanges(c);
    c.needs = c.refs.map((r) => r.id);
    c.depth = 1 + Math.max(0, ...c.refs.map((r) => depth.get(r.id) ?? 0));
    depth.set(c.id, c.depth);
    const m = byId.get(c.id)!;
    const judged = refs ? { ...c, refs: planned.get(c.id) ?? c.refs } : c;
    c.transition = (
      m.shift
        ? `dream shift: ${m.shift}`
        : judged.refs.some((r) => r.role === 'base')
          ? 'continuous'
          : judged.refs.some((r) => r.kind === 'cut')
            ? 'cut, carrying on'
            : 'cut'
    ).slice(0, 120);
    c.criteria = criteria(judged, m);
    c.why = c.refs.length
      ? c.refs.map((r) => `${r.kind === 'ghost' ? `ghost ${r.id}` : `picture ${no(r.id)}`} as ${r.role}`).join('; ')
      : 'the sheets alone';
  }
  for (const g of ghosts) {
    g.depth = depth.get(g.id) ?? (g.from ? (depth.get(g.from) ?? 1) + 1 : 1);
    g.usedBy = [...new Set(g.usedBy)];
    // What it shows: each thing its chain changed, once, as the latest change left it (the water rising
    // over the desks, not every level it passed on the way).
    if (refs && chainOf(g).some((x) => !!x.state)) {
      const latest = new Map<string, { what: string; now: string }>();
      for (const x of chainOf(g).reverse())
        if (x.state) {
          const k = x.state.what.toLowerCase().trim();
          latest.delete(k);
          latest.set(k, { what: x.state.what, now: x.state.now });
        }
      g.shows = [...latest.values()];
    }
  }

  /**
   * S5's references, over the plan with its cameras placed: each cut keeps only what it is drawn from.
   * - No picture from another side: an earlier picture whose camera is turned round from this one's (a
   *   reverse) is neither edited nor where things stand; the jump's own picture and the seat are made
   *   across a move by what they are.
   * - One image per subject: an earlier picture comes in for who someone is only where they have no
   *   sketch (a crowd), never for its light alone; a person with a sketch is shown by it.
   * - An in-between picture only where an edit would carry several changes (the owner's bar, two): one
   *   that no cut it is drawn for would carry that many without is not drawn, the latest first, so no
   *   cut is left over the bar by two going.
   * - Of a subject's in-between pictures in force, only the latest, which was edited from the others.
   */
  function chooseInPlan() {
    const cams = camerasOf({ cuts, ghosts, issues: [] });
    // The camera each picture is drawn from, read before any cut's references change here.
    const pics = new Map(cuts.map((c) => [c.id, eyeOf(c.id)]));
    for (const c of cuts) {
      const m = byId.get(c.id)!;
      const here = seen(m);
      const all = c.refs;
      const why: Record<string, UnsentWhy> = {};
      c.refs = c.refs.flatMap((r): PlanRef[] => {
        if (r.kind !== 'cut' || r.relation === 'shift') return [r];
        const e = byId.get(r.id)!;
        if (r.role === 'lighting' || r.role === 'identity') {
          const shows = inViewAt(e);
          const who = (r.who ?? here).filter((p) => crowd(p) && here.includes(p) && shows.has(p));
          if (!who.length) {
            why[r.id] =
              r.role === 'lighting'
                ? { code: 'light_only', detail: 'planned for its light alone' }
                : {
                    code: 'has_sketch',
                    detail: `planned for who ${(r.who ?? here).map(name).join(' and ') || 'someone'} is; each has a sketch of their own here, or is not in it`,
                  };
            return [];
          }
          return [r.role === 'identity' ? { ...r, who } : r];
        }
        if (r.relation === 'seat') return [r];
        // This cut's own camera (where it would stand, for an edit) against the camera the earlier picture is drawn from.
        const not = whyNot(c, r, cams.get(c.id), pics.get(r.id));
        if (!not) return [r];
        why[r.id] = madeOwn.has(`${c.id}/${r.id}`)
          ? {
              code: 'edit_to_own_camera',
              detail: `planned as the picture edited, and made its own cut instead: ${not.detail}`,
            }
          : not;
        return [];
      });
      for (const r of all.filter((x) => x.kind === 'cut' && !c.refs.some((y) => y.id === x.id)))
        unsentBy(c, r, why[r.id] ?? { code: 'not_recorded', detail: 'left out with no reason recorded' });
    }
    for (const c of cuts) c.changes = countChanges(c);
    // How many changes a cut would carry at once without one in-between picture: its count with that picture
    // taken out of what it is drawn from (a change the cut makes itself is its action; a side never drawn
    // counts only where no floor plan lays the picture out).
    const without = (c: CutPlan, g: GhostPlan) => {
      const kept = c.refs;
      c.refs = c.refs.filter((r) => r.id !== g.id);
      const n = countChanges(c).length;
      c.refs = kept;
      return n;
    };
    for (let dropped = true; dropped;) {
      dropped = false;
      for (const g of [...ghosts].reverse()) {
        // Another in-between picture is edited from it: it stays, as that one's start.
        if (ghosts.some((o) => o.after === g.id)) continue;
        const users = cuts.filter((c) => c.refs.some((r) => r.kind === 'ghost' && r.id === g.id));
        // It is drawn where it carries a change some cut would otherwise take on in one edit that is then
        // too many: a picture that takes none of a cut's changes off it (a side the floor plan lays out
        // anyway) is not drawn, however many that cut carries.
        if (users.some((c) => without(c, g) > c.changes.length && without(c, g) >= SEVERAL)) continue;
        ghosts.splice(ghosts.indexOf(g), 1);
        for (const c of users) {
          c.refs = c.refs.filter((r) => r.id !== g.id);
          c.changes = countChanges(c);
        }
        dropped = true;
        break;
      }
    }
    // The latest of a subject's in-between pictures carries the ones it was edited from.
    for (const c of cuts) {
      const drawn = c.refs.filter((r) => r.kind === 'ghost').map((r) => ghosts.find((g) => g.id === r.id));
      c.refs = c.refs.filter(
        (r) => r.kind !== 'ghost' || !drawn.some((g) => g && g.id !== r.id && chainOf(g).some((x) => x.id === r.id)),
      );
    }
  }

  function criteria(c: CutPlan, m: Moment): Criterion[] {
    const out: Criterion[] = [];
    for (const r of c.refs) {
      if (r.kind !== 'cut') continue;
      const e = byId.get(r.id)!;
      const k = no(r.id);
      const people = seen(e).filter((p) => seen(m).includes(p));
      if (r.relation === 'same_setup')
        out.push({
          with: r.id,
          text: 'Is the second picture the same view as the first, a moment later: the same place from the same side, in the same light?',
          fix: `keep the view of picture ${k} exactly: the same place, from the same side, in the same light, a moment later`,
        });
      if (r.relation === 'same_side')
        out.push({
          with: r.id,
          text: `Do both pictures show ${name(m.place)} from the same side, with its walls, windows and furniture in the same places?`,
          fix: `show ${name(m.place)} from the same side as picture ${k}, with its walls, windows and furniture where they are there`,
        });
      if (r.relation === 'other_side' || r.relation === 'same_side' || r.relation === 'same_setup')
        out.push({
          with: r.id,
          text: 'Is the light the same in both pictures: the same time of day and the same light sources?',
          fix: `keep the light of picture ${k}: the same time of day and the same light`,
        });
      if (r.relation === 'seat')
        out.push({
          with: r.id,
          text: "Is the second picture seen through the dreamer's eyes from where they are in the first: from their place, at their eye height, with what is beside them there beside the camera?",
          fix: `seen from where the dreamer is in picture ${k}: from their place, at their eye height, with what is beside them there beside the camera`,
        });
      if (r.relation === 'shift')
        out.push(
          e.place !== m.place || r.turned
            ? {
                with: r.id,
                text: `Does the second picture keep the first one's composition, where the main shapes sit in the frame, while ${m.shift}?`,
                fix: `keep where the main shapes sit in picture ${k}'s frame, while ${m.shift}`,
              }
            : {
                with: r.id,
                text: `Does the second picture keep the first one's framing, while ${m.shift}?`,
                fix: `keep the framing of picture ${k}, while ${m.shift}`,
              },
        );
      for (const p of people)
        out.push({
          with: r.id,
          text: `Is ${name(p)} the same person in both pictures: the same face, hair and clothes?`,
          fix: `${name(p)} must be the same person as in picture ${k}: the same face, hair and clothes`,
        });
    }
    if (c.staging.length) {
      const order = c.staging.map(name).join(', then ');
      out.push({
        with: null,
        text: `From left to right in the frame, is it ${order}?`,
        fix: `from left to right: ${order}, never swapped`,
      });
    }
    // Every picture is made the same way as the one it follows: a photographic storyboard came
    // back as an ink drawing at its fifth picture (23 Sep).
    const follows = c.refs.find((r) => r.kind === 'cut');
    if (follows)
      out.push({
        with: follows.id,
        text: 'Are both pictures made the same way: the same medium (a photograph, pencil, paint, ink…) and the same finish?',
        fix: `made exactly as picture ${no(follows.id)} is: the same medium and finish`,
      });
    // Everyone in it is also held to their own sheet: drift caught at the first moment is not
    // carried into the next (a dreamer drawn from a line sketch came back as someone else, 23 Sep).
    for (const p of seen(m))
      out.push({
        with: `sheet:${p}`,
        text: `Is ${name(p)} the same person as in their reference sheet: the same face, hair and clothes?`,
        fix: `${name(p)} must look exactly like their reference sheet: the same face, hair and clothes`,
      });
    for (const t of m.things)
      out.push({
        with: `sheet:${t}`,
        text: `Is ${name(t)} the same object as in its reference sheet: the same shape, colours and details?`,
        fix: `${name(t)} must look exactly like its reference sheet: the same shape, colours and details`,
      });
    for (const st of [...c.own, ...c.states])
      out.push({
        with: null,
        text: `In this picture, is ${name(st.who)}'s ${st.what} ${st.now}?`,
        fix: `${name(st.who)}'s ${st.what} is ${st.now}`,
      });
    return out;
  }

  const issues: string[] = [];
  for (const c of cuts) {
    const m = byId.get(c.id)!;
    if (!m.action.trim() || m.action.startsWith('(no action')) issues.push(`picture ${c.order} has no visible action`);
    for (const r of c.refs)
      if (r.kind === 'cut' && !(index.get(r.id)! < c.order - 1))
        issues.push(`picture ${c.order} refers to picture ${no(r.id)}, which is not earlier`);
    if (c.changes.length >= TOO_MANY)
      issues.push(`picture ${c.order} still changes ${c.changes.length} things at once: ${c.changes.join('; ')}`);
    for (const st of [...c.own, ...c.states])
      if (!carriedBy(c, st))
        issues.push(`picture ${c.order}: ${name(st.who)}'s ${st.what} (${st.now}) is carried in words only`);
  }
  for (const g of ghosts)
    for (const n of g.needs)
      if (!cutOf.has(n) && !ghosts.some((x) => x.id === n))
        issues.push(`ghost ${g.id} needs ${n}, which is not a picture`);
  return { cuts, ghosts, issues };
}

/**
 * The order to draw in: story order, each ghost as soon as the cut it is taken from is in. The
 * scheduler still waits on `needs`; this only decides who goes first among the ready.
 */
export function drawOrder(plan: ContinuityPlan): string[] {
  const out: string[] = [];
  const placed = new Set<string>();
  const place = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    out.push(id);
  };
  for (const g of plan.ghosts) if (!g.needs.length) place(g.id);
  for (const c of plan.cuts) {
    for (const g of plan.ghosts)
      if (c.needs.includes(g.id)) {
        g.needs.forEach(place);
        place(g.id);
      }
    place(c.id);
    for (const g of plan.ghosts) if (g.needs.every((n) => placed.has(n))) place(g.id);
  }
  for (const g of plan.ghosts) place(g.id);
  return out;
}
