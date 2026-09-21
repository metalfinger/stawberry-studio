import { useState } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { api } from './types';
import type { NodeDetail } from './types';

type Definition = {
  field: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'list' | 'boolean';
  options?: string[];
};

type Draft = {
  mode: 'inherit' | 'set' | 'clear';
  value: string;
};

const COMMON: Definition[] = [
  { field: 'style', label: 'Visual style' },
  { field: 'era', label: 'Era / period' },
];

const CAMERA: Definition[] = [
  { field: 'camera.framing', label: 'Framing' },
  { field: 'camera.angle', label: 'Camera angle' },
  { field: 'camera.movement', label: 'Camera movement' },
  { field: 'camera.height', label: 'Camera height' },
  { field: 'camera.lens', label: 'Lens' },
  { field: 'camera.depth_of_field', label: 'Depth of field' },
  { field: 'camera.foreground', label: 'Foreground' },
  { field: 'camera.background', label: 'Background' },
];

const IDENTITY: Definition[] = [
  { field: 'consistency_tokens', label: 'Consistency tokens (comma-separated, each a short phrase)', type: 'list' },
  { field: 'inspired_by', label: 'Inspired by (original reference, if recast)' },
];

const BY_KIND: Record<string, Definition[]> = {
  project: [
    { field: 'genre', label: 'Genre' },
    { field: 'tone', label: 'Tone' },
    {
      field: 'aspect_ratio',
      label: 'Aspect ratio',
      type: 'select',
      options: ['16:9', '9:16', '1:1', '4:3', '3:2', '2.39:1'],
    },
    { field: 'duration_seconds', label: 'Target duration (seconds)', type: 'number' },
    { field: 'world_logic', label: 'World logic' },
    { field: 'bible.palette_hex', label: 'Locked palette (#RRGGBB, comma-separated)', type: 'list' },
    { field: 'bible.tokens', label: 'Style tokens (comma-separated, concrete techniques)', type: 'list' },
    { field: 'bible.lighting_rules', label: 'Lighting rules' },
    { field: 'negative_prompts', label: 'Never show' },
    { field: 'policy.reference_depth_cap', label: 'Reference depth cap', type: 'number' },
    { field: 'policy.require_evaluation_for_reference', label: 'Require evaluation before reuse as reference', type: 'boolean' },
  ],
  scene: [
    { field: 'action', label: 'Scene action' },
    { field: 'story_time', label: 'Story time' },
    { field: 'weather', label: 'Weather' },
    { field: 'atmosphere', label: 'Atmosphere / effects' },
    { field: 'mood', label: 'Mood' },
    { field: 'lighting.source', label: 'Light source' },
    { field: 'lighting.color', label: 'Light color' },
    { field: 'lighting.direction', label: 'Light direction' },
    { field: 'set_decoration', label: 'Set decoration' },
    { field: 'sound.ambient', label: 'Ambient sound' },
  ],
  shot: [
    { field: 'action', label: 'Shot action' },
    { field: 'dialogue', label: 'Dialogue' },
    ...CAMERA,
    { field: 'duration_seconds', label: 'Duration (seconds)', type: 'number' },
  ],
  cut: [
    { field: 'action', label: 'Cut action' },
    { field: 'dialogue', label: 'Dialogue' },
    { field: 'beat.purpose', label: 'Beat: what this moment accomplishes' },
    { field: 'beat.emotional_intent', label: 'Beat: what the audience should feel' },
    { field: 'beat.visual_point', label: 'Beat: why it matters visually' },
    { field: 'beat.theme', label: 'Beat: what it advances' },
    { field: 'beat.type', label: 'Beat type' },
    { field: 'performance.expression', label: 'Expression' },
    { field: 'performance.body_language', label: 'Body language' },
    { field: 'performance.gaze', label: 'Gaze direction' },
    { field: 'performance.gesture', label: 'Gesture' },
    { field: 'performance.state', label: 'Character state' },
    ...CAMERA,
    { field: 'sound.sfx', label: 'Sound effects' },
    { field: 'sound.music', label: 'Music cue' },
    { field: 'transition', label: 'Transition out' },
    { field: 'chain_from_prev', label: 'Chain from previous cut', type: 'select', options: ['yes', 'no'] },
    { field: 'duration_seconds', label: 'Duration (seconds)', type: 'number' },
  ],
  character: [
    { field: 'identity', label: 'Identity description' },
    { field: 'appearance', label: 'Appearance' },
    { field: 'wardrobe', label: 'Wardrobe' },
    { field: 'distinctive_features', label: 'Distinctive features' },
    ...IDENTITY,
  ],
  location: [
    { field: 'geography', label: 'Geography / layout' },
    { field: 'materials', label: 'Materials' },
    { field: 'landmarks', label: 'Landmarks' },
    { field: 'story_time', label: 'Default story time' },
    ...IDENTITY,
  ],
  prop: [
    { field: 'identity', label: 'Prop identity' },
    { field: 'materials', label: 'Materials' },
    { field: 'dimensions', label: 'Dimensions / scale' },
    { field: 'distinctive_features', label: 'Distinctive features' },
    ...IDENTITY,
  ],
};

