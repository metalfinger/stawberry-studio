// The live flow, checked on dreams the chat itself planned and drew with DREAMCHAT_RECORD=on (fake
// replays: evals/replay.ts with DREAMCHAT_PROVIDER=fake). The frozen dreams were planned before the
// record kept anything, so they never show a pin, a re-plan or a correction made while sketching; a
// dream that went through the chat does. For every such dream with a pin (prep.record):
// - a rebuild (plan.ts) reads the record drawing reads (session.ts planRecord), whole;
// - the pin is the structure drawing read, so a rebuild places the cameras as drawing did;
// - every moment drawn rebuilds as it was sent, prompt and images, where its Strawberry store is at
//   hand (<dir>/home-<name>/production.sqlite). A rebuild takes every picture as drawn and approved and
//   knows nothing of the checks, so a moment is also passed, and said why, where the checks acted on it
//   (drawn again from a list of what went wrong; drawn without its brief, which the pre-draw check set
//   aside) or where an earlier picture it would take was never drawn: that is S2's to settle;
// - every moment drawn with the cut sheet in shadow or on had, when it was sent, the sheet a rebuild gives
//   it (the print kept on the moment, session.ts; images named by what they are, and only the earlier
//   pictures drawn by then). A sheet that differs only in the brief the pre-draw check set aside is
//   explained with the prompt; a moment drawn before its sheet was kept is counted apart.
// The rebuild is made as the dream stands (the check: its exit code), and, where pictures kept a record of
// what they were drawn from (S9, DREAMCHAT_AS_DRAWN=on), again reading the records, reported beside it: a
// rebuild reading them gives what was sent by construction wherever nothing changed since, so only the
// first says whether drawing and a fresh rebuild agree.
// Nothing is drawn and no model is called.
//
//   DREAMCHAT_RECORD=on bun run evals/live-flow.ts <replay folder> [more folders]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { printDiff, sheetPrint } from '../cutsheet';
import { imageName, imagesOf, rebuild } from '../plan';
import { diffStructure, recordMode, structureOf } from '../record';
import { planRecord, type Session } from '../session';
import type { Item } from '../sheets';
import { sentFromStore } from './freeze-session';

export type FlowCheck = {
  dream: string;
  /** A rebuild reads the record drawing reads. */
  sameRecord: boolean;
  /** Where the pin differs from the structure drawing reads now, by moment. */
  pinDiffers: string[];
  /** Moments drawn, and those rebuilt word for word and with the same images. */
  drawn: number;
  samePrompt: string[];
  sameImages: string[];
  /** The first paragraph that differs, by moment, where the prompt does not rebuild as sent. */
  differs: Record<string, { sent: string; rebuilt: string }>;
  /** Of those, why each differs where the checks or an undrawn picture explain it. */
  explained: Record<string, string>;
  /** Moments drawn whose sheet as sent is the rebuild's; where it is not, the parts that differ, and why where known. */
  sameSheet: string[];
  sheetDiffers: Record<string, string[]>;
  sheetExplained: Record<string, string>;
  /** Moments drawn before their sheet was kept when sent. */
  sheetUnlogged: string[];
};

