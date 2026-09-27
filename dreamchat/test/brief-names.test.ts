import { describe, expect, test } from 'bun:test';
import { namesEvery } from '../producer';

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
