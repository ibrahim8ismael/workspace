import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { readPreview } from './data';
import './preview.css';

type Preview = ReturnType<typeof readPreview>;
type Frame = Preview['standing'];
type Pose = 'standing' | 'sitting';

function mountScene(
  parent: HTMLElement,
  ready: (changePose: (pose: Pose) => void) => void,
  failed: () => void,
) {
  const { geometry, room, table, seat, standing, sitting, tableArt, chairArt } = readPreview();
  const frames = [standing, sitting, tableArt, chairArt];
  const size = geometry.tileSize;
  const { tx, ty, width, height } = room.bounds;
  const x = (seat.tile.tx + 0.5) * size;
  const y = (seat.tile.ty + 0.5) * size;
  let disposed = false;
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: (tx + width + 1) * size,
    height: (ty + height + 1) * size,
    backgroundColor: '#d7e5dc',
    pixelArt: true,
    roundPixels: true,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
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
        const floor = this.add.graphics().setDepth(-1);
        floor.fillStyle(0xf3dfba).fillRect(tx * size, ty * size, width * size, height * size);
        floor.lineStyle(4, 0x36584b);
        for (const [from, to] of geometry.blockedEdges) {
          if (from.tx === to.tx) {
            const left = from.tx * size;
            const top = Math.max(from.ty, to.ty) * size;
            floor.lineBetween(left, top, left + size, top);
          } else {
            const left = Math.max(from.tx, to.tx) * size;
            const top = from.ty * size;
            floor.lineBetween(left, top, left, top + size);
          }
        }

        const addImage = (frame: Frame, x: number, y: number) =>
          this.add
            .image(x, y, frame.key)
            .setOrigin(frame.footOrigin.x / frame.width, frame.footOrigin.y / frame.height)
            .setDepth(frame.depth);
        const tableX = Math.min(...table.blockedTiles.map((tile) => tile.tx)) * size;
        const tableY = Math.min(...table.blockedTiles.map((tile) => tile.ty)) * size;
        addImage(tableArt, tableX + tableArt.footOrigin.x, tableY + tableArt.footOrigin.y);
        const avatar = addImage(standing, x, y);
        const chair = addImage(chairArt, x, y).setVisible(false);
        ready((pose) => {
          const frame = pose === 'sitting' ? sitting : standing;
          avatar.setTexture(frame.key);
          avatar.setOrigin(frame.footOrigin.x / frame.width, frame.footOrigin.y / frame.height);
          chair.setVisible(pose === 'sitting');
        });
      },
    },
  });
  return () => {
    disposed = true;
    game.destroy(true);
    // Phaser completes destruction on the next frame. Detach this mount immediately.
    parent.remove();
  };
}

function Scene({ close }: { close: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const changePose = useRef<((pose: Pose) => void) | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pose, setPose] = useState<Pose>('standing');

  useEffect(() => {
    const parent = document.createElement('div');
    host.current?.appendChild(parent);
    let dispose: (() => void) | undefined;
    try {
      dispose = mountScene(
        parent,
        (update) => {
          changePose.current = update;
          setStatus('ready');
        },
        () => setStatus('error'),
      );
    } catch {
      setStatus('error');
    }
    return () => {
      changePose.current = null;
      if (dispose) dispose();
      else parent.remove();
    };
  }, []);

  function choose(next: Pose) {
    if (!changePose.current) return;
    changePose.current(next);
    setPose(next);
  }

  return (
    <>
      <p role="status">
        {status === 'loading'
          ? 'Loading preview…'
          : status === 'error'
            ? 'Could not load the scene.'
            : pose === 'standing'
              ? 'Avatar standing.'
              : 'Avatar sitting.'}
      </p>
      <div
        role="img"
        aria-label="Commons meeting room with a table and an avatar at the first chair"
        ref={host}
      />
      <div className="commons-preview-controls">
        <button
          type="button"
          onClick={() => choose('sitting')}
          disabled={status !== 'ready' || pose === 'sitting'}
        >
          Sit
        </button>
        <button
          type="button"
          onClick={() => choose('standing')}
          disabled={status !== 'ready' || pose === 'standing'}
        >
          Stand
        </button>
        <button type="button" onClick={close}>
          Close preview
        </button>
      </div>
    </>
  );
}

export function CommonsPreview() {
  const [open, setOpen] = useState(true);
  return (
    <main className="commons-preview">
      <h1>Commons renderer preview</h1>
      <p>Northwest meeting room</p>
      {open ? (
        <Scene close={() => setOpen(false)} />
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Open preview
        </button>
      )}
    </main>
  );
}
