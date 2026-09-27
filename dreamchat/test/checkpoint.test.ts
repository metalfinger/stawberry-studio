import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capOf, DEFAULT_CAP, parseArgs, switchesDiffer, withEnv } from '../evals/checkpoint';
import {
  emptyAnswers,
  judgeSetOf,
  mergeKey,
  scoreOf,
  serveJudge,
  withAnswer,
  type Answers,
} from '../evals/checkpoint-judge';
import {
  abOrder,
  type Attempt,
  briefAskOf,
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
  reconcileStore,
  spentIn,
  type Today,
  todayOf,
  validateSet,
  whatToDraw,
  withBriefs,
} from '../evals/checkpoint-set';
import { USD_PER_PICTURE } from '../evals/paired-arms';
import { loadCases } from '../evals/prompt-cases';
import { loadDream } from '../evals/saved';
import { shotPlan } from '../continuity';
import { previsImage } from '../previs';
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

  test('an earlier picture the run never drew, or a file not on this machine, refuses it too', async () => {
    // The lighthouse, first telling: m1 failed, and m3 takes it for its composition (today's choice, with
    // the camera rules off: with them on, m3's camera is turned round from m1's and takes nothing of it).
    const off = { DREAMCHAT_CAMERA: '' };
    const light = await withEnv(off, () => buildDream(frozen('dream-0925-231131-affd')));
    const t = await withEnv(off, () => todayOf(light, 'm3', { media: MEDIA, exists: everywhere }));
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
  const today = (refused: string[] = []): Today => ({
    moment: 'm1',
    name: '',
    action: '',
    prompt: '',
    images: [],
    brief: null,
    briefless: false,
    refused,
    notes: [],
    hash: 'h',
  });
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
      m('b-m2', 'fault', { today: today(), change: change(0.1) }),
      m('c-m3', 'fault', { today: today(), change: change(0.5) }),
      m('d-m4', 'fault', { today: today(), change: change(0, 0) }),
      m('e-m5', 'fault', { today: today(['image 2: never drawn']), change: change(0.7) }),
      m('f-m6', 'guard', { error: 'could not be rebuilt' }),
      m('g-m7', 'guard', { today: today(), change: change(0.3) }),
      m('h-m8', 'guard', { today: today(), change: change(0.2) }),
    ];
    const opts = { name: 's4', step: 'S4', cap: 0.6, switches: { DREAMCHAT_CAMERA: 'on' }, base: 'DREAMCHAT_CAMERA unset' };
    const p = proposeSet(measured, opts);
    expect(p.set.moments.map((x) => x.id)).toEqual(['c-m3', 'b-m2', 'a-m1', 'g-m7']);
    expect(p.over.map((x) => x.id)).toEqual(['h-m8']);
    expect(p.unchanged.map((x) => x.id)).toEqual(['d-m4']);
    expect(p.refused.map((x) => x.id)).toEqual(['e-m5']);
    expect(p.failed.map((x) => x.id)).toEqual(['f-m6']);
    expect(p.set).toMatchObject({ name: 's4', step: 'S4', cap_usd: 0.6, base: 'DREAMCHAT_CAMERA unset' });
    expect(validateSet(p.set)).toEqual([]);
    // What is already spent in the checkpoint leaves less room.
    expect(proposeSet(measured, { ...opts, spent: 0.3 }).set.moments.map((x) => x.id)).toEqual(['c-m3', 'b-m2']);
    // It pins where its results will be kept.
    expect(proposeSet(measured, { ...opts, results: '/data/runs/checkpoint/s4' }).set.results).toBe('/data/runs/checkpoint/s4');
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
    // b's two attempts gave no estimate: each counts as the most one picture may cost, $0.20.
    expect(spentIn(rs)).toBeCloseTo(0.15 + 0.2 + 0.2, 6);
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
    expect(got.answers['x-m1']).toEqual({ answer: 'b', note: 'the room turned, and he sits right', at: 't', shown: null });
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
    const page = {
      checkpoint: 's4',
      title: 't',
      about: 'a',
      moments: [{ ...data.moments[0], a: 'img/x-m1-a.jpg', b: 'img/x-m1-b.jpg' }, data.moments[1]],
    };
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
      const body = JSON.stringify({ id: 'x-m1', answer: 'a', note: 'kept' });
      // Only JSON is taken.
      expect((await fetch(`${url}answer`, { method: 'POST', body })).status).toBe(415);
      expect(existsSync(answersFile)).toBe(false);
      const json = { 'content-type': 'application/json' };
      const post = await fetch(`${url}answer`, { method: 'POST', headers: json, body });
      expect(post.status).toBe(200);
      expect(existsSync(answersFile)).toBe(true);
      // Kept with the pictures it was given on: here only A is there, so none is known.
      expect((JSON.parse(readFileSync(answersFile, 'utf8')) as Answers).answers['x-m1']).toMatchObject({
        answer: 'a',
        note: 'kept',
        shown: null,
      });
      writeFileSync(join(dir, 'judge', 'img', 'x-m1-b.jpg'), 'jpeg b');
      await fetch(`${url}answer`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'x-m1', note: 'kept, both seen' }) });
      const shown = (JSON.parse(readFileSync(answersFile, 'utf8')) as Answers).answers['x-m1'].shown;
      expect(shown?.a).toMatch(/^[0-9a-f]{64}$/);
      expect(shown?.b).toMatch(/^[0-9a-f]{64}$/);
      expect(
        (await fetch(`${url}answer`, { method: 'POST', headers: json, body: '{"id":"x-m1","answer":"yes"}' })).status,
      ).toBe(400);
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

