import { useState, useEffect, useCallback, useRef } from 'react'
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

import { getProject, getBlueprint, getAssets, type Blueprint, type AssetsResponse } from '../api/client'
import { nodeTypes } from '../components/canvas'
import { Console } from '../components/console/Console'
import { LibraryDrawer } from '../components/library/LibraryDrawer'
import { ContextPanel } from '../components/context/ContextPanel'
import { CommandPalette } from '../components/palette/CommandPalette'
import './Canvas.css'


// Base dimensions - significantly increased for expanded content
const NODE_SIZES: Record<string, { width: number; height: number }> = {
    brief: { width: 400, height: 280 },     // Expanded for logline + tags
    scene: { width: 400, height: 350 },     // Expanded for all properties + assets
    shot: { width: 380, height: 300 },      // Expanded for camera details + assets
    cut: { width: 380, height: 400 },       // Expanded for details + prompt + history
    assetGroup: { width: 380, height: 100 }, // Asset group container (wider for padding)
    assetMaster: { width: 340, height: 450 }, // Individual asset with generation (taller)
}

// Asset group configuration
// Asset group configuration
const ASSET_GROUP_CONFIG = {
    startX: 100, // Initial offset, but will be calculated dynamically relative to blueprint
    groupGap: 60,  // Vertical gap between groups
    assetGap: 40,  // Horizontal gap between assets within group
    assetPaddingX: 40, // Horizontal padding inside group
    assetPaddingY: 80, // Top padding inside group (below header)
}

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const isHorizontal = direction === 'LR'

    // Create a fresh graph for every layout call to avoid shared state corruption
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))

    // Separate blueprint nodes from asset nodes
    const blueprintNodes = nodes.filter(n => !['assetGroup', 'assetMaster'].includes(n.type || ''))
    const assetNodes = nodes.filter(n => ['assetGroup', 'assetMaster'].includes(n.type || ''))

    // Only layout blueprint nodes with Dagre
    dagreGraph.setGraph({
        rankdir: direction,
        ranksep: 120,
        nodesep: 60,
        marginx: 40,
        marginy: 40,
    })

    blueprintNodes.forEach((node) => {
        const size = NODE_SIZES[node.type || 'brief'] || { width: 250, height: 150 }
        dagreGraph.setNode(node.id, { width: size.width, height: size.height })
    })

    edges.forEach((edge) => {
        // Only add edges between blueprint nodes
        if (blueprintNodes.some(n => n.id === edge.source) && blueprintNodes.some(n => n.id === edge.target)) {
            dagreGraph.setEdge(edge.source, edge.target)
        }
    })

    dagre.layout(dagreGraph)

    const layoutedBlueprintNodes = blueprintNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        const size = NODE_SIZES[node.type || 'brief'] || { width: 250, height: 150 }

        if (!nodeWithPosition) {
            console.warn(`[Canvas] No position found for node ${node.id} in layout!`)
            return node // Fallback to current node state
        }

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

    // Asset nodes keep their manual positions BUT we want to move the groups to the right of the blueprint
    // Find the max X of the blueprint layout to avoid overlap
    let maxBlueprintX = 0
    layoutedBlueprintNodes.forEach(node => {
        // Safely get width, handling string/number types
        let width = NODE_SIZES[node.type || 'brief']?.width || 250
        if (node.width) width = typeof node.width === 'string' ? parseInt(node.width) : node.width
        else if (node.style?.width) width = typeof node.style.width === 'string' ? parseInt(node.style.width) : (node.style.width as number)

        const xRight = node.position.x + (width || 0)
        if (xRight > maxBlueprintX) maxBlueprintX = xRight
    })

    // Reposition Asset Groups to be safe distance from Blueprint
    const SAFE_MARGIN_X = 600
    const assetStartX = Math.max(2500, maxBlueprintX + SAFE_MARGIN_X) // Minimum 2500, or wider if tree is huge

    const repositionedAssetNodes = assetNodes.map(node => {
        // If it's a group, move it to the computed startX
        if (node.type === 'assetGroup') {
            return {
                ...node,
                position: {
                    ...node.position,
                    x: assetStartX
                }
            }
        }
        // If it's an assetMaster or other child, their position is relative to parent, so we DON'T touch x/y
        // relative to the group. They are already correct inside the group.
        return node
    })

    return { nodes: [...layoutedBlueprintNodes, ...repositionedAssetNodes], edges }
}

