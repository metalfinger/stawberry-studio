// Which checks earn the right to act (S7): every check the harness runs before a picture is drawn, and
// every question of the library (checks.ts), measured on the pictures the owner judged
// (evals/checks-set.json, built by evals/build-checks-set.ts). A check may hold, reword or plan again
// only if it predicts the owner's verdict (docs/rules.md G1); this says which do.
//
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/jev-checks.ts --label <name> [--no-ask] [--logs <dir> …]
//   bun run evals/jev-checks.ts --help
//
// What each check reads is what it read, or would have read, before the picture was drawn: the gate's
// questions and the library's prompt questions the prompt exactly as sent; "storyboard complete?" the shot
// as it was checked (its readings as logged then, and asked again), only for the pictures drawn from that
// shot (its view is in the prompt word for word); planFacts the camera's facts on the floor plan the picture
// was drawn from (as kept then, and asked again of that plan); the continuity plan's warnings from today's
// plan. A picture is "not right" when the owner called it partly right or wrong. For each check: how many
// pictures, and moments, its tags route it to; how many it flags at its bar; of those how many the owner did
// not call right (precision); of the pictures not right how many it flags (recall), for wrong alone too, and
// on its own faults (the owner's notes S0 classified to its rule); and how well its reading orders the
// pictures whatever the bar (AUC).
//
// The bar to act (G1, "at least 0.7 on at least 60 labels", as applied here; BAR, verdictOf): on the labelled
// pictures it was not tuned on, at least 60 of them, flagging pictures of at least 5 distinct moments, each by
// a reading more than NOISE past its bar (G4), with a precision of at least 0.7 whose 90% lower bound,
// resampling moments (a moment's story picture and its paired pictures together), is above the share of
// those pictures not right. A check already in the harness keeps its bar, set before these verdicts existed:
// every picture counts. A library question is judged two ways, leaving out the moments its rule was written
// from (docs/rules.md): at its first bar, never tuned, on every picture it is asked of; at a bar chosen on the
// tune pictures (the five dreams the picture judge was written from), on the five held out (53 pictures, so
// under G1's 60 until more are judged). And it may not act on these pictures at all: it was written after
// reading the owner's notes on them; pictures judged later test it. Otherwise a check only logs.
//
// Jev is asked by one model by name (JEV_EVAL_MODEL, jev-1.13.0), each state once with all its questions
// (as the harness asks them); every answer is kept in evals/checks-answers.json by the hash of the model,
// the question as sent and the state, so a run again asks nothing and costs nothing. --no-ask asks nothing
// new. --logs joins the readings logged per picture (jev.jsonl `gate` transitions with `ref`, S2) to the
// owner's verdicts: by the prompt's hash where the prompt is the one judged, else by moment only.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type CutFacts, FIRST_BAR, isFinding, LIBRARY, type LibraryQuestion, worstOf } from '../checks';
import {
  DIFFUSE_UP_TO,
  gateQuestions,
  LOCAL_DROP,
  MAX_CONTRADICTS_MOMENT,
  MAX_TWICE,
  MIN_CLEAR,
  MIN_REFS_CLEAR,
  sha,
} from '../gate';
import type { JevFn, Question } from '../jev';
import { applyPlanFacts, planQuestions, SIDE } from '../planfacts';
import type { Breakdown } from '../producer';
import type { Session } from '../session';
import { factQuestions, STORYBOARD } from '../stages';
import type { ChecksSet, SetMoment, SetPicture } from './build-checks-set';
import { DIR, loadDream } from './saved';

export const EVAL_MODEL = () => process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
const SET = join(import.meta.dir, 'checks-set.json');
const ANSWERS = join(import.meta.dir, 'checks-answers.json');
const RUNS = join(DIR, 'runs', 'jev-checks');

// ── the answers, kept ───────────────────────────────────────────────────────────────────────────

type Kept = number | { choice: string; confidence: number };
export type AnswerFile = { about: string; model: string; answers: Record<string, Kept> };

/** The key of one answer: the model, the question exactly as sent, and the state it read. */
export const answerKey = (q: Question, state: string, model = EVAL_MODEL()) =>
  createHash('sha256')
    .update(`${model}\n${JSON.stringify(q)}\n\n${state}`)
    .digest('hex')
    .slice(0, 24);

/** One state and the questions to ask of it, keyed as they are asked in one call. */
type Ask = { state: string; questions: Record<string, Question> };

/**
 * Asks every question not already kept, one call per state with all its missing questions (Jev answers
 * each question on its own; asked together they cost one call, as the harness asks them), a few states at
 * a time. Returns the calls made and what failed.
 */
