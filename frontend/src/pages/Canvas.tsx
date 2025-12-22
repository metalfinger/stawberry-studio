import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'

import { getProject, getBlueprint, type Blueprint } from '../api/client'
import { nodeTypes } from '../components/canvas'
import { FloatingChat } from '../components/chat'
import { AssetPanel } from '../components/assets'
import './Canvas.css'

const dagreGraph = new dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

// Base dimensions - significantly increased for expanded content
const NODE_SIZES = {
    brief: { width: 400, height: 280 },     // Expanded for logline + tags
    scene: { width: 400, height: 350 },     // Expanded for all properties + assets
    shot: { width: 380, height: 300 },      // Expanded for camera details + assets
    cut: { width: 380, height: 400 },       // Expanded for details + prompt + history
}

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const isHorizontal = direction === 'LR'
    dagreGraph.setGraph({
        rankdir: direction,
        ranksep: 120,  // Vertical spacing between ranks
        nodesep: 60,   // Horizontal spacing between nodes
        marginx: 40,
        marginy: 40,
    })

    nodes.forEach((node) => {
        const size = NODE_SIZES[node.type as keyof typeof NODE_SIZES] || { width: 250, height: 150 }
        dagreGraph.setNode(node.id, { width: size.width, height: size.height })
    })

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target)
    })

    dagre.layout(dagreGraph)

    const newNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        const size = NODE_SIZES[node.type as keyof typeof NODE_SIZES] || { width: 250, height: 150 }

        return {
            ...node,
            targetPosition: isHorizontal ? Position.Left : Position.Top,
            sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
            position: {
                x: nodeWithPosition.x - size.width / 2,
                y: nodeWithPosition.y - size.height / 2,
            },
        }
    })

    return { nodes: newNodes, edges }
}

