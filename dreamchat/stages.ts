// The storyboard pipeline as a stage machine, written as data. Each stage does its own work with
// its own prompt; leaving it takes typed facts from Jev (a question, its answer, a bar), and code
// decides where to go from them. Jev never chooses the stage: in the Jev lab, letting it choose
// did worse than facts with confidence and code picking the move (25 Sep).
//
// A new check is a new fact here, worded for Jev, with its bar: not a new code path. The bars are
// provisional until each question has a labelled set of real cases to set it from.
import type { Question } from './jev';

/** The stages a dream goes through, in order, and what each does. */
export const STAGES = [
  { id: 'listen', does: 'Berry listens to the dream, one prompt per move' },
  { id: 'retell', does: 'Berry tells it back' },
  { id: 'confirm', does: 'the person says whether the retelling is right' },
  { id: 'breakdown', does: 'the producer turns it into people, places, things and moments' },
  { id: 'style', does: 'the person chooses how it is drawn' },
  { id: 'sheets', does: 'a sketch of each person, place and thing' },
  { id: 'plan', does: 'the floor plans, and the lasting changes the breakdown missed' },
  { id: 'previs', does: 'every camera placed and rendered as a grey previs, its view read off the render' },
  { id: 'prompt', does: 'the picture prompt, checked by the gate before anything is paid for' },
  { id: 'image', does: 'the picture is drawn' },
  { id: 'review', does: 'the picture is looked at, and approved or corrected' },
] as const;

export type StageId = (typeof STAGES)[number]['id'];

/**
 * One fact a transition needs from Jev. `pass: 'yes'` needs the answer at or above the bar to
 * pass; `pass: 'no'` fails at or above it (a problem found).
 */
export type Fact = {
  id: string;
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
