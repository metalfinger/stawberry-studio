// ContextPanel — sidebar for the selected canvas node.
//
// For asset nodes it shows the asset's identity image + editable
// suggested_prompt + a "Save & Regenerate" action that fires through
// the agent intent dispatcher (so every change is recorded in the
// run log + console_events). For other node types it stays read-only.
import { useEffect, useState } from 'react'
import { getLibrary, getAsset, type LibraryItem, type AssetDetail } from '../../api/client'
import { useHoverPreview } from '../dnd/HoverPreview'
import { setRefDrag } from '../dnd/refDragData'
import { toast } from '../toast/Toast'
import './ContextPanel.css'

interface Props {
  projectId: string
  selectedNodeId: string | null
  selectedNodeType: string | null
}

export function ContextPanel({ projectId, selectedNodeId, selectedNodeType }: Props) {
  const [refs, setRefs] = useState<LibraryItem[]>([])
  const [asset, setAsset] = useState<AssetDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const isAsset = selectedNodeType === 'assetMaster' || selectedNodeType === 'assetGroup'

  useEffect(() => {
    if (!selectedNodeId || !isAsset) {
      setRefs([])
      setAsset(null)
      return
    }
    setLoading(true)
    Promise.all([
      getLibrary(projectId, { asset_id: selectedNodeId, only_active: true }).then(r => setRefs(r.items)).catch(() => setRefs([])),
      getAsset(projectId, selectedNodeId).then(setAsset).catch(() => setAsset(null)),
    ]).finally(() => setLoading(false))
  }, [projectId, selectedNodeId, isAsset])

  if (!selectedNodeId) return null

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
    </aside>
  )
}

function AssetPromptEditor({ projectId, asset, hasIdentity }: {
  projectId: string
  asset: AssetDetail
  hasIdentity: boolean
}) {
  const [draft, setDraft] = useState(asset.suggested_prompt || '')
  const [busy, setBusy] = useState(false)
  // If the asset prop changes (different selection), reset the draft.
  useEffect(() => { setDraft(asset.suggested_prompt || '') }, [asset.id, asset.suggested_prompt])
  const dirty = draft.trim() !== (asset.suggested_prompt || '').trim()

  const send = (intent: string, payload: Record<string, unknown>) => {
    const w: any = window
    const ws: WebSocket | undefined = w.__strawberry_chat_ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Console not connected.')
      return false
    }
    try {
      ws.send(JSON.stringify({ type: 'user_intent', intent, payload }))
      return true
    } catch {
      toast.error('Failed to send.')
      return false
    }
  }

  const save = () => {
    setBusy(true)
    const ok = send('update_asset_prompt', { asset_id: asset.id, prompt: draft })
    if (ok) toast.success('Prompt saved.')
    setTimeout(() => setBusy(false), 200)
  }

  const regenerate = () => {
    setBusy(true)
    const ok = send('regenerate_asset_identity', { asset_id: asset.id, prompt: draft })
    if (ok) toast.info(hasIdentity ? 'Regenerating identity…' : 'Generating identity…')
    setTimeout(() => setBusy(false), 200)
  }

  return (
    <div className="context-panel__editor">
      <div className="context-panel__section-title">{asset.name} · {asset.type}</div>
      <textarea
        className="context-panel__textarea"
        rows={6}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Describe how this asset should look. Identity locks (e.g. round glasses, black turtleneck) belong here."
      />
      <div className="context-panel__editor-actions">
        <button
          className="ctx-btn"
          onClick={save}
          disabled={busy || !dirty}
          title={dirty ? 'Save prompt without regenerating' : 'No changes to save'}
        >💾 Save</button>
        <button
          className="ctx-btn ctx-btn--primary"
          onClick={regenerate}
          disabled={busy || !draft.trim()}
          title={hasIdentity ? 'Regenerate identity (supersedes the prior one)' : 'Generate identity'}
        >{hasIdentity ? '🔁 Regenerate' : '✨ Generate identity'}</button>
      </div>
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
