// A thing in more than one pair of hands at once is in all of them (the one builder's `shared_holds`): the bed sheet the
// grandmother and the dreamer fold together, stretched between them, was in her hands alone in the record, the plan, the
// prompt and the mock-up (the merged flow's Grandmother, 2-3 Oct); handed over, the record had the one given it where the
// plan had the one handing it (eight handovers). Many of it held together is some in each one's hands, never one held
// between them (the two bowls of noodles, night market m3).
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Blocking, Spot } from '../blocking';
import { shotPlan } from '../continuity';
import { toV8, validatePacket } from '../contract';
import { PROFILE } from '../evals/profile';
import { loadDream } from '../evals/saved';
import { dreamPacket, PACKET_SCHEMA, validate } from '../packet';
import { rebuild } from '../plan';
import { heldBetween, previsKeyed, readPng } from '../previs';
import { describeAt, nowAt, recheckRecord } from '../record';
import { withWorld, worldOf } from '../resolvers';
import type { Session } from '../session';
import type { TypedReading } from '../typed';

setDefaultTimeout(240_000);

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

const act = (moment: string, ...acts: { who: string; does: string; to: string }[]): TypedReading =>
  ({ moment, facts: acts.map((a) => ({ kind: 'act', ...a, checks: [], ok: true })) }) as unknown as TypedReading;

/**
 * The lighthouse dream (affd), with the moments' typed acts as given: at m4 the father and the dreamer both fold the
 * boat; at m5 the father hands it over, its "to" the boat and whom ("t2 to p1"). `boat` renames it.
 */
function affd(typed: Record<string, TypedReading>, boat?: string): Session {
  const s = structuredClone(loadDream('dream-0925-231131-affd', false).session as Session);
  s.draft = { ...s.draft!, readings: { ...(s.draft?.readings ?? {}), typed } };
  // Renamed in the breakdown and on its sketch, the name the record says it by.
  if (boat)
    for (const t of [...(s.draft.breakdown!.things ?? []), ...(s.build?.items ?? [])]) if (t.id === 't2') t.name = boat;
  return s;
}
const TOGETHER = {
  m4: act('m4', { who: 'p3', does: 'folds', to: 't2' }, { who: 'p1', does: 'folds', to: 't2' }),
  m5: act('m5', { who: 'p3', does: 'hands', to: 't2 to p1' }),
};
const on = <T>(fn: () => T) => withEnv(PROFILE, fn);
const before = <T>(fn: () => T) => withEnv({ ...PROFILE, DREAMCHAT_ONE_BUILDER: 'contained_among' }, fn);
const moment = (r: ReturnType<typeof rebuild>, id: string) => r.dream!.record!.moments.find((m) => m.id === id)!;
const spot = (r: ReturnType<typeof rebuild>, cut: string, id: string) =>
  shotPlan(r.b, cut, r.rec)!.spots.find((s) => s.id === id)!;

