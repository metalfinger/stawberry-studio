// The moments: one frame per cut, drawn from the approved sheets of everything in it.
//
// The prompt is a rendering of the cut's own fields, never hand-written, and carries what the
// overnight Strawberry runs learned (autoloop/cuts.py): a shot size is a word to a director and
// nothing to a generator, so say how much of the frame the subject fills; a room referenced from
// a sheet comes back mirrored unless told which side its walls are on; every detail of what is
// in view is said out loud, and the style tokens are quoted word for word.
import { type ContinuityPlan, type PlanRef, pictureName } from './continuity';
import type { Breakdown, Moment, StyleOption } from './producer';
import { BECOMING, isWhole, momentLabel, oneColour, VAGUE, WHOLE } from './producer';

// Kept here too for older imports.
export { isWhole, WHOLE };
import {
  coloursIn,
  groupMembers,
  inShades,
  isAnimal,
  isGroup,
  type Item,
  LOOK,
  type Shape,
  shapeOf,
  styleBlock,
  toldColours,
  withoutPose,
} from './sheets';

export { withoutPose };

/** Where the line that says who "you" is goes, when anything told to the picture says "you". */
const YOU = '\u0000you';

/** A phrase ended as one sentence, however the model ended it. */
const sentence = (text: string) => `${text.trim().replace(/[.!?;,:\s]+$/, '')}.`;

const FRAMING: Record<Moment['distance'], string> = {
  close: 'The subject fills nearly the whole frame edge to edge; the background is a thin strip and little more.',
  medium: 'The subject occupies about half the frame height, with the space around them clearly visible.',
  wide: 'The whole space is in frame and the subject, if any, is small within it.',
};

// A "little round convertible" came back with a real maker's badge on its bonnet (23 Sep).
// Said as what is there rather than what is not: the model is prompted best by describing what is
// wanted ("an empty street", not "no cars"), its makers say.
const NO_WORDS = 'Every surface in it is free of writing, logos and brand badges: signs, pages and screens stay blank.';
const NO_WORDS_EDIT =
  'Do not write any words, letters, numbers or labels anywhere in the image, and no logos or brand badges.';

/** Who and what in a moment has turned into something else entirely: drawn from no sketch. */
export function turnedInto(frame: Item): Set<string> {
  const plan = frame.frame?.plan;
  return new Set([...(plan?.own ?? []), ...(plan?.states ?? [])].filter(isWhole).map((st) => st.who));
}

/** A thing named with its article: "turned into roller coaster" read as broken English. */
// "turned into a transformed into a grey heron": what it is now, never the turning (26 Sep).
export const aNoun = (raw: string) => {
  const x = raw.replace(BECOMING, '').trim();
  return /^(a|an|the|some|this|that|his|her|their|its|one|two|three|several|many|[0-9])\b/i.test(x)
    ? x
    : `${/^[aeiou]/i.test(x) ? 'an' : 'a'} ${x}`;
};

/** The frame's shape in words, as sent in its settings: the model's own examples say both. */
const SHAPE_WORDS: Record<Shape, string> = {
  '16:9': 'a landscape 16:9 frame',
  '4:3': 'a landscape 4:3 frame',
  '2:3': 'a portrait 2:3 frame',
  '1:1': 'a square frame',
};

/**
 * Writing the dream itself contains, from quoted words in the moment: 'zikery' on a board.
 * Told only that writing was allowed, the zikery board came back reading "KITCHEN", the
 * place's own name (23 Sep); the exact word, spelled out, is the only writing allowed.
 */
/** Words just before a quote that make it speech. */
const SPOKEN =
  /\b(?:say|says|said|saying|asks?|asked|asking|shouts?|shouted|whispers?|whispered|calls?(?: out)?|called(?: out)?|tells?|told|mutters?|muttered|repl(?:y|ies|ied)|answers?|answered|sings?|sang|yells?|yelled|cr(?:y|ies|ied)(?: out)?|barks?|barked)\s*[,:]?\s*$/i;
/** Words just before a quote that put it on something to read. */
const WRITTEN_ON =
  /\b(?:reads?|reading|written|printed|painted|carved|spelled|spelt|signs?|board|poster|label|note|card|screen|page|letter|banner|plate|slats?|headline|title)\b/i;

export function writingIn(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const t of texts)
    // A quote mark counts only outside a word, so "the dreamer's kitchen" quotes nothing.
    for (const m of (t ?? '').matchAll(/(?<![A-Za-z])["'“‘]([^"'“”‘’]{2,40})["'”’](?![A-Za-z])/g)) {
      // What someone says is not writing: the dog looking back "as if to say 'come on'" came back
      // with COME ON painted across the sky (lighthouse, 26 Sep). What a sign or board says is.
      const before = (t ?? '').slice(Math.max(0, (m.index ?? 0) - 40), m.index);
      if (SPOKEN.test(before) && !WRITTEN_ON.test(before)) continue;
      found.add(m[1].trim());
    }
  return [...found].filter((w) => /[a-z]/i.test(w));
}

function writingLine(words: string[]): string {
  if (!words.length) return NO_WORDS;
  // "Spelled Z-I-K-E-R-Y" still came back "ZIIKERY" (23 Sep); the letter count pins it.
  const spelled = words.map((w) => {
    const letters = w.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `"${w.toUpperCase()}" (${letters.length} letters: ${letters.split('').join(' ')})`;
  });
  return `The only writing anywhere in the picture is ${spelled.join(' and ')}, exactly as spelled; every other surface is free of writing, logos and brand badges.`;
}

