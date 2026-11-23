import { expect, test, type Page } from '@playwright/test';

const workspaceId = '7b839c68-a211-48f2-a38f-d15e7558a4ea';
const officeId = '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea';
const owner = {
  id: 'cfd1f021-46b8-45f2-b6c8-a60e88d648f8',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const admin = {
  id: '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea',
  displayName: 'Workspace Admin',
  email: 'admin@example.test',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const member = {
  id: '99d7b0b0-d92c-4c30-b9ab-15df31ee6699',
  displayName: 'Workspace Member',
  email: 'member@example.test',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const date = '2026-11-09T00:00:00.000Z';

async function mockWorkspaceApi(page: Page) {
  let current = owner;
  let authenticated = false;
  let adminRole: 'admin' | 'member' = 'member';
  let memberActive = true;
  let invitations: Array<{
    id: string;
    email: string;
    expiresAt: string;
    status: 'pending' | 'revoked';
  }> = [];
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname === '/api/auth/csrf') return json({ csrfToken: 'A'.repeat(43) });
    if (pathname === '/api/auth/me')
      return authenticated
        ? json({ account: current })
        : json(
            { error: { code: 'unauthorized', message: 'unauthorized', requestId: workspaceId } },
            401,
          );
    if (pathname === '/api/auth/login' && method === 'POST') {
      const input = route.request().postDataJSON() as { email: string };
      current = input.email === admin.email ? admin : owner;
      authenticated = true;
      return json({ account: current, csrfToken: 'B'.repeat(43) });
    }
    if (pathname === '/api/auth/reauthenticate' && method === 'POST')
      return json({ account: current, csrfToken: 'C'.repeat(43) });
    if (pathname === '/api/auth/logout' && method === 'POST') {
      authenticated = false;
      return json({ message: 'Signed out.' });
    }
    if (pathname === '/api/auth/sessions')
      return json({
        sessions: [
          {
            id: officeId,
            current: true,
            createdAt: date,
            absoluteExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
            idleExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        ],
      });
    if (pathname === '/api/workspaces')
      return json({
        workspaces: [
          {
            id: workspaceId,
            name: 'Gather Test Workspace',
            slug: 'gather-test-workspace',
            role: current.id === owner.id ? 'owner' : 'admin',
            memberCount: 3,
          },
        ],
      });
    if (pathname === `/api/workspaces/${workspaceId}`)
      return json({
        workspace: {
          id: workspaceId,
          name: 'Gather Test Workspace',
          slug: 'gather-test-workspace',
          role: current.id === owner.id ? 'owner' : 'admin',
          memberCount: memberActive ? 3 : 2,
          officeId,
          revision: 0,
          roomCount: 5,
        },
      });
    if (pathname === `/api/workspaces/${workspaceId}/members`)
      return json({
        members: [
          { userId: owner.id, displayName: owner.displayName, role: 'owner', joinedAt: date },
          { userId: admin.id, displayName: admin.displayName, role: adminRole, joinedAt: date },
          ...(memberActive
            ? [
                {
                  userId: member.id,
                  displayName: member.displayName,
                  role: 'member',
                  joinedAt: date,
                },
              ]
            : []),
        ],
      });
    if (
      pathname === `/api/workspaces/${workspaceId}/members/${admin.id}/role` &&
      method === 'PATCH'
    ) {
      adminRole = (route.request().postDataJSON() as { role: 'admin' | 'member' }).role;
      return json({ member: { userId: admin.id, role: adminRole } });
    }
    if (pathname === `/api/workspaces/${workspaceId}/members/${member.id}` && method === 'DELETE') {
      memberActive = false;
      return json({ message: 'Membership removed.' });
    }
    if (pathname === `/api/workspaces/${workspaceId}/invitations` && method === 'GET')
      return json({ invitations });
    if (pathname === `/api/workspaces/${workspaceId}/invitations` && method === 'POST') {
      const input = route.request().postDataJSON() as { email: string };
      const invitation = {
        id: '6d840413-15ee-4d57-91ed-a8d667873bc6',
        email: input.email,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'pending' as const,
      };
      invitations = [invitation, ...invitations.filter((row) => row.email !== invitation.email)];
      return json(
        {
          invitation: {
            id: invitation.id,
            email: invitation.email,
            expiresAt: invitation.expiresAt,
          },
        },
        201,
      );
    }
    if (
      pathname.endsWith('/invitations/6d840413-15ee-4d57-91ed-a8d667873bc6') &&
      method === 'DELETE'
    ) {
      invitations = invitations.map((row) => ({ ...row, status: 'revoked' }));
      return json({ message: 'Invitation revoked.' });
    }
    return json(
      { error: { code: 'not_found', message: 'not_found', requestId: workspaceId } },
      404,
    );
  });
}

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Company details' }).click();
  await expect(
    page.getByRole('heading', { name: 'Gather Test Workspace', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Space settings' }).click();
  await expect(
    page.getByRole('heading', { name: 'Gather Test Workspace', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
}

test('approved login design renders on direct navigation and survives refresh', async ({
  page,
}) => {
  await mockWorkspaceApi(page);
  await page.goto('/login');
  await expect(page.getByText('Private team workspace')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Sign in to open your team’s shared workspace.')).toBeVisible();
  await expect(page.locator('.auth-progress')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.auth-layout').evaluate((node) => getComputedStyle(node).borderRadius),
    )
    .not.toBe('0px');
  await page.screenshot({ path: '/tmp/gather-login-ui.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('Owner promotes a Member, then the Admin manages invites and removes a Member', async ({
  page,
}) => {
  await mockWorkspaceApi(page);
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill('valid test password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/companies');
  await openSettings(page);
  await expect(page.getByText('Member of this space')).toHaveCount(2);

  const promotionTrace: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/api/auth/') || path.endsWith('/role'))
      promotionTrace.push(`${request.method()} ${path}`);
  });
  page.on('dialog', async (dialog) => {
    const type = dialog.type();
    promotionTrace.push(`dialog:${type}`);
    if (type === 'prompt') await dialog.accept('valid test password');
    else await dialog.accept();
  });
  await page.getByRole('button', { name: 'Promote to Admin' }).first().click();
  try {
    await expect(page.locator('.space-settings-feedback[role="status"]')).toContainText(
      'Workspace Admin is now Admin.',
    );
  } catch (caught) {
    throw new Error(`${String(caught)}\nPromotion trace: ${promotionTrace.join(' | ')}`, {
      cause: caught,
    });
  }
  await expect(page.getByText('Admin of this space')).toBeVisible();

  await page.goto('/companies');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel('Email', { exact: true }).fill(admin.email);
  await page.getByLabel('Password', { exact: true }).fill('valid test password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/companies');
  await openSettings(page);
  await expect(page.getByText('Admin access', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Promote to Admin' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Transfer ownership' })).toHaveCount(0);
  await expect(page.getByLabel('Display name')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toBeVisible();

  await page.getByLabel('Employee email').fill('invitee@example.test');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation created for invitee@example.test.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.locator('.space-settings-feedback[role="status"]')).toContainText(
    'Workspace Member was removed.',
  );
  await expect(page.locator('.space-member-list').getByText('Workspace Member')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/gather-admin-settings.png', fullPage: true });
});
