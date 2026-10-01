// A vertical frame (DREAMCHAT_FRAME=9:16; the owner, 1 Oct: the films are watched on a phone). Every moment is drawn
// 9:16: its words, the shape fal is asked for, the camera's view (the frame's width is now its short side, so a 24mm lens
// sees less across and more up and down), how far off it stands to hold everyone, and the mock-up's size. A place's
// sketch stays 16:9 (a reference, not a frame), a person's and a thing's their own. Off, every value is today's.
import { describe, expect, test } from 'bun:test';
import { frameShape, halfViewOf } from '../blocking';
import { SHAPE_WORDS } from '../frames';
import { loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import { previsImage } from '../previs';
import type { Session } from '../session';
import { type Item, shapeOf } from '../sheets';

function withFrame<T>(v: string | undefined, fn: () => T): T {
  const was = process.env.DREAMCHAT_FRAME;
  try {
    if (v === undefined) delete process.env.DREAMCHAT_FRAME;
    else process.env.DREAMCHAT_FRAME = v;
    return fn();
  } finally {
    if (was === undefined) delete process.env.DREAMCHAT_FRAME;
    else process.env.DREAMCHAT_FRAME = was;
  }
}
const deg = (r: number) => (r * 180) / Math.PI;
/** A PNG's width and height, from its header. */
const sizeOfPng = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};
const item = (kind: Item['kind']): Item => ({ id: 'x', kind, name: 'x', fields: {}, status: 'waiting', version: 0 });

describe('the frame, landscape by default and vertical with the switch', () => {
  test("off, today's frame: 16:9, a 24mm lens 36.87° either side, the mock-up 1376 by 768", () => {
    withFrame(undefined, () => {
      expect(frameShape()).toBe('16:9');
      expect(halfViewOf({ lens: 24 })).toBe(deg(Math.atan(18 / 24)));
      expect(halfViewOf({})).toBe(38);
      expect(shapeOf(item('cut'))).toBe('16:9');
      expect(SHAPE_WORDS['16:9']).toBe('a landscape 16:9 frame');
    });
  });

  test('on, every moment is 9:16; a place stays 16:9; a person and a thing their own', () => {
    withFrame('9:16', () => {
      expect(frameShape()).toBe('9:16');
      expect(shapeOf(item('cut'))).toBe('9:16');
      expect(shapeOf(item('location'))).toBe('16:9');
      expect(shapeOf(item('character'))).toBe('2:3');
      expect(shapeOf(item('prop'))).toBe('1:1');
      expect(SHAPE_WORDS['9:16']).toBe('a vertical 9:16 frame');
    });
  });

  test('on, the lens sees across the short side: 24mm, 22.9° either side, the default view narrowed the same', () => {
    withFrame('9:16', () => {
      expect(halfViewOf({ lens: 24 })).toBeCloseTo(deg(Math.atan((18 * 9) / 16 / 24)), 10);
      expect(halfViewOf({})).toBeCloseTo(deg(Math.atan(Math.tan((38 * Math.PI) / 180) * (9 / 16))), 10);
      expect(halfViewOf({ lens: 24 })).toBeLessThan(23);
    });
  });

  test("on, a moment's prompt says the vertical frame, and its mock-up is drawn 768 by 1344", () => {
    const s = structuredClone(loadDream('dream-0926-043003-b0cb', false).session) as Session;
    const on = withFrame('9:16', () => rebuild(s).pictures.filter((p) => p.kind === 'cut'));
    for (const p of on) expect(p.prompt).toContain('a vertical 9:16 frame');
    const off = withFrame(undefined, () => rebuild(s).pictures.filter((p) => p.kind === 'cut'));
    for (const p of off) expect(p.prompt).not.toContain('9:16 frame');
    const plan = {
      front: 'the front',
      spots: [{ id: 'p1', x: 2, y: 2, kind: 'person' as const, faces: 'front', pose: 'standing' as const }],
      room: [6, 6] as [number, number],
    };
    const eye = { at: { x: 2, y: 5.5 }, d: { x: 0, y: -1 }, height: 1.6, lens: 24 };
    expect(withFrame('9:16', () => sizeOfPng(previsImage(plan as never, eye as never, [], (id) => id)))).toEqual([
      768, 1344,
    ]);
    expect(withFrame(undefined, () => sizeOfPng(previsImage(plan as never, eye as never, [], (id) => id)))).toEqual([
      1376, 768,
    ]);
  });
});
