// What a moment's picture must show at one instant, as typed facts: who does what, to what and where;
// which vehicles and people are moving, and their heading where the words give it; how high water (or
// snow, sand, fog) stands, measured against something in the place or unmeasured; through the dreamer's
// eyes, whether their hands are in use, what they hold and whether they see their own body; the open or
// shut state of what opens, as the story last left it (carrying a thing never shuts it); what is seen
// beyond the place through a window or door; and who the words name without their being there.
//
// Read once per saved moment (S6, HARNESS_PLAN.md): the writer proposes the facts as JSON from the dream's
// breakdown and the moment's words; Jev checks each with one-fact questions at a bar, as the implied
// reading is checked (implied.ts); only facts every question of which reads as wanted are taken. The
// facts are what S6's builder writes "What happens" from, and what retires the word lists that guess
// them today (camera.ts HAND_VERB, selfIn, goingIn, waterLevel's words; record.ts FILLS, OPENS, SELF,
// NOT_THERE, shutAway …). This module only reads; it changes no prompt.
import type { JevFn, Question } from './jev';
import { type CallResult, type ChatMessage, callDeepseek, type Thinking } from './llm';
import type { Breakdown, Moment } from './producer';
import { moments as momentsOf } from './producer';

// ── the facts ────────────────────────────────────────────────────────────────────────────────────

/** How water stands against what measures it: almost up to it, up to it, or over it. */
export type LevelHow = 'below' | 'at' | 'over';

/** One typed fact of a moment. Ids are the breakdown's; plain words only where nothing has an id. */
export type TypedFact =
  /** Who does what at the instant the picture shows, to or toward what, and where. */
  | { kind: 'act'; who: string; does: string; to?: string; where?: string }
  /** A vehicle in view, moving or not, or someone travelling; the heading only where the words give it. */
  | { kind: 'motion'; who: string; moving: boolean; heading?: string }
  /** Water, snow, sand, fog … standing in a place; `how` and `against` absent: unmeasured. */
  | { kind: 'fill'; place: string; matter: string; how?: LevelHow; against?: string }
  /** Through the dreamer's eyes: whether their own hands or arms do something. */
  | { kind: 'hands'; inUse: boolean }
  /** Through the dreamer's eyes: what they hold in their hands. */
  | { kind: 'holding'; what: string }
  /** Through the dreamer's eyes: whether they look at their own body. */
  | { kind: 'own_body'; seen: boolean }
  /** A thing or place with a part that opens, open or shut as the story last left it. */
  | { kind: 'container'; who: string; part: string; open: boolean }
  /** Someone or something in view seen outside the place, through a window, door or opening. */
  | { kind: 'beyond'; what: string; through: string }
  /** Someone or something the moment's words name that is not there to be seen. */
  | { kind: 'absent'; who: string };

export type TypedKind = TypedFact['kind'];
export const TYPED_KINDS: TypedKind[] = [
  'act',
  'motion',
  'fill',
  'hands',
  'holding',
  'own_body',
  'container',
  'beyond',
  'absent',
];

/** One question Jev answers about a fact, and the answer the fact needs. */
export type Check = { key: string; want: 'yes' | 'no'; answer?: number };

/** A proposed fact, Jev's reading of each of its questions, and whether it is taken. */
export type Checked = TypedFact & { checks: Check[]; ok: boolean; close?: boolean };

/** A moment's reading: every proposed fact, checked. */
/**
 * One moment's typed reading. `ask`: the hash of the question it answered (`typedAsk`), where the harness read
 * it while planning, so a plan made again reads anew only the moments whose question changed.
 */
export type TypedReading = { moment: string; facts: Checked[]; ask?: string };

/** The facts taken at a moment, typed, each list empty when none is. */
export type TypedMoment = {
  acts: Extract<TypedFact, { kind: 'act' }>[];
  motion: Extract<TypedFact, { kind: 'motion' }>[];
  fill: Extract<TypedFact, { kind: 'fill' }>[];
  /** Through the dreamer's eyes only; null seen from outside or where nothing about them was taken. */
  pov: { hands: boolean | null; holding: string[]; ownBody: boolean | null } | null;
  containers: Extract<TypedFact, { kind: 'container' }>[];
  beyond: Extract<TypedFact, { kind: 'beyond' }>[];
  absent: string[];
};

