// PhaseAdvanceBar — in-chat sticky CTA shown above the InputDock. Polls
// /phase-readiness and surfaces a fat "→ Next phase" button right inside
// the conversation, so the user doesn't have to look up at the top rail.
//
// The top PhaseRail still exists (overview + agent labels), but this
// component is the one the user actually clicks during a working session
// because it's an inch away from the cursor.
import { useEffect, useState } from 'react'

type PhaseId = 'BRIEF' | 'STORY' | 'ASSETS' | 'GENERATE'

const PHASE_LABELS: Record<PhaseId, string> = {
  BRIEF: 'Brief',
  STORY: 'Story',
  ASSETS: 'Cast & Scout',
  GENERATE: 'Generate',
}

// What the next phase actually does, in the user's voice. The original
// "Story looks ready → Move to Cast & Scout" left users wondering what
// would happen.
const NEXT_PHASE_PROMISE: Record<PhaseId, string> = {
  BRIEF: 'Sage will draft scenes, shots, and cuts',
  STORY: 'Atlas will extract characters / locations / props',
  ASSETS: 'Pixel will compose cuts on demand',
  GENERATE: '',
}

interface Readiness {
  current_phase: PhaseId
  next_phase: PhaseId | null
  ready: boolean
  reason: string
}

interface Props {
  projectId: string
  onAdvance: () => void
  refreshKey?: number
}

export function PhaseAdvanceBar({ projectId, onAdvance, refreshKey = 0 }: Props) {
  const [r, setR] = useState<Readiness | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/phase-readiness`)
        if (!res.ok) return
        const data = (await res.json()) as Readiness
        if (!cancelled) {
          setR(data)
          setBusy(false)  // Clear advancing-state once the new phase lands.
        }
      } catch { /* ignore */ }
    }
    void load()
    const id = setInterval(load, 3000)
    // Console dispatches a window CustomEvent on phase_change WS messages
    // (added via the same event-bus shim CutNode uses). Reload immediately
    // instead of waiting up to 3s for the next poll tick.
    const onPhaseChange = () => { void load() }
    window.addEventListener('phase_change', onPhaseChange)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('phase_change', onPhaseChange)
    }
  }, [projectId, refreshKey])

  if (!r || !r.next_phase) return null

  const onClick = () => {
    setBusy(true)
    onAdvance()
    setTimeout(() => setBusy(false), 1500)
  }

  const ready = r.ready
  const nextLabel = r.next_phase ? PHASE_LABELS[r.next_phase] : ''

  const promise = r.next_phase ? NEXT_PHASE_PROMISE[r.next_phase] : ''
  return (
    <div className={`phase-cta${ready ? ' phase-cta--ready' : ' phase-cta--blocked'}`}>
      <span className="phase-cta__label">
        {ready
          ? `${PHASE_LABELS[r.current_phase]} looks ready.${promise ? ` Next: ${promise}.` : ''}`
          : `${PHASE_LABELS[r.current_phase]} — ${r.reason || 'not ready yet'}`}
      </span>
      <button
        type="button"
        className="phase-cta__btn"
        onClick={onClick}
        disabled={busy}
        title={ready ? `Advance to ${nextLabel}` : r.reason || 'Phase not ready'}
      >
        {busy ? '⏳ Advancing…' : `→ Move to ${nextLabel}`}
      </button>
    </div>
  )
}
