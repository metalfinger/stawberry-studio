// ContextPanel — read-only sidebar showing the selected node's context.
// All mutations go through the Console (chat). This panel only *reads*:
// what is this thing, what references does it have, what cuts use it,
// what's its history. Selecting nothing collapses the panel.
//
// Design choice: this is intentionally not editable. Every change should
// run through an agent that records an event in the run log. Editing
// fields here would bypass that and create silent state drift.
import { useEffect, useState } from 'react'
import { getLibrary, type LibraryItem } from '../../api/client'
import { useHoverPreview } from '../dnd/HoverPreview'
import { setRefDrag } from '../dnd/refDragData'
import './ContextPanel.css'

interface Props {
  projectId: string
  selectedNodeId: string | null
  selectedNodeType: string | null
}

export function ContextPanel({ projectId, selectedNodeId, selectedNodeType }: Props) {
  const [refs, setRefs] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedNodeId) { setRefs([]); return }
    // Only asset nodes have a clean library filter today.
    if (selectedNodeType !== 'assetMaster' && selectedNodeType !== 'assetGroup') {
      setRefs([])
      return
    }
    setLoading(true)
    getLibrary(projectId, { asset_id: selectedNodeId, only_active: true })
      .then(r => setRefs(r.items))
      .catch(() => setRefs([]))
      .finally(() => setLoading(false))
  }, [projectId, selectedNodeId, selectedNodeType])

  if (!selectedNodeId) return null

  return (
    <aside className="context-panel" role="complementary" aria-label="Context">
      <div className="context-panel__head">
        <div className="context-panel__kind">{selectedNodeType ?? 'node'}</div>
        <div className="context-panel__id" title={selectedNodeId}>{selectedNodeId.slice(0, 8)}</div>
      </div>

      <div className="context-panel__hint">
        Read-only. Use the Console to make changes — every edit is recorded.
      </div>

      {loading && <div className="context-panel__loading">Loading references…</div>}
      {!loading && refs.length > 0 && (
        <div className="context-panel__section">
          <div className="context-panel__section-title">References ({refs.length})</div>
          <div className="context-panel__grid">
            {refs.map(r => <ContextThumb key={r.ref_id} item={r} />)}
          </div>
        </div>
      )}
      {!loading && refs.length === 0 && selectedNodeType?.startsWith('asset') && (
        <div className="context-panel__empty">
          No references for this asset yet. Ask the agent to generate one.
        </div>
      )}
    </aside>
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