describe('a thing held together, or handed over, is in both pairs of hands', () => {
  const r = on(() => rebuild(affd(TOGETHER)));

  test('the record: every pair of hands, its holder first; handed over, the one handing it first', () => {
    expect(moment(r, 'm4').hands).toEqual({ t2: ['p3', 'p1'] });
    expect(moment(r, 'm4').looks.t2.heldWith).toEqual(['p1']);
    // The act's "to" read as the boat and whom it goes to.
    expect(moment(r, 'm5').hands).toEqual({ t2: ['p3', 'p1'] });
    expect(moment(r, 'm5').held.t2).toBe('p1');
    expect(moment(r, 'm4').oneEach ?? []).toEqual([]);
  });

  test('the words: held between them; handed over, passing from one to the other', () => {
    const m4 = on(() => nowAt(r.dream!.record!, 'm4')).find((x) => x.of === 't2')?.text;
    expect(m4).toBe("the boat is held between my father's hands and the dreamer's");
    const m5 = on(() => nowAt(r.dream!.record!, 'm5')).find((x) => x.of === 't2')?.text;
    expect(m5).toBe("the boat passes from my father's hands to the dreamer's");
    expect(r.pictures.find((p) => p.id === 'm4')?.prompt).toContain("held between my father's hands and the dreamer's");
    expect(on(() => describeAt(r.dream!.record!, 'm4'))).toContain("held between my father's hands and the dreamer's");
  });

  test("the mock-up's words: each of them holding it, it with them, never a line of its own", () => {
    const prompt = r.pictures.find((p) => p.id === 'm4')!.prompt;
    expect(prompt).toMatch(/the dreamer, [^;\n]*holding the boat/);
    expect(prompt).toMatch(/my father, [^;\n]*holding the boat/);
    expect(prompt).not.toMatch(/Outside the picture[^.]*the boat/);
  });

  test('the floor plan: the first holds it, the others with them', () => {
    for (const cut of ['m4', 'm5']) {
      const t = on(() => spot(r, cut, 't2'));
      expect(t.heldBy).toBe('p3');
      expect(t.heldWith).toEqual(['p1']);
      expect(t.heldEach).toBeUndefined();
    }
  });

  test('the world: held by both, the record and the plan agreeing', () => {
    for (const cut of ['m4', 'm5']) {
      const { values, conflicts } = on(() => worldOf(r, cut));
      expect(values.find((v) => v.entity === 't2' && v.attr === 'held_by')).toMatchObject({
        value: ['p3', 'p1'],
        by: 'record.held',
      });
      expect(conflicts.filter((c) => c.includes('held_by'))).toEqual([]);
    }
  });

  test("version 7 leaves out whoever else holds it; version 8's world says it", () => {
    const pk = on(() => dreamPacket(r, { dream: 'affd', style: affd(TOGETHER).style!, history: () => [] }));
    expect(validate(PACKET_SCHEMA, pk)).toEqual([]);
    const cut = pk.cuts.find((c) => c.identity.cut === 'm4')!;
    expect(cut.camera.floorPlan?.spots.some((s) => 'heldWith' in s || 'heldEach' in s)).toBe(false);
    const v8 = on(() => withWorld(toV8(pk), r));
    expect(validatePacket(v8)).toEqual([]);
    const world = v8.cuts.find((c) => c.identity.cut === 'm4')!.contract.world_at!;
    expect(world.find((v) => v.entity === 't2' && v.attr === 'held_by')?.value).toEqual(['p3', 'p1']);
  });

  test('without the step, one pair of hands as before, and an act\'s "t2 to p1" unread as before', () => {
    const b = before(() => rebuild(affd(TOGETHER)));
    expect(moment(b, 'm4').hands).toBeUndefined();
    expect(before(() => spot(b, 'm4', 't2')).heldWith).toBeUndefined();
    expect(moment(b, 'm5').hands).toBeUndefined();
    expect(moment(b, 'm5').giving).toBeUndefined();
  });

  test("a version 7 packet keeps to its schema with the moment's facts from the plan, no cut sheet", () => {
    const sheetless = { ...PROFILE, DREAMCHAT_CUT_SHEET: 'off' };
    const b = withEnv(sheetless, () => rebuild(affd(TOGETHER)));
    const pk = withEnv(sheetless, () =>
      dreamPacket(b, { dream: 'affd', style: affd(TOGETHER).style!, history: () => [] }),
    );
    expect(validate(PACKET_SCHEMA, pk)).toEqual([]);
  });
});

describe('only where more than one does it', () => {
  test('held by one alone: one pair of hands', () => {
    const r = on(() => rebuild(affd({ m4: act('m4', { who: 'p3', does: 'holds', to: 't2' }) })));
    expect(moment(r, 'm4').hands).toBeUndefined();
    expect(on(() => spot(r, 'm4', 't2')).heldWith).toBeUndefined();
  });

  test('each their own: never one held together', () => {
    const own = {
      m4: act('m4', { who: 'p3', does: 'folds', to: 'his boat' }, { who: 'p1', does: 'folds', to: 'her boat' }),
    };
    const r = on(() => rebuild(affd(own)));
    expect(moment(r, 'm4').hands).toBeUndefined();
  });

  test('handed on by the floor plan alone, no giving act: one pair of hands, the record and the plan agreeing', () => {
    // The suitcase dream (b0cb) with no typed readings: the record has the suitcase handed on at m5 from the plan alone.
    const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session as Session);
    s.draft = { ...s.draft!, readings: { ...(s.draft?.readings ?? {}), typed: {} } };
    const r = on(() => rebuild(s));
    const m5 = moment(r, 'm5');
    expect(m5.handed.t1).toBe('p2');
    expect(m5.hands).toBeUndefined();
    expect(on(() => spot(r, 'm5', 't1')).heldWith).toBeUndefined();
    const { conflicts } = on(() => worldOf(r, 'm5'));
    expect(conflicts).toEqual([]);
  });

  test('the record run again: the same holds, nothing new to say', () => {
    const r = on(() => rebuild(affd(TOGETHER)));
    const again = on(() => recheckRecord(r.dream!.record!, { typed: TOGETHER }));
    expect(again.filter((v) => v.detail.includes('hands at once'))).toEqual([]);
  });

  test('many of it held together: some in each one, never held between them', () => {
    const r = on(() => rebuild(affd(TOGETHER, 'the two boats')));
    expect(moment(r, 'm4').oneEach).toEqual(['t2']);
    const m4 = on(() => nowAt(r.dream!.record!, 'm4')).find((x) => x.of === 't2')?.text;
    expect(m4).toBe("the two boats are in my father's hands and the dreamer's");
    expect(on(() => spot(r, 'm4', 't2')).heldEach).toBe(true);
    // Handed over, it passes as one, many of it or not.
    expect(moment(r, 'm5').oneEach ?? []).toEqual([]);
  });
});

