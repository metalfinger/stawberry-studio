// S9: the record of what was drawn, and staleness (asdrawn.ts). A frozen dream is drawn with stand-in
// pictures the way the drawing path draws it (each picture recorded as it is sent, in plan order), then
// changed after drawing, one change at a time; the pictures found stale are held against those each
// change must make stale, worked out from what each picture was sent (its images by name).
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type AsDrawn, currentRecord, labelsOf, recordGhost, recordMoment, withCopies } from '../asdrawn';
import { drawOrder, planContinuity } from '../continuity';
import { framed } from '../cutsheet';
import { buildFrames, buildGhosts, ghostPrompt } from '../frames';
import { rebuild } from '../plan';
import { completeViews } from '../producer';
import { dreamNowOf, planRecord, plannedInputsOf, type Session, stalenessOf } from '../session';
import type { Item } from '../sheets';

const SOURCES = join(import.meta.dir, '..', 'evals', 'sources');

/** A frozen dream with every sketch approved and every moment and in-between picture drawn and recorded. */
async function drawn(name: string): Promise<{ s: Session; sent: Record<string, string> }> {
  const s = (await Bun.file(join(SOURCES, `${name}.json`)).json()) as Session;
  const b = s.draft!.breakdown!;
  completeViews(b);
  const plan = planContinuity(b, planRecord(s));
  const items = s.build!.items;
  for (const it of items)
    if (!it.extras)
      Object.assign(it, { status: 'ready', mediaId: `sketch-${it.id}-1`, review: 'approved', version: 1 });
  const pictures = new Map([...buildFrames(b, plan), ...buildGhosts(plan)].map((p) => [p.id, p]));
  s.build = {
    ...s.build!,
    plan,
    frames: drawOrder(plan).flatMap((id) => (pictures.has(id) ? [pictures.get(id)!] : [])),
  };
  const frames = s.build.frames!;
  const sent: Record<string, string> = {};
  for (const f of frames) {
    const name = labelsOf(items, frames);
    let prompt: string;
    let rec: ReturnType<typeof recordMoment>;
    if (f.kind === 'ghost') {
      const g = f.ghost!;
      const sheet = items.find((i) => i.id === g.of)!;
      const ready = (id?: string | null) => (id ? frames.find((x) => x.id === id && x.status === 'ready') : undefined);
      const built = ghostPrompt(f, sheet, ready(g.from), s.style!, ready(g.after));
      prompt = built.prompt;
      rec = recordGhost({
        ghost: f,
        sheet,
        from: ready(g.from),
        previous: ready(g.after),
        frames,
        sheets: items,
        style: s.style!,
        sent: built,
        name,
        then: dreamNowOf(s),
      });
    } else {
      const built = framed({ frame: f, sheets: items, style: s.style!, inputs: plannedInputsOf(s, f) }, 'off');
      prompt = built.prompt;
      rec = recordMoment({
        frame: f,
        sheets: items,
        frames,
        style: s.style!,
        sent: built,
        name,
        then: dreamNowOf(s),
      });
    }
    sent[f.id] = prompt;
    Object.assign(f, {
      status: 'ready',
      version: 1,
      mediaId: `picture-${f.id}-1`,
      continuityApproved: true,
      asDrawn: [{ ...rec.record, take: 1 }],
    } satisfies Partial<Item>);
    s.build.copies = withCopies(s.build.copies, rec.copies);
  }
  return { s, sent };
}

/** Pictures sent an image named so (without its take). */
const sentImage = (s: Session, image: string) =>
  s
    .build!.frames!.filter((f) => currentRecord(f)?.references.some((r) => r.name.replace(/ take \d+$/, '') === image))
    .map((f) => f.id);

/** Those, and every picture sent an image of one of them, and so on down. */
function andDownstream(s: Session, direct: string[]): string[] {
  const out = new Set(direct);
  for (let more = true; more;) {
    more = false;
    for (const f of s.build!.frames!) {
      if (out.has(f.id)) continue;
      if ((currentRecord(f)?.from ?? []).some((x) => out.has(x.id))) {
        out.add(f.id);
        more = true;
      }
    }
  }
  return [...out].sort();
}

const staleIds = (s: Session) =>
  stalenessOf(s)
    .stale.map((x) => x.id)
    .sort();

const DREAM = 'dream-0926-062232-a44a';

