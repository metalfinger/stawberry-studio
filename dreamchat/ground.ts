// Grounding: Jev checks every detail the producer marked as said against the person's own
// messages. It is the lab's evidence rule applied to production data. A detail stays "said"
// only when Jev agrees the person said it AND can point at the message; otherwise it becomes a
// guess, and the person is asked to confirm it before anything is drawn from it.
import type { Answer, Exchange, JevFn, Question } from './jev';
import { renderTranscript } from './jev';
import { type Breakdown, type Detail, type Moment, type State, details, hasBefore, moments } from './producer';

export { hasBefore };

const SAID_BAR = 0.6;
const STATE_BAR = 0.7;
/**
 * How sure Jev must be to overrule the breakdown on who is a group or a crowd (at or above the bar,
 * yes; at or below one minus it, no; between, the breakdown's own reading stands), and on what a
 * change is. Set from evals/kinds.json (25 Sep): groups 0.72-0.90 and single people 0.26-0.39 on
 * "more than one person"; crowds 0.79-0.85 and everyone else 0.06-0.19 on "a crowd".
 */
export const KIND_BARS = { several: 0.55, crowd: 0.6, look: 0.3, whole: 0.5 } as const;

/** What a dream calls someone or something, for a question about them. */
const nameIn = (b: Breakdown, id: string) =>
  b.people.find((p) => p.id === id)?.is_dreamer
    ? 'the dreamer'
    : (b.people.find((p) => p.id === id)?.name ??
      b.things.find((t) => t.id === id)?.name ??
      b.places.find((l) => l.id === id)?.name ??
      id);

/**
 * What a lasting change is, asked of Jev: a change in how something looks at all (not where it is
 * or what it does), and whether it turns into something else altogether rather than changing a
 * part. A word list decided the second ("form", "itself"); a change of "location" was kept as a look.
 */
export function changeQuestions(
  b: Breakdown,
  list: { key: string; who: string; what: string; now: string }[],
): Record<string, Question> {
  const q: Record<string, Question> = {};
  for (const c of list) {
    const who = nameIn(b, c.who);
    q[`change_${c.key}`] = {
      type: 'noul',
      instructions: `A dream's breakdown says ${who}'s "${c.what}" becomes "${c.now}". Does ${who} look different from then on than before: a lasting change in how ${who} looks? Not a change: how ${who} simply looks as first shown, or where ${who} is, or what ${who} does.`,
      criteria: {
        true: `${who} looks different from then on`,
        false: `it is how ${who} looks anyway, or where ${who} is or what ${who} does`,
      },
    };
    q[`whole_${c.key}`] = {
      type: 'noul',
      instructions: `In a dream, ${who}'s "${c.what}" becomes "${c.now}". Does ${who} turn into something else altogether (a sofa into a roller coaster, a man into a bird), rather than one part or quality of it changing (a head into a block of ice, hair turning white)?`,
      criteria: {
        true: 'it turns into something else altogether',
        false: 'one part or quality of it changes; it is still what it was',
      },
    };
  }
  return q;
}

/**
 * Who is a group and who is a crowd, asked of Jev: the breakdown's flags and a word list missed "a
 * couple of people", and a crowd drawn as a person was sketched standing in a line (24 Sep).
 */
export function crowdQuestions(b: Breakdown): Record<string, Question> {
  const q: Record<string, Question> = {};
  for (const p of b.people.filter((x) => !x.is_dreamer)) {
    const who = `"${p.name}"${p.fields.identity?.value ? ` (${p.fields.identity.value})` : ''}`;
    q[`several_${p.id}`] = {
      type: 'noul',
      instructions: `In a dream, does ${who} stand for more than one person: a family, a couple, a band, a crowd?`,
      criteria: { true: 'more than one person', false: 'one person' },
    };
    q[`crowd_${p.id}`] = {
      type: 'noul',
      instructions: `In a dream, is ${who} a crowd: many people seen together, none of them looked at or known on their own, like an audience, passers-by, or the other people in a room?`,
      criteria: {
        true: 'a crowd: many people, none of them anyone in particular',
        false: 'one person, or a few people the dream looks at or knows: a family, a couple, friends',
      },
    };
  }
  return q;
}


