// A picture test on the owner's local image machine (imgapi: Qwen-Image 2.1 edits), never the production path.
// The machine takes at most 4 images and 4000 characters a prompt, and the harness writes for Nano Banana Pro on
// fal (a median cut is ~5000 characters and 5 images), so each moment is fitted first, by one fixed rule both arms
// of a pair share: its images kept by role (image 1, then who is in it, the place, the things, earlier pictures),
// the manifest renumbered, and whole lines dropped in a fixed order, least picture-bearing first. What went is
// logged by paragraph id, so a picture's fault can be read against what it was not told. What it shows is how Qwen
// reads trimmed prompts: evidence within that model, one change at a time, never how fal reads the full prompt.
//
// A pair (--arm A:… --arm B:…) is each moment built under both arms' switches (the full profile, then each arm's
// own), its difference taken before fitting. A pair whose differing words or image the fitting cut from either arm
// is "not tested: trimmed", never counted as a tie.
//
//   bun run evals/local-draw.ts --name marks --moments dream-0926-012307-4c79:m3,… \
//     --arm A:DREAMCHAT_ONE_BUILDER=told_colours --arm B:DREAMCHAT_ONE_BUILDER=story_marks      (plan only: no call)
//   bun run evals/local-draw.ts --name marks --draw --yes [--quality fast|high]                  (sends what the plan holds)
//
// The plan (runs/local-draw/<name>/plan.json) holds each arm's fitted prompt, its image files and what was
// dropped; --draw sends only that, one job at a time, each with the moment's own seed in both arms, and keeps every
// job's id and answer beside its picture (runs/local-draw/<name>/<arm>/<moment>.png). Nothing is sent without
// --draw --yes: the machine is the owner's, often busy, and he says when.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Session } from '../session';
import { DIR, dataDir, readSession } from './saved';

export const API = process.env.IMGAPI_URL ?? 'https://imgapi.metalfinger.xyz';
export const MAX_CHARS = 4000;
export const MAX_IMAGES = 4;

/** The full profile every arm starts from: record, sheet, camera rules, references and every builder step. */
export const PROFILE: Record<string, string> = {
  DREAMCHAT_WRITER: 'claude',
  DREAMCHAT_RECORD: 'on',
  DREAMCHAT_CUT_SHEET: 'on',
  DREAMCHAT_CAMERA: 'on',
  DREAMCHAT_REFS: 'on',
  DREAMCHAT_ONE_BUILDER: 'on',
};

// ── fitting ──────────────────────────────────────────────────────────────────────────────────────

export type Line = { id: string; text: string };
export type Img = { n: number; role: string; name: string; file?: string; missing?: string };
export type Fitted = {
  prompt: string;
  images: Img[];
  /** Images left out, by name; paragraphs left out whole, by id; lines cut from a paragraph, by id and start. */
  dropped: { images: string[]; paragraphs: string[]; lines: string[]; chars: number };
  /** Each paragraph as sent, by id, or null where it was left out: what a pair checks survived. */
  kept: Record<string, string | null>;
  fits: boolean;
  /** How many cuts were made: a pair is fitted with as many cuts in both arms (`fitPair`). */
  ops: number;
};

/** Images kept first to last: image 1 (the edit or the mock-up), who is in it, the place, things, earlier pictures. */
const ROLE_ORDER = ['base', 'identity', 'location', 'prop', 'composition'];

/** Which images a moment keeps: at most MAX_IMAGES, image 1 always, then by role, each role in its own order. */
export function keptImages(images: Img[], named: Set<string> = new Set()): Img[] {
  // A role the order does not name comes after every role it does, never with image 1. A thing the moment's action or
  // its one thing to show names comes before the place: the mock-up already carries the place's layout, and the
  // father folding newspaper boats drew a painted wooden one without its sketch (lighthouse-first m4, 30 Sep).
  const rank = (x: Img) => {
    if (x.n === 1) return -1;
    // After everyone in the picture, whose sketch is never given up for a thing: without the father's, the father
    // came out a second copy of the dreamer (lighthouse-first m4, m5, 1 Oct).
    if (x.role === 'prop' && named.has(x.name)) return ROLE_ORDER.indexOf('identity') + 0.5;
    const i = ROLE_ORDER.indexOf(x.role);
    return i < 0 ? ROLE_ORDER.length : i;
  };
  const ranked = [...images].sort((a, b) => rank(a) - rank(b) || a.n - b.n);
  const keep = new Set(ranked.slice(0, MAX_IMAGES).map((x) => x.n));
  return images.filter((x) => keep.has(x.n));
}

