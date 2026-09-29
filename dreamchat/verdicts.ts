// The owner's verdicts on pictures already drawn, for S5's gate on the earlier pictures a moment is drawn from
// (refs.ts, DREAMCHAT_REFS): a picture the owner judged wrong is never sent again. Read from the story pictures'
// verdicts (evals/story-pictures.json: each saved moment's picture) and every picture checkpoint's answers
// (runs/checkpoint/<name>/: the pictures shown as A and B, which of them was old, and the owner's answer), in the
// dream chat's folder and DREAMCHAT_DATA's. What is not judged is allowed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Item } from './sheets';

export type Verdict = 'right' | 'partly' | 'wrong';

/** The verdicts known: by picture file (its content hash, as the store names it), and by dream and moment. */
export type Verdicts = { byFile: Map<string, Verdict>; byMoment: Map<string, Verdict> };

const read = <T>(path: string): T | null => {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
  } catch {
    return null;
  }
};
/** A picture file's content hash, from its path or name: `…/media/<sha>.png` or `<sha>.png`. */
export const fileKey = (path: string) =>
  basename(path)
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase();

/** The verdicts in these folders, the later over the earlier: a checkpoint's answer over the story's verdict. */
export function verdictsIn(roots: string[]): Verdicts {
  const byFile = new Map<string, Verdict>();
  const byMoment = new Map<string, Verdict>();
  const story = new Map<string, string>();
  for (const root of roots) {
    const rows = read<{ rows: { session: string; moment: string; picture?: string; story?: string }[] }>(
      join(root, 'evals', 'story-pictures.json'),
    );
    for (const r of rows?.rows ?? []) {
      if (!r.picture || !['right', 'partly', 'wrong'].includes(r.story ?? '')) continue;
      byFile.set(fileKey(r.picture), r.story as Verdict);
      byMoment.set(`${r.session}/${r.moment}`, r.story as Verdict);
      story.set(fileKey(r.picture), `${r.session}/${r.moment}`);
    }
  }
  for (const root of roots) {
    const dir = join(root, 'runs', 'checkpoint');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const made = read<Record<string, { from?: string; sha?: string }>>(join(dir, name, 'judge', 'made.json'));
      const answers = read<{ answers: Record<string, { answer: string }> }>(join(dir, name, 'answers.json'));
      if (!made || !answers) continue;
      for (const [id, x] of Object.entries(answers.answers ?? {})) {
        // A note sent without an answer judges neither picture.
        if (!x.answer) continue;
        for (const side of ['a', 'b']) {
          const shown = made[`img/${id}-${side}.jpg`];
          const file = shown?.sha ?? (shown?.from ? fileKey(shown.from) : undefined);
          if (!file) continue;
          const v: Verdict = x.answer === side || x.answer === 'both' ? 'right' : 'wrong';
          byFile.set(file, v);
          const moment = story.get(file);
          if (moment) byMoment.set(moment, v);
        }
      }
    }
  }
  return { byFile, byMoment };
}

let known: Verdicts | null = null;
/** The verdicts in this dream chat's folder and DREAMCHAT_DATA's, read once. */
export const verdicts = (): Verdicts =>
  (known ??= verdictsIn(
    [resolve(import.meta.dir), process.env.DREAMCHAT_DATA ? resolve(process.env.DREAMCHAT_DATA) : ''].filter(
      (x, i, all) => !!x && all.indexOf(x) === i,
    ),
  ));

/**
 * The earlier pictures of a dream never to be drawn from, by id, and why: the owner judged the picture wrong
 * (by its file, else by its dream and moment where the saved dream keeps no file), or S9 found it stale.
 */
export function withheldOf(
  dream: string | undefined,
  frames: Pick<Item, 'id' | 'kind' | 'mediaPath'>[],
  stale: string[] = [],
  table: Verdicts = verdicts(),
): Record<string, 'judged wrong' | 'stale'> {
  const out: Record<string, 'judged wrong' | 'stale'> = {};
  for (const f of frames) {
    if (f.kind !== 'cut') continue;
    const v = f.mediaPath
      ? table.byFile.get(fileKey(f.mediaPath))
      : dream
        ? table.byMoment.get(`${dream}/${f.id}`)
        : undefined;
    if (v === 'wrong') out[f.id] = 'judged wrong';
  }
  for (const id of stale) if (frames.some((f) => f.id === id && f.kind === 'cut')) out[id] ??= 'stale';
  return out;
}
