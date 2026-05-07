// RecommendationCard — agent's "use existing X or generate new?" decision card.
// Primary suggestion + alternatives, with explicit accept/decline actions.
import type { ConsoleMessage } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'recommendation' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function RecommendationCard({ msg, onIntent }: Props) {
  return (
    <div className="console-msg">
      <div className="console-msg__agent">Recommendation</div>
      <div className="rec-card">
        <div className="rec-card__reasoning">{msg.reasoning}</div>
        <div className="rec-card__primary">
          <img src={msg.primary.thumb_url} alt={msg.primary.label} className="rec-card__thumb" />
          <div className="rec-card__info">
            <div className="rec-card__label">{msg.primary.label}</div>
            <div className="rec-card__sub">{msg.primary.asset_name}</div>
          </div>
          <div className="rec-card__actions">
            <button
              className="console-btn console-btn--primary"
              onClick={() => onIntent('accept_recommendation', { ref_id: msg.primary.ref_id }, msg.message_id)}
            >Use this</button>
            <button
              className="console-btn console-btn--ghost"
              onClick={() => onIntent('generate_new_instead', {}, msg.message_id)}
            >Generate new</button>
          </div>
        </div>
        {msg.alternatives.length > 0 && (
          <div className="rec-card__alts">
            <div className="rec-card__alts-label">Or pick another existing reference:</div>
            <div className="rec-card__alts-row">
              {msg.alternatives.map(alt => (
                <button
                  key={alt.ref_id}
                  className="rec-card__alt"
                  onClick={() => onIntent('accept_recommendation', { ref_id: alt.ref_id }, msg.message_id)}
                  title={alt.asset_name}
                >
                  <img src={alt.thumb_url} alt={alt.label} />
                  <span>{alt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
