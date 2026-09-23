// Reference sheets: the prompt for each person, place and thing, and the engine calls that
// draw one. Everything goes through Strawberry's own path: the item's fields are patched with
// their source, a recipe is prepared, approved within the conversation's image cap, queued, and
// the engine's worker draws it.
import type { Detail, StyleOption } from './producer';
import { cli, STRAWBERRY_HOME } from './strawberry';

export type ItemKind = 'character' | 'location' | 'prop';

/** A person, place or thing being confirmed and sketched. */
export type Item = {
  /** The breakdown's id: p1, l1, t1. */
  id: string;
  kind: ItemKind;
  name: string;
  fields: Record<string, Detail>;
  status: 'waiting' | 'confirming' | 'drawing' | 'ready' | 'failed';
  /** Sketches drawn so far; a correction makes the next one. */
  version: number;
  /** The Strawberry node, once the production is written. */
  nodeId?: string;
  jobId?: string;
  recipeId?: string;
  mediaId?: string;
  /** The image file, relative to the store's media folder. */
  mediaPath?: string;
  error?: string;
  /** The turn whose reply started the sketch, so the chat can show it there. */
  startedAtTurn?: number;
  /** Whether the person has been told it is ready. */
  announced?: boolean;
  /**
   * Their verdict on the current version: approved (it looks right) or left (shown, no
   * objection); undefined while it waits. A correction rejects the version and draws a new one.
   */
  review?: 'approved' | 'left';
  isDreamer?: boolean;
};

const FIELD_WORDS: Record<string, string> = {
  identity: 'who they are',
  appearance: 'looks',
  wardrobe: 'wears',
  distinctive_features: 'distinctive',
  geography: 'what kind of place',
  landmarks: "what's in it",
  light: 'light',
  materials: 'made of',
};

/** The profile as the person is shown it: what they said, and what was guessed. */
export function profileOf(item: Item): { name: string; kind: string; said: string[]; guessed: string[] } {
  const said: string[] = [];
  const guessed: string[] = [];
  for (const [k, d] of Object.entries(item.fields)) {
    if (!d.value) continue;
    (d.said ? said : guessed).push(`${FIELD_WORDS[k] ?? k}: ${d.value}`);
  }
  return { name: item.name, kind: item.kind, said, guessed };
}

const NAMED: [string, number, number, number][] = [
  ['black', 20, 20, 20],
  ['near-black', 32, 38, 44],
  ['dark slate', 45, 60, 70],
  ['dark navy', 22, 30, 60],
  ['deep brown-black', 40, 30, 25],
  ['charcoal', 55, 55, 60],
  ['slate grey', 110, 120, 130],
  ['grey', 128, 128, 128],
  ['silver', 192, 192, 192],
  ['off-white', 240, 236, 226],
  ['white', 250, 250, 250],
  ['cream', 245, 235, 210],
  ['beige', 225, 210, 180],
  ['sand', 210, 185, 140],
  ['tan', 190, 160, 120],
  ['brown', 120, 80, 50],
  ['dark brown', 70, 45, 30],
  ['rust', 160, 80, 40],
  ['ochre', 200, 150, 60],
  ['gold', 200, 170, 60],
  ['yellow', 240, 210, 50],
  ['orange', 240, 130, 30],
  ['red', 200, 30, 30],
  ['crimson', 170, 20, 40],
  ['maroon', 110, 20, 30],
  ['pink', 240, 150, 170],
  ['rose', 200, 100, 120],
  ['magenta', 200, 60, 160],
  ['purple', 120, 60, 160],
  ['lavender', 200, 180, 230],
  ['indigo', 70, 60, 150],
  ['navy', 25, 35, 90],
  ['blue', 50, 90, 190],
  ['pale blue', 180, 210, 235],
  ['sky blue', 120, 180, 230],
  ['steel blue', 70, 110, 150],
  ['teal', 40, 130, 130],
  ['cyan', 60, 200, 220],
  ['pale green', 180, 220, 190],
  ['sage', 150, 170, 140],
  ['green', 50, 140, 70],
  ['dark green', 25, 70, 40],
  ['olive', 120, 120, 50],
];