describe('as the harness would send it: approval, "you", the brief', () => {
  test('a sketch or earlier picture nobody approved is never drawn from: the moment is refused', () => {
    const sketch = frozen('dream-0926-043003-b0cb');
    delete sketch.build!.items.find((i) => i.id === 'p2')!.review;
    const u = todayOf(buildDream(sketch), 'm3', { media: MEDIA, exists: everywhere });
    expect(u.refused.some((r) => r.startsWith('image') && r.includes('nobody approved it'))).toBe(true);
    const ghost = frozen('dream-0926-043003-b0cb');
    delete ghost.build!.frames!.find((f) => f.id === 'g1')!.review;
    const g = todayOf(buildDream(ghost), 'm3', { media: MEDIA, exists: everywhere });
    expect(g.refused.some((r) => r.includes('ghost:') && r.includes('nobody approved it'))).toBe(true);
  });

  test('words that call the dreamer "you" refuse the moment: the harness rewords them with a model first', () => {
    const s = frozen('dream-0926-043003-b0cb');
    const m = s.draft!.breakdown!.scenes.flatMap((sc) => sc.moments).find((x) => x.id === 'm3')!;
    m.action = `${m.action} You hold your breath.`;
    const t = todayOf(buildDream(s), 'm3', { media: MEDIA, exists: everywhere });
    expect(t.refused.some((r) => r.includes('call the dreamer "you" (action)'))).toBe(true);
  });

  test('a moment without a brief for its view is known; a brief for that view, given as the harness keeps one, is drawn with', () => {
    // The night market's m2: today's plan has a view no brief was written for.
    const s = frozen('dream-0926-000545-09ea');
    const d = buildDream(s);
    const t = todayOf(d, 'm2', { media: MEDIA, exists: everywhere });
    expect(t.briefless).toBe(true);
    expect(t.brief).toBeNull();
    const ask = briefAskOf(d, 'm2');
    expect(ask?.view).toBe(d.r.pictures.find((p) => p.id === 'm2')?.item.frame?.plan?.view as string);
    expect(ask?.action).toContain('fish');
    expect(ask?.mustName.length).toBeGreaterThan(0);
    const text = 'A 35mm lens at eye level: the old man at the stall on the left, the sisters turned to the fish.';
    const briefed = buildDream(withBriefs(s, { m2: { view: ask?.view as string, text } }));
    const given = todayOf(briefed, 'm2', { media: MEDIA, exists: everywhere });
    expect(given.briefless).toBe(false);
    expect(given.brief?.text).toBe(text);
    expect(given.prompt).toContain(text);
    expect(given.hash).not.toBe(t.hash);
    expect(briefAskOf(briefed, 'm2')).toBeNull();
    // A brief for another view is not taken.
    const other = buildDream(withBriefs(s, { m2: { view: 'another view', text } }));
    expect(todayOf(other, 'm2', { media: MEDIA, exists: everywhere }).briefless).toBe(true);
  });
});

