import { describe, expect, test } from 'bun:test';
import { dreamConfig } from '../dream';
import { type Answer, bookkeeperQuestions, type JevCall, readState } from '../jev';
import { initialState, type State } from '../lib';
import { noul, pick, told } from './fakes';

const cfg = dreamConfig();
const transcript = [
  { role: 'assistant' as const, content: 'hi, tell me your dream' },
  { role: 'user' as const, content: 'I was in a kitchen with a train board on the wall' },
  { role: 'assistant' as const, content: 'a train board, in a kitchen?' },
  { role: 'user' as const, content: "honestly I don't remember the colours at all" },
];

function call(answers: Record<string, Answer> | null): JevCall {
  return { questions: {}, state: '', answers, error: answers ? null : 'down', ms: 1, usage: null };
}

describe('questions asked', () => {
  test('finished-telling is asked only while listening, the retelling answer only after one', () => {
    const listening = bookkeeperQuestions(cfg, transcript, undefined, 'listen');
    expect(listening.finished_telling).toBeDefined();
    expect(listening.retell_reply).toBeUndefined();
    const retelling = bookkeeperQuestions(cfg, transcript, undefined, 'retell');
    expect(retelling.finished_telling).toBeUndefined();
    expect(retelling.retell_reply).toBeDefined();
  });

  test('every goal gets told, not-applicable, not-remembered and an evidence pointer', () => {
    const q = bookkeeperQuestions(cfg, transcript, undefined, 'listen');
    for (const g of cfg.goals) for (const k of ['goal', 'na', 'dk', 'eviD']) expect(q[`${k}_${g.id}`]).toBeDefined();
    const evidence = q.eviD_places;
    expect(evidence.type === 'choice' && Object.keys(evidence.criteria)).toEqual(['none', 'm1', 'm3']);
  });
});

describe('reading the answers', () => {
  const read = (prev: State, answers: Record<string, Answer> | null, phase: 'listen' | 'retell' = 'listen') =>
    readState(prev, cfg, transcript, call(answers), 3, phase).next;

  test('a goal is told only with a message behind it', () => {
    const next = read(initialState('t', cfg), { ...told('places', 1), goal_look: noul(0.95) });
    expect(next.goals.places).toEqual({ confidence: 0.9, evidence: transcript[1].content });
    expect(next.goals.look.confidence).toBeLessThan(cfg.confidence_threshold);
  });

  test('"I don\'t remember" settles a goal as unknown, and it stays settled', () => {
    const first = read(initialState('t', cfg), { dk_look: noul(0.92) });
    expect(first.goals.look.unknown).toBe(true);
    const second = read(first, { dk_look: noul(0.2) });
    expect(second.goals.look.unknown).toBe(true);
  });

  test('a forgotten goal they later tell is told, not unknown', () => {
    const first = read(initialState('t', cfg), { dk_look: noul(0.92) });
    const later = read(first, told('look', 3));
    expect(later.goals.look.unknown).toBeUndefined();
    expect(later.goals.look.confidence).toBe(0.9);
  });

  test('not applicable needs a high bar', () => {
    expect(read(initialState('t', cfg), { na_people: noul(0.8) }).goals.people.not_applicable).toBeUndefined();
    expect(read(initialState('t', cfg), { na_people: noul(0.9) }).goals.people.not_applicable).toBe(true);
  });

  test('a told goal is held by its unchanged evidence when the number dips', () => {
    const first = read(initialState('t', cfg), told('places', 1, 0.9));
    const dipped = read(first, told('places', 1, 0.5));
    expect(dipped.goals.places.confidence).toBe(0.9);
  });

  test('finished-telling is read while listening and kept afterwards', () => {
    const listening = read(initialState('t', cfg), { finished_telling: noul(0.8) });
    expect(listening.signals.finished_telling).toBe(0.8);
    const retelling = read(listening, { retell_reply: pick('confirmed') }, 'retell');
    expect(retelling.signals.finished_telling).toBe(0.8);
    expect(retelling.signals.retell_reply).toBe('confirmed');
  });

  test('an unsure reading of the answer to a retelling counts as unclear', () => {
    const next = read(initialState('t', cfg), { retell_reply: pick('corrected', 0.3) }, 'retell');
    expect(next.signals.retell_reply).toBe('unclear');
  });

  test('a failed judge keeps the previous reading', () => {
    const first = read(initialState('t', cfg), told('places', 1));
    const next = read(first, null);
    expect(next.goals.places.confidence).toBe(0.9);
    expect(next.turn).toBe(3);
  });
});
