// Keys live outside the repo, in a file only this machine's user can read. They are loaded
// once at startup and never logged; callers get back the names that were set.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_ENV_FILE = join(homedir(), '.config', 'strawberry', 'dreamchat.env');

export function loadEnvFile(path = process.env.DREAMCHAT_ENV ?? DEFAULT_ENV_FILE): string[] {
  if (!existsSync(path)) return [];
  const loaded: string[] = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    // The shell's own environment wins, so a key can be overridden for one run.
    if (process.env[key] !== undefined) continue;
    process.env[key] = value.replace(/^(['"])(.*)\1$/, '$2');
    loaded.push(key);
  }
  return loaded;
}
