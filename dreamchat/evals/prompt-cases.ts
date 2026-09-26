// Does the preparation of a moment (its prompt and its references) carry what a person found wrong,
// or right, in the picture drawn from it? The cases (evals/prompt-cases.json) come from a person's
// verdicts and notes on 122 real pictures (evals/story-pictures.json, evals/paired-verdicts.json).
// Each says, for one moment of a saved dream, what its preparation must do so that the fault the
// person noted could not have come from it, or what it must keep doing where the person called the
// picture right. Nothing is drawn: every step of the harness is proven here on its preparation.
//
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/prompt-cases.ts --label baseline
//   bun run evals/prompt-cases.ts --label record-on --against baseline [--only library-1-m3-water …] [--step S1]
//   bun run evals/prompt-cases.ts --only snow-train-m4-suitcase --show
//
// Each moment is rebuilt from its dream exactly as plan.ts rebuilds it (plan.ts `rebuild`), by
// today's code under the environment's switches (DREAMCHAT_RECORD and the like), so a step's switch
// can be measured on and off. The dreams are the frozen copies in evals/sources (--live: the saved
// conversations themselves); every run records the hash of the case file and of every dream it read,
// and --against warns when two runs read different ones. Two kinds of expectation:
// - code: a named check on the rebuilt images, the floor plan and the prompt text (CHECKS below);
// - ask: a yes-or-no question Jev answers about the prompt text alone. Every fault case has one that
//   must be answered no about the faulty fact itself, so rewording the fault and adding the right
//   fact beside it does not meet the case. Jev is asked by one model by name (JEV_EVAL_MODEL, pinned);
//   answers are kept by the hash of that model, the question as asked and the prompt
//   (runs/prompt-cases/jev-cache.json), so a run again gives the same answers and only a prompt
//   that changed is asked again. --no-ask asks nothing new.
// A case passes when every expectation holds. Kept out of the pass rates, but run and shown: cases
// whose fault is the image model's alone (model_only), whose note disagrees with the dream as told
// (set_aside), and whose cause the pictures do not settle (hypothesis). Cases whose fix needs a model
// to make again something saved with the dream (needs_model_step: a floor plan, a reading of what
// lasts) are counted, and shown apart: no change to the code alone can meet them here.
//
// Results go to runs/prompt-cases/<label>.json. Nothing is drawn and the engine is never called.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Blocking } from '../blocking';
import { type CutPlan, shotPlan } from '../continuity';
import type { JevFn, Question } from '../jev';
import { imagesOf, type Rebuilt, type RebuiltPicture, rebuild, standIn } from '../plan';
import { type Moment, moments } from '../producer';
import type { Session } from '../session';
import { commitOf, DIR, type Inputs, inputsDiffer, sha256 } from './saved';

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

/**
 * A drawing of a moment: the story's own (drawn on the night, with today's routing then: the
 * mock-up as image 1 where the moment had a camera), or one of the three paired versions, which
 * differ only in image 1: the mock-up, an edit of the picture before, or none.
 */
