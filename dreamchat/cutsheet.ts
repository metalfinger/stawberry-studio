// The cut sheet: everything one cut's picture is made from, in one place, before any of it is put in
// words. A film's paperwork does the same for a set-up: the shot list says what the camera is, the
// breakdown sheet what is in it, the script supervisor's notes how everyone looks by now and what they
// hold. Here:
// - the tree (vertical): the cut's own values and those inherited from its shot, scene, sequence and
//   dream, each with where it came from (tree.ts);
// - the story record (horizontal): who and what is in view, how each looks now, what changes here and
//   what carries from earlier, who holds what, as typed facts (record.ts);
// - relations: how its camera stands to the cuts before it (continuity.ts);
// - tags: what kind of cut it is, for the checks and the choice of images to route by;
// - what the prompt is written from: each sketch's look, cleaned once here, the earlier pictures the
//   plan draws it from, the camera, the story's words and the style.
// `assembleCut` (assemble.ts) writes the prompt and picks the images from the sheet alone.
//
// Pure: no model, no files, no clock. Behind DREAMCHAT_CUT_SHEET: off (the default) writes every prompt
// with framePrompt as before; shadow also builds the sheet, assembles it and logs where it differs from
// framePrompt; on sends what the sheet assembles.
import { assembleCut, type Assembled } from './assemble';
import { DIRECTIONS, type Eye, type Side } from './blocking';
import {
  cameraMode,
  handAct,
  handsIn,
  REVERSE_DEGREES,
  type RoomTurn,
  roomTurn,
  sameView,
  selfIn,
  turnedBetween,
  WATER,
} from './camera';
import {
  camerasOf,
  type ContinuityPlan,
  type CutPlan,
  pictureName,
  placePlan,
  planBy,
  type RefRole,
  type Relation,
  relationIn,
  sameByCamera,
  sidesByCamera,
} from './continuity';
import { wallsSeen } from './previs';
import {
  approved,
  type FrameReference,
  framePrompt,
  inViewOf,
  lookIn,
  type PlannedInput,
  straysOf,
  withoutGone,
  writingIn,
} from './frames';
import { recordJev } from './jevlog';
import { hashOf } from './lib';
import { type Breakdown, isWhole, moments, oneColour, type StyleOption } from './producer';
import {
  type Change,
  type ElementKind,
  factsAt,
  type NowOf,
  sayNow,
  type Readings,
  recordMode,
  type Seen,
  type StoryRecord,
  oneRecord,
  type Unstaged,
} from './record';
import { builds, oneBuilder, retired } from './cleanups';
import { chooseRefs, type RefsLayer, refsMode } from './refs';
import {
  groupMembers,
  inShades,
  isAnimal,
  isGroup,
  type Item,
  LOOK,
  type Shape,
  shapeOf,
  toldColours,
  coloursIn,
  withoutPose,
} from './sheets';
import {
  type Category,
  type CutNode,
  type DreamTree,
  type Field,
  resolveTree,
  type TreePrep,
  type TreeRef,
} from './tree';
import { takenOf, type TypedMoment, type TypedReading } from './typed';
import type { CastReading } from './cast-types';

/** Whether the cut sheet runs: off (the default), in shadow beside framePrompt, or on, writing the prompts. */
export function cutSheetMode(): 'off' | 'shadow' | 'on' {
  const v = (process.env.DREAMCHAT_CUT_SHEET ?? '').trim().toLowerCase();
  return v === 'on' ? 'on' : v === 'shadow' ? 'shadow' : 'off';
}

// ── the sheet ────────────────────────────────────────────────────────────────

/** What the list of what is in view calls it. */
export type Said = 'person' | 'animal' | 'people' | 'place' | 'thing';

/** Someone or something in view, as its sketch and the plan give it. */
export type SheetElement = {
  id: string;
  /** Its node in the production, for the picture's record of what it shows. */
  nodeId?: string;
  /** As a picture is told it: 'the dreamer', "the dreamer's aunt". */
  name: string;
  /** Its sketch's kind. */
  kind: 'character' | 'location' | 'prop';
  said: Said;
  isDreamer: boolean;
  /** One cast entry that is several people. */
  group: boolean;
  /**
   * Its look in words, cleaned once here: vague words, pose and framing, words from after a change,
   * a group member's words, and in a style of one colour, filled-in colours as its shades.
   */
  look: string;
  /** What it has turned into, where it has: then it is drawn from no sketch. */
  turned: string | null;
  /** Its approved sketch; none where it has no approved picture. */
  image: string | null;
  /** The changes in force on it as the plan carries them, the part each names where the record gave one. */
  changes: { what: string; now: string; part?: string }[];
  /** Colours the dream itself gives it: kept in any way of drawing. */
  colours: string[];
};

/** An earlier picture the plan draws this cut from, drawn and approved. */
export type SheetEarlier = {
  id: string;
  kind: 'cut' | 'ghost';
  image: string;
  role: RefRole;
  relation?: Relation;
  /** What the plan says it gives this picture. */
  carries: string;
  /** Only for those of them whose sketch is not in the picture. */
  who?: string[];
  /** A jump within the same place, facing another side of it. */
  turned?: boolean;
  /** For an earlier moment: its number in the story, who it shows, where, and through whose eyes. */
  frame: { order: number; visible: string[]; place: string; eyes: 'dreamer' | 'outside' } | null;
  /** For an in-between picture: what it shows. */
  ghost: {
    kind: 'state' | 'view';
    of: string;
    looksAt?: string;
    state?: { what: string; now: string; whole: boolean };
    /** With S5's references: every change it shows, those it was edited from and its own. */
    shows?: { what: string; now: string }[];
  } | null;
};

/** One change as the story record has it, typed. */
export type SheetChange = Pick<Change, 'key' | 'who' | 'kind' | 'part' | 'what' | 'now' | 'told'> & {
  basis?: 'implied';
};

/** The story record at this cut: who and what is there, how each is, what changes and what carries. */
export type RecordLayer = {
  place: string;
  shows: string[];
  present: string[];
  gone: string[];
  /** By thing: who holds it here, and who hands it over here. */
  held: Record<string, string>;
  handed: Record<string, string>;
  /** Each one there: the stage in force, what it has become, its changed parts, its holder. */
  looks: Record<string, Seen>;
  /** Of each one there or in the picture: a person, animal, group, crowd, place or thing. */
  kinds: Record<string, ElementKind>;
  /** With the one builder's kinds (S6 row 6): which of them are animals, a group or crowd of them too. */
  animals?: string[];
  own: SheetChange[];
  carried: SheetChange[];
  /** How each one is right now, as typed facts. */
  facts: NowOf[];
  stageable: boolean;
  unstaged: Unstaged | null;
};

/** The tree at this cut: its place in the tree, its complete sheet with sources, and what is present. */
export type TreeLayer = {
  sequence: string;
  scene: string;
  shot: string;
  /** Every value the cut has, its own or inherited, each with where it came from. */
  sheet: Record<string, Field<unknown>>;
  /** Everyone and everything present, with its category, how it is called here and the stage in force. */
  at: {
    id: string;
    category: Category;
    present: string;
    called: string;
    stage: string | null;
    holder?: string;
  }[];
  refs: TreeRef[];
  flags: string[];
  gaps: string[];
};

