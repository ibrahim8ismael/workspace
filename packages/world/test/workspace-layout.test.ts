import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_LAYOUT,
  addWorkspaceLayoutPlacement,
  canStep,
  compileWorkspaceLayout,
  generateWorkspaceLayoutPreset,
  getWorkspaceLayoutProfile,
  getWorkspaceLayoutTemplate,
  resizeWorkspaceLayoutPrivateOffices,
  isBlockedTile,
  moveWorkspaceLayoutPlacement,
  validWorkspaceLayoutOrigins,
  validateWorkspaceLayout,
} from '../src/index.js';

describe('editable workspace layout compiler', () => {
  it('opens both edges of every Campus Hall office directly onto one connected floor', () => {
    const preset = 'repo-campus-hall';
    for (let count = 1; count <= 16; count += 1) {
      const plan = generateWorkspaceLayoutPreset(preset, count);
      const { geometry, validated } = compileWorkspaceLayout(plan, preset);
      expect(geometry.heightTiles).toBe(42);
      expect(validated.isReachable({ tx: 9, ty: 0 })).toBe(true);
      expect(validated.isReachable({ tx: 9, ty: -1 })).toBe(false);
      expect(validated.isReachable({ tx: geometry.widthTiles - 1, ty: 16 })).toBe(false);
      expect(geometry.zones).toMatchObject([{ zoneId: 'large', bounds: { tx: 12, ty: 17 } }]);

      for (const room of plan.filter(({ templateId }) => templateId === 'private-office')) {
        const { door, height } = getWorkspaceLayoutTemplate(room.templateId, preset, room.origin);
        const north = room.origin.ty === 34;
        expect(door.side).toBe(north ? 'north' : 'south');
        const insideY = room.origin.ty + (north ? 0 : height - 1);
        const outsideY = north ? 33 : 14;
        for (const doorwayColumn of [2, 3]) {
          const tx = room.origin.tx + doorwayColumn;
          expect(validated.isReachable({ tx, ty: outsideY })).toBe(true);
          expect(
            canStep(
              { tx, ty: outsideY },
              { tx, ty: insideY },
              validated.bounds,
              validated.collision,
            ),
          ).toBe(true);
        }
        expect(
          canStep(
            { tx: room.origin.tx + 1, ty: outsideY },
            { tx: room.origin.tx + 1, ty: insideY },
            validated.bounds,
            validated.collision,
          ),
        ).toBe(false);
      }
    }
  });

  it.each([
    [4, 26],
    [8, 34],
  ])('expands Campus Hall from %i to 16 retaining every original room', (count, width) => {
    const preset = 'repo-campus-hall';
    const initial = generateWorkspaceLayoutPreset(preset, count).map((room) =>
      room.id === 'private-office-1' ? { ...room, name: 'Design studio' } : room,
    );
    const expanded = resizeWorkspaceLayoutPrivateOffices(initial, 16, preset)!;
    expect(expanded.slice(0, initial.length)).toEqual(initial);
    expect(compileWorkspaceLayout(initial, preset).geometry.widthTiles).toBe(width);
    const { geometry, validated } = compileWorkspaceLayout(expanded, preset);
    expect(geometry.widthTiles).toBe(58);
    expect(validated.isReachable({ tx: 53, ty: 38 })).toBe(true);
    expect(validated.isReachable({ tx: 53, ty: 12 })).toBe(true);
  });

  it('retains a moved Campus Hall office and its width when reducing the room count', () => {
    const preset = 'repo-campus-hall';
    const start = generateWorkspaceLayoutPreset(preset, 15);
    const freeRoom = { tx: 50, ty: 34 };
    expect(
      validWorkspaceLayoutOrigins(start, 'private-office', 'private-office-1', preset),
    ).toContainEqual(freeRoom);
    const moved = moveWorkspaceLayoutPlacement(start, 'private-office-1', freeRoom, preset);
    const reduced = resizeWorkspaceLayoutPrivateOffices(moved, 4, preset)!;
    expect(reduced.find(({ id }) => id === 'private-office-1')?.origin).toEqual(freeRoom);
    expect(compileWorkspaceLayout(reduced, preset).geometry.widthTiles).toBe(58);
  });

  it('connects all Campus offices and bounds the concourse and courtyard at every size', () => {
    const preset = 'repo-campus';
    const widths = [];
    for (let count = 1; count <= 16; count += 1) {
      const floor = generateWorkspaceLayoutPreset(preset, count);
      const { geometry, validated } = compileWorkspaceLayout(floor, preset);
      const { bounds, collision } = validated;
      expect(floor).toHaveLength(count + 2);
      expect(geometry.heightTiles).toBe(35);
      expect(geometry.zones).toMatchObject([{ zoneId: 'large', bounds: { tx: 20, ty: 6 } }]);
      expect(validated.isReachable({ tx: 9, ty: 2 })).toBe(true);
      expect(validated.isReachable({ tx: 8, ty: 7 })).toBe(false);
      expect(validated.isReachable({ tx: 5, ty: 7 })).toBe(false);
      expect(validated.isReachable({ tx: 8, ty: 8 })).toBe(true);
      expect(canStep({ tx: 9, ty: 2 }, { tx: 9, ty: 1 }, bounds, collision)).toBe(false);
      expect(validated.isReachable({ tx: geometry.widthTiles - 2, ty: 15 })).toBe(true);
      expect(validated.isReachable({ tx: geometry.widthTiles - 1, ty: 15 })).toBe(false);
      widths.push(geometry.widthTiles);
    }
    expect(widths).toEqual([43, 43, 49, 49, 55, 55, 61, 61, 67, 67, 73, 73, 79, 79, 85, 85]);
  });

  it.each([4, 8])('extends Campus from %i to 16 preserves names, rooms and corridors', (start) => {
    const preset = 'repo-campus';
    const plan = generateWorkspaceLayoutPreset(preset, start).map((room) =>
      room.id === 'private-office-1' ? { ...room, name: 'Design studio' } : room,
    );
    const expanded = resizeWorkspaceLayoutPrivateOffices(plan, 16, preset)!;
    expect(expanded.slice(0, plan.length)).toEqual(plan);
    expect(compileWorkspaceLayout(plan, preset).validated.isReachable({ tx: 80, ty: 26 })).toBe(
      false,
    );
    const { geometry, validated } = compileWorkspaceLayout(expanded, preset);
    expect(geometry.widthTiles).toBe(85);
    expect(validated.isReachable({ tx: 80, ty: 26 })).toBe(true);
    expect(validated.isReachable({ tx: 80, ty: 12 })).toBe(true);
  });

  it('shrinks Campus around the deepest retained moved office and fills vacant slots on growth', () => {
    const preset = 'repo-campus';
    const plan = generateWorkspaceLayoutPreset(preset, 7);
    const eastSlot = { tx: 53, ty: 22 };
    expect(
      validWorkspaceLayoutOrigins(plan, 'private-office', 'private-office-1', preset),
    ).toContainEqual(eastSlot);
    const moved = moveWorkspaceLayoutPlacement(plan, 'private-office-1', eastSlot, preset);
    const reduced = resizeWorkspaceLayoutPrivateOffices(moved, 4, preset)!;
    expect(compileWorkspaceLayout(reduced, preset).geometry.widthTiles).toBe(61);
    const expanded = resizeWorkspaceLayoutPrivateOffices(reduced, 16, preset)!;
    expect(expanded.find(({ id }) => id === 'private-office-1')?.origin).toEqual(eastSlot);
    expect(compileWorkspaceLayout(expanded, preset).geometry.widthTiles).toBe(85);
  });

  it('compiles all 16 expandable Studio counts with centered rooms and bounded walkable wings', () => {
    const preset = 'studio-expandable';
    const heights: number[] = [];
    for (let count = 1; count <= 16; count += 1) {
      const floor = generateWorkspaceLayoutPreset(preset, count);
      const { geometry, validated } = compileWorkspaceLayout(floor, preset);
      const reception = floor.find(({ id }) => id === 'reception')!;
      const meeting = floor.find(({ id }) => id === 'large')!;
      expect(floor).toHaveLength(count + 2);
      expect(meeting.origin).toEqual({ tx: 15, ty: 14 });
      expect(reception.origin.ty + 9).toBe(geometry.heightTiles);
      expect(
        geometry.objects.filter(({ objectId }) => objectId.startsWith('private-office-')),
      ).toHaveLength(count);
      expect(validated.isReachable({ tx: 21, ty: 2 })).toBe(true);
      expect(validated.isReachable({ tx: 21, ty: 1 })).toBe(false);
      expect(validated.isReachable({ tx: 20, ty: geometry.heightTiles })).toBe(false);
      expect(validated.isReachable({ tx: 42, ty: 9 })).toBe(false);
      for (const tx of [20, 21]) {
        expect(
          canStep(
            { tx, ty: reception.origin.ty - 1 },
            { tx, ty: reception.origin.ty },
            validated.bounds,
            validated.collision,
          ),
        ).toBe(true);
      }
      if (count <= 12) expect(validated.isReachable({ tx: 10, ty: 36 })).toBe(false);
      heights.push(geometry.heightTiles);
    }
    expect(heights).toEqual([34, 34, 34, 34, 37, 37, 37, 37, 45, 45, 45, 45, 53, 53, 53, 53]);
  });

  it.each([4, 8])('grows %i to 16 offices preserving existing IDs, names and origins', (start) => {
    const preset = 'studio-expandable';
    const original = generateWorkspaceLayoutPreset(preset, start).map((room) =>
      room.id === 'private-office-1' ? { ...room, name: 'Design' } : room,
    );
    const expanded = resizeWorkspaceLayoutPrivateOffices(original, 16, preset)!;
    expect(expanded.slice(1, original.length)).toEqual(original.slice(1));
    expect(expanded).toHaveLength(18);
    const { geometry, validated } = compileWorkspaceLayout(expanded, preset);
    expect(geometry.heightTiles).toBe(53);
    expect(validated.isReachable({ tx: 4, ty: 39 })).toBe(true);
    expect(validated.isReachable({ tx: 38, ty: 39 })).toBe(true);
    expect(compileWorkspaceLayout(original, preset).validated.isReachable({ tx: 4, ty: 39 })).toBe(
      false,
    );
  });

  it('retains a moved office in a deeper band when shrinking and then fills free slots', () => {
    const preset = 'studio-expandable';
    const floor = generateWorkspaceLayoutPreset(preset, 9);
    const destination = { tx: 29, ty: 27 };
    expect(
      validWorkspaceLayoutOrigins(floor, 'private-office', 'private-office-1', preset),
    ).toContainEqual(destination);
    const moved = moveWorkspaceLayoutPlacement(floor, 'private-office-1', destination, preset);
    const reduced = resizeWorkspaceLayoutPrivateOffices(moved, 4, preset)!;
    expect(reduced.find(({ id }) => id === 'private-office-1')?.origin).toEqual(destination);
    expect(compileWorkspaceLayout(reduced, preset).geometry.heightTiles).toBe(45);
    const expanded = resizeWorkspaceLayoutPrivateOffices(reduced, 16, preset)!;
    expect(expanded.find(({ id }) => id === 'private-office-1')?.origin).toEqual(destination);
    expect(validateWorkspaceLayout(expanded, preset)).toBeNull();
  });

  it('grows both orthogonal wings without moving any room and bounds the north open area', () => {
    const preset = 'studio-orthogonal';
    const six = generateWorkspaceLayoutPreset(preset, 6);
    const eight = resizeWorkspaceLayoutPrivateOffices(six, 8, preset)!;
    expect(eight.slice(0, six.length)).toEqual(six);
    expect(eight.slice(six.length).map(({ origin }) => origin)).toEqual([
      { tx: 7, ty: 19 },
      { tx: 29, ty: 19 },
    ]);
    const { geometry, validated } = compileWorkspaceLayout(eight, preset);
    expect(geometry.zones).toHaveLength(1);
    expect(
      geometry.objects.find(({ objectId }) => objectId === 'large-furniture')?.seats,
    ).toHaveLength(8);
    expect(
      geometry.objects
        .filter(({ objectId }) => objectId.startsWith('private-office-'))
        .every(({ blockedTiles, seats }) => blockedTiles.length === 2 && seats.length === 1),
    ).toBe(true);
    expect(validated.isReachable({ tx: 21, ty: 2 })).toBe(true);
    expect(
      canStep({ tx: 21, ty: 2 }, { tx: 21, ty: 1 }, validated.bounds, validated.collision),
    ).toBe(false);
    expect(canStep({ tx: 2, ty: 3 }, { tx: 1, ty: 3 }, validated.bounds, validated.collision)).toBe(
      false,
    );
    expect(
      canStep({ tx: 39, ty: 3 }, { tx: 40, ty: 3 }, validated.bounds, validated.collision),
    ).toBe(false);
  });

  it('keeps the SVG thresholds, furniture, open doors, and chairs aligned to the grid', () => {
    const { geometry, validated } = compileWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
    const { bounds, collision } = validated;
    expect(geometry.zones.map(({ zoneId }) => zoneId)).toEqual(['small', 'large']);
    expect(canStep({ tx: 5, ty: 9 }, { tx: 5, ty: 8 }, bounds, collision)).toBe(true);
    expect(canStep({ tx: 4, ty: 9 }, { tx: 4, ty: 8 }, bounds, collision)).toBe(false);
    expect(isBlockedTile({ tx: 5, ty: 3 }, bounds, collision)).toBe(true);
    expect(isBlockedTile({ tx: 5, ty: 5 }, bounds, collision)).toBe(true);
    const seats = geometry.objects.flatMap(({ seats }) => seats);
    expect(seats).toHaveLength(14);
    for (const { tile, exits } of seats) {
      expect(validated.isReachable(tile)).toBe(true);
      expect(exits.length).toBeGreaterThan(0);
      expect(exits.every((exit) => canStep(tile, exit, bounds, collision))).toBe(true);
    }
  });

  it('allows adding adjoining rooms and preserves furniture and room IDs after moving', () => {
    let layout = DEFAULT_WORKSPACE_LAYOUT;
    for (const template of ['large', 'small', 'desks'] as const) {
      const origin = validWorkspaceLayoutOrigins(layout, template)[0];
      if (!origin) throw new Error(`No valid placement for ${template}`);
      layout = addWorkspaceLayoutPlacement(layout, template, origin);
    }
    expect(validateWorkspaceLayout(layout)).toBeNull();
    const { geometry } = compileWorkspaceLayout(layout);
    expect(geometry.zones.map(({ zoneId }) => zoneId)).toEqual([
      'small',
      'large',
      'large-2',
      'small-2',
    ]);
    const newOrigin = { tx: 30, ty: 3 };
    const moved = compileWorkspaceLayout(
      moveWorkspaceLayoutPlacement(DEFAULT_WORKSPACE_LAYOUT, 'small', newOrigin),
    );
    expect(moved.geometry.zones[0]?.bounds).toMatchObject(newOrigin);
    expect(
      moved.geometry.objects.find(({ objectId }) => objectId === 'small-furniture')?.seats[0],
    ).toMatchObject({ seatId: 'small-furniture:0', tile: { tx: 33, ty: 4 } });
  });

  it.each([
    ['startup', 10, 2],
    ['startup', 12, 2],
    ['corporate', 12, 3],
    ['corporate', 21, 3],
  ] as const)(
    'keeps %s %i private offices separate from %i meeting rooms and connects every doorway',
    (preset, count, meetingCount) => {
      const layout = generateWorkspaceLayoutPreset(preset, count);
      const offices = layout.filter(({ templateId }) => templateId === 'private-office');
      const { geometry, validated } = compileWorkspaceLayout(layout, preset);
      expect(offices).toHaveLength(count);
      expect(geometry.zones).toHaveLength(meetingCount);
      expect(new Set(offices.map(({ origin }) => origin.ty)).size).toBe(
        preset === 'corporate' ? 3 : 2,
      );
      expect(
        geometry.objects.filter(({ objectId }) => objectId.startsWith('private-office-')),
      ).toHaveLength(count);
      expect(geometry.widthTiles).toBe(getWorkspaceLayoutProfile(preset).size.width);
      for (const { origin } of offices) {
        expect(
          canStep(
            { tx: origin.tx + 2, ty: origin.ty + 5 },
            { tx: origin.tx + 2, ty: origin.ty + 4 },
            validated.bounds,
            validated.collision,
          ),
        ).toBe(true);
        expect(
          canStep(
            { tx: origin.tx + 1, ty: origin.ty + 5 },
            { tx: origin.tx + 1, ty: origin.ty + 4 },
            validated.bounds,
            validated.collision,
          ),
        ).toBe(false);
        expect(
          isBlockedTile(
            { tx: origin.tx + 2, ty: origin.ty },
            validated.bounds,
            validated.collision,
          ),
        ).toBe(true);
        expect(validated.isReachable({ tx: origin.tx + 2, ty: origin.ty + 3 })).toBe(true);
      }
    },
  );

  it('connects the nearest end of each hallway without crossing a room wall', () => {
    for (const preset of ['startup', 'corporate'] as const) {
      const { validated } = compileWorkspaceLayout(generateWorkspaceLayoutPreset(preset), preset);
      const { bounds, collision } = validated;
      const lastHallY = preset === 'startup' ? 22 : 35;
      const path = [
        { tx: 2, ty: lastHallY },
        ...Array.from({ length: lastHallY - 11 }, (_, index) => ({ tx: 1, ty: lastHallY - index })),
        { tx: 2, ty: 12 },
      ];
      expect(path.length).toBeLessThan(30);
      for (let index = 1; index < path.length; index += 1)
        expect(canStep(path[index - 1]!, path[index]!, bounds, collision)).toBe(true);
      expect(canStep({ tx: 1, ty: 18 }, { tx: 2, ty: 18 }, bounds, collision)).toBe(false);
    }
  });

  it('resizes Startup without moving or renaming any retained office', () => {
    const initial = generateWorkspaceLayoutPreset('startup', 10).map((placement) =>
      placement.id === 'private-office-1' ? { ...placement, name: 'North Star Studio' } : placement,
    );
    const grown = resizeWorkspaceLayoutPrivateOffices(initial, 12, 'startup');
    expect(grown?.slice(0, initial.length)).toEqual(initial);
    expect(grown?.slice(-2).map(({ id }) => id)).toEqual([
      'private-office-11',
      'private-office-12',
    ]);
    expect(validateWorkspaceLayout(grown!, 'startup')).toBeNull();
    expect(resizeWorkspaceLayoutPrivateOffices(grown!, 10, 'startup')).toEqual(initial);
    expect(resizeWorkspaceLayoutPrivateOffices(initial, 14, 'startup')).toBeNull();
  });

  it('grows the compact Studio without modifying rooms, names or circulation', () => {
    const original = generateWorkspaceLayoutPreset('studio', 6).map((room) =>
      room.id === 'private-office-1' ? { ...room, name: 'Sketchbook' } : room,
    );
    const grown = resizeWorkspaceLayoutPrivateOffices(original, 8, 'studio');
    expect(grown?.slice(0, original.length)).toEqual(original);
    expect(grown?.slice(-2).map(({ id, origin }) => [id, origin])).toEqual([
      ['private-office-7', { tx: 21, ty: 4 }],
      ['private-office-8', { tx: 27, ty: 4 }],
    ]);
    const before = compileWorkspaceLayout(original, 'studio');
    const after = compileWorkspaceLayout(grown!, 'studio');
    expect(after.geometry.widthTiles).toBe(before.geometry.widthTiles);
    expect(after.geometry.heightTiles).toBe(before.geometry.heightTiles);
    expect(after.geometry.spawn).toEqual(before.geometry.spawn);
    expect(after.geometry.zones).toEqual(before.geometry.zones);
    expect(after.geometry.objects.slice(0, before.geometry.objects.length)).toEqual(
      before.geometry.objects,
    );
    const { bounds, collision } = after.validated;
    expect(canStep({ tx: 26, ty: 11 }, { tx: 26, ty: 12 }, bounds, collision)).toBe(true);
    expect(canStep({ tx: 26, ty: 21 }, { tx: 26, ty: 20 }, bounds, collision)).toBe(true);
    expect(canStep({ tx: 25, ty: 11 }, { tx: 25, ty: 12 }, bounds, collision)).toBe(false);
    expect(isBlockedTile({ tx: 2, ty: 13 }, bounds, collision)).toBe(true);
  });

  it('rejects an overlapping room or a doorway facing away from the corridor', () => {
    expect(
      validateWorkspaceLayout(
        addWorkspaceLayoutPlacement(DEFAULT_WORKSPACE_LAYOUT, 'small', { tx: 2, ty: 3 }),
      ),
    ).toMatch(/overlaps another space/);
    expect(
      validateWorkspaceLayout(
        moveWorkspaceLayoutPlacement(DEFAULT_WORKSPACE_LAYOUT, 'small', { tx: 30, ty: 2 }),
      ),
    ).toMatch(/doorway must open fully onto the corridor/);
  });
});
