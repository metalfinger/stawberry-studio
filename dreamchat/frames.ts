// The moments: one frame per cut, drawn from the approved sheets of everything in it.
//
// The prompt is a rendering of the cut's own fields, never hand-written, and carries what the
// overnight Strawberry runs learned (autoloop/cuts.py): a shot size is a word to a director and
// nothing to a generator, so say how much of the frame the subject fills; a room referenced from
// a sheet comes back mirrored unless told which side its walls are on; every detail of what is
// in view is said out loud, and the style tokens are quoted word for word.
import type { Breakdown, Moment, StyleOption } from './producer';
import { type Item, styleBlock } from './sheets';

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

/** The moments to draw, the key one first and then in story order. */
export function buildFrames(b: Breakdown): Item[] {
  const all = b.scenes.flatMap((s) => s.moments);
  const ordered = [...all.filter((m) => m.key), ...all.filter((m) => !m.key)];
  return ordered.map((m) => ({
    id: m.id,
    kind: 'cut',
    name: label(m.action),
    fields: {
      action: { value: m.action, said: m.said },
      feeling: { value: m.feeling || null, said: false },
      visual_point: { value: m.visual_point || null, said: false },
    },
    status: 'waiting',
    version: 0,
    frame: {
      visible: m.visible,
      things: m.things,
      place: m.place,
      distance: m.distance,
      eyes: m.eyes,
      key: m.key,
      order: all.indexOf(m) + 1,
    },
  }));
}

/** A short name for a moment, as the chat and the panel show it. */
function label(action: string): string {
  const words = action.replace(/[.,;:—-]+$/, '').split(/\s+/);
  return words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : words.join(' ');
}

export type FrameReference = { media_id: string; role: 'identity' | 'location' | 'prop'; instruction: string };

/**
 * The frame's prompt and its references, in the order the images are attached. Only approved
 * sheets are references: an unapproved take is never fed back in.
 */
export function framePrompt(
  frame: Item,
  sheets: Item[],
  style: StyleOption,
): { prompt: string; references: FrameReference[]; depicted: string[] } {
  const f = frame.frame;
  if (!f) throw new Error(`${frame.name} is not a moment`);
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const inView = [
    ...f.visible.map((id) => byId.get(id)),
    ...f.things.map((id) => byId.get(id)),
    byId.get(f.place),
  ].filter((s): s is Item => !!s);

  const references: FrameReference[] = [];
  const depicted: string[] = [];
  const lines: string[] = [];
  for (const s of inView) {
    if (s.nodeId) depicted.push(s.nodeId);
    const facts = Object.values(s.fields)
      .map((d) => d.value)
      .filter(Boolean)
      .join('; ');
    const approved = s.status === 'ready' && s.mediaId && s.review;
    let seeImage = '';
    if (approved && s.mediaId) {
      references.push({
        media_id: s.mediaId,
        role: s.kind === 'character' ? 'identity' : s.kind === 'location' ? 'location' : 'prop',
        instruction:
          s.kind === 'location'
            ? `${s.name}: this exact place. Keep its walls, windows and doors on the sides the reference puts them; do not mirror or rearrange them`
            : `${s.name}: this exact ${s.kind === 'character' ? 'person, with the same face, build and clothes' : 'object, with the same shape and materials'}`,
      });
      seeImage = ` Image ${references.length} is ${s.name}'s reference sheet: ${
        s.kind === 'location'
          ? 'the camera stands inside this place; keep its walls, windows and doors on the sides that sheet puts them, and do not mirror or rearrange them.'
          : s.kind === 'character'
            ? 'keep the same face, build and clothes exactly.'
            : 'keep the same shape and materials exactly.'
      } Use the sheet only for what they look like, never for its layout.`;
    }
    const kind = s.kind === 'character' ? 'person' : s.kind === 'location' ? 'place' : 'thing';
    lines.push(`${s.name} (${kind})${facts ? `: ${facts}` : ''}.${seeImage}`);
  }

  const action = frame.fields.action?.value ?? '';
  const angle =
    f.eyes === 'dreamer' ? "seen through the dreamer's own eyes" : 'at eye level, the dreamer seen from outside';
  const feeling = frame.fields.feeling?.value;
  const point = frame.fields.visual_point?.value;
  const prompt = [
    `A single storyboard frame, ${f.distance === 'close' ? 'close' : f.distance === 'wide' ? 'wide' : 'medium'}, ${angle}. ${FRAMING[f.distance]} ${action}`,
    lines.length ? `In this frame:\n${lines.join('\n')}` : '',
    feeling ? `It should feel: ${feeling}.` : '',
    point ? `The one thing this frame must show: ${point}.` : '',
    styleBlock(style),
    // The ice-head frames came back with the whole woman made of ice (23 Sep): what the action
    // changes, and nothing else, differs from the references.
    references.length
      ? 'Everyone and everything looks exactly as in their reference image, except for what this moment itself changes.'
      : '',
    // The dream's writing can live in what is in view as well as in the action: a frame of the
    // board without the word quoted in its action came back reading "NONSENSICAL" (23 Sep).
    `One single picture, not a sheet or a grid. ${writingLine(writingIn(action, point, ...inView.flatMap((x) => Object.values(x.fields).map((d) => d.value))))}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { prompt, references, depicted: [...new Set(depicted)] };
}