/** The first parenthesis of an image's entry, whole, however deep: "who the dreamer is (in their thirties, …)". */
function withoutFirstParen(entry: string): string {
  const i = entry.indexOf(' (');
  if (i < 0) return entry;
  let depth = 0;
  for (let k = i + 1; k < entry.length; k++) {
    if (entry[k] === '(') depth++;
    else if (entry[k] === ')' && --depth === 0) return entry.slice(0, i) + entry.slice(k + 1);
  }
  return entry;
}

/**
 * One moment fitted to the machine: images by `keptImages`, the manifest renumbered and every "Image N" said again
 * by its new number, then whole lines dropped until it fits, in this order: the no-layering line; the technique
 * detail; each kept image's description in brackets (the image shows it); the dream-feel and "Made as" lines; the
 * "looks as in their images" line; the light cut to its first sentence; the feeling; the shot's "Outside the
 * picture" sentences, last first. Never what happens, the camera's view, the one thing to show, who is in it, how
 * each one is now, the colours, or the writing line.
 */
export function fitMoment(
  lines: Line[],
  images: Img[],
  atLeast = 0,
  max = MAX_CHARS,
  named: Set<string> = new Set(),
): Fitted {
  const kept = keptImages(images, named);
  const renumber = new Map(kept.map((x, i) => [x.n, i + 1]));
  const droppedImages = images.filter((x) => !renumber.has(x.n)).map((x) => x.name);
  const dropped: Fitted['dropped'] = { images: droppedImages, paragraphs: [], lines: [], chars: 0 };
  const paras = new Map<string, string | null>(lines.map((l) => [l.id, l.text]));
  const renum = (t: string) =>
    t.replace(/\bImage (\d+)\b/g, (all, d: string) => (renumber.has(+d) ? `Image ${renumber.get(+d)}` : all));
  for (const [id, text] of paras) {
    if (text === null) continue;
    if (id !== 'manifest') {
      paras.set(id, renum(text));
      continue;
    }
    const out = text
      .split('\n')
      .filter((l) => {
        const m = l.match(/^Image (\d+): /);
        return !m || renumber.has(+m[1]);
      })
      .map(renum);
    paras.set(id, out.join('\n'));
  }
  const size = () => [...paras.values()].filter((x): x is string => x !== null).join('\n\n').length;
  // Cut while over, or until as many cuts are made as the pair's other arm needed.
  let ops = 0;
  const need = () => size() > max || ops < atLeast;
  const before = lines.map((l) => l.text).join('\n\n').length;
  const dropPara = (id: string) => {
    if (paras.get(id) == null || !need()) return;
    ops++;
    paras.set(id, null);
    dropped.paragraphs.push(id);
  };
  const editLines = (id: string, fn: (l: string) => string | null, why: string) => {
    const t = paras.get(id);
    if (t == null) return;
    const ls = t.split('\n');
    for (let i = 0; i < ls.length && need(); i++) {
      const x = fn(ls[i]);
      if (x === ls[i]) continue;
      ops++;
      dropped.lines.push(`${id}: ${why}`);
      if (x === null) ls.splice(i--, 1);
      else ls[i] = x;
      paras.set(id, ls.join('\n'));
    }
  };
  const startsWith = (p: string) => (l: string) => (l.startsWith(p) ? null : l);
  dropPara('no_layering');
  editLines('style', startsWith('Technique, followed exactly:'), 'technique');
  editLines('manifest', (l) => (/^Image ([2-9]): /.test(l) ? withoutFirstParen(l) : l), 'an image described');
  editLines('style', startsWith('It feels like a dream'), 'dream feel');
  editLines('style', startsWith('Made as:'), 'made as');
  dropPara('as_images');
  editLines('style', (l) => (l.startsWith('Light:') ? l.replace(/^(Light:[^.]*\.).*$/, '$1') : l), 'light cut');
  dropPara('feeling');
  // The shot's "Outside the picture" sentences, last first.
  for (let guard = 0; guard < 20 && need(); guard++) {
    const t = paras.get('shot');
    if (t == null) break;
    const cut = t.replace(/\s*Outside the picture,[^.]*\.(?![\s\S]*Outside the picture,)/, '');
    if (cut === t) break;
    ops++;
    paras.set('shot', cut);
    dropped.lines.push('shot: an outside-the-picture sentence');
  }
  const prompt = [...paras.values()].filter((x): x is string => x !== null).join('\n\n');
  dropped.chars = before - prompt.length;
  const renumbered = kept.map((x) => ({ ...x, n: renumber.get(x.n) as number }));
  return {
    prompt,
    images: renumbered,
    dropped,
    kept: Object.fromEntries(paras),
    fits: prompt.length <= max,
    ops,
  };
}

