import { useState, useEffect, useCallback } from 'react'
import { type Node, type Edge } from '@xyflow/react'
import {
    getCutPrompt,
    getCutHistory,
    setActiveCutImage,
    getAssets,
    getPreProductionRequirements,
    type CompiledPrompt,
    type CutGenerationRequest,
    type AssetsResponse,
    type PreProductionStatus,
} from '../../api/client'
import { ComposeProgress } from './ComposeProgress'
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
    projectId,
    cutId,
    onGenerateComplete,
}: {
    projectId: string;
    cutId: string;
    onGenerateComplete: () => void;
}) {
    const [expanded, setExpanded] = useState(true)
    const [isComposing, setIsComposing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    return (
        <div className="np-prompt-section">
            <div className="np-prompt-header" onClick={() => setExpanded(!expanded)}>
                <span>✨ Generation & Inputs</span>
                <span className="np-expand">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <>
                    {/* COMPOSE CUT — references-first single-button pipeline */}
                    <div className="np-prompt-stack" style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>
                        Compose Cut runs the full pipeline: bundles the project tree,
                        resolves identity + ranked references per linked asset (lazy-fills
                        on miss), threads the previous cut for continuity, renders via
                        Nano Banana Pro, and runs the vision critic with auto-retry.
                    </div>

                    <div className="np-actions">
                        <button
                            className="np-btn-primary"
                            onClick={() => { setIsComposing(true); setError(null); }}
                            disabled={isComposing}
                            title="Bundle full tree → resolve refs → render → critic"
                            style={{ width: '100%' }}
                        >
                            {isComposing ? 'Composing…' : '🎬 Compose Cut'}
                        </button>
                    </div>
                    <ComposeProgress
                        projectId={projectId}
                        cutId={cutId}
                        running={isComposing}
                        onDone={(imageUrl) => {
                            setIsComposing(false);
                            if (imageUrl) onGenerateComplete();
                        }}
                    />
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
                            <PromptAndGenerate
                                projectId={projectId}
                                cutId={selectedNode.id}
                                onGenerateComplete={() => {
                                    setRefreshTrigger(t => t + 1)
                                    onNodeUpdate?.()
                                }}
                            />
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
