// Jev's second layer (S7): a library of narrow questions, one per film-making rule that Jev can test on
// the text a picture is drawn from, each asked only of the cuts whose tags call for it, and a record of
// which checks have earned the right to act. A check may hold, reword or plan again only if it predicts
// the owner's verdicts on pictures (docs/rules.md G1); every other reading is only logged, to become a
// label once the picture it was read for is judged.
//
// Jev reads text only (no images: docs.typesafe.ai/models), so a question here reads the prompt sent to
// the image model, or the shot as "storyboard complete?" is given it. What only a drawn picture shows is
// the picture judge's (evals/picture-judge.md). What code can know is code's (gate.ts actsWhenLogging,
// continuity.ts, S4's camera rules), never a question.
//
// Behind DREAMCHAT_JEV_ROUTED=on. Off (the default), nothing here is asked and every check acts or logs as
// DREAMCHAT_CHECKS says, as before. On: the gate also asks each moment the library questions its tags
// route to, in the same call (one call a picture, as before); only the checks in EARNED act, the rest are
// logged with their readings and bars. DREAMCHAT_CHECKS=log still wins: nothing but code acts.
//
// Pure: no model, no files. The eval that measures every check is evals/jev-checks.ts (HARNESS_PLAN.md S7).
import type { CutSheet, CutTags } from './cutsheet';
import type { Question } from './jev';

/** Whether the checks are routed by tags and act only where they have earned it (DREAMCHAT_JEV_ROUTED=on). */
export function routedMode(): boolean {
  return (process.env.DREAMCHAT_JEV_ROUTED ?? '').trim().toLowerCase() === 'on';
}

/**
 * The checks that met their bar on the owner's verdicts (HARNESS_PLAN.md, S7), by id: only these may act
 * when the checks are routed. A check joins this set only with its row in the plan's results table.
 */
export const EARNED = new Set<string>();

/**
 * Everything a cut's routed questions are asked from: its tags, and the facts some questions are asked
 * one by one (each held thing and its holder, each change carried from earlier), named as the picture is
 * told them. Kept per labelled picture by the eval, so it asks what the harness would.
 */
export type CutFacts = {
  tags: CutTags;
  /** Each thing in the picture that someone holds, and who holds it. */
  held: { thing: string; holder: string }[];
  /** Each change carried from earlier onto someone or something in the picture (a turning excepted). */
  carried: { who: string; what: string; now: string }[];
};