/** One dream the chat planned and drew, checked against its rebuild. */
export function checkFlow(
  dream: string,
  s: Session,
  store?: string | Record<string, { prompt: string; images: string[] }>,
  /** S9: rebuild the pictures drawn with a record from it. Off: the dream as it stands. */
  opts: { asDrawn?: boolean } = {},
): FlowCheck | null {
  if (!s.prep?.record || !s.draft?.breakdown || !s.style) return null;
  const r = rebuild(s, { asDrawn: opts.asDrawn ?? false });
  const drawing = planRecord(s);
  const sent = typeof store === 'object' ? store : store && existsSync(store) ? sentFromStore(s, store) : {};
  const out: FlowCheck = {
    dream,
    sameRecord: JSON.stringify(r.rec) === JSON.stringify(drawing),
    pinDiffers: drawing ? diffStructure(s.prep.record, structureOf(drawing)).map((d) => `${d.moment} ${d.what}`) : [],
    drawn: 0,
    samePrompt: [],
    sameImages: [],
    differs: {},
    explained: {},
    sameSheet: [],
    sheetDiffers: {},
    sheetExplained: {},
    sheetUnlogged: [],
  };
  const frames = new Map((s.build?.frames ?? []).map((f) => [f.id, f]));
  for (const p of r.pictures) {
    const was = sent[p.id];
    if (!was) continue;
    out.drawn++;
    if (was.prompt === p.prompt) out.samePrompt.push(p.id);
    else {
      const a = was.prompt.split('\n');
      const z = p.prompt.split('\n');
      const i = a.findIndex((x, k) => x !== z[k]);
      out.differs[p.id] = { sent: a[i] ?? '', rebuilt: z[i] ?? '' };
      const sameImages = JSON.stringify(was.images) === JSON.stringify(imagesOf(r, p));
      const undrawn = takesUndrawn(frames, p.id);
      const why = /^The last attempt at this frame/m.test(was.prompt)
        ? 'drawn again from what went wrong'
        : !frames.get(p.id)?.shot &&
            /^What the (?:dreamer|camera) sees/m.test(was.prompt) &&
            /^The shot/m.test(p.prompt)
          ? 'drawn without its brief, set aside by the pre-draw check'
          : undrawn.length
            ? `an earlier picture it takes (${undrawn.join(', ')}) was left undrawn by the pre-draw check`
            : !sameImages
              ? 'an earlier picture it takes was not drawn as a rebuild takes it'
              : '';
      if (why) out.explained[p.id] = why;
    }
    if (JSON.stringify(was.images) === JSON.stringify(imagesOf(r, p))) out.sameImages.push(p.id);
  }
  // The sheet each moment was sent with, against the rebuild's.
  for (const p of r.pictures) {
    const f = frames.get(p.id);
    if (!p.sheet || f?.kind !== 'cut' || f.status !== 'ready' || !f.mediaId) continue;
    if (!f.sentSheet) {
      out.sheetUnlogged.push(p.id);
      continue;
    }
    const d = printDiff(
      f.sentSheet,
      sheetPrint(p.sheet, (m) => imageName(r, m), { earlier: f.sentSheet.earlier }),
    );
    if (!d.length) {
      out.sameSheet.push(p.id);
      continue;
    }
    out.sheetDiffers[p.id] = d;
    if (d.every((x) => x === 'camera.brief' || x === 'sources') && /brief/.test(out.explained[p.id] ?? ''))
      out.sheetExplained[p.id] = out.explained[p.id];
    // Sent without an earlier picture a check left undrawn, which a rebuild takes as drawn: the pictures
    // it names and what it takes from them differ, nothing else.
    else if (
      d.every((x) => ['names', 'earlier', 'sources'].includes(x)) &&
      /left undrawn by the pre-draw check/.test(out.explained[p.id] ?? '')
    )
      out.sheetExplained[p.id] = out.explained[p.id];
  }
  return out;
}

/**
 * The earlier pictures a moment's plan takes that a check left undrawn ("not drawn: …" when the checks
 * act): the moment was sent without them, and a rebuild, which takes every picture as drawn, has them.
 */
export function takesUndrawn(
  frames: Map<string, Pick<Item, 'status' | 'error'> & { frame?: { plan?: { refs?: { id: string }[] } } }>,
  id: string,
): string[] {
  return (frames.get(id)?.frame?.plan?.refs ?? [])
    .map((r) => r.id)
    .filter((ref) => {
      const f = frames.get(ref);
      return f?.status === 'failed' && /^not drawn: /.test(f.error ?? '') && !/limit/.test(f.error ?? '');
    });
}

/**
 * Every replayed dream under a folder: <folder>/<name>/state/<id>.json, its store <folder>/home-<name>;
 * or, for a redraw (evals/redraw.ts), what each moment was sent, kept in <folder>/<name>/redraw.json.
 */
export function replayed(
  folder: string,
): { dream: string; session: Session; store: string | Record<string, { prompt: string; images: string[] }> }[] {
  const out: ReturnType<typeof replayed> = [];
  for (const name of readdirSync(folder).sort()) {
    const st = join(folder, name, 'state');
    if (!existsSync(st)) continue;
    const redrawn = join(folder, name, 'redraw.json');
    for (const f of readdirSync(st).filter((x) => /^dream-.*\.json$/.test(x))) {
      const session = JSON.parse(readFileSync(join(st, f), 'utf8')) as Session;
      // The moments, as a store gives them (its in-between pictures are not compared).
      const cuts = new Set((session.build?.frames ?? []).filter((x) => x.kind === 'cut').map((x) => x.id));
      const sent = existsSync(redrawn)
        ? (JSON.parse(readFileSync(redrawn, 'utf8')) as { sent: Record<string, { prompt: string; images: string[] }> })
            .sent
        : undefined;
      out.push({
        dream: `${name}/${f.slice(0, -5)}`,
        session,
        store: sent
          ? Object.fromEntries(Object.entries(sent).filter(([id]) => cuts.has(id)))
          : join(folder, `home-${name}`, 'production.sqlite'),
      });
    }
  }
  return out;
}