/** The facts of a reading that Jev took, as one typed moment. */
export function takenOf(r: TypedReading | undefined, eyes: Moment['eyes'] = 'outside'): TypedMoment {
  const ok = (r?.facts ?? []).filter((f) => f.ok).map(strip);
  const of = <K extends TypedKind>(k: K) => ok.filter((f): f is Extract<TypedFact, { kind: K }> => f.kind === k);
  const hands = of('hands')[0];
  const own = of('own_body')[0];
  const holding = of('holding').map((x) => x.what);
  return {
    acts: of('act'),
    motion: of('motion'),
    fill: of('fill'),
    pov:
      eyes === 'dreamer' && (hands || own || holding.length)
        ? { hands: hands ? hands.inUse : null, holding, ownBody: own ? own.seen : null }
        : null,
    containers: of('container'),
    beyond: of('beyond'),
    absent: of('absent').map((x) => x.who),
  };
}

/** A checked fact as the fact alone. */
export function strip(f: Checked): TypedFact {
  const { checks: _c, ok: _o, close: _x, ...fact } = f;
  return fact as TypedFact;
}

// ── the writer ───────────────────────────────────────────────────────────────────────────────────

/** The writer: one JSON answer to a system and a user message (llm.ts; Claude with DREAMCHAT_WRITER=claude). */
export type WriteFn = (messages: ChatMessage[]) => Promise<CallResult>;

export const TYPED_THINKING = (process.env.DREAMCHAT_TYPED_THINKING as Thinking | undefined) ?? 'low';

/** The harness's writer, one JSON answer; a blank answer is asked once more. */
export const writeTyped: WriteFn = async (messages) => {
  const first = await callDeepseek(messages, { json: true, thinking: TYPED_THINKING });
  if (first.content.trim()) return first;
  const second = await callDeepseek(messages, { json: true, thinking: TYPED_THINKING });
  return { ...second, ms: first.ms + second.ms };
};

export const TYPED_SYSTEM = `You read one moment of a dream that is drawn as one still picture, and write down as typed facts what that picture shows at one instant. Read the moment's own words, and the story before it only for what it has left so (water risen, a door opened). Never add what the words neither say nor need.

Return JSON only, with these keys; a list is empty when nothing fits:

"acts": what each one in view does at the instant the picture shows: [{"who": id, "does": "...", "to": "...", "where": "..."}]. "who" is a person, animal or thing in view (by id; the dreamer by their id) that the words give an act. "does" is one act a single picture can show, present tense, a few words: "rows", "opens", "climbs into", "holds up", "looks at", "points at", "beckons to". Never a sequence or a time ("then", "starts to", "keeps", "suddenly"), never what is heard, felt, thought, remembered or known ("listens", "knows", "feels", "realises"), never a story word; what someone says aloud is drawn as what their body does while saying it ("beckons to", "points at", "turns to" someone), never "says", "tells" or "speaks". "to" (optional): what it is done to or toward, by id where it has one, else a few plain words. "where" (optional): only where the words place it ("between the shelves", "at the high round window"). "does", "to" and "where" read as one plain sentence in that order, each saying what the others do not: {"who": "p1", "does": "walks toward", "to": "t3"}, never "does": "walks" with "to" the door, never the same place in "does" and again in "where". One act each, the one the picture shows; someone the words give no act gets none.

"motion": every vehicle in view, moving or not, and anyone travelling at this instant (walking, running, swimming, flying, falling): [{"who": id, "moving": true|false, "heading": "..."}]. A vehicle someone drives, rows, rides or sails at this instant, or that goes on its own, is moving; one parked, stopped, moored, only sat in or only there is not. Whoever rides in or on a vehicle moves with it: list the vehicle, not its riders. "heading" only where the words say which way ("towards the lighthouse", "along the shelves", "down the hill", "over the bridge"); otherwise leave it out, never guess it.

"fill": water (or snow, sand, mud, fog, smoke) standing in a place at this instant, as this moment's words and the story before leave it: [{"place": id, "matter": "water", "how": "below"|"at"|"over", "against": "..."}]. "against" is what its height is measured by: a part of the body of someone standing in it (ankles, knees, waist, chest, neck) or something in the place (the floor, the desk legs, the desks, the shelves, the windows, the high round window, the ceiling); "how" is "below" (almost up to it), "at" (up to it) or "over" (covering it); water just come in over the floor is "over" "the floor", but anything afloat on it (a boat, a floating car or desk) means it is deeper than that: then the floor is no measure. Measure only by what the words say or need (a boat rowed up to a window near the ceiling means the water stands almost up to that window). When the words give such water but nothing measures its height, or the whole place is under it (an underwater school, a sunken city), leave out "how" and "against": it is unmeasured. Nothing for a place with none.

"pov": only when the moment is seen through the dreamer's own eyes, else null: {"hands": true|false, "holding": [...], "own_body": true|false}. "hands": the dreamer's own hands or arms do something at this instant (hold, touch, reach, push, pull, row, steer, open, carry, give, take); false when they only look, walk, stand, sit, fall or listen; true whenever they hold something. "holding": what the dreamer holds in their hands at this instant, by id where it has one. "own_body": they look at their own body (legs, feet, hands, clothes, how small or big they are), never a reflection.

"containers": each thing or place in view with a part that opens and shuts (a door, lid, window, gate, drawer, curtains, a suitcase or box itself), where this moment or the story before opened or shut it: [{"who": id, "part": "lid", "open": true|false}], as the story last left it. Carrying a thing into another place does not shut it; only words that shut it do.

"beyond": who or what in view is seen outside the place, rather than inside it: through a window, door or opening, or out past its edges (the gardens below a roof, a lighthouse far across the sea): [{"what": id or a few plain words, "through": "the high round window" or "below the roof"}]. Only what this moment's own words (or what it must show) put out there, never a view the story gave earlier; the moment's own place is never beyond itself.

"absent": ids of those the moment's words name who are not there to be seen: gone, missing, looked for, waited for, remembered, dreamed of, or only heard.`;

