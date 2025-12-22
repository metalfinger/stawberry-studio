import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import './nodes.css'

export interface BriefNodeData {
    title: string
    logline?: string
    genre?: string
    aesthetic_tags?: string[]
    artist_refs?: string[]
    scene_count?: number
}

export const BriefNode = memo(({ data }: { data: BriefNodeData }) => {
    const [expanded, setExpanded] = useState(true)
    const hasExtras = (data.aesthetic_tags && data.aesthetic_tags.length > 0) || (data.artist_refs && data.artist_refs.length > 0)

    return (
        <div className={`canvas-node brief-node ${expanded ? 'expanded' : 'collapsed'}`}>
            {/* Header - Always Visible */}
            <div className="node-header" onClick={() => setExpanded(!expanded)}>
                <span className="node-icon">💭</span>
                <span className="node-label">Project Brief</span>
                <span className="expand-toggle">{expanded ? '▼' : '▶'}</span>
            </div>

            <div className="node-title">{data.title || 'Untitled Project'}</div>

            {/* Quick Summary - Always Visible */}
            {data.genre && <div className="node-meta">🎬 {data.genre}</div>}
            <div className="node-badge">{data.scene_count || 0} scenes</div>

            {/* Expandable Details */}
            {expanded && (
                <div className="node-expanded-content">
                    {/* Logline */}
                    {data.logline && (
                        <div className="properties-section">
                            <div className="section-title">Logline</div>
                            <div className="property-value logline">{data.logline}</div>
                        </div>
                    )}

                    {/* Aesthetic Tags & Artist References */}
                    {hasExtras && (
                        <div className="properties-section">
                            {data.aesthetic_tags && data.aesthetic_tags.length > 0 && (
                                <div className="property-row">
                                    <label>Visual Style:</label>
                                    <div className="tag-list">
                                        {data.aesthetic_tags.map((tag, i) => (
                                            <span key={i} className="aesthetic-tag">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {data.artist_refs && data.artist_refs.length > 0 && (
                                <div className="property-row">
                                    <label>Artist References:</label>
                                    <div className="tag-list">
                                        {data.artist_refs.map((ref, i) => (
                                            <span key={i} className="artist-tag">{ref}</span>
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
