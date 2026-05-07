// CommandPalette — Cmd+K quick actions.
// Static commands today (open library, focus chat, set anchor).
// Phase G will plug in fuzzy search across cuts/scenes/assets.
import { useEffect, useRef, useState } from 'react'
import './CommandPalette.css'

interface Command {
  id: string
  label: string
  hint?: string
  icon?: string
  run: () => void
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  onOpenLibrary: () => void
}

export function CommandPalette({ open, onClose, onOpenLibrary }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  const focusChat = () => {
    const ta = document.querySelector<HTMLTextAreaElement>('.input-dock__textarea')
    ta?.focus()
  }

  const commands: Command[] = [
    { id: 'library', label: 'Open Library', hint: '⌘L', icon: '📚', run: () => { onClose(); onOpenLibrary() } },
    { id: 'focus_chat', label: 'Focus Chat Input', hint: '/', icon: '💬', run: () => { onClose(); focusChat() } },
    { id: 'compose', label: 'Compose Cut (in chat)', hint: '/compose', icon: '🎬', run: () => { onClose(); focusChat(); typeIntoInput('compose ') } },
    { id: 'refine', label: 'Refine Last Cut', hint: '/refine', icon: '✏️', run: () => { onClose(); focusChat(); typeIntoInput('refine ') } },
    { id: 'list', label: 'List Scenes', hint: '/list scenes', icon: '📋', run: () => { onClose(); focusChat(); typeIntoInput('list scenes ') } },
  ]

  const filtered = query.trim()
    ? commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        (c.hint || '').toLowerCase().includes(query.toLowerCase()))
    : commands

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(filtered.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[active]?.run()
    }
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Type a command…"
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0) }}
          onKeyDown={onKey}
        />
        <div className="palette__list">
          {filtered.length === 0 && <div className="palette__empty">No matches</div>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`palette__row ${i === active ? 'palette__row--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={c.run}
            >
              <span className="palette__icon">{c.icon}</span>
              <span className="palette__label">{c.label}</span>
              {c.hint && <span className="palette__hint">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="palette__foot">↑↓ navigate · ↵ select · esc close</div>
      </div>
    </div>
  )
}

function typeIntoInput(text: string) {
  const ta = document.querySelector<HTMLTextAreaElement>('.input-dock__textarea')
  if (!ta) return
  // React sets value via prop tracking; we have to use the native setter.
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(ta, text)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}
