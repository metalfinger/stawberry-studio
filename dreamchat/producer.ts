// The producer: turns the conversation into Strawberry Studio's breakdown. It does the work
// the host assistant does in Strawberry by hand (PLAYBOOKS.md: Director, Story Architect,
// Production Designer), in the background, as two parallel calls.
//
// Every detail it writes is marked as said by the person, or guessed. Jev then checks each
// "said" against the person's own messages (ground.ts). Strawberry's own rule is that missing
// facts are unknown, not invented defaults presented as the user's decisions.
import { SHAPES, type Blocking, type Move, type Shape, type Side, type Spot } from './blocking';
import { type ChatMessage, callDeepseek, type Thinking } from './llm';

/** A detail and whether the person said it. `null` when nobody knows and nothing is needed. */
export type Detail = { value: string | null; said: boolean; evidence?: number | null };

export type Person = {
  id: string;
  name: string;
  /** The dreamer themself, when they are seen in the pictures. */
  is_dreamer: boolean;
  protagonist: boolean;
  /** The entry stands for more than one person: a family, a couple, a crowd of friends. */
  several?: boolean;
  /** The group entry this person belongs to, when they also have one of their own. */
  part_of?: string;
  /**
   * Seen only as a crowd (an audience, passers-by, the other people in a room): described in the
   * moments' words and never sketched. No one would know them again.
   */
  extras?: boolean;
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
  /** What the camera faces: a landmark of the place ("the window"). Tells sides of a room apart. */
  looks_at: string;
  feeling: string;
  /** The one thing the picture must carry. */
  visual_point: string;
  /** What this moment does in the story (Strawberry's beat.purpose). */
  purpose: string;
  /**
   * The producer's view: whether it carries straight on from the moment before in its scene.
   * Only a hint: which earlier moment it must match is decided by Jev (`from`).
   */
  continues: boolean;
  /** The earlier moment this one must match to read as continuous, or null. Decided by Jev. */
  from?: string | null;
  /** What this moment changes that later pictures must keep showing (Strawberry's continuity.after). */
  leaves: { who: string; what: string; now: string; whole?: boolean }[];
  /**
   * An intended dream discontinuity from the moment before, only when the person told it: "the
   * kitchen becomes a station platform around her". Continuity must not smooth it away.
   */
  shift: string;
  /**
   * What in this moment is impossible, or wrong the way dreams are, that the dreamer simply
   * accepted: drawn as plain fact, never as an effect. Empty when nothing in it is.
   */
  dream?: string;
  /** Earlier moments in the same place that face the same side of it. Decided by Jev. */
  sameSide?: string[];
  /** The changes still in force here for what is in view, from earlier moments. Decided by Jev. */
  states?: State[];
  key: boolean;
  said: boolean;
};

/** A lasting change in force at a moment: who changed, what, into what, and since which moment. */
/** `whole`: it has turned into something else altogether (Jev's reading; the words' where it gave none). */
export type State = { who: string; what: string; now: string; since: string; whole?: boolean };

export type Scene = {
  id: string;
  title: string;
  place: string;
  mood: string;
  moments: Moment[];
  /** Its floor plan, made before any picture: where everyone and everything is (see blocking.ts). */
  blocking?: Blocking;
};

export type StyleOption = {
  id: string;
  /** Plain words a person would use: "like an old woodcut print". */
  name: string;
  /** What every picture is made as: "a photograph", "soft pencil on paper". */
  medium?: string;
  /**
   * How this way of drawing makes every picture feel like a dream, from how this one felt to
   * them: technique only ("light that comes from nowhere; edges a little too soft to hold").
   */
  dream?: string;
  /**
   * Every picture is made in shades of one colour (one ink, a cyanotype, black and white): a
   * colour a look names is then a shade of it, never its own hue.
   */
  one_colour?: boolean;
  line: string;
  tokens: string[];
  palette_hex: string[];
  lighting_rules: string;
};

/** Words that say what a picture is made as. */
const MEDIUM =
  /\b(photo\w*|camera|film still|pencil|graphite|charcoal|ink|watercolou?r|gouache|oil paint\w*|oils|acrylic|paint\w*|pastel|crayon|woodcut|linocut|etching|engraving|print|collage|clay|stop.motion|3d render\w*|cgi|anime|cartoon|comic|manga|sketch\w*|drawing|drawn|illustrat\w*|mosaic|stained glass|embroider\w*|pixel art|vector|poster|screen.?print|risograph|animation|animated)\b/i;

/**
 * What every picture of a style is made as. A style that names no medium ("the dream exactly as
 * it looked to you") left it to the model, and a photographic storyboard turned into an ink
 * drawing at its fifth picture (23 Sep): one that names none is a photograph, as the eye saw it.
 */
export function mediumOf(style: StyleOption): string {
  if (style.medium?.trim()) return style.medium.trim();
  if (MEDIUM.test(style.name)) return style.name;
  return style.tokens.find((t) => MEDIUM.test(t)) ?? 'a photograph';
}

/** A colour's hue in degrees, or null for a grey. */
export function hueOf(hex: string): number | null {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(r, g, b);
  const c = max - Math.min(r, g, b);
  if (c < 20) return null;
  const h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return (h * 60 + 360) % 360;
}

