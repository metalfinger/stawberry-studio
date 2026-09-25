// Previs: a shot drawn as plain grey blocks from its exact camera, before it is painted.
//
// A storyboard artist blocks a scene on a floor plan, and a previs artist renders what each camera
// sees of it; the crew then shoots to match that frame. Told in words where everything was from the
// dreamer's seat, the image model drew the room from somewhere else, and put the roller coaster
// across the room instead of beside the friend (24 Sep): it follows a picture of a layout far
// better than a description of one. So the layout is rendered here, from the floor plan that
// decides every camera, and what the words say the camera sees is read off the same render: the
// picture and the words cannot disagree.
import { deflateSync } from 'node:zlib';
import {
  type Blocking,
  type Eye,
  DIRECTIONS,
  facing,
  halfViewOf,
  type Lean,
  onFootprint,
  reach,
  rightOf,
  roomOf,
  type Shape,
  sizeOf,
  type Spot,
  unit,
  wall,
} from './blocking';

type V2 = { x: number; y: number };
type V3 = { x: number; y: number; z: number };

/** A solid block: its middle on the plan, its bottom and size, turned to face `f`. */
type Block = { x: number; y: number; z: number; w: number; d: number; h: number; f: V2 };

/** A flat face of something, and the way it faces out. */
type Face = { p: V3[]; n: V3; solid: number };

/** Something in the previs: a person, a thing, a crowd, a wall; and what it is called, if anything. */
type Solid = { id: string; label?: string; tone: number; faces: Face[] };

/** How high someone's eyes are, by how they are. */
export const eyeHeight = (pose?: Spot['pose']) => (pose === 'sitting' ? 1.2 : pose === 'lying' ? 0.35 : 1.62);

/** The room's height where the plan does not say: an ordinary ceiling. */
const CEILING = 3.2;
/** A seated or standing eye looks a little down, as people do at what is before them. */
const PITCH = (-4 * Math.PI) / 180;

/**
 * A person as a previs artist's mannequin, facing `f`: a round head on a neck, shoulders, arms,
 * and legs as they sit or stand. Two stacked blocks read as boxes, not as someone (24 Sep).
 */
function mannequin(x: number, y: number, f: V2, pose: Spot['pose'], z0 = 0): (Block | Face[])[] {
  const r = rightOf(f);
  const at = (ahead: number, side: number, z: number, w: number, d: number, h: number): Block => ({
    x: x + f.x * ahead + r.x * side,
    y: y + f.y * ahead + r.y * side,
    z: z + z0,
    w,
    d,
    h,
    f,
  });
  const head = (ahead: number, z: number) => sphere(v3(x + f.x * ahead, y + f.y * ahead, z + z0), 0.1, 0.12);
  if (pose === 'lying') return [at(0, 0, 0, 0.45, 1.5, 0.25), head(0.85, 0.15)];
  if (pose === 'sitting')
    return [
      at(-0.1, 0, 0.45, 0.34, 0.22, 0.32), // the waist, on the seat
      at(-0.1, 0, 0.77, 0.42, 0.24, 0.3), // the chest and shoulders
      at(-0.1, 0, 1.07, 0.1, 0.1, 0.05), // the neck
      at(-0.1, 0.25, 0.74, 0.09, 0.1, 0.32), // the upper arms, down the sides
      at(-0.1, -0.25, 0.74, 0.09, 0.1, 0.32),
      at(0.08, 0.2, 0.62, 0.08, 0.34, 0.08), // the forearms, forward along the thighs
      at(0.08, -0.2, 0.62, 0.08, 0.34, 0.08),
      at(0.15, 0.1, 0.45, 0.15, 0.45, 0.15), // the thighs
      at(0.15, -0.1, 0.45, 0.15, 0.45, 0.15),
      at(0.4, 0.1, 0, 0.12, 0.12, 0.47), // the shins, down to the floor
      at(0.4, -0.1, 0, 0.12, 0.12, 0.47),
      head(-0.1, 1.23),
    ];
  return [
    at(0, 0.1, 0, 0.13, 0.15, 0.86), // the legs
    at(0, -0.1, 0, 0.13, 0.15, 0.86),
    at(0, 0, 0.86, 0.36, 0.22, 0.3), // the waist
    at(0, 0, 1.16, 0.42, 0.24, 0.3), // the chest and shoulders
    at(0, 0, 1.46, 0.1, 0.1, 0.05), // the neck
    at(0, 0.25, 0.86, 0.09, 0.1, 0.58), // the arms, down the sides
    at(0, -0.25, 0.86, 0.09, 0.1, 0.58),
    head(0, 1.62),
  ];
}

/** A round solid: a head. Faces of a ball, each facing out from its middle. */
function sphere(c: V3, radius: number, tall: number): Face[] {
  const faces: Face[] = [];
  const [rings, around] = [6, 10];
  const p = (i: number, j: number): V3 => {
    const a = (Math.PI * i) / rings - Math.PI / 2;
    const b = (2 * Math.PI * j) / around;
    return v3(
      c.x + radius * Math.cos(a) * Math.cos(b),
      c.y + radius * Math.cos(a) * Math.sin(b),
      c.z + tall * Math.sin(a),
    );
  };
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const q = [p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j)];
      const m = q.reduce((s, v) => v3(s.x + v.x / 4, s.y + v.y / 4, s.z + v.z / 4), v3(0, 0, 0));
      const n = Math.hypot(m.x - c.x, m.y - c.y, m.z - c.z) || 1;
      faces.push({ p: q, n: v3((m.x - c.x) / n, (m.y - c.y) / n, (m.z - c.z) / n), solid: 0 });
    }
  return faces;
}

/** A block's six faces, each facing out. */
function blockFaces(b: Block, solid: number): Face[] {
  const r = rightOf(b.f);
  const at = (sr: number, sf: number, z: number): V3 => ({
    x: b.x + r.x * (b.w / 2) * sr + b.f.x * (b.d / 2) * sf,
    y: b.y + r.y * (b.w / 2) * sr + b.f.y * (b.d / 2) * sf,
    z,
  });
  const [lo, hi] = [b.z, b.z + b.h];
  const face = (p: V3[], n: V3): Face => ({ p, n, solid });
  return [
    face([at(-1, -1, hi), at(1, -1, hi), at(1, 1, hi), at(-1, 1, hi)], { x: 0, y: 0, z: 1 }),
    face([at(-1, -1, lo), at(-1, 1, lo), at(1, 1, lo), at(1, -1, lo)], { x: 0, y: 0, z: -1 }),
    face([at(-1, 1, lo), at(-1, 1, hi), at(1, 1, hi), at(1, 1, lo)], { x: b.f.x, y: b.f.y, z: 0 }),
    face([at(-1, -1, lo), at(1, -1, lo), at(1, -1, hi), at(-1, -1, hi)], { x: -b.f.x, y: -b.f.y, z: 0 }),
    face([at(1, -1, lo), at(1, 1, lo), at(1, 1, hi), at(1, -1, hi)], { x: r.x, y: r.y, z: 0 }),
    face([at(-1, -1, lo), at(-1, -1, hi), at(-1, 1, hi), at(-1, 1, lo)], { x: -r.x, y: -r.y, z: 0 }),
  ];
}

/** A small number from a string and an index, the same every time: where each of a crowd sits. */
function jitter(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

/**
 * Where each of a crowd is: in rows across the way they face, spread over the ground they fill; or,
 * where the dream says how many, that many side by side, nearest their middle first. Never where
 * someone else is or inside something solid, and never nobody: "a couple of people" on the sofa
 * beside the dreamer were all left out as too close to someone (25 Sep).
 */
function crowdSpots(s: Spot, plan: Blocking, avoid: Spot[]): V2[] {
  const f = facing(s, plan);
  const r = rightOf(f);
  const taken = (p: V2) =>
    avoid.some((o) =>
      isPerson(o)
        ? Math.hypot(o.x - p.x, o.y - p.y) < 0.6
        : shapeOf(o, plan) === 'block' && sizeOf(o)[2] > 0.5 && onFootprint(p, o, plan, 0.2),
    );
  if (s.count && s.count <= 12) {
    // Side by side, as people sit together: 0, then 0.7 either side, then 1.4; sitting, on the seat
    // under them first. Two people "sitting with the dreamer" were put one on the sofa, one off it.
    const seats = s.pose === 'sitting' ? avoid.filter((o) => !isPerson(o) && shapeOf(o, plan) === 'seat') : [];
    const onSeat = (p: V2) => seats.some((o) => onFootprint(p, o, plan));
    const ways = Array.from({ length: 60 }, (_, k) => (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35)
      .map((a) => ({ x: s.x + r.x * a, y: s.y + r.y * a }))
      .filter((p) => !taken(p))
      .sort((p, q) => Number(onSeat(q)) - Number(onSeat(p)));
    const out: V2[] = [];
    for (const p of ways)
      if (out.length < s.count && out.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= 0.65)) out.push(p);
    return out;
  }
  const [across, deep] = s.spread ?? [4, 3];
  const all: V2[] = [];
  const cols = Math.max(1, Math.floor(across / 0.8));
  const rows = Math.max(1, Math.floor(deep / 1.1));
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const a = -across / 2 + (col + 0.5) * (across / cols) + jitter(s.id, i) * 0.2;
      // Rows run back from the front of the crowd: the way they face is toward the first row.
      const b = deep / 2 - (row + 0.5) * (deep / rows) + jitter(s.id, i + 7919) * 0.15;
      all.push({ x: s.x + r.x * a + f.x * b, y: s.y + r.y * a + f.y * b });
    }
  const out = all.filter((p) => !taken(p));
  return out.length ? out : all;
}

