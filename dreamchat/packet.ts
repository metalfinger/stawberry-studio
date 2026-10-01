// The node packet: what Dream Chat hands a harness for every picture it would draw, so the harness can draw it, check
// it and redraw it without reading Dream Chat's code. Per dream: its sketches (each one's prompt and look, said or
// guessed), its in-between pictures (the one change each makes, and what it is edited from), and a node per cut:
// where it sits in the tree, its story, who and what is in it and how each is right then, its camera on its floor plan
// and its mock-up, what it is drawn from and must wait for, its checks, the owner's verdicts on earlier drawings of it,
// and Dream Chat's own prompt for it whole, paragraph by paragraph, so a harness writing its own can be compared on the
// same seed. Written from what a rebuild already has (plan.ts rebuild: the cut sheet, the continuity plan, the floor
// plans, the story record); nothing on the drawing path calls it, so it changes no prompt, no image and no plan.
// Checked against its schema (`PACKET_SCHEMA`, written out as packet.schema.json for a harness in any language).
import { drawnEnv } from './asdrawn';
import type { Blocking, Eye, Spot } from './blocking';
import { shotPlan } from './continuity';
import type { Criterion, RefRole, Relation, UnsentWhy } from './continuity';
import type { CutTags } from './cutsheet';
import { type Rebuilt, standIn } from './plan';
import { onOf } from './previs';
import { moments, type StyleOption } from './producer';
import type { NowOf } from './record';
import { sheetPrompt } from './sheets';

/** The packet's version: a harness reading one checks it. */
export const PACKET_VERSION = 2;

/** A verdict the owner gave a drawing of this picture: in the story's verdicts, a checkpoint, or a local run. */
export type VerdictPacket = {
  source: 'story' | 'checkpoint' | 'local';
  /** The local run it was drawn in. */
  run?: string;
  verdict: 'right' | 'partly' | 'wrong';
  note?: string;
  at?: string;
  /** A local run drawn without the dream's readings (its manifest lists them missing): not evidence of the harness. */
  withoutReadings?: true;
};

/**
 * A picture's prompt for one image model, with the images it is sent in order (by name: see `ImagePacket.media`):
 * `nano-banana-pro` is Dream Chat's own, whole, by paragraph; `qwen-image` the same fitted to the local machine's limits
 * (4 images, 4000 characters), its default; `qwen-image-written` written for that machine from the cut's sheet.
 */
export type ModelPrompt = {
  text: string;
  paragraphs?: { id: string; text: string; fields: string[] }[];
  images: string[];
  /** What the fitting left out, by name. */
  dropped?: string[];
};
export type Prompts = {
  'nano-banana-pro': ModelPrompt;
  'qwen-image'?: ModelPrompt;
  'qwen-image-written'?: ModelPrompt;
};

/** A cut's mock-up as files beside the packets: its path from the packet's folder and its content's sha256. */
export type PrevisFile = { file: string; sha256: string };
/**
 * A cut's mock-up (previs.ts), rendered from its floor plan through its camera: grey and labelled, as fal is sent it,
 * and colour-keyed with the key that says which colour is who, as the local machine may be.
 */
export type PrevisPacket = {
  media: string;
  clay: PrevisFile | null;
  keyed: (PrevisFile & { key: { id: string; name: string; colour: string; kind: string }[] }) | null;
};

/** A person, place or thing as it is sketched: its prompt, and its look field by field, said or guessed. */
export type ElementPacket = {
  id: string;
  kind: 'character' | 'location' | 'prop';
  name: string;
  isDreamer: boolean;
  look: Record<string, { value: string; said: boolean }>;
  prompt: string;
  /** Its sketch, by the name the cuts' images use. */
  image: string | null;
  /** One cast entry that is several people; the group it is one of; only ever a crowd. */
  group: boolean;
  partOf: string | null;
  extras: boolean;
};

/** An image a picture is sent, in order, with what it is for. */
export type ImagePacket = {
  n: number;
  media: string;
  role: 'identity' | 'location' | 'prop' | 'base' | 'composition';
  instruction: string;
  /** With the one prompt builder's paragraph ids: what the image is (the edit base, the mock-up, a sketch …) and of whom. */
  source: 'edit' | 'mockup' | 'sketch' | 'ghost' | 'earlier' | null;
  of: string | null;
  subjects: string[];
};

