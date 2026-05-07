// BatchProgressCard — multi-cut/multi-asset batch with per-item status row.
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'batch_progress' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function BatchProgressCard({ msg, onIntent }: Props) {
  const done = msg.items.filter(i => i.status === 'done').length
  const total = msg.items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="console-msg">
      <div className="console-msg__agent">Batch · {done}/{total}</div>
      <div className="batch-card">
        <div className="batch-card__bar">
          <div className="batch-card__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="batch-card__items">
          {msg.items.map(item => (
            <div key={item.id} className={`batch-item batch-item--${item.status}`}>
              {item.thumb_url ? (
                <img src={item.thumb_url} alt={item.label} className="batch-item__thumb" />
              ) : (
                <div className="batch-item__thumb batch-item__thumb--empty" />
              )}
              <span className="batch-item__label">{item.label}</span>
              <span className="batch-item__status">{item.status}</span>
            </div>
          ))}
        </div>
        {msg.can_pause && (
          <div className="batch-card__actions">
            <button
              className="console-btn console-btn--ghost"
              onClick={() => onIntent('pause_batch', { batch_id: msg.batch_id }, msg.message_id)}
            >Pause</button>
            <button
              className="console-btn console-btn--ghost"
              onClick={() => onIntent('cancel_batch', { batch_id: msg.batch_id }, msg.message_id)}
            >Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
