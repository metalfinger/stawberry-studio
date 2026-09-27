// The references each moment is drawn from, over whole dreams: the eval of step S5 (references and
// variants, HARNESS_PLAN.md) on its code alone, before any picture is paid for. Every dream is rebuilt
// exactly as plan.ts rebuilds it (plan.ts `rebuild`, under the environment's switches), and each
// moment's images are read for what the owner's rules say of them:
// - one image per subject: nobody and nothing is shown to the image model by two images (rules.md D1);
// - that image is its stage in force: the in-between picture of its latest change, where one is
//   drawn, else its sketch (the tree's ledger; cut-sheet-map.md);
// - no earlier picture from another side of the place is edited or taken for its layout (rules.md
//   A2, C7): on the other side by the plan's words, or turned round (135 degrees) by the cameras;
// - the plan waits only for what it sends: a picture in a moment's `needs` that is never attached
//   holds the moment back for nothing (found by S4 across a reverse; today also every picture kept
//   for its light alone);
// - no image for its light alone (rules.md D2);
// - image 1 by the moment's tags: how often the mock-up, an edit or the sketches alone is image 1, by
//   the cut sheet's role and move, and the mock-ups outside the routing the paired test suggests (a
//   hypothesis, n=20: the mock-up right 8 of 10 from outside, 2 of 10 through the dreamer's eyes, a
//   close-up, a jump or another place);
// - an in-between picture only where an edit would carry several changes (the owner's rule, rules.md
//   D3): each in-between picture of the plan, with the most changes any moment it serves would carry
//   without it, against the plan's own bar (the action and two more).
//
//   bun run evals/references.ts --label before
//   DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=on bun run evals/references.ts --label on [--against before] [--live] [--show]
//
// Tags come from the cut sheet; with DREAMCHAT_CUT_SHEET unset the sheet is built in shadow, which
// sends what framePrompt writes, so nothing else changes. Writes runs/references/<label>.json with the
// hash of every dream it read. Nothing is drawn and no model is called (with DREAMCHAT_RECORD=on, the
// implied readings come from evals/implied-cache.ts, as the other evals read them; --no-imply reads none).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rebuilt } from '../plan';
import {
  contextOf,
  firstImageOf,
  fromOtherSide,
  ghostNeeds,
  isStage,
  type RefInfo,
  SEVERAL,
  stageImageOf,
  storyChanges,
  waitedNotSent,
} from './prompt-cases';
import { SEVERAL as OWNERS_BAR } from '../refs';
import { commitOf, DIR, type Inputs, inputsDiffer } from './saved';

/** What the references of one moment show. */
export type MomentRefs = {
  id: string;
  images: number;
  first: 'mockup' | 'edit' | 'free';
  /** The cut sheet's role and move, where the sheet was built. */
  role?: string;
  move?: string;
  unstaged?: string | null;
  /** The moment is about a crowd with no image of its own: a group it lists as its own, with no sketch. */
  faceless?: boolean;
  /** It establishes the place (the sheet's tag). */
  establishing?: boolean;
  /** Nothing but the place is in view. */
  placeOnly?: boolean;
  /** How many changes its picture carries at once, counted apart from the plan (the action included). */
  changes: number;
  /** What each change besides the action is: a reframing, a side never drawn, a change shown in no image. */
  changeKinds: string[];
  /** Each subject shown by more than one image: its images' sources, in order. */
  twice: { who: string; images: string[] }[];
  /** Each subject whose image is not its stage in force: what it got, what it should be. */
  notStage: { who: string; got: string[]; stage: string }[];
  /** Earlier pictures from another side, edited or taken for their layout. */
  otherSide: { of: string; role: string; relation?: string; turned: number | null }[];
  /** What the plan waits for and never sends. */
  waited: { id: string; why: string }[];
  /** Earlier pictures attached for their light alone. */
  lightOnly: string[];
};

/** Kept at the owner's bar (two, 27 Sep); `atThree` at the plan's own. */
export type GhostNeed = ReturnType<typeof ghostNeeds>[number] & { atThree: boolean };

