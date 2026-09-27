import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CAP, parseArgs, switchesDiffer, withEnv } from '../evals/checkpoint';
import {
  emptyAnswers,
  judgeSetOf,
  scoreOf,
  serveJudge,
  withAnswer,
  type Answers,
} from '../evals/checkpoint-judge';
import {
  abOrder,
  type Attempt,
  buildDream,
  candidatesOf,
  type Change,
  changeOf,
  type CheckpointSet,
  earlierOf,
  loadVerdicts,
  type Measured,
  namesOf,
  overCap,
  partsOf,
  proposeSet,
  roomUnder,
  spentIn,
  type Today,
  todayOf,
  validateSet,
  whatToDraw,
} from '../evals/checkpoint-set';
import { USD_PER_PICTURE } from '../evals/paired-arms';
import { loadCases } from '../evals/prompt-cases';
import { loadDream } from '../evals/saved';
import type { Session } from '../session';

const MEDIA = '/media';
/** A frozen dream (evals/sources), each sketch and picture it drew given a stand-in file under MEDIA. */
function frozen(id: string, drop: string[] = []): Session {
  const s = structuredClone(loadDream(id, false).session) as Session;
  const drawn = <T extends { id: string; status?: string }>(x: T) =>
    x.status === 'ready' ? { ...x, mediaPath: `${x.id}.png` } : x;
  s.build = {
    ...s.build!,
    items: s.build!.items.map(drawn),
    frames: (s.build!.frames ?? []).filter((f) => !drop.includes(f.id)).map(drawn),
  };
  return s;
}
const everywhere = () => true;

describe('a moment as today would send it, from the run own pictures', () => {
  // The snow train: every sketch and picture drawn, and one in-between picture (the suitcase opened, g1).
  const snow = buildDream(frozen('dream-0926-043003-b0cb'));

  test('every image is the run own file, known by what it is; the mock-up is rendered now', () => {
    const t = todayOf(snow, 'm3', { media: MEDIA, exists: everywhere });
    expect(t.refused).toEqual([]);
    expect(t.images.length).toBeGreaterThan(2);
    for (const im of t.images) {
      expect(im.key).toMatch(/^(sketch:[a-z]\d+|picture:m\d+|ghost:g\d+|previs:m\d+)$/);
      if (im.key.startsWith('previs:')) expect(im.file).toBeUndefined();
      else expect(im.file).toBe(`${MEDIA}/${im.key.split(':')[1]}.png`);
    }
    // Its in-between picture is the run's own, matched by what it shows.
    expect(t.images.some((im) => im.key === 'ghost:g1')).toBe(true);
    expect(t.previs?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(t.images[0]).toMatchObject({ n: 1, role: 'base', key: 'previs:m3' });
    // The same dream built again gives the same hash; the store is told the run's ids.
    expect(todayOf(buildDream(frozen('dream-0926-043003-b0cb')), 'm3', { media: MEDIA, exists: everywhere }).hash).toBe(
      t.hash,
    );
    expect(partsOf(snow).ghosts.map((g) => g.id)).toContain('g1');
    expect(namesOf(t).every((n) => /^(base|identity|location|prop|composition) /.test(n))).toBe(true);
  });

  test('an in-between picture today plan wants that the run never drew refuses the moment; nothing stands in', () => {
    const without = buildDream(frozen('dream-0926-043003-b0cb', ['g1']));
    const t = todayOf(without, 'm3', { media: MEDIA, exists: everywhere });
    const ghost = t.images.find((im) => im.key.startsWith('ghost:'));
    expect(ghost?.file).toBeUndefined();
    expect(t.refused.some((r) => r.includes('the run never drew the in-between picture'))).toBe(true);
  });

  test('an earlier picture the run never drew, or a file not on this machine, refuses it too', () => {
    // The lighthouse, first telling: m1 failed, and m3 takes it for its composition.
    const light = buildDream(frozen('dream-0925-231131-affd'));
    const t = todayOf(light, 'm3', { media: MEDIA, exists: everywhere });
    expect(t.refused.some((r) => /picture:m1\): the run never drew picture m1/.test(r))).toBe(true);
    const gone = todayOf(snow, 'm3', { media: MEDIA, exists: (p) => !p.endsWith('/p2.png') });
    expect(gone.refused).toEqual([expect.stringContaining('its file is not on this machine (/media/p2.png)')]);
    const all = todayOf(snow, 'm3', { media: MEDIA, exists: () => false });
    expect(all.refused.length).toBe(all.images.filter((im) => !im.key.startsWith('previs:')).length);
  });
});

