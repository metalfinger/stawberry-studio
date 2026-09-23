// The moments: one frame per cut, drawn from the approved sheets of everything in it.
//
// The prompt is a rendering of the cut's own fields, never hand-written, and carries what the
// overnight Strawberry runs learned (autoloop/cuts.py): a shot size is a word to a director and
// nothing to a generator, so say how much of the frame the subject fills; a room referenced from
// a sheet comes back mirrored unless told which side its walls are on; every detail of what is
// in view is said out loud, and the style tokens are quoted word for word.
import type { ContinuityPlan, PlanRef } from './continuity';
import type { Breakdown, Moment, StyleOption } from './producer';
import { type Item, styleBlock, toldColours } from './sheets';

const FRAMING: Record<Moment['distance'], string> = {
  close: 'The subject fills nearly the whole frame edge to edge; the background is a thin strip and little more.',
  medium: 'The subject occupies about half the frame height, with the space around them clearly visible.',
  wide: 'The whole space is in frame and the subject, if any, is small within it.',
};

const NO_WORDS = 'Do not write any words, letters, numbers or labels anywhere in the image.';

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
  return `The only writing anywhere in the picture is ${spelled.join(' and ')}, exactly as spelled, and nothing else: no other words, letters, numbers or labels.`;
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

const nameOf = (sheets: Item[], id: string) => {
  const s = sheets.find((x) => x.id === id);
  return s ? (s.isDreamer ? 'you, the dreamer' : s.name) : id;
};

const approved = (s: Item) => s.status === 'ready' && !!s.mediaId && (!!s.review || !!s.continuityApproved);

