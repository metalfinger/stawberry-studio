// The pure parts of a picture checkpoint (evals/checkpoint.ts): which moments a checkpoint draws again and
// why, each moment built as today's harness would send it (its prompt and every image, each mapped to the
// run's own file), what the old picture was drawn with, how much changed, the blind order of old and new,
// and what is left to draw under the checkpoint's cap. Nothing here draws, calls a model or opens the
// engine's store; a file is only looked for.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { sameView } from '../camera';
import type { GhostPlan } from '../continuity';
import { ghostName } from '../cutsheet';
import { type FrameReference, turnedInto } from '../frames';
import { actsWhenLogging, checkReferences, checksMode } from '../gate';
import { standsFor } from '../refs';
import { imageName, type Rebuilt, rebuild, standIn } from '../plan';
import { mediumOf, moments } from '../producer';
import { calledFor, previsFor, reconcileGhosts, type Session } from '../session';
import { type Item, MAX_PER_IMAGE } from '../sheets';
import type { AnswerKey, Answers } from './checkpoint-judge';
import { USD_PER_PICTURE } from './paired-arms';
import type { DreamParts, ToDraw } from './paired-store';
import { counted, type Draw, DRAWS, type PromptCase, type Source } from './prompt-cases';
import { sha256 } from './saved';

// ── the set ──────────────────────────────────────────────────────────────────────────────────────

/** Why a moment is in a checkpoint: a fault the step should put right, or a picture called right that must stay right. */
/**
 * Why a moment is in a set: a fault the owner called partly right or wrong, a guard he called right, or a pair, whose
 * old picture he never judged and which is drawn in this set's base checkpoint (`old.draw` 'base') to be judged beside
 * the new one.
 */
export type Why = 'fault' | 'guard' | 'pair';
export type Verdict = 'right' | 'partly' | 'wrong';

/** The old picture a moment is judged against: which drawing it is, the owner's verdict and note on it, and its file. */
export type OldPicture = {
  /** The row of the verdict file that holds the owner's verdict on it; none for a pair. */
  source: Source;
  /**
   * Drawn on the night (story), or one of the paired test's three versions; for a pair, `base`: drawn by the checkpoint
   * named in `from` under its own switches (the harness as it stands), or `none` in that base checkpoint itself.
   */
  draw: Draw | 'base' | 'none';
  /** The base checkpoint that draws a pair's old picture. */
  from?: string;
  /** The owner's verdict on it; null for a pair, whose old picture he has not judged. */
  verdict: Verdict | null;
  /** The owner's note on it, word for word; null where they wrote none. */
  note: string | null;
  /** Its file, relative to the dreamchat folder that keeps the saved conversations (or absolute). */
  picture: string;
  /**
   * Where its verdict and note are from when the owner has judged it since the row named: an earlier
   * checkpoint's answer, which then stands in place of the row's.
   */
  since?: string;
};

/** How much a moment's prompt and images changed: words and images taken out plus put in, and whether its mock-up renders otherwise. */
export type Change = { words: number; of: number; images: number; imagesOf: number; previs: boolean; share: number };

export type SetMoment = {
  /** As the verdict files name a moment, by its run and moment: `snow-train-m2`. */
  id: string;
  run: string;
  session: string;
  moment: string;
  why: Why;
  /** In words: the cases that put it here, and what each is about. */
  reason: string;
  cases: string[];
  old: OldPicture;
  /** The moment's line the owner judged the old picture against. */
  description: string;
  /** How much its prompt and images changed against the base when it was proposed. */
  change?: Change;
};

export type CheckpointSet = {
  about?: string;
  /** The checkpoint's name: its results are kept under runs/checkpoint/<name>. */
  name: string;
  /** The step of HARNESS_PLAN.md it checks. */
  step?: string;
  /** The most it may spend in all, in US dollars, as reviewed; --cap can only lower it. */
  cap_usd?: number;
  /**
   * Where its results are kept, whole (runs/checkpoint/<name> of the checkout that has the saved
   * conversations): what it has spent is counted there, so a draw anywhere else is refused.
   */
  results?: string;
  /** The switches it was proposed under, and what its changes were measured against. */
  switches?: Record<string, string>;
  base?: string;
  moments: SetMoment[];
};

const VERDICTS: Verdict[] = ['right', 'partly', 'wrong'];

/** Everything wrong with a set's shape, as lines; none when it is sound. */
export function validateSet(set: CheckpointSet): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(set.name ?? '')) out.push(`name ${set.name} must be lower-case letters, digits and -`);
  if (set.cap_usd !== undefined && !(typeof set.cap_usd === 'number' && Number.isFinite(set.cap_usd) && set.cap_usd > 0))
    out.push('cap_usd must be a number of US dollars, more than 0');
  if (set.results !== undefined && !(typeof set.results === 'string' && isAbsolute(set.results)))
    out.push('results must be the whole path of the folder its results are kept in');
  if (!Array.isArray(set.moments) || !set.moments.length) out.push('no moments');
  const seen = new Set<string>();
  const where = new Set<string>();
  for (const m of set.moments ?? []) {
    const at = m.id ?? '(no id)';
    if (!m.id) out.push(`${at}: no id`);
    if (seen.has(m.id)) out.push(`${at}: listed twice`);
    seen.add(m.id);
    if (where.has(`${m.session}:${m.moment}`)) out.push(`${at}: ${m.session} ${m.moment} is listed twice`);
    where.add(`${m.session}:${m.moment}`);
    if (m.why !== 'fault' && m.why !== 'guard' && m.why !== 'pair') out.push(`${at}: why must be fault, guard or pair`);
    if (!/^dream-\d{4}-\d{6}-[0-9a-f]{4}$/.test(m.session ?? '')) out.push(`${at}: session ${m.session} is not a saved dream's id`);
    if (!/^m\d+$/.test(m.moment ?? '')) out.push(`${at}: moment ${m.moment} is not a moment id`);
    if (!m.reason) out.push(`${at}: no reason`);
    if (!m.description) out.push(`${at}: no description of the moment`);
    const o = m.old;
    if (!o) {
      out.push(`${at}: no old picture`);
      continue;
    }
    // A pair: its old picture is drawn by a base checkpoint (or this is it), never judged before.
    if (m.why === 'pair') {
      if (o.draw !== 'base' && o.draw !== 'none') out.push(`${at}: a pair's old picture is drawn as base or none`);
      if (o.draw === 'base' && !/^[a-z0-9][a-z0-9-]*$/.test(o.from ?? ''))
        out.push(`${at}: a pair names its base checkpoint`);
      if (o.verdict !== null) out.push(`${at}: a pair's old picture has no verdict`);
      continue;
    }
    if (o.draw === 'base' || o.draw === 'none') out.push(`${at}: only a pair's old picture is drawn as base or none`);
    if (o.source?.file !== 'story-pictures.json' && o.source?.file !== 'paired-verdicts.json')
      out.push(`${at}: the old picture's verdict is from story-pictures.json or paired-verdicts.json`);
    if (o.source?.file === 'paired-verdicts.json' && !o.source.version) out.push(`${at}: a paired verdict names its version`);
    if (!DRAWS.includes(o.draw as Draw)) out.push(`${at}: draw must be one of ${DRAWS.join(', ')}`);
    if (!VERDICTS.includes(o.verdict as Verdict)) out.push(`${at}: verdict must be right, partly or wrong`);
    if (o.note === undefined) out.push(`${at}: note must be the owner's words or null`);
    if (!o.picture) out.push(`${at}: no file for the old picture`);
  }
  return out;
}