// CANVAS VERSION: 1.2 - AUTO-LAYOUT (DAGRE)
export function Canvas() {
    const { projectId } = useParams<{ projectId: string }>()
    const navigate = useNavigate()
    const [project, setProject] = useState<{ name: string; current_phase: string } | null>(null)
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [assetRefreshKey, setAssetRefreshKey] = useState(0)

    const handleAssetRefresh = useCallback(() => {
        setAssetRefreshKey(k => k + 1)
    }, [])

    useEffect(() => {
        if (projectId) {
            loadProject()
            loadBlueprint()
        }
    }, [projectId])

    async function loadProject() {
        if (!projectId) return
        try {
            const p = await getProject(projectId)
            setProject({ name: p.name, current_phase: p.current_phase })
        } catch (e) {
            console.error('Failed to load project', e)
        }
    }

    async function loadBlueprint() {
        if (!projectId) return
        try {
            // Always include assets - if none exist, array will be empty
            const blueprint = await getBlueprint(projectId, true)
            if (blueprint && blueprint.scenes) {
                const { nodes: rawNodes, edges: rawEdges } = blueprintToFlow(blueprint)
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges)
                setNodes(layoutedNodes)
                setEdges(layoutedEdges)
            }
        } catch (e) {
            console.error('Failed to load blueprint', e)
        }
    }

    function blueprintToFlow(blueprint: Blueprint): { nodes: Node[]; edges: Edge[] } {
        const nodes: Node[] = []
        const edges: Edge[] = []

        // Brief Node
        if (blueprint.brief) {
            nodes.push({
                id: 'brief',
                type: 'brief',
                position: { x: 0, y: 0 },
                data: {
                    title: blueprint.brief.title,
                    logline: blueprint.brief.logline,
                    genre: blueprint.brief.genre,
                    aesthetic_tags: (blueprint.brief as any).aesthetic_tags || [],
                    artist_refs: (blueprint.brief as any).artist_refs || [],
                    scene_count: blueprint.scenes.length
                }
            })
        }

        // Sort scenes by scene_number
        const sortedScenes = [...blueprint.scenes].sort((a, b) => a.scene_number - b.scene_number)

        sortedScenes.forEach((scene) => {
            const sceneId = scene.id
            nodes.push({
                id: sceneId,
                type: 'scene',
                position: { x: 0, y: 0 },
                data: {
                    scene_number: scene.scene_number,
                    title: scene.title,
                    description: (scene as any).description,
                    location: scene.location,
                    time_of_day: (scene as any).time_of_day,
                    lighting: (scene as any).lighting,
                    mood: scene.mood,
                    shot_count: scene.shots?.length || 0,
                    assets: (scene as any).assets || [],
                },
            })

            // Edge from Brief to Scene
            if (blueprint.brief) {
                edges.push({
                    id: `brief-${sceneId}`,
                    source: 'brief',
                    target: sceneId,
                    type: 'smoothstep',
                    animated: true,
                })
            }

            // Sort shots by shot_number
            const sortedShots = [...(scene.shots || [])].sort((a, b) => a.shot_number - b.shot_number)
            sortedShots.forEach((shot) => {
                const shotId = shot.id
                nodes.push({
                    id: shotId,
                    type: 'shot',
                    position: { x: 0, y: 0 },
                    data: {
                        shot_number: shot.shot_number,
                        description: shot.description,
                        camera_angle: shot.camera_angle,
                        camera_movement: (shot as any).camera_movement,
                        subject: (shot as any).subject,
                        composition: (shot as any).composition,
                        cut_count: shot.cuts?.length || 0,
                        assets: (shot as any).assets || [],
                    },
                })

                // Connect shot to Scene
                edges.push({
                    id: `edge-${sceneId}-${shotId}`,
                    source: sceneId,
                    target: shotId,
                    type: 'smoothstep',
                })

                // Sort cuts by cut_number
                const sortedCuts = [...(shot.cuts || [])].sort((a, b) => a.cut_number - b.cut_number)

                sortedCuts.forEach((cut) => {
                    const cutId = cut.id
                    nodes.push({
                        id: cutId,
                        type: 'cut',
                        position: { x: 0, y: 0 },
                        data: {
                            cut_number: cut.cut_number,
                            action: cut.action,
                            story_description: (cut as any).story_description,  // Narrative intent from STORY phase
                            beat_type: cut.beat_type,
                            dialogue: (cut as any).dialogue,
                            expression: (cut as any).expression,
                            gesture: (cut as any).gesture,
                            body_language: (cut as any).body_language,
                            generation_status: (cut as any).generation_status,
                            generated_image_url: (cut as any).generated_image_url,
                            assets: (cut as any).assets || [],
                            project_id: projectId,  // Pass project_id for API calls
                        },
                    })
                    edges.push({
                        id: `edge-${shotId}-${cutId}`,
                        source: shotId,
                        target: cutId,
                        type: 'smoothstep',
                    })
                })
            })
        })

        return { nodes, edges }
    }

    const handlePhaseChange = useCallback((newPhase: string) => {
        setProject((p) => p ? { ...p, current_phase: newPhase } : null)
    }, [])

    const handleNodeUpdate = useCallback(() => {
        // Debounce updates to prevent flickering and race conditions
        const timeoutId = setTimeout(() => {
            loadBlueprint()
        }, 300)
        return () => clearTimeout(timeoutId)
    }, [projectId])

    if (!projectId) return <div>No project selected</div>

    return (
        <div className="canvas-page">
            <div className="canvas-header">
                <button className="back-btn" onClick={() => navigate('/')}>← Projects</button>
                <h1>{project?.name || 'Loading...'} (v2.0 - All Properties in Nodes)</h1>
                <span className="phase-badge">{project?.current_phase || 'BRIEFING'}</span>
                <button className="layout-btn" onClick={loadBlueprint} title="Re-layout nodes">⚡ Auto Layout</button>
            </div>

            <div className="canvas-container">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                >
                    <Background color="#334155" gap={20} />
                    <Controls />
                    <MiniMap
                        nodeColor={(node) => {
                            if (node.type === 'scene') return '#3b82f6'
                            if (node.type === 'shot') return '#a855f7'
                            return '#f43f5e'
                        }}
                        style={{ background: '#1e293b' }}
                    />
                </ReactFlow>
            </div>

            <FloatingChat
                projectId={projectId}
                phase={project?.current_phase || 'BRIEFING'}
                onPhaseChange={handlePhaseChange}
                onNodeUpdate={() => { handleNodeUpdate(); handleAssetRefresh(); }}
            />

            {/* Asset Panel */}
            {['ASSETS', 'GENERATE', 'FINAL', 'STORYBOARD', 'GENERATION', 'ASSEMBLY'].includes(project?.current_phase || '') && (
                <AssetPanel projectId={projectId} refreshKey={assetRefreshKey} />
            )}
        </div>
    )
}
