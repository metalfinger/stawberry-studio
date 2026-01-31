import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import './nodes.css'

interface AssetInfo {
    id: string
    name: string
    type: string
}

export interface ShotNodeData {
    shot_number: number
    description: string
    // Camera
    camera_angle?: string
    camera_height?: string
    camera_movement?: string
    camera_distance?: string
    // Lens
    lens_type?: string
    focal_length_mm?: string
    depth_of_field?: string
    focus_point?: string
    // Composition
    subject?: string
    subject_position?: string
    composition?: string
    foreground?: string
    background?: string
    // Overrides
    override_mood?: string
    override_lighting?: string
    override_art_style?: string
    // Effects
    aspect_ratio_override?: string
    filter_effects?: string
    speed_ramp?: string
    // Meta
    cut_count?: number
    assets?: AssetInfo[]
}

export const ShotNode = memo(({ data }: { data: ShotNodeData }) => {
    const [expanded, setExpanded] = useState(true)
    const assets = data.assets || []

    return (
        <div className={`canvas-node shot-node ${expanded ? 'expanded' : 'collapsed'}`}>
            <Handle type="target" position={Position.Top} />

            {/* Header - Always Visible */}
            <div className="node-header" onClick={() => setExpanded(!expanded)}>
                <span className="node-icon">📷</span>
                <span className="node-label">Shot {data.shot_number}</span>
                <span className="expand-toggle">{expanded ? '▼' : '▶'}</span>
            </div>

            <div className="node-description">{data.description || 'No description'}</div>

            {/* Quick Summary - Always Visible */}
            <div className="node-quick-meta">
                {data.camera_angle && <span>🎥 {data.camera_angle}</span>}
                {data.subject && <span>🎯 {data.subject}</span>}
            </div>
            <div className="node-badge">{data.cut_count || 0} cuts</div>

            {/* Expandable Details */}
            {expanded && (
                <div className="node-expanded-content">
                    {/* Camera Details */}
                    {(data.camera_movement || data.camera_height || data.camera_distance) && (
                        <div className="properties-section">
                            <div className="section-title">📷 Camera</div>
                            {data.camera_movement && (
                                <div className="property-row">
                                    <label>Movement:</label>
                                    <span className="property-value">{data.camera_movement}</span>
                                </div>
                            )}
                            {data.camera_height && (
                                <div className="property-row">
                                    <label>Height:</label>
                                    <span className="property-value">{data.camera_height}</span>
                                </div>
                            )}
                            {data.camera_distance && (
                                <div className="property-row">
                                    <label>Distance:</label>
                                    <span className="property-value">{data.camera_distance}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lens */}
                    {(data.lens_type || data.depth_of_field || data.focus_point) && (
                        <div className="properties-section">
                            <div className="section-title">🔍 Lens</div>
                            {data.lens_type && (
                                <div className="property-row">
                                    <label>Lens:</label>
                                    <span className="property-value">{data.lens_type}{data.focal_length_mm && ` (${data.focal_length_mm})`}</span>
                                </div>
                            )}
                            {data.depth_of_field && (
                                <div className="property-row">
                                    <label>DOF:</label>
                                    <span className="property-value">{data.depth_of_field}</span>
                                </div>
                            )}
                            {data.focus_point && (
                                <div className="property-row">
                                    <label>Focus:</label>
                                    <span className="property-value">{data.focus_point}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Composition */}
                    {(data.composition || data.foreground || data.background) && (
                        <div className="properties-section">
                            <div className="section-title">🎨 Composition</div>
                            {data.composition && (
                                <div className="property-row">
                                    <label>Style:</label>
                                    <span className="property-value">{data.composition}</span>
                                </div>
                            )}
                            {data.subject_position && (
                                <div className="property-row">
                                    <label>Subject Position:</label>
                                    <span className="property-value">{data.subject_position}</span>
                                </div>
                            )}
                            {data.foreground && (
                                <div className="property-row">
                                    <label>Foreground:</label>
                                    <span className="property-value">{data.foreground}</span>
                                </div>
                            )}
                            {data.background && (
                                <div className="property-row">
                                    <label>Background:</label>
                                    <span className="property-value">{data.background}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Effects */}
                    {(data.filter_effects || data.speed_ramp) && (
                        <div className="properties-section">
                            <div className="section-title">✨ Effects</div>
                            {data.filter_effects && (
                                <div className="property-row">
                                    <label>Filters:</label>
                                    <span className="property-value">{data.filter_effects}</span>
                                </div>
                            )}
                            {data.speed_ramp && (
                                <div className="property-row">
                                    <label>Speed:</label>
                                    <span className="property-value">{data.speed_ramp}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Assets Section */}
                    {assets.length > 0 && (
                        <div className="properties-section assets-section">
                            <div className="section-title">Assets ({assets.length})</div>
                            <div className="asset-tags">
                                {assets.map(a => (
                                    <span key={a.id} className={`asset-tag ${a.type}`}>
                                        {a.type === 'character' ? '👤' : a.type === 'location' ? '🏠' : '📦'} {a.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} />
        </div>
    )
})
