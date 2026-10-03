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
  // 14. A look said once: in its image's line, where the image is; "In it" names who and what has an image and
  //    says the look only of what has none (the sheet's `once.look`, read by the assembler).
  'look_once',
  // 15. The colours the dream gives, said once: in many colours the style lists only those no line above says,
  //    and says the rest keep exactly "as said above"; in one colour the style's list is the one list, and an
  //    image's line points to it (the sheet's `once.colour`, read by the assembler).
  'colour_once',
  // 16. How each one is now, said once: a part an in-between picture shows is said there, its sketch's "Except"
  //    points to that picture, and "How each one is at this moment" leaves out what the images' lines say (the
  //    sheet's `once.state`, read by the assembler). The sources of a state (the plan's and the record's) are
  //    still two: the rest of the row.
  'state_once',
  // Not a ledger row: found reading the viewer (30 Sep). An earlier picture's own words: sent for who someone is,
  //    as last drawn, it says them by what they are (an animal by its kind, size, build, coat and markings, never a
  //    face or clothes; a group as more than one), and never for someone turned into something else, whose
  //    in-between picture of what they are now is their one image; the dream's jump is said with one full stop (the
  //    sheet's `earlierWords`, read by the assembler).
  'earlier_words',
  // Not a ledger row: found reading every prompt (30 Sep). A colour the dream gives is the colour and what it colours,
  //    ending at the noun: never what the moment says it does ("grey heron stands", "silver fish about").
  'told_colours',
  // Not a ledger row: the owner's choice (30 Sep). Writing the story needs but does not quote (a board covered with
  //    numbers, letters addressed to the dreamer) shows as marks no one could read, where the prompt said every
  //    surface is blank; a quoted word with a number in it is counted in characters, not letters.
  'story_marks',
  // Not a ledger row: from the read of every prompt (30 Sep). What the moments need drawn and the producer never
  //    cast (the red tractor ridden in, the jellyfish ahead, the floating books), and how big each body is (a cat as
  //    big as a bus, a child of six), from one writer reading per dream, grounded in the dream's words (cast.ts): the
  //    things cast in the breakdown before anything reads it; weather and matter said as the picture's condition.
  'cast_named',
  // Not a ledger row: from the read of every prompt (30 Sep). Where image 1 carries the layout (the mock-up, or the
  //    picture edited), the picture before a jump gives only its light and colours and how anyone also here looks,
  //    never its framing: two layouts disagreed, and a third-person framing went into the dreamer's own view.
  'jump_words',
  // Not a ledger row: from the read of every prompt (30 Sep). Who holds what at a moment is what its typed act does
  //    at the instant (a handover mid-act, a thing set down), not what the floor plan left from the scene.
  'held_acts',
  // Not a ledger row: from the read of every prompt (30 Sep). Whoever an act took out of the place through a way out
  //    of it is not drawn back in where a later moment there only names them (the fish that swam out of the window).
  'gone_out',
  // Not a ledger row: each moment's typed acts reach planning (continuity's RecordPlan), to pose and place from: who
  //    climbs into the boat is not yet sitting in it.
  'plan_acts',
  // Not a ledger row: from the owner's picture check (30 Sep). Who and what a moment sees through an opening (a window,
  //    the round window in a door) is out past it on the floor plan, never on the camera's side of it.
  'plan_beyond',
  // Not a ledger row: from the owner's picture check (30 Sep). A colour the dreamer gave something at an earlier moment
  //    is still told wherever it is in view ("green corridor", said once at m1).
  'carried_colours',
  // Not a ledger row: from the night run on the local image machine (1 Oct). A cast thing's sketch is told what it is
  //    with its look and never what it does, and borrows the look of one of its kind the dream already has.
  'cast_looks',
  // Not a ledger row: from the owner's vehicle pairs (1 Oct). Through the dreamer's eyes, a moment that has them do
  //    something with their hands shows their hands doing it ("as they open the door"), never "at most" their hands.
  'own_hands',
  // 17. One copy of a moment, the one in force: a picture is sent from the plan made now, as an in-between picture
  //    already is, its cast and words refreshed from it (S9's fresh send, its own switch until now). A moment kept the
  //    plan of the last re-plan and the cast it was first put in with, while a rebuild reads the dream as it stands
  //    (2 of 61 moments sent with an out-of-date cast, S9). Row 2 (one tree) needs it.
  'fresh_send',
  // Not a ledger row: from the first new dream through the merged flow ("The Barley Degree", 1 Oct). Who someone is
  //    is said on their sketch, their age or not: "a woman" with no age in it was dropped, and G.H. was sketched a
  //    young man who looked like the dreamer.
  'sketch_who',
  // Not a ledger row: the same dream. A sketch takes the style's way of drawing, never its directions about other
  //    people: "background people softly blurred" put a crowd in every sketch.
  'sketch_style',
  // Not a ledger row: the same dream. A place's sketch says what is there, the place alone and empty, never "with no
  //    people in it", which drew people (the local machine; the owner: "Just use the Qwen model").
  'place_alone',
  // 2. One tree: the cut sheet reads the tree the panel shows, one plan (the plan made now, each moment held to the plan
  //    it is drawn from), the frames drawn, whether the prep is this dream's, the grounding notes and the goals; built
  //    after 17, the plan a moment is sent from (the step's place in the ledger, here at the end).
  'one_tree',
  // Not a ledger row: from a dream taken in as a dump (the Barley Degree, 1 Oct). A dream told wholly through the
  //    dreamer's eyes has its dreamer, as the camera: listed only where seen, they were on no floor plan, and 4 of 7
  //    moments had no camera. Placed on the plan, never sketched.
  'dreamer_camera',
  // Not a ledger row: the owner's rule (1 Oct), never guess the dreamer's sex or age. A guessed (unsaid) clause of their
  //    sketch that gives either is left out, and a guessed "who they are" with it; what they said of themselves stays.
  'dreamer_untold',
  // Not a ledger row: from the merged flow's packets (1 Oct). A sketch never names the dream's other people, places or
  //    things in its style: "The woman and the ice are rendered with more clarity", in a style's light, drew them into
  //    the room's sketch and the dreamer's (dream-0923-214527-927a).
  'sketch_subjects',
  // Not a ledger row: from the merged flow's imports (1 Oct). A dream taken in as a dump kept its setup and lost its
  //    turn (the Barley Degree's mix-up, Train's marzipan, Pool's call): their telling is read first, the strangest fact
  //    quoted from it and keyed (telling.ts); every told event quoted and checked against the moments, asked for once
  //    more where one is missing, and the one thing to show keeps their concrete words; the dreamer's own thought seen
  //    from outside, their face carrying it.
  'strangest',
  'told_events',
  'thought_outside',
  // Not a ledger row: from the counted prompt cases (G2). Whether a vehicle in view is moving at the instant is the typed
  //    reading's motion fact where it gives one, never only a going verb in the moment's words: the tractor's cab "vibrates
  //    with a low rumble" as it drives on, and nothing said which way it went (lighthouse-fresh m12).
  'plan_motion',
  // Not a ledger row: from the counted prompt cases (G2). What the typed reading has seen out past an opening, where it
  //    is not someone or something on the floor plan (the drowned city through the high round window), is said there,
  //    shown only through it, the wall around it solid: nothing bounded the city to the window (library-1 m5).
  'beyond_words',
  // Not a ledger row: from the counted prompt cases (G2). Whom or what someone attends to at the instant, as a typed act
  //    says it (looks at, watches, stands at, points at, reaches for), is what they face on the floor plan and what the
  //    words say they look at: the dreamer at the fish stall was turned to the old man (night-market m2).
  'plan_facing',
  // Not a ledger row: a dumped dream's moments of a crowd alone ("everyone in our house" in the dark, then going up the
  //    stairs to the roof) had no camera, the camera centred on everyone a moment holds but a crowd; shot on the crowd,
  //    or what the moment looks at, and never with what it looks at behind the camera (Neighbours, 1 Oct).
  'crowd_camera',
  // Not a ledger row: the merged flow's dream 3 (1 Oct). "Reaches" is a hand only reaching out, for or into something:
  //    "just as the dreamer reaches the man in the wheelchair" is arriving, and was drawn as a huge reaching hand.
  'reach_arrives',
  // Not a ledger row: the same dream. Someone the camera leaves outside the picture is not in it: "just outside the
  //    picture to the left is the man in the wheelchair" went out with his image all the same.
  'framed_only',
  // Not a ledger row: from the counted prompt cases (G2, its one model step). A group told only as a crowd, never
  //    sketched, is given ordinary clothes for who and where they are, as a guess (wardrobe.ts, one writer reading per
  //    dream): made real from the mock-up, the exam room's faceless students came out naked (heron m4).
  'extras_wardrobe',
  // Not a ledger row: from the merged flow's retell gate on its dumped dreams (2 Oct). A simile or a reason the dreamer
  //    gives is kept where a picture can show it, as what is seen ("soft, doughy stars"), never in its own words, and
  //    left to the narration where only a sound, a memory or a feeling carries it (a hum, a ringtone).
  'texture',
  // Not a ledger row: from the merged flow's first new dream (the Barley Degree, 1 Oct): a 1957 church meeting drawn
  //    modern. The dream's period, from its own words or the date it was recorded (era.ts), told to every sketch and
  //    every moment, a moment the dream sets in another time keeping its own; never in the style.
  'era',
  // Not a ledger row: from the merged flow's mock-up A/B (2 Oct). The people a moment is about stay in its frame, their
  //    heads in it: close shots came out a chin and a collar, and a look down on the train held a seat-back and knees
  //    (34 of 281 named people with their head cut, the saved dreams). A hand, a held thing or an insert needs no face.
  'subject_in_frame',
  // Not a ledger row: from the merged flow's Fan m8 and Shrunk m6 (2 Oct). Through the dreamer's eyes, what they look
  //    at that no way of looking shows (under the water, hidden inside a crowd) is looked at all the same, straight on:
  //    the cut had no camera, was "failed" and never drawn.
  'eyes_aimed',
  // Not a ledger row: from the merged flow's Shrinking Hand (2 Oct), and the cast's bodies parked on 30 Sep. Each figure
  //    and thing at the size the dream's words give it, in each moment they say (sizes.ts), the camera placed for them:
  //    the ants were a man on the kitchen counter, tiny Alina and her guests full size, hiding the shrunken building.
  'sizes',
  // Not a ledger row: from the merged flow's Grandmother on Wednesdays (2 Oct). A place's sketch is told by how it is
  //    built, never by what people do there (built.ts, one writer reading per dream): "the family meeting", "a room
  //    where the family gathers around a table", came out full of people in 4 of 4 takes, alone and empty all the same.
  'place_built',
  // Not a ledger row: from the merged flow's Grandmother on Wednesdays (2 Oct). A thing is drawn as the story last left
  //    it: at the size a change of it gives ("the bed sheet, size now a stamp"), and out of sight once a moment puts it
  //    into something that closes, until a moment names it again. Folded down to a stamp and put in the cutlery
  //    drawer, the sheet was a cloth two metres across lying on the drawer in both moments after.
  'thing_state',
  // Not a ledger row: from the merged flow's Train (2 Oct). Someone a moment's one thing to show sees past the people
  //    of a crowd is seen past them: the crowd stands across the line from the dreamer's eyes to them, a gap left to see
  //    them through. "The man in the wheelchair glimpsed past the people pressing in" had the people sat in rows at the
  //    far end of the hall, the man alone and in clear view across it.
  'crowd_between',
  // Not a ledger row: from the merged flow's fresh Grandmother (2 Oct). The things a moment's one thing to show names are
  //    in its picture, as the people it names are: "the grandmother laying the stamp among the knives and forks in her
  //    cutlery drawer" said the stamp outside the picture, off to the right, and a stamp pinched between their fingers
  //    was framed at its own size, her head out of the picture and the dreamer out of it.
  'things_in_frame',
  // E5, from the merged flow's Grandmother on Wednesdays (2 Oct). A moment whose beat is said, asked, a time or a
  //    schedule shows it by something seen (devices.ts, one writer reading per dream): "only on Wednesdays", "the 2-3pm
  //    appointment", "asks if she has eaten" and "our slot has gotten over" were each two people standing in a kitchen,
  //    and its review read none of them; drawn with a week of days, an appointment card, a wall clock going from two to
  //    three and her pointing at it, a stranger read every picture. Lettering only the dream's own days and times, put on
  //    in code after; a thought or speech bubble only where no thing shows a said or thought beat better.
  'visible_device',
  // Not a ledger row: from the merged flow's fresh Grandmother (2 Oct). A part's state a moment's own words give is
  //    that moment's state: "the cutlery drawer closed beside her" was carried open from the moment before, where the
  //    stamp went into it, in her state, her check and her prompt, and every take was judged on the drawer.
  'point_state',
  // Not a ledger row: from the same Grandmother. A thing a moment's words put in, among or inside something the place
  //    has is inside it, at a size it holds: "the knives and forks in her cutlery drawer" were a table-high cube mid-room.
  'contained',
  // Not a ledger row: from the merged flow's Neighbours (2 Oct). A thing the cast reading names as a fixture its place's
  //    floor plan has is that fixture: "the dead ceiling light" was a second one, a cube on the floor under it.
  'cast_fixture',
  // Not a ledger row: from the merged flow's Grandmother (2 Oct). The prompt written for the local machine says a thing
  //    as it is now where its size or the whole of it has changed: the bed sheet folded down to a stamp was written "a
  //    plain white bed sheet, full size" at every fold.
  'written_now',
  // Not a ledger row: from the same Grandmother. A thing the moment is about too small for the frame's pixels is marked
  //    where it is on the keyed mock-up and its id map: the stamp between their fingers had 20 pixels at m8.
  'tiny_marker',
  // Not a ledger row: from the merged flow's Grandmother (2 Oct). What a moment puts something among, in what holds
  //    things, is in it too ("puts the stamp into her open cutlery drawer, among the knives and forks"), and so is a cast
  //    thing whose own reading says it is in it: the knives and forks were a cube mid-room.
  'contained_among',
  // Not a ledger row: from the merged flow's Grandmother (2-3 Oct) and the world at each cut. A thing in more than one
  //    pair of hands at once is in all of them, in the record, on the floor plan and the mock-up, in the prompt and the
  //    world: the bed sheet folded together, stretched between them, was in the grandmother's hands alone; and handed
  //    over, the record had the one given it where the plan had the one handing it (eight handovers).
  'shared_holds',
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
