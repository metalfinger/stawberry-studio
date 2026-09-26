// What the checks before a picture did to each dream, counted from the dream as saved and its own
// Jev log: S2's eval (HARNESS_PLAN.md). Per dream: moments drawn and left undrawn (and why), what a
// check made the harness do (hold, reword, set a brief aside, leave undrawn, draw although held,
// plan again), whether every moment's readings are logged (the gate's, and "storyboard complete?"'s),
// and Jev's calls, in all and where they were made. Nothing is called.
//
// A dream drawn before the checks logged what they did (session.ts `acted`, 27 Sep) is counted from
// what it kept instead: a moment held, left undrawn for its checks, drawn although held, or with words
// reworded (which then also counts a rewording into the third person, done by code).
//
//   bun run evals/checks-log.ts [--json out.json] [--list] <folder or saved .json> …
//
// A folder is a replay's or a redraw's (<folder>/<name>/state/<id>.json); a saved conversation's
// log is at <its folder>/<id>/jev.jsonl.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { type JevEntry, readJevLog, type TransitionEntry } from '../jevlog';
import type { Session } from '../session';
import { nameOf, type Redrawn } from './redraw';

export type DreamCount = {
  dream: string;
  file: string;
  /** The log says what each check did (session.ts `acted`), or it is counted from what the dream kept. */
  logged: boolean;
  moments: number;
  /** Moments with a camera worked out on a floor plan: those "storyboard complete?" reads. */
  withCamera: number;
  drawn: number;
  undrawn: { id: string; why: string }[];
  /** Moments left undrawn, or still held, because of a check. */
  undrawnByCheck: number;
  /** What a check made the harness do, by what, to moments, sketches and in-between pictures. */
  acted: Record<'moment' | 'sketch' | 'ghost', Record<string, number>>;
  /** Scenes planned again before drawing because "storyboard complete?" held a moment, and moments planned again while drawing. */
  replanned: { scenes: number; moments: number };
  /** The moments' words reworded because of a check: moment, and what the check found. */
  rewordings: { id: string; reason: string }[];
  /** Moments whose gate reading, and whose "storyboard complete?" reading, is in the log. */
  gateLogged: number;
  storyboardLogged: number;
  /** Readings that would have held or reworded, only logged (DREAMCHAT_CHECKS=log). */
  onlyLogged: number;
  jev: { calls: number; bySite: Record<string, number> };
  /**
   * A redraw's model steps asked for (evals/redraw.ts), none of which could be reached: planning
   * again (block) and rewording a moment or a sketch's look are what the checks asked for.
   */
  asked?: Record<string, number>;
};

/** Every saved dream under the paths given. */
export function dreamsUnder(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (p.endsWith('.json')) {
      out.push(p);
      continue;
    }
    for (const name of readdirSync(p).sort()) {
      const st = join(p, name, 'state');
      if (!existsSync(st) || !statSync(st).isDirectory()) continue;
      for (const f of readdirSync(st).filter((x) => /^dream-.*\.json$/.test(x))) out.push(join(st, f));
    }
  }
  return out;
}