/** A change's kind from Jev's answers: undefined where Jev gave no reading. */
export function changeKind(answers: Record<string, Answer> | null, key: string): { look?: boolean; whole?: boolean } {
  const n = (k: string) => {
    const a = answers?.[k];
    return a?.type === 'noul' ? a.noul : undefined;
  };
  const look = n(`change_${key}`);
  const whole = n(`whole_${key}`);
  return {
    ...(look !== undefined ? { look: look >= KIND_BARS.look } : {}),
    ...(whole !== undefined ? { whole: whole >= KIND_BARS.whole } : {}),
  };
}

/**
 * The breakdown's own changes, read by Jev before anything is planned from them: dropped where
 * nothing changes, marked where something turns into something else. The breakdown recorded how
 * five people and things simply looked as lasting changes ("appearance: little round
 * convertible"), and each would have been drawn as an in-between picture that changed nothing, and
 * its moments drawn from that instead of the sketch (25 Sep). Changes the dream's grounding has
 * already read are asked again: a dream grounded before this was asked.
 */
export async function judgeLeaves(jev: JevFn, b: Breakdown): Promise<string[]> {
  const list = changes(b);
  if (!list.length) return [];
  const call = await jev(
    JSON.stringify({ changes: list.map((c) => `${nameIn(b, c.who)}: "${c.what}" becomes "${c.now}"`) }),
    changeQuestions(b, list),
  );
  const dropped: string[] = [];
  for (const m of moments(b)) {
    const kept: typeof m.leaves = [];
    (m.leaves ?? []).forEach((l, i) => {
      const kind = changeKind(call.answers, `${m.id}_${i}`);
      if (!hasBefore(b, m.id, l.who) || (kind.look === false && kind.whole !== true))
        dropped.push(`${m.id}: ${nameIn(b, l.who)} ${l.what}`);
      else kept.push({ ...l, ...(kind.whole !== undefined ? { whole: kind.whole } : {}) });
    });
    if (m.leaves) m.leaves = kept;
  }
  return dropped;
}

/**
 * The script supervisor's finds, each read by Jev as the breakdown's own changes are: kept only if
 * it changes how something looks, and marked when it turns something into something else.
 */
export async function judgeChanges<
  C extends { moment: string; who: string; what: string; now: string; whole?: boolean },
>(jev: JevFn, b: Breakdown, found: C[]): Promise<C[]> {
  if (!found.length) return found;
  const keyed = found.map((c, i) => ({ key: `s${i}`, who: c.who, what: c.what, now: c.now }));
  const call = await jev(
    JSON.stringify({ changes: keyed.map((k) => `${nameIn(b, k.who)}: ${k.what} becomes ${k.now}`) }),
    changeQuestions(b, keyed),
  );
  return found.flatMap((c, i) => {
    const kind = changeKind(call.answers, `s${i}`);
    if (kind.look === false && kind.whole !== true) return [];
    return [{ ...c, ...(kind.whole !== undefined ? { whole: kind.whole } : {}) }];
  });
}

export type GroundingNote = { path: string; label: string; value: string; p: number; evidence: number | null };

function evidenceOptions(transcript: Exchange[]): Record<string, string> {
  const options: Record<string, string> = { none: 'no message of theirs says this' };
  transcript.forEach((e, idx) => {
    if (e.role === 'user') options[`m${idx}`] = e.content.slice(0, 240);
  });
  return options;
}

