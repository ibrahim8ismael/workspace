import {
  acceptInvitationSchema,
  accountResponseSchema,
  apiErrorResponseSchema,
  authenticatedResponseSchema,
  createWorkspaceSchema,
  csrfResponseSchema,
  emailRequestSchema,
  emptyBodySchema,
  loginSchema,
  messageResponseSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  workspaceResponseSchema,
  workspacesResponseSchema,
} from '@gather/contracts';
import type { AccountDto, WorkspaceDto } from '@gather/contracts';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
    readonly outcomeUnknown = false,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

type Fetcher = typeof fetch;

export class ApiClient {
  private csrfToken: string | null = null;
  private generation = 0;
  private csrfFlight: { generation: number; promise: Promise<string> } | null = null;
  private readonly fetcher: Fetcher;

  constructor(fetcher: Fetcher = globalThis.fetch) {
    this.fetcher = fetcher.bind(globalThis);
  }

  clearSessionMemory() {
    this.clearCsrf();
  }

  private clearCsrf() {
    this.csrfToken = null;
    this.generation += 1;
    this.csrfFlight = null;
  }

  private async body<T>(
    response: Response,
    schema: z.ZodType<T>,
    mutation = false,
    expectedGeneration?: number,
  ): Promise<T> {
    const value: unknown = await response.json().catch(() => undefined);
    if (expectedGeneration !== undefined && expectedGeneration !== this.generation)
      throw new ApiError('stale_response', response.status, mutation);
    if (!response.ok) {
      if (response.status === 401) this.clearSessionMemory();
      const parsed = apiErrorResponseSchema.safeParse(value);
      if (parsed.success && parsed.data.error.code === 'csrf_rejected') this.clearCsrf();
      throw new ApiError(
        parsed.success ? parsed.data.error.code : 'request_failed',
        response.status,
        mutation && response.status >= 500,
      );
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ApiError('invalid_response', response.status, mutation);
    return parsed.data;
  }

  private async csrf() {
    if (this.csrfToken) return this.csrfToken;
    const generation = this.generation;
    if (this.csrfFlight?.generation === generation) return this.csrfFlight.promise;
    const promise = (async () => {
      let response: Response;
      try {
        response = await this.fetcher('/api/auth/csrf', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
      } catch {
        throw new ApiError('network_unavailable', null);
      }
      const result = await this.body(response, csrfResponseSchema, false, generation);
      if (generation !== this.generation) throw new ApiError('stale_response', null);
      this.csrfToken = result.csrfToken;
      return result.csrfToken;
    })();
    this.csrfFlight = { generation, promise };
    try {
      return await promise;
    } finally {
      if (this.csrfFlight?.promise === promise) this.csrfFlight = null;
    }
  }

  private async get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const generation = this.generation;
    let response: Response;
    try {
      response = await this.fetcher(`/api${path}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
    } catch {
      if (signal?.aborted) throw new ApiError('request_cancelled', null);
      throw new ApiError('network_unavailable', null);
    }
    return this.body(response, schema, false, generation);
  }

  private async mutate<T>(
    path: string,
    input: unknown,
    requestSchema: z.ZodType,
    responseSchema: z.ZodType<T>,
    idempotencyKey?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const parsedInput = requestSchema.safeParse(input);
    if (!parsedInput.success) throw new ApiError('validation_failed', 400);
    const generation = this.generation;
    const csrfToken = await this.csrf();
    if (generation !== this.generation) throw new ApiError('stale_response', null);
    if (signal?.aborted) throw new ApiError('request_cancelled', null);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let response: Response;
    try {
      response = await this.fetcher(`/api${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        body: JSON.stringify(parsedInput.data),
        signal,
      });
    } catch {
      throw new ApiError(signal?.aborted ? 'request_cancelled' : 'network_unavailable', null, true);
    }
    const result = await this.body(response, responseSchema, true, generation);
    if (generation !== this.generation) throw new ApiError('stale_response', null, true);
    return result;
  }

  async me(signal?: AbortSignal): Promise<AccountDto> {
    return (await this.get('/auth/me', accountResponseSchema, signal)).account;
  }

  async workspaces(signal?: AbortSignal): Promise<WorkspaceDto[]> {
    return (await this.get('/workspaces', workspacesResponseSchema, signal)).workspaces;
  }

  async login(input: unknown, signal?: AbortSignal): Promise<AccountDto> {
    const generation = this.generation;
    const response = await this.mutate(
      '/auth/login',
      input,
      loginSchema,
      authenticatedResponseSchema,
      undefined,
      signal,
    );
    if (generation !== this.generation) throw new ApiError('stale_response', null, true);
    this.generation += 1;
    this.csrfFlight = null;
    this.csrfToken = response.csrfToken;
    return response.account;
  }

  register(input: unknown, signal?: AbortSignal) {
    return this.mutate(
      '/auth/register',
      input,
      registerSchema,
      messageResponseSchema,
      undefined,
      signal,
    );
  }

  verify(input: unknown, signal?: AbortSignal) {
    return this.mutate(
      '/auth/verify-email',
      input,
      verifyEmailSchema,
      messageResponseSchema,
      undefined,
      signal,
    );
  }

  resendVerification(input: unknown, signal?: AbortSignal) {
    return this.mutate(
      '/auth/resend-verification',
      input,
      emailRequestSchema,
      messageResponseSchema,
      undefined,
      signal,
    );
  }

  forgotPassword(input: unknown, signal?: AbortSignal) {
    return this.mutate(
      '/auth/forgot-password',
      input,
      emailRequestSchema,
      messageResponseSchema,
      undefined,
      signal,
    );
  }

  resetPassword(input: unknown, signal?: AbortSignal) {
    return this.mutate(
      '/auth/reset-password',
      input,
      resetPasswordSchema,
      messageResponseSchema,
      undefined,
      signal,
    );
  }

  createWorkspace(input: unknown, idempotencyKey: string, signal?: AbortSignal) {
    return this.mutate(
      '/workspaces',
      input,
      createWorkspaceSchema,
      workspaceResponseSchema,
      idempotencyKey,
      signal,
    );
  }

  acceptInvitation(input: unknown, idempotencyKey: string, signal?: AbortSignal) {
    return this.mutate(
      '/invitations/accept',
      input,
      acceptInvitationSchema,
      workspaceResponseSchema,
      idempotencyKey,
      signal,
    );
  }

  async logout(signal?: AbortSignal) {
    await this.mutate(
      '/auth/logout',
      {},
      emptyBodySchema,
      messageResponseSchema,
      undefined,
      signal,
    );
    this.clearSessionMemory();
  }
}