/** The moments to draw, one per cut, each with its entry in the continuity plan. */
export function buildFrames(b: Breakdown, plan: ContinuityPlan): Item[] {
  const all = b.scenes.flatMap((s) => s.moments);
  return all.map((m, i) => {
    const p = plan.cuts.find((c) => c.id === m.id);
    return {
      id: m.id,
      kind: 'cut',
      name: label(m.action),
      fields: {
        action: { value: m.action, said: m.said },
        feeling: { value: m.feeling || null, said: false },
        visual_point: { value: m.visual_point || null, said: false },
        purpose: { value: m.purpose || null, said: false },
        shift: { value: m.shift || null, said: !!m.shift },
        dream: { value: m.dream || null, said: !!m.dream },
      },
      status: 'waiting',
      version: 0,
      needs: p?.needs ?? [],
      frame: {
        visible: m.visible,
        things: m.things,
        place: m.place,
        distance: m.distance,
        eyes: m.eyes,
        key: m.key,
        order: i + 1,
        looksAt: m.looks_at,
        plan: p,
      },
    } satisfies Item;
  });
}

/** The ghosts the plan asks for: in-between pictures that are never shown as the dream. */
export function buildGhosts(plan: ContinuityPlan): Item[] {
  return plan.ghosts.map((g) => ({
    id: g.id,
    kind: 'ghost',
    name: g.label,
    fields: {
      change: { value: g.change, said: false },
      why: { value: g.why, said: false },
    },
    status: 'waiting',
    version: 0,
    needs: g.needs,
    ghost: g,
  }));
}

/** A short name for a moment, as the chat and the panel show it. */
const label = momentLabel;

export type FrameReference = {
  media_id: string;
  role: 'identity' | 'location' | 'prop' | 'base' | 'composition';
  instruction: string;
};

/** An earlier picture the plan draws this one from, with the plan's reason for it. */
export type PlannedInput = { use: PlanRef; item: Item };

/** The people, things and place a moment shows, by their sketches. */
export function inViewOf(frame: Item, sheets: Item[]): Item[] {
  const f = frame.frame;
  if (!f) return [];
  const byId = new Map(sheets.map((s) => [s.id, s]));
  // Whoever the dreamer's worked-out view has in the picture is in it, listed or not: the friend
  // beside them is between them and what they turn to (24 Sep).
  const sees = (f.plan?.sees ?? []).filter((id) => !f.visible.includes(id) && !f.things.includes(id));
  return [
    // Through the dreamer's own eyes the dreamer is the camera, never a face in the picture.
    ...f.visible.filter((id) => !(f.eyes === 'dreamer' && byId.get(id)?.isDreamer)).map((id) => byId.get(id)),
    ...f.things.map((id) => byId.get(id)),
    ...sees.map((id) => byId.get(id)),
    byId.get(f.place),
  ].filter((s): s is Item => !!s);
}

// "You" in an instruction to a picture is anyone, a viewer's hands included: the dreamer is "the dreamer".
const nameOf = (sheets: Item[], id: string) => {
  const s = sheets.find((x) => x.id === id);
  return s ? (s.isDreamer ? 'the dreamer' : pictureName(s.name)) : id;
};

const approved = (s: Item) => s.status === 'ready' && !!s.mediaId && (!!s.review || !!s.continuityApproved);

/**
 * The frame's prompt and its references, in the order the images are attached. Only approved
 * pictures are references: an unapproved take is never fed back in.
 *
 * The prompt opens with a manifest: each attached image, numbered, with exactly what to take
 * from it and nothing else. An edit base goes first (Image 1 is the picture to change), then the
 * sheets of who and what is in view, then ghosts, then other earlier moments. Folded into a
 * description of the scene, "keep this face" and "keep everyone as in the picture before" read
 * as two sources for one thing, and a repaired moment came back as a third person (23 Sep).
 */
