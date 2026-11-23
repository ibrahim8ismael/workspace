import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type {
  ConversationAreas,
  MeetingZones,
  OfficeBootstrapResponse,
  WorldSnapshot,
} from '@gather/contracts';
import {
  createTileCollision,
  getWorkspaceLayoutProfile,
  pixelToTile,
  WORKSPACE_STUDIO_OPEN_AREA,
  getWorkspaceLayoutTemplate,
  WORKSPACE_STUDIO_LANDSCAPE,
} from '@gather/world';
import type { TilePoint } from '@gather/world';
import { adjacentSeat, workspaceRoute } from './workspace-navigation';
import { AvatarPositionPlayback, playbackFacing } from './avatar-position-playback';
import { workspaceRoomVisuals } from './workspace-room-visuals';
import type { WorkspaceRoomDoorVisual, WorkspaceRoomLight } from './workspace-room-visuals';
import { readPreview } from './data';
import {
  workspaceLayoutArt,
  workspaceArtFor,
  workspaceOrthogonalOpenArea,
  workspaceStudioAvatar,
  workspaceStudioLandscape,
} from './workspace-layout-art';
import { createCommonsSceneCleanup } from './scene-lifecycle';
import './preview.css';

type Assets = ReturnType<typeof readPreview>;
type Frame = Assets['avatarFrames'][number];
type ObjectFrame = Assets['objectFrames'][number];
type Direction = 'north' | 'east' | 'south' | 'west';
const avatarRows = { north: 0, east: 1, south: 2, west: 3 };
const avatarTexture = 'workspace-studio-avatar';
const speechBarHeights = [
  [6, 12, 8],
  [10, 6, 12],
  [12, 10, 6],
  [8, 12, 10],
] as const;
const landscapeTexture = 'workspace-studio-landscape';
const orthogonalOpenAreaTexture = 'workspace-orthogonal-open-area';
type NavigationTarget = { x: number; y: number; nonce: number; participantId: string };
type NavigationResult = 'moving' | 'nearby' | 'stopped' | 'unavailable';
type Movement = (dx: -1 | 0 | 1, dy: -1 | 0 | 1, waypoint?: TilePoint) => void;
type SceneActions = {
  onSit?: (id: string) => void;
  onStand?: () => void;
  onSelect?: (id: string, trigger?: HTMLElement) => void;
  onNavigationResult?: (id: string, result: NavigationResult) => void;
  onManualCamera?: () => void;
};
type Pose = 'standing' | 'sitting';
type AvatarView = {
  image: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  speech?: { badge: Phaser.GameObjects.Graphics; phase: number };
  playback?: AvatarPositionPlayback;
  motion: {
    facing: Direction;
    displayedFacing: Direction;
    seated: boolean;
    movedAt: number;
    walkDistance: number;
    frame: number;
  };
};
type MountedScene = {
  cleanup: () => void;
  setFollow: (follow: boolean) => void;
  navigate: (target: NavigationTarget | undefined) => void;
  updateSnapshot: (snapshot: WorldSnapshot) => void;
  updateSpeakers: (ids: readonly string[]) => void;
  updateAreas: (areas: ConversationAreas['areas']) => void;
  updateMeetingZones: (zones: MeetingZones['zones']) => void;
  updateCurrentMeetingZone: (zone: MeetingZones['zones'][number] | null) => void;
};

function avatarFrame(
  assets: Assets,
  appearance: { bodyId: string; paletteId: string },
  pose: Pose,
  direction: Direction,
) {
  const selected = assets.avatarFrames.find(
    (frame) =>
      frame.frameId ===
      `${appearance.bodyId}-${pose === 'standing' ? 'stand' : 'sit'}-${direction}`,
  );
  return (
    selected ??
    assets.avatarFrames.find(
      (frame) =>
        frame.frameId ===
        `${assets.catalog.defaultAppearance.bodyId}-${pose === 'standing' ? 'stand' : 'sit'}-${direction}`,
    )!
  );
}

