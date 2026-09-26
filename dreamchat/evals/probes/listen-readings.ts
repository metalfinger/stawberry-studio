// The answers to profiles and retellings in saved conversations, read again as the harness would read them
// now (DREAMCHAT_LISTEN=on): the question each turn asked (a profile's in S8's wording), asked of Jev again over the
// conversation as it stood, and read by `choiceByAction`; beside the listening test's own reading of each
// answer (evals/listening.ts: clear or not, and whether it changes or adds anything). No reply is written,
// so this needs no writer model, only Jev.
//
//   bun --env-file=… run evals/probes/listen-readings.ts <scored run: runs/listening/<label>.json> <saved sessions> [--show]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ACTIONS,
  type Answer,
  choiceByAction,
  jevWithModel,
  PROFILE_REPLY_S8,
  type Question,
  READ_BY,
  renderTranscript,
} from '../../jev';
import type { Session } from '../../session';
import { JEV_MODEL } from '../listening';
import { sha256 } from '../saved';

const [runPath, dir] = process.argv.slice(2);
if (!runPath || !dir) {
  console.error('usage: bun run evals/probes/listen-readings.ts <scored run> <saved sessions> [--show]');
  process.exit(1);
}
const show = process.argv.includes('--show');
const CACHE = join(import.meta.dir, '..', '..', 'runs', 'listening', 'readings-cache.json');
const cache: Record<string, Answer> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const jev = jevWithModel(JEV_MODEL());

type Scored = {
  sessions: {
    id: string;
    answers?: {
      kind: 'profile' | 'retell';
      turn: number;
      answer: string;
      reading: string;
      clear: number | null;
      asked: number | null;
      changes?: number | null;
    }[];
  }[];
};
const run = JSON.parse(readFileSync(runPath, 'utf8')) as Scored;
const tally = () => ({ n: 0, changeReadSettled: 0, settledReadChange: 0, clearReadUnclear: 0, unclearReadSettled: 0 });
const was = tally();
const now = tally();
const count = (t: ReturnType<typeof tally>, reading: string, a: Scored['sessions'][number]['answers'] & object) => {
  const x = a as unknown as { clear: number | null; asked: number | null; changes?: number | null };
  const asked = x.asked === null || x.asked >= 0.5;
  t.n += 1;
  if (['confirmed', 'you_choose'].includes(reading) && (x.changes ?? 0) >= 0.5 && asked) t.changeReadSettled += 1;
  if (['changes', 'corrected', 'added_more'].includes(reading) && (x.changes ?? 1) < 0.5) t.settledReadChange += 1;
  if (reading === 'unclear' && asked && (x.clear ?? 0) >= 0.5) t.clearReadUnclear += 1;
  if (reading !== 'unclear' && asked && x.clear !== null && x.clear < 0.5) t.unclearReadSettled += 1;
};
for (const s of run.sessions) {
  const path = join(dir, `${s.id}.json`);
  if (!existsSync(path)) continue;
  const session = JSON.parse(readFileSync(path, 'utf8')) as Session;
  for (const a of s.answers ?? []) {
    const d = join(dir, s.id, `turn-${a.turn}.json`);
    if (!existsSync(d) || a.changes === null || a.changes === undefined || a.reading === 'goes_on') continue;
    const key = a.kind === 'profile' ? 'profile_reply' : 'retell_reply';
    const asked = (JSON.parse(readFileSync(d, 'utf8')) as { jevQuestions?: Record<string, Question> }).jevQuestions?.[
      key
    ];
    if (!asked || asked.type !== 'choice') continue;
    const question: Question = key === 'profile_reply' ? { ...asked, criteria: PROFILE_REPLY_S8 } : asked;
    // The conversation as the turn read it: up to and with the message it answers.
    const upTo = session.transcript.findIndex(
      (_, i) => session.transcript.slice(0, i + 1).filter((e) => e.role === 'user').length === a.turn,
    );
    const state = renderTranscript(session.transcript.slice(0, upTo + 1));
    const k = sha256(`${JEV_MODEL()}\n${JSON.stringify(question)}\n\n${state}`);
    if (!cache[k]) {
      const call = await jev(state, { q: question });
      const ans = call.answers?.q;
      if (!ans) {
        console.error(`no answer: ${call.error}`);
        continue;
      }
      cache[k] = ans;
    }
    const reading = choiceByAction(cache[k], ACTIONS[key] as never, 'unclear' as never, 0.5, READ_BY[key] as never)
      .value as string;
    count(was, a.reading, a as never);
    count(now, reading, a as never);
    if (show && reading !== a.reading)
      console.log(
        `  ${s.id.slice(-4)} ${a.kind} ${a.reading} -> ${reading} (changes ${a.changes.toFixed(2)}) ${JSON.stringify((cache[k] as { probabilities?: unknown }).probabilities)}: ${a.answer.slice(0, 160)}`,
      );
  }
}
mkdirSync(dirname(CACHE), { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));
console.log(`answers read then: ${JSON.stringify(was)}`);
console.log(`read now:          ${JSON.stringify(now)}`);
