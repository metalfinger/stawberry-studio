// Does the preparation of a moment (its prompt and its references) carry what a person found wrong,
// or right, in the picture drawn from it? The cases (evals/prompt-cases.json) come from a person's
// verdicts and notes on 122 real pictures (evals/story-pictures.json, evals/paired-verdicts.json).
// Each says, for one moment of a saved dream, what its preparation must do so that the fault the
// person noted could not have come from it, or what it must keep doing where the person called the
// picture right. Nothing is drawn: every step of the harness is proven here on its preparation.
//
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/prompt-cases.ts --label baseline
//   bun run evals/prompt-cases.ts --label record-on --against baseline [--only library-1-m3-water …]
//   bun run evals/prompt-cases.ts --only snow-train-m4-suitcase --show
//
// Each moment is rebuilt from its saved dream exactly as plan.ts rebuilds it (plan.ts `rebuild`),
// by today's code under the environment's switches (DREAMCHAT_RECORD and the like), so a step's
// switch can be measured on and off. Two kinds of expectation:
// - code: a named check on the rebuilt references and prompt text (CHECKS below);
// - ask: a yes-or-no question Jev answers about the prompt text alone. Answers are kept by the hash
//   of model, question and prompt (runs/prompt-cases/jev-cache.json), so a run again is cheap and
//   gives the same answers; only a prompt that changed is asked again. --no-ask asks nothing new.
// A case passes when every expectation holds. Cases whose fault is the image model's alone
// (model_only) and cases whose note is set aside (set_aside: the note disagrees with the dream as
// told) are run and shown, but kept out of the pass rates.
//
// Results go to runs/prompt-cases/<label>.json; --against <label> compares with an earlier run.
// Saved dreams are read from DREAMCHAT_DATA, this checkout or another worktree (evals/saved.ts).
// Nothing is drawn and the engine is never called: the only model asked is Jev, about text.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CutPlan } from '../continuity';
import type { JevFn, Question } from '../jev';
import { type Rebuilt, type RebuiltPicture, rebuild, standIn } from '../plan';
import { type Moment, moments } from '../producer';
import type { Session } from '../session';
import { commitOf, DIR } from './saved';

// ── the cases ────────────────────────────────────────────────────────────────────────────────────

/** What kind of fault a case is about: the causes the person's notes fall into. */
export const CLASSES = [
  'state_carried',
  'presence',
  'holding',
  'camera_turn_layout',
  'pov',
  'identity',
  'action',
  'invented_moment',
  'reference_conflict',
  'proportion_or_paste',
  'style_leak',
  'other',
] as const;
export type FaultClass = (typeof CLASSES)[number];

/** A row of one of the two verdict files: a picture of a moment (and, for the paired set, one version of it). */
export type Source = { file: 'story-pictures.json' | 'paired-verdicts.json'; row: string; version?: string };

export type CodeExpectation = {
  kind: 'code';
  check: CheckName;
  args?: Record<string, unknown>;
  /** What it checks, in words. */
  says: string;
};
export type AskExpectation = {
  kind: 'ask';
  /** A yes-or-no question about the prompt text. */
  question: string;
  /** The answer that meets it; yes when not said. */
  expect?: 'yes' | 'no';
};
export type Expectation = CodeExpectation | AskExpectation;

export type PromptCase = {
  id: string;
  /** failing: the person found a fault; passing: they called the picture right, and it must stay so. */
  kind: 'failing' | 'passing';
  class: FaultClass;
  /** The fault is the image model's alone: nothing in the preparation could prevent it. */
  model_only?: boolean;
  /** Why the note is not taken as a fault of the preparation (it disagrees with the dream as told). */
  set_aside?: string;
  session: string;
  moment: string;
  source: Source;
  /** The person's own note on that picture, word for word; null where they wrote none. */
  note: string | null;
  /** Other pictures of the same moment where the person noted the same fault. */
  also?: (Source & { note: string | null })[];
  /** The fault (or, for a passing case, what made it right), in plain words. */
  fault: string;
  /** Where the fault was read from, when not from the person's note: the blind judge's or the picture judge's reason. */
  fault_from?: 'note' | 'blind_reason' | 'judge_reason';
  expectations: Expectation[];
};

export const CASES_FILE = join(import.meta.dir, 'prompt-cases.json');

/** The cases, checked for shape: an unknown check, class or argument is an error, never skipped. */
export function loadCases(path = CASES_FILE): PromptCase[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { cases: PromptCase[] };
  const problems = validateCases(raw.cases);
  if (problems.length) throw new Error(`${path}:\n${problems.join('\n')}`);
  return raw.cases;
}