/** An in-between picture: the one change it makes to its subject, what it is edited from, and who waits for it. */
export type GhostPacket = {
  id: string;
  kind: 'state' | 'view';
  of: string;
  label: string;
  change: string;
  from: string | null;
  after: string | null;
  needs: string[];
  usedBy: string[];
  depth: number;
  key: string | null;
  shows: { what: string; now: string }[];
  prompts: Prompts;
  images: ImagePacket[];
};

/** Someone or something in view, as the cut sheet tells it. */
export type InViewPacket = {
  id: string;
  name: string;
  kind: 'character' | 'location' | 'prop';
  isDreamer: boolean;
  look: string | null;
  image: string | null;
  turned: string | null;
  changes: { what: string; now: string; part?: string }[];
  colours: string[];
};

/** A change in force, as the continuity plan carries it. */
export type ChangePacket = {
  who: string;
  what: string;
  now: string;
  since: string;
  whole?: boolean;
  key?: string;
  implied?: boolean;
  part?: string;
};

/** One picture to draw: everything a harness needs to draw it, check it and redraw it. */
export type NodePacket = {
  identity: {
    dream: string;
    cut: string;
    order: number;
    sequence: string | null;
    scene: string;
    shot: string;
    prev: string | null;
    stage: 'waiting' | 'confirming' | 'drawing' | 'ready' | 'failed';
    review: 'approved' | 'left' | null;
  };
  story: {
    action: string;
    point: string | null;
    feeling: string | null;
    purpose: string | null;
    shift: string | null;
    /** What in it is impossible, drawn as plain fact. */
    dream: string | null;
    key: boolean;
    said: boolean;
    /** The only writing the picture may have. */
    writing: string[];
  };
  who: {
    visible: string[];
    things: string[];
    inView: InViewPacket[];
    /** Left to right, as the scene first placed them; and as the camera sees them. */
    staging: string[];
    across: string[];
    members: { group: string; member: string; word: string }[];
  };
  state: {
    now: NowOf[] | null;
    nowWords: string[] | null;
    own: ChangePacket[];
    states: { who: string; what: string; now: string }[];
    held: Record<string, string>;
    handed: Record<string, string>;
    riders: { id: string; on: string | null; rides: 'front' | 'back' | null }[];
    climbers: { id: string; of: string; how: 'into' | 'out of' }[];
    open: string[];
    water: number | null;
  };
  camera: {
    eyes: 'dreamer' | 'outside';
    size: 'close' | 'medium' | 'wide';
    looksAt: string | null;
    eye: Eye | null;
    floorPlan: Blocking | null;
    /** Its mock-up, by the name its images use: rendered from the floor plan through the camera (previs.ts). */
    previs: PrevisPacket | null;
    view: string | null;
    brief: string | null;
    words: string | null;
    rules: string[];
    tags: CutTags | null;
  };
  dependencies: {
    needs: string[];
    depth: number;
    refs: {
      id: string;
      kind: 'cut' | 'ghost';
      role: RefRole;
      relation: Relation | null;
      carries: string;
      who: string[];
      turned: boolean;
    }[];
    unsent: { id: string; why: UnsentWhy | null }[];
    withheld: { id: string; why: 'judged wrong' | 'stale'; base?: true }[];
    /** Its own shot on its floor plan, for when the picture it edits is not sent after all. */
    alone: { view: string; eye: Eye } | null;
    images: ImagePacket[];
  };
  checks: { criteria: Criterion[]; sheetHash: string | null; flags: string[]; differs: string[] };
  history: { verdicts: VerdictPacket[] };
  prompts: Prompts;
};

export type DreamPacket = {
  version: typeof PACKET_VERSION;
  /**
   * The switches it was rebuilt under and the keys' version, as a picture's record keeps them (asdrawn.ts drawnEnv), and
   * whose readings it read: a harness comparing two packets compares these first.
   */
  dream: {
    id: string;
    title: string;
    style: { id: string; name: string };
    switches: Record<string, string>;
    keys: number;
    writer: string | null;
  };
  elements: ElementPacket[];
  ghosts: GhostPacket[];
  cuts: NodePacket[];
};

const or = <T>(x: T | undefined | null | '', none: null = null): T | null => (x === undefined || x === '' ? none : x);

