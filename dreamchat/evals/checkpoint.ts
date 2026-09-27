// A picture checkpoint: after a step of HARNESS_PLAN.md, a few moments drawn once more by today's full
// harness under the switches as set, each put old against new and judged blind by the owner. Does a
// moment the owner called wrong now come out right, and does one he called right stay right?
//
//   bun run evals/checkpoint.ts --set-from-cases S4 [--base NAME=VALUE … | --base old] [--cap 3] [--name s4] [--out <file>]
//   bun run evals/checkpoint.ts --dry evals/checkpoint-s4.json [--only <id> …]
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/checkpoint.ts --draw evals/checkpoint-s4.json [--cap 3] [--only <id> …] [--redraw-paid]
//   bun run evals/checkpoint.ts --judge evals/checkpoint-s4.json [--port <n>]
//   bun run evals/checkpoint.ts --score evals/checkpoint-s4.json
//
// A set (evals/checkpoint-<name>.json) lists moments as the prompt cases name them, by dream and moment,
// each with why it is there (a fault case expected to change, or a guard the owner called right whose
// prompt changed), the owner's verdict and note on the old picture (from story-pictures.json or
// paired-verdicts.json) and the old picture's file. --set-from-cases proposes one for a step: every
// counted fault case of the step, and every guard, whose prompt or images change against the base (the
// step's own switch unset, or the switches named with --base, or with --base old the prompt each old
// picture was drawn with), that can be drawn from the run's own pictures; faults first, then guards, each
// most changed first, trimmed to the cap. It is printed and written for a person to confirm.
//
// --dry builds each moment as today's harness would send it, under the switches as set: its prompt and
// every image, each the run's own file (sketches, earlier pictures, the in-between pictures matched to
// today's plan), the mock-up rendered from its floor plan now (written beside the results), the word diff
// against the prompt the old picture was drawn with, and the cost ($0.15 a picture). A moment whose images
// cannot all be found (an in-between picture today's plan wants that the run never drew, a sketch never
// drawn, a file not on this machine) is refused and listed with why; nothing is drawn in its place. No
// model is called: with DREAMCHAT_RECORD=on, what each moment implies comes from the implied-reading cache
// (evals/implied-cache.ts), and a dream whose readings are not all there is refused unless --read-implied
// (model calls) or --no-imply (read nothing, unlike the harness) says otherwise.
//
// --draw draws each moment once through the Strawberry engine, into the checkpoint's own store
// (runs/checkpoint/<name>/home: never the dream chat's store or the shared .strawberry), and only what the
// last --dry printed: a moment whose prompt or images changed since is refused. Its cap (--cap, else the
// set's cap_usd, else $3) counts every earlier attempt in the checkpoint's results; it refuses to start
// over the cap and stops at it. Nothing is drawn again on its own (as evals/paired.ts): a failed picture
// only when named with --only, one that may already have been paid for only with --redraw-paid too. Each
// job's provider id and receipt are kept in runs/checkpoint/<name>/results.json.
//
// --judge writes the judging data (runs/checkpoint/<name>/judge/data.json: each moment's old and new
// picture as A and B in a balanced order that names neither, the picture before, the moment's line and
// what the dreamer said), keeps the answer key apart (runs/checkpoint/<name>/key.json), and serves the page
// on 127.0.0.1 on a free port: A right, B right, both or neither, and a note, each answer written to
// runs/checkpoint/<name>/answers.json as it is given. --score reads the answers against the key.
//
// Saved conversations and their pictures are read from the checkout that has them (DREAMCHAT_DATA, this
// one, or another worktree of the repository), never changed. Results go under its runs/checkpoint/<name>
// (or CHECKPOINT_DIR/<name>).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
// Types only, and saved.ts: no module that reads the engine's store is loaded before the store is set.
import type { WriteFn } from '../implied';
import type { JevFn } from '../jev';
import type { Session } from '../session';
import type { Answers, JudgeData, ToJudge } from './checkpoint-judge';
import type {
  Attempt,
  Change,
  CheckpointSet,
  DreamBuild,
  Measured,
  PairedResults,
  Results,
  Sent,
  SetMoment,
  Today,
} from './checkpoint-set';
import { commitOf, dataDir, frozenPath, loadDream, readSession, sha256, switches } from './saved';

