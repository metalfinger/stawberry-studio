// For a moment of a dream, which first image makes it come out right more often, with everything
// else equal? Each moment of evals/paired-set.json drawn three ways (evals/paired-arms.ts) that
// differ only in image 1: the floor-plan mock-up (mockup: today's routing, without earlier moments),
// the previous picture the run drew (edit), or nothing (free). After it, the same sketches and
// in-between pictures in the same order, and the same words.
//
//   bun run evals/paired.ts --dry [--only orchard-m2 …] [--dry-file <path>]
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/paired.ts --draw [--only orchard-m2 …] [--redraw-paid] [--judge <dir>]
//
// --dry prints every moment's three prompts, the images each attaches (role and file), the camera's
// move from the previous picture and the cost, and writes it to the dry file; no model calls, no
// images, no network. --draw draws each (moment, arm) once on fal (Nano Banana Pro, 2K, 16:9, as the
// harness draws a moment) through the Strawberry engine: a production per dream in the test's own
// store (runs/paired-home, never the dream chat's store or the shared one), every sketch and picture
// an arm attaches imported there and approved as the run approved it, then each picture prepared,
// approved and queued there and drawn by the engine's worker, its provider job id and receipt kept.
//
// One results file for the whole test, runs/paired/results.json (each picture beside it as
// <moment>-<arm>.jpg), and one $10 cap: what it has spent, every earlier attempt and any older
// runs/paired/*/results.json included, counts against it. It refuses to start over $10, or while
// the test's store has a job queued or running that its results do not know, and stops at $10.
// Nothing is drawn again on its own: a picture that failed is drawn again only when its moment is
// named with --only, and one that may already have been paid for (its submission unknown, or its
// collection failed) only when named with --only and --redraw-paid too. The judging page's data,
// the arms in a balanced order and unnamed, goes to the judge folder (data-paired.json); the answer
// key stays with the results (runs/paired/paired-key.json).
//
// Saved conversations are read from the checkout that has them: DREAMCHAT_DATA, or this one, or
// another worktree of the repository (a worktree has no state/ of its own). Nothing there is changed.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
// Types only: no module that reads the engine's store is loaded before the store is set below.
import type { Session } from '../session';
import type { Arm, Paired, Prepared } from './paired-arms';

const DIR = resolve(import.meta.dir, '..');
const REPO = resolve(DIR, '..');
/** The most the whole test may spend, in US dollars. */
const CAP_USD = 10;

const args = process.argv.slice(2);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only: string[] = [];
for (const a of args.includes('--only') ? args.slice(args.indexOf('--only') + 1) : []) {
  if (a.startsWith('--')) break;
  only.push(a);
}
const drawing = args.includes('--draw');
/** Draw again, for a moment named with --only, a picture that may already have been paid for. */
const redrawPaid = args.includes('--redraw-paid');
if (!drawing && !args.includes('--dry')) {
  console.error('usage: bun run evals/paired.ts --dry | --draw [--only <run-m> …] [--redraw-paid]');
  process.exit(1);
}

type SetRow = {
  id: string;
  run: string;
  session: string;
  moment: string;
  kind: string;
  /** The camera's move from the previous picture the run drew: MOVES in paired-arms.ts. */
  move: string;
  reason: string;
};
const setFile = valueOf('--set') ?? join(import.meta.dir, 'paired-set.json');
const allRows = (JSON.parse(readFileSync(setFile, 'utf8')) as { rows: SetRow[] }).rows;
const unknown = only.filter((id) => !allRows.some((r) => r.id === id));
if (unknown.length) {
  console.error(`not in ${setFile}: ${unknown.join(', ')}`);
  process.exit(1);
}
const rows = only.length ? allRows.filter((r) => only.includes(r.id)) : allRows;

/** The dreamchat folder whose state/ holds every conversation the set names. */
function dataDir(): string {
  const has = (d: string) => allRows.every((r) => existsSync(join(d, 'state', `${r.session}.json`)));
  if (process.env.DREAMCHAT_DATA) {
    const d = resolve(process.env.DREAMCHAT_DATA);
    if (!has(d)) throw new Error(`${d}/state lacks conversations the set names`);
    return d;
  }
  if (has(DIR)) return DIR;
  const listed = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout ?? '';
  for (const line of listed.split('\n'))
    if (line.startsWith('worktree ') && has(join(line.slice(9), 'dreamchat'))) return join(line.slice(9), 'dreamchat');
  throw new Error('no checkout holds the saved conversations: set DREAMCHAT_DATA to the dreamchat folder with state/');
}
const DATA = dataDir();
const MEDIA = join(DATA, 'strawberry-home', 'media');
const RUNS = join(DATA, 'runs');

