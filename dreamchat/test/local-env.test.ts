import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('the local runner sets its profile before anything loads', () => {
  test("loading local-run, the writer every reading is cached under is the profile's, not the default", () => {
    // A fresh process with no switch set: what local-run's own imports leave llm.ts holding.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DREAMCHAT_')));
    const code = `await import(${JSON.stringify(join(import.meta.dir, '..', 'evals', 'local-run.ts'))}); const { WRITER } = await import(${JSON.stringify(join(import.meta.dir, '..', 'llm.ts'))}); console.log(WRITER);`;
    const r = spawnSync('bun', ['-e', code], { env, encoding: 'utf8' });
    expect(r.stdout.trim().split('\n').at(-1)).toBe('claude');
  });
});
