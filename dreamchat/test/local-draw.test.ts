// The local image machine's fitting (evals/local-draw.ts): at most 4 images and 4000 characters, by one fixed rule,
// and a pair that no longer tests its change once fitted is never counted. Nothing is sent here.

import { describe, expect, test } from 'bun:test';
import {
  type Img,
  type Line,
  MAX_CHARS,
  fitMoment,
  fitPair,
  keptImages,
  pairTested,
  seedOf,
} from '../evals/local-draw';

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

  test('a line the change adds costs both arms the same cuts; cut unequally, the pair is void', () => {
    const base = (extra: string): Line[] => [
      { id: 'happens', text: `What happens: ${'h'.repeat(3500)}` },
      {
        id: 'shot',
        text: `The camera sees. Outside the picture, left: ${'a'.repeat(150)}. Outside the picture, right: ${'b'.repeat(150)}.`,
      },
      { id: 'single', text: `One picture.${extra}` },
    ];
    // B's extra line needs one outside sentence cut that A alone would keep.
    const a = { lines: base(''), images: imgs };
    const b = { lines: base(` ${'m'.repeat(200)}`), images: imgs };
    const alone = pairTested({ ...a, fitted: fitMoment(a.lines, imgs) }, { ...b, fitted: fitMoment(b.lines, imgs) });
    expect(alone.tested).toBe(false);
    expect(alone.lost).toContain('fitted unequally: shot');
    const [fa, fb] = fitPair(a, b);
    expect(fa.kept.shot).toBe(fb.kept.shot);
    expect(pairTested({ ...a, fitted: fa }, { ...b, fitted: fb })).toMatchObject({ tested: true, differs: ['single'] });
  });

  test('a thing the moment names is kept before the place: the mock-up already carries the place', () => {
    const imgs = [
      img(1, 'base'),
      img(2, 'identity'),
      img(3, 'identity'),
      img(4, 'prop', 'sketch-boat'),
      img(5, 'location'),
      img(6, 'prop', 'sketch-key'),
    ];
    expect(keptImages(imgs).map((x) => x.n)).toEqual([1, 2, 3, 5]);
    expect(keptImages(imgs, new Set(['sketch-boat'])).map((x) => x.n)).toEqual([1, 2, 3, 4]);
  });

  test('never a person for a thing: two people and a named thing keep both people, the place goes', () => {
    const imgs = [
      img(1, 'base'),
      img(2, 'identity'),
      img(3, 'identity'),
      img(4, 'prop', 'sketch-boat'),
      img(5, 'location'),
    ];
    expect(keptImages(imgs, new Set(['sketch-boat'])).map((x) => x.n)).toEqual([1, 2, 3, 4]);
    const three = [
      img(1, 'base'),
      img(2, 'prop', 'sketch-boat'),
      img(3, 'identity'),
      img(4, 'identity'),
      img(5, 'identity'),
    ];
    expect(keptImages(three, new Set(['sketch-boat'])).map((x) => x.n)).toEqual([1, 3, 4, 5]);
  });

  test('a role the order does not name is kept after every named one', () => {
    const kept = keptImages([img(1, 'base'), img(2, 'sheet'), img(3, 'identity'), img(4, 'location'), img(5, 'prop')]);
    expect(kept.map((x) => x.n)).toEqual([1, 3, 4, 5]);
  });

  test('the same seed in every arm, one per moment', () => {
    expect(seedOf('d:m1')).toBe(seedOf('d:m1'));
    expect(seedOf('d:m1')).not.toBe(seedOf('d:m2'));
  });
});

describe('what the fitting never gives up', () => {
  const imgs = [
    img(1, 'base'),
    img(2, 'identity'),
    img(3, 'identity'),
    img(4, 'identity'),
    img(5, 'prop', 'sketch-fish'),
    img(6, 'location'),
  ];
  const manifest = [
    'The attached images, in order, and the one thing to take from each:',
    'Image 1: EDIT THIS PICTURE.',
    'Image 2: who the dreamer is (d): their face, hair, build and clothes, exactly. Nothing else from it.',
    'Image 3: who my older sister is (d): their face, hair, build and clothes, exactly. Nothing else from it.',
    'Image 4: who the old man is (d): their face, hair, build and clothes, exactly. Nothing else from it.',
    'Image 5: the fish (d): its exact shape. Nothing else from it.',
    'Image 6: the night market (d): only what it is made of. Where everything stands comes from Image 1.',
  ].join('\n');
  const lines: Line[] = [
    { id: 'shot', text: `What the camera sees. It looks at the stall. ${'The crowd stands behind. '.repeat(60)}` },
    { id: 'manifest', text: manifest },
    { id: 'happens', text: 'What happens in this frame: the fish speaks.' },
    { id: 'in_it', text: `In it:\n${'x (thing).\n'.repeat(40)}` },
    { id: 'point', text: 'The one thing this frame must show: the fish speaking.' },
    {
      id: 'style',
      text: `Style: s.\nTechnique, followed exactly: ${'t'.repeat(600)}\nColours: cream, dark grey.\nLight: Night. Strings of little yellow lights.`,
    },
    { id: 'single', text: 'One single picture. Nothing in it has legible writing.' },
  ];

  test('over the limit, never the light, the colours, the must-show or the writing line; never a cut mid-way', () => {
    const f = fitMoment(lines, imgs, 0, MAX_CHARS, new Set(['sketch-fish']), true);
    expect(f.fits).toBe(true);
    for (const k of [
      'Colours: cream, dark grey.',
      'Light: Night. Strings of little yellow lights.',
      'the fish speaking.',
      'legible writing.',
    ])
      expect(f.prompt).toContain(k);
    expect(f.prompt.endsWith('Nothing in it has legible writing.')).toBe(true);
  });

  test('with three people, one sheet of them left to right frees a slot for the thing the moment is about', () => {
    const f = fitMoment(lines, imgs, 0, MAX_CHARS, new Set(['sketch-fish']), true);
    expect(f.images.map((x) => x.name)).toEqual(['x1', 'people:x2+x3+x4', 'sketch-fish', 'x6']);
    expect(f.images[1].group?.map((x) => x.name)).toEqual(['x2', 'x3', 'x4']);
    expect(f.prompt).toContain(
      'Image 2: who the dreamer, my older sister and the old man are, left to right in this one image',
    );
    expect(f.prompt).toContain('Image 3: the fish');
    expect(f.prompt).toContain('Image 4: the night market');
  });
});
