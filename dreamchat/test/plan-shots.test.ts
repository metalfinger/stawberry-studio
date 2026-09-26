import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Breakdown } from '../producer';
import { applyPrep, planShots, reconcileGhosts, type Session } from '../session';

const detail = (value: string | null = null) => ({ value, said: false });

// The kitchen of the zikery dream, with the dreamer in it: seen from outside, then through their
// own eyes, turned to the board on the wall.
function kitchen(): Breakdown {
  const b = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'breakdown.json'), 'utf8')) as Breakdown;
  b.people = [
    {
      id: 'p1',
      name: 'you',
      is_dreamer: true,
      protagonist: true,
      fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
    },
  ];
  const [m1, m2] = b.scenes[0].moments;
  b.scenes[0].moments = [
    { ...m1, eyes: 'outside', visible: ['p1'], things: ['t1'] },
    { ...m2, eyes: 'dreamer', visible: [], things: ['t1'], looks_at: 'the departure board' },
  ];
  return b;
}

describe('the shots, planned while the chat goes on', () => {
  test('floor plans, cameras, previs and briefs, before anything is drawn', async () => {
    const b = kitchen();
    const briefs: string[] = [];
    const seen: string[] = [];
    const replanned: { only?: string[]; fix?: Record<string, string[]> }[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'plan-shots-'));
    const prep = await planShots(b, b.style_options[0], {
      block: async (x, again) => {
        if (again) replanned.push(again);
        const out = structuredClone(x);
        out.scenes[0].blocking = {
          front: 'the stove',
          indoors: true,
          spots: [
            { id: 'p1', x: 5, y: 5, kind: 'person', pose: 'standing' },
            { id: 't1', x: 1, y: 5, kind: 'thing', size: [0.1, 1.5, 1] },
          ],
        };
        return { breakdown: out, notes: [] };
      },
      shot: async (moment) => {
        briefs.push(moment);
        return 'A first-person view, turned left to the board on the wall.';
      },
      // The script supervisor finds a lasting change the breakdown missed.
      supervise: async () => [{ moment: 'm1', who: 't1', what: 'its slats', now: 'all blank but one' }],
      // "Storyboard complete?": m1's shot clears; m2's contradicts its moment.
      jev: async (state, questions) => {
        // What the script supervisor found: a change of how the board looks, of a part of it.
        if (Object.keys(questions).some((k) => k.startsWith('change_'))) {
          const answers = Object.fromEntries(
            Object.keys(questions).map((k) => [
              k,
              { type: 'noul' as const, noul: k.startsWith('change_') ? 0.9 : 0.1 },
            ]),
          );
          return { questions, state, answers, error: null, ms: 1, usage: null };
        }
        // The floor plan's facts: a room, and the board is on the wall, held by nobody.
        if ('outdoors' in questions) {
          seen.push(state);
          const answers = Object.fromEntries(
            Object.entries(questions).map(([k, q]) => [
              k,
              q.type === 'noul'
                ? { type: 'noul' as const, noul: 0.05 }
                : {
                    type: 'choice' as const,
                    choice: k.startsWith('shape_') ? 'block' : k.startsWith('holder_') ? 'nobody' : 't1',
                    confidence: 0.9,
                    probabilities: {},
                  },
            ]),
          );
          return { questions, state, answers, error: null, ms: 1, usage: null };
        }
        const m2 = Object.keys(questions).some((k) => k.endsWith('_m2'));
        const answer = (k: string) => ({
          type: 'noul' as const,
          noul:
            k.startsWith('sb_contradicts') && m2
              ? 0.9
              : k.startsWith('sb_contradicts') || k.startsWith('sb_extra')
                ? 0.1
                : 0.9,
        });
        seen.push(state);
        return {
          questions,
          state,
          answers: Object.fromEntries(Object.keys(questions).map((k) => [k, answer(k)])),
          error: null,
          ms: 1,
          usage: null,
        };
      },
      dir,
    });
    expect(prep.storyboard?.m1.ok).toBe(true);
    expect(prep.storyboard?.m2.ok).toBe(false);
    expect(prep.storyboard?.m2.reasons[0]).toContain('the shot disagrees with the moment');
    // Jev sees one moment and its shot, never the conversation; and each place's plan, for its facts.
    const checks = seen.filter((st) => st.includes('"shot"'));
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((st) => st.includes('"moment"') && !st.includes('"on_the_plan"'))).toBe(true);
    expect(seen.some((st) => st.includes('"on_the_plan"'))).toBe(true);
    expect(prep.blocking.s1.indoors).toBe(true);
    // m2 held, so its scene was planned again three ways: once told what its camera saw and what was
    // wrong, and twice afresh; none did better, so the first is kept.
    expect(replanned).toHaveLength(3);
    expect(replanned.every((r) => r.only?.join() === 's1')).toBe(true);
    expect(replanned[0].fix?.s1[0]).toContain('Moment m2');
    expect(replanned[0].fix?.s1[0]).toContain('the shot disagrees with the moment');
    expect(replanned.slice(1).every((r) => !r.fix)).toBe(true);
    expect(prep.previs.m2).not.toContain('-again');
    // Every camera is worked out, a previs and a brief each: seen from outside, and through the
    // dreamer's own eyes.
    expect(Object.keys(prep.previs).sort()).toEqual(['m1', 'm2']);
    expect(existsSync(prep.previs.m1) && existsSync(prep.previs.m2)).toBe(true);
    // Briefed on each plan: the first, and the three made again for the held scene.
    expect(briefs).toHaveLength(8);
    expect(prep.shots.m2.text).toBe('A first-person view, turned left to the board on the wall.');
    expect(prep.shots.m2.view).toContain('toward the departure board');
    // One person is named, never "them", and the picture says nobody else is in it.
    expect(prep.shots.m1.view).toStartWith('Seen from in front of the dreamer');
    expect(prep.shots.m1.view).toContain('Nobody else is in the picture.');
    expect(prep.blocking.s1.front).toBe('the stove');

    // Kept on the conversation for this dream, its floor plans with it; never for a dream since changed.
    const s: Pick<Session, 'draft' | 'prep'> = { draft: { status: 'ready', basedOn: 1, breakdown: b } };
    applyPrep(s, prep);
    expect(s.prep?.shots).toBe(prep.shots);
    expect(s.draft?.breakdown?.scenes[0].blocking?.front).toBe('the stove');
    // The change found where the board is first shown is how it looks, not a change: written into
    // its profile, so its sketch and every moment of it carry it (the orchard's glowing apples, 26 Sep).
    // And the plan is known by the dream as it now stands: planned again for it, it would not be
    // planned twice.
    expect(s.draft?.breakdown?.scenes[0].moments[0].leaves ?? []).not.toContainEqual(
      expect.objectContaining({ who: 't1', what: 'its slats' }),
    );
    expect(s.draft?.breakdown?.things.find((x) => x.id === 't1')?.fields.appearance?.value).toContain(
      'all blank but one',
    );
    expect(s.prep?.basedOn).not.toBe(prep.basedOn);
    const changed: Pick<Session, 'draft' | 'prep'> = {
      draft: { status: 'ready', basedOn: 2, breakdown: { ...kitchen(), title: 'another dream' } },
    };
    applyPrep(changed, prep);
    expect(changed.prep).toBeUndefined();
    expect(changed.draft?.breakdown?.scenes[0].blocking).toBeUndefined();
  });
});

