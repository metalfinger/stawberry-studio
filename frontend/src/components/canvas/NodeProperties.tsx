import { useState, useEffect } from 'react'
import { type Node, type Edge } from '@xyflow/react'
import { getCutPrompt, getCutHistory, type CompiledPrompt, type GenerationStep } from '../../api/client'
import './NodeProperties.css'

interface NodePropertiesProps {
    selectedNode: Node | null
    nodes: Node[]
    edges: Edge[]
    projectId: string
    onClose: () => void
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

function PromptDisplay({ prompt }: { prompt: CompiledPrompt }) {
    const [expanded, setExpanded] = useState(true)

    return (
        <div className="np-prompt-section">
            <div className="np-prompt-header" onClick={() => setExpanded(!expanded)}>
                <span>📝 Nano Banana Pro Prompt</span>
                <span className="np-expand">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <>
                    {prompt.reference_images && prompt.reference_images.length > 0 && (
                        <div className="np-prompt-slots">
                            <div className="np-slots-title">Reference Images:</div>
                            {prompt.reference_images.map((ref) => (
                                <div key={ref.ref} className={`np-slot ${ref.status}`}>
                                    <span className="np-slot-key">{ref.ref}:</span>
                                    <span className="np-slot-name">{ref.name}</span>
                                    <span className="np-slot-type">({ref.type})</span>
                                    <span className={`np-slot-status ${ref.status}`}>
                                        {ref.status === 'ready' ? '✓' : '○'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="np-prompt-text">
                        <pre>{prompt.prompt}</pre>
                    </div>
                </>
            )}
        </div>
    )
}

function HistoryDisplay({ history }: { history: GenerationStep[] }) {
    const [expanded, setExpanded] = useState(false)

    if (!history || history.length === 0) return null

    return (
        <div className="np-prompt-section">
            <div className="np-prompt-header" onClick={() => setExpanded(!expanded)}>
                <span>🕒 Generation History ({history.length})</span>
                <span className="np-expand">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <div className="np-history-list">
                    {history.map((step) => (
                        <div key={step.id} className="np-history-item">
                            <div className="np-history-meta">
                                <span className={`np-history-stage ${step.stage}`}>
                                    {step.stage === 'pre_production' ? 'Pre-Prod' : 'Final'}
                                </span>
                                <span className="np-history-num">#{step.step_number}</span>
                                <span className="np-history-time">
                                    {new Date(step.created_at).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className="np-history-prompt">{step.prompt}</div>
                            {step.output_image_url && (
                                <div className="np-history-image">
                                    <img src={step.output_image_url} alt="Generated output" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function NodeProperties({ selectedNode, nodes, edges, projectId, onClose }: NodePropertiesProps) {
    const [cutPrompt, setCutPrompt] = useState<CompiledPrompt | null>(null)
    const [history, setHistory] = useState<GenerationStep[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (selectedNode?.type === 'cut' && projectId) {
            setLoading(true)
            // Fetch both prompt and history
            Promise.all([
                getCutPrompt(projectId, selectedNode.id).catch(() => null),
                getCutHistory(projectId, selectedNode.id).catch(() => [])
            ]).then(([prompt, hist]) => {
                setCutPrompt(prompt)
                setHistory(hist || [])
            }).finally(() => setLoading(false))
        } else {
            setCutPrompt(null)
            setHistory([])
        }
    }, [selectedNode, projectId])

    if (!selectedNode) return null

    const ancestors = getAncestors(selectedNode, nodes, edges)

    return (
        <div className="node-properties">
            <div className="np-header">
                <span className="np-title">Node Details</span>
                <button className="np-close" onClick={onClose}>×</button>
            </div>
            <div className="np-body">
                <NodeSummary node={selectedNode} />

                {selectedNode.type === 'cut' && (
                    loading ? (
                        <div className="np-loading">Loading details...</div>
                    ) : (
                        <>
                            {cutPrompt && <PromptDisplay prompt={cutPrompt} />}
                            {history && history.length > 0 && <HistoryDisplay history={history} />}
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


