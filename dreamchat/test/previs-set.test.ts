// What a harness draws a camera's set from (the packet's camera.previs): its empty set, a little wider than the frame,
// with no person, crowd or held thing in it; an id map that gives every fixture and prop an exact region; and how each
// person is turned to the camera, as its words say. A harness drew each place once per camera, empty, then put the
// people onto it, and could not mask the sink, the drawer, the sheet or the calendar by colour (2 Oct).
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Blocking, Eye, Spot } from '../blocking';
import { cameraOf } from '../packet';
import type { Rebuilt } from '../plan';
import { renderFromPacket, reversed } from '../evals/set-render';
import type { DreamPacket } from '../packet';
import { facingOf, previsKeyed, previsSet, readPng, SET_OVERSCAN, turnedTo } from '../previs';

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const was = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    return fn();
  } finally {
    for (const [k, v] of Object.entries(was))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}

// Her kitchen: the sink and the drawer on the window wall, she at the drawer with the sheet in her hands, the dreamer
// by her, the neighbours sitting in a row by the wall, a scooter someone sits on.
const kitchen: Blocking = {
  front: 'the window wall over the sink',
  indoors: true,
  room: [3.5, 3],
  spots: [
    { id: 'p2', x: 2.4, y: 1.2, kind: 'person', faces: 'x3', pose: 'standing' },
    { id: 'p1', x: 1.2, y: 1.4, kind: 'person', faces: 'p2', pose: 'standing' },
    { id: 'p3', x: 3.0, y: 1.6, kind: 'person', faces: 'front', pose: 'sitting' },
    { id: 'x1', x: 1.5, y: 0.3, kind: 'thing', size: [0.8, 0.6, 0.9], fixture: true, name: 'the sink' },
    { id: 'x3', x: 2.7, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
    { id: 't1', x: 2.4, y: 1.2, kind: 'thing', size: [0.4, 0.3, 0.02], heldBy: 'p2', name: 'the bed sheet' },
    { id: 'v1', x: 3.0, y: 1.6, kind: 'thing', size: [0.5, 1.2, 0.9], shape: 'vehicle', name: 'a scooter' },
    { id: 'c1', x: 0.7, y: 1.1, kind: 'person', many: true, pose: 'sitting', faces: 'right', name: 'the neighbours' },
  ],
};
const names: Record<string, string> = { p1: 'the dreamer', p2: 'my grandmother', p3: 'the boy', t1: 'the bed sheet' };
const name = (id: string) => names[id] ?? kitchen.spots.find((s) => s.id === id)?.name ?? id;
const eye: Eye = { at: { x: 1.75, y: 2.9 }, d: { x: 0, y: -1 }, height: 1.6, pitch: -0.25 };
const W = 344;
const H = 192;
const AWAY = ['p1', 'p2', 'p3', 'c1', 't1'];
const hex = (c: ArrayLike<number>, i = 0) => (c[i] << 16) | (c[i + 1] << 8) | c[i + 2];
/** Each pixel's id on an id map, null where nothing is. */
const idsAt = (png: Uint8Array, ids: { id: string; rgb: number[] }[]) => {
  const { width, height, rgb } = readPng(png);
  const by = new Map(ids.map((e) => [hex(e.rgb), e.id]));
  return { width, height, at: Array.from({ length: width * height }, (_, i) => by.get(hex(rgb, i * 3)) ?? null) };
};
/** Where a set's id map, cropped to its frame, differs from a frame's id map, at the pixels `where` says. */
const cropDiffers = (
  set: ReturnType<typeof previsSet>,
  frame: { png: Uint8Array; ids: { id: string; rgb: number[] }[] },
  where: (id: string | null) => boolean = () => true,
) => {
  const a = idsAt(frame.png, frame.ids);
  const b = idsAt(set.idmap, set.ids);
  const [x0, y0] = set.framePx;
  let n = 0;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++)
      if (where(a.at[y * a.width + x]) && b.at[(y + y0) * b.width + x + x0] !== a.at[y * a.width + x]) n++;
  return n;
};

