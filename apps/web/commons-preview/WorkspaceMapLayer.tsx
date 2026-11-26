import { useId } from 'react';
import {
  TILE_SIZE_PX,
  WORKSPACE_STUDIO_LANDSCAPE,
  WORKSPACE_STUDIO_OPEN_AREA,
  WORKSPACE_REPO_CAMPUS_COURTYARD,
  WORKSPACE_REPO_CAMPUS_HALL_COURTYARD,
  getWorkspaceLayoutTemplate,
  getWorkspaceLayoutProfile,
  usesSquareStudioOffices,
  workspaceLayoutPlacementLabel,
} from '@gather/world';
import type { WorkspaceLayoutPlacement, WorkspaceLayoutPresetId } from '@gather/world';
import {
  workspaceArtFor,
  workspaceFurnitureFor,
  workspaceStudioCourtyard,
  campusCourtyard,
  campusOfficeNorth,
  workspaceOrthogonalOpenArea,
  workspaceStudioLandscape,
} from './workspace-layout-art';

export function WorkspaceMapLayer({
  placements,
  preset,
  selectedId,
  showLabels = true,
}: {
  placements: readonly WorkspaceLayoutPlacement[];
  preset?: WorkspaceLayoutPresetId;
  selectedId?: string;
  showLabels?: boolean;
}) {
  const patternId = useId();
  const courtyardPatternId = useId();
  const expanded = preset === 'studio-expandable';
  const compactHall = preset === 'repo-campus-hall';
  const campus = compactHall || preset === 'repo-campus';
  const campusGarden = compactHall
    ? WORKSPACE_REPO_CAMPUS_HALL_COURTYARD
    : WORKSPACE_REPO_CAMPUS_COURTYARD;
  const corridorSize = expanded || campus ? 64 : 128;
  const courtyard = WORKSPACE_STUDIO_OPEN_AREA;
  return (
    <>
      <defs>
        <pattern
          id={patternId}
          width={corridorSize}
          height={corridorSize}
          patternUnits="userSpaceOnUse"
        >
          <image
            href={workspaceArtFor('corridor', preset)}
            width={corridorSize}
            height={corridorSize}
          />
        </pattern>
        {expanded && (
          <pattern id={courtyardPatternId} width="64" height="64" patternUnits="userSpaceOnUse">
            <image href={workspaceStudioCourtyard} width="64" height="64" />
          </pattern>
        )}
      </defs>
      {getWorkspaceLayoutProfile(preset, placements).corridors.map(({ tx, ty, width, height }) => (
        <rect
          key={`${tx},${ty}`}
          x={tx * TILE_SIZE_PX}
          y={ty * TILE_SIZE_PX}
          width={width * TILE_SIZE_PX}
          height={height * TILE_SIZE_PX}
          fill={`url(#${patternId})`}
        />
      ))}
      {campus && (
        <image
          data-area="open-area"
          href={campusCourtyard}
          x={campusGarden.tx * TILE_SIZE_PX}
          y={campusGarden.ty * TILE_SIZE_PX}
          width={campusGarden.width * TILE_SIZE_PX}
          height={campusGarden.height * TILE_SIZE_PX}
        />
      )}
      {expanded && (
        <g data-area="open-area">
          <rect
            x={courtyard.tx * TILE_SIZE_PX}
            y={courtyard.ty * TILE_SIZE_PX}
            width={courtyard.width * TILE_SIZE_PX}
            height={courtyard.height * TILE_SIZE_PX}
            fill={`url(#${courtyardPatternId})`}
            stroke="#668572"
            strokeWidth={6}
          />
          {showLabels && (
            <text className="workspace-preset-label" x="672" y="124">
              Courtyard
            </text>
          )}
        </g>
      )}
      {preset === 'studio-orthogonal' && (
        <g data-area="open-area">
          <image
            href={workspaceOrthogonalOpenArea}
            x={WORKSPACE_STUDIO_OPEN_AREA.tx * TILE_SIZE_PX}
            y={(WORKSPACE_STUDIO_OPEN_AREA.ty - 1) * TILE_SIZE_PX}
            width={WORKSPACE_STUDIO_OPEN_AREA.width * TILE_SIZE_PX}
            height={(WORKSPACE_STUDIO_OPEN_AREA.height + 1) * TILE_SIZE_PX}
          />
          {showLabels && (
            <text className="workspace-preset-label" x="672" y="124">
              Open area
            </text>
          )}
        </g>
      )}
      {preset === 'studio' && (
        <image
          href={workspaceStudioLandscape}
          x={WORKSPACE_STUDIO_LANDSCAPE.tx * TILE_SIZE_PX}
          y={WORKSPACE_STUDIO_LANDSCAPE.ty * TILE_SIZE_PX}
          width={WORKSPACE_STUDIO_LANDSCAPE.width * TILE_SIZE_PX}
          height={WORKSPACE_STUDIO_LANDSCAPE.height * TILE_SIZE_PX}
        />
      )}
      {placements.map((placement) => {
        const { width, height, door } = getWorkspaceLayoutTemplate(
          placement.templateId,
          preset,
          placement.origin,
        );
        const x = placement.origin.tx * TILE_SIZE_PX;
        const y = placement.origin.ty * TILE_SIZE_PX;
        const w = width * TILE_SIZE_PX;
        const h = height * TILE_SIZE_PX;
        return (
          <g
            key={placement.id}
            data-placement-id={placement.id}
            data-template-id={placement.templateId}
          >
            {showLabels && <title>{workspaceLayoutPlacementLabel(placement)}</title>}
            <image
              href={
                compactHall && placement.templateId === 'private-office' && door.side === 'north'
                  ? campusOfficeNorth
                  : workspaceArtFor(placement.templateId, preset)
              }
              x={x}
              y={y}
              width={w}
              height={h}
            />
            {workspaceFurnitureFor(placement.templateId, preset).map((sprite) => (
              <image
                key={`${sprite.key}-${sprite.x}-${sprite.y}`}
                href={sprite.url}
                x={x + sprite.x}
                y={y + sprite.y}
                width={sprite.width}
                height={sprite.height}
                imageRendering="pixelated"
              />
            ))}
            {showLabels && placement.templateId === 'reception' && (
              <text
                className={preset ? 'workspace-preset-label' : undefined}
                x={x + w / 2}
                y={
                  usesSquareStudioOffices(preset) && placement.id === 'reception'
                    ? y + h - 24
                    : door.side === 'north'
                      ? y + h + 18
                      : y - 7
                }
              >
                Reception
              </text>
            )}
            {selectedId === placement.id && (
              <rect className="workspace-map-selection" x={x} y={y} width={w} height={h} />
            )}
          </g>
        );
      })}
    </>
  );
}
