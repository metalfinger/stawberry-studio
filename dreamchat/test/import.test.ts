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

const FULL = ['DREAMCHAT_RECORD', 'DREAMCHAT_CUT_SHEET', 'DREAMCHAT_CAMERA', 'DREAMCHAT_ONE_BUILDER'];

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

describe('an imported dream, read back as any saved one', () => {
  // Every reader of saved dreams (the corpus, the prompt cases, the checkpoints, the viewer's data, the packets, the
  // local runner) reads them through these: an imported dream's readings are its own, made as its shots were planned.
  test("its own implied and typed readings are kept, never the cache's (which has none of it)", async () => {
    const { withImplied } = await import('../evals/implied-cache');
    const { withTyped } = await import('../evals/typed-cache');
    const own = structuredClone(frozen);
    own.imported = { at: 0, from: 'text' };
    const typed = { m1: { ask: 'own', facts: { shows: ['p1'] } } } as unknown as NonNullable<
      NonNullable<Session['draft']>['readings']
    >['typed'];
    own.draft = { ...own.draft!, readings: { ...own.draft!.readings, typed, implied: {} } };
    const empty = join(mkdtempSync(join(tmpdir(), 'cache-')), 'none.json');
    const t = await withTyped(own, { cacheFile: empty });
    expect(t.missing).toEqual([]);
    expect(t.session.draft?.readings?.typed).toEqual(typed);
    const jev = async () => {
      throw new Error('Jev is never asked for an imported dream');
    };
    const i = await withImplied(own, { jev, jevModel: 'stand-in', cacheFile: empty, write: jev });
    expect(i.session.draft?.readings?.implied).toEqual({});
    expect(i.asked).toBe(0);
  });
});

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
    // Known for what it is: a dream taken in from its text, never talked through.
    expect(s.imported?.from).toBe('text');
    // Every sketch from the breakdown, as the chat lists them, none confirmed and none drawn.
    expect(s.build?.items.map((i) => i.id)).toEqual(buildItems(s.draft!.breakdown!).map((i) => i.id));
    expect(s.build?.items.every((i) => i.status === 'waiting')).toBe(true);
    // The shots planned on the breakdown's floor plans, and a rebuild reads it as any saved dream.
    expect(Object.keys(s.prep?.blocking ?? {}).length).toBeGreaterThan(0);
    const r = rebuild(s);
    expect(r.pictures.filter((p) => p.kind === 'cut').length).toBe(6);
  });

  test("the chat's order: the floor plans, then what each moment implies and its typed facts, then the cameras", async () => {
    const was = Object.fromEntries(FULL.map((k) => [k, process.env[k]]));
    for (const k of FULL) process.env[k] = 'on';
    try {
      const order: string[] = [];
      const writer = (name: string) => async () => {
        order.push(name);
        return { content: '{}', model: 'stand-in', ms: 0 };
      };
      const { deps } = stubs({
        block: async (b) => {
          order.push('block');
          return { breakdown: b, notes: [] };
        },
        shot: async () => {
          order.push('shot');
          return 'A brief.';
        },
        imply: writer('imply'),
        typed: writer('typed'),
        // Jev reads beside the writers; a stand-in that answers nothing.
        jev: async (state, questions) => ({
          questions,
          state,
          answers: {},
          error: null,
          ms: 0,
          usage: null,
          model: 'stand-in',
        }),
      });
      const data = mkdtempSync(join(tmpdir(), 'import-'));
      await importDream({ text: 'A dream.', style: 'a woodcut print', id: 'dream-1001-000002-test', data }, deps);
      const first = (name: string) => order.indexOf(name);
      expect(first('imply')).toBeGreaterThan(first('block'));
      expect(first('typed')).toBeGreaterThan(first('block'));
      expect(first('shot')).toBeGreaterThan(Math.max(first('imply'), first('typed')));
    } finally {
      for (const k of FULL)
        if (was[k] === undefined) delete process.env[k];
        else process.env[k] = was[k];
    }
  });

  test("its look keeps to technique when made: a line naming the dream's own people or things is left out", async () => {
    const data = mkdtempSync(join(tmpdir(), 'import-'));
    const named: StyleOption = {
      ...painted,
      tokens: [...painted.tokens, 'the grandfather drawn sharper than the rest'],
      lighting_rules: 'Shadows are cool. The grandfather and the suitcase are rendered with more clarity.',
    };
    const { deps } = stubs({
      ownStyle: async () => named,
      // Jev reads nothing as content; the breakdown's own names are caught all the same.
      jev: async (state, questions) => ({
        questions,
        state,
        answers: Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul', noul: 0.01 }])),
        error: null,
        ms: 0,
        usage: null,
        model: 'stand-in',
      }),
    });
    const got = await importDream(
      { text: 'A dream.', style: 'a woodcut print', id: 'dream-1001-000003-test', data },
      deps,
    );
    const s = JSON.parse(readFileSync(got.state, 'utf8')) as Session;
    expect(s.style?.lighting_rules).toBe('Shadows are cool.');
    expect(s.style?.tokens).toEqual(painted.tokens);
    expect(s.style?.medium).toBe('a woodcut print');
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