/** Everything wrong with a list of cases' shape, as lines; none when it is sound. */
export function validateCases(cases: PromptCase[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of cases) {
    const at = c.id ?? '(no id)';
    if (!c.id) out.push(`${at}: no id`);
    if (seen.has(c.id)) out.push(`${at}: id used twice`);
    seen.add(c.id);
    if (c.kind !== 'failing' && c.kind !== 'passing') out.push(`${at}: kind must be failing or passing`);
    if (!CLASSES.includes(c.class)) out.push(`${at}: unknown class ${c.class}`);
    if (!/^dream-\d{4}-\d{6}-[0-9a-f]{4}$/.test(c.session ?? ''))
      out.push(`${at}: session ${c.session} is not a saved dream's id`);
    if (!/^m\d+$/.test(c.moment ?? '')) out.push(`${at}: moment ${c.moment} is not a moment id`);
    if (!c.source?.file || !c.source.row) out.push(`${at}: no source`);
    if (c.note === undefined) out.push(`${at}: note must be the person's words or null`);
    if (c.kind === 'failing' && c.note === null && !c.fault_from)
      out.push(`${at}: no note, so fault_from must say where the fault was read`);
    if (!c.fault) out.push(`${at}: no fault`);
    if (c.kind === 'passing' && (c.model_only || c.set_aside))
      out.push(`${at}: a passing case is never model_only or set aside`);
    if (!c.expectations?.length) out.push(`${at}: no expectations`);
    for (const [i, e] of (c.expectations ?? []).entries()) {
      if (e.kind === 'ask') {
        if (!e.question?.trim().endsWith('?')) out.push(`${at} #${i}: an ask must be a question`);
        if (e.expect && e.expect !== 'yes' && e.expect !== 'no') out.push(`${at} #${i}: expect must be yes or no`);
      } else if (e.kind === 'code') {
        const spec = CHECK_ARGS[e.check];
        if (!spec) {
          out.push(`${at} #${i}: unknown check ${e.check}`);
          continue;
        }
        const args = e.args ?? {};
        for (const k of spec.required) if (args[k] === undefined) out.push(`${at} #${i}: ${e.check} needs ${k}`);
        for (const k of Object.keys(args))
          if (!spec.required.includes(k) && !spec.optional.includes(k))
            out.push(`${at} #${i}: ${e.check} takes no ${k}`);
        for (const k of ['pattern', 'what', 'now', 'text'])
          if (typeof args[k] === 'string')
            try {
              new RegExp(args[k] as string, 'i');
            } catch {
              out.push(`${at} #${i}: ${k} is not a regular expression`);
            }
        if (args.section !== undefined && !SECTIONS.includes(args.section as Section))
          out.push(`${at} #${i}: unknown section ${String(args.section)}`);
        if (!e.says) out.push(`${at} #${i}: says what it checks in words`);
      } else out.push(`${at} #${i}: kind must be code or ask`);
    }
  }
  return out;
}

// ── a moment as rebuilt ──────────────────────────────────────────────────────────────────────────

/** The parts of a moment's prompt, by what each paragraph opens with (frames.ts framePrompt). */
export const SECTIONS = [
  'framing',
  'shot',
  'manifest',
  'happens',
  'dream',
  'pov',
  'staging',
  'you',
  'in_it',
  'still',
  'feel',
  'must_show',
  'repair',
  'style',
  'keep',
  'through',
  'last',
  'other',
] as const;
export type Section = (typeof SECTIONS)[number];

