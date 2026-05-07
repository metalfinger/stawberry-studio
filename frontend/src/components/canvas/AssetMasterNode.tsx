import { memo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { type NodeProps } from '@xyflow/react'
import {
  getGenerationRequestStatus,
  listGenerationRequests,
  saveGenerationToSlot,
  cancelGenerationRequest,
  getActiveMasterForAsset,
  queueMasterGeneration,
  generateElementVariant
} from '../../services/elements'
import { getAssetSheet, generateAssetSheet, type ElementSheet } from '../../api/client'

export interface Asset {
  id: string
  name: string
  type: string
  description?: string
  suggested_prompt?: string
}

export interface GenerationRequest {
  id: string
  status: string
  progress_percentage: number
  current_step: string
  output_image_url: string | null
  error_message: string | null
  target_asset_id: string
  prompt: string
  model: string
  params: string
  created_at: string
  completed_at: string | null
  cost_usd: number | null
  candidate_group_id: string
  saved_to_master_id: string | null
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

  // State
  const [activeGenerations, setActiveGenerations] = useState<GenerationRequest[]>([])
  const [completedGenerations, setCompletedGenerations] = useState<GenerationRequest[]>([])
  const [activeMasterId, setActiveMasterId] = useState<string | null>(null)

  // Side Panel States
  const [viewingGeneration, setViewingGeneration] = useState<GenerationRequest | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationPrompt, setGenerationPrompt] = useState(asset.suggested_prompt || '')
  const [generationModel, setGenerationModel] = useState('gemini-3-pro-image')
  const [generationResolution, setGenerationResolution] = useState(asset.type === 'location' ? '2048x1365' : '2048x2048')

  // Variant Modal State (legacy — kept until backend tools are removed)
  const [showVariantModal, setShowVariantModal] = useState(false)
  const [pendingVariantType, setPendingVariantType] = useState<string | null>(null)
  const [variantPrompt, setVariantPrompt] = useState('')

  // Element Sheet state (Phase 4.6 — replaces variants)
  const [sheet, setSheet] = useState<ElementSheet | null>(null)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAssetSheet(projectId, asset.id)
      .then(({ sheet }) => { if (!cancelled) setSheet(sheet) })
      .catch(() => { /* ignore — no sheet is fine */ })
    return () => { cancelled = true }
  }, [projectId, asset.id])

  const handleGenerateSheet = async () => {
    setSheetLoading(true)
    setSheetError(null)
    try {
      const result = await generateAssetSheet(projectId, asset.id)
      // Refetch full sheet to populate is_active/created_at fields
      const { sheet: fresh } = await getAssetSheet(projectId, asset.id)
      setSheet(fresh ?? {
        id: result.sheet_id,
        asset_id: asset.id,
        sheet_type: result.sheet_type,
        template_id: result.template_id,
        image_url: result.image_url,
        aspect_ratio: result.layout.aspect_ratio,
        panels: result.panels,
        layout: result.layout,
        status: 'complete',
        cost_usd: result.cost_usd,
        is_active: true,
        created_at: new Date().toISOString(),
      })
      data.onRefresh?.()
    } catch (e: any) {
      setSheetError(e.message || 'Sheet generation failed')
    } finally {
      setSheetLoading(false)
    }
  }

  const pollInterval = useRef<number | undefined>(undefined)

  // Portal Target State
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setPortalTarget(document.getElementById('properties-panel-portal'))
  }, [])

  // Load generations on mount and when asset changes
  useEffect(() => {
    if (asset?.id && projectId) {
      loadGenerations()
    }
    if (asset?.suggested_prompt) {
      setGenerationPrompt(asset.suggested_prompt)
    }
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current)
    }
  }, [asset?.id, projectId, asset?.suggested_prompt])

  // Poll for active generations (global poll if active)
  useEffect(() => {
    if (activeGenerations.length > 0) {
      pollInterval.current = window.setInterval(() => {
        updateActiveGenerations()
      }, 1000)

      return () => {
        if (pollInterval.current) clearInterval(pollInterval.current)
      }
    }
  }, [activeGenerations.length])

  const loadGenerations = async () => {
    if (!projectId || !asset?.id) return
    try {
      const [requests, activeMasterData] = await Promise.all([
        listGenerationRequests(projectId, undefined, asset.id),
        getActiveMasterForAsset(projectId, asset.id)
      ])

      const active = requests.filter((r: GenerationRequest) =>
        ['queued', 'preparing', 'generating', 'downloading'].includes(r.status)
      )
      const completed = requests.filter((r: GenerationRequest) =>
        ['complete', 'failed'].includes(r.status)
      )

      setActiveGenerations(active)
      setCompletedGenerations(completed)
      setActiveMasterId(activeMasterData.active_generation_id || null)
    } catch (error) {
      console.error('Failed to load generations:', error)
    }
  }

  const updateActiveGenerations = async () => {
    if (!projectId) return
    try {
      const updated = await Promise.all(
        activeGenerations.map(async (gen) => {
          return await getGenerationRequestStatus(projectId, gen.id)
        })
      )

      const stillActive = updated.filter((r: GenerationRequest) =>
        ['queued', 'preparing', 'generating', 'downloading'].includes(r.status)
      )
      setActiveGenerations(stillActive)

      const newlyCompleted = updated.filter((r: GenerationRequest) =>
        ['complete', 'failed'].includes(r.status)
      )

      if (newlyCompleted.length > 0) {
        loadGenerations()
      }
    } catch (error) {
      console.error('Failed to update generations:', error)
    }
  }

  const handleSaveToSlot = async (requestId: string, makeActive: boolean = false) => {
    if (!projectId) return
    try {
      const result = await saveGenerationToSlot(projectId, requestId, makeActive)
      if (result.success) {
        setActiveMasterId(requestId)
        loadGenerations()
      }
    } catch (error) {
      console.error('Failed to save to slot:', error)
    }
  }

  const handleCancelGeneration = async (requestId: string) => {
    if (!projectId) return
    try {
      await cancelGenerationRequest(projectId, requestId)
      setActiveGenerations(activeGenerations.filter(g => g.id !== requestId))
    } catch (error) {
      console.error('Failed to cancel generation:', error)
    }
  }

  const handleStartGeneration = async () => {
    if (!projectId || !asset?.id) return

    setIsGenerating(true)
    try {
      const result = await queueMasterGeneration(projectId, {
        asset_id: asset.id,
        prompt: generationPrompt,
        model: generationModel,
        resolution: generationResolution
      })

      setIsGenerating(false) // Wait for poll

      // Auto-poll immediately
      const newGen = await getGenerationRequestStatus(projectId, result.request_id)
      setActiveGenerations(prev => [...prev, newGen])

    } catch (error) {
      console.error('Failed to start generation:', error)
      setIsGenerating(false)
    }
  }


  const handleVariantClick = (variantType: string) => {
    // Open Modal instead of auto-generating
    const basePrompt = generationPrompt || asset.suggested_prompt || ''

    // Simple logic: Append the view instruction if not present
    const viewInstructions: Record<string, string> = {
      'SIDE_LEFT': 'Viewed from the left side profile (orthographic reference).',
      'SIDE_RIGHT': 'Viewed from the right side profile (orthographic reference).',
      'FRONT_3_4': 'Viewed from a 3/4 front angle.',
      'BACK': 'Viewed from behind (back view).'
    }

    const instruction = viewInstructions[variantType] || ''
    const initialPrompt = `${basePrompt}\n\nOVERRIDE: ${instruction} Maintain consistency with the description above.`

    setVariantPrompt(initialPrompt)
    setPendingVariantType(variantType)
    setShowVariantModal(true)
  }

  const handleConfirmVariantGenerate = async () => {
    if (!projectId || !asset?.id || !pendingVariantType || !activeMasterId) return

    setIsGenerating(true)
    setShowVariantModal(false) // Close modal

    try {
      // Use the dedicated Variant endpoint (Synchronous / Blocking)
      // This ensures it goes into the element_variants table
      const result = await generateElementVariant(projectId, {
        master_id: activeMasterId,
        variant_type: pendingVariantType,
        custom_prompt: variantPrompt,
        model: 'nano-banana-pro-edit', // Explicitly use the edit model
        method: 'image_to_image',
        strength: 0.6
      })

      if (result.success) {
        // Refresh generations (History)
        // Note: Since it's synchronous, we can just reload the list
        await loadGenerations()
      }

      setIsGenerating(false)

    } catch (error) {
      console.error('Failed to generate variant:', error)
      setIsGenerating(false)
    }
  }

