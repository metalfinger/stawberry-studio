// The producer: turns the conversation into Strawberry Studio's breakdown. It does the work
// the host assistant does in Strawberry by hand (PLAYBOOKS.md: Director, Story Architect,
// Production Designer), in the background, as two parallel calls.
//
// Every detail it writes is marked as said by the person, or guessed. Jev then checks each
// "said" against the person's own messages (ground.ts). Strawberry's own rule is that missing
// facts are unknown, not invented defaults presented as the user's decisions.
import { type ChatMessage, callDeepseek, type Thinking } from './llm';

/** A detail and whether the person said it. `null` when nobody knows and nothing is needed. */
export type Detail = { value: string | null; said: boolean; evidence?: number | null };

export type Person = {
  id: string;
  name: string;
  /** The dreamer themself, when they are seen in the pictures. */
  is_dreamer: boolean;
  protagonist: boolean;
  fields: { identity: Detail; appearance: Detail; wardrobe: Detail; distinctive_features: Detail };
};
export type Place = { id: string; name: string; fields: { geography: Detail; landmarks: Detail; light: Detail } };
export type Thing = { id: string; name: string; fields: { appearance: Detail; materials: Detail } };

export type Moment = {
  id: string;
  action: string;
  /** Person ids in view. */
  visible: string[];
  /** Thing ids in view. */
  things: string[];
  place: string;
  /** Whose eyes we see it through. */
  eyes: 'dreamer' | 'outside';
  distance: 'close' | 'medium' | 'wide';
  feeling: string;
  /** The one thing the picture must carry. */
  visual_point: string;
  key: boolean;
  said: boolean;
};

export type Scene = { id: string; title: string; place: string; mood: string; moments: Moment[] };

export type StyleOption = {
  id: string;
  /** Plain words a person would use: "like an old woodcut print". */
  name: string;
  line: string;
  tokens: string[];
  palette_hex: string[];
  lighting_rules: string;
};

export type Breakdown = {
  title: string;
  logline: string;
  look: { colours: Detail; light: Detail; texture: Detail };
  world_logic: string;
  people: Person[];
  places: Place[];
  things: Thing[];
  scenes: Scene[];
  style_options: StyleOption[];
  unknowns: string[];
};

export type ProducerFn = (transcript: string, previous?: Breakdown) => Promise<{ raw: string; ms: number }>;

