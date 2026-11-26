import { TILE_SIZE_PX, canStep, createTileCollision, isTileInBounds } from './collision.js';
import { validateOfficeGeometry } from './geometry.js';
import type { OfficeGeometry, OfficeObjectDefinition, TilePoint, TileRect } from './types.js';

type Door = { readonly side: 'north' | 'south'; readonly offset: number };
interface WorkspaceLayoutTemplate {
  readonly width: number;
  readonly height: number;
  readonly door: Door;
  readonly additionalDoor?: Door;
  readonly furniture: readonly TileRect[];
  readonly seats: readonly TilePoint[];
  readonly label: string;
  readonly detail: string;
  readonly arrival: TilePoint;
}

const geometryTemplates = {
  reception: {
    width: 10,
    height: 8,
    door: { side: 'north', offset: 4 },
    furniture: [
      { tx: 1, ty: 1, width: 2, height: 2 },
      { tx: 6, ty: 1, width: 3, height: 2 },
    ],
    seats: [],
  },
  small: {
    width: 8,
    height: 6,
    door: { side: 'south', offset: 3 },
    furniture: [{ tx: 2, ty: 2, width: 4, height: 2 }],
    seats: [
      { tx: 3, ty: 1 },
      { tx: 4, ty: 1 },
      { tx: 3, ty: 4 },
      { tx: 4, ty: 4 },
    ],
  },
  large: {
    width: 12,
    height: 8,
    door: { side: 'south', offset: 5 },
    furniture: [{ tx: 3, ty: 2, width: 6, height: 3 }],
    seats: [1, 5].flatMap((ty) => [4, 5, 6, 7].map((tx) => ({ tx, ty }))),
  },
  desks: {
    width: 6,
    height: 4,
    door: { side: 'north', offset: 2 },
    furniture: [
      { tx: 0, ty: 1, width: 2, height: 1 },
      { tx: 4, ty: 1, width: 2, height: 1 },
      { tx: 0, ty: 3, width: 1, height: 1 },
    ],
    seats: [
      { tx: 1, ty: 2 },
      { tx: 4, ty: 2 },
    ],
  },
  'team-studio': {
    width: 16,
    height: 9,
    door: { side: 'north', offset: 7 },
    additionalDoor: { side: 'south', offset: 7 },
    furniture: [
      { tx: 3, ty: 3, width: 4, height: 2 },
      { tx: 9, ty: 3, width: 4, height: 2 },
      { tx: 5, ty: 6, width: 6, height: 1 },
    ],
    seats: [
      ...[3, 4, 5, 6, 9, 10, 11, 12].map((tx) => ({ tx, ty: 5 })),
      ...[6, 7, 8, 9].map((tx) => ({ tx, ty: 7 })),
    ],
  },
  'private-office': {
    width: 6,
    height: 5,
    door: { side: 'south', offset: 2 },
    furniture: [{ tx: 1, ty: 2, width: 2, height: 1 }],
    seats: [{ tx: 2, ty: 3 }],
  },
  lounge: {
    width: 8,
    height: 6,
    door: { side: 'south', offset: 3 },
    furniture: [
      { tx: 1, ty: 2, width: 2, height: 2 },
      { tx: 5, ty: 2, width: 2, height: 2 },
    ],
    seats: [],
  },
  garden: {
    width: 8,
    height: 6,
    door: { side: 'south', offset: 3 },
    furniture: [
      { tx: 1, ty: 2, width: 2, height: 2 },
      { tx: 5, ty: 2, width: 2, height: 2 },
    ],
    seats: [],
  },
} satisfies Record<string, Omit<WorkspaceLayoutTemplate, 'label' | 'detail' | 'arrival'>>;

export const WORKSPACE_LAYOUT_TEMPLATES = {
  reception: {
    ...geometryTemplates.reception,
    label: 'Reception',
    detail: 'Entry and waiting area',
    arrival: { tx: 4, ty: 4 },
  },
  small: {
    ...geometryTemplates.small,
    label: 'Small meeting room',
    detail: '4 seats',
    arrival: { tx: 3, ty: 4 },
  },
  large: {
    ...geometryTemplates.large,
    label: 'Large meeting room',
    detail: '8 seats',
    arrival: { tx: 5, ty: 5 },
  },
  desks: {
    ...geometryTemplates.desks,
    label: 'Desk area',
    detail: '2 workstations',
    arrival: { tx: 1, ty: 2 },
  },
  'team-studio': {
    ...geometryTemplates['team-studio'],
    label: 'Team studio',
    detail: '12 workstations',
    arrival: { tx: 7, ty: 1 },
  },
  'private-office': {
    ...geometryTemplates['private-office'],
    label: 'Private office',
    detail: '1 workstation',
    arrival: { tx: 3, ty: 3 },
  },
  lounge: {
    ...geometryTemplates.lounge,
    label: 'Lounge',
    detail: 'Shared break area',
    arrival: { tx: 3, ty: 4 },
  },
  garden: {
    ...geometryTemplates.garden,
    label: 'Garden',
    detail: 'Shared indoor garden',
    arrival: { tx: 3, ty: 4 },
  },
} satisfies Record<keyof typeof geometryTemplates, WorkspaceLayoutTemplate>;

