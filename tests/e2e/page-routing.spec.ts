import { expect, test, type Page } from '@playwright/test';
const workspaceId = '7b839c68-a211-48f2-a38f-d15e7558a4ea';
const officeId = '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea';
const entryPath = `/companies/${workspaceId}/offices/${officeId}/entry`;
const company = {
  id: workspaceId,
  name: 'Routing Company',
  slug: 'routing-company',
  role: 'owner',
  memberCount: 2,
};
const account = {
  id: 'cfd1f021-46b8-45f2-b6c8-a60e88d648f8',
  displayName: 'Routing Person',
  email: 'routing@example.test',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
async function mockApi(page: Page, signedIn = false) {
  let authenticated = signedIn;
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname === '/api/auth/csrf') return json({ csrfToken: 'A'.repeat(43) });
    if (pathname === '/api/auth/me')
      return authenticated
        ? json({ account })
        : json(
            { error: { code: 'unauthorized', message: 'unauthorized', requestId: workspaceId } },
            401,
          );
    if (pathname === '/api/auth/login' && method === 'POST') {
      authenticated = true;
      return json({ account, csrfToken: 'B'.repeat(43) });
    }
    if (
      ['/api/auth/register', '/api/auth/forgot-password', '/api/auth/resend-verification'].includes(
        pathname,
      ) &&
      method === 'POST'
    )
      return json({ message: 'If the request is eligible, instructions will be sent.' }, 202);
    if (pathname === '/api/auth/verify-email' && method === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({
        email: account.email,
      });
      expect((route.request().postDataJSON() as { token: string }).token).toMatch(/^\d{6}$/);
      return json({ message: 'Email verified. Sign in to continue.' });
    }
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({
        email: account.email,
      });
      expect((route.request().postDataJSON() as { token: string }).token).toMatch(/^\d{6}$/);
      authenticated = false;
      return json({ message: 'Password changed. Sign in again.' });
    }
    if (pathname === '/api/invitations/accept' && method === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({ token: 'ABCDEFGH' });
      return json({ workspace: company });
    }
    if (pathname === '/api/auth/sessions')
      return json({
        sessions: [
          {
            id: officeId,
            current: true,
            createdAt: new Date().toISOString(),
            absoluteExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
            idleExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        ],
      });
    if (pathname === '/api/workspaces') return json({ workspaces: [company] });
    if (pathname === `/api/workspaces/${workspaceId}`)
      return json({ workspace: { ...company, officeId } });
    if (pathname === `/api/workspaces/${workspaceId}/members`) return json({ members: [] });
    if (pathname.endsWith('/messages')) return json({ messages: [] });
    return json(
      { error: { code: 'not_found', message: 'not found', requestId: workspaceId } },
      404,
    );
  });
}
async function login(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('a long routing password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
test('auth destinations have distinct URLs, support history and preserve token links', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/register$/);
  for (const [path, heading] of [
    ['/resend-verification', 'Resend verification'],
    ['/forgot-password', 'Reset your password'],
    ['/verify-email', 'Verify your email'],
    ['/reset-password', 'Choose a new password'],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
  }
  const code = '012345';
  await page.goto(`/auth/reset-password?token=${code}`);
  await expect(page).toHaveURL(`/reset-password?token=${code}`);
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue(code);
  await page.reload();
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue(code);
  await page.goto('/verify-email?code=' + code);
  await expect(page.getByLabel('Verification code', { exact: true })).toHaveValue(code);

  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('Routing Person');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('a sufficiently long routing password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(`/verify-email?email=${encodeURIComponent(account.email)}`);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(account.email);
  await page.getByLabel('Verification code', { exact: true }).fill('000123');
  await page
    .getByLabel('Registration password', { exact: true })
    .fill('a sufficiently long routing password');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page).toHaveURL(`/login?email=${encodeURIComponent(account.email)}`);

  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page).toHaveURL(`/reset-password?email=${encodeURIComponent(account.email)}`);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(account.email);
  await page.getByLabel('Reset code', { exact: true }).fill('000123');
  await page.getByLabel('New password', { exact: true }).fill('a new sufficiently long password');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page).toHaveURL(`/login?email=${encodeURIComponent(account.email)}`);
});
test('protected links return to the intended company, survive refresh, and support Back/Forward', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(entryPath);
  await expect(page).toHaveURL(new RegExp('/login\\?returnTo='));
  await login(page);
  await expect(page).toHaveURL(entryPath);
  await expect(page.getByRole('heading', { name: 'Welcome to Routing Company' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(entryPath);
  await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue(
    account.displayName,
  );
  await page.getByRole('link', { name: 'Back to companies', exact: true }).click();
  await expect(page).toHaveURL('/companies');
  await page.getByRole('link', { name: 'Company details' }).click();
  await expect(page).toHaveURL(`/companies/${workspaceId}`);
  await expect(page.getByRole('heading', { name: 'Routing Company', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Account security' }).click();
  await expect(page).toHaveURL('/account/security');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Account security', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`/companies/${workspaceId}`);
  await page.goForward();
  await expect(page).toHaveURL('/account/security');
  await page.goto(`/companies/${workspaceId}/offices/11111111-1111-4111-8111-111111111111/entry`);
  await expect(
    page.getByRole('heading', { name: 'Office not found or access denied' }),
  ).toBeVisible();
  await expect(page.getByText('Welcome to Routing Company')).toHaveCount(0);
  await page.goto('/companies/11111111-1111-4111-8111-111111111111');
  await expect(page.getByRole('alert')).toContainText('Company not found or access denied.');
});

test('company invitation entry normalizes a lowercase spaced code', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/companies');
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
  await page.getByRole('button', { name: 'Join with invitation' }).first().click();
  await page.getByLabel('Invitation code', { exact: true }).fill('abcd efgh');
  await page.getByRole('button', { name: 'Join company', exact: true }).click();
  await expect(page).toHaveURL('/companies');
  await expect(page.getByRole('status')).toContainText('You joined Routing Company.');
});
test('invitation tokens survive login and unknown routes have a useful destination', async ({
  page,
}) => {
  await mockApi(page);
  const code = 'ABCDEFGH';
  await page.goto('/invitations/accept?token=' + code);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await login(page);
  await expect(page).toHaveURL('/invitations/accept?token=' + code);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('input[name="token"]')).toHaveValue(code);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/companies');
  await page.goto('/not-a-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return home' }).click();
  await expect(page).toHaveURL('/companies');
  await page.goto('/companies/invalid-id');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('Back during an auth request does not let a stale response change the destination', async ({
  page,
}) => {
  await mockApi(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const requestArrived = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/auth/forgot-password', async (route) => {
    arrived();
    await pending;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'If an account exists, instructions will be sent.' }),
    });
  });
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL('/forgot-password');
  await expect(
    page.getByRole('heading', { name: 'Reset your password', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Email').fill(account.email);
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await requestArrived;
  await page.goBack();
  await expect(page).toHaveURL('/login');
  const response = page.waitForResponse('**/api/auth/forgot-password');
  release();
  await response;
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page).toHaveURL('/login');
});

test('office invitation URLs reject members and mismatched company responses stay hidden', async ({
  page,
}) => {
  await mockApi(page, true);
  await page.route(`**/api/workspaces/${workspaceId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ workspace: { ...company, role: 'member', officeId } }),
    }),
  );
  await page.goto(`/companies/${workspaceId}/offices/${officeId}/invitations`);
  await expect(
    page.getByRole('heading', { name: 'Office not found or access denied' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toHaveCount(0);
  await page.route(`**/api/workspaces/${workspaceId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: {
          ...company,
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Other Company Secret',
          officeId,
        },
      }),
    }),
  );
  await page.goto(`/companies/${workspaceId}`);
  await expect(page.getByRole('heading', { name: 'Could not open company' })).toBeVisible();
  await expect(page.getByText('Other Company Secret')).toHaveCount(0);
});