const SYSTEM = `You are the producer for Strawberry Studio, a tool that turns a person's dream into a short sequence of pictures. You read a conversation in which a person told their dream to a listener, and you write the production breakdown as JSON. You never talk to the person.

## The one rule that matters most
Mark every detail "said": true ONLY when the person's own words give it. Anything you infer, fill in or choose is "said": false — a guess the person will be asked to confirm. When nobody knows a detail and the pictures don't need it, use {"value": null, "said": false}. Never present a guess as said.

## Breakdown (Story Architect)
- Scenes in story order. A new scene when the place or the time changes.
- Each scene holds moments in order. A moment is ONE still picture: one decisive visible action, where it is, who and what is in view. A beat with two actions is two moments.
- 3 to 10 moments for the whole dream, in the person's order and words. A dream that is a single image still gets at least 3: where it is (wide), the thing itself, and the detail that matters most (close). Framing the same told moment differently is not inventing.
- "action" says what happens or what is there, in plain words. Never the camera: "wide view of", "close-up of" and the like belong in "distance", not in the action.
- "visible" lists only people ids; objects go in "things".
- Mark exactly one moment "key": true — the moment they said stays with them, or would pause on.
- "eyes": "dreamer" when we see through the dreamer's eyes, "outside" when the dreamer is seen. Follow what they said about how they were in it.
- "distance": "close", "medium" or "wide" — how near the viewer is to what matters.
- "feeling" is what the moment should feel like, in their words where possible. "visual_point" is the one thing the picture must carry.

## People, places, things (Production Designer)
- Only real presences get an entry. Ambient things (fog, glow, rain) belong to the look or a scene's mood. A crowd is not a person. Clothes and body features belong to the person, never separate things.
- The dreamer is a person entry ("is_dreamer": true) only if they are seen in some moment ("eyes": "outside").
- One "protagonist": true — the person the dream is most about.
- A thing gets an entry only if someone holds or uses it, or it is the main subject of a moment. Parts of a place (a window, shelves, a door), what is seen through them (the moon, the sky) and collections (floating books, leaves) are the place's landmarks, never things. Most dreams have 0-2 things.
- "name" is how the person would say it, in lowercase with its article: "the old man", "the flooded library", "the boat". The dreamer is "you".
- People fields: identity (who they are to the dreamer), appearance (age, build, face, hair), wardrobe, distinctive_features. Places: geography (what kind of place, inside or out, layout), landmarks (what's in it), light. Things: appearance, materials.
- A profile is how someone or something ordinarily looks, before anything happens to it in the dream. What happens to them (a head turning to ice, a room going dark, a person starting to glow) is a moment's action, never part of the profile: it would be drawn on every picture of them. If a woman's head turns to ice, her profile describes an ordinary woman's head and face (a guess if they didn't say), and the ice belongs to the moments.

## Look (Director)
- "look" is what the dream looked like to them: colours, light, texture.
- "world_logic": what is possible in this dream's world (what the dreamer simply accepted).

## Output
JSON only, exactly this shape (ids like p1, l1, t1, s1, m1, a/b/c/d):
{"title": "", "logline": "", "look": {"colours": D, "light": D, "texture": D}, "world_logic": "",
 "people": [{"id": "p1", "name": "", "is_dreamer": false, "protagonist": true, "fields": {"identity": D, "appearance": D, "wardrobe": D, "distinctive_features": D}}],
 "places": [{"id": "l1", "name": "", "fields": {"geography": D, "landmarks": D, "light": D}}],
 "things": [{"id": "t1", "name": "", "fields": {"appearance": D, "materials": D}}],
 "scenes": [{"id": "s1", "title": "", "place": "l1", "mood": "", "moments": [{"id": "m1", "action": "", "visible": ["p1"], "things": ["t1"], "place": "l1", "eyes": "dreamer", "distance": "medium", "feeling": "", "visual_point": "", "key": false, "said": true}]}],
 "unknowns": ["what the dream leaves open that a picture will need"]}
where D is {"value": "..." or null, "said": true or false}. Moment "said" is true when the person described that moment happening.`;

const STYLE_SYSTEM = `You help turn a person's dream into pictures. From the conversation below, propose how the pictures could be drawn. Return JSON only:
{"style_options": [{"id": "a", "name": "", "line": "", "tokens": [""], "palette_hex": ["#000000"], "lighting_rules": ""}]}

- Exactly 4 options: 3 ways suited to this dream's feeling and look, then "d", as close as possible to how the dream looked to them.
- "name": plain words anyone would understand, like "an old woodcut print" or "soft watercolour". No art jargon, no artist names.
- "line": one plain sentence on how it would feel.
- "tokens": 4-6 concrete technique phrases a renderer can follow, each under 120 characters ("flat black ink with hard carved edges" is a token; "dreamy style" is not). Tokens say how everything is drawn, never what is in the dream: no ice, glass, horses, glowing objects or other content, or every picture will be made of it.
- "palette_hex": 4-6 colours as #RRGGBB.
- "lighting_rules": 2-3 sentences on light, shadow and edges.`;

const OWN_STYLE = `The person has described, in their own words, how they want the pictures to look (their latest message). Return exactly ONE option, id "own", built from their words, in the same shape.`;

const REVISE = `A breakdown already exists (below). The person has since corrected or added to it in the latest messages. Return the whole breakdown again with their changes applied, keeping every id that still applies. Change nothing they didn't.`;

// Off: with it on, one breakdown took 76-143s against 29-39s off, for breakdowns of the same
// quality on the four test dreams.
export const PRODUCER_THINKING = (process.env.DREAMCHAT_PRODUCER_THINKING as Thinking | undefined) ?? 'disabled';

/**
 * Two calls in parallel: the story (scenes, moments, people, places, things) and the style
 * options. Measured on four dreams with one combined call: 76-143s with thinking on, 29-39s
 * off, most of it spent writing output; splitting it roughly halves the wait.
 */
