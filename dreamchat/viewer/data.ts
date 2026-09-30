// The harness viewer's data (VIEWER_PLAN.md): one saved dream as today's code prepares it, for a person to read
// and judge. Everything here is taken from one rebuild of the dream (plan.ts rebuild), the drawing path's own mock-up
// (session.ts previsFor) and the drawing gate's own reading of the plan's issues; nothing is worked out again. What a
// rebuild takes as given is said in the header: every sketch and earlier picture drawn and approved.

import { matchGhost } from '../asdrawn';
import { type Blocking, DIRECTIONS, facing, halfViewOf } from '../blocking';
import { shotPlan } from '../continuity';
import { tagWords } from '../cutsheet';
import { sha as promptSha } from '../gate';
import { hashOf } from '../lib';
import { imageName, type Rebuilt, type RebuiltPicture, rebuild, standIn } from '../plan';
import { moments } from '../producer';
import { resolveTree } from '../tree';
import { sayNow } from '../record';
import { calledFor, previsFor, type Session, treeInputOf } from '../session';
import { type Item, sheetPrompt } from '../sheets';
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

/** Rounded as the drawing path rounds what it keys on (session.ts), so a verdict's hash holds on any machine. */
const round = (x: number, to: number) => Math.round(x / to) * to;

export type ViewOpts = {
  id: string;
  source: 'frozen' | 'live';
  commit: string;
  /** Put each cut's mock-up picture in `files` (its sha256 and whether it is sent are always given). */
  mockUps?: boolean;
  /** A file on this machine for a sketch or picture, by its item: null where there is none. */
  fileOf?: (item: Item) => ViewFile;
};

/**
 * A saved dream with its readings in, exactly as the measures read it (evals/corpus.ts): what each moment's words
 * imply (with the record on) and each moment's typed reading (with the one builder on), from the caches only. The
 * viewer never asks a model: a reading not cached is an error, named, never a quiet gap.
 */
export async function withReadings(
  s: Session,
  opts: { impliedCache?: string; typedCache?: string } = {},
): Promise<Session> {
  const { recordMode } = await import('../record');
  const { oneBuilder } = await import('../cleanups');
  const { withImplied } = await import('../evals/implied-cache');
  const { withTyped } = await import('../evals/typed-cache');
  const { JEV_MODEL } = await import('../evals/prompt-cases');
  let session = s;
  if (recordMode() === 'on') {
    const refuse = async (): Promise<never> => {
      throw new Error('the viewer asks no model');
    };
    // The implied reading turns a failed call into "nothing implied": what was not in the cache is counted instead.
    const read = await withImplied(session, {
      write: refuse,
      jev: refuse,
      jevModel: JEV_MODEL(),
      ...(opts.impliedCache ? { cacheFile: opts.impliedCache } : {}),
    });
    if (read.asked) throw new Error(`what the moments imply is not cached: ${read.asked} readings missing`);
    session = read.session;
  }
  if (oneBuilder()) {
    const typed = await withTyped(session, opts.typedCache ? { cacheFile: opts.typedCache } : {});
    if (typed.missing.length) throw new Error(`typed readings not cached: ${typed.missing.join(', ')}`);
    session = typed.session;
  }
  return session;
}

/** Drawn in the saved dream: an image of its own, or ready (a frozen copy keeps the status, not the media). */
const isDrawn = (it: Item | undefined) => !!it && (!!it.mediaId || it.status === 'ready');

