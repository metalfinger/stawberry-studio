// Someone the camera leaves outside the picture is not in it (the one builder's `framed_only`): no image of them is sent
// and they are not listed. "Just outside the picture to the left is the man in the wheelchair, whom the dreamer has
// just reached" went out with his identity image all the same (the merged flow's dream 3, m4, 1 Oct).
import { describe, expect, test } from 'bun:test';
import { inViewOf } from '../frames';
import type { Item } from '../sheets';

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

const sheet = (id: string, kind: Item['kind'], name: string): Item =>
  ({ id, kind, name, fields: {}, status: 'ready', version: 1 }) as Item;
const sheets = [
  sheet('p2', 'character', 'the man in the wheelchair'),
  sheet('p4', 'character', 'the old love'),
  sheet('t1', 'prop', 'the lectern'),
  sheet('l1', 'location', 'the lecture hall'),
];
const frame = (sees?: string[]): Item =>
  ({
    id: 'm4',
    kind: 'cut',
    name: 'm4',
    fields: {},
    status: 'ready',
    version: 1,
    frame: { visible: ['p2', 'p4'], things: ['t1'], place: 'l1', eyes: 'dreamer', plan: sees ? { sees } : {} },
  }) as unknown as Item;

describe('only who the camera holds is in the picture', () => {
  test('with the step, a person the camera leaves out is neither sent nor listed; things and the place stay', () => {
    const ids = withBuilder('framed_only', () => inViewOf(frame(['p4']), sheets).map((s) => s.id));
    expect(ids).toEqual(['p4', 't1', 'l1']);
  });

  test('with no camera planned, or without the step, as before', () => {
    expect(withBuilder('framed_only', () => inViewOf(frame(), sheets).map((s) => s.id))).toEqual([
      'p2',
      'p4',
      't1',
      'l1',
    ]);
    expect(withBuilder(undefined, () => inViewOf(frame(['p4']), sheets).map((s) => s.id))).toEqual([
      'p2',
      'p4',
      't1',
      'l1',
    ]);
  });
});