/** The images a picture is sent, with what the one builder says each is, where it has its paragraph ids. */
function imagesOf(p: Rebuilt['pictures'][number]): ImagePacket[] {
  const made = p.assembled?.references ?? [];
  return p.references.map((x, i) => {
    const a = made[i]?.image === x.media_id ? made[i] : undefined;
    return {
      n: i + 1,
      media: x.media_id,
      role: x.role,
      instruction: x.instruction,
      source: a?.source ?? null,
      of: a?.of ?? null,
      subjects: a?.subjects ?? [],
    };
  });
}

/**
 * A rebuilt dream as packets: its sketches, its in-between pictures and a node per cut, in the order they are drawn.
 * `history` gives the owner's verdicts on earlier drawings of a cut, `previs` a cut's mock-up files and `prompts` a
 * picture's prompts for other models (evals/packets.ts reads and renders them).
 */
export function dreamPacket(
  r: Rebuilt,
  opts: {
    dream: string;
    style: StyleOption;
    history: (cut: string) => VerdictPacket[];
    previs?: (cut: string) => Omit<PrevisPacket, 'media'> | null;
    prompts?: (p: Rebuilt['pictures'][number]) => Omit<Prompts, 'nano-banana-pro'>;
  },
): DreamPacket {
  const prompts = (p: Rebuilt['pictures'][number]): Prompts => ({
    'nano-banana-pro': {
      text: p.prompt,
      ...(p.assembled
        ? { paragraphs: p.assembled.lines.map((l) => ({ id: l.id, text: l.text, fields: l.fields })) }
        : {}),
      images: p.references.map((x) => x.media_id),
    },
    ...(opts.prompts?.(p) ?? {}),
  });
  const byMoment = new Map(moments(r.b).map((m) => [m.id, m]));
  const cuts = r.pictures.filter((p) => p.kind === 'cut');
  const env = drawnEnv();
  // As it is written out: what is checked is what a harness reads, nothing undefined left in it.
  return JSON.parse(JSON.stringify(made()));
  function made(): DreamPacket {
    return {
      version: PACKET_VERSION,
      dream: {
        id: opts.dream,
        title: r.title,
        style: { id: opts.style.id, name: opts.style.name },
        switches: env.switches,
        keys: env.version,
        writer: process.env.DREAMCHAT_WRITER?.trim() || null,
      },
      elements: r.sheets.map((s) => ({
        id: s.id,
        kind: s.kind as ElementPacket['kind'],
        name: s.name,
        isDreamer: !!s.isDreamer,
        look: Object.fromEntries(
          Object.entries(s.fields)
            .filter(([, d]) => !!d?.value)
            .map(([k, d]) => [k, { value: d.value as string, said: !!d.said }]),
        ),
        prompt: sheetPrompt(s, opts.style),
        image: or(s.mediaId),
        group: !!s.several,
        partOf: or(s.partOf),
        extras: !!s.extras,
      })),
      ghosts: r.pictures
        .filter((p) => p.kind === 'ghost')
        .map((p) => {
          const g = p.item.ghost;
          if (!g) throw new Error(`${p.id} is an in-between picture with no plan`);
          return {
            id: p.id,
            kind: g.kind,
            of: g.of,
            label: g.label,
            change: g.change,
            from: g.from,
            after: or(g.after),
            needs: g.needs,
            usedBy: g.usedBy,
            depth: g.depth,
            key: or(g.key),
            shows: (g.shows ?? []).map((x) => ({ what: x.what, now: x.now })),
            prompts: prompts(p),
            images: imagesOf(p),
          };
        }),
      cuts: cuts.map((p, i) => {
        const f = p.item.frame;
        const m = byMoment.get(p.id);
        if (!f || !m) throw new Error(`${p.id} is a cut with no moment`);
        const cp = f.plan;
        const sh = p.sheet;
        const plan = cp?.eye ? (shotPlan(r.b, p.id, r.rec) ?? null) : null;
        const spots: Spot[] = plan?.spots ?? [];
        return {
          identity: {
            dream: opts.dream,
            cut: p.id,
            order: f.order,
            sequence: sh?.tree?.sequence ?? null,
            scene: cp?.scene ?? sh?.scene ?? '',
            shot: cp?.shot ?? sh?.shot ?? '',
            prev: sh ? sh.prev : i > 0 ? cuts[i - 1].id : null,
            stage: p.item.status,
            review: p.item.review ?? null,
          },
          story: {
            action: m.action,
            point: or(m.visual_point),
            feeling: or(m.feeling),
            purpose: or(m.purpose),
            shift: or(m.shift),
            dream: or(m.dream),
            key: !!m.key,
            said: !!m.said,
            writing: sh?.story.writing ?? [],
          },
          who: {
            visible: f.visible,
            things: f.things,
            inView: sh
              ? sh.inView.map((e) => ({
                  id: e.id,
                  name: e.name,
                  kind: e.kind,
                  isDreamer: e.isDreamer,
                  look: e.look,
                  image: e.image,
                  turned: e.turned,
                  changes: e.changes,
                  colours: e.colours,
                }))
              : p.inView.map((s) => ({
                  id: s.id,
                  name: s.name,
                  kind: s.kind as InViewPacket['kind'],
                  isDreamer: !!s.isDreamer,
                  look: null,
                  image: or(s.mediaId),
                  turned: null,
                  changes: [],
                  colours: [],
                })),
            staging: sh?.camera.staging ?? cp?.staging ?? [],
            across: sh?.camera.across ?? cp?.across ?? [],
            members: sh?.members ?? [],
          },
          state: {
            now: sh?.now ?? cp?.facts ?? null,
            nowWords: sh?.nowWords ?? null,
            own: cp?.own ?? [],
            states: sh?.states ?? (cp?.states ?? []).map((x) => ({ who: x.who, what: x.what, now: x.now })),
            held: sh?.record?.held ?? {},
            handed: sh?.record?.handed ?? {},
            riders: plan
              ? spots
                  .filter((s) => s.rides || (s.kind === 'person' && onOf(s, plan)?.t.shape === 'vehicle'))
                  .map((s) => ({ id: s.id, on: onOf(s, plan)?.t.id ?? null, rides: s.rides ?? null }))
              : [],
            climbers: spots.filter((s) => s.climbing).map((s) => ({ id: s.id, ...s.climbing! })),
            open: spots.filter((s) => s.open).map((s) => s.id),
            water: plan?.water ?? null,
          },
          camera: {
            eyes: f.eyes,
            size: f.distance,
            looksAt: or(f.looksAt),
            eye: cp?.eye ?? null,
            floorPlan: plan,
            previs: cp?.eye
              ? { media: standIn.previs(p.id), ...(opts.previs?.(p.id) ?? { clay: null, keyed: null }) }
              : null,
            view: sh?.camera.view ?? or(cp?.view),
            brief: sh?.camera.brief ?? or(p.item.shot?.text),
            words: sh?.camera.words ?? or(cp?.camera),
            rules: sh?.rules?.lines ?? cp?.rules ?? [],
            tags: sh?.tags ?? null,
          },
          dependencies: {
            needs: cp?.needs ?? [],
            depth: cp?.depth ?? 0,
            refs: (cp?.refs ?? []).map((x) => ({
              id: x.id,
              kind: x.kind,
              role: x.role,
              relation: x.relation ?? null,
              carries: x.carries,
              who: x.who ?? [],
              turned: !!x.turned,
            })),
            unsent: (cp?.unsent ?? []).map((x) => ({ id: x.id, why: cp?.unsentWhy?.[x.id] ?? null })),
            withheld: p.withheld ?? [],
            alone: cp?.alone ? { view: cp.alone.view, eye: cp.alone.eye } : null,
            images: imagesOf(p),
          },
          checks: {
            criteria: p.criteria,
            sheetHash: sh?.hash ?? null,
            flags: sh?.flags ?? [],
            differs: p.differs ?? [],
          },
          history: { verdicts: opts.history(p.id) },
          prompts: prompts(p),
        };
      }),
    };
  }
}

