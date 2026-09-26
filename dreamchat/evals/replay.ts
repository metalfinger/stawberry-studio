// A fixed benchmark: saved simulated conversations replayed from the dreamer's choice of how their
// dream should look, so the pictures drawn before and after a change to the harness come from the
// same conversation. Everything up to the message that chose the look is kept as it was said, and
// that message is said again word for word. Everything the harness makes from then on is made again
// by the code as it is now: the breakdown (drafted afresh from the same messages it was drafted from
// then), the floor plans and shots, the production, the sketches and the moments. The simulated
// dreamer of simulate.ts then carries the conversation on until the dream is drawn and closed, as
// it does after a resume.
//
//   DREAMCHAT_PROVIDER=fake bun run evals/replay.ts --out runs/replay-fake --label baseline
//   DREAMCHAT_PROVIDER=fal bun run evals/replay.ts <session id> [more ids] --out <dir> [--dry]
//
// With no ids, the five of evals/benchmark.json. Saved conversations are only ever read (from
// state/, or --from <folder>). Each replay is a new conversation in <dir>/<name>/state, drawn into
// its own Strawberry store <dir>/home-<name>, with the judge off and at most DREAMCHAT_IMAGE_CAP
// pictures (15 unless set). --dry prints what would be cut and kept, and calls no model.
//
// Kept as it was: the ways to draw it that were offered, and the one chosen (Jev's reading of the
// message that chose it is replaced by the choice made then, so "the second one" still means the
// same look). A look described in their own words is not written again by the model; the harness
// cleans it as it does today.
//
// Written: <dir>/<name>/pictures.json (every moment picture in story order, and what was drawn),
// <dir>/<name>/report.json (as simulate.ts reports a run), and <dir>/judge-data-<label>.json for
// the judging page, its pictures in <dir>/judge-img/.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import type { JevFn } from '../jev';
import type { Phase, State } from '../lib';
import type { Breakdown, StyleOption } from '../producer';
import type { DraftResult, Entry, Session, StoreDeps, TurnDetail, TurnRecord } from '../session';

/** The dreamchat folder. */
const HERE = resolve(import.meta.dir, '..');
/** fal's list price for one picture, as the chat counts it. */
const PRICE = 0.15;
const DEFAULT_CAP = 15;

/** What a replay leaves out of the saved conversation, for the printout. */
export type Dropped = {
  /** Turns from the one that chose the look on, Berry's reply to it included. */
  turns: number;
  /** Their messages after the one that chose the look. */
  messages: number;
  briefs: number;
  breakdown: { basedOn: number; title: string; moments: number } | null;
  prep: boolean;
  production: string | null;
  sketches: number;
  moments: number;
  ghosts: number;
  images: number;
};

export type Cut = {
  /** The new conversation, as it stood just before the message that chose the look was read. */
  session: Session;
  /** That message's turn: its move was `start`. */
  turn: number;
  /** Their message that chose the look, said again as it was. */
  message: string;
  /** The look they chose then. */
  style: StyleOption;
  /** The ways to draw it that were offered. */
  options: StyleOption[];
  /** How many of their messages each breakdown was drafted from, in order. */
  draftPoints: number[];
  /** Their messages up to and including the one that chose the look. */
  told: string[];
  dropped: Dropped;
};

type Detail = (turn: number) => Pick<TurnDetail, 'stateAfter'> | null;

/**
 * The counts a conversation keeps of its own moves, as session.ts keeps them, over the turns kept:
 * which gaps were asked about, which threads explored, the retellings, offers and style questions.
 */
