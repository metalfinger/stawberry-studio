// The harness viewer's data (viewer/data.ts, VIEWER_PLAN.md "Tests"): it shows what the drawing path would send,
// taken as it is and never worked out again. On every frozen dream, with the switches of the harness's profile.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { assembleCut } from '../assemble';
import { shotPlan } from '../continuity';
import { frozenDreams, loadDream } from '../evals/saved';
import { imagesOf, rebuild, standIn } from '../plan';
import { calledFor, drawingSheet, planRecord, previsFor, type Session } from '../session';
import { sheetPrompt } from '../sheets';
import { PROFILE, viewDream } from '../viewer/data';
import { DEFAULTS, pinSwitches, withSwitches } from './fakes';

setDefaultTimeout(120_000);
afterAll(pinSwitches(DEFAULTS));

const dreams = frozenDreams();
const view = (id: string) =>
  withSwitches(PROFILE, () =>
    viewDream(loadDream(id, false).session as Session, { id, source: 'frozen', commit: 'test', mockUps: true }),
  );

describe('the viewer takes everything from one rebuild', () => {
  test('there are frozen dreams to read', () => expect(dreams.length).toBeGreaterThanOrEqual(15));

  test("every cut's and in-between picture's prompt and images are the rebuild's, in order", () => {
    for (const id of dreams)
      withSwitches(PROFILE, () => {
        const s = loadDream(id, false).session as Session;
        const r = rebuild(s);
        const { view: v } = viewDream(s, { id, source: 'frozen', commit: 'test' });
        const pics = new Map(r.pictures.map((p) => [p.id, p]));
        expect(v.cuts.map((c) => c.id)).toEqual(r.pictures.filter((p) => p.kind === 'cut').map((p) => p.id));
        for (const c of v.cuts) {
          const p = pics.get(c.id)!;
          expect([id, c.id, c.prompt]).toEqual([id, c.id, p.prompt]);
          expect([id, c.id, c.refs.map((x) => `${x.role} ${x.key}`)]).toEqual([id, c.id, imagesOf(r, p)]);
          expect(c.paragraphs.map((x) => x.text).join('\n\n')).toBe(p.prompt);
        }
        for (const g of v.ghosts) {
          const p = pics.get(g.id);
          if (!p) continue;
          expect([id, g.id, g.prompt]).toEqual([id, g.id, p.prompt]);
          expect(g.refs.map((x) => `${x.role} ${x.key}`)).toEqual(imagesOf(r, p));
        }
        // Each sheet's prompt is the one its sketch is drawn from (session.ts draws a sketch from sheetPrompt).
        for (const sk of v.sheets)
          expect(sk.prompt).toBe(
            sheetPrompt(
              r.sheets.find((x) => x.id === sk.id)!,
              s.style!,
            ),
          );
      });
  });
});

describe('the drawing path sends what the viewer shows, once everything before a cut is drawn and approved', () => {
  test('on every frozen dream, every cut: the same prompt and images', () => {
    for (const id of dreams)
      withSwitches(PROFILE, () => {
        const s = loadDream(id, false).session as Session;
        const r = rebuild(s);
        // The dream as drawing holds it once every picture is drawn and approved, each moment with a camera worked
        // out on a floor plan given its mock-up (session.ts layoutFor), as refs.test.ts "the drawing path" does.
        const drawn: Session = {
          ...s,
          build: {
            ...s.build!,
            plan: r.plan,
            frames: r.pictures.map((p) => ({
              ...p.item,
              ...(p.item.frame?.plan?.eye && shotPlan(r.b, p.id, r.rec)
                ? { layout: { mediaId: standIn.previs(p.id), key: 'k', path: 'p' } }
                : {}),
            })),
            items: r.sheets,
          },
        };
        const { view: v } = viewDream(s, { id, source: 'frozen', commit: 'test' });
        for (const c of v.cuts) {
          const sheet = drawingSheet(drawn, c.id);
          expect([id, c.id, !!sheet]).toEqual([id, c.id, true]);
          const a = assembleCut(sheet!);
          expect([id, c.id, a.prompt]).toEqual([id, c.id, c.prompt]);
          expect([id, c.id, a.references.map((x) => x.role)]).toEqual([id, c.id, c.refs.map((x) => x.role)]);
        }
      });
  });
});

