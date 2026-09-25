// The floor plan's facts, from Jev. The planning model used to guess them inside one long answer
// that also placed everything: whether a place is outdoors, what each thing is to whoever is at
// it, who holds what, and what each moment's camera faces. It planned a village street as an indoor
// room, and matched "the village street" to nothing (25 Sep).
//
// Now each is one question in one call per place, answered in under a second, and applied by code.
// Code then checks the plan as a whole: every scene has one, and what each moment's camera faces is
// on it. A scene that fails goes back to the planner once, with its problems named (`fix`).
import { type Blocking, SHAPES, type Shape, type Spot } from './blocking';
import type { JevFn, Question } from './jev';
import { atSite, recordJev } from './jevlog';
import type { Breakdown, Moment } from './producer';

/** How sure Jev must be for its answer to replace the planner's. Provisional until each has a labelled set. */
export const PLAN_BARS = { outdoors: 0.5, shape: 0.5, holder: 0.6, looks: 0.4 } as const;

/** Words naming a side or an end of a place, which code turns into a way to look. */
export const SIDE = /\b(back|far end|far side|rear|left|right|front)\b/i;

/** What a moment's camera faces on its plan: a spot's id, the place's front, or what the plan lacks. */
export type Looks = string | 'front' | 'missing' | 'beyond';

const SHAPE_WORDS: Record<Shape, string> = {
  seat: 'something people sit or lie on: a sofa, a bench, a bed, a chair',
  vehicle: 'something people ride in: a car, a boat, a cart, a carriage',
  ground:
    'a surface people stand or walk on, or that lies flat: a street, a road, a bridge, a stage, a rug, a creek, a field',
  steps: 'stairs or steps people climb',
  block: 'anything else: a machine, a building, a wall, a tree, a table, something held',
};

/** The questions for one place's plan, and the state they read. */
export function planQuestions(
  b: Breakdown,
  plan: Blocking,
  placeId: string,
  moments: Moment[],
): { state: string; questions: Record<string, Question> } {
  const place = b.places.find((l) => l.id === placeId);
  const nameOf = (s: Spot) =>
    s.name ??
    (b.people.find((p) => p.id === s.id)?.is_dreamer ? 'the dreamer' : undefined) ??
    b.people.find((p) => p.id === s.id)?.name ??
    b.things.find((t) => t.id === s.id)?.name ??
    s.id;
  const spots = plan.spots.filter((s) => !s.many || s.kind === 'person');
  const people = spots.filter((s) => s.kind === 'person' && !s.many);
  const things = spots.filter((s) => s.kind !== 'person');
  const state = JSON.stringify(
    {
      place: {
        name: place?.name ?? placeId,
        ...(place?.fields.geography?.value ? { what_it_is: place.fields.geography.value } : {}),
        ...(place?.fields.landmarks?.value ? { what_is_in_it: place.fields.landmarks.value } : {}),
      },
      moments: moments.map((m) => ({
        id: m.id,
        action: m.action,
        ...(m.looks_at ? { camera_faces: m.looks_at } : {}),
      })),
      on_the_plan: Object.fromEntries(spots.map((s) => [s.id, nameOf(s)])),
      front: plan.front,
    },
    null,
    1,
  );
  const q: Record<string, Question> = {
    outdoors: {
      type: 'noul',
      instructions:
        'Do the moments at `place` happen outdoors: a street, a village, a garden, a field, a beach, anywhere under the open sky? Someone looking out at it from a doorway is still looking at an outdoor place.',
      criteria: {
        true: 'outdoors, under the open sky',
        false: 'inside a building: a room, a hall, a hallway, a stairwell',
      },
    },
  };
  for (const t of things)
    q[`shape_${t.id}`] = {
      type: 'choice',
      instructions: `In these moments, what is \`on_the_plan.${t.id}\` to the people at it?`,
      criteria: SHAPE_WORDS,
    };
  for (const t of things.filter((x) => !x.fixture && people.length))
    q[`holder_${t.id}`] = {
      type: 'choice',
      instructions: `In these moments, does anyone hold or carry \`on_the_plan.${t.id}\` in their hands?`,
      criteria: {
        ...Object.fromEntries(people.map((p) => [p.id, `${nameOf(p)} holds or carries it`])),
        nobody: 'nobody holds it: it stands, lies or moves on its own',
      },
    };
  moments.forEach((m, i) => {
    if (!m.looks_at) return;
    q[`looks_${m.id}`] = {
      type: 'choice',
      instructions: `The camera of moment ${m.id} faces what \`moments[${i}].camera_faces\` names. Which is it: one of \`on_the_plan\`, or the plan's \`front\`?`,
      criteria: {
        ...Object.fromEntries(spots.map((s) => [s.id, nameOf(s)])),
        front: plan.front,
        missing: 'a part of the place itself that is not on the plan (a street, a house, a door)',
        beyond: 'nothing a floor plan would place: the sky, the horizon, somewhere far away',
      },
    };
  });
  return { state, questions: q };
}

type Answers = Record<string, { type: string; noul?: number; choice?: string; confidence?: number }> | null;

/**
 * One place's plan with Jev's answers applied, and what its moments' cameras face; with what the
 * planner must fix where a moment faces a part of the place the plan lacks.
 */
