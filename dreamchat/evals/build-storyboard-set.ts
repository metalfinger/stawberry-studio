// Builds the labelled set for "storyboard complete?" from saved dreams: each case is the exact state
// the check reads (the moment, and its shot as the previs rendered it), with what the check should
// decide and why. Written to evals/storyboard.json, so a run needs no saved conversation.
//
//   bun run evals/build-storyboard-set.ts <meads first-plans json>
//
// Should clear: shots whose pictures were approved (the ice head, the theater's roller coaster) and
// a shot checked by eye (the drive over the bridge). Should hold: shots with a fault seen in their
// previs (25 Sep, Meads's house, first plans and second).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planContinuity } from '../continuity';
import type { Breakdown } from '../producer';
import { around, calledIn, type Session, storyboardState } from '../session';

type Case = { id: string; dream: string; moment: string; expect: 'clear' | 'hold'; why: string; state: string };

const state = (id: string) => join(import.meta.dir, '..', 'state', `${id}.json`);
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Session;
const firstPlans = process.argv[2];
if (!firstPlans) {
  console.error('usage: bun run evals/build-storyboard-set.ts <meads first-plans json>');
  process.exit(1);
}

/**
 * The state the check reads for one moment of a saved dream. `view` is the shot as it was checked;
 * or, where it is 'now', as the harness now words it from the same plan, if its camera is where the
 * approved picture's was: an approval is of a shot, and a moved camera is another shot.
 */
function caseOf(s: Session, dream: string, moment: string, view: string, expect: Case['expect'], why: string): Case {
  const b = s.draft!.breakdown as Breakdown;
  const m = b.scenes.flatMap((sc) => sc.moments).find((x) => x.id === moment)!;
  const cut = planContinuity(b).cuts.find((c) => c.id === moment)!;
  if (view === 'now') {
    type Eyed = { frame?: { plan?: { eye?: { at: { x: number; y: number }; d: { x: number; y: number } } } } };
    const then = (s.build?.frames?.find((f) => f.id === moment) as Eyed | undefined)?.frame?.plan?.eye;
    const eye = cut.eye;
    const cos = eye && then ? Math.max(-1, Math.min(1, eye.d.x * then.d.x + eye.d.y * then.d.y)) : -1;
    const turned = (Math.acos(cos) * 180) / Math.PI;
    const moved = eye && then ? Math.hypot(eye.at.x - then.at.x, eye.at.y - then.at.y) : 99;
    if (!cut.view || moved > 0.6 || turned > 10)
      throw new Error(
        `${dream} ${moment}: the camera is not where the approved picture's was (moved ${moved.toFixed(2)} m, turned ${turned.toFixed(0)} degrees)`,
      );
    view = cut.view;
  }
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  const called = calledIn(b, cut);
  const state = storyboardState(m, view, called, dreamer, around(b, cut, m, called, dreamer));
  return { id: `${dream}-${moment}`, dream, moment, expect, why, state };
}

const cases: Case[] = [];

// The ice head: every picture approved, drawn from these views.
const ice = read(state('dream-0924-203532-5454'));
for (const [m, why] of [
  ['m1', 'approved: the two of them talking by the autoclave, side on'],
  ['m2', 'approved at the second take: she walks off to the far end, seen from behind her'],
  ['m3', 'approved: the block of ice on her shoulders, the autoclave beside her'],
  ['m4', 'approved: the ice melting, from in front of her'],
] as const)
  cases.push(caseOf(ice, 'ice-head', m, 'now', 'clear', why));

// The theater: the roller coaster from the dreamer's seat, approved at the seventh take.
const theater = read(state('dream-0924-102852-e11a'));
cases.push(
  caseOf(
    theater,
    'theater',
    'm3',
    'now',
    'clear',
    "approved at the seventh take: the roller coaster where the big sofa was, from the dreamer's seat",
  ),
);

// Meads's house, first plans: every shot had a fault seen in its previs.
const first = read(firstPlans);
for (const [m, why] of [
  ['m1', 'the camera faces the dreamer head-on with the village behind it'],
  ['m2', 'the street is a metre-high block the juggler is "sitting on", half hidden by it'],
  ['m3', 'the dreamer is inside a two-metre block of stairs, out of the picture'],
  ['m4', 'the dreamer is "sitting on" the corner; the tiny room is not there'],
  ['m5', 'the cook faces the camera with her back to the stove she cooks at'],
  ['m6', 'the dreamer is out of the picture; the aunt "sits on" the car'],
  ['m7', 'the aunt hides the dreamer; both "sit on" the car beside the bridge, not on it'],
  ['m8', 'the dreamer and the aunt are both out of the picture; the dreamer "sits on" the house'],
  ['m9', 'the dreamer "sits on" the balloons; the couple of people are missing'],
] as const)
  cases.push(caseOf(first, 'meads-first', m, first.prep!.storyboard![m].view, 'hold', why));

// Meads's house, second plans: the drive over the bridge checked by eye; the rest still wrong.
const second = read(state('dream-0925-115615-bca7'));
cases.push(
  caseOf(
    second,
    'meads-second',
    'm7',
    second.prep!.storyboard!.m7.view,
    'clear',
    'checked by eye: the car on the bridge over the creek, both of them in it',
  ),
);
for (const [m, why] of [
  ['m1', 'the village is a room with no street: the camera faces the houses on one side'],
  ['m2', 'there is no street for him to juggle on'],
  ['m5', 'the stove is a metre across in a room it should almost fill'],
  ['m8', 'there is no house to be dropped off at'],
] as const)
  cases.push(caseOf(second, 'meads-second', m, second.prep!.storyboard![m].view, 'hold', why));

writeFileSync(join(import.meta.dir, 'storyboard.json'), `${JSON.stringify(cases, null, 1)}\n`);
console.log(
  `${cases.length} cases: ${cases.filter((c) => c.expect === 'clear').length} to clear, ${cases.filter((c) => c.expect === 'hold').length} to hold`,
);
