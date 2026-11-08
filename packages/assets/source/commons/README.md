# Commons source sprites

This directory is the original CP02.4 pixel-art source for the `commons` map. It is a small,
fixed catalog rather than a general art pipeline.

- One body, `commons-worker`, with palette `teal` (the single default appearance pair).
- Eight static pose frames on a 24 x 32 canvas: standing and sitting in the fixed direction order
  `north`, `east`, `south`, `west`.
- Every avatar frame uses foot origin `(12, 31)` in its own canvas. Standing and sitting silhouettes
  differ, and each cardinal pose has a distinct face/hair/limb outline.
- One `table` sprite (64 x 64, binding the two geometry table objects) and one `chair-backrest`
  sprite (32 x 32).
- Draw order is `table/base`, `avatar`, `chair/foreground`.
- These frames are static pose references for the future CP02 Phaser sample. They are not walking
  animation frames.

All artwork is original: primitive SVG rectangles with integer coordinates, transparent
backgrounds, `shape-rendering="crispEdges"` and a small warm/teal palette. There are no copied or
external references, scripts, remote links, fonts, filters, image-generation tools or dependencies.
The fixed declaration in `scripts/commons-source.mjs` derives every frame and sprite ID from the
pose/direction names and records the original-artwork provenance. Generated content-addressed
copies and hashed JSON live under `packages/assets/sprites`, `packages/assets/maps` and
`packages/assets/manifests`. `pnpm build:commons` writes them and `pnpm check:commons` verifies exact
bytes. The catalog version uses the full 64-character catalog SHA-256 with the `commons-art-v1-`
prefix (79 characters), within the existing 80-character `assetManifestVersion` contract.