/** A person, place or thing by id, as the writer and Jev are told it; the dreamer as "the dreamer". */
export function namer(b: Breakdown): (id: string) => string {
  return (id: string) => {
    const p = b.people.find((x) => x.id === id);
    if (p) return p.is_dreamer ? 'the dreamer' : p.name;
    return b.places.find((x) => x.id === id)?.name ?? b.things.find((x) => x.id === id)?.name ?? id;
  };
}

/** The fixtures of a moment's place on its scene's floor plan: what water can be measured against. */
function fixturesOf(b: Breakdown, m: Moment): string[] {
  const scene = b.scenes.find((s) => s.moments.some((x) => x.id === m.id));
  const plan = scene?.blocking?.places?.[m.place] ?? scene?.blocking;
  return [...new Set((plan?.spots ?? []).filter((s) => s.fixture && s.name).map((s) => s.name as string))];
}

/** What the writer is given for one moment: the dream's cast, the story before it, and the moment itself. */
export function typedAsk(b: Breakdown, m: Moment): ChatMessage[] {
  const all = momentsOf(b);
  const at = all.findIndex((x) => x.id === m.id);
  const name = namer(b);
  const place = b.places.find((l) => l.id === m.place);
  const fixtures = fixturesOf(b, m);
  const brief = {
    people: b.people.map((p) => ({ id: p.id, name: p.is_dreamer ? `the dreamer (${p.name})` : p.name })),
    places: b.places.map((l) => ({ id: l.id, name: l.name })),
    things: b.things.map((t) => ({ id: t.id, name: t.name })),
    story_before: all.slice(0, Math.max(0, at)).map((x) => ({
      id: x.id,
      place: name(x.place),
      action: x.action,
      ...(x.leaves?.length ? { leaves: x.leaves.map((l) => `${name(l.who)}: ${l.what}: ${l.now}`) } : {}),
    })),
    moment: {
      id: m.id,
      place: {
        id: m.place,
        name: place?.name ?? m.place,
        ...(place?.fields?.landmarks?.value ? { landmarks: place.fields.landmarks.value } : {}),
        ...(fixtures.length ? { fixtures } : {}),
      },
      seen: m.eyes === 'dreamer' ? "through the dreamer's own eyes" : 'from outside',
      in_view: { people: m.visible, things: m.things },
      action: m.action,
      ...(m.visual_point ? { must_show: m.visual_point } : {}),
      ...(m.dream ? { dream: m.dream } : {}),
      ...(m.looks_at ? { camera_faces: m.looks_at } : {}),
      ...(m.leaves?.length ? { leaves: m.leaves.map((l) => `${name(l.who)}: ${l.what}: ${l.now}`) } : {}),
    },
  };
  return [
    { role: 'system', content: TYPED_SYSTEM },
    { role: 'user', content: JSON.stringify(brief) },
  ];
}

