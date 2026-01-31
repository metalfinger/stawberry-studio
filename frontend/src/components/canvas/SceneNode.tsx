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
    // Location
    location?: string
    location_detail?: string
    time_of_day?: string
    // Atmosphere
    lighting?: string
    lighting_color?: string
    weather?: string
    atmosphere?: string
    mood?: string
    ambient_sound?: string
    // Overrides
    override_art_style?: string
    override_color_palette?: string
    // Production Notes
    set_decoration?: string
    camera_restrictions?: string
    key_props_list?: string
    blocking_notes?: string
    // Meta
    shot_count?: number
    assets?: AssetInfo[]
}

export const SceneNode = memo(({ data }: { data: SceneNodeData }) => {
    const [expanded, setExpanded] = useState(true)
    const assets = data.assets || []
    const characters = assets.filter(a => a.type === 'character')
    const locations = assets.filter(a => a.type === 'location')
    const props = assets.filter(a => a.type === 'prop')

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
                    {/* Location Details */}
                    {(data.description || data.location_detail) && (
                        <div className="properties-section">
                            <div className="section-title">📍 Location</div>
                            {data.description && (
                                <div className="property-row">
                                    <label>Description:</label>
                                    <span className="property-value">{data.description}</span>
                                </div>
                            )}
                            {data.location_detail && (
                                <div className="property-row">
                                    <label>Detail:</label>
                                    <span className="property-value">{data.location_detail}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Atmosphere */}
                    {(data.time_of_day || data.lighting || data.weather || data.atmosphere) && (
                        <div className="properties-section">
                            <div className="section-title">🌤️ Atmosphere</div>
                            {data.time_of_day && (
                                <div className="property-row">
                                    <label>Time:</label>
                                    <span className="property-value">{data.time_of_day}</span>
                                </div>
                            )}
                            {data.lighting && (
                                <div className="property-row">
                                    <label>Lighting:</label>
                                    <span className="property-value">{data.lighting}</span>
                                </div>
                            )}
                            {data.lighting_color && (
                                <div className="property-row">
                                    <label>Light Color:</label>
                                    <span className="property-value">{data.lighting_color}</span>
                                </div>
                            )}
                            {data.weather && (
                                <div className="property-row">
                                    <label>Weather:</label>
                                    <span className="property-value">{data.weather}</span>
                                </div>
                            )}
                            {data.atmosphere && (
                                <div className="property-row">
                                    <label>Atmosphere:</label>
                                    <span className="property-value">{data.atmosphere}</span>
                                </div>
                            )}
                            {data.ambient_sound && (
                                <div className="property-row">
                                    <label>🔊 Ambient:</label>
                                    <span className="property-value">{data.ambient_sound}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Production Notes */}
                    {(data.set_decoration || data.key_props_list || data.blocking_notes) && (
                        <div className="properties-section">
                            <div className="section-title">🎬 Production Notes</div>
                            {data.set_decoration && (
                                <div className="property-row">
                                    <label>Set Dressing:</label>
                                    <span className="property-value">{data.set_decoration}</span>
                                </div>
                            )}
                            {data.key_props_list && (
                                <div className="property-row">
                                    <label>Key Props:</label>
                                    <span className="property-value">{data.key_props_list}</span>
                                </div>
                            )}
                            {data.blocking_notes && (
                                <div className="property-row">
                                    <label>Blocking:</label>
                                    <span className="property-value">{data.blocking_notes}</span>
                                </div>
                            )}
                            {data.camera_restrictions && (
                                <div className="property-row">
                                    <label>📷 Restrictions:</label>
                                    <span className="property-value">{data.camera_restrictions}</span>
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
