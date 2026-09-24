// The confidence gate: nothing is paid for until the harness is sure the picture will come out
// right. Code checks what it can know for certain; Jev reads the exact prompt the picture would
// be sent and says how likely it is to contradict itself, to show someone twice, or to leave
// unclear what the picture is. A picture that fails is held with its reasons and never drawn
// on a guess; what depends on it waits. Pictures were redrawn for things a reading of their
// prompt would have caught: a state the moment itself replaced, a baby drawn once inside a
// family and again on her own, "you" in an instruction to a picture (23-24 Sep).
import type { JevFn, Question } from './jev';
import type { Item } from './sheets';

// Set on the streetcar dream's own prompts (24 Sep): a prompt made to contradict itself read
// 0.96-0.97 and its plain version 0.22; the two with a baby drawn twice read 0.78-0.83 on "twice",
// everything else 0.16 at most; a prompt with who is in it taken out read 0.27 on "clear" against
// 0.90. Clean sketches of people and places with their look read 0.7-0.84 on "clear"; a lever with
// no description at all read 0.56, rightly: its artist would have had to invent it.
/** Above this, a reading counts as a real risk and the picture is held. */
export const MAX_CONTRADICTS = 0.3;
/**
 * A moment asks for more than a sketch, and Jev's reading of a contradiction rises with how much
 * a prompt asks: taking out any one line of a rich, sound moment lowered it by 0.05-0.11, none by
 * more, from 0.35-0.45. Real ones read higher: a seat on a train roof 0.48, a baby drawn twice
 * 0.66-0.81, a recast moment still naming the conductor 0.83-0.91, a deliberately broken prompt
 * 0.96 (24 Sep).
 */
export const MAX_CONTRADICTS_MOMENT = 0.45;
/**
 * Up to here, a moment's contradiction reading may be the diffuse rise that comes with a long
 * prompt: it is held only when one line of it carries the reading. m6 of the streetcar read 0.47
 * and no line left out lowered it by more than 0.04; the same prompt with the family planted on
 * the roof it says they are not on read 0.57, and a dreamer planted in a seat reading a newspaper
 * 0.90, falling to 0.32 without that line (24 Sep).
 */
export const DIFFUSE_UP_TO = 0.55;
/** What leaving one line out must lower a reading by for that line to be what it is about. */
export const LOCAL_DROP = 0.08;
/** Someone drawn twice read 0.75-0.83; the same person merely named twice, 0.25-0.31. */
export const MAX_TWICE = 0.4;
/** Below this, the prompt is not clear enough to draw. */
export const MIN_CLEAR = 0.7;
/**
 * An in-between picture is an edit of a sketch, and is asked whether its one change is plain: sound
 * edits read 0.61-0.85, the same edits with the change made vague 0.08-0.21 (24 Sep). Asked as a
 * scene ("who, where, what happens"), every one of them was held.
 */
export const MIN_EDIT_CLEAR = 0.5;
/** Below this, it is not clear what to take from each attached image. */
// Real problems with what an image is for read 0.31-0.46 (a baby drawn twice, a seat on a train
// roof); clean prompts 0.6 and up (24 Sep).
export const MIN_REFS_CLEAR = 0.6;
/** The model takes 14 images; a dozen leaves each one legible. */
export const MAX_REFERENCES = 12;

export type GateReading = {
  contradicts: number;
  twice: number;
  clear: number;
  refsClear: number | null;
  /** The line a contradiction reading rests on, and how much leaving it out lowers the reading. */
  around?: { line: string; drop: number };
};
export type GateResult = { findings: string[]; reading: GateReading | null };

/**
 * How clear a sketch must be is not how clear a moment must be: a sketch is where a face is first
 * invented, then kept. Asked whether the artist would have to invent anything, every person's
 * sketch read 0.16-0.68, the plainly described ones included (24 Sep).
 */
const SHEET_CLEAR: Question = {
  type: 'noul',
  instructions:
    'This describes a reference picture of one person, group, place or thing, drawn once so that every later picture can copy it. Does it give enough of how it looks that two artists would draw recognisably the same one? For a person: age, build, hair and clothes; for a group: who is in it and how each looks; for a place: what kind of place it is, its layout and what stands in it; for a thing: its shape, materials and colours. The face, small details and the pose are the artist\'s to choose and do not count.',
  criteria: {
    true: 'what kind it is and what makes it recognisable are given',
    false: 'something that decides how it looks is missing and would have to be invented',
  },
};

/**
 * What makes a sketch recognisable, one part per question, so a sketch held for being unclear
 * says what it lacks and its rewording fills exactly that ("not clear enough" alone left a train
 * roof as thin as before, 24 Sep).
 */
