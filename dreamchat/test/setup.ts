// Runs before any test file is loaded: modules read their settings at import.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DREAMCHAT_STRAWBERRY_HOME ??= mkdtempSync(join(tmpdir(), 'dreamchat-test-home-'));
