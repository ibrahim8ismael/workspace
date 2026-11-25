import { describe, expect, it } from 'vitest';
import { compileWorkspaceLayout, generateWorkspaceLayoutPreset } from '@gather/world';
import { workspaceRoute } from '../commons-preview/workspace-navigation';

describe('authored layout navigation', () => {
  const { validated } = compileWorkspaceLayout(generateWorkspaceLayoutPreset('studio'), 'studio');
  const { bounds, collision } = validated;

  it('routes through the studio thresholds while leaving wall and furniture clicks blocked', () => {
    const options = { adjacent: false, occupied: new Set<string>() };
    const route = workspaceRoute(
      { tx: 26, ty: 10 },
      { tx: 26, ty: 15 },
      bounds,
      collision,
      options,
    );
    expect(route).toContainEqual({ tx: 26, ty: 12 });
    expect(route?.at(-1)).toEqual({ tx: 26, ty: 15 });
    for (const target of [
      { tx: 23, ty: 12 },
      { tx: 25, ty: 15 },
    ]) {
      expect(workspaceRoute({ tx: 26, ty: 10 }, target, bounds, collision, options)).toBeNull();
    }
  });

  it('ends beside a member on the same side of the wall and avoids taken seats', () => {
    const target = { tx: 26, ty: 15 };
    const route = workspaceRoute({ tx: 26, ty: 10 }, target, bounds, collision, {
      adjacent: true,
      occupied: new Set(['26,14']),
    });
    expect(route).not.toContainEqual(target);
    expect(route).not.toContainEqual({ tx: 26, ty: 14 });
    const end = route?.at(-1);
    expect(end && Math.abs(end.tx - target.tx) + Math.abs(end.ty - target.ty)).toBe(1);
  });
});
