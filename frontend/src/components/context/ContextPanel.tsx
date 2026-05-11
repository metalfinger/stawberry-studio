// ContextPanel — sidebar for the selected canvas node.
//
// For asset nodes it shows the asset's identity image + editable
// suggested_prompt + Save / Regenerate actions. The actions go through
// REST (not the chat WebSocket) so the busy state stays scoped to the
// asset card on the canvas instead of pushing a confusing status message
// into the console.
//
// Both this panel and the canvas AssetMasterNode subscribe to the
// per-asset busy bus (lib/assetBusy.ts), so clicking Regenerate in either
// place shows the spinner in both — and references refresh automatically
// when the new identity lands.
import { useEffect, useState } from 'react'
import {
  getLibrary,
  getAsset,
  updateAssetPrompt,
  regenerateAssetIdentity,
  generateAssetIdentity,
  type LibraryItem,
  type AssetDetail,
} from '../../api/client'
import { useHoverPreview } from '../dnd/HoverPreview'
import { setRefDrag } from '../dnd/refDragData'
import { toast } from '../toast/Toast'
import { markBusy, markIdle, isBusy, subscribeBusy, emitAssetUpdated, subscribeAssetUpdated } from '../../services/assetBusy'
import './ContextPanel.css'

interface Props {
  projectId: string
  selectedNodeId: string | null
  selectedNodeType: string | null
}

interface PriorIdentity {
  id: string
  image_url: string
  created_at: string
}

