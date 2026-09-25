// The dream's resolved tree (tree.ts), on four real dreams and a handful of made-up ones: its shape,
// where every value comes from, the looks ledger, and what it would ask. The real dreams are frozen
// in evals/sources: meads-third, ice-head and theater hold the breakdown with its floor plans and the
// storyboard's readings; meads-fourth is today's Meads, with its sketches, chosen look, grounding
// notes and goals as the conversation read them.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bearing, type Blocking } from '../blocking';
import { calledIn, planBy, planContinuity } from '../continuity';
import { dreamConfig } from '../dream';
import type { GroundingNote } from '../ground';
import type { Breakdown, Moment, StyleOption } from '../producer';
import { type Prep, reconcileGhosts, type Session, SessionStore, treeInputOf } from '../session';
import type { Item } from '../sheets';
import {
  type Basis,
  cutsOf,
  type DreamTree,
  type FieldKey,
  type Goals,
  LEVELS,
  resolveTree,
  type Source,
  type TreeInput,
  type TreePrep,
} from '../tree';
import { fakeHost, fakeJev } from './fakes';

// ── the frozen dreams ────────────────────────────────────────────────────────
type Frozen = {
  draft: { breakdown: Breakdown; downgraded?: GroundingNote[] };
  prep?: TreePrep & { basedOn?: string };
  style?: StyleOption | null;
  build?: { items?: Item[]; frames?: Item[] };
  goals?: Goals;
};
const FIXTURES = ['meads-third', 'ice-head', 'theater', 'meads-fourth'] as const;
type Fixture = (typeof FIXTURES)[number];
const frozen = (name: Fixture): Frozen =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'evals', 'sources', `${name}.json`), 'utf8'));

/** session.ts's planKey (private there): the dream without its floor plans. The adapter test checks they agree. */
const planKey = (b: Breakdown) =>
  new Bun.CryptoHasher('sha256')
    .update(JSON.stringify({ ...b, scenes: b.scenes.map(({ blocking: _, ...sc }) => sc) }))
    .digest('hex');

function inputOf(name: Fixture): TreeInput {
  const f = frozen(name);
  const b = f.draft.breakdown;
  return {
    breakdown: b,
    plan: planContinuity(b),
    prep: f.prep,
    prepFresh: f.prep?.basedOn ? planKey(b) === f.prep.basedOn : null,
    items: f.build?.items,
    frames: f.build?.frames,
    style: f.style ?? null,
    downgraded: f.draft.downgraded,
    goals: f.goals,
  };
}
// A cold tree costs up to a second (every camera is rendered): each dream is resolved once.
const trees = new Map<Fixture, DreamTree>();
const treeOf = (name: Fixture): DreamTree => {
  let t = trees.get(name);
  if (!t) trees.set(name, (t = resolveTree(inputOf(name))));
  return t;
};

const scenesOf = (t: DreamTree) => t.dream.sequences.flatMap((q) => q.scenes);
const shotsOf = (t: DreamTree) => scenesOf(t).flatMap((s) => s.shots);
const sceneIn = (t: DreamTree, id: string) => scenesOf(t).find((s) => s.id === id)!;
const shotIn = (t: DreamTree, id: string) => shotsOf(t).find((s) => s.id === id)!;
const cutIn = (t: DreamTree, id: string) => cutsOf(t).find((c) => c.id === id)!;
const rowIn = (t: DreamTree, id: string) => t.ledger.rows.find((r) => r.element === id)!;
const nodesOf = (t: DreamTree) => [t.dream, ...t.dream.sequences, ...scenesOf(t), ...shotsOf(t), ...cutsOf(t)];
const gapIds = (t: DreamTree) => t.gaps.map((g) => g.id);
const flagIds = (t: DreamTree) => t.flags.map((f) => f.id);

/** Every source anywhere in the tree, with where it sits. */
function sourcesIn(v: unknown, where: string, out: [string, Source][] = []): [string, Source][] {
  if (!v || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    v.forEach((x, i) => sourcesIn(x, `${where}[${i}]`, out));
    return out;
  }
  const o = v as Record<string, unknown>;
  if (typeof o.level === 'string' && typeof o.node === 'string' && typeof o.path === 'string' && 'basis' in o)
    out.push([where, o as unknown as Source]);
  for (const [k, x] of Object.entries(o)) sourcesIn(x, `${where}.${k}`, out);
  return out;
}

// The design's sheet keys per level, each level's sheet holding every key of the levels above it.
const DREAM_KEYS: FieldKey[] = ['title', 'rules', 'style', 'medium', 'oneColour', 'colours', 'texture', 'lightGrade'];
const SEQUENCE_KEYS: FieldKey[] = [...DREAM_KEYS, 'opens', 'feeling'];
const SCENE_KEYS: FieldKey[] = [...SEQUENCE_KEYS, 'place', 'time', 'indoors', 'room', 'front', 'lightSource', 'line'];
const SHOT_KEYS: FieldKey[] = [
  ...SCENE_KEYS,
  ...(['eyes', 'size', 'camera', 'lens', 'faces', 'subject', 'role', 'side', 'screen', 'background'] as const),
  ...(['previs', 'brief'] as const),
];
const CUT_KEYS: FieldKey[] = [
  ...SHOT_KEYS,
  ...(['action', 'visualPoint', 'dreamlike', 'purpose', 'key', 'told', 'view', 'framing', 'transition'] as const),
];
const KEYS_AT = { dream: DREAM_KEYS, sequence: SEQUENCE_KEYS, scene: SCENE_KEYS, shot: SHOT_KEYS, cut: CUT_KEYS };
const PATH = /^(b|items|plan|cont|prep|style|code|default|none):\S+$/;
const BASES: Basis[] = ['said', 'chosen', 'read', 'derived', 'guessed', 'default', 'forgotten', 'unknown'];

// ── made-up dreams, built as continuity.test.ts builds them ─────────────────
const detail = (value: string | null = null) => ({ value, said: false });

function moment(m: Partial<Moment> & { id: string }): Moment {
  return {
    action: `moment ${m.id}`,
    visible: [],
    things: [],
    place: 'l1',
    eyes: 'outside',
    distance: 'medium',
    looks_at: '',
    feeling: '',
    visual_point: '',
    purpose: '',
    continues: false,
    leaves: [],
    shift: '',
    key: false,
    said: true,
    ...m,
  };
}

