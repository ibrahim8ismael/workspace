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
const session = {
  id: 'df92b3ad-d3e9-430d-82f5-6e91cbe9dfe2',
  current: true,
  createdAt: '2026-11-09T00:00:00.000Z',
  absoluteExpiresAt: '2026-11-09T12:00:00.000Z',
  idleExpiresAt: '2026-11-09T01:00:00.000Z',
};
const invitationId = '16ab92cd-cbd4-44b6-b827-196ae6044937';
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

  it('lists, creates and revokes workspace invitations through strict scoped contracts', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const invitation = {
      id: invitationId,
      email: 'employee@example.com',
      expiresAt: '2026-11-16T12:00:00.000Z',
    };
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      if (input === '/api/auth/csrf') return csrf();
      if (input === `/api/workspaces/${company.workspace.id}/invitations` && init?.method === 'GET')
        return json({ invitations: [{ ...invitation, status: 'pending' }] });
      if (
        input === `/api/workspaces/${company.workspace.id}/invitations` &&
        init?.method === 'POST'
      )
        return json({ invitation }, 201);
      if (
        input === `/api/workspaces/${company.workspace.id}/invitations/${invitationId}` &&
        init?.method === 'DELETE'
      )
        return json({ message: 'Invitation revoked.' });
      return json({ error: {} }, 404);
    };
    const client = new ApiClient(fetcher);

    expect(await client.workspaceInvitations(company.workspace.id)).toEqual([
      { ...invitation, status: 'pending' },
    ]);
    expect(
      await client.createWorkspaceInvitation(
        company.workspace.id,
        { email: invitation.email },
        'invite-command-key-01',
      ),
    ).toEqual({ invitation });
    expect(
      await client.revokeWorkspaceInvitation(
        company.workspace.id,
        invitationId,
        'revoke-command-key-01',
      ),
    ).toEqual({ message: 'Invitation revoked.' });

    expect(calls.map((call) => call.input)).toEqual([
      `/api/workspaces/${company.workspace.id}/invitations`,
      '/api/auth/csrf',
      `/api/workspaces/${company.workspace.id}/invitations`,
      `/api/workspaces/${company.workspace.id}/invitations/${invitationId}`,
    ]);
    expect(calls[2]?.init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ email: invitation.email }),
      headers: { 'Idempotency-Key': 'invite-command-key-01' },
    });
    expect(calls[3]?.init).toMatchObject({
      method: 'DELETE',
      body: '{}',
      headers: { 'Idempotency-Key': 'revoke-command-key-01' },
    });

    const unsafeClient = new ApiClient(async () =>
      json({ invitations: [{ ...invitation, status: 'pending', token: 'secret' }] }),
    );
    await expect(unsafeClient.workspaceInvitations(company.workspace.id)).rejects.toMatchObject({
      code: 'invalid_response',
    });
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

  it('reads only strict session metadata and sends a signal-aware JSON DELETE for a session', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      if (input === '/api/auth/csrf') return csrf();
      if (input === '/api/auth/sessions') return json({ sessions: [session] });
      return message();
    };
    const client = new ApiClient(fetcher);
    expect(await client.sessions()).toEqual([session]);
    const controller = new AbortController();
    await client.revokeSession(session, controller.signal);

    expect(calls[2]?.input).toBe(`/api/auth/sessions/${session.id}`);
    expect(calls[2]?.init).toMatchObject({
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
      body: '{}',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfA },
    });
  });

  it('rejects unsafe session metadata and workspace IDs before sending requests', async () => {
    let requests = 0;
    const client = new ApiClient(async () => {
      requests += 1;
      return json({ sessions: [{ ...session, tokenDigest: 'secret' }] });
    });
    await expect(client.sessions()).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(client.workspaceDetail('not-a-uuid')).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(client.revokeSession({ ...session, id: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(requests).toBe(1);

    const validClient = new ApiClient(async () =>
      json({ workspace: { ...company.workspace, officeId: session.id } }),
    );
    await expect(validClient.workspaceDetail(company.workspace.id)).resolves.toMatchObject({
      ...company.workspace,
      officeId: session.id,
    });

    const invalidWorkspaceClient = new ApiClient(async () =>
      json({ workspace: { ...company.workspace, officeId: session.id, internalPolicy: 'secret' } }),
    );
    await expect(
      invalidWorkspaceClient.workspaceDetail(company.workspace.id),
    ).rejects.toMatchObject({
      code: 'invalid_response',
    });

    const mismatchedIdClient = new ApiClient(async () =>
      json({
        workspace: {
          ...company.workspace,
          id: '0572e96c-f236-4bb1-8d8c-08b8bfda8937',
          officeId: session.id,
        },
      }),
    );
    await expect(mismatchedIdClient.workspaceDetail(company.workspace.id)).rejects.toMatchObject({
      code: 'invalid_response',
      status: 200,
    });
  });

  it('clears CSRF after current-session revocation, but keeps it after another session is revoked', async () => {
    for (const current of [true, false]) {
      let csrfCalls = 0;
      const calls: RequestInfo[] = [];
      const fetcher: typeof fetch = async (input) => {
        calls.push(input as RequestInfo);
        if (input === '/api/auth/csrf') {
          csrfCalls += 1;
          return csrf();
        }
        if (input === '/api/auth/sessions') return json({ sessions: [{ ...session, current }] });
        return message();
      };
      const client = new ApiClient(fetcher);
      const [listed] = await client.sessions();
      await client.revokeSession(listed!);
      await client.register({
        email: account.email,
        displayName: account.displayName,
        password: 'a sufficiently long password',
      });
      expect(csrfCalls).toBe(current ? 2 : 1);
    }
  });

  it('does not automatically retry a failed session revocation', async () => {
    let deleteCalls = 0;
    const client = new ApiClient(async (input) => {
      if (input === '/api/auth/csrf') return csrf();
      deleteCalls += 1;
      return json(
        { error: { code: 'unavailable', message: 'unavailable', requestId: account.id } },
        503,
      );
    });
    await expect(client.revokeSession({ ...session, current: false })).rejects.toMatchObject({
      status: 503,
      outcomeUnknown: true,
    });
    expect(deleteCalls).toBe(1);
  });

  it('clears local session state only after validated logout-all and password-change success', async () => {
    for (const action of ['logout-all', 'change-password'] as const) {
      let csrfCalls = 0;
      const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        calls.push({ input, init });
        if (input === '/api/auth/csrf') {
          csrfCalls += 1;
          return csrf();
        }
        return message();
      };
      const client = new ApiClient(fetcher);
      if (action === 'logout-all') await client.logoutAll();
      else
        await client.changePassword({
          currentPassword: 'a sufficiently long current password',
          newPassword: 'a sufficiently long replacement password',
        });
      await client.register({
        email: account.email,
        displayName: account.displayName,
        password: 'a sufficiently long password',
      });
      expect(csrfCalls).toBe(2);
      const expectedPath =
        action === 'logout-all' ? '/api/auth/logout-all' : '/api/auth/change-password';
      expect(calls.find(({ input }) => input === expectedPath)?.init).toMatchObject({
        method: 'POST',
        body:
          action === 'logout-all'
            ? '{}'
            : JSON.stringify({
                currentPassword: 'a sufficiently long current password',
                newPassword: 'a sufficiently long replacement password',
              }),
      });
    }
  });

  it('rotates CSRF after reauthentication and fences delayed old responses', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    let finishReauth!: (response: Response) => void;
    let reauthStarted!: () => void;
    const reauthStart = new Promise<void>((resolve) => {
      reauthStarted = resolve;
    });
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      if (input === '/api/auth/csrf') return csrf();
      if (input === '/api/auth/reauthenticate') {
        reauthStarted();
        return new Promise<Response>((resolve) => {
          finishReauth = resolve;
        });
      }
      return message();
    };
    const client = new ApiClient(fetcher);
    const pendingReauth = client.reauthenticate({ password: 'a sufficiently long password' });
    await reauthStart;
    client.clearSessionMemory();
    finishReauth(json(signedIn));
    await expect(pendingReauth).rejects.toMatchObject({ code: 'stale_response' });
    await client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });
    expect(calls.filter(({ input }) => input === '/api/auth/csrf')).toHaveLength(2);
    expect(calls.find(({ input }) => input === '/api/auth/reauthenticate')?.init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ password: 'a sufficiently long password' }),
    });
  });

  it('uses the rotated reauthentication token and validates explicit session extension', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      if (input === '/api/auth/csrf') return csrf();
      if (input === '/api/auth/reauthenticate') return json(signedIn);
      if (input === '/api/auth/session/extend')
        return json({ idleExpiresAt: '2026-11-09T02:00:00.000Z' });
      return message();
    };
    const client = new ApiClient(fetcher);
    await client.reauthenticate({ password: 'a sufficiently long password' });
    expect(await client.extendSession()).toBe('2026-11-09T02:00:00.000Z');
    expect(calls.at(-1)?.init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body: '{}',
      headers: { 'X-CSRF-Token': csrfB },
    });

    const invalid = new ApiClient(async (input) =>
      input === '/api/auth/csrf' ? csrf() : json({ idleExpiresAt: 'not-a-date', extra: true }),
    );
    await expect(invalid.extendSession()).rejects.toMatchObject({
      code: 'invalid_response',
      outcomeUnknown: true,
    });
  });

  it('does not let a delayed old logout clear a newer login CSRF binding', async () => {
    let finishLogout!: (value: unknown) => void;
    let logoutStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      logoutStarted = resolve;
    });
    const fetcher: typeof fetch = async (input) => {
      if (input === '/api/auth/csrf') return csrf();
      if (input === '/api/auth/logout-all') {
        logoutStarted();
        return {
          ok: true,
          status: 200,
          json: () => new Promise((resolve) => (finishLogout = resolve)),
        } as Response;
      }
      if (input === '/api/auth/login') return json(signedIn);
      return message();
    };
    const client = new ApiClient(fetcher);
    const oldLogout = client.logoutAll();
    await started;
    await client.login({ email: account.email, password: 'a sufficiently long password' });
    finishLogout({ message: 'Signed out.' });
    await expect(oldLogout).rejects.toMatchObject({ code: 'stale_response' });
    await client.register({
      email: account.email,
      displayName: account.displayName,
      password: 'a sufficiently long password',
    });
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
