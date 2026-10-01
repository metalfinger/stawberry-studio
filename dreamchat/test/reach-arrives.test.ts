// "Reaches" is a hand only reaching out, for or into something (the one builder's `reach_arrives`): "an old love walks
// in, just as the dreamer reaches the man in the wheelchair" is arriving, and through the dreamer's eyes it was drawn
// as a huge reaching hand ("their own hands and arms show as they reach the man in the wheelchair", the merged flow's
// dream 3, 1 Oct).
import { describe, expect, test } from 'bun:test';
import { handAct, handsIn } from '../camera';

function withBuilder<T>(v: string | undefined, fn: () => T): T {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = v;
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
}

describe('reaching someone is arriving; reaching for something is a hand', () => {
  const arrives = ['An old love walks in, just as the dreamer reaches the man in the wheelchair'];
  test('with the step, the dreamer reaching someone or somewhere shows no hands', () => {
    withBuilder('reach_arrives', () => {
      expect(handsIn(arrives, false)).toBe(false);
      expect(handsIn(['the dreamer reaches the top of the stairs'], false)).toBe(false);
      expect(handAct(arrives)).toBeNull();
    });
  });

  test('reaching out, for, into or toward something is still a hand', () => {
    withBuilder('reach_arrives', () => {
      for (const w of [
        'the dreamer reaches for the brass handle',
        'the dreamer reaches out to the man in the wheelchair',
        'the dreamer reaches into the water',
        'the dreamer reaches up toward the shelf',
      ])
        expect(handsIn([w], false)).toBe(true);
      expect(handAct(['the dreamer reaches for the brass handle'])).toContain('reach for the brass handle');
    });
  });

  test('without it, as before: any reaching is a hand', () => {
    withBuilder(undefined, () => expect(handsIn(arrives, false)).toBe(true));
  });
});
