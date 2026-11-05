# Original pixel assets

The user-selected application character is **Cliente Avatar**, exported unchanged
from the user's PixelLab account. Its four cardinal idle views and six walking
frames per direction are in [`cliente-avatar/`](cliente-avatar/README.md), all on
92 × 92 transparent canvases. The subfolder README documents its provenance,
measured bounds and shared foot anchor. These assets require no new generation.

The earlier provisional character was generated for Open Office with the user's configured PixelLab
account on 2026-10-27. These are local assets; the running app does not call
PixelLab or require an API key.

- `coworker-{south,east,north,west}.png`: four idle directions, 68 × 68 pixels.
- `coworker-walk-{direction}-frame_00{0,1,2,3}.png`: four walking frames per direction.
- Nominal foot anchor: `(34, 56)` on the full canvas. Render with nearest-neighbor
  scaling and preserve the transparent margins so frames do not jump.

Generation brief: compact office worker with short brown hair, purple sweatshirt,
navy trousers and white sneakers; low top-down RPG view, selective outlines and
basic pixel shading. Standard character generation, followed by the four-frame
walking template in all four directions.

This is the previous provisional original avatar, not an extracted Gather sprite. The current
profile color identifies participants in the people list and profile; it does not recolor
the sprite's clothing. Clothing customization remains future work.

`dracaena.png` is an original PixelLab map object generated during the refinement
pass: 80 × 112 pixels, transparent background, foot anchor `(40, 106)`. Its brief
requested a detailed office plant, individual leaf veins, selective one-pixel
outlines and a sage ceramic planter in a low top-down view. It renders at native
size in world coordinates. Smaller plants and trees are original procedural art
on a one-unit grid in `src/PixelPlants.tsx`.
