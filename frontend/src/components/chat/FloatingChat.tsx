import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { MessageSquare, BookOpen, Users, Target, Video, Settings, Loader2 } from 'lucide-react'
import { createChatConnection } from '../../api/client'
import type { ChatMessage } from '../../api/client'
import { TimelinePills } from './TimelinePills'
import './FloatingChat.css'

interface PhaseConfig {
    role: string
    icon: React.ElementType
    description: string
}

interface FloatingChatProps {
    projectId: string
    phase: string
    onPhaseChange?: (newPhase: string) => void
    onNodeUpdate?: () => void
}

// Berry adapts to each phase with a different focus
const PHASE_CONFIG: Record<string, PhaseConfig> = {
    BRIEF: { role: 'Director', icon: MessageSquare, description: 'Defining your vision' },
    STORY: { role: 'Writer', icon: BookOpen, description: 'Structuring the narrative' },
    ASSETS: { role: 'Designer', icon: Users, description: 'Creating visual elements' },
    GENERATE: { role: 'Artist', icon: Target, description: 'Rendering visuals' },
    FINAL: { role: 'Editor', icon: Video, description: 'Final assembly' },
}

// Phase metadata for transitions
const PHASES = [
    { id: 'BRIEF', name: 'Brief' },
    { id: 'STORY', name: 'Story' },
    { id: 'ASSETS', name: 'Assets' },
    { id: 'GENERATE', name: 'Generate' },
    { id: 'FINAL', name: 'Final' },
]

const DEFAULT_CONFIG = PHASE_CONFIG.BRIEF

