// S9's eval: the record of what was drawn, and staleness (HARNESS_PLAN.md, S9 eval). Nothing is drawn
// and no model is called.
//
// On dreams drawn with DREAMCHAT_AS_DRAWN=on (the redraws of evals/redraw.ts, whose redraw.json keeps
// what each picture was sent):
// - every picture drawn has a record for its take, and the record holds what was sent;
// - a rebuild gives each picture as sent, reading the records and not (the before);
// - with nothing changed since, no picture is stale; a picture drawn from a copy of itself already
//   behind the dream is listed apart;
// - changes made to copies of the dream, one at a time (a moment's words corrected, a sketch drawn again,
//   a sketch's look reworded, an earlier picture drawn again, the look changed, a lasting change told
//   otherwise): the pictures found stale against those each must make stale, worked out apart from the
//   staleness code from what each picture was sent (its images by name, and for a change told otherwise
//   the words it was sent); and a rebuild reading the records still gives every picture as sent.
//
// On saved dreams drawn before S9 (--saved), from what their Strawberry store kept: each image a picture
// was sent that is no longer the take its picture or sketch has now, the look its prompt names against
// the look chosen now, and down the chains pictures were drawn along.
//
//   DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=shadow bun run evals/as-drawn.ts <redraw folder> [--show]
//   bun run evals/as-drawn.ts --saved <state folder> --store <production.sqlite> [--show]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AsDrawn,
  currentRecord,
  drawnEnv,
  labelsOf,
  matchGhost,
  reasonLine,
  staleness,
  type StaleReport,
} from '../asdrawn';
import { ghostName } from '../cutsheet';
import { imagesOf, type Rebuilt, rebuild } from '../plan';
import { moments } from '../producer';
import { dreamNowOf, type Session, stalenessOf } from '../session';
import type { Item } from '../sheets';

type Sent = Record<string, { prompt: string; images: string[] }>;

/** A redrawn dream: its session as drawn, and what each picture was sent. */
export function redrawn(folder: string): { dream: string; session: Session; sent: Sent }[] {
  const out: ReturnType<typeof redrawn> = [];
  for (const name of readdirSync(folder).sort()) {
    const st = join(folder, name, 'state');
    const rd = join(folder, name, 'redraw.json');
    if (!existsSync(st) || !existsSync(rd)) continue;
    const f = readdirSync(st).find((x) => /^dream-.*\.json$/.test(x));
    if (!f) continue;
    out.push({
      dream: name,
      session: JSON.parse(readFileSync(join(st, f), 'utf8')) as Session,
      sent: (JSON.parse(readFileSync(rd, 'utf8')) as { sent: Sent }).sent,
    });
  }
  return out;
}

const drawnOf = (s: Session) =>
  (s.build?.frames ?? []).filter((f) => (f.kind === 'cut' || f.kind === 'ghost') && f.status === 'ready' && f.mediaId);

/** A rebuilt picture for a saved one: a moment by its id, an in-between picture by the change it shows. */
function rebuiltOf(r: Rebuilt, f: Item) {
  return f.kind === 'ghost' && f.ghost
    ? matchGhost(
        f.ghost,
        r.pictures.filter((p) => p.kind === 'ghost'),
        (p) => p.item.ghost,
      )
    : r.pictures.find((p) => p.id === f.id && p.kind === 'cut');
}

/** Which drawn pictures a rebuild gives as they were sent, prompt and images. */
export function asSent(s: Session, sent: Sent, asDrawn: boolean): { same: string[]; differ: Record<string, string> } {
  const r = rebuild(s, { asDrawn });
  const out = { same: [] as string[], differ: {} as Record<string, string> };
  for (const f of drawnOf(s)) {
    const was = sent[f.id];
    if (!was) continue;
    const p = rebuiltOf(r, f);
    if (!p) {
      out.differ[f.id] = 'not in the plan a rebuild makes';
      continue;
    }
    const images = imagesOf(r, p);
    if (p.prompt === was.prompt && JSON.stringify(images) === JSON.stringify(was.images)) {
      out.same.push(f.id);
      continue;
    }
    const a = was.prompt.split('\n');
    const z = p.prompt.split('\n');
    const i = a.findIndex((x, k) => x !== z[k]);
    out.differ[f.id] =
      p.prompt === was.prompt
        ? `images: ${was.images.join(', ')} / ${images.join(', ')}`
        : `sent "${(a[i] ?? '').slice(0, 160)}" / rebuilt "${(z[i] ?? '').slice(0, 160)}"`;
  }
  return out;
}

