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
  /** With the one builder's `plan_facing` step: turned to what they face by an act of attending to it (continuity). */
  attending?: true;
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
  /**
   * How high a creature's body stands, in metres, where its look says how big it is (camera.ts
   * bodyHeight): set by the camera rules where water stands, and read only for what the water covers. A
   * whale is placed as a figure lying on the floor, and was said to be all of it under a metre of water.
   */
  height?: number;
  /**
   * What shape of body a person or creature has, where a reading of the dream says (with `height`, its height
   * standing): drawn at that size and so on the mock-up. None, a person's shape at a person's size.
   */
  body?: 'human' | 'four-legged' | 'bird' | 'fish' | 'other';
  /**
   * Drawn at a size the dream's words give it (sizes.ts, `sizes`): its ordinary size, as a creature's (`body`: the ants),
   * or one the dream sets in this moment (`moment`: a shrunken building, ant-sized Alina).
   */
  sized?: 'body' | 'moment';
  /**
   * A crowd moved onto the line from the dreamer's eyes to whom the moment sees past it (`crowd_between`): by their id.
   */
  past?: string;
  /**
   * How far a fixture's bottom is off the floor, in metres, where the place's words put it up a wall or on
   * the ceiling (camera.ts mountOf: "the high round window", "a clock on the wall"): set by the camera
   * rules. Without it every fixture stood on the floor, and deep water hid a window high in the wall.
   */
  above?: number;
  /**
   * Getting into or out of something at the instant, as the moment's typed act says ("climbs into" the boat): at its
   * side, half in, standing and facing into it (continuity.ts withClimbers, the camera rules). Drawn already sitting
   * in it, the dreamer was never climbing in (6081 m6, 30 Sep).
   */
  climbing?: { of: string; how: 'into' | 'out of' };
  /**
   * Where on what they ride they sit, as the scene's typed acts last said (continuity.ts withRiders, the camera rules):
   * in front for whoever pedals, steers or drives it, at the back for whoever "sits on the back of" it or behind the
   * other. Two on one bicycle sit one behind the other, and which one was left to the order of the plan.
   */
  rides?: 'front' | 'back';
  /**
   * A door or gate the record has open at the moment (the camera rules, continuity.ts withOpen): drawn on the mock-up
   * as its frame with the door swung back, the view going through it.
   */
  open?: boolean;
};

/** Where someone or something (a car, a boat) has moved to at a moment: its new spot, which way it faces, how they are. */
/**
 * Where someone or something is at a moment of the scene, when that differs from before; for a thing,
 * who holds it from then on ("" once it is put down): the boat the father hands over is his, then
 * theirs (lighthouse, 25 Sep).
 */
export type Move = { id: string; x: number; y: number; faces?: string; pose?: Spot['pose']; heldBy?: string };

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
  /**
   * Who and what its moments see only out past the place's edges, through a window or an opening,
   * by the side they are seen on: the tractor in the field below the lighthouse's round room. Never
   * on the plan: put on it, it stood inside the room by the window (lighthouse, 26 Sep).
   */
  outside?: Record<string, Side>;
  /** The thing this place is the inside of: the red tractor, for "the tractor cab". Never on the plan. */
  inside?: string;
  /**
   * How high water stands in the place at a moment, in metres, as the story record measures it (the
   * camera rules, camera.ts): what floats rides on it, and whoever is in it, and the camera at their
   * eyes rises with them. None where no water is measured.
   */
  water?: number;
  /** The water held under the level its words give, so a boat's riders fit under the ceiling: said high, never in metres. */
  waterCapped?: true;
};

/** A side of a place, for someone facing its front. */
export type Side = 'front' | 'back' | 'left' | 'right';

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
  // Facing what is on their own spot (what they hold, the corner they stand at) is no way at all:
  // they face the front. A way of no length turned the balloons and the camera to nowhere (25 Sep).
  if (!target || Math.hypot(target.x - spot.x, target.y - spot.y) < 0.05) return DIRECTIONS.front;
  return unit({ x: target.x - spot.x, y: target.y - spot.y });
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
/** How the dreamer's eyes are moved from where they are: a little each way, or right down to something small. */
export type Lean = 'back' | 'forward' | 'left' | 'right' | 'close';

/**
 * A camera with a height: someone's eyes, or the lens, and how it tilts (radians, down negative).
 * `lens` is its focal length in millimetres on a full frame; 24mm (HALF_VIEW) where not said.
 */
export type Eye = Camera & { height: number; pitch?: number; lean?: Lean; lens?: number };

/** The frame's shape: a storyboard's 16:9, or a phone's 9:16 with DREAMCHAT_FRAME=9:16 (the owner, 1 Oct). */
export const frameShape = (): '16:9' | '9:16' =>
  (process.env.DREAMCHAT_FRAME ?? '').trim() === '9:16' ? '9:16' : '16:9';

/** A vertical frame: its width is its short side, so a lens sees less across it and more up and down. */
export const upright = (): boolean => frameShape() === '9:16';

/**
 * Half the width of a lens's view, in degrees, on a full frame 36mm across its long side: across a vertical frame,
 * the short side's 20.25mm.
 */