const HOW = new Set<LevelHow>(['below', 'at', 'over']);
const str = (x: unknown, n = 80): string | undefined =>
  typeof x === 'string' && x.trim() ? x.trim().replace(/\s+/g, ' ').slice(0, n) : undefined;

/**
 * The writer's answer, kept to what the moment can hold: acts and motion by those in view (the dreamer
 * always), fill of the moment's place, the point of view only through the dreamer's eyes, containers
 * by an id of the dream, each fact once.
 */
export function parseTyped(content: string, b: Breakdown, m: Moment): TypedFact[] {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!raw || typeof raw !== 'object') return [];
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  const inView = new Set([...m.visible, ...m.things, ...(dreamer ? [dreamer] : [])]);
  const ids = new Set([...b.people.map((p) => p.id), ...b.things.map((t) => t.id), ...b.places.map((l) => l.id)]);
  const list = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as Record<string, unknown>[]) : []).filter(Boolean);
  const out: TypedFact[] = [];
  for (const x of list('acts')) {
    const who = str(x.who);
    const does = str(x.does, 60);
    if (!who || !does || !inView.has(who)) continue;
    out.push({
      kind: 'act',
      who,
      does,
      ...(str(x.to) ? { to: str(x.to) } : {}),
      ...(str(x.where) ? { where: str(x.where) } : {}),
    });
  }
  for (const x of list('motion')) {
    const who = str(x.who);
    if (!who || !inView.has(who) || typeof x.moving !== 'boolean') continue;
    out.push({
      kind: 'motion',
      who,
      moving: x.moving,
      ...(x.moving && str(x.heading) ? { heading: str(x.heading) } : {}),
    });
  }
  for (const x of list('fill')) {
    const place = str(x.place);
    const matter = str(x.matter, 20)?.toLowerCase();
    if (place !== m.place || !matter) continue;
    const how = str(x.how) as LevelHow | undefined;
    const against = str(x.against, 60);
    out.push({ kind: 'fill', place, matter, ...(how && HOW.has(how) && against ? { how, against } : {}) });
  }
  const pov = raw.pov as Record<string, unknown> | null | undefined;
  if (m.eyes === 'dreamer' && pov && typeof pov === 'object') {
    if (typeof pov.hands === 'boolean') out.push({ kind: 'hands', inUse: pov.hands });
    for (const h of Array.isArray(pov.holding) ? pov.holding : []) {
      const what = str(h, 60);
      if (what) out.push({ kind: 'holding', what });
    }
    if (typeof pov.own_body === 'boolean') out.push({ kind: 'own_body', seen: pov.own_body });
  }
  for (const x of list('containers')) {
    const who = str(x.who);
    const part = str(x.part, 30);
    if (!who || !ids.has(who) || !part || typeof x.open !== 'boolean') continue;
    out.push({ kind: 'container', who, part, open: x.open });
  }
  for (const x of list('beyond')) {
    const what = str(x.what, 60);
    const through = str(x.through, 60);
    if (what && through) out.push({ kind: 'beyond', what, through });
  }
  for (const x of Array.isArray(raw.absent) ? raw.absent : []) {
    const who = str(x);
    if (who && ids.has(who) && who !== m.place) out.push({ kind: 'absent', who });
  }
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = JSON.stringify(f).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Jev's check ──────────────────────────────────────────────────────────────────────────────────

/** How sure Jev must be of a fact's "yes" questions; a "no" question needs an answer under NO_BAR. */
export const TYPED_BAR = 0.6;
export const NO_BAR = 0.4;
/** How near an answer may be to its bar before it is marked as close. */
export const CLOSE = 0.1;

const UP_TO: Record<LevelHow, string> = { below: 'almost up to', at: 'up to', over: 'over' };
/** A level in words, as the camera rules read it (camera.ts waterLevel): "almost up to the windows". */
export const levelWords = (f: { how?: LevelHow; against?: string }): string | null =>
  f.how && f.against
    ? `${UP_TO[f.how]} ${/^(the|a|an|their|his|her|its)\s/i.test(f.against) ? '' : 'the '}${f.against}`
    : null;

