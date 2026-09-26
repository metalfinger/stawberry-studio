import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import { prepare, previousDrawn, type SavedDream } from '../evals/paired-arms';
import { framePrompt, type PlannedInput } from '../frames';
import type { Answer, Question } from '../jev';
import { assistantPick, PICK_INSTRUCTIONS } from '../judge';
import type { Breakdown } from '../producer';
import { SessionStore, type StoreDeps } from '../session';
import type { Item, Take } from '../sheets';
import { STRAWBERRY_HOME } from '../strawberry';
import { applyPick, type PickInput, readPick, takeId, takesOf, wordsOf } from '../takes';
import { fakeHost, fakeJev, noul, pick, told } from './fakes';

// A dream as frozen (evals/sources), each sketch and picture it drew given a stand-in file.
async function frozen(name: string): Promise<SavedDream> {
  const s = (await Bun.file(join(import.meta.dir, '..', 'evals', 'sources', `${name}.json`)).json()) as SavedDream;
  const drawn = <T extends { id: string; status?: string }>(x: T) =>
    x.status === 'ready' ? { ...x, mediaPath: `stand-in-${x.id}.png` } : x;
  return {
    ...s,
    build: { items: s.build!.items.map(drawn), frames: (s.build!.frames ?? []).map(drawn) },
  } as SavedDream;
}
const lighthouse = prepare(await frozen('lighthouse-fresh'));
const heron = prepare(await frozen('heron'));
const nightMarket = prepare(await frozen('night-market'));

/** A moment of a frozen dream as the harness would draw it now: today's prompt, and its takes. */
function takesAt(p: ReturnType<typeof prepare>, mid: string, n: number, prev?: string) {
  const it: Item = { ...(p.pictures.get(mid) as Item), status: 'waiting', mediaId: undefined };
  const cut = p.plan.cuts.find((c) => c.id === mid)!;
  const inputs: PlannedInput[] = cut.refs
    .map((use) => ({ use, item: p.pictures.get(use.id) }))
    .filter((x): x is PlannedInput => !!x.item && x.item.status === 'ready' && !!x.item.mediaId);
  // The harness renders a previs wherever today's plan has a camera for the moment.
  const layout = cut.eye ? `previs:${mid}` : undefined;
  const today = framePrompt(it, p.sheets, p.style, inputs, layout);
  const takes = takesOf({
    today,
    it,
    b: p.b,
    sheets: p.sheets,
    style: p.style,
    inputs,
    layout,
    prev: prev ? p.pictures.get(prev) : undefined,
    n,
  });
  return { today, takes, inputs };
}
const keys = (t: { references: { media_id: string }[] }) => t.references.map((r) => r.media_id);
const base = (t: { references: { role: string }[] }) => t.references[0]?.role === 'base';
const afterBase = (t: { references: { media_id: string; role: string }[] }) =>
  t.references.slice(base(t) ? 1 : 0).map((r) => `${r.role}:${r.media_id}`);