export function groundingQuestions(b: Breakdown, transcript: Exchange[]): Record<string, Question> {
  const options = evidenceOptions(transcript);
  const q: Record<string, Question> = {};
  const add = (key: string, claim: string) => {
    q[`said_${key}`] = {
      type: 'noul',
      instructions: `The person told a dream. Did they themselves say this, or plainly mean it: ${claim}`,
      criteria: {
        true: 'their own words say it, or plainly mean it',
        false: 'it is an inference, an addition, or goes beyond what they said',
      },
    };
    q[`where_${key}`] = {
      type: 'choice',
      instructions: `Which of the person's messages says: ${claim}`,
      criteria: options,
    };
  };
  for (const { path, label, detail } of details(b))
    if (detail.said && detail.value) add(path, `${label} "${detail.value}"?`);
  // A profile is drawn on every picture of its subject, so a thing that happens to them in the
  // dream must not be in it (a woman whose head turns to ice was sketched with the ice, 23 Sep).
  for (const p of [...b.people, ...b.places])
    for (const [k, d] of Object.entries(p.fields))
      if (d.value)
        q[`state_${p.id}.${k}`] = {
          type: 'noul',
          instructions: `A profile of ${p.name} from a dream says: "${d.value}". Does it describe something from the story rather than how ${p.name} ordinarily looks: a change or passing state (turning into something, melting, glowing), something ${p.name} does in the dream (cooking, juggling, driving, waiting), or who else is there?`,
          criteria: {
            true: 'it describes a change, an activity from the story, or other people present, such as "cooking", "juggling", "with you and your aunt" or "turning to ice"',
            false: 'it describes how they ordinarily look, or what the place is and holds, or says nothing is known',
          },
        };
  Object.assign(q, crowdQuestions(b), changeQuestions(b, changes(b)));
  // A moment is judged on what is in it, not on how near it is shown: the same told moment,

  // framed wide and then close, is still what they said.
  for (const m of moments(b))
    if (m.said) add(m.id, `this was in the dream, however near or far it is shown — "${m.action}"?`);
  // A dream's jump is kept only if they told it: continuity is broken on purpose there.
  for (const m of moments(b)) if (m.shift) add(`shift_${m.id}`, `the dream jumped here, abruptly: ${m.shift}?`);
  return q;
}

const HOLDS_BAR = 0.4;
const SIDE_BAR = 0.5;
/** Questions per Jev call; a long storyboard is asked in parallel calls over the same state. */
const JEV_CHUNK = 30;

/** Two `looks_at` in the same words face the same side without asking. */
const sameWords = (a: string, b: string) => {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/\b(the|a|an)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return norm(a) === norm(b);
};

/** What is in view in a moment, place included: the things a lasting change can be seen on. */
const inViewAt = (m: Moment) => new Set([...m.visible, ...m.things, m.place]);

/** Every lasting change in the story, in order, keyed for Jev. */
export function changes(b: Breakdown): { key: string; at: string; who: string; what: string; now: string }[] {
  return moments(b).flatMap((m) => (m.leaves ?? []).map((l, i) => ({ key: `${m.id}_${i}`, at: m.id, ...l })));
}

/**
 * The continuity judgments, one pass over the storyboard:
 * - `from_<m>`: which earlier picture it must match, or none. Not "always the one before": a
 *   return to a room after a cutaway matches the last picture of that room, and a new place
 *   matches nothing (Strawberry's Story Architect: link `continuity_from` to any relevant earlier
 *   cut). Jev chooses among the real moments, so a link can only point at one that exists.
 * - `side_<a>_<b>`: two pictures in the same place, facing the same side of it or not.
 * - `holds_<k>_<m>`: whether a lasting change still holds at a later picture of what changed.
 */
