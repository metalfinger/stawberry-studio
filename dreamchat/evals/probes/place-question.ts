// Place proposals (from the implied cache) asked several ways, live Jev: which wording tells a lasting
// state of a place from a motion, a way of drawing, or what its look already says.
const W = '/Users/hirenk/Documents/code/stawberry-studio/.claude/worktrees/agent-a9a0442015bcf5acf/dreamchat';
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
  const fact = `${n}'s ${x.what} is now ${x.now}`;
  return {
    joined: {
      type: 'noul',
      instructions: `Is "${fact}" how ${n} is from this moment on, as the moments after it go on: not a motion or something in passing, not how the pictures are drawn, and not what its look already says?`,
    },
    stays: {
      type: 'noul',
      instructions: `After this moment, does ${n} stay so (${x.what}: ${x.now}) until something in the dream changes it?`,
    },
    motion: {
      type: 'noul',
      instructions: `Is "${x.what}: ${x.now}" a movement or something happening for a moment only (leaning, moving, rushing, flickering), rather than how ${n} is?`,
    },
    style: {
      type: 'noul',
      instructions: `Is "${x.what}: ${x.now}" about how the pictures are drawn or filmed (black and white, like an old film, a painting, a colour scheme), rather than about ${n} itself?`,
    },
    inlook: {
      type: 'noul',
      instructions: `Does ${n}'s look, as given, already say that its ${x.what} is ${x.now}?`,
    },
    changed: {
      type: 'noul',
      instructions: `Has ${n} changed by this moment from how it was before, so that its ${x.what} is now ${x.now}?`,
    },
  };
};
for (const d of dreams) {
  const s = d.session;
  if (!s?.draft?.breakdown || !s.style) continue;
  if (only.length && !only.some((o) => d.id.endsWith(o))) continue;
  const b = structuredClone(s.draft.breakdown);
  completeViews(b);
  const inp = recordInputsOf(s);
  const record = storyRecord(b, inp.items, { ...s.draft.readings, implied: undefined }, { words: inp.words, style: s.style }).record;
  await Promise.all(
    moments(b).map(async (m) => {
      const hit = cache[sha256(`writer ${writer}\n${JSON.stringify(impliedAsk(b, record, m))}`)];
      if (!hit?.content) return;
      const places = parseImplied(hit.content, b, m).filter((x) => b.places.some((l) => l.id === x.who));
      if (!places.length) return;
      const { state } = impliedQuestions(b, record, m, places);
      const questions = {};
      places.forEach((x, i) => {
        for (const [k, q] of Object.entries(variants(b, x))) questions[`${k}_${i}`] = q;
      });
      const call = await jev(state, questions);
      if (call.error) console.log("ERR", call.error.slice(0, 300));
      places.forEach((x, i) => {
        const v = ['joined', 'stays', 'motion', 'style', 'inlook', 'changed']
          .map((k) => `${k} ${(call.answers?.[`${k}_${i}`]?.noul ?? -1).toFixed(2)}`)
          .join(' ');
        console.log(`${d.id.slice(-4)} ${m.id} ${v} | ${x.who}.${x.what} = ${x.now.slice(0, 70)}`);
      });
    }),
  );
}
