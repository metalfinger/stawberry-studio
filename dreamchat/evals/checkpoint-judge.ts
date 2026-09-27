// The blind judging of a picture checkpoint, all on this machine (evals/checkpoint.ts --judge, --score).
// A small page served on 127.0.0.1 shows each moment's two pictures, the old and the new as A and B in an
// order that says nothing, beside the picture before, with the moment's line and what the dreamer said.
// The owner answers A right, B right, both or neither, with a note, and every answer is written to the
// checkpoint's results folder as it is given, so nothing is lost if the page is closed. The answer key
// stays in the results folder and is never served; --score reads the answers against it. No account, no
// network beyond this machine.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { AB, CheckpointSet, Verdict, Why } from './checkpoint-set';

/** One moment on the judging page: its pictures by their files in the judge folder, and what they are judged against. */
export type JudgeMoment = {
  id: string;
  title: string;
  /** The moment's line, as the owner judged the old picture against it. */
  description: string;
  /** What the dreamer said before they were offered pictures. */
  told: string[];
  /** The picture before, as the run drew it; null for a dream's first. */
  before: string | null;
  a: string;
  b: string;
};
export type JudgeData = { checkpoint: string; title: string; about: string; moments: JudgeMoment[] };
/** Which picture each moment's A and B are: kept with the results, never in the judge folder. */
export type AnswerKey = Record<string, { a: AB; b: AB }>;

export const ANSWERS = ['a', 'b', 'both', 'neither'] as const;
export type Answer = (typeof ANSWERS)[number];
/** The owner's answers so far, written after every answer. */
export type Answers = {
  checkpoint: string;
  updated: string | null;
  answers: Record<string, { answer: Answer | null; note: string; at: string }>;
};

/** One moment to judge: its old and new pictures, the picture before, and what they are judged against. */
export type ToJudge = {
  id: string;
  title: string;
  description: string;
  told: string[];
  old: string;
  new: string;
  before?: string | null;
};

/**
 * The judging page's data: each moment's pictures as A and B in the order given (`ab`: which picture is
 * A), nothing on the page saying which is old; the key says it. The pictures are copied into the judge
 * folder under names that say only A, B and before (`ext`, the copies' extension).
 */
export function judgeSetOf(
  checkpoint: string,
  ms: ToJudge[],
  ab: Record<string, AB>,
  ext = 'jpg',
): { data: JudgeData; key: AnswerKey; copies: { from: string; to: string }[] } {
  const key: AnswerKey = {};
  const copies: { from: string; to: string }[] = [];
  const moments = ms.map((m): JudgeMoment => {
    const a = ab[m.id];
    if (!a) throw new Error(`${m.id} has no order`);
    key[m.id] = { a, b: a === 'old' ? 'new' : 'old' };
    const img = (which: string, from: string) => {
      const to = `img/${m.id}-${which}.${ext}`;
      copies.push({ from, to });
      return to;
    };
    const first = img('a', a === 'old' ? m.old : m.new);
    const second = img('b', a === 'old' ? m.new : m.old);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      told: m.told,
      before: m.before ? img('before', m.before) : null,
      a: first,
      b: second,
    };
  });
  return {
    data: {
      checkpoint,
      title: `Checkpoint ${checkpoint}: two pictures of each moment`,
      about:
        "Each moment of the dream was drawn twice. Look at A and B beside the picture before, against the moment's line and what the dreamer said, as the dreamer would when flipping through their storyboard: would they keep it? Answer which are right: A, B, both or neither, and say why in a note if you like. Every answer is saved as you give it.",
      moments,
    },
    key,
    copies,
  };
}

export const emptyAnswers = (checkpoint: string): Answers => ({ checkpoint, updated: null, answers: {} });

/**
 * The answers with one more: `body` is what the page sent ({ id, answer, note }). An answer is one of
 * A, B, both or neither; a note alone keeps the answer given before. Anything else is refused, said why.
 */
