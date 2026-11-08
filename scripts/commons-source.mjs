// Fixed original CP02.4 Commons source catalog. The ten SVGs in
// packages/assets/source/commons are the only inputs; every ID below is derived from these names.
export const DIRECTIONS = ['north', 'east', 'south', 'west'];
export const POSES = [
  ['standing', 'stand'],
  ['sitting', 'sit'],
];
export const BODY_ID = 'commons-worker';
export const PALETTE_ID = 'teal';
export const AVATAR = { width: 24, height: 32, footOrigin: { x: 12, y: 31 } };
export const TABLE_ROLE = 'table/base';
export const CHAIR_ROLE = 'chair/foreground';
export const DRAW_ORDER = [TABLE_ROLE, 'avatar', CHAIR_ROLE];
export const OBJECTS = [
  {
    spriteId: 'commons-table',
    role: TABLE_ROLE,
    source: 'table.svg',
    width: 64,
    height: 64,
    footOrigin: { x: 32, y: 63 },
  },
  {
    spriteId: 'commons-chair-backrest',
    role: CHAIR_ROLE,
    source: 'chair-backrest.svg',
    width: 32,
    height: 32,
    footOrigin: { x: 16, y: 31 },
  },
];
// Original artwork authored for this repository. These are static pose references for the future
// CP02 Phaser sample, not walking animation frames.
export const ARTWORK = {
  kind: 'original',
  created: '2026-11-08',
  author: 'OpenCode / DeepSeek V4.1 Flash Free',
  license: 'Original project artwork; no third-party license applies.',
};
export const PALETTE = new Set([
  '#24312F',
  '#E8B48C',
  '#8A5A3B',
  '#2F6F6A',
  '#1D4B47',
  '#F3D8A6',
  '#79B4AA',
  '#D9A066',
]);