/**
 * Everything the camera could see, as solids: the room (walls, floor, ceiling, its front named),
 * then everyone and everything on the plan but `leaveOut` (the dreamer, whose eyes it is).
 */
function solidsOf(plan: Blocking, leaveOut: string[], called: (id: string) => string): Solid[] {
  const solids: Solid[] = [];
  // A fixture of the place is labelled with its own name; everyone and everything else as the story calls them.
  const name = (id: string) => plan.spots.find((s) => s.id === id)?.name ?? called(id);
  const add = (id: string, tone: number, parts: (Block | Face[])[], label?: string) => {
    const solid = solids.length;
    const faces = parts.flatMap((b) => (Array.isArray(b) ? b.map((f) => ({ ...f, solid })) : blockFaces(b, solid)));
    solids.push({ id, tone, faces, label });
  };
  const quad = (p: V3[], n: V3): Face[] => [{ p, n, solid: 0 }];
  // People are the lightest, things darker, the place darker still: each reads as what it is at a
  // glance, as clay figures on a darker set do.
  if (plan.indoors) {
    const h = plan.ceiling ?? CEILING;
    // The room is as big as the plan says: a tiny room is tiny, and its stove almost fills it.
    const [w, dp] = roomOf(plan);
    add('floor', 0.3, [quad([v3(0, 0, 0), v3(w, 0, 0), v3(w, dp, 0), v3(0, dp, 0)], v3(0, 0, 1))]);
    add('ceiling', 0.22, [quad([v3(0, 0, h), v3(0, dp, h), v3(w, dp, h), v3(w, 0, h)], v3(0, 0, -1))]);
    add('left wall', 0.46, [quad([v3(0, 0, 0), v3(0, dp, 0), v3(0, dp, h), v3(0, 0, h)], v3(1, 0, 0))]);
    add('right wall', 0.44, [quad([v3(w, 0, 0), v3(w, 0, h), v3(w, dp, h), v3(w, dp, 0)], v3(-1, 0, 0))]);
    add('back wall', 0.4, [quad([v3(0, dp, 0), v3(w, dp, 0), v3(w, dp, h), v3(0, dp, h)], v3(0, -1, 0))]);
    add('front', 0.62, [quad([v3(0, 0, 0), v3(0, 0, h), v3(w, 0, h), v3(w, 0, 0)], v3(0, 1, 0))], plan.front);
  } else {
    // Outdoors the ground runs on well past the plan, however far the place goes.
    const [w, dp] = roomOf(plan);
    add('ground', 0.34, [
      quad([v3(-80, -80, 0), v3(w + 80, -80, 0), v3(w + 80, dp + 80, 0), v3(-80, dp + 80, 0)], v3(0, 0, 1)),
    ]);
  }
  // Where a crowd may not be: where anyone else is, the dreamer whose eyes the camera is included.
  const placed = plan.spots.filter((s) => !s.many);
  for (const s of plan.spots) {
    if (leaveOut.includes(s.id)) continue;
    const f = facing(s, plan);
    if (s.many) {
      const where = crowdSpots(s, plan, placed);
      add(
        s.id,
        0.8,
        where.flatMap((p) => mannequin(p.x, p.y, f, s.pose ?? 'standing', groundAt(p, plan))),
        name(s.id),
      );
      // A crowd sitting sits on something: rows of seats under them, or the model makes up its own
      // seating around the people (a raised block of armchairs off to one side, 24 Sep). Not where
      // they sit on a sofa or in a car of the plan's own.
      const seatless = where.filter(
        (p) =>
          !plan.spots.some(
            (t) => !isPerson(t) && ['seat', 'vehicle'].includes(shapeOf(t, plan)) && onFootprint(p, t, plan),
          ),
      );
      if (s.pose === 'sitting' && seatless.length)
        add(
          `${s.id} seats`,
          0.55,
          seatless.flatMap((p) => [
            { x: p.x, y: p.y, z: 0, w: 0.62, d: 0.6, h: 0.42, f },
            { x: p.x - f.x * 0.27, y: p.y - f.y * 0.27, z: 0.42, w: 0.62, d: 0.12, h: 0.5, f },
          ]),
        );
    } else if (isPerson(s))
      add(s.id, 0.97, mannequin(s.x, s.y, f, s.pose ?? 'standing', groundAt(s, plan)), name(s.id));
    else add(s.id, shapeOf(s, plan) === 'ground' ? 0.5 : 0.62, thingBlocks(s, plan), name(s.id));
  }
  return solids;
}

/** Someone or a crowd, rather than a thing. */
const isPerson = (s: Spot) => s.kind === 'person' || (!s.kind && (!!s.pose || !!s.many));

/**
 * What a thing is to whoever is at it: as the plan says, or, where it says nothing, a seat when
 * someone sits on it and otherwise a solid block.
 */
export function shapeOf(t: Spot, plan: Blocking): Shape {
  if (t.shape) return t.shape;
  return plan.spots.some((p) => isPerson(p) && !p.many && p.pose === 'sitting' && onFootprint(p, t, plan))
    ? 'seat'
    : 'block';
}

/** How many steps a flight of stairs this high has: a step about 18 centimetres. */
const stepsOf = (h: number) => Math.max(3, Math.round(h / 0.18));

/**
 * How high the ground is under a point: the deck of a bridge or a stage, the step of the stairs it
 * is on (stairs rise from the side they face to their back); nothing where it is the floor.
 */
function groundAt(p: V2, plan: Blocking): number {
  let z = 0;
  for (const t of plan.spots) {
    if (isPerson(t) || t.heldBy) continue;
    const shape = shapeOf(t, plan);
    if ((shape !== 'ground' && shape !== 'steps') || !onFootprint(p, t, plan, 0)) continue;
    const [, d, h] = sizeOf(t);
    if (shape === 'ground') z = Math.max(z, h);
    else {
      const f = facing(t, plan);
      const along = d / 2 - ((p.x - t.x) * f.x + (p.y - t.y) * f.y);
      const n = stepsOf(h);
      z = Math.max(z, (Math.min(n, Math.floor((along / d) * n) + 1) * h) / n);
    }
  }
  return z;
}

/**
 * A thing as blocks, by what it is: a seat and its back, so who sits on it sits on it, not in it
 * (one block the height of a sofa's back buried the friend to her waist, 24 Sep); a vehicle's body
 * as high as its doors, whoever rides in it showing from the shoulders up; stairs as steps; ground
 * as a slab as high as it rises; what someone holds, before them at the height of their hands.
 */
function thingBlocks(s: Spot, plan: Blocking): Block[] {
  const [w, d, h] = sizeOf(s);
  const f = facing(s, plan);
  const holder = s.heldBy ? plan.spots.find((o) => o.id === s.heldBy) : undefined;
  if (holder) {
    // In one hand, at their side: held square before them, a string of balloons hid the dreamer's
    // face and chest (25 Sep).
    const hf = facing(holder, plan);
    const hr = rightOf(hf);
    const hands = groundAt(holder, plan) + (holder.pose === 'sitting' ? 0.6 : holder.pose === 'lying' ? 0.3 : 0.9);
    const side = 0.3 + Math.min(w, 0.8) / 2;
    return [
      {
        x: holder.x + hf.x * 0.15 + hr.x * side,
        y: holder.y + hf.y * 0.15 + hr.y * side,
        z: hands,
        w: Math.min(w, 0.8),
        d: Math.min(d, 0.8),
        h: Math.min(h, 1.5),
        f: hf,
      },
    ];
  }
  const shape = shapeOf(s, plan);
  if (shape === 'seat' && h > 0.5) {
    const back = Math.min(0.25, d / 3);
    return [
      { x: s.x, y: s.y, z: 0, w, d, h: 0.45, f },
      { x: s.x - f.x * (d / 2 - back / 2), y: s.y - f.y * (d / 2 - back / 2), z: 0.45, w, d: back, h: h - 0.45, f },
    ];
  }
  if (shape === 'vehicle') return [{ x: s.x, y: s.y, z: 0, w, d, h: Math.min(h, 1.6) * 0.6, f }];
  if (shape === 'steps') {
    const n = stepsOf(h);
    return Array.from({ length: n }, (_, i) => {
      const mid = d / 2 - ((i + 0.5) * d) / n;
      return { x: s.x + f.x * mid, y: s.y + f.y * mid, z: 0, w, d: d / n, h: ((i + 1) * h) / n, f };
    });
  }
  return [{ x: s.x, y: s.y, z: 0, w, d, h, f }];
}

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** A polygon in camera space, cut where it passes behind the camera. */
function clipNear(poly: V3[], near: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.z >= near) out.push(a);
    if (a.z >= near !== b.z >= near) {
      const t = (near - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near });
    }
  }
  return out;
}

/** What one solid came to in the render: how much shows, where, and what hides the rest of it. */
export type Seen = {
  id: string;
  label?: string;
  /** Pixels of it that show, and pixels of it drawn at all (in the frame, hidden or not). */
  visible: number;
  drawn: number;
  /** The share of the frame it covers, and where it is: across (0 left, 1 right) and down (0 top). */
  share: number;
  cx: number;
  cy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** What hides the most of it, where something does. */
  hiddenBy?: string;
  /** How much of it other things hide, 0 to 1: what hides part of it from itself does not count. */
  occluded: number;
};

