// The full profile, set before anything else loads: imported first by the local runner. A module that reads a switch
// as it loads (llm.ts WRITER) otherwise kept its default, and every typed and cast reading was looked up under the
// wrong writer and missed (the qwen-1 and qwen-2 runs, 1 Oct: drawn without them, the red tractor never cast). It
// imports only the profile: a module with a top-level await (local-draw.ts) lets other modules load before it is done.
import { PROFILE } from './profile';

for (const [k, v] of Object.entries(PROFILE)) process.env[k] ??= v;
