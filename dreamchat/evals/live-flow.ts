// The live flow, checked on dreams the chat itself planned and drew with DREAMCHAT_RECORD=on (fake
// replays: evals/replay.ts with DREAMCHAT_PROVIDER=fake). The frozen dreams were planned before the
// record kept anything, so they never show a pin, a re-plan or a correction made while sketching; a
// dream that went through the chat does. For every such dream with a pin (prep.record):
// - a rebuild (plan.ts) reads the record drawing reads (session.ts planRecord), whole;
// - the pin is the structure drawing read, so a rebuild places the cameras as drawing did;
// - every moment drawn rebuilds as it was sent, prompt and images, where its Strawberry store is at
//   hand (<dir>/home-<name>/production.sqlite).
// Nothing is drawn and no model is called.
//
//   DREAMCHAT_RECORD=on bun run evals/live-flow.ts <replay folder> [more folders]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imagesOf, rebuild } from '../plan';
import { diffStructure, recordMode, structureOf } from '../record';
import { planRecord, type Session } from '../session';
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
};

/** One dream the chat planned and drew, checked against its rebuild. */
export function checkFlow(dream: string, s: Session, store?: string): FlowCheck | null {
  if (!s.prep?.record || !s.draft?.breakdown || !s.style) return null;
  const r = rebuild(s);
  const drawing = planRecord(s);
  const sent = store && existsSync(store) ? sentFromStore(s, store) : {};
  const out: FlowCheck = {
    dream,
    sameRecord: JSON.stringify(r.rec) === JSON.stringify(drawing),
    pinDiffers: drawing ? diffStructure(s.prep.record, structureOf(drawing)).map((d) => `${d.moment} ${d.what}`) : [],
    drawn: 0,
    samePrompt: [],
    sameImages: [],
    differs: {},
  };
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
    }
    if (JSON.stringify(was.images) === JSON.stringify(imagesOf(r, p))) out.sameImages.push(p.id);
  }
  return out;
}

/** Every replayed dream under a folder: <folder>/<name>/state/<id>.json, its store <folder>/home-<name>. */
export function replayed(folder: string): { dream: string; session: Session; store: string }[] {
  const out: { dream: string; session: Session; store: string }[] = [];
  for (const name of readdirSync(folder).sort()) {
    const st = join(folder, name, 'state');
    if (!existsSync(st)) continue;
    for (const f of readdirSync(st).filter((x) => /^dream-.*\.json$/.test(x)))
      out.push({
        dream: `${name}/${f.slice(0, -5)}`,
        session: JSON.parse(readFileSync(join(st, f), 'utf8')) as Session,
        store: join(folder, `home-${name}`, 'production.sqlite'),
      });
  }
  return out;
}

if (import.meta.main) {
  const folders = process.argv.slice(2);
  if (!folders.length || recordMode() !== 'on') {
    console.error('usage: DREAMCHAT_RECORD=on bun run evals/live-flow.ts <replay folder> [more folders]');
    process.exit(1);
  }
  let pinned = 0;
  let failed = 0;
  for (const x of folders.flatMap(replayed)) {
    const c = checkFlow(x.dream, x.session, x.store);
    if (!c) {
      console.log(`${x.dream}: no pin (planned with the record off, or never planned)`);
      continue;
    }
    pinned++;
    const ok = c.sameRecord && !c.pinDiffers.length && c.samePrompt.length === c.drawn;
    if (!ok) failed++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${c.dream}: rebuild reads drawing's record ${c.sameRecord ? 'yes' : 'NO'}; pin as drawing read it ${c.pinDiffers.length ? `NO (${c.pinDiffers.join('; ')})` : 'yes'}; ${c.drawn} moments drawn, ${c.samePrompt.length} rebuilt word for word, ${c.sameImages.length} with the same images`,
    );
    for (const [id, d] of Object.entries(c.differs))
      console.log(`       ${id} sent:    ${d.sent.slice(0, 240)}\n       ${id} rebuilt: ${d.rebuilt.slice(0, 240)}`);
  }
  console.log(`${pinned} dreams with a pin, ${failed} failing`);
  process.exit(failed ? 1 : 0);
}
