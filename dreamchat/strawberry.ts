// Writes a confirmed breakdown into Strawberry Studio through its own JSON CLI, the same
// door the host assistant uses. Always into an isolated store, never the shared live one.
//
// Every value is patched with its origin. What the person said is sourced to their own words,
// captured as an instruction. What the producer filled in is sourced to a proposal, so it is
// never presented as the person's decision (WORKFLOW_RULES.md: "Missing facts are unknown,
// not invented defaults presented as user decisions").
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planContinuity } from './continuity';
import type { Breakdown, Detail, State, StyleOption } from './producer';

export const REPO = resolve(import.meta.dir, '..');
export const STRAWBERRY_PYTHON = process.env.STRAWBERRY_PYTHON ?? join(REPO, 'venv', 'bin', 'python');
export const STRAWBERRY_HOME = process.env.DREAMCHAT_STRAWBERRY_HOME ?? join(import.meta.dir, 'strawberry-home');

type Kind = 'project' | 'scene' | 'shot' | 'cut' | 'character' | 'location' | 'prop';
/** A value, or a `$ref` to a node or source created earlier in the same plan. */
type Value = string | number | boolean | null | Value[] | { [key: string]: Value };

export type Op =
  | { op: 'create'; ref: string; kind: Kind; name: string; parent?: string; notes?: string }
  | {
      op: 'capture';
      ref: string;
      node: string;
      text: string;
      author: 'user' | 'assistant';
      status: 'instruction' | 'proposal';
    }
  | { op: 'patch'; node: string; changes: Record<string, Value>; source: string; reason: string }
  | { op: 'requirement'; ref: string; node: string; kind: 'state' | 'view'; label: string; instruction: string };

const FRAMING = { close: 'close', medium: 'medium', wide: 'wide' } as const;
const LINKS = new Set(['visible_cast', 'required_props', 'location_id', 'continuity_from', 'match_frame']);
/** Fields keyed by asset: the keys are references, the values text. */
const STATES = new Set(['continuity.before', 'continuity.after']);

/** Strawberry's state attributes are lower_case names: "left hand" is `left_hand`. */
const attribute = (what: string) => {
  const slug = what
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(slug) ? slug : `x_${slug || 'state'}`;
};

/** States as Strawberry keeps them: `{ asset: { attribute: value } }`. */
function stateMap(states: Pick<State, 'who' | 'what' | 'now'>[]): Record<string, Record<string, Value>> {
  const out: Record<string, Record<string, Value>> = {};
  for (const st of states) (out[`$${st.who}`] ??= {})[attribute(st.what)] = st.now;
  return out;
}

function split(fields: Record<string, Detail>): { said: Record<string, Value>; guessed: Record<string, Value> } {
  const said: Record<string, Value> = {};
  const guessed: Record<string, Value> = {};
  for (const [k, d] of Object.entries(fields)) if (d.value) (d.said ? said : guessed)[k] = d.value;
  return { said, guessed };
}

function patches(node: string, fields: Record<string, Detail>, what: string): Op[] {
  const { said, guessed } = split(fields);
  const out: Op[] = [];
  if (Object.keys(said).length)
    out.push({ op: 'patch', node, changes: said, source: '$said', reason: `${what}, as they told it` });
  if (Object.keys(guessed).length)
    out.push({ op: 'patch', node, changes: guessed, source: '$proposal', reason: `${what}, proposed; to confirm` });
  return out;
}