export function applyPlanFacts(
  plan: Blocking,
  moments: Moment[],
  answers: Answers,
): { plan: Blocking; fix: string[]; changed: string[] } {
  const out: Blocking = structuredClone(plan);
  const fix: string[] = [];
  const changed: string[] = [];
  if (!answers) return { plan: out, fix, changed };
  const o = answers.outdoors?.noul;
  if (typeof o === 'number') {
    const indoors = o < PLAN_BARS.outdoors;
    if (indoors !== !!out.indoors) changed.push(`${indoors ? 'indoors' : 'outdoors'} (${o.toFixed(2)})`);
    if (indoors) out.indoors = true;
    else {
      delete out.indoors;
      delete out.ceiling;
    }
  }
  const sure = (a: { type: string; choice?: string; confidence?: number } | undefined, bar: number) =>
    a && a.type === 'choice' && typeof a.choice === 'string' && (a.confidence ?? 0) >= bar ? a.choice : undefined;
  const people = new Set(out.spots.filter((s) => s.kind === 'person' && !s.many).map((s) => s.id));
  for (const s of out.spots) {
    if (s.kind === 'person') continue;
    const shape = sure(answers[`shape_${s.id}`], PLAN_BARS.shape);
    if (shape && SHAPES.includes(shape as Shape) && shape !== s.shape) {
      changed.push(`${s.id} ${shape}`);
      s.shape = shape as Shape;
    }
    const holder = sure(answers[`holder_${s.id}`], PLAN_BARS.holder);
    if (holder && people.has(holder) && holder !== s.heldBy) {
      changed.push(`${s.id} held by ${holder}`);
      s.heldBy = holder;
    } else if (holder === 'nobody' && s.heldBy) {
      changed.push(`${s.id} held by nobody`);
      delete s.heldBy;
    }
  }
  const looks: Record<string, Looks> = {};
  for (const m of moments) {
    const at = sure(answers[`looks_${m.id}`], PLAN_BARS.looks);
    if (!at) continue;
    looks[m.id] = at;
    // A side or an end of the place is said in words, and placed by code: never a fixture to add.
    if (at === 'missing' && !SIDE.test(m.looks_at))
      fix.push(
        `Moment ${m.id} ("${m.action}") faces ${m.looks_at}, which the plan does not have: give it a spot, as a fixture with that name, where the moment can face it.`,
      );
  }
  if (Object.keys(looks).length) out.looks = looks;
  return { plan: out, fix, changed };
}

/**
 * Every scene's plans with Jev's facts, and per scene what the planner must fix: a scene with no
 * plan, or a moment whose camera faces something the plan lacks. `only` limits it to some scenes.
 */
export async function planFacts(
  jev: JevFn,
  b: Breakdown,
  only?: string[],
): Promise<{ breakdown: Breakdown; fix: Record<string, string[]> }> {
  const out: Breakdown = structuredClone(b);
  const fix: Record<string, string[]> = {};
  await Promise.all(
    out.scenes
      .filter((sc) => !only || only.includes(sc.id))
      .map(async (sc) => {
        if (!sc.blocking) {
          const ids = [...new Set(sc.moments.flatMap((m) => [...m.visible, ...m.things]))];
          fix[sc.id] = [
            `The scene has no plan: every person and thing of its moments needs a spot (${ids.join(', ')}).`,
          ];
          return;
        }
        // The scene's own place, and each other place its moments move through, each asked apart.
        const places = sc.blocking.places ?? {};
        const at = (pl: string | undefined) => (pl && places[pl] ? pl : sc.place);
        const plans: [string, Blocking, Moment[]][] = [
          [sc.place, sc.blocking, sc.moments.filter((m) => at(m.place) === sc.place)],
          ...Object.entries(places).map(([pl, plan]): [string, Blocking, Moment[]] => [
            pl,
            plan,
            sc.moments.filter((m) => at(m.place) === pl),
          ]),
        ];
        const done = await Promise.all(
          plans.map(async ([placeId, plan, moments]) => {
            const { state, questions } = planQuestions(out, plan, placeId, moments);
            const call = await atSite('plan', () => jev(state, questions));
            const r = applyPlanFacts(plan, moments, call.answers as Answers);
            recordJev({
              kind: 'transition',
              stage: 'plan',
              to: r.fix.length ? 'plan' : 'previs',
              moment: `${sc.id}${placeId === sc.place ? '' : `/${placeId}`}`,
              facts: [],
              decision: call.answers ? (r.fix.length ? 'fix' : 'cleared') : 'no answer',
              reason: [...r.changed.map((c) => `set ${c}`), ...r.fix].join('; ') || 'the plan stands as made',
            });
            return { placeId, ...r };
          }),
        );
        const main = done.find((d) => d.placeId === sc.place)!;
        const subs = Object.fromEntries(done.filter((d) => d.placeId !== sc.place).map((d) => [d.placeId, d.plan]));
        sc.blocking = { ...main.plan, ...(Object.keys(subs).length ? { places: subs } : {}) };
        const notes = done.flatMap((d) => d.fix);
        if (notes.length) fix[sc.id] = notes;
      }),
  );
  return { breakdown: out, fix };
}