async function askAll(asks: Ask[], jev: JevFn, kept: AnswerFile, concurrency = 6) {
  const byState = new Map<string, Record<string, Question>>();
  for (const a of asks)
    for (const [k, q] of Object.entries(a.questions))
      if (kept.answers[answerKey(q, a.state)] === undefined) byState.set(a.state, { ...byState.get(a.state), [k]: q });
  const todo = [...byState.entries()];
  const errors: string[] = [];
  let calls = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const [state, questions] = todo[next++];
      calls++;
      const call = await jev(state, questions);
      if (call.model && call.model !== EVAL_MODEL()) errors.push(`answered by ${call.model}, not ${EVAL_MODEL()}`);
      for (const [k, q] of Object.entries(questions)) {
        const a = call.answers?.[k];
        if (a?.type === 'noul') kept.answers[answerKey(q, state)] = a.noul;
        else if (a?.type === 'choice')
          kept.answers[answerKey(q, state)] = { choice: a.choice, confidence: a.confidence };
        else errors.push(`${k}: ${call.error?.slice(0, 120) ?? 'no answer'}`);
      }
      if (calls % 25 === 0) console.log(`  asked ${calls} of ${todo.length} states`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { calls, errors: [...new Set(errors)] };
}

const noulOf = (kept: AnswerFile, q: Question, state: string): number | undefined => {
  const a = kept.answers[answerKey(q, state)];
  return typeof a === 'number' ? a : undefined;
};

// ── what each check reads ───────────────────────────────────────────────────────────────────────

/** The prompt questions of the gate, as readPrompt asks them of a moment. */
const gateOf = (prompt: string) => gateQuestions(/\bImage 1(?::| is\b)/.test(prompt));

/** The storyboard's facts, keyed as one moment's (the key is never sent to Jev). */
const SB = factQuestions(STORYBOARD, 'm');
const sbQuestion = (id: string) => SB[`${id}_m`];

/** A library question's questions for a moment, or none where its tags do not route it or it has nothing to ask. */
const libraryAsk = (q: LibraryQuestion, f: CutFacts | null) => (f && q.routes(f.tags) ? q.ask(f) : {});

/** The prompt with one line left out, for each line that is not empty: what the carrier search reads. */
const withoutEach = (prompt: string) => {
  const lines = prompt.split('\n');
  return lines.flatMap((line, i) => (line.trim() ? [lines.filter((_, j) => j !== i).join('\n')] : []));
};

// ── scoring ─────────────────────────────────────────────────────────────────────────────────────

const notRight = (p: SetPicture) => p.verdict !== 'right';

/**
 * A picture's moment. A moment's story picture and its three paired pictures were drawn from near-identical
 * prompts and read alike by every check: they are one moment, not four labels.
 */
export const momentKey = (p: Pick<SetPicture, 'session' | 'moment'>) => `${p.session}/${p.moment}`;

export type Score = {
  /** Pictures, and the distinct moments they are of. */
  n: number;
  moments: number;
  pos: number;
  flagged: number;
  /** The distinct moments it flags a picture of. */
  flaggedMoments: number;
  /** Of those, the moments it flags with a reading past the noise of its bar (NOISE; G4). */
  robustMoments: number;
  hits: number;
  precision: number | null;
  recall: number | null;
  base: number | null;
  /** The 90% lower bound of the precision, resampling moments (momentLow). */
  low: number | null;
  wrong: { pos: number; hits: number; precision: number | null; recall: number | null };
};

/** Wilson's lower bound on a share, at 90% (z = 1.645): for independent labels, such as new moments. */
export function wilsonLow(hits: number, n: number, z = 1.645): number | null {
  if (!n) return null;
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return (c - m) / d;
}

/** A small seeded random number generator (mulberry32): a bootstrap gives the same bound every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The 90% lower bound of a precision, bootstrapping moments: the pictures of a moment are drawn together,
 * never as independent labels. The 5th percentile, over 2000 resamples of the moments, of the flagged
 * pictures the owner did not call right; resamples that flag nothing are left out. Null: nothing flagged.
 */
export function momentLow(items: { p: SetPicture; flag: boolean }[], draws = 2000, seed = 7): number | null {
  const byMoment = new Map<string, { flagged: number; hits: number }>();
  for (const x of items) {
    const m = byMoment.get(momentKey(x.p)) ?? { flagged: 0, hits: 0 };
    if (x.flag) {
      m.flagged++;
      if (notRight(x.p)) m.hits++;
    }
    byMoment.set(momentKey(x.p), m);
  }
  const ms = [...byMoment.values()];
  if (!ms.some((m) => m.flagged)) return null;
  const rand = seeded(seed);
  const ps: number[] = [];
  for (let d = 0; d < draws; d++) {
    let f = 0;
    let h = 0;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[Math.floor(rand() * ms.length)];
      f += m.flagged;
      h += m.hits;
    }
    if (f) ps.push(h / f);
  }
  ps.sort((a, b) => a - b);
  return ps[Math.floor(0.05 * (ps.length - 1))];
}

/** The area under the curve of a reading against not right: 0.5 is chance, 1 orders every picture right. */
export function aucOf(values: { p: SetPicture; v: number | undefined }[], problem: 'yes' | 'no'): number | null {
  const worse = (v: number) => (problem === 'yes' ? v : -v);
  const bad = values.filter((x) => x.v !== undefined && notRight(x.p)).map((x) => worse(x.v as number));
  const good = values.filter((x) => x.v !== undefined && !notRight(x.p)).map((x) => worse(x.v as number));
  if (!bad.length || !good.length) return null;
  let wins = 0;
  for (const b of bad) for (const g of good) wins += b > g ? 1 : b === g ? 0.5 : 0;
  return wins / (bad.length * good.length);
}

/**
 * How far from its bar a reading must be to be more than noise: the same question asked again moves 0.06, up
 * to 0.3, and differences under about 0.11 are noise (docs/rules.md G4); the prompt cases mark answers within
 * 0.1 of their bar.
 */
export const NOISE = 0.1;

/** A picture and whether a check flags it; `close`: its reading is within NOISE of the bar. */
export type Flagged = { p: SetPicture; flag: boolean; close?: boolean };

export function score(items: Flagged[]): Score {
  const flagged = items.filter((x) => x.flag);
  const hits = flagged.filter((x) => notRight(x.p)).length;
  const pos = items.filter((x) => notRight(x.p)).length;
  const wpos = items.filter((x) => x.p.verdict === 'wrong').length;
  const whits = flagged.filter((x) => x.p.verdict === 'wrong').length;
  return {
    n: items.length,
    moments: new Set(items.map((x) => momentKey(x.p))).size,
    pos,
    flagged: flagged.length,
    flaggedMoments: new Set(flagged.map((x) => momentKey(x.p))).size,
    robustMoments: new Set(flagged.filter((x) => !x.close).map((x) => momentKey(x.p))).size,
    hits,
    precision: flagged.length ? hits / flagged.length : null,
    recall: pos ? hits / pos : null,
    base: items.length ? pos / items.length : null,
    low: momentLow(items),
    wrong: {
      pos: wpos,
      hits: whits,
      precision: flagged.length ? whits / flagged.length : null,
      recall: wpos ? whits / wpos : null,
    },
  };
}

/**
 * The bar to act (docs/rules.md G1, "at least 0.7 on at least 60 labels", as applied here): on the labelled
 * pictures it was not tuned on, at least 60 of them, flagging pictures of at least 5 distinct moments, each by
 * a reading more than NOISE past its bar (G4), with a precision of at least 0.7 whose 90% lower bound,
 * resampling moments, is above the share of those pictures not right (a flag must say more than being asked
 * does).
 */
export const BAR = { labels: 60, moments: 5, precision: 0.7 } as const;

export function verdictOf(s: Score): { acts: boolean; why: string } {
  if (s.n < BAR.labels)
    return { acts: false, why: `log only: ${s.n} labelled pictures it was not tuned on, fewer than ${BAR.labels}` };
  if (s.flaggedMoments < BAR.moments)
    return { acts: false, why: `log only: flags ${s.flaggedMoments} moments, fewer than ${BAR.moments}` };
  if (s.robustMoments < BAR.moments)
    return {
      acts: false,
      why: `log only: flags ${s.robustMoments} moments with a reading more than ${NOISE} past its bar, fewer than ${BAR.moments} (G4: nearer is noise)`,
    };
  if ((s.precision ?? 0) < BAR.precision)
    return { acts: false, why: `log only: precision ${(s.precision ?? 0).toFixed(2)}, under ${BAR.precision}` };
  if ((s.low ?? 0) <= (s.base ?? 0))
    return {
      acts: false,
      why: `log only: its lower bound ${(s.low ?? 0).toFixed(2)} is not above the ${(s.base ?? 0).toFixed(2)} being asked alone gives`,
    };
  return { acts: true, why: 'may act' };
}

