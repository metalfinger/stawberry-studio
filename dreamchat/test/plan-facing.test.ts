import { describe, expect, test } from 'bun:test';
import type { Blocking, Spot } from '../blocking';
import { ATTEND, spotNamed, withAttention } from '../continuity';
import { loadDream } from '../evals/saved';
import { recordForPlan, recordInputsOf } from '../record';
import type { Session } from '../session';
import type { TypedReading } from '../typed';

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

  test('only a person turns, never a crowd; not to what they hold or stand on, nor at a door they stand at', () => {
    const p = plan([
      thing('x1', 'fish stall', 2, 2),
      thing('d1', 'the gate', 0, 4, { fixture: true }),
      thing('k1', 'the key', 4, 4, { heldBy: 'p1' } as Partial<Spot>),
      person('p1', 4, 4, { faces: 'front' }),
      person('c1', 6, 6, { many: true, faces: 'front' }),
      person('g1', 1, 4, { faces: 'front' }),
    ]);
    const out = withAttention(p, [
      { who: 'c1', does: 'watches', to: 'x1' },
      { who: 'p1', does: 'looks at', to: 'k1' },
      { who: 'p1', does: 'reads', to: 'k1' },
      { who: 'g1', does: 'stands at', to: 'the gate' },
    ]);
    expect(out).toBe(p);
    const turned = withAttention(p, [{ who: 'p1', does: 'looks at', to: 'x1' }]).spots.find((s) => s.id === 'p1')!;
    expect(turned.faces).toBe('x1');
    // Marked as turned by attending, which the view and the camera words read (only they say "looking at").
    expect(turned.attending).toBe(true);
  });
});

describe('plan_motion: a vehicle moving or still as the typed reading says', () => {
  test("the taken motion facts reach the plan's record only with the step", () => {
    const s = loadDream('dream-0926-022102-aeea', false).session as Session;
    const b = s.draft!.breakdown!;
    const { items, words } = recordInputsOf(s);
    const typed: Record<string, TypedReading> = {
      m12: { moment: 'm12', facts: [{ kind: 'motion', who: 't3', moving: true, ok: true } as never] },
    };
    const readings = { ...(s.draft?.readings ?? {}), typed } as never;
    const at = (step: string) => {
      const was = { r: process.env.DREAMCHAT_RECORD, b: process.env.DREAMCHAT_ONE_BUILDER };
      process.env.DREAMCHAT_RECORD = 'on';
      process.env.DREAMCHAT_ONE_BUILDER = step;
      try {
        return recordForPlan(b, items, readings, { words, style: s.style })?.moments.m12?.motion;
      } finally {
        for (const [k, v] of [
          ['DREAMCHAT_RECORD', was.r],
          ['DREAMCHAT_ONE_BUILDER', was.b],
        ] as const)
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
      }
    };
    expect(at('plan_motion')).toEqual([{ who: 't3', moving: true }]);
    expect(at('sketch_subjects')).toBeUndefined();
  });
});