/** What kind of cut it is: what its checks and its images are chosen by. */
export type CutTags = {
  role: 'pov' | 'ots' | 'insert' | 'single' | 'two_shot' | 'group' | 'wide' | 'close_up';
  move: 'first' | 'same_setup' | 'same_side' | 'other_side' | 'reverse' | 'other_place' | 'jump' | 'seat';
  /** Its camera is on the other side of the scene's line from the cut before's. */
  crossed: boolean;
  pov: boolean;
  establishing: boolean;
  line: boolean;
  change: 'none' | 'here' | 'carried' | 'both';
  turned: boolean;
  held: boolean;
  crowd: boolean;
  group: boolean;
  animal: boolean;
  vehicle: boolean;
  unstaged: Unstaged | null;
  dreamlike: boolean;
  writing: boolean;
  /** Its camera is worked out on a floor plan. */
  planned: boolean;
};

/**
 * What the camera rules (camera.ts, DREAMCHAT_CAMERA=on) say of a cut, read off its floor plan, its
 * camera and the cut before's: kept on the sheet only with them on.
 */
export type CameraLayer = {
  /** A reverse angle: the room turned, what is now ahead, left, right and behind the camera. */
  turn: RoomTurn | null;
  /**
   * Through the dreamer's eyes: their own body where the moment is of it (they look down at
   * themselves), their hands and arms where they do something with them, else nothing of them.
   */
  body: 'self' | 'hands' | 'none' | null;
  /** With their hands in it, what the dreamer does with them, as the words have them do it ("open the door"). */
  does?: string;
  /** Earlier pictures not drawn from: the picture before, from the other side of a reverse. */
  dropped: string[];
  /** Who and what in view is only out past the place, by the side it is seen on: far off, never inside it. */
  outside: Record<string, Side>;
  /** What the rules add to the view, from the plan: said after it and after its brief. */
  lines: string[];
};

export type CutSheet = {
  id: string;
  order: number;
  scene: string;
  shot: string;
  prev: string | null;
  /** A hash of everything else on the sheet. */
  hash: string;
  /** Everyone and everything the sheet names, as a picture is told it. */
  names: Record<string, string>;
  /** The place it happens in. */
  place: string;
  /** Who the moment lists as in it. */
  visible: string[];
  dreamer: { id: string | null; wear: string };
  story: {
    /** What happens, without what is gone from it. */
    action: string;
    dreamlike: string | null;
    feeling: string | null;
    point: string | null;
    /** The dream's own jump into it. */
    shift: string;
    /** The only writing the picture may have. */
    writing: string[];
  };
  camera: {
    eyes: 'dreamer' | 'outside';
    size: 'close' | 'medium' | 'wide';
    shape: Shape;
    looksAt: string | null;
    /** What the camera sees, worked out on the floor plan. */
    view: string | null;
    /** The shot's brief, written for that same view. */
    brief: string | null;
    /** The place's sketch shows the side this cut faces. */
    sheetLayout: boolean;
    /** Seen from outside without a worked-out view: where the camera stands, and who is left to right. */
    words: string | null;
    across: string[];
    /** Who stands where, left to right, as the scene first placed them. */
    staging: string[];
    /** The mock-up of this exact picture, rendered from the floor plan. */
    previs: string | null;
  };
  inView: SheetElement[];
  /** Someone with their own sketch who is also in a group's look. */
  members: { group: string; member: string; word: string }[];
  /** Changes still in force from earlier, as the plan carries them (said where there is no record). */
  states: { who: string; what: string; now: string }[];
  /** How each one in the picture is right now, typed; null where the plan was made without the record. */
  now: NowOf[] | null;
  /** The same in words, from a plan saved before its facts were typed. */
  nowWords: string[] | null;
  earlier: SheetEarlier[];
  style: { option: StyleOption; oneColour: boolean; told: string[] };
  /**
   * Each fact said once (S6): what the builder's steps have made one, for the assembler, which reads only the
   * sheet. `look`: a look said in its image's line is not said again in "In it" (row 14). `colour`: a colour the
   * dream gives is listed once: in many colours by the style only where no line above says it, in one colour by
   * the style alone (row 15). `state`: how one is now is said once, where an image's line says it (row 16).
   */
  once?: { look: boolean; colour?: boolean; state?: boolean };
  /**
   * An earlier picture's own words (S6, found reading the viewer): sent for who someone is, as last drawn, it says
   * them by what they are, and never for someone turned into something else; the dream's jump ends with one full stop.
   */
  earlierWords?: true;
  /** Writing the story needs but does not quote shows as marks no one could read (the `story_marks` step). */
  storyMarks?: true;
  /**
   * With the `cast_named` step: weather and matter the cast reading gives this moment (the snow, the rising water, a
   * stream of bubbles), said as the picture's condition, never as a thing on the floor plan; `beyond` where it is
   * seen out past the place.
   */
  conditions?: { name: string; look: string; beyond: boolean }[];
  /** The picture before a jump gives no framing of its own where image 1 carries the layout (the `jump_words` step). */
  jumpWords?: true;
  /** With the one builder's `plan_beyond` step: what the camera rules add after the view is said with one space. */
  seenThrough?: true;
  /** With the one builder's `own_hands` step: the dreamer's clothes said as worn ("in a plain beige shirt"). */
  ownHands?: true;
  /** What belongs to a take rather than the cut: the judge's findings on the last attempt and on earlier pictures. */
  take: { repairs: string[]; strays: Record<string, string[]> };
  record: RecordLayer | null;
  tree: TreeLayer | null;
  relations: { toPrev: Relation | null; earlier: { id: string; relation: Relation }[] };
  tags: CutTags;
  /** With the camera rules on: what they say of this cut. */
  rules?: CameraLayer;
  /** With S5's references on (DREAMCHAT_REFS): image 1 by the tags, and each one's image of its stage in force. */
  refs?: RefsLayer;
  /**
   * With S6's one prompt builder on (DREAMCHAT_ONE_BUILDER): what the picture shows at one instant, as the
   * moment's typed reading has it (typed.ts), each fact Jev took; empty where the moment was not read.
   */
  typed?: TypedMoment;
  flags: string[];
  /** Where each part of the sheet came from. */
  sources: Record<string, string>;
};

// ── the dream it is read from ────────────────────────────────────────────────

/** The dream as a cut sheet reads it: its breakdown, the tree resolved from it, and the story record. */
export type SheetDream = {
  breakdown: Breakdown;
  tree: DreamTree | null;
  record: StoryRecord | null;
  /**
   * With the camera rules: each cut's camera as the plan has it (its own, or an edit's picture's), so the
   * sheet reads how cuts stand to each other from the very cameras the plan does.
   */
  cameras?: Record<string, Eye>;
  /** With the one prompt builder on: each moment's typed reading, from the dream's readings. */
  typed?: Record<string, TypedReading>;
  /** With the one builder's `cast_named` step: the cast reading (cast.ts), from the dream's readings. */
  cast?: CastReading;
};

