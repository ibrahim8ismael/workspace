import type { WorkspaceLayoutPresetId, WorkspaceLayoutTemplateId } from '@gather/world';
import reception from '../../../packages/assets/office-pilot/reception.svg?url';
import small from '../../../packages/assets/office-pilot/small-meeting.svg?url';
import large from '../../../packages/assets/office-pilot/large-meeting.svg?url';
import desks from '../../../packages/assets/office-pilot/desks-pixel.svg?url';
import squareOffice from '../../../packages/assets/office-pilot/square-office.svg?url';
import privateOffice from '../../../packages/assets/office-pilot/private-office.svg?url';
import lounge from '../../../packages/assets/office-pilot/lounge.svg?url';
import garden from '../../../packages/assets/office-pilot/garden.svg?url';
import teamStudio from '../../../packages/assets/office-pilot/team-studio.svg?url';
export { default as workspaceStudioAvatar } from '../../../packages/assets/office-pilot/workspace-avatar.svg?url';
export { default as workspaceStudioLandscape } from '../../../packages/assets/office-pilot/studio-landscape.svg?url';
import orthogonalCorridor from '../../../packages/assets/office-pilot/orthogonal-corridor.svg?url';
export { default as workspaceOrthogonalOpenArea } from '../../../packages/assets/office-pilot/orthogonal-open-area.svg?url';
import corridor from '../../../packages/assets/office-pilot/corridor.svg?url';

export const workspaceLayoutArt = {
  reception,
  small,
  large,
  desks,
  corridor,
  'private-office': privateOffice,
  'team-studio': teamStudio,
  lounge,
  garden,
} as const;

export function workspaceArtFor(
  template: WorkspaceLayoutTemplateId | 'corridor',
  preset?: WorkspaceLayoutPresetId,
) {
  if (preset === 'studio-orthogonal') {
    if (template === 'private-office') return squareOffice;
    if (template === 'corridor') return orthogonalCorridor;
  }
  return workspaceLayoutArt[template];
}