/** Each fact's questions, one fact each, keyed by the fact's index, with the answer it needs. */
export function typedQuestions(
  b: Breakdown,
  m: Moment,
  facts: TypedFact[],
): { state: string; questions: Record<string, Question>; wants: Check[][] } {
  const name = namer(b);
  const ids = new Set([...b.people, ...b.places, ...b.things].map((x) => x.id));
  const thing = (x: string | undefined) => (x ? x.replace(/[\p{L}\p{N}_]+/gu, (w) => (ids.has(w) ? name(w) : w)) : '');
  const place = name(m.place);
  const questions: Record<string, Question> = {};
  const wants: Check[][] = facts.map(() => []);
  const ask = (i: number, key: string, want: 'yes' | 'no', q: Question) => {
    questions[`${key}_${i}`] = q;
    wants[i].push({ key: `${key}_${i}`, want });
  };
  const noul = (instructions: string, t?: string, f?: string): Question => ({
    type: 'noul',
    instructions,
    ...(t || f ? { criteria: { ...(t ? { true: t } : {}), ...(f ? { false: f } : {}) } } : {}),
  });
  facts.forEach((f, i) => {
    switch (f.kind) {
      case 'act': {
        const act = `${name(f.who)} ${f.does}${f.to ? ` ${thing(f.to)}` : ''}${f.where ? ` ${f.where}` : ''}`;
        ask(
          i,
          'act',
          'yes',
          noul(
            `In this moment, does ${act}: said by its words, or bound to be so for what they say to happen?`,
            'the words say it, or it must be so at this instant',
            'a guess, someone else does it, or it happens only before or after this instant',
          ),
        );
        ask(
          i,
          'seen',
          'yes',
          noul(
            `Is "${act}" something one still picture can show at one instant, rather than a sequence, a sound, a thought, a feeling or something known?`,
          ),
        );
        break;
      }
      case 'motion':
        ask(
          i,
          'moving',
          f.moving ? 'yes' : 'no',
          noul(
            `At the instant of this moment, is ${name(f.who)} travelling along (driven, rowed, ridden, sailing, walking, running, swimming or flying), rather than standing, sitting, parked or floating in one place?`,
          ),
        );
        if (f.heading)
          ask(i, 'heading', 'yes', noul(`Do this moment's words say that ${name(f.who)} is going ${f.heading}?`));
        break;
      case 'fill': {
        ask(
          i,
          'fill',
          'yes',
          noul(
            `At this moment, is there ${f.matter} standing in ${place}, as its words and the story before leave it?`,
          ),
        );
        const level = levelWords(f);
        if (level)
          ask(
            i,
            'level',
            'yes',
            noul(
              /\b(?:floor|ground)s?\b/i.test(f.against ?? '')
                ? `At this moment, does the ${f.matter} in ${place} lie only in a thin layer ${level}, no deeper, with nothing afloat on it: said by the words of this moment or the story before, or bound to be so?`
                : `At this moment, does the ${f.matter} in ${place} stand ${level}: said by the words of this moment or the story before, or bound to be so for what they say to happen?`,
              'said, or it must be so (a boat rowed up to a high window means the water is almost up to it)',
              'a guess: possible, but no words say or need it',
            ),
          );
        else
          ask(
            i,
            'measured',
            'no',
            noul(
              `Do the words of this moment or the story before say how high the ${f.matter} in ${place} stands now (up to a part of someone's body, or to something in the place)?`,
            ),
          );
        break;
      }
      case 'hands':
        ask(
          i,
          'hands',
          f.inUse ? 'yes' : 'no',
          noul(
            `Seen through the dreamer's own eyes: are the dreamer's own hands or arms doing something at this instant (holding, touching, reaching, pushing, rowing, steering, opening, carrying)?`,
          ),
        );
        break;
      case 'holding':
        ask(i, 'holding', 'yes', noul(`Is the dreamer holding ${thing(f.what)} in their hands at this instant?`));
        break;
      case 'own_body':
        ask(
          i,
          'own_body',
          f.seen ? 'yes' : 'no',
          noul(
            `Seen through the dreamer's own eyes: does the dreamer look at their own body here (their own legs, feet, hands, clothes, or how big or small they are), not a reflection?`,
          ),
        );
        break;
      case 'container':
        ask(
          i,
          'open',
          'yes',
          noul(
            `As the story has left it by this moment, is ${name(f.who)}'s ${f.part} ${f.open ? 'open' : 'shut'}?`,
            `the words of this moment or before ${f.open ? 'opened' : 'shut'} it, and nothing since has ${f.open ? 'shut' : 'opened'} it`,
            'no words say so, or later words changed it',
          ),
        );
        break;
      case 'beyond':
        ask(
          i,
          'beyond',
          'yes',
          noul(
            `Is ${thing(f.what)} seen outside ${place}, beyond it through ${f.through}, rather than inside ${place}?`,
          ),
        );
        break;
      case 'absent':
        ask(
          i,
          'absent',
          'yes',
          noul(
            `Do this moment's words name ${name(f.who)} as not there to be seen at this moment (gone, missing, looked for, waited for, remembered, dreamed of, or only heard)?`,
          ),
        );
        break;
    }
  });
  const all = momentsOf(b);
  const at = all.findIndex((x) => x.id === m.id);
  const state = JSON.stringify({
    ...(at > 0 ? { story_before: all.slice(0, at).map((x) => `${x.id} (${name(x.place)}): ${x.action}`) } : {}),
    moment: {
      place,
      seen: m.eyes === 'dreamer' ? "through the dreamer's own eyes" : 'from outside',
      in_view: [...m.visible, ...m.things].map(name),
      action: m.action,
      ...(m.visual_point ? { must_show: m.visual_point } : {}),
      ...(m.dream ? { dream: m.dream } : {}),
    },
  });
  return { state, questions, wants };
}

