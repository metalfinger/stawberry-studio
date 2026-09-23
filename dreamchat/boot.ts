// Imported first by every entry point, so the keys are in the environment before any module
// reads one while it loads (the image provider is chosen at load time).
import { loadEnvFile } from './env';

export const loadedKeys = loadEnvFile();