describe('proposing a set from the prompt cases', () => {
  const v = loadVerdicts();

  test("a step's counted fault cases and every guard, one entry a moment, each with the owner's verdict on its old picture", () => {
    const { candidates, unknown } = candidatesOf(loadCases(), 'S4', v, '/data', null);
    expect(unknown).toEqual([]);
    const faults = candidates.filter((c) => c.why === 'fault');
    // 12 S4 fault cases, one a hypothesis (snow-train m6, the hand): 11 moments.
    expect(faults.map((c) => c.id).sort()).toEqual(
      [
        'lighthouse-first-m3',
        'night-market-m2',
        'lighthouse-fresh-m10',
        'lighthouse-fresh-m12',
        'snow-train-m2',
        'snow-train-m3',
        'library-1-m4',
        'library-1-m5',
        'snow-train-2-m2',
        'orchard-m4',
        'orchard-m7',
      ].sort(),
    );
    expect(new Set(candidates.map((c) => c.id)).size).toBe(candidates.length);
    const snow6 = candidates.find((c) => c.id === 'snow-train-m6');
    expect(snow6?.why).toBe('guard');
    expect(snow6?.old).toMatchObject({ draw: 'story', verdict: 'right' });
    // A fault seen in a paired version: its old picture is that version, with the owner's note on it.
    const legs = candidates.find((c) => c.id === 'orchard-m7');
    expect(legs?.old).toMatchObject({
      source: { file: 'paired-verdicts.json', row: 'orchard-m7', version: 'orchard-m7-c' },
      draw: 'mockup',
      verdict: 'partly',
      picture: 'runs/paired/orchard-m7-mockup.jpg',
    });
    expect(legs?.old.note).toStartWith('Why does it feel like');
    const reverse = candidates.find((c) => c.id === 'snow-train-m2');
    expect(reverse?.old).toMatchObject({ draw: 'story', verdict: 'wrong' });
    expect(reverse?.old.picture).toMatch(/^strawberry-home\/media\/[0-9a-f]{64}\.png$/);
    expect(reverse?.description).toBeTruthy();
    expect(candidates.filter((c) => c.why === 'guard').every((c) => c.old.verdict === 'right')).toBe(true);
  });

  const change = (share: number, words = 1): Change => ({ words, of: 100, images: 0, imagesOf: 4, previs: false, share });
  const today = (refused: string[] = []): Today =>
    ({ moment: 'm1', name: '', action: '', prompt: '', images: [], refused, notes: [], hash: 'h' }) as Today;
  const m = (id: string, why: 'fault' | 'guard', extra: Partial<Measured>): Measured => ({
    id,
    run: id.split('-m')[0],
    session: 'dream-0926-043003-b0cb',
    moment: `m${id.split('-m')[1]}`,
    why,
    cases: [{ id: `case-${id}`, class: 'pov', fault: 'something' } as Measured['cases'][number]],
    old: { source: { file: 'story-pictures.json', row: id }, draw: 'story', verdict: why === 'fault' ? 'wrong' : 'right', note: null, picture: 'x.png' },
    description: 'what happens',
    ...extra,
  });

  test('faults first, then guards, each most changed first, trimmed to the cap; the rest kept apart by why', () => {
    const measured = [
      m('a-m1', 'guard', { today: today(), change: change(0.9) }),
      m('b-m1', 'fault', { today: today(), change: change(0.1) }),
      m('c-m1', 'fault', { today: today(), change: change(0.5) }),
      m('d-m1', 'fault', { today: today(), change: change(0, 0) }),
      m('e-m1', 'fault', { today: today(['image 2: never drawn']), change: change(0.7) }),
      m('f-m1', 'guard', { error: 'could not be rebuilt' }),
      m('g-m1', 'guard', { today: today(), change: change(0.3) }),
      m('h-m1', 'guard', { today: today(), change: change(0.2) }),
    ];
    const opts = { name: 's4', step: 'S4', cap: 0.6, switches: { DREAMCHAT_CAMERA: 'on' }, base: 'DREAMCHAT_CAMERA unset' };
    const p = proposeSet(measured, opts);
    expect(p.set.moments.map((x) => x.id)).toEqual(['c-m1', 'b-m1', 'a-m1', 'g-m1']);
    expect(p.over.map((x) => x.id)).toEqual(['h-m1']);
    expect(p.unchanged.map((x) => x.id)).toEqual(['d-m1']);
    expect(p.refused.map((x) => x.id)).toEqual(['e-m1']);
    expect(p.failed.map((x) => x.id)).toEqual(['f-m1']);
    expect(p.set).toMatchObject({ name: 's4', step: 'S4', cap_usd: 0.6, base: 'DREAMCHAT_CAMERA unset' });
    expect(validateSet(p.set)).toEqual([]);
    // What is already spent in the checkpoint leaves less room.
    expect(proposeSet(measured, { ...opts, spent: 0.3 }).set.moments.map((x) => x.id)).toEqual(['c-m1', 'b-m1']);
  });

  test('how much changed: words and images taken out and put in, and a mock-up rendered otherwise', () => {
    const same = changeOf({ prompt: 'a b c', images: ['base previs:m1'] }, { prompt: 'a b c', images: ['base previs:m1'] });
    expect(same).toMatchObject({ words: 0, images: 0, previs: false, share: 0 });
    const c = changeOf(
      { prompt: 'the room stays as it was', images: ['base previs:m2', 'identity sketch:p1'], previs: 'x' },
      { prompt: 'the room turns with the camera', images: ['base previs:m2', 'identity sketch:p2'], previs: 'y' },
    );
    // "the room" is kept of six words each: four taken out, four put in.
    expect(c.words).toBe(8);
    expect(c.images).toBe(2);
    expect(c.previs).toBe(true);
    expect(c.share).toBeCloseTo(8 / 6 + 3 / 2, 3);
  });

  test("a set's shape is checked: an unknown kind, verdict or drawing is an error", () => {
    const set: CheckpointSet = {
      name: 'S4 bad',
      moments: [
        {
          ...m('a-m1', 'fault', {}),
          cases: ['a-case'],
          reason: 'a fault',
          why: 'maybe' as 'fault',
          old: { source: { file: 'paired-verdicts.json', row: 'x' }, draw: 'sketch' as 'story', verdict: 'fine' as 'right', note: null, picture: '' },
        },
      ],
    };
    const problems = validateSet(set).join('\n');
    for (const p of ['name S4 bad', 'why must be fault or guard', 'names its version', 'draw must be', 'verdict must be', 'no file']) expect(problems).toContain(p);
  });
});

