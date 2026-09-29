// The harness viewer's dreams, made for the page (VIEWER_PLAN.md): each saved dream as viewer/data.ts gives it under
// the harness's profile, with every sketch and picture it names found on this machine. A frozen copy keeps no files,
// so its images are read from the live copy of the same dream (the saved conversation in state/), and one the live
// copy has drawn again since the dream was frozen is marked so. Nothing is drawn and no model is asked.
//
//   bun run viewer/build.ts                        every frozen dream (evals/sources)
//   bun run viewer/build.ts <dream id> …           these, frozen
//   bun run viewer/build.ts --live <dream id> …    these, live (the saved conversation itself)
//
// Writes runs/viewer/<dream>/view.json and its mock-ups; the page (viewer/serve.ts) reads them.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Session } from '../session';
import type { Item } from '../sheets';
import type { ViewFile } from './types';

const HERE = join(import.meta.dir, '..');
export const VIEWS = join(HERE, 'runs', 'viewer');

/** Where this machine keeps the dream chat's saved conversations and their pictures: DREAMCHAT_DATA's, else here. */
export const dataDir = () => process.env.DREAMCHAT_DATA ?? HERE;
export const mediaDir = () => join(dataDir(), 'strawberry-home', 'media');

/** A picture's file, by its name in the media folder (the store names each by its content hash). */
const fileNamed = (name: string | undefined): ViewFile =>
  name && existsSync(join(mediaDir(), basename(name)))
    ? { name: basename(name), sha256: basename(name).replace(/\.[a-z0-9]+$/i, '') }
    : null;

/**
 * The file of each sketch and picture a dream names, as this machine has it. `live`, where there is one, is the saved
 * conversation of the same dream: for a frozen copy (which keeps no media) the image is its item there, found by its
 * id (an in-between picture by the change it shows), and marked `changed` where the live copy's take is another.
 */
export function filesOf(live: Session | null): (item: Item) => ViewFile {
  const all = [...(live?.build?.items ?? []), ...(live?.build?.frames ?? [])];
  const sameGhost = (a: Item, b: Item) =>
    a.kind === 'ghost' && b.kind === 'ghost' && !!a.ghost && !!b.ghost && a.ghost.of === b.ghost.of && a.ghost.change === b.ghost.change;
  return (item) => {
    if (item.mediaPath) return fileNamed(item.mediaPath);
    const there = all.find((x) => x.id === item.id && x.kind === item.kind && (x.kind !== 'ghost' || sameGhost(x, item)))
      ?? all.find((x) => sameGhost(x, item));
    const file = fileNamed(there?.mediaPath);
    return file && there && there.version !== item.version ? { ...file, changed: true } : file;
  };
}

/** The frozen dreams (evals/sources). */
export const frozenIds = () =>
  readdirSync(join(HERE, 'evals', 'sources'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

if (import.meta.main) {
  const { PROFILE, viewDream, withReadings } = await import('./data');
  // The harness as it is meant to run: every switch of the profile, whatever the shell has.
  Object.assign(process.env, PROFILE, { DREAMCHAT_WRITER: process.env.DREAMCHAT_WRITER ?? 'claude' });
  const { loadDream } = await import('../evals/saved');
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const named = args.filter((a) => !a.startsWith('--'));
  const ids = named.length ? named : frozenIds();
  const commit = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: HERE }).stdout.toString().trim();
  let failed = 0;
  for (const id of ids) {
    try {
      const s = loadDream(id, live).session as Session;
      let copy: Session | null = null;
      if (live) copy = s;
      else
        try {
          copy = loadDream(id, true).session as Session;
        } catch {
          copy = null;
        }
      const { view, files } = viewDream(await withReadings(s), {
        id,
        source: live ? 'live' : 'frozen',
        commit,
        mockUps: true,
        fileOf: filesOf(copy),
      });
      const dir = join(VIEWS, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'view.json'), `${JSON.stringify(view, null, 1)}\n`);
      for (const [name, png] of Object.entries(files)) writeFileSync(join(dir, name), png);
      const images = [...view.cuts.flatMap((c) => c.refs), ...view.ghosts.flatMap((g) => g.refs)];
      console.log(
        `${id}: ${view.cuts.length} cuts, ${view.ghosts.length} in-between pictures, ${view.sheets.length} sheets; ` +
          `${images.filter((x) => x.file).length} of ${images.length} images on this machine${copy ? '' : ' (no live copy)'}; ` +
          `profile ${view.header.profile.full ? 'full' : 'NOT full'}`,
      );
    } catch (e) {
      failed++;
      console.error(`${id}: ${String(e).slice(0, 400)}`);
    }
  }
  if (failed) process.exit(1);
}
