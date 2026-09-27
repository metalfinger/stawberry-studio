// The picture path of a dream already talked through, driven again with fake pictures and no text
// model: its shots checked again ("storyboard complete?" on the floor plans it has), every sketch
// put through the sketch gate and drawn, then every moment and in-between picture put through the
// gate and drawn, in plan order, under the switches as they are set (DREAMCHAT_CHECKS,
// DREAMCHAT_RECORD, DREAMCHAT_CUT_SHEET). Only Jev is called. The conversation is left out: every
// sketch is taken as approved, as the dreamer approved them, and a judge passes every take so each
// moment drawn from another goes on.
//
// For measuring what the checks do to the picture path (S2) when a whole replay cannot run. Nothing
// is planned again with a model: the floor plans, the shot briefs and every word of the dream are
// the saved dream's own. Every model step the checks would call (planning again, rewording a moment or
// a sketch's look, a new brief) is a stand-in that counts the call and fails, as a model that cannot
// be reached does: with the checks acting, what they would have planned again or reworded is counted,
// never done, so the acting arm is a lower bound of what the checks do.
//
//   DREAMCHAT_CHECKS=log DREAMCHAT_RECORD=on bun --env-file=… run evals/redraw.ts --out <dir> <session.json> …
//
// Each saved conversation is only read. Written: <dir>/<name>/state/<id>.json (the dream as drawn
// again, with its Jev log in <dir>/<name>/state/<id>/jev.jsonl) and <dir>/<name>/redraw.json (the
// switches, the model steps asked for, and what each moment was sent, its images named by what they are).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ghostName } from '../cutsheet';
import { dreamConfig } from '../dream';
import { callJev } from '../jev';
import { inSession } from '../jevlog';
import { recordInputsOf, recordMode } from '../record';
import { applyPrep, planShots, type Session, SessionStore, type StoreDeps } from '../session';
import type { Item, SheetEngine } from '../sheets';
import { checksMode } from '../gate';

export type Redrawn = {
  name: string;
  source: string;
  checks: 'act' | 'log';
  record: string;
  cutSheet: string;
  /** The model steps asked for, by name, and why: none can be reached here. */
  asked: { step: string; why: string }[];
  /** What each moment was sent: its prompt, and its images as "role name". */
  sent: Record<string, { prompt: string; images: string[] }>;
};

/** A dream's name, from its conversation's: "simulated: jellyfish-city", "replayed (x): car-park from …". */
export function nameOf(s: Pick<Session, 'name' | 'id'>): string {
  return s.name.match(/^simulated: ([\w-]+)$/)?.[1] ?? s.name.match(/^replayed \([^)]*\): ([\w-]+) from/)?.[1] ?? s.id;
}

/**
 * The dream as it stood before its pictures: every sketch, moment and in-between picture unstarted,
 * and nothing it was held, reworded, drawn or approved for kept. Its words, plans and briefs stay.
 */
export function unstarted(src: Session): Session {
  const s = structuredClone(src);
  const fresh = {
    status: 'failed',
    jobId: undefined,
    recipeId: undefined,
    mediaId: undefined,
    mediaPath: undefined,
    error: undefined,
    held: undefined,
    heldAsks: undefined,
    heldAskedAt: undefined,
    overrode: undefined,
    guessed: undefined,
    gate: undefined,
    review: undefined,
    check: undefined,
    continuity: undefined,
    continuityApproved: false,
    announced: false,
    announcedAt: undefined,
    repairFor: undefined,
    redrawBecause: undefined,
    version: 0,
  } as const;
  for (const it of s.build?.items ?? []) if (!it.extras) Object.assign(it, fresh);
  for (const f of s.build?.frames ?? [])
    Object.assign(f, fresh, {
      status: 'waiting',
      dropped: undefined,
      layout: undefined,
      depicted: undefined,
      sentSheet: undefined,
      startedAtTurn: undefined,
    });
  Object.assign(s, { phase: 'review', closed: false, images: 0, spentUsd: 0, spentCredits: undefined });
  return s;
}

/** An engine that draws every picture at once, and keeps what each moment was sent. */
function fakeEngine() {
  let n = 0;
  const sent: Record<string, { prompt: string; references: { media_id: string; role: string }[] }> = {};
  const engine: SheetEngine = {
    start: async ({ item }) => ({ recipeId: `r-${item.id}-${++n}`, jobId: `job-${item.id}-${n}`, usd: 0 }),
    status: async (jobId) => ({ state: 'ready', mediaId: `media-${jobId}`, mediaPath: `${jobId}.png` }),
    review: async () => {},
    retryCollection: async () => {},
    layout: async (nodeId) => `previs-${nodeId}-${++n}`,
    record: async () => {},
    startFrame: async ({ item, prompt, references }) => {
      sent[item.id] = { prompt, references: references.map((r) => ({ media_id: r.media_id, role: r.role })) };
      return { recipeId: `r-${item.id}-${++n}`, jobId: `job-${item.id}-${n}`, usd: 0 };
    },
  };
  return { engine, sent };
}

