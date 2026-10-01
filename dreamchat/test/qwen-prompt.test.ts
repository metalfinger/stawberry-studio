import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { PROFILE } from '../evals/local-draw';
import { poseIn, QWEN_IMAGES, qwenEdit } from '../evals/qwen-prompt';
import { frozenDreams, loadDream } from '../evals/saved';
import { rebuild } from '../plan';
import type { Session } from '../session';

setDefaultTimeout(120_000);

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const was = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    return fn();
  } finally {
    for (const [k, v] of Object.entries(was))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}

/** Every cut of a frozen dream written for Qwen, as local-run writes it, each image given a file. */
function qwenCuts(id: string) {
  return withEnv(PROFILE, () => {
    const r = rebuild(loadDream(id, false).session as Session, { asDrawn: false });
    return r.pictures.flatMap((p) => {
      if (p.kind === 'ghost' || !p.sheet || !p.assembled) return [];
      const images = p.references.map((x, i) => ({
        n: i + 1,
        role: x.role,
        name: x.media_id,
        file: `${x.media_id}.png`,
      }));
      const lines = Object.fromEntries(p.assembled.lines.map((l) => [l.id, l.text]));
      return [{ id: p.id, ...qwenEdit(p.sheet, p.assembled.references, images, lines) }];
    });
  });
}

describe('poseIn: how someone is, from the camera view', () => {
  test('their pose and facing, never where in the frame or how much of them shows', () => {
    const view =
      "From left to right across the picture: the driver, left of the middle of the picture, in the red tractor's seat, their back to the camera, seen whole and filling the picture around a third of the way down; then the dreamer, right of the middle of the picture, sitting beside the driver, holding the boat.";
    expect(poseIn(view, 'the driver')).toBe("in the red tractor's seat, their back to the camera");
    expect(poseIn(view, 'the dreamer')).toBe('sitting beside the driver, holding the boat');
    expect(poseIn(view, 'the sister')).toBe('');
  });
});

describe('qwenEdit: a moment written for Qwen-Image from its sheet', () => {
  const cuts = qwenCuts('dream-0926-043003-b0cb');
  const cut = (id: string) => cuts.find((c) => c.id === id) as (typeof cuts)[number];

  test('the mock-up is the canvas, said first, each image by its tag', () => {
    for (const c of cuts) {
      expect(c.prompt.startsWith('Turn the grey mock-up <image1> into a finished picture')).toBe(true);
      expect(c.images.length).toBeLessThanOrEqual(QWEN_IMAGES);
      expect(c.prompt).not.toContain(`<image${c.images.length + 1}>`);
      expect(c.prompt).not.toContain('\n');
    }
  });

  test('each person by their image, the figure keeping its pose, and the count in a sentence of its own', () => {
    const m2 = cut('m2');
    expect(m2.prompt).toContain('take only their face, hair and clothes from <image2>');
    expect(m2.prompt).toContain('Exactly two people (the grandfather, the dreamer) and one suitcase in the picture.');
    // The suitcase the moment is about is sent before the place.
    expect(m2.images.map((x) => x.name)).toContain('sketch-t1');
  });

  test("through the dreamer's eyes: their hands doing what the moment has them do, and no sketch of them", () => {
    const m6 = cut('m6');
    expect(m6.prompt).toContain(
      "Seen through the dreamer's own eyes: only their own hands and arms are in the picture",
    );
    expect(m6.images.map((x) => x.name)).not.toContain('sketch-p1');
  });

  test('only one of a kind is counted: a crowd, a thing in the plural and an animal are said as they are', () => {
    const exactly = (id: string, m: string) =>
      qwenCuts(id)
        .find((c) => c.id === m)
        ?.prompt.match(/Exactly [^.]*\./)?.[0];
    expect(exactly('dream-0926-000545-09ea', 'm1')).toBe(
      'Exactly two people (the dreamer, my older sister) and one fish in the picture, with the crowd.',
    );
    // Never "one little boats": a thing named in the plural is said without a number.
    for (const id of frozenDreams())
      for (const c of qwenCuts(id)) expect(c.prompt).not.toMatch(/Exactly [^.,]*\bone [\w ]*[^suai']s\b/);
    expect(exactly('dream-0925-231131-affd', 'm1')).toBe('Exactly one dog in the picture.');
  });

  test('with a colour-keyed mock-up, each one is said by its colour and no label is spoken of', () => {
    const m2 = withEnv(PROFILE, () => {
      const r = rebuild(loadDream('dream-0926-043003-b0cb', false).session as Session, { asDrawn: false });
      const p = r.pictures.find((x) => x.id === 'm2' && x.kind !== 'ghost');
      if (!p?.sheet || !p.assembled) throw new Error('no sheet for m2');
      const images = p.references.map((x, i) => ({
        n: i + 1,
        role: x.role,
        name: x.media_id,
        file: `${x.media_id}.png`,
      }));
      const lines = Object.fromEntries(p.assembled.lines.map((l) => [l.id, l.text]));
      const key = [
        { id: 'p2', name: 'the grandfather', colour: 'red' },
        { id: 'p1', name: 'the dreamer', colour: 'blue' },
        { id: 't1', name: 'the suitcase', colour: 'brown' },
      ];
      return qwenEdit(p.sheet, p.assembled.references, images, lines, key).prompt;
    });
    expect(m2.startsWith('Turn the colour-coded mock-up <image1>')).toBe(true);
    expect(m2).toContain('The red figure becomes the grandfather from <image2>');
    expect(m2).toContain('The brown shape becomes the suitcase');
    expect(m2).not.toContain('labelled');
    expect(m2).not.toContain('grey');
  });

  test('every frozen moment fits the machine', () => {
    for (const id of frozenDreams())
      for (const c of qwenCuts(id)) {
        expect(c.prompt.length).toBeLessThan(4000);
        expect(c.images.length).toBeLessThanOrEqual(QWEN_IMAGES);
      }
  });
});
