// The local image machine's runs in the viewer (viewer/local.ts): every run and dream with how far it has got, a
// dream's pictures with their files by name only, a picture served from its dream's own folder and nowhere else, and
// the owner's verdicts kept beside the run.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDream, localImage, localRuns, withLocalVerdict } from '../viewer/local';

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
