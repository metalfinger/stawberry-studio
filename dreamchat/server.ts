// Local server for the dream chat. Listens on this machine only: every message spends Jev
// and DeepSeek credit, and nothing here checks who is asking.
//
//   bun run server.ts            # http://127.0.0.1:8790
//   PORT=8791 bun run server.ts
import { loadedKeys } from './boot';
import { join } from 'node:path';
import { dreamConfig } from './dream';
import { callJev, jevAvailable } from './jev';
import { jevTotals, readJevLog } from './jevlog';
import { callHost, HOST_MODEL } from './llm';
import { blockScenes, fixFrom, shotFor, superviseChanges, proposeLook, reviseItem, rewordLook, rewordMoment } from './producer';
import { writeImplied } from './implied';
import { IMAGE_CAP, liveProducer, ownStyle, SessionStore, treeInputOf } from './session';
import { momentStage, STAGES, stageOf, STORYBOARD } from './stages';
import { contextOf, type DreamTree, resolveTree } from './tree';
import { assistantJudge, judgeKind } from './judge';
import { judgeAvailable, judgeContinuity, judgeTake, liveSheets, PROVIDER, spawnWorker } from './sheets';
import { REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable, writeProduction } from './strawberry';

const loaded = loadedKeys;
const cfg = dreamConfig();
const store = new SessionStore(cfg, {
  jev: callJev,
  host: callHost,
  producer: liveProducer(callJev),
  ownStyle,
  write: strawberryAvailable() ? writeProduction : undefined,
  sheets: strawberryAvailable() ? liveSheets : undefined,
  reviseItem,
  proposeLook,
  // Nothing is paid for until Jev has read its prompt and the harness is sure of it.
  gate: process.env.DREAMCHAT_GATE === 'off' ? undefined : callJev,
  block: blockScenes,
  fix: fixFrom,
  shot: shotFor,
  supervise: superviseChanges,
  imply: writeImplied,
  reword: rewordMoment,
  rewordLook,
  // The assistant is the judge unless the PC's judge is asked for (DREAMCHAT_JUDGE=pc).
  judge: judgeKind === 'assistant' ? assistantJudge : judgeKind === 'pc' && judgeAvailable() ? judgeTake : undefined,
  judgeContinuity: judgeKind === 'pc' && judgeAvailable() ? judgeContinuity : undefined,
  dir: join(import.meta.dir, 'state'),
});
// The engine's own worker draws the sketches the chat queues, for this store only.
const worker = strawberryAvailable() ? spawnWorker(STRAWBERRY_PYTHON, REPO) : null;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    worker?.stop();
    process.exit(0);
  });
