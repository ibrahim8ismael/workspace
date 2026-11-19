import { describe, expect, it } from 'vitest';
import {
  authPaths,
  companySettingsPath,
  officePath,
  parseRoute,
  safeReturnTo,
} from '../src/routing/routes';
const workspaceId = '7b839c68-a211-48f2-a38f-d15e7558a4ea';
const officeId = '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea';
describe('page routes', () => {
  it('distinguishes auth pages and every office destination', () => {
    for (const [view, path] of Object.entries(authPaths))
      expect(parseRoute(path)).toEqual({ kind: 'auth', view });
    for (const page of [
      'entry',
      'office',
      'chat',
      'calendar',
      'activity',
      'invitations',
      'settings',
    ] as const)
      expect(parseRoute(officePath(workspaceId, officeId, page))).toEqual({
        kind: 'office',
        workspaceId,
        officeId,
        page,
      });
    expect(parseRoute(`/companies/${workspaceId}`)).toEqual({ kind: 'company', workspaceId });
    expect(parseRoute(companySettingsPath(workspaceId))).toEqual({
      kind: 'company-settings',
      workspaceId,
    });
  });
  it('rejects invalid or unknown resources without treating them as a company page', () => {
    for (const path of [
      '/missing',
      '/companies/not-an-id',
      `/companies/${workspaceId}/offices/nope`,
      '/companies/../security',
    ])
      expect(parseRoute(path)).toEqual({ kind: 'not-found' });
  });
  it('limits login return targets to known internal protected pages', () => {
    for (const value of [
      'https://other.test',
      '//other.test/companies',
      '/\\other.test',
      '/login?returnTo=/login',
      '/unknown',
      '/companies\n',
    ])
      expect(safeReturnTo(value)).toBe('/companies');
    const invitation = '/invitations/accept?token=one-time-token';
    expect(safeReturnTo(invitation)).toBe(invitation);
    expect(safeReturnTo(officePath(workspaceId, officeId, 'chat'))).toBe(
      officePath(workspaceId, officeId, 'chat'),
    );
  });
});
