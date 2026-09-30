// A picture checkpoint: after a step of HARNESS_PLAN.md, a few moments drawn once more by today's full
// harness under the switches as set, each put old against new and judged blind by the owner. Does a
// moment the owner called wrong now come out right, and does one he called right stay right?
//
//   bun run evals/checkpoint.ts --set-from-cases S4 [--base NAME=VALUE … | --base old] [--cap 3] [--name s4] [--out <file>]
//   DREAMCHAT_WRITER=claude bun run evals/checkpoint.ts --dry evals/checkpoint-s4.json --brief [--only <id> …]
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/checkpoint.ts --draw evals/checkpoint-s4.json [--cap <usd>] [--only <id> …] [--redraw-paid]
//   bun run evals/checkpoint.ts --judge evals/checkpoint-s4.json [--port <n>]
//   bun run evals/checkpoint.ts --score evals/checkpoint-s4.json
//
// A set (evals/checkpoint-<name>.json) lists moments as the prompt cases name them, by dream and moment,
// each with why it is there (a fault case expected to change, or a guard the owner called right whose
// prompt changed), the owner's verdict and note on the old picture (from story-pictures.json or
// paired-verdicts.json) and the old picture's file; it pins its cap (cap_usd) and where its results are
// kept (results). --set-from-cases proposes one for a step: every counted fault case of the step, and every
// guard, whose prompt or images change against the base (the step's own switch unset, or the switches
// named with --base, or with --base old the prompt each old picture was drawn with), that can be drawn
// from the run's own pictures; faults first, then guards, each most changed first, trimmed to the cap. It
// is printed and written for a person to confirm.
//
// --dry builds each moment as today's harness would send it, under the switches as set: its prompt and
// every image, each the run's own approved file (sketches, earlier pictures, the in-between pictures
// matched to today's plan), the mock-up rendered from its floor plan now (written beside the results),
// the word diff against the prompt the old picture was drawn with, and the cost ($0.15 a picture). A
// moment is refused, never drawn with a stand-in, when an image cannot be found (an in-between picture
// today's plan wants that the run never drew, a sketch never drawn or never approved, a file not on this
// machine), when the pre-draw check's code would leave it undrawn, when its words call the dreamer "you"
// (the harness rewords them with a model first), and when its view has no shot brief: --brief has the
// writer brief it exactly as the harness does (producer.ts shotFor, DREAMCHAT_WRITER), kept in briefs.json
// and so in every later build, and --allow-briefless draws it from the view's own words instead. No other
// model is called: with DREAMCHAT_RECORD=on, what each moment implies comes from the implied-reading cache
// (evals/implied-cache.ts), and a dream whose readings are not all there is refused unless --read-implied
// (model calls) or --no-imply (read nothing, unlike the harness) says otherwise.
//
// --draw draws each moment once through the Strawberry engine, into the checkpoint's own store
// (runs/checkpoint/<name>/home: never the dream chat's store or the shared .strawberry), and only what the
// last --dry printed and did not refuse: the set, the switches and each moment's prompt and images as
// then, the checks only logging (DREAMCHAT_CHECKS=log, the default). One draw at a time (draw.lock). Its
// cap is the set's cap_usd (--cap can only lower it), counting every earlier attempt in its results; it
// refuses to start over the cap and stops at it, each picture approved for no more than what is left.
// Every attempt is saved before the engine is asked, and every job in the store the results do not know,
// in any state, stops it. Nothing is drawn again on its own (as evals/paired.ts): a failed picture only
// when named with --only, one that may already have been paid for only with --redraw-paid too. Each job's
// provider id and receipt are kept in runs/checkpoint/<name>/results.json.
//
// --judge writes the judging data (runs/checkpoint/<name>/judge/data.json: each moment's old and new
// picture as A and B in a balanced order that names neither, both re-encoded alike, the picture before,
// the moment's line and what the dreamer said), keeps the answer key apart (runs/checkpoint/<name>/key.json,
// each moment's once and for all), and serves the page on 127.0.0.1 on a free port: A right, B right, both
// or neither, and a note, each answer written to runs/checkpoint/<name>/answers.json as it is given, with
// the pictures it was given on. --score reads the answers against the key, leaving out any whose pictures
// have changed since.
//
// Saved conversations and their pictures are read from the checkout that has them (DREAMCHAT_DATA, this
// one, or another worktree of the repository), never changed. Results go under its runs/checkpoint/<name>
// (or CHECKPOINT_DIR/<name>).
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
// Types only, and saved.ts: no module that reads the engine's store is loaded before the store is set.
import type { WriteFn } from '../implied';
import type { JevFn } from '../jev';
import type { Session } from '../session';
import type { SheetEngine } from '../sheets';
import type { AnswerKey, Answers, JudgeData, ToJudge } from './checkpoint-judge';
import type {
  Attempt,
  Brief,
  Change,
  CheckpointSet,
  DreamBuild,
  DrawnHere,
  Judged,
  Measured,
  PairedResults,
  Results,
  Sent,
  SetMoment,
  StoreJob,
  Today,
} from './checkpoint-set';
import type { setUpDream } from './paired-store';
import { commitOf, dataDir, frozenPath, loadDream, readSession, sha256, switches } from './saved';

const DIR = resolve(import.meta.dir, '..');
const REPO = resolve(DIR, '..');
/** The cap when the set names none, in US dollars. */
export const DEFAULT_CAP = 3;
/** Why a moment without a brief for its view is refused. */
export const BRIEFLESS =
  "no shot brief for the view today's plan has: the harness has a model write one before it draws (--brief writes it as the harness does; --allow-briefless draws from the view's own words instead)";

/** How a moment refused for the earlier moment whose new picture it draws from is said. */
export const DEPENDS = 'it draws from the new picture of ';

export const USAGE = `usage:
  bun run evals/checkpoint.ts --set-from-cases <step> [--base NAME=VALUE … | --base old] [--cap <usd>] [--name <name>] [--out <file>]
  bun run evals/checkpoint.ts --dry <set file> [--brief] [--allow-briefless] [--only <id> …] [--no-imply | --read-implied] [--implied-cache <file>]
  bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/checkpoint.ts --draw <set file> [--cap <usd>] [--only <id> …] [--redraw-paid] [--allow-briefless]
  bun run evals/checkpoint.ts --judge <set file | name> [--port <n>]
  bun run evals/checkpoint.ts --score <set file | name>`;

export type Mode = 'set-from-cases' | 'dry' | 'draw' | 'judge' | 'score';
export type Args = {
  mode: Mode;
  /** The step for --set-from-cases; the set file (or checkpoint name) otherwise. */
  target?: string;
  only: string[];
  /** --set-from-cases: the switches its changes are measured against (NAME=VALUE, an empty value unsets), or old. */
  base: string[];
  cap?: number;
  name?: string;
  out?: string;
  port?: number;
  redrawPaid: boolean;
  noImply: boolean;
  readImplied: boolean;
  impliedCache?: string;
  /** --dry: have the writer brief each moment whose view has no brief, as the harness does. */
  brief: boolean;
  /** Draw a moment without a brief for its view, from the view's own words. */
  allowBriefless: boolean;
};

const MODES: Mode[] = ['set-from-cases', 'dry', 'draw', 'judge', 'score'];
const FLAGS = new Set([
  ...MODES.map((m) => `--${m}`),
  '--set',
  '--only',
  '--base',
  '--cap',
  '--name',
  '--out',
  '--port',
  '--redraw-paid',
  '--no-imply',
  '--read-implied',
  '--implied-cache',
  '--brief',
  '--allow-briefless',
]);