const DIR = resolve(import.meta.dir, '..');
const REPO = resolve(DIR, '..');
/** The cap when neither --cap nor the set names one, in US dollars. */
export const DEFAULT_CAP = 3;

export const USAGE = `usage:
  bun run evals/checkpoint.ts --set-from-cases <step> [--base NAME=VALUE … | --base old] [--cap <usd>] [--name <name>] [--out <file>]
  bun run evals/checkpoint.ts --dry <set file> [--only <id> …] [--no-imply | --read-implied] [--implied-cache <file>]
  bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/checkpoint.ts --draw <set file> [--cap <usd>] [--only <id> …] [--redraw-paid]
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
  if (mode !== 'set-from-cases' && !target) return { error: `--${mode} names a set file (or, to judge or score, a checkpoint's name)` };
  const capText = valueAfter('--cap');
  const cap = capText === undefined ? undefined : Number(capText);
  if (argv.includes('--cap') && !(cap !== undefined && cap > 0)) return { error: '--cap is an amount in US dollars, more than 0' };
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
  if (name !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(name)) return { error: '--name is lower-case letters, digits and -' };
  if (argv.includes('--no-imply') && argv.includes('--read-implied')) return { error: '--no-imply or --read-implied, not both' };
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
    .map((k) => `${k} ${a[k] === undefined ? 'unset' : `=${a[k]}`} then, ${b[k] === undefined ? 'unset' : `=${b[k]}`} now`);
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

/** Where a checkpoint keeps what it makes, and whose files it reads. */
type Folders = { data: string; out: string; home: string; media: string };

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

/** A set by its file, or by a checkpoint's name (evals/checkpoint-<name>.json). */
function setFileOf(target: string): string {
  if (existsSync(target)) return resolve(target);
  const named = join(import.meta.dir, `checkpoint-${target}.json`);
  if (existsSync(named)) return named;
  throw new Error(`no set ${target}: name a set file, or a checkpoint with evals/checkpoint-<name>.json`);
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const money = (usd: number) => `$${usd.toFixed(2)}`;

/**
 * A picture copied for the judging page as the paired test's page has them: at most 1100 on a side,
 * JPEG at 80, the old and the new alike. Without sips (not a Mac) it is copied as it is. Its name there.
 */
function forPage(from: string, toBase: string): string {
  const jpeg = `${toBase}.jpg`;
  const made = spawnSync('sips', ['-Z', '1100', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', from, '--out', jpeg]);
  if (made.status === 0) return jpeg;
  const same = `${toBase}${extname(from).toLowerCase() || '.png'}`;
  copyFileSync(from, same);
  return same;
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

// ── building a set ───────────────────────────────────────────────────────────────────────────────

type Built = {
  m: SetMoment;
  saved: Session;
  d?: DreamBuild;
  today?: Today;
  error?: string;
  /** What the old picture was drawn with, where it is known. */
  sent: Sent | null;
  oldFile: string;
  /** The picture before, as the run drew it. */
  before?: string;
};

/** Every moment of a set built as today's harness would send it, dream by dream. */
async function buildSet(
  set: CheckpointSet,
  moments: SetMoment[],
  args: Args,
  f: Folders,
): Promise<{ built: Built[]; readings: Record<string, string> }> {
  const core = await import('./checkpoint-set');
  const { recordMode } = await import('../record');
  const pairedFile = join(f.data, 'runs', 'paired', 'results.json');
  const paired = existsSync(pairedFile) ? readJson<PairedResults>(pairedFile) : null;
  const built: Built[] = [];
  const readings: Record<string, string> = {};
  for (const session of [...new Set(moments.map((m) => m.session))]) {
    const saved = readSession(f.data, session);
    const frozen = existsSync(frozenPath(session)) ? (loadDream(session, false).session as Session) : null;
    const read = await withReadings(saved, args, recordMode() === 'on');
    readings[session] = read.missing ? `NOT READ: ${read.missing}` : read.note;
    let d: Built['d'];
    let failed = read.missing;
    if (!failed)
      try {
        d = core.buildDream(read.session);
      } catch (e) {
        failed = `could not be rebuilt: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`;
      }
    for (const m of moments.filter((x) => x.session === session)) {
      const oldFile = core.pictureFile(f.data, m.old.picture);
      const before = core.pictureBefore(saved, m.moment);
      const frame = before ? saved.build?.frames?.find((x) => x.id === before && x.kind === 'cut') : undefined;
      const row: Built = {
        m,
        saved,
        sent: core.oldSentOf(m.old, m.moment, saved, frozen, paired),
        oldFile,
        ...(frame?.mediaPath ? { before: join(f.media, frame.mediaPath) } : {}),
      };
      if (failed || !d) {
        built.push({ ...row, error: failed ?? 'not built' });
        continue;
      }
      try {
        const today = core.todayOf(d, m.moment, { media: f.media });
        if (!existsSync(oldFile))
          today.refused.push(`the old picture's file is not on this machine (${oldFile}): nothing to judge the new one against`);
        built.push({ ...row, d, today });
      } catch (e) {
        built.push({ ...row, d, error: String(e instanceof Error ? e.message : e).slice(0, 300) });
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

// ── --dry ────────────────────────────────────────────────────────────────────────────────────────

async function dry(args: Args, set: CheckpointSet, setFile: string, f: Folders): Promise<void> {
  const core = await import('./checkpoint-set');
  const { changeLines, paragraphChanges } = await import('./corpus');
  const { USD_PER_PICTURE } = await import('./paired-arms');
  const moments = chosen(set, args.only);
  const { built, readings } = await buildSet(set, moments, args, f);
  const cap = args.cap ?? set.cap_usd ?? DEFAULT_CAP;
  const spent = await spentSoFar(f);
  const now = knobs();
  const drawable = built.filter((b) => b.today && !b.today.refused.length);
  const cost = drawable.length * USD_PER_PICTURE;
  mkdirSync(join(f.out, 'previs'), { recursive: true });
  const out: string[] = [
    `Checkpoint ${set.name}${set.step ? ` (${set.step})` : ''}: ${moments.length} moments from ${setFile}.`,
    `Switches: ${Object.keys(now).length ? Object.entries(now).map(([k, v]) => `${k}=${v}`).join(' ') : 'none set (today\'s defaults)'}.`,
    ...(set.switches && switchesDiffer(set.switches, now).length
      ? [`WARNING: the set was proposed under other switches: ${switchesDiffer(set.switches, now).join('; ')}.`]
      : []),
    `Saved conversations from ${f.data}/state; sketches and pictures from ${f.media}; results in ${f.out}.`,
    `What each moment implies: ${Object.entries(readings)
      .map(([s, n]) => `${s.slice(-4)} ${n}`)
      .join('; ')}.`,
    now.DREAMCHAT_CHECKS === 'log'
      ? "The pre-draw checks only log (DREAMCHAT_CHECKS=log): their Jev readings change nothing, and are not taken here."
      : 'WARNING: the pre-draw checks act (DREAMCHAT_CHECKS is not log): the harness may reword or hold a moment on a Jev reading before it draws it, which this build does not do. Build and draw with DREAMCHAT_CHECKS=log.',
  ];
  const dump: Record<string, unknown> = {};
  for (const b of built) {
    const m = b.m;
    out.push('', '═'.repeat(100), `${m.id}: ${m.why} (${m.cases.join(', ')})`, `why: ${m.reason}`);
    out.push(
      `the old picture: ${b.oldFile} (${m.old.draw === 'story' ? 'drawn on the night' : `the paired test's ${m.old.draw} version`}); the owner called it ${m.old.verdict}${m.old.note ? `: "${m.old.note}"` : ''}`,
    );
    out.push(`the moment: ${m.description}`);
    out.push(`the picture before: ${b.before ?? 'none (the first the run drew)'}`);
    if (b.error || !b.today) {
      out.push(`NOT BUILT: ${b.error}`);
      dump[m.id] = { error: b.error };
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
      out.push(`  ${im.n}. ${im.role.padEnd(11)} ${im.what}: ${im.file ?? `MISSING: ${im.missing}`}`);
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
      notes: t.notes,
      prompt: t.prompt,
      images: t.images.map(({ n, role, key, name, what, instruction, file, missing }) => ({
        n,
        role,
        key,
        name,
        what,
        instruction,
        file: file ?? null,
        ...(missing ? { missing } : {}),
      })),
      previs: t.previs?.key ?? null,
      against_old: change,
    };
  }
  const refused = built.filter((b) => !b.today || b.today.refused.length);
  out.push(
    '',
    '═'.repeat(100),
    `${drawable.length} of ${built.length} moments can be drawn: ${drawable.length} pictures, ${money(cost)} at fal's list price (${money(USD_PER_PICTURE)} a picture, Nano Banana Pro at 2K, 16:9).`,
    `Spent so far in this checkpoint: ${money(spent)}; cap ${money(cap)}; after drawing these, ${money(spent + cost)}${spent + cost > cap + 1e-9 ? ': OVER THE CAP, --draw would refuse' : ''}.`,
  );
  if (refused.length) {
    out.push(`Refused, and not in the cost (${refused.length}):`);
    for (const b of refused) out.push(`  ${b.m.id}: ${b.error ?? b.today?.refused.join('; ')}`);
  }
  const briefless = drawable.filter((b) => b.today?.notes.some((n) => n.startsWith('no shot brief')));
  if (briefless.length)
    out.push(
      `Without a shot brief for today's view (the harness would write one first): ${briefless.map((b) => b.m.id).join(', ')}.`,
    );
  const text = out.join('\n');
  console.log(text);
  writeFileSync(join(f.out, 'dry.txt'), `${text}\n`);
  writeFileSync(
    join(f.out, 'dry.json'),
    `${JSON.stringify(
      {
        checkpoint: set.name,
        at: new Date().toISOString(),
        commit: commitOf(),
        set: setFile,
        set_hash: sha256(readFileSync(setFile, 'utf8')),
        switches: now,
        readings,
        moments: dump,
      },
      null,
      1,
    )}\n`,
  );
  console.log(`\nwritten ${join(f.out, 'dry.txt')} and dry.json; mock-ups in ${join(f.out, 'previs')}`);
}

// ── --draw ───────────────────────────────────────────────────────────────────────────────────────

type DryFile = {
  switches: Record<string, string>;
  moments: Record<string, { hash?: string; refused?: string[]; error?: string }>;
};

async function draw(args: Args, set: CheckpointSet, setFile: string, f: Folders): Promise<void> {
  const core = await import('./checkpoint-set');
  const { USD_PER_PICTURE } = await import('./paired-arms');
  const cap = args.cap ?? set.cap_usd ?? DEFAULT_CAP;
  // Only what the last dry run printed is drawn: it was read before anything was paid for.
  const dryFile = join(f.out, 'dry.json');
  if (!existsSync(dryFile)) throw new Error(`no dry run of ${set.name}: run --dry first and read it (${dryFile})`);
  const dryRun = readJson<DryFile>(dryFile);
  const moved = switchesDiffer(dryRun.switches, knobs());
  if (moved.length) throw new Error(`the switches differ from the dry run's: ${moved.join('; ')}. Run --dry again and read it.`);
  const moments = chosen(set, args.only);
  const { built } = await buildSet(set, moments, args, f);
  const ready: typeof built = [];
  for (const b of built) {
    const was = dryRun.moments[b.m.id];
    if (!b.today || b.error) console.log(`${b.m.id}: not built (${b.error})`);
    else if (b.today.refused.length) console.log(`${b.m.id}: refused: ${b.today.refused.join('; ')}`);
    else if (!was?.hash) console.log(`${b.m.id}: not in the dry run: run --dry again and read it`);
    else if (was.hash !== b.today.hash)
      console.log(`${b.m.id}: its prompt or images changed since the dry run: run --dry again and read it`);
    else ready.push(b);
  }

  const { liveSheets, MAX_PER_IMAGE, PROVIDER, spawnWorker } = await import('../sheets');
  const { cli, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable } = await import('../strawberry');
  const { setUpDream } = await import('./paired-store');
  if (PROVIDER !== 'fal')
    throw new Error(
      `draws on fal only, and the provider is ${PROVIDER}: run it with bun --env-file=$HOME/.config/strawberry/dreamchat.env`,
    );
  if (!strawberryAvailable()) throw new Error(`the Strawberry engine is not installed (${STRAWBERRY_PYTHON})`);
  if (resolve(STRAWBERRY_HOME) !== f.home) throw new Error(`the engine's store is ${STRAWBERRY_HOME}, not ${f.home}`);
  const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

  // One results file for the checkpoint, whatever the day: everything it records counts against the cap.
  const resultsFile = join(f.out, 'results.json');
  const results: Results = existsSync(resultsFile)
    ? readJson<Results>(resultsFile)
    : {
        about: `The moments of ${setFile} drawn once more by evals/checkpoint.ts, each by today's harness under the switches of its dry run, to be judged blind against the old picture. Every attempt that reached the worker counts against the checkpoint's cap.`,
        checkpoint: set.name,
        home: f.home,
        provider: 'fal',
        model: 'nano_banana_pro',
        entries: {},
      };
  if (results.home !== f.home) throw new Error(`this checkpoint was drawn into ${results.home}, not ${f.home}`);
  const save = () => writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);

  // Nothing starts while the store has a job in flight the results do not know: it may be paid for.
  const known = new Set(core.attemptsOf(results).map((r) => r.jobId));
  const stray: string[] = [];
  if (existsSync(join(f.home, 'production.sqlite')))
    for (const project of (await call('projects', {})) as { id: string }[]) {
      const { jobs } = (await call('project', { id: project.id })) as { jobs: { id: string; state: string }[] };
      for (const j of jobs) if (core.IN_FLIGHT.has(j.state) && !known.has(j.id)) stray.push(`${j.id} (${j.state})`);
    }
  if (stray.length)
    throw new Error(`${f.home} has jobs in flight that ${resultsFile} does not know: ${stray.join(', ')}. Settle them in the engine first.`);

  // Every moment's attempts are looked at, so one still in the worker's hands is waited for; only a moment
  // built as its dry run printed it is sent.
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

  // Each dream written into the checkpoint's store, with every sketch and picture its moments attach.
  type Setup = Awaited<ReturnType<typeof setUpDream>>;
  const setups = new Map<string, Setup>();
  for (const session of new Set(todo.map((b) => b.m.session))) {
    const mine = todo.filter((b) => b.m.session === session);
    const d = mine[0].d;
    if (!d) continue;
    console.log(`putting ${session} into ${f.home}…`);
    setups.set(
      session,
      await setUpDream(
        mine[0].saved,
        core.partsOf(d),
        mine.map((b) => core.toDrawOf(d, b.m.id, b.today as Today)),
        {
          media: f.media,
          previsDir: join(f.out, 'previs'),
          reason: `Drawn once more for checkpoint ${set.name}, to be judged blind against the picture drawn before; what it is drawn from is in its references`,
        },
      ),
    );
  }

  const waiting = plan.waiting.map((id) => results.entries[id]).filter((r) => !!r);
  const worker = todo.length || waiting.length ? spawnWorker(STRAWBERRY_PYTHON, REPO) : null;
  try {
    let spent = before;
    for (const b of todo) {
      const t = b.today as Today;
      const setup = setups.get(b.m.session);
      const images = t.images.map((im) => ({
        n: im.n,
        role: im.role,
        key: im.key,
        what: im.what,
        file: im.key.startsWith('previs:') ? join(f.out, 'previs', `${b.m.id}.png`) : (im.file ?? ''),
        mediaId: setup?.media.get(im.key),
        instruction: im.instruction,
      }));
      const earlier = core.earlierOf(results.entries[b.m.id]);
      const r: Attempt = {
        id: b.m.id,
        session: b.m.session,
        moment: b.m.moment,
        hash: t.hash,
        prompt: t.prompt,
        images,
        switches: knobs(),
        state: 'refused',
        ...(setup ? { nodeId: setup.ids[b.m.moment] } : {}),
        at: new Date().toISOString(),
        ...(earlier.length ? { earlier } : {}),
      };
      results.entries[b.m.id] = r;
      const lost = images.filter((im) => !im.mediaId).map((im) => im.key);
      if (!setup || lost.length) r.error = `not drawn: ${lost.join(', ') || 'its dream'} could not be put into the checkpoint's store`;
      else if (spent + USD_PER_PICTURE > cap + 1e-9)
        Object.assign(r, { state: 'capped', error: `not drawn: the ${money(cap)} cap is reached` });
      else {
        const p = b.d?.r.pictures.find((x) => x.id === b.m.moment && x.kind === 'cut');
        try {
          if (!p) throw new Error(`${b.m.moment} is not in today's plan`);
          const started = await liveSheets.startFrame({
            item: { ...p.item, nodeId: setup.ids[b.m.moment], version: 1 },
            prompt: t.prompt,
            references: images.map((im) => ({ media_id: im.mediaId as string, role: im.role, instruction: im.instruction })),
            reason: `Drawn once more for checkpoint ${set.name}, to be judged blind against the picture drawn before; approved within a ${money(cap)} cap for the checkpoint.`,
            maxUsd: MAX_PER_IMAGE,
            intent: `Checkpoint ${set.name}: ${p.item.name}`,
            shape: '16:9',
          });
          Object.assign(r, { state: 'queued', recipeId: started.recipeId, jobId: started.jobId, usd: started.usd });
          spent += typeof started.usd === 'number' ? started.usd : USD_PER_PICTURE;
          waiting.push(r);
        } catch (err) {
          // Refused by the engine before any job existed: nothing was paid.
          r.error = String(err).slice(0, 1000);
        }
      }
      console.log(`${b.m.id}: ${r.state}${r.jobId ? ` as job ${r.jobId}` : ''}${r.error ? ` (${r.error.slice(0, 300)})` : ''}`);
      save();
    }

    // Every job waited for; one that fails is reported, never drawn again.
    const until = Date.now() + Number(process.env.CHECKPOINT_WAIT_MS ?? 60 * 60_000);
    while (waiting.some((r) => !core.DONE.has(r.state)) && Date.now() < until) {
      await Bun.sleep(5000);
      for (const r of waiting) {
        if (core.DONE.has(r.state) || !r.jobId || !r.nodeId) continue;
        const st: { state: string; error?: string; mediaPath?: string } = await liveSheets
          .status(r.jobId, r.nodeId)
          .catch((err) => ({ state: r.state, error: String(err) }));
        if (st.state === r.state) continue;
        const job = (await call('job', { id: r.jobId })) as {
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
        if (st.state === 'ready' && st.mediaPath) {
          r.output = join(f.home, 'media', st.mediaPath);
          const copy = forPage(r.output, join(f.out, `${r.id}-new`));
          r.copy = copy;
        }
        console.log(`${r.id}: ${r.state}${r.error ? ` (${r.error.slice(0, 300)})` : ''}`);
        save();
      }
    }
    for (const r of waiting.filter((x) => !core.DONE.has(x.state)))
      console.log(`${r.id}: still ${r.state} as job ${r.jobId}; --draw again waits for it`);
  } finally {
    worker?.stop();
    save();
  }
  const all = Object.values(results.entries);
  console.log(
    `\n${all.filter((r) => r.state === 'ready').length} drawn, ${all.filter((r) => r.state !== 'ready' && core.DONE.has(r.state)).length} not; ${money(core.spentIn(results))} spent in this checkpoint at fal's list price. Results: ${resultsFile}. To judge: bun run evals/checkpoint.ts --judge ${setFile}`,
  );
}

// ── --judge and --score ──────────────────────────────────────────────────────────────────────────

/**
 * The judging data from what the checkpoint has drawn: each moment drawn, old and new as A and B in the
 * checkpoint's balanced order, beside the picture before, with its line and what the dreamer said; the
 * pictures copied into the judge folder, and the key written apart, beside the results.
 */
async function writeJudge(set: CheckpointSet, f: Folders): Promise<JudgeData> {
  const core = await import('./checkpoint-set');
  const { judgeSetOf } = await import('./checkpoint-judge');
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
    const old = core.pictureFile(f.data, m.old.picture);
    if (!existsSync(old)) throw new Error(`${m.id}: the old picture's file is not on this machine (${old})`);
    const prev = core.pictureBefore(s, m.moment);
    // The picture before as the owner saw it beside the old one: the story's, where it was judged.
    const judged = prev ? v.story.find((x) => x.session === m.session && x.moment === prev) : undefined;
    const frame = prev ? s.build?.frames?.find((x) => x.id === prev && x.kind === 'cut') : undefined;
    const before = judged
      ? join(f.data, 'strawberry-home', 'media', judged.picture)
      : frame?.mediaPath
        ? join(f.media, frame.mediaPath)
        : null;
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
  const order = core.abOrder(set.name, set.moments);
  const judge = join(f.out, 'judge');
  rmSync(join(judge, 'img'), { recursive: true, force: true });
  mkdirSync(join(judge, 'img'), { recursive: true });
  const made = judgeSetOf(set.name, ms, order, 'jpg');
  // Each picture made for the page the same way; its name there is what the page is told.
  const names = new Map<string, string>();
  for (const c of made.copies) {
    const got = forPage(c.from, join(judge, c.to.replace(/\.jpg$/, '')));
    names.set(c.to, `img/${got.split('/').at(-1)}`);
  }
  const data = {
    ...made.data,
    moments: made.data.moments.map((m) => ({
      ...m,
      a: names.get(m.a) ?? m.a,
      b: names.get(m.b) ?? m.b,
      before: m.before ? (names.get(m.before) ?? m.before) : null,
    })),
  };
  writeFileSync(join(judge, 'data.json'), `${JSON.stringify(data, null, 1)}\n`);
  // The key stays with the results, never in the folder the page serves.
  writeFileSync(join(f.out, 'key.json'), `${JSON.stringify(made.key, null, 1)}\n`);
  return data;
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
  const { emptyAnswers, scoreLines, scoreOf } = await import('./checkpoint-judge');
  const keyFile = join(f.out, 'key.json');
  if (!existsSync(keyFile)) throw new Error(`no answer key yet (${keyFile}): run --judge first`);
  const answersFile = join(f.out, 'answers.json');
  const got = existsSync(answersFile) ? readJson<Answers>(answersFile) : emptyAnswers(set.name);
  const s = scoreOf(set, readJson(keyFile), got);
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
  const { loadCases } = await import('./prompt-cases');
  const cases = loadCases();
  const f = foldersOf(name, [...new Set(cases.map((c) => c.session))]);
  const core = await import('./checkpoint-set');
  const { recordMode } = await import('../record');
  const { moments } = await import('../producer');
  const { USD_PER_PICTURE } = await import('./paired-arms');
  const cap = args.cap ?? DEFAULT_CAP;
  const pairedFile = join(f.data, 'runs', 'paired', 'results.json');
  const paired = existsSync(pairedFile) ? readJson<PairedResults>(pairedFile) : null;
  const { candidates, unknown } = core.candidatesOf(cases, step, core.loadVerdicts(), f.data, paired);
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
        const today = core.todayOf(d, c.moment, { media: f.media });
        const oldFile = core.pictureFile(f.data, c.old.picture);
        if (!existsSync(oldFile))
          today.refused.push(
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
        measured.push({ ...c, today, change: core.changeOf(before, after) });
      } catch (e) {
        measured.push({ ...c, error: String(e instanceof Error ? e.message : e).slice(0, 300) });
      }
    }
  }
  const spent = await spentSoFar(f);
  const proposal = core.proposeSet(measured, { name, step, cap, spent, switches: now, base: baseWords });
  const line = (m: Measured) =>
    `${m.id.padEnd(22)} ${m.why.padEnd(5)} ${m.cases.map((c) => c.id).join(', ')}; old ${m.old.draw} ${m.old.verdict}${m.change ? `; changed ${core.changeWords(m.change)}` : ''}`;
  const listed = (title: string, xs: Measured[], why?: (m: Measured) => string) =>
    xs.length ? ['', `${title} (${xs.length}):`, ...xs.map((m) => `  ${line(m)}${why ? `: ${why(m)}` : ''}`)] : [];
  const kept = proposal.set.moments.map((m) => measured.find((x) => x.id === m.id) as Measured);
  const out: string[] = [
    `Proposed checkpoint ${name} for ${step}, under ${Object.keys(now).length ? Object.entries(now).map(([k, v]) => `${k}=${v}`).join(' ') : "today's defaults (no switch set)"}; changes measured against ${baseWords}.`,
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
    ...listed('Over the cap, most changed first', proposal.over),
    ...listed('Changed, but cannot be drawn', proposal.refused, (m) => (m.today as Today).refused.join('; ')),
    ...listed('Not built', proposal.failed, (m) => m.error ?? 'not built'),
    ...listed(`Unchanged against ${baseWords}`, proposal.unchanged),
  ];
  if (unknown.length)
    out.push('', `Cases whose verdict row is missing: ${unknown.map((u) => `${u.case} (${u.why})`).join('; ')}`);
  const file = resolve(args.out ?? join(f.out, 'proposed-set.json'));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(proposal.set, null, 2)}\n`);
  out.push(
    '',
    `written ${file}: for a person to confirm. To use it, save it as evals/checkpoint-${name}.json (and commit it), then: bun run evals/checkpoint.ts --dry evals/checkpoint-${name}.json`,
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
  if (args.mode === 'dry') return dry(args, set, setFile, f);
  if (args.mode === 'draw') return draw(args, set, setFile, f);
  if (args.mode === 'judge') return judge(args, set, f);
  return score(set, f);
}

if (import.meta.main)
  await main(process.argv.slice(2)).catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  });
