/**
 * The prompt for Qwen-Image 2.1 (the local image machine), written from a cut's sheet: the same facts the assembler
 * says to Nano Banana Pro, said the way Qwen reads them. The assembler's prose is unchanged; this profile is only
 * for local runs (`evals/local-run.ts --profile qwen`), and it says nothing the sheet does not say.
 *
 * How Qwen reads an edit (docs/qwen-image-prompts.md, from Qwen-Image 2.1's own prompt rewriter, the machine's
 * /v1/guide and the local storyboard harness's runs): one paragraph, the operation first; each image named by its
 * tag (<image1>) with the one thing to take from it; image 1 said to be the canvas, with what it keeps; people
 * by their image, not by their face in words; counts in a sentence of their own; the light early and plainly;
 * things said as they are, never as what is not there ("no trees" drew trees); one clause for everything else.
 */
import type { AssembledRef } from '../assemble';
import type { CutSheet, SheetElement } from '../cutsheet';
import { mediumOf } from '../producer';
import { shortName } from '../previs';
import { colourName } from '../sheets';
import type { Img } from './local-draw';

/** At most this many images: the machine takes four, and its guide finds one to three best. */
export const QWEN_IMAGES = 4;

/** An image's tag as Qwen-Image 2.1 labels its inputs, in the order sent. */
const tag = (k: number) => `<image${k}>`;

/** A sentence from words: its first letter capital, one full stop. */
const sentence = (s: string) => {
  const t = s.trim().replace(/[\s.;,]+$/, '');
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : '';
};

/** Counted as Qwen is told counts: "one", "two", … */
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number) => NUMBERS[n] ?? String(n);

/** How someone stands in the camera's view, from its own words: "sitting on the seats, facing the camera". */
export function poseIn(view: string | null, name: string): string {
  if (!view) return '';
  const clause = view
    .split(/(?<=\.)\s+|;\s+|:\s+/)
    .map((c) => c.replace(/^(?:then|and)\s+/i, ''))
    .find((c) => c.toLowerCase().startsWith(name.toLowerCase()));
  if (!clause) return '';
  // Where in the frame they are and how much of them shows is the canvas's: what is left is how they are.
  const FRAMING =
    /^(?:(?:just\s+)?(?:left|right) of|the (?:middle|left|right|top|bottom)|at the|in the (?:middle|left|right|foreground|background)|filling|seen (?:whole|from the (?:knees|waist|shoulders|chest|hips))|partly|nearest|close|far|small|large|across the picture)\b/i;
  return clause
    .slice(name.length)
    .split(/,\s+/)
    .map((x) => x.trim().replace(/\.$/, ''))
    .filter((x) => x && !FRAMING.test(x))
    .slice(0, 4)
    .join(', ');
}

/** A look's first clause: what it is, without the rest the image shows. */
const firstOf = (look: string) => look.split(';')[0].trim();

/**
 * How a thing is now, where a change of its size or of the whole of it is in force (the cut sheet's `now`, with
 * `written_now`): "now the size of a stamp". Its first look would say it "full size": the bed sheet folded down to a
 * stamp was written a plain white bed sheet, full size, at every fold (the merged flow's Grandmother, m7 to m9, 2 Oct).
 */
const nowOf = (e: SheetElement) => {
  const says = e.now?.says.replace(/^(?:is|are)\s+/i, '').replace(/\.$/, '');
  return says ? (/\bnow\b/i.test(says) ? says : `now ${says}`) : undefined;
};

/** A look's clause that is only how big it is, said where a change of its size is in force: "the size of a door". */
const SIZE_SAID =
  /^(?:at |in )?(?:its own|actual) size[d]?$|^(?:about |roughly |nearly )?(?:the size of|as (?:big|large|small|tall|long|wide) as)\b|^\d+(?:\.\d+)?\s*(?:mm|cm|m|metres?|meters?|inch(?:es)?|feet|foot|ft)\b/i;