// ── made changes ─────────────────────────────────────────────────────────────

/** What a picture was sent, by name without the take: `sketch:p1`, `picture:m3`, `ghost:t1:lid`. */
const sentNames = (rec: AsDrawn) => rec.references.map((r) => r.name.replace(/ take \d+$/, ''));

/** A saved picture's own name, as another picture's images name it. */
const nameOfPicture = (f: Item) => (f.kind === 'ghost' && f.ghost ? ghostName(f.ghost) : `picture:${f.id}`);

/**
 * The pictures a change must make stale, worked out apart from the staleness code: those sent an image
 * of what changed (`direct`, by name) or, for words, the picture itself; then every picture sent an image
 * of one of them, and so on down.
 */
export function mustBeStale(s: Session, direct: Set<string>): Set<string> {
  const drawn = drawnOf(s);
  const out = new Set(direct);
  for (let more = true; more;) {
    more = false;
    for (const f of drawn) {
      if (out.has(f.id)) continue;
      const rec = currentRecord(f);
      if (!rec) continue;
      const names = sentNames(rec);
      const from = drawn.filter((g) => out.has(g.id) && names.includes(nameOfPicture(g)));
      if (from.length) {
        out.add(f.id);
        more = true;
      }
    }
  }
  return out;
}

/** The pictures sent an image named so. */
const sentImage = (s: Session, name: string) =>
  new Set(
    drawnOf(s)
      .filter((f) => {
        const rec = currentRecord(f);
        return !!rec && sentNames(rec).includes(name);
      })
      .map((f) => f.id),
  );

export type MadeChange = {
  change: string;
  /** What was changed, in words. */
  what: string;
  /** The reason the pictures it touches directly must give (an in-between picture's own change: `change`). */
  kind: string;
  direct: Set<string>;
  apply: (s: Session) => void;
};

