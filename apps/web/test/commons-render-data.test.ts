import { describe, expect, it } from 'vitest';
import { readPreview } from '../commons-preview/data';

describe('approved Commons renderer data', () => {
  it('loads only the versioned geometry and immutable artwork selected by the map manifest', () => {
    const assets = readPreview();

    expect(assets.geometry.mapId).toBe('commons');
    expect(assets.manifest.mapVersion).toMatch(/^commons-v1-[a-f0-9]{64}$/);
    expect(assets.geometry.widthTiles * assets.geometry.tileSize).toBe(
      assets.manifest.bounds.width,
    );
    expect(assets.geometry.heightTiles * assets.geometry.tileSize).toBe(
      assets.manifest.bounds.height,
    );
    expect(assets.avatarFrames).toHaveLength(8);
    expect(assets.avatarFrames.every((frame) => frame.url.length > 0)).toBe(true);
    expect(assets.geometry.zones).toHaveLength(3);
    expect(assets.geometry.objects.flatMap((object) => object.seats)).toHaveLength(4);
  });
});
