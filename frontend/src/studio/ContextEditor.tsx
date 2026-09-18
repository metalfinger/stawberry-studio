import { useState } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { api } from './types';
import type { NodeDetail } from './types';

type Definition = {
  field: string;
  label: string;
  type?: 'text' | 'number' | 'select';
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
  ],
  scene: [
    { field: 'action', label: 'Scene action' },
    { field: 'story_time', label: 'Story time' },
    { field: 'weather', label: 'Weather / atmosphere' },
    { field: 'lighting.color', label: 'Light color' },
    { field: 'lighting.direction', label: 'Light direction' },
  ],
  shot: [
    { field: 'action', label: 'Shot action' },
    { field: 'dialogue', label: 'Dialogue' },
    { field: 'camera.framing', label: 'Framing' },
    { field: 'camera.angle', label: 'Camera angle' },
    { field: 'camera.movement', label: 'Camera movement' },
    { field: 'duration_seconds', label: 'Duration (seconds)', type: 'number' },
  ],
  cut: [
    { field: 'action', label: 'Cut action' },
    { field: 'dialogue', label: 'Dialogue' },
    { field: 'camera.framing', label: 'Framing' },
    { field: 'camera.angle', label: 'Camera angle' },
    { field: 'camera.movement', label: 'Camera movement' },
    { field: 'duration_seconds', label: 'Duration (seconds)', type: 'number' },
  ],
  character: [
    { field: 'identity', label: 'Identity description' },
    { field: 'appearance', label: 'Appearance' },
    { field: 'wardrobe', label: 'Wardrobe' },
    { field: 'distinctive_features', label: 'Distinctive features' },
  ],
  location: [
    { field: 'geography', label: 'Geography / layout' },
    { field: 'materials', label: 'Materials' },
    { field: 'landmarks', label: 'Landmarks' },
    { field: 'story_time', label: 'Default story time' },
  ],
  prop: [
    { field: 'identity', label: 'Prop identity' },
    { field: 'materials', label: 'Materials' },
    { field: 'dimensions', label: 'Dimensions / scale' },
    { field: 'distinctive_features', label: 'Distinctive features' },
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
    return [definition.field, { mode, value: String(value) } satisfies Draft];
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
      const value = definition?.type === 'number' ? Number(draft.value) : draft.value.trim();
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
          {draft.mode === 'set' && (definition.type === 'select'
            ? <select aria-label={definition.label} value={draft.value} onChange={event => update(definition.field, { ...draft, value: event.target.value })}>
              <option value="">Choose</option>
              {definition.options?.map(option => <option key={option}>{option}</option>)}
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