describe('S9: the record of what was drawn', () => {
  test('every picture keeps a record of its take, holding what was sent, and nothing is stale', async () => {
    const { s, sent } = await drawn(DREAM);
    const frames = s.build!.frames!;
    expect(frames.length).toBeGreaterThan(5);
    for (const f of frames) {
      const rec = currentRecord(f) as AsDrawn;
      expect(rec.prompt).toBe(sent[f.id]);
      expect(rec.dream?.keys).toBeDefined();
    }
    expect(stalenessOf(s)).toEqual({ checked: frames.map((f) => f.id), unrecorded: [], stale: [] });
  });

  test('a rebuild reading the records gives each picture as sent, even after the dream has changed', async () => {
    const { s, sent } = await drawn(DREAM);
    const x = structuredClone(s);
    x.style = { ...x.style!, name: `${x.style!.name}, brighter` };
    for (const it of x.build!.items) it.fields = { ...it.fields, identity: { value: 'someone else', said: true } };
    const r = rebuild(x, { asDrawn: true });
    for (const f of s.build!.frames!) {
      const p = r.pictures.find((q) => q.id === f.id)!;
      expect([f.id, p.asDrawn, p.prompt]).toEqual([f.id, true, sent[f.id]]);
    }
    // Without them, the look as it stands is told.
    expect(rebuild(x, { asDrawn: false }).pictures.some((p) => p.prompt.includes('brighter'))).toBe(true);
  });

  test('a sketch drawn again makes exactly the pictures sent it, and those drawn from them, stale', async () => {
    const { s } = await drawn(DREAM);
    const sketch = s.build!.items.find((i) => i.isDreamer && sentImage(s, `sketch:${i.id}`).length)!;
    const x = structuredClone(s);
    Object.assign(
      x.build!.items.find((i) => i.id === sketch.id)!,
      { version: 2, mediaId: `sketch-${sketch.id}-2` },
    );
    const direct = sentImage(s, `sketch:${sketch.id}`);
    expect(staleIds(x)).toEqual(andDownstream(s, direct));
    for (const st of stalenessOf(x).stale)
      expect(st.reasons[0]!.kind).toBe(direct.includes(st.id) ? 'sketch' : 'sequence');
  });

  test("a moment's words corrected make it and what was drawn from it stale", async () => {
    const { s } = await drawn(DREAM);
    const source = s.build!.frames!.find((f) => f.kind === 'cut' && sentImage(s, `picture:${f.id}`).length)!;
    const x = structuredClone(s);
    const f = x.build!.frames!.find((y) => y.id === source.id)!;
    f.fields = { ...f.fields, action: { value: `${f.fields.action!.value}, at night`, said: true } };
    expect(staleIds(x)).toEqual(andDownstream(s, [source.id]));
    expect(
      stalenessOf(x)
        .stale.find((y) => y.id === source.id)!
        .reasons.map((r) => r.kind),
    ).toEqual(['words']);
  });

  test('an earlier picture drawn again makes stale what was drawn from its earlier take, not itself', async () => {
    const { s } = await drawn(DREAM);
    const source = s.build!.frames!.find((f) => f.kind === 'cut' && sentImage(s, `picture:${f.id}`).length)!;
    const x = structuredClone(s);
    const f = x.build!.frames!.find((y) => y.id === source.id)!;
    f.asDrawn = [...f.asDrawn!, { ...structuredClone(currentRecord(f)!), take: 2 }];
    Object.assign(f, { version: 2, mediaId: `picture-${f.id}-2` });
    const direct = sentImage(s, `picture:${source.id}`);
    expect(staleIds(x)).toEqual(andDownstream(s, direct).filter((id) => id !== source.id));
    for (const id of direct)
      expect(stalenessOf(x).stale.find((y) => y.id === id)!.reasons).toContainEqual({
        kind: 'earlier',
        input: `earlier:${source.id}`,
        then: `picture:${source.id} take 1`,
        now: `picture:${source.id} take 2`,
      });
  });

  test('the look changed makes every picture stale, for its look', async () => {
    const { s } = await drawn(DREAM);
    const x = structuredClone(s);
    x.style = { ...x.style!, name: `${x.style!.name}, brighter` };
    const report = stalenessOf(x);
    expect(report.stale.map((y) => y.id).sort()).toEqual(s.build!.frames!.map((f) => f.id).sort());
    for (const st of report.stale) expect(st.reasons.map((r) => r.kind)).toContain('look');
  });

  test('a picture with no record for its take is counted apart, never stale', async () => {
    const { s } = await drawn(DREAM);
    const x = structuredClone(s);
    for (const f of x.build!.frames!) f.asDrawn = undefined;
    x.style = { ...x.style!, name: 'another look' };
    expect(stalenessOf(x)).toEqual({ checked: [], unrecorded: x.build!.frames!.map((f) => f.id), stale: [] });
  });
});