/** The command line, checked: one thing to do, known flags only, and values that make sense. */
export function parseArgs(argv: string[]): Args | { error: string } {
  const unknown = argv.filter((a) => a.startsWith('--') && !FLAGS.has(a));
  if (unknown.length) return { error: `unknown ${unknown.length > 1 ? 'flags' : 'flag'}: ${unknown.join(', ')}` };
  const modes = MODES.filter((m) => argv.includes(`--${m}`));
  if (modes.length !== 1)
    return {
      error: modes.length
        ? `one of ${modes.map((m) => `--${m}`).join(', ')} at a time`
        : 'say what to do: --set-from-cases, --dry, --draw, --judge or --score',
    };
  const mode = modes[0];
  const valueAfter = (flag: string) => {
    const i = argv.indexOf(flag);
    const v = i >= 0 ? argv[i + 1] : undefined;
    return v !== undefined && !v.startsWith('--') ? v : undefined;
  };
  const listAfter = (flag: string) => {
    const out: string[] = [];
    argv.forEach((a, i) => {
      if (a !== flag) return;
      for (const v of argv.slice(i + 1)) {
        if (v.startsWith('--')) break;
        out.push(v);
      }
    });
    return out;
  };
  const target = valueAfter(`--${mode}`) ?? valueAfter('--set');
  if (mode === 'set-from-cases' && !/^S\d+$/.test(target ?? ''))
    return { error: '--set-from-cases names a step of HARNESS_PLAN.md: --set-from-cases S4' };
  if (mode !== 'set-from-cases' && !target)
    return { error: `--${mode} names a set file (or, to judge or score, a checkpoint's name)` };
  const capText = valueAfter('--cap');
  const cap = capText === undefined ? undefined : Number(capText);
  if (argv.includes('--cap') && !(cap !== undefined && Number.isFinite(cap) && cap > 0))
    return { error: '--cap is an amount in US dollars, more than 0' };
  const portText = valueAfter('--port');
  const port = portText === undefined ? undefined : Number(portText);
  if (argv.includes('--port') && !(port !== undefined && Number.isInteger(port) && port >= 0 && port < 65536))
    return { error: '--port is a port number (0 for any free one)' };
  const base = listAfter('--base');
  if (argv.includes('--base') && !base.length) return { error: '--base names NAME=VALUE switches, or old' };
  if (base.includes('old') && base.length > 1) return { error: '--base old stands alone' };
  const bad = base.filter((b) => b !== 'old' && !/^DREAMCHAT_[A-Z0-9_]+=/.test(b));
  if (bad.length) return { error: `--base takes DREAMCHAT_ switches as NAME=VALUE, or old: not ${bad.join(', ')}` };
  const name = valueAfter('--name');
  if (name !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(name))
    return { error: '--name is lower-case letters, digits and -' };
  if (argv.includes('--no-imply') && argv.includes('--read-implied'))
    return { error: '--no-imply or --read-implied, not both' };
  if (argv.includes('--brief') && mode !== 'dry') return { error: '--brief goes with --dry' };
  return {
    mode,
    ...(target ? { target } : {}),
    only: listAfter('--only'),
    base,
    ...(cap !== undefined ? { cap } : {}),
    ...(name ? { name } : {}),
    ...(valueAfter('--out') ? { out: valueAfter('--out') } : {}),
    ...(port !== undefined ? { port } : {}),
    redrawPaid: argv.includes('--redraw-paid'),
    noImply: argv.includes('--no-imply'),
    readImplied: argv.includes('--read-implied'),
    ...(valueAfter('--implied-cache') ? { impliedCache: valueAfter('--implied-cache') } : {}),
    brief: argv.includes('--brief'),
    allowBriefless: argv.includes('--allow-briefless'),
  };
}

/** The switches as a run records them: the dream chat's own, without where its files are. */
export const knobs = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(switches()).filter(([k]) => k !== 'DREAMCHAT_STRAWBERRY_HOME' && k !== 'DREAMCHAT_DATA'),
  );

/** Where two records of the switches differ, in words; none when they are the same. */
export function switchesDiffer(a: Record<string, string>, b: Record<string, string>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((k) => a[k] !== b[k])
    .map(
      (k) => `${k} ${a[k] === undefined ? 'unset' : `=${a[k]}`} then, ${b[k] === undefined ? 'unset' : `=${b[k]}`} now`,
    );
}

/** The environment with some switches set (an empty value unsets one) while `fn` runs, then as it was. */
export async function withEnv<T>(over: Record<string, string>, fn: () => T | Promise<T>): Promise<T> {
  const was = Object.fromEntries(Object.keys(over).map((k) => [k, process.env[k]]));
  const put = (k: string, v: string | undefined) => {
    if (v === undefined || v === '') delete process.env[k];
    else process.env[k] = v;
  };
  for (const [k, v] of Object.entries(over)) put(k, v);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(was)) put(k, v);
  }
}

/** Where a checkpoint keeps what it makes (`out`, its store `home`), and whose files it reads (`data`, `media`). */
export type Folders = { data: string; out: string; home: string; media: string };

/**
 * The checkpoint's folders, and its own store set for the engine before any module reads it: never the
 * dream chat's store, nor the shared one the studio uses.
 */
function foldersOf(name: string, sessions: string[]): Folders {
  const data = dataDir(sessions);
  const out = resolve(process.env.CHECKPOINT_DIR ?? join(data, 'runs', 'checkpoint'), name);
  const home = resolve(out, 'home');
  if (
    home === resolve(data, 'strawberry-home') ||
    home === resolve(DIR, 'strawberry-home') ||
    home.split('/').includes('.strawberry')
  )
    throw new Error(`${home} is a store the dream chat or the studio uses: a checkpoint draws into a store of its own`);
  process.env.DREAMCHAT_STRAWBERRY_HOME = home;
  process.env.STRAWBERRY_PYTHON ??=
    [join(REPO, 'venv', 'bin', 'python'), join(data, '..', 'venv', 'bin', 'python')].find((p) => existsSync(p)) ??
    join(REPO, 'venv', 'bin', 'python');
  return { data, out, home, media: join(data, 'strawberry-home', 'media') };
}

/**
 * A moment's old picture's file: the run's, or for a pair the one its base checkpoint drew (null until drawn); none in
 * the base checkpoint itself.
 */
function oldFileOf(m: SetMoment, f: Folders): string | null {
  if (m.old.draw === 'none') return null;
  if (m.old.draw === 'base') {
    const file = join(dirname(f.out), m.old.from as string, 'results.json');
    const e = existsSync(file) ? readJson<Results>(file).entries[m.id] : undefined;
    return e?.state === 'ready' && e.output ? e.output : null;
  }
  return isAbsolute(m.old.picture) ? m.old.picture : join(f.data, m.old.picture);
}

