// The replay's cut (evals/replay.ts) on a trimmed saved conversation: the crayon cat, whose look was
// chosen at message 16 after a retelling at 12 and its correction at 13.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutAtStyle, dreamOf, upToMessage } from '../evals/replay';
import type { Session, TurnDetail } from '../session';

type Fixture = { session: Session; details: Record<string, Pick<TurnDetail, 'stateAfter'>> };
const fx = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'replay-session.json'), 'utf8')) as Fixture;
const cutOf = (session: Session = fx.session, details = fx.details) =>
  cutAtStyle(session, {
    id: 'dream-0926-150000-test',
    name: 'replayed (test): crayon-cat',
    now: 1,
    detail: (turn) => details[String(turn)] ?? null,
  });

test('cuts just after the message that chose the look, and holds it back to be said again', () => {
  const c = cutOf();
  expect(c.turn).toBe(16);
  expect(c.message).toBe("the crayon one, definitely. that's just how it looked");
  const kept = c.session.transcript;
  expect(kept.filter((e) => e.role === 'user')).toHaveLength(15);
  // The last thing kept is Berry offering the ways it could be drawn.
  expect(kept.at(-1)?.role).toBe('assistant');
  expect(kept).toEqual(fx.session.transcript.slice(0, kept.length));
  expect(fx.session.transcript[kept.length]).toEqual({ role: 'user', content: c.message });
  expect(c.session.turns.map((t) => t.turn)).toEqual([...Array(16).keys()]);
  expect(Object.keys(c.session.briefs).every((k) => Number(k) < 16)).toBe(true);
  expect(c.session.phase).toBe('style');
  expect(c.session.closed).toBe(false);
  // The state as it was when the message arrived, in the new conversation's name.
  expect(c.session.state).toEqual({ ...fx.details['15'].stateAfter, session_id: 'dream-0926-150000-test' });
  expect(c.told).toHaveLength(16);
  expect(c.told.at(-1)).toBe(c.message);
});

test('keeps the look they chose and the ways it was offered', () => {
  const c = cutOf();
  expect(c.style).toEqual(fx.session.style!);
  expect(c.style.id).toBe('a');
  expect(c.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  expect(c.options).toEqual(fx.session.draft!.breakdown!.style_options);
});

test('drops everything the harness made after it', () => {
  const c = cutOf();
  const s = c.session;
  expect([s.draft, s.style, s.production, s.build, s.prep]).toEqual([null, null, null, null, undefined]);
  expect([s.images, s.spentUsd, s.spentCredits]).toEqual([0, 0, undefined]);
  expect(s.id).toBe('dream-0926-150000-test');
  expect(c.dropped).toMatchObject({
    turns: 27,
    messages: 26,
    briefs: 27,
    breakdown: { basedOn: 13, title: 'The Cats in Every Garden', moments: 8 },
    prep: true,
    production: 'written',
    sketches: 4,
    moments: 8,
    ghosts: 0,
    images: 15,
  });
});

test('counts its own moves as it had then', () => {
  const s = cutOf().session;
  // Nothing after the look is chosen asks, explores, retells or offers, so these are the saved ones.
  expect(s.askCounts).toEqual(fx.session.askCounts);
  expect(s.exploredThreads).toEqual(fx.session.exploredThreads);
  expect([s.retells, s.offers, s.styleAsks, s.resumed]).toEqual([2, 1, 1, undefined]);
});

test('drafts the breakdown again from the messages it was drafted from: the retelling, then its correction', () => {
  const c = cutOf();
  expect(c.draftPoints).toEqual([12, 13]);
  const said = [...c.session.transcript, { role: 'user' as const, content: c.message }];
  const first = upToMessage(said, 12);
  expect(first.filter((e) => e.role === 'user')).toHaveLength(12);
  expect(first.at(-1)?.role).toBe('user');
  expect(upToMessage(said, 16)).toEqual(said);
  // An offer made as the retelling was corrected started one too.
  const corrected = structuredClone(fx.details);
  corrected['14'].stateAfter.signals.retell_reply = 'corrected';
  const later = structuredClone(fx.session);
  later.draft!.basedOn = 14;
  expect(cutOf(later, corrected).draftPoints).toEqual([12, 13, 14]);
});

test('never changes the saved conversation', () => {
  const before = JSON.stringify(fx.session);
  const c = cutOf();
  c.session.transcript.push({ role: 'user', content: 'more' });
  c.session.turns[0].rule = 'changed';
  c.session.state.signals.style_choice = 'b';
  c.style.name = 'changed';
  expect(JSON.stringify(fx.session)).toBe(before);
});

test('refuses a conversation that never chose a look, or whose state then is unknown', () => {
  const never = structuredClone(fx.session);
  never.turns = never.turns.filter((t) => t.turn < 16);
  expect(() => cutOf(never)).toThrow('never got as far as choosing');
  expect(() => cutOf(fx.session, {})).toThrow('no record of turn 15');
});

test('finds the dream a conversation was simulated from', () => {
  expect(dreamOf('simulated: jellyfish-city')).toBe('jellyfish-city');
  expect(dreamOf('my own dream')).toBeNull();
});
