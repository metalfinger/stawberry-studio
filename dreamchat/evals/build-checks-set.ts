// Builds the labelled set every Jev check is measured on (S7, evals/jev-checks.ts): the 122 pictures the
// owner judged, each with what a check would have read before it was drawn, and the owner's verdict.
//
//   DREAMCHAT_DATA=<dreamchat folder with runs/paired/results.json> bun run evals/build-checks-set.ts
//
// - The 62 pictures drawn on the nights of 25-26 Sep (evals/story-pictures.json): the prompt as it was
//   sent (the frozen dreams keep it, evals/sources), the shot "storyboard complete?" read and its readings
//   as logged then, the camera's facts as the floor plan kept them (`looks`, planFacts' reading), and the
//   owner's verdict and note.
// - The 60 pictures of the paired test (evals/paired-verdicts.json): the prompt each was drawn from, which
//   the test kept in runs/paired/results.json (not in the repository: it is frozen here), and the owner's
//   verdict and note. The three pictures of a moment differ only in image 1.
// - Per moment, its tags and the facts routed questions are asked one by one (each held thing, each change
//   carried), from today's cut sheet: the frozen dream rebuilt as plan.ts rebuilds it, with the story record
//   on and the sheet in shadow, without the implied readings (their writer is a model). Today's plan of a
//   moment can differ from the night's: its prompt is the night's, its tags are today's.
// - Per picture, the faults the owner's note was classified as (evals/prompt-cases.json, S0), and the split:
//   the five dreams the picture judge was written from (tune) against the five it was run on blind (held
//   out), as evals/picture-judge.md did it. A threshold is only ever chosen on the tune pictures.
//
// Written to evals/checks-set.json. Nothing is asked of any model.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CutFacts, cutFactsOf } from '../checks';
import { tagWords } from '../cutsheet';
import { actsWhenLogging, sha } from '../gate';
import { rebuild } from '../plan';
import { moments as momentsOf } from '../producer';
import type { Session } from '../session';
import { dataDir, loadDream } from './saved';

process.env.DREAMCHAT_RECORD = 'on';
process.env.DREAMCHAT_CUT_SHEET = 'shadow';

/** The picture judge was written from the owner's notes on these five dreams, and run blind on the rest. */
export const TUNE = ['lighthouse-fresh', 'library-2', 'snow-train', 'orchard', 'night-market'];

type Verdict = 'right' | 'partly' | 'wrong';

export type SetMoment = {
  run: string;
  session: string;
  moment: string;
  action: string;
  /** The routed questions' input, from today's cut sheet (null where the moment did not rebuild). */
  facts: CutFacts | null;
  tags: string[];
  /** "Storyboard complete?" as it read the moment before it was drawn: its exact state, and its readings. */
  shot: { state: string; readings: { q: string; p: number }[] } | null;
  /** What the camera faces on the floor plan the picture was drawn from, as planFacts read it then. */
  looks: string | null;
  looks_at: string | null;
  /**
   * The continuity plan's own warnings for this picture (carried in words only, several changes at once,
   * no visible action), from today's plan: with the checks acting they hold it as the gate does.
   */
  issues: string[];
};

export type SetPicture = {
  id: string;
  kind: 'story' | 'paired';
  /** The story's own drawing, or the paired version's image 1. */
  draw: 'story' | 'mockup' | 'edit' | 'free';
  run: string;
  session: string;
  moment: string;
  split: 'tune' | 'held_out';
  verdict: Verdict;
  note: string | null;
  /** The owner's faults on this picture as S0 classified them, with the case and whether it is counted. */
  faults: { class: string; case: string; counted: boolean }[];
  /** The prompt as sent; a story picture's is read from its frozen dream (null here), checked by its hash. */
  prompt: string | null;
  prompt_sha: string;
  /** Its images, in order, as "role name". */
  images: string[];
  /**
   * The shot "storyboard complete?" read is the one this picture was drawn from: its view is in the prompt
   * word for word. Where it is not (a camera placed again after the check; a prompt that says the shot as
   * its brief, or through the dreamer's eyes in other words), the reading is of another shot, or cannot be
   * told to be this one, and it is left out of the storyboard's measure.
   */
  same_shot: boolean;
  /** The picture judge's verdict (evals/picture-judge.md), for comparison. */
  judge: Verdict | null;
};

export type ChecksSet = {
  about: string;
  split: { tune: string[]; held_out: string[] };
  moments: Record<string, SetMoment>;
  pictures: SetPicture[];
};