export function countersAt(before: TurnRecord[]) {
  const askCounts: Record<string, number> = {};
  const exploredThreads: string[] = [];
  let retells = 0;
  let offers = 0;
  let styleAsks = 0;
  let resumed: Session['resumed'];
  let prev: Phase = 'listen';
  for (const t of before) {
    const m = t.move;
    if (m.kind === 'probe_goal') askCounts[m.goalId] = (askCounts[m.goalId] ?? 0) + 1;
    if ((m.kind === 'explore_thread' || m.kind === 'circle_back') && !exploredThreads.includes(m.threadId))
      exploredThreads.push(m.threadId);
    // A retelling the check found was none left the conversation listening.
    if ((m.kind === 'retell' && t.phase === 'retell') || m.kind === 'take_correction') retells += 1;
    if (prev === 'retell' && t.phase === 'listen') {
      resumed = { times: (resumed?.times ?? 0) + 1, at: t.turn };
      retells = 0;
    }
    if (m.kind === 'offer_visualize' || m.kind === 'offer_later') offers += 1;
    if (m.kind === 'choose_style' || m.kind === 'style_help') styleAsks += 1;
    prev = t.phase;
  }
  return { askCounts, exploredThreads, retells, offers, styleAsks, resumed };
}

/**
 * How many of their messages each breakdown was drafted from, in the order session.ts started them:
 * on a retelling and on each correction of it, and on an offer that came with a correction.
 */
export function draftPoints(src: Session, before: TurnRecord[], upTo: number, detail: Detail): number[] {
  const points = new Set<number>();
  let prev: Phase = 'listen';
  for (const t of before) {
    if (t.move.kind === 'retell' || t.move.kind === 'take_correction') points.add(t.turn);
    if (t.move.kind === 'offer_visualize' && prev === 'retell') {
      const reply = detail(t.turn)?.stateAfter.signals.retell_reply;
      if (reply === 'corrected' || reply === 'added_more') points.add(t.turn);
    }
    prev = t.phase;
  }
  // One started while waiting for the breakdown (a restart lost the running one) is the saved one's.
  const last = src.draft?.basedOn ?? upTo;
  if (src.draft?.basedOn && src.draft.basedOn <= upTo) points.add(src.draft.basedOn);
  return [...points].filter((p) => p >= 1 && p <= Math.min(upTo, last)).sort((a, b) => a - b);
}

/**
 * A saved conversation cut to just after the dreamer's message that chose how it should look (the
 * turn whose move was `start`): that message is held back to be said again, and the conversation is
 * as it stood when it arrived. Everything the harness derived from then on is left out: the
 * breakdown, the planned shots, the production, the sketches and moments, and the later turns and
 * briefs. Nothing of `src` is changed.
 */
