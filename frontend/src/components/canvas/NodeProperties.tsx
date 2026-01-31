import { useState, useEffect, useCallback } from 'react'
import { type Node, type Edge } from '@xyflow/react'
import {
    getCutPrompt,
    getCutHistory,
    generateCutImage,
    setActiveCutImage,
    getAssets,
    getPreProductionRequirements,
    updateCutSlots,
    type CompiledPrompt,
    type CutGenerationRequest,
    type AssetsResponse,
    type PreProductionStatus,
} from '../../api/client'
import './NodeProperties.css'

interface NodePropertiesProps {
    selectedNode: Node | null
    nodes: Node[]
    edges: Edge[]
    projectId: string
    onClose: () => void
    onNodeUpdate?: (newImageUrl?: string) => void // Callback to refresh canvas node
}

function getParentNode(nodeId: string, nodes: Node[], edges: Edge[]): Node | null {
    const incomingEdge = edges.find(e => e.target === nodeId)
    if (!incomingEdge) return null
    return nodes.find(n => n.id === incomingEdge.source) || null
}

function getAncestors(node: Node, nodes: Node[], edges: Edge[]): Node[] {
    const ancestors: Node[] = []
    let current: Node | null = node
    while (current) {
        const parent = getParentNode(current.id, nodes, edges)
        if (parent) ancestors.push(parent)
        current = parent
    }
    return ancestors
}

function NodeSummary({ node, isParent }: { node: Node; isParent?: boolean }) {
    const d = node.data as Record<string, unknown>
    const type = node.type || 'unknown'

    return (
        <div className={`np-section ${isParent ? 'np-parent' : ''}`}>
            <div className="np-section-header">
                <span className="np-type">{type.toUpperCase()}</span>
                {isParent && <span className="np-parent-label">↑ parent</span>}
            </div>
            <div className="np-section-body">
                {type === 'brief' && (
                    <>
                        <div className="np-field"><label>Title</label><span>{String(d.title || '-')}</span></div>
                        <div className="np-field"><label>Genre</label><span>{String(d.genre || '-')}</span></div>
                    </>
                )}
                {type === 'scene' && (
                    <>
                        <div className="np-field"><label>Scene</label><span>#{String(d.scene_number)} - {String(d.title || '-')}</span></div>
                        <div className="np-field"><label>Location</label><span>{String(d.location || '-')}</span></div>
                    </>
                )}
                {type === 'shot' && (
                    <>
                        <div className="np-field"><label>Shot</label><span>#{String(d.shot_number)}</span></div>
                        <div className="np-field"><label>Camera</label><span>{String(d.camera_angle || '-')}</span></div>
                        <div className="np-field"><label>Description</label><span>{String(d.description || '-')}</span></div>
                    </>
                )}
                {type === 'cut' && (
                    <>
                        <div className="np-field"><label>Cut</label><span>#{String(d.cut_number)}</span></div>
                        <div className="np-field"><label>Action</label><span>{String(d.action || '-')}</span></div>
                        <div className="np-field"><label>Beat</label><span>{String(d.beat_type || '-')}</span></div>
                    </>
                )}
            </div>
        </div>
    )
}

