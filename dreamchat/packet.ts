// The node packet: what Dream Chat hands a harness for every picture it would draw, so the harness can draw it, check
// it and redraw it without reading Dream Chat's code. Per dream: its sketches (each one's prompt and look, said or
// guessed), its in-between pictures (the one change each makes, and what it is edited from), and a node per cut:
// where it sits in the tree, its story, who and what is in it and how each is right then, its camera on its floor plan
// and its mock-up, what it is drawn from and must wait for, its checks, the owner's verdicts on earlier drawings of it,
// and Dream Chat's own prompt for it whole, paragraph by paragraph, so a harness writing its own can be compared on the
// same seed. Written from what a rebuild already has (plan.ts rebuild: the cut sheet, the continuity plan, the floor
// plans, the story record); nothing on the drawing path calls it, so it changes no prompt, no image and no plan.
// Checked against its schema (`PACKET_SCHEMA`, written out as packet.schema.json for a harness in any language).
import { builds } from './cleanups';
import { drawnEnv } from './asdrawn';
import type { Blocking, Eye, Spot } from './blocking';
import { shotPlan } from './continuity';
import type { Criterion, PlanRef, RefRole, Relation, UnsentWhy } from './continuity';
import type { CutTags } from './cutsheet';
import { type Rebuilt, standIn } from './plan';
import { opposed, samePart, stateOfNow, statedParts } from './partstate';
import { facingOf, onOf, type Facing } from './previs';
import { type Breakdown, moments, type StyleOption } from './producer';
import type { NowOf } from './record';
import { type Item, sheetPrompt, subjectWords } from './sheets';

/** The packet's version: a harness reading one checks it. */
export const PACKET_VERSION = 7;

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
 * (4 images, 4000 characters), its default; `qwen-image-written` written for that machine from the cut's sheet. On the
 * owner's verdicts `qwen-image` is the one to take (right 17 times to 13: the written one drew people twice), and
 * `qwen-image-written` is written for the grey mock-up, not the colour-keyed one.
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
  keyed: (PrevisFile & { key: KeyPacket[]; idmap: PrevisFile; ids: IdPacket[] }) | null;
  /**
   * The cut whose camera it is seen through, where that is not its own: an edit keeps the camera of the picture it
   * edits, so its mock-up is that camera's with this cut's people where they are now.
   */
  through: string | null;
  /** The camera's empty set: no person, crowd or held thing in it, a little wider than the frame (previs.ts previsSet). */
  set: SetPacket | null;
  /** What each spot of the floor plan is called on the mock-ups: a thing's colour on the keyed one is from its words. */
  names: Record<string, string>;
};
/** Who a colour on a colour-keyed mock-up is. */
export type KeyPacket = {
  id: string;
  name: string;
  colour: string;
  kind: string;
  /** Too small for the frame's pixels: a dot of its colour where it is, never its size (`tiny_marker`). */
  marker?: boolean;
};
/** One region of an id map: every pixel of that exact colour is it. */
export type IdPacket = {
  id: string;
  name: string;
  kind: string;
  rgb: number[];
  pixels: number;
  fixture: boolean;
  held: boolean;
  ridden: boolean;
  /** Drawn bigger than it is, a mark where it is: never its size (`tiny_marker`). */
  marker?: boolean;
};
/** A camera's empty set, grey and colour-keyed, with its id map and where the cut's own frame is in it (0 to 1). */
export type SetPacket = {
  clay: PrevisFile;
  keyed: PrevisFile & { key: KeyPacket[] };
  idmap: PrevisFile;
  ids: IdPacket[];
  frame: number[];
  framePx: number[];
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
  /**
   * The dreamer never said how they look (their looks and clothes): whatever `look` holds is a guess. Asked in a
   * conversation ("as they are, or however you imagine them"); where nobody can answer, a harness asks or keeps them
   * neutral, never guessing their sex or age (the owner, 1 Oct: the Barley Degree's dreamer drawn a man by default).
   */
  lookUnknown: boolean;
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
  /** How a person is turned to the camera (previs.ts facingOf, the bins its words use); null for anything else. */
  facing: Facing | null;
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
    /** The time it is set in (era.ts): its own where the dream gives it one, else the dream's; null where none is. */
    period: string | null;
    /** What in the picture shows its beat, what it shows now and who does what with it (`visible_device`). */
    device: string | null;
    /**
     * The dream's own day or time lettered on what shows its beat, put on in code after drawing, never by the image
     * model: its lines exactly as they must read, what it is, the thing it is on and where (`visible_device`).
     */
    lettering: {
      id: string;
      text: string[];
      device: 'card' | 'strip' | 'sign' | 'label';
      on: string;
      where: string;
      box?: [number, number, number, number];
    }[];
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
    /**
     * When the dream's world is set (era.ts): `said` where its own words say it (quoted), `given` where it is the date
     * the dream was recorded, never the dreamer's words; null where neither says, and nothing guessed.
     */
    period: { value: string; from: 'said' | 'given'; quote: string | null } | null;
  };
  elements: ElementPacket[];
  ghosts: GhostPacket[];
  cuts: NodePacket[];
  places: PlacePacket[];
};