for (const signedIn of [true, false]) {
  test(`password reset returns to sign in when previously ${signedIn ? 'signed in' : 'signed out'}`, async ({
    page,
  }) => {
    await mockApi(page, signedIn);
    const code = '012345';
    await page.goto(
      '/reset-password?token=' +
        code +
        '&email=' +
        encodeURIComponent(account.email) +
        '&returnTo=%2Faccount%2Fsecurity',
    );
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await page.getByLabel('New password', { exact: true }).fill('a newly changed routing password');
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page).toHaveURL(
      `/login?returnTo=%2Faccount%2Fsecurity&email=${encodeURIComponent(account.email)}`,
    );
    await expect(page.getByRole('status')).toContainText('Your password has been reset.');
    await expect(page.getByText('Routing Company', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Account security', exact: true })).toHaveCount(
      0,
    );
  });
}

for (const dismissal of ['Close dialog', 'Cancel', 'Escape', 'backdrop']) {
  test(`invitation dismissal via ${dismissal} leaves the invitation URL and stays closed on refresh`, async ({
    page,
  }) => {
    await mockApi(page, true);
    await page.goto('/invitations/accept?token=ABCDEFGH');
    await expect(page.getByRole('dialog')).toBeVisible();
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'backdrop')
      await page.locator('.dashboard-backdrop').click({ position: { x: 4, y: 4 } });
    else await page.getByRole('button', { name: dismissal, exact: true }).click();
    await expect(page).toHaveURL('/companies');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your companies', exact: true })).toBeVisible();
    await expect(page).toHaveURL('/companies');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
