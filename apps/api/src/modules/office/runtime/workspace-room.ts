import { OFFICE_LIMITS } from '@gather/contracts';
import { getWorkspaceLayoutTemplate, pixelToTile, TILE_SIZE_PX } from '@gather/world';
import type { WorkspaceLayoutPlacement, WorkspaceLayoutPresetId } from '@gather/world';

type Point = { x: number; y: number };

const roomTilesByLayout = new WeakMap<
  readonly WorkspaceLayoutPlacement[],
  Map<WorkspaceLayoutPresetId | undefined, Map<number, string>>
>();

const maxWorldTiles = OFFICE_LIMITS.maxWorldDimension / TILE_SIZE_PX;

function tileKey(tx: number, ty: number) {
  return ty * maxWorldTiles + tx;
}

function enclosedRoomTiles(
  layout: readonly WorkspaceLayoutPlacement[],
  preset: WorkspaceLayoutPresetId | undefined,
) {
  let profiles = roomTilesByLayout.get(layout);
  if (!profiles) {
    profiles = new Map();
    roomTilesByLayout.set(layout, profiles);
  }
  const existing = profiles.get(preset);
  if (existing) return existing;
  const tiles = new Map<number, string>();
  for (const { id, templateId, origin } of layout) {
    if (templateId !== 'private-office' && templateId !== 'team-studio') continue;
    const { width, height } = getWorkspaceLayoutTemplate(templateId, preset, origin);
    for (let y = origin.ty; y < origin.ty + height; y++) {
      for (let x = origin.tx; x < origin.tx + width; x++) tiles.set(tileKey(x, y), id);
    }
  }
  profiles.set(preset, tiles);
  return tiles;
}

/** Returns the private room boundary containing a participant, if any. */
export function enclosedWorkspaceRoomAt(
  layout: readonly WorkspaceLayoutPlacement[] | undefined,
  preset: WorkspaceLayoutPresetId | undefined,
  position: Point,
) {
  if (!layout) return null;
  const { tx, ty } = pixelToTile(position);
  if (tx < 0 || tx >= maxWorldTiles || ty < 0 || ty >= maxWorldTiles) return null;
  return enclosedRoomTiles(layout, preset).get(tileKey(tx, ty)) ?? null;
}