const OPENS: [Section, RegExp][] = [
  ['framing', /^One picture from the dream/],
  ['shot', /^(?:The shot|What the dreamer sees|What the camera sees)\b/],
  ['manifest', /^The attached images/],
  ['happens', /^What happens in this frame:/],
  ['dream', /^The dream in it/],
  ['pov', /^The camera is the dreamer's own eyes/],
  ['staging', /^(?:Seen [\s\S]*From left to right|Where they stand)/],
  ['you', /^"You" in these words/],
  ['in_it', /^In it:/],
  ['still', /^Still so from earlier/],
  ['feel', /^It should feel:/],
  ['must_show', /^The one thing this frame must show:/],
  ['repair', /^The last attempt/],
  ['style', /^Style:/],
  ['keep', /^Everyone and everything looks exactly/],
  ['through', /^Nothing from another picture shows through/],
  ['last', /^One single picture/],
];

/** Each part of a prompt; a part a prompt has twice is joined, one that is missing is absent. */
export function sectionsOf(prompt: string): Partial<Record<Section, string>> {
  const out: Partial<Record<Section, string>> = {};
  for (const para of prompt.split('\n\n')) {
    const s = OPENS.find(([, re]) => re.test(para))?.[0] ?? 'other';
    out[s] = out[s] ? `${out[s]}\n\n${para}` : para;
  }
  return out;
}

/** An attached image, known by what it is and whom it is for. */
export type RefInfo = {
  index: number;
  role: string;
  media: string;
  /** mockup: the floor plan's render; sketch; ghost: an in-between picture; picture: an earlier moment. */
  source: 'mockup' | 'sketch' | 'ghost' | 'picture' | 'other';
  /** The sketch's item, the in-between picture's id, or the earlier moment's. */
  of?: string;
  /** Whom it is attached to say how they look: a sketch's own subject, a ghost's, a picture attached for who someone is. */
  subjects: string[];
};

/** What the checks read of one moment. */
export type Ctx = {
  r: Rebuilt;
  p: RebuiltPicture;
  m: Moment;
  cut: CutPlan;
  refs: RefInfo[];
  sections: Partial<Record<Section, string>>;
  /** Who and what the picture shows, by their ids: the dreamer is not in their own view. */
  shown: Set<string>;
  dreamer?: string;
};

/** The images of a moment, each known by what it is. */
export function refsOf(r: Rebuilt, p: RebuiltPicture): RefInfo[] {
  const cut = p.item.frame?.plan;
  const here = p.item.frame?.visible ?? [];
  const sketched = new Set(
    p.references.flatMap((ref) => r.sheets.filter((s) => s.mediaId === ref.media_id).map((s) => s.id)),
  );
  return p.references.map((ref, index): RefInfo => {
    const base = { index: index + 1, role: ref.role, media: ref.media_id };
    if (ref.media_id === standIn.previs(p.id)) return { ...base, source: 'mockup', subjects: [] };
    const sheet = r.sheets.find((s) => s.mediaId === ref.media_id);
    if (sheet) return { ...base, source: 'sketch', of: sheet.id, subjects: [sheet.id] };
    const id = ref.media_id.startsWith(standIn.picture('')) ? ref.media_id.slice(standIn.picture('').length) : '';
    const ghost = r.plan.ghosts.find((g) => g.id === id);
    if (ghost) return { ...base, source: 'ghost', of: ghost.id, subjects: [ghost.of] };
    const earlier = r.pictures.find((x) => x.id === id && x.kind === 'cut');
    if (earlier) {
      // As framePrompt attaches it: for who has no sketch here (a picture kept for its light, or the
      // one they were last seen in), else for how everyone in both pictures looks now.
      const use = cut?.refs.find((x) => x.kind === 'cut' && x.id === id);
      const shared = (earlier.item.frame?.visible ?? []).filter((w) => here.includes(w));
      const who =
        ref.role !== 'identity'
          ? []
          : use?.role === 'lighting'
            ? shared.filter((w) => !sketched.has(w))
            : use?.who?.length
              ? use.who.filter((w) => !sketched.has(w))
              : shared;
      return { ...base, source: 'picture', of: id, subjects: who };
    }
    return { ...base, source: 'other', subjects: [] };
  });
}

/** One moment of a rebuilt dream, ready for its checks. */
export function contextOf(r: Rebuilt, moment: string): Ctx {
  const p = r.pictures.find((x) => x.id === moment && x.kind === 'cut');
  const m = moments(r.b).find((x) => x.id === moment);
  const cut = r.plan.cuts.find((x) => x.id === moment);
  if (!p || !m || !cut) throw new Error(`${moment} is not a moment of ${r.title}`);
  return {
    r,
    p,
    m,
    cut,
    refs: refsOf(r, p),
    sections: sectionsOf(p.prompt),
    shown: new Set(p.inView.map((x) => x.id)),
    dreamer: r.b.people.find((x) => x.is_dreamer)?.id,
  };
}

// ── the code checks ──────────────────────────────────────────────────────────────────────────────

export type CheckResult = { pass: boolean; detail: string };

const re = (pattern: unknown) => new RegExp(String(pattern), 'i');
const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : [String(x)]);
const nameOf = (c: Ctx, id: string) => {
  const all = [...c.r.b.people, ...c.r.b.places, ...c.r.b.things];
  const it = all.find((x) => x.id === id);
  return it ? `${it.name} (${id})` : id;
};
/** The part of the prompt a check reads: the whole of it, or one section (empty when it has none). */
const textOf = (c: Ctx, section: unknown) =>
  section === undefined ? c.p.prompt : (c.sections[section as Section] ?? '');
/** Everything this moment's plan says is so of someone: what it changes and what still holds. */
const statesOf = (cut: CutPlan) => [...cut.own, ...cut.states];
const imagesFor = (c: Ctx, who: string) =>
  c.refs.filter((x) => x.subjects.includes(who) && x.source !== 'mockup' && x.role !== 'base');
const angle = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const d = Math.abs(Math.atan2(a.x, a.y) - Math.atan2(b.x, b.y)) * (180 / Math.PI);
  return Math.round(d > 180 ? 360 - d : d);
};
const cameraOf = (c: Ctx, id: unknown) => c.r.plan.cuts.find((x) => x.id === String(id))?.eye;

/**
 * The checks a case may name. Each is general (who is in view, how many images say who someone
 * is, what a part of the prompt says); what it is asked about comes from the case.
 */
