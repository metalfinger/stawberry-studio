// The assistant as the judge. A moment that lands is put in a queue folder with its declared-fact
// questions (Strawberry's own, from `facts`) and its continuity checks against the pictures it was
// drawn from; the assistant looks at the pictures and writes the answers beside it. The answers
// are recorded in Strawberry as the moment's facts, so the chat may approve it for what follows
// on that evidence, and the panel shows the counts. Nothing waits on it: a person's verdict
// releases a moment as well, and an unanswered request times out as "no judge answered".
//
//   request:  judge-queue/<media>.json
//     {kind: "facts", moment, image, questions: [{id, question, look_at}],
//      continuity: [{earlier, text}], answerFile}
//   answer:   judge-queue/<media>.answer.json
//     {answers: {<question id>: {answer: "yes" | "no" | "not_visible", where}},
//      continuity: {<index>: "yes" | "no" | {answer: "yes" | "no", where}}}
//
// A moment drawn more than once (DREAMCHAT_TAKES, takes.ts) is put in the same queue to have one of
// its takes kept, once all are in; the instructions for the answer are evals/picture-pick.md.
//
//   request:  judge-queue/pick-<session>-<moment>-v<version>.json
//     {kind: "pick", instructions, session, moment, version, said: [...], line,
//      before: {moment, line, image} | null, takes: [{id, image}], answerFile}
//   answer:   judge-queue/pick-<session>-<moment>-v<version>.answer.json
//     {best: <take id>, verdicts: {<take id>: "right" | "partly" | "wrong"}, reason}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check } from './sheets';
import { cli, STRAWBERRY_HOME } from './strawberry';
import { type PickAnswer, type PickInput, readPick } from './takes';

export const JUDGE_QUEUE = process.env.DREAMCHAT_JUDGE_QUEUE ?? join(import.meta.dir, 'judge-queue');
const WAIT_MS = Number(process.env.DREAMCHAT_JUDGE_WAIT_MS ?? 30 * 60_000);
const POLL_MS = 3000;
/** Presence questions: who and what the moment must show at all. */
const PRESENCE = ['cast', 'location', 'prop', 'subject'];

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

type Media = { media: { node_id: string; path: string }; review_context: string };
type Question = { id: string; question: string; asset_id: string | null; look_at: string };
type Answer = { answer: 'yes' | 'no' | 'not_visible'; where?: string };
export type JudgeOptions = {
  facts?: boolean;
  continuity?: { with: string | null; text: string }[];
  /** What the judge must know to answer fairly, such as whose eyes the camera is. */
  note?: string;
};
export type JudgedCheck = Check & { continuity?: Check };

async function waitFor(path: string, waitMs = WAIT_MS, pollMs = POLL_MS): Promise<unknown | null> {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (existsSync(path))
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        // written but not finished: read again on the next pass
      }
    await Bun.sleep(pollMs);
  }
  return null;
}

const imagePath = async (mediaId: string) =>
  join(STRAWBERRY_HOME, 'media', ((await call('media', { id: mediaId })) as Media).media.path);

/**
 * Ask the assistant about a moment's take: its declared facts and its continuity checks, in one
 * look. The facts are recorded in Strawberry. Sketches are not asked about: the moments are,
 * because what follows is drawn from them.
 */