describe('old against new, blind', () => {
  const ms = (n: number, why: 'fault' | 'guard') => Array.from({ length: n }, (_, i) => ({ id: `${why}-${i}`, why }));
  const olds = (o: Record<string, string>, ids: string[]) => ids.filter((id) => o[id] === 'old').length;

  test('the old picture is A in half of the faults and half of the guards, and in half of all', () => {
    for (const [f, g] of [
      [5, 3],
      [6, 4],
      [7, 7],
      [1, 0],
      [0, 3],
      [11, 9],
    ]) {
      const set = [...ms(f, 'fault'), ...ms(g, 'guard')];
      const o = abOrder('s4', set);
      expect(Object.keys(o).length).toBe(f + g);
      const inFaults = olds(o, ms(f, 'fault').map((x) => x.id));
      const inGuards = olds(o, ms(g, 'guard').map((x) => x.id));
      expect(Math.abs(inFaults * 2 - f)).toBeLessThanOrEqual(1);
      expect(Math.abs(inGuards * 2 - g)).toBeLessThanOrEqual(1);
      expect(Math.abs((inFaults + inGuards) * 2 - (f + g))).toBeLessThanOrEqual(1);
    }
  });

  test('the same set is always shown the same way, whatever its order; nothing in the order says which is which', () => {
    const set = [...ms(6, 'fault'), ...ms(6, 'guard')];
    const o = abOrder('s4', set);
    expect(abOrder('s4', [...set].reverse())).toEqual(o);
    // Not an alternation of the set's order.
    const inOrder = set.map((x) => o[x.id]);
    const alternating = inOrder.every((x, i) => i === 0 || x !== inOrder[i - 1]);
    const names = ['s4', 's5', 's10', 'a', 'b', 'c'];
    expect(names.some((n) => JSON.stringify(abOrder(n, set)) !== JSON.stringify(o))).toBe(true);
    expect(alternating && names.every((n) => JSON.stringify(abOrder(n, set)) === JSON.stringify(o))).toBe(false);
  });

  test('the page gets A and B by name only; the key says which is old', () => {
    const order = { 'x-m1': 'old' as const, 'y-m2': 'new' as const };
    const made = judgeSetOf(
      's4',
      [
        { id: 'x-m1', title: 'X, m1', description: 'd1', told: ['t'], old: '/o/1.png', new: '/n/1.png', before: '/b/0.png' },
        { id: 'y-m2', title: 'Y, m2', description: 'd2', told: [], old: '/o/2.png', new: '/n/2.png', before: null },
      ],
      order,
    );
    expect(made.key).toEqual({ 'x-m1': { a: 'old', b: 'new' }, 'y-m2': { a: 'new', b: 'old' } });
    expect(made.data.moments[0]).toMatchObject({ a: 'img/x-m1-a.jpg', b: 'img/x-m1-b.jpg', before: 'img/x-m1-before.jpg' });
    expect(made.data.moments[1].before).toBeNull();
    expect(made.copies).toContainEqual({ from: '/o/1.png', to: 'img/x-m1-a.jpg' });
    expect(made.copies).toContainEqual({ from: '/o/2.png', to: 'img/y-m2-b.jpg' });
    // Nothing on the page says old or new.
    expect(JSON.stringify(made.data)).not.toMatch(/"(old|new)"|\/o\/|\/n\//);
  });
});

describe('the cap', () => {
  const at = '2026-09-27T00:00:00Z';
  const attempt = (id: string, x: Partial<Attempt>): Attempt =>
    ({ id, session: 's', moment: 'm1', hash: 'h', prompt: '', images: [], switches: {}, state: 'refused', at, ...x }) as Attempt;

  test('every attempt that reached the worker counts, earlier ones included; nothing sent costs nothing', () => {
    const rs = {
      entries: {
        a: attempt('a', { state: 'ready', jobId: 'j1', usd: 0.15 }),
        b: attempt('b', { state: 'failed', jobId: 'j3', earlier: [attempt('b', { state: 'failed', jobId: 'j2' })] }),
        c: attempt('c', { state: 'capped' }),
        d: attempt('d', { state: 'refused', error: 'the engine would not prepare it' }),
      },
    };
    expect(spentIn(rs)).toBeCloseTo(0.45, 6);
    expect(spentIn({ entries: {} })).toBe(0);
    // Drawn again, the attempt before is kept with the ones before it.
    expect(earlierOf(rs.entries.b).map((x) => x.jobId)).toEqual(['j2', 'j3']);
    expect(earlierOf(rs.entries.c)).toEqual([]);
  });

  test('refuses to start over the cap, and knows the room left', () => {
    expect(DEFAULT_CAP).toBe(3);
    expect(USD_PER_PICTURE).toBe(0.15);
    expect(overCap(0, 20, 3)).toBeNull();
    expect(overCap(0, 21, 3)).toContain('over the $3.00 cap');
    expect(overCap(2.85, 1, 3)).toBeNull();
    expect(overCap(2.86, 1, 3)).not.toBeNull();
    expect(roomUnder(3, 0)).toBe(20);
    expect(roomUnder(3, 0.45)).toBe(17);
    expect(roomUnder(3, 3.1)).toBe(0);
  });

  test('nothing is drawn again on its own', () => {
    const rs = {
      entries: {
        drawn: attempt('drawn', { state: 'ready', jobId: 'j1' }),
        drawing: attempt('drawing', { state: 'running', jobId: 'j2' }),
        failed: attempt('failed', { state: 'failed', jobId: 'j3' }),
        unknown: attempt('unknown', { state: 'submission_unknown', jobId: 'j4' }),
        capped: attempt('capped', { state: 'capped' }),
      },
    };
    const ids = ['drawn', 'drawing', 'failed', 'unknown', 'capped', 'new'];
    const plain = whatToDraw(ids, rs);
    expect(plain.todo).toEqual(['capped', 'new']);
    expect(plain.waiting).toEqual(['drawing']);
    expect(plain.skipped.map((s) => s.id)).toEqual(['drawn', 'failed', 'unknown']);
    // Named, a failed one is drawn again; one that may be paid for only with --redraw-paid too.
    expect(whatToDraw(ids, rs, { only: ['failed', 'unknown'] }).todo).toEqual(['failed', 'capped', 'new']);
    expect(whatToDraw(ids, rs, { only: ['unknown'], redrawPaid: true }).todo).toEqual(['unknown', 'capped', 'new']);
    // A picture drawn is never drawn again, even when named.
    expect(whatToDraw(['drawn'], rs, { only: ['drawn'], redrawPaid: true }).todo).toEqual([]);
  });
});

describe('the answers and the score', () => {
  const data = {
    moments: [
      { id: 'x-m1', title: '', description: '', told: [], before: null, a: '', b: '' },
      { id: 'y-m2', title: '', description: '', told: [], before: null, a: '', b: '' },
    ],
  };

  test('an answer is A, B, both or neither, with a note; a note alone keeps the answer; anything else is refused', () => {
    let got: Answers = emptyAnswers('s4');
    const put = (body: unknown) => {
      const r = withAnswer(got, data, body, 't');
      if ('error' in r) return r.error;
      got = r.answers;
      return null;
    };
    expect(put({ id: 'x-m1', answer: 'b', note: 'the room turned' })).toBeNull();
    expect(put({ id: 'x-m1', note: 'the room turned, and he sits right' })).toBeNull();
    expect(got.answers['x-m1']).toEqual({ answer: 'b', note: 'the room turned, and he sits right', at: 't' });
    expect(put({ id: 'z-m9', answer: 'a' })).toContain('no moment z-m9');
    expect(put({ id: 'y-m2', answer: 'maybe' })).toContain('one of a, b, both, neither');
    expect(put({ id: 'y-m2', note: 5 })).toContain('a note is text');
    expect(put(null)).toContain('send');
  });

  test('scored against the key: a fault put right, a guard kept, and the old picture as judged this time', () => {
    const set = {
      name: 's4',
      moments: [
        { id: 'x-m1', why: 'fault' as const, old: { verdict: 'wrong' as const } },
        { id: 'y-m2', why: 'guard' as const, old: { verdict: 'right' as const } },
        { id: 'z-m3', why: 'guard' as const, old: { verdict: 'right' as const } },
      ],
    } as unknown as CheckpointSet;
    const key = { 'x-m1': { a: 'old' as const, b: 'new' as const }, 'y-m2': { a: 'new' as const, b: 'old' as const } };
    const answers: Answers = {
      checkpoint: 's4',
      updated: 't',
      answers: { 'x-m1': { answer: 'b', note: 'n', at: 't' }, 'y-m2': { answer: 'both', note: '', at: 't' } },
    };
    const s = scoreOf(set, key, answers);
    expect(s.faults).toEqual({ judged: 1, of: 1, nowRight: 1, oldRightNow: 0 });
    expect(s.guards).toEqual({ judged: 1, of: 2, stillRight: 1, oldRightAgain: 1 });
    expect(s.moments.find((x) => x.id === 'z-m3')).toMatchObject({ newRight: null, oldRight: null });
    const lost = scoreOf(set, key, { ...answers, answers: { 'y-m2': { answer: 'b', note: '', at: 't' } } });
    expect(lost.guards.stillRight).toBe(0);
    expect(lost.moments.find((x) => x.id === 'y-m2')).toMatchObject({ newRight: false, oldRight: true });
  });

  test('the local page: its data without the key, pictures by name only, every answer written as it comes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'checkpoint-judge-'));
    mkdirSync(join(dir, 'judge', 'img'), { recursive: true });
    writeFileSync(join(dir, 'judge', 'img', 'x-m1-a.jpg'), 'jpeg');
    writeFileSync(join(dir, 'key.json'), '{"x-m1":{"a":"old","b":"new"}}');
    const answersFile = join(dir, 'answers.json');
    const page = { checkpoint: 's4', title: 't', about: 'a', ...data };
    const { url, stop } = serveJudge({ dir: join(dir, 'judge'), answersFile, data: page, port: 0 });
    try {
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(await (await fetch(url)).text()).toContain('<title>Checkpoint judging</title>');
      const got = (await (await fetch(`${url}data.json`)).json()) as { data: unknown; answers: Answers };
      expect(JSON.stringify(got)).not.toContain('"old"');
      expect(got.answers.answers).toEqual({});
      expect((await fetch(`${url}img/x-m1-a.jpg`)).status).toBe(200);
      expect((await fetch(`${url}img/..%2F..%2Fkey.json`)).status).toBe(404);
      expect((await fetch(`${url}key.json`)).status).toBe(404);
      const post = await fetch(`${url}answer`, { method: 'POST', body: JSON.stringify({ id: 'x-m1', answer: 'a', note: 'kept' }) });
      expect(post.status).toBe(200);
      expect(existsSync(answersFile)).toBe(true);
      expect((JSON.parse(readFileSync(answersFile, 'utf8')) as Answers).answers['x-m1']).toMatchObject({ answer: 'a', note: 'kept' });
      expect((await fetch(`${url}answer`, { method: 'POST', body: '{"id":"x-m1","answer":"yes"}' })).status).toBe(400);
    } finally {
      stop();
    }
  });
});

