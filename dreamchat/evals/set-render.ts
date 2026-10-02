// A place's empty set from any camera (previs.ts previsSet), read from a packet alone: a cut's floor plan and the names
// its mock-ups were drawn with, rendered through its own camera or any other, under the switches the packet was made
// with. For drawing a place empty from every direction its cuts use (the packet's `places`), their reverses and the
// angles between, so a turn or a move of the camera stays in one room. Nothing else is read; the files go to --out.
//
//   bun run evals/set-render.ts --packet <dream.json> --cut <id> [--eye '<Eye as JSON>']
//       [--at x,y] [--look dx,dy] [--height m] [--pitch radians] [--lens mm] [--reverse | --turn]
//       [--frame 16:9|9:16] [--over 1.08] [--name <file stem>] --out <dir>
//
// The eye is previs.ts's own: metres on the plan, x from the room's left wall, y from its front (the front wall at
// y = 0), `d` the way it looks on the plan, `height` of the lens, `pitch` in radians (down negative), `lens` in
// millimetres on a 36 mm frame (unset, a 76-degree view across a 16:9 frame, about 23 mm). Unset, each is the cut's
// own camera's; a partial --eye keeps the rest of it. --reverse is the reverse angle: from as far across the middle of
// the place, on the same line, looking back, kept inside an indoor room along that line (where the middle is behind
// the camera, it turns round where it stands); --turn turns it round where it stands. A sitting crowd's seats stand
// where the cut's own frame has them, from whichever eye. Writes <name>-clay.png, <name>-keyed.png, <name>-idmap.png
// and <name>.json (the eye, the frame in the set, the key and the id map's regions), and says where the cut's own set
// rendered again is not the packet's (a packet made under other code).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Blocking, Eye } from '../blocking';
import { type DreamPacket, PACKET_VERSION } from '../packet';
import { type PrevisSet, previsSet, SET_OVERSCAN } from '../previs';

/** How the eye given differs from the cut's own camera. */
export type EyeGiven = {
  eye?: Partial<Eye>;
  at?: [number, number];
  look?: [number, number];
  height?: number;
  pitch?: number;
  lens?: number;
  reverse?: boolean;
  turn?: boolean;
};

const sha = (b: Uint8Array) => new Bun.CryptoHasher('sha256').update(b).digest('hex');
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/**
 * A cut's empty set rendered from the packet alone, through `given` (the cut's own camera where nothing is given), under
 * the packet's own switches and only those, put back after. Throws where the cut has no floor plan or the eye is not
 * a camera.
 */