/**
 * A library question's bar, chosen on the tune pictures only: the reading that flags with the best
 * precision, pictures of at least three moments and at most half of the pictures; ties to more flagged, then
 * nearer the first bar. None does: the first bar, and why (it flags too few moments at every bar, or too
 * many pictures at every bar that flags enough).
 */
export function chooseBar(
  q: Pick<LibraryQuestion, 'problem'>,
  tune: { p: SetPicture; reading: number }[],
): { bar: number; chosen: boolean; why?: 'too few' | 'too many' } {
  let best: { bar: number; precision: number; flagged: number } | null = null;
  let enough = false;
  for (let t = 1; t <= 9; t++) {
    const bar = t / 10;
    const s = score(tune.map((x) => ({ p: x.p, flag: isFinding({ problem: q.problem, bar }, x.reading) })));
    if (s.flaggedMoments < 3 || s.precision === null) continue;
    enough = true;
    // A check that would hold most pictures says nothing a hold could use: at most half of them.
    if (s.flagged > tune.length / 2) continue;
    const better =
      !best ||
      s.precision > best.precision + 1e-9 ||
      (Math.abs(s.precision - best.precision) < 1e-9 &&
        (s.flagged > best.flagged ||
          (s.flagged === best.flagged && Math.abs(bar - FIRST_BAR) < Math.abs(best.bar - FIRST_BAR))));
    if (better) best = { bar, precision: s.precision, flagged: s.flagged };
  }
  return best
    ? { bar: best.bar, chosen: true }
    : { bar: FIRST_BAR, chosen: false, why: enough ? 'too many' : 'too few' };
}

/**
 * How many more judged pictures a check would need to meet the bar, were its precision, and how often it
 * flags, to hold on new moments of one picture each: pictures of moments it is asked of, and of any moment
 * (`share`: of all judged pictures, the share it is asked of). Where it cannot say, why: its precision is
 * under the bar (no count of labels makes it act), or it flags too few moments for its precision to mean
 * anything yet.
 */
export function needed(s: Score, share: number): { routed: number; any: number } | { none: string } {
  if (s.precision === null || !s.flagged) return { none: 'flags nothing' };
  if (s.precision < BAR.precision) return { none: 'precision under the bar' };
  if (s.flaggedMoments < 3) return { none: `${s.flaggedMoments} moments flagged: too few to say` };
  if (s.robustMoments < 3)
    return { none: `its flags sit within ${NOISE} of its bar (G4): more labels would not move them` };
  const rate = s.flagged / s.n;
  const base = s.base ?? 0;
  for (let n = s.n; n <= s.n + 5000; n++) {
    const f = Math.round(rate * n);
    const moments = s.robustMoments + Math.max(0, f - s.flagged);
    const low = wilsonLow(Math.round(s.precision * f), f) ?? 0;
    if (n >= BAR.labels && moments >= BAR.moments && low > base)
      return { routed: n - s.n, any: Math.ceil((n - s.n) / (share || 1)) };
  }
  return { none: 'more than 5000 pictures' };
}

/** One measured check: where it runs, what it reads, how it is routed, and each picture's flag. */
export type Row = {
  id: string;
  label: string;
  rule: string;
  reads: 'prompt' | 'shot' | 'plan' | 'picture';
  routedBy: string;
  /** In the harness today, with its bar set before these verdicts. */
  existing: boolean;
  /** Jev calls to ask it, in words. */
  calls: string;
  bar: string;
  classes: string[];
  routed: number;
  answered: number;
  all: Score;
  tune: Score;
  held_out: Score;
  /** What it is judged on: the pictures it was not tuned on (every picture for a bar set before these verdicts). */
  scoredOn: string;
  scored: Score;
  verdict: { acts: boolean; why: string };
  /** More judged pictures it would need to meet the bar, if its precision held, or why it cannot say. */
  needs: { routed: number; any: number } | { none: string };
  /** Of the routed pictures with one of its own faults, how many it flags. */
  own: { faults: number; flagged: number };
  note?: string;
  /**
   * How well its reading orders the pictures, whatever the bar: the chance that a picture the owner did not
   * call right reads worse than one called right (0.5 is a coin; ties count half). None for a yes-or-no check.
   */
  auc?: number | null;
  /** A library question at its first bar, never tuned, on every picture it is asked of but its rule's sources. */
  untuned?: { bar: number; scored: Score; verdict: { acts: boolean; why: string } };
  /** The bar it may act at, where it may (a library question's is the path that met the bar). */
  earnedBar?: number | null;
  /** Where it would meet the bar on this set but may not act for another reason: the path, and why not. */
  wouldAct?: string;
  /** Each routed picture's flag, by id (null: not answered). */
  flags: Record<string, boolean | null>;
};

function rowWith(
  x: Omit<
    Row,
    'all' | 'tune' | 'held_out' | 'verdict' | 'own' | 'routed' | 'answered' | 'scored' | 'needs' | 'flags' | 'scoredOn'
  > & { scoredOn?: string },
  items: { p: SetPicture; flag: boolean | undefined; close?: boolean }[],
  scoredOn: (p: SetPicture) => boolean = () => true,
  share = 1,
): Row {
  const answered = items.filter((i): i is Flagged => i.flag !== undefined);
  const all = score(answered);
  const tune = score(answered.filter((i) => i.p.split === 'tune'));
  const held_out = score(answered.filter((i) => i.p.split === 'held_out'));
  const scored = score(answered.filter((i) => scoredOn(i.p)));
  const own = answered.filter((i) => i.p.faults.some((f) => x.classes.includes(f.class)));
  return {
    ...x,
    scoredOn: x.scoredOn ?? 'every picture it is asked of (its bar was set before these verdicts)',
    routed: items.length,
    answered: answered.length,
    all,
    tune,
    held_out,
    scored,
    verdict: verdictOf(scored),
    needs: needed(scored, share),
    own: { faults: own.length, flagged: own.filter((i) => i.flag).length },
    flags: Object.fromEntries(items.map((i) => [i.p.id, i.flag ?? null])),
  };
}

// ── measuring ───────────────────────────────────────────────────────────────────────────────────

/**
 * Every check measured on the labelled set, from the kept answers; with `ask`, Jev is asked first what is not
 * kept, and its answers are kept. `logs`: folders whose logged readings are joined to the verdicts. Writes
 * nothing but the kept answers.
 */
