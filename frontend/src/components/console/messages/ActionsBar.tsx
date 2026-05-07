// ActionsBar — generic prompt + button row, used for any "pick one" decision.
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'actions' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function ActionsBar({ msg, onIntent }: Props) {
  return (
    <div className="console-msg">
      <div className="actions-bar">
        <div className="actions-bar__prompt">{msg.prompt}</div>
        <div className="actions-bar__buttons">
          {msg.buttons.map(a => (
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
