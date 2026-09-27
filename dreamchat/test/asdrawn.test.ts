// S9: the record of what was drawn, and staleness (asdrawn.ts). Two frozen dreams are drawn with stand-in
// pictures the way the drawing path draws them (each picture recorded as it is sent, in plan order), then
// changed after drawing, one change at a time. The pictures each change must make stale are worked out
// here from what each picture was sent (its images, by name), never from the record's own `from`.
import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  type AsDrawn,
  currentRecord,
  drawnEnv,
  driftOf,
  fieldsInForce,
  KEYS_VERSION,
  labelsOf,
  matchGhost,
  recordGhost,
  recordMoment,
  refreshMoment,
  staleness,
  withCopies,
} from '../asdrawn';
import { drawOrder, planContinuity } from '../continuity';
import { framed, ghostName } from '../cutsheet';
import { buildFrames, buildGhosts, ghostPrompt } from '../frames';
import { hashOf } from '../lib';
import { rebuild } from '../plan';
import { completeViews, moments } from '../producer';
import { dreamNowOf, planRecord, plannedInputsOf, type Session, stalenessOf } from '../session';
import type { Item } from '../sheets';

const SOURCES = join(import.meta.dir, '..', 'evals', 'sources');
const DREAMS = ['dream-0926-062232-a44a', 'dream-0926-083656-8ceb'];

const wasRecord = process.env.DREAMCHAT_RECORD;
afterEach(() => {
  if (wasRecord === undefined) delete process.env.DREAMCHAT_RECORD;
  else process.env.DREAMCHAT_RECORD = wasRecord;
});

/**
 * A frozen dream with every sketch approved and every moment and in-between picture drawn and recorded.
 * `before(frame)` changes a moment's copy of itself just before it is sent.
 */
