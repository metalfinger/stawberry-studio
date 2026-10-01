// A simile or a reason the dreamer gives is kept where a picture can show it, as what is seen, never in its own words,
// and left to the narration where only a sound or a memory carries it (the one builder's `texture`; evals/texture.ts).
import { describe, expect, test } from 'bun:test';
import { normalizeBreakdown, producerSystem, withoutSimile } from '../producer';

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

describe('a point never says "as if" or "like" (a word check after the writer)', () => {
  test('the simile clause goes, what is seen stays; a point with nothing else is kept', () => {
    expect(
      withoutSimile(
        'the house lights back on and all the stars streaking up into the sky, as if called back home to outer space',
      ),
    ).toBe('the house lights back on and all the stars streaking up into the sky');
    expect(
      withoutSimile(
        'the dreamer trying to say something, mouth open and lilting as if singing, the piano-key teeth showing',
      ),
    ).toBe('the dreamer trying to say something, mouth open and lilting, the piano-key teeth showing');
    expect(
      withoutSimile(
        "the mother's bucket of soft glowing yellow stars, like steamed mango dumplings, a pillow pressed over the top",
      ),
    ).toBe("the mother's bucket of soft glowing yellow stars, a pillow pressed over the top");
    expect(withoutSimile('a glowing yellow, slightly soft star, plump like a steamed mango dumpling')).toBe(
      'a glowing yellow, slightly soft star, plump',
    );
    expect(withoutSimile('the flats looking like fish tanks')).toBe('the flats');
    // Nothing but the simile: kept, never emptied.
    expect(withoutSimile('like a dream')).toBe('like a dream');
    expect(withoutSimile('the old woman alone at the window')).toBe('the old woman alone at the window');
  });

  test('with the step, the breakdown read in has none; without it, as the writer wrote it', () => {
    const raw = JSON.stringify({
      title: 't',
      people: [],
      places: [{ id: 'l1', name: 'the roof', fields: {} }],
      things: [],
      scenes: [
        {
          id: 's1',
          place: 'l1',
          moments: [
            {
              id: 'm1',
              action: 'The stars rise.',
              visible: [],
              things: [],
              place: 'l1',
              eyes: 'outside',
              distance: 'wide',
              looks_at: 'the sky',
              visual_point: 'all the stars streaking up into the sky, as if called back home to outer space',
              key: true,
              said: true,
            },
          ],
        },
      ],
      style_options: [],
    });
    const point = (v: string | undefined) =>
      withBuilder(v, () => normalizeBreakdown(raw).breakdown.scenes[0].moments[0].visual_point);
    expect(point('texture')).toBe('all the stars streaking up into the sky');
    expect(point('plan_facing')).toBe('all the stars streaking up into the sky, as if called back home to outer space');
  });
});
