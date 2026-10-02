// What a harness draws a camera's set from (the packet's camera.previs): every saved dream rebuilt with the full
// profile and its readings, each cut's mock-ups rendered in memory and its packet checked against the schema, nothing
// written. Per cut with a camera:
// - its empty set holds no person, crowd or held thing, and every fixture, prop and seat the cut's own frame shows;
// - cropped by its framePx, the set's id map is the same set rendered at the frame's size, pixel for pixel, and the
//   frame's own id map wherever no one stands and nothing is held, pixel for pixel;
// - the frame's id map has one exact colour per region, every pixel counted, a region for every keyed colour, and a
//   spot the same colour in the frame and the set;
// - rendered from the packet alone (its floor plan, names and camera, as evals/set-render.ts does), the set is the
//   packet's, byte for byte;
// - an edit (no camera of its own) has its mock-up through the camera of the picture it edits;
// - each person in view has a facing, and where the camera's words say how they are turned, they say the same;
// - each cut with a camera is listed once among its place's cameras, under the eye it is seen through.
//
//   bun run evals/previs-set.ts [--live] [--dream <id>] [--list]
import './local-env';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import { cameraOf, dreamPacket, PACKET_SCHEMA, type PrevisPacket, validate } from '../packet';
import { rebuild } from '../plan';
import { type Facing, previsSet, readPng } from '../previs';
import { calledFor, previsFor, previsKeyedFor, previsSetFor, type Session } from '../session';
import { renderFromPacket } from './set-render';
import { withCast } from './cast-cache';
import { withImplied } from './implied-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const args = process.argv.slice(2);
const live = args.includes('--live');
const list = args.includes('--list');
const only = args.includes('--dream') ? args[args.indexOf('--dream') + 1] : undefined;
const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';

const sources: { id: string; live: boolean }[] = [];
if (only) sources.push({ id: only, live: !frozenDreams().includes(only) });
else {
  for (const id of frozenDreams()) sources.push({ id, live: false });
  if (live)
    for (const d of liveDreams(dataDir()))
      if (!d.id.includes('/') && !sources.some((x) => x.id === d.id)) sources.push({ id: d.id, live: true });
}

const total = {
  dreams: 0,
  cuts: 0,
  cameras: 0,
  sets: 0,
  edits: 0,
  editsRendered: 0,
  places: 0,
  directions: 0,
  facing: 0,
  facingSaid: 0,
  // Faults: each should be 0.
  broken: 0,
  noSet: 0,
  setHoldsSomeone: 0,
  setLosesAThing: 0,
  setNotItself: 0,
  setNotFromPacket: 0,
  setNotTheFrame: 0,
  idmapStray: 0,
  idmapCount: 0,
  keyWithoutRegion: 0,
  colourMoves: 0,
  editWithout: 0,
  placesWrong: 0,
  camerasWithSets: 0,
  facingMissing: 0,
  facingSaidOtherwise: 0,
};
const out: string[] = [];
const hex = (c: ArrayLike<number>, i = 0) => (c[i] << 16) | (c[i + 1] << 8) | c[i + 2];
type Ids = { id: string; rgb: number[]; pixels: number }[];

/** Each pixel's id on an id map, by its list: null where nothing is; stray colours and miscounted regions. */
function idsOf(png: Uint8Array, ids: Ids) {
  const { width, height, rgb } = readPng(png);
  const byColour = new Map(ids.map((e) => [hex(e.rgb), e.id]));
  const at: (string | null)[] = new Array(width * height);
  const seen = new Map<string, number>();
  let stray = 0;
  for (let i = 0; i < width * height; i++) {
    const c = hex(rgb, i * 3);
    const id = c === 0 ? null : (byColour.get(c) ?? null);
    if (c !== 0 && id === null) stray++;
    at[i] = id;
    if (id) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return { width, height, at, stray, miscount: ids.filter((e) => seen.get(e.id) !== e.pixels).length };
}

/** The pixels where a set cropped by its framePx differs from a frame-sized id map, among those `where` takes. */
function cropDiffers(
  set: ReturnType<typeof idsOf>,
  px: number[],
  frame: ReturnType<typeof idsOf>,
  where: (id: string | null) => boolean,
): number {
  let n = 0;
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const a = frame.at[y * frame.width + x];
      if (where(a) && set.at[(y + px[1]) * set.width + x + px[0]] !== a) n++;
    }
  return n;
}