describe("a camera's empty set", () => {
  const set = previsSet(kitchen, eye, name, eye, SET_OVERSCAN, W, H);

  test('holds no person, crowd or held thing; every fixture the frame shows, and the seats a crowd sits on', () => {
    const ids = set.ids.map((e) => e.id);
    for (const id of AWAY) expect(ids).not.toContain(id);
    expect(ids).toEqual(expect.arrayContaining(['x1', 'x3', 'v1', 'c1 seats', 'floor', 'front']));
    expect(set.key.some((k) => k.kind === 'person' || k.kind === 'crowd')).toBe(false);
  });

  test('is wider than the frame by the same whole pixels each side, and says where the frame is in it', () => {
    const clay = readPng(set.clay);
    expect([clay.width, clay.height]).toEqual([W + 2 * 14, H + 2 * 8]);
    expect(set.framePx).toEqual([14, 8, 14 + W, 8 + H]);
    expect(set.frame).toEqual([
      +(14 / clay.width).toFixed(4),
      +(8 / clay.height).toFixed(4),
      +((14 + W) / clay.width).toFixed(4),
      +((8 + H) / clay.height).toFixed(4),
    ]);
  });

  test('cropped to its frame, it is the same set at the frame size, every pixel, in either frame shape', () => {
    for (const frame of ['16:9', '9:16'])
      withEnv({ DREAMCHAT_FRAME: frame }, () => {
        const [w, h] = frame === '16:9' ? [W, H] : [H, W];
        const big = previsSet(kitchen, eye, name, eye, SET_OVERSCAN, w, h);
        const own = previsSet(kitchen, eye, name, eye, 1, w, h);
        expect(own.framePx).toEqual([0, 0, w, h]);
        expect(cropDiffers(big, { png: own.idmap, ids: own.ids })).toBe(0);
      });
  });

  test('cropped to its frame, it is the frame wherever no one stands and nothing is held', () => {
    const frame = previsKeyed(kitchen, eye, [], name, W, H, { idmap: true }).idmap!;
    expect(cropDiffers(set, frame, (id) => id !== null && !AWAY.includes(id))).toBe(0);
    // Through someone's eyes, the crowd's seats where that frame has them.
    const pov: Eye = { ...eye, at: { x: 1.2, y: 1.6 } };
    const theirs = previsKeyed(kitchen, pov, ['p1'], name, W, H, { idmap: true }).idmap!;
    const empty = previsSet(kitchen, pov, name, null, SET_OVERSCAN, W, H);
    expect(cropDiffers(empty, theirs, (id) => id !== null && !AWAY.includes(id))).toBe(0);
  });
});

describe("a frame's id map", () => {
  const frame = previsKeyed(kitchen, eye, [], name, W, H, { idmap: true });

  test('one exact colour per region, never black, every pixel counted, every keyed colour a region', () => {
    const { ids, png } = frame.idmap!;
    expect(new Set(ids.map((e) => hex(e.rgb))).size).toBe(ids.length);
    expect(ids.some((e) => hex(e.rgb) === 0)).toBe(false);
    const { at } = idsAt(png, ids);
    for (const e of ids) expect(at.filter((x) => x === e.id).length).toBe(e.pixels);
    for (const k of frame.key) expect(ids.map((e) => e.id)).toContain(k.id);
  });

  test('says what each region is: a person, a crowd, its seats, a fixture, a held thing, a ridden one, the room', () => {
    const of = (id: string) => frame.idmap!.ids.find((e) => e.id === id);
    expect(of('p2')).toMatchObject({ kind: 'person', name: 'my grandmother', fixture: false });
    expect(of('c1')?.kind).toBe('crowd');
    expect(of('c1 seats')?.kind).toBe('seats');
    expect(of('x3')).toMatchObject({ kind: 'thing', name: 'the cutlery drawer', fixture: true, held: false });
    expect(of('t1')).toMatchObject({ kind: 'thing', held: true });
    expect(of('v1')).toMatchObject({ kind: 'thing', ridden: true, fixture: false });
    expect(of('floor')?.kind).toBe('room');
  });

  test('a spot is the same colour in the frame and the set, whoever else is in it', () => {
    const set = previsSet(kitchen, eye, name, eye, SET_OVERSCAN, W, H);
    for (const e of set.ids) expect(frame.idmap!.ids.find((x) => x.id === e.id)?.rgb).toEqual(e.rgb);
  });

  test('changes nothing in the keyed frame it comes with', () => {
    const plain = previsKeyed(kitchen, eye, [], name, W, H);
    expect(plain.png).toEqual(frame.png);
    expect(plain.key).toEqual(frame.key);
    expect(plain.idmap).toBeUndefined();
  });
});

