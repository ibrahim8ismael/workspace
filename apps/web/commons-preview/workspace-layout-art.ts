import type { WorkspaceLayoutPresetId, WorkspaceLayoutTemplateId } from '@gather/world';
import { usesSquareStudioOffices, WORKSPACE_LAYOUT_TEMPLATES } from '@gather/world';
import {
  deskPlantUrl,
  deskTableUrl,
  monitorUrl,
  officeChairUrl,
  plantUrl,
} from '../sprites/repoOfficeAssets';
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
import expandableCorridor from '../../../packages/assets/office-pilot/studio-next/corridor.svg?url';
import expandableMeeting from '../../../packages/assets/office-pilot/studio-next/meeting.svg?url';
import expandableOffice from '../../../packages/assets/office-pilot/studio-next/office.svg?url';
import expandableReception from '../../../packages/assets/office-pilot/studio-next/reception.svg?url';
export { default as workspaceStudioCourtyard } from '../../../packages/assets/office-pilot/studio-next/courtyard.svg?url';

import campusOffice from '../../../packages/assets/office-pilot/repo-campus/campus-office.png?url';
export { default as campusOfficeNorth } from '../../../packages/assets/office-pilot/repo-campus/campus-office-north.png?url';
import campusSharedHall from '../../../packages/assets/office-pilot/repo-campus/campus-shared-hall.png?url';
import campusReception from '../../../packages/assets/office-pilot/repo-campus/campus-reception.png?url';
import campusMeeting from '../../../packages/assets/office-pilot/repo-campus/campus-meeting.png?url';
import campusConcourse from '../../../packages/assets/office-pilot/repo-campus/campus-concourse.png?url';
export { default as campusCourtyard } from '../../../packages/assets/office-pilot/repo-campus/campus-courtyard.png?url';
export { default as campusAvatar } from '../../../packages/assets/office-pilot/repo-campus/campus-avatar.png?url';

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
  if (preset === 'repo-campus' || preset === 'repo-campus-hall') {
    if (template === 'corridor' && preset === 'repo-campus-hall') return campusSharedHall;
    if (template === 'private-office') return campusOffice;
    if (template === 'large') return campusMeeting;
    if (template === 'reception') return campusReception;
    if (template === 'corridor') return campusConcourse;
  }
  if (preset === 'studio-expandable') {
    if (template === 'private-office') return expandableOffice;
    if (template === 'large') return expandableMeeting;
    if (template === 'reception') return expandableReception;
    if (template === 'corridor') return expandableCorridor;
  }
  if (preset === 'studio-orthogonal') {
    if (template === 'private-office') return squareOffice;
    if (template === 'corridor') return orthogonalCorridor;
  }
  return workspaceLayoutArt[template];
}

// Position the opaque source pixels over the Studio desk footprint (tiles 2–3, 2)
// and chair anchor (tile 2, 3). The PNGs include transparent margins.
const studioPrivateOfficeFurniture = [
  { key: 'studio-repo-desk', url: deskTableUrl, x: 62, y: 49, width: 72, height: 48 },
  { key: 'studio-repo-monitor', url: monitorUrl, x: 85, y: 66, width: 32, height: 32 },
  { key: 'studio-repo-chair', url: officeChairUrl, x: 68, y: 86, width: 24, height: 48 },
] as const;

const largeMeetingFurniture = [
  ...WORKSPACE_LAYOUT_TEMPLATES.large.seats.map(({ tx, ty }) => ({
    key: 'studio-repo-chair',
    url: officeChairUrl,
    x: tx * 32 + 6,
    y: ty * 32 - 10,
    width: 20,
    height: 40,
  })),
  { key: 'studio-repo-desk-plant', url: deskPlantUrl, x: 246, y: 100, width: 24, height: 24 },
];
const receptionFurniture = [
  { key: 'studio-repo-plant', url: plantUrl, x: 256, y: 43, width: 32, height: 32 },
];

export function workspaceFurnitureFor(
  template: WorkspaceLayoutTemplateId,
  preset?: WorkspaceLayoutPresetId,
) {
  if (preset === 'repo-campus' || preset === 'repo-campus-hall') return [];
  if (template === 'private-office' && usesSquareStudioOffices(preset))
    return studioPrivateOfficeFurniture;
  if (preset === 'studio-expandable') {
    if (template === 'large') return largeMeetingFurniture;
    if (template === 'reception') return receptionFurniture;
  }
  return [];
}
