// The storyboard pipeline as a stage machine, written as data. Each stage does its own work with
// its own prompt; leaving it takes typed facts from Jev (a question, its answer, a bar), and code
// decides where to go from them. Jev never chooses the stage: in the Jev lab, letting it choose
// did worse than facts with confidence and code picking the move (25 Sep).
//
// A new check is a new fact here, worded for Jev, with its bar: not a new code path. The bars are
// provisional until each question has a labelled set of real cases to set it from.
import type { Question } from './jev';

/**
 * The stages a dream goes through, in order: what each does, how it is left today, and where the
 * Jev calls it makes are logged (`site` in jevlog.ts). Where a stage is left on Jev's facts, code
 * still makes the move: the conversation's rules in lib.ts, the gate's bars in gate.ts, and the
 * transitions written as data below.
 */
export const STAGES = [
  {
    id: 'listen',
    does: 'Berry listens to the dream, one prompt per move',
    leftBy:
      'Jev reads every turn for how much of each goal is told and whether they have finished; code retells once the story is told to the end, or at the listening limit',
    sites: ['turn'],
  },
  {
    id: 'retell',
    does: 'Berry tells it back',
    leftBy: 'Jev checks that what Berry wrote is a retelling before it is sent',
    sites: ['retell'],
  },
  {
    id: 'confirm',
    does: 'the person says whether the retelling is right',
    leftBy:
      'Jev reads their answer as confirmed, amended or unclear; code offers to draw it once it is confirmed, or after one more check',
    sites: ['turn'],
  },
  {
    id: 'breakdown',
    does: 'the producer turns it into people, places, things and moments',
    leftBy:
      'Jev grounds every field in what they said and every moment in the pictures before it; they are asked whether they would like to see it',
    sites: ['grounding', 'continuity', 'turn'],
  },
  {
    id: 'style',
    does: 'the person chooses how it is drawn',
    leftBy:
      'Jev reads which of the offered looks they chose; code starts once one is chosen, or the closest one if they stay unsure',
    sites: ['styles', 'turn'],
  },
  {
    id: 'sheets',
    does: 'a sketch of each person, place and thing',
    leftBy: 'Jev reads their reaction to each sketch; code moves on to the moments once every sketch is settled',
    sites: ['turn', 'correction'],
  },
  {
    id: 'plan',
    does: 'the floor plans, and the lasting changes the breakdown missed',
    leftBy:
      'code: every floor plan is checked (who faces whom names someone there, everything inside its room) before a camera is placed',
    sites: [],
  },
  {
    id: 'previs',
    does: 'every camera placed and rendered as a grey previs, its view read off the render',
    leftBy: 'storyboard complete?',
    sites: ['storyboard'],
  },
  {
    id: 'prompt',
    does: 'the picture prompt, checked by the gate before anything is paid for',
    leftBy:
      'the gate: Jev reads the prompt for anything it contradicts or says twice, and whether it and its pictures are clear; code holds it below the bars',
    sites: ['gate'],
  },
  {
    id: 'image',
    does: 'the picture is drawn',
    leftBy: 'code: the provider returns the picture',
    sites: [],
  },
  {
    id: 'review',
    does: 'the picture is looked at, and approved or corrected',
    leftBy:
      'they approve or correct it in the chat; Jev reads a correction for what else it touches, and code redraws those',
    sites: ['turn', 'correction'],
  },
] as const;

export type StageId = (typeof STAGES)[number]['id'];

/**
 * One fact a transition needs from Jev. `pass: 'yes'` needs the answer at or above the bar to
 * pass; `pass: 'no'` fails at or above it (a problem found).
 */
export type Fact = {
  id: string;
  /** What the fact asks, in a few words, for the Stages panel. */
  label: string;
  instructions: string;
  criteria: { true: string; false: string };
  pass: 'yes' | 'no';
  bar: number;
};

export type Transition = { from: StageId; to: StageId; name: string; facts: Fact[]; onFail: string };

/**
 * Previs to prompt: is this moment's storyboard shot complete? Jev compares the moment as the dream
 * tells it with the shot as its previs renders it (read off the render by code): the plan is the
 * producer's reading of the dream, so the plan's mistakes show as the two disagreeing. A car left
 * parked while they drive over the bridge, a tiny room ten metres across, a woman who walked off and
 * never came back: each was a plan that did not say what the dream says.
 */
