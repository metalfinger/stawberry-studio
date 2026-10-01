// The node packets (packet.ts) of every saved dream, written out and checked against their schema: a harness reads
// runs/packets/<dream>.json and packet.schema.json. Rebuilt with the full profile and the dream's readings, as the
// local runner draws them; each cut's history is the owner's verdicts on its earlier drawings (the story's verdicts
// and every local run's, a run drawn without its readings marked so); each cut's mock-up rendered beside them
// (runs/packets/previs/<sha256>.png, grey and colour-keyed, made again only where what it is rendered from changed);
// each picture's prompts for the local machine as local-run writes them (fitted, and written for it). Stops with an
// error where any cut has no packet or any packet breaks the schema.
//
//   bun run evals/packets.ts                 every frozen dream
//   bun run evals/packets.ts --live          every saved conversation too
//   bun run evals/packets.ts --dream <id>    one
import './local-env';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shotPlan } from '../continuity';
import { jevWithModel } from '../jev';
import {
  type DreamPacket,
  dreamPacket,
  PACKET_SCHEMA,
  type PrevisPacket,
  type Prompts,
  validate,
  type VerdictPacket,
} from '../packet';
import { type Rebuilt, rebuild } from '../plan';
import { calledFor, previsFor, previsKeyedFor, type Session } from '../session';
import { verdicts } from '../verdicts';
import { withCast } from './cast-cache';
import { withImplied } from './implied-cache';
import { type Img, MAX_CHARS } from './local-draw';
import { harnessFitted } from './local-run';
import { qwenEdit } from './qwen-prompt';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';
import { withTyped } from './typed-cache';

const data = dataDir();
const out = join(data, 'runs', 'packets');
mkdirSync(out, { recursive: true });

/** The schema a harness reads, written beside the packets. */
export const writeSchema = () =>
  writeFileSync(join(out, 'packet.schema.json'), `${JSON.stringify(PACKET_SCHEMA, null, 2)}\n`);

const sha = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex');
const previsDir = join(out, 'previs');
mkdirSync(previsDir, { recursive: true });
const indexFile = join(previsDir, 'index.json');
type Made = {
  clay: string | null;
  keyed: string | null;
  key: { id: string; name: string; colour: string; kind: string }[];
};
const index: Record<string, Made> = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
// The renderer itself: a change to it renders every mock-up again.
const renderer = sha(readFileSync(join(import.meta.dir, '..', 'previs.ts')));
const counts = { rendered: 0, reused: 0 };

/** A cut's mock-up files, grey and colour-keyed: rendered once for what it is rendered from, kept by content. */
function previsOf(r: Rebuilt, session: Session): (cut: string) => Omit<PrevisPacket, 'media'> | null {
  return (cut) => {
    const p = r.pictures.find((x) => x.kind === 'cut' && x.id === cut);
    const eye = p?.item.frame?.plan?.eye;
    if (!p || !eye) return null;
    const called = calledFor(
      { build: session.build, draft: session.draft && { ...session.draft, breakdown: r.b } },
      p.item,
    );
    const plan = shotPlan(r.b, cut, r.rec);
    const input = sha(
      JSON.stringify({
        renderer,
        plan,
        eye,
        eyes: p.item.frame?.eyes,
        dreamer: r.b.people.find((x) => x.is_dreamer)?.id ?? null,
        names: (plan?.spots ?? []).map((x) => [x.id, called(x.id)]),
      }),
    );
    let made = index[input];
    const there = (h: string | null) => !h || existsSync(join(previsDir, `${h}.png`));
    if (!made || !there(made.clay) || !there(made.keyed)) {
      const clay = previsFor(r.b, p.item, called, r.rec);
      const keyed = previsKeyedFor(r.b, p.item, called, r.rec);
      const keep = (png?: Uint8Array) => {
        if (!png) return null;
        const h = sha(png);
        writeFileSync(join(previsDir, `${h}.png`), png);
        return h;
      };
      made = {
        clay: keep(clay?.png),
        keyed: keep(keyed?.png),
        key: (keyed?.key ?? []).map((k) => ({ id: k.id, name: k.name, colour: k.colour, kind: k.kind })),
      };
      index[input] = made;
      counts.rendered++;
    } else counts.reused++;
    const file = (h: string) => ({ file: `previs/${h}.png`, sha256: h });
    return {
      clay: made.clay ? file(made.clay) : null,
      keyed: made.keyed ? { ...file(made.keyed), key: made.key } : null,
    };
  };
}

/**
 * A picture's prompts for the local machine, as local-run writes them, every image it names there to send: the
 * harness's own fitted to the machine's limits (its default), and, for a cut with its sheet, written for it.
 */