export function continuityQuestions(b: Breakdown): { state: string; questions: Record<string, Question> } {
  const ms = moments(b);
  const names = new Map<string, string>([...b.people, ...b.places, ...b.things].map((x) => [x.id, x.name]));
  const name = (id: string) => (id === 'you' ? 'the dreamer' : (names.get(id) ?? id));
  const describe = (m: Moment) => {
    const inView = [...m.visible, ...m.things].map(name);
    return `${m.action} (${names.get(m.place) ?? 'somewhere'}${inView.length ? `; in view: ${inView.join(', ')}` : ''}; ${m.distance}${m.looks_at ? `, facing ${m.looks_at}` : ''})`;
  };
  const no = (m: Moment) => ms.indexOf(m) + 1;
  const state = `A storyboard of a dream, picture by picture, in story order:\n${ms.map((m) => `${no(m)}. [${m.id}] ${describe(m)}${m.shift ? ` — the dream jumps here: ${m.shift}` : ''}`).join('\n')}`;
  const questions: Record<string, Question> = {};
  ms.forEach((m, i) => {
    if (i === 0) return;
    const criteria: Record<string, string> = {
      none: 'nothing earlier needs matching: it opens a new place or time, or shows nothing an earlier picture showed',
    };
    for (const e of ms.slice(0, i)) criteria[e.id] = describe(e);
    questions[`from_${m.id}`] = {
      type: 'choice',
      instructions: `For picture ${i + 1}, "${describe(m)}": which earlier picture must it match for the storyboard to read as one continuous sequence, the one showing the same people, things or place in the state this picture carries on from? If it starts something new, answer none.`,
      criteria,
    };
    for (const e of ms.slice(0, i)) {
      if (e.place !== m.place || !m.place || !e.looks_at || !m.looks_at || sameWords(e.looks_at, m.looks_at)) continue;
      const place = names.get(m.place) ?? 'the place';
      questions[`side_${e.id}_${m.id}`] = {
        type: 'noul',
        instructions: `In ${place}, picture ${no(e)} faces ${e.looks_at} and picture ${i + 1} faces ${m.looks_at}. Do the two pictures face the same side of ${place}, so the same walls and things would be behind what they show?`,
        criteria: {
          true: 'the camera faces the same way in both, give or take a little',
          false: 'the camera faces a different side of the place, or the opposite way',
        },
      };
    }
  });
  for (const c of changes(b)) {
    const at = ms.findIndex((m) => m.id === c.at);
    for (const m of ms.slice(at + 1)) {
      if (!inViewAt(m).has(c.who)) continue;
      questions[`holds_${c.key}_${m.id}`] = {
        type: 'noul',
        instructions: `In this dream, at picture ${at + 1} ${name(c.who)}'s ${c.what} became: ${c.now}. In picture ${no(m)} ("${describe(m)}"), is ${name(c.who)}'s ${c.what} still like that?`,
        criteria: {
          true: 'still so in that picture: nothing in the story has undone it',
          false: 'the story has undone it by then, or that picture is apart from it',
        },
      };
    }
  }
  return { state, questions };
}

async function askInChunks(jev: JevFn, state: string, questions: Record<string, Question>) {
  const entries = Object.entries(questions);
  const calls = await Promise.all(
    Array.from({ length: Math.ceil(entries.length / JEV_CHUNK) }, (_, i) =>
      jev(state, Object.fromEntries(entries.slice(i * JEV_CHUNK, (i + 1) * JEV_CHUNK))),
    ),
  );
  const answers: Record<string, Answer> = {};
  for (const c of calls) Object.assign(answers, c.answers ?? {});
  return { answers, ms: Math.max(0, ...calls.map((c) => c.ms)), error: calls.find((c) => c.error)?.error ?? null };
}

/**
 * Jev's continuity judgments applied to the breakdown: each moment's `from`, the earlier moments
 * facing the same side of its place, and the lasting changes still in force at it. When Jev isn't
 * sure, the producer's own view stands for `from`, and a change holds.
 */
