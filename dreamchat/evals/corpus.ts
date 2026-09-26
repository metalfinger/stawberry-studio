// Every picture of every dream the evals keep, as it would be told now: each dream is rebuilt exactly
// as plan.ts rebuilds it (plan.ts `rebuild`), and each moment's and in-between picture's prompt,
// images and plan are written as a normalised dump, so two labels can be compared picture by
// picture. What a change to the harness changes in the preparation, seen before anything is drawn.
// No model is called and nothing is drawn.
//
//   bun run evals/corpus.ts --label baseline
//   DREAMCHAT_RECORD=on bun run evals/corpus.ts --label record-on --against baseline
//   bun run evals/corpus.ts --label bench --set benchmark        (the five replay dreams, evals/benchmark.json)
//   bun run evals/corpus.ts --label one --only dream-0926-043003-b0cb
//   bun run evals/corpus.ts --label all --live                  (every saved conversation, and the fake replays')
//   bun run evals/corpus.ts --verify                            (each frozen dream rebuilds as its saved conversation does)
//
// By default the frozen dreams (evals/sources/<session id>.json); with --live every saved
// conversation whose breakdown and look are settled, the fake-picture replays' included
// (runs/replay-fake/<dream>/state). The dump is runs/corpus/<label>.json, with the hash of every
// dream it read; --against <label> warns where the two read different dreams and writes what
// changed, picture by picture, to runs/corpus/<label>-vs-<against>.txt: plan fields and images that
// moved, and each changed paragraph as the words that changed in it, whole. Images are named by what
// they are (sketch:p1, picture:m3, ghost:t1:lid, previs:m5), never by a store's id. Where a frozen
// dream keeps what was really sent for a moment, the dump says whether its rebuilt images are those.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imagesOf, type Rebuilt, rebuild } from '../plan';
import type { Session } from '../session';
import { sectionsOf } from './prompt-cases';
import { commitOf, DIR, type Inputs, inputsDiffer } from './saved';

/** What was really sent for a moment, when a frozen dream keeps it. */
type Sent = { prompt: string; images: string[] };

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
  /** Where what was sent is known: whether the rebuilt images are the ones sent, and which were. */
  sent?: { same_images: boolean; images: string[]; same_prompt: boolean };
};
export type DumpDream = { title?: string; error?: string; hash?: string; pictures: DumpPicture[] };
export type Dump = {
  label: string;
  at: string;
  commit: string | null;
  switches: Record<string, string>;
  inputs: Inputs;
  dreams: Record<string, DumpDream>;
};

/** A rebuilt dream as its normalised dump; `sent` is what was drawn from, by moment, where known. */
export function dumpOf(r: Rebuilt, sent: Record<string, Sent> = {}): DumpDream {
  return {
    title: r.title,
    pictures: r.pictures.map((p): DumpPicture => {
      const cut = p.kind === 'cut' ? r.plan.cuts.find((c) => c.id === p.id) : undefined;
      const st = (x: { who: string; what: string; now: string }) => `${x.who} ${x.what}: ${x.now}`;
      const images = imagesOf(r, p);
      const was = p.kind === 'cut' ? sent[p.id] : undefined;
      return {
        id: p.id,
        kind: p.kind,
        name: p.item.name,
        images,
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
        ...(was
          ? {
              sent: {
                same_images: JSON.stringify(was.images) === JSON.stringify(images),
                images: was.images,
                same_prompt: was.prompt === p.prompt,
              },
            }
          : {}),
      };
    }),
  };
}

/** What a frozen dream keeps of what was sent, by moment. */
export const sentOf = (s: Session) =>
  Object.fromEntries(
    (s.build?.frames ?? []).flatMap((f) => {
      const x = (f as { sent?: Sent }).sent;
      return x ? [[f.id, x]] : [];
    }),
  ) as Record<string, Sent>;

/**
 * The words that changed between two versions of a paragraph, with what they share at either end
 * kept to a few words: a change anywhere in a long paragraph shows, and nothing is cut from it.
 */
