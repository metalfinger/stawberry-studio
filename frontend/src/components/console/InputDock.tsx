// InputDock — the rich chat input.
// - Reference chip rail (drop zone, paste support — Phase D fully wires it)
// - Textarea with @ # / autocomplete (Phase D)
// - Quick command bar (always-visible)
// - Agent selector
// - Send (Cmd+Enter)
import { useEffect, useRef, useState } from 'react'
import type { UserAttachment } from './types'

interface InputDockProps {
  onSend: (content: string, attachments: UserAttachment[]) => void
  agentName: string
  disabled?: boolean
}

const QUICK_COMMANDS = [
  { label: '/compose', insert: 'compose ' },
  { label: '/refine', insert: 'refine ' },
  { label: '/batch', insert: 'compose all cuts in ' },
  { label: '/list', insert: 'list ' },
]

export function InputDock({ onSend, agentName, disabled }: InputDockProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<UserAttachment[]>([])
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [text])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const insertCommand = (insert: string) => {
    setText(prev => insert + prev)
    ref.current?.focus()
  }

  return (
    <div className="input-dock" data-disabled={disabled}>
      {attachments.length > 0 && (
        <div className="input-dock__refs" role="region" aria-label="Attached references">
          {attachments.map(a => (
            <span key={a.ref_id} className="ref-chip">
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--console-surface)', display: 'inline-block',
              }} />
              <span style={{ fontSize: 10 }}>{a.ref_id.slice(0, 8)}</span>
              <button
                className="ref-chip__remove"
                onClick={() => setAttachments(prev => prev.filter(x => x.ref_id !== a.ref_id))}
                aria-label="Remove attachment"
              >×</button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        className="input-dock__textarea"
        placeholder={`Message ${agentName}... (Cmd+Enter to send)`}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled}
        rows={2}
      />

      <div className="input-dock__bar">
        <div className="input-dock__commands">
          {QUICK_COMMANDS.map(c => (
            <button
              key={c.label}
              className="input-dock__cmd"
              onClick={() => insertCommand(c.insert)}
              title={`Insert ${c.label}`}
            >{c.label}</button>
          ))}
        </div>
        <select className="input-dock__agent-select" value={agentName} disabled aria-label="Agent">
          <option>{agentName}</option>
        </select>
        <button
          className="console-btn console-btn--primary"
          onClick={submit}
          disabled={disabled || (!text.trim() && attachments.length === 0)}
        >
          Send
        </button>
      </div>
    </div>
  )
}
