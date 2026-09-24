// Blocking: where everyone and everything is in a scene, decided before anything is drawn, the way a
// storyboard artist draws a floor plan first. Every camera is placed on it, and what a camera sees
// (who is on the picture's left or right, what is close, what is behind it and out of view) is
// worked out here, in code. Asked to imagine the dreamer's own view of a room seen from the front,
// the best vision models put her friend and the roller coaster on the wrong side of her, and the
// image model drew the view from the aisle instead of her seat (24 Sep): turning a view around is
// what code does exactly and models do not.
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
};

/** A scene's floor plan: what its front is, and where everyone and everything is. */
export type Blocking = { front: string; spots: Spot[] };

type Vec = { x: number; y: number };

const DIRECTIONS: Record<string, Vec> = {
  front: { x: 0, y: -1 },
  back: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const unit = (v: Vec): Vec => {
  const n = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / n, y: v.y / n };
};
/** Seen from above, the right hand of someone facing `d`. */
const rightOf = (d: Vec): Vec => ({ x: -d.y, y: d.x });

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

/** Half the width of a 16:9 frame's view, in degrees: what is further round is out of it. */
const HALF_VIEW = 38;

/** Everything a camera sees, left to right across the picture, and what it cannot see. */
export function framing(cam: Camera, plan: Blocking, ids: string[]): { inView: string[]; outOfView: string[] } {
  const seen = plan.spots
    .filter((s) => ids.includes(s.id))
    .map((s) => ({ s, ...bearing(cam.at, cam.d, s) }))
    .filter((b) => b.distance > 0.01);
  return {
    inView: seen
      .filter((b) => Math.abs(b.angle) <= HALF_VIEW || b.s.many)
      .filter((b) => !b.s.many || Math.abs(b.angle) <= 90)
      .sort((a, b) => a.angle - b.angle)
      .map((b) => b.s.id),
    outOfView: seen.filter((b) => (b.s.many ? Math.abs(b.angle) > 90 : Math.abs(b.angle) > HALF_VIEW)).map((b) => b.s.id),
  };
}

/** Which side of the room a direction points at, in plain words. */
function wall(d: Vec, front: string): string {
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

/** The camera for a moment through the dreamer's own eyes, turned toward what it faces. */
export function dreamerCamera(plan: Blocking, dreamer: string, toward?: string): Camera | null {
  const me = plan.spots.find((s) => s.id === dreamer);
  if (!me) return null;
  const target = toward ? plan.spots.find((s) => s.id === toward) : undefined;
  const d = target ? unit({ x: target.x - me.x, y: target.y - me.y }) : facing(me, plan);
  return { at: { x: me.x, y: me.y }, d };
}

/** Near, beyond or far, by distance on the plan (about a metre a unit). */
const reach = (distance: number) => (distance < 1.6 ? 'close' : distance < 4 ? 'a little way off' : 'far off');

/** Where in the picture something at this angle is. */
const place = (angle: number) =>
  Math.abs(angle) <= 10 ? 'in the middle' : angle < 0 ? (angle < -25 ? 'at the left edge' : 'left of the middle') : angle > 25 ? 'at the right edge' : 'right of the middle';

/**
 * What the dreamer sees through their own eyes, in words an illustrator can draw from: where the
 * camera looks, who and what is where in the frame from nearest to farthest, and what is outside
 * the picture, the room's front included. Said in one sentence with the front left out, the view
 * came back facing the screen, the default for a theater, instead of turned to the roller coaster
 * beside her (24 Sep).
 */
export function dreamerView(
  plan: Blocking,
  dreamer: string,
  toward: string | undefined,
  ids: string[],
  name: (id: string) => string,
): { text: string; inPicture: string[] } | null {
  const cam = dreamerCamera(plan, dreamer, toward);
  const me = plan.spots.find((s) => s.id === dreamer);
  if (!cam || !me) return null;
  // What is right where they are (the seat under them) is where they are, not something before them.
  const at = plan.spots.filter((s) => s.id !== dreamer && !s.many && Math.hypot(s.x - me.x, s.y - me.y) < 0.9).map((s) => s.id);
  const others = ids.filter((id) => id !== dreamer && !at.includes(id));
  // The room's front is a whole side of it: in the picture when the camera looks that way, else
  // off to one side of it or behind it.
  const front = bearing({ x: 0, y: 0 }, cam.d, DIRECTIONS.front).angle;
  const withFront = plan;
  const called = name;
  const { inView, outOfView } = framing(cam, plan, others);
  const own = facing(me, plan);
  const turn = bearing({ x: 0, y: 0 }, own, cam.d).angle;
  const turned =
    Math.abs(turn) < 20
      ? 'looking straight ahead'
      : Math.abs(turn) > 150
        ? 'turned right round'
        : `turned to their ${turn < 0 ? 'left' : 'right'}`;
  const seen = inView
    .map((id) => {
      const s = withFront.spots.find((x) => x.id === id)!;
      const b = bearing(cam.at, cam.d, s);
      return { id, b, many: !!s.many };
    })
    .sort((a, b) => a.b.distance - b.b.distance);
  const sentences = [
    `The camera is the dreamer's eyes${at.length ? `, on ${at.map(name).join(' and ')}` : ''}, ${turned}${toward ? `, toward ${name(toward)}` : ''}: it looks toward ${wall(cam.d, plan.front)}.`,
    ...seen.map((x, i) => {
      const where = place(x.b.angle);
      const how = reach(x.b.distance);
      const lead = i === 0 ? 'Nearest' : i === seen.length - 1 && seen.length > 1 ? 'Farthest' : 'Then';
      return `${lead}, ${how}, ${where} of the picture: ${called(x.id)}${x.many ? ', many of them' : ''}.`;
    }),
    ...outOfView.map((id) => {
      const s = withFront.spots.find((x) => x.id === id)!;
      const b = bearing(cam.at, cam.d, s);
      const side = Math.abs(b.angle) > 135 ? 'behind the camera' : b.angle < 0 ? 'off to the left' : 'off to the right';
      return `Outside the picture, ${side}: ${called(id)}.`;
    }),
    Math.abs(front) <= 50
      ? `At the back of the picture: ${plan.front}.`
      : `Outside the picture, ${Math.abs(front) > 135 ? 'behind the camera' : front < 0 ? 'off to the left' : 'off to the right'}: ${plan.front}.`,
  ];
  return { text: sentences.join(' '), inPicture: [...at, ...inView] };
}

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
