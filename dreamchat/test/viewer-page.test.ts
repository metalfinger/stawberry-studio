// The harness viewer's page (viewer/serve.ts) and its views (viewer/build.ts): a verdict is saved whole with what
// it was given on, only on what the page showed, the one it replaces kept; nothing outside the dream's own folder is
// served, and only to this machine by its own name; a frozen dream's images are found in its live copy, marked where
// the live copy drew them again or tells the moment otherwise.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { Session } from '../session';
import type { Item } from '../sheets';
import { filesIn, filesOf, mediaOf, viewKey } from '../viewer/build';
import { serveViewer, withVerdict } from '../viewer/serve';
import type { ViewAnswers, ViewDream } from '../viewer/types';

const DREAM = 'dream-0926-070314-0f40';
const fixture = () =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'viewer', 'fixtures', DREAM, 'view.json'), 'utf8')) as ViewDream;

describe('a verdict', () => {
  test('is taken on what the view shows now: its hashes, prompt and facts, and the commit', () => {
    const view = fixture();
    const cut = view.cuts[1];
    const r = withVerdict(view, null, { node: cut.id, verdict: 'right', note: 'fine', shown: cut.hashes }, 't');
    if ('error' in r) throw new Error(r.error);
    expect(r.answers.verdicts[cut.id]).toEqual({
      node: cut.id,
      verdict: 'right',
      note: 'fine',
      hashes: cut.hashes,
      shown: { prompt: cut.prompt, facts: cut.facts },
      commit: view.header.commit,
      at: 't',
    });
    expect(r.answers.history).toBeUndefined();
  });

  test('only on what the page showed: a view made again while the page was open is read again first', () => {
    const view = fixture();
    const cut = view.cuts[1];
    const stale = { ...cut.hashes, chain: 'something else' };
    expect(withVerdict(view, null, { node: cut.id, verdict: 'right', shown: stale }, 't')).toEqual({
      error: 'this has changed since the page showed it: read it again, then judge it',
      stale: true,
    });
    expect(withVerdict(view, null, { node: cut.id, verdict: 'right' }, 't')).toMatchObject({ stale: true });
  });

  test('wrong names what is wrong; an unknown node or verdict is refused; live and frozen never mix', () => {
    const view = fixture();
    const cut = view.cuts[0];
    const shown = cut.hashes;
    expect(withVerdict(view, null, { node: cut.id, verdict: 'wrong', shown }, 'x')).toEqual({
      error: 'say what is wrong: the layout, the references or the words',
    });
    expect(withVerdict(view, null, { node: 'm99', verdict: 'right', shown }, 'x')).toEqual({ error: `no m99 in ${DREAM}` });
    expect(withVerdict(view, null, { node: cut.id, verdict: 'maybe', shown }, 'x')).toEqual({
      error: 'the verdict is right, wrong or unsure',
    });
    const r = withVerdict(view, null, { node: cut.id, verdict: 'wrong', wrong: ['words', 'layout', 'no'], shown }, 'x');
    if ('error' in r) throw new Error(r.error);
    // In their own order, and only the three.
    expect(r.answers.verdicts[cut.id].wrong).toEqual(['layout', 'words']);
    const live = { ...view, header: { ...view.header, source: 'live' as const } };
    expect(withVerdict(live, r.answers, { node: cut.id, verdict: 'right', shown }, 'x')).toEqual({
      error: `these verdicts are on the frozen ${DREAM}, not this live view`,
    });
  });

  test('replacing one keeps it as history; a sheet and an in-between picture take verdicts too', () => {
    const view = fixture();
    const cut = view.cuts[0];
    const first = withVerdict(view, null, { node: cut.id, verdict: 'right', shown: cut.hashes }, 't1') as {
      answers: ViewAnswers;
    };
    const second = withVerdict(view, first.answers, { node: cut.id, verdict: 'unsure', note: 'the gate', shown: cut.hashes }, 't2') as {
      answers: ViewAnswers;
    };
    expect(second.answers.verdicts[cut.id].verdict).toBe('unsure');
    expect(second.answers.history?.[cut.id].map((v) => v.at)).toEqual(['t1']);
    for (const [node, shown] of [
      [view.sheets[0].key, view.sheets[0].hashes],
      [view.ghosts[0].id, view.ghosts[0].hashes],
    ] as const)
      expect('answers' in withVerdict(view, null, { node, verdict: 'right', shown }, 't')).toBe(true);
  });
});

