import { memo } from 'react'
import { type NodeProps, NodeResizer } from '@xyflow/react'

export interface AssetGroupNodeData {
  groupType: 'character' | 'location' | 'prop'
  title: string
  count: number
  expanded?: boolean
}

const groupColors: Record<string, { border: string; headerBg: string; icon: string }> = {
  character: { headerBg: 'linear-gradient(135deg, #059669 0%, #047857 100%)', border: '#10b981', icon: '👤' },
  location: { headerBg: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)', border: '#06b6d4', icon: '📍' },
  prop: { headerBg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', border: '#f59e0b', icon: '🔧' },
}

export const AssetGroupNode = memo(({ data, selected }: NodeProps & { data: AssetGroupNodeData }) => {
  const colors = groupColors[data.groupType] || groupColors.character

  // This is a group container node - it only renders the header
  // Child nodes (AssetMasterNode) are positioned relative to this via parentId
  // The actual content area is transparent so children show through
  return (
    <>
      {/* Resizer - shows when selected */}
      <NodeResizer
        color={colors.border}
        isVisible={selected}
        minWidth={350}
        minHeight={150}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 2,
        }}
      />

      <div
        className="asset-group-node-wrapper"
        style={{
          borderColor: colors.border,
        }}
      >
        {/* Header bar at the top */}
        <div
          className="asset-group-header-bar"
          style={{ background: colors.headerBg }}
        >
          <span className="node-icon">{colors.icon}</span>
          <span className="node-label">{data.title}</span>
          <span className="asset-count-badge">{data.count}</span>
        </div>

        {/* Content area is empty - children are positioned by React Flow */}
        {data.count === 0 && (
          <div className="empty-group-message">
            No {data.groupType}s yet
          </div>
        )}
      </div>
    </>
  )
})

AssetGroupNode.displayName = 'AssetGroupNode'
