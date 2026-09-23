// Reference sheets: the prompt for each person, place and thing, and the engine calls that
// draw one. Everything goes through Strawberry's own path: the item's fields are patched with
// their source, a recipe is prepared, approved within the conversation's image cap, queued, and
// the engine's worker draws it.
import type { CutPlan, GhostPlan } from './continuity';
import type { Detail, StyleOption } from './producer';
import { cli, REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON } from './strawberry';

export type ItemKind = 'character' | 'location' | 'prop' | 'cut' | 'ghost';

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
  /** Approved by the chat so the next moment could be drawn from it; the person's verdict still stands above it. */
  continuityApproved?: boolean;
  /** For a moment or a ghost: the pictures that must be drawn and approved before it. */
  needs?: string[];
  /** Pictures its plan wanted but it was drawn without, because they failed. */
  dropped?: string[];
  /** Redrawn because the person corrected this earlier picture, which it was drawn from. */
  redrawBecause?: string;
  /** Still drawing from a version the person has since corrected: drawn again once it lands. */
  stale?: boolean;
  /** For a ghost: what it shows, what it is edited from, and which moments use it. */
  ghost?: GhostPlan;
  /** For a ghost: the planned requirement on its asset that its take covers. */
  requirementId?: string;
  /** The judge's continuity check: the take beside the pictures it was drawn from. */
  continuity?: { questions: number; passed: number; failed: string[]; error?: string };
  /** Downloads of the current take retried after failing. */
  collectRetries?: number;
  /** The image judge's check of the current take: how many declared facts it saw. */
  check?: { questions: number; passed: number; failed: string[]; error?: string; unseen?: string[] };
  /** Why a moment can't be drawn from yet without the person's verdict. */
  waitsForPerson?: string;
  /** For a moment: the asset nodes its frame shows, confirmed on the take when approved. */
  depicted?: string[];
  /** For a moment: what is in view, where, and how it is seen. */
  frame?: {
    visible: string[];
    things: string[];
    place: string;
    distance: 'close' | 'medium' | 'wide';
    eyes: 'dreamer' | 'outside';
    key: boolean;
    /** Its place in the story, counting from 1. */
    order: number;
    /** What the camera faces. */
    looksAt?: string;
    /** What it is drawn from and why: the continuity plan's entry for it. */
    plan?: CutPlan;
  };
  isDreamer?: boolean;
  /** Shown to the person as a profile to confirm; otherwise sketched from what they told, unasked. */
  ask?: boolean;
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
export function profileOf(item: Item): {
  name: string;
  kind: string;
  said: string[];
  guessed: string[];
  dreamer?: boolean;
  unknownLook?: boolean;
} {
  const said: string[] = [];
  const guessed: string[] = [];
  for (const [k, d] of Object.entries(item.fields)) {
    if (!d.value) continue;
    (d.said ? said : guessed).push(`${FIELD_WORDS[k] ?? k}: ${d.value}`);
  }
  const looks = ['appearance', 'wardrobe'].some((k) => item.fields[k]?.said);
  return {
    name: item.isDreamer ? 'you' : item.name,
    kind: item.kind,
    said,
    guessed,
    dreamer: item.isDreamer,
    unknownLook: item.isDreamer && !looks,
  };
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
  // One picture per item, not a grid of views: named views came back captioned ("Front",
  // "Side", "Closer") whatever the prompt said, and a grid used as a reference gets its layout
  // copied. A single clear picture is the identity the moments are drawn from.
  const layout =
    item.kind === 'character'
      ? `A single full-length picture of ${item.name}, one person only, as they ordinarily look: standing in a relaxed three-quarter view, the whole figure from head to feet, the face clearly visible.`
      : item.kind === 'location'
        ? `A single wide picture of ${item.name}, as it ordinarily looks, with no people in it, showing the whole place and how it is laid out.`
        : `A single clear picture of ${item.name} on its own, as it ordinarily looks, seen at a slight angle so its shape and materials read.`;
  const background = item.kind === 'location' ? '' : 'Plain, uncluttered background. ';
  return [layout, facts, styleBlock(style), `${background}${NO_WORDS}`].filter(Boolean).join('\n\n');
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
  review(input: {
    mediaId: string;
    nodeId: string;
    approved: boolean;
    decision: string;
    /** The asset nodes the take shows. A sheet shows its own node; a frame, everything in view. */
    depicted: string[];
    /** The person (their verdict, relayed) or the chat itself (approval for continuity). */
    author?: 'human' | 'assistant';
    /** Planned requirements on the asset the take covers: a ghost's view or state. */
    requirementIds?: string[];
    /** Make an approved take the node's selection. A ghost is never selected: the sheet stays. */
    select?: boolean;
  }): Promise<void>;
  /** Collect a finished picture again after its download failed. Costs nothing: no new generation. */
  retryCollection(jobId: string): Promise<void>;
  /** Prepare, approve and queue a moment's frame, with the approved sheets as references. */
  startFrame(input: {
    item: Item;
    prompt: string;
    references: { media_id: string; role: string; instruction: string }[];
    /** Revised fields to patch onto the cut first, when the person corrected the moment. */
    changes?: Record<string, string>;
    source?: string;
    reason: string;
    maxUsd: number;
    /** What the recipe is for, as Strawberry records it. */
    intent?: string;
  }): Promise<{ recipeId: string; jobId: string; usd: number | null }>;
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

  async review({ mediaId, nodeId, approved, decision, depicted, author, requirementIds, select }) {
    // The person's verdict and the chat's continuity approval can land together: a conflict is
    // read again and tried once more.
    for (let attempt = 0; ; attempt++) {
      const media = (await call('media', { id: mediaId })) as {
        media: { review: { revision: number } };
        review_context: string;
      };
      try {
        await call('review', {
          id: mediaId,
          request: {
            author: author ?? 'human',
            expected_revision: media.media.review.revision,
            expected_context: media.review_context,
            status: approved ? 'approved' : 'rejected',
            user_decision: decision.slice(0, 1000),
            depicted_assets: approved ? depicted : [],
            requirement_ids: approved ? (requirementIds ?? []) : [],
          },
        });
        break;
      } catch (e) {
        if (attempt || !String(e).includes('review_conflict')) throw e;
      }
    }
    if (!approved || select === false) return;
    const node = (await call('inspect', { id: nodeId })) as { node: { revision: number } };
    await call('select', { node_id: nodeId, media_id: mediaId, revision: node.node.revision });
  },

  async retryCollection(jobId) {
    await call('retry_collection', { id: jobId });
  },

  async startFrame({ item, prompt, references, changes, source, reason, maxUsd, intent }) {
    if (!item.nodeId) throw new Error(`${item.name} is not in the production yet`);
    if (changes && Object.keys(changes).length && source) {
      const node = (await call('inspect', { id: item.nodeId })) as { node: { revision: number } };
      await call('patch', {
        id: item.nodeId,
        request: {
          expected_revision: node.node.revision,
          changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { op: 'set', value: v }])),
          source_id: source,
          reason: 'The moment as they corrected it',
        },
      });
    }
    const recipe = (await call('prepare', {
      node_id: item.nodeId,
      provider: PROVIDER,
      model: MODEL,
      prompt,
      references,
      intent: `${intent ?? `Frame: ${item.name}`}${item.version > 1 ? `, version ${item.version}` : ''}`,
      settings: PROVIDER === 'fal' ? { aspect_ratio: '16:9' } : {},
    })) as { id: string; fingerprint: string; spec: { estimate?: { credits?: number | null } } };
    await call('approve', {
      id: recipe.id,
      request: { fingerprint: recipe.fingerprint, user_decision: reason, max_credits: maxUsd },
    });
    const job = (await call('enqueue', { id: recipe.id })) as { id: string };
    return { recipeId: recipe.id, jobId: job.id, usd: recipe.spec.estimate?.credits ?? null };
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