/** A set by its file, or by a checkpoint's name (evals/checkpoint-<name>.json). */
function setFileOf(target: string): string {
  if (existsSync(target)) return resolve(target);
  const named = join(import.meta.dir, `checkpoint-${target}.json`);
  if (existsSync(named)) return named;
  throw new Error(`no set ${target}: name a set file, or a checkpoint with evals/checkpoint-<name>.json`);
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const money = (usd: number) => `$${usd.toFixed(2)}`;
/** The cap a checkpoint spends under: the set's, as reviewed, or less with --cap; never more. */
export const capOf = (set: Pick<CheckpointSet, 'cap_usd'>, asked?: number) =>
  Math.min(asked ?? Number.POSITIVE_INFINITY, set.cap_usd ?? DEFAULT_CAP);

/**
 * A picture made for the judging page, the old and the new alike: at most 1100 on a side, JPEG at 80, by
 * sips (a Mac) or ImageMagick. With neither, nothing is copied as it is: a picture's own format or size
 * could tell the old from the new, so the page is refused.
 */
function reencode(from: string, to: string): void {
  const sips = spawnSync('sips', ['-Z', '1100', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', from, '--out', to]);
  if (sips.status === 0) return;
  const magick = spawnSync('magick', [from, '-resize', '1100x1100>', '-quality', '80', `jpeg:${to}`]);
  if (magick.status === 0) return;
  throw new Error(
    `could not make ${to} from ${from}: the judging page needs sips (a Mac) or ImageMagick to make the old and new pictures alike (${String(sips.stderr || sips.error || '').slice(0, 200)})`,
  );
}

// ── implied readings ─────────────────────────────────────────────────────────────────────────────

/**
 * A saved dream with what each moment implies, as the harness reads it while planning with the story
 * record on: from the implied-reading cache, never a model unless --read-implied. Missing says why a dream
 * cannot be built as the harness would build it.
 */
async function withReadings(
  saved: Session,
  args: Args,
  needed: boolean,
): Promise<{ session: Session; note: string; missing?: string }> {
  const read = await withImpliedReadings(saved, args, needed);
  const { oneBuilder } = await import('../cleanups');
  if (read.missing || !oneBuilder()) return read;
  // With S6's one prompt builder on, each moment's typed reading, from its cache only: never a model.
  const { withTyped, TYPED_CACHE } = await import('./typed-cache');
  const typed = await withTyped(read.session);
  if (typed.missing.length)
    return {
      session: saved,
      note: '',
      missing: `the typed readings of ${typed.missing.join(', ')} are not in ${TYPED_CACHE}: read them with evals/typed.ts`,
    };
  // The cast reading (cast.ts, the cast_named step), after the typed readings, from its cache only.
  const { withCast, CAST_CACHE } = await import('./cast-cache');
  const cast = await withCast(typed.session);
  if (cast.missing)
    return {
      session: saved,
      note: '',
      missing: `the cast reading is not in ${CAST_CACHE}: read it with evals/cast-cache.ts --ask`,
    };
  return { session: cast.session, note: `${read.note}; typed readings of ${typed.read} moments from ${TYPED_CACHE}` };
}

async function withImpliedReadings(
  saved: Session,
  args: Args,
  needed: boolean,
): Promise<{ session: Session; note: string; missing?: string }> {
  if (!needed) return { session: saved, note: 'the story record is off: nothing implied is read' };
  if (args.noImply)
    return {
      session: saved,
      note: "not read (--no-imply): today's harness reads what each moment implies while it plans with the record on",
    };
  const { IMPLIED_CACHE, withImplied } = await import('./implied-cache');
  const { JEV_MODEL } = await import('./prompt-cases');
  const file = resolve(args.impliedCache ?? IMPLIED_CACHE);
  const how =
    'read them with --read-implied (model calls), name a cache with --implied-cache, or read none with --no-imply';
  if (!args.readImplied && !existsSync(file))
    return { session: saved, note: '', missing: `no cache of implied readings at ${file}: ${how}` };
  const { jevWithModel } = await import('../jev');
  // Never a model unless asked: a reading not in the cache is counted as asked, and refuses the dream.
  const noJev: JevFn = async (state, questions) => ({
    questions,
    state,
    answers: null,
    error: 'not in the cache',
    ms: 0,
    usage: null,
  });
  const noWriter: WriteFn = async () => {
    throw new Error('not in the cache');
  };
  const got = await withImplied(saved, {
    jevModel: JEV_MODEL(),
    cacheFile: file,
    ...(args.readImplied ? { jev: jevWithModel(JEV_MODEL()) } : { jev: noJev, write: noWriter }),
  });
  if (!args.readImplied && got.asked)
    return { session: saved, note: '', missing: `${got.asked} of its implied readings are not in ${file}: ${how}` };
  return {
    session: got.session,
    note: `${got.cached} readings from ${file}${got.asked ? `, ${got.asked} read now` : ''}`,
  };
}

// ── briefs ───────────────────────────────────────────────────────────────────────────────────────

const briefsFile = (f: Folders) => join(f.out, 'briefs.json');
/** The briefs written for the checkpoint's moments, by the set's id: each for the view it was written from. */
const loadBriefs = (f: Folders): Record<string, Brief> =>
  existsSync(briefsFile(f)) ? readJson<Record<string, Brief>>(briefsFile(f)) : {};

// ── the owner's verdicts on pictures ─────────────────────────────────────────────────────────────

/**
 * Every picture the owner has judged: his story verdicts, and his answers in every checkpoint kept beside
 * this one (each with its key, what each page picture was made from, and its results).
 */
async function loadJudged(f: Folders): Promise<Judged[]> {
  const core = await import('./checkpoint-set');
  const out = core.judgedInStory(core.loadVerdicts(), f.data);
  const all = dirname(f.out);
  if (!existsSync(all)) return out;
  for (const name of readdirSync(all).sort()) {
    const dir = join(all, name);
    const files = ['key.json', 'answers.json', join('judge', 'made.json'), 'results.json'].map((x) => join(dir, x));
    if (!files.every((x) => existsSync(x))) continue;
    const [key, answers, made, results] = files.map((x) => readJson<never>(x));
    out.push(...core.judgedInCheckpoint(name, { key, answers, made, results }));
  }
  return out;
}

// ── building a set ───────────────────────────────────────────────────────────────────────────────

type Built = {
  m: SetMoment;
  saved: Session;
  d?: DreamBuild;
  today?: Today;
  error?: string;
  /** What the old picture was drawn with, where it is known. */
  sent: Sent | null;
  /** The old picture's file; null for a pair whose base checkpoint has not drawn it, or in that base checkpoint. */
  oldFile: string | null;
  /** The picture before, in words: the run's file, or an earlier moment's new picture. */
  before?: string;
};

/** What a set is built against: all its moments, what the checkpoint has drawn, and the owner's verdicts. */
type BuildCtx = { all: SetMoment[]; results?: Pick<Results, 'entries'> | null; judged: Judged[] };

/** The results a checkpoint keeps, if it has drawn anything. */
const resultsIn = (f: Folders): Results | null =>
  existsSync(join(f.out, 'results.json')) ? readJson<Results>(join(f.out, 'results.json')) : null;

/**
 * Every moment of a set built as today's harness would send it, dream by dream, with the briefs written
 * for it where its view is the one they were written from. A moment drawn from an earlier moment of the
 * set is drawn from that one's new picture (known once it is drawn); it is refused when that one cannot
 * be drawn, or is neither drawn nor built with it. An earlier picture of the run the owner called wrong
 * is never sent.
 */
async function buildSet(
  moments: SetMoment[],
  args: Args,
  f: Folders,
  ctx: BuildCtx,
): Promise<{ built: Built[]; readings: Record<string, string> }> {
  const core = await import('./checkpoint-set');
  const { recordMode } = await import('../record');
  const { sameView } = await import('../camera');
  const pairedFile = join(f.data, 'runs', 'paired', 'results.json');
  const paired = existsSync(pairedFile) ? readJson<PairedResults>(pairedFile) : null;
  const briefs = loadBriefs(f);
  const built: Built[] = [];
  const readings: Record<string, string> = {};
  const drawnNew = (id: string) => {
    const r = ctx.results?.entries[id];
    return r?.state === 'ready' && r.output ? r.output : undefined;
  };
  for (const session of [...new Set(moments.map((m) => m.session))]) {
    const saved = readSession(f.data, session);
    const mine = moments.filter((x) => x.session === session);
    const here: DrawnHere = Object.fromEntries(
      ctx.all
        .filter((x) => x.session === session)
        .map((x) => [x.moment, { id: x.id, ...(drawnNew(x.id) ? { file: drawnNew(x.id) } : {}) }]),
    );
    const frozen = existsSync(frozenPath(session)) ? (loadDream(session, false).session as Session) : null;
    const read = await withReadings(saved, args, recordMode() === 'on');
    readings[session] = read.missing ? `NOT READ: ${read.missing}` : read.note;
    let d: DreamBuild | undefined;
    let failed = read.missing;
    if (!failed)
      try {
        d = core.buildDream(read.session);
        // A brief is given only where today's view is the one it was written from and the moment has none.
        const given: Record<string, Brief> = {};
        for (const m of mine) {
          const b = briefs[m.id];
          const p = d.r.pictures.find((x) => x.id === m.moment && x.kind === 'cut');
          const view = p?.item.frame?.plan?.view;
          if (b && view && b.view === view && !sameView(p?.item.shot?.view, view)) given[m.moment] = b;
        }
        if (Object.keys(given).length) d = core.buildDream(core.withBriefs(read.session, given));
      } catch (e) {
        failed = `could not be rebuilt: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`;
      }
    for (const m of mine) {
      const oldFile = oldFileOf(m, f);
      const before = core.pictureBefore(saved, m.moment);
      const frame = before ? saved.build?.frames?.find((x) => x.id === before && x.kind === 'cut') : undefined;
      const anew = before ? here[before] : undefined;
      const row: Built = {
        m,
        saved,
        sent: core.oldSentOf(m.old, m.moment, saved, frozen, paired),
        oldFile,
        ...(anew
          ? { before: `${before}'s new picture (${anew.id}): ${anew.file ?? 'drawn first in this checkpoint'}` }
          : frame?.mediaPath
            ? { before: join(f.media, frame.mediaPath) }
            : {}),
      };
      if (failed || !d) {
        built.push({ ...row, error: failed ?? 'not built' });
        continue;
      }
      try {
        const today = core.todayOf(d, m.moment, { media: f.media, here, judged: ctx.judged });
        if (today.briefless && !args.allowBriefless) today.refused.push(BRIEFLESS);
        if (m.old.draw === 'base' && !oldFile)
          today.refused.push(`its old picture is not drawn yet: draw checkpoint ${m.old.from} first`);
        else if (oldFile && !existsSync(oldFile))
          today.refused.push(
            `the old picture's file is not on this machine (${oldFile}): nothing to judge the new one against`,
          );
        built.push({ ...row, d, today });
      } catch (e) {
        built.push({ ...row, d, error: String(e instanceof Error ? e.message : e).slice(0, 300) });
      }
    }
  }
  // A moment drawn from an earlier one's new picture, not drawn yet, is drawn only after it and with it:
  // refused when that one cannot be drawn (and so on down a chain), or is not built with it.
  for (let more = true; more; ) {
    more = false;
    for (const b of built) {
      const t = b.today;
      if (!t) continue;
      for (const dep of core.dependsOf(t)) {
        if (t.images.some((im) => im.dependsOn === dep && im.file)) continue;
        const other = built.find((x) => x.m.id === dep);
        const why = !other
          ? `${DEPENDS}${dep}, which is not drawn yet: draw them together (name both with --only)`
          : !other.today || other.error || other.today.refused.length
            ? `${DEPENDS}${dep}, which cannot be drawn`
            : null;
        if (why && !t.refused.includes(why)) {
          t.refused.push(why);
          more = true;
        }
      }
    }
  }
  return { built, readings };
}

/** The moments of a set named with --only, or all of them; an unknown name is an error. */
function chosen(set: CheckpointSet, only: string[]): SetMoment[] {
  const unknown = only.filter((id) => !set.moments.some((m) => m.id === id));
  if (unknown.length) throw new Error(`not in the set: ${unknown.join(', ')}`);
  return only.length ? set.moments.filter((m) => only.includes(m.id)) : set.moments;
}

/** What the checkpoint has spent so far, from its results. */
async function spentSoFar(f: Folders): Promise<number> {
  const file = join(f.out, 'results.json');
  if (!existsSync(file)) return 0;
  const { spentIn } = await import('./checkpoint-set');
  return spentIn(readJson<Results>(file));
}

/** The results folder a set pins, against this one: a draw is counted against one ledger only. */
function pinned(set: CheckpointSet, f: Folders): string | null {
  if (!set.results) return `the set does not say where its results are kept: add "results": "${f.out}" to it`;
  return resolve(set.results) === f.out
    ? null
    : `the set's results are kept in ${set.results}, not ${f.out}: run from the checkout that has them (or set CHECKPOINT_DIR)`;
}

// ── --dry ────────────────────────────────────────────────────────────────────────────────────────

/**
 * --brief: each moment still without a brief for its view, and otherwise drawable, briefed by the writer
 * exactly as the harness briefs it (producer.ts shotFor, DREAMCHAT_WRITER); each kept in briefs.json with
 * its view. Returns what was written, and what the writer could not brief.
 */
/** How a shot is briefed: the harness's own (producer.ts shotFor), or a stand-in in the tests. */
export type ShotFn = (
  moment: string,
  facts: string,
  medium: string,
  mustName: string[],
  before?: string[],
  people?: string[],
) => Promise<string | null>;

async function writeBriefs(
  built: Built[],
  f: Folders,
  shot?: ShotFn,
): Promise<{ written: string[]; failed: string[] }> {
  const core = await import('./checkpoint-set');
  const shotFor = shot ?? (await import('../producer')).shotFor;
  const { WRITER_MODEL } = await import('../llm');
  const briefs = loadBriefs(f);
  const written: string[] = [];
  const failed: string[] = [];
  for (const b of built) {
    const t = b.today;
    // Briefed whatever else refuses it but its brief and the earlier moment it waits for.
    if (!t?.briefless || !b.d || t.refused.some((r) => r !== BRIEFLESS && !r.startsWith(DEPENDS))) continue;
    const ask = core.briefAskOf(b.d, b.m.moment);
    if (!ask) continue;
    const text = await shotFor(ask.action, ask.view, ask.medium, ask.mustName, ask.before, ask.people);
    if (!text) {
      failed.push(b.m.id);
      continue;
    }
    briefs[b.m.id] = { view: ask.view, text, writer: WRITER_MODEL, at: new Date().toISOString() };
    written.push(b.m.id);
    mkdirSync(f.out, { recursive: true });
    writeFileSync(briefsFile(f), `${JSON.stringify(briefs, null, 1)}\n`);
  }
  return { written, failed };
}

/** What a dry run keeps for --draw: what it built, as it built it, and what it was built under. */
export type DryFile = {
  checkpoint: string;
  set_hash: string;
  results: string;
  cap_usd: number;
  switches: Record<string, string>;
  checks: string;
  allow_briefless: boolean;
  moments: Record<
    string,
    { hash?: string; refused?: string[]; error?: string; brief?: Brief | null; depends?: string[] }
  >;
};

export async function dry(
  args: Args,
  set: CheckpointSet,
  setFile: string,
  f: Folders,
  opts: { shot?: ShotFn } = {},
): Promise<DryFile> {
  const core = await import('./checkpoint-set');
  const { changeLines, paragraphChanges } = await import('./corpus');
  const { USD_PER_PICTURE } = await import('./paired-arms');
  const { checksMode } = await import('../gate');
  const moments = chosen(set, args.only);
  const pin = pinned(set, f);
  if (pin && set.results) throw new Error(pin);
  const ctx: BuildCtx = { all: set.moments, results: resultsIn(f), judged: await loadJudged(f) };
  let { built, readings } = await buildSet(moments, args, f, ctx);
  const briefed = args.brief ? await writeBriefs(built, f, opts.shot) : null;
  if (briefed?.written.length) ({ built, readings } = await buildSet(moments, args, f, ctx));
  const reviewed = set.cap_usd ?? DEFAULT_CAP;
  const cap = capOf(set, args.cap);
  const spent = await spentSoFar(f);
  const now = knobs();
  const checks = checksMode();
  const drawable = built.filter((b) => b.today && !b.today.refused.length);
  const cost = drawable.length * USD_PER_PICTURE;
  mkdirSync(join(f.out, 'previs'), { recursive: true });
  const out: string[] = [
    `Checkpoint ${set.name}${set.step ? ` (${set.step})` : ''}: ${moments.length} moments from ${setFile}.`,
    `Switches: ${
      Object.keys(now).length
        ? Object.entries(now)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
        : "none set (today's defaults)"
    }.`,
    ...(set.switches && switchesDiffer(set.switches, now).length
      ? [`WARNING: the set was proposed under other switches: ${switchesDiffer(set.switches, now).join('; ')}.`]
      : []),
    `Saved conversations from ${f.data}/state; sketches and pictures from ${f.media}; results in ${f.out}.`,
    ...(pin ? [`WARNING: ${pin}; --draw refuses until it does.`] : []),
    `What each moment implies: ${Object.entries(readings)
      .map(([s, n]) => `${s.slice(-4)} ${n}`)
      .join('; ')}.`,
    checks === 'log'
      ? 'The pre-draw checks only log (DREAMCHAT_CHECKS unset or log): their Jev readings change nothing and are not taken here; only a fault code knows, which leaves a moment undrawn, refuses it.'
      : 'WARNING: DREAMCHAT_CHECKS=act: with the checks acting the harness may reword or hold a moment on a Jev reading before drawing it, which this build does not do; --draw refuses until the checks only log.',
    ...(briefed
      ? [
          `Briefs: ${briefed.written.length} written now by the writer (${briefed.written.join(', ') || 'none'})${briefed.failed.length ? `; the writer gave none usable for ${briefed.failed.join(', ')}` : ''}; kept in ${briefsFile(f)}.`,
        ]
      : []),
  ];
  const dump: DryFile['moments'] = {};
  for (const b of built) {
    const m = b.m;
    out.push('', '═'.repeat(100), `${m.id}: ${m.why} (${m.cases.join(', ')})`, `why: ${m.reason}`);
    out.push(
      m.old.draw === 'none'
        ? 'the old picture: none (this checkpoint draws the harness as it stands, for a pair judged in another)'
        : m.old.draw === 'base'
          ? `the old picture: ${b.oldFile ?? 'not drawn yet'} (drawn by checkpoint ${m.old.from}, the harness as it stands; never judged)`
          : `the old picture: ${b.oldFile} (${m.old.draw === 'story' ? 'drawn on the night' : `the paired test's ${m.old.draw} version`}); the owner called it ${m.old.verdict}${m.old.note ? `: "${m.old.note}"` : ''}`,
    );
    out.push(`the moment: ${m.description}`);
    out.push(`the picture before: ${b.before ?? 'none (the first the run drew)'}`);
    if (b.error || !b.today) {
      out.push(`NOT BUILT: ${b.error}`);
      dump[m.id] = { error: b.error ?? 'not built' };
      continue;
    }
    const t = b.today;
    if (t.previs) {
      const png = join(f.out, 'previs', `${m.id}.png`);
      writeFileSync(png, t.previs.png);
      for (const im of t.images) if (im.key === `previs:${t.moment}`) im.file = png;
    }
    out.push('', `images (${t.images.length}):`);
    for (const im of t.images)
      out.push(
        `  ${im.n}. ${im.role.padEnd(11)} ${im.what}: ${im.missing ? `MISSING: ${im.missing}` : (im.file ?? `depends on ${im.dependsOn}'s new picture: known once it is drawn`)}`,
      );
    const depends = core.dependsOf(t);
    if (depends.length)
      out.push(
        `drawn after ${depends.join(', ')}, from ${depends.length > 1 ? 'their' : 'its'} new picture${depends.length > 1 ? 's' : ''}, as the harness would; the hash holds the dependency, and --draw builds it again with the new picture and refuses it if anything else changed`,
      );
    out.push(
      t.brief
        ? `the shot's brief: ${t.brief.text === loadBriefs(f)[m.id]?.text ? 'written for this checkpoint' : "the run's own"}, for the view today's plan has`
        : t.briefless
          ? "the shot's brief: NONE for the view today's plan has"
          : "the shot's brief: none (no worked-out view)",
    );
    for (const n of t.notes) out.push(`note: ${n}`);
    const change = b.sent ? core.changeOf(b.sent, { prompt: t.prompt, images: core.namesOf(t) }) : null;
    if (b.sent) {
      out.push('', `against the prompt the old picture was drawn with (${core.changeWords(change as Change)}):`);
      if (JSON.stringify(b.sent.images) !== JSON.stringify(core.namesOf(t)))
        out.push(`  images: ${b.sent.images.join(', ')}`, `       -> ${core.namesOf(t).join(', ')}`);
      else out.push('  images: the same');
      const { gone, added } = paragraphChanges(b.sent.prompt, t.prompt);
      out.push(...(gone.length || added.length ? changeLines(gone, added) : ['  words: the same']));
    } else out.push('', 'what the old picture was drawn with is not known: no word diff');
    out.push('', 'the prompt:', ...t.prompt.split('\n').map((l) => `  | ${l}`));
    if (t.refused.length) out.push('', 'REFUSED, not drawn:', ...t.refused.map((r) => `  - ${r}`));
    else out.push('', `cost: ${money(USD_PER_PICTURE)}`);
    dump[m.id] = {
      hash: t.hash,
      refused: t.refused,
      brief: t.brief,
      ...(core.dependsOf(t).length ? { depends: core.dependsOf(t) } : {}),
      ...({
        notes: t.notes,
        prompt: t.prompt,
        images: t.images.map(({ n, role, key, name, what, instruction, file, missing, dependsOn }) => ({
          n,
          role,
          key,
          name,
          what,
          instruction,
          file: dependsOn ? null : (file ?? null),
          ...(dependsOn ? { depends_on: dependsOn } : {}),
          ...(missing ? { missing } : {}),
        })),
        previs: t.previs?.key ?? null,
        briefless: t.briefless,
        against_old: change,
      } as object),
    };
  }
  const refused = built.filter((b) => !b.today || b.today.refused.length);
  out.push(
    '',
    '═'.repeat(100),
    `${drawable.length} of ${built.length} moments can be drawn: ${drawable.length} pictures, ${money(cost)} at fal's list price (${money(USD_PER_PICTURE)} a picture, Nano Banana Pro at 2K, 16:9; each approved for at most what is left under the cap).`,
    `Spent so far in this checkpoint: ${money(spent)}; cap ${money(cap)}${cap < reviewed ? ` (--cap, under the set's ${money(reviewed)})` : ''}; after drawing these, ${money(spent + cost)}${spent + cost > cap + 1e-9 ? ': OVER THE CAP, --draw would refuse' : ''}.`,
  );
  if (refused.length) {
    out.push(`Refused, and not in the cost (${refused.length}):`);
    for (const b of refused) out.push(`  ${b.m.id}: ${b.error ?? b.today?.refused.join('; ')}`);
  }
  const text = out.join('\n');
  console.log(text);
  writeFileSync(join(f.out, 'dry.txt'), `${text}\n`);
  const kept: DryFile & Record<string, unknown> = {
    checkpoint: set.name,
    at: new Date().toISOString(),
    commit: commitOf(),
    set: setFile,
    set_hash: sha256(readFileSync(setFile, 'utf8')),
    results: f.out,
    cap_usd: reviewed,
    switches: now,
    checks,
    allow_briefless: args.allowBriefless,
    readings,
    moments: dump,
  };
  writeFileSync(join(f.out, 'dry.json'), `${JSON.stringify(kept, null, 1)}\n`);
  console.log(`\nwritten ${join(f.out, 'dry.txt')} and dry.json; mock-ups in ${join(f.out, 'previs')}`);
  return kept;
}

// ── --draw ───────────────────────────────────────────────────────────────────────────────────────

/** What --draw needs of the engine: the live one (liveEngine), or a stand-in in the tests. */
export type DrawEngine = {
  provider: string;
  /** The most one picture may be approved for, in US dollars (sheets.ts MAX_PER_IMAGE). */
  maxPerImage: number;
  /** The store it draws into. */
  home: string;
  call: (operation: string, body: unknown) => Promise<unknown>;
  startFrame: SheetEngine['startFrame'];
  status: SheetEngine['status'];
  setUp: typeof setUpDream;
  worker: () => { stop(): void } | null;
  /** How often a job is looked at while it is drawn. */
  pollMs?: number;
};

/** The engine as the dream chat drives it, on the store the checkpoint set. */
export async function liveEngine(): Promise<DrawEngine> {
  const { liveSheets, MAX_PER_IMAGE, PROVIDER, spawnWorker } = await import('../sheets');
  const { cli, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable } = await import('../strawberry');
  const { setUpDream: setUp } = await import('./paired-store');
  if (!strawberryAvailable()) throw new Error(`the Strawberry engine is not installed (${STRAWBERRY_PYTHON})`);
  return {
    provider: PROVIDER,
    maxPerImage: MAX_PER_IMAGE,
    home: resolve(STRAWBERRY_HOME),
    call: (operation, body) => cli(['call', operation, '-'], body),
    startFrame: (x) => liveSheets.startFrame(x),
    status: (jobId, nodeId) => liveSheets.status(jobId, nodeId),
    setUp,
    worker: () => spawnWorker(STRAWBERRY_PYTHON, REPO),
  };
}

/** One draw at a time: a lock file in the results folder, made only if none is there. Returns its release. */
export function lockDraw(out: string): () => void {
  const file = join(out, 'draw.lock');
  mkdirSync(out, { recursive: true });
  let fd: number;
  try {
    fd = openSync(file, 'wx');
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e;
    const held = readFileSync(file, 'utf8').trim();
    throw new Error(
      `another --draw of this checkpoint holds ${file} (${held}): wait for it to end; if none is running, look at the store and results.json first, then remove the file`,
    );
  }
  writeSync(fd, `pid ${process.pid}, since ${new Date().toISOString()}\n`);
  closeSync(fd);
  return () => rmSync(file, { force: true });
}

/** Every job in the checkpoint's store, with the moment's node its recipe is for. */
export async function storeJobs(call: DrawEngine['call']): Promise<StoreJob[]> {
  const out: StoreJob[] = [];
  for (const project of (await call('projects', {})) as { id: string }[]) {
    const p = (await call('project', { id: project.id })) as {
      jobs?: { id: string; recipe_id?: string; state: string }[];
      recipes?: { id: string; node_id: string }[];
    };
    const nodeOf = new Map((p.recipes ?? []).map((r) => [r.id, r.node_id]));
    for (const j of p.jobs ?? []) out.push({ id: j.id, state: j.state, node: nodeOf.get(j.recipe_id ?? '') ?? null });
  }
  return out;
}

/**
 * Draws what the last dry run printed and did not refuse, into the checkpoint's own store, under its cap.
 * `opts.allowFake` lets the engine's offline provider stand in (the tests); the command draws on fal only.
 */
export async function draw(
  args: Args,
  set: CheckpointSet,
  setFile: string,
  f: Folders,
  engine: DrawEngine,
  opts: { allowFake?: boolean } = {},
): Promise<Results> {
  const core = await import('./checkpoint-set');
  const { writeWhole } = await import('./checkpoint-judge');
  const { USD_PER_PICTURE } = await import('./paired-arms');
  const { checksMode } = await import('../gate');
  if (!(engine.provider === 'fal' || (opts.allowFake && engine.provider === 'fake')))
    throw new Error(
      `draws on fal only, and the provider is ${engine.provider}: run it with bun --env-file=$HOME/.config/strawberry/dreamchat.env`,
    );
  if (resolve(engine.home) !== f.home) throw new Error(`the engine's store is ${engine.home}, not ${f.home}`);
  if (checksMode() !== 'log')
    throw new Error(
      'the checks act (DREAMCHAT_CHECKS=act): the harness would reword or hold moments on a Jev reading, which a checkpoint does not do. Draw with the checks only logging (the default).',
    );
  const pin = pinned(set, f);
  if (pin) throw new Error(pin);
  // Only what the last dry run printed is drawn: it was read before anything was paid for.
  const dryFile = join(f.out, 'dry.json');
  if (!existsSync(dryFile)) throw new Error(`no dry run of ${set.name}: run --dry first and read it (${dryFile})`);
  const dryRun = readJson<DryFile>(dryFile);
  if (dryRun.set_hash !== sha256(readFileSync(setFile, 'utf8')))
    throw new Error(`${setFile} changed since the dry run: run --dry again and read it`);
  if (dryRun.results !== f.out) throw new Error(`the dry run kept its results in ${dryRun.results}, not ${f.out}`);
  if (dryRun.cap_usd !== (set.cap_usd ?? DEFAULT_CAP))
    throw new Error(`the set's cap is not the one the dry run was read with: run --dry again and read it`);
  const moved = switchesDiffer(dryRun.switches, knobs());
  if (moved.length)
    throw new Error(`the switches differ from the dry run's: ${moved.join('; ')}. Run --dry again and read it.`);
  const cap = capOf(set, args.cap);

  const release = lockDraw(f.out);
  const resultsFile = join(f.out, 'results.json');
  // One results file for the checkpoint, whatever the day: everything it records counts against the cap.
  const results: Results = existsSync(resultsFile)
    ? readJson<Results>(resultsFile)
    : {
        about: `The moments of ${setFile} drawn once more by evals/checkpoint.ts, each by today's harness under the switches of its dry run, to be judged blind against the old picture. Every attempt that reached the worker counts against the checkpoint's cap.`,
        checkpoint: set.name,
        home: f.home,
        provider: engine.provider,
        model: engine.provider === 'fal' ? 'nano_banana_pro' : 'fixture',
        entries: {},
      };
  const save = () => writeWhole(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
  let worker: { stop(): void } | null = null;
  try {
    if (results.home !== f.home) throw new Error(`this checkpoint was drawn into ${results.home}, not ${f.home}`);
    const moments = chosen(set, args.only);
    const ctx: BuildCtx = { all: set.moments, results, judged: await loadJudged(f) };
    const { built } = await buildSet(moments, args, f, ctx);
    const ready: Built[] = [];
    for (const b of built) {
      const was = dryRun.moments[b.m.id];
      if (!was) console.log(`${b.m.id}: not in the dry run: run --dry again and read it`);
      else if (was.error || !was.hash) console.log(`${b.m.id}: the dry run could not build it (${was.error})`);
      else if (was.refused?.length) console.log(`${b.m.id}: refused in the dry run: ${was.refused.join('; ')}`);
      else if (!b.today || b.error) console.log(`${b.m.id}: not built (${b.error})`);
      else if (b.today.refused.length) console.log(`${b.m.id}: refused: ${b.today.refused.join('; ')}`);
      else if (was.hash !== b.today.hash)
        console.log(`${b.m.id}: its prompt or images changed since the dry run: run --dry again and read it`);
      else ready.push(b);
    }

    // Every job in the store is one of the checkpoint's: one the results do not know may be paid for.
    const settled = core.reconcileStore(results, await storeJobs(engine.call));
    for (const { id, job } of settled.adopted) {
      // Kept, counted, and looked at again below like any job still in the worker's hands.
      Object.assign(results.entries[id], {
        jobId: job.id,
        state: 'adopted',
        error: `the run stopped while it was being started; its job was found in the store (${job.state})`,
      });
      console.log(`${id}: its job ${job.id} was found in the store (${job.state}), kept and counted`);
    }
    for (const id of settled.unsent) {
      Object.assign(results.entries[id], {
        state: 'refused',
        error: 'the run stopped while it was being started, and no job of it is in the store: nothing was sent',
      });
      console.log(`${id}: stopped while it was being started, and never reached the engine`);
    }
    if (settled.adopted.length || settled.unsent.length) save();
    if (settled.stray.length)
      throw new Error(
        `${f.home} has ${settled.stray.length} ${settled.stray.length > 1 ? 'jobs' : 'job'} that ${resultsFile} does not know (${settled.stray.map((j) => `${j.id} ${j.state}`).join(', ')}), up to ${money(settled.stray.length * engine.maxPerImage)} that may have been paid for: settle them before drawing again`,
      );

    // Every moment's attempts are looked at, so one still in the worker's hands is waited for; only a
    // moment built as its dry run printed it is sent.
    const plan = core.whatToDraw(
      moments.map((m) => m.id),
      results,
      { only: args.only, redrawPaid: args.redrawPaid },
    );
    for (const s of plan.skipped) console.log(`${s.id}: ${s.why}`);
    const todo = ready.filter((b) => plan.todo.includes(b.m.id));
    const before = core.spentIn(results);
    console.log(
      `${todo.length} pictures to draw, about ${money(todo.length * USD_PER_PICTURE)}; ${money(before)} spent in this checkpoint before; cap ${money(cap)}.`,
    );
    const over = core.overCap(before, todo.length, cap);
    if (over) throw new Error(`refused: ${over}`);

    // In story order, dream by dream, in waves: a moment drawn from an earlier moment's new picture waits
    // until that is drawn, is built again with it, and is drawn only if nothing but that picture changed.
    const waiting = plan.waiting.map((id) => results.entries[id]).filter((r): r is Attempt => !!r);
    let pending = [...todo].sort(
      (a, b) =>
        a.m.session.localeCompare(b.m.session) ||
        core.storyIndex(a.saved, a.m.moment) - core.storyIndex(b.saved, b.m.moment),
    );
    worker = pending.length || waiting.length ? engine.worker() : null;
    const known = () => new Set(core.attemptsOf(results).flatMap((r) => (r.jobId ? [r.jobId] : [])));
    const until = Date.now() + Number(process.env.CHECKPOINT_WAIT_MS ?? 60 * 60_000);
    let spent = before;

    /** Every job in the worker's hands waited for, until done or the wait is over; one that fails is reported, never drawn again. */
    const waitFor = async () => {
      while (waiting.some((r) => !core.DONE.has(r.state)) && Date.now() < until) {
        await Bun.sleep(engine.pollMs ?? 5000);
        for (const r of waiting) {
          if (core.DONE.has(r.state) || !r.jobId || !r.nodeId) continue;
          const st: { state: string; error?: string; mediaPath?: string } = await engine
            .status(r.jobId, r.nodeId)
            .catch((err) => ({ state: r.state, error: String(err) }));
          if (st.state === r.state) continue;
          const job = (await engine.call('job', { id: r.jobId })) as {
            provider_id?: string | null;
            receipt?: unknown;
            error?: string | null;
            events?: unknown;
          };
          Object.assign(r, {
            state: st.state,
            providerId: job.provider_id ?? null,
            receipt: job.receipt,
            events: job.events,
            ...(job.error || st.error ? { error: job.error ?? st.error } : {}),
          });
          if (st.state === 'ready' && st.mediaPath) r.output = join(f.home, 'media', st.mediaPath);
          console.log(`${r.id}: ${r.state}${r.error ? ` (${r.error.slice(0, 300)})` : ''}`);
          save();
        }
      }
    };
    const inHand = (id: string) => waiting.some((r) => r.id === id && !core.DONE.has(r.state));
    type Setup = Awaited<ReturnType<DrawEngine['setUp']>>;
    /** A moment's attempt as the results keep it, before anything is sent. */
    const attemptOf = (b: Built, setup?: Setup): Attempt => {
      const t = b.today as Today;
      const earlier = core.earlierOf(results.entries[b.m.id]);
      return {
        id: b.m.id,
        session: b.m.session,
        moment: b.m.moment,
        hash: t.hash,
        prompt: t.prompt,
        images: t.images.map((im) => ({
          n: im.n,
          role: im.role,
          key: im.key,
          what: im.what,
          file: im.key.startsWith('previs:') ? join(f.out, 'previs', `${b.m.id}.png`) : (im.file ?? ''),
          mediaId: setup?.media.get(im.key),
          instruction: im.instruction,
        })),
        switches: knobs(),
        state: 'refused',
        ...(setup ? { nodeId: setup.ids[b.m.moment] } : {}),
        at: new Date().toISOString(),
        ...(earlier.length ? { earlier } : {}),
      };
    };
    /** A moment not drawn, nothing sent: kept as refused, so a later --draw draws it. */
    const refuse = (b: Built, error: string) => {
      results.entries[b.m.id] = { ...attemptOf(b), error };
      console.log(`${b.m.id}: refused (${error.slice(0, 300)})`);
      save();
    };

    while (pending.length) {
      const wave = pending.filter((b) =>
        core.dependsOf(b.today).every((id) => !pending.some((p) => p.m.id === id) && !inHand(id)),
      );
      if (!wave.length) {
        // All that is left draws from a picture still in the worker's hands.
        await waitFor();
        if (waiting.some((r) => !core.DONE.has(r.state))) break;
        continue;
      }
      pending = pending.filter((b) => !wave.includes(b));
      // Built again with the new pictures it draws from: the hash holds each as a dependency, so any other
      // change since the dry run refuses it.
      const again = wave.filter((b) => core.dependsOf(b.today).length);
      const rebuilt = again.length ? (await buildSet(again.map((b) => b.m), args, f, { ...ctx, results })).built : [];
      const go: Built[] = [];
      for (const b of wave) {
        const deps = core.dependsOf(b.today);
        if (!deps.length) {
          go.push(b);
          continue;
        }
        const notDrawn = deps.filter((id) => results.entries[id]?.state !== 'ready' || !results.entries[id]?.output);
        const nb = rebuilt.find((x) => x.m.id === b.m.id);
        if (notDrawn.length)
          refuse(
            b,
            `not drawn: it draws from the new picture of ${notDrawn.map((id) => `${id} (${results.entries[id]?.state ?? 'not drawn'})`).join(', ')}, which was not drawn`,
          );
        else if (!nb?.today || nb.error || nb.today.refused.length)
          refuse(
            b,
            `not drawn: built again with the new picture of ${deps.join(', ')}: ${nb?.error ?? nb?.today?.refused.join('; ') ?? 'not built'}`,
          );
        else if (nb.today.hash !== (b.today as Today).hash)
          refuse(
            b,
            `not drawn: built again with the new picture of ${deps.join(', ')}, its prompt or images changed beyond that picture since the dry run: run --dry again and read it`,
          );
        else go.push(nb);
      }

      // Each dream written into the checkpoint's store, with every sketch and picture its moments attach
      // (an earlier moment's new picture in place of the run's).
      const setups = new Map<string, Setup>();
      for (const session of new Set(go.map((b) => b.m.session))) {
        const mine = go.filter((b) => b.m.session === session);
        const d = mine[0].d as DreamBuild;
        const files = Object.fromEntries(
          mine.flatMap((b) =>
            (b.today as Today).images.flatMap((im) => (im.dependsOn && im.file ? [[im.key, im.file]] : [])),
          ),
        );
        console.log(`putting ${session} into ${f.home}…`);
        setups.set(
          session,
          await engine.setUp(
            mine[0].saved,
            core.partsOf(d),
            mine.map((b) => core.toDrawOf(d, b.m.id, b.today as Today)),
            {
              media: f.media,
              previsDir: join(f.out, 'previs'),
              reason: `Drawn once more for checkpoint ${set.name}, to be judged blind against the picture drawn before; what it is drawn from is in its references`,
              ...(Object.keys(files).length ? { files } : {}),
            },
          ),
        );
      }

      for (const b of go) {
        const t = b.today as Today;
        const setup = setups.get(b.m.session);
        const r = attemptOf(b, setup);
        const images = r.images;
        results.entries[b.m.id] = r;
        const lost = images.filter((im) => !im.mediaId).map((im) => im.key);
        const room = cap - spent;
        const p = b.d?.r.pictures.find((x) => x.id === b.m.moment && x.kind === 'cut');
        if (!setup || lost.length || !p)
          r.error = `not drawn: ${lost.join(', ') || 'its dream'} could not be put into the checkpoint's store`;
        else if (room + 1e-9 < USD_PER_PICTURE)
          Object.assign(r, { state: 'capped', error: `not drawn: the ${money(cap)} cap is reached` });
        else {
          // Kept before the engine is asked: a run that stops now leaves an attempt the next one settles.
          r.state = 'starting';
          save();
          try {
            const started = await engine.startFrame({
              item: { ...p.item, nodeId: setup.ids[b.m.moment], version: 1 },
              prompt: t.prompt,
              references: images.map((im) => ({
                media_id: im.mediaId as string,
                role: im.role,
                instruction: im.instruction,
              })),
              reason: `Drawn once more for checkpoint ${set.name}, to be judged blind against the picture drawn before; approved within a ${money(cap)} cap for the checkpoint, ${money(room)} of it left.`,
              // Never approved for more than is left under the cap.
              maxUsd: Math.min(engine.maxPerImage, room),
              intent: `Checkpoint ${set.name}: ${p.item.name}`,
              shape: '16:9',
            });
            Object.assign(r, { state: 'queued', recipeId: started.recipeId, jobId: started.jobId, usd: started.usd });
            spent += typeof started.usd === 'number' ? started.usd : engine.maxPerImage;
            waiting.push(r);
          } catch (err) {
            // A job may still have been made before the error: looked for, and kept, before anything is called refused.
            const error = String(err).slice(0, 1000);
            const jobs = await storeJobs(engine.call).catch(() => null);
            const made = jobs?.find((j) => j.node === r.nodeId && !known().has(j.id));
            if (made) {
              Object.assign(r, { state: 'adopted', jobId: made.id, error });
              spent += engine.maxPerImage;
              waiting.push(r);
            } else if (jobs) Object.assign(r, { state: 'refused', error });
            // Not knowing whether a job was made, it stays `starting` (the next run looks again) and counts as
            // spent in this one.
            else {
              Object.assign(r, { error: `${error}; the store could not be read to see whether a job was made` });
              spent += engine.maxPerImage;
            }
          }
        }
        console.log(
          `${b.m.id}: ${r.state}${r.jobId ? ` as job ${r.jobId}` : ''}${r.error ? ` (${r.error.slice(0, 300)})` : ''}`,
        );
        save();
      }
    }
    for (const b of pending)
      console.log(
        `${b.m.id}: waits for the new picture of ${core.dependsOf(b.today).join(', ')}, still being drawn; --draw again draws it after`,
      );

    // Every job waited for; one that fails is reported, never drawn again.
    await waitFor();
    for (const r of waiting.filter((x) => !core.DONE.has(x.state)))
      console.log(`${r.id}: still ${r.state} as job ${r.jobId}; --draw again waits for it`);
    const all = Object.values(results.entries);
    console.log(
      `\n${all.filter((r) => r.state === 'ready').length} drawn, ${all.filter((r) => r.state !== 'ready' && core.DONE.has(r.state)).length} not; ${money(core.spentIn(results))} spent in this checkpoint at the engine's estimates. Results: ${resultsFile}. To judge: bun run evals/checkpoint.ts --judge ${setFile}`,
    );
    return results;
  } finally {
    worker?.stop();
    save();
    release();
  }
}

// ── --judge and --score ──────────────────────────────────────────────────────────────────────────

/**
 * The judging data from what the checkpoint has drawn: each moment drawn, old and new as A and B, beside
 * the picture before, with its line and what the dreamer said. The key is written once for each moment
 * and never changed; a moment drawn later is placed to keep the drawn ones balanced. Each picture is made
 * for the page once, the old and the new alike, and made again only when the picture it is made from
 * changes; the key stays beside the results, never in the folder the page serves.
 */
async function writeJudge(set: CheckpointSet, f: Folders): Promise<JudgeData> {
  const core = await import('./checkpoint-set');
  const { fileHash, judgeSetOf, mergeKey, writeWhole } = await import('./checkpoint-judge');
  const { toldOf } = await import('./paired-arms');
  const resultsFile = join(f.out, 'results.json');
  if (!existsSync(resultsFile)) throw new Error(`nothing drawn in checkpoint ${set.name} yet (${resultsFile})`);
  const results = readJson<Results>(resultsFile);
  const v = core.loadVerdicts();
  const ms: ToJudge[] = [];
  const saved = new Map<string, Session>();
  const sessionOf = (id: string) => {
    if (!saved.has(id)) saved.set(id, readSession(f.data, id));
    return saved.get(id) as Session;
  };
  // In story order, dream by dream: the order of the page says nothing of old and new, or of why.
  const inStory = [...set.moments].sort(
    (a, b) => a.session.localeCompare(b.session) || Number(a.moment.slice(1)) - Number(b.moment.slice(1)),
  );
  for (const m of inStory) {
    const r = results.entries[m.id];
    if (r?.state !== 'ready' || !r.output || !existsSync(r.output)) continue;
    const s = sessionOf(m.session);
    const old = oldFileOf(m, f);
    // In a base checkpoint nothing is judged; a pair whose base picture is not drawn waits for it.
    if (!old) continue;
    if (!existsSync(old)) throw new Error(`${m.id}: the old picture's file is not on this machine (${old})`);
    // The picture before: the one the new picture was drawn from, as sent (an earlier moment's new
    // picture where the checkpoint drew it first); else the moment before, new where drawn again here.
    const drawnNew = Object.fromEntries(
      set.moments
        .filter((x) => x.session === m.session && results.entries[x.id]?.state === 'ready')
        .flatMap((x) => (results.entries[x.id]?.output ? [[x.moment, results.entries[x.id].output as string]] : [])),
    );
    const runFile = (prev: string) => {
      const judged = v.story.find((x) => x.session === m.session && x.moment === prev);
      const frame = s.build?.frames?.find((x) => x.id === prev && x.kind === 'cut');
      return judged
        ? join(f.data, 'strawberry-home', 'media', judged.picture)
        : frame?.mediaPath
          ? join(f.media, frame.mediaPath)
          : null;
    };
    const before = core.beforeOnPage(s, m.moment, r.images, drawnNew, runFile);
    ms.push({
      id: m.id,
      title: `${s.draft?.breakdown?.title ?? m.run}, ${m.moment}`,
      description: m.description,
      told: toldOf(s),
      old,
      new: r.output,
      before: before && existsSync(before) ? before : null,
    });
  }
  if (!ms.length) throw new Error(`nothing drawn in checkpoint ${set.name} yet`);
  const keyFile = join(f.out, 'key.json');
  const key: AnswerKey = existsSync(keyFile) ? readJson<AnswerKey>(keyFile) : {};
  const drawn = set.moments.filter((m) => ms.some((x) => x.id === m.id));
  const order = core.abOrder(set.name, drawn, Object.fromEntries(Object.entries(key).map(([id, k]) => [id, k.a])));
  const made = judgeSetOf(set.name, ms, order, 'jpg');
  const merged = mergeKey(key, made.key);
  if (JSON.stringify(merged) !== JSON.stringify(key)) writeWhole(keyFile, `${JSON.stringify(merged, null, 1)}\n`);
  const judge = join(f.out, 'judge');
  mkdirSync(join(judge, 'img'), { recursive: true });
  const madeFile = join(judge, 'made.json');
  const madeFrom: Record<string, { from: string; sha: string | null }> = existsSync(madeFile) ? readJson(madeFile) : {};
  for (const c of made.copies) {
    const sha = fileHash(c.from);
    const to = join(judge, c.to);
    if (madeFrom[c.to]?.from === c.from && madeFrom[c.to]?.sha === sha && existsSync(to)) continue;
    reencode(c.from, to);
    madeFrom[c.to] = { from: c.from, sha };
    writeWhole(madeFile, `${JSON.stringify(madeFrom, null, 1)}\n`);
  }
  writeWhole(join(judge, 'data.json'), `${JSON.stringify(made.data, null, 1)}\n`);
  return made.data;
}

async function judge(args: Args, set: CheckpointSet, f: Folders): Promise<void> {
  const { serveJudge } = await import('./checkpoint-judge');
  const data = await writeJudge(set, f);
  const answersFile = join(f.out, 'answers.json');
  const { url } = serveJudge({ dir: join(f.out, 'judge'), answersFile, data, port: args.port });
  console.log(
    `Judging ${data.moments.length} moments of checkpoint ${set.name}: open ${url}\nEach answer is written to ${answersFile} as it is given. Ctrl-C to stop; then: bun run evals/checkpoint.ts --score ${set.name}`,
  );
}

async function score(set: CheckpointSet, f: Folders): Promise<void> {
  const { emptyAnswers, scoreLines, scoreOf, shownNow } = await import('./checkpoint-judge');
  const keyFile = join(f.out, 'key.json');
  const dataFile = join(f.out, 'judge', 'data.json');
  if (!existsSync(keyFile) || !existsSync(dataFile)) throw new Error(`no judging yet (${keyFile}): run --judge first`);
  const answersFile = join(f.out, 'answers.json');
  const got = existsSync(answersFile) ? readJson<Answers>(answersFile) : emptyAnswers(set.name);
  const now = shownNow(join(f.out, 'judge'), readJson<JudgeData>(dataFile));
  const s = scoreOf(set, readJson<AnswerKey>(keyFile), got, now);
  const text = scoreLines(s).join('\n');
  console.log(text);
  writeFileSync(join(f.out, 'score.json'), `${JSON.stringify(s, null, 1)}\n`);
  writeFileSync(join(f.out, 'score.txt'), `${text}\n`);
  console.log(`\nwritten ${join(f.out, 'score.json')} and score.txt`);
}

// ── --set-from-cases ─────────────────────────────────────────────────────────────────────────────

async function fromCases(args: Args): Promise<void> {
  const step = args.target as string;
  const name = args.name ?? step.toLowerCase();
  // The store is set before any module that reads it is loaded: the dreams the cases name, read as text.
  const listed = readJson<{ cases: { session: string }[] }>(join(import.meta.dir, 'prompt-cases.json')).cases;
  const f = foldersOf(name, [...new Set(listed.map((c) => c.session))]);
  const { loadCases } = await import('./prompt-cases');
  const cases = loadCases();
  const core = await import('./checkpoint-set');
  const { recordMode } = await import('../record');
  const { moments } = await import('../producer');
  const { USD_PER_PICTURE } = await import('./paired-arms');
  const cap = args.cap ?? DEFAULT_CAP;
  const pairedFile = join(f.data, 'runs', 'paired', 'results.json');
  const paired = existsSync(pairedFile) ? readJson<PairedResults>(pairedFile) : null;
  const judged = await loadJudged(f);
  const { candidates, unknown } = core.candidatesOf(cases, step, core.loadVerdicts(), f.data, paired, judged);
  // What the changes are measured against: the step's own switch unset, the switches named, or the
  // prompt each old picture was drawn with.
  const old = args.base.includes('old');
  const over: Record<string, string> = old
    ? {}
    : args.base.length
      ? Object.fromEntries(args.base.map((b) => [b.slice(0, b.indexOf('=')), b.slice(b.indexOf('=') + 1)]))
      : core.STEP_SWITCHES[step]
        ? { [core.STEP_SWITCHES[step]]: '' }
        : {};
  if (!old && !Object.keys(over).length)
    throw new Error(
      `${step} has no switch known here: name what its changes are measured against with --base NAME=VALUE (or --base old)`,
    );
  const baseWords = old
    ? 'the prompt each old picture was drawn with'
    : Object.entries(over)
        .map(([k, v]) => (v ? `${k}=${v}` : `${k} unset`))
        .join(', ');
  const now = knobs();
  const same = !old && Object.entries(over).every(([k, v]) => (now[k] ?? '') === v);
  const recordNeeded =
    recordMode() === 'on' || (!old && (over.DREAMCHAT_RECORD ?? now.DREAMCHAT_RECORD ?? '') === 'on');
  const measured: Measured[] = [];
  const readings: Record<string, string> = {};
  for (const session of [...new Set(candidates.map((c) => c.session))]) {
    const saved = readSession(f.data, session);
    const frozen = existsSync(frozenPath(session)) ? (loadDream(session, false).session as Session) : null;
    const b = saved.draft?.breakdown;
    // The moment's line, where the verdict row does not give it: its words as the breakdown has them.
    const mine = candidates
      .filter((c) => c.session === session)
      .map((c) => ({
        ...c,
        description: c.description ?? (b ? moments(b).find((x) => x.id === c.moment)?.action : undefined) ?? c.moment,
      }));
    const read = await withReadings(saved, args, recordNeeded);
    readings[session] = read.missing ? `NOT READ: ${read.missing}` : read.note;
    if (read.missing) {
      for (const c of mine) measured.push({ ...c, error: read.missing });
      continue;
    }
    let d: DreamBuild;
    let baseD: DreamBuild | null = null;
    try {
      d = core.buildDream(read.session);
      if (!old) baseD = await withEnv(over, () => core.buildDream(read.session));
    } catch (e) {
      for (const c of mine) measured.push({ ...c, error: `could not be rebuilt: ${String(e).slice(0, 300)}` });
      continue;
    }
    for (const c of mine) {
      try {
        // Drawn from the new pictures of the other candidates of its dream, and, where it draws from one,
        // from the run's too, as it is drawn when that one is not in the set.
        const here: DrawnHere = Object.fromEntries(
          candidates.filter((x) => x.session === session && x.id !== c.id).map((x) => [x.moment, { id: x.id }]),
        );
        const today = core.todayOf(d, c.moment, { media: f.media, here, judged });
        const alone = core.dependsOf(today).length ? core.todayOf(d, c.moment, { media: f.media, judged }) : undefined;
        const oldFile = core.pictureFile(f.data, c.old.picture);
        if (!existsSync(oldFile))
          for (const t of [today, alone])
            t?.refused.push(
              `the old picture's file is not on this machine (${oldFile}): nothing to judge the new one against`,
            );
        let before: { prompt: string; images: string[]; previs?: string | null } | null;
        if (old) before = core.oldSentOf(c.old, c.moment, saved, frozen, paired);
        else {
          const base = baseD as DreamBuild;
          const t = await withEnv(over, () => core.todayOf(base, c.moment, { media: f.media }));
          before = { prompt: t.prompt, images: core.namesOf(t), previs: t.previs?.key ?? null };
        }
        if (!before) {
          measured.push({ ...c, today, error: 'what the old picture was drawn with is not known' });
          continue;
        }
        const after = { prompt: today.prompt, images: core.namesOf(today), previs: today.previs?.key ?? null };
        measured.push({ ...c, today, ...(alone ? { alone } : {}), change: core.changeOf(before, after) });
      } catch (e) {
        measured.push({ ...c, error: String(e instanceof Error ? e.message : e).slice(0, 300) });
      }
    }
  }
  const spent = await spentSoFar(f);
  const proposal = core.proposeSet(measured, {
    name,
    step,
    cap,
    spent,
    switches: now,
    base: baseWords,
    results: f.out,
  });
  const line = (m: Measured) =>
    `${m.id.padEnd(22)} ${m.why.padEnd(5)} ${m.cases.map((c) => c.id).join(', ')}; old ${m.old.draw} ${m.old.verdict}${m.relabelled ? ` (${m.relabelled})` : ''}${m.change ? `; changed ${core.changeWords(m.change)}` : ''}${m.today?.briefless ? '; needs a brief (--dry --brief)' : ''}`;
  const listed2 = (title: string, xs: Measured[], why?: (m: Measured) => string) =>
    xs.length ? ['', `${title} (${xs.length}):`, ...xs.map((m) => `  ${line(m)}${why ? `: ${why(m)}` : ''}`)] : [];
  const kept = proposal.set.moments.map((m) => measured.find((x) => x.id === m.id) as Measured);
  const out: string[] = [
    `Proposed checkpoint ${name} for ${step}, under ${
      Object.keys(now).length
        ? Object.entries(now)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
        : "today's defaults (no switch set)"
    }; changes measured against ${baseWords}.`,
    `What each moment implies: ${Object.entries(readings)
      .map(([s, n]) => `${s.slice(-4)} ${n}`)
      .join('; ')}.`,
    ...(same
      ? [
          `NOTE: ${baseWords} is how the switches already are, so nothing can change against it: set the step's switch (and what it needs) first, or name another base with --base.`,
        ]
      : []),
    `${candidates.filter((c) => c.why === 'fault').length} moments with a counted fault case of ${step} and ${candidates.filter((c) => c.why === 'guard').length} guard moments looked at; cap ${money(cap)} (${money(spent)} spent in this checkpoint): room for ${core.roomUnder(cap, spent)} pictures at ${money(USD_PER_PICTURE)}.`,
    '',
    `In the set (${kept.length}):`,
    ...kept.map(
      (m, i) =>
        `  ${String(i + 1).padStart(2)}. ${line(m)}${m.old.note ? `\n      the owner: "${m.old.note.slice(0, 200)}"` : ''}`,
    ),
    ...listed2('Over the cap, most changed first', proposal.over),
    ...listed2('Changed, but cannot be drawn', proposal.refused, (m) => (m.today as Today).refused.join('; ')),
    ...listed2('Not built', proposal.failed, (m) => m.error ?? 'not built'),
    ...listed2(`Unchanged against ${baseWords}`, proposal.unchanged),
  ];
  if (unknown.length)
    out.push('', `Cases whose verdict row is missing: ${unknown.map((u) => `${u.case} (${u.why})`).join('; ')}`);
  const file = resolve(args.out ?? join(f.out, 'proposed-set.json'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(proposal.set, null, 2)}\n`);
  out.push(
    '',
    `written ${file}: for a person to confirm. To use it, save it as evals/checkpoint-${name}.json (and commit it), then: DREAMCHAT_WRITER=claude bun run evals/checkpoint.ts --dry evals/checkpoint-${name}.json --brief`,
  );
  console.log(out.join('\n'));
}

// ── the command ──────────────────────────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if ('error' in args) {
    console.error(`${args.error}\n\n${USAGE}`);
    process.exit(1);
  }
  if (args.mode === 'set-from-cases') return fromCases(args);
  const setFile = setFileOf(args.target as string);
  // Its shape is checked once the modules are loaded: the store must be set before that.
  const raw = readJson<CheckpointSet>(setFile);
  const f = foldersOf(raw.name, [...new Set((raw.moments ?? []).map((m) => m.session))]);
  const { loadSet } = await import('./checkpoint-set');
  const set = loadSet(setFile);
  mkdirSync(f.out, { recursive: true });
  if (args.mode === 'dry') {
    await dry(args, set, setFile, f);
    return;
  }
  if (args.mode === 'draw') {
    await draw(args, set, setFile, f, await liveEngine());
    return;
  }
  if (args.mode === 'judge') return judge(args, set, f);
  return score(set, f);
}

if (import.meta.main)
  await main(process.argv.slice(2)).catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  });
