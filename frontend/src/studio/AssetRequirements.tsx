import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { api } from './types';
import type { AssetRequirement, ProductionNode } from './types';

const blank = { kind: 'view', label: '', instruction: '', priority: 1 } as const;

export default function AssetRequirements({ asset, requirements, busy, action }: {
  asset: ProductionNode; requirements: AssetRequirement[]; busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ id?: string; kind: AssetRequirement['kind']; label: string; instruction: string; priority: number } | null>(null);
  const save = () => action(async () => {
    if (!draft) return;
    const body = { label: draft.label.trim(), instruction: draft.instruction.trim(), priority: draft.priority };
    if (draft.id) await api(`/requirements/${draft.id}`, body, 'PUT');
    else await api(`/assets/${asset.id}/requirements`, { ...body, kind: draft.kind });
    setDraft(null);
  });
  return <section className="studio-requirements">
    <div className="studio-section-head"><h3>Required Reference Coverage</h3>
      <button disabled={busy || !!draft} onClick={() => setDraft({ ...blank })}><Plus size={14} />Plan requirement</button>
    </div>
    <p className="studio-muted">Plan only the views, states and details this production needs. Coverage is confirmed during take review.</p>
    {requirements.map(requirement => <article key={requirement.id}>
      <div><span className="studio-tag">P{requirement.priority} {requirement.kind}</span>
        <strong>{requirement.label}</strong>
        {requirement.covered_by.length ? <span className="studio-covered"><Check size={13} />Covered by {requirement.covered_by.length} take{requirement.covered_by.length === 1 ? '' : 's'}</span> : <span className="studio-uncovered">Not covered</span>}
      </div>
      <p>{requirement.instruction}</p>
      <button disabled={busy || !!draft} title={`Edit ${requirement.label}`} onClick={() => setDraft({ ...requirement })}><Pencil size={13} />Edit</button>
    </article>)}
    {!requirements.length && <p>No reference requirements planned yet.</p>}
    {draft && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {!draft.id && <label>Requirement type<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as AssetRequirement['kind'] })}>
        <option value="view">View</option><option value="state">State</option><option value="detail">Detail</option><option value="scale">Scale</option>
      </select></label>}
      <label>Label<input value={draft.label} maxLength={120} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
      <label>What must this reference establish?<textarea value={draft.instruction} maxLength={1000} rows={3} onChange={event => setDraft({ ...draft, instruction: event.target.value })} /></label>
      <label>Priority<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: Number(event.target.value) })}>
        <option value={1}>P1 / required before cuts</option><option value={2}>P2 / generate when needed</option><option value={3}>P3 / optional coverage</option>
      </select></label>
      <div className="studio-actions"><button className="studio-primary" disabled={busy || !draft.label.trim() || !draft.instruction.trim()}><Check size={14} />Save requirement</button><button type="button" onClick={() => setDraft(null)}><X size={14} />Cancel</button></div>
    </form>}
  </section>;
}
