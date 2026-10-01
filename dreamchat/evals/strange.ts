// The strangeness eval (the one builder's `strangest`, `told_events`, `thought_outside`; telling.ts): a breakdown scored
// against a dumped dream's labels (strange-set.json, written by hand from each text before the steps were built): the
// told events some moment carries, whether the key moment carries the dream's strangest fact, whether each concrete noun
// the actions use is the one thing some moment shows, whether the dreamer's own thought is seen from outside, and a
// guard: how many points are narration (what would, could or was supposed to be) instead of what a picture shows.
// bun run evals/strange.ts --state <state.json | breakdown.json> --dream <id> (no model calls), or --draft <n>
// [--dream <id>] [--out <dir>] (the import's breakdown drafted n times from each dream's text: writer and Jev only).
// Its second measure is the merged harness's retell gate, a stranger retelling each draft from its points alone.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Group = string[];
type Label = { id: string; says: string; all: Group[] };
type Dream = {
  id: string;
  text: string;
  events: Label[];
  strangest: { says: string; all: Group[] };
  nouns: string[];
  thoughts: string[];
};
type M = { id: string; action: string; visual_point: string; key?: boolean; eyes?: string };

const set = JSON.parse(readFileSync(join(dirname(import.meta.path), 'strange-set.json'), 'utf8')) as {
  dreams: Dream[];
};
const NARRATED =
  /\b(would|could|couldn't|can't|cannot|was|were|had|supposed to|as if|in order to|wondered|realized|realised)\b/i;
const matches = (text: string, all: Group[]) => all.every((g) => g.some((r) => new RegExp(r, 'i').test(text)));
const told = (m: M) => `${m.action} ${m.visual_point}`;

export function score(d: Dream, b: { scenes: { moments: M[] }[]; people: { is_dreamer?: boolean }[] }) {
  const ms = b.scenes.flatMap((sc) => sc.moments);
  const missing = d.events.filter((e) => !ms.some((m) => matches(told(m), e.all)));
  const key = ms.find((m) => m.key);
  const keyed = !!key && matches(told(key), d.strangest.all);
  const shown = ms.some((m) => matches(told(m), d.strangest.all));
  // A concrete noun the moments' actions use is kept when at least one of those moments makes it the one thing it shows.
  const used = d.nouns.filter((n) => ms.some((m) => new RegExp(n, 'i').test(m.action)));
  const dropped = used.filter(
    (n) => !ms.some((m) => new RegExp(n, 'i').test(m.action) && new RegExp(n, 'i').test(m.visual_point)),
  );
  // The dreamer's own thought, wish or words, seen: carried by a moment from outside, their face carrying it.
  const thoughts = d.events.filter((e) => d.thoughts.includes(e.id) && ms.some((m) => matches(told(m), e.all)));
  const seen = thoughts.filter((e) => ms.some((m) => m.eyes === 'outside' && matches(told(m), e.all)));
  // A guard: the one thing to show is what a picture shows, never narration (what would, could or was supposed to be).
  const narrated = ms.filter((m) => NARRATED.test(m.visual_point)).map((m) => `${m.id}: ${m.visual_point}`);
  return {
    moments: ms.length,
    narrated: narrated.length,
    narratedPoints: narrated,
    thoughtsSeen: `${seen.length}/${thoughts.length}`,
    events: `${d.events.length - missing.length}/${d.events.length}`,
    missing: missing.map((e) => `${e.id} ${e.says}`),
    keyed,
    shown,
    key: key ? `${key.id}: ${key.visual_point}` : null,
    nounsKept: `${used.length - dropped.length}/${used.length}`,
    nounsDropped: dropped,
    outside: ms.filter((m) => m.eyes === 'outside').length,
    dreamerListed: b.people.some((p) => p.is_dreamer),
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
    const producer = liveProducer(callJev);
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
