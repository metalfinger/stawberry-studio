import { describe, expect, test } from 'bun:test';
import { BRIEF_ASK, BRIEF_MAX, briefKept, namesEvery, shotAsk } from '../producer';

// Written for these tests: none of these names or briefs are from a saved dream. shotFor keeps a brief
// only where namesEvery holds (producer.ts).
describe('a shot brief names everyone and everything its view puts in the picture', () => {
  const must = [
    'my aunt',
    'bookcases on the right',
    'the benches facing the stage',
    'the rows of vines where Priya stood',
    'the old windmill',
  ];
  const people = ['my aunt'];
  const brief =
    'A wide shot at eye height. In the foreground the aunt stands, soft. On the right a tall bookcase leans; two benches face away from us. Behind, the empty vine rows run to the windmill on the hill.';

  test('each by what it is, whatever article or possessive it has, or one word joined to another for a thing', () => {
    expect(namesEvery(brief, must, people)).toBe(true);
    // Every name word for word still passes.
    expect(namesEvery(`${must.join(', ')}.`, must, people)).toBe(true);
    expect(namesEvery('The bookshelf on the left is dark.', ['shelves on the left'])).toBe(true);
    expect(namesEvery('The chair on the left is empty.', ['armchair left'])).toBe(true);
    expect(namesEvery("Her grandfather's hands rest on it.", ['my grandfather'], ['my grandfather'])).toBe(true);
  });

  test('a brief that leaves one out, or names another in its place, is not used', () => {
    // Left out: the windmill.
    expect(namesEvery(brief.replace('to the windmill on the hill', 'to the hill'), must, people)).toBe(false);
    // Another in its place: the uncle for the aunt.
    expect(namesEvery(brief.replace('the aunt', 'the uncle'), must, people)).toBe(false);
    // A person is never one word joined to another: "grandfather" is not the father.
    expect(namesEvery('The grandfather waits by the gate.', ['the father', 'the gate'], ['the father'])).toBe(false);
    expect(namesEvery('The father waits by the gate.', ['the father', 'the gate'], ['the father'])).toBe(true);
  });

  test('two of one kind are each told apart by what the view calls them, beside them', () => {
    const two = ['bookcases on the left', 'bookcases on the right'];
    expect(namesEvery('Bookcases line the left wall; more bookcases stand on the right.', two)).toBe(true);
    expect(namesEvery('Bookcases line the right wall, soft in the dark.', two)).toBe(false);
    const brothers = ['the older brother', 'the younger brother'];
    expect(namesEvery('The older brother stands by the younger brother.', brothers, brothers)).toBe(true);
    expect(namesEvery('The older brother stands by the other brother.', brothers, brothers)).toBe(false);
    // Two alike in every word (four desks of one name) need only be named once.
    expect(namesEvery('Desks with lamps fill the room.', ['desk with a lamp', 'desk with a lamp'])).toBe(true);
  });
});

// Written for these tests, like the ones above; the lengths are the harness's own (producer.ts BRIEF_MAX).
describe('a shot brief is kept within its length, at a whole sentence', () => {
  const must = ['the old woman', 'the rowing boat', 'the whale'];
  const people = ['the old woman', 'the whale'];
  const opening = 'A wide shot from behind, at eye height, a 24mm lens. The old woman sits in the rowing boat, soft.';
  const filler = ' The shelves run away on both sides, dark wood, their rows of spines catching a little light.';
  /** A brief of `n` filler sentences between its opening and its closing words. */
  const long = (n: number, closing: string) => `${opening}${filler.repeat(n)} ${closing}`;

  test('the writer is asked for a brief within a length it can meet, under the length a brief is kept to', () => {
    const ask = shotAsk('They row on.', 'the facts', 'a photograph')
      .map((m) => m.content)
      .join('\n');
    expect(ask).toContain(`at most ${BRIEF_ASK.toLocaleString('en-GB')} characters`);
    expect(BRIEF_ASK).toBeLessThan(BRIEF_MAX);
  });

  test('one within the length is kept whole; one over it is cut after its last whole sentence, never mid-word', () => {
    const short = long(2, 'The whale rises beside the boat.');
    expect(briefKept(`  ${short} `, must, people)).toBe(short);
    const over = long(12, 'The whale rises beside the boat, grey and slow.');
    // Everyone is named before the cut: the filler runs on past the length.
    const named = `${opening} The whale rises beside the boat.${filler.repeat(20)}`;
    expect(named.length).toBeGreaterThan(BRIEF_MAX);
    const kept = briefKept(named, must, people)!;
    expect(kept.length).toBeLessThanOrEqual(BRIEF_MAX);
    expect(kept.endsWith('light.')).toBe(true);
    expect(named.startsWith(kept)).toBe(true);
    // Nothing is ever cut mid-word or mid-sentence: every kept brief ends a sentence.
    for (const text of [over, named, `${named} And on.`]) {
      const k = briefKept(text, ['the old woman', 'the rowing boat'], ['the old woman']);
      if (k) expect(k).toMatch(/[.!?]["'”’)]*$/);
    }
  });

  test('a brief that loses one in the picture by the cut fails the name check', () => {
    // The whale is named only after the length: cut there, the brief no longer names it.
    const over = long(16, 'The whale rises beside the boat.');
    expect(over.length).toBeGreaterThan(BRIEF_MAX);
    expect(namesEvery(over, must, people)).toBe(true);
    expect(briefKept(over, must, people)).toBeNull();
    // With no whole sentence within the length, nothing is kept.
    expect(briefKept(`${'word '.repeat(400)}whale.`, ['the whale'], ['the whale'])).toBeNull();
  });
});