export const DRAWS = ['story', 'mockup', 'edit', 'free'] as const;
export type Draw = (typeof DRAWS)[number];

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
  /** The step of HARNESS_PLAN.md whose eval this case is. */
  step: string;
  /** The fault is the image model's alone: nothing in the preparation could prevent it. */
  model_only?: boolean;
  /** Why the note is not taken as a fault of the preparation (it disagrees with the dream as told). */
  set_aside?: string;
  /** Why the pictures do not settle the cause: the case is shown, not counted. */
  hypothesis?: string;
  /** What only a model can make again to meet it (the fact is nowhere in the saved dream): counted, shown apart. */
  needs_model_step?: string;
  session: string;
  moment: string;
  source: Source;
  /** The person's own note on that picture, word for word; null where they wrote none. */
  note: string | null;
  /** Other pictures of the same moment where the person noted the same fault. */
  also?: (Source & { note: string | null })[];
  /** The person's verdict on every drawing of the moment: the story's and the paired versions'. */
  verdicts: Partial<Record<Draw, 'right' | 'partly' | 'wrong'>>;
  /** The drawings the fault was seen in (the source and `also`). */
  seen_in: Draw[];
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
    if (!/^S\d+$/.test(c.step ?? '')) out.push(`${at}: step must be one of HARNESS_PLAN.md's (S1, S4 …)`);
    if (!/^dream-\d{4}-\d{6}-[0-9a-f]{4}$/.test(c.session ?? ''))
      out.push(`${at}: session ${c.session} is not a saved dream's id`);
    if (!/^m\d+$/.test(c.moment ?? '')) out.push(`${at}: moment ${c.moment} is not a moment id`);
    if (!c.source?.file || !c.source.row) out.push(`${at}: no source`);
    if (c.note === undefined) out.push(`${at}: note must be the person's words or null`);
    if (c.kind === 'failing' && c.note === null && !c.fault_from)
      out.push(`${at}: no note, so fault_from must say where the fault was read`);
    if (!c.fault) out.push(`${at}: no fault`);
    if (c.kind === 'passing' && (c.model_only || c.set_aside || c.hypothesis || c.needs_model_step))
      out.push(`${at}: a passing case is never model_only, set aside, a hypothesis or waiting on a model`);
    if (!Array.isArray(c.seen_in) || c.seen_in.some((d) => !DRAWS.includes(d)))
      out.push(`${at}: seen_in lists drawings (${DRAWS.join(', ')})`);
    if (!c.verdicts || Object.keys(c.verdicts).some((d) => !DRAWS.includes(d as Draw)))
      out.push(`${at}: verdicts are by drawing`);
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
        for (const k of ['expect', 'not'])
          for (const h of args[k] === undefined ? [] : Array.isArray(args[k]) ? args[k] : [args[k]])
            if (!(h in HEADINGS)) out.push(`${at} #${i}: ${String(h)} is not a heading (${Object.keys(HEADINGS)})`);
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
  // What is so of each one now: still so from earlier, or, made from the story record, at this moment.
  ['still', /^(?:Still so from earlier|How each one is at this moment)/],
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
  /** The floor plan the moment is shot on, where it has one. */
  floor?: Blocking;
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
    // The floor plan the harness shoots it on: with the story record, as the record has it.
    floor: shotPlan(r.b, moment, r.rec),
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
const spotOf = (c: Ctx, id: string) => c.floor?.spots.find((s) => s.id === id);

/** A moving thing's way across the picture, as a sentence says it: a verb of moving, then where to. */
const MOVING =
  '(?:drives?|driving|heads?|heading|moves?|moving|travels?|travell?ing|rolls?|rolling|goes|going|comes?|coming|runs?|running|pulls?|pulling)';
export const HEADINGS = {
  away: new RegExp(
    `\\b${MOVING}\\b[^.;]*\\b(?:away from the camera|away from us|into the picture|into the distance|toward the windshield|towards the windshield)`,
    'i',
  ),
  toward: new RegExp(
    `\\b${MOVING}\\b[^.;]*\\b(?:toward the camera|towards the camera|at the camera|toward us|towards us|out of the picture)`,
    'i',
  ),
  left: new RegExp(
    `\\b${MOVING}\\b[^.;]*\\b(?:toward the left|towards the left|to the left|from right to left|from the right of the picture toward the left)`,
    'i',
  ),
  right: new RegExp(
    `\\b${MOVING}\\b[^.;]*\\b(?:toward the right|towards the right|to the right|from left to right|from the left of the picture toward the right)`,
    'i',
  ),
};
export type Heading = keyof typeof HEADINGS;
const OPPOSITE: Record<Heading, Heading> = { away: 'toward', toward: 'away', left: 'right', right: 'left' };

