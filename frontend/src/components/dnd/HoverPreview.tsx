// HoverPreview — singleton preview popover.
// Any thumbnail can call hoverPreview.show(url, e) on mouseenter; it tracks
// the cursor and shows a large preview after a short delay. Singleton so we
// never have multiple previews fighting.
import { useEffect, useState } from 'react'

type HoverState = { url: string; x: number; y: number } | null
let listeners: Array<(s: HoverState) => void> = []
let timer: ReturnType<typeof setTimeout> | null = null

function emit(s: HoverState) { listeners.forEach(fn => fn(s)) }

export const hoverPreview = {
  show(url: string, x: number, y: number, delay = 250) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => emit({ url, x, y }), delay)
  },
  move(x: number, y: number) {
    listeners.forEach(fn => fn(prev => prev ? ({ ...prev, x, y }) : prev as any) as any)
  },
  hide() {
    if (timer) clearTimeout(timer)
    timer = null
    emit(null)
  },
}

export function HoverPreviewLayer() {
  const [state, setState] = useState<HoverState>(null)
  useEffect(() => {
    const fn = (s: HoverState) => setState(typeof s === 'function' ? (s as any)(state) : s)
    listeners.push(fn)
    return () => { listeners = listeners.filter(l => l !== fn) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!state) return null
  const W = 380
  const H = 380
  const left = Math.min(window.innerWidth - W - 16, state.x + 24)
  const top = Math.min(window.innerHeight - H - 16, state.y + 24)
  return (
    <div
      style={{
        position: 'fixed', left, top, width: W, height: H,
        background: '#0a0a0a', border: '1px solid #333',
        borderRadius: 8, padding: 4, pointerEvents: 'none',
        zIndex: 100000, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      }}
    >
      <img src={state.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} />
    </div>
  )
}

// Convenience hook for any thumb element.
export function useHoverPreview(url: string | undefined) {
  return {
    onMouseEnter: (e: React.MouseEvent) => { if (url) hoverPreview.show(url, e.clientX, e.clientY) },
    onMouseMove: (e: React.MouseEvent) => { if (url) hoverPreview.show(url, e.clientX, e.clientY, 0) },
    onMouseLeave: () => hoverPreview.hide(),
  }
}
