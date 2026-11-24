import { CameraGallery } from "./CameraGallery";
import { FeaturedTools } from "./FeaturedTools";
import { ToolGrid } from "./ToolGrid";
import type { Watch } from "./tools";

/** Everything below the tools reel that shows the tools: featured videos, the camera gallery and the every-tool grid. One chunk, loaded right after the hero. */
export function ToolSections({ onWatch }: { onWatch: (w: Watch) => void }) {
  return (
    <>
      <FeaturedTools onWatch={onWatch} />
      <CameraGallery onWatch={onWatch} />
      <ToolGrid onWatch={onWatch} />
    </>
  );
}
