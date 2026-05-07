// ImageMessage — agent-emitted image with optional caption and metadata.
import type { ConsoleMessage } from '../types'

interface Props { msg: Extract<ConsoleMessage, { kind: 'image' }> }

export function ImageMessage({ msg }: Props) {
  return (
    <div className="console-msg">
      <div className="image-msg">
        <img src={msg.url} alt={msg.caption || 'Generated image'} className="image-msg__img" />
        {msg.caption && <div className="image-msg__caption">{msg.caption}</div>}
      </div>
    </div>
  )
}
