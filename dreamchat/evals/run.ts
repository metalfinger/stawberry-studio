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
import { callJev } from '../jev';
import { PLAN_BARS, planQuestions } from '../planfacts';
import type { Breakdown, Moment } from '../producer';
import { decide, STORYBOARD } from '../stages';

void loadedKeys;
const which = process.argv[2];
const at = process.argv.indexOf('--times');
const times = at > 0 ? Math.max(1, Number(process.argv[at + 1]) || 1) : 1;
const load = <T>(name: string) => JSON.parse(readFileSync(join(import.meta.dir, `${name}.json`), 'utf8')) as T;
const pct = (a: number, b: number) => `${a}/${b} (${b ? Math.round((100 * a) / b) : 0}%)`;

if (which === 'storyboard') {
  type Case = { id: string; moment: string; expect: 'clear' | 'hold'; why: string; state: string };
  const cases = load<Case[]>('storyboard');
  const rows = (
    await Promise.all(
      cases.flatMap((c) =>
        Array.from({ length: times }, async () => {
          const call = await callJev(
            c.state,
            Object.fromEntries(
              STORYBOARD.facts.map((f) => [
                `${f.id}_${c.moment}`,
                { type: 'noul' as const, instructions: f.instructions, criteria: f.criteria },
              ]),
            ),
          );
          return { c, call, d: decide(STORYBOARD, c.moment, call.answers) };
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
} else {
  console.error('usage: bun run evals/run.ts storyboard|plan-facts [--times 2]');
  process.exit(1);
}