export type Render = {
  width: number;
  height: number;
  lum: Float32Array;
  solid: Int32Array;
  solids: Solid[];
  seen: Map<string, Seen>;
  /** Where a point on the plan, at a height, lands in the picture; null behind the camera. */
  project: (p: V3) => { x: number; y: number } | null;
};

const BACKGROUND = 0.9;
const NEAR = 0.05;

/** The solids as the eye sees them: flat grey, lit from behind the camera, outlined. */
function render(solids: Solid[], eye: Eye, width: number, height: number): Render {
  const d = unit(eye.d);
  const pitch = eye.pitch ?? 0;
  const F = v3(d.x * Math.cos(pitch), d.y * Math.cos(pitch), Math.sin(pitch));
  const U = v3(-d.x * Math.sin(pitch), -d.y * Math.sin(pitch), Math.cos(pitch));
  const R = v3(-d.y, d.x, 0);
  const C = v3(eye.at.x, eye.at.y, eye.height);
  const focal = width / 2 / Math.tan((halfViewOf(eye) * Math.PI) / 180);
  // Lit from behind the camera, high and to its left, the way a previs is: faces toward it are light.
  const L = (() => {
    const l = v3(
      -F.x * 0.55 + U.x * 0.75 - R.x * 0.35,
      -F.y * 0.55 + U.y * 0.75 - R.y * 0.35,
      -F.z * 0.55 + U.z * 0.75,
    );
    const n = Math.hypot(l.x, l.y, l.z);
    return v3(l.x / n, l.y / n, l.z / n);
  })();
  const n = width * height;
  const depth = new Float32Array(n);
  const lum = new Float32Array(n).fill(BACKGROUND);
  const solidAt = new Int32Array(n).fill(-1);
  const faceAt = new Int32Array(n).fill(-1);
  const drawn = new Array<number>(solids.length).fill(0);
  const hidden = solids.map(() => new Map<number, number>());
  const hide = (who: number, by: number) => hidden[who].set(by, (hidden[who].get(by) ?? 0) + 1);

  let faceNo = 0;
  for (const solid of solids)
    for (const face of solid.faces) {
      const k = faceNo++;
      // Only the faces turned toward the camera are drawn: a closed block is then drawn once.
      const to = v3(C.x - face.p[0].x, C.y - face.p[0].y, C.z - face.p[0].z);
      if (dot(face.n, to) <= 0) continue;
      const cam = face.p.map((q) => {
        const v = v3(q.x - C.x, q.y - C.y, q.z - C.z);
        return v3(dot(v, R), dot(v, U), dot(v, F));
      });
      const poly = clipNear(cam, NEAR);
      if (poly.length < 3) continue;
      const pts = poly.map((q) => ({
        x: width / 2 + (focal * q.x) / q.z,
        y: height / 2 - (focal * q.y) / q.z,
        iz: 1 / q.z,
      }));
      const shade = solid.tone * (0.55 + 0.45 * Math.max(0, dot(face.n, L)));
      for (let t = 1; t + 1 < pts.length; t++) {
        const [a, b, c] = [pts[0], pts[t], pts[t + 1]];
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const wa = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
            const wb = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
            const wc = 1 - wa - wb;
            if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
            const iz = wa * a.iz + wb * b.iz + wc * c.iz;
            const i = y * width + x;
            const s = face.solid;
            drawn[s]++;
            if (iz > depth[i]) {
              if (solidAt[i] >= 0 && solidAt[i] !== s) hide(solidAt[i], s);
              depth[i] = iz;
              solidAt[i] = s;
              faceAt[i] = k;
              // Further off is paler, as air makes it: depth reads at a glance.
              const fog = 1 - Math.exp(-1 / iz / 22);
              lum[i] = shade * (1 - fog) + BACKGROUND * fog;
            } else if (solidAt[i] !== s) hide(s, solidAt[i]);
          }
      }
    }

  // Outlines: darker where one thing meets another, lighter where one face of a thing meets the next.
  const edged = Float32Array.from(lum);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (const j of [x + 1 < width ? i + 1 : -1, y + 1 < height ? i + width : -1]) {
        if (j < 0 || faceAt[i] === faceAt[j]) continue;
        const k = solidAt[i] !== solidAt[j] ? 0.45 : 0.8;
        edged[i] = Math.min(edged[i], lum[i] * k);
        edged[j] = Math.min(edged[j], lum[j] * k);
      }
    }

  const seen = new Map<string, Seen>();
  const acc = solids.map(() => ({ count: 0, sx: 0, sy: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }));
  for (let i = 0; i < n; i++) {
    const s = solidAt[i];
    if (s < 0) continue;
    const a = acc[s];
    const x = i % width;
    const y = (i - x) / width;
    a.count++;
    a.sx += x;
    a.sy += y;
    a.x0 = Math.min(a.x0, x);
    a.x1 = Math.max(a.x1, x);
    a.y0 = Math.min(a.y0, y);
    a.y1 = Math.max(a.y1, y);
  }
  solids.forEach((solid, s) => {
    const a = acc[s];
    if (!a.count) return;
    const worst = [...hidden[s].entries()].sort((p, q) => q[1] - p[1])[0];
    const hiddenPart = drawn[s] ? 1 - a.count / drawn[s] : 0;
    const byOthers = [...hidden[s].values()].reduce((x, y) => x + y, 0);
    seen.set(solid.id, {
      id: solid.id,
      label: solid.label,
      visible: a.count,
      drawn: drawn[s],
      share: a.count / n,
      cx: a.sx / a.count / width,
      cy: a.sy / a.count / height,
      x0: a.x0 / width,
      x1: (a.x1 + 1) / width,
      y0: a.y0 / height,
      y1: (a.y1 + 1) / height,
      occluded: drawn[s] ? Math.min(1, byOthers / drawn[s]) : 0,
      ...(worst && hiddenPart >= 0.2 && worst[1] / drawn[s] >= 0.1 ? { hiddenBy: solids[worst[0]].id } : {}),
    });
  });
  const project = (q: V3) => {
    const v = v3(q.x - C.x, q.y - C.y, q.z - C.z);
    const z = dot(v, F);
    return z < NEAR ? null : { x: width / 2 + (focal * dot(v, R)) / z, y: height / 2 - (focal * dot(v, U)) / z };
  };
  return { width, height, lum: edged, solid: solidAt, solids, seen, project };
}

// A 5x7 pixel font for the labels: capitals, digits and a few marks.
const GLYPHS: Record<string, string> = {
  A: '.###.#...##...#######...##...##...#',
  B: '####.#...##...#####.#...##...#####.',
  C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.',
  E: '######....#....####.#....#....#####',
  F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.####',
  H: '#...##...##...#######...##...##...#',
  I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....##..#..##...',
  K: '#...##..#.#.#..##...#.#..#..#.#...#',
  L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#',
  N: '#...##...###..##.#.##..###...##...#',
  O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....',
  Q: '.###.#...##...##...##.#.##..#..##.#',
  R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.#####....#.....###.....#....#####.',
  T: '#####..#....#....#....#....#....#..',
  U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..',
  W: '#...##...##...##.#.##.#.##.#.#.#.#.',
  X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..',
  Z: '#####....#...#...#...#...#....#####',
  '0': '.###.#...##..###.#.###..##...#.###.',
  '1': '..#...##....#....#....#....#...###.',
  '2': '.###.#...#....#...#...#...#...#####',
  '3': '#####...#...#.....#.....##...#.###.',
  '4': '...#...##..#.#.#..#.#####...#....#.',
  '5': '######....####.....#....##...#.###.',
  '6': '..##..#...#....####.#...##...#.###.',
  '7': '#####....#...#...#...#....#....#...',
  '8': '.###.#...##...#.###.#...##...#.###.',
  '9': '.###.#...##...#.####....#...#..##..',
  '-': '...............#####...............',
  '.': '..........................##...##..',
  ',': '.....................##....#...#...',
  "'": '..#....#...#.......................',
  '(': '...#...#...#....#....#.....#.....#.',
  ')': '.#.....#.....#....#....#...#...#...',
  '/': '.........#...#...#...#...#.........',
  '&': '.##..#..#.#.#...#...#.#.##..#..##.#',
  ' ': '...................................',
};

/** A label's words as the font can draw them: capitals, no accents, without "the" or a gloss. */
export function labelText(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^\s*(the|a|an)\s+/i, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\-.,'()/& ]/g, '')
    .slice(0, 26);
}

