import {
  deskPlantUrl,
  deskTableUrl,
  monitorUrl,
  officeChairUrl,
  plantUrl,
} from './repoOfficeAssets';

export type RepoOfficeSprite = {
  href: string;
  width: number;
  height: number;
  fitWidth?: boolean;
  foreground?: boolean;
};

const TABLE: RepoOfficeSprite = { href: deskTableUrl, width: 96, height: 64, fitWidth: true };
const CHAIR: RepoOfficeSprite = {
  href: officeChairUrl,
  width: 32,
  height: 64,
  fitWidth: true,
  foreground: true,
};
const COMPUTER: RepoOfficeSprite = {
  href: monitorUrl,
  width: 32,
  height: 32,
  fitWidth: true,
};
const DESK_PLANT: RepoOfficeSprite = { href: deskPlantUrl, width: 32, height: 32 };
const PLANT: RepoOfficeSprite = { href: plantUrl, width: 32, height: 32 };

const TABLE_KINDS = new Set(['office-desk', 'simple-table-2x3', 'simple-coffee-table']);
const CHAIR_KINDS = new Set([
  'aeron-chair',
  'gamer-chair',
  'simple-chair',
  'space-chair',
  'z-chair',
]);
const COMPUTER_KINDS = new Set(['digital-artist-computer', 'laptop-computer']);
const DESK_PLANT_KINDS = new Set(['fern', 'ficus', 'small-potted-hosta']);
const PLANT_KINDS = new Set(['aloe-vera', 'sprout']);

export function repoOfficeSpriteFor(kind: string): RepoOfficeSprite | null {
  if (TABLE_KINDS.has(kind)) return TABLE;
  if (CHAIR_KINDS.has(kind)) return CHAIR;
  if (COMPUTER_KINDS.has(kind)) return COMPUTER;
  if (DESK_PLANT_KINDS.has(kind)) return DESK_PLANT;
  if (PLANT_KINDS.has(kind)) return PLANT;
  return null;
}

export function repoOfficeSpriteBox(sprite: RepoOfficeSprite, object: { w: number; h: number }) {
  const scale = sprite.fitWidth ? Math.min(1, object.w / sprite.width) : 1;
  const width = Math.round(sprite.width * scale);
  const height = Math.round(sprite.height * scale);
  return {
    x: Math.round((object.w - width) / 2),
    y: object.h - height,
    width,
    height,
  };
}

export const hasRepoOfficeForeground = (kind: string) =>
  repoOfficeSpriteFor(kind)?.foreground === true;
