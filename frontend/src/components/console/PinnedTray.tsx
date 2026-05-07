// Pinned tray — references the user has pinned stay visible above the input.
// Drag a thumb onto this area to pin. Each pinned ref auto-attaches to every
// outgoing message until unpinned.
import type { UserAttachment } from './types'

interface PinnedTrayProps {
  pinned: UserAttachment[]
  onUnpin: (refId: string) => void
}

export function PinnedTray({ pinned, onUnpin }: PinnedTrayProps) {
  if (pinned.length === 0) return null
  return (
    <div className="pinned-tray" role="region" aria-label="Pinned references">
      <span className="pinned-tray__label">📌 Pinned</span>
      {pinned.map(p => (
        <span key={p.ref_id} className="ref-chip" title={p.ref_id}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--console-surface)', display: 'inline-block',
          }} />
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>{p.ref_id.slice(0, 8)}</span>
          <button
            className="ref-chip__remove"
            onClick={() => onUnpin(p.ref_id)}
            aria-label="Unpin reference"
          >×</button>
        </span>
      ))}
    </div>
  )
}
