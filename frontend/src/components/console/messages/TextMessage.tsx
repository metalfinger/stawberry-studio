import type { ConsoleMessage } from '../types'

interface Props { msg: Extract<ConsoleMessage, { kind: 'text' }> }

export function TextMessage({ msg }: Props) {
  const isUser = msg.agent_name === 'You'
  return (
    <div className="console-msg">
      {msg.agent_name && (
        <div className={`console-msg__agent ${isUser ? 'console-msg__user-tag' : ''}`}>
          {msg.agent_name}
        </div>
      )}
      <div className={`console-text ${isUser ? 'console-text--user' : ''}`}>
        {msg.markdown}
      </div>
    </div>
  )
}