export const FACETS: Record<'character' | 'location' | 'prop', Record<string, string>> = {
  character: {
    age: 'roughly how old they are',
    build: 'their build',
    hair: 'their hair',
    clothes: 'what they wear, with colours',
  },
  location: {
    kind: 'what kind of place it is',
    layout: 'how it is laid out',
    contents: 'what stands or lies in it',
    matter: 'what it is made of, or its colours and light',
  },
  prop: {
    shape: 'its shape and size',
    materials: 'what it is made of',
    colours: 'its colours',
  },
};

const EDIT_CLEAR: Question = {
  type: 'noul',
  instructions:
    'These instructions edit an attached reference picture of one person, place or thing to make one change. Is the change said plainly enough that two artists editing the same picture would make recognisably the same change, and is it plain what stays as it was?',
  criteria: {
    true: 'the change, and what stays as it was, are both plain',
    false: 'the change is vague, or it is unclear what stays as it was',
  },
};

const EDIT_REFS: Question = {
  type: 'noul',
  instructions:
    'The instructions name each attached image ("Image 1 is …"). Is it plain which image is the one to edit, and what, if anything, to take from each other image?',
  criteria: {
    true: 'the image to edit, and what each other image gives, are plain',
    false: 'which image to edit, or what another image is for, is unclear',
  },
};

/** The questions Jev is asked about one picture's prompt: one narrow judgment each. */
export function gateQuestions(
  withImages: boolean,
  sheet = false,
  kind?: 'character' | 'location' | 'prop',
  edit = false,
): Record<string, Question> {
  const facets = sheet && kind ? FACETS[kind] : {};
  if (edit)
    return {
      ...gateQuestions(withImages),
      clear: EDIT_CLEAR,
      ...(withImages ? { refs_clear: EDIT_REFS } : {}),
    };
  return {
    ...Object.fromEntries(
      Object.entries(facets).map(([id, what]) => [
        `has_${id}`,
        {
          type: 'noul' as const,
          instructions: `Does this description of a reference picture say ${what}, plainly enough to draw it?`,
          criteria: { true: `it says ${what}`, false: `${what} is missing or too vague to draw` },
        },
      ]),
    ),
    ...(withImages
      ? {
          refs_clear: {
            type: 'noul' as const,
            instructions:
              'The instructions list the images attached to this picture ("Image 1: …", "Image 2: …"). For every attached image, do they say what it is and exactly what to take from it and what to leave out, without two images claiming the same thing?',
            criteria: {
              true: 'each attached image has a clear, distinct purpose',
              false: 'some image is unexplained, or its purpose is vague or clashes with another image',
            },
          },
        }
      : {}),
    contradicts: {
      type: 'noul',
      instructions:
        'These are the complete instructions an artist gets for one picture, including what each attached image is for. Do two parts of them disagree about what the picture shows: how someone or something looks, who is in it, where it is, or what is happening? How it is drawn (the medium, the finish, the mood, the light) does not count.',
      criteria: {
        true: 'two parts disagree about what is shown, and the artist would have to pick one by guessing',
        false: 'they agree about what is shown; repeated, overlapping or stylistic instructions are fine',
      },
    },
    twice: {
      type: 'noul',
      instructions:
        'Following these instructions, would the picture show any one person, animal or object twice, or two different versions of someone who is one individual (someone described once inside a group and again on their own, say)?',
      criteria: {
        true: 'someone or something would appear twice, or as two versions of one individual',
        false: 'each one appears once',
      },
    },
    clear: sheet
      ? SHEET_CLEAR
      : {
          type: 'noul',
          instructions:
            'Could an artist draw this picture from these instructions without having to invent who or what is in it, where it is, or what is happening?',
          criteria: {
            true: 'who or what, where and what happens are all given; only ordinary detail is left to the artist',
            false: 'the artist would have to invent who is there, where it is, or what happens',
          },
        },
  };
}

/**
 * What code can know for certain is wrong before anything is drawn: what the continuity plan
 * found for this picture. (Someone in a group's look who also has their own sketch is joined into
 * one in the prompt itself, and Jev's "twice" reading checks it held.)
 */
export function preflight(_inView: Item[], planIssues: string[] = []): string[] {
  return [...planIssues];
}

export type Reference = { media_id: string; role: string };

/**
 * What code can check about the images a picture is made from: each one is described in the
 * prompt with what to take from it, an edit base is the first and only one, none is attached
 * twice or is unapproved, everything in view brings its sketch, and they fit the model.
 */
