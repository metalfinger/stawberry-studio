// Builds the labelled set for "does the dream go on past the retelling?" from saved dreams: every
// answer to a retelling (or to a correction, or to "is that right?") in the saved conversations,
// cut after that answer, with whether it says the dream went on past where the telling back stopped.
// Written to evals/goes-on.json, so a run needs no saved conversation.
//
//   bun run evals/build-goes-on-set.ts
//
// Goes on: "that's right so far, but there's more", and what happened next told in answer to
// "there's more after that?". Not: a confirmation, a correction, or a detail added to a part already
// told back ("the only thing I'd add is the train was on a country road").
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from '../session';

type Entry = Session['transcript'][number];
type Case = { id: string; expect: boolean; why: string; transcript: Entry[] };

const STATE = join(import.meta.dir, '..', 'state');
const GOES_ON: Record<string, string> = {
  '6d6a@39': 'after the kitchen there was more',
  '6d6a@41': 'the lantern glowing blue, told as what came after the kitchen',
  '20bd@37': "that's right so far, but there's more",
  '20bd@39': 'the aunt picking them up: what happened next',
  '20bd@43': 'the drive over the bridge and back: what happened next',
};

// The saved dreams it was labelled from (25 Sep), by the end of their id: a dream saved since is
// not labelled.
const FROM = new Set(
  '6a4d 4cf3 fa9a 3024 e564 279d ded5 502a 6d6a bca7 402f 96bd e16f 5063 20bd 0199 55eb bbba e11a 927a 9ddd 5454 a446'.split(
    ' ',
  ),
);
const cases: Case[] = [];
for (const f of readdirSync(STATE).filter((f) => /^dream-.*\.json$/.test(f) && FROM.has(f.slice(-9, -5)))) {
  const s = JSON.parse(readFileSync(join(STATE, f), 'utf8')) as Session;
  for (const t of s.turns ?? []) {
    if (!['retell', 'take_correction', 'retell_check'].includes(t.move.kind)) continue;
    const at = 2 * t.turn + 1;
    if (s.transcript[at]?.role !== 'user') continue;
    const id = `${f.slice(-9, -5)}@${at}`;
    cases.push({
      id,
      expect: id in GOES_ON,
      why: GOES_ON[id] ?? `answer to ${t.move.kind}: confirms, corrects or adds a detail`,
      transcript: s.transcript.slice(0, at + 1),
    });
  }
}
// Two made up from the night bus: the rest told in the same breath as a confirmation, and the
// waking added, which ends the dream rather than going on with it.
const bus = cases.find((c) => c.id === '6d6a@35');
if (!bus) throw new Error('the night bus retelling is missing');
const reply = (content: string) => [...bus.transcript.slice(0, -1), { role: 'user', content } as Entry];
cases.push(
  {
    id: 'bus-and-then',
    expect: true,
    why: 'confirmed, and the table becoming a boat told as what came next',
    transcript: reply("yes that's right. and then the kitchen table turned into a little wooden boat and i got in."),
  },
  {
    id: 'bus-woke',
    expect: false,
    why: 'the waking added: the dream ends there, nothing goes on',
    transcript: reply("that's right. and right after the kitchen i woke up, that was the end."),
  },
);
writeFileSync(join(import.meta.dir, 'goes-on.json'), `${JSON.stringify(cases, null, 1)}\n`);
console.log(`evals/goes-on.json: ${cases.length} cases, ${cases.filter((c) => c.expect).length} going on`);