/** A set file, checked for shape. */
export function loadSet(path: string): CheckpointSet {
  const set = JSON.parse(readFileSync(path, 'utf8')) as CheckpointSet;
  const problems = validateSet(set);
  if (problems.length) throw new Error(`${path}:\n${problems.join('\n')}`);
  return set;
}

// ── the owner's verdicts ─────────────────────────────────────────────────────────────────────────

export type StoryRow = {
  id: string;
  run: string;
  session: string;
  moment: string;
  action: string;
  human: Verdict;
  human_note?: string;
  picture: string;
};
export type PairedRow = { id: string; versions: Record<string, { way: Draw; human: Verdict; human_note?: string }> };
export type PairedSetRow = { id: string; run: string; session: string; moment: string };
/** The verdict sources: the story's pictures, the paired versions, and which dream and moment each paired row is. */
export type Verdicts = { story: StoryRow[]; paired: PairedRow[]; pairedSet: PairedSetRow[] };

export function loadVerdicts(dir = import.meta.dir): Verdicts {
  const read = <T>(name: string) => (JSON.parse(readFileSync(join(dir, name), 'utf8')) as { rows: T[] }).rows;
  return {
    story: read<StoryRow>('story-pictures.json'),
    paired: read<PairedRow>('paired-verdicts.json'),
    pairedSet: read<PairedSetRow>('paired-set.json'),
  };
}

/**
 * One picture the owner has judged: the moment it is of, its file, his verdict and where he gave it (a
 * story verdict row, or an earlier checkpoint's answer, where not right is `wrong`).
 */
export type Judged = { moment: string; file: string; verdict: Verdict; where: string; note: string | null; checkpoint?: string };

/** The owner's verdicts on the pictures the runs drew (story-pictures.json), by their files under `data`. */
export const judgedInStory = (v: Pick<Verdicts, 'story'>, data: string): Judged[] =>
  v.story.map((r) => ({
    moment: r.moment,
    file: join(data, 'strawberry-home', 'media', r.picture),
    verdict: r.human,
    where: `story-pictures.json ${r.id}`,
    note: r.human_note ?? null,
  }));

/**
 * The owner's answers in an earlier checkpoint, as verdicts on the pictures he was shown: each moment's
 * old and new picture by the file its page copy was made from (judge/made.json), right when he called it
 * right (its letter, or both), else wrong. An unanswered moment says nothing.
 */
export function judgedInCheckpoint(
  name: string,
  x: {
    key: AnswerKey;
    answers: Pick<Answers, 'answers'>;
    made: Record<string, { from: string }>;
    results: Pick<Results, 'entries'>;
  },
): Judged[] {
  const out: Judged[] = [];
  for (const [id, k] of Object.entries(x.key)) {
    const given = x.answers.answers[id];
    const r = x.results.entries[id];
    if (!given?.answer || !r) continue;
    for (const which of ['old', 'new'] as AB[]) {
      const letter = k.a === which ? 'a' : 'b';
      const made = Object.entries(x.made).find(([to]) => to.startsWith(`img/${id}-${letter}.`))?.[1];
      if (!made) continue;
      const right = given.answer === 'both' || given.answer === letter;
      out.push({
        moment: r.moment,
        file: made.from,
        verdict: right ? 'right' : 'wrong',
        where: `checkpoint ${name}, ${id} (its ${which} picture; answered ${given.answer})`,
        note: given.note || null,
        checkpoint: name,
      });
    }
  }
  return out;
}

/** The owner's first verdict of wrong on a moment's picture, by its file; none where he never called it wrong. */
export const judgedWrong = (judged: Judged[], moment: string, file: string, only?: (j: Judged) => boolean) =>
  judged.find((j) => j.verdict === 'wrong' && j.moment === moment && resolve(j.file) === resolve(file) && (!only || only(j)));

/** What the paired test drew (evals/paired.ts results), by `<row>-<way>`. */
export type PairedResults = {
  entries: Record<
    string,
    { prompt: string; images: { role: string; key: string }[]; state: string; output?: string; copy?: string }
  >;
};

