import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ChevronRight } from 'lucide-react';
import { api } from './types';
import type { NodeDetail, ProductionNode, Review } from './types';

export function ReviewStatus({ review }: { review: Review }) {
  const status = review.stale ? 'stale' : review.status === 'approved' && review.complete === false ? 'partial' : review.status;
  return <span className={`studio-review-status ${status}`}>{status === 'stale' ? 'Needs re-review' : status === 'pending' ? 'Awaiting review' : status === 'partial' ? 'Reference only' : status === 'approved' ? 'Approved' : 'Rejected'}</span>;
}

export default function ProductionInspector({ detail, nodes, busy, inspect, action }: {
  detail: NodeDetail; nodes: ProductionNode[]; busy: boolean;
  inspect: (node: ProductionNode) => void; action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const { production, values } = detail.context;
  const lookup = (id: string) => nodes.find(n => n.id === id);
  const describe = (value: unknown): string => typeof value === 'string' ? lookup(value)?.name ?? value : JSON.stringify(value);
  const nodeLink = (id: string, label?: string) => <button className="studio-node-link" onClick={() => { const node = lookup(id); if (node) inspect(node); }}>{label ?? lookup(id)?.name ?? id}<ChevronRight size={13} /></button>;
  const childKind = ({ project: 'scene', scene: 'shot', shot: 'cut' } as Record<string, string>)[detail.node.kind];
  const children = nodes.filter(n => n.parent_id === detail.node.id && n.kind === childKind).sort((a, b) => a.position - b.position);
  const move = (index: number, offset: number) => action(async () => {
    const ordered = children.map(n => n.id);
    [ordered[index], ordered[index + offset]] = [ordered[index + offset], ordered[index]];
    await api(`/nodes/${detail.node.id}/reorder`, {
      kind: childKind, ordered_ids: ordered, expected_revisions: Object.fromEntries(children.map(n => [n.id, n.revision])),
      reason: `User moved ${children[index].name} ${offset < 0 ? 'earlier' : 'later'} in the edit`,
    });
  });
  return <>
    {detail.node.kind === 'cut' && <>
      <section className="studio-readiness">
        <h3>{production.readiness.ready ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{production.readiness.ready ? 'Ready to prepare' : 'Needs attention'}</h3>
        {production.readiness.issues.map((issue, i) => <div className="studio-readiness-issue" key={`${issue.code}-${i}`}>
          <p>{issue.message}</p>{issue.node_id && issue.node_id !== detail.node.id && nodeLink(issue.node_id)}
        </div>)}
        {values.story_order !== undefined && <p className="studio-muted">Story beat {String(values.story_order)}</p>}
        {detail.warnings?.map((warning, i) => <p className="studio-muted" key={`${warning.code}-${i}`}>Advisory: {warning.message}</p>)}
      </section>
      <section><h3>In This Frame</h3>{production.assets.map(asset => <div className="studio-scope-row" key={asset.id}>
        <div><small>{asset.kind}</small>{nodeLink(asset.id, asset.name)}</div>
        <span className={`studio-review-status ${asset.selection?.status === 'approved' && !asset.selection.stale ? 'approved' : 'pending'}`}>
          {!asset.selection ? 'No selected reference' : asset.selection.stale ? 'Needs re-review' : asset.selection.status}
        </span>
      </div>)}{!production.assets.length && <p className="studio-muted">{production.readiness.issues.some(i => i.code === 'scope_missing') ? 'Frame requirements incomplete.' : 'No characters, location or props required.'}</p>}</section>
      {production.continuity && <section><h3>Continuity</h3>
        {production.continuity.sources.map(source => <div key={source.node_id}>{nodeLink(source.node_id, source.name)}</div>)}
        {!production.continuity.sources.length && <p className="studio-muted">No incoming cut dependency.</p>}
        {(['incoming', 'outgoing'] as const).map(direction => Object.keys(production.continuity![direction]).length > 0 && <details key={direction} open={direction === 'incoming'}>
          <summary>{direction === 'incoming' ? 'Entering state' : 'Leaving state'}</summary>
          <dl className="studio-facts">{Object.entries(production.continuity![direction]).map(([field, candidates]) => <div key={field}>
            <dt>{lookup(candidates[0].asset_id)?.name} / {candidates[0].attribute.replaceAll('_', ' ')}</dt>
            <dd>{[...new Set(candidates.map(item => describe(item.value)))].join(' / ')}
              {production.continuity!.conflicts.some(c => c.field === field) && <strong className="studio-job-error">Conflicting values</strong>}
            </dd></div>)}</dl>
        </details>)}
      </section>}
    </>}
    {detail.node.kind === 'project' && detail.warnings && detail.warnings.length > 0 && <section className="studio-readiness">
      <h3><AlertCircle size={16} />Advisory</h3>
      {detail.warnings.map((warning, i) => <p className="studio-muted" key={`${warning.code}-${i}`}>{warning.message}</p>)}
    </section>}
    {children.length > 0 && <section><h3>Editorial Order</h3><ol className="studio-order-list">{children.map((child, i) => <li key={child.id}>
      <span>{i + 1}</span>{nodeLink(child.id)}
      <button className="studio-icon" title={`Move ${child.name} earlier`} disabled={busy || i === 0} onClick={() => void move(i, -1)}><ArrowUp size={15} /></button>
      <button className="studio-icon" title={`Move ${child.name} later`} disabled={busy || i === children.length - 1} onClick={() => void move(i, 1)}><ArrowDown size={15} /></button>
    </li>)}</ol></section>}
  </>;
}
