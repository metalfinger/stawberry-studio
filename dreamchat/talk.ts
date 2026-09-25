// Talk to the dream chat from a terminal, through the running server, as the person would. The
// same conversation is on the page at the same time, pictures and all.
//
//   bun run talk.ts new [name]            a new conversation: its id and Berry's opening
//   bun run talk.ts say <id> <words…>     said as the person: Berry's reply, and what is drawing
//   bun run talk.ts show <id>             the stage it is at, and every sketch and moment
//   bun run talk.ts wait <id> [seconds]   waits until nothing is being drawn, then shows what is up
//   bun run talk.ts resume <id>           picks the drawing up on the server's current code
//   bun run talk.ts prompt <id> <item>    the words and images it would be drawn from, and why it is held
//
// DREAMCHAT_URL picks the server (default http://127.0.0.1:8790).
import { join } from 'node:path';
import { STRAWBERRY_HOME } from './strawberry';

const BASE = process.env.DREAMCHAT_URL ?? 'http://127.0.0.1:8790';

type Picture = {
  id: string;
  kind: string;
  name: string;
  status: string;
  version: number;
  mediaPath?: string;
  review?: string;
  held?: string[];
  error?: string;
  fields: Record<string, { value: string | null }>;
};
type View = { phase: string; images: number; build?: { items?: Picture[]; frames?: Picture[] } };

async function call(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(out.error ?? res.status));
  return out;
}

const view = async (id: string) => (await call(`/api/session?id=${encodeURIComponent(id)}`)) as unknown as View;

/** What a picture should show, in the dream's words. */
function meant(p: Picture): string {
  const f = (k: string) => p.fields[k]?.value;
  if (p.kind === 'cut') return f('action') ?? p.name;
  if (p.kind === 'ghost') return f('change') ?? p.name;
  return Object.values(p.fields)
    .map((d) => d?.value)
    .filter(Boolean)
    .join('; ');
}

function list(v: View): string {
  const pictures = [...(v.build?.items ?? []), ...(v.build?.frames ?? []).filter((f) => f.kind === 'cut')];
  if (!pictures.length) return `stage: ${v.phase}, nothing drawn yet`;
  const lines = pictures.map((p) => {
    const where = p.mediaPath ? join(STRAWBERRY_HOME, 'media', p.mediaPath) : '';
    const state = [p.status, p.review, p.version > 1 ? `v${p.version}` : ''].filter(Boolean).join(', ');
    return [
      `${p.id} ${p.kind === 'cut' ? 'moment' : 'sketch'} (${state}): ${p.name}`,
      `   should show: ${meant(p).slice(0, 300)}`,
      p.held?.length ? `   held before drawing: ${p.held.join('; ')}` : '',
      p.error ? `   error: ${p.error}` : '',
      where ? `   file: ${where}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `stage: ${v.phase}, ${v.images} pictures paid for\n${lines.join('\n')}`;
}

const [cmd, id, ...rest] = process.argv.slice(2);
if (cmd === 'new') {
  const made = await call('/api/new', { name: [id, ...rest].filter(Boolean).join(' ') });
  const opened = await call('/api/open', { id: made.id });
  console.log(`id: ${made.id}\n\nBerry: ${(opened.messages as string[]).join('\n\n')}`);
} else if (cmd === 'say' && id && rest.length) {
  const r = await call('/api/message', { id, text: rest.join(' ') });
  if (r.refused) console.log('(the conversation is closed)');
  console.log(`Berry: ${((r.messages as string[]) ?? []).join('\n\n')}`);
  const v = await view(id);
  const drawing = [...(v.build?.items ?? []), ...(v.build?.frames ?? [])].filter((p) => p.status === 'drawing');
  console.log(`\n(stage: ${v.phase}${drawing.length ? `; drawing: ${drawing.map((p) => p.id).join(', ')}` : ''})`);
} else if (cmd === 'resume' && id) {
  const r = await call('/api/resume', { id });
  console.log(`restarted: ${((r.restarted as string[]) ?? []).join(', ') || 'nothing'}`);
  console.log(list(await view(id)));
} else if (cmd === 'prompt' && id && rest[0]) {
  const r = (await call(`/api/prompt?id=${encodeURIComponent(id)}&item=${encodeURIComponent(rest[0])}`)) as {
    prompt: string;
    references: { media_id: string; role: string }[];
    held?: string[];
  };
  if (r.held?.length) console.log(`held before drawing: ${r.held.join('; ')}\n`);
  console.log(r.prompt);
  for (const ref of r.references) console.log(`\nimage ${ref.media_id.slice(0, 12)}: ${ref.role}`);
} else if (cmd === 'show' && id) {
  console.log(list(await view(id)));
} else if (cmd === 'wait' && id) {
  const until = Date.now() + Number(rest[0] ?? 600) * 1000;
  for (;;) {
    const v = await view(id);
    const busy = [...(v.build?.items ?? []), ...(v.build?.frames ?? [])].some((p) => p.status === 'drawing');
    if (!busy || Date.now() > until) {
      console.log(list(v));
      break;
    }
    await Bun.sleep(5000);
  }
} else {
  console.error('usage: bun run talk.ts new [name] | say <id> <words…> | show <id> | wait <id> [seconds] | resume <id> | prompt <id> <item>');
  process.exit(1);
}
