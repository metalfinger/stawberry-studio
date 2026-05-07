// MessageStream — virtualized-friendly auto-scroll list of typed Console messages.
// Routes each message kind to its dedicated component.
import { useEffect, useRef } from 'react'
import type { ConsoleMessage } from './types'
import { TextMessage } from './messages/TextMessage'
import { PlanCard } from './messages/PlanCard'
import { ImageMessage } from './messages/ImageMessage'
import { ReferenceCardMessage } from './messages/ReferenceCardMessage'
import { ElapsedMessage } from './messages/ElapsedMessage'
import { ToolCallTag } from './messages/ToolCallTag'
import { ComparisonView } from './messages/ComparisonView'
import { RecommendationCard } from './messages/RecommendationCard'
import { BatchProgressCard } from './messages/BatchProgressCard'
import { IdleSuggestion } from './messages/IdleSuggestion'
import { ActivityCard } from './messages/ActivityCard'
import { FailureCard } from './messages/FailureCard'
import { ActionsBar } from './messages/ActionsBar'
import { HandoffCard } from './messages/HandoffCard'

interface MessageStreamProps {
  messages: ConsoleMessage[]
  onIntent: (intent: string, payload?: Record<string, unknown>, refMessageId?: string) => void
  showTraces?: boolean
}

export function MessageStream({ messages, onIntent, showTraces }: MessageStreamProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Auto-scroll to bottom unless user has scrolled up
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 200) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="console-stream" ref={ref}>
        <div className="console-stream__empty">
          Type a message or click a quick action below.
        </div>
      </div>
    )
  }

  return (
    <div className="console-stream" ref={ref}>
      {messages.map(msg => (
        <MessageRenderer key={msg.message_id} msg={msg} onIntent={onIntent} showTraces={showTraces} />
      ))}
    </div>
  )
}

function MessageRenderer({ msg, onIntent, showTraces }: { msg: ConsoleMessage; onIntent: MessageStreamProps['onIntent']; showTraces?: boolean }) {
  switch (msg.kind) {
    case 'text':
      return <TextMessage msg={msg} />
    case 'plan':
      return <PlanCard msg={msg} onIntent={onIntent} />
    case 'plan_update':
      return null  // handled by parent plan via Console state patch
    case 'image':
      return <ImageMessage msg={msg} />
    case 'reference_card':
      return <ReferenceCardMessage msg={msg} />
    case 'elapsed':
      return <ElapsedMessage msg={msg} />
    case 'tool_call':
      return showTraces ? <ToolCallTag msg={msg} /> : null
    case 'comparison':
      return <ComparisonView msg={msg} onIntent={onIntent} />
    case 'recommendation':
      return <RecommendationCard msg={msg} onIntent={onIntent} />
    case 'batch_progress':
      return <BatchProgressCard msg={msg} onIntent={onIntent} />
    case 'idle_suggestion':
      return <IdleSuggestion msg={msg} onIntent={onIntent} />
    case 'activity':
      return <ActivityCard msg={msg} />
    case 'failure':
      return <FailureCard msg={msg} onIntent={onIntent} />
    case 'actions':
      return <ActionsBar msg={msg} onIntent={onIntent} />
    case 'handoff':
      return <HandoffCard msg={msg} onIntent={onIntent} />
    default:
      return null
  }
}