export const CHECKS = {
  /** An image says how this person or thing looks (their sketch, an in-between picture of them, or a picture attached for who they are). */
  image_of: (c: Ctx, a: { who: string }): CheckResult => {
    const got = imagesFor(c, a.who);
    return {
      pass: got.length > 0,
      detail: got.length ? `image ${got.map((x) => x.index).join(', ')}` : `no image of ${nameOf(c, a.who)}`,
    };
  },
  no_image_of: (c: Ctx, a: { who: string }): CheckResult => {
    const got = imagesFor(c, a.who);
    return {
      pass: !got.length,
      detail: got.length
        ? `${nameOf(c, a.who)} in image ${got.map((x) => `${x.index} (${x.source})`).join(', ')}`
        : `no image of ${nameOf(c, a.who)}`,
    };
  },
  /** At most n images for one subject, or for every subject when none is named. */
  images_per_subject_at_most: (c: Ctx, a: { n: number; who?: string }): CheckResult => {
    const subjects = a.who ? [a.who] : [...new Set(c.refs.flatMap((x) => x.subjects))];
    const over = subjects
      .map((w) => ({ w, got: imagesFor(c, w) }))
      .filter((x) => x.got.length > a.n)
      .map((x) => `${nameOf(c, x.w)}: images ${x.got.map((g) => `${g.index} (${g.source})`).join(', ')}`);
    return { pass: !over.length, detail: over.length ? over.join('; ') : `at most ${a.n} each` };
  },
  images_at_most: (c: Ctx, a: { n: number }): CheckResult => ({
    pass: c.refs.length <= a.n,
    detail: `${c.refs.length} images`,
  }),
  /** Who and what the picture shows (what it lists and what its worked-out view has in it). */
  in_view: (c: Ctx, a: { who: string }): CheckResult => ({
    pass: c.shown.has(a.who),
    detail: `${nameOf(c, a.who)} ${c.shown.has(a.who) ? 'is' : 'is not'} in view (shown: ${[...c.shown].join(', ')})`,
  }),
  not_in_view: (c: Ctx, a: { who: string }): CheckResult => ({
    pass: !c.shown.has(a.who),
    detail: `${nameOf(c, a.who)} ${c.shown.has(a.who) ? 'is' : 'is not'} in view (shown: ${[...c.shown].join(', ')})`,
  }),
  /** The dreamer is in the picture, or the picture is what their own eyes see. */
  dreamer_seen_or_pov: (c: Ctx): CheckResult => {
    const pov = c.m.eyes === 'dreamer';
    const seen = !!c.dreamer && c.shown.has(c.dreamer);
    return { pass: pov || seen, detail: pov ? 'through their eyes' : seen ? 'the dreamer is in view' : 'neither' };
  },
  /** No image of the dreamer: through their own eyes they are the camera. */
  no_dreamer_image: (c: Ctx): CheckResult => {
    const got = c.dreamer ? imagesFor(c, c.dreamer) : [];
    return {
      pass: !got.length,
      detail: got.length ? `the dreamer in image ${got.map((x) => x.index).join(', ')}` : 'no image of the dreamer',
    };
  },
  /**
   * The moment's plan holds a state of `who` (its part `what`, its value `now`): one this moment
   * makes or one still so from earlier. Where the plan holds none, `text` found in the prompt counts.
   */
  state_carried: (c: Ctx, a: { who: string; what?: string; now?: string; text?: string }): CheckResult => {
    const hit = statesOf(c.cut).find(
      (st) => st.who === a.who && (!a.what || re(a.what).test(st.what)) && (!a.now || re(a.now).test(st.now)),
    );
    if (hit) return { pass: true, detail: `${hit.who}'s ${hit.what}: ${hit.now}` };
    const said = a.text ? c.p.prompt.match(re(a.text)) : null;
    const held = statesOf(c.cut).map((st) => `${st.who}'s ${st.what}: ${st.now}`);
    return {
      pass: !!said,
      detail: said
        ? `not in the plan, but said: "${said[0]}"`
        : `no such state (the plan holds ${held.length ? held.join('; ') : 'none'})`,
    };
  },
  state_not_carried: (c: Ctx, a: { who: string; what?: string; now?: string }): CheckResult => {
    const hit = statesOf(c.cut).find(
      (st) => st.who === a.who && (!a.what || re(a.what).test(st.what)) && (!a.now || re(a.now).test(st.now)),
    );
    return { pass: !hit, detail: hit ? `still carried: ${hit.who}'s ${hit.what}: ${hit.now}` : 'not carried' };
  },
  /** The picture of an earlier moment is attached (for one of these uses, if named). */
  ref_of_picture: (c: Ctx, a: { moment: string; roles?: string[] }): CheckResult => {
    const got = c.refs.filter((x) => x.source === 'picture' && x.of === a.moment);
    const ok = got.filter((x) => !a.roles || list(a.roles).includes(x.role));
    return {
      pass: ok.length > 0,
      detail: got.length
        ? `picture ${a.moment} as ${got.map((x) => x.role).join(', ')}`
        : `picture ${a.moment} not attached (images: ${c.refs.map((x) => `${x.source}${x.of ? ` ${x.of}` : ''} as ${x.role}`).join('; ')})`,
    };
  },
  /** No earlier picture is the picture edited (image 1 is the mock-up or nothing). */
  no_edit_of_earlier: (c: Ctx): CheckResult => {
    const base = c.refs.find((x) => x.role === 'base' && (x.source === 'picture' || x.source === 'ghost'));
    return { pass: !base, detail: base ? `image ${base.index} edits ${base.of}` : 'no earlier picture edited' };
  },
  /** How the plan says this moment follows an earlier one (same_setup, same_side, other_side, other_place, shift, seat). */
  relation_to: (c: Ctx, a: { moment: string; relation: string[] }): CheckResult => {
    const use = c.cut.refs.find((x) => x.kind === 'cut' && x.id === a.moment);
    return {
      pass: !!use?.relation && list(a.relation).includes(use.relation),
      detail: use ? `${use.relation ?? 'no relation'} (${use.role})` : `the plan draws nothing from ${a.moment}`,
    };
  },
  /** The camera faces at least this many degrees away from an earlier moment's. */
  camera_turned_from: (c: Ctx, a: { moment: string; degrees: number }): CheckResult => {
    const a1 = c.cut.eye;
    const b1 = cameraOf(c, a.moment);
    if (!a1 || !b1) return { pass: false, detail: `no worked-out camera on ${!a1 ? c.m.id : a.moment}` };
    const d = angle(a1.d, b1.d);
    return { pass: d >= a.degrees, detail: `turned ${d}° from ${a.moment}` };
  },
  /** The camera is not an earlier moment's again: turned, moved or raised by at least one of these. */
  camera_differs_from: (
    c: Ctx,
    a: { moment: string; degrees?: number; metres?: number; height?: number },
  ): CheckResult => {
    const a1 = c.cut.eye;
    const b1 = cameraOf(c, a.moment);
    if (!a1 || !b1) return { pass: false, detail: `no worked-out camera on ${!a1 ? c.m.id : a.moment}` };
    const d = angle(a1.d, b1.d);
    const moved = Math.hypot(a1.at.x - b1.at.x, a1.at.y - b1.at.y);
    const raised = Math.abs(a1.height - b1.height);
    const pass =
      (a.degrees !== undefined && d >= a.degrees) ||
      (a.metres !== undefined && moved >= a.metres) ||
      (a.height !== undefined && raised >= a.height);
    return {
      pass,
      detail: `from ${a.moment}: turned ${d}°, moved ${moved.toFixed(1)} m, raised ${raised.toFixed(1)} m`,
    };
  },
  prompt_has: (c: Ctx, a: { pattern: string; section?: Section }): CheckResult => {
    const hit = textOf(c, a.section).match(re(a.pattern));
    return {
      pass: !!hit,
      detail: hit ? `"${hit[0].slice(0, 120)}"` : `not found${a.section ? ` in ${a.section}` : ''}`,
    };
  },
  prompt_lacks: (c: Ctx, a: { pattern: string; section?: Section }): CheckResult => {
    const hit = textOf(c, a.section).match(re(a.pattern));
    return {
      pass: !hit,
      detail: hit ? `says "${hit[0].slice(0, 160)}"` : `absent${a.section ? ` from ${a.section}` : ''}`,
    };
  },
  /** The moment's action is the dreamer's own telling, not the producer's. */
  moment_said: (c: Ctx): CheckResult => ({ pass: c.m.said, detail: c.m.said ? 'said' : 'marked not said' }),
};
export type CheckName = keyof typeof CHECKS;