export async function linkContinuity(
  b: Breakdown,
  jev: JevFn,
): Promise<{ breakdown: Breakdown; links: string[]; notes: string[]; ms: number }> {
  const out: Breakdown = structuredClone(b);
  const all = moments(out);
  const { state, questions } = continuityQuestions(out);
  const call = Object.keys(questions).length ? await askInChunks(jev, state, questions) : null;
  const a = (key: string) => call?.answers?.[key];
  const links: string[] = [];
  const notes: string[] = [];
  for (const s of out.scenes)
    s.moments.forEach((m, j) => {
      const choice = a(`from_${m.id}`);
      const earlier = all.slice(0, all.indexOf(m));
      let from: string | null = j > 0 && m.continues ? s.moments[j - 1].id : null;
      if (choice?.type === 'choice' && choice.confidence >= 0.5)
        from = choice.choice !== 'none' && earlier.some((e) => e.id === choice.choice) ? choice.choice : null;
      m.from = from;
      if (from) links.push(`${m.id}←${from}`);
      m.sameSide = earlier
        .filter((e) => e.place === m.place && m.place)
        .filter((e) => {
          if (!e.looks_at || !m.looks_at || sameWords(e.looks_at, m.looks_at)) return true;
          const side = a(`side_${e.id}_${m.id}`);
          return side?.type === 'noul' && side.noul >= SIDE_BAR;
        })
        .map((e) => e.id);
    });
  const cs = changes(out);
  for (const m of all) {
    const at = all.indexOf(m);
    const inForce = new Map<string, State>();
    for (const c of cs) {
      if (all.findIndex((x) => x.id === c.at) >= at || !inViewAt(m).has(c.who)) continue;
      const h = a(`holds_${c.key}_${m.id}`);
      if (h?.type === 'noul' && h.noul < HOLDS_BAR) {
        notes.push(`${c.who}'s ${c.what} no longer "${c.now}" at ${m.id} (${h.noul.toFixed(2)})`);
        inForce.delete(`${c.who}/${c.what}`);
        continue;
      }
      inForce.set(`${c.who}/${c.what}`, { who: c.who, what: c.what, now: c.now, since: c.at });
    }
    m.states = [...inForce.values()];
  }
  if (call?.error) notes.push(`continuity judge: ${call.error.slice(0, 160)}`);
  return { breakdown: out, links, notes, ms: call?.ms ?? 0 };
}

const CONTENT_BAR = 0.5;

/** Light sources a style must not bring into every picture: the stove in a stairwell (23 Sep). */
const NAMED_LIGHTS = /\b(lamps?|stoves?|candles?|lanterns?|fires?|fireplaces?|hearths?|torches?)\b/i;

/** A lighting sentence without its clauses that name light sources. */
function withoutNamedLights(sentence: string): string {
  if (!NAMED_LIGHTS.test(sentence)) return sentence;
  const kept = sentence
    .replace(/[.!?]+$/, '')
    .split(/,\s*(?:but|and|while|with)\s+|;\s*|,\s+(?=as if|like)/)
    .filter((clause) => !NAMED_LIGHTS.test(clause))
    .join(', ')
    .trim();
  return kept ? `${kept}.` : '';
}

// Words too general to be the story's own: a style may say them freely.
const GENERAL = new Set(
  'the and with from that this into over under light soft sharp edge edges shadow shadows colour colors color colours tone tones glow figure figures focus detail details line lines paper texture background surface form forms shape shapes scene dream picture image warm cool pale dark bright white black grey gray blue green clear smooth faint rough thin thick layer layers wash washes stroke strokes style drawn drawing painting sketch room place places people person thing things young small little large big face faces body bodies hand hands head world outside inside other others side sides back front short long empty tiny old new first second far near end top bottom left right own just like some all each every few many much more most very quite slight slightly gentle gently subtle deep high low open close closed half whole full block blocks piece pieces part parts'.split(
    ' ',
  ),
);

/**
 * The story's own words: what its people, places and things are called, and what changes on
 * them. A style that names one ("smooth, photorealistic rendering on the ice") draws it into
 * every picture, where it may not yet exist.
 */
function storyWords(b: Breakdown): Set<string> {
  const out = new Set<string>();
  const add = (text: string) => {
    for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) if (!GENERAL.has(w)) out.add(w.replace(/s$/, ''));
  };
  for (const x of [...b.people, ...b.places, ...b.things]) add(x.name);
  for (const m of moments(b)) for (const l of m.leaves ?? []) add(`${l.what} ${l.now}`);
  return out;
}

const namesStory = (text: string, words: Set<string>) =>
  (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).some((w) => words.has(w.replace(/s$/, '')));