export function framePrompt(
  frame: Item,
  sheets: Item[],
  style: StyleOption,
  inputs: PlannedInput[] = [],
  /** The shot's previs: grey blocks from its exact camera, rendered from the floor plan (previs.ts). */
  layout?: string,
): { prompt: string; references: FrameReference[]; depicted: string[] } {
  const f = frame.frame;
  if (!f) throw new Error(`${frame.name} is not a moment`);
  const plan = f.plan;
  const inView = inViewOf(frame, sheets);
  const seenHere = inView.filter((s) => s.kind === 'character').map((s) => s.id);
  const usable = inputs.filter((x) => approved(x.item) && x.item.mediaId);
  const base = usable.find((x) => x.use.role === 'base');
  const roomFromCut = usable.some(
    (x) => x.use.kind === 'cut' && (x.use.relation === 'same_setup' || x.use.relation === 'same_side'),
  );
  const viewGhost = usable.find((x) => x.item.ghost?.kind === 'view');
  const who = (s: Item) => (s.isDreamer ? 'the dreamer' : pictureName(s.name));

  const references: FrameReference[] = [];
  const manifest: string[] = [];
  const depicted: string[] = [];
  const attach = (media_id: string, role: FrameReference['role'], instruction: string, line: string) => {
    references.push({ media_id, role, instruction });
    manifest.push(`Image ${references.length}: ${line}`);
  };
  const pictureNo = (x: PlannedInput) => (x.item.frame ? `picture ${x.item.frame.order}` : 'an in-between reference');
  // Across a jump, only who is in both pictures keeps their place: the streetcar's conductor is
  // not on the train roof (24 Sep).
  const keepAcross = (x: PlannedInput) => {
    const shared = (x.item.frame?.visible ?? []).filter((id) => f.visible.includes(id));
    const names = shared.map((id) => nameOf(sheets, id));
    return names.length
      ? `Keep its framing and where ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} exactly; no one else from it`
      : 'Keep its framing exactly; none of the people in it';
  };
  // What the judge found invented in an earlier picture stays out of this one: a viewer's hands in
  // picture 3 were kept by the edit made from it (23 Sep).
  const strays = (x: PlannedInput) => {
    const c = x.item.check;
    const found = (c?.failedIds ?? [])
      .map((id, i) => (id === 'undeclared' ? c?.notes?.[i] : undefined))
      .filter((n): n is string => !!n);
    return found.length ? ` Leave out what it shows that is not in the dream: ${found.join('; ')}.` : '';
  };

  // Who leaves the picture being edited, and who joins it: "keep everyone in it" of a conductor
  // the dreamer said was not there (24 Sep).
  const baseWho = base?.item.frame?.visible ?? [];
  const leaving = baseWho.filter((id) => !f.visible.includes(id)).map((id) => nameOf(sheets, id));
  const joining = base ? f.visible.filter((id) => !baseWho.includes(id)).map((id) => nameOf(sheets, id)) : [];
  if (base?.item.mediaId)
    attach(
      base.item.mediaId,
      'base',
      'the same view a moment earlier: edit it into this moment',
      leaving.length || joining.length
        ? `EDIT THIS PICTURE. It is ${pictureNo(base)}, the same view a moment earlier. Keep its camera, framing, room and light exactly; who is in it changes: ${[
            ...(leaving.length
              ? [`${leaving.join(' and ')} ${leaving.length > 1 ? 'are' : 'is'} no longer there`]
              : []),
            ...(joining.length
              ? [`${joining.join(' and ')} ${joining.length > 1 ? 'are' : 'is'} there now, drawn from their sketch`]
              : []),
          ].join('; ')}. Change only that and what this moment changes.${strays(base)}`
        : `EDIT THIS PICTURE. It is ${pictureNo(base)}, the same view a moment earlier. Keep its camera, framing, room, light and everyone in it exactly as they are, faces and clothes included; change only what this moment changes.${strays(base)}`,
    );

  // The previs is the picture made real, where there is no other picture to edit: a previs frame
  // is turned into the shot, as a 3D blockout is rendered, never only consulted. Told only in words
  // where everything was from the dreamer's seat, the model drew the room from the aisle, facing
  // the screen; given the previs as a layout to consult, it kept who is left and right but moved the
  // roller coaster out onto the floor and gave the friend an armchair of her own (24 Sep).
  const mockUp = !base && layout ? layout : undefined;
  if (mockUp)
    attach(
      mockUp,
      'base',
      'the previs of this exact picture, from its camera: make it real, keeping where everyone and everything is and how big',
      "EDIT THIS PICTURE. It is a rough grey mock-up of this exact picture, rendered from the floor plan of the place through this very camera: make it real. Every labelled grey shape becomes the person or thing its label names, exactly where it is and exactly as big, looking as their own images below show; the unlabelled shapes under people become what they sit on, and the plain grey surfaces the walls, floor and ceiling of the place. Keep the camera, the framing and where everything is exactly; keep nothing of the mock-up's look: no grey clay, no outlines, no labels or letters.",
    );

  // What each sheet says in words, so the manifest ties each image to who or what it is.
  // Someone in a group's look who also has their own sketch is drawn from their own sketch: the
  // group's words about them go ("the family … baby: yellow onesie" beside the baby's own white one).
  const members = groupMembers(inView);
  const lookOf = (s: Item, keys: string[]) => {
    const own = members.filter((m) => m.group === s).map((m) => new RegExp(`\\b${m.word}s?\\b`, 'i'));
    return (
      keys
        .map((k) => s.fields[k])
        .filter((d) => !!d?.value && !VAGUE.test(d.value))
        // What was filled in is said in the style's shades; what they said keeps its colours.
        .map((d) => (d?.said ? (d.value as string) : inShades(d?.value as string, style)))
        .flatMap((v) => v.split(/;\s*/))
        .map((part) =>
          withoutPose(part, false)
            .trim()
            .replace(/[.\s]+$/, ''),
        )
        .filter((part) => part && !own.some((re) => re.test(part)))
        .join('; ')
    );
  };
  const facts: string[] = [];
  // In one colour, a sketch drawn with a colour of its own passes it on: the family's yellow onesie
  // came into a blue ink moment, and the dreamer's hair turned auburn beside it (24 Sep).
  // What the dream itself gives a colour keeps it, in its image's words too: "the yellow rowing boat
  // … drawn in this picture's shades of one colour" beside "what the dream gives a colour keeps
  // it" drew the boat pale blue in two pictures of four (flooded library, 26 Sep).
  const shadesOf = (s: Item) => {
    if (!oneColour(style)) return '';
    const told = toldColours(s);
    return told.length
      ? `, drawn in this picture's shades of one colour except what the dream itself gives a colour, which keeps it exactly: ${told.join('; ')}`
      : ", drawn in this picture's shades of one colour";
  };
  // Where each sketch went, so a group and someone in it who has their own sketch are told to be
  // one and the same: "the family" with a baby, and "the baby" (24 Sep).
  const imageOf = new Map<string, number>();
  for (const s of inView) {
    if (s.nodeId) depicted.push(s.nodeId);
    // How it looks, as its sketch was drawn: "who they are" carries the story ("a young woman
    // cooking") into every moment they are in.
    const known = lookOf(s, LOOK[s.kind]);
    // An animal is not a person: the dog, told to keep "their face, hair, build and clothes" from
    // its terrier sketch, came back a bigger dog of another breed (lighthouse m3, 26 Sep).
    const animal = isAnimal(s);
    const kind =
      s.kind === 'character'
        ? animal
          ? 'animal'
          : isGroup(s)
            ? 'people'
            : 'person'
        : s.kind === 'location'
          ? 'place'
          : 'thing';
    // Someone or something that has turned into something else entirely is no longer drawn from
    // its old sketch: its in-between picture shows what it became. The sofa's sketch beside "the
    // roller coaster that was a sofa" read as the prompt contradicting itself, and as the same
    // thing drawn twice (0.52; 0.46, 24 Sep).
    const whole = [...(plan?.own ?? []), ...(plan?.states ?? [])].find((st) => st.who === s.id && isWhole(st));
    // Everything in view is listed with its look, its image or not: said only beside the images,
    // the pictures read as less clear to Jev (0.78 against 0.82) and more likely to contradict
    // themselves (24 Sep).
    facts.push(
      whole
        ? `${who(s)} (${kind}): it has turned into ${aNoun(whole.now)}.`
        : `${who(s)} (${kind})${known ? `: ${known}` : ''}.`,
    );
    // Every sheet of what is in view always goes in: consistency starts from them.
    if (!approved(s) || !s.mediaId || whole) continue;
    if (s.kind === 'character') {
      const look = lookOf(s, ['appearance', 'wardrobe', 'distinctive_features']);
      // A change that replaces part of them overrides their sheet for that part: told to keep
      // her face, a moment drew her own face inside the block of ice that replaces her head (23 Sep).
      const changed = [...(plan?.own ?? []), ...(plan?.states ?? [])].filter((st) => st.who === s.id);
      const except = changed.length
        ? ` Except ${changed.map((st) => `their ${st.what}, which is no longer theirs: it is now ${st.now}, with nothing of the old ${st.what} inside or behind it`).join('; ')}.`
        : '';
      attach(
        s.mediaId,
        'identity',
        animal
          ? `${who(s)}: this exact animal, the same kind, size, build, coat and markings`
          : `${who(s)}: this exact person, with the same face, build and clothes`,
        animal
          ? `what ${who(s)} is${look ? ` (${look})` : ''}: its kind, its size, its build, its coat and its markings, exactly${base && baseWho.includes(s.id) ? ', as Image 1 already shows it' : ''}${shadesOf(s)}. Nothing else from it: not its pose, background or framing.${except}`
          : `who ${who(s)} ${isGroup(s) ? 'are' : 'is'}${look ? ` (${look})` : ''}: their ${changed.some((st) => /head|face/i.test(st.what)) ? 'build and clothes' : 'face, hair, build and clothes'}, exactly${base && baseWho.includes(s.id) ? ', as Image 1 already shows them' : ''}${shadesOf(s)}. Nothing else from it: not its pose, background or framing.${except}`,
      );
      imageOf.set(s.id, references.length);
    } else if (s.kind === 'location') {
      // An edit base or an earlier picture of this side sets where things stand; a view ghost shows
      // the side this frame faces. Then the sheet gives the place's materials, colours and objects.
      // With a previs, where everything stands comes from it alone: never also from the sketch or an
      // earlier picture of the place.
      const layout = plan?.sheetLayout !== false && !roomFromCut && !base && !viewGhost && !mockUp;
      const look = lookOf(s, ['geography', 'landmarks', 'light']);
      attach(
        s.mediaId,
        'location',
        layout
          ? `${who(s)}: this exact place. Keep everything in it on the sides the reference puts it; do not mirror or rearrange it`
          : `${who(s)}: its materials, colours and objects only; the layout comes from ${mockUp ? 'the previs' : base ? 'the picture being edited' : 'the earlier picture'}`,
        layout
          ? `${who(s)}${look ? ` (${look})` : ''}: the camera stands in this place. Keep everything in it where it puts it (walls, doors, paths, furniture, whatever it has), and its light; do not mirror or rearrange it.`
          : (base || roomFromCut) && !mockUp
            ? `${who(s)}${look ? ` (${look})` : ''}: only its materials, colours and objects; where things stand comes from ${base ? 'Image 1' : 'the earlier picture of this place'}.`
            : plan?.view || mockUp
              ? // Its layout pulls a view back to the one it shows: only what the place is made of,
                // and none of its objects but those the view has in the picture.
                `${who(s)}${look ? ` (${look})` : ''}: only what it is made of and its colours (its ground or floor, its walls or buildings, what stands in it). Where everything stands, and which way the picture looks, come from ${mockUp ? 'Image 1, the mock-up' : 'the shot above'}, not from this image; any of its objects the shot has outside the picture stay out of it.`
              : `${who(s)}${look ? ` (${look})` : ''}: only its materials, colours, objects and light. It shows the place from another side: this frame faces ${f.looksAt || 'the other way'}.`,
      );
    } else {
      const look = lookOf(s, ['appearance', 'materials']);
      // A part of it that has changed is no longer as its sketch shows, as for a person.
      const changed = [...(plan?.own ?? []), ...(plan?.states ?? [])].filter((st) => st.who === s.id);
      const except = changed.length
        ? ` Except its ${changed.map((st) => `${st.what}, which is no longer as it shows: it is now ${st.now}`).join('; ')}.`
        : '';
      attach(
        s.mediaId,
        'prop',
        `${who(s)}: this exact object, with the same shape and materials`,
        `${who(s)}${look ? ` (${look})` : ''}: its exact shape, materials and colours, the same in every picture${shadesOf(s)}. Nothing else from it.${except}`,
      );
    }
  }

  for (const { group, member, word } of members) {
    const g = imageOf.get(group.id);
    const m = imageOf.get(member.id);
    if (!g || !m) continue;
    manifest[g - 1] += ` The ${word} in it is ${who(member)}, drawn from Image ${m}: one ${word}, never two.`;
    manifest[m - 1] +=
      ` They are the ${word} in ${who(group)}'s picture (Image ${g}): one and the same, drawn as this image shows.`;
  }

  // One image says who each person is: their sketch. The picture they were last seen in goes in
  // only for someone whose sketch is not there. A second face image for the same person pulls the
  // model off them (an expression variant beside an identity sheet lost a character's glasses, in
  // the first Strawberry Studio), and Jev read the two as claiming the same thing (0.42-0.46 on
  // what each image is for; 0.87-0.89 with the sketch alone, 24 Sep).
  // An earlier picture is named by who and where it is, never by what happens in it: "picture 4
  // (The dreamer nearly falls off, their hands flying out to grab air)", attached to a moment of
  // the family on the roof, came back with the dreamer lunging off the train in picture 4's pose
  // (24 Sep). The number says which image it is; the action only primes it.
  const whoWhere = (x: PlannedInput) => {
    const fr = x.item.frame;
    if (!fr) return '';
    const pov = fr.eyes === 'dreamer';
    const people = fr.visible
      .filter((id) => !(pov && sheets.find((s) => s.id === id)?.isDreamer))
      .map((id) => nameOf(sheets, id));
    const parts = [
      people.join(' and '),
      fr.place ? `at ${nameOf(sheets, fr.place)}` : '',
      pov ? "through the dreamer's eyes" : '',
    ];
    const said = parts.filter(Boolean).join(', ');
    return said ? ` (${said})` : '';
  };

  const lastSeen = (x: PlannedInput, ids: string[]) => {
    const names = ids.map((id) => nameOf(sheets, id));
    return `${pictureNo(x)}${whoWhere(x)}: who ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'}, as last drawn: their face, hair, build and clothes, exactly. Nothing else from it: not its pose, background or framing.`;
  };

  // Ghosts, then earlier moments, while there is room: the model takes 14 images, and a dozen
  // leaves each one legible. A person's latest picture, the last kind added, is the first to go.
  const MAX_IMAGES = 12;
  for (const x of usable) {
    if (x === base || !x.item.mediaId || references.length >= MAX_IMAGES) continue;
    const g = x.item.ghost;
    if (g) {
      attach(
        x.item.mediaId,
        x.use.role === 'location' ? 'location' : x.use.role === 'prop' ? 'prop' : 'identity',
        x.use.carries,
        g.kind === 'view'
          ? `${nameOf(sheets, g.of)} seen facing ${g.looksAt || 'the other way'}: the side this frame faces. Keep everything in it where it puts it.`
          : g.state && isWhole(g.state)
            ? `what ${nameOf(sheets, g.of)} has turned into, ${aNoun(g.state.now)}: draw it exactly so, where ${nameOf(sheets, g.of)} was. Nothing else from it.`
            : g.of === f.place || !g.state
              ? `how ${nameOf(sheets, g.of)} looks now (${g.state?.what}: ${g.state?.now}): draw it exactly so. Nothing else from it.`
              : // Only the part that changed: "how she looks now: draw them exactly so" beside her sketch for
                // her build and clothes, and the picture being edited, gave three images one look
                // (what to take from each, 0.49, 24 Sep).
                `${nameOf(sheets, g.of)}'s ${g.state.what} as it is now (${g.state.now}): draw their ${g.state.what} exactly so, and take nothing else from it.`,
      );
      continue;
    }
    const unsketched = x.use.who?.filter((id) => !imageOf.has(id)) ?? [];
    if (x.use.who?.length && !unsketched.length) continue;
    // With the view worked out from the floor plan, the picture showing the dreamer from outside
    // would only pull its own layout back into their view.
    if (x.use.relation === 'seat' && plan?.view) continue;
    // No image goes in for its light alone: the model takes more than light from it (a moment of
    // the family drew the dreamer in the pose of the picture attached for its light, 24 Sep). The
    // light is said in words, and the place's own sketch shows it. A picture from the other side
    // goes in only for someone in it who has no sketch of their own, as who they are.
    if (x.use.role === 'lighting') {
      const own = seenHere.filter((id) => !imageOf.has(id) && (x.item.frame?.visible ?? []).includes(id));
      if (own.length)
        attach(
          x.item.mediaId,
          'identity',
          `${own.map((id) => nameOf(sheets, id)).join(' and ')}: as last drawn`,
          lastSeen(x, own),
        );
      continue;
    }
    const r = x.use.relation;
    const shows = whoWhere(x);
    const role: FrameReference['role'] = x.use.role === 'composition' ? 'composition' : 'identity';
    attach(
      x.item.mediaId,
      role,
      x.use.carries,
      (r === 'shift'
        ? f.eyes === 'dreamer' && x.item.frame?.eyes !== 'dreamer'
          ? `${pictureNo(x)}${shows}, just before the dream jumps. Keep its framing and the shapes in it where they are; the dreamer in it is now the camera, so they are not in this picture. The dream changes this: ${frame.fields.shift?.value ?? ''}.`
          : x.item.frame?.place && x.item.frame.place !== f.place
            ? // Into another place, only where things sit in the frame carries: "keep its framing
              // exactly" of a streetcar's aisle for a wide view of a train roof (24 Sep).
              `${pictureNo(x)}${shows}, just before the dream jumps to another place. Keep only its composition: where the main shapes and figures sit in the frame, so the two pictures cut together; the place and everything in it are this picture's own. The dream changes this: ${frame.fields.shift?.value ?? ''}.`
            : x.use.turned
              ? `${pictureNo(x)}${shows}, just before the dream changes it. Keep only its composition: where the main shapes and figures sit in the frame, so the two pictures cut together; this picture faces ${f.looksAt || 'another side of the place'}. The dream changes this: ${frame.fields.shift?.value ?? ''}.`
              : `${pictureNo(x)}${shows}, just before the dream jumps. ${keepAcross(x)}; the dream changes this: ${frame.fields.shift?.value ?? ''}.`
        : r === 'seat'
          ? `${pictureNo(x)}${shows}: the camera is where the dreamer is in it, at their eye height, turned toward ${f.looksAt || 'what this moment shows'}; what is beside them there is beside the camera here, seen from their place. Nothing else from it: not its camera, framing or angle.`
          : x.use.role === 'composition'
            ? mockUp
              ? // Where everyone is comes from the previs; the earlier picture gives how it all looks,
                // from whichever side it was taken: "from the same side" of a picture facing another
                // wall read to the gate as the prompt contradicting itself (0.51, 24 Sep).
                `${pictureNo(x)}${shows}: the same place. Take only how it looks there (its surfaces, colours and light) and how anyone in it who is also in this picture looks; no one else from it comes into this one. Where everyone and everything is, and which way this picture looks, come from Image 1, the mock-up.`
              : `${pictureNo(x)}${shows}: the same place from the same side. Take where everything and everyone in it are, and its light; this frame is framed ${f.distance}.`
            : unsketched.length
              ? lastSeen(x, unsketched)
              : `${pictureNo(x)}${shows}: take only ${x.use.carries.replace(/;.*$/, '')}. Nothing of its place, framing or background.`) +
        strays(x),
    );
  }

  const states = (plan?.states ?? []).map((st) => `${nameOf(sheets, st.who)}'s ${st.what}: ${st.now}`);
  const action = frame.fields.action?.value ?? '';
  // Seen from outside, the dreamer is a person in the picture only when the moment has them in it:
  // "the dreamer seen from outside" of a moment without them invites a second figure.
  const angle =
    f.eyes === 'dreamer'
      ? "seen through the dreamer's own eyes"
      : inView.some((s) => s.isDreamer)
        ? 'at eye level, the dreamer seen from outside'
        : 'at eye level';
  // Their own hands or feet may show, in their own clothes.
  const dreamer = sheets.find((x) => x.isDreamer);
  const wear = dreamer ? lookOf(dreamer, ['wardrobe']) : '';
  // Said once: with the view worked out, where the camera is and what it faces are in the view.
  const own = `at most their own hands, arms or feet show${wear ? `, in ${wear.charAt(0).toLowerCase()}${wear.slice(1)}` : ''}`;
  const pov =
    f.eyes === 'dreamer' && !plan?.view
      ? `The camera is the dreamer's own eyes: the dreamer is not in the picture, except perhaps their own hands, arms or feet${wear ? `, in ${wear.charAt(0).toLowerCase()}${wear.slice(1)}` : ''}.`
      : '';
  const feeling = frame.fields.feeling?.value;
  const point = frame.fields.visual_point?.value;
  // (Its part in the story, "the turn" or "the waking", stays on record for the judge: a picture
  // can only draw it by inventing something.)
  // Someone drawn with their group stands with it, not beside it.
  const staged = (plan?.staging ?? []).filter((id) => !members.some((m) => m.member.id === id));
  const lines = [
    // With the dreamer's view worked out, the view is the framing: "the subject fills the frame"
    // beside what is close and what is beyond read as a contradiction (0.70, 24 Sep).
    plan?.view
      ? f.eyes === 'dreamer'
        ? `One picture from the dream, in ${SHAPE_WORDS[shapeOf(frame)]}, through the dreamer's own eyes.`
        : // Seen from outside with the camera worked out, how big each thing is comes from the view.
          `One picture from the dream, in ${SHAPE_WORDS[shapeOf(frame)]}: a ${f.distance} shot, ${angle}${f.looksAt ? `, facing ${f.looksAt}` : ''}.`
      : // An edit keeps the framing of the picture it edits: "the subject fills the whole frame, the
        // background a thin strip" beside "keep its camera, framing and room" came back as a close
        // head against a sky, the room gone (24 Sep).
        `One picture from the dream, in ${SHAPE_WORDS[shapeOf(frame)]}: a ${f.distance} shot, ${angle}${f.looksAt ? `, facing ${f.looksAt}` : ''}.${base ? '' : ` ${FRAMING[f.distance]}`}`,
    // The shot comes first, before the images: its director of photography's brief where there is
    // one, else the view worked out on the floor plan. Said after the images, the view was drawn
    // facing the screen, the default for a theater (24 Sep).
    plan?.view
      ? frame.shot && frame.shot.view === plan.view
        ? `The shot${mockUp ? ', as the mock-up in Image 1 shows it' : ''}${f.eyes === 'dreamer' ? ` (${own})` : ''}: ${frame.shot.text}`
        : f.eyes === 'dreamer'
          ? `What the dreamer sees, the camera being their own eyes${mockUp ? ', as the mock-up in Image 1 shows it' : ''} (${own}): ${plan.view}`
          : `What the camera sees${mockUp ? ', as the mock-up in Image 1 shows it' : ''}: ${plan.view}`
      : '',
    manifest.length
      ? `The attached images, in order, and the one thing to take from each:\n${manifest.join('\n')}`
      : '',
    `What happens in this frame: ${action}`,
    // The dream's own strangeness, where this moment has it: shown as plain fact, never as an effect.
    frame.fields.dream?.value
      ? `The dream in it, drawn as plain fact, as solid and ordinary as everything around it: ${sentence(frame.fields.dream.value)}`
      : '',
    pov,
    plan?.camera && (plan.across?.length ?? 0) >= 2
      ? `Seen ${plan.camera}. From left to right across the picture: ${plan.across!.map((id) => nameOf(sheets, id)).join(', then ')}. They keep these places in every picture of this scene.${members.map((m) => ` ${who(m.member)} ${isGroup(m.member) ? 'are' : 'is'} with ${who(m.group)}.`).join('')}`
      : staged.length >= 2
        ? `Where they stand, from left to right: ${staged.map((id) => nameOf(sheets, id)).join(', then ')}. They keep these sides in every picture of this scene.${members.map((m) => ` ${who(m.member)} ${isGroup(m.member) ? 'are' : 'is'} with ${who(m.group)}.`).join('')}`
        : '',
    YOU,
    facts.length ? `In it:\n${facts.join('\n')}` : '',
    states.length ? `Still so from earlier in the dream: ${states.join('; ')}.` : '',
    feeling ? `It should feel: ${sentence(feeling)}` : '',
    point ? `The one thing this frame must show: ${sentence(point)}` : '',
    // The judge's findings on the last attempt, when it was drawn again for them.
    frame.repairFor?.length
      ? `The last attempt at this frame got these wrong. Put each right:\n${frame.repairFor.map((q) => `- ${q}`).join('\n')}`
      : '',
    styleBlock(style, toldColours(frame, ...inView), { fromImages: references.length > 0 }),
    // The ice-head frames came back with the whole woman made of ice (23 Sep): what the action
    // changes, and nothing else, differs from the references.
    references.length
      ? 'Everyone and everything looks exactly as in their images above, except for what this moment itself changes and what is still so from earlier.'
      : '',
    // A style's "double exposure" plus an earlier picture put a house's roof through the walls of
    // a tiny room (23 Sep): an earlier picture gives only what it is attached for.
    usable.some((x) => x.use.kind === 'cut')
      ? 'Nothing from another picture shows through this one: no other place, sky, wall or person is layered or double-exposed into it, whatever the style.'
      : '',
    // The dream's writing can live in what is in view as well as in the action: a frame of the
    // board without the word quoted in its action came back reading "NONSENSICAL" (23 Sep).
    `One single picture filling the whole frame. ${writingLine(writingIn(action, point, ...inView.flatMap((x) => Object.values(x.fields).map((d) => d.value))))}`,
  ];
  // The moments are told to the dreamer ("she stands before you"), and to a picture "you" is the
  // viewer: a moment seen from outside came back with a viewer's hands reaching in (23 Sep). "You"
  // can be anywhere in what is told, a place's words included ("where you wait"), not only the action.
  const told = lines.filter((l) => l !== YOU).join('\n');
  const prompt = lines
    .map((l) =>
      l !== YOU
        ? l
        : f.eyes === 'outside' && /\byou(r|rself)?\b/i.test(told)
          ? `"You" in these words is the dreamer, a person in the picture like anyone else. There is no viewer in the picture: no hands, arms or body of the camera.`
          : '',
    )
    .filter(Boolean)
    .join('\n\n');
  return { prompt, references, depicted: [...new Set(depicted)] };
}

