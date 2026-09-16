import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from './types';
import type { Recipe } from './types';

export default function RecipeApproval({ recipe, busy, action }: {
  recipe: Recipe; busy: boolean; action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const amount = recipe.spec.estimate?.credits;
  const unknown = amount == null;
  const [acknowledged, setAcknowledged] = useState(false);
  const [limit, setLimit] = useState(String(amount ?? ''));
  const validLimit = limit.trim() !== '' && Number.isFinite(Number(limit)) && Number(limit) >= (amount ?? 0);
  return <div className="studio-approval">
    <p>{unknown ? 'Credit cost unavailable' : `Estimated ${amount} provider credits`}</p>
    {recipe.spec.estimate?.reason && <p className="studio-muted">{recipe.spec.estimate.reason}</p>}
    {recipe.spec.estimate?.settings_only_credits != null && unknown && <p className="studio-muted">Settings-only estimate: {recipe.spec.estimate.settings_only_credits} credits. Reference-input cost is unverified.</p>}
    {unknown ? <label className="studio-checkbox"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I approve this recipe despite the unknown credit cost.</label>
      : recipe.spec.provider !== 'fake' && <label>Estimate ceiling (credits)<input type="number" min={amount} step="any" value={limit} onChange={e => setLimit(e.target.value)} /></label>}
    <button className="studio-primary" disabled={busy || (unknown ? !acknowledged : !validLimit)} onClick={() => void action(async () => {
      await api(`/recipes/${recipe.id}/approval`, {
        fingerprint: recipe.fingerprint, user_decision: unknown ? 'User approved the exact displayed recipe and acknowledged unknown credit cost in the viewer' : 'User approved the exact displayed recipe and estimate ceiling in the viewer',
        allow_unknown_cost: unknown && acknowledged, max_credits: unknown ? null : Number(limit),
      });
      await api(`/recipes/${recipe.id}/jobs`, {});
    })}><Check size={16} />Approve and queue{recipe.spec.provider === 'higgsfield' ? ' (uses credits)' : ''}</button>
  </div>;
}