export type WorkspaceLayoutTemplateId = keyof typeof WORKSPACE_LAYOUT_TEMPLATES;
export type EditableWorkspaceLayoutTemplateId = Exclude<
  WorkspaceLayoutTemplateId,
  'reception' | 'team-studio'
>;

export interface WorkspaceLayoutPlacement {
  readonly id: string;
  readonly name?: string | undefined;
  readonly templateId: WorkspaceLayoutTemplateId;
  readonly origin: TilePoint;
}

export const DEFAULT_WORKSPACE_LAYOUT: readonly WorkspaceLayoutPlacement[] = [
  { id: 'reception', templateId: 'reception', origin: { tx: 2, ty: 13 } },
  { id: 'small', templateId: 'small', origin: { tx: 2, ty: 3 } },
  { id: 'large', templateId: 'large', origin: { tx: 15, ty: 1 } },
  { id: 'desks', templateId: 'desks', origin: { tx: 21, ty: 13 } },
];

export const WORKSPACE_LAYOUT_SIZE = { width: 49, height: 22 };
export const WORKSPACE_LAYOUT_BOUNDS = {
  width: WORKSPACE_LAYOUT_SIZE.width * TILE_SIZE_PX,
  height: WORKSPACE_LAYOUT_SIZE.height * TILE_SIZE_PX,
};
export const WORKSPACE_LAYOUT_CORRIDORS: readonly TileRect[] = [
  { tx: 2, ty: 9, width: 45, height: 4 },
  { tx: 13, ty: 13, width: 4, height: 3 },
];
export type WorkspaceLayoutPresetId =
  | 'repo-campus-hall'
  | 'repo-campus'
  | 'studio-expandable'
  | 'studio-orthogonal'
  | 'studio'
  | 'startup'
  | 'corporate';

export const WORKSPACE_LAYOUT_PRESETS = {
  'repo-campus-hall': { label: 'Campus Hall', defaultPrivateOffices: 4, maxPrivateOffices: 16 },
  'repo-campus': { label: 'Office Campus', defaultPrivateOffices: 4, maxPrivateOffices: 16 },
  'studio-expandable': { label: 'Studio', defaultPrivateOffices: 4, maxPrivateOffices: 16 },
  'studio-orthogonal': {
    label: 'Studio (fixed floor)',
    defaultPrivateOffices: 6,
    maxPrivateOffices: 8,
  },
  studio: { label: 'Classic Studio', defaultPrivateOffices: 6, maxPrivateOffices: 8 },
  startup: { label: 'Startup', defaultPrivateOffices: 10, maxPrivateOffices: 13 },
  corporate: { label: 'Corporate', defaultPrivateOffices: 12, maxPrivateOffices: 21 },
} as const;

function presetProfile(wings: number) {
  const width = 72;
  const lastHall = 9 + (wings - 1) * 13;
  const size = { width, height: lastHall + 14 };
  const corridors: TileRect[] = Array.from({ length: wings }, (_, wing) => ({
    tx: 2,
    ty: 9 + wing * 13,
    width: 68,
    height: 4,
  }));
  corridors.push(
    { tx: 0, ty: 12, width: 2, height: lastHall - 11 },
    { tx: 67, ty: 13, width: 3, height: lastHall - 13 },
  );
  return { size, corridors, receptionOrigin: { tx: 2, ty: lastHall + 4 } };
}

const studioOrigin = { tx: 19, ty: 12 };
export const WORKSPACE_STUDIO_LANDSCAPE = { tx: 1, ty: 12, width: 6, height: 3 };
const studioProfile = {
  size: { width: 56, height: 33 },
  corridors: [
    { tx: 1, ty: 9, width: 54, height: 3 },
    { tx: 1, ty: 21, width: 54, height: 3 },
    { tx: 17, ty: 12, width: 2, height: 9 },
    { tx: 35, ty: 12, width: 2, height: 9 },
  ],
  receptionOrigin: { tx: 3, ty: 24 },
  landscape: WORKSPACE_STUDIO_LANDSCAPE,
};
export const WORKSPACE_STUDIO_OPEN_AREA: TileRect = { tx: 2, ty: 2, width: 38, height: 6 };
const orthogonalMeeting = { tx: 15, ty: 14 };
const orthogonalStudioProfile = {
  size: { width: 42, height: 37 },
  receptionOrigin: { tx: 16, ty: 28 },
  corridors: [
    WORKSPACE_STUDIO_OPEN_AREA,
    { tx: 2, ty: 8, width: 38, height: 3 },
    { tx: 2, ty: 17, width: 12, height: 2 },
    { tx: 28, ty: 17, width: 12, height: 2 },
    { tx: 13, ty: 11, width: 2, height: 15 },
    { tx: 27, ty: 11, width: 2, height: 15 },
    { tx: 14, ty: 22, width: 14, height: 3 },
    { tx: 2, ty: 25, width: 38, height: 3 },
  ],
};
// Each wing has two columns and two rows. The inner offices open to the same
// cross-corridors as the outside offices; the seventh and eighth fill the empty slots.
const orthogonalSlots = [
  { tx: 1, ty: 11 },
  { tx: 29, ty: 11 },
  { tx: 7, ty: 11 },
  { tx: 35, ty: 11 },
  { tx: 1, ty: 19 },
  { tx: 35, ty: 19 },
  { tx: 7, ty: 19 },
  { tx: 29, ty: 19 },
];
const expandableSlots = Array.from({ length: 4 }, (_, row) =>
  [1, 29, 7, 35].map((tx) => ({ tx, ty: 11 + row * 8 })),
).flat();

