// Imported first by every entry point, so the keys are in the environment before any module
// reads one while it loads (the image provider is chosen at load time).
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from './env';

export const loadedKeys = [
  ...loadEnvFile(),
  // The image judge on the PC, when it is set up: JUDGE_URL and JUDGE_API_KEY.
  ...loadEnvFile(process.env.DREAMCHAT_JUDGE_ENV ?? join(homedir(), '.config', 'strawberry', 'judge.env')),
];
