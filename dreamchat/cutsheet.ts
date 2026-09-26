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
import type { Eye } from './blocking';
import { type ContinuityPlan, type CutPlan, pictureName, type RefRole, type Relation, relationIn } from './continuity';
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
  type Readings,
  recordMode,
  type Seen,
  type StoryRecord,
  storyRecord,
  type Unstaged,
} from './record';
import { groupMembers, isAnimal, isGroup, type Item, LOOK, type Shape, shapeOf, toldColours } from './sheets';
import {
  type Category,
  type CutNode,
  type DreamTree,
  type Field,
  resolveTree,
  type TreePrep,
  type TreeRef,
} from './tree';

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
  } | null;
};

/** One change as the story record has it, typed. */
export type SheetChange = Pick<Change, 'key' | 'who' | 'kind' | 'part' | 'what' | 'now' | 'told'> & {
  basis?: 'implied';
};

/** The story record at this cut: who and what is there, how each is, what changes and what carries. */
export type RecordLayer = {
  shows: string[];
  present: string[];
  gone: string[];
  /** By thing: who holds it here, and who hands it over here. */
  held: Record<string, string>;
  handed: Record<string, string>;
  /** Each one there: the stage in force, what it has become, its changed parts, its holder. */
  looks: Record<string, Seen>;
  /** Of each one there: a person, animal, group, crowd, place or thing. */
  kinds: Record<string, ElementKind>;
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
  /** What belongs to a take rather than the cut: the judge's findings on the last attempt and on earlier pictures. */
  take: { repairs: string[]; strays: Record<string, string[]> };
  record: RecordLayer | null;
  tree: TreeLayer | null;
  relations: { toPrev: Relation | null; earlier: { id: string; relation: Relation }[] };
  tags: CutTags;
  flags: string[];
  /** Where each part of the sheet came from. */
  sources: Record<string, string>;
};

// ── the dream it is read from ────────────────────────────────────────────────

/** The dream as a cut sheet reads it: its breakdown, the tree resolved from it, and the story record. */
export type SheetDream = { breakdown: Breakdown; tree: DreamTree | null; record: StoryRecord | null };

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
    record = storyRecord(x.breakdown, x.items, x.readings, { words: x.words, style: x.style }).record;
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
  return { breakdown: x.breakdown, tree, record };
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