// ── the schema ───────────────────────────────────────────────────────────────

/** A JSON Schema (2020-12), as far as `validate` reads one. */
export type Schema = { [k: string]: unknown };

const str: Schema = { type: 'string' };
const num: Schema = { type: 'number' };
const count: Schema = { type: 'integer', minimum: 0 };
const bool: Schema = { type: 'boolean' };
const any: Schema = {};
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const oneOf = (...values: string[]): Schema => ({ enum: values });
const orNull = (s: Schema): Schema =>
  typeof s.type === 'string' ? { ...s, type: [s.type, 'null'] } : { anyOf: [s, { type: 'null' }] };
const list = (items: Schema): Schema => ({ type: 'array', items });
const map = (values: Schema): Schema => ({ type: 'object', additionalProperties: values });
/** An object of exactly these properties, all needed but the `optional` ones. */
const obj = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
  additionalProperties: false,
});

const v2 = obj({ x: num, y: num });
/** How a harness resolves a picture's images: each by its name, from the packet's own entries. */
const MEDIA =
  "An image by name. sketch-<id>: the sketch of elements[<id>], drawn from its prompt. picture-<id>: the cut or in-between picture <id>, once drawn (draw them in the order of their needs). previs-<id>: the cut's mock-up (camera.previs's files). people:<name>+<name>: those sketches side by side on one image, left to right (the local machine's fitting). Anything else is a real media id.";
