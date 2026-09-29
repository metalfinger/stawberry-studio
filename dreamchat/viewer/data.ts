// The harness viewer's data (VIEWER_PLAN.md): one saved dream as today's code prepares it, for a person to read
// and judge. Everything here is taken from one rebuild of the dream (plan.ts rebuild) and the drawing path's own
// mock-up (session.ts previsFor); nothing is worked out again. What a rebuild takes as given is said in the header:
// every sketch and earlier picture drawn and approved.

import { halfViewOf } from '../blocking';
import { shotPlan } from '../continuity';
import { tagWords } from '../cutsheet';
import { hashOf } from '../lib';
import { imageName, type Rebuilt, type RebuiltPicture, rebuild } from '../plan';
import { moments } from '../producer';
import { sayNow } from '../record';
import { calledFor, previsFor, type Session } from '../session';
import { sheetPrompt } from '../sheets';
import type { ViewCut, ViewDream, ViewFile, ViewGhost, ViewHashes, ViewRef, ViewSequence, ViewSheet } from './types';

/** The switches taken as "the harness": everything on, the one builder at every step built. */
export const PROFILE: Record<string, string> = {
  DREAMCHAT_RECORD: 'on',
  DREAMCHAT_CUT_SHEET: 'on',
  DREAMCHAT_CAMERA: 'on',
  DREAMCHAT_REFS: 'on',
  DREAMCHAT_ONE_BUILDER: 'on',
};

const switches = () =>
  Object.fromEntries(
    Object.entries(process.env)
      .filter(([k, v]) => k.startsWith('DREAMCHAT_') && v !== undefined && k !== 'DREAMCHAT_DATA')
      .sort(([a], [b]) => a.localeCompare(b)),
  ) as Record<string, string>;

const sha = (x: unknown) => hashOf(x);

export type ViewOpts = {
  id: string;
  source: 'frozen' | 'live';
  commit: string;
  /** Render each cut's mock-up (pure CPU); off, a cut's mockUp is null. */
  mockUps?: boolean;
  /** A file on this machine for a sketch or picture, by its item: null where there is none. */
  fileOf?: (item: { id: string; mediaPath?: string; version?: number }) => ViewFile;
};

/**
 * A saved dream with its readings in, exactly as the measures read it (evals/corpus.ts): what each moment's words
 * imply (with the record on) and each moment's typed reading (with the one builder on), from the caches only. The
 * viewer never asks a model: a reading not cached is an error, named, never a quiet gap.
 */
export async function withReadings(s: Session): Promise<Session> {
  const { recordMode } = await import('../record');
  const { oneBuilder } = await import('../cleanups');
  const { withImplied } = await import('../evals/implied-cache');
  const { withTyped } = await import('../evals/typed-cache');
  const { JEV_MODEL } = await import('../evals/prompt-cases');
  let session = s;
  if (recordMode() === 'on') {
    const refuse = async (): Promise<never> => {
      throw new Error('the viewer asks no model: a reading of what a moment implies is not cached');
    };
    session = (await withImplied(session, { write: refuse, jev: refuse, jevModel: JEV_MODEL() })).session;
  }
  if (oneBuilder()) {
    const typed = await withTyped(session);
    if (typed.missing.length) throw new Error(`typed readings not cached: ${typed.missing.join(', ')}`);
    session = typed.session;
  }
  return session;
}

