// The colour-keyed mock-up for the local machine's qwen profile (previs.ts previsKeyed): no labels; each person and
// creature in its own marker colour, never a colour a thing in view already has; each thing in its own colour from its
// words; the key says which colour is who. The labelled clay frame (previsImage) is untouched.
import { describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { type Blocking } from '../blocking';
import { previsImage, previsKeyed, thingColour } from '../previs';

/** A PNG's pixels back (8-bit RGB, unfiltered, as previs.ts png writes them). */
function pixels(file: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
  const view = new DataView(file.buffer, file.byteOffset);
  const [width, height] = [view.getUint32(16), view.getUint32(20)];
  let o = 8;
  const idat: Uint8Array[] = [];
  while (o < file.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...file.subarray(o + 4, o + 8));
    if (type === 'IDAT') idat.push(file.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++)
    rgb.set(raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3);
  return { width, height, rgb };
}

const field: Blocking = {
  front: 'the beach',
  spots: [
    { id: 'p1', x: 49.5, y: 5, kind: 'person', pose: 'standing', faces: 'front' },
    { id: 'p4', x: 50.5, y: 5, kind: 'person', pose: 'standing', faces: 'front' },
    { id: 'c1', x: 50, y: 3.5, kind: 'thing', size: [1.8, 3, 2] },
  ],
};
const name = (id: string) => ({ p1: 'the dreamer', p4: 'the driver', c1: 'the red tractor' })[id] ?? id;
const eye = { at: { x: 50, y: 10 }, d: { x: 0, y: -1 }, height: 1.6 };

describe('the colour-keyed mock-up', () => {
  test('each person in a marker colour of their own, never one a thing in view has; each thing in its own', () => {
    const { key } = previsKeyed(field, eye, [], name, 384, 216);
    const by = Object.fromEntries(key.map((k) => [k.name, k]));
    expect(by['the red tractor']).toMatchObject({ colour: 'red', kind: 'thing' });
    expect(by['the dreamer'].kind).toBe('person');
    expect(by['the driver'].kind).toBe('person');
    // The red tractor is red, so no one is red; and no two people share a colour.
    const people = key.filter((k) => k.kind === 'person').map((k) => k.colour);
    expect(people).not.toContain('red');
    expect(new Set(people).size).toBe(people.length);
  });

  test('has no labels and is in colour; the clay frame is grey and labelled as before', () => {
    const keyed = pixels(previsKeyed(field, eye, [], name, 384, 216).png);
    const clay = pixels(previsImage(field, eye, [], name, 384, 216));
    const coloured = (rgb: Uint8Array) => {
      let n = 0;
      for (let i = 0; i < rgb.length; i += 3)
        if (Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) - Math.min(rgb[i], rgb[i + 1], rgb[i + 2]) > 30) n++;
      return n;
    };
    expect(coloured(clay.rgb)).toBe(0);
    expect(coloured(keyed.rgb)).toBeGreaterThan(keyed.width * keyed.height * 0.1);
    expect([keyed.width, keyed.height]).toEqual([clay.width, clay.height]);
  });

  test("a thing's colour is the one its words say, else what its head word is, else a muted neutral", () => {
    expect(thingColour('the red tractor')[0]).toBe('red');
    expect(thingColour('the yellow rowing boat')[0]).toBe('yellow');
    expect(thingColour('the brown leather suitcase')[0]).toBe('brown');
    // The fish stall is a stall, not a fish; the fish is silver.
    expect(thingColour('the fish stall')[0]).toBe('brown');
    expect(thingColour('the fish')[0]).toBe('silver');
    expect(thingColour('rows of desks')[0]).toBe('brown');
    expect(thingColour('a window')[0]).toBe('pale blue');
    expect(thingColour('the seats facing each other')[0]).toBe('grey-brown');
  });
});