describe('the set, the key and the ledger, held fast', () => {
  const moment = (id: string, session: string, mo: string) => ({
    id,
    run: 'r',
    session,
    moment: mo,
    why: 'fault' as const,
    reason: 'a fault',
    cases: ['c'],
    description: 'd',
    old: {
      source: { file: 'story-pictures.json' as const, row: id },
      draw: 'story' as const,
      verdict: 'wrong' as const,
      note: null,
      picture: 'x.png',
    },
  });

  test('a moment listed twice by dream and moment, a cap that is not a number, a results path not whole: errors', () => {
    const set = {
      name: 's4',
      cap_usd: '3' as unknown as number,
      results: 'runs/checkpoint/s4',
      moments: [moment('a-m2', 'dream-0926-043003-b0cb', 'm2'), moment('b-m2', 'dream-0926-043003-b0cb', 'm2')],
    };
    const problems = validateSet(set).join('\n');
    expect(problems).toContain('cap_usd must be a number');
    expect(problems).toContain('results must be the whole path');
    expect(problems).toContain('dream-0926-043003-b0cb m2 is listed twice');
    // --cap only ever lowers the cap the set was reviewed with.
    expect(capOf({ cap_usd: 3 }, 10)).toBe(3);
    expect(capOf({ cap_usd: 3 }, 1.5)).toBe(1.5);
    expect(capOf({}, undefined)).toBe(DEFAULT_CAP);
  });

  test('the key is written once: a moment keeps its A and B, one drawn later is placed to keep the drawn ones balanced', () => {
    const ms = Array.from({ length: 6 }, (_, i) => ({ id: `f-${i}`, why: 'fault' as const }));
    const first = abOrder('s4', ms.slice(0, 3));
    const later = abOrder('s4', ms, first);
    for (const id of Object.keys(first)) expect(later[id]).toBe(first[id]);
    expect(Object.values(later).filter((x) => x === 'old').length).toBe(3);
    // Even when what is fixed leans one way, the rest go the other.
    const leaning = abOrder('s4', ms, { 'f-0': 'old', 'f-1': 'old', 'f-2': 'old' });
    expect(['f-3', 'f-4', 'f-5'].map((id) => leaning[id])).toEqual(['new', 'new', 'new']);
    const key = { 'f-0': { a: 'old' as const, b: 'new' as const } };
    expect(mergeKey(key, { 'f-0': { a: 'old', b: 'new' }, 'f-1': { a: 'new', b: 'old' } })).toEqual({
      'f-0': { a: 'old', b: 'new' },
      'f-1': { a: 'new', b: 'old' },
    });
    expect(() => mergeKey(key, { 'f-0': { a: 'new', b: 'old' } })).toThrow('never changed');
  });

  test('an answer given on pictures that have changed since is not counted', () => {
    const set = { name: 's4', moments: [{ id: 'x-m1', why: 'fault', old: { verdict: 'wrong' } }] } as unknown as CheckpointSet;
    const key = { 'x-m1': { a: 'old' as const, b: 'new' as const } };
    const given: Answers = {
      checkpoint: 's4',
      updated: 't',
      answers: { 'x-m1': { answer: 'b', note: '', at: 't', shown: { a: 'aaa', b: 'bbb' } } },
    };
    expect(scoreOf(set, key, given, { 'x-m1': { a: 'aaa', b: 'bbb' } }).faults.nowRight).toBe(1);
    const since = scoreOf(set, key, given, { 'x-m1': { a: 'aaa', b: 'ccc' } });
    expect(since.faults.judged).toBe(0);
    expect(since.stale).toEqual(['x-m1']);
  });

  test("every job in the store the results do not know, in any state, is stray; a run stopped while starting takes its node's own job", () => {
    const at = 't';
    const rs = {
      entries: {
        a: { id: 'a', state: 'ready', jobId: 'j1', at } as Attempt,
        b: { id: 'b', state: 'starting', nodeId: 'n-b', at } as Attempt,
        c: { id: 'c', state: 'starting', nodeId: 'n-c', at } as Attempt,
      },
    };
    const jobs = [
      { id: 'j1', state: 'ready', node: 'n-a' },
      { id: 'j2', state: 'failed', node: 'n-x' },
      { id: 'j3', state: 'cancelled', node: null },
      { id: 'j4', state: 'running', node: 'n-b' },
    ];
    const got = reconcileStore(rs, jobs);
    expect(got.stray.map((j) => j.id)).toEqual(['j2', 'j3']);
    expect(got.adopted).toEqual([{ id: 'b', job: jobs[3] }]);
    expect(got.unsent).toEqual(['c']);
    // An estimate the engine never gave counts as the most one picture may cost.
    expect(spentIn({ entries: { x: { id: 'x', state: 'ready', jobId: 'j', at } as Attempt } })).toBeCloseTo(0.2, 6);
  });
});