export function withAnswer(
  prev: Answers,
  data: Pick<JudgeData, 'moments'>,
  body: unknown,
  at = new Date().toISOString(),
): { answers: Answers } | { error: string } {
  const b = body as { id?: unknown; answer?: unknown; note?: unknown } | null;
  if (!b || typeof b !== 'object') return { error: 'send { id, answer, note }' };
  if (typeof b.id !== 'string' || !data.moments.some((m) => m.id === b.id))
    return { error: `no moment ${String(b.id)} on this page` };
  if (b.answer !== undefined && b.answer !== null && !ANSWERS.includes(b.answer as Answer))
    return { error: `the answer is one of ${ANSWERS.join(', ')}` };
  if (b.note !== undefined && typeof b.note !== 'string') return { error: 'a note is text' };
  const was = prev.answers[b.id];
  const answer = (b.answer ?? was?.answer ?? null) as Answer | null;
  const note = ((b.note as string | undefined) ?? was?.note ?? '').slice(0, 4000);
  return {
    answers: { ...prev, updated: at, answers: { ...prev.answers, [b.id]: { answer, note, at } } },
  };
}

/** A file written whole or not at all: a closed page or a stopped server never leaves half an answer. */
export function writeWhole(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

// ── the score ────────────────────────────────────────────────────────────────────────────────────

export type MomentScore = {
  id: string;
  why: Why;
  /** The owner's verdict on the old picture, before. */
  before: Verdict;
  answer: Answer | null;
  /** Whether the owner called the new picture right, and the old one, blind; null when not answered. */
  newRight: boolean | null;
  oldRight: boolean | null;
  note: string;
};

export type Score = {
  checkpoint: string;
  judged: number;
  of: number;
  faults: { judged: number; of: number; nowRight: number; oldRightNow: number };
  guards: { judged: number; of: number; stillRight: number; oldRightAgain: number };
  moments: MomentScore[];
};

/**
 * The owner's answers read against the key: for each moment whether the new picture and the old one were
 * called right, blind. A fault is put right when its new picture is right; a guard stays right when its
 * new picture is right. Moments not drawn or not answered count as not judged.
 */
export function scoreOf(set: Pick<CheckpointSet, 'name' | 'moments'>, key: AnswerKey, got: Answers): Score {
  const moments = set.moments.map((m): MomentScore => {
    const k = key[m.id];
    const a = got.answers[m.id];
    const answer = k ? (a?.answer ?? null) : null;
    const right = (which: AB) => {
      if (!k || answer === null) return null;
      const letter = k.a === which ? 'a' : 'b';
      return answer === 'both' || answer === letter;
    };
    return {
      id: m.id,
      why: m.why,
      before: m.old.verdict,
      answer,
      newRight: right('new'),
      oldRight: right('old'),
      note: a?.note ?? '',
    };
  });
  const judged = (xs: MomentScore[]) => xs.filter((x) => x.newRight !== null);
  const faults = moments.filter((x) => x.why === 'fault');
  const guards = moments.filter((x) => x.why === 'guard');
  return {
    checkpoint: set.name,
    judged: judged(moments).length,
    of: moments.length,
    faults: {
      judged: judged(faults).length,
      of: faults.length,
      nowRight: faults.filter((x) => x.newRight).length,
      oldRightNow: faults.filter((x) => x.oldRight).length,
    },
    guards: {
      judged: judged(guards).length,
      of: guards.length,
      stillRight: guards.filter((x) => x.newRight).length,
      oldRightAgain: guards.filter((x) => x.oldRight).length,
    },
    moments,
  };
}

/** The score as lines to read. */
export function scoreLines(s: Score): string[] {
  const said = (x: MomentScore) =>
    `${x.id}: the old picture ${x.oldRight ? 'right' : 'not right'}, the new ${x.newRight ? 'right' : 'not right'} (before, the owner called it ${x.before})${x.note ? `: "${x.note}"` : ''}`;
  const lines = [
    `Checkpoint ${s.checkpoint}: ${s.judged} of ${s.of} moments judged.`,
    `Faults (the old picture called partly right or wrong before): the new picture right in ${s.faults.nowRight} of ${s.faults.judged} judged (${s.faults.of} in the set); the old one called right this time in ${s.faults.oldRightNow}.`,
    `Guards (the old picture called right before): the new picture still right in ${s.guards.stillRight} of ${s.guards.judged} judged (${s.guards.of} in the set); the old one called right again in ${s.guards.oldRightAgain}.`,
  ];
  const group = (title: string, xs: MomentScore[]) => (xs.length ? [``, title, ...xs.map((x) => `  ${said(x)}`)] : []);
  const judged = s.moments.filter((x) => x.newRight !== null);
  lines.push(
    ...group(
      'Faults put right:',
      judged.filter((x) => x.why === 'fault' && x.newRight),
    ),
    ...group(
      'Faults not put right:',
      judged.filter((x) => x.why === 'fault' && !x.newRight),
    ),
    ...group(
      'Guards that stayed right:',
      judged.filter((x) => x.why === 'guard' && x.newRight),
    ),
    ...group(
      'Guards lost:',
      judged.filter((x) => x.why === 'guard' && !x.newRight),
    ),
  );
  const open = s.moments.filter((x) => x.newRight === null).map((x) => x.id);
  if (open.length) lines.push('', `Not judged yet (not drawn, or not answered): ${open.join(', ')}`);
  return lines;
}

// ── the page ─────────────────────────────────────────────────────────────────────────────────────

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * The judging page, served on 127.0.0.1 on a free port (or `port`): the page, its data without the key,
 * the pictures of the judge folder by name only, and the answers, each written to `answersFile` as it
 * comes. Returns its address and a way to stop it.
 */
export function serveJudge(opts: { dir: string; answersFile: string; data: JudgeData; port?: number }): {
  url: string;
  stop: () => void;
} {
  const read = (): Answers =>
    existsSync(opts.answersFile)
      ? (JSON.parse(readFileSync(opts.answersFile, 'utf8')) as Answers)
      : emptyAnswers(opts.data.checkpoint);
  const json = (x: unknown, status = 200) =>
    new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
        return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (req.method === 'GET' && url.pathname === '/data.json') return json({ data: opts.data, answers: read() });
      if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
        // By its name alone, from the judge folder's pictures: nothing else on this machine is served.
        const name = basename(decodeURIComponent(url.pathname.slice('/img/'.length)));
        const path = join(opts.dir, 'img', name);
        if (!TYPES[extname(name).toLowerCase()] || !existsSync(path)) return new Response('not found', { status: 404 });
        return new Response(Bun.file(path), { headers: { 'content-type': TYPES[extname(name).toLowerCase()] } });
      }
      if (req.method === 'POST' && url.pathname === '/answer') {
        const body = await req.json().catch(() => null);
        const next = withAnswer(read(), opts.data, body);
        if ('error' in next) return json(next, 400);
        writeWhole(opts.answersFile, `${JSON.stringify(next.answers, null, 1)}\n`);
        return json(next);
      }
      return new Response('not found', { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) };
}