export const callProducer: ProducerFn = async (transcript, previous) => {
  const story: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `The conversation:\n\n${transcript}` },
  ];
  if (previous) {
    const { style_options: _, ...rest } = previous;
    story.push({ role: 'user', content: `${REVISE}\n\n${JSON.stringify(rest)}` });
  }
  const style: ChatMessage[] = [
    { role: 'system', content: STYLE_SYSTEM },
    { role: 'user', content: `The conversation:\n\n${transcript}` },
  ];
  const t0 = Date.now();
  const [a, b] = await Promise.all([
    callDeepseek(story, { json: true, thinking: PRODUCER_THINKING }),
    // A revision keeps the style options already offered.
    previous ? null : callDeepseek(style, { json: true, thinking: PRODUCER_THINKING }),
  ]);
  const parsed = JSON.parse(a.content || '{}') as Record<string, unknown>;
  parsed.style_options = b
    ? ((JSON.parse(b.content || '{}') as Record<string, unknown>).style_options ?? [])
    : previous?.style_options;
  return { raw: JSON.stringify(parsed), ms: Date.now() - t0 };
};

const REVISE_ITEM = `The person was shown a profile of something from their dream and answered it (their latest message). Apply what they changed or added, and nothing else. Return JSON only: {"fields": {...}} with exactly the same keys as the profile, each value a short plain phrase, or null when nothing is known. Keep every value they didn't change exactly as it was.`;

/**
 * Apply the person's answer to a profile. Returns the new fields; any value that changed is
 * now theirs, so it is marked as said.
 */
export async function reviseItem(
  name: string,
  fields: Record<string, Detail>,
  transcript: string,
): Promise<Record<string, Detail>> {
  const current = Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, d.value]));
  const res = await callDeepseek(
    [
      { role: 'system', content: REVISE_ITEM },
      {
        role: 'user',
        content: `The conversation:\n\n${transcript}\n\nThe profile of ${name}:\n${JSON.stringify(current)}`,
      },
    ],
    { json: true, thinking: PRODUCER_THINKING },
  );
  let next: Record<string, unknown> = {};
  try {
    next = ((JSON.parse(res.content) as { fields?: Record<string, unknown> }).fields ?? {}) as Record<string, unknown>;
  } catch {
    return fields;
  }
  const out: Record<string, Detail> = {};
  for (const [k, d] of Object.entries(fields)) {
    const v =
      typeof next[k] === 'string' && (next[k] as string).trim() ? (next[k] as string).trim().slice(0, 600) : null;
    out[k] = v !== null && v !== d.value ? { value: v, said: true } : d;
  }
  return out;
}

/** Their own description of how it should look, as one style option. */
export async function ownStyle(transcript: string): Promise<StyleOption | null> {
  const res = await callDeepseek(
    [
      { role: 'system', content: STYLE_SYSTEM },
      { role: 'user', content: `The conversation:\n\n${transcript}\n\n${OWN_STYLE}` },
    ],
    { json: true, thinking: PRODUCER_THINKING },
  );
  try {
    const options = normalizeStyles((JSON.parse(res.content) as Record<string, unknown>).style_options);
    return options[0] ? { ...options[0], id: 'own' } : null;
  } catch {
    return null;
  }
}