export async function measure(opts: { ask?: boolean; logs?: string[]; say?: (line: string) => void } = {}) {
  const { jevAvailable, jevWithModel } = await import('../jev');
  const say = opts.say ?? (() => {});
  const noAsk = !opts.ask;

  const set = JSON.parse(readFileSync(SET, 'utf8')) as ChecksSet;
  const kept: AnswerFile = existsSync(ANSWERS)
    ? JSON.parse(readFileSync(ANSWERS, 'utf8'))
    : {
        about:
          "Jev's answers to every question evals/jev-checks.ts asks, by the hash of the model, the question as sent and the state it read (answerKey): a run again asks only what is not here. A number is a yes-or-no answer's probability of yes; a choice keeps its pick and confidence.",
        model: EVAL_MODEL(),
        answers: {},
      };

  // The prompts as sent: a story picture's from its frozen dream, checked by its hash.
  const dreams = new Map<string, Session>();
  const dreamOf = (id: string) => {
    if (!dreams.has(id)) dreams.set(id, loadDream(id, false).session as Session);
    return dreams.get(id)!;
  };
  const prompts = new Map<string, string>();
  for (const p of set.pictures) {
    let prompt = p.prompt;
    if (prompt === null) {
      const f = (dreamOf(p.session).build?.frames ?? []).find((x) => x.id === p.moment) as
        { sent?: { prompt: string } } | undefined;
      prompt = f?.sent?.prompt ?? null;
    }
    if (!prompt || sha(prompt) !== p.prompt_sha) throw new Error(`${p.id}: its prompt is not the one judged`);
    prompts.set(p.id, prompt);
  }
  const momentOf = (p: SetPicture): SetMoment => set.moments[`${p.session}/${p.moment}`];
  const shotOf = (p: SetPicture) => (p.same_shot ? momentOf(p).shot : null);

  // Everything to ask: the gate's and the routed library questions of each prompt in one call, as the
  // harness would; the storyboard's facts and the routed shot questions of each shot in one call; each
  // place's plan facts; and, for a prompt whose contradiction or twice reading is in the band a line must
  // carry, each line left out.
  const asks: Ask[] = [];
  for (const p of set.pictures) {
    const prompt = prompts.get(p.id)!;
    const f = momentOf(p).facts;
    asks.push({
      state: prompt,
      questions: {
        ...gateOf(prompt),
        ...Object.assign({}, ...LIBRARY.filter((q) => q.reads === 'prompt').map((q) => libraryAsk(q, f))),
      },
    });
    const shot = shotOf(p);
    if (shot)
      asks.push({
        state: shot.state,
        questions: {
          ...SB,
          ...Object.assign({}, ...LIBRARY.filter((q) => q.reads === 'shot').map((q) => libraryAsk(q, f))),
        },
      });
  }
  // Each place's plan facts, of the plan the pictures were drawn from.
  const planAsks: {
    session: string;
    scene: string;
    placeId: string;
    moments: string[];
    state: string;
    questions: Record<string, Question>;
  }[] = [];
  for (const session of new Set(set.pictures.map((p) => p.session))) {
    const b = dreamOf(session).draft?.breakdown as Breakdown | undefined;
    if (!b) continue;
    for (const sc of b.scenes) {
      if (!sc.blocking) continue;
      const places = sc.blocking.places ?? {};
      const at = (pl: string | undefined) => (pl && places[pl] ? pl : sc.place);
      const plans: [string, NonNullable<typeof sc.blocking>][] = [[sc.place, sc.blocking], ...Object.entries(places)];
      for (const [placeId, plan] of plans) {
        const ms = sc.moments.filter((m) => at(m.place) === placeId);
        const { state, questions } = planQuestions(b, plan, placeId, ms);
        planAsks.push({ session, scene: sc.id, placeId, moments: ms.map((m) => m.id), state, questions });
      }
    }
  }
  asks.push(...planAsks.map((x) => ({ state: x.state, questions: x.questions })));

  const ask = !noAsk && jevAvailable();
  const jev = jevWithModel(EVAL_MODEL());
  let calls = 0;
  const save = () => writeFileSync(ANSWERS, `${JSON.stringify(kept, null, 0)}\n`);
  if (ask) {
    const r = await askAll(asks, jev, kept);
    calls += r.calls;
    save();
    say(`Jev (${EVAL_MODEL()}): ${r.calls} calls, the rest from evals/checks-answers.json`);
    for (const e of r.errors.slice(0, 10)) say(`Jev: ${e}`);
  } else say(noAsk ? '--no-ask: nothing new asked' : 'no JEV_API_KEY: nothing new asked (run with --env-file)');

  // The carrier search, where the gate acting would do it: a contradiction reading over its bar but up to
  // DIFFUSE_UP_TO, or a twice reading over its bar but up to it, held only when one line carries it.
  const band = (p: string, id: 'contradicts' | 'twice') => {
    const a = noulOf(kept, gateOf(p)[id], p);
    const over = id === 'contradicts' ? MAX_CONTRADICTS_MOMENT : MAX_TWICE;
    return a !== undefined && a > over && a <= DIFFUSE_UP_TO ? a : undefined;
  };
  const carrierAsks: Ask[] = [];
  for (const p of set.pictures) {
    const prompt = prompts.get(p.id)!;
    for (const id of ['contradicts', 'twice'] as const)
      if (band(prompt, id) !== undefined)
        for (const state of withoutEach(prompt))
          carrierAsks.push({ state, questions: { [id]: gateQuestions(false)[id] } });
  }
  if (ask && carrierAsks.length) {
    const r = await askAll(carrierAsks, jev, kept, 8);
    calls += r.calls;
    save();
    say(`Jev: ${r.calls} calls for the lines the gate's readings may rest on`);
    for (const e of r.errors.slice(0, 10)) say(`Jev: ${e}`);
  }
  const carried = (prompt: string, id: 'contradicts' | 'twice'): boolean | undefined => {
    const whole = band(prompt, id);
    if (whole === undefined) return undefined;
    const drops = withoutEach(prompt).map((state) => noulOf(kept, gateQuestions(false)[id], state));
    if (drops.some((d) => d === undefined)) return undefined;
    return Math.max(...drops.map((d) => whole - (d as number))) >= LOCAL_DROP;
  };

  // ── every check, every picture ──
  const rows: Row[] = [];
  const pics = set.pictures;
  const rowOf = (
    x: Parameters<typeof rowWith>[0],
    items: Parameters<typeof rowWith>[1],
    scoredOn?: (p: SetPicture) => boolean,
  ) => rowWith(x, items, scoredOn, items.length / pics.length);
  const gateRead = (p: SetPicture, id: string) => {
    const prompt = prompts.get(p.id)!;
    const q = gateOf(prompt)[id];
    return q ? noulOf(kept, q, prompt) : undefined;
  };
  /** Each gate question's own bar: a reading within NOISE of it is noise. */
  const GATE_BAR: Record<string, number> = {
    contradicts: MAX_CONTRADICTS_MOMENT,
    twice: MAX_TWICE,
    clear: MIN_CLEAR,
    refs_clear: MIN_REFS_CLEAR,
  };
  const gateRow = (
    id: string,
    label: string,
    bar: string,
    flagOf: (a: number, p: SetPicture) => boolean | undefined,
    extra: Partial<Row> = {},
  ) => {
    const q = id.split('.')[1].replace(/:acting$/, '');
    const routedPics = pics.filter((p) => q !== 'refs_clear' || /\bImage 1(?::| is\b)/.test(prompts.get(p.id)!));
    const values = routedPics.map((p) => ({ p, v: gateRead(p, q) }));
    return rowOf(
      {
        id,
        label,
        rule: 'G1',
        reads: 'prompt',
        routedBy: q === 'refs_clear' ? 'images attached (code)' : 'every moment',
        existing: true,
        calls: "1 a picture drawn, shared by the gate's questions",
        bar,
        classes: [],
        auc: aucOf(values, q === 'clear' || q === 'refs_clear' ? 'no' : 'yes'),
        ...extra,
      },
      values.map(({ p, v }) => ({
        p,
        flag: v === undefined ? undefined : flagOf(v, p),
        close: v !== undefined && Math.abs(v - GATE_BAR[q]) < NOISE,
      })),
    );
  };
  rows.push(
    gateRow(
      'moment.contradicts',
      'the gate: its instructions may contradict each other',
      `> ${MAX_CONTRADICTS_MOMENT} (logged finding)`,
      (a) => a > MAX_CONTRADICTS_MOMENT,
      {
        classes: ['reference_conflict', 'identity', 'presence', 'state_carried'],
      },
    ),
    gateRow(
      'moment.contradicts:acting',
      'the gate acting on it: over the bar and past the diffuse band, or a line carries it',
      `> ${DIFFUSE_UP_TO}, or > ${MAX_CONTRADICTS_MOMENT} with a line carrying ${LOCAL_DROP}`,
      (a, p) =>
        a > DIFFUSE_UP_TO ? true : a > MAX_CONTRADICTS_MOMENT ? carried(prompts.get(p.id)!, 'contradicts') : false,
      {
        classes: ['reference_conflict', 'identity', 'presence', 'state_carried'],
        calls: '1 a picture, and 1 more for each line of a prompt read in the band (the line search, about 30-60)',
      },
    ),
    gateRow(
      'moment.twice',
      'the gate: someone may be drawn twice',
      `> ${MAX_TWICE} (logged finding)`,
      (a) => a > MAX_TWICE,
      {
        rule: 'B7',
        classes: ['identity', 'reference_conflict'],
      },
    ),
    gateRow(
      'moment.twice:acting',
      'the gate acting on it: over the bar and past the diffuse band, or a line carries it',
      `> ${DIFFUSE_UP_TO}, or > ${MAX_TWICE} with a line carrying ${LOCAL_DROP}`,
      (a, p) => (a > DIFFUSE_UP_TO ? true : a > MAX_TWICE ? carried(prompts.get(p.id)!, 'twice') : false),
      {
        rule: 'B7',
        classes: ['identity', 'reference_conflict'],
        calls: '1 a picture, and 1 more for each line of a prompt read in the band',
      },
    ),
    gateRow(
      'moment.clear',
      'the gate: what it shows is not clear enough to draw',
      `< ${MIN_CLEAR}`,
      (a) => a < MIN_CLEAR,
      {
        classes: ['action', 'invented_moment'],
      },
    ),
    gateRow(
      'moment.refs_clear',
      'the gate: what to take from each image is not clear',
      `< ${MIN_REFS_CLEAR}`,
      (a) => a < MIN_REFS_CLEAR,
      {
        rule: 'D2',
        classes: ['reference_conflict'],
      },
    ),
  );
  // The gate as a whole, acting: any of its questions past its acting bar.
  const gateActs = (p: SetPicture): boolean | undefined => {
    const prompt = prompts.get(p.id)!;
    const c = gateRead(p, 'contradicts');
    const t = gateRead(p, 'twice');
    const cl = gateRead(p, 'clear');
    const withImages = /\bImage 1(?::| is\b)/.test(prompt);
    const r = withImages ? gateRead(p, 'refs_clear') : 1;
    if (c === undefined || t === undefined || cl === undefined || r === undefined) return undefined;
    const cActs = c > DIFFUSE_UP_TO ? true : c > MAX_CONTRADICTS_MOMENT ? carried(prompt, 'contradicts') : false;
    const tActs = t > DIFFUSE_UP_TO ? true : t > MAX_TWICE ? carried(prompt, 'twice') : false;
    if (cActs === undefined || tActs === undefined) return undefined;
    return cActs || tActs || cl < MIN_CLEAR || r < MIN_REFS_CLEAR;
  };
  rows.push(
    rowOf(
      {
        id: 'moment.gate',
        label: 'the gate as it acts: any of its four questions past its acting bar',
        rule: 'G1',
        reads: 'prompt',
        routedBy: 'every moment',
        existing: true,
        calls: '1 a picture, plus the line search',
        bar: 'any of the above, acting',
        classes: [],
      },
      pics.map((p) => ({ p, flag: gateActs(p) })),
    ),
  );

  // "Storyboard complete?": its readings as logged before each picture was drawn, and asked again.
  const sbBars: Record<string, { pass: 'yes' | 'no'; bar: number }> = Object.fromEntries(
    STORYBOARD.facts.map((f) => [f.id, { pass: f.pass, bar: f.bar }]),
  );
  const sbFails = (id: string, a: number) => (sbBars[id].pass === 'yes' ? a < sbBars[id].bar : a >= sbBars[id].bar);
  const near = (a: number | undefined, bar: number) => a !== undefined && Math.abs(a - bar) < NOISE;
  const shotPics = pics.filter((p) => shotOf(p));
  const logged = (p: SetPicture, id: string) => shotOf(p)?.readings.find((r) => r.q === id)?.p;
  const again = (p: SetPicture, id: string) => {
    const shot = shotOf(p);
    return shot ? noulOf(kept, sbQuestion(id), shot.state) : undefined;
  };
  const sbClasses: Record<string, string[]> = {
    sb_all_in: ['presence', 'holding', 'state_carried'],
    sb_contradicts: ['camera_turn_layout', 'presence', 'holding'],
    sb_camera: ['pov', 'camera_turn_layout'],
    sb_extra: ['presence', 'invented_moment'],
  };
  for (const f of STORYBOARD.facts) {
    const base = {
      label: `"storyboard complete?": ${f.label.toLowerCase()}`,
      rule:
        f.id === 'sb_camera' ? 'A4, A5' : f.id === 'sb_all_in' ? 'A5, B5' : f.id === 'sb_extra' ? 'B5, A6' : 'A1, B8',
      reads: 'shot' as const,
      routedBy: 'planned (a camera worked out on a floor plan)',
      existing: true,
      bar: `${f.pass === 'yes' ? '<' : '>='} ${f.bar}`,
      classes: sbClasses[f.id],
    };
    rows.push(
      rowOf(
        {
          ...base,
          id: `moment.${f.id}`,
          calls: '1 a planned moment (2 when an answer is near its bar), shared by its four facts',
          note: 'as logged before the picture was drawn',
          auc: aucOf(
            shotPics.map((p) => ({ p, v: logged(p, f.id) })),
            f.pass === 'yes' ? 'no' : 'yes',
          ),
        },
        shotPics.map((p) => {
          const a = logged(p, f.id);
          return { p, flag: a === undefined ? undefined : sbFails(f.id, a), close: near(a, f.bar) };
        }),
      ),
      rowOf(
        {
          ...base,
          id: `moment.${f.id}:again`,
          calls: 'as above',
          note: `asked again (${EVAL_MODEL()}) of the same shot`,
          auc: aucOf(
            shotPics.map((p) => ({ p, v: again(p, f.id) })),
            f.pass === 'yes' ? 'no' : 'yes',
          ),
        },
        shotPics.map((p) => {
          const a = again(p, f.id);
          return { p, flag: a === undefined ? undefined : sbFails(f.id, a), close: near(a, f.bar) };
        }),
      ),
    );
  }
  rows.push(
    rowOf(
      {
        id: 'moment.storyboard',
        label: '"storyboard complete?" as it acts: any fact failing, as logged',
        rule: 'G1',
        reads: 'shot',
        routedBy: 'planned',
        existing: true,
        calls: '1-2 a planned moment; acting, a scene planned again 3 ways and every shot of it checked again',
        bar: 'any fact failing',
        classes: ['camera_turn_layout', 'presence', 'holding', 'pov'],
      },
      shotPics.map((p) => {
        const r = shotOf(p)!.readings;
        return { p, flag: r.length ? r.some((x) => sbFails(x.q, x.p)) : undefined };
      }),
    ),
  );

  // planFacts: the camera faces something the plan lacks (acts by planning the scene again, even logging).
  const lacks = (looks: string | null | undefined, lookAt: string | null) =>
    looks === 'missing' && !!lookAt && !SIDE.test(lookAt);
  const replanLooks = new Map<string, string>();
  for (const x of planAsks) {
    const b = dreamOf(x.session).draft?.breakdown as Breakdown;
    const sc = b.scenes.find((s) => s.id === x.scene)!;
    const plan = x.placeId === sc.place ? sc.blocking! : sc.blocking!.places![x.placeId];
    const ms = sc.moments.filter((m) => x.moments.includes(m.id));
    const answers: Record<string, { type: string; noul?: number; choice?: string; confidence?: number }> = {};
    let complete = true;
    for (const [k, q] of Object.entries(x.questions)) {
      const a = kept.answers[answerKey(q, x.state)];
      if (a === undefined) complete = false;
      else answers[k] = typeof a === 'number' ? { type: 'noul', noul: a } : { type: 'choice', ...a };
    }
    if (!complete) continue;
    const r = applyPlanFacts(plan, ms, answers);
    for (const m of ms) replanLooks.set(`${x.session}/${m.id}`, r.plan.looks?.[m.id] ?? '');
  }
  const planRow = (id: string, note: string, looksOf: (p: SetPicture) => string | null | undefined) =>
    rowOf(
      {
        id,
        label: 'planFacts: the camera faces something the plan lacks (plans the scene again)',
        rule: 'A5, A6',
        reads: 'plan',
        routedBy: 'a moment whose camera faces something named (looks_at)',
        existing: true,
        calls: '1 a place; acting, the scene planned again and its facts asked again',
        bar: 'looks: missing, not a side',
        classes: ['camera_turn_layout', 'invented_moment'],
        note,
      },
      pics
        .filter((p) => momentOf(p).looks_at)
        .map((p) => {
          const l = looksOf(p);
          return { p, flag: l === undefined ? undefined : lacks(l, momentOf(p).looks_at) };
        }),
    );
  rows.push(
    planRow('plan.looks_missing', 'as kept on the plan the picture was drawn from', (p) => momentOf(p).looks),
    planRow('plan.looks_missing:again', `asked again (${EVAL_MODEL()}) of that plan`, (p) =>
      replanLooks.has(`${p.session}/${p.moment}`) ? replanLooks.get(`${p.session}/${p.moment}`) : undefined,
    ),
  );

  // The continuity plan's own warnings (code), which act with the gate when acting.
  rows.push(
    rowOf(
      {
        id: 'moment.plan_issue',
        label: "the continuity plan's warnings: carried in words only, several changes at once, no visible action",
        rule: 'B1, D3, E2',
        reads: 'plan',
        routedBy: 'every moment (code)',
        existing: true,
        calls: '0 (code); acting, held with the gate',
        bar: 'any warning',
        classes: ['state_carried', 'action'],
        note: "today's plan of the moment",
      },
      pics.map((p) => ({ p, flag: momentOf(p).issues.length > 0 })),
    ),
  );

  // The library: each question routed by the moment's tags, judged on the pictures it was neither tuned on
  // nor written from: at its first bar, never tuned, every picture it is asked of; at the bar chosen on the
  // tune pictures, the held-out ones. Either way the moments its rule's evidence names (docs/rules.md) are
  // left out: the question was written knowing what went wrong there.
  const libRows: Row[] = [];
  const bars: Record<string, { bar: number; chosen: boolean; why?: string }> = {};
  for (const q of LIBRARY) {
    const onPics = q.reads === 'prompt' ? pics : shotPics;
    const readings = onPics.flatMap((p) => {
      const f = momentOf(p).facts;
      const qs = libraryAsk(q, f);
      if (!Object.keys(qs).length) return [];
      const state = q.reads === 'prompt' ? prompts.get(p.id)! : shotOf(p)!.state;
      const got = Object.values(qs).map((x) => noulOf(kept, x, state));
      return [
        { p, reading: got.some((g) => g === undefined) ? undefined : (worstOf(q, got as number[]) ?? undefined) },
      ];
    });
    const answered = readings.filter((x): x is { p: SetPicture; reading: number } => x.reading !== undefined);
    const sources = new Set(
      q.from.flatMap((id) => {
        const m = pics.find((p) => p.id === id);
        return m ? [momentKey(m)] : [];
      }),
    );
    const clean = (p: SetPicture) => !sources.has(momentKey(p));
    const chosen = chooseBar(
      q,
      answered.filter((x) => x.p.split === 'tune'),
    );
    bars[q.id] = chosen;
    const share = readings.length / pics.length;
    const first = score(
      answered
        .filter((x) => clean(x.p))
        .map((x) => ({
          p: x.p,
          flag: isFinding({ problem: q.problem, bar: FIRST_BAR }, x.reading),
          close: near(x.reading, FIRST_BAR),
        })),
    );
    const untuned = { bar: FIRST_BAR, scored: first, verdict: verdictOf(first) };
    const row = rowOf(
      {
        id: q.id,
        label: q.says,
        rule: q.rule,
        reads: q.reads,
        routedBy: q.routedBy,
        existing: false,
        calls: q.reads === 'prompt' ? "0 more: asked in the gate's call" : "0 more: asked in the storyboard's call",
        bar: `${q.problem === 'yes' ? '>' : '<'} ${chosen.bar.toFixed(1)}${chosen.chosen ? ' (chosen on tune)' : chosen.why === 'too many' ? ' (every bar that flags three moments flags over half the tune pictures: its first bar)' : ' (no bar flags three moments of the tune pictures: its first bar)'}`,
        classes: q.classes,
        scoredOn: `the held-out pictures it is asked of${sources.size ? `, but the ${sources.size} moments its rule was written from` : ''}`,
        note: sources.size ? `${sources.size} source moments left out` : undefined,
        auc: aucOf(
          readings.map((x) => ({ p: x.p, v: x.reading })),
          q.problem,
        ),
        untuned,
      },
      readings.map((x) => ({
        p: x.p,
        flag: x.reading === undefined ? undefined : isFinding({ problem: q.problem, bar: chosen.bar }, x.reading),
        close: near(x.reading, chosen.bar),
      })),
      (p) => p.split === 'held_out' && clean(p),
    );
    // Either path would earn it acting, at that path's bar; what more it needs is the nearer path's. But the
    // library was written after its author read the owner's notes on these very pictures: no picture here is
    // new to it, so none of it may act on them. Pictures judged after 27 Sep test it.
    const byFirst = needed(first, share);
    const held = verdictOf(row.scored);
    const path = held.acts ? `at ${chosen.bar}, held out` : untuned.verdict.acts ? `at ${FIRST_BAR}, untuned` : null;
    if (path) row.wouldAct = path;
    const bare = (why: string) => why.replace(/^log only: /, '');
    row.verdict = {
      acts: false,
      why: path
        ? `log only: it would meet the bar here (${path}), but it was written after reading the owner's notes on these pictures; pictures judged later test it`
        : `log only: at its tuned bar, held out, ${bare(held.why)}; at ${FIRST_BAR}, untuned, ${bare(untuned.verdict.why)}`,
    };
    row.earnedBar = null;
    if ('none' in row.needs || ('routed' in byFirst && byFirst.any < row.needs.any)) row.needs = byFirst;
    libRows.push(row);
  }
  rows.push(...libRows);

  // For comparison, not a Jev check: the picture judge on the drawn picture (Claude, evals/picture-judge.md).
  rows.push(
    rowOf(
      {
        id: 'picture.judge',
        label: 'the picture judge (reads the drawn picture; not Jev)',
        rule: 'G2',
        reads: 'picture',
        routedBy: 'every picture drawn',
        existing: true,
        calls: '0 Jev (one Claude call a picture)',
        bar: 'its verdict not right',
        classes: [],
        note: 'written from the owner notes on the tune dreams: its held-out figures are the fair ones',
      },
      pics.map((p) => ({ p, flag: p.judge === null ? undefined : p.judge !== 'right' })),
    ),
  );

  // What a prompt reading cannot tell apart: a paired moment's three pictures, drawn from prompts that
  // differ only in image 1, that the owner judged some right and some not; and how far the gate's
  // contradiction reading moves between them.
  const pairedMoments = new Map<string, SetPicture[]>();
  for (const p of pics.filter((x) => x.kind === 'paired'))
    pairedMoments.set(`${p.session}/${p.moment}`, [...(pairedMoments.get(`${p.session}/${p.moment}`) ?? []), p]);
  const split = [...pairedMoments.values()].filter((xs) => new Set(xs.map(notRight)).size > 1).length;
  const spread = [...pairedMoments.values()].map((xs) => {
    const r = xs.map((p) => gateRead(p, 'contradicts')).filter((a): a is number => a !== undefined);
    return r.length ? Math.max(...r) - Math.min(...r) : 0;
  });
  const takes = {
    moments: pairedMoments.size,
    judged_apart: split,
    contradicts_spread_mean: spread.reduce((a, b) => a + b, 0) / (spread.length || 1),
  };

  // ── the readings logged per picture (S2), joined to the verdicts ──
  const logDirs = opts.logs ?? [];
  const joins: { by: 'prompt' | 'moment'; picture: string; verdict: string; facts: unknown; decision: string }[] = [];
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const x = join(d, f);
      return statSync(x).isDirectory() ? walk(x) : f === 'jev.jsonl' ? [x] : [];
    });
  for (const dir of logDirs)
    for (const file of walk(dir)) {
      const session = basename(join(file, '..'));
      for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
        const e = JSON.parse(line) as {
          kind: string;
          stage?: string;
          moment?: string;
          ref?: { prompt: string };
          facts?: unknown;
          decision?: string;
        };
        if (e.kind !== 'transition' || e.stage !== 'gate' || !e.moment) continue;
        const exact = e.ref ? pics.find((p) => p.prompt_sha === e.ref!.prompt) : undefined;
        const loose = pics.find((p) => p.kind === 'story' && p.session === session && p.moment === e.moment);
        const p = exact ?? loose;
        if (p)
          joins.push({
            by: exact ? 'prompt' : 'moment',
            picture: p.id,
            verdict: p.verdict,
            facts: e.facts,
            decision: e.decision ?? '',
          });
      }
    }

  // ── out ──
  const pct = (x: number | null) => (x === null ? '-' : x.toFixed(2));
  const cell = (x: Score) =>
    `${x.hits}/${x.flagged}${x.precision === null ? '' : ` = ${pct(x.precision)}`} (${x.flaggedMoments} moments)`;
  const needs = (r: Row) =>
    r.verdict.acts
      ? '-'
      : 'none' in r.needs
        ? r.needs.none
        : `${r.needs.routed} of its moments (${r.needs.any} judged in all)`;
  const library = rows.filter((r) => r.untuned);
  const others = rows.filter((r) => !r.untuned);
  const lines = [
    '| check | reads | routed by | bar | pictures (moments) | all: not right / flagged = precision | recall | judged on: not right / flagged | its lower bound / base | AUC | verdict | more owner verdicts it would need |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...others.map(
      (r) =>
        `| ${r.id}${r.note ? ` (${r.note})` : ''} | ${r.reads} | ${r.routedBy} | ${r.bar} | ${r.answered} (${r.all.moments})${r.answered < r.routed ? `, ${r.routed - r.answered} unanswered` : ''} | ${cell(r.all)} | ${pct(r.all.recall)} | ${cell(r.scored)} | ${pct(r.scored.low)} / ${pct(r.scored.base)} | ${r.auc === undefined || r.auc === null ? '-' : r.auc.toFixed(2)} | ${r.verdict.acts ? '**may act**' : r.verdict.why} | ${needs(r)} |`,
    ),
    '',
    '| question | rule | routed by | pictures (moments) | at its first bar, every picture but its sources | its lower bound / base | tuned bar | at it, held out but its sources | its lower bound / base | AUC | verdict | more owner verdicts it would need |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...library.map(
      (r) =>
        `| ${r.id} | ${r.rule} | ${r.routedBy} | ${r.answered} (${r.all.moments}) | ${cell(r.untuned!.scored)} of ${r.untuned!.scored.n} | ${pct(r.untuned!.scored.low)} / ${pct(r.untuned!.scored.base)} | ${r.bar} | ${cell(r.scored)} of ${r.scored.n} | ${pct(r.scored.low)} / ${pct(r.scored.base)} | ${r.auc === undefined || r.auc === null ? '-' : r.auc.toFixed(2)} | ${r.verdict.acts ? `**may act** at ${r.earnedBar}` : r.verdict.why} | ${needs(r)} |`,
    ),
  ];
  // Every picture's readings, as asked: the gate's, the shot's (logged then, and again), the library's worst.
  const readingsOf = (p: SetPicture) => {
    const prompt = prompts.get(p.id)!;
    const f = momentOf(p).facts;
    const shot = shotOf(p);
    return {
      verdict: p.verdict,
      split: p.split,
      faults: p.faults.map((x) => x.class),
      gate: Object.fromEntries(Object.entries(gateOf(prompt)).map(([k, q]) => [k, noulOf(kept, q, prompt) ?? null])),
      shot: shot
        ? {
            logged: Object.fromEntries(shot.readings.map((r) => [r.q, r.p])),
            again: Object.fromEntries(
              STORYBOARD.facts.map((x) => [x.id, noulOf(kept, sbQuestion(x.id), shot.state) ?? null]),
            ),
          }
        : null,
      library: Object.fromEntries(
        LIBRARY.flatMap((q) => {
          const qs = libraryAsk(q, f);
          if (!Object.keys(qs).length || (q.reads === 'shot' && !shot)) return [];
          const state = q.reads === 'prompt' ? prompt : shot!.state;
          const got = Object.values(qs).map((x) => noulOf(kept, x, state));
          return [[q.id, got.some((g) => g === undefined) ? null : worstOf(q, got as number[])]];
        }),
      ),
      looks: momentOf(p).looks,
    };
  };
  /** The distinct checks (a variant, asked again or as it acts, and the picture judge are not more checks). */
  const distinct = rows.filter((r) => !r.id.includes(':') && r.id !== 'picture.judge');
  return {
    at: new Date().toISOString(),
    model: EVAL_MODEL(),
    set: createHash('sha256').update(readFileSync(SET)).digest('hex').slice(0, 16),
    calls,
    bar: BAR,
    rows,
    distinct: { checks: distinct.length, act: distinct.filter((r) => r.verdict.acts).map((r) => r.id) },
    bars,
    takes,
    shots: {
      story: pics.filter((p) => p.kind === 'story' && shotOf(p)).length,
      paired: pics.filter((p) => p.kind === 'paired' && shotOf(p)).length,
    },
    pictures: Object.fromEntries(pics.map((p) => [p.id, readingsOf(p)])),
    joins: {
      dirs: logDirs,
      by_prompt: joins.filter((j) => j.by === 'prompt').length,
      by_moment: joins.filter((j) => j.by === 'moment').length,
      rows: joins,
    },
    lines,
  };
}

