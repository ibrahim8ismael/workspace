# Generated object sprites

Trees, plants, the koi pond and most furniture were generated for Open Office with the user's
PixelLab account (Pro Flash, 2026-10-28) from text descriptions, using the
measured reference objects only as style guidance. They are original files
rendered at the exact canvas size of the reference object so they sit on the
same footprint and anchor. Furniture, walls and floors are drawn in code in
`src/sprites/`. No Gather asset is included in the project.

Naming: `<kind>.png` for single variants, `<kind>-<color>.png` or
`<kind>-<color>-<facing>.png` for colour and orientation variants; the map in
`src/sprites/furnitureAssets.ts` and `src/sprites/assets.ts` resolves them.

## Second pass (2026-10-29)

About thirty map pieces were regenerated with PixelLab Pro Flash so the original art
reads like the reference office: the same kind of object, the same orientation, the
reference colours as the palette and the exact footprint. Every pixel is newly
generated; no reference sprite was used as an input image. Chair side views are drawn
facing right and mirrored for the left.

## Third pass (2026-10-29)

Trees, the fish tank, the wooden chair, the side views of the chairs and the laptop were drawn again in our own style:
generic descriptions, our approved pieces as style guides and only the footprint size. Nothing from the reference was used as
input. Chair side views are flat profiles facing right, mirrored for the left.

## Outdoor and beach pieces (2026-10-29)

Palm trees, beach umbrellas, sun loungers, towels, surfboards, a sandcastle, a beach ball, a lifeguard tower, a rowboat,
rocks, hedges, flower beds, park benches, street lamps and a fountain were generated with PixelLab from generic
descriptions, using the project's own pieces as style guides. Their catalog entries live in `shared/catalog-extra.js`.
Sand, shore, water and cobblestone floors are drawn in code in `src/sprites/floors.tsx`.