export const WORKSPACE_REPO_CAMPUS_COURTYARD: TileRect = {
  tx: 2,
  ty: 2,
  width: 16,
  height: 8,
};
const campusCourtyardFurniture: readonly TileRect[] = [
  { tx: 0, ty: 0, width: 3, height: 3 }, // Northwest trees
  { tx: 13, ty: 0, width: 3, height: 3 }, // Northeast trees
  { tx: 3, ty: 0, width: 4, height: 1 }, // West hedge
  { tx: 9, ty: 0, width: 4, height: 1 }, // East hedge
  { tx: 6, ty: 2, width: 4, height: 4 }, // Fountain
  { tx: 3, ty: 5, width: 2, height: 2 }, // West bench
  { tx: 11, ty: 5, width: 2, height: 2 }, // East bench
];
const campusMeeting = { tx: 20, ty: 6 };
const campusReception = { tx: 3, ty: 26 };
const campusSlots = Array.from({ length: 8 }, (_, column) =>
  [8, 22].map((ty) => ({ tx: 35 + column * 6, ty })),
).flat();

export const WORKSPACE_REPO_CAMPUS_HALL_COURTYARD: TileRect = {
  tx: 2,
  ty: 0,
  width: 16,
  height: 8,
};
export const WORKSPACE_REPO_CAMPUS_HALL_SOUTH_OFFICE_ROW = 34;
const campusHallReception = { tx: 2, ty: 25 };
const campusHallMeeting = { tx: 12, ty: 17 };
const campusHallSlots = [2, 8, 20, 26, 32, 38, 44, 50].flatMap((tx) =>
  [8, WORKSPACE_REPO_CAMPUS_HALL_SOUTH_OFFICE_ROW].map((ty) => ({ tx, ty })),
);

function campusHallProfile(placements?: readonly WorkspaceLayoutPlacement[]) {
  const width = Math.max(
    26,
    ...(placements ?? []).flatMap(({ origin, templateId }) =>
      templateId === 'private-office' &&
      campusHallSlots.some((slot) => tileKey(slot) === tileKey(origin))
        ? [origin.tx + 8]
        : [],
    ),
  );
  return {
    size: { width, height: 42 },
    receptionOrigin: campusHallReception,
    corridors: [
      WORKSPACE_REPO_CAMPUS_HALL_COURTYARD,
      { tx: 14, ty: 8, width: 6, height: 6 },
      { tx: 1, ty: 14, width: width - 2, height: 3 },
      { tx: 1, ty: 17, width: 11, height: 8 },
      { tx: 24, ty: 17, width: width - 25, height: 8 },
      { tx: 1, ty: 25, width: 1, height: 8 },
      { tx: 12, ty: 25, width: width - 13, height: 8 },
      { tx: 1, ty: 33, width: width - 2, height: 1 },
    ],
  };
}

export function usesSquareStudioOffices(preset?: WorkspaceLayoutPresetId) {
  return (
    preset === 'studio-orthogonal' ||
    preset === 'studio-expandable' ||
    preset === 'repo-campus' ||
    preset === 'repo-campus-hall'
  );
}

function growingOfficeSlots(preset?: WorkspaceLayoutPresetId) {
  if (preset === 'repo-campus-hall') return campusHallSlots;
  if (preset === 'repo-campus') return campusSlots;
  if (preset === 'studio-expandable') return expandableSlots;
  return null;
}

function campusProfile(placements?: readonly WorkspaceLayoutPlacement[]) {
  const width = Math.max(
    43,
    ...(placements ?? [])
      .filter(({ templateId }) => templateId === 'private-office')
      .map(({ origin }) => {
        const slot = campusSlots.find(({ tx, ty }) => tx === origin.tx && ty === origin.ty);
        return slot ? slot.tx + 8 : 0;
      }),
  );
  return {
    size: { width, height: 35 },
    receptionOrigin: campusReception,
    corridors: [
      WORKSPACE_REPO_CAMPUS_COURTYARD,
      { tx: 7, ty: 10, width: 4, height: 4 },
      { tx: 1, ty: 14, width: width - 2, height: 4 },
      { tx: 6, ty: 18, width: 5, height: 8 },
      { tx: 32, ty: 18, width: 3, height: 10 },
      { tx: 32, ty: 28, width: width - 33, height: 3 },
    ],
  };
}

