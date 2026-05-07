import { memo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps, useNodes, useEdges } from '@xyflow/react'
import { NodeProperties } from './NodeProperties'
import { readRefDrag } from '../dnd/refDragData'
import { assignSlot } from '../../api/client'
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
    story_description?: string
    // Character Action
    dialogue?: string
    expression?: string
    body_language?: string
    gesture?: string
    gaze_direction?: string
    // Beat & Timing
    beat_type?: string
    duration_hint?: string
    transition?: string
    // Continuity
    continuity_notes?: string
    character_state?: string
    object_tracking?: string
    lighting_continuity?: string
    // Overrides
    override_camera_distance?: string
    override_focus_point?: string
    override_lighting?: string
    override_mood?: string
    // Production Notes
    costume_notes?: string
    prop_interaction?: string
    emotional_arc?: string
    sfx_notes?: string
    music_cue?: string
    // Generation
    generation_status?: string
    generated_image_url?: string
    image_slots?: string // JSON string
    // Meta
    assets?: AssetInfo[]
    project_id?: string
    cut_id?: string
}

export const CutNode = memo(({ data, selected, id }: NodeProps & { data: CutNodeData }) => {
    const [expanded, setExpanded] = useState(true)
    const [activeImage, setActiveImage] = useState(data.generated_image_url)
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
    const [dropping, setDropping] = useState(false)

    // Drop a reference onto the cut → assign to the next free slot.
    const onDropRef = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDropping(false)
        const payload = readRefDrag(e)
        if (!payload || !data.project_id || !data.cut_id) return
        let nextSlot = 0
        try {
            const slots = data.image_slots ? JSON.parse(data.image_slots) : {}
            const taken = Object.keys(slots).map(Number).filter(n => !isNaN(n))
            nextSlot = taken.length ? Math.max(...taken) + 1 : 0
        } catch { nextSlot = 0 }
        try {
            await assignSlot(data.project_id, data.cut_id, nextSlot, payload.ref_id)
        } catch (err) {
            console.error('slot assign failed', err)
        }
    }, [data.cut_id, data.project_id, data.image_slots])

    const onDragOverRef = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-strawberry-ref')) {
            e.preventDefault()
            e.stopPropagation()
            setDropping(true)
        }
    }
    const onDragLeaveRef = () => setDropping(false)

    // For Inspector Context
    const nodes = useNodes()
    const edges = useEdges()
    const myNode = nodes.find(n => n.id === id) || null

    useEffect(() => {
        setPortalTarget(document.getElementById('properties-panel-portal'))
    }, [])

    // Sync external data changes
    useEffect(() => {
        setActiveImage(data.generated_image_url)
    }, [data.generated_image_url])

    const assets = data.assets || []

    // Callback when actions happen in the Side Panel (Generation, Set Active)
    const handleInspectorUpdate = useCallback((newImageUrl?: string) => {
        if (newImageUrl) {
            setActiveImage(newImageUrl)
        }
    }, [])

    return (
        <div
            className={`canvas-node cut-node ${expanded ? 'expanded' : 'collapsed'} ${selected ? 'selected' : ''} ${dropping ? 'cut-slot--drop' : ''}`}
            onDrop={onDropRef}
            onDragOver={onDragOverRef}
            onDragLeave={onDragLeaveRef}
        >
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

            {/* IMAGE PREVIEW AREA */}
            {expanded && (
                <div className="cut-visual-area">
                    {activeImage ? (
                        <div className="cut-image-preview">
                            <img src={activeImage} alt={`Cut ${data.cut_number}`} />
                        </div>
                    ) : (
                        <div className="cut-image-placeholder">
                            Select to Generate
                        </div>
                    )}
                </div>
            )}

            {/* Quick Summary - Always Visible */}
            {data.beat_type && <div className="node-meta">⚡ {data.beat_type}</div>}

            {/* Expandable Details */}
            {expanded && (
                <div className="node-expanded-content">
                    {/* Character Action (Core Performance) */}
                    {(data.expression || data.body_language || data.gaze_direction) && (
                        <div className="properties-section">
                            <div className="section-title">🎭 Character Action</div>
                            {data.expression && (
                                <div className="property-row">
                                    <label>Expression:</label>
                                    <span className="property-value">{data.expression}</span>
                                </div>
                            )}
                            {data.body_language && (
                                <div className="property-row">
                                    <label>Body Language:</label>
                                    <span className="property-value">{data.body_language}</span>
                                </div>
                            )}
                            {data.gaze_direction && (
                                <div className="property-row">
                                    <label>👁️ Gaze:</label>
                                    <span className="property-value">{data.gaze_direction}</span>
                                </div>
                            )}
                            {data.gesture && (
                                <div className="property-row">
                                    <label>Gesture:</label>
                                    <span className="property-value">{data.gesture}</span>
                                </div>
                            )}
                            {data.character_state && (
                                <div className="property-row">
                                    <label>State:</label>
                                    <span className="property-value">{data.character_state}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Timing & Beat */}
                    {(data.duration_hint || data.transition || data.emotional_arc) && (
                        <div className="properties-section">
                            <div className="section-title">⏱️ Timing</div>
                            {data.duration_hint && (
                                <div className="property-row">
                                    <label>Duration:</label>
                                    <span className="property-value">{data.duration_hint}</span>
                                </div>
                            )}
                            {data.transition && (
                                <div className="property-row">
                                    <label>Transition:</label>
                                    <span className="property-value">{data.transition}</span>
                                </div>
                            )}
                            {data.emotional_arc && (
                                <div className="property-row">
                                    <label>Emotion Arc:</label>
                                    <span className="property-value">{data.emotional_arc}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Continuity */}
                    {(data.continuity_notes || data.costume_notes || data.prop_interaction) && (
                        <div className="properties-section">
                            <div className="section-title">🔗 Continuity</div>
                            {data.costume_notes && (
                                <div className="property-row">
                                    <label>👕 Costume:</label>
                                    <span className="property-value">{data.costume_notes}</span>
                                </div>
                            )}
                            {data.prop_interaction && (
                                <div className="property-row">
                                    <label>📦 Props:</label>
                                    <span className="property-value">{data.prop_interaction}</span>
                                </div>
                            )}
                            {data.continuity_notes && (
                                <div className="property-row">
                                    <label>Notes:</label>
                                    <span className="property-value">{data.continuity_notes}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Production Notes */}
                    {(data.sfx_notes || data.music_cue) && (
                        <div className="properties-section">
                            <div className="section-title">🔊 Sound</div>
                            {data.sfx_notes && (
                                <div className="property-row">
                                    <label>SFX:</label>
                                    <span className="property-value">{data.sfx_notes}</span>
                                </div>
                            )}
                            {data.music_cue && (
                                <div className="property-row">
                                    <label>🎵 Music:</label>
                                    <span className="property-value">{data.music_cue}</span>
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
                </div>
            )}

            <Handle type="source" position={Position.Bottom} />

            {/* INSPECTOR PORTAL */}
            {selected && portalTarget && data.project_id && myNode && createPortal(
                <NodeProperties
                    selectedNode={myNode}
                    nodes={nodes}
                    edges={edges}
                    projectId={data.project_id}
                    onClose={() => { /* Cannot deselect easily from here without store access */ }}
                    onNodeUpdate={handleInspectorUpdate}
                />,
                portalTarget
            )}
        </div>
    )
})
