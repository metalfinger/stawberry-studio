// Freezes a saved conversation into a slim fixture (evals/sources/<name>.json) with what the dream's
// tree is made from: the breakdown and its grounding notes, the prep, the chosen look, the sketches
// and frames without their media, and the goals as the conversation read them. Saved conversations
// are not kept in the repository; fixtures are, so tests and labelled sets can be rebuilt exactly.
//
//   bun run evals/freeze-session.ts <session id> [<fixture name>]      (the name is the session id when not given)
//
// Every field plan.ts `rebuild` reads is kept: the sketches' look, kind and who they are (isDreamer,
// several, partOf, extras), each moment's shot brief, the prep's briefs and floor plans. A fixture
// rebuilds exactly as the saved conversation does (evals/corpus.ts --verify checks it). Where the
// dream chat's Strawberry store is at hand, each moment drawn also keeps what was really sent to be
// drawn (`sent`: its prompt and its images, named by what they are), read from the store without
// changing it. The saved conversation is found in this checkout's state/, DREAMCHAT_DATA's or another
// worktree's (evals/saved.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import { goalStatus } from '../lib';
import { ghostName } from '../plan';
import type { Session } from '../session';
import { dataDir, readSession } from './saved';

/** The fixture format: 2 keeps every field rebuild reads (1, before 26 Sep, dropped who the dreamer is and the briefs). */
export const FROZEN = 2;

type Build = NonNullable<Session['build']>;
type SavedItem = Build['items'][number];

/** One sketch or picture without its media: what rebuild reads of it. */
export const slimItem = (i: SavedItem) => ({
  id: i.id,
  kind: i.kind,
  name: i.name,
  fields: i.fields,
  status: i.status,
  version: i.version,
  ...(i.review ? { review: i.review } : {}),
  ...(i.ask !== undefined ? { ask: i.ask } : {}),
  ...(i.isDreamer ? { isDreamer: i.isDreamer } : {}),
  ...(i.several !== undefined ? { several: i.several } : {}),
  ...(i.partOf ? { partOf: i.partOf } : {}),
  ...(i.extras ? { extras: i.extras } : {}),
  ...(i.held?.length ? { held: i.held } : {}),
  ...(i.shot ? { shot: i.shot } : {}),
  ...(i.frame
    ? {
        frame: {
          plan: {
            ...(i.frame.plan?.eye ? { eye: i.frame.plan.eye } : {}),
            ...(i.frame.plan?.view ? { view: i.frame.plan.view } : {}),
          },
        },
      }
    : {}),
  ...(i.ghost ? { ghost: i.ghost } : {}),
});

/** What was really sent for each moment drawn: its prompt and its images, named as rebuild names them. */
export function sentFromStore(s: Session, store: string): Record<string, { prompt: string; images: string[] }> {
  const db = `file:${store}?immutable=1`;
  const sql = (q: string) => spawnSync('sqlite3', ['-json', db, q], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const frames = s.build?.frames ?? [];
  const items = s.build?.items ?? [];
  const out: Record<string, { prompt: string; images: string[] }> = {};
  for (const f of frames) {
    if (f.kind !== 'cut' || !f.recipeId || !/^[\w-]+$/.test(f.recipeId)) continue;
    const got = sql(`select spec from recipes where id = '${f.recipeId}'`);
    if (got.status !== 0 || !got.stdout.trim()) continue;
    const spec = JSON.parse((JSON.parse(got.stdout) as { spec: string }[])[0].spec) as {
      prompt: string;
      references?: { media_id: string; role: string }[];
    };
    const refs = spec.references ?? [];
    const ids = refs.map((r) => r.media_id).filter((m) => /^[\w-]+$/.test(m));
    const media = ids.length
      ? (JSON.parse(
          sql(`select id, node_id, label from media where id in (${ids.map((m) => `'${m}'`).join(',')})`).stdout ||
            '[]',
        ) as { id: string; node_id: string; label: string }[])
      : [];
    // By the picture that has it now, else by the node it was made for (an older take). An in-between
    // picture's take is filed on its subject's node, so the pictures are matched before the sketches.
    const named = (x: SavedItem) =>
      x.kind === 'ghost' && x.ghost ? ghostName(x.ghost) : x.kind === 'cut' ? `picture:${x.id}` : `sketch:${x.id}`;
    const name = (m: string) => {
      const row = media.find((x) => x.id === m);
      if (f.layout?.mediaId === m || row?.label.startsWith('Previs')) return `previs:${f.id}`;
      const now = [...frames, ...items].find((x) => x.mediaId === m);
      if (now) return named(now);
      const was = row && [...frames, ...items].find((x) => x.nodeId === row.node_id);
      return was ? named(was) : 'other';
    };
    out[f.id] = { prompt: spec.prompt, images: refs.map((r) => `${r.role} ${name(r.media_id)}`) };
  }
  return out;
}

/** A saved conversation as its fixture. */
export function freeze(id: string, s: Session, store?: string) {
  const threshold = dreamConfig().confidence_threshold;
  const sent = store && existsSync(store) ? sentFromStore(s, store) : {};
  return {
    frozen: FROZEN,
    from: id,
    draft: {
      breakdown: s.draft?.breakdown,
      downgraded: s.draft?.downgraded ?? [],
      ...(s.draft?.readings ? { readings: s.draft.readings } : {}),
    },
    prep: s.prep
      ? {
          basedOn: s.prep.basedOn,
          blocking: s.prep.blocking,
          shots: s.prep.shots,
          previs: Object.fromEntries(Object.entries(s.prep.previs ?? {}).map(([k, v]) => [k, v.split('/').at(-1)])),
          storyboard: s.prep.storyboard,
          ...(s.prep.record ? { record: s.prep.record } : {}),
        }
      : undefined,
    style: s.style ?? null,
    build: {
      items: (s.build?.items ?? []).map(slimItem),
      frames: (s.build?.frames ?? []).map((f) => ({ ...slimItem(f), ...(sent[f.id] ? { sent: sent[f.id] } : {}) })),
    },
    goals: Object.fromEntries(
      Object.keys(s.state.goals).map((g) => [
        g,
        { status: goalStatus(s.state.goals[g], threshold), asked: s.askCounts[g] ?? 0 },
      ]),
    ),
  };
}

if (import.meta.main) {
  const [id, name = id] = process.argv.slice(2);
  if (!id || !/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(name)) {
    console.error('usage: bun run evals/freeze-session.ts <session id> [<fixture name>]');
    process.exit(1);
  }
  const data = dataDir([id]);
  const store = join(process.env.DREAMCHAT_STRAWBERRY_HOME ?? join(data, 'strawberry-home'), 'production.sqlite');
  const out = freeze(id, readSession(data, id), store);
  writeFileSync(join(import.meta.dir, 'sources', `${name}.json`), JSON.stringify(out));
  const sent = out.build.frames.filter((f) => 'sent' in f).length;
  console.log(`evals/sources/${name}.json from ${id}${sent ? `, with what was sent for ${sent} moments` : ''}`);
}