/**
 * A ghost's prompt: one edit of its asset's approved sheet, with the moment the change happened
 * (or a picture from inside the place, for its light) beside it. A ghost is a reference, never a
 * scene: plain background, the sheet's own framing, no words.
 */
export function ghostPrompt(
  ghost: Item,
  sheet: Item,
  from: Item | undefined,
  style: StyleOption,
  /** The ghost of the change before, edited in turn: one change per edit. */
  previous?: Item,
): { prompt: string; references: FrameReference[]; depicted: string[] } {
  const g = ghost.ghost;
  if (!g) throw new Error(`${ghost.name} is not a ghost`);
  if (!sheet.mediaId) throw new Error(`${sheet.name} has no approved sheet`);
  const name = sheet.isDreamer ? 'the dreamer' : sheet.name;
  const before = previous && approved(previous) && previous.mediaId ? previous : undefined;
  const references: FrameReference[] = before?.mediaId
    ? [
        {
          media_id: before.mediaId,
          role: 'base',
          instruction: `${name} as they looked a moment before: edit it with one change`,
        },
        {
          media_id: sheet.mediaId,
          role: sheet.kind === 'character' ? 'identity' : sheet.kind === 'location' ? 'location' : 'prop',
          instruction: `${sheet.name}'s reference sheet: who or what it is`,
        },
      ]
    : [
        {
          media_id: sheet.mediaId,
          role: 'base',
          instruction: `${sheet.name}'s reference sheet: edit it with one change`,
        },
      ];
  // A new side of a place is an edit of its sketch alone: a picture from inside it went in for its
  // light only, and no image goes in for its light alone (see framePrompt). The moment a change
  // happened goes in for how the change looks.
  const useFrom = g.kind !== 'view' && from && approved(from) && from.mediaId ? from : undefined;
  if (useFrom?.mediaId)
    references.push({
      media_id: useFrom.mediaId,
      role: 'identity',
      instruction: `the moment the change happened: how it looks`,
    });
  // What stays is everything the change does not replace: "make their head an ice block" beside
  // "keep the same face and hair" read as a contradiction (0.51-0.54 on what it shows, 24 Sep).
  const what = g.state?.what ?? '';
  const parts =
    sheet.kind === 'character'
      ? [
          ...(/head|face/i.test(what) ? [] : ['face']),
          'build',
          ...(/head|hair/i.test(what) ? [] : ['hair']),
          ...(/cloth|dress|shirt|coat|jacket|trousers|skirt|shoe|wear|outfit/i.test(what) ? [] : ['clothes']),
        ]
      : [];
  const listed = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''));
  const becomes = g.state ? isWhole(g.state) : false;
  const keep = becomes
    ? 'the same angle and framing, the same plain background'
    : sheet.kind === 'character'
      ? `the same ${listed(parts)}, the same pose and framing, the same plain background`
      : sheet.kind === 'location'
        ? 'the same walls, windows, objects, materials and colours, the same view'
        : 'the same shape and materials, the same angle, the same plain background';
  // Turned into something else entirely, the whole of it is the change: "form is now roller
  // coaster" beside "keep the same shape and materials" asked for both (24 Sep).
  const change = becomes
    ? `it has turned into ${aNoun(g.state?.now ?? '')}, entirely`
    : `${g.state?.what} is now ${g.state?.now}`;
  // Its look in words, as a moment lists what is in it: said only through its image, an edit read
  // as unclear about what it shows (0.53 against 0.64, 24 Sep).
  const look = LOOK[sheet.kind]
    .map((k) => sheet.fields[k])
    .filter((d) => !!d?.value && !VAGUE.test(d.value))
    .map((d) => (d?.said ? (d.value as string) : inShades(d?.value as string, style)))
    .join('; ');
  const kind = sheet.kind === 'character' ? 'person' : sheet.kind === 'location' ? 'place' : 'thing';
  const lines =
    g.kind === 'view'
      ? [
          `A reference picture of ${sheet.name}, with nobody in it: not a scene from the story.`,
          `Image 1 is ${sheet.name}'s reference sheet. Show the same place with the camera turned to face ${g.looksAt || 'the other way'}: what was behind the camera is now in view. Everything stays true to image 1: the same materials, colours, light and style, and objects consistent with it.`,
        ]
      : [
          `A reference picture of ${name}, on their own: not a scene from the story.`,
          before
            ? `Image 1 is ${name} as they looked a moment before, after the change before this one: edit it. Make exactly one change: ${change}. Image 2 is their reference sheet: ${sheet.kind === 'character' ? `their ${listed(parts)}` : 'what it is'}.`
            : `Image 1 is ${name}'s reference sheet: edit it. Make exactly one change: ${change}.`,
          useFrom
            ? `Image ${references.length} is the moment it happened in the dream: make the change look as it does there, and take nothing else from it.`
            : '',
          // Turned into something else entirely, what it was is not to be drawn: "turned into a grey
          // heron" beside "a woman in her 50s, hair in a bun, glasses" read as the edit at odds with
          // itself (0.68), and it was held (heron dream, 26 Sep).
          becomes
            ? `${name} was ${aNoun(kind)}; now the whole of them is ${aNoun(g.state?.now ?? '')}, and nothing of how they looked before stays but what that says.`
            : `${name} (${kind})${look ? `: ${look}` : ''}.`,
          `Keep everything else exactly as in image 1: ${keep}.`,
        ];
  const prompt = [
    ...lines,
    // Turned into something else entirely, its colours are those of what it is now ("grey heron",
    // "red cardigan"), never of its blouse and skin before (heron dream, 26 Sep).
    styleBlock(style, becomes ? coloursIn(g.state?.now ?? '') : toldColours(sheet), {
      fromImages: true,
      noSkin: becomes,
    }),
    // An edit of a reference sheet keeps the plain ends it was measured with: said as what is
    // there, the edit read as more likely to contradict itself (0.35 against 0.27, 24 Sep).
    `One single picture, not a sheet or a grid. ${NO_WORDS_EDIT}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { prompt, references, depicted: sheet.nodeId ? [sheet.nodeId] : [] };
}
