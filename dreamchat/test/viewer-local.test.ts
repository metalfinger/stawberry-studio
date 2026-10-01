// The local image machine's runs in the viewer (viewer/local.ts): every run and dream with how far it has got, a
// dream's pictures with their files by name only, a picture served from its dream's own folder and nowhere else, and
// the owner's verdicts kept beside the run.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localCompare, localDream, localImage, localRuns, withLocalVerdict } from '../viewer/local';
import { serveViewer } from '../viewer/serve';

let root = '';
const was = process.env.LOCAL_RUNS;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'local-runs-'));
  process.env.LOCAL_RUNS = root;
  const dir = join(root, 'night-1', 'dream-0926-012307-4c79');
  mkdirSync(join(dir, 'img'), { recursive: true });
  writeFileSync(join(dir, 'img', 'cut-m1.png'), 'png');
  writeFileSync(join(root, 'night-1', 'secret.png'), 'no');
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      run: 'night-1',
      dream: 'dream-0926-012307-4c79',
      title: 'The Heron Teacher',
      quality: 'high',
      updated: '2026-09-30T20:00:00Z',
      pictures: [
        { id: 'p1', kind: 'sketch', name: 'you', state: 'done', file: join(dir, 'img', 'sketch-p1.png') },
        {
          id: 'm1',
          kind: 'cut',
          name: 'The dreamer walks',
          state: 'done',
          file: join(dir, 'img', 'cut-m1.png'),
          imagesSent: [{ n: 1, role: 'base', name: 'previs-m1', file: join(dir, 'img', 'previs-m1.png') }],
        },
        { id: 'm2', kind: 'cut', name: 'The dreamer looks', state: 'waiting' },
        { id: 'm3', kind: 'cut', name: 'The dreamer opens', state: 'failed', error: 'timed out' },
      ],
    }),
  );
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (was === undefined) delete process.env.LOCAL_RUNS;
  else process.env.LOCAL_RUNS = was;
});

describe('the local runs', () => {
  test('every run and dream, with how far each has got', () => {
    const runs = localRuns();
    expect(runs.map((r) => r.run)).toEqual(['night-1']);
    expect(runs[0].dreams[0]).toMatchObject({ title: 'The Heron Teacher', done: 2, waiting: 1, failed: 1, judged: 0 });
  });

  test('a dream with its files by name only, never a path on this machine', () => {
    const got = localDream('night-1', 'dream-0926-012307-4c79')!;
    const m1 = got.manifest.pictures.find((p) => p.id === 'm1')!;
    expect(m1.file).toBe('cut-m1.png');
    expect(m1.imagesSent![0].file).toBe('previs-m1.png');
    expect(localDream('night-1', '../night-1')).toBeNull();
  });

  test('a picture from its dream’s own folder, and nothing else', () => {
    expect(localImage('night-1', 'dream-0926-012307-4c79', 'cut-m1.png')).toEndWith('cut-m1.png');
    expect(localImage('night-1', 'dream-0926-012307-4c79', 'manifest.json')).toBeNull();
    expect(localImage('night-1', '..', 'secret.png')).toBeNull();
    expect(localImage('night-1', 'dream-0926-012307-4c79', '../../secret.png')).toBeNull();
  });

  test('the owner’s verdict kept beside the run, taken back, and refused for what the run has not', () => {
    const at = '2026-10-01T07:00:00Z';
    const saved = withLocalVerdict(
      { run: 'night-1', dream: 'dream-0926-012307-4c79', id: 'm1', verdict: 'partly', note: 'the door' },
      at,
    );
    expect(saved).toEqual({ verdicts: { m1: { verdict: 'partly', note: 'the door', at } } });
    const file = join(root, 'night-1', 'dream-0926-012307-4c79', 'verdicts.json');
    expect(JSON.parse(readFileSync(file, 'utf8')).m1.verdict).toBe('partly');
    expect(localRuns()[0].dreams[0].judged).toBe(1);
    expect(withLocalVerdict({ run: 'night-1', dream: 'dream-0926-012307-4c79', id: 'm1', clear: true }, at)).toEqual({
      verdicts: {},
    });
    expect(
      withLocalVerdict({ run: 'night-1', dream: 'dream-0926-012307-4c79', id: 'm9', verdict: 'right' }, at),
    ).toMatchObject({ status: 404 });
    expect(
      withLocalVerdict({ run: 'night-1', dream: 'dream-0926-012307-4c79', id: 'm1', verdict: 'maybe' }, at),
    ).toMatchObject({ status: 400 });
    expect(withLocalVerdict({ run: '../x', dream: 'y', id: 'm1', verdict: 'right' }, at)).toMatchObject({
      status: 404,
    });
  });
});

