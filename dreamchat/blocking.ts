// Blocking: where everyone and everything is in a scene, decided before anything is drawn, the way a
// storyboard artist draws a floor plan first. Every camera is placed on it, and what a camera sees
// (who is on the picture's left or right, what is close, what is behind it and out of view) is
// worked out in code: here, and by rendering it (previs.ts). Asked to imagine the dreamer's own view
// of a room seen from the front, the best vision models put her friend and the roller coaster on
// the wrong side of her, and the image model drew the view from the aisle instead of her seat
// (24 Sep): turning a view around is what code does exactly and models do not.
//
// The plan is seen from above. x runs across the room, from its left wall (0) to its right wall
// (10), for someone facing its front; y runs from the front (0) to the back (10).

/** Where someone or something is, and which way a person faces. */
export type Spot = {
  id: string;
  x: number;
  y: number;
  /** "front", "back", "left", "right", or the id of what they face. People face the front unless said. */
  faces?: string;
  /** Many alike, spread about it (a crowd, the rows of an audience): said as a group. */
  many?: boolean;
  /** A person (drawn as a mannequin in the previs) or a thing (a block of its size). */
  kind?: 'person' | 'thing';
  /** How a person is: sitting, standing or lying. */
  pose?: 'sitting' | 'standing' | 'lying';
  /** A thing's size in metres: across (side to side as it faces), deep, and high. */
  size?: [number, number, number];
  /**
   * What a thing is to whoever is at it: sat on ("seat": a sofa, a bench, a bed), ridden in
   * ("vehicle": a car, a boat, a cart), stood and walked on ("ground": a street, a bridge, a rug, a
   * stage), climbed ("steps": stairs), or a solid ("block", where not said). With every thing a
   * block, the dreamer sat "on" the balloons and the house, the aunt sat "on" her car, and a street
   * a metre high hid the juggler standing in it (25 Sep).
   */
  shape?: Shape;
  /** A thing someone holds or carries: who holds it. It is in their hands, wherever they are. */
  heldBy?: string;
  /** How many a crowd is, where the dream says: "a couple of people" is 2. */
  count?: number;
  /** How far a crowd spreads, in metres: across the way they face, and deep. */
  spread?: [number, number];
  /**
   * A fixture of the place itself (an autoclave, a stove, a window): no one's sketch, drawn as the
   * place's sketch shows it, and there from the start. Its name is what it is called.
   */
  fixture?: boolean;
  name?: string;
};

/** Where someone or something (a car, a boat) has moved to at a moment: its new spot, which way it faces, how they are. */
export type Move = { id: string; x: number; y: number; faces?: string; pose?: Spot['pose'] };

/**
 * A scene's floor plan: what its front is, and where everyone and everything is. Indoors, the plan's
 * edges are the walls (and `ceiling` metres up, the ceiling); outdoors, the ground runs on. People
 * who move during the scene have a move at each moment they are somewhere else, by moment id.
 */
export type Blocking = {
  front: string;
  spots: Spot[];
  indoors?: boolean;
  ceiling?: number;
  /** How big the place is, in metres: across and deep. 10 by 10 where not said; a tiny room is 2 by 2. */
  room?: [number, number];
  moves?: Record<string, Move[]>;
  /**
   * The other places the scene moves through, each with its own plan, by place id: up the stairs,
   * down a hallway, into a tiny room almost filled by its stove. One plan for all three made the
   * tiny room ten metres across (25 Sep).
   */
  places?: Record<string, Blocking>;
  /**
   * What each moment's camera faces on this plan, by moment id, as Jev read it from the moment's
   * words: a spot's id, "front", or "missing" or "beyond" when it is not on the plan.
   */
  looks?: Record<string, string>;
};

/** A place's size, across and deep, in metres. */
export const roomOf = (plan: Pick<Blocking, 'room'>): [number, number] => plan.room ?? [10, 10];

/** What a thing is to whoever is at it (see `Spot.shape`). */
export type Shape = 'block' | 'seat' | 'vehicle' | 'ground' | 'steps';
export const SHAPES: readonly Shape[] = ['block', 'seat', 'vehicle', 'ground', 'steps'];

/**
 * A thing's size, or where the plan gives none, an ordinary one for its shape: a cube a metre
 * across stood in for a street, and buried the juggler standing in it (25 Sep).
 */
export function sizeOf(s: Spot): [number, number, number] {
  if (s.size) return s.size;
  const ordinary: Record<Shape, [number, number, number]> = {
    block: [1, 1, 1],
    seat: [1.8, 0.9, 0.85],
    vehicle: [4, 1.8, 1.4],
    ground: [4, 4, 0.05],
    steps: [1.2, 3, 2.5],
  };
  return ordinary[s.shape ?? 'block'];
}

