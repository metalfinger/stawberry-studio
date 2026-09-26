// Where the dreams the evals read are, and what each run read. By default the frozen copies kept in
// the repository (evals/sources/<session id>.json, written by evals/freeze-session.ts), so every
// machine rebuilds the same dreams; with --live, the saved conversations themselves: DREAMCHAT_DATA
// (a dreamchat folder with state/), else this checkout, else another worktree of the repository that
// has them (a fresh worktree has no state/ of its own). They are only ever read.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Session } from '../session';

/** This dreamchat folder. */
export const DIR = resolve(import.meta.dir, '..');
/** The frozen dreams. */
export const SOURCES = join(import.meta.dir, 'sources');

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** The dreamchat folder whose state/ holds every conversation named, or the first with any. */
export function dataDir(sessions: string[] = []): string {
  const has = (d: string) =>
    existsSync(join(d, 'state')) &&
    (sessions.length
      ? sessions.every((id) => existsSync(join(d, 'state', `${id}.json`)))
      : readdirSync(join(d, 'state')).some((f) => /^dream-.*\.json$/.test(f)));
  if (process.env.DREAMCHAT_DATA) {
    const d = resolve(process.env.DREAMCHAT_DATA);
    if (!has(d)) throw new Error(`${d}/state lacks conversations the evals need`);
    return d;
  }
  if (has(DIR)) return DIR;
  const listed =
    spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: resolve(DIR, '..'), encoding: 'utf8' }).stdout ?? '';
  for (const line of listed.split('\n'))
    if (line.startsWith('worktree ') && has(join(line.slice(9), 'dreamchat'))) return join(line.slice(9), 'dreamchat');
  throw new Error('no checkout holds the saved conversations: set DREAMCHAT_DATA to the dreamchat folder with state/');
}

/** One saved conversation. */
export const readSession = (data: string, id: string) =>
  JSON.parse(readFileSync(join(data, 'state', `${id}.json`), 'utf8')) as Session;

/** A dream as read, and the hash of exactly what was read. */
export type Dream = { id: string; session: Session; hash: string; path: string };

const readDream = (id: string, path: string): Dream => {
  const text = readFileSync(path, 'utf8');
  return { id, session: JSON.parse(text) as Session, hash: sha256(text), path };
};

/** The frozen copy of a dream, if there is one. */
export const frozenPath = (id: string) => join(SOURCES, `${id}.json`);

/** Every frozen dream (a fixture named by its session, in the format that keeps what rebuild reads). */
export const frozenDreams = () =>
  readdirSync(SOURCES)
    .filter((f) => /^dream-.*\.json$/.test(f))
    .map((f) => f.slice(0, -5))
    .filter((id) => (JSON.parse(readFileSync(frozenPath(id), 'utf8')) as { frozen?: number }).frozen === 2)
    .sort();

/** A dream by its session id: its frozen copy, or with `live` the saved conversation. */
export function loadDream(id: string, live: boolean): Dream {
  if (!live) {
    if (!existsSync(frozenPath(id)))
      throw new Error(`${id} is not frozen: bun run evals/freeze-session.ts ${id}, or run with --live`);
    return readDream(id, frozenPath(id));
  }
  return readDream(id, join(dataDir([id]), 'state', `${id}.json`));
}

/** Every saved conversation's id, oldest first. */
export const savedSessions = (data: string) =>
  readdirSync(join(data, 'state'))
    .filter((f) => /^dream-.*\.json$/.test(f))
    .map((f) => f.slice(0, -5))
    .sort();

/**
 * Every saved conversation where it lives: state/, and the fake-picture replays' own state folders
 * (runs/replay-fake/<dream>/state), each known as `<folder>/<session id>` when not in state/.
 */
export function liveDreams(data: string): { id: string; path: string }[] {
  const out = savedSessions(data).map((id) => ({ id, path: join(data, 'state', `${id}.json`) }));
  const replays = join(data, 'runs', 'replay-fake');
  if (existsSync(replays))
    for (const run of readdirSync(replays).sort()) {
      const st = join(replays, run, 'state');
      if (!existsSync(st)) continue;
      for (const f of readdirSync(st)
        .filter((x) => /^dream-.*\.json$/.test(x))
        .sort())
        out.push({ id: `replay-fake/${run}/${f.slice(0, -5)}`, path: join(st, f) });
    }
  return out;
}

/** A live dream from where liveDreams found it. */
export const readLive = (x: { id: string; path: string }) => readDream(x.id, x.path);

/** The commit this checkout is at, for the record of a run. */
export const commitOf = () =>
  (spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: DIR, encoding: 'utf8' }).stdout ?? '').trim() || null;

/** The dream chat's own switches in force (never a key): what a run's label was measured under. */
export const switches = () =>
  Object.fromEntries(
    Object.entries(process.env)
      .filter(([k]) => k.startsWith('DREAMCHAT_') && !/KEY|TOKEN|SECRET/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  ) as Record<string, string>;

/** What a run read: the case file (where there is one) and every dream, by hash. */
export type Inputs = { from: 'frozen' | 'live'; cases?: string; dreams: Record<string, string> };

/** Where two runs read different inputs, in words; none when they read the same. */
export function inputsDiffer(before: Inputs | undefined, now: Inputs): string[] {
  if (!before) return ['the earlier run kept no record of its inputs'];
  const out: string[] = [];
  if (before.from !== now.from) out.push(`dreams read ${before.from} before, ${now.from} now`);
  if (before.cases !== now.cases) out.push('the case file changed');
  const changed = Object.keys(now.dreams).filter((id) => before.dreams[id] && before.dreams[id] !== now.dreams[id]);
  if (changed.length) out.push(`dreams changed: ${changed.join(', ')}`);
  return out;
}
