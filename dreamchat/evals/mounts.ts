// Fixtures up their walls: over every saved floor plan, the fixtures whose own name or place's words say they
// are high, at the top, on a wall or on the ceiling (a block: never stairs, a seat or ground), and whether each is drawn off the floor on the plan a
// moment is shot from (continuity.ts rawPlanBy, camera.ts mounted); and every room whose mock-up labels its
// front wall with a fixture's name (previs.ts frontLabel). Nothing is drawn and no model is asked.
//
//   DREAMCHAT_CAMERA=on DREAMCHAT_CUT_SHEET=on DREAMCHAT_RECORD=on bun run evals/mounts.ts [--live] [--show]
import type { Blocking, Spot } from '../blocking';
import { frontNamesFixture, wordsAbout } from '../camera';
import { placeWordsOf, rawPlanBy } from '../continuity';
import { frontLabel } from '../previs';
import type { Breakdown } from '../producer';
import type { Session } from '../session';
import { dataDir, frozenDreams, liveDreams, loadDream, readLive } from './saved';

/** Words that say a fixture is up a wall or on the ceiling ("up to the ceiling" says how tall, not where). */
export const SAID_UP =
  /\bhigh\b|\bat the top\b|\bnear the (?:ceiling|top)\b|\bon (?:the|a|every|each|one|its) (?:\w+ )?wall\b|\bceiling\b/;

const headOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/^\s*(?:the|a|an)\s+/, '')
    .split(/\s(?:with|on|in|of|at|by|near|from|beside)\s/)[0]
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .at(-1)
    ?.replace(/s$/, '');

/**
 * Whether a fixture's name, or what the place's words say right about it (camera.ts wordsAbout: "a round room
 * at the top of the lighthouse with windows" says nothing of the windows), says it is up a wall or on the ceiling.
 */
export function saidUp(s: Pick<Spot, 'name'>, placeWords: string): boolean {
  const head = headOf(s.name ?? '');
  if (!head) return false;
  const about = [(s.name ?? '').toLowerCase(), ...wordsAbout(head, placeWords)].map((x) =>
    x.replace(/\bup to the ceiling\b|\bto the ceiling\b/g, ''),
  );
  return about.some((x) => SAID_UP.test(x));
}

export type MountRow = {
  dream: string;
  moment: string;
  fixture: string;
  name: string;
  above: number | null;
  tall: number;
};

/** Every indoor moment's plan: its fixtures said up a wall, where each is, and its front wall's label. */
export function mountsOf(id: string, b: Breakdown) {
  const up: MountRow[] = [];
  const labels: { dream: string; moment: string; front: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const sc of b.scenes ?? [])
    for (const m of sc.moments) {
      const plan = rawPlanBy(b, m.id);
      if (!plan?.indoors) continue;
      // One row a plan and fixture: every moment on one plan shows the same fixtures.
      const key = `${sc.id}/${m.place}`;
      const first = !seen.has(key);
      seen.add(key);
      if (!first) continue;
      const words = placeWordsOf(b, m.id);
      for (const s of plan.spots.filter(
        (x) => x.fixture && x.name && (x.shape ?? 'block') === 'block' && saidUp(x, words),
      ))
        up.push({
          dream: id,
          moment: m.id,
          fixture: s.id,
          name: s.name!,
          above: s.above ?? null,
          tall: (s.size ?? [0, 0, 1])[2] / (plan.ceiling ?? 3.2),
        });
      const label = frontLabel(plan as Blocking);
      if (frontNamesFixture({ front: label, spots: plan.spots }))
        labels.push({ dream: id, moment: m.id, front: plan.front, label });
    }
  return { up, labels };
}

if (import.meta.main) {
  const live = process.argv.includes('--live');
  const show = process.argv.includes('--show');
  const dreams = live
    ? liveDreams(dataDir()).map((x) => ({ id: x.id, s: readLive(x).session as Session }))
    : frozenDreams().map((id) => ({ id, s: loadDream(id, false).session as Session }));
  const up: MountRow[] = [];
  const labels: ReturnType<typeof mountsOf>['labels'] = [];
  for (const d of dreams) {
    const b = d.s.draft?.breakdown;
    if (!b) continue;
    const x = mountsOf(d.id, structuredClone(b));
    up.push(...x.up);
    labels.push(...x.labels);
  }
  const floor = up.filter((r) => r.above === null);
  const tall = floor.filter((r) => r.tall >= 0.75);
  console.log(
    `${live ? 'live' : 'frozen'}, ${dreams.length} dreams, camera ${process.env.DREAMCHAT_CAMERA ?? 'off'}: fixtures said up a wall or on the ceiling ${up.length} (plans), on the floor ${floor.length} (${tall.length} of them as tall as three quarters of the room or more, which stand on the floor); front walls labelled with a fixture's name ${labels.length}`,
  );
  if (show) {
    for (const r of up)
      console.log(
        `  ${r.dream} ${r.moment} ${r.fixture} "${r.name}": ${r.above === null ? 'on the floor' : `${r.above} m up`}`,
      );
    for (const l of labels) console.log(`  label ${l.dream} ${l.moment}: "${l.label}"`);
  }
}
