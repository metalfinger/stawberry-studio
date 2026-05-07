// ElapsedMessage — live timer for in-flight work.
// Ticks every second from started_at; shows ETA when known.
import { useEffect, useState } from 'react'
import type { ConsoleMessage } from '../types'

interface Props { msg: Extract<ConsoleMessage, { kind: 'elapsed' }> }

export function ElapsedMessage({ msg }: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const startedMs = new Date(msg.started_at).getTime()
  const elapsed = Math.max(0, Math.floor((now - startedMs) / 1000))
  const eta = msg.estimated_total_s

  return (
    <div className="console-msg">
      <div className="elapsed">
        <span className="elapsed__spinner" />
        <span className="elapsed__label">{msg.label}</span>
        <span className="elapsed__time">
          {elapsed}s{eta ? ` / ~${eta}s` : ''}
        </span>
      </div>
    </div>
  )
}