function breakdown(ms: Moment[], extra: Partial<Breakdown> = {}): Breakdown {
  return {
    title: 't',
    logline: '',
    look: { colours: detail(), light: detail(), texture: detail() },
    world_logic: '',
    people: [
      {
        id: 'p1',
        name: 'ana',
        is_dreamer: false,
        protagonist: true,
        fields: { identity: detail(), appearance: detail(), wardrobe: detail(), distinctive_features: detail() },
      },
    ],
    places: [
      { id: 'l1', name: 'the kitchen', fields: { geography: detail(), landmarks: detail(), light: detail() } },
      { id: 'l2', name: 'the street', fields: { geography: detail(), landmarks: detail(), light: detail() } },
    ],
    things: [{ id: 't1', name: 'the board', fields: { appearance: detail(), materials: detail() } } as never],
    scenes: [{ id: 's1', title: '', place: 'l1', mood: '', moments: ms }],
    style_options: [],
    unknowns: [],
    ...extra,
  };
}

/** The kitchen's floor plan: ana in the middle of it. */
const kitchen: Blocking = { front: 'the door', spots: [{ id: 'p1', x: 5, y: 5, kind: 'person' }] };
const planned = (ms: Moment[], blocking: Blocking | null = kitchen) =>
  breakdown(ms, {
    scenes: [{ id: 's1', title: '', place: 'l1', mood: '', moments: ms, ...(blocking ? { blocking } : {}) }],
  });
const treeFor = (b: Breakdown, extra: Partial<TreeInput> = {}) =>
  resolveTree({ breakdown: b, plan: planContinuity(b), ...extra });

/** The same floor plans with every fixture's x id numbered otherwise: what a re-plan may do. */
function renumbered(b: Breakdown): Breakdown {
  const out = structuredClone(b);
  const redo = (p: Blocking) => {
    const xs = p.spots.filter((s) => /^x\d+$/.test(s.id)).map((s) => s.id);
    const to = new Map(xs.map((x, i) => [x, `x${xs.length - i + 10}`]));
    const r = (id: string) => to.get(id) ?? id;
    for (const s of p.spots) {
      s.id = r(s.id);
      if (s.faces) s.faces = r(s.faces);
      if (s.heldBy) s.heldBy = r(s.heldBy);
    }
    for (const list of Object.values(p.moves ?? {}))
      for (const mv of list) {
        mv.id = r(mv.id);
        if (mv.faces) mv.faces = r(mv.faces);
      }
    for (const k of Object.keys(p.looks ?? {})) p.looks![k] = r(p.looks![k]);
    for (const sub of Object.values(p.places ?? {})) redo(sub);
  };
  for (const sc of out.scenes) if (sc.blocking) redo(sc.blocking);
  return out;
}

// ── A. pure and well formed ──────────────────────────────────────────────────
describe('A. the tree is pure and well formed', () => {
  for (const name of FIXTURES) {
    test(`${name}: the same input gives the same tree, the input is left as it was, and nothing is fetched`, () => {
      const input = inputOf(name);
      const before = structuredClone(input);
      const real = globalThis.fetch;
      let fetched = 0;
      globalThis.fetch = Object.assign(
        () => {
          fetched += 1;
          throw new Error('the tree must not fetch');
        },
        { preconnect: () => {} },
      ) as unknown as typeof fetch;
      try {
        const a = resolveTree(input);
        const b = resolveTree(input);
        expect(a).toEqual(b);
        expect(input).toEqual(before);
        expect(fetched).toBe(0);
      } finally {
        globalThis.fetch = real;
      }
    });

    test(`${name}: every sheet has exactly its level's keys, each from a known level, path and basis`, () => {
      for (const n of nodesOf(treeOf(name))) {
        expect(Object.keys(n.sheet).sort()).toEqual([...KEYS_AT[n.level]].sort());
        for (const f of Object.values(n.sheet) as { from: Source }[]) {
          expect(LEVELS).toContain(f.from.level);
          expect(f.from.path).toMatch(PATH);
          expect(BASES).toContain(f.from.basis);
        }
      }
    });

    // Design correction: an unknown value is put at its owner node too (§5.1: level = the owner,
    // node = the nearest owner-level node), so "own = the keys whose from names this node" holds
    // only for keys that have a value. A null there is no value the node's data sets.
    test(`${name}: every value a node's own data sets is listed as its own`, () => {
      for (const n of nodesOf(treeOf(name))) {
        const set = Object.entries(n.sheet)
          .filter(([, f]) => {
            const x = f as { value: unknown; from: Source };
            return x.from.node === n.id && x.from.level === n.level && x.value !== null;
          })
          .map(([k]) => k);
        for (const k of set) expect(n.own as string[]).toContain(k);
      }
    });

    test(`${name}: moments are cut once each, cuts sit in one scene each, and each continuity shot is one shot node`, () => {
      const input = inputOf(name);
      const t = treeOf(name);
      const ms = input.breakdown.scenes.flatMap((s) => s.moments.map((m) => m.id));
      expect(cutsOf(t).map((c) => c.id)).toEqual(ms);
      const spans = scenesOf(t).flatMap((s) => s.span);
      expect([...spans].sort()).toEqual([...ms].sort());
      const planShots = [...new Set(input.plan.cuts.map((c) => c.shot))].sort();
      expect(
        shotsOf(t)
          .map((s) => s.id)
          .sort(),
      ).toEqual(planShots);
      for (const s of scenesOf(t))
        for (const sh of s.shots) {
          expect(sh.cuts.map((c) => c.id)).toEqual(input.plan.cuts.filter((c) => c.shot === sh.id).map((c) => c.id));
          for (const c of sh.cuts) {
            const q = t.dream.sequences.find((x) => x.scenes.includes(s))!;
            expect(t.index[c.id]).toEqual({ sequence: q.id, scene: s.id, shot: sh.id, order: c.order });
          }
        }
      expect(Object.keys(t.index).sort()).toEqual([...ms].sort());
    });

    test(`${name}: every person, place and thing is an element with one category`, () => {
      const b = inputOf(name).breakdown;
      const t = treeOf(name);
      for (const x of [...b.people, ...b.places, ...b.things]) {
        expect(t.elements[x.id]).toBeDefined();
        expect(typeof t.elements[x.id].category.value).toBe('string');
      }
    });
  }

  test('a node lists as its own only the values its own data sets, never a default or a sketch', () => {
    for (const name of FIXTURES)
      for (const n of nodesOf(treeOf(name)))
        for (const k of n.own as string[]) {
          const f = (n.sheet as Record<string, { from: Source }>)[k];
          expect(`${n.id}.${k} ${f.from.level}:${f.from.node}`).toBe(`${n.id}.${k} ${n.level}:${n.id}`);
        }
  });

  test('every source anywhere in the tree follows the path grammar', () => {
    for (const name of FIXTURES)
      for (const [where, s] of sourcesIn(treeOf(name), name)) expect(`${where} ${s.path}`).toMatch(/ \S+:\S+$/);
  });

  test('a change in the picture through its subject is called by its name', () => {
    const t = treeOf('ice-head');
    expect(cutIn(t, 'm3').at['p1@m3:head'].called.value).toBe(t.elements['p1@m3:head'].name);
    const th = treeOf('theater');
    expect(cutIn(th, 'm2').at['t2@m2:form'].called.value).toBe("the big sofa's form: roller coaster");
  });
});