export async function assistantJudge(mediaId: string, opts: JudgeOptions = {}): Promise<JudgedCheck | null> {
  if (!opts.facts) return null;
  mkdirSync(JUDGE_QUEUE, { recursive: true });
  const media = (await call('media', { id: mediaId })) as Media;
  const node = (await call('inspect', { id: media.media.node_id })) as { node: { name: string; kind: string } };
  const { questions } = (await call('facts', { id: media.media.node_id })) as { questions: Question[] };
  const continuity = opts.continuity ?? [];
  const request = {
    kind: 'facts',
    mediaId,
    moment: node.node.name,
    // What the picture is: a person's, place's or thing's sheet, or a moment.
    subject: node.node.kind,
    ...(opts.note ? { note: opts.note } : {}),
    image: join(STRAWBERRY_HOME, 'media', media.media.path),
    questions: questions.map(({ id, question, look_at }) => ({ id, question, look_at })),
    continuity: await Promise.all(
      continuity.map(async (c) => ({ earlier: c.with ? await imagePath(c.with) : null, text: c.text })),
    ),
    answerFile: join(JUDGE_QUEUE, `${mediaId}.answer.json`),
  };
  writeFileSync(join(JUDGE_QUEUE, `${mediaId}.json`), JSON.stringify(request, null, 2));
  const answer = (await waitFor(request.answerFile)) as {
    answers?: Record<string, Answer>;
    continuity?: Record<string, 'yes' | 'no' | { answer: 'yes' | 'no'; where?: string }>;
  } | null;
  if (!answer?.answers) return { questions: 0, passed: 0, failed: [], error: 'no judge answered' };

  const evidence = questions
    .filter((q) => answer.answers?.[q.id])
    .map((q) => {
      const a = answer.answers?.[q.id] as Answer;
      const unseeable = a.answer === 'not_visible';
      return {
        question: q.question,
        answer: unseeable ? 'not visible' : a.answer,
        probability: unseeable ? null : a.answer === 'yes' ? 0.9 : 0.1,
        asset_id: q.asset_id,
        question_id: q.id,
        region: (a.where || 'the whole frame').slice(0, 240),
        not_visible: unseeable,
      };
    });
  // Recorded against the take's current context, read again: it may have moved while waiting.
  let error: string | undefined;
  try {
    const now = (await call('media', { id: mediaId })) as Media;
    await call('evaluate', {
      id: mediaId,
      request: {
        expected_context: now.review_context,
        evaluator: 'assistant:dreamchat-judge',
        version: 'look-v1',
        kind: 'facts',
        evidence,
        discrepancies: [],
      },
    });
  } catch (e) {
    error = `recording the answers failed: ${String(e).slice(0, 160)}`;
  }
  const failed = evidence.filter((e) => e.answer === 'no');
  const asked = continuity
    .map((c, i) => {
      const a = answer.continuity?.[String(i)];
      return {
        text: c.text,
        a: typeof a === 'object' ? a?.answer : a,
        where: typeof a === 'object' ? a?.where : undefined,
      };
    })
    .filter((x) => x.a);
  const missed = asked.filter((x) => x.a === 'no');
  return {
    questions: evidence.filter((e) => !e.not_visible).length,
    passed: evidence.filter((e) => e.answer === 'yes').length,
    failed: failed.map((e) => e.question),
    failedIds: failed.map((e) => e.question_id),
    // What the judge saw, for each failure: a redraw is told this, not only the question.
    notes: failed.map((e) => e.region),
    unseen: failed.filter((e) => PRESENCE.includes(e.question_id.split(':')[0])).map((e) => e.question),
    ...(error ? { error } : {}),
    ...(asked.length
      ? {
          continuity: {
            questions: asked.length,
            passed: asked.length - missed.length,
            failed: missed.map((x) => x.text),
            // What the judge saw, for each failure, as with the facts.
            notes: missed.map((x) => (x.where ?? '').slice(0, 240)),
          },
        }
      : {}),
  };
}

/** What the assistant reads before it picks: the judging rules, and the answer's form. */
export const PICK_INSTRUCTIONS = join(import.meta.dir, 'evals', 'picture-pick.md');

/**
 * Ask the assistant to keep one of a moment's takes: what the dreamer said, the moment's line, the
 * picture before it and the takes, known by letter only, in one request. Null when no answer came
 * in time (the harness then keeps take 1); an answer that names no take shown is an error.
 */
export async function assistantPick(
  input: PickInput,
  opts: { queue?: string; waitMs?: number; pollMs?: number } = {},
): Promise<PickAnswer | null> {
  const queue = opts.queue ?? JUDGE_QUEUE;
  mkdirSync(queue, { recursive: true });
  const stem = `pick-${input.session}-${input.moment}-v${input.version}`;
  const media = (path: string) => join(STRAWBERRY_HOME, 'media', path);
  const request = {
    kind: 'pick',
    instructions: PICK_INSTRUCTIONS,
    session: input.session,
    moment: input.moment,
    version: input.version,
    said: input.said,
    line: input.line,
    before: input.before
      ? { moment: input.before.moment, line: input.before.line, image: media(input.before.mediaPath) }
      : null,
    takes: input.takes.map((t) => ({ id: t.id, image: media(t.mediaPath) })),
    answerFile: join(queue, `${stem}.answer.json`),
  };
  writeFileSync(join(queue, `${stem}.json`), JSON.stringify(request, null, 2));
  const answer = await waitFor(request.answerFile, opts.waitMs, opts.pollMs);
  return answer === null
    ? null
    : readPick(
        answer,
        input.takes.map((t) => t.id),
      );
}

export const judgeKind = (process.env.DREAMCHAT_JUDGE ?? 'assistant') as 'assistant' | 'pc' | 'off';
