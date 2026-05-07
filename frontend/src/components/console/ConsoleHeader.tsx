interface ConsoleHeaderProps {
  projectId: string
  phase: string
  agentName: string
  costToday: number
  connecting: boolean
  collapsed?: boolean
  showTraces?: boolean
  onToggleTraces?: () => void
  onToggleCollapse?: () => void
  onClose?: () => void
}

export function ConsoleHeader({
  phase, agentName, costToday, connecting,
  collapsed, showTraces, onToggleTraces, onToggleCollapse, onClose,
}: ConsoleHeaderProps) {
  return (
    <header className="console-header" onDoubleClick={onToggleCollapse}>
      <span className={connecting ? 'console-header__status console-header__status--connecting' : 'console-header__status'} />
      <div className="console-header__title">
        {agentName ? `${agentName}` : 'Console'}
        {!collapsed && <span className="console-header__phase" style={{ marginLeft: 8 }}>{phase}</span>}
      </div>
      {!collapsed && (
        <span className="console-header__cost" title="Estimated cost this session (LLM + image)">
          ${costToday.toFixed(2)}
        </span>
      )}
      {!collapsed && onToggleTraces && (
        <button
          className={`console-header__close ${showTraces ? 'console-header__toggle--on' : ''}`}
          onClick={onToggleTraces}
          aria-label={showTraces ? 'Hide tool traces' : 'Show tool traces'}
          title={showTraces ? 'Hide tool traces' : 'Show tool traces'}
        >🔧</button>
      )}
      {onToggleCollapse && (
        <button
          className="console-header__close"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand console' : 'Collapse console'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >{collapsed ? '▴' : '▾'}</button>
      )}
      {onClose && !collapsed && (
        <button className="console-header__close" onClick={onClose} aria-label="Close console">×</button>
      )}
    </header>
  )
}