/** A path under `data` as relative to it; any other left as it is. */
const under = (data: string, path: string) => {
  const rel = relative(data, path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path;
};

/** A set's file of a picture, where it is on this machine. */
export const pictureFile = (data: string, picture: string) => (isAbsolute(picture) ? picture : join(data, picture));

/**
 * The old picture a verdict row names: the dream and moment it is of, the owner's verdict and note on it,
 * and its file (the story's in the dream chat's store; a paired version's original in the paired test's
 * store where its results keep one, else the copy beside them). `description` is the story row's line.
 */
export function oldPictureOf(
  source: Source,
  v: Verdicts,
  data: string,
  paired?: PairedResults | null,
): (OldPicture & { run: string; session: string; moment: string; description?: string }) | Error {
  if (source.file === 'story-pictures.json') {
    const r = v.story.find((x) => x.id === source.row);
    if (!r) return new Error(`story-pictures.json has no row ${source.row}`);
    return {
      source,
      draw: 'story',
      verdict: r.human,
      note: r.human_note ?? null,
      picture: `strawberry-home/media/${r.picture}`,
      run: r.run,
      session: r.session,
      moment: r.moment,
      description: r.action,
    };
  }
  const row = v.paired.find((x) => x.id === source.row);
  const version = row?.versions[source.version ?? ''];
  const where = v.pairedSet.find((x) => x.id === source.row);
  if (!row || !version || !where) return new Error(`paired-verdicts.json has no version ${source.version} of ${source.row}`);
  const drawn = paired?.entries[`${source.row}-${version.way}`];
  return {
    source,
    draw: version.way,
    verdict: version.human,
    note: version.human_note ?? null,
    picture: drawn?.output ? under(data, drawn.output) : `runs/paired/${source.row}-${version.way}.jpg`,
    run: where.run,
    session: where.session,
    moment: where.moment,
  };
}

/** A picture as sent: its prompt, and its images as "role name" (images named as the corpus names them). */
export type Sent = { prompt: string; images: string[] };

/**
 * What the old picture was drawn with: for the story's, what the frozen dream keeps of what was sent
 * that night; for a paired version, what the paired test sent (its in-between pictures named by what they
 * show). Null where it is not known.
 */
export function oldSentOf(
  old: Pick<OldPicture, 'source' | 'draw'>,
  moment: string,
  live: Pick<Session, 'build'>,
  frozen?: Pick<Session, 'build'> | null,
  paired?: PairedResults | null,
): Sent | null {
  if (old.draw === 'story') {
    const f = frozen?.build?.frames?.find((x) => x.id === moment) as (Item & { sent?: Sent }) | undefined;
    return f?.sent ?? null;
  }
  // A pair's old picture is drawn in its base checkpoint, which keeps what it sent.
  if (old.draw === 'base' || old.draw === 'none') return null;
  const e = paired?.entries[`${old.source.row}-${old.draw}`];
  if (!e) return null;
  const nameOf = (key: string) => {
    const [kind, id] = key.split(':');
    const g = kind === 'ghost' ? live.build?.frames?.find((x) => x.id === id && x.ghost)?.ghost : undefined;
    return g ? ghostName(g) : key;
  };
  return { prompt: e.prompt, images: e.images.map((im) => `${im.role} ${nameOf(im.key)}`) };
}

// ── a moment as today's harness would send it ────────────────────────────────────────────────────

/** A dream built as today's harness would draw it, and its in-between pictures matched to the run's own. */
export type DreamBuild = {
  saved: Session;
  r: Rebuilt;
  /** Today's plan with its in-between pictures known by the run's ids, as a plan made again renames them. */
  plan: Rebuilt['plan'];
  /** Today's in-between pictures, by the id rebuild gives them, to the run's picture of the same change. */
  runGhost: Map<string, string>;
};

/**
 * A saved dream rebuilt exactly as plan.ts rebuilds it (under the switches in force), and its in-between
 * pictures matched to those the run drew by what they show (session.ts reconcileGhosts, as a plan made
 * again matches them): only a match is the run's picture of today's change.
 */
export function buildDream(saved: Session): DreamBuild {
  const r = rebuild(saved);
  const frames = saved.build?.frames ?? [];
  const plan = reconcileGhosts(r.plan, frames);
  const drawn = new Set(frames.filter((f) => f.kind === 'ghost' && f.ghost).map((f) => f.id));
  const runGhost = new Map<string, string>();
  r.plan.ghosts.forEach((g, i) => {
    const id = plan.ghosts[i]?.id;
    if (id && drawn.has(id)) runGhost.set(g.id, id);
  });
  return { saved, r, plan, runGhost };
}

/** One image a moment attaches today, and the run's file for it. */
export type TodayImage = {
  n: number;
  role: FrameReference['role'];
  /** What it is, for the store: `sketch:p1`, `picture:m3`, `ghost:g1` (the run's own id), `previs:m5`. */
  key: string;
  /** As the corpus names it, to compare with what was sent: `sketch:p1`, `picture:m3`, `ghost:t1:lid`, `previs:m5`. */
  name: string;
  /** In words. */
  what: string;
  instruction: string;
  /**
   * The run's file for it; a mock-up has none until it is written, nor an earlier moment's new picture
   * (`dependsOn`) until it is drawn.
   */
  file?: string;
  /**
   * The set's id of the earlier moment whose picture drawn new in this checkpoint it is, as the harness
   * would draw from it: that moment is drawn first, and this image is known only then.
   */
  dependsOn?: string;
  /** Why it cannot be found or sent: then the moment is not drawn. */
  missing?: string;
};

/**
 * The moments of one dream the checkpoint draws new, by moment: the set's id for each, and its new
 * picture's file once drawn. A later moment of the dream draws from these, never from the run's.
 */
export type DrawnHere = Record<string, { id: string; file?: string }>;

/** The earlier moments whose new pictures a moment is drawn from, by the set's ids. */
export const dependsOf = (t?: Pick<Today, 'images'>): string[] => [
  ...new Set((t?.images ?? []).flatMap((x) => (x.dependsOn ? [x.dependsOn] : []))),
];

export type Today = {
  moment: string;
  name: string;
  /** What happens, as its words say. */
  action: string;
  prompt: string;
  images: TodayImage[];
  /** Its mock-up, rendered from its floor plan as the harness renders it. */
  previs?: { png: Uint8Array; key: string };
  /** The shot's brief it is drawn with, for the view today's plan has; null where it has none. */
  brief: { view: string; text: string } | null;
  /**
   * It has a worked-out view and no brief for it: the harness would have a model write one before it
   * draws (session.ts startFrame), so drawn without one it is not what the harness would send.
   */
  briefless: boolean;
  /** Why it cannot be drawn as today's harness would draw it; none when it can. */
  refused: string[];
  /** Where it may differ from what the harness would send, or what else is worth knowing; none stops it. */
  notes: string[];
  /** The hash of what would be sent: the prompt, each image (what it is, its role, its words, its file) and the mock-up. */
  hash: string;
};

const drawnItem = (x?: Item) => !!x && x.status === 'ready' && !!x.mediaPath;
/**
 * A sketch or picture the harness draws from: drawn, and approved by the dreamer or for continuity
 * (frames.ts `approved`); a picture the run drew and nobody approved is never attached.
 */
const usable = (x?: Item) => drawnItem(x) && (!!x?.review || !!x?.continuityApproved);

/** The words of a moment the harness puts in the third person with a model before it draws it (session.ts startFrame). */
export const YOU_WORDS = ['action', 'visual_point', 'feeling', 'purpose', 'shift', 'dream'];
const YOU = /\byou(r|rs|rself)?\b/i;

/**
 * One moment of a built dream as today's harness would send it: its prompt, and every image it attaches
 * mapped to the run's own file (its sketches, the earlier pictures it drew, the in-between pictures matched
 * to today's, the mock-up rendered from its floor plan now). An image that cannot be found (a sketch or an
 * in-between picture the run never drew, a file not on this machine) refuses the moment; so does a fault
 * the pre-draw check acts on even when it only logs. Nothing is ever drawn in a missing image's place.
 *
 * An earlier moment the checkpoint draws new (`here`) is drawn from as its new picture, as the harness
 * would: known once that picture is drawn, and in the hash as a dependency, not a file. An earlier picture
 * of the run the owner judged wrong (`judged`) is never sent: the moment is refused.
 */
export function todayOf(
  d: DreamBuild,
  moment: string,
  opts: { media: string; exists?: (path: string) => boolean; here?: DrawnHere; judged?: Judged[] },
): Today {
  const exists = opts.exists ?? existsSync;
  const { r, saved } = d;
  const p = r.pictures.find((x) => x.id === moment && x.kind === 'cut');
  if (!p) throw new Error(`${moment} is not a moment of ${r.title}`);
  const items = saved.build?.items ?? [];
  const frames = saved.build?.frames ?? [];
  const called = calledFor({ build: saved.build, draft: saved.draft && { ...saved.draft, breakdown: r.b } }, p.item);
  const previs = previsFor(r.b, p.item, called, r.rec);
  const found = (base: Omit<TodayImage, 'file' | 'missing'>, it: Item | undefined, never: string): TodayImage => {
    if (!drawnItem(it)) return { ...base, missing: never };
    if (!usable(it)) return { ...base, missing: 'the run drew it, but nobody approved it: the harness never draws from it' };
    const file = join(opts.media, it?.mediaPath as string);
    return exists(file) ? { ...base, file } : { ...base, missing: `its file is not on this machine (${file})` };
  };
  const images = p.references.map((ref, i): TodayImage => {
    const base = { n: i + 1, role: ref.role, instruction: ref.instruction, name: imageName(r, ref.media_id) };
    const sheet = r.sheets.find((x) => x.mediaId === ref.media_id);
    if (sheet) {
      const it = items.find((x) => x.id === sheet.id);
      const what = `sketch of ${it?.isDreamer ? 'the dreamer' : (it?.name ?? sheet.name)}`;
      return found({ ...base, key: `sketch:${sheet.id}`, what }, it, `the run never drew the ${what}`);
    }
    if (ref.media_id === standIn.previs(moment)) {
      const what = `the mock-up of ${moment}, rendered from its floor plan now${previs ? ` (sha256 ${previs.key.slice(0, 12)}…)` : ''}`;
      return previs
        ? { ...base, key: `previs:${moment}`, what }
        : { ...base, key: `previs:${moment}`, what, missing: 'no mock-up can be rendered from its floor plan' };
    }
    if (ref.media_id.startsWith(standIn.picture(''))) {
      const id = ref.media_id.slice(standIn.picture('').length);
      const g = r.plan.ghosts.find((x) => x.id === id);
      if (g) {
        const run = d.runGhost.get(g.id);
        const f = run ? frames.find((x) => x.id === run && x.kind === 'ghost') : undefined;
        const what = `in-between picture ${run ?? '(none)'}: ${g.label}`;
        return found(
          { ...base, key: `ghost:${run ?? `today-${g.id}`}`, what },
          f,
          `the run never drew the in-between picture today's plan wants (${g.label}; ${ghostName(g)})`,
        );
      }
      const here = opts.here?.[id];
      if (here) {
        const what = `${id}'s new picture, drawn first in this checkpoint (${here.id})`;
        const dep = { ...base, key: `picture:${id}`, what, dependsOn: here.id };
        if (!here.file) return dep;
        if (!exists(here.file)) return { ...dep, missing: `its file is not on this machine (${here.file})` };
        // The owner's verdicts on this checkpoint's own new pictures count too: a new picture he called
        // wrong is never drawn from, as a picture of the run he called wrong is not.
        const wrong = judgedWrong(opts.judged ?? [], id, here.file);
        return wrong
          ? {
              ...dep,
              file: here.file,
              missing: `the owner judged ${id}'s new picture wrong (${wrong.where}${wrong.note ? `: "${wrong.note.slice(0, 160)}"` : ''}): a picture he called wrong is never drawn from; redraw ${id} first`,
            }
          : { ...dep, file: here.file };
      }
      const f = frames.find((x) => x.id === id && x.kind === 'cut');
      const what = `picture ${id} from the run${f?.name ? ` (${f.name})` : ''}`;
      const got = found({ ...base, key: `picture:${id}`, what }, f, `the run never drew ${what}`);
      const wrong = got.file ? judgedWrong(opts.judged ?? [], id, got.file) : undefined;
      return wrong
        ? {
            ...got,
            missing: `the owner judged it wrong (${wrong.where}${wrong.note ? `: "${wrong.note.slice(0, 160)}"` : ''}): a picture he called wrong is never drawn from; put ${id} in the set to draw it new first`,
          }
        : got;
    }
    return {
      ...base,
      key: `other:${ref.media_id}`,
      what: 'an image the run does not have',
      missing: `today's build names an image that is none of the run's (${ref.media_id})`,
    };
  });
  const refused = images.filter((x) => x.missing).map((x) => `image ${x.n} (${x.role} ${x.name}): ${x.missing}`);
  const notes: string[] = [];
  // What code knows is wrong before anything is paid for (the harness's pre-draw check, gate.ts): a fault
  // it acts on even when the checks only log leaves the moment undrawn, and so it is not drawn here.
  const order = p.item.frame?.order;
  const planIssues = order
    ? r.plan.issues.filter((x) => x.startsWith(`picture ${order} `) || x.startsWith(`picture ${order}:`))
    : [];
  // Everyone in view brings their sketch, but what has turned into something else (plan.ts --gate).
  const turned = turnedInto(p.item);
  const mustInclude = p.inView
    .filter((x) => x.mediaId && !turned.has(x.id))
    .map((x) => ({
      name: x.name,
      mediaId: x.mediaId as string,
      ...standsFor(
        r.pictures.map((q) => q.item),
        x.id,
      ),
    }));
  const findings = [...planIssues, ...checkReferences(p.prompt, p.references, { mustInclude })];
  const logging = checksMode() === 'log';
  for (const f of findings)
    if (actsWhenLogging(f)) refused.push(`the pre-draw check leaves it undrawn: ${f}`);
    else
      notes.push(
        logging
          ? `the pre-draw check only logs: ${f}`
          : `with the checks acting (DREAMCHAT_CHECKS is not log) the harness may hold or reword it for: ${f}`,
      );
  // Words that call the dreamer "you" are put in the third person by a model before the harness draws
  // the moment; here they would be sent as they are.
  const you = YOU_WORDS.filter((k) => YOU.test(p.item.fields[k]?.value ?? ''));
  if (you.length)
    refused.push(
      `its words call the dreamer "you" (${you.join(', ')}): the harness has a model put them in the third person before drawing it, which is not done here`,
    );
  // The shot's brief is the one written for the view today's plan has (--brief writes one as the harness
  // does); without one, a rebuild says what the camera sees in the view's own words. With the camera
  // rules, as the harness does, a brief also serves a view that differs only in a claim they took out.
  const view = p.item.frame?.plan?.view;
  const brief = view && p.item.shot && sameView(p.item.shot.view, view) ? { view, text: p.item.shot.text } : null;
  const briefless = !!view && !brief;
  const hash = sha256(
    JSON.stringify({
      prompt: p.prompt,
      // An earlier moment's new picture by what it is: the same before it is drawn and after.
      images: images.map((x) => [
        x.key,
        x.role,
        x.instruction,
        x.dependsOn ? `the new picture of ${x.dependsOn}` : (x.file ?? null),
      ]),
      previs: previs?.key ?? null,
      brief: brief?.text ?? null,
    }),
  );
  return {
    moment,
    name: p.item.name,
    action: p.item.fields.action?.value ?? '',
    prompt: p.prompt,
    images,
    ...(previs ? { previs } : {}),
    brief,
    briefless,
    refused,
    notes,
    hash,
  };
}

/** What the harness asks a model for when it briefs a moment's shot (session.ts startFrame, producer.ts shotFor). */
export type BriefAsk = {
  action: string;
  view: string;
  medium: string;
  mustName: string[];
  before: string[];
  /** Those of `mustName` who are people or creatures. */
  people: string[];
};

/**
 * What a moment's shot brief is written from, exactly as the harness asks for it: the moment's action,
 * the view worked out on its floor plan, how the pictures are made, everyone the view sees by what the
 * moment calls them, and what has happened in its scene so far. None where it has no view, or a brief
 * for it already.
 */
export function briefAskOf(d: DreamBuild, moment: string): BriefAsk | null {
  const p = d.r.pictures.find((x) => x.id === moment && x.kind === 'cut');
  const view = p?.item.frame?.plan?.view;
  if (!p || !view || sameView(p.item.shot?.view, view) || !d.saved.style) return null;
  const called = calledFor({ build: d.saved.build, draft: d.saved.draft && { ...d.saved.draft, breakdown: d.r.b } }, p.item);
  const scene = d.r.b.scenes.find((sc) => sc.moments.some((m) => m.id === moment));
  const before = (scene?.moments ?? []).slice(0, scene?.moments.findIndex((m) => m.id === moment)).map((m) => m.action);
  return {
    action: p.item.fields.action?.value ?? p.item.name,
    view,
    medium: mediumOf(d.saved.style),
    mustName: (p.item.frame?.plan?.sees ?? []).map(called),
    people: (p.item.frame?.plan?.sees ?? []).filter((id) => d.r.b.people.some((x) => x.id === id)).map(called),
    before,
  };
}

/** A brief written for a moment's view, kept with the checkpoint (briefs.json). */
export type Brief = { view: string; text: string; writer?: string; at?: string };

/**
 * A saved dream with the checkpoint's briefs where the harness keeps one it was given in the background
 * (its prep's shots): a rebuild takes the brief for the view each moment has now, the moment's own first.
 */
export function withBriefs(saved: Session, briefs: Record<string, Brief>): Session {
  if (!Object.keys(briefs).length) return saved;
  const s = structuredClone(saved);
  const shots = { ...(s.prep?.shots ?? {}) };
  for (const [moment, b] of Object.entries(briefs)) shots[moment] = { text: b.text, view: b.view };
  s.prep = { ...(s.prep ?? ({} as NonNullable<Session['prep']>)), shots };
  return s;
}

/** A moment's images as "role name", to compare with what was sent. */
export const namesOf = (t: Pick<Today, 'images'>) => t.images.map((x) => `${x.role} ${x.name}`);

/**
 * What a store is given of a built dream to draw its moments (evals/paired-store.ts): its sketches the run
 * drew, keyed as the moments name them, and its in-between pictures by the run's ids.
 */
export function partsOf(d: DreamBuild): DreamParts {
  if (!d.saved.style) throw new Error(`${d.saved.id} has no chosen look`);
  return {
    b: d.r.b,
    style: d.saved.style,
    sheets: (d.saved.build?.items ?? []).map((i) => ({
      ...i,
      mediaId: usable(i) && !i.extras ? `sketch:${i.id}` : undefined,
    })),
    ghosts: d.plan.ghosts as GhostPlan[],
    ...(d.r.rec ? { rec: d.r.rec } : {}),
  };
}

/** One moment of a built dream as the store draws it. */
export function toDrawOf(d: DreamBuild, id: string, t: Today): ToDraw {
  const p = d.r.pictures.find((x) => x.id === t.moment && x.kind === 'cut');
  return {
    id,
    moment: t.moment,
    name: t.name,
    frame: p?.item.frame,
    shot: d.r.plan.cuts.find((c) => c.id === t.moment)?.shot,
    keys: t.images.map((x) => x.key),
    ...(t.previs ? { previs: t.previs } : {}),
  };
}

/** The latest moment before this one, in story order, that the run drew: the picture before, as the owner saw it. */
export function pictureBefore(saved: Pick<Session, 'build' | 'draft'>, moment: string): string | undefined {
  const b = saved.draft?.breakdown;
  if (!b) return undefined;
  const ms = moments(b);
  const at = ms.findIndex((x) => x.id === moment);
  const frames = saved.build?.frames ?? [];
  return ms
    .slice(0, Math.max(at, 0))
    .reverse()
    .find((x) => drawnItem(frames.find((f) => f.id === x.id && f.kind === 'cut')))?.id;
}

/** A moment's place in its dream's story (its breakdown's order); after every moment where it is none of them. */
export function storyIndex(saved: Pick<Session, 'draft'>, moment: string): number {
  const at = saved.draft?.breakdown ? moments(saved.draft.breakdown).findIndex((x) => x.id === moment) : -1;
  return at < 0 ? Number.MAX_SAFE_INTEGER : at;
}

/**
 * The picture shown before a moment's two on the judging page: the latest earlier picture its new one was
 * drawn from, as it was sent (an earlier moment's new picture where the checkpoint drew that first); where
 * it was drawn from none, the latest earlier moment the run drew, as the checkpoint drew it again where it
 * did (`drawnNew`, by moment), else as the run drew it (`runFile`). The owner judges continuity against
 * the frame the new picture follows.
 */
export function beforeOnPage(
  saved: Pick<Session, 'build' | 'draft'>,
  moment: string,
  sent: { key: string; file: string }[],
  drawnNew: Record<string, string>,
  runFile: (moment: string) => string | null,
): string | null {
  const at = (key: string) => storyIndex(saved, key.slice('picture:'.length));
  const latest = sent
    .filter((im) => im.key.startsWith('picture:') && im.file && at(im.key) < storyIndex(saved, moment))
    .sort((a, b) => at(b.key) - at(a.key))[0];
  if (latest) return latest.file;
  const prev = pictureBefore(saved, moment);
  return prev ? (drawnNew[prev] ?? runFile(prev)) : null;
}

// ── how much changed ─────────────────────────────────────────────────────────────────────────────

/** The length of the longest common subsequence of two lists. */
function common<T>(a: T[], b: T[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) row[j + 1] = x === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]);
    prev = row;
  }
  return prev[b.length];
}

