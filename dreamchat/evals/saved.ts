// Where the saved conversations are, for the evals that read them: DREAMCHAT_DATA (a dreamchat
// folder with state/), else this checkout, else another worktree of the repository that has them (a
// fresh worktree has no state/ of its own). They are only ever read.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Session } from '../session';

/** This dreamchat folder. */
export const DIR = resolve(import.meta.dir, '..');

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

/** Every saved conversation's id, oldest first. */
export const savedSessions = (data: string) =>
  readdirSync(join(data, 'state'))
    .filter((f) => /^dream-.*\.json$/.test(f))
    .map((f) => f.slice(0, -5))
    .sort();

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