// ── B. derivation ────────────────────────────────────────────────────────────
describe('B. scenes, shots and sequences', () => {
  test('meads-third: five film scenes from four breakdown scenes, nine shots, numbered as a 1st AD would', () => {
    const t = treeOf('meads-third');
    expect(t.dream.sequences.map((q) => q.id)).toEqual(['q:m1']);
    expect(scenesOf(t).map((s) => [s.id, s.number])).toEqual([
      ['s1/l2', '1'],
      ['s2/l3', '2A'],
      ['s2/l4', '2B'],
      ['s3/l5', '3'],
      ['s4/l6', '4'],
    ]);
    expect(sceneIn(t, 's2/l4').plan).toBe('plan:s2/l4');
    expect(shotsOf(t).map((s) => s.number)).toEqual(['1-1', '1-2', '2A-1', '2A-2', '2B-1', '3-1', '3-2', '3-3', '4-1']);
    expect(sceneIn(t, 's1/l2').breakdown.heading).toBe('EXT. THE EUROPEAN VILLAGE — TIME UNKNOWN');
    expect(sceneIn(t, 's4/l6').breakdown.heading).toBe('INT. INSIDE, SITTING WITH COUPLE OF PEOPLE — TIME UNKNOWN');
  });

  test('ice-head: one scene, whose shots need not be one unbroken run of cuts', () => {
    const t = treeOf('ice-head');
    expect(scenesOf(t).map((s) => s.id)).toEqual(['s1/l1']);
    expect(shotsOf(t).map((s) => [s.id, s.cuts.map((c) => c.id)])).toEqual([
      ['s1.sh1', ['m1', 'm3']],
      ['s1.sh2', ['m2']],
      ['s1.sh3', ['m4', 'm5']],
    ]);
    expect(shotIn(t, 's1.sh3').lead).toBe('m4');
    // Shot contiguity is not scene contiguity: nothing else is cut to between its pictures.
    expect(sceneIn(t, 's1/l1').intercut).toBe(false);
  });

  test('theater: the sofa that becomes a roller coaster is a morph inside one scene, and needs no question', () => {
    const t = treeOf('theater');
    expect(scenesOf(t)).toHaveLength(1);
    expect(t.dream.sequences).toHaveLength(1);
    expect(t.ledger.breaks).toHaveLength(1);
    const brk = t.ledger.breaks[0];
    expect(brk).toMatchObject({ id: 'brk:m2', kind: 'morph', breaks: ['t2@m2:form', 'staging', 'place_refs'] });
    expect([...brk.keeps].sort()).toEqual(['l1', 'p1', 'p2', 'p3', 't1']);
    expect(t.gaps.filter((g) => g.kind === 'shift')).toEqual([]);
  });

  test('a shift into a place the last one turned into is one scene with two places, and one sequence', () => {
    const t = treeFor(
      planned([
        moment({ id: 'm1', visible: ['p1'] }),
        moment({
          id: 'm2',
          visible: ['p1'],
          place: 'l2',
          shift: 'the kitchen turns into the street',
          leaves: [{ who: 'l1', what: 'form', now: 'the street' }],
        }),
      ]),
    );
    expect(scenesOf(t).map((s) => [s.id, s.places])).toEqual([['s1/l1', ['l1', 'l2']]]);
    expect(t.ledger.breaks.map((x) => [x.id, x.kind])).toEqual([['brk:m2', 'morph']]);
    expect(t.dream.sequences.map((q) => q.id)).toEqual(['q:m1']);
    // The cut in the second place says so itself.
    expect(cutIn(t, 'm2').sheet.place).toMatchObject({ value: 'l2', from: { level: 'cut', rule: 'place morph' } });
  });

  test('a shift into another place with nothing turning into it is a jump: a new scene and sequence', () => {
    const t = treeFor(
      planned([
        moment({ id: 'm1', visible: ['p1'] }),
        moment({ id: 'm2', visible: ['p1'], place: 'l2', shift: 'suddenly I was in the street' }),
      ]),
    );
    expect(t.dream.sequences.map((q) => [q.id, q.splitBy])).toEqual([
      ['q:m1', 'start'],
      ['q:m2', 'jump'],
    ]);
    expect(scenesOf(t).map((s) => s.id)).toEqual(['s1/l1', 's1/l2']);
    expect(t.dream.sequences[1].sheet.opens).toMatchObject({
      value: 'suddenly I was in the street',
      from: { level: 'sequence', node: 'q:m2', path: 'b:m2.shift', basis: 'said' },
    });
  });

  test('a return to a place rejoins its scene, intercut, and its continuity shot stays there', () => {
    const b = planned([
      moment({ id: 'm1', visible: ['p1'], distance: 'wide', looks_at: 'the door' }),
      moment({ id: 'm2', visible: ['p1'], place: 'l2', looks_at: 'the road' }),
      moment({ id: 'm3', visible: ['p1'], distance: 'wide', looks_at: 'the door', from: 'm1', sameSide: ['m1'] }),
    ]);
    const t = treeFor(b);
    expect(scenesOf(t).map((s) => [s.id, s.intercut])).toEqual([
      ['s1/l1', true],
      ['s1/l2', false],
    ]);
    const plan = planContinuity(b);
    expect(plan.cuts.find((c) => c.id === 'm3')!.shot).toBe(plan.cuts.find((c) => c.id === 'm1')!.shot);
    expect(t.index.m3).toMatchObject({ scene: 's1/l1', shot: t.index.m1.shot });
    expect(t.flags.filter((f) => f.code === 'shot_spans_scenes')).toEqual([]);
  });

  test('the same place again after a jump is another scene, named after the jump', () => {
    const t = treeFor(
      planned([
        moment({ id: 'm1', visible: ['p1'] }),
        moment({ id: 'm2', visible: ['p1'], place: 'l2', shift: 'suddenly I was in the street' }),
        moment({ id: 'm3', visible: ['p1'] }),
      ]),
    );
    expect(scenesOf(t).map((s) => s.id)).toEqual(['s1/l1', 's1/l2', 's1/l1@m2']);
  });

  test('a moment with no place is a scene of its own place, "-"', () => {
    const t = treeFor(planned([moment({ id: 'm1', visible: ['p1'], place: '' })]));
    expect(scenesOf(t).map((s) => s.id)).toEqual(['s1/-']);
  });

  test('a moment with no place asks where it is', () => {
    const t = treeFor(planned([moment({ id: 'm1', visible: ['p1'], place: '' })]));
    expect(t.gaps.filter((g) => g.kind === 'where' && g.node === 's1/-')).toHaveLength(1);
  });

  test('a scene with no floor plan does not know whether it is indoors, and is flagged', () => {
    const t = treeFor(planned([moment({ id: 'm1', visible: ['p1'] })], null));
    const s = sceneIn(t, 's1/l1');
    expect(s.plan).toBeNull();
    expect(s.sheet.indoors).toMatchObject({ value: null, from: { level: 'scene', basis: 'unknown' } });
    expect(s.breakdown.heading.startsWith('INT/EXT? ')).toBe(true);
    expect(flagIds(t)).toContain('no_plan:s1/l1');
  });

  test('a place with no plan of its own is drawn on the scene plan, and flagged', () => {
    const t = treeFor(
      planned([moment({ id: 'm1', visible: ['p1'] }), moment({ id: 'm2', visible: ['p1'], place: 'l2' })]),
    );
    expect(sceneIn(t, 's1/l2').plan).toBe('plan:s1');
    expect(flagIds(t)).toContain('borrowed_plan:s1/l2');
  });

  test('a shift in the same place with nothing turning is a morph, and asks what changed around them', () => {
    const t = treeFor(
      planned([
        moment({ id: 'm1', visible: ['p1'] }),
        moment({ id: 'm2', visible: ['p1'], shift: 'suddenly it was night' }),
      ]),
    );
    expect(t.ledger.breaks.map((x) => [x.id, x.kind])).toEqual([['brk:m2', 'morph']]);
    expect(scenesOf(t).map((s) => s.id)).toEqual(['s1/l1']);
    expect(t.gaps.find((g) => g.id === 'shift:m2')).toMatchObject({ kind: 'shift', level: 'scene', basis: 'read' });
  });
});

