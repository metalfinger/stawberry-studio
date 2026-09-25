import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atSite, inSession, jevTotals, readJevLog, recordJev, siteOf } from '../jevlog';

const call = (questions: string[], inputTokens: number, ms: number) => ({
  kind: 'call' as const,
  questions,
  inputTokens,
  outputTokens: 10,
  stateChars: 1000,
  ms,
  error: null,
});

describe('the Jev log', () => {
  test('says where a call was made from what it asks', () => {
    expect(siteOf(['goal_dream', 'na_dream'])).toBe('turn');
    expect(siteOf(['contradicts', 'twice', 'clear'])).toBe('gate');
    expect(siteOf(['said_p1.appearance', 'where_p1.appearance'])).toBe('grounding');
    expect(siteOf(['from_m2', 'side_m1_m2'])).toBe('continuity');
    expect(siteOf(['named'])).toBe('correction');
    expect(siteOf(['sb_m3_all_in'])).toBe('storyboard');
    expect(siteOf(['whatever'])).toBe('other');
  });

  test('keeps each call in the conversation it was made in, and nothing outside one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jevlog-'));
    recordJev(call(['goal_dream'], 100, 300));
    expect(existsSync(join(dir, 'c1', 'jev.jsonl'))).toBe(false);
    await inSession(dir, 'c1', async () => {
      recordJev(call(['goal_dream'], 5000, 400));
      await atSite('storyboard', async () => recordJev(call(['contradicts'], 800, 600)));
    });
    const log = readJevLog(dir, 'c1');
    expect(log.map((e) => (e.kind === 'call' ? e.site : e.kind))).toEqual(['turn', 'storyboard']);
    const totals = jevTotals(log);
    expect(totals.all).toEqual({ calls: 2, inputTokens: 5800, outputTokens: 20, ms: 1000 });
    expect(totals.bySite.turn.inputTokens).toBe(5000);
  });
});
