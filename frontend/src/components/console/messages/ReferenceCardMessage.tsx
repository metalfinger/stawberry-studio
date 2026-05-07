// ReferenceCardMessage — a single reference thumb with provenance + status.
// Draggable so the user can drop it into the input dock or a cut node.
import type { ConsoleMessage } from '../types'

interface Props { msg: Extract<ConsoleMessage, { kind: 'reference_card' }> }

export function ReferenceCardMessage({ msg }: Props) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-strawberry-ref', JSON.stringify({ ref_id: msg.ref_id, thumb_url: msg.thumb_url, label: msg.label }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="console-msg">
      <div
        className={`ref-card ref-card--${msg.status}`}
        draggable
        onDragStart={onDragStart}
        title={`${msg.asset_name} · ${msg.label}`}
      >
        <img src={msg.thumb_url} alt={msg.label} className="ref-card__thumb" />
        <div className="ref-card__body">
          <div className="ref-card__label">{msg.label}</div>
          <div className="ref-card__sub">{msg.asset_name}</div>
        </div>
        <div className="ref-card__status">
          {msg.status === 'cached' && <span title="Reused from library">cached</span>}
          {msg.status === 'generating' && <span className="elapsed__spinner" />}
          {msg.status === 'newly_generated' && (
            <span title="Newly generated">
              new{msg.cost_usd != null && ` · $${msg.cost_usd.toFixed(2)}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