// ── Shape enforcement lives here, never at the provider ──────────────────────

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function detail(v: unknown): Detail {
  if (typeof v === 'string') return { value: v.trim() || null, said: false };
  if (typeof v !== 'object' || v === null) return { value: null, said: false };
  const d = v as { value?: unknown; said?: unknown };
  const value = typeof d.value === 'string' && d.value.trim() ? d.value.trim().slice(0, 600) : null;
  return { value, said: value !== null && d.said === true };
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function ids(v: unknown, known: Set<string>): string[] {
  return [...new Set(list(v).filter((x): x is string => typeof x === 'string' && known.has(x)))];
}

const HEX = /^#[0-9A-F]{6}$/;

/**
 * Parse and repair the producer's JSON. Every repair is reported, so the trace shows what the
 * model got wrong. Throws only when there is nothing to build on (no moments at all).
 */
export function normalizeBreakdown(raw: string): { breakdown: Breakdown; notes: string[] } {
  const notes: string[] = [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('producer returned no JSON');
  }
  const b = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;

  const people: Person[] = list(b.people).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const f = (o.fields ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, 20) || `p${i + 1}`,
      name: str(o.name, 120) || `person ${i + 1}`,
      is_dreamer: o.is_dreamer === true,
      protagonist: o.protagonist === true,
      fields: {
        identity: detail(f.identity),
        appearance: detail(f.appearance),
        wardrobe: detail(f.wardrobe),
        distinctive_features: detail(f.distinctive_features),
      },
    };
  });
  if (people.length && people.filter((p) => p.protagonist).length !== 1) {
    notes.push('protagonist count was not one; first person kept as protagonist');
    people.forEach((p, i) => (p.protagonist = i === 0));
  }
  const places: Place[] = list(b.places).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const f = (o.fields ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, 20) || `l${i + 1}`,
      name: str(o.name, 120) || `place ${i + 1}`,
      fields: { geography: detail(f.geography), landmarks: detail(f.landmarks), light: detail(f.light) },
    };
  });
  const things: Thing[] = list(b.things).map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const f = (o.fields ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, 20) || `t${i + 1}`,
      name: str(o.name, 120) || `thing ${i + 1}`,
      fields: { appearance: detail(f.appearance), materials: detail(f.materials) },
    };
  });

  const personIds = new Set(people.map((p) => p.id));
  const placeIds = new Set(places.map((p) => p.id));
  const thingIds = new Set(things.map((t) => t.id));
  const firstPlace = places[0]?.id ?? '';

  let momentNo = 0;
  const scenes: Scene[] = list(b.scenes).map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const scenePlace = placeIds.has(str(o.place)) ? str(o.place) : firstPlace;
    const moments: Moment[] = list(o.moments).map((m) => {
      const mo = (m ?? {}) as Record<string, unknown>;
      momentNo += 1;
      const place = placeIds.has(str(mo.place)) ? str(mo.place) : scenePlace;
      const strays = list(mo.visible).filter((x): x is string => typeof x === 'string' && !personIds.has(x));
      const movedThings = strays.filter((x) => thingIds.has(x));
      const dropped = strays.filter((x) => !thingIds.has(x));
      if (movedThings.length)
        notes.push(`moment ${momentNo}: moved things ${movedThings.join(', ')} out of the people in view`);
      if (dropped.length) notes.push(`moment ${momentNo}: dropped unknown ids ${dropped.join(', ')}`);
      return {
        id: str(mo.id, 20) || `m${momentNo}`,
        action: stripCamera(str(mo.action)) || '(no action given)',
        visible: ids(mo.visible, personIds),
        things: ids([...list(mo.things), ...movedThings], thingIds),
        place,
        eyes: mo.eyes === 'outside' ? 'outside' : 'dreamer',
        distance: mo.distance === 'close' || mo.distance === 'wide' ? mo.distance : 'medium',
        feeling: str(mo.feeling, 240),
        visual_point: str(mo.visual_point, 240),
        key: mo.key === true,
        said: mo.said !== false,
      };
    });
    return {
      id: str(o.id, 20) || `s${i + 1}`,
      title: str(o.title, 120),
      place: scenePlace,
      mood: str(o.mood, 240),
      moments,
    };
  });
  const moments = scenes.flatMap((s) => s.moments);
  if (!moments.length) throw new Error('producer returned no moments');
  const keys = moments.filter((m) => m.key);
  if (keys.length !== 1) {
    notes.push(`${keys.length} key moments; kept ${keys.length ? 'the first' : 'the first moment'}`);
    const keep = keys[0] ?? moments[0];
    for (const m of moments) m.key = m === keep;
  }
  // Ids must be unique across the whole breakdown: they become references in Strawberry.
  const seen = new Set<string>();
  for (const m of moments) {
    if (seen.has(m.id)) {
      const fresh = `m${seen.size + 1}x`;
      notes.push(`duplicate moment id ${m.id} renamed ${fresh}`);
      m.id = fresh;
    }
    seen.add(m.id);
  }

  const style_options = normalizeStyles(b.style_options);
  if (style_options.length < 2) notes.push(`only ${style_options.length} style options`);

  const look = (b.look ?? {}) as Record<string, unknown>;
  return {
    breakdown: {
      title: str(b.title, 120) || 'Untitled dream',
      logline: str(b.logline, 400),
      look: { colours: detail(look.colours), light: detail(look.light), texture: detail(look.texture) },
      world_logic: str(b.world_logic),
      people,
      places,
      things,
      scenes,
      style_options,
      unknowns: list(b.unknowns)
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.slice(0, 240))
        .slice(0, 12),
    },
    notes,
  };
}

