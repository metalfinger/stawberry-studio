// S5's references (refs.ts, DREAMCHAT_REFS): a picture withheld from a moment (the owner judged it wrong, or S9 finds
// it stale) is never what the moment is judged or repaired against, nor where its camera is taken to stand. On a saved
// dream, through the store's own judge and repair steps.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import { loadDream } from '../evals/saved';
import { rebuild, standIn } from '../plan';
import { SessionStore, type Session } from '../session';
import { forgetVerdicts } from '../verdicts';
import { fakeHost, fakeJev } from './fakes';

const S5 = { DREAMCHAT_REFS: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' };
const NAMES = ['DREAMCHAT_REFS', 'DREAMCHAT_CUT_SHEET', 'DREAMCHAT_RECORD', 'DREAMCHAT_CAMERA', 'DREAMCHAT_DATA'];

/** Runs `fn` with exactly these switches (and DREAMCHAT_DATA), the verdicts read again before and after. */
async function withSwitches<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const was = Object.fromEntries(NAMES.map((k) => [k, process.env[k]]));
  for (const k of NAMES) delete process.env[k];
  Object.assign(process.env, vars);
  forgetVerdicts();
  try {
    return await fn();
  } finally {
    for (const k of NAMES) {
      if (was[k] === undefined) delete process.env[k];
      else process.env[k] = was[k];
    }
    forgetVerdicts();
  }
}

// b91f: m2 edits m1. A verdicts folder where the owner judged m1 wrong.
const DREAM = 'dream-0926-095122-b91f';
function judgedWrong(moment: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'verdicts-'));
  mkdirSync(join(dir, 'evals'));
  writeFileSync(
    join(dir, 'evals', 'story-pictures.json'),
    JSON.stringify({ rows: [{ session: DREAM, moment, picture: `${moment}-judged.png`, story: 'wrong' }] }),
  );
  return dir;
}

/** The dream as drawing holds it once every picture is drawn and approved, in a store of its own. */
function drawnStore(judged: { continuity: { with: string | null; text: string }[] }[]) {
  const s = loadDream(DREAM, false).session as Session;
  const r = rebuild(s);
  const drawn: Session = {
    ...s,
    id: DREAM,
    build: { ...s.build!, plan: r.plan, frames: r.pictures.map((p) => ({ ...p.item })), items: r.sheets },
  };
  const store = new SessionStore(dreamConfig(), {
    jev: fakeJev(),
    host: fakeHost(),
    judge: async (_media, ask) => {
      judged.push({ continuity: ask?.continuity ?? [] });
      return { questions: 1, passed: 1, failed: [], unseen: [] };
    },
  });
  (store as unknown as { sessions: Map<string, Session> }).sessions.set(DREAM, drawn);
  const judge = (id: string) =>
    (store as unknown as { judgeWhenReady: (s: string, i: string) => Promise<void> }).judgeWhenReady(DREAM, id);
  return { r, drawn, store, judge };
}

describe('a withheld picture is not what a moment is judged against', () => {
  test('the judge is asked m2 against m1, unless the owner judged m1 wrong', async () => {
    const m1 = standIn.picture('m1');
    await withSwitches(S5, async () => {
      const judged: { continuity: { with: string | null; text: string }[] }[] = [];
      const { r, judge } = drawnStore(judged);
      // The plan edits m1 into m2, and checks the two are one view.
      expect(r.plan.cuts.find((c) => c.id === 'm2')?.criteria.some((k) => k.with === 'm1')).toBe(true);
      await judge('m2');
      expect(judged[0].continuity.some((k) => k.with === m1)).toBe(true);
    });
    // Drawn as planned (m2 an edit of m1, its checks against m1), then the owner judges m1 wrong.
    await withSwitches(S5, async () => {
      const judged: { continuity: { with: string | null; text: string }[] }[] = [];
      const { drawn, judge } = drawnStore(judged);
      expect(drawn.build!.frames!.find((f) => f.id === 'm2')?.frame?.plan?.criteria.some((k) => k.with === 'm1')).toBe(
        true,
      );
      process.env.DREAMCHAT_DATA = judgedWrong('m1');
      forgetVerdicts();
      await judge('m2');
      expect(judged).toHaveLength(1);
      expect(judged[0].continuity.some((k) => k.with === m1)).toBe(false);
    });
  });
});

describe('a withheld picture is not what a moment is repaired toward', () => {
  test('a failed check shared by words with one against a withheld picture fixes only the one asked', async () => {
    // m3 edits m2 and takes its room from m1; m2 is withheld, so the judge asked only against m1. "The same person
    // in both pictures" failing against m1 must not also tell the image model to match picture 2, not attached.
    const same = 'Is ana the same person in both pictures: the same face, hair, build and clothes?';
    const m3 = {
      id: 'm3',
      kind: 'cut',
      check: { questions: 2, passed: 1, failed: [] },
      continuity: { questions: 1, passed: 0, failed: [same] },
      frame: {
        plan: {
          criteria: [
            { with: 'm2', text: same, fix: 'ana must be the same person as in picture 2' },
            { with: 'm1', text: same, fix: 'ana must be the same person as in picture 1' },
          ],
        },
      },
    };
    await withSwitches(S5, async () => {
      const { store } = drawnStore([]);
      const serious = (withheld: Record<string, string>) =>
        (
          store as unknown as {
            seriousFailures: (it: unknown, style: null, w: Record<string, string>) => { fixes: { with?: string }[] };
          }
        ).seriousFailures(m3, null, withheld).fixes.map((k) => k.with);
      expect(serious({})).toEqual(['m2', 'm1']);
      expect(serious({ m2: 'judged wrong' })).toEqual(['m1']);
    });
  });

  test("what is withheld is read for a moment whose checks name another picture, and only with S5's references", async () => {
    const withheldFrom = (store: SessionStore, s: Session, id: string) =>
      (store as unknown as { withheldFrom: (s: Session, it: unknown) => Record<string, string> }).withheldFrom(
        s,
        [...s.build!.items, ...s.build!.frames!].find((x) => x.id === id),
      );
    // Drawn as planned (m2 an edit of m1), then the owner judges m1 wrong.
    await withSwitches(S5, async () => {
      const { drawn, store } = drawnStore([]);
      process.env.DREAMCHAT_DATA = judgedWrong('m1');
      forgetVerdicts();
      expect(withheldFrom(store, drawn, 'm2')).toEqual({ m1: 'judged wrong' });
      // A sketch has no checks against another picture: nothing is read.
      expect(withheldFrom(store, drawn, drawn.build!.items[0].id)).toEqual({});
      // Nor a cut whose only checks are against the sketches it is drawn from (sheet:…).
      const m2 = drawn.build!.frames!.find((f) => f.id === 'm2')!;
      const onSheets = {
        ...m2,
        frame: {
          ...m2.frame!,
          plan: { ...m2.frame!.plan!, criteria: m2.frame!.plan!.criteria.filter((k) => k.with?.startsWith('sheet:')) },
        },
      };
      expect(onSheets.frame.plan.criteria.length).toBeGreaterThan(0);
      expect(
        (store as unknown as { withheldFrom: (s: Session, it: unknown) => Record<string, string> }).withheldFrom(
          drawn,
          onSheets,
        ),
      ).toEqual({});
    });
    await withSwitches({ DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_DATA: judgedWrong('m1') }, async () => {
      const { drawn, store } = drawnStore([]);
      expect(withheldFrom(store, drawn, 'm2')).toEqual({});
    });
  });
});