/** One cut's sheet, from the moment, its sketches, the plan's earlier pictures and the dream. Pure. */
export function cutSheet(x: CutSheetInput): CutSheet {
  const { frame, sheets, style } = x;
  const f = frame.frame;
  if (!f) throw new Error(`${frame.name} is not a moment`);
  const plan = f.plan;
  const inView = inViewOf(frame, sheets);
  const members = groupMembers(inView);
  const lookOf = (s: Item, keys: string[]) => lookIn(s, keys, { members, unsaid: plan?.unsaid, style });
  const changed = [...(plan?.own ?? []), ...(plan?.states ?? [])];
  const usable = (x.inputs ?? []).filter((i) => approved(i.item) && i.item.mediaId);
  const dreamer = sheets.find((s) => s.isDreamer);

  // What the dream itself says about the moment, each said once, as the picture is told it.
  const action = withoutGone(frame.fields.action?.value ?? '');
  const point = frame.fields.visual_point?.value ?? null;
  const writing = writingIn(action, point, ...inView.flatMap((s) => Object.values(s.fields).map((d) => d.value)));

  const elements: SheetElement[] = inView.map((s) => {
    const animal = isAnimal(s);
    const kind = s.kind === 'character' ? 'character' : s.kind === 'location' ? 'location' : 'prop';
    const whole = changed.find((st) => st.who === s.id && isWhole(st));
    return {
      id: s.id,
      ...(s.nodeId ? { nodeId: s.nodeId } : {}),
      name: nameOf(sheets, s.id) ?? s.id,
      kind,
      said:
        s.kind === 'character'
          ? animal
            ? 'animal'
            : isGroup(s)
              ? 'people'
              : 'person'
          : s.kind === 'location'
            ? 'place'
            : 'thing',
      isDreamer: !!s.isDreamer,
      group: isGroup(s),
      look: lookOf(s, LOOK[s.kind]),
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
    const n = nameOf(sheets, id);
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
  const relate = relationIn(all);
  const prevMoment = at > 0 ? all[at - 1] : undefined;
  const record = dream?.record ? recordLayer(dream.record, frame.id) : null;
  const node = dream?.tree ? treeNode(dream.tree, frame.id) : null;
  const tree = node && dream?.tree ? treeLayer(dream.tree, node) : null;
  const toPrev = at > 0 ? relate(all[at], all[at - 1]) : null;

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
      brief: frame.shot && plan?.view && frame.shot.view === plan.view ? frame.shot.text : null,
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
    earlier,
    style: { option: style, oneColour: oneColour(style), told: toldColours(frame, ...inView) },
    take: { repairs: [...(frame.repairFor ?? [])], strays },
    record,
    tree,
    relations: {
      toPrev,
      earlier: earlier.flatMap((e) => (e.kind === 'cut' && e.relation ? [{ id: e.id, relation: e.relation }] : [])),
    },
    tags: tagsOf({
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
      prevCamera: prevMoment && dream?.tree ? cameraOf(treeNode(dream.tree, prevMoment.id)?.node) : null,
    }),
    flags: [
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

function recordLayer(record: StoryRecord, id: string): RecordLayer | null {
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
  const there = [...new Set([...m.shows, ...m.present, ...(m.place ? [m.place] : [])])];
  return {
    shows: [...m.shows],
    present: [...m.present],
    gone: [...m.gone],
    held: { ...m.held },
    handed: { ...m.handed },
    looks: structuredClone(m.looks),
    kinds: Object.fromEntries(there.flatMap((e) => (record.elements[e] ? [[e, record.elements[e].kind]] : []))),
    own: m.own.flatMap(typed),
    carried: m.carried.flatMap(typed),
    facts: factsAt(record, id),
    stageable: m.stageable,
    unstaged: m.unstaged ?? null,
  };
}

/** Degrees the camera turns from the cut before for a cut to be a reverse angle. */
export const REVERSE_DEGREES = 135;

/** A cut's camera on the floor plan, its own or its shot's, as the tree has it. */
const cameraOf = (node: CutNode | undefined): Eye | null => (node?.sheet.camera.value as Eye | null) ?? null;

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
  const side = x.tree?.sheet.side?.value as string | null | undefined;
  const move: CutTags['move'] = !x.toPrev
    ? 'first'
    : x.toPrev === 'shift'
      ? 'jump'
      : seat
        ? 'seat'
        : // In the same place, across the scene's line from where its first two-shot set it, or the camera
          // turned round from the cut before: a reverse angle, the room turned.
          x.toPrev !== 'other_place' && (side === 'reverse' || turnedFrom(x.tree, x.prevCamera) >= REVERSE_DEGREES)
          ? 'reverse'
          : x.toPrev;
  // What changes here and what carries: the record's, else the plan's.
  const there = x.record
    ? new Set([...x.record.shows, ...x.record.present, ...Object.keys(x.record.looks)])
    : new Set(x.inView.map((e) => e.id));
  const own = x.record
    ? x.record.own.filter((c) => c.kind !== 'presence' && there.has(c.who)).length
    : (x.plan?.own ?? []).length;
  const carried = x.record
    ? x.record.carried.filter((c) => c.kind !== 'presence' && there.has(c.who)).length
    : (x.plan?.states ?? []).length;
  const kinds = Object.entries(x.record?.kinds ?? {}).filter(([id]) => there.has(id));
  const categories = new Set((x.tree?.at ?? []).map((e) => e.category));
  const turned = x.record
    ? Object.entries(x.record.looks).some(([id, seen]) => there.has(id) && !!seen.becomes)
    : x.inView.some((e) => e.turned !== null);
  const held = x.record
    ? Object.keys(x.record.held).some((id) => there.has(id))
    : (x.tree?.at ?? []).some((e) => !!e.holder);
  return {
    role,
    move,
    pov,
    establishing: !x.established,
    line:
      cast.length >= 2 &&
      (!!x.tree?.sheet.line?.value || (x.plan?.across?.length ?? 0) >= 2 || (x.plan?.staging.length ?? 0) >= 2),
    change: own && carried ? 'both' : own ? 'here' : carried ? 'carried' : 'none',
    turned,
    held,
    crowd: kinds.some(([, k]) => k === 'crowd') || categories.has('crowd'),
    group: kinds.some(([, k]) => k === 'group') || x.inView.some((e) => e.said === 'people'),
    animal: kinds.some(([, k]) => k === 'animal') || x.inView.some((e) => e.said === 'animal'),
    vehicle: categories.has('vehicle'),
    unstaged: x.record?.unstaged ?? null,
    dreamlike: x.dreamlike,
    writing: x.writing,
    planned: !!x.plan?.eye,
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
};

/**
 * A moment's prompt and images by DREAMCHAT_CUT_SHEET: off writes them with framePrompt, as ever; shadow
 * also builds the sheet and assembles it, logs where the two differ, and sends framePrompt's; on sends
 * the sheet's. A sheet that cannot be built is logged and framePrompt's is sent.
 */
export function framed(x: CutSheetInput, mode = cutSheetMode(), site = 'frames'): Framed {
  const today = framePrompt(x.frame, x.sheets, x.style, x.inputs ?? [], x.layout);
  if (mode === 'off') return today;
  let sheet: CutSheet;
  let made: Assembled;
  try {
    sheet = cutSheet(x);
    made = assembleCut(sheet);
  } catch (e) {
    logSheet('failed', `${site}: ${String(e).slice(0, 300)}`, x.frame.id);
    return today;
  }
  const differs = differences(today, made);
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