/**
 * The dream as every cut sheet of it reads it, made once for all its cuts: the story record from the
 * sketches' words, the dreamer's messages, its readings and look, and the tree from the breakdown, the
 * plan the moments are drawn from, the prep and the sketches. With DREAMCHAT_RECORD=on the tree's looks
 * and stages are the record's. Never the conversation's goals or the pictures drawn: the drawing path
 * and a rebuild read the same.
 */
export function sheetDream(x: {
  breakdown: Breakdown;
  plan: ContinuityPlan;
  prep?: TreePrep;
  items: Item[];
  style: StyleOption | null;
  readings?: Readings;
  words?: string[];
}): SheetDream {
  let record: StoryRecord | null = null;
  try {
    record = oneRecord(x.breakdown, x.items, x.readings, { words: x.words, style: x.style }).record;
  } catch {
    record = null;
  }
  let tree: DreamTree | null = null;
  try {
    tree = resolveTree({
      breakdown: x.breakdown,
      plan: x.plan,
      ...(x.prep ? { prep: x.prep } : {}),
      items: x.items,
      style: x.style,
      ...(record && recordMode() === 'on' ? { record } : {}),
    });
  } catch {
    tree = null;
  }
  return {
    breakdown: x.breakdown,
    tree,
    record,
    ...(cameraMode() === 'on' ? { cameras: Object.fromEntries(camerasOf(x.plan)) } : {}),
    ...(oneBuilder() && x.readings?.typed ? { typed: x.readings.typed } : {}),
    ...(builds('cast_named') && x.readings?.cast ? { cast: x.readings.cast } : {}),
  };
}

export type CutSheetInput = {
  /** The moment as the harness holds it: its words (reworded, if they were), its plan, its brief. */
  frame: Item;
  sheets: Item[];
  style: StyleOption;
  inputs?: PlannedInput[];
  /** The mock-up of the moment, where it has one. */
  layout?: string;
  dream?: SheetDream | null;
};

// ── building it ──────────────────────────────────────────────────────────────

const nameOf = (sheets: Item[], id: string) => {
  const s = sheets.find((x) => x.id === id);
  return s ? (s.isDreamer ? 'the dreamer' : pictureName(s.name)) : undefined;
};

/** The last word of a name, as what a colour phrase colours: "the long green corridor" is a corridor. */
const headNoun = (name: string) => (name.toLowerCase().match(/[a-z]+/g) ?? []).at(-1) ?? '';

/**
 * The colours the dream gave, at moments before this one, to whoever and whatever is in view here: each phrase whose
 * last word is the head of one of their names ("green corridor" of the corridor, "grey heron" of the heron).
 */
export function carriedColours(b: Breakdown | undefined, momentId: string, inView: Item[]): string[] {
  if (!b) return [];
  const all = moments(b);
  const at = all.findIndex((m) => m.id === momentId);
  if (at <= 0) return [];
  const heads = new Set(inView.map((s) => headNoun(s.name)).filter(Boolean));
  const out = new Set<string>();
  for (const m of all.slice(0, at))
    for (const c of coloursIn(`${m.action ?? ''}. ${m.visual_point ?? ''}`)) if (heads.has(headNoun(c))) out.add(c);
  return [...out];
}