/**
 * A pair fitted alike: both arms cut as far as the one that needs more cuts, so the fitting takes the same lines from
 * both wherever the change does not touch them (a line the change adds must not cost the other arm nothing).
 */
export function fitPair(a: { lines: Line[]; images: Img[] }, b: { lines: Line[]; images: Img[] }): [Fitted, Fitted] {
  const n = Math.max(fitMoment(a.lines, a.images).ops, fitMoment(b.lines, b.images).ops);
  return [fitMoment(a.lines, a.images, n), fitMoment(b.lines, b.images, n)];
}

/**
 * Whether a pair still tests its change once fitted: every paragraph that differs between the arms before fitting
 * still differs after (neither side left out), every image one arm has and the other has not is still sent, and
 * everything else is sent alike in both (the same paragraphs, the same shared images).
 */
export function pairTested(
  a: { lines: Line[]; images: Img[]; fitted: Fitted },
  b: { lines: Line[]; images: Img[]; fitted: Fitted },
): { tested: boolean; differs: string[]; lost: string[] } {
  const text = (ls: Line[]) => new Map(ls.map((l) => [l.id, l.text]));
  const [ta, tb] = [text(a.lines), text(b.lines)];
  const differs = [...new Set([...ta.keys(), ...tb.keys()])].filter((id) => ta.get(id) !== tb.get(id));
  const lost: string[] = [];
  for (const id of differs) {
    const [fa, fb] = [a.fitted.kept[id], b.fitted.kept[id]];
    if ((ta.has(id) && fa == null) || (tb.has(id) && fb == null) || (fa ?? null) === (fb ?? null))
      lost.push(`paragraph ${id}`);
  }
  const names = (xs: Img[]) => new Set(xs.map((x) => x.name));
  const [na, nb] = [names(a.images), names(b.images)];
  const [ka, kb] = [names(a.fitted.images), names(b.fitted.images)];
  for (const n of na) if (!nb.has(n) && !ka.has(n)) lost.push(`image ${n}`);
  for (const n of nb) if (!na.has(n) && !kb.has(n)) lost.push(`image ${n}`);
  const imagesDiffer = [...na].some((n) => !nb.has(n)) || [...nb].some((n) => !na.has(n));
  // What the change does not touch is sent alike in both: else the pair also measures the fitting.
  const unequal = [...new Set([...ta.keys(), ...tb.keys()])].filter(
    (id) => !differs.includes(id) && (a.fitted.kept[id] ?? null) !== (b.fitted.kept[id] ?? null),
  );
  const shared = (ks: Set<string>) =>
    [...ks]
      .filter((n) => na.has(n) && nb.has(n))
      .sort()
      .join('|');
  if (shared(ka) !== shared(kb)) unequal.push('images');
  lost.push(...unequal.map((id) => `fitted unequally: ${id}`));
  return {
    tested: (differs.length > 0 || imagesDiffer) && lost.length === 0,
    differs: [...differs, ...(imagesDiffer ? ['images'] : [])],
    lost,
  };
}

/** The same seed for a moment in every arm. */
export const seedOf = (id: string) => Number.parseInt(createHash('sha256').update(id).digest('hex').slice(0, 8), 16);

// ── building a moment as the harness would send it ───────────────────────────────────────────────

export type ArmMoment = {
  moment: string;
  lines: Line[];
  images: Img[];
  fitted: Fitted;
  refused: string[];
};

/** Each dream built once for each arm's switches. */
const builds = new Map<string, { d: import('./checkpoint-set').DreamBuild; missing: string[] }>();