/** One dream's count. */
export function countDream(file: string, s: Session, log: JevEntry[]): DreamCount {
  const frames = s.build?.frames ?? [];
  const items = s.build?.items ?? [];
  const cuts = frames.filter((f) => f.kind === 'cut');
  const kindOf = (id: string | undefined): 'moment' | 'sketch' | 'ghost' | null => {
    const f = frames.find((x) => x.id === id);
    if (f) return f.kind === 'ghost' ? 'ghost' : 'moment';
    return items.some((x) => x.id === id) ? 'sketch' : null;
  };
  const transitions = log.filter((e): e is TransitionEntry => e.kind === 'transition');
  const checks = transitions.filter((e) => e.stage === 'check');
  const logged = transitions.some((e) => e.stage === 'gate');
  const acted: DreamCount['acted'] = { moment: {}, sketch: {}, ghost: {} };
  const add = (kind: 'moment' | 'sketch' | 'ghost' | null, what: string) => {
    if (kind) acted[kind][what] = (acted[kind][what] ?? 0) + 1;
  };
  const rewordings: DreamCount['rewordings'] = [];
  if (logged)
    for (const e of checks) {
      add(kindOf(e.moment), e.decision);
      if (e.decision === 'reworded' && kindOf(e.moment) === 'moment')
        rewordings.push({ id: e.moment ?? '', reason: e.reason });
    }
  else {
    // Counted from what the dream kept.
    for (const f of [...frames, ...items]) {
      const kind = kindOf(f.id);
      if (f.status === 'waiting' && f.held?.length) add(kind, 'held');
      if (
        f.status === 'failed' &&
        /^not drawn: (planned again|still unsure|unsure of its instructions)/.test(f.error ?? '')
      )
        add(kind, 'left undrawn');
      if (f.overrode?.length && f.status !== 'failed') add(kind, 'drawn although held');
      if (f.reworded?.length && kind === 'moment') {
        add(kind, 'reworded');
        rewordings.push({ id: f.id, reason: `words reworded: ${f.reworded.join(', ')}` });
      }
    }
  }
  const replans = transitions.filter((e) => e.decision === 'replanned' || e.decision === 'kept');
  const undrawn = cuts
    .filter((f) => !(f.status === 'ready' && f.mediaId))
    .map((f) => ({
      id: f.id,
      why:
        f.status === 'waiting' && f.held?.length
          ? `held: ${f.held.join('; ').slice(0, 160)}`
          : `${f.status}${f.error ? `: ${f.error.slice(0, 160)}` : ''}`,
    }));
  const byCheck = cuts.filter(
    (f) =>
      (f.status === 'waiting' && !!f.held?.length) ||
      (f.status === 'failed' && /^not drawn: /.test(f.error ?? '') && !/limit/.test(f.error ?? '')),
  ).length;
  const ids = new Set(cuts.map((f) => f.id));
  const readOf = (stage: string) =>
    new Set(transitions.filter((e) => e.stage === stage && ids.has(e.moment ?? '')).map((e) => e.moment));
  const calls = log.filter((e) => e.kind === 'call');
  const bySite: Record<string, number> = {};
  for (const c of calls) bySite[c.site] = (bySite[c.site] ?? 0) + 1;
  return {
    dream: nameOf(s),
    file,
    logged,
    moments: cuts.length,
    withCamera: cuts.filter((f) => f.frame?.plan?.view && f.frame.plan.eye).length,
    drawn: cuts.length - undrawn.length,
    undrawn,
    undrawnByCheck: byCheck,
    acted,
    replanned: {
      scenes: replans.filter((e) => /^planned again \d+ ways/.test(e.reason)).length,
      moments: replans.filter((e) => /^planned again while drawing/.test(e.reason)).length,
    },
    rewordings,
    gateLogged: readOf('gate').size,
    storyboardLogged: readOf('previs').size,
    onlyLogged: transitions.filter((e) => e.decision === 'logged').length,
    jev: { calls: calls.length, bySite },
  };
}

/** A dream's count, read from its saved file and its log. */
export function countFile(file: string): DreamCount {
  const s = JSON.parse(readFileSync(file, 'utf8')) as Session;
  const c = countDream(file, s, readJevLog(dirname(file), basename(file, '.json')));
  const redrawn = join(dirname(dirname(file)), 'redraw.json');
  if (existsSync(redrawn)) {
    const asked: Record<string, number> = {};
    for (const a of (JSON.parse(readFileSync(redrawn, 'utf8')) as Redrawn).asked)
      asked[a.step] = (asked[a.step] ?? 0) + 1;
    c.asked = asked;
  }
  return c;
}

