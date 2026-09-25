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
};

/** A place's size, across and deep, in metres. */
export const roomOf = (plan: Pick<Blocking, 'room'>): [number, number] => plan.room ?? [10, 10];

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

/** Which side of the room a direction points at, in plain words. */
export function wall(d: Vec, front: string): string {
  if (d.y < -0.7) return front;
  if (d.y > 0.7) return 'the back of the room';
  return d.x < 0 ? 'the left side of the room' : 'the right side of the room';
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