export function cutAtStyle(src: Session, opts: { id: string; name: string; now: number; detail: Detail }): Cut {
  const start = src.turns.find((t) => t.move.kind === 'start');
  if (!start) throw new Error(`${src.id} never got as far as choosing how it should look`);
  const n = start.turn;
  if (!src.style) throw new Error(`${src.id} has no chosen look saved`);
  let at = -1;
  for (let i = 0, users = 0; i < src.transcript.length && at === -1; i++)
    if (src.transcript[i].role === 'user' && ++users === n) at = i;
  if (at === -1) throw new Error(`${src.id} has no message ${n} from the dreamer`);
  const before = src.turns.filter((t) => t.turn < n);
  const last = before.at(-1);
  if (last?.phase !== 'style')
    throw new Error(`${src.id} was not choosing a look before message ${n} (${last?.phase ?? 'no turn'})`);
  const state: State | undefined = opts.detail(n - 1)?.stateAfter;
  if (!state) throw new Error(`${src.id} has no record of turn ${n - 1}: the state before the choice is unknown`);
  const counters = countersAt(before);
  const transcript = structuredClone(src.transcript.slice(0, at));
  const session: Session = {
    id: opts.id,
    name: opts.name,
    createdAt: opts.now,
    updatedAt: opts.now,
    phase: last.phase,
    closed: false,
    transcript,
    briefs: Object.fromEntries(Object.entries(src.briefs).filter(([k]) => Number(k) < n)),
    turns: structuredClone(before),
    state: { ...structuredClone(state), session_id: opts.id },
    askCounts: counters.askCounts,
    exploredThreads: counters.exploredThreads,
    retells: counters.retells,
    ...(counters.resumed ? { resumed: counters.resumed } : {}),
    offers: counters.offers,
    styleAsks: counters.styleAsks,
    draft: null,
    style: null,
    production: null,
    build: null,
    images: 0,
    spentUsd: 0,
  };
  const message = src.transcript[at].content;
  const frames = src.build?.frames ?? [];
  const b = src.draft?.breakdown;
  return {
    session,
    turn: n,
    message,
    style: structuredClone(src.style),
    options: structuredClone(b?.style_options ?? []),
    draftPoints: draftPoints(src, before, n, opts.detail),
    told: [...transcript.filter((e) => e.role === 'user').map((e) => e.content), message],
    dropped: {
      turns: src.turns.length - before.length,
      messages: src.transcript.filter((e) => e.role === 'user').length - n,
      briefs: Object.keys(src.briefs).length - Object.keys(session.briefs).length,
      breakdown: b
        ? {
            basedOn: src.draft?.basedOn ?? 0,
            title: b.title,
            moments: b.scenes.reduce((k, sc) => k + sc.moments.length, 0),
          }
        : null,
      prep: !!src.prep,
      production: src.production?.status ?? null,
      sketches: src.build?.items.filter((i) => !i.extras).length ?? 0,
      moments: frames.filter((f) => f.kind === 'cut').length,
      ghosts: frames.filter((f) => f.kind === 'ghost').length,
      images: src.images,
    },
  };
}

/** The dream a simulated conversation was simulated from: "simulated: jellyfish-city". */
export function dreamOf(name: string): string | null {
  return name.match(/^simulated: ([\w-]+)$/)?.[1] ?? null;
}

/**
 * The conversation up to and including their `k`th message: what the producer was given, since a
 * draft starts before Berry answers that message.
 */
export function upToMessage(transcript: Entry[], k: number): Entry[] {
  let users = 0;
  const out: Entry[] = [];
  for (const e of transcript) {
    out.push(e);
    if (e.role === 'user' && ++users === k) break;
  }
  return out;
}

/**
 * A breakdown's story, whatever floor plans it was given since and whatever ways to draw it were
 * offered: a draft made again by the producer is never the same text.
 */
export function storyKey(b: Breakdown): string {
  const { style_options: _, ...story } = b;
  return new Bun.CryptoHasher('sha256')
    .update(JSON.stringify({ ...story, scenes: b.scenes.map(({ blocking: __, ...sc }) => sc) }))
    .digest('hex');
}

/** A conversation id in the harness's own form. */
function newId(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `dream-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomUUID().slice(0, 4)}`;
}

/** What the replay of one dream needs, written by the parent for the process that runs it. */
type Meta = {
  name: string;
  label: string;
  source: string;
  id: string;
  dream: string;
  turn: number;
  message: string;
  style: StyleOption;
  options: StyleOption[];
  draftPoints: number[];
  told: string[];
  max: number;
  provider: string;
  home: string;
  cap: number;
  saved: { images: number; breakdownTitle: string | null; breakdownKey: string | null; moments: number };
};

type Picture = { id: string; action: string; file: string; key: boolean; version: number };
type Pictures = {
  dream: string;
  label: string;
  session: string;
  from: string;
  provider: string;
  phase: string;
  closed: boolean;
  style: { id: string; name: string; kept: boolean; saved: string };
  choice: { move: string; rule: string; jevRead: string[] };
  breakdown: {
    draftedAt: string;
    points: number[];
    ms: number | null;
    title: string | null;
    moments: number;
    savedTitle: string | null;
    savedMoments: number;
    /** The producer's draft, as written, is the saved one's story word for word. */
    sameAsSaved: boolean;
    /** The breakdown drawn from is the one drafted here (its note says so). */
    draftedHere: boolean;
  };
  drawn: { sketches: number; moments: number; inBetween: number; images: number; usd: number };
  pictures: Picture[];
  undrawn: { id: string; action: string; status: string; error?: string }[];
};

