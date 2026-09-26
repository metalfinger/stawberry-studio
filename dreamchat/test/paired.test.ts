import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  afterImage1,
  ARMS,
  type Arm,
  judgeSet,
  linesAfterImage1,
  manifestOf,
  ORDERS,
  orderAt,
  type Paired,
  pairedArms,
  placeCounts,
  prepare,
  previousDrawn,
  relationTo,
  type SavedDream,
  wordsOf,
} from '../evals/paired-arms';
import { inViewOf } from '../frames';

// A dream as frozen (evals/sources), each sketch and picture it drew given a stand-in file.
async function frozen(name: string): Promise<SavedDream> {
  const s = (await Bun.file(join(import.meta.dir, '..', 'evals', 'sources', `${name}.json`)).json()) as SavedDream;
  const drawn = <T extends { id: string; status?: string }>(x: T) =>
    x.status === 'ready' ? { ...x, mediaPath: `stand-in-${x.id}.png` } : x;
  return {
    ...s,
    build: { items: s.build!.items.map(drawn), frames: (s.build!.frames ?? []).map(drawn) },
  } as SavedDream;
}
const lighthouse = prepare(await frozen('lighthouse-fresh'));
// The heron dream drew an in-between picture (g2) that its m5 attaches, beside an earlier moment (m4).
const heron = prepare(await frozen('heron'));
const nightMarket = prepare(await frozen('night-market'));

const keys = (r: Paired, arm: Arm) => r.arms[arm].images.map((im) => im.key);
const others = (r: Paired, arm: Arm) => afterImage1(r, arm).map((im) => [im.key, im.role]);
const paragraphs = (prompt: string) => prompt.split('\n\n');

