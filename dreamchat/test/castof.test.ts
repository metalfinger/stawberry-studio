// A cut's record casts only who and what the engine can check against a sketch (session.ts castOf): with the camera
// rules, whatever the picture sends no sketch of is in its words only, or the engine refuses the picture.

import { afterAll, describe, expect, test } from 'bun:test';
import type { FrameReference } from '../frames';
import { castOf } from '../session';
import type { Item } from '../sheets';
import { DEFAULTS, pinSwitches, withSwitches } from './fakes';

afterAll(pinSwitches(DEFAULTS));

// Lighthouse m3 as the camera rules frame it: through the dreamer's eyes, the key in their hands below the frame.
const f = { visible: ['p1', 'p2'], things: ['t1'], place: 'l1', eyes: 'dreamer' } as unknown as NonNullable<
  Item['frame']
>;
const ids = { p1: 'N-p1', p2: 'N-p2', t1: 'N-t1', l1: 'N-l1' };
const items = [
  { id: 'p2', mediaId: 'M-p2' },
  { id: 't1', mediaId: 'M-t1' },
  { id: 'l1', mediaId: 'M-l1' },
] as Item[];
const sent: FrameReference[] = [
  { media_id: 'M-previs', role: 'base', instruction: '' },
  { media_id: 'M-l1', role: 'location', instruction: '' },
];
const cast = (references?: FrameReference[]) =>
  castOf(f, 'p1', ids, { items, extras: new Set(), unsketched: new Set(), references });

describe("a cut's record casts what its images show", () => {
  test('with the camera rules, what it sends no sketch of is in its words only', () => {
    withSwitches({ DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' }, () => {
      const c = cast(sent);
      // The dog unseen ahead and the key below the frame: no sketch sent, neither cast.
      expect(c.visible_cast).toEqual([]);
      expect(c.required_props).toEqual([]);
      expect(c.location_id).toBeUndefined();
      // With their sketches sent, both are.
      const all = cast([
        ...sent,
        { media_id: 'M-p2', role: 'identity', instruction: '' },
        { media_id: 'M-t1', role: 'prop', instruction: '' },
      ]);
      expect(all.visible_cast).toEqual(['N-p2']);
      expect(all.required_props).toBeUndefined();
    });
  });

  test('without the camera rules, or before its images are known, the cast is as it was', () => {
    withSwitches({ DREAMCHAT_CAMERA: undefined }, () => {
      expect(cast(sent)).toEqual({ visible_cast: ['N-p2'] });
    });
    withSwitches({ DREAMCHAT_CAMERA: 'on', DREAMCHAT_CUT_SHEET: 'on', DREAMCHAT_RECORD: 'on' }, () => {
      expect(cast()).toEqual({ visible_cast: ['N-p2'] });
    });
  });
});
