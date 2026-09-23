// Resume a saved dream's drawing: what failed before it was ever submitted (an approval refused,
// a provider out of balance) is drawn again, and the moments carry on as their sources land.
// Nothing already paid for is redrawn.
//
//   DREAMCHAT_PROVIDER=higgsfield bun run resume.ts <session id>
import { loadedKeys } from './boot';
import { join } from 'node:path';
import { dreamConfig } from './dream';
import { callJev } from './jev';
import { assistantJudge, judgeKind } from './judge';
import { callHost } from './llm';
import { proposeLook, reviseItem } from './producer';
import { liveProducer, ownStyle, SessionStore } from './session';
import { judgeAvailable, judgeContinuity, judgeTake, liveSheets, PROVIDER, spawnWorker } from './sheets';
import { REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable, writeProduction } from './strawberry';

void loadedKeys;
const id = process.argv[2];
if (!id) {
  console.error('usage: bun run resume.ts <session id>');
  process.exit(1);
}
const store = new SessionStore(dreamConfig(), {
  jev: callJev,
  host: callHost,
  producer: liveProducer(callJev),
  ownStyle,
  write: strawberryAvailable() ? writeProduction : undefined,
  sheets: strawberryAvailable() ? liveSheets : undefined,
  reviseItem,
  proposeLook,
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
console.log('drawing again:', (await store.resume(id)).join(', ') || 'nothing');

const until = Date.now() + Number(process.env.DREAMCHAT_RESUME_MS ?? 90 * 60_000);
for (;;) {
  await store.settle(id, 60_000);
  const s = store.view(id);
  const frames = s?.build?.frames ?? [];
  const open = frames.filter((f) => f.status === 'drawing' || f.status === 'waiting');
  console.log(
    new Date().toISOString().slice(11, 19),
    frames.map((f) => `${f.id}:${f.status}${f.version > 1 ? `v${f.version}` : ''}`).join(' '),
  );
  if (!open.length || Date.now() > until) break;
}
worker?.stop();
const s = store.view(id);
for (const f of s?.build?.frames ?? [])
  console.log(
    `${f.kind === 'ghost' ? 'ghost' : `frame ${f.frame?.order}`} ${f.id} ${f.status} v${f.version}${f.mediaPath ? ` ${join(STRAWBERRY_HOME, 'media', f.mediaPath)}` : ''}${f.error ? ` (${f.error.slice(0, 160)})` : ''}${f.check ? ` facts ${f.check.passed}/${f.check.questions}` : ''}${f.continuity ? ` continuity ${f.continuity.passed}/${f.continuity.questions}` : ''}`,
  );
console.log(`images ${s?.images} · spent ${s?.spentUsd}`);
process.exit(0);