/** The sentences of a lighting rule, each judged on its own. */
const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * A way of drawing it is technique only: the medium, the line, the colour treatment, the light's
 * quality. A style that names the dream's own content ("cobblestone street and old European
 * village", "pools of warm light from lamps and stoves") puts that content in every picture: a
 * hallway came back cobbled and a stairwell with a stove (23 Sep). Jev judges each token and each
 * sentence of the light; content is dropped from the style, since the pictures carry it where it
 * belongs.
 */
export async function cleanStyles(b: Breakdown, jev: JevFn): Promise<{ breakdown: Breakdown; dropped: string[] }> {
  const out: Breakdown = structuredClone(b);
  const questions: Record<string, Question> = {};
  const ask = (key: string, text: string) => {
    questions[key] = {
      type: 'noul',
      instructions: `A way of drawing a dream is described by this phrase: "${text}". If a picture followed it, would something appear in the picture that is not there anyway: a place, room, building, street, object, person or animal; a substance or particles such as water drops, rain, snow, dust, smoke or sparks; a particular light source such as lamps, stoves, candles or a fire; or anything from the dream's story? A comparison counts ("like an equipment room" brings the room). Or does it only change how the picture is drawn (the medium, the line, the texture, the colour treatment, the general quality and direction of light)?`,
      criteria: {
        true: 'following it adds things to the picture: places, objects, people, water drops or other particles, particular light sources, or story content, even by comparison',
        false: 'it only changes how the picture is drawn, or the general quality and direction of light',
      },
    };
  };
  out.style_options.forEach((o, i) => {
    o.tokens.forEach((t, j) => ask(`tok_${i}_${j}`, t));
    sentences(o.lighting_rules).forEach((t, j) => ask(`light_${i}_${j}`, t));
    // How it feels like a dream is drawn into every picture, so it may carry no content either.
    if (o.dream) ask(`dream_${i}`, o.dream);
  });
  if (!Object.keys(questions).length) return { breakdown: out, dropped: [] };
  const call = await jev('Ways a dream could be drawn, proposed for a storyboard.', questions);
  const content = (key: string) => {
    const a = call.answers?.[key];
    return a?.type === 'noul' && a.noul >= CONTENT_BAR;
  };
  const dropped: string[] = [];
  const story = storyWords(out);
  out.style_options.forEach((o, i) => {
    const tokens = o.tokens.filter((t, j) => {
      if (!content(`tok_${i}_${j}`) && !namesStory(t, story)) return true;
      dropped.push(`${o.name}: "${t}"`);
      return false;
    });
    // Never empty a style: if every token named content, the least bad stays.
    o.tokens = tokens.length ? tokens : o.tokens.slice(0, 1);
    if (o.dream && (content(`dream_${i}`) || namesStory(o.dream, story))) {
      dropped.push(`${o.name} dream: "${o.dream}"`);
      o.dream = '';
    }
    o.lighting_rules = sentences(o.lighting_rules)
      .map((t, j) => {
        if (content(`light_${i}_${j}`) || namesStory(t, story)) {
          dropped.push(`${o.name} light: "${t}"`);
          return '';
        }
        const kept = withoutNamedLights(t);
        if (kept !== t) dropped.push(`${o.name} light: "${t}" → "${kept}"`);
        return kept;
      })
      .filter(Boolean)
      .join(' ');
  });
  return { breakdown: out, dropped };
}

/**
 * Apply Jev's answers: a "said" that Jev can't back becomes a guess. Returns the details that
 * were downgraded. When the judge is unavailable, nothing is confirmed as said.
 */
