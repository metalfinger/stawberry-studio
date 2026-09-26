// Place proposals (from the implied cache) asked several ways, live Jev: which wording tells a lasting
// state of a place from a motion, a way of drawing, or what its look already says. implied.ts asks
// stays, motion3 (as "motion"), style (as "drawn") and inlook; the others are the wordings they beat.
// The review's rejects are asked beside what the writer proposes (REVIEW below).
//
//   [LIVE=1] [ONLY=fdd7,6e80] DREAMCHAT_RECORD=on bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/probes/place-question.ts
const W = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const { loadDream, liveDreams, readLive, dataDir, frozenDreams, sha256 } = await import(`${W}/evals/saved`);
const { completeViews, moments } = await import(`${W}/producer`);
const { recordInputsOf, storyRecord } = await import(`${W}/record`);
const { impliedAsk, parseImplied, impliedQuestions, IMPLIED_THINKING } = await import(`${W}/implied`);
const { HOST_MODEL } = await import(`${W}/llm`);
const { jevWithModel } = await import(`${W}/jev`);
const { readFileSync } = await import('node:fs');
const jev = jevWithModel('jev-1.13.0');
const cache = JSON.parse(readFileSync(`${W}/runs/implied-cache.json`, 'utf8'));
const writer = `${HOST_MODEL} thinking ${IMPLIED_THINKING}`;
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const live = !!process.env.LIVE;
const dreams = live ? liveDreams(dataDir()).map(readLive) : frozenDreams().map((id) => loadDream(id, false));
const nameOf = (b, id) => b.places.find((l) => l.id === id)?.name ?? id;
const variants = (b, x) => {
  const n = nameOf(b, x.who);
  const q = (instructions) => ({ type: 'noul', instructions });
  return {
    stays: q(`After this moment, does ${n} stay so (${x.what}: ${x.now}) until something in the dream changes it?`),
    stays2: q(
      `In the moments after this one, is ${n}'s ${x.what} still ${x.now}, unless something in the dream changes it?`,
    ),
    motion: q(
      `Is "${x.what}: ${x.now}" a movement or something happening for a moment only (leaning, moving, rushing, flickering), rather than how ${n} is?`,
    ),
    motion3: q(
      `Is "${x.what}: ${x.now}" something ${n} is doing at this moment (leaning, swaying, shaking, flickering), rather than a state it is in (open, dark, flooded, risen)?`,
    ),
    motion2: q(
      `Is "${x.what}: ${x.now}" a movement still going on (leaning, swaying, rushing, flickering, drifting), rather than a state ${n} is left in once it has happened (open, dark, flooded, risen)?`,
    ),
    contra: q(
      `Does anything the moments after this one say happen there need ${n}'s ${x.what} to be otherwise than ${x.now}?`,
    ),
    style: q(
      `Is "${x.what}: ${x.now}" about how the pictures are drawn or filmed (black and white, like an old film, a painting, a colour scheme), rather than about ${n} itself?`,
    ),
    inlook: q(`Does ${n}'s look, as given, already say that its ${x.what} is ${x.now}?`),
  };
};
// The review's rejects (26 Sep), asked beside what the writer proposes now, which no longer proposes
// some of them: each must fail its dream's place question.
const REVIEW = [
  { dream: 'e16f', moment: 'm4', who: 'l2', what: 'train', now: 'leaning into the bend' },
  { dream: 'e127', moment: 'm1', who: 'l1', what: 'kitchen', now: 'black and white like an old film with scratches' },
  { dream: 'd3a1', moment: 'm1', who: 'l1', what: 'grass', now: 'overgrown with towering grass blades' },
  {
    dream: 'fdd7',
    moment: 'm2',
    who: 'l1',
    what: 'water',
    now: 'over the desks and over the shelves, high enough to float books off the shelves',
  },
];
for (const d of dreams) {
  const s = d.session;
  if (!s?.draft?.breakdown || !s.style) continue;
  if (only.length && !only.some((o) => d.id.endsWith(o))) continue;
  const b = structuredClone(s.draft.breakdown);
  completeViews(b);
  const inp = recordInputsOf(s);
  const record = storyRecord(
    b,
    inp.items,
    { ...s.draft.readings, implied: undefined },
    { words: inp.words, style: s.style },
  ).record;
  await Promise.all(
    moments(b).map(async (m) => {
      const hit = cache[sha256(`writer ${writer}\n${JSON.stringify(impliedAsk(b, record, m))}`)];
      const extra = REVIEW.filter((r) => d.id.endsWith(r.dream) && r.moment === m.id).map(({ who, what, now }) => ({
        who,
        what,
        now,
      }));
      const places = [...(hit?.content ? parseImplied(hit.content, b, m) : []), ...extra].filter((x) =>
        b.places.some((l) => l.id === x.who),
      );
      if (!places.length) return;
      const { state } = impliedQuestions(b, record, m, places);
      const questions = {};
      places.forEach((x, i) => {
        for (const [k, q] of Object.entries(variants(b, x))) questions[`${k}_${i}`] = q;
      });
      const call = await jev(state, questions);
      if (call.error) console.log('ERR', call.error.slice(0, 300));
      places.forEach((x, i) => {
        const v = Object.keys(variants(b, x))
          .map((k) => `${k} ${(call.answers?.[`${k}_${i}`]?.noul ?? -1).toFixed(2)}`)
          .join(' ');
        console.log(`${d.id.slice(-4)} ${m.id} ${v} | ${x.who}.${x.what} = ${x.now.slice(0, 70)}`);
      });
    }),
  );
}
