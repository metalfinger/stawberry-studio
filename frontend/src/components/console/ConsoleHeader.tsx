interface ConsoleHeaderProps {
  projectId: string
  phase: string
  agentName: string
  costToday: number
  connecting: boolean
  onClose?: () => void
}

export function ConsoleHeader({ phase, agentName, costToday, connecting, onClose }: ConsoleHeaderProps) {
  return (
    <header className="console-header">
      <span className={connecting ? 'console-header__status console-header__status--connecting' : 'console-header__status'} />
      <div className="console-header__title">
        {agentName ? `${agentName}` : 'Console'}
        <span className="console-header__phase" style={{ marginLeft: 8 }}>{phase}</span>
      </div>
      <span className="console-header__cost" title="Estimated cost this session">
        ${costToday.toFixed(2)}
      </span>
      {onClose && (
        <button className="console-header__close" onClick={onClose} aria-label="Close console">×</button>
      )}
    </header>
  )
}