const flag = (args: string[], name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

async function main(args: string[]): Promise<void> {
  const child = flag(args, '--child');
  if (child) return runOne(child);
  const outArg = flag(args, '--out');
  if (!outArg) {
    console.error(
      'usage: DREAMCHAT_PROVIDER=fake|fal bun run evals/replay.ts [<session id> …] --out <dir> [--label <set>] [--from <state folder>] [--max 40] [--dry]',
    );
    process.exit(1);
  }
  const out = resolve(outArg);
  const from = resolve(flag(args, '--from') ?? join(HERE, 'state'));
  const label = flag(args, '--label') ?? basename(out);
  const max = Number(flag(args, '--max') ?? 40);
  const dry = args.includes('--dry');
  const valued = new Set(['--out', '--from', '--label', '--max']);
  let ids = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1] ?? ''));
  if (!ids.length)
    ids = (
      JSON.parse(readFileSync(join(import.meta.dir, 'benchmark.json'), 'utf8')) as { dreams: { session: string }[] }
    ).dreams.map((d) => d.session);
  if (!/^[\w-]+$/.test(label)) throw new Error(`--label is a plain name: ${label}`);
  if (out === from || out.startsWith(from + sep)) throw new Error('--out must be outside the saved conversations');

  const provider = process.env.DREAMCHAT_PROVIDER ?? '';
  const cap = Number(process.env.DREAMCHAT_IMAGE_CAP ?? DEFAULT_CAP);
  const python = process.env.STRAWBERRY_PYTHON ?? join(HERE, '..', 'venv', 'bin', 'python');
  if (!dry) {
    // Never drawn with fal by default because a key happens to be set.
    if (!['fake', 'fal', 'higgsfield'].includes(provider))
      throw new Error('set DREAMCHAT_PROVIDER: fake draws free placeholders, fal pays for real pictures');
    if (!existsSync(python))
      throw new Error(
        `the Strawberry engine is not installed (${python}): nothing would be drawn; set STRAWBERRY_PYTHON`,
      );
  }

  const now = Date.now();
  const metas: Meta[] = [];
  const cuts: Cut[] = [];
  const names = new Set<string>();
  for (const [i, source] of ids.entries()) {
    if (!/^[\w-]+$/.test(source)) throw new Error(`not a session id: ${source}`);
    const src = JSON.parse(readFileSync(join(from, `${source}.json`), 'utf8')) as Session;
    const slug = dreamOf(src.name);
    const dream = slug ? join(HERE, 'dreams', `${slug}.md`) : '';
    if (!slug || !existsSync(dream))
      throw new Error(`${source} ("${src.name}") was not simulated from a dream file in dreams/`);
    let name = slug;
    for (let k = 2; names.has(name); k++) name = `${slug}-${k}`;
    names.add(name);
    const detail: Detail = (turn) => {
      const path = join(from, source, `turn-${turn}.json`);
      return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as TurnDetail) : null;
    };
    const id = newId(now + i * 1000);
    const cut = cutAtStyle(src, { id, name: `replayed (${label}): ${slug} from ${source}`, now, detail });
    const home = join(out, `home-${name}`);
    // Never the page's own store, and never a shared .strawberry one.
    if (home === join(HERE, 'strawberry-home') || home.includes(`${sep}.strawberry`))
      throw new Error(`refusing to draw into ${home}`);
    cuts.push(cut);
    metas.push({
      name,
      label,
      source,
      id,
      dream,
      turn: cut.turn,
      message: cut.message,
      style: cut.style,
      options: cut.options,
      draftPoints: cut.draftPoints,
      told: cut.told,
      max,
      provider,
      home,
      cap,
      saved: {
        images: src.images,
        breakdownTitle: src.draft?.breakdown?.title ?? null,
        breakdownKey: src.draft?.breakdown ? storyKey(src.draft.breakdown) : null,
        moments: cut.dropped.breakdown?.moments ?? 0,
      },
    });
  }

  // What would be cut and kept, and what it could cost.
  for (const [i, m] of metas.entries()) {
    const c = cuts[i];
    const d = c.dropped;
    const kept = c.session.transcript;
    console.log(`\n━━ ${m.name} ━━ ${m.source} → ${m.id}`);
    console.log(
      `  kept: ${kept.filter((e) => e.role === 'user').length} of their messages and ${kept.filter((e) => e.role === 'assistant').length} of Berry's replies (turns 0-${c.turn - 1}), and the state after turn ${c.turn - 1} (${c.session.phase})`,
    );
    console.log(`  said again: message ${c.turn}, "${c.message.slice(0, 120)}"`);
    console.log(
      `  the look kept: ${c.style.id}) ${c.style.name}${c.style.medium ? ` (${c.style.medium})` : ''}; the ${c.options.length} ways offered kept as offered${c.style.id === 'own' ? '; their own look is not written again, but cleaned by the harness as it is now' : ''}`,
    );
    console.log(
      `  dropped: ${d.turns} turns from ${c.turn} on (Berry's reply to it and ${d.messages} later messages), ${d.briefs} briefs; the breakdown${d.breakdown ? ` "${d.breakdown.title}" (${d.breakdown.moments} moments, from ${d.breakdown.basedOn} messages)` : ''}; ${d.prep ? 'the planned shots; ' : ''}the production (${d.production ?? 'none'}); ${d.sketches} sketches, ${d.moments} moments, ${d.ghosts} in-between pictures (${d.images} pictures drawn)`,
    );
    console.log(
      `  made again by the code as it is now: the breakdown, drafted from ${c.draftPoints.map((p) => `${p}`).join(' then ')} of their messages as it was then, and everything after`,
    );
  }
  const saved = metas.reduce((k, m) => k + m.saved.images, 0);
  console.log(
    `\nestimate: at most ${cap} pictures a dream (DREAMCHAT_IMAGE_CAP), $${(cap * PRICE).toFixed(2)} a dream and $${(cap * PRICE * metas.length).toFixed(2)} for ${metas.length} at fal's $${PRICE}; the saved runs drew ${saved} ($${(saved * PRICE).toFixed(2)}).`,
  );
  console.log(
    provider === 'fake'
      ? 'drawn with fake: placeholders, nothing paid for; only the text models are called.'
      : provider
        ? `drawn with ${provider}: pictures are paid for.`
        : 'no DREAMCHAT_PROVIDER set.',
  );
  if (dry) return;

  for (const m of metas)
    if (existsSync(join(out, m.name, 'replay.json')))
      throw new Error(`${join(out, m.name)} already holds a replay: choose another --out`);
  for (const [i, m] of metas.entries()) {
    const dir = join(out, m.name);
    const state = join(dir, 'state');
    mkdirSync(join(state, m.id), { recursive: true });
    writeFileSync(join(state, `${m.id}.json`), JSON.stringify(cuts[i].session, null, 2));
    // The kept turns' traces, so the page shows why each reply was said.
    for (let t = 0; t < m.turn; t++) {
      const trace = join(from, m.source, `turn-${t}.json`);
      if (existsSync(trace)) copyFileSync(trace, join(state, m.id, `turn-${t}.json`));
    }
    writeFileSync(join(dir, 'replay.json'), JSON.stringify(m, null, 2));
  }

  const codes = await Promise.all(
    metas.map(async (m) => {
      const dir = join(out, m.name);
      const log = join(dir, 'replay.log');
      const proc = Bun.spawn([process.execPath, 'run', import.meta.path, '--child', dir], {
        cwd: HERE,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          DREAMCHAT_PROVIDER: provider,
          DREAMCHAT_JUDGE: 'off',
          DREAMCHAT_IMAGE_CAP: String(cap),
          DREAMCHAT_STRAWBERRY_HOME: m.home,
          DREAMCHAT_JUDGE_QUEUE: join(dir, 'judge-queue'),
        },
      });
      await Promise.all([pump(proc.stdout, m.name, log), pump(proc.stderr, m.name, log)]);
      return proc.exited;
    }),
  );

  // The judging page's data: every moment drawn, in story order, as the page shows a set.
  const images = join(out, 'judge-img');
  mkdirSync(images, { recursive: true });
  const runs = [];
  console.log('\n━━ replayed ━━');
  for (const [i, m] of metas.entries()) {
    const path = join(out, m.name, 'pictures.json');
    if (!existsSync(path)) {
      console.log(`${m.name}: failed (exit ${codes[i]}), no pictures; see ${join(out, m.name, 'replay.log')}`);
      continue;
    }
    const p = JSON.parse(readFileSync(path, 'utf8')) as Pictures;
    const moments = p.pictures.map((pic) => {
      const img = judgeImage(pic.file, join(images, `${label}-${m.name}-${pic.id}`));
      return { id: `${m.name}-${pic.id}`, moment: pic.id, action: pic.action, img: relative(out, img) };
    });
    runs.push({ run: m.name, title: p.breakdown.title ?? m.name, told: m.told, moments });
    console.log(
      `${m.name}: ${p.phase}${p.closed ? '' : ' (not closed)'} · ${p.pictures.length} of ${p.pictures.length + p.undrawn.length} moments drawn · pictures: ${p.drawn.sketches} sketches, ${p.drawn.moments} moments, ${p.drawn.inBetween} in-between = ${p.drawn.images} ($${p.drawn.usd.toFixed(2)} at fal) · breakdown ${p.breakdown.draftedHere && !p.breakdown.sameAsSaved ? 'fresh' : 'NOT fresh'}, drafted ${p.breakdown.draftedAt} · look ${p.style.kept ? 'kept' : `changed: "${p.style.saved}" → "${p.style.name}"`}`,
    );
  }
  const data = join(out, `judge-data-${label}.json`);
  writeFileSync(
    data,
    JSON.stringify(
      { set: label, title: `${runs.length} dreams replayed from the style choice (${label})`, runs },
      null,
      2,
    ),
  );
  console.log(`\njudging data: ${data}`);
  process.exit(codes.every((c) => c === 0) ? 0 : 1);
}