const named: Schema = { type: 'string', description: MEDIA };
const prompt = obj(
  {
    text: { type: 'string', minLength: 1 },
    paragraphs: list(obj({ id: str, text: str, fields: list(str) })),
    images: list(named),
    dropped: list(str),
  },
  ['paragraphs', 'dropped'],
);
const prompts = {
  ...obj({ 'nano-banana-pro': prompt, 'qwen-image': prompt, 'qwen-image-written': prompt }, [
    'qwen-image',
    'qwen-image-written',
  ]),
  description:
    "A picture's prompt by image model: nano-banana-pro is Dream Chat's own, whole, by paragraph; qwen-image the same fitted to the local machine's limits (4 images, 4000 characters), its default; qwen-image-written written for that machine from the cut's sheet.",
};
const previsFile = obj({ file: str, sha256: str });
const image = obj({
  n: count,
  media: named,
  role: oneOf('identity', 'location', 'prop', 'base', 'composition'),
  instruction: str,
  source: { enum: ['edit', 'mockup', 'sketch', 'ghost', 'earlier', null] },
  of: orNull(str),
  subjects: list(str),
});
const ghostShows = list(obj({ what: str, now: str }));

/** The packet's schema, written out as packet.schema.json (evals/packets.ts) for a harness in any language. */
export const PACKET_SCHEMA: Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/metalfinger/stawberry-studio/dreamchat/packet.schema.json',
  title: 'Dream Chat node packet',
  description:
    'Per dream: its sketches, its in-between pictures and a node per cut, with everything a harness needs to draw, check and redraw each picture (dreamchat/packet.ts).',
  $defs: {
    eye: obj(
      {
        at: v2,
        d: v2,
        height: num,
        pitch: num,
        lean: oneOf('back', 'forward', 'left', 'right'),
        lens: num,
      },
      ['pitch', 'lean', 'lens'],
    ),
    spot: obj(
      {
        id: str,
        x: num,
        y: num,
        faces: str,
        many: bool,
        kind: oneOf('person', 'thing'),
        pose: oneOf('sitting', 'standing', 'lying'),
        size: { type: 'array', items: num, minItems: 3, maxItems: 3 },
        shape: oneOf('block', 'seat', 'vehicle', 'ground', 'steps'),
        heldBy: str,
        count: count,
        spread: { type: 'array', items: num, minItems: 2, maxItems: 2 },
        fixture: bool,
        name: str,
        height: num,
        body: oneOf('human', 'four-legged', 'bird', 'fish', 'other'),
        above: num,
        climbing: obj({ of: str, how: oneOf('into', 'out of') }),
        rides: oneOf('front', 'back'),
        open: bool,
      },
      [
        'faces',
        'many',
        'kind',
        'pose',
        'size',
        'shape',
        'heldBy',
        'count',
        'spread',
        'fixture',
        'name',
        'height',
        'body',
        'above',
        'climbing',
        'rides',
        'open',
      ],
    ),
    floorPlan: {
      type: 'object',
      properties: {
        front: str,
        spots: list(ref('spot')),
        indoors: bool,
        ceiling: num,
        room: { type: 'array', items: num, minItems: 2, maxItems: 2 },
        water: num,
        waterCapped: bool,
        inside: str,
        outside: map(oneOf('front', 'back', 'left', 'right')),
        looks: map(str),
        moves: any,
        places: any,
      },
      required: ['front', 'spots'],
      additionalProperties: false,
    },
    nowOf: obj({
      of: str,
      called: str,
      name: str,
      kind: oneOf('person', 'animal', 'group', 'crowd', 'place', 'thing'),
      facts: list({
        anyOf: [
          obj({ kind: { const: 'part' }, part: str, what: str, now: str, implied: { const: true } }, ['implied']),
          obj({ kind: { const: 'shut' }, why: oneOf('ended', 'later'), part: str }, ['part']),
          obj({ kind: { const: 'held' }, by: str, byCalled: str, from: str, fromCalled: str }, ['from', 'fromCalled']),
        ],
      }),
    }),
    change: obj({ who: str, what: str, now: str, since: str, whole: bool, key: str, implied: bool, part: str }, [
      'whole',
      'key',
      'implied',
      'part',
    ]),
    criterion: obj({ with: orNull(str), text: str, fix: str }),
    image,
    verdict: obj(
      {
        source: oneOf('story', 'checkpoint', 'local'),
        run: str,
        verdict: oneOf('right', 'partly', 'wrong'),
        note: str,
        at: str,
        withoutReadings: { const: true },
      },
      ['run', 'note', 'at', 'withoutReadings'],
    ),
    element: obj({
      id: str,
      kind: oneOf('character', 'location', 'prop'),
      name: str,
      isDreamer: bool,
      look: map(obj({ value: str, said: bool })),
      prompt: { type: 'string', minLength: 1 },
      image: orNull(named),
      group: bool,
      partOf: orNull(str),
      extras: bool,
    }),
    ghost: obj({
      id: str,
      kind: oneOf('state', 'view'),
      of: str,
      label: str,
      change: str,
      from: orNull(str),
      after: orNull(str),
      needs: list(str),
      usedBy: list(str),
      depth: count,
      key: orNull(str),
      shows: ghostShows,
      prompts,
      images: list(ref('image')),
    }),
    node: obj({
      identity: obj({
        dream: str,
        cut: str,
        order: count,
        sequence: orNull(str),
        scene: str,
        shot: str,
        prev: orNull(str),
        stage: oneOf('waiting', 'confirming', 'drawing', 'ready', 'failed'),
        review: { enum: ['approved', 'left', null] },
      }),
      story: obj({
        action: { type: 'string', minLength: 1 },
        point: orNull(str),
        feeling: orNull(str),
        purpose: orNull(str),
        shift: orNull(str),
        dream: orNull(str),
        key: bool,
        said: bool,
        writing: list(str),
      }),
      who: obj({
        visible: list(str),
        things: list(str),
        inView: list(
          obj({
            id: str,
            name: str,
            kind: oneOf('character', 'location', 'prop'),
            isDreamer: bool,
            look: orNull(str),
            image: orNull(str),
            turned: orNull(str),
            changes: list(obj({ what: str, now: str, part: str }, ['part'])),
            colours: list(str),
          }),
        ),
        staging: list(str),
        across: list(str),
        members: list(obj({ group: str, member: str, word: str })),
      }),
      state: obj({
        now: orNull(list(ref('nowOf'))),
        nowWords: orNull(list(str)),
        own: list(ref('change')),
        states: list(obj({ who: str, what: str, now: str })),
        held: map(str),
        handed: map(str),
        riders: list(obj({ id: str, on: orNull(str), rides: { enum: ['front', 'back', null] } })),
        climbers: list(obj({ id: str, of: str, how: oneOf('into', 'out of') })),
        open: list(str),
        water: orNull(num),
      }),
      camera: obj({
        eyes: oneOf('dreamer', 'outside'),
        size: oneOf('close', 'medium', 'wide'),
        looksAt: orNull(str),
        eye: orNull(ref('eye')),
        floorPlan: orNull(ref('floorPlan')),
        previs: orNull(
          obj({
            media: str,
            clay: orNull(previsFile),
            keyed: orNull(
              obj({
                file: str,
                sha256: str,
                key: list(obj({ id: str, name: str, colour: str, kind: str })),
              }),
            ),
          }),
        ),
        view: orNull(str),
        brief: orNull(str),
        words: orNull(str),
        rules: list(str),
        tags: orNull({
          type: 'object',
          properties: {
            role: oneOf('pov', 'ots', 'insert', 'single', 'two_shot', 'group', 'wide', 'close_up'),
            move: oneOf('first', 'same_setup', 'same_side', 'other_side', 'reverse', 'other_place', 'jump', 'seat'),
          },
          required: ['role', 'move'],
        }),
      }),
      dependencies: obj({
        needs: list(str),
        depth: count,
        refs: list(
          obj({
            id: str,
            kind: oneOf('cut', 'ghost'),
            role: oneOf('base', 'composition', 'lighting', 'identity', 'prop', 'location'),
            relation: { enum: ['same_setup', 'same_side', 'other_side', 'other_place', 'shift', 'seat', null] },
            carries: str,
            who: list(str),
            turned: bool,
          }),
        ),
        unsent: list(
          obj({
            id: str,
            why: orNull(
              obj({
                code: oneOf(
                  'reverse',
                  'camera_far',
                  'state_differs',
                  'no_cameras_words_differ',
                  'light_only',
                  'has_sketch',
                  'seat_replaced_by_view',
                  'edit_to_own_camera',
                  'not_recorded',
                ),
                detail: str,
              }),
            ),
          }),
        ),
        withheld: list(obj({ id: str, why: oneOf('judged wrong', 'stale'), base: { const: true } }, ['base'])),
        alone: orNull(obj({ view: str, eye: ref('eye') })),
        images: list(ref('image')),
      }),
      checks: obj({ criteria: list(ref('criterion')), sheetHash: orNull(str), flags: list(str), differs: list(str) }),
      history: obj({ verdicts: list(ref('verdict')) }),
      prompts,
    }),
  },
  type: 'object',
  properties: {
    version: { const: PACKET_VERSION },
    dream: obj({
      id: str,
      title: str,
      style: obj({ id: str, name: str }),
      switches: map(str),
      keys: count,
      writer: orNull(str),
    }),
    elements: list(ref('element')),
    ghosts: list(ref('ghost')),
    cuts: list(ref('node')),
  },
  required: ['version', 'dream', 'elements', 'ghosts', 'cuts'],
  additionalProperties: false,
};

