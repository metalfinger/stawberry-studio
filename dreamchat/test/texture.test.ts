// A simile or a reason the dreamer gives is kept where a picture can show it, as what is seen, never in its own words,
// and left to the narration where only a sound or a memory carries it (the one builder's `texture`; evals/texture.ts).
import { describe, expect, test } from 'bun:test';
import { producerSystem } from '../producer';

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

describe("the producer's texture rule", () => {
  test('with the step, the rule follows the concrete-words rule; up to the step before, the prompt word for word', () => {
    const before = withBuilder('plan_facing', () => producerSystem());
    const on = withBuilder('texture', () => producerSystem());
    expect(on).toContain('A simile or a reason they give that a picture can show is kept, as what is seen');
    const at = on.indexOf(' A simile or a reason they give');
    const end = on.indexOf('show what is seen as it happens.') + 'show what is seen as it happens.'.length;
    expect(on.slice(0, at) + on.slice(end)).toBe(before);
    expect(before).not.toContain('A simile or a reason they give');
  });
});
