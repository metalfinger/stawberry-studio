import { describe, expect, test } from 'bun:test';
import { loadDream } from '../evals/saved';
import { momentKeys } from '../asdrawn';
import { dreamConfig } from '../dream';
import { initialState } from '../lib';
import { rebuild } from '../plan';
import { dreamNowOf, type Session, sheetDreamOf, treeInputOf, treePlanOf } from '../session';
import { resolveTree } from '../tree';

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

/** The panel's tree and the one every cut sheet reads, for a saved dream under a step of the one builder. */
function trees(id: string, step: string) {
  return withEnv({ DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_ONE_BUILDER: step }, () => {
    const s = structuredClone(loadDream(id, false).session) as Session;
    const input = treeInputOf(s);
    return { panel: input ? resolveTree(input) : null, sheet: sheetDreamOf(s)?.tree ?? null };
  });
}

describe('S6 row 2: one tree', () => {
  test('with the `one_tree` step, every cut sheet reads the tree the panel shows', () => {
    for (const id of ['dream-0926-043003-b0cb', 'dream-0925-231131-affd']) {
      const { panel, sheet } = trees(id, 'one_tree');
      expect(panel).not.toBeNull();
      expect(sheet).toEqual(panel);
    }
  });

  test('a moment not sent yet is in the tree as planned now; one reviewed keeps the plan it was drawn from', () =>
    withEnv({ DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_ONE_BUILDER: 'one_tree' }, () => {
      const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session) as Session;
      for (const x of s.build?.frames ?? []) delete x.review;
      const now = dreamNowOf(s).plan!;
      const cutOf = (id: string) => now.cuts.find((c) => c.id === id)!;
      // m2 not sent yet, its stored plan out of date: someone a re-plan dropped. m3 reviewed, its stored plan its own.
      const m2 = s.build!.frames!.find((x) => x.id === 'm2')!;
      const m3 = s.build!.frames!.find((x) => x.id === 'm3')!;
      m2.frame!.plan = { ...cutOf('m2'), visible: ['someone-dropped'] };
      m3.review = 'approved' as typeof m3.review;
      m3.frame!.plan = { ...cutOf('m3'), visible: ['kept-as-drawn'] };
      const plan = treePlanOf(s)!;
      expect(plan.cuts.find((c) => c.id === 'm2')!.visible).toEqual(cutOf('m2').visible);
      expect(plan.cuts.find((c) => c.id === 'm3')!.visible).toEqual(['kept-as-drawn']);
      // And that is the plan the sheets' one tree is resolved from.
      expect(treeInputOf(s)!.plan).toEqual(plan);
    }));

  test("the conversation's goals move the sheet's tree, never what makes a picture stale", () =>
    withEnv({ DREAMCHAT_RECORD: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_ONE_BUILDER: 'one_tree' }, () => {
      const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session) as Session;
      // A saved dream keeps no conversation state: given the goals a new conversation starts with.
      s.state = initialState(s.id, dreamConfig());
      s.askCounts = {};
      // A rebuild's sheets read the one tree too, goals and all (plan.ts treeInputWith).
      const keys = () => {
        const p = rebuild(s).pictures.find((x) => x.id === 'm2' && x.kind !== 'ghost')!;
        return momentKeys(p.sheet!, p.item.fields, (m) => m).keys;
      };
      const before = keys();
      for (const g of Object.keys(s.state.goals)) s.askCounts[g] = (s.askCounts[g] ?? 0) + 3;
      expect(keys()).toEqual(before);
    }));

  test('before it, a saved dream with no plan kept since its moments began had no tree on its sheets at all', () => {
    const { panel, sheet } = trees('dream-0926-043003-b0cb', 'fresh_send');
    expect(panel).not.toBeNull();
    expect(sheet).toBeNull();
  });
});
