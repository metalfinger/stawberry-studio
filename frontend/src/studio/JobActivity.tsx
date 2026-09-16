import { useEffect, useState } from 'react';
import { Activity, Check, Clock, LoaderCircle, RefreshCw, Search, Square } from 'lucide-react';
import { api } from './types';
import type { Job, JobDetail, RecoveryPreview, Runtime } from './types';

export default function JobActivity({ job, provider, runtime, busy, action }: {
  job: Job; provider?: string; runtime: Runtime | null; busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [remoteId, setRemoteId] = useState('');
  const [preview, setPreview] = useState<RecoveryPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [decision, setDecision] = useState('');
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    void api<JobDetail>(`/jobs/${job.id}`).then(result => { if (!cancelled) { setDetail(result); setLoadError(''); } }).catch(e => { if (!cancelled) setLoadError(String(e)); });
    return () => { cancelled = true; };
  }, [expanded, job.id, job.updated_at]);
  const running = ['submitting', 'running', 'collecting'].includes(job.state);
  const waiting = job.state === 'queued' && (!runtime?.responsive || (provider === 'higgsfield' && !runtime.higgsfield_enabled));
  const age = Math.max(0, Math.floor(((running || job.state === 'queued' ? runtime?.checked_at ?? job.updated_at : job.updated_at) - job.created_at) / 60));
  return <div className="studio-job-activity">
    <div className="studio-job"><span className={`studio-job-state ${job.state}`}>
      {running ? <LoaderCircle className="studio-spin" size={14} /> : job.state === 'ready' ? <Check size={14} /> : job.state === 'queued' ? <Clock size={14} /> : <Activity size={14} />}
      {waiting ? 'Waiting for enabled worker' : job.state.replaceAll('_', ' ')}
    </span><small>{age < 1 ? 'Under 1 min' : `${age} min`} {running || job.state === 'queued' ? 'since queued' : 'from queue to last update'}</small>
      {job.error && <p className="studio-job-error">{job.error}</p>}
      {job.state === 'queued' && <button disabled={busy} onClick={() => void action(() => api(`/jobs/${job.id}/cancel`, {}))}><Square size={13} />Cancel queued job</button>}
      {job.state === 'collection_failed' && <button disabled={busy} onClick={() => void action(() => api(`/jobs/${job.id}/retry-collection`, {}))}><RefreshCw size={14} />Retry download</button>}
      <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Activity size={14} />Activity details</button>
    </div>
    {expanded && <div className="studio-job-detail">
      <small>Local job {job.id}</small>{job.provider_id && <p className="studio-muted">Remote job {job.provider_id}</p>}
      {loadError && <p role="alert" className="studio-job-error">{loadError}</p>}
      <ol className="studio-event-list">{detail?.events.map(event => <li key={event.sequence}>
        <small>{new Date(event.created_at * 1000).toLocaleTimeString()}</small><strong>{event.state.replaceAll('_', ' ')}</strong>
        {!!Object.keys(event.details).length && <details><summary>Event record</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details>}
      </li>)}</ol>
      {job.state === 'submission_unknown' && <div className="studio-recovery">
        <h3>Recover Existing Generation</h3>
        <label>Remote job ID<input value={remoteId} onChange={e => { setRemoteId(e.target.value); setPreview(null); setConfirmed(false); }} /></label>
        <button disabled={busy || !remoteId.trim()} onClick={() => void action(async () => {
          setPreview(null); setConfirmed(false);
          setPreview(await api<RecoveryPreview>(`/jobs/${job.id}/reconciliation?provider_id=${encodeURIComponent(remoteId.trim())}`));
        })}><Search size={14} />Inspect remote job</button>
        {preview && <>
          <dl className="studio-facts">{Object.entries(preview.checks).map(([key, matches]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd className={matches ? '' : 'studio-job-error'}>{matches ? 'Matches' : 'Does not match'}</dd></div>)}</dl>
          <details open><summary>Remote input record</summary><pre>{JSON.stringify(preview.remote.params, null, 2)}</pre></details>
          {preview.requires_reference_confirmation && <label className="studio-checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I verified the remote input images match this recipe in the same order.</label>}
          <label>Recovery decision<textarea value={decision} onChange={e => setDecision(e.target.value)} rows={2} /></label>
          <button disabled={busy || !preview.can_link || !decision.trim() || (preview.requires_reference_confirmation && !confirmed)} onClick={() => void action(async () => {
            await api(`/jobs/${job.id}/reconciliation`, { provider_id: preview.provider_id, fingerprint: preview.fingerprint, user_decision: decision.trim(), confirm_reference_match: confirmed });
            setPreview(null);
          })}><Check size={14} />Link existing job</button>
        </>}
      </div>}
    </div>}
  </div>;
}
