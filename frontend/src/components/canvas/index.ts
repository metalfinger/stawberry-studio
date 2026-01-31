import { SceneNode, type SceneNodeData } from './SceneNode'
import { ShotNode, type ShotNodeData } from './ShotNode'
import { CutNode, type CutNodeData } from './CutNode'
import { BriefNode, type BriefNodeData } from './BriefNode'
import { AssetGroupNode, type AssetGroupNodeData } from './AssetGroupNode'
import { AssetMasterNode, type AssetMasterNodeData } from './AssetMasterNode'
import { ImageGeneratorNode, type ImageGeneratorNodeData } from './ImageGeneratorNode'

export { SceneNode, ShotNode, CutNode, BriefNode, AssetGroupNode, AssetMasterNode, ImageGeneratorNode }
export type { SceneNodeData, ShotNodeData, CutNodeData, BriefNodeData, AssetGroupNodeData, AssetMasterNodeData, ImageGeneratorNodeData }

export const nodeTypes = {
  brief: BriefNode,
  scene: SceneNode,
  shot: ShotNode,
  cut: CutNode,
  assetGroup: AssetGroupNode,
  assetMaster: AssetMasterNode,
  imageGenerator: ImageGeneratorNode,
}
