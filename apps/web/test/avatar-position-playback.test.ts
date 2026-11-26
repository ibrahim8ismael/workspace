import { describe, expect, it } from 'vitest';
import {
  AvatarPositionPlayback,
  playbackFacing,
} from '../commons-preview/avatar-position-playback';

describe('orthogonal Studio avatar position playback', () => {
  it('fills a slow authoritative update with intermediate points and settles exactly', () => {
    const playback = new AvatarPositionPlayback({ x: 304, y: 560 }, 1000);
    playback.record({ x: 275.33, y: 560 }, 1153, false);

    expect(playback.positionAt(1180)).toMatchObject({ x: 304, y: 560 });
    expect(playback.positionAt(1220).x).toBeCloseTo(296.5, 1);
    expect(playback.positionAt(1300).x).toBeCloseTo(281.5, 1);
    expect(playback.positionAt(1333)).toMatchObject({ x: 275.33, y: 560 });
    expect(playback.positionAt(2000)).toMatchObject({ x: 275.33, y: 560 });
  });

  it('keeps orthogonal turn samples and does not interpolate a seat or teleport snap', () => {
    const playback = new AvatarPositionPlayback({ x: 16, y: 16 }, 1000);
    playback.record({ x: 48, y: 16 }, 1100, false);
    playback.record({ x: 48, y: 48 }, 1200, false);

    expect(playback.positionAt(1230)).toMatchObject({ x: 32, y: 16 });
    expect(playback.positionAt(1330)).toMatchObject({ x: 48, y: 32 });
    playback.record({ x: 80, y: 48 }, 1331, true);
    expect(playback.positionAt(1331)).toMatchObject({ x: 80, y: 48 });
  });

  it('faces each displayed segment while a later turn remains buffered', () => {
    const playback = new AvatarPositionPlayback({ x: 16, y: 16 }, 1000);
    playback.record({ x: 48, y: 16 }, 1100, false);
    playback.record({ x: 48, y: 48 }, 1200, false);

    const first = playback.positionAt(1230);
    const turn = playback.positionAt(1280);
    const afterTurn = playback.positionAt(1330);
    expect(playbackFacing(first, turn, 'south')).toBe('east');
    expect(playbackFacing(turn, afterTurn, 'east')).toBe('south');
    expect(playbackFacing(afterTurn, afterTurn, 'south')).toBe('south');
    expect(playbackFacing({ x: 48, y: 33 }, afterTurn, 'south')).toBe('north');
  });

  it('holds the known position through an idle gap and glides when motion resumes', () => {
    const playback = new AvatarPositionPlayback({ x: 0, y: 16 }, 0);
    playback.record({ x: 16, y: 16 }, 500, false);
    expect(playback.positionAt(570)).toMatchObject({ x: 0, y: 16 });
    expect(playback.positionAt(630)).toMatchObject({ x: 8, y: 16 });
    expect(playback.positionAt(680)).toMatchObject({ x: 16, y: 16 });
  });
});
