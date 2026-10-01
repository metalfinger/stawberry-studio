// What a group of people with no clothes told would ordinarily wear (the one builder's `extras_wardrobe` step): one
// writer reading per dream. A group seen only as a crowd ("extras") is never sketched, so nothing ever proposed its
// look, and made real from the grey mock-up the exam room's faceless students came out naked (heron m4, the owner:
// "all the people being completely naked"). Each is given ordinary clothes for who they are and where the dream puts
// them, kept as a guess (said: false), never as what the dreamer told.
import { type ChatMessage } from './llm';
import type { Breakdown } from './producer';
import { isAnimal, type Item } from './sheets';

/** A group's guessed clothes, by its id. */
export type WardrobeReading = Record<string, string>;

/** A group of people with no clothes told: a crowd, never sketched on its own, its wardrobe empty. Never animals. */
export function untoldGroups(b: Breakdown): Breakdown['people'] {
  return b.people.filter(
    (p) =>
      !p.is_dreamer &&
      p.extras &&
      !p.fields?.wardrobe?.value?.trim() &&
      !isAnimal({ kind: 'character', name: p.name, fields: p.fields as Item['fields'], isDreamer: false }),
  );
}

const WARDROBE = `Some people in a dream were told only as a group, with nothing said of what they wear. For each group below, say the ordinary clothes they would wear, for who they are and where and when the dream puts them: a short plain phrase naming the garments and their colours ("school uniforms: white shirts, grey jumpers and dark trousers"). Ordinary, never strange, never anything the dream does not suggest. Return JSON only: {"<id>": "<clothes>"} for every group below.`;

/** The writer's question for a dream's untold groups; null where it has none. */
export function wardrobeAsk(b: Breakdown): ChatMessage[] | null {
  const groups = untoldGroups(b);
  if (!groups.length) return null;
  const moments = b.scenes.flatMap((sc) => sc.moments.map((m) => ({ ...m, scene: sc })));
  const lines = groups.map((p) => {
    const seen = moments.filter((m) => m.visible.includes(p.id));
    const places = [...new Set(seen.map((m) => b.places.find((l) => l.id === m.place)?.name).filter(Boolean))];
    const who = [p.fields?.identity?.value, p.fields?.appearance?.value].filter(Boolean).join('; ');
    return `- ${p.id}: ${p.name}${who ? ` (${who})` : ''}; seen at ${places.join(', ') || 'no place named'}; ${seen
      .slice(0, 2)
      .map((m) => m.action)
      .join(' / ')}`;
  });
  return [
    { role: 'system', content: WARDROBE },
    { role: 'user', content: `The dream: ${b.logline}\n${b.world_logic ?? ''}\n\nThe groups:\n${lines.join('\n')}` },
  ];
}

/** The writer's answer read: a phrase for each untold group asked of, nothing else. */
export function parseWardrobe(content: string, b: Breakdown): WardrobeReading {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
  const ids = new Set(untoldGroups(b).map((p) => p.id));
  return Object.fromEntries(
    Object.entries(raw).filter(([id, v]) => ids.has(id) && typeof v === 'string' && v.trim().length > 3) as [
      string,
      string,
    ][],
  );
}

/** Each untold group's sketch item given its guessed clothes, as a guess (said: false); a told wardrobe is kept. */
export function withWardrobes(items: Item[], reading: WardrobeReading): Item[] {
  return items.map((it) =>
    reading[it.id] && !it.fields.wardrobe?.value?.trim()
      ? { ...it, fields: { ...it.fields, wardrobe: { value: reading[it.id].trim(), said: false } } }
      : it,
  );
}