describe('each moment drawn two or three ways', () => {
  test('take 1 is today’s routing, take 2 the picture before edited, take 3 sketches only; the same words in all', () => {
    // In the tractor's cab, seen from behind; the picture before is the same cab from in front.
    const { today, takes } = takesAt(lighthouse, 'm12', 3, 'm11');
    expect(takes.map((t) => t.way)).toEqual(['today', 'edit', 'free']);
    // Take 1 attaches exactly today's images; its words gain at most the line that nothing shows through.
    expect(takes[0].references).toEqual(today.references);
    expect(keys(takes[0])[0]).toBe('previs:m12');
    expect(wordsOf(takes[0].prompt).filter((l) => !wordsOf(today.prompt).includes(l)).length).toBeLessThanOrEqual(1);
    // Take 2 opens on the picture before; take 3 on nothing; then both attach the same sketches.
    expect(takes[1].references[0]).toMatchObject({ media_id: 'picture:m11', role: 'base' });
    expect(base(takes[2])).toBe(false);
    expect(afterBase(takes[1])).toEqual(afterBase(takes[2]));
    expect([...keys(takes[1]).slice(1), ...keys(takes[2])].every((k) => /^(sketch|ghost):/.test(k))).toBe(true);
    // The words about the moment are the same, line for line, in every take.
    for (const t of takes) expect(wordsOf(t.prompt)).toEqual(wordsOf(takes[2].prompt));
    expect(takes.every((t) => t.prompt.includes('Nothing from another picture shows through this one'))).toBe(true);
  });

  test('two takes are today’s and the edit; without a picture before, the second is sketches only', () => {
    expect(takesAt(lighthouse, 'm12', 2, 'm11').takes.map((t) => t.way)).toEqual(['today', 'edit']);
    const { takes } = takesAt(lighthouse, 'm12', 3);
    expect(takes.map((t) => t.way)).toEqual(['today', 'free', 'free']);
    expect(takes[1]).toEqual(takes[2]);
    expect(takes.slice(1).some((t) => keys(t).some((k) => k.startsWith('picture:')))).toBe(false);
  });

  test('every moment of three frozen dreams: the same words, and the same images after image 1 in takes 2 and 3', () => {
    let compared = 0;
    for (const d of [lighthouse, heron, nightMarket])
      for (const c of d.plan.cuts) {
        const prev = previousDrawn(d, c.id);
        if (!prev) continue;
        const { today, takes, inputs } = takesAt(d, c.id, 3, prev);
        const label = `${d.b.title} ${c.id}`;
        expect(`${label}: ${JSON.stringify(takes[0].references)}`).toBe(
          `${label}: ${JSON.stringify(today.references)}`,
        );
        expect(`${label}: ${JSON.stringify(wordsOf(takes[1].prompt))}`).toBe(
          `${label}: ${JSON.stringify(wordsOf(takes[2].prompt))}`,
        );
        // Take 1 says the same too, unless today edits an earlier moment of the same setup, whose
        // framing it keeps (frames.ts leaves out the framing sentence).
        const editsSameSetup = inputs.some((x) => x.use.role === 'base' && x.use.relation === 'same_setup');
        if (!editsSameSetup)
          expect(`${label}: ${JSON.stringify(wordsOf(takes[0].prompt))}`).toBe(
            `${label}: ${JSON.stringify(wordsOf(takes[2].prompt))}`,
          );
        expect(keys(takes[1])[0]).toBe(`picture:${prev}`);
        expect(afterBase(takes[1])).toEqual(afterBase(takes[2]));
        compared++;
      }
    expect(compared).toBeGreaterThan(15);
  });

  test('the judge sees each take by a letter, and each take is shown first as often as the others', () => {
    const firsts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    for (let order = 1; order <= 6; order++) {
      const ids = [0, 1, 2].map((k) => takeId(order, k, 3));
      expect([...ids].sort()).toEqual(['a', 'b', 'c']);
      firsts[ids.indexOf('a')]++;
      expect([0, 1].map((k) => takeId(order, k, 2)).sort()).toEqual(['a', 'b']);
    }
    expect(firsts).toEqual({ 0: 2, 1: 2, 2: 2 });
    expect(takeId(1, 0, 3)).toBe('a');
    expect(takeId(2, 0, 3)).toBe('c');
  });
});

/** A moment whose takes are all in, as the harness holds it. */
function drawnMoment(states: Take['status'][] = ['ready', 'ready', 'ready']): Item {
  const ways: Take['way'][] = ['today', 'edit', 'free'];
  return {
    id: 'm2',
    kind: 'cut',
    name: 'The slat',
    fields: {},
    status: 'drawing',
    version: 1,
    takes: states.map((status, k) => ({
      id: takeId(2, k, states.length),
      n: k + 1,
      way: ways[k],
      status,
      jobId: `job-${k + 1}`,
      recipeId: `r-${k + 1}`,
      ...(status === 'ready' ? { mediaId: `media-${k + 1}`, mediaPath: `take-${k + 1}.png` } : { error: 'nsfw' }),
    })),
  };
}