export function FloatingChat({ projectId, phase, onPhaseChange, onNodeUpdate }: FloatingChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [connected, setConnected] = useState(false)
    const [isThinking, setIsThinking] = useState(false)
    const [currentTool, setCurrentTool] = useState<string | null>(null)
    const [viewingPhase, setViewingPhase] = useState(phase)
    const [minimized, setMinimized] = useState(false)
    const [focusTag, setFocusTag] = useState<string | null>(null)
    const [dynamicRole, setDynamicRole] = useState<string | null>(null)
    const [phaseTransition, setPhaseTransition] = useState<{from: string, to: string} | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const config = PHASE_CONFIG[viewingPhase] || DEFAULT_CONFIG
    const PhaseIcon = config.icon

    // Update viewing phase when project phase changes
    useEffect(() => {
        setViewingPhase(phase)
        setDynamicRole(null)
    }, [phase])

    useEffect(() => {
        setDynamicRole(null)
        connectWebSocket(viewingPhase)
        return () => wsRef.current?.close()
    }, [projectId, viewingPhase])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function connectWebSocket(targetPhase: string) {
        wsRef.current?.close()
        const ws = createChatConnection(projectId, targetPhase)
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
                // Berry is now in a different mode
                break
            case 'phase_change':
                // Phase changed - backend already switched agents on same connection
                // Don't reconnect - just update UI and let messages flow
                if (data.new_phase) {
                    setPhaseTransition({ from: data.old_phase, to: data.new_phase })
                    setViewingPhase(data.new_phase)
                    setMessages([])  // Clear old phase messages
                    setIsThinking(false)
                    setCurrentTool(null)
                    onPhaseChange?.(data.new_phase)
                    // Auto-hide transition banner after 5 seconds
                    setTimeout(() => setPhaseTransition(null), 5000)
                    // Don't reconnect - backend continues on same connection
                }
                break
            case 'mode_switch':
                if (data.focus) {
                    setFocusTag(data.focus)
                } else {
                    setFocusTag(null)
                }

                // Update dynamic role based on mode
                if (data.mode === 'pre_production') setDynamicRole('Pre-Production Lead')
                else if (data.mode === 'prompter') setDynamicRole('Artist')
                else if (data.mode === 'renderer') setDynamicRole('VFX Lead')
                else if (data.mode === 'qa') setDynamicRole('QA Lead')
                else if (data.mode === 'planner') setDynamicRole('Writer')
                else if (data.mode === 'detailer') setDynamicRole('Detailer')
                break
            case 'history':
                setMessages(data.messages.map((m: any) => ({
                    role: m.role,
                    content: m.content,
                    agent_name: m.agent_name
                })))
                break
            case 'message':
                // Skip user messages from server - we add them locally for instant UX
                if (data.role === 'user') break

                setMessages(prev => [...prev, {
                    role: data.role,
                    content: data.content,
                    agent_name: data.agent_name
                }])
                if (data.role === 'assistant') {
                    setIsThinking(false)
                    setCurrentTool(null)
                    onNodeUpdate?.()
                }
                break
            case 'tool':
                setCurrentTool(data.name)
                setMessages(prev => [...prev, {
                    role: 'tool',
                    content: data.name
                }])
                onNodeUpdate?.()
                break
            case 'error':
                setMessages(prev => [...prev, {
                    role: 'tool',
                    content: `Error: ${data.message}`
                }])
                break
        }
    }

    function sendMessage() {
        if (!input.trim() || !wsRef.current) return
        // Add user message immediately for better UX
        setMessages(prev => [...prev, {
            role: 'user',
            content: input
        }])
        setIsThinking(true)
        wsRef.current.send(JSON.stringify({ message: input }))
        setInput('')
    }

    function handleKeyPress(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    function handlePhaseClick(phaseId: string) {
        if (phaseId !== viewingPhase) {
            setViewingPhase(phaseId)
            setMessages([])
        }
    }

    const isViewingCurrent = viewingPhase === phase

    return (
        <div className={`floating-chat ${minimized ? 'minimized' : ''}`}>
            {/* Timeline Pills */}
            {!minimized && (
                <TimelinePills
                    currentPhase={phase}
                    viewingPhase={viewingPhase}
                    onPhaseClick={handlePhaseClick}
                />
            )}

            {/* Header */}
            <div className="chat-header" onClick={() => setMinimized(!minimized)}>
                <div className="agent-indicator">
                    <div className="agent-icon">
                        <PhaseIcon size={18} />
                    </div>
                    <div className="agent-info">
                        <span className="agent-name">Berry</span>
                        <span className="agent-role">{dynamicRole || config.role}</span>
                    </div>
                    <span className={`status-dot ${connected ? 'online' : ''}`} />
                </div>
                {focusTag && (
                    <div className="focus-tag">
                        <Settings size={12} /> {focusTag}
                    </div>
                )}
                {!isViewingCurrent && (
                    <div className="viewing-history-badge">History</div>
                )}
                <button className="toggle-btn">{minimized ? '◀' : '▶'}</button>
            </div>

            {/* Phase Transition Banner */}
            {phaseTransition && !minimized && (
                <div className="phase-transition-banner">
                    <div className="transition-content">
                        <span className="transition-emoji">🎬</span>
                        <div className="transition-text">
                            <strong>Phase Complete!</strong>
                            <span>{PHASES.find(p => p.id === phaseTransition.from)?.name} → {PHASES.find(p => p.id === phaseTransition.to)?.name}</span>
                        </div>
                        <button onClick={() => setPhaseTransition(null)} className="dismiss-btn">✕</button>
                    </div>
                </div>
            )}

            {/* Body */}
            {!minimized && (
                <>
                    <div className="chat-body">
                        {messages.map((msg, i) => (
                            <div key={i} className={`message ${msg.role}`}>
                                {msg.role === 'assistant' && (
                                    <div className="msg-agent-header">
                                        <PhaseIcon size={14} className="msg-icon" />
                                        <span className="msg-agent-name">Berry</span>
                                    </div>
                                )}
                                {msg.role === 'tool' && (
                                    <div className="tool-message">
                                        <Settings size={12} className="spin" />
                                        <span>{msg.content}</span>
                                    </div>
                                )}
                                {msg.role !== 'tool' && (
                                    <div className="msg-content">
                                        {msg.role === 'assistant' ? (
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isThinking && (
                            <div className={`message assistant thinking`}>
                                <div className="msg-agent-header">
                                    <PhaseIcon size={14} className="msg-icon" />
                                    <span className="msg-agent-name">Berry</span>
                                </div>
                                {currentTool ? (
                                    <div className="tool-indicator">
                                        <Settings size={14} className="spin" />
                                        <span className="tool-name">{currentTool}</span>
                                    </div>
                                ) : (
                                    <div className="thinking-indicator">
                                        <Loader2 size={16} className="spin" />
                                    </div>
                                )}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="chat-input">
                        <input
                            type="text"
                            placeholder={isViewingCurrent ? `Message Berry...` : `Message Berry (${viewingPhase} mode)...`}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={!connected}
                        />
                        <button onClick={sendMessage} disabled={!connected || !input.trim()}>
                            ➤
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
