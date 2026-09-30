// The harness viewer's dreams, made for the page (VIEWER_PLAN.md): each saved dream as viewer/data.ts gives it under
// the harness's profile, with every sketch and picture it names found on this machine. A frozen copy keeps no files
// and no conversation, so both are read from the live copy of the same dream (its saved conversation), and an image
// the live copy has drawn again since the dream was frozen, or a moment it tells otherwise, is marked so. Nothing is
// drawn and no model is asked.
//
//   bun run viewer/build.ts                        every frozen dream (evals/saved.ts frozenDreams)
//   bun run viewer/build.ts <dream id> …           these, frozen
//   bun run viewer/build.ts --live <dream id> …    these, live (the saved conversation itself)
//
// Writes runs/viewer/<dream>/ (frozen) or runs/viewer/<dream>.live/ (live): view.json, its mock-ups, and a link to
// each picture it shows. The page (viewer/serve.ts) serves a dream's folder and nothing else.

import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { matchGhost } from '../asdrawn';
import type { Session } from '../session';
import type { Item } from '../sheets';
import type { ViewDream, ViewFile } from './types';

const HERE = join(import.meta.dir, '..');
export const VIEWS = join(HERE, 'runs', 'viewer');

/** The folder a dream's view is kept in, and its answers are named by: live views apart from frozen ones. */
export const viewKey = (id: string, live: boolean) => (live ? `${id}.live` : id);

/** A saved conversation's pictures: the media folder beside its state folder (`<data>/strawberry-home/media`). */
export const mediaOf = (conversation: string) => join(dirname(dirname(conversation)), 'strawberry-home', 'media');

/**
 * The file of each sketch and picture a dream names, as this machine has it, in `media`. `live`, where there is one,
 * is the saved conversation of the same dream: for a frozen copy (which keeps no media) the image is its item there,
 * found by its id, an in-between picture as the drawing path finds one (asdrawn.ts matchGhost: by the change it shows,
 * else by what it shows), and marked `changed` where the live copy's take is another, or where it tells that moment
 * otherwise.
 */
export function filesOf(
  live: Session | null,
  media: string,
  /** asdrawn.ts matchGhost, passed in: importing it here would read the writer's setting before the build sets it. */
  match: typeof matchGhost,
): (item: Item) => ViewFile {
  const all = [...(live?.build?.items ?? []), ...(live?.build?.frames ?? [])];
  const found = (name: string | undefined): ViewFile =>
    name && existsSync(join(media, basename(name)))
      ? { name: basename(name), sha256: basename(name).replace(/\.[a-z0-9]+$/i, '') }
      : null;
  const ghosts = all.filter((x) => x.kind === 'ghost' && !!x.ghost);
  const told = (x: Item) => x.fields?.action?.value ?? null;
  return (item) => {
    if (item.mediaPath) return found(item.mediaPath);
    const there =
      item.kind === 'ghost'
        ? item.ghost
          ? match(item.ghost, ghosts, (x) => x.ghost)
          : undefined
        : all.find((x) => x.id === item.id && x.kind === item.kind);
    const file = found(there?.mediaPath);
    if (!file || !there) return file;
    const other = there.version !== item.version || (item.kind === 'cut' && told(there) !== told(item));
    return other ? { ...file, changed: true } : file;
  };
}

/** Every file a view names (its sheets, cuts, references, in-between pictures, the night's pictures). */
export function filesIn(view: ViewDream): string[] {
  const out = new Set<string>();
  const add = (f: ViewFile | undefined) => {
    if (f) out.add(f.name);
  };
  for (const s of view.sheets) add(s.file);
  for (const g of view.ghosts) {
    add(g.file);
    for (const r of g.refs) add(r.file);
  }
  for (const c of view.cuts) {
    for (const r of c.refs) add(r.file);
    add(c.drawn?.file);
  }
  return [...out];
}

