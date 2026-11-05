import type { MapObject } from './vivo-map.js';
export type EditorObject = {
  id: string;
  kind: string;
  color?: string;
  facing?: string;
  x: number;
  y: number;
  /** Placed off the grid: drawn at its exact position. */ free?: boolean;
};
export type CatalogVariant = {
  w: number;
  h: number;
  originX: number;
  originY: number;
  offLeft: number;
  offTop: number;
  blocks: number[][];
  seat: number[][];
};
export type CatalogEntry = {
  kind: string;
  color: string;
  family: string;
  facings: Record<string, CatalogVariant>;
};
export const LEGACY_KINDS: Record<string, string>;
export const FACINGS: string[];
export function catalogEntry(object: Pick<EditorObject, 'kind' | 'color'>): CatalogEntry | null;
export function resolveObject(
  object: EditorObject,
): { entry: CatalogEntry; facing: string; variant: CatalogVariant; tx: number; ty: number } | null;
export function nextFacing(object: EditorObject): string | null;
export function officeObjectTiles(object: EditorObject): number[][];
export function asMapObject(object: EditorObject, id?: string): MapObject;
export type ObjectOverride = { facing?: string; x?: number; y?: number; removed?: boolean };
export type Overrides = Record<string, ObjectOverride>;
export const BASE_OBJECTS: readonly MapObject[];
export function isBaseObjectId(id: string): boolean;
export function baseObject(id: string): MapObject | null;
export function validOverride(id: string, override: unknown): boolean;
export function effectiveBaseObjects(overrides?: Overrides): MapObject[];
export function baseAsEditorObject(id: string, overrides?: Overrides): EditorObject | null;
export function officeObjectBlocksPoint(
  object: EditorObject,
  point: { x: number; y: number },
): boolean;
