// The cast reading (cast.ts) of each saved dream, asked once and kept: one writer call per dream, by the writer's name
// and a hash of exactly what it was asked (runs/cast-cache.json, beside the typed and implied caches). With `ask`
// false only the cache is read (what the builder, the evals and the viewer do): a dream not in it has no reading and
// is said so, never read as having none.
//
//   DREAMCHAT_WRITER=claude bun run evals/cast-cache.ts --ask            every frozen dream
//   DREAMCHAT_WRITER=claude bun run evals/cast-cache.ts --ask --live     every saved conversation too (DREAMCHAT_DATA)
//   bun run evals/cast-cache.ts                                          what each dream's reading holds, from the cache
//   DREAMCHAT_WRITER=claude bun run evals/cast-cache.ts --wardrobe --ask  each untold group's guessed clothes (wardrobe.ts)
//   DREAMCHAT_WRITER=claude bun run evals/cast-cache.ts --built --ask     each place told by its build (built.ts)

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type CastReading,
  castAsk,
  castWriterName,
  parseCast,
  type WriteFn,
  withCastItems,
  withCastThings,
  writeCast,
} from '../cast';
import type { Session } from '../session';
import { type BuiltReading, builtAsk, parseBuilt, withBuilt } from '../built';
import { parseWardrobe, type WardrobeReading, wardrobeAsk, withWardrobes } from '../wardrobe';
import { DIR, sha256 } from './saved';

export const CAST_CACHE = process.env.DREAMCHAT_CAST_CACHE ?? join(DIR, 'runs', 'cast-cache.json');

type Entry = { content: string; usage?: unknown };

