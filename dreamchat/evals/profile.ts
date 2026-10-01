// The full profile every local arm starts from, in a module that imports nothing, so that the local runner can set it
// before any other module loads (evals/local-env.ts).

/** The full profile every arm starts from: record, sheet, camera rules, references and every builder step. */
export const PROFILE: Record<string, string> = {
  DREAMCHAT_WRITER: 'claude',
  DREAMCHAT_RECORD: 'on',
  DREAMCHAT_CUT_SHEET: 'on',
  DREAMCHAT_CAMERA: 'on',
  DREAMCHAT_REFS: 'on',
  DREAMCHAT_ONE_BUILDER: 'on',
};