/** The page itself: plain HTML and a little script, nothing loaded from anywhere else. */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Checkpoint judging</title>
<style>
  :root { --bg: #f7f7f4; --card: #ffffff; --fg: #1d1d1b; --muted: #66665f; --line: #dcdcd4; --pick: #2d5b87; --on-pick: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #151514; --card: #1e1e1c; --fg: #ecece7; --muted: #a2a29a; --line: #36362f; --pick: #8db4dc; --on-pick: #10100f; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline;
    padding: 10px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
  header strong { font-size: 17px; }
  #progress { color: var(--muted); }
  main { max-width: 1500px; margin: 0 auto; padding: 16px; }
  .about { color: var(--muted); max-width: 70ch; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0 0 24px; }
  h2 { font-size: 18px; margin: 0 0 6px; }
  .line { margin: 0 0 8px; max-width: 90ch; }
  details { margin: 0 0 12px; color: var(--muted); }
  details p { margin: 4px 0; max-width: 90ch; }
  .pics { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  figure { margin: 0; }
  figure img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; }
  figcaption { margin: 0 0 4px; font-weight: 600; }
  figure.before figcaption { font-weight: 400; color: var(--muted); }
  .answer { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 8px; }
  button { font: inherit; padding: 8px 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); cursor: pointer; }
  button[aria-pressed="true"] { background: var(--pick); border-color: var(--pick); color: var(--on-pick); }
  textarea { display: block; width: 100%; min-height: 3.2em; padding: 6px 8px; font: inherit; color: var(--fg); background: var(--bg);
    border: 1px solid var(--line); border-radius: 6px; }
  .saved { display: block; margin-top: 6px; font-size: 14px; color: var(--muted); }
