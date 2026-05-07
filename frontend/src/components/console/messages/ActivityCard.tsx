// ActivityCard — collapsed log of background events (e.g. "while you were away").
import type { ConsoleMessage } from '../types'

interface Props { msg: Extract<ConsoleMessage, { kind: 'activity' }> }

export function ActivityCard({ msg }: Props) {
  const total = msg.events.reduce((acc, e) => acc + (e.cost_usd || 0), 0)
  return (
    <div className="console-msg">
      <div className="console-msg__agent">Activity</div>
      <div className="activity-card">
        <ul className="activity-card__list">
          {msg.events.map((e, i) => (
            <li key={i} className="activity-card__row">
              <span className="activity-card__when">{e.when}</span>
              <span className="activity-card__what">{e.what}</span>
              {e.cost_usd != null && e.cost_usd > 0 && (
                <span className="activity-card__cost">${e.cost_usd.toFixed(2)}</span>
              )}
            </li>
          ))}
        </ul>
        {total > 0 && (
          <div className="activity-card__total">Total: ${total.toFixed(2)}</div>
        )}
      </div>
    </div>
  )
}