/** The render as a picture: grey, with each named thing's label on it. */
function paint(r: Render, labelled: boolean): Uint8Array {
  const { width, height } = r;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const v = Math.max(0, Math.min(255, Math.round(r.lum[i] * 255)));
    rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v;
  }
  if (!labelled) return rgb;
  const scale = Math.max(2, Math.round(width / 460));
  const set = (x: number, y: number, v: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    rgb[i] = rgb[i + 1] = rgb[i + 2] = v;
  };
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const min = width * height * 0.002;
  for (const s of [...r.seen.values()]
    .filter((s) => s.label && s.visible >= min)
    .sort((a, b) => b.visible - a.visible)) {
    const text = labelText(s.label!);
    if (!text) continue;
    const w = text.length * 6 * scale + 4 * scale;
    const h = 9 * scale + 2 * scale;
    const [px, py] = roomiest(r, s);
    let x0 = Math.round(px - w / 2);
    let y0 = Math.round(py - h / 2);
    x0 = Math.max(2, Math.min(width - w - 2, x0));
    y0 = Math.max(2, Math.min(height - h - 2, y0));
    // Labels never cover each other: one that would is moved down, then up, until it is clear.
    for (
      let step = 1;
      placed.some((p) => x0 < p.x1 && x0 + w > p.x0 && y0 < p.y1 && y0 + h > p.y0) && step < 12;
      step++
    )
      y0 = Math.max(2, Math.min(height - h - 2, y0 + (step % 2 ? 1 : -1) * step * (h + 2)));
    placed.push({ x0, y0, x1: x0 + w, y1: y0 + h });
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        set(x, y, y - y0 < scale || y0 + h - y <= scale || x - x0 < scale || x0 + w - x <= scale ? 30 : 250);
    [...text].forEach((ch, c) => {
      const g = GLYPHS[ch] ?? GLYPHS[' '];
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < 5; gx++)
          if (g[gy * 5 + gx] === '#')
            for (let sy = 0; sy < scale; sy++)
              for (let sx = 0; sx < scale; sx++)
                set(x0 + 2 * scale + (c * 6 + gx) * scale + sx, y0 + 2 * scale + gy * scale + sy, 20);
    });
  }
  return rgb;
}

/**
 * Where on a solid its label goes: the point of it with the most of it around, near its middle. Its
 * middle alone can be on something in front of it: the sofa's label landed on the friend's legs.
 */
function roomiest(r: Render, s: Seen): [number, number] {
  const { width, height, solid } = r;
  const k = r.solids.findIndex((x) => x.id === s.id);
  const step = Math.max(4, Math.round(width / 170));
  const [cx, cy] = [s.cx * width, s.cy * height];
  let best: [number, number, number] = [cx, cy, -Infinity];
  for (let y = Math.floor(s.y0 * height); y < s.y1 * height; y += step)
    for (let x = Math.floor(s.x0 * width); x < s.x1 * width; x += step) {
      if (solid[y * width + x] !== k) continue;
      // How far it runs on in each of eight ways before it ends: the least of them is its room.
      let room = Infinity;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        let n = 0;
        for (let xx = x, yy = y; n < width / 4; n += step, xx += dx * step, yy += dy * step)
          if (xx < 0 || yy < 0 || xx >= width || yy >= height || solid[yy * width + xx] !== k) break;
        // A label is wide and short: room above and below counts for more than room to the sides.
        room = Math.min(room, n * (dx && dy ? 1.4 : dx ? 1 : 4));
      }
      const score = room - Math.hypot(x - cx, y - cy) * 0.15;
      if (score > best[2]) best = [x, y, score];
    }
  return [best[0], best[1]];
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** A picture as a PNG file: 8-bit RGB, one unfiltered scanline at a time. */
export function png(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    let c = 0xffffffff;
    for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 0xff] ^ (c >>> 8);
    view.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** The previs frame of a camera on a plan, as a PNG a picture can be drawn over. */
export function previsImage(
  plan: Blocking,
  eye: Eye,
  leaveOut: string[],
  name: (id: string) => string,
  width = 1376,
  height = 768,
): Uint8Array {
  const r = render(solidsOf(plan, leaveOut, name), eye, width, height);
  return png(width, height, paint(r, true));
}

/** Where across the picture a span is, in words. */
function across(s: Seen): string {
  const region = (x: number) =>
    x < 0.12
      ? 'the left edge'
      : x < 0.33
        ? 'the left third'
        : x < 0.45
          ? 'left of the middle'
          : x <= 0.55
            ? 'the middle'
            : x < 0.67
              ? 'right of the middle'
              : x <= 0.88
                ? 'the right third'
                : 'the right edge';
  const [a, b] = [region(s.x0 + 0.01), region(s.x1 - 0.01)];
  if (s.x1 - s.x0 >= 0.45 && a !== b) return `across the picture from ${a} to ${b}`;
  const c = region(s.cx);
  return c.endsWith('edge')
    ? `at ${c} of the picture`
    : c.includes('middle') && c !== 'the middle'
      ? `${c} of the picture`
      : `in ${c} of the picture`;
}

/** How a person is turned to the camera, and which way across the picture they look. */
export function turnedTo(s: Spot, plan: Blocking, eye: Eye): string {
  const f = facing(s, plan);
  const to = unit({ x: eye.at.x - s.x, y: eye.at.y - s.y });
  const angle = (Math.acos(Math.max(-1, Math.min(1, f.x * to.x + f.y * to.y))) * 180) / Math.PI;
  const r = rightOf(unit(eye.d));
  const side = f.x * r.x + f.y * r.y > 0 ? 'right' : 'left';
  const many = !!s.many;
  if (angle < 30) return many ? 'facing the camera' : 'facing the camera';
  if (angle < 70) return `turned three-quarters toward the camera, looking toward the ${side} of the picture`;
  if (angle < 110) return `${many ? 'side on' : 'in profile'}, looking toward the ${side} of the picture`;
  if (angle < 150) return `seen three-quarters from behind, looking toward the ${side} of the picture`;
  return many ? 'seen from behind' : 'their back to the camera';
}

const LEAN_WORDS: Record<Lean, string> = {
  back: 'leaning back a little',
  forward: 'leaning forward a little',
  left: 'leaning a little to their left',
  right: 'leaning a little to their right',
};

/**
 * The dreamer's own view, as a camera operator finds it: at their eyes where they are, turned to
 * what they look at, leaning a little where someone close would otherwise hide it. Every lean and a
 * few small turns are rendered, small, and the one showing the most of what they look at, nearest
 * the middle, is kept; plain, when leaning shows no more. Then what it sees is read off the render:
 * who and what is where across the picture, nearest first, how each person is turned, what is
 * partly hidden and by whom, and what is outside it, the place's front included.
 */