export function normalizeStyles(raw: unknown): StyleOption[] {
  return list(raw)
    .slice(0, 4)
    .map((o, i) => {
      const so = (o ?? {}) as Record<string, unknown>;
      const palette = list(so.palette_hex)
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim().toUpperCase())
        .filter((x) => HEX.test(x))
        .slice(0, 8);
      const tokens = list(so.tokens)
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.trim().slice(0, 120))
        .slice(0, 8);
      return {
        id: str(so.id, 4) || 'abcd'[i],
        name: str(so.name, 80) || `option ${i + 1}`,
        line: str(so.line, 240),
        tokens,
        palette_hex: palette,
        lighting_rules: str(so.lighting_rules, 600),
      };
    });
}

/**
 * Every detail in the breakdown, each with a plain sentence stem saying what it claims. The
 * stem is what Jev is asked about: "Kitchen: geography" read as a claim about layout the person
 * never gave, and a told kitchen scored 0.08 (zikery, 23 Sep); "the place is" does not.
 */
export function details(b: Breakdown): { path: string; label: string; detail: Detail }[] {
  const out: { path: string; label: string; detail: Detail }[] = [];
  const LOOK: Record<string, string> = {
    colours: 'the colours in the dream were',
    light: 'the light in the dream was',
    texture: 'the dream looked',
  };
  for (const [k, d] of Object.entries(b.look)) out.push({ path: `look.${k}`, label: LOOK[k] ?? k, detail: d });
  for (const p of b.people) {
    const stem: Record<string, string> = {
      identity: `${p.name} is`,
      appearance: `${p.name} looks`,
      wardrobe: `${p.name} wears`,
      distinctive_features: `${p.name} has`,
    };
    for (const [k, d] of Object.entries(p.fields)) out.push({ path: `${p.id}.${k}`, label: stem[k] ?? k, detail: d });
  }
  for (const l of b.places) {
    const stem: Record<string, string> = {
      geography: `the place "${l.name}" is`,
      landmarks: `in "${l.name}" there is`,
      light: `the light in "${l.name}" is`,
    };
    for (const [k, d] of Object.entries(l.fields)) out.push({ path: `${l.id}.${k}`, label: stem[k] ?? k, detail: d });
  }
  for (const t of b.things) {
    const stem: Record<string, string> = { appearance: `"${t.name}" looks like`, materials: `"${t.name}" is made of` };
    for (const [k, d] of Object.entries(t.fields)) out.push({ path: `${t.id}.${k}`, label: stem[k] ?? k, detail: d });
  }
  return out;
}

/** Camera words at the start of an action belong to the framing, not to what happens. */
const CAMERA_LEAD =
  /^(?:(?:a|an|the)\s+)?(?:extreme\s+)?(?:wide|close|medium|long|establishing)\b(?:[-\s]?(?:up|shot|view|angle)\b)?\s*(?:(?:on|of|at|showing)\b)?\s*[:,—-]?\s*/i;

export function stripCamera(action: string): string {
  const stripped = action.replace(CAMERA_LEAD, '');
  if (stripped === action || stripped.length < 3) return action;
  return stripped[0].toUpperCase() + stripped.slice(1);
}

export function moments(b: Breakdown): Moment[] {
  return b.scenes.flatMap((s) => s.moments);
}
