import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Breakdown } from '../producer';

// The engine's CLI reads its store from this, so it must be set before the module loads.
process.env.DREAMCHAT_STRAWBERRY_HOME = mkdtempSync(join(tmpdir(), 'dreamchat-strawberry-'));
const { planWrites, strawberryAvailable, writeProduction } = await import('../strawberry');

const breakdown = (await Bun.file(join(import.meta.dir, 'fixtures', 'breakdown.json')).json()) as Breakdown;
const style = breakdown.style_options[0];

describe('the plan', () => {
  const ops = planWrites(breakdown, style, 'Person: there was a board in my kitchen');

  test('what the person said is sourced to their words; what was filled in, to a proposal', () => {
    const place = ops.filter((o) => o.op === 'patch' && o.node === '$l1');
    expect(place.map((o) => (o.op === 'patch' ? [o.source, Object.keys(o.changes)] : []))).toEqual([
      ['$said', ['geography', 'landmarks']],
      ['$proposal', ['light']],
    ]);
  });

  test('every cut declares its scope, including empty lists', () => {
    const cuts = ops.filter((o) => o.op === 'patch' && o.node.startsWith('$m'));
    for (const c of cuts) {
      if (c.op !== 'patch') continue;
      expect(c.changes.visible_cast).toEqual([]);
      expect(c.changes.required_props).toEqual(['$t1']);
      expect(c.changes.location_id).toBe('$l1');
    }
    // The close-up takes the room from the wide: the continuity plan's link, and how it follows.
    const close = ops.find((o) => o.op === 'patch' && o.node === '$m2' && 'action' in o.changes);
    expect(close?.op === 'patch' && close.changes.continuity_from).toEqual(['$m1']);
    expect(close?.op === 'patch' && close.changes.transition).toBe('cut, carrying on');
  });
});

describe.skipIf(!strawberryAvailable())('written into an isolated Strawberry store', () => {
  test('the engine accepts it, and its open issues are the sheets and the continuity source, which come next', async () => {
    const r = await writeProduction(breakdown, style, 'Person: there was a board in my kitchen');
    expect(r.created).toMatchObject({ project: 1, location: 1, prop: 1, scene: 1, shot: 2, cut: 2 });
    // The close-up of the slat is drawn from the wide of the kitchen, so the wide must be
    // approved first: the engine checks the continuity chain itself.
    expect(r.issues.sort()).toEqual([
      'asset_reference: Approve and select a current reference for the departure board',
      'asset_reference: Approve and select a current reference for the kitchen',
      'continuity_take: Approve and select a current take for continuity source The kitchen, with the board on the wall',
    ]);
    expect(r.readyCuts).toBe(0);
  }, 30000);
});
