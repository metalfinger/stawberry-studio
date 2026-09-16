import { useEffect, useState } from 'react';
import { Columns2, X } from 'lucide-react';
import { api } from './types';
import type { Media, MediaDetail } from './types';
import { ReviewStatus } from './ProductionInspector';

export default function TakeComparison({ takes, selectedId, review }: {
  takes: Media[]; selectedId: string | null; review: (media: Media) => void;
}) {
  const [open, setOpen] = useState(false);
  const [leftId, setLeftId] = useState(selectedId ?? takes[0]?.id ?? '');
  const [rightId, setRightId] = useState(takes.find(t => t.id !== (selectedId ?? takes[0]?.id))?.id ?? '');
  if (takes.length < 2) return null;
  return <section className="studio-comparison" aria-label="Take comparison">
    <button aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={15} /> : <Columns2 size={15} />}{open ? 'Close comparison' : 'Compare takes'}</button>
    {open && <div className="studio-comparison-grid">
      <ComparisonSide label="A" value={leftId} other={rightId} setValue={setLeftId} takes={takes} selectedId={selectedId} review={review} />
      <ComparisonSide label="B" value={rightId} other={leftId} setValue={setRightId} takes={takes} selectedId={selectedId} review={review} />
    </div>}
  </section>;
}

function ComparisonSide({ label, value, other, setValue, takes, selectedId, review }: {
  label: string; value: string; other: string; setValue: (id: string) => void;
  takes: Media[]; selectedId: string | null; review: (media: Media) => void;
}) {
  const media = takes.find(t => t.id === value);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<MediaDetail>(`/media/${value}`).then(result => {
      if (active) { setDetail(result); setError(''); }
    }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [value]);
  const current = detail?.media.id === value ? detail : null;
  return <div className="studio-comparison-side">
    <label>Take {label}<select value={value} onChange={e => setValue(e.target.value)}>
      {takes.map(t => <option key={t.id} value={t.id} disabled={t.id === other}>{t.label}{t.id === selectedId ? ' (selected)' : ''}</option>)}
    </select></label>
    {media && <>
      <div className="studio-comparison-image">{media.mime_type.startsWith('video/')
        ? <video src={media.url} controls playsInline preload="metadata" />
        : <img src={media.url} alt={`Take ${label}: ${media.label}`} />}</div>
      <ReviewStatus review={media.review} />
      <button onClick={() => review(media)}>Review take {label}</button>
    </>}
    {error && <p role="alert" className="studio-job-error">{error}</p>}
    {current && <>
      <details><summary>Prompt and references {label}</summary>
        {current.recipe ? <><p>{current.recipe.spec.provider} / {current.recipe.spec.model}</p>
          <pre>{current.recipe.spec.prompt}</pre>
          <ol>{current.recipe.spec.references.map((ref, i) => <li key={`${ref.media_id}-${i}`}><strong>{ref.role}</strong>: {ref.instruction}<small>{ref.media_id}</small></li>)}</ol>
          <pre>{JSON.stringify(current.recipe.spec.settings, null, 2)}</pre>
        </> : <p>No generation recipe recorded for this imported take.</p>}
      </details>
      {!!current.feedback.length && <details><summary>Feedback {label} ({current.feedback.length})</summary>{current.feedback.map(f => <p key={f.id}>{f.text}</p>)}</details>}
    </>}
  </div>;
}
