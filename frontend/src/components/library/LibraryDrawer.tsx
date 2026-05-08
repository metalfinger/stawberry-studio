// LibraryDrawer — slide-in visual memory bank.
// Shows every reference_pool image with filters, search, favorites, and the
// crucial drag-drop affordance: each thumb can be dragged onto the chat
// input, a cut node slot, or any other drop target.
//
// Design choices baked in:
// - Newest first; favorites bubble to a separate top section.
// - Filters: source type pills + search box + "show superseded" toggle.
// - Click a thumb to expand metadata + actions (favorite, set style anchor,
//   restore if superseded).
// - Drag any thumb anywhere — payload uses the shared REF_MIME so cuts and
//   the input dock both accept it without coupling.
import { useEffect, useState, useCallback } from 'react'
import {
  getLibrary, getLibraryStats, favoriteReference, setStyleAnchor, restoreReference,
  getReferenceVersions,
  type LibraryItem, type LibraryStats,
} from '../../api/client'
import { setRefDrag } from '../dnd/refDragData'
import { useHoverPreview } from '../dnd/HoverPreview'
import { pinning } from '../dnd/pinning'
import { toast } from '../toast/Toast'
import './LibraryDrawer.css'

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  onOpen?: () => void
}

const SOURCE_TYPES = [
  { id: '', label: 'All' },
  { id: 'master', label: 'Masters' },
  { id: 'variant', label: 'Variants' },
  { id: 'cut', label: 'Cuts' },
  { id: 'upload', label: 'Uploads' },
]

