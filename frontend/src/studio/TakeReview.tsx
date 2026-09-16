import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from './types';
import type { MediaDetail, ProductionNode } from './types';
import { ReviewStatus } from './ProductionInspector';

export default function TakeReview({ detail, nodes, busy, action, reviewed }: {
  detail: MediaDetail; nodes: ProductionNode[]; busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>; reviewed: (detail: MediaDetail) => void;
}) {
  const owner = nodes.find(n => n.id === detail.media.node_id);
  const assets = nodes.filter(n => ['character', 'location', 'prop'].includes(n.kind));
  const ownsAsset = !!owner && assets.some(a => a.id === owner.id);
  // Requested subjects are not evidence of what actually appears in the image.
  const [subjects, setSubjects] = useState<string[]>(detail.media.review.depicted_assets);
  const [decision, setDecision] = useState('');
  const save = (status: 'approved' | 'rejected', select: boolean) => action(async () => {
    await api(`/media/${detail.media.id}/review`, {
      expected_revision: detail.media.review.revision, expected_context: detail.review_context,
      status, user_decision: decision.trim(), depicted_assets: subjects,
    });
    reviewed(await api<MediaDetail>(`/media/${detail.media.id}`));
    if (select && owner) await api(`/nodes/${owner.id}/selection`, { media_id: detail.media.id, expected_revision: owner.revision });
  });
  return <section className="studio-take-review">
    <h3>Visual Review <ReviewStatus review={detail.media.review} /></h3>
    {assets.length > 0 && <fieldset><legend>Confirmed visible assets</legend>
      <div className="studio-subjects">{assets.map(asset => <label key={asset.id}>
        <input type="checkbox" disabled={busy || (ownsAsset && asset.id === owner?.id)}
          checked={(ownsAsset && asset.id === owner?.id) || subjects.includes(asset.id)}
          onChange={event => setSubjects(previous => event.target.checked ? [...previous, asset.id] : previous.filter(id => id !== asset.id))} />
        <span>{asset.name}<small>{asset.kind}</small></span>
      </label>)}</div>
    </fieldset>}
    <label htmlFor="review-decision">Review decision</label>
    <textarea id="review-decision" rows={2} value={decision} onChange={e => setDecision(e.target.value)} disabled={busy} />
    <div className="studio-actions">
      <button className="studio-primary" disabled={busy || !decision.trim() || !owner} onClick={() => void save('approved', true)}><Check size={15} />Approve and use</button>
      <button disabled={busy || !decision.trim()} onClick={() => void save('approved', false)}><Check size={15} />Approve reference</button>
      <button disabled={busy || !decision.trim()} onClick={() => void save('rejected', false)}><X size={15} />Reject</button>
    </div>
    {detail.review_history.length > 0 && <details><summary>Review history ({detail.review_history.length})</summary>
      {detail.review_history.map(review => <div className="studio-review-history" key={review.revision}>
        <small>Review {review.revision} / {review.created_at && new Date(review.created_at * 1000).toLocaleString()}</small>
        <ReviewStatus review={review} /><p className="studio-notes">{review.user_decision}</p>
        {review.depicted_assets.length > 0 && <p className="studio-muted">{review.depicted_assets.map(id => assets.find(a => a.id === id)?.name ?? id).join(', ')}</p>}
      </div>)}
    </details>}
  </section>;
}
