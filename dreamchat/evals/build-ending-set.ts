// Builds the labelled set for the "how it ended" goal from saved dreams: each case is a
// conversation cut after one of the dreamer's messages, with whether its ending has been told by
// then. Written to evals/ending.json, so a run needs no saved conversation.
//
//   bun run evals/build-ending-set.ts
//
// Told: the message where they say where the dream stops, or that they woke. Not told: a jump to
// the next place with the dream going on after it ("next thing, I was outside, waiting for my
// aunt"), read as the ending in saved runs, and the listening stopped early (night bus, 25 Sep).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from '../session';

type Entry = Session['transcript'][number];
type Case = { id: string; expect: 'told' | 'not_told'; why: string; transcript: Entry[] };

const read = (id: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'state', `${id}.json`), 'utf8')) as Session;

/** The conversation up to and including their message at `at`. */
function cut(id: string, at: number, expect: Case['expect'], why: string): Case {
  const t = read(id).transcript;
  if (t[at]?.role !== 'user') throw new Error(`${id}: message ${at} is not theirs`);
  return { id: `${id.slice(-4)}@${at}`, expect, why, transcript: t.slice(0, at + 1) };
}

const NIGHT_BUS = 'dream-0925-175446-6d6a';
const ended =
  'then the kitchen table turned into a small wooden boat and my grandmother told me to get in. it floated out of ' +
  'the kitchen door onto the street where the bus had been, but the street was a river now. my brother waved from ' +
  "the bank with the blue lantern. that's when i woke up.";

const cases: Case[] = [
  cut('dream-0923-214527-502a', 29, 'told', 'it fades out there, with the balloons'),
  cut('dream-0923-222108-96bd', 21, 'told', "that's where the dream ends for me"),
  cut('dream-0923-224406-bbba', 23, 'told', "that's where it ends, once the horse's head was formed"),
  cut('dream-0924-102852-e11a', 19, 'told', 'it ends with the roller coaster'),
  cut('dream-0923-214527-927a', 29, 'told', "that's where it ends for me"),
  cut('dream-0924-072007-9ddd', 29, 'told', 'the last thing they remember is the train going round a bend'),
  cut('dream-0924-012214-55eb', 17, 'told', 'it just stopped, walking through the glowing blur'),
  cut('dream-0923-214527-a446', 31, 'told', 'they think they just woke up'),
  cut('dream-0923-210937-e564', 25, 'told', "and that's where it ends for me"),
  cut('dream-0925-115615-bca7', 9, 'told', "the balloons: that's the end of it"),
  cut('dream-0923-222108-402f', 23, 'told', 'it just stopped'),
  {
    ...cut(NIGHT_BUS, 41, 'told', 'the boat, the river, and then they woke'),
    id: 'night-bus-woke',
    transcript: [...read(NIGHT_BUS).transcript.slice(0, 43), { role: 'user', content: ended } as Entry],
  },
  cut('dream-0923-214527-502a', 7, 'not_told', 'up the back stairs, then straight down another set'),
  cut(
    'dream-0923-214527-502a',
    17,
    'not_told',
    'next thing, outside waiting for the aunt; the drive and the balloons follow',
  ),
  cut('dream-0923-222108-96bd', 1, 'not_told', 'she walked off to the far end of the room; the ice head follows'),
  cut('dream-0923-222108-96bd', 5, 'not_told', 'then it started to melt; the horse head follows'),
  cut('dream-0923-224406-bbba', 7, 'not_told', 'then it started to melt; the horse head follows'),
  cut('dream-0923-214527-927a', 3, 'not_told', 'she excused herself and went to the far end; the ice follows'),
  cut('dream-0924-072007-9ddd', 9, 'not_told', 'suddenly on top of the streetcar, now a train; the ride follows'),
  cut('dream-0923-210937-e564', 1, 'not_told', 'she walks off and comes back with a block; the melting follows'),
  cut(
    'dream-0925-115615-bca7',
    3,
    'not_told',
    'then up the back stairs; the tiny room, the drive and the balloons follow',
  ),
  cut(
    'dream-0924-061919-78a9',
    21,
    'not_told',
    'she showed up and they went for a drive; the bridge and the balloons follow',
  ),
  cut('dream-0923-210937-20bd', 35, 'not_told', "the dream moved on to waiting outside; they then say there's more"),
  cut(NIGHT_BUS, 23, 'not_told', "it didn't end there: suddenly in the grandmother's kitchen"),
  cut(NIGHT_BUS, 33, 'not_told', 'still in the kitchen; the boat and the river follow'),
  cut(NIGHT_BUS, 41, 'not_told', 'the lantern is blue now; the boat and the river follow'),
];

writeFileSync(join(import.meta.dir, 'ending.json'), `${JSON.stringify(cases, null, 1)}\n`);
console.log(`evals/ending.json: ${cases.length} cases`);