/** The arguments each check takes. */
export const CHECK_ARGS: Record<CheckName, { required: string[]; optional: string[] }> = {
  image_of: { required: ['who'], optional: [] },
  no_image_of: { required: ['who'], optional: [] },
  images_per_subject_at_most: { required: ['n'], optional: ['who'] },
  images_at_most: { required: ['n'], optional: [] },
  in_view: { required: ['who'], optional: [] },
  not_in_view: { required: ['who'], optional: [] },
  dreamer_seen_or_pov: { required: [], optional: [] },
  no_dreamer_image: { required: [], optional: [] },
  state_carried: { required: ['who'], optional: ['what', 'now', 'text'] },
  state_not_carried: { required: ['who'], optional: ['what', 'now'] },
  ref_of_picture: { required: ['moment'], optional: ['roles'] },
  no_edit_of_earlier: { required: [], optional: [] },
  relation_to: { required: ['moment', 'relation'], optional: [] },
  camera_turned_from: { required: ['moment', 'degrees'], optional: [] },
  camera_differs_from: { required: ['moment'], optional: ['degrees', 'metres', 'height'] },
  prompt_has: { required: ['pattern'], optional: ['section'] },
  prompt_lacks: { required: ['pattern'], optional: ['section'] },
  moment_said: { required: [], optional: [] },
};

