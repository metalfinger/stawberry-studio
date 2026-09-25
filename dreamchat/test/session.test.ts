import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import type { Answer, Question } from '../jev';
import type { Breakdown } from '../producer';
import { SessionStore, type StoreDeps } from '../session';
import { fakeHost, fakeJev, noul, pick, told } from './fakes';

const cfg = dreamConfig();
const required = cfg.goals.filter((g) => !g.optional).map((g) => g.id);

describe('one turn at a time', () => {
  test('two messages sent at once both land, in order, each with its reply', async () => {
    const store = new SessionStore(cfg, { jev: fakeJev(), host: fakeHost(30) });
    const { id } = store.create();
    await store.open(id);
    const [a, b] = await Promise.all([store.message(id, 'first'), store.message(id, 'second')]);
    expect(a.messages).toHaveLength(1);
    expect(b.messages).toHaveLength(1);
    const roles = store.get(id)!.transcript.map((e) => (e.role === 'user' ? e.content : 'reply'));
    expect(roles).toEqual(['reply', 'first', 'reply', 'second', 'reply']);
  });

  test('opening twice at once greets once', async () => {
    const host = fakeHost(30);
    const store = new SessionStore(cfg, { jev: fakeJev(), host });
    const { id } = store.create();
    const [a, b] = await Promise.all([store.open(id), store.open(id)]);
    expect(host.calls).toHaveLength(1);
    expect([a.already, b.already]).toEqual([undefined, true]);
    expect(store.get(id)!.transcript).toHaveLength(1);
  });

  test('a failed reply leaves the conversation as it was, and the next turn still runs', async () => {
    let fail = true;
    const host = fakeHost();
    const store = new SessionStore(cfg, {
      jev: fakeJev(),
      host: async (m) => {
        if (fail) throw new Error('provider down');
        return host(m);
      },
    });
    const { id } = store.create();
    fail = false;
    await store.open(id);
    fail = true;
    await expect(store.message(id, 'lost')).rejects.toThrow('provider down');
    expect(store.get(id)!.transcript).toHaveLength(1);
    fail = false;
    await store.message(id, 'again');
    expect(store.get(id)!.transcript.map((e) => e.content)).toEqual(['(open_ended)', 'again', '(follow)']);
  });
});

describe('the retelling', () => {
  const allTold = (q: Record<string, Question>): Record<string, Answer> => {
    const out: Record<string, Answer> = { finished_telling: noul(0.9) };
    for (const id of required) Object.assign(out, told(id, 1));
    return out;
  };

  test('a reply that was not a retelling keeps the conversation listening', async () => {
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => (q.is_retelling ? { is_retelling: noul(0.1) } : allTold(q))),
      host: fakeHost(),
    });
    const { id } = store.create();
    await store.open(id);
    const r = await store.message(id, 'that is the whole dream');
    expect(r.move).toEqual({ kind: 'retell' });
    expect(r.phase).toBe('listen');
    expect(store.get(id)!.retells).toBe(0);
    expect(store.get(id)!.turns.at(-1)!.violations[0]).toContain('not a retelling');
  });

  test('the reply model sees only the newest brief, and thinks before a retelling', async () => {
    const host = fakeHost();
    const thinking: (string | undefined)[] = [];
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => (q.is_retelling ? { is_retelling: noul(0.9) } : allTold(q))),
      host: async (m, opts) => {
        thinking.push(opts?.thinking);
        return host(m);
      },
    });
    const { id } = store.create();
    await store.open(id);
    await store.message(id, 'that is the whole dream');
    const briefs = host.calls.at(-1)!.filter((m) => m.content.startsWith('<brief>'));
    expect(briefs).toHaveLength(1);
    expect(briefs[0].content).toContain('Move: retell.');
    expect(thinking).toEqual(['disabled', 'low']);
  });
});

