// The answers to profiles and retellings in saved conversations, read again as the harness would read them
// now (DREAMCHAT_LISTEN=on): the question each turn asked (a profile's in S8's wording), asked of Jev again over the
// conversation as it stood, and read by `choiceByAction`; beside the listening test's own reading of each
// answer (evals/listening.ts: clear or not, and whether it changes or adds anything). No reply is written,
// so this needs no writer model, only Jev. A frozen conversation (evals/listening.ts --freeze) keeps no
// turn's questions: its question is built again as the harness builds it now (`bookkeeperQuestions`), for
// the profile the reply before it put to them, and the reading then is the one it kept.
//
//   bun --env-file=… run evals/probes/listen-readings.ts <scored run: runs/listening/<label>.json> <saved or frozen sessions> [--show]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dreamConfig } from '../../dream';
import {
  ACTIONS,
  type Answer,
  bookkeeperQuestions,
  choiceByAction,
  jevWithModel,
  PROFILE_REPLY_S8,
  type Question,
  READ_BY,
  renderTranscript,
  retellWithAdds,
} from '../../jev';
import type { RetellReply } from '../../lib';
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
const cfg = dreamConfig();
/** The profile a reply put to them, by the name its brief gives ("you" for the dreamer asked how to be drawn). */
const profileIn = (brief: string) =>
  brief.match(/describe how you picture (.+?) on their own/)?.[1] ??
  (/how they'd like to be drawn/.test(brief) ? 'you' : undefined);
for (const s of run.sessions) {
  const path = join(dir, `${s.id}.json`);
  if (!existsSync(path)) continue;
  const session = JSON.parse(readFileSync(path, 'utf8')) as Session & { listening_details?: unknown };
  for (const a of s.answers ?? []) {
    if (a.changes === null || a.changes === undefined || a.reading === 'goes_on') continue;
    const key = a.kind === 'profile' ? 'profile_reply' : 'retell_reply';
    // The conversation as the turn read it: up to and with the message it answers.
    const upTo = session.transcript.findIndex(
      (_, i) => session.transcript.slice(0, i + 1).filter((e) => e.role === 'user').length === a.turn,
    );
    const seen = session.transcript.slice(0, upTo + 1);
    const d = join(dir, s.id, `turn-${a.turn}.json`);
    let asked: Question | undefined;
    if (existsSync(d))
      asked = (JSON.parse(readFileSync(d, 'utf8')) as { jevQuestions?: Record<string, Question> }).jevQuestions?.[key];
    else if (session.listening_details) {
      const brief = session.turns.find((t) => t.turn === a.turn - 1)?.brief ?? '';
      const name = key === 'profile_reply' ? profileIn(brief) : undefined;
      if (key === 'profile_reply' && !name) continue;
      asked = bookkeeperQuestions(cfg, seen, undefined, a.kind === 'profile' ? 'build' : 'retell', [], name, [], true)[
        key
      ];
    }
    if (!asked || asked.type !== 'choice') continue;
    const question: Question = key === 'profile_reply' ? { ...asked, criteria: PROFILE_REPLY_S8 } : asked;
    const state = renderTranscript(seen);
    const ask = async (q: Question): Promise<Answer | null> => {
      const k = sha256(`${JEV_MODEL()}\n${JSON.stringify(q)}\n\n${state}`);
      if (!cache[k]) {
        const call = await jev(state, { q });
        const ans = call.answers?.q;
        if (!ans) {
          console.error(`no answer: ${call.error}`);
          return null;
        }
        cache[k] = ans;
      }
      return cache[k];
    };
    const answer = await ask(question);
    if (!answer) continue;
    let reading = choiceByAction(answer, ACTIONS[key] as never, 'unclear' as never, 0.5, READ_BY[key] as never)
      .value as string;
    // A retelling's answer is read with what it puts right or adds, asked beside it (jev.ts retell_adds).
    const addsQ =
      key === 'retell_reply'
        ? bookkeeperQuestions(cfg, seen, undefined, 'retell', [], undefined, [], true).retell_adds
        : undefined;
    const adds = addsQ ? await ask(addsQ) : null;
    const p = adds?.type === 'noul' ? adds.noul : null;
    if (key === 'retell_reply') reading = retellWithAdds(reading as RetellReply, p);
    count(was, a.reading, a as never);
    count(now, reading, a as never);
    if (show && reading !== a.reading)
      console.log(
        `  ${s.id.slice(-4)} ${a.kind} ${a.reading} -> ${reading} (changes ${a.changes.toFixed(2)}${p === null ? '' : `, adds ${p.toFixed(2)}`}) ${JSON.stringify((answer as { probabilities?: unknown }).probabilities)}: ${a.answer.slice(0, 160)}`,
      );
    if (show && p !== null && reading === a.reading)
      console.log(
        `    (${s.id.slice(-4)} retell ${reading}, adds ${p.toFixed(2)}, changes ${a.changes.toFixed(2)}): ${a.answer.slice(0, 140)}`,
      );
  }
}
mkdirSync(dirname(CACHE), { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));
console.log(`answers read then: ${JSON.stringify(was)}`);
console.log(`read now:          ${JSON.stringify(now)}`);