/** The changes made to a copy of a drawn dream, each alone, and what each must make stale. */
export function changesFor(s: Session): MadeChange[] {
  const out: MadeChange[] = [];
  const drawn = drawnOf(s);
  const items = s.build?.items ?? [];
  // The first moment another picture was drawn from.
  const source = drawn.find((f) => f.kind === 'cut' && sentImage(s, `picture:${f.id}`).size);
  if (source)
    out.push({
      change: 'words',
      what: `${source.id}'s words corrected`,
      kind: 'words',
      direct: new Set([source.id]),
      apply: (x) => {
        const f = x.build!.frames!.find((y) => y.id === source.id)!;
        f.fields = {
          ...f.fields,
          action: { value: `${f.fields.action?.value ?? ''}, as they now remember it`, said: true },
        };
      },
    });
  // A sketch drawn again: the dreamer's, else the first sketch any picture was sent.
  const sketch =
    items.find((i) => i.isDreamer && sentImage(s, `sketch:${i.id}`).size) ??
    items.find((i) => sentImage(s, `sketch:${i.id}`).size);
  if (sketch)
    out.push({
      change: 'sketch drawn again',
      what: `${sketch.id}'s sketch drawn again`,
      kind: 'sketch',
      direct: sentImage(s, `sketch:${sketch.id}`),
      apply: (x) => {
        const i = x.build!.items.find((y) => y.id === sketch.id)!;
        i.version += 1;
        i.mediaId = `${i.mediaId}-again`;
      },
    });
  // A sketch's look reworded, words only: another sketch than the one drawn again, where there is one.
  const worded =
    items.find((i) => i !== sketch && i.kind === 'character' && sentImage(s, `sketch:${i.id}`).size) ?? sketch;
  const field = worded
    ? ({ character: 'appearance', location: 'geography', prop: 'appearance' } as const)[worded.kind as 'character']
    : undefined;
  if (worded && field)
    out.push({
      change: 'look reworded',
      what: `${worded.id}'s ${field} reworded`,
      kind: 'sketch',
      direct: sentImage(s, `sketch:${worded.id}`),
      apply: (x) => {
        const i = x.build!.items.find((y) => y.id === worded.id)!;
        const d = i.fields[field] ?? { value: '', said: false };
        i.fields = { ...i.fields, [field]: { ...d, value: `${d.value ?? ''}, with a long grey scarf` } };
      },
    });
  // An earlier picture drawn again: a new take, drawn from what it was drawn from before.
  if (source)
    out.push({
      change: 'earlier picture drawn again',
      what: `${source.id} drawn again (a new take)`,
      kind: 'earlier',
      direct: sentImage(s, `picture:${source.id}`),
      apply: (x) => {
        const f = x.build!.frames!.find((y) => y.id === source.id)!;
        const rec = currentRecord(f)!;
        f.version += 1;
        f.mediaId = `${f.mediaId}-again`;
        f.asDrawn = [...(f.asDrawn ?? []), { ...structuredClone(rec), take: f.version }];
      },
    });
  // The look changed.
  if (s.style)
    out.push({
      change: 'look changed',
      what: `the look changed from "${s.style.name}"`,
      kind: 'look',
      direct: new Set(drawn.map((f) => f.id)),
      apply: (x) => {
        x.style = { ...x.style!, name: `${x.style!.name}, in brighter colours` };
      },
    });
  // A lasting change told otherwise: the first a picture was sent, by what it was sent: an in-between
  // picture showing it, a moment told it as a fact (typed) or a state still in force.
  const b = s.draft?.breakdown;
  const tells = (rec: AsDrawn, l: { who: string; what: string; now: string }) =>
    (rec.ghost?.of === l.who && rec.ghost.state?.what === l.what && rec.ghost.state.now === l.now) ||
    (rec.facts ?? []).some(
      (n) => n.of === l.who && n.facts.some((x) => x.kind === 'part' && x.what === l.what && x.now === l.now),
    ) ||
    [...(rec.moment?.frame.plan?.own ?? []), ...(rec.moment?.frame.plan?.states ?? [])].some(
      (st) => st.who === l.who && st.what === l.what && st.now === l.now,
    );
  if (b)
    for (const m of moments(b))
      for (const [k, l] of (m.leaves ?? []).entries()) {
        if (!l.now || l.now.length < 6) continue;
        const direct = new Set(
          drawn
            .filter((f) => {
              const rec = currentRecord(f);
              return !!rec && tells(rec, l);
            })
            .map((f) => f.id),
        );
        if (!direct.size || out.some((c) => c.change === 'change told otherwise')) continue;
        out.push({
          change: 'change told otherwise',
          what: `${m.id}: ${l.who}'s ${l.what} now "${l.now}" told otherwise`,
          kind: 'record',
          direct,
          apply: (x) => {
            const mm = moments(x.draft!.breakdown!).find((y) => y.id === m.id)!;
            const now = `${l.now}, and glowing faintly`;
            for (const y of moments(x.draft!.breakdown!))
              for (const st of y.states ?? [])
                if (st.who === l.who && st.what === l.what && st.now === l.now) st.now = now;
            mm.leaves[k] = { ...mm.leaves[k], now };
          },
        });
      }
  return out;
}

export type ChangeResult = {
  change: string;
  what: string;
  expected: string[];
  found: string[];
  /** Found but not expected; expected but not found. */
  extra: string[];
  missed: string[];
  /** Pictures expected directly whose reasons lack the change's own kind. */
  wrongReason: string[];
  /** Drawn pictures a rebuild reading the records no longer gives as sent. */
  notAsSent: string[];
  lines: string[];
};