/** A colour's nearest plain name: a hex code in a prompt gets drawn as a label. */
export function colourName(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = NAMED[0];
  let bestD = Infinity;
  for (const c of NAMED) {
    const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best[0];
}

export function styleBlock(style: StyleOption): string {
  const colours = [...new Set(style.palette_hex.map(colourName))];
  return [
    `Style: ${style.name}. ${style.line}`,
    style.tokens.length ? `Technique, followed exactly: ${style.tokens.join('; ')}.` : '',
    colours.length ? `Colours, and no others: ${colours.join(', ')}.` : '',
    style.lighting_rules ? `Light: ${style.lighting_rules}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Measured on the first real sheets (23 Sep): "No text, labels or captions" still came back
// with "front view" under each view, a ruler, and the palette drawn as labelled swatches.
const NO_WORDS =
  'Do not write any words, letters, numbers, labels or colour codes anywhere in the image. Do not draw colour swatches, rulers or captions.';

const value = (item: Item, field: string) => item.fields[field]?.value ?? '';

/**
 * The sheet prompt. Every line is a fact about the item or the chosen style; the layout is
 * what Strawberry's playbooks ask of a reference sheet: identity and proportions for a person,
 * geography for a place, shape and scale for a thing.
 */
export function sheetPrompt(item: Item, style: StyleOption): string {
  const facts = Object.keys(item.fields)
    .map((k) => (value(item, k) ? `${FIELD_WORDS[k] ?? k}: ${value(item, k)}` : ''))
    .filter(Boolean)
    .join('\n');
  const layout =
    item.kind === 'character'
      ? `A character reference sheet of ${item.name}, one person only, as they ordinarily look: the whole figure standing, seen from the front, from three-quarters and from the side, and their face up close. The same person, clothes and features every time.`
      : item.kind === 'location'
        ? `A location reference sheet of ${item.name}, as it ordinarily looks, with no people in it: one wide picture showing the whole place and its layout, and two smaller pictures of it from other angles.`
        : `An object reference sheet of ${item.name}, as it ordinarily looks: the same object from the front, from the side, and much closer.`;
  return [layout, facts, styleBlock(style), `Plain, uncluttered background. ${NO_WORDS}`].filter(Boolean).join('\n\n');
}

export type SheetEngine = {
  /** Write the confirmed fields, then prepare, approve and queue the sketch. */
  start(input: {
    item: Item;
    style: StyleOption;
    sources: { said: string; proposal: string };
    reason: string;
    maxUsd: number;
  }): Promise<{ recipeId: string; jobId: string; usd: number | null }>;
  /** Where the sketch has got to, and its image once it is ready. */
  status(
    jobId: string,
    nodeId: string,
  ): Promise<{ state: string; error?: string; mediaId?: string; mediaPath?: string }>;
  /**
   * Record the person's verdict on a take. An approved take is confirmed as depicting the item
   * and selected, which makes it the item's reference for every picture it appears in.
   */
  review(input: { mediaId: string; nodeId: string; approved: boolean; decision: string }): Promise<void>;
};

export const PROVIDER =
  (process.env.DREAMCHAT_PROVIDER as 'fal' | 'fake' | undefined) ?? (process.env.FAL_KEY ? 'fal' : 'fake');
const MODEL = PROVIDER === 'fal' ? 'nano_banana_pro' : 'fixture';

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

export const liveSheets: SheetEngine = {
  async start({ item, style, sources, reason, maxUsd }) {
    if (!item.nodeId) throw new Error(`${item.name} is not in the production yet`);
    const node = (await call('inspect', { id: item.nodeId })) as { node: { revision: number } };
    const said: Record<string, { op: 'set'; value: string }> = {};
    const proposed: Record<string, { op: 'set'; value: string }> = {};
    for (const [k, d] of Object.entries(item.fields))
      if (d.value) (d.said ? said : proposed)[k] = { op: 'set', value: d.value };
    let revision = node.node.revision;
    for (const [changes, source, why] of [
      [said, sources.said, 'as they told or confirmed it'],
      [proposed, sources.proposal, 'proposed, and left to us'],
    ] as const) {
      if (!Object.keys(changes).length) continue;
      const patched = (await call('patch', {
        id: item.nodeId,
        request: { expected_revision: revision, changes, source_id: source, reason: `${item.name}, ${why}` },
      })) as { revision: number };
      revision = patched.revision;
    }
    const recipe = (await call('prepare', {
      node_id: item.nodeId,
      provider: PROVIDER,
      model: MODEL,
      prompt: sheetPrompt(item, style),
      intent: `Reference sheet for ${item.name}${item.version > 1 ? `, version ${item.version}` : ''}`,
      settings: PROVIDER === 'fal' ? { aspect_ratio: '16:9' } : {},
    })) as { id: string; fingerprint: string; spec: { estimate?: { credits?: number | null } } };
    const usd = recipe.spec.estimate?.credits ?? null;
    await call('approve', {
      id: recipe.id,
      request: { fingerprint: recipe.fingerprint, user_decision: reason, max_credits: maxUsd },
    });
    const job = (await call('enqueue', { id: recipe.id })) as { id: string };
    return { recipeId: recipe.id, jobId: job.id, usd };
  },

  async review({ mediaId, nodeId, approved, decision }) {
    const media = (await call('media', { id: mediaId })) as {
      media: { review: { revision: number } };
      review_context: string;
    };
    await call('review', {
      id: mediaId,
      request: {
        author: 'human',
        expected_revision: media.media.review.revision,
        expected_context: media.review_context,
        status: approved ? 'approved' : 'rejected',
        user_decision: decision.slice(0, 1000),
        depicted_assets: approved ? [nodeId] : [],
      },
    });
    if (!approved) return;
    const node = (await call('inspect', { id: nodeId })) as { node: { revision: number } };
    await call('select', { node_id: nodeId, media_id: mediaId, revision: node.node.revision });
  },

  async status(jobId, nodeId) {
    const job = (await call('job', { id: jobId })) as { state: string; error?: string | null };
    if (job.state !== 'ready') return { state: job.state, error: job.error ?? undefined };
    const node = (await call('inspect', { id: nodeId })) as { media: { id: string; job_id: string; path: string }[] };
    const media = node.media.find((m) => m.job_id === jobId);
    return media ? { state: 'ready', mediaId: media.id, mediaPath: media.path } : { state: 'collecting' };
  },
};

/** The engine's worker for the dream chat's store; fal jobs run only when fal is the provider. */
export function spawnWorker(python: string, repo: string): { stop(): void } | null {
  const proc = Bun.spawn(
    [
      python,
      '-m',
      'backend.studio',
      '--home',
      STRAWBERRY_HOME,
      'worker',
      ...(PROVIDER === 'fal' ? ['--allow-fal'] : []),
    ],
    { cwd: repo, stdout: 'ignore', stderr: 'inherit', env: process.env },
  );
  return { stop: () => proc.kill() };
}
