// Runs a labelled set against the live Jev and says how often it is right: the questions exactly as
// the harness asks them, each case's answers against what they should be, and for each fact where
// its bar could sit. Bars are set from these runs, never by feel.
//
//   bun run evals/run.ts storyboard [--times 2]
//   bun run evals/run.ts plan-facts [--times 2]
//
// --times asks every case more than once: how much the same question's answer moves between asks.
import { loadedKeys } from '../boot';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Blocking, Spot } from '../blocking';
import { dreamConfig } from '../dream';
import { bookkeeperQuestions, callJev, type Exchange, renderTranscript, verdictQuestions } from '../jev';
import { FINISHED_BAR, GOES_ON_BAR } from '../lib';
import { changeQuestions, crowdQuestions, KIND_BARS } from '../ground';
import { PLAN_BARS, planQuestions } from '../planfacts';
import { blockScenes, type Breakdown, type Moment, type StyleOption } from '../producer';
import { planShots } from '../session';
import { askFacts, CLOSE, decide, STORYBOARD } from '../stages';

void loadedKeys;
const which = process.argv[2];
const at = process.argv.indexOf('--times');
const times = at > 0 ? Math.max(1, Number(process.argv[at + 1]) || 1) : 1;
// --close 0 decides on one answer each, as the harness did before it asked again on close calls.
const ci = process.argv.indexOf('--close');
const within = ci > 0 ? Number(process.argv[ci + 1]) : CLOSE;
const load = <T>(name: string) => JSON.parse(readFileSync(join(import.meta.dir, `${name}.json`), 'utf8')) as T;
const pct = (a: number, b: number) => `${a}/${b} (${b ? Math.round((100 * a) / b) : 0}%)`;