const sum = (xs: Record<string, number>) => Object.values(xs).reduce((a, b) => a + b, 0);
/** What a check made the harness do to moments, all told: every action but drawing although held. */
export const actedOn = (c: DreamCount) =>
  sum(Object.fromEntries(Object.entries(c.acted.moment).filter(([k]) => k !== 'drawn although held')));

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--json');
  const json = at === -1 ? undefined : args[at + 1];
  const list = args.includes('--list');
  const paths = args.filter((a, i) => !a.startsWith('--') && (at === -1 || i !== at + 1));
  const counts = dreamsUnder(paths).map(countFile);
  const pad = (x: string | number, n: number) => String(x).padEnd(n);
  console.log(
    `${pad('dream', 16)} ${pad('drawn', 7)} ${pad('by check', 9)} ${pad('held', 5)} ${pad('reword', 7)} ${pad('brief', 6)} ${pad('undrawn', 8)} ${pad('although', 9)} ${pad('replan sc/m', 12)} ${pad('sketch', 7)} ${pad('ghost', 6)} ${pad('gate/sb logged', 18)} ${pad('only logged', 12)} ${pad('jev (gate, storyboard, plan)', 29)} asked (redraw)`,
  );
  const tot = {
    moments: 0,
    withCamera: 0,
    drawn: 0,
    byCheck: 0,
    acted: 0,
    scenes: 0,
    replanM: 0,
    jev: 0,
    checkSites: 0,
    gate: 0,
    sb: 0,
  };
  for (const c of counts) {
    const m = c.acted.moment;
    const site = (k: string) => c.jev.bySite[k] ?? 0;
    console.log(
      `${pad(c.dream, 16)} ${pad(`${c.drawn}/${c.moments}`, 7)} ${pad(c.undrawnByCheck, 9)} ${pad(m.held ?? 0, 5)} ${pad(m.reworded ?? 0, 7)} ${pad(m['brief set aside'] ?? 0, 6)} ${pad(m['left undrawn'] ?? 0, 8)} ${pad(m['drawn although held'] ?? 0, 9)} ${pad(`${c.replanned.scenes}/${c.replanned.moments}`, 12)} ${pad(sum(c.acted.sketch), 7)} ${pad(sum(c.acted.ghost), 6)} ${pad(`${c.gateLogged}/${c.moments}, ${c.storyboardLogged}/${c.withCamera}`, 18)} ${pad(c.onlyLogged, 12)} ${pad(`${c.jev.calls} (${site('gate')}, ${site('storyboard')}, ${site('plan')})`, 29)} ${
        c.asked
          ? Object.entries(c.asked)
              .map(([k, n]) => `${k} ${n}`)
              .join(', ') || 'none'
          : ''
      }${c.logged ? '' : '  [counted from the dream: no check log]'}`,
    );
    if (list) {
      for (const u of c.undrawn) console.log(`    undrawn ${u.id}: ${u.why}`);
      for (const r of c.rewordings) console.log(`    reworded ${r.id}: ${r.reason.slice(0, 200)}`);
      for (const k of ['sketch', 'ghost'] as const)
        for (const [what, n] of Object.entries(c.acted[k])) console.log(`    ${k} ${what}: ${n}`);
    }
    tot.moments += c.moments;
    tot.withCamera += c.withCamera;
    tot.drawn += c.drawn;
    tot.byCheck += c.undrawnByCheck;
    tot.acted += actedOn(c) + sum(c.acted.sketch) + sum(c.acted.ghost);
    tot.scenes += c.replanned.scenes;
    tot.replanM += c.replanned.moments;
    tot.jev += c.jev.calls;
    tot.checkSites += (c.jev.bySite.gate ?? 0) + (c.jev.bySite.storyboard ?? 0) + (c.jev.bySite.plan ?? 0);
    tot.gate += c.gateLogged;
    tot.sb += c.storyboardLogged;
  }
  console.log(
    `${counts.length} dreams: ${tot.drawn}/${tot.moments} moments drawn, ${tot.byCheck} undrawn or held by a check; ${tot.acted} actions by a check (moments, sketches, in-between pictures; drawn although held not counted); planned again ${tot.scenes} scenes before drawing and ${tot.replanM} moments while drawing; readings logged: gate ${tot.gate} of ${tot.moments} moments, storyboard ${tot.sb} of ${tot.withCamera} with a camera; Jev ${tot.jev} calls, ${(tot.jev / Math.max(1, counts.length)).toFixed(1)} a dream (gate + storyboard + plan ${tot.checkSites}, ${(tot.checkSites / Math.max(1, counts.length)).toFixed(1)} a dream)`,
  );
  if (json) writeFileSync(json, JSON.stringify(counts, null, 2));
}
