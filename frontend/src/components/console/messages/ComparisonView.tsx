// ComparisonView — two images side-by-side with a draggable slider for diff.
// Used when an agent shows "before / after" or two candidate outputs.
import { useRef, useState } from 'react'
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'comparison' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function ComparisonView({ msg, onIntent }: Props) {
  const [pct, setPct] = useState(50)
  const wrapRef = useRef<HTMLDivElement>(null)

  const onMove = (e: React.MouseEvent | MouseEvent) => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (('clientX' in e ? e.clientX : 0) - rect.left) / rect.width
    setPct(Math.max(0, Math.min(100, x * 100)))
  }

  const onDown = (e: React.MouseEvent) => {
    onMove(e)
    const move = (ev: MouseEvent) => onMove(ev)
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="console-msg">
      <div className="console-msg__agent">Compare</div>
      <div className="comparison">
        <div className="comparison__viewport" ref={wrapRef} onMouseDown={onDown}>
          <img src={msg.left_url} alt={msg.left_label} className="comparison__img" />
          <div className="comparison__right" style={{ width: `${100 - pct}%` }}>
            <img src={msg.right_url} alt={msg.right_label} className="comparison__img" />
          </div>
          <div className="comparison__handle" style={{ left: `${pct}%` }} />
        </div>
        <div className="comparison__labels">
          <span>{msg.left_label}</span>
          <span>{msg.right_label}</span>
        </div>
        {msg.actions.length > 0 && (
          <div className="comparison__actions">
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
