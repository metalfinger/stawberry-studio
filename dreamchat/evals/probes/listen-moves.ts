// Move selection replayed on saved conversations, with no model called: at each listening turn, the move
// the code picks now from the state that turn recorded, beside the move it picked then. Each decision is
// replayed one step (what would have followed a different move is not known), so this shows where the
// rules decide differently, not how the conversation would have gone.
//
//   DREAMCHAT_LISTEN=on bun run evals/probes/listen-moves.ts <folder of saved sessions> [--show]
//
// The folder holds <id>.json and <id>/turn-<n>.json, as the harness saves them (state/, or a copy).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../../dream';
import { dryRun, followStreakOf, listenOn, moveKey, selectMove, type State } from '../../lib';
import type { Session, TurnRecord } from '../../session';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: bun run evals/probes/listen-moves.ts <folder> [--show]');
  process.exit(1);
}
const show = args.includes('--show');
const listen = listenOn();
const cfg = dreamConfig();

type Row = { id: string; turn: number; was: string; now: string; wasRule: string; nowRule: string; finished: boolean };
const rows: Row[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Session;
  const id = f.replace(/\.json$/, '');
  const turns = s.turns;
  for (let i = 1; i < turns.length; i++) {
    const t = turns[i];
    const before = turns[i - 1];
    if (before.phase !== 'listen') continue;
    // Only a saved session has each turn's whole state; a frozen one (evals/listening.ts --freeze) keeps
    // a few readings, not enough to choose a move from.
    const path = join(dir, id, `turn-${t.turn}.json`);
    if (!existsSync(path)) continue;
    const after = (JSON.parse(readFileSync(path, 'utf8')) as { stateAfter: State }).stateAfter;
    const state: State = { ...after, last_move: moveKey(before.move) };
    const earlier: TurnRecord[] = turns.slice(0, i);
    const followStreak = followStreakOf(
      earlier.map((e) => e.move),
      listen,
    );
    let forgotStreak = t.forgot ? 1 : 0;
    for (let k = earlier.length - 1; t.forgot && k >= 0 && earlier[k].forgot; k--) forgotStreak++;
    const askCounts: Record<string, number> = {};
    for (const e of earlier)
      if (e.move.kind === 'probe_goal') askCounts[e.move.goalId] = (askCounts[e.move.goalId] ?? 0) + 1;
    const resumedAt = earlier.findLast((e, k) => k > 0 && earlier[k - 1].phase === 'retell' && e.phase === 'listen');
    const times = earlier.filter((e, k) => k > 0 && earlier[k - 1].phase === 'retell' && e.phase === 'listen').length;
    const { move, rule } = selectMove(state, cfg, {
      listen,
      phase: 'listen',
      askCounts,
      listenTurns: t.turn,
      retells: 0,
      followStreak,
      forgotStreak,
      dryStreak: dryRun(earlier, !!t.dry),
      resumed: resumedAt ? { times, since: t.turn - resumedAt.turn } : undefined,
    });
    rows.push({
      id,
      turn: t.turn,
      was: moveKey(t.move),
      now: moveKey(move),
      wasRule: t.rule,
      nowRule: rule,
      finished: state.signals.finished_telling >= 0.6,
    });
  }
}

const kind = (k: string) => k.split(':')[0];
const count = (xs: Row[], pick: (r: Row) => string) => {
  const c: Record<string, number> = {};
  for (const r of xs) c[pick(r)] = (c[pick(r)] ?? 0) + 1;
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
};
console.log(`${rows.length} listening decisions replayed from ${dir} (DREAMCHAT_LISTEN=${listen ? 'on' : 'off'})`);
console.log(`the same move: ${rows.filter((r) => r.was === r.now).length}`);
console.log(`picked then, by kind: ${count(rows, (r) => kind(r.was))}`);
console.log(`picked now, by kind: ${count(rows, (r) => kind(r.now))}`);
const cb = rows.filter((r) => kind(r.was) === 'circle_back');
console.log(`circle_back then: ${cb.length}; now: ${count(cb, (r) => kind(r.now))}`);
const cbNow = rows.filter((r) => kind(r.now) === 'circle_back');
console.log(
  `circle_back now: ${cbNow.length}, of them while the dream is still being told ${cbNow.filter((r) => !r.finished).length}, on the message just before the latest ${cbNow.filter((r) => Number(r.now.match(/msg_(\d+)/)?.[1]) === 2 * r.turn - 3).length}`,
);
if (show)
  for (const r of rows.filter((x) => x.was !== x.now))
    console.log(`  ${r.id} ${r.turn}: ${r.was} (${r.wasRule}) -> ${r.now} (${r.nowRule})`);
