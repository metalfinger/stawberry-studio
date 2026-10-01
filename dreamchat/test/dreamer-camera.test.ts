// A dream told wholly through the dreamer's eyes still has its dreamer, as the camera (the one builder's
// `dreamer_camera` step). The producer lists the dreamer only where they are seen, so a dream never seen from outside
// had no dreamer on its floor plans, and its cameras had nowhere to stand: 4 of 7 moments of the Barley Degree, taken in
// as a dump, had none (1 Oct). Added as the camera, they are placed on the plan and never sketched.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shotPlan } from '../continuity';
import { importDream } from '../importer';
import { rebuild } from '../plan';
import { type Breakdown, normalizeBreakdown, throughEyes } from '../producer';
import { buildItems, type Session } from '../session';

setDefaultTimeout(120_000);

function withBuilder<T>(v: string | undefined, fn: () => T): T {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = v;
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

const d = (value: string | null = null, said = false) => ({ value, said });
const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  is_dreamer: false,
  protagonist: false,
  fields: { identity: d(), appearance: d(), wardrobe: d(), distinctive_features: d() },
  ...extra,
});
const moment = (id: string, eyes: 'dreamer' | 'outside', visible: string[]) => ({
  id,
  action: 'G.H. talks about barley degrees.',
  visible,
  things: [],
  place: 'l1',
  eyes,
  distance: 'medium',
  looks_at: 'G.H.',
  feeling: 'puzzled',
  visual_point: 'G.H. talking',
  purpose: 'the turn',
  continues: false,
  leaves: [],
  shift: '',
  key: id === 'm1',
  said: true,
});
const raw = (moments: ReturnType<typeof moment>[], people = [person('p1', 'g.h.', { protagonist: true })]) =>
  JSON.stringify({
    title: 'The Barley Degree',
    people,
    places: [
      {
        id: 'l1',
        name: 'the meeting room',
        fields: { geography: d('a church hall', true), landmarks: d(), light: d() },
      },
    ],
    things: [],
    scenes: [{ id: 's1', title: 'after the meeting', place: 'l1', mood: 'quiet', moments }],
    style_options: [],
  });

describe('the dreamer, as the camera', () => {
  test('a dream seen only through their eyes gets its dreamer, never sketched, and every moment its camera', () => {
    const { breakdown: b, notes } = withBuilder('dreamer_camera', () =>
      normalizeBreakdown(raw([moment('m1', 'dreamer', ['p1']), moment('m2', 'dreamer', ['p1'])])),
    );
    const me = b.people.find((p) => p.is_dreamer);
    expect(me).toMatchObject({ name: 'you', camera: true, protagonist: false });
    expect(b.people.filter((p) => p.protagonist).map((p) => p.id)).toEqual(['p1']);
    expect(notes.join(' ')).toContain('as the camera');
    // Placed on the plan as the eyes every moment is seen through.
    for (const m of b.scenes[0].moments) expect(throughEyes(b, m)).toBe(me!.id);
    // Never sketched: no one sees them.
    expect(buildItems(b).some((i) => i.isDreamer)).toBe(false);
  });

  test('a dream that lists its dreamer, one never seen through, and the step off: as before', () => {
    const seen = withBuilder('dreamer_camera', () =>
      normalizeBreakdown(
        raw(
          [moment('m1', 'outside', ['p1', 'p2']), moment('m2', 'dreamer', ['p1'])],
          [person('p1', 'g.h.', { protagonist: true }), person('p2', 'you', { is_dreamer: true })],
        ),
      ),
    ).breakdown;
    expect(seen.people.filter((p) => p.is_dreamer).map((p) => [p.id, p.camera])).toEqual([['p2', undefined]]);
    expect(buildItems(seen).some((i) => i.isDreamer)).toBe(true);
    const outside = withBuilder('dreamer_camera', () => normalizeBreakdown(raw([moment('m1', 'outside', ['p1'])])));
    expect(outside.breakdown.people.some((p) => p.is_dreamer)).toBe(false);
    const off = withBuilder('fresh_send', () => normalizeBreakdown(raw([moment('m1', 'dreamer', ['p1'])])));
    expect(off.breakdown.people.some((p) => p.is_dreamer)).toBe(false);
  });

  test('its id never takes one the dream already uses', () => {
    const b = withBuilder('dreamer_camera', () =>
      normalizeBreakdown(
        raw(
          [moment('m1', 'dreamer', ['p1', 'p2'])],
          [person('p1', 'g.h.', { protagonist: true }), person('p2', 'the man at the door')],
        ),
      ),
    ).breakdown;
    expect(new Set(b.people.map((p) => p.id)).size).toBe(b.people.length);
  });
});

