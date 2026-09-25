import { describe, expect, test } from 'bun:test';
import { hasBefore, judgeLeaves } from '../ground';
import type { JevFn } from '../jev';
import type { Breakdown } from '../producer';

// Meads's house as its breakdown recorded it: the juggler's and the stove's looks written down as
// lasting changes in the moments they are first shown, and one real change, the woman's head
// turning to ice after she was first seen.
const dream = () =>
  ({
    people: [
      { id: 'p1', name: 'you', is_dreamer: true },
      { id: 'p2', name: 'the Pied-Piper sort of man' },
      { id: 'p3', name: 'the young woman' },
    ],
    things: [{ id: 't1', name: 'the stove' }],
    places: [{ id: 'l1', name: 'the village' }],
    scenes: [
      {
        id: 's1',
        moments: [
          { id: 'm1', place: 'l1', visible: ['p1', 'p3'], things: [], leaves: [] },
          {
            id: 'm2',
            place: 'l1',
            visible: ['p2'],
            things: [],
            leaves: [{ who: 'p2', what: 'appearance', now: 'Pied-Piper sort of man with curly hair' }],
          },
          {
            id: 'm3',
            place: 'l1',
            visible: ['p3'],
            things: ['t1'],
            leaves: [
              { who: 't1', what: 'appearance', now: 'a stove that almost fills the tiny room' },
              { who: 'p3', what: 'head', now: 'an irregular block of glittering ice' },
              { who: 'p3', what: 'location', now: 'at the far end of the room' },
            ],
          },
        ],
      },
    ],
  }) as unknown as Breakdown;

describe('what changes in a dream', () => {
  test('nothing changes where it is first shown', () => {
    const b = dream();
    expect(hasBefore(b, 'm2', 'p2')).toBe(false);
    expect(hasBefore(b, 'm3', 't1')).toBe(false);
    expect(hasBefore(b, 'm3', 'p3')).toBe(true);
    // The dreamer is in every moment after the first, seen or not.
    expect(hasBefore(b, 'm2', 'p1')).toBe(true);
  });

  test('only real changes of how something looks are kept, marked whole or not', async () => {
    const b = dream();
    // Jev: the ice head is a change of a part; the woman walking off is no change of look.
    const jev: JevFn = async (state, questions) => ({
      questions,
      state,
      answers: Object.fromEntries(
        Object.keys(questions).map((k) => [
          k,
          { type: 'noul' as const, noul: k === 'change_m3_2' ? 0.15 : k.startsWith('change_') ? 0.6 : 0.1 },
        ]),
      ),
      error: null,
      ms: 1,
      usage: null,
    });
    const dropped = await judgeLeaves(jev, b);
    expect(dropped.sort()).toEqual([
      'm2: the Pied-Piper sort of man appearance',
      'm3: the stove appearance',
      'm3: the young woman location',
    ]);
    const m3 = b.scenes[0].moments[2];
    expect(m3.leaves).toEqual([{ who: 'p3', what: 'head', now: 'an irregular block of glittering ice', whole: false }]);
    expect(b.scenes[0].moments[1].leaves).toEqual([]);
  });
});