export type DreamRefs = { title?: string; error?: string; hash?: string; moments: MomentRefs[]; ghosts: GhostNeed[] };

const said = (x: RefInfo) => `${x.source}${x.of ? ` ${x.of}` : ''}`;

/** The references of every moment of a rebuilt dream, and the need for each in-between picture. */
export function referencesOf(r: Rebuilt): Omit<DreamRefs, 'hash'> {
  const out: MomentRefs[] = [];
  for (const p of r.pictures) {
    if (p.kind !== 'cut') continue;
    const c = contextOf(r, p.id);
    const subjects = [
      ...new Set(c.refs.filter((x) => x.source !== 'mockup' && x.role !== 'base').flatMap((x) => x.subjects)),
    ];
    const of = (who: string) =>
      c.refs.filter((x) => x.subjects.includes(who) && x.source !== 'mockup' && x.role !== 'base');
    const twice = subjects.flatMap((who) => {
      const got = of(who);
      return got.length > 1 ? [{ who, images: got.map(said) }] : [];
    });
    const notStage = subjects.flatMap((who) => {
      const want = stageImageOf(c, who);
      const got = of(who);
      const ok = got.length === 1 && isStage(got[0], want);
      return ok
        ? []
        : [
            {
              who,
              got: got.map(said),
              stage: want.several
                ? `several: ${want.several.join(', ')}`
                : `${want.source}${want.of ? ` ${want.of}` : ''}`,
            },
          ];
    });
    const lightOnly = c.refs
      .filter((x) => {
        if (x.source !== 'picture' || x.subjects.length) return false;
        return c.cut.refs.find((u) => u.kind === 'cut' && u.id === x.of)?.role === 'lighting';
      })
      .map(said);
    const tags = p.sheet?.tags;
    // Counted apart from the plan's own count (prompt-cases.ts storyChanges).
    const changes = storyChanges(c);
    out.push({
      id: p.id,
      images: c.refs.length,
      first: firstImageOf(c.refs),
      changes: changes.length,
      changeKinds: changes
        .slice(1)
        .map((x) =>
          x.startsWith('reframed')
            ? 'reframed'
            : x.endsWith('never shown')
              ? 'a side never drawn'
              : x.endsWith('(implied)')
                ? 'implied, said in words'
                : 'shown in no image',
        ),
      ...(tags ? { role: tags.role, move: tags.move, unstaged: tags.unstaged, establishing: tags.establishing } : {}),
      ...(p.sheet?.inView.some(
        (e) => e.kind === 'character' && e.group && !e.image && e.turned === null && p.sheet!.visible.includes(e.id),
      )
        ? { faceless: true }
        : {}),
      ...(p.sheet && p.sheet.inView.every((e) => e.kind === 'location') ? { placeOnly: true } : {}),
      twice,
      notStage,
      otherSide: fromOtherSide(c).map(({ of, role, relation, turned }) => ({
        of,
        role,
        ...(relation ? { relation } : {}),
        turned,
      })),
      waited: waitedNotSent(c),
      lightOnly,
    });
  }
  const ghosts = ghostNeeds(r, OWNERS_BAR).map((g) => ({ ...g, atThree: g.most >= SEVERAL }));
  return { title: r.title, moments: out, ghosts };
}

/**
 * Where the verdicts put the mock-up as image 1 (a hypothesis: the paired test, n=20, beside the story
 * pictures): not across a jump (lighthouse-first m8); through the dreamer's eyes only with nothing but the
 * place in view (orchard m7; with someone or something in view the sketches alone were right: orchard m2,
 * snow-train m6); not a close-up or an insert, nor the seat; to another place only for a wide shot (the
 * story pictures' wide shots, 8 of 11); not for a moment about a crowd with no image of its own (heron m4,
 * the bare figures) unless it is a wide shot establishing the place (night-market m1).
 */