describe('the camera dreamer, never a person in the picture', () => {
  // A dream with a moment through their eyes and one from outside: the dreamer is on the floor plan, as the eyes of the
  // first, and in no picture of the second, nor its mock-up (never drawn, they would come out a guessed stranger).
  test('an outside moment has them in no cut, no mock-up and no list of who is there', async () => {
    const FULL = ['DREAMCHAT_RECORD', 'DREAMCHAT_CUT_SHEET', 'DREAMCHAT_CAMERA', 'DREAMCHAT_ONE_BUILDER'];
    const was = Object.fromEntries(FULL.map((k) => [k, process.env[k]]));
    for (const k of FULL) process.env[k] = 'on';
    try {
      const { breakdown } = normalizeBreakdown(raw([moment('m1', 'dreamer', ['p1']), moment('m2', 'outside', ['p1'])]));
      const me = breakdown.people.find((p) => p.camera)!.id;
      const plan = (b: Breakdown) => {
        const out = structuredClone(b);
        out.scenes[0].blocking = {
          front: 'the stage',
          spots: [
            { id: 'p1', x: 3, y: 2, kind: 'person', faces: 'front', pose: 'standing' },
            { id: me, x: 3, y: 5, kind: 'person', faces: 'p1', pose: 'standing' },
          ],
          room: [8, 8],
          indoors: true,
        } as NonNullable<Breakdown['scenes'][number]['blocking']>;
        return out;
      };
      const data = mkdtempSync(join(tmpdir(), 'camera-'));
      const got = await importDream(
        { text: 'G.H. talked about barley degrees.', style: 'a woodcut print', id: 'dream-1001-000009-test', data },
        {
          producer: async () => ({ breakdown: structuredClone(breakdown), downgraded: [], notes: [], ms: 0 }),
          ownStyle: async () => ({
            id: 'own',
            name: 'a woodcut print',
            medium: 'a woodcut print',
            line: 'Cut in wood.',
            tokens: ['bold carved lines'],
            palette_hex: ['#222222', '#EEE8DD'],
            lighting_rules: 'Flat light.',
          }),
          block: async (b) => ({ breakdown: plan(b), notes: [] }),
          shot: async () => 'A brief.',
          supervise: async () => [],
          readings: async (x) => x,
          packet: () => null,
        },
      );
      const s = JSON.parse(readFileSync(got.state, 'utf8')) as Session;
      const r = rebuild(s);
      const outside = r.pictures.find((p) => p.id.endsWith('m2'))!;
      expect(outside).toBeDefined();
      expect(outside.inView.map((i) => i.id)).not.toContain(me);
      // Named only as whose eyes an earlier picture was seen through, never as someone in this one.
      expect(outside.prompt.replace(/through the dreamer's eyes/g, '')).not.toMatch(/\bthe dreamer\b|\byou\b/i);
      expect(shotPlan(r.b, 'm2', r.rec)?.spots.map((x) => x.id)).not.toContain(me);
      const rec = r.rec?.moments.m2;
      if (rec) expect([...rec.visible, ...rec.present]).not.toContain(me);
      // Through their eyes, they are the camera on the plan.
      expect(r.pictures.find((p) => p.id.endsWith('m1'))?.item.frame?.plan?.eye).toBeDefined();
    } finally {
      for (const k of FULL)
        if (was[k] === undefined) delete process.env[k];
        else process.env[k] = was[k];
    }
  });
});
