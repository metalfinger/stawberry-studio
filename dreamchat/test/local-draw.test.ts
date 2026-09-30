// The local image machine's fitting (evals/local-draw.ts): at most 4 images and 4000 characters, by one fixed rule,
// and a pair that no longer tests its change once fitted is never counted. Nothing is sent here.

import { describe, expect, test } from 'bun:test';
import { type Img, type Line, MAX_CHARS, fitMoment, keptImages, pairTested, seedOf } from '../evals/local-draw';

const img = (n: number, role: string, name = `x${n}`): Img => ({ n, role, name, file: `/f/${n}.png` });
const manifest = (imgs: Img[], pad = 0) =>
  [
    'The attached images, in order, and the one thing to take from each:',
    ...imgs.map((x) => `Image ${x.n}: ${x.name} (${'d'.repeat(pad)}): take it.`),
  ].join('\n');

describe('fitting a moment to the machine', () => {
  test('image 1 always, then who is in it, the place, things, earlier pictures; the manifest renumbered', () => {
    const imgs = [
      img(1, 'base'),
      img(2, 'prop'),
      img(3, 'identity'),
      img(4, 'composition'),
      img(5, 'location'),
      img(6, 'identity'),
    ];
    expect(keptImages(imgs).map((x) => x.n)).toEqual([1, 3, 5, 6]);
    const f = fitMoment(
      [
        { id: 'shot', text: 'What the camera sees, as the mock-up in Image 1 shows it.' },
        { id: 'manifest', text: manifest(imgs) },
      ],
      imgs,
    );
    expect(f.images.map((x) => [x.n, x.name])).toEqual([
      [1, 'x1'],
      [2, 'x3'],
      [3, 'x5'],
      [4, 'x6'],
    ]);
    expect(f.prompt).toContain('Image 2: x3');
    expect(f.prompt).not.toContain('x2');
    expect(f.dropped.images).toEqual(['x2', 'x4']);
  });

  test('words dropped in order until it fits; what happens and the one thing to show never', () => {
    const imgs = [img(1, 'base'), img(2, 'identity')];
    const lines: Line[] = [
      { id: 'happens', text: `What happens in this frame: ${'h'.repeat(900)}` },
      { id: 'manifest', text: manifest(imgs, 1200) },
      {
        id: 'style',
        text: `Style: s.\nTechnique, followed exactly: ${'t'.repeat(900)}\nColours: red.\nLight: One. Two.`,
      },
      { id: 'point', text: `The one thing this frame must show: ${'p'.repeat(900)}` },
      { id: 'no_layering', text: 'n'.repeat(300) },
    ];
    const f = fitMoment(lines, imgs);
    expect(f.fits).toBe(true);
    expect(f.prompt.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(f.kept.happens).toBe(lines[0].text);
    expect(f.kept.point).toBe(lines[3].text);
    expect(f.prompt).toContain('Colours: red.');
    expect(f.dropped.paragraphs).toEqual(['no_layering']);
    expect(f.dropped.lines).toContain('style: technique');
  });

  test('nothing is cut from a moment that already fits', () => {
    const imgs = [img(1, 'base')];
    const f = fitMoment([{ id: 'no_layering', text: 'short' }], imgs);
    expect(f.dropped).toEqual({ images: [], paragraphs: [], lines: [], chars: 0 });
  });
});

describe('a pair tests its change only while the change is still sent', () => {
  const imgs = [img(1, 'base')];
  const arm = (single: string, pad: number) => {
    const lines: Line[] = [
      { id: 'happens', text: `What happens: ${'h'.repeat(3500)}` },
      { id: 'no_layering', text: 'n'.repeat(pad) },
      { id: 'single', text: single },
    ];
    return { lines, images: imgs, fitted: fitMoment(lines, imgs) };
  };

  test('the differing line kept in both: tested', () => {
    const p = pairTested(arm('No writing.', 10), arm('Marks no one could read.', 10));
    expect(p).toMatchObject({ tested: true, differs: ['single'], lost: [] });
  });

  test('the differing line cut from one arm: not tested, never a tie', () => {
    const p = pairTested(arm('x', 10), arm('y', 600));
    // The second arm is over and loses its no-layering line, which the first keeps: that line differs, and is gone.
    expect(p.tested).toBe(false);
    expect(p.lost).toContain('paragraph no_layering');
  });

  test('no difference at all: not tested', () => {
    expect(pairTested(arm('x', 10), arm('x', 10)).tested).toBe(false);
  });

  test('the same seed in every arm, one per moment', () => {
    expect(seedOf('d:m1')).toBe(seedOf('d:m1'));
    expect(seedOf('d:m1')).not.toBe(seedOf('d:m2'));
  });
});
