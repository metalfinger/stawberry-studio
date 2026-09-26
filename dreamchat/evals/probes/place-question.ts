// A place's proposed states (from the implied cache, runs/implied-cache.json) asked several ways with
// live Jev: which wording tells how a place looks now from a motion, a way of drawing, what its look
// already says, or what no picture shows. implied.ts asks `motion`, `drawn`, `inlook` and `feel`; the
// others are wordings measured beside them and dropped (`stays`, `look`, `look2`, `feel2`,
// `restates`). Asked with them: the review's rejects (REVIEW) and the true water levels a question must
// not reject (MUST_PASS), from what the writer proposed on 26-27 Sep.
//
//   [LIVE=1] [ONLY=fdd7,6e80] DREAMCHAT_RECORD=on bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/probes/place-question.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMPLIED_THINKING, impliedAsk, impliedQuestions, parseImplied } from '../../implied';
import { type Question, jevWithModel } from '../../jev';
import { HOST_MODEL } from '../../llm';
import { type Breakdown, completeViews, moments } from '../../producer';
import { recordInputsOf, storyRecord } from '../../record';
import type { Session } from '../../session';
import { DIR, dataDir, frozenDreams, liveDreams, loadDream, readLive, sha256 } from '../saved';

type Proposal = { who: string; what: string; now: string };

/** The review's rejects: each must fail its dream's place questions. */
const REVIEW: (Proposal & { dream: string; moment: string })[] = [
  { dream: 'e16f', moment: 'm4', who: 'l2', what: 'train', now: 'leaning into the bend' },
  { dream: 'e127', moment: 'm1', who: 'l1', what: 'kitchen', now: 'black and white like an old film with scratches' },
  { dream: 'd3a1', moment: 'm1', who: 'l1', what: 'grass', now: 'overgrown with towering grass blades' },
  { dream: 'd3a1', moment: 'm6', who: 'l2', what: 'tiles', now: 'warm' },
  { dream: 'aeea', moment: 'm4', who: 'l2', what: 'door', now: 'unlocked' },
  { dream: '09ea', moment: 'm1', who: 'l1', what: 'crowd', now: 'crowded' },
];
/** True states a question must not reject: the water as it rises, and windows and doors opened. */
const MUST_PASS: (Proposal & { dream: string; moment: string })[] = [
  { dream: '279d', moment: 'm4', who: 'l1', what: 'water', now: 'up to the round window' },
  { dream: 'de6c', moment: 'm2', who: 'l1', what: 'water', now: 'a thin layer on the floor' },
  { dream: 'de6c', moment: 'm3', who: 'l1', what: 'water', now: 'up to the desk legs, covering the floor' },
  {
    dream: 'de6c',
    moment: 'm6',
    who: 'l1',
    what: 'water',
    now: 'deep enough to float the rowing boat, covering the shelves',
  },
  {
    dream: 'de6c',
    moment: 'm7',
    who: 'l1',
    what: 'water',
    now: 'deep enough for the boat to float and a whale to swim under it',
  },
  { dream: '6081', moment: 'm2', who: 'l1', what: 'water', now: 'on the floor just inside the doors, shallow' },
];