export type Measured = Awaited<ReturnType<typeof measure>>;

// ── the command ─────────────────────────────────────────────────────────────────────────────────

const USAGE = `usage: bun --env-file=<keys> run evals/jev-checks.ts [--label <name>] [--no-ask] [--logs <dir> …]

  --label <name>   write runs/jev-checks/<name>.json (default: latest)
  --no-ask         ask Jev nothing new: only the answers kept in evals/checks-answers.json
  --logs <dir> …   join the readings logged in these folders (jev.jsonl) to the owner's verdicts
  --help           this`;

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
  }
  let label = 'latest';
  let ask = true;
  const logs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--label' && args[i + 1] && !args[i + 1].startsWith('--')) label = args[++i];
    else if (a === '--no-ask') ask = false;
    else if (a === '--logs') {
      while (args[i + 1] && !args[i + 1].startsWith('--')) logs.push(args[++i]);
      if (!logs.length) {
        console.error(`--logs names no folder\n\n${USAGE}`);
        process.exit(1);
      }
    } else {
      console.error(`not understood: ${a}\n\n${USAGE}`);
      process.exit(1);
    }
  }
  const out = await measure({ ask, logs, say: (line) => console.log(line) });
  mkdirSync(RUNS, { recursive: true });
  const { lines, ...kept } = out;
  writeFileSync(join(RUNS, `${label}.json`), `${JSON.stringify({ label, ...kept }, null, 1)}\n`);
  console.log(lines.join('\n'));
  console.log(
    `\n${out.distinct.act.length} of ${out.distinct.checks} distinct checks may act (${out.rows.length} rows, with their variants and the picture judge); written to runs/jev-checks/${label}.json`,
  );
  console.log(
    `"storyboard complete?" measured on the pictures drawn from the shot it read: ${out.shots.story} story and ${out.shots.paired} paired`,
  );
  console.log(
    `paired moments: ${out.takes.judged_apart} of ${out.takes.moments} judged some right and some not from prompts differing only in image 1 (the gate's contradiction reading moves ${out.takes.contradicts_spread_mean.toFixed(2)} between them, on average)`,
  );
  if (logs.length)
    console.log(
      `logged readings joined to the owner's verdicts: ${out.joins.by_prompt} by the prompt judged, ${out.joins.by_moment} by moment only (another prompt of the same moment)`,
    );
}