describe('two runs of the same dreams, side by side', () => {
  const DREAM = 'dream-0926-012307-4c79';
  beforeAll(() => {
    // The same dream drawn again in another run (the moments with another prompt), its sketches shared.
    const dir = join(root, 'qwen-1', DREAM);
    mkdirSync(join(dir, 'img'), { recursive: true });
    writeFileSync(join(dir, 'img', 'cut-m1.png'), 'another png');
    // Its in-between picture is the first run's own, byte for byte (a seeded run): the first run has it too.
    writeFileSync(join(dir, 'img', 'ghost-g1.png'), 'ghost');
    const first = join(root, 'night-1', DREAM);
    writeFileSync(join(first, 'img', 'ghost-g1.png'), 'ghost');
    const m = JSON.parse(readFileSync(join(first, 'manifest.json'), 'utf8'));
    m.pictures.splice(1, 0, {
      id: 'g1',
      kind: 'ghost',
      name: 'the door, open',
      state: 'done',
      file: join(first, 'img', 'ghost-g1.png'),
    });
    writeFileSync(join(first, 'manifest.json'), JSON.stringify(m));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        run: 'qwen-1',
        dream: DREAM,
        title: 'The Heron Teacher',
        readings: ['typed readings not cached: m1'],
        updated: '2026-10-01T03:00:00Z',
        pictures: [
          { id: 'p1', kind: 'sketch', name: 'you', state: 'done', file: join(dir, 'img', 'sketch-p1.png') },
          { id: 'g1', kind: 'ghost', name: 'the door, open', state: 'done', file: join(dir, 'img', 'ghost-g1.png') },
          { id: 'm1', kind: 'cut', name: 'The dreamer walks', state: 'done', file: join(dir, 'img', 'cut-m1.png') },
          { id: 'm4', kind: 'cut', name: 'The heron turns', state: 'waiting' },
        ],
      }),
    );
  });

  test('the dreams both runs have, and each picture of either run by its id, sketches left out', () => {
    expect(localCompare('night-1', 'qwen-1')).toEqual({
      dreams: [{ dream: DREAM, title: 'The Heron Teacher', a: 3, b: 3 }],
    });
    const got = localCompare('night-1', 'qwen-1', DREAM)!;
    expect(got.pairs!.map((p) => [p.id, p.a?.state ?? null, p.b?.state ?? null, !!p.shared])).toEqual([
      ['g1', 'done', 'done', true],
      ['m1', 'done', 'done', false],
      ['m2', 'waiting', null, false],
      ['m3', 'failed', null, false],
      ['m4', null, 'waiting', false],
    ]);
    // Files by name only, as each run's own page has them.
    expect(got.pairs!.find((p) => p.id === 'm1')!.b!.file).toBe('cut-m1.png');
    expect(Object.keys(got.verdicts!)).toEqual(['a', 'b']);
    // What each run drew without, so a run missing its readings is never judged as if it had them.
    expect(got.readings).toEqual({ a: [], b: ['typed readings not cached: m1'] });
  });

  test("a seeded run's picture is served from the run that holds it, and is the same picture in both", () => {
    // A run seeded from another keeps its source's in-between picture where it is: night-1's folder.
    const dir = join(root, 'qwen-1', DREAM);
    const first = join(root, 'night-1', DREAM);
    writeFileSync(join(first, 'img', 'ghost-g2.png'), 'seeded');
    for (const at of [dir, first]) {
      const m = JSON.parse(readFileSync(join(at, 'manifest.json'), 'utf8'));
      m.pictures.push({
        id: 'g2',
        kind: 'ghost',
        name: 'the door, wide',
        state: 'done',
        file: join(first, 'img', 'ghost-g2.png'),
      });
      writeFileSync(join(at, 'manifest.json'), JSON.stringify(m));
    }
    const seen = localDream('qwen-1', DREAM)!.manifest.pictures.find((p) => p.id === 'g2')!;
    expect([seen.file, seen.from]).toEqual(['ghost-g2.png', 'night-1']);
    expect(localImage(seen.from!, DREAM, seen.file!)).toBe(join(first, 'img', 'ghost-g2.png'));
    // Its own pictures name no other run.
    expect(localDream('qwen-1', DREAM)!.manifest.pictures.find((p) => p.id === 'm1')!.from).toBeUndefined();
    expect(localCompare('night-1', 'qwen-1', DREAM)!.pairs!.find((p) => p.id === 'g2')!.shared).toBe(true);
  });

  test("none for a run not here, one run against itself, or a name that is not a run's", () => {
    expect(localCompare('night-1', 'nowhere')).toBeNull();
    expect(localCompare('night-1', 'night-1')).toBeNull();
    expect(localCompare('../night-1', 'qwen-1')).toBeNull();
  });

  test('its page and its data are served to this machine', async () => {
    const { url, stop } = serveViewer(0);
    try {
      for (const path of ['local-compare', 'local-compare/night-1/qwen-1', `local-compare/night-1/qwen-1/${DREAM}`])
        expect([path, (await fetch(`${url}${path}`)).headers.get('content-type')]).toEqual([
          path,
          'text/html; charset=utf-8',
        ]);
      const r = await fetch(`${url}api/local/compare?a=night-1&b=qwen-1&dream=${DREAM}`);
      expect(r.status).toBe(200);
      expect(((await r.json()) as { pairs: unknown[] }).pairs).toHaveLength(6);
      expect((await fetch(`${url}api/local/compare?a=night-1&b=nowhere`)).status).toBe(404);
    } finally {
      stop();
    }
  });
});
