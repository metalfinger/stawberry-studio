// The continuity plan: which earlier pictures each cut is drawn from, and the ghosts it needs.
//
// A storyboard has to read as one sequence, and frames drawn from the sheets alone look like
// the same world but not like a sequence. So every cut is drawn from the earlier cuts it has to
// match, chosen by the story (Jev's `from`) and by how the camera moves (same setup, same side,
// the other side, another place, or a jump the dream itself made). Where one edit would have to
// change too much at once, or several cuts need the same changed look, a ghost is made first:
// an in-between picture that is never a cut. Everything here is pure: the breakdown in, the plan
// out, and the same breakdown always gives the same plan.
import { type Blocking, type Eye, outsideOrder } from './blocking';
import { dreamerShot } from './previs';
import { type Breakdown, type Moment, moments, POSITION, type State } from './producer';

export type Relation = 'same_setup' | 'same_side' | 'other_side' | 'other_place' | 'shift' | 'seat';
export type RefRole = 'base' | 'composition' | 'lighting' | 'identity' | 'prop' | 'location';

export type PlanRef = {
  /** A moment id or a ghost id. */
  id: string;
  kind: 'cut' | 'ghost';
  role: RefRole;
  relation?: Relation;
  /** What it gives this picture, in plain words for the prompt and the panel. */
  carries: string;
  /**
   * The people it shows as last drawn, when it is only the picture they were last seen in: it goes
   * in for those whose sketch is not in the picture, since a sketch alone says who someone is.
   */
  who?: string[];
  /**
   * A jump the dream made within the same place, facing another side of it: only where things sit
   * in the frame carries, never the framing itself.
   */
  turned?: boolean;
};

/**
 * A continuity check for the judge: `with` is the earlier picture to compare against (a moment's
 * id, or `sheet:<id>` for a person's own sheet), if any. `fix` says it as an instruction, for a
 * redraw when the check fails.
 */
export type Criterion = { with: string | null; text: string; fix: string };

export type CutPlan = {
  id: string;
  order: number;
  /** Its scene, and its shot there: one camera setup (place, side, framing, eyes). */
  scene: string;
  shot: string;
  refs: PlanRef[];
  /** What this moment itself changes: the picture shows it done, and it holds from here on. */
  own: State[];
  /**
   * Changes from earlier moments still in force for what is in view, spelled out in the prompt.
   * One this moment changes again is not among them: the melting ice gives way to the horse.
   */
  states: State[];
  /**
   * The people in view from left to right, as their scene first placed them: every picture of the
   * scene keeps it, so the line between them is never crossed (the dreamer and the young woman
   * swapped sides at the scene's last picture, 23 Sep). Empty with fewer than two in view.
   */
  staging: string[];
  /** The location sheet sets the layout only when the cut faces the side it shows. */
  sheetLayout: boolean;
  /** What differs from its references. Three or more is too much for one edit. */
  changes: string[];
  /** The cuts and ghosts that must be drawn and approved first. */
  needs: string[];
  criteria: Criterion[];
  /** Generations from the sheets: drift grows with it. */
  depth: number;
  transition: string;
  matchFrame?: string;
  /**
   * Through the dreamer's eyes, on a scene with a floor plan: what they see from where they are,
   * read off the render of their view (previs.ts).
   */
  view?: string;
  /** The camera that view is from: where their eyes are on the plan, how high, which way they look. */
  eye?: Eye;
  /** Who and what that view has in the picture: drawn from their sketches like anyone in view. */
  sees?: string[];
  /** Seen from outside, on a scene with a floor plan: who and what is where, left to right. */
  across?: string[];
  /** Seen from outside, on a scene with a floor plan: where the camera stands, in words. */
  camera?: string;
  why: string;
};

export type GhostPlan = {
  id: string;
  kind: 'state' | 'view';
  /** The person, place or thing it shows. Its sheet is the picture edited. */
  of: string;
  label: string;
  /** The one edit, in words. */
  change: string;
  /** The cut that shows how the change looks, or the place's light; null for the sheet alone. */
  from: string | null;
  /** The ghost of this subject's change before, edited in turn: one change per edit. */
  after?: string;
  needs: string[];
  usedBy: string[];
  why: string;
  state?: State;
  looksAt?: string;
  depth: number;
};

export type ContinuityPlan = { cuts: CutPlan[]; ghosts: GhostPlan[]; issues: string[] };

