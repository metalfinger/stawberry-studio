// The hard rules of plan_facing and beyond_words that no saved dream's own readings exercise, on saved dreams given a
// typed reading for the purpose: through the dreamer's eyes, nobody is said to look at the dreamer; what is seen out
// past a window is said only where the window is in the picture.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import type { Session } from '../session';
import type { TypedReading } from '../typed';

setDefaultTimeout(120_000);

const ON = {
  DREAMCHAT_RECORD: 'on',
  DREAMCHAT_CUT_SHEET: 'on',
  DREAMCHAT_CAMERA: 'on',
  DREAMCHAT_REFS: 'on',
  DREAMCHAT_ONE_BUILDER: 'plan_facing',
};

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

/** A saved dream rebuilt with a typed reading of its own, and the prompt of each moment asked for. */
function prompts(id: string, typed: Record<string, TypedReading>, moments: string[]): Record<string, string> {
  return withEnv(ON, () => {
    const s = structuredClone(loadDream(id, false).session) as Session;
    s.draft = { ...s.draft!, readings: { ...(s.draft?.readings ?? {}), typed } as never };
    const r = rebuild(s, { asDrawn: false });
    return Object.fromEntries(
      moments.map((m) => [m, r.pictures.find((p) => p.id === m && p.kind !== 'ghost')?.prompt ?? '']),
    );
  });
}

const fact = (f: Record<string, unknown>) => ({ ...f, ok: true }) as never;

describe('plan_facing: through the dreamer’s eyes, nobody is said to look at the dreamer', () => {
  test('the grandfather looking at the dreamer is said seen from outside (m1), never in the dreamer’s own view (m3)', () => {
    const looks = (m: string): TypedReading => ({
      moment: m,
      facts: [fact({ kind: 'act', who: 'p2', does: 'looks at', to: 'p1' })],
    });
    const p = prompts('dream-0926-043003-b0cb', { m1: looks('m1'), m3: looks('m3') }, ['m1', 'm3']);
    expect(p.m3).toContain("the dreamer's own eyes");
    expect(p.m3).not.toMatch(/looking at the dreamer/i);
    expect(p.m1).toMatch(/looking at the dreamer/i);
  });
});

describe('beyond_words: what is seen out past a window is said only where the window is in the picture', () => {
  test('the drowned city through the high round window: said where it is in view (m5), never where it is not (m2)', () => {
    const city = (m: string): TypedReading => ({
      moment: m,
      facts: [fact({ kind: 'beyond', what: 'the drowned city', through: 'the high round window' })],
    });
    const p = prompts('dream-0926-050424-fdd7', { m2: city('m2'), m5: city('m5') }, ['m2', 'm5']);
    expect(p.m5).toContain('Out past the high round window, seen only through it: the drowned city.');
    expect(p.m2).not.toContain('seen only through it');
  });
});
