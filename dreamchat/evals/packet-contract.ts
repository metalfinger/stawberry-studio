// Every packet in the folders given, checked against its own version's schema as a harness reads it (contract.ts):
// each keeps to it, or is refused with what is wrong named by its path. A version no harness is given is refused by its
// version; a version 7 packet is checked as version 7 and again as the version 8 packet it turns into.
//
//   bun run evals/packet-contract.ts <folder of packets>... [--list]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toV8, validatePacket } from '../contract';
import type { DreamPacket } from '../packet';

const args = process.argv.slice(2);
const list = args.includes('--list');
const dirs = args.filter((a) => !a.startsWith('--'));
if (!dirs.length) {
  console.error('usage: bun run evals/packet-contract.ts <folder of packets>... [--list]');
  process.exit(2);
}

type Row = { file: string; version: unknown; errors: string[]; v8: string[] | null };
const rows: Row[] = [];
for (const dir of dirs)
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.includes('schema') && x !== 'index.json')) {
    const file = join(dir, f);
    let pk: unknown;
    try {
      pk = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      rows.push({ file, version: null, errors: [`$: not JSON (${String(e).slice(0, 80)})`], v8: null });
      continue;
    }
    const version = (pk as { version?: unknown })?.version;
    const errors = validatePacket(pk);
    const v8 = version === 7 && !errors.length ? validatePacket(toV8(pk as DreamPacket)) : null;
    rows.push({ file, version, errors, v8 });
  }

const byVersion = new Map<string, number>();
for (const r of rows) byVersion.set(String(r.version), (byVersion.get(String(r.version)) ?? 0) + 1);
const ok = rows.filter((r) => !r.errors.length);
const refused = rows.filter((r) => r.errors.length && r.errors.every((e) => e.startsWith('$.version:')));
const broken = rows.filter((r) => r.errors.length && !refused.includes(r));
// Named: a path into the packet (`$.cuts[3].contract.id: …`), or a field of its root by name (`$: world is missing`).
const named = (e: string) => /^\$[.[][^:]*: /.test(e) || /^\$: \S+ is (?:missing|not allowed)$/.test(e);
const unnamed = rows.flatMap((r) => [...r.errors, ...(r.v8 ?? [])]).filter((e) => !named(e));
const v8broken = rows.filter((r) => r.v8?.length);
console.log(
  JSON.stringify({
    packets: rows.length,
    versions: Object.fromEntries(byVersion),
    keep: ok.length,
    refusedByVersion: refused.length,
    brokenNamed: broken.length,
    asV8: { checked: rows.filter((r) => r.v8).length, broken: v8broken.length },
    unnamed: unnamed.length,
  }),
);
if (list)
  for (const r of [...broken, ...refused, ...v8broken])
    console.log(`  ${r.file}: ${[...r.errors, ...(r.v8 ?? []).map((e) => `as v8 ${e}`)].slice(0, 3).join(' | ')}`);
if (broken.length || v8broken.length || unnamed.length) process.exitCode = 1;