export function renderFromPacket(
  pk: DreamPacket,
  cutId: string,
  given: EyeGiven = {},
  opts: { frame?: '16:9' | '9:16'; over?: number } = {},
): { set: PrevisSet; eye: Eye; lane: Eye | null; own: boolean } {
  const cut = pk.cuts.find((c) => c.identity.cut === cutId);
  if (!cut) throw new Error(`${cutId}: no such cut in the packet`);
  const plan = cut.camera.floorPlan as Blocking | null;
  if (!plan)
    throw new Error(
      cut.camera.previs?.through
        ? `${cutId} is an edit with no floor plan of its own: its place's is on ${cut.camera.previs.through}`
        : `${cutId} has no floor plan`,
    );
  const own = cut.camera.eye;
  const base: Partial<Eye> = { ...(own ?? {}), ...(given.eye ?? {}) };
  if (own && given.eye?.at) base.at = { ...own.at, ...given.eye.at };
  if (own && given.eye?.d) base.d = { ...own.d, ...given.eye.d };
  const eye = {
    ...base,
    ...(given.at ? { at: { x: given.at[0], y: given.at[1] } } : {}),
    ...(given.look ? { d: { x: given.look[0], y: given.look[1] } } : {}),
    ...(given.height !== undefined ? { height: given.height } : {}),
    ...(given.pitch !== undefined ? { pitch: given.pitch } : {}),
    ...(given.lens !== undefined ? { lens: given.lens } : {}),
  } as Eye;
  if (!eye.at || !finite(eye.at.x) || !finite(eye.at.y)) throw new Error('no camera: give --eye, or --at x,y');
  if (!eye.d || !finite(eye.d.x) || !finite(eye.d.y) || Math.hypot(eye.d.x, eye.d.y) < 1e-9)
    throw new Error('no way to look: give --look dx,dy, not 0,0');
  if (!finite(eye.height ?? 1.6)) throw new Error('--height is not a number');
  eye.height = eye.height ?? 1.6;
  for (const k of ['pitch', 'lens'] as const)
    if (eye[k] !== undefined && !finite(eye[k])) throw new Error(`--${k} is not a number`);
  if (given.reverse && given.turn) throw new Error('--reverse or --turn, not both');
  if (given.turn) eye.d = { x: -eye.d.x, y: -eye.d.y };
  if (given.reverse) Object.assign(eye, reversed(eye, plan));
  // A sitting crowd's seats where the cut's own frame has them: the lane its crowd clears to its own camera.
  const lane = cut.camera.eyes === 'dreamer' ? null : own;
  const was = Object.fromEntries(
    Object.keys(process.env)
      .filter((k) => k.startsWith('DREAMCHAT_'))
      .map((k) => [k, process.env[k]]),
  );
  try {
    for (const k of Object.keys(was)) delete process.env[k];
    for (const [k, v] of Object.entries(pk.dream.switches)) if (k.startsWith('DREAMCHAT_')) process.env[k] = v;
    // A packet keeps the camera rules only where they acted, which they do only with the cut sheet on.
    if (pk.dream.switches.DREAMCHAT_CAMERA === 'on') process.env.DREAMCHAT_CUT_SHEET = 'on';
    if (opts.frame) process.env.DREAMCHAT_FRAME = opts.frame;
    const names = cut.camera.previs?.names ?? {};
    const name = (id: string) => names[id] ?? plan.spots.find((s) => s.id === id)?.name ?? id;
    const set = previsSet(plan, eye, name, lane, opts.over ?? SET_OVERSCAN);
    return { set, eye, lane, own: JSON.stringify(eye) === JSON.stringify(own) };
  } finally {
    for (const k of Object.keys(process.env)) if (k.startsWith('DREAMCHAT_')) delete process.env[k];
    Object.assign(process.env, was);
  }
}

/**
 * The reverse angle of a camera on a plan: mirrored through the point of its line nearest the middle of the place,
 * looking back; inside an indoor room, the farthest it can go along that line, 0.2 m in from the walls. Where that
 * middle is behind it, turned round where it stands.
 */
