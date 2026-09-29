// The harness viewer's page (viewer/serve.ts) and its views (viewer/build.ts): a verdict is saved whole with what
// it was given on, the one it replaces kept; nothing outside the dream's own folder and the media folder is served;
// a frozen dream's images are found in its live copy, marked where the live copy drew them again.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '../session';
import type { Item } from '../sheets';
import { filesOf } from '../viewer/build';
import { serveViewer, withVerdict } from '../viewer/serve';
import type { ViewAnswers, ViewDream } from '../viewer/types';

const DREAM = 'dream-0926-070314-0f40';
const fixture = () =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'viewer', 'fixtures', DREAM, 'view.json'), 'utf8')) as ViewDream;

describe('a verdict', () => {
  test('is taken on what the view shows now: its hashes, its prompt and the commit', () => {
    const view = fixture();
    const cut = view.cuts[1];
    const r = withVerdict(view, null, { node: cut.id, verdict: 'right', note: 'fine' }, '2026-09-30T00:00:00Z');
    if ('error' in r) throw new Error(r.error);
    expect(r.answers.verdicts[cut.id]).toEqual({
      node: cut.id,
      verdict: 'right',
      note: 'fine',
      hashes: cut.hashes,
      shown: { prompt: cut.prompt },
      commit: view.header.commit,
      at: '2026-09-30T00:00:00Z',
    });
    expect(r.answers.history).toBeUndefined();
  });

  test('wrong names what is wrong; an unknown node or verdict is refused', () => {
    const view = fixture();
    const id = view.cuts[0].id;
    expect(withVerdict(view, null, { node: id, verdict: 'wrong' }, 'x')).toEqual({
      error: 'say what is wrong: the layout, the references or the words',
    });
    expect(withVerdict(view, null, { node: 'm99', verdict: 'right' }, 'x')).toEqual({ error: `no m99 in ${DREAM}` });
    expect(withVerdict(view, null, { node: id, verdict: 'maybe' }, 'x')).toEqual({
      error: 'the verdict is right, wrong or unsure',
    });
    const r = withVerdict(view, null, { node: id, verdict: 'wrong', wrong: ['words', 'layout', 'nonsense'] }, 'x');
    if ('error' in r) throw new Error(r.error);
    // In their own order, and only the three.
    expect(r.answers.verdicts[id].wrong).toEqual(['layout', 'words']);
  });

  test('replacing one keeps it as history; a sheet and an in-between picture take verdicts too', () => {
    const view = fixture();
    const id = view.cuts[0].id;
    const first = withVerdict(view, null, { node: id, verdict: 'right' }, 't1') as { answers: ViewAnswers };
    const second = withVerdict(view, first.answers, { node: id, verdict: 'unsure', note: 'the gate' }, 't2') as {
      answers: ViewAnswers;
    };
    expect(second.answers.verdicts[id].verdict).toBe('unsure');
    expect(second.answers.history?.[id].map((v) => v.at)).toEqual(['t1']);
    for (const node of [view.sheets[0].key, view.ghosts[0].id])
      expect('answers' in withVerdict(view, null, { node, verdict: 'right' }, 't')).toBe(true);
  });
});

describe('the page', () => {
  test('serves the dreams and their views, saves verdicts whole, and nothing outside its folders', async () => {
    const answers = mkdtempSync(join(tmpdir(), 'viewer-answers-'));
    const was = process.env.VIEWER_ANSWERS;
    process.env.VIEWER_ANSWERS = answers;
    const { url, stop } = serveViewer(0);
    try {
      const dreams = (await (await fetch(`${url}api/dreams`)).json()) as { id: string }[];
      expect(dreams.some((d) => d.id === DREAM)).toBe(true);
      const got = (await (await fetch(`${url}api/dream?id=${DREAM}`)).json()) as { view: ViewDream; states: unknown[] };
      expect(got.view.header.dream).toBe(DREAM);
      const cut = got.view.cuts[0];
      const mock = got.view.cuts.find((c) => c.mockUp)!.mockUp!;
      expect((await fetch(`${url}img/${DREAM}/${mock.name}`)).status).toBe(200);
      for (const bad of ['..%2F..%2Fpackage.json', '..%2Fview.json', 'view.json', '%2Fetc%2Fpasswd'])
        expect([bad, (await fetch(`${url}img/${DREAM}/${bad}`)).status]).toEqual([bad, 404]);
      expect((await fetch(`${url}api/dream?id=..%2F..`)).status).toBe(404);
      const post = (body: unknown, type = 'application/json') =>
        fetch(`${url}api/verdict`, { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(body) });
      expect((await post({ dream: DREAM, node: cut.id, verdict: 'right' }, 'text/plain')).status).toBe(415);
      expect((await post({ dream: DREAM, node: cut.id, verdict: 'wrong' })).status).toBe(400);
      const saved = await post({ dream: DREAM, node: cut.id, verdict: 'wrong', wrong: ['layout'], note: 'mirrored' });
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

describe("a frozen dream's images", () => {
  test('are found in its live copy by what they are, and marked where the live copy drew them again', () => {
    const item = (x: Partial<Item>): Item => ({ id: 'p1', kind: 'character', name: 'x', fields: {}, status: 'ready', version: 1, ...x }) as Item;
    // Names of files the media folder has: the store names each by its content hash.
    const dir = mkdtempSync(join(tmpdir(), 'viewer-data-'));
    const media = join(dir, 'strawberry-home', 'media');
    mkdirSync(media, { recursive: true });
    for (const n of ['aaa.png', 'bbb.png', 'ccc.png']) writeFileSync(join(media, n), 'x');
    const was = process.env.DREAMCHAT_DATA;
    process.env.DREAMCHAT_DATA = dir;
    try {
      const live = {
        build: {
          items: [item({ id: 'p1', version: 2, mediaPath: 'aaa.png' })],
          frames: [
            item({ id: 'm1', kind: 'cut', mediaPath: 'bbb.png' }),
            item({ id: 'g1', kind: 'ghost', mediaPath: 'ccc.png', ghost: { of: 'p1', change: 'coat red' } as never }),
          ],
        },
      } as unknown as Session;
      const fileOf = filesOf(live);
      // The frozen copy's sketch is take 1; the live copy has drawn take 2 since.
      expect(fileOf(item({ id: 'p1', version: 1 }))).toEqual({ name: 'aaa.png', sha256: 'aaa', changed: true });
      expect(fileOf(item({ id: 'm1', kind: 'cut' }))).toEqual({ name: 'bbb.png', sha256: 'bbb' });
      // An in-between picture by the change it shows, whatever its number.
      expect(fileOf(item({ id: 'g7', kind: 'ghost', ghost: { of: 'p1', change: 'coat red' } as never }))).toEqual({
        name: 'ccc.png',
        sha256: 'ccc',
      });
      expect(fileOf(item({ id: 'm9', kind: 'cut' }))).toBeNull();
      expect(filesOf(null)(item({ id: 'p1' }))).toBeNull();
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_DATA;
      else process.env.DREAMCHAT_DATA = was;
    }
  });
});