export function dreamerShot(
  plan: Blocking,
  dreamer: string,
  toward: string | undefined,
  name: (id: string) => string,
  /** What they look at that the plan does not hold (a field beyond the windscreen): named, ahead. */
  beyond?: string,
  /** Who the moment shows, to be in the picture: the driver beside them in the cab (25 Sep). */
  want: string[] = [],
): { eye: Eye; text: string; inPicture: string[] } | null {
  const me = plan.spots.find((s) => s.id === dreamer);
  if (!me) return null;
  const own = facing(me, plan);
  const side = rightOf(own);
  const target = toward ? plan.spots.find((s) => s.id === toward && s.id !== dreamer) : undefined;
  const solids = solidsOf(plan, [dreamer], name);
  // Their eyes, on whatever they stand on: a bridge's deck, a step of the stairs.
  const height = eyeHeight(me.pose) + groundAt(me, plan);
  // How far someone can lean from where they sit or stand, each way, to see past someone close.
  const leans: [Lean | undefined, V2, number][] = [[undefined, { x: 0, y: 0 }, 0]];
  for (const m of [0.3, 0.5])
    leans.push(
      ['back', { x: -own.x * m, y: -own.y * m }, m],
      ['forward', { x: own.x * m, y: own.y * m }, m],
      ['left', { x: -side.x * m, y: -side.y * m }, m],
      ['right', { x: side.x * m, y: side.y * m }, m],
    );
  const turn = (d: V2, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const r = rightOf(d);
    return unit({ x: d.x * Math.cos(a) + r.x * Math.sin(a), y: d.y * Math.cos(a) + r.y * Math.sin(a) });
  };
  // The middle of what they look at, at half its height: the one point that must show.
  const heart = target
    ? v3(
        target.x,
        target.y,
        groundAt(target, plan) + (isPerson(target) ? eyeHeight(target.pose) - 0.1 : sizeOf(target)[2] / 2),
      )
    : null;
  const near = plan.spots.filter((s) => s.id !== dreamer && s.id !== target?.id && isPerson(s) && !s.many);
  let best: { eye: Eye; score: number } | undefined;
  // Who the moment shows besides what it looks at: in the picture, where the view can hold them. Looking
  // straight ahead from the tractor's seat left out the driver it was about (lighthouse, 25 Sep).
  const wanted = want.filter((id) => id !== dreamer && id !== target?.id && plan.spots.some((s) => s.id === id));
  const shows = (r: ReturnType<typeof render>) =>
    wanted.length ? wanted.filter((id) => (r.seen.get(id)?.visible ?? 0) >= 192 * 108 * 0.002).length / wanted.length : 0;
  for (const [lean, off, how] of target ? leans : leans.slice(0, 1))
    for (const aim of target ? [0, -8, 8, -15, 15, -22, 22] : wanted.length ? [0, -15, 15, -30, 30, -45, 45] : [0]) {
      const at = { x: me.x + off.x, y: me.y + off.y };
      const d = turn(target ? unit({ x: target.x - at.x, y: target.y - at.y }) : own, aim);
      // Tilted to what they look at when it is well above or below them (over 20 degrees): looking
      // straight ahead up a staircase, the dog running up it far above was out of the picture
      // (lighthouse, 25 Sep). Nearer level, the view stays as the approved shots had it.
      const pitch = heart
        ? Math.max(-0.6, Math.min(0.6, Math.atan2(heart.z - height, Math.max(0.5, Math.hypot(heart.x - at.x, heart.y - at.y)))))
        : PITCH;
      const eye: Eye = { at, d, height, pitch: Math.abs(pitch) < 0.35 ? PITCH : pitch, ...(lean ? { lean } : {}) };
      if (!target || !heart) {
        // Nothing it looks at on the plan: straight ahead, turned only as far as it takes to show who
        // the moment shows.
        const score = wanted.length ? 2 * shows(render(solids, eye, 192, 108)) - Math.abs(aim) * 0.01 : 0;
        if (!best || score > best.score + 1e-9) best = { eye, score };
        continue;
      }
      const r = render(solids, eye, 192, 108);
      const t = r.seen.get(target.id);
      if (!t) continue;
      // As a camera operator frames past someone close: the heart of what the picture is about
      // shows, near the middle, and whoever is close is kept to an edge rather than across it.
      const k = r.solids.findIndex((x) => x.id === target.id);
      const p = r.project(heart);
      let clear = 0;
      if (p)
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const [x, y] = [Math.round(p.x) + dx * 2, Math.round(p.y) + dy * 2];
            if (x >= 0 && y >= 0 && x < r.width && y < r.height && r.solid[y * r.width + x] === k) clear++;
          }
      const centred = 1 - Math.abs(t.cx - 0.5) * 2;
      // Big in the frame, up to a third of it; whoever is close takes an edge, not a third of it.
      const big = Math.min(1, t.share / 0.3);
      const close = near.reduce((a, s) => Math.max(a, r.seen.get(s.id)?.share ?? 0), 0);
      const score =
        (2 * clear) / 49 +
        t.visible / Math.max(1, t.drawn) +
        centred +
        1.5 * big -
        3 * Math.max(0, close - 0.12) -
        how -
        Math.abs(aim) * 0.01 +
        shows(r);
      if (!best || score > best.score + 1e-9) best = { eye, score };
    }
  if (!best) return null;
  const eye = best!.eye;
  const r = render(solids, eye, 384, 216);
  const min = 384 * 216 * 0.002;

  // What they are on or in (the seat under them, the car they ride in) is where they are, not
  // something before them.
  const at = plan.spots
    .filter(
      (s) => s.id !== dreamer && !isPerson(s) && !s.heldBy && shapeOf(s, plan) !== 'block' && onFootprint(me, s, plan),
    )
    .map((s) => s.id);
  const inIt = at.some((id) => plan.spots.find((s) => s.id === id)?.shape === 'vehicle');
  const turnAngle = (() => {
    const d = unit(eye.d);
    const a = (Math.atan2(d.x * rightOf(own).x + d.y * rightOf(own).y, d.x * own.x + d.y * own.y) * 180) / Math.PI;
    return a;
  })();
  const turned =
    Math.abs(turnAngle) < 20
      ? 'looking straight ahead'
      : Math.abs(turnAngle) > 150
        ? 'turned right round'
        : `turned to their ${turnAngle < 0 ? 'left' : 'right'}`;
  const pose =
    me.pose === 'sitting' ? ', at the height of their eyes sitting' : me.pose === 'lying' ? ', lying down' : '';
  const spots = plan.spots.filter((s) => s.id !== dreamer && !at.includes(s.id));
  const distance = (s: Spot) => Math.hypot(s.x - eye.at.x, s.y - eye.at.y);
  const shown = spots
    .map((s) => ({ s, seen: r.seen.get(s.id) }))
    .filter((x): x is { s: Spot; seen: Seen } => !!x.seen && x.seen.visible >= min)
    .sort((a, b) => distance(a.s) - distance(b.s));
  const called = (id: string) => plan.spots.find((s) => s.id === id)?.name ?? name(id);
  const sentences = [
    `The camera is the dreamer's eyes${at.length ? `, ${inIt ? 'in' : 'on'} ${at.map(called).join(' and ')}` : ''}${pose}${eye.lean ? `, ${LEAN_WORDS[eye.lean]}` : ''}, ${turned}${toward ? `, toward ${called(toward)}` : ''}: it looks toward ${wall(eye.d, plan.front, !!plan.indoors)}. A wide lens, about 24mm.`,
    // Riding in something, what they are in is in the picture: through the dreamer's eyes in the
    // tractor's cab, the tractor was read as missing from its own moment (lighthouse, 25 Sep).
    ...(inIt && at.length
      ? [
          `The inside of ${called(at.find((id) => plan.spots.find((x) => x.id === id)?.shape === 'vehicle') ?? at[0])} frames the picture: its front ahead and the edges of its window around the view.`,
        ]
      : []),
    ...shown.map(({ s, seen }, i) => {
      const lead = i === 0 ? 'Nearest' : i === shown.length - 1 && shown.length > 1 ? 'Farthest' : 'Then';
      return `${lead}, ${reach(distance(s))}, ${across(seen)}: ${called(s.id)}${thingWords(s, seen, plan, eye, called, { spots, on: at, anchor: me })}.`;
    }),
    ...spots
      .filter((s) => !shown.some((x) => x.s.id === s.id))
      .map((s) => `Outside the picture, ${offTo(eye, s)}: ${called(s.id)}.`),
    frontLine(plan, eye, r, min),
    // Beyond everything the plan holds, what the moment looks at: the view from the tractor's cab
    // ended at its windscreen, and the field it drove through was read as missing (lighthouse, 25 Sep).
    ...(beyond && !toward ? [`Beyond it all, ahead where they look: ${beyond.replace(/[.\s]+$/, '')}.`] : []),
  ];
  return { eye, text: sentences.join(' '), inPicture: [...at, ...shown.map((x) => x.s.id)] };
}

/**
 * What a camera's words say of one thing it shows: what someone sits on, how they are turned, what
 * a thing stands right beside, how big it is in the frame, and what partly hides it, all read off
 * the render. `on` is what the dreamer is on, when the camera is their eyes.
 */
function thingWords(
  s: Spot,
  seen: Seen,
  plan: Blocking,
  eye: Eye,
  called: (id: string) => string,
  ctx: { spots: Spot[]; on: string[]; anchor?: Spot },
): string {
  // Who sits on what, who rides in what, what stands right beside what, and who holds what: said
  // as the plan has it, or the model gives the friend an armchair of her own and puts the roller
  // coaster out on the floor (24 Sep).
  const on = isPerson(s) && !s.many ? onOf(s, plan) : undefined;
  const pose = s.pose === 'lying' ? 'lying' : s.pose === 'sitting' ? 'sitting' : 'standing';
  const sitting = on
    ? ctx.on.includes(on.t.id)
      ? on.how === 'in'
        ? `, beside the dreamer in the same ${bareName(called(on.t.id))}`
        : `, ${pose} beside the dreamer on the same ${bareName(called(on.t.id))}`
      : on.how === 'in'
        ? `, in ${called(on.t.id)}`
        : `, ${pose} on ${called(on.t.id)}`
    : '';
  const holder = !isPerson(s) && s.heldBy ? s.heldBy : undefined;
  const holds = isPerson(s) && !s.many ? plan.spots.filter((o) => o.heldBy === s.id).map((o) => called(o.id)) : [];
  const next =
    !isPerson(s) && !holder
      ? besideOf(s, plan, [...ctx.on, ...ctx.spots.filter((o) => !isPerson(o)).map((o) => o.id)])
      : undefined;
  const riders = !isPerson(s)
    ? ctx.spots.filter((o) => isPerson(o) && !o.many && onOf(o, plan)?.t.id === s.id).map((o) => called(o.id))
    : [];
  const shape = !isPerson(s) ? shapeOf(s, plan) : undefined;
  const how =
    sitting +
    (isPerson(s) && !s.many ? `, ${turnedTo(s, plan, eye)}` : '') +
    (holds.length ? `, holding ${holds.join(' and ')}` : '') +
    (holder ? `, in ${called(holder)}'s hands` : '') +
    (riders.length
      ? `, with ${riders.join(' and ')} ${shape === 'vehicle' ? 'in it' : shape === 'seat' ? 'sitting on it' : 'on it'}`
      : '') +
    (next ? `, right beside ${called(next.id)}` : '');
  const behind =
    seen.hiddenBy && seen.hiddenBy !== s.id && ctx.spots.some((o) => o.id === seen.hiddenBy)
      ? `, partly hidden behind ${called(seen.hiddenBy)}`
      : '';
  // How big it is in the frame, read off the render: the image model keeps where each thing is
  // across the picture from the words, and makes up how big it is. The friend beside the
  // dreamer, seen from the waist up in the previs, came back whole and two metres off (24 Sep).
  const size = !s.many ? `, ${isPerson(s) ? `${cropOf(s, eye)} and ` : ''}filling the picture ${upDown(seen)}` : '';
  // A crowd the dream counts is said by its count: "a couple of people" are the two of them.
  const counted = ['', 'one', 'two', 'three', 'four', 'five', 'six'][s.count ?? 0];
  return s.many
    ? `, ${counted ? `the ${counted} of them` : 'many of them'}${ctx.anchor ? rows(s, ctx.anchor, plan, called) : ''}, ${turnedTo({ ...s, ...nearestOf(s, seen, eye, plan) }, plan, eye)}${behind}`
    : `${how}${size}${behind}`;
}