// CANVAS VERSION: 2.0 - UNIFIED CANVAS (Blueprint + Assets)
export function Canvas() {
    const { projectId } = useParams<{ projectId: string }>()
    const navigate = useNavigate()
    const [project, setProject] = useState<{ name: string; current_phase: string } | null>(null)
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)
    const [libraryOpen, setLibraryOpen] = useState(false)
    const [paletteOpen, setPaletteOpen] = useState(false)

    // Global keyboard shortcuts: ⌘L library, ⌘K palette, Esc close drawers.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey
            if (meta && e.key.toLowerCase() === 'l') {
                e.preventDefault()
                setLibraryOpen(o => !o)
            } else if (meta && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                setPaletteOpen(o => !o)
            } else if (e.key === 'Escape') {
                setLibraryOpen(false)
                setPaletteOpen(false)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const updateTimeoutRef = useRef<any>(null)

    useEffect(() => {
        if (projectId) {
            loadProject()
            loadCanvasData()
        }
        return () => {
            if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
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

    async function loadCanvasData() {
        if (!projectId) return
        console.log('[Canvas] loadCanvasData called for project:', projectId)
        try {
            // Load blueprint and assets in parallel
            const [blueprint, assetsData] = await Promise.all([
                getBlueprint(projectId, true),
                getAssets(projectId).catch(() => ({ characters: [], locations: [], props: [], frames: [] }))
            ])
            console.log('[Canvas] Blueprint loaded:', blueprint)
            console.log('[Canvas] Scenes count:', blueprint?.scenes?.length || 0)
            console.log('[Canvas] Assets loaded:', assetsData)

            // Convert blueprint to nodes
            let allNodes: Node[] = []
            let allEdges: Edge[] = []

            if (blueprint && blueprint.scenes) {
                const { nodes: blueprintNodes, edges: blueprintEdges } = blueprintToFlow(blueprint)
                allNodes = [...blueprintNodes]
                allEdges = [...blueprintEdges]
                console.log('[Canvas] Blueprint nodes created:', blueprintNodes.length)
            } else {
                console.error('[Canvas] Blueprint data is invalid or missing scenes!', blueprint)
            }

            // Convert assets to nodes
            const assetNodes = assetsToFlow(assetsData, projectId)
            allNodes = [...allNodes, ...assetNodes]
            console.log(`[Canvas] Processing ${allNodes.length} nodes and ${allEdges.length} edges`);

            if (allNodes.length === 0) {
                console.warn('[Canvas] No nodes created from blueprint or assets!');
            }

            // Apply layout (only affects blueprint nodes)
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(allNodes, allEdges)

            if (layoutedNodes.length === 0 && allNodes.length > 0) {
                console.error('[Canvas] Layout returned 0 nodes but we had input nodes! Input count:', allNodes.length);
            }

            if (layoutedNodes.length > 0) {
                setNodes(layoutedNodes)
                setEdges(layoutedEdges)
                console.log('[Canvas] Layout applied, final nodes count:', layoutedNodes.length)
            } else if (allNodes.length === 0) {
                console.warn('[Canvas] Setting empty nodes/edges (valid empty state)')
                setNodes([])
                setEdges([])
            } else {
                console.error('[Canvas] REFUSING to set empty nodes because we had input nodes that failed layout or were missing!')
            }
        } catch (e) {
            console.error('[Canvas] Failed to load canvas data:', e)
        }
    }

    // Convert assets to React Flow nodes with HORIZONTAL layout
    function assetsToFlow(assets: AssetsResponse, projectId: string): Node[] {
        const nodes: Node[] = []
        let currentGroupY = 0 // Vertical stacking of GROUPS

        const groupTypes: Array<{ key: keyof AssetsResponse; type: 'character' | 'location' | 'prop'; title: string }> = [
            { key: 'characters', type: 'character', title: 'Characters' },
            { key: 'locations', type: 'location', title: 'Locations' },
            { key: 'props', type: 'prop', title: 'Props' },
        ]

        groupTypes.forEach(({ key, type, title }) => {
            const assetList = assets[key] || []
            if (assetList.length === 0) return // Skip empty groups

            const groupId = `asset-group-${type}`

            // Horizontal Layout Calculation
            const assetWidth = NODE_SIZES.assetMaster.width
            const assetHeight = NODE_SIZES.assetMaster.height

            // Total width = (n * assetWidth) + ((n-1) * gap) + padding
            const totalAssetsWidth = assetList.length * assetWidth
            const totalGapsWidth = Math.max(0, assetList.length - 1) * ASSET_GROUP_CONFIG.assetGap
            const contentWidth = totalAssetsWidth + totalGapsWidth

            // Group Width
            const groupWidth = contentWidth + (ASSET_GROUP_CONFIG.assetPaddingX * 2)

            // Group Height (Header + Top Pad + Asset Height + Bottom Pad)
            const GROUP_HEADER_HEIGHT = 60
            const groupHeight = GROUP_HEADER_HEIGHT + ASSET_GROUP_CONFIG.assetPaddingY + assetHeight + 40 // +40 bottom pad

            // Create group node
            nodes.push({
                id: groupId,
                type: 'assetGroup',
                // X set initially to 0, will be moved by getLayoutedElements
                position: { x: 0, y: currentGroupY },
                data: {
                    groupType: type,
                    title: title,
                    count: assetList.length,
                    expanded: true,
                },
                style: {
                    width: groupWidth,
                    height: groupHeight,
                },
            })

            // Create asset nodes within group (Stacked Horizontally)
            assetList.forEach((asset: any, index: number) => {
                // X position: Padding + (index * (width + gap))
                const assetX = ASSET_GROUP_CONFIG.assetPaddingX + (index * (assetWidth + ASSET_GROUP_CONFIG.assetGap))
                const assetY = GROUP_HEADER_HEIGHT + ASSET_GROUP_CONFIG.assetPaddingY

                nodes.push({
                    id: `asset-${asset.id}`,
                    type: 'assetMaster',
                    position: {
                        x: assetX,
                        y: assetY,
                    },
                    parentId: groupId, // Relative positioning!
                    data: {
                        asset: {
                            id: asset.id,
                            name: asset.name,
                            type: asset.type,
                            description: asset.description,
                            suggested_prompt: (asset as any).suggested_prompt,
                            consistency_tokens: (asset as any).consistency_tokens,
                            distinctive_features: (asset as any).distinctive_features,
                            wardrobe_lock: (asset as any).wardrobe_lock,
                        },
                        projectId: projectId,
                    },
                    draggable: false, // Child nodes usually shouldn't be draggable out of parent in this setup
                    extent: 'parent', // Constrain to parent
                })
            })

            // Move next group down vertically
            currentGroupY += groupHeight + ASSET_GROUP_CONFIG.groupGap
        })

        return nodes
    }

    function blueprintToFlow(blueprint: Blueprint): { nodes: Node[]; edges: Edge[] } {
        console.log('[Canvas] blueprintToFlow processing:', blueprint)
        const nodes: Node[] = []
        const edges: Edge[] = []

        if (!blueprint) {
            console.error('[Canvas] blueprintToFlow received null/undefined blueprint!')
            return { nodes, edges }
        }

        // Brief Node
        if (blueprint.brief) {
            console.log('[Canvas] Adding brief node')
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
                    scene_count: blueprint.scenes?.length || 0
                }
            })
        } else {
            console.warn('[Canvas] No brief in blueprint')
        }

        // Sort scenes by scene_number
        const sortedScenes = [...(blueprint.scenes || [])].sort((a, b) => a.scene_number - b.scene_number)
        console.log(`[Canvas] Processing ${sortedScenes.length} scenes`)

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

    const handleNodeUpdate = useCallback(() => {
        console.log('[Canvas] handleNodeUpdate triggered')

        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current)
        }

        // Debounce updates to prevent flickering and race conditions
        updateTimeoutRef.current = setTimeout(() => {
            console.log('[Canvas] Debounce complete, calling loadCanvasData')
            loadCanvasData()
            updateTimeoutRef.current = null
        }, 300)
    }, [projectId])

    // Re-layout only blueprint nodes, preserving asset node positions and sizes
    const handleAutoLayoutBlueprint = useCallback(() => {
        setNodes((currentNodes) => {
            // Separate blueprint nodes from asset nodes
            const blueprintNodes = currentNodes.filter(n => !['assetGroup', 'assetMaster'].includes(n.type || ''))
            const assetNodes = currentNodes.filter(n => ['assetGroup', 'assetMaster'].includes(n.type || ''))

            // Create a fresh graph for layout
            const dagreGraph = new dagre.graphlib.Graph()
            dagreGraph.setDefaultEdgeLabel(() => ({}))

            dagreGraph.setGraph({
                rankdir: 'TB',
                ranksep: 120,
                nodesep: 60,
                marginx: 40,
                marginy: 40,
            })

            // Add blueprint nodes to dagre
            blueprintNodes.forEach((node) => {
                const size = NODE_SIZES[node.type || 'brief'] || { width: 250, height: 150 }
                dagreGraph.setNode(node.id, { width: size.width, height: size.height })
            })

            // Add edges between blueprint nodes
            edges.forEach((edge) => {
                if (blueprintNodes.some(n => n.id === edge.source) && blueprintNodes.some(n => n.id === edge.target)) {
                    dagreGraph.setEdge(edge.source, edge.target)
                }
            })

            // Run dagre layout
            dagre.layout(dagreGraph)

            // Update blueprint node positions
            const layoutedBlueprintNodes = blueprintNodes.map((node) => {
                const nodeWithPosition = dagreGraph.node(node.id)
                const size = NODE_SIZES[node.type || 'brief'] || { width: 250, height: 150 }

                return {
                    ...node,
                    targetPosition: Position.Top,
                    sourcePosition: Position.Bottom,
                    position: {
                        x: nodeWithPosition.x - size.width / 2,
                        y: nodeWithPosition.y - size.height / 2,
                    },
                }
            })

            // Return blueprint nodes with new positions + asset nodes unchanged
            return [...layoutedBlueprintNodes, ...assetNodes]
        })
    }, [edges, setNodes])

