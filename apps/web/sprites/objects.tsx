import type { ReactNode } from 'react';
import { PixelPlant, PixelTree } from '../PixelPlants';
import { PixelPond } from '../PixelPond';
import { shade } from './pixel';
import { Pixel } from './PixelSprite';
import { furnitureSprite } from './furniture';
import { objectAsset, objectAssetUrl } from './assets';
import { asMapObject } from '../../shared/office-objects.js';
import { REFERENCE_FOREGROUNDS, REFERENCE_OBJECTS } from './referenceArt';
import { artPack } from './artPack';
import { ASSET_SIZES } from './assetSizes';
import { spritePaths } from './pixel';

export type MapObjectData = {
  id: string;
  parent?: string | null;
  kind: string;
  family: string;
  color: string;
  facing: 'Up' | 'Down' | 'Left' | 'Right';
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
  desk?: boolean;
  seat?: number[][];
  blocks?: number[][];
  wall?: boolean;
};

const COLOR: Record<string, string> = {
  white: '#e6e8f2',
  black: '#3a4150',
  grey: '#9aa3ad',
  blue: '#3f7fd8',
  lightblue: '#8fd0ea',
  teal: '#3aa6b5',
  lightteal: '#8ed6dc',
  green: '#5fb85b',
  lightgreen: '#86d26a',
  red: '#e4484f',
  orange: '#e4883b',
  yellow: '#f2c94c',
  purple: '#9b5cd6',
  pink: '#ee6fa6',
  brown: '#a9714b',
  coffee: '#c99a6a',
  lightcoffee: '#e2b98b',
};
const FAMILY_FALLBACK: Record<string, string> = {
  Tree: '#5faa5e',
  'Room Plant': '#5fb85b',
  'Desk Plant': '#6cc26a',
  'Ground Plant': '#58b357',
  Desk: '#e6e8f2',
  Chair: '#3a4150',
};

/** Objects that reuse existing original artwork until their dedicated sprite exists. */
function legacy(object: MapObjectData): ReactNode | null {
  const foot = { x: object.originX, y: object.originY };
  switch (object.kind) {
    case 'pine-tree-large':
      return (
        <g transform={`translate(${foot.x} ${object.h - 8}) scale(${object.h / 118})`}>
          <PixelTree variant="pine" />
        </g>
      );
    case 'pine-tree-small':
      return (
        <g transform={`translate(${foot.x} ${object.h - 6}) scale(${object.h / 118})`}>
          <PixelTree variant="pine" />
        </g>
      );
    case 'birch-tree':
      return (
        <g transform={`translate(${foot.x} ${object.h - 10}) scale(${object.h / 118})`}>
          <PixelTree variant="birch" />
        </g>
      );
    case 'maple-tree':
      return (
        <g transform={`translate(${foot.x} ${object.h - 10}) scale(${object.h / 118})`}>
          <PixelTree variant="round" />
        </g>
      );
    case 'ficus':
    case 'fiddle-leaf-fig':
    case 'bird-of-paradise-green':
    case 'bamboo-planter':
    case 'philodendron':
    case 'ceramic-planter':
      return (
        <g transform={`translate(${foot.x} ${object.h - 2}) scale(${Math.min(1, object.h / 60)})`}>
          <PixelPlant large={object.h > 40} />
        </g>
      );
    case 'koi-pond':
      return (
        <g transform={`translate(${-734 + 2} ${-162 + 2}) scale(${object.w / 132})`}>
          <PixelPond />
        </g>
      );
    default:
      return null;
  }
}

/** Generic silhouette for objects without dedicated artwork: keeps the reference footprint and palette. */
function Placeholder({ object }: { object: MapObjectData }) {
  const base = COLOR[object.color] ?? FAMILY_FALLBACK[object.family] ?? '#8a93a8';
  const top = Math.max(2, Math.round(object.h * 0.3));
  return (
    <g>
      <rect x="0" y="0" width={object.w} height={object.h} fill={shade(base, 0.55)} />
      <rect x="1" y="1" width={object.w - 2} height={object.h - 2} fill={base} />
      <rect x="1" y="1" width={object.w - 2} height={top} fill={shade(base, 1.18)} />
      <rect x="1" y={object.h - 3} width={object.w - 2} height="2" fill={shade(base, 0.7)} />
    </g>
  );
}

