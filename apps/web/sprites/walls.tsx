/** Thin walls of the reference: a 32 px face with a light top edge and dark base. */
export type WallSide = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
type WallPalette = { face: string; light: string; shadow: string; base: string };
export const WALL_PALETTES: Record<string, WallPalette> = {
  PlainBlack: { face: '#373e41', light: '#474d50', shadow: '#282e31', base: '#1a1f21' },
  PlainIndigo: { face: '#494f77', light: '#676e9d', shadow: '#34395a', base: '#23263e' },
  PlainWhite: { face: '#79838b', light: '#9aa3ab', shadow: '#5e6871', base: '#434d55' },
};
export const WALL_HEIGHT = 60;

/** Draws one wall piece for the tile at (tx, ty); the group origin is the tile's top-left corner. */
export function WallPiece({
  side,
  texture,
  open = false,
}: {
  side: WallSide;
  texture: string;
  open?: boolean;
}) {
  const palette = WALL_PALETTES[texture] ?? WALL_PALETTES.PlainBlack;
  const north = side === 'n' || side === 'nw' || side === 'ne';
  const south = side === 's' || side === 'sw' || side === 'se';
  const west = side === 'w' || side === 'nw' || side === 'sw';
  const east = side === 'e' || side === 'ne' || side === 'se';
  return (
    <g>
      {north && (
        <>
          <rect x="0" y={-WALL_HEIGHT} width="32" height={WALL_HEIGHT} fill={palette.face} />
          <rect x="0" y={-WALL_HEIGHT} width="32" height="2" fill={palette.light} />
          <rect x="0" y="-1" width="32" height="1" fill={palette.base} />
        </>
      )}
      {south && (
        <>
          <rect x="0" y="-32" width="32" height="64" fill={palette.face} />
          <rect x="0" y="-32" width="32" height="4" fill={palette.light} />
          <rect x="0" y="31" width="32" height="1" fill={palette.base} />
        </>
      )}
      {west && !open && (
        <>
          <rect
            x="0"
            y={north ? -WALL_HEIGHT : south ? -32 : 0}
            width="4"
            height={north ? WALL_HEIGHT + 32 : south ? 64 : 32}
            fill={palette.light}
          />
          <rect
            x="3"
            y={north ? -WALL_HEIGHT : south ? -32 : 0}
            width="1"
            height={north ? WALL_HEIGHT + 32 : south ? 64 : 32}
            fill={palette.shadow}
          />
        </>
      )}
      {east && !open && (
        <>
          <rect
            x="28"
            y={north ? -WALL_HEIGHT : south ? -32 : 0}
            width="4"
            height={north ? WALL_HEIGHT + 32 : south ? 64 : 32}
            fill={palette.light}
          />
          <rect
            x="28"
            y={north ? -WALL_HEIGHT : south ? -32 : 0}
            width="1"
            height={north ? WALL_HEIGHT + 32 : south ? 64 : 32}
            fill={palette.shadow}
          />
        </>
      )}
    </g>
  );
}

/** Doorway artwork as in the reference: open tan door leaves standing at both sides of a horizontal opening,
    and a door post plus floor strip for a vertical one. The opening itself shows the floor behind it. */
function DoorPost({ x, height }: { x: number; height: number }) {
  return (
    <g transform={`translate(${x} ${-height})`}>
      <rect x="0" y="0" width="8" height={height} fill="#b5804e" />
      <rect x="1" y="1" width="6" height={height - 2} fill="#e8a876" />
      <rect x="2" y="2" width="2" height={height - 4} fill="#f5c89a" />
      <rect x="3" y={Math.round(height / 2) - 4} width="3" height="6" fill="#8fa3b8" />
      <rect x="4" y={Math.round(height / 2) - 3} width="1" height="4" fill="#dfe6ee" />
    </g>
  );
}
/** A red padlock badge, shown on every doorway of a locked meeting room. */
function Padlock({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-9" y="-9" width="18" height="18" rx="4" fill="#e5484d" />
      <rect x="-4" y="-6" width="8" height="6" rx="3" fill="none" stroke="#fff" strokeWidth="1.5" />
      <rect x="-5" y="-2" width="10" height="7" rx="1.5" fill="#fff" />
      <rect x="-1" y="0" width="2" height="3" fill="#e5484d" />
    </g>
  );
}
/** Closed door leaves filling a horizontal opening while a meeting is in progress. */
function ClosedLeaf({ x, height }: { x: number; height: number }) {
  return (
    <g transform={`translate(${x} ${-height})`}>
      <rect x="0" y="0" width="32" height={height} fill="#c98a56" />
      <rect x="1" y="1" width="30" height={height - 2} fill="#e8a876" />
      <rect
        x="3"
        y="3"
        width="26"
        height={height - 6}
        fill="none"
        stroke="#d8955f"
        strokeWidth="1"
      />
      <rect x="22" y={Math.round(height / 2) - 3} width="3" height="6" rx="1" fill="#8fa3b8" />
    </g>
  );
}
export function DoorwayPiece({
  orientation,
  side,
  style = 'doors',
  closed = false,
  locked = false,
}: {
  orientation: 'Horizontal' | 'Vertical';
  side: 'n' | 's' | 'e' | 'w';
  style?: 'doors' | 'marker';
  closed?: boolean;
  locked?: boolean;
}) {
  const badge = locked ? (
    orientation === 'Vertical' ? (
      <Padlock x={0} y={32} />
    ) : (
      <Padlock x={32} y={side === 'n' ? -WALL_HEIGHT / 2 : -30} />
    )
  ) : null;
  if (style === 'marker')
    return (
      <g>
        {orientation === 'Vertical' ? (
          <rect x="-3" y="0" width="6" height="64" fill="#d9dde4" />
        ) : (
          <rect x="0" y="-2" width="64" height="4" fill="#d9dde4" />
        )}
        {badge}
      </g>
    );
  if (orientation === 'Vertical') {
    return (
      <g>
        <rect x="-3" y="0" width="6" height="64" fill="#8e5a30" />
        <rect x="-2" y="0" width="1" height="64" fill="#a9714b" />
        <g transform={`translate(${-4} ${0})`}>
          <DoorPost x={0} height={30} />
        </g>
        {badge}
      </g>
    );
  }
  const height = side === 'n' ? WALL_HEIGHT - 2 : 62;
  if (closed)
    return (
      <g>
        <ClosedLeaf x={0} height={height} />
        <ClosedLeaf x={32} height={height} />
        {badge}
      </g>
    );
  return (
    <g>
      <DoorPost x={0} height={height} />
      <DoorPost x={56} height={height} />
      {badge}
    </g>
  );
}