export function mockupRoute(m: Pick<MomentRefs, 'role' | 'move' | 'faceless' | 'establishing' | 'placeOnly'>): boolean {
  if (!m.role || m.move === 'jump') return false;
  if (m.role === 'pov') return !!m.placeOnly;
  if (m.role === 'close_up' || m.role === 'insert' || m.move === 'seat') return false;
  if (m.move === 'other_place' && m.role !== 'wide') return false;
  return !m.faceless || (m.role === 'wide' && !!m.establishing);
}

export type Totals = {
  dreams: number;
  moments: number;
  images: { mean: number; max: number; overTwelve: number };
  /** Moments with a subject shown by two images or more, and the subjects so shown. */
  twice: { moments: number; subjects: number; bySources: Record<string, number> };
  /** Subjects whose image is not their stage in force, by what they got. */
  notStage: { moments: number; subjects: number; byGot: Record<string, number> };
  otherSide: { moments: number; byRole: Record<string, number> };
  waited: { moments: number; pictures: number; byWhy: Record<string, number> };
  lightOnly: number;
  /** Image 1 by the sheet's role: mock-up, edit, free. */
  first: Record<string, Record<'mockup' | 'edit' | 'free', number>>;
  /**
   * Mock-ups as image 1 where the paired routing says not, and moments drawn from the sketches alone
   * where it says one (an edit of the same setup is neither).
   */
  mockupOffRoute: number;
  freeOnRoute: number;
  ghosts: { all: number; state: number; view: number; kept: number; keptAtThree: number; notKept: string[] };
  /** Moments whose picture still carries several changes at once (the plan's bar): fewer in-between pictures must not raise it. */
  crowded: number;
  /** Moments carrying the owner's bar or more at once, by what the changes besides the action are. */
  atBar: { moments: number; byKind: Record<string, number> };
};

