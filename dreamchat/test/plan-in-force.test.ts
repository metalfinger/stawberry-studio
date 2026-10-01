import { describe, expect, test } from 'bun:test';
import { loadDream } from '../evals/saved';
import { dreamNowOf, planInForce, type Session } from '../session';
import type { Item } from '../sheets';

/** Some switches set for one call, put back after. */
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

const ON = { DREAMCHAT_RECORD: 'on', DREAMCHAT_ONE_BUILDER: 'fresh_send', DREAMCHAT_FRESH_SEND: undefined };

/** The snow train, every moment open again, and one moment's own copy of its plan out of date: nobody in it. */
function stale(id: string): { s: Session; f: Item } {
  const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session) as Session;
  for (const x of s.build?.frames ?? []) delete x.review;
  const f = s.build!.frames!.find((x) => x.id === id)!;
  f.frame!.plan = { ...f.frame!.plan!, visible: [], needs: [] };
  f.needs = [];
  return { s, f };
}

describe('S6 row 17: a moment is sent from the plan in force', () => {
  test('with the `fresh_send` step, a moment whose copy of its plan is out of date goes out with the plan made now', () =>
    withEnv(ON, () => {
      const { s, f } = stale('m2');
      const now = dreamNowOf(s).plan!.cuts.find((c) => c.id === 'm2')!;
      expect(planInForce(s, f)).toBe(true);
      expect(f.frame!.plan).toEqual(now);
      expect(f.needs).toEqual(now.needs);
      expect((f.frame!.plan!.visible ?? []).length).toBeGreaterThan(0);
      expect(s.build!.plan!.cuts.find((c) => c.id === 'm2')).toEqual(now);
    }));

  test('one reviewed, or approved for its continuity, keeps its own', () =>
    withEnv(ON, () => {
      for (const mark of ['review', 'continuityApproved'] as const) {
        const { s, f } = stale('m2');
        if (mark === 'review') f.review = 'approved' as Item['review'];
        else f.continuityApproved = true as Item['continuityApproved'];
        const own = structuredClone(f.frame!.plan);
        expect(planInForce(s, f)).toBe(false);
        expect(f.frame!.plan).toEqual(own);
      }
    }));

  // With the references on, a cut waits only for what it sends, and nothing in the undrawn snow train sends anything:
  // the moment that needs a picture is had with them off, as the plan names its needs. Passing with them on only when
  // an earlier file left a plan made without them in the cache (dreamNowOf, now keyed by them).
  test('one whose plan made now needs a picture not in the dream yet keeps its own, for a re-plan', () =>
    withEnv({ ...ON, DREAMCHAT_REFS: undefined }, () => {
      const { s } = stale('m2');
      const plan = dreamNowOf(s).plan!;
      const cut = plan.cuts.find((c) => [...c.needs, ...c.refs.map((r) => r.id)].length > 0)!;
      const needed = [...cut.needs, ...cut.refs.map((r) => r.id)][0];
      const f = s.build!.frames!.find((x) => x.id === cut.id)!;
      s.build!.frames = s.build!.frames!.filter((x) => x.id !== needed);
      const own = structuredClone(f.frame!.plan);
      expect(planInForce(s, f)).toBe(false);
      expect(f.frame!.plan).toEqual(own);
    }));

  test('with the builder at a step before it, a moment keeps its own copy, as before', () =>
    withEnv({ ...ON, DREAMCHAT_ONE_BUILDER: 'own_hands' }, () => {
      const { s, f } = stale('m2');
      const own = structuredClone(f.frame!.plan);
      expect(planInForce(s, f)).toBe(false);
      expect(f.frame!.plan).toEqual(own);
    }));
});
