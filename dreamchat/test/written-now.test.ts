// The prompt written for the local machine says a thing as it is now, and a thing the moment has in view has a place
// on the keyed mock-up and its id map however small (the one builder's `written_now` and `tiny_marker`): the merged
// flow's Grandmother (2 Oct) had the bed sheet folded down to a stamp written "a plain full-size bed sheet" at every
// fold, and the stamp between their fingers had 20 pixels at m8, no region for a harness to find it by.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Blocking, Eye, Spot } from '../blocking';
import { cutSheet, type SheetElement } from '../cutsheet';
import { PROFILE } from '../evals/local-draw';
import { qwenEdit } from '../evals/qwen-prompt';
import { frozenDreams, loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { previsKeyed } from '../previs';
import type { State } from '../producer';
import { calledFor, previsFor, previsKeyedFor, type Session } from '../session';

setDefaultTimeout(120_000);

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

/** A frozen cut with a thing in view, rebuilt with the full profile: its rebuild, its picture and the thing. */
function aCut() {
  for (const id of frozenDreams()) {
    const s = loadDream(id, false).session as Session;
    const r = rebuild(s, { asDrawn: false });
    for (const p of r.pictures) {
      const prop = p.sheet?.inView.find((e) => e.kind === 'prop');
      if (p.kind === 'cut' && p.sheet && p.assembled && p.item.frame?.plan && prop) return { s, r, p, prop };
    }
  }
  throw new Error('no frozen cut with a thing in view');
}

describe('the written prompt says a thing as it is now', () => {
  const change = (what: string, now: string, since: string, part?: string): State => ({
    who: '',
    what,
    now,
    since,
    ...(part ? { part } : {}),
  });
  /** The cut sheet's `now` for the thing, with these changes its own and carried. */
  const nowWith = (step: string, own: State[], states: State[]) =>
    withEnv({ ...PROFILE, DREAMCHAT_ONE_BUILDER: step }, () => {
      const { s, r, p, prop } = aCut();
      const who = (xs: State[]) => xs.map((x) => ({ ...x, who: prop.id }));
      const frame = structuredClone(p.item);
      frame.frame!.plan = { ...frame.frame!.plan!, own: who(own), states: who(states) };
      const sheet = cutSheet({
        frame,
        sheets: r.sheets,
        style: s.style!,
        inputs: [],
        dream: { breakdown: r.b, tree: null, record: null },
      });
      return sheet.inView.find((e) => e.id === prop.id)?.now;
    });
  const ms = (() => {
    const { r } = withEnv({ ...PROFILE }, aCut);
    return r.b.scenes.flatMap((x) => x.moments.map((m) => m.id));
  })();

  test("this moment's own change of its size or whole, before one carried", () => {
    expect(
      nowWith('on', [change('form', 'a handkerchief', ms[1])], [change('size', 'the size of a stamp', ms[0])]),
    ).toEqual({ says: 'a handkerchief', whole: true });
  });

  test('of those carried, the one from the latest moment, whatever order they come in', () => {
    const [handkerchief, stamp] = [change('size', 'a handkerchief', ms[0]), change('size', 'a stamp', ms[1])];
    expect(nowWith('on', [], [stamp, handkerchief])?.says).toBe('a stamp');
    expect(nowWith('on', [], [handkerchief, stamp])?.says).toBe('a stamp');
  });

  test('turned into something else, then its size changed: both; its size changed, then turned: only what it is', () => {
    const dove = change('form', 'a white dove', ms[0]);
    expect(nowWith('on', [change('size', 'the size of a house', ms[1])], [dove])).toEqual({
      says: 'a white dove, the size of a house',
      whole: true,
    });
    expect(
      nowWith('on', [], [change('size', 'the size of a house', ms[0]), change('form', 'a white dove', ms[1])]),
    ).toEqual({ says: 'a white dove', whole: true });
  });

  test('a change of its size by its part or its words, never a change of one of its parts', () => {
    expect(nowWith('on', [change('state', 'the size of a stamp', ms[0], 'size')], [])?.says).toBe(
      'the size of a stamp',
    );
    expect(nowWith('on', [change('its size', 'tiny', ms[0])], [])?.says).toBe('tiny');
    expect(nowWith('on', [change('lid', 'open', ms[0])], [])).toBeUndefined();
    // Reshaped, still what it was: the block of ice melted into a horse's head of ice.
    expect(nowWith('on', [{ ...change('shape', "a horse's head of ice", ms[0]), whole: false }], [])).toEqual({
      says: "a horse's head of ice",
      whole: false,
    });
    expect(nowWith('cast_fixture', [change('size', 'the size of a stamp', ms[0])], [])).toBeUndefined();
  });

  /** The written prompt for the cut with the thing's look and how it is now set as given. */
  const written = (look: string, now: SheetElement['now'], image = false) =>
    withEnv({ ...PROFILE }, () => {
      const { p, prop } = aCut();
      const sheet = structuredClone(p.sheet!);
      sheet.inView = sheet.inView.map((e) =>
        e.id === prop.id
          ? { ...e, name: 'the bed sheet', look, image: image ? e.image : null, ...(now ? { now } : {}) }
          : e,
      );
      // Without its own image, its own picture is left out of what is sent.
      const keep = p.assembled!.references.map((x) => image || !(x.role === 'prop' && x.subjects.includes(prop.id)));
      const refs = p.assembled!.references.filter((_, i) => keep[i]);
      const images = p.references
        .filter((_, i) => keep[i])
        .map((x, i) => ({ n: i + 1, role: x.role, name: x.media_id, file: x.media_id }));
      const lines = Object.fromEntries(p.assembled!.lines.map((l) => [l.id, l.text]));
      return qwenEdit(sheet, refs, images, lines).prompt;
    });

  test('its look without its first size, then how big it is now; never "now" twice', () => {
    const t = written('a plain full-size bed sheet, full size; folded neatly', {
      says: 'the size of a stamp',
      whole: false,
    });
    expect(t).toContain('the bed sheet, a plain bed sheet, now the size of a stamp');
    expect(t).not.toMatch(/full[- ]size/i);
    expect(written('a plain white bed sheet', { says: 'is now tiny', whole: false })).toContain(', now tiny');
    expect(written('a plain white bed sheet', { says: 'is now tiny', whole: false })).not.toContain('now is now');
  });

  test('every word of its first size left out, and its article mended', () => {
    const now = { says: 'the size of a stamp', whole: false };
    for (const [look, kept] of [
      ['a plain full size bed sheet', 'a plain bed sheet'],
      ['a huge, heavy wooden chest', 'a heavy wooden chest'],
      ['a normal-sized white bed sheet', 'a white bed sheet'],
      ['a king-size bed sheet', 'a bed sheet'],
      ['a large white bed sheet', 'a white bed sheet'],
      ['an enormous white bed sheet', 'a white bed sheet'],
      ['a white bed sheet, enormous and soft', 'a white bed sheet, soft'],
      ['a huge enormous old oak chest', 'an old oak chest'],
    ])
      expect(written(look, now)).toContain(`the bed sheet, ${kept}, now the size of a stamp`);
  });

  test('from its own image, how big it is now after it', () => {
    const t = written('a plain full-size bed sheet', { says: 'the size of a stamp', whole: false }, true);
    expect(t).toMatch(/the bed sheet from <image\d>, now the size of a stamp/);
  });

  test('turned into something else altogether, only what it is now', () => {
    const t = written('a plain full-size bed sheet', { says: 'a white dove', whole: true });
    expect(t).toContain('the bed sheet, now a white dove');
    expect(t).not.toContain('a plain');
  });

  test('without a change in force, word for word as before', () => {
    const t = written('a plain white bed sheet, full size', undefined);
    expect(t).toContain('the bed sheet, a plain white bed sheet, full size');
  });
});

describe('a thing the moment has in view, too small for the frame', () => {
  const kitchen: Blocking = {
    front: 'the window wall over the sink',
    indoors: true,
    room: [3.5, 3],
    spots: [
      { id: 'x3', x: 2.8, y: 0.3, kind: 'thing', size: [0.5, 0.6, 0.9], fixture: true, name: 'the cutlery drawer' },
      { id: 'p2', x: 2.2, y: 1.2, kind: 'person', faces: 'p1', pose: 'standing' },
      { id: 'p1', x: 1.4, y: 1.4, kind: 'person', faces: 'p2', pose: 'standing' },
      { id: 't1', x: 1.8, y: 1.3, kind: 'thing', size: [0.03, 0.001, 0.025], heldBy: 'p2', name: 'the bed sheet' },
    ],
  };
  const eye: Eye = { at: { x: 1.8, y: 2.9 }, d: { x: 0, y: -1 }, height: 1.6, pitch: -0.1 };
  const name = (id: string) => ({ p1: 'the dreamer', p2: 'my grandmother' })[id] ?? id;
  const [W, H] = [688, 384];
  const plan = (t1: Partial<Spot>, more: Spot[] = []): Blocking => ({
    ...kitchen,
    spots: [...kitchen.spots.map((s) => (s.id === 't1' ? ({ ...s, ...t1 } as Spot) : s)), ...more],
  });
  const marked = (b: Blocking, ids = ['t1']) =>
    withEnv(PROFILE, () => previsKeyed(b, eye, [], name, W, H, { idmap: true, marked: ids }));
  const entry = (k: ReturnType<typeof marked>, id = 't1') => k.idmap!.ids.find((e) => e.id === id);

  test('is a dot where it is on the keyed mock-up, its id map and its key; the clay stays true to size', () => {
    const plain = withEnv(PROFILE, () => previsKeyed(kitchen, eye, [], name, W, H, { idmap: true }));
    expect(entry(plain)?.pixels ?? 0).toBeLessThan(20);
    const k = marked(kitchen);
    expect(entry(k)?.marker).toBe(true);
    expect(entry(k)!.pixels).toBeGreaterThanOrEqual(20);
    expect(k.key.find((x) => x.id === 't1')?.marker).toBe(true);
    // Nothing marked, nothing changes: the same mock-up and id map, byte for byte.
    const none = withEnv(PROFILE, () => previsKeyed(kitchen, eye, [], name, W, H, { idmap: true, marked: [] }));
    expect(Buffer.from(none.png).equals(Buffer.from(plain.png))).toBe(true);
    expect(Buffer.from(none.idmap!.png).equals(Buffer.from(plain.idmap!.png))).toBe(true);
  });

  test('never out of the frame, nor behind someone or something', () => {
    // At hand height behind the dreamer, not held: hidden by them.
    const behind = plan({ heldBy: undefined, x: 1.4, y: 1.2, above: 1.0 });
    expect(entry(marked(behind))?.marker).toBeUndefined();
    // Put away in the cutlery drawer, shut: its front hides it.
    const away = plan({ heldBy: undefined, x: 2.8, y: 0.3, above: 0.74 });
    expect(entry(marked(away))?.marker).toBeUndefined();
    // Each in the frame: with what hides it gone, it shows (43 pixels, more than a dot's 29) or is a dot.
    const without = (b: Blocking, id: string) => ({ ...b, spots: b.spots.filter((x) => x.id !== id) });
    expect(entry(marked(without(behind, 'p1')))!.pixels).toBeGreaterThan(29);
    expect(entry(marked(without(away, 'x3')))?.marker).toBe(true);
    // Looking the other way.
    const out = withEnv(PROFILE, () =>
      previsKeyed(kitchen, { ...eye, d: { x: 0, y: 1 } }, [], name, W, H, { idmap: true, marked: ['t1'] }),
    );
    expect(entry(out)).toBeUndefined();
  });

  // Held by someone alone in a room, the stamp a third the size of the kitchen's.
  const stamp: Spot = {
    id: 't1',
    x: 0,
    y: 0,
    kind: 'thing',
    size: [0.012, 0.001, 0.01],
    heldBy: 'p2',
    name: 'a stamp',
  };
  const room = (spots: Spot[]): Blocking => ({ front: 'the wall', indoors: true, room: [3.5, 3], spots });
  const both = (spots: Spot[], ids = ['t1']) => ({
    plain: withEnv(PROFILE, () => previsKeyed(room(spots), eye, [], name, W, H, { idmap: true })),
    dotted: marked(room(spots), ids),
  });
  const holder = (faces: string, y = 1.3): Spot => ({ id: 'p2', x: 1.8, y, kind: 'person', pose: 'standing', faces });

  test("in the hand, a dot; behind its holder's own body, none", () => {
    expect(entry(both([holder('back'), stamp]).dotted)?.marker).toBe(true);
    const back = both([holder('left', 1.5), stamp]);
    expect(entry(back.plain)?.pixels ?? 0).toBe(0);
    expect(entry(back.dotted)?.marker).toBeUndefined();
  });

  test('in a suitcase in the same hand: in it, no dot', () => {
    const suitcase: Spot = { id: 't3', x: 0, y: 0, kind: 'thing', size: [0.3, 0.2, 0.25], heldBy: 'p2', name: 'a box' };
    const k = both([holder('back'), stamp, suitcase], ['t1', 't3']);
    expect(entry(k.plain)?.pixels ?? 0).toBe(0);
    expect(entry(k.dotted)?.marker).toBeUndefined();
  });

  test('in the hands of someone in a car, a dot over the car; behind a crate, none', () => {
    const rider: Spot = { id: 'p2', x: 1.8, y: 0.5, kind: 'person', pose: 'sitting', faces: 'back' };
    const car = (shape: 'vehicle' | 'block'): Spot => ({
      id: 'v1',
      x: 1.8,
      y: 0.5,
      kind: 'thing',
      shape,
      size: [1.6, 2.4, 1.2],
      name: shape === 'vehicle' ? 'the car' : 'the crate',
    });
    expect(entry(both([car('vehicle'), rider, stamp], ['t1', 'v1']).dotted)?.marker).toBe(true);
    expect(entry(both([car('block'), rider, stamp], ['t1', 'v1']).dotted)?.marker).toBeUndefined();
  });

  test('held up in front of someone else, a dot over them', () => {
    const p1: Spot = { id: 'p1', x: 1.3, y: 0.3, kind: 'person', pose: 'standing', faces: 'back' };
    const k = both([p1, holder('back', 1.0), stamp]);
    expect(entry(k.dotted)?.marker).toBe(true);
    expect(entry(k.dotted, 'p1')!.pixels).toBeLessThan(entry(k.plain, 'p1')!.pixels);
  });

  test('two side by side are two dots; a ring held with the stamp keeps every pixel it had', () => {
    const at = (id: string, x: number): Spot => ({ ...stamp, id, x, y: 1.3, heldBy: undefined, above: 1.0 });
    const two = both([at('t1', 1.7), at('t2', 1.74)], ['t1', 't2']);
    for (const id of ['t1', 't2']) {
      expect(entry(two.dotted, id)?.marker).toBe(true);
      expect(entry(two.dotted, id)!.pixels).toBeGreaterThan(entry(two.plain, id)!.pixels);
    }
    const ring: Spot = { id: 't9', x: 0, y: 0, kind: 'thing', size: [0.02, 0.001, 0.02], heldBy: 'p2', name: 'a ring' };
    const k = both([holder('back'), stamp, ring]);
    expect(entry(k.dotted)?.marker).toBe(true);
    expect(entry(k.dotted, 't9')!.pixels).toBe(entry(k.plain, 't9')!.pixels);
  });

  test('big enough already, it is left as it is', () => {
    const box = plan({ heldBy: undefined, size: [0.4, 0.4, 0.4], x: 1.8, y: 1.0 });
    const k = marked(box);
    const plain = withEnv(PROFILE, () => previsKeyed(box, eye, [], name, W, H, { idmap: true }));
    expect(entry(k)?.marker).toBeUndefined();
    expect(Buffer.from(k.idmap!.png).equals(Buffer.from(plain.idmap!.png))).toBe(true);
  });

  // The paper boat in the dreamer's hands in the car (0926 aeea m11).
  test("with the step, a saved dream's tiny thing is marked, the clay unchanged; before it, nothing is", () => {
    const at = (step: string) =>
      withEnv({ ...PROFILE, DREAMCHAT_ONE_BUILDER: step }, () => {
        const s = loadDream('dream-0926-022102-aeea', false).session as Session;
        const r = rebuild(s, { asDrawn: false });
        const p = r.pictures.find((x) => x.id === 'm11')!;
        const called = calledFor({ build: s.build, draft: s.draft && { ...s.draft, breakdown: r.b } }, p.item);
        return {
          keyed: previsKeyedFor(r.b, p.item, called, r.rec, { idmap: true })!,
          clay: previsFor(r.b, p.item, called, r.rec)!,
        };
      });
    const [off, on] = [at('cast_fixture'), at('on')];
    expect(off.keyed.idmap!.ids.some((e) => e.marker)).toBe(false);
    expect(on.keyed.idmap!.ids.find((e) => e.id === 't2')?.marker).toBe(true);
    expect(Buffer.from(on.clay.png).equals(Buffer.from(off.clay.png))).toBe(true);
  });
});
