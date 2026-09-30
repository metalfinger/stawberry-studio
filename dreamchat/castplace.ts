// The cast reading (cast.ts) put on the floor plan, with the one builder's `cast_named` step: what the moments need
// drawn and the breakdown never cast (the red tractor the dreamer rides in, the jellyfish ahead in the sky, a crowd of
// boats) placed by what the dream's words say it is by, at the size they give; each person and creature at its own
// height and shape; and the fixtures a place's own words name that its plan lacks (windows along each side, rows of
// seats). Pure: the plan and the reading in, the plan out. Nothing already on the plan moves.
import type { CastBody, CastFixture, CastReading, CastThing } from './cast-types';
import { type Blocking, facing, onFootprint, rightOf, roomOf, type Side, sizeOf, type Spot, unit } from './blocking';

type V2 = { x: number; y: number };

/** One of the pieces a place's words give (a window along a side, a row of seats): `cf1`, `cf2` … */
export const isCastPiece = (s: { id: string }) => /^cf\d+$/.test(s.id);

/** The things the reading casts, with the ids it gives them (c1, c2 …; a reading kept before ids, in its order). */
export function castThings(reading: CastReading): { id: string; t: CastThing }[] {
  return reading.things
    .filter((t) => t.kind !== 'weather' && t.kind !== 'matter')
    .map((t, i) => ({ id: t.id ?? `c${i + 1}`, t }));
}

/** The last word of a name, the thing itself ("tractor" of "the red tractor"). */
const headOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/^(?:the|a|an|some)\s+/, '')
    .split(/\s+/)
    .at(-1)
    ?.replace(/[^a-z-]/g, '') ?? '';

/** How big things the dream compares with are, across, deep and tall, in metres. */
const LIKE: [RegExp, [number, number, number]][] = [
  [/\bbus(?:es)?\b/, [2.5, 11, 3.2]],
  [/\bhouses?\b/, [8, 8, 6]],
  [/\bbuildings?\b/, [10, 10, 15]],
  [/\btrucks?\b|\blorr(?:y|ies)\b/, [2.5, 8, 3.5]],
  [/\bcars?\b/, [1.8, 4.5, 1.5]],
  [/\belephants?\b/, [1.5, 5, 3]],
  [/\bhorses?\b/, [0.6, 2.2, 1.6]],
  [/\btrees?\b/, [3, 3, 8]],
  [/\b(?:person|man|woman|people)\b/, [0.5, 0.4, 1.7]],
  [/\bdogs?\b/, [0.3, 0.8, 0.6]],
  [/\bcats?\b/, [0.2, 0.5, 0.3]],
  [/\b(?:hands?|palms?|fists?)\b/, [0.1, 0.2, 0.05]],
  [/\bmice\b|\bmouse\b/, [0.05, 0.1, 0.05]],
];

/** A kind's size where the words give none. */
const KIND_SIZE: Record<CastThing['kind'], [number, number, number]> = {
  vehicle: [1.8, 3.5, 2.2],
  creature: [0.6, 1.2, 0.8],
  thing: [0.6, 0.6, 0.6],
  weather: [0, 0, 0],
  matter: [0, 0, 0],
};

/**
 * A cast thing's size from the dream's own words, across, deep and tall: a measure ("about 30 feet long"), a thing
 * it is as big as ("as big as a bus"), or a word for very big or small against its kind's size.
 */
export function sizeFromWords(words: string | null, kind: CastThing['kind']): [number, number, number] {
  const base = KIND_SIZE[kind];
  const cm = (x: number[]) => x.map((v) => Math.round(v * 100) / 100) as [number, number, number];
  const w = (words ?? '').toLowerCase();
  if (!w) return base;
  const m = w.match(/(\d+(?:\.\d+)?)\s*-?\s*(feet|foot|ft|metres?|meters?|m)\b(?:\s+(long|tall|high|wide|across))?/);
  if (m) {
    const n = Number(m[1]) * (/^f/.test(m[2]) ? 0.3048 : 1);
    if (m[3] === 'tall' || m[3] === 'high') return cm([base[0] * (n / base[2]), base[1] * (n / base[2]), n]);
    // A length: as long as that, as wide in proportion, and never taller than a quarter of it (a whale 30 feet long).
    const k = n / base[1];
    return cm([base[0] * k, n, Math.min(base[2] * k, n / 4)]);
  }
  const compared = /\b(?:as (?:big|large|tall|small|tiny) as|size of|-sized|sized)\b/.test(w);
  const like = LIKE.find(([re]) =>
    re.test(w.replace(/.*\b(?:as (?:big|large|tall|small|tiny) as|size of|sized like)\b/, '')),
  );
  if (like && compared) return like[1];
  if (/\b(?:huge|giant|gigantic|enormous|massive|colossal|immense|towering|vast)\b/.test(w))
    return cm(base.map((x) => x * 3));
  if (/\b(?:tiny|little|small|miniature)\b/.test(w)) return cm(base.map((x) => x * 0.4));
  return base;
}

