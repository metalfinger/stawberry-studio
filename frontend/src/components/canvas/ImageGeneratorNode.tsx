import { memo, useState, useEffect } from 'react'
import { type NodeProps } from '@xyflow/react'
import {
  queueMasterGeneration,
  getGenerationRequestStatus,
  saveGenerationToSlot,
} from '../../services/elements'
import { getAssets, type AssetsResponse } from '../../api/client'

export interface ReferenceImage {
  id: string
  url: string
  name: string
  type: 'character' | 'location' | 'prop' | 'cut'
}

export interface ImageGeneratorNodeData {
  projectId: string
}

interface GenerationState {
  status: 'idle' | 'generating' | 'complete' | 'error'
  requestId: string | null
  progress: number
  currentStep: string
  outputImageUrl: string | null
  errorMessage: string | null
}

export const ImageGeneratorNode = memo(({ data }: NodeProps & { data: ImageGeneratorNodeData }) => {
  const { projectId } = data

  // Form state
  const [prompt, setPrompt] = useState('')
  const [selectedReferences, setSelectedReferences] = useState<ReferenceImage[]>([])
  const [model, setModel] = useState('gemini-3-pro-image')
  const [resolution, setResolution] = useState('2048x2048')
  const [targetAssetId, setTargetAssetId] = useState<string | null>(null)

  // Available assets for reference selection
  const [assets, setAssets] = useState<AssetsResponse | null>(null)
  const [showRefPicker, setShowRefPicker] = useState(false)

  // Generation state
  const [generation, setGeneration] = useState<GenerationState>({
    status: 'idle',
    requestId: null,
    progress: 0,
    currentStep: '',
    outputImageUrl: null,
    errorMessage: null,
  })

  // Load assets for reference picker and target selection
  useEffect(() => {
    if (projectId) {
      loadAssets()
    }
  }, [projectId])

  // Poll for generation status
  useEffect(() => {
    if (generation.status !== 'generating' || !generation.requestId) return

    const pollInterval = setInterval(async () => {
      try {
        const status = await getGenerationRequestStatus(projectId, generation.requestId!)
        setGeneration(prev => ({
          ...prev,
          progress: status.progress_percentage || 0,
          currentStep: status.current_step || '',
          outputImageUrl: status.output_image_url,
          status: ['complete', 'failed'].includes(status.status)
            ? (status.status === 'complete' ? 'complete' : 'error')
            : 'generating',
          errorMessage: status.error_message,
        }))

        if (['complete', 'failed'].includes(status.status)) {
          clearInterval(pollInterval)
        }
      } catch (error) {
        console.error('Failed to poll generation status:', error)
      }
    }, 1000)

    return () => clearInterval(pollInterval)
  }, [generation.status, generation.requestId, projectId])

  const loadAssets = async () => {
    try {
      const assetsData = await getAssets(projectId)
      setAssets(assetsData)
    } catch (error) {
      console.error('Failed to load assets:', error)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || !targetAssetId) return

    setGeneration({
      status: 'generating',
      requestId: null,
      progress: 0,
      currentStep: 'Starting...',
      outputImageUrl: null,
      errorMessage: null,
    })

    try {
      // Build prompt with references
      let finalPrompt = prompt
      if (selectedReferences.length > 0) {
        const refList = selectedReferences.map(r => `[${r.type}: ${r.name}]`).join(', ')
        finalPrompt = `${prompt}\n\nReference images: ${refList}`
      }

      const result = await queueMasterGeneration(projectId, {
        asset_id: targetAssetId,
        prompt: finalPrompt,
        model: model,
        resolution: resolution,
      })

      setGeneration(prev => ({
        ...prev,
        requestId: result.request_id,
      }))
    } catch (error) {
      console.error('Failed to start generation:', error)
      setGeneration({
        status: 'error',
        requestId: null,
        progress: 0,
        currentStep: '',
        outputImageUrl: null,
        errorMessage: 'Failed to start generation',
      })
    }
  }

  const handleSaveToSlot = async () => {
    if (!generation.requestId) return
    try {
      await saveGenerationToSlot(projectId, generation.requestId, true)
      // Reset after saving
      setGeneration({
        status: 'idle',
        requestId: null,
        progress: 0,
        currentStep: '',
        outputImageUrl: null,
        errorMessage: null,
      })
    } catch (error) {
      console.error('Failed to save to slot:', error)
    }
  }

  const handleDiscard = () => {
    setGeneration({
      status: 'idle',
      requestId: null,
      progress: 0,
      currentStep: '',
      outputImageUrl: null,
      errorMessage: null,
    })
  }

  const handleRegenerate = () => {
    handleGenerate()
  }

  const addReference = (ref: ReferenceImage) => {
    if (!selectedReferences.find(r => r.id === ref.id)) {
      setSelectedReferences([...selectedReferences, ref])
    }
    setShowRefPicker(false)
  }

  const removeReference = (id: string) => {
    setSelectedReferences(selectedReferences.filter(r => r.id !== id))
  }

  return (
    <div className="canvas-node image-generator-node">
      <div className="node-header generator-header">
        <span className="node-icon">🎨</span>
        <span className="node-label">Image Generator</span>
      </div>

      <div className="generator-content">
        {/* Target Asset Selection */}
        <div className="generator-section">
          <label>Target Asset</label>
          <select
            value={targetAssetId || ''}
            onChange={(e) => setTargetAssetId(e.target.value || null)}
            className="generator-select"
          >
            <option value="">Select an asset...</option>
            <optgroup label="Characters">
              {assets?.characters?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </optgroup>
            <optgroup label="Locations">
              {assets?.locations?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </optgroup>
            <optgroup label="Props">
              {assets?.props?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Prompt Input */}
        <div className="generator-section">
          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to generate..."
            rows={4}
            className="generator-textarea"
          />
        </div>

        {/* Reference Images */}
        <div className="generator-section">
          <div className="section-row">
            <label>References</label>
            <button
              className="add-ref-btn"
              onClick={() => setShowRefPicker(!showRefPicker)}
            >
              + Add
            </button>
          </div>

          {selectedReferences.length > 0 && (
            <div className="reference-list">
              {selectedReferences.map((ref) => (
                <div key={ref.id} className="reference-item">
                  <span className="ref-type">{ref.type}</span>
                  <span className="ref-name">{ref.name}</span>
                  <button
                    className="remove-ref-btn"
                    onClick={() => removeReference(ref.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {showRefPicker && (
            <div className="ref-picker-dropdown">
              <div className="ref-picker-section">
                <div className="ref-picker-header">Characters</div>
                {assets?.characters?.map((a: any) => (
                  <div
                    key={a.id}
                    className="ref-picker-item"
                    onClick={() => addReference({ id: a.id, url: '', name: a.name, type: 'character' })}
                  >
                    👤 {a.name}
                  </div>
                ))}
              </div>
              <div className="ref-picker-section">
                <div className="ref-picker-header">Locations</div>
                {assets?.locations?.map((a: any) => (
                  <div
                    key={a.id}
                    className="ref-picker-item"
                    onClick={() => addReference({ id: a.id, url: '', name: a.name, type: 'location' })}
                  >
                    📍 {a.name}
                  </div>
                ))}
              </div>
              <div className="ref-picker-section">
                <div className="ref-picker-header">Props</div>
                {assets?.props?.map((a: any) => (
                  <div
                    key={a.id}
                    className="ref-picker-item"
                    onClick={() => addReference({ id: a.id, url: '', name: a.name, type: 'prop' })}
                  >
                    🔧 {a.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings Row */}
        <div className="generator-settings">
          <div className="setting-item">
            <label>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="generator-select-small"
            >
              <option value="gemini-3-pro-image">Gemini 3 Pro</option>
              <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
            </select>
          </div>
          <div className="setting-item">
            <label>Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="generator-select-small"
            >
              <option value="1024x1024">1024×1024</option>
              <option value="2048x2048">2048×2048</option>
            </select>
          </div>
        </div>

        {/* Generation Progress or Result */}
        {generation.status === 'generating' && (
          <div className="generation-progress">
            <div className="progress-bar-gen">
              <div
                className="progress-fill"
                style={{ width: `${generation.progress}%` }}
              />
            </div>
            <div className="progress-info">
              <span>{generation.progress}%</span>
              <span className="step-text">{generation.currentStep}</span>
            </div>
          </div>
        )}

        {generation.status === 'complete' && generation.outputImageUrl && (
          <div className="generation-result">
            <div className="result-preview">
              <img src={generation.outputImageUrl} alt="Generated" />
            </div>
            <div className="result-actions">
              <button className="action-btn save" onClick={handleSaveToSlot}>
                Save to Asset
              </button>
              <button className="action-btn discard" onClick={handleDiscard}>
                Discard
              </button>
              <button className="action-btn regenerate" onClick={handleRegenerate}>
                Regenerate
              </button>
            </div>
          </div>
        )}

        {generation.status === 'error' && (
          <div className="generation-error">
            <span className="error-icon">⚠️</span>
            <span>{generation.errorMessage || 'Generation failed'}</span>
            <button className="retry-btn" onClick={handleRegenerate}>
              Retry
            </button>
          </div>
        )}

        {/* Generate Button */}
        {generation.status === 'idle' && (
          <button
            className="generate-btn-main"
            onClick={handleGenerate}
            disabled={!prompt.trim() || !targetAssetId}
          >
            Generate Image
          </button>
        )}
      </div>
    </div>
  )
})

ImageGeneratorNode.displayName = 'ImageGeneratorNode'