function expandableStudioProfile(placements?: readonly WorkspaceLayoutPlacement[]) {
  const rows = Math.max(
    1,
    ...(placements ?? []).map(({ origin, templateId }) => {
      if (templateId !== 'private-office') return 0;
      const index = expandableSlots.findIndex(({ tx, ty }) => tx === origin.tx && ty === origin.ty);
      return Math.ceil((index + 1) / 4);
    }),
  );
  const receptionY = Math.max(25, 12 + rows * 8);
  const corridors: TileRect[] = [
    WORKSPACE_STUDIO_OPEN_AREA,
    { tx: 2, ty: 8, width: 38, height: 3 },
    { tx: 13, ty: 11, width: 2, height: receptionY - 11 },
    { tx: 27, ty: 11, width: 2, height: receptionY - 11 },
    { tx: 15, ty: 22, width: 12, height: receptionY - 22 },
  ];
  for (let row = 0; row < rows; row += 1) {
    const ty = 17 + 8 * row;
    corridors.push({ tx: 1, ty, width: 12, height: 2 }, { tx: 29, ty, width: 12, height: 2 });
  }
  return {
    size: { width: 42, height: receptionY + 9 },
    corridors,
    receptionOrigin: { tx: 16, ty: receptionY },
  };
}

function fitExpandableReception(placements: WorkspaceLayoutPlacement[]) {
  const { receptionOrigin } = expandableStudioProfile(placements);
  return placements.map((room) =>
    room.templateId === 'reception' && tileKey(room.origin) !== tileKey(receptionOrigin)
      ? { ...room, origin: receptionOrigin }
      : room,
  );
}

const squareOffice: WorkspaceLayoutTemplate = {
  ...WORKSPACE_LAYOUT_TEMPLATES['private-office'],
  width: 6,
  height: 6,
  furniture: [{ tx: 2, ty: 2, width: 2, height: 1 }],
  seats: [{ tx: 2, ty: 3 }],
  arrival: { tx: 3, ty: 4 },
};

export function getWorkspaceLayoutTemplate(
  id: WorkspaceLayoutTemplateId,
  preset?: WorkspaceLayoutPresetId,
  origin?: TilePoint,
): WorkspaceLayoutTemplate {
  if (id !== 'private-office' || !usesSquareStudioOffices(preset))
    return WORKSPACE_LAYOUT_TEMPLATES[id];
  if (preset === 'repo-campus-hall' && origin?.ty === WORKSPACE_REPO_CAMPUS_HALL_SOUTH_OFFICE_ROW) {
    return { ...squareOffice, door: { side: 'north', offset: 2 } };
  }
  return squareOffice;
}

const workspaceLayoutProfiles = {
  'studio-orthogonal': orthogonalStudioProfile,
  studio: studioProfile,
  startup: presetProfile(2),
  corporate: presetProfile(3),
  legacy: {
    size: WORKSPACE_LAYOUT_SIZE,
    corridors: WORKSPACE_LAYOUT_CORRIDORS,
    receptionOrigin: DEFAULT_WORKSPACE_LAYOUT[0]!.origin,
  },
};

type WorkspaceLayoutProfile = {
  size: { width: number; height: number };
  corridors: readonly TileRect[];
  receptionOrigin: TilePoint;
  landscape?: TileRect;
};

export function getWorkspaceLayoutProfile(
  preset?: WorkspaceLayoutPresetId,
  placements?: readonly WorkspaceLayoutPlacement[],
): WorkspaceLayoutProfile {
  if (preset === 'repo-campus-hall') return campusHallProfile(placements);
  if (preset === 'repo-campus') return campusProfile(placements);
  if (preset === 'studio-expandable') return expandableStudioProfile(placements);
  return workspaceLayoutProfiles[preset ?? 'legacy'];
}

