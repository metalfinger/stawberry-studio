// ToolCallTag — compact one-line trace of an agent tool call.
// Click to expand args/result for debugging.
import { useState } from 'react'
import type { ConsoleMessage } from '../types'

interface Props { msg: Extract<ConsoleMessage, { kind: 'tool_call' }> }

export function ToolCallTag({ msg }: Props) {
  const [open, setOpen] = useState(false)
  const icon = msg.status === 'running' ? '⏳' : msg.status === 'done' ? '✓' : '✗'

  return (
    <div className="console-msg">
      <div className={`tool-call tool-call--${msg.status}`}>
        <button className="tool-call__head" onClick={() => setOpen(o => !o)}>
          <span className="tool-call__icon">{icon}</span>
          <span className="tool-call__name">{msg.name}</span>
          {msg.latency_ms != null && <span className="tool-call__meta">{msg.latency_ms}ms</span>}
          {msg.cost_usd != null && msg.cost_usd > 0 && (
            <span className="tool-call__meta">${msg.cost_usd.toFixed(3)}</span>
          )}
        </button>
        {open && (
          <pre className="tool-call__body">
            {JSON.stringify({ args: msg.args, result: msg.result }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