export function runCheck(c: Ctx, e: CodeExpectation): CheckResult {
  const fn = CHECKS[e.check] as (c: Ctx, a: Record<string, unknown>) => CheckResult;
  if (!fn) return { pass: false, detail: `unknown check ${e.check}` };
  return fn(c, e.args ?? {});
}

// ── the questions Jev answers ────────────────────────────────────────────────────────────────────

export const JEV_MODEL = () => process.env.JEV_MODEL ?? 'jev-latest';

/** One yes-or-no question about a prompt, as Jev is asked it. */
export function askQuestion(question: string): Question {
  return {
    type: 'noul',
    instructions: `This is the text sent to an image model to draw one picture; the images it names are not shown. Answer from what the text itself says. ${question}`,
    criteria: {
      true: 'the text says so, plainly or in other words',
      false: 'the text does not say so, leaves it open, or says otherwise',
    },
  };
}

/** Jev's answers so far, by the hash of model, question and prompt: a run again asks only what changed. */
export type JevCache = Record<string, { p: number; model: string; at: string }>;

export const askKey = (prompt: string, question: string, model = JEV_MODEL()) =>
  createHash('sha256').update(`${model}\n${question}\n\n${prompt}`).digest('hex');

/** Above this, Jev's answer is yes. */
export const YES = 0.5;
/**
 * Within this of the bar an answer is close: asked twice, the same question on the same prompt
 * moved by up to 0.06, and a prompt whose style is named for water read 0.49-0.54 on "is the room
 * flooded" (26 Sep). A close answer is marked, so a case that turns on one is not trusted blindly.
 */
export const CLOSE = 0.1;

/**
 * Asks Jev every question not already answered, a few at a time, each in a call of its own so its
 * answer depends only on its prompt and question. Answers land in the cache; failures are returned.
 */
