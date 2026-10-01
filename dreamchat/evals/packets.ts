// The node packets (packet.ts) of every saved dream, written out and checked against their schema: a harness reads
// runs/packets/<dream>.json and packet.schema.json. Rebuilt with the full profile and the dream's readings, as the
// local runner draws them; each cut's history is the owner's verdicts on its earlier drawings (the story's verdicts
// and every local run's). Stops with an error where any cut has no packet or any packet breaks the schema.
//
//   bun run evals/packets.ts                 every frozen dream
//   bun run evals/packets.ts --live          every saved conversation too
//   bun run evals/packets.ts --dream <id>    one
import './local-env';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jevWithModel } from '../jev';
import { dreamPacket, PACKET_SCHEMA, validate, type VerdictPacket } from '../packet';
import { rebuild } from '../plan';
import type { Session } from '../session';
import { verdicts } from '../verdicts';
import { withCast } from './cast-cache';
import { withImplied } from './implied-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const args = process.argv.slice(2);
const val = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const data = dataDir();
const out = join(data, 'runs', 'packets');
mkdirSync(out, { recursive: true });

// The schema a harness reads, written beside the packets and in the dream chat's folder.
const schema = `${JSON.stringify(PACKET_SCHEMA, null, 2)}\n`;
writeFileSync(join(out, 'packet.schema.json'), schema);

/** The owner's verdicts on a dream's earlier drawings: the saved story's, and each local run's beside its pictures. */
function historyOf(dream: string): (cut: string) => VerdictPacket[] {
  const v = verdicts();
  const local = join(data, 'runs', 'local-draw');
  const runs = existsSync(local) ? readdirSync(local).sort() : [];
  const kept = runs
    .map((run) => {
      const f = join(local, run, dream, 'verdicts.json');
      if (!existsSync(f)) return null;
      try {
        return { run, v: JSON.parse(readFileSync(f, 'utf8')) as Record<string, VerdictPacket> };
      } catch {
        return null;
      }
    })
    .filter((x): x is { run: string; v: Record<string, VerdictPacket> } => !!x);
  return (cut) => {
    const said = v.byMoment.get(`${dream}/${cut}`);
    return [
      ...(said ? [{ source: 'story' as const, verdict: said }] : []),
      ...kept
        .filter((k) => k.v[cut]?.verdict)
        .map((k) => ({
          source: 'local' as const,
          run: k.run,
          verdict: k.v[cut].verdict,
          ...(k.v[cut].note ? { note: k.v[cut].note } : {}),
          ...(k.v[cut].at ? { at: k.v[cut].at } : {}),
        })),
    ];
  };
}

const ids: { id: string; live: boolean }[] = [];
if (val('--dream')) {
  const id = val('--dream') as string;
  ids.push({ id, live: !existsSync(join(import.meta.dir, 'sources', `${id}.json`)) });
} else {
  for (const id of frozenDreams()) ids.push({ id, live: false });
  if (args.includes('--live'))
    for (const d of liveDreams(data))
      if (!d.id.includes('/') && !ids.some((x) => x.id === d.id)) ids.push({ id: d.id, live: true });
}

const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const total = {
  dreams: 0,
  cuts: 0,
  packets: 0,
  broken: 0,
  plan: 0,
  now: 0,
  history: 0,
  paragraphs: 0,
  ghosts: 0,
  elements: 0,
};
let failed = false;
for (const { id, live } of ids) {
  let session: Session;
  try {
    session = structuredClone(loadDream(id, live).session) as Session;
    session = (await withImplied(session, { jev: jevWithModel(JM), jevModel: JM })).session as Session;
    session = (await withTyped(session)).session as Session;
    session = (await withCast(session)).session as Session;
  } catch (e) {
    console.log(`${id}: not read: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`);
    continue;
  }
  if (!session.draft?.breakdown || !session.style) continue;
  const r = rebuild(session);
  const pk = dreamPacket(r, { dream: id, style: session.style, history: historyOf(id) });
  const errors = validate(PACKET_SCHEMA, pk);
  const cuts = r.pictures.filter((p) => p.kind === 'cut').length;
  const missing = cuts - pk.cuts.length;
  writeFileSync(join(out, `${id}.json`), `${JSON.stringify(pk, null, 1)}\n`);
  const n = {
    plan: pk.cuts.filter((c) => c.camera.floorPlan).length,
    now: pk.cuts.filter((c) => c.state.now?.length).length,
    history: pk.cuts.filter((c) => c.history.verdicts.length).length,
    paragraphs: pk.cuts.filter((c) => c.prompt.paragraphs?.length).length,
  };
  total.dreams++;
  total.cuts += cuts;
  total.packets += pk.cuts.length;
  total.broken += errors.length ? 1 : 0;
  total.plan += n.plan;
  total.now += n.now;
  total.history += n.history;
  total.paragraphs += n.paragraphs;
  total.ghosts += pk.ghosts.length;
  total.elements += pk.elements.length;
  if (errors.length || missing) failed = true;
  console.log(
    `${id}: ${pk.cuts.length}/${cuts} cuts, ${pk.ghosts.length} in-between, ${pk.elements.length} sketches; floor plan ${n.plan}, typed state ${n.now}, verdicts ${n.history}, paragraphs ${n.paragraphs}${errors.length ? `; BROKEN ${errors.length}: ${errors.slice(0, 3).join(' | ')}` : ''}`,
  );
}
console.log(
  `packets: ${total.dreams} dreams, ${total.packets}/${total.cuts} cuts, ${total.ghosts} in-between pictures, ${total.elements} sketches; ${total.broken} dreams breaking the schema; cuts with a floor plan ${total.plan}, typed state ${total.now}, the owner's verdicts ${total.history}, paragraph ids ${total.paragraphs}; into ${out}`,
);
if (failed) process.exit(1);
