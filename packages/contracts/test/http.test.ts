import { describe, expect, it } from 'vitest';
import {
  accountResponseSchema,
  authenticatedResponseSchema,
  apiErrorResponseSchema,
  membersResponseSchema,
  sessionsResponseSchema,
  workspaceResponseSchema,
  invitationsResponseSchema,
} from '../dist/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const date = '2026-11-08T12:00:00.000Z';
const account = { id, email: 'person@example.com', displayName: 'Person', verifiedAt: date };

describe('existing HTTP public projections', () => {
  it('accepts safe account/auth responses while rejecting credentials at either nesting level', () => {
    expect(accountResponseSchema.safeParse({ account }).success).toBe(true);
    expect(
      authenticatedResponseSchema.safeParse({ account, csrfToken: 'a'.repeat(43) }).success,
    ).toBe(true);
    for (const field of ['passwordHash', 'authVersion', 'tokenDigest', 'csrfSecret', '_id']) {
      expect(
        accountResponseSchema.safeParse({ account: { ...account, [field]: 'secret' } }).success,
      ).toBe(false);
      expect(accountResponseSchema.safeParse({ account, [field]: 'secret' }).success).toBe(false);
    }
    expect(
      accountResponseSchema.safeParse({ account: { ...account, verifiedAt: '' } }).success,
    ).toBe(false);
  });

  it('rejects internal session state and non-UUID identities', () => {
    const session = {
      id,
      current: true,
      createdAt: date,
      absoluteExpiresAt: date,
      idleExpiresAt: date,
    };
    expect(sessionsResponseSchema.safeParse({ sessions: [session] }).success).toBe(true);
    expect(
      sessionsResponseSchema.safeParse({ sessions: [{ ...session, tokenDigest: 'secret' }] })
        .success,
    ).toBe(false);
    expect(
      sessionsResponseSchema.safeParse({ sessions: [{ ...session, id: 'client-chosen-name' }] })
        .success,
    ).toBe(false);
  });

  it('keeps tenant roles and safe membership projections distinct from account state', () => {
    const workspace = { id, name: 'Company', slug: 'company', role: 'owner', memberCount: 1 };
    expect(workspaceResponseSchema.safeParse({ workspace }).success).toBe(true);
    expect(
      workspaceResponseSchema.safeParse({ workspace: { ...workspace, role: 'admin' } }).success,
    ).toBe(false);
    expect(
      workspaceResponseSchema.safeParse({ workspace: { ...workspace, memberCount: 1.5 } }).success,
    ).toBe(false);
    const member = { userId: id, displayName: 'Person', role: 'member', joinedAt: date };
    expect(membersResponseSchema.safeParse({ members: [member] }).success).toBe(true);
    expect(
      membersResponseSchema.safeParse({ members: [{ ...member, email: account.email }] }).success,
    ).toBe(false);
  });

  it('rejects invitation secrets in metadata and impossible statuses', () => {
    const invitation = { id, email: account.email, expiresAt: date, status: 'pending' };
    expect(invitationsResponseSchema.safeParse({ invitations: [invitation] }).success).toBe(true);
    expect(
      invitationsResponseSchema.safeParse({ invitations: [{ ...invitation, token: 'secret' }] })
        .success,
    ).toBe(false);
    expect(
      invitationsResponseSchema.safeParse({ invitations: [{ ...invitation, status: 'active' }] })
        .success,
    ).toBe(false);
  });

  it('accepts only safe error codes without raw exception messages or trace fields', () => {
    const error = { code: 'unauthorized', message: 'unauthorized', requestId: id };
    expect(apiErrorResponseSchema.safeParse({ error }).success).toBe(true);
    expect(
      apiErrorResponseSchema.safeParse({
        error: { code: 'unsupported_media_type', message: 'unsupported_media_type', requestId: id },
      }).success,
    ).toBe(true);
    for (const body of [
      { error: { ...error, message: 'MongoDB credentials in internal error' } },
      { error: { ...error, message: 'not_found' } },
      { error: { ...error, stack: 'private trace' } },
      { error, cookies: 'private cookie' },
    ])
      expect(apiErrorResponseSchema.safeParse(body).success).toBe(false);
  });
});