describe('the dream goes on past the retelling', () => {
  const allTold = (): Record<string, Answer> => {
    const out: Record<string, Answer> = { finished_telling: noul(0.9) };
    for (const id of required) Object.assign(out, told(id, 1));
    return out;
  };

  test('"there was more" goes back to listening, and the rest alone is told back', async () => {
    const host = fakeHost();
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        if (q.is_retelling) return { is_retelling: noul(0.9) };
        if (q.goes_on) return { retell_reply: pick('added_more'), goes_on: noul(0.9) };
        return allTold();
      }),
      host,
    });
    const { id } = store.create();
    await store.open(id);
    expect((await store.message(id, 'that was on the bus')).move).toEqual({ kind: 'retell' });
    const back = await store.message(id, "that's right, but after the kitchen there was more");
    expect(back.move).toEqual({ kind: 'follow' });
    expect(back.phase).toBe('listen');
    expect(store.get(id)!.resumed).toEqual({ times: 1, at: 2 });
    expect(store.get(id)!.retells).toBe(0);
    const again = await store.message(id, 'the table became a boat, and then i woke up');
    expect(again.move).toEqual({ kind: 'retell' });
    const brief = host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content;
    expect(brief).toContain("just what they've told since then");
  });

  test('a change taken as it stands at the retell limit is drafted before the offer', async () => {
    const drafted: number[] = [];
    const breakdown = JSON.parse(
      readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8'),
    ) as Breakdown;
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        if (q.is_retelling) return { is_retelling: noul(0.9) };
        if (q.goes_on) return { retell_reply: pick('corrected'), goes_on: noul(0.1) };
        return allTold();
      }),
      host: fakeHost(),
      producer: async (t) => {
        drafted.push(t.filter((e) => e.role === 'user').length);
        return { breakdown, downgraded: [], notes: [], ms: 1 };
      },
    });
    const { id } = store.create();
    await store.open(id);
    await store.message(id, 'the whole dream');
    const moves: string[] = [];
    for (const text of ['no, it was blue', 'and she was older', 'and the lantern was blue'])
      moves.push((await store.message(id, text)).move?.kind ?? 'none');
    expect(moves).toEqual(['take_correction', 'take_correction', 'offer_visualize']);
    // The retelling, each correction, and the change taken as it stands.
    expect(drafted).toEqual([1, 2, 3, 4]);
  });
});

