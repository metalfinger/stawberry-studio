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

/** Said as what it becomes: with its look where the look says more than a colour ("red" says less than its name). */
const becomes = (e: SheetElement) =>
  firstOf(e.look).split(/\s+/).length >= 3 ? `${e.name}, ${firstOf(e.look)}` : e.name;

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
 * A cut's prompt for Qwen, with the images it sends, in order. `refs` are the assembler's references (one per image
 * offered, in the same order as `images`), `lines` its paragraphs by id, for what happens, how each one is now and the
 * moment's conditions, said as the assembler says them.
 */
export function qwenEdit(s: CutSheet, refs: AssembledRef[], images: Img[], lines: Record<string, string>): QwenPrompt {
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
    .filter((x) => !(pov && x.ref.role === 'identity' && x.ref.of === s.dreamer.id));
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
  const base = sent[0]?.ref;
  const mockUp = base?.source === 'mockup';
  const medium = mediumOf(s.style.option);
  // 1. The operation, and what image 1 keeps.
  if (mockUp)
    out.push(
      `Turn the grey mock-up ${tag(1)} into a finished picture, ${medium}: ${tag(1)} is the canvas, so keep its camera, its framing, and the place, size, pose and facing of every grey figure and shape exactly.`,
    );
  else if (base)
    out.push(
      `Edit ${tag(1)}, ${medium}: keep its camera, its framing, and everyone and everything in it where they are and as they look, and change only what this moment changes.`,
    );
  else out.push(`A finished picture, ${medium}, in a ${s.camera.shape} frame.`);

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
    const figure = mockUp ? `The grey figure labelled ${e.name}` : sentence(e.name).replace(/\.$/, '');
    out.push(
      k
        ? `${figure} becomes ${e.name} from ${tag(k)}: take only ${e.said === 'animal' ? 'how it looks' : e.said === 'people' ? 'how they look' : 'their face, hair and clothes'} from ${tag(k)}${mockUp ? `, and keep the figure's pose${pose ? ` (${pose})` : ''}` : ''}.`
        : `${figure} becomes ${becomes(e)}${pose && mockUp ? `, ${pose}` : ''}.`,
    );
  }
  // 5. The things, by their image, at their size on the canvas.
  const things = s.inView.filter((e) => e.kind === 'prop');
  for (const e of things) {
    const k = at((r) => r.role === 'prop' && r.subjects.includes(e.id));
    const shape = mockUp ? `The grey shape labelled ${e.name}` : sentence(e.name).replace(/\.$/, '');
    out.push(
      k
        ? `${shape} becomes the ${e.name.replace(/^the\s+/i, '')} from ${tag(k)}${mockUp ? ', at its size in the canvas' : ''}.`
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

  // 9. Writing: what the story writes, as marks; the mock-up's labels go with the grey.
  if (s.story.writing.length) out.push(`The only writing is ${s.story.writing.join(', ')}.`);
  if (mockUp)
    out.push(
      `Every grey surface of ${tag(1)} becomes the real thing it stands for; its labels only name the shapes, and every surface in the finished picture is plain.`,
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
