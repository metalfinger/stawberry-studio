// The text clean-ups and word lists S6 retires one at a time (HARNESS_PLAN.md, S6 eval), each by name, with a
// switch that turns it off where it runs. Turned off, a clean-up does nothing: the text passes through as it came,
// and a word list matches nothing. Every prompt that changes when one is off is a prompt it acts on today, which
// is what `evals/retire.ts` measures before S6 replaces it with a typed fact of the cut sheet or the story record.
//
// DREAMCHAT_RETIRE=<name>[,<name>…] turns them off; unset, the default, every one runs as it always has. An eval
// switch: never set it when drawing. A name that is not one of these is an error, so a misspelt switch can never
// measure nothing. Only what the cut sheet and the record run while they are built reads it: `assembleCut`, which
// writes from the sheet alone, never does (test/cutsheet.test.ts). S4's word lists (camera.ts) have theirs too.
//
// S6 builds its one prompt builder behind DREAMCHAT_ONE_BUILDER (below): each step of its ledger, once built,
// retires one clean-up (read here as off) or makes one duplicated computation one, and puts the typed fact in
// its place.
export const CLEANUPS = {
  gone: 'frames.ts withoutGone: a moment\'s words without what is gone from it ("where the sea used to be")',
  after_words:
    "frames.ts lookIn (withoutWords): a sketch's words without those the story record moved to after a change (plan.unsaid)",
  vague: 'frames.ts lookIn: a look field that says nothing a picture can show is left out (producer.ts VAGUE)',
  shades:
    'frames.ts lookIn: in a style of one colour, a filled-in colour is said as a shade of it (sheets.ts inShades)',
  pose: "frames.ts lookIn: a sketch's pose and framing are left out of its look (sheets.ts withoutPose)",
  members: "frames.ts lookIn: a group's words about someone with a sketch of their own are left out",
  writing: "frames.ts writingIn: quoted words in the moment's words or a look are the picture's only writing",
  spoken: 'frames.ts writingIn: a quote after a word of speaking is speech, not writing (SPOKEN, WRITTEN_ON)',
  state_verb: "record.ts passing: a look's passing state is a change where a moment's words tell it (STATE_VERB)",
  fills: 'record.ts passing: water, snow, sand, fog or smoke told coming into a place is a change of it (FILLS)',
  opens: 'record.ts openings: what a moment opens is open from there; a look that had it open is from after (OPENS)',
  not_there: 'record.ts namedInWords: someone named as gone, looked for, heard or waited for is gone (NOT_THERE)',
  self: "record.ts momentsOf: through the dreamer's eyes, words of them looking at themselves put them in view (SELF)",
  taken:
    'record.ts staysWithHolder: a thing given or taken where it is first held was not in their hands before (TAKEN)',
  holds_name:
    'record.ts namedInWords: a name before "stall", "tank", "bowl" names what it is of, not itself (HOLDS_NAME)',
  shut_away: 'record.ts shutAway: a thing opened is shut once it is carried into another place',
  hands:
    "camera.ts handsIn: through the dreamer's eyes, their hands show where the moment's words have them do something with them (HAND_VERB)",
  own_body:
    "camera.ts selfIn: through the dreamer's eyes, their body shows where the words have them look at themselves",
  going:
    'camera.ts goingIn: a vehicle named just before a word of going, or driven just after one, is going (GOING, PROPELLED, STOPPING)',
  water_level: "camera.ts waterLevel: how high water stands, from the record's words for it (WATER, BODY, DEEP)",
  openings: "camera.ts openingsIn: the windows and doors on a place's walls, from its look (WALL_WORDS)",
} as const;

export type Cleanup = keyof typeof CLEANUPS;

export const CLEANUP_NAMES = Object.keys(CLEANUPS) as Cleanup[];

let seen: { raw: string; off: Set<Cleanup> } | null = null;

/** The clean-ups turned off by DREAMCHAT_RETIRE; an unknown name throws. */
export function retiredSet(raw = process.env.DREAMCHAT_RETIRE ?? ''): Set<Cleanup> {
  if (seen?.raw === raw) return seen.off;
  const names = raw
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const unknown = names.filter((x) => !(x in CLEANUPS));
  if (unknown.length)
    throw new Error(`DREAMCHAT_RETIRE: no clean-up called ${unknown.join(', ')} (${CLEANUP_NAMES.join(', ')})`);
  seen = { raw, off: new Set(names as Cleanup[]) };
  return seen.off;
}

/** Whether a clean-up is turned off: DREAMCHAT_RETIRE names it, or the one prompt builder has retired it. */
export const retired = (name: Cleanup): boolean => retiredSet().has(name) || builds(name);

/**
 * Whether one of `lookIn`'s clean-ups (frames.ts) is turned off: only where DREAMCHAT_RETIRE names it. Since
 * step 8 the sheet says a look from the story record, and a step moves each of lookIn's clean-ups into the
 * record for that path; lookIn says a look only where the record does not (a sketch never drawn, a group whose
 * members have sketches of their own, a picture rebuilt as drawn, the record off), and keeps each clean-up there
 * until it has none of those left: turned off with the step, its words would come back on them.
 */