/** The whole production as an ordered list of engine calls. Pure, so it can be tested. */
export function planWrites(b: Breakdown, style: StyleOption, transcript: string): Op[] {
  const ops: Op[] = [
    { op: 'create', ref: '$project', kind: 'project', name: b.title.slice(0, 240), notes: b.logline },
    { op: 'capture', ref: '$said', node: '$project', text: transcript, author: 'user', status: 'instruction' },
    {
      op: 'capture',
      ref: '$proposal',
      node: '$project',
      text: 'Filled in from the conversation where the person did not say it; to be confirmed with them.',
      author: 'assistant',
      status: 'proposal',
    },
    {
      op: 'patch',
      node: '$project',
      source: '$said',
      reason: 'The way they chose to have it drawn',
      changes: {
        style: `${style.name}: ${style.line}`.slice(0, 600),
        'bible.tokens': style.tokens,
        'bible.palette_hex': style.palette_hex,
        'bible.lighting_rules': style.lighting_rules,
      },
    },
  ];
  if (b.world_logic)
    ops.push({
      op: 'patch',
      node: '$project',
      source: '$proposal',
      reason: 'What their dream simply accepted',
      changes: { world_logic: b.world_logic },
    });

  for (const p of b.people) {
    ops.push({ op: 'create', ref: `$${p.id}`, kind: 'character', name: p.name, parent: '$project' });
    ops.push(...patches(`$${p.id}`, p.fields, p.name));
  }
  for (const l of b.places) {
    ops.push({ op: 'create', ref: `$${l.id}`, kind: 'location', name: l.name, parent: '$project' });
    ops.push(...patches(`$${l.id}`, l.fields, l.name));
  }
  for (const t of b.things) {
    ops.push({ op: 'create', ref: `$${t.id}`, kind: 'prop', name: t.name, parent: '$project' });
    ops.push(...patches(`$${t.id}`, t.fields, t.name));
  }

  // Ghosts are planned coverage on the asset they show, covered by the ghost's take once drawn.
  const plan = planContinuity(b);
  const planOf = new Map(plan.cuts.map((c) => [c.id, c]));
  for (const g of plan.ghosts)
    ops.push({
      op: 'requirement',
      ref: `$${g.id}`,
      node: `$${g.of}`,
      kind: g.kind,
      label: g.label.slice(0, 120),
      instruction: `${g.change}. Needed because ${g.why}.`.slice(0, 1000),
    });

  let order = 0;
  for (const s of b.scenes) {
    ops.push({ op: 'create', ref: `$${s.id}`, kind: 'scene', name: s.title || s.id, parent: '$project' });
    if (s.mood)
      ops.push({ op: 'patch', node: `$${s.id}`, changes: { mood: s.mood }, source: '$proposal', reason: 'Mood' });
    for (const m of s.moments) {
      order += 1;
      const name = m.action.slice(0, 80);
      // One shot per moment for now: each moment is its own picture with its own framing.
      ops.push({ op: 'create', ref: `$shot_${m.id}`, kind: 'shot', name, parent: `$${s.id}` });
      ops.push({
        op: 'patch',
        node: `$shot_${m.id}`,
        source: '$proposal',
        reason: 'Framing',
        changes: {
          'camera.framing': FRAMING[m.distance],
          'camera.angle':
            m.eyes === 'dreamer'
              ? "first person, through the dreamer's eyes"
              : 'eye level, the dreamer seen from outside',
        },
      });
      ops.push({ op: 'create', ref: `$${m.id}`, kind: 'cut', name, parent: `$shot_${m.id}`, notes: m.action });
      const cut: Record<string, Value> = {
        action: m.action,
        visible_cast: m.visible.map((id) => `$${id}`),
        required_props: m.things.map((id) => `$${id}`),
        story_order: order,
      };
      if (m.place) cut.location_id = `$${m.place}`;
      if (m.feeling) cut['beat.emotional_intent'] = m.feeling;
      if (m.visual_point) cut['beat.visual_point'] = m.visual_point;
      if (m.purpose) cut['beat.purpose'] = m.purpose;
      // The continuity plan: every earlier cut it is drawn from, the states it carries in and
      // leaves behind, and how it follows the one before.
      const cp = planOf.get(m.id);
      const from = (cp?.refs ?? []).filter((r) => r.kind === 'cut').map((r) => `$${r.id}`);
      if (from.length) cut.continuity_from = from;
      if (cp?.states.length) cut['continuity.before'] = stateMap(cp.states);
      if (m.leaves?.length) cut['continuity.after'] = stateMap(m.leaves);
      if (cp?.transition) cut.transition = cp.transition;
      if (cp?.matchFrame) cut.match_frame = `$${cp.matchFrame}`;
      if (m.key) cut['beat.type'] = 'key moment';
      ops.push({
        op: 'patch',
        node: `$${m.id}`,
        changes: cut,
        source: m.said ? '$said' : '$proposal',
        reason: m.said ? 'The moment as they told it' : 'A moment proposed between the ones they told; to confirm',
      });
    }
  }
  return ops;
}

export type WriteResult = {
  projectId: string;
  /** Every node and source written, by the breakdown's id ("p1", "m3", "said", "proposal"). */
  ids: Record<string, string>;
  home: string;
  created: Record<Kind, number>;
  cuts: number;
  /** Cuts the engine reports as ready to prepare a picture for. */
  readyCuts: number;
  issues: string[];
  ms: number;
};

