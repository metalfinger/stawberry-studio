// Plan a saved dream's shots again, as the planner is now, without drawing anything: new floor
// plans, previs, directors' briefs and "storyboard complete?" for every moment, written back to the
// conversation, each decision logged where the Stages panel reads it. A fix to the planner is tried
// on a real dream for the price of its text and Jev calls. Resume would also put held sketches
// through the gate again, and could draw them.
//
// Only before the moments begin, and with the server stopped: both write the conversation.
//
//   bun run replan.ts <session id> [--keep-plans]
//
// --keep-plans keeps the floor plans it has and plans only the cameras, previs, briefs and checks
// again: a fix to the cameras, told apart from a new floor plan.
import { loadedKeys } from './boot';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callJev } from './jev';
import { inSession } from './jevlog';
import { blockScenes, shotFor, superviseChanges } from './producer';
import { applyPrep, planShots, type Session } from './session';

void loadedKeys;
const id = process.argv[2] ?? '';
const dir = join(import.meta.dir, 'state');
const file = join(dir, `${id}.json`);
if (!/^[\w-]+$/.test(id) || !existsSync(file)) {
  console.error('usage: bun run replan.ts <session id>');
  process.exit(1);
}
if (
  await fetch(`http://127.0.0.1:${process.env.PORT ?? 8790}/api/config`).then(
    () => true,
    () => false,
  )
) {
  console.error('The dream chat server is running: stop it first, or it will write over the new plans.');
  process.exit(1);
}
const s = JSON.parse(readFileSync(file, 'utf8')) as Session;
const b = s.draft?.breakdown;
if (!b || !s.style) {
  console.error('Nothing to plan yet: the dream has no breakdown or no chosen look.');
  process.exit(1);
}
if (s.build?.frames?.length) {
  console.error('Its moments have begun: planning them again would change what is being drawn.');
  process.exit(1);
}
const keep = process.argv.includes('--keep-plans');
if (!keep) for (const sc of b.scenes) delete sc.blocking;
s.prep = undefined;
const notes: string[] = [];
const block: typeof blockScenes = async (x) => {
  const r = await blockScenes(x);
  notes.push(...r.notes);
  return r;
};
const prep = await inSession(dir, id, () =>
  planShots(b, s.style!, {
    block: keep ? undefined : block,
    shot: shotFor,
    supervise: superviseChanges,
    jev: callJev,
    dir: join(dir, id),
  }),
);
applyPrep(s, prep);
await Bun.write(file, JSON.stringify(s, null, 2));

const checks = prep.storyboard ?? {};
console.log(
  `Planned in ${Math.round(prep.ms / 1000)} s: ${Object.keys(prep.blocking).length} floor plans, ${Object.keys(prep.previs).length} previs.`,
);
for (const n of notes) console.log(`note: ${n}`);
for (const m of b.scenes.flatMap((sc) => sc.moments)) {
  const c = checks[m.id];
  const facts = c ? c.readings.map((r) => `${r.question} ${r.answer.toFixed(2)}${r.ok ? '' : '!'}`).join(' ') : '';
  console.log(
    `${m.id} ${c ? (c.ok ? 'cleared' : 'held   ') : 'no check'} ${facts}${c && !c.ok ? `\n     ${c.reasons.join('; ')}` : ''}`,
  );
}