/**
 * The checks a case may name. Each is general (who is in view, how many images say who someone
 * is, where the floor plan puts something, what a part of the prompt says); what it is asked about
 * comes from the case.
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
  /** The floor plan's mock-up is not image 1. */
  no_mockup: (c: Ctx): CheckResult => {
    const m = c.refs.find((x) => x.source === 'mockup');
    return { pass: !m, detail: m ? `image ${m.index} is the mock-up` : 'no mock-up' };
  },
  /** Who and what the picture shows (what it lists and what its worked-out view has in it). */
  in_view: (c: Ctx, a: { who: string }): CheckResult => ({
    pass: c.shown.has(a.who),
    detail: `${nameOf(c, a.who)} ${c.shown.has(a.who) ? 'is' : 'is not'} in view (shown: ${[...c.shown].join(', ')})`,
  }),
  not_in_view: (c: Ctx, a: { who: string }): CheckResult => ({
    pass: !c.shown.has(a.who),
    detail: `${nameOf(c, a.who)} ${c.shown.has(a.who) ? 'is' : 'is not'} in view (shown: ${[...c.shown].join(', ')})`,
  }),
  /**
   * Not placed on the moment's floor plan: what is seen only out past the place (the tractor in the
   * field below the window) may be in the picture, far off, but never standing in the place.
   */
  not_on_floor_plan: (c: Ctx, a: { who: string }): CheckResult => {
    const s = spotOf(c, a.who);
    const out = c.floor?.outside?.[a.who];
    return {
      pass: !s,
      detail: s
        ? `${nameOf(c, a.who)} stands on the plan at (${s.x}, ${s.y})`
        : out
          ? `off the plan, seen out past the place (${out})`
          : 'off the plan',
    };
  },
  /** On the floor plan, the thing is held or carried by this person. */
  held_by: (c: Ctx, a: { who: string; by: string }): CheckResult => {
    const s = spotOf(c, a.who);
    return {
      pass: s?.heldBy === a.by,
      detail: !s
        ? `${nameOf(c, a.who)} is not on the plan`
        : s.heldBy
          ? `held by ${nameOf(c, s.heldBy)}`
          : `held by no one, at (${s.x}, ${s.y})`,
    };
  },
  /** On the floor plan, this person faces one of these (a spot's id). */
  faces: (c: Ctx, a: { who: string; toward: string[] }): CheckResult => {
    const s = spotOf(c, a.who);
    return {
      pass: !!s?.faces && list(a.toward).includes(s.faces),
      detail: s ? `faces ${s.faces ?? 'the front'}` : `${nameOf(c, a.who)} is not on the plan`,
    };
  },
  /** On the floor plan, the two face each other. */
  faces_each_other: (c: Ctx, a: { a: string; b: string }): CheckResult => {
    const x = spotOf(c, a.a);
    const y = spotOf(c, a.b);
    return {
      pass: x?.faces === a.b && y?.faces === a.a,
      detail: `${a.a} faces ${x?.faces ?? 'nothing on the plan'}, ${a.b} faces ${y?.faces ?? 'nothing on the plan'}`,
    };
  },
  /**
   * The prompt says which way something moving goes across the picture (away from the camera, toward
   * it, to the left, to the right), and never the opposite way (or any way in `not`).
   */
  heading_said: (c: Ctx, a: { expect: Heading; not?: Heading[] }): CheckResult => {
    const said = c.p.prompt.match(HEADINGS[a.expect]);
    const against = (a.not ?? [OPPOSITE[a.expect]])
      .map((h) => ({ h, m: c.p.prompt.match(HEADINGS[h]) }))
      .filter((x) => x.m);
    return {
      pass: !!said && !against.length,
      detail: [
        said ? `says ${a.expect}: "${said[0].slice(0, 100)}"` : `never says it goes ${a.expect}`,
        ...against.map((x) => `says ${x.h}: "${x.m![0].slice(0, 100)}"`),
      ].join('; '),
    };
  },
  /** The sketch of who or what it is says this part of its look (its wardrobe, its appearance …), matching `pattern` if given. */
  look_has: (c: Ctx, a: { who: string; field: string; pattern?: string }): CheckResult => {
    const it = c.r.sheets.find((s) => s.id === a.who);
    const value = it?.fields[a.field]?.value ?? '';
    const ok = !!value.trim() && (!a.pattern || re(a.pattern).test(value));
    return {
      pass: ok,
      detail: !it ? `${a.who} has no sketch` : value ? `${a.field}: "${value.slice(0, 120)}"` : `no ${a.field} said`,
    };
  },
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
   * makes or one still so from earlier. Where the plan holds none, `text` counts only where a
   * prompt says what is still so from earlier: a word anywhere else ("flooded with warm light")
   * is not a state carried.
   */
  state_carried: (c: Ctx, a: { who: string; what?: string; now?: string; text?: string }): CheckResult => {
    const hit = statesOf(c.cut).find(
      (st) => st.who === a.who && (!a.what || re(a.what).test(st.what)) && (!a.now || re(a.now).test(st.now)),
    );
    if (hit) return { pass: true, detail: `${hit.who}'s ${hit.what}: ${hit.now}` };
    const said = a.text ? (c.sections.still ?? '').match(re(a.text)) : null;
    const held = statesOf(c.cut).map((st) => `${st.who}'s ${st.what}: ${st.now}`);
    return {
      pass: !!said,
      detail: said
        ? `not in the plan, but said as still so: "${said[0]}"`
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
  no_mockup: { required: [], optional: [] },
  in_view: { required: ['who'], optional: [] },
  not_in_view: { required: ['who'], optional: [] },
  not_on_floor_plan: { required: ['who'], optional: [] },
  held_by: { required: ['who', 'by'], optional: [] },
  faces: { required: ['who', 'toward'], optional: [] },
  faces_each_other: { required: ['a', 'b'], optional: [] },
  heading_said: { required: ['expect'], optional: ['not'] },
  look_has: { required: ['who', 'field'], optional: ['pattern'] },
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

/**
 * The Jev model the evals ask, by name: "jev-latest" answered as jev-1.13.0 on 26 Sep, and would move
 * with Jev's next release, and every cached answer with it.
 */
export const JEV_MODEL = () => process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';

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

/** Jev's answers so far, by the hash of the model, the question as asked and the prompt. */
export type JevCache = Record<string, { p: number; model: string; served?: string; at: string }>;

/** The key of one answer: the model asked, the question exactly as sent (its instructions and criteria), the prompt. */
export const askKey = (prompt: string, question: string, model = JEV_MODEL()) =>
  sha256(`${model}\n${JSON.stringify(askQuestion(question))}\n\n${prompt}`);

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
 * answer depends only on its prompt and question. Answers land in the cache; failures, and answers
 * from another model than the one named, are returned.
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
      if (a?.type !== 'noul') {
        errors.push(`${x.question.slice(0, 60)}…: ${call.error ?? 'no answer'}`);
        continue;
      }
      if (call.model && call.model !== model) errors.push(`answered by ${call.model}, not ${model}`);
      cache[key] = { p: a.noul, model, ...(call.model ? { served: call.model } : {}), at: new Date().toISOString() };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return [...new Set(errors)];
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
  step: string;
  model_only: boolean;
  set_aside: boolean;
  hypothesis: boolean;
  needs_model_step: boolean;
  session: string;
  moment: string;
  /** Every expectation met; null when one is unanswered and none failed. */
  pass: boolean | null;
  expectations: ExpectationResult[];
  /** Where the dream keeps what was really sent: the images sent, when the rebuild attaches others. */
  sent_images?: { sent: string[]; rebuilt: string[] };
  error?: string;
};

/** Whether a case counts toward the pass rates. */
export const counted = (r: Pick<CaseResult, 'model_only' | 'set_aside' | 'hypothesis'>) =>
  !r.model_only && !r.set_aside && !r.hypothesis;

/** A case's result from its checks and Jev's answers (those not in the cache are unanswered). */
export function judgeCase(c: PromptCase, ctx: Ctx | Error, cache: JevCache): CaseResult {
  const head = {
    id: c.id,
    kind: c.kind,
    class: c.class,
    step: c.step,
    model_only: !!c.model_only,
    set_aside: !!c.set_aside,
    hypothesis: !!c.hypothesis,
    needs_model_step: !!c.needs_model_step,
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
export type Totals = Record<
  string,
  { failing: Tally; model_step: Tally; passing: Tally; hypothesis: Tally; out: Tally }
>;

/**
 * Per class: failing and passing cases in the pass rates (the failing ones that need a model step
 * also counted apart), hypotheses, and those kept out (model_only, set aside).
 */
export function totalsOf(results: CaseResult[]): Totals {
  const out: Totals = {};
  const empty = (): Tally => ({ cases: 0, pass: 0, unknown: 0 });
  const add = (t: Tally, r: CaseResult) => {
    t.cases++;
    if (r.pass === true) t.pass++;
    if (r.pass === null) t.unknown++;
  };
  for (const r of results) {
    const t = (out[r.class] ??= {
      failing: empty(),
      model_step: empty(),
      passing: empty(),
      hypothesis: empty(),
      out: empty(),
    });
    if (r.model_only || r.set_aside) add(t.out, r);
    else if (r.hypothesis) add(t.hypothesis, r);
    else if (r.kind === 'passing') add(t.passing, r);
    else {
      add(t.failing, r);
      if (r.needs_model_step) add(t.model_step, r);
    }
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
  /** What the run read: the case file and every dream, by hash. */
  inputs: Inputs;
  totals: Totals;
  cases: CaseResult[];
};

export type Comparison = {
  better: string[];
  worse: string[];
  /** Answered now, not before, or the other way. */
  unsure: string[];
  /** Expectations whose result or whose Jev answer moved, case by case. */
  moved: string[];
  /** Where the two runs read different inputs. */
  warnings: string[];
  lines: string[];
};

/** What changed between an earlier run and this one: inputs, cases, the checks and answers inside them, classes. */
export function compare(before: RunFile, now: RunFile): Comparison {
  const was = new Map(before.cases.map((c) => [c.id, c]));
  const better: string[] = [];
  const worse: string[] = [];
  const unsure: string[] = [];
  const moved: string[] = [];
  const mark = (p: boolean | null) => (p === true ? 'met' : p === false ? 'not met' : 'unanswered');
  for (const c of now.cases) {
    const b = was.get(c.id);
    if (!b) continue;
    if (b.pass !== c.pass) {
      if (b.pass === false && c.pass === true) better.push(c.id);
      else if (b.pass === true && c.pass === false) worse.push(c.id);
      else unsure.push(c.id);
    }
    c.expectations.forEach((e, i) => {
      const x = b.expectations[i];
      if (!x || (x.check ?? x.question) !== (e.check ?? e.question)) return;
      const score = e.p !== undefined && x.p !== undefined ? ` (${x.p.toFixed(2)} -> ${e.p.toFixed(2)})` : '';
      if (x.pass !== e.pass || (score && Math.abs((e.p ?? 0) - (x.p ?? 0)) >= CLOSE))
        moved.push(`${c.id} #${i} ${e.check ?? `ask: ${e.question}`}: ${mark(x.pass)} -> ${mark(e.pass)}${score}`);
    });
  }
  const warnings = inputsDiffer(before.inputs, now.inputs);
  const lines = [`against ${before.label} (${before.commit ?? '?'}, ${before.at}):`];
  for (const w of warnings) lines.push(`  warning: ${w}`);
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
  if (moved.length) lines.push('  moved:', ...moved.map((m) => `    ${m}`));
  if (!better.length && !worse.length && !unsure.length && !moved.length) lines.push('  no case changed');
  return { better, worse, unsure, moved, warnings, lines };
}

const pct = (a: number, b: number) => `${a}/${b}${b ? ` (${Math.round((100 * a) / b)}%)` : ''}`;

/** The table printed at the end of a run. */
export function totalsLines(t: Totals): string[] {
  const sum = (k: keyof Totals[string]) =>
    Object.values(t).reduce(
      (a, x) => ({ cases: a.cases + x[k].cases, pass: a.pass + x[k].pass, unknown: a.unknown + x[k].unknown }),
      { cases: 0, pass: 0, unknown: 0 },
    );
  const cell = (x: Tally) => (x.cases ? `${pct(x.pass, x.cases)}${x.unknown ? ` ?${x.unknown}` : ''}` : '-');
  const row = (name: string, x: Totals[string]) =>
    `${name.padEnd(20)} ${cell(x.failing).padEnd(16)} ${cell(x.model_step).padEnd(16)} ${cell(x.passing).padEnd(16)} ${cell(x.hypothesis).padEnd(16)} ${cell(x.out)}`;
  const lines = [
    `${'class'.padEnd(20)} ${'failing met'.padEnd(16)} ${'(model step)'.padEnd(16)} ${'passing met'.padEnd(16)} ${'hypotheses'.padEnd(16)} kept out`,
  ];
  for (const k of CLASSES) if (t[k]) lines.push(row(k, t[k]));
  lines.push(
    row('all', {
      failing: sum('failing'),
      model_step: sum('model_step'),
      passing: sum('passing'),
      hypothesis: sum('hypothesis'),
      out: sum('out'),
    }),
  );
  return lines;
}

export const RUNS = join(DIR, 'runs', 'prompt-cases');

// ── the command ──────────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  // Nothing here draws or reaches the engine: a rebuild only writes prompts, and Jev only reads them.
  const { jevAvailable, jevWithModel } = await import('../jev');
  const { loadDream, switches } = await import('./saved');
  const { sentOf } = await import('./corpus');
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
  const step = valueOf('--step');
  const only = listOf('--only');
  const show = args.includes('--show');
  const noAsk = args.includes('--no-ask');
  const live = args.includes('--live');

  const all = loadCases();
  const unknown = only.filter((id) => !all.some((c) => c.id === id));
  if (unknown.length) {
    console.error(`no such case: ${unknown.join(', ')}`);
    process.exit(1);
  }
  const cases = all.filter((c) => (!only.length || only.includes(c.id)) && (!step || c.step === step));

  // Every dream rebuilt once, as plan.ts rebuilds it.
  const dreams = new Map<string, { r: Rebuilt | Error; hash: string; sent: ReturnType<typeof sentOf> }>();
  for (const id of new Set(cases.map((c) => c.session))) {
    const d = loadDream(id, live);
    let r: Rebuilt | Error;
    try {
      r = rebuild(d.session as Session);
    } catch (e) {
      r = e instanceof Error ? e : new Error(String(e));
    }
    dreams.set(id, { r, hash: d.hash, sent: sentOf(d.session) });
  }
  const ctxOf = (c: PromptCase): Ctx | Error => {
    const r = dreams.get(c.session)?.r;
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
    const errors = await askAll(asks, jevWithModel(JEV_MODEL()), cache);
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 1)}\n`);
    console.log(`Jev (${JEV_MODEL()}): ${Object.keys(cache).length - before} questions asked, the rest from the cache`);
    for (const e of errors) console.log(`Jev: ${e}`);
  } else if (asks.some((x) => !cache[askKey(x.prompt, x.question)]))
    console.log(
      noAsk
        ? '--no-ask: questions not in the cache are left unanswered'
        : 'no JEV_API_KEY: questions not in the cache are left unanswered (run with --env-file)',
    );

  const results = cases.map((c) => {
    const ctx = ctxOf(c);
    const r = judgeCase(c, ctx, cache);
    // What was really sent, where the dream keeps it: a rebuild takes every sketch and earlier picture
    // as drawn, and the night did not always have them.
    const sent = dreams.get(c.session)?.sent[c.moment];
    if (sent && !(ctx instanceof Error)) {
      const rebuilt = imagesOf(ctx.r, ctx.p);
      if (JSON.stringify(rebuilt) !== JSON.stringify(sent.images)) r.sent_images = { sent: sent.images, rebuilt };
    }
    return r;
  });
  for (const r of results) {
    const c = cases.find((x) => x.id === r.id)!;
    const mark = r.pass === true ? 'MET ' : r.pass === false ? 'FAIL' : ' ?  ';
    const tag = r.model_only
      ? ' [model only]'
      : r.set_aside
        ? ' [set aside]'
        : r.hypothesis
          ? ' [hypothesis]'
          : r.needs_model_step
            ? ' [needs a model step]'
            : '';
    console.log(`${mark} ${r.kind.padEnd(7)} ${r.step.padEnd(3)} ${r.class.padEnd(19)} ${r.id}${tag}`);
    if (r.error) console.log(`       error: ${r.error}`);
    for (const e of r.expectations)
      if (e.pass !== true || e.close || show)
        console.log(
          `       ${e.pass === true ? 'ok' : e.pass === false ? 'x ' : '? '} ${e.kind === 'code' ? `${e.check}: ${e.says}` : `ask (${e.expect}): ${e.question}`} -> ${e.detail}`,
        );
    if (r.sent_images && show)
      console.log(
        `       images sent: ${r.sent_images.sent.join(', ')}\n       images now:  ${r.sent_images.rebuilt.join(', ')}`,
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
    inputs: {
      from: live ? 'live' : 'frozen',
      cases: sha256(readFileSync(CASES_FILE, 'utf8')),
      dreams: Object.fromEntries([...dreams].map(([id, d]) => [id, d.hash])),
    },
    totals: totalsOf(results),
    cases: results,
  };
  console.log(
    `\n${label}: ${cases.length} cases${only.length || step ? ' (a subset)' : ''}, dreams read ${run.inputs.from}`,
  );
  for (const l of totalsLines(run.totals)) console.log(l);
  const close = results.filter((r) => r.expectations.some((e) => e.close)).map((r) => r.id);
  if (close.length) console.log(`answers close to the bar, in: ${close.join(', ')}`);
  const other = results.filter((r) => r.sent_images).map((r) => r.id);
  if (other.length)
    console.log(
      `rebuilt with other images than were sent that night (a rebuild takes every sketch and earlier picture as drawn): ${other.join(', ')}`,
    );
  const file = join(RUNS, `${label}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 1)}\n`);
  console.log(`\nwritten ${file}`);
  if (against) {
    const path = join(RUNS, `${against}.json`);
    if (!existsSync(path)) console.log(`no run labelled ${against} (${path})`);
    else for (const l of compare(JSON.parse(readFileSync(path, 'utf8')) as RunFile, run).lines) console.log(l);
  }
}