/** One dream for the viewer, and the mock-ups it names (by file name), for the caller to write. */
export function viewDream(s: Session, o: ViewOpts): { view: ViewDream; files: Record<string, Uint8Array> } {
  const r = rebuild(s);
  const files: Record<string, Uint8Array> = {};
  const fileOf = o.fileOf ?? (() => null);
  const set = switches();
  const full = Object.entries(PROFILE).every(([k, v]) => set[k] === v);
  const b = r.b;
  const cuts = r.pictures.filter((p) => p.kind === 'cut');
  const moment = new Map(moments(b).map((m) => [m.id, m]));
  const item = (id: string) => s.build?.items.find((i) => i.id === id);
  const tree = r.dream?.tree ?? null;
  // Drawn in the saved dream: a frozen copy keeps each sketch's status, not its media.
  const drawn = (id: string) => item(id)?.status === 'ready';

  // Each image as the assembler put it in: its key, its line of the prompt, whom it is for.
  const refsOf = (p: RebuiltPicture): ViewRef[] => {
    const lines = (p.assembled?.lines ?? []).find((l) => l.id === 'manifest')?.text.split('\n') ?? [];
    return (p.assembled?.references ?? []).map((x, i) => {
      const key = imageName(r, x.image);
      const sk = key.startsWith('sketch:') ? item(key.slice(7)) : undefined;
      return {
        n: i + 1,
        role: x.role,
        source: x.source,
        key,
        instruction: x.instruction,
        line: lines.find((l) => l.startsWith(`Image ${i + 1}: `)) ?? '',
        subjects: x.subjects ?? [],
        file: sk ? fileOf(sk) : null,
        ...(sk && !drawn(sk.id) ? { notDrawnYet: true as const } : {}),
      };
    });
  };

  const hashes = (chain: unknown, words: string, facts: unknown): ViewHashes => ({
    chain: sha(chain),
    words: sha(words),
    facts: sha(facts),
  });

  const viewCuts: ViewCut[] = cuts.map((p) => {
    const plan = p.item.frame?.plan;
    const m = moment.get(p.id);
    const sheet = p.sheet;
    const at = tree?.index[p.id];
    const planShot = plan?.shot ?? '';
    const planScene = plan?.scene ?? '';
    // Where the tree groups this cut otherwise than the plan the prompts are made from (ledger row 2).
    const shotNode = tree?.dream.sequences
      .flatMap((q) => q.scenes)
      .flatMap((sc) => sc.shots)
      .find((sh) => sh.cuts.some((c) => c.id === p.id));
    const planMates = cuts.filter((c) => c.item.frame?.plan?.shot === planShot).map((c) => c.id);
    const treeMates = shotNode?.cuts.map((c) => c.id) ?? [];
    const treeDiffers = !tree
      ? 'no tree'
      : JSON.stringify(planMates) === JSON.stringify(treeMates)
        ? null
        : `the tree's shot has ${treeMates.join(', ') || 'nothing'}; the plan's has ${planMates.join(', ')}`;
    const eye = plan?.eye;
    const floorPlan = eye ? shotPlan(b, p.id, r.rec) : undefined;
    let mockUp: ViewFile = null;
    if (o.mockUps && eye) {
      const rendered = previsFor(b, p.item, calledFor(s, p.item), r.rec);
      if (rendered) {
        files[`previs-${rendered.key}.png`] = rendered.png;
        mockUp = { name: `previs-${rendered.key}.png`, sha256: rendered.key };
      }
    }
    const refs = refsOf(p);
    const facts = {
      inView: (sheet?.inView ?? []).map((e) => ({ id: e.id, name: e.name, said: e.said })),
      own: (sheet?.record?.own ?? []).map((x) => ({ who: x.who, what: x.what, now: x.now })),
      carried: (sheet?.record?.carried ?? sheet?.states ?? []).map((x) => ({ who: x.who, what: x.what, now: x.now })),
      now: sheet?.now ? sayNow(sheet.now).map((x) => x.text) : (sheet?.nowWords ?? []),
    };
    const camera = {
      size: sheet?.camera.size ?? m?.distance ?? null,
      eyes: sheet?.camera.eyes ?? m?.eyes ?? 'outside',
      looksAt: sheet?.camera.looksAt ?? null,
      words: sheet?.camera.view ?? sheet?.camera.words ?? null,
      eye: eye
        ? {
            x: eye.at.x,
            y: eye.at.y,
            height: eye.height,
            dir: (Math.atan2(eye.d.y, eye.d.x) * 180) / Math.PI,
            fov: 2 * halfViewOf(eye),
            lens: eye.lens ?? null,
          }
        : null,
    };
    return {
      id: p.id,
      order: plan?.order ?? 0,
      sequence: at?.sequence ?? '',
      scene: planScene,
      shot: planShot,
      treeDiffers,
      moment: {
        action: m?.action ?? '',
        looksAt: m?.looks_at ?? '',
        feeling: m?.feeling ?? '',
        point: m?.visual_point ?? '',
        eyes: m?.eyes ?? 'outside',
        distance: m?.distance ?? '',
      },
      tags: sheet ? tagWords(sheet.tags) : [],
      camera,
      floor: floorPlan
        ? {
            room: { w: floorPlan.room?.[0] ?? 10, d: floorPlan.room?.[1] ?? 10 },
            spots: floorPlan.spots.map((x) => ({
              id: x.id,
              name: calledFor(s, p.item)(x.id),
              x: x.x,
              y: x.y,
              ...(x.size ? { w: x.size[0], d: x.size[1] } : {}),
            })),
          }
        : null,
      mockUp,
      links: (plan?.refs ?? []).map((x) => ({
        from: x.id,
        kind: x.kind,
        relation: x.relation ?? null,
        role: x.role,
      })),
      refs,
      // Why each reference the plan chose was not sent: gap 1 (VIEWER_PLAN.md), the Mac pane's.
      unsent: [],
      facts,
      issues: r.plan.issues.filter((x) => new RegExp(`\\b${p.id}\\b`).test(x)),
      prompt: p.prompt,
      paragraphs: (p.assembled?.lines ?? []).filter((l) => l.text).map((l) => ({ id: l.id, text: l.text })),
      drawn: null,
      hashes: hashes(
        { refs: refs.map((x) => [x.key, x.role, x.source]), mockUp: mockUp?.sha256 ?? null, eye: camera.eye },
        p.prompt,
        facts,
      ),
    };
  });

  const ghostPics = new Map(r.pictures.filter((p) => p.kind === 'ghost').map((p) => [p.id, p]));
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const g = r.plan.ghosts.find((x) => x.id === id);
    if (!g?.after || seen.has(id)) return 1;
    seen.add(id);
    return 1 + depthOf(g.after, seen);
  };
  const ghosts: ViewGhost[] = r.plan.ghosts.map((g) => {
    const p = ghostPics.get(g.id);
    const refs: ViewRef[] = (p?.references ?? []).map((x, i) => {
      const key = imageName(r, x.media_id);
      const sk = key.startsWith('sketch:') ? item(key.slice(7)) : undefined;
      return {
        n: i + 1,
        role: x.role,
        source: key.startsWith('sketch:') ? 'sketch' : key.startsWith('picture:') ? 'earlier' : 'ghost',
        key,
        instruction: x.instruction,
        line: p?.prompt.split('\n').find((l) => l.startsWith(`Image ${i + 1}`)) ?? '',
        subjects: [],
        file: sk ? fileOf(sk) : null,
        ...(sk && !drawn(sk.id) ? { notDrawnYet: true as const } : {}),
      };
    });
    return {
      id: g.id,
      kind: g.kind,
      of: g.of,
      change: g.change,
      from: [g.of, ...(g.from ? [g.from] : []), ...(g.after ? [g.after] : [])],
      usedBy: g.usedBy,
      depth: depthOf(g.id),
      why: g.why,
      refs,
      prompt: p?.prompt ?? '',
      file: null,
      hashes: hashes(
        refs.map((x) => [x.key, x.role]),
        p?.prompt ?? '',
        g.state ?? null,
      ),
    };
  });

  const style = s.style!;
  const firstSheet = cuts.find((p) => p.sheet)?.sheet;
  const sheets: ViewSheet[] = r.sheets
    .filter((sk) => !sk.extras)
    .map((sk) => {
      const e = cuts.flatMap((p) => p.sheet?.inView ?? []).find((x) => x.id === sk.id);
      const key = `sketch:${sk.id}`;
      const prompt = sheetPrompt(sk, style);
      const usedBy = [
        ...viewCuts.filter((c) => c.refs.some((x) => x.key === key)).map((c) => c.id),
        ...ghosts.filter((g) => g.refs.some((x) => x.key === key)).map((g) => g.id),
      ];
      const kind: ViewSheet['kind'] = e
        ? e.said === 'place' || e.said === 'thing' || e.said === 'person' || e.said === 'animal' || e.said === 'people'
          ? e.said
          : 'thing'
        : sk.kind === 'character'
          ? 'person'
          : sk.kind === 'location'
            ? 'place'
            : 'thing';
      return {
        id: sk.id,
        name: sk.isDreamer ? 'the dreamer' : sk.name,
        kind,
        key,
        look: e?.look ?? '',
        prompt,
        file: fileOf(item(sk.id) ?? sk),
        drawn: drawn(sk.id),
        usedBy,
        hashes: hashes([key], prompt, e?.look ?? ''),
      };
    });

  // The plan's scenes and shots, grouped by the tree's sequences: the plan's labels are the ones the prompts use.
  const seqs = new Map<string, ViewSequence>();
  for (const c of viewCuts) {
    const node = tree?.dream.sequences.find((q) => q.id === c.sequence);
    const q = seqs.get(c.sequence) ?? {
      id: c.sequence || 'all',
      startsAt: node?.startsAt ?? c.id,
      splitBy: node?.splitBy ?? 'start',
      scenes: [],
    };
    seqs.set(c.sequence, q);
    let sc = q.scenes.find((x) => x.id === c.scene);
    if (!sc) {
      const bs = b.scenes.find((x) => x.id === c.scene);
      const tn = node?.scenes.find((x) => x.breakdownScene === c.scene);
      sc = {
        id: c.scene,
        title: bs?.title ?? c.scene,
        place: bs?.place ?? '',
        mood: bs?.mood ?? '',
        tags: tn?.tags ?? [],
        shots: [],
      };
      q.scenes.push(sc);
    }
    let sh = sc.shots.find((x) => x.id === c.shot);
    if (!sh) {
      const tn = node?.scenes.flatMap((x) => x.shots).find((x) => x.cuts.some((y) => y.id === c.id));
      sh = { id: c.shot, tags: tn?.tags ?? [], cuts: [] };
      sc.shots.push(sh);
    }
    sh.cuts.push(c.id);
  }

  const transcript = (s as { transcript?: { role: string; content: string }[] }).transcript;
  return {
    view: {
      header: {
        dream: o.id,
        title: r.title,
        source: o.source,
        commit: o.commit,
        profile: { name: 'harness', full },
        switches: set,
        assumes: 'all drawn and approved',
        made: new Date().toISOString(),
      },
      style: { id: style.id, name: style.name, told: firstSheet?.style.told ?? [] },
      words: transcript
        ? transcript.map((t, i) => ({
            turn: i,
            who: t.role === 'user' ? ('dreamer' as const) : ('listener' as const),
            text: t.content,
          }))
        : null,
      sheets,
      tree: [...seqs.values()],
      cuts: viewCuts,
      ghosts,
      issues: r.plan.issues,
    },
    files,
  };
}

export type { Rebuilt };

if (import.meta.main) {
  // bun run viewer/data.ts <dream id> [--live] [--no-mockups]: writes runs/viewer/<dream>/view.json and its mock-ups.
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { loadDream } = await import('../evals/saved');
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('usage: bun run viewer/data.ts <dream id> [--live] [--no-mockups]');
    process.exit(1);
  }
  const live = args.includes('--live');
  const commit = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD']).stdout.toString().trim();
  const { view, files } = viewDream(await withReadings(loadDream(id, live).session as Session), {
    id,
    source: live ? 'live' : 'frozen',
    commit,
    mockUps: !args.includes('--no-mockups'),
  });
  const dir = join(import.meta.dir, '..', 'runs', 'viewer', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'view.json'), `${JSON.stringify(view, null, 1)}\n`);
  for (const [name, png] of Object.entries(files)) writeFileSync(join(dir, name), png);
  console.log(
    `${id}: ${view.cuts.length} cuts, ${view.ghosts.length} in-between pictures, ${view.sheets.length} sheets, ${Object.keys(files).length} mock-ups; profile ${view.header.profile.full ? 'full' : 'NOT full'} -> ${dir}`,
  );
}
