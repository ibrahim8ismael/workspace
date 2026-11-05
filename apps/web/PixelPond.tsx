type Point = readonly [number, number];

// Rasterize authored contours onto the same one-world-unit grid as the props.
// Layered silhouettes supply depth without scaling a small bitmap or blurring it.
function pixelContour(points: readonly Point[]) {
  const top = Math.floor(Math.min(...points.map((point) => point[1])));
  const bottom = Math.ceil(Math.max(...points.map((point) => point[1])));
  let path = '';
  for (let y = top; y < bottom; y++) {
    const cuts: number[] = [];
    const scan = y + 0.5;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= scan && y2 > scan) || (y2 <= scan && y1 > scan)) {
        cuts.push(x1 + ((scan - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i += 2) {
      const left = Math.round(cuts[i]);
      const width = Math.max(1, Math.round(cuts[i + 1]) - left);
      path += `M${left} ${y}h${width}v1h-${width}Z`;
    }
  }
  return path;
}

// The reference has a compact, almost round pool, with broad stone banks.
// These coordinates are native world pixels; the garden is not a scaled sprite.
const bank = pixelContour([
  [41, 7],
  [66, 2],
  [91, 7],
  [112, 24],
  [124, 45],
  [129, 66],
  [124, 92],
  [109, 112],
  [88, 126],
  [62, 130],
  [38, 122],
  [18, 104],
  [5, 80],
  [5, 54],
  [18, 30],
]);
const water = pixelContour([
  [46, 27],
  [67, 24],
  [87, 30],
  [103, 45],
  [109, 63],
  [106, 84],
  [94, 101],
  [75, 109],
  [54, 106],
  [36, 96],
  [25, 78],
  [25, 58],
  [33, 41],
]);
const shallows = pixelContour([
  [47, 30],
  [67, 27],
  [86, 33],
  [100, 47],
  [106, 64],
  [103, 83],
  [92, 98],
  [74, 106],
  [55, 103],
  [39, 94],
  [28, 77],
  [28, 59],
  [36, 43],
]);
const deepWater = pixelContour([
  [49, 42],
  [66, 37],
  [82, 41],
  [94, 53],
  [98, 68],
  [93, 85],
  [80, 96],
  [64, 97],
  [49, 90],
  [38, 76],
  [38, 60],
]);

function Stone({
  x,
  y,
  width,
  height,
  moss = false,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  moss?: boolean;
}) {
  const w = width,
    h = height;
  const outline = pixelContour([
    [5, 0],
    [w - 6, 0],
    [w - 1, 5],
    [w, h - 5],
    [w - 5, h],
    [6, h + 2],
    [1, h - 3],
    [0, 6],
  ]);
  const body = pixelContour([
    [5, 1],
    [w - 7, 1],
    [w - 2, 5],
    [w - 2, h - 6],
    [w - 6, h - 1],
    [6, h],
    [2, h - 4],
    [2, 6],
  ]);
  const crown = pixelContour([
    [6, 2],
    [w - 7, 2],
    [w - 4, 5],
    [w - 4, h - 8],
    [w - 8, h - 5],
    [6, h - 5],
    [3, h - 9],
    [3, 7],
  ]);
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={outline} fill="#657b85" />
      <path d={body} fill="#8eabb7" />
      <path d={crown} fill="#afc1cb" />
      <path d={`M6 2h${Math.max(2, w - 14)}v1H6ZM3 7h1v3H3Z`} fill="#c4d1d6" />
      <path
        d={`M${w - 4} 7h1v${Math.max(2, h - 14)}h-1ZM${w - 9} ${h - 2}h4v1h-4Z`}
        fill="#7896a6"
      />
      <path d={`M${Math.floor(w * 0.52)} 4h3v1h-3Z`} fill="#a1b8c3" />
      {moss && (
        <>
          <path d={`M2 ${h - 6}h4v-2h4v2h2v3H7v1H3v-1H2Z`} fill="#4e9768" />
          <path d={`M3 ${h - 6}h3v1H3ZM7 ${h - 7}h3v1H7Z`} fill="#80be7b" />
        </>
      )}
    </g>
  );
}

function Pad({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  const shape = small
    ? 'M-2 -2h4v1h1v3H1v1h-3V2h-1v-3h1Z'
    : 'M-3 -4h6v1h2v2h1v4H3v2h-5V4h-3V2h-1v-3h1v-2h2Z';
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={shape} transform="translate(0 1)" fill="#39866b" />
      <path d={shape} fill="#6dbb78" />
      <path d={small ? 'M-1 -2h2v1h-2Z' : 'M-2 -3h4v1h-4ZM-4 -1h1v2h-1Z'} fill="#93cf85" />
      <path d={small ? 'M0 1h2v1H0Z' : 'M1 1h4v1H2v1H1Z'} fill="#4b9e6d" />
    </g>
  );
}

function Koi({ x, y, turn = 0 }: { x: number; y: number; turn?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      <path d="M-5 2h8l3 2v2H4v1H-3V6h-2Z" fill="#377e8b" />
      <path d="M-2 -1h3v-3h2v1H2v3ZM-1 2h3v3H0V4h-1Z" fill="#dbad5b" />
      <path d="M-8 -3h2l3 3v1l-3 2h-2l2-3Z" fill="#e8aa4b" />
      <path d="M-4 -1h2v-1h6v1h2v3H4v1h-6V2h-2Z" fill="#db8c32" />
      <path d="M-2 -2h5v1h2v1H0v-1h-2Z" fill="#f1bf52" />
      <path d="M-3 0h2v2H0v1h-2V2h-1ZM2 1h2v1H2Z" fill="#ba6c31" />
      <path d="M5 0h1v1H5Z" fill="#6c683b" />
    </g>
  );
}

