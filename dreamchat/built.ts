// A place's sketch told by how it is built, never by what people do there (the one builder's `place_built` step): one
// writer reading per dream. A place's sketch is drawn alone and empty before anyone is put in it, and a place named or
// described by its use fills with the people who would be there: "the family meeting", "a room where the family gathers
// around a table", came out full of people in 4 of 4 takes, the place alone and empty all the same (the merged flow's
// Grandmother on Wednesdays, 2 Oct). Its furniture and architecture are said instead, and what is clear or empty, never
// who is absent; the moments keep the place's own name, where the people are.
import type { ChatMessage } from './llm';
import type { Item } from './sheets';

/** A place's sketch words, by its build: its name, what kind of place it is, and what is in it. */
export type Built = { name: string; kind: string; in: string };
/** By the place's sketch id: only the places whose words said their use. */
export type BuiltReading = Record<string, Built>;

const BUILT = `A dream's places are each drawn first as a sketch of their own: the place alone and empty, before anyone is put in it. A place named or described by what people do there (a meeting, a party, a class, waiting, a market, a family gathering) fills its sketch with the people who would be there. For each place below whose name or description says what people do there, who comes there or what it is for, say it again by how it is built and what stands in it: its furniture, fixtures and architecture, where each thing is, and what is clear ("a long low room with a wooden floor"; "a long low sofa against the left wall, a round wooden table with six chairs pushed in, the middle of the room clear"). Keep every colour, material, size and thing the description gives. Never what people do there, who comes or what it is for, and never what is not there ("no people", "nobody", "without anyone"). Leave out every place whose words already say only what it is built of. Return JSON only: {"<id>": {"name": "<what it is, a few words, by its build>", "kind": "<what kind of place>", "in": "<what is in it>"}}, or {} where no place needs it.`;

/** The words a place's sketch is told it by: its name, what kind of place, and what is in it. */
const wordsOf = (it: Item) => ({
  name: it.name,
  kind: it.fields.geography?.value?.trim() ?? '',
  in: it.fields.landmarks?.value?.trim() ?? '',
});

/** The writer's question for a dream's places; null where it has none. */
export function builtAsk(items: Item[], logline = ''): ChatMessage[] | null {
  const places = items.filter((it) => it.kind === 'location');
  if (!places.length) return null;
  const lines = places.map((it) => {
    const w = wordsOf(it);
    return `- ${it.id}: ${w.name}${w.kind ? `; what kind of place: ${w.kind}` : ''}${w.in ? `; what's in it: ${w.in}` : ''}`;
  });
  return [
    { role: 'system', content: BUILT },
    { role: 'user', content: `${logline ? `The dream: ${logline}\n\n` : ''}The places:\n${lines.join('\n')}` },
  ];
}

/** Who is absent, said: a sketch told "no people" draws them (a negated noun). */
const ABSENT =
  /\b(?:no|without|nobody|no one|no-one|none|empty of|devoid of)\b[^.;,]{0,20}\b(?:people|persons?|one|anyone|figures?|crowds?|guests?|students?|family|children|kids|visitors?|customers?|passengers?)\b|\bnobody\b|\bno one\b/i;

/** The writer's answer read: for a place asked of, its three parts, each said, none saying who is absent. */
export function parseBuilt(content: string, items: Item[]): BuiltReading {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>;
  } catch {
    return {};
  }
  const ids = new Set(items.filter((it) => it.kind === 'location').map((it) => it.id));
  const out: BuiltReading = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!ids.has(id) || !v || typeof v !== 'object') continue;
    const { name, kind, in: inIt } = v as Record<string, unknown>;
    if (![name, kind, inIt].every((x) => typeof x === 'string' && x.trim().length > 3)) continue;
    const b = { name: (name as string).trim(), kind: (kind as string).trim(), in: (inIt as string).trim() };
    if (ABSENT.test(`${b.name}; ${b.kind}; ${b.in}`)) continue;
    out[id] = b;
  }
  return out;
}

/** Each place the reading rewrote, given its sketch words by its build; every other item as it is. */
export function withBuilt(items: Item[], reading: BuiltReading): Item[] {
  return items.map((it) => (it.kind === 'location' && reading[it.id] ? { ...it, built: reading[it.id] } : it));
}
