// Grounding: Jev checks every detail the producer marked as said against the person's own
// messages. It is the lab's evidence rule applied to production data. A detail stays "said"
// only when Jev agrees the person said it AND can point at the message; otherwise it becomes a
// guess, and the person is asked to confirm it before anything is drawn from it.
import type { Exchange, JevFn, Question } from './jev';
import { renderTranscript } from './jev';
import { type Breakdown, details, moments } from './producer';

const SAID_BAR = 0.6;

export type GroundingNote = { path: string; label: string; value: string; p: number; evidence: number | null };

function evidenceOptions(transcript: Exchange[]): Record<string, string> {
  const options: Record<string, string> = { none: 'no message of theirs says this' };
  transcript.forEach((e, idx) => {
    if (e.role === 'user') options[`m${idx}`] = e.content.slice(0, 240);
  });
  return options;
}

export function groundingQuestions(b: Breakdown, transcript: Exchange[]): Record<string, Question> {
  const options = evidenceOptions(transcript);
  const q: Record<string, Question> = {};
  const add = (key: string, claim: string) => {
    q[`said_${key}`] = {
      type: 'noul',
      instructions: `The person told a dream. Did they themselves say this, or plainly mean it: ${claim}`,
      criteria: {
        true: 'their own words say it, or plainly mean it',
        false: 'it is an inference, an addition, or goes beyond what they said',
      },
    };
    q[`where_${key}`] = {
      type: 'choice',
      instructions: `Which of the person's messages says: ${claim}`,
      criteria: options,
    };
  };
  for (const { path, label, detail } of details(b))
    if (detail.said && detail.value) add(path, `${label} "${detail.value}"?`);
  // A moment is judged on what is in it, not on how near it is shown: the same told moment,
  // framed wide and then close, is still what they said.
  for (const m of moments(b)) if (m.said) add(m.id, `this was in the dream, however near or far it is shown — "${m.action}"?`);
  return q;
}

/**
 * Apply Jev's answers: a "said" that Jev can't back becomes a guess. Returns the details that
 * were downgraded. When the judge is unavailable, nothing is confirmed as said.
 */
export async function ground(
  b: Breakdown,
  transcript: Exchange[],
  jev: JevFn,
): Promise<{ breakdown: Breakdown; downgraded: GroundingNote[]; ms: number; error: string | null }> {
  const out: Breakdown = structuredClone(b);
  const questions = groundingQuestions(out, transcript);
  if (!Object.keys(questions).length) return { breakdown: out, downgraded: [], ms: 0, error: null };
  const call = await jev(renderTranscript(transcript), questions);
  const downgraded: GroundingNote[] = [];
  const judge = (key: string): { ok: boolean; p: number; evidence: number | null } => {
    const said = call.answers?.[`said_${key}`];
    const where = call.answers?.[`where_${key}`];
    const p = said?.type === 'noul' ? said.noul : 0;
    const pick = where?.type === 'choice' ? where.choice : 'none';
    const evidence = pick.startsWith('m') ? Number(pick.slice(1)) : null;
    return { ok: p >= SAID_BAR && evidence !== null, p, evidence };
  };

  for (const { path, label, detail } of details(out)) {
    if (!detail.said || !detail.value) continue;
    const { ok, p, evidence } = judge(path);
    if (ok) detail.evidence = evidence;
    else {
      detail.said = false;
      detail.evidence = null;
      downgraded.push({ path, label, value: detail.value, p: Number(p.toFixed(2)), evidence });
    }
  }
  for (const m of moments(out)) {
    if (!m.said) continue;
    const { ok, p, evidence } = judge(m.id);
    if (!ok) {
      m.said = false;
      downgraded.push({ path: m.id, label: 'moment', value: m.action, p: Number(p.toFixed(2)), evidence });
    }
  }
  return { breakdown: out, downgraded, ms: call.ms, error: call.error };
}