describe('a whole conversation', () => {
  const breakdown = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8')) as Breakdown;
  breakdown.style_options = [
    { ...breakdown.style_options[0], id: 'a', name: 'sumi ink and wash' },
    { ...breakdown.style_options[0], id: 'b', name: 'an old railway poster' },
  ];

  // Message indices in the transcript: 0 greeting, 1 first telling, 2 reply, 3 ending, then
  // the answers to the retelling, the offer and the style.
  const script = (q: Record<string, Question>): Record<string, Answer> => {
    if (q.is_retelling) return { is_retelling: noul(0.95) };
    // Not a turn's reading: a question about the pictures, answered inertly unless a test says.
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

  test('listen, tell it back, ask, choose how it looks, write the production', async () => {
    const written: { title: string; style: string }[] = [];
    const host = fakeHost();
    const store = new SessionStore(cfg, {
      jev: fakeJev(script),
      host,
      producer: async () => {
        await Bun.sleep(40);
        return { breakdown, downgraded: [], notes: [], ms: 40 };
      },
      write: async (b, style) => {
        written.push({ title: b.title, style: style.name });
        return {
          projectId: 'p',
          ids: {},
          home: '/tmp',
          created: { project: 1, scene: 1, shot: 2, cut: 2, character: 0, location: 1, prop: 1 },
          cuts: 2,
          readyCuts: 0,
          issues: [],
          ms: 1,
        };
      },
    });
    const { id } = store.create();
    await store.open(id);

    const t1 = await store.message(id, 'there was a train board in my kitchen');
    expect(t1.move).toEqual({ kind: 'follow' });

    const t2 = await store.message(id, 'it said zikery, and then I woke up');
    expect([t2.move?.kind, t2.phase]).toEqual(['retell', 'retell']);
    expect(store.get(id)!.draft?.status).toBe('drafting');

    const t3 = await store.message(id, 'yes that is it');
    expect([t3.move?.kind, t3.phase]).toEqual(['offer_visualize', 'offer']);

    const t4 = await store.message(id, 'yes please');
    expect([t4.move?.kind, t4.phase]).toEqual(['choose_style', 'style']);
    const styleBrief = host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content;
    expect(styleBrief).toContain('a) sumi ink and wash');
    expect(styleBrief).toContain('b) an old railway poster');

    const t5 = await store.message(id, 'the poster one');
    expect(t5.move).toEqual({ kind: 'start', styleId: 'b' });
    expect([t5.phase, t5.closed]).toEqual(['ready', true]);
    expect(store.get(id)!.style?.name).toBe('an old railway poster');

    await store.settle(id);
    expect(written).toEqual([{ title: 'The departure board', style: 'an old railway poster' }]);
    expect(store.get(id)!.production?.status).toBe('written');
    expect((await store.message(id, 'hello?')).refused).toBe(true);
  });

  test('a slow draft is waited for, and applied once', async () => {
    let drafts = 0;
    const store = new SessionStore(cfg, {
      jev: fakeJev(script),
      host: fakeHost(),
      producer: async () => {
        drafts += 1;
        await Bun.sleep(150);
        return { breakdown, downgraded: [], notes: [], ms: 150 };
      },
    });
    const { id } = store.create();
    await store.open(id);
    for (const text of ['a train board in my kitchen', 'it said zikery, then I woke', 'yes', 'yes please'])
      await store.message(id, text);
    const turn = store.get(id)!.turns.at(-1)!;
    expect(turn.move.kind).toBe('choose_style');
    expect(drafts).toBe(1);
    expect(store.get(id)!.draft?.status).toBe('ready');
    await store.settle(id);
    expect(store.get(id)!.draft?.basedOn).toBe(2);
  });

  test('no, thank you keeps the dream as told and draws nothing', async () => {
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => ({ ...script(q), ...(q.wants_to_see ? { wants_to_see: pick('no') } : {}) })),
      host: fakeHost(),
    });
    const { id } = store.create();
    await store.open(id);
    for (const text of ['a train board in my kitchen', 'it said zikery, then I woke', 'yes'])
      await store.message(id, text);
    const r = await store.message(id, "no thanks, I'd rather not");
    expect([r.move?.kind, r.phase, r.closed]).toEqual(['keep', 'kept', true]);
    expect(store.get(id)!.production).toBeNull();
  });

  test('after the style, each profile is confirmed in turn and its sketch drawn', async () => {
    const started: { name: string; fields: Record<string, string | null> }[] = [];
    const verdicts: [string, boolean][] = [];
    const framesStarted: { id: string; refs: string[] }[] = [];
    let reaction: Record<string, Answer> = {};
    const statuses = new Map<string, string>();
    // Each new version of a moment is a new take, with its own media id.
    const versions = new Map<string, number>();
    const judged: string[] = [];
    let replies = ['changes'];
    const host = fakeHost();
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        const out = script(q);
        if (q.profile_reply) out.profile_reply = pick(replies.shift() ?? 'confirmed');
        if (q.sketch_reaction || Object.keys(q).some((k) => k.startsWith('touches_'))) Object.assign(out, reaction);
        // A correction in this conversation names what is wrong ("too dark", "should be green").
        if (q.named) out.named = noul(0.9);
        return out;
      }),
      host,
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
      reviseItem: async (_name, fields) => ({ ...fields, materials: { value: 'enamelled tin', said: true } }),
      sheets: {
        start: async ({ item }) => {
          started.push({
            name: item.name,
            fields: Object.fromEntries(Object.entries(item.fields).map(([k, d]) => [k, d.value])),
          });
          statuses.set(`job-${item.id}`, 'running');
          return { recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 };
        },
        status: async (jobId, nodeId) => {
          const v = versions.get(jobId) ?? 1;
          return statuses.get(jobId) === 'ready'
            ? {
                state: 'ready',
                mediaId: `media-${nodeId}-${jobId}${v > 1 ? `-v${v}` : ''}`,
                mediaPath: `${nodeId}.png`,
              }
            : { state: 'running' };
        },
        review: async ({ mediaId, approved }) => {
          verdicts.push([mediaId, approved]);
        },
        retryCollection: async () => {},
        startFrame: async ({ item, references }) => {
          framesStarted.push({ id: item.id, refs: references.map((r) => `${r.role}:${r.media_id}`) });
          statuses.set(`job-${item.id}`, 'running');
          versions.set(`job-${item.id}`, item.version);
          return { recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 };
        },
      },
      // The judge sees everything in every take, so the chat may approve a moment for what follows.
      judge: async (mediaId) => {
        judged.push(mediaId);
        return { questions: 3, passed: 3, failed: [], unseen: [] };
      },
      watchEveryMs: 10,
    });
    const { id } = store.create();
    await store.open(id);
    for (const text of ['a train board in my kitchen', 'it said zikery, then I woke', 'yes', 'yes please'])
      await store.message(id, text);

    const t5 = await store.message(id, 'the poster one');
    expect([t5.move?.kind, t5.phase, t5.closed]).toEqual(['start', 'build', false]);
    const brief5 = host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content;
    expect(brief5).toContain('how you picture the kitchen');

    // The kitchen is changed; the board, a thing, is sketched with it without its own question.
    const t6 = await store.message(id, 'yes, but the kitchen had a checked floor');
    expect([t6.move?.kind, t6.phase]).toEqual(['build_done', 'review']);
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      "you're sketching the kitchen and the departure board now",
    );
    expect(started.map((x) => x.name)).toEqual(['the kitchen', 'the departure board']);
    expect(started[0].fields.materials).toBe('enamelled tin');
    const s = store.get(id)!;
    expect([s.images, s.build?.items.map((i) => i.status)]).toEqual([2, ['drawing', 'drawing']]);

    statuses.set('job-l1', 'ready');
    statuses.set('job-t1', 'ready');
    await store.settle(id);
    expect(store.get(id)!.build?.items.map((i) => [i.status, i.mediaId])).toEqual([
      ['ready', 'media-node-l1-job-l1'],
      ['ready', 'media-node-t1-job-t1'],
    ]);
    expect(store.get(id)!.spentUsd).toBe(0.3);

    const t8 = await store.message(id, 'ooh');
    expect(t8.move).toEqual({ kind: 'while_drawing' });
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      'the kitchen and the departure board are up on the right',
    );

    // The kitchen looks right; the board is wrong, so it is rejected and drawn again.
    reaction = { sketch_reaction: pick('looks_right'), ok_l1: noul(0.9) };
    const t9 = await store.message(id, 'the kitchen is perfect');
    expect(t9.move).toEqual({ kind: 'while_drawing' });
    reaction = { sketch_reaction: pick('not_right'), bad_t1: noul(0.9) };
    statuses.set('job-t1', 'running');
    const t10 = await store.message(id, 'the board should be green, not black');
    expect(t10.move).toEqual({ kind: 'while_drawing' });
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      "you're redrawing the departure board",
    );
    await store.settle(id, 50);
    expect(verdicts).toEqual([
      ['media-node-l1-job-l1', true],
      ['media-node-t1-job-t1', false],
    ]);
    const board = store.get(id)!.build!.items[1];
    expect([board.status, board.version, store.get(id)!.images]).toEqual(['drawing', 2, 3]);

    // Version 2 lands, is shown, and a quiet reply leaves it as drawn: every sketch is settled.
    statuses.set('job-t1', 'ready');
    await store.settle(id);
    reaction = {};
    await store.message(id, 'ok');
    reaction = { sketch_reaction: pick('no_reaction') };
    const t12 = await store.message(id, 'what happens next?');
    expect([t12.move?.kind, t12.phase]).toEqual(['sheets_done', 'frames']);
    expect(store.get(id)!.build!.items.map((i) => i.review)).toEqual(['approved', 'left']);

    // The moments, in story order by the continuity plan: the wide first, from the sheets. The
    // close-up of the slat waits for it, because it takes its room from it.
    await store.settle(id, 50);
    expect(framesStarted).toEqual([{ id: 'm1', refs: ['prop:media-node-t1-job-t1', 'location:media-node-l1-job-l1'] }]);
    expect(store.get(id)!.build!.plan!.cuts.map((c) => c.why)).toEqual([
      'the sheets alone',
      'picture 1 as composition',
    ]);
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    // The judge saw everything in the wide, so the chat approves it for continuity, and the
    // close-up is drawn from it: the board's sheet for the board, the kitchen's sheet for its
    // materials, and the wide for where everything is.
    expect(judged).toContain('media-cut-m1-job-m1');
    expect(verdicts.at(-1)).toEqual(['media-cut-m1-job-m1', true]);
    expect(framesStarted[1]).toEqual({
      id: 'm2',
      refs: ['prop:media-node-t1-job-t1', 'location:media-node-l1-job-l1', 'composition:media-cut-m1-job-m1'],
    });
    statuses.set('job-m2', 'ready');
    await store.settle(id);
    reaction = {};
    const t13 = await store.message(id, 'can I see them?');
    expect(t13.move).toEqual({ kind: 'frames_drawing' });
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      "The moment they said they'd pause on is up on the right now (The one slat that reads zikery)",
    );
    // Mixed: the key moment is right, the other one is wrong and is redrawn.
    reaction = { sketch_reaction: pick('not_right'), ok_m2: noul(0.9), bad_m1: noul(0.8) };
    statuses.set('job-m1', 'running');
    const t14 = await store.message(id, 'the slat one is exactly it, but the kitchen in the other is too dark');
    expect([t14.move?.kind, t14.phase]).toEqual(['frames_drawing', 'frames']);
    // The correction (the kitchen too dark) is not something the slat close-up took from the
    // wide, so it is kept.
    expect(store.get(id)!.build!.frames!.map((f) => [f.id, f.review ?? null, f.status, f.version])).toEqual([
      ['m1', null, 'drawing', 2],
      ['m2', 'approved', 'ready', 1],
    ]);
    statuses.set('job-m1', 'ready');
    await store.settle(id);
    reaction = {};
    await store.message(id, 'ok');
    // A correction the close-up did take from the wide (the room) redraws it too, once the new
    // wide is in, and the reply says so.
    reaction = { sketch_reaction: pick('not_right'), bad_m1: noul(0.9), touches_m2: noul(0.9) };
    statuses.set('job-m1', 'running');
    await store.message(id, 'the kitchen walls should be green');
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      'The one slat that reads zikery (it follows from The kitchen, with the board on the wall)',
    );
    expect(store.get(id)!.build!.frames!.map((f) => [f.id, f.status, f.version, f.redrawBecause ?? null])).toEqual([
      ['m1', 'drawing', 3, null],
      ['m2', 'waiting', 1, 'The kitchen, with the board on the wall'],
    ]);
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    expect(framesStarted.at(-1)).toEqual({
      id: 'm2',
      refs: ['prop:media-node-t1-job-t1', 'location:media-node-l1-job-l1', 'composition:media-cut-m1-job-m1-v3'],
    });
    statuses.set('job-m2', 'ready');
    await store.settle(id);
    reaction = {};
    await store.message(id, 'ok');
    // "They all look right", naming none, settles everything on show.
    reaction = { sketch_reaction: pick('looks_right') };
    const t16 = await store.message(id, 'yes, lovely');
    expect([t16.move?.kind, t16.phase, t16.closed]).toEqual(['all_done', 'done', true]);
    expect(store.get(id)!.images).toBe(8);
  });

  /** A conversation taken to the moments, with the engine and the judge faked as asked. */
  async function toTheMoments(judge?: StoreDeps['judge'], extra: Partial<StoreDeps> = {}) {
    const framesStarted: {
      id: string;
      refs: string[];
      prompt: string;
      record?: { fields: Record<string, unknown> };
    }[] = [];
    const verdicts: [string, boolean, string][] = [];
    const reaction: { now: Record<string, Answer> } = { now: {} };
    const statuses = new Map<string, string>();
    const versions = new Map<string, number>();
    const host = fakeHost();
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        const out = script(q);
        if (q.profile_reply) out.profile_reply = pick('confirmed');
        if (q.sketch_reaction) Object.assign(out, reaction.now);
        // A correction in these conversations names what is wrong.
        if (q.named) out.named = noul(0.9);
        return out;
      }),
      host,
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
        start: async ({ item }) => {
          statuses.set(`job-${item.id}`, 'running');
          return { recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 };
        },
        status: async (jobId, nodeId) => {
          const v = versions.get(jobId) ?? 1;
          return statuses.get(jobId) === 'ready'
            ? {
                state: 'ready',
                mediaId: `media-${nodeId}-${jobId}${v > 1 ? `-v${v}` : ''}`,
                mediaPath: `${nodeId}.png`,
              }
            : { state: 'running' };
        },
        review: async ({ mediaId, approved, author }) => {
          verdicts.push([mediaId, approved, author ?? 'human']);
        },
        retryCollection: async () => {},
        startFrame: async ({ item, references, prompt, record }) => {
          framesStarted.push({ id: item.id, refs: references.map((r) => `${r.role}:${r.media_id}`), prompt, record });
          statuses.set(`job-${item.id}`, 'running');
          versions.set(`job-${item.id}`, item.version);
          return { recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 };
        },
      },
      judge,
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
    ])
      await store.message(id, text);
    await store.message(id, 'yes, that is the kitchen');
    statuses.set('job-l1', 'ready');
    statuses.set('job-t1', 'ready');
    await store.settle(id);
    await store.message(id, 'ooh');
    reaction.now = { sketch_reaction: pick('looks_right') };
    const toFrames = await store.message(id, 'both look right');
    expect([toFrames.move?.kind, toFrames.phase]).toEqual(['sheets_done', 'frames']);
    await store.settle(id, 50);
    return { store, id, framesStarted, verdicts, statuses, host, reaction };
  }

  // The board's sketch is held on every reading, for what `reading` says; they are asked twice.
  async function askedTwice(reading: (question: string, prompt: string) => number) {
    const gate: StoreDeps['gate'] = async (state, questions) => ({
      questions,
      state,
      answers: Object.fromEntries(
        Object.keys(questions).map((k) => [
          k,
          {
            type: 'noul' as const,
            noul: reading(k, state),
          },
        ]),
      ),
      error: null,
      ms: 1,
      usage: null,
    });
    const statuses = new Map<string, string>();
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        const out = script(q);
        if (q.profile_reply) out.profile_reply = pick('confirmed');
        if (q.sketch_reaction) out.sketch_reaction = pick('looks_right');
        return out;
      }),
      host: fakeHost(),
      gate,
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
        start: async ({ item }) => {
          statuses.set(`job-${item.id}`, 'ready');
          return { recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 };
        },
        status: async (jobId, nodeId) =>
          statuses.get(jobId) === 'ready'
            ? { state: 'ready', mediaId: `media-${nodeId}`, mediaPath: `${nodeId}.png` }
            : { state: 'running' },
        review: async () => {},
        retryCollection: async () => {},
        startFrame: async ({ item }) => ({ recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 }),
      },
      watchEveryMs: 10,
    });
    const { id } = store.create();
    await store.open(id);
    for (const text of [
      'a train board in my kitchen',
      'it said zikery, then I woke',
      'yes',
      'yes please',
      'the poster one',
    ])
      await store.message(id, text);
    await store.message(id, 'yes, that is the kitchen');
    await store.settle(id, 200);
    const held = () => store.get(id)!.build!.items.find((i) => i.kind === 'prop')!;
    expect(held().held?.length).toBeGreaterThan(0);
    let phase = store.get(id)!.phase;
    for (let i = 0; i < 9 && phase === 'review'; i++) {
      phase = (await store.message(id, 'it is just a plain board, they look right')).phase;
      await store.settle(id, 200);
    }
    return { held, phase, store, id };
  }

  test('a sketch the gate still holds after two asks is left undrawn, and the moments begin', async () => {
    // Held on every reading: the board's sketch. Put through the gate again every turn, it once held
    // the sketches forty turns running and no moment was drawn (night market, 26 Sep).
    const { held, phase } = await askedTwice((k, prompt) =>
      k === 'contradicts' && /A single clear picture of/.test(prompt)
        ? 0.9
        : k === 'contradicts' || k === 'twice'
          ? 0.05
          : 0.9,
    );
    expect(held().status).toBe('failed');
    expect(held().error).toContain('not drawn');
    expect(phase).toBe('frames');
  });

  test('a sketch held only because its words leave it unclear is drawn on our guess after two asks', async () => {
    // The father, held for his age and build, took three moments with him (lighthouse, 26 Sep).
    const { held, phase } = await askedTwice((k, prompt) =>
      k === 'clear' && /A single clear picture of/.test(prompt)
        ? 0.3
        : k === 'contradicts' || k === 'twice'
          ? 0.05
          : 0.9,
    );
    expect(held().status).not.toBe('failed');
    expect(held().guessed).toBe(true);
    expect(held().overrode?.[0]).toContain('not clear enough to draw');
    expect(phase).toBe('frames');
  });

  test('without a judge, a moment drawn from another waits for their verdict on it', async () => {
    const { store, id, framesStarted, verdicts, statuses, host, reaction } = await toTheMoments();

    // The wide is drawn and lands; with no judge to vouch for it, the close-up drawn from it waits.
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    expect(framesStarted.map((f) => f.id)).toEqual(['m1']);
    expect(store.get(id)!.build!.frames!.map((f) => [f.id, f.status])).toEqual([
      ['m1', 'ready'],
      ['m2', 'waiting'],
    ]);

    // Shown, the reply says what carries on from it; their "looks right" lets the close-up go on.
    reaction.now = {};
    await store.message(id, 'can I see them?');
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      'The next moments carry on from The kitchen, with the board on the wall',
    );
    reaction.now = { sketch_reaction: pick('looks_right'), ok_m1: noul(0.9) };
    await store.message(id, 'yes, that is my kitchen');
    expect(verdicts.at(-1)).toEqual(['media-cut-m1-job-m1', true, 'human']);
    expect(framesStarted.at(-1)).toMatchObject({
      id: 'm2',
      refs: ['prop:media-node-t1-job-t1', 'location:media-node-l1-job-l1', 'composition:media-cut-m1-job-m1'],
    });
  });

  test('a moment they approve as soon as it is up counts, though Berry has not mentioned it yet', async () => {
    const { store, id, framesStarted, statuses, reaction } = await toTheMoments();
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    expect(store.get(id)!.build!.frames!.find((f) => f.id === 'm1')!.announced).toBeFalsy();
    // On the page it is there; they approve it by telling Berry to go ahead.
    reaction.now = { sketch_reaction: pick('looks_right'), ok_m1: noul(0.9) };
    await store.message(id, 'go ahead, i approve the generated image');
    expect(store.get(id)!.build!.frames!.find((f) => f.id === 'm1')!.review).toBe('approved');
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2']);
  });

  test('a moment the gate is unsure of is held, never paid for; reworded, it is read again and drawn', async () => {
    // Jev is sure of the sketches, and of a moment only once its words are put right.
    const reading = (state: string) =>
      !state.startsWith('One picture from the dream') || state.includes('REWORDED')
        ? { contradicts: 0.05, twice: 0.05, clear: 0.9, refs_clear: 0.9 }
        : { contradicts: 0.9, twice: 0.05, clear: 0.9, refs_clear: 0.9 };
    const gate: StoreDeps['gate'] = async (state, questions) => ({
      questions,
      state,
      answers: Object.fromEntries(
        Object.entries(reading(state)).map(([k, v]) => [k, { type: 'noul' as const, noul: v }]),
      ),
      error: null,
      ms: 1,
      usage: null,
    });
    const held = await toTheMoments(undefined, { gate });
    expect(held.framesStarted).toEqual([]);
    const m1 = held.store.get(held.id)!.build!.frames!.find((f) => f.id === 'm1')!;
    expect(m1.status).toBe('waiting');
    expect(m1.held?.[0]).toStartWith('its instructions may contradict each other (0.90)');

    const reworded = await toTheMoments(undefined, {
      gate,
      reword: async (_prompt, _findings, fields) => ({
        ...fields,
        visual_point: { value: 'REWORDED: the board on the wall', said: false },
      }),
    });
    expect(reworded.framesStarted.map((f) => f.id)).toEqual(['m1']);
    expect(reworded.framesStarted[0].prompt).toContain('REWORDED: the board on the wall');
    const m1r = reworded.store.get(reworded.id)!.build!.frames!.find((f) => f.id === 'm1')!;
    expect([m1r.held, m1r.reworded]).toEqual([undefined, ['visual_point']]);

    // Where it could have been planned again and still reads so after rewording, it is drawn, and
    // what held it is kept: five of eight such moments came out right (lighthouse, 26 Sep).
    const block: StoreDeps['block'] = async () => {
      throw new Error('no floor plan here');
    };
    const tried = await toTheMoments(undefined, { gate, block });
    expect(tried.framesStarted.map((f) => f.id)).toEqual(['m1']);
    const m1t = tried.store.get(tried.id)!.build!.frames!.find((f) => f.id === 'm1')!;
    expect(m1t.overrode?.[0]).toStartWith('its instructions may contradict each other (0.90)');
    process.env.DREAMCHAT_HELD = 'fail';
    try {
      const left = await toTheMoments(undefined, { gate, block });
      expect(left.framesStarted).toEqual([]);
      expect(left.store.get(left.id)!.build!.frames!.find((f) => f.id === 'm1')!.error).toContain('not drawn');
    } finally {
      delete process.env.DREAMCHAT_HELD;
    }
  });

  test('a moment the judge fails is drawn once more with what was wrong, then released on a pass', async () => {
    const judged: string[] = [];
    const { store, id, framesStarted, verdicts, statuses } = await toTheMoments(async (mediaId, opts) => {
      if (!opts?.facts) return null;
      judged.push(mediaId);
      // The first take of the wide has no board in it; the second has.
      return mediaId === 'media-cut-m1-job-m1'
        ? {
            questions: 4,
            passed: 3,
            failed: ['Is the departure board visible?'],
            failedIds: ['prop:node-t1'],
            unseen: ['Is the departure board visible?'],
          }
        : { questions: 4, passed: 4, failed: [], failedIds: [], unseen: [] };
    });
    statuses.set('job-m1', 'ready');
    await store.settle(id, 150);
    // Rejected as the assistant, and drawn again with the finding as its correction.
    expect(verdicts).toContainEqual(['media-cut-m1-job-m1', false, 'assistant']);
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm1']);
    // Said to the image model as an instruction, not as the judge's question.
    expect(framesStarted[1].prompt).toContain(
      'The last attempt at this frame got these wrong. Put each right:\n- the departure board must be clearly visible',
    );
    // The second take passes: approved for continuity on the judge's word, and the close-up goes on.
    statuses.set('job-m1', 'ready');
    await store.settle(id, 150);
    // The sketches were judged too, before anything was drawn from them.
    expect(judged).toEqual([
      'media-node-l1-job-l1',
      'media-node-t1-job-t1',
      'media-cut-m1-job-m1',
      'media-cut-m1-job-m1-v2',
    ]);
    expect(verdicts.at(-1)).toEqual(['media-cut-m1-job-m1-v2', true, 'assistant']);
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm1', 'm2']);
    expect(store.get(id)!.build!.frames![0]).toMatchObject({ repairs: 1, version: 2 });
    // What was wrong with the first take is not told to any later redraw.
    expect(store.get(id)!.build!.frames![0].repairFor).toBeUndefined();
  });

  test('a moment telling the dreamer "you" is put in the third person, and the dream keeps its words', async () => {
    const withYou = structuredClone(breakdown);
    withYou.scenes[0].moments[0].action = 'You see the board on your kitchen wall.';
    const { store, id, framesStarted, statuses } = await toTheMoments(undefined, {
      producer: async () => ({ breakdown: withYou, downgraded: [], notes: [], ms: 1 }),
      reword: async (_prompt, findings, fields) => ({
        ...fields,
        action: {
          value: findings[0].includes('third person') ? 'The dreamer sees the board on their kitchen wall.' : 'x',
          said: false,
        },
      }),
    });
    statuses.set('job-m1', 'ready');
    await store.settle(id, 50);
    expect(framesStarted[0].prompt).toContain(
      'What happens in this frame: The dreamer sees the board on their kitchen wall.',
    );
    const s = store.get(id)!;
    expect(s.build!.frames![0].reworded).toEqual(['action']);
    // Everything planned from the moment reads as its picture does, its record included.
    expect(s.draft!.breakdown!.scenes[0].moments[0].action).toBe('The dreamer sees the board on their kitchen wall.');
    expect(framesStarted[0].record?.fields.action).toBe('The dreamer sees the board on their kitchen wall.');
  });

  test('a moment the judge fails twice is never what follows is drawn from: it waits for them', async () => {
    const { store, id, framesStarted, verdicts, statuses } = await toTheMoments(async (_mediaId, opts) =>
      opts?.facts
        ? {
            questions: 4,
            passed: 3,
            failed: ['Is the departure board the one from its sketch?'],
            failedIds: ['prop:node-t1'],
            unseen: [],
          }
        : null,
    );
    statuses.set('job-m1', 'ready');
    await store.settle(id, 150);
    statuses.set('job-m1', 'ready');
    await store.settle(id, 150);
    // One repair, then no approval on the judge's word: the close-up is not drawn from it.
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm1']);
    expect(verdicts.filter(([, ok, author]) => ok && author === 'assistant')).toEqual([]);
    const m1 = store.get(id)!.build!.frames![0];
    expect([!!m1.continuityApproved, m1.waitsForPerson]).toEqual([
      false,
      'the judge found: Is the departure board the one from its sketch?',
    ]);
  });

  test('each probe is counted, and a goal is asked at most twice', async () => {
    const store = new SessionStore(cfg, {
      jev: fakeJev(() => ({ ...told('telling', 1), finished_telling: noul(0.9) })),
      host: fakeHost(),
    });
    const { id } = store.create();
    await store.open(id);
    const moves: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await store.message(id, `answer ${i}`);
      moves.push(r.move?.kind === 'probe_goal' ? r.move.goalId : (r.move?.kind ?? ''));
    }
    expect(moves).toEqual(['places', 'places', 'people', 'people', 'you_in_it']);
    expect(store.get(id)!.askCounts).toEqual({ places: 2, people: 2, you_in_it: 1 });
  });
});
