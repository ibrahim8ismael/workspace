import { describe, expect, it } from 'vitest';
import { generateWorkspaceLayoutPreset } from '@gather/world';
import { workspaceRoomVisuals } from '../commons-preview/workspace-room-visuals';

describe('workspace room doors and lighting state', () => {
  it('closes every occupied room door and lights only the local room', () => {
    const placements = generateWorkspaceLayoutPreset('studio-orthogonal', 8);
    const state = workspaceRoomVisuals(
      placements,
      'studio-orthogonal',
      [
        { participationId: 'owner', position: { x: 144, y: 464 } },
        { participationId: 'member', position: { x: 656, y: 560 } },
      ],
      'owner',
    );

    expect(state.activeRoom).toMatchObject({
      roomId: 'private-office-1',
      label: 'Private office 1',
    });
    expect(state.doors.find(({ roomId }) => roomId === 'private-office-1')?.closed).toBe(true);
    expect(state.doors.find(({ roomId }) => roomId === 'large')?.closed).toBe(true);
    expect(state.doors.find(({ roomId }) => roomId === 'reception')?.closed).toBe(false);
  });

  it('turns the room light off in corridors and opens the door after everyone leaves', () => {
    const placements = generateWorkspaceLayoutPreset('studio-orthogonal', 8);
    const state = workspaceRoomVisuals(
      placements,
      'studio-orthogonal',
      [{ participationId: 'owner', position: { x: 400, y: 800 } }],
      'owner',
    );

    expect(state.activeRoom).toBeNull();
    expect(state.doors.every(({ closed }) => !closed)).toBe(true);
  });

  it('closes on entry, stays closed until the last exit, and opens on disconnect', () => {
    const preset = 'studio-orthogonal';
    const placements = generateWorkspaceLayoutPreset(preset);
    const state = (
      ...participants: Array<{ participationId: string; position: { x: number; y: number } }>
    ) =>
      workspaceRoomVisuals(placements, preset, participants, 'owner').doors.find(
        ({ roomId }) => roomId === 'private-office-1',
      )!;
    const owner = { participationId: 'owner', position: { x: 144, y: 464 } };
    const member = { participationId: 'member', position: { x: 176, y: 464 } };
    const exit = { x: 400, y: 800 };

    expect(state({ ...owner, position: exit }).closed).toBe(false);
    expect(state(owner)).toMatchObject({ closed: true, entrances: [{ span: 2 }] });
    expect(state(owner, member).closed).toBe(true);
    expect(state({ ...owner, position: exit }, member).closed).toBe(true);
    expect(state({ ...owner, position: exit }, { ...member, position: exit }).closed).toBe(false);
    expect(state({ ...owner, position: exit }).closed).toBe(false);
  });

  it('tracks both team studio entrances as one occupied room', () => {
    const placements = generateWorkspaceLayoutPreset('studio');
    const state = workspaceRoomVisuals(
      placements,
      'studio',
      [{ participationId: 'owner', position: { x: 27 * 32 + 16, y: 16 * 32 + 16 } }],
      'owner',
    );
    const studio = state.doors.find(({ roomId }) => roomId === 'team-studio');

    expect(studio?.closed).toBe(true);
    expect(studio?.entrances).toEqual([
      { side: 'north', at: 26, span: 2 },
      { side: 'south', at: 26, span: 2 },
    ]);
  });
});
