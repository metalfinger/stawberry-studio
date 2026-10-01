import { describe, expect, test } from 'bun:test';
import type { Blocking, Spot } from '../blocking';
import { ATTEND, spotNamed, withAttention } from '../continuity';

const person = (id: string, x: number, y: number, extra: Partial<Spot> = {}): Spot =>
  ({ id, kind: 'person', x, y, name: id, ...extra }) as Spot;
const thing = (id: string, name: string, x: number, y: number, extra: Partial<Spot> = {}): Spot =>
  ({ id, kind: 'thing', name, x, y, ...extra }) as Spot;
const plan = (spots: Spot[]): Blocking => ({ indoors: true, room: { w: 8, d: 8 }, spots }) as unknown as Blocking;

describe('plan_facing: whom or what someone attends to is what they face', () => {
  test('acts of attention, and not acts of being beside', () => {
    for (const does of ['stands at', 'looks at', 'looks up at', 'watches', 'points at', 'reaches for', 'turns to'])
      expect(ATTEND.test(does)).toBe(true);
    for (const does of ['stands beside', 'sits with', 'walks to', 'holds']) expect(ATTEND.test(does)).toBe(false);
  });

  test('the target by its id, or by the name sharing most of its words', () => {
    const p = plan([thing('x1', 'fish stall', 2, 2), thing('t1', 'fish', 2, 2.2), person('p1', 4, 4)]);
    expect(spotNamed(p, 'x1')?.id).toBe('x1');
    expect(spotNamed(p, 'the fish stall')?.id).toBe('x1');
    expect(spotNamed(p, 'the lantern')).toBeUndefined();
  });

  test('turns the one attending to it; never the camera’s own dreamer, a rider, or anyone for an act of being beside', () => {
    const p = plan([
      thing('x1', 'fish stall', 2, 2),
      person('p1', 4, 4, { faces: 'p3' }),
      person('p2', 5, 5, { faces: 'p3' }),
      person('p3', 1, 1),
    ]);
    const acts = [
      { who: 'p1', does: 'stands at', to: 'the fish stall' },
      { who: 'p2', does: 'stands beside', to: 'the fish stall' },
    ];
    const out = withAttention(p, acts);
    expect(out.spots.find((s) => s.id === 'p1')?.faces).toBe('x1');
    expect(out.spots.find((s) => s.id === 'p2')?.faces).toBe('p3');
    // Through the dreamer's own eyes, the camera is theirs: it is turned by the camera rules, never by an act.
    expect(withAttention(p, acts, 'p1').spots.find((s) => s.id === 'p1')?.faces).toBe('p3');
    // Nothing to attend to: the plan as it was, the same object.
    expect(withAttention(p, [])).toBe(p);
  });
});
