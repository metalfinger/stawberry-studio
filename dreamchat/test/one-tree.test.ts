import { describe, expect, test } from 'bun:test';
import { loadDream } from '../evals/saved';
import { type Session, sheetDreamOf, treeInputOf } from '../session';
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

  test('before it, a saved dream with no plan kept since its moments began had no tree on its sheets at all', () => {
    const { panel, sheet } = trees('dream-0926-043003-b0cb', 'fresh_send');
    expect(panel).not.toBeNull();
    expect(sheet).toBeNull();
  });
});
