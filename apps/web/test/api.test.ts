import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/lib/api';
import { SubmissionKey } from '../src/lib/idempotency';
import { clearLegacyAuthStorage } from '../src/lib/legacy-storage';

const csrfA = 'A'.repeat(43);
const csrfB = 'B'.repeat(43);
const ticket = 'C'.repeat(43);
const account = {
  id: '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea',
  email: 'person@example.com',
  displayName: 'Example Person',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const signedIn = { account, csrfToken: csrfB };
const company = {
  workspace: {
    id: '7b839c68-a211-48f2-a38f-d15e7558a4ea',
    name: 'Example Company',
    slug: 'example-company',
    role: 'owner',
    memberCount: 1,
  },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const csrf = () => json({ csrfToken: csrfA });
const message = () => json({ message: 'If the request is eligible, instructions will be sent.' });

afterEach(() => vi.restoreAllMocks());

describe('same-origin API client', () => {
  it('invokes receiver-sensitive fetch implementations with the global fetch receiver', async () => {
    const receiverFetch = function (this: unknown, input: RequestInfo | URL) {
      expect(this).toBe(globalThis);
      return Promise.resolve(
        input === '/api/auth/me' ? json({ account }) : json({ error: {} }, 500),
      );
    } as typeof fetch;
    const client = new ApiClient(receiverFetch);
    expect(await client.me()).toEqual(account);
  });

  it('bootstraps CSRF, uses browser cookies and rotates the in-memory token on login', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      if (input === '/api/auth/csrf') return csrf();
      if (input === '/api/auth/login') return json(signedIn);
      return message();
    };
    const client = new ApiClient(fetcher);
    expect(
      await client.login({ email: account.email, password: 'a sufficiently long password' }),
    ).toEqual(account);
    await client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });

    expect(calls.map(({ input }) => input)).toEqual([
      '/api/auth/csrf',
      '/api/auth/login',
      '/api/auth/register',
    ]);
    expect(calls[0]!.init).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    expect(calls[0]!.init?.headers).not.toHaveProperty('Origin');
    expect(calls[0]!.init?.headers).not.toHaveProperty('Sec-Fetch-Site');
    expect(calls[1]!.init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfA },
    });
    expect(calls[2]!.init?.headers).toMatchObject({ 'X-CSRF-Token': csrfB });
    expect(calls[1]!.init?.body).toBe(
      JSON.stringify({ email: account.email, password: 'a sufficiently long password' }),
    );
  });

  it('deduplicates concurrent CSRF bootstrap and does not let a stale response replace a new session', async () => {
    let finishCsrf!: (response: Response) => void;
    let finishMe!: (response: Response) => void;
    const meResponse = new Promise<Response>((resolve) => {
      finishMe = resolve;
    });
    let csrfCalls = 0;
    let registerCalls = 0;
    const fetcher: typeof fetch = async (input) => {
      if (input === '/api/auth/me') return meResponse;
      if (input === '/api/auth/csrf') {
        csrfCalls += 1;
        return new Promise<Response>((resolve) => {
          finishCsrf = resolve;
        });
      }
      if (input === '/api/auth/login') return json(signedIn);
      if (input === '/api/auth/register') {
        registerCalls += 1;
        return message();
      }
      return json(
        { error: { code: 'unauthorized', message: 'unauthorized', requestId: account.id } },
        401,
      );
    };
    const client = new ApiClient(fetcher);
    const staleMe = client.me();
    client.clearSessionMemory();
    const first = client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });
    const second = client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });
    expect(csrfCalls).toBe(1);
    finishCsrf(csrf());
    await Promise.all([first, second]);
    expect(registerCalls).toBe(2);

    await client.login({ email: account.email, password: 'a sufficiently long password' });
    finishMe(
      json(
        { error: { code: 'unauthorized', message: 'unauthorized', requestId: account.id } },
        401,
      ),
    );
    await expect(staleMe).rejects.toMatchObject({ code: 'stale_response' });
    await client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });
  });

  it('keeps a durable idempotency key across explicit uncertain retries and changes it with the payload', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    let posts = 0;
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      if (input === '/api/auth/csrf') return csrf();
      if (++posts === 1) return json({}, 502);
      return json(company, 201);
    };
    const client = new ApiClient(fetcher);
    const keys = new SubmissionKey();
    const submission = { name: 'Example Company', slug: 'example-company' };
    const firstKey = keys.forPayload(submission);
    await expect(client.createWorkspace(submission, firstKey)).rejects.toMatchObject({
      code: 'request_failed',
      status: 502,
      outcomeUnknown: true,
    });
    const retryKey = keys.forPayload(submission);
    expect(retryKey).toBe(firstKey);
    expect(await client.createWorkspace(submission, retryKey)).toEqual(company);
    expect(
      calls
        .filter((call) => call.input === '/api/workspaces')
        .map((call) => (call.init?.headers as Record<string, string>)['Idempotency-Key']),
    ).toEqual([firstKey, firstKey]);
    expect(keys.forPayload({ ...submission, name: 'Changed Company' })).not.toBe(firstKey);
    keys.clear();
    expect(keys.forPayload(submission)).not.toBe(firstKey);
  });

  it('does not retry a mutation after transport failure and marks malformed success as uncertain', async () => {
    let posts = 0;
    const fetcher: typeof fetch = async (input) => {
      if (input === '/api/auth/csrf') return csrf();
      posts += 1;
      if (posts === 1) throw new TypeError('network unavailable');
      return json({ workspace: { ...company.workspace, extra: 'unexpected' } }, 201);
    };
    const client = new ApiClient(fetcher);
    const input = { name: 'Example Company', slug: 'example-company' };
    await expect(client.createWorkspace(input, crypto.randomUUID())).rejects.toMatchObject({
      code: 'network_unavailable',
      outcomeUnknown: true,
    });
    expect(posts).toBe(1);
    await expect(client.createWorkspace(input, crypto.randomUUID())).rejects.toMatchObject({
      code: 'invalid_response',
      outcomeUnknown: true,
    });
    expect(posts).toBe(2);
  });

  it('does not submit after a shared CSRF request becomes stale and rejects strict malformed reads', async () => {
    let finishCsrf!: (response: Response) => void;
    let posts = 0;
    const fetcher: typeof fetch = async (input) => {
      if (input === '/api/auth/csrf')
        return new Promise<Response>((resolve) => {
          finishCsrf = resolve;
        });
      posts += 1;
      return json({ account: { ...account, token: ticket } });
    };
    const client = new ApiClient(fetcher);
    const pending = client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });
    client.clearSessionMemory();
    finishCsrf(csrf());
    await expect(pending).rejects.toMatchObject({ code: 'stale_response' });
    expect(posts).toBe(0);
    await expect(client.me()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('clears a rejected CSRF token for an explicit next attempt without retrying the mutation', async () => {
    let csrfCalls = 0;
    let postCalls = 0;
    const fetcher: typeof fetch = async (input) => {
      if (input === '/api/auth/csrf') {
        csrfCalls += 1;
        return json({ csrfToken: csrfCalls === 1 ? csrfA : csrfB });
      }
      postCalls += 1;
      if (postCalls === 1)
        return json(
          { error: { code: 'csrf_rejected', message: 'csrf_rejected', requestId: account.id } },
          403,
        );
      return message();
    };
    const client = new ApiClient(fetcher);
    const input = {
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    };
    await expect(client.register(input)).rejects.toMatchObject({ code: 'csrf_rejected' });
    expect(postCalls).toBe(1);
    await client.register(input);
    expect(csrfCalls).toBe(2);
    expect(postCalls).toBe(2);
  });
});

describe('legacy credential cleanup', () => {
  it('removes only known legacy auth, browser identity and admin keys', () => {
    const values = new Map([
      ['office-session', 'old-session'],
      ['office-user-ids', 'old-identities'],
      ['office-key-team', 'invite-key'],
      ['office-admin-team', 'admin-key'],
      ['office-theme', 'dark'],
      ['office-workspaces', '[{nonSensitive:true}]'],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
    } as Storage;
    clearLegacyAuthStorage(storage);
    expect([...values.keys()].sort()).toEqual(['office-theme', 'office-workspaces']);
  });
});