// Active Master Image for Node & Panel
const activeMaster = completedGenerations.find(g => g.id === activeMasterId)

// -- RENDER PANEL CONTENT --
const renderPropertiesPanel = () => (
  <div className="asset-properties-panel" onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <div className="panel-header" style={{ borderLeft: `4px solid ${colors.border}` }}>
      <div className="panel-title-row">
        <span className="panel-icon">{colors.icon}</span>
        <h2>{asset.name}</h2>
      </div>
      <div className="panel-subtitle">{asset.type} • {completedGenerations.length} Generations</div>
    </div>

    <div className="panel-content">

      {/* 1. GENERATE SECTION */}
      <div className="panel-section generate-section">
        <h3>Generate Master</h3>
        <div className="form-group">
          <div className="prompt-header">
            <label>Prompt</label>
            {asset.suggested_prompt && (
              <button className="text-btn-xs" onClick={() => setGenerationPrompt(asset.suggested_prompt!)}>Reset to Suggested</button>
            )}
          </div>
          <textarea
            className="panel-textarea"
            value={generationPrompt}
            onChange={e => setGenerationPrompt(e.target.value)}
            placeholder="Describe the asset..."
            rows={6}
          />
        </div>
        <div className="form-row">
          <select className="panel-select" value={generationModel} onChange={e => setGenerationModel(e.target.value)}>
            <option value="gemini-3-pro-image">Gemini 3 Pro Image</option>
          </select>
          <select className="panel-select" value={generationResolution} onChange={e => setGenerationResolution(e.target.value)}>
            <option value="2048x2048">2048x2048</option>
            <option value="2048x1365">Horizontal</option>
            <option value="1365x2048">Vertical</option>
          </select>
        </div>
        <button
          className="panel-primary-btn"
          onClick={handleStartGeneration}
          disabled={isGenerating || !generationPrompt.trim()}
        >
          {isGenerating ? 'Generating...' : 'Start Generation ✨'}
        </button>
      </div>

      {/* 2. ACTIVE GENERATIONS */}
      {activeGenerations.length > 0 && (
        <div className="panel-section active-gens">
          <h3>Processing</h3>
          {activeGenerations.map(gen => (
            <div key={gen.id} className="active-gen-row">
              <div className="progress-circle spinner"></div>
              <div className="gen-info">
                <span>Generating... {gen.progress_percentage}%</span>
                <div className="progress-bg"><div className="progress-fg" style={{ width: `${gen.progress_percentage}%` }}></div></div>
              </div>
              <button onClick={() => handleCancelGeneration(gen.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 3. HISTORY & CANDIDATES */}
      <div className="panel-section history-section">
        <h3>History & Candidates</h3>
        <div className="history-grid">
          {completedGenerations.length === 0 && <p className="empty-text">No generations yet.</p>}

          {completedGenerations.map(gen => (
            <div
              key={gen.id}
              className={`history-card ${activeMasterId === gen.id ? 'active-master' : ''}`}
              onClick={() => setViewingGeneration(gen)}
            >
              <img src={gen.output_image_url || ''} alt="Gen" />
              {activeMasterId === gen.id && <div className="status-badge active">Active</div>}
              <div className="card-overlay">
                {activeMasterId !== gen.id && (
                  <button className="set-active-btn" onClick={(e) => {
                    e.stopPropagation()
                    handleSaveToSlot(gen.id, true)
                  }}>Set Active</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. ELEMENT SHEET (Phase 4.6 — single multi-panel image) */}
      <div className="panel-section variants-section">
        <h3>Element Sheet</h3>
        {sheet ? (
          <div className="sheet-display">
            <img src={sheet.image_url} className="sheet-image" alt={`${asset.name} sheet`} />
            <div className="sheet-meta">
              <span className="sheet-type-tag">{sheet.sheet_type}</span>
              <span className="sheet-cost">${sheet.cost_usd?.toFixed(3)}</span>
            </div>
            <div className="sheet-cells">
              {sheet.panels.map((label) => (
                <span key={label} className="sheet-cell-label">{label.replace(/_/g, ' ')}</span>
              ))}
            </div>
            <button
              className="add-btn"
              onClick={handleGenerateSheet}
              disabled={sheetLoading || isGenerating}
              style={{ width: '100%', marginTop: 8 }}
            >
              {sheetLoading ? 'Regenerating…' : '↻ Regenerate sheet'}
            </button>
          </div>
        ) : (
          <div className="sheet-empty">
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 8px' }}>
              No sheet yet. One image, every angle/expression, locked consistency.
            </p>
            <button
              className="add-btn"
              onClick={handleGenerateSheet}
              disabled={sheetLoading || isGenerating}
              style={{ width: '100%' }}
            >
              {sheetLoading ? 'Generating…' : '✨ Generate sheet'}
            </button>
          </div>
        )}
        {sheetError && <div className="np-error" style={{ marginTop: 6 }}>{sheetError}</div>}
      </div>

    </div>

    {/* Viewing Detail Overlay (Inside Panel) */}
    {viewingGeneration && (
      <div className="panel-detail-overlay">
        <div className="detail-header">
          <button onClick={() => setViewingGeneration(null)}>← Back</button>
          <span>Details</span>
        </div>
        <div className="detail-content">
          <img src={viewingGeneration.output_image_url || ''} className="detail-img" />
          <div className="detail-meta">
            <pre>{viewingGeneration.prompt}</pre>
            <p>Cost: ${viewingGeneration.cost_usd?.toFixed(3)}</p>
          </div>
          {activeMasterId !== viewingGeneration.id && (
            <button className="panel-primary-btn" onClick={() => handleSaveToSlot(viewingGeneration.id, true)}>
              Set as Active Master
            </button>
          )}
        </div>
      </div>
    )}

    {/* Variant Generation Modal */}
    {showVariantModal && (
      <div className="panel-detail-overlay">
        <div className="detail-header">
          <button onClick={() => setShowVariantModal(false)}>Cancel</button>
          <span>Generate {pendingVariantType?.replace('_', ' ')}</span>
          <button className="panel-primary-btn" style={{ width: 'auto', padding: '6px 16px' }} onClick={handleConfirmVariantGenerate}>Generate</button>
        </div>
        <div className="detail-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="split-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Reference Column */}
            <div className="ref-col">
              <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '8px' }}>INPUT REFERENCE (ACTIVE MASTER)</label>
              <div className="node-image-container" style={{ height: '200px' }}>
                {activeMaster?.output_image_url ? (
                  <img src={activeMaster.output_image_url} alt="Ref" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div className="node-image-placeholder">No Active Master</div>
                )}
              </div>
            </div>
            {/* Prompt Column */}
            <div className="prompt-col">
              <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '8px' }}>VARIANT PROMPT</label>
              <textarea
                className="panel-textarea"
                value={variantPrompt}
                onChange={e => setVariantPrompt(e.target.value)}
                rows={12}
              />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>
            This will use the Active Master as visual reference (Image-to-Image) and apply the prompt override to generate a consistent {pendingVariantType?.replace('_', ' ')} variant.
          </p>
        </div>
      </div>
    )}

  </div>
)

return (
  <>
    {/* THE NODE ITSELF (Minimal) */}
    <div
      className={`canvas-node asset-master-node ${selected ? 'is-selected' : ''}`}
      style={{ borderColor: selected ? '#fff' : colors.border }}
    >
      <div className="node-header asset-header">
        <span className="node-icon">{colors.icon}</span>
        <span className="node-label">{asset.name}</span>
        {activeGenerations.length > 0 && <span className="spinner-mini">⏳</span>}
      </div>

      <div className="asset-node-body-simple">
        {/* Show Active Master or Placeholder */}
        <div className="node-image-container">
          {activeMaster?.output_image_url ? (
            <img src={activeMaster.output_image_url} alt="Master" />
          ) : (
            <div className="node-image-placeholder">
              <span>{asset.type}</span>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* THE SIDE PANEL (Portal) */}
    {selected && portalTarget && createPortal(renderPropertiesPanel(), portalTarget)}
  </>
)
})

AssetMasterNode.displayName = 'AssetMasterNode'
