import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Check, ChevronRight, Clapperboard, FileText, Images, LoaderCircle, Menu, Plus, RefreshCw, Save, X } from 'lucide-react';
import { api } from './types';
import type { Job, Media, MediaDetail, NodeDetail, ProductionNode, ProjectData, Recipe } from './types';
import ProductionInspector, { ReviewStatus } from './ProductionInspector';
import TakeReview from './TakeReview';
import './studio.css';

function Visual({ media, interactive = false }: { media?: Media; interactive?: boolean }) {
  if (!media) return <div className="studio-empty-frame"><Clapperboard size={30} /><span>No take</span></div>;
  return media.mime_type.startsWith('video/')
    ? <video src={media.url} controls={interactive} muted={!interactive} playsInline preload="metadata" />
    : <img src={media.url} alt={media.label} loading="lazy" />;
}

export default function StudioWorkspace() {
  const { projectId } = useParams();
  return <Workspace key={projectId ?? 'projects'} projectId={projectId} />;
}

function Workspace({ projectId }: { projectId?: string }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProductionNode[]>([]);
  const [data, setData] = useState<ProjectData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [tab, setTab] = useState<'storyboard' | 'assets' | 'activity'>('storyboard');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [noteDraft, setNoteDraft] = useState<{ text: string; revision: number } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [focusedMedia, setFocusedMedia] = useState<Media | null>(null);
  const [mediaDetail, setMediaDetail] = useState<MediaDetail | null>(null);
  const [notice, setNotice] = useState('');
  const [treeOpen, setTreeOpen] = useState(false);
  const projectName = data?.project.name;
  const readSequence = useRef(0);

  useEffect(() => { document.title = projectName ? `${projectName} | Strawberry Studio` : 'Strawberry Studio'; }, [projectName]);

  useEffect(() => {
    let cancelled = false;
    setFeedback(''); setMediaDetail(null);
    if (focusedMedia) void api<MediaDetail>(`/media/${focusedMedia.id}`).then(result => {
      if (!cancelled) setMediaDetail(result);
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [focusedMedia]);

  useEffect(() => {
    if (!focusedMedia) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('.studio-modal');
    modal?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusedMedia(null);
      if (event.key !== 'Tab' || !modal) return;
      const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), video[controls], summary')].filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [focusedMedia]);

  const refresh = useCallback(async (isActive: () => boolean = () => true) => {
    const sequence = ++readSequence.current;
    if (!projectId) {
      const result = await api<ProductionNode[]>('/projects');
      if (sequence === readSequence.current && isActive()) setProjects(result);
    } else {
      const result = await api<ProjectData>(`/projects/${projectId}`);
      const node = selected ? await api<NodeDetail>(`/nodes/${selected}`) : null;
      if (sequence === readSequence.current && isActive()) { setData(result); setDetail(node); }
    }
  }, [projectId, selected]);

  useEffect(() => {
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        await refresh(() => !cancelled);
      } catch (e) { if (!cancelled) setError(String(e)); }
      finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [refresh]);

  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const selectNode = (node: ProductionNode) => {
    setSelected(node.id); setDetail(null); setNoteDraft(null); setFeedback(''); setTreeOpen(false);
  };
  const findNode = (id: string) => data?.nodes.find(n => n.id === id);
  const findMedia = (id: string | null) => data?.media.find(m => m.id === id);
  const fieldValue = (value: unknown): string => {
    if (typeof value === 'string') return findNode(value)?.name ?? value;
    if (Array.isArray(value)) return value.length ? value.map(fieldValue).join(', ') : 'None';
    return JSON.stringify(value);
  };
  const nodePath = (node: ProductionNode): number[] => {
    const parent = node.parent_id ? findNode(node.parent_id) : null;
    return [...(parent ? nodePath(parent) : []), node.position];
  };
  const sequence = (data?.nodes.filter(n => n.kind === 'cut') ?? []).sort((a, b) => {
    const x = nodePath(a), y = nodePath(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0); }
    return 0;
  });
  const assets = data?.nodes.filter(n => ['character', 'location', 'prop'].includes(n.kind)) ?? [];
  const nodeRecipes = data?.recipes.filter(r => r.node_id === selected) ?? [];
  const activeJobs = data?.jobs.filter(j => ['queued', 'submitting', 'running', 'collecting'].includes(j.state)).length ?? 0;

  const recipeView = (recipe: Recipe) => {
    const job = data?.jobs.find(j => j.recipe_id === recipe.id);
    return <details className="studio-recipe" key={recipe.id}>
      <summary><FileText size={15} />{recipe.spec.intent}<span className="studio-tag">{job?.state ?? (recipe.approved_at ? 'approved' : 'review')}</span></summary>
      <div className="studio-recipe-body">
        <p className="studio-muted">{recipe.spec.provider} / {recipe.spec.model}</p>
        {recipe.spec.provider === 'fake' && <p className="studio-test-label">Offline test. No generation credits.</p>}
        <ol className="studio-reference-list">{recipe.spec.references.map((ref, i) => <li key={`${ref.media_id}-${i}`}>
          <button title="Inspect reference" onClick={() => setFocusedMedia(findMedia(ref.media_id) ?? null)}><Visual media={findMedia(ref.media_id)} /></button>
          <div><strong>{i + 1}. {ref.role}</strong><p>{ref.instruction}</p>{!!ref.subjects?.length && <small>{ref.subjects.map(id => findNode(id)?.name ?? id).join(', ')}</small>}</div>
        </li>)}</ol>
        <pre>{recipe.spec.prompt}</pre>
        <dl className="studio-facts">{Object.entries(recipe.spec.settings).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{JSON.stringify(value)}</dd></div>)}</dl>
        {job ? <JobStatus job={job} retry={() => action(() => api(`/jobs/${job.id}/retry-collection`, {}))} />
          : <button className="studio-primary" disabled={busy} onClick={() => action(async () => {
            await api(`/recipes/${recipe.id}/approval`, { fingerprint: recipe.fingerprint, user_decision: 'Approved exact recipe in the local review viewer' });
            await api(`/recipes/${recipe.id}/jobs`, {});
          })}><Check size={16} />Approve and queue{recipe.spec.provider === 'higgsfield' ? ' (uses credits)' : ''}</button>}
      </div>
    </details>;
  };

  return <div className="studio-workspace">
    <header className="studio-header">
      <Link to="/studio" className="studio-brand"><Clapperboard size={22} /><strong>Strawberry Studio</strong></Link>
      <span className="studio-local"><span />Local workspace</span>
      <div className="studio-header-right">{activeJobs > 0 && <span className="studio-running"><LoaderCircle size={15} />{activeJobs} in progress</span>}
        <button className="studio-icon" title="Refresh workspace" onClick={() => action(refresh)} disabled={busy}><RefreshCw size={17} /></button>
      </div>
    </header>
    {error && !focusedMedia && <div role="alert" className="studio-error">{error}<button className="studio-icon" title="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <div role="status" className="studio-notice">{notice}<button className="studio-icon" title="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {!projectId ? <main className="studio-projects">
      <h1>Productions</h1>
      <form className="studio-create" onSubmit={e => { e.preventDefault(); void action(async () => {
        const node = await api<ProductionNode>('/nodes', { kind: 'project', name }); navigate(`/studio/${node.id}`);
      }); }}>
        <label htmlFor="production-name">Production name</label><input id="production-name" value={name} onChange={e => setName(e.target.value)} required maxLength={240} />
        <button className="studio-primary" disabled={busy || !name.trim()}><Plus size={16} />New production</button>
      </form>
      <div className="studio-project-list">{projects.map(p => <Link key={p.id} to={`/studio/${p.id}`}><Clapperboard size={22} /><span><strong>{p.name}</strong><small>Revision {p.revision}</small></span><ChevronRight size={18} /></Link>)}</div>
      {!projects.length && <p className="studio-muted">No productions yet.</p>}
    </main> : !data ? <main className="studio-loading"><LoaderCircle />Loading production</main> : <>
      <div className="studio-project-bar"><Link to="/studio" className="studio-icon" title="All productions"><ArrowLeft size={18} /></Link><button className="studio-icon studio-mobile-hierarchy" title="Show production hierarchy" aria-expanded={treeOpen} onClick={() => setTreeOpen(!treeOpen)}><Menu size={18} /></button><h1>{data.project.name}</h1></div>
      <div className="studio-layout">
        <aside className={`studio-tree ${treeOpen ? 'is-open' : ''}`} aria-label="Production hierarchy">
          <button className="studio-mobile-hierarchy" onClick={() => setTreeOpen(false)}><X size={16} />Close hierarchy</button>
          <button className={selected === data.project.id ? 'selected' : ''} onClick={() => selectNode(data.project)}><FileText size={15} />Production brief</button>
          <h2>Story</h2>
          {data.nodes.filter(n => n.kind === 'scene').sort((a, b) => a.position - b.position).map(scene => <section key={scene.id}>
            <button className={selected === scene.id ? 'selected' : ''} onClick={() => selectNode(scene)}>S{scene.position}<span>{scene.name}</span></button>
            {data.nodes.filter(n => n.parent_id === scene.id && n.kind === 'shot').sort((a, b) => a.position - b.position).map(shot => <div key={shot.id} className="studio-tree-shot">
              <button className={selected === shot.id ? 'selected' : ''} onClick={() => selectNode(shot)}>Sh{shot.position}<span>{shot.name}</span></button>
              {sequence.filter(c => c.parent_id === shot.id).map(cut => <button key={cut.id} className={`studio-tree-cut ${selected === cut.id ? 'selected' : ''}`} onClick={() => selectNode(cut)}>C{cut.position}<span>{cut.name}</span></button>)}
            </div>)}
          </section>)}
          <h2>Assets</h2>{assets.map(a => <button key={a.id} className={selected === a.id ? 'selected' : ''} onClick={() => selectNode(a)}><Images size={14} /><span>{a.name}</span></button>)}
        </aside>
        <main className="studio-content">
          <nav className="studio-tabs" aria-label="Production views">{([
            ['storyboard', 'Storyboard', Clapperboard], ['assets', 'Assets', Images], ['activity', 'Activity', Activity],
          ] as const).map(([id, title, Icon]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={16} />{title}</button>)}</nav>
          {tab === 'activity' ? <div className="studio-job-list">{data.jobs.map(job => <section key={job.id}><h3>{data.recipes.find(r => r.id === job.recipe_id)?.spec.intent}</h3><JobStatus job={job} retry={() => action(() => api(`/jobs/${job.id}/retry-collection`, {}))} /></section>)}{!data.jobs.length && <p>No generation jobs.</p>}</div>
            : <div className="studio-grid">{(tab === 'storyboard' ? sequence : assets).map((node, index) => {
              const media = findMedia(node.active_media_id) ?? data.media.find(m => m.node_id === node.id);
              const takes = data.media.filter(m => m.node_id === node.id);
              return <article key={node.id} className={`studio-tile ${selected === node.id ? 'selected' : ''}`}>
                <button className="studio-tile-image" onClick={() => selectNode(node)} aria-label={`Inspect ${node.name}`}><Visual media={media} /></button>
                <div className="studio-tile-text"><small>{tab === 'storyboard' ? `CUT ${index + 1}` : node.kind.toUpperCase()}{media?.metadata.fake ? ' / OFFLINE TEST' : ''}</small>
                  <button onClick={() => selectNode(node)}><h3>{node.name}</h3></button><p>{takes.length} {takes.length === 1 ? 'take' : 'takes'}{node.active_media_id ? ' / selected' : ' / not selected'}</p>
                  {media && <ReviewStatus review={media.review} />}
                  {node.active_media_id && takes[0] && takes[0].id !== node.active_media_id && <small className="studio-review-label">Newest take is not selected</small>}</div>
              </article>;
            })}{!(tab === 'storyboard' ? sequence : assets).length && <p className="studio-muted">{tab === 'storyboard' ? 'No cuts yet.' : 'No assets yet.'}</p>}</div>}
        </main>
        {selected && <aside className="studio-inspector" aria-label="Node inspector">
          <div className="studio-inspector-head"><span>{detail?.node.kind ?? 'Context'}</span><button className="studio-icon" title="Close inspector" onClick={() => { setSelected(null); setDetail(null); }}><X size={16} /></button></div>
          {!detail ? <LoaderCircle className="studio-running" /> : <>
            <h2>{detail.node.name}</h2><p className="studio-muted">Revision {detail.node.revision}</p>
            <ProductionInspector detail={detail} nodes={data.nodes} busy={busy} inspect={selectNode} action={action} />
            <section><h3>Context</h3><dl className="studio-facts">{Object.entries(detail.context.values).map(([field, value]) => {
              const origin = detail.context.provenance[field];
              return <div key={field}><dt>{field}</dt><dd>{fieldValue(value)}<small>{origin.node_id === detail.node.id ? 'Local' : `From ${findNode(origin.node_id)?.name ?? 'parent'}`}</small></dd></div>;
            })}{detail.context.cleared.map(field => <div key={field}><dt>{field}</dt><dd>Explicitly cleared</dd></div>)}</dl></section>
            <section><h3>Notes</h3>{noteDraft === null ? <><p className="studio-notes">{detail.node.notes || 'No local notes.'}</p><button onClick={() => setNoteDraft({ text: detail.node.notes, revision: detail.node.revision })}><FileText size={14} />Edit notes</button></> : <>
              <textarea aria-label="Node notes" value={noteDraft.text} onChange={e => setNoteDraft({ ...noteDraft, text: e.target.value })} rows={7} />
              {noteDraft.revision !== detail.node.revision && <p role="status" className="studio-job-error">This node changed while you were editing. Your draft is kept; cancel to reload the latest notes.</p>}
              <div className="studio-actions"><button disabled={busy} onClick={() => action(async () => {
                await api(`/nodes/${detail.node.id}`, { expected_revision: noteDraft.revision, notes: noteDraft.text, reason: 'User edited notes in viewer' }, 'PATCH'); setNoteDraft(null);
              })}><Save size={14} />Save</button><button onClick={() => setNoteDraft(null)}>Cancel</button></div></>}
              {detail.context.ancestors.filter(n => n.id !== detail.node.id && n.notes).map(n => <details key={n.id}><summary>Notes from {n.name}</summary><p className="studio-notes">{n.notes}</p></details>)}
            </section>
            <section><h3>Takes</h3><div className="studio-takes">{detail.media.map(media => <div key={media.id}>
              <button title={`Inspect ${media.label}`} onClick={() => setFocusedMedia(media)}><Visual media={media} /></button>
              <small className="studio-take-label">{media.label}</small>
              <ReviewStatus review={media.review} />
              <button disabled={busy || media.id === detail.node.active_media_id || media.review.status !== 'approved' || media.review.stale || !media.review.complete} onClick={() => action(() => api(`/nodes/${detail.node.id}/selection`, { media_id: media.id, expected_revision: detail.node.revision }))}>
                {media.id === detail.node.active_media_id ? <><Check size={13} />Selected</> : 'Use take'}</button>
              <button onClick={() => setFocusedMedia(media)}>Review take</button>
            </div>)}</div>{!detail.media.length && <p className="studio-muted">No takes.</p>}</section>
            <section><h3>Generation recipes</h3>{nodeRecipes.map(recipeView)}{!nodeRecipes.length && <p className="studio-muted">No prepared recipes.</p>}</section>
            <details><summary>Source instructions ({detail.sources.length})</summary>{detail.sources.map(source => <section key={source.id}><small>{source.node_name} / {source.author} / {source.status}</small><p className="studio-notes">{source.text}</p></section>)}</details>
            <details><summary>Revision history</summary>{detail.revisions.map(r => <p key={r.revision}>r{r.revision} / {r.reason}</p>)}</details>
          </>}
        </aside>}
      </div>
    </>}
    {focusedMedia && <div className="studio-modal-backdrop" onClick={() => setFocusedMedia(null)}><div role="dialog" aria-modal="true" aria-label="Take inspection" className="studio-modal" onClick={e => e.stopPropagation()}>
      {error && <div role="alert" className="studio-error">{error}<button className="studio-icon" title="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
      <div className="studio-inspector-head"><h2>{focusedMedia.label}</h2><button className="studio-icon" title="Close image" onClick={() => setFocusedMedia(null)}><X size={20} /></button></div>
      <div className="studio-large-visual"><Visual media={focusedMedia} interactive /></div>
      <p className="studio-muted">{focusedMedia.metadata.fake ? 'Offline fixture / not AI generated' : focusedMedia.metadata.model ?? 'Imported reference'}</p>
      {mediaDetail && data && <TakeReview key={`${mediaDetail.media.id}-${mediaDetail.media.review.revision}`} detail={mediaDetail} nodes={data.nodes} busy={busy} action={action} reviewed={setMediaDetail} />}
      {mediaDetail?.recipe && recipeView(mediaDetail.recipe)}
      {!!mediaDetail?.feedback.length && <section className="studio-feedback-history"><h3>Feedback history</h3>{mediaDetail.feedback.map(item => <div key={item.id}><small>{new Date(item.created_at * 1000).toLocaleString()}</small><p className="studio-notes">{item.text}</p></div>)}</section>}
      <form onSubmit={e => { e.preventDefault(); void action(async () => { await api(`/media/${focusedMedia.id}/feedback`, { text: feedback }); setMediaDetail(await api<MediaDetail>(`/media/${focusedMedia.id}`)); setFeedback(''); setNotice('Feedback saved to this take.'); }); }}>
        <label htmlFor="take-feedback">Feedback on this take</label><textarea id="take-feedback" value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} required />
        <button className="studio-primary" disabled={busy || !feedback.trim()}><Save size={15} />Save feedback</button>
      </form>
    </div></div>}
  </div>;
}

function JobStatus({ job, retry }: { job: Job; retry: () => void }) {
  const running = ['queued', 'submitting', 'running', 'collecting'].includes(job.state);
  return <div className="studio-job"><span className={`studio-job-state ${job.state}`}>
    {running ? <LoaderCircle className="studio-spin" size={14} /> : job.state === 'ready' ? <Check size={14} /> : <Activity size={14} />}{job.state.replaceAll('_', ' ')}
    </span><small>{new Date(job.created_at * 1000).toLocaleTimeString()}</small>{job.error && <p className="studio-job-error">{job.error}</p>}
    {job.state === 'collection_failed' && <button onClick={retry}><RefreshCw size={14} />Retry download</button>}
  </div>;
}