export async function cli(args: string[], input?: unknown): Promise<unknown> {
  const proc = Bun.spawn([STRAWBERRY_PYTHON, '-m', 'backend.studio', '--home', STRAWBERRY_HOME, ...args], {
    cwd: REPO,
    stdin: input === undefined ? 'ignore' : new Blob([JSON.stringify(input)]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`strawberry ${args.join(' ')}: ${(err || out).trim().slice(0, 400)}`);
  return JSON.parse(out);
}

const call = (operation: string, body: unknown) => cli(['call', operation, '-'], body);

export async function writeProduction(b: Breakdown, style: StyleOption, transcript: string): Promise<WriteResult> {
  const t0 = Date.now();
  const ids = new Map<string, string>();
  const revisions = new Map<string, number>();
  const created: Record<Kind, number> = { project: 0, scene: 0, shot: 0, cut: 0, character: 0, location: 0, prop: 0 };
  const resolveRef = (v: Value): Value => {
    if (typeof v === 'string' && v.startsWith('$')) {
      const id = ids.get(v);
      if (!id) throw new Error(`unresolved reference ${v}`);
      return id;
    }
    return Array.isArray(v) ? v.map(resolveRef) : v;
  };

  for (const op of planWrites(b, style, transcript)) {
    if (op.op === 'create') {
      const node = (await call('create', {
        kind: op.kind,
        name: op.name,
        parent_id: op.parent ? resolveRef(op.parent) : null,
        notes: op.notes ?? '',
      })) as { id: string; revision: number };
      ids.set(op.ref, node.id);
      revisions.set(node.id, node.revision);
      created[op.kind] += 1;
    } else if (op.op === 'capture') {
      const source = (await call('capture', {
        id: resolveRef(op.node),
        request: { text: op.text, author: op.author, status: op.status },
      })) as { id: string };
      ids.set(op.ref, source.id);
      // Capturing a source is itself a revision of the node it is captured on.
      const node = resolveRef(op.node) as string;
      revisions.set(node, (revisions.get(node) ?? 1) + 1);
    } else if (op.op === 'requirement') {
      const node = resolveRef(op.node) as string;
      const req = (await call('create_requirement', {
        id: node,
        request: { kind: op.kind, label: op.label, instruction: op.instruction, priority: 1 },
      })) as { id: string };
      ids.set(op.ref, req.id);
      // A planned requirement is itself a revision of its asset.
      revisions.set(node, (revisions.get(node) ?? 1) + 1);
    } else {
      const id = resolveRef(op.node) as string;
      const changes: Record<string, { op: 'set'; value: Value }> = {};
      // Link fields hold references, and state fields are keyed by them; any other value is text.
      for (const [k, v] of Object.entries(op.changes))
        changes[k] = {
          op: 'set',
          value: LINKS.has(k)
            ? resolveRef(v)
            : STATES.has(k) && v && typeof v === 'object' && !Array.isArray(v)
              ? Object.fromEntries(Object.entries(v).map(([asset, facts]) => [resolveRef(asset) as string, facts]))
              : v,
        };
      const node = (await call('patch', {
        id,
        request: {
          expected_revision: revisions.get(id),
          changes,
          source_id: resolveRef(op.source),
          reason: op.reason,
        },
      })) as { revision: number };
      revisions.set(id, node.revision);
    }
  }

  const projectId = ids.get('$project') as string;
  // What the engine itself thinks of the result: cuts ready to prepare, and anything missing.
  const workflow = (await call('workflow', { id: projectId })) as {
    cuts?: { ready_to_prepare?: boolean; issues?: { code: string; message: string }[] }[];
  };
  const cuts = workflow.cuts ?? [];
  const issues = [...new Set(cuts.flatMap((c) => (c.issues ?? []).map((i) => `${i.code}: ${i.message}`)))];
  return {
    projectId,
    ids: Object.fromEntries([...ids].map(([ref, id]) => [ref.slice(1), id])),
    home: STRAWBERRY_HOME,
    created,
    cuts: cuts.length,
    readyCuts: cuts.filter((c) => c.ready_to_prepare).length,
    issues,
    ms: Date.now() - t0,
  };
}

export function strawberryAvailable(): boolean {
  return existsSync(STRAWBERRY_PYTHON);
}
