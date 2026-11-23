import { getWorkspaceLayoutTemplate, pixelToTile } from '@gather/world';
import type { WorkspaceLayoutPlacement, WorkspaceLayoutPresetId } from '@gather/world';

type Point = { x: number; y: number };

/** Returns the private room boundary containing a participant, if any. */
export function enclosedWorkspaceRoomAt(
  layout: readonly WorkspaceLayoutPlacement[] | undefined,
  preset: WorkspaceLayoutPresetId | undefined,
  position: Point,
) {
  if (!layout) return null;
  const tile = pixelToTile(position);
  return (
    layout.find(({ origin, templateId }) => {
      if (templateId !== 'private-office' && templateId !== 'team-studio') return false;
      const { width, height } = getWorkspaceLayoutTemplate(templateId, preset);
      return (
        tile.tx >= origin.tx &&
        tile.tx < origin.tx + width &&
        tile.ty >= origin.ty &&
        tile.ty < origin.ty + height
      );
    })?.id ?? null
  );
}