function Fern({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-12 0h25v3H-12Z" fill="#304f4d" opacity=".5" />
      <path
        d="M0 2h2v-19H0ZM-1 -1h-2v-9h-2v-5h-2v-4h-2v-2h-3v-2h-5v2h4v2h3v3h2v5h3v5h3ZM2 -2h3v-7h3v-6h2v-4h3v-2h4v-2h-5v2H8v4H6v5H3v5H2ZM-2 0h-3v-5h-4v-4h-5v-3h-4v-2h-4v3h4v3h4v3h5v4h5ZM4 0h4v-4h4v-4h4v-3h5v-3h-4v2h-5v3H8v4H4Z"
        fill="#418e60"
      />
      <path
        d="M0 -21h3v5H0ZM-3 -18h3v2h-3ZM2 -15h4v2H2ZM-4 -13H0v2h-4ZM2 -10h4v2H2ZM-3 -7H0v2h-3ZM-11 -21h4v3h-4ZM-16 -23h4v2h-4ZM-8 -17h4v3h-4ZM-6 -12h3v3h-3ZM8 -21h4v2H8ZM13 -23h4v2h-4ZM6 -17h3v3H6ZM4 -12h4v2H4ZM-18 -13h4v2h-4ZM-14 -10h5v2h-5ZM-9 -6h4v2h-4ZM13 -13h5v2h-5ZM9 -9h4v2H9ZM6 -5h3v2H6Z"
        fill="#6abb6e"
      />
      <path
        d="M0 -23h2v3H0ZM-15 -23h3v1h-3ZM-11 -20h3v1h-3ZM12 -22h3v1h-3ZM7 -18h2v1H7ZM-18 -14h3v1h-3ZM14 -14h3v1h-3ZM-4 -12h3v1h-3ZM2 -9h3v1H2Z"
        fill="#a3d37d"
      />
    </g>
  );
}

export function PixelPond() {
  return (
    <g transform="translate(640 132)" shapeRendering="crispEdges" pointerEvents="none">
      <rect width="320" height="192" fill="#3b5e62" />
      <Fern x={55} y={64} />
      <Fern x={56} y={127} />
      <Fern x={55} y={181} />
      <Fern x={270} y={41} />
      <Fern x={271} y={99} />
      <Fern x={270} y={140} />
      <Fern x={232} y={179} />
      <g transform="translate(94 30)">
        <path d={bank} transform="translate(0 2)" fill="#2f534f" />
        <path d={bank} fill="#4c9868" />
        <path d={water} fill="#397d91" />
        <path d={shallows} fill="#56a8b5" />
        <path d={deepWater} fill="#4799ac" />
        <path
          d="M41 46h9v1h-9ZM32 67h1v10h-1ZM48 98h8v1h-8ZM91 50h1v7h-1ZM94 84h2v3h-2Z"
          fill="#78bec4"
        />
        <path d="M54 53h5v1h-5ZM79 68h6v1h-6ZM66 88h5v1h-5Z" fill="#68b3be" />
        <Koi x={52} y={59} />
        <Koi x={81} y={76} turn={90} />
        <Koi x={60} y={94} turn={180} />
        <Pad x={39} y={54} />
        <Pad x={36} y={63} />
        <Pad x={33} y={72} small />
        <Pad x={44} y={68} small />
        <Pad x={47} y={49} small />
        <Pad x={89} y={47} />
        <Pad x={98} y={54} />
        <Pad x={91} y={59} small />
        <Pad x={87} y={39} small />
        <Pad x={85} y={100} small />
        <Pad x={74} y={104} />
        <Stone x={42} y={5} width={21} height={17} />
        <Stone x={66} y={3} width={17} height={18} moss />
        <Stone x={86} y={10} width={24} height={22} />
        <Stone x={23} y={17} width={23} height={21} />
        <Stone x={50} y={21} width={19} height={17} />
        <Stone x={95} y={32} width={24} height={22} />
        <Stone x={11} y={36} width={24} height={21} />
        <Stone x={5} y={57} width={22} height={24} />
        <Stone x={107} y={57} width={22} height={21} />
        <Stone x={8} y={80} width={22} height={22} moss />
        <Stone x={103} y={80} width={23} height={22} />
        <Stone x={21} y={100} width={22} height={21} />
        <Stone x={87} y={101} width={25} height={21} />
        <Stone x={46} y={115} width={17} height={15} moss />
        <Stone x={67} y={115} width={22} height={16} />
        <Pad x={29} y={99} small />
        <Pad x={63} y={112} small />
        <Pad x={115} y={51} small />
        <path
          d="M36 119h2v-3h2v5h-4ZM40 124h2v-2h3v3h-5ZM84 11h2v-3h2v5h-4ZM113 104h3v-3h2v5h-5ZM55 128h3v-2h2v3h-5Z"
          fill="#83c17d"
        />
        <path d="M16 101h3v2h-3ZM36 109h3v2h-3ZM108 31h2v3h-2ZM116 78h3v2h-3Z" fill="#71af72" />
      </g>
    </g>
  );
}