/** Where the dream's side words put something against what it is by: a way on the plan, or the same spot. */
function wayOf(side: string | null, by: Spot, plan: Blocking): V2 | 'same' {
  const f = facing(by, plan);
  const r = rightOf(f);
  const w = (side ?? '').toLowerCase();
  if (/\b(?:under|beneath|below|underneath|in|inside|on|aboard|within)\b/.test(w)) return 'same';
  if (/\bbehind\b/.test(w)) return { x: -f.x, y: -f.y };
  if (/\bleft\b/.test(w)) return { x: -r.x, y: -r.y };
  if (/\bright\b/.test(w)) return r;
  if (/\b(?:beside|next to|by|alongside)\b/.test(w)) return r;
  return f;
}

/** Whether a moment's words have someone riding, driving or sitting in it (by its head word): it is under them. */
const ridden = (words: string, head: string) =>
  !!head &&
  (new RegExp(
    `\\b(?:ride|rides|riding|rode|drive|drives|driving|drove|sit|sits|sitting|sat|climb|climbs|climbing|in the cab of|aboard)\\b[^.;,]*\\b${head}`,
  ).test(words.toLowerCase()) ||
    // "The dreamer is in the tractor, sitting next to the driver" (lighthouse-first m8).
    new RegExp(
      `\\b(?:is|are|was|were|sits?|sitting|stays?) (?:now )?in (?:the |a |an |their |his |her )?(?:\\w+ )?${head}\\b`,
    ).test(words.toLowerCase()));

/**
 * The plan with the reading's things placed that this moment shows in its place: by what the words put each by (its
 * `near`, else the dreamer), the way its side words say, clear of what is there already, at the size its words give; a
 * crowd as many; a vehicle someone rides in under them. What it shows out past the place goes outside, on the side
 * its words give or the window it is seen through. Nothing already on the plan moves.
 */
