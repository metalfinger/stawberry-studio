// Run the producer and the grounding check on a saved simulated conversation, to iterate on
// the breakdown without talking to anyone.
//
//   bun run produce.ts runs/sim-….json icehead
import { loadedKeys } from './boot';
import { readFileSync } from 'node:fs';
import { planContinuity } from './continuity';
import { ground, linkContinuity } from './ground';
import { callJev, type Exchange, renderTranscript } from './jev';
import { callProducer, details, moments, normalizeBreakdown } from './producer';

void loadedKeys;
const [file, name] = process.argv.slice(2);
if (!file) {
  console.error('usage: bun run produce.ts runs/<sim>.json [dream]');
  process.exit(1);
}
const runs = JSON.parse(readFileSync(file, 'utf8')) as { dream: string; transcript: string[] }[];
for (const run of runs.filter((r) => !name || r.dream === name)) {
  const transcript: Exchange[] = run.transcript.map((line) =>
    line.startsWith('dreamer: ')
      ? { role: 'user', content: line.slice('dreamer: '.length) }
      : { role: 'assistant', content: line.replace(/^Berry: /, '') },
  );
  const t0 = Date.now();
  const { raw, ms } = await callProducer(renderTranscript(transcript));
  const { breakdown, notes } = normalizeBreakdown(raw);
  const g = await ground(breakdown, transcript, callJev);
  const c = await linkContinuity(g.breakdown, callJev);
  const b = c.breakdown;
  const all = details(b).filter((d) => d.detail.value);
  console.log(`\n━━ ${run.dream}: "${b.title}" — producer ${ms} ms, grounding ${g.ms} ms, total ${Date.now() - t0} ms`);
  console.log(`   ${b.logline}`);
  console.log(
    `   people ${b.people.map((p) => p.name).join(', ') || '—'} · places ${b.places.map((p) => p.name).join(', ')} · things ${b.things.map((t) => t.name).join(', ') || '—'}`,
  );
  for (const s of b.scenes)
    for (const m of s.moments)
      console.log(
        `   ${m.key ? '★' : ' '} ${m.id} [${m.distance}, ${m.eyes}${m.looks_at ? `, facing ${m.looks_at}` : ''}${m.said ? '' : ', GUESS'}] ${m.action}${m.shift ? ` ⟿ jump: ${m.shift}` : ''}${m.leaves.length ? ` → leaves ${m.leaves.map((l) => `${l.who}.${l.what}=${l.now}`).join(', ')}` : ''}`,
      );
  console.log(
    `   details: ${all.filter((d) => d.detail.said).length} said, ${all.filter((d) => !d.detail.said).length} guessed`,
  );
  for (const d of g.downgraded) console.log(`   ↓ ${d.label}: "${d.value.slice(0, 90)}" (p ${d.p})`);
  console.log(`   styles: ${b.style_options.map((o) => `${o.id}) ${o.name}`).join(' · ')}`);
  if (notes.length) console.log(`   repaired: ${notes.join('; ')}`);
  // The continuity plan, as the frames will be drawn.
  console.log(
    `   continuity (${c.ms} ms): ${c.links.join(', ') || 'no links'}${c.notes.length ? ` · ${c.notes.join('; ')}` : ''}`,
  );
  const plan = planContinuity(b);
  for (const cut of plan.cuts)
    console.log(
      `   ${cut.order}. ${cut.why} · ${cut.transition}${cut.states.length ? ` · still: ${cut.states.map((st) => `${st.who}.${st.what}`).join(', ')}` : ''} · changes: ${cut.changes.join('; ')}`,
    );
  for (const gh of plan.ghosts)
    console.log(`   ghost ${gh.id} (${gh.kind}) ${gh.label} from ${gh.from ?? 'the sheet'}: ${gh.why}`);
  for (const x of plan.issues) console.log(`   issue: ${x}`);
}
