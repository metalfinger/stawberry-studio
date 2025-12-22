import './TimelinePills.css'

interface Phase {
    id: string
    name: string
    emoji: string
}

const PHASES: Phase[] = [
    { id: 'BRIEF', name: 'Brief', emoji: '💭' },
    { id: 'STORY', name: 'Story', emoji: '📖' },
    { id: 'ASSETS', name: 'Assets', emoji: '🎭' },
    { id: 'GENERATE', name: 'Generate', emoji: '🎯' },
    { id: 'FINAL', name: 'Final', emoji: '🎬' },
]

interface TimelinePillsProps {
    currentPhase: string
    viewingPhase: string
    onPhaseClick: (phase: string) => void
}

export function TimelinePills({ currentPhase, viewingPhase, onPhaseClick }: TimelinePillsProps) {
    const currentIndex = PHASES.findIndex(p => p.id === currentPhase)

    return (
        <div className="timeline-pills">
            {PHASES.map((phase, index) => {
                const isCompleted = index < currentIndex
                const isCurrent = phase.id === currentPhase
                const isLocked = index > currentIndex
                const isViewing = phase.id === viewingPhase

                return (
                    <div key={phase.id} className="timeline-item">
                        {index > 0 && (
                            <div className={`timeline-connector ${isCompleted || isCurrent ? 'active' : ''}`} />
                        )}
                        <button
                            className={`timeline-pill ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isLocked ? 'locked' : ''} ${isViewing ? 'viewing' : ''}`}
                            onClick={() => !isLocked && onPhaseClick(phase.id)}
                            disabled={isLocked}
                            title={phase.name}
                        >
                            <span className="pill-emoji">{phase.emoji}</span>
                            <span className="pill-status">
                                {isCompleted && '✓'}
                                {isCurrent && '●'}
                                {isLocked && '🔒'}
                            </span>
                        </button>
                        <span className="pill-label">{phase.name}</span>
                    </div>
                )
            })}
        </div>
    )
}
