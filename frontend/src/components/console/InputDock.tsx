// InputDock — chat input with reference chips, drag-drop, and Cmd+Enter send.
// Half-baked quick-command shortcuts removed; the same actions live in
// ⌘K (CommandPalette) which is the canonical entry point.
import { useEffect, useRef, useState } from 'react'
import type { UserAttachment } from './types'
import { readRefDrag } from '../dnd/refDragData'
import { useHoverPreview } from '../dnd/HoverPreview'

interface InputDockProps {
  onSend: (content: string, attachments: UserAttachment[]) => void
  agentName: string
  disabled?: boolean
}

export function InputDock({ onSend, agentName, disabled }: InputDockProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<UserAttachment[]>([])
  const [chipMeta, setChipMeta] = useState<Record<string, { url: string; label: string }>>({})
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

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
        placeholder={`Message ${agentName}…  (⌘+Enter to send · drop a reference here)`}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled}
        rows={2}
      />

      <div className="input-dock__bar">
        <span className="input-dock__hint">⌘K · commands</span>
        <div style={{ flex: 1 }} />
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
