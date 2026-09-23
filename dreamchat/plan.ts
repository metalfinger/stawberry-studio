// What every picture of a saved dream would be told, before anything is paid for: the continuity
// plan with its findings, then each in-between reference's and each moment's prompt and
// references, as if every picture before it had been drawn and approved. From the dream's current
// breakdown, sketches and style; no model calls, no images.
//
//   bun run plan.ts <session id> [m5 g2 …]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawOrder, planContinuity } from './continuity';
import { buildFrames, buildGhosts, framePrompt, ghostPrompt, type PlannedInput } from './frames';
import type { Session } from './session';
import type { Item } from './sheets';

const [id, ...only] = process.argv.slice(2);
if (!id) {
  console.error('usage: bun run plan.ts <session id> [m5 g2 …]');
  process.exit(1);
}
const s = JSON.parse(readFileSync(join(import.meta.dir, 'state', `${id}.json`), 'utf8')) as Session;
const b = s.draft?.breakdown;
if (!b || !s.style) {
  console.error(`${id} has no breakdown and chosen style yet`);
  process.exit(1);
}

// Every sketch as approved, with a stand-in image where none was drawn.
const sheets: Item[] = (s.build?.items ?? []).map((i) => ({
  ...i,
  status: 'ready',
  mediaId: i.mediaId ?? `sketch-${i.id}`,
  review: i.review ?? 'approved',
}));
const plan = planContinuity(b);
const pictures = [...buildFrames(b, plan), ...buildGhosts(plan)].map(
  (p): Item => ({ ...p, status: 'ready', mediaId: `picture-${p.id}`, continuityApproved: true }),
);
const byId = new Map(pictures.map((p) => [p.id, p]));

console.log(`${b.title}: ${plan.cuts.length} moments, ${plan.ghosts.length} in-between references`);
console.log(`draw order: ${drawOrder(plan).join(' ')}`);
for (const issue of plan.issues) console.log(`plan finding: ${issue}`);
for (const c of plan.cuts)
  console.log(
    `${c.id} ${c.shot} ${c.transition} | ${c.why}${c.staging.length ? ` | left to right: ${c.staging.join(', ')}` : ''}${c.own.length ? ` | changes: ${c.own.map((st) => `${st.who} ${st.what} → ${st.now}`).join('; ')}` : ''}${c.states.length ? ` | still: ${c.states.map((st) => `${st.who} ${st.what} ${st.now}`).join('; ')}` : ''}`,
  );

for (const pid of drawOrder(plan)) {
  if (only.length && !only.includes(pid)) continue;
  const it = byId.get(pid);
  if (!it) continue;
  let out: { prompt: string; references: { media_id: string; role: string }[] };
  if (it.kind === 'ghost') {
    const g = it.ghost;
    const sheet = sheets.find((x) => x.id === g?.of);
    if (!g || !sheet) continue;
    out = ghostPrompt(
      it,
      sheet,
      g.from ? byId.get(g.from) : undefined,
      s.style,
      g.after ? byId.get(g.after) : undefined,
    );
  } else {
    const inputs: PlannedInput[] = (it.frame?.plan?.refs ?? [])
      .map((use) => ({ use, item: byId.get(use.id) }))
      .filter((x): x is PlannedInput => !!x.item);
    out = framePrompt(it, sheets, s.style, inputs);
  }
  console.log(`\n══ ${pid} ${it.name}\nreferences: ${out.references.map((r) => `${r.role}:${r.media_id}`).join(', ')}\n`);
  console.log(out.prompt);
  for (const k of it.frame?.plan?.criteria ?? []) console.log(`  check${k.with ? ` with ${k.with}` : ''}: ${k.text}`);
}