export type Check = NonNullable<Item['check']>;

export const judgeAvailable = () => !!process.env.JUDGE_URL && !!process.env.JUDGE_API_KEY;

/** The judge on the PC checks one take against its declared facts; the answers go into Strawberry. */
export async function judgeTake(mediaId: string, opts: { facts?: boolean } = {}): Promise<Check> {
  const proc = Bun.spawn(
    [STRAWBERRY_PYTHON, 'dreamchat/judge.py', STRAWBERRY_HOME, mediaId, ...(opts.facts ? ['--facts'] : [])],
    {
      cwd: REPO,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PYTHONPATH: REPO },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((err || out).trim().split('\n').at(-1)?.slice(0, 300) ?? 'judge failed');
  return JSON.parse(out) as Check;
}

/** The judge's continuity check: each question asked of the take beside the picture it compares with. */
export async function judgeContinuity(
  mediaId: string,
  checks: { with: string | null; text: string }[],
): Promise<Check> {
  const proc = Bun.spawn([STRAWBERRY_PYTHON, 'dreamchat/judge.py', STRAWBERRY_HOME, '--continuity'], {
    cwd: REPO,
    stdin: new Blob([JSON.stringify({ media: mediaId, checks })]),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, PYTHONPATH: REPO },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((err || out).trim().split('\n').at(-1)?.slice(0, 300) ?? 'continuity check failed');
  return JSON.parse(out) as Check;
}
