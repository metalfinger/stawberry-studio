// A dream told wholly through the dreamer's eyes still has its dreamer, as the camera (the one builder's
// `dreamer_camera` step). The producer lists the dreamer only where they are seen, so a dream never seen from outside
// had no dreamer on its floor plans, and its cameras had nowhere to stand: 4 of 7 moments of the Barley Degree, taken in
// as a dump, had none (1 Oct). Added as the camera, they are placed on the plan and never sketched.
import { describe, expect, test } from 'bun:test';
import { normalizeBreakdown, throughEyes } from '../producer';
import { buildItems } from '../session';

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