describe('the pick', () => {
  test('the take the judge keeps becomes the moment’s picture; the others stay as alternates', () => {
    const it = drawnMoment();
    const edit = it.takes!.find((t) => t.way === 'edit')!;
    applyPick(it, { best: edit.id, verdicts: { [edit.id]: 'right', [it.takes![0].id]: 'wrong' }, reason: 'reads' });
    expect([it.status, it.mediaId, it.mediaPath, it.jobId, it.recipeId]).toEqual([
      'ready',
      'media-2',
      'take-2.png',
      'job-2',
      'r-2',
    ]);
    expect(it.pick).toEqual({ kept: edit.id, judged: true, reason: 'reads' });
    expect(it.takes!.map((t) => [t.n, t.mediaId, t.verdict ?? null])).toEqual([
      [1, 'media-1', 'wrong'],
      [2, 'media-2', 'right'],
      [3, 'media-3', null],
    ]);
  });

  test('with no judge, or no answer in time, take 1 is kept: today’s picture', () => {
    const it = drawnMoment();
    applyPick(it, null);
    expect([it.status, it.mediaId]).toEqual(['ready', 'media-1']);
    expect(it.pick).toEqual({ kept: it.takes![0].id, judged: false, reason: 'no judge here' });
    const late = drawnMoment();
    applyPick(late, null, 'no judge answered');
    expect([late.mediaId, late.pick?.reason]).toEqual(['media-1', 'no judge answered']);
  });

  test('a take that failed is never kept; one ready take is kept; none ready fails, known by a job paid for', () => {
    const first = drawnMoment(['failed', 'ready', 'ready']);
    applyPick(first, null);
    expect(first.mediaId).toBe('media-2');
    const judgedFailed = drawnMoment(['failed', 'ready', 'ready']);
    applyPick(judgedFailed, { best: judgedFailed.takes![0].id, verdicts: {} });
    expect([judgedFailed.mediaId, judgedFailed.pick?.judged]).toEqual(['media-2', false]);
    const one = drawnMoment(['failed', 'failed', 'ready']);
    applyPick(one, null);
    expect([one.mediaId, one.pick?.reason]).toEqual(['media-3', 'the only take drawn']);
    const none = drawnMoment(['failed', 'failed', 'failed']);
    applyPick(none, null);
    expect([none.status, none.jobId, none.mediaId]).toEqual(['failed', 'job-1', undefined]);
    expect(none.error).toContain('every take failed');
  });

  test('a moment the person corrected while its takes were drawing waits to be drawn again', () => {
    const it = { ...drawnMoment(), stale: true };
    applyPick(it, null);
    expect([it.status, it.stale, it.mediaId]).toEqual(['waiting', undefined, 'media-1']);
  });

  test('an answer is read against the takes shown', () => {
    expect(
      readPick({ best: 'b', verdicts: { a: 'wrong', b: 'right', z: 'right', c: 'maybe' }, reason: 'r' }, [
        'a',
        'b',
        'c',
      ]),
    ).toEqual({
      best: 'b',
      verdicts: { a: 'wrong', b: 'right' },
      reason: 'r',
    });
    expect(() => readPick({ best: 'd' }, ['a', 'b'])).toThrow('names no take');
  });

  test('the assistant is asked in the judge queue, and its answer file read', async () => {
    const queue = mkdtempSync(join(tmpdir(), 'dreamchat-pick-'));
    const input: PickInput = {
      session: 'dream-0926-1200-abcd',
      moment: 'm2',
      version: 1,
      said: ['a train board in my kitchen'],
      line: 'The one slat that reads zikery',
      before: { moment: 'm1', line: 'The kitchen', mediaPath: 'm1.png' },
      takes: [
        { id: 'a', mediaPath: 'x.png' },
        { id: 'b', mediaPath: 'y.png' },
      ],
    };
    const answer = assistantPick(input, { queue, waitMs: 5000, pollMs: 10 });
    const file = join(queue, 'pick-dream-0926-1200-abcd-m2-v1.json');
    for (let i = 0; i < 100 && !existsSync(file); i++) await Bun.sleep(10);
    const request = JSON.parse(readFileSync(file, 'utf8'));
    const media = join(STRAWBERRY_HOME, 'media');
    expect(request).toEqual({
      kind: 'pick',
      instructions: PICK_INSTRUCTIONS,
      session: 'dream-0926-1200-abcd',
      moment: 'm2',
      version: 1,
      said: ['a train board in my kitchen'],
      line: 'The one slat that reads zikery',
      before: { moment: 'm1', line: 'The kitchen', image: join(media, 'm1.png') },
      takes: [
        { id: 'a', image: join(media, 'x.png') },
        { id: 'b', image: join(media, 'y.png') },
      ],
      answerFile: join(queue, 'pick-dream-0926-1200-abcd-m2-v1.answer.json'),
    });
    expect(existsSync(request.instructions)).toBe(true);
    writeFileSync(
      request.answerFile,
      JSON.stringify({ best: 'b', verdicts: { a: 'partly', b: 'right' }, reason: 'r' }),
    );
    expect(await answer).toEqual({ best: 'b', verdicts: { a: 'partly', b: 'right' }, reason: 'r' });
    // No answer in time: null, and the harness keeps take 1.
    expect(await assistantPick({ ...input, version: 2 }, { queue, waitMs: 40, pollMs: 10 })).toBeNull();
  });
});

