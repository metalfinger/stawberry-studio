// Grounding, with S8's claim by claim (docs/rules.md F1): a said value keeps only the claims the person
// said, in the breakdown and in a profile revised from their answer; off, a value is asked whole.
import { describe, expect, test } from 'bun:test';
import { claimsOf, ground, groundingQuestions, groundRevised } from '../ground';
import type { Answer, Exchange, Question } from '../jev';
import { type Breakdown, clausePieces, type Detail, joinPieces } from '../producer';
import { fakeJev, noul, pick } from './fakes';

const transcript: Exchange[] = [
  { role: 'assistant', content: 'hi, tell me your dream' },
  { role: 'user', content: 'i was on the roof of the car park at night, the rain was going upwards' },
];

// The car park's roof as the fresh simulation drafted it: their words and three guesses in one said value.
const roof = 'painted parking lines, the stairwell door, the edge wall; rain falling upwards from the ground';
const dream = (landmarks: Detail): Breakdown =>
  ({
    look: {
      colours: { value: null, said: false },
      light: { value: null, said: false },
      texture: { value: null, said: false },
    },
    people: [],
    things: [],
    places: [
      {
        id: 'l3',
        name: 'the roof',
        fields: {
          geography: { value: 'the open top of a car park', said: true },
          landmarks,
          light: { value: null, said: false },
        },
      },
    ],
    scenes: [{ id: 's1', place: 'l3', moments: [] }],
  }) as unknown as Breakdown;

/** Jev as the test wants it: said of what they said, no of the guesses, and message 1 for every "which". */
const theirs = (said: string[]) =>
  fakeJev((questions: Record<string, Question>) => {
    const out: Record<string, Answer> = {};
    for (const [k, q] of Object.entries(questions)) {
      if (k.startsWith('where_')) out[k] = pick('m1');
      if (k.startsWith('said_')) out[k] = noul(said.some((w) => q.instructions.includes(`"${w}"`)) ? 0.9 : 0.1);
    }
    return out;
  });

describe('a value cut into its claims', () => {
  test('at ";", ", ", ". " and ": ", a look run kept whole, and joined back as written', () => {
    const pieces = clausePieces(roof);
    expect(pieces.map((p) => p.text)).toEqual([
      'painted parking lines',
      'the stairwell door',
      'the edge wall',
      'rain falling upwards from the ground',
    ]);
    expect(joinPieces(pieces)).toBe(roof);
    expect(joinPieces([pieces[0], pieces[3]])).toBe('painted parking lines; rain falling upwards from the ground');
    expect(clausePieces('short, dark hair, a red coat').map((p) => p.text)).toEqual(['short, dark hair', 'a red coat']);
  });

  test('one claim, or claims that say nothing, are asked whole', () => {
    expect(claimsOf('a little yellow rowing boat')).toEqual([]);
    expect(claimsOf('an old woman; her face unknown')).toEqual([]);
    expect(claimsOf(roof).map((c) => c.i)).toEqual([0, 1, 2, 3]);
  });
});