export function reversed(eye: Eye, plan: Pick<Blocking, 'room' | 'indoors'>): Pick<Eye, 'at' | 'd'> {
  const [w, depth] = plan.room ?? [10, 10];
  const n = Math.hypot(eye.d.x, eye.d.y);
  const d = { x: eye.d.x / n, y: eye.d.y / n };
  const back = { x: -eye.d.x, y: -eye.d.y };
  const t = (w / 2 - eye.at.x) * d.x + (depth / 2 - eye.at.y) * d.y;
  if (t <= 0) return { at: eye.at, d: back };
  let s = 2 * t;
  if (plan.indoors) {
    // Where the line runs inside the room, 0.2 m in from its walls: the farthest along it, short of the mirror.
    let [lo, hi] = [-Infinity, Infinity];
    for (const [p, v, most] of [
      [eye.at.x, d.x, w],
      [eye.at.y, d.y, depth],
    ] as const) {
      if (Math.abs(v) < 1e-12) {
        if (p < 0.2 || p > most - 0.2) [lo, hi] = [1, 0];
        continue;
      }
      const [a, b] = [(0.2 - p) / v, (most - 0.2 - p) / v];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
    if (lo <= hi && hi >= 0) s = Math.max(Math.min(s, hi), Math.max(lo, 0));
  }
  // To the millimetre: a camera's place, not a sum's.
  const mm = (v: number) => Math.round(v * 1000) / 1000;
  return { at: { x: mm(eye.at.x + d.x * s), y: mm(eye.at.y + d.y * s) }, d: back };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const fail = (why: string): never => {
    console.error(why);
    process.exit(1);
  };
  const FLAGS = ['--reverse', '--turn'];
  const VALUED = [
    '--packet',
    '--cut',
    '--out',
    '--eye',
    '--at',
    '--look',
    '--height',
    '--pitch',
    '--lens',
    '--frame',
    '--over',
    '--name',
  ];
  for (const [i, a] of args.entries()) {
    if (!a.startsWith('--')) continue;
    if (!FLAGS.includes(a) && !VALUED.includes(a)) fail(`${a}: not a flag of this command`);
    if (args.filter((x) => x === a).length > 1) fail(`${a} given twice`);
    if (VALUED.includes(a) && (i + 1 >= args.length || args[i + 1].startsWith('--'))) fail(`${a} needs a value`);
  }
  const val = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const num = (k: string) => (val(k) === undefined ? undefined : Number(val(k)));
  const pair = (k: string) => {
    const v = val(k)?.split(',').map(Number);
    if (v && (v.length !== 2 || !v.every(Number.isFinite))) fail(`${k} wants two numbers, x,y`);
    return v as [number, number] | undefined;
  };
  const pk = JSON.parse(
    readFileSync(val('--packet') ?? fail('--packet <dream.json> is needed'), 'utf8'),
  ) as DreamPacket;
  if (pk.version !== PACKET_VERSION)
    console.warn(`packet version ${pk.version}, this code's ${PACKET_VERSION}: rendered as this code reads it`);
  const cutId = val('--cut') ?? fail('--cut <id> is needed');
  const out = val('--out') ?? fail('--out <dir> is needed');
  const frame = val('--frame');
  if (frame && frame !== '16:9' && frame !== '9:16') fail('--frame is 16:9 or 9:16');
  const over = num('--over');
  if (over !== undefined && !(over >= 1)) fail('--over is 1 or more');
  let made: ReturnType<typeof renderFromPacket>;
  try {
    made = renderFromPacket(
      pk,
      cutId,
      {
        eye: val('--eye') ? (JSON.parse(val('--eye')!) as Partial<Eye>) : undefined,
        at: pair('--at'),
        look: pair('--look'),
        height: num('--height'),
        pitch: num('--pitch'),
        lens: num('--lens'),
        reverse: args.includes('--reverse'),
        turn: args.includes('--turn'),
      },
      { frame: frame as '16:9' | '9:16' | undefined, over },
    );
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  const { set, eye, lane } = made!;
  // The cut's own set rendered again, against the packet's: a packet made under other code says so.
  const kept = pk.cuts.find((c) => c.identity.cut === cutId)?.camera.previs?.set;
  if (kept && !frame && over === undefined) {
    const again = made!.own ? set : renderFromPacket(pk, cutId).set;
    if (sha(again.idmap) !== kept.idmap.sha256)
      console.warn(`${cutId}: its own set rendered here is not the packet's: the packet was made under other code`);
  }
  const name = val('--name') ?? `${cutId}-set`;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${name}-clay.png`), set.clay);
  writeFileSync(join(out, `${name}-keyed.png`), set.keyed);
  writeFileSync(join(out, `${name}-idmap.png`), set.idmap);
  writeFileSync(
    join(out, `${name}.json`),
    `${JSON.stringify(
      {
        cut: cutId,
        packet: pk.version,
        eye,
        lane,
        over: over ?? SET_OVERSCAN,
        frame: set.frame,
        framePx: set.framePx,
        key: set.key,
        ids: set.ids,
      },
      null,
      1,
    )}\n`,
  );
  console.log(`${join(out, name)}: ${set.ids.length} regions, frame ${set.framePx.join(',')}`);
}
