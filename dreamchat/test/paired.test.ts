import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { judgeSet, pairedArms, prepare, relationTo, type SavedDream, shuffled, wordsOf } from '../evals/paired-arms';
import { inViewOf } from '../frames';

// The lighthouse dream as frozen (evals/sources), each sketch and picture it drew given a stand-in file.
const frozen = (await Bun.file(
  join(import.meta.dir, '..', 'evals', 'sources', 'lighthouse-fresh.json'),
).json()) as SavedDream;
const drawn = <T extends { id: string; status?: string }>(x: T) =>
  x.status === 'ready' ? { ...x, mediaPath: `stand-in-${x.id}.png` } : x;
const saved = {
  ...frozen,
  build: { items: frozen.build!.items.map(drawn), frames: (frozen.build!.frames ?? []).map(drawn) },
} as SavedDream;

describe('three ways to draw one moment', () => {
  const p = prepare(saved);
  // In the tractor's cab, seen from behind; the picture before is the same cab from in front.
  const r = pairedArms(p, 'm12');
  const keys = (arm: 'mockup' | 'edit' | 'free') => r.arms[arm].images.map((im) => im.key);
  const sketches = inViewOf(p.pictures.get('m12')!, p.sheets).map((s) => s.mediaId ?? `no sketch of ${s.id}`);

  test('the three prompts say the same about the moment, line for line, but for the lines about their images', () => {
    expect(r.prev).toEqual({ id: 'm11', relation: 'other_side', samePlace: true });
    const words = wordsOf(r.arms.mockup.prompt);
    expect(words.some((l) => l.startsWith('What happens in this frame: The cab vibrates'))).toBe(true);
    expect(wordsOf(r.arms.edit.prompt)).toEqual(words);
    expect(wordsOf(r.arms.free.prompt)).toEqual(words);
  });

  test("today's routing opens on the mock-up; the edit, on the picture before; sketches alone, on the sketches", () => {
    expect(r.previs?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(r.arms.mockup.images[0]).toMatchObject({ key: 'previs:m12', role: 'base' });
    expect(r.arms.mockup.prompt).toContain(
      'Image 1: EDIT THIS PICTURE. It is a rough grey mock-up of this exact picture',
    );
    expect(r.arms.edit.images[0]).toMatchObject({ key: 'picture:m11', role: 'base' });
    expect(r.arms.edit.prompt).toContain(
      'Image 1: EDIT THIS PICTURE. It is picture 11, the moment just before, in the same place.',
    );
    // Everyone and everything in view by their sketches, in every arm, and nothing else in two of them.
    expect(keys('free')).toEqual(sketches);
    expect(keys('edit')).toEqual(['picture:m11', ...sketches]);
    expect(keys('mockup').filter((k) => k.startsWith('sketch:'))).toEqual(sketches);
    expect(keys('edit').some((k) => k.startsWith('previs:'))).toBe(false);
    expect(keys('free').some((k) => !k.startsWith('sketch:'))).toBe(false);
    expect(r.arms.free.prompt).not.toContain('EDIT THIS PICTURE');
  });

  test("the judging page gets each moment's pictures shuffled and unnamed; only the key says which is which", () => {
    const drawn = { mockup: '/x/m12-mockup.jpg', edit: '/x/m12-edit.jpg', free: '/x/m12-free.jpg' };
    const one = {
      id: 'lighthouse-fresh-m12',
      moment: 'm12',
      title: 'The lighthouse, m12',
      told: ['a dream'],
      action: r.action,
    };
    const { data, key, copies } = judgeSet(
      [one, { ...one, id: 'undrawn', drawn: {} }].map((m) => ({ drawn, ...m })),
      'Three ways',
    );
    expect(data.runs.map((x) => x.run)).toEqual(['lighthouse-fresh-m12']);
    const shown = data.runs[0].moments as { id: string; img: string }[];
    expect(shown.map((m) => m.id)).toEqual(['a', 'b', 'c'].map((l) => `lighthouse-fresh-m12-${l}`));
    expect(JSON.stringify(data)).not.toMatch(/mockup|edit|free/);
    expect(shown.map((m) => key[m.id])).toEqual(shuffled('lighthouse-fresh-m12'));
    expect(copies.map((c) => c.from)).toEqual(shuffled('lighthouse-fresh-m12').map((a) => drawn[a]));
    expect(copies.map((c) => c.to)).toEqual(shown.map((m) => m.img));
  });

  test('how a moment follows an earlier one is read as the continuity plan reads it', () => {
    let compared = 0;
    for (const c of p.plan.cuts)
      for (const ref of c.refs.filter((x) => x.kind === 'cut' && x.relation && x.relation !== 'seat')) {
        const read = relationTo(p.b, c.id, ref.id);
        // The plan relabels one kind: a picture of the same setup with other people in it is not
        // edited but gives only the room, as "the same side".
        if (read === 'same_setup' && ref.relation === 'same_side' && ref.role === 'composition') continue;
        expect(`${c.id} from ${ref.id}: ${read}`).toBe(`${c.id} from ${ref.id}: ${ref.relation}`);
        compared++;
      }
    expect(compared).toBeGreaterThan(5);
  });
});
