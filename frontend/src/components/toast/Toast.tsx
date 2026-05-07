// Toast — singleton transient notifications.
// Anywhere in the app: toast.error('something broke'). The layer renders
// stacked pills bottom-right and auto-dismisses after 4s.
import { useEffect, useState } from 'react'
import './Toast.css'

type Kind = 'info' | 'success' | 'error'
interface Item { id: string; kind: Kind; text: string }

let listeners: Array<(items: Item[]) => void> = []
let items: Item[] = []

function emit() { listeners.forEach(fn => fn(items)) }

function push(kind: Kind, text: string, ttl = 4000) {
  const id = Math.random().toString(36).slice(2)
  items = [...items, { id, kind, text }]
  emit()
  setTimeout(() => {
    items = items.filter(i => i.id !== id)
    emit()
  }, ttl)
}

export const toast = {
  info: (t: string) => push('info', t),
  success: (t: string) => push('success', t),
  error: (t: string) => push('error', t, 6000),
}

export function ToastLayer() {
  const [visible, setVisible] = useState<Item[]>([])
  useEffect(() => {
    const fn = (next: Item[]) => setVisible(next)
    listeners.push(fn)
    return () => { listeners = listeners.filter(l => l !== fn) }
  }, [])
  if (visible.length === 0) return null
  return (
    <div className="toast-layer" role="region" aria-label="Notifications">
      {visible.map(t => (
        <div key={t.id} className={`toast toast--${t.kind}`}>{t.text}</div>
      ))}
    </div>
  )
}
