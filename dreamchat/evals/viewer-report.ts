// The owner's verdicts in the harness viewer, against what the viewer shows now (VIEWER_PLAN.md, "From verdicts to an
// eval"). Each verdict keeps hashes of what it judged: the chain (images, their roles and order, the mock-up, the
// camera), the words (the prompt) and the facts. A verdict stands while its hashes do; when the chain moves the node is
// read again in full; when only the words or facts move, its diff is confirmed. For a change to references, in-between
// pictures, the edit base or the camera, this is the bar: no node the owner called right may be left moved and unread.
//
//   bun run evals/viewer-report.ts                     every dream with answers (evals/viewer/*.json), with the profile on
//   bun run evals/viewer-report.ts <dream id> …        only these

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ViewAnswers, ViewDream, ViewHashes, ViewVerdict } from '../viewer/types';

export const ANSWERS = join(import.meta.dir, 'viewer');

export type NodeState =
  | { node: string; state: 'not read' }
  | { node: string; state: 'current'; verdict: ViewVerdict['verdict'] }
  | { node: string; state: 'read again'; verdict: ViewVerdict['verdict']; moved: (keyof ViewHashes)[] }
  | { node: string; state: 'confirm'; verdict: ViewVerdict['verdict']; moved: (keyof ViewHashes)[] }
  | { node: string; state: 'gone'; verdict: ViewVerdict['verdict'] };

/** Every node the viewer shows now (cuts, in-between pictures, sheets), each with its verdict's state. */
export function nodeStates(view: ViewDream, answers: ViewAnswers | null): NodeState[] {
  const now = new Map<string, ViewHashes>([
    ...view.sheets.map((x) => [x.key, x.hashes] as const),
    ...view.ghosts.map((x) => [x.id, x.hashes] as const),
    ...view.cuts.map((x) => [x.id, x.hashes] as const),
  ]);
  const out: NodeState[] = [];
  for (const [node, h] of now) {
    const v = answers?.verdicts[node];
    if (!v) {
      out.push({ node, state: 'not read' });
      continue;
    }
    const moved = (['chain', 'words', 'facts'] as const).filter((k) => v.hashes[k] !== h[k]);
    out.push(
      !moved.length
        ? { node, state: 'current', verdict: v.verdict }
        : moved.includes('chain')
          ? { node, state: 'read again', verdict: v.verdict, moved }
          : { node, state: 'confirm', verdict: v.verdict, moved },
    );
  }
  for (const [node, v] of Object.entries(answers?.verdicts ?? {}))
    if (!now.has(node)) out.push({ node, state: 'gone', verdict: v.verdict });
  return out;
}

/** The bar: nodes called right whose chain moved and have not been read again. */
export const unreadRight = (xs: NodeState[]) => xs.filter((x) => x.state === 'read again' && x.verdict === 'right');

if (import.meta.main) {
  const { loadDream } = await import('./saved');
  const { viewDream, withReadings, PROFILE } = await import('../viewer/data');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const files = existsSync(ANSWERS) ? readdirSync(ANSWERS).filter((f) => f.endsWith('.json')) : [];
  const commit = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD']).stdout.toString().trim();
  const off = Object.entries(PROFILE).filter(([k, v]) => process.env[k] !== v);
  if (off.length) console.log(`not the harness's profile: ${off.map(([k, v]) => `${k}=${v}`).join(' ')} expected`);
  let bar = 0;
  for (const f of files) {
    const answers = JSON.parse(readFileSync(join(ANSWERS, f), 'utf8')) as ViewAnswers;
    if (only.length && !only.includes(answers.dream)) continue;
    const s = await withReadings(loadDream(answers.dream, answers.source === 'live').session as never);
    const { view } = viewDream(s, { id: answers.dream, source: answers.source, commit });
    const xs = nodeStates(view, answers);
    const count = (st: NodeState['state'], v?: ViewVerdict['verdict']) =>
      xs.filter((x) => x.state === st && (!v || ('verdict' in x && x.verdict === v))).length;
    console.log(
      `${answers.dream}: ${xs.length} nodes; current ${count('current')} (right ${count('current', 'right')}, wrong ${count('current', 'wrong')}, unsure ${count('current', 'unsure')}); read again ${count('read again')}; confirm a diff ${count('confirm')}; not read ${count('not read')}; gone ${count('gone')}`,
    );
    for (const x of xs)
      if (x.state === 'read again' || x.state === 'confirm')
        console.log(`  ${x.state}: ${x.node} (${x.verdict}; ${x.moved.join(', ')} moved)`);
    bar += unreadRight(xs).length;
  }
  console.log(
    bar
      ? `BAR NOT MET: ${bar} nodes called right have moved and are unread`
      : 'bar met: no node called right is moved and unread',
  );
  process.exit(bar ? 1 : 0);
}
