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
  precacheAssetTurnaround,
  type AssetReference,
} from '../../api/client'

export interface Asset {
  id: string
  name: string
  type: string
  description?: string
  suggested_prompt?: string
  parent_asset_id?: string | null
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
  const [loading, setLoading] = useState(false)
  const [precaching, setPrecaching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listAssetReferences(projectId, asset.id)
      .then(({ references }) => { if (!cancelled) setRefs(references) })
      .catch(() => { /* none yet */ })
    return () => { cancelled = true }
  }, [projectId, asset.id])

  const identity = refs.find((r) => r.label === 'identity') ?? null
  const others = refs.filter((r) => r.label !== 'identity')

  const handleGenerateIdentity = async () => {
    setLoading(true)
    setError(null)
    try {
      await generateAssetIdentity(projectId, asset.id)
      const { references } = await listAssetReferences(projectId, asset.id)
      setRefs(references)
      data.onRefresh?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{colors.icon}</span>
        <strong style={{ fontSize: 14 }}>{asset.name}</strong>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>{asset.type}</span>
      </div>

      {asset.parent_asset_id && (
        <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 6 }}>
          ⊂ derived (parent identity pinned automatically)
        </div>
      )}

      {asset.description && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{asset.description}</div>
      )}

      {/* IDENTITY CARD */}
      {identity ? (
        <div style={{ marginBottom: 8 }}>
          <img
            src={identity.image_url}
            alt={`${asset.name} identity`}
            style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block' }}
          />
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
        }}>
          No identity card yet. Click below to generate the asset's anchor reference.
        </div>
      )}

      {/* ACCUMULATED REFERENCES THUMBNAIL GRID */}
      {others.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          marginBottom: 8,
        }}>
          {others.map((r) => (
            <div key={r.id} title={r.label} style={{
              position: 'relative',
              borderRadius: 4,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <img src={r.image_url} alt={r.label} style={{
                width: '100%', display: 'block', aspectRatio: '1', objectFit: 'cover',
              }} />
              <span style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(15,23,42,0.85)', color: '#d1d5db',
                fontSize: 9, padding: '1px 4px', textAlign: 'center',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.label.replace(/_/g, ' ')}</span>
            </div>
          ))}
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