export function tryChange(s: Session, sent: Sent, c: MadeChange): ChangeResult {
  const x = structuredClone(s);
  c.apply(x);
  const report = stalenessOf(x);
  const expected = mustBeStale(s, c.direct);
  const found = new Set(report.stale.map((y) => y.id));
  const kindOf = (id: string) => report.stale.find((y) => y.id === id)?.reasons.map((r) => r.kind) ?? [];
  const again = asSent(x, sent, true);
  return {
    change: c.change,
    what: c.what,
    expected: [...expected],
    found: [...found],
    extra: [...found].filter((id) => !expected.has(id)),
    missed: [...expected].filter((id) => !found.has(id)),
    wrongReason: [...c.direct].filter((id) => {
      if (!found.has(id)) return false;
      const ghost = s.build?.frames?.find((f) => f.id === id)?.kind === 'ghost';
      const want = ghost && c.kind === 'record' ? 'change' : c.kind;
      return !kindOf(id).includes(want as never);
    }),
    notAsSent: Object.keys(again.differ),
    lines: report.stale.map(reasonLine),
  };
}

// ── saved dreams, drawn before S9 ────────────────────────────────────────────

export type SavedStale = {
  dream: string;
  drawn: number;
  /** Pictures whose store kept what they were sent. */
  read: number;
  stale: { id: string; reasons: string[] }[];
};

/**
 * A saved dream's stale pictures from what its store kept: an image a picture was sent that is no longer
 * the take its picture or sketch has now (found by the node it was made for), the look its prompt names
 * against the look chosen now, and then down the chains. Words, cast and record are not read: the prompts
 * were written by older code, so a whole prompt cannot say what changed.
 */
