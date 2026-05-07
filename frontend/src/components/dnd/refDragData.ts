// Shared drag-drop payload format for references.
// Any draggable image (Library, Console message, canvas thumb) writes this
// MIME type so drop targets (chat input, cut node slots, library favorites)
// can handle it generically.

export const REF_MIME = 'application/x-strawberry-ref'

export interface RefDragPayload {
  ref_id: string
  image_url: string
  label: string
  asset_id?: string | null
  source_type?: string
}

export function setRefDrag(e: React.DragEvent, payload: RefDragPayload) {
  e.dataTransfer.setData(REF_MIME, JSON.stringify(payload))
  e.dataTransfer.setData('text/plain', payload.image_url)
  e.dataTransfer.effectAllowed = 'copyMove'
}

export function readRefDrag(e: React.DragEvent | DragEvent): RefDragPayload | null {
  const raw = e.dataTransfer?.getData(REF_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as RefDragPayload
  } catch {
    return null
  }
}
