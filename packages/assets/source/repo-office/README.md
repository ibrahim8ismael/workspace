# Office map art pack

These selected pixel sprites are copied from the local `the-office-map-master` repository's
`tilesets/Modern office/Singles` folder. The numeric source IDs are retained here for traceability:

- `desk-table.png`: sprite 251, a 96×64 wood desk/table
- `office-chair.png`: sprite 238, a 32×64 slate office chair
- `computer.png`: sprite 242, a 32×32 computer/monitor
- `desk-plant.png`: sprite 111, a 32×32 potted desk plant
- `plant.png`: sprite 112, a 32×32 small plant

The Vivo renderer exposes this pack with `?art=repo-office`. In Studio’s square private offices,
the live map and editor share the desk, chair, and monitor PNGs by default. Both renderers use
nearest-neighbor scaling to preserve the pixel edges.
