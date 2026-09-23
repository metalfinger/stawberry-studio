// Simulated dreamers. A model plays someone who knows only one dream, and talks to the real
// harness (real judge, real host) until the conversation closes. With FAL_KEY set the sketches
// and moments are really drawn, so a run costs images; without it, the offline fixture draws.
// Each run is saved beside the page's conversations and can be opened there.
//
//   bun run simulate.ts dreams/icehead.md
//   bun run simulate.ts dreams/*.md --max 30
import { loadedKeys } from './boot';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dreamConfig } from './dream';
import { callJev } from './jev';
import { callDeepseek, callHost, type ChatMessage } from './llm';
import { details, moments, proposeLook, reviseItem } from './producer';
import { liveProducer, ownStyle, SessionStore } from './session';
import { assistantJudge, judgeKind } from './judge';
import { judgeAvailable, judgeContinuity, judgeTake, liveSheets, PROVIDER, spawnWorker } from './sheets';
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
- When they say a picture is up and ask how it looks: if you're told below what you see in it, react to that as you would to a picture of your own dream: say plainly what's wrong ("the aunt isn't in it", "she's wearing different clothes than in the last one"), or that it looks right. If you're not told, say it looks right, briefly, unless what they describe contradicts your dream.

Reply with only your next message, nothing else.`;

// Words the host should never use with a person who knows nothing about film.
const FILM_WORDS =
  /\b(shots?|scenes?|frames?|angles?|palettes?|cinematic|composition|storyboard|character sheets?|lens)\b/gi;

type Report = Awaited<ReturnType<typeof run>>;

/**
 * What the simulated dreamer sees in the moments on show: the judge's findings, as a person
 * would notice them. The dreamer can't see images; the judge (the assistant) can, so its answers
 * stand in for their eyes, and a real flaw gets the correction a real person would give. Waits
 * for the judge on every moment on show, so no flaw is waved through unseen.
 */
async function lookAt(store: SessionStore, id: string): Promise<string> {
  const until = Date.now() + Number(process.env.DREAMCHAT_SIM_LOOK_MS ?? 20 * 60_000);
  for (;;) {
    // The sketches while they are on show, then the moments: whatever they are asked about.
    const view = store.view(id);
    const pieces =
      view?.phase === 'review'
        ? (view.build?.items ?? [])
        : (view?.build?.frames ?? []).filter((f) => f.kind === 'cut');
    const frames = pieces.filter((f) => f.status === 'ready' && f.announced && !f.review);
    const judged = frames.filter((f) => f.check);
    if (judged.length === frames.length || Date.now() > until) {
      return judged
        .map((f) => {
          const wrong = [...(f.check?.failed ?? []), ...(f.continuity?.failed ?? [])];
          return wrong.length
            ? `in the picture of "${f.name}", something is off: ${wrong.map((q) => q.replace(/\?$/, '')).join('; ')} (the answer to each is no).`
            : `the picture of "${f.name}" looks the way you remember.`;
        })
        .join(' ');
    }
    await Bun.sleep(3000);
  }
}

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
    proposeLook,
    // The assistant is the judge unless the PC's judge is asked for (DREAMCHAT_JUDGE=pc).
    judge: judgeKind === 'assistant' ? assistantJudge : judgeKind === 'pc' && judgeAvailable() ? judgeTake : undefined,
    judgeContinuity: judgeKind === 'pc' && judgeAvailable() ? judgeContinuity : undefined,
    // Kept beside the web page's own conversations, so a simulated run can be opened there,
    // pictures, plan and all, after the page is restarted.
    dir: join(import.meta.dir, 'state'),
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
    // Pictures take a minute: a person would wait for them before answering about them, and
    // looks at them before saying whether they're right.
    if (!closed && (r.phase === 'review' || r.phase === 'frames')) {
      await store.settle(id);
      listener += '\n(the pictures have appeared on the right)';
      const seen = await lookAt(store, id);
      if (seen) listener += `\n\n(What you see in the pictures on the right, which only you know: ${seen})`;
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
      id: i.id,
      kind: i.kind,
      name: i.name,
      key: i.frame?.key,
      order: i.frame?.order,
      status: i.status,
      version: i.version,
      error: i.error,
      file: i.mediaPath ? join(STRAWBERRY_HOME, 'media', i.mediaPath) : null,
      from:
        i.frame?.plan?.why ??
        (i.ghost ? `ghost of ${i.ghost.of} from ${i.ghost.from ?? 'the sheet'}: ${i.ghost.why}` : null),
      transition: i.frame?.plan?.transition,
      changes: i.frame?.plan?.changes,
      states: i.frame?.plan?.states,
      dropped: i.dropped,
      check: i.check,
      continuity: i.continuity,
    })),
    plan: s.build?.plan
      ? {
          issues: s.build.plan.issues,
          ghosts: s.build.plan.ghosts.map((g) => `${g.id} ${g.kind} ${g.label}: ${g.why}`),
        }
      : null,
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
      `  ${k.kind === 'ghost' ? 'ghost' : `frame ${k.order}`} ${k.key ? '★ ' : ''}${k.name}: ${k.status}${k.error ? ` (${k.error})` : ''}${k.file ? ` ${k.file}` : ''}\n      from: ${k.from ?? '—'}${k.transition ? ` · ${k.transition}` : ''}${k.changes?.length ? ` · changes: ${k.changes.join('; ')}` : ''}${k.dropped?.length ? ` · dropped ${k.dropped.join(', ')}` : ''}${k.continuity ? ` · continuity ${k.continuity.passed}/${k.continuity.questions}${k.continuity.failed.length ? ` (missed: ${k.continuity.failed.join(' | ')})` : ''}${k.continuity.error ? ` (${k.continuity.error})` : ''}` : ''}${k.check ? ` · facts ${k.check.passed}/${k.check.questions}` : ''}`,
    );
  if (r.plan) {
    for (const g of r.plan.ghosts) console.log(`  plan ghost ${g}`);
    for (const x of r.plan.issues) console.log(`  plan issue: ${x}`);
  }
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
// A run stopped early takes its worker with it, or workers pile up on the store.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    worker?.stop();
    process.exit(130);
  });
console.log(`sketches drawn with ${PROVIDER} into ${STRAWBERRY_HOME}`);
const reports = await Promise.all(files.map((f) => run(f, max)));
worker?.stop();
for (const r of reports) print(r);
const path = join(out, `sim-${stamp}-${process.env.DREAMCHAT_HOST_THINKING ?? 'low'}.json`);
await Bun.write(path, JSON.stringify(reports, null, 2));
console.log(`\nfull transcripts: ${path}`);
