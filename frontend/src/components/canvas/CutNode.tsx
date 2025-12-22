import { memo, useState, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { getCutPrompt, getCutHistory, type CompiledPrompt, type GenerationStep } from '../../api/client'
import './nodes.css'

interface AssetInfo {
    id: string
    name: string
    type: string
    appearance?: string
    image_url?: string
}

export interface CutNodeData {
    cut_number: number
    action: string
    story_description?: string  // Narrative intent from STORY phase
    beat_type?: string
    dialogue?: string
    expression?: string
    gesture?: string
    body_language?: string
    generation_status?: string
    generated_image_url?: string
    assets?: AssetInfo[]
    project_id?: string  // Need for API calls
    cut_id?: string       // Need for API calls
}

export const CutNode = memo(({ data, id }: { data: CutNodeData, id: string }) => {
    const [expanded, setExpanded] = useState(true)
    const [promptExpanded, setPromptExpanded] = useState(false)
    const [historyExpanded, setHistoryExpanded] = useState(false)
    const [cutPrompt, setCutPrompt] = useState<CompiledPrompt | null>(null)
    const [history, setHistory] = useState<GenerationStep[]>([])
    const [loading, setLoading] = useState(false)

    const assets = data.assets || []
    const hasDetails = data.expression || data.gesture || data.body_language

    // Load prompt and history when expanded
    useEffect(() => {
        if (promptExpanded && data.project_id && id) {
            setLoading(true)
            Promise.all([
                getCutPrompt(data.project_id, id).catch(() => null),
                getCutHistory(data.project_id, id).catch(() => [])
            ]).then(([prompt, hist]) => {
                setCutPrompt(prompt)
                setHistory(hist || [])
            }).finally(() => setLoading(false))
        }
    }, [promptExpanded, data.project_id, id])

    return (
        <div className={`canvas-node cut-node ${expanded ? 'expanded' : 'collapsed'}`}>
            <Handle type="target" position={Position.Top} />

            {/* Header - Always Visible */}
            <div className="node-header" onClick={() => setExpanded(!expanded)}>
                <span className="node-icon">✂️</span>
                <span className="node-label">Cut {data.cut_number}</span>
                {data.generation_status && (
                    <span className={`status-badge ${data.generation_status}`}>
                        {data.generation_status === 'complete' ? '✓' : '○'}
                    </span>
                )}
                <span className="expand-toggle">{expanded ? '▼' : '▶'}</span>
            </div>

            <div className="node-description">{data.action || 'No action'}</div>

            {/* Quick Summary - Always Visible */}
            {data.beat_type && <div className="node-meta">⚡ {data.beat_type}</div>}

            {/* Expandable Details */}
            {expanded && (
                <div className="node-expanded-content">
                    {/* Character Details */}
                    {hasDetails && (
                        <div className="properties-section">
                            <div className="section-title">Character Details</div>
                            {data.expression && (
                                <div className="property-row">
                                    <label>Expression:</label>
                                    <span className="property-value">{data.expression}</span>
                                </div>
                            )}
                            {data.gesture && (
                                <div className="property-row">
                                    <label>Gesture:</label>
                                    <span className="property-value">{data.gesture}</span>
                                </div>
                            )}
                            {data.body_language && (
                                <div className="property-row">
                                    <label>Body Language:</label>
                                    <span className="property-value">{data.body_language}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Dialogue */}
                    {data.dialogue && (
                        <div className="properties-section">
                            <div className="section-title">Dialogue</div>
                            <div className="node-dialogue">💬 "{data.dialogue}"</div>
                        </div>
                    )}

                    {/* Assets */}
                    {assets.length > 0 && (
                        <div className="properties-section assets-section">
                            <div className="section-title">Assets ({assets.length})</div>
                            <div className="asset-tags">
                                {assets.map(a => (
                                    <span
                                        key={a.id}
                                        className={`asset-tag ${a.type}`}
                                        title={a.appearance || a.name}
                                    >
                                        {a.type === 'character' ? '👤' : a.type === 'location' ? '🏠' : '📦'}
                                        {a.name}
                                        {a.image_url && <span className="has-image">📷</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Story Intent Section (from STORY phase) */}
                    {data.story_description && (
                        <div className="properties-section story-intent-section">
                            <div className="section-title">📖 Story Intent</div>
                            <div className="story-description">
                                {data.story_description}
                            </div>
                        </div>
                    )}

                    {/* Generation Prompt Section (compiled dynamically) */}
                    <div className="properties-section prompt-section">
                        <div
                            className="section-title clickable"
                            onClick={() => setPromptExpanded(!promptExpanded)}
                        >
                            📝 Generation Prompt {promptExpanded ? '▼' : '▶'}
                        </div>
                        {promptExpanded && (
                            <div className="prompt-content">
                                {loading ? (
                                    <div className="loading-text">Loading...</div>
                                ) : cutPrompt ? (
                                    <>
                                        {cutPrompt.reference_images && cutPrompt.reference_images.length > 0 && (
                                            <div className="prompt-refs">
                                                <strong>References:</strong>
                                                {cutPrompt.reference_images.map((ref) => (
                                                    <div key={ref.ref} className={`ref-slot ${ref.status}`}>
                                                        <span className="ref-key">{ref.ref}:</span>
                                                        <span className="ref-name">{ref.name}</span>
                                                        <span className={`ref-status ${ref.status}`}>
                                                            {ref.status === 'ready' ? '✓' : '○'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="prompt-text">
                                            <pre>{cutPrompt.prompt}</pre>
                                        </div>
                                    </>
                                ) : (
                                    <div className="no-data">No prompt generated yet</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Generation History Section */}
                    {history && history.length > 0 && (
                        <div className="properties-section history-section">
                            <div
                                className="section-title clickable"
                                onClick={() => setHistoryExpanded(!historyExpanded)}
                            >
                                🕒 History ({history.length}) {historyExpanded ? '▼' : '▶'}
                            </div>
                            {historyExpanded && (
                                <div className="history-content">
                                    {history.map((step) => (
                                        <div key={step.id} className="history-item">
                                            <div className="history-meta">
                                                <span className={`history-stage ${step.stage}`}>
                                                    {step.stage === 'pre_production' ? 'Pre-Prod' : 'Final'}
                                                </span>
                                                <span className="history-num">#{step.step_number}</span>
                                            </div>
                                            <div className="history-prompt">{step.prompt.substring(0, 100)}...</div>
                                            {step.output_image_url && (
                                                <div className="history-image">
                                                    <img src={step.output_image_url} alt="Generated" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} />
        </div>
    )
})