describe('how a person is turned to the camera', () => {
  const at = (faces: Spot['faces']): Spot => ({ id: 'p9', x: 1.75, y: 1.5, kind: 'person', pose: 'standing', faces });
  const plan = (s: Spot): Blocking => ({ ...kitchen, spots: [...kitchen.spots, s] });
  test('in the bins its words say', () => {
    const cases: [Spot['faces'], string, string | null, string][] = [
      ['front', 'back', null, 'their back to the camera'],
      ['back', 'front', null, 'facing the camera'],
      ['left', 'profile', 'left', 'in profile, looking toward the left of the picture'],
      ['right', 'profile', 'right', 'in profile, looking toward the right of the picture'],
    ];
    for (const [faces, view, side, words] of cases) {
      const s = at(faces);
      expect(facingOf(s, plan(s), eye)).toMatchObject({ view, side });
      expect(turnedTo(s, plan(s), eye)).toBe(words);
    }
    // Three-quarters: turned 45 degrees from the camera, toward the picture's right.
    const s = { ...at(undefined), faces: 'x9' };
    const p = {
      ...plan(s),
      spots: [...plan(s).spots, { id: 'x9', x: 1.75 + 1.4, y: 1.5 + 1.4, kind: 'thing' as const }],
    };
    expect(facingOf(s, p, eye)).toMatchObject({ view: 'three-quarter front', side: 'right', degrees: 45 });
    expect(turnedTo(s, p, eye)).toBe(
      'turned three-quarters toward the camera, looking toward the right of the picture',
    );
  });
});

describe('the camera a picture is seen through', () => {
  const cut = (id: string, eye?: Eye, base?: string) =>
    ({
      id,
      kind: 'cut',
      item: { frame: { eyes: 'outside', plan: { eye, refs: base ? [{ id: base, kind: 'cut', role: 'base' }] : [] } } },
    }) as unknown as Rebuilt['pictures'][number];
  const r = {
    pictures: [
      cut('m1', eye),
      cut('m2', undefined, 'm1'),
      cut('m3', undefined, 'm2'),
      cut('m4'),
      cut('m5', undefined, 'm5'),
    ],
  };
  test("its own, or an edit's picture's, back to one with a camera; none with neither, nor round in a circle", () => {
    expect(cameraOf(r, 'm1')?.id).toBe('m1');
    expect(cameraOf(r, 'm3')).toEqual({ id: 'm1', eye, eyes: 'outside' });
    expect(cameraOf(r, 'm4')).toBeNull();
    expect(cameraOf(r, 'm5')).toBeNull();
  });
});