export function savedStale(dream: string, s: Session, store: string): SavedStale {
  const db = `file:${store}?immutable=1`;
  const sql = (q: string) =>
    JSON.parse(
      spawnSync('sqlite3', ['-json', db, q], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '[]',
    ) as Record<string, string>[];
  const frames = s.build?.frames ?? [];
  const items = s.build?.items ?? [];
  const all = [...items, ...frames];
  const drawn = frames.filter((f) => (f.kind === 'cut' || f.kind === 'ghost') && f.status === 'ready' && f.mediaId);
  const out: SavedStale = { dream, drawn: drawn.length, read: 0, stale: [] };
  const reasons = new Map<string, string[]>();
  const sources = new Map<string, string[]>();
  const add = (id: string, why: string) => reasons.set(id, [...(reasons.get(id) ?? []), why]);
  for (const f of drawn) {
    if (!f.recipeId || !/^[\w-]+$/.test(f.recipeId)) continue;
    const row = sql(`select spec from recipes where id = '${f.recipeId}'`)[0];
    if (!row) continue;
    out.read++;
    const spec = JSON.parse(row.spec) as { prompt: string; references?: { media_id: string; role: string }[] };
    const refs = (spec.references ?? []).filter((r) => /^[\w-]+$/.test(r.media_id));
    const media = refs.length
      ? sql(`select id, node_id, label from media where id in (${refs.map((r) => `'${r.media_id}'`).join(',')})`)
      : [];
    const from: string[] = [];
    for (const r of refs) {
      const now = all.find((x) => x.mediaId === r.media_id);
      if (now) {
        if (now.kind === 'cut' || now.kind === 'ghost') from.push(now.id);
        // Still its take, but no longer drawn: rejected, and its redraw failed or waits.
        if (now.status !== 'ready')
          add(
            f.id,
            `${now.kind === 'ghost' && now.ghost ? ghostName(now.ghost) : now.kind === 'cut' ? `picture:${now.id}` : `sketch:${now.id}`}: sent its take ${now.version}, not drawn now (${now.status}${now.error ? `: ${now.error.slice(0, 80)}` : ''})`,
          );
        continue;
      }
      const m = media.find((x) => x.id === r.media_id);
      if (!m || m.label.startsWith('Previs') || f.layout?.mediaId === r.media_id) continue;
      // An older take: of the picture or sketch whose node it was made for.
      const was = all.find((x) => x.nodeId === m.node_id);
      if (!was) continue;
      const name = was.kind === 'cut' ? `picture:${was.id}` : `sketch:${was.id}`;
      add(
        f.id,
        `${name}: sent an older take (${r.media_id.slice(0, 8)}), now take ${was.version} (${(was.mediaId ?? 'none').slice(0, 8)})`,
      );
      if (was.kind === 'cut') from.push(was.id);
    }
    sources.set(f.id, from);
    // The look by its name, where the prompt names it: older code went on after the name on the same line.
    const style = spec.prompt.match(/^Style: (.+)$/m)?.[1];
    if (style && s.style && !style.toLowerCase().startsWith(s.style.name.toLowerCase().replace(/\.$/, '')))
      add(f.id, `look: drawn as "${style.slice(0, 80)}", chosen now "${s.style.name}"`);
  }
  for (let more = true; more;) {
    more = false;
    for (const f of drawn)
      for (const src of sources.get(f.id) ?? [])
        if (reasons.has(src) && !(reasons.get(f.id) ?? []).some((w) => w.startsWith(`drawn from ${src}`))) {
          add(f.id, `drawn from ${src}, which is stale`);
          more = true;
        }
  }
  out.stale = [...reasons].map(([id, why]) => ({ id, reasons: why }));
  return out;
}

// ── the report ───────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const show = args.includes('--show');
  const valueOf = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  if (args.includes('--saved') || args.includes('--replays')) {
    // Saved conversations with one store (--saved <state folder> --store <sqlite>), or replays, each dream
    // with its own (--replays <folder>: <folder>/<name>/state/<id>.json and <folder>/home-<name>).
    const dir = valueOf('--saved') ?? valueOf('--replays')!;
    const each: { id: string; path: string; store: string }[] = args.includes('--saved')
      ? readdirSync(dir)
          .filter((x) => /^dream-.*\.json$/.test(x))
          .sort()
          .map((x) => ({ id: x.slice(0, -5), path: join(dir, x), store: valueOf('--store')! }))
      : readdirSync(dir)
          .sort()
          .filter((n) => existsSync(join(dir, n, 'state')))
          .flatMap((n) =>
            readdirSync(join(dir, n, 'state'))
              .filter((x) => /^dream-.*\.json$/.test(x))
              .map((x) => ({
                id: `${n}/${x.slice(0, -5)}`,
                path: join(dir, n, 'state', x),
                store: join(dir, `home-${n}`, 'production.sqlite'),
              })),
          );
    let dreams = 0;
    let drawn = 0;
    let read = 0;
    let stale = 0;
    const kinds = new Map<string, number>();
    for (const e of each) {
      const s = JSON.parse(readFileSync(e.path, 'utf8')) as Session;
      const r = savedStale(e.id, s, e.store);
      if (!r.drawn) continue;
      dreams++;
      drawn += r.drawn;
      read += r.read;
      stale += r.stale.length;
      for (const x of r.stale)
        for (const w of x.reasons) {
          const k = w.startsWith('drawn from') ? 'sequence' : w.startsWith('look') ? 'look' : w.split(':')[0];
          kinds.set(k, (kinds.get(k) ?? 0) + 1);
        }
      if (r.stale.length)
        console.log(
          `${r.dream} ${s.name.slice(0, 40)}: ${r.stale.length} of ${r.drawn} stale${show ? `\n${r.stale.map((x) => `   ${x.id}: ${x.reasons.join('; ')}`).join('\n')}` : ` (${r.stale.map((x) => x.id).join(', ')})`}`,
        );
    }
    console.log(
      `${dreams} saved dreams with pictures, ${drawn} pictures drawn, ${read} read from the store, ${stale} stale; reasons: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`,
    );
    process.exit(0);
  }
  const folders = args.filter((a) => !a.startsWith('--'));
  const totals = {
    drawn: 0,
    recorded: 0,
    heldSent: 0,
    before: { moments: 0, ghosts: 0, sameM: 0, sameG: 0 },
    after: { sameM: 0, sameG: 0 },
    stale: 0,
    behind: 0,
    unknown: 0,
    drift: 0,
    driftStale: 0,
    changes: 0,
    exact: 0,
    rightReason: 0,
    asSent: 0,
  };
  for (const x of folders.flatMap(redrawn)) {
    const s = x.session;
    const drawn = drawnOf(s);
    const recs = drawn.map((f) => [f, currentRecord(f)] as const);
    const recorded = recs.filter(([, r]) => !!r);
    const holds = recorded.filter(([f, r]) => x.sent[f.id] && r!.prompt === x.sent[f.id].prompt);
    const before = asSent(s, x.sent, false);
    const after = asSent(s, x.sent, true);
    const report: StaleReport = stalenessOf(s);
    const behindOf = report.behind.map((b) => `${b.id}: ${b.reasons.map((y) => y.input).join(', ')}`);
    // Read under other switches (the record on or off the other way, as on another machine): none compared.
    const env = drawnEnv();
    const other = {
      ...env,
      switches: { ...env.switches, DREAMCHAT_RECORD: env.switches.DREAMCHAT_RECORD === 'on' ? 'off' : 'on' },
    };
    const drift = staleness(dreamNowOf(s), labelsOf(s.build?.items ?? [], s.build?.frames ?? []), other);
    const isGhost = (id: string) => drawn.find((f) => f.id === id)?.kind === 'ghost';
    totals.drawn += drawn.length;
    totals.recorded += recorded.length;
    totals.heldSent += holds.length;
    totals.before.moments += drawn.filter((f) => f.kind === 'cut').length;
    totals.before.ghosts += drawn.filter((f) => f.kind === 'ghost').length;
    totals.before.sameM += before.same.filter((id) => !isGhost(id)).length;
    totals.before.sameG += before.same.filter(isGhost).length;
    totals.after.sameM += after.same.filter((id) => !isGhost(id)).length;
    totals.after.sameG += after.same.filter(isGhost).length;
    totals.stale += report.stale.length;
    totals.behind += behindOf.length;
    totals.unknown += report.unknown.length;
    totals.drift += drift.unknown.length;
    totals.driftStale += drift.stale.length;
    console.log(
      `${x.dream}: ${drawn.length} drawn, ${recorded.length} with a record (${holds.length} holding what was sent); as sent by a rebuild ${before.same.length} without the records, ${after.same.length} with; ${report.stale.length} stale; drawn behind the dream ${behindOf.length}; not comparable ${report.unknown.length} (under other switches ${drift.unknown.length}, stale ${drift.stale.length})`,
    );
    if (show) {
      for (const [id, d] of Object.entries(before.differ)) console.log(`   without records ${id}: ${d}`);
      for (const [id, d] of Object.entries(after.differ)) console.log(`   WITH records ${id}: ${d}`);
      for (const l of behindOf) console.log(`   behind ${l}`);
    }
    for (const st of report.stale) console.log(`   STALE ${reasonLine(st)}`);
    for (const c of changesFor(s)) {
      const r = tryChange(s, x.sent, c);
      totals.changes++;
      const exact = !r.extra.length && !r.missed.length;
      if (exact) totals.exact++;
      if (!r.wrongReason.length) totals.rightReason++;
      if (!r.notAsSent.length) totals.asSent++;
      console.log(
        `   ${exact ? 'ok  ' : 'MISS'} ${r.what}: expected ${r.expected.length} (${r.expected.join(' ')}), found ${r.found.length}${r.extra.length ? `, extra ${r.extra.join(' ')}` : ''}${r.missed.length ? `, missed ${r.missed.join(' ')}` : ''}${r.wrongReason.length ? `, wrong reason ${r.wrongReason.join(' ')}` : ''}${r.notAsSent.length ? `, rebuild not as sent ${r.notAsSent.join(' ')}` : ''}`,
      );
      if (show || !exact) for (const l of r.lines) console.log(`        ${l}`);
    }
  }
  console.log(
    `\n${totals.drawn} pictures drawn, ${totals.recorded} with a record, ${totals.heldSent} holding what was sent; a rebuild gives as sent: moments ${totals.before.sameM}/${totals.before.moments} without the records, ${totals.after.sameM}/${totals.before.moments} with; in-between pictures ${totals.before.sameG}/${totals.before.ghosts} without, ${totals.after.sameG}/${totals.before.ghosts} with; stale with nothing changed ${totals.stale}; drawn behind the dream ${totals.behind}; not comparable ${totals.unknown} (read under other switches: ${totals.drift} not comparable, ${totals.driftStale} stale); made changes ${totals.changes}: exactly the pictures they must make stale ${totals.exact}, with the right reason ${totals.rightReason}, every picture still rebuilt as sent ${totals.asSent}`,
  );
}
