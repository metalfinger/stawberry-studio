// Every Jev call logged with its own id, Jev's id for it where its answer carries one, the call it tries again where
// an answer was missing or incomplete (`attemptOf`), and the call whose questions it asks again on purpose (`repeatOf`):
// a harness's call events count each call once, each retry with the first. No call leaves the machine: fetch is stood
// in for.
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callJev } from '../jev';
import { inSession, type JevCallEntry, readJevLog } from '../jevlog';
import { readPrompt } from '../gate';
import { askFacts, STORYBOARD } from '../stages';

const realFetch = globalThis.fetch;
const realKey = process.env.JEV_API_KEY;
const realChecks = process.env.DREAMCHAT_CHECKS;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.JEV_API_KEY;
  else process.env.JEV_API_KEY = realKey;
  if (realChecks === undefined) delete process.env.DREAMCHAT_CHECKS;
  else process.env.DREAMCHAT_CHECKS = realChecks;
});

/** Jev stood in for: every question answered `noul`, with the request id given (none where null). */
const standIn = (noul: number, requestId: string | null) => {
  process.env.JEV_API_KEY = 'test';
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const { questions } = JSON.parse(init?.body ?? '{}') as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul', noul }]));
    return new Response(JSON.stringify({ answers, usage: { input_tokens: 10, output_tokens: 2 } }), {
      headers: requestId ? { 'x-request-id': requestId } : {},
    });
  }) as unknown as typeof fetch;
};
const calls = (dir: string) => readJevLog(dir, 'c1').filter((e): e is JevCallEntry => e.kind === 'call');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('each Jev call logged with its ids', () => {
  test("its own id, one per call, and Jev's id for it", async () => {
    standIn(0.9, 'req-1');
    const dir = mkdtempSync(join(tmpdir(), 'jevids-'));
    await inSession(dir, 'c1', async () => {
      await callJev('state', { q: { type: 'noul', instructions: 'Is it?' } });
      await callJev('state', { q: { type: 'noul', instructions: 'Is it?' } });
    });
    const [a, b] = calls(dir);
    expect(a.callId).toMatch(UUID);
    expect(b.callId).toMatch(UUID);
    expect(a.callId).not.toBe(b.callId);
    expect([a.requestId, b.requestId]).toEqual(['req-1', 'req-1']);
    expect([a.attemptOf, b.attemptOf]).toEqual([null, null]);
  });

  test("none from Jev, or no answer at all: its own id still, and Jev's null", async () => {
    standIn(0.9, null);
    const dir = mkdtempSync(join(tmpdir(), 'jevids-'));
    await inSession(dir, 'c1', async () => {
      await callJev('state', { q: { type: 'noul', instructions: 'Is it?' } });
      globalThis.fetch = (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch;
      await callJev('state', { q: { type: 'noul', instructions: 'Is it?' } });
    });
    const [a, b] = calls(dir);
    expect(a.callId).toMatch(UUID);
    expect(a.requestId).toBeNull();
    expect(b.callId).toMatch(UUID);
    expect(b.requestId).toBeNull();
    expect(b.error).toContain('offline');
  });

  test('a close call asked again on purpose is a repeat of the first, never an attempt; a clear one is asked once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jevids-'));
    // 0.62 is within 0.08 of the first fact's bar of 0.6: asked again, both answers averaged.
    standIn(0.62, 'req-close');
    await inSession(dir, 'c1', async () => {
      await askFacts(STORYBOARD, 'm3', 'state', callJev);
      await callJev('state', { q: { type: 'noul', instructions: 'Is it?' } });
    });
    const close = calls(dir);
    expect(close).toHaveLength(3);
    expect([close[0].attemptOf, close[0].repeatOf]).toEqual([null, null]);
    expect([close[1].attemptOf, close[1].repeatOf]).toEqual([null, close[0].callId!]);
    // A call made after it is its own.
    expect([close[2].attemptOf, close[2].repeatOf]).toEqual([null, null]);
    // 0.95 is clear of every bar: once.
    standIn(0.95, 'req-clear');
    const clear = mkdtempSync(join(tmpdir(), 'jevids-'));
    await inSession(clear, 'c1', () => askFacts(STORYBOARD, 'm3', 'state', callJev));
    expect(calls(clear)).toHaveLength(1);
  });
});

describe("a call tried again, and Jev's id however the answer came", () => {
  test("the gate's prompt read once more, its first answer incomplete: an attempt of the first", async () => {
    delete process.env.DREAMCHAT_CHECKS;
    process.env.JEV_API_KEY = 'test';
    let n = 0;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      const { questions } = JSON.parse(init?.body ?? '{}') as { questions: Record<string, unknown> };
      // The first answer leaves out a question; the second has them all.
      const keys = Object.keys(questions).filter((k) => n > 0 || k !== 'clear');
      n++;
      const answers = Object.fromEntries(keys.map((k) => [k, { type: 'noul', noul: 0.1 }]));
      return new Response(JSON.stringify({ answers, usage: { input_tokens: 10, output_tokens: 2 } }));
    }) as unknown as typeof fetch;
    const dir = mkdtempSync(join(tmpdir(), 'jevids-'));
    await inSession(dir, 'c1', () => readPrompt(callJev, 'A finished picture of a kitchen.'));
    const [a, b] = calls(dir);
    expect(n).toBe(2);
    expect([a.attemptOf, a.repeatOf]).toEqual([null, null]);
    expect([b.attemptOf, b.repeatOf]).toEqual([a.callId!, null]);
  });

  test("Jev's id from either header, and kept where the answer was an error or could not be read", async () => {
    process.env.JEV_API_KEY = 'test';
    const dir = mkdtempSync(join(tmpdir(), 'jevids-'));
    const answer = (body: string, status: number, headers: Record<string, string>) => {
      globalThis.fetch = (async () => new Response(body, { status, headers })) as unknown as typeof fetch;
    };
    await inSession(dir, 'c1', async () => {
      answer(JSON.stringify({ answers: {}, usage: null }), 200, { 'request-id': 'req-plain' });
      await callJev('state', {});
      answer('overloaded', 503, { 'x-request-id': 'req-503' });
      await callJev('state', {});
      answer('<html>proxy</html>', 200, { 'x-request-id': 'req-html' });
      await callJev('state', {});
    });
    const log = calls(dir);
    expect(log.map((e) => e.requestId)).toEqual(['req-plain', 'req-503', 'req-html']);
    expect(log[1].error).toContain('503');
    expect(log[2].error).not.toBeNull();
  });
});
