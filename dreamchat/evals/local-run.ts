// A whole dream drawn from the start on the owner's local image machine (imgapi: Qwen-Image 2.1), never the production
// path: every sketch the harness would draw, then every in-between picture and every moment in the order they draw
// from each other, each from this run's own pictures (a sketch drawn here, an earlier moment drawn here, the mock-up
// rendered now), with the harness's own prompts under the full profile. Each picture is fitted to the machine (at most
// 4 images and 4000 characters, local-draw.ts fitMoment) and what was left out is kept beside it.
//
//   bun run evals/local-run.ts --run night-1 --frozen                 every frozen dream
//   bun run evals/local-run.ts --run night-1 --live                   every saved conversation too
//   bun run evals/local-run.ts --run night-1 --dream dream-0926-000545-09ea [--quality fast]
//
// Nothing is drawn twice: a run is resumed where it stopped (a picture with its file is kept). Everything is kept under
// <data>/runs/local-draw/<run>/<dream>/: manifest.json (what each picture was sent, its job, seed and file, what the
// fitting dropped, the code's commit) and the pictures. Run it from a worktree pinned to one commit: code moves while a
// run draws, and a run's pictures are all of one commit.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Item } from '../sheets';
import type { Session } from '../session';
import { API, type Img, type Line, fitMoment, MAX_CHARS, PROFILE, seedOf } from './local-draw';
import { commitOf, dataDir, frozenDreams, liveDreams, loadDream } from './saved';

type Job = {
  id: string;
  status: string;
  outputs?: { url: string; width?: number; height?: number }[];
  error?: unknown;
};

/** One picture of the run, as the viewer reads it. */
export type RunPicture = {
  id: string;
  kind: 'sketch' | 'ghost' | 'cut';
  name: string;
  state: 'waiting' | 'done' | 'failed' | 'skipped';
  /** The harness's prompt, whole, and what was sent after fitting. */
  prompt: string;
  sent?: string;
  /** The harness's images, and those sent after fitting (files of this run, or the mock-up rendered now). */
  images: Img[];
  imagesSent?: Img[];
  dropped?: { images: string[]; paragraphs: string[]; lines: string[]; chars: number };
  endpoint?: 'generate' | 'edit';
  job?: string;
  seed?: number;
  /** The machine's quality tier it was drawn at. */
  quality?: string;
  file?: string;
  size?: [number, number];
  secs?: number;
  error?: string;
  /** Why it could not be drawn as the harness would (an image this run could not make). */
  notes?: string[];
};

export type RunManifest = {
  run: string;
  dream: string;
  title: string;
  commit: string;
  quality: string;
  switches: Record<string, string>;
  started: string;
  updated: string;
  readings: string[];
  pictures: RunPicture[];
};

// ── the machine ──────────────────────────────────────────────────────────────────────────────────

const SIZES: Record<string, [number, number]> = {
  '16:9': [1024, 576],
  '4:3': [1024, 768],
  '2:3': [672, 1024],
  '1:1': [1024, 1024],
};

async function call(path: string, body: unknown): Promise<Job> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 20) {
      await Bun.sleep(Number(res.headers.get('retry-after') ?? '15') * 1000);
      continue;
    }
    const job = (await res.json()) as Job;
    if (!res.ok || !job.id) throw new Error(`${path} ${res.status}: ${JSON.stringify(job).slice(0, 400)}`);
    return job;
  }
}

async function finish(job: Job): Promise<Job> {
  let j = job;
  while (j.status !== 'done' && j.status !== 'failed' && j.status !== 'cancelled') {
    const res = await fetch(`${API}/v1/jobs/${j.id}?wait=60`);
    if (!res.ok) {
      await Bun.sleep(5000);
      continue;
    }
    j = (await res.json()) as Job;
  }
  return j;
}

const dataUri = (file: string) =>
  `data:image/${file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'jpeg' : 'png'};base64,${readFileSync(file).toString('base64')}`;

/** A picture's pixel size, by sips. */
function sizeOf(file: string): [number, number] | null {
  const r = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const w = Number(/pixelWidth: (\d+)/.exec(r.stdout ?? '')?.[1]);
  const h = Number(/pixelHeight: (\d+)/.exec(r.stdout ?? '')?.[1]);
  return w && h ? [w, h] : null;
}

