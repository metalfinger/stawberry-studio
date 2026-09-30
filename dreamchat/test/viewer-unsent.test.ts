// The harness viewer shows why each earlier picture the plan chose is not sent: the plan's own reasons
// (continuity.ts unsentWhy), mapped by viewer/data.ts into each cut's `unsent`, one per picture left out.
import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDream } from '../evals/saved';
import type { Session } from '../session';
import { forgetVerdicts } from '../verdicts';
import { PROFILE, viewDream } from '../viewer/data';

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

test('a picture the plan chose but the owner judged wrong says so in the view, also where it was the one to edit', () => {
  const keys = [...Object.keys(PROFILE), 'DREAMCHAT_DATA'];
  const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const data = mkdtempSync(join(tmpdir(), 'unsent-withheld-'));
  mkdirSync(join(data, 'evals'));
  // affd m8 draws on m7 for its composition; a44a m3 edits m2. Neither saved frame keeps a file, so by moment.
  const rows = [
    { session: 'dream-0925-231131-affd', moment: 'm7' },
    { session: 'dream-0926-062232-a44a', moment: 'm2' },
  ].map((x) => ({ ...x, picture: `fixture-${x.session}-${x.moment}.png`, story: 'wrong' }));
  writeFileSync(join(data, 'evals', 'story-pictures.json'), JSON.stringify({ rows }));
  Object.assign(process.env, PROFILE, { DREAMCHAT_DATA: data });
  forgetVerdicts();
  try {
    const cut = (id: string, cid: string) => {
      const s = loadDream(id, false).session as Session;
      return viewDream(s, { id, source: 'frozen', commit: 'test' }).view.cuts.find((c) => c.id === cid)!;
    };
    const m8 = cut('dream-0925-231131-affd', 'm8');
    const m7 = m8.unsent.find((u) => u.key === 'picture:m7');
    expect(m7?.code).toBe('judged_wrong');
    expect(m7?.detail).toBe('its picture was judged wrong');
    expect(m8.refs.some((r) => r.key === 'picture:m7')).toBe(false);

    const m3 = cut('dream-0926-062232-a44a', 'm3');
    const m2 = m3.unsent.find((u) => u.key === 'picture:m2');
    expect(m2?.code).toBe('judged_wrong');
    expect(m2?.detail).toContain('it was the picture to edit');
    expect(m2?.base).toBe(true);
    expect(m7?.base).toBeUndefined();
    expect(m3.refs.some((r) => r.key === 'picture:m2')).toBe(false);
    // Every picture it links and does not send has a reason.
    for (const c of [m8, m3]) {
      const said = new Set([...c.refs.map((r) => r.key), ...c.unsent.map((u) => u.key)]);
      expect(c.links.map((l) => `picture:${l.from}`).filter((k) => !said.has(k))).toEqual([]);
    }
  } finally {
    for (const [k, v] of Object.entries(was)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    forgetVerdicts();
    rmSync(data, { recursive: true, force: true });
  }
}, 60_000);