/** One cut's sheet, from the moment, its sketches, the plan's earlier pictures and the dream. Pure. */
export function cutSheet(x: CutSheetInput): CutSheet {
  const { frame, sheets, style } = x;
  const f = frame.frame;
  if (!f) throw new Error(`${frame.name} is not a moment`);
  const plan = f.plan;
  // Who is in view, once (S6 row 7): the story record's shows and the camera's view, where the builder's
  // in_view is on and the record holds the moment.
  // Only with the record on: off, a record is still read for the sheet's log, but no prompt is planned from it.
  const recMoment =
    builds('in_view') && recordMode() === 'on' ? x.dream?.record?.moments.find((m) => m.id === frame.id) : undefined;
  // Through whose eyes as the record read it, which left the dreamer out of what it shows (or not).
  // Through the dreamer's eyes, what they carry and the moment does not name is out of it (continuity.ts unsaidHeld).
  const unseen = new Set(plan?.carriedUnseen ?? []);
  const inView = inViewOf(frame, sheets, recMoment?.shows, recMoment?.eyes).filter((s) => !unseen.has(s.id));
  const members = groupMembers(inView);
  const lookOf = (s: Item, keys: string[]) => lookIn(s, keys, { members, unsaid: plan?.unsaid, style });
  // One name for each (S6 row 5): the story record's, where the builder's names are on and it holds one.
  const oneName = builds('names') ? (x.dream?.record ?? null) : null;
  const called = (id: string) => oneName?.elements[id]?.called ?? nameOf(sheets, id);
  const changed = [...(plan?.own ?? []), ...(plan?.states ?? [])];
  const usable = (x.inputs ?? []).filter((i) => approved(i.item) && i.item.mediaId);
  const dreamer = sheets.find((s) => s.isDreamer);

  // What the dream itself says about the moment, each said once, as the picture is told it.
  const action = withoutGone(frame.fields.action?.value ?? '');
  const point = frame.fields.visual_point?.value ?? null;
  const writing = writingIn(action, point, ...inView.flatMap((s) => Object.values(s.fields).map((d) => d.value)));

  // What the dream itself gives a colour, from what was said of the moment and of each one in view.
  // With the carried_colours step, a colour the dreamer gave someone or something at an earlier moment is still told
  // wherever it is in view: "a long green corridor" at m1 was gone from the corridor's colours at m2, and the picture
  // drew it beige (heron: the owner's picture check, 30 Sep).
  const told = builds('carried_colours')
    ? [...new Set([...toldColours(frame, ...inView), ...carriedColours(x.dream?.breakdown, frame.id, inView)])]
    : toldColours(frame, ...inView);
  // How each one looks, once (S6 row 8): the story record's base facts, where the builder's looks are on and
  // it holds the element: each field's clauses as the record kept them, a clause guessed or implied (not said,
  // confirmed or read from the story) in the style's shades, as the sketch's words were; fields apart by ";".
  const recLook = (s: Item): string | undefined => {
    // Only with the record on (off or in shadow, no prompt is planned from it), and where the record's base is
    // the sketch's own words: a sketch waiting or failed carries its look in the item's fields, which lookIn reads.
    const e = builds('looks') && recordMode() === 'on' ? x.dream?.record?.elements[s.id] : undefined;
    if (!e?.fromSketch || e.fromSketch !== hashOf(s.fields)) return undefined;
    // A change made where it is first shown is its first look ("water beginning to cover the floor"): how it is
    // now says it (the plan's facts, from the record), so the look leaves it out: said once, and never an earlier
    // stage beside a later one (the library's water had risen over the desks by m3, and its look still had it
    // beginning to cover the floor).
    // A group's words about someone who has a sketch of their own leave it: the baby's yellow onesie is the
    // baby's, not the family's. lookIn leaves them by the sketch's own pieces ("baby: tiny, with light hair",
    // up to its ";"); the record's clauses cut them finer, and "tiny, with light hair" came back without its
    // "baby:" (0199, live, 29 Sep). With step 12 the record says whom each clause of a group is about, and the
    // look leaves those whose member is in view; before it, such a group's look is lookIn's.
    if (!retired('members') && members.some((m) => m.group === s)) return undefined;
    const away = new Set(members.filter((m) => m.group === s).map((m) => m.member.id));
    return LOOK[s.kind]
      .map((k) =>
        (e.base[k] ?? [])
          .filter((f) => !f.first && !f.about?.some((id) => away.has(id)))
          // The record strips the pose of people and animals, and with step 11 of places and things; before it, the
          // sketch's clean-up strips theirs here.
          .map((f) => (s.kind === 'character' || retired('pose') ? f : { ...f, text: withoutPose(f.text, false) }))
          // A colour the dream itself gives it stays whole in a guessed clause too (S6 row 13): said one way. Its own
          // colours only: "red" said of the door keeps no guessed red scarf on the dreamer.
          .map((f) =>
            (f.basis === 'guessed' || f.basis === 'implied'
              ? inShades(f.text, style, builds('shades') ? toldColours(s) : [])
              : f.text
            ).trim(),
          )
          .filter(Boolean)
          .join(', '),
      )
      .filter(Boolean)
      .join('; ');
  };
  // One kind for each (S6 row 6): the story record's, where the builder's kinds are on and it holds one.
  const recKind = (id: string) => (builds('kinds') ? x.dream?.record?.elements[id] : undefined);
  const saidOf = (r: NonNullable<ReturnType<typeof recKind>>): Said =>
    r.kind === 'place'
      ? 'place'
      : r.kind === 'thing'
        ? 'thing'
        : r.kind === 'animal' || r.animal
          ? 'animal'
          : r.kind === 'group' || r.kind === 'crowd'
            ? 'people'
            : 'person';
  const elements: SheetElement[] = inView.map((s) => {
    const r = recKind(s.id);
    const animal = isAnimal(s);
    const kind = s.kind === 'character' ? 'character' : s.kind === 'location' ? 'location' : 'prop';
    const whole = changed.find((st) => st.who === s.id && isWhole(st));
    return {
      id: s.id,
      ...(s.nodeId ? { nodeId: s.nodeId } : {}),
      name: called(s.id) ?? s.id,
      kind,
      said: r
        ? saidOf(r)
        : s.kind === 'character'
          ? animal
            ? 'animal'
            : isGroup(s)
              ? 'people'
              : 'person'
          : s.kind === 'location'
            ? 'place'
            : 'thing',
      isDreamer: !!s.isDreamer,
      group: r ? r.kind === 'group' || r.kind === 'crowd' : isGroup(s),
      look: recLook(s) ?? lookOf(s, LOOK[s.kind]),
      turned: whole ? whole.now : null,
      image: approved(s) && s.mediaId ? s.mediaId : null,
      changes: changed
        .filter((st) => st.who === s.id)
        .map((st) => ({ what: st.what, now: st.now, ...(st.part !== undefined ? { part: st.part } : {}) })),
      colours: toldColours(s),
    };
  });

  const earlier: SheetEarlier[] = usable.map(({ use, item }) => ({
    id: use.id,
    kind: use.kind,
    image: item.mediaId as string,
    role: use.role,
    ...(use.relation ? { relation: use.relation } : {}),
    carries: use.carries,
    ...(use.who ? { who: [...use.who] } : {}),
    ...(use.turned ? { turned: true } : {}),
    frame: item.frame
      ? { order: item.frame.order, visible: [...item.frame.visible], place: item.frame.place, eyes: item.frame.eyes }
      : null,
    ghost: item.ghost
      ? {
          kind: item.ghost.kind,
          of: item.ghost.of,
          ...(item.ghost.looksAt !== undefined ? { looksAt: item.ghost.looksAt } : {}),
          ...(item.ghost.state
            ? { state: { what: item.ghost.state.what, now: item.ghost.state.now, whole: isWhole(item.ghost.state) } }
            : {}),
          ...(item.ghost.shows ? { shows: item.ghost.shows.map((x) => ({ what: x.what, now: x.now })) } : {}),
        }
      : null,
  }));

  // Everyone and everything named anywhere on the sheet.
  const named = new Set<string>([
    ...f.visible,
    ...f.things,
    f.place,
    ...(plan?.across ?? []),
    ...(plan?.staging ?? []),
    ...(plan?.states ?? []).map((st) => st.who),
    ...earlier.flatMap((e) => [...(e.frame?.visible ?? []), e.frame?.place ?? '', e.ghost?.of ?? '', ...(e.who ?? [])]),
    ...inView.map((s) => s.id),
  ]);
  const names: Record<string, string> = {};
  for (const id of [...named].filter(Boolean).sort()) {
    const n = called(id);
    if (n !== undefined) names[id] = n;
  }

  // How each one in the picture is now, as the plan carries it: typed where the plan has the record.
  const inFrame = new Set([...inView.map((s) => s.id), ...f.visible]);
  const now = plan?.facts ? plan.facts.filter((n) => inFrame.has(n.of)) : null;
  const nowWords = !plan?.facts && plan?.now ? plan.now.filter((n) => inFrame.has(n.of)).map((n) => n.text) : null;

  const strays: Record<string, string[]> = {};
  for (const { use, item } of usable) {
    const found = straysOf(item);
    if (found.length) strays[use.id] = found;
  }

  const dream = x.dream ?? null;
  const b = dream?.breakdown;
  const all = b ? moments(b).map((m) => ({ ...m, looks_at: m.looks_at ?? '', shift: m.shift ?? '' })) : [];
  const at = all.findIndex((m) => m.id === frame.id);
  const camera = cameraMode() === 'on';
  // With the camera rules, how one moment stands to another is the plan's: the jump's own moment is on
  // its far side, and cameras placed on one floor plan say whether two face the same side.
  // The plan's cameras (camerasOf): the same the plan read its relations from.
  const cams = new Map<string, Eye>(camera ? Object.entries(dream?.cameras ?? {}) : []);
  const relate =
    camera && b
      ? relationIn(all, { camera: true, sides: sidesByCamera(b, cams), same: sameByCamera(b, cams) })
      : relationIn(all);
  const prevMoment = at > 0 ? all[at - 1] : undefined;
  const record = dream?.record
    ? recordLayer(
        dream.record,
        frame.id,
        inView.map((s) => s.id),
      )
    : null;
  const node = dream?.tree ? treeNode(dream.tree, frame.id) : null;
  const tree = node && dream?.tree ? treeLayer(dream.tree, node) : null;
  const toPrev = at > 0 ? relate(all[at], all[at - 1]) : null;
  const prevNode = prevMoment && dream?.tree ? treeNode(dream.tree, prevMoment.id)?.node : undefined;

  const tags = tagsOf({
    eyes: f.eyes,
    size: f.distance,
    inView: elements,
    plan,
    record,
    tree,
    toPrev,
    dreamlike: !!frame.fields.dream?.value,
    writing: writing.length > 0,
    prev: prevMoment,
    here: all[at],
    established: at > 0 && all.slice(0, at).some((e) => ['same_side', 'same_setup'].includes(relate(all[at], e))),
    dreamerId: b?.people.find((p) => p.is_dreamer)?.id,
    prevCamera: prevNode ? cameraOf(prevNode) : null,
    prevSide: (prevNode?.sheet.side.value as string | null | undefined) ?? null,
    ...(camera && b && prevMoment
      ? {
          rules: {
            eye: cams.get(frame.id) ?? null,
            prevEye: cams.get(prevMoment.id) ?? null,
            samePlan: !!placePlan(b, frame.id) && placePlan(b, frame.id) === placePlan(b, prevMoment.id),
            crossed: !!plan?.crossed,
          },
        }
      : camera
        ? { rules: { eye: null, prevEye: null, samePlan: false, crossed: false } }
        : {}),
  });
  const rules =
    camera && b
      ? cameraLayer({
          b,
          frame,
          plan,
          tags,
          elements,
          earlier,
          record,
          names,
          prev: prevMoment ? { id: prevMoment.id, order: at, eye: cams.get(prevMoment.id) ?? null } : null,
          eye: cams.get(frame.id) ?? null,
          dreamerId: dreamer?.id ?? b.people.find((p) => p.is_dreamer)?.id,
        })
      : null;
  const drawnFrom = rules ? earlier.filter((e) => !rules.layer.dropped.includes(e.id)) : earlier;
  const refsOn = refsMode();
  const refs =
    refsOn === 'off'
      ? null
      : chooseRefs({ earlier: drawnFrom, inView: elements, camera: { previs: x.layout ?? null } }, refsOn);

  const sheet: Omit<CutSheet, 'hash'> = {
    id: frame.id,
    order: f.order,
    scene: plan?.scene ?? tree?.scene ?? '',
    shot: plan?.shot ?? tree?.shot ?? '',
    prev: prevMoment?.id ?? null,
    names,
    place: f.place,
    visible: [...f.visible],
    dreamer: { id: dreamer?.id ?? null, wear: dreamer ? lookOf(dreamer, ['wardrobe']) : '' },
    story: {
      action,
      dreamlike: frame.fields.dream?.value ?? null,
      feeling: frame.fields.feeling?.value ?? null,
      point,
      shift: frame.fields.shift?.value ?? '',
      writing,
    },
    camera: {
      eyes: f.eyes,
      size: f.distance,
      shape: shapeOf(frame),
      looksAt: f.looksAt ?? null,
      view: plan?.view ?? null,
      brief: frame.shot && plan?.view && sameView(frame.shot.view, plan.view) ? frame.shot.text : null,
      sheetLayout: plan?.sheetLayout !== false,
      words: plan?.camera ?? null,
      across: [...(plan?.across ?? [])],
      staging: [...(plan?.staging ?? [])],
      previs: x.layout ?? null,
    },
    inView: elements,
    members: members.map((m) => ({ group: m.group.id, member: m.member.id, word: m.word })),
    states: (plan?.states ?? []).map((st) => ({ who: st.who, what: st.what, now: st.now })),
    now,
    nowWords,
    earlier: drawnFrom,
    style: { option: style, oneColour: oneColour(style), told },
    ...(builds('look_once')
      ? {
          once: {
            look: true,
            ...(builds('colour_once') ? { colour: true } : {}),
            ...(builds('state_once') ? { state: true } : {}),
          },
        }
      : {}),
    ...(builds('earlier_words') ? { earlierWords: true as const } : {}),
    ...(builds('story_marks') ? { storyMarks: true as const } : {}),
    ...(builds('jump_words') ? { jumpWords: true as const } : {}),
    ...(builds('plan_beyond') ? { seenThrough: true as const } : {}),
    ...(builds('own_hands') ? { ownHands: true as const } : {}),
    ...(() => {
      // Water the camera's own words already measure ("The water stands about 2 metres deep") is said there once,
      // never again as a condition.
      const measured = WATER.test([plan?.view, plan?.camera, ...(rules?.layer.lines ?? [])].filter(Boolean).join(' '));
      const c = (x.dream?.cast?.things ?? []).flatMap((t) =>
        (t.kind === 'weather' || t.kind === 'matter') && !(measured && WATER.test(t.name))
          ? t.moments
              .filter((m) => m.id === frame.id)
              .map((m) => ({ name: t.name, look: t.look, beyond: m.where === 'beyond' }))
          : [],
      );
      return c.length ? { conditions: c } : {};
    })(),
    take: { repairs: [...(frame.repairFor ?? [])], strays },
    record,
    tree,
    relations: {
      toPrev,
      earlier: drawnFrom.flatMap((e) => (e.kind === 'cut' && e.relation ? [{ id: e.id, relation: e.relation }] : [])),
    },
    tags,
    ...(rules ? { rules: rules.layer } : {}),
    ...(refs ? { refs } : {}),
    ...(oneBuilder() ? { typed: takenOf(dream?.typed?.[frame.id], f.eyes) } : {}),
    flags: [
      ...(rules?.flags ?? []),
      ...(tree?.flags ?? []),
      ...(dream && !dream.tree ? ['tree_failed'] : []),
      ...(dream && !dream.record ? ['record_failed'] : []),
      // The plan the moment is drawn from was made from an older record than the dream holds now.
      ...(record && plan?.facts && JSON.stringify(plan.facts) !== JSON.stringify(record.facts) ? ['record_moved'] : []),
    ],
    sources: {
      story: `cut:${frame.id}.fields (as the moment holds its words)`,
      camera: plan?.view ? `cont:${frame.id}.view` : `b:${frame.id}.distance/eyes/looks_at`,
      brief: frame.shot ? `cut:${frame.id}.shot` : 'none',
      inView: `frames.inViewOf(cont:${frame.id}.visible/things/sees, b:${frame.id}.place)`,
      look: 'items:<id>.fields (the sketches as drawn)',
      now: plan?.facts
        ? 'record (typed, as the plan was made from it)'
        : plan?.now
          ? 'record (in words only: a plan saved before its facts were typed)'
          : 'none',
      states: plan?.now ? 'record' : `b:${frame.id}.states`,
      earlier: `cont:${frame.id}.refs, drawn and approved`,
      previs: x.layout ? 'previs of the floor plan' : 'none',
      record: record ? 'record.ts storyRecord' : 'none',
      tree: tree ? 'tree.ts resolveTree' : 'none',
    },
  };
  return { ...sheet, hash: hashOf(sheet) };
}

