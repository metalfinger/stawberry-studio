// A whole dream drawn from the start on the owner's local image machine (imgapi: Qwen-Image 2.1), never the production
// path: every sketch the harness would draw, then every in-between picture and every moment in the order they draw
// from each other, each from this run's own pictures (a sketch drawn here, an earlier moment drawn here, the mock-up
// rendered now), with the harness's own prompts under the full profile. Each picture is fitted to the machine (at most
// 4 images and 4000 characters, local-draw.ts fitMoment) and what was left out is kept beside it.
//
//   bun run evals/local-run.ts --run night-1 --frozen                 every frozen dream
//   bun run evals/local-run.ts --run night-1 --live                   every saved conversation too
//   bun run evals/local-run.ts --run night-1 --dream dream-0926-000545-09ea [--quality fast]
//   bun run evals/local-run.ts --run qwen-1 --frozen --profile qwen   each moment's prompt written for Qwen (qwen-prompt.ts)
//   … --profile qwen --previs keyed --dream <id> --moments m2,m6     the colour-keyed mock-up, only those moments drawn
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
import { qwenEdit } from './qwen-prompt';
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
  /** Whose prompt was sent: the harness's, fitted, or the one written for Qwen from the cut's sheet. */
  profile?: 'harness' | 'qwen';
  /** The mock-up's style, with the qwen profile: the labelled grey one, or colour-keyed (previs.ts previsKeyed). */
  previs?: 'clay' | 'keyed';
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

/** Said first to the machine where a picture has images to take looks from (the machine's guide: name each image's part). */
export const LEAD =
  'Image 1 is the picture to edit: everyone in it stays exactly where it puts them, once. The other images are references only, for how each one looks: never add a second copy of anyone or anything from them to the picture.\n\n';

/** Sketches side by side, at one height, on white: one image of everyone, left to right. */
function sheetOf(files: string[], out: string): string {
  const r = spawnSync('magick', [
    ...files,
    '-resize',
    'x1024',
    '-background',
    'white',
    '-gravity',
    'center',
    '+append',
    out,
  ]);
  return r.status === 0 && existsSync(out) ? out : files[0];
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
  opts: {
    quality: { sketch: string; picture: string };
    out: string;
    commit: string;
    profile: 'harness' | 'qwen';
    previs: 'clay' | 'keyed';
    moments: Set<string> | null;
  },
): Promise<RunManifest> {
  const { rebuild, standIn } = await import('../plan');
  const { sheetPrompt, shapeOf } = await import('../sheets');
  const { calledFor, previsFor, previsKeyedFor } = await import('../session');
  // Each moment's colour key, where its mock-up was drawn keyed.
  const keys = new Map<string, { id: string; name: string; colour: string }[]>();
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
        // Keyed only for the moments the qwen profile writes, which say each one by its colour.
        const keyed = opts.previs === 'keyed' && opts.profile === 'qwen' && p.kind !== 'ghost';
        const kv = keyed ? previsKeyedFor(r.b, p.item, called, r.rec) : undefined;
        const pv = kv ?? previsFor(r.b, p.item, called, r.rec);
        if (kv) keys.set(p.id, kv.key);
        if (pv) {
          file = join(dir, 'img', `previs-${kv ? 'keyed-' : ''}${p.id}.png`);
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
    // Only the moments asked for: the others come from the run this one was seeded from, or are not drawn.
    if (opts.moments && !opts.moments.has(p.id)) {
      e.state = 'skipped';
      continue;
    }
    // What this run could not make is left out, as the fitting leaves out what does not fit.
    const have = images.filter((x) => x.file);
    // With images to take looks from, each image's part is said first, as the machine's own guide advises: from a
    // person's sketch it drew the dreamer twice, once where the mock-up put them and once as the sketch stands
    // (lighthouse-first m2, 30 Sep); with this line, once (2 of 2).
    const lead = have.length > 1 ? LEAD : '';
    // The things the moment's action or its one thing to show names, by their sketch's stand-in.
    const said = `${p.item.fields.action?.value ?? ''} ${p.item.fields.visual_point?.value ?? ''}`.toLowerCase();
    const named = new Set(
      r.sheets
        .filter((s) => s.kind === 'prop')
        .filter((s) => {
          const head = (s.name.toLowerCase().match(/[a-z]+/g) ?? []).at(-1);
          return !!head && new RegExp(`\\b${head}s?\\b`).test(said);
        })
        .map((s) => standIn.sketch(s.id)),
    );
    // Written for Qwen from the cut's sheet, where it has one; otherwise the harness's own prompt, fitted.
    if (opts.profile === 'qwen' && kind === 'cut' && p.sheet && p.assembled) {
      const q = qwenEdit(
        p.sheet,
        p.assembled.references,
        images,
        Object.fromEntries(p.assembled.lines.map((l) => [l.id, l.text])),
        keys.get(p.id),
      );
      e.profile = 'qwen';
      e.previs = keys.has(p.id) ? 'keyed' : 'clay';
      e.sent = q.prompt.slice(0, MAX_CHARS);
      e.imagesSent = q.images;
      e.dropped = {
        images: images.filter((x) => !q.images.includes(x)).map((x) => x.name),
        paragraphs: [],
        lines: [],
        chars: 0,
      };
      if (q.prompt.length > MAX_CHARS) notes.push(`${q.prompt.length} characters: cut at ${MAX_CHARS}`);
      const first = q.images[0]?.file;
      if (!first) await draw(e, 'generate', { prompt: e.sent, width: 1024, height: 576 });
      else
        await draw(e, 'edit', {
          prompt: e.sent,
          images: q.images.map((x, k) =>
            dataUri(k === 0 ? asFrame(first, join(dir, 'img', `frame-${p.id}.png`)) : (x.file as string)),
          ),
        });
      if (e.state === 'done' && e.file) files.set(standIn.picture(p.id), e.file);
      continue;
    }
    const fitted = fitMoment(lines, have, 0, MAX_CHARS - lead.length, named, true);
    // Everyone's sketch in one image, left to right, where the fitting made them one.
    for (const x of fitted.images)
      if (x.group?.length)
        x.file = sheetOf(
          x.group.map((g) => g.file as string),
          join(dir, 'img', `people-${p.id}.png`),
        );
    const text = lead + fitted.prompt;
    e.sent = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    e.imagesSent = fitted.images;
    e.dropped = {
      ...fitted.dropped,
      images: [...images.filter((x) => !x.file).map((x) => x.name), ...fitted.dropped.images],
    };
    if (text.length > MAX_CHARS) notes.push(`${text.length} characters after fitting: cut at ${MAX_CHARS}`);
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
  const profile = val('--profile') === 'qwen' ? 'qwen' : 'harness';
  const previs = val('--previs') === 'keyed' ? 'keyed' : 'clay';
  const moments = val('--moments') ? new Set((val('--moments') as string).split(',')) : null;
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
      const mf = await drawDream(run, d.id, d.session, { quality, out, commit, profile, previs, moments });
      const done = mf.pictures.filter((p) => p.state === 'done').length;
      console.log(`${d.id}: ${done} of ${mf.pictures.length} drawn`);
    } catch (e) {
      console.log(`${d.id}: stopped: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
    }
  }
  console.log(`run ${run} done: ${join(out, run)}`);
}
