# Cliente Avatar

Original **Cliente Avatar** character exported from the user's configured PixelLab
account and selected by the user for Open Office. The PNGs are copied unchanged
from the official character ZIP export: no resizing, recoloring, cropping or new
generation was performed. The running app uses these local files without a
PixelLab API key or network connection to PixelLab.

The application uses only the four cardinal directions:

- `{south,north,east,west}.png`: four static idle views.
- `walk-{south,north,east,west}-{0,1,2,3,4,5}.png`: six walking frames per direction.
- All 32 files have a transparent **92 × 92 pixel** canvas.
- Walking frames preserve the order `frame_000.png` through `frame_005.png` from
  the export's `animations/walk/{direction}/` directories.
- `sit-{south,north,east,west}.png`: four existing seated views from the sibling
  state `sitting down on a se` (56b6106b-5d66-4c5d-b95e-1e2601b4c21d).
- Diagonal directions and animated idle are not included here.

Preserve the full canvas and use the common foot anchor **(46, 69)**. With a
render scale `s`, image placement relative to the participant's foot position is
`x = -46s`, `y = -69s`, `width = height = 92s`. A native scale of 1 avoids enlarging
the source pixels; the camera's zoom still affects their screen size. The canvas
size includes transparent margins and is not the visible height of the body.

Measured alpha bounds below use exclusive right and bottom coordinates:

| Idle direction | Left, top, right, bottom | Visible size |
| --- | --- | --- |
| South | 36, 23, 57, 69 | 21 × 46 |
| North | 36, 23, 57, 69 | 21 × 46 |
| East | 37, 23, 58, 68 | 21 × 45 |
| West | 35, 23, 56, 68 | 21 × 45 |

The six walking frames already share the original canvas alignment. Their alpha
bottom coordinates are 69 for south, 68–69 for north, 68 for east and 67–68 for
west. Small changes in the head, feet and arm bounds are part of the original
animation; do not independently recenter or crop frames, which would introduce
extra movement. The stable shared anchor also preserves the map's depth ordering
and collision position.

The seated state was selected because it contains only the character, without a
chair baked into the image. The map draws the chair base, seated character and,
for a north-facing seat, the backrest in that order. Its four PNGs are unchanged
92 × 92 exports and share the (46,69) map anchor. They required no new generation.

`sit-east.png` and `sit-west.png` come from the newer PixelLab state «Seated» (ca711f83, 2026-10-28) of the same character, which bends the knees in the side views; the south and north seated views keep the earlier state, like the reference avatars that keep their standing pose on a chair.