export function LibraryDrawer({ projectId, open, onClose, onOpen }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [search, setSearch] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [showSuperseded, setShowSuperseded] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<LibraryItem | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [lib, st] = await Promise.all([
        getLibrary(projectId, {
          search: search || undefined,
          source_type: sourceType || undefined,
          only_active: !showSuperseded,
          favorites_only: favoritesOnly,
          limit: 500,
        }),
        getLibraryStats(projectId),
      ])
      setItems(lib.items)
      setStats(st)
    } catch (e) {
      console.error('library load failed', e)
      toast.error('Failed to load library')
    } finally {
      setLoading(false)
    }
  }, [projectId, search, sourceType, showSuperseded, favoritesOnly])

  // Reload whenever drawer opens or filters change.
  useEffect(() => { if (open) load() }, [open, load])

  const onFavorite = async (item: LibraryItem) => {
    await favoriteReference(projectId, item.ref_id, !item.is_favorite)
    setItems(prev => prev.map(i => i.ref_id === item.ref_id ? { ...i, is_favorite: !item.is_favorite } : i))
    if (selected?.ref_id === item.ref_id) setSelected({ ...item, is_favorite: !item.is_favorite })
  }

  const onSetAnchor = async (item: LibraryItem) => {
    await setStyleAnchor(projectId, item.ref_id, !item.is_style_anchor)
    setItems(prev => prev.map(i => ({
      ...i,
      is_style_anchor: i.ref_id === item.ref_id ? !item.is_style_anchor : false,
    })))
    if (selected?.ref_id === item.ref_id) setSelected({ ...item, is_style_anchor: !item.is_style_anchor })
    toast.success(item.is_style_anchor ? 'Style anchor cleared' : 'Style anchor set')
  }

  const onRestore = async (item: LibraryItem) => {
    await restoreReference(projectId, item.ref_id)
    await load()
    toast.success('Reference restored')
  }

  if (!open) {
    // Collapsed rail — slim left edge with vertical label, click to expand.
    return (
      <button
        className="library-rail"
        onClick={() => onOpen?.()}
        aria-label="Open library"
        title="Library (⌘L)"
      >
        <span>📚</span>
        <span className="library-rail__label">LIBRARY</span>
      </button>
    )
  }

  const favorites = items.filter(i => i.is_favorite)
  const rest = items.filter(i => !i.is_favorite)

  return (
    <>
      <aside className="library-drawer" role="region" aria-label="Reference library">
        <header className="library-drawer__head">
          <div>
            <div className="library-drawer__title">📚 Library</div>
            <div className="library-drawer__sub">
              {stats ? `${stats.total_count} refs · $${stats.total_cost_usd.toFixed(2)} spent` : '—'}
            </div>
          </div>
          <button className="library-drawer__close" onClick={onClose} aria-label="Close library">×</button>
        </header>

        <div className="library-drawer__filters">
          <input
            type="search"
            className="library-drawer__search"
            placeholder="Search prompt, label…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="library-drawer__pills">
            {SOURCE_TYPES.map(t => (
              <button
                key={t.id}
                className={`library-pill ${sourceType === t.id ? 'library-pill--active' : ''}`}
                onClick={() => setSourceType(t.id)}
              >{t.label}</button>
            ))}
          </div>
          <div className="library-drawer__toggles">
            <label>
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={e => setFavoritesOnly(e.target.checked)}
              /> Favorites only
            </label>
            <label>
              <input
                type="checkbox"
                checked={showSuperseded}
                onChange={e => setShowSuperseded(e.target.checked)}
              /> Show superseded
            </label>
          </div>
        </div>

        <div className="library-drawer__body">
          {loading && <div className="library-drawer__loading">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="library-drawer__empty">
              No references yet. Compose a cut or generate an asset to fill the library.
            </div>
          )}

          {favorites.length > 0 && (
            <>
              <div className="library-drawer__section">⭐ Favorites</div>
              <div className="library-drawer__grid">
                {favorites.map(item => (
                  <LibraryThumb
                    key={item.ref_id}
                    item={item}
                    selected={selected?.ref_id === item.ref_id}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            </>
          )}

          {rest.length > 0 && (
            <>
              {favorites.length > 0 && <div className="library-drawer__section">All</div>}
              <div className="library-drawer__grid">
                {rest.map(item => (
                  <LibraryThumb
                    key={item.ref_id}
                    item={item}
                    selected={selected?.ref_id === item.ref_id}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {selected && (
          <LibraryDetail
            projectId={projectId}
            item={selected}
            onFavorite={onFavorite}
            onSetAnchor={onSetAnchor}
            onRestore={onRestore}
          />
        )}
      </aside>
    </>
  )
}

// LibraryDetail — full info pane for a selected reference. Designed so the
// user can decide "reuse this / refine it / regenerate / make a variant"
// without leaving the drawer:
//  - prompt always visible (truncates with expand)
//  - slot thumbnails: which references fed THIS render (provenance graph)
//  - feedback chain (if this is a refinement)
//  - actions: pin, favorite, anchor, restore, plus "Refine with feedback"
//    which writes to the chat as an intent — the agent picks it up, forks
//    a plan with cumulative feedback, and re-renders.
function LibraryDetail({ projectId, item, onFavorite, onSetAnchor, onRestore }: {
  projectId: string
  item: LibraryItem
  onFavorite: (item: LibraryItem) => Promise<void> | void
  onSetAnchor: (item: LibraryItem) => Promise<void> | void
  onRestore: (item: LibraryItem) => Promise<void> | void
}) {
  const [feedback, setFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const [versions, setVersions] = useState<LibraryItem[]>([])
  const [comparing, setComparing] = useState<LibraryItem | null>(null)
  const tags = (item.tags as any) || {}
  const slots: Array<{ slot: number; name: string; image_url: string }> = Array.isArray(tags.slots_used) ? tags.slots_used : []
  const feedbackChain: string[] = Array.isArray(tags.feedback_chain) ? tags.feedback_chain : []
  const isCutRender = item.source_type === 'cut'

  // Load the supersession chain so the user can see (and compare) every
  // earlier version of this same reference. This is the "history" view
  // for any single ref — the Library grid is project-wide history.
  useEffect(() => {
    let cancelled = false
    setVersions([])
    setComparing(null)
    getReferenceVersions(projectId, item.ref_id)
      .then(r => { if (!cancelled) setVersions(r.versions || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId, item.ref_id])

  const submitRefine = () => {
    const text = feedback.trim()
    if (!text) return
    setRefining(true)
    // Compose path: re-plan via Pixel using the cut id this render is from.
    if (isCutRender && item.source_cut_id) {
      sendChatIntent('propose_cut_plan', {
        cut_id: item.source_cut_id,
        feedback: text,
      })
      toast.success('Asked Pixel to refine')
    } else if (item.asset_id) {
      sendChatIntent('refine_reference', {
        ref_id: item.ref_id,
        asset_id: item.asset_id,
        feedback: text,
      })
      toast.success('Asked Atlas to refine')
    } else {
      toast.error('Nothing to refine — no source cut or asset on this reference.')
    }
    setFeedback('')
    setRefining(false)
  }

  return (
    <div className="library-detail">
      <img src={item.image_url} alt={item.label} className="library-detail__img" />
      <div className="library-detail__meta">
        <div className="library-detail__title">{item.label}</div>
        <div className="library-detail__sub">
          {item.source_type}
          {item.cost_usd > 0 && ` · $${item.cost_usd.toFixed(3)}`}
          {item.model_used && ` · ${item.model_used}`}
          {item.created_at && ` · ${new Date(item.created_at).toLocaleString()}`}
        </div>
        {item.used_in_cuts.length > 0 && (
          <div className="library-detail__used">
            Used in {item.used_in_cuts.length} cut(s)
          </div>
        )}
      </div>

      {item.prompt && (
        <div className="library-detail__prompt-block">
          <div className="library-detail__section-title">Prompt</div>
          <pre className="library-detail__prompt-pre">{item.prompt}</pre>
        </div>
      )}

      {feedbackChain.length > 0 && (
        <div className="library-detail__prompt-block">
          <div className="library-detail__section-title">Feedback chain</div>
          <ol className="library-detail__feedback">
            {feedbackChain.map((f, i) => <li key={i}>{f}</li>)}
          </ol>
        </div>
      )}

      {slots.length > 0 && (
        <div className="library-detail__prompt-block">
          <div className="library-detail__section-title">References used</div>
          <div className="library-detail__slots">
            {slots.map((s, i) => (
              <div key={i} className="library-detail__slot" title={s.name}>
                <img src={s.image_url} alt={s.name} />
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {versions.length > 1 && (
        <div className="library-detail__prompt-block">
          <div className="library-detail__section-title">Versions ({versions.length})</div>
          <div className="library-detail__versions">
            {versions.map(v => (
              <button
                key={v.ref_id}
                type="button"
                className={
                  'library-detail__version' +
                  (v.ref_id === item.ref_id ? ' library-detail__version--current' : '') +
                  (!v.is_active ? ' library-detail__version--inactive' : '')
                }
                onClick={() => v.ref_id !== item.ref_id && setComparing(v)}
                title={`${v.label} · ${new Date(v.created_at).toLocaleString()}`}
              >
                <img src={v.image_url} alt={v.label} />
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {comparing && (
        <div className="library-detail__compare">
          <div className="library-detail__section-title">
            Compare {comparing.label}
            <button className="library-detail__close-compare" onClick={() => setComparing(null)}>×</button>
          </div>
          <div className="library-detail__compare-grid">
            <figure>
              <img src={comparing.image_url} alt={comparing.label} />
              <figcaption>previous · {comparing.label}</figcaption>
            </figure>
            <figure>
              <img src={item.image_url} alt={item.label} />
              <figcaption>current · {item.label}</figcaption>
            </figure>
          </div>
        </div>
      )}

      <div className="library-detail__refine">
        <textarea
          className="library-detail__refine-input"
          placeholder={isCutRender ? 'Describe what to change for the next render…' : 'Describe how to redo this asset reference…'}
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={2}
        />
        <button
          className="library-detail__refine-btn"
          onClick={submitRefine}
          disabled={refining || !feedback.trim()}
          title="Send refine request to the agent"
        >🔁 Refine</button>
      </div>

      <div className="library-detail__actions">
        <button
          onClick={() => {
            const nowPinned = pinning.togglePin(projectId, item.ref_id)
            toast.success(nowPinned ? 'Pinned to chat' : 'Unpinned')
          }}
        >📌 {pinning.isPinned(projectId, item.ref_id) ? 'Unpin' : 'Pin to chat'}</button>
        <button onClick={() => onFavorite(item)}>
          {item.is_favorite ? '★ Unfavorite' : '☆ Favorite'}
        </button>
        <button onClick={() => onSetAnchor(item)}>
          {item.is_style_anchor ? '⚓ Unset anchor' : '⚓ Set as style anchor'}
        </button>
        {!item.is_active && (
          <button onClick={() => onRestore(item)}>↺ Restore</button>
        )}
      </div>
    </div>
  )
}

// Send an intent through the active chat WebSocket. Lives outside the
// Console so any panel (Library, Context, etc.) can drive the agent
// without prop-drilling. We grab the live socket via a global window
// hook the Console publishes on connect.
function sendChatIntent(intent: string, payload: Record<string, unknown>) {
  const w: any = window
  const ws: WebSocket | undefined = w.__strawberry_chat_ws
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast.error('Console not connected.')
    return
  }
  try {
    ws.send(JSON.stringify({ type: 'user_intent', intent, payload }))
  } catch (e) {
    toast.error('Failed to send.')
  }
}

function LibraryThumb({ item, selected, onClick }: { item: LibraryItem; selected: boolean; onClick: () => void }) {
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
    <button
      className={`library-thumb ${selected ? 'library-thumb--selected' : ''} ${!item.is_active ? 'library-thumb--inactive' : ''}`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      title={`${item.label} · ${item.source_type}`}
      {...hover}
    >
      <img src={item.image_url} alt={item.label} loading="lazy" />
      <div className="library-thumb__badge">
        {item.is_style_anchor && <span title="Style anchor">⚓</span>}
        {item.is_favorite && <span title="Favorite">★</span>}
        {item.is_anchor && <span title="Scene anchor">📍</span>}
      </div>
      <div className="library-thumb__label">{item.label}</div>
    </button>
  )
}