function treeNode(
  tree: DreamTree,
  cut: string,
): { node: CutNode; sequence: string; scene: string; shot: string } | null {
  for (const q of tree.dream.sequences)
    for (const sc of q.scenes)
      for (const sh of sc.shots) {
        const node = sh.cuts.find((c) => c.id === cut);
        if (node) return { node, sequence: q.id, scene: sc.id, shot: sh.id };
      }
  return null;
}

function treeLayer(tree: DreamTree, n: NonNullable<ReturnType<typeof treeNode>>): TreeLayer {
  const { node } = n;
  return {
    sequence: n.sequence,
    scene: n.scene,
    shot: n.shot,
    sheet: node.sheet as unknown as Record<string, Field<unknown>>,
    at: Object.values(node.at)
      .filter((e) => e.present !== 'on_plan')
      .map((e) => ({
        id: e.id,
        category: tree.elements[e.id]?.category.value ?? 'prop',
        present: e.present,
        called: e.called.value ?? e.id,
        stage: e.stage.value,
        ...(e.holder?.value ? { holder: e.holder.value } : {}),
      })),
    refs: node.refs,
    flags: node.flags,
    gaps: node.gaps,
  };
}

function recordLayer(record: StoryRecord, id: string, inPicture: string[]): RecordLayer | null {
  const m = record.moments.find((x) => x.id === id);
  if (!m) return null;
  const typed = (k: string): SheetChange[] => {
    const c = record.changes[k];
    return c
      ? [
          {
            key: c.key,
            who: c.who,
            kind: c.kind,
            part: c.part,
            what: c.what,
            now: c.now,
            told: c.told,
            ...(c.basis ? { basis: c.basis } : {}),
          },
        ]
      : [];
  };
  const there = [...new Set([...m.shows, ...m.present, ...(m.place ? [m.place] : []), ...inPicture])];
  return {
    place: m.place,
    shows: [...m.shows],
    present: [...m.present],
    gone: [...m.gone],
    held: { ...m.held },
    handed: { ...m.handed },
    looks: structuredClone(m.looks),
    kinds: Object.fromEntries(there.flatMap((e) => (record.elements[e] ? [[e, record.elements[e].kind]] : []))),
    ...(builds('kinds') ? { animals: there.filter((e) => !!record.elements[e]?.animal) } : {}),
    own: m.own.flatMap(typed),
    carried: m.carried.flatMap(typed),
    facts: factsAt(record, id),
    stageable: m.stageable,
    unstaged: m.unstaged ?? null,
  };
}

