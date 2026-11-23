import {
  TILE_SIZE_PX,
  getWorkspaceLayoutTemplate,
  pixelToTile,
  workspaceLayoutPlacementLabel,
} from '@gather/world';
import type { WorkspaceLayoutPlacement, WorkspaceLayoutPresetId } from '@gather/world';

type Point = { x: number; y: number };
type RoomParticipant = { participationId: string; position: Point };
type RoomBounds = { tx: number; ty: number; width: number; height: number };
type DoorSide = 'north' | 'south' | 'east' | 'west';

export type WorkspaceRoomDoorVisual = {
  roomId: string;
  label: string;
  bounds: RoomBounds;
  tileSize: number;
  entrances: Array<{ side: DoorSide; at: number; span: number }>;
  closed: boolean;
};

export type WorkspaceRoomLight = {
  roomId: string;
  label: string;
  bounds: RoomBounds;
  tileSize: number;
};

export type WorkspaceRoomVisuals = {
  doors: WorkspaceRoomDoorVisual[];
  activeRoom: WorkspaceRoomLight | null;
};

function contains(bounds: RoomBounds, position: Point) {
  const tile = pixelToTile(position);
  return (
    tile.tx >= bounds.tx &&
    tile.tx < bounds.tx + bounds.width &&
    tile.ty >= bounds.ty &&
    tile.ty < bounds.ty + bounds.height
  );
}

export function workspaceRoomVisuals(
  placements: readonly WorkspaceLayoutPlacement[],
  preset: WorkspaceLayoutPresetId | undefined,
  participants: readonly RoomParticipant[],
  localParticipationId: string,
): WorkspaceRoomVisuals {
  const doors = placements.map((placement): WorkspaceRoomDoorVisual => {
    const template = getWorkspaceLayoutTemplate(placement.templateId, preset);
    const bounds = {
      ...placement.origin,
      width: template.width,
      height: template.height,
    };
    const entrances = [
      template.door,
      ...(template.additionalDoor ? [template.additionalDoor] : []),
    ].map(({ side, offset }) => ({
      side,
      span: 2,
      at:
        side === 'north' || side === 'south'
          ? placement.origin.tx + offset
          : placement.origin.ty + offset,
    }));

    return {
      roomId: placement.id,
      label: workspaceLayoutPlacementLabel(placement),
      bounds,
      tileSize: TILE_SIZE_PX,
      entrances,
      closed: participants.some(({ position }) => contains(bounds, position)),
    };
  });

  const local = participants.find(
    ({ participationId }) => participationId === localParticipationId,
  );
  const active = local && doors.find(({ bounds }) => contains(bounds, local.position));

  return {
    doors,
    activeRoom: active
      ? {
          roomId: active.roomId,
          label: active.label,
          bounds: active.bounds,
          tileSize: active.tileSize,
        }
      : null,
  };
}
