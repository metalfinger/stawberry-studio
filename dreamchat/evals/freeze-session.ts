// Freezes a saved conversation into a slim fixture (evals/sources/<name>.json) with what the dream's
// tree is made from: the breakdown and its grounding notes, the prep, the chosen look, the sketches
// and frames without their media, and the goals as the conversation read them. Saved conversations
// are not kept in the repository; fixtures are, so tests and labelled sets can be rebuilt exactly.
//
//   bun run evals/freeze-session.ts <session id> <fixture name>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import { goalStatus } from '../lib';
import type { Session } from '../session';

const [id, name] = process.argv.slice(2);
if (!id || !name || !/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(name)) {
  console.error('usage: bun run evals/freeze-session.ts <session id> <fixture name>');
  process.exit(1);
}
const s = JSON.parse(readFileSync(join(import.meta.dir, '..', 'state', `${id}.json`), 'utf8')) as Session;
const threshold = dreamConfig().confidence_threshold;
const slimItem = (i: NonNullable<Session['build']>['items'][number]) => ({
  id: i.id,
  kind: i.kind,
  name: i.name,
  fields: i.fields,
  status: i.status,
  version: i.version,
  ...(i.review ? { review: i.review } : {}),
  ...(i.ask !== undefined ? { ask: i.ask } : {}),
  ...(i.several ? { several: i.several } : {}),
  ...(i.extras ? { extras: i.extras } : {}),
  ...(i.held?.length ? { held: i.held } : {}),
  ...(i.frame
    ? {
        frame: {
          plan: {
            ...(i.frame.plan?.eye ? { eye: i.frame.plan.eye } : {}),
            ...(i.frame.plan?.view ? { view: i.frame.plan.view } : {}),
          },
        },
      }
    : {}),
  ...(i.ghost ? { ghost: i.ghost } : {}),
});
const out = {
  from: id,
  draft: { breakdown: s.draft?.breakdown, downgraded: s.draft?.downgraded ?? [] },
  prep: s.prep
    ? {
        basedOn: s.prep.basedOn,
        blocking: s.prep.blocking,
        shots: s.prep.shots,
        previs: Object.fromEntries(Object.entries(s.prep.previs ?? {}).map(([k, v]) => [k, v.split('/').at(-1)])),
        storyboard: s.prep.storyboard,
      }
    : undefined,
  style: s.style ?? null,
  build: { items: (s.build?.items ?? []).map(slimItem), frames: (s.build?.frames ?? []).map(slimItem) },
  goals: Object.fromEntries(
    Object.keys(s.state.goals).map((g) => [
      g,
      { status: goalStatus(s.state.goals[g], threshold), asked: s.askCounts[g] ?? 0 },
    ]),
  ),
};
writeFileSync(join(import.meta.dir, 'sources', `${name}.json`), JSON.stringify(out));
console.log(`evals/sources/${name}.json from ${id}`);
