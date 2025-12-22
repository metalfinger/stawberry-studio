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
    camera_angle?: string
    camera_movement?: string
    subject?: string
    composition?: string
    cut_count?: number
    assets?: AssetInfo[]
}

export const ShotNode = memo(({ data }: { data: ShotNodeData }) => {
    const [expanded, setExpanded] = useState(true)
    const assets = data.assets || []
    const hasDetails = data.camera_movement || data.composition

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
                    {hasDetails && (
                        <div className="properties-section">
                            <div className="section-title">Shot Properties</div>
                            {data.camera_movement && (
                                <div className="property-row">
                                    <label>Camera Movement:</label>
                                    <span className="property-value">{data.camera_movement}</span>
                                </div>
                            )}
                            {data.composition && (
                                <div className="property-row">
                                    <label>Composition:</label>
                                    <span className="property-value">{data.composition}</span>
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
