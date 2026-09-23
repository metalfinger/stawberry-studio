import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import type { Answer, Question } from '../jev';
import type { Breakdown } from '../producer';
import { SessionStore } from '../session';
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
    let reaction: Record<string, Answer> = {};
    const statuses = new Map<string, string>();
    let replies = ['confirmed', 'changes'];
    const host = fakeHost();
    const store = new SessionStore(cfg, {
      jev: fakeJev((q) => {
        const out = script(q);
        if (q.profile_reply) out.profile_reply = pick(replies.shift() ?? 'confirmed');
        if (q.sketch_reaction) Object.assign(out, reaction);
        return out;
      }),
      host,
      producer: async () => ({ breakdown, downgraded: [], notes: [], ms: 1 }),
      write: async () => ({
        projectId: 'p',
        ids: { said: 'src-said', proposal: 'src-proposal', l1: 'node-l1', t1: 'node-t1' },
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
        status: async (jobId, nodeId) =>
          statuses.get(jobId) === 'ready'
            ? { state: 'ready', mediaId: `media-${nodeId}-${jobId}`, mediaPath: `${nodeId}.png` }
            : { state: 'running' },
        review: async ({ mediaId, approved }) => {
          verdicts.push([mediaId, approved]);
        },
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

    const t6 = await store.message(id, 'yes that is the kitchen');
    expect(t6.move).toEqual({ kind: 'confirm_profile', itemId: 't1' });
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      "you're sketching the kitchen now",
    );
    expect(started.map((x) => x.name)).toEqual(['the kitchen']);

    const t7 = await store.message(id, 'the board was enamelled tin, not metal slats');
    expect([t7.move?.kind, t7.phase]).toEqual(['build_done', 'review']);
    expect(started[1]).toEqual({
      name: 'the departure board',
      fields: { appearance: 'twenty black slats, all blank but one reading zikery', materials: 'enamelled tin' },
    });
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
    reaction = { sketch_reaction: pick('looks_right'), sketch_which: pick('l1') };
    const t9 = await store.message(id, 'the kitchen is perfect');
    expect(t9.move).toEqual({ kind: 'while_drawing' });
    reaction = { sketch_reaction: pick('not_right'), sketch_which: pick('t1') };
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
    reaction = { sketch_reaction: pick('no_reaction'), sketch_which: pick('unclear') };
    const t12 = await store.message(id, 'what happens next?');
    expect([t12.move?.kind, t12.phase]).toEqual(['sheets_done', 'frames']);
    expect(store.get(id)!.build!.items.map((i) => i.review)).toEqual(['approved', 'left']);
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