const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * How much a moment's prompt and images changed from `before` to `now`: the words taken out and put in
 * (against the longer prompt's length), the images taken out and put in, in order, and whether its mock-up
 * renders otherwise (where both are known). `share` adds the two fractions (and one image for a mock-up
 * rendered otherwise): what a set is ranked by.
 */
export function changeOf(
  before: { prompt: string; images: string[]; previs?: string | null },
  now: { prompt: string; images: string[]; previs?: string | null },
): Change {
  const a = wordsIn(before.prompt);
  const b = wordsIn(now.prompt);
  const words = a.length + b.length - 2 * common(a, b);
  const images = before.images.length + now.images.length - 2 * common(before.images, now.images);
  const previs = !!before.previs && !!now.previs && before.previs !== now.previs;
  const of = Math.max(a.length, b.length);
  const imagesOf = Math.max(before.images.length, now.images.length);
  const share = (of ? words / of : 0) + (imagesOf ? (images + (previs ? 1 : 0)) / imagesOf : previs ? 1 : 0);
  return { words, of, images, imagesOf, previs, share: Math.round(share * 1000) / 1000 };
}

export const changed = (c: Change) => c.words > 0 || c.images > 0 || c.previs;

export const changeWords = (c: Change) =>
  `${c.words} of ${c.of} words, ${c.images} of ${c.imagesOf} images${c.previs ? ', the mock-up rendered otherwise' : ''}`;

// ── proposing a set from the prompt cases ────────────────────────────────────────────────────────

/** The switch each step is built behind (HARNESS_PLAN.md): what a step's changes are measured against, off. */
export const STEP_SWITCHES: Record<string, string> = {
  S1: 'DREAMCHAT_RECORD',
  S2: 'DREAMCHAT_CHECKS',
  S3: 'DREAMCHAT_CUT_SHEET',
  S4: 'DREAMCHAT_CAMERA',
  S5: 'DREAMCHAT_REFS',
  S6: 'DREAMCHAT_ONE_BUILDER',
  S8: 'DREAMCHAT_LISTEN',
};

/** A moment the cases put forward, before it is built: why, which cases, and the old picture they name. */
export type Candidate = {
  id: string;
  run: string;
  session: string;
  moment: string;
  why: Why;
  cases: PromptCase[];
  old: OldPicture;
  description?: string;
  /** A guard no more, in words: the owner has since called its old picture not right in a checkpoint. */
  relabelled?: string;
};

/**
 * The moments a step's checkpoint may draw again: every counted fault case of the step (not the image
 * model's alone, not set aside, not a hypothesis), and every guard (a moment the owner called right),
 * one entry per moment. A moment with a fault case is a fault; its old picture is the one its first fault
 * case was seen in. A guard whose old picture the owner has since called not right in a checkpoint
 * (`judged`) is a guard no more: it is proposed as a fault, his later verdict and note on its old picture
 * standing in place of the row's. Cases whose verdict row cannot be found are returned apart.
 */
export function candidatesOf(
  cases: PromptCase[],
  step: string,
  v: Verdicts,
  data: string,
  paired?: PairedResults | null,
  judged: Judged[] = [],
): { candidates: Candidate[]; unknown: { case: string; why: string }[] } {
  const faults = cases.filter(
    (c) =>
      c.step === step &&
      c.kind === 'failing' &&
      counted({ model_only: !!c.model_only, set_aside: !!c.set_aside, hypothesis: !!c.hypothesis }),
  );
  const guards = cases.filter((c) => c.kind === 'passing');
  const byMoment = new Map<string, { faults: PromptCase[]; guards: PromptCase[] }>();
  for (const [list, key] of [
    [faults, 'faults'],
    [guards, 'guards'],
  ] as const)
    for (const c of list) {
      const k = `${c.session}:${c.moment}`;
      const at = byMoment.get(k) ?? { faults: [], guards: [] };
      at[key].push(c);
      byMoment.set(k, at);
    }
  const candidates: Candidate[] = [];
  const unknown: { case: string; why: string }[] = [];
  for (const { faults: fs, guards: gs } of byMoment.values()) {
    const why: Why = fs.length ? 'fault' : 'guard';
    const list = why === 'fault' ? fs : gs;
    const old = oldPictureOf(list[0].source, v, data, paired);
    if (old instanceof Error) {
      unknown.push({ case: list[0].id, why: old.message });
      continue;
    }
    const { run, session, moment, description, ...picture } = old;
    const since =
      why === 'guard'
        ? judgedWrong(judged, moment, pictureFile(data, picture.picture), (j) => !!j.checkpoint)
        : undefined;
    candidates.push({
      id: `${run}-${moment}`,
      run,
      session,
      moment,
      why: since ? 'fault' : why,
      cases: list,
      old: since ? { ...picture, verdict: 'wrong', note: since.note, since: since.where } : picture,
      ...(description ? { description } : {}),
      ...(since
        ? {
            relabelled: `a guard no more: the owner has since called its old picture not right (${since.where}${since.note ? `: "${since.note}"` : ''})`,
          }
        : {}),
    });
  }
  return { candidates, unknown };
}

/** Why a candidate is in the set, in words: its cases and what each is about. */
export const reasonOf = (c: Pick<Candidate, 'why' | 'cases' | 'relabelled'>) =>
  [
    ...(c.relabelled ? [c.relabelled] : []),
    ...c.cases.map((x) =>
      c.why === 'fault' && !c.relabelled
        ? `${x.id} (${x.class}): ${x.fault}`
        : `${x.id}: the owner called it right${c.relabelled ? ' before' : ''}: ${x.fault}`,
    ),
  ].join(' | ');

/**
 * A candidate measured: today's build, and how much it changed against the base (or why it could not be).
 * `today` is built drawing from the new pictures of the other candidates of its dream; where it draws
 * from one, `alone` is it built from the run's pictures, as it is drawn when that one is not in the set.
 */
export type Measured = Candidate & { description: string; today?: Today; alone?: Today; change?: Change; error?: string };

/** How many pictures a cap leaves room for, after what is spent. */
export const roomUnder = (cap: number, spent: number) =>
  Math.max(0, Math.floor((cap - spent) / USD_PER_PICTURE + 1e-9));

/**
 * The set proposed from measured candidates: those whose prompt or images changed and that can be drawn,
 * the faults first and then the guards, each most changed first, trimmed to what the cap leaves room for.
 * The rest are returned by why they were left out.
 */
export function proposeSet(
  measured: Measured[],
  opts: {
    name: string;
    step: string;
    cap: number;
    spent?: number;
    switches: Record<string, string>;
    base: string;
    /** Where its results will be kept, whole: the set pins it. */
    results?: string;
  },
): {
  set: CheckpointSet;
  unchanged: Measured[];
  refused: Measured[];
  failed: Measured[];
  over: Measured[];
} {
  const failed = measured.filter((m) => m.error || !m.today || !m.change);
  const ok = measured.filter((m) => !failed.includes(m));
  const unchanged = ok.filter((m) => !changed(m.change as Change));
  const refused = ok.filter((m) => changed(m.change as Change) && (m.today as Today).refused.length);
  const drawable = ok.filter((m) => changed(m.change as Change) && !(m.today as Today).refused.length);
  const rank = (group: (m: Measured) => boolean) =>
    drawable
      .filter(group)
      .sort((a, b) => (b.change as Change).share - (a.change as Change).share || a.id.localeCompare(b.id));
  // The step's own faults, then the guards the owner has since called not right, then the guards.
  const ranked = [
    ...rank((m) => m.why === 'fault' && !m.relabelled),
    ...rank((m) => m.why === 'fault' && !!m.relabelled),
    ...rank((m) => m.why === 'guard'),
  ];
  const room = roomUnder(opts.cap, opts.spent ?? 0);
  // A moment that draws from an earlier one's new picture comes with it (the earlier first); where that
  // cannot be drawn, or there is no room for both, it is drawn from the run's picture if that may be sent.
  const byId = new Map(drawable.map((m) => [m.id, m]));
  const keptIds = new Set<string>();
  const kept: Measured[] = [];
  const over: Measured[] = [];
  const cannot: Measured[] = [];
  const needs = (m: Measured, seen: Set<string>): string[] | null => {
    const out: string[] = [];
    for (const dep of dependsOf(m.today)) {
      if (keptIds.has(dep) || seen.has(dep)) continue;
      const d = byId.get(dep);
      if (!d) return null;
      seen.add(dep);
      const more = needs(d, seen);
      if (!more) return null;
      out.push(...more, dep);
    }
    return out;
  };
  for (const m of ranked) {
    if (keptIds.has(m.id)) continue;
    const alone = m.alone && !m.alone.refused.length ? { ...m, today: m.alone } : null;
    let need = needs(m, new Set([m.id]));
    let use = m;
    if (!need || (need.length && kept.length + need.length + 1 > room && alone)) {
      if (!alone) {
        const why = `it draws from the new picture of ${dependsOf(m.today).join(', ')}, which is not drawn in this set${m.alone ? `, and cannot be drawn from the run's: ${m.alone.refused.join('; ')}` : ''}`;
        cannot.push({ ...m, today: { ...(m.today as Today), refused: [why] } });
        continue;
      }
      use = alone;
      need = [];
    }
    if (kept.length + need.length + 1 > room) {
      over.push(m);
      continue;
    }
    for (const id of need) {
      kept.push(byId.get(id) as Measured);
      keptIds.add(id);
    }
    kept.push(use);
    keptIds.add(m.id);
  }
  const set: CheckpointSet = {
    about: `Proposed from the prompt cases for ${opts.step}: every counted fault case of the step, and every guard (a moment the owner called right), whose prompt or images change against ${opts.base}, that can be drawn from the run's own pictures (never one the owner called wrong) or from an earlier moment's new picture drawn first; a guard whose old picture the owner has since called not right in a checkpoint is a guard no more; the faults first, then the guards no more, then the guards, each most changed first (a moment with the earlier one it draws from), trimmed to $${opts.cap.toFixed(2)} at $${USD_PER_PICTURE.toFixed(2)} a picture. For a person to confirm before anything is drawn.`,
    name: opts.name,
    step: opts.step,
    cap_usd: opts.cap,
    ...(opts.results ? { results: opts.results } : {}),
    switches: opts.switches,
    base: opts.base,
    moments: kept.map((m) => ({
      id: m.id,
      run: m.run,
      session: m.session,
      moment: m.moment,
      why: m.why,
      reason: reasonOf(m),
      cases: m.cases.map((c) => c.id),
      old: m.old,
      description: m.description,
      change: m.change,
    })),
  };
  return { set, unchanged, refused: [...refused, ...cannot], failed, over };
}

// ── old and new, blind ───────────────────────────────────────────────────────────────────────────

export type AB = 'old' | 'new';

/**
 * Which picture each moment shows as A: the old one in half of the faults and half of the guards (one
 * more or less, and the whole set within one of half too), which half chosen by a hash of the checkpoint's
 * name and the moment: nothing in the set's order or the moments' kinds says which is which, and the same
 * set is always shown the same way.
 */
export function abOrder(
  name: string,
  ms: { id: string; why: Why }[],
  fixed: Record<string, AB> = {},
): Record<string, AB> {
  const out: Record<string, AB> = {};
  let oldFirst = 0;
  let seen = 0;
  for (const why of ['fault', 'guard', 'pair'] as Why[]) {
    const inGroup = ms.filter((m) => m.why === why);
    // What the key already says stays as it is; the rest are placed to keep the group as near half as it can.
    const kept = inGroup.filter((m) => fixed[m.id]);
    for (const m of kept) out[m.id] = fixed[m.id];
    const group = inGroup
      .filter((m) => !fixed[m.id])
      .map((m) => ({ id: m.id, h: sha256(`${name}\n${m.id}`) }))
      .sort((a, b) => a.h.localeCompare(b.h));
    const n = inGroup.length;
    // An odd group's one over goes to whichever picture is behind so far; when neither is, the hash decides.
    const extra =
      n % 2 === 0
        ? 0
        : oldFirst * 2 < seen
          ? 1
          : oldFirst * 2 > seen
            ? 0
            : Number.parseInt(sha256(`${name}\n${why}`).slice(0, 2), 16) % 2;
    const want = Math.floor(n / 2) + extra;
    const already = kept.filter((m) => fixed[m.id] === 'old').length;
    const olds = Math.max(0, Math.min(group.length, want - already));
    group.forEach((m, i) => {
      out[m.id] = i < olds ? 'old' : 'new';
    });
    oldFirst += already + olds;
    seen += n;
  }
  return out;
}

// ── the cap ──────────────────────────────────────────────────────────────────────────────────────

/** One attempt to draw a moment, as the results keep it. */
export type Attempt = {
  id: string;
  session: string;
  moment: string;
  /** What was sent, exactly: the hash --dry printed, the prompt, and each image with its file and its id in the store. */
  hash: string;
  prompt: string;
  images: {
    n: number;
    role: string;
    key: string;
    what: string;
    file: string;
    mediaId?: string;
    instruction: string;
  }[];
  switches: Record<string, string>;
  /** The engine's job state, or `refused` (the engine would not prepare it) or `capped`: nothing paid for either. */
  state: string;
  recipeId?: string;
  jobId?: string;
  nodeId?: string;
  /** fal's own id for the request, the engine's receipt for the job, and its events. */
  providerId?: string | null;
  receipt?: unknown;
  events?: unknown;
  /** The engine's estimate in US dollars: fal's list price (fal bills the account). */
  usd?: number | null;
  error?: string;
  /** The picture in the checkpoint's store, and its copy beside the results. */
  output?: string;
  copy?: string;
  at: string;
  /** Its earlier attempts that reached the worker, each kept when it was drawn again: all count as spent. */
  earlier?: Attempt[];
};

export type Results = {
  about: string;
  checkpoint: string;
  home: string;
  provider: string;
  model: string;
  entries: Record<string, Attempt>;
};

/** Job states nothing more comes of, and the two outcomes that never reached the provider. */
export const DONE = new Set(['ready', 'failed', 'cancelled', 'submission_unknown', 'collection_failed', 'refused', 'capped']);
export const NEVER_SENT = new Set(['refused', 'capped']);
/**
 * Outcomes that may already have been paid for: fal may have drawn the picture, or the run stopped while
 * the picture was being started (`starting`, kept before the engine is asked) and no job of it was found.
 */
export const MAYBE_PAID = new Set(['submission_unknown', 'collection_failed', 'starting']);

/** Every attempt the results record: each entry and the attempts before it. */
export const attemptsOf = (rs: Pick<Results, 'entries'>) =>
  Object.values(rs.entries).flatMap((r) => [r, ...(r.earlier ?? [])]);

/**
 * Spent, as the engine estimates it: every picture that went to the worker counts, drawn or not; one whose
 * estimate is unknown counts as the most one picture may cost (sheets.ts MAX_PER_IMAGE, $0.20 on fal).
 */
export const spentIn = (rs: Pick<Results, 'entries'>) =>
  attemptsOf(rs)
    .filter((r) => r.jobId)
    .reduce((a, r) => a + (typeof r.usd === 'number' ? r.usd : MAX_PER_IMAGE), 0);

/**
 * What to draw of a checkpoint's moments: each not drawn yet. Nothing is drawn again on its own: one sent
 * before and failed only when named in `only`, one that may already have been paid for only when named
 * and `redrawPaid` too; one still in the worker's hands is waited for, never sent again.
 */
export function whatToDraw(
  ids: string[],
  rs: Pick<Results, 'entries'>,
  opts: { only?: string[]; redrawPaid?: boolean } = {},
): { todo: string[]; waiting: string[]; skipped: { id: string; why: string }[] } {
  const only = opts.only ?? [];
  const todo: string[] = [];
  const waiting: string[] = [];
  const skipped: { id: string; why: string }[] = [];
  for (const id of ids) {
    const was = rs.entries[id];
    if (was?.state === 'ready') {
      skipped.push({ id, why: 'drawn already' });
      continue;
    }
    if (was?.jobId && !DONE.has(was.state)) {
      waiting.push(id);
      continue;
    }
    if (was && MAYBE_PAID.has(was.state) && !(only.includes(id) && opts.redrawPaid)) {
      skipped.push({
        id,
        why: `${was.state} before, as job ${was.jobId} (${was.error ?? 'no error given'}); it may already have been paid for, so it is drawn again only when named with --only and --redraw-paid`,
      });
      continue;
    }
    if (was && !NEVER_SENT.has(was.state) && !only.includes(id)) {
      skipped.push({
        id,
        why: `${was.state} before (${was.error ?? 'no error given'}); drawn again only when named with --only`,
      });
      continue;
    }
    todo.push(id);
  }
  return { todo, waiting, skipped };
}

/** Why drawing `pictures` more would pass the cap after what is spent; null when it would not. */
export function overCap(spent: number, pictures: number, cap: number): string | null {
  const total = spent + pictures * USD_PER_PICTURE;
  return total > cap + 1e-9
    ? `$${spent.toFixed(2)} spent and ${pictures} picture${pictures === 1 ? '' : 's'} at $${USD_PER_PICTURE.toFixed(2)} would make $${total.toFixed(2)}, over the $${cap.toFixed(2)} cap`
    : null;
}

/** A job in the checkpoint's store, and the moment's node its recipe is for. */
export type StoreJob = { id: string; state: string; node: string | null };

/**
 * The checkpoint's store against its results. Every job in it is one of the checkpoint's pictures (the store
 * is its own), so one the results do not know, in any state, may have been paid for: `stray`. An attempt
 * the run stopped in while starting (`starting`, no job id) takes the job of its node, if there is one:
 * `adopted`; with none, nothing reached the engine: `unsent`.
 */
export function reconcileStore(
  rs: Pick<Results, 'entries'>,
  jobs: StoreJob[],
): { stray: StoreJob[]; adopted: { id: string; job: StoreJob }[]; unsent: string[] } {
  const known = new Set(attemptsOf(rs).flatMap((r) => (r.jobId ? [r.jobId] : [])));
  const free = jobs.filter((j) => !known.has(j.id));
  const adopted: { id: string; job: StoreJob }[] = [];
  const unsent: string[] = [];
  for (const r of Object.values(rs.entries)) {
    if (r.state !== 'starting' || r.jobId) continue;
    const job = free.find((j) => r.nodeId && j.node === r.nodeId && !adopted.some((a) => a.job.id === j.id));
    if (job) adopted.push({ id: r.id, job });
    else unsent.push(r.id);
  }
  const taken = new Set(adopted.map((a) => a.job.id));
  return { stray: free.filter((j) => !taken.has(j.id)), adopted, unsent };
}

/** An attempt that reached the worker, kept with the ones before it when its moment is drawn again. */
export const earlierOf = (was?: Attempt): Attempt[] => [
  ...(was?.earlier ?? []),
  ...(was?.jobId ? [{ ...was, earlier: undefined }] : []),
];