/** How tall a person must be in the picture, as a share of its height, for a shot of each size. */
const TALL: Record<'close' | 'medium' | 'wide', number> = { close: 0.5, medium: 0.3, wide: 0.15 };

/**
 * How well a render frames the people it must show: each tall enough for the shot's size, and none
 * cut by the picture's side. Read off the render, so it is exact; what is wrong is said in words.
 * From across the place, the aunt in her car was a speck cut by the left edge and the dreamer a
 * speck at the right, and "storyboard complete?" cleared it: its questions are about where things
 * are, not how well they are framed (25 Sep).
 */
function framing(
  r: Render,
  people: Spot[],
  size: 'close' | 'medium' | 'wide',
  name: (id: string) => string,
  plan: Blocking,
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let sum = 0;
  let cut = 0;
  for (const p of people) {
    // Their whole height and width as the camera sees them, whatever hides part of them: being
    // partly behind a sofa's back is scored apart, and a seated pair seen over it measured short.
    const z = groundAt(p, plan);
    const head = r.project(v3(p.x, p.y, z + eyeHeight(p.pose) + 0.15));
    const feet = r.project(v3(p.x, p.y, z));
    if (!head || !feet) continue;
    const top = Math.max(0, head.y) / r.height;
    const bottom = Math.min(r.height, feet.y) / r.height;
    const tall = Math.max(0, bottom - top);
    if (!tall) continue;
    sum += Math.min(1, tall / TALL[size]);
    if (tall < TALL[size] * 0.6) issues.push(`${name(p.id)} is too small in the picture to read`);
    const across = (feet.x + head.x) / 2 / r.width;
    const half = Math.abs(feet.y - head.y) / r.width / 7;
    if (across - half < 0 || across + half > 1) {
      cut++;
      issues.push(`${name(p.id)} is cut by the picture's ${across < 0.5 ? 'left' : 'right'} edge`);
    }
  }
  return { score: people.length ? (sum - 0.5 * cut) / people.length : 1, issues };
}

/** The lens for a shot seen from outside, by how close it is: a portrait lens close, a wide one for the whole place. */
const LENS: Record<'close' | 'medium' | 'wide', number> = { close: 50, medium: 35, wide: 24 };

/**
 * A moment seen from outside, as a camera operator places the camera on the floor plan: in front of
 * the people it shows, facing them, or behind them when the moment faces the place's front; as far
 * off as its size needs (close: a head and shoulders fill the frame; medium: from the waist up;
 * wide: all of them and room around them), at the height of their eyes, never through a wall: a
 * camera the room is too small for comes closer with a wider lens. What it sees is read off its
 * render, left to right, as the dreamer's own view is. Told only who is left and right in words,
 * the model made up how far off the camera was and what furniture stood where (24 Sep).
 */
