// The import of a dumped dream (import.ts runs it): see there. Kept apart from the command so loading it sets no
// switch: the command sets the full profile before anything loads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from './dream';
import { type JevFn, renderTranscript } from './jev';
import { initialState } from './lib';
import { mediumOf, type StyleOption } from './producer';
import { recordInputsOf } from './record';
import { applyPrep, buildItems, type Entry, planShots, type Session, type StoreDeps } from './session';

/** What the import asks of the models, and where it keeps what it makes: each a stand-in in a test. */
export type ImportDeps = {
  producer: NonNullable<StoreDeps['producer']>;
  ownStyle: (transcript: string) => Promise<StyleOption | null>;
  block?: StoreDeps['block'];
  shot?: StoreDeps['shot'];
  supervise?: StoreDeps['supervise'];
  jev?: JevFn;
  /** The dream with its readings in, read and kept as every eval reads them. */
  readings: (s: Session) => Promise<Session>;
  /** Its node packet written; null where it has none. */
  packet: (
    id: string,
    s: Session,
  ) =>
    | { file: string; errors: string[]; cuts: number }
    | null
    | Promise<{ file: string; errors: string[]; cuts: number } | null>;
};

export type Imported = { id: string; state: string; packet: string | null; cuts: number; errors: string[] };

/** A medium that is a photograph, however it is said: every dream is drawn in an art style of its own. */
const PHOTO = /\b(?:photo\w*|camera|film still|realistic|real life|lifelike)\b/i;

/**
 * The conversation a dump is: a transcript (a JSON list of turns, each `role`/`content` or `who`/`text`, the dreamer
 * the user), else the dream's text, told once by the dreamer.
 */
export function transcriptOf(raw: string): Entry[] {
  try {
    const turns = JSON.parse(raw) as unknown;
    if (Array.isArray(turns) && turns.length)
      return turns.map((t) => {
        const x = t as { role?: string; content?: string; who?: string; text?: string };
        const said = (x.content ?? x.text ?? '').trim();
        const listener = x.role === 'assistant' || /^(?:listener|berry|assistant|host)$/i.test(x.who ?? '');
        return { role: listener ? ('assistant' as const) : ('user' as const), content: said };
      });
  } catch {
    // Not JSON: the dream's own words.
  }
  return [{ role: 'user', content: raw.trim() }];
}

/** A new dream's id, as the chat names one. */
function newId(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `dream-${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}-${crypto.randomUUID().slice(0, 4)}`;
}

/** A dumped dream, planned as the chat plans one and saved under `data` (state/<id>.json), its packet written. */
export async function importDream(
  input: { text: string; style: string; id?: string; title?: string; data: string },
  deps: ImportDeps,
): Promise<Imported> {
  const transcript = transcriptOf(input.text);
  if (!transcript.some((t) => t.role === 'user' && t.content)) throw new Error('the dump has nothing the dreamer said');
  const id = input.id ?? newId();
  const draft = await deps.producer(structuredClone(transcript));
  // The look, as the dreamer would ask for it, built as the chat builds one they described in their own words.
  const style = await deps.ownStyle(
    renderTranscript([...transcript, { role: 'user', content: `I'd like the pictures made as ${input.style}.` }]),
  );
  if (!style) throw new Error(`no look could be made from "${input.style}"`);
  const medium = mediumOf(style);
  if (PHOTO.test(medium) || PHOTO.test(style.name))
    throw new Error(
      `"${input.style}" is made as ${medium}: every dream is drawn in an art style of its own, never a photograph`,
    );
  const b = draft.breakdown;
  const at = Date.now();
  let s: Session = {
    id,
    name: input.title ?? '',
    createdAt: at,
    updatedAt: at,
    // Taken as a whole, never talked through: it is never picked up as a chat.
    phase: 'done',
    closed: true,
    transcript,
    briefs: {},
    turns: [],
    state: initialState(id, dreamConfig()),
    askCounts: {},
    exploredThreads: [],
    retells: 0,
    offers: 0,
    styleAsks: 0,
    draft: { status: 'ready', basedOn: transcript.filter((t) => t.role === 'user').length, ...draft },
    style,
    production: null,
    // Every sketch as the chat lists them, none confirmed and none drawn: a look nobody told stays a guess.
    build: { items: buildItems(b), current: null, checks: 0 },
    images: 0,
    spentUsd: 0,
  };
  const dir = join(input.data, 'state');
  const prep = await planShots(
    b,
    style,
    { block: deps.block, shot: deps.shot, supervise: deps.supervise, jev: deps.jev, dir: join(dir, id) },
    { ...recordInputsOf(s), readings: s.draft?.readings },
  );
  applyPrep(s, prep);
  s = await deps.readings(s);
  mkdirSync(dir, { recursive: true });
  const state = join(dir, `${id}.json`);
  writeFileSync(state, `${JSON.stringify(s, null, 2)}\n`);
  const pk = await deps.packet(id, s);
  return { id, state, packet: pk?.file ?? null, cuts: pk?.cuts ?? 0, errors: pk?.errors ?? [] };
}

/** The models and the caches the import reads with, as every eval does. */
export async function liveDeps(): Promise<ImportDeps> {
  const { callJev, jevWithModel } = await import('./jev');
  const { blockScenes, ownStyle, shotFor, superviseChanges } = await import('./producer');
  const { liveProducer } = await import('./session');
  const { writeTyped } = await import('./typed');
  const { withImplied } = await import('./evals/implied-cache');
  const { cachedFns, readTypedDream, TypedCache, withTyped } = await import('./evals/typed-cache');
  const { castReadingOf, withCast } = await import('./evals/cast-cache');
  const JM = process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';
  return {
    producer: liveProducer(callJev),
    ownStyle,
    block: blockScenes,
    shot: shotFor,
    supervise: superviseChanges,
    jev: callJev,
    readings: async (s) => {
      // What each moment implies (asked where not kept), its typed facts (asked and kept), and last the cast, which is
      // read from the breakdown as it stands with the others in.
      let x = (await withImplied(s, { jev: jevWithModel(JM), jevModel: JM })).session as Session;
      const cache = new TypedCache();
      const counts = { writer: { asked: 0, cached: 0, missing: 0 }, jev: { asked: 0, cached: 0, missing: 0 } };
      await readTypedDream(
        x,
        cachedFns(cache, { write: writeTyped, jev: jevWithModel(JM), jevModel: JM, ask: true }, counts),
      );
      cache.save();
      x = (await withTyped(x)).session as Session;
      await castReadingOf(x, { ask: true });
      return (await withCast(x)).session as Session;
    },
    // Loaded once the dream is saved: the packets' folder is found by the conversations it holds.
    packet: async (id, s) => {
      const { packetOf, writeSchema } = await import('./evals/packets');
      writeSchema();
      const w = packetOf(id, s);
      return w ? { file: w.file, errors: w.errors, cuts: w.cuts } : null;
    },
  };
}
