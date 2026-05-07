// IdleSuggestion — agent proposes "next thing to do" when the user is idle.
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'idle_suggestion' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function IdleSuggestion({ msg, onIntent }: Props) {
  return (
    <div className="console-msg">
      <div className="console-msg__agent">💡 Suggestion</div>
      <div className="idle-card">
        <div className="idle-card__reason">{msg.reasoning}</div>
        <div className="idle-card__actions">
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
      </div>
    </div>
  )
}