/** One saved dream's picture path, driven again into `out`. */
export async function redraw(source: string, out: string): Promise<Redrawn> {
  const src = JSON.parse(readFileSync(source, 'utf8')) as Session;
  const b = src.draft?.breakdown;
  if (!b || !src.style || !src.build || !src.production?.result)
    throw new Error(`${source}: never got as far as its pictures`);
  const name = nameOf(src);
  const dir = join(out, name, 'state');
  if (existsSync(join(out, name, 'redraw.json'))) throw new Error(`${join(out, name)} already holds a redraw`);
  mkdirSync(join(dir, src.id), { recursive: true });
  const s = unstarted(src);
  const asked: Redrawn['asked'] = [];
  const unreachable =
    (step: string) =>
    async (...args: unknown[]): Promise<never> => {
      // What it was asked about: a moment by its action, a sketch by its name, a scene by its fix.
      const fields = (step === 'reword' ? args[2] : undefined) as Record<string, { value?: string }> | undefined;
      asked.push({
        step,
        why: `${fields?.action?.value ? `"${fields.action.value.slice(0, 80)}": ` : step === 'rewordLook' ? `${String(args[0])}: ` : ''}${JSON.stringify(args[step === 'rewordLook' ? 4 : 1] ?? args[0] ?? '').slice(0, 300)}`,
      });
      throw new Error(`${step}: no text model here`);
    };
  // "Storyboard complete?" on the floor plans it has; the briefs are the ones written then.
  const prep = await inSession(dir, s.id, () =>
    planShots(
      s.draft!.breakdown!,
      s.style!,
      { jev: callJev, dir: join(dir, s.id) },
      { ...recordInputsOf({ build: s.build, transcript: s.transcript }), readings: s.draft?.readings },
    ),
  );
  applyPrep(s, { ...prep, shots: src.prep?.shots ?? prep.shots });
  // The moments are put in once the sketches are settled, as the conversation puts them in: there
  // before, a finished sketch's watch would start them with sketches not yet approved.
  const moments = s.build!.frames ?? [];
  s.build!.frames = [];
  writeFileSync(join(dir, `${s.id}.json`), JSON.stringify(s, null, 2));
  const { engine, sent } = fakeEngine();
  // The judge passes every moment and in-between picture; a sketch is the dreamer's to approve, below.
  const frames = new Set(moments.map((f) => f.id));
  const pass = async (mediaId: string) =>
    frames.has(mediaId.match(/^media-job-(.+)-\d+$/)?.[1] ?? '')
      ? { questions: 1, passed: 1, failed: [], unseen: [] }
      : null;
  const deps: StoreDeps = {
    jev: callJev,
    gate: callJev,
    host: unreachable('host') as StoreDeps['host'],
    sheets: engine,
    judge: pass,
    block: unreachable('block') as StoreDeps['block'],
    shot: unreachable('shot') as StoreDeps['shot'],
    reword: unreachable('reword') as StoreDeps['reword'],
    rewordLook: unreachable('rewordLook') as StoreDeps['rewordLook'],
    fix: unreachable('fix') as StoreDeps['fix'],
    proposeLook: unreachable('proposeLook') as StoreDeps['proposeLook'],
    reviseItem: unreachable('reviseItem') as StoreDeps['reviseItem'],
    supervise: unreachable('supervise') as StoreDeps['supervise'],
    watchEveryMs: 20,
    dir,
  };
  const store = new SessionStore(dreamConfig(), deps);
  // The sketches first, as the conversation draws them; then every one approved, and the moments.
  await store.resume(s.id);
  await store.settle(s.id, 600_000);
  const now = store.get(s.id)!;
  for (const it of now.build?.items ?? [])
    if (it.status === 'ready') Object.assign(it, { review: 'approved', announced: true });
  now.build!.frames = moments;
  now.phase = 'frames';
  await store.resume(s.id);
  await store.settle(s.id, 1_200_000);
  // No resuming here: a take whose verdict was lost used to leave what is drawn from it waiting
  // (session.ts judgeWhenReady, fixed 27 Sep), and a redraw must show it if it comes back.
  const done = store.get(s.id)!;
  // Each image by what it is, as the store's own names them (evals/freeze-session.ts).
  const all: Item[] = [...(done.build?.items ?? []), ...(done.build?.frames ?? [])];
  const named = (m: string, f: Item) => {
    if (f.layout?.mediaId === m || m.startsWith('previs-')) return `previs:${f.id}`;
    const x = all.find((i) => i.mediaId === m);
    if (!x) return 'other';
    return x.kind === 'ghost' && x.ghost ? ghostName(x.ghost) : x.kind === 'cut' ? `picture:${x.id}` : `sketch:${x.id}`;
  };
  const result: Redrawn = {
    name,
    source,
    checks: checksMode(),
    record: recordMode(),
    cutSheet: process.env.DREAMCHAT_CUT_SHEET ?? 'off',
    asked,
    sent: Object.fromEntries(
      Object.entries(sent).map(([id, x]) => {
        const f = all.find((i) => i.id === id)!;
        return [id, { prompt: x.prompt, images: x.references.map((r) => `${r.role} ${named(r.media_id, f)}`) }];
      }),
    ),
  };
  writeFileSync(join(out, name, 'redraw.json'), JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = at === -1 ? '' : resolve(args[at + 1] ?? '');
  const sources = args.filter((a, i) => a !== '--out' && i !== at + 1);
  if (!out || !sources.length) {
    console.error('usage: bun run evals/redraw.ts --out <dir> <saved session .json> …');
    process.exit(1);
  }
  const done = await Promise.all(
    sources.map((f) =>
      redraw(resolve(f), out).then(
        (r) => r,
        (e) => {
          console.error(`${basename(f)}: ${String(e).slice(0, 400)}`);
          return null;
        },
      ),
    ),
  );
  for (const r of done.filter((x): x is Redrawn => !!x))
    console.log(
      `${r.name}: ${Object.keys(r.sent).length} moments sent; model steps asked for: ${r.asked.length ? r.asked.map((a) => a.step).join(', ') : 'none'}`,
    );
  process.exit(done.every(Boolean) ? 0 : 1);
}