export function generateWorkspaceLayoutPreset(
  preset: WorkspaceLayoutPresetId,
  count: number = WORKSPACE_LAYOUT_PRESETS[preset].defaultPrivateOffices,
): WorkspaceLayoutPlacement[] {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > WORKSPACE_LAYOUT_PRESETS[preset].maxPrivateOffices
  ) {
    throw new RangeError('Choose a private office count within the preset capacity.');
  }
  if (preset === 'repo-campus-hall') {
    return [
      { id: 'reception', templateId: 'reception', origin: campusHallReception },
      { id: 'large', templateId: 'large', origin: campusHallMeeting },
      ...campusHallSlots.slice(0, count).map((origin, index) => ({
        id: `private-office-${index + 1}`,
        templateId: 'private-office' as const,
        origin,
      })),
    ];
  }
  if (preset === 'repo-campus') {
    return [
      { id: 'reception', templateId: 'reception', origin: campusReception },
      { id: 'large', templateId: 'large', origin: campusMeeting },
      ...campusSlots.slice(0, count).map((origin, index) => ({
        id: `private-office-${index + 1}`,
        templateId: 'private-office' as const,
        origin,
      })),
    ];
  }
  if (preset === 'studio-expandable') {
    return fitExpandableReception([
      {
        id: 'reception',
        templateId: 'reception',
        origin: expandableStudioProfile().receptionOrigin,
      },
      { id: 'large', templateId: 'large', origin: orthogonalMeeting },
      ...expandableSlots.slice(0, count).map((origin, index) => ({
        id: `private-office-${index + 1}`,
        templateId: 'private-office' as const,
        origin,
      })),
    ]);
  }
  if (preset === 'studio-orthogonal') {
    return [
      { id: 'reception', templateId: 'reception', origin: orthogonalStudioProfile.receptionOrigin },
      { id: 'large', templateId: 'large', origin: orthogonalMeeting },
      ...orthogonalSlots.slice(0, count).map((origin, index) => ({
        id: `private-office-${index + 1}`,
        templateId: 'private-office' as const,
        origin,
      })),
    ];
  }
  if (preset === 'studio') {
    const offices = [
      { tx: 9, ty: 4 },
      { tx: 15, ty: 4 },
      { tx: 33, ty: 4 },
      { tx: 39, ty: 4 },
      { tx: 2, ty: 16 },
      { tx: 49, ty: 16 },
      { tx: 21, ty: 4 },
      { tx: 27, ty: 4 },
    ].slice(0, count);
    return [
      { id: 'reception', templateId: 'reception', origin: studioProfile.receptionOrigin },
      { id: 'team-studio', templateId: 'team-studio', origin: studioOrigin },
      { id: 'small', templateId: 'small', origin: { tx: 9, ty: 15 } },
      { id: 'large', templateId: 'large', origin: { tx: 37, ty: 13 } },
      { id: 'garden', templateId: 'garden', origin: { tx: 1, ty: 3 } },
      { id: 'lounge', templateId: 'lounge', origin: { tx: 47, ty: 3 } },
      { id: 'desks', templateId: 'desks', origin: { tx: 18, ty: 24 } },
      ...offices.map((origin, index) => ({
        id: `private-office-${index + 1}`,
        templateId: 'private-office' as const,
        origin,
      })),
    ];
  }
  const { receptionOrigin } = getWorkspaceLayoutProfile(preset);
  const placements: WorkspaceLayoutPlacement[] = [
    { id: 'reception', templateId: 'reception', origin: receptionOrigin },
    { id: 'small', templateId: 'small', origin: { tx: 15, ty: 3 } },
    { id: 'large', templateId: 'large', origin: { tx: 2, ty: 1 } },
    { id: 'lounge', templateId: 'lounge', origin: { tx: 24, ty: 3 } },
    { id: 'garden', templateId: 'garden', origin: { tx: 2, ty: 16 } },
    { id: 'desks', templateId: 'desks', origin: { tx: 14, ty: receptionOrigin.ty } },
  ];
  const upper = [33, 40, 47, 54, 61].map((tx) => ({ tx, ty: 4 }));
  const middle = [11, 18, 25, 32, 39, 46, 53, 60].map((tx) => ({ tx, ty: 17 }));
  let officeSlots = [...upper, ...middle];
  if (preset === 'corporate') {
    placements.push(
      { id: 'large-2', templateId: 'large', origin: { tx: 2, ty: 27 } },
      { id: 'desks-2', templateId: 'desks', origin: { tx: 23, ty: receptionOrigin.ty } },
    );
    const lower = [14, 20, 26, 32, 38, 44, 50, 56].map((tx) => ({ tx, ty: 30 }));
    officeSlots = middle.flatMap((middleSlot, index) =>
      [upper[index], middleSlot, lower[index]].filter((slot) => slot !== undefined),
    );
  }
  return [
    ...placements,
    ...officeSlots.slice(0, count).map((origin, index) => ({
      id: `private-office-${index + 1}`,
      templateId: 'private-office' as const,
      origin,
    })),
  ];
}

const DIRECTIONS: readonly TilePoint[] = [
  { tx: 0, ty: -1 },
  { tx: -1, ty: 0 },
  { tx: 1, ty: 0 },
  { tx: 0, ty: 1 },
];

function offset(a: TilePoint, b: TilePoint): TilePoint {
  return { tx: a.tx + b.tx, ty: a.ty + b.ty };
}

function tileKey(tile: TilePoint) {
  return `${tile.tx},${tile.ty}`;
}

function rectTiles(rect: TileRect): TilePoint[] {
  return Array.from({ length: rect.height }, (_, ty) =>
    Array.from({ length: rect.width }, (_, tx) => offset(rect, { tx, ty })),
  ).flat();
}

function roomBounds(
  { origin, templateId }: WorkspaceLayoutPlacement,
  preset?: WorkspaceLayoutPresetId,
): TileRect {
  const { width, height } = getWorkspaceLayoutTemplate(templateId, preset, origin);
  return { ...origin, width, height };
}

export function workspaceLayoutPlacementLabel({ id, name, templateId }: WorkspaceLayoutPlacement) {
  if (name) return name;
  const { label } = WORKSPACE_LAYOUT_TEMPLATES[templateId];
  return id === templateId ? label : `${label} ${id.slice(templateId.length + 1)}`;
}

function overlaps(a: TileRect, b: TileRect) {
  return (
    a.tx < b.tx + b.width &&
    a.tx + a.width > b.tx &&
    a.ty < b.ty + b.height &&
    a.ty + a.height > b.ty
  );
}