async function drawn(
  name: string,
  before?: (frame: Item, s: Session) => void,
): Promise<{ s: Session; sent: Record<string, string> }> {
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
      before?.(f, s);
      // Its mock-up as image 1 where its camera is worked out on a floor plan, put on it as layoutFor does.
      const layout = f.frame?.plan?.eye ? `previs-${f.id}` : undefined;
      if (layout) f.layout = { mediaId: layout, key: `key-${f.id}`, path: '' };
      const built = framed({ frame: f, sheets: items, style: s.style!, inputs: plannedInputsOf(s, f), layout }, 'off');
      prompt = built.prompt;
      rec = recordMoment({
        frame: f,
        sheets: items,
        frames,
        style: s.style!,
        layout,
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

/** The rebuilt picture for a drawn one: a moment by its id, an in-between picture by the change it shows. */
const rebuiltOf = (r: ReturnType<typeof rebuild>, f: Item) =>
  f.kind === 'ghost'
    ? matchGhost(
        f.ghost!,
        r.pictures.filter((q) => q.kind === 'ghost'),
        (q) => q.item.ghost,
      )
    : r.pictures.find((q) => q.kind === 'cut' && q.id === f.id);

/** A drawn picture as the images of later pictures name it. */
const imageOf = (f: Item) => (f.kind === 'ghost' && f.ghost ? ghostName(f.ghost) : `picture:${f.id}`);

/** The images a picture was sent, by name, without their take. */
const sentNames = (f: Item) => (currentRecord(f)?.references ?? []).map((r) => r.name.replace(/ take \d+$/, ''));

/** Pictures sent an image named so. */
const sentImage = (s: Session, image: string) =>
  s.build!.frames!.filter((f) => sentNames(f).includes(image)).map((f) => f.id);

/** Those, and every picture sent an image of one of them, and so on down. */
function andDownstream(s: Session, direct: string[]): string[] {
  const out = new Set(direct);
  const frames = s.build!.frames!;
  for (let more = true; more;) {
    more = false;
    for (const f of frames) {
      if (out.has(f.id)) continue;
      if (frames.some((g) => out.has(g.id) && sentNames(f).includes(imageOf(g)))) {
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
const reasonsOf = (s: Session, id: string) =>
  stalenessOf(s)
    .stale.find((y) => y.id === id)
    ?.reasons.map((r) => r.kind) ?? [];

/** A moment of the dream no other picture was sent: the last one drawn. */
const lastMoment = (s: Session) =>
  [...s.build!.frames!].reverse().find((f) => f.kind === 'cut' && !sentImage(s, imageOf(f)).length)!;

for (const DREAM of DREAMS)
  describe(`S9 on ${DREAM}`, () => {
    test('every picture keeps a record of its take, holding what was sent, and nothing is stale or behind', async () => {
      const { s, sent } = await drawn(DREAM);
      const frames = s.build!.frames!;
      expect(frames.length).toBeGreaterThan(5);
      for (const f of frames) {
        const rec = currentRecord(f) as AsDrawn;
        expect(rec.prompt).toBe(sent[f.id]);
        expect(rec.env).toEqual(drawnEnv());
        expect(rec.dream?.keys).toEqual(rec.keys);
      }
      expect(stalenessOf(s)).toEqual({
        checked: frames.map((f) => f.id),
        unrecorded: [],
        unknown: [],
        stale: [],
        behind: [],
      });
    });

    test('a rebuild reading the records gives each picture as sent, even after the dream has changed', async () => {
      const { s, sent } = await drawn(DREAM);
      const x = structuredClone(s);
      x.style = { ...x.style!, name: `${x.style!.name}, brighter` };
      for (const it of x.build!.items) it.fields = { ...it.fields, identity: { value: 'someone else', said: true } };
      const r = rebuild(x, { asDrawn: true });
      for (const f of s.build!.frames!) {
        const p = rebuiltOf(r, f)!;
        expect([f.id, p.asDrawn, p.prompt]).toEqual([f.id, true, sent[f.id]]);
      }
      // Without them, the look as it stands is told.
      expect(rebuild(x, { asDrawn: false }).pictures.some((p) => p.prompt.includes('brighter'))).toBe(true);
    });

    test('a record whose sketch copy is not kept is rebuilt as the dream stands, never from half a record', async () => {
      const { s } = await drawn(DREAM);
      const x = structuredClone(s);
      const f = x.build!.frames!.find((y) => y.kind === 'cut')!;
      const hash = Object.values(currentRecord(f)!.sketches)[0]!;
      delete x.build!.copies!.sketches[hash];
      const r = rebuild(x, { asDrawn: true });
      const users = x.build!.frames!.filter((y) => Object.values(currentRecord(y)?.sketches ?? {}).includes(hash));
      expect(users.length).toBeGreaterThan(0);
      for (const u of users) expect(rebuiltOf(r, u)!.asDrawn).toBeUndefined();
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
      for (const id of staleIds(x)) expect(reasonsOf(x, id)).toContain(direct.includes(id) ? 'sketch' : 'sequence');
    });

    test("a moment's words corrected make it and what was drawn from it stale", async () => {
      const { s } = await drawn(DREAM);
      const source = s.build!.frames!.find((f) => f.kind === 'cut' && sentImage(s, imageOf(f)).length)!;
      const x = structuredClone(s);
      const f = x.build!.frames!.find((y) => y.id === source.id)!;
      f.fields = { ...f.fields, action: { value: `${f.fields.action!.value}, at night`, said: true } };
      expect(staleIds(x)).toEqual(andDownstream(s, [source.id]));
      expect(reasonsOf(x, source.id)).toEqual(['words']);
    });

    test('an earlier picture drawn again makes stale what was drawn from its earlier take, not itself', async () => {
      const { s } = await drawn(DREAM);
      const source = s.build!.frames!.find((f) => f.kind === 'cut' && sentImage(s, imageOf(f)).length)!;
      const x = structuredClone(s);
      const f = x.build!.frames!.find((y) => y.id === source.id)!;
      f.asDrawn = [...f.asDrawn!, { ...structuredClone(currentRecord(f)!), take: 2 }];
      Object.assign(f, { version: 2, mediaId: `picture-${f.id}-2` });
      const direct = sentImage(s, imageOf(source));
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

    test('someone put into a moment makes it stale for its cast, and nothing else', async () => {
      const { s } = await drawn(DREAM);
      const last = lastMoment(s);
      const x = structuredClone(s);
      const m = moments(x.draft!.breakdown!).find((y) => y.id === last.id)!;
      const extra = x.draft!.breakdown!.people.find((p) => !m.visible.includes(p.id) && !p.is_dreamer && !p.extras);
      const thing = x.draft!.breakdown!.things.find((t) => !m.things.includes(t.id));
      if (extra) m.visible.push(extra.id);
      else m.things.push(thing!.id);
      expect(staleIds(x)).toEqual([last.id]);
      expect(reasonsOf(x, last.id)).toContain('cast');
    });

    test("a scene's floor plan planned again makes its moments with a mock-up stale for their camera", async () => {
      const { s } = await drawn(DREAM);
      const x = structuredClone(s);
      const sc = x.draft!.breakdown!.scenes.find((y) => y.blocking?.spots?.length)!;
      // Everyone and everything a metre and a half further back, in each place the scene moves through.
      for (const plan of [sc.blocking!, ...Object.values(sc.blocking!.places ?? {})])
        for (const spot of plan.spots) spot.y = (spot.y ?? 0) + 1.5;
      const inScene = new Set(sc.moments.map((y) => y.id));
      const planned = s.build!.frames!.filter((f) => f.kind === 'cut' && inScene.has(f.id) && f.frame?.plan?.eye);
      expect(planned.length).toBeGreaterThan(0);
      const found = stalenessOf(x).stale;
      for (const f of planned) expect(found.find((y) => y.id === f.id)?.reasons.map((r) => r.kind)).toContain('camera');
      // Stale only in that scene, or drawn from a picture that is.
      for (const st of found)
        expect(inScene.has(st.id) || st.reasons.some((r) => r.kind === 'sequence' || r.kind === 'earlier')).toBe(true);
    });

    test('a moment no longer in the dream is stale because it is no longer planned', async () => {
      const { s } = await drawn(DREAM);
      const last = lastMoment(s);
      const x = structuredClone(s);
      for (const sc of x.draft!.breakdown!.scenes) sc.moments = sc.moments.filter((m) => m.id !== last.id);
      const report = stalenessOf(x);
      const st = report.stale.find((y) => y.id === last.id)!;
      expect(st.reasons[0]).toEqual({ kind: 'plan', input: 'plan', then: 'planned', now: 'no longer in the plan' });
      // Beside it only the in-between pictures planned for it alone, gone with it, and nothing else.
      const gone = new Set(report.stale.filter((y) => y.reasons[0]?.kind === 'plan').map((y) => y.id));
      for (const r of st.reasons.slice(1)) expect([r.kind, gone.has(r.input)]).toEqual(['sequence', true]);
      expect(report.stale.every((y) => gone.has(y.id))).toBe(true);
    });

    test('a record kept under other switches or keys is not comparable: unknown, never stale', async () => {
      const { s } = await drawn(DREAM);
      const env = drawnEnv();
      const flipped = env.switches.DREAMCHAT_RECORD === 'on' ? 'off' : 'on';
      const other = { ...env, switches: { ...env.switches, DREAMCHAT_RECORD: flipped } };
      // The dream changed as well: nothing is called stale all the same.
      const x = structuredClone(s);
      x.style = { ...x.style!, name: 'another look' };
      const report = staleness(dreamNowOf(x), labelsOf(x.build!.items, x.build!.frames!), other);
      expect([report.checked, report.stale, report.behind]).toEqual([[], [], []]);
      expect(report.unknown.map((u) => u.id)).toEqual(x.build!.frames!.map((f) => f.id));
      expect(report.unknown[0]!.why).toContain(`DREAMCHAT_RECORD=${env.switches.DREAMCHAT_RECORD}`);
      // Another version of the keys, and a record kept before the switches were.
      const f = x.build!.frames![0]!;
      currentRecord(f)!.env = { ...env, version: KEYS_VERSION - 1 };
      const g = x.build!.frames![1]!;
      delete currentRecord(g)!.env;
      const mixed = stalenessOf(x);
      expect(mixed.unknown).toEqual([
        { id: f.id, why: `kept with version ${KEYS_VERSION - 1} of the keys, now ${KEYS_VERSION}` },
        { id: g.id, why: 'kept before records kept their switches' },
      ]);
      expect(mixed.stale.map((y) => y.id)).not.toContain(f.id);
      expect(driftOf(env, env)).toBeNull();
    });

    test('a moment sent a copy of itself behind the dream is listed behind, not stale; the fresh send brings it up', async () => {
      // Sent without someone the plan has in it, as a moment kept the cast it was first put in with.
      let late = '';
      const { s } = await drawn(DREAM, (f) => {
        const who = f.frame?.plan?.visible ?? f.frame!.visible;
        if (late || !who.length) return;
        late = f.id;
        f.frame!.visible = f.frame!.visible.filter((p) => p !== who[who.length - 1]);
        f.frame!.things = [];
      });
      const report = stalenessOf(s);
      expect(report.behind.map((y) => y.id)).toEqual([late]);
      expect(report.behind[0]!.reasons.map((r) => r.kind)).toContain('cast');
      expect(report.stale.map((y) => y.id)).not.toContain(late);
      // Refreshed from its plan as it is sent (DREAMCHAT_FRESH_SEND=on), it is not behind.
      const { s: fresh } = await drawn(DREAM, (f, x) => {
        if (f.id !== late) return;
        f.frame!.visible = [];
        f.frame!.things = [];
        refreshMoment(
          f,
          moments(x.draft!.breakdown!).find((m) => m.id === f.id),
        );
      });
      expect(stalenessOf(fresh).behind).toEqual([]);
    });

    test("words reworded keep the dreamer's said where the breakdown holds the same words", async () => {
      const { s } = await drawn(DREAM);
      const m = moments(s.draft!.breakdown!).find((y) => y.said)!;
      const f = s.build!.frames!.find((y) => y.id === m.id)!;
      const reworded = { ...f.fields, action: { value: f.fields.action!.value, said: false } };
      expect(fieldsInForce(reworded, m).action).toEqual({ value: m.action, said: true });
      // A correction the breakdown never took keeps its own words and said.
      const corrected = { ...f.fields, action: { value: 'something else', said: false } };
      expect(fieldsInForce(corrected, m).action).toEqual({ value: 'something else', said: false });
    });
  });

describe('S9 keys', () => {
  test('the keys of two frozen dreams stay as they are, or KEYS_VERSION is raised', async () => {
    const hashes: Record<string, string> = {};
    for (const record of ['off', 'on']) {
      process.env.DREAMCHAT_RECORD = record;
      for (const name of DREAMS) {
        const { s } = await drawn(name);
        hashes[`${name} record ${record}`] = hashOf(
          s.build!.frames!.map((f) => [f.id, currentRecord(f)!.keys, currentRecord(f)!.dream?.keys ?? null]),
        );
      }
    }
    // Moved? A change to what the keys read or how they are worked out (the plan, the sheet, the record)
    // makes records kept before it incomparable: raise KEYS_VERSION in asdrawn.ts, then set these anew.
    if (process.env.S9_GOLDEN) console.log(JSON.stringify(hashes, null, 2));
    expect({ version: KEYS_VERSION, hashes }).toEqual({ version: 2, hashes: GOLDEN });
  });
});

/** The keys of the two dreams drawn as above, record off and on, at KEYS_VERSION 2. */
const GOLDEN: Record<string, string> = {
  'dream-0926-062232-a44a record off': 'c387830c865b5',
  'dream-0926-062232-a44a record on': '14a5553f255047',
  'dream-0926-083656-8ceb record off': '18a048e0bf8d6f',
  'dream-0926-083656-8ceb record on': '6566cbd06b203',
};