describe('three ways to draw one moment', () => {
  const p = lighthouse;
  // In the tractor's cab, seen from behind; the picture before is the same cab from in front.
  const r = pairedArms(p, 'm12');
  const sketches = inViewOf(p.pictures.get('m12')!, p.sheets).map((s) => s.mediaId ?? `no sketch of ${s.id}`);

  test('the three prompts say the same about the moment, line for line, but for the manifest', () => {
    expect(r.prev).toEqual({ id: 'm11', relation: 'other_side', samePlace: true });
    const words = wordsOf(r.arms.mockup.prompt);
    expect(words.some((l) => l.startsWith('What happens in this frame: The cab vibrates'))).toBe(true);
    expect(wordsOf(r.arms.edit.prompt)).toEqual(words);
    expect(wordsOf(r.arms.free.prompt)).toEqual(words);
    // What frames.ts says only beside an earlier moment is said, and compared, in all three.
    for (const a of ARMS) {
      expect(
        wordsOf(r.arms[a].prompt).filter((l) => l.startsWith('Nothing from another picture shows through')),
      ).toHaveLength(1);
      expect(wordsOf(r.arms[a].prompt).some((l) => l.startsWith('Everyone and everything looks exactly'))).toBe(true);
    }
  });

  test('the only differences are the manifest and the phrase pointing the shot at the mock-up', () => {
    const [mockup, edit, free] = ARMS.map((a) => paragraphs(r.arms[a].prompt));
    expect(edit.length).toBe(free.length);
    expect(mockup.length).toBe(free.length);
    free.forEach((para, i) => {
      if (para.startsWith('The attached images, in order')) {
        expect(edit[i].startsWith('The attached images, in order')).toBe(true);
        expect(mockup[i].startsWith('The attached images, in order')).toBe(true);
        return;
      }
      expect(edit[i]).toBe(para);
      expect(mockup[i].replace(', as the mock-up in Image 1 shows it', '')).toBe(para);
    });
  });

  test('the mockup opens on the mock-up, the edit on the picture before, free on nothing; then the same images', () => {
    expect(r.previs?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(r.arms.mockup.images[0]).toMatchObject({ key: 'previs:m12', role: 'base' });
    expect(r.arms.mockup.prompt).toContain(
      'Image 1: EDIT THIS PICTURE. It is a rough grey mock-up of this exact picture',
    );
    expect(r.arms.edit.images[0]).toMatchObject({ key: 'picture:m11', role: 'base' });
    expect(r.arms.edit.prompt).toContain(
      'Image 1: EDIT THIS PICTURE. It is picture 11, the moment just before, in the same place.',
    );
    expect(r.arms.free.prompt).not.toContain('EDIT THIS PICTURE');
    // Today's plan names m11 for its light here, and no earlier moment goes in any arm.
    expect(keys(r, 'free')).toEqual(sketches);
    expect(keys(r, 'edit')).toEqual(['picture:m11', ...sketches]);
    expect(keys(r, 'mockup')).toEqual(['previs:m12', ...sketches]);
  });

  test('an earlier moment today attaches goes in no arm; its in-between picture goes in all three, alike', () => {
    const plan = heron.plan.cuts.find((c) => c.id === 'm5')!;
    expect(plan.refs.map((x) => `${x.kind}:${x.id}:${x.role}`)).toEqual(['cut:m4:composition', 'ghost:g2:identity']);
    const h = pairedArms(heron, 'm5');
    expect(h.notes.some((n) => n.startsWith("today's routing would also attach m4 (composition)"))).toBe(true);
    for (const a of ARMS) {
      expect(afterImage1(h, a).at(-1)).toMatchObject({ key: 'ghost:g2', role: 'identity' });
      expect(afterImage1(h, a).filter((im) => im.key.startsWith('picture:'))).toEqual([]);
    }
    // m4 is also the picture before: the edit arm's image 1, and in neither other arm.
    expect(keys(h, 'edit')[0]).toBe('picture:m4');
    expect([...keys(h, 'mockup'), ...keys(h, 'free')].filter((k) => k.startsWith('picture:'))).toEqual([]);
    // The in-between picture's manifest line is the same in all three.
    const ghostLine = (a: Arm) => linesAfterImage1(h, a).at(-1);
    expect(ghostLine('mockup')).toBe(ghostLine('free'));
    expect(ghostLine('edit')).toBe(ghostLine('free'));
  });

  test('every moment of three frozen dreams: the same words, and the same images after image 1', () => {
    let compared = 0;
    let ghosts = 0;
    for (const d of [lighthouse, heron, nightMarket])
      for (const c of d.plan.cuts) {
        if (!previousDrawn(d, c.id)) continue;
        const x = pairedArms(d, c.id);
        const words = JSON.stringify(wordsOf(x.arms.free.prompt));
        for (const a of ARMS) {
          expect(`${d.b.title} ${c.id} ${a}: ${JSON.stringify(wordsOf(x.arms[a].prompt))}`).toBe(
            `${d.b.title} ${c.id} ${a}: ${words}`,
          );
          expect(others(x, a)).toEqual(others(x, 'free'));
          // Every image after image 1 is a sketch or an in-between picture, and its image 1 is its own.
          expect(afterImage1(x, a).every((im) => /^(sketch|ghost):/.test(im.key))).toBe(true);
          expect(manifestOf(x.arms[a].prompt)).toHaveLength(x.arms[a].images.length);
        }
        // The mock-up is image 1 wherever today's plan has a camera; without one, the mockup arm has none.
        expect(keys(x, 'mockup')[0]).toBe(x.previs ? `previs:${c.id}` : keys(x, 'free')[0]);
        expect(keys(x, 'edit')[0]).toBe(`picture:${x.prev.id}`);
        // The in-between pictures come last, with the same lines in every arm.
        const n = afterImage1(x, 'free').filter((im) => im.key.startsWith('ghost:')).length;
        const last = (a: Arm) => linesAfterImage1(x, a).slice(linesAfterImage1(x, a).length - n);
        for (const a of ARMS) expect(last(a)).toEqual(last('free'));
        ghosts += n;
        compared++;
      }
    expect(compared).toBeGreaterThan(15);
    expect(ghosts).toBeGreaterThan(3);
  });

  test('the judging page gets the arms in turn through all six orders, unnamed; only the key says which is which', () => {
    const drawn = { mockup: '/x/mockup.jpg', edit: '/x/edit.jpg', free: '/x/free.jpg' };
    const set = Array.from({ length: 20 }, (_, i) => ({
      id: `moment-${i}`,
      moment: 'm12',
      title: `The lighthouse, ${i}`,
      told: ['a dream'],
      action: r.action,
      drawn,
    }));
    const { data, key, copies } = judgeSet([...set, { ...set[0], id: 'undrawn', drawn: {} }], 'Three ways');
    expect(data.runs.map((x) => x.run)).toEqual(set.map((m) => m.id));
    expect(JSON.stringify(data)).not.toMatch(/mockup|edit|free/);
    const shown = data.runs.map((x) => (x.moments as { id: string; img: string }[]).map((m) => m.id));
    shown.forEach((ids, i) => {
      expect(ids).toEqual(['a', 'b', 'c'].map((l) => `moment-${i}-${l}`));
      expect(ids.map((id) => key[id])).toEqual(orderAt(i));
    });
    expect(copies.map((c) => c.from)).toEqual(set.flatMap((_, i) => orderAt(i).map((a) => drawn[a])));
    // Each of the six orders, and each arm first, second and third 6 or 7 times over the 20.
    expect(new Set(ORDERS.map((o) => o.join())).size).toBe(6);
    expect(new Set(shown.map((ids) => ids.map((id) => key[id]).join())).size).toBe(6);
    const counts = placeCounts(20);
    for (const a of ARMS) {
      const seen = [0, 1, 2].map((at) => shown.filter((ids) => key[ids[at]] === a).length);
      expect(seen).toEqual(counts[a]);
      for (const n of seen) expect(n === 6 || n === 7).toBe(true);
    }
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