/** One dream for the viewer, and the mock-ups it names (by file name), for the caller to write. */
export function viewDream(s: Session, o: ViewOpts): { view: ViewDream; files: Record<string, Uint8Array> } {
  const r = rebuild(s);
  const files: Record<string, Uint8Array> = {};
  const fileOf = o.fileOf ?? (() => null);
  const set = switches();
  const full = Object.entries(PROFILE).every(([k, v]) => set[k] === v);
  const b = r.b;
  const style = s.style!;
  const cuts = r.pictures.filter((p) => p.kind === 'cut');
  const byOrder = [...cuts].sort((x, y) => (x.item.frame?.order ?? 0) - (y.item.frame?.order ?? 0));
  const moment = new Map(moments(b).map((m) => [m.id, m]));
  const item = (id: string) => s.build?.items.find((i) => i.id === id);
  const saved = s.build?.frames ?? [];
  const savedGhosts = saved.filter((f) => f.kind === 'ghost');
  const tree = r.dream?.tree ?? null;

  // What an image in a rebuilt prompt stands for in the saved dream: a sketch, an earlier cut or an in-between picture
  // (matched by the change it shows, never by its number, which a plan made again may give otherwise), or a mock-up.
  const savedOf = (media: string): { item: Item | undefined; mockUp: boolean } => {
    const sk = r.sheets.find((x) => x.mediaId === media);
    if (sk) return { item: item(sk.id), mockUp: false };
    if (media.startsWith(standIn.previs(''))) return { item: undefined, mockUp: true };
    const drawnId = media.startsWith(`${standIn.picture('')}drawn-`)
      ? media.slice(`${standIn.picture('')}drawn-`.length)
      : null;
    if (drawnId) return { item: saved.find((f) => f.id === drawnId), mockUp: false };
    const id = media.startsWith(standIn.picture('')) ? media.slice(standIn.picture('').length) : null;
    const g = id ? r.plan.ghosts.find((x) => x.id === id) : undefined;
    if (g) return { item: matchGhost(g, savedGhosts, (f) => f.ghost), mockUp: false };
    return { item: id ? saved.find((f) => f.id === id && f.kind === 'cut') : undefined, mockUp: false };
  };
  const sourceOfKey = (key: string): ViewRef['source'] => {
    if (key.startsWith('sketch:')) return 'sketch';
    if (key.startsWith('picture:')) return 'earlier';
    if (key.startsWith('ghost:')) return 'ghost';
    if (key.startsWith('previs:')) return 'mockup';
    throw new Error(`an image the viewer cannot name: ${key}`);
  };
  const ref = (
    n: number,
    media: string,
    x: { role: ViewRef['role']; instruction: string; source?: ViewRef['source']; subjects?: string[] },
    line: string,
  ): ViewRef => {
    const key = imageName(r, media);
    const it = savedOf(media);
    return {
      n,
      role: x.role,
      source: x.source ?? sourceOfKey(key),
      key,
      instruction: x.instruction,
      line,
      subjects: x.subjects ?? [],
      file: it.item ? fileOf(it.item) : null,
      ...(!it.mockUp && !isDrawn(it.item) ? { notDrawnYet: true as const } : {}),
    };
  };
  // Each image as the assembler put it in (its line of the prompt, whom it is for); without the one builder's
  // paragraph ids, as the prompt's references list them.
  const refsOf = (p: RebuiltPicture): ViewRef[] => {
    if (p.assembled) {
      const lines = p.assembled.lines.find((l) => l.id === 'manifest')?.text.split('\n') ?? [];
      return p.assembled.references.map((x, i) =>
        ref(i + 1, x.image, x, lines.find((l) => l.startsWith(`Image ${i + 1}: `)) ?? ''),
      );
    }
    // A moment's prompt (the old builder) gives each image a line of its own; an in-between picture's names its images
    // in its sentences ("Image 2 is their reference sheet: …"), each running until the next one's.
    const lines = p.prompt.split('\n');
    const sentence = (n: number) =>
      lines.find((l) => l.startsWith(`Image ${n}: `)) ??
      p.prompt.match(new RegExp(`Image ${n} is\\b[^\\n]*?(?=\\s+Image \\d+ is\\b|\\n|$)`))?.[0] ??
      '';
    return p.references.map((x, i) =>
      ref(i + 1, x.media_id, { role: x.role as ViewRef['role'], instruction: x.instruction }, sentence(i + 1)),
    );
  };

  const hashes = (chain: unknown, words: string, facts: unknown): ViewHashes => ({
    chain: hashOf(chain),
    words: hashOf(words),
    facts: hashOf(facts),
  });

  // The panel's tree (session.ts treeInputOf; its goals only name where the eyes come from), beside the plan the
  // prompts use; a tree that cannot be made says why on every cut, never hidden.
  let panelError = '';
  const panel = (() => {
    try {
      const input = treeInputOf({ ...s, state: { goals: {} }, askCounts: {} } as unknown as Session, 0.5);
      return input ? resolveTree(input) : null;
    } catch (e) {
      panelError = String(e instanceof Error ? e.message : e).slice(0, 200);
      return null;
    }
  })();
  const shotOf = (t: typeof tree, id: string) =>
    t?.dream.sequences
      .flatMap((q) => q.scenes)
      .flatMap((sc) => sc.shots)
      .find((sh) => sh.cuts.some((c) => c.id === id));

  const viewCuts: ViewCut[] = cuts.map((p) => {
    const plan = p.item.frame?.plan;
    const order = p.item.frame?.order ?? plan?.order ?? 0;
    const m = moment.get(p.id);
    const sheet = p.sheet;
    const planShot = plan?.shot ?? '';
    const planScene = plan?.scene ?? '';
    const sorted = (xs: string[]) => [...xs].sort().join(', ');
    const planMates = sorted(cuts.filter((c) => c.item.frame?.plan?.shot === planShot).map((c) => c.id));
    const panelShot = shotOf(panel, p.id);
    const panelMates = sorted(panelShot?.cuts.map((c) => c.id) ?? []);
    const treeDiffers = !panel
      ? `the panel's tree could not be made${panelError ? `: ${panelError}` : ''}`
      : !panelShot
        ? "the panel's tree has no place for it"
        : panelMates === planMates
          ? null
          : `the panel's tree puts it in a shot with ${panelMates}; the plan, with ${planMates}`;
    const i = byOrder.indexOf(p);
    const before = byOrder
      .slice(0, i)
      .reverse()
      .find((c) => c.item.frame?.plan?.scene === planScene);
    const eye = plan?.eye;
    const floorPlan: Blocking | undefined = eye ? shotPlan(b, p.id, r.rec) : undefined;
    const refs = refsOf(p);
    let mockUp: ViewCut['mockUp'] = null;
    if (eye) {
      const rendered = previsFor(b, p.item, calledFor(s, p.item), r.rec);
      if (rendered) {
        const name = `previs-${rendered.key}.png`;
        if (o.mockUps) files[name] = rendered.png;
        mockUp = { name, sha256: rendered.key, sent: refs.some((x) => x.source === 'mockup') };
      }
    }
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
            x: round(eye.at.x, 0.01),
            y: round(eye.at.y, 0.01),
            height: round(eye.height, 0.01),
            dir: round((Math.atan2(eye.d.y, eye.d.x) * 180) / Math.PI, 0.1),
            fov: round(2 * halfViewOf(eye), 0.1),
            lens: eye.lens ?? null,
          }
        : null,
    };
    const night = saved.find((f) => f.id === p.id && f.kind === 'cut');
    const sent = (night as { sent?: { prompt: string; images: string[] } } | undefined)?.sent;
    const called = calledFor(s, p.item);
    return {
      id: p.id,
      order,
      sequence: tree?.index[p.id]?.sequence ?? '',
      scene: planScene,
      shot: planShot,
      treeDiffers,
      prevCut: before?.id ?? null,
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
            room: floorPlan.room ? { w: floorPlan.room[0], d: floorPlan.room[1] } : null,
            front: { words: floorPlan.front, dir: DIRECTIONS.front },
            indoors: floorPlan.indoors ?? null,
            spots: floorPlan.spots.map((x) => ({
              id: x.id,
              name: called(x.id),
              x: x.x,
              y: x.y,
              ...(x.size ? { w: x.size[0], d: x.size[1] } : {}),
              ...(x.kind ? { kind: x.kind } : {}),
              ...(x.many ? { many: true } : {}),
              facing: facing(x, floorPlan),
            })),
          }
        : null,
      mockUp,
      links: (plan?.refs ?? []).map((x) => ({ from: x.id, kind: x.kind, relation: x.relation ?? null, role: x.role })),
      refs,
      // Why each earlier picture the plan chose is not sent (continuity.ts unsentWhy): the plan's own reasons.
      unsent: (plan?.unsent ?? []).map((x) => ({
        // Named as the images sent are named (picture:m3, ghost:t1:lid), so the page matches them by one name.
        key: imageName(r, standIn.picture(x.id)),
        code: plan?.unsentWhy?.[x.id]?.code ?? 'not_recorded',
        detail: plan?.unsentWhy?.[x.id]?.detail ?? 'left out with no reason recorded',
      })),
      facts,
      // As the drawing gate reads the plan's issues before a picture is drawn (session.ts gateFindings), from the plan
      // this rebuild made.
      issues: r.plan.issues.filter((x) => x.startsWith(`picture ${order} `) || x.startsWith(`picture ${order}:`)),
      prompt: p.prompt,
      paragraphs: (p.assembled?.lines ?? []).filter((l) => l.text).map((l) => ({ id: l.id, text: l.text })),
      drawn: isDrawn(night)
        ? {
            file: fileOf(night!),
            sentImages: sent?.images ?? null,
            samePrompt: sent ? sent.prompt === p.prompt : null,
          }
        : null,
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
    const refs = p ? refsOf(p) : [];
    const night = matchGhost(g, savedGhosts, (f) => f.ghost);
    return {
      id: g.id,
      kind: g.kind,
      of: g.of,
      change: g.change,
      from: { subject: g.of, editedFrom: refs.find((x) => x.role === 'base')?.key ?? null, after: g.after ?? null },
      usedBy: g.usedBy,
      depth: depthOf(g.id),
      why: g.why,
      refs,
      prompt: p?.prompt ?? '',
      file: night && isDrawn(night) ? fileOf(night) : null,
      hashes: hashes(
        refs.map((x) => [x.key, x.role]),
        p?.prompt ?? '',
        g.state ?? null,
      ),
    };
  });

  const firstSheet = cuts.find((p) => p.sheet)?.sheet;
  const sheets: ViewSheet[] = r.sheets
    .filter((sk) => !sk.extras)
    .map((sk) => {
      const e = cuts.flatMap((p) => p.sheet?.inView ?? []).find((x) => x.id === sk.id);
      const key = `sketch:${sk.id}`;
      const prompt = sheetPrompt(sk, style);
      const own = item(sk.id);
      const usedBy = [
        ...viewCuts.filter((c) => c.refs.some((x) => x.key === key)).map((c) => c.id),
        ...ghosts.filter((x) => x.refs.some((y) => y.key === key)).map((x) => x.id),
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
      // The take its sketch was drawn from, as the checks kept it before drawing: its prompt as a hash.
      // Only a sketch with a picture: a take started and failed has no picture behind it.
      const take = isDrawn(own)
        ? [...(own?.checkedTakes ?? [])].reverse().find((t) => t.version <= (own?.version ?? 0))
        : undefined;
      return {
        id: sk.id,
        name: sk.isDreamer ? 'the dreamer' : sk.name,
        kind,
        key,
        look: e?.look ?? '',
        prompt,
        file: own && isDrawn(own) ? fileOf(own) : null,
        drawn: isDrawn(own),
        drawnFrom: take ? { same: take.prompt === promptSha(prompt), take: take.version } : null,
        usedBy,
        hashes: hashes([key], prompt, e?.look ?? ''),
      };
    });

  // The plan's scenes and shots, grouped by the tree's sequences: the plan's labels are the ones the prompts use.
  const seqs = new Map<string, ViewSequence>();
  for (const c of [...viewCuts].sort((x, y) => x.order - y.order)) {
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
      sh = { id: c.shot, tags: shotOf(tree, c.id)?.tags ?? [], cuts: [] };
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
        ? transcript.map((t, n) => ({
            turn: n,
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
