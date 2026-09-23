// Local server for the dream chat. Listens on this machine only: every message spends Jev
// and DeepSeek credit, and nothing here checks who is asking.
//
//   bun run server.ts            # http://127.0.0.1:8790
//   PORT=8791 bun run server.ts
import { join } from 'node:path';
import { dreamConfig } from './dream';
import { loadEnvFile } from './env';
import { callJev, jevAvailable } from './jev';
import { callHost, HOST_MODEL } from './llm';
import { liveProducer, ownStyle, SessionStore } from './session';
import { STRAWBERRY_HOME, strawberryAvailable, writeProduction } from './strawberry';

const loaded = loadEnvFile();
const cfg = dreamConfig();
const store = new SessionStore(cfg, {
  jev: callJev,
  host: callHost,
  producer: liveProducer(callJev),
  ownStyle,
  write: strawberryAvailable() ? writeProduction : undefined,
  dir: join(import.meta.dir, 'state'),
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
        });

      if (url.pathname === '/api/sessions') return json(store.list());

      if (url.pathname === '/api/session') {
        const view = store.view(id);
        return view ? json(view) : fail(404, 'no such conversation');
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
    ? `productions are written to the Strawberry store at ${STRAWBERRY_HOME}`
    : 'Strawberry engine not found (run ./install-studio.sh at the repo root): productions will not be written',
);