if (which === 'storyboard') {
  type Case = { id: string; moment: string; expect: 'clear' | 'hold'; why: string; state: string };
  const cases = load<Case[]>('storyboard');
  const rows = (
    await Promise.all(
      cases.flatMap((c) =>
        Array.from({ length: times }, async () => {
          // As the harness decides: asked once more, and averaged, where an answer is close to its bar.
          const answers = await askFacts(STORYBOARD, c.moment, c.state, callJev, within);
          return { c, call: { error: answers ? null : 'no answer' }, d: decide(STORYBOARD, c.moment, answers) };
        }),
      ),
    )
  ).filter((r) => !r.call.error);
  for (const { c, d } of rows) {
    const got = d.ok ? 'clear' : 'hold';
    const facts = d.readings
      .map((r) => `${r.question.replace('sb_', '')} ${r.answer.toFixed(2)}${r.ok ? '' : '!'}`)
      .join(' ');
    console.log(`${got === c.expect ? ' ok ' : 'MISS'} ${c.id.padEnd(18)} expect ${c.expect}, got ${got}  ${facts}`);
    if (got !== c.expect) console.log(`       ${c.why}`);
  }
  const right = rows.filter((r) => (r.d.ok ? 'clear' : 'hold') === r.c.expect).length;
  const falseHolds = rows.filter((r) => r.c.expect === 'clear' && !r.d.ok).length;
  const falseClears = rows.filter((r) => r.c.expect === 'hold' && r.d.ok).length;
  console.log(
    `\nright ${pct(right, rows.length)}; held what should clear: ${falseHolds}; cleared what should hold: ${falseClears}`,
  );
  // Where each fact's bar could sit: every shot that should clear passes it, as many that should hold fail it.
  for (const f of STORYBOARD.facts) {
    const of = (e: Case['expect']) =>
      rows.filter((r) => r.c.expect === e).map((r) => r.d.readings.find((x) => x.question === f.id)!.answer);
    const clear = of('clear');
    const hold = of('hold');
    const edge = f.pass === 'yes' ? Math.min(...clear) : Math.max(...clear);
    const caught = hold.filter((a) => (f.pass === 'yes' ? a < edge : a > edge)).length;
    console.log(
      `${f.id.padEnd(15)} bar ${f.bar}  (${f.pass === 'yes' ? 'needs ≥' : 'needs <'})  shots to clear: ${f.pass === 'yes' ? 'lowest' : 'highest'} ${edge.toFixed(2)}; at that edge it alone catches ${pct(caught, hold.length)} of shots to hold`,
    );
  }
  // The four bars together: every combination on a grid, the one that errs least, clearing nothing
  // that should hold first. Few cases: a guide to where the bars sit, not the bars themselves.
  const grid = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
  let best: { bars: number[]; falseClears: number; falseHolds: number; moved: number } | undefined;
  for (const a of grid)
    for (const b2 of grid)
      for (const c2 of grid)
        for (const d2 of grid) {
          const bars = [a, b2, c2, d2];
          let falseClears = 0;
          let falseHolds = 0;
          for (const r of rows) {
            const ok = STORYBOARD.facts.every((f, i) => {
              const x = r.d.readings.find((y) => y.question === f.id)!.answer;
              return f.pass === 'yes' ? x >= bars[i] : x < bars[i];
            });
            if (ok && r.c.expect === 'hold') falseClears++;
            if (!ok && r.c.expect === 'clear') falseHolds++;
          }
          // Among bars that err as little, the least moved from those in use.
          const moved = bars.reduce((sum, v, i) => sum + Math.abs(v - STORYBOARD.facts[i].bar), 0);
          const better = (x: typeof best) =>
            !x ||
            falseClears < x.falseClears ||
            (falseClears === x.falseClears &&
              (falseHolds < x.falseHolds || (falseHolds === x.falseHolds && moved < x.moved)));
          if (better(best)) best = { bars, falseClears, falseHolds, moved };
        }
  if (best)
    console.log(
      `best bars on this set: ${STORYBOARD.facts.map((f, i) => `${f.id.replace('sb_', '')} ${f.pass === 'yes' ? '≥' : '<'} ${best!.bars[i]}`).join(', ')}: cleared what should hold ${best.falseClears}, held what should clear ${best.falseHolds}`,
    );
  if (times > 1) {
    const flips = cases.filter((c) => new Set(rows.filter((r) => r.c.id === c.id).map((r) => r.d.ok)).size > 1);
    console.log(
      `decided differently between asks: ${flips.length} of ${cases.length} shots${flips.length ? ` (${flips.map((c) => c.id).join(', ')})` : ''}`,
    );
    const spread = cases.map((c) => {
      const same = rows.filter((r) => r.c.id === c.id);
      return Math.max(
        ...STORYBOARD.facts.map((f) => {
          const xs = same.map((r) => r.d.readings.find((x) => x.question === f.id)!.answer);
          return Math.max(...xs) - Math.min(...xs);
        }),
      );
    });
    console.log(
      `the same question asked again moves by up to ${Math.max(...spread).toFixed(2)} (median ${spread.sort()[Math.floor(spread.length / 2)].toFixed(2)})`,
    );
  }
} else if (which === 'plan-facts') {
  type Case = {
    id: string;
    place: { name: string; geography?: string; landmarks?: string };
    front: string;
    people: { id: string; name: string }[];
    things: { id: string; name: string; fixture?: boolean }[];
    moments: { id: string; action: string; looks_at: string }[];
    expect: {
      outdoors: boolean;
      shape?: Record<string, string[]>;
      holder?: Record<string, string[]>;
      looks?: Record<string, string[]>;
    };
  };
  const cases = load<Case[]>('plan-facts');
  const tally: Record<string, { right: number; all: number; sureRight: number; sure: number }> = {};
  const count = (family: string, right: boolean, sure: boolean) => {
    const t = (tally[family] ??= { right: 0, all: 0, sureRight: 0, sure: 0 });
    t.all++;
    if (right) t.right++;
    if (sure) {
      t.sure++;
      if (right) t.sureRight++;
    }
  };
  const bars: Record<string, number> = { shape: PLAN_BARS.shape, holder: PLAN_BARS.holder, looks: PLAN_BARS.looks };
  for (let k = 0; k < times; k++)
    await Promise.all(
      cases.map(async (c) => {
        const b = {
          people: c.people.map((p) => ({ ...p, is_dreamer: p.name === 'the dreamer' })),
          things: c.things.filter((t) => !t.fixture).map((t) => ({ id: t.id, name: t.name })),
          places: [
            {
              id: 'l1',
              name: c.place.name,
              fields: {
                geography: { value: c.place.geography ?? null },
                landmarks: { value: c.place.landmarks ?? null },
              },
            },
          ],
        } as unknown as Breakdown;
        const spots: Spot[] = [
          ...c.people.map((p): Spot => ({ id: p.id, x: 0, y: 0, kind: 'person' })),
          ...c.things.map((t): Spot => ({
            id: t.id,
            x: 0,
            y: 0,
            kind: 'thing',
            ...(t.fixture ? { fixture: true, name: t.name } : {}),
          })),
        ];
        const plan: Blocking = { front: c.front, spots };
        const { state, questions } = planQuestions(b, plan, 'l1', c.moments as unknown as Moment[]);
        const call = await callJev(state, questions);
        if (!call.answers) return console.log(`${c.id}: no answer (${call.error})`);
        const a = call.answers;
        const o = a.outdoors?.type === 'noul' ? a.outdoors.noul : Number.NaN;
        const outRight = o >= PLAN_BARS.outdoors === c.expect.outdoors;
        count('outdoors', outRight, true);
        if (!outRight) console.log(`MISS ${c.id} outdoors: ${o.toFixed(2)}, should be ${c.expect.outdoors}`);
        for (const [family, expected] of [
          ['shape', c.expect.shape],
          ['holder', c.expect.holder],
          ['looks', c.expect.looks],
        ] as const)
          for (const [id, ok] of Object.entries(expected ?? {})) {
            const x = a[`${family}_${id}`];
            if (!x || x.type !== 'choice') continue;
            const right = ok.includes(x.choice);
            count(family, right, x.confidence >= bars[family]);
            if (!right)
              console.log(
                `MISS ${c.id} ${family} ${id}: ${x.choice} (${x.confidence.toFixed(2)}), should be ${ok.join(' or ')}`,
              );
          }
      }),
    );
  console.log('');
  for (const [family, t] of Object.entries(tally))
    console.log(
      `${family.padEnd(9)} right ${pct(t.right, t.all)}${family === 'outdoors' ? '' : `; sure enough to use (≥ ${bars[family]}): ${pct(t.sure, t.all)}, of which right ${pct(t.sureRight, t.sure)}`}`,
    );
} else if (which === 'kinds') {
  // Who is a group or a crowd, and what a change is: the grounding call's questions, as it asks them.
  type Set = {
    people: { name: string; identity: string; several: boolean; crowd: boolean | null }[];
    changes: { who: string; what: string; now: string; change: boolean; whole: boolean; first?: boolean }[];
  };
  const set = load<Set>('kinds');
  const b = {
    people: set.people.map((p, i) => ({
      id: `q${i}`,
      name: p.name,
      is_dreamer: false,
      fields: { identity: { value: p.identity || null } },
    })),
    things: set.changes.map((c, i) => ({ id: `c${i}`, name: c.who })),
    places: [],
  } as unknown as Breakdown;
  const state = 'Questions about the people and the changes of some dreams.';
  const tally: Record<string, { right: number; all: number; undecided: number }> = {};
  for (let k = 0; k < times; k++) {
    const call = await callJev(state, {
      ...crowdQuestions(b),
      ...changeQuestions(
        b,
        set.changes.map((c, i) => ({ key: `k${i}`, who: `c${i}`, what: c.what, now: c.now })),
      ),
    });
    if (!call.answers) {
      console.log(`no answer: ${call.error}`);
      continue;
    }
    const a = call.answers;
    const n = (key: string) => (a[key]?.type === 'noul' ? (a[key] as { noul: number }).noul : Number.NaN);
    const score = (family: string, p: number, expected: boolean | null, bar: number, label: string, sure = true) => {
      if (expected === null) return;
      const t = (tally[family] ??= { right: 0, all: 0, undecided: 0 });
      // Between the bars the breakdown's own reading stands: an answer there decides nothing.
      const decided = sure ? p >= bar || p <= 1 - bar : true;
      if (!decided) {
        t.undecided++;
        return;
      }
      t.all++;
      const got = p >= bar;
      if (got === expected) t.right++;
      else console.log(`MISS ${family} ${label}: ${p.toFixed(2)}, should be ${expected}`);
    };
    set.people.forEach((p, i) => {
      score('several', n(`several_q${i}`), p.several, KIND_BARS.several, p.name);
      score('crowd', n(`crowd_q${i}`), p.crowd, KIND_BARS.crowd, p.name);
    });
    set.changes.forEach((c, i) => {
      // Kept, as the harness keeps it: a change of look, or into something else altogether.
      // Recorded where its subject is first shown, code drops it, whatever Jev reads (hasBefore).
      const kept = !c.first && (n(`change_k${i}`) >= KIND_BARS.look || n(`whole_k${i}`) >= KIND_BARS.whole);
      score('kept', kept ? 1 : 0, c.change || c.whole, 0.5, `${c.who}: ${c.what} → ${c.now}`, false);
      if (c.change) score('whole', n(`whole_k${i}`), c.whole, KIND_BARS.whole, `${c.who}: ${c.what} → ${c.now}`, false);
    });
  }
  for (const [family, t] of Object.entries(tally))
    console.log(
      `${family.padEnd(8)} right ${pct(t.right, t.all)}${t.undecided ? `; left to the breakdown (unsure): ${t.undecided}` : ''}`,
    );
} else if (which === 'ending') {
  // "How it ended" as the conversation reads it while listening: the goal's own question, on the
  // conversation cut after one of their messages, against the bar that settles a goal.
  type Case = { id: string; expect: 'told' | 'not_told'; why: string; transcript: Exchange[] };
  const cfg = dreamConfig();
  const rows = (
    await Promise.all(
      load<Case[]>('ending').flatMap((c) =>
        Array.from({ length: times }, async () => {
          const q = bookkeeperQuestions(cfg, c.transcript, undefined, 'listen');
          const call = await callJev(renderTranscript(c.transcript), {
            goal_ending: q.goal_ending,
            finished_telling: q.finished_telling,
          });
          const n = (k: string) => (call.answers?.[k]?.type === 'noul' ? call.answers[k].noul : Number.NaN);
          return { c, error: call.error, told: n('goal_ending'), finished: n('finished_telling') };
        }),
      ),
    )
  ).filter((r) => !r.error);
  const bar = cfg.confidence_threshold;
  for (const r of rows) {
    const got = r.told >= bar ? 'told' : 'not_told';
    console.log(
      `${got === r.c.expect ? ' ok ' : 'MISS'} ${r.c.id.padEnd(16)} expect ${r.c.expect.padEnd(8)} ending ${r.told.toFixed(2)}  finished ${r.finished.toFixed(2)}  ${r.c.why}`,
    );
  }
  const right = rows.filter((r) => (r.told >= bar ? 'told' : 'not_told') === r.c.expect).length;
  const early = rows.filter((r) => r.c.expect === 'not_told' && r.told >= bar).length;
  const fin = rows.filter((r) => (r.finished >= FINISHED_BAR ? 'told' : 'not_told') === r.c.expect).length;
  console.log(`\nending right ${pct(right, rows.length)}; read as ended mid-dream: ${early}`);
  console.log(`finished_telling right ${pct(fin, rows.length)} (bar ${FINISHED_BAR})`);
} else if (which === 'goes-on') {
  // "The dream goes on past the retelling?", asked beside how they answered the retelling, on
  // every answer to one in the saved conversations.
  type Case = { id: string; expect: boolean; why: string; transcript: Exchange[] };
  const cfg = dreamConfig();
  const rows = (
    await Promise.all(
      load<Case[]>('goes-on').flatMap((c) =>
        Array.from({ length: times }, async () => {
          const q = bookkeeperQuestions(cfg, c.transcript, undefined, 'retell');
          const call = await callJev(renderTranscript(c.transcript), {
            goes_on: q.goes_on,
            retell_reply: q.retell_reply,
          });
          const on = call.answers?.goes_on;
          const reply = call.answers?.retell_reply;
          return {
            c,
            error: call.error,
            p: on?.type === 'noul' ? on.noul : Number.NaN,
            reply: reply?.type === 'choice' ? reply.choice : '?',
          };
        }),
      ),
    )
  ).filter((r) => !r.error);
  for (const r of rows) {
    const got = r.p >= GOES_ON_BAR;
    console.log(
      `${got === r.c.expect ? ' ok ' : 'MISS'} ${r.c.id.padEnd(14)} expect ${r.c.expect ? 'goes on' : 'not   '}  ${r.p.toFixed(2)}  reply ${r.reply.padEnd(10)} ${r.c.why}`,
    );
  }
  const right = rows.filter((r) => r.p >= GOES_ON_BAR === r.c.expect).length;
  const wrongly = rows.filter((r) => !r.c.expect && r.p >= GOES_ON_BAR).length;
  const lost = rows.filter((r) => r.c.expect && r.p < GOES_ON_BAR).length;
  console.log(`\nright ${pct(right, rows.length)}; back to listening wrongly: ${wrongly}; the rest lost: ${lost}`);
  const on = rows.filter((r) => r.c.expect).map((r) => r.p);
  const off = rows.filter((r) => !r.c.expect).map((r) => r.p);
  console.log(
    `going on read ${Math.min(...on).toFixed(2)}+; the rest up to ${Math.max(...off).toFixed(2)} (bar ${GOES_ON_BAR})`,
  );
} else if (which === 'verdicts') {
  // Which of the pictures on show they say is wrong: read as wrong, it is drawn again and paid for.
  type Case = { id: string; message: string; shown: { id: string; name: string }[]; wrong: string[] };
  const rows = (
    await Promise.all(
      load<Case[]>('verdicts').flatMap((c) =>
        Array.from({ length: times }, async () => {
          const call = await callJev(c.message, verdictQuestions(c.shown, c.message));
          const n = (k: string) => (call.answers?.[k]?.type === 'noul' ? call.answers[k].noul : Number.NaN);
          const r = call.answers?.sketch_reaction;
          return {
            c,
            error: call.error,
            bad: Object.fromEntries(c.shown.map((x) => [x.id, n(`bad_${x.id}`)])),
            ok: Object.fromEntries(c.shown.map((x) => [x.id, n(`ok_${x.id}`)])),
            reaction: r?.type === 'choice' ? r.choice : 'no_reaction',
          };
        }),
      ),
    )
  ).filter((r) => !r.error);
  let pics = 0;
  let right = 0;
  let redrawn = 0;
  let missed = 0;
  for (const r of rows) {
    // As the conversation decides (session.ts): read wrong at 0.6, else right at 0.6; with neither,
    // a "not right" with one picture on show is about that one.
    let got = r.c.shown.filter((x) => r.bad[x.id] >= 0.6).map((x) => x.id);
    const anyRight = r.c.shown.some((x) => r.bad[x.id] < 0.6 && r.ok[x.id] >= 0.6);
    if (!got.length && !anyRight && r.reaction === 'not_right' && r.c.shown.length === 1) got = [r.c.shown[0].id];
    const extra = got.filter((x) => !r.c.wrong.includes(x));
    const lost = r.c.wrong.filter((x) => !got.includes(x));
    pics += r.c.shown.length;
    right += r.c.shown.length - extra.length - lost.length;
    redrawn += extra.length;
    missed += lost.length;
    if (extra.length || lost.length) {
      const name = (id: string) =>
        `${id} (${r.c.shown.find((x) => x.id === id)?.name.slice(0, 40)}) ${r.bad[id].toFixed(2)}`;
      console.log(`MISS ${r.c.id.padEnd(9)} ${JSON.stringify(r.c.message.slice(0, 110))}`);
      if (extra.length) console.log(`       read wrong: ${extra.map(name).join('; ')}`);
      if (lost.length) console.log(`       missed: ${lost.map(name).join('; ')}`);
    }
  }
  console.log(`\npictures right ${pct(right, pics)}; redrawn for nothing: ${redrawn}; wrong ones missed: ${missed}`);
} else if (which === 'planner') {
  // The floor planner on one scene of a frozen dream, planned afresh N times through the harness's
  // own planning (planShots: plans, their facts, each shot's "storyboard complete?", and planning
  // again what is held), and how often each moment's shot then passes.
  //   bun run evals/run.ts planner <source> [scene] [--times 3]
  const [source, scene] = process.argv.slice(3).filter((x, i, all) => !x.startsWith('--') && !all[i - 1]?.startsWith('--'));
  const s = JSON.parse(readFileSync(join(import.meta.dir, 'sources', `${source}.json`), 'utf8')) as {
    draft: { breakdown: Breakdown };
    style: StyleOption;
  };
  const b = structuredClone(s.draft.breakdown);
  // Every scene is planned afresh, as a dream's are together; one scene's moments are reported if named.
  for (const sc of b.scenes) delete sc.blocking;
  const moments = b.scenes.filter((sc) => !scene || sc.id === scene).flatMap((sc) => sc.moments.map((m) => m.id));
  const runs = await Promise.all(
    Array.from({ length: times }, () => planShots(b, s.style, { block: blockScenes, jev: callJev }).catch(() => null)),
  );
  let passed = 0;
  let all = 0;
  for (const id of moments) {
    const rs = runs.map((p) => p?.storyboard?.[id]);
    passed += rs.filter((r) => r?.ok).length;
    all += rs.length;
    console.log(`${id}: passes ${pct(rs.filter((r) => r?.ok).length, rs.length)}`);
    for (const r of rs) if (!r?.ok) console.log(`   ${r ? r.reasons.join('; ').slice(0, 140) : 'no shot'}`);
  }
  console.log(`\nshots passing "storyboard complete?": ${pct(passed, all)}`);
} else {
  console.error('usage: bun run evals/run.ts storyboard|plan-facts|kinds|ending|goes-on|verdicts|planner [--times 2]');
  process.exit(1);
}
