// The harness's reply check (jev.ts replyCheck, S8) on a hand-labelled set: how often its move, leading and
// either/or answers agree with the hand, beside the listening test's own (`evals/listening.ts --audit <set>`).
// The two share a judge and close wording; this set, labelled after both were written and used to tune
// neither, is what says whether passing the test means more than passing the check.
//
//   bun --env-file=… run evals/probes/check-audit.ts [evals/listening-audit-s8.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../../dream';
import { jevWithModel, LEADS_BAR, replyCheck, type ReplyCheckInput } from '../../jev';
import { JEV_MODEL, type AuditItem } from '../listening';

const file = process.argv[2] ?? join(import.meta.dir, '..', 'listening-audit-s8.json');
const items = (JSON.parse(readFileSync(file, 'utf8')) as { items: AuditItem[] }).items;
const jev = jevWithModel(JEV_MODEL());
const cfg = dreamConfig();
const out = {
  move: { agree: 0, of: 0, missed: [] as string[] },
  eitherOr: { agree: 0, of: 0, missed: [] as string[] },
  leading: { agree: 0, of: 0, missed: [] as string[] },
};
for (const it of items) {
  const said = it.transcript.filter((e) => e.role === 'user').map((e) => e.content);
  const m = it.move;
  const idx =
    m.kind === 'explore_thread' || m.kind === 'circle_back' ? Number(m.threadId.match(/^msg_(\d+)$/)?.[1]) : NaN;
  const goal = m.kind === 'probe_goal' ? cfg.goals.find((g) => g.id === m.goalId) : undefined;
  const x: ReplyCheckInput = {
    move: m,
    moveLine: it.brief.replace(/^Move: /, '').split('\n')[0],
    said: said.slice(0, it.turn),
    messages: (it.transcript.at(-1)?.content ?? '').split(/\n+/).filter(Boolean),
    ...(Number.isFinite(idx) ? { thread: it.transcript[idx]?.content } : {}),
    ...(goal ? { topic: goal.ask_openly ?? goal.probe_hint, example: goal.open_question } : {}),
  };
  const { state, questions } = replyCheck(x);
  const call = await jev(state, questions);
  const p = (k: string) => {
    const a = call.answers?.[k];
    return a?.type === 'noul' ? a.noul : null;
  };
  // As replyFailures reads them: the move at 0.5, a lead (by its question or what it states) from LEADS_BAR.
  const got = {
    move: p('move') === null ? null : (p('move') as number) >= 0.5,
    eitherOr: p('either_or') === null ? null : (p('either_or') as number) >= 0.5,
    leading:
      p('states_unsaid') === null
        ? null
        : Math.max(p('leads') ?? 0, 0) >= LEADS_BAR || (p('states_unsaid') as number) >= 0.5,
  };
  for (const k of ['move', 'eitherOr', 'leading'] as const) {
    const want = it.labels[k];
    const g = got[k];
    if (want === undefined || g === null) continue;
    out[k].of += 1;
    if (g === want) out[k].agree += 1;
    else out[k].missed.push(`${it.id} (check ${g ? 'yes' : 'no'}, hand ${want ? 'yes' : 'no'})`);
  }
}
console.log(`the reply check on ${file}, Jev ${JEV_MODEL()}:`);
for (const [k, v] of Object.entries(out))
  console.log(`  ${k}: ${v.agree}/${v.of} agree${v.missed.length ? `; not: ${v.missed.join(', ')}` : ''}`);