/** A cut's facts for routing, from its sheet: the record's where it has one, else the plan's and the tree's. */
export function cutFactsOf(sheet: CutSheet): CutFacts {
  const name = (id: string) =>
    sheet.names[id] ?? sheet.inView.find((e) => e.id === id)?.name ?? (id === sheet.dreamer.id ? 'the dreamer' : id);
  const inPicture = new Set([
    ...sheet.inView.map((e) => e.id),
    ...(sheet.record ? [...sheet.record.shows, ...(sheet.record.place ? [sheet.record.place] : [])] : []),
  ]);
  const pairs: [string, string][] = sheet.record
    ? Object.entries(sheet.record.held)
    : (sheet.tree?.at ?? []).flatMap((e) => (e.holder ? [[e.id, e.holder] as [string, string]] : []));
  const turnedTo = new Map(sheet.inView.map((e) => [e.id, e.turned]));
  const carried = sheet.record
    ? sheet.record.carried
        .filter((c) => c.kind !== 'presence' && c.kind !== 'becomes' && inPicture.has(c.who))
        .map((c) => ({ who: c.who, what: c.what, now: c.now }))
    : sheet.states.filter((st) => inPicture.has(st.who) && turnedTo.get(st.who) !== st.now);
  const seen = new Set<string>();
  return {
    tags: sheet.tags,
    held: pairs
      .filter(([thing]) => inPicture.has(thing))
      .map(([thing, holder]) => ({ thing: name(thing), holder: name(holder) })),
    carried: carried
      .map((c) => ({ who: name(c.who), what: c.what, now: c.now }))
      .filter((c) => {
        const k = `${c.who}\n${c.what}\n${c.now}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
  };
}

/** One question of the library: which rule it tests, what it reads, which cuts it is asked of, and its bar. */
export type LibraryQuestion = {
  id: string;
  /** The rule in docs/rules.md it tests. */
  rule: string;
  /** The prompt sent to the image model, or the shot as "storyboard complete?" reads it. */
  reads: 'prompt' | 'shot';
  /** The tags that route it, in words, for the plan's table. */
  routedBy: string;
  routes: (t: CutTags) => boolean;
  /** Its question or questions for one cut: one per held thing or carried change where it says so; none, nothing to ask. */
  ask: (f: CutFacts) => Record<string, Question>;
  /** Which answer is a problem: "yes" (it finds a fault) or "no" (it misses what should be there). */
  problem: 'yes' | 'no';
  /** Where an answer becomes a finding: above it for a "yes" problem, below it for a "no". */
  bar: number;
  /** What a finding says, before its reading. */
  says: string;
  /** The owner's fault classes it is meant to catch (evals/prompt-cases.ts CLASSES). */
  classes: string[];
};

/** Every prompt question starts by saying what the text is: Jev answers the question written, from the state given. */
const PREFACE =
  'The text is everything an image model is told in order to draw one picture from a dream; the images it names are not shown. Answer from what the text itself says.';

const onPrompt = (question: string, yes: string, no: string): Question => ({
  type: 'noul',
  instructions: `${PREFACE} ${question}`,
  criteria: { true: yes, false: no },
});

const onShot = (question: string, yes: string, no: string): Question => ({
  type: 'noul',
  instructions: `\`shot\` is a grey layout of a planned storyboard picture of \`moment\`: where everyone and everything is and where the camera is, never how anything looks. ${question}`,
  criteria: { true: yes, false: no },
});

const one = (id: string, q: Question) => ({ [id]: q });

/** People can be in view: a single, two, a group, over a shoulder, or close on one of them. */
const withPeople = (t: CutTags) => ['single', 'two_shot', 'group', 'ots', 'close_up'].includes(t.role);

/**
 * The library: one question per film rule a Jev reading of text can test, routed by the cut's tags
 * (docs/rules.md; the rules it cannot test, and why, are listed in HARNESS_PLAN.md S7). Each is one fact:
 * joined questions read worse than two apart (S0, S8). Where a rule is about a named fact (a held thing, a
 * change carried), it is asked once per fact, and the cut's reading is the worst of them.
 */
export const LIBRARY: LibraryQuestion[] = [
  {
    id: 'r_state_said',
    rule: 'B1',
    reads: 'prompt',
    routedBy: 'change:carried, change:both',
    routes: (t) => t.change === 'carried' || t.change === 'both',
    ask: (f) =>
      Object.fromEntries(
        f.carried.map((c, i) => [
          `r_state_said_${i}`,
          onPrompt(
            `Does the text say that ${c.who} is like this now: ${c.what}, ${c.now}?`,
            'the text says so, plainly or in other words',
            'the text does not say so, leaves it open, or says otherwise',
          ),
        ]),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the prompt may not say a change carried from earlier',
    classes: ['state_carried'],
  },
  {
    id: 'r_held_said',
    rule: 'B6',
    reads: 'prompt',
    routedBy: 'held',
    routes: (t) => t.held,
    ask: (f) =>
      Object.fromEntries(
        f.held.map((h, i) => [
          `r_held_said_${i}`,
          onPrompt(
            `Does the text say that ${h.thing} is held or carried by ${h.holder}?`,
            `the text says ${h.holder} holds or carries it`,
            'the text does not say who holds it, or says someone else does',
          ),
        ]),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the prompt may not say who holds something',
    classes: ['holding'],
  },
  {
    id: 'r_gone_drawn',
    rule: 'C4',
    reads: 'prompt',
    routedBy: 'every cut',
    routes: () => true,
    ask: () =>
      one(
        'r_gone_drawn',
        onPrompt(
          'Does the text ask for someone or something to be drawn in the picture that it also says is gone, has vanished, or is no longer there?',
          'something said to be gone is also described as in the picture',
          'nothing said to be gone is described as in the picture, or nothing is said to be gone',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the prompt may draw something it says is gone',
    classes: ['presence', 'invented_moment'],
  },
  {
    id: 'r_pov_body',
    rule: 'A4',
    reads: 'prompt',
    routedBy: 'pov',
    routes: (t) => t.pov,
    ask: () =>
      one(
        'r_pov_body',
        onPrompt(
          "The picture is seen through the dreamer's own eyes. Does the text ask for more of the dreamer to be drawn than their own hands, arms or feet: their face, their head, or their whole body?",
          "the text asks for the dreamer's face, head or body to be drawn",
          'at most their hands, arms or feet are asked for',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: "the prompt may draw the dreamer's own body through their eyes",
    classes: ['pov', 'identity'],
  },
  {
    id: 'r_background',
    rule: 'A2',
    reads: 'prompt',
    routedBy: 'move:reverse, crossed',
    routes: (t) => t.move === 'reverse' || t.crossed,
    ask: () =>
      one(
        'r_background',
        onPrompt(
          'Does the text say what is behind the people in this picture: which wall, side or view of the place fills its background?',
          'the text says what fills the background',
          'the background is left to the artist',
        ),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the prompt may not say what the turned camera now sees behind them',
    classes: ['camera_turn_layout'],
  },
  {
    id: 'r_keep_earlier',
    rule: 'A2, C7',
    reads: 'prompt',
    routedBy: 'move:reverse, move:other_side, crossed',
    routes: (t) => t.move === 'reverse' || t.move === 'other_side' || t.crossed,
    ask: () =>
      one(
        'r_keep_earlier',
        onPrompt(
          'Does the text tell the artist to keep the camera, the framing, the layout or the background of an earlier picture?',
          "an earlier picture's camera, framing, layout or background is to be kept",
          'nothing of an earlier picture is to be kept but how people and things look',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: "the prompt may keep an earlier picture's view across a turned camera",
    classes: ['camera_turn_layout', 'reference_conflict'],
  },
  {
    id: 'r_line_order',
    rule: 'A1',
    reads: 'prompt',
    routedBy: 'line',
    routes: (t) => t.line,
    ask: () =>
      one(
        'r_line_order',
        onPrompt(
          'Does the text say in what order the people in the picture stand from left to right across the frame?',
          'their order from left to right is given',
          'which side each is on is left to the artist',
        ),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the prompt may not give who stands where, left to right',
    classes: ['camera_turn_layout'],
  },
  {
    id: 'r_size',
    rule: 'C2',
    reads: 'prompt',
    routedBy: 'held, animal, vehicle, role:insert, role:close_up',
    routes: (t) => t.held || t.animal || t.vehicle || t.role === 'insert' || t.role === 'close_up',
    ask: () =>
      one(
        'r_size',
        onPrompt(
          'Does the text say how big the main thing or animal in the picture is compared with something beside it, such as a hand, a person or a door?',
          'its size is given against something beside it',
          'its size is left to the artist, or given only in numbers or vague words',
        ),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the prompt may not say how big the main thing is against something beside it',
    classes: ['proportion_or_paste'],
  },
  {
    id: 'r_turned_both',
    rule: 'B4',
    reads: 'prompt',
    routedBy: 'turned',
    routes: (t) => t.turned,
    ask: () =>
      one(
        'r_turned_both',
        onPrompt(
          'Does the text describe someone or something both as it was before it turned into something else and as what it became, so that both could be drawn?',
          'both the old and the new form are described as in the picture',
          'only what it became is described as in the picture',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the prompt may draw what someone turned into beside their old self',
    classes: ['identity', 'reference_conflict'],
  },
  {
    id: 'r_action_seen',
    rule: 'E2',
    reads: 'prompt',
    routedBy: 'role:single, two_shot, group, ots, close_up',
    routes: withPeople,
    ask: () =>
      one(
        'r_action_seen',
        onPrompt(
          'Does the text say what the people in the picture are doing at this instant in a way that can be seen: a pose, a movement, what their hands do, or where they look?',
          'what they do is said as something that can be seen',
          'what they do is left out, or said only as a feeling or a story beat',
        ),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the prompt may not say what they do as something seen',
    classes: ['action'],
  },
  {
    id: 'r_story_words',
    rule: 'E4',
    reads: 'prompt',
    routedBy: 'every cut',
    routes: () => true,
    ask: () =>
      one(
        'r_story_words',
        onPrompt(
          "Does the text use words about the story that cannot be seen in one picture, such as 'the turn', 'the reveal', 'suddenly' or 'finally', in place of saying what is in the picture?",
          'story words stand in for what is seen',
          'it says what is in the picture',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the prompt may use story words in place of what is seen',
    classes: ['action', 'invented_moment'],
  },
  {
    id: 'r_quoted',
    rule: 'C3',
    reads: 'prompt',
    routedBy: 'every cut not tagged writing',
    routes: (t) => !t.writing,
    ask: () =>
      one(
        'r_quoted',
        onPrompt(
          'Does the text put in quotation marks words or names that are not meant to be written anywhere in the picture?',
          'some quoted words or names are not meant as writing in the picture',
          'nothing is quoted, or only writing meant to be in the picture',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the prompt may quote words the picture could letter',
    classes: ['style_leak'],
  },
  {
    id: 'r_beyond_inside',
    rule: 'A6',
    reads: 'prompt',
    routedBy: 'every cut (no tag says "seen beyond the place" yet)',
    routes: () => true,
    ask: () =>
      one(
        'r_beyond_inside',
        onPrompt(
          'Does the text place inside a room, or close to the camera, something that is only seen far away, outside, or through a window?',
          'something seen only far off or outside is placed inside or near',
          'everything is placed where it is seen',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the prompt may bring inside something seen only beyond the place',
    classes: ['invented_moment', 'camera_turn_layout'],
  },
  {
    id: 'r_look_twice',
    rule: 'E1',
    reads: 'prompt',
    routedBy: 'every cut',
    routes: () => true,
    ask: () =>
      one(
        'r_look_twice',
        onPrompt(
          'Does the text describe how the same person or thing looks in two places, in words that do not match?',
          'one look is described twice in words that do not match',
          'each look is described once, or the same way each time',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the prompt may describe one look twice, differently',
    classes: ['identity', 'reference_conflict'],
  },
  {
    id: 'sb_held_hands',
    rule: 'B6, A4',
    reads: 'shot',
    routedBy: 'pov and held',
    routes: (t) => t.pov && t.held,
    ask: () =>
      one(
        'sb_held_hands',
        onShot(
          "Does `shot` put the thing the dreamer holds in the dreamer's own hands, at the bottom of the picture near the camera?",
          'what the dreamer holds is at their hands, near the camera',
          'what the dreamer holds is placed somewhere else in the place, or not at all',
        ),
      ),
    problem: 'no',
    bar: 0.5,
    says: 'the shot may put what the dreamer holds away from their hands',
    classes: ['holding', 'pov'],
  },
  {
    id: 'sb_beyond',
    rule: 'A6',
    reads: 'shot',
    routedBy: 'planned',
    routes: (t) => t.planned,
    ask: () =>
      one(
        'sb_beyond',
        onShot(
          'Does `shot` put inside the place, or near the camera, something that `moment` sees only far off, outside, or through a window?',
          'something seen only far off or outside is placed inside or near the camera',
          'everything is placed where the moment sees it',
        ),
      ),
    problem: 'yes',
    bar: 0.5,
    says: 'the shot may bring inside something seen only beyond the place',
    classes: ['invented_moment', 'camera_turn_layout'],
  },
];

/** The library questions a cut's tags route to, of what they read. */
export function routedFor(t: CutTags, reads: 'prompt' | 'shot' = 'prompt'): LibraryQuestion[] {
  return LIBRARY.filter((q) => q.reads === reads && q.routes(t));
}

/** A library question's reading of one cut: the worst of its answers (one per fact where it asks per fact). */
export function worstOf(q: Pick<LibraryQuestion, 'problem'>, answers: number[]): number | null {
  if (!answers.length) return null;
  return q.problem === 'yes' ? Math.max(...answers) : Math.min(...answers);
}

/** Whether a reading is a finding: over the bar for a "yes" problem, under it for a "no". */
export const isFinding = (q: Pick<LibraryQuestion, 'problem' | 'bar'>, p: number) =>
  q.problem === 'yes' ? p > q.bar : p < q.bar;

/**
 * The questions the gate adds for a cut when routed, keyed as asked, with the library question each
 * belongs to: none for a cut with nothing its tags route to that has anything to ask.
 */
export function routedQuestions(f: CutFacts): { questions: Record<string, Question>; of: Record<string, string> } {
  const questions: Record<string, Question> = {};
  const of: Record<string, string> = {};
  for (const q of routedFor(f.tags, 'prompt'))
    for (const [k, v] of Object.entries(q.ask(f))) {
      questions[k] = v;
      of[k] = q.id;
    }
  return { questions, of };
}

/**
 * A routed cut's library readings and findings from Jev's answers: each library question's worst answer,
 * and a finding for each one past its bar, said with its reading. Questions left unanswered are left out.
 */
export function routedReadings(
  f: CutFacts,
  answers: Record<string, { type: string; noul?: number }> | null,
): { readings: Record<string, number>; findings: { id: string; text: string }[] } {
  const readings: Record<string, number> = {};
  const findings: { id: string; text: string }[] = [];
  for (const q of routedFor(f.tags, 'prompt')) {
    const got = Object.keys(q.ask(f))
      .map((k) => answers?.[k])
      .flatMap((a) => (a && a.type === 'noul' && typeof a.noul === 'number' ? [a.noul] : []));
    const p = worstOf(q, got);
    if (p === null) continue;
    readings[q.id] = p;
    if (isFinding(q, p)) findings.push({ id: q.id, text: `${q.says} (${p.toFixed(2)})` });
  }
  return { readings, findings };
}
