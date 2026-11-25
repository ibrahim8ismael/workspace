import { describe, expect, it } from 'vitest';
import {
  generateWorkspaceLayoutPreset,
  getWorkspaceLayoutTemplate,
  TILE_SIZE_PX,
} from '@gather/world';
import { enclosedWorkspaceRoomAt } from '../dist/modules/office/runtime/workspace-room.js';
import { ProximityPairing } from '../dist/modules/office/runtime/proximity-pairing.js';

const epoch = '98ff100b-f4f2-4896-81ef-11106d315b9e';

describe('private voice boundaries for generated workspaces', () => {
  it.each([
    ['repo-campus-hall', 16],
    ['repo-campus', 16],
    ['studio-orthogonal', 8],
    ['studio', 8],
    ['startup', 10],
    ['corporate', 12],
  ] as const)('recognizes each private office in the %s preset', (preset, count) => {
    const layout = generateWorkspaceLayoutPreset(preset, count);
    const offices = layout.filter(({ templateId }) => templateId === 'private-office');
    expect(offices).toHaveLength(count);

    for (const placement of offices) {
      const { width, height } = getWorkspaceLayoutTemplate(
        placement.templateId,
        preset,
        placement.origin,
      );
      const position = {
        x: (placement.origin.tx + Math.floor(width / 2) + 0.5) * TILE_SIZE_PX,
        y: (placement.origin.ty + Math.floor(height / 2) + 0.5) * TILE_SIZE_PX,
      };
      expect(enclosedWorkspaceRoomAt(layout, preset, position)).toBe(placement.id);
    }
  });

  it('keeps the shared corridor outside private rooms and includes the team studio', () => {
    const studio = generateWorkspaceLayoutPreset('studio');
    const teamStudio = studio.find(({ templateId }) => templateId === 'team-studio')!;
    expect(
      enclosedWorkspaceRoomAt(studio, 'studio', {
        x: (teamStudio.origin.tx + 2.5) * TILE_SIZE_PX,
        y: (teamStudio.origin.ty + 2.5) * TILE_SIZE_PX,
      }),
    ).toBe('team-studio');
    expect(
      enclosedWorkspaceRoomAt(studio, 'studio', { x: 1.5 * TILE_SIZE_PX, y: 10.5 * TILE_SIZE_PX }),
    ).toBeNull();
  });

  it.each([
    ['repo-campus-hall', 16],
    ['repo-campus', 16],
    ['studio-orthogonal', 8],
    ['studio', 8],
    ['startup', 10],
    ['corporate', 12],
  ] as const)('prevents nearby voice from crossing an office doorway in %s', (preset, count) => {
    const layout = generateWorkspaceLayoutPreset(preset, count);
    const office = layout.find(
      ({ id, templateId }) =>
        templateId === 'private-office' &&
        (preset !== 'repo-campus-hall' || id === 'private-office-2'),
    )!;
    const template = getWorkspaceLayoutTemplate(office.templateId, preset, office.origin);
    const doorX = office.origin.tx + template.door.offset;
    const north = template.door.side === 'north';
    const inside = {
      x: (doorX + 0.5) * TILE_SIZE_PX,
      y: (office.origin.ty + (north ? 0.5 : template.height - 0.5)) * TILE_SIZE_PX,
    };
    const corridor = {
      x: inside.x,
      y: (office.origin.ty + (north ? -0.5 : template.height + 0.5)) * TILE_SIZE_PX,
    };
    const insideRoomId = enclosedWorkspaceRoomAt(layout, preset, inside);
    const corridorRoomId = enclosedWorkspaceRoomAt(layout, preset, corridor);
    expect(insideRoomId).toBe(office.id);
    expect(corridorRoomId).toBeNull();

    const pairing = new ProximityPairing(epoch, TILE_SIZE_PX);
    const people = [
      {
        participationId: '11111111-1111-4111-8111-111111111111',
        socketId: 'inside',
        displayName: 'Inside',
        availability: 'available' as const,
        position: inside,
        roomId: insideRoomId,
      },
      {
        participationId: '22222222-2222-4222-8222-222222222222',
        socketId: 'corridor',
        displayName: 'Corridor',
        availability: 'available' as const,
        position: corridor,
        roomId: corridorRoomId,
      },
    ];
    for (const person of people) pairing.setOptIn(person.participationId, true, people);
    expect(pairing.mediaPermits()).toEqual([]);
  });
});
