// The moments: one frame per cut, drawn from the approved sheets of everything in it.
//
// The prompt is a rendering of the cut's own fields, never hand-written, and carries what the
// overnight Strawberry runs learned (autoloop/cuts.py): a shot size is a word to a director and
// nothing to a generator, so say how much of the frame the subject fills; a room referenced from
// a sheet comes back mirrored unless told which side its walls are on; every detail of what is
// in view is said out loud, and the style tokens are quoted word for word.
import type { ContinuityPlan, PlanRef } from './continuity';
import type { Breakdown, Moment, StyleOption } from './producer';
import { VAGUE } from './producer';
import { type Item, styleBlock, toldColours } from './sheets';

/** A phrase ended as one sentence, however the model ended it. */
const sentence = (text: string) => `${text.trim().replace(/[.!?;,:\s]+$/, '')}.`;

const FRAMING: Record<Moment['distance'], string> = {
  close: 'The subject fills nearly the whole frame edge to edge; the background is a thin strip and little more.',
  medium: 'The subject occupies about half the frame height, with the space around them clearly visible.',
  wide: 'The whole space is in frame and the subject, if any, is small within it.',
};

// A "little round convertible" came back with a real maker's badge on its bonnet (23 Sep).
const NO_WORDS =
  'Do not write any words, letters, numbers or labels anywhere in the image, and no logos or brand badges.';

/**
 * Writing the dream itself contains, from quoted words in the moment: 'zikery' on a board.
 * Told only that writing was allowed, the zikery board came back reading "KITCHEN", the
 * place's own name (23 Sep); the exact word, spelled out, is the only writing allowed.
 */
export function writingIn(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const t of texts)
    // A quote mark counts only outside a word, so "the dreamer's kitchen" quotes nothing.
    for (const m of (t ?? '').matchAll(/(?<![A-Za-z])["'“‘]([^"'“”‘’]{2,40})["'”’](?![A-Za-z])/g))
      found.add(m[1].trim());
  return [...found].filter((w) => /[a-z]/i.test(w));
}

