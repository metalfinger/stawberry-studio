// TextMessage — agent or user text.
// Agent output is markdown (headings, lists, bold, code) so we render with
// react-markdown. User echoes are plain text — also fine through the same
// renderer; markdown special chars in a user line are rare.
import ReactMarkdown from 'react-markdown'
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
        <ReactMarkdown
          components={{
            // Open links in a new tab and make code blocks visually distinct.
            a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
            code: ({ className, children, ...props }: any) => {
              const inline = !className
              return inline
                ? <code className="console-md__code" {...props}>{children}</code>
                : <pre className="console-md__pre"><code {...props}>{children}</code></pre>
            },
          }}
        >{msg.markdown}</ReactMarkdown>
      </div>
    </div>
  )
}
