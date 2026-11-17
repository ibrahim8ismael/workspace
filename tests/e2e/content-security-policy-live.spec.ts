import { expect, request, test } from '@playwright/test';

const enabled = process.env['LIVE_OFFICE_E2E'] === '1';
const appOrigin = new URL(process.env['LIVE_OFFICE_ORIGIN'] ?? 'https://localhost:8443').origin;

function directives(policy: string) {
  const result = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) result.set(name, sources);
  }
  return result;
}

test('serves restrictive CSP and framing headers on root and nested app documents', async () => {
  test.skip(!enabled, 'Requires the local Caddy application.');

  const client = await request.newContext({ baseURL: appOrigin, ignoreHTTPSErrors: true });
  try {
    for (const path of ['/', '/account/security']) {
      const response = await client.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');
      expect(response.headers()['x-frame-options']).toBe('DENY');

      const policy = response.headers()['content-security-policy'];
      expect(policy).toBeTruthy();
      const csp = directives(policy ?? '');
      expect(csp.get('default-src')).toEqual(["'self'"]);
      expect(csp.get('script-src')).toEqual(["'self'"]);
      expect(csp.get('object-src')).toEqual(["'none'"]);
      expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
      expect(csp.get('style-src-elem')).toEqual(["'self'"]);
      expect(csp.get('style-src-attr')).toEqual(["'unsafe-inline'"]);
      expect(csp.get('connect-src')).toContain(`wss://${new URL(appOrigin).host}`);
      expect(csp.get('media-src')).toEqual(["'self'", 'blob:']);
      expect(csp.get('frame-src')).toEqual(['https:']);
    }
  } finally {
    await client.dispose();
  }
});

test('boots the app and loads its same-origin assets without CSP violations', async ({
  browser,
}) => {
  test.skip(!enabled, 'Requires the local Caddy application.');

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const policyViolations: string[] = [];
  const assetFailures: string[] = [];
  let loadedScripts = 0;

  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) {
      policyViolations.push(message.text());
    }
  });
  page.on('requestfailed', (failedRequest) => {
    if (
      new URL(failedRequest.url()).origin === appOrigin &&
      /\/assets\//.test(failedRequest.url())
    ) {
      assetFailures.push(failedRequest.url());
    }
  });
  page.on('response', (response) => {
    if (
      new URL(response.url()).origin === appOrigin &&
      /\/assets\/.*\.js(?:$|\?)/.test(response.url()) &&
      response.ok()
    ) {
      loadedScripts += 1;
    }
  });

  try {
    const response = await page.goto(appOrigin, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await expect
      .poll(() => page.locator('#root').evaluate((root) => root.childElementCount))
      .toBeGreaterThan(0);
    expect(loadedScripts).toBeGreaterThan(0);
    expect(assetFailures).toEqual([]);
    expect(policyViolations).toEqual([]);
  } finally {
    await context.close();
  }
});
