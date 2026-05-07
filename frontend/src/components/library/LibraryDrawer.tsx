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
  type LibraryItem, type LibraryStats,
} from '../../api/client'
import { setRefDrag } from '../dnd/refDragData'
import { useHoverPreview } from '../dnd/HoverPreview'
import './LibraryDrawer.css'

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
}

const SOURCE_TYPES = [
  { id: '', label: 'All' },
  { id: 'master', label: 'Masters' },
  { id: 'variant', label: 'Variants' },
  { id: 'cut', label: 'Cuts' },
  { id: 'upload', label: 'Uploads' },
]

export function LibraryDrawer({ projectId, open, onClose }: Props) {
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
  }

  const onRestore = async (item: LibraryItem) => {
    await restoreReference(projectId, item.ref_id)
    await load()
  }

  if (!open) return null

  const favorites = items.filter(i => i.is_favorite)
  const rest = items.filter(i => !i.is_favorite)

  return (
    <>
      <div className="library-overlay" onClick={onClose} />
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
          <div className="library-detail">
            <img src={selected.image_url} alt={selected.label} className="library-detail__img" />
            <div className="library-detail__meta">
              <div className="library-detail__title">{selected.label}</div>
              <div className="library-detail__sub">
                {selected.source_type}
                {selected.cost_usd > 0 && ` · $${selected.cost_usd.toFixed(3)}`}
                {selected.model_used && ` · ${selected.model_used}`}
              </div>
              {selected.prompt && (
                <details className="library-detail__prompt">
                  <summary>Prompt</summary>
                  <pre>{selected.prompt}</pre>
                </details>
              )}
              {selected.used_in_cuts.length > 0 && (
                <div className="library-detail__used">
                  Used in {selected.used_in_cuts.length} cut(s)
                </div>
              )}
            </div>
            <div className="library-detail__actions">
              <button onClick={() => onFavorite(selected)}>
                {selected.is_favorite ? '★ Unfavorite' : '☆ Favorite'}
              </button>
              <button onClick={() => onSetAnchor(selected)}>
                {selected.is_style_anchor ? '⚓ Unset anchor' : '⚓ Set as style anchor'}
              </button>
              {!selected.is_active && (
                <button onClick={() => onRestore(selected)}>↺ Restore</button>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
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
