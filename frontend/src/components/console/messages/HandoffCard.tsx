// HandoffCard — visualizes one agent passing control to another.
// The "stay with X / proceed to Y" buttons let the user veto the handoff.
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'handoff' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function HandoffCard({ msg, onIntent }: Props) {
  return (
    <div className="console-msg">
      <div className="handoff-card">
        <div className="handoff-card__flow">
          <span className="handoff-card__agent">{msg.from_agent}</span>
          <span className="handoff-card__arrow">→</span>
          <span className="handoff-card__agent handoff-card__agent--to">{msg.to_agent}</span>
        </div>
        <div className="handoff-card__reason">{msg.reason}</div>
        {msg.actions.length > 0 && (
          <div className="handoff-card__actions">
            {msg.actions.map(a => (
              <button
                key={a.intent}
                className={`console-btn ${a.primary ? 'console-btn--primary' : ''}`}
                onClick={() => onIntent(a.intent, a.payload, msg.message_id)}
              >
                {a.icon && <span style={{ marginRight: 4 }}>{a.icon}</span>}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
