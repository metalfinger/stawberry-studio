// AssetMasterNode — references-first asset rendering.
//
// One identity card on top (the eternal anchor), accumulated reference
// thumbnails below. The "sheet view" is rendered client-side from
// list_references; no backend grid PNG. Two actions:
//   ✨ Generate identity — fires the first reference for the asset.
//   ⚡ Pre-cache turnaround — fires the standard pose set in parallel.
import { memo, useEffect, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import {
  listAssetReferences,
  generateAssetIdentity,
  regenerateAssetIdentity,
  precacheAssetTurnaround,
  type AssetReference,
} from '../../api/client'
import {
  markBusy,
  markIdle,
  isBusy,
  subscribeBusy,
  emitAssetUpdated,
  subscribeAssetUpdated,
} from '../../services/assetBusy'

export interface Asset {
  id: string
  name: string
  type: string
  description?: string
  suggested_prompt?: string
  parent_asset_id?: string | null
  inspired_by?: string | null
  /** Number of cuts that have this asset linked — surfaced as a badge so the
      user knows whether this character/location is actually getting used. */
  linked_cut_count?: number
}

export interface AssetMasterNodeData {
  asset: Asset
  projectId: string
  onRefresh?: () => void
}

const typeColors: Record<string, { border: string; icon: string }> = {
  character: { border: '#10b981', icon: '👤' },
  location: { border: '#06b6d4', icon: '📍' },
  prop: { border: '#f59e0b', icon: '🔧' },
}

export const AssetMasterNode = memo(({ data, selected }: NodeProps & { data: AssetMasterNodeData }) => {
  const { asset, projectId } = data
  const colors = typeColors[asset.type] || typeColors.character

  const [refs, setRefs] = useState<AssetReference[]>([])
  const [loading, setLoading] = useState<boolean>(isBusy(asset.id))
  const [precaching, setPrecaching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    listAssetReferences(projectId, asset.id)
      .then(({ references }) => setRefs(references))
      .catch(() => { /* none yet */ })
  }

  useEffect(() => {
    let cancelled = false
    listAssetReferences(projectId, asset.id)
      .then(({ references }) => { if (!cancelled) setRefs(references) })
      .catch(() => { /* none yet */ })
    return () => { cancelled = true }
  }, [projectId, asset.id])

  // Stay in sync with the busy bus + cross-component refresh.
  useEffect(() => {
    const offBusy = subscribeBusy((id, b) => { if (id === asset.id) setLoading(b) })
    const offUpd = subscribeAssetUpdated((id) => { if (id === asset.id) reload() })
    return () => { offBusy(); offUpd() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, projectId])

  const identity = refs.find((r) => r.label === 'identity') ?? null
  const others = refs.filter((r) => r.label !== 'identity')

  const handleGenerateIdentity = async () => {
    markBusy(asset.id)
    setError(null)
    try {
      const fn = identity ? regenerateAssetIdentity : generateAssetIdentity
      await fn(projectId, asset.id)
      const { references } = await listAssetReferences(projectId, asset.id)
      setRefs(references)
      emitAssetUpdated(asset.id)
      data.onRefresh?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      markIdle(asset.id)
    }
  }

  const handlePrecache = async () => {
    setPrecaching(true)
    setError(null)
    try {
      await precacheAssetTurnaround(projectId, asset.id)
      const { references } = await listAssetReferences(projectId, asset.id)
      setRefs(references)
      data.onRefresh?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPrecaching(false)
    }
  }

  const promptReady = !!(asset.suggested_prompt || '').trim()
  const blockedReason = !promptReady
    ? "Atlas hasn't saved a suggested_prompt yet. Ask Atlas to fill it."
    : null

  return (
    <div
      className="asset-master-node"
      style={{
        border: `2px solid ${selected ? '#fff' : colors.border}`,
        borderRadius: 12,
        padding: 12,
        minWidth: 280,
        maxWidth: 320,
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{colors.icon}</span>
        <strong style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</strong>
        {typeof asset.linked_cut_count === 'number' && (
          <span
            title={asset.linked_cut_count === 0
              ? 'Not linked to any cut yet — auto-linker missed it. Edit the prompt or rename so cut prose matches.'
              : `Linked to ${asset.linked_cut_count} cut${asset.linked_cut_count === 1 ? '' : 's'}`}
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
              background: asset.linked_cut_count === 0 ? 'rgba(239,68,68,0.18)' : 'rgba(34,211,238,0.18)',
              color: asset.linked_cut_count === 0 ? '#fca5a5' : '#67e8f9',
            }}
          >{asset.linked_cut_count}↗</span>
        )}
        <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>{asset.type}</span>
      </div>

      {asset.inspired_by && (
        <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 6 }}>
          ✨ recast from <em>{asset.inspired_by}</em>
        </div>
      )}

      {asset.parent_asset_id && (
        <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 6 }}>
          ⊂ derived (parent identity pinned automatically)
        </div>
      )}

      {/* IDENTITY CARD */}
      {identity ? (
        <div style={{ marginBottom: 8, position: 'relative' }}>
          <img
            src={identity.image_url}
            alt={`${asset.name} identity`}
            style={{
              width: '100%', borderRadius: 8, background: '#000', display: 'block',
              opacity: loading ? 0.45 : 1, transition: 'opacity 200ms',
            }}
          />
          {loading && <BusyOverlay label="Regenerating identity…" />}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            <span style={{
              background: 'rgba(16,185,129,0.15)', color: '#10b981',
              padding: '2px 6px', borderRadius: 4, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>identity</span>
            <span>{others.length} additional view{others.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '24px 8px',
          textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.2)',
          borderRadius: 8,
          fontSize: 12,
          color: '#94a3b8',
          marginBottom: 8,
          position: 'relative',
        }}>
          {loading
            ? <BusyOverlay label="Generating identity…" inline />
            : "No identity card yet. Click below to generate the asset's anchor reference."}
        </div>
      )}

      {/* The thumbnail grid lived here once. ContextPanel (sidebar) now
          owns the full reference/history gallery — the canvas card was
          duplicating it and making AssetMasterNode feel "useless." We
          surface a count instead and link to the sidebar via selection. */}
      {others.length > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
          + {others.length} reference{others.length === 1 ? '' : 's'} — see sidebar for gallery
        </div>
      )}

      {/* ACTIONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={handleGenerateIdentity}
          disabled={loading || precaching || !promptReady}
          title={blockedReason ?? 'Generate the identity card'}
          style={{
            width: '100%', padding: '8px 10px',
            background: promptReady ? colors.border : '#334155',
            color: '#0f172a', border: 'none', borderRadius: 6,
            fontWeight: 600,
            cursor: promptReady && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Generating identity…' : identity ? '↻ Regenerate identity' : '✨ Generate identity'}
        </button>
        {identity && (
          <button
            onClick={handlePrecache}
            disabled={loading || precaching}
            title="Pre-generate the standard turnaround poses (front/3q/side/back) so cuts have them on tap"
            style={{
              width: '100%', padding: '6px 10px',
              background: 'rgba(255,255,255,0.05)',
              color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, fontSize: 12,
              cursor: precaching ? 'not-allowed' : 'pointer',
              opacity: precaching ? 0.6 : 1,
            }}
          >
            {precaching ? 'Pre-caching turnaround…' : '⚡ Pre-cache turnaround'}
          </button>
        )}
      </div>

      {blockedReason && !loading && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6 }}>{blockedReason}</div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>Error: {error}</div>
      )}
    </div>
  )
})

AssetMasterNode.displayName = 'AssetMasterNode'

function BusyOverlay({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <div style={{
      position: inline ? 'static' : 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      background: inline ? 'transparent' : 'rgba(15, 23, 42, 0.55)',
      borderRadius: 8, color: '#fbbf24', fontSize: 12, fontWeight: 600,
      pointerEvents: 'none',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        border: '2px solid rgba(251, 191, 36, 0.25)',
        borderTopColor: '#fbbf24',
        animation: 'amn-spin 0.8s linear infinite',
      }} />
      <div>{label}</div>
      <style>{`@keyframes amn-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
