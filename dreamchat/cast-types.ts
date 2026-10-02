// The cast reading's types alone (cast.ts reads it): what the floor plan (continuity.ts) and the story record read,
// with nothing to import from the reader, so no module imports its way back round.

export type CastThing = {
  /** Its id once cast (c1, c2… in the reading's order); none for weather and matter, which are never cast. */
  id?: string;
  name: string;
  look: string;
  kind: 'thing' | 'creature' | 'vehicle' | 'weather' | 'matter';
  /** Every moment whose picture shows it, and whether it is in the place there or seen out past it. */
  moments: { id: string; where: 'in' | 'beyond' }[];
  /** A cast element it is by (its id), where the words put it by one. */
  near: string | null;
  /** The words that say where, as the dream says them ("ahead of the bicycle", "along the aisle"). */
  side: string | null;
  /** The dream's words for its size ("as big as a bus"), where it gives them. */
  size: string | null;
  /** How many, where the words say more than one ("a crowd of boats": null count, many; "three boats": 3). */
  many: number | null;
};

export type CastBody = {
  id: string;
  height_m: number;
  shape: 'human' | 'four-legged' | 'bird' | 'fish' | 'other';
  /** The dream's words the size rests on; empty where it is the kind's ordinary size. */
  words: string;
};

/** A fixture a place's own words name that its floor plan may lack: windows along a wall, rows of seats, an aisle. */
export type CastFixture = {
  place: string;
  name: string;
  kind: 'opening' | 'row' | 'aisle' | 'other';
  /** Where the words put it ("along each side", "along the left wall", "at the front"). */
  where: string | null;
  count: number | null;
  /** The place's own words it rests on, copied exactly. */
  words: string;
};

export type CastReading = {
  things: CastThing[];
  bodies: CastBody[];
  fixtures: CastFixture[];
  /**
   * With `cast_fixture`: the things the reading names that are a fixture of their place already, by the id each would
   * have had and the moments where it is (all of them where it is never cast): a dream saved with them cast loses them.
   */
  asFixture?: { id: string; at: string[] }[];
};