/** A fact's checks read against Jev's answers: taken only where every one has the answer it needs. */
export function judge(fact: TypedFact, wants: Check[], answers: Record<string, number>): Checked {
  const checks = wants.map((w) => ({ ...w, ...(w.key in answers ? { answer: answers[w.key] } : {}) }));
  const pass = (c: Check) => c.answer !== undefined && (c.want === 'yes' ? c.answer >= TYPED_BAR : c.answer < NO_BAR);
  // A heading Jev does not read in the words is dropped; the motion stands on its own question.
  const heading = checks.find((c) => c.key.startsWith('heading_'));
  if (fact.kind === 'motion' && heading && !pass(heading)) {
    const { heading: _h, ...rest } = fact;
    const kept = checks.filter((c) => c !== heading);
    return { ...rest, checks: [...kept, heading], ok: kept.every(pass), ...closeOf(checks) };
  }
  return { ...fact, checks, ok: checks.length > 0 && checks.every(pass), ...closeOf(checks) };
}

const closeOf = (checks: Check[]) =>
  checks.some((c) => c.answer !== undefined && Math.abs(c.answer - (c.want === 'yes' ? TYPED_BAR : NO_BAR)) < CLOSE)
    ? { close: true as const }
    : {};

/** What one moment's reading cost. */
export type TypedCost = { writerCalls: number; writerIn: number; writerOut: number; jevCalls: number };

/**
 * One moment read and checked: one writer call, and one Jev call with every fact's questions when
 * anything was proposed.
 */
export async function readTypedMoment(
  b: Breakdown,
  m: Moment,
  write: WriteFn,
  jev: JevFn,
): Promise<{ reading: TypedReading; cost: TypedCost; error?: string }> {
  const cost: TypedCost = { writerCalls: 0, writerIn: 0, writerOut: 0, jevCalls: 0 };
  let proposed: TypedFact[];
  try {
    const res = await write(typedAsk(b, m));
    cost.writerCalls += 1;
    cost.writerIn += res.usage?.prompt_tokens ?? 0;
    cost.writerOut += res.usage?.completion_tokens ?? 0;
    proposed = parseTyped(res.content, b, m);
  } catch (e) {
    return { reading: { moment: m.id, facts: [] }, cost, error: `writer: ${String(e).slice(0, 200)}` };
  }
  if (!proposed.length) return { reading: { moment: m.id, facts: [] }, cost };
  const { state, questions, wants } = typedQuestions(b, m, proposed);
  const call = await jev(state, questions);
  cost.jevCalls += 1;
  const answers: Record<string, number> = {};
  for (const [k, a] of Object.entries(call.answers ?? {})) if (a.type === 'noul') answers[k] = a.noul;
  const facts = proposed.map((f, i) => judge(f, wants[i], answers));
  return {
    reading: { moment: m.id, facts },
    cost,
    ...(call.error ? { error: `jev: ${call.error.slice(0, 200)}` } : {}),
  };
}