function promptsOf(r: Rebuilt): (p: Rebuilt['pictures'][number]) => Omit<Prompts, 'nano-banana-pro'> {
  return (p) => {
    const images: Img[] = p.references.map((x, i) => ({ n: i + 1, role: x.role, name: x.media_id, file: x.media_id }));
    const { text, fitted } = harnessFitted(p, r.sheets, images);
    const out: Omit<Prompts, 'nano-banana-pro'> = {
      'qwen-image': {
        text: text.slice(0, MAX_CHARS),
        images: fitted.images.map((x) => x.name),
        dropped: fitted.dropped.images,
      },
    };
    if (p.kind === 'cut' && p.sheet && p.assembled) {
      const q = qwenEdit(
        p.sheet,
        p.assembled.references,
        images,
        Object.fromEntries(p.assembled.lines.map((l) => [l.id, l.text])),
      );
      out['qwen-image-written'] = {
        text: q.prompt.slice(0, MAX_CHARS),
        images: q.images.map((x) => x.name),
        dropped: images.filter((x) => !q.images.includes(x)).map((x) => x.name),
      };
    }
    return out;
  };
}

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
        const m = join(local, run, dream, 'manifest.json');
        const readings = existsSync(m) ? ((JSON.parse(readFileSync(m, 'utf8')).readings ?? []) as string[]) : [];
        return {
          run,
          v: JSON.parse(readFileSync(f, 'utf8')) as Record<string, VerdictPacket>,
          without: readings.length > 0,
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is { run: string; v: Record<string, VerdictPacket>; without: boolean } => !!x);
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
          ...(k.without ? { withoutReadings: true as const } : {}),
        })),
    ];
  };
}

const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';

/**
 * A saved dream with its readings from the caches, as the local runner draws it (none asked). An imported one keeps
 * its own (the caches leave it be) and takes only its cast from the cache.
 */
export async function readied(session: Session): Promise<Session> {
  let s = structuredClone(session);
  s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session as Session;
  s = (await withTyped(s)).session as Session;
  s = (await withCast(s)).session as Session;
  return s;
}

export type Written = {
  packet: DreamPacket;
  file: string;
  errors: string[];
  cuts: number;
  n: {
    plan: number;
    now: number;
    history: number;
    paragraphs: number;
    mockups: number;
    local: number;
    written: number;
  };
};

/**
 * One dream's packet, rebuilt from the session given (its readings in, readied), with its mock-ups and prompts,
 * checked against the schema and written to runs/packets/<id>.json. Null where it has no breakdown or look yet.
 */
export function packetOf(id: string, session: Session): Written | null {
  if (!session.draft?.breakdown || !session.style) return null;
  const r = rebuild(session);
  const pk = dreamPacket(r, {
    dream: id,
    style: session.style,
    history: historyOf(id),
    previs: previsOf(r, session),
    prompts: promptsOf(r),
  });
  const errors = validate(PACKET_SCHEMA, pk);
  const cuts = r.pictures.filter((p) => p.kind === 'cut').length;
  const file = join(out, `${id}.json`);
  writeFileSync(file, `${JSON.stringify(pk, null, 1)}\n`);
  writeFileSync(indexFile, `${JSON.stringify(index)}\n`);
  const n = {
    plan: pk.cuts.filter((c) => c.camera.floorPlan).length,
    now: pk.cuts.filter((c) => c.state.now?.length).length,
    history: pk.cuts.filter((c) => c.history.verdicts.length).length,
    paragraphs: pk.cuts.filter((c) => c.prompts['nano-banana-pro'].paragraphs?.length).length,
    mockups: pk.cuts.filter((c) => c.camera.previs?.clay && c.camera.previs.keyed).length,
    local: [...pk.cuts, ...pk.ghosts].filter((c) => c.prompts['qwen-image']).length,
    written: pk.cuts.filter((c) => c.prompts['qwen-image-written']).length,
  };
  return { packet: pk, file, errors, cuts, n };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  writeSchema();
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
    mockups: 0,
    local: 0,
    written: 0,
  };
  let failed = false;
  for (const { id, live } of ids) {
    let session: Session;
    try {
      session = await readied(loadDream(id, live).session as Session);
    } catch (e) {
      console.log(`${id}: not read: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`);
      continue;
    }
    const w = packetOf(id, session);
    if (!w) continue;
    const { packet: pk, errors, cuts, n } = w;
    const missing = cuts - pk.cuts.length;
    total.dreams++;
    total.cuts += cuts;
    total.packets += pk.cuts.length;
    total.broken += errors.length ? 1 : 0;
    total.plan += n.plan;
    total.now += n.now;
    total.history += n.history;
    total.paragraphs += n.paragraphs;
    total.mockups += n.mockups;
    total.local += n.local;
    total.written += n.written;
    total.ghosts += pk.ghosts.length;
    total.elements += pk.elements.length;
    if (errors.length || missing) failed = true;
    console.log(
      `${id}: ${pk.cuts.length}/${cuts} cuts, ${pk.ghosts.length} in-between, ${pk.elements.length} sketches; floor plan ${n.plan}, typed state ${n.now}, verdicts ${n.history}, paragraphs ${n.paragraphs}, mock-ups ${n.mockups}, local prompts ${n.local} (written ${n.written})${errors.length ? `; BROKEN ${errors.length}: ${errors.slice(0, 3).join(' | ')}` : ''}`,
    );
  }
  console.log(
    `mock-ups: ${counts.rendered} rendered, ${counts.reused} kept from before; packets: ${total.dreams} dreams, ${total.packets}/${total.cuts} cuts, ${total.ghosts} in-between pictures, ${total.elements} sketches; ${total.broken} dreams breaking the schema; cuts with a floor plan ${total.plan}, typed state ${total.now}, the owner's verdicts ${total.history}, paragraph ids ${total.paragraphs}, both mock-ups ${total.mockups}, local prompts ${total.local} (written for it ${total.written}); into ${out}`,
  );
  if (failed) process.exit(1);
}
