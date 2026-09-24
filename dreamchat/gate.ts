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
export const MAX_TWICE = 0.25;
/** Below this, the prompt is not clear enough to draw. */
export const MIN_CLEAR = 0.7;
/** Below this, it is not clear what to take from each attached image. */
export const MIN_REFS_CLEAR = 0.7;
/** The model takes 14 images; a dozen leaves each one legible. */
export const MAX_REFERENCES = 12;

export type GateReading = { contradicts: number; twice: number; clear: number; refsClear: number | null };
export type GateResult = { findings: string[]; reading: GateReading | null };

/** The questions Jev is asked about one picture's prompt: one narrow judgment each. */
export function gateQuestions(withImages: boolean): Record<string, Question> {
  return {
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
    clear: {
      type: 'noul',
      instructions:
        'Could an artist draw this picture from these instructions without having to invent who or what is in it, where it is, or what is happening (for a reference picture of one person, place or thing: without inventing what it looks like)?',
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
  withImages = /\bImage 1(?::| is\b)/.test(prompt),
): Promise<GateResult> {
  const call = await jev(prompt, gateQuestions(withImages));
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
  if (contradicts > MAX_CONTRADICTS)
    findings.push(`its instructions may contradict each other (${contradicts.toFixed(2)})`);
  if (twice > MAX_TWICE) findings.push(`someone may be drawn twice (${twice.toFixed(2)})`);
  if (clear < MIN_CLEAR) findings.push(`what it shows is not clear enough to draw (${clear.toFixed(2)})`);
  if (refsClear !== null && refsClear < MIN_REFS_CLEAR)
    findings.push(`what to take from each image is not clear enough (${refsClear.toFixed(2)})`);
  return { findings, reading: { contradicts, twice, clear, refsClear } };
}
