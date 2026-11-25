export type {
  OfficeGeometry,
  OfficeObjectDefinition,
  OfficeSeatDefinition,
  OfficeZoneDefinition,
  OfficeZoneKind,
  TileCollision,
  TileCollisionInput,
  TilePoint,
  TileRect,
  ValidatedOfficeGeometry,
  WorldBounds,
  WorldPoint,
} from './types.js';
export {
  TILE_SIZE_PX,
  canStep,
  createTileCollision,
  isBlockedTile,
  isEdgeBlocked,
  isTileInBounds,
  pixelToTile,
} from './collision.js';
export { COMMONS_GEOMETRY } from './commons.js';
export { VIVO_GEOMETRY, VIVO_BLOCKED_TILES } from './vivo.js';
export { MAX_WORKSPACE_ROOM_COUNT, generateWorkspaceOfficeGeometry } from './workspace.js';
export { validateOfficeGeometry } from './geometry.js';
export {
  DEFAULT_WORKSPACE_LAYOUT,
  WORKSPACE_LAYOUT_BOUNDS,
  WORKSPACE_LAYOUT_CORRIDORS,
  WORKSPACE_LAYOUT_SIZE,
  WORKSPACE_LAYOUT_PRESETS,
  WORKSPACE_LAYOUT_TEMPLATES,
  WORKSPACE_STUDIO_OPEN_AREA,
  WORKSPACE_REPO_CAMPUS_COURTYARD,
  WORKSPACE_REPO_CAMPUS_HALL_COURTYARD,
  WORKSPACE_REPO_CAMPUS_HALL_SOUTH_OFFICE_ROW,
  WORKSPACE_STUDIO_LANDSCAPE,
  addWorkspaceLayoutPlacement,
  compileWorkspaceLayout,
  generateWorkspaceLayoutPreset,
  getWorkspaceLayoutProfile,
  usesSquareStudioOffices,
  getWorkspaceLayoutTemplate,
  moveWorkspaceLayoutPlacement,
  resizeWorkspaceLayoutPrivateOffices,
  validWorkspaceLayoutOrigins,
  validateWorkspaceLayout,
  workspaceLayoutPlacementLabel,
} from './workspace-layout.js';
export type {
  EditableWorkspaceLayoutTemplateId,
  WorkspaceLayoutPlacement,
  WorkspaceLayoutPresetId,
  WorkspaceLayoutTemplateId,
} from './workspace-layout.js';
