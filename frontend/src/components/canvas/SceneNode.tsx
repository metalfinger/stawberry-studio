import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import './nodes.css'

interface AssetInfo {
    id: string
    name: string
    type: string
    usage?: string
}

export interface SceneNodeData {
    scene_number: number
    title: string
    description?: string
    location?: string
    time_of_day?: string
    lighting?: string
    mood?: string
    shot_count?: number
    assets?: AssetInfo[]
}

export const SceneNode = memo(({ data }: { data: SceneNodeData }) => {
    const [expanded, setExpanded] = useState(true)
    const assets = data.assets || []
    const characters = assets.filter(a => a.type === 'character')
    const locations = assets.filter(a => a.type === 'location')
    const props = assets.filter(a => a.type === 'prop')

    const hasDetails = data.description || data.time_of_day || data.lighting

    return (
        <div className={`canvas-node scene-node ${expanded ? 'expanded' : 'collapsed'}`}>
            <Handle type="target" position={Position.Top} />

            {/* Header - Always Visible */}
            <div className="node-header" onClick={() => setExpanded(!expanded)}>
                <span className="node-icon">🎬</span>
                <span className="node-label">Scene {data.scene_number}</span>
                <span className="expand-toggle">{expanded ? '▼' : '▶'}</span>
            </div>

            <div className="node-title">{data.title || 'Untitled'}</div>

            {/* Quick Summary - Always Visible */}
            <div className="node-quick-meta">
                {data.location && <span>📍 {data.location}</span>}
                {data.mood && <span>🎭 {data.mood}</span>}
            </div>
            <div className="node-badge">{data.shot_count || 0} shots</div>

            {/* Expandable Details */}
            {expanded && (
                <div className="node-expanded-content">
                    {hasDetails && (
                        <div className="properties-section">
                            <div className="section-title">Scene Properties</div>
                            {data.description && (
                                <div className="property-row">
                                    <label>Description:</label>
                                    <span className="property-value">{data.description}</span>
                                </div>
                            )}
                            {data.time_of_day && (
                                <div className="property-row">
                                    <label>Time of Day:</label>
                                    <span className="property-value">{data.time_of_day}</span>
                                </div>
                            )}
                            {data.lighting && (
                                <div className="property-row">
                                    <label>Lighting:</label>
                                    <span className="property-value">{data.lighting}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Assets Section */}
                    {assets.length > 0 && (
                        <div className="properties-section assets-section">
                            <div className="section-title">Assets ({assets.length})</div>
                            {characters.length > 0 && (
                                <div className="asset-group">
                                    <span className="asset-type-label">👤 Characters:</span>
                                    <div className="asset-tags">
                                        {characters.map(c => (
                                            <span key={c.id} className="asset-tag character">
                                                {c.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {locations.length > 0 && (
                                <div className="asset-group">
                                    <span className="asset-type-label">🏠 Locations:</span>
                                    <div className="asset-tags">
                                        {locations.map(l => (
                                            <span key={l.id} className="asset-tag location">
                                                {l.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {props.length > 0 && (
                                <div className="asset-group">
                                    <span className="asset-type-label">📦 Props:</span>
                                    <div className="asset-tags">
                                        {props.map(p => (
                                            <span key={p.id} className="asset-tag prop">
                                                {p.name}
                                            </span>
                                        ))}
                                    </div>
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
