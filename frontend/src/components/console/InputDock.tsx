// InputDock — the rich chat input.
// - Reference chip rail (drop zone, paste support — Phase D fully wires it)
// - Textarea with @ # / autocomplete (Phase D)
// - Quick command bar (always-visible)
// - Agent selector
// - Send (Cmd+Enter)
import { useEffect, useRef, useState } from 'react'
import type { UserAttachment } from './types'
import { readRefDrag } from '../dnd/refDragData'
import { useHoverPreview } from '../dnd/HoverPreview'

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
  const [chipMeta, setChipMeta] = useState<Record<string, { url: string; label: string }>>({})
  const [dragOver, setDragOver] = useState(false)
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const payload = readRefDrag(e)
    if (!payload) return
    setAttachments(prev => prev.some(a => a.ref_id === payload.ref_id) ? prev : [...prev, { kind: 'reference', ref_id: payload.ref_id }])
    setChipMeta(prev => ({ ...prev, [payload.ref_id]: { url: payload.image_url, label: payload.label } }))
  }
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-strawberry-ref')) {
      e.preventDefault()
      setDragOver(true)
    }
  }
  const onDragLeave = () => setDragOver(false)

  return (
    <div
      className={`input-dock ${dragOver ? 'input-dock--drop' : ''}`}
      data-disabled={disabled}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {attachments.length > 0 && (
        <div className="input-dock__refs" role="region" aria-label="Attached references">
          {attachments.map(a => (
            <RefChip
              key={a.ref_id}
              attachment={a}
              meta={chipMeta[a.ref_id]}
              onRemove={() => {
                setAttachments(prev => prev.filter(x => x.ref_id !== a.ref_id))
                setChipMeta(prev => { const n = { ...prev }; delete n[a.ref_id]; return n })
              }}
            />
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

function RefChip({ attachment, meta, onRemove }: {
  attachment: UserAttachment
  meta?: { url: string; label: string }
  onRemove: () => void
}) {
  const hover = useHoverPreview(meta?.url)
  return (
    <span className="ref-chip" {...hover}>
      {meta?.url ? (
        <img src={meta.url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
      ) : (
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--console-surface)', display: 'inline-block' }} />
      )}
      <span style={{ fontSize: 10 }}>{meta?.label?.slice(0, 14) || attachment.ref_id.slice(0, 8)}</span>
      <button className="ref-chip__remove" onClick={onRemove} aria-label="Remove attachment">×</button>
    </span>
  )
}