/** Draws an object with its sprite origin at (0, 0): the image's top-left is at (-originX, -originY). */
/** An original PNG drawn at its own pixel size, bottom-centred in the object's box (sprites are padded to multiples of 4). */
function assetBox(object: MapObjectData, href: string) {
  const [w, h] = ASSET_SIZES[href.split('/').pop() ?? ''] ?? [object.w, object.h];
  // PixelLab pads sprites to multiples of 4: within that padding draw 1:1, otherwise fit the box as before.
  if (w >= object.w && w - object.w < 4 && h >= object.h && h - object.h < 4)
    return { x: Math.round((object.w - w) / 2), y: object.h - h, w, h };
  const scale = Math.min(object.w / w, object.h / h);
  const fw = Math.round(w * scale),
    fh = Math.round(h * scale);
  return { x: Math.round((object.w - fw) / 2), y: object.h - fh, w: fw, h: fh };
}
function AssetImage({
  object,
  href,
  clip,
  flip = false,
}: {
  object: MapObjectData;
  href: string;
  clip?: string;
  flip?: boolean;
}) {
  const box = assetBox(object, href);
  const mirror = flip || (object.facing === 'Left' && object.kind === 'maple-tree');
  return (
    <image
      className="pixel-resource"
      href={href}
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      clipPath={clip}
      transform={mirror ? `translate(${object.w} 0) scale(-1 1)` : undefined}
    />
  );
}
export function ObjectArt({ object }: { object: MapObjectData }) {
  const reference =
    artPack() === 'reference'
      ? REFERENCE_OBJECTS[`${object.kind}/${object.color}/${object.facing}`]
      : undefined;
  const found = reference ? null : objectAsset(object.kind, object.color, object.facing);
  const asset = found?.url ?? null;
  const sprite =
    reference ?? (asset ? null : furnitureSprite(object.kind, object.color, object.facing));
  const art = sprite ? (
    <Pixel sprite={sprite} x={Math.round((object.w - sprite.w) / 2)} y={object.h - sprite.h} />
  ) : asset ? (
    <AssetImage object={object} href={asset} flip={found?.mirror} />
  ) : (
    legacy(object)
  );
  return (
    <g transform={`translate(${-object.originX} ${-object.originY})`}>
      {art ?? <Placeholder object={object} />}
    </g>
  );
}

/** Catalogue thumbnail: the object drawn to fit a square box. */
export function ObjectThumb({
  item,
  size = 48,
}: {
  item: { kind: string; color: string; facing: string };
  size?: number;
}) {
  const data = asMapObjectForThumb(item);
  const scale = Math.min(1.6, (size - 6) / Math.max(data.w, data.h));
  return (
    <svg
      className="object-thumb"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <g
        transform={`translate(${(size - data.w * scale) / 2} ${(size - data.h * scale) / 2}) scale(${scale}) translate(${data.originX} ${data.originY})`}
      >
        <ObjectArt object={data} />
      </g>
    </svg>
  );
}
function asMapObjectForThumb(item: { kind: string; color: string; facing: string }): MapObjectData {
  return asMapObject({
    id: 'thumb',
    kind: item.kind,
    color: item.color,
    facing: item.facing,
    x: 16,
    y: 16,
  }) as MapObjectData;
}

/** Part of a seat drawn above its occupant, or null when the object has none. */
export function ObjectForeground({ object }: { object: MapObjectData }) {
  const key = `${object.kind}/${object.color}/${object.facing}`;
  if (artPack() === 'original') {
    // Only the silhouette of the reference's front part is used, as a mask over the project's own sprite.
    const mask = REFERENCE_FOREGROUNDS[key],
      asset = objectAssetUrl(object.kind, object.color, object.facing);
    if (!mask || !asset) return null;
    const id = `fg-${key.replace(/[^a-z0-9]/gi, '-')}`,
      x = Math.round((object.w - mask.w) / 2),
      y = object.h - mask.h;
    return (
      <g transform={`translate(${-object.originX} ${-object.originY})`}>
        <clipPath id={id}>
          <path
            transform={`translate(${x} ${y})`}
            d={spritePaths(mask)
              .map((path) => path.d)
              .join(' ')}
          />
        </clipPath>
        <AssetImage object={object} href={asset} clip={`url(#${id})`} />
      </g>
    );
  }
  const sprite = REFERENCE_FOREGROUNDS[key];
  if (!sprite) return null;
  return (
    <g transform={`translate(${-object.originX} ${-object.originY})`}>
      <Pixel sprite={sprite} x={Math.round((object.w - sprite.w) / 2)} y={object.h - sprite.h} />
    </g>
  );
}
export const hasForeground = (object: { kind: string; color: string; facing: string }) =>
  `${object.kind}/${object.color}/${object.facing}` in REFERENCE_FOREGROUNDS &&
  (artPack() === 'reference' || !!objectAssetUrl(object.kind, object.color, object.facing));