export const offInLookIn = (name: Cleanup): boolean => retiredSet().has(name);

// ── the one prompt builder (S6) ─────────────────────────────────────────────────────────────────

/**
 * S6's steps, in the order of the ledger (HARNESS_PLAN.md, S6 eval), each built behind DREAMCHAT_ONE_BUILDER:
 * a duplicated computation made one, or a clean-up or word list retired for the typed fact that takes its
 * place. A clean-up's step has its name: once built, `retired` reads it as off. One step is added at a time,
 * and measured against the one before.
 */
export const BUILDER_STEPS: readonly string[] = [
  // 1. One story record per state of the dream, read by the plan, the sheet, the panel's tree and the log.
  'one_record',
  // 2. One tree: not built (the panel's is a plan made again, the sheet's the plan drawn from; one after 17).
  // 3. One image cap: frames.ts MAX_IMAGES, the same number everywhere, so no switch.
  // 4. The assembler's paragraph ids and each image's subjects, read by the gate and the evals.
  'paragraph_ids',
  // 5. Names from one source, the story record's `called`, and no id in words: an id the producer wrote into a
  //    moment's words is its name once, when the dream is read (producer.ts namesForIds, before only with the
  //    camera rules), and the producer is told to write names.
  'names',
  // 6. Kinds from one source, the story record's: person, animal, group or crowd (a crowd of animals, an
  //    animal still), place or thing; the sheet and the tags read it, not isAnimal and isGroup again.
  'kinds',
  // 7. Who is in view, once: the story record's shows and the camera's view (what the floor plan sees), on the
  //    cut sheet; the gate reads the sheet's, not inViewOf again.
  'in_view',
  // 8. How each one looks, once: the story record's base facts, each clause with its basis, said at assembly
  //    (a guessed colour in the style's shades); a rebuild gives the record the sketches as drawing does.
  'looks',
  // 9-10. after_words and vague: nothing to build. Since step 8 the record's look has neither (its base lacks the
  //    words from after a change; a look field that says nothing is left out whole), and lookIn keeps both for
  //    where it still says the look (offInLookIn): they go with it.
  // 11. A place's or a thing's pose, stripped once, by the record, as it already strips a person's: the sheet's
  //    look no longer strips it again.
  'pose',
  // 12. A group's words about someone with a sketch of their own: the record says whom each clause of a group's
  //    look is about, and the sheet leaves those whose member is in view, as lookIn left their pieces.
  'members',
  // 13. A guessed colour said as a shade at assembly since step 8; with this step a colour the dream itself gives
  //    stays whole in a guessed clause too, so it is said one way in a prompt (the library's green glass lamps).
  'shades',
];

let built: { raw: string; steps: Set<string> } | null = null;

/**
 * The steps DREAMCHAT_ONE_BUILDER turns on: unset or off, none (every prompt as before, byte for byte); none,
 * the builder on with no step (its typed readings read, nothing retired); on, every step built; a step's name,
 * the steps up to and including it, so a step is measured against the one before. Anything else is an error.
 */
export function builderSteps(raw = process.env.DREAMCHAT_ONE_BUILDER ?? ''): Set<string> {
  if (built?.raw === raw) return built.steps;
  const v = raw.trim().toLowerCase();
  let steps: string[];
  if (!v || v === 'off' || v === 'none') steps = [];
  else if (v === 'on') steps = [...BUILDER_STEPS];
  else if (BUILDER_STEPS.includes(v)) steps = BUILDER_STEPS.slice(0, BUILDER_STEPS.indexOf(v) + 1);
  else
    throw new Error(
      `DREAMCHAT_ONE_BUILDER: on, off, none or a step (${BUILDER_STEPS.join(', ') || 'none built yet'}), not ${raw}`,
    );
  built = { raw, steps: new Set(steps) };
  return built.steps;
}

/** Whether the one prompt builder is on at all: DREAMCHAT_ONE_BUILDER set, and not to off. */
export function oneBuilder(): boolean {
  const v = (process.env.DREAMCHAT_ONE_BUILDER ?? '').trim().toLowerCase();
  builderSteps();
  return !!v && v !== 'off';
}

/** Whether a step of the one prompt builder is built and switched on. */
export const builds = (step: string): boolean => builderSteps().has(step);

/** Runs `fn` with exactly these clean-ups turned off, and puts the switch back as it was, whatever happens. */
export function withRetired<T>(names: Cleanup[], fn: () => T): T {
  retiredSet(names.join(','));
  const was = process.env.DREAMCHAT_RETIRE;
  if (names.length) process.env.DREAMCHAT_RETIRE = names.join(',');
  else delete process.env.DREAMCHAT_RETIRE;
  try {
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_RETIRE;
    else process.env.DREAMCHAT_RETIRE = was;
  }
}
