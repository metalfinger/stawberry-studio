import { describe, expect, test } from 'bun:test';
import { dreamConfig } from '../dream';
import type { Answer, Question } from '../jev';
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
  test('listen until the story is told, retell, then understood', async () => {
    // Message indices in the transcript: 0 greeting, 1 first telling, 2 reply, 3 ending...
    const script = (q: Record<string, Question>): Record<string, Answer> => {
      if (q.is_retelling) return { is_retelling: noul(0.95) };
      const out: Record<string, Answer> = {};
      const phase = q.retell_reply ? 'retell' : 'listen';
      const turns = Object.keys(q.eviD_telling.type === 'choice' ? q.eviD_telling.criteria : {}).length - 1;
      if (turns >= 1) Object.assign(out, told('telling', 1));
      if (turns >= 2) {
        for (const id of required) Object.assign(out, told(id, 3));
        out.finished_telling = noul(0.9);
      }
      if (phase === 'retell') out.retell_reply = pick('confirmed');
      return out;
    };
    const store = new SessionStore(cfg, { jev: fakeJev(script), host: fakeHost() });
    const { id } = store.create();
    await store.open(id);

    const t1 = await store.message(id, 'there was a train board in my kitchen');
    expect(t1.move).toEqual({ kind: 'follow' });
    expect(t1.phase).toBe('listen');

    const t2 = await store.message(id, 'it said zikery, and then I woke up');
    expect(t2.move).toEqual({ kind: 'retell' });
    expect(t2.phase).toBe('retell');

    const t3 = await store.message(id, 'yes that is it');
    expect(t3.move).toEqual({ kind: 'understood' });
    expect(t3.closed).toBe(true);

    const t4 = await store.message(id, 'hello?');
    expect(t4.refused).toBe(true);
    expect(store.get(id)!.retells).toBe(1);
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