// The engine's store is read when its modules load, so it is set first: always the test's own.
const HOME = resolve(process.env.PAIRED_HOME ?? join(RUNS, 'paired-home'));
if (
  HOME === resolve(DATA, 'strawberry-home') ||
  HOME === resolve(DIR, 'strawberry-home') ||
  HOME.split('/').includes('.strawberry')
) {
  console.error(`${HOME} is a store the dream chat or the studio uses: the test draws into a store of its own`);
  process.exit(1);
}
process.env.DREAMCHAT_STRAWBERRY_HOME = HOME;
process.env.STRAWBERRY_PYTHON ??=
  [join(REPO, 'venv', 'bin', 'python'), join(DATA, '..', 'venv', 'bin', 'python')].find((p) => existsSync(p)) ??
  join(REPO, 'venv', 'bin', 'python');

const {
  afterImage1,
  ARMS,
  fileOf,
  judgeSet,
  MOVES,
  othersAgree,
  pairedArms,
  placeCounts,
  prepare,
  toldOf,
  USD_PER_PICTURE,
  wordsAgree,
} = await import('./paired-arms');

const sessions = new Map<string, { s: Session; p: Prepared }>();
const sessionOf = (id: string) => {
  let got = sessions.get(id);
  if (!got) {
    const s = JSON.parse(readFileSync(join(DATA, 'state', `${id}.json`), 'utf8')) as Session;
    got = { s, p: prepare(s) };
    sessions.set(id, got);
  }
  return got;
};

type Entry = { row: SetRow; s: Session; p: Prepared; paired: Paired };
const entries: Entry[] = rows.map((row) => {
  const { s, p } = sessionOf(row.session);
  return { row, s, p, paired: pairedArms(p, row.moment) };
});

/** The file an image key stands for, in the run's own store. A previs is rendered, not stored. */
const fileIn = (s: Session, key: string) => fileOf(s, key, MEDIA);

function whatIs(e: Entry, key: string): string {
  const [kind, id] = key.split(':');
  if (kind === 'previs') {
    const run = e.s.build?.frames?.find((f) => f.id === e.row.moment)?.layout;
    const how =
      run?.key === e.paired.previs?.key
        ? `the same render the run drew from: ${run?.path}`
        : run
          ? `today's plan renders it otherwise than the run's own, ${run.path}`
          : 'the run had none';
    return `the mock-up of ${id}, rendered from its floor plan at draw time (sha256 ${e.paired.previs?.key.slice(0, 12)}…; ${how})`;
  }
  if (kind === 'sketch') {
    const it = e.s.build?.items.find((i) => i.id === id);
    return `sketch of ${it?.isDreamer ? 'the dreamer' : it?.name}`;
  }
  if (kind === 'ghost') return `in-between picture ${id} (${e.p.pictures.get(id)?.name ?? ''})`;
  return `picture ${id} from the run (${e.p.pictures.get(id)?.name ?? ''})`;
}

/** The camera's move from the previous picture, as today's code reads it. */
const moveOf = (e: Entry) => MOVES[e.paired.prev.relation];

/** How often each arm is shown first, second and third to the judge, over the whole set. */
function orderLine(): string {
  const counts = placeCounts(allRows.length);
  return `Shown to the judge in turn through all six orders, in set order: ${ARMS.map((a) => `${a} first ${counts[a][0]}, second ${counts[a][1]}, third ${counts[a][2]}`).join('; ')}.`;
}

