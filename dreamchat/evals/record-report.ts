// Every saved dream's story record (record.ts), checked against its rules: per dream, what each rule
// found, then how many each rule found in each dream. Read-only: it never writes a session or a file.
//
//   bun run evals/record-report.ts [state files...]
//
// With no files, every state/*.json that has a breakdown.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { planContinuity } from '../continuity';
import { diffPlan, RULE_ORDER, type RuleName, storyRecord, type Violation } from '../record';
import type { Session } from '../session';

const given = process.argv.slice(2);
const dir = join(import.meta.dir, '..', 'state');
const files = given.length
  ? given
  : readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(dir, f));

/** Short column names for the table. */
const SHORT: Record<RuleName, string> = {
  ids: 'ids',
  passing: 'pass',
  presence: 'pres',
  kind: 'kind',
  one_name: 'name',
  style: 'style',
  duplicates: 'dup',
  said: 'said',
  first_look: 'first',
  no_change: 'noop',
  before: 'before',
  carried: 'carry',
};

const rows: { dream: string; counts: Record<RuleName, number>; differs: number }[] = [];
for (const file of files) {
  let s: Session;
  try {
    s = JSON.parse(readFileSync(file, 'utf8')) as Session;
  } catch {
    console.log(`${basename(file)}: not a saved session, skipped`);
    continue;
  }
  const b = s.draft?.breakdown;
  if (!b) continue;
  const words = (s.transcript ?? []).filter((e) => e.role === 'user').map((e) => e.content);
  let violations: Violation[] = [];
  let differs = 0;
  try {
    const r = storyRecord(b, s.build?.items ?? [], s.draft?.readings, { words, style: s.style });
    violations = r.violations;
    try {
      differs = diffPlan(r.record, planContinuity(b)).length;
    } catch {
      differs = -1;
    }
  } catch (e) {
    console.log(`\n${b.title} (${basename(file)}): the record failed: ${String(e).slice(0, 200)}`);
    continue;
  }
  console.log(`\n${b.title} (${basename(file)})`);
  if (!violations.length) console.log('  nothing found');
  for (const rule of RULE_ORDER) {
    const vs = violations.filter((v) => v.rule === rule);
    if (!vs.length) continue;
    console.log(`  ${rule} (${vs.length})`);
    for (const v of vs) console.log(`    - [${v.fix}]${v.key ? ` ${v.key}` : v.at ? ` ${v.at}` : ''}: ${v.detail}`);
  }
  if (differs)
    console.log(
      `  differs from the continuity plan at ${differs < 0 ? 'no moment (the plan failed)' : `${differs} moment(s)`}`,
    );
  const counts = Object.fromEntries(
    RULE_ORDER.map((r) => [r, violations.filter((v) => v.rule === r).length]),
  ) as Record<RuleName, number>;
  rows.push({ dream: `${basename(file, '.json').replace(/^dream-/, '')} ${b.title}`.slice(0, 44), counts, differs });
}

// The table: a dream a row, a rule a column, and the totals.
const cols = [...RULE_ORDER.map((r) => SHORT[r]), 'all', 'vs plan'];
const width = Math.max(...rows.map((r) => r.dream.length), 10);
const line = (name: string, cells: (string | number)[]) =>
  `${name.padEnd(width)} ${cells.map((c, i) => String(c).padStart(Math.max(cols[i].length, 3))).join(' ')}`;
console.log(`\n${line('dream', cols)}`);
for (const r of rows) {
  const all = RULE_ORDER.reduce((a, k) => a + r.counts[k], 0);
  console.log(
    line(r.dream, [...RULE_ORDER.map((k) => r.counts[k] || '.'), all, r.differs < 0 ? '?' : r.differs || '.']),
  );
}
const total = RULE_ORDER.map((k) => rows.reduce((a, r) => a + r.counts[k], 0));
console.log(
  line(`total (${rows.length} dreams)`, [
    ...total,
    total.reduce((a, n) => a + n, 0),
    rows.reduce((a, r) => a + Math.max(0, r.differs), 0),
  ]),
);
const touched = RULE_ORDER.map((k) => rows.filter((r) => r.counts[k] > 0).length);
console.log(
  line('dreams with any', [...touched, rows.filter((r) => RULE_ORDER.some((k) => r.counts[k] > 0)).length, '']),
);
