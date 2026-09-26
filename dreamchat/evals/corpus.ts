// Every picture of every saved dream, as it would be told now: each dream whose breakdown and look
// are settled is rebuilt exactly as plan.ts rebuilds it (plan.ts `rebuild`), and each moment's and
// in-between picture's prompt, images and plan are written as a normalised dump, so two labels can be
// compared picture by picture. What a change to the harness changes in the preparation of every
// saved dream, seen before anything is drawn. No model is called and nothing is drawn.
//
//   bun run evals/corpus.ts --label baseline
//   DREAMCHAT_RECORD=on bun run evals/corpus.ts --label record-on --against baseline
//   bun run evals/corpus.ts --label bench --set benchmark        (the five replay dreams, evals/benchmark.json)
//   bun run evals/corpus.ts --label one --only dream-0926-043003-b0cb
//
// The dump is runs/corpus/<label>.json. --against <label> writes what changed, picture by picture
// (paragraphs gone and new, images, plan), to runs/corpus/<label>-vs-<against>.txt and prints its
// totals. Images are named by what they are (sketch:p1, picture:m3, ghost:g1, previs:m5), never by
// a store's id, so the same dream gives the same dump on any machine.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Rebuilt, rebuild, standIn } from '../plan';
import type { Session } from '../session';
import { commitOf, DIR } from './saved';

/** One picture as it would be told: its prompt, its images by what they are, and its plan. */
export type DumpPicture = {
  id: string;
  kind: 'cut' | 'ghost';
  name: string;
  images: string[];
  prompt: string;
  plan?: {
    transition: string;
    why: string;
    refs: string[];
    own: string[];
    states: string[];
    staging: string[];
    sees: string[];
  };
};
export type DumpDream = { title?: string; error?: string; pictures: DumpPicture[] };
export type Dump = {
  label: string;
  at: string;
  commit: string | null;
  switches: Record<string, string>;
  data: string;
  dreams: Record<string, DumpDream>;
};

/** An image named by what it is: its sketch's item, the earlier picture, the in-between picture, the mock-up. */
export function imageName(r: Rebuilt, media: string): string {
  const sheet = r.sheets.find((s) => s.mediaId === media);
  if (sheet) return `sketch:${sheet.id}`;
  if (media.startsWith(standIn.previs(''))) return `previs:${media.slice(standIn.previs('').length)}`;
  if (media.startsWith(standIn.picture(''))) {
    const id = media.slice(standIn.picture('').length);
    return r.plan.ghosts.some((g) => g.id === id) ? `ghost:${id}` : `picture:${id}`;
  }
  return `other:${media}`;
}

/** A rebuilt dream as its normalised dump. */
export function dumpOf(r: Rebuilt): DumpDream {
  return {
    title: r.title,
    pictures: r.pictures.map((p): DumpPicture => {
      const cut = p.kind === 'cut' ? r.plan.cuts.find((c) => c.id === p.id) : undefined;
      const st = (x: { who: string; what: string; now: string }) => `${x.who} ${x.what}: ${x.now}`;
      return {
        id: p.id,
        kind: p.kind,
        name: p.item.name,
        images: p.references.map((x) => `${x.role} ${imageName(r, x.media_id)}`),
        prompt: p.prompt,
        ...(cut
          ? {
              plan: {
                transition: cut.transition,
                why: cut.why,
                refs: cut.refs.map((x) => `${x.kind} ${x.id} ${x.role}${x.relation ? ` ${x.relation}` : ''}`),
                own: cut.own.map(st),
                states: cut.states.map(st),
                staging: cut.staging,
                sees: cut.sees ?? [],
              },
            }
          : {}),
      };
    }),
  };
}

export type PictureChange = {
  dream: string;
  id: string;
  gone: string[];
  added: string[];
  images?: { before: string[]; now: string[] };
  plan?: { field: string; before: string; now: string }[];
};

export type CorpusDiff = {
  dreams: { same: number; changed: number; only_before: string[]; only_now: string[] };
  pictures: { same: number; changed: number; only_before: string[]; only_now: string[] };
  changes: PictureChange[];
};

/** Two dumps, compared picture by picture: which paragraphs went and came, and which images and plan fields moved. */
export function diffDumps(before: Dump, now: Dump): CorpusDiff {
  const out: CorpusDiff = {
    dreams: { same: 0, changed: 0, only_before: [], only_now: [] },
    pictures: { same: 0, changed: 0, only_before: [], only_now: [] },
    changes: [],
  };
  const ids = [...new Set([...Object.keys(before.dreams), ...Object.keys(now.dreams)])].sort();
  for (const d of ids) {
    const a = before.dreams[d];
    const b = now.dreams[d];
    if (!a) {
      out.dreams.only_now.push(d);
      continue;
    }
    if (!b) {
      out.dreams.only_before.push(d);
      continue;
    }
    let changed = false;
    const pa = new Map(a.pictures.map((p) => [p.id, p]));
    const pb = new Map(b.pictures.map((p) => [p.id, p]));
    for (const id of [...new Set([...pa.keys(), ...pb.keys()])]) {
      const x = pa.get(id);
      const y = pb.get(id);
      if (!x || !y) {
        (x ? out.pictures.only_before : out.pictures.only_now).push(`${d} ${id}`);
        changed = true;
        continue;
      }
      const xs = x.prompt.split('\n\n');
      const ys = y.prompt.split('\n\n');
      const gone = xs.filter((p) => !ys.includes(p));
      const added = ys.filter((p) => !xs.includes(p));
      const images =
        JSON.stringify(x.images) !== JSON.stringify(y.images) ? { before: x.images, now: y.images } : undefined;
      const plan = (['transition', 'why', 'refs', 'own', 'states', 'staging', 'sees'] as const)
        .map((f) => ({
          field: f,
          before: JSON.stringify(x.plan?.[f] ?? null),
          now: JSON.stringify(y.plan?.[f] ?? null),
        }))
        .filter((f) => f.before !== f.now);
      if (!gone.length && !added.length && !images && !plan.length && x.prompt === y.prompt) {
        out.pictures.same++;
        continue;
      }
      changed = true;
      out.pictures.changed++;
      out.changes.push({ dream: d, id, gone, added, ...(images ? { images } : {}), ...(plan.length ? { plan } : {}) });
    }
    if (changed || a.error !== b.error) out.dreams.changed++;
    else out.dreams.same++;
  }
  return out;
}