function dry(): string {
  // The person's own verdicts on the run's pictures: the reference every judge is measured against.
  const judged = (
    JSON.parse(readFileSync(join(import.meta.dir, 'story-pictures.json'), 'utf8')) as {
      rows: { id: string; human: string; human_note?: string; picture: string }[];
    }
  ).rows;
  const n = entries.length * ARMS.length;
  const cost = `about $${(n * USD_PER_PICTURE).toFixed(2)} at fal's list price ($${USD_PER_PICTURE.toFixed(2)} a picture, Nano Banana Pro at 2K, 16:9; cap $${CAP_USD})`;
  const out = [
    `Three ways to draw ${entries.length} moments: ${n} pictures, ${cost}.`,
    `Saved conversations from ${DATA}/state; sketches and pictures from ${MEDIA}.`,
    "Arms, which differ only in image 1: mockup = today's routing without earlier moments, its mock-up as image 1; edit = the previous picture the run drew as image 1; free = no image 1. After it, every arm attaches the same sketches of who and what is in view and the same in-between pictures today's plan attaches, in the same order.",
    orderLine(),
  ];
  for (const e of entries) {
    const r = e.paired;
    const own = judged.find((x) => x.id === e.row.id);
    out.push(
      '',
      '═'.repeat(100),
      `${e.row.id}: ${e.p.b.title}, ${e.row.moment} (${e.row.kind})`,
      `what happens: ${r.action}`,
      `why this one: ${e.row.reason}`,
      ...(own
        ? [
            `the run's own picture: ${join(MEDIA, own.picture)} (the person judged it ${own.human}${own.human_note ? `: "${own.human_note}"` : ''})`,
          ]
        : []),
      `camera move from the previous picture: ${moveOf(e)}${moveOf(e) === e.row.move ? '' : ` (MISMATCH: paired-set.json says ${e.row.move})`}`,
      `edited from: ${r.prev.id}, ${r.prev.samePlace ? 'in the same place' : 'in another place'}`,
      `words about the moment in the three arms: ${wordsAgree(r) ? 'the same' : 'DIFFERENT'}`,
      `images after image 1 in the three arms: ${othersAgree(r) ? `the same (${afterImage1(r, 'free').length})` : 'DIFFERENT'}`,
      ...r.notes.map((x) => `note: ${x}`),
    );
    for (const a of ARMS) {
      const arm = r.arms[a];
      out.push('', `── ${a}: ${arm.images.length} images, $${USD_PER_PICTURE.toFixed(2)}`);
      arm.images.forEach((im, i) => {
        const file = fileIn(e.s, im.key);
        const where = im.key.startsWith('previs:')
          ? ''
          : `: ${file ?? 'NO FILE'}${file && !existsSync(file) ? ' (MISSING)' : ''}`;
        out.push(`  ${i + 1}. ${im.role.padEnd(11)} ${whatIs(e, im.key)}${where}`);
      });
      out.push('', arm.prompt);
    }
  }
  const moves = [...new Set(entries.map(moveOf))].map((m) => `${m} ${entries.filter((e) => moveOf(e) === m).length}`);
  out.push(
    '',
    '═'.repeat(100),
    `${n} pictures, ${cost}.`,
    `The words about the moment are the same in all three arms for ${entries.filter((e) => wordsAgree(e.paired)).length} of ${entries.length} moments; the images after image 1, for ${entries.filter((e) => othersAgree(e.paired)).length}.`,
    `Camera moves from the previous picture: ${moves.join(', ')}; the set agrees on ${entries.filter((e) => moveOf(e) === e.row.move).length} of ${entries.length}.`,
    orderLine(),
  );
  return out.join('\n');
}

