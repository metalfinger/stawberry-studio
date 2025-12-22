import { useState, useEffect } from 'react'
import type { Asset, AssetsResponse } from '../../api/client'
import { getAssets } from '../../api/client'
import './AssetPanel.css'

interface AssetPanelProps {
    projectId: string
    refreshKey?: number  // Increment to trigger refresh
    onAssetClick?: (asset: Asset) => void
}

const TYPE_ICONS: Record<string, string> = {
    character: '👤',
    location: '🏠',
    prop: '📦',
    frame: '🎬'
}

const TYPE_LABELS: Record<string, string> = {
    characters: 'Characters',
    locations: 'Locations',
    props: 'Props',
    frames: 'Frames'
}

export function AssetPanel({ projectId, refreshKey, onAssetClick }: AssetPanelProps) {
    const [assets, setAssets] = useState<AssetsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        characters: true,
        locations: true,
        props: true,
        frames: false
    })
    const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set())

    useEffect(() => {
        loadAssets()
    }, [projectId, refreshKey])

    async function loadAssets() {
        try {
            setLoading(true)
            const data = await getAssets(projectId)
            setAssets(data)
        } catch (err) {
            console.error('Failed to load assets:', err)
        } finally {
            setLoading(false)
        }
    }

    function toggleCategory(category: string) {
        setExpanded(prev => ({ ...prev, [category]: !prev[category] }))
    }

    function toggleAsset(assetId: string) {
        setExpandedAssets(prev => {
            const next = new Set(prev)
            if (next.has(assetId)) {
                next.delete(assetId)
            } else {
                next.add(assetId)
            }
            return next
        })
    }

    function renderAsset(asset: Asset, isVariant = false) {
        const hasVariants = (asset.variants?.length ?? 0) > 0
        const isExpanded = expandedAssets.has(asset.id)
        const linkedCount = asset.linked_nodes?.length ?? 0

        return (
            <div key={asset.id} className={`asset-item ${isVariant ? 'variant' : 'master'}`}>
                <div
                    className="asset-header"
                    onClick={() => hasVariants && toggleAsset(asset.id)}
                >
                    {hasVariants && (
                        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    )}
                    <span className="asset-icon">{TYPE_ICONS[asset.type]}</span>
                    <span className="asset-name" onClick={(e) => { e.stopPropagation(); onAssetClick?.(asset) }}>
                        {asset.name}
                    </span>
                    {isVariant && asset.variant_diff && (
                        <span className="variant-diff" title={asset.variant_diff}>↳</span>
                    )}
                    {linkedCount > 0 && (
                        <span className="link-badge" title={`Used in ${linkedCount} nodes`}>
                            {linkedCount}
                        </span>
                    )}
                    {asset.slot_filled ? (
                        <span className="slot-filled" title="Image generated">✓</span>
                    ) : (
                        <span className="slot-empty" title="Pending generation">○</span>
                    )}
                </div>

                {/* Variants */}
                {hasVariants && isExpanded && (
                    <div className="variants-list">
                        {asset.variants!.map(variant => renderAsset(variant, true))}
                    </div>
                )}
            </div>
        )
    }

    function renderCategory(key: keyof AssetsResponse) {
        const items = assets?.[key] ?? []
        const isExpanded = expanded[key]

        return (
            <div key={key} className="asset-category">
                <div className="category-header" onClick={() => toggleCategory(key)}>
                    <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    <span className="category-label">{TYPE_LABELS[key]}</span>
                    <span className="category-count">{items.length}</span>
                </div>
                {isExpanded && (
                    <div className="category-items">
                        {items.length === 0 ? (
                            <div className="empty-category">No {key} yet</div>
                        ) : (
                            items.map(asset => renderAsset(asset))
                        )}
                    </div>
                )}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="asset-panel loading">
                <div className="panel-header">
                    <span className="panel-icon">🎨</span>
                    <span className="panel-title">Assets</span>
                </div>
                <div className="loading-state">Loading...</div>
            </div>
        )
    }

    const totalAssets =
        (assets?.characters.length ?? 0) +
        (assets?.locations.length ?? 0) +
        (assets?.props.length ?? 0) +
        (assets?.frames.length ?? 0)

    return (
        <div className="asset-panel">
            <div className="panel-header">
                <span className="panel-icon">🎨</span>
                <span className="panel-title">Assets</span>
                <span className="total-count">{totalAssets}</span>
                <button className="refresh-btn" onClick={loadAssets} title="Refresh">↻</button>
            </div>

            <div className="panel-body">
                {renderCategory('characters')}
                {renderCategory('locations')}
                {renderCategory('props')}
                {renderCategory('frames')}
            </div>
        </div>
    )
}
