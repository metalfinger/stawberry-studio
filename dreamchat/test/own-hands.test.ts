import { describe, expect, test } from 'bun:test';
import { handAct } from '../camera';

describe('handAct: what the dreamer does with their own hands, said after "as they"', () => {
  test('the act from the first clause that has the dreamer do it, its verb as after "they"', () => {
    expect(handAct(['the dreamer opens the door; on the other side there is warm yellow light'])).toBe('open the door');
    expect(handAct(['The dreamer reaches for the brass key'])).toBe('reach for the brass key');
    expect(handAct(['they carry the suitcase through the snow'])).toBe('carry the suitcase through the snow');
    expect(handAct(['the dreamer pushes the gate, and it swings'])).toBe('push the gate');
    expect(handAct(['the dreamer and the sister row the boat across'])).toBe('row the boat across');
    expect(handAct(['the dreamer slowly opens the door'])).toBe('slowly open the door');
    expect(handAct(['the dreamer holds the paper boat'])).toBe('hold the paper boat');
    expect(handAct(['the dreamer opened the door'])).toBe('opened the door');
    expect(handAct(['the dreamer opens the door and steps through into the light'])).toBe('open the door');
  });

  test('nothing where the dreamer does nothing with their hands, only could, or does it inside another act', () => {
    expect(handAct(['the dreamer is close to the edge'])).toBeNull();
    expect(handAct(['a gate opens on its own'])).toBeNull();
    expect(handAct(['the dreamer is close enough that they can touch its nose'])).toBeNull();
    expect(handAct(['the dreamer holding the lantern looks down at the river'])).toBeNull();
  });
});