export function withCastSpots(
  plan: Blocking,
  reading: CastReading,
  moment: { id: string; action: string; visual_point?: string | null },
  dreamerId?: string,
): Blocking {
  const spots = [...plan.spots];
  const outside: Record<string, Side> = { ...(plan.outside ?? {}) };
  const [rw, rd] = plan.indoors ? roomOf(plan) : [Infinity, Infinity];
  const words = [moment.action, moment.visual_point ?? ''].join('. ');
  for (const { id, t } of castThings(reading)) {
    const here = t.moments.find((m) => m.id === moment.id);
    if (!here || spots.some((s) => s.id === id)) continue;
    if (here.where === 'beyond') {
      const window = /\bwindow/.test((t.side ?? '').toLowerCase())
        ? spots.find((s) => s.fixture && /\bwindow/i.test(s.name ?? ''))
        : undefined;
      const w = (t.side ?? '').toLowerCase();
      outside[id] = window
        ? sideOfWall(window, plan)
        : /\bleft\b/.test(w)
          ? 'left'
          : /\bright\b/.test(w)
            ? 'right'
            : /\bbehind\b/.test(w)
              ? 'back'
              : 'front';
      continue;
    }
    const by = spots.find((s) => s.id === (t.near ?? '')) ?? spots.find((s) => s.id === dreamerId);
    const size = sizeFromWords(t.size ?? t.look, t.kind);
    const shape = t.kind === 'vehicle' ? ('vehicle' as const) : undefined;
    // Ridden: the words put someone in or on it, or whoever it is by sits with nothing under them to sit on. The driver
    // and the dreamer sat in the open field of affd m9 as the tractor "drives slowly" beside them, empty.
    const sitsOnNothing = (q: Spot) =>
      q.kind === 'person' &&
      !q.many &&
      q.pose === 'sitting' &&
      !plan.spots.some(
        (o) =>
          o.kind !== 'person' && !o.heldBy && o.shape !== 'ground' && o.shape !== 'steps' && onFootprint(q, o, plan),
      );
    const seatless = !!by && sitsOnNothing(by);
    const way = by
      ? t.kind === 'vehicle' && (ridden(words, headOf(t.name)) || seatless)
        ? 'same'
        : wayOf(t.side, by, plan)
      : 'same';
    // On or at something the place has ("at a table", "on the shelf"): on it, at its edge nearest whoever it is by, where
    // the mock-up rests it on top. The little boats the father folds "at a table" stood a metre past the table, out of
    // the picture of him folding them (affd m4, 30 Sep).
    const onWhat = /\b(?:on|at|upon|atop)\s+(?:the |a |an |his |her |their |its )?([a-z][a-z -]*)/.exec(
      (t.side ?? '').toLowerCase(),
    );
    const surface =
      t.kind !== 'vehicle' && onWhat
        ? spots.find(
            (s) =>
              s.kind !== 'person' &&
              !s.heldBy &&
              !s.many &&
              !!headOf(s.name ?? '') &&
              headOf(onWhat[1]) === headOf(s.name ?? ''),
          )
        : undefined;
    const from = by ?? { x: plan.indoors ? rw / 2 : 0, y: plan.indoors ? rd / 2 : 0 };
    // Ridden, under everyone sitting on nothing beside whoever it is by, so the driver is in it too.
    const aboard =
      way === 'same' && t.kind === 'vehicle' && by
        ? plan.spots.filter((q) => q.id === by.id || (sitsOnNothing(q) && Math.hypot(q.x - by.x, q.y - by.y) <= 1.5))
        : [];
    let at: V2 = aboard.length
      ? {
          x: aboard.reduce((a, q) => a + q.x, 0) / aboard.length,
          y: aboard.reduce((a, q) => a + q.y, 0) / aboard.length,
        }
      : { x: from.x, y: from.y };
    if (surface) {
      const f = facing(surface, plan);
      const r = rightOf(f);
      const [sw, sd] = sizeOf(surface);
      const v = { x: from.x - surface.x, y: from.y - surface.y };
      const clamp = (n: number, half: number) => Math.max(-half, Math.min(half, n));
      const a = clamp(v.x * r.x + v.y * r.y, Math.max(0, sw / 2 - size[0] / 2 - 0.05));
      const b = clamp(v.x * f.x + v.y * f.y, Math.max(0, sd / 2 - size[1] / 2 - 0.05));
      at = { x: surface.x + r.x * a + f.x * b, y: surface.y + r.y * a + f.y * b };
    } else if (way !== 'same') {
      const d = unit(way);
      const step = Math.max(1.2, (sizeOf(by as Spot)[1] + size[1]) / 2 + 0.5);
      at = { x: from.x + d.x * step, y: from.y + d.y * step };
      // Clear of what stands there already, further the same way.
      for (let k = 0; k < 8 && spots.some((s) => !s.heldBy && Math.hypot(s.x - at.x, s.y - at.y) < 0.8); k++)
        at = { x: at.x + d.x * 0.6, y: at.y + d.y * 0.6 };
    }
    if (plan.indoors) at = { x: Math.min(rw - 0.3, Math.max(0.3, at.x)), y: Math.min(rd - 0.3, Math.max(0.3, at.y)) };
    spots.push({
      id,
      kind: 'thing',
      name: t.name,
      x: Math.round(at.x * 100) / 100,
      y: Math.round(at.y * 100) / 100,
      size,
      ...(shape ? { shape } : {}),
      ...(by?.faces ? { faces: by.faces } : {}),
      ...(t.many
        ? { many: true, count: t.many }
        : /\b(?:crowd|flock|herd|swarm|shoal|school of|many|lots of)\b/i.test(t.name)
          ? { many: true }
          : {}),
    });
  }
  return { ...plan, spots, ...(Object.keys(outside).length ? { outside } : {}) };
}