type StoryRow = {
  id: string;
  run: string;
  session: string;
  moment: string;
  action: string;
  human: Verdict;
  human_note?: string;
  judge?: Verdict;
  readings: { q: string; p: number }[];
  state: string;
};
type PairedRow = {
  id: string;
  versions: Record<string, { way: 'mockup' | 'edit' | 'free'; human: Verdict; human_note?: string; judge?: Verdict }>;
};
type Case = {
  id: string;
  kind: 'failing' | 'passing';
  class: string;
  model_only?: boolean;
  set_aside?: string;
  hypothesis?: string;
  source: { file: string; row: string; version?: string };
  also?: { file: string; row: string; version?: string }[];
};
type PairedEntry = { prompt: string; images: { n: number; role: string; key: string }[] };

const EVALS = import.meta.dir;
const json = <T>(name: string) => JSON.parse(readFileSync(join(EVALS, name), 'utf8')) as T;

/** Whether a prompt carries, word for word, the shot a storyboard reading was of. */
export function drawnFromShot(prompt: string, state: string): boolean {
  let shot: unknown;
  try {
    shot = (JSON.parse(state) as { shot?: unknown }).shot;
  } catch {
    return false;
  }
  const flat = (x: string) => x.replace(/\s+/g, ' ').trim();
  return typeof shot === 'string' && !!shot.trim() && flat(prompt).includes(flat(shot));
}