export { REVERSE_DEGREES } from './camera';

/** A cut's camera on the floor plan, its own or its shot's, as the tree has it. */
const cameraOf = (node: CutNode | undefined): Eye | null => (node?.sheet.camera.value as Eye | null) ?? null;

/** How far one camera faces from another, in degrees; 0 where either is missing. */
const turnedBetweenEyes = (a: Eye | null, z: Eye | null) => (a && z ? turnedBetween(a, z) : 0);

/** How far a cut's camera faces from another's, in degrees; 0 where either has none. */
function turnedFrom(tree: TreeLayer | null, prev: Eye | null): number {
  const eye = tree?.sheet.camera?.value as Eye | null | undefined;
  if (!eye || !prev) return 0;
  const cos = Math.max(-1, Math.min(1, eye.d.x * prev.d.x + eye.d.y * prev.d.y));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** A cut's tags, from its camera, what is in view, the record, the tree and how it follows the cut before. */
function tagsOf(x: {
  eyes: 'dreamer' | 'outside';
  size: 'close' | 'medium' | 'wide';
  inView: SheetElement[];
  plan: CutPlan | undefined;
  record: RecordLayer | null;
  tree: TreeLayer | null;
  toPrev: Relation | null;
  dreamlike: boolean;
  writing: boolean;
  prev: { id: string; eyes: string; place: string; visible: string[] } | undefined;
  here: { id: string; place: string } | undefined;
  established: boolean;
  dreamerId: string | undefined;
  prevCamera: Eye | null;
  prevSide: string | null;
  /**
   * With the camera rules: this cut's and the cut before's cameras as the plan has them, whether both are
   * on one floor plan (a reverse is the room turned, never two places), and whether the plan has it cross
   * the scene's line (one definition: the plan's, which placed the camera).
   */
  rules?: { eye: Eye | null; prevEye: Eye | null; samePlan: boolean; crossed: boolean };
}): CutTags {
  const cast = x.inView.filter((e) => e.kind === 'character');
  const pov = x.eyes === 'dreamer';
  const treeRole = x.tree?.sheet.role?.value as string | null | undefined;
  const role: CutTags['role'] = pov
    ? 'pov'
    : treeRole === 'ots'
      ? 'ots'
      : !cast.length
        ? x.size === 'wide'
          ? 'wide'
          : 'insert'
        : x.size === 'wide'
          ? 'wide'
          : cast.length === 1
            ? x.size === 'close'
              ? 'close_up'
              : 'single'
            : cast.length === 2
              ? 'two_shot'
              : 'group';
  // Through the dreamer's eyes straight after they were seen from outside in the same place: the camera
  // moves to where they are.
  const seat =
    pov &&
    !!x.prev &&
    x.prev.eyes === 'outside' &&
    x.prev.place === x.here?.place &&
    !!x.dreamerId &&
    x.prev.visible.includes(x.dreamerId);
  const side = (x.tree?.sheet.side?.value as string | null | undefined) ?? null;
  const move: CutTags['move'] = !x.toPrev
    ? 'first'
    : x.toPrev === 'shift'
      ? 'jump'
      : seat
        ? 'seat'
        : // In the same place with the camera turned round from the cut before: a reverse angle, the room turned.
          x.toPrev !== 'other_place' &&
            (x.rules
              ? x.rules.samePlan && turnedBetweenEyes(x.rules.eye, x.rules.prevEye) >= REVERSE_DEGREES
              : turnedFrom(x.tree, x.prevCamera) >= REVERSE_DEGREES)
          ? 'reverse'
          : x.toPrev;
  // Crossing the line: on the other side of the scene's line from the cut before, each side known.
  const sides = ['established', 'reverse'];
  const crossed = x.rules
    ? x.rules.crossed
    : x.toPrev !== null &&
      x.toPrev !== 'other_place' &&
      x.toPrev !== 'shift' &&
      !!side &&
      !!x.prevSide &&
      sides.includes(side) &&
      sides.includes(x.prevSide) &&
      side !== x.prevSide;
  // What the picture shows: the record's moment lists and its place, and whoever the camera takes in.
  // Whoever is only there, out of the picture, is not counted.
  const inPicture = new Set([
    ...x.inView.map((e) => e.id),
    ...(x.record ? [...x.record.shows, ...(x.record.place ? [x.record.place] : [])] : []),
  ]);
  const own = x.record
    ? x.record.own.filter((c) => c.kind !== 'presence' && inPicture.has(c.who)).length
    : (x.plan?.own ?? []).length;
  const carried = x.record
    ? x.record.carried.filter((c) => c.kind !== 'presence' && inPicture.has(c.who)).length
    : (x.plan?.states ?? []).length;
  // What each one in the picture is: the record's kind where it has one, else what its sketch says.
  const fromSketch = (e: SheetElement): ElementKind | undefined =>
    e.said === 'people' ? 'group' : e.said === 'animal' ? 'animal' : undefined;
  const categoryOf = new Map((x.tree?.at ?? []).map((e) => [e.id, e.category]));
  const kindOf = (id: string): ElementKind | Category | undefined => {
    const e = x.inView.find((v) => v.id === id);
    return x.record?.kinds[id] ?? (e ? fromSketch(e) : undefined) ?? categoryOf.get(id);
  };
  const kinds = new Set([...inPicture].map(kindOf));
  const categories = new Set((x.tree?.at ?? []).map((e) => e.category));
  const turned = x.record
    ? Object.entries(x.record.looks).some(([id, seen]) => inPicture.has(id) && !!seen.becomes)
    : x.inView.some((e) => e.turned !== null);
  const held = x.record
    ? Object.entries(x.record.held).some(([thing]) => inPicture.has(thing))
    : (x.tree?.at ?? []).some((e) => !!e.holder && inPicture.has(e.id));
  return {
    role,
    move,
    crossed,
    pov,
    establishing: !x.established,
    line:
      cast.length >= 2 &&
      (!!x.tree?.sheet.line?.value || (x.plan?.across?.length ?? 0) >= 2 || (x.plan?.staging.length ?? 0) >= 2),
    change: own && carried ? 'both' : own ? 'here' : carried ? 'carried' : 'none',
    turned,
    held,
    crowd: kinds.has('crowd'),
    group: kinds.has('group'),
    animal: kinds.has('animal') || [...inPicture].some((id) => !!x.record?.animals?.includes(id)),
    vehicle: categories.has('vehicle'),
    unstaged: x.record?.unstaged ?? null,
    dreamlike: x.dreamlike,
    writing: x.writing,
    planned: !!x.plan?.eye,
  };
}

/**
 * Across a reverse angle, the picture before is neither the picture edited nor where things stand: it
 * shows the room from the other side (camera rules). The earlier pictures a cut is therefore not drawn
 * from, by id.
 */
export function notDrawnFrom(
  move: CutTags['move'],
  prev: string,
  earlier: Pick<SheetEarlier, 'id' | 'kind' | 'role'>[],
): string[] {
  if (move !== 'reverse') return [];
  return earlier
    .filter((e) => e.kind === 'cut' && e.id === prev && (e.role === 'base' || e.role === 'composition'))
    .map((e) => e.id);
}

/** Which side of a place a camera faces most: its front, back or a side. */
function sideFaced(eye: Eye): Side {
  return (Object.entries(DIRECTIONS) as [Side, { x: number; y: number }][]).reduce((a, b) =>
    b[1].x * eye.d.x + b[1].y * eye.d.y > a[1].x * eye.d.x + a[1].y * eye.d.y ? b : a,
  )[0];
}

/**
 * The camera rules over this cut and the one before it (camera.ts): a reverse angle's room turned, and
 * the picture before never drawn from across it; through the dreamer's eyes, their hands only where
 * they do something with them; who and what is only out past the place; and flags for a crossing of
 * the scene's line and a cut to the same people at the same size from the same camera.
 */
function cameraLayer(x: {
  b: Breakdown;
  frame: Item;
  plan: CutPlan | undefined;
  tags: CutTags;
  elements: SheetElement[];
  earlier: SheetEarlier[];
  record: RecordLayer | null;
  names: Record<string, string>;
  prev: { id: string; order: number; eye: Eye | null } | null;
  /** This cut's camera as the plan has it: its own, or the picture's it is edited from. */
  eye: Eye | null;
  dreamerId: string | undefined;
}): { layer: CameraLayer; flags: string[] } {
  const f = x.frame.frame!;
  const eye = x.eye;
  const flags: string[] = [];
  const floor = planBy(x.b, x.frame.id);
  const named = (id: string) => x.names[id] ?? floor?.spots.find((s) => s.id === id)?.name ?? id;

  // A reverse angle: the room turned with the camera, said from the floor plan; and the picture before,
  // from the other side, is never the picture edited nor where things stand.
  let turn: RoomTurn | null = null;
  const dropped: string[] = [];
  if (x.tags.move === 'reverse' && x.prev) {
    if (eye && floor && x.prev.eye) {
      const place = x.elements.find((e) => e.id === f.place);
      turn = roomTurn({
        plan: floor,
        walls: wallsSeen(floor, eye, f.eyes === 'dreamer' && x.dreamerId ? [x.dreamerId] : [], named),
        from: x.prev.order,
        look: place?.look ?? '',
        place: named(f.place),
        prevFaced: sideFaced(x.prev.eye),
      });
    }
    for (const id of notDrawnFrom(x.tags.move, x.prev.id, x.earlier)) {
      dropped.push(id);
      flags.push(`reverse_not_drawn_from:${id}`);
    }
  }

  // Through the dreamer's own eyes: their hands and arms only where they do something with them.
  // What they carry out of the picture puts no hands in it (continuity.ts unsaidHeld).
  const carriedUnseen = new Set(x.plan?.carriedUnseen ?? []);
  const holds =
    !!x.dreamerId &&
    (Object.entries(x.record?.held ?? {}).some(([id, by]) => by === x.dreamerId && !carriedUnseen.has(id)) ||
      (x.plan?.facts ?? []).some(
        (n) => !carriedUnseen.has(n.of) && n.facts.some((k) => k.kind === 'held' && k.by === x.dreamerId),
      ));
  const words = [x.frame.fields.action?.value ?? '', x.frame.fields.visual_point?.value ?? '', f.looksAt ?? ''];
  const body = f.eyes === 'dreamer' ? (selfIn(words) ? 'self' : handsIn(words, holds) ? 'hands' : 'none') : null;

  // Who and what in view is only out past the place: far off, never inside it.
  const outside: Record<string, Side> = {};
  for (const e of x.elements) if (floor?.outside?.[e.id]) outside[e.id] = floor.outside[e.id];

  // As the plan placed the cameras: the cut whose side of the scene's line this one crossed from (not
  // always the cut before), and the earlier cut of the same people at the same size whose camera it
  // could not leave.
  if (x.plan?.crossed) flags.push(`crossed_line:${x.plan.crossed}`);
  if (x.plan?.sameCamera) flags.push(`same_camera:${x.plan.sameCamera}`);
  const does = body === 'hands' && builds('own_hands') ? handAct(words.slice(0, 2)) : null;
  return {
    layer: { turn, body, ...(does ? { does } : {}), dropped, outside, lines: [...(x.plan?.rules ?? [])] },
    flags,
  };
}

/** A cut's tags as words for a list: "role:pov", "move:jump", "held". */
export function tagWords(t: CutTags): string[] {
  return [
    `role:${t.role}`,
    `move:${t.move}`,
    ...(t.change !== 'none' ? [`change:${t.change}`] : []),
    ...(t.unstaged ? [`unstaged:${t.unstaged}`] : []),
    ...(
      [
        'crossed',
        'pov',
        'establishing',
        'line',
        'turned',
        'held',
        'crowd',
        'group',
        'animal',
        'vehicle',
        'dreamlike',
        'writing',
        'planned',
      ] as const
    ).filter((k) => t[k]),
  ];
}

// ── comparing sheets ─────────────────────────────────────────────────────────

/** An in-between picture named by what it shows, which survives planning again (its number may not). */
export const ghostName = (g: { of: string; kind: string; state?: { what: string } }) =>
  `ghost:${g.of}:${g.kind === 'view' ? 'view' : (g.state?.what ?? '')}`;

/** A drawn dream's images named by what they are: `sketch:p1`, `picture:m3`, `previs:m5`, `ghost:t1:lid`. */
export function imageNamesOf(items: Item[], frames: Item[]): (media: string) => string {
  const named = new Map<string, string>();
  for (const i of items) if (i.mediaId) named.set(i.mediaId, `sketch:${i.id}`);
  for (const f of frames) {
    if (f.mediaId) named.set(f.mediaId, f.ghost ? ghostName(f.ghost) : `picture:${f.id}`);
    if (f.layout?.mediaId) named.set(f.layout.mediaId, `previs:${f.id}`);
  }
  return (media) => named.get(media) ?? `other:${media}`;
}

/**
 * A sheet with its images named by what they are and its hash left out, to compare two copies of it made
 * with different images (drawn, or a rebuild's stand-ins). With `words`, how each one is now is compared
 * as words: a plan saved before its facts were typed carries only the words. With `earlier`, only those
 * earlier pictures are kept: a rebuild takes every earlier picture as drawn.
 */
export function namedSheet(
  sheet: CutSheet,
  name: (media: string) => string,
  opts: { words?: boolean; earlier?: string[] } = {},
): Omit<CutSheet, 'hash'> {
  const { hash: _, ...rest } = structuredClone(sheet);
  const kept = (id: string) => !opts.earlier || opts.earlier.includes(id);
  return {
    ...rest,
    inView: rest.inView.map((e) => ({ ...e, image: e.image && name(e.image) })),
    earlier: rest.earlier.filter((e) => kept(e.id)).map((e) => ({ ...e, image: name(e.image) })),
    relations: { ...rest.relations, earlier: rest.relations.earlier.filter((e) => kept(e.id)) },
    camera: { ...rest.camera, previs: rest.camera.previs && name(rest.camera.previs) },
    ...(opts.words
      ? {
          now: null,
          nowWords: rest.now ? sayNow(rest.now).map((x) => x.text) : rest.nowWords,
          sources: { ...rest.sources, now: 'words' },
        }
      : {}),
  };
}

/** Parts of a sheet compared one by one: its top level, and the camera's, story's, record's, tags' and dreamer's fields. */
const OPENED = ['camera', 'story', 'record', 'tags', 'dreamer'];

/** A sheet's parts, each hashed, by name: where two prints differ says which parts moved. */
function partsOf(sheet: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sheet))
    if (OPENED.includes(k) && v && typeof v === 'object' && !Array.isArray(v))
      for (const [f, w] of Object.entries(v)) out[`${k}.${f}`] = hashOf(w);
    else out[k] = hashOf(v);
  return out;
}

