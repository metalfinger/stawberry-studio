import { useEffect, useRef, useState } from 'react'

export type GenerationStatus =
    | 'queued'
    | 'preparing'
    | 'uploading'
    | 'generating'
    | 'rendering'
    | 'downloading'
    | 'complete'
    | 'failed'
    | 'cancelled'

export interface GenerationProgress {
    id: string
    status: GenerationStatus
    progress_percentage: number
    current_step: string | null
    output_image_url: string | null
    error_message: string | null
}

const TERMINAL: GenerationStatus[] = ['complete', 'failed', 'cancelled']

/**
 * Poll a generation request until terminal. Replaces the duplicated polling
 * loops in AssetMasterNode and ImageGeneratorNode.
 *
 * @param requestId  generation_requests.id, or null/undefined to disable polling
 * @param onComplete fired once when the request reaches `complete`
 * @param intervalMs polling cadence (default 1000ms)
 */
export function useGenerationPoll(
    requestId: string | null | undefined,
    onComplete?: (final: GenerationProgress) => void,
    intervalMs = 1000,
) {
    const [progress, setProgress] = useState<GenerationProgress | null>(null)
    const [done, setDone] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const onCompleteRef = useRef(onComplete)
    useEffect(() => {
        onCompleteRef.current = onComplete
    }, [onComplete])

    useEffect(() => {
        if (!requestId) {
            setProgress(null)
            setDone(false)
            return
        }
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null

        const tick = async () => {
            try {
                const res = await fetch(`/api/elements/requests/${requestId}`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = (await res.json()) as GenerationProgress
                if (cancelled) return
                setProgress(data)
                if (TERMINAL.includes(data.status)) {
                    setDone(true)
                    if (data.status === 'complete') onCompleteRef.current?.(data)
                    if (data.status === 'failed') setError(data.error_message || 'failed')
                    return
                }
                timer = setTimeout(tick, intervalMs)
            } catch (e: any) {
                if (cancelled) return
                setError(String(e))
                timer = setTimeout(tick, Math.max(intervalMs * 2, 2000))
            }
        }

        tick()
        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
        }
    }, [requestId, intervalMs])

    return { progress, done, error }
}
