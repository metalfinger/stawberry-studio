// The import of a dumped dream (import.ts runs it): see there. Kept apart from the command so loading it sets no
// switch: the command sets the full profile before anything loads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { builds } from './cleanups';
import { dreamConfig } from './dream';
import { type Era, readEra } from './era';
import { cleanStyles } from './ground';
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
  /** The writers of what each moment implies and of its typed facts, read as the shots are planned (planShots). */
  imply?: StoreDeps['imply'];
  typed?: StoreDeps['typed'];
  /** The readings made after the plan: the cast, read and kept as every eval reads it. */
  readings: (s: Session) => Promise<Session>;
  /** With the one builder's `era`: the dream's period read from its telling, and the date it was recorded (era.ts). */
  era?: (text: string, given: string | null, moments: { id: string; action: string }[]) => Promise<Era>;
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
  input: {
    text: string;
    style: string;
    id?: string;
    title?: string;
    /** The date the dream was recorded (`--when`): its period where the dream's own words give none, never theirs. */
    when?: string;
    data: string;
  },
  deps: ImportDeps,
): Promise<Imported> {
  const transcript = transcriptOf(input.text);
  const from: 'text' | 'transcript' = transcript.length > 1 || transcript[0]?.role !== 'user' ? 'transcript' : 'text';
  if (!transcript.some((t) => t.role === 'user' && t.content)) throw new Error('the dump has nothing the dreamer said');
  const id = input.id ?? newId();
  const draft = await deps.producer(structuredClone(transcript));
  const b = draft.breakdown;
  // When the dream is set (`era`): its own words first, then the date it was recorded, else none (era.ts).
  if (builds('era') && deps.era) {
    const era = await deps.era(
      transcript
        .filter((t) => t.role === 'user')
        .map((t) => t.content)
        .join('\n'),
      input.when ?? null,
      b.scenes.flatMap((sc) => sc.moments).map((m) => ({ id: m.id, action: m.action })),
    );
    b.period = era.period;
    for (const m of b.scenes.flatMap((sc) => sc.moments)) if (era.moments[m.id]) m.period = era.moments[m.id].value;
  }
  // The look, as the dreamer would ask for it, built as the chat builds one they described in their own words.
  const made = await deps.ownStyle(
    renderTranscript([...transcript, { role: 'user', content: `I'd like the pictures made as ${input.style}.` }]),
  );
  if (!made) throw new Error(`no look could be made from "${input.style}"`);
  // And kept to technique as the chat keeps it, checked against this dream's breakdown: a look that names the dream's
  // own people or things ("The woman and the ice are rendered with more clarity") draws them into every picture.
  const style = deps.jev
    ? (await cleanStyles({ ...b, style_options: [made] }, deps.jev)).breakdown.style_options[0]
    : made;
  const medium = mediumOf(style);
  if (PHOTO.test(medium) || PHOTO.test(style.name))
    throw new Error(
      `"${input.style}" is made as ${medium}: every dream is drawn in an art style of its own, never a photograph`,
    );
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
    imported: { at, from },
  };
  const dir = join(input.data, 'state');
  // The chat's order: the floor plans, then what each moment implies and its typed facts (which read the plans'
  // fixtures and the changes found), then the cameras placed with them. The readings are the dream's own from now on.
  const prep = await planShots(
    b,
    style,
    {
      block: deps.block,
      shot: deps.shot,
      supervise: deps.supervise,
      jev: deps.jev,
      imply: deps.imply,
      typed: deps.typed,
      dir: join(dir, id),
    },
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
  const { callJev } = await import('./jev');
  const { blockScenes, ownStyle, shotFor, superviseChanges } = await import('./producer');
  const { liveProducer } = await import('./session');
  const { writeTyped } = await import('./typed');
  const { writeImplied } = await import('./implied');
  const { castReadingOf, withCast } = await import('./evals/cast-cache');
  return {
    producer: liveProducer(callJev, { telling: true }),
    ownStyle,
    block: blockScenes,
    shot: shotFor,
    supervise: superviseChanges,
    jev: callJev,
    imply: writeImplied,
    era: (text, given, moments) => readEra(text, given, moments),
    typed: writeTyped,
    // The cast, read from the breakdown as it stands with the others in, and kept where every eval reads it.
    readings: async (s) => {
      await castReadingOf(s, { ask: true });
      return (await withCast(s)).session as Session;
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
