// The texture eval: a breakdown's points scored against a dream's texture labels (texture-set.json, written by hand
// from each text before building): a seeable simile or reason kept as what some point shows, an unseeable one kept out
// of every point (the narration carries it), and a guard: points that copy a simile's own words, or say "like" or "as
// if" in place of what is seen. bun run <this> --state <state.json | breakdown.json> --dream <id> (no model calls), or
// --draft <n> [--dream <id>] [--out <dir>] (the import's breakdown drafted n times from each text: writer and Jev only).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Group = string[];
type Texture = { id: string; says: string; seeable: boolean; shows?: Group[]; never?: string; copy?: string };
type Dream = { id: string; text: string; textures: Texture[] };
type M = { id: string; action: string; visual_point: string };

const set = JSON.parse(readFileSync(join(dirname(import.meta.path), 'texture-set.json'), 'utf8')) as {
  dreams: Dream[];
};
const matches = (text: string, all: Group[]) => all.every((g) => g.some((r) => new RegExp(r, 'i').test(text)));
const SIMILE = /\b(?:like|as if|as though)\b/i;

export function score(d: Dream, b: { scenes: { moments: M[] }[] }) {
  const points = b.scenes.flatMap((sc) => sc.moments).map((m) => `${m.id}: ${m.visual_point ?? ''}`);
  const seeable = d.textures.filter((t) => t.seeable);
  const kept = seeable.filter((t) => points.some((p) => matches(p, t.shows ?? [])));
  const unseeable = d.textures.filter((t) => !t.seeable);
  const leaked = unseeable.filter((t) => points.some((p) => new RegExp(t.never ?? '$^', 'i').test(p)));
  const copies = points.filter(
    (p) => SIMILE.test(p) || d.textures.some((t) => t.copy && new RegExp(t.copy, 'i').test(p)),
  );
  return {
    moments: points.length,
    seeableKept: `${kept.length}/${seeable.length}`,
    missed: seeable.filter((t) => !kept.includes(t)).map((t) => `${t.id} ${t.says}`),
    unseeableLeaked: `${leaked.length}/${unseeable.length}`,
    leaked: leaked.map((t) => `${t.id} ${t.says}`),
    copies: copies.length,
    copied: copies,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const only = val('--dream');
  const state = val('--state');
  if (state) {
    const d = set.dreams.find((x) => x.id === only);
    if (!d) throw new Error(`--dream: one of ${set.dreams.map((x) => x.id).join(', ')}`);
    const s = JSON.parse(readFileSync(state, 'utf8'));
    console.log(JSON.stringify({ dream: d.id, state, ...score(d, s.draft?.breakdown ?? s) }));
  } else {
    const n = Number(val('--draft') ?? 1);
    const root = process.cwd();
    await import(`${root}/evals/local-env`);
    const { liveProducer } = await import(`${root}/session`);
    const { callJev } = await import(`${root}/jev`);
    const producer = liveProducer(callJev, { telling: true });
    for (const d of set.dreams.filter((x) => !only || x.id === only))
      for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        const r = await producer([{ role: 'user', content: d.text }]);
        const out = val('--out');
        if (out) {
          const { mkdirSync, writeFileSync } = await import('node:fs');
          mkdirSync(out, { recursive: true });
          writeFileSync(join(out, `${d.id}-${i}.json`), JSON.stringify(r.breakdown, null, 1));
        }
        console.log(
          JSON.stringify({
            dream: d.id,
            run: i,
            seconds: Math.round((Date.now() - t0) / 1000),
            ...score(d, r.breakdown),
          }),
        );
      }
  }
}