describe('a place drawn empty from any camera, from the packet alone (evals/set-render.ts)', () => {
  test("its cut's own camera gives the cut's set; another eye, or the reverse, its own", () => {
    const dir = mkdtempSync(join(tmpdir(), 'set-render-'));
    try {
      const packet = {
        dream: { switches: { DREAMCHAT_RECORD: 'on', DREAMCHAT_CAMERA: 'on' } },
        cuts: [{ identity: { cut: 'm1' }, camera: { floorPlan: kitchen, eye, eyes: 'outside', previs: { names } } }],
      };
      writeFileSync(join(dir, 'p.json'), JSON.stringify(packet));
      const run = (...more: string[]) =>
        Bun.spawnSync(
          ['bun', 'run', join(import.meta.dir, '..', 'evals', 'set-render.ts'), '--packet', join(dir, 'p.json')].concat(
            ['--out', dir, ...(more.includes('--cut') ? [] : ['--cut', 'm1']), ...more],
          ),
          { env: { ...process.env, DREAMCHAT_FRAME: '' } },
        );
      expect(run().exitCode).toBe(0);
      // Under the packet's switches, the camera rules on (a scooter drawn as ridden), whatever this process has.
      const direct = withEnv(
        { DREAMCHAT_RECORD: 'on', DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_FRAME: undefined },
        () => previsSet(kitchen, eye, name, eye),
      );
      expect(readFileSync(join(dir, 'm1-set-idmap.png')).equals(Buffer.from(direct.idmap))).toBe(true);
      expect(run('--at', '1.75,0.6', '--look', '0,1', '--name', 'turned').exitCode).toBe(0);
      const turned = JSON.parse(readFileSync(join(dir, 'turned.json'), 'utf8'));
      expect(turned.eye).toMatchObject({ at: { x: 1.75, y: 0.6 }, d: { x: 0, y: 1 }, height: 1.6, pitch: -0.25 });
      expect(turned.ids.map((e: { id: string }) => e.id)).toContain('back wall');
      // The reverse angle: across the middle of the room on the same line, looking back; turned, where it stands.
      expect(run('--reverse', '--name', 'rev').exitCode).toBe(0);
      const rev = JSON.parse(readFileSync(join(dir, 'rev.json'), 'utf8'));
      expect(rev.eye).toMatchObject({ at: { x: 1.75, y: 0.2 }, d: { x: 0, y: 1 } });
      expect(rev.ids.map((e: { id: string }) => e.id)).toContain('back wall');
      expect(run('--turn', '--name', 'turn').exitCode).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, 'turn.json'), 'utf8')).eye).toMatchObject({
        at: { x: 1.75, y: 2.9 },
        d: { x: 0, y: 1 },
      });
      // A partial eye keeps the rest of the cut's camera; nothing that is not a camera is drawn.
      expect(run('--eye', '{"at":{"x":2}}', '--name', 'partial').exitCode).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, 'partial.json'), 'utf8')).eye.at).toEqual({ x: 2, y: 2.9 });
      expect(run('--cut', 'm9').exitCode).not.toBe(0);
      expect(run('--look', '0,0').exitCode).not.toBe(0);
      expect(run('--height', 'tall').exitCode).not.toBe(0);
      expect(run('--at', '3').exitCode).not.toBe(0);
      expect(run('--reverse', '--turn').exitCode).not.toBe(0);
      expect(run('--name', 'a', '--name', 'b').exitCode).not.toBe(0);
      expect(run('--name', '--reverse').exitCode).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the reverse angle: across the middle on its own line, inside the room; turned round where the middle is behind', () => {
    const room = { room: [3.5, 3] as [number, number], indoors: true };
    // From beyond the back wall, across the room: kept 0.2 m inside the front wall, on the same line.
    expect(reversed({ ...eye, at: { x: 1.75, y: 3.4 } }, room)).toEqual({
      at: { x: 1.75, y: 0.2 },
      d: { x: -0, y: 1 },
    });
    // Looking away from the middle: turned round where it stands, never put in front of itself.
    expect(reversed({ ...eye, at: { x: 1.75, y: 2 }, d: { x: 0, y: 1 } }, room)).toEqual({
      at: { x: 1.75, y: 2 },
      d: { x: -0, y: -1 },
    });
    // At a slant from outside the room: slid along its line, never off it.
    const r = reversed({ ...eye, at: { x: -1, y: 0.5 }, d: { x: 1, y: 0.3 } }, room);
    expect(Math.abs((r.at.y - 0.5) * 1 - (r.at.x + 1) * 0.3)).toBeLessThan(1e-3);
    expect(r.at.x).toBeLessThanOrEqual(3.3 + 1e-9);
    expect(r.at.y).toBeLessThanOrEqual(2.8 + 1e-9);
    // Outdoors, the mirror itself.
    expect(reversed({ ...eye, at: { x: 1.75, y: 4 } }, { room: [3.5, 3], indoors: false }).at).toEqual({
      x: 1.75,
      y: -1,
    });
  });

  test("a sitting crowd's seats stand where the cut's frame has them, from whichever eye", () => {
    const packet = {
      dream: { switches: {} },
      cuts: [{ identity: { cut: 'm1' }, camera: { floorPlan: kitchen, eye, eyes: 'outside', previs: { names } } }],
    } as unknown as DreamPacket;
    const seatsAt = (png: Uint8Array, ids: { id: string; rgb: number[] }[]) =>
      idsAt(png, ids).at.filter((x) => x === 'c1 seats').length;
    const other: Eye = { ...eye, at: { x: 0.3, y: 2.8 }, d: { x: 0.4, y: -1 } };
    const fromOther = renderFromPacket(packet, 'm1', { eye: other }).set;
    // Laid out from the cut's own camera, then seen from the other: as the cut's set's seats are, seen from there.
    const asCut = previsSet(kitchen, other, name, eye);
    expect(seatsAt(fromOther.idmap, fromOther.ids)).toBe(seatsAt(asCut.idmap, asCut.ids));
    expect(seatsAt(fromOther.idmap, fromOther.ids)).toBeGreaterThan(0);
  });
});