/**
 * Image 1 sets the size of what the machine draws: a moment's first image that is not a landscape frame (a person's
 * sketch standing up) is set in a 16:9 frame of plain white first, so the moment comes out a storyboard frame.
 */
function asFrame(file: string, out: string): string {
  const s = sizeOf(file);
  if (!s) return file;
  const [w, h] = s;
  if (Math.abs(w / h - 16 / 9) < 0.05) return file;
  const W = Math.max(w, Math.round((h * 16) / 9));
  const H = Math.round((W * 9) / 16);
  const r = spawnSync('sips', [
    '-p',
    String(Math.max(H, h)),
    String(Math.max(W, w)),
    '--padColor',
    'FFFFFF',
    file,
    '--out',
    out,
  ]);
  return r.status === 0 && existsSync(out) ? out : file;
}

// ── a dream ──────────────────────────────────────────────────────────────────────────────────────

/** The dream with its readings, as the corpus reads them (from the caches only), and every sketch not drawn yet. */
async function prepared(s: Session): Promise<{ session: Session; readings: string[] }> {
  const { withImplied } = await import('./implied-cache');
  const { withTyped } = await import('./typed-cache');
  const { withCast } = await import('./cast-cache');
  const { jevWithModel } = await import('../jev');
  const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
  const notes: string[] = [];
  let session = structuredClone(s);
  const read = await withImplied(session, { jev: jevWithModel(JM), jevModel: JM });
  session = read.session;
  const typed = await withTyped(session);
  if (typed.missing.length) notes.push(`typed readings not cached: ${typed.missing.join(', ')}`);
  session = typed.session;
  const cast = await withCast(session);
  if (cast.missing) notes.push('cast reading not cached');
  session = cast.session;
  // From the start: no sketch or picture of the saved run is used; each is drawn here.
  if (session.build)
    session.build = {
      ...session.build,
      items: session.build.items.map((i) => ({ ...i, mediaId: undefined, mediaPath: undefined })),
    };
  return { session, readings: notes };
}