export async function askAll(
  items: { prompt: string; question: string }[],
  jev: JevFn,
  cache: JevCache,
  concurrency = 6,
): Promise<string[]> {
  const model = JEV_MODEL();
  const todo = [
    ...new Map(
      items.map((x) => [askKey(x.prompt, x.question, model), x] as const).filter(([k]) => !cache[k]),
    ).entries(),
  ];
  const errors: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const [key, x] = todo[next++];
      const call = await jev(x.prompt, { q: askQuestion(x.question) });
      const a = call.answers?.q;
      if (a?.type === 'noul') cache[key] = { p: a.noul, model, at: new Date().toISOString() };
      else errors.push(`${x.question.slice(0, 60)}…: ${call.error ?? 'no answer'}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return errors;
}

// ── a run ────────────────────────────────────────────────────────────────────────────────────────

export type ExpectationResult = {
  kind: 'code' | 'ask';
  check?: string;
  question?: string;
  says?: string;
  expect?: 'yes' | 'no';
  /** null: not answered (no Jev, or it failed). */
  pass: boolean | null;
  detail: string;
  /** Jev's probability of yes. */
  p?: number;
  /** Jev's answer is within CLOSE of the bar. */
  close?: boolean;
};

export type CaseResult = {
  id: string;
  kind: PromptCase['kind'];
  class: FaultClass;
  model_only: boolean;
  set_aside: boolean;
  session: string;
  moment: string;
  /** Every expectation met; null when one is unanswered and none failed. */
  pass: boolean | null;
  expectations: ExpectationResult[];
  error?: string;
};

/** Whether a case counts toward the pass rates. */
export const counted = (r: Pick<CaseResult, 'model_only' | 'set_aside'>) => !r.model_only && !r.set_aside;

/** A case's result from its checks and Jev's answers (those not in the cache are unanswered). */
export function judgeCase(c: PromptCase, ctx: Ctx | Error, cache: JevCache): CaseResult {
  const head = {
    id: c.id,
    kind: c.kind,
    class: c.class,
    model_only: !!c.model_only,
    set_aside: !!c.set_aside,
    session: c.session,
    moment: c.moment,
  };
  if (ctx instanceof Error) return { ...head, pass: false, expectations: [], error: ctx.message };
  const expectations = c.expectations.map((e): ExpectationResult => {
    if (e.kind === 'code') {
      const r = runCheck(ctx, e);
      return { kind: 'code', check: e.check, says: e.says, pass: r.pass, detail: r.detail };
    }
    const want = e.expect ?? 'yes';
    const got = cache[askKey(ctx.p.prompt, e.question)];
    if (!got) return { kind: 'ask', question: e.question, expect: want, pass: null, detail: 'not answered' };
    const yes = got.p >= YES;
    const close = Math.abs(got.p - YES) < CLOSE;
    return {
      kind: 'ask',
      question: e.question,
      expect: want,
      pass: yes === (want === 'yes'),
      detail: `${yes ? 'yes' : 'no'} ${got.p.toFixed(2)}${close ? ' (close to the bar)' : ''}`,
      p: got.p,
      ...(close ? { close } : {}),
    };
  });
  const pass = expectations.some((x) => x.pass === false)
    ? false
    : expectations.some((x) => x.pass === null)
      ? null
      : true;
  return { ...head, pass, expectations };
}

type Tally = { cases: number; pass: number; unknown: number };
export type Totals = Record<string, { failing: Tally; passing: Tally; out: Tally }>;

/** Per class: failing and passing cases in the pass rates, and those kept out (model_only, set aside). */
export function totalsOf(results: CaseResult[]): Totals {
  const out: Totals = {};
  const empty = (): Tally => ({ cases: 0, pass: 0, unknown: 0 });
  for (const r of results) {
    const t = (out[r.class] ??= { failing: empty(), passing: empty(), out: empty() });
    const bucket = !counted(r) ? t.out : r.kind === 'failing' ? t.failing : t.passing;
    bucket.cases++;
    if (r.pass === true) bucket.pass++;
    if (r.pass === null) bucket.unknown++;
  }
  return out;
}

export type RunFile = {
  label: string;
  at: string;
  commit: string | null;
  /** The dream chat's switches in force (DREAMCHAT_RECORD and the like). */
  switches: Record<string, string>;
  jevModel: string;
  data: string;
  totals: Totals;
  cases: CaseResult[];
};

export type Comparison = {
  better: string[];
  worse: string[];
  /** Answered now, not before, or the other way. */
  unsure: string[];
  lines: string[];
};

/** What changed between an earlier run and this one, case by case and class by class. */
export function compare(before: RunFile, now: RunFile): Comparison {
  const was = new Map(before.cases.map((c) => [c.id, c]));
  const better: string[] = [];
  const worse: string[] = [];
  const unsure: string[] = [];
  for (const c of now.cases) {
    const b = was.get(c.id);
    if (!b || b.pass === c.pass) continue;
    if (b.pass === false && c.pass === true) better.push(c.id);
    else if (b.pass === true && c.pass === false) worse.push(c.id);
    else unsure.push(c.id);
  }
  const lines = [`against ${before.label} (${before.commit ?? '?'}, ${before.at}):`];
  for (const k of Object.keys({ ...before.totals, ...now.totals }).sort()) {
    const a = before.totals[k];
    const b = now.totals[k];
    const f = (t?: Tally) => (t ? `${t.pass}/${t.cases}` : '-');
    if (f(a?.failing) !== f(b?.failing) || f(a?.passing) !== f(b?.passing))
      lines.push(
        `  ${k.padEnd(20)} failing ${f(a?.failing)} -> ${f(b?.failing)}   passing ${f(a?.passing)} -> ${f(b?.passing)}`,
      );
  }
  if (better.length) lines.push(`  now met: ${better.join(', ')}`);
  if (worse.length) lines.push(`  no longer met: ${worse.join(', ')}`);
  if (unsure.length) lines.push(`  answered differently or not at all: ${unsure.join(', ')}`);
  if (!better.length && !worse.length && !unsure.length) lines.push('  no case changed');
  return { better, worse, unsure, lines };
}

const pct = (a: number, b: number) => `${a}/${b}${b ? ` (${Math.round((100 * a) / b)}%)` : ''}`;

/** The table printed at the end of a run. */
export function totalsLines(t: Totals): string[] {
  const sum = (k: 'failing' | 'passing' | 'out') =>
    Object.values(t).reduce(
      (a, x) => ({ cases: a.cases + x[k].cases, pass: a.pass + x[k].pass, unknown: a.unknown + x[k].unknown }),
      { cases: 0, pass: 0, unknown: 0 },
    );
  const cell = (x: Tally) => (x.cases ? `${pct(x.pass, x.cases)}${x.unknown ? ` ?${x.unknown}` : ''}` : '-');
  const lines = [
    `${'class'.padEnd(20)} ${'failing cases met'.padEnd(20)} ${'passing cases met'.padEnd(20)} kept out (met)`,
  ];
  for (const k of CLASSES) {
    const x = t[k];
    if (!x) continue;
    lines.push(`${k.padEnd(20)} ${cell(x.failing).padEnd(20)} ${cell(x.passing).padEnd(20)} ${cell(x.out)}`);
  }
  lines.push(
    `${'all'.padEnd(20)} ${cell(sum('failing')).padEnd(20)} ${cell(sum('passing')).padEnd(20)} ${cell(sum('out'))}`,
  );
  return lines;
}

export const RUNS = join(DIR, 'runs', 'prompt-cases');

// ── the command ──────────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  // Nothing here draws or reaches the engine: a rebuild only writes prompts, and Jev only reads them.
  const { callJev, jevAvailable } = await import('../jev');
  const { dataDir, readSession, switches } = await import('./saved');
  const args = process.argv.slice(2);
  const valueOf = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const listOf = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return [];
    const out: string[] = [];
    for (const a of args.slice(i + 1)) {
      if (a.startsWith('--')) break;
      out.push(a);
    }
    return out;
  };
  const label = valueOf('--label') ?? 'latest';
  const against = valueOf('--against');
  const only = listOf('--only');
  const show = args.includes('--show');
  const noAsk = args.includes('--no-ask');

  const all = loadCases();
  const unknown = only.filter((id) => !all.some((c) => c.id === id));
  if (unknown.length) {
    console.error(`no such case: ${unknown.join(', ')}`);
    process.exit(1);
  }
  const cases = only.length ? all.filter((c) => only.includes(c.id)) : all;
  const data = dataDir([...new Set(cases.map((c) => c.session))]);

  // Every dream rebuilt once, as plan.ts rebuilds it.
  const rebuilt = new Map<string, Rebuilt | Error>();
  for (const id of new Set(cases.map((c) => c.session))) {
    try {
      rebuilt.set(id, rebuild(readSession(data, id) as Session));
    } catch (e) {
      rebuilt.set(id, e instanceof Error ? e : new Error(String(e)));
    }
  }
  const ctxOf = (c: PromptCase): Ctx | Error => {
    const r = rebuilt.get(c.session);
    if (!r || r instanceof Error) return r ?? new Error('not rebuilt');
    try {
      return contextOf(r, c.moment);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };

  mkdirSync(RUNS, { recursive: true });
  const cacheFile = join(RUNS, 'jev-cache.json');
  const cache: JevCache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const asks = cases.flatMap((c) => {
    const ctx = ctxOf(c);
    return ctx instanceof Error
      ? []
      : c.expectations.flatMap((e) => (e.kind === 'ask' ? [{ prompt: ctx.p.prompt, question: e.question }] : []));
  });
  if (!noAsk && jevAvailable()) {
    const before = Object.keys(cache).length;
    const errors = await askAll(asks, callJev, cache);
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 1)}\n`);
    console.log(`Jev: ${Object.keys(cache).length - before} questions asked, the rest from the cache`);
    for (const e of errors) console.log(`Jev failed: ${e}`);
  } else if (asks.some((x) => !cache[askKey(x.prompt, x.question)]))
    console.log(
      noAsk
        ? '--no-ask: questions not in the cache are left unanswered'
        : 'no JEV_API_KEY: questions not in the cache are left unanswered (run with --env-file)',
    );

  const results = cases.map((c) => judgeCase(c, ctxOf(c), cache));
  for (const r of results) {
    const c = cases.find((x) => x.id === r.id)!;
    const mark = r.pass === true ? 'MET ' : r.pass === false ? 'FAIL' : ' ?  ';
    const out = !counted(r) ? (r.model_only ? ' [model only]' : ' [set aside]') : '';
    console.log(`${mark} ${r.kind.padEnd(7)} ${r.class.padEnd(19)} ${r.id}${out}`);
    if (r.error) console.log(`       error: ${r.error}`);
    for (const e of r.expectations)
      if (e.pass !== true || e.close || show)
        console.log(
          `       ${e.pass === true ? 'ok' : e.pass === false ? 'x ' : '? '} ${e.kind === 'code' ? `${e.check}: ${e.says}` : `ask (${e.expect}): ${e.question}`} -> ${e.detail}`,
        );
    if (show) {
      const ctx = ctxOf(c);
      if (!(ctx instanceof Error)) {
        console.log(
          `\n  images: ${ctx.refs.map((x) => `${x.index} ${x.source}${x.of ? ` ${x.of}` : ''} as ${x.role}`).join('; ')}`,
        );
        console.log(
          `  plan: ${ctx.cut.why}; states: ${[...ctx.cut.own, ...ctx.cut.states].map((st) => `${st.who} ${st.what}=${st.now}`).join('; ') || 'none'}\n`,
        );
        console.log(ctx.p.prompt.replace(/^/gm, '  | '));
        console.log('');
      }
    }
  }

  const run: RunFile = {
    label,
    at: new Date().toISOString(),
    commit: commitOf(),
    switches: switches(),
    jevModel: JEV_MODEL(),
    data,
    totals: totalsOf(results),
    cases: results,
  };
  console.log(`\n${label}: ${cases.length} cases${only.length ? ' (--only)' : ''}`);
  for (const l of totalsLines(run.totals)) console.log(l);
  const close = results.filter((r) => r.expectations.some((e) => e.close)).map((r) => r.id);
  if (close.length) console.log(`answers close to the bar, in: ${close.join(', ')}`);
  const file = join(RUNS, `${label}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 1)}\n`);
  console.log(`\nwritten ${file}`);
  if (against) {
    const path = join(RUNS, `${against}.json`);
    if (!existsSync(path)) console.log(`no run labelled ${against} (${path})`);
    else for (const l of compare(JSON.parse(readFileSync(path, 'utf8')) as RunFile, run).lines) console.log(l);
  }
}
