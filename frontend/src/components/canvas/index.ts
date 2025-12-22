import { SceneNode, type SceneNodeData } from './SceneNode'
import { ShotNode, type ShotNodeData } from './ShotNode'
import { CutNode, type CutNodeData } from './CutNode'
import { BriefNode, type BriefNodeData } from './BriefNode'

export { SceneNode, ShotNode, CutNode, BriefNode }
export type { SceneNodeData, ShotNodeData, CutNodeData, BriefNodeData }

export const nodeTypes = {
  brief: BriefNode,
  scene: SceneNode,
  shot: ShotNode,
  cut: CutNode,
}