const loaded = new Map<string, Record<string, Entry>>();
const cacheOf = (file: string) => {
  let c = loaded.get(file);
  if (!c)
    loaded.set(file, (c = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>) : {}));
  return c;
};
const save = (file: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(cacheOf(file))}\n`);
  renameSync(`${file}.tmp`, file);
};

/** The dreamer's own messages, where the dream keeps them: size words may rest on them. */
const toldOf = (s: Session) =>
  ((s as { transcript?: { role: string; content: string }[] }).transcript ?? [])
    .filter((t) => t.role === 'user')
    .map((t) => t.content);

/**
 * A dream's cast reading: from the cache, or with `ask` from the writer (and kept). Null where it is not cached and
 * not asked, or the dream has no breakdown.
 */
export async function castReadingOf(
  s: Session,
  opts: { ask?: boolean; write?: WriteFn; cacheFile?: string } = {},
): Promise<{ reading: CastReading; dropped: string[]; asked: boolean } | null> {
  const b = s.draft?.breakdown;
  if (!b) return null;
  const file = opts.cacheFile ?? CAST_CACHE;
  const told = toldOf(s);
  const messages = castAsk(b, told);
  const key = sha256(`cast writer ${castWriterName()}\n${JSON.stringify(messages)}`);
  const cache = cacheOf(file);
  let hit = cache[key];
  let asked = false;
  if (!hit) {
    if (!opts.ask) return null;
    const res = await (opts.write ?? writeCast)(messages);
    hit = cache[key] = { content: res.content, usage: res.usage };
    save(file);
    asked = true;
  }
  const { reading, dropped } = parseCast(hit.content, b, told);
  return { reading, dropped, asked };
}

/**
 * A dream's guessed clothes for its untold groups (wardrobe.ts), kept in the same cache: from it, or with `ask` from the
 * writer. Null where the dream has no untold group, or the reading is not cached and not asked.
 */
export async function wardrobeOf(
  s: Session,
  opts: { ask?: boolean; write?: WriteFn; cacheFile?: string } = {},
): Promise<{ reading: WardrobeReading; asked: boolean } | null> {
  const b = s.draft?.breakdown;
  const messages = b ? wardrobeAsk(b) : null;
  if (!b || !messages) return null;
  const file = opts.cacheFile ?? CAST_CACHE;
  const key = sha256(`wardrobe writer ${castWriterName()}\n${JSON.stringify(messages)}`);
  const cache = cacheOf(file);
  let hit = cache[key];
  let asked = false;
  if (!hit) {
    if (!opts.ask) return null;
    const res = await (opts.write ?? writeCast)(messages);
    hit = cache[key] = { content: res.content, usage: res.usage };
    save(file);
    asked = true;
  }
  return { reading: parseWardrobe(hit.content, b), asked };
}

/**
 * A dream's places told by how they are built (built.ts), kept in the same cache: from it, or with `ask` from the
 * writer. Null where the dream has no place sketch, or the reading is not cached and not asked.
 */
export async function builtOf(
  s: Session,
  opts: { ask?: boolean; write?: WriteFn; cacheFile?: string } = {},
): Promise<{ reading: BuiltReading; asked: boolean } | null> {
  const items = s.build?.items ?? [];
  const messages = builtAsk(items, s.draft?.breakdown?.logline ?? '');
  if (!messages) return null;
  const file = opts.cacheFile ?? CAST_CACHE;
  const key = sha256(`built writer ${castWriterName()}\n${JSON.stringify(messages)}`);
  const cache = cacheOf(file);
  let hit = cache[key];
  let asked = false;
  if (!hit) {
    if (!opts.ask) return null;
    const res = await (opts.write ?? writeCast)(messages);
    hit = cache[key] = { content: res.content, usage: res.usage };
    save(file);
    asked = true;
  }
  return { reading: parseBuilt(hit.content, items), asked };
}

/**
 * With the one builder's `cast_named` step, a saved dream with its cast reading in (draft.readings.cast) and its
 * things cast in its breakdown, from the cache only. Run after the typed and implied readings are in: they were asked
 * of the breakdown as saved. `missing` where the dream has no cached reading.
 */
export async function withCast(
  s: Session,
  opts: { cacheFile?: string } = {},
): Promise<{ session: Session; missing: boolean }> {
  const { builds } = await import('../cleanups');
  if (!builds('cast_named') || !s.draft?.breakdown) return { session: s, missing: false };
  const got = await castReadingOf(s, { cacheFile: opts.cacheFile });
  if (!got) return { session: s, missing: true };
  const session = structuredClone(s);
  session.draft = {
    ...session.draft!,
    breakdown: withCastThings(session.draft!.breakdown!, got.reading),
    readings: { ...(session.draft?.readings ?? {}), cast: got.reading },
  };
  if (session.build) session.build = { ...session.build, items: withCastItems(session.build.items, got.reading) };
  // With the `extras_wardrobe` step, each untold group's guessed clothes on its sketch item, from the cache only.
  if (builds('extras_wardrobe') && session.build) {
    const w = await wardrobeOf(session, { cacheFile: opts.cacheFile });
    if (w) session.build = { ...session.build, items: withWardrobes(session.build.items, w.reading) };
  }
  // With the `place_built` step, each place whose words said its use told by how it is built, from the cache only.
  if (builds('place_built') && session.build) {
    const p = await builtOf(session, { cacheFile: opts.cacheFile });
    if (p) session.build = { ...session.build, items: withBuilt(session.build.items, p.reading) };
  }
  return { session, missing: false };
}

if (import.meta.main) {
  const { frozenDreams, liveDreams, loadDream, dataDir } = await import('./saved');
  const args = process.argv.slice(2);
  const ask = args.includes('--ask');
  const live = args.includes('--live');
  const ids = args.filter((a) => !a.startsWith('--'));
  const dreams: { id: string; session: Session }[] = [];
  for (const id of ids.length ? ids : frozenDreams())
    dreams.push({ id, session: loadDream(id, false).session as Session });
  if (live)
    for (const d of liveDreams(dataDir()))
      try {
        dreams.push({ id: `${d.id} (live)`, session: JSON.parse(readFileSync(d.path, 'utf8')) as Session });
      } catch {
        // A conversation that cannot be read is left out.
      }
  // A few at once: each is one writer call.
  const { limiter } = await import('../lib');
  const limit = limiter(4);
  let askedN = 0;
  await Promise.all(
    dreams.map((d) =>
      limit(async () => {
        try {
          // --built: each place told by its build (built.ts), in place of the cast reading.
          if (args.includes('--built')) {
            const p = await builtOf(d.session, { ask });
            if (p?.asked) askedN++;
            return console.log(
              `${d.id}: ${
                !p
                  ? 'no place, or not cached'
                  : Object.entries(p.reading)
                      .map(([id, v]) => `${id}: ${v.name} | ${v.kind} | ${v.in}`)
                      .join('; ') || 'none rewritten'
              }`,
            );
          }
          // --wardrobe: each untold group's guessed clothes (wardrobe.ts), in place of the cast reading.
          if (args.includes('--wardrobe')) {
            const w = await wardrobeOf(d.session, { ask });
            if (w?.asked) askedN++;
            return console.log(
              `${d.id}: ${
                !w
                  ? 'no untold group, or not cached'
                  : Object.entries(w.reading)
                      .map(([id, v]) => `${id}: ${v}`)
                      .join('; ') || 'none read'
              }`,
            );
          }
          const got = await castReadingOf(d.session, { ask });
          if (!got) return console.log(`${d.id}: not cached${d.session.draft?.breakdown ? '' : ' (no breakdown)'}`);
          if (got.asked) askedN++;
          const t = got.reading.things.map(
            (x) =>
              `${x.name} [${x.kind}${x.near ? ` near ${x.near}` : ''}${x.many ? ` ×${x.many}` : ''}] ${x.moments.map((m) => `${m.id}${m.where === 'beyond' ? '(beyond)' : ''}`).join(',')}`,
          );
          const bo = got.reading.bodies.map(
            (x) => `${x.id} ${x.height_m} m ${x.shape}${x.words ? ` ("${x.words}")` : ''}`,
          );
          const fx = got.reading.fixtures.map(
            (x) => `${x.place}: ${x.name} [${x.kind}${x.where ? `, ${x.where}` : ''}${x.count ? ` ×${x.count}` : ''}]`,
          );
          console.log(
            `${d.id}: things ${t.length ? t.join('; ') : 'none'} | bodies ${bo.length ? bo.join('; ') : 'none'} | fixtures ${fx.length ? fx.join('; ') : 'none'}${got.dropped.length ? ` | dropped ${got.dropped.join('; ')}` : ''}`,
          );
        } catch (e) {
          console.log(`${d.id}: ${String(e).slice(0, 200)}`);
        }
      }),
    ),
  );
  console.log(`${dreams.length} dreams; ${askedN} asked now`);
}