// ── checking a value against a schema ────────────────────────────────────────

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;
const fits = (v: unknown, t: string): boolean =>
  t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : typeOf(v) === t;

/**
 * Where a value breaks a schema, each break as `<where>: <what>` (`$.cuts[0].story: action is missing`); none where it
 * keeps to it. Reads what PACKET_SCHEMA uses: type, enum, const, properties, required, additionalProperties, items,
 * minItems, maxItems, minLength, minimum, anyOf and `$ref` into `$defs`.
 */
export function validate(schema: Schema, value: unknown, root: Schema = schema, at = '$'): string[] {
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref.replace('#/$defs/', '');
    const def = (root.$defs as Record<string, Schema> | undefined)?.[name];
    if (!def) return [`${at}: no definition ${schema.$ref}`];
    return validate(def, value, root, at);
  }
  if (Array.isArray(schema.anyOf)) {
    const shapes = schema.anyOf as Schema[];
    return shapes.some((s) => validate(s, value, root, at).length === 0)
      ? []
      : [`${at}: matches none of ${shapes.length} shapes`];
  }
  if ('const' in schema && value !== schema.const) return [`${at}: not ${JSON.stringify(schema.const)}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never))
    return [`${at}: not one of ${schema.enum.map((x) => JSON.stringify(x)).join(', ')}`];
  if (schema.type !== undefined) {
    const types = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
    if (!types.some((t) => fits(value, t))) return [`${at}: a ${typeOf(value)}, not a ${types.join(' or ')}`];
  }
  const out: string[] = [];
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength)
    out.push(`${at}: shorter than ${schema.minLength}`);
  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum)
    out.push(`${at}: under ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      out.push(`${at}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      out.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((x, i) => out.push(...validate(schema.items as Schema, x, root, `${at}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const o = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const k of (schema.required ?? []) as string[]) if (!(k in o)) out.push(`${at}: ${k} is missing`);
    for (const [k, v] of Object.entries(o)) {
      if (k in props) out.push(...validate(props[k], v, root, `${at}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${at}: ${k} is not allowed`);
      else if (typeof schema.additionalProperties === 'object')
        out.push(...validate(schema.additionalProperties as Schema, v, root, `${at}.${k}`));
    }
  }
  return out;
}
