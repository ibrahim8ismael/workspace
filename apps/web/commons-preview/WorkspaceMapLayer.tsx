import { useId } from 'react';
import {
  TILE_SIZE_PX,
  WORKSPACE_STUDIO_LANDSCAPE,
  WORKSPACE_STUDIO_OPEN_AREA,
  getWorkspaceLayoutTemplate,
  getWorkspaceLayoutProfile,
  workspaceLayoutPlacementLabel,
} from '@gather/world';
import type { WorkspaceLayoutPlacement, WorkspaceLayoutPresetId } from '@gather/world';
import {
  workspaceArtFor,
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
  return (
    <>
      <defs>
        <pattern id={patternId} width="128" height="128" patternUnits="userSpaceOnUse">
          <image href={workspaceArtFor('corridor', preset)} width="128" height="128" />
        </pattern>
      </defs>
      {getWorkspaceLayoutProfile(preset).corridors.map(({ tx, ty, width, height }) => (
        <rect
          key={`${tx},${ty}`}
          x={tx * TILE_SIZE_PX}
          y={ty * TILE_SIZE_PX}
          width={width * TILE_SIZE_PX}
          height={height * TILE_SIZE_PX}
          fill={`url(#${patternId})`}
        />
      ))}
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
        const { width, height, door } = getWorkspaceLayoutTemplate(placement.templateId, preset);
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
              href={workspaceArtFor(placement.templateId, preset)}
              x={x}
              y={y}
              width={w}
              height={h}
            />
            {showLabels && placement.templateId === 'reception' && (
              <text
                className={preset ? 'workspace-preset-label' : undefined}
                x={x + w / 2}
                y={
                  preset === 'studio-orthogonal' && placement.id === 'reception'
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