/** A word of how big it is in a look ("huge", "large", "full size", "king-size", "normal-sized"), and its article. */
const SIZE_WORD = new RegExp(
  String.raw`\b(an?\s+)?(?:huge|giant|gigantic|enormous|massive|vast|immense|tiny|miniature|minuscule|oversized|big|large|small|little|(?:full|life|king|queen|normal|regular|ordinary|standard|usual|real|natural|human|average)[- ]?size[d]?)\b(?:\s+and\b|\s*,)?\s*(?=(\w)?)`,
  'gi',
);
/**
 * A look without its size: what it is and how it looks, but how big is what it is now. "An enormous white bed sheet"
 * is a white bed sheet; "a huge, heavy wooden chest" a heavy wooden chest.
 */
const unsized = (look: string) => {
  let out = look
    .split(/,\s+/)
    .filter((x) => !SIZE_SAID.test(x.trim()))
    .join(', ');
  // Again while it changes: "a huge enormous box" is a box.
  for (let was = ''; was !== out;) {
    was = out;
    out = out.replace(SIZE_WORD, (_, art: string | undefined, next: string | undefined) =>
      art ? `${/^[aeiou]/i.test(next ?? '') ? 'an' : 'a'} ` : '',
    );
  }
  return out
    .split(/,\s+/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(?:an?|the)$/i.test(x))
    .join(', ');
};

/**
 * Said as what it becomes: with its look where the look says more than a colour ("red" says less than its name). Where
 * its size or shape changed, its look without its size and how it is now; where the whole of it changed, only what it
 * is now.
 */
const becomes = (e: SheetElement) => {
  const now = nowOf(e);
  const look = now && !e.now?.whole ? unsized(firstOf(e.look)) : now ? '' : firstOf(e.look);
  const said = look.split(/\s+/).length >= 3 ? `${e.name}, ${look}` : e.name;
  return now ? `${said}, ${now}` : said;
};

/** The place's light, from its own look: the clause that names a light, a time of day or the dark. */
function lightOf(place: SheetElement | undefined): string {
  if (!place?.look) return '';
  const LIGHT =
    /\b(?:light|lit|lamp|lamps|glow|glowing|sun|sunlight|moon|moonlight|night|dark|dusk|dawn|dim|bright|shadow|shadows|candle|neon)\b/i;
  return (
    place.look
      .split(';')
      .map((x) => x.trim())
      .filter((x) => LIGHT.test(x))
      .at(-1) ?? ''
  );
}

export type QwenPrompt = { prompt: string; images: Img[] };

/**
 * A colour-keyed mock-up's key (previs.ts, its 'keyed' style): each one named on the plan by the flat colour it is drawn
 * in, with no label in the picture. With it, each one is said by its colour ("the red figure"); without it, by its label.
 */
export type MockUpKey = {
  id: string;
  name: string;
  colour: string;
  /** A short label tag on it in the mock-up, its name ("paper boat"). */
  labelled?: boolean;
  /** Drawn as a marker where the plan has no shape for it: where it goes and how big, not what it looks like. */
  placeholder?: boolean;
  /** Too small for the frame's pixels, a dot where it is (`tiny_marker`): where it is, never how big. */
  marker?: boolean;
}[];

/**
 * A cut's prompt for Qwen, with the images it sends, in order. `refs` are the assembler's references (one per image
 * offered, in the same order as `images`), `lines` its paragraphs by id, for what happens, how each one is now and the
 * moment's conditions, said as the assembler says them.
 */
