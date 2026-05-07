import { useEffect, useState } from 'react'
import './PhaseRail.css'

export type PhaseStatus = 'pending' | 'in_progress' | 'frozen' | 'stale'

export interface PhaseRow {
    phase: string
    status: PhaseStatus
    current_version: number
    updated_at: string | null
}

interface PhasesResponse {
    project_id: string
    phases: PhaseRow[]
}

interface Props {
    projectId: string
    /** Callback when user clicks a phase to focus on it. */
    onSelect?: (phase: string) => void
    /** External refresh trigger (bump number to force re-fetch). */
    refreshKey?: number
}

const PHASE_LABELS: Record<string, string> = {
    DEVELOP: 'Develop',
    DESIGN: 'Design',
    CAST_SCOUT: 'Cast & Scout',
    BLUEPRINT: 'Blueprint',
    STORYBOARD: 'Storyboard',
    ANIMATIC: 'Animatic',
}

const STATUS_GLYPH: Record<PhaseStatus, string> = {
    pending: '○',
    in_progress: '●',
    frozen: '✓',
    stale: '⚠',
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
    pending: 'Pending',
    in_progress: 'In progress',
    frozen: 'Frozen',
    stale: 'Stale (upstream changed)',
}

/**
 * Visual rail for the 6-phase production pipeline. First UI for the new
 * Phase 4 backend (`/api/projects/{id}/phases`).
 *
 * Renders horizontally — each phase shows its status glyph, current version,
 * and is clickable. Stale phases pulse yellow.
 */
export function PhaseRail({ projectId, onSelect, refreshKey = 0 }: Props) {
    const [phases, setPhases] = useState<PhaseRow[]>([])
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        async function load() {
            setLoading(true)
            setErr(null)
            try {
                const res = await fetch(`/api/projects/${projectId}/phases`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = (await res.json()) as PhasesResponse
                if (!cancelled) setPhases(data.phases)
            } catch (e: any) {
                if (!cancelled) setErr(String(e))
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        if (projectId) void load()
        return () => {
            cancelled = true
        }
    }, [projectId, refreshKey])

    if (!projectId) return null

    return (
        <div className="phase-rail" role="navigation" aria-label="Production phases">
            {loading && phases.length === 0 ? (
                <div className="phase-rail-loading">loading pipeline…</div>
            ) : err ? (
                <div className="phase-rail-error">⚠ {err}</div>
            ) : (
                phases.map((p, idx) => (
                    <button
                        key={p.phase}
                        type="button"
                        className={`phase-rail-step status-${p.status}`}
                        onClick={() => onSelect?.(p.phase)}
                        title={`${STATUS_LABEL[p.status]} · v${p.current_version}`}
                    >
                        <span className="phase-rail-glyph" aria-hidden>
                            {STATUS_GLYPH[p.status]}
                        </span>
                        <span className="phase-rail-label">{PHASE_LABELS[p.phase] ?? p.phase}</span>
                        {p.current_version > 0 && (
                            <span className="phase-rail-version">v{p.current_version}</span>
                        )}
                        {idx < phases.length - 1 && <span className="phase-rail-arrow" aria-hidden>→</span>}
                    </button>
                ))
            )}
        </div>
    )
}