function PreProductionPanel({
    projectId,
    cutId
}: {
    projectId: string
    cutId: string
}) {
    const [expanded, setExpanded] = useState(false)
    const [status, setStatus] = useState<PreProductionStatus | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const checkRequirements = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getPreProductionRequirements(projectId, cutId)
            setStatus(result)
            setExpanded(true)
        } catch (e: any) {
            setError(e.message || 'Failed to check requirements')
        } finally {
            setLoading(false)
        }
    }, [projectId, cutId])

    return (
        <div className="np-preprod-section">
            <div
                className="np-preprod-header"
                onClick={() => setExpanded(!expanded)}
            >
                <span>🔧 Pre-Production Status</span>
                <span className="np-expand">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <div className="np-preprod-body">
                    <button
                        className="np-btn-check"
                        onClick={checkRequirements}
                        disabled={loading}
                    >
                        {loading ? 'Checking...' : '🔍 Check Requirements'}
                    </button>

                    {error && <div className="np-error">{error}</div>}

                    {status && (
                        <>
                            {/* Requirements (Missing) */}
                            {status.requirements.length > 0 ? (
                                <div className="np-preprod-reqs">
                                    <div className="np-preprod-label">⚠️ Missing ({status.requirements.length}):</div>
                                    {status.requirements.map((req, i) => (
                                        <div key={i} className="np-preprod-item missing">
                                            <span className="np-preprod-type">{req.type.replace('_', ' ')}</span>
                                            <span className="np-preprod-name">{req.name}</span>
                                            <span className="np-preprod-action">{req.action}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="np-preprod-ready">✅ All assets ready!</div>
                            )}

                            {/* Ready References */}
                            {status.ready_references.length > 0 && (
                                <div className="np-preprod-refs">
                                    <div className="np-preprod-label">✓ Ready ({status.ready_references.length}):</div>
                                    {status.ready_references.map((ref, i) => (
                                        <div key={i} className="np-preprod-item ready">
                                            <span className="np-preprod-type">{ref.type}</span>
                                            <span className="np-preprod-name">{ref.name}</span>
                                            {ref.image_url && (
                                                <div className="np-slot-thumb-small">
                                                    <img src={ref.image_url} alt={ref.name} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Continuity Option */}
                            {status.continuity_option && (
                                <div className="np-preprod-continuity">
                                    <div className="np-preprod-label">🔗 Continuity Available:</div>
                                    <div className="np-preprod-item continuity">
                                        <span>Previous cut available for i2i base</span>
                                        {status.continuity_option.image_url && (
                                            <div className="np-slot-thumb-small">
                                                <img src={status.continuity_option.image_url} alt="Previous" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function PromptAndGenerate({
    prompt,
    projectId,
    cutId,
    assets,
    onGenerateComplete,
    initialSlots
}: {
    prompt: CompiledPrompt;
    projectId: string;
    cutId: string;
    assets: AssetsResponse | null;
    onGenerateComplete: () => void;
    initialSlots?: string;
}) {
    const [expanded, setExpanded] = useState(true)
    const [editablePrompt, setEditablePrompt] = useState(prompt.prompt)
    const [isGenerating, setIsGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Unified slots state: @Image1 to @Image5
    // We initialize from both prompt.reference_images (standard) and initialSlots (persisted overrides)
    const [unifiedSlots, setUnifiedSlots] = useState<Record<string, string>>(() => {
        const slots: Record<string, string> = {}
        // 1. Load from prompt (server-calculated defaults)
        prompt.reference_images?.forEach(ref => {
            if (ref.asset_id) slots[ref.ref] = ref.asset_id
        })
        // 2. Override with persisted selections if any
        if (initialSlots) {
            try {
                const parsed = JSON.parse(initialSlots)
                Object.assign(slots, parsed)
            } catch (e) {
                console.error("Error parsing initialSlots", e)
            }
        }
        return slots
    })

    // Auto-detect continuity for @Image4 if empty
    useEffect(() => {
        if (!unifiedSlots['@Image4'] && assets?.frames) {
            const sortedFrames = [...assets.frames].sort((a, b) =>
                new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            )
            const lastFrame = sortedFrames[0]
            if (lastFrame) {
                setUnifiedSlots(prev => ({ ...prev, '@Image4': lastFrame.id }))
            }
        }
    }, [assets?.frames])

    // Reset local prompt when upstream prompt changes
    useEffect(() => {
        setEditablePrompt(prompt.prompt)
    }, [prompt.prompt])

    const handleGenerate = async () => {
        setIsGenerating(true)
        setError(null)
        try {
            // Save unified slots to DB
            await updateCutSlots(projectId, cutId, unifiedSlots)

            // Generate
            const hasChanges = editablePrompt !== prompt.prompt
            await generateCutImage(projectId, cutId, hasChanges ? editablePrompt : undefined)
            onGenerateComplete()
        } catch (e: any) {
            setError(e.message || 'Generation failed')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSlotChange = (slot: string, assetId: string) => {
        setUnifiedSlots(prev => ({ ...prev, [slot]: assetId }))
    }

    const getCandidateAssets = (type: string) => {
        if (!assets) return []
        // Include frames for all types as potential references
        const frames = assets.frames || []
        let candidates: any[] = []
        if (type === 'character') candidates = [...assets.characters, ...frames]
        else if (type === 'location') candidates = [...assets.locations, ...frames]
        else if (type === 'prop') candidates = [...assets.props, ...frames]
        else if (type === 'frame') candidates = frames
        // For "any" type, return all assets
        else candidates = [...assets.characters, ...assets.locations, ...assets.props, ...frames]

        // Deduplicate by ID to avoid React key warnings
        const seen = new Map()
        return candidates.filter(a => {
            if (seen.has(a.id)) return false
            seen.set(a.id, true)
            return true
        })
    }

    return (
        <div className="np-prompt-section">
            <div className="np-prompt-header" onClick={() => setExpanded(!expanded)}>
                <span>✨ Generation & Inputs</span>
                <span className="np-expand">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <>
                    {/* UNIFIED INPUT SLOTS */}
                    <div className="np-prompt-slots">
                        <div className="np-slots-title">Inputs (@Image1-5):</div>
                        {['@Image1', '@Image2', '@Image3', '@Image4', '@Image5'].map((slotKey) => {
                            const selectedId = unifiedSlots[slotKey] || ''
                            const allAssets = getCandidateAssets('any')
                            const selectedAsset = allAssets.find(a => a.id === selectedId)

                            return (
                                <div key={slotKey} className="np-slot-unified">
                                    <div className="np-slot-row-main">
                                        <span className="np-slot-key">{slotKey}:</span>
                                        <select
                                            className="np-swap-select"
                                            value={selectedId}
                                            onChange={(e) => handleSlotChange(slotKey, e.target.value)}
                                        >
                                            <option value="">-- No reference --</option>
                                            <optgroup label="🖼️ Generated Frames (Continuity)">
                                                {(assets?.frames || []).map(a => (
                                                    <option key={`${slotKey}-${a.id}`} value={a.id}>{a.name}</option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="👤 Characters">
                                                {(assets?.characters || []).map(a => (
                                                    <option key={`${slotKey}-${a.id}`} value={a.id}>{a.name}</option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="🏠 Locations">
                                                {(assets?.locations || []).map(a => (
                                                    <option key={`${slotKey}-${a.id}`} value={a.id}>{a.name}</option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="📦 Props">
                                                {(assets?.props || []).map(a => (
                                                    <option key={`${slotKey}-${a.id}`} value={a.id}>{a.name}</option>
                                                ))}
                                            </optgroup>
                                        </select>
                                    </div>
                                    {selectedAsset?.image_url && (
                                        <div className="np-slot-preview">
                                            <img src={selectedAsset.image_url} alt={selectedAsset.name} />
                                            <span className="np-slot-preview-name">{selectedAsset.name}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* PROMPT EDITOR */}
                    <div className="np-prompt-stack">
                        <label>Prompt (Agent Compiled):</label>
                        <textarea
                            className="np-prompt-input"
                            value={editablePrompt}
                            onChange={(e) => setEditablePrompt(e.target.value)}
                            rows={10}
                        />
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="np-actions">
                        <button
                            className="np-btn-primary"
                            onClick={handleGenerate}
                            disabled={isGenerating}
                        >
                            {isGenerating ? 'Generating...' : '🚀 Generate Visual'}
                        </button>
                    </div>
                    {error && <div className="np-error">{error}</div>}
                </>
            )}
        </div>
    )
}

function HistoryDisplay({
    history,
    activeUrl,
    onSetActive
}: {
    history: CutGenerationRequest[];
    activeUrl?: string;
    onSetActive: (genId: string) => void
}) {
    const [expanded, setExpanded] = useState(true)

    if (!history || history.length === 0) return null

    return (
        <div className="np-prompt-section">
            <div className="np-prompt-header" onClick={() => setExpanded(!expanded)}>
                <span>🕒 History ({history.length})</span>
                <span className="np-expand">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <div className="np-history-list">
                    {history.map((req) => (
                        <div key={req.id} className="np-history-item">
                            <div className="np-history-meta">
                                <span className={`np-history-stage ${req.status}`}>
                                    {req.status}
                                </span>
                                <span className="np-history-time">
                                    {new Date(req.created_at).toLocaleTimeString()}
                                </span>
                            </div>

                            {req.output_image_url ? (
                                <div className="np-history-visual">
                                    <img src={req.output_image_url} alt="Generated output" />
                                    {req.output_image_url === activeUrl ? (
                                        <span className="np-tag-active">Active</span>
                                    ) : (
                                        <button
                                            className="np-btn-small"
                                            onClick={() => onSetActive(req.id)}
                                        >
                                            Set Active
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="np-history-prompt">{req.prompt.substring(0, 100)}...</div>
                            )}

                            {req.error_message && <div className="np-history-error">{req.error_message}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function NodeProperties({ selectedNode, nodes, edges, projectId, onClose, onNodeUpdate }: NodePropertiesProps) {
    const [cutPrompt, setCutPrompt] = useState<CompiledPrompt | null>(null)
    const [history, setHistory] = useState<CutGenerationRequest[]>([])
    const [assets, setAssets] = useState<AssetsResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const d = selectedNode?.data as any
    const activeUrl = d?.generated_image_url

    const fetchDetails = () => {
        if (selectedNode?.type === 'cut' && projectId) {
            setLoading(true)
            Promise.all([
                getCutPrompt(projectId, selectedNode.id).catch(() => null),
                getCutHistory(projectId, selectedNode.id).catch(() => []),
                getAssets(projectId).catch(() => null)
            ]).then(([prompt, hist, allAssets]) => {
                setCutPrompt(prompt);
                setHistory(hist || []);
                setAssets(allAssets);
            }).finally(() => setLoading(false))
        }
    }

    useEffect(() => {
        fetchDetails()
    }, [selectedNode, projectId, refreshTrigger])

    const handleSetActive = async (genId: string) => {
        if (!selectedNode) return
        try {
            const result = await setActiveCutImage(projectId, selectedNode.id, genId)
            setRefreshTrigger(prev => prev + 1)
            if (onNodeUpdate) onNodeUpdate(result.active_url)
        } catch (e) {
            console.error(e)
        }
    }



    if (!selectedNode) return null

    const ancestors = getAncestors(selectedNode, nodes, edges)

    return (
        <div className="node-properties">
            <div className="np-header">
                <span className="np-title">Node Inspector</span>
                <button className="np-close" onClick={onClose}>×</button>
            </div>
            <div className="np-body">
                <NodeSummary node={selectedNode} />

                {selectedNode.type === 'cut' && (
                    loading && !cutPrompt ? (
                        <div className="np-loading">Loading details...</div>
                    ) : (
                        <>
                            {cutPrompt && (
                                <PromptAndGenerate
                                    prompt={cutPrompt}
                                    projectId={projectId}
                                    cutId={selectedNode.id}
                                    assets={assets}
                                    onGenerateComplete={() => setRefreshTrigger(t => t + 1)}
                                    initialSlots={(selectedNode.data as any).image_slots}
                                />
                            )}
                            <PreProductionPanel
                                projectId={projectId}
                                cutId={selectedNode.id}
                            />
                            <HistoryDisplay
                                history={history}
                                activeUrl={activeUrl}
                                onSetActive={handleSetActive}
                            />
                        </>
                    )
                )}

                {ancestors.map((ancestor) => (
                    <NodeSummary key={ancestor.id} node={ancestor} isParent />
                ))}
            </div>
            <div className="np-id">
                ID: {selectedNode.id}
            </div>
        </div>
    )
}
