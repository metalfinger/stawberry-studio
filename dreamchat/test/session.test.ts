import { describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dreamConfig } from '../dream';
import type { Answer, Question } from '../jev';
import type { Breakdown } from '../producer';
import { printDiff, sheetPrint } from '../cutsheet';
import { imageName, rebuild } from '../plan';
import { readJevLog } from '../jevlog';
import { sha } from '../gate';
import * as asdrawn from '../asdrawn';
import { staleRoute } from '../routes';
import { SessionStore, type StoreDeps } from '../session';
import { fakeHost, fakeJev, noul, pick, told, withChecks, withRouted } from './fakes';

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
  // Asked about first, as before (DREAMCHAT_SKETCH_HELD=ask): by default a held sketch is drawn.
  async function askedTwice(reading: (question: string, prompt: string) => number) {
    return withChecks('act', () => askedTwiceActing(reading));
  }
  async function askedTwiceActing(reading: (question: string, prompt: string) => number) {
    process.env.DREAMCHAT_SKETCH_HELD = 'ask';
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
    const records = new Map<string, Record<string, unknown>>();
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
        startFrame: async ({ item, record }) => {
          records.set(item.id, record?.fields ?? {});
          return { recipeId: `r-${item.id}`, jobId: `job-${item.id}`, usd: 0.15 };
        },
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
    await store.settle(id, 200);
    delete process.env.DREAMCHAT_SKETCH_HELD;
    return { held, phase, store, id, records };
  }

  test('a sketch the gate still holds after two asks is left undrawn, and the moments begin', async () => {
    // Held on every reading: the board's sketch. Put through the gate again every turn, it once held
    // the sketches forty turns running and no moment was drawn (night market, 26 Sep).
    const { held, phase, records } = await askedTwice((k, prompt) =>
      k === 'contradicts' && /A single clear picture of/.test(prompt)
        ? 0.9
        : k === 'contradicts' || k === 'twice'
          ? 0.05
          : 0.9,
    );
    expect(held().status).toBe('failed');
    expect(held().error).toContain('not drawn');
    expect(phase).toBe('frames');
    // The moments are drawn with the board in words only: kept among its things, the engine refuses
    // a moment whose sketch is missing (the father, lighthouse, 26 Sep).
    expect(records.get('m1')?.required_props).toEqual([]);
  });

  test('by default a sketch still held after rewording is drawn at once, with what held it kept', async () => {
    // "Was the yellow paint fresh, or a little worn?": never asked; the dreamer sees the sketch.
    const gate: StoreDeps['gate'] = async (state, questions) => ({
      questions,
      state,
      answers: Object.fromEntries(
        Object.keys(questions).map((k) => [
          k,
          {
            type: 'noul' as const,
            noul:
              k === 'contradicts' && /A single clear picture of/.test(state)
                ? 0.9
                : k === 'contradicts' || k === 'twice'
                  ? 0.05
                  : 0.9,
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
    const board = store.get(id)!.build!.items.find((i) => i.kind === 'prop')!;
    expect(board.held).toBeUndefined();
    expect(board.status).not.toBe('failed');
    expect(board.overrode?.[0]).toStartWith('its instructions may contradict each other');
  });

  test('with the checks only logging, a sketch the gate is unsure of is drawn at once as told, never reworded or asked about', () =>
    withChecks('log', async () => {
      process.env.DREAMCHAT_SKETCH_HELD = 'ask';
      try {
        const gate: StoreDeps['gate'] = async (state, questions) => ({
          questions,
          state,
          answers: Object.fromEntries(
            Object.keys(questions).map((k) => [
              k,
              {
                type: 'noul' as const,
                noul:
                  k === 'clear' && /A single clear picture of/.test(state)
                    ? 0.3
                    : k === 'contradicts' || k === 'twice'
                      ? 0.05
                      : 0.9,
              },
            ]),
          ),
          error: null,
          ms: 1,
          usage: null,
        });
        let reworded = 0;
        const started: string[] = [];
        const statuses = new Map<string, string>();
        const store = new SessionStore(cfg, {
          jev: fakeJev((q) => {
            const out = script(q);
            if (q.profile_reply) out.profile_reply = pick('confirmed');
            return out;
          }),
          host: fakeHost(),
          gate,
          rewordLook: async () => {
            reworded++;
            return null;
          },
          producer: async () => ({ breakdown, downgraded: [], notes: [], ms: 1 }),
          write: async () => ({
            projectId: 'p',
            ids: {
              said: 'src-said',
              proposal: 'src-proposal',
              l1: 'node-l1',
              t1: 'node-t1',
              m1: 'cut-m1',
              m2: 'cut-m2',
            },
            home: '/tmp',
            created: { project: 1, scene: 1, shot: 2, cut: 2, character: 0, location: 1, prop: 1 },
            cuts: 2,
            readyCuts: 0,
            issues: [],
            ms: 1,
          }),
          sheets: {
            start: async ({ item }) => {
              started.push(item.id);
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
        const items = store.get(id)!.build!.items;
        expect(started.sort()).toEqual(['l1', 't1']);
        expect(reworded).toBe(0);
        for (const it of items)
          expect([it.id, it.held, it.heldAsks, it.status]).toEqual([it.id, undefined, undefined, 'ready']);
        // The board's reading would have held it: kept on it, as what the check found.
        expect(items.find((i) => i.id === 't1')!.overrode).toEqual([
          'what it shows is not clear enough to draw (0.30)',
        ]);
        expect(items.find((i) => i.id === 'l1')!.overrode).toBeUndefined();
      } finally {
        delete process.env.DREAMCHAT_SKETCH_HELD;
      }
    }));

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

  test('a moment Berry has not put to them yet is approved only once a reply has', async () => {
    const { store, id, framesStarted, statuses, reaction, host } = await toTheMoments();
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    const m1 = () => store.get(id)!.build!.frames!.find((f) => f.id === 'm1')!;
    expect(m1().announced).toBeFalsy();
    // On the page, but never named to them: "waiting is fine." read as approving it approved a
    // moment of the moon market Berry had never shown them (26 Sep). It waits, and the reply names it.
    reaction.now = { sketch_reaction: pick('looks_right'), ok_m1: noul(0.9) };
    await store.message(id, 'waiting is fine.');
    expect(m1().review).toBeUndefined();
    expect(framesStarted.map((f) => f.id)).toEqual(['m1']);
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      'More of the dream is up on the right (The kitchen, with the board on the wall)',
    );
    // Put to them now, their word on it counts, and the close-up is drawn from it.
    await store.message(id, 'go ahead, i approve the generated image');
    expect(m1().review).toBe('approved');
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2']);
  });

  test('with the cut sheet in shadow, each moment keeps the sheet it was sent with, and a rebuild gives the same', async () => {
    const was = process.env.DREAMCHAT_CUT_SHEET;
    process.env.DREAMCHAT_CUT_SHEET = 'shadow';
    try {
      const { store, id, statuses, framesStarted } = await toTheMoments(async () => ({
        questions: 3,
        passed: 3,
        failed: [],
        unseen: [],
      }));
      statuses.set('job-m1', 'ready');
      await store.settle(id, 100);
      statuses.set('job-m2', 'ready');
      await store.settle(id, 100);
      expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2']);
      const s = store.get(id)!;
      const r = rebuild(s);
      for (const f of s.build!.frames!.filter((x) => x.kind === 'cut')) {
        expect(f.sentSheet?.hash).toMatch(/^[0-9a-f]+$/);
        const p = r.pictures.find((x) => x.id === f.id)!;
        const again = sheetPrint(p.sheet!, (m) => imageName(r, m), { earlier: f.sentSheet!.earlier });
        expect(printDiff(f.sentSheet!, again)).toEqual([]);
        // Its images left as the rebuild's stand-ins, the same sheet does not match what was sent.
        expect(
          printDiff(
            f.sentSheet!,
            sheetPrint(p.sheet!, (m) => m),
          ),
        ).toContain('inView');
      }
      // The close-up was sent with the wide as an earlier picture, and the rebuild names it the same.
      expect(s.build!.frames!.find((f) => f.id === 'm2')!.sentSheet!.earlier).toEqual(['m1']);
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_CUT_SHEET;
      else process.env.DREAMCHAT_CUT_SHEET = was;
    }
  });

  /** Runs `fn` with DREAMCHAT_AS_DRAWN as given, and puts the switch back after. */
  async function withAsDrawn<T>(mode: 'on' | 'off', fn: () => Promise<T>): Promise<T> {
    const was = process.env.DREAMCHAT_AS_DRAWN;
    if (mode === 'on') process.env.DREAMCHAT_AS_DRAWN = 'on';
    else delete process.env.DREAMCHAT_AS_DRAWN;
    try {
      return await fn();
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_AS_DRAWN;
      else process.env.DREAMCHAT_AS_DRAWN = was;
    }
  }

  test('S9: each picture keeps what it was sent and drawn from, and a rebuild reading it gives it as sent', () =>
    withAsDrawn('on', async () => {
      const { store, id, statuses, framesStarted } = await toTheMoments(async () => ({
        questions: 3,
        passed: 3,
        failed: [],
        unseen: [],
      }));
      statuses.set('job-m1', 'ready');
      await store.settle(id, 100);
      statuses.set('job-m2', 'ready');
      await store.settle(id, 100);
      const s = store.get(id)!;
      const [m1, m2] = s.build!.frames!;
      for (const [f, sent] of [
        [m1, framesStarted[0]],
        [m2, framesStarted[1]],
      ] as const) {
        const rec = f.asDrawn!.find((t) => t.take === f.version)!;
        expect(rec.prompt).toBe(sent.prompt);
        expect(rec.references.map((r) => `${r.role}:${r.media}`)).toEqual(sent.refs);
        expect(rec.moment?.fields).toEqual(f.fields);
        expect(rec.dream?.keys).toEqual(rec.keys);
      }
      // The close-up names the wide it was drawn from, and the take it was.
      expect(m2.asDrawn![0].from.find((x) => x.kind === 'cut')).toMatchObject({ id: 'm1', take: 1 });
      expect(m2.asDrawn![0].references.map((r) => r.name)).toEqual([
        'sketch:t1 take 1',
        'sketch:l1 take 1',
        'picture:m1 take 1',
      ]);
      // The sketches and the look, kept once for the dream.
      expect(Object.keys(s.build!.copies!.sketches)).toHaveLength(2);
      expect(Object.keys(s.build!.copies!.looks)).toHaveLength(1);
      // Nothing has changed since: nothing is stale, nothing was drawn behind the dream.
      const report = { checked: ['m1', 'm2'], unrecorded: [], unknown: [], stale: [], behind: [] };
      expect(store.stale(id)).toEqual(report);
      // Served at /api/stale.
      const served = staleRoute(store, new URL(`http://localhost/api/stale?id=${id}`))!;
      expect([served.status, await served.json()]).toEqual([200, report]);
      expect(staleRoute(store, new URL('http://localhost/api/stale?id=nobody'))!.status).toBe(404);
      expect(staleRoute(store, new URL(`http://localhost/api/tree?id=${id}`))).toBeNull();
      // A rebuild reading the records gives each as sent, word for word and image for image.
      const r = rebuild(s, { asDrawn: true });
      for (const [i, sent] of framesStarted.entries()) {
        const p = r.pictures.find((x) => x.id === sent.id)!;
        expect(p.asDrawn).toBe(true);
        expect(p.prompt).toBe(sent.prompt);
        expect(p.references.map((x) => imageName(r, x.media_id))).toEqual(
          s.build!.frames![i].asDrawn![0].references.map((x) => x.name.replace(/ take \d+$/, '')),
        );
      }
    }));

  test('S9: a correction to a moment makes stale exactly what was drawn from it and kept, never acting on it', () =>
    withAsDrawn('on', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dreamchat-s9-'));
      const told = 'The kitchen, with the board on the wall';
      const corrected = 'The kitchen at night, with the board on the wall';
      const { store, id, statuses, reaction, framesStarted } = await toTheMoments(
        async () => ({ questions: 3, passed: 3, failed: [], unseen: [] }),
        {
          dir,
          // Their correction rewords the wide's action, as the harness revises a moment they corrected.
          reviseItem: async (_name, fields) =>
            fields.action?.value === told ? { ...fields, action: { value: corrected, said: true } } : fields,
        },
      );
      statuses.set('job-m1', 'ready');
      await store.settle(id, 100);
      statuses.set('job-m2', 'ready');
      await store.settle(id, 100);
      reaction.now = {};
      await store.message(id, 'can I see them?');
      // The wide is wrong; the correction is read as not touching what the close-up took from it,
      // so the close-up is kept, as before S9: nothing here acts on staleness.
      reaction.now = { sketch_reaction: pick('not_right'), bad_m1: noul(0.9), ok_m2: noul(0.9) };
      statuses.set('job-m1', 'running');
      await store.message(id, 'the kitchen in the wide is too dark');
      const frames = () => store.get(id)!.build!.frames!;
      expect(frames().map((f) => [f.id, f.status, f.version])).toEqual([
        ['m1', 'drawing', 2],
        ['m2', 'ready', 1],
      ]);
      // While the wide is drawn again, the close-up is stale: the take it was drawn from is not the wide's now.
      const during = store.stale(id)!;
      expect(during.stale.map((x) => x.id)).toEqual(['m2']);
      expect(during.stale[0].reasons.map((x) => [x.kind, x.input])).toEqual([['earlier', 'earlier:m1']]);
      statuses.set('job-m1', 'ready');
      await store.settle(id, 100);
      // The new wide keeps its own record; the close-up, drawn from the wide's first take, is still stale.
      const after = store.stale(id)!;
      expect(after.checked).toEqual(['m1', 'm2']);
      expect(after.stale).toEqual([
        {
          id: 'm2',
          kind: 'cut',
          take: 1,
          reasons: [{ kind: 'earlier', input: 'earlier:m1', then: 'picture:m1 take 1', now: 'picture:m1 take 2' }],
        },
      ]);
      expect(frames()[0].asDrawn!.map((t) => t.take)).toEqual([1, 2]);
      // The wide's new take keeps the words it was drawn from: their correction. The breakdown keeps the
      // words as first told (a correction patches the moment it redraws, not the breakdown: car-park m4 of
      // S2's replays), so a rebuild of the dream as it stands reads the old words; one reading the record
      // gives the wide as it was sent.
      const s = store.get(id)!;
      expect(frames()[0].asDrawn![1].moment?.fields.action?.value).toBe(corrected);
      expect(s.draft!.breakdown!.scenes.flatMap((sc) => sc.moments).find((m) => m.id === 'm1')!.action).toBe(told);
      const sent = framesStarted.at(-1)!;
      expect(sent.prompt).toContain(corrected);
      expect(rebuild(s, { asDrawn: true }).pictures.find((p) => p.id === 'm1')!.prompt).toBe(sent.prompt);
      const asItStands = rebuild(s, { asDrawn: false }).pictures.find((p) => p.id === 'm1')!.prompt;
      expect(asItStands).not.toBe(sent.prompt);
      expect(asItStands).toContain(told);
      // Reported, never acted on: the close-up is not drawn again.
      expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2', 'm1']);
      expect(frames()[1]).toMatchObject({ status: 'ready', version: 1 });
      // And logged: the picture, and why.
      const logged = readJevLog(dir, id).filter((e) => e.kind === 'transition' && e.stage === 'as_drawn');
      expect(logged.some((e) => e.kind === 'transition' && e.moment === 'm2' && e.decision === 'stale')).toBe(true);
      expect(logged.at(-1)).toMatchObject({ decision: 'checked', reason: expect.stringContaining('1 stale (m2)') });
    }));

  test('S9: with the switch off nothing is kept and nothing is reported stale', () =>
    withAsDrawn('off', async () => {
      const { store, id, statuses } = await toTheMoments(async () => ({
        questions: 3,
        passed: 3,
        failed: [],
        unseen: [],
      }));
      statuses.set('job-m1', 'ready');
      await store.settle(id, 100);
      const s = store.get(id)!;
      expect(s.build!.frames!.map((f) => f.asDrawn)).toEqual([undefined, undefined]);
      expect(s.build!.copies).toBeUndefined();
      expect(store.stale(id)).toEqual({ checked: [], unrecorded: ['m1'], unknown: [], stale: [], behind: [] });
    }));

  test('S9: a record that cannot be made is logged, and the picture drawn without it', () =>
    withAsDrawn('on', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dreamchat-s9-'));
      const spy = spyOn(asdrawn, 'recordMoment').mockImplementation(() => {
        throw new Error('no record here');
      });
      try {
        const { store, id, statuses, framesStarted } = await toTheMoments(
          async () => ({ questions: 3, passed: 3, failed: [], unseen: [] }),
          { dir },
        );
        statuses.set('job-m1', 'ready');
        await store.settle(id, 100);
        expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2']);
        expect(store.get(id)!.build!.frames!.map((f) => f.asDrawn)).toEqual([undefined, undefined]);
        const failed = readJevLog(dir, id).filter(
          (e) => e.kind === 'transition' && e.stage === 'as_drawn' && e.decision === 'failed',
        );
        expect(failed.map((e) => (e.kind === 'transition' ? [e.moment, e.reason] : []))).toEqual([
          ['m1', 'no record kept: Error: no record here'],
          ['m2', 'no record kept: Error: no record here'],
        ]);
      } finally {
        spy.mockRestore();
      }
    }));

  test('settle waits for a verdict being asked for: what is drawn from its take is started', async () => {
    // A judge that takes a while: before, settle returned with the wide landed and unjudged, and the
    // close-up drawn from it never started (a redraw under load, 27 Sep).
    const { store, id, statuses, framesStarted } = await toTheMoments(async () => {
      await Bun.sleep(300);
      return { questions: 3, passed: 3, failed: [], unseen: [] };
    });
    statuses.set('job-m1', 'ready');
    await store.settle(id, 5000);
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2']);
  });

  test("S9's fresh send: words reworded into the third person stay the dreamer's where the breakdown says so", async () => {
    const was = process.env.DREAMCHAT_FRESH_SEND;
    const draw = async (fresh: boolean) => {
      if (fresh) process.env.DREAMCHAT_FRESH_SEND = 'on';
      else delete process.env.DREAMCHAT_FRESH_SEND;
      // The kitchen told as "you", and put in the third person before it is drawn.
      const told = structuredClone(breakdown);
      told.scenes[0].moments[0].action = 'You stand in the kitchen, with a red board on the wall';
      const { store, id, framesStarted } = await toTheMoments(undefined, {
        producer: async () => ({ breakdown: told, downgraded: [], notes: [], ms: 1 }),
        reword: async (_prompt, _findings, fields) => ({
          ...fields,
          action: { value: 'The dreamer stands in the kitchen, with a red board on the wall', said: false },
        }),
      });
      const m1 = store.get(id)!.build!.frames!.find((f) => f.id === 'm1')!;
      const prompt = framesStarted.find((f) => f.id === 'm1')!.prompt;
      return {
        said: m1.fields.action?.said,
        prompt,
        colours: prompt.split('\n').find((l) => l.startsWith('Colours:')),
      };
    };
    try {
      const off = await draw(false);
      const on = await draw(true);
      // Off, as before: reworded, the action is no longer said, and its colour is no longer the dream's own.
      expect(off.prompt).toContain('The dreamer stands in the kitchen, with a red board on the wall');
      expect(off.said).toBe(false);
      expect(off.colours).not.toContain('red board');
      // On: still the dreamer's words, their colour kept exactly.
      expect(on.said).toBe(true);
      expect(on.colours).toContain('red board');
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_FRESH_SEND;
      else process.env.DREAMCHAT_FRESH_SEND = was;
    }
  });

  test('a reaction naming no picture is about what the last reply put to them, never an earlier one', async () => {
    // The judge vouches for every take, so the close-up is drawn from the wide before their word.
    const { store, id, statuses, reaction, host } = await toTheMoments(async () => ({
      questions: 3,
      passed: 3,
      failed: [],
      unseen: [],
    }));
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    await store.message(id, 'can I see them?');
    statuses.set('job-m2', 'ready');
    await store.settle(id, 100);
    const reviews = () => store.get(id)!.build!.frames!.map((f) => [f.id, f.review ?? null]);
    // They speak of the close-up before Berry has put it to them: nothing is approved, the wide
    // included, and the reply puts the close-up to them.
    reaction.now = { sketch_reaction: pick('looks_right'), ok_m2: noul(0.9) };
    await store.message(id, 'the slat one is lovely');
    expect(reviews()).toEqual([
      ['m1', null],
      ['m2', null],
    ]);
    expect(host.calls.at(-1)!.find((m) => m.content.startsWith('<brief>'))!.content).toContain(
      "The moment they said they'd pause on is up on the right now (The one slat that reads zikery)",
    );
    // "Alright." answers that reply alone: the wide, put to them a reply earlier, still waits for
    // their word (desert station, 26 Sep).
    reaction.now = { sketch_reaction: pick('looks_right') };
    const t = await store.message(id, 'Alright.');
    expect(reviews()).toEqual([
      ['m1', null],
      ['m2', 'approved'],
    ]);
    expect(t.move).toEqual({ kind: 'frames_drawing' });
  });

  test('a moment the gate is unsure of is held, never paid for; reworded, it is read again and drawn', () =>
    withChecks('act', async () => {
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
      // Reworded and still held, it is drawn from its words as told: a rewording the gate still held
      // walked a third person into the snow (snow train, 26 Sep).
      const stubborn: StoreDeps['gate'] = async (state, questions) =>
        gate(state.startsWith('One picture from the dream') ? state.replace(/REWORDED/g, 'still') : state, questions);
      const kept = await toTheMoments(undefined, {
        gate: stubborn,
        block,
        reword: async (_prompt, _findings, fields) => ({
          ...fields,
          action: { value: 'REWORDED: a third person walks in', said: false },
        }),
      });
      expect(kept.framesStarted.map((f) => f.id)).toEqual(['m1']);
      expect(kept.framesStarted[0].prompt).not.toContain('a third person');
      const m1k = kept.store.get(kept.id)!.build!.frames!.find((f) => f.id === 'm1')!;
      expect(m1k.reworded).toBeUndefined();
      expect(m1k.overrode?.length).toBeGreaterThan(0);
      process.env.DREAMCHAT_HELD = 'fail';
      try {
        const left = await toTheMoments(undefined, { gate, block });
        expect(left.framesStarted).toEqual([]);
        expect(left.store.get(left.id)!.build!.frames!.find((f) => f.id === 'm1')!.error).toContain('not drawn');
      } finally {
        delete process.env.DREAMCHAT_HELD;
      }
    }));

  test('with the checks only logging, a moment the gate is unsure of is drawn at once as told, what it found kept and logged', () =>
    withChecks('log', async () => {
      // The gate reads every moment as contradicting itself, and would hold it, reword it and plan it again.
      const gate: StoreDeps['gate'] = async (state, questions) => ({
        questions,
        state,
        answers: Object.fromEntries(
          Object.keys(questions).map((k) => [
            k,
            {
              type: 'noul' as const,
              noul:
                state.startsWith('One picture from the dream') && k === 'contradicts'
                  ? 0.9
                  : k === 'contradicts' || k === 'twice'
                    ? 0.05
                    : 0.9,
            },
          ]),
        ),
        error: null,
        ms: 1,
        usage: null,
      });
      let reworded = 0;
      let planned = 0;
      const dir = mkdtempSync(join(tmpdir(), 'checks-log-'));
      const run = await toTheMoments(undefined, {
        gate,
        dir,
        block: async (b) => {
          planned++;
          return { breakdown: b, notes: [] };
        },
        reword: async (_prompt, _findings, fields) => {
          reworded++;
          return { ...fields, action: { value: 'REWORDED', said: false } };
        },
      });
      const plannedBefore = planned;
      run.statuses.set('job-m1', 'ready');
      await run.store.settle(run.id, 100);
      expect(run.framesStarted.map((f) => f.id)).toEqual(['m1']);
      expect(run.framesStarted[0].prompt).not.toContain('REWORDED');
      expect(reworded).toBe(0);
      expect(planned).toBe(plannedBefore);
      const m1 = run.store.get(run.id)!.build!.frames!.find((f) => f.id === 'm1')!;
      expect([m1.held, m1.reworded, m1.status]).toEqual([undefined, undefined, 'ready']);
      expect(m1.overrode?.[0]).toStartWith('its instructions may contradict each other (0.90)');
      // Its reading is logged with its bars; nothing a check did is.
      const log = readJevLog(dir, run.id);
      const read = log.find((e) => e.kind === 'transition' && e.stage === 'gate' && e.moment === 'm1');
      // The gate's own readings (routed, DREAMCHAT_JEV_ROUTED=on, its library questions are logged beside them).
      const gateOwn = (f: { question: string }) => !f.question.startsWith('r_');
      expect(
        read?.kind === 'transition' && [
          read.decision,
          read.facts.filter(gateOwn).map((f) => [f.question, f.answer, f.ok]),
        ],
      ).toEqual([
        'logged',
        [
          ['contradicts', 0.9, false],
          ['twice', 0.05, true],
          ['clear', 0.9, true],
          ['refs_clear', 0.9, true],
        ],
      ]);
      expect(log.filter((e) => e.kind === 'transition' && e.stage === 'check')).toEqual([]);
      // The sketches' readings are logged too.
      expect(log.some((e) => e.kind === 'transition' && e.stage === 'gate' && e.moment === 'l1')).toBe(true);
      // Pinned to what was read: the prompt sent, the take, the questions as worded; and kept per take.
      expect(read?.kind === 'transition' && read.ref).toEqual({
        prompt: sha(run.framesStarted[0].prompt),
        version: 1,
        questions: expect.stringMatching(/^[0-9a-f]{16}$/),
      });
      expect(m1.checkedTakes).toEqual([
        { version: 1, prompt: sha(run.framesStarted[0].prompt), gate: m1.gate, overrode: m1.overrode },
      ]);
    }));

  test('routed, a moment the gate is unsure of is drawn as told, its tags asked about in the same call; an earned check acts', async () => {
    // The gate reads every moment as contradicting itself; every library question it is asked is a problem.
    let calls = 0;
    const gate: StoreDeps['gate'] = async (state, questions) => {
      if (state.startsWith('One picture from the dream')) calls++;
      return {
        questions,
        state,
        answers: Object.fromEntries(
          Object.keys(questions).map((k) => [
            k,
            {
              type: 'noul' as const,
              noul:
                state.startsWith('One picture from the dream') && k === 'contradicts'
                  ? 0.9
                  : k === 'contradicts' || k === 'twice'
                    ? 0.05
                    : 0.9,
            },
          ]),
        ),
        error: null,
        ms: 1,
        usage: null,
      };
    };
    let reworded = 0;
    let planned = 0;
    const deps = (dir?: string) => ({
      gate,
      ...(dir ? { dir } : {}),
      block: async (b: Parameters<NonNullable<StoreDeps['block']>>[0]) => {
        planned++;
        return { breakdown: b, notes: [] };
      },
      reword: async (_p: string, _f: string[], fields: Record<string, { value: string | null; said: boolean }>) => {
        reworded++;
        return { ...fields, action: { value: 'REWORDED', said: false } };
      },
    });
    const dir = mkdtempSync(join(tmpdir(), 'checks-routed-'));
    const run = await withRouted(true, () => toTheMoments(undefined, deps(dir) as Partial<StoreDeps>));
    expect(run.framesStarted.map((f) => f.id)).toEqual(['m1']);
    expect(run.framesStarted[0].prompt).not.toContain('REWORDED');
    expect([reworded, calls]).toEqual([0, 1]);
    const m1 = run.store.get(run.id)!.build!.frames!.find((f) => f.id === 'm1')!;
    expect([m1.held, m1.reworded]).toEqual([undefined, undefined]);
    expect(m1.overrode?.[0]).toStartWith('its instructions may contradict each other (0.90)');
    // Its tags' questions were asked with the gate's and logged with their bars; nothing a check did is.
    const log = readJevLog(dir, run.id);
    const read = log.find((e) => e.kind === 'transition' && e.stage === 'gate' && e.moment === 'm1');
    expect(read?.kind === 'transition' && read.decision).toBe('logged');
    const routed = read?.kind === 'transition' ? read.facts.filter((f) => f.question.startsWith('r_')) : [];
    expect(routed.map((f) => f.question)).toContain('r_gone_drawn');
    expect(m1.overrode?.some((f) => f.startsWith('the prompt may draw something it says is gone'))).toBe(true);
    expect(log.filter((e) => e.kind === 'transition' && e.stage === 'check')).toEqual([]);
    // With the gate's contradiction reading earned, it acts as it does today: the moment is reworded, and
    // still held, drawn as told with what held it kept.
    reworded = 0;
    const dir2 = mkdtempSync(join(tmpdir(), 'checks-routed-'));
    const earned = await withRouted(true, () => toTheMoments(undefined, deps(dir2) as Partial<StoreDeps>), {
      earned: ['moment.contradicts'],
    });
    expect(reworded).toBeGreaterThan(0);
    const acted = readJevLog(dir2, earned.id).filter((e) => e.kind === 'transition' && e.stage === 'check');
    expect(acted.map((e) => e.kind === 'transition' && e.decision)).toContain('reworded');
  });

  /** The kitchen's floor plan, so each moment has a camera worked out and "storyboard complete?" reads it. */
  const kitchenPlan: StoreDeps['block'] = async (b) => {
    const out = structuredClone(b);
    for (const sc of out.scenes)
      sc.blocking = {
        front: 'the stove',
        indoors: true,
        spots: [{ id: 't1', x: 1, y: 5, kind: 'thing', size: [0.1, 1.5, 1] }],
      };
    return { breakdown: out, notes: [] };
  };

  test('with the checks only logging, a moment "storyboard complete?" fails when it is drawn is drawn from its plan, with the reasons kept', () =>
    withChecks('log', async () => {
      let planned = 0;
      const run = await toTheMoments(undefined, {
        block: async (b, again) => {
          planned++;
          if (
            again?.fix &&
            Object.values(again.fix)
              .flat()
              .some((f) => /was planned so that its camera sees/.test(f))
          )
            throw new Error('planned again for a check');
          return kitchenPlan(b);
        },
      });
      const m1 = run.store.get(run.id)!.build!.frames!.find((f) => f.id === 'm1')!;
      // The inert reading answers every storyboard fact no: the shot is at odds with its moment.
      expect(m1.frame?.plan?.view).toBeTruthy();
      expect(run.store.get(run.id)!.prep?.storyboard?.m1?.ok).toBe(false);
      expect(run.framesStarted.map((f) => f.id)).toEqual(['m1']);
      expect([m1.status, m1.held]).toEqual(['drawing', undefined]);
      expect(m1.overrode?.some((r) => r.startsWith('storyboard: '))).toBe(true);
      expect(planned).toBeGreaterThan(0);
      // Acting, its scene is planned again for it first (and drawn only once that too has failed).
      let again = 0;
      await withChecks('act', () =>
        toTheMoments(undefined, {
          block: async (b, opts) => {
            if (
              Object.values(opts?.fix ?? {})
                .flat()
                .some((f) => /was planned so that its camera sees/.test(f))
            )
              again++;
            return kitchenPlan(b);
          },
        }),
      );
      expect(again).toBeGreaterThan(0);
    }));

  test('routed, a moment "storyboard complete?" fails is drawn from its plan with the reasons kept, its scene not planned again', () =>
    withRouted(true, async () => {
      let again = 0;
      const run = await toTheMoments(undefined, {
        block: async (b, opts) => {
          if (
            Object.values(opts?.fix ?? {})
              .flat()
              .some((f) => /was planned so that its camera sees/.test(f))
          )
            again++;
          return kitchenPlan(b);
        },
      });
      const m1 = run.store.get(run.id)!.build!.frames!.find((f) => f.id === 'm1')!;
      expect(run.store.get(run.id)!.prep?.storyboard?.m1?.ok).toBe(false);
      expect(run.framesStarted.map((f) => f.id)).toEqual(['m1']);
      expect([m1.status, m1.held, again]).toEqual(['drawing', undefined, 0]);
      expect(m1.overrode?.some((r) => r.startsWith('storyboard: '))).toBe(true);
    }));

  test('with the checks only logging, a fault code finds in the images still leaves a moment undrawn', () =>
    withChecks('log', async () => {
      // Jev is sure of every prompt: only the code's own check can find anything.
      const sure: StoreDeps['gate'] = async (state, questions) => ({
        questions,
        state,
        answers: Object.fromEntries(
          Object.keys(questions).map((k) => [
            k,
            { type: 'noul' as const, noul: k === 'contradicts' || k === 'twice' ? 0.05 : 0.9 },
          ]),
        ),
        error: null,
        ms: 1,
        usage: null,
      });
      const { store, id, framesStarted, statuses, reaction } = await toTheMoments(undefined, { gate: sure });
      statuses.set('job-m1', 'ready');
      await store.settle(id, 100);
      reaction.now = {};
      await store.message(id, 'can I see them?');
      // The board's sketch is drawn but no longer approved: the close-up cannot attach it, though the
      // board is in view. No picture can put that right, so it is not drawn.
      const board = store.get(id)!.build!.items.find((i) => i.id === 't1')!;
      Object.assign(board, { review: undefined, continuityApproved: false });
      reaction.now = { ok_m1: noul(0.9), sketch_reaction: pick('looks_right') };
      await store.message(id, 'the kitchen is right');
      await store.settle(id, 100);
      const m2 = store.get(id)!.build!.frames!.find((f) => f.id === 'm2')!;
      expect(framesStarted.map((f) => f.id)).toEqual(['m1']);
      expect(m2.status).toBe('failed');
      expect(m2.error).toContain('is in view but their sketch is not attached');
    }));

  test('an in-between picture the gate is unsure of: left undrawn acting, drawn with what it found when only logging', async () => {
    // The board's slats change at the close-up: an in-between picture of the board is drawn first.
    const changed = structuredClone(breakdown);
    changed.scenes[0].moments[1].leaves = [{ who: 't1', what: 'its slats', now: 'all blank but one' }];
    const gate: StoreDeps['gate'] = async (state, questions) => ({
      questions,
      state,
      answers: Object.fromEntries(
        Object.keys(questions).map((k) => [
          k,
          {
            type: 'noul' as const,
            // An edit's change read as vague; everything else sure.
            noul:
              k === 'clear' && /edit an attached reference picture/.test(questions.clear.instructions)
                ? 0.1
                : k === 'contradicts' || k === 'twice'
                  ? 0.05
                  : 0.9,
          },
        ]),
      ),
      error: null,
      ms: 1,
      usage: null,
    });
    const producer: StoreDeps['producer'] = async () => ({ breakdown: changed, downgraded: [], notes: [], ms: 1 });
    const ghostOf = (r: Awaited<ReturnType<typeof toTheMoments>>) =>
      r.store.get(r.id)!.build!.frames!.find((f) => f.kind === 'ghost')!;
    // The change kept as the breakdown gives it (the inert reading of what changes would drop it).
    process.env.DREAMCHAT_PREP_REPLACES = 'off';
    try {
      const acting = await withChecks('act', () => toTheMoments(undefined, { gate, producer }));
      expect(ghostOf(acting).held?.[0]).toContain('what it shows is not clear enough to draw (0.10)');
      expect(ghostOf(acting).status).toBe('waiting');
      const logging = await withChecks('log', () => toTheMoments(undefined, { gate, producer }));
      const g = ghostOf(logging);
      expect([g.status, g.held]).toEqual(['drawing', undefined]);
      expect(g.overrode).toEqual(['what it shows is not clear enough to draw (0.10)']);
      expect(g.checkedTakes?.[0].overrode).toEqual(g.overrode);
    } finally {
      delete process.env.DREAMCHAT_PREP_REPLACES;
    }
  });

  test('a throw after a take is judged loses neither its verdict nor what is drawn from it', async () => {
    // The gate falls over once, on the close-up drawn from the wide once the judge has passed it.
    // Before, the verdict was kept only on a copy that was never saved, the wide stayed marked as
    // judged, and the close-up waited for good (snow train m4, 27 Sep).
    let moments = 0;
    const gate: StoreDeps['gate'] = async (state, questions) => {
      if (state.startsWith('One picture from the dream') && ++moments === 2) throw new Error('the gate fell over');
      return {
        questions,
        state,
        answers: Object.fromEntries(
          Object.keys(questions).map((k) => [
            k,
            { type: 'noul' as const, noul: k === 'contradicts' || k === 'twice' ? 0.05 : 0.9 },
          ]),
        ),
        error: null,
        ms: 1,
        usage: null,
      };
    };
    const pass = async () => ({ questions: 3, passed: 3, failed: [], unseen: [] });
    const { store, id, framesStarted, statuses } = await toTheMoments(pass, { gate });
    statuses.set('job-m1', 'ready');
    await store.settle(id, 100);
    const frames = () => store.get(id)!.build!.frames!;
    const m1 = frames().find((f) => f.id === 'm1')!;
    expect(m1.check?.passed).toBe(3);
    expect(m1.continuityApproved).toBe(true);
    // The close-up is not left waiting: it failed to start, said why, and nothing was paid for it.
    const m2 = frames().find((f) => f.id === 'm2')!;
    expect([m2.status, m2.error]).toEqual(['failed', 'could not be started: Error: the gate fell over']);
    expect(m2.jobId).toBeUndefined();
    // Resuming starts it again, from the wide.
    await store.resume(id);
    await store.settle(id, 100);
    expect(framesStarted.map((f) => f.id)).toEqual(['m1', 'm2']);
    expect(framesStarted[1].refs).toContain('composition:media-cut-m1-job-m1');
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
