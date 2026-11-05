export { TILE } from './vivo-map.js';
export const OFFICE_SIZE: { readonly width: number; readonly height: number };
export const MEDIA_RADIUS: number;
export const CHAT_RADIUS: number;
export const SPAWN_TILE: { readonly tx: number; readonly ty: number };
export const SPAWN: { readonly x: number; readonly y: number };
export function tileCenter(tx: number, ty: number): { x: number; y: number };
export function tileOf(point: { x: number; y: number }): { tx: number; ty: number };
export function sameTile(a: { x: number; y: number }, b: { x: number; y: number }): boolean;
export function isInMeetingArea(point: { x: number; y: number }): boolean;
export function sharesConversationArea(
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
): boolean;