export function outsideShot(
  plan: Blocking,
  subjects: string[],
  size: 'close' | 'medium' | 'wide',
  called: (id: string) => string,
  /**
   * What the moment looks at: a point on the plan (something in the place), or a way (a side of
   * the place). The camera faces it, with the people it shows before it.
   */
  lookAt?: { at?: V2; way?: V2; id?: string; theirs?: boolean },
  /** What else the moment's words name on the plan: in the picture too, where it can be. */
  also: string[] = [],
): { eye: Eye; text: string; inPicture: string[]; framing: string[] } | null {
  const name = (id: string) => plan.spots.find((s) => s.id === id)?.name ?? called(id);
  const inIt = subjects.map((id) => plan.spots.find((s) => s.id === id)).filter((s): s is Spot => !!s && !s.many);
  const people = inIt.filter((s) => isPerson(s));
  const group = people.length ? people : inIt;
  if (!group.length) return null;
  let c = {
    x: group.reduce((a, s) => a + s.x, 0) / group.length,
    y: group.reduce((a, s) => a + s.y, 0) / group.length,
  };
  // What the moment looks at is in the picture too: the village the dreamer faces, not only the
  // dreamer with the village behind the camera (25 Sep).
  const looked = lookAt?.id ? plan.spots.find((s) => s.id === lookAt.id && !s.many && !inIt.includes(s)) : undefined;
  // A crowd the moment is about is in the picture too: "a couple of people" sitting with the dreamer
  // were left out of a frame that held only the dreamer and the balloons (25 Sep).
  const crowds = subjects.map((id) => plan.spots.find((s) => s.id === id)).filter((s): s is Spot => !!s && !!s.many);
  const holdAll = [...inIt, ...crowds, ...(looked ? [looked] : [])];
  // Whose framing is measured: each person, and a few the dream counts; an audience overflows any
  // frame, and swung the camera off the screen to keep from cutting it (25 Sep).
  const framedPeople = [...people, ...crowds.filter((x) => x.count && x.count <= 6)];
  // Where a thing is, for framing: its part nearest `to`, so a long street under someone's feet
  // frames as the ground they stand on, and a house as its wall beside them.
  const nearestPart = (t: Spot, to: V2): V2 => {
    if (isPerson(t)) return t;
    const [w, d] = sizeOf(t);
    const f = facing(t, plan);
    const r = rightOf(f);
    const v = { x: to.x - t.x, y: to.y - t.y };
    const a = Math.max(-w / 2, Math.min(w / 2, v.x * r.x + v.y * r.y));
    const b = Math.max(-d / 2, Math.min(d / 2, v.x * f.x + v.y * f.y));
    return { x: t.x + r.x * a + f.x * b, y: t.y + r.y * a + f.y * b };
  };
  const facings = (people.length ? people : group).map((s) => facing(s, plan));
  const sum = facings.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 });
  // 1 when they all face one way, 0 when they face each other.
  const together = Math.hypot(sum.x, sum.y) / facings.length;
  // How far the camera can stand back from the middle of them, going the other way to d.
  const room = (d: V2) => {
    if (!plan.indoors) return 30;
    const t = [
      d.x > 0 ? c.x / d.x : d.x < 0 ? (c.x - roomOf(plan)[0]) / d.x : Infinity,
      d.y > 0 ? c.y / d.y : d.y < 0 ? (c.y - roomOf(plan)[1]) / d.y : Infinity,
    ];
    return Math.min(...t.map(Math.abs));
  };
  // Someone at something close they face (a cook at her stove) is shot as two facing each other are:
  // from the side, both in the picture. From in front, her back was to the stove (25 Sep).
  const faced =
    people.length === 1 && people[0].faces ? holdAll.find((t) => t.id === people[0].faces && !isPerson(t)) : undefined;
  const at = faced ? nearestPart(faced, people[0]) : undefined;
  // Something they hold, or stand at the very spot of, has no side to be taken from: the dreamer
  // "facing" the balloons in their hands, or the corner they stood on, turned the camera to face
  // nothing, and everyone was out of the picture (25 Sep).
  const gap = at ? Math.hypot(at.x - people[0].x, at.y - people[0].y) : 0;
  const atIt = !!at && !faced?.heldBy && gap > 0.3 && gap < 2;
  const ends =
    group.length >= 2 ? Math.hypot(group[group.length - 1].x - group[0].x, group[group.length - 1].y - group[0].y) : 0;
  // Two people far apart (one waiting, the other arriving) cannot share a two-shot from the side:
  // from across the place both were specks at the picture's edges, the car cut in half (25 Sep).
  // The camera stands behind the one away from what the moment looks at, over their shoulder.
  const apart = !atIt && group.length === 2 && people.length === 2 && ends > 4;
  const pair = !apart && ((facings.length >= 2 && together < 0.4 && ends > 0.4) || atIt);
  // Which way the moment looks, if it says.
  const looks = lookAt?.way
    ? unit(lookAt.way)
    : lookAt?.at && Math.hypot(lookAt.at.x - c.x, lookAt.at.y - c.y) > 0.8
      ? unit({ x: lookAt.at.x - c.x, y: lookAt.at.y - c.y })
      : lookAt?.theirs && together > 0.5
        ? unit(sum)
        : undefined;
  let d0: V2;
  const [near, far_] = apart
    ? lookAt?.at
      ? [...group].sort(
          (a, b) =>
            Math.hypot(b.x - lookAt.at!.x, b.y - lookAt.at!.y) - Math.hypot(a.x - lookAt.at!.x, a.y - lookAt.at!.y),
        )
      : group
    : [];
  if (apart) {
    c = { x: near.x, y: near.y };
    d0 = unit({ x: far_.x - near.x, y: far_.y - near.y });
  } else if (pair) {
    // Facing each other, as two people talking: a two-shot from the side, the side turned toward
    // what the moment looks at, or where the room leaves most space. Looking "toward the
    // autoclave" along the line between them put the camera behind one, hiding the other (24 Sep).
    const [one, other] = atIt ? [people[0], at!] : [group[0], group[group.length - 1]];
    const u = unit({ x: other.x - one.x, y: other.y - one.y });
    const sides = [rightOf(u), { x: -rightOf(u).x, y: -rightOf(u).y }];
    const toward = (v: V2) => (looks ? v.x * looks.x + v.y * looks.y : 0);
    d0 =
      Math.abs(toward(sides[0]) - toward(sides[1])) > 0.2
        ? toward(sides[0]) > toward(sides[1])
          ? sides[0]
          : sides[1]
        : room(sides[0]) >= room(sides[1])
          ? sides[0]
          : sides[1];
  } else if (looks)
    // What the moment looks at is behind them, and the camera looks at it past them.
    d0 = looks;
  else d0 = together > 0 ? unit({ x: -sum.x, y: -sum.y }) : DIRECTIONS.back;
  const tallest = Math.max(
    ...group.map((s) => groundAt(s, plan) + (isPerson(s) ? eyeHeight(s.pose) + 0.15 : sizeOf(s)[2])),
  );
  const lowest = size === 'close' ? tallest - 0.7 : size === 'medium' ? tallest * 0.45 : 0;
  const height = people.length
    ? people.reduce((a, s) => a + eyeHeight(s.pose) + groundAt(s, plan), 0) / people.length
    : 1.5;
  const aim = (tallest + lowest) / 2;
  const tallAt = (l: number) => Math.atan(Math.tan(Math.atan(18 / l)) * (9 / 16));
  // The camera for a way of looking: as far off as the shot needs, `back` times that if it must
  // stand further off to hold everyone, never through a wall.
  const place = (d: V2, back = 1): { eye: Eye; far: number; cramped: number } => {
    const r = rightOf(d);
    // How much of the place across the camera everyone and everything it holds takes, side to side:
    // a thing as its part nearest them, and as much of it either side as a frame can hold.
    const offsets = holdAll.flatMap((t) => {
      const q = nearestPart(t, c);
      const o = (q.x - c.x) * r.x + (q.y - c.y) * r.y;
      const half = t.many
        ? Math.min(1.5, t.count ? ((t.count - 1) * 0.7) / 2 + 0.3 : (t.spread?.[0] ?? 2) / 2)
        : isPerson(t)
          ? 0
          : Math.min(1.5, extent(t, plan, r));
      return [o - half, o + half];
    });
    const wide = Math.max(...offsets) - Math.min(...offsets) + (size === 'close' ? 0.4 : size === 'medium' ? 1 : 2.5);
    const tall = (tallest - lowest) * (size === 'close' ? 1.3 : size === 'medium' ? 1.25 : 1.8);
    // What the frame must hold, and so how far off a lens of this size must be.
    const frameTall = Math.max(tall, (wide * 9) / 16);
    let lens = LENS[size];
    let far = (frameTall / 2 / Math.tan(tallAt(lens))) * back;
    let at = { x: c.x - d.x * far, y: c.y - d.y * far };
    // Never on top of anyone it holds: the nearest of them at least as far off as the shot's size
    // needs. Behind the dreamer to look at the car past them, the camera stood a metre off and the
    // dreamer filled the picture (25 Sep).
    const ahead = () => Math.min(...people.map((q) => (q.x - at.x) * d.x + (q.y - at.y) * d.y));
    const minNear = { close: 0.8, medium: 1.6, wide: 3 }[size];
    if (people.length && ahead() < minNear) {
      far += minNear - ahead();
      at = { x: c.x - d.x * far, y: c.y - d.y * far };
    }
    // Indoors, never through a wall: closer, with a lens wide enough to hold the same.
    if (plan.indoors) {
      const [rw, rd] = roomOf(plan);
      // Against a wall at worst: in a tiny room the camera stands with its back to the wall.
      const inside = (p: V2) => p.x >= 0.15 && p.x <= rw - 0.15 && p.y >= 0.15 && p.y <= rd - 0.15;
      while (!inside(at) && far > 0.6) {
        far -= 0.1;
        at = { x: c.x - d.x * far, y: c.y - d.y * far };
      }
      const need = Math.atan(frameTall / 2 / far);
      if (need > tallAt(lens)) lens = Math.max(14, Math.round(18 / Math.tan(Math.atan(Math.tan(need) * (16 / 9)))));
    }
    // How much closer than the shot needs a wall kept it: a wide moment taken from a step behind
    // the dreamer at the entrance, on a 14mm lens (25 Sep).
    const cramped = people.length ? Math.max(0, minNear - ahead()) : 0;
    return { eye: { at, d, height, pitch: Math.atan2(aim - height, far), lens }, far, cramped };
  };
  const turnBy = (v: V2, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const r = rightOf(v);
    return unit({ x: v.x * Math.cos(a) + r.x * Math.sin(a), y: v.y * Math.cos(a) + r.y * Math.sin(a) });
  };
  // As a camera operator walks round and steps back until everyone and everything the moment shows
  // is in the picture and nobody is hidden: its way of looking, a little either side of it, and
  // further off, each rendered small; the one holding them all, clearest, least turned and nearest.
  // Aimed at the car past the group, the frame left the dreamer out of the picture (25 Sep).
  const solidsSmall = solidsOf(plan, [], name);
  const tiny = 192 * 108 * 0.001;
  let best: { eye: Eye; far: number; cramped: number; score: number } | undefined;
  // What the moment's words also name, and the ways round to it: walked all the way round only when
  // there is something named to find.
  const extra = also
    .map((id) => plan.spots.find((s) => s.id === id))
    .filter((s): s is Spot => !!s && !holdAll.includes(s));
  const degs = extra.length ? [0, -20, 20, -40, 40, -70, 70, -110, 110, 180] : [0, -20, 20, -40, 40, -70, 70];
  for (const deg of degs)
    for (const back of [1, 1.35, 1.8]) {
      const cand = place(turnBy(d0, deg), back);
      const rs = render(solidsSmall, cand.eye, 192, 108);
      const seen = holdAll.map((s) => rs.seen.get(s.id));
      const inFrame = seen.filter((x) => x && x.visible >= tiny).length / holdAll.length;
      const clear = seen.reduce((a, x) => a + (x ? 1 - x.occluded : 0), 0) / holdAll.length;
      const framed = framing(rs, framedPeople, size, name, plan).score;
      const named = extra.length ? extra.filter((s) => (rs.seen.get(s.id)?.visible ?? 0) >= tiny).length / extra.length : 0;
      const score =
        2 * inFrame + clear + 0.8 * framed + named - Math.abs(deg) * 0.006 - (back - 1) * 0.2 - cand.cramped * 0.5;
      if (!best || score > best.score + 1e-9) best = { ...cand, score };
    }
  const { eye, far } = best!;
  const d = eye.d;
  const lens = eye.lens ?? LENS[size];
  const toward = together > 0 ? (sum.x * d.x + sum.y * d.y) / Math.hypot(sum.x, sum.y) : 0;
  // One person is named, never "them": "seen from behind them" of a woman walking off alone came
  // back with a man standing beside her (24 Sep).
  const them = people.length === 1 ? name(people[0].id) : 'them';
  const from = apart
    ? `from behind ${name(near.id)}, over their shoulder`
    : pair
      ? atIt
        ? `from the side, as ${them} faces ${name(faced!.id)}`
        : 'from the side, as they face each other'
      : toward > 0.5
        ? `from behind ${them}`
        : toward < -0.5
          ? `from in front of ${them}`
          : `from beside ${them}`;
  const solids = solidsOf(plan, [], name);
  const rr = render(solids, eye, 384, 216);
  const min = 384 * 216 * 0.002;
  const spots = plan.spots;
  // Whoever rides in something the picture shows is in it, however little of them shows above its
  // sides: the aunt in her car was said to be outside the picture (25 Sep).
  const riding = (s: Spot) => {
    const on = isPerson(s) && !s.many ? onOf(s, plan) : undefined;
    return on?.how === 'in' && (rr.seen.get(on.t.id)?.visible ?? 0) >= min;
  };
  const shown = spots
    .map((s) => ({ s, seen: rr.seen.get(s.id) }))
    .filter(
      (x): x is { s: Spot; seen: Seen } => !!x.seen && (x.seen.visible >= min || (x.seen.visible > 0 && riding(x.s))),
    )
    .sort((a, b) => a.seen.cx - b.seen.cx);
  const anchor = people[0];
  // Said in metres: "a few metres off" in a room two metres across read as the prompt at odds with
  // itself, and the tiny room's moment was held (Meads, 25 Sep).
  const where = far < 1.6 ? 'close' : far < 4 ? `about ${Math.round(far)} metres off` : 'from across the place';
  // What the moment looks at, by name, where the picture shows it: "the camera looks toward the right
  // side of the room" did not say it faced the cook the moment is about (25 Sep).
  const lookedAt = lookAt?.id && shown.some((x) => x.s.id === lookAt.id) ? name(lookAt.id) : undefined;
  const words = (s: Spot, seen: Seen) =>
    `${name(s.id)}, ${across(seen).replace(/^(in|at) /, '')}${thingWords(s, seen, plan, eye, name, { spots, on: [], anchor })}`;
  // The people it shows, left to right, then the things it shows; then what is behind them.
  const whoShown = shown.filter((x) => subjects.includes(x.s.id) && isPerson(x.s));
  const whatShown = shown.filter((x) => subjects.includes(x.s.id) && !isPerson(x.s));
  const behind = shown.filter((x) => !subjects.includes(x.s.id));
  const sentences = [
    `Seen ${from}, ${where}, at the height of ${people.length === 1 ? `${them}'s eyes` : 'their eyes'}: the camera looks ${lookedAt ? `at ${lookedAt}, ` : ''}toward ${wall(d, plan.front, !!plan.indoors)}. A ${lens}mm lens.`,
    whoShown.length
      ? `From left to right across the picture: ${whoShown.map(({ s, seen }) => words(s, seen)).join('; then ')}. ${
          whoShown.length === 1
            ? 'Nobody else is in the picture.'
            : `Nobody else is in the picture. They keep these places in every picture of this scene.`
        }`
      : '',
    ...whatShown.map(({ s, seen }) => `${cap(words(s, seen))}.`),
    behind.length ? `Also in the picture: ${behind.map(({ s, seen }) => words(s, seen)).join('; ')}.` : '',
    // Whatever of the place is not in the picture is said to be out of it, and where: the woman
    // walking off came back with the autoclave, behind the camera, drawn beside her where the
    // room's sketch has it (24 Sep).
    ...spots
      .filter((s) => !shown.some((x) => x.s.id === s.id) && !riding(s) && (subjects.includes(s.id) || !isPerson(s)))
      .map((s) => `Outside the picture, ${offTo(eye, s)}: ${name(s.id)}.`),
    frontLine(plan, eye, rr, min),
  ].filter(Boolean);
  return {
    eye,
    text: sentences.join(' '),
    inPicture: [
      ...shown.map((x) => x.s.id),
      ...spots.filter((s) => riding(s) && !shown.some((x) => x.s.id === s.id)).map((s) => s.id),
    ],
    framing: framing(rr, framedPeople, size, name, plan).issues,
  };
}

