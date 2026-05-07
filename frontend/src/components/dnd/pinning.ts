// Pin store — per-project list of pinned reference attachments persisted
// in localStorage. Console subscribes to changes; Library/messages call
// togglePin to add/remove. No backend roundtrip; pins are a UI affordance
// for the user, not a server concept.
import type { UserAttachment } from '../console/types'

const KEY = (projectId: string) => `strawberry.pinned.${projectId}`
type Listener = (items: UserAttachment[]) => void
const listeners: Record<string, Set<Listener>> = {}

function read(projectId: string): UserAttachment[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY(projectId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(projectId: string, items: UserAttachment[]) {
  try { localStorage.setItem(KEY(projectId), JSON.stringify(items)) } catch {}
  const fns = listeners[projectId]
  if (fns) fns.forEach(fn => fn(items))
}

export const pinning = {
  list(projectId: string): UserAttachment[] {
    return read(projectId)
  },
  isPinned(projectId: string, refId: string): boolean {
    return read(projectId).some(a => a.ref_id === refId)
  },
  togglePin(projectId: string, refId: string): boolean {
    const cur = read(projectId)
    const next = cur.some(a => a.ref_id === refId)
      ? cur.filter(a => a.ref_id !== refId)
      : [...cur, { kind: 'reference', ref_id: refId } as UserAttachment]
    write(projectId, next)
    return next.some(a => a.ref_id === refId)
  },
  unpin(projectId: string, refId: string): void {
    write(projectId, read(projectId).filter(a => a.ref_id !== refId))
  },
  subscribe(projectId: string, fn: Listener): () => void {
    const set = listeners[projectId] ?? (listeners[projectId] = new Set())
    set.add(fn)
    fn(read(projectId))
    return () => { set.delete(fn) }
  },
}
