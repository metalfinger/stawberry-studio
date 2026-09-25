import { describe, expect, test } from 'bun:test';
import type { Blocking } from '../blocking';
import { applyPlanFacts, planQuestions } from '../planfacts';
import type { Breakdown, Moment } from '../producer';

// Outside the house: the dreamer waits, the aunt arrives in her car, a street and a bridge.
const b = {
  people: [
    { id: 'p1', name: 'you', is_dreamer: true },
    { id: 'p4', name: 'the aunt' },
  ],
  things: [
    { id: 't2', name: 'the little round convertible' },
    { id: 't3', name: 'a string of blue balloons' },
  ],
  places: [
    {
      id: 'l5',
      name: 'outside the house',
      fields: { geography: { value: 'a quiet road by a creek' }, landmarks: { value: 'a little bridge' } },
    },
  ],
} as unknown as Breakdown;
const moments = [
  {
    id: 'm6',
    action: 'The dreamer waits outside for the aunt; she arrives in a little round convertible.',
    looks_at: 'the arriving convertible',
  },
  { id: 'm8', action: 'The aunt drops the dreamer off at the house again.', looks_at: 'the house' },
] as unknown as Moment[];
const plan: Blocking = {
  front: 'the house side',
  indoors: true,
  ceiling: 3,
  spots: [
    { id: 'p1', x: 10, y: 1, kind: 'person', pose: 'standing' },
    { id: 'p4', x: 10, y: 3, kind: 'person', pose: 'sitting' },
    { id: 't2', x: 10, y: 3, kind: 'thing', size: [1.8, 3.5, 1.5], shape: 'block' },
    { id: 't3', x: 10, y: 1, kind: 'thing', heldBy: 'p4' },
    { id: 'x1', x: 10, y: 20, kind: 'thing', fixture: true, name: 'the little bridge', size: [4, 5, 0.5] },
  ],
};
const choice = (choice: string, confidence = 0.9) => ({ type: 'choice', choice, confidence });

describe('the floor plan, as Jev reads it', () => {
  test('asks each fact once: outdoors, what each thing is, who holds each thing of the story, what each camera faces', () => {
    const { state, questions } = planQuestions(b, plan, 'l5', moments);
    expect(Object.keys(questions).sort()).toEqual(
      ['holder_t2', 'holder_t3', 'looks_m6', 'looks_m8', 'outdoors', 'shape_t2', 'shape_t3', 'shape_x1'].sort(),
    );
    // The place's own fixtures are never held; what each camera may face includes what is not there.
    const looks = questions.looks_m8;
    expect(looks.type === 'choice' && Object.keys(looks.criteria)).toEqual([
      'p1',
      'p4',
      't2',
      't3',
      'x1',
      'front',
      'missing',
      'beyond',
    ]);
    expect(JSON.parse(state).on_the_plan).toEqual({
      p1: 'the dreamer',
      p4: 'the aunt',
      t2: 'the little round convertible',
      t3: 'a string of blue balloons',
      x1: 'the little bridge',
    });
  });

  test('applies what Jev is sure of, and names what the planner must fix', () => {
    const {
      plan: out,
      fix,
      changed,
    } = applyPlanFacts(plan, moments, {
      outdoors: { type: 'noul', noul: 0.93 },
      shape_t2: choice('vehicle'),
      shape_x1: choice('ground'),
      // Not sure enough to replace the planner's.
      shape_t3: choice('seat', 0.3),
      holder_t2: choice('nobody'),
      holder_t3: choice('p1'),
      looks_m6: choice('t2'),
      looks_m8: choice('missing'),
    });
    expect(out.indoors).toBeUndefined();
    expect(out.ceiling).toBeUndefined();
    expect(out.spots.find((s) => s.id === 't2')?.shape).toBe('vehicle');
    expect(out.spots.find((s) => s.id === 'x1')?.shape).toBe('ground');
    expect(out.spots.find((s) => s.id === 't3')?.shape).toBeUndefined();
    expect(out.spots.find((s) => s.id === 't3')?.heldBy).toBe('p1');
    expect(out.looks).toEqual({ m6: 't2', m8: 'missing' });
    expect(fix).toHaveLength(1);
    expect(fix[0]).toContain('Moment m8');
    expect(fix[0]).toContain('the house');
    expect(changed).toContain('outdoors (0.93)');
    // The plan given is as it was; no answers change nothing.
    expect(plan.indoors).toBe(true);
    expect(applyPlanFacts(plan, moments, null).plan).toEqual(plan);
  });
});
