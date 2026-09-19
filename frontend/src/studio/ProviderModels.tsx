import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, Search, X } from 'lucide-react';
import { api, type ProviderCatalog, type ProviderModel, type ProviderModelDetail } from './types';

export default function ProviderModels({ close }: { close: () => void }) {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [details, setDetails] = useState<Record<string, ProviderModelDetail>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api<ProviderCatalog>('/providers/higgsfield/models').then(result => {
      if (active) setCatalog(result);
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [close]);

  const models = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return catalog?.models ?? [];
    return (catalog?.models ?? []).filter(model =>
      `${model.display_name} ${model.model}`.toLocaleLowerCase().includes(needle),
    );
  }, [catalog, query]);

  const toggle = async (model: ProviderModel) => {
    if (expanded === model.model) { setExpanded(null); return; }
    setExpanded(model.model);
    if (details[model.model]) return;
    setLoadingModel(model.model); setError('');
    try {
      const detail = await api<ProviderModelDetail>(`/providers/higgsfield/models/${model.model}`);
      setDetails(current => ({ ...current, [model.model]: detail }));
    } catch (reason) { setError(String(reason)); }
    finally { setLoadingModel(null); }
  };

  return <div className="studio-modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) close();
  }}>
    <section className="studio-modal studio-models" role="dialog" aria-modal="true" aria-labelledby="provider-models-title">
      <header>
        <div><small>HIGGSFIELD CLI</small><h2 id="provider-models-title">Image models</h2></div>
        <button className="studio-icon" title="Close model catalog" onClick={close}><X size={18} /></button>
      </header>
      <p className="studio-muted">Live provider contracts for image storyboarding. Availability is not a quality endorsement; approved recipes keep their exact model and settings.</p>
      <label className="studio-model-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search 44 image models" aria-label="Search image models" /></label>
      {error && <p className="studio-job-error" role="alert">{error}</p>}
      {!catalog ? <p className="studio-running"><LoaderCircle size={16} />Reading live catalog</p> : <>
        <div className="studio-model-summary"><span>{models.length} of {catalog.models.length} models</span><span>{catalog.cli_version}</span></div>
        <div className="studio-model-list">{models.map(model => {
          const detail = details[model.model];
          const isOpen = expanded === model.model;
          return <article key={model.model}>
            <button className="studio-model-row" aria-expanded={isOpen} onClick={() => void toggle(model)}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span><strong>{model.display_name}</strong><small>{model.model}</small></span>
            </button>
            {isOpen && <div className="studio-model-detail">{loadingModel === model.model ? <span className="studio-running"><LoaderCircle size={15} />Reading schema</span> : detail ? <>
              <dl className="studio-facts">
                <div><dt>Prompt</dt><dd>{detail.capabilities.prompt ? 'Supported' : 'Not declared'}</dd></div>
                <div><dt>Image references</dt><dd>{detail.capabilities.image_references ? 'Supported' : 'Not declared'}<small>{detail.capabilities.reference_parameter ?? 'No media parameter'}</small></dd></div>
                <div><dt>Reference bounds</dt><dd>{referenceBounds(detail)}</dd></div>
              </dl>
              <div className="studio-model-params">{detail.parameters.filter(parameter => parameter.name !== 'prompt' && !['input_images', 'medias'].includes(parameter.name)).map(parameter => <span key={parameter.name}><strong>{parameter.name}</strong>{parameter.enum?.length ? parameter.enum.join(' / ') : parameter.type}{parameter.default !== null && parameter.default !== undefined ? ` · default ${String(parameter.default)}` : ''}</span>)}</div>
            </> : null}</div>}
          </article>;
        })}</div>
      </>}
    </section>
  </div>;
}

function referenceBounds(detail: ProviderModelDetail) {
  if (!detail.capabilities.image_references) return 'None';
  const maximum = detail.capabilities.maximum_references;
  return `${detail.capabilities.minimum_references} minimum · ${maximum === null ? 'maximum not declared' : `${maximum} maximum`}`;
}
