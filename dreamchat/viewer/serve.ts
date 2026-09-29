// The harness viewer's page (VIEWER_PLAN.md): a local page to read each saved dream's chain, cut by cut, and judge it.
// It shows what viewer/build.ts made (runs/viewer/<dream>/view.json, a live one in <dream>.live/), else a committed
// fixture, and saves the owner's verdicts to evals/viewer/<dream>.json (a live one to <dream>.live.json), each with
// what it was given on. Nothing is drawn and no model is asked.
//
//   bun run viewer/serve.ts [--port 4570]        (VIEWER_ANSWERS=<folder> keeps the verdicts elsewhere)
//
// Only on this machine: 127.0.0.1, and only asked by that name. A picture is served by its name alone from its dream's
// own folder (its mock-ups, and the links viewer/build.ts made to the pictures it shows): nothing else on this machine.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ANSWERS, nodeStates } from '../evals/viewer-report';
import { VIEWS } from './build';
import type { ViewAnswers, ViewDream, ViewHashes, ViewVerdict } from './types';

const FIXTURES = join(import.meta.dir, 'fixtures');
const PAGE = join(import.meta.dir, 'page.html');
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
/** A dream's folder or a picture's name: letters and digits first, then those, dots, dashes and underscores. */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Where a dream's view is: made on this machine, else a committed fixture. */
const folderOf = (key: string): string | null =>
  !SAFE.test(key)
    ? null
    : existsSync(join(VIEWS, key, 'view.json'))
      ? join(VIEWS, key)
      : existsSync(join(FIXTURES, key, 'view.json'))
        ? join(FIXTURES, key)
        : null;

/** A JSON file, or null where there is none or it cannot be read (half written, or not JSON). */
const readJson = <T>(path: string): T | null => {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
  } catch {
    return null;
  }
};
const viewOf = (key: string) => {
  const dir = folderOf(key);
  return dir ? readJson<ViewDream>(join(dir, 'view.json')) : null;
};
/** Where the verdicts are kept: evals/viewer, or VIEWER_ANSWERS where the page runs from another checkout. */
const answersDir = () => process.env.VIEWER_ANSWERS ?? ANSWERS;
const answersFile = (key: string) => join(answersDir(), `${key}.json`);
const answersOf = (key: string) => readJson<ViewAnswers>(answersFile(key));