if (import.meta.main) {
  const story = json<{ rows: StoryRow[] }>('story-pictures.json').rows;
  const paired = json<{ rows: PairedRow[] }>('paired-verdicts.json').rows;
  const cases = json<{ cases: Case[] }>('prompt-cases.json').cases;
  const results = JSON.parse(
    readFileSync(join(process.env.DREAMCHAT_DATA ?? dataDir(), 'runs', 'paired', 'results.json'), 'utf8'),
  ) as { entries: Record<string, PairedEntry> };

  // Each picture's faults, by where S0 found them: a case's own picture and the others it names.
  const pictureOf = (s: { file: string; row: string; version?: string }) => {
    if (s.file === 'story-pictures.json') return s.row;
    const row = paired.find((r) => r.id === s.row);
    const way = s.version ? row?.versions[s.version]?.way : undefined;
    return way ? `${s.row}-${way}` : null;
  };
  const faults = new Map<string, SetPicture['faults']>();
  for (const c of cases.filter((x) => x.kind === 'failing'))
    for (const src of [c.source, ...(c.also ?? [])]) {
      const id = pictureOf(src);
      if (!id) continue;
      const counted = !c.model_only && !c.set_aside && !c.hypothesis;
      faults.set(id, [...(faults.get(id) ?? []), { class: c.class, case: c.id, counted }]);
    }

  const runOf = new Map(story.map((r) => [r.run, r.session]));
  const moments: Record<string, SetMoment> = {};
  const sent = new Map<string, { prompt: string; images: string[] }>();
  for (const [run, session] of runOf) {
    const d = loadDream(session, false).session as Session & {
      build?: { frames?: { id: string; sent?: { prompt: string; images: string[] } }[] };
    };
    for (const f of d.build?.frames ?? []) if (f.sent) sent.set(`${session}/${f.id}`, f.sent);
    let r: ReturnType<typeof rebuild> | null = null;
    try {
      r = rebuild(d);
    } catch (e) {
      console.error(`${run}: did not rebuild (${String(e).slice(0, 200)})`);
    }
    const b = d.draft?.breakdown;
    const ms = b ? momentsOf(b) : [];
    for (const row of story.filter((x) => x.run === run)) {
      const pic = r?.pictures.find((p) => p.kind === 'cut' && p.id === row.moment);
      const m = ms.find((x) => x.id === row.moment);
      const scene = b?.scenes.find((sc) => sc.moments.some((x) => x.id === row.moment));
      const plan = scene?.blocking;
      const place = m?.place && plan?.places?.[m.place] ? plan.places[m.place] : plan;
      const order = pic?.item.frame?.order;
      const issues = order
        ? (r?.plan.issues ?? []).filter(
            (x) => (x.startsWith(`picture ${order} `) || x.startsWith(`picture ${order}:`)) && !actsWhenLogging(x),
          )
        : [];
      moments[`${session}/${row.moment}`] = {
        run,
        session,
        moment: row.moment,
        action: row.action,
        facts: pic?.sheet ? cutFactsOf(pic.sheet) : null,
        tags: pic?.sheet ? tagWords(pic.sheet.tags) : [],
        shot: row.state ? { state: row.state, readings: row.readings } : null,
        looks: (place?.looks?.[row.moment] as string | undefined) ?? null,
        looks_at: m?.looks_at ?? null,
        issues,
      };
    }
  }

  const pictures: SetPicture[] = [];
  const splitOf = (run: string): SetPicture['split'] => (TUNE.includes(run) ? 'tune' : 'held_out');
  for (const row of story) {
    const s = sent.get(`${row.session}/${row.moment}`);
    if (!s) throw new Error(`${row.id}: its frozen dream keeps no prompt as sent`);
    pictures.push({
      id: row.id,
      kind: 'story',
      draw: 'story',
      run: row.run,
      session: row.session,
      moment: row.moment,
      split: splitOf(row.run),
      verdict: row.human,
      note: row.human_note ?? null,
      faults: faults.get(row.id) ?? [],
      prompt: null,
      prompt_sha: sha(s.prompt),
      images: s.images,
      same_shot: !!row.state && drawnFromShot(s.prompt, row.state),
      judge: row.judge ?? null,
    });
  }
  for (const row of paired) {
    const run = row.id.replace(/-m\d+$/, '');
    const session = runOf.get(run);
    const moment = row.id.match(/-(m\d+)$/)?.[1];
    if (!session || !moment) throw new Error(`${row.id}: no dream`);
    const shot = moments[`${session}/${moment}`]?.shot;
    for (const v of Object.values(row.versions)) {
      const id = `${row.id}-${v.way}`;
      const e = results.entries[id];
      if (!e) throw new Error(`${id}: not in the paired results`);
      pictures.push({
        id,
        kind: 'paired',
        draw: v.way,
        run,
        session,
        moment,
        split: splitOf(run),
        verdict: v.human,
        note: v.human_note ?? null,
        faults: faults.get(id) ?? [],
        prompt: e.prompt,
        prompt_sha: sha(e.prompt),
        images: e.images.map((i) => `${i.role} ${i.key}`),
        same_shot: !!shot && drawnFromShot(e.prompt, shot.state),
        judge: v.judge ?? null,
      });
    }
  }

  const set: ChecksSet = {
    about:
      "The labelled set every Jev check is measured on (S7; built by evals/build-checks-set.ts, measured by evals/jev-checks.ts). One row per picture the owner judged: 62 drawn on the nights of 25-26 Sep (story) and 60 of the paired test (three per moment, differing only in image 1). verdict and note are the owner's own; faults are the owner's notes as S0 classified them (evals/prompt-cases.json); prompt is exactly what the image model was sent (for a story picture it is read from its frozen dream, evals/sources, and checked by prompt_sha, the hash session.ts logs as a reading's ref.prompt). Per moment: the shot and readings 'storyboard complete?' logged before the picture was drawn, what planFacts read the camera to face on the floor plan it was drawn from (looks), and today's tags and routed facts from the cut sheet (the frozen dream rebuilt with the story record on, without implied readings). split: tune is the five dreams the picture judge was written from, held_out the five it was run on blind; a threshold is only ever chosen on tune.",
    split: { tune: TUNE, held_out: [...runOf.keys()].filter((r) => !TUNE.includes(r)) },
    moments,
    pictures,
  };
  writeFileSync(join(EVALS, 'checks-set.json'), `${JSON.stringify(set, null, 1)}\n`);
  const count = (xs: SetPicture[]) =>
    `${xs.length} (${xs.filter((p) => p.verdict !== 'right').length} not right, ${xs.filter((p) => p.verdict === 'wrong').length} wrong)`;
  console.log(
    `checks-set.json: ${Object.keys(moments).length} moments (${Object.values(moments).filter((m) => m.facts).length} with a cut sheet); pictures ${count(pictures)}; tune ${count(pictures.filter((p) => p.split === 'tune'))}, held out ${count(pictures.filter((p) => p.split === 'held_out'))}; drawn from the shot checked: story ${pictures.filter((p) => p.kind === 'story' && p.same_shot).length}/${pictures.filter((p) => p.kind === 'story' && set.moments[`${p.session}/${p.moment}`]?.shot).length} with a reading, paired ${pictures.filter((p) => p.kind === 'paired' && p.same_shot).length}/60`,
  );
}