export const STORYBOARD: Transition = {
  from: 'previs',
  to: 'prompt',
  name: 'storyboard complete?',
  onFail: 'the moment waits, with its grey frame and the reason shown, before anything is paid for',
  facts: [
    {
      id: 'sb_all_in',
      label: 'Everyone and everything in it?',
      instructions:
        '`shot` describes a planned storyboard picture of `moment`. Does the shot have in the picture everyone and everything that `moment.in_it` lists and `moment.action` is about?',
      criteria: {
        true: 'everyone and everything the moment is about is in the picture',
        false: 'someone or something the moment needs is outside the picture, hidden, or missing',
      },
      pass: 'yes',
      bar: 0.6,
    },
    {
      id: 'sb_contradicts',
      label: 'Contradicts the moment?',
      instructions:
        'Does anything in `shot` contradict `moment`: where someone or something is, what they are in or on, which way they face, or how big the place is beside what fills it?',
      criteria: {
        true: 'the shot disagrees with the moment about where someone or something is, what they are in or on, or how big',
        false: 'they agree; the shot only adds detail the moment leaves open',
      },
      pass: 'no',
      bar: 0.5,
    },
    {
      id: 'sb_camera',
      label: 'Camera where the moment needs it?',
      instructions:
        "Is the camera in `shot` where `moment` needs it: the dreamer's own eyes when `moment.seen` says the moment is seen through them, otherwise outside, and facing what `moment.looks_at` names?",
      criteria: {
        true: 'the camera is where the moment needs it and faces what it looks at',
        false: "the camera is on the wrong side, is or is not the dreamer's eyes wrongly, or faces something else",
      },
      pass: 'yes',
      bar: 0.6,
    },
    {
      id: 'sb_extra',
      label: 'Anything extra that changes it?',
      instructions:
        'Does `shot` put in the picture anyone or anything that `moment` does not have, in a way that changes what the picture says?',
      criteria: {
        true: 'someone or something extra in the picture changes what it shows',
        false: "nothing extra, or only the place's ordinary surroundings",
      },
      pass: 'no',
      bar: 0.5,
    },
  ],
};

/** The questions for one transition, their ids made unique to the moment. */
export function factQuestions(t: Transition, key: string): Record<string, Question> {
  return Object.fromEntries(
    t.facts.map((f) => [`${f.id}_${key}`, { type: 'noul', instructions: f.instructions, criteria: f.criteria }]),
  );
}

/** One fact as Jev answered it, against its bar. */
export type Reading = { question: string; answer: number; bar: number; ok: boolean };

/**
 * What code decides from Jev's answers: passed when every fact passes its bar. A missing answer
 * (Jev down, a question dropped) fails it, never passes it: nothing is paid for on a guess.
 */
export function decide(
  t: Transition,
  key: string,
  answers: Record<string, { type: string; noul?: number }> | null,
): { ok: boolean; readings: Reading[]; reasons: string[] } {
  const readings = t.facts.map((f) => {
    const a = answers?.[`${f.id}_${key}`];
    const answer = a && a.type === 'noul' && typeof a.noul === 'number' ? a.noul : Number.NaN;
    const ok = Number.isFinite(answer) && (f.pass === 'yes' ? answer >= f.bar : answer < f.bar);
    return { question: f.id, answer, bar: f.bar, ok };
  });
  const reasons = readings
    .filter((r) => !r.ok)
    .map((r) => {
      const f = t.facts.find((x) => x.id === r.question)!;
      return Number.isFinite(r.answer)
        ? `${f.pass === 'yes' ? f.criteria.false : f.criteria.true} (${r.answer.toFixed(2)})`
        : `${r.question}: no answer`;
    });
  return { ok: readings.every((r) => r.ok), readings, reasons };
}

/** Where one moment is: from its frame once it has one, otherwise from its planning. */
export function momentStage(
  id: string,
  prep: { previs?: Record<string, string>; storyboard?: Record<string, { ok: boolean }> } | undefined,
  frame: { status: string; held?: string[] } | undefined,
): StageId {
  if (frame?.status === 'drawing') return 'image';
  if (frame?.status === 'ready') return 'review';
  if (frame?.held?.length) return frame.held.every((h) => h.startsWith('storyboard:')) ? 'previs' : 'prompt';
  const checked = prep?.storyboard?.[id];
  if (checked) return checked.ok ? 'prompt' : 'previs';
  return prep?.previs?.[id] ? 'previs' : 'plan';
}

/**
 * Where a conversation is, as a stage: from its phase, and while its moments are drawn, the moment
 * furthest behind. Null once it has closed without pictures (kept as told, or they left).
 */
export function stageOf(s: {
  phase: string;
  build?: { frames?: { id: string; kind: string; status: string; held?: string[] }[] } | null;
  prep?: { previs?: Record<string, string>; storyboard?: Record<string, { ok: boolean }> };
}): StageId | null {
  const at: Record<string, StageId> = {
    listen: 'listen',
    retell: 'confirm',
    offer: 'breakdown',
    style: 'style',
    build: 'sheets',
    review: 'sheets',
    ready: 'breakdown',
    done: 'review',
  };
  if (s.phase !== 'frames') return at[s.phase] ?? null;
  const order = STAGES.map((x) => x.id as StageId);
  const behind = (s.build?.frames ?? [])
    .filter((f) => f.kind === 'cut' && f.status !== 'failed')
    .map((f) => order.indexOf(momentStage(f.id, s.prep, f)));
  return behind.length ? order[Math.min(...behind)] : 'plan';
}