describe('a dream drawn with takes', () => {
  const cfg = dreamConfig();
  const required = cfg.goals.filter((g) => !g.optional).map((g) => g.id);
  const breakdown = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8')) as Breakdown;
  breakdown.style_options = [
    { ...breakdown.style_options[0], id: 'a', name: 'sumi ink and wash' },
    { ...breakdown.style_options[0], id: 'b', name: 'an old railway poster' },
  ];
  const script = (q: Record<string, Question>): Record<string, Answer> => {
    if (q.is_retelling) return { is_retelling: noul(0.95) };
    if (!q.eviD_telling) return {};
    const out: Record<string, Answer> = {};
    const turns = Object.keys(q.eviD_telling.type === 'choice' ? q.eviD_telling.criteria : {}).length - 1;
    if (turns >= 1) Object.assign(out, told('telling', 1));
    if (turns >= 2) {
      for (const id of required) Object.assign(out, told(id, 3));
      out.finished_telling = noul(0.9);
    }
    if (q.retell_reply) out.retell_reply = pick('confirmed');
    if (q.wants_to_see) out.wants_to_see = pick('yes');
    if (q.style_choice) out.style_choice = pick('b');
    return out;
  };

  /** A conversation taken to its moments with the engine faked, every job drawn at once. */
  async function drawn(extra: Partial<StoreDeps>) {
    let jobs = 0;
    const started: {
      id: string;
      prompt: string;
      refs: string[];
      intent?: string;
      record: boolean;
      changes: boolean;
    }[] = [];
    const verdicts: [string, boolean][] = [];
    const reaction: { now: Record<string, Answer> } = { now: {} };
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        const out = script(q);
        if (q.profile_reply) out.profile_reply = pick('confirmed');
        if (q.sketch_reaction) Object.assign(out, reaction.now);
        return out;
      }),
      host: fakeHost(),
      producer: async () => ({ breakdown, downgraded: [], notes: [], ms: 1 }),
      write: async () => ({
        projectId: 'p',
        ids: { said: 'src-said', proposal: 'src-proposal', l1: 'node-l1', t1: 'node-t1', m1: 'cut-m1', m2: 'cut-m2' },
        home: '/tmp',
        created: { project: 1, scene: 1, shot: 2, cut: 2, character: 0, location: 1, prop: 1 },
        cuts: 2,
        readyCuts: 0,
        issues: [],
        ms: 1,
      }),
      sheets: {
        start: async ({ item }) => ({ recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 }),
        status: async (jobId) => ({ state: 'ready', mediaId: `media-${jobId}`, mediaPath: `${jobId}.png` }),
        review: async ({ mediaId, approved }) => {
          verdicts.push([mediaId, approved]);
        },
        retryCollection: async () => {},
        startFrame: async ({ item, references, prompt, intent, record, changes }) => {
          jobs += 1;
          const jobId = `job-${item.id}-${jobs}`;
          started.push({
            id: item.id,
            prompt,
            refs: references.map((r) => `${r.role}:${r.media_id}`),
            intent,
            record: !!record,
            changes: changes !== undefined,
          });
          return { recipeId: `r-${jobId}`, jobId, usd: 0.15 };
        },
      },
      watchEveryMs: 10,
      ...extra,
    });
    const { id } = store.create();
    await store.open(id);
    for (const text of [
      'a train board in my kitchen',
      'it said zikery, then I woke',
      'yes',
      'yes please',
      'the poster one',
      'yes, that is the kitchen',
    ])
      await store.message(id, text);
    await store.settle(id);
    await store.message(id, 'ooh');
    reaction.now = { sketch_reaction: pick('looks_right') };
    const toFrames = await store.message(id, 'both look right');
    expect([toFrames.move?.kind, toFrames.phase]).toEqual(['sheets_done', 'frames']);
    await store.settle(id, 3000);
    const frames = () => store.get(id)!.build!.frames!;
    return { store, id, started, verdicts, frames };
  }
  // The judge sees everything in every take, so the chat may approve a moment for what follows.
  const judge: StoreDeps['judge'] = async () => ({ questions: 3, passed: 3, failed: [], unseen: [] });

  test('three takes a moment: the judge keeps one in the queue, it becomes the picture, and what follows edits it', async () => {
    const queue = mkdtempSync(join(tmpdir(), 'dreamchat-takes-'));
    const requests: { takes: { id: string; image: string }[]; before: unknown; moment: string; said: string[] }[] = [];
    // The assistant, answering every pick request: it keeps the last take it is shown.
    const answering = setInterval(() => {
      for (const f of readdirSync(queue).filter((x) => x.startsWith('pick-') && !x.endsWith('.answer.json'))) {
        const r = JSON.parse(readFileSync(join(queue, f), 'utf8'));
        if (existsSync(r.answerFile)) continue;
        requests.push(r);
        const best = r.takes.at(-1).id;
        writeFileSync(
          r.answerFile,
          JSON.stringify({
            best,
            verdicts: Object.fromEntries(
              r.takes.map((t: { id: string }) => [t.id, t.id === best ? 'right' : 'partly']),
            ),
            reason: 'it reads at a glance',
          }),
        );
      }
    }, 10);
    const { store, id, started, verdicts, frames } = await drawn({
      takes: 3,
      judge,
      pick: (input) => assistantPick(input, { queue, waitMs: 5000, pollMs: 10 }),
    });
    clearInterval(answering);

    // Each moment drawn three ways: the cut's record and the correction written with the first take.
    for (const m of ['m1', 'm2']) {
      const mine = started.filter((x) => x.id === m);
      expect(mine.map((x) => x.intent)).toEqual(
        [1, 2, 3].map((k) => `Frame: ${frames().find((f) => f.id === m)!.name}, take ${k} of 3`),
      );
      expect(mine.map((x) => x.changes)).toEqual([true, false, false]);
      expect(mine.every((x) => x.record)).toBe(true);
    }
    const [m1, m2] = frames();
    expect(m1.takes!.map((t) => [t.n, t.way, t.status])).toEqual([
      [1, 'today', 'ready'],
      [2, 'free', 'ready'],
      [3, 'free', 'ready'],
    ]);
    // The kept take is the one the judge named; the others stay on the moment as alternates.
    expect(requests.map((r) => r.moment)).toEqual(['m1', 'm2']);
    const kept1 = m1.takes!.find((t) => t.id === requests[0].takes.at(-1)!.id)!;
    expect([m1.status, m1.mediaId, m1.mediaPath]).toEqual(['ready', kept1.mediaId, kept1.mediaPath]);
    expect(m1.pick).toEqual({ kept: kept1.id, judged: true, reason: 'it reads at a glance' });
    expect(m1.takes!.filter((t) => t !== kept1).every((t) => t.mediaId && t.verdict === 'partly')).toBe(true);
    // Only the kept take is approved in the engine.
    const takeMedia = m1.takes!.map((t) => t.mediaId);
    expect(verdicts.filter(([mid]) => takeMedia.includes(mid))).toEqual([[kept1.mediaId!, true]]);

    // The first request: what they said, the moment's line, no picture before, and the takes by letter.
    const first = requests[0];
    expect(first.before).toBeNull();
    expect(first.said).toEqual(
      store
        .get(id)!
        .transcript.filter((e) => e.role === 'user')
        .map((e) => e.content),
    );
    expect(first.takes.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(first.takes.every((t) => t.image.startsWith(join(STRAWBERRY_HOME, 'media')))).toBe(true);
    // The second moment's picture before is the first's kept take, and its take 2 edits that take.
    expect(requests[1].before).toEqual({
      moment: 'm1',
      line: m1.fields.action?.value ?? m1.name,
      image: join(STRAWBERRY_HOME, 'media', kept1.mediaPath!),
    });
    expect(m2.takes!.map((t) => t.way)).toEqual(['today', 'edit', 'free']);
    const m2started = started.filter((x) => x.id === 'm2');
    expect(m2started[1].refs[0]).toBe(`base:${kept1.mediaId}`);
    expect(m2started[0].refs).toContain(`composition:${kept1.mediaId}`);
    expect(
      m2started.every(
        (x) => !x.refs.some((r) => takeMedia.includes(r.split(':')[1]) && r.split(':')[1] !== kept1.mediaId),
      ),
    ).toBe(true);
    // Every take counts against the limit and the spend: two sketches and three takes of each moment.
    expect([store.get(id)!.images, store.get(id)!.spentUsd]).toEqual([8, 1.2]);
  });

  test('without a judge, take 1 is kept: today’s picture', async () => {
    const { started, frames, store, id } = await drawn({ takes: 3 });
    const [m1] = frames();
    expect(started.filter((x) => x.id === 'm1')).toHaveLength(3);
    const one = m1.takes!.find((t) => t.n === 1)!;
    expect([m1.status, m1.mediaId, m1.pick]).toEqual([
      'ready',
      one.mediaId,
      { kept: one.id, judged: false, reason: 'no judge here' },
    ]);
    // Today's prompt and images, as one take would have them.
    expect(started[0].refs).toEqual(started[2].refs);
    expect(store.get(id)!.images).toBe(5);
  });

  test('one take (the default) draws each moment once, exactly as before', async () => {
    const once = await drawn({ takes: 1, judge });
    const before = await drawn({ judge });
    expect(once.started.map((x) => x.id)).toEqual(['m1', 'm2']);
    expect(once.started).toEqual(before.started);
    expect(once.started.map((x) => x.intent)).toEqual([undefined, undefined]);
    for (const f of [...once.frames(), ...before.frames()]) {
      expect('takes' in f).toBe(false);
      expect('pick' in f).toBe(false);
    }
    expect(once.store.get(once.id)!.images).toBe(4);
  });
});