/**
 * The frame's prompt and its references, in the order the images are attached. Only approved
 * pictures are references: an unapproved take is never fed back in. The earlier cuts and ghosts
 * come from the continuity plan, each told what to take from it: an edit base first (Image 1 is
 * the picture to change), then the sheets of what is in view, then ghosts, then other cuts.
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

  const references: FrameReference[] = [];
  const depicted: string[] = [];
  const lines: string[] = [];
  const drawnFrom: string[] = [];
  const push = (r: FrameReference) => references.push(r);
  const pictureNo = (x: PlannedInput) => (x.item.frame ? `picture ${x.item.frame.order}` : 'an in-between reference');

  if (base?.item.mediaId) {
    push({
      media_id: base.item.mediaId,
      role: 'base',
      instruction: 'the same view a moment earlier: edit it into this moment',
    });
    drawnFrom.push(
      `Image ${references.length} is ${pictureNo(base)}, the same view a moment earlier. Edit it into this moment: keep the camera, the place, the light and how everyone looks exactly; change only what this moment changes.`,
    );
  }

  for (const s of inView) {
    if (s.nodeId) depicted.push(s.nodeId);
    const facts = Object.values(s.fields)
      .map((d) => d.value)
      .filter(Boolean)
      .join('; ');
    const kind = s.kind === 'character' ? 'person' : s.kind === 'location' ? 'place' : 'thing';
    let seeImage = '';
    // An edit base already holds the place, and a view ghost shows the side this frame faces; the
    // sheet would only pull the layout back to its own view. Otherwise the sheet always goes in:
    // Strawberry draws a moment only when everything in it has its own reference or a base.
    const skipSheet = s.kind === 'location' && (!!base || !!viewGhost);
    if (approved(s) && s.mediaId && !skipSheet) {
      // With an earlier picture of the room from this side, that picture sets the layout.
      const layout = s.kind !== 'location' || (plan?.sheetLayout !== false && !roomFromCut);
      push({
        media_id: s.mediaId,
        role: s.kind === 'character' ? 'identity' : s.kind === 'location' ? 'location' : 'prop',
        instruction:
          s.kind === 'location'
            ? layout
              ? `${s.name}: this exact place. Keep its walls, windows and doors on the sides the reference puts them; do not mirror or rearrange them`
              : `${s.name}: its materials, colours and objects only; ${roomFromCut ? 'the layout comes from the earlier picture' : 'this frame faces another side of it'}`
            : `${s.name}: this exact ${s.kind === 'character' ? 'person, with the same face, build and clothes' : 'object, with the same shape and materials'}`,
      });
      seeImage = ` Image ${references.length} is ${s.name}'s reference sheet: ${
        s.kind === 'location'
          ? layout
            ? 'the camera stands inside this place; keep its walls, windows and doors on the sides that sheet puts them, and do not mirror or rearrange them.'
            : roomFromCut
              ? 'take only its materials, colours and objects from it; where things are comes from the earlier picture of this place.'
              : `it shows the place from another side. Take only its materials, colours and objects; this frame faces ${f.looksAt || 'the other way'}.`
          : s.kind === 'character'
            ? 'keep the same face, build and clothes exactly.'
            : 'keep the same shape and materials exactly.'
      }${s.kind === 'location' ? '' : ' Use the sheet only for what they look like, never for its layout.'}`;
    }
    lines.push(`${s.name} (${kind})${facts ? `: ${facts}` : ''}.${seeImage}`);
  }

  for (const x of usable) {
    if (x === base || !x.item.mediaId) continue;
    const g = x.item.ghost;
    if (g) {
      push({
        media_id: x.item.mediaId,
        role: x.use.role === 'location' ? 'location' : x.use.role === 'prop' ? 'prop' : 'identity',
        instruction: x.use.carries,
      });
      drawnFrom.push(
        g.kind === 'view'
          ? `Image ${references.length} shows ${nameOf(sheets, g.of)} facing ${g.looksAt || 'the other way'}: the side this frame faces. Keep its walls, windows and objects where it puts them.`
          : `Image ${references.length} shows how ${nameOf(sheets, g.of)} looks now: ${g.state?.what} ${g.state?.now}. Draw them exactly so.`,
      );
      continue;
    }
    const r = x.use.relation;
    const role: FrameReference['role'] =
      x.use.role === 'lighting' ? 'lighting' : x.use.role === 'composition' ? 'composition' : 'identity';
    push({ media_id: x.item.mediaId, role, instruction: x.use.carries });
    const n = references.length;
    drawnFrom.push(
      r === 'shift'
        ? `Image ${n} is ${pictureNo(x)}, just before the dream jumps. Keep its framing and where everyone is exactly; the dream changes this: ${frame.fields.shift?.value ?? ''}.`
        : x.use.role === 'composition'
          ? `Image ${n} is ${pictureNo(x)}: the same place from the same side. Keep its walls, windows, furniture and light where that picture shows them, and everyone where they were unless this moment moves them; this frame is framed ${f.distance}.`
          : x.use.role === 'lighting'
            ? `Image ${n} is ${pictureNo(x)}, the same place seen from the other side a moment earlier. Keep its light and how everyone looks; the camera now faces ${f.looksAt || 'the other way'}, so the walls behind are the ones opposite to that picture's.`
            : `Image ${n} is ${pictureNo(x)}: take only how ${x.use.carries.replace(/^how /, '').replace(/;.*$/, '')} from it, never its place, framing or background.`,
    );
  }

  const states = (plan?.states ?? []).map((st) => `${nameOf(sheets, st.who)}: ${st.what} ${st.now}`);
  const action = frame.fields.action?.value ?? '';
  const angle =
    f.eyes === 'dreamer' ? "seen through the dreamer's own eyes" : 'at eye level, the dreamer seen from outside';
  const feeling = frame.fields.feeling?.value;
  const point = frame.fields.visual_point?.value;
  const purpose = frame.fields.purpose?.value;
  const prompt = [
    `A single storyboard frame, ${f.distance}, ${angle}${f.looksAt ? `, facing ${f.looksAt}` : ''}. ${FRAMING[f.distance]} ${action}`,
    drawnFrom.join('\n'),
    lines.length ? `In this frame:\n${lines.join('\n')}` : '',
    states.length ? `Still so from earlier in the dream: ${states.join('; ')}.` : '',
    purpose ? `Its part in the story: ${purpose}.` : '',
    feeling ? `It should feel: ${feeling}.` : '',
    point ? `The one thing this frame must show: ${point}.` : '',
    styleBlock(style, toldColours(frame, ...inView)),
    // The ice-head frames came back with the whole woman made of ice (23 Sep): what the action
    // changes, and nothing else, differs from the references.
    references.length
      ? 'Everyone and everything looks exactly as in their reference images, except for what this moment itself changes and what is still so from earlier.'
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
): { prompt: string; references: FrameReference[]; depicted: string[] } {
  const g = ghost.ghost;
  if (!g) throw new Error(`${ghost.name} is not a ghost`);
  if (!sheet.mediaId) throw new Error(`${sheet.name} has no approved sheet`);
  const name = sheet.isDreamer ? 'the dreamer' : sheet.name;
  const references: FrameReference[] = [
    { media_id: sheet.mediaId, role: 'base', instruction: `${sheet.name}'s reference sheet: edit it with one change` },
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
          `Image 1 is ${name}'s reference sheet: edit it. Make exactly one change: ${g.state?.what} is now ${g.state?.now}.`,
          useFrom
            ? `Image 2 is the moment it happened in the dream: make the change look as it does there, and take nothing else from it.`
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