describe("each cut's mock-up is the drawing path's own", () => {
  test('the same picture, byte for byte, as the drawing path renders from the dream', () => {
    let seen = 0;
    for (const id of dreams)
      withSwitches(PROFILE, () => {
        const s = loadDream(id, false).session as Session;
        const r = rebuild(s);
        const { view: v, files } = view(id);
        for (const c of v.cuts) {
          const it = r.pictures.find((p) => p.id === c.id)!.item;
          const own = previsFor(r.b, it, calledFor(s, it), planRecord(s));
          expect([id, c.id, c.mockUp?.sha256 ?? null]).toEqual([id, c.id, own?.key ?? null]);
          if (c.mockUp) {
            expect(files[c.mockUp.name]).toEqual(own!.png);
            seen++;
          }
        }
      });
    expect(seen).toBeGreaterThan(0);
  });
});

describe('a sketch not drawn yet', () => {
  test('is marked on its sheet and on every image line that uses it', () => {
    // 6081's boat (t1) failed to draw.
    const id = 'dream-0926-052843-6081';
    const { view: v } = view(id);
    expect(v.sheets.find((x) => x.id === 't1')!.drawn).toBe(false);
    expect(v.sheets.find((x) => x.id === 'p1')!.drawn).toBe(true);
    const lines = v.cuts.flatMap((c) => c.refs).filter((x) => x.key === 'sketch:t1');
    expect(lines.length).toBeGreaterThan(0);
    for (const x of lines) expect(x.notDrawnYet).toBe(true);
    for (const x of v.cuts.flatMap((c) => c.refs).filter((y) => y.key === 'sketch:p1'))
      expect(x.notDrawnYet).toBeUndefined();
  });
});

describe('what a verdict was given on', () => {
  test('a change of words moves only the words; a change of images moves the chain', () => {
    const id = 'dream-0926-070314-0f40';
    const { view: v } = withSwitches(PROFILE, () =>
      viewDream(loadDream(id, false).session as Session, { id, source: 'frozen', commit: 'test' }),
    );
    const words = withSwitches({ ...PROFILE, DREAMCHAT_ONE_BUILDER: 'look_once' }, () =>
      viewDream(loadDream(id, false).session as Session, { id, source: 'frozen', commit: 'test' }),
    ).view;
    // Row 16 (state_once) changes m2-m5's words only (Tomas's age and uniform said once).
    const moved = v.cuts.filter((c, i) => c.hashes.words !== words.cuts[i].hashes.words);
    expect(moved.length).toBeGreaterThan(0);
    for (const c of moved) {
      const was = words.cuts.find((x) => x.id === c.id)!;
      expect([c.id, c.hashes.chain]).toEqual([c.id, was.hashes.chain]);
    }
    // Without the references switch the images change: the chain moves.
    const noRefs = withSwitches({ ...PROFILE, DREAMCHAT_REFS: undefined }, () =>
      viewDream(loadDream(id, false).session as Session, { id, source: 'frozen', commit: 'test' }),
    ).view;
    expect(noRefs.cuts.some((c, i) => c.hashes.chain !== v.cuts[i].hashes.chain)).toBe(true);
  });

  test('the header says what a rebuild takes as given, and whether the switches are the whole profile', () => {
    const id = 'dream-0926-070314-0f40';
    const full = view(id).view.header;
    expect(full.assumes).toBe('all drawn and approved');
    expect(full.profile.full).toBe(true);
    const part = withSwitches({ ...PROFILE, DREAMCHAT_CAMERA: undefined }, () =>
      viewDream(loadDream(id, false).session as Session, { id, source: 'frozen', commit: 'test' }),
    ).view.header;
    expect(part.profile.full).toBe(false);
  });
});
