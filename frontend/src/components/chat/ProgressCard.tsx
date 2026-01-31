import { CheckCircle, Circle, AlertCircle, ArrowRight } from 'lucide-react'
import './ProgressCard.css'

interface ProgressItem {
    name: string
    done: boolean
    value: string | null
}

interface ProgressData {
    phase: string
    items: ProgressItem[]
    can_advance: boolean
    blocking: string[]
}

interface ProgressCardProps {
    data: ProgressData
}

const PHASE_LABELS: Record<string, string> = {
    BRIEF: 'Brief',
    STORY: 'Story',
    ASSETS: 'Assets',
    GENERATE: 'Generate',
    FINAL: 'Final'
}

const PHASE_NEXT: Record<string, string> = {
    BRIEF: 'STORY',
    STORY: 'ASSETS',
    ASSETS: 'GENERATE',
    GENERATE: 'FINAL'
}

export function ProgressCard({ data }: ProgressCardProps) {
    const phaseLabel = PHASE_LABELS[data.phase] || data.phase
    const nextPhase = PHASE_NEXT[data.phase]
    const nextPhaseLabel = nextPhase ? PHASE_LABELS[nextPhase] : null

    return (
        <div className={`progress-card ${data.can_advance ? 'ready' : 'pending'}`}>
            <div className="progress-header">
                <span className="progress-phase-icon">
                    {data.can_advance ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                </span>
                <span className="progress-phase-name">{phaseLabel} Progress</span>
            </div>

            <div className="progress-items">
                {data.items.map((item, index) => (
                    <div key={index} className={`progress-item ${item.done ? 'done' : 'pending'}`}>
                        <span className="progress-item-icon">
                            {item.done ? <CheckCircle size={14} /> : <Circle size={14} />}
                        </span>
                        <span className="progress-item-name">{item.name}:</span>
                        <span className="progress-item-value">
                            {item.value || '(not set)'}
                        </span>
                    </div>
                ))}
            </div>

            <div className="progress-footer">
                {data.can_advance ? (
                    <div className="progress-ready">
                        <CheckCircle size={14} />
                        <span>Ready to move to {nextPhaseLabel || 'next'} phase</span>
                        <ArrowRight size={14} />
                    </div>
                ) : (
                    <div className="progress-blocking">
                        <AlertCircle size={14} />
                        <span>Need: {data.blocking.join(', ')}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