type Vec = { x: number; y: number };

export const DIRECTIONS: Record<string, Vec> = {
  front: { x: 0, y: -1 },
  back: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const unit = (v: Vec): Vec => {
  const n = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / n, y: v.y / n };
};
/** Seen from above, the right hand of someone facing `d`. */
export const rightOf = (d: Vec): Vec => ({ x: -d.y, y: d.x });

/** The way a spot faces, as a direction on the plan. */
export function facing(spot: Spot, plan: Blocking): Vec {
  const to = spot.faces ?? 'front';
  if (DIRECTIONS[to]) return DIRECTIONS[to];
  const target = plan.spots.find((s) => s.id === to);
  return target ? unit({ x: target.x - spot.x, y: target.y - spot.y }) : DIRECTIONS.front;
}

/** Where something is from a camera at `from` facing `d`: its angle (negative to the left) and distance. */
export function bearing(from: Vec, d: Vec, to: Vec): { angle: number; distance: number } {
  const v = { x: to.x - from.x, y: to.y - from.y };
  const ahead = v.x * d.x + v.y * d.y;
  const right = v.x * rightOf(d).x + v.y * rightOf(d).y;
  return { angle: (Math.atan2(right, ahead) * 180) / Math.PI, distance: Math.hypot(v.x, v.y) };
}

/** A camera: where it stands and which way it faces. */
export type Camera = { at: Vec; d: Vec };

/** Which way someone leans, from where they sit or stand, to see past someone close. */
export type Lean = 'back' | 'forward' | 'left' | 'right';

/**
 * A camera with a height: someone's eyes, or the lens, and how it tilts (radians, down negative).
 * `lens` is its focal length in millimetres on a full frame; 24mm (HALF_VIEW) where not said.
 */
export type Eye = Camera & { height: number; pitch?: number; lean?: Lean; lens?: number };

/** Half the width of a lens's view, in degrees, on a full frame 36mm across. */
export const halfViewOf = (eye: { lens?: number }) =>
  eye.lens ? (Math.atan(18 / eye.lens) * 180) / Math.PI : HALF_VIEW;

/** Half the width of a 16:9 frame's view, in degrees (a 24mm lens): what is further round is out of it. */
export const HALF_VIEW = 38;

/**
 * Which side of the place a direction points at, in plain words: of the room indoors, of the place
 * outdoors. A camera on a village street "looked toward the back of the room" (25 Sep).
 */
export function wall(d: Vec, front: string, indoors = true): string {
  const of = indoors ? 'of the room' : 'of the place';
  if (d.y < -0.7) return front;
  if (d.y > 0.7) return indoors ? 'the back of the room' : `the far side of the place, away from ${front}`;
  return d.x < 0 ? `the left side ${of}` : `the right side ${of}`;
}

/** Whether a point is on a thing's footprint, `margin` metres round it included. */
export function onFootprint(p: Vec, t: Spot, plan: Blocking, margin = 0.05): boolean {
  const [w, d] = sizeOf(t);
  const f = facing(t, plan);
  const r = rightOf(f);
  const v = { x: p.x - t.x, y: p.y - t.y };
  return Math.abs(v.x * r.x + v.y * r.y) <= w / 2 + margin && Math.abs(v.x * f.x + v.y * f.y) <= d / 2 + margin;
}

/** A solid no one can be inside: a thing that is neither sat on, ridden in, stood on nor held. */
const solidOf = (t: Spot) =>
  t.kind !== 'person' && !t.many && !t.heldBy && (t.shape ?? 'block') === 'block' && sizeOf(t)[2] > 0.5;

/**
 * The plan with everyone where a person can be: nobody inside something solid, and what someone
 * holds in their hands. Someone put in the middle of a house (dropped off "at the house") stands
 * just outside it instead, at the nearest spot free of anything solid or ridden in, as close as can
 * be to where the plan had them; the render hid them inside it (25 Sep).
 */
