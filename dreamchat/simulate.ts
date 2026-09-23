// Simulated dreamers. A model plays someone who knows only one dream, and talks to the real
// harness (real judge, real host) until the conversation closes. Nothing is drawn, so a run
// costs only text calls.
//
//   bun run simulate.ts dreams/icehead.md
//   bun run simulate.ts dreams/*.md --max 30
import { loadedKeys } from './boot';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dreamConfig } from './dream';
import { callJev } from './jev';
import { callDeepseek, callHost, type ChatMessage } from './llm';
import { details, moments, reviseItem } from './producer';
import { liveProducer, ownStyle, SessionStore } from './session';
import { judgeAvailable, judgeTake, liveSheets, PROVIDER, spawnWorker } from './sheets';
import { REPO, STRAWBERRY_HOME, STRAWBERRY_PYTHON, strawberryAvailable, writeProduction } from './strawberry';

void loadedKeys;

const DREAMER = (
  dream: string,
) => `You had a dream, and you're telling someone about it in a chat. This is the dream as you remember it:

<dream>
${dream}
</dream>

How to behave:
- You're an ordinary person, not a writer. Reply the way people text: plain, not long, sometimes vague.
- Don't pour the whole dream out in one message. Start with the part that stuck with you and let the rest come as they ask.
- Only use what is in the dream above. If you're asked about something it doesn't say, say you don't remember. Never invent a detail.
- You know nothing about film, art or drawing.
- If they tell the dream back to you, check it against the dream above and say honestly whether it's right, correcting anything that's wrong or missing.
- If they ask whether you'd like to see it drawn, say yes.
- If they offer ways it could be drawn, pick the one closest to how the dream looked to you, in a few words.
- If they describe how they picture someone or something from your dream, say whether that fits. If a detail is wrong against the dream above, correct it; if the dream doesn't say, tell them to go with their guess.
- When they say a picture is up and ask how it looks, you can't see it: say it looks right, briefly, unless what they describe contradicts your dream.

Reply with only your next message, nothing else.`;

// Words the host should never use with a person who knows nothing about film.
const FILM_WORDS =
  /\b(shots?|scenes?|frames?|angles?|palettes?|cinematic|composition|storyboard|character sheets?|lens)\b/gi;

type Report = Awaited<ReturnType<typeof run>>;

