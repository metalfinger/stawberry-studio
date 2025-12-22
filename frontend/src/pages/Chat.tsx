import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, getBrief, createChatConnection } from '../api/client'
import type { Project, Brief, ChatMessage } from '../api/client'
import './Chat.css'

const PHASES = ['BRIEFING', 'BLUEPRINT', 'STORYBOARD', 'GENERATION', 'ASSEMBLY']
const PHASE_AGENTS: Record<string, { name: string; emoji: string; role: string }> = {
    BRIEFING: { name: 'Berry', emoji: '🍓', role: 'Producer' },
    BLUEPRINT: { name: 'Planner', emoji: '📐', role: 'Story Architect' },
    STORYBOARD: { name: 'Storyteller', emoji: '🎬', role: 'Visual Designer' },
    GENERATION: { name: 'Generator', emoji: '✨', role: 'AI Artist' },
    ASSEMBLY: { name: 'Editor', emoji: '🎞️', role: 'Final Assembly' },
}
const BLUEPRINT_AGENTS: Record<string, { name: string; emoji: string; role: string }> = {
    planner: { name: 'Planner', emoji: '📐', role: 'Story Architect' },
    detailer: { name: 'Detailer', emoji: '🎯', role: 'Shot Designer' },
}

export function Chat() {
    const { projectId } = useParams<{ projectId: string }>()
    const navigate = useNavigate()
    const [project, setProject] = useState<Project | null>(null)
    const [brief, setBrief] = useState<Brief | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [connected, setConnected] = useState(false)
    const [currentAgent, setCurrentAgent] = useState<{ name: string; emoji: string; role: string }>(PHASE_AGENTS.BRIEFING)
    const wsRef = useRef<WebSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (projectId) {
            loadProject()
            connectWebSocket()
        }
        return () => {
            wsRef.current?.close()
        }
    }, [projectId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function loadProject() {
        if (!projectId) return
        try {
            const [proj, br] = await Promise.all([
                getProject(projectId),
                getBrief(projectId)
            ])
            setProject(proj)
            setBrief(br)
        } catch (err) {
            console.error('Failed to load project:', err)
        }
    }

    function connectWebSocket() {
        if (!projectId) return
        const ws = createChatConnection(projectId)
        wsRef.current = ws

        ws.onopen = () => setConnected(true)
        ws.onclose = () => setConnected(false)

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            handleMessage(data)
        }
    }

    function handleMessage(data: any) {
        switch (data.type) {
            case 'phase':
                // Update agent based on phase and mode
                if (data.mode && BLUEPRINT_AGENTS[data.mode]) {
                    setCurrentAgent(BLUEPRINT_AGENTS[data.mode])
                } else if (data.phase && PHASE_AGENTS[data.phase]) {
                    setCurrentAgent(PHASE_AGENTS[data.phase])
                }
                break
            case 'phase_change':
                loadProject()
                if (data.agent) {
                    // Agent name sent from backend
                    const newPhase = data.new_phase || 'BRIEFING'
                    setCurrentAgent(PHASE_AGENTS[newPhase] || PHASE_AGENTS.BRIEFING)
                }
                break
            case 'mode_switch':
                // Planner/Detailer switch in Blueprint phase
                if (data.mode && BLUEPRINT_AGENTS[data.mode]) {
                    setCurrentAgent(BLUEPRINT_AGENTS[data.mode])
                }
                break
            case 'history':
                setMessages(data.messages.map((m: any) => ({
                    role: m.role,
                    content: m.content,
                })))
                break
            case 'message':
                setMessages(prev => [...prev, { role: data.role, content: data.content }])
                if (data.role === 'assistant' && projectId) {
                    getBrief(projectId).then(setBrief).catch(console.error)
                    loadProject() // Refresh phase status
                }
                break
            case 'tool':
                setMessages(prev => [...prev, { role: 'tool', content: `🔧 Using: ${data.name}` }])
                break
            case 'error':
                setMessages(prev => [...prev, { role: 'tool', content: `❌ Error: ${data.message}` }])
                break
        }
    }

    function sendMessage() {
        if (!input.trim() || !wsRef.current) return
        wsRef.current.send(JSON.stringify({ message: input }))
        setInput('')
    }

    function handleKeyPress(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const currentPhase = project?.current_phase || 'BRIEFING'

    return (
        <div className="chat-page">
            {/* Sidebar */}
            <aside className="sidebar">
                <button className="btn btn-ghost" onClick={() => navigate('/')}>
                    ← Back to Projects
                </button>

                <div className="project-info">
                    <h3>{project?.name || 'Loading...'}</h3>
                </div>

                {/* Phase Progress */}
                <div className="phase-progress">
                    <h4>Production Phases</h4>
                    <div className="phases">
                        {PHASES.map((phase, i) => {
                            const isActive = phase === currentPhase
                            const isDone = PHASES.indexOf(currentPhase) > i
                            return (
                                <div key={phase} className={`phase-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                                    <span className="phase-dot">{isDone ? '✓' : i + 1}</span>
                                    <span className="phase-name">{phase}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Brief Summary (only in BRIEFING phase) */}
                {currentPhase === 'BRIEFING' && (
                    <div className="brief-summary">
                        <h4>Brief Status</h4>
                        <div className="brief-fields">
                            <div className="field">
                                <span className="label">Title</span>
                                <span className="value">{brief?.title || '—'}</span>
                            </div>
                            <div className="field">
                                <span className="label">Logline</span>
                                <span className="value">{brief?.logline || '—'}</span>
                            </div>
                            <div className="field">
                                <span className="label">Genre</span>
                                <span className="value">{brief?.genre || '—'}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Agent Info */}
                <div className="agent-info">
                    <div className="agent-avatar">{currentAgent.emoji}</div>
                    <div className="agent-details">
                        <span className="agent-name">{currentAgent.name}</span>
                        <span className="agent-role">{currentAgent.role}</span>
                        <span className={`status ${connected ? 'online' : 'offline'}`}>
                            {connected ? '● Connected' : '○ Disconnected'}
                        </span>
                    </div>
                </div>
            </aside>

            {/* Chat Area */}
            <main className="chat-main">
                <div className="chat-messages">
                    {messages.map((msg, i) => (
                        <div key={i} className={`message ${msg.role}`}>
                            {msg.content}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="chat-input-area">
                    <input
                        type="text"
                        placeholder="Type your message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={!connected}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={sendMessage}
                        disabled={!connected || !input.trim()}
                    >
                        Send
                    </button>
                </div>
            </main>
        </div>
    )
}