async function drawDream(
  run: string,
  dreamId: string,
  saved: Session,
  opts: { quality: { sketch: string; picture: string }; out: string; commit: string },
): Promise<RunManifest> {
  const { rebuild, standIn } = await import('../plan');
  const { sheetPrompt, shapeOf } = await import('../sheets');
  const { calledFor, previsFor } = await import('../session');
  const dir = join(opts.out, run, dreamId);
  mkdirSync(join(dir, 'img'), { recursive: true });
  const manifestFile = join(dir, 'manifest.json');
  const { session, readings } = await prepared(saved);
  const r = rebuild(session, { asDrawn: false });
  const style = session.style!;
  const was: RunManifest | null = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
  const m: RunManifest = {
    run,
    dream: dreamId,
    title: r.title,
    commit: opts.commit,
    quality: `sketches ${opts.quality.sketch}, pictures ${opts.quality.picture}`,
    switches: PROFILE,
    started: was?.started ?? new Date().toISOString(),
    updated: new Date().toISOString(),
    readings,
    pictures: was?.pictures ?? [],
  };
  const save = () => {
    m.updated = new Date().toISOString();
    writeFileSync(`${manifestFile}.tmp`, `${JSON.stringify(m, null, 1)}\n`);
    renameSync(`${manifestFile}.tmp`, manifestFile);
  };
  const entry = (p: RunPicture) => {
    const i = m.pictures.findIndex((x) => x.id === p.id && x.kind === p.kind);
    if (i >= 0) {
      const keep = m.pictures[i];
      // Kept as drawn: never drawn twice.
      if (keep.state === 'done' && keep.file && existsSync(keep.file)) return keep;
      m.pictures[i] = p;
      return p;
    }
    m.pictures.push(p);
    return p;
  };
  const files = new Map<string, string>();
  for (const p of m.pictures)
    if (p.state === 'done' && p.file)
      files.set(p.kind === 'sketch' ? standIn.sketch(p.id) : standIn.picture(p.id), p.file);

  const draw = async (p: RunPicture, endpoint: 'generate' | 'edit', body: Record<string, unknown>) => {
    const t0 = Date.now();
    p.endpoint = endpoint;
    p.seed = seedOf(`${dreamId}:${p.kind}:${p.id}`);
    p.quality = p.kind === 'sketch' ? opts.quality.sketch : opts.quality.picture;
    // Once more on a failure, then on to the next: one error never stops the night.
    for (let attempt = 0; attempt < 2; attempt++) {
      p.state = 'waiting';
      p.error = undefined;
      await once(p, endpoint, body);
      if (p.state === 'done') break;
    }
    p.secs = Math.round((Date.now() - t0) / 1000);
    save();
    console.log(`${dreamId} ${p.kind} ${p.id}: ${p.state}${p.error ? ` (${p.error.slice(0, 120)})` : ''} ${p.secs}s`);
  };
  const once = async (p: RunPicture, endpoint: 'generate' | 'edit', body: Record<string, unknown>) => {
    try {
      const job = await call(`/v1/${endpoint}`, { ...body, quality: p.quality, seed: p.seed });
      p.job = job.id;
      save();
      const done = await finish(job);
      if (done.status !== 'done' || !done.outputs?.[0]?.url)
        throw new Error(`${done.status}: ${JSON.stringify(done.error ?? '').slice(0, 300)}`);
      const file = join(dir, 'img', `${p.kind}-${p.id}.png`);
      writeFileSync(file, new Uint8Array(await (await fetch(done.outputs[0].url)).arrayBuffer()));
      p.file = file;
      p.size =
        done.outputs[0].width && done.outputs[0].height ? [done.outputs[0].width, done.outputs[0].height] : undefined;
      p.state = 'done';
    } catch (e) {
      p.state = 'failed';
      p.error = String(e instanceof Error ? e.message : e).slice(0, 500);
    }
  };

  // 1. Every sketch, from the harness's own sketch prompt, at its own shape.
  for (const it of r.sheets) {
    if (it.extras) continue;
    const prompt = sheetPrompt(it as Item, style);
    const p = entry({ id: it.id, kind: 'sketch', name: it.name, state: 'waiting', prompt, images: [] });
    if (p.state === 'done') continue;
    const [width, height] = SIZES[shapeOf(it as Item)] ?? SIZES['16:9'];
    const sent = prompt.length > MAX_CHARS ? prompt.slice(0, MAX_CHARS) : prompt;
    p.sent = sent;
    if (sent !== prompt) p.notes = [`prompt cut at ${MAX_CHARS} characters`];
    await draw(p, 'generate', { prompt: sent, width, height });
    if (p.state === 'done' && p.file) files.set(standIn.sketch(it.id), p.file);
  }

  // 2. The in-between pictures and the moments, each once every picture it draws from is drawn.
  const pending = [...r.pictures];
  const drawnIds = new Set(m.pictures.filter((x) => x.kind !== 'sketch' && x.state === 'done').map((x) => x.id));
  const pictureRefs = (p: (typeof pending)[number]) =>
    p.references.map((x) => x.media_id).filter((x) => x.startsWith(standIn.picture('')));
  let guard = 0;
  while (pending.length && guard++ < 1000) {
    let i = pending.findIndex((p) =>
      pictureRefs(p).every((ref) => files.has(ref) || !r.pictures.some((q) => standIn.picture(q.id) === ref)),
    );
    // A loop, or a picture none can wait for: drawn with what there is.
    if (i < 0) i = 0;
    const p = pending.splice(i, 1)[0];
    const kind = p.kind === 'ghost' ? 'ghost' : 'cut';
    const images: Img[] = [];
    const notes: string[] = [];
    for (const [n, ref] of p.references.entries()) {
      let file = files.get(ref.media_id);
      if (!file && ref.media_id.startsWith(standIn.previs(''))) {
        const called = calledFor(
          { build: session.build, draft: session.draft && { ...session.draft, breakdown: r.b } },
          p.item,
        );
        const pv = previsFor(r.b, p.item, called, r.rec);
        if (pv) {
          file = join(dir, 'img', `previs-${p.id}.png`);
          writeFileSync(file, pv.png);
        }
      }
      if (!file) notes.push(`image ${n + 1} (${ref.role} ${ref.media_id}) not made in this run`);
      images.push({
        n: n + 1,
        role: ref.role,
        name: ref.media_id,
        ...(file ? { file } : { missing: 'not made in this run' }),
      });
    }
    const lines: Line[] = p.assembled?.lines.map((l) => ({ id: l.id, text: l.text })) ?? [
      { id: 'whole', text: p.prompt },
    ];
    const e = entry({ id: p.id, kind, name: p.item.name, state: 'waiting', prompt: p.prompt, images, notes });
    if (e.state === 'done' || drawnIds.has(p.id)) {
      if (e.file) files.set(standIn.picture(p.id), e.file);
      continue;
    }
    // What this run could not make is left out, as the fitting leaves out what does not fit.
    const have = images.filter((x) => x.file);
    const fitted = fitMoment(lines, have);
    e.sent = fitted.prompt.length > MAX_CHARS ? fitted.prompt.slice(0, MAX_CHARS) : fitted.prompt;
    e.imagesSent = fitted.images;
    e.dropped = {
      ...fitted.dropped,
      images: [...images.filter((x) => !x.file).map((x) => x.name), ...fitted.dropped.images],
    };
    if (!fitted.fits) notes.push(`${fitted.prompt.length} characters after fitting: cut at ${MAX_CHARS}`);
    if (!fitted.images.length) await draw(e, 'generate', { prompt: e.sent, width: 1024, height: 576 });
    else {
      const first = fitted.images[0].file as string;
      const framed = kind === 'cut' ? asFrame(first, join(dir, 'img', `frame-${p.id}.png`)) : first;
      await draw(e, 'edit', {
        prompt: e.sent,
        images: fitted.images.map((x, k) => dataUri(k === 0 ? framed : (x.file as string))),
      });
    }
    if (e.state === 'done' && e.file) files.set(standIn.picture(p.id), e.file);
  }
  save();
  return m;
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const run = val('--run');
  if (!run) throw new Error('--run <name> is needed');
  const quality = {
    sketch: val('--sketch-quality') ?? val('--quality') ?? 'fast',
    picture: val('--quality') ?? 'fast',
  };
  // The full profile, as every other eval of the harness reads it.
  for (const [k, v] of Object.entries(PROFILE)) process.env[k] ??= v;
  const data = dataDir();
  const out = join(data, 'runs', 'local-draw');
  const commit = commitOf();
  const dreams: { id: string; session: Session }[] = [];
  const one = val('--dream');
  if (one)
    dreams.push({
      id: one,
      session: loadDream(one, !existsSync(join(import.meta.dir, 'sources', `${one}.json`))).session as Session,
    });
  if (args.includes('--frozen'))
    for (const id of frozenDreams()) dreams.push({ id, session: loadDream(id, false).session as Session });
  if (args.includes('--live'))
    for (const d of liveDreams(data)) {
      if (d.id.includes('/') || dreams.some((x) => x.id === d.id)) continue;
      try {
        dreams.push({ id: d.id, session: JSON.parse(readFileSync(d.path, 'utf8')) as Session });
      } catch {
        // A conversation that cannot be read is left out.
      }
    }
  console.log(
    `run ${run}: ${dreams.length} dreams, commit ${commit}, sketches ${quality.sketch}, pictures ${quality.picture}, into ${join(out, run)}`,
  );
  for (const d of dreams) {
    if (!d.session.draft?.breakdown || !d.session.style) {
      console.log(`${d.id}: no breakdown and style: left out`);
      continue;
    }
    try {
      const mf = await drawDream(run, d.id, d.session, { quality, out, commit });
      const done = mf.pictures.filter((p) => p.state === 'done').length;
      console.log(`${d.id}: ${done} of ${mf.pictures.length} drawn`);
    } catch (e) {
      console.log(`${d.id}: stopped: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
    }
  }
  console.log(`run ${run} done: ${join(out, run)}`);
}