export function wordDiff(before: string, now: string, context = 8): string {
  const a = before.split(/(\s+)/);
  const b = now.split(/(\s+)/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const words = (xs: string[]) => xs.join('');
  const head = a.slice(0, start);
  const tail = a.slice(a.length - end);
  const lead = head.length > context * 2 ? `…${words(head.slice(-context * 2))}` : words(head);
  const trail = tail.length > context * 2 ? `${words(tail.slice(0, context * 2))}…` : words(tail);
  const gone = words(a.slice(start, a.length - end));
  const added = words(b.slice(start, b.length - end));
  return `${lead}${gone ? `[-${gone}-]` : ''}${added ? `[+${added}+]` : ''}${trail}`;
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
export function diffDumps(before: Pick<Dump, 'dreams'>, now: Pick<Dump, 'dreams'>): CorpusDiff {
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

/** What changed, as lines to read: a paragraph changed in place as its changed words, a new or gone one whole. */
export function diffLines(diff: CorpusDiff): string[] {
  const sectionOf = (para: string) => Object.keys(sectionsOf(para))[0];
  const lines: string[] = [];
  for (const c of diff.changes) {
    lines.push(`\n── ${c.dream} ${c.id}`);
    for (const p of c.plan ?? []) lines.push(`  plan ${p.field}: ${p.before} -> ${p.now}`);
    if (c.images) lines.push(`  images: ${c.images.before.join(', ')}\n       -> ${c.images.now.join(', ')}`);
    const added = [...c.added];
    for (const g of c.gone) {
      // The same part of the prompt, changed: shown as the words that changed in it.
      const at = added.findIndex((a) => sectionOf(a) === sectionOf(g) && sectionOf(g) !== 'other');
      if (at >= 0) {
        lines.push(`  ~ ${wordDiff(g, added[at]).replace(/\n/g, '\n    ')}`);
        added.splice(at, 1);
      } else lines.push(`  - ${g.replace(/\n/g, '\n    ')}`);
    }
    for (const a of added) lines.push(`  + ${a.replace(/\n/g, '\n    ')}`);
  }
  return lines;
}

/** Each frozen dream against its saved conversation: every picture's prompt and images, rebuilt from both. */
export function verifyFrozen(frozen: Session, live: Session): string[] {
  const a = rebuild(frozen);
  const b = rebuild(live);
  const out: string[] = [];
  const pb = new Map(b.pictures.map((p) => [p.id, p]));
  for (const p of a.pictures) {
    const q = pb.get(p.id);
    if (!q) out.push(`${p.id}: only in the frozen copy`);
    else if (p.prompt !== q.prompt) out.push(`${p.id}: prompt differs`);
    else if (JSON.stringify(imagesOf(a, p)) !== JSON.stringify(imagesOf(b, q))) out.push(`${p.id}: images differ`);
  }
  for (const q of b.pictures) if (!a.pictures.some((p) => p.id === q.id)) out.push(`${q.id}: only in the saved one`);
  return out;
}

export const RUNS = join(DIR, 'runs', 'corpus');

if (import.meta.main) {
  const { dataDir, frozenDreams, liveDreams, loadDream, readLive, switches } = await import('./saved');
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
  const live = args.includes('--live');

  if (args.includes('--verify')) {
    let bad = 0;
    for (const id of frozenDreams()) {
      const diffs = verifyFrozen(loadDream(id, false).session, loadDream(id, true).session);
      console.log(`${id}: ${diffs.length ? `DIFFERS\n  ${diffs.join('\n  ')}` : 'the same, every picture'}`);
      if (diffs.length) bad++;
    }
    process.exit(bad ? 1 : 0);
  }

  const label = valueOf('--label') ?? 'latest';
  const against = valueOf('--against');
  const set = valueOf('--set');
  if (set && set !== 'benchmark') {
    console.error('--set takes only: benchmark');
    process.exit(1);
  }
  const bench =
    set === 'benchmark'
      ? (
          JSON.parse(readFileSync(join(import.meta.dir, 'benchmark.json'), 'utf8')) as { dreams: { session: string }[] }
        ).dreams.map((d) => d.session)
      : [];
  const only = listOf('--only');
  const wanted = only.length ? only : bench;
  const dreams = live
    ? (() => {
        const all = liveDreams(dataDir(wanted.filter((x) => !x.includes('/'))));
        return (wanted.length ? all.filter((x) => wanted.includes(x.id)) : all).map(readLive);
      })()
    : (wanted.length ? wanted : frozenDreams()).map((id) => loadDream(id, false));

  const dump: Dump = {
    label,
    at: new Date().toISOString(),
    commit: commitOf(),
    switches: switches(),
    inputs: { from: live ? 'live' : 'frozen', dreams: Object.fromEntries(dreams.map((d) => [d.id, d.hash])) },
    dreams: {},
  };
  let skipped = 0;
  for (const d of dreams) {
    // Only a dream whose breakdown and look are settled has pictures to tell.
    if (!d.session.draft?.breakdown || !d.session.style) {
      skipped++;
      continue;
    }
    try {
      dump.dreams[d.id] = { ...dumpOf(rebuild(d.session), sentOf(d.session)), hash: d.hash };
    } catch (e) {
      dump.dreams[d.id] = {
        error: String(e instanceof Error ? e.message : e).slice(0, 500),
        hash: d.hash,
        pictures: [],
      };
    }
  }
  mkdirSync(RUNS, { recursive: true });
  const file = join(RUNS, `${label}.json`);
  writeFileSync(file, `${JSON.stringify(dump, null, 1)}\n`);
  const all = Object.values(dump.dreams);
  const pics = all.flatMap((d) => d.pictures);
  console.log(
    `${label}: ${all.length} dreams rebuilt from ${dump.inputs.from} copies (${skipped} without a settled breakdown and look skipped), ${pics.filter((p) => p.kind === 'cut').length} moments, ${pics.filter((p) => p.kind === 'ghost').length} in-between pictures`,
  );
  for (const [id, d] of Object.entries(dump.dreams))
    if (d.error) console.log(`  ${id} could not be rebuilt: ${d.error}`);
  const sent = Object.entries(dump.dreams).flatMap(([id, d]) =>
    d.pictures.filter((p) => p.sent).map((p) => ({ id, p })),
  );
  if (sent.length) {
    const other = sent.filter((x) => !x.p.sent!.same_images);
    console.log(
      `what was really sent is known for ${sent.length} moments: ${sent.filter((x) => x.p.sent!.same_prompt).length} rebuilt word for word; ${other.length} rebuilt with other images than were sent${other.length ? ` (${other.map((x) => `${x.id.slice(-4)} ${x.p.id}`).join(', ')})` : ''}`,
    );
  }
  console.log(`written ${file}`);
  if (against) {
    const before = JSON.parse(readFileSync(join(RUNS, `${against}.json`), 'utf8')) as Dump;
    for (const w of inputsDiffer(before.inputs, dump.inputs)) console.log(`warning: ${w}`);
    const diff = diffDumps(before, dump);
    const out = join(RUNS, `${label}-vs-${against}.txt`);
    writeFileSync(
      out,
      [
        `${label} (${dump.commit}, ${JSON.stringify(dump.switches)}) against ${against} (${before.commit}, ${JSON.stringify(before.switches)})`,
        ...inputsDiffer(before.inputs, dump.inputs).map((w) => `warning: ${w}`),
        ...diffLines(diff),
      ].join('\n'),
    );
    console.log(
      `against ${against}: dreams ${diff.dreams.same} the same, ${diff.dreams.changed} changed; pictures ${diff.pictures.same} the same, ${diff.pictures.changed} changed${diff.pictures.only_before.length ? `, ${diff.pictures.only_before.length} gone` : ''}${diff.pictures.only_now.length ? `, ${diff.pictures.only_now.length} new` : ''}${diff.dreams.only_before.length || diff.dreams.only_now.length ? `; dreams only in one: ${[...diff.dreams.only_before, ...diff.dreams.only_now].join(', ')}` : ''}`,
    );
    console.log(`written ${out}`);
  }
}