/** Written whole: a temporary file, then renamed over the old, so a verdict is never half saved. */
function writeWhole(path: string, text: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export type DreamListed = { key: string; id: string; title: string; source: string; cuts: number; made: string; fixture: boolean };

/** Every dream there is a view of, by title; a view that cannot be read is left out, never the whole list. */
export function dreams(): DreamListed[] {
  const out = new Map<string, DreamListed>();
  for (const [root, fixture] of [
    [FIXTURES, true],
    [VIEWS, false],
  ] as const) {
    if (!existsSync(root)) continue;
    for (const key of readdirSync(root)) {
      if (!SAFE.test(key)) continue;
      const v = readJson<ViewDream>(join(root, key, 'view.json'));
      if (v?.header)
        out.set(key, {
          key,
          id: v.header.dream,
          title: v.header.title,
          source: v.header.source,
          cuts: v.cuts.length,
          made: v.header.made,
          fixture,
        });
    }
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}

/** A node the view shows (a cut, an in-between picture, or sketch:<id>): what a verdict on it is given on. */
function shownOf(view: ViewDream, node: string): { hashes: ViewHashes; prompt: string; facts: unknown } | null {
  const cut = view.cuts.find((x) => x.id === node);
  if (cut) return { hashes: cut.hashes, prompt: cut.prompt, facts: cut.facts };
  const ghost = view.ghosts.find((x) => x.id === node);
  if (ghost) return { hashes: ghost.hashes, prompt: ghost.prompt, facts: { change: ghost.change } };
  const sheet = view.sheets.find((x) => x.key === node);
  if (sheet) return { hashes: sheet.hashes, prompt: sheet.prompt ?? '', facts: { look: sheet.look } };
  return null;
}

const ASPECTS = ['layout', 'references', 'words'] as const;
const sameHashes = (a: unknown, b: ViewHashes) => {
  const x = (a ?? {}) as Partial<ViewHashes>;
  return x.chain === b.chain && x.words === b.words && x.facts === b.facts;
};

/**
 * The answers with one more verdict, or why it is refused. The verdict is taken on what the view shows now, and only
 * if that is what the page showed (`body.shown`, the hashes it displayed): a view made again while the page was open
 * is read again first, never judged unseen.
 */
export function withVerdict(
  view: ViewDream,
  answers: ViewAnswers | null,
  body: unknown,
  at: string,
): { answers: ViewAnswers } | { error: string; stale?: true } {
  const b = (body ?? {}) as { node?: unknown; verdict?: unknown; wrong?: unknown; note?: unknown; shown?: unknown };
  const node = typeof b.node === 'string' ? b.node : '';
  const shown = shownOf(view, node);
  if (!shown) return { error: `no ${node || 'node'} in ${view.header.dream}` };
  if (!sameHashes(b.shown, shown.hashes))
    return { error: 'this has changed since the page showed it: read it again, then judge it', stale: true };
  if (b.verdict !== 'right' && b.verdict !== 'wrong' && b.verdict !== 'unsure')
    return { error: 'the verdict is right, wrong or unsure' };
  const wrong = Array.isArray(b.wrong) ? [...new Set(b.wrong.filter((x) => (ASPECTS as readonly unknown[]).includes(x)))] : [];
  if (b.verdict === 'wrong' && !wrong.length) return { error: 'say what is wrong: the layout, the references or the words' };
  if (answers && (answers.dream !== view.header.dream || answers.source !== view.header.source))
    return { error: `these verdicts are on the ${answers.source} ${answers.dream}, not this ${view.header.source} view` };
  const note = typeof b.note === 'string' ? b.note.slice(0, 4000) : '';
  const verdict: ViewVerdict = {
    node,
    verdict: b.verdict,
    ...(b.verdict === 'wrong' ? { wrong: ASPECTS.filter((x) => wrong.includes(x)) } : {}),
    note,
    hashes: shown.hashes,
    shown: { prompt: shown.prompt, facts: shown.facts },
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
  const notFound = () => new Response('not found', { status: 404 });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    // Whatever goes wrong answers plainly, never with a page of the server's own source.
    error: () => new Response('something went wrong here', { status: 500 }),
    async fetch(req) {
      const url = new URL(req.url);
      // Asked by this machine's own name only: a page elsewhere renamed to point here is refused.
      const host = (req.headers.get('host') ?? '').toLowerCase();
      if (host !== `127.0.0.1:${server.port}` && host !== `localhost:${server.port}`)
        return new Response('not here', { status: 403 });
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
        return new Response(Bun.file(PAGE), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (req.method === 'GET' && url.pathname === '/api/dreams') return json(dreams());
      if (req.method === 'GET' && url.pathname === '/api/dream') {
        const key = url.searchParams.get('key') ?? '';
        const view = viewOf(key);
        if (!view) return json({ error: `no view of ${key}: make it with bun run viewer/build.ts` }, 404);
        const answers = answersOf(key);
        return json({ key, view, answers, states: nodeStates(view, answers) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
        // /img/<dream>/<name>: from that dream's folder only, by name alone.
        let parts: string[];
        try {
          parts = url.pathname.slice('/img/'.length).split('/').map(decodeURIComponent);
        } catch {
          return notFound();
        }
        const [key, name] = parts;
        if (parts.length !== 2 || !SAFE.test(name ?? '') || !TYPES[extname(name).toLowerCase()]) return notFound();
        const dir = folderOf(key ?? '');
        const path = dir ? join(dir, name) : '';
        if (!path || !existsSync(path)) return notFound();
        return new Response(Bun.file(path), {
          headers: { 'content-type': TYPES[extname(name).toLowerCase()], 'cache-control': 'max-age=3600' },
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/verdict') {
        if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
          return json({ error: 'send the verdict as JSON (content-type: application/json)' }, 415);
        const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
        const key = typeof body?.key === 'string' ? body.key : '';
        const view = viewOf(key);
        if (!view) return json({ error: `no view of ${key}` }, 404);
        const next = withVerdict(view, answersOf(key), body, new Date().toISOString());
        if ('error' in next) return json(next, next.stale ? 409 : 400);
        writeWhole(answersFile(key), `${JSON.stringify(next.answers, null, 1)}\n`);
        return json({ answers: next.answers, states: nodeStates(view, next.answers) });
      }
      return notFound();
    },
  });
  return { url: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : 4570;
  const { url } = serveViewer(port);
  console.log(`the harness viewer: ${url} (${dreams().length} dreams; verdicts to ${answersDir()})`);
}