export function checkReferences(
  prompt: string,
  references: Reference[],
  opts: { approved?: Set<string>; mustInclude?: { name: string; mediaId: string }[] } = {},
): string[] {
  const out: string[] = [];
  // Moments list "Image 2: …"; an in-between reference says "Image 1 is …".
  const described = new Set([...prompt.matchAll(/\bImage (\d+)(?::| is\b)/g)].map((m) => Number(m[1])));
  references.forEach((_, i) => {
    if (!described.has(i + 1)) out.push(`image ${i + 1} is attached with no word on what to take from it`);
  });
  for (const n of described) if (n > references.length) out.push(`image ${n} is described but not attached`);
  const bases = references.map((r, i) => (r.role === 'base' ? i : -1)).filter((i) => i >= 0);
  if (bases.length > 1) out.push('more than one picture is marked as the one to edit');
  if (bases.length === 1 && bases[0] !== 0) out.push('the picture to edit is not the first image');
  const ids = references.map((r) => r.media_id);
  if (new Set(ids).size !== ids.length) out.push('an image is attached twice');
  if (references.length > MAX_REFERENCES) out.push(`${references.length} images, more than ${MAX_REFERENCES}`);
  if (opts.approved)
    for (const [i, id] of ids.entries())
      if (!opts.approved.has(id)) out.push(`image ${i + 1} is not an approved picture`);
  for (const m of opts.mustInclude ?? [])
    if (!ids.includes(m.mediaId)) out.push(`${m.name} is in view but their sketch is not attached`);
  return out;
}

/** Jev's reading of the prompt, and what in it holds the picture back. */
export async function readPrompt(
  jev: JevFn,
  prompt: string,
  opts: { withImages?: boolean; sheet?: boolean; kind?: 'character' | 'location' | 'prop'; edit?: boolean } = {},
): Promise<GateResult> {
  const withImages = opts.withImages ?? /\bImage 1(?::| is\b)/.test(prompt);
  const call = await jev(prompt, gateQuestions(withImages, opts.sheet, opts.kind, opts.edit));
  const noul = (id: string) => {
    const a = call.answers?.[id];
    return a && a.type === 'noul' ? a.noul : null;
  };
  const contradicts = noul('contradicts');
  const twice = noul('twice');
  const clear = noul('clear');
  const refsClear = withImages ? noul('refs_clear') : null;
  // No reading, no confidence: it is held and tried again, never drawn blind.
  if (contradicts === null || twice === null || clear === null || (withImages && refsClear === null))
    return { findings: [`the prompt could not be checked (${call.error ?? 'no answer'})`], reading: null };
  const findings: string[] = [];
  let around: GateReading['around'];
  if (contradicts > (opts.sheet ? MAX_CONTRADICTS : MAX_CONTRADICTS_MOMENT)) {
    // Which line it rests on: said with the finding, so a rewording knows where to look; and for a
    // reading that may be only the prompt's length, whether any line carries it at all.
    around = opts.sheet ? undefined : await carrier(jev, prompt, contradicts);
    const diffuse = !opts.sheet && contradicts <= DIFFUSE_UP_TO && (around?.drop ?? 0) < LOCAL_DROP;
    if (!diffuse)
      findings.push(
        `its instructions may contradict each other (${contradicts.toFixed(2)})${around && around.drop >= LOCAL_DROP ? `, around: "${around.line.slice(0, 160)}"` : ''}`,
      );
  }
  if (twice > MAX_TWICE) findings.push(`someone may be drawn twice (${twice.toFixed(2)})`);
  if (clear < (opts.edit ? MIN_EDIT_CLEAR : MIN_CLEAR)) {
    // Which parts of its look are missing, when a sketch is unclear: what its rewording must fill.
    const missing = Object.entries(opts.sheet && opts.kind ? FACETS[opts.kind] : {})
      .filter(([id]) => (noul(`has_${id}`) ?? 1) < 0.5)
      .map(([, what]) => what);
    findings.push(
      `what it shows is not clear enough to draw (${clear.toFixed(2)})${missing.length ? `: missing ${missing.join('; ')}` : ''}`,
    );
  }
  if (refsClear !== null && refsClear < MIN_REFS_CLEAR)
    findings.push(`what to take from each image is not clear enough (${refsClear.toFixed(2)})`);
  return { findings, reading: { contradicts, twice, clear, refsClear, ...(around ? { around } : {}) } };
}

/** The line whose leaving out lowers a contradiction reading most, and by how much. */
async function carrier(jev: JevFn, prompt: string, whole: number): Promise<GateReading['around']> {
  const only = { contradicts: gateQuestions(false).contradicts };
  const lines = prompt.split('\n');
  const without = await Promise.all(
    lines.map(async (line, i) => {
      if (!line.trim()) return null;
      const call = await jev(lines.filter((_, j) => j !== i).join('\n'), only);
      const a = call.answers?.contradicts;
      return a && a.type === 'noul' ? { line, drop: whole - a.noul } : null;
    }),
  );
  return without.filter((x): x is { line: string; drop: number } => !!x).sort((a, b) => b.drop - a.drop)[0];
}