function writingLine(words: string[]): string {
  if (!words.length) return NO_WORDS;
  // "Spelled Z-I-K-E-R-Y" still came back "ZIIKERY" (23 Sep); the letter count pins it.
  const spelled = words.map((w) => {
    const letters = w.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `"${w.toUpperCase()}" (${letters.length} letters: ${letters.split('').join(' ')})`;
  });
  return `The only writing anywhere in the picture is ${spelled.join(' and ')}, exactly as spelled, and nothing else: no other words, letters, numbers, labels, logos or brand badges.`;
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
function label(action: string): string {
  const words = action.replace(/[.,;:—-]+$/, '').split(/\s+/);
  return words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : words.join(' ');
}

export type FrameReference = {
  media_id: string;
  role: 'identity' | 'location' | 'prop' | 'base' | 'lighting' | 'composition';
  instruction: string;
};

/** An earlier picture the plan draws this one from, with the plan's reason for it. */
export type PlannedInput = { use: PlanRef; item: Item };

// "You" in an instruction to a picture is anyone, a viewer's hands included: the dreamer is "the dreamer".
const nameOf = (sheets: Item[], id: string) => {
  const s = sheets.find((x) => x.id === id);
  return s ? (s.isDreamer ? 'the dreamer' : s.name) : id;
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
): { prompt: string; references: FrameReference[]; depicted: string[] } {
  const f = frame.frame;
  if (!f) throw new Error(`${frame.name} is not a moment`);
  const plan = f.plan;
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const inView = [
    ...f.visible.map((id) => byId.get(id)),
    ...f.things.map((id) => byId.get(id)),
    byId.get(f.place),
  ].filter((s): s is Item => !!s);
  const usable = inputs.filter((x) => approved(x.item) && x.item.mediaId);
  const base = usable.find((x) => x.use.role === 'base');
  const roomFromCut = usable.some(
    (x) => x.use.kind === 'cut' && (x.use.relation === 'same_setup' || x.use.relation === 'same_side'),
  );
  const viewGhost = usable.find((x) => x.item.ghost?.kind === 'view');
  const who = (s: Item) => (s.isDreamer ? 'the dreamer' : s.name);

  const references: FrameReference[] = [];
  const manifest: string[] = [];
  const depicted: string[] = [];
  const attach = (media_id: string, role: FrameReference['role'], instruction: string, line: string) => {
    references.push({ media_id, role, instruction });
    manifest.push(`Image ${references.length}: ${line}`);
  };
  const pictureNo = (x: PlannedInput) => (x.item.frame ? `picture ${x.item.frame.order}` : 'an in-between reference');
  // What the judge found invented in an earlier picture stays out of this one: a viewer's hands in
  // picture 3 were kept by the edit made from it (23 Sep).
  const strays = (x: PlannedInput) => {
    const c = x.item.check;
    const found = (c?.failedIds ?? [])
      .map((id, i) => (id === 'undeclared' ? c?.notes?.[i] : undefined))
      .filter((n): n is string => !!n);
    return found.length ? ` Leave out what it shows that is not in the dream: ${found.join('; ')}.` : '';
  };

  if (base?.item.mediaId)
    attach(
      base.item.mediaId,
      'base',
      'the same view a moment earlier: edit it into this moment',
      `EDIT THIS PICTURE. It is ${pictureNo(base)}, the same view a moment earlier. Keep its camera, framing, room, light and everyone in it exactly as they are, faces and clothes included; change only what this moment changes.${strays(base)}`,
    );

  // What each sheet says in words, so the manifest ties each image to who or what it is.
  const lookOf = (s: Item, keys: string[]) =>
    keys
      .map((k) => s.fields[k]?.value)
      .filter((v): v is string => !!v && !VAGUE.test(v))
      .join('; ');
  const facts: string[] = [];
  for (const s of inView) {
    if (s.nodeId) depicted.push(s.nodeId);
    const known = Object.values(s.fields)
      .map((d) => d.value)
      .filter((v): v is string => !!v && !VAGUE.test(v))
      .join('; ');
    const kind = s.kind === 'character' ? 'person' : s.kind === 'location' ? 'place' : 'thing';
    facts.push(`${who(s)} (${kind})${known ? `: ${known}` : ''}.`);
    // Every sheet of what is in view always goes in: consistency starts from them.
    if (!approved(s) || !s.mediaId) continue;
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
        `${s.name}: this exact person, with the same face, build and clothes`,
        `who ${who(s)} is${look ? ` (${look})` : ''}: their ${changed.some((st) => /head|face/i.test(st.what)) ? 'build and clothes' : 'face, hair, build and clothes'}, exactly${base ? ', as Image 1 already shows them' : ''}. Nothing else from it: not its pose, background or framing.${except}`,
      );
    } else if (s.kind === 'location') {
      // An edit base or an earlier picture of this side sets where things stand; a view ghost shows
      // the side this frame faces. Then the sheet gives the place's materials, colours and objects.
      const layout = plan?.sheetLayout !== false && !roomFromCut && !base && !viewGhost;
      const look = lookOf(s, ['geography', 'landmarks', 'light']);
      attach(
        s.mediaId,
        'location',
        layout
          ? `${s.name}: this exact place. Keep its walls, windows and doors on the sides the reference puts them; do not mirror or rearrange them`
          : `${s.name}: its materials, colours and objects only; the layout comes from ${base ? 'the picture being edited' : 'the earlier picture'}`,
        layout
          ? `${s.name}${look ? ` (${look})` : ''}: the camera stands inside this place. Keep its walls, windows, doors and furniture where it puts them; do not mirror or rearrange them.`
          : base || roomFromCut
            ? `${s.name}${look ? ` (${look})` : ''}: only its materials, colours and objects; where things stand comes from ${base ? 'Image 1' : 'the earlier picture of this place'}.`
            : `${s.name}${look ? ` (${look})` : ''}: only its materials, colours and objects. It shows the place from another side: this frame faces ${f.looksAt || 'the other way'}.`,
      );
    } else {
      const look = lookOf(s, ['appearance', 'materials']);
      attach(
        s.mediaId,
        'prop',
        `${s.name}: this exact object, with the same shape and materials`,
        `${s.name}${look ? ` (${look})` : ''}: its exact shape, materials and colours, the same in every picture. Nothing else from it.`,
      );
    }
  }

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
          ? `${nameOf(sheets, g.of)} seen facing ${g.looksAt || 'the other way'}: the side this frame faces. Keep its walls, windows and objects where it puts them.`
          : `how ${nameOf(sheets, g.of)} looks now (${g.state?.what}: ${g.state?.now}): draw ${g.of === f.place ? 'it' : 'them'} exactly so. Nothing else from it.`,
      );
      continue;
    }
    const r = x.use.relation;
    const shows = x.item.fields.action?.value ? ` (${x.item.fields.action.value.replace(/\.$/, '')})` : '';
    const role: FrameReference['role'] =
      x.use.role === 'lighting' ? 'lighting' : x.use.role === 'composition' ? 'composition' : 'identity';
    attach(
      x.item.mediaId,
      role,
      x.use.carries,
      (r === 'shift'
        ? `${pictureNo(x)}${shows}, just before the dream jumps. Keep its framing and where everyone is exactly; the dream changes this: ${frame.fields.shift?.value ?? ''}.`
        : x.use.role === 'composition'
          ? `${pictureNo(x)}${shows}: the same place from the same side. Take where its walls, windows, furniture and people are, and its light; this frame is framed ${f.distance}.`
          : x.use.role === 'lighting'
            ? `${pictureNo(x)}${shows}: the same place from the other side, a moment earlier. Take only its light and how everyone looks; the walls behind are the ones opposite to that picture's.`
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
  const feeling = frame.fields.feeling?.value;
  const point = frame.fields.visual_point?.value;
  const purpose = frame.fields.purpose?.value;
  const prompt = [
    `One picture from the dream, ${f.distance}, ${angle}${f.looksAt ? `, facing ${f.looksAt}` : ''}. ${FRAMING[f.distance]}`,
    manifest.length
      ? `The attached images, in order, and the one thing to take from each:\n${manifest.join('\n')}`
      : '',
    `What happens in this frame: ${action}`,
    (plan?.staging?.length ?? 0) >= 2
      ? `Where they stand, from left to right: ${plan!.staging.map((id) => nameOf(sheets, id)).join(', then ')}. The same in every picture of this scene: they never swap sides.`
      : '',
    // The moments are told to the dreamer ("she stands before you"), and to a picture "you" is the
    // viewer: a moment seen from outside came back with a viewer's hands reaching in (23 Sep).
    f.eyes === 'outside' && /\byou(r|rself)?\b/i.test(`${action} ${point ?? ''}`)
      ? `"You" in these words is the dreamer, a person in the picture like anyone else. There is no viewer in the picture: no hands, arms or body of the camera.`
      : '',
    facts.length ? `In it:\n${facts.join('\n')}` : '',
    states.length ? `Still so from earlier in the dream: ${states.join('; ')}.` : '',
    purpose ? `Its part in the story: ${sentence(purpose)}` : '',
    feeling ? `It should feel: ${sentence(feeling)}` : '',
    point ? `The one thing this frame must show: ${sentence(point)}` : '',
    // The judge's findings on the last attempt, when it was drawn again for them.
    frame.repairFor?.length
      ? `The last attempt at this frame got these wrong. Put each right:\n${frame.repairFor.map((q) => `- ${q}`).join('\n')}`
      : '',
    styleBlock(style, toldColours(frame, ...inView)),
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
    `One single picture, not a sheet or a grid. ${writingLine(writingIn(action, point, ...inView.flatMap((x) => Object.values(x.fields).map((d) => d.value))))}`,
  ]
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
  const useFrom = from && approved(from) && from.mediaId ? from : undefined;
  if (useFrom?.mediaId)
    references.push(
      g.kind === 'view'
        ? { media_id: useFrom.mediaId, role: 'lighting', instruction: `inside ${sheet.name}: its light` }
        : { media_id: useFrom.mediaId, role: 'identity', instruction: `the moment the change happened: how it looks` },
    );
  const keep =
    sheet.kind === 'character'
      ? 'the same face, build, hair and clothes, the same pose and framing, the same plain background'
      : sheet.kind === 'location'
        ? 'the same walls, windows, objects, materials and colours, the same view'
        : 'the same shape and materials, the same angle, the same plain background';
  const lines =
    g.kind === 'view'
      ? [
          `A reference picture of ${sheet.name}, with nobody in it: not a scene from the story.`,
          `Image 1 is ${sheet.name}'s reference sheet. Show the same place with the camera turned to face ${g.looksAt || 'the other way'}: what was behind the camera is now in view. Everything stays true to image 1: the same materials, colours and style, and objects consistent with it.`,
          useFrom ? `Image 2 is a picture from inside ${sheet.name}: keep its light.` : '',
        ]
      : [
          `A reference picture of ${name}, on their own: not a scene from the story.`,
          before
            ? `Image 1 is ${name} as they looked a moment before, after the change before this one: edit it. Make exactly one change: ${g.state?.what} is now ${g.state?.now}. Image 2 is their reference sheet: who they are.`
            : `Image 1 is ${name}'s reference sheet: edit it. Make exactly one change: ${g.state?.what} is now ${g.state?.now}.`,
          useFrom
            ? `Image ${references.length} is the moment it happened in the dream: make the change look as it does there, and take nothing else from it.`
            : '',
          `Keep everything else exactly as in image 1: ${keep}.`,
        ];
  const prompt = [
    ...lines,
    styleBlock(style, toldColours(sheet)),
    `One single picture, not a sheet or a grid. ${NO_WORDS}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { prompt, references, depicted: sheet.nodeId ? [sheet.nodeId] : [] };
}
