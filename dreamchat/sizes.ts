// How big each figure and thing is drawn, where the dream's words say (the one builder's `sizes` step): one writer
// reading per dream. A dream that shrinks someone to the size of an ant, or a building to theirs, was planned with
// everyone at a grown person's height: the ants a man on the kitchen counter, tiny Alina and her guests full size and
// hiding the shrunken building they partied in (the merged flow's Shrinking Hand, 2 Oct). Each figure that is not a
// grown person has its ordinary size, and a size the dream sets holds in each moment it says; a size no words give is
// never guessed, and the ordinary one stands.
import type { ChatMessage } from './llm';
import type { Breakdown } from './producer';

/** How a body is drawn: a person's mannequin, or a creature's shape. */
export type BodyShape = 'human' | 'four-legged' | 'bird' | 'fish' | 'other';
/** A figure's ordinary height when it is not a grown person, by the words that make it so. */
export type SizedBody = { id: string; height_m: number; shape: BodyShape; words: string };
/** A size the dream sets at a moment, for someone or something, by the words that say so. */
export type SizedAt = { id: string; height_m: number; words: string };
export type SizesReading = { bodies: SizedBody[]; moments: Record<string, SizedAt[]> };

const SHAPES = new Set<BodyShape>(['human', 'four-legged', 'bird', 'fish', 'other']);

const SIZES = `How big each figure and thing in a dream is drawn, where the dream says. Two lists:
- "bodies": each cast person or creature below that is not a grown person (a child, an animal, an insect), at its ordinary height in metres, its shape ("human", "four-legged", "bird", "fish" or "other"), and the words that make it so, quoted ("small black ants": 0.005, other; "the terrier": 0.3, four-legged; "a six-year-old": 1.15, human).
- "moments": for each moment where the words make someone or something a size it is not ordinarily (shrunk, tiny, giant, "as big as a bus", "shrunk to her size"), its height in metres in that moment and the words that say so, quoted from the dream or the moment; list it in every moment the size holds, until the words change it back.
Never guess a size: what no words give or imply is left out, and its ordinary size stands. Heights are how tall it stands: a grown person 1.7, a cat 0.25, an ant 0.005, a house 8; "ant-sized" 0.005; "shrunk to her size" the height she is then.
Return JSON only: {"bodies": [{"id": "...", "height_m": 0.0, "shape": "...", "words": "..."}], "moments": {"<moment id>": [{"id": "...", "height_m": 0.0, "words": "..."}]}}. Either may be empty.`;

/** The writer's question for a dream's sizes: its text, its cast, its moments. */
export function sizesAsk(b: Breakdown, text: string): ChatMessage[] {
  const people = b.people.map((p) => {
    const f = p.fields as Record<string, { value?: string | null } | undefined> | undefined;
    const look = [f?.identity?.value, f?.appearance?.value, f?.distinctive_features?.value].filter(Boolean).join('; ');
    return `- ${p.id}: ${p.name}${p.is_dreamer ? ' (the dreamer)' : ''}${look ? ` (${look})` : ''}`;
  });
  const things = (b.things ?? []).map((t) => `- ${t.id}: ${t.name}`);
  const moments = b.scenes.flatMap((sc) =>
    sc.moments.map((m) => `- ${m.id}: ${m.action}${m.visual_point ? ` | shows: ${m.visual_point}` : ''}`),
  );
  return [
    { role: 'system', content: SIZES },
    {
      role: 'user',
      content: `The dream, in the dreamer's words:\n${text.trim()}\n\nWho is in it:\n${people.join('\n')}\n\nThings in it:\n${things.join('\n') || '- none'}\n\nThe moments:\n${moments.join('\n')}`,
    },
  ];
}

const low = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The writer's answer read: a size kept only for someone or something in the dream, at a height in reason, said by
 * words found in the dream's text, the moment's own words, or (a body's ordinary size) its name and look.
 */
export function parseSizes(content: string, b: Breakdown, text: string): { reading: SizesReading; dropped: string[] } {
  const dropped: string[] = [];
  let raw: { bodies?: unknown; moments?: unknown } = {};
  try {
    raw = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof raw;
  } catch {
    return { reading: { bodies: [], moments: {} }, dropped: ['not JSON'] };
  }
  const people = new Map(b.people.map((p) => [p.id, p]));
  const things = new Map((b.things ?? []).map((t) => [t.id, t]));
  const moments = new Map(b.scenes.flatMap((sc) => sc.moments.map((m) => [m.id, m] as const)));
  // The dream's words: its text, every moment's, and every figure's and thing's look. A size that holds from a moment on
  // is said where it was set ("tiny as a mouse" in m1, all through), never in each moment again.
  const looks = [...b.people, ...(b.things ?? [])].map((x) => {
    const f = ((x as { fields?: unknown }).fields ?? {}) as Record<string, { value?: string | null } | undefined>;
    return `${x.name} ${Object.values(f)
      .map((v) => v?.value ?? '')
      .join(' ')}`;
  });
  const dream = low(
    [text, ...b.scenes.flatMap((sc) => sc.moments.map((m) => `${m.action} ${m.visual_point ?? ''}`)), ...looks].join(
      '\n',
    ),
  );
  const height = (h: unknown) => (typeof h === 'number' && h >= 0.001 && h <= 100 ? Math.round(h * 1000) / 1000 : NaN);
  const bodies: SizedBody[] = [];
  for (const x of Array.isArray(raw.bodies) ? raw.bodies : []) {
    const y = (x ?? {}) as Partial<SizedBody>;
    const p = typeof y.id === 'string' ? people.get(y.id) : undefined;
    const h = height(y.height_m);
    const words = typeof y.words === 'string' ? low(y.words) : '';
    if (!p || p.is_dreamer) dropped.push(`body ${String(y.id)}: not a cast person or creature`);
    else if (Number.isNaN(h)) dropped.push(`body ${p.id}: height ${String(y.height_m)} out of reason`);
    else if (!words || !dream.includes(words)) dropped.push(`body ${p.id}: "${y.words}" not said`);
    else
      bodies.push({
        id: p.id,
        height_m: h,
        shape: SHAPES.has(y.shape as BodyShape) ? (y.shape as BodyShape) : 'other',
        words: y.words!.trim(),
      });
  }
  const at: Record<string, SizedAt[]> = {};
  const given = raw.moments && typeof raw.moments === 'object' ? (raw.moments as Record<string, unknown>) : {};
  for (const [mid, list] of Object.entries(given)) {
    const m = moments.get(mid);
    if (!m) {
      dropped.push(`moment ${mid}: not in the dream`);
      continue;
    }
    for (const x of Array.isArray(list) ? list : []) {
      const y = (x ?? {}) as Partial<SizedAt>;
      const id = typeof y.id === 'string' ? y.id : '';
      const h = height(y.height_m);
      const words = typeof y.words === 'string' ? low(y.words) : '';
      if (!people.has(id) && !things.has(id)) dropped.push(`${mid} ${id}: not in the dream`);
      else if (Number.isNaN(h)) dropped.push(`${mid} ${id}: height ${String(y.height_m)} out of reason`);
      else if (!words || !dream.includes(words)) dropped.push(`${mid} ${id}: "${y.words}" not said`);
      else (at[mid] ??= []).push({ id, height_m: h, words: y.words!.trim() });
    }
  }
  return { reading: { bodies, moments: at }, dropped };
}
