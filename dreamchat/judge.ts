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
//      continuity: {<index>: "yes" | "no"}}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check } from './sheets';
import { cli, STRAWBERRY_HOME } from './strawberry';

export const JUDGE_QUEUE = process.env.DREAMCHAT_JUDGE_QUEUE ?? join(import.meta.dir, 'judge-queue');
const WAIT_MS = Number(process.env.DREAMCHAT_JUDGE_WAIT_MS ?? 30 * 60_000);
const POLL_MS = 3000;
/** Presence questions: who and what the moment must show at all. */
const PRESENCE = ['cast', 'location', 'prop', 'subject'];

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

type Media = { media: { node_id: string; path: string }; review_context: string };
type Question = { id: string; question: string; asset_id: string | null; look_at: string };
type Answer = { answer: 'yes' | 'no' | 'not_visible'; where?: string };
export type JudgeOptions = { facts?: boolean; continuity?: { with: string | null; text: string }[] };
export type JudgedCheck = Check & { continuity?: Check };

async function waitFor(path: string): Promise<unknown | null> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    if (existsSync(path))
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        // written but not finished: read again on the next pass
      }
    await Bun.sleep(POLL_MS);
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
    continuity?: Record<string, 'yes' | 'no'>;
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
  const asked = continuity.map((c, i) => ({ text: c.text, a: answer.continuity?.[String(i)] })).filter((x) => x.a);
  const missed = asked.filter((x) => x.a === 'no').map((x) => x.text);
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
      ? { continuity: { questions: asked.length, passed: asked.length - missed.length, failed: missed } }
      : {}),
  };
}

export const judgeKind = (process.env.DREAMCHAT_JUDGE ?? 'assistant') as 'assistant' | 'pc' | 'off';