describe('on the mock-up, between their hands', () => {
  const plan = (gap: number, size: [number, number, number]): Blocking => ({
    front: 'the window',
    indoors: true,
    room: [6, 4],
    spots: [
      { id: 'p1', x: 1, y: 2, kind: 'person', pose: 'standing', faces: 'p2' },
      { id: 'p2', x: 1 + gap, y: 2, kind: 'person', pose: 'standing', faces: 'p1' },
      { id: 't1', x: 1, y: 2, kind: 'thing', size, heldBy: 'p1', heldWith: ['p2'] },
    ],
  });
  const of = (p: Blocking) => heldBetween(p.spots[2] as Spot, p, p.spots[2].size!, undefined, [])!;

  test('a sheet stretched between two a metre and a half apart: halfway, as wide as the gap between their hands', () => {
    const b = of(plan(1.5, [2.2, 1.5, 0.01]));
    expect(b.x).toBeCloseTo(1.75, 5);
    expect(b.y).toBeCloseTo(2, 5);
    expect(b.w).toBeCloseTo(0.9, 5);
    // Across from one to the other.
    expect(Math.abs(b.f.x)).toBeCloseTo(0, 5);
    expect(b.z).toBeCloseTo(0.9, 5);
  });

  test("a small thing between two far apart: in the first one's hands, held out toward the other", () => {
    const b = of(plan(3, [0.2, 0.1, 0.1]));
    expect(b.x).toBeCloseTo(1 + 0.3 + 0.35 + 0.1, 5);
    expect(b.w).toBeCloseTo(0.2, 5);
  });

  test("with one of them the camera: from the camera's hands toward the other's, no taller than it holds anything", () => {
    const p = plan(1.2, [0.3, 0.3, 1.2]);
    const pov = { at: { x: 1, y: 2 }, d: { x: 1, y: 0 }, height: 1.62 };
    const b = heldBetween(p.spots[2] as Spot, p, [0.3, 0.3, 1.2], pov as never, ['p1'])!;
    // The camera's hands 0.45 before it; the other's 0.3 before them toward it: halfway, at the height between.
    expect(b.x).toBeCloseTo((1.45 + 1.9) / 2, 5);
    expect(b.h).toBeCloseTo(0.6, 5);
    expect(b.z).toBeCloseTo((1.62 - 0.5 - 0.3 + 0.9) / 2, 5);
  });

  test("out of reach of the other: at the first one's hands' height", () => {
    const p = plan(3, [0.2, 0.1, 0.1]);
    p.spots[1].pose = 'sitting';
    expect(of(p).z).toBeCloseTo(0.9, 5);
  });

  test('drawn: between the two on the id map; many of it, at each of them', () => {
    const eye = { at: { x: 1.6, y: 0.2 }, d: { x: 0, y: 1 }, height: 1.6 };
    const centre = (p: Blocking, id: string) => {
      const keyed = on(() => previsKeyed(p, eye as never, [], (x) => x, 192, 108, { idmap: true }));
      const { width, rgb } = readPng(keyed.idmap!.png);
      const e = keyed.idmap!.ids.find((x) => x.id === id)!;
      const xs: number[] = [];
      for (let i = 0; i < rgb.length / 3; i++)
        if (rgb[i * 3] === e.rgb[0] && rgb[i * 3 + 1] === e.rgb[1] && rgb[i * 3 + 2] === e.rgb[2]) xs.push(i % width);
      return {
        cx: xs.reduce((a, b) => a + b, 0) / xs.length / width,
        x0: Math.min(...xs) / width,
        x1: Math.max(...xs) / width,
      };
    };
    const p = plan(1.2, [0.4, 0.3, 0.3]);
    const [a, b, t] = ['p1', 'p2', 't1'].map((id) => centre(p, id));
    const [lo, hi] = [Math.min(a.cx, b.cx), Math.max(a.cx, b.cx)];
    expect(t.cx).toBeGreaterThan(lo);
    expect(t.cx).toBeLessThan(hi);
    p.spots[2].heldEach = true;
    const each = centre(p, 't1');
    expect(each.x0).toBeLessThan(lo + 0.1);
    expect(each.x1).toBeGreaterThan(hi - 0.1);
  });

  test('one holder on the plan: nothing between', () => {
    const p = plan(1.2, [0.3, 0.3, 0.01]);
    p.spots = p.spots.filter((s) => s.id !== 'p2');
    expect(heldBetween(p.spots[1] as Spot, p, [0.3, 0.3, 0.01], undefined, [])).toBeUndefined();
  });
});
