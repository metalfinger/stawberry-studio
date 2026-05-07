// FailureCard — surfaces an error with actionable recovery buttons.
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'failure' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function FailureCard({ msg, onIntent }: Props) {
  return (
    <div className="console-msg">
      <div className="console-msg__agent">⚠ Error</div>
      <div className="failure-card">
        <div className="failure-card__error">{msg.error}</div>
        {msg.suggestion && <div className="failure-card__suggestion">{msg.suggestion}</div>}
        {msg.recovery_actions.length > 0 && (
          <div className="failure-card__actions">
            {msg.recovery_actions.map(a => (
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
