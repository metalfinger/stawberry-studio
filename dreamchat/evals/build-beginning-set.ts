// Builds the labelled set for the "how it began" goal from saved dreams: each case is a
// conversation cut after one of the dreamer's messages, with whether the dream's start has been
// told by then. Written to evals/beginning.json, so a run needs no saved conversation.
//
//   bun run evals/build-beginning-set.ts
//
// People start with the part that stuck ("I keep thinking about the dog running up those stairs"),
// and the lighthouse's beach, key and door were never told or drawn (25 Sep). Told: their first
// message is where the dream starts, or they say what came before. Not told: they began partway, or
// with "the part that stuck with me", which says nothing of where it starts, even where that part is
// in fact the start: from the conversation a listener cannot know, and asking costs one question.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from '../session';

type Entry = Session['transcript'][number];
type Case = { id: string; expect: 'told' | 'not_told'; why: string; transcript: Entry[] };

const read = (id: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'state', `${id}.json`), 'utf8')) as Session;

function cut(id: string, at: number, expect: Case['expect'], why: string): Case {
  const t = read(id).transcript;
  if (t[at]?.role !== 'user') throw new Error(`${id}: message ${at} is not theirs`);
  return { id: `${id.slice(-4)}@${at}`, expect, why, transcript: t.slice(0, at + 1) };
}

const cases: Case[] = [
  cut('dream-0923-183614-279d', 1, 'told', 'in a flooded library at night, in a rowing boat'),
  cut(
    'dream-0923-210937-20bd',
    1,
    'not_told',
    '"the part that keeps coming back is the house": where it starts is not said',
  ),
  cut(
    'dream-0923-210937-e564',
    1,
    'not_told',
    '"the part that stuck with me was standing by the autoclave": where it starts is not said',
  ),
  cut('dream-0923-214527-927a', 1, 'told', 'the young woman standing by the autoclave, talking'),
  cut('dream-0923-214527-a446', 1, 'told', "at their parents' house after a long trip, waiting"),
  cut('dream-0923-222108-402f', 1, 'told', "they get to their parents' house after a long trip"),
  cut('dream-0923-222108-5063', 1, 'told', "it started at the Meads's house"),
  cut('dream-0924-012214-55eb', 1, 'told', "got to their parents' house after a long journey"),
  cut('dream-0924-062358-e16f', 1, 'told', 'it started on a streetcar'),
  cut('dream-0924-062626-0199', 1, 'told', 'on a streetcar, watching the conductor'),
  cut(
    'dream-0924-071504-fa9a',
    1,
    'not_told',
    '"the part that stuck with me was being on the streetcar": where it starts is not said',
  ),
  cut('dream-0924-102852-e11a', 1, 'told', 'at the movies with a friend'),
  cut('dream-0925-115615-bca7', 1, 'told', "it was at the Meads's house"),
  cut('dream-0925-175446-6d6a', 1, 'told', 'on a night bus with their brother'),
  cut('dream-0925-212124-cbba', 1, 'told', 'walking on a grey beach with the dog, holding the key'),
  cut('dream-0924-072007-9ddd', 9, 'told', 'before that they were inside a streetcar'),
  cut('dream-0924-010356-3024', 1, 'not_told', "the window; the parents' house and the long trip before it not told"),
  cut('dream-0924-010356-3024', 7, 'not_told', 'still only the glass world'),
  cut('dream-0924-010356-3024', 13, 'not_told', 'still only the glass world'),
  cut('dream-0924-072007-9ddd', 1, 'not_told', 'on top of the train; the streetcar before it not told'),
  cut('dream-0924-072007-9ddd', 5, 'not_told', 'still only on the train'),
  cut('dream-0924-072007-9ddd', 7, 'not_told', 'still only on the train'),
  cut('dream-0925-231131-affd', 1, 'not_told', 'the dog on the stairs; the beach, the key and the door not told'),
  cut('dream-0925-231131-affd', 7, 'not_told', 'up the stairs to the room at the top; still no beach'),
  cut('dream-0925-231131-affd', 13, 'not_told', 'the sea turned to a field; still no beach'),
];
writeFileSync(join(import.meta.dir, 'beginning.json'), `${JSON.stringify(cases, null, 1)}\n`);
console.log(`evals/beginning.json: ${cases.length} cases`);