function mountScene(
  parent: HTMLElement,
  bootstrap: OfficeBootstrapResponse,
  initialSnapshot: WorldSnapshot,
  localParticipationId: string,
  ready: () => void,
  failed: () => void,
  onMovement: Movement,
  initialAreas: ConversationAreas['areas'],
  initialMeetingZones: MeetingZones['zones'],
  initialCurrentMeetingZone: MeetingZones['zones'][number] | null,
  actions: SceneActions,
): MountedScene {
  const assets = readPreview();
  const generatedWorkspace = bootstrap.manifest.mapId === 'workspace';
  if (
    generatedWorkspace
      ? !bootstrap.geometry ||
        assets.manifest.assetManifestVersion !== bootstrap.manifest.assetManifestVersion
      : assets.manifest.mapVersion !== bootstrap.mapVersion
  ) {
    failed();
    return {
      cleanup: () => parent.remove(),
      setFollow: () => undefined,
      navigate: () => undefined,
      updateSnapshot: () => undefined,
      updateSpeakers: () => undefined,
      updateAreas: () => undefined,
      updateMeetingZones: () => undefined,
      updateCurrentMeetingZone: () => undefined,
    };
  }
  const geometry = bootstrap.geometry ?? assets.geometry;
  const svgLayout = bootstrap.layout;
  const classicStudio = bootstrap.layoutPreset === 'studio';
  const orthogonalStudio = bootstrap.layoutPreset === 'studio-orthogonal';
  const studio = classicStudio || orthogonalStudio;
  const { catalog } = assets;
  const frames: Array<Frame | ObjectFrame> = [...assets.avatarFrames, ...assets.objectFrames];
  let disposed = false;
  let applyNavigation: MountedScene['navigate'] = () => undefined;
  let applyFollow: (follow: boolean) => void = () => undefined;
  let applySnapshot: (snapshot: WorldSnapshot) => void = () => undefined;
  let applySpeakers: MountedScene['updateSpeakers'] = () => undefined;
  let applyAreas: (areas: ConversationAreas['areas']) => void = () => undefined;
  let applyMeetingZones: (zones: MeetingZones['zones']) => void = () => undefined;
  let applyCurrentMeetingZone: (zone: MeetingZones['zones'][number] | null) => void = () =>
    undefined;
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: bootstrap.manifest.bounds.width,
    height: bootstrap.manifest.bounds.height,
    backgroundColor: '#d7e5dc',
    pixelArt: true,
    roundPixels: true,
    // The SVG floor is opaque and covers the bounded camera viewport.
    clearBeforeRender: !svgLayout,
    audio: { noAudio: true },
    input: { keyboard: true, mouse: !!svgLayout, touch: !!svgLayout, gamepad: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload(this: Phaser.Scene) {
        for (const frame of frames) this.load.image(frame.key, frame.url);
        if (studio) {
          this.load.spritesheet(avatarTexture, workspaceStudioAvatar, {
            frameWidth: 48,
            frameHeight: 48,
          });
          if (classicStudio) this.load.image(landscapeTexture, workspaceStudioLandscape);
          if (orthogonalStudio)
            this.load.image(orthogonalOpenAreaTexture, workspaceOrthogonalOpenArea);
        }
        if (svgLayout) {
          for (const type of Object.keys(
            workspaceLayoutArt,
          ) as (keyof typeof workspaceLayoutArt)[]) {
            this.load.image(`workspace-art-${type}`, workspaceArtFor(type, bootstrap.layoutPreset));
          }
        }
      },
      create(this: Phaser.Scene) {
        if (disposed) return;
        const missingLayoutArt =
          svgLayout &&
          Object.keys(workspaceLayoutArt).some(
            (type) => !this.textures.exists(`workspace-art-${type}`),
          );
        if (
          (studio && !this.textures.exists(avatarTexture)) ||
          (classicStudio && !this.textures.exists(landscapeTexture)) ||
          (orthogonalStudio && !this.textures.exists(orthogonalOpenAreaTexture)) ||
          missingLayoutArt ||
          frames.some((frame) => !this.textures.exists(frame.key))
        ) {
          failed();
          return;
        }
        for (const frame of frames)
          this.textures.get(frame.key).setFilter(Phaser.Textures.FilterMode.NEAREST);

        if (studio) this.textures.get(avatarTexture).setFilter(Phaser.Textures.FilterMode.NEAREST);
        const tileSize = geometry.tileSize;
        const mapWidth = geometry.widthTiles * tileSize;
        const mapHeight = geometry.heightTiles * tileSize;
        let paintPending = true;
        let followUntil = 0;
        const invalidate = () => {
          paintPending = true;
        };
        let latest = initialSnapshot;
        if (svgLayout) {
          // Keep input/update at native cadence. Preserve the previous Canvas frame
          // between changes instead of redrawing an unchanged office.
          const render = this.sys.render.bind(this.sys);
          this.sys.render = (renderer) => {
            if (!paintPending && performance.now() >= followUntil) return;
            paintPending = false;
            render(renderer);
          };
          this.scale.on(Phaser.Scale.Events.RESIZE, invalidate);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Phaser.Scale.Events.RESIZE, invalidate);
          });
        }
        const doors = this.add.graphics().setDepth(0);
        const drawDoorStates = (
          states: readonly (
            | WorkspaceRoomDoorVisual
            | {
                label: string;
                bounds: { tx: number; ty: number; width: number; height: number };
                tileSize: number;
                entrances: Array<{
                  side: 'north' | 'south' | 'east' | 'west';
                  at: number;
                  span?: number;
                }>;
                closed: boolean;
              }
          )[],
        ) => {
          invalidate();
          doors.clear();
          const labels: string[] = [];
          for (const state of states) {
            labels.push(`${state.label} door ${state.closed ? 'closed' : 'open'}`);
            for (const entrance of state.entrances) {
              const tile = state.tileSize;
              const opening = tile * (entrance.span ?? 1);
              const { tx, ty, width, height } = state.bounds;
              const horizontal = entrance.side === 'north' || entrance.side === 'south';
              const x = horizontal
                ? entrance.at * tile
                : (entrance.side === 'west' ? tx : tx + width) * tile -
                  (entrance.side === 'east' ? 8 : 0);
              const y = horizontal
                ? (entrance.side === 'north' ? ty : ty + height) * tile -
                  (entrance.side === 'south' ? 8 : 0)
                : entrance.at * tile;
              doors.fillStyle(0x8e5a30, 1);
              if (state.closed) {
                doors.fillRect(x, y, horizontal ? opening : 8, horizontal ? 8 : opening);
                doors.fillStyle(0xe8a876, 1);
                doors.fillRect(
                  x + 2,
                  y + 2,
                  horizontal ? opening - 4 : 4,
                  horizontal ? 4 : opening - 4,
                );
                doors.fillStyle(0x8fa3b8, 1);
                doors.fillRect(
                  horizontal ? x + opening - 8 : x + 2,
                  horizontal ? y + 2 : y + opening / 2 - 2,
                  3,
                  4,
                );
              } else if (svgLayout) {
                continue;
              } else if (horizontal) {
                doors.fillRect(x, y, 7, 8);
                doors.fillRect(x + tile - 7, y, 7, 8);
              } else {
                doors.fillRect(x, y, 8, 7);
                doors.fillRect(x, y + tile - 7, 8, 7);
              }
            }
          }
          this.game.canvas?.setAttribute('role', 'img');
          this.game.canvas?.setAttribute(
            'aria-label',
            `${svgLayout ? 'Live workspace floor plan.' : 'Live Commons office map.'} ${labels.join('. ')}`,
          );
        };
        const drawMeetingDoors = (zones: MeetingZones['zones']) =>
          drawDoorStates(
            zones.map(({ label, bounds, tileSize, entrances, occupancy }) => ({
              label,
              bounds,
              tileSize,
              entrances,
              closed: occupancy.length > 0,
            })),
          );
        this.game.canvas?.setAttribute('data-map-version', bootstrap.mapVersion);
        if (svgLayout) {
          this.game.canvas?.setAttribute(
            'data-private-office-count',
            String(svgLayout.filter(({ templateId }) => templateId === 'private-office').length),
          );
        }
        const lighting = this.add.graphics().setDepth(10_000_000);
        const drawLighting = (zone: WorkspaceRoomLight | null) => {
          invalidate();
          lighting.clear();
          if (!zone) {
            if (this.game.canvas) {
              delete this.game.canvas.dataset.roomLighting;
              delete this.game.canvas.dataset.activeRoomId;
              delete this.game.canvas.dataset.activeRoomLabel;
            }
            return;
          }
          if (this.game.canvas) {
            this.game.canvas.dataset.roomLighting = 'dimmed';
            this.game.canvas.dataset.activeRoomId = zone.roomId;
            this.game.canvas.dataset.activeRoomLabel = zone.label;
          }
          const { tx, ty, width, height } = zone.bounds;
          const x = Math.max(0, tx * zone.tileSize - 24);
          const y = Math.max(0, ty * zone.tileSize - 42);
          const right = Math.min(mapWidth, (tx + width) * zone.tileSize + 24);
          const bottom = Math.min(mapHeight, (ty + height) * zone.tileSize + 12);
          const roomHeight = bottom - y;
          const dim = (left: number, top: number, w: number, h: number) => {
            if (w > 0 && h > 0) lighting.fillStyle(0x101820, 0.28).fillRect(left, top, w, h);
          };
          dim(0, 0, mapWidth, y);
          dim(0, y, x, roomHeight);
          dim(right, y, mapWidth - right, roomHeight);
          dim(0, bottom, mapWidth, mapHeight - bottom);
        };
        const drawWorkspaceRoomVisuals = (snapshot: WorldSnapshot) => {
          if (!svgLayout) return;
          const state = workspaceRoomVisuals(
            svgLayout,
            bootstrap.layoutPreset,
            snapshot.participants,
            localParticipationId,
          );
          drawDoorStates(state.doors);
          drawLighting(state.activeRoom);
        };
        const meetingRoomLight = (zone: MeetingZones['zones'][number] | null) =>
          zone
            ? {
                roomId: zone.zoneId,
                label: zone.label,
                bounds: zone.bounds,
                tileSize: zone.tileSize,
              }
            : null;
        if (svgLayout) {
          drawWorkspaceRoomVisuals(initialSnapshot);
          applyMeetingZones = () => drawWorkspaceRoomVisuals(latest);
          applyCurrentMeetingZone = () => drawWorkspaceRoomVisuals(latest);
        } else {
          drawMeetingDoors(initialMeetingZones);
          drawLighting(meetingRoomLight(initialCurrentMeetingZone));
          applyMeetingZones = drawMeetingDoors;
          applyCurrentMeetingZone = (zone) => drawLighting(meetingRoomLight(zone));
        }

        if (svgLayout) {
          // Corridor patterns and room art are immutable after bootstrap. Rasterize them once.
          const floor = this.textures.createCanvas('workspace-floor', mapWidth, mapHeight);
          if (!floor) {
            failed();
            return;
          }
          const context = floor.getContext();
          context.imageSmoothingEnabled = false;
          context.fillStyle = '#e4eae1';
          context.fillRect(0, 0, mapWidth, mapHeight);
          // All floor sources come from Phaser's image loader.
          const texture = (key: string) =>
            this.textures.get(key).getSourceImage() as HTMLImageElement;
          const corridor = context.createPattern(texture('workspace-art-corridor'), 'repeat');
          if (corridor) {
            context.fillStyle = corridor;
            for (const segment of getWorkspaceLayoutProfile(bootstrap.layoutPreset).corridors) {
              context.save();
              context.translate(segment.tx * tileSize, segment.ty * tileSize);
              context.fillRect(0, 0, segment.width * tileSize, segment.height * tileSize);
              context.restore();
            }
          }
          if (classicStudio) {
            context.drawImage(
              texture(landscapeTexture),
              WORKSPACE_STUDIO_LANDSCAPE.tx * tileSize,
              WORKSPACE_STUDIO_LANDSCAPE.ty * tileSize,
            );
          }
          if (studio) this.game.canvas?.setAttribute('data-avatar-style', 'studio');
          if (orthogonalStudio) {
            const { tx, ty, width } = WORKSPACE_STUDIO_OPEN_AREA;
            context.drawImage(
              texture(orthogonalOpenAreaTexture),
              tx * tileSize,
              (ty - 1) * tileSize,
            );
            context.fillStyle = '#344a41';
            context.font = '20px Arial, sans-serif';
            context.textAlign = 'center';
            context.fillText('Open area', (tx + width / 2) * tileSize, (ty + 1.875) * tileSize);
          }
          for (const placement of svgLayout) {
            const template = getWorkspaceLayoutTemplate(
              placement.templateId,
              bootstrap.layoutPreset,
            );
            const x = placement.origin.tx * tileSize;
            const y = placement.origin.ty * tileSize;
            context.drawImage(
              texture(`workspace-art-${placement.templateId}`),
              x,
              y,
              template.width * tileSize,
              template.height * tileSize,
            );
            if (placement.templateId !== 'reception') continue;
            this.add
              .text(
                x + (template.width * tileSize) / 2,
                orthogonalStudio && placement.id === 'reception'
                  ? y + (template.height - 1.4) * tileSize
                  : template.door.side === 'north'
                    ? y + template.height * tileSize + 8
                    : y - (bootstrap.layoutPreset ? 25 : 20),
                'Reception',
                {
                  fontFamily: 'Arial, sans-serif',
                  fontSize: bootstrap.layoutPreset ? '20px' : '14px',
                  color: '#344a41',
                },
              )
              .setOrigin(0.5, 0)
              .setDepth(-80);
          }
          floor.refresh();
          this.add.image(0, 0, 'workspace-floor').setOrigin(0).setDepth(-100);
        } else {
          const ground = this.add.graphics().setDepth(-100);
          ground.fillStyle(0xe5e7d8).fillRect(0, 0, mapWidth, mapHeight);
          ground.lineStyle(1, 0xd5d8cb, 0.55);
          for (let tx = 0; tx <= geometry.widthTiles; tx += 1)
            ground.lineBetween(tx * tileSize, 0, tx * tileSize, mapHeight);
          for (let ty = 0; ty <= geometry.heightTiles; ty += 1)
            ground.lineBetween(0, ty * tileSize, mapWidth, ty * tileSize);

          for (const zone of geometry.zones) {
            const { tx, ty, width, height } = zone.bounds;
            const area = this.add.graphics().setDepth(-90);
            area.fillStyle(zone.kind === 'meeting' ? 0xe9d7ad : 0xc9dfd0, 0.72);
            area.fillRect(tx * tileSize, ty * tileSize, width * tileSize, height * tileSize);
            area.lineStyle(2, zone.kind === 'meeting' ? 0xb69a62 : 0x83a894, 0.8);
            area.strokeRect(tx * tileSize, ty * tileSize, width * tileSize, height * tileSize);
            this.add
              .text((tx + width / 2) * tileSize, ty * tileSize + 5, zone.label, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '11px',
                color: '#53665a',
                align: 'center',
              })
              .setOrigin(0.5, 0)
              .setDepth(-80);
          }
        }

        const proximityAreas = this.add.graphics().setDepth(-85);
        const drawAreas = (areas: ConversationAreas['areas']) => {
          invalidate();
          proximityAreas.clear();
          const colors = [0x52d5b7, 0xa68aff, 0xffbd66, 0x69b9ff, 0xff83a4];
          for (const area of areas) {
            const color =
              colors[
                [...area.areaId].reduce((hash, char) => hash + char.charCodeAt(0), 0) %
                  colors.length
              ]!;
            proximityAreas
              .fillStyle(color, 0.035)
              .fillCircle(area.center.x, area.center.y, area.radius);
            proximityAreas.fillStyle(color, 0.95);
            const dotCount = Math.min(
              128,
              Math.max(36, Math.ceil((2 * Math.PI * area.radius) / 12)),
            );
            for (let index = 0; index < dotCount; index += 1) {
              const angle = (index / dotCount) * 2 * Math.PI;
              proximityAreas.fillCircle(
                area.center.x + Math.cos(angle) * area.radius,
                area.center.y + Math.sin(angle) * area.radius,
                1.5,
              );
            }
          }
        };
        drawAreas(initialAreas);
        applyAreas = drawAreas;

        if (!svgLayout) {
          const walls = this.add.graphics().setDepth(-20);
          walls.lineStyle(4, 0x36584b, 1);
          for (const [from, to] of geometry.blockedEdges) {
            if (from.tx === to.tx) {
              const left = from.tx * tileSize;
              const top = Math.max(from.ty, to.ty) * tileSize;
              walls.lineBetween(left, top, left + tileSize, top);
            } else {
              const left = Math.max(from.tx, to.tx) * tileSize;
              const top = from.ty * tileSize;
              walls.lineBetween(left, top, left, top + tileSize);
            }
          }

          const table = assets.objectFrames.find(
            (frame) => frame.spriteId === catalog.bindings.tableSpriteId,
          )!;
          const chair = assets.objectFrames.find(
            (frame) => frame.spriteId === catalog.bindings.chairBackrestSpriteId,
          )!;
          for (const object of geometry.objects) {
            if (!catalog.bindings.tableObjectIds.includes(object.objectId)) continue;
            const minX = Math.min(...object.blockedTiles.map((tile) => tile.tx)) * tileSize;
            const minY = Math.min(...object.blockedTiles.map((tile) => tile.ty)) * tileSize;
            this.add
              .image(minX + table.footOrigin.x, minY + table.footOrigin.y, table.key)
              .setOrigin(table.footOrigin.x / table.width, table.footOrigin.y / table.height)
              .setDepth(catalog.drawOrder.indexOf(table.role) * 100_000 + minY);
            for (const seat of object.seats) {
              const x = (seat.tile.tx + 0.5) * tileSize;
              const y = (seat.tile.ty + 0.5) * tileSize;
              this.add
                .image(x, y, chair.key)
                .setOrigin(chair.footOrigin.x / chair.width, chair.footOrigin.y / chair.height)
                .setDepth(catalog.drawOrder.indexOf(chair.role) * 100_000 + y);
            }
          }
        }

        const avatars = new Map<string, AvatarView>();
        let followedAvatar: Phaser.GameObjects.Image | null = null;
        const seatDefinitions = geometry.objects.flatMap(({ seats }) => seats);
        const navigationBounds = { width: mapWidth, height: mapHeight };
        const navigationCollision = createTileCollision({
          blockedEdges: geometry.blockedEdges,
          blockedTiles: [
            ...('blockedTiles' in geometry ? (geometry.blockedTiles ?? []) : []),
            ...geometry.objects.flatMap(({ blockedTiles }) => blockedTiles),
          ],
        });
        const keyFor = ({ tx, ty }: TilePoint) => `${tx},${ty}`;
        const currentSelf = () =>
          latest.participants.find(
            ({ participationId }) => participationId === localParticipationId,
          );
        type Route = {
          tiles: TilePoint[];
          memberId?: string;
          seatId?: string;
          lastProgressAt: number;
          lastPosition: { x: number; y: number };
          goalKey: string;
          goalStableSince: number;
          sentWaypoint?: TilePoint;
          sentAt: number;
        };
        let route: Route | null = null;
        const stopRoute = (result: NavigationResult) => {
          if (route?.sentWaypoint) onMovement(0, 0);
          if (route?.memberId) actions.onNavigationResult?.(route.memberId, result);
          route = null;
        };
        const startRoute = (target: TilePoint, memberId?: string, seatId?: string) => {
          const self = currentSelf();
          if (!self || self.seatId || self.availability === 'away') return;
          const occupied = new Set(
            latest.seats
              .filter(
                ({ occupantParticipationId }) =>
                  occupantParticipationId && occupantParticipationId !== localParticipationId,
              )
              .flatMap(({ seatId }) => {
                const seat = seatDefinitions.find((entry) => entry.seatId === seatId);
                return seat ? [keyFor(seat.tile)] : [];
              }),
          );
          if (memberId) occupied.add(keyFor(target));
          const tiles = workspaceRoute(
            pixelToTile(self.position),
            target,
            navigationBounds,
            navigationCollision,
            { occupied, adjacent: !!memberId },
          );
          if (!tiles) {
            if (route?.sentWaypoint) onMovement(0, 0);
            route = null;
            if (memberId) actions.onNavigationResult?.(memberId, 'unavailable');
            return;
          }
          if (route?.sentWaypoint) onMovement(0, 0);
          route = {
            tiles: tiles.length || memberId ? tiles : [target],
            memberId,
            seatId,
            lastProgressAt: this.time.now,
            lastPosition: self.position,
            goalKey: keyFor(target),
            goalStableSince: this.time.now,
            sentAt: Number.NEGATIVE_INFINITY,
          };
          if (memberId) actions.onNavigationResult?.(memberId, 'moving');
        };
        let follow = !svgLayout;
        const camera = this.cameras.main;
        if (svgLayout) camera.setBounds(0, 0, mapWidth, mapHeight);
        const updateCamera = () => {
          const image = avatars.get(localParticipationId)?.image;
          if (follow && image) {
            if (image !== followedAvatar) {
              camera.startFollow(image, false, 0.12, 0.12);
              followedAvatar = image;
            }
          } else if (followedAvatar) {
            camera.stopFollow();
            followedAvatar = null;
          }
        };
        applyFollow = (next) => {
          invalidate();
          followUntil = next ? performance.now() + 800 : 0;
          follow = next;
          camera.setZoom(next ? 1.85 : 1);
          updateCamera();
          if (!next) camera.centerOn(mapWidth / 2, mapHeight / 2);
          this.game.canvas.dataset.cameraZoom = camera.zoom.toFixed(2);
          this.game.canvas.dataset.cameraPan = `${Math.round(camera.scrollX)},${Math.round(camera.scrollY)}`;
        };
        applyNavigation = (target) => {
          if (!target) {
            if (route?.memberId) stopRoute('stopped');
            return;
          }
          parent.parentElement?.focus({ preventScroll: true });
          startRoute(pixelToTile(target), target.participantId);
        };
        if (svgLayout) {
          const pointerOnCanvas = (pointer: Phaser.Input.Pointer) => {
            const event = pointer.event;
            const native = event && 'changedTouches' in event ? event.changedTouches[0] : event;
            const canvas = this.game.canvas;
            const rect = canvas.getBoundingClientRect();
            if (native && 'clientX' in native && rect.width > 0 && rect.height > 0) {
              return {
                x: ((native.clientX - rect.left) * canvas.width) / rect.width,
                y: ((native.clientY - rect.top) * canvas.height) / rect.height,
              };
            }
            return { x: pointer.x, y: pointer.y };
          };
          let dragStart: { x: number; y: number } | undefined;
          let dragged = false;
          const cameraChanged = () => {
            invalidate();
            this.game.canvas.dataset.cameraZoom = camera.zoom.toFixed(2);
            this.game.canvas.dataset.cameraPan = `${Math.round(camera.scrollX)},${Math.round(camera.scrollY)}`;
          };
          const stopFollowing = () => {
            if (!follow) return;
            follow = false;
            followUntil = 0;
            updateCamera();
            actions.onManualCamera?.();
          };
          const pan = (dx: number, dy: number) => {
            const scaledWidth = mapWidth / camera.zoom;
            const scaledHeight = mapHeight / camera.zoom;
            camera.centerOn(
              Phaser.Math.Clamp(
                camera.midPoint.x + dx,
                scaledWidth / 2,
                mapWidth - scaledWidth / 2,
              ),
              Phaser.Math.Clamp(
                camera.midPoint.y + dy,
                scaledHeight / 2,
                mapHeight - scaledHeight / 2,
              ),
            );
            cameraChanged();
          };
          this.input.on(
            'wheel',
            (pointer: Phaser.Input.Pointer, _objects: unknown, dx: number, dy: number) => {
              stopFollowing();
              if (dx || pointer.event?.shiftKey) {
                pan(dx || dy, dx ? dy : 0);
                return;
              }
              const point = pointerOnCanvas(pointer);
              const before = camera.getWorldPoint(point.x, point.y);
              const zoom = Phaser.Math.Clamp(camera.zoom * Math.exp(-dy * 0.0015), 1, 3);
              camera.setZoom(zoom);
              const halfWidth = mapWidth / (2 * zoom);
              const halfHeight = mapHeight / (2 * zoom);
              camera.centerOn(
                Phaser.Math.Clamp(
                  before.x - (point.x - mapWidth / 2) / zoom,
                  halfWidth,
                  mapWidth - halfWidth,
                ),
                Phaser.Math.Clamp(
                  before.y - (point.y - mapHeight / 2) / zoom,
                  halfHeight,
                  mapHeight - halfHeight,
                ),
              );
              cameraChanged();
            },
          );
          this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            dragStart = pointerOnCanvas(pointer);
            dragged = false;
          });
          this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!dragStart || !pointer.isDown || camera.zoom <= 1) return;
            const point = pointerOnCanvas(pointer);
            const dx = dragStart.x - point.x;
            const dy = dragStart.y - point.y;
            if (!dragged && Math.hypot(dx, dy) < 5) return;
            dragged = true;
            stopFollowing();
            pan(dx / camera.zoom, dy / camera.zoom);
            dragStart = point;
          });
          this.input.on('pointerupoutside', () => {
            dragStart = undefined;
          });
          this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const startedInside = Boolean(dragStart);
            dragStart = undefined;
            if (!startedInside || dragged || pointer.button !== 0) return;
            parent.parentElement?.focus({ preventScroll: true });
            const point = pointerOnCanvas(pointer);
            if (point.x < 0 || point.y < 0 || point.x >= mapWidth || point.y >= mapHeight) return;
            const target = camera.getWorldPoint(point.x, point.y);
            for (const [id, view] of avatars) {
              if (
                id !== localParticipationId &&
                view.image.getBounds().contains(target.x, target.y)
              ) {
                actions.onSelect?.(id, parent.parentElement ?? undefined);
                return;
              }
            }
            const self = currentSelf();
            if (self?.seatId) return;
            const tile = pixelToTile(target);
            this.game.canvas.dataset.lastClickedTile = keyFor(tile);
            const seat = seatDefinitions.find((entry) => keyFor(entry.tile) === keyFor(tile));
            startRoute(tile, undefined, seat?.seatId);
          });
          this.input.keyboard?.on('keydown-E', () => {
            if (!parent.parentElement?.contains(document.activeElement)) return;
            const self = currentSelf();
            if (!self) return;
            if (self.seatId) {
              actions.onStand?.();
              return;
            }
            const here = pixelToTile(self.position);
            const seat = seatDefinitions.find(
              (entry) =>
                adjacentSeat(here, entry.tile, navigationBounds, navigationCollision) &&
                latest.seats.some(
                  ({ seatId, occupantParticipationId }) =>
                    seatId === entry.seatId && !occupantParticipationId,
                ),
            );
            if (seat) startRoute(here, undefined, seat.seatId);
          });
        }
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const avatarDepth = catalog.drawOrder.indexOf('avatar') * 100_000;
        let speakerIds = new Set<string>();
        const placeSpeechBadge = (view: AvatarView) => {
          const { image, speech } = view;
          speech?.badge
            .setPosition(image.x + (studio ? 21 : 16), image.y - (studio ? 35 : 25))
            .setDepth(image.depth + 2);
        };
        const drawSpeakers = (time: number) => {
          const phase = reduceMotion.matches ? -1 : Math.floor(time / 110) % 4;
          for (const id of speakerIds) {
            const view = avatars.get(id);
            if (!view) continue;
            if (!view.speech) {
              view.speech = { badge: this.add.graphics(), phase: Number.NaN };
              placeSpeechBadge(view);
            }
            const { badge } = view.speech;
            if (view.speech.phase === phase) continue;
            view.speech.phase = phase;
            const heights = phase === -1 ? [6, 12, 8] : speechBarHeights[phase]!;
            badge.clear();
            badge.fillStyle(0xffffff).fillRoundedRect(-12, -10, 24, 20, 4);
            badge.fillStyle(0x145f45).fillRoundedRect(-10, -8, 20, 16, 3);
            badge.fillStyle(0xe1ffe2);
            heights.forEach((height, index) => {
              badge.fillRect(-7 + 5 * index, -height / 2, 4, height);
            });
            invalidate();
          }
        };
        applySpeakers = (ids) => {
          const nextIds = new Set(ids);
          for (const id of speakerIds) {
            if (nextIds.has(id)) continue;
            const view = avatars.get(id);
            if (!view?.speech) continue;
            view.speech.badge.destroy();
            delete view.speech;
            invalidate();
          }
          speakerIds = nextIds;
          drawSpeakers(this.time.now);
        };
        const displayPosition = (id: string, view: AvatarView, x: number, y: number) => {
          const distance = Math.hypot(view.image.x - x, view.image.y - y);
          if (!distance) return;
          const motion = view.motion;
          const now = this.time.now;
          if (!motion.seated && !reduceMotion.matches) {
            if (now - motion.movedAt >= 240) motion.walkDistance = 0;
            motion.walkDistance += distance;
            motion.movedAt = now;
          }
          view.image.setPosition(x, y).setDepth(avatarDepth + y);
          view.name.setPosition(x, y - (studio ? 47 : 35)).setDepth(avatarDepth + y + 1);
          placeSpeechBadge(view);
          invalidate();
          if (follow && id === localParticipationId) followUntil = performance.now() + 800;
        };
        const drawSnapshot = (snapshot: WorldSnapshot) => {
          const receivedAt = performance.now();
          latest = snapshot;
          if (route?.memberId) {
            const memberId = route.memberId;
            const target = snapshot.participants.find(
              ({ participationId }) => participationId === memberId,
            );
            if (!target || target.availability === 'away') stopRoute('unavailable');
            else {
              const tile = pixelToTile(target.position);
              if (keyFor(tile) !== route.goalKey) startRoute(tile, memberId);
            }
          }
          const ids = new Set(
            snapshot.participants.map((participant) => participant.participationId),
          );
          for (const [id, view] of avatars) {
            if (!ids.has(id)) {
              invalidate();
              view.image.destroy();
              view.name.destroy();
              view.speech?.badge.destroy();
              avatars.delete(id);
            }
          }
          for (const participant of snapshot.participants) {
            const frame = avatarFrame(
              assets,
              participant.appearance,
              participant.seatId ? 'sitting' : 'standing',
              participant.facing,
            );
            let view = avatars.get(participant.participationId);
            if (!view) {
              invalidate();
              const image = this.add
                .image(
                  participant.position.x,
                  participant.position.y,
                  studio ? avatarTexture : frame.key,
                )
                .setOrigin(
                  studio ? 24 / 48 : frame.footOrigin.x / frame.width,
                  studio ? 43 / 48 : frame.footOrigin.y / frame.height,
                );
              const name = this.add
                .text(
                  participant.position.x,
                  participant.position.y - (studio ? 47 : 35),
                  participant.displayName,
                  {
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '10px',
                    color: '#26352e',
                    backgroundColor: '#fffdf0',
                    padding: { x: 3, y: 2 },
                  },
                )
                .setOrigin(0.5, 1);
              view = {
                image: image.setDepth(avatarDepth + participant.position.y),
                name: name.setDepth(avatarDepth + participant.position.y + 1),
                ...(orthogonalStudio && {
                  playback: new AvatarPositionPlayback(participant.position, receivedAt),
                }),
                motion: {
                  facing: participant.facing,
                  displayedFacing: participant.facing,
                  seated: !!participant.seatId,
                  movedAt: Number.NEGATIVE_INFINITY,
                  walkDistance: 0,
                  frame: -1,
                },
              };
              avatars.set(participant.participationId, view);
            }
            if (studio) {
              const motion = view.motion;
              const seated = participant.seatId !== null;
              const seatChanged = seated !== motion.seated;
              const last = view.playback?.latest();
              const jumped =
                last &&
                Math.hypot(last.x - participant.position.x, last.y - participant.position.y) >
                  tileSize * 2;
              const snap = seatChanged || seated || !!jumped || reduceMotion.matches;
              motion.facing = participant.facing;
              motion.seated = seated;
              if (snap) {
                motion.displayedFacing = participant.facing;
                motion.movedAt = Number.NEGATIVE_INFINITY;
                motion.walkDistance = 0;
              }
              view.playback?.record(participant.position, receivedAt, snap);
              if (!view.playback || snap)
                displayPosition(
                  participant.participationId,
                  view,
                  participant.position.x,
                  participant.position.y,
                );
              if (snap) motion.movedAt = Number.NEGATIVE_INFINITY;
            } else {
              if (view.image.texture.key !== frame.key) {
                invalidate();
                view.image
                  .setTexture(frame.key)
                  .setOrigin(frame.footOrigin.x / frame.width, frame.footOrigin.y / frame.height);
              }
              displayPosition(
                participant.participationId,
                view,
                participant.position.x,
                participant.position.y,
              );
            }
            if (view.name.text !== participant.displayName) {
              invalidate();
              view.name.setText(participant.displayName);
            }
          }
          const local = snapshot.participants.find(
            ({ participationId }) => participationId === localParticipationId,
          );
          if (svgLayout) drawWorkspaceRoomVisuals(snapshot);
          if (local && bootstrap.layoutPreset) {
            this.game.canvas?.setAttribute(
              'data-local-tile',
              `${Math.floor(local.position.x / tileSize)},${Math.floor(local.position.y / tileSize)}`,
            );
          }
          updateCamera();
        };
        drawSnapshot(initialSnapshot);
        applySnapshot = drawSnapshot;
        ready();

        const keys = this.input.keyboard?.createCursorKeys();
        const wasd = this.input.keyboard?.addKeys('W,A,S,D') as
          Record<string, Phaser.Input.Keyboard.Key> | undefined;
        let lastInputAt = 0;
        let lastDx = 0;
        let lastDy = 0;
        this.events.on('update', (time: number) => {
          const focused = parent.parentElement?.contains(document.activeElement);
          const dx = !focused
            ? 0
            : Number(Boolean(keys?.right?.isDown || wasd?.['D']?.isDown)) -
              Number(Boolean(keys?.left?.isDown || wasd?.['A']?.isDown));
          const dy = !focused
            ? 0
            : Number(Boolean(keys?.down?.isDown || wasd?.['S']?.isDown)) -
              Number(Boolean(keys?.up?.isDown || wasd?.['W']?.isDown));
          if (studio) {
            const now = performance.now();
            for (const [id, view] of avatars) {
              const { image, motion, playback } = view;
              if (playback) {
                const confirmed = playback.latest();
                const position = reduceMotion.matches ? confirmed : playback.positionAt(now);
                // Use the heading of the visible segment while a newer server
                // turn is still buffered, then restore the confirmed heading.
                motion.displayedFacing =
                  !motion.seated && !reduceMotion.matches
                    ? playbackFacing(
                        image,
                        position,
                        position.x === confirmed.x && position.y === confirmed.y
                          ? motion.facing
                          : motion.displayedFacing,
                      )
                    : motion.facing;
                displayPosition(id, view, position.x, position.y);
              }
              const walking = time - motion.movedAt < 240;
              const column = motion.seated
                ? 3
                : walking && !reduceMotion.matches
                  ? 1 + (Math.floor(motion.walkDistance / 20) % 2)
                  : 0;
              const facing = playback ? motion.displayedFacing : motion.facing;
              const nextFrame = avatarRows[facing] * 4 + column;
              if (nextFrame !== motion.frame) {
                invalidate();
                image.setFrame(nextFrame);
                motion.frame = nextFrame;
                if (id === localParticipationId) {
                  this.game.canvas.dataset.avatarPose = motion.seated
                    ? 'seated'
                    : column
                      ? 'walking'
                      : 'idle';
                  this.game.canvas.dataset.avatarFacing = facing;
                }
              }
            }
          }
          if (speakerIds.size) drawSpeakers(time);
          if ((dx || dy) && route) stopRoute('stopped');
          const self = currentSelf();
          if (route && self && !self.seatId) {
            const next = route.tiles[0];
            const enteredSeatTile =
              next &&
              route.seatId &&
              route.tiles.length === 1 &&
              keyFor(pixelToTile(self.position)) === keyFor(next);
            if (!next || enteredSeatTile) {
              // A moving member can cross into another tile before its next world update arrives.
              if (route.memberId && time - route.goalStableSince < 300) return;
              lastDx = 0;
              lastDy = 0;
              const seatId = route.seatId;
              stopRoute('nearby');
              if (seatId) actions.onSit?.(seatId);
              return;
            }
            if (
              route.lastPosition.x !== self.position.x ||
              route.lastPosition.y !== self.position.y
            ) {
              route.lastPosition = self.position;
              route.lastProgressAt = time;
            }
            const dxToCenter = (next.tx + 0.5) * tileSize - self.position.x;
            const dyToCenter = (next.ty + 0.5) * tileSize - self.position.y;
            if (Math.abs(dxToCenter) < 0.01 && Math.abs(dyToCenter) < 0.01) {
              route.tiles.shift();
              route.lastProgressAt = time;
            } else if (time - route.lastProgressAt > 4_500) {
              stopRoute('stopped');
            } else if (
              route.sentWaypoint !== next ||
              time - Math.max(route.sentAt, route.lastProgressAt) >= 650
            ) {
              // Normal movement sends one command per tile. Recover only when an
              // authoritative waypoint has stopped progressing or never started.
              route.sentAt = time;
              route.sentWaypoint = next;
              onMovement(0, 0, next);
            }
            return;
          }
          if (dx === 0 && dy === 0) {
            if (lastDx !== 0 || lastDy !== 0) onMovement(0, 0);
            lastDx = 0;
            lastDy = 0;
            return;
          }
          if (time - lastInputAt < 100) return;
          lastInputAt = time;
          lastDx = dx;
          lastDy = dy;
          onMovement(dx as -1 | 0 | 1, dy as -1 | 0 | 1);
        });
      },
    },
  });
  const cleanup = createCommonsSceneCleanup(game, parent);
  const updateSnapshot = (snapshot: WorldSnapshot) => applySnapshot(snapshot);
  return {
    cleanup: () => {
      disposed = true;
      cleanup();
    },
    setFollow: (follow) => applyFollow(follow),
    navigate: (target) => applyNavigation(target),
    updateSnapshot,
    updateSpeakers: (ids) => applySpeakers(ids),
    updateAreas: (areas: ConversationAreas['areas']) => applyAreas(areas),
    updateMeetingZones: (zones: MeetingZones['zones']) => applyMeetingZones(zones),
    updateCurrentMeetingZone: (zone) => applyCurrentMeetingZone(zone),
  };
}