export const halfViewOf = (eye: { lens?: number }) =>
  upright()
    ? (Math.atan(eye.lens ? (18 * 9) / 16 / eye.lens : Math.tan((HALF_VIEW * Math.PI) / 180) * (9 / 16)) * 180) /
      Math.PI
    : eye.lens
      ? (Math.atan(18 / eye.lens) * 180) / Math.PI
      : HALF_VIEW;

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
export function settle(
  plan: Blocking,
  /** With the camera rules: two riding something narrower than a metre (a bicycle) sit one behind the other. */
  opts: { tandem?: boolean } = {},
): Blocking {
  // A thing the plan gives no shape that someone sits on is their seat, as the previs draws it: a
  // sofa taken for a solid moved the dreamer off it, half a metre from where she sat (25 Sep).
  const sat = (t: Spot) =>
    !t.shape &&
    plan.spots.some((p) => p.kind === 'person' && !p.many && p.pose === 'sitting' && onFootprint(p, t, plan));
  const solids = plan.spots.filter((t) => solidOf(t) && !sat(t));
  // At a size of their own (`sizes`), solid to them is what stands well over a third of them: ant-sized Alina put on the
  // spot of a building shrunk to her size stood inside it, unseen, "going in at its door" (Shrunk m5).
  const solidTo = (s: Spot) =>
    s.sized && s.height && s.height < 1.74
      ? plan.spots.filter(
          (t) =>
            t.id !== s.id &&
            t.kind !== 'person' &&
            !t.many &&
            !t.heldBy &&
            (t.shape ?? 'block') === 'block' &&
            sizeOf(t)[2] > s.height! / 3 &&
            !sat(t),
        )
      : solids;
  const [rw, rd] = roomOf(plan);
  const free = (p: Vec, self: Spot) =>
    !plan.spots.some(
      (t) =>
        t.id !== self.id &&
        (solidOf(t) || t.shape === 'vehicle' || solidTo(self).includes(t)) &&
        onFootprint(p, t, plan, 0.1 * (self.sized && self.height && self.height < 1.74 ? self.height / 1.74 : 1)),
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
    const k = s.sized && s.height && s.height < 1.74 ? s.height / 1.74 : 1;
    const t =
      solidTo(s).find((b) => onFootprint(s, b, plan, -0.05 * k)) ??
      // Afloat (the camera rules' water), whoever stands in a boat stays in it: there is only water beside it.
      (s.pose === 'standing' && !plan.water ? vehicles.find((v) => onFootprint(s, v, plan, -0.05)) : undefined);
    if (!t) return s;
    // Round its edge, a little way out, every quarter metre: the nearest free spot.
    const [w, d] = sizeOf(t);
    const f = facing(t, plan);
    const r = rightOf(f);
    const m = 0.35 * k;
    const step = 0.25 * k;
    const round: Vec[] = [];
    for (let u = -w / 2 - m; u <= w / 2 + m + 1e-9; u += step)
      round.push({ x: u, y: d / 2 + m }, { x: u, y: -d / 2 - m });
    for (let v = -d / 2 - m; v <= d / 2 + m + 1e-9; v += step)
      round.push({ x: w / 2 + m, y: v }, { x: -w / 2 - m, y: v });
    const out = round
      .map((o) => ({ x: t.x + r.x * o.x + f.x * o.y, y: t.y + r.y * o.x + f.y * o.y }))
      .filter((p) => free(p, s))
      .sort((a, b) =>
        // At a size of their own, every spot round something small is as near: the one toward the middle of the place,
        // where a camera sees them, not behind it against the wall.
        k < 1
          ? Math.hypot(a.x - rw / 2, a.y - rd / 2) - Math.hypot(b.x - rw / 2, b.y - rd / 2)
          : Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y),
      )[0];
    return out ? { ...s, x: out.x, y: out.y } : s;
  });
  // Two people on one spot are side by side, across the way they face: in one car over the bridge,
  // the aunt hid the dreamer (25 Sep).
  const people = spots.filter((s) => s.kind === 'person' && !s.many);
  // At their own size (`sizes`): ant-sized Alina and the ants a few millimetres apart, not pushed off the counter.
  const kOf = (s: Spot) => (s.sized && s.height ? Math.min(1, s.height / 1.74) : 1);
  const done = new Set<string>();
  for (const a of people) {
    if (done.has(a.id)) continue;
    const together = people.filter((b) => !done.has(b.id) && Math.hypot(b.x - a.x, b.y - a.y) < 0.3 * kOf(a));
    together.forEach((b) => done.add(b.id));
    if (together.length < 2) continue;
    const f = facing(a, { ...plan, spots });
    const r = rightOf(f);
    const mid = { x: a.x, y: a.y };
    // On something too narrow for two abreast they ride one behind the other, the way it goes: two on one
    // bicycle were sat side by side, as on a bench (the read of every frozen prompt, 30 Sep).
    const narrow = opts.tandem
      ? vehicles.find((v) => sizeOf(v)[0] < 1 && together.every((b) => onFootprint(b, v, plan)))
      : undefined;
    // Along the way it faces, whichever way they turn on it.
    const along = narrow ? facing(narrow, plan) : r;
    // Whoever pedals or steers it in front, whoever sits on its back behind; the rest as the plan lists them.
    const rank = (b: Spot) => (b.rides === 'front' ? 0 : b.rides === 'back' ? 2 : 1);
    if (narrow) together.sort((a, b) => rank(a) - rank(b));
    together.forEach((b, k) => {
      const gap = 0.6 * Math.max(...together.map(kOf));
      const off = narrow ? ((together.length - 1) / 2 - k) * gap : (k - (together.length - 1) / 2) * gap;
      Object.assign(b, { x: mid.x + along.x * off, y: mid.y + along.y * off });
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
  const c = {
    x: people.reduce((a, s) => a + s.x, 0) / people.length,
    y: people.reduce((a, s) => a + s.y, 0) / people.length,
  };
  const look = unit(
    people.map((s) => facing(s, plan)).reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 }),
  );
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
