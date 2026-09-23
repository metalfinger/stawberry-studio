// Grounding: Jev checks every detail the producer marked as said against the person's own
// messages. It is the lab's evidence rule applied to production data. A detail stays "said"
// only when Jev agrees the person said it AND can point at the message; otherwise it becomes a
// guess, and the person is asked to confirm it before anything is drawn from it.
import type { Answer, Exchange, JevFn, Question } from './jev';
import { renderTranscript } from './jev';
import { type Breakdown, type Detail, type Moment, type State, details, moments } from './producer';

const SAID_BAR = 0.6;
const STATE_BAR = 0.7;

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
          instructions: `A profile of ${p.name} from a dream says: "${d.value}". Does it describe something that happens to ${p.name} during the dream (a change, transformation or passing state), rather than how ${p.name} ordinarily looks?`,
          criteria: {
            true: 'it describes a change or state from the story, such as turning into something, melting, glowing or being hurt',
            false: 'it describes how they ordinarily look, or says nothing is known',
          },
        };
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
      instructions: `A way of drawing a dream is described by this phrase: "${text}". Does it name something that would then have to appear in every picture: a place, building, street, room, object, person, animal, anything from the dream's story, or a particular light source such as lamps, stoves, candles or a fire? Or does it only describe how the picture is drawn (the medium, the line, the texture, the colour treatment, the general quality and direction of light)?`,
      criteria: {
        true: 'it names things to show: places, objects, people, story content, or particular lamps, stoves, candles or fires',
        false: 'it only describes how the picture is drawn, or the general quality and direction of light',
      },
    };
  };
  out.style_options.forEach((o, i) => {
    o.tokens.forEach((t, j) => ask(`tok_${i}_${j}`, t));
    sentences(o.lighting_rules).forEach((t, j) => ask(`light_${i}_${j}`, t));
  });
  if (!Object.keys(questions).length) return { breakdown: out, dropped: [] };
  const call = await jev('Ways a dream could be drawn, proposed for a storyboard.', questions);
  const content = (key: string) => {
    const a = call.answers?.[key];
    return a?.type === 'noul' && a.noul >= CONTENT_BAR;
  };
  const dropped: string[] = [];
  out.style_options.forEach((o, i) => {
    const tokens = o.tokens.filter((t, j) => {
      if (!content(`tok_${i}_${j}`)) return true;
      dropped.push(`${o.name}: "${t}"`);
      return false;
    });
    // Never empty a style: if every token named content, the least bad stays.
    o.tokens = tokens.length ? tokens : o.tokens.slice(0, 1);
    o.lighting_rules = sentences(o.lighting_rules)
      .map((t, j) => {
        if (content(`light_${i}_${j}`)) {
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