/** A difference explained only by a check acting: with the checks only logging (S2) there is none. */
export const byCheck = (why: string | undefined) => !!why && /pre-draw check/.test(why);

if (import.meta.main) {
  const folders = process.argv.slice(2);
  // The rebuild's sheets are compared too: built in shadow when the switch is off. The camera rules need
  // the sheet on: asked for, it is turned on where unset, and a sheet set otherwise is refused, never
  // quietly run with the rules off.
  const camera = (process.env.DREAMCHAT_CAMERA ?? '').trim().toLowerCase() === 'on';
  const sheet = (process.env.DREAMCHAT_CUT_SHEET ?? '').trim().toLowerCase();
  if (camera && sheet && sheet !== 'on') {
    console.error(`DREAMCHAT_CAMERA=on needs DREAMCHAT_CUT_SHEET=on (it is ${sheet})`);
    process.exit(1);
  }
  if (!sheet || sheet === 'off') process.env.DREAMCHAT_CUT_SHEET = camera ? 'on' : 'shadow';
  if (!folders.length || recordMode() !== 'on') {
    console.error('usage: DREAMCHAT_RECORD=on bun run evals/live-flow.ts <replay folder> [more folders]');
    process.exit(1);
  }
  const dreams = folders.flatMap(replayed);
  // S9: pictures kept a record of what they were drawn from: the rebuild is read both ways.
  const recorded = dreams.some((x) => x.session.build?.frames?.some((f) => f.asDrawn?.length));
  const arms: { label: string; asDrawn: boolean }[] = [
    { label: 'as the dream stands', asDrawn: false },
    ...(recorded ? [{ label: 'reading the records of what was drawn (S9)', asDrawn: true }] : []),
  ];
  let failed = 0;
  for (const arm of arms) {
    let pinned = 0;
    let failing = 0;
    let drawn = 0;
    let same = 0;
    let checked = 0;
    if (recorded) console.log(`\n== a rebuild ${arm.label}`);
    for (const x of dreams) {
      const c = checkFlow(x.dream, x.session, x.store, { asDrawn: arm.asDrawn });
      if (!c) {
        console.log(`${x.dream}: no pin (planned with the record off, or never planned)`);
        continue;
      }
      pinned++;
      const ok =
        c.sameRecord &&
        !c.pinDiffers.length &&
        Object.keys(c.differs).every((id) => c.explained[id]) &&
        Object.keys(c.sheetDiffers).every((id) => c.sheetExplained[id]);
      if (!ok) failing++;
      drawn += c.drawn;
      same += c.samePrompt.length;
      checked += Object.values(c.explained).filter(byCheck).length;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${c.dream}: rebuild reads drawing's record ${c.sameRecord ? 'yes' : 'NO'}; pin as drawing read it ${c.pinDiffers.length ? `NO (${c.pinDiffers.join('; ')})` : 'yes'}; ${c.drawn} moments drawn, ${c.samePrompt.length} rebuilt word for word, ${c.sameImages.length} with the same images; sheets: ${c.sameSheet.length} as sent${c.sheetUnlogged.length ? `, ${c.sheetUnlogged.length} drawn before the sheet was kept` : ''}`,
      );
      for (const [id, d] of Object.entries(c.sheetDiffers))
        console.log(
          `       ${id} sheet differs in ${d.join(', ')}${c.sheetExplained[id] ? `: ${c.sheetExplained[id]}` : ''}`,
        );
      for (const [id, d] of Object.entries(c.differs))
        console.log(
          c.explained[id]
            ? `       ${id}: ${c.explained[id]}`
            : `       ${id} sent:    ${d.sent.slice(0, 240)}\n       ${id} rebuilt: ${d.rebuilt.slice(0, 240)}`,
        );
    }
    console.log(
      `${recorded ? `${arm.label}: ` : ''}${pinned} dreams with a pin, ${failing} failing; ${drawn} moments drawn, ${same} rebuilt word for word, ${checked} differing only because a check acted`,
    );
    // The check is the rebuild as the dream stands; reading the records is reported beside it.
    if (!arm.asDrawn) failed = failing;
  }
  process.exit(failed ? 1 : 0);
}
