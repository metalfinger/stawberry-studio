import { create } from 'zustand'
import { getProject, getBlueprint, getAssets } from '../api/client'
import type { Blueprint, AssetsResponse } from '../api/client'

interface Project {
    id: string
    name: string
    current_phase: string
    created_at: string
    updated_at: string
}

interface ProjectStoreState {
    projectId: string | null
    project: Project | null
    blueprint: Blueprint | null
    assets: AssetsResponse | null
    loading: boolean
    error: string | null

    setProjectId: (id: string | null) => void
    refresh: () => Promise<void>
    refreshProject: () => Promise<void>
    refreshBlueprint: () => Promise<void>
    refreshAssets: () => Promise<void>
    setPhase: (phase: string) => void
    clear: () => void
}

/**
 * Single source of truth for project state across pages.
 *
 * Replaces the duplicated `getProject + getBlueprint + getAssets` fetches in
 * Canvas, Elements, FloatingChat. Server-derived state lives here; UI/transient
 * state stays local in components.
 */
export const useProjectStore = create<ProjectStoreState>((set, get) => ({
    projectId: null,
    project: null,
    blueprint: null,
    assets: null,
    loading: false,
    error: null,

    setProjectId: (id) => {
        if (get().projectId === id) return
        set({ projectId: id, project: null, blueprint: null, assets: null })
        if (id) void get().refresh()
    },

    refresh: async () => {
        const id = get().projectId
        if (!id) return
        set({ loading: true, error: null })
        try {
            const [project, blueprint, assets] = await Promise.all([
                getProject(id),
                getBlueprint(id, true),
                getAssets(id),
            ])
            set({ project, blueprint, assets, loading: false })
        } catch (e: any) {
            set({ error: String(e), loading: false })
        }
    },

    refreshProject: async () => {
        const id = get().projectId
        if (!id) return
        try {
            const project = await getProject(id)
            set({ project })
        } catch (e: any) {
            set({ error: String(e) })
        }
    },

    refreshBlueprint: async () => {
        const id = get().projectId
        if (!id) return
        try {
            const blueprint = await getBlueprint(id, true)
            set({ blueprint })
        } catch (e: any) {
            set({ error: String(e) })
        }
    },

    refreshAssets: async () => {
        const id = get().projectId
        if (!id) return
        try {
            const assets = await getAssets(id)
            set({ assets })
        } catch (e: any) {
            set({ error: String(e) })
        }
    },

    setPhase: (phase) =>
        set((s) => (s.project ? { project: { ...s.project, current_phase: phase } } : s)),

    clear: () =>
        set({
            projectId: null,
            project: null,
            blueprint: null,
            assets: null,
            loading: false,
            error: null,
        }),
}))