if (!drawing) {
  const text = dry();
  console.log(text);
  const file = resolve(valueOf('--dry-file') ?? process.env.PAIRED_DRY_FILE ?? join(RUNS, 'paired', 'dry.txt'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${text}\n`);
  console.log(`\nwritten to ${file}`);
  process.exit(0);
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────

const { liveSheets, MAX_PER_IMAGE, PROVIDER, spawnWorker } = await import('../sheets');
const { cli, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable } = await import('../strawberry');
const { setUp } = await import('./paired-store');
if (PROVIDER !== 'fal') {
  console.error(
    `draws on fal only, and the provider is ${PROVIDER}: run it with bun --env-file=$HOME/.config/strawberry/dreamchat.env`,
  );
  process.exit(1);
}
if (!strawberryAvailable()) {
  console.error(`the Strawberry engine is not installed (${STRAWBERRY_PYTHON})`);
  process.exit(1);
}
if (resolve(STRAWBERRY_HOME) !== HOME) throw new Error(`the engine's store is ${STRAWBERRY_HOME}, not ${HOME}`);
const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

type Sent = { n: number; role: string; key: string; what: string; file: string; mediaId?: string; instruction: string };
type Result = {
  id: string;
  run: string;
  session: string;
  moment: string;
  arm: Arm;
  kind: string;
  /** The camera's move from the previous picture, for results by camera move. */
  move: string;
  prompt: string;
  images: Sent[];
  /** The engine's job state, or `refused` (the engine would not prepare it) or `capped`: nothing paid for either. */
  state: string;
  recipeId?: string;
  jobId?: string;
  nodeId?: string;
  /** fal's own id for the request (its response URL), the engine's receipt for the job, and its events. */
  providerId?: string | null;
  receipt?: unknown;
  events?: unknown;
  /** The engine's estimate for the picture in US dollars: fal's list price (fal bills the account). */
  usd?: number | null;
  error?: string;
  /** The picture in the test's store, and its copy beside the results. */
  output?: string;
  copy?: string;
  at: string;
  /** Its earlier attempts that reached the worker, each kept when it was drawn again: all count as spent. */
  earlier?: Result[];
};
type Results = { about: string; home: string; provider: string; model: string; entries: Record<string, Result> };

// One results file for the whole test, whatever the day.
const OUT = join(RUNS, 'paired');
mkdirSync(OUT, { recursive: true });
const resultsFile = join(OUT, 'results.json');
const results: Results = existsSync(resultsFile)
  ? (JSON.parse(readFileSync(resultsFile, 'utf8')) as Results)
  : {
      about:
        "Each moment of evals/paired-set.json drawn three ways by evals/paired.ts, which differ only in image 1: mockup (today's routing without earlier moments: the floor-plan mock-up), edit (the previous picture the run drew) and free (none). After it, the same sketches and in-between pictures in all three. One file for the whole test: its spending counts against one $10 cap.",
      home: HOME,
      provider: 'fal',
      model: 'nano_banana_pro',
      entries: {},
    };
if (results.home !== HOME) {
  console.error(`this test's results were drawn into ${results.home}: set PAIRED_HOME to it`);
  process.exit(1);
}
const save = () => writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
/** Job states nothing more comes of, and the two outcomes that never reached the provider. */
const DONE = new Set(['ready', 'failed', 'cancelled', 'submission_unknown', 'collection_failed', 'refused', 'capped']);
const NEVER_SENT = new Set(['refused', 'capped']);
/** Outcomes that may already have been paid for: fal may have drawn the picture. */
const MAYBE_PAID = new Set(['submission_unknown', 'collection_failed']);
/** A job's states while the engine still has it in hand. */
const IN_FLIGHT = new Set(['queued', 'submitting', 'running', 'collecting']);
/** Every attempt a results file records: each entry and the attempts before it. */
const attempts = (rs: Results) => Object.values(rs.entries).flatMap((r) => [r, ...(r.earlier ?? [])]);
/** Spent, as the engine estimates it: every picture that went to the worker counts, drawn or not. */
const spentIn = (rs: Results) =>
  attempts(rs)
    .filter((r) => r.jobId)
    .reduce((a, r) => a + (r.usd ?? USD_PER_PICTURE), 0);
// Results of the test kept per day before it had one file: what they spent counts too.
const older = readdirSync(OUT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(OUT, d.name, 'results.json'))
  .filter((f) => existsSync(f));
const spentBefore = older.reduce((a, f) => a + spentIn(JSON.parse(readFileSync(f, 'utf8')) as Results), 0);
const spentSoFar = () => spentBefore + spentIn(results);

// Nothing starts while the test's store has a job in flight its results do not know: it may be
// paid for, and nothing here would wait for it or count it.
const known = new Set(attempts(results).map((r) => r.jobId));
const stray: string[] = [];
for (const project of (await call('projects', {})) as { id: string }[]) {
  const { jobs } = (await call('project', { id: project.id })) as { jobs: { id: string; state: string }[] };
  for (const j of jobs) if (IN_FLIGHT.has(j.state) && !known.has(j.id)) stray.push(`${j.id} (${j.state})`);
}
if (stray.length) {
  console.error(
    `refused: ${HOME} has ${stray.length > 1 ? 'jobs' : 'a job'} in flight that ${resultsFile} does not know: ${stray.join(', ')}. Settle ${stray.length > 1 ? 'them' : 'it'} in the engine first.`,
  );
  process.exit(1);
}

// What to draw: each (moment, arm) not drawn yet. One sent before and failed is drawn again only when
// its moment is named with --only, and one that may already have been paid for only with
// --redraw-paid too; one still in the worker's hands is waited for, never sent again.
const todo: { e: Entry; arm: Arm; key: string }[] = [];
const waiting: Result[] = [];
for (const e of entries)
  for (const arm of ARMS) {
    const key = `${e.row.id}-${arm}`;
    const was = results.entries[key];
    if (was?.state === 'ready') continue;
    if (was?.jobId && !DONE.has(was.state)) {
      waiting.push(was);
      continue;
    }
    if (was && MAYBE_PAID.has(was.state) && !(only.includes(e.row.id) && redrawPaid)) {
      console.log(
        `${key}: ${was.state} before, as job ${was.jobId} (${was.error ?? 'no error given'}); it may already have been paid for, so it is drawn again only when named with --only and --redraw-paid`,
      );
      continue;
    }
    if (was && !NEVER_SENT.has(was.state) && !only.includes(e.row.id)) {
      console.log(
        `${key}: ${was.state} before (${was.error ?? 'no error given'}); drawn again only when named with --only`,
      );
      continue;
    }
    todo.push({ e, arm, key });
  }
const before = spentSoFar();
const estimate = todo.length * USD_PER_PICTURE;
console.log(
  `${todo.length} pictures to draw, about $${estimate.toFixed(2)}; $${before.toFixed(2)} already spent on this test; cap $${CAP_USD}.`,
);
if (before + estimate > CAP_USD + 1e-9) {
  console.error(`refused: $${(before + estimate).toFixed(2)} would pass the $${CAP_USD} cap`);
  process.exit(1);
}

// Each dream written into the test's store, with every sketch and picture its arms attach.
type Setup = Awaited<ReturnType<typeof setUp>>;
const setups = new Map<string, Setup>();
for (const session of new Set(todo.map((t) => t.e.row.session))) {
  const mine = entries.filter((e) => e.row.session === session && todo.some((t) => t.e === e));
  console.log(`putting ${session} into ${HOME}…`);
  const drawn = mine.map((e) => ({ id: e.row.id, moment: e.row.moment, paired: e.paired }));
  setups.set(session, await setUp(mine[0].s, mine[0].p, drawn, { media: MEDIA, previsDir: join(OUT, 'previs') }));
}

const worker = todo.length || waiting.length ? spawnWorker(STRAWBERRY_PYTHON, REPO) : null;
try {
  let spent = before;
  for (const { e, arm, key } of todo) {
    const setup = setups.get(e.row.session) as Setup;
    const a = e.paired.arms[arm];
    const images: Sent[] = a.images.map((im, i) => ({
      n: i + 1,
      role: im.role,
      key: im.key,
      what: whatIs(e, im.key),
      file: im.key.startsWith('previs:') ? join(OUT, 'previs', `${e.row.id}.png`) : (fileIn(e.s, im.key) ?? ''),
      mediaId: setup.media.get(im.key),
      instruction: im.instruction,
    }));
    // An attempt that reached the worker is kept when it is drawn again: it counts as spent.
    const was = results.entries[key];
    const earlier = [...(was?.earlier ?? []), ...(was?.jobId ? [{ ...was, earlier: undefined }] : [])];
    const r: Result = {
      id: e.row.id,
      run: e.row.run,
      session: e.row.session,
      moment: e.row.moment,
      arm,
      kind: e.row.kind,
      move: e.row.move,
      prompt: a.prompt,
      images,
      state: 'refused',
      nodeId: setup.ids[e.row.moment],
      at: new Date().toISOString(),
      ...(earlier.length ? { earlier } : {}),
    };
    results.entries[key] = r;
    const lost = images.filter((im) => !im.mediaId).map((im) => im.key);
    if (lost.length) r.error = `not drawn: ${lost.join(', ')} could not be put into the test's store`;
    else if (spent + USD_PER_PICTURE > CAP_USD + 1e-9)
      Object.assign(r, { state: 'capped', error: `not drawn: the $${CAP_USD} cap is reached` });
    else {
      const frame = e.p.pictures.get(e.row.moment) as NonNullable<ReturnType<typeof e.p.pictures.get>>;
      try {
        const started = await liveSheets.startFrame({
          item: { ...frame, nodeId: setup.ids[e.row.moment], version: 1 },
          prompt: a.prompt,
          references: images.map((im) => ({
            media_id: im.mediaId as string,
            role: im.role,
            instruction: im.instruction,
          })),
          reason: `One of three ways to draw this moment, for a paired test of how moments are drawn; approved within a $${CAP_USD} cap for the whole test.`,
          maxUsd: MAX_PER_IMAGE,
          intent: `Paired test, ${arm}: ${frame.name}`,
          shape: '16:9',
        });
        Object.assign(r, { state: 'queued', recipeId: started.recipeId, jobId: started.jobId, usd: started.usd });
        spent += started.usd ?? USD_PER_PICTURE;
        waiting.push(r);
      } catch (err) {
        // Refused by the engine before any job existed: nothing was paid.
        r.error = String(err).slice(0, 1000);
      }
    }
    console.log(
      `${key}: ${r.state}${r.jobId ? ` as job ${r.jobId}` : ''}${r.error ? ` (${r.error.slice(0, 300)})` : ''}`,
    );
    save();
  }

  // Every job waited for; one that fails is reported, never drawn again.
  const until = Date.now() + Number(process.env.PAIRED_WAIT_MS ?? 60 * 60_000);
  while (waiting.some((r) => !DONE.has(r.state)) && Date.now() < until) {
    await Bun.sleep(5000);
    for (const r of waiting) {
      if (DONE.has(r.state) || !r.jobId || !r.nodeId) continue;
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
        r.output = join(HOME, 'media', st.mediaPath);
        r.copy = join(OUT, `${r.id}-${r.arm}.jpg`);
        // As the judging page's pictures are made: at most 1100 on a side, JPEG at 80.
        const made = spawnSync('sips', [
          '-Z',
          '1100',
          '-s',
          'format',
          'jpeg',
          '-s',
          'formatOptions',
          '80',
          r.output,
          '--out',
          r.copy,
        ]);
        if (made.status !== 0) r.error = `copy failed: ${String(made.stderr).slice(0, 300)}`;
      }
      console.log(`${r.id}-${r.arm}: ${r.state}${r.error ? ` (${r.error.slice(0, 300)})` : ''}`);
      save();
    }
  }
  for (const r of waiting.filter((x) => !DONE.has(x.state)))
    console.log(`${r.id}-${r.arm}: still ${r.state} as job ${r.jobId}; --draw again waits for it`);
} finally {
  worker?.stop();
  save();
}

// ── The judging page's data: one "run" per moment, its drawn arms in a balanced order and unnamed ──

const judge = resolve(valueOf('--judge') ?? process.env.PAIRED_JUDGE ?? join(OUT, 'judge'));
const set = judgeSet(
  allRows.map((row) => {
    const { s, p } = sessionOf(row.session);
    const drawn: Partial<Record<Arm, string>> = {};
    for (const a of ARMS) {
      const r = results.entries[`${row.id}-${a}`];
      if (r?.state === 'ready' && r.copy && existsSync(r.copy)) drawn[a] = r.copy;
    }
    return {
      id: row.id,
      moment: row.moment,
      title: `${p.b.title}, ${row.moment}`,
      told: toldOf(s),
      action: p.pictures.get(row.moment)?.fields.action?.value ?? '',
      drawn,
    };
  }),
  `Three ways to draw ${allRows.length} moments`,
);
mkdirSync(join(judge, 'img', 'paired'), { recursive: true });
for (const c of set.copies) copyFileSync(c.from, join(judge, c.to));
writeFileSync(join(judge, 'data-paired.json'), `${JSON.stringify(set.data, null, 1)}\n`);
// The answer key stays with the results, away from the page the judge sees.
const keyFile = join(OUT, 'paired-key.json');
writeFileSync(keyFile, `${JSON.stringify(set.key, null, 1)}\n`);
writeFileSync(
  join(judge, 'files-paired.json'),
  `${JSON.stringify(Object.fromEntries(set.copies.map((c) => [c.to, join(judge, c.to)])), null, 1)}\n`,
);
const all = Object.values(results.entries);
console.log(
  `\n${all.filter((r) => r.state === 'ready').length} drawn, ${all.filter((r) => r.state !== 'ready' && DONE.has(r.state)).length} not; $${spentSoFar().toFixed(2)} spent at fal's list price. Results: ${resultsFile}. Judging data: ${join(judge, 'data-paired.json')}; its key: ${keyFile}.`,
);