export function ContextPanel({ projectId, selectedNodeId, selectedNodeType }: Props) {
  const [refs, setRefs] = useState<LibraryItem[]>([])
  const [asset, setAsset] = useState<AssetDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [priorIdentities, setPriorIdentities] = useState<PriorIdentity[]>([])
  const isAsset = selectedNodeType === 'assetMaster' || selectedNodeType === 'assetGroup'

  const reloadRefs = (assetId: string) => {
    getLibrary(projectId, { asset_id: assetId, only_active: true })
      .then(r => setRefs(r.items))
      .catch(() => setRefs([]))
    // Also pull superseded identity history so the user can see prior
    // takes of the same asset (and verify regen actually produced something
    // new). Filters server-side via include_history flag.
    fetch(`/api/projects/${projectId}/assets/${assetId}/references?include_history=true`)
      .then(r => r.ok ? r.json() : { references: [] })
      .then((j: { references: Array<{ id: string; label: string; image_url: string; is_active: boolean; created_at: string }> }) => {
        const prior = (j.references || [])
          .filter(r => r.label === 'identity' && !r.is_active)
          .map(r => ({ id: r.id, image_url: r.image_url, created_at: r.created_at }))
        setPriorIdentities(prior)
      })
      .catch(() => setPriorIdentities([]))
  }

  useEffect(() => {
    if (!selectedNodeId || !isAsset) {
      setRefs([])
      setAsset(null)
      return
    }
    setLoading(true)
    reloadRefs(selectedNodeId)
    getAsset(projectId, selectedNodeId).then(setAsset).catch(() => setAsset(null))
      .finally(() => setLoading(false))
  }, [projectId, selectedNodeId, isAsset])

  // Listen for cross-tab / WS-driven asset updates from anywhere.
  useEffect(() => {
    if (!selectedNodeId || !isAsset) return
    const onAssetUpdated = (e: Event) => {
      const ev = e as CustomEvent<{ asset_id: string }>
      if (ev.detail?.asset_id === selectedNodeId) {
        reloadRefs(selectedNodeId)
        getAsset(projectId, selectedNodeId).then(setAsset).catch(() => {})
      }
    }
    window.addEventListener('asset_updated', onAssetUpdated as EventListener)
    return () => window.removeEventListener('asset_updated', onAssetUpdated as EventListener)
  }, [projectId, selectedNodeId, isAsset])

  // When something else (canvas card, library) regenerates the same
  // asset, refresh our reference grid so the new identity shows up here too.
  useEffect(() => {
    if (!selectedNodeId || !isAsset) return
    return subscribeAssetUpdated(id => {
      if (id === selectedNodeId) reloadRefs(id)
    })
  }, [projectId, selectedNodeId, isAsset])

  // Don't render when nothing's selected OR when the selected node is
  // not an asset — the panel only knows how to show asset prompt +
  // references, and an empty chrome at the top of the canvas was just
  // noise.
  if (!selectedNodeId || !isAsset) return null

  return (
    <aside className="context-panel" role="complementary" aria-label="Context">
      <div className="context-panel__head">
        <div className="context-panel__kind">{selectedNodeType ?? 'node'}</div>
        <div className="context-panel__id" title={selectedNodeId}>{selectedNodeId.slice(0, 8)}</div>
      </div>

      {asset && isAsset && (
        <AssetPromptEditor projectId={projectId} asset={asset} hasIdentity={refs.length > 0} />
      )}

      {loading && <div className="context-panel__loading">Loading…</div>}

      {!loading && refs.length > 0 && (
        <div className="context-panel__section">
          <div className="context-panel__section-title">References ({refs.length})</div>
          <div className="context-panel__grid">
            {refs.map(r => <ContextThumb key={r.ref_id} item={r} />)}
          </div>
        </div>
      )}
      {!loading && refs.length === 0 && isAsset && (
        <div className="context-panel__empty">
          No references yet. Edit the prompt then click Generate identity.
        </div>
      )}

      {!loading && priorIdentities.length > 0 && (
        <div className="context-panel__section">
          <div className="context-panel__section-title">
            Previous identities ({priorIdentities.length})
          </div>
          <div className="context-panel__grid">
            {priorIdentities.map(p => (
              <div key={p.id} className="context-panel__thumb context-panel__thumb--prior" title={new Date(p.created_at).toLocaleString()}>
                <img src={p.image_url} alt="prior identity" loading="lazy" />
                <div className="context-panel__thumb-label">superseded</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

function AssetPromptEditor({ projectId, asset, hasIdentity }: {
  projectId: string
  asset: AssetDetail
  hasIdentity: boolean
}) {
  const [draft, setDraft] = useState(asset.suggested_prompt || '')
  const [saving, setSaving] = useState(false)
  const [busy, setBusyState] = useState<boolean>(isBusy(asset.id))

  // Reset draft when selection changes.
  useEffect(() => { setDraft(asset.suggested_prompt || '') }, [asset.id, asset.suggested_prompt])

  // Subscribe to bus so canvas-side regen updates this view too.
  useEffect(() => {
    return subscribeBusy((id, b) => { if (id === asset.id) setBusyState(b) })
  }, [asset.id])

  const dirty = draft.trim() !== (asset.suggested_prompt || '').trim()

  const save = async () => {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await updateAssetPrompt(projectId, asset.id, draft)
      toast.success('Prompt saved.')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const regenerate = async () => {
    if (!draft.trim()) return
    // Save edits first if dirty so the regen uses the latest prompt.
    if (dirty) {
      try {
        await updateAssetPrompt(projectId, asset.id, draft)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Save failed.')
        return
      }
    }
    markBusy(asset.id)
    try {
      const fn = hasIdentity ? regenerateAssetIdentity : generateAssetIdentity
      await fn(projectId, asset.id)
      emitAssetUpdated(asset.id)
      toast.success(hasIdentity ? 'Identity regenerated.' : 'Identity generated.')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      markIdle(asset.id)
    }
  }

  return (
    <div className="context-panel__editor">
      <div className="context-panel__section-title">{asset.name} · {asset.type}</div>
      <textarea
        className="context-panel__textarea"
        rows={6}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        disabled={busy}
        placeholder="Describe how this asset should look. Identity locks (e.g. round glasses, black turtleneck) belong here."
      />
      <div className="context-panel__editor-actions">
        <button
          className="ctx-btn"
          onClick={save}
          disabled={busy || saving || !dirty}
          title={dirty ? 'Save prompt without regenerating' : 'No changes to save'}
        >{saving ? '…' : '💾 Save'}</button>
        <button
          className="ctx-btn ctx-btn--primary"
          onClick={regenerate}
          disabled={busy || !draft.trim()}
          title={hasIdentity ? 'Regenerate identity (supersedes the prior one)' : 'Generate identity'}
        >
          {busy
            ? (hasIdentity ? '🔁 Regenerating…' : '✨ Generating…')
            : (hasIdentity ? '🔁 Regenerate' : '✨ Generate identity')}
        </button>
      </div>
      {busy && (
        <div className="context-panel__regen-status">
          <span className="context-panel__spinner" aria-hidden /> Talking to the model… this usually takes 5–15s.
        </div>
      )}
    </div>
  )
}

function ContextThumb({ item }: { item: LibraryItem }) {
  const hover = useHoverPreview(item.image_url)
  const onDragStart = (e: React.DragEvent) => {
    setRefDrag(e, {
      ref_id: item.ref_id,
      image_url: item.image_url,
      label: item.label,
      asset_id: item.asset_id,
      source_type: item.source_type,
    })
  }
  return (
    <div
      className="context-panel__thumb"
      draggable
      onDragStart={onDragStart}
      title={item.label}
      {...hover}
    >
      <img src={item.image_url} alt={item.label} loading="lazy" />
      <div className="context-panel__thumb-label">{item.label}</div>
    </div>
  )
}