// ── C. elements ──────────────────────────────────────────────────────────────
describe('C. elements', () => {
  const category = (name: Fixture, id: string) => treeOf(name).elements[id].category;

  test('meads-third: people, things and fixtures each take one category, from the plan where it says', () => {
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(category('meads-third', id).value).toBe('cast');
    expect(category('meads-third', 'p5')).toMatchObject({ value: 'crowd', from: { path: 'b:p5.extras' } });
    expect(category('meads-third', 't1')).toMatchObject({
      value: 'prop',
      from: { basis: 'read', path: 'plan:s2/l4.spots.t1.shape' },
    });
    expect(category('meads-third', 't2').value).toBe('vehicle');
    expect(category('meads-third', 't3')).toMatchObject({
      value: 'held_prop',
      from: { path: 'plan:s4.spots.t3.heldBy' },
    });
    for (const id of ['l2/cobblestone-street', 'l5/road', 'l5/little-bridge'])
      expect(category('meads-third', id).value).toBe('ground');
    for (const id of ['l3/back-stairs', 'l3/second-set-of-stairs'])
      expect(category('meads-third', id).value).toBe('steps');
    expect(category('meads-third', 'l5/creek').value).toBe('set_dressing');
    expect(category('meads-third', 'l6/sofa').value).toBe('seat');
  });

  test('meads-fourth, theater and ice-head: a corner and an autoclave are set dressing, a sofa sat on is a seat', () => {
    expect(category('meads-fourth', 'l3/corner').value).toBe('set_dressing');
    // Design correction: the path names the function that decides it, previs.ts's shapeOf, which
    // kept its name (§1.1 planned to export it as shapeAt).
    expect(category('theater', 't1')).toMatchObject({
      value: 'seat',
      from: { basis: 'derived', path: 'code:shapeOf(s1,t1)', rule: 'sat' },
    });
    expect(category('theater', 't2').value).toBe('prop');
    expect(category('theater', 'p3').value).toBe('crowd');
    expect(category('ice-head', 'l1/autoclave').value).toBe('set_dressing');
  });

  test('a fixture with no shape is set dressing read from its fixture flag', () => {
    expect(category('ice-head', 'l1/autoclave')).toMatchObject({
      value: 'set_dressing',
      from: { basis: 'read', path: 'plan:s1.spots.x1.fixture' },
    });
  });

  test("a fixture is known by its place and name, its plan's x ids only aliases, whatever they are numbered", () => {
    const t = treeOf('meads-third');
    expect(t.elements['l2/cobblestone-street'].aliases).toEqual([{ plan: 'plan:s1', id: 'x1' }]);
    expect(t.elements['l3/back-stairs'].aliases).toEqual([{ plan: 'plan:s2', id: 'x1' }]);
    expect(t.elements['l5/road'].aliases).toEqual([{ plan: 'plan:s3', id: 'x1' }]);
    for (const name of ['meads-third', 'ice-head'] as const) {
      const input = inputOf(name);
      const b = renumbered(input.breakdown);
      const again = resolveTree({ ...input, breakdown: b, plan: planContinuity(b) });
      expect(Object.keys(again.elements).sort()).toEqual(Object.keys(treeOf(name).elements).sort());
    }
  });

  test('cast is billed with the protagonist first, then by first appearance; a crowd has no number', () => {
    const t = treeOf('meads-third');
    expect(['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => t.elements[id].number)).toEqual([1, 2, 3, 4, undefined]);
    const ice = treeOf('ice-head');
    expect(ice.elements.p1.number).toBe(1);
    expect(ice.elements.p2.number).toBe(2);
  });

  test('meads-third: the balloons in hand, the sofa seen, and who rides in the convertible', () => {
    const t = treeOf('meads-third');
    const m9 = cutIn(t, 'm9').at;
    expect(m9.t3.present).toBe('listed');
    expect(m9.t3.holder).toMatchObject({ value: 'p1', from: { level: 'scene', path: 'plan:s4.spots.t3.heldBy' } });
    expect(m9['l6/sofa'].present).toBe('sees');
    expect(m9.p1.on).toMatchObject({ value: { how: 'on', id: 'l6/sofa' }, from: { basis: 'derived' } });
    const m7 = cutIn(t, 'm7').at;
    expect(m7.p1.on?.value).toEqual({ how: 'in', id: 't2' });
    expect(m7.p4.on?.value).toEqual({ how: 'in', id: 't2' });
    const m6 = cutIn(t, 'm6').at;
    expect(m6.p4.on?.value).toEqual({ how: 'in', id: 't2' });
    expect(m6.p1.on).toBeUndefined();
  });

  test("theater: through the dreamer's eyes the dreamer is the camera", () => {
    const t = treeOf('theater');
    expect(cutIn(t, 'm3').at.p1.present).toBe('camera');
    expect(t.elements['cam:s1.sh3'].links).toContainEqual(expect.objectContaining({ kind: 'pov_of', to: 'p1' }));
  });

  test('every person, place and thing is called as its cut calls it; fixtures by their plan name', () => {
    for (const name of FIXTURES) {
      const input = inputOf(name);
      const b = input.breakdown;
      const t = treeOf(name);
      const told = new Set([...b.people, ...b.places, ...b.things].map((x) => x.id));
      for (const c of cutsOf(t)) {
        const called = calledIn(
          b,
          input.plan.cuts.find((x) => x.id === c.id)!,
        );
        for (const e of Object.values(c.at)) {
          if (told.has(e.id)) expect(`${c.id} ${e.id} ${e.called.value}`).toBe(`${c.id} ${e.id} ${called(e.id)}`);
          const fixture = t.elements[e.id].links.find((l) => l.kind === 'fixture_of');
          if (fixture) expect(e.called.value).toBe(t.elements[e.id].name);
        }
      }
    }
    const t = treeOf('theater');
    expect(cutIn(t, 'm1').at.t2.called.value).toBe('the big sofa');
    for (const c of ['m2', 'm3'])
      expect(cutIn(t, c).at.t2.called).toMatchObject({
        value: 'roller coaster',
        from: { level: 'cut', rule: 'calledIn' },
      });
    expect(cutIn(treeOf('ice-head'), 'm1').at['l1/autoclave'].called).toMatchObject({
      value: 'the autoclave',
      from: { path: 'plan:s1.spots.x1.name' },
    });
  });

  test('theater: what a moment names that its previs does not show', () => {
    const t = treeOf('theater');
    expect(cutIn(t, 'm1').unseen).toEqual(['p2', 't2']);
    expect(cutIn(t, 'm2').unseen).toEqual(['p2']);
    expect(cutIn(t, 'm3').unseen).toEqual([]);
  });
});

// ── D. inheritance ───────────────────────────────────────────────────────────
describe('D. where each value comes from', () => {
  test('ice-head: a base edit keeps its shot camera, and does not set one of its own', () => {
    const m5 = cutIn(treeOf('ice-head'), 'm5');
    expect(m5.sheet.camera.from).toMatchObject({ level: 'shot', node: 's1.sh3', path: 'cont:m4.eye' });
    expect(m5.own).not.toContain('camera');
  });

  test("ice-head: a cut whose camera moved sets its own over the shot's, and is flagged, the dream's only flag", () => {
    const t = treeOf('ice-head');
    const m3 = cutIn(t, 'm3');
    expect(m3.sheet.camera.from.level).toBe('cut');
    expect(m3.sheet.camera.over?.from.path).toBe('cont:m1.eye');
    expect(m3.own).toEqual(expect.arrayContaining(['camera', 'side', 'background']));
    expect(t.flags).toHaveLength(1);
    const f = t.flags[0];
    expect(f.code).toBe('camera_moved');
    const now = f.now as { moved: number; turned: number };
    expect(now.moved).toBeCloseTo(3.16, 2);
    expect(now.turned).toBe(90);
  });

  test("ice-head: a cut whose camera moved sets its own left-to-right order over the shot's", () => {
    const input = inputOf('ice-head');
    const m3 = cutIn(treeOf('ice-head'), 'm3');
    const eye = input.plan.cuts.find((c) => c.id === 'm3')!.eye!;
    const pb = planBy(input.breakdown, 'm3')!;
    const order = ['p1', 'x1']
      .map((id) => ({ id: id === 'x1' ? 'l1/autoclave' : id, s: pb.spots.find((s) => s.id === id)! }))
      .sort((a, b) => bearing(eye.at, eye.d, a.s).angle - bearing(eye.at, eye.d, b.s).angle)
      .map((x) => x.id);
    expect(m3.sheet.screen).toMatchObject({ value: order, from: { level: 'cut', path: 'code:bearing(cont:m3.eye)' } });
    expect(m3.sheet.screen.over?.value).toEqual(['p2', 'p1', 'l1/autoclave']);
  });

  test("meads-third: a cut's own feeling over its scene's mood; a cut with none takes the scene's", () => {
    const t = treeOf('meads-third');
    expect(cutIn(t, 'm5').sheet.feeling).toMatchObject({
      value: 'she was nice',
      from: { level: 'cut' },
      over: { value: 'quiet, a little strange', from: { path: 'b:s2.mood' } },
    });
    expect(cutIn(t, 'm2').sheet.feeling).toMatchObject({
      value: 'wondrous, normal-seeming',
      from: { level: 'scene', node: 's1/l2' },
    });
  });

  test('the time of day is known nowhere; forgotten once they said they do not remember how it looked', () => {
    const input = inputOf('meads-third');
    expect(sceneIn(treeOf('meads-third'), 's1/l2').sheet.time.from).toMatchObject({
      level: 'scene',
      path: 'none:time',
      basis: 'unknown',
    });
    const t = resolveTree({ ...input, goals: { look: { status: 'unknown', asked: 1 } } });
    expect(sceneIn(t, 's1/l2').sheet.time.from).toMatchObject({ basis: 'forgotten', rule: 'goal:look' });
  });

  test("light: the grade from the chosen look, the source from the place's sketch, kept though forgotten", () => {
    const t = treeOf('meads-fourth');
    expect(t.dream.sheet.lightGrade.from).toMatchObject({
      level: 'dream',
      path: 'style:lighting_rules',
      basis: 'chosen',
    });
    const light = sceneIn(t, 's3/l5').sheet.lightSource;
    expect(light.from).toMatchObject({ level: 'sheet', node: 'l5', path: 'items:l5.light', basis: 'forgotten' });
    expect(light.value).toBe('soft, diffuse daylight with no strong shadows');
    expect(treeOf('meads-third').dream.sheet.lightGrade).toMatchObject({ value: null, from: { basis: 'unknown' } });
  });

  test('theater: a camera that gives no lens takes the previs wide lens, 24mm, as a default', () => {
    const lens = cutIn(treeOf('theater'), 'm3').sheet.lens;
    expect(lens).toMatchObject({ value: 24, from: { level: 'default', basis: 'default' } });
  });

  test('theater: the default lens names HALF_VIEW', () => {
    expect(cutIn(treeOf('theater'), 'm3').sheet.lens.from.path).toBe('default:HALF_VIEW');
  });

  test("the line: a scene's first two-shot sets it, and each camera is on one side of it or on it", () => {
    const third = treeOf('meads-third');
    expect(sceneIn(third, 's3/l5').sheet.line.value).toEqual(['p1', 'p4']);
    expect(['m6', 'm7', 'm8'].map((c) => cutIn(third, c).sheet.side.value)).toEqual([
      'established',
      null,
      'established',
    ]);
    expect(cutIn(third, 'm6').sheet.role.value).toBe('ots');
    const fourth = treeOf('meads-fourth');
    expect(sceneIn(fourth, 's3/l5').sheet.line.value).toEqual(['p4', 'p1']);
    expect(['m6', 'm7', 'm8'].map((c) => cutIn(fourth, c).sheet.side.value)).toEqual(['established', null, 'on']);
    expect(cutIn(treeOf('ice-head'), 'm1').sheet.side.value).toBe('established');
    expect(sceneIn(treeOf('theater'), 's1/l1').sheet.line.value).toBeNull();
  });

  test('the side of the line is null, and says why, while both ride in the same car', () => {
    for (const name of ['meads-third', 'meads-fourth'] as const) {
      const side = cutIn(treeOf(name), 'm7').sheet.side;
      expect(side.value).toBeNull();
      expect(side.from.rule).toBe('riding together');
    }
  });

  test('positions: carried from an earlier move, and settled where settling moved them', () => {
    expect(cutIn(treeOf('ice-head'), 'm4').at.p1.at?.from).toMatchObject({
      path: 'plan:s1.moves.m3.p1',
      since: 'm3',
    });
    const m7 = cutIn(treeOf('meads-third'), 'm7').at.p1.at!;
    expect(m7.from.rule).toBe('settle');
    expect(m7.over?.from.path).toBe('plan:s3.moves.m7.p1');
    const fourth = treeOf('meads-fourth');
    const f7 = cutIn(fourth, 'm7').at.p1.at!;
    expect(f7.value?.faces).toBe('front');
    expect(f7.from.path).toBe('code:settle(s3,m7)');
    expect((f7.over?.value as { faces?: string }).faces).toBe('back');
    const f6 = cutIn(fourth, 'm6').at.p1.at!;
    expect([f6.value?.x, f6.value?.y]).toEqual([4, -0.25]);
    const over = f6.over?.value as { x: number; y: number };
    expect([over.x, over.y]).toEqual([4, 0.5]);
  });
});

// ── E. the ledger ────────────────────────────────────────────────────────────
describe('E. the looks ledger', () => {
  test('ice-head: her head turns to ice, then to a horse head of ice, each change a ghost edited from the last', () => {
    const t = treeOf('ice-head');
    const p1 = rowIn(t, 'p1');
    expect(p1.stages.map((s) => s.key)).toEqual(['p1#0', 'p1@m3:head', 'p1@m5:head']);
    expect(p1.stages.map((s) => s.kind)).toEqual(['sheet', 'look_change', 'look_change']);
    expect(p1.stages[1].whole).toMatchObject({ value: false, from: { basis: 'derived' } });
    expect(p1.stages.map((s) => s.ghost)).toEqual([null, 'g1', 'g2']);
    expect(p1.stages.map((s) => s.ghostFrom)).toEqual([null, 'sheet', 'g1']);
    expect(p1.stages[2].replaces).toBe('p1@m3:head');
    expect(p1.stages.map((s) => s.usedBy)).toEqual([['m1', 'm2'], ['m3', 'm4'], ['m5']]);
    expect(p1.stages[1].redraw).toEqual({ items: [], ghosts: ['g1', 'g2'], cuts: ['m3', 'm4', 'm5'], maybe: [] });
    expect(rowIn(t, 'p2').plot).toEqual({ m1: 'p2#0', m2: null, m3: null, m4: null, m5: null });
  });

  test('theater: the big sofa becomes a roller coaster, a transformation of the whole', () => {
    const t2 = rowIn(treeOf('theater'), 't2');
    expect(t2.stages[0]).toMatchObject({ key: 't2#0', usedBy: ['m1'] });
    expect(t2.stages[1]).toMatchObject({
      key: 't2@m2:form',
      kind: 'transformation',
      whole: { value: true, from: { basis: 'derived', rule: 'WHOLE' } },
      ghost: 'g1',
      ghostFrom: 'sheet',
      usedBy: ['m2', 'm3'],
    });
  });

  test('meads: how things look where first shown is no change, and redraws only what shows them', () => {
    const t = treeOf('meads-third');
    for (const r of t.ledger.rows) expect(r.stages.map((s) => s.key)).toEqual([`${r.element}#0`]);
    const first = Object.fromEntries(
      t.ledger.rows
        .filter((r) => r.stages[0].firstLooks)
        .map((r) => [r.element, r.stages[0].firstLooks!.map((f) => [f.cut, f.ghost])]),
    );
    // Continuity plans no in-between picture for a first look any more (25 Sep): none changes anything.
    expect(first).toEqual({
      p2: [['m2', null]],
      p3: [['m5', null]],
      t1: [['m5', null]],
      t2: [['m6', null]],
      t3: [['m9', null]],
    });
    // Design correction: meads-third has no sketches (no build.items), so there is no sketch of t2
    // to redraw; today's Meads has one.
    expect(rowIn(t, 't2').stages[0].redraw).toEqual({ items: [], ghosts: [], cuts: ['m6', 'm7', 'm8'], maybe: [] });
    expect(rowIn(treeOf('meads-fourth'), 't2').stages[0].redraw).toEqual({
      items: ['t2'],
      ghosts: [],
      cuts: ['m6', 'm7', 'm8'],
      maybe: [],
    });
    expect(rowIn(t, 'p1').stages[0].usedBy).toEqual(['m1', 'm3', 'm4', 'm6', 'm7', 'm8', 'm9']);
  });

  test('a change that is not carried to a later picture of them is flagged and asked', () => {
    const ms = [
      moment({ id: 'm1', visible: ['p1'] }),
      moment({ id: 'm2', visible: ['p1'], leaves: [{ who: 'p1', what: 'head', now: 'a block of ice' }] }),
      moment({ id: 'm3', visible: ['p1'] }),
    ];
    const never = treeFor(breakdown(ms));
    expect(flagIds(never)).toContain('stage_not_carried:m3:p1');
    expect(never.gaps.find((g) => g.id === 'change_stays:p1@m2:head@m3')).toMatchObject({
      kind: 'change_stays',
      level: 'ledger',
      basis: 'unknown',
    });
    // Jev linked the moment and left the change out: a reading, not nothing.
    const left = treeFor(breakdown([ms[0], ms[1], { ...ms[2], states: [] }]));
    expect(left.gaps.find((g) => g.id === 'change_stays:p1@m2:head@m3')?.basis).toBe('read');
  });

  test("a new look for the dreamer's sketch changes the hash of exactly the pictures and stages that use it", () => {
    const input = inputOf('meads-fourth');
    const before = treeOf('meads-fourth');
    const items = input.items!.map((i) =>
      i.id === 'p1'
        ? { ...i, fields: { ...i.fields, appearance: { ...i.fields.appearance, value: 'tall, with a red beard' } } }
        : i,
    );
    const after = resolveTree({ ...input, items });
    const changed = cutsOf(after)
      .filter((c) => c.hash !== cutIn(before, c.id).hash)
      .map((c) => c.id);
    expect(changed).toEqual(before.elements.p1.cuts);
    for (const r of after.ledger.rows)
      for (const [i, s] of r.stages.entries()) {
        const was = rowIn(before, r.element).stages[i].hash;
        if (r.element === 'p1') expect(s.hash).not.toBe(was);
        else expect(s.hash).toBe(was);
      }
  });
});

// ── F. gaps ──────────────────────────────────────────────────────────────────
describe('F. what to ask the dreamer', () => {
  const byId = (t: DreamTree, id: string) => t.gaps.find((g) => g.id === id)!;

  test('meads-third, with no goals: twenty questions, whole scenes first', () => {
    const t = treeOf('meads-third');
    expect(t.gaps).toHaveLength(20);
    const pov = t.gaps.filter((g) => g.kind === 'pov');
    expect(pov.map((g) => g.id)).toEqual(['pov:s1/l2', 'pov:s2/l3', 'pov:s2/l4', 'pov:s3/l5', 'pov:s4/l6']);
    expect(pov.every((g) => g.group === 'pov')).toBe(true);
    const light = t.gaps.filter((g) => g.kind === 'light');
    expect(light).toHaveLength(5);
    expect(light.every((g) => g.group === 'light')).toBe(true);
    expect(gapIds(t)).toEqual(expect.arrayContaining(['where:l5', 'where:l6']));
    const same = t.gaps.filter((g) => g.kind === 'same_place');
    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({ element: 'l5', node: 's3/l5' });
    expect(byId(t, 'look:p1')).toMatchObject({ fields: ['appearance', 'wardrobe'], after: pov.map((g) => g.id) });
    expect(byId(t, 'look:p2').fields).toEqual(['wardrobe']);
    expect(byId(t, 'look:p3').fields).toEqual(['wardrobe']);
    expect(byId(t, 'look:p4').fields).toEqual(['appearance', 'wardrobe']);
    expect(byId(t, 'look:l2').fields).toEqual(['landmarks']);
    expect(byId(t, 'look:l5')).toMatchObject({ fields: ['landmarks'], after: ['where:l5', same[0].id] });
    expect(byId(t, 'look:l6')).toMatchObject({ fields: ['landmarks'], after: ['where:l6'] });
  });

  test('meads: "outside the house" may be outside the Meads\'s house: same_place:l5:l1', () => {
    for (const name of ['meads-third', 'meads-fourth'] as const)
      expect(
        treeOf(name)
          .gaps.filter((g) => g.kind === 'same_place')
          .map((g) => g.id),
      ).toEqual(['same_place:l5:l1']);
  });

  test('meads-third, once they could not remember the light: fifteen, and the eyes question asked twice', () => {
    const t = resolveTree({
      ...inputOf('meads-third'),
      goals: {
        you_in_it: { status: 'open', asked: 2 },
        look: { status: 'unknown', asked: 0 },
        feeling: { status: 'unknown', asked: 0 },
      },
    });
    expect(t.gaps).toHaveLength(15);
    expect(t.gaps.filter((g) => g.kind === 'light')).toEqual([]);
    expect(t.gaps.filter((g) => g.kind === 'pov').map((g) => g.asked)).toEqual([2, 2, 2, 2, 2]);
    // Design correction: priorities do not strictly increase. §7.2's formula gives gaps of one
    // level, first cut and kind the same priority (look:l2, look:p1 and look:p2 are all 2009);
    // ties are broken by id.
    for (const [i, g] of t.gaps.entries()) {
      if (i === 0) continue;
      const p = t.gaps[i - 1];
      expect(g.priority).toBeGreaterThanOrEqual(p.priority);
      if (g.priority === p.priority) expect(p.id < g.id).toBe(true);
    }
    const lastScene = t.gaps.findLastIndex((g) => g.level === 'scene');
    const firstSheet = t.gaps.findIndex((g) => g.level === 'sheet');
    expect(lastScene).toBeLessThan(firstSheet);
  });

  test("ice-head: through whose eyes, the room's light, and how each of them looks", () => {
    const t = treeOf('ice-head');
    expect(gapIds(t)).toEqual(['pov:s1/l1', 'light:s1/l1', 'look:p1', 'look:p2']);
    // p2 is the dreamer: how they look waits on whether they are seen at all.
    expect(byId(t, 'look:p2').after).toEqual(['pov:s1/l1']);
  });

  test('theater: how many the crowd is, and what kind of place the theater is', () => {
    const t = treeOf('theater');
    expect([...gapIds(t)].sort()).toEqual(
      ['count:p3', 'light:s1/l1', 'look:l1', 'look:p1', 'look:p2', 'pov:s1/l1'].sort(),
    );
    expect(byId(t, 'count:p3').basis).toBe('unknown');
    expect(byId(t, 'look:p1').after).toEqual(['pov:s1/l1']);
    expect(byId(t, 'look:l1').fields).toEqual(['geography']);
  });

  test('meads-fourth: the sketches come first, and a count the plan read is not asked', () => {
    const t = treeOf('meads-fourth');
    expect(t.gaps).toHaveLength(15);
    expect(byId(t, 'look:p1')).toMatchObject({
      basis: 'guessed',
      fields: ['appearance', 'wardrobe'],
      askedBy: 'profile',
    });
    expect(byId(t, 'look:p2')).toMatchObject({ basis: 'guessed', fields: ['wardrobe'] });
    expect(byId(t, 'look:p2').from[0].path).toBe('items:p2.wardrobe');
    const l2 = byId(t, 'look:l2');
    expect(l2).toMatchObject({ fields: ['landmarks'], askedBy: 'profile' });
    expect(l2.from[0].downgraded).toBe(true);
    expect(byId(t, 'where:l5')).toMatchObject({ basis: 'guessed', from: [{ downgraded: true }] });
    expect(gapIds(t)).not.toContain('count:p5');
  });

  test('gap ids are the same on every run and whatever the fixtures are numbered', () => {
    for (const name of ['meads-third', 'ice-head'] as const) {
      const input = inputOf(name);
      expect(gapIds(resolveTree(inputOf(name)))).toEqual(gapIds(treeOf(name)));
      const b = renumbered(input.breakdown);
      expect(gapIds(resolveTree({ ...input, breakdown: b, plan: planContinuity(b) }))).toEqual(gapIds(treeOf(name)));
    }
  });
});

// ── G. flags ─────────────────────────────────────────────────────────────────
describe('G. flags on real drift', () => {
  test('meads-third: five first looks, the umbrella house, three stale readings and a corner off the plan', () => {
    const t = treeOf('meads-third');
    expect([...flagIds(t)].sort()).toEqual(
      [
        'first_look:m2:p2',
        'first_look:m5:p3',
        'first_look:m5:t1',
        'first_look:m6:t2',
        'first_look:m9:t3',
        'unused_element:dream:l1',
        'stale_reading:m1',
        'stale_reading:m6',
        'stale_reading:m9',
        'faces_off_plan:m4:faces',
      ].sort(),
    );
    // Still said of the breakdown, which calls them changes; continuity plans nothing for them.
    expect(inputOf('meads-third').plan.ghosts.filter((g) => g.kind === 'state')).toEqual([]);
    for (const f of t.flags.filter((x) => x.code === 'first_look')) {
      expect(f.now).toBeNull();
      expect(f.text).toContain('is how it looks where it is first shown, not a change');
    }
  });

  test("meads-fourth: the plan the prep made drifted from the breakdown's, at the village", () => {
    const t = treeOf('meads-fourth');
    expect([...flagIds(t)].sort()).toEqual(
      [
        'first_look:m2:p2',
        'first_look:m5:p3',
        'first_look:m5:t1',
        'first_look:m6:t2',
        'first_look:m9:t3',
        'unused_element:dream:l1',
        'plan_drift:s1/l2',
        'stale_reading:m1',
        'faces_off_plan:m1:faces',
      ].sort(),
    );
    expect(t.flags.find((f) => f.code === 'plan_drift')!.was).toEqual(['looks']);
    expect(t.flags.find((f) => f.id === 'unused_element:dream:l1')!.text).toContain('ready');
  });

  test('ice-head has one flag, the theater none', () => {
    expect(flagIds(treeOf('ice-head'))).toEqual(['camera_moved:m3:camera']);
    expect(treeOf('theater').flags).toEqual([]);
  });
});

// ── H. the adapter ───────────────────────────────────────────────────────────
describe('H. what a conversation gives the tree', () => {
  const cfg = dreamConfig();
  const threshold = cfg.confidence_threshold;
  const sessionWith = (name: Fixture): Session => {
    const f = frozen(name);
    const s = new SessionStore(cfg, { jev: fakeJev(), host: fakeHost() }).create();
    s.draft = { status: 'ready', basedOn: 1, breakdown: f.draft.breakdown, downgraded: f.draft.downgraded ?? [] };
    s.style = f.style ?? null;
    if (f.prep?.basedOn) s.prep = { ...f.prep, ms: 0 } as Prep;
    return s;
  };

  test('the plan is made again from the dream, its drawn ghosts known by what they show, never the kept plan', () => {
    const s = sessionWith('ice-head');
    const b = s.draft!.breakdown!;
    const fresh = planContinuity(b);
    const ice = fresh.ghosts.find((g) => g.of === 'p1' && g.state?.now === 'an irregular block of glittering ice')!;
    const frames = [
      { id: 'm1', kind: 'cut', name: 'm1', fields: {}, status: 'ready', version: 2, review: 'approved' },
      { id: 'g7', kind: 'ghost', name: 'g7', fields: {}, status: 'ready', version: 1, ghost: ice },
    ] as Item[];
    s.build = { items: [], current: null, checks: 0, frames, plan: { cuts: [], ghosts: [], issues: ['kept'] } };
    const input = treeInputOf(s, threshold)!;
    expect(input.plan).toEqual(reconcileGhosts(fresh, frames));
    expect(input.plan).not.toEqual(s.build.plan);
    const t = resolveTree(input);
    expect(cutIn(t, 'm1').drawn).toEqual({ status: 'ready', version: 2, review: 'approved' });
    const head = rowIn(t, 'p1').stages.find((x) => x.key === 'p1@m3:head')!;
    expect(head.ghost).toBe('g7');
    expect(head.drawn).toEqual({ status: 'ready', version: 1 });
  });

  test('the prep is fresh while the dream it was made from stands, floor plans aside', () => {
    const s = sessionWith('meads-fourth');
    expect(treeInputOf(s, threshold)!.prepFresh).toBe(true);
    // The fixture loader's copy of planKey agrees with the session's.
    expect(inputOf('meads-fourth').prepFresh).toBe(true);
    const b = s.draft!.breakdown!;
    s.draft!.breakdown = { ...b, scenes: b.scenes.map((sc) => ({ ...sc, blocking: undefined })) };
    expect(treeInputOf(s, threshold)!.prepFresh).toBe(true);
    s.draft!.breakdown = { ...b, title: 'another dream' };
    expect(treeInputOf(s, threshold)!.prepFresh).toBe(false);
    expect(resolveTree(treeInputOf(s, threshold)!).basedOn.prep).toBe('stale');
  });

  test("the goals are the conversation's statuses and how often each was asked", () => {
    const s = sessionWith('meads-fourth');
    s.state.goals.look = { confidence: 0.2, evidence: '', unknown: true };
    s.state.goals.you_in_it = { confidence: 0.95, evidence: 'm3' };
    s.askCounts.you_in_it = 2;
    const goals = treeInputOf(s, threshold)!.goals!;
    expect(Object.keys(goals).sort()).toEqual(Object.keys(s.state.goals).sort());
    expect(goals.look).toEqual({ status: 'unknown', asked: 0 });
    expect(goals.you_in_it).toEqual({ status: 'covered', asked: 2 });
    expect(goals.feeling).toEqual({ status: 'open', asked: 0 });
    // Told whose eyes it is through: nothing left to ask about it.
    const t = resolveTree(treeInputOf(s, threshold)!);
    expect(t.gaps.filter((g) => g.kind === 'pov')).toEqual([]);
    expect(cutIn(t, 'm1').sheet.eyes.from.basis).toBe('read');
  });

  test('no breakdown yet, no tree', () => {
    const s = new SessionStore(cfg, { jev: fakeJev(), host: fakeHost() }).create();
    expect(treeInputOf(s, threshold)).toBeNull();
  });
});