type Props = {
  navigationTarget?: NavigationTarget;
  actions?: SceneActions;
  bootstrap: OfficeBootstrapResponse;
  snapshot: WorldSnapshot;
  speakingIds: readonly string[];
  localParticipationId: string;
  onMovement: Movement;
  conversationAreas: ConversationAreas['areas'];
  meetingZones: MeetingZones['zones'];
  currentMeetingZone: MeetingZones['zones'][number] | null;
};

export function LiveCommonsScene({
  bootstrap,
  snapshot,
  speakingIds,
  localParticipationId,
  onMovement,
  conversationAreas,
  meetingZones,
  currentMeetingZone,
  navigationTarget,
  actions,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const currentActions = useRef(actions);
  currentActions.current = actions;
  const renderer = useRef<ReturnType<typeof mountScene> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [follow, setFollow] = useState(false);
  const firstSnapshot = useRef(snapshot);
  const latestSnapshot = useRef(snapshot);
  const latestSpeakers = useRef(speakingIds);
  const movement = useRef(onMovement);
  const latestAreas = useRef(conversationAreas);
  const firstAreas = useRef(conversationAreas);
  const latestMeetingZones = useRef(meetingZones);
  const firstMeetingZones = useRef(meetingZones);
  const latestCurrentMeetingZone = useRef(currentMeetingZone);
  const firstCurrentMeetingZone = useRef(currentMeetingZone);
  latestSnapshot.current = snapshot;
  latestSpeakers.current = speakingIds;
  movement.current = onMovement;
  latestAreas.current = conversationAreas;
  latestMeetingZones.current = meetingZones;
  latestCurrentMeetingZone.current = currentMeetingZone;

  useEffect(() => {
    const parent = document.createElement('div');
    host.current?.appendChild(parent);
    let mounted: ReturnType<typeof mountScene> | undefined;
    try {
      mounted = mountScene(
        parent,
        bootstrap,
        firstSnapshot.current,
        localParticipationId,
        () => {
          setStatus('ready');
          renderer.current?.updateSnapshot(latestSnapshot.current);
          renderer.current?.updateSpeakers(latestSpeakers.current);
          renderer.current?.updateAreas(latestAreas.current);
          renderer.current?.updateMeetingZones(latestMeetingZones.current);
          renderer.current?.updateCurrentMeetingZone(latestCurrentMeetingZone.current);
        },
        () => setStatus('error'),
        (dx, dy, waypoint) => movement.current(dx, dy, waypoint),
        firstAreas.current,
        firstMeetingZones.current,
        firstCurrentMeetingZone.current,
        {
          onSit: (id) => currentActions.current?.onSit?.(id),
          onStand: () => currentActions.current?.onStand?.(),
          onSelect: (id, trigger) => currentActions.current?.onSelect?.(id, trigger),
          onNavigationResult: (id, result) =>
            currentActions.current?.onNavigationResult?.(id, result),
          onManualCamera: () => setFollow(false),
        },
      );
      renderer.current = mounted;
    } catch {
      setStatus('error');
    }
    return () => {
      renderer.current = null;
      if (mounted) mounted.cleanup();
      else parent.remove();
    };
  }, [bootstrap]);

  useEffect(() => {
    renderer.current?.navigate(navigationTarget);
  }, [navigationTarget]);

  useEffect(() => {
    renderer.current?.updateSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    renderer.current?.updateSpeakers(speakingIds);
  }, [speakingIds]);

  useEffect(() => {
    renderer.current?.updateAreas(conversationAreas);
  }, [conversationAreas]);

  useEffect(() => {
    renderer.current?.updateMeetingZones(meetingZones);
  }, [meetingZones]);

  useEffect(() => {
    renderer.current?.updateCurrentMeetingZone(currentMeetingZone);
  }, [currentMeetingZone]);

  return (
    <div className="live-commons-scene">
      <p className="commons-scene-status" role="status">
        {status === 'loading'
          ? 'Loading live office…'
          : status === 'error'
            ? 'Could not load the approved office map.'
            : bootstrap.layout
              ? 'Click to walk. Scroll to zoom and drag to pan. Press E at a chair.'
              : 'Live office map. Use arrow keys or WASD to move.'}
      </p>
      {bootstrap.layoutPreset && status === 'ready' && (
        <button
          type="button"
          className="dashboard-secondary workspace-camera-control"
          aria-pressed={follow}
          onClick={() => {
            renderer.current?.setFollow(!follow);
            setFollow(!follow);
            host.current?.focus();
          }}
        >
          {follow ? 'Show overview' : 'Follow me'}
        </button>
      )}
      <div
        className="commons-scene-host"
        role="group"
        tabIndex={0}
        aria-label="Live Commons office map with server-positioned participants"
        onPointerDown={(event) => event.currentTarget.focus()}
        ref={host}
      />
    </div>
  );
}
