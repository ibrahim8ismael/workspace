import { expect, test } from '@playwright/test';

const account = {
  id: '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea',
  email: 'e2e@example.test',
  displayName: 'E2E Person',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const workspace = {
  id: '7b839c68-a211-48f2-a38f-d15e7558a4ea',
  name: 'E2E Company',
  slug: 'e2e-company',
  role: 'member',
  memberCount: 2,
};
const officeId = 'df92b3ad-d3e9-430d-82f5-6e91cbe9dfe2';
const sessionStart = Date.now();
const session = {
  id: 'f53b45ad-403c-4e68-82a4-f631313bc94b',
  current: true,
  createdAt: new Date(sessionStart - 60_000).toISOString(),
  absoluteExpiresAt: new Date(sessionStart + 2 * 60 * 60_000).toISOString(),
  idleExpiresAt: new Date(sessionStart + 60 * 60_000).toISOString(),
};
const requestId = 'dbe6efea-048d-4b34-9111-d43880daf189';

test('mocked-API UI E2E: sign in, open the company preview, and return cleanly', async ({
  page,
}) => {
  let authenticated = false;
  const unexpectedApiCalls: string[] = [];
  const officeSocketUrls: string[] = [];

  page.on('websocket', (socket) => {
    if (/\/ws(?:\?|$)|\/socket\.io(?:\/|\?|$)/.test(socket.url()))
      officeSocketUrls.push(socket.url());
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && path === '/api/auth/csrf') return json({ csrfToken: 'A'.repeat(43) });
    if (method === 'GET' && path === '/api/auth/me')
      return authenticated
        ? json({ account })
        : json({ error: { code: 'unauthorized', message: 'unauthorized', requestId } }, 401);
    if (method === 'POST' && path === '/api/auth/login') {
      authenticated = true;
      return json({ account, csrfToken: 'B'.repeat(43) });
    }
    if (method === 'GET' && path === '/api/auth/sessions')
      return authenticated ? json({ sessions: [session] }) : json({}, 401);
    if (method === 'GET' && path === '/api/workspaces')
      return authenticated ? json({ workspaces: [workspace] }) : json({}, 401);
    if (method === 'GET' && path === `/api/workspaces/${workspace.id}`)
      return authenticated ? json({ workspace: { ...workspace, officeId } }) : json({}, 401);

    unexpectedApiCalls.push(`${method} ${path}`);
    return json({ error: { code: 'not_found', message: 'not_found', requestId } }, 404);
  });

  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill('a long e2e-only password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('E2E Company', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View company' }).click();
  await expect(page.getByRole('heading', { name: 'Company details' })).toBeVisible();
  await expect(
    page.getByRole('definition').filter({ hasText: 'gather/e2e-company' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Open office preview' }).click();
  await expect(page.getByText('Not connected to the office.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter office' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Text chat is unavailable' })).toBeVisible();
  await expect(page.getByLabel('Message office-preview')).toBeDisabled();
  await expect(page.locator('.commons-scene canvas')).toHaveCount(1);
  await expect(page.getByText('Avatar standing.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sit' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sit' }).click();
  await expect(page.getByText('Avatar sitting.')).toBeVisible();

  await page.getByRole('button', { name: 'Back to company details' }).click();
  await expect(page.getByRole('heading', { name: 'Company details' })).toBeVisible();
  await expect(page.locator('.commons-scene canvas')).toHaveCount(0);
  expect(unexpectedApiCalls).toEqual([]);
  expect(officeSocketUrls).toEqual([]);
});
