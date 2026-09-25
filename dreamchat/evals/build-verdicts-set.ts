// Builds the labelled set for "which of the pictures on show do they say is wrong?" from saved
// dreams: every answer to sketches or moments on show, with the pictures shown then (by id and
// name, as the conversation asked about them) and which of them the answer says is wrong or should
// change. A picture read as wrong is drawn again and paid for; one missed stays wrong.
// Written to evals/verdicts.json, so a run needs no saved conversation.
//
//   bun run evals/build-verdicts-set.ts
//
// Labelled by reading each answer (25 Sep). Left out as too unclear to label: a request for a
// different picture ("draw the melt in progress"), a complaint about something not on show that
// could be about the one on show ("the sky feels a little too empty", shown only the dreamer),
// "the young woman isn't in it" with no picture named, and "the family looks a little off … maybe
// just go with it".
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Case = { id: string; message: string; shown: { id: string; name: string }[]; wrong: string[] };

const STATE = join(import.meta.dir, '..', 'state');
// By conversation (the end of its id) and turn: the pictures the answer says are wrong. Every
// other answer shown here says none is.
const WRONG: Record<string, string[]> = {
  '502a/24': ['t2'],
  '502a/30': ['m4'],
  '927a/31': ['m1'],
  'a446/24': ['p1'],
  'a446/31': ['m2'],
  '402f/22': ['p1'],
  '402f/24': ['p1'],
  '3024/25': ['l1'],
  '3024/27': ['p1'],
  '0199/23': ['p2'],
  '9ddd/36': ['m2'],
  '9ddd/46': ['m3'],
  '9ddd/48': ['m5'],
  '9ddd/50': ['m5'],
  '9ddd/51': ['m6'],
  'e11a/21': ['m3'],
  'e11a/22': ['m3'],
  'e11a/23': ['m3'],
  'e11a/24': ['m3'],
  'e11a/25': ['m3'],
  'e11a/26': ['m3'],
  'e11a/27': ['m3'],
  '5454/15': ['m2'],
  '5454/19': ['m5'],
  'bca7/16': ['l1'],
};
const UNCLEAR = new Set(['e564/27', 'a446/26', '5063/25', '5063/27', '9ddd/28']);
// The conversations it was labelled from: one saved since is not labelled.
const FROM = new Set(
  '279d 20bd e564 502a 927a a446 402f 5063 96bd bbba 6a4d ded5 3024 55eb 0199 9ddd e11a 5454 bca7 6d6a 1177'.split(' '),
);

const cases: Case[] = [];
for (const dir of readdirSync(STATE).sort()) {
  if (!FROM.has(dir.slice(-4)) || !statSync(join(STATE, dir)).isDirectory()) continue;
  for (const f of readdirSync(join(STATE, dir)).filter((f) => /^turn-\d+\.json$/.test(f))) {
    const id = `${dir.slice(-4)}/${f.slice(5, -5)}`;
    if (UNCLEAR.has(id)) continue;
    const t = JSON.parse(readFileSync(join(STATE, dir, f), 'utf8')) as {
      jevQuestions?: Record<string, { instructions: string }>;
    };
    const q = t.jevQuestions ?? {};
    const ids = Object.keys(q)
      .filter((k) => k.startsWith('bad_'))
      .map((k) => k.slice(4));
    if (!ids.length) continue;
    const message = q.sketch_reaction?.instructions.match(/this message: "([\s\S]*)"\?$/)?.[1] ?? '';
    const shown = ids.map((x) => ({
      id: x,
      name: q[`bad_${x}`].instructions.match(/the picture of ([\s\S]*?) is wrong or should change/)?.[1] ?? x,
    }));
    cases.push({ id, message, shown, wrong: WRONG[id] ?? [] });
  }
}
const labelled = cases.filter((c) => c.id in WRONG).length;
if (labelled !== Object.keys(WRONG).length) throw new Error(`labelled ${Object.keys(WRONG).length}, found ${labelled}`);
cases.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
writeFileSync(join(import.meta.dir, 'verdicts.json'), `${JSON.stringify(cases, null, 1)}\n`);
console.log(
  `evals/verdicts.json: ${cases.length} answers, ${cases.reduce((n, c) => n + c.shown.length, 0)} pictures, ${cases.reduce((n, c) => n + c.wrong.length, 0)} said wrong`,
);
