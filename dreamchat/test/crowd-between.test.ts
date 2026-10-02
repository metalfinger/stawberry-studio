// Someone a moment's one thing to show sees past the people of a crowd is seen past them (the one builder's
// `crowd_between`): the merged flow's Train (2 Oct), where after the lecture people keep coming up to the dreamer while
// the man in the wheelchair waits across the hall, "glimpsed past the people pressing in". The people sat in rows at
// the far end of the hall, the man alone and in clear view across it.
import { describe, expect, test } from 'bun:test';
import type { Blocking, Spot } from '../blocking';
import { crowdBetween, seenPast } from '../continuity';
import { dreamerShot } from '../previs';

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
const ON = { DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on', DREAMCHAT_ONE_BUILDER: 'on' };

// The hall as its plan has it: the dreamer at the lectern, the man in the wheelchair across the hall, the people in rows.
const hall: Blocking = {
  front: 'the front where the dreamer lectures',
  indoors: true,
  room: [16, 20],
  spots: [
    { id: 'x1', x: 8, y: 1.5, kind: 'thing', size: [0.7, 0.5, 1.1], name: 'the lectern' },
    { id: 'p1', x: 8, y: 2.3, kind: 'person', faces: 'p2', pose: 'standing' },
    { id: 'p2', x: 14, y: 6, kind: 'person', faces: 'p1', pose: 'sitting' },
    { id: 'p3', x: 7, y: 12, kind: 'person', pose: 'sitting', many: true, spread: [10, 12] },
  ],
};
const names: Record<string, string> = { p1: 'you', p2: 'the man in the wheelchair', p3: 'the people' };
const name = (s: Spot) => s.name ?? names[s.id] ?? s.id;
const at = (plan: Blocking, id: string) => plan.spots.find((s) => s.id === id)!;

describe('who a moment sees past a crowd', () => {
  const point = (visual_point: string, plan = hall) => seenPast({ visual_point }, plan, name, 'p1');

  test('someone said seen past, through or between the people of a crowd named right after', () => {
    expect(point('the man in the wheelchair glimpsed past the people pressing in')).toEqual({ who: 'p2', crowd: 'p3' });
    expect(point('the man glimpsed past the people')).toEqual({ who: 'p2', crowd: 'p3' });
    expect(point('the man in the wheelchair, just visible between the people')).toEqual({ who: 'p2', crowd: 'p3' });
    // The one named nearest before: the woman turns to see him.
    const two = { ...hall, spots: [...hall.spots, { id: 'p4', x: 9, y: 2, kind: 'person' as const }] };
    names.p4 = 'the woman';
    expect(point('the woman turns to see the man glimpsed past the people', two)).toEqual({ who: 'p2', crowd: 'p3' });
  });

  test('never where the words say no such thing', () => {
    const twins = {
      ...hall,
      spots: hall.spots.map((s) => (s.id === 'p3' ? { ...s, count: 2 } : s)),
    };
    names.p4 = 'the woman';
    for (const words of [
      'the people pressing in around the dreamer',
      'the man in the wheelchair seen through the window',
      'you glimpsed past the people',
      'the man in the wheelchair and the woman, a look passing between them',
      'the man in the wheelchair, behind him the people',
      'the man still waiting past midnight when the people have gone',
      'the man watching through the window as the people gather',
      'the man rolling past the people',
      'the man looking past the people at the clock',
      'the man, over the heads of the people',
      'the man beyond the hall where the people sit',
    ])
      expect(point(words)).toBeUndefined();
    expect(point('the man seen between the people', twins)).toBeUndefined();
  });
});

describe('the crowd between the dreamer and them', () => {
  const moved = crowdBetween(hall, 'p1', 'p2', 'p3');

  test('on the line from the dreamer to the man, nearer the dreamer, standing, facing the dreamer', () => {
    const c = at(moved, 'p3');
    const d = Math.hypot(14 - 8, 6 - 2.3);
    const along = ((c.x - 8) * (14 - 8) + (c.y - 2.3) * (6 - 2.3)) / d;
    const off = Math.abs(((c.x - 8) * (6 - 2.3) - (c.y - 2.3) * (14 - 8)) / d);
    expect(off).toBeLessThan(1e-9);
    expect(along).toBeGreaterThan(1.5);
    expect(along).toBeLessThan(d - 1.2);
    expect(c).toMatchObject({ faces: 'p1', pose: 'standing', past: 'p2', spread: [5, 1.2] });
    // Everyone else where they were; nothing moves where the two stand too close to put anyone between.
    expect(moved.spots.filter((s) => s.id !== 'p3')).toEqual(hall.spots.filter((s) => s.id !== 'p3'));
    const close = { ...hall, spots: hall.spots.map((s) => (s.id === 'p2' ? { ...s, x: 8.5, y: 2.6 } : s)) };
    expect(crowdBetween(close, 'p1', 'p2', 'p3')).toBe(close);
    // Two metres apart, halfway, a row no deeper than a third of the way.
    const near = { ...hall, spots: hall.spots.map((s) => (s.id === 'p2' ? { ...s, x: 10, y: 2.3 } : s)) };
    expect(at(crowdBetween(near, 'p1', 'p2', 'p3'), 'p3')).toMatchObject({ x: 9, y: 2.3 });
    expect(at(crowdBetween(near, 'p1', 'p2', 'p3'), 'p3').spread![1]).toBeCloseTo(2 / 3, 6);
  });

  test('inside the walls: along a wall, the row is narrowed to the room', () => {
    const wall = {
      ...hall,
      spots: hall.spots.map((s) => (s.id === 'p1' ? { ...s, x: 1, y: 2 } : s.id === 'p2' ? { ...s, x: 1, y: 12 } : s)),
    };
    const c = at(crowdBetween(wall, 'p1', 'p2', 'p3'), 'p3');
    expect(c.x - c.spread![0] / 2).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(c.spread![0]).toBeLessThan(3);
  });

  test("through the dreamer's eyes: the people nearest, a gap through them, and him seen past them", () => {
    const v = withEnv(ON, () => dreamerShot(moved, 'p1', 'p2', (id) => names[id] ?? id))!;
    expect(v.inPicture).toEqual(expect.arrayContaining(['p2', 'p3']));
    expect(v.text).toContain('the people, many of them, standing between the camera and the man in the wheelchair');
    expect(v.text.indexOf('the people')).toBeLessThan(v.text.indexOf('Farthest'));
    expect(v.text).toMatch(/the man in the wheelchair, [^.]*(?:partly hidden behind|seen past) the people/);
    // Far back across the hall he is seen through the gap the people leave, whichever way the crowd's own rows fall.
    const far = crowdBetween(
      { ...hall, spots: hall.spots.map((s) => (s.id === 'p2' ? { ...s, x: 9, y: 16 } : s)) },
      'p1',
      'p2',
      'p3',
    );
    const f = withEnv(ON, () => dreamerShot(far, 'p1', 'p2', (id) => names[id] ?? id))!;
    expect(f.inPicture).toContain('p2');
    expect(f.text).not.toMatch(/Outside the picture[^.]*the man in the wheelchair/);
    // Without the step, the crowd is said where it stands, as before.
    const off = withEnv({ ...ON, DREAMCHAT_ONE_BUILDER: 'place_built' }, () =>
      dreamerShot(moved, 'p1', 'p2', (id) => names[id] ?? id),
    )!;
    expect(off.text).not.toContain('between the camera');
  });
});
