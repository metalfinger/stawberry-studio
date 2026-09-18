import { useMemo, useState } from 'react';
import { Check, Layers3 } from 'lucide-react';
import { api } from './types';
import type { Job, ProductionNode, Recipe } from './types';

export default function GenerationBatch({ recipes, jobs, nodes, busy, action }: {
  recipes: Recipe[]; jobs: Job[]; nodes: ProductionNode[]; busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const eligible = useMemo(() => recipes.filter(recipe =>
    recipe.fresh && !jobs.some(job => job.recipe_id === recipe.id)
    && recipe.spec.estimate?.credits != null
    && ['character', 'location', 'prop'].includes(nodes.find(node => node.id === recipe.node_id)?.kind ?? '')
  ), [recipes, jobs, nodes]);
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState('');
  const chosen = eligible.filter(recipe => selected.includes(recipe.id));
  const total = chosen.reduce((sum, recipe) => sum + (recipe.spec.estimate?.credits ?? 0), 0);
  if (!eligible.length) return null;
  return <section className="studio-generation-batch">
    <div className="studio-section-head"><div><h2><Layers3 size={17} />Generation Batch</h2><p>Approve only the frozen recipes you have reviewed. Each remains independently traceable.</p></div>
      <button onClick={() => setSelected(selected.length === eligible.length ? [] : eligible.map(recipe => recipe.id))}>{selected.length === eligible.length ? 'Clear all' : 'Select all eligible'}</button>
    </div>
    <div className="studio-batch-items">{eligible.map(recipe => {
      const node = nodes.find(item => item.id === recipe.node_id);
      const credits = recipe.spec.estimate?.credits ?? 0;
      return <label key={recipe.id}><input type="checkbox" checked={selected.includes(recipe.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, recipe.id] : previous.filter(id => id !== recipe.id))} />
        <span><strong>{node?.name ?? recipe.spec.intent}</strong><small>{recipe.spec.intent}</small></span><span>{credits} credits</span>
      </label>;
    })}</div>
    <label>Batch approval decision<textarea rows={2} value={decision} onChange={event => setDecision(event.target.value)} placeholder="Record what you reviewed and approved" /></label>
    <button className="studio-primary" disabled={busy || !chosen.length || !decision.trim()} onClick={() => void action(() => api('/generation-batches', {
      user_decision: decision.trim(),
      items: chosen.map(recipe => ({ recipe_id: recipe.id, fingerprint: recipe.fingerprint, max_credits: recipe.spec.estimate?.credits })),
    }))}><Check size={15} />Approve and queue {chosen.length} recipe{chosen.length === 1 ? '' : 's'} / estimated {total} credits</button>
    <p className="studio-muted">The estimate is rechecked immediately before submission. It is not a provider billing cap. No automatic retries.</p>
  </section>;
}
