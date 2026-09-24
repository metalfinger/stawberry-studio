// Resume a saved dream's drawing: what failed before it was ever submitted (an approval refused,
// a provider out of balance) is drawn again, and the moments carry on as their sources land.
// Nothing already paid for is redrawn. A picture whose submission is in doubt is redrawn only when
// named, after checking the provider's account shows it never ran.
//
//   DREAMCHAT_PROVIDER=higgsfield bun run resume.ts <session id> [--redraw m6,m7]
import { loadedKeys } from './boot';
import { join } from 'node:path';
import { dreamConfig } from './dream';
import { callJev } from './jev';
import { assistantJudge, judgeKind } from './judge';
import { callHost } from './llm';
import { blockScenes, fixFrom, shotFor, proposeLook, reviseItem, rewordLook, rewordMoment } from './producer';
import { liveProducer, ownStyle, SessionStore } from './session';
import { judgeAvailable, judgeContinuity, judgeTake, liveSheets, PROVIDER, spawnWorker } from './sheets';
import { REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable, writeProduction } from './strawberry';

void loadedKeys;
const id = process.argv[2];
if (!id) {
  console.error('usage: bun run resume.ts <session id> [--redraw m6,m7]');
  process.exit(1);
}
const at = process.argv.indexOf('--redraw');
const redraw = at > 0 ? (process.argv[at + 1] ?? '').split(',').filter(Boolean) : [];
const store = new SessionStore(dreamConfig(), {
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
  reword: rewordMoment,
  rewordLook,
  judge: judgeKind === 'assistant' ? assistantJudge : judgeKind === 'pc' && judgeAvailable() ? judgeTake : undefined,
  judgeContinuity: judgeKind === 'pc' && judgeAvailable() ? judgeContinuity : undefined,
  dir: join(import.meta.dir, 'state'),
});
const worker = strawberryAvailable() ? spawnWorker(STRAWBERRY_PYTHON, REPO) : null;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    worker?.stop();
    process.exit(130);
  });
console.log(`resuming ${id} with ${PROVIDER} into ${STRAWBERRY_HOME}`);
console.log('drawing again:', (await store.resume(id, { redraw })).join(', ') || 'nothing');

const until = Date.now() + Number(process.env.DREAMCHAT_RESUME_MS ?? 90 * 60_000);
let last = '';
for (;;) {
  await store.settle(id, 60_000);
  const s = store.view(id);
  const frames = s?.build?.frames ?? [];
  // A moment that landed is still open until the judge has answered for it.
  const judging = (f: (typeof frames)[number]) =>
    judgeKind !== 'off' && f.kind === 'cut' && f.status === 'ready' && !f.check && !f.review;
  const open = frames.filter((f) => f.status === 'drawing' || f.status === 'waiting' || judging(f));
  const line = frames.map((f) => `${f.id}:${f.status}${f.version > 1 ? `v${f.version}` : ''}`).join(' ');
  if (line !== last) console.log(new Date().toISOString().slice(11, 19), line);
  last = line;
  if (!open.length || Date.now() > until) break;
  // Settling returns at once while only the judge is awaited.
  await Bun.sleep(5000);
}
worker?.stop();
const s = store.view(id);
for (const f of s?.build?.frames ?? [])
  console.log(
    `${f.kind === 'ghost' ? 'ghost' : `frame ${f.frame?.order}`} ${f.id} ${f.status} v${f.version}${f.mediaPath ? ` ${join(STRAWBERRY_HOME, 'media', f.mediaPath)}` : ''}${f.error ? ` (${f.error.slice(0, 160)})` : ''}${f.check ? ` facts ${f.check.passed}/${f.check.questions}` : ''}${f.continuity ? ` continuity ${f.continuity.passed}/${f.continuity.questions}` : ''}`,
  );
console.log(`images ${s?.images} · $${(s?.spentUsd ?? 0).toFixed(2)} at fal's list price · ${s?.spentCredits ?? 0} Higgsfield credits`);
process.exit(0);