// Get MiniMap color for node type
    const getNodeColor = (node: Node) => {
        switch (node.type) {
            case 'brief': return '#f43f5e'
            case 'scene': return '#3b82f6'
            case 'shot': return '#a855f7'
            case 'cut': return '#ec4899'
            case 'assetGroup': return '#10b981'
            case 'assetMaster': return '#059669'
            default: return '#6b7280'
        }
    }

    if (!projectId) return <div>No project selected</div>

    return (
        <div className="canvas-page">
            <div className="canvas-header">
                <button className="back-btn" onClick={() => navigate('/')}>← Projects</button>
                <h1>{project?.name || 'Loading...'}</h1>
                {/* Phase status lives in the PhaseRail above; canvas header
                    only shows project-scoped controls. The legacy
                    "Add Generator" button is removed — generation now flows
                    through the Console agentic plan path. */}
                <button className="layout-btn" onClick={handleAutoLayoutBlueprint} title="Re-layout nodes">
                    ⚡ Auto Layout
                </button>
            </div>

            <div className="canvas-body">
            <LibraryDrawer
                projectId={projectId}
                open={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                onOpen={() => setLibraryOpen(true)}
            />
            <div className="canvas-container">
                {/* Legacy `properties-panel-portal` removed — NodeProperties
                    inspector deleted in favor of the chat PlanCard flow. */}

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={(_, node) => {
                        setSelectedNodeId(node.id)
                        setSelectedNodeType(node.type ?? null)
                    }}
                    onPaneClick={() => {
                        setSelectedNodeId(null)
                        setSelectedNodeType(null)
                    }}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.1 }}
                    minZoom={0.1}
                    maxZoom={4}
                >
                    <Background color="#334155" gap={20} />
                    <Controls />
                    <MiniMap
                        nodeColor={getNodeColor}
                        style={{ background: '#1e293b' }}
                    />
                </ReactFlow>
            </div>
            </div>

            <Console
                projectId={projectId}
                initialPhase={project?.current_phase || 'BRIEF'}
                onNodeUpdate={handleNodeUpdate}
            />
            <ContextPanel
                projectId={projectId}
                selectedNodeId={selectedNodeId}
                selectedNodeType={selectedNodeType}
            />
            <CommandPalette
                projectId={projectId}
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                onOpenLibrary={() => { setPaletteOpen(false); setLibraryOpen(true) }}
            />
            {/* Library FAB removed — the docked left rail now serves as
                both the affordance and the toggle. */}
        </div>
    )
}
