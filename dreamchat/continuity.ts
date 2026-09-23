// The continuity plan: which earlier pictures each cut is drawn from, and the ghosts it needs.
//
// A storyboard has to read as one sequence, and frames drawn from the sheets alone look like
// the same world but not like a sequence. So every cut is drawn from the earlier cuts it has to
// match, chosen by the story (Jev's `from`) and by how the camera moves (same setup, same side,
// the other side, another place, or a jump the dream itself made). Where one edit would have to
// change too much at once, or several cuts need the same changed look, a ghost is made first:
// an in-between picture that is never a cut. Everything here is pure: the breakdown in, the plan
// out, and the same breakdown always gives the same plan.
import { type Breakdown, type Moment, type State, moments } from './producer';

export type Relation = 'same_setup' | 'same_side' | 'other_side' | 'other_place' | 'shift';
export type RefRole = 'base' | 'composition' | 'lighting' | 'identity' | 'prop' | 'location';

export type PlanRef = {
  /** A moment id or a ghost id. */
  id: string;
  kind: 'cut' | 'ghost';
  role: RefRole;
  relation?: Relation;
  /** What it gives this picture, in plain words for the prompt and the panel. */
  carries: string;
};

/** A continuity check for the judge: `with` is the earlier picture to compare against, if any. */
export type Criterion = { with: string | null; text: string };