function definitionsFor(kind: string): Definition[] {
  return [...COMMON, ...(BY_KIND[kind] ?? [])].filter(
    (item, index, all) => all.findIndex(candidate => candidate.field === item.field) === index,
  );
}

function initialDrafts(detail: NodeDetail, definitions: Definition[]): Record<string, Draft> {
  return Object.fromEntries(definitions.map(definition => {
    const local = detail.node.fields[definition.field];
    const mode = local?.op === 'clear' ? 'clear' : local ? 'set' : 'inherit';
    const value = local?.value ?? detail.context.values[definition.field] ?? '';
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    return [definition.field, { mode, value: text } satisfies Draft];
  }));
}

export default function ContextEditor({ detail, busy, action }: {
  detail: NodeDetail;
  busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const definitions = definitionsFor(detail.node.kind);
  const initial = initialDrafts(detail, definitions);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [dirty, setDirty] = useState<string[]>([]);

  const update = (field: string, draft: Draft) => {
    setDrafts(previous => ({ ...previous, [field]: draft }));
    setDirty(previous => previous.includes(field) ? previous : [...previous, field]);
  };

  const save = () => action(async () => {
    const changes = Object.fromEntries(dirty.map(field => {
      const draft = drafts[field];
      const definition = definitions.find(item => item.field === field);
      const value = definition?.type === 'number' ? Number(draft.value)
        : definition?.type === 'boolean' ? draft.value === 'true'
        : definition?.type === 'list' ? draft.value.split(',').map(item => item.trim()).filter(Boolean)
        : draft.value.trim();
      return [field, draft.mode === 'set' ? { op: 'set', value } : { op: draft.mode }];
    }));
    await api(`/nodes/${detail.node.id}`, {
      expected_revision: detail.node.revision,
      changes,
      reason: 'User edited production details in viewer',
    }, 'PATCH');
    setOpen(false);
    setDirty([]);
  });

  const invalid = dirty.some(field => drafts[field].mode === 'set' && !drafts[field].value.trim());

  return <section className="studio-context-editor">
    <div className="studio-section-head">
      <h3>Production Details</h3>
      <button disabled={busy} onClick={() => setOpen(!open)}>
        {open ? <X size={14} /> : <SlidersHorizontal size={14} />}
        {open ? 'Close editor' : 'Edit details'}
      </button>
    </div>
    {!open ? <p className="studio-muted">
      Edit inherited and local filmmaking details without changing original source notes.
    </p> : <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {definitions.map(definition => {
        const draft = drafts[definition.field];
        const inherited = detail.context.values[definition.field];
        const origin = detail.context.provenance[definition.field];
        return <fieldset key={definition.field}>
          <legend>{definition.label}</legend>
          <div className="studio-field-mode">
            <label>
              <input type="radio" name={`${definition.field}-mode`} checked={draft.mode === 'inherit'} onChange={() => update(definition.field, { ...draft, mode: 'inherit' })} />
              Inherit
            </label>
            <label>
              <input type="radio" name={`${definition.field}-mode`} checked={draft.mode === 'set'} onChange={() => update(definition.field, { ...draft, mode: 'set' })} />
              Override
            </label>
            <label>
              <input type="radio" name={`${definition.field}-mode`} checked={draft.mode === 'clear'} onChange={() => update(definition.field, { ...draft, mode: 'clear' })} />
              Clear
            </label>
          </div>
          {draft.mode === 'set' && (definition.type === 'select' || definition.type === 'boolean'
            ? <select aria-label={definition.label} value={draft.value} onChange={event => update(definition.field, { ...draft, value: event.target.value })}>
              <option value="">Choose</option>
              {(definition.type === 'boolean' ? ['true', 'false'] : definition.options ?? []).map(option => <option key={option}>{option}</option>)}
            </select>
            : <input
              aria-label={definition.label}
              type={definition.type === 'number' ? 'number' : 'text'}
              min={definition.type === 'number' ? 0 : undefined}
              step={definition.type === 'number' ? 'any' : undefined}
              value={draft.value}
              onChange={event => update(definition.field, { ...draft, value: event.target.value })}
            />)}
          {draft.mode === 'inherit' && <small>
            {inherited === undefined ? 'No inherited value' : `Current inherited value: ${String(inherited)}`}
            {origin && origin.node_id !== detail.node.id ? ' / from parent' : ''}
          </small>}
          {draft.mode === 'clear' && <small>This node explicitly suppresses any inherited value.</small>}
        </fieldset>;
      })}
      <div className="studio-actions">
        <button className="studio-primary" disabled={busy || !dirty.length || invalid}>
          <Check size={14} />Save details
        </button>
        <button type="button" onClick={() => { setDrafts(initial); setDirty([]); setOpen(false); }}>
          <X size={14} />Cancel
        </button>
      </div>
    </form>}
  </section>;
}
