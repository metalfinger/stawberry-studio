// Whether a place's sketch is told by what people do there (the one builder's `place_built` step): every saved dream's
// place sketches, their prompts made with the step before it and with it, and in each the place's own words (its name,
// what kind of place, what is in it; never the style, whose "the meeting of tones" is not a meeting) counted for words
// that say a use or the people who come: a place named for a meeting, a party, a class, waiting or a market fills its
// sketch with them, alone and empty all the same (the merged flow's Grandmother on Wednesdays: "the family meeting",
// 4 of 4 takes full of people, 2 Oct). Also how many sketches say who is absent ("no people": a negated noun draws them),
// and every place the reading told by its build, before and after, to be read.
//
//   bun run evals/place-words.ts [--live] [--list]
import './local-env';
import { BUILDER_STEPS } from '../cleanups';
import type { Session } from '../session';
import { sheetPrompt, subjectWords } from '../sheets';
import { withCast } from './cast-cache';
import { dataDir, frozenDreams, liveDreams, loadDream } from './saved';

const live = process.argv.includes('--live');
const list = process.argv.includes('--list');

/** Words that say what people do in a place, or who comes there. */
export const USE =
  /\b(?:meetings?|part(?:y|ies)|class(?:es|room|rooms)?|lessons?|lectures?|exams?|examination|waiting|reception|ceremon(?:y|ies)|weddings?|funerals?|concerts?|gatherings?|gathers?|assembl(?:y|ies)|dinners?|banquets?|feasts?|dances?|dancing|ballroom|celebrations?|conferences?|rehearsals?|markets?|fairs?|festivals?|performances?|audiences?|congregations?|sermons?|worship|people|crowds?|guests?|visitors?|customers?|passengers?|students?|pupils?|children|kids|family|families|relatives?|friends?)\b/gi;
/** Who is absent, said. */
const ABSENT = /\b(?:no|without|nobody|no one)\b[^.;,\n]{0,20}\b(?:people|persons?|one|anyone|figures?)\b|\bnobody\b/gi;

const before = BUILDER_STEPS[BUILDER_STEPS.indexOf('place_built') - 1];
const ids: { id: string; live: boolean }[] = frozenDreams().map((id) => ({ id, live: false }));
if (live)
  for (const d of liveDreams(dataDir()))
    if (!d.id.includes('/') && !ids.some((x) => x.id === d.id)) ids.push({ id: d.id, live: true });

/** The place's own words in its sketch's prompt: everything before the style. */
const ownWords = (prompt: string) => prompt.split(/\n\nStyle:/)[0];

const prompts = async (s: Session, step: string) => {
  const was = process.env.DREAMCHAT_ONE_BUILDER;
  process.env.DREAMCHAT_ONE_BUILDER = step;
  try {
    const got = (await withCast(s)).session;
    const items = got.build?.items ?? [];
    return new Map(
      items
        .filter((it) => it.kind === 'location')
        .map((it) => [
          it.id,
          { prompt: sheetPrompt(it, got.style!, { others: subjectWords(items, it) }), built: it.built, name: it.name },
        ]),
    );
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_ONE_BUILDER;
    else process.env.DREAMCHAT_ONE_BUILDER = was;
  }
};

let places = 0;
const n = { useBefore: 0, useAfter: 0, wordsBefore: 0, wordsAfter: 0, absentBefore: 0, absentAfter: 0, told: 0 };
const out: string[] = [];
const seen = new Set<string>();
for (const { id, live: isLive } of ids) {
  let s: Session;
  try {
    s = loadDream(id, isLive).session as Session;
  } catch {
    continue;
  }
  if (!s.style || !s.build?.items?.some((it) => it.kind === 'location')) continue;
  const a = await prompts(s, before);
  const b = await prompts(s, 'on');
  for (const [pid, x] of a) {
    const y = b.get(pid)!;
    // The same place in two copies of one dream, counted once.
    const key = `${x.name}|${ownWords(x.prompt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places++;
    const wa = ownWords(x.prompt).match(USE) ?? [];
    const wb = ownWords(y.prompt).match(USE) ?? [];
    n.wordsBefore += wa.length;
    n.wordsAfter += wb.length;
    if (wa.length) n.useBefore++;
    if (wb.length) n.useAfter++;
    if (ABSENT.test(x.prompt)) n.absentBefore++;
    ABSENT.lastIndex = 0;
    if (ABSENT.test(y.prompt)) n.absentAfter++;
    ABSENT.lastIndex = 0;
    if (y.built) n.told++;
    if (y.built || wa.length)
      out.push(
        `${id.slice(-4)} ${pid} "${x.name}" [${wa.join(',')}] → ${y.built ? `"${y.built.name}" | ${y.built.kind} | ${y.built.in}` : 'as it was'} [${wb.join(',')}]`,
      );
  }
}
console.log(JSON.stringify({ dreams: ids.length, places, before, ...n }));
if (list) for (const l of out) console.log(`  ${l}`);
