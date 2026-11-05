import type { Seat } from './vivo-geometry.js';
import type { Overrides } from './office-objects.js';
export type OfficeSeat = Seat;
type EditorObject = { id: string; kind: string; x: number; y: number };
export const SEAT_INTERACTION_RADIUS: number;
export function getOfficeSeats(objects?: EditorObject[], overrides?: Overrides): OfficeSeat[];
export function getOfficeSeat(
  id: unknown,
  objects?: EditorObject[],
  overrides?: Overrides,
): OfficeSeat | undefined;
export function canExitSeat(
  seat: OfficeSeat,
  objects?: EditorObject[],
  overrides?: Overrides,
): boolean;
export function canApproachSeat(
  point: { x: number; y: number },
  seat: OfficeSeat,
  objects?: EditorObject[],
  overrides?: Overrides,
): boolean;
