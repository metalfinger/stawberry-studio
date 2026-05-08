// PlanCard — the central artifact of plan-driven compose.
// Shows every plan item with status icon, description, cost, ETA, and
// "use existing alternative" rows. Action bar at the bottom routes user
// intent back to the agent (Approve / Modify / Skip / Cancel).
//
// Render items expand to show the compiled prompt + slot images that will
// feed the model, with an inline editor so the user can override before
// approving.
import { useState } from 'react'
import type { ConsoleMessage, PlanItemData } from '../types'

interface Props {
  msg: Extract<ConsoleMessage, { kind: 'plan' }>
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}

export function PlanCard({ msg, onIntent }: Props) {
  const cached = msg.items.filter(i => i.cached)
  const newGen = msg.items.filter(i => !i.cached && i.kind === 'reference_generate')
  const renderItem = msg.items.find(i => i.kind === 'render')
  const allDone = msg.items.every(i => i.status === 'done' || i.status === 'skipped')
  const anyError = msg.items.some(i => i.status === 'error')
  const inFlight = msg.items.some(i => i.status === 'running')

  return (
    <div className="console-msg">
      <div className="console-msg__agent">Pixel · plan</div>
      <div className="plan-card">
        <div className="plan-card__header">
          <span className="plan-card__title">
            {msg.cut_id ? `Plan for cut ${msg.cut_id.slice(-6)}` : 'Plan'}
          </span>
          {msg.feedback_round > 0 && (
            <span className="plan-card__round-badge">round {msg.feedback_round + 1}</span>
          )}
        </div>

        {msg.feedback.length > 0 && (
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--console-text-dim)', borderBottom: '1px solid var(--console-border)' }}>
            <strong>Feedback:</strong>{' '}
            {msg.feedback.map((f, i) => <span key={i}>{i > 0 ? ' · ' : ''}"{f}"</span>)}
          </div>
        )}

        <div className="plan-card__items">
          {msg.items.map(item => (
            <PlanItemRow
              key={item.id}
              item={item}
              planId={msg.plan_id}
              planMessageId={msg.message_id}
              onIntent={onIntent}
            />
          ))}
        </div>

        <div className="plan-card__totals">
          <span>
            {cached.length} cached · {newGen.length} new gen · {renderItem ? '1 render' : ''}
          </span>
          <span>
            <span className="plan-card__total-cost">${msg.total_cost_usd.toFixed(2)}</span>
            <span style={{ marginLeft: 8 }}>~{msg.total_eta_s}s</span>
          </span>
        </div>

        {!allDone && !inFlight && (
          <div className="plan-card__actions">
            <button
              className="console-btn console-btn--primary"
              onClick={() => onIntent('approve_plan', { plan_id: msg.plan_id }, msg.message_id)}
            >✅ Approve & start</button>
            <button
              className="console-btn"
              onClick={() => onIntent('modify_plan', { plan_id: msg.plan_id }, msg.message_id)}
            >✏️ Modify</button>
            <button
              className="console-btn console-btn--ghost"
              onClick={() => onIntent('skip_new_gens', { plan_id: msg.plan_id }, msg.message_id)}
            >Use only cached</button>
            <button
              className="console-btn console-btn--ghost"
              onClick={() => onIntent('cancel_plan', { plan_id: msg.plan_id }, msg.message_id)}
            >Cancel</button>
          </div>
        )}
        {inFlight && (
          <div className="plan-card__actions">
            <div className="elapsed">
              <span className="elapsed__spinner" />
              Running plan…
            </div>
          </div>
        )}
        {anyError && (
          <div className="plan-card__actions">
            <button
              className="console-btn"
              onClick={() => onIntent('retry_plan', { plan_id: msg.plan_id }, msg.message_id)}
            >🔁 Retry failed steps</button>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanItemRow({ item, planId, planMessageId, onIntent }: {
  item: PlanItemData
  planId: string
  planMessageId: string
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
}) {
  const icon = (() => {
    if (item.status === 'running') return '⏳'
    if (item.status === 'done') return '✓'
    if (item.status === 'error') return '✗'
    if (item.status === 'skipped') return '↷'
    return item.cached ? '✓' : '★'
  })()

  const cls = (() => {
    if (item.status === 'running') return 'plan-item plan-item--running'
    if (item.status === 'done') return 'plan-item plan-item--done'
    if (item.status === 'error') return 'plan-item plan-item--error'
    if (item.status === 'skipped') return 'plan-item plan-item--skipped'
    return item.cached ? 'plan-item plan-item--cached' : 'plan-item plan-item--new'
  })()

  const isRender = item.kind === 'render'
  const compiledPrompt: string = (item.payload as any)?.compiled_prompt || ''
  const slotsPreview: Array<{ slot: number; image_url: string }> = (item.payload as any)?.slots_preview || []
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(compiledPrompt)

  const savePrompt = () => {
    onIntent('update_render_prompt', { plan_id: planId, item_id: item.id, prompt: draft }, planMessageId)
    setEditing(false)
  }

  return (
    <div className={cls}>
      <span className="plan-item__icon" aria-hidden>{icon}</span>
      <div className="plan-item__body">
        <div
          className="plan-item__desc"
          style={isRender ? { cursor: 'pointer' } : undefined}
          onClick={isRender ? () => setExpanded(e => !e) : undefined}
        >
          {item.description}
          {isRender && (
            <span className="plan-item__expand">{expanded ? '▾' : '▸'} prompt</span>
          )}
        </div>

        {isRender && expanded && (
          <div className="plan-item__prompt">
            {!editing ? (
              <>
                <pre className="plan-item__prompt-pre">{compiledPrompt || '(prompt not compiled yet)'}</pre>
                <div className="plan-item__prompt-actions">
                  <button className="console-btn console-btn--ghost" onClick={() => { setDraft(compiledPrompt); setEditing(true) }}>
                    ✏️ Edit prompt
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  className="plan-item__prompt-textarea"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))}
                />
                <div className="plan-item__prompt-actions">
                  <button className="console-btn console-btn--primary" onClick={savePrompt} disabled={!draft.trim()}>Save</button>
                  <button className="console-btn console-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </>
            )}
            {slotsPreview.length > 0 && (
              <div className="plan-item__slots">
                {slotsPreview.map(s => (
                  <div key={s.slot} className="plan-item__slot" title={`Slot ${s.slot}`}>
                    <img src={s.image_url} alt={`slot ${s.slot}`} />
                    <span>@Image{s.slot}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {item.alternatives && item.alternatives.length > 0 && item.status === 'pending' && (
          <div className="plan-item__alt">
            <span style={{ color: 'var(--console-text-muted)' }}>↳ Or use existing:</span>
            {item.alternatives.map(alt => (
              <span key={alt.ref_id} className="plan-item__alt-row" title={alt.reason}>
                <img
                  src={alt.image_url}
                  alt={alt.label}
                  style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover' }}
                />
                {alt.label}
                <span style={{ color: 'var(--console-text-muted)' }}>({alt.reason})</span>
              </span>
            ))}
          </div>
        )}
        {item.error && (
          <div style={{ fontSize: 11, color: 'var(--console-error)', marginTop: 4 }}>
            {item.error}
          </div>
        )}
      </div>
      <div className="plan-item__cost">
        {item.cached ? (
          <span style={{ color: 'var(--console-success)' }}>cached</span>
        ) : (
          <>
            ${item.cost_usd.toFixed(2)}
            {item.eta_s > 0 && <span style={{ marginLeft: 6 }}>~{item.eta_s}s</span>}
          </>
        )}
      </div>
    </div>
  )
}