export function qwenEdit(
  s: CutSheet,
  refs: AssembledRef[],
  images: Img[],
  lines: Record<string, string>,
  key?: MockUpKey,
): QwenPrompt {
  const name = (id: string) => s.names[id] ?? id;
  const pov = s.camera.eyes === 'dreamer';
  // Words said inside a sentence: "Even, shadowless light" is "even, shadowless light"; a name keeps its capital (Tomas).
  const proper = Object.values(s.names)
    .map((x) => x.split(/\s+/)[0])
    .filter((w) => /^[A-Z]/.test(w));
  const lower = (t: string) => {
    const w = t.split(/[\s,]+/)[0];
    return /^[A-Z][a-z]/.test(w) && !proper.includes(w) ? `${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
  };
  const offered = images
    .map((img, i) => ({ img, ref: refs[i] }))
    .filter((x) => x.img.file && x.ref)
    // Through the dreamer's eyes their sketch has no one to give a face to: their clothes are said in words.
    .filter((x) => !(pov && x.ref.role === 'identity' && x.ref.of === s.dreamer.id))
    // Through the dreamer's eyes, an earlier picture seen from outside is copied whole, its people and all: the father
    // and the dreamer of the handover came back into the dreamer's own view of the window (lighthouse-first m6, 1 Oct).
    .filter((x) => !(pov && x.ref.role === 'composition'));
  // A thing the moment's action or its one thing to show names comes before the place: the mock-up carries the place's
  // layout, and without its sketch the folded newspaper boat came out painted wood (lighthouse-first m4, 30 Sep).
  const said = `${s.story.action} ${s.story.point ?? ''}`.toLowerCase();
  const named = (r: AssembledRef) => {
    const head = (
      name(r.of)
        .toLowerCase()
        .match(/[a-z]+/g) ?? []
    ).at(-1);
    return r.role === 'prop' && !!head && new RegExp(`\\b${head}s?\\b`).test(said);
  };
  // Image 1, then everyone in it, a thing the moment names, the place as it is now, the place, things, earlier pictures.
  const rank = (r: AssembledRef, k: number) =>
    k === 0
      ? -1
      : r.role === 'identity'
        ? 1
        : named(r)
          ? 1.1
          : r.role === 'location' && r.source === 'ghost'
            ? 1.25
            : r.role === 'location'
              ? 2
              : r.role === 'prop'
                ? 3
                : 4;
  const sent = offered
    .map((x, k) => ({ ...x, rank: rank(x.ref, k) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, QWEN_IMAGES);
  const at = (pred: (r: AssembledRef) => boolean) => {
    const k = sent.findIndex((x) => pred(x.ref));
    return k < 0 ? null : k + 1;
  };

  const out: string[] = [];
  // Each one on the mock-up as it is drawn there: by its colour in a keyed one, by its label in the grey one.
  const colourOf = (id: string) => key?.find((k) => k.id === id)?.colour;
  const said1 = (e: SheetElement, what: 'figure' | 'shape') => {
    const c = colourOf(e.id);
    const k = key?.find((x) => x.id === e.id);
    // A thing with a label on the mock-up is said by it: "the marker labelled 'paper boat'".
    if (k?.labelled)
      return `The ${c ? `${c} ` : ''}${k.placeholder ? 'marker' : what} labelled '${shortName(e.name).toLowerCase()}'`;
    // A crowd or a group is many figures in one colour.
    const w = c && (e.group || e.said === 'people') ? `${what}s` : what;
    return c ? `The ${c} ${w}` : key ? `The ${what} of ${e.name}` : `The grey ${what} labelled ${e.name}`;
  };
  const becomeOf = (e: SheetElement) => (colourOf(e.id) && (e.group || e.said === 'people') ? 'become' : 'becomes');
  // A thing too small for the frame's pixels is a dot where it is (`tiny_marker`): never its size.
  const dot = (e: SheetElement) => !!key?.find((x) => x.id === e.id)?.marker;
  const poseWord = (e: SheetElement) =>
    colourOf(e.id) && (e.group || e.said === 'people') ? 'their poses' : "the figure's pose";
  const base = sent[0]?.ref;
  const mockUp = base?.source === 'mockup';
  const medium = mediumOf(s.style.option);
  // 1. The operation, and what image 1 keeps.
  if (mockUp)
    out.push(
      key
        ? `Turn the colour-coded mock-up ${tag(1)} into a finished picture, ${medium}: ${tag(1)} is the canvas, so keep its camera, its framing, and the place, size, pose and facing of every figure and shape exactly${key.some((k) => k.marker) ? ', but a dot only marks where something small is' : ''}.`
        : `Turn the grey mock-up ${tag(1)} into a finished picture, ${medium}: ${tag(1)} is the canvas, so keep its camera, its framing, and the place, size, pose and facing of every grey figure and shape exactly.`,
    );
  else if (base)
    out.push(
      `Edit ${tag(1)}, ${medium}: keep its camera, its framing, and everyone and everything in it where they are and as they look, and change only what this moment changes.`,
    );
  else out.push(`A finished picture, ${medium}, in a ${s.camera.shape} frame.`);

  // The camera, as the plan places it: where it stands and what it looks at (the view's first sentence), and what the
  // rules say is out past the place. Without it a close view of the dog at its own eye level came out from above, and
  // the dreamer's view out of the window lost the window (lighthouse-first m1, m6, 1 Oct).
  const shot = (s.camera.view ?? '').split(/(?<=\.)\s+/)[0]?.trim();
  if (shot) out.push(sentence(shot));
  for (const line of s.rules?.lines ?? []) out.push(sentence(line));

  // 2. The light, early: the place's own light, and the time of day its look gives.
  const place = s.inView.find((e) => e.id === s.place) ?? s.inView.find((e) => e.kind === 'location');
  const light = lightOf(place);
  if (light) out.push(`${/\bnight\b/i.test(place?.look ?? '') ? 'It is night. ' : ''}The light: ${lower(light)}.`);

  // 3. Through the dreamer's eyes: their own hands, or nothing of them.
  if (pov) {
    const wear = s.dreamer.wear.replace(/^\s*wearing\s+/i, '');
    const body = s.rules?.body ?? null;
    out.push(
      body === 'hands'
        ? `Seen through the dreamer's own eyes: only their own hands and arms are in the picture${s.rules?.does ? `, as they ${s.rules.does}` : ''}${wear ? `, in ${wear}` : ''}.`
        : body === 'self'
          ? `Seen through the dreamer's own eyes, looking down at their own body${wear ? `, in ${wear}` : ''}.`
          : "Seen through the dreamer's own eyes: the dreamer is behind the camera, out of the picture.",
    );
  }

  // 4. Each one in the picture by their image: only their face, hair and clothes from it; the pose is the figure's.
  const people = s.inView.filter((e) => e.kind === 'character' && !(pov && e.isDreamer));
  for (const e of people) {
    const k = at((r) => r.role === 'identity' && r.subjects.includes(e.id));
    const pose = poseIn(s.camera.view, e.name);
    const figure = mockUp ? said1(e, 'figure') : sentence(e.name).replace(/\.$/, '');
    out.push(
      k
        ? `${figure} ${becomeOf(e)} ${e.name} from ${tag(k)}: take only ${e.said === 'animal' ? 'how it looks' : e.said === 'people' ? 'how they look' : 'their face, hair and clothes'} from ${tag(k)}${mockUp ? `, and keep ${poseWord(e)}${pose ? ` (${pose})` : ''}` : ''}.`
        : `${figure} ${becomeOf(e)} ${becomes(e)}${pose && mockUp ? `, ${pose}` : ''}.`,
    );
  }
  // 5. The things, by their image, at their size on the canvas.
  const things = s.inView.filter((e) => e.kind === 'prop');
  for (const e of things) {
    const k = at((r) => r.role === 'prop' && r.subjects.includes(e.id));
    const shape = mockUp ? said1(e, 'shape') : sentence(e.name).replace(/\.$/, '');
    const c = colourOf(e.id);
    out.push(
      mockUp && c && dot(e)
        ? `The ${c} dot marks where ${k ? `the ${e.name.replace(/^the\s+/i, '')} from ${tag(k)}` : becomes(e)} is: draw it there at its own size, small in the picture${k && nowOf(e) ? `, ${nowOf(e)}` : ''}.`
        : k
          ? `${shape} becomes the ${e.name.replace(/^the\s+/i, '')} from ${tag(k)}${nowOf(e) ? `, ${nowOf(e)}` : ''}${mockUp ? ', at its size in the canvas' : ''}.`
          : `${shape} becomes ${becomes(e)}.`,
    );
  }
  // 6. Counts, in a sentence of their own: Qwen takes "Exactly" literally, so only who and what is one of a kind is
  //    counted; a group or a crowd, and a thing named in the plural ("the little boats", "hundreds of letters"),
  //    is said after it without a number ("one little boats", and a crowd counted as one person, 1 Oct).
  const many = (e: SheetElement) =>
    e.group ||
    /^(?:the\s+)?(?:hundreds|dozens|many|several|some|a few|lots)\b/i.test(e.name) ||
    /[^suai']s$/i.test(e.name);
  // An animal is counted as what it is ("one dog"), never as a person.
  const solo = people.filter((e) => !many(e) && e.said !== 'animal');
  const animals = people.filter((e) => !many(e) && e.said === 'animal');
  const counted = [
    ...(solo.length
      ? [`${count(solo.length)} ${solo.length === 1 ? 'person' : 'people'} (${solo.map((e) => e.name).join(', ')})`]
      : []),
    ...[...animals, ...things.filter((e) => !many(e))].map((e) => `one ${e.name.replace(/^the\s+/i, '')}`),
  ];
  const besides = [...people, ...things].filter(many).map((e) => e.name);
  if (counted.length)
    out.push(
      `Exactly ${counted.join(' and ')} in the picture${besides.length ? `, with ${besides.join(' and ')}` : ''}.`,
    );

  // 7. The place, by its image: its look, seen from the canvas's camera.
  if (place) {
    const now = at((r) => r.role === 'location' && r.source === 'ghost');
    const k = now ?? at((r) => r.role === 'location' && r.subjects.includes(place.id));
    out.push(
      k
        ? `The place is ${place.name}: its ground, walls and materials take the look of ${tag(k)}${mockUp ? `, seen from ${tag(1)}'s camera` : ''}.`
        : `The place is ${place.name}: ${firstOf(place.look)}.`,
    );
  }
  // An earlier picture: only its place and light.
  const earlier = at((r) => r.role === 'composition');
  if (earlier) out.push(`From ${tag(earlier)} take only the look of the place and its light.`);

  // 8. What happens, how each one is now, the moment's conditions, the one thing to show: the sheet's own words.
  const strip = (id: string, head: RegExp) => (lines[id] ?? '').replace(head, '').trim();
  const happens = strip('happens', /^What happens in this frame:\s*/i);
  if (happens) out.push(sentence(happens));
  const now = strip('now', /^How each one is at this moment:\s*/i);
  if (now) out.push(sentence(now));
  const conditions = strip('conditions', /^$/);
  if (conditions) out.push(sentence(conditions));
  if (s.story.point) out.push(`It shows ${lower(s.story.point.replace(/[.\s]+$/, ''))}.`);
  // What in the picture shows its beat (`visible_device`): the clock's hands at three, the card held out.
  if (s.device) out.push(`It shows it by ${lower(s.device.replace(/[.\s]+$/, ''))}.`);

  // 9. Writing: what the story writes, as marks; the mock-up's labels go with the grey.
  if (s.story.writing.length) out.push(`The only writing is ${s.story.writing.join(', ')}.`);
  if (mockUp && key)
    out.push(
      `The flat colours of ${tag(1)} only show who and what is where: everyone and everything takes the colours of their own image and of the story, and every surface in the finished picture is plain.`,
    );
  else if (mockUp)
    out.push(
      `Every grey surface of ${tag(1)} becomes the real thing it stands for; its labels only name the shapes, and every surface in the finished picture is plain.`,
    );
  // Labels and markers are notes on the mock-up: what goes where, never drawn.
  if (mockUp && key?.some((k) => k.labelled))
    out.push(
      `The labels and markers in ${tag(1)} are notes that say what goes where: each labelled marker becomes the real thing its label names, at that place and size, and the finished picture has the things only, with the labels and markers gone.`,
    );

  // 10. The style, in one sentence, and its colours.
  const o = s.style.option;
  const colours = [...new Set(o.palette_hex.map(colourName))];
  out.push(
    `Style: ${o.name}, ${[...o.tokens.slice(0, 4)].join(', ')}; colours ${colours.join(', ')}, with each person and thing in the colours of its image.`,
  );
  // 11. One clause for everything else.
  if (base && !mockUp) out.push(`Everything else in ${tag(1)} stays as it is.`);

  return { prompt: out.filter(Boolean).join(' '), images: sent.map((x) => x.img) };
}