/** The hue a style's palette is made in, or null when it is only greys. */
export function paletteHue(style: StyleOption): number | null {
  const hues = style.palette_hex.map(hueOf).filter((h): h is number => h !== null);
  if (!hues.length) return null;
  const x = hues.reduce((a, h) => a + Math.cos((h * Math.PI) / 180), 0);
  const y = hues.reduce((a, h) => a + Math.sin((h * Math.PI) / 180), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Whether a style makes everything in shades of one colour. A style that does not say is read
 * from its palette: greys only, or a single hue in anything but a photograph (a photograph in cold
 * light still has warm skin; an ink wash in one blue drew "medium brown hair" auburn, 24 Sep).
 */
export function oneColour(style: StyleOption): boolean {
  if (style.one_colour !== undefined) return style.one_colour;
  if (!style.palette_hex.length) return false;
  const hues = style.palette_hex
    .map(hueOf)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  if (!hues.length) return true;
  if (/photo|camera|film still/i.test(mediumOf(style))) return false;
  // The arc the hues span: the whole circle less the widest gap between neighbours.
  const gaps = hues.map((h, i) => (i ? h - hues[i - 1] : h + 360 - hues[hues.length - 1]));
  return 360 - Math.max(...gaps) <= 40;
}

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
- Scenes in story order. A new scene when the place or the time changes. Where the story goes somewhere, even briefly and nearby (a drive to a bridge, a walk down the road, another room), that is its own place with its own id: pictures of one place are drawn to match each other, so a place that is really two would put the bridge in front of the house.
- Each scene holds moments in order. A moment is ONE still picture: one decisive visible action, where it is, who and what is in view. A beat with two actions is two moments.
- 3 to 10 moments for the whole dream, in the person's order and words. A dream that is a single image still gets at least 3: where it is (wide), the thing itself, and the detail that matters most (close). Framing the same told moment differently is not inventing.
- "action" says what happens or what is there, in plain words. Never the camera: "wide view of", "close-up of" and the like belong in "distance", not in the action.
- A moment is one instant, the one a single picture shows. Where the dream tells steps one after another ("goes up the stairs, then down the other side", "walks down the hallway and turns the corner to find a room"), each step that matters is its own moment, or the moment is the one instant that shows it best (at the top of the stairs, the second flight going down ahead). Never "then" inside one moment.
- Write a moment's action, feeling, visual_point, shift and dream in the third person, the dreamer as "the dreamer" or "they" ("the dreamer stands at the window"), never "you" and never "he" or "she": they are instructions for a picture, to a picture "you" is whoever looks at it, and the dreamer's own sketch shows who they are.
- "visible" lists only people ids; objects go in "things".
- Mark exactly one moment "key": true — the moment they said stays with them, or would pause on.
- "eyes": "dreamer" when we see through the dreamer's eyes, "outside" when the dreamer is seen. Follow what they said about how they were in it.
- "distance": "close", "medium" or "wide" — how near the viewer is to what matters.
- "feeling" is what the moment should feel like, in their words where possible. "visual_point" is the one thing the picture must carry. "purpose" is what the moment does in the story, in a few words: "sets the scene", "the turn", "the payoff", "the waking".
- "leaves": what this moment changes in how someone, something or a place LOOKS, that later pictures must keep showing, as {"who": an id, "what": the part or attribute, "now": its new state}. For example, when someone's hair turns white: {"who": "p1", "what": "hair", "now": "white"}; when a room floods: {"who": "l1", "what": "water", "now": "up over the tops of the desks"}, and again where it rises further, said or only implied (a boat rowed up to a window high in the wall means the water has risen to it). Never where someone is or what they are doing (walking off, sitting down, being at the far end): only how they look. Empty when nothing about a look lasts.
- "looks_at": what the camera faces in the place, a landmark of it in a few words ("the window", "the door to the hall", "the stove"). Two pictures facing the same side of a place get the same words. Through the dreamer's eyes it is what they face.
- "shift": only where the person said the dream itself jumped: the place, a person or a thing abruptly became something else. Say what changes, from their words: "the kitchen becomes a station platform around her". Empty otherwise; an ordinary cut to a new place or time is not a shift.
- "dream": what in this moment is impossible, or wrong the way dreams are, that the dreamer simply accepted, in their words: something that has become something else, a place larger or smaller than it could be, someone who is two people at once, a feeling that does not fit what is happening. Empty when nothing in the moment is. It is drawn as plain fact, so never invent one to make it dreamlike.
- "continues": true when the moment carries straight on from the one before it in the same scene (the same people and things, a moment later), false when it jumps: a new place, a new time, or a different part of the story. The first moment of each scene is false.

## People, places, things (Production Designer)
- Every person and every animal that appears in any moment gets a person entry, however briefly they appear: a whale that swims past once is "the whale", with its kind, size and skin in "appearance" (left out, the whale filling the library's aisle had no picture of its own, 26 Sep), and every moment it is in lists it in "visible".
- Only real presences get an entry. Ambient things (fog, glow, rain) belong to the look or a scene's mood. Clothes and body features belong to the person, never separate things.
- People seen only as a crowd (an audience, passers-by, the other people in a room) are one entry with "several": true and "extras": true: they are described in the moments' words and never drawn on their own.
- The dreamer is a person entry ("is_dreamer": true) only if they are seen in some moment ("eyes": "outside").
- One "protagonist": true — the person the dream is most about.
- "several": true when one entry stands for more than one person (a family, a couple, a band). When someone in such a group matters on their own and has their own entry, give them "part_of": the group's id, and leave them out of the group's own fields: they are drawn from their own entry.
- A thing gets an entry only if someone holds or uses it, or it is the main subject of a moment. Parts of a place (a window, shelves, a door), what is seen through them (the moon, the sky) and collections (floating books, leaves) are the place's landmarks, never things. Most dreams have 0-2 things.
- "name" is how the person would say it, in lowercase with its article: "the old man", "the flooded library", "the boat". The dreamer is "you".
- People fields: identity (who they are to the dreamer), appearance (age, build, face, hair), wardrobe, distinctive_features. Places: geography (what kind of place, inside or out, layout), landmarks (what's in it), light. Things: appearance, materials.
- A profile is how someone or something ordinarily looks, before anything happens to it in the dream. What happens to them (a part of them changing into something else, a room going dark, a person starting to glow) is a moment's action, never part of the profile: it would be drawn on every picture of them. If someone's hands turn to stone, their profile describes ordinary hands (a guess if they didn't say), and the stone belongs to the moments.

## Look (Director)
- "look" is what the dream looked like to them: colours, light, texture.
- "world_logic": what is possible in this dream's world (what the dreamer simply accepted).

## Output
JSON only, exactly this shape (ids like p1, l1, t1, s1, m1, a/b/c/d):
{"title": "", "logline": "", "look": {"colours": D, "light": D, "texture": D}, "world_logic": "",
 "people": [{"id": "p1", "name": "", "is_dreamer": false, "protagonist": true, "several": false, "extras": false, "part_of": "", "fields": {"identity": D, "appearance": D, "wardrobe": D, "distinctive_features": D}}],
 "places": [{"id": "l1", "name": "", "fields": {"geography": D, "landmarks": D, "light": D}}],
 "things": [{"id": "t1", "name": "", "fields": {"appearance": D, "materials": D}}],
 "scenes": [{"id": "s1", "title": "", "place": "l1", "mood": "", "moments": [{"id": "m1", "action": "", "visible": ["p1"], "things": ["t1"], "place": "l1", "eyes": "dreamer", "distance": "medium", "looks_at": "", "feeling": "", "visual_point": "", "purpose": "", "continues": false, "leaves": [], "shift": "", "dream": "", "key": false, "said": true}]}],
 "unknowns": ["what the dream leaves open that a picture will need"]}
where D is {"value": "..." or null, "said": true or false}. Moment "said" is true when the person described that moment happening.`;

const STYLE_SYSTEM = `You help turn a person's dream into pictures. From the conversation below, propose how the pictures could be drawn. Return JSON only:
{"style_options": [{"id": "a", "name": "", "medium": "", "dream": "", "one_colour": false, "line": "", "tokens": [""], "palette_hex": ["#000000"], "lighting_rules": ""}]}

- Exactly 4 options: 3 ways suited to this dream's feeling and look, then "d", as close as possible to how the dream looked to them.
- "name": plain words anyone would understand, like "an old woodcut print" or "soft watercolour". No art jargon, no artist names.
- "medium": what every picture is made as, in a few plain words: "a photograph", "soft pencil on paper", "watercolour on rough paper", "flat black ink". For "d", when the dream looked like real life, "a photograph".
- "dream": one technique phrase for how this way of drawing makes every picture feel like a dream, taken from how this dream felt to them, even when it looked real: "light that comes from nowhere and casts no clear shadow", "the stillness of a held breath", "edges a little too soft to hold". How it is drawn only: nothing from the story, no objects, no fog or haze added just to say "dream".
- "one_colour": true when every picture is made in shades of a single colour (one ink, a cyanotype, black and white), so hair, skin and clothes are shades of it too; false when things keep their own colours, however the light tints them.
- "line": one plain sentence on how it would feel.
- "tokens": 4-6 concrete technique phrases a renderer can follow, each under 120 characters ("flat black ink with hard carved edges" is a token; "dreamy style" is not). Tokens say how everything is drawn, never what is in the dream: no objects, materials, creatures or anything else from it, or every picture will be made of it.
- "palette_hex": 4-6 colours as #RRGGBB.
- "lighting_rules": 2-3 sentences on light, shadow and edges, true of every place in the dream, indoors and out: never tied to one place ("light seems to come from within the room" read as at odds with the flooded city outside). Keep the light they described in every option (a sun straight overhead with hard black shadows stays exactly that), only drawn in the option's own way.`;

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

const REVISE_ITEM = `The person was shown a profile of something from their dream and answered it (their latest message). Apply what they changed or added, and nothing else. The fields say how it looks: a remark about a pose, a movement or what someone is doing belongs to the moments, never here ("he's too still" changes nothing in his look). Return JSON only: {"fields": {...}} with exactly the same keys as the profile, each value a short plain phrase, or null when nothing is known. Keep every value they didn't change exactly as it was.`;

const REWORD_LOOK = `A reference picture of something from a person's dream is about to be drawn from the profile below, and a checker holding it back found a problem in it. Rewrite the profile so it can be drawn without guessing and without contradiction. It describes only how it ordinarily looks: never other people, what anyone does, or what happens in the dream (where the dream changes them later, their age or clothes afterwards is never their look: "What changes later" lists it), and never how it stands or is framed in a picture (standing, a three-quarter view, face clearly visible): each picture decides that. Keep every fact the person gave, reworded only so it describes a look ("the lever the driver turns" is "a lever at the front"). A place is described as itself, on its own: never as inside, beyond or part of another place ("a village just inside the house" is "a village"), and never by who is in it. Fill what is missing with a plain, ordinary guess that fits the conversation: for a person their age, build, hair and clothes with colours; for an animal what kind it is, its size, and its coat and colours (never clothes); for a group who is in it and how each looks; for a place what kind it is, its layout, what stands in it and its light; for a thing its shape, size, materials and colours. Return JSON only: {"fields": {...}} with exactly the same keys as the profile, each value a short plain phrase.`;

/**
 * A sketch's profile, reworded before anything is paid for, when the gate found it unclear or at
 * odds with itself: a streetcar with "no people in it" was described by "the lever the conductor
 * turns", and a place by its landmarks alone (24 Sep). What the person said keeps its meaning.
 */
export async function rewordLook(
  name: string,
  kind: 'character' | 'location' | 'prop',
  fields: Record<string, Detail>,
  prompt: string,
  findings: string[],
  transcript: string,
  // What changes about them later in the dream: reworded from the conversation, Tomas became "a boy
  // of ten years old" in who he is, though he is an adult until the lift (hotel orchard, 26 Sep).
  later: string[] = [],
): Promise<Record<string, Detail> | null> {
  const current = Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, d.value]));
  const res = await callDeepseek(
    [
      { role: 'system', content: REWORD_LOOK },
      {
        role: 'user',
        content: `The conversation:\n\n${transcript}\n\nWhat the checker found:\n${findings.map((f) => `- ${f}`).join('\n')}\n\nThe ${kind === 'character' ? 'person' : kind === 'location' ? 'place' : 'thing'}: ${name}\nIts profile:\n${JSON.stringify(current)}${later.length ? `\n\nWhat changes later (never part of this profile, which is how it looks before that): ${later.join('; ')}.` : ''}\n\nThe instructions the picture would be drawn from:\n\n${prompt}`,
      },
    ],
    { json: true, thinking: PRODUCER_THINKING },
  );
  let next: Record<string, unknown> = {};
  try {
    next = ((JSON.parse(res.content) as { fields?: Record<string, unknown> }).fields ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out: Record<string, Detail> = {};
  let changed = false;
  for (const [k, d] of Object.entries(fields)) {
    const v = typeof next[k] === 'string' ? (next[k] as string).trim().slice(0, 300) : '';
    if (v && !VAGUE.test(v) && v !== d.value) {
      // A fact they gave stays theirs, reworded; a gap filled is our guess.
      out[k] = { value: v, said: d.said && !!d.value };
      changed = true;
    } else out[k] = d;
  }
  return changed ? out : null;
}

export const BLOCK = `You are a storyboard artist making the floor plan of each scene of a dream before anything in it is drawn, so that every picture of the scene agrees about where everyone and everything is.

For each scene, seen from above: its "front" (the side of the place its people face, or its main side, in a few words: "the screen", "the window wall", "the wall with the stove"), how big the place is ("room": [across, deep] in metres; a tiny room is about 2 by 2, a hallway about 1.2 across, a street or a field as far as the moments need), whether it is indoors (a room, whose walls are the plan's edges; a street, a village or a field is outdoors, even when someone looks at it from a doorway: then they stand at its front edge) and how high its ceiling is, and a spot for every person and thing in it. x runs across the place from its left side (0) to its right side, for someone facing its front; y runs from its front (0) to its back.
- Keep everything the dream says: who sits or stands next to whom and on which side, what is next to what, who is in front of or behind whom, what faces what, how big a place is beside what fills it. Someone "by" or "at" something is within a metre of it.
- Where it says nothing, choose what is ordinary for such a place, at the distances it really has (a cinema's front row is a few metres from its screen; people side by side sit about 0.8 apart), and put people who are together side by side.
- "faces" is whom or what someone faces: an id from this plan, or "front", "back", "left" or "right". People talking together face each other; someone doing something at a thing (cooking at a stove, working at a desk, looking out of a window) faces it; otherwise people face the front. Each person is "sitting", "standing" or "lying", as they are in the scene.
- A thing's spot is its middle, with its "size" in metres: [across, deep, high], across being side to side as it faces, and its "shape": what it is to whoever is at it. "seat": sat on (a sofa, a bench, a bed). "vehicle": ridden in (a car, a boat, a cart). "ground": stood and walked on, as high as it rises (a street or a road 0.05, a bridge or a stage as high as its deck). "steps": climbed (stairs), as high as they climb (a flight up to the next floor about 2.7, a few steps 0.5). "block": anything else. Every thing and fixture has a size and a shape; a street, a road or a river runs as far as the place goes. Someone sitting on a seat, riding in a vehicle, or standing on ground or steps has their spot on it; nobody stands inside a block.
- A thing someone holds or carries (a lantern, a string of balloons, a phone) has "held_by": their id, as it is at the scene's first moment. When it changes hands, is picked up or is put down during the scene (handed over, given, set down), give it a move at that moment with its new "held_by" ("" once it is put down, with where it lies): {"id": "t1", "held_by": "p1"}.
- The place's own fixtures that the moments happen by, face or act on (an autoclave, a stove, the stairs, a bridge, a door, a counter) get a spot too, with an id x1, x2 and so on, their "name" in a few words, their size and their shape. They are part of the place, not people or things of the story. A hallway, a corridor, a corner, a doorway or an aisle is not a fixture: it is the shape of the place itself (a hallway is a place about 1.2 across and as long as it is). Only when a moment faces one ("faces": "the corner") does it get a small spot, with that name, where it is, so the camera can face it.
- A crowd or an audience is one spot with "many": true, at the middle of where they are, with "spread": [across, deep] in metres for the ground they fill, how they are ("sitting" in rows of seats, "standing"), and "count" when the dream says how many ("a couple of people": 2).
- A moment "seen_through_the_eyes_of" someone has them in it, where they are: their spot is the camera, facing what the moment faces.
- Someone or something the moments see only out of a window or through an opening, out past the place's edges (a tractor in the field below a lighthouse room, a ship out at sea, a figure across the street), is not in the place and gets no x or y: give it {"id": "t3", "beyond": "front"}, with the side of the place it is seen on ("front", "back", "left" or "right").
- A moment in which someone goes up, down, across, along or through something (climbs the stairs, crosses the bridge, walks down the hallway) shows them partway: their spot, or their move for that moment, is on it or in it, not beside it.
- When someone or something moves during the scene (walks off, comes back, sits down, drives away), give where it is in each moment's picture where that has changed, by the moment's id: "moves": {"m2": [{"id": "p1", "x": 4, "y": 8, "faces": "back", "pose": "standing"}]}. A move holds until its next one, so someone who comes back needs a move back: in the moment they return they are where it has them (in front of whoever they come back to, facing them). People riding in something move with it.
- When a scene's moments happen in more than one place (a moment's "place" differs from its scene's), plan the scene's own place as above, and give every other place its own plan in "places", by the place's id, with the same fields, for the moments that happen there.
- A scene given with "fix" was planned before ("previous") and failed the checks "fix" lists. Plan it again so that none of them holds, keeping what was right.

Return JSON only: {"scenes": [{"id": "s1", "front": "", "room": [8, 6], "indoors": true, "ceiling": 3.5, "spots": [{"id": "p1", "x": 4, "y": 3, "faces": "p2", "pose": "standing"}, {"id": "t1", "x": 4, "y": 3, "size": [1.9, 0.9, 0.85], "shape": "seat"}, {"id": "x1", "name": "the stove", "x": 2, "y": 0.5, "size": [0.8, 0.6, 0.9], "shape": "block"}, {"id": "p3", "x": 5, "y": 5, "many": true, "pose": "sitting", "spread": [7, 2]}], "moves": {}, "places": {"l4": {"front": "", "room": [2, 2], "indoors": true, "ceiling": 2.4, "spots": [], "moves": {}}}}]}`;

/**
 * Each scene's floor plan, made before any picture: where everyone and everything is. The moment
 * seen through the dreamer's eyes was drawn from the aisle when the harness knew only "through the
 * dreamer's eyes, facing the roller coaster" (24 Sep); with a plan, what each camera sees is worked
 * out in code. A scene the model gives no plan for, or a plan missing someone, is left without one.
 */
export async function blockScenes(
  b: Breakdown,
  /** Plan only these scenes again, each told what its last plan failed. */
  again: { only?: string[]; fix?: Record<string, string[]> } = {},
): Promise<{ breakdown: Breakdown; notes: string[] }> {
  const out: Breakdown = structuredClone(b);
  const notes: string[] = [];
  const brief = {
    people: b.people.map((p) => ({ id: p.id, name: p.is_dreamer ? 'the dreamer' : p.name, crowd: !!p.extras })),
    things: b.things.map((t) => ({ id: t.id, name: t.name })),
    places: b.places.map((l) => ({
      id: l.id,
      name: l.name,
      layout: l.fields.geography?.value,
      has: l.fields.landmarks?.value,
    })),
    scenes: b.scenes
      .filter((sc) => !again.only || again.only.includes(sc.id))
      .map((sc) => ({
        id: sc.id,
        place: sc.place,
        moments: sc.moments.map((m) => ({
          id: m.id,
          place: m.place,
          action: m.action,
          who: throughEyes(b, m) ? [...m.visible, throughEyes(b, m)!] : m.visible,
          ...(throughEyes(b, m) ? { seen_through_the_eyes_of: throughEyes(b, m) } : {}),
          things: m.things,
          faces: m.looks_at,
        })),
        ...(again.fix?.[sc.id] ? { fix: again.fix[sc.id], ...(sc.blocking ? { previous: sc.blocking } : {}) } : {}),
      })),
  };
  let raw: unknown;
  try {
    // Made in the background while the chat goes on, so it thinks: without, a woman who came
    // back was left at the far end of the room for the rest of the scene (24 Sep).
    const res = await callDeepseek(
      [
        { role: 'system', content: BLOCK },
        { role: 'user', content: JSON.stringify(brief) },
      ],
      { json: true, thinking: 'low' },
    );
    raw = JSON.parse(res.content);
  } catch (e) {
    notes.push(`blocking: ${String(e).slice(0, 160)}`);
    return { breakdown: out, notes };
  }
  return readBlocking(out, raw, notes);
}

/**
 * The dreamer, for a moment seen through their eyes that does not list them: they are there, as the
 * camera. Left out of what the planner was told, the lighthouse's view out of the window and the
 * tractor stopping at the field's edge had no dreamer on their plans, and no camera (25 Sep).
 */
export function throughEyes(b: Breakdown, m: Moment): string | undefined {
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  return m.eyes === 'dreamer' && dreamer && !m.visible.includes(dreamer) ? dreamer : undefined;
}

/**
 * The floor plans a model gave, checked against the dream: only its own people and things and the
 * place's fixtures, whom or what someone faces only if it is in the plan, moves only for moments
 * of the scene. A scene missing someone is left without a plan.
 */
export function readBlocking(
  b: Breakdown,
  raw: unknown,
  notes: string[] = [],
): { breakdown: Breakdown; notes: string[] } {
  const out: Breakdown = structuredClone(b);
  const given = list((raw as { scenes?: unknown })?.scenes);
  for (const sc of out.scenes) {
    const g = given.find((x) => (x as { id?: unknown })?.id === sc.id) as Record<string, unknown> | undefined;
    if (!g) continue;
    // The scene's own place, and every other place its moments happen in, each planned apart.
    const elsewhere = [...new Set(sc.moments.map((m) => m.place).filter((pl) => !!pl && pl !== sc.place))];
    const main = readPlan(
      b,
      g,
      sc.moments.filter((m) => !elsewhere.includes(m.place)),
      `scene ${sc.id}`,
      notes,
    );
    if (!main) continue;
    const given_ = (g.places && typeof g.places === 'object' ? g.places : {}) as Record<string, unknown>;
    const places: Record<string, Blocking> = {};
    for (const pl of elsewhere) {
      const sub = given_[pl];
      if (!sub || typeof sub !== 'object') continue;
      const plan = readPlan(
        b,
        sub as Record<string, unknown>,
        sc.moments.filter((m) => m.place === pl),
        `scene ${sc.id}, ${pl}`,
        notes,
      );
      if (plan) places[pl] = plan;
    }
    sc.blocking = { ...main, ...(Object.keys(places).length ? { places } : {}) };
  }
  return { breakdown: out, notes };
}

/** Numbers in metres, all above nothing and none past `most`, or none. */
const metres = (v: unknown, n: number, most: number) =>
  Array.isArray(v) && v.length === n && v.every((m) => Number.isFinite(Number(m)) && Number(m) > 0)
    ? v.map((m) => Math.min(most, Number(m)))
    : undefined;

/**
 * One place's floor plan as a model gave it, checked against the moments there: only their people
 * and things and the place's fixtures, on the place's own ground, whom or what someone faces only
 * if it is in the plan, moves only at those moments. Left without a plan where someone is missing.
 */
function readPlan(
  b: Breakdown,
  g: Record<string, unknown>,
  moments: Moment[],
  label: string,
  notes: string[],
): Blocking | null {
  const ids = new Set(
    moments.flatMap((m) => [...m.visible, ...m.things, ...(throughEyes(b, m) ? [throughEyes(b, m)!] : [])]),
  );
  const room = metres(g.room, 2, 200) as [number, number] | undefined;
  const [w, d] = room ?? [10, 10];
  const onX = (v: unknown) => Math.max(0, Math.min(w, Number(v)));
  const onY = (v: unknown) => Math.max(0, Math.min(d, Number(v)));
  // A fixture of the place: its own id and name, as the plan gives it.
  const fixture = (x: Record<string, unknown>) =>
    typeof x.id === 'string' && /^x\d+$/.test(x.id) && typeof x.name === 'string' && !!x.name.trim();
  const given = list(g.spots).map((x) => x as Record<string, unknown>);
  // Someone who comes in partway is given only by where they are in the moments they are in: the
  // dreamer reaching the top of the lighthouse had moves and no spot, and the room was left without
  // a plan in three runs of three (25 Sep). They start where they are first seen.
  const movesGiven = (g.moves && typeof g.moves === 'object' ? g.moves : {}) as Record<string, unknown>;
  for (const m of moments)
    for (const x of list(movesGiven[m.id]).map((y) => y as Record<string, unknown>)) {
      if (typeof x.id !== 'string' || !b.people.some((p) => p.id === x.id) || given.some((y) => y.id === x.id))
        continue;
      if (!Number.isFinite(Number(x.x)) || !Number.isFinite(Number(x.y))) continue;
      given.push({ ...x });
    }
  // A thing someone holds is where they are. Given only as {"id": "t1", "held_by": "p2"}, the
  // brother's lantern had no spot in two runs of five, and the night bus was left without a plan
  // (25 Sep): it takes its holder's spot, and settling puts it at their side.
  for (const x of given) {
    if ((Number.isFinite(Number(x.x)) && Number.isFinite(Number(x.y))) || typeof x.held_by !== 'string') continue;
    const holder = given.find((h) => h.id === x.held_by && b.people.some((p) => p.id === h.id));
    if (holder && Number.isFinite(Number(holder.x)) && Number.isFinite(Number(holder.y)))
      Object.assign(x, { x: holder.x, y: holder.y });
  }
  // Seen only out past the place's edges: never on the plan, whose every spot is inside it.
  const outside: Record<string, Side> = {};
  for (const x of given)
    if (typeof x.id === 'string' && ids.has(x.id) && SIDES.includes(x.beyond as Side)) outside[x.id] = x.beyond as Side;
  // A place that is the inside of one of its things ("the tractor cab" of "the red tractor") has no
  // spot for that thing: planned as a vehicle standing in its own cab, the dreamer and the driver
  // were "in the red tractor, partly hidden behind" it, seen from three metres off in the open, and
  // every shot read as at odds with its moment (lighthouse, 26 Sep). The place is enclosed.
  const placeNames = [...new Set(moments.map((m) => m.place))].map(
    (id) => b.places.find((l) => l.id === id)?.name ?? '',
  );
  const inside = b.things.find((t) => {
    const head =
      t.name
        .toLowerCase()
        .split(/\s+(?:of|with|from|in|on)\s+/)[0]
        .trim()
        .split(/\s+/)
        .at(-1) ?? '';
    return ids.has(t.id) && head.length > 2 && placeNames.some((n) => new RegExp(`\\b${head}\\b`, 'i').test(n));
  })?.id;
  const spots: Spot[] = given
    .filter(
      (x) =>
        typeof x.id === 'string' &&
        !outside[x.id] &&
        x.id !== inside &&
        (ids.has(x.id) || fixture(x)) &&
        Number.isFinite(Number(x.x)) &&
        Number.isFinite(Number(x.y)),
    )
    .map((x): Spot => {
      const person = b.people.some((p) => p.id === x.id);
      const many = x.many === true || !!b.people.find((p) => p.id === x.id)?.extras;
      const size = metres(x.size, 3, 60);
      const spread = metres(x.spread, 2, 200);
      return {
        id: x.id as string,
        x: onX(x.x),
        y: onY(x.y),
        kind: person ? 'person' : 'thing',
        ...(typeof x.faces === 'string' && x.faces ? { faces: x.faces } : {}),
        ...(many ? { many: true } : {}),
        ...(person && ['sitting', 'standing', 'lying'].includes(x.pose as string)
          ? { pose: x.pose as Spot['pose'] }
          : {}),
        // A flight of steps rises at most 0.8 m for every metre it runs, as a steep real one does: a
        // spiral staircase given as 12 m up in 4 m put the dog running up it far above the picture.
        ...(!person && size
          ? {
              size: (x.shape === 'steps' ? [size[0], size[1], Math.min(size[2], size[1] * 0.8)] : size) as [
                number,
                number,
                number,
              ],
            }
          : {}),
        ...(!person && SHAPES.includes(x.shape as Shape) ? { shape: x.shape as Shape } : {}),
        ...(!person && typeof x.held_by === 'string' && b.people.some((p) => p.id === x.held_by)
          ? { heldBy: x.held_by }
          : {}),
        ...(many && spread ? { spread: spread as [number, number] } : {}),
        ...(many && Number.isInteger(x.count) && Number(x.count) >= 1 && Number(x.count) <= 500
          ? { count: Number(x.count) }
          : {}),
        ...(fixture(x) ? { fixture: true, name: str(x.name, 60) } : {}),
      };
    });
  // Whom or what someone faces must be in the plan: "t1", in a room with no t1, turned two
  // people talking to face a wall (24 Sep).
  const known = new Set(spots.map((s) => s.id));
  const faces = (f: unknown) =>
    typeof f === 'string' && (['front', 'back', 'left', 'right'].includes(f) || known.has(f)) ? f : undefined;
  for (const s of spots) if (s.faces && !faces(s.faces)) delete s.faces;
  for (const s of spots) if (s.heldBy && !known.has(s.heldBy)) delete s.heldBy;
  const at = new Set(moments.map((m) => m.id));
  // Who and what can move: people, and things that are not the place's own (a car drives off).
  const movers = new Set(spots.filter((s) => !s.many && !s.fixture).map((s) => s.id));
  const moves: Record<string, Move[]> = {};
  for (const [mid, list_] of Object.entries(
    (g.moves && typeof g.moves === 'object' ? g.moves : {}) as Record<string, unknown>,
  )) {
    if (!at.has(mid)) continue;
    // A thing changing hands needs no place of its own: it is where its new holder is.
    const handed = (x: Record<string, unknown>) =>
      typeof x.held_by === 'string' &&
      !b.people.some((p) => p.id === x.id) &&
      (x.held_by === '' || known.has(x.held_by));
    const mv = list(list_)
      .map((x) => x as Record<string, unknown>)
      .filter(
        (x) =>
          typeof x.id === 'string' &&
          movers.has(x.id) &&
          ((Number.isFinite(Number(x.x)) && Number.isFinite(Number(x.y))) || handed(x)),
      )
      .map((x): Move => {
        const was = spots.find((s) => s.id === x.id)!;
        const fixed = Number.isFinite(Number(x.x)) && Number.isFinite(Number(x.y));
        return {
          id: x.id as string,
          x: fixed ? onX(x.x) : was.x,
          y: fixed ? onY(x.y) : was.y,
          ...(faces(x.faces) ? { faces: faces(x.faces) } : {}),
          ...(['sitting', 'standing', 'lying'].includes(x.pose as string) ? { pose: x.pose as Spot['pose'] } : {}),
          ...(handed(x) ? { heldBy: x.held_by as string } : {}),
        };
      });
    if (mv.length) moves[mid] = mv;
  }
  const missing = [...ids].filter((id) => !spots.some((s) => s.id === id) && !outside[id] && id !== inside);
  if (missing.length) {
    notes.push(`blocking: ${label} has no spot for ${missing.join(', ')}; left without a plan`);
    return null;
  }
  const indoors = g.indoors === true || !!inside;
  const ceiling = Number(g.ceiling);
  return {
    front: str(g.front, 60) || 'the front',
    spots,
    ...(room ? { room } : {}),
    ...(Object.keys(moves).length ? { moves } : {}),
    ...(indoors ? { indoors: true } : {}),
    ...(indoors && Number.isFinite(ceiling) && ceiling >= 2 && ceiling <= 30 ? { ceiling } : {}),
    ...(Object.keys(outside).length ? { outside } : {}),
    ...(inside ? { inside } : {}),
  };
}

const SIDES: Side[] = ['front', 'back', 'left', 'right'];

const CHANGES = `You are the script supervisor of a dream being drawn as pictures, one picture per moment, in order. Each moment lists in "leaves" the changes to how someone or something looks that the pictures after it must keep showing. Read every moment's action: where it changes how someone or something looks in a way that lasts into the moments after it (a part of them replaced, turned into something else, a new colour or shape), or how a place looks (a room filling with water, the lights going out, snow covering a street: its "who" is the place's id), and its "leaves" does not already have that change, give it, at the moment it first happens, and again wherever it changes further, said or only implied by what happens (the water up over the desks, then, once a boat is rowed up to a window high in the wall, risen to that window). Never where someone is or what they are doing: only how they look. Say "now" as what it looks like, in a few words from the dream.

Return JSON only: {"add": [{"moment": "m3", "who": "p1", "what": "head", "now": "an irregular block of glittering ice"}]}, with "add" empty when nothing is missing.`;

/** A lasting change to how someone or something looks, at the moment it first happens. */
export type Change = { moment: string; who: string; what: string; now: string; whole?: boolean };

/**
 * The lasting changes the breakdown missed, read from each moment's own words by a script
 * supervisor: a woman came back with a block of ice for a head, and only the horse's head it became
 * was recorded, so the melting was told to keep her face (24 Sep). Only changes to people and
 * things of the dream, at moments of it, not already there.
 */
export async function superviseChanges(b: Breakdown): Promise<Change[]> {
  const moments = b.scenes.flatMap((sc) => sc.moments);
  const brief = {
    people: b.people.map((p) => ({ id: p.id, name: p.is_dreamer ? 'the dreamer' : p.name })),
    things: b.things.map((t) => ({ id: t.id, name: t.name })),
    // A place changes too: the library filled with water, and the pictures after it showed a dry
    // floor under the boat (flooded library, 26 Sep).
    places: b.places.map((l) => ({ id: l.id, name: l.name })),
    moments: moments.map((m) => ({
      id: m.id,
      action: m.action,
      who: m.visible,
      things: m.things,
      place: m.place,
      leaves: m.leaves,
    })),
  };
  try {
    const res = await callDeepseek(
      [
        { role: 'system', content: CHANGES },
        { role: 'user', content: JSON.stringify(brief) },
      ],
      { json: true, thinking: 'low' },
    );
    const ids = new Set([...b.people.map((p) => p.id), ...b.things.map((t) => t.id), ...b.places.map((l) => l.id)]);
    return list((JSON.parse(res.content) as { add?: unknown }).add)
      .map((x) => x as Record<string, unknown>)
      .filter(
        (x) =>
          typeof x.moment === 'string' &&
          moments.some((m) => m.id === x.moment) &&
          typeof x.who === 'string' &&
          ids.has(x.who) &&
          typeof x.what === 'string' &&
          !!x.what.trim() &&
          typeof x.now === 'string' &&
          !!x.now.trim(),
      )
      .map((x) => ({ moment: x.moment as string, who: x.who as string, what: str(x.what, 40), now: str(x.now, 120) }))
      .filter(
        (c) =>
          !(moments.find((m) => m.id === c.moment)!.leaves ?? []).some(
            (l) => l.who === c.who && bareWords(l.what) === bareWords(c.what),
          ),
      );
  } catch {
    return [];
  }
}

/** A change's part, for comparing: "the head", "head" and "Head" are one. */
const bareWords = (x: string) =>
  x
    .toLowerCase()
    .replace(/^(the|a|an|its|their|his|her)\s+/, '')
    .trim();

/**
 * The changes the supervisor found, written into the moments they happen at, and carried into every
 * later moment of the dream that shows who changed, until the same part of them changes again. Found
 * after the continuity was linked, the ice head was written at the moment she came back and never
 * reached the melting after it (24 Sep).
 */
export function addChanges(b: Breakdown, changes: Change[]): void {
  const all = b.scenes.flatMap((sc) => sc.moments);
  for (const c of changes) {
    const at = all.findIndex((x) => x.id === c.moment);
    const m = all[at];
    if (!m) continue;
    m.leaves ??= [];
    if (m.leaves.some((l) => l.who === c.who && bareWords(l.what) === bareWords(c.what))) continue;
    m.leaves.push({ who: c.who, what: c.what, now: c.now, ...(c.whole !== undefined ? { whole: c.whole } : {}) });
    for (const later of all.slice(at + 1)) {
      if ((later.leaves ?? []).some((l) => l.who === c.who && bareWords(l.what) === bareWords(c.what))) break;
      // A place's change carries into every later moment there: the flooded library's water was
      // never carried, and the boat sat on a dry floor (26 Sep).
      if (![...later.visible, ...later.things, later.place].includes(c.who)) continue;
      const kept = (later.states ?? []).filter((st) => !(st.who === c.who && bareWords(st.what) === bareWords(c.what)));
      later.states = [
        ...kept,
        { who: c.who, what: c.what, now: c.now, since: c.moment, ...(c.whole !== undefined ? { whole: c.whole } : {}) },
      ];
    }
  }
  // Found while planning, a look where it is first shown is its look, not a change.
  foldFirstLooks(b);
  // A change carried from a moment that no longer has it is gone: read again while planning, Tomas's
  // "age and clothing" became his "body", and the old one, still carried, matched no picture of him,
  // so the moment after was held (hotel orchard, 26 Sep).
  for (const m of all)
    if (m.states?.length)
      m.states = m.states.filter((st) => {
        const from = st.since ? all.find((x) => x.id === st.since) : undefined;
        return !from || (from.leaves ?? []).some((l) => l.who === st.who && bareWords(l.what) === bareWords(st.what));
      });
}

const SHOT = `You are the director of photography for one picture from someone's dream. An image model will draw it from your shot description, and follows it closely. Below are the moment and the fixed facts of the shot, worked out from a floor plan of the place: where the camera is, which way it looks, who and what is where in the picture (left, middle or right; close or far), and what is outside it.

Write the shot as a cinematographer briefs a camera crew, in four to six plain sentences:
1. The shot: a first-person view or seen from outside; a lens (a focal length); the camera's height and angle.
2. Foreground, middle distance and background: exactly what is in each, and where across the picture (left third, middle, right third), with how each person is placed (sitting, standing) as the moments so far have them and turned as the facts say. The background is the side of the place the camera looks toward. Keep every fact given, as given: the facts are read off a rendered layout of this exact shot, so never move anything to another side of the picture, never make it bigger or smaller, never bring in what is outside it, never leave out what is in it. Someone close to the camera is softer than what the picture is about, which is in sharp focus.
3. The light, from a real source in the place (a screen, a window, a lamp) on the side the facts put it.
4. What is just outside the picture, briefly, only where it tells the eye where it is.

Plain, concrete words an illustrator can draw from; nothing from the story that is not in the facts, no mood words, no camera jargon that could be drawn (no frame lines, no labels). Return JSON only: {"shot": ""}.`;

/**
 * A moment's shot as its director of photography would brief it, from the geometry worked out on
 * the floor plan: code knows exactly where everything is, a model knows how a shot is put into
 * words. Given the dreamer's view as bare facts in one sentence, the picture came back facing the
 * screen, the default for a theater (24 Sep). Every name the facts put in the picture must be in the
 * brief, or it is not used.
 */
export async function shotFor(
  moment: string,
  facts: string,
  medium: string,
  mustName: string[],
  before: string[] = [],
): Promise<string | null> {
  try {
    const res = await callDeepseek(
      [
        { role: 'system', content: SHOT },
        {
          role: 'user',
          content: `The picture is made as: ${medium}.\n\n${before.length ? `What has happened in this place so far:\n${before.map((x) => `- ${x}`).join('\n')}\n\n` : ''}The moment: ${moment}\n\nThe fixed facts of the shot:\n${facts}`,
        },
      ],
      { json: true, thinking: 'low' },
    );
    const shot = (JSON.parse(res.content) as { shot?: unknown }).shot;
    if (typeof shot !== 'string' || !shot.trim()) return null;
    const bare = (x: string) =>
      x
        .toLowerCase()
        .replace(/^(the|a|an)\s+/, '')
        .replace(/\s*\(.*\)\s*$/, '')
        .trim();
    return mustName.every((n) => shot.toLowerCase().includes(bare(n))) ? shot.trim().slice(0, 1400) : null;
  } catch {
    return null;
  }
}

const FIX = `A person looked at a picture of a moment from their dream and said what is wrong with it. Below are the instructions its next version will be drawn from. If they already give what the person asked for, return an empty fix. Otherwise write what the next picture must show so that it is right, as one or two sentences an illustrator can follow who sees only those instructions: what the picture shows and how, in its own terms, agreeing with the instructions. Never refer to earlier pictures, "the last frame" or "again", nor to what was wrong before; keep strictly to what they asked, adding nothing. Return JSON only: {"fix": ""}.`;

/**
 * A person's correction as an instruction for the picture it corrects. Quoted as they said it, "the
 * left and right sofas are still the same as in the last two frames" meant little to a model that
 * sees no earlier frames, and read to the gate as the redraw contradicting itself (24 Sep).
 */
export async function fixFrom(words: string, instructions: string): Promise<string | null> {
  try {
    const res = await callDeepseek(
      [
        { role: 'system', content: FIX },
        {
          role: 'user',
          content: `What they said about its picture: "${words}"\n\nThe instructions its next version will be drawn from:\n\n${instructions}`,
        },
      ],
      { json: true, thinking: PRODUCER_THINKING },
    );
    // Empty when the instructions already give it (a worked-out view is the fix for "not from my
    // eyes"); a guess without them read "the dreamer on the roller coaster, things tilted".
    const fix = (JSON.parse(res.content) as { fix?: unknown }).fix;
    return typeof fix === 'string' ? fix.trim().slice(0, 400) : null;
  } catch {
    return null;
  }
}

const REWORD_MOMENT = `One moment of a person's dream is about to be drawn from the instructions below, and a checker holding it back found a problem in them. Find what in the moment's own words causes it (its action, the one thing it must show, its feeling, its part in the story, the dream's jump, or what in it is dreamlike): a detail that contradicts where it happens or who is there, something that cannot be in the picture, or something left unsaid. Rewrite every one of those words that takes part in the problem (if who is in the picture changed, each field that still names someone no longer there), as little as possible, keeping strictly to the dream as told and adding nothing it did not have. Write them in the third person, the dreamer as "the dreamer" or "they", never "you" (to a picture "you" is whoever looks at it) and never "he" or "she" (their sketch shows who they are; a "him" beside a woman's sketch reads as someone else). Never mention the camera or a viewer. Return JSON only: {"fields": {"action": "", "visual_point": "", "feeling": "", "purpose": "", "shift": "", "dream": ""}} with only the fields you changed; {"fields": {}} if the problem is not in these words.`;

/**
 * A moment's words, reworded before anything is paid for, when the gate found its instructions
 * at odds ("gripping the edge of your seat" on the roof of a train, 24 Sep). Only what the checker
 * points at changes; text is nearly free, a picture is not.
 */
export async function rewordMoment(
  prompt: string,
  findings: string[],
  fields: Record<string, Detail>,
  // Who is in the picture and who is not: told only "take the conductor out", a rewording kept
  // "in sync with the conductor's hand" (24 Sep).
  cast: { in: string[]; out: string[] } = { in: [], out: [] },
): Promise<Record<string, Detail> | null> {
  // Every word of the moment a picture is told, the jump and the dream's own strangeness included:
  // a jump left "…and you are on top of it" when the rest was put in the third person (24 Sep).
  const words = ['action', 'visual_point', 'feeling', 'purpose', 'shift', 'dream'];
  const current = Object.fromEntries(words.map((k) => [k, fields[k]?.value ?? null]));
  const res = await callDeepseek(
    [
      { role: 'system', content: REWORD_MOMENT },
      {
        role: 'user',
        content: `What the checker found:\n${findings.map((f) => `- ${f}`).join('\n')}\n\n${cast.in.length ? `Who is in this picture: ${cast.in.join(', ')}.\n` : ''}${cast.out.length ? `Not in this picture, so never named in its words: ${cast.out.join(', ')}.\n\n` : '\n'}The moment's words:\n${JSON.stringify(current)}\n\nThe instructions the picture would be drawn from:\n\n${prompt}`,
      },
    ],
    { json: true, thinking: PRODUCER_THINKING },
  );
  let next: Record<string, unknown> = {};
  try {
    next = ((JSON.parse(res.content) as { fields?: Record<string, unknown> }).fields ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out = { ...fields };
  let changed = false;
  for (const k of words) {
    const v = typeof next[k] === 'string' ? (next[k] as string).trim().slice(0, 600) : '';
    if (v && v !== fields[k]?.value) {
      out[k] = { value: v, said: false };
      changed = true;
    }
  }
  return changed ? out : null;
}

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

const PROPOSE_LOOK = `Someone from a person's dream is about to be drawn, and nothing is known of how they look: the person left it to us. From the conversation, fill in ONLY the empty fields of their profile with a plain, specific, ordinary guess a picture can keep to: age range, hair (colour, length, how it's worn), build, and clothes with their colours. Nothing from the story's events (no transformations, nothing that happens to them): where the dream changes them later (they turn young or old, their clothes change), the profile is how they look before that, never the later age or clothes, and "What changes later" below lists those changes. Nothing remarkable unless the conversation says so, nothing that contradicts what the conversation says, and never how they stand or are framed in a picture (standing, a three-quarter view, face clearly visible): each picture decides that. Return JSON only: {"fields": {...}} with exactly the same keys as the profile, each value a short plain phrase; keep every value already given exactly as it is.`;

const PROPOSE_LOOK_THING = `Something from a person's dream is about to be drawn, and little is known of how it looks: the person left it to us. From the conversation, fill in ONLY the empty fields of its profile with a plain, specific, ordinary guess a picture can keep to: for a place, how it is laid out and what stands in it; for a thing, its shape, size, materials and colours, as it would be where the dream has it: a part of something looks like that thing's own part, as it would really be made. Nothing from the story's events, nothing remarkable unless the conversation says so, and nothing that contradicts what the conversation says. Return JSON only: {"fields": {...}} with exactly the same keys as the profile, each value a short plain phrase; keep every value already given exactly as it is.`;

/**
 * Words for a look nobody described. A person drawn only from an image drifts as soon as they
 * are seen another way: the dreamer, seen from behind, came back as someone else (23 Sep). The
 * words ride along in every picture of them; they are our guesses, and marked so.
 */
export async function proposeLook(
  name: string,
  fields: Record<string, Detail>,
  transcript: string,
  // The others drawn on their own: "the family" was given a baby in a yellow onesie while "the
  // baby" had her own sketch in a white one, and a moment would have shown two (24 Sep).
  others: string[] = [],
  // A place or thing with no description was sketched from its name alone: "the lever" came back
  // a see-saw bar while the streetcar's own sketch had a crank handle (24 Sep).
  kind: 'character' | 'location' | 'prop' = 'character',
  // What happens to them later in the dream, which their look is from before: Tomas, who turns ten
  // in the lift, was guessed "age about 10, grey shorts and shirt school uniform" and sketched a boy
  // from the first picture (hotel orchard, 26 Sep).
  later: string[] = [],
): Promise<Record<string, Detail>> {
  // A guess that says nothing ("young, but no specific features remembered") is filled in too;
  // what they said is never touched.
  const open = (d: Detail) => !d.value || (!d.said && VAGUE.test(d.value));
  const current = Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, open(d) ? null : d.value]));
  const ask = async (extra: string) => {
    const res = await callDeepseek(
      [
        { role: 'system', content: (kind === 'character' ? PROPOSE_LOOK : PROPOSE_LOOK_THING) + extra },
        {
          role: 'user',
          content: `The conversation:\n\n${transcript}\n\nThe profile of ${name}:\n${JSON.stringify(current)}${
            others.length
              ? `\n\nDrawn on their own, each in their own picture, so never part of this profile: ${others.join(', ')}.`
              : ''
          }${
            later.length
              ? `\n\nWhat changes later (about ${name}, never part of this profile, which is how they look before it): ${later.join('; ')}.`
              : ''
          }`,
        },
      ],
      { json: true, thinking: PRODUCER_THINKING },
    );
    try {
      return ((JSON.parse(res.content) as { fields?: Record<string, unknown> }).fields ?? {}) as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  };
  const usable = (v: unknown) => {
    const raw = typeof v === 'string' ? v.trim() : '';
    // "none" is not a look, and "hair: undefined" is a template, not a guess.
    return raw && !/^(none|n\/a|nothing)\.?$/i.test(raw) && !VAGUE.test(raw) ? raw.slice(0, 300) : null;
  };
  // Specific enough to hold a person steady from picture to picture: their hair, and colours.
  const specific = (k: string, v: string | null) =>
    !!v &&
    (k === 'appearance'
      ? /\bhair\b/i.test(v)
      : k === 'wardrobe'
        ? /\b(black|white|grey|gray|blue|navy|green|brown|beige|red|yellow|cream|olive|tan|pink|purple|orange|khaki|denim)\b/i.test(
            v,
          )
        : true);
  let next = await ask('');
  // Once more if it left placeholders, or too little to draw the same person twice.
  if (
    kind === 'character' &&
    Object.entries(fields).some(
      ([k, d]) => open(d) && ['appearance', 'wardrobe'].includes(k) && !specific(k, usable(next[k])),
    )
  )
    next = {
      ...next,
      ...(await ask(
        ' Your last answer left placeholders. They will be drawn, so every empty field needs a specific, ordinary guess even if nothing is remembered: pick a plain adult look (age range, hair colour and length, build) and everyday clothes with their colours. Never "undefined", "unknown", "indeterminate" or "not remembered".',
      )),
    };
  const out: Record<string, Detail> = {};
  for (const [k, d] of Object.entries(fields)) {
    const v = usable(next[k]);
    out[k] = open(d) && v ? { value: v, said: false } : d;
  }
  return out;
}

/** "What" changed, when it is a position or an activity rather than a look. */
export const POSITION =
  /^(location|position|place|where|whereabouts|posture|pose|activity|action|movement|direction|distance|mood|emotion|feeling|expression)$/i;

/** A value that says nothing a picture can show. */
// A whole value that says nothing ("none", "n/a") is no look either: written to the engine, "none"
// for a friend's distinctive features was refused as a placeholder and her sketch never drawn (24 Sep).
export const VAGUE =
  /^\s*(?:none|nothing|n\/a|null|nil|-+|—)\s*\.?\s*$|\b(undefined|unknown|unclear|indeterminate|unspecified|ambiguous|indistinct|nondescript|hazy memory|blends? into|(?:none|nothing|not) (?:notable|remarkable|special|distinctive|in particular)|no (?:distinctive|distinguishing|notable|remarkable) features?|not (?:remembered|specified|known|sure|clear|described|given)|no specific|(?:can't|cannot|don't|do not) remember)\b/i;

/** A change of what something is altogether, not of a part of it: its form, its shape, itself. */
export const WHOLE =
  /^\s*(?:its |their |the )?(?:form|shape|whole|whole body|body and all|self|itself|themselves|kind|what it is|nature|entire \w+)\s*$/i;

/**
 * Whether a change turns something into something else altogether: as Jev read it when the change
 * was recorded, and from its words only where Jev gave no reading.
 */
export const isWhole = (st: { what: string; whole?: boolean }) => st.whole ?? WHOLE.test(st.what);

/** A moment in a few words, for a label: its first nine. */
export function momentLabel(action: string): string {
  const words = action.replace(/[.,;:—-]+$/, '').split(/\s+/);
  return words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : words.join(' ');
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

  // A crowd made a person anyway, told not to ("the crowd", "other people in the theater"): its
  // sketch of twenty people "standing side by side" read as contradicting "seated in rows" (24 Sep).
  const crowd = (o: Record<string, unknown>) =>
    CROWD.test(
      `${str(o.name, 120)} ${str(((o.fields ?? {}) as Record<string, { value?: unknown }>).identity?.value, 200)}`,
    );
  const people: Person[] = list(b.people).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const f = (o.fields ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, 20) || `p${i + 1}`,
      name: str(o.name, 120) || `person ${i + 1}`,
      is_dreamer: o.is_dreamer === true,
      protagonist: o.protagonist === true,
      several: o.several === true || crowd(o),
      part_of: str(o.part_of, 20),
      extras: o.extras === true || crowd(o),
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

  // One name, one subject: a car ridden in can be both a place (its inside) and a thing (the car),
  // but under one name the two sketches are drawn as one, and a sketch of the car came back as
  // its seats (23 Sep). The place is named for what it is.
  const lower = (x: string) => x.toLowerCase().replace(/^(the|a|an)\s+/, '');
  for (const pl of places)
    if (things.some((t) => lower(t.name) === lower(pl.name))) {
      notes.push(`place "${pl.name}" shares its name with a thing; renamed to its inside`);
      pl.name = `inside ${pl.name}`;
    }

  const personIds = new Set(people.map((p) => p.id));
  const placeIds = new Set(places.map((p) => p.id));
  const thingIds = new Set(things.map((t) => t.id));
  const firstPlace = places[0]?.id ?? '';

  let momentNo = 0;
  const scenes: Scene[] = list(b.scenes).map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const scenePlace = placeIds.has(str(o.place)) ? str(o.place) : firstPlace;
    const moments: Moment[] = list(o.moments).map((m, j) => {
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
        looks_at: str(mo.looks_at, 80),
        feeling: str(mo.feeling, 240),
        visual_point: str(mo.visual_point, 240).replace(CAMERA_CLAUSE, '').trim(),
        purpose: str(mo.purpose, 120),
        // Code decides the edge case: a scene's first moment continues from nothing.
        continues: j > 0 && mo.continues !== false,
        leaves: list(mo.leaves)
          .map((x) => (x ?? {}) as Record<string, unknown>)
          .filter((x) => [...personIds, ...placeIds, ...thingIds].includes(str(x.who)) && str(x.what) && str(x.now))
          // A change of where someone is, or what they do, is the moment's action, not a look to carry.
          .filter((x) => !POSITION.test(str(x.what)))
          .map((x) => ({ who: str(x.who), what: str(x.what, 60), now: str(x.now, 200) }))
          .slice(0, 6),
        // The first picture of the dream has nothing to jump from.
        shift: momentNo > 1 ? str(mo.shift, 200) : '',
        dream: str(mo.dream, 240),
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
  const breakdown: Breakdown = {
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
  };
  notes.push(...mergeBecomings(breakdown));
  notes.push(...foldFirstLooks(breakdown));
  notes.push(...completeViews(breakdown));
  return { breakdown, notes };
}

/**
 * How someone or something looks where it is first shown is its look, not a change: the orchard's
 * apples glowing "like little lamps", given as a change at the moment the lift opened onto it, never
 * reached its sketch, and every picture after it drew plain trees (hotel orchard, 26 Sep). Folded
 * into its profile, as told. Turning into something else stays a change.
 */
export function foldFirstLooks(b: Breakdown): string[] {
  const notes: string[] = [];
  const all = moments(b);
  for (const m of all) {
    const keep: NonNullable<Moment['leaves']> = [];
    for (const l of m.leaves ?? []) {
      const place = (b.places ?? []).find((x) => x.id === l.who);
      const thing = (b.things ?? []).find((x) => x.id === l.who);
      const person = (b.people ?? []).find((x) => x.id === l.who);
      const item = place ?? thing ?? person;
      if (l.whole || !item || person?.is_dreamer || hasBefore(b, m.id, l.who)) {
        keep.push(l);
        continue;
      }
      const field = place ? 'landmarks' : thing ? 'appearance' : 'distinctive_features';
      const d = (item.fields as Record<string, Detail>)[field] ?? { value: null, said: false };
      const add = bareWords(l.what) && !l.now.toLowerCase().includes(bareWords(l.what)) ? `${l.what} ${l.now}` : l.now;
      if (!(d.value ?? '').toLowerCase().includes(l.now.toLowerCase()))
        (item.fields as Record<string, Detail>)[field] = {
          ...d,
          value: d.value ? `${d.value}; ${add}` : add,
          said: true,
        };
      notes.push(`${item.name}: "${add}" is how it looks where it is first shown, not a change`);
      for (const later of all)
        if (later.states?.length)
          later.states = later.states.filter(
            (st) => !(st.since === m.id && st.who === l.who && bareWords(st.what) === bareWords(l.what)),
          );
    }
    m.leaves = keep;
  }
  return notes;
}

/** "becomes a tall grey heron" is "a tall grey heron": what it is now, not the turning. */
export const BECOMING =
  /^\s*(?:it\s+|she\s+|he\s+|they\s+)?(?:has\s+|have\s+|is\s+|are\s+)?(?:becomes?|became|turns?\s+into|turned\s+into|changes?\s+into|changed\s+into|transforms?\s+into|transformed\s+into|morphs?\s+into|morphed\s+into|is\s+now|are\s+now|now)\s+/i;

/**
 * Someone who turns into someone or something the dream also lists as a person of its own: one
 * individual, not two. "Mrs Okafor becomes a tall grey heron", with "the heron" a person too, drew the
 * heron beside her change and in the classroom before it (heron dream, 26 Sep). The later moments
 * show the one who changed; the other is dropped. A change's "now" says only what it is.
 */
export function mergeBecomings(b: Breakdown): string[] {
  const notes: string[] = [];
  // Said as a turning ("transformed into a grey heron"), it is a turning into something else: the
  // whole of them, whatever part it names ("body").
  const turned = new Set<object>();
  for (const m of moments(b))
    for (const l of m.leaves ?? []) {
      const bare = l.now.replace(BECOMING, '');
      if (bare !== l.now) {
        l.now = bare;
        turned.add(l);
      }
    }
  for (const m of moments(b))
    for (const l of m.leaves ?? []) {
      if (!(l.whole ?? (isWhole(l) || turned.has(l)))) continue;
      const who = b.people.find((p) => p.id === l.who);
      if (!who) continue;
      const others = b.people.filter((p) => p.id !== l.who && !p.is_dreamer && !p.extras);
      const as = others.find((p) => {
        const head = p.name
          .toLowerCase()
          .replace(/[^a-z\s]/g, ' ')
          .trim()
          .split(/\s+/)
          .at(-1);
        return !!head && head.length > 2 && new RegExp(`\\b${head}s?\\b`, 'i').test(l.now);
      });
      if (!as) continue;
      // Both in one moment are two: someone watching the heron that the teacher is not.
      if (moments(b).some((x) => x.visible.includes(as.id) && x.visible.includes(who.id))) continue;
      for (const x of moments(b)) {
        x.visible = [...new Set(x.visible.map((id) => (id === as.id ? who.id : id)))];
        for (const y of x.leaves ?? []) if (y.who === as.id) y.who = who.id;
      }
      b.people = b.people.filter((p) => p.id !== as.id);
      notes.push(`${as.name} is what ${who.name} turns into: one person, not two`);
    }
  return notes;
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
        medium: str(so.medium, 80),
        dream: str(so.dream, 160),
        ...(typeof so.one_colour === 'boolean' ? { one_colour: so.one_colour } : {}),
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

/**
 * Camera words anywhere in it: which way someone is turned to the camera, and where it is seen from.
 * "The grey heron stands facing the blackboard, its back to the camera", with the floor plan turning
 * her round as the dream says, read as the shot at odds with itself, and was never drawn (heron
 * dream, 26 Sep). Where the camera stands is the plan's to decide.
 */
const CAMERA_CLAUSE =
  /,\s*(?:(?:with\s+)?(?:its|his|her|their)\s+back\s+(?:turned\s+)?to\s+the\s+(?:camera|viewer)|(?:facing|towards?|turned\s+to)\s+the\s+(?:camera|viewer)|(?:as\s+)?seen\s+from\s+(?:behind|the\s+front|the\s+side|above|below|the\s+back)(?:\s+(?:of\s+)?(?:them|her|him|it))?|from\s+the\s+(?:camera|viewer)'?s?\s+(?:point\s+of\s+view|view))\b/gi;

export function stripCamera(action: string): string {
  const lead = action.replace(CAMERA_LEAD, '');
  const stripped = (lead === action || lead.length < 3 ? action : lead)
    .replace(CAMERA_CLAUSE, '')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (stripped === action || stripped.length < 3) return action;
  return stripped[0].toUpperCase() + stripped.slice(1);
}

export function moments(b: Breakdown): Moment[] {
  return b.scenes.flatMap((s) => s.moments);
}

/**
 * Whether a change has a before: its subject is in a moment earlier than the one it changes in
 * (the dreamer always is). Recorded where someone or something is first shown, it is how they look,
 * not a change: "the Pied-Piper man's appearance becomes a man with curly hair" in the moment he
 * appears. Asked of Jev without the moments before, such descriptions read as changes (0.36-0.52)
 * as often as real ones (0.42-0.68); code knows the order of the moments.
 */
export function hasBefore(b: Breakdown, momentId: string, who: string): boolean {
  if (b.people.find((p) => p.id === who)?.is_dreamer) return moments(b).findIndex((m) => m.id === momentId) > 0;
  const all = moments(b);
  const at = all.findIndex((m) => m.id === momentId);
  return all
    .slice(0, Math.max(0, at))
    .some((m) => m.visible.includes(who) || m.things.includes(who) || m.place === who);
}

/** People who are only ever a crowd. */
export const CROWD =
  /\b(crowds?|audiences?|onlookers|passers-?by|spectators|bystanders|strangers|(?:other|many|lots of|a lot of|some|several) people|people (?:everywhere|around))\b/i;

/**
 * The things each moment shows, completed from its own words: a thing is in view where its change
 * happens, where the moment names what it has become, or where it is named and no other thing
 * shares its name. The sofa that became a roller coaster was listed in neither the moment it
 * changed in nor the one showing the roller coaster, so neither was drawn from its sketch (24 Sep).
 */
export function completeViews(b: Breakdown): string[] {
  const notes: string[] = [];
  const bare = (x: string) =>
    x
      .toLowerCase()
      .replace(/^(the|a|an)\s+/, '')
      .trim();
  const head = (x: string) => bare(x).split(/\s+/).at(-1) ?? '';
  const says = (text: string, words: string) =>
    words.length > 2 && new RegExp(`\\b${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(text);
  const now = new Map<string, State>();
  for (const m of moments(b)) {
    const text = `${m.action} ${m.visual_point ?? ''}`;
    for (const t of b.things) {
      if (m.things.includes(t.id)) continue;
      const changes = (m.leaves ?? []).some((l) => l.who === t.id);
      const become = now.get(t.id);
      const unique = b.things.filter((x) => head(x.name) === head(t.name)).length === 1;
      if (
        changes ||
        (become && says(text, bare(become.now))) ||
        says(text, bare(t.name)) ||
        (unique && says(text, head(t.name)))
      ) {
        m.things.push(t.id);
        notes.push(`${m.id} shows ${t.name}`);
        // Brought into view here, it comes as it last was: a change made earlier still holds.
        if (become && !changes && !(m.states ?? []).some((st) => st.who === t.id))
          m.states = [...(m.states ?? []), become];
      }
    }
    for (const l of m.leaves ?? [])
      if (b.things.some((t) => t.id === l.who))
        now.set(l.who, {
          who: l.who,
          what: l.what,
          now: l.now,
          since: m.id,
          ...(l.whole !== undefined ? { whole: l.whole } : {}),
        });
  }
  return notes;
}