/** Written whole: a temporary file, then renamed over the old. */
function writeWhole(path: string, text: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/**
 * A picture put in a dream's folder: a link to it where the system allows one, else a hard link (Windows without
 * Developer Mode refuses a symbolic link), else a copy. A later build clears what its view no longer names.
 */
function place(from: string, at: string) {
  try {
    symlinkSync(from, at);
  } catch {
    try {
      linkSync(from, at);
    } catch {
      copyFileSync(from, at);
    }
  }
}

const isLink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

if (import.meta.main) {
  // The writer the readings were made with, set before anything reads it (the typed readings are keyed by it).
  process.env.DREAMCHAT_WRITER ??= 'claude';
  const { PROFILE, viewDream, withReadings } = await import('./data');
  // The harness as it is meant to run: every switch of the profile, whatever the shell has.
  Object.assign(process.env, PROFILE);
  const { frozenDreams, loadDream } = await import('../evals/saved');
  const { matchGhost } = await import('../asdrawn');
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const named = args.filter((a) => !a.startsWith('--'));
  const ids = named.length ? named : frozenDreams();
  const git = (...a: string[]) => Bun.spawnSync(['git', ...a], { cwd: HERE }).stdout.toString().trim();
  // The commit, marked where the tree has changes of its own: the view is not quite what that commit makes.
  const commit = `${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain', '--untracked-files=no', '--', '.', ':!evals/viewer') ? '-dirty' : ''}`;
  let failed = 0;
  for (const id of ids) {
    try {
      const dream = loadDream(id, live);
      let copy: { session: Session; path: string } | null = live
        ? { session: dream.session as Session, path: dream.path }
        : null;
      if (!copy)
        try {
          const d = loadDream(id, true);
          copy = { session: d.session as Session, path: d.path };
        } catch {
          copy = null;
        }
      const media = copy ? mediaOf(copy.path) : '';
      const { view, files } = viewDream(await withReadings(dream.session as Session), {
        id,
        source: live ? 'live' : 'frozen',
        commit,
        mockUps: true,
        fileOf: filesOf(copy?.session ?? null, media, matchGhost),
      });
      // The dreamer's own words: a frozen copy keeps none, its live copy does. Never given to the rebuild: the story
      // record reads the dreamer's messages, and the frozen dream is measured without them.
      const turns = (copy?.session as { transcript?: { role: string; content: string }[] } | undefined)?.transcript;
      if (!view.words && turns?.length)
        view.words = turns.map((t, i) => ({
          turn: i,
          who: t.role === 'user' ? ('dreamer' as const) : ('listener' as const),
          text: t.content,
        }));
      const dir = join(VIEWS, viewKey(id, live));
      mkdirSync(dir, { recursive: true });
      // Its mock-ups, and each picture it shows: the page serves this folder and nothing else. Whatever an earlier
      // build of this dream put here and this view no longer names is cleared (a view.json and its temp aside).
      const linked = filesIn(view);
      const keep = new Set([...linked, ...Object.keys(files), 'view.json']);
      for (const f of readdirSync(dir)) if (!keep.has(f) && /\.(png|jpe?g|webp)$/i.test(f)) unlinkSync(join(dir, f));
      for (const [name, png] of Object.entries(files)) writeFileSync(join(dir, name), png);
      for (const name of linked) {
        const at = join(dir, name);
        if (existsSync(at) || isLink(at)) unlinkSync(at);
        place(join(media, name), at);
      }
      writeWhole(join(dir, 'view.json'), `${JSON.stringify(view, null, 1)}\n`);
      const images = [...view.cuts.flatMap((c) => c.refs), ...view.ghosts.flatMap((g) => g.refs)].filter(
        (x) => x.source !== 'mockup',
      );
      const on = images.filter((x) => x.file).length;
      console.log(
        `${viewKey(id, live)}: ${view.cuts.length} cuts, ${view.ghosts.length} in-between pictures, ${view.sheets.length} sheets; ` +
          `${on} of ${images.length} images on this machine${copy ? '' : ' (no live copy)'}` +
          `${copy && images.length && !on ? ` (none in ${media})` : ''}; ` +
          `${view.words ? `${view.words.length} turns of the conversation` : 'no conversation'}; ` +
          `profile ${view.header.profile.full ? 'full' : 'NOT full'}`,
      );
    } catch (e) {
      failed++;
      console.error(`${id}: ${String(e).slice(0, 400)}`);
    }
  }
  if (failed) process.exit(1);
}