/** A child's output, line by line, to its log and to this terminal with its name. */
async function pump(stream: ReadableStream<Uint8Array>, name: string, log: string): Promise<void> {
  const decoder = new TextDecoder();
  let rest = '';
  const line = (l: string) => {
    appendFileSync(log, `${l}\n`);
    console.log(`[${name}] ${l}`);
  };
  for await (const chunk of stream) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split('\n');
    rest = lines.pop() ?? '';
    for (const l of lines) line(l);
  }
  if (rest) line(rest);
}

/**
 * A picture for the judging page: a JPEG at 80 no more than 1100 px a side, made with sips on macOS;
 * elsewhere the file itself, unresized. Returns the file written.
 */
export function judgeImage(src: string, stem: string): string {
  if (process.platform === 'darwin' && Bun.which('sips')) {
    const size = Bun.spawnSync(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', src]).stdout.toString();
    const side = Math.max(...[...size.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => Number(m[1])), 0);
    const dest = `${stem}.jpg`;
    const made = Bun.spawnSync([
      'sips',
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      '80',
      ...(side > 1100 ? ['-Z', '1100'] : []),
      src,
      '--out',
      dest,
    ]);
    if (made.exitCode === 0 && existsSync(dest)) return dest;
  }
  const dest = `${stem}${extname(src)}`;
  copyFileSync(src, dest);
  return dest;
}

/**
 * One dream, in a process of its own: its Strawberry store, judge and picture limit are read from
 * the environment when the harness loads, so each dream needs its own.
 */
async function runOne(dir: string): Promise<void> {
  const meta = JSON.parse(readFileSync(join(dir, 'replay.json'), 'utf8')) as Meta;
  const sim = await import('../simulate');
  const { liveProducer } = await import('../session');
  const { callJev } = await import('../jev');
  const { judgeKind } = await import('../judge');
  const { PROVIDER, spawnWorker } = await import('../sheets');
  const { REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable } = await import('../strawberry');
  if (STRAWBERRY_HOME !== meta.home || PROVIDER !== meta.provider || judgeKind !== 'off')
    throw new Error(`not set up as the replay asked: ${STRAWBERRY_HOME}, ${PROVIDER}, judge ${judgeKind}`);
  if (!strawberryAvailable()) throw new Error(`the Strawberry engine is not installed (${STRAWBERRY_PYTHON})`);
  const stateDir = join(dir, 'state');
  const file = join(stateDir, `${meta.id}.json`);

  // The breakdown, drafted afresh by the producer as it is now, from the same messages and in the
  // same steps as it was drafted then, keeping the ways to draw it as they were offered.
  const producer = liveProducer(callJev);
  const keepOptions: NonNullable<StoreDeps['producer']> = async (transcript, previous) => {
    const r = await producer(transcript, previous);
    return { ...r, breakdown: { ...r.breakdown, style_options: structuredClone(meta.options) } };
  };
  const cut = JSON.parse(readFileSync(file, 'utf8')) as Session;
  const said: Entry[] = [...cut.transcript, { role: 'user', content: meta.message }];
  const t0 = Date.now();
  let drafted: DraftResult | undefined;
  for (const k of meta.draftPoints) {
    drafted = await keepOptions(
      upToMessage(said, k).map(({ role, content }) => ({ role, content })),
      drafted?.breakdown,
    );
    console.log(`breakdown drafted from ${k} messages in ${drafted.ms} ms: "${drafted.breakdown.title}"`);
  }
  if (!drafted) throw new Error('nothing to draft the breakdown from');
  const draftedAt = new Date().toISOString();
  cut.draft = {
    status: 'ready',
    basedOn: meta.draftPoints.at(-1) ?? meta.turn,
    ...drafted,
    notes: [
      ...drafted.notes,
      `replay: drafted afresh at ${draftedAt} from ${meta.draftPoints.join(', ')} of their messages (${Date.now() - t0} ms); the ways to draw it kept as offered in ${meta.source}`,
    ],
  };
  const freshKey = storyKey(drafted.breakdown);
  writeFileSync(file, JSON.stringify(cut, null, 2));

  // Their choice is read as they made it: Jev's reading of it is replaced by the look chosen then.
  const jevRead: string[] = [];
  const choosing: JevFn = async (state, questions) => {
    if (!('style_choice' in questions)) return callJev(state, questions);
    let call = await callJev(state, questions);
    for (let i = 0; i < 2 && !call.answers; i++) call = await callJev(state, questions);
    const own = call.answers?.style_choice;
    jevRead.push(own?.type === 'choice' ? `${own.choice} (${own.confidence.toFixed(2)})` : 'no reading');
    if (!call.answers) return call;
    return {
      ...call,
      answers: {
        ...call.answers,
        style_choice: { type: 'choice', choice: meta.style.id, confidence: 1, probabilities: { [meta.style.id]: 1 } },
      },
    };
  };
  const store = sim.liveStore(stateDir, {
    jev: choosing,
    producer: keepOptions,
    // Their own look is the one made then, not written again.
    ...(meta.style.id === 'own' ? { ownStyle: async () => structuredClone(meta.style) } : {}),
  });
  const worker = spawnWorker(STRAWBERRY_PYTHON, REPO);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      worker?.stop();
      process.exit(130);
    });
  console.log(`replaying ${meta.source} as ${meta.id}, drawn with ${PROVIDER} into ${STRAWBERRY_HOME}`);
  const progress = setInterval(() => {
    const s = store.get(meta.id);
    const count = (xs: { status: string }[] = []) => `${xs.filter((x) => x.status === 'ready').length}/${xs.length}`;
    console.log(
      `${new Date().toISOString().slice(11, 19)} ${s?.phase} after message ${s?.turns.at(-1)?.turn}: sketches ${count(s?.build?.items)}, moments ${count(s?.build?.frames?.filter((f) => f.kind === 'cut'))}, pictures ${s?.images}`,
    );
  }, 60_000);

  const dreamer = [{ role: 'system' as const, content: sim.DREAMER(sim.dreamText(meta.dream)) }];
  const heard = await sim.pickUp(store, meta.id, dreamer);
  await sim.converse(store, meta.id, dreamer, heard, meta.max, meta.message);
  const report = await sim.report(store, meta.id, meta.name);
  clearInterval(progress);
  worker?.stop();
  sim.print(report);
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));

  const s = store.get(meta.id);
  if (!s) throw new Error(`the replay ${meta.id} is gone`);
  const choice = s.turns.find((t) => t.turn === meta.turn);
  const b = s.draft?.breakdown;
  const moments = (s.build?.frames ?? [])
    .filter((f) => f.kind === 'cut')
    .sort((x, y) => (x.frame?.order ?? 0) - (y.frame?.order ?? 0));
  const drawn = (f: (typeof moments)[number]) => f.status === 'ready' && !!f.mediaPath;
  const takes = (xs: { version: number }[] = []) => xs.reduce((k, x) => k + x.version, 0);
  const actionOf = (f: (typeof moments)[number]) => f.fields.action?.value ?? f.name;
  const pictures: Pictures = {
    dream: meta.name,
    label: meta.label,
    session: meta.id,
    from: meta.source,
    provider: PROVIDER,
    phase: s.phase,
    closed: s.closed,
    style: {
      id: s.style?.id ?? '',
      name: s.style?.name ?? '',
      kept: JSON.stringify(s.style) === JSON.stringify(meta.style),
      saved: meta.style.name,
    },
    choice: { move: choice ? JSON.stringify(choice.move) : 'none', rule: choice?.rule ?? '', jevRead },
    breakdown: {
      draftedAt,
      points: meta.draftPoints,
      ms: s.draft?.ms ?? null,
      title: b?.title ?? null,
      moments: moments.length,
      savedTitle: meta.saved.breakdownTitle,
      savedMoments: meta.saved.moments,
      sameAsSaved: freshKey === meta.saved.breakdownKey,
      draftedHere: (s.draft?.notes ?? []).some((n) => n.startsWith(`replay: drafted afresh at ${draftedAt}`)),
    },
    drawn: {
      sketches: takes(s.build?.items),
      moments: takes(moments),
      inBetween: takes(s.build?.frames?.filter((f) => f.kind === 'ghost')),
      images: s.images,
      usd: Math.round(s.images * PRICE * 100) / 100,
    },
    pictures: moments.filter(drawn).map((f) => ({
      id: f.id,
      action: actionOf(f),
      file: join(STRAWBERRY_HOME, 'media', f.mediaPath ?? ''),
      key: !!f.frame?.key,
      version: f.version,
    })),
    undrawn: moments
      .filter((f) => !drawn(f))
      .map((f) => ({ id: f.id, action: actionOf(f), status: f.status, ...(f.error ? { error: f.error } : {}) })),
  };
  writeFileSync(join(dir, 'pictures.json'), JSON.stringify(pictures, null, 2));
  process.exit(0);
}

if (import.meta.main) await main(process.argv.slice(2));