const q = (instructions: string): Question => ({ type: 'noul', instructions });
const variants = (n: string, x: Proposal): Record<string, Question> => ({
  stays: q(`After this moment, does ${n} stay so (${x.what}: ${x.now}) until something in the dream changes it?`),
  motion: q(
    `Is "${x.what}: ${x.now}" something ${n} is doing at this moment (leaning, swaying, shaking, flickering), rather than a state it is in (open, dark, flooded, risen)?`,
  ),
  drawn: q(
    `Is "${x.what}: ${x.now}" about how the pictures are drawn or filmed (black and white, like an old film, a painting, a colour scheme), rather than about ${n} itself?`,
  ),
  inlook: q(`Does ${n}'s look, as given, already say that its ${x.what} is ${x.now}?`),
  look: q(
    `Is "${n}'s ${x.what} is now ${x.now}" how it looks in the picture (water at a height, a door or window open, a room dark or lit), rather than how it feels (warm, cold, quiet) or something no picture can show (locked, unlocked, smelling of something)?`,
  ),
  look2: q(
    `Could a picture show that ${n}'s ${x.what} is ${x.now}, by how it looks, rather than by how it feels or what someone knows about it?`,
  ),
  feel: q(
    `Is "${x.what}: ${x.now}" about how ${n} feels to the touch or what someone knows about it (warm, cold, locked, unlocked), rather than anything a picture shows?`,
  ),
  feel2: q(
    `Is "${x.what}: ${x.now}" something one could only feel, hear or know, never see (warm, cold, quiet, locked, unlocked)?`,
  ),
  restates: q(`Does "${x.what}: ${x.now}" only say again what "${x.what}" already means, adding nothing?`),
});

const W = DIR;
const jev = jevWithModel('jev-1.13.0');
const cache = JSON.parse(readFileSync(join(W, 'runs', 'implied-cache.json'), 'utf8')) as Record<
  string,
  { content?: string }
>;
const writer = `${HOST_MODEL} thinking ${IMPLIED_THINKING}`;
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const dreams: { id: string; session: Session }[] = process.env.LIVE
  ? liveDreams(dataDir()).map(readLive)
  : frozenDreams().map((id) => loadDream(id, false));
const nameOf = (b: Breakdown, id: string) => b.places.find((l) => l.id === id)?.name ?? id;

for (const d of dreams) {
  const s = d.session;
  const b0 = s.draft?.breakdown;
  if (!b0 || !s.style) continue;
  if (only.length && !only.some((o) => d.id.endsWith(o))) continue;
  const b = structuredClone(b0);
  completeViews(b);
  const inp = recordInputsOf(s);
  const record = storyRecord(
    b,
    inp.items,
    { ...s.draft?.readings, implied: undefined },
    { words: inp.words, style: s.style },
  ).record;
  await Promise.all(
    moments(b).map(async (m) => {
      const hit = cache[sha256(`writer ${writer}\n${JSON.stringify(impliedAsk(b, record, m))}`)];
      const extra = [...REVIEW, ...MUST_PASS]
        .filter((r) => d.id.endsWith(r.dream) && r.moment === m.id)
        .map(({ who, what, now }) => ({ who, what, now }));
      const seen = new Set<string>();
      const places = [...(hit?.content ? parseImplied(hit.content, b, m) : []), ...extra].filter((x) => {
        const k = `${x.who}:${x.what}:${x.now}`;
        if (seen.has(k) || !b.places.some((l) => l.id === x.who)) return false;
        seen.add(k);
        return true;
      });
      if (!places.length) return;
      const { state } = impliedQuestions(b, record, m, places);
      const questions: Record<string, Question> = {};
      places.forEach((x, i) => {
        for (const [k, v] of Object.entries(variants(nameOf(b, x.who), x))) questions[`${k}_${i}`] = v;
      });
      const call = await jev(state, questions);
      if (call.error) console.log('ERR', call.error.slice(0, 300));
      places.forEach((x, i) => {
        const tag = REVIEW.some((r) => r.now === x.now)
          ? 'REJECT'
          : MUST_PASS.some((r) => r.now === x.now)
            ? 'PASS  '
            : '      ';
        const v = Object.keys(variants('', x))
          .map((k) => {
            const a = call.answers?.[`${k}_${i}`];
            return `${k} ${(a?.type === 'noul' ? a.noul : -1).toFixed(2)}`;
          })
          .join(' ');
        console.log(`${tag} ${d.id.slice(-4)} ${m.id} ${v} | ${x.who}.${x.what} = ${x.now.slice(0, 70)}`);
      });
    }),
  );
}

export {};