describe('a scene its plan left someone or something out of', () => {
  test('is planned once more, told to give everyone and everything in it a spot', async () => {
    const b = kitchen();
    const calls: ({ only?: string[]; fix?: Record<string, string[]> } | undefined)[] = [];
    const prep = await planShots(b, b.style_options[0], {
      block: async (x, again) => {
        calls.push(again);
        const out = structuredClone(x);
        // The first plan gave the board no spot, so the scene was left without one.
        if (again)
          out.scenes[0].blocking = {
            front: 'the stove',
            indoors: true,
            spots: [
              { id: 'p1', x: 5, y: 5, kind: 'person', pose: 'standing' },
              { id: 't1', x: 1, y: 5, kind: 'thing', size: [0.1, 1.5, 1] },
            ],
          };
        return { breakdown: out, notes: [] };
      },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.only).toEqual(['s1']);
    expect(calls[1]?.fix?.s1[0]).toContain('had no spot');
    expect(calls[1]?.fix?.s1[0]).toContain('the dreamer (p1)');
    expect(calls[1]?.fix?.s1[0]).toContain('(t1)');
    expect(prep.blocking.s1.front).toBe('the stove');
  });
});

describe('a fresh prep on a dream that already had plans', () => {
  test('replaces its floor plans and its changes as Jev read them, unless turned off', () => {
    const fresh = {
      front: 'the stove',
      indoors: true,
      spots: [{ id: 'p1', x: 5, y: 5, kind: 'person' as const, pose: 'standing' as const }],
    };
    const make = () => {
      const b = kitchen();
      b.scenes[0].blocking = { front: 'missing', indoors: true, spots: [] };
      b.scenes[0].moments[0].leaves = [{ who: 'p1', what: 'hair', now: 'white' }];
      const s: Pick<Session, 'draft' | 'prep'> = { draft: { status: 'ready', basedOn: 1, breakdown: b } };
      return { s, b };
    };
    const { s, b } = make();
    const prep = {
      basedOn: '',
      blocking: { s1: fresh },
      shots: {},
      previs: {},
      // Where the dreamer is first shown, their white hair is how they look, not a change.
      leaves: { m1: [], m2: [] },
      ms: 0,
    };
    // Known by the dream as it stands, without its plans.
    const key = (x: typeof b) => {
      const plain = { ...x, scenes: x.scenes.map(({ blocking: _, ...sc }) => sc) };
      return new Bun.CryptoHasher('sha256').update(JSON.stringify(plain)).digest('hex');
    };
    applyPrep(s, { ...prep, basedOn: key(b) });
    expect(s.draft?.breakdown?.scenes[0].blocking?.front).toBe('the stove');
    expect(s.draft?.breakdown?.scenes[0].moments[0].leaves).toEqual([]);

    process.env.DREAMCHAT_PREP_REPLACES = 'off';
    try {
      const kept = make();
      applyPrep(kept.s, { ...prep, basedOn: key(kept.b) });
      expect(kept.s.draft?.breakdown?.scenes[0].blocking?.front).toBe('missing');
      expect(kept.s.draft?.breakdown?.scenes[0].moments[0].leaves).toHaveLength(1);
    } finally {
      delete process.env.DREAMCHAT_PREP_REPLACES;
    }
  });
});

describe('a plan made again mid-dream', () => {
  test('knows its in-between references by what they show, not their number', () => {
    const state = (now: string, since: string) => ({ who: 'p1', what: 'head', now, since });
    const ghost = (id: string, now: string, since: string, after?: string) => ({
      id,
      kind: 'state' as const,
      of: 'p1',
      label: now,
      change: now,
      from: null,
      ...(after ? { after } : {}),
      needs: after ? [after] : [],
      usedBy: [],
      why: '',
      state: state(now, since),
      depth: 1,
    });
    // Drawn before the ice block was found: g1 is the horse head.
    const drawn = [
      {
        id: 'g1',
        kind: 'ghost',
        name: 'horse',
        fields: {},
        status: 'ready',
        version: 1,
        ghost: ghost('g1', 'a horse head', 'm5'),
      },
    ];
    // Planned again with the ice block first: g1 is the ice block, g2 the horse head after it.
    const plan = {
      cuts: [
        { id: 'm4', refs: [{ id: 'g1', kind: 'ghost', role: 'identity', carries: '' }], needs: ['g1'] },
        { id: 'm5', refs: [{ id: 'g2', kind: 'ghost', role: 'identity', carries: '' }], needs: ['g2'] },
      ],
      ghosts: [ghost('g1', 'an ice block', 'm3'), ghost('g2', 'a horse head', 'm5', 'g1')],
      issues: [],
    };
    const out = reconcileGhosts(plan as never, drawn as never);
    // The horse head keeps the picture drawn for it; the ice block gets an id no picture has.
    expect(out.ghosts.map((g) => [g.id, g.state?.now])).toEqual([
      ['g2', 'an ice block'],
      ['g1', 'a horse head'],
    ]);
    expect(out.ghosts[1].after).toBe('g2');
    expect(out.cuts.map((c) => c.needs)).toEqual([['g2'], ['g1']]);
  });
});