/**
 * Where on a crowd the camera sees it: the first of the ground it fills along the line through the
 * middle of what shows. A crowd's middle can be off to one side of the part in the picture.
 */
function nearestOf(s: Spot, seen: Seen, eye: Eye, plan: Blocking): V2 {
  const d = unit(eye.d);
  const r = rightOf(d);
  const a = Math.atan((seen.cx - 0.5) * 2 * Math.tan((halfViewOf(eye) * Math.PI) / 180));
  const ray = { x: d.x * Math.cos(a) + r.x * Math.sin(a), y: d.y * Math.cos(a) + r.y * Math.sin(a) };
  const [w, dp] = s.spread ?? [4, 3];
  const face = facing(s, plan);
  const fr = rightOf(face);
  for (let t = 0.2; t < 40; t += 0.1) {
    const p = { x: eye.at.x + ray.x * t, y: eye.at.y + ray.y * t };
    const v = { x: p.x - s.x, y: p.y - s.y };
    if (Math.abs(v.x * fr.x + v.y * fr.y) <= w / 2 && Math.abs(v.x * face.x + v.y * face.y) <= dp / 2) return p;
  }
  return { x: s.x, y: s.y };
}

/** A name without its article or gloss: "the same blue sofa", not "the same the blue sofa". */
const bareName = (x: string) =>
  x
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/^\s*(the|a|an)\s+/i, '')
    .trim();

/** Half the height of a camera's view, in degrees, for a 16:9 frame. */
const halfTall = (eye: Eye) => (Math.atan(Math.tan((halfViewOf(eye) * Math.PI) / 180) * (9 / 16)) * 180) / Math.PI;

/**
 * How much of someone the frame holds, where the bottom of the picture cuts them: from the waist
 * up, head and shoulders, or all of them.
 */
function cropOf(s: Spot, eye: Eye): string {
  const d = unit(eye.d);
  const along = (s.x - eye.at.x) * d.x + (s.y - eye.at.y) * d.y;
  const low = eye.height + along * Math.tan((eye.pitch ?? 0) + (-halfTall(eye) * Math.PI) / 180);
  const sitting = s.pose === 'sitting';
  const [head, shoulders, waist, knees] = sitting
    ? [1.1, 0.85, 0.5, 0.2]
    : s.pose === 'lying'
      ? [0.3, 0.25, 0.15, 0.05]
      : [1.5, 1.25, 0.85, 0.45];
  return low >= head
    ? 'only the head in the picture'
    : low >= shoulders
      ? 'seen from the shoulders up'
      : low >= waist
        ? 'seen from the waist up'
        : low >= knees
          ? 'seen from the knees up'
          : 'seen whole';
}

/** Where down the picture something reaches, from its top to its bottom, in words. */
function upDown(s: Seen): string {
  const top =
    s.y0 < 0.05
      ? 'its top edge'
      : s.y0 < 0.2
        ? 'near its top'
        : s.y0 < 0.4
          ? 'a third of the way down'
          : s.y0 < 0.6
            ? 'its middle'
            : 'low down';
  const bottom =
    s.y1 > 0.97
      ? 'its bottom edge'
      : s.y1 > 0.8
        ? 'near its bottom'
        : s.y1 > 0.6
          ? 'two thirds of the way down'
          : s.y1 > 0.4
            ? 'its middle'
            : 'a third of the way down';
  return `from ${top} to ${bottom}`;
}

/**
 * Where a crowd is from the dreamer's place, front to back of the room: in the rows behind theirs,
 * in front of them, or around them, and on seats if they sit.
 */
function rows(s: Spot, me: Spot, plan: Blocking, called: (id: string) => string): string {
  // A few people the dream counts sit where they are, not in rows: "the two of them, sitting in rows
  // of seats" of a couple on the sofa beside the dreamer (25 Sep).
  if (s.count && s.count <= 12) {
    const seat = plan.spots.find((t) => !isPerson(t) && shapeOf(t, plan) === 'seat' && onFootprint(s, t, plan, 0.4));
    return s.pose === 'sitting' ? `, sitting${seat ? ` on ${seat.name ?? called(seat.id)}` : ''}` : '';
  }
  const deep = (s.spread?.[1] ?? 3) / 2;
  const where =
    s.y - deep > me.y + 0.3 ? " behind the dreamer's row" : s.y + deep < me.y - 0.3 ? ' in front of the dreamer' : '';
  return s.pose === 'sitting' ? `, sitting in rows of seats${where}` : where ? `,${where}` : '';
}

/** How far a thing reaches from its middle toward a direction: half its footprint that way. */
function extent(s: Spot, plan: Blocking, u: V2): number {
  if (isPerson(s)) return 0.25;
  const [w, d] = sizeOf(s);
  const f = facing(s, plan);
  const r = rightOf(f);
  return (Math.abs(u.x * r.x + u.y * r.y) * w) / 2 + (Math.abs(u.x * f.x + u.y * f.y) * d) / 2;
}

/**
 * What someone is in or on, where they are in or on something: in a vehicle, sitting or lying on a
 * seat, on the steps or the ground they stand on. Never a solid: the dreamer sat "on" a string of
 * balloons and "on" the house when everything under someone was a seat (25 Sep).
 */
export function onOf(p: Spot, plan: Blocking): { t: Spot; how: 'on' | 'in' } | undefined {
  const under = plan.spots.filter((t) => t.id !== p.id && !isPerson(t) && !t.heldBy && onFootprint(p, t, plan));
  const by = (shape: Shape) => under.find((t) => shapeOf(t, plan) === shape);
  const v = by('vehicle');
  if (v && p.pose !== 'standing') return { t: v, how: 'in' };
  const seat = by('seat');
  if (seat && p.pose !== 'standing') return { t: seat, how: 'on' };
  const ground = by('steps') ?? by('ground');
  return ground ? { t: ground, how: 'on' } : undefined;
}

/** The thing among `ids` that a thing stands right beside, its edge within a hand's width of it. */
function besideOf(s: Spot, plan: Blocking, ids: string[]): Spot | undefined {
  return plan.spots
    .filter((o) => o.id !== s.id && ids.includes(o.id) && !isPerson(o) && !o.heldBy)
    .map((o) => {
      const dist = Math.hypot(o.x - s.x, o.y - s.y) || 1e-6;
      const u = { x: (o.x - s.x) / dist, y: (o.y - s.y) / dist };
      return { o, gap: dist - extent(s, plan, u) - extent(o, plan, u) };
    })
    .filter((x) => x.gap < 0.3)
    .sort((a, b) => a.gap - b.gap)[0]?.o;
}

/** Which way off the picture something is: to the left, the right, or behind the camera. */
function offTo(eye: Eye, s: V2): string {
  const d = unit(eye.d);
  const v = { x: s.x - eye.at.x, y: s.y - eye.at.y };
  const r = rightOf(d);
  const angle = (Math.atan2(v.x * r.x + v.y * r.y, v.x * d.x + v.y * d.y) * 180) / Math.PI;
  return Math.abs(angle) > 135 ? 'behind the camera' : angle < 0 ? 'off to the left' : 'off to the right';
}

/** Where the place's front is: in the picture, and where across it, or off to which side. */
function frontLine(plan: Blocking, eye: Eye, r: Render, min: number): string {
  // A front named for something the picture already places ("the road") is said once, where it is.
  const same = plan.spots.find((s) => s.name && s.name.toLowerCase() === plan.front.toLowerCase());
  if (same && (r.seen.get(same.id)?.visible ?? 0) >= min) return '';
  const f = r.seen.get('front');
  if (f && f.visible >= min) return `${cap(across(f))}: ${plan.front}, the front of the place.`;
  const d = unit(eye.d);
  const toFront = { x: 0, y: -1 };
  const rr = rightOf(d);
  const angle = (Math.atan2(toFront.x * rr.x + toFront.y * rr.y, toFront.x * d.x + toFront.y * d.y) * 180) / Math.PI;
  return Math.abs(angle) <= 50
    ? `At the back of the picture: ${plan.front}.`
    : `Outside the picture, ${Math.abs(angle) > 135 ? 'behind the camera' : angle < 0 ? 'off to the left' : 'off to the right'}: ${plan.front}.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