/**
 * One floor plan (a scene's place) and every camera its cuts are seen through: for drawing the place empty once from
 * each, and from its reverse, before any frame (evals/set-render.ts renders its empty set from any eye).
 */
export type PlacePacket = {
  /** `<scene>/<place>`: one floor plan. */
  id: string;
  scene: string;
  place: string;
  name: string;
  cameras: {
    /** The cut whose own camera it is. */
    through: string;
    eye: Eye;
    eyes: 'dreamer' | 'outside';
    cuts: string[];
    /** Each cut's empty set (its camera.previs.set id map's sha256), in `cuts`' order; null with none. */
    sets: (string | null)[];
  }[];
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
 * The camera a cut's picture is seen through: its own where it has one; for an edit, the camera of the picture it
 * edits (an edit keeps it), back to a picture with a camera of its own. Null with none either way.
 */
export function cameraOf(
  r: Pick<Rebuilt, 'pictures'> & { b?: Breakdown },
  cut: string,
): { id: string; eye: Eye; eyes: 'dreamer' | 'outside' } | null {
  const byId = new Map(r.pictures.filter((x) => x.kind === 'cut').map((x) => [x.id, x]));
  const seen = new Set<string>();
  // Only on its own floor plan: a camera placed on another scene's plan stands somewhere else in this one.
  const plan = r.b ? planKey(r.b, cut) : undefined;
  for (let id: string | undefined = cut; id && !seen.has(id);) {
    seen.add(id);
    if (r.b && planKey(r.b, id) !== plan) return null;
    const f: Item['frame'] = byId.get(id)?.item.frame;
    if (f?.plan?.eye) return { id, eye: f.plan.eye, eyes: f.eyes };
    id = f?.plan?.refs.find((x: PlanRef) => x.kind === 'cut' && x.role === 'base')?.id;
  }
  return null;
}

/**
 * The floor plan a moment is placed on, `<scene>/<place>`: its place's own within its scene where the scene has one,
 * else the scene's (continuity.ts placePlan), named by the scene's place.
 */
export function planKey(b: Pick<Breakdown, 'scenes'>, momentId: string): string | undefined {
  const scene = b.scenes.find((sc) => sc.moments.some((x) => x.id === momentId));
  const m = scene?.moments.find((x) => x.id === momentId);
  if (!scene || !m) return undefined;
  return `${scene.id}/${scene.blocking?.places?.[m.place] ? m.place : scene.place}`;
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
  const dreamer = r.b.people.find((x) => x.is_dreamer)?.id;
  // Each cut's mock-up files, asked for once: where it has a camera, its own or a picture's it edits.
  const pvs = new Map<string, Omit<PrevisPacket, 'media'> | null | undefined>();
  const pvOf = (cut: string) => {
    if (!pvs.has(cut)) pvs.set(cut, cameraOf(r, cut) ? opts.previs?.(cut) : undefined);
    return pvs.get(cut);
  };
  const env = drawnEnv();
  // As it is written out: what is checked is what a harness reads, nothing undefined left in it.
  return JSON.parse(JSON.stringify(made()));
  function made(): DreamPacket {
    // Each floor plan's cameras, in the order its cuts are drawn: an eye once, with the cuts seen through it and each
    // one's empty set, which can differ under one camera (a device on the wall from one moment, a drawer left open).
    const places: PlacePacket[] = [];
    for (const p of cuts) {
      const through = cameraOf(r, p.id);
      const id = planKey(r.b, p.id);
      if (!through || !id) continue;
      let place = places.find((x) => x.id === id);
      if (!place) {
        const [scene, at] = id.split('/');
        const name = r.sheets.find((x) => x.id === at)?.name ?? r.b.places.find((x) => x.id === at)?.name ?? at;
        place = { id, scene, place: at, name, cameras: [] };
        places.push(place);
      }
      const key = JSON.stringify([through.eye, through.eyes]);
      const set = pvOf(p.id)?.set?.idmap.sha256 ?? null;
      const same = place.cameras.find((c) => JSON.stringify([c.eye, c.eyes]) === key);
      if (same) {
        same.cuts.push(p.id);
        same.sets.push(set);
      } else
        place.cameras.push({ through: through.id, eye: through.eye, eyes: through.eyes, cuts: [p.id], sets: [set] });
    }
    return {
      version: PACKET_VERSION,
      dream: {
        id: opts.dream,
        title: r.title,
        style: { id: opts.style.id, name: opts.style.name },
        switches: env.switches,
        keys: env.version,
        writer: process.env.DREAMCHAT_WRITER?.trim() || null,
        period: r.b.period ? { value: r.b.period.value, from: r.b.period.from, quote: r.b.period.quote ?? null } : null,
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
        prompt: sheetPrompt(s, opts.style, { others: subjectWords(r.sheets, s), period: r.b.period?.value }),
        image: or(s.mediaId),
        group: !!s.several,
        partOf: or(s.partOf),
        extras: !!s.extras,
        lookUnknown: !!s.isDreamer && !['appearance', 'wardrobe'].some((k) => s.fields[k]?.said),
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
        // The camera its picture is seen through: its own, or for an edit the one of the picture it edits.
        const through = cameraOf(r, p.id);
        const seenPlan = through ? (plan ?? shotPlan(r.b, p.id, r.rec) ?? null) : null;
        const facingIn = (id: string): Facing | null => {
          const s = seenPlan?.spots.find((x) => x.id === id);
          const figure = !!s && !s.many && (s.kind === 'person' || (!s.kind && !!s.pose));
          if (!through || !seenPlan || !figure || (through.eyes === 'dreamer' && id === dreamer)) return null;
          return facingOf(s, seenPlan, through.eye);
        };
        const pv = pvOf(p.id);
        return {
          identity: {
            dream: opts.dream,
            cut: p.id,
            order: f.order,
            sequence: sh?.tree?.sequence ?? null,
            scene: cp?.scene ?? sh?.scene ?? '',
            shot: cp?.shot ?? sh?.shot ?? '',
            prev: sh ? sh.prev : i > 0 ? cuts[i - 1].id : null,
            // Never ready without a camera where it has a floor plan, unless it edits a picture (whose camera it keeps):
            // Neighbours' crowd moments went out "ready" with no eye, view or mock-up (crowd_camera, 1 Oct).
            stage:
              builds('crowd_camera') &&
              !cp?.eye &&
              !cp?.refs?.some((r) => r.role === 'base') &&
              !!shotPlan(r.b, p.id, r.rec)
                ? 'failed'
                : p.item.status,
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
            period: m.period ?? r.b.period?.value ?? null,
            device: sh?.device ?? null,
            lettering: sh?.lettering ?? [],
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
                  facing: facingIn(e.id),
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
                  facing: facingIn(s.id),
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
            // An edit has no camera of its own, and its mock-up is the one of the picture it edits.
            previs: cp?.eye
              ? {
                  media: standIn.previs(p.id),
                  ...(pv ?? { clay: null, keyed: null, through: null, set: null, names: {} }),
                }
              : pv
                ? { media: standIn.previs(p.id), ...pv }
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
      places,
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
    "A picture's prompt by image model: nano-banana-pro is Dream Chat's own, whole, by paragraph; qwen-image the same fitted to the local machine's limits (4 images, 4000 characters), its default; qwen-image-written written for that machine from the cut's sheet. On the owner's verdicts (four dreams, 1 Oct) qwen-image was right 17 times to qwen-image-written's 13, which drew people twice: take qwen-image. qwen-image-written is written for the grey mock-up (camera.previs.clay); sent with the colour-keyed one, it is to be written again with that mock-up's key.",
};
const previsFile = obj({ file: str, sha256: str });
const keyEntry = obj({ id: str, name: str, colour: str, kind: str, marker: bool }, ['marker']);
const PLACES =
  "Each floor plan (`<scene>/<place>`: a scene's own, or a place's within it) and every camera its cuts are seen through: each eye once, `through` the cut whose own camera it is, with the cuts seen through it (an edit's through the picture it edits, only on the same plan) and each one's empty set (`sets`, its camera.previs.set id map's sha256, null with none). One camera's cuts can have different sets: a device on the wall in one moment, a drawer left open, a thing put away; draw each distinct set. For drawing a place empty from each direction its cuts use, and their reverses, before any frame: evals/set-render.ts renders a cut's empty set from any eye out of the packet alone, on its camera.floorPlan with its camera.previs.names, in previs.ts's own convention (metres on the plan, x from the left wall, y from the front, `d` the way the camera looks on the plan, `height` of the lens, `pitch` in radians, down negative, `lens` in millimetres on a 36 mm frame; unset, a 76-degree view across a 16:9 frame, about 23 mm).";
const THROUGH =
  "The cut whose camera the mock-up is seen through where it is not this cut's own: an edit keeps the camera of the picture it edits, so its mock-up is that camera's with this cut's people where they are now. Null for a cut's own camera.";
const SET =
  "The camera's empty set: the place as this camera frames it with every person, crowd and held thing left out (a sitting crowd's seats kept, where the frame has them), rendered 8% wider and taller than the frame (4% each side) at the frame's own scale, grey (clay), colour-keyed (keyed) and as an id map. `framePx` is where the cut's own frame is in it in the set's whole pixels, [x0, y0, x1, y1] with x1 and y1 just past it and y down from the top; `frame` is the same from 0 to 1 to four places (crop by framePx). Cropped to it, the set's id map is the frame's wherever no one stands, nothing is held and nothing is a dot (ids' `marker`). Draw the place once per camera from it, then put the people onto it; a thing someone rides (ids' `ridden`) moves with them.";
/**
 * One region of an id map: every pixel of exactly `rgb` is it, black is nothing; `kind` person, crowd, thing, room (a
 * wall, the floor, the ground), seats (under a crowd or someone sitting) or water.
 */
const idEntry = {
  ...obj(
    {
      id: str,
      name: str,
      kind: oneOf('person', 'crowd', 'thing', 'room', 'seats', 'water'),
      rgb: { type: 'array', items: count, minItems: 3, maxItems: 3 },
      pixels: count,
      fixture: bool,
      held: bool,
      ridden: bool,
      marker: bool,
    },
    ['marker'],
  ),
  description:
    "One region of an id map (a PNG beside the packet): every pixel of exactly `rgb` is the spot, surface or crowd `id`, black is nothing; `pixels` is how many. A spot is the same colour in every frame and set of a dream. `fixture`: part of the place; `held`: in someone's hands; `ridden`: someone rides on or in it; `marker`: a thing the moment has in view too small for the frame's pixels, drawn as a dot where it is, never its size (its key entry says so too). A creature counts as a person. The colour-keyed mock-up's own colours can give two brown things one brown; the id map never does.",
};
const setSchema = obj({
  clay: previsFile,
  keyed: obj({ file: str, sha256: str, key: list(keyEntry) }),
  idmap: previsFile,
  ids: list(idEntry),
  frame: { type: 'array', items: num, minItems: 4, maxItems: 4 },
  framePx: { type: 'array', items: count, minItems: 4, maxItems: 4 },
});
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
        lean: oneOf('back', 'forward', 'left', 'right', 'close'),
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
        // Turned to whom or what they attend to (continuity withAttention, plan_facing).
        attending: bool,
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
        // Drawn at a size the dream's words give it in this moment (sizes.ts, `sizes`).
        sized: oneOf('body', 'moment'),
        // Sized by a change of it the story has made by now (`thing_state`).
        stated: bool,
        // A crowd between the camera and whom the moment sees past it (`crowd_between`).
        past: str,
        above: num,
        climbing: obj({ of: str, how: oneOf('into', 'out of') }),
        rides: oneOf('front', 'back'),
        open: bool,
      },
      [
        'faces',
        'attending',
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
        'sized',
        'stated',
        'past',
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
      lookUnknown: {
        type: 'boolean',
        description:
          'The dreamer never said how they look: their look here is a guess. Ask them, or keep them neutral; never guess their sex or age.',
      },
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
        period: orNull(str),
        device: orNull(str),
        lettering: list(
          obj(
            {
              id: str,
              text: list(str),
              device: oneOf('card', 'strip', 'sign', 'label'),
              on: str,
              where: str,
              box: { type: 'array', items: num, minItems: 4, maxItems: 4 },
            },
            ['box'],
          ),
        ),
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
            facing: {
              ...orNull(
                obj({
                  view: oneOf('front', 'three-quarter front', 'profile', 'three-quarter back', 'back'),
                  side: { enum: ['left', 'right', null] },
                  degrees: num,
                }),
              ),
              description:
                "How a person is turned to the camera the picture is seen through (camera.previs.through's for an edit), in the bins the camera's words use: `side` is which way across the picture they look, null facing the camera or with their back to it; `degrees` is between the way they face and the way to the camera, 0 facing it. Null for a thing, a crowd, and the dreamer through their own eyes; a creature counts as a person. (`turned` is what someone has turned into, not this.)",
            },
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
                key: list(keyEntry),
                idmap: previsFile,
                ids: list(idEntry),
              }),
            ),
            through: { ...orNull(str), description: THROUGH },
            set: { ...orNull(setSchema), description: SET },
            names: {
              ...map(str),
              description:
                "What each spot of the floor plan is called on the mock-ups: a thing's colour on the keyed one comes from its words, so a set rendered again (evals/set-render.ts) takes them.",
            },
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
      period: orNull(obj({ value: str, from: oneOf('said', 'given'), quote: orNull(str) })),
    }),
    elements: list(ref('element')),
    ghosts: list(ref('ghost')),
    cuts: list(ref('node')),
    places: {
      ...list(
        obj({
          id: str,
          scene: str,
          place: str,
          name: str,
          cameras: list(
            obj({
              through: str,
              eye: ref('eye'),
              eyes: oneOf('dreamer', 'outside'),
              cuts: list(str),
              sets: list(orNull(str)),
            }),
          ),
        }),
      ),
      description: PLACES,
    },
  },
  required: ['version', 'dream', 'elements', 'ghosts', 'cuts', 'places'],
  additionalProperties: false,
};

