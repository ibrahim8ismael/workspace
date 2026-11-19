import { describe, expect, it } from 'vitest';
import {
  MAX_WORKSPACE_ROOM_COUNT,
  generateWorkspaceOfficeGeometry,
  validateOfficeGeometry,
} from '../src/index.js';

describe('generated workspace offices', () => {
  it.each([1, 5, 20, 25, 60, MAX_WORKSPACE_ROOM_COUNT])(
    'builds a valid connected map with %i stable rooms',
    (roomCount) => {
      const geometry = generateWorkspaceOfficeGeometry(roomCount);
      const validated = validateOfficeGeometry(geometry);

      expect(geometry.zones).toHaveLength(roomCount);
      expect(new Set(geometry.zones.map((zone) => zone.zoneId)).size).toBe(roomCount);
      expect(geometry.zones.every((zone) => zone.kind === 'meeting')).toBe(true);
      expect(
        validated.isReachable({
          tx: Math.floor(geometry.spawn.x / geometry.tileSize),
          ty: Math.floor(geometry.spawn.y / geometry.tileSize),
        }),
      ).toBe(true);
      for (const zone of geometry.zones) {
        const center = {
          tx: zone.bounds.tx + Math.floor(zone.bounds.width / 2),
          ty: zone.bounds.ty + Math.floor(zone.bounds.height / 2),
        };
        expect(validated.isReachable(center), `${zone.zoneId} is reachable`).toBe(true);
      }
    },
  );

  it('preserves retained room IDs and geometry when the count grows', () => {
    const five = generateWorkspaceOfficeGeometry(5);
    const twenty = generateWorkspaceOfficeGeometry(20);
    expect(twenty.zones.slice(0, five.zones.length)).toEqual(five.zones);
    expect(twenty.zones[19]?.zoneId).toBe('workspace-room-020');
  });

  it.each([0, -1, 1.5, MAX_WORKSPACE_ROOM_COUNT + 1])('rejects invalid room count %s', (count) => {
    expect(() => generateWorkspaceOfficeGeometry(count)).toThrow(RangeError);
  });
});