function roomPlacementError(
  template: WorkspaceLayoutTemplate,
  origin: TilePoint,
  occupied: readonly TileRect[],
  profile: ReturnType<typeof getWorkspaceLayoutProfile>,
) {
  const { tx, ty } = origin;
  const { width, height, door } = template;
  if (
    !Number.isInteger(tx) ||
    !Number.isInteger(ty) ||
    tx < 0 ||
    ty < 0 ||
    tx + width > profile.size.width ||
    ty + height > profile.size.height
  ) {
    return 'The room must fit inside the plot.';
  }
  const bounds = { tx, ty, width, height };
  if (profile.landscape && overlaps(bounds, profile.landscape)) {
    return 'The room cannot cover the garden landscaping.';
  }
  if (profile.corridors.some((segment) => overlaps(bounds, segment))) {
    return 'The room cannot cover the corridor.';
  }
  if (occupied.some((other) => overlaps(bounds, other))) {
    return 'The room overlaps another space.';
  }
  const doors = template.additionalDoor ? [door, template.additionalDoor] : [door];
  for (const entrance of doors) {
    const outsideY = entrance.side === 'north' ? ty - 1 : ty + height;
    const access = [entrance.offset, entrance.offset + 1].every((doorX) =>
      profile.corridors.some((segment) =>
        overlaps(segment, { tx: tx + doorX, ty: outsideY, width: 1, height: 1 }),
      ),
    );
    if (!access) return `The ${entrance.side} doorway must open fully onto the corridor.`;
  }
  return null;
}

export function validWorkspaceLayoutOrigins(
  placements: readonly WorkspaceLayoutPlacement[],
  templateId: EditableWorkspaceLayoutTemplateId,
  moveId?: string,
  preset?: WorkspaceLayoutPresetId,
): TilePoint[] {
  const template = getWorkspaceLayoutTemplate(templateId, preset);
  const profile = getWorkspaceLayoutProfile(preset, placements);
  const occupied = placements
    .filter(({ id }) => id !== moveId)
    .map((room) => roomBounds(room, preset));
  const growingSlots = growingOfficeSlots(preset);
  if (growingSlots) {
    if (templateId !== 'private-office') return [];
    return growingSlots.filter(
      (origin) =>
        !roomPlacementError(
          getWorkspaceLayoutTemplate(templateId, preset, origin),
          origin,
          occupied,
          profile,
        ),
    );
  }
  const valid: TilePoint[] = [];
  for (let ty = 0; ty <= profile.size.height - template.height; ty += 1) {
    for (let tx = 0; tx <= profile.size.width - template.width; tx += 1) {
      const origin = { tx, ty };
      if (!roomPlacementError(template, origin, occupied, profile)) valid.push(origin);
    }
  }
  return valid;
}

export function addWorkspaceLayoutPlacement(
  placements: readonly WorkspaceLayoutPlacement[],
  templateId: EditableWorkspaceLayoutTemplateId,
  origin: TilePoint,
): WorkspaceLayoutPlacement[] {
  const number =
    Math.max(
      templateId === 'private-office' ? 0 : 1,
      ...placements
        .filter((room) => room.templateId === templateId)
        .map(({ id }) => Number(id.slice(templateId.length + 1)) || 0),
    ) + 1;
  return [...placements, { id: `${templateId}-${number}`, templateId, origin: { ...origin } }];
}

export function moveWorkspaceLayoutPlacement(
  placements: readonly WorkspaceLayoutPlacement[],
  id: string,
  origin: TilePoint,
  preset?: WorkspaceLayoutPresetId,
): WorkspaceLayoutPlacement[] {
  const moved = placements.map((room) =>
    id !== 'reception' && id !== 'team-studio' && room.id === id
      ? { ...room, origin: { ...origin } }
      : room,
  );
  return preset === 'studio-expandable' ? fitExpandableReception(moved) : moved;
}

export function resizeWorkspaceLayoutPrivateOffices(
  placements: readonly WorkspaceLayoutPlacement[],
  count: number,
  preset: WorkspaceLayoutPresetId,
): WorkspaceLayoutPlacement[] | null {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > WORKSPACE_LAYOUT_PRESETS[preset].maxPrivateOffices
  )
    return null;
  const offices = placements.filter(({ templateId }) => templateId === 'private-office');
  if (count <= offices.length) {
    const retained = new Set(offices.slice(0, count).map(({ id }) => id));
    const filtered = placements.filter(
      ({ id, templateId }) => templateId !== 'private-office' || retained.has(id),
    );
    return preset === 'studio-expandable' ? fitExpandableReception(filtered) : filtered;
  }

  let result = [...placements];
  const growingSlots = growingOfficeSlots(preset);
  if (growingSlots) {
    const used = new Set(offices.map(({ origin }) => tileKey(origin)));
    const free = growingSlots.filter((origin) => !used.has(tileKey(origin)));
    for (const origin of free.slice(0, count - offices.length)) {
      result = addWorkspaceLayoutPlacement(result, 'private-office', origin);
    }
    return preset === 'studio-expandable' ? fitExpandableReception(result) : result;
  }
  const presetSlots = generateWorkspaceLayoutPreset(
    preset,
    WORKSPACE_LAYOUT_PRESETS[preset].maxPrivateOffices,
  ).filter(({ templateId }) => templateId === 'private-office');
  for (let remaining = count - offices.length; remaining > 0; remaining -= 1) {
    const valid = validWorkspaceLayoutOrigins(result, 'private-office', undefined, preset);
    const preferred = presetSlots.find(({ origin }) =>
      valid.some((point) => tileKey(point) === tileKey(origin)),
    )?.origin;
    const origin = preferred ?? valid[0];
    if (!origin) return null;
    result = addWorkspaceLayoutPlacement(result, 'private-office', origin);
  }
  return result;
}

