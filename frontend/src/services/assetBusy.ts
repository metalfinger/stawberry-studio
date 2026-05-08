// Tiny event bus for "this asset is currently regenerating" state.
//
// Both the AssetMasterNode (the canvas card) and the ContextPanel show a
// regen button. Whichever the user clicks, we want BOTH places to show a
// busy state and then both to refresh when it lands. Doing this through
// the chat WebSocket would route a status message to the console (which
// is what looked like a confusing top-left dialogue). Instead we use a
// per-asset window-event bus — pure browser, no server round-trip.
//
// API:
//   markBusy(assetId) / markIdle(assetId)
//   isBusy(assetId)
//   subscribe(cb) — fires (assetId, busy) on every change
//   onAssetUpdated(assetId) — fires a 'refresh-now' tick so listeners can
//     reload references and dependent UI

const BUSY = new Set<string>()
const STATE_EVT = 'asset-busy-changed'
const REFRESH_EVT = 'asset-refresh'

export function markBusy(assetId: string): void {
  if (BUSY.has(assetId)) return
  BUSY.add(assetId)
  window.dispatchEvent(new CustomEvent(STATE_EVT, { detail: { assetId, busy: true } }))
}

export function markIdle(assetId: string): void {
  if (!BUSY.has(assetId)) return
  BUSY.delete(assetId)
  window.dispatchEvent(new CustomEvent(STATE_EVT, { detail: { assetId, busy: false } }))
}

export function isBusy(assetId: string): boolean {
  return BUSY.has(assetId)
}

export function subscribeBusy(cb: (assetId: string, busy: boolean) => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail as { assetId: string; busy: boolean }
    cb(d.assetId, d.busy)
  }
  window.addEventListener(STATE_EVT, handler)
  return () => window.removeEventListener(STATE_EVT, handler)
}

export function emitAssetUpdated(assetId: string): void {
  window.dispatchEvent(new CustomEvent(REFRESH_EVT, { detail: { assetId } }))
}

export function subscribeAssetUpdated(cb: (assetId: string) => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail as { assetId: string }
    cb(d.assetId)
  }
  window.addEventListener(REFRESH_EVT, handler)
  return () => window.removeEventListener(REFRESH_EVT, handler)
}
