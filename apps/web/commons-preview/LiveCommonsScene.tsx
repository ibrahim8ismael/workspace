import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { OfficeBootstrapResponse, WorldSnapshot } from '@gather/contracts';
import { readPreview } from './data';
import { createCommonsSceneCleanup } from './scene-lifecycle';
import './preview.css';

type Assets = ReturnType<typeof readPreview>;
type Frame = Assets['avatarFrames'][number];
type ObjectFrame = Assets['objectFrames'][number];
type Direction = 'north' | 'east' | 'south' | 'west';
type Pose = 'standing' | 'sitting';
type AvatarView = {
  image: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
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
  onMovement: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void,
) {
  const assets = readPreview();
  if (assets.manifest.mapVersion !== bootstrap.mapVersion) {
    failed();
    return { cleanup: () => parent.remove(), updateSnapshot: () => undefined };
  }
  const { geometry, catalog } = assets;
  const frames: Array<Frame | ObjectFrame> = [...assets.avatarFrames, ...assets.objectFrames];
  let disposed = false;
  let applySnapshot: (snapshot: WorldSnapshot) => void = () => undefined;
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: bootstrap.manifest.bounds.width,
    height: bootstrap.manifest.bounds.height,
    backgroundColor: '#d7e5dc',
    pixelArt: true,
    roundPixels: true,
    audio: { noAudio: true },
    input: { keyboard: true, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      preload(this: Phaser.Scene) {
        for (const frame of frames) this.load.image(frame.key, frame.url);
      },
      create(this: Phaser.Scene) {
        if (disposed) return;
        if (frames.some((frame) => !this.textures.exists(frame.key))) {
          failed();
          return;
        }
        for (const frame of frames)
          this.textures.get(frame.key).setFilter(Phaser.Textures.FilterMode.NEAREST);

        const tileSize = geometry.tileSize;
        const mapWidth = geometry.widthTiles * tileSize;
        const mapHeight = geometry.heightTiles * tileSize;
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

        const avatars = new Map<string, AvatarView>();
        let followedAvatar: Phaser.GameObjects.Image | null = null;
        const drawSnapshot = (snapshot: WorldSnapshot) => {
          const ids = new Set(
            snapshot.participants.map((participant) => participant.participationId),
          );
          for (const [id, view] of avatars) {
            if (!ids.has(id)) {
              view.image.destroy();
              view.name.destroy();
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
              const image = this.add
                .image(participant.position.x, participant.position.y, frame.key)
                .setOrigin(frame.footOrigin.x / frame.width, frame.footOrigin.y / frame.height);
              const name = this.add
                .text(
                  participant.position.x,
                  participant.position.y - 35,
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
              view = { image, name };
              avatars.set(participant.participationId, view);
            }
            view.image
              .setTexture(frame.key)
              .setOrigin(frame.footOrigin.x / frame.width, frame.footOrigin.y / frame.height)
              .setPosition(participant.position.x, participant.position.y)
              .setDepth(catalog.drawOrder.indexOf('avatar') * 100_000 + participant.position.y);
            view.name
              .setText(participant.displayName)
              .setPosition(participant.position.x, participant.position.y - 35)
              .setDepth(catalog.drawOrder.indexOf('avatar') * 100_000 + participant.position.y + 1);
          }
          const local = snapshot.participants.find(
            (participant) => participant.participationId === localParticipationId,
          );
          const localView = local && avatars.get(local.participationId);
          if (localView && followedAvatar !== localView.image) {
            this.cameras.main.startFollow(localView.image, false, 0.12, 0.12);
            followedAvatar = localView.image;
          } else if (!localView && followedAvatar) {
            this.cameras.main.stopFollow();
            followedAvatar = null;
          }
        };
        drawSnapshot(initialSnapshot);
        applySnapshot = drawSnapshot;
        ready();

        const keys = this.input.keyboard?.createCursorKeys();
        const wasd = this.input.keyboard?.addKeys('W,A,S,D') as
          Record<string, Phaser.Input.Keyboard.Key> | undefined;
        let lastInputAt = 0;
        this.events.on('update', (time: number) => {
          if (time - lastInputAt < 100) return;
          lastInputAt = time;
          const dx =
            Number(Boolean(keys?.right?.isDown || wasd?.['D']?.isDown)) -
            Number(Boolean(keys?.left?.isDown || wasd?.['A']?.isDown));
          const dy =
            Number(Boolean(keys?.down?.isDown || wasd?.['S']?.isDown)) -
            Number(Boolean(keys?.up?.isDown || wasd?.['W']?.isDown));
          if (dx !== 0 || dy !== 0) onMovement(dx as -1 | 0 | 1, dy as -1 | 0 | 1);
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
    updateSnapshot,
  };
}

type Props = {
  bootstrap: OfficeBootstrapResponse;
  snapshot: WorldSnapshot;
  localParticipationId: string;
  onMovement: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
};

export function LiveCommonsScene({ bootstrap, snapshot, localParticipationId, onMovement }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof mountScene> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const firstSnapshot = useRef(snapshot);
  const latestSnapshot = useRef(snapshot);
  const movement = useRef(onMovement);
  latestSnapshot.current = snapshot;
  movement.current = onMovement;

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
        },
        () => setStatus('error'),
        (dx, dy) => movement.current(dx, dy),
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
    renderer.current?.updateSnapshot(snapshot);
  }, [snapshot]);

  return (
    <div className="live-commons-scene">
      <p className="commons-scene-status" role="status">
        {status === 'loading'
          ? 'Loading live office…'
          : status === 'error'
            ? 'Could not load the approved office map.'
            : 'Live office map. Use arrow keys or WASD to move.'}
      </p>
      <div
        className="commons-scene-host"
        role="img"
        aria-label="Live Commons office map with server-positioned participants"
        ref={host}
      />
    </div>
  );
}