/** One moment of a saved dream under an arm's switches: its paragraphs and image files, as the checkpoint builds it. */
async function buildArm(
  sessionId: string,
  moment: string,
  env: Record<string, string>,
  out: string,
): Promise<ArmMoment> {
  const { withEnv } = await import('./checkpoint');
  return withEnv(env, async () => {
    const { withImplied } = await import('./implied-cache');
    const { withTyped } = await import('./typed-cache');
    const { withCast } = await import('./cast-cache');
    const { jevWithModel } = await import('../jev');
    const core = await import('./checkpoint-set');
    const data = dataDir([sessionId]);
    const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
    const key = `${sessionId} ${JSON.stringify(env)}`;
    let hit = builds.get(key);
    if (!hit) {
      let s = readSession(data, sessionId) as Session;
      s = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session;
      const typed = await withTyped(s);
      s = (await withCast(typed.session)).session;
      hit = { d: core.buildDream(s), missing: typed.missing };
      builds.set(key, hit);
    }
    const { d } = hit;
    const typed = { missing: hit.missing };
    const today = core.todayOf(d, moment, { media: join(data, 'strawberry-home', 'media') });
    const p = d.r.pictures.find((x) => x.id === moment && x.kind === 'cut');
    // What refuses the moment, but a missing image: that refuses it only where the fitting keeps the image (below).
    const refused = [
      ...today.refused.filter((r) => !/^image \d+ \(/.test(r)),
      ...(typed.missing.length ? [`typed readings missing: ${typed.missing}`] : []),
    ];
    if (!p?.assembled) refused.push('no paragraph ids (the one builder is off)');
    const lines = (p?.assembled?.lines ?? []).map((l) => ({ id: l.id, text: l.text }));
    if (p?.assembled && lines.map((l) => l.text).join('\n\n') !== today.prompt)
      refused.push('the paragraphs are not the prompt as sent');
    // The mock-up is written where the plan keeps its files.
    const images = today.images.map((x): Img => {
      let file = x.file;
      if (!file && x.key.startsWith('previs:') && today.previs) {
        mkdirSync(join(out, 'previs'), { recursive: true });
        file = join(
          out,
          'previs',
          `${sessionId}-${moment}-${createHash('sha256').update(today.previs.png).digest('hex').slice(0, 12)}.png`,
        );
        writeFileSync(file, today.previs.png);
      }
      return { n: x.n, role: x.role, name: x.name, ...(file ? { file } : { missing: x.missing ?? 'no file' }) };
    });
    const fitted = fitMoment(lines, images);
    for (const x of fitted.images) if (!x.file) refused.push(`image ${x.n} (${x.name}): ${x.missing}`);
    if (!fitted.fits) refused.push(`${fitted.prompt.length} characters after fitting`);
    return { moment, lines, images, fitted, refused };
  });
}

// ── the plan, and drawing it ─────────────────────────────────────────────────────────────────────

type Plan = {
  name: string;
  at: string;
  arms: { name: string; env: Record<string, string> }[];
  moments: {
    id: string;
    session: string;
    moment: string;
    seed: number;
    arms: Record<string, Omit<ArmMoment, 'lines'>>;
    pair?: ReturnType<typeof pairTested>;
  }[];
};

const outOf = (name: string) => join(DIR, 'runs', 'local-draw', name);

async function planRun(name: string, ids: string[], arms: Plan['arms']): Promise<Plan> {
  const out = outOf(name);
  mkdirSync(out, { recursive: true });
  const plan: Plan = { name, at: new Date().toISOString(), arms, moments: [] };
  for (const id of ids) {
    const [session, moment] = id.split(':');
    const built: Record<string, ArmMoment> = {};
    for (const arm of arms) built[arm.name] = await buildArm(session, moment, { ...PROFILE, ...arm.env }, out);
    const [a, b] = arms.map((x) => built[x.name]);
    if (arms.length === 2) {
      // Fitted alike, and refused again on what the joint fitting keeps.
      [a.fitted, b.fitted] = fitPair(a, b);
      for (const m of [a, b]) {
        m.refused = m.refused.filter((r) => !/^image \d+ \(|characters after fitting$/.test(r));
        for (const x of m.fitted.images) if (!x.file) m.refused.push(`image ${x.n} (${x.name}): ${x.missing}`);
        if (!m.fitted.fits) m.refused.push(`${m.fitted.prompt.length} characters after fitting`);
      }
    }
    const pair = arms.length === 2 ? pairTested(a, b) : undefined;
    plan.moments.push({
      id,
      session,
      moment,
      seed: seedOf(id),
      arms: Object.fromEntries(Object.entries(built).map(([k, { lines: _, ...v }]) => [k, v])),
      ...(pair ? { pair } : {}),
    });
    const line = arms
      .map((x) => {
        const m = built[x.name];
        return `${x.name} ${m.fitted.prompt.length} ch, ${m.fitted.images.length}/${m.images.length} img, -${m.fitted.dropped.chars} ch${m.refused.length ? ` REFUSED: ${m.refused.join('; ')}` : ''}`;
      })
      .join(' | ');
    console.log(
      `${id}: ${line}${pair ? ` | ${pair.tested ? `tested (${pair.differs.join(', ')})` : `NOT TESTED${pair.lost.length ? `: trimmed (${pair.lost.join(', ')})` : ': no difference'}`}` : ''}`,
    );
  }
  writeFileSync(join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  const drawable = plan.moments.filter(
    (m) => Object.values(m.arms).every((x) => !x.refused.length) && (!m.pair || m.pair.tested),
  );
  console.log(
    `\nwritten ${join(out, 'plan.json')}: ${drawable.length} of ${plan.moments.length} moments to draw, ${drawable.length * arms.length} pictures. Nothing sent.`,
  );
  return plan;
}

const dataUri = (file: string) =>
  `data:image/${extname(file).slice(1).replace('jpg', 'jpeg')};base64,${readFileSync(file).toString('base64')}`;

type Job = { id: string; status: string; outputs?: { url: string }[]; error?: unknown };

async function drawRun(name: string, quality: string): Promise<void> {
  const out = outOf(name);
  const plan = JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8')) as Plan;
  const resultsFile = join(out, 'results.json');
  const results: Record<string, { job: string; status: string; file?: string; error?: string; quality: string }> =
    existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
  const save = () => writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
  for (const m of plan.moments) {
    if (Object.values(m.arms).some((x) => x.refused.length) || (m.pair && !m.pair.tested)) continue;
    for (const [arm, x] of Object.entries(m.arms)) {
      const key = `${arm}/${m.id}`;
      if (results[key]?.status === 'done') continue;
      const res = await fetch(`${API}/v1/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: x.fitted.prompt,
          images: x.fitted.images.map((i) => dataUri(i.file as string)),
          quality,
          seed: m.seed,
        }),
      });
      let job = (await res.json()) as Job;
      if (!res.ok || !job.id) {
        results[key] = { job: job.id ?? '', status: 'failed', error: JSON.stringify(job).slice(0, 500), quality };
        save();
        console.log(`${key}: failed (${res.status})`);
        continue;
      }
      results[key] = { job: job.id, status: job.status, quality };
      save();
      while (job.status !== 'done' && job.status !== 'failed' && job.status !== 'cancelled')
        job = (await (await fetch(`${API}/v1/jobs/${job.id}?wait=60`)).json()) as Job;
      if (job.status !== 'done' || !job.outputs?.[0]?.url) {
        results[key] = {
          job: job.id,
          status: job.status,
          error: JSON.stringify(job.error ?? job).slice(0, 500),
          quality,
        };
        save();
        console.log(`${key}: ${job.status}`);
        continue;
      }
      const file = join(out, arm, `${m.id.replace(':', '-')}.png`);
      mkdirSync(join(out, arm), { recursive: true });
      writeFileSync(file, new Uint8Array(await (await fetch(job.outputs[0].url)).arrayBuffer()));
      results[key] = { job: job.id, status: 'done', file, quality };
      save();
      console.log(`${key}: ${file} (job ${job.id})`);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const name = val('--name');
  if (!name) throw new Error('--name <run> is needed');
  if (args.includes('--draw')) {
    if (!args.includes('--yes'))
      throw new Error("--draw sends jobs to the owner's machine: add --yes once he has said it is free");
    await drawRun(name, val('--quality') ?? 'fast');
  } else {
    const ids = (val('--moments') ?? '').split(',').filter(Boolean);
    const arms = args
      .flatMap((a, i) => (a === '--arm' ? [args[i + 1]] : []))
      .map((spec) => {
        const [armName, ...kv] = spec.split(':');
        const env = Object.fromEntries(
          kv
            .join(':')
            .split(',')
            .filter(Boolean)
            .map((x) => x.split('=') as [string, string]),
        );
        return { name: armName, env };
      });
    await planRun(name, ids, arms.length ? arms : [{ name: 'now', env: {} }]);
  }
}