/**
 * What a moment's sheet was when it was sent, kept on the moment: its hash with its images named by what
 * they are, each part's hash, and the earlier pictures it had (only those drawn by then).
 */
export type SheetPrint = { hash: string; parts: Record<string, string>; earlier: string[] };

export function sheetPrint(
  sheet: CutSheet,
  name: (media: string) => string,
  opts: { words?: boolean; earlier?: string[] } = {},
): SheetPrint {
  const named = namedSheet(sheet, name, opts);
  return { hash: hashOf(named), parts: partsOf(named), earlier: named.earlier.map((e) => e.id) };
}

/** The parts where two prints differ; none when they are the same. */
export function printDiff(a: SheetPrint, z: SheetPrint): string[] {
  if (a.hash === z.hash) return [];
  return [...new Set([...Object.keys(a.parts), ...Object.keys(z.parts)])]
    .filter((k) => a.parts[k] !== z.parts[k])
    .sort();
}

// ── shadow and on ────────────────────────────────────────────────────────────

/** Where what the sheet assembles differs from framePrompt's prompt and images; none when they are the same. */
export function differences(
  today: { prompt: string; references: FrameReference[]; depicted: string[] },
  made: Assembled,
): string[] {
  const out: string[] = [];
  if (today.prompt !== made.prompt) {
    const a = today.prompt.split('\n\n');
    const z = made.prompt.split('\n\n');
    const i = a.findIndex((p, k) => p !== z[k]);
    out.push(
      `prompt, paragraph ${i < 0 ? z.length : i + 1}: framePrompt "${(a[i] ?? '').slice(0, 160)}" / sheet "${(z[i < 0 ? a.length : i] ?? '').slice(0, 160)}"`,
    );
  }
  const n = Math.max(today.references.length, made.references.length);
  for (let i = 0; i < n; i++) {
    const a = today.references[i];
    const z = made.references[i];
    if (!a || !z) out.push(`image ${i + 1}: only in ${a ? 'framePrompt' : 'the sheet'}`);
    else if (a.media_id !== z.image || a.role !== z.role || a.instruction !== z.instruction)
      out.push(`image ${i + 1}: framePrompt ${a.role} ${a.media_id} / sheet ${z.role} ${z.image}`);
  }
  if (JSON.stringify(today.depicted) !== JSON.stringify(made.depicted)) out.push('what it depicts');
  return out;
}