function assertWorkspaceLayout(
  placements: readonly WorkspaceLayoutPlacement[],
  preset: WorkspaceLayoutPresetId | undefined,
  profile: ReturnType<typeof getWorkspaceLayoutProfile>,
) {
  const reception = placements.find(({ templateId }) => templateId === 'reception');
  if (
    reception?.id !== 'reception' ||
    tileKey(reception.origin) !== tileKey(profile.receptionOrigin)
  ) {
    throw new RangeError('Reception must remain in its original position.');
  }
  if (usesSquareStudioOffices(preset)) {
    const meeting = placements.find(({ id }) => id === 'large');
    const meetingOrigin =
      preset === 'repo-campus-hall'
        ? campusHallMeeting
        : preset === 'repo-campus'
          ? campusMeeting
          : orthogonalMeeting;
    if (meeting?.templateId !== 'large' || tileKey(meeting.origin) !== tileKey(meetingOrigin))
      throw new RangeError('Keep the large meeting room in its original position.');
  }
  const studio = placements.find(({ templateId }) => templateId === 'team-studio');
  if (
    preset === 'studio' &&
    (studio?.id !== 'team-studio' || tileKey(studio.origin) !== tileKey(studioOrigin))
  ) {
    throw new RangeError('Keep the team studio at the center of the floor.');
  }
  if (preset !== 'studio' && studio)
    throw new RangeError('The team studio belongs to the Studio floor plan.');
  if (!placements.some(({ templateId }) => templateId === 'small' || templateId === 'large')) {
    throw new RangeError('Keep at least one meeting room in the office.');
  }
  const privateOffices = placements.filter(({ templateId }) => templateId === 'private-office');
  if (
    preset &&
    (privateOffices.length < 1 ||
      privateOffices.length > WORKSPACE_LAYOUT_PRESETS[preset].maxPrivateOffices)
  ) {
    throw new RangeError('Choose a private office count within the preset capacity.');
  }
  if (
    !preset &&
    placements.some(({ templateId }) => ['private-office', 'lounge', 'garden'].includes(templateId))
  ) {
    throw new RangeError('Choose a Startup or Corporate layout for these modules.');
  }
  const occupied: TileRect[] = [];
  const seen = new Set<string>();
  const growingSlots = growingOfficeSlots(preset);
  for (const placement of placements) {
    const { id, origin, templateId } = placement;
    const validNumberedId =
      templateId !== 'reception' &&
      id.startsWith(`${templateId}-`) &&
      /^[1-9][0-9]{0,2}$/.test(id.slice(templateId.length + 1));
    if (
      seen.has(id) ||
      (id !== templateId && !validNumberedId) ||
      !Object.hasOwn(WORKSPACE_LAYOUT_TEMPLATES, templateId)
    ) {
      throw new RangeError('The layout contains an invalid or duplicate room.');
    }
    seen.add(id);
    if (growingSlots && id !== 'reception' && id !== 'large') {
      if (
        templateId !== 'private-office' ||
        !growingSlots.some((slot) => tileKey(slot) === tileKey(origin))
      ) {
        throw new RangeError('Place private offices in the reserved wing slots.');
      }
    }
    const error = roomPlacementError(
      getWorkspaceLayoutTemplate(templateId, preset, origin),
      origin,
      occupied,
      profile,
    );
    if (error) throw new RangeError(`${workspaceLayoutPlacementLabel(placement)}. ${error}`);
    occupied.push(roomBounds(placement, preset));
  }
}

function roomEdges(
  room: WorkspaceLayoutPlacement,
  blockedTiles: TilePoint[],
  edges: Map<string, readonly [TilePoint, TilePoint]>,
  bounds: { width: number; height: number },
  preset?: WorkspaceLayoutPresetId,
) {
  const template = getWorkspaceLayoutTemplate(room.templateId, preset, room.origin);
  const { width, height, door, additionalDoor } = template;
  const doors = additionalDoor ? [door, additionalDoor] : [door];
  const addEdge = (from: TilePoint, to: TilePoint) => {
    const a = offset(room.origin, from);
    const b = offset(room.origin, to);
    if (!isTileInBounds(a, bounds) || !isTileInBounds(b, bounds)) return;
    edges.set([tileKey(a), tileKey(b)].sort().join(':'), [a, b]);
  };
  for (const side of ['north', 'south'] as const) {
    const ty = side === 'north' ? 0 : height - 1;
    const exterior = side === 'north' ? -1 : height;
    for (let tx = 0; tx < width; tx += 1) {
      if (
        doors.some(
          (entrance) => side === entrance.side && tx >= entrance.offset && tx < entrance.offset + 2,
        )
      )
        continue;
      // The SVG rear wall occupies one full tile. The other walls are cut away.
      if (side === 'north') blockedTiles.push(offset(room.origin, { tx, ty }));
      addEdge({ tx, ty }, { tx, ty: exterior });
    }
  }
  for (let ty = 0; ty < height; ty += 1) {
    addEdge({ tx: 0, ty }, { tx: -1, ty });
    addEdge({ tx: width - 1, ty }, { tx: width, ty });
  }
}

