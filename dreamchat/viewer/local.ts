// The pictures the local image machine drew, a whole dream at a time (evals/local-run.ts), for the owner to go through
// and judge: every run, every dream in it, each picture beside what it was made from. Read from the run's own folders
// (runs/local-draw/<run>/<dream>/manifest.json and its img/), the verdicts kept beside them (verdicts.json). Nothing is
// drawn here and no model is asked.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

/** Where the local runs are: the data folder's runs/local-draw (LOCAL_RUNS to look elsewhere). */
export const localRoot = () =>
  process.env.LOCAL_RUNS ?? join(process.env.DREAMCHAT_DATA ?? join(import.meta.dir, '..'), 'runs', 'local-draw');

/** A run's, a dream's or a picture file's name: letters and digits first, then those, dots, dashes and underscores. */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PICTURE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export type LocalImage = { n: number; role: string; name: string; file?: string; missing?: boolean };
export type LocalPicture = {
  id: string;
  kind: 'sketch' | 'ghost' | 'cut';
  name: string;
  state: 'waiting' | 'done' | 'failed' | 'skipped';
  prompt?: string;
  sent?: string;
  images?: LocalImage[];
  imagesSent?: LocalImage[];
  dropped?: { images?: string[]; paragraphs?: string[]; lines?: string[]; chars?: number };
  endpoint?: string;
  job?: string;
  seed?: number;
  file?: string;
  size?: [number, number];
  secs?: number;
  quality?: string;
  error?: string;
  notes?: string[];
};
export type LocalManifest = {
  run: string;
  dream: string;
  title?: string;
  commit?: string;
  quality?: string;
  started?: string;
  updated?: string;
  readings?: string[];
  pictures: LocalPicture[];
};
export type LocalVerdict = { verdict: 'right' | 'partly' | 'wrong'; note: string; at: string };
export type LocalVerdicts = Record<string, LocalVerdict>;

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

const dreamDir = (run: string, dream: string) =>
  SAFE.test(run) && SAFE.test(dream) ? join(localRoot(), run, dream) : null;

/** A picture's file name only, as it is served: never a path. */
const served = (file?: string) => (file ? basename(file) : undefined);