/** A frame's prompt, images and what it depicts, as sent; with the sheet, where it was built. */
export type Framed = {
  prompt: string;
  references: FrameReference[];
  depicted: string[];
  sheet?: CutSheet;
  /** Where the sheet's assembly differs from framePrompt's (shadow and on). */
  differs?: string[];
  /**
   * With the sheet on and the one prompt builder's paragraph ids (S6 ledger 4): each paragraph as sent, by
   * name, and each image with its source and whom it is attached for, as the assembler put them in. What the
   * gate and the evals read, where they worked it out again from the words.
   */
  assembled?: Pick<Assembled, 'lines' | 'references'>;
};

/**
 * Who is in view of a built picture, as the gate reads it on the drawing path: the sheet's, where the one
 * builder's in_view has it made once (S6 row 7) and the prompt is assembled from the sheet (on, not in
 * shadow); else the plan's lists (frames.ts inViewOf). One rule for the gate and for a rebuild.
 */
export const inViewIn = (built: Framed, frame: Item, sheets: Item[]): Item[] =>
  builds('in_view') && cutSheetMode() === 'on' && built.sheet
    ? built.sheet.inView.flatMap((e) => sheets.filter((i) => i.id === e.id))
    : inViewOf(frame, sheets);

/**
 * A moment's prompt and images by DREAMCHAT_CUT_SHEET: off writes them with framePrompt, as ever; shadow
 * also builds the sheet and assembles it, logs where the two differ, and sends framePrompt's; on sends
 * the sheet's. A sheet that cannot be built is logged and framePrompt's is sent. With `log` false (a prompt
 * only looked at), nothing is logged.
 */
export function framed(x: CutSheetInput, mode = cutSheetMode(), site = 'frames', log = true): Framed {
  const today = framePrompt(x.frame, x.sheets, x.style, x.inputs ?? [], x.layout);
  if (mode === 'off') return today;
  let sheet: CutSheet;
  let made: Assembled;
  try {
    sheet = cutSheet(x);
    made = assembleCut(sheet);
  } catch (e) {
    if (log) logSheet('failed', `${site}: ${String(e).slice(0, 300)}`, x.frame.id);
    return today;
  }
  const differs = differences(today, made);
  if (log)
    logSheet(
      differs.length ? 'differs' : 'same',
      `${site}: ${differs.length ? differs.join('; ') : 'the sheet assembles what framePrompt writes'}; tags ${tagWords(sheet.tags).join(', ')}`,
      x.frame.id,
    );
  if (mode === 'on')
    return {
      prompt: made.prompt,
      references: made.references.map((r) => ({ media_id: r.image, role: r.role, instruction: r.instruction })),
      depicted: made.depicted,
      sheet,
      differs,
      ...(builds('paragraph_ids') ? { assembled: { lines: made.lines, references: made.references } } : {}),
    };
  return { ...today, sheet, differs };
}

function logSheet(decision: string, reason: string, moment: string): void {
  recordJev({
    kind: 'transition',
    stage: 'cut_sheet',
    to: 'prompt',
    moment,
    facts: [],
    decision,
    reason: reason.slice(0, 4000),
  });
}