describe('the page', () => {
  test('serves its dreams to this machine only, nothing outside a dream folder, and saves verdicts whole', async () => {
    const answers = mkdtempSync(join(tmpdir(), 'viewer-answers-'));
    const was = process.env.VIEWER_ANSWERS;
    process.env.VIEWER_ANSWERS = answers;
    const { url, stop } = serveViewer(0);
    try {
      const dreams = (await (await fetch(`${url}api/dreams`)).json()) as { key: string }[];
      expect(dreams.some((d) => d.key === DREAM)).toBe(true);
      const got = (await (await fetch(`${url}api/dream?key=${DREAM}`)).json()) as { view: ViewDream };
      expect(got.view.header.dream).toBe(DREAM);
      const cut = got.view.cuts[0];
      const mock = got.view.cuts.find((c) => c.mockUp)!.mockUp!;
      expect((await fetch(`${url}img/${DREAM}/${mock.name}`)).status).toBe(200);
      // Out of the dream's folder, by any spelling, and a picture of another dream's folder by this one's name.
      for (const bad of [
        '..%2F..%2Fpackage.json',
        '..%2F..%2Fx.png',
        '..%2F..%2F..%2Fviewer%2Ffixtures%2Fx.png',
        '..',
        '.png',
        '%2Fetc%2Fx.png',
        'a%2Fb.png',
        '%E0%A4%A.png',
      ])
        expect([bad, (await fetch(`${url}img/${DREAM}/${bad}`)).status]).toEqual([bad, 404]);
      expect((await fetch(`${url}img/..%2F${DREAM}/${mock.name}`)).status).toBe(404);
      // A real picture outside every dream's folder, asked for by a path out of this one: never served.
      const outside = mkdtempSync(join(tmpdir(), 'viewer-outside-'));
      writeFileSync(join(outside, 'secret.png'), 'x');
      const from = join(import.meta.dir, '..', 'viewer', 'fixtures', DREAM);
      const escape = encodeURIComponent(relative(from, join(outside, 'secret.png')));
      expect((await fetch(`${url}img/${DREAM}/${escape}`)).status).toBe(404);
      expect((await fetch(`${url}api/dream?key=..%2F..`)).status).toBe(404);
      // A verdict filed by a key out of the dream folders (it would be written out of the answers folder): refused.
      const out = await fetch(`${url}api/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: `../../viewer/fixtures/${DREAM}`, node: 'm1', verdict: 'right', shown: {} }),
      });
      expect(out.status).toBe(404);
      // Asked by another name (a page elsewhere pointed here): refused.
      expect((await fetch(`${url}api/dreams`, { headers: { host: 'evil.example:80' } })).status).toBe(403);
      const post = (body: unknown, type = 'application/json') =>
        fetch(`${url}api/verdict`, { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(body) });
      const base = { key: DREAM, node: cut.id, shown: cut.hashes };
      expect((await post({ ...base, verdict: 'right' }, 'text/plain')).status).toBe(415);
      expect((await post({ ...base, verdict: 'wrong' })).status).toBe(400);
      expect((await post({ ...base, verdict: 'right', shown: { ...cut.hashes, words: 'old' } })).status).toBe(409);
      const saved = await post({ ...base, verdict: 'wrong', wrong: ['layout'], note: 'mirrored' });
      expect(saved.status).toBe(200);
      const file = JSON.parse(readFileSync(join(answers, `${DREAM}.json`), 'utf8')) as ViewAnswers;
      expect(file.verdicts[cut.id]).toMatchObject({ verdict: 'wrong', wrong: ['layout'], note: 'mirrored' });
      const states = ((await saved.json()) as { states: { node: string; state: string }[] }).states;
      expect(states.find((s) => s.node === cut.id)?.state).toBe('current');
    } finally {
      stop();
      if (was === undefined) delete process.env.VIEWER_ANSWERS;
      else process.env.VIEWER_ANSWERS = was;
    }
  });
});

describe("a dream's views and images", () => {
  test('live views are kept apart from frozen ones; pictures come from beside the conversation', () => {
    expect([viewKey(DREAM, false), viewKey(DREAM, true)]).toEqual([DREAM, `${DREAM}.live`]);
    expect(mediaOf('/data/state/dream-x.json')).toBe('/data/strawberry-home/media');
    expect(mediaOf('/data/runs/replay-fake/office/state/dream-x.json')).toBe('/data/runs/replay-fake/office/strawberry-home/media');
  });

  test("a frozen dream's images are found in its live copy by what they are, and marked where it changed since", () => {
    const item = (x: Partial<Item>): Item =>
      ({ id: 'p1', kind: 'character', name: 'x', fields: {}, status: 'ready', version: 1, ...x }) as Item;
    const media = mkdtempSync(join(tmpdir(), 'viewer-media-'));
    mkdirSync(media, { recursive: true });
    for (const n of ['aaa.png', 'bbb.png', 'ccc.png', 'ddd.png']) writeFileSync(join(media, n), 'x');
    const said = (v: string) => ({ action: { value: v, said: true } });
    const live = {
      build: {
        items: [item({ id: 'p1', version: 2, mediaPath: 'aaa.png' })],
        frames: [
          item({ id: 'm1', kind: 'cut', mediaPath: 'bbb.png', fields: said('she opens the door') }),
          item({ id: 'm2', kind: 'cut', mediaPath: 'ddd.png', fields: said('she runs to the sea') }),
          item({ id: 'g1', kind: 'ghost', mediaPath: 'ccc.png', ghost: { of: 'p1', change: 'coat red' } as never }),
        ],
      },
    } as unknown as Session;
    const fileOf = filesOf(live, media);
    // The frozen copy's sketch is take 1; the live copy has drawn take 2 since.
    expect(fileOf(item({ id: 'p1', version: 1 }))).toEqual({ name: 'aaa.png', sha256: 'aaa', changed: true });
    expect(fileOf(item({ id: 'm1', kind: 'cut', fields: said('she opens the door') }))).toEqual({
      name: 'bbb.png',
      sha256: 'bbb',
    });
    // The live copy tells m2 otherwise now (planned again): its picture is of another moment.
    expect(fileOf(item({ id: 'm2', kind: 'cut', fields: said('she walks home') }))).toMatchObject({ changed: true });
    // An in-between picture by the change it shows, whatever its number.
    expect(fileOf(item({ id: 'g7', kind: 'ghost', ghost: { of: 'p1', change: 'coat red' } as never }))).toEqual({
      name: 'ccc.png',
      sha256: 'ccc',
    });
    expect(fileOf(item({ id: 'm9', kind: 'cut' }))).toBeNull();
    expect(filesOf(null, media)(item({ id: 'p1' }))).toBeNull();
    // A file the conversation names but this machine does not have: not on this machine.
    expect(filesOf(live, join(media, 'elsewhere'))(item({ id: 'm1', kind: 'cut', fields: said('she opens the door') }))).toBeNull();
  });

  test('every picture a view shows is listed for linking into its folder', () => {
    const view = fixture();
    const f = { name: 'x.png', sha256: 'x' };
    view.sheets[0].file = f;
    view.ghosts[0].file = { name: 'y.png', sha256: 'y' };
    view.cuts[0].refs[0] = { ...view.cuts[0].refs[0], file: { name: 'z.png', sha256: 'z' } };
    expect(filesIn(view).sort()).toEqual(['x.png', 'y.png', 'z.png']);
  });
});