/** Every run and every dream in it, newest run first, with how far each has got. */
export function localRuns(): {
  run: string;
  updated: string;
  dreams: {
    dream: string;
    title: string;
    quality: string;
    commit: string;
    updated: string;
    done: number;
    failed: number;
    waiting: number;
    judged: number;
  }[];
}[] {
  const root = localRoot();
  if (!existsSync(root)) return [];
  const runs = readdirSync(root)
    .filter((run) => SAFE.test(run))
    .map((run) => {
      const dreams = readdirSync(join(root, run))
        .filter((dream) => SAFE.test(dream) && existsSync(join(root, run, dream, 'manifest.json')))
        .map((dream) => {
          const m = readJson<LocalManifest>(join(root, run, dream, 'manifest.json'));
          const v = readJson<LocalVerdicts>(join(root, run, dream, 'verdicts.json')) ?? {};
          const pics = m?.pictures ?? [];
          return {
            dream,
            title: m?.title ?? dream,
            quality: m?.quality ?? '',
            commit: m?.commit ?? '',
            updated: m?.updated ?? m?.started ?? '',
            done: pics.filter((p) => p.state === 'done').length,
            failed: pics.filter((p) => p.state === 'failed').length,
            waiting: pics.filter((p) => p.state === 'waiting').length,
            judged: Object.keys(v).length,
          };
        })
        .sort((a, b) => (a.updated < b.updated ? -1 : 1));
      return { run, updated: dreams.reduce((a, d) => (d.updated > a ? d.updated : a), ''), dreams };
    })
    .filter((r) => r.dreams.length);
  return runs.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

/** One dream of a run as the page shows it: its manifest with files by name only, and the verdicts on it. */
export function localDream(run: string, dream: string): { manifest: LocalManifest; verdicts: LocalVerdicts } | null {
  const dir = dreamDir(run, dream);
  const m = dir ? readJson<LocalManifest>(join(dir, 'manifest.json')) : null;
  if (!dir || !m) return null;
  const image = (x: LocalImage): LocalImage => ({ ...x, file: served(x.file) });
  return {
    manifest: {
      ...m,
      pictures: (m.pictures ?? []).map((p) => ({
        ...p,
        file: served(p.file),
        images: p.images?.map(image),
        imagesSent: p.imagesSent?.map(image),
      })),
    },
    verdicts: readJson<LocalVerdicts>(join(dir, 'verdicts.json')) ?? {},
  };
}

/** A picture of a run's dream, by its name alone, from that dream's img/ folder: nothing else on this machine. */
export function localImage(run: string, dream: string, name: string): string | null {
  const dir = dreamDir(run, dream);
  if (!dir || !SAFE.test(name) || !PICTURE.has(extname(name).toLowerCase())) return null;
  const path = join(dir, 'img', name);
  return existsSync(path) ? path : null;
}

/**
 * The owner's verdict on a picture of a run's dream, kept beside it (verdicts.json), written whole; `clear` takes it
 * back. Only a picture the manifest has.
 */
export function withLocalVerdict(
  body: unknown,
  at: string,
): { verdicts: LocalVerdicts } | { error: string; status: number } {
  const b = (body ?? {}) as {
    run?: unknown;
    dream?: unknown;
    id?: unknown;
    verdict?: unknown;
    note?: unknown;
    clear?: unknown;
  };
  const [run, dream, id] = [b.run, b.dream, b.id].map((x) => (typeof x === 'string' ? x : ''));
  const dir = dreamDir(run, dream);
  const m = dir ? readJson<LocalManifest>(join(dir, 'manifest.json')) : null;
  if (!dir || !m) return { error: `no run ${run} of ${dream}`, status: 404 };
  if (!m.pictures.some((p) => p.id === id)) return { error: `no picture ${id} in ${dream}`, status: 404 };
  const verdicts = readJson<LocalVerdicts>(join(dir, 'verdicts.json')) ?? {};
  if (b.clear === true) delete verdicts[id];
  else {
    if (b.verdict !== 'right' && b.verdict !== 'partly' && b.verdict !== 'wrong')
      return { error: 'a verdict is right, partly or wrong', status: 400 };
    verdicts[id] = { verdict: b.verdict, note: typeof b.note === 'string' ? b.note.slice(0, 4000) : '', at };
  }
  const path = join(dir, 'verdicts.json');
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(verdicts, null, 1)}\n`);
  renameSync(tmp, path);
  return { verdicts };
}

/** The pictures of two runs of one dream, side by side by their id: sketches left out (a seeded run shares them). */
export type LocalPair = {
  id: string;
  kind: LocalPicture['kind'];
  name: string;
  a: LocalPicture | null;
  b: LocalPicture | null;
  /** The same picture in both runs, byte for byte (a seeded run shares its in-between pictures): nothing to judge. */
  shared?: true;
};

/**
 * Two runs of the same dreams side by side (the same dreams drawn two ways, say the harness's prompt and another
 * model's): the dreams both runs have, each with how far each run has got; and, for one of them, its pictures paired by
 * id in story order, with each run's verdicts. None where either run is not here.
 */
export function localCompare(
  a: string,
  b: string,
  dream?: string,
): {
  dreams: { dream: string; title: string; a: number; b: number }[];
  pairs?: LocalPair[];
  verdicts?: { a: LocalVerdicts; b: LocalVerdicts };
} | null {
  if (!SAFE.test(a) || !SAFE.test(b) || a === b) return null;
  const runs = localRuns();
  const [ra, rb] = [runs.find((r) => r.run === a), runs.find((r) => r.run === b)];
  if (!ra || !rb) return null;
  const dreams = ra.dreams
    .filter((d) => rb.dreams.some((x) => x.dream === d.dream))
    .map((d) => ({ dream: d.dream, title: d.title, a: d.done, b: rb.dreams.find((x) => x.dream === d.dream)!.done }));
  if (!dream) return { dreams };
  const [da, db] = [localDream(a, dream), localDream(b, dream)];
  if (!da || !db) return { dreams };
  const of = (m: LocalManifest) => m.pictures.filter((p) => p.kind !== 'sketch');
  const ids = [...new Set([...of(da.manifest), ...of(db.manifest)].map((p) => p.id))];
  const pairs = ids.map((id) => {
    const [pa, pb] = [
      of(da.manifest).find((p) => p.id === id) ?? null,
      of(db.manifest).find((p) => p.id === id) ?? null,
    ];
    const p = (pa ?? pb)!;
    const [fa, fb] = [pa?.file ? localImage(a, dream, pa.file) : null, pb?.file ? localImage(b, dream, pb.file) : null];
    const same =
      !!fa && !!fb && pa?.state === 'done' && pb?.state === 'done' && readFileSync(fa).equals(readFileSync(fb));
    return { id, kind: p.kind, name: p.name, a: pa, b: pb, ...(same ? { shared: true as const } : {}) };
  });
  return { dreams, pairs, verdicts: { a: da.verdicts, b: db.verdicts } };
}
