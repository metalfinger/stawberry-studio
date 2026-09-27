// Runs before any test file is loaded: modules read their settings at import.
import { setDefaultTimeout } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DREAMCHAT_STRAWBERRY_HOME ??= mkdtempSync(join(tmpdir(), 'dreamchat-test-home-'));

// Many tests plan, rebuild or draw whole frozen dreams: a second or two alone, and past bun's 5 s on a
// machine busy with other work, where they failed on time alone. A test that hangs still fails.
setDefaultTimeout(30_000);