/** At most this many earlier cuts per picture: more references blur what each one is for. */
const MAX_EARLIER = 3;
/** At most this many base edits in a row; the next re-anchors on the sheets, so drift stops. */
const MAX_BASE_RUN = 2;
/** Three changes or more in one edit is where a ghost goes in between. */
const TOO_MANY = 3;
const WIDTH: Record<Moment['distance'], number> = { wide: 3, medium: 2, close: 1 };

/** Two `looks_at` in the same words face the same side. */
export function sameWords(a: string, b: string): boolean {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/\b(the|a|an)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return norm(a) === norm(b);
}

/**
 * A name as a picture is told it. The people of a dream are named as the dreamer said them, and
 * "your aunt" in an instruction to a picture brings a viewer ("you") into it: she is "the
 * dreamer's aunt".
 */
export const pictureName = (name: string) =>
  name.replace(/\byour\b/gi, "the dreamer's").replace(/\byou\b/gi, 'the dreamer');

/**
 * Who a picture shows as people. Through the dreamer's own eyes the dreamer is the camera: at most
 * their own hands or feet show, never their face (the glass world's point-of-view moments were
 * given the dreamer's face sheet, and checked for "the same face").
 */
/**
 * A moment's scene's floor plan with only who and what is there by then: whoever has been seen in
 * the scene so far, and what has been in it, and the dreamer. Someone who comes in later is not in
 * the room yet, for the camera or its previs.
 */
export function planBy(b: Breakdown, momentId: string): Blocking | undefined {
  const scene = b.scenes.find((sc) => sc.moments.some((x) => x.id === momentId));
  if (!scene?.blocking) return undefined;
  const upTo = scene.moments.slice(0, scene.moments.findIndex((x) => x.id === momentId) + 1);
  const there = new Set(upTo.flatMap((x) => [...x.visible, ...x.things]));
  const dreamerId = b.people.find((p) => p.is_dreamer)?.id;
  return { ...scene.blocking, spots: scene.blocking.spots.filter((s) => there.has(s.id) || s.id === dreamerId) };
}

export const seenIn = (m: Pick<Moment, 'visible' | 'eyes'>, dreamerId?: string) =>
  m.eyes === 'dreamer' && dreamerId ? m.visible.filter((p) => p !== dreamerId) : m.visible;

/** Everything a picture shows that a lasting change can be seen on, its place included. */
export const inViewAt = (m: Moment) => new Set([...m.visible, ...m.things, ...(m.place ? [m.place] : [])]);

const CARRIES: Record<Relation, string> = {
  same_setup: 'the same view a moment earlier: the room, the light and where everyone is',
  same_side: 'the same place from the same side: where its walls, furniture and people are, and its light',
  other_side: 'the same place from the other side: the light to keep, said in words and checked against it; not drawn from',
  other_place: 'how everyone in it looks right now; not its background',
  shift: 'the picture just before the dream jumps: its framing and where everyone is',
  seat: 'where the dreamer is: the camera is at their eyes there, turned toward what this moment faces',
};

const ROLE: Record<Relation, RefRole> = {
  same_setup: 'composition',
  same_side: 'composition',
  other_side: 'lighting',
  other_place: 'identity',
  shift: 'composition',
  seat: 'composition',
};