async function run(file: string, max: number) {
  const slug = basename(file, '.md');
  const raw = readFileSync(file, 'utf8');
  const dream = raw
    .replace(/^#.*\n/, '')
    .replace(/^Source:.*\n/m, '')
    .trim();
  const cfg = dreamConfig();
  const store = new SessionStore(cfg, {
    jev: callJev,
    host: callHost,
    producer: liveProducer(callJev),
    ownStyle,
    write: strawberryAvailable() ? writeProduction : undefined,
    sheets: strawberryAvailable() ? liveSheets : undefined,
    reviseItem,
    judge: judgeAvailable() ? judgeTake : undefined,
  });
  const { id } = store.create(`simulated: ${slug}`);

  const opened = await store.open(id);
  const dreamer: ChatMessage[] = [{ role: 'system', content: DREAMER(dream) }];
  let listener = opened.messages.join('\n');
  let closed = false;
  for (let i = 0; i < max && !closed; i++) {
    dreamer.push({ role: 'user', content: listener });
    const reply = (await callDeepseek(dreamer, { thinking: 'disabled' })).content.trim();
    dreamer.push({ role: 'assistant', content: reply });
    const r = await store.message(id, reply);
    listener = r.messages.join('\n');
    closed = r.closed;
    // Pictures take a minute: a person would wait for them before answering about them.
    if (!closed && (r.phase === 'review' || r.phase === 'frames')) {
      await store.settle(id);
      listener += '\n(the pictures have appeared on the right)';
    }
  }

  await store.settle(id);
  const s = store.view(id)!;
  const b = s.draft?.breakdown;
  const all = b ? details(b).filter((d) => d.detail.value) : [];
  const turns = s.turns.filter((t) => t.turn > 0);
  const hostMessages = s.transcript.filter((e) => e.role === 'assistant').flatMap((e) => e.messages ?? [e.content]);
  // A film word the person used first is theirs to use; only Berry's own count.
  const theirs = s.transcript
    .filter((e) => e.role === 'user')
    .map((e) => e.content)
    .join(' ')
    .toLowerCase();
  const filmWords = hostMessages
    .flatMap((m) => m.match(FILM_WORDS) ?? [])
    .filter((w) => !theirs.includes(w.toLowerCase()));
  const retellIdx = s.turns.findIndex((t) => t.move.kind === 'retell');
  // The transcript's assistant entries line up one-to-one with turn records, opening first.
  const retelling =
    retellIdx === -1 ? '' : (s.transcript.filter((e) => e.role === 'assistant')[retellIdx]?.content ?? '');
  // Judged against what the person actually said, not the dream text: the simulated
  // dreamer embellishes, and a retelling that keeps what they said is doing its job.
  const fidelity = retelling ? await judgeRetelling(theirs, retelling) : null;

  return {
    dream: slug,
    id,
    phase: s.phase,
    closed: s.closed,
    messages: turns.length,
    firstRetellAt: retellIdx === -1 ? null : s.turns[retellIdx].turn,
    retells: s.retells,
    moves: turns.map(
      (t) => `${t.turn} ${t.move.kind}${t.move.kind === 'probe_goal' ? `:${t.move.goalId}` : ''} (${t.rule})`,
    ),
    goals: Object.fromEntries(s.goals.map((g) => [g.id, g.status])),
    asks: s.askCounts,
    filmWords,
    repairs: turns.flatMap((t) => t.violations),
    retelling,
    fidelity,
    breakdown: b
      ? {
          title: b.title,
          moments: moments(b).map((m) => `${m.key ? '★ ' : ''}${m.action}${m.said ? '' : ' (guess)'}`),
          people: b.people.map((p) => p.name),
          places: b.places.map((p) => p.name),
          things: b.things.map((t) => t.name),
          said: all.filter((d) => d.detail.said).length,
          guessed: all.filter((d) => !d.detail.said).length,
          downgraded: s.draft?.downgraded?.length ?? 0,
          ms: s.draft?.ms,
        }
      : null,
    style: s.style?.name ?? null,
    styleWaitMs: s.turns.reduce((n, t) => n + (t.waitMs ?? 0), 0),
    production: s.production,
    frames: (s.build?.frames ?? []).map((i) => ({
      name: i.name,
      key: i.frame?.key,
      status: i.status,
      version: i.version,
      error: i.error,
      file: i.mediaPath ? join(STRAWBERRY_HOME, 'media', i.mediaPath) : null,
    })),
    sketches: (s.build?.items ?? []).map((i) => ({
      name: i.name,
      status: i.status,
      error: i.error,
      file: i.mediaPath ? join(STRAWBERRY_HOME, 'media', i.mediaPath) : null,
      prompt_fields: Object.fromEntries(
        Object.entries(i.fields).map(([k, d]) => [k, `${d.value}${d.said ? '' : ' (guess)'}`]),
      ),
    })),
    images: s.images,
    spentUsd: s.spentUsd,
    avgJudgeMs: Math.round(turns.reduce((n, t) => n + t.jevMs, 0) / Math.max(turns.length, 1)),
    avgReplyMs: Math.round(turns.reduce((n, t) => n + t.hostMs, 0) / Math.max(turns.length, 1)),
    transcript: s.transcript.map((e) => `${e.role === 'user' ? 'dreamer' : 'Berry'}: ${e.content}`),
  };
}

/** Jev scores the retelling against what the person said: coverage, and anything invented. */
async function judgeRetelling(told: string, retelling: string) {
  const call = await callJev(`What the person told:\n${told}\n\nRetelling:\n${retelling}`, {
    complete: {
      type: 'score',
      instructions:
        'How completely and faithfully does the retelling capture the dream the person told: what happened, in order, where, who was there, how it felt and looked?',
      criteria: ['misses or changes important parts', 'mostly right, with gaps', 'complete and faithful'],
    },
    invents: {
      type: 'noul',
      instructions: 'Does the retelling add anything the person did not say?',
      criteria: {
        true: 'it adds a detail, event or feeling they never mentioned',
        false: 'everything in it comes from what they said',
      },
    },
  });
  if (!call.answers) return { error: call.error };
  const c = call.answers.complete;
  const inv = call.answers.invents;
  return {
    complete: c?.type === 'score' ? (c.legend[String(Math.round(c.score))] ?? c.score) : null,
    score: c?.type === 'score' ? Number(c.score.toFixed(2)) : null,
    invents: inv?.type === 'noul' ? Number(inv.noul.toFixed(2)) : null,
  };
}

function print(r: Report) {
  console.log(`\n━━ ${r.dream} ━━ ${r.phase}${r.closed ? '' : ' (not closed)'} after ${r.messages} messages`);
  console.log(`first retelling at message ${r.firstRetellAt ?? '—'}, retellings ${r.retells}`);
  for (const m of r.moves) console.log(`  ${m}`);
  const byStatus: Record<string, string[]> = {};
  for (const [g, st] of Object.entries(r.goals)) (byStatus[st] ??= []).push(g);
  console.log(
    `goals: ${Object.entries(byStatus)
      .map(([st, gs]) => `${st} ${gs.join(', ')}`)
      .join(' · ')}`,
  );
  console.log(`asked: ${JSON.stringify(r.asks)}`);
  console.log(`film words: ${r.filmWords.length ? r.filmWords.join(', ') : 'none'} · repairs: ${r.repairs.length}`);
  console.log(`retelling fidelity: ${JSON.stringify(r.fidelity)}`);
  console.log(`avg judge ${r.avgJudgeMs} ms · avg reply ${r.avgReplyMs} ms`);
  if (r.breakdown) {
    const bd = r.breakdown;
    console.log(
      `breakdown "${bd.title}" in ${bd.ms} ms: ${bd.moments.length} moments · people ${bd.people.join(', ') || '—'} · places ${bd.places.join(', ')} · things ${bd.things.join(', ') || '—'}`,
    );
    for (const m of bd.moments) console.log(`    ${m}`);
    console.log(`details ${bd.said} said, ${bd.guessed} guessed (${bd.downgraded} downgraded by the check)`);
  }
  console.log(`style: ${r.style ?? '—'} (waited ${r.styleWaitMs} ms for the breakdown)`);
  for (const k of r.frames)
    console.log(
      `  frame ${k.key ? '★ ' : ''}${k.name}: ${k.status}${k.error ? ` (${k.error})` : ''}${k.file ? ` ${k.file}` : ''}`,
    );
  for (const k of r.sketches)
    console.log(`  sketch ${k.name}: ${k.status}${k.error ? ` (${k.error})` : ''}${k.file ? ` ${k.file}` : ''}`);
  console.log(`images ${r.images} · $${r.spentUsd.toFixed(2)} at list price`);
  const p = r.production;
  console.log(
    `strawberry: ${p?.status ?? '—'}${p?.result ? ` · ${p.result.cuts} cuts, ${JSON.stringify(p.result.created)}, issues: ${p.result.issues.length}` : ''}${p?.error ? ` · ${p.error.slice(0, 200)}` : ''}`,
  );
}

const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const max = maxIdx === -1 ? 30 : Number(args[maxIdx + 1]);
const files = args.filter((a, i) => !a.startsWith('--') && (maxIdx === -1 || i !== maxIdx + 1));
if (!files.length) {
  console.error('usage: bun run simulate.ts dreams/<name>.md [more.md …] [--max 30]');
  process.exit(1);
}

const out = join(import.meta.dir, 'runs');
mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const worker = strawberryAvailable() ? spawnWorker(STRAWBERRY_PYTHON, REPO) : null;
console.log(`sketches drawn with ${PROVIDER} into ${STRAWBERRY_HOME}`);
const reports = await Promise.all(files.map((f) => run(f, max)));
worker?.stop();
for (const r of reports) print(r);
const path = join(out, `sim-${stamp}-${process.env.DREAMCHAT_HOST_THINKING ?? 'low'}.json`);
await Bun.write(path, JSON.stringify(reports, null, 2));
console.log(`\nfull transcripts: ${path}`);