/** Which wall a fixture stands by: the nearest. */
function sideOfWall(s: Spot, plan: Blocking): Side {
  const [rw, rd] = roomOf(plan);
  const d = [
    ['front', s.y] as const,
    ['back', rd - s.y] as const,
    ['left', s.x] as const,
    ['right', rw - s.x] as const,
  ].sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

/** Each cast person and creature at the height and in the shape the reading gives: drawn so (previs figure). */
export function withCastBodies(plan: Blocking, bodies: CastBody[]): Blocking {
  if (!bodies.length) return plan;
  const by = new Map(bodies.map((b) => [b.id, b]));
  return {
    ...plan,
    spots: plan.spots.map((s) => {
      const b = by.get(s.id);
      return b ? { ...s, height: b.height_m, body: b.shape } : s;
    }),
  };
}

/**
 * The fixtures the place's own words name that its plan lacks, on the walls and floor they say: windows (or doors)
 * along a side, up the wall; rows of seats or desks facing the front, split by an aisle where one is named. Only
 * indoors, only where the plan has none of that name.
 */
export function withCastFixtures(plan: Blocking, fixtures: CastFixture[], placeId: string): Blocking {
  if (!plan.indoors) return plan;
  const mine = fixtures.filter((f) => f.place === placeId);
  if (!mine.length) return plan;
  const [rw, rd] = roomOf(plan);
  const spots = [...plan.spots];
  const has = (head: string) =>
    spots.some(
      (s) => headOf(s.name ?? '') === head || headOf(s.name ?? '').replace(/s$/, '') === head.replace(/s$/, ''),
    );
  const aisle = mine.some((f) => f.kind === 'aisle');
  let n = 0;
  const id = () => `cf${++n}`;
  for (const f of mine) {
    const head = headOf(f.name);
    if (!head || has(head)) continue;
    const w = (f.where ?? f.words).toLowerCase();
    const walls: Side[] = /\b(?:each|both|either) side|\bsides\b/.test(w)
      ? ['left', 'right']
      : /\bleft\b/.test(w)
        ? ['left']
        : /\bright\b/.test(w)
          ? ['right']
          : /\bback\b|\brear\b/.test(w)
            ? ['back']
            : /\bfront\b/.test(w)
              ? ['front']
              : ['left', 'right'];
    // Never on top of anyone: a row of desks laid where the dreamer stands buried them (30 Sep).
    const clear = (x: number, y: number, sw: number, sd: number) =>
      !spots.some(
        (o) => o.kind === 'person' && !o.many && Math.abs(o.x - x) < sw / 2 + 0.3 && Math.abs(o.y - y) < sd / 2 + 0.3,
      );
    const seating = /\b(?:seat|desk|bench|pew|table|chair|stool)/.test(head);
    if (f.kind === 'opening') {
      const door = /\bdoor/.test(head);
      for (const wall of walls) {
        const along = wall === 'left' || wall === 'right' ? rd : rw;
        const count = Math.max(1, Math.min(8, f.count ?? Math.max(2, Math.floor(along / 3))));
        for (let i = 0; i < count; i++) {
          const u = ((i + 0.5) / count) * along;
          const at =
            wall === 'left'
              ? { x: 0.05, y: u }
              : wall === 'right'
                ? { x: rw - 0.05, y: u }
                : wall === 'front'
                  ? { x: u, y: 0.05 }
                  : { x: u, y: rd - 0.05 };
          spots.push({
            id: id(),
            kind: 'thing',
            fixture: true,
            // Each one of them: "a window", never the row's name bare ("Outside the picture, off to the left: window").
            name: `a ${head.replace(/s$/, '')}`,
            x: Math.round(at.x * 100) / 100,
            y: Math.round(at.y * 100) / 100,
            size:
              wall === 'left' || wall === 'right'
                ? [0.1, door ? 1 : 1.1, door ? 2.1 : 1.2]
                : [door ? 1 : 1.1, 0.1, door ? 2.1 : 1.2],
            ...(door ? {} : { above: 1 }),
          });
        }
      }
    } else if (f.kind === 'row' && !seating) {
      // Lockers, shelves and cabinets stand along the walls the words give, not across the floor: rows of lockers
      // laid across the corridor hid the dreamer and the door (30 Sep).
      for (const wall of walls) {
        const side = wall === 'left' || wall === 'right';
        const len = (side ? rd : rw) * 0.7;
        const at =
          wall === 'left'
            ? { x: 0.3, y: rd / 2 }
            : wall === 'right'
              ? { x: rw - 0.3, y: rd / 2 }
              : wall === 'front'
                ? { x: rw / 2, y: 0.3 }
                : { x: rw / 2, y: rd - 0.3 };
        const size: [number, number, number] = side ? [0.5, len, 2] : [len, 0.5, 2];
        if (clear(at.x, at.y, size[0], size[1]))
          spots.push({ id: id(), kind: 'thing', fixture: true, name: f.name, ...at, size });
      }
    } else if (f.kind === 'row') {
      const rows = Math.max(1, Math.min(10, f.count ?? Math.max(2, Math.floor((rd - 3) / 1.2))));
      const tall = /\b(?:desk|table|bench)/.test(head) ? 0.75 : 0.9;
      const halves: [number, number][] = aisle
        ? [
            [0.4, rw / 2 - 0.55],
            [rw / 2 + 0.55, rw - 0.4],
          ]
        : [[0.6, rw - 0.6]];
      for (let r = 0; r < rows; r++) {
        const y = 2 + r * 1.2;
        if (y > rd - 0.6) break;
        for (const [a, b] of halves)
          if (clear((a + b) / 2, y, b - a, 0.5))
            spots.push({
              id: id(),
              kind: 'thing',
              fixture: true,
              name: f.name,
              x: Math.round(((a + b) / 2) * 100) / 100,
              y,
              size: [b - a, 0.5, tall],
              faces: 'front',
            });
      }
    } else if (f.kind === 'aisle') {
      spots.push({
        id: id(),
        kind: 'thing',
        fixture: true,
        name: f.name,
        x: rw / 2,
        y: rd / 2 + 0.5,
        size: [1, Math.max(1, rd - 2), 0.01],
        shape: 'ground',
      });
    }
  }
  return { ...plan, spots };
}