describe('the breakdown grounded claim by claim, with S8 on', () => {
  test('a said value keeps the claims they said, and the guesses in it go', async () => {
    const jev = theirs(['painted parking lines', 'rain falling upwards from the ground']);
    const g = await ground(dream({ value: roof, said: true }), transcript, jev, true);
    const landmarks = g.breakdown.places[0].fields.landmarks;
    expect(landmarks).toEqual({
      value: 'painted parking lines; rain falling upwards from the ground',
      said: true,
      evidence: 1,
    });
    expect(g.downgraded.filter((d) => d.path.startsWith('l3.landmarks')).map((d) => d.value)).toEqual([
      'the stairwell door',
      'the edge wall',
    ]);
    // One call, as before.
    expect(jev.calls).toBe(1);
  });

  test('none of it theirs, or no message that says it: a guess, whole', async () => {
    const none = await ground(dream({ value: roof, said: true }), transcript, theirs([]), true);
    expect(none.breakdown.places[0].fields.landmarks).toEqual({ value: roof, said: false, evidence: null });
    const nowhere = fakeJev((questions) =>
      Object.fromEntries(
        Object.keys(questions)
          .filter((k) => /^(?:said|where)_/.test(k))
          .map((k) => [k, k.startsWith('where_') ? pick('none') : noul(0.9)]),
      ),
    );
    const g = await ground(dream({ value: roof, said: true }), transcript, nowhere, true);
    expect(g.breakdown.places[0].fields.landmarks.said).toBe(false);
  });

  test('off, a value is asked whole: their words and three guesses pass together', async () => {
    const q = groundingQuestions(dream({ value: roof, said: true }), transcript, false);
    expect(Object.keys(q).filter((k) => k.startsWith('said_l3.landmarks'))).toEqual(['said_l3.landmarks']);
    const whole = fakeJev((questions) =>
      Object.fromEntries(
        Object.keys(questions)
          .filter((k) => /^(?:said|where)_/.test(k))
          .map((k) => [k, k.startsWith('where_') ? pick('m1') : noul(0.8)]),
      ),
    );
    const g = await ground(dream({ value: roof, said: true }), transcript, whole, false);
    expect(g.breakdown.places[0].fields.landmarks).toEqual({ value: roof, said: true, evidence: 1 });
  });

  test('a value of one claim is asked whole either way', () => {
    const q = groundingQuestions(dream({ value: 'the stairwell door', said: true }), transcript, true);
    expect(Object.keys(q).filter((k) => k.startsWith('said_l3.landmarks'))).toEqual(['said_l3.landmarks']);
  });
});

describe('a profile revised from their answer keeps only their claims, with S8 on', () => {
  const before: Record<string, Detail> = {
    identity: { value: "the dreamer's best friend from school, Tomas", said: true },
    appearance: { value: 'a grown man', said: false },
    wardrobe: { value: null, said: false },
    distinctive_features: { value: null, said: false },
  };

  test('a value the rewrite changed and marked theirs is asked of Jev, claim by claim', async () => {
    const after = {
      ...before,
      // Marked theirs by the overlap of their words ("every apple", "an adult"); never said.
      wardrobe: { value: 'everyday adult clothes', said: true },
      appearance: { value: 'grown up at first, then ten, in the old school uniform', said: true },
    };
    const jev = theirs(['grown up at first', 'then ten', 'in the old school uniform']);
    const g = await groundRevised('tomas', 'character', before, after, transcript, jev);
    expect(g.fields.wardrobe).toEqual({ value: 'everyday adult clothes', said: false });
    expect(g.fields.appearance).toEqual(after.appearance);
    expect(g.fields.identity).toEqual(before.identity);
    expect(g.dropped).toEqual(['wardrobe: "everyday adult clothes" (a guess)']);
  });

  test('a claim of ours in it goes; nothing changed or marked theirs, nothing is asked', async () => {
    const place: Record<string, Detail> = {
      geography: { value: 'a big indoor room, the far end a walk away', said: true },
      landmarks: { value: null, said: false },
      light: { value: null, said: false },
    };
    const after = {
      ...place,
      geography: { value: 'a big indoor room, the far end a walk away, with an autoclave at one end', said: true },
    };
    const g = await groundRevised(
      'the room with the autoclave',
      'location',
      place,
      after,
      transcript,
      theirs(['a big indoor room', 'the far end a walk away']),
    );
    expect(g.fields.geography).toEqual({ value: 'a big indoor room, the far end a walk away', said: true });
    const idle = fakeJev();
    expect((await groundRevised('x', 'location', place, place, transcript, idle)).fields).toBe(place);
    expect(idle.calls).toBe(0);
  });

  test('the judge being down confirms nothing', async () => {
    const after = { ...before, wardrobe: { value: 'a grey school jumper', said: true } };
    const down = async () => ({ questions: {}, state: '', answers: null, error: 'down', ms: 1, usage: null });
    const g = await groundRevised('tomas', 'character', before, after, transcript, down);
    expect(g.fields.wardrobe.said).toBe(false);
  });
});
