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

export function Console({ projectId, initialPhase, onNodeUpdate, onClose }: ConsoleProps) {
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
        // New typed message
        setMessages(prev => [...prev, data as ConsoleMessage])
        // Bump cost meter
        if (data.kind === 'reference_card' && typeof data.cost_usd === 'number') {
          setCostToday(c => c + data.cost_usd)
        }
        if (data.kind === 'tool_call' && typeof data.cost_usd === 'number') {
          setCostToday(c => c + data.cost_usd)
        }
        return
      }

      // Legacy plain message (backwards compat — text only)
      if (data.type === 'message' && data.role !== 'user') {
        setMessages(prev => [...prev, {
          kind: 'text',
          message_id: `m_${Date.now()}`,
          timestamp: new Date().toISOString(),
          markdown: data.content || '',
          agent_name: data.agent_name,
        }])
      }
      if (data.type === 'stream') {
        // Append to last text message if it's recent, else start a new one.
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.kind === 'text' && last.message_id.startsWith('stream_')) {
            return [...prev.slice(0, -1), { ...last, markdown: last.markdown + (data.content || '') }]
          }
          return [...prev, {
            kind: 'text',
            message_id: `stream_${Date.now()}`,
            timestamp: new Date().toISOString(),
            markdown: data.content || '',
            agent_name: data.agent_name,
          }]
        })
      }
    }

    return () => { ws.close() }
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
    // Echo locally
    setMessages(prev => [...prev, {
      kind: 'text',
      message_id: `local_${Date.now()}`,
      timestamp: new Date().toISOString(),
      markdown: content,
      agent_name: 'You',
    }])
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
    <div className="console">
      <ConsoleHeader
        projectId={projectId}
        phase={phase}
        agentName={agentName}
        costToday={costToday}
        connecting={connecting}
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