describe('the command line', () => {
  test('one thing to do, known flags only', () => {
    expect(parseArgs(['--set-from-cases', 'S4'])).toMatchObject({ mode: 'set-from-cases', target: 'S4', base: [] });
    expect(parseArgs(['--dry', 'evals/checkpoint-s4.json', '--only', 'snow-train-m2', 'orchard-m4'])).toMatchObject({
      mode: 'dry',
      only: ['snow-train-m2', 'orchard-m4'],
    });
    expect(parseArgs(['--set-from-cases', 'S4', '--base', 'DREAMCHAT_CAMERA=', 'DREAMCHAT_RECORD=on'])).toMatchObject({
      base: ['DREAMCHAT_CAMERA=', 'DREAMCHAT_RECORD=on'],
    });
    expect(parseArgs(['--draw', 'x.json', '--cap', '3'])).toMatchObject({ mode: 'draw', cap: 3 });
    for (const bad of [
      [],
      ['--dry', 'x.json', '--draw', 'x.json'],
      ['--set-from-cases', 'four'],
      ['--draw', 'x.json', '--cap', '0'],
      ['--draw', 'x.json', '--spend-more'],
      ['--set-from-cases', 'S4', '--base', 'old', 'DREAMCHAT_X=1'],
      ['--set-from-cases', 'S4', '--base', 'CAMERA=on'],
      ['--judge'],
      ['--dry', 'x.json', '--no-imply', '--read-implied'],
    ])
      expect('error' in parseArgs(bad)).toBe(true);
  });

  test('switches set for a while, then as they were; and where two records of them differ', async () => {
    const was = process.env.DREAMCHAT_CAMERA;
    process.env.DREAMCHAT_CAMERA = 'on';
    try {
      expect(await withEnv({ DREAMCHAT_CAMERA: '' }, () => process.env.DREAMCHAT_CAMERA)).toBeUndefined();
      expect(process.env.DREAMCHAT_CAMERA).toBe('on');
    } finally {
      if (was === undefined) delete process.env.DREAMCHAT_CAMERA;
      else process.env.DREAMCHAT_CAMERA = was;
    }
    expect(switchesDiffer({ DREAMCHAT_RECORD: 'on' }, { DREAMCHAT_RECORD: 'on', DREAMCHAT_CAMERA: 'on' })).toEqual([
      'DREAMCHAT_CAMERA unset then, =on now',
    ]);
  });
});