export function totalsOf(dreams: Record<string, DreamRefs>): Totals {
  const ms = Object.values(dreams).flatMap((d) => d.moments.map((m) => ({ d, m })));
  const count = (xs: string[]) => {
    const out: Record<string, number> = {};
    for (const x of xs) out[x] = (out[x] ?? 0) + 1;
    return out;
  };
  const first: Totals['first'] = {};
  for (const { m } of ms) {
    const k = m.role ?? 'no sheet';
    first[k] ??= { mockup: 0, edit: 0, free: 0 };
    first[k][m.first]++;
  }
  const gs = Object.entries(dreams).flatMap(([id, d]) => d.ghosts.map((g) => ({ id, g })));
  return {
    dreams: Object.keys(dreams).length,
    moments: ms.length,
    images: {
      mean: ms.length ? Math.round((10 * ms.reduce((a, { m }) => a + m.images, 0)) / ms.length) / 10 : 0,
      max: Math.max(0, ...ms.map(({ m }) => m.images)),
      overTwelve: ms.filter(({ m }) => m.images > 12).length,
    },
    twice: {
      moments: ms.filter(({ m }) => m.twice.length).length,
      subjects: ms.reduce((a, { m }) => a + m.twice.length, 0),
      bySources: count(
        ms.flatMap(({ m }) =>
          m.twice.map((t) =>
            t.images
              .map((x) => x.split(' ')[0])
              .sort()
              .join('+'),
          ),
        ),
      ),
    },
    notStage: {
      moments: ms.filter(({ m }) => m.notStage.length).length,
      subjects: ms.reduce((a, { m }) => a + m.notStage.length, 0),
      byGot: count(
        ms.flatMap(({ m }) =>
          m.notStage.map(
            (t) =>
              `${
                t.got
                  .map((x) => x.split(' ')[0])
                  .sort()
                  .join('+') || 'none'
              } for ${t.stage.split(' ')[0]}`,
          ),
        ),
      ),
    },
    otherSide: {
      moments: ms.filter(({ m }) => m.otherSide.length).length,
      byRole: count(ms.flatMap(({ m }) => m.otherSide.map((x) => x.role))),
    },
    waited: {
      moments: ms.filter(({ m }) => m.waited.length).length,
      pictures: ms.reduce((a, { m }) => a + m.waited.length, 0),
      byWhy: count(ms.flatMap(({ m }) => m.waited.map((x) => x.why.replace(/ \(.*$/, '')))),
    },
    lightOnly: ms.reduce((a, { m }) => a + m.lightOnly.length, 0),
    first,
    mockupOffRoute: ms.filter(({ m }) => m.role && m.first === 'mockup' && !mockupRoute(m)).length,
    freeOnRoute: ms.filter(({ m }) => m.role && m.first === 'free' && mockupRoute(m)).length,
    ghosts: {
      all: gs.length,
      state: gs.filter(({ g }) => g.kind === 'state').length,
      view: gs.filter(({ g }) => g.kind === 'view').length,
      kept: gs.filter(({ g }) => g.kept).length,
      keptAtThree: gs.filter(({ g }) => g.atThree).length,
      notKept: gs
        .filter(({ g }) => !g.kept)
        .map(({ id, g }) => `${id.slice(-4)} ${g.id} ${g.label} (${g.most} at ${g.by ?? '-'})`),
    },
    crowded: ms.filter(({ m }) => m.changes >= SEVERAL).length,
    atBar: {
      moments: ms.filter(({ m }) => m.changes >= OWNERS_BAR).length,
      byKind: count(ms.flatMap(({ m }) => (m.changes >= OWNERS_BAR ? m.changeKinds : []))),
    },
  };
}

/** The totals as lines. */
export function totalsLines(t: Totals): string[] {
  const kv = (o: Record<string, number>) =>
    Object.entries(o)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none';
  return [
    `${t.dreams} dreams, ${t.moments} moments; images a moment: mean ${t.images.mean}, most ${t.images.max}, over 12: ${t.images.overTwelve}`,
    `one image per subject: ${t.twice.moments} moments show ${t.twice.subjects} subjects by two images or more (${kv(t.twice.bySources)})`,
    `the stage in force: ${t.notStage.moments} moments, ${t.notStage.subjects} subjects not shown by the image of their stage (${kv(t.notStage.byGot)})`,
    `from another side, edited or for layout: ${t.otherSide.moments} moments (${kv(t.otherSide.byRole)})`,
    `waits for what it never sends: ${t.waited.moments} moments, ${t.waited.pictures} pictures (${kv(t.waited.byWhy)})`,
    `images for their light alone: ${t.lightOnly}`,
    `image 1 by role (mock-up/edit/free): ${Object.entries(t.first)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k} ${v.mockup}/${v.edit}/${v.free}`)
      .join(', ')}`,
    `the mock-up off the paired routing (hypothesis): ${t.mockupOffRoute} moments; on it, drawn from the sketches alone: ${t.freeOnRoute}`,
    `in-between pictures: ${t.ghosts.all} (${t.ghosts.state} of a change, ${t.ghosts.view} of a side); kept by the owner's rule at ${OWNERS_BAR} changes (the owner's bar): ${t.ghosts.kept}, at ${SEVERAL}: ${t.ghosts.keptAtThree}`,
    `moments whose picture still carries ${SEVERAL} changes or more at once: ${t.crowded}`,
    `moments carrying ${OWNERS_BAR} changes or more at once (the action and ${kv(t.atBar.byKind)}): ${t.atBar.moments}`,
  ];
}

export type RefsRun = {
  label: string;
  at: string;
  commit: string | null;
  switches: Record<string, string>;
  inputs: Inputs;
  totals: Totals;
  dreams: Record<string, DreamRefs>;
};

export const RUNS = join(DIR, 'runs', 'references');

if (import.meta.main) {
  // Tags are the cut sheet's: in shadow the prompts sent are framePrompt's, the same as off.
  if (!process.env.DREAMCHAT_CUT_SHEET) process.env.DREAMCHAT_CUT_SHEET = 'shadow';
  const { dataDir, frozenDreams, liveDreams, loadDream, readLive, switches } = await import('./saved');
  const { rebuild } = await import('../plan');
  const { recordMode } = await import('../record');
  const { costLine, withImplied } = await import('./implied-cache');
  const { jevWithModel } = await import('../jev');
  const { JEV_MODEL } = await import('./prompt-cases');
  const args = process.argv.slice(2);
  const valueOf = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const label = valueOf('--label') ?? 'latest';
  const against = valueOf('--against');
  const live = args.includes('--live');
  const show = args.includes('--show');
  const imply = recordMode() === 'on' && !args.includes('--no-imply');
  const dreams = live ? liveDreams(dataDir()).map(readLive) : frozenDreams().map((id) => loadDream(id, false));
  const run: RefsRun = {
    label,
    at: new Date().toISOString(),
    commit: commitOf(),
    switches: switches(),
    inputs: { from: live ? 'live' : 'frozen', dreams: Object.fromEntries(dreams.map((d) => [d.id, d.hash])) },
    totals: undefined as unknown as Totals,
    dreams: {},
  };
  const costs: Awaited<ReturnType<typeof withImplied>>[] = [];
  const { oneBuilder } = await import('../cleanups');
  const { withTyped } = await import('./typed-cache');
  for (const d of dreams) {
    if (!d.session.draft?.breakdown || !d.session.style) continue;
    try {
      let session = d.session;
      if (imply) {
        const read = await withImplied(session, { jev: jevWithModel(JEV_MODEL()), jevModel: JEV_MODEL() });
        costs.push(read);
        session = read.session;
      }
      // With S6's one prompt builder on, each moment's typed reading, from its cache only.
      if (oneBuilder()) session = (await withTyped(session)).session;
      run.dreams[d.id] = { ...referencesOf(rebuild(session, { asDrawn: false })), hash: d.hash };
    } catch (e) {
      run.dreams[d.id] = {
        error: String(e instanceof Error ? e.message : e).slice(0, 300),
        hash: d.hash,
        moments: [],
        ghosts: [],
      };
    }
  }
  run.totals = totalsOf(run.dreams);
  console.log(`${label}: dreams read ${run.inputs.from}, switches ${JSON.stringify(run.switches)}`);
  for (const l of totalsLines(run.totals)) console.log(`  ${l}`);
  for (const [id, d] of Object.entries(run.dreams))
    if (d.error) console.log(`  ${id} could not be rebuilt: ${d.error}`);
  if (show)
    for (const [id, d] of Object.entries(run.dreams))
      for (const m of d.moments) {
        const lines = [
          ...m.twice.map((t) => `${t.who} by ${t.images.join(', ')}`),
          ...m.notStage.map((t) => `${t.who}: ${t.got.join(', ') || 'no image'}, its stage ${t.stage}`),
          ...m.otherSide.map(
            (x) => `picture ${x.of} as ${x.role} from another side (${x.relation ?? '-'}, ${x.turned ?? '-'}°)`,
          ),
          ...m.waited.map((x) => `waits for ${x.id}: ${x.why}`),
          ...m.lightOnly.map((x) => `${x} for its light alone`),
          ...(m.role && m.first === 'mockup' && !mockupRoute(m)
            ? [`mock-up as image 1 off the routing (${m.role}/${m.move})`]
            : []),
        ];
        if (lines.length)
          console.log(`  ${id} ${m.id} [${m.role ?? '-'}/${m.move ?? '-'}, image 1 ${m.first}]: ${lines.join('; ')}`);
      }
  if (show) for (const g of run.totals.ghosts.notKept) console.log(`  in-between picture under the bar: ${g}`);
  if (costs.length) console.log(`  ${costLine(costs)}`);
  mkdirSync(RUNS, { recursive: true });
  const file = join(RUNS, `${label}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 1)}\n`);
  console.log(`written ${file}`);
  if (against) {
    const before = JSON.parse(readFileSync(join(RUNS, `${against}.json`), 'utf8')) as RefsRun;
    for (const w of inputsDiffer(before.inputs, run.inputs)) console.log(`warning: ${w}`);
    console.log(`against ${against} (${before.commit}, ${JSON.stringify(before.switches)}):`);
    const was = totalsLines(before.totals);
    totalsLines(run.totals).forEach((l, i) => {
      if (l !== was[i]) console.log(`  was: ${was[i]}\n  now: ${l}`);
    });
  }
}
