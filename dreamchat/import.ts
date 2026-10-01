// A dumped dream taken straight into Dream Chat's planning, with no chat (the owner, 1 Oct: no live conversation and
// no simulated dreamer until the harness is trusted). The dream's text, or a whole transcript, is the conversation:
// - the breakdown is drafted from it as the chat drafts it;
// - the look is built from a named art style, said as the dreamer would say it, never a photograph (every dream is
//   drawn in an art style of its own);
// - the sketch list is made as the chat makes it, none confirmed and none drawn, a look nobody told left a guess;
// - the shots are planned (floor plans, cameras, briefs);
// - the readings are read into the caches every eval and the local runner read (what each moment implies, its typed
//   facts, the cast);
// - the dream is saved beside the others (state/<id>.json) and its node packet written (runs/packets/<id>.json, with
//   its mock-ups).
// Nothing is drawn. The full profile is set first (evals/profile.ts): the writer is Claude (`claude -p`), Jev reads,
// and no other key is needed.
//
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run import.ts --text <dream.txt | transcript.json> \
//     --style "<a named art style>" [--id <id>] [--title <name>] [--when <the date it was recorded>]
//
// The last line printed is JSON: {"id", "state", "packet", "cuts", "errors"}.
import './evals/local-env';
import { existsSync, readFileSync } from 'node:fs';
import { importDream, liveDeps } from './importer';

{
  const args = process.argv.slice(2);
  const val = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = val('--text');
  const style = val('--style');
  if (!file || !style || !existsSync(file)) {
    console.error(
      'usage: bun run import.ts --text <dream.txt | transcript.json> --style "<a named art style>" [--id <id>] [--title <name>] [--when <date recorded>]',
    );
    process.exit(1);
  }
  process.env.DREAMCHAT_PROVIDER ??= 'fake';
  const { dataDir } = await import('./evals/saved');
  const { resolve } = await import('node:path');
  // Where the dream is kept: DREAMCHAT_DATA as given (a new folder is fine), else the checkout with the others.
  const data = process.env.DREAMCHAT_DATA ? resolve(process.env.DREAMCHAT_DATA) : dataDir();
  try {
    const got = await importDream(
      { text: readFileSync(file, 'utf8'), style, id: val('--id'), title: val('--title'), when: val('--when'), data },
      await liveDeps(),
    );
    console.log(JSON.stringify(got));
    if (got.errors.length) process.exit(1);
  } catch (e) {
    console.log(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
    process.exit(1);
  }
}
