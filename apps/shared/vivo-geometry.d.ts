import type { Area, MapObject } from './vivo-map.js';
export type WallSide = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
export type Wall = {
  area: string;
  texture: string;
  side: WallSide;
  tx: number;
  ty: number;
  open: boolean;
};
export type Doorway = {
  area: string;
  orientation: 'Horizontal' | 'Vertical';
  tx: number;
  ty: number;
  side: 'n' | 's' | 'e' | 'w';
};
export type Seat = {
  id: string;
  objectId: string;
  label: string;
  facing: 'north' | 'south' | 'east' | 'west';
  tx: number;
  ty: number;
  x: number;
  y: number;
  standX: number;
  standY: number;
  desk: boolean;
};
export type SeatObject = Pick<MapObject, 'id' | 'kind' | 'facing' | 'x' | 'y'> & {
  seat?: number[][];
  blocks?: number[][];
};
export function buildWalls(): Wall[];
export function buildDoorways(): Doorway[];
export const WALLS: Wall[];
export const DOORWAYS: Doorway[];
export function buildBlockedEdges(walls?: Wall[]): Set<string>;
export const BLOCKED_EDGES: Set<string>;
export function buildBlockedTiles(
  extraObjects?: SeatObject[],
  baseObjects?: readonly SeatObject[],
): Set<string>;
export const BLOCKED: Set<string>;
export function isBlockedTile(x: number, y: number, blocked?: Set<string>): boolean;
export function canStep(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blocked?: Set<string>,
  edges?: Set<string>,
): boolean;
export function buildSeats(
  extraObjects?: SeatObject[],
  blocked?: Set<string>,
  baseObjects?: readonly SeatObject[],
): Seat[];
export const SEATS: Seat[];
export function areaAt(tx: number, ty: number): Area | null;
export function tileOf(point: { x: number; y: number }): { tx: number; ty: number };
export function areaOf(point: { x: number; y: number }): Area | null;
export function parentChain(area: Area | null): Area[];
export function privateRoomOf(point: { x: number; y: number }): Area | null;
export function sharesConversationArea(
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
): boolean;
