// Routes of the local server that read only the store, kept apart from server.ts (which starts the engine's
// worker and listens on a port) so they can be tested on their own.
import type { StaleReport } from './asdrawn';

/**
 * S9: GET /api/stale?id=<conversation>: which drawn pictures no longer match the dream and why, which were
 * drawn behind the dream, and which cannot be compared (pictures drawn with DREAMCHAT_AS_DRAWN=on keep what
 * they were drawn from). Reported only: nothing acts on it. Null for any other path.
 */
export function staleRoute(store: { stale(id: string): StaleReport | null }, url: URL): Response | null {
  if (url.pathname !== '/api/stale') return null;
  const report = store.stale(url.searchParams.get('id') ?? '');
  return report ? Response.json(report) : Response.json({ error: 'no such conversation' }, { status: 404 });
}
