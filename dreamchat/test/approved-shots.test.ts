import { describe, expect, test } from 'bun:test';
import { planContinuity } from '../continuity';
import type { Breakdown } from '../producer';
import approved from './fixtures/approved-shots.json';

// Shots whose pictures were approved (the ice head, 24 Sep; the theater's roller coaster at its
// seventh take), with the floor plans they were drawn from. A change to the planner that moves one
// of these cameras makes another shot than the one approved: on 25 Sep a stricter match for what
// a moment looks at put the camera behind the woman with the ice head, and settling a plan took the
// dreamer off the sofa she sat on. Both were caught only by checking against these.
describe('approved shots', () => {
  for (const [dream, { breakdown, approved: eyes }] of Object.entries(
    approved as unknown as Record<
      string,
      { breakdown: Breakdown; approved: Record<string, { at: { x: number; y: number }; d: { x: number; y: number } }> }
    >,
  ))
    test(`${dream}: every camera is where its approved picture's was`, () => {
      const cuts = planContinuity(breakdown).cuts;
      for (const [m, then] of Object.entries(eyes)) {
        const eye = cuts.find((c) => c.id === m)?.eye;
        expect(eye).toBeDefined();
        expect(Math.hypot(eye!.at.x - then.at.x, eye!.at.y - then.at.y)).toBeLessThan(0.6);
        expect(eye!.d.x * then.d.x + eye!.d.y * then.d.y).toBeGreaterThan(Math.cos((10 * Math.PI) / 180));
      }
    });
});
