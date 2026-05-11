// PhaseRail — the 4 real phases the project actually transitions through,
// plus a "Move to next phase" button that fires the `advance_phase` intent
// directly (no LLM call) when the gate is ready.
//
// Replaces the older 6-phase rail (DEVELOP / DESIGN / CAST_SCOUT / BLUEPRINT
// / STORYBOARD / ANIMATIC) which mixed display labels with a backend pipeline
// that only ever advances 4 of those, leaving 2 perpetually pending. One
// label, one source of truth: projects.current_phase.
import { useEffect, useState } from 'react'
import './PhaseRail.css'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || ''

type PhaseId = 'BRIEF' | 'STORY' | 'ASSETS' | 'GENERATE'

const PHASE_LABELS: Record<PhaseId, string> = {
  BRIEF: 'Brief',
  STORY: 'Story',
  ASSETS: 'Cast & Scout',
  GENERATE: 'Generate',
}
const PHASE_AGENTS: Record<PhaseId, string> = {
  BRIEF: 'Berry',
  STORY: 'Sage',
  ASSETS: 'Atlas',
  GENERATE: 'Pixel',
}
const PHASE_ORDER: PhaseId[] = ['BRIEF', 'STORY', 'ASSETS', 'GENERATE']

interface Readiness {
  current_phase: PhaseId
  next_phase: PhaseId | null
  ready: boolean
  reason: string
}

interface GenStats {
  in_flight_count: number
  in_flight: { label: string; elapsed_s: number }[]
  completed_total: number
  failed_total: number
}

interface Props {
  projectId: string
  /** Bump to force re-fetch (e.g. after a tool advances the phase). */
  refreshKey?: number
}

export function PhaseRail({ projectId, refreshKey = 0 }: Props) {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [genStats, setGenStats] = useState<GenStats | null>(null)

  // Fetch readiness on mount, on refreshKey bump, and every 4s while
  // mounted. The top rail is read-only now — phase advancement happens
  // via the in-chat PhaseAdvanceBar — but we still poll so the active
  // phase chip updates after the user clicks Advance in chat.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/phase-readiness`)
        if (!res.ok) return
        const data = (await res.json()) as Readiness
        if (!cancelled) setReadiness(data)
      } catch {
        /* ignore */
      }
    }
    void load()
    const id = setInterval(load, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [projectId, refreshKey])

  // Poll generation-stats more aggressively (1.5s) — when the user has
  // many cuts queueing, they want fast feedback that work is happening.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/generation-stats`)
        if (!res.ok) return
        const data = (await res.json()) as GenStats
        if (!cancelled) setGenStats(data)
      } catch {
        /* ignore */
      }
    }
    void load()
    const id = setInterval(load, 1500)
    return () => { cancelled = true; clearInterval(id) }
  }, [projectId])

  if (!projectId) return null
  const current = readiness?.current_phase ?? 'BRIEF'
  const currentIdx = PHASE_ORDER.indexOf(current)

  return (
    <div className="phase-rail" role="navigation" aria-label="Production phases">
      {PHASE_ORDER.map((phase, idx) => {
        const isDone = idx < currentIdx
        const isCurrent = idx === currentIdx
        const status = isDone ? 'frozen' : isCurrent ? 'in_progress' : 'pending'
        const glyph = isDone ? '✓' : isCurrent ? '●' : '○'
        return (
          <div key={phase} className={`phase-rail-step status-${status}`} aria-current={isCurrent}>
            <span className="phase-rail-glyph" aria-hidden>{glyph}</span>
            <span className="phase-rail-label">
              {PHASE_LABELS[phase]}
              <span className="phase-rail-agent">· {PHASE_AGENTS[phase]}</span>
            </span>
            {idx < PHASE_ORDER.length - 1 && <span className="phase-rail-arrow" aria-hidden>→</span>}
          </div>
        )
      })}

      {genStats && (genStats.in_flight_count > 0 || genStats.completed_total > 0 || genStats.failed_total > 0) && (
        <div
          className={`phase-rail-genstats ${genStats.in_flight_count > 0 ? 'phase-rail-genstats--active' : ''}`}
          title={
            genStats.in_flight_count > 0
              ? genStats.in_flight.map(g => `${g.label} (${g.elapsed_s}s)`).join('\n')
              : `Completed: ${genStats.completed_total}${genStats.failed_total ? ` · Failed: ${genStats.failed_total}` : ''}`
          }
        >
          {genStats.in_flight_count > 0 && (
            <span className="phase-rail-genstats__spinner" aria-hidden />
          )}
          <span className="phase-rail-genstats__label">
            {genStats.in_flight_count > 0
              ? `🎨 ${genStats.in_flight_count} generating`
              : `✓ ${genStats.completed_total} done`}
            {genStats.failed_total > 0 && (
              <span className="phase-rail-genstats__failed">
                {' '}· {genStats.failed_total} failed
              </span>
            )}
          </span>
        </div>
      )}

    </div>
  )
}