export type CutPlan = {
  id: string;
  order: number;
  refs: PlanRef[];
  /** Changes still in force for what is in view, spelled out in the prompt. */
  states: State[];
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

/** Everything a picture shows that a lasting change can be seen on, its place included. */
export const inViewAt = (m: Moment) => new Set([...m.visible, ...m.things, ...(m.place ? [m.place] : [])]);

const CARRIES: Record<Relation, string> = {
  same_setup: 'the same view a moment earlier: the room, the light and where everyone is',
  same_side: 'the same place from the same side: where its walls, furniture and people are, and its light',
  other_side: 'the same place from the other side: its light, and how everyone looks; not its walls',
  other_place: 'how everyone in it looks right now; not its background',
  shift: 'the picture just before the dream jumps: its framing and where everyone is',
};

const ROLE: Record<Relation, RefRole> = {
  same_setup: 'composition',
  same_side: 'composition',
  other_side: 'lighting',
  other_place: 'identity',
  shift: 'composition',
};

export function planContinuity(b: Breakdown): ContinuityPlan {
  // A breakdown drafted before these fields existed plans as if nothing lasting changes.
  const ms = moments(b).map((m) => ({
    ...m,
    looks_at: m.looks_at ?? '',
    shift: m.shift ?? '',
    leaves: m.leaves ?? [],
  }));
  const index = new Map(ms.map((m, i) => [m.id, i]));
  const byId = new Map(ms.map((m) => [m.id, m]));
  const names = new Map<string, string>([...b.people, ...b.places, ...b.things].map((x) => [x.id, x.name]));
  const name = (id: string) => names.get(id) ?? id;
  const no = (id: string) => (index.get(id) ?? 0) + 1;
  const kindOf = (id: string): 'person' | 'place' | 'thing' =>
    b.places.some((p) => p.id === id) ? 'place' : b.things.some((t) => t.id === id) ? 'thing' : 'person';

  // Which earlier moments face the same side of the place: Jev's answer, or the same words.
  const sides = (m: Moment, e: Moment) =>
    m.sameSide
      ? m.sameSide.includes(e.id)
      : e.place === m.place && (!e.looks_at || !m.looks_at || sameWords(e.looks_at, m.looks_at));
  const relation = (m: Moment, e: Moment): Relation => {
    if (m.shift && index.get(e.id) === (index.get(m.id) ?? 0) - 1) return 'shift';
    if (!m.place || e.place !== m.place) return 'other_place';
    if (!sides(m, e)) return 'other_side';
    return e.distance === m.distance && e.eyes === m.eyes ? 'same_setup' : 'same_side';
  };

  const baseRun = new Map<string, number>();
  const cuts: CutPlan[] = ms.map((m, i) => {
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
      matchFrame = ms[i - 1].id;
    }

    // 2. The story's own link, in the role the camera move allows.
    const from = m.from ? byId.get(m.from) : undefined;
    if (from && index.get(from.id)! < i) {
      const r = rel.get(from.id) as Relation;
      add(from, ROLE[r], r);
    }

    // 3. The room: when nothing yet shows this place from this side, the widest cut that does.
    const inPlace = (r: PlanRef) => r.relation === 'same_setup' || r.relation === 'same_side';
    if (m.place && !refs.some(inPlace)) {
      const anchor = earlier
        .filter((e) => rel.get(e.id) === 'same_side' || rel.get(e.id) === 'same_setup')
        .sort((x, y) => WIDTH[y.distance] - WIDTH[x.distance] || index.get(y.id)! - index.get(x.id)!)[0];
      if (anchor) add(anchor, 'composition', rel.get(anchor.id) as Relation, CARRIES.same_side);
    }

    // The location sheet shows the place from one side: the side its first picture faces.
    const first = ms.find((e) => e.place === m.place);
    const sheetLayout = !first || first === m || sides(m, first);

    return {
      id: m.id,
      order: i + 1,
      refs,
      states: m.states ?? [],
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
      return (
        r.relation !== 'shift' && index.get(r.id)! >= index.get(st.since)! && inViewAt(byId.get(r.id)!).has(st.who)
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
  const dreamer = b.people.find((p) => p.is_dreamer)?.id;
  const addGhostRef = (c: CutPlan, g: GhostPlan, st: State) =>
    c.refs.push({
      id: g.id,
      kind: 'ghost',
      role: roleFor(st.who),
      carries: `how ${name(st.who)} looks now: ${st.what} ${st.now}`,
    });
  const stateGhost = (state: State, users: CutPlan[], why: string): GhostPlan => {
    const at = byId.get(state.since)!;
    // The change's own picture shows how it looks, even through the dreamer's eyes (their hands).
    const seen = inViewAt(at).has(state.who) || (state.who === dreamer && at.eyes === 'dreamer');
    const g: GhostPlan = {
      id: `g${ghosts.length + 1}`,
      kind: 'state',
      of: state.who,
      label: `${name(state.who)}, ${state.what} now ${state.now}`,
      change: `${name(state.who)}'s ${state.what} is now ${state.now}`,
      from: seen ? at.id : null,
      needs: seen ? [at.id] : [],
      usedBy: users.map((c) => c.id),
      why,
      state,
      depth: 0,
    };
    ghosts.push(g);
    return g;
  };

  // State ghosts, for reuse: a change that happened out of view (no picture of the moment shows
  // who changed) and is then seen in two or more cuts. Otherwise the first of them would invent
  // the look inside a whole scene and the rest copy that; a ghost invents it once, on its own,
  // as one edit of the sheet, and every picture takes the same look from it.
  const byState = new Map<string, { state: State; cuts: CutPlan[] }>();
  for (const c of cuts)
    for (const st of c.states) {
      const entry = byState.get(stateKey(st)) ?? { state: st, cuts: [] };
      entry.cuts.push(c);
      byState.set(stateKey(st), entry);
    }
  for (const { state, cuts: users } of byState.values()) {
    if (users.length < 2 || inViewAt(byId.get(state.since)!).has(state.who)) continue;
    const g = stateGhost(
      state,
      users,
      `${name(state.who)} changes out of view at picture ${no(state.since)}, then pictures ${users.map((c) => c.order).join(', ')} show it`,
    );
    for (const c of users) if (!carriedBy(c, state)) addGhostRef(c, g, state);
  }

  // Changed looks still not carried are taken from the latest earlier cut that shows them, while
  // there is room for one more reference. It costs nothing: that cut is drawn already.
  for (const c of cuts)
    for (const st of c.states) {
      if (carriedBy(c, st) || c.refs.length >= MAX_EARLIER) continue;
      const shows = ms
        .slice(index.get(st.since)!, c.order - 1)
        .filter((e) => inViewAt(e).has(st.who))
        .at(-1);
      if (shows)
        c.refs.push({
          id: shows.id,
          kind: 'cut',
          role: roleFor(st.who),
          relation: relation(byId.get(c.id)!, shows),
          carries: `how ${name(st.who)} looks now (${st.what} ${st.now}); nothing else from it`,
        });
    }
  for (const c of cuts) c.changes = countChanges(c);

  // State ghosts, for one edit at a time: a cut that would still change three or more things
  // takes its uncarried change out into a ghost first.
  for (const c of cuts) {
    if (c.changes.length < TOO_MANY) continue;
    const st = c.states.find((x) => !carriedBy(c, x));
    if (!st) continue;
    addGhostRef(
      c,
      stateGhost(st, [c], `picture ${c.order} would otherwise change ${c.changes.length} things at once`),
      st,
    );
    c.changes = countChanges(c);
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
      cutOf
        .get(id)!
        .refs.push({
          id: g.id,
          kind: 'ghost',
          role: 'location',
          carries: `${name(m.place)} from the side this picture faces`,
        });
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
      const people = e.visible.filter((p) => m.visible.includes(p)).map(name);
      if (r.relation === 'same_setup')
        out.push({
          with: r.id,
          text: 'Is the second picture the same view as the first, a moment later: the same place from the same side, in the same light?',
        });
      if (r.relation === 'same_side')
        out.push({
          with: r.id,
          text: `Do both pictures show ${name(m.place)} from the same side, with its walls, windows and furniture in the same places?`,
        });
      if (r.relation === 'other_side' || r.relation === 'same_side' || r.relation === 'same_setup')
        out.push({
          with: r.id,
          text: 'Is the light the same in both pictures: the same time of day and the same light sources?',
        });
      if (r.relation === 'shift')
        out.push({ with: r.id, text: `Does the second picture keep the first one's framing, while ${m.shift}?` });
      for (const p of people)
        out.push({ with: r.id, text: `Is ${p} the same person in both pictures: the same face, hair and clothes?` });
    }
    for (const st of c.states)
      out.push({ with: null, text: `In this picture, is ${name(st.who)}'s ${st.what} ${st.now}?` });
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
    for (const st of c.states)
      if (!carriedBy(c, st))
        issues.push(`picture ${c.order}: ${name(st.who)}'s ${st.what} (${st.now}) is carried in words only`);
  }
  for (const g of ghosts)
    for (const n of g.needs) if (!cutOf.has(n)) issues.push(`ghost ${g.id} needs ${n}, which is not a picture`);
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