// ── checking a value against a schema ────────────────────────────────────────

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;
const fits = (v: unknown, t: string): boolean =>
  t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : typeOf(v) === t;

/**
 * Where a cut's packet says something against its own point: a part its point or action names in one state while its
 * state, one of its checks or a sentence of its prompt has it in the other ("the cutlery drawer closed beside her",
 * against "cutlery drawer: open", "is her kitchen's cutlery drawer open?" and "the cutlery drawer is open"). Empty where
 * nothing does.
 */
export function lintPacket(pk: Pick<DreamPacket, 'cuts'>): string[] {
  const out: string[] = [];
  for (const c of pk.cuts) {
    const cut = c.identity.cut;
    // The action first, then the point, as the story record reads them: what the point says last stands.
    for (const s of statedParts(`${c.story.action}. ${c.story.point ?? ''}`)) {
      for (const n of c.state.now ?? [])
        for (const f of n.facts) {
          // A thing shut until a later moment opens it, or shut again, is closed.
          const [name, now] =
            f.kind === 'part' ? [`${f.part} ${f.what}`, f.now] : f.kind === 'shut' ? [f.part ?? n.name, 'closed'] : [];
          if (!name || !now) continue;
          const which = f.kind === 'part' ? [f.part, f.what] : [name];
          if (which.some((x) => samePart(s.part, x)) && opposed(s.state, stateOfNow(now)))
            out.push(
              `${cut}: its point has the ${s.part} ${s.state}; its state has ${n.called}'s ${f.kind === 'part' ? f.what : name} ${now}`,
            );
        }
      for (const k of c.checks.criteria)
        for (const x of statedParts(k.text))
          if (samePart(x.part, s.part) && opposed(s.state, x.state))
            out.push(`${cut}: its point has the ${s.part} ${s.state}; a check asks "${k.text}"`);
      for (const sentence of c.prompts['nano-banana-pro'].text.split(/(?<=[.!?])\s+/))
        for (const x of statedParts(sentence))
          if (samePart(x.part, s.part) && opposed(s.state, x.state))
            out.push(`${cut}: its point has the ${s.part} ${s.state}; its prompt says "${sentence.trim()}"`);
    }
  }
  return out;
}

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