describe('--draw, against a stand-in engine: only what the dry run printed, under the cap, one at a time', async () => {
  const { BRIEFLESS, draw, dry, liveEngine } = await import('../evals/checkpoint');
  type ShotFn = NonNullable<Parameters<typeof dry>[4]>['shot'];
  type Engine = Parameters<typeof draw>[4];
  type Args = Parameters<typeof dry>[0];
  const SESSION = 'dream-0926-043003-b0cb';

  /**
   * A data folder like the dream chat's: the frozen snow train as its saved conversation, its pictures as
   * files (real pictures, `png`, where the engine itself reads them).
   */
  function world(cap = 3, opts: { home?: string; png?: (i: number) => Uint8Array } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-draw-'));
    const data = join(root, 'data');
    const media = join(data, 'strawberry-home', 'media');
    mkdirSync(media, { recursive: true });
    mkdirSync(join(data, 'state'), { recursive: true });
    const s = frozen(SESSION);
    [...s.build!.items, ...(s.build!.frames ?? [])].forEach((x, i) => {
      if (x.mediaPath) writeFileSync(join(media, x.mediaPath), opts.png ? opts.png(i) : `picture ${x.id}`);
    });
    const transcript = [{ role: 'user', content: 'I was on an old train at night with my grandfather, snow outside.' }];
    writeFileSync(join(data, 'state', `${SESSION}.json`), JSON.stringify({ ...s, id: SESSION, transcript, turns: [] }));
    const out = join(root, 'out');
    const f = { data, out, home: opts.home ?? join(out, 'home'), media };
    const set: CheckpointSet = {
      name: 'test',
      cap_usd: cap,
      results: out,
      moments: ['m2', 'm3'].map((mo) => ({
        id: `snow-train-${mo}`,
        run: 'snow-train',
        session: SESSION,
        moment: mo,
        why: 'fault' as const,
        reason: 'a fault',
        cases: ['c'],
        description: 'what happens',
        old: {
          source: { file: 'story-pictures.json' as const, row: `snow-train-${mo}` },
          draw: 'story' as const,
          verdict: 'wrong' as const,
          note: null,
          picture: `strawberry-home/media/${mo}.png`,
        },
      })),
    };
    const setFile = join(root, 'checkpoint-test.json');
    const writeSet = (x: CheckpointSet) => writeFileSync(setFile, JSON.stringify(x, null, 2));
    writeSet(set);
    return { data, f, set, setFile, writeSet };
  }

  /** The engine's side, in memory: a store of jobs, a picture drawn at once, an approval that holds to its ceiling. */
  function engine(
    home: string,
    opts: {
      usd?: number;
      failAfterJob?: boolean;
      jobs?: { id: string; state: string; node: string | null }[];
      resultsFile?: string;
    } = {},
  ) {
    const jobs = (opts.jobs ?? []).map((j) => ({ ...j, recipe: `r-${j.id}` }));
    const started: { moment: string; maxUsd: number; stateBefore?: string }[] = [];
    let n = 0;
    const e: Engine = {
      provider: 'fake',
      maxPerImage: 0.2,
      home,
      pollMs: 1,
      call: async (op, body) => {
        if (op === 'projects') return [{ id: 'p' }];
        if (op === 'project')
          return {
            jobs: jobs.map((j) => ({ id: j.id, recipe_id: j.recipe, state: j.state })),
            recipes: jobs.map((j) => ({ id: j.recipe, node_id: j.node })),
          };
        if (op === 'job')
          return { provider_id: `fake-request-${(body as { id: string }).id}`, receipt: { fake: true }, events: [] };
        throw new Error(`no ${op} here`);
      },
      startFrame: async ({ item, maxUsd }) => {
        const saved =
          opts.resultsFile && existsSync(opts.resultsFile)
            ? (JSON.parse(readFileSync(opts.resultsFile, 'utf8')) as { entries: Record<string, Attempt> })
            : null;
        started.push({ moment: item.id, maxUsd, stateBefore: saved?.entries[`snow-train-${item.id}`]?.state });
        const usd = opts.usd ?? 0.15;
        if (usd > maxUsd + 1e-9) throw new Error(`the estimate $${usd} is over what it may be approved for ($${maxUsd})`);
        const id = `job-${++n}`;
        jobs.push({ id, state: 'queued', node: item.nodeId ?? null, recipe: `r-${id}` });
        if (opts.failAfterJob) throw new Error('the engine answered with an error after making the job');
        return { recipeId: `r-${id}`, jobId: id, usd };
      },
      status: async (jobId) => {
        const j = jobs.find((x) => x.id === jobId);
        if (j) j.state = 'ready';
        return { state: 'ready', mediaId: `media-${jobId}`, mediaPath: `${jobId}.png` };
      },
      setUp: async (_s, _parts, drawn) => ({
        projectId: 'p',
        ids: Object.fromEntries(drawn.map((x) => [x.moment, `node-${x.moment}`])),
        media: new Map(drawn.flatMap((x) => x.keys.map((k) => [k, `media-${k}`] as [string, string]))),
      }),
      worker: () => null,
    };
    return { e, jobs, started };
  }

  const args = (x: Partial<Args> = {}): Args => {
    const a = parseArgs(['--dry', 'x.json', '--allow-briefless']);
    if ('error' in a) throw new Error(a.error);
    return { ...a, ...x };
  };
  const drawArgs = (x: Partial<Args> = {}) => args({ mode: 'draw', ...x });
  const resultsOf = (out: string) =>
    JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as { entries: Record<string, Attempt> };

  test('draws what the dry run printed, saving each attempt before the engine is asked, and keeps each job and receipt', async () => {
    const w = world();
    const dryRun = await dry(args(), w.set, w.setFile, w.f);
    expect(Object.values(dryRun.moments).every((m) => m.hash && !m.refused?.length)).toBe(true);
    const { e, started } = engine(w.f.home, { resultsFile: join(w.f.out, 'results.json') });
    await draw(drawArgs(), w.set, w.setFile, w.f, e, { allowFake: true });
    expect(started.map((x) => x.moment)).toEqual(['m2', 'm3']);
    expect(started.every((x) => x.stateBefore === 'starting')).toBe(true);
    expect(started[0].maxUsd).toBeCloseTo(0.2, 6);
    const rs = resultsOf(w.f.out);
    for (const id of ['snow-train-m2', 'snow-train-m3'])
      expect(rs.entries[id]).toMatchObject({
        state: 'ready',
        providerId: expect.stringContaining('fake-request-'),
        receipt: { fake: true },
      });
    expect(rs.entries['snow-train-m2'].output).toBe(join(w.f.home, 'media', 'job-1.png'));
    expect(existsSync(join(w.f.out, 'draw.lock'))).toBe(false);
    // Drawn, it is never drawn again.
    const again = engine(w.f.home, {
      jobs: [
        { id: 'job-1', state: 'ready', node: 'node-m2' },
        { id: 'job-2', state: 'ready', node: 'node-m3' },
      ],
    });
    await draw(drawArgs(), w.set, w.setFile, w.f, again.e, { allowFake: true });
    expect(again.started).toEqual([]);
  });

  test('--brief has the writer brief each moment without one as the harness asks it; the brief is kept, and drawn with', async () => {
    const w = world();
    const strict = args({ allowBriefless: false });
    const before = await dry(strict, w.set, w.setFile, w.f);
    const lacking = Object.entries(before.moments)
      .filter(([, m]) => m.refused?.includes(BRIEFLESS))
      .map(([id]) => id);
    expect(lacking.length).toBeGreaterThan(0);
    const asked: { moment: string; facts: string; mustName: string[] }[] = [];
    const shot: ShotFn = async (moment, facts, _medium, mustName) => {
      asked.push({ moment, facts, mustName });
      return `The camera at eye level across the carriage: ${mustName.join(', ')}.`;
    };
    const briefed = await dry({ ...strict, brief: true }, w.set, w.setFile, w.f, { shot });
    expect(asked.length).toBe(lacking.length);
    for (const id of lacking) {
      expect(briefed.moments[id].refused).toEqual([]);
      expect(briefed.moments[id].brief?.text).toStartWith('The camera at eye level');
      expect(briefed.moments[id].hash).not.toBe(before.moments[id].hash);
    }
    // Kept with the checkpoint: a dry run after it is drawn with the same brief and asks nothing more.
    const again = await dry(strict, w.set, w.setFile, w.f, { shot });
    expect(asked.length).toBe(lacking.length);
    for (const id of lacking) expect(again.moments[id].hash).toBe(briefed.moments[id].hash);
    // A writer that gives nothing usable leaves the moment refused.
    const v = world();
    const none = await dry({ ...strict, brief: true }, v.set, v.setFile, v.f, { shot: async () => null });
    for (const id of lacking) expect(none.moments[id].refused).toContain(BRIEFLESS);
  });

  test('refuses on fal only, with the checks acting, without a pinned ledger, or when the set or switches moved', async () => {
    const w = world();
    await dry(args(), w.set, w.setFile, w.f);
    const { e, started } = engine(w.f.home);
    await expect(draw(drawArgs(), w.set, w.setFile, w.f, e)).rejects.toThrow('draws on fal only');
    await expect(
      withEnv({ DREAMCHAT_CHECKS: 'act' }, () => draw(drawArgs(), w.set, w.setFile, w.f, e, { allowFake: true })),
    ).rejects.toThrow('the checks act');
    await expect(
      withEnv({ DREAMCHAT_RECORD: 'shadow' }, () => draw(drawArgs(), w.set, w.setFile, w.f, e, { allowFake: true })),
    ).rejects.toThrow('switches differ');
    await expect(
      draw(drawArgs(), { ...w.set, results: undefined }, w.setFile, w.f, e, { allowFake: true }),
    ).rejects.toThrow('does not say where its results are kept');
    w.writeSet({ ...w.set, about: 'changed after the dry run' });
    await expect(draw(drawArgs(), w.set, w.setFile, w.f, e, { allowFake: true })).rejects.toThrow(
      'changed since the dry run',
    );
    expect(started).toEqual([]);
    expect(existsSync(join(w.f.out, 'results.json'))).toBe(false);
  });

  test('a moment refused in the dry run, or changed since, is not drawn', async () => {
    const w = world();
    await dry(args(), w.set, w.setFile, w.f);
    const dryFile = join(w.f.out, 'dry.json');
    const kept = JSON.parse(readFileSync(dryFile, 'utf8'));
    kept.moments['snow-train-m2'].refused = ['refused when the dry run was read'];
    writeFileSync(dryFile, JSON.stringify(kept));
    // m3's words change after the dry run.
    const stateFile = join(w.data, 'state', `${SESSION}.json`);
    const s = JSON.parse(readFileSync(stateFile, 'utf8')) as Session;
    const m3 = s.draft!.breakdown!.scenes.flatMap((sc) => sc.moments).find((x) => x.id === 'm3')!;
    m3.action = `${m3.action} The lamp flickers.`;
    writeFileSync(stateFile, JSON.stringify(s));
    const { e, started } = engine(w.f.home);
    await draw(drawArgs(), w.set, w.setFile, w.f, e, { allowFake: true });
    expect(started).toEqual([]);
  });

  test("a job in the store the results do not know, whatever its state, stops the draw; one of a run stopped while starting is kept and counted", async () => {
    const w = world();
    await dry(args(), w.set, w.setFile, w.f);
    const stray = engine(w.f.home, { jobs: [{ id: 'old-job', state: 'failed', node: 'node-somewhere' }] });
    await expect(draw(drawArgs(), w.set, w.setFile, w.f, stray.e, { allowFake: true })).rejects.toThrow(
      'does not know (old-job failed)',
    );
    expect(stray.started).toEqual([]);
    // A run that stopped while starting m2 left it `starting`; its job is in the store.
    const entry = {
      id: 'snow-train-m2',
      session: SESSION,
      moment: 'm2',
      hash: 'h',
      prompt: '',
      images: [],
      switches: {},
      state: 'starting',
      nodeId: 'node-old-m2',
      at: 't',
    };
    writeFileSync(
      join(w.f.out, 'results.json'),
      JSON.stringify({ about: '', checkpoint: 'test', home: w.f.home, provider: 'fake', model: 'fixture', entries: { 'snow-train-m2': entry } }),
    );
    const crashed = engine(w.f.home, { jobs: [{ id: 'lost-job', state: 'ready', node: 'node-old-m2' }] });
    await draw(drawArgs(), w.set, w.setFile, w.f, crashed.e, { allowFake: true });
    expect(crashed.started.map((x) => x.moment)).toEqual(['m3']);
    const rs = resultsOf(w.f.out);
    expect(rs.entries['snow-train-m2']).toMatchObject({ jobId: 'lost-job', state: 'ready' });
    expect(spentIn(rs)).toBeCloseTo(0.2 + 0.15, 6);
  });

  test('an error after the engine made the job keeps the job; a picture is never approved for more than is left under the cap', async () => {
    const w = world();
    await dry(args(), w.set, w.setFile, w.f);
    const late = engine(w.f.home, { failAfterJob: true });
    await draw(drawArgs({ only: ['snow-train-m2'] }), w.set, w.setFile, w.f, late.e, { allowFake: true });
    expect(resultsOf(w.f.out).entries['snow-train-m2']).toMatchObject({ jobId: 'job-1', state: 'ready' });
    // Under a $0.35 cap at $0.20 a picture: the first is drawn, the second may be approved for $0.15 only.
    const v = world(0.35);
    await dry(args(), v.set, v.setFile, v.f);
    const dear = engine(v.f.home, { usd: 0.2 });
    await draw(drawArgs(), v.set, v.setFile, v.f, dear.e, { allowFake: true });
    expect(dear.started.map((x) => [x.moment, Number(x.maxUsd.toFixed(2))])).toEqual([
      ['m2', 0.2],
      ['m3', 0.15],
    ]);
    const rs = resultsOf(v.f.out);
    expect(rs.entries['snow-train-m2'].state).toBe('ready');
    expect(rs.entries['snow-train-m3'].state).toBe('refused');
    expect(spentIn(rs)).toBeLessThanOrEqual(0.35);
    // Over the cap before it starts: refused whole.
    const u = world(0.2);
    await dry(args(), u.set, u.setFile, u.f);
    const none = engine(u.f.home);
    await expect(draw(drawArgs(), u.set, u.setFile, u.f, none.e, { allowFake: true })).rejects.toThrow(
      'over the $0.20 cap',
    );
    expect(none.started).toEqual([]);
  });

  // Slow (the engine is a Python process a call), so only when asked: CHECKPOINT_ENGINE_TEST=1, with
  // STRAWBERRY_PYTHON the engine's Python. Its own offline provider draws a marked test card; nothing is paid.
  test.skipIf(!process.env.CHECKPOINT_ENGINE_TEST)(
    'through the engine itself, offline: the dream written into a throwaway store, each moment drawn once by its fake provider',
    async () => {
      const e = await liveEngine();
      // Never with a provider that is paid for.
      expect(e.provider).toBe('fake');
      const d = buildDream(frozen(SESSION));
      const eye = d.r.pictures.find((x) => x.id === 'm2')?.item.frame?.plan?.eye;
      const plan = shotPlan(d.r.b, 'm2', d.r.rec);
      if (!eye || !plan) throw new Error('the snow train m2 has no camera');
      const w = world(3, { home: e.home, png: (i) => previsImage(plan, eye, [], (id) => id, 48 + i, 27 + i) });
      await dry(args(), w.set, w.setFile, w.f);
      const rs = await draw(drawArgs(), w.set, w.setFile, w.f, { ...e, pollMs: 500 }, { allowFake: true });
      for (const id of ['snow-train-m2', 'snow-train-m3']) {
        expect(rs.entries[id]).toMatchObject({ state: 'ready', jobId: expect.any(String) });
        expect(existsSync(rs.entries[id].output as string)).toBe(true);
      }
    },
    900_000,
  );

  test('one draw at a time: a lock another draw holds stops it', async () => {
    const w = world();
    await dry(args(), w.set, w.setFile, w.f);
    writeFileSync(join(w.f.out, 'draw.lock'), 'pid 1, since then');
    const { e, started } = engine(w.f.home);
    await expect(draw(drawArgs(), w.set, w.setFile, w.f, e, { allowFake: true })).rejects.toThrow('another --draw');
    expect(started).toEqual([]);
    expect(existsSync(join(w.f.out, 'draw.lock'))).toBe(true);
  });
});
