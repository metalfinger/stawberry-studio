// RepairMenu — Phase L6 consistency-repair UI.
//
// A single "🛠️ Consistency" button that opens a small menu of repair
// actions for the current project. The user can:
//
//   - Recompile style bible (cheap, ~1 LLM call)
//   - Re-mint style anchor image (1 image call)
//   - Re-generate every asset's identity with white-background sheets +
//     locked palette / style tokens (N image calls — confirms first)
//   - Run all of the above in order
//
// Existing projects (Test 4 etc.) were created before the L1-L5 changes
// landed, so this UI is the one-click way to lift them onto the new
// consistency stack without manually nuking and rebuilding.
import { useEffect, useState } from 'react'
import { toast } from './toast/Toast'
import './RepairMenu.css'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || ''

type Action = 'style-bible' | 'style-anchor' | 'regenerate-identities' | 'all'

const LABELS: Record<Action, string> = {
  'style-bible': 'Recompile style bible (palette + tokens)',
  'style-anchor': 'Re-mint style anchor image',
  'regenerate-identities': 'Re-generate every asset identity (white-bg sheets)',
  'all': 'Run all of the above',
}

const HINTS: Record<Action, string> = {
  'style-bible': 'Cheap — one Flash call. No image generation.',
  'style-anchor': 'One image call. ~$0.20.',
  'regenerate-identities': 'One image call PER asset. Confirms first.',
  'all': 'Bible → anchor → identities. Confirms first.',
}

interface Preview {
  asset_count: number
  estimates_usd: {
    style_bible: number
    style_anchor: number
    regenerate_identities: number
    all: number
  }
}

export function RepairMenu({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Action | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  // Lazy load the cost preview when the menu opens.
  useEffect(() => {
    if (!open || preview) return
    fetch(`${API_BASE}/api/projects/${projectId}/repair/preview`)
      .then(r => (r.ok ? r.json() : null))
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [open, preview, projectId])

  const run = async (action: Action) => {
    if (action === 'regenerate-identities' || action === 'all') {
      const cost = preview?.estimates_usd?.[action === 'all' ? 'all' : 'regenerate_identities'] ?? 0
      const n = preview?.asset_count ?? 0
      const ok = window.confirm(
        action === 'all'
          ? `Recompile bible + mint anchor + regenerate ${n} asset identities.\nEstimated cost: ~$${cost.toFixed(2)}.\nContinue?`
          : `Regenerate ${n} asset identities. Supersedes current ones.\nEstimated cost: ~$${cost.toFixed(2)}.\nContinue?`
      )
      if (!ok) return
    }
    setBusy(action)
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/repair/${action}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`)

      // Surface the most useful number from each path.
      let summary = '✓ Done.'
      if (action === 'style-bible') {
        const p = (data?.palette_hex || []).length
        const t = (data?.style_tokens || []).length
        summary = `✓ Bible: ${p} palette codes, ${t} style tokens.`
      } else if (action === 'style-anchor') {
        summary = `✓ New style anchor pinned.`
      } else if (action === 'regenerate-identities') {
        summary = `✓ Re-minted ${data.minted_count} identities (${data.failed_count} failed).`
      } else if (action === 'all') {
        const m = data?.identities?.minted_count ?? 0
        summary = `✓ All repairs done. ${m} identities re-minted.`
      }
      toast.success(summary)
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Repair failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="repair-menu">
      <button
        type="button"
        className="repair-menu__trigger"
        onClick={() => setOpen(o => !o)}
        title="Lift this project onto the latest consistency stack"
      >🛠️ Consistency</button>

      {open && (
        <div className="repair-menu__panel" role="menu">
          <div className="repair-menu__title">Consistency repair</div>
          <div className="repair-menu__hint">
            Existing projects predate the white-sheet / style-bible / style-anchor logic. Run these to lift this project onto the latest stack.
            {preview && (
              <div style={{ marginTop: 6, color: '#facc15' }}>
                {preview.asset_count} asset{preview.asset_count === 1 ? '' : 's'} · estimated total ~${preview.estimates_usd.all.toFixed(2)}
              </div>
            )}
          </div>
          {(['style-bible', 'style-anchor', 'regenerate-identities', 'all'] as Action[]).map(a => {
            const costKey = a === 'all' ? 'all' : a === 'style-bible' ? 'style_bible' : a === 'style-anchor' ? 'style_anchor' : 'regenerate_identities'
            const cost = preview?.estimates_usd?.[costKey]
            return (
              <button
                key={a}
                type="button"
                className="repair-menu__item"
                onClick={() => run(a)}
                disabled={busy !== null}
              >
                <div className="repair-menu__item-label">
                  {busy === a ? '⏳ ' : ''}{LABELS[a]}
                  {typeof cost === 'number' && (
                    <span style={{ float: 'right', fontWeight: 400, color: '#94a3b8' }}>~${cost.toFixed(2)}</span>
                  )}
                </div>
                <div className="repair-menu__item-hint">{HINTS[a]}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
