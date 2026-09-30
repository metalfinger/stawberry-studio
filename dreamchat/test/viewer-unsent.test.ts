// The harness viewer shows why each earlier picture the plan chose is not sent: the plan's own reasons
// (continuity.ts unsentWhy), mapped by viewer/data.ts into each cut's `unsent`, one per picture left out.
import { expect, test } from 'bun:test';
import { loadDream } from '../evals/saved';
import type { Session } from '../session';
import { viewDream } from '../viewer/data';

const CODES = [
  'reverse',
  'camera_far',
  'state_differs',
  'no_cameras_words_differ',
  'light_only',
  'has_sketch',
  'seat_replaced_by_view',
  'edit_to_own_camera',
];

test("every picture the plan leaves out has the plan's reason in the view, and none is made up", () => {
  const was = Object.fromEntries(['DREAMCHAT_REFS', 'DREAMCHAT_CUT_SHEET'].map((k) => [k, process.env[k]]));
  Object.assign(process.env, { DREAMCHAT_REFS: 'on', DREAMCHAT_CUT_SHEET: 'on' });
  try {
    let seen = 0;
    for (const id of ['dream-0926-070314-0f40', 'dream-0925-231131-affd', 'dream-0926-055141-6e80']) {
      const s = loadDream(id, false).session as Session;
      const { view } = viewDream(s, { id, source: 'frozen', commit: 'test' });
      for (const c of view.cuts) {
        seen += c.unsent.length;
        for (const u of c.unsent) {
          expect([id, c.id, u.key, CODES.includes(u.code)]).toEqual([id, c.id, u.key, true]);
          // Never the fallback: every picture left out has the plan's own reason.
          expect([id, c.id, u.key, u.code]).not.toEqual([id, c.id, u.key, 'not_recorded']);
          // Left out, so not among the images sent.
          expect(c.refs.some((r) => r.key === u.key)).toBe(false);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  } finally {
    for (const [k, v] of Object.entries(was)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}, 60_000);