export function compileWorkspaceLayout(
  placements: readonly WorkspaceLayoutPlacement[],
  preset?: WorkspaceLayoutPresetId,
) {
  const profile = getWorkspaceLayoutProfile(preset, placements);
  const bounds = {
    width: profile.size.width * TILE_SIZE_PX,
    height: profile.size.height * TILE_SIZE_PX,
  };
  assertWorkspaceLayout(placements, preset, profile);
  const floor = new Set(
    [...profile.corridors, ...placements.map((room) => roomBounds(room, preset))]
      .flatMap(rectTiles)
      .map(tileKey),
  );
  const blockedTiles = rectTiles({ tx: 0, ty: 0, ...profile.size }).filter(
    (tile) => !floor.has(tileKey(tile)),
  );
  if (preset === 'repo-campus' || preset === 'repo-campus-hall') {
    const courtyard =
      preset === 'repo-campus-hall'
        ? WORKSPACE_REPO_CAMPUS_HALL_COURTYARD
        : WORKSPACE_REPO_CAMPUS_COURTYARD;
    blockedTiles.push(
      ...campusCourtyardFurniture.flatMap(rectTiles).map((tile) => offset(courtyard, tile)),
    );
  }
  const edges = new Map<string, readonly [TilePoint, TilePoint]>();
  for (const placement of placements) roomEdges(placement, blockedTiles, edges, bounds, preset);
  const blockedEdges = [...edges.values()];
  const furniture = placements.map(({ id, templateId, origin }) => ({
    id,
    label: WORKSPACE_LAYOUT_TEMPLATES[templateId].label,
    tiles: getWorkspaceLayoutTemplate(templateId, preset, origin)
      .furniture.flatMap(rectTiles)
      .map((tile) => offset(origin, tile)),
    seats: getWorkspaceLayoutTemplate(templateId, preset, origin).seats.map((tile) =>
      offset(origin, tile),
    ),
  }));
  const collision = createTileCollision({
    blockedEdges,
    blockedTiles: [...blockedTiles, ...furniture.flatMap(({ tiles }) => tiles)],
  });
  const chairs = new Set(furniture.flatMap(({ seats }) => seats).map(tileKey));
  const objects: OfficeObjectDefinition[] = furniture.map(({ id, label, tiles, seats }) => {
    const objectId = `${id}-furniture`;
    return {
      objectId,
      label,
      blockedTiles: tiles,
      seats: seats.map((tile, index) => {
        const exits = DIRECTIONS.map((delta) => offset(tile, delta)).filter((exit) =>
          canStep(tile, exit, bounds, collision),
        );
        // Prefer clear floor to a neighboring chair. Runtime checks whether the chosen tile is occupied.
        exits.sort((a, b) => Number(chairs.has(tileKey(a))) - Number(chairs.has(tileKey(b))));
        return { seatId: `${objectId}:${index}`, tile, exits };
      }),
    };
  });
  const reception = offset(profile.receptionOrigin, WORKSPACE_LAYOUT_TEMPLATES.reception.arrival);
  const geometry = {
    mapId: 'workspace',
    tileSize: TILE_SIZE_PX,
    widthTiles: profile.size.width,
    heightTiles: profile.size.height,
    spawn: { x: (reception.tx + 0.5) * TILE_SIZE_PX, y: (reception.ty + 0.5) * TILE_SIZE_PX },
    blockedEdges,
    blockedTiles,
    objects,
    zones: placements
      .filter(({ templateId }) => templateId === 'small' || templateId === 'large')
      .map((room) => ({
        zoneId: room.id,
        label: workspaceLayoutPlacementLabel(room),
        kind: 'meeting' as const,
        bounds: roomBounds(room, preset),
      })),
  } as const satisfies OfficeGeometry;
  const validated = validateOfficeGeometry(geometry);
  if (
    placements.some(
      ({ origin, templateId }) =>
        !validated.isReachable(
          offset(origin, getWorkspaceLayoutTemplate(templateId, preset, origin).arrival),
        ),
    )
  ) {
    throw new RangeError('All rooms must be reachable from reception.');
  }
  return { geometry, validated };
}

export function validateWorkspaceLayout(
  placements: readonly WorkspaceLayoutPlacement[],
  preset?: WorkspaceLayoutPresetId,
): string | null {
  try {
    compileWorkspaceLayout(placements, preset);
    return null;
  } catch (error) {
    if (error instanceof RangeError) return error.message;
    throw error;
  }
}
