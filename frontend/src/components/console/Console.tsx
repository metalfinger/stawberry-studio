// Agentic Console — replaces FloatingChat.
// Three sections (top to bottom): MessageStream, PinnedTray, InputDock.
// All state changes flow through the agent via WS — Console never mutates
// canvas state directly.
import { useEffect, useRef, useState } from 'react'
import type { ConsoleMessage, UserAttachment } from './types'
import { MessageStream } from './MessageStream'
import { PinnedTray } from './PinnedTray'
import { InputDock } from './InputDock'
import { ConsoleHeader } from './ConsoleHeader'
import './Console.css'

interface ConsoleProps {
  projectId: string
  initialPhase?: string
  onNodeUpdate?: () => void
  onClose?: () => void
}

const COLLAPSE_KEY = 'strawberry.console.collapsed'

export function Console({ projectId, initialPhase, onNodeUpdate, onClose }: ConsoleProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  })
  const toggleCollapse = () => {
    setCollapsed(c => {
      const n = !c
      try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0') } catch {}
      return n
    })
  }
  const [messages, setMessages] = useState<ConsoleMessage[]>([])
  const [phase, setPhase] = useState<string>(initialPhase ?? 'BRIEF')
  const [agentName, setAgentName] = useState<string>('Berry')
  const [pinned, setPinned] = useState<UserAttachment[]>([])
  const [connecting, setConnecting] = useState(true)
  const [costToday, setCostToday] = useState<number>(0)
  const wsRef = useRef<WebSocket | null>(null)

  // Connect WS
  useEffect(() => {
    if (!projectId) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${proto}//${host}/api/projects/${projectId}/chat${initialPhase ? `?phase=${initialPhase}` : ''}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnecting(false)
    ws.onclose = () => setConnecting(true)
    ws.onerror = () => setConnecting(true)

    // Idle detection: if the user is inactive for IDLE_MS, ping the agent
    // with `user_idle` so it can decide whether to surface a suggestion.
    // Activity = mousemove, keydown, click, focus on input.
    const IDLE_MS = 90_000
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let lastSent = 0
    const fireIdle = () => {
      if (Date.now() - lastSent < IDLE_MS) return
      lastSent = Date.now()
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'user_intent', intent: 'user_idle' }))
        }
      } catch {}
    }
    const reset = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(fireIdle, IDLE_MS)
    }
    reset()
    const events = ['mousemove', 'keydown', 'click', 'focus'] as const
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }))
    const cleanup = () => events.forEach(ev => window.removeEventListener(ev, reset))

    ws.onmessage = (event) => {
      let data: any
      try { data = JSON.parse(event.data) } catch { return }
      if (typeof data !== 'object' || !data) return

      if (data.type === 'phase') {
        setPhase(data.phase)
        setAgentName(data.agent || agentName)
        return
      }
      if (data.type === 'history') {
        // Legacy text-only history — convert to text messages.
        const converted: ConsoleMessage[] = (data.messages || []).map((m: any, i: number) => ({
          kind: 'text',
          message_id: `legacy_${i}`,
          timestamp: m.timestamp || new Date().toISOString(),
          markdown: m.content || '',
          agent_name: m.agent_name,
        }))
        setMessages(converted)
        return
      }
      if (data.type === 'tree_updated') {
        onNodeUpdate?.()
        return
      }
      if (data.type === 'phase_change') {
        setPhase(data.new_phase)
        setAgentName(data.agent || agentName)
        return
      }

      // Typed Console messages
      if (typeof data.kind === 'string') {
        if (data.kind === 'plan_update') {
          // Patch plan items in-place
          setMessages(prev => prev.map(m => {
            if (m.kind === 'plan' && m.message_id === data.message_id) {
              return {
                ...m,
                items: m.items.map(i =>
                  i.id === data.item_id
                    ? { ...i, status: data.status, result: data.result ?? i.result, error: data.error ?? i.error }
                    : i
                ),
              } as ConsoleMessage
            }
            return m
          }))
          return
        }
        // New typed message — also clears any "thinking" pseudo-message.
        setMessages(prev => [
          ...prev.filter(m => !(m.kind === 'elapsed' && m.message_id.startsWith('pending_'))),
          data as ConsoleMessage,
        ])
        // Bump cost meter
        if (data.kind === 'reference_card' && typeof data.cost_usd === 'number') {
          setCostToday(c => c + data.cost_usd)
        }
        if (data.kind === 'tool_call' && typeof data.cost_usd === 'number') {
          setCostToday(c => c + data.cost_usd)
        }
        return
      }

      // Legacy text path. Backend sends incremental {type:'stream'} chunks
      // followed by a final {type:'message'} containing the same full text.
      // We must NOT render both — fold the final into the in-progress
      // stream message (or push a fresh text message if no stream existed).
      if (data.type === 'stream' || (data.type === 'message' && data.role !== 'user')) {
        // First chunk/message → drop any pending "thinking" elapsed pseudo-msg.
        setMessages(prev => prev.filter(m => !(m.kind === 'elapsed' && m.message_id.startsWith('pending_'))))
        setMessages(prev => {
          const lastIdx = [...prev].reverse().findIndex(
            m => m.kind === 'text' && (m.message_id.startsWith('stream_') || m.message_id.startsWith('final_'))
          )
          const realIdx = lastIdx >= 0 ? prev.length - 1 - lastIdx : -1
          const last = realIdx >= 0 ? prev[realIdx] : null

          if (data.type === 'stream') {
            if (last && last.kind === 'text' && last.message_id.startsWith('stream_')) {
              const updated = { ...last, markdown: last.markdown + (data.content || '') } as ConsoleMessage
              return [...prev.slice(0, realIdx), updated, ...prev.slice(realIdx + 1)]
            }
            return [...prev, {
              kind: 'text',
              message_id: `stream_${Date.now()}`,
              timestamp: new Date().toISOString(),
              markdown: data.content || '',
              agent_name: data.agent_name,
            }]
          }

          // type === 'message' — finalize the most recent stream if it exists.
          if (last && last.kind === 'text' && last.message_id.startsWith('stream_')) {
            const finalized = {
              ...last,
              message_id: `final_${last.message_id.slice(7)}`,
              markdown: data.content || last.markdown,
              agent_name: data.agent_name || last.agent_name,
            } as ConsoleMessage
            return [...prev.slice(0, realIdx), finalized, ...prev.slice(realIdx + 1)]
          }
          return [...prev, {
            kind: 'text',
            message_id: `final_${Date.now()}`,
            timestamp: new Date().toISOString(),
            markdown: data.content || '',
            agent_name: data.agent_name,
          }]
        })
      }
    }

    return () => {
      cleanup()
      if (idleTimer) clearTimeout(idleTimer)
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, initialPhase])

  const sendMessage = (content: string, attachments: UserAttachment[] = []) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const all = [...pinned, ...attachments]
    wsRef.current.send(JSON.stringify({
      type: 'user_message',
      content,
      attachments: all,
    }))
    const ts = new Date().toISOString()
    // Echo locally + show "thinking" pseudo-message until first response.
    setMessages(prev => [
      ...prev.filter(m => !(m.kind === 'elapsed' && m.message_id.startsWith('pending_'))),
      {
        kind: 'text',
        message_id: `local_${Date.now()}`,
        timestamp: ts,
        markdown: content,
        agent_name: 'You',
      },
      {
        kind: 'elapsed',
        message_id: `pending_${Date.now()}`,
        timestamp: ts,
        label: `${agentName || 'Agent'} is thinking…`,
        started_at: ts,
      },
    ])
  }

  const sendIntent = (intent: string, payload?: Record<string, unknown>, ref_message_id?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'user_intent',
      intent,
      payload,
      ref_message_id,
    }))
  }

  return (
    <div className={`console ${collapsed ? 'console--collapsed' : ''}`}>
      <ConsoleHeader
        projectId={projectId}
        phase={phase}
        agentName={agentName}
        costToday={costToday}
        connecting={connecting}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onClose={onClose}
      />
      <MessageStream
        messages={messages}
        onIntent={sendIntent}
      />
      <PinnedTray
        pinned={pinned}
        onUnpin={(refId) => setPinned(p => p.filter(a => a.ref_id !== refId))}
      />
      <InputDock
        onSend={sendMessage}
        agentName={agentName}
        disabled={connecting}
      />
    </div>
  )
}
