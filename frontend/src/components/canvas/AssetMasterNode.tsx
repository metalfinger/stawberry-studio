// AssetMasterNode — sheet-first asset rendering.
//
// Single action: "Generate sheet" → ONE Nano Banana Pro call → ONE multi-panel
// image (front / 3-quarter / side / back / expressions, etc.). Replaces the
// legacy two-step "generate master then sheet" workflow per Nov-2026 model
// research: Gemini 3 Pro Image natively does 3x3 turnarounds in one call at
// ~93% consistency.
import { memo, useEffect, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import {
  getAssetSheet,
  generateAssetSheet,
  type ElementSheet,
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

  const [sheet, setSheet] = useState<ElementSheet | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAssetSheet(projectId, asset.id)
      .then(({ sheet }) => { if (!cancelled) setSheet(sheet) })
      .catch(() => { /* no sheet yet — fine */ })
    return () => { cancelled = true }
  }, [projectId, asset.id])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      await generateAssetSheet(projectId, asset.id)
      const { sheet: fresh } = await getAssetSheet(projectId, asset.id)
      setSheet(fresh)
      data.onRefresh?.()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setGenerating(false)
    }
  }

  const promptReady = !!(asset.suggested_prompt || '').trim()
  const blockedReason = !promptReady
    ? 'Atlas hasn\'t saved a suggested_prompt yet. Ask Atlas to fill it.'
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
          ⊂ derived from another asset (parent sheet pinned as reference)
        </div>
      )}

      {asset.description && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{asset.description}</div>
      )}

      {/* SHEET DISPLAY OR PLACEHOLDER */}
      {sheet ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img
            src={sheet.image_url}
            alt={`${asset.name} sheet`}
            style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
            <span style={{
              background: 'rgba(16,185,129,0.15)', color: '#10b981',
              padding: '2px 6px', borderRadius: 4, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{sheet.sheet_type}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>${sheet.cost_usd?.toFixed(3)}</span>
          </div>
          {sheet.panels?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 10 }}>
              {sheet.panels.map((label) => (
                <span key={label} style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 3, padding: '1px 5px', color: '#d1d5db',
                }}>{label.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: '24px 8px',
          textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.2)',
          borderRadius: 8,
          fontSize: 12,
          color: '#94a3b8',
        }}>
          No sheet yet. One image = every angle, locked consistency.
        </div>
      )}

      {/* GENERATE / REGENERATE BUTTON */}
      <button
        onClick={handleGenerate}
        disabled={generating || !promptReady}
        title={blockedReason ?? 'Generate the multi-panel sheet'}
        style={{
          width: '100%',
          marginTop: 10,
          padding: '8px 10px',
          background: promptReady ? colors.border : '#334155',
          color: '#0f172a',
          border: 'none',
          borderRadius: 6,
          fontWeight: 600,
          cursor: promptReady && !generating ? 'pointer' : 'not-allowed',
          opacity: generating ? 0.6 : 1,
        }}
      >
        {generating ? 'Generating sheet…' : sheet ? '↻ Regenerate sheet' : '✨ Generate sheet'}
      </button>

      {blockedReason && !generating && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6 }}>{blockedReason}</div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>Error: {error}</div>
      )}
    </div>
  )
})

AssetMasterNode.displayName = 'AssetMasterNode'