// How the camera's words say someone is turned (previs.ts turnedTo), by facing's view.
const TURNS: [Facing['view'], RegExp][] = [
  ['front', /\bfacing the camera\b/],
  ['three-quarter front', /\bturned three-quarters toward the camera\b/],
  ['profile', /\bin profile\b/],
  ['three-quarter back', /\bseen three-quarters from behind\b/],
  ['back', /\btheir back to the camera\b/],
];

for (const { id, live: isLive } of sources) {
  let s: Session;
  try {
    s = structuredClone(loadDream(id, isLive).session) as Session;
    s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session as Session;
    s = (await withTyped(s)).session as Session;
    s = (await withCast(s)).session as Session;
  } catch {
    continue;
  }
  if (!s.draft?.breakdown || !s.style) continue;
  let r: ReturnType<typeof rebuild>;
  try {
    r = rebuild(s);
  } catch {
    continue;
  }
  total.dreams++;
  const dreamer = r.b.people.find((x) => x.is_dreamer)?.id;
  const files = new Map<string, Uint8Array>();
  const keep = (png?: Uint8Array) => {
    if (!png) return null;
    const h = new Bun.CryptoHasher('sha256').update(png).digest('hex');
    files.set(h, png);
    return { file: `previs/${h}.png`, sha256: h };
  };
  const calledOf = (cut: string) => {
    const p = r.pictures.find((x) => x.kind === 'cut' && x.id === cut)!;
    return calledFor({ build: s.build, draft: s.draft && { ...s.draft, breakdown: r.b } }, p.item);
  };
  const previs = (cut: string): Omit<PrevisPacket, 'media'> | null => {
    const p = r.pictures.find((x) => x.kind === 'cut' && x.id === cut);
    const through = cameraOf(r, cut);
    if (!p?.item.frame?.plan || !through) return null;
    const seen = {
      id: p.id,
      frame: { ...p.item.frame, eyes: through.eyes, plan: { ...p.item.frame.plan, eye: through.eye } },
    };
    const called = calledOf(cut);
    const clay = previsFor(r.b, seen, called, r.rec);
    const keyed = previsKeyedFor(r.b, seen, called, r.rec, { idmap: true });
    const set = previsSetFor(r.b, seen, called, r.rec);
    const plan = shotPlan(r.b, cut, r.rec);
    return {
      names: Object.fromEntries((plan?.spots ?? []).map((x) => [x.id, called(x.id)])),
      clay: keep(clay?.png),
      keyed: keyed?.idmap
        ? { ...keep(keyed.png)!, key: keyed.key, idmap: keep(keyed.idmap.png)!, ids: keyed.idmap.ids }
        : null,
      through: through.id === cut ? null : through.id,
      set: set
        ? {
            clay: keep(set.clay)!,
            keyed: { ...keep(set.keyed)!, key: set.key },
            idmap: keep(set.idmap)!,
            ids: set.ids,
            frame: set.frame,
            framePx: set.framePx,
          }
        : null,
    };
  };
  const pk = dreamPacket(r, { dream: id, style: s.style, history: () => [], previs });
  const errors = validate(PACKET_SCHEMA, pk);
  if (errors.length) {
    total.broken++;
    out.push(`${id}: breaks the schema: ${errors.slice(0, 2).join(' | ')}`);
  }
  // Each cut with a camera listed once among its place's cameras, by this eval's own reading of which floor plan a
  // moment is on (the scene's, or its place's within it, as continuity places it): the camera's own cut, and every cut
  // seen through it, on the plan the place is; each cut's set the one its packet has.
  total.places += pk.places.length;
  total.directions += pk.places.reduce((a, x) => a + x.cameras.length, 0);
  const planOf = (cut: string) => {
    const sc = r.b.scenes.find((x) => x.moments.some((m) => m.id === cut));
    const m = sc?.moments.find((x) => x.id === cut);
    return sc && m ? (sc.blocking?.places?.[m.place] ?? sc.blocking) : undefined;
  };
  for (const pl of pk.places)
    for (const k of pl.cameras) {
      const plans = new Set([k.through, ...k.cuts].map(planOf));
      const sets = k.cuts.map(
        (x) => pk.cuts.find((c) => c.identity.cut === x)?.camera.previs?.set?.idmap.sha256 ?? null,
      );
      if (plans.size !== 1 || JSON.stringify(sets) !== JSON.stringify(k.sets)) {
        total.placesWrong++;
        out.push(
          `${id} ${pl.id} ${k.through}: ${plans.size} floor plans among its cuts, sets ${JSON.stringify(k.sets)}`,
        );
      }
      if (new Set(k.sets).size > 1) total.camerasWithSets++;
    }
  for (const c of pk.cuts) {
    const listed = pk.places.flatMap((x) => x.cameras.filter((k) => k.cuts.includes(c.identity.cut)));
    if (cameraOf(r, c.identity.cut) ? listed.length !== 1 : listed.length) {
      total.placesWrong++;
      out.push(`${id} ${c.identity.cut}: listed ${listed.length} times among its place's cameras`);
    }
  }
  for (const c of pk.cuts) {
    total.cuts++;
    const cut = c.identity.cut;
    const pv = c.camera.previs;
    const through = cameraOf(r, cut);
    const plan = shotPlan(r.b, cut, r.rec);
    if (!c.camera.eye && through && plan) {
      total.edits++;
      if (pv?.clay && pv.through === through.id) total.editsRendered++;
      else {
        total.editWithout++;
        out.push(`${id} ${cut}: an edit of ${through.id} with no mock-up through its camera`);
      }
    }
    if (!pv?.keyed || !through || !plan) continue;
    total.cameras++;
    const spot = (x: string) => plan.spots.find((y) => y.id === x);
    const figure = (x: string) => {
      const sp = spot(x);
      return !!sp && (!!sp.many || sp.kind === 'person' || (!sp.kind && !!sp.pose));
    };
    const away = (x: string | null) => !!x && (figure(x) || !!spot(x)?.heldBy);
    const frame = idsOf(files.get(pv.keyed.idmap.sha256)!, pv.keyed.ids);
    if (frame.stray || frame.miscount) {
      total.idmapStray += frame.stray ? 1 : 0;
      total.idmapCount += frame.miscount ? 1 : 0;
      out.push(`${id} ${cut}: id map: ${frame.stray} stray pixels, ${frame.miscount} regions miscounted`);
    }
    for (const k of pv.keyed.key)
      if (!pv.keyed.ids.some((e) => e.id === k.id)) {
        total.keyWithoutRegion++;
        out.push(`${id} ${cut}: ${k.id} (${k.name}) keyed with no region on the id map`);
      }
    if (!pv.set) {
      total.noSet++;
      out.push(`${id} ${cut}: no empty set`);
      continue;
    }
    total.sets++;
    const someone = pv.set.ids.filter((e) => away(e.id));
    if (someone.length) {
      total.setHoldsSomeone++;
      out.push(`${id} ${cut}: the empty set holds ${someone.map((e) => `${e.id} (${e.name})`).join(', ')}`);
    }
    const lost = pv.keyed.ids.filter((e) => !away(e.id) && !pv.set!.ids.some((x) => x.id === e.id));
    if (lost.length) {
      total.setLosesAThing++;
      out.push(`${id} ${cut}: the empty set loses ${lost.map((e) => `${e.id} (${e.name})`).join(', ')}`);
    }
    const keyedIds = pv.keyed.ids;
    const moved = pv.set.ids.filter((e) => hex(keyedIds.find((x) => x.id === e.id)?.rgb ?? e.rgb) !== hex(e.rgb));
    if (moved.length) {
      total.colourMoves++;
      out.push(`${id} ${cut}: ${moved.map((e) => e.id).join(', ')} another colour in the set than in the frame`);
    }
    // Cropped by its framePx: the same set at the frame's size, every pixel; the frame wherever no one is.
    const set = idsOf(files.get(pv.set.idmap.sha256)!, pv.set.ids);
    const called = calledOf(cut);
    const names = Object.fromEntries(plan.spots.map((x) => [x.id, called(x.id)]));
    const small = previsSet(
      plan,
      through.eye,
      (x) => names[x] ?? x,
      through.eyes === 'dreamer' && dreamer ? null : through.eye,
      1,
      frame.width,
      frame.height,
    );
    // Rendered from the packet alone, as evals/set-render.ts does (its switches only, nothing of this process's): the
    // same set, grey, keyed and id map, byte for byte.
    if (c.camera.floorPlan && c.camera.eye && !pv.through) {
      const { set: again } = renderFromPacket(pk, cut);
      const sha = (b: Uint8Array) => new Bun.CryptoHasher('sha256').update(b).digest('hex');
      const kept = [pv.set.idmap.sha256, pv.set.clay.sha256, pv.set.keyed.sha256];
      if (JSON.stringify([sha(again.idmap), sha(again.clay), sha(again.keyed)]) !== JSON.stringify(kept)) {
        total.setNotFromPacket++;
        out.push(`${id} ${cut}: the set rendered from the packet alone is not the packet's`);
      }
    }
    const itself = cropDiffers(set, pv.set.framePx, idsOf(small.idmap, small.ids), () => true);
    if (itself) {
      total.setNotItself++;
      out.push(`${id} ${cut}: the set cropped is not the set at the frame's size at ${itself} pixels`);
    }
    const notFrame = cropDiffers(set, pv.set.framePx, frame, (x) => x !== null && !away(x));
    if (notFrame) {
      total.setNotTheFrame++;
      out.push(`${id} ${cut}: the set cropped is not the frame where no one stands, at ${notFrame} pixels`);
    }
    // Each person in view faced; where the camera's words say how they are turned, the same.
    const low = (c.camera.view ?? '').toLowerCase();
    for (const e of c.who.inView) {
      const sp = spot(e.id);
      const should = !!sp && figure(e.id) && !sp.many && !(through.eyes === 'dreamer' && e.id === dreamer);
      if (should && !e.facing) {
        total.facingMissing++;
        out.push(`${id} ${cut}: ${e.id} (${e.name}) in view with no facing`);
      }
      if (!e.facing || pv.through) continue;
      total.facing++;
      // What the words say of them: their own entry ("…: the dreamer, the left third of the picture, …; then the
      // grandfather, …"), never one that names them in passing ("across from the dreamer").
      const name = e.name.toLowerCase();
      const words = low
        .split(/[:;.]\s*/)
        .map((x) => x.trim().replace(/^(?:then|and)\s+/, ''))
        .find((x) => x.startsWith(`${name},`));
      if (!words) continue;
      const said = TURNS.find(([, re]) => re.test(words));
      if (!said) continue;
      const side = words.match(/looking toward the (left|right) of the picture/)?.[1] ?? null;
      if (said[0] === e.facing.view && (!e.facing.side || !side || side === e.facing.side)) total.facingSaid++;
      else {
        total.facingSaidOtherwise++;
        out.push(`${id} ${cut}: ${e.id} faces ${JSON.stringify(e.facing)} but the words say "${words.trim()}"`);
      }
    }
  }
}
console.log(JSON.stringify(total));
if (list) for (const l of out) console.log(`  ${l}`);