export function planContinuity(b: Breakdown): ContinuityPlan {
  // A breakdown drafted before these fields existed plans as if nothing lasting changes.
  const ms = moments(b).map((m) => ({
    ...m,
    looks_at: m.looks_at ?? '',
    shift: m.shift ?? '',
    // Only a look lasts: "location: at the far end of the room" in an older breakdown became a
    // ghost of her standing somewhere.
    leaves: (m.leaves ?? []).filter((l) => !POSITION.test(l.what.trim())),
  }));
  const index = new Map(ms.map((m, i) => [m.id, i]));
  const byId = new Map(ms.map((m) => [m.id, m]));
  const names = new Map<string, string>([...b.people, ...b.places, ...b.things].map((x) => [x.id, x.name]));
  // The dreamer is "you" in the conversation, but "you" in an instruction to a picture is anyone.
  const dreamerId = b.people.find((p) => p.is_dreamer)?.id;
  const name = (id: string) => (id === dreamerId ? 'the dreamer' : pictureName(names.get(id) ?? id));
  const seen = (m: Moment) => seenIn(m, dreamerId);
  const no = (id: string) => (index.get(id) ?? 0) + 1;
  const kindOf = (id: string): 'person' | 'place' | 'thing' =>
    b.places.some((p) => p.id === id) ? 'place' : b.things.some((t) => t.id === id) ? 'thing' : 'person';

  // Which earlier moments face the same side of the place: Jev's answer, or the same words.
  const sides = (m: Moment, e: Moment) =>
    m.sameSide
      ? m.sameSide.includes(e.id)
      : e.place === m.place && (!e.looks_at || !m.looks_at || sameWords(e.looks_at, m.looks_at));
  // A dream's jump is a boundary: what came before it shares no place with what comes after,
  // even filed under the same name (the room before the glass world was drawn again after the
  // jump, 23 Sep). Only the jump's own picture is matched to the one just before it.
  const acrossJump = (e: Moment, m: Moment) =>
    ms.some((k, at) => {
      const ei = index.get(e.id)!;
      const mi = index.get(m.id)!;
      return !!k.shift && ((ei < at && at <= mi) || (ei === at && at < mi));
    });
  const relation = (m: Moment, e: Moment): Relation => {
    if (m.shift && index.get(e.id) === (index.get(m.id) ?? 0) - 1) return 'shift';
    if (acrossJump(e, m)) return 'other_place';
    if (!m.place || e.place !== m.place) return 'other_place';
    if (!sides(m, e)) return 'other_side';
    return e.distance === m.distance && e.eyes === m.eyes ? 'same_setup' : 'same_side';
  };

  const sceneOf = new Map<string, string>();
  for (const sc of b.scenes) for (const mo of sc.moments) sceneOf.set(mo.id, sc.id);
  // A shot is one camera setup within a scene: a cut joins the shot of an earlier cut of the same
  // setup, even after a cutaway, else opens a new one.
  const shotOf = new Map<string, string>();
  const shotsIn = new Map<string, number>();

  const baseRun = new Map<string, number>();
  const cuts: CutPlan[] = ms.map((m, i) => {
    const scene = sceneOf.get(m.id) ?? 's1';
    const setup = ms
      .slice(0, i)
      .filter((e) => sceneOf.get(e.id) === scene && relation(m, e) === 'same_setup')
      .at(-1);
    if (setup) shotOf.set(m.id, shotOf.get(setup.id)!);
    else {
      shotsIn.set(scene, (shotsIn.get(scene) ?? 0) + 1);
      shotOf.set(m.id, `${scene}.sh${shotsIn.get(scene)}`);
    }
    const earlier = ms.slice(0, i);
    const rel = new Map(earlier.map((e) => [e.id, relation(m, e)]));
    const refs: PlanRef[] = [];
    const add = (e: Moment, role: RefRole, relation: Relation, carries = CARRIES[relation]) => {
      if (refs.some((r) => r.id === e.id) || refs.length >= MAX_EARLIER) return;
      refs.push({ id: e.id, kind: 'cut', role, relation, carries });
    };

    // 1. The base: the same setup, a moment later. Jev's pick wins when it is one.
    const setups = earlier.filter((e) => rel.get(e.id) === 'same_setup');
    const fromSetup = m.from && rel.get(m.from) === 'same_setup' ? byId.get(m.from) : undefined;
    const base = fromSetup ?? setups.at(-1);
    let run = 0;
    if (base && !m.shift) {
      if ((baseRun.get(base.id) ?? 0) >= MAX_BASE_RUN)
        add(base, 'composition', 'same_setup', `${CARRIES.same_setup}; drawn afresh from the sheets, not edited`);
      else {
        add(
          base,
          'base',
          'same_setup',
          'the same view a moment earlier: edit it, changing only what this moment changes',
        );
        run = (baseRun.get(base.id) ?? 0) + 1;
      }
    }
    baseRun.set(m.id, run);

    // A jump the dream made: a match cut from the picture just before.
    let matchFrame: string | undefined;
    if (m.shift && i > 0) {
      add(ms[i - 1], 'composition', 'shift', `${CARRIES.shift}; the dream changes: ${m.shift}`);
      // Facing another side of the same place, its framing cannot be kept: "keep its framing
      // exactly" beside "facing the roller coaster", of a picture facing the screen, read as the
      // prompt contradicting itself (0.50, 24 Sep).
      const jump = refs.find((r) => r.id === ms[i - 1].id && r.relation === 'shift');
      if (jump && ms[i - 1].place === m.place && !sides(m, ms[i - 1])) jump.turned = true;
      matchFrame = ms[i - 1].id;
    }

    // 2. The story's own link, in the role the camera move allows. From another place it gives
    // only how people look now, which their sheets already give unless something has changed
    // on them: then it stays out, since its background bleeds in (a house came through the walls
    // of a tiny room as a double exposure, 23 Sep).
    const from = m.from ? byId.get(m.from) : undefined;
    if (from && index.get(from.id)! < i) {
      const r = rel.get(from.id) as Relation;
      const carriesChange = (m.states ?? []).some(
        (st) => index.get(from.id)! >= index.get(st.since)! && inViewAt(from).has(st.who),
      );
      if (r !== 'other_place' || carriesChange) add(from, ROLE[r], r);
    }

    // 3. The room: when nothing yet shows this place from this side, the widest cut that does.
    const inPlace = (r: PlanRef) => r.relation === 'same_setup' || r.relation === 'same_side';
    if (m.place && !refs.some(inPlace)) {
      const anchor = earlier
        .filter((e) => rel.get(e.id) === 'same_side' || rel.get(e.id) === 'same_setup')
        .sort((x, y) => WIDTH[y.distance] - WIDTH[x.distance] || index.get(y.id)! - index.get(x.id)!)[0];
      if (anchor) add(anchor, 'composition', rel.get(anchor.id) as Relation, CARRIES.same_side);
    }

    // 4. The light: a place seen so far only from other sides still gives its light and time of
    // day (the drop-off at the house took nothing from the waiting and arrival shots before it).
    if (m.place && !refs.some((r) => inPlace(r) || r.relation === 'other_side')) {
      const lit = earlier.filter((e) => rel.get(e.id) === 'other_side').at(-1);
      if (lit) add(lit, 'lighting', 'other_side');
    }

    // Through the dreamer's own eyes, after they were seen in this place: the camera is where they
    // are in that picture. Told only "through the dreamer's eyes, facing the roller coaster", a
    // moment was drawn from the aisle, as if the dreamer had got up, not from their seat beside it
    // (24 Sep). A jump that changes the place in between leaves their seat behind.
    if (m.eyes === 'dreamer' && dreamerId && m.place) {
      const jumpBetween = (e: Moment) => ms.some((k, at) => !!k.shift && index.get(e.id)! < at && at <= i);
      const seat = earlier
        .filter((e) => e.place === m.place && e.eyes === 'outside' && e.visible.includes(dreamerId) && !jumpBetween(e))
        .at(-1);
      if (seat) {
        const known = refs.find((r) => r.id === seat.id);
        if (known) Object.assign(known, { role: 'composition', relation: 'seat', carries: CARRIES.seat, who: undefined });
        else add(seat, 'composition', 'seat');
      }
    }

    // The location sheet shows the place from one side: the side its first picture faces.
    const first = ms.find((e) => e.place === m.place);
    const sheetLayout = !first || first === m || sides(m, first);

    // A moment that changes a part again replaces what it was: the horse's head was told "still
    // a melting ice block" and judged against it (23 Sep).
    const own = m.leaves.map((l) => ({ who: l.who, what: l.what, now: l.now, since: m.id }));
    return {
      id: m.id,
      order: i + 1,
      scene,
      shot: shotOf.get(m.id)!,
      refs,
      own,
      states: (m.states ?? []).filter((st) => !own.some((o) => o.who === st.who && o.what === st.what)),
      staging: [],
      sheetLayout,
      changes: [],
      needs: [],
      criteria: [],
      depth: 0,
      transition: '',
      matchFrame,
      why: '',
    };
  });
  const cutOf = new Map(cuts.map((c) => [c.id, c]));

  const ghosts: GhostPlan[] = [];
  const stateKey = (st: State) => `${st.who}/${st.what}/${st.now}/${st.since}`;
  // A state is carried by its ghost, or by a referenced cut drawn at or after the change that
  // shows who changed. The picture before a dream's jump carries nothing of what the jump changes.
  const carriedBy = (c: CutPlan, st: State) =>
    c.refs.find((r) => {
      if (r.kind === 'ghost') {
        const g = ghosts.find((x) => x.id === r.id);
        return !!g?.state && stateKey(g.state) === stateKey(st);
      }
      // A picture kept only for its light is not drawn from, so it carries no change.
      return (
        r.relation !== 'shift' &&
        r.role !== 'lighting' &&
        index.get(r.id)! >= index.get(st.since)! &&
        inViewAt(byId.get(r.id)!).has(st.who)
      );
    });
  const countChanges = (c: CutPlan) => {
    const m = byId.get(c.id)!;
    const out = ['the action'];
    const edited = c.refs.some((r) => r.role === 'base');
    if (!edited) {
      const room = c.refs.find((r) => r.relation === 'same_side' || r.relation === 'same_setup');
      if (room && byId.get(room.id)!.distance !== m.distance)
        out.push(`reframed ${m.distance} from picture ${no(room.id)}`);
      const established = ms.slice(0, c.order - 1).some((e) => e.place === m.place);
      const viewGhost = c.refs.some((r) => r.kind === 'ghost' && ghosts.find((g) => g.id === r.id)?.kind === 'view');
      if (m.place && established && !room && !c.sheetLayout && !viewGhost)
        out.push(`${name(m.place)} facing ${m.looks_at || 'another way'}, never drawn`);
    }
    for (const st of c.states)
      if (!carriedBy(c, st)) out.push(`${name(st.who)}'s ${st.what} now ${st.now}, shown in no reference`);
    return out;
  };

  const roleFor = (id: string): RefRole =>
    kindOf(id) === 'place' ? 'location' : kindOf(id) === 'thing' ? 'prop' : 'identity';
  const addGhostRef = (c: CutPlan, g: GhostPlan, st: State) =>
    c.refs.push({
      id: g.id,
      kind: 'ghost',
      role: roleFor(st.who),
      carries: `how ${name(st.who)} looks now: ${st.what} ${st.now}`,
    });
  // Transformation ghosts: every lasting change to a person, place or thing is drawn on its own
  // first, one change per edit, each from the one before (sheet → ice block → melting → horse).
  // Every moment from the change on, while it holds, takes the look from its ghost, so the
  // change is invented once and carried, never re-invented inside a whole scene.
  const latest = new Map<string, GhostPlan>();
  const ghostOf = new Map<string, GhostPlan>(); // by state key
  for (const m of ms)
    for (const l of m.leaves) {
      const state: State = { who: l.who, what: l.what, now: l.now, since: m.id };
      const prev = latest.get(l.who);
      const g: GhostPlan = {
        id: `g${ghosts.length + 1}`,
        kind: 'state',
        of: l.who,
        label: `${name(l.who)}, ${l.what} now ${l.now}`,
        change: `${name(l.who)}'s ${l.what} is now ${l.now}`,
        from: null,
        after: prev?.id,
        needs: prev ? [prev.id] : [],
        usedBy: [],
        why: `${name(l.who)} changes at picture ${no(m.id)}: drawn on ${kindOf(l.who) === 'person' ? 'them' : 'it'} alone first, one change in one edit${prev ? ', from the change before' : ''}`,
        state,
        depth: 0,
      };
      ghosts.push(g);
      latest.set(l.who, g);
      ghostOf.set(stateKey(state), g);
    }
  for (const c of cuts) {
    // Its own change, and every change still in force on what it shows.
    for (const st of [...c.own, ...c.states]) {
      const g = ghostOf.get(stateKey(st));
      if (!g || c.refs.some((r) => r.id === g.id)) continue;
      g.usedBy.push(c.id);
      addGhostRef(c, g, st);
    }
  }
  for (const c of cuts) c.changes = countChanges(c);

  // Every person in a moment, as last drawn: the picture they were last seen in, for a moment
  // drawn without their sketch. With it, the sketch alone says who they are: two images each
  // claiming how the dreamer looks read as a clash (0.42-0.46 on what each image is for), and the
  // later picture had drawn her hair auburn (24 Sep).
  const MAX_CUTS = MAX_EARLIER + 2;
  for (const c of cuts) {
    const m = byId.get(c.id)!;
    for (const p of seen(m)) {
      const cutRefs = c.refs.filter((r) => r.kind === 'cut');
      const showing = cutRefs.find((r) => inViewAt(byId.get(r.id)!).has(p));
      if (showing) {
        if (showing.who && !showing.who.includes(p)) showing.who.push(p);
        continue;
      }
      if (cutRefs.length >= MAX_CUTS) continue;
      const lastSeen = ms
        .slice(0, c.order - 1)
        .filter((e) => seen(e).includes(p))
        .at(-1);
      if (lastSeen)
        c.refs.push({
          id: lastSeen.id,
          kind: 'cut',
          role: 'identity',
          relation: relation(m, lastSeen),
          carries: `who ${name(p)} is, as last drawn, when their sketch is not there`,
          who: [p],
        });
    }
  }

  // View ghosts: a side of a place never drawn, where the first picture facing it can't set it
  // up for the rest: it would change too much at once, or it is a close-up that later, wider
  // pictures of that side would have to build the room from.
  for (const c of cuts) {
    if (!c.changes.some((x) => x.endsWith('never drawn'))) continue;
    const m = byId.get(c.id)!;
    const wider = cuts.slice(c.order).filter((l) => {
      const lm = byId.get(l.id)!;
      return lm.place === m.place && sides(lm, m) && lm.distance !== 'close';
    });
    const crowded = c.changes.length >= TOO_MANY;
    if (!crowded && !(m.distance === 'close' && wider.length)) continue;
    const light = ms
      .slice(0, c.order - 1)
      .filter((e) => e.place === m.place)
      .sort((x, y) => WIDTH[y.distance] - WIDTH[x.distance] || index.get(y.id)! - index.get(x.id)!)[0];
    const g: GhostPlan = {
      id: `g${ghosts.length + 1}`,
      kind: 'view',
      of: m.place,
      label: `${name(m.place)}, facing ${m.looks_at || 'the other way'}`,
      change: `the camera turned to face ${m.looks_at || 'the other way'}`,
      from: light?.id ?? null,
      needs: light ? [light.id] : [],
      usedBy: [c.id, ...wider.map((l) => l.id)],
      why: crowded
        ? `picture ${c.order} faces a side of ${name(m.place)} never drawn, and would otherwise change ${c.changes.length} things at once`
        : `picture ${c.order} is the first to face ${m.looks_at || 'that side'}, but only close; pictures ${wider.map((l) => l.order).join(', ')} need the whole of it`,
      looksAt: m.looks_at,
      depth: 0,
    };
    ghosts.push(g);
    for (const id of g.usedBy)
      cutOf.get(id)!.refs.push({
        id: g.id,
        kind: 'ghost',
        role: 'location',
        carries: `${name(m.place)} from the side this picture faces`,
      });
  }

  // Staging: a scene places its people once, left to right, from the first picture that shows two
  // or more of them; anyone who joins later stands to their right. Every picture of the scene keeps
  // that order, and a dream's jump starts it again.
  const lineups = new Map<string, string[]>();
  let jumps = 0;
  for (const c of cuts) {
    const m = byId.get(c.id)!;
    if (m.shift) jumps += 1;
    const key = `${c.scene}/${jumps}`;
    const line = lineups.get(key) ?? [];
    const people = seen(m);
    if (people.length >= 2 || line.length) {
      for (const p of people) if (!line.includes(p)) line.push(p);
      lineups.set(key, line);
    }
    const inView = line.filter((p) => people.includes(p));
    c.staging = inView.length >= 2 ? inView : [];
  }

  // With a floor plan, every camera is placed on it: what each picture sees is worked out, and who
  // stands where across it follows from where they are, not from the order they were first named.
  const blockOf = new Map(b.scenes.map((sc) => [sc.id, sc.blocking]));
  const bare = (x: string) => x.toLowerCase().replace(/^(the|a|an)\s+/, '').trim();
  for (const c of cuts) {
    const plan = blockOf.get(c.scene);
    if (!plan) continue;
    const m = byId.get(c.id)!;
    const changed = [...c.own, ...c.states];
    // What something is called now: the big sofa that has become a roller coaster is the roller coaster.
    const now = (id: string) => {
      const st = changed.find((x) => x.who === id && /^\s*(?:its |their )?(?:form|shape|whole|self|itself|kind)\s*$/i.test(x.what));
      return st ? `${/^(a|an|the)\s/i.test(st.now) ? '' : 'the '}${st.now} (what ${name(id)} turned into)` : name(id);
    };
    const target = (words: string) => {
      const w = bare(words);
      if (!w) return undefined;
      return plan.spots.find(
        (s) =>
          w.includes(bare(name(s.id))) ||
          bare(name(s.id)).includes(w) ||
          changed.some((st) => st.who === s.id && (w.includes(bare(st.now)) || bare(st.now).includes(w))),
      )?.id;
    };
    if (m.eyes === 'dreamer' && dreamerId) {
      const v = dreamerShot(planBy(b, m.id) ?? plan, dreamerId, target(m.looks_at), now);
      if (v) {
        c.view = v.text;
        c.eye = v.eye;
        c.sees = v.inPicture;
        // Made from its previs, the view needs nothing from the picture the dreamer was seen in:
        // it is neither drawn from nor waited for, so it can be drawn alongside it.
        c.refs = c.refs.filter((r) => r.relation !== 'seat');
      }
    } else {
      const fromBehind = !!m.looks_at && bare(m.looks_at).includes(bare(plan.front));
      const ids = [...seen(m), ...m.things].filter((id) => plan.spots.some((s) => s.id === id && !s.many));
      c.across = outsideOrder(plan, ids, fromBehind);
      c.camera = fromBehind
        ? `from behind them, facing ${plan.front}`
        : `from in front of them, looking at them, with ${plan.front} behind the camera`;
      const people = c.across.filter((id) => seen(m).includes(id));
      c.staging = people.length >= 2 ? people : [];
    }
  }

  // Needs, depth, checks, transitions and a line of why, now the references are final.
  const depth = new Map<string, number>();
  for (const g of ghosts) if (!g.from) depth.set(g.id, 1);
  for (const c of cuts) {
    for (const g of ghosts)
      if (g.from && !depth.has(g.id) && depth.has(g.from)) depth.set(g.id, depth.get(g.from)! + 1);
    c.changes = countChanges(c);
    c.needs = c.refs.map((r) => r.id);
    c.depth = 1 + Math.max(0, ...c.refs.map((r) => depth.get(r.id) ?? 0));
    depth.set(c.id, c.depth);
    const m = byId.get(c.id)!;
    c.transition = (
      m.shift
        ? `dream shift: ${m.shift}`
        : c.refs.some((r) => r.role === 'base')
          ? 'continuous'
          : c.refs.some((r) => r.kind === 'cut')
            ? 'cut, carrying on'
            : 'cut'
    ).slice(0, 120);
    c.criteria = criteria(c, m);
    c.why = c.refs.length
      ? c.refs.map((r) => `${r.kind === 'ghost' ? `ghost ${r.id}` : `picture ${no(r.id)}`} as ${r.role}`).join('; ')
      : 'the sheets alone';
  }
  for (const g of ghosts) {
    g.depth = depth.get(g.id) ?? (g.from ? (depth.get(g.from) ?? 1) + 1 : 1);
    g.usedBy = [...new Set(g.usedBy)];
  }

  function criteria(c: CutPlan, m: Moment): Criterion[] {
    const out: Criterion[] = [];
    for (const r of c.refs) {
      if (r.kind !== 'cut') continue;
      const e = byId.get(r.id)!;
      const k = no(r.id);
      const people = seen(e).filter((p) => seen(m).includes(p));
      if (r.relation === 'same_setup')
        out.push({
          with: r.id,
          text: 'Is the second picture the same view as the first, a moment later: the same place from the same side, in the same light?',
          fix: `keep the view of picture ${k} exactly: the same place, from the same side, in the same light, a moment later`,
        });
      if (r.relation === 'same_side')
        out.push({
          with: r.id,
          text: `Do both pictures show ${name(m.place)} from the same side, with its walls, windows and furniture in the same places?`,
          fix: `show ${name(m.place)} from the same side as picture ${k}, with its walls, windows and furniture where they are there`,
        });
      if (r.relation === 'other_side' || r.relation === 'same_side' || r.relation === 'same_setup')
        out.push({
          with: r.id,
          text: 'Is the light the same in both pictures: the same time of day and the same light sources?',
          fix: `keep the light of picture ${k}: the same time of day and the same light`,
        });
      if (r.relation === 'seat')
        out.push({
          with: r.id,
          text: 'Is the second picture seen through the dreamer\'s eyes from where they are in the first: from their place, at their eye height, with what is beside them there beside the camera?',
          fix: `seen from where the dreamer is in picture ${k}: from their place, at their eye height, with what is beside them there beside the camera`,
        });
      if (r.relation === 'shift')
        out.push(
          e.place !== m.place || r.turned
            ? {
                with: r.id,
                text: `Does the second picture keep the first one's composition, where the main shapes sit in the frame, while ${m.shift}?`,
                fix: `keep where the main shapes sit in picture ${k}'s frame, while ${m.shift}`,
              }
            : {
                with: r.id,
                text: `Does the second picture keep the first one's framing, while ${m.shift}?`,
                fix: `keep the framing of picture ${k}, while ${m.shift}`,
              },
        );
      for (const p of people)
        out.push({
          with: r.id,
          text: `Is ${name(p)} the same person in both pictures: the same face, hair and clothes?`,
          fix: `${name(p)} must be the same person as in picture ${k}: the same face, hair and clothes`,
        });
    }
    if (c.staging.length) {
      const order = c.staging.map(name).join(', then ');
      out.push({
        with: null,
        text: `From left to right in the frame, is it ${order}?`,
        fix: `from left to right: ${order}, never swapped`,
      });
    }
    // Every picture is made the same way as the one it follows: a photographic storyboard came
    // back as an ink drawing at its fifth picture (23 Sep).
    const follows = c.refs.find((r) => r.kind === 'cut');
    if (follows)
      out.push({
        with: follows.id,
        text: 'Are both pictures made the same way: the same medium (a photograph, pencil, paint, ink…) and the same finish?',
        fix: `made exactly as picture ${no(follows.id)} is: the same medium and finish`,
      });
    // Everyone in it is also held to their own sheet: drift caught at the first moment is not
    // carried into the next (a dreamer drawn from a line sketch came back as someone else, 23 Sep).
    for (const p of seen(m))
      out.push({
        with: `sheet:${p}`,
        text: `Is ${name(p)} the same person as in their reference sheet: the same face, hair and clothes?`,
        fix: `${name(p)} must look exactly like their reference sheet: the same face, hair and clothes`,
      });
    for (const t of m.things)
      out.push({
        with: `sheet:${t}`,
        text: `Is ${name(t)} the same object as in its reference sheet: the same shape, colours and details?`,
        fix: `${name(t)} must look exactly like its reference sheet: the same shape, colours and details`,
      });
    for (const st of [...c.own, ...c.states])
      out.push({
        with: null,
        text: `In this picture, is ${name(st.who)}'s ${st.what} ${st.now}?`,
        fix: `${name(st.who)}'s ${st.what} is ${st.now}`,
      });
    return out;
  }

  const issues: string[] = [];
  for (const c of cuts) {
    const m = byId.get(c.id)!;
    if (!m.action.trim() || m.action.startsWith('(no action')) issues.push(`picture ${c.order} has no visible action`);
    for (const r of c.refs)
      if (r.kind === 'cut' && !(index.get(r.id)! < c.order - 1))
        issues.push(`picture ${c.order} refers to picture ${no(r.id)}, which is not earlier`);
    if (c.changes.length >= TOO_MANY)
      issues.push(`picture ${c.order} still changes ${c.changes.length} things at once: ${c.changes.join('; ')}`);
    for (const st of [...c.own, ...c.states])
      if (!carriedBy(c, st))
        issues.push(`picture ${c.order}: ${name(st.who)}'s ${st.what} (${st.now}) is carried in words only`);
  }
  for (const g of ghosts)
    for (const n of g.needs)
      if (!cutOf.has(n) && !ghosts.some((x) => x.id === n))
        issues.push(`ghost ${g.id} needs ${n}, which is not a picture`);
  return { cuts, ghosts, issues };
}

/**
 * The order to draw in: story order, each ghost as soon as the cut it is taken from is in. The
 * scheduler still waits on `needs`; this only decides who goes first among the ready.
 */
export function drawOrder(plan: ContinuityPlan): string[] {
  const out: string[] = [];
  const placed = new Set<string>();
  const place = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    out.push(id);
  };
  for (const g of plan.ghosts) if (!g.needs.length) place(g.id);
  for (const c of plan.cuts) {
    for (const g of plan.ghosts)
      if (c.needs.includes(g.id)) {
        g.needs.forEach(place);
        place(g.id);
      }
    place(c.id);
    for (const g of plan.ghosts) if (g.needs.every((n) => placed.has(n))) place(g.id);
  }
  for (const g of plan.ghosts) place(g.id);
  return out;
}
