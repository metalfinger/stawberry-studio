// The harness viewer's page (VIEWER_PLAN.md): a local page to read each saved dream's chain, cut by cut, and judge it.
// It shows what viewer/build.ts made (runs/viewer/<dream>/view.json), else a committed fixture, and saves the owner's
// verdicts to evals/viewer/<dream>.json, each with what it was given on. Nothing is drawn and no model is asked.
//
//   bun run viewer/serve.ts [--port 4570]
//
// Only on this machine (127.0.0.1). Pictures are served by their name alone, from the dream's own folder (its
// mock-ups) or the dream chat's media folder: nothing else on this machine is.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ANSWERS, nodeStates } from '../evals/viewer-report';
import { mediaDir, VIEWS } from './build';
import type { ViewAnswers, ViewDream, ViewHashes, ViewVerdict } from './types';

const FIXTURES = join(import.meta.dir, 'fixtures');
const PAGE = join(import.meta.dir, 'page.html');
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const SAFE = /^[A-Za-z0-9._-]+$/;

/** Where a dream's view is: made on this machine, else a committed fixture. */
const folderOf = (dream: string): string | null =>
  !SAFE.test(dream)
    ? null
    : existsSync(join(VIEWS, dream, 'view.json'))
      ? join(VIEWS, dream)
      : existsSync(join(FIXTURES, dream, 'view.json'))
        ? join(FIXTURES, dream)
        : null;

const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null);
const viewOf = (dream: string) => {
  const dir = folderOf(dream);
  return dir ? readJson<ViewDream>(join(dir, 'view.json')) : null;
};
const answersFile = (dream: string) => join(ANSWERS, `${dream}.json`);
const answersOf = (dream: string) => readJson<ViewAnswers>(answersFile(dream));

/** Written whole: a temporary file, then renamed over the old, so a verdict is never half saved. */
function writeWhole(path: string, text: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** Every dream there is a view of, newest made first. */
export function dreams(): { id: string; title: string; source: string; cuts: number; made: string; fixture: boolean }[] {
  const out = new Map<string, { id: string; title: string; source: string; cuts: number; made: string; fixture: boolean }>();
  for (const [root, fixture] of [
    [FIXTURES, true],
    [VIEWS, false],
  ] as const) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root)) {
      const v = readJson<ViewDream>(join(root, id, 'view.json'));
      if (v)
        out.set(id, { id, title: v.header.title, source: v.header.source, cuts: v.cuts.length, made: v.header.made, fixture });
    }
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** A node the view shows (a cut, an in-between picture, or sketch:<id>): what a verdict on it is given on. */
function shownOf(view: ViewDream, node: string): { hashes: ViewHashes; prompt: string } | null {
  const cut = view.cuts.find((x) => x.id === node);
  if (cut) return { hashes: cut.hashes, prompt: cut.prompt };
  const ghost = view.ghosts.find((x) => x.id === node);
  if (ghost) return { hashes: ghost.hashes, prompt: ghost.prompt };
  const sheet = view.sheets.find((x) => x.key === node);
  if (sheet) return { hashes: sheet.hashes, prompt: sheet.prompt ?? '' };
  return null;
}

const ASPECTS = ['layout', 'references', 'words'] as const;

/** The answers with one more verdict, or why it is refused. The verdict is taken on what the view shows now. */
export function withVerdict(
  view: ViewDream,
  answers: ViewAnswers | null,
  body: unknown,
  at: string,
): { answers: ViewAnswers } | { error: string } {
  const b = (body ?? {}) as { node?: unknown; verdict?: unknown; wrong?: unknown; note?: unknown };
  const node = typeof b.node === 'string' ? b.node : '';
  const shown = shownOf(view, node);
  if (!shown) return { error: `no ${node || 'node'} in ${view.header.dream}` };
  if (b.verdict !== 'right' && b.verdict !== 'wrong' && b.verdict !== 'unsure')
    return { error: 'the verdict is right, wrong or unsure' };
  const wrong = Array.isArray(b.wrong) ? [...new Set(b.wrong.filter((x) => (ASPECTS as readonly unknown[]).includes(x)))] : [];
  if (b.verdict === 'wrong' && !wrong.length) return { error: 'say what is wrong: the layout, the references or the words' };
  const note = typeof b.note === 'string' ? b.note.slice(0, 4000) : '';
  const verdict: ViewVerdict = {
    node,
    verdict: b.verdict,
    ...(b.verdict === 'wrong' ? { wrong: ASPECTS.filter((x) => wrong.includes(x)) } : {}),
    note,
    hashes: shown.hashes,
    shown: { prompt: shown.prompt },
    commit: view.header.commit,
    at,
  };
  const was = answers ?? { dream: view.header.dream, source: view.header.source, verdicts: {} };
  const before = was.verdicts[node];
  return {
    answers: {
      ...was,
      verdicts: { ...was.verdicts, [node]: verdict },
      ...(before || was.history
        ? { history: { ...(was.history ?? {}), ...(before ? { [node]: [...(was.history?.[node] ?? []), before] } : {}) } }
        : {}),
    },
  };
}

export function serveViewer(port = 0): { url: string; stop: () => void } {
  const json = (x: unknown, status = 200) =>
    new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
        return new Response(Bun.file(PAGE), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (req.method === 'GET' && url.pathname === '/api/dreams') return json(dreams());
      if (req.method === 'GET' && url.pathname === '/api/dream') {
        const id = url.searchParams.get('id') ?? '';
        const view = viewOf(id);
        if (!view) return json({ error: `no view of ${id}: make it with bun run viewer/build.ts ${id}` }, 404);
        const answers = answersOf(id);
        return json({ view, answers, states: nodeStates(view, answers) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
        // /img/<dream>/<name>: the dream's own mock-ups, else the media folder; by name alone.
        const [dream, name] = url.pathname.slice('/img/'.length).split('/').map(decodeURIComponent);
        const file = basename(name ?? '');
        if (!SAFE.test(file) || !TYPES[extname(file).toLowerCase()]) return new Response('not found', { status: 404 });
        const dir = folderOf(dream ?? '');
        const path = [dir ? join(dir, file) : '', join(mediaDir(), file)].find((p) => p && existsSync(p));
        if (!path) return new Response('not found', { status: 404 });
        return new Response(Bun.file(path), {
          headers: { 'content-type': TYPES[extname(file).toLowerCase()], 'cache-control': 'max-age=3600' },
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/verdict') {
        if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
          return json({ error: 'send the verdict as JSON (content-type: application/json)' }, 415);
        const body = (await req.json().catch(() => null)) as { dream?: unknown } | null;
        const id = typeof body?.dream === 'string' ? body.dream : '';
        const view = viewOf(id);
        if (!view) return json({ error: `no view of ${id}` }, 404);
        const next = withVerdict(view, answersOf(id), body, new Date().toISOString());
        if ('error' in next) return json(next, 400);
        writeWhole(answersFile(id), `${JSON.stringify(next.answers, null, 1)}\n`);
        return json({ answers: next.answers, states: nodeStates(view, next.answers) });
      }
      return new Response('not found', { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : 4570;
  const { url } = serveViewer(port);
  console.log(`the harness viewer: ${url} (${dreams().length} dreams; verdicts to ${ANSWERS})`);
}