/** What changed, as lines to read. */
export function diffLines(diff: CorpusDiff, cut = 400): string[] {
  const clip = (s: string) => (s.length > cut ? `${s.slice(0, cut)}…` : s);
  const lines: string[] = [];
  for (const c of diff.changes) {
    lines.push(`\n── ${c.dream} ${c.id}`);
    for (const p of c.plan ?? []) lines.push(`  plan ${p.field}: ${p.before} -> ${p.now}`);
    if (c.images) lines.push(`  images: ${c.images.before.join(', ')}\n       -> ${c.images.now.join(', ')}`);
    for (const g of c.gone) lines.push(`  - ${clip(g).replace(/\n/g, '\n    ')}`);
    for (const a of c.added) lines.push(`  + ${clip(a).replace(/\n/g, '\n    ')}`);
  }
  return lines;
}

export const RUNS = join(DIR, 'runs', 'corpus');

if (import.meta.main) {
  const { dataDir, readSession, savedSessions, switches } = await import('./saved');
  const args = process.argv.slice(2);
  const valueOf = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const listOf = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return [];
    const out: string[] = [];
    for (const a of args.slice(i + 1)) {
      if (a.startsWith('--')) break;
      out.push(a);
    }
    return out;
  };
  const label = valueOf('--label') ?? 'latest';
  const against = valueOf('--against');
  const set = valueOf('--set');
  const only = listOf('--only');
  const bench =
    set === 'benchmark'
      ? (
          JSON.parse(readFileSync(join(import.meta.dir, 'benchmark.json'), 'utf8')) as { dreams: { session: string }[] }
        ).dreams.map((d) => d.session)
      : [];
  if (set && set !== 'benchmark') {
    console.error('--set takes only: benchmark');
    process.exit(1);
  }
  const wanted = only.length ? only : bench;
  const data = dataDir(wanted);
  const ids = wanted.length ? wanted : savedSessions(data);

  const dump: Dump = {
    label,
    at: new Date().toISOString(),
    commit: commitOf(),
    switches: switches(),
    data,
    dreams: {},
  };
  let skipped = 0;
  for (const id of ids) {
    const s = readSession(data, id) as Session;
    // Only a dream whose breakdown and look are settled has pictures to tell.
    if (!s.draft?.breakdown || !s.style) {
      skipped++;
      continue;
    }
    try {
      dump.dreams[id] = dumpOf(rebuild(s));
    } catch (e) {
      dump.dreams[id] = { error: String(e instanceof Error ? e.message : e).slice(0, 500), pictures: [] };
    }
  }
  mkdirSync(RUNS, { recursive: true });
  const file = join(RUNS, `${label}.json`);
  writeFileSync(file, `${JSON.stringify(dump, null, 1)}\n`);
  const dreams = Object.values(dump.dreams);
  const failed = Object.entries(dump.dreams).filter(([, d]) => d.error);
  console.log(
    `${label}: ${dreams.length} dreams rebuilt (${skipped} without a settled breakdown and look skipped), ${dreams.reduce((a, d) => a + d.pictures.filter((p) => p.kind === 'cut').length, 0)} moments, ${dreams.reduce((a, d) => a + d.pictures.filter((p) => p.kind === 'ghost').length, 0)} in-between pictures`,
  );
  for (const [id, d] of failed) console.log(`  ${id} could not be rebuilt: ${d.error}`);
  console.log(`written ${file}`);
  if (against) {
    const before = JSON.parse(readFileSync(join(RUNS, `${against}.json`), 'utf8')) as Dump;
    const diff = diffDumps(before, dump);
    const out = join(RUNS, `${label}-vs-${against}.txt`);
    writeFileSync(
      out,
      [
        `${label} (${dump.commit}, ${JSON.stringify(dump.switches)}) against ${against} (${before.commit}, ${JSON.stringify(before.switches)})`,
        ...diffLines(diff),
      ].join('\n'),
    );
    console.log(
      `against ${against}: dreams ${diff.dreams.same} the same, ${diff.dreams.changed} changed; pictures ${diff.pictures.same} the same, ${diff.pictures.changed} changed${diff.pictures.only_before.length ? `, ${diff.pictures.only_before.length} gone` : ''}${diff.pictures.only_now.length ? `, ${diff.pictures.only_now.length} new` : ''}${diff.dreams.only_before.length || diff.dreams.only_now.length ? `; dreams only in one: ${[...diff.dreams.only_before, ...diff.dreams.only_now].join(', ')}` : ''}`,
    );
    console.log(`written ${out}`);
  }
}