export async function ground(
  b: Breakdown,
  transcript: Exchange[],
  jev: JevFn,
): Promise<{ breakdown: Breakdown; downgraded: GroundingNote[]; ms: number; error: string | null }> {
  const out: Breakdown = structuredClone(b);
  const questions = groundingQuestions(out, transcript);
  if (!Object.keys(questions).length) return { breakdown: out, downgraded: [], ms: 0, error: null };
  const call = await jev(renderTranscript(transcript), questions);
  const downgraded: GroundingNote[] = [];
  const judge = (key: string): { ok: boolean; p: number; evidence: number | null } => {
    const said = call.answers?.[`said_${key}`];
    const where = call.answers?.[`where_${key}`];
    const p = said?.type === 'noul' ? said.noul : 0;
    const pick = where?.type === 'choice' ? where.choice : 'none';
    const evidence = pick.startsWith('m') ? Number(pick.slice(1)) : null;
    return { ok: p >= SAID_BAR && evidence !== null, p, evidence };
  };

  for (const { path, label, detail } of details(out)) {
    if (!detail.said || !detail.value) continue;
    const { ok, p, evidence } = judge(path);
    if (ok) detail.evidence = evidence;
    else {
      detail.said = false;
      detail.evidence = null;
      downgraded.push({ path, label, value: detail.value, p: Number(p.toFixed(2)), evidence });
    }
  }
  for (const p of [...out.people, ...out.places])
    for (const [k, d] of Object.entries(p.fields) as [string, Detail][]) {
      const a = call.answers?.[`state_${p.id}.${k}`];
      if (!d.value || a?.type !== 'noul' || a.noul < STATE_BAR) continue;
      downgraded.push({
        path: `${p.id}.${k}`,
        label: `${p.name}: a story state, not a profile`,
        value: d.value,
        p: Number(a.noul.toFixed(2)),
        evidence: null,
      });
      d.value = null;
      d.said = false;
      d.evidence = null;
    }
  for (const m of moments(out)) {
    if (!m.said) continue;
    const { ok, p, evidence } = judge(m.id);
    if (!ok) {
      m.said = false;
      downgraded.push({ path: m.id, label: 'moment', value: m.action, p: Number(p.toFixed(2)), evidence });
    }
  }
  // Who is a group or a crowd, where Jev is sure; between the bars the breakdown's reading stands.
  for (const p of out.people.filter((x) => !x.is_dreamer)) {
    const n = (k: string) => {
      const a = call.answers?.[`${k}_${p.id}`];
      return a?.type === 'noul' ? a.noul : undefined;
    };
    const crowd = n('crowd');
    const several = n('several');
    if (crowd !== undefined && crowd >= KIND_BARS.crowd) Object.assign(p, { extras: true, several: true });
    else if (crowd !== undefined && crowd <= 1 - KIND_BARS.crowd) p.extras = false;
    if (several !== undefined && several >= KIND_BARS.several) p.several = true;
    else if (several !== undefined && several <= 1 - KIND_BARS.several && !p.extras) p.several = false;
  }
  // What each lasting change is: a change of look at all, and of the whole or a part.
  for (const m of moments(out)) {
    const kept: typeof m.leaves = [];
    (m.leaves ?? []).forEach((l, i) => {
      const kind = changeKind(call.answers, `${m.id}_${i}`);
      // A change into something else altogether always changes how it looks: "the house becomes a
      // boat" read as not a change of look (0.28), and would have been dropped. And nothing changes
      // where it is first shown.
      if (!hasBefore(out, m.id, l.who) || (kind.look === false && kind.whole !== true)) {
        downgraded.push({
          path: `${m.id}.leaves`,
          label: 'not a change of how it looks',
          value: `${l.what}: ${l.now}`,
          p: 0,
          evidence: null,
        });
        return;
      }
      kept.push({ ...l, ...(kind.whole !== undefined ? { whole: kind.whole } : {}) });
    });
    if (m.leaves) m.leaves = kept;
  }
  // An invented jump would be a lie about their dream, and would break continuity for nothing.
  for (const m of moments(out)) {
    if (!m.shift) continue;
    const { ok, p, evidence } = judge(`shift_${m.id}`);
    if (!ok) {
      downgraded.push({
        path: `${m.id}.shift`,
        label: 'a jump they did not tell',
        value: m.shift,
        p: Number(p.toFixed(2)),
        evidence,
      });
      m.shift = '';
    }
  }
  return { breakdown: out, downgraded, ms: call.ms, error: call.error };
}