</style>
</head>
<body>
<header><strong id="title">Checkpoint</strong><span id="progress"></span></header>
<main id="main"><p>Loading…</p></main>
<script>
const LABELS = { a: 'A is right', b: 'B is right', both: 'Both are right', neither: 'Neither is right' };
let data = null;
let answers = {};

function el(tag, text, cls) {
  const x = document.createElement(tag);
  if (text !== undefined && text !== null) x.textContent = text;
  if (cls) x.className = cls;
  return x;
}

function figure(src, caption, cls) {
  const f = el('figure', null, cls);
  f.append(el('figcaption', caption));
  const img = el('img');
  img.src = src;
  img.alt = caption;
  img.loading = 'lazy';
  f.append(img);
  return f;
}

function progress() {
  const done = data.moments.filter((m) => answers[m.id] && answers[m.id].answer).length;
  document.getElementById('progress').textContent = done + ' of ' + data.moments.length + ' answered';
}

async function send(id, answer, note, row, saved) {
  saved.textContent = 'saving…';
  try {
    const res = await fetch('answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, answer, note }),
    });
    const got = await res.json();
    if (!res.ok) throw new Error(got.error || res.statusText);
    answers = got.answers.answers;
    const now = answers[id] ? answers[id].answer : null;
    for (const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.answer === now));
    saved.textContent = 'saved at ' + new Date().toLocaleTimeString();
    progress();
  } catch (e) {
    saved.textContent = 'NOT saved: ' + e.message;
  }
}

function moment(m, i) {
  const s = el('section');
  s.id = m.id;
  s.append(el('h2', (i + 1) + ' of ' + data.moments.length + ': ' + m.title));
  s.append(el('p', 'The moment: ' + m.description, 'line'));
  if (m.told.length) {
    const d = el('details');
    d.append(el('summary', 'What the dreamer said'));
    for (const t of m.told) d.append(el('p', t));
    s.append(d);
  }
  const pics = el('div', null, 'pics');
  if (m.before) pics.append(figure(m.before, 'The picture before', 'before'));
  pics.append(figure(m.a, 'A'));
  pics.append(figure(m.b, 'B'));
  s.append(pics);
  const was = answers[m.id];
  const row = el('div', null, 'answer');
  const note = el('textarea');
  note.placeholder = 'A note, if you like: what is right or wrong in A or B';
  note.value = was ? was.note : '';
  const saved = el('span', was ? 'saved' : '', 'saved');
  for (const k of Object.keys(LABELS)) {
    const b = el('button', LABELS[k]);
    b.type = 'button';
    b.dataset.answer = k;
    b.setAttribute('aria-pressed', String(!!was && was.answer === k));
    b.onclick = () => send(m.id, k, note.value, row, saved);
    row.append(b);
  }
  note.onchange = () => send(m.id, undefined, note.value, row, saved);
  s.append(row, note, saved);
  return s;
}

async function load() {
  const res = await fetch('data.json');
  const got = await res.json();
  data = got.data;
  answers = got.answers.answers || {};
  document.getElementById('title').textContent = data.title;
  const main = document.getElementById('main');
  main.textContent = '';
  main.append(el('p', data.about, 'about'));
  data.moments.forEach((m, i) => main.append(moment(m, i)));
  progress();
}

load().catch((e) => {
  document.getElementById('main').textContent = 'Could not load the page: ' + e.message;
});
</script>
</body>
</html>
`;