const page = Bun.file(join(import.meta.dir, 'web', 'index.html'));

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, error: string) => json({ error }, status);

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const trees = new Map<string, { at: number; tree: DreamTree }>();

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 8790),
  // A turn waits on two model calls; the default 10s idle timeout would cut some off.
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') ?? '';
    try {
      if (url.pathname === '/') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });

      if (url.pathname === '/api/config')
        return json({
          persona: cfg.persona,
          goals: cfg.goals,
          threshold: cfg.confidence_threshold,
          model: HOST_MODEL,
          jev: jevAvailable(),
          strawberry: strawberryAvailable() ? STRAWBERRY_HOME : null,
          provider: PROVIDER,
          judge: judgeKind === 'assistant' ? 'assistant' : judgeKind === 'pc' && judgeAvailable() ? 'pc' : false,
          imageCap: IMAGE_CAP,
        });

      if (url.pathname === '/api/sessions') return json(store.list());

      if (url.pathname === '/api/session') {
        const view = store.view(id);
        return view ? json(view) : fail(404, 'no such conversation');
      }

      // A sketch, by conversation and item. Only files the store itself named are served.
      if (url.pathname === '/api/sketch') {
        const b = store.get(id)?.build;
        const item = [...(b?.items ?? []), ...(b?.frames ?? [])].find((i) => i.id === url.searchParams.get('item'));
        if (!item?.mediaPath || !/^[0-9a-f]{64}\.(png|jpe?g|webp)$/.test(item.mediaPath)) return fail(404, 'no sketch');
        return new Response(Bun.file(join(STRAWBERRY_HOME, 'media', item.mediaPath)), {
          headers: { 'cache-control': 'private, max-age=3600' },
        });
      }

      // A moment's planned shot, as the store planned it: only files it named, in its own folder.
      if (url.pathname === '/api/prompt') {
        const out = store.promptFor(id ?? '', url.searchParams.get('item') ?? '');
        return out ? json(out) : fail(404, 'no such picture');
      }

      if (url.pathname === '/api/plan') {
        const path = store.get(id)?.prep?.previs[url.searchParams.get('item') ?? ''];
        if (!path || !path.startsWith(join(import.meta.dir, 'state', id ?? '')) || !path.endsWith('.png')) return fail(404, 'no plan');
        return new Response(Bun.file(path), { headers: { 'cache-control': 'private, max-age=600' } });
      }

      // The Stages panel: where the conversation and each moment are, and what Jev decided and cost
      // in it, from the conversation's own log.
      if (url.pathname === '/api/jev') {
        const s = store.get(id);
        if (!s) return fail(404, 'no such conversation');
        const log = readJevLog(join(import.meta.dir, 'state'), id);
        const frames = s.build?.frames ?? [];
        const moments = (s.draft?.breakdown?.scenes ?? []).flatMap((sc) => sc.moments);
        return json({
          stages: STAGES,
          transitions: [STORYBOARD],
          stage: stageOf(s),
          moments: Object.fromEntries(moments.map((m) => [m.id, momentStage(m.id, s.prep, frames.find((f) => f.id === m.id))])),
          totals: jevTotals(log),
          log: log.slice(-400),
        });
      }

      // The dream's resolved tree: scenes, shots and cuts with complete sheets, the looks ledger,
      // questions for the dreamer and flags. Made again only when the conversation changes.
      if (url.pathname === '/api/tree') {
        const s = store.get(id);
        if (!s) return fail(404, 'no such conversation');
        const input = treeInputOf(s, cfg.confidence_threshold);
        if (!input) return fail(409, 'no breakdown yet');
        let hit = trees.get(id);
        if (hit?.at !== s.updatedAt) trees.set(id, (hit = { at: s.updatedAt, tree: resolveTree(input) }));
        const cut = url.searchParams.get('cut');
        if (!cut) return json(hit!.tree);
        const ctx = contextOf(hit!.tree, cut);
        return ctx ? json(ctx) : fail(404, 'no such cut');
      }

      if (url.pathname === '/api/turn') {
        const d = store.detail(id, Number(url.searchParams.get('n')));
        return d ? json(d) : fail(404, 'no such turn');
      }

      if (req.method === 'POST' && url.pathname === '/api/new') {
        const b = await body(req);
        const s = store.create(typeof b.name === 'string' ? b.name : '');
        return json({ id: s.id });
      }

      if (req.method === 'POST' && url.pathname === '/api/open') {
        const b = await body(req);
        return json(await store.open(String(b.id ?? '')));
      }

      // Picks a dream's drawing up with the harness as it is now: held pictures are read again,
      // what failed before it was submitted is drawn again. For a server restarted on new code.
      if (req.method === 'POST' && url.pathname === '/api/resume') {
        const b = await body(req);
        return json({ restarted: await store.resume(String(b.id ?? '')) });
      }

      if (req.method === 'POST' && url.pathname === '/api/message') {
        const b = await body(req);
        const text = typeof b.text === 'string' ? b.text.trim() : '';
        if (!text) return fail(400, 'empty message');
        return json(await store.message(String(b.id ?? ''), text));
      }

      return fail(404, 'not found');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`${req.method} ${url.pathname}: ${message}`);
      return fail(message.startsWith('no such conversation') ? 404 : 502, message);
    }
  },
});

console.log(`dream chat on http://${server.hostname}:${server.port}`);
console.log(`keys from env file: ${loaded.length ? loaded.join(', ') : 'none (using the shell environment)'}`);
if (!jevAvailable()) console.warn('JEV_API_KEY is missing: every turn will run without the judge');
if (!process.env.DEEPSEEK_API_KEY) console.warn('DEEPSEEK_API_KEY is missing: the host cannot reply');
console.log(
  strawberryAvailable()
    ? `productions are written to the Strawberry store at ${STRAWBERRY_HOME}; sketches drawn with ${PROVIDER === 'fal' ? `fal (at most ${IMAGE_CAP} a dream)` : 'the offline fixture (set FAL_KEY for real pictures)'}`
    : 'Strawberry engine not found (run ./install-studio.sh at the repo root): productions will not be written',
);