export function settle(plan: Blocking): Blocking {
  // A thing the plan gives no shape that someone sits on is their seat, as the previs draws it: a
  // sofa taken for a solid moved the dreamer off it, half a metre from where she sat (25 Sep).
  const sat = (t: Spot) =>
    !t.shape && plan.spots.some((p) => p.kind === 'person' && !p.many && p.pose === 'sitting' && onFootprint(p, t, plan));
  const solids = plan.spots.filter((t) => solidOf(t) && !sat(t));
  const [rw, rd] = roomOf(plan);
  const free = (p: Vec, self: Spot) =>
    !plan.spots.some(
      (t) => t.id !== self.id && (solidOf(t) || t.shape === 'vehicle') && onFootprint(p, t, plan, 0.1),
    ) &&
    (!plan.indoors || (p.x >= 0.2 && p.x <= rw - 0.2 && p.y >= 0.2 && p.y <= rd - 0.2));
  // Someone standing is beside a car, not in it: dropped off at the house, the dreamer was said to
  // be in the car still (25 Sep).
  const vehicles = plan.spots.filter((t) => t.shape === 'vehicle');
  const spots = plan.spots.map((s0) => {
    const s = { ...s0 };
    if (s.kind !== 'person' || s.many) return s;
    const riding = s.pose !== 'standing' ? vehicles.find((v) => onFootprint(s, v, plan)) : undefined;
    // Whoever rides in something faces the way it goes: the dreamer and the aunt sat back to back in
    // her car over the bridge (25 Sep).
    if (riding) return { ...s, faces: riding.faces ?? 'front' };
    const t =
      solids.find((b) => onFootprint(s, b, plan, -0.05)) ??
      (s.pose === 'standing' ? vehicles.find((v) => onFootprint(s, v, plan, -0.05)) : undefined);
    if (!t) return s;
    // Round its edge, a little way out, every quarter metre: the nearest free spot.
    const [w, d] = sizeOf(t);
    const f = facing(t, plan);
    const r = rightOf(f);
    const m = 0.35;
    const round: Vec[] = [];
    for (let u = -w / 2 - m; u <= w / 2 + m + 1e-9; u += 0.25) round.push({ x: u, y: d / 2 + m }, { x: u, y: -d / 2 - m });
    for (let v = -d / 2 - m; v <= d / 2 + m + 1e-9; v += 0.25) round.push({ x: w / 2 + m, y: v }, { x: -w / 2 - m, y: v });
    const out = round
      .map((o) => ({ x: t.x + r.x * o.x + f.x * o.y, y: t.y + r.y * o.x + f.y * o.y }))
      .filter((p) => free(p, s))
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    return out ? { ...s, x: out.x, y: out.y } : s;
  });
  // Two people on one spot are side by side, across the way they face: in one car over the bridge,
  // the aunt hid the dreamer (25 Sep).
  const people = spots.filter((s) => s.kind === 'person' && !s.many);
  const done = new Set<string>();
  for (const a of people) {
    if (done.has(a.id)) continue;
    const together = people.filter((b) => !done.has(b.id) && Math.hypot(b.x - a.x, b.y - a.y) < 0.3);
    together.forEach((b) => done.add(b.id));
    if (together.length < 2) continue;
    const r = rightOf(facing(a, { ...plan, spots }));
    const mid = { x: a.x, y: a.y };
    together.forEach((b, k) => {
      const off = (k - (together.length - 1) / 2) * 0.6;
      Object.assign(b, { x: mid.x + r.x * off, y: mid.y + r.y * off });
    });
  }
  // What someone holds is where they are.
  const held = spots.map((s) => {
    const by = s.heldBy ? spots.find((o) => o.id === s.heldBy) : undefined;
    return by ? { ...s, x: by.x, y: by.y } : s;
  });
  return { ...plan, spots: held };
}

/**
 * The camera for a moment seen from outside: in front of the people in view, facing them, so their
 * faces are seen; or, when the moment faces the room's front, behind them, facing it.
 */
export function outsideCamera(plan: Blocking, ids: string[], facesFront: boolean): Camera | null {
  const people = plan.spots.filter((s) => ids.includes(s.id) && !s.many);
  if (!people.length) return null;
  const c = { x: people.reduce((a, s) => a + s.x, 0) / people.length, y: people.reduce((a, s) => a + s.y, 0) / people.length };
  const look = unit(people.map((s) => facing(s, plan)).reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 }));
  // Facing them: stand where they look, and look back at them. Facing the front: stand behind them.
  const d = facesFront ? look : { x: -look.x, y: -look.y };
  return { at: { x: c.x - d.x * 4, y: c.y - d.y * 4 }, d };
}

/** Near, beyond or far, by distance on the plan (about a metre a unit). */
export const reach = (distance: number) => (distance < 1.6 ? 'close' : distance < 4 ? 'a little way off' : 'far off');

/** Everyone and everything a camera from outside sees, left to right across the picture. */
export function outsideOrder(plan: Blocking, ids: string[], facesFront: boolean): string[] {
  const cam = outsideCamera(plan, ids, facesFront);
  if (!cam) return [];
  return plan.spots
    .filter((s) => ids.includes(s.id))
    .map((s) => ({ id: s.id, ...bearing(cam.at, cam.d, s) }))
    .sort((a, b) => a.angle - b.angle)
    .map((b) => b.id);
}
