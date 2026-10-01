// A dumped dream taken straight into Dream Chat's planning, with no chat (import.ts; the owner, 1 Oct: no live
// conversation and no simulated dreamer until the harness is trusted). The text or transcript is the conversation;
// the breakdown is drafted from it, the look built from a named art style (never a photograph), the sketch list made
// with no confirmations, the shots planned, the readings read, the dream saved and its packet written. Here every
// model is a stand-in: nothing is asked, and nothing is drawn.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDream } from '../evals/saved';
import { importDream, type ImportDeps, transcriptOf } from '../importer';
import { rebuild } from '../plan';
import type { Breakdown, StyleOption } from '../producer';
import { buildItems, type Session } from '../session';

setDefaultTimeout(120_000);

// The snow train's breakdown, as a writer drafted it, with its floor plans.
const frozen = loadDream('dream-0926-043003-b0cb', false).session as Session;
const breakdown = frozen.draft!.breakdown as Breakdown;
const painted: StyleOption = {
  ...(frozen.style as StyleOption),
  id: 'own',
  name: 'a woodcut print',
  medium: 'a woodcut print',
};

const stubs = (over: Partial<ImportDeps> = {}): { deps: ImportDeps; asked: string[] } => {
  const asked: string[] = [];
  const deps: ImportDeps = {
    producer: async (t) => {
      asked.push(`producer: ${t.map((x) => `${x.role}: ${x.content}`).join(' | ')}`);
      return { breakdown: structuredClone(breakdown), downgraded: [], notes: [], ms: 0 };
    },
    ownStyle: async (t) => {
      asked.push(`style: ${t.split('\n').at(-1)}`);
      return painted;
    },
    block: async (b) => ({ breakdown: b, notes: [] }),
    shot: async () => 'A brief.',
    supervise: async () => [],
    readings: async (s) => s,
    packet: (id) => ({ file: `/packets/${id}.json`, errors: [], cuts: 6 }),
    ...over,
  };
  return { deps, asked };
};

describe('a dumped dream, with no chat', () => {
  test('a text is the dreamer telling it; its look is the named style; saved, planned, its packet written', async () => {
    const data = mkdtempSync(join(tmpdir(), 'import-'));
    const { deps, asked } = stubs();
    const text = 'I was on an old train in the snow, and my grandfather sat across from me holding a suitcase.';
    const got = await importDream({ text, style: 'a woodcut print', id: 'dream-1001-000000-test', data }, deps);
    expect(got).toEqual({
      id: 'dream-1001-000000-test',
      state: join(data, 'state', 'dream-1001-000000-test.json'),
      packet: '/packets/dream-1001-000000-test.json',
      cuts: 6,
      errors: [],
    });
    // The dreamer said it, once; the look was asked for in their words, a named art style.
    expect(asked[0]).toBe(`producer: user: ${text}`);
    expect(asked[1]).toContain('a woodcut print');
    const s = JSON.parse(readFileSync(got.state, 'utf8')) as Session;
    expect(s.transcript).toEqual([{ role: 'user', content: text }]);
    expect(s.draft?.status).toBe('ready');
    expect(s.style?.medium).toBe('a woodcut print');
    expect(s.closed).toBe(true);
    // Every sketch from the breakdown, as the chat lists them, none confirmed and none drawn.
    expect(s.build?.items.map((i) => i.id)).toEqual(buildItems(s.draft!.breakdown!).map((i) => i.id));
    expect(s.build?.items.every((i) => i.status === 'waiting')).toBe(true);
    // The shots planned on the breakdown's floor plans, and a rebuild reads it as any saved dream.
    expect(Object.keys(s.prep?.blocking ?? {}).length).toBeGreaterThan(0);
    const r = rebuild(s);
    expect(r.pictures.filter((p) => p.kind === 'cut').length).toBe(6);
  });

  test('a photograph is refused, and nothing is saved', async () => {
    const data = mkdtempSync(join(tmpdir(), 'import-'));
    for (const medium of ['a photograph', 'realistic photo, natural light', '']) {
      const { deps } = stubs({ ownStyle: async () => ({ ...painted, name: 'as it looked', medium, tokens: [] }) });
      await expect(
        importDream({ text: 'A dream.', style: 'as it really looked', id: 'dream-1001-000001-test', data }, deps),
      ).rejects.toThrow(/never a photograph/);
    }
    expect(existsSync(join(data, 'state', 'dream-1001-000001-test.json'))).toBe(false);
  });

  test('a transcript is the conversation as it was: who said what, in order', () => {
    const t = transcriptOf(
      JSON.stringify([
        { role: 'user', content: 'I dreamed of a lighthouse.' },
        { role: 'assistant', content: 'What happened there?' },
        { who: 'dreamer', text: 'A dog ran up the stairs.' },
      ]),
    );
    expect(t).toEqual([
      { role: 'user', content: 'I dreamed of a lighthouse.' },
      { role: 'assistant', content: 'What happened there?' },
      { role: 'user', content: 'A dog ran up the stairs.' },
    ]);
    expect(transcriptOf('Just the dream, told once.')).toEqual([
      { role: 'user', content: 'Just the dream, told once.' },
    ]);
  });
});
