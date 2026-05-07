import { useEffect, useRef, useState, useCallback } from 'react'
import { createChatConnection } from '../api/client'

export interface ChatWSData {
    type: string
    [key: string]: any
}

export interface UseProjectWebSocketOptions {
    /**
     * Set false to defer connection (e.g. before projectId is known).
     */
    enabled?: boolean
}

/**
 * Single shared WebSocket lifecycle hook for project chat.
 *
 * Replaces the duplicated WebSocket plumbing in FloatingChat / Chat / Canvas.
 * Returns `connected` flag and a stable `send` function.
 */
export function useProjectWebSocket(
    projectId: string | undefined,
    phase: string | undefined,
    onMessage: (data: ChatWSData) => void,
    options: UseProjectWebSocketOptions = {},
) {
    const { enabled = true } = options
    const wsRef = useRef<WebSocket | null>(null)
    const [connected, setConnected] = useState(false)

    // Keep `onMessage` in a ref so we don't reconnect on every render of the consumer.
    const onMessageRef = useRef(onMessage)
    useEffect(() => {
        onMessageRef.current = onMessage
    }, [onMessage])

    useEffect(() => {
        if (!enabled || !projectId) return

        wsRef.current?.close()
        const ws = createChatConnection(projectId, phase)
        wsRef.current = ws

        ws.onopen = () => setConnected(true)
        ws.onclose = () => setConnected(false)
        ws.onerror = () => setConnected(false)
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                onMessageRef.current(data)
            } catch (err) {
                console.warn('[useProjectWebSocket] failed to parse', err)
            }
        }

        return () => {
            ws.close()
            if (wsRef.current === ws) wsRef.current = null
        }
    }, [projectId, phase, enabled])

    const send = useCallback((data: unknown) => {
        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) return false
        ws.send(typeof data === 'string' ? data : JSON.stringify(data))
        return true
    }, [])

    return { connected, send, ws: wsRef }
}
